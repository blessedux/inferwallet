import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  CompletionBackend,
  TierId,
} from "./types.js";

export type { CompletionBackend } from "./types.js";

export type StreamBackend = {
  /**
   * Returns an OpenAI-compatible SSE Response body stream, or a JSON completion
   * Response when stream is false.
   */
  respond(
    req: ChatCompletionRequest,
    ctx: { requestId: string; model: string; stream: boolean },
  ): Promise<Response>;
};

/**
 * Stub completion backend — used when OPENROUTER_API_KEY is unset.
 */
export function createStubBackend(
  label = "stub-inferwallet",
): CompletionBackend & StreamBackend {
  return {
    async complete(req, ctx): Promise<ChatCompletionResponse> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
      const preview = (lastUser?.content ?? "").slice(0, 120);
      return {
        id: `chatcmpl-${ctx.requestId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: ctx.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `[${label}] settled request ${ctx.requestId}. Echo: ${preview || "(empty)"}`,
            },
            finish_reason: "stop",
          },
        ],
      };
    },
    async respond(req, ctx) {
      const body = await this.complete(req, ctx);
      if (!ctx.stream) {
        return Response.json(body);
      }
      const chunk = {
        id: body.id,
        object: "chat.completion.chunk",
        created: body.created,
        model: body.model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: body.choices[0]?.message.content },
            finish_reason: null,
          },
        ],
      };
      const done = {
        id: body.id,
        object: "chat.completion.chunk",
        created: body.created,
        model: body.model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      };
      const sse =
        `data: ${JSON.stringify(chunk)}\n\n` +
        `data: ${JSON.stringify(done)}\n\n` +
        `data: [DONE]\n\n`;
      return new Response(sse, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
  };
}

export function createTrackingBackend(): StreamBackend & {
  calls: number;
  complete: CompletionBackend["complete"];
} {
  const stub = createStubBackend("track");
  const tracking = {
    calls: 0,
    complete: stub.complete.bind(stub),
    async respond(
      req: ChatCompletionRequest,
      ctx: { requestId: string; model: string; stream: boolean },
    ): Promise<Response> {
      tracking.calls += 1;
      return stub.respond(req, ctx);
    },
  };
  return tracking;
}

export type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  siteUrl?: string;
  siteName?: string;
};

/**
 * OpenRouter backend (Treasury Absorb — operator key stays server-side).
 */
export function createOpenRouterBackend(cfg: OpenRouterConfig): StreamBackend {
  return {
    async respond(req, ctx) {
      const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": cfg.siteUrl ?? "http://localhost:8787",
          "X-Title": cfg.siteName ?? "InferWallet",
        },
        body: JSON.stringify({
          model: ctx.model,
          messages: req.messages,
          stream: ctx.stream,
          temperature: req.temperature,
          max_tokens: req.max_tokens,
        }),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        return Response.json(
          {
            error: {
              message: `OpenRouter error ${upstream.status}: ${text.slice(0, 400)}`,
              type: "provider_error",
              request_id: ctx.requestId,
              /** Settlement already consumed — retry without new Pay-to-Sink. */
              retryable_without_payment: true,
            },
          },
          { status: 502 },
        );
      }

      if (!ctx.stream) {
        const data = await upstream.json();
        return Response.json(data);
      }

      if (!upstream.body) {
        return Response.json(
          {
            error: {
              message: "OpenRouter returned empty body",
              type: "provider_error",
              request_id: ctx.requestId,
              retryable_without_payment: true,
            },
          },
          { status: 502 },
        );
      }

      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Infer-Request-Id": ctx.requestId,
        },
      });
    },
  };
}

export type TierModelMap = Record<TierId, string>;

export function loadTierModels(
  env: Record<string, string | undefined> = process.env,
): TierModelMap {
  return {
    cheap:
      env.TIER_MODEL_CHEAP ?? "openai/gpt-4o-mini",
    balanced:
      env.TIER_MODEL_BALANCED ?? "anthropic/claude-3.5-sonnet",
    premium:
      env.TIER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
  };
}
