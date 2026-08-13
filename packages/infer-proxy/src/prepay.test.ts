import { describe, expect, test } from "bun:test";
import { createTrackingBackend, loadTierModels } from "./backend.ts";
import { PrepayLedger } from "./prepay.ts";
import { createProxyHandler } from "./server.ts";
import { RequestStore } from "./store.ts";

const baseConfig = {
  port: 8787,
  companionOrigin: "http://localhost:5173",
  skipChainVerify: true,
  settlementTimeoutMs: 200,
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  tierModels: loadTierModels({}),
};

describe("prepay metering", () => {
  test("ledger debits until exhausted", () => {
    const ledger = new PrepayLedger();
    ledger.fund({
      usd: 0.05,
      szx: "5",
      txHash: "t",
      publicKey: "G",
    });
    expect(ledger.tryDebit(0.03)).toBe(true);
    expect(ledger.get()?.remainingUsd).toBeCloseTo(0.02);
    expect(ledger.tryDebit(0.03)).toBe(false);
    expect(ledger.tryDebit(0.02)).toBe(true);
    expect(ledger.get()?.remainingUsd).toBe(0);
  });

  test("funded prepay skips Freighter pending path", async () => {
    const backend = createTrackingBackend();
    const prepay = new PrepayLedger();
    prepay.fund({
      usd: 1,
      szx: "100",
      txHash: "tx",
      publicKey: "G",
    });
    const handler = createProxyHandler({
      store: new RequestStore(),
      prepay,
      backend,
      config: baseConfig,
    });
    const res = await handler(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-dummy",
        },
        body: JSON.stringify({
          model: "inferwallet/balanced",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(backend.calls).toBe(1);
    expect(prepay.get()?.remainingUsd).toBeCloseTo(0.97);
  });
});
