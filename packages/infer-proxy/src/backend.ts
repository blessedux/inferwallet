import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  CompletionBackend,
} from "./types.js";

export type { CompletionBackend } from "./types.js";

/**
 * Stub completion backend — used until the OpenRouter streaming slice.
 * Must never be confused with a live provider call.
 */
export function createStubBackend(
  label = "stub-inferwallet",
): CompletionBackend {
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
  };
}

/** Backend that records whether it was invoked (for tests). */
export function createTrackingBackend(): CompletionBackend & {
  calls: number;
} {
  const stub = createStubBackend("track");
  const tracking = {
    calls: 0,
    async complete(
      req: ChatCompletionRequest,
      ctx: { requestId: string; model: string },
    ): Promise<ChatCompletionResponse> {
      tracking.calls += 1;
      return stub.complete(req, ctx);
    },
  };
  return tracking;
}
