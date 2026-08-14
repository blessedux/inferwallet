import {
  createOpenRouterBackend,
  createStubBackend,
  loadTierModels,
  type StreamBackend,
  type TierModelMap,
} from "./backend.js";
import { loadGuardConfig, SpendGuards, type GuardConfig } from "./guards.js";
import { PrepayLedger } from "./prepay.js";
import {
  createAcceptAllVerifier,
  createHorizonVerifier,
  type SettlementVerifier,
} from "./settlement.js";
import { parseTier, RequestStore, tierConfig } from "./store.js";
import type {
  ChatCompletionRequest,
  SettlementBody,
  TierId,
} from "./types.js";
import { UsageLedger } from "./usage.js";

export interface SzxProxyConfig {
  port: number;
  companionOrigin: string;
  skipChainVerify: boolean;
  settlementTimeoutMs: number;
  openRouterApiKey?: string;
  openRouterBaseUrl: string;
  tierModels: TierModelMap;
  guards: GuardConfig;
  szx?: {
    code: string;
    issuer: string;
    sink: string;
    horizonUrl: string;
    networkPassphrase: string;
  };
}

export interface ProxyDeps {
  store?: RequestStore;
  prepay?: PrepayLedger;
  guards?: SpendGuards;
  backend?: StreamBackend;
  verifier?: SettlementVerifier;
  usage?: UsageLedger;
  config: SzxProxyConfig;
}

function corsHeaders(origin: string | null, allowed: string): HeadersInit {
  const allow =
    origin && (origin === allowed || allowed === "*") ? origin : allowed;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Infer-Tier, X-Infer-Request-Id",
    "Access-Control-Expose-Headers":
      "X-Infer-Request-Id, X-Infer-Payment-Required",
  };
}

function withCors(
  res: Response,
  origin: string | null,
  allowed: string,
  extra?: HeadersInit,
): Response {
  const headers = new Headers(res.headers);
  const cors = corsHeaders(origin, allowed);
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      headers.set(k, String(v));
    }
  }
  return new Response(res.body, { status: res.status, headers });
}

function json(
  data: unknown,
  status: number,
  origin: string | null,
  allowed: string,
  extra?: HeadersInit,
): Response {
  return withCors(
    Response.json(data, { status }),
    origin,
    allowed,
    extra,
  );
}

