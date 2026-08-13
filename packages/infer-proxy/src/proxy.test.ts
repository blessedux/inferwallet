import { describe, expect, test } from "bun:test";
import { createTrackingBackend } from "./backend.ts";
import { createProxyHandler } from "./server.ts";
import { RequestStore } from "./store.ts";

const baseConfig = {
  port: 8787,
  companionOrigin: "http://localhost:5173",
  skipChainVerify: true,
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
  test("unsettled request returns 402 and does not call backend", async () => {
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
    expect(store.listPending()).toHaveLength(1);
    expect(res.headers.get("X-Infer-Request-Id")).toBe(json.error.request_id);
  });

  test("Companion pending + settle then retry invokes stub backend", async () => {
    const backend = createTrackingBackend();
    const store = new RequestStore();
    const handler = createProxyHandler({
      store,
      backend,
      config: baseConfig,
    });

    const first = await postCompletions(handler, {
      model: "inferwallet/cheap",
      messages: [{ role: "user", content: "pay me" }],
    });
    const firstBody = (await first.json()) as {
      error: { request_id: string };
    };
    const requestId = firstBody.error.request_id;

    const pendingRes = await handler(
      new Request("http://localhost/v1/pending", {
        headers: { Origin: "http://localhost:5173" },
      }),
    );
    expect(pendingRes.status).toBe(200);
    const pendingBody = (await pendingRes.json()) as {
      pending: Array<{ id: string }>;
    };
    expect(pendingBody.pending.some((p) => p.id === requestId)).toBe(true);

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

    const second = await postCompletions(
      handler,
      {
        model: "inferwallet/cheap",
        messages: [{ role: "user", content: "ignored on retry path" }],
      },
      { "X-Infer-Request-Id": requestId },
    );
    expect(second.status).toBe(200);
    expect(backend.calls).toBe(1);
    const completion = (await second.json()) as {
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
