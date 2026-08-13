import { describe, expect, test } from "bun:test";
import { createTrackingBackend } from "./backend.ts";
import { createProxyHandler } from "./server.ts";
import { RequestStore } from "./store.ts";
import { loadTierModels } from "./backend.ts";

const baseConfig = {
  port: 8787,
  companionOrigin: "http://localhost:5173",
  skipChainVerify: true,
  settlementTimeoutMs: 200,
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  tierModels: loadTierModels({}),
  guards: { dailyUsdCeiling: 50, killSwitchEnv: false },
};

async function postCompletions(
  handler: (req: Request) => Promise<Response>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return handler(
    new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-dummy",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("infer proxy settlement gate", () => {
  test("timeout without settlement returns 402 and does not call backend", async () => {
    const backend = createTrackingBackend();
    const store = new RequestStore();
    const handler = createProxyHandler({
      store,
      backend,
      config: baseConfig,
    });

    const res = await postCompletions(handler, {
      model: "inferwallet/balanced",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.status).toBe(402);
    expect(backend.calls).toBe(0);
  });

  test("Companion settle during wait streams/returns completion", async () => {
    const backend = createTrackingBackend();
    const store = new RequestStore();
    const handler = createProxyHandler({
      store,
      backend,
      config: { ...baseConfig, settlementTimeoutMs: 5_000 },
    });

    const pendingPromise = postCompletions(handler, {
      model: "inferwallet/cheap",
      messages: [{ role: "user", content: "pay me" }],
      stream: true,
    });

    let requestId = "";
    for (let i = 0; i < 50; i++) {
      const list = store.listPending();
      if (list[0]) {
        requestId = list[0].id;
        break;
      }
      await Bun.sleep(20);
    }
    expect(requestId).toBeTruthy();

    const settleRes = await handler(
      new Request("http://localhost/v1/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          transactionHash: "fake-tx-hash",
          szxAmount: "0.1",
        }),
      }),
    );
    expect(settleRes.status).toBe(200);

    const completionRes = await pendingPromise;
    expect(completionRes.status).toBe(200);
    expect(backend.calls).toBe(1);
    expect(completionRes.headers.get("Content-Type")).toContain(
      "text/event-stream",
    );
  });

  test("tier models come from env", () => {
    const models = loadTierModels({
      TIER_MODEL_CHEAP: "x/cheap",
      TIER_MODEL_BALANCED: "x/bal",
      TIER_MODEL_PREMIUM: "x/prem",
    });
    expect(models.cheap).toBe("x/cheap");
    expect(models.balanced).toBe("x/bal");
    expect(models.premium).toBe("x/prem");
  });
});