export function createProxyHandler(deps: ProxyDeps) {
  const config = deps.config;
  const store = deps.store ?? new RequestStore();
  const prepay = deps.prepay ?? new PrepayLedger();
  const guards = deps.guards ?? new SpendGuards(config.guards);
  const usage = deps.usage ?? new UsageLedger();
  const backend =
    deps.backend ??
    (config.openRouterApiKey
      ? createOpenRouterBackend({
          apiKey: config.openRouterApiKey,
          baseUrl: config.openRouterBaseUrl,
        })
      : createStubBackend());
  const verifier =
    deps.verifier ??
    (config.skipChainVerify || !config.szx
      ? createAcceptAllVerifier()
      : createHorizonVerifier({
          asset: { code: config.szx.code, issuer: config.szx.issuer },
          sink: config.szx.sink,
          horizonUrl: config.szx.horizonUrl,
          networkPassphrase: config.szx.networkPassphrase,
          quoteAsset: { code: "USDC" },
        }));

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, config.companionOrigin),
      });
    }

    if (url.pathname === "/health") {
      return json(
        {
          ok: true,
          service: "infer-proxy",
          provider: config.openRouterApiKey ? "openrouter" : "stub",
          guards: guards.snapshot(),
        },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (url.pathname === "/v1/prepay" && req.method === "GET") {
      return json(
        { prepay: prepay.get() },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (url.pathname === "/v1/prepay" && req.method === "POST") {
      let body: {
        transactionHash: string;
        usd: number;
        szxAmount: string;
        publicKey: string;
        /** Request Binding id used in the Freighter memo (`prepay:<uuid>`). */
        requestId?: string;
      };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return json(
          { error: { message: "invalid JSON", type: "invalid_request_error" } },
          400,
          origin,
          config.companionOrigin,
        );
      }
      if (!body.transactionHash || !(body.usd > 0) || !body.szxAmount) {
        return json(
          {
            error: {
              message: "transactionHash, usd, szxAmount required",
              type: "invalid_request_error",
            },
          },
          400,
          origin,
          config.companionOrigin,
        );
      }
      if (config.szx && !config.skipChainVerify) {
        const bindingId = body.requestId ?? `prepay:${body.transactionHash.slice(0, 16)}`;
        const verified = await verifier(body.transactionHash, {
          requestId: bindingId,
          sink: config.szx.sink,
          asset: { code: config.szx.code, issuer: config.szx.issuer },
          minSzxAmount: body.szxAmount,
        });
        if (!verified.ok) {
          return json(
            {
              error: {
                message: `prepay settlement rejected: ${verified.reason}`,
                type: "settlement_error",
              },
            },
            402,
            origin,
            config.companionOrigin,
          );
        }
      }
      const state = prepay.fund({
        usd: body.usd,
        szx: body.szxAmount,
        txHash: body.transactionHash,
        publicKey: body.publicKey ?? "",
      });
      return json({ ok: true, prepay: state }, 200, origin, config.companionOrigin);
    }

    if (url.pathname === "/v1/pending" && req.method === "GET") {
      return json(
        { pending: store.listPending() },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (url.pathname === "/v1/usage" && req.method === "GET") {
      return json(
        { usage: usage.list() },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (url.pathname === "/v1/settle" && req.method === "POST") {
      let body: SettlementBody;
      try {
        body = (await req.json()) as SettlementBody;
      } catch {
        return json(
          { error: { message: "invalid JSON", type: "invalid_request_error" } },
          400,
          origin,
          config.companionOrigin,
        );
      }

      const pending = store.get(body.requestId);
      if (!pending || pending.status !== "awaiting_payment") {
        return json(
          {
            error: {
              message: "unknown or non-pending request",
              type: "invalid_request_error",
            },
          },
          404,
          origin,
          config.companionOrigin,
        );
      }

      if (config.szx && !config.skipChainVerify) {
        const verified = await verifier(body.transactionHash, {
          requestId: body.requestId,
          sink: config.szx.sink,
          asset: { code: config.szx.code, issuer: config.szx.issuer },
          minSzxAmount: body.szxAmount ?? pending.szxAmount ?? "0",
        });
        if (!verified.ok) {
          return json(
            {
              error: {
                message: `settlement rejected: ${verified.reason}`,
                type: "settlement_error",
              },
            },
            402,
            origin,
            config.companionOrigin,
          );
        }
      }

      store.markSettled(body.requestId, body.transactionHash, body.szxAmount);
      return json(
        { ok: true, requestId: body.requestId },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (url.pathname === "/v1/models" && req.method === "GET") {
      return json(
        {
          object: "list",
          data: (Object.keys(config.tierModels) as TierId[]).map((id) => ({
            id: `inferwallet/${id}`,
            object: "model",
            owned_by: "inferwallet",
            root: config.tierModels[id],
          })),
        },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (
      (url.pathname === "/v1/chat/completions" ||
        url.pathname === "/chat/completions") &&
      req.method === "POST"
    ) {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) {
        return json(
          {
            error: {
              message: "Missing Bearer token (use any dummy key)",
              type: "invalid_request_error",
            },
          },
          401,
          origin,
          config.companionOrigin,
        );
      }

      let payload: ChatCompletionRequest;
      try {
        payload = (await req.json()) as ChatCompletionRequest;
      } catch {
        return json(
          { error: { message: "invalid JSON", type: "invalid_request_error" } },
          400,
          origin,
          config.companionOrigin,
        );
      }

      if (!payload.messages?.length) {
        return json(
          {
            error: {
              message: "messages required",
              type: "invalid_request_error",
            },
          },
          400,
          origin,
          config.companionOrigin,
        );
      }

      const stream = Boolean(payload.stream);
      const settlementHeader = req.headers.get("X-Infer-Request-Id");

      // Retry path after provider failure (already settled — no new charge)
      if (settlementHeader) {
        const retryable = store.get(settlementHeader);
        if (retryable?.status === "settled_retryable") {
          return fulfill(
            store,
            backend,
            config,
            guards,
            usage,
            retryable.id,
            retryable.tier,
            retryable.payload,
            stream,
            origin,
          );
        }
        const settled = store.takeSettled(settlementHeader);
        if (!settled) {
          return json(
            {
              error: {
                message: "request not settled",
                type: "payment_required",
              },
            },
            402,
            origin,
            config.companionOrigin,
          );
        }
        return fulfill(
          store,
          backend,
          config,
          guards,
          usage,
          settled.id,
          settled.tier,
          settled.payload,
          stream,
          origin,
        );
      }

      const tier = parseTierFromModel(
        payload.model,
        req.headers.get("X-Infer-Tier"),
      );
      const feel = tierConfig(tier).usdFeel;

      // Prepay debit — no Freighter popup while balance remains
      if (prepay.tryDebit(feel)) {
        const requestId = crypto.randomUUID();
        return fulfill(
          store,
          backend,
          config,
          guards,
          usage,
          requestId,
          tier,
          payload,
          stream,
          origin,
        );
      }

      const pending = store.create(payload, tier);

      try {
        const settled = await store.waitUntilSettled(
          pending.id,
          config.settlementTimeoutMs,
        );
        return fulfill(
          store,
          backend,
          config,
          guards,
          usage,
          settled.id,
          settled.tier,
          settled.payload,
          stream,
          origin,
        );
      } catch {
        return json(
          {
            error: {
              message: "Payment required — complete Pay-to-Sink in Companion",
              type: "payment_required",
              code: "settlement_required",
              request_id: pending.id,
              companion: {
                pending_url: `http://127.0.0.1:${config.port}/v1/pending`,
                settle_url: `http://127.0.0.1:${config.port}/v1/settle`,
                tier: pending.tier,
                usd_feel: pending.usdFeel,
              },
            },
          },
          402,
          origin,
          config.companionOrigin,
          {
            "X-Infer-Request-Id": pending.id,
            "X-Infer-Payment-Required": "true",
          },
        );
      }
    }

    return json(
      { error: { message: "not found", type: "invalid_request_error" } },
      404,
      origin,
      config.companionOrigin,
    );
  };
}

async function fulfill(
  store: RequestStore,
  backend: StreamBackend,
  config: SzxProxyConfig,
  guards: SpendGuards,
  usage: UsageLedger,
  requestId: string,
  tier: TierId,
  payload: ChatCompletionRequest,
  stream: boolean,
  origin: string | null,
): Promise<Response> {
  const feel = tierConfig(tier).usdFeel;
  const gate = guards.check(feel);
  if (!gate.ok) {
    return json(
      {
        error: {
          message: gate.message,
          type: "spend_guard",
          code: gate.reason,
          request_id: requestId,
        },
      },
      429,
      origin,
      config.companionOrigin,
      { "X-Infer-Request-Id": requestId },
    );
  }

  const model = config.tierModels[tier] ?? tierConfig(tier).model;
  const res = await backend.respond(payload, { requestId, model, stream });

  if (!res.ok) {
    store.markRetryable(requestId);
    return withCors(res, origin, config.companionOrigin, {
      "X-Infer-Request-Id": requestId,
    });
  }

  guards.record(feel);
  
  // Record usage (tokens may be 0 for stream or unavailable responses)
  const req = store.get(requestId);
  usage.record({
    id: requestId,
    at: Date.now(),
    tier,
    model,
    usdFeel: feel,
    szxAmount: req?.szxAmount ?? "0",
    promptTokens: 0,
    completionTokens: 0,
  });
  
  store.consume(requestId);
  return withCors(res, origin, config.companionOrigin, {
    "X-Infer-Request-Id": requestId,
  });
}

function parseTierFromModel(
  model: string | undefined,
  headerTier: string | null,
): TierId {
  if (headerTier) return parseTier(headerTier);
  if (model?.includes("cheap")) return "cheap";
  if (model?.includes("premium")) return "premium";
  return parseTier(null);
}

export function loadConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SzxProxyConfig {
  return {
    port: Number(env.INFER_PROXY_PORT ?? 8787),
    companionOrigin: env.COMPANION_ORIGIN ?? "http://localhost:5173",
    skipChainVerify:
      env.SKIP_CHAIN_VERIFY === "1" || env.SKIP_CHAIN_VERIFY === "true",
    settlementTimeoutMs: Number(env.SETTLEMENT_TIMEOUT_MS ?? 120_000),
    openRouterApiKey: env.OPENROUTER_API_KEY,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    tierModels: loadTierModels(env),
    guards: loadGuardConfig(env),
    szx:
      env.SZX_ISSUER && env.SZX_SINK
        ? {
            code: env.SZX_CODE ?? "SZX",
            issuer: env.SZX_ISSUER,
            sink: env.SZX_SINK,
            horizonUrl: env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
            networkPassphrase:
              env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
          }
        : undefined,
  };
}
