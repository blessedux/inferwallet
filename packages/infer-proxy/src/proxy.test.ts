import { describe, expect, test } from "bun:test";
import { createTrackingBackend } from "./backend.ts";
import { createProxyHandler } from "./server.ts";
import { RequestStore } from "./store.ts";

const baseConfig = {
  port: 8787,
  companionOrigin: "http://localhost:5173",
  skipChainVerify: true,
  settlementTimeoutMs: 200,
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
    const json = (await res.json()) as {
      error: { request_id: string; code: string };
    };
    expect(json.error.code).toBe("settlement_required");
    expect(res.headers.get("X-Infer-Request-Id")).toBe(json.error.request_id);
  });

  test("Companion settle during wait returns completion", async () => {
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
    });

    // Wait until pending appears
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
    const completion = (await completionRes.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    expect(completion.choices[0]?.message.content).toContain(requestId);
  });

  test("models endpoint is reachable", async () => {
    const handler = createProxyHandler({ config: baseConfig });
    const res = await handler(new Request("http://localhost/v1/models"));
    expect(res.status).toBe(200);
  });
});
