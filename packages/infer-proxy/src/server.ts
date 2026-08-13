import { createStubBackend, type CompletionBackend } from "./backend.js";
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

export interface SzxProxyConfig {
  port: number;
  companionOrigin: string;
  /** When true, skip Horizon and accept Companion-reported settlements. */
  skipChainVerify: boolean;
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
  backend?: CompletionBackend;
  verifier?: SettlementVerifier;
  config: SzxProxyConfig;
}

function corsHeaders(origin: string | null, allowed: string): HeadersInit {
  const allow =
    origin && (origin === allowed || allowed === "*") ? origin : allowed;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Infer-Tier, X-Infer-Request-Id",
    "Access-Control-Expose-Headers":
      "X-Infer-Request-Id, X-Infer-Payment-Required",
  };
}

function json(
  data: unknown,
  status: number,
  origin: string | null,
  allowed: string,
  extra?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin, allowed),
      ...extra,
    },
  });
}

export function createProxyHandler(deps: ProxyDeps) {
  const store = deps.store ?? new RequestStore();
  const backend = deps.backend ?? createStubBackend();
  const config = deps.config;
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
        { ok: true, service: "infer-proxy" },
        200,
        origin,
        config.companionOrigin,
      );
    }

    if (url.pathname === "/v1/pending" && req.method === "GET") {
      return json(
        { pending: store.listPending() },
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
          data: [
            { id: "inferwallet/cheap", object: "model", owned_by: "inferwallet" },
            {
              id: "inferwallet/balanced",
              object: "model",
              owned_by: "inferwallet",
            },
            {
              id: "inferwallet/premium",
              object: "model",
              owned_by: "inferwallet",
            },
          ],
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

      const settlementHeader = req.headers.get("X-Infer-Request-Id");
      if (settlementHeader) {
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
        const model = tierConfig(settled.tier).model;
        const completion = await backend.complete(settled.payload, {
          requestId: settled.id,
          model,
        });
        return json(completion, 200, origin, config.companionOrigin);
      }

      const tier = parseTierFromModel(
        payload.model,
        req.headers.get("X-Infer-Tier"),
      );
      const pending = store.create(payload, tier);
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

    return json(
      { error: { message: "not found", type: "invalid_request_error" } },
      404,
      origin,
      config.companionOrigin,
    );
  };
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
