import { describe, expect, test } from "bun:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  amountGte,
  bindingMatches,
  buildPayToSink,
  buildSwapUsdcToSzx,
  midPrice,
  quoteSzxForUsdFeel,
  quoteSzxForUsdc,
  requestBinding,
  szxForUsdFeel,
  verifyPayToSink,
  type HorizonReader,
  type SzxConfig,
} from "./index.ts";

const issuer = Keypair.random().publicKey();
const sink = Keypair.random().publicKey();
const source = Keypair.random().publicKey();
const usdcIssuer = Keypair.random().publicKey();

const config: SzxConfig = {
  asset: { code: "SZX", issuer },
  sink,
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  quoteAsset: { code: "USDC", issuer: usdcIssuer },
};

describe("quote math", () => {
  test("szxForUsdFeel divides usd feel by price", () => {
    expect(szxForUsdFeel(0.01, "0.1")).toBe("0.1");
    expect(szxForUsdFeel(0.03, "0.05")).toBe("0.6");
  });

  test("midPrice averages bid and ask", () => {
    expect(midPrice("0.09", "0.11")).toBe("0.1");
  });

  test("rejects non-positive inputs", () => {
    expect(() => szxForUsdFeel(0, "0.1")).toThrow();
    expect(() => szxForUsdFeel(0.01, "0")).toThrow();
  });

  test("amountGte compares decimals", () => {
    expect(amountGte("1.0", "1")).toBe(true);
    expect(amountGte("0.9999999", "1")).toBe(false);
  });

  test("quoteSzxForUsdFeel uses injected orderbook", async () => {
    const q = await quoteSzxForUsdFeel(config, 0.01, {
      orderbook: {
        bids: [{ price: "0.09", amount: "100" }],
        asks: [{ price: "0.11", amount: "100" }],
      },
    });
    expect(q.pricePerSzx).toBe("0.1");
    expect(q.szxAmount).toBe("0.1");
    expect(q.source).toBe("orderbook");
  });

  test("quoteSzxForUsdc converts USDC amount to SZX", async () => {
    const q = await quoteSzxForUsdc(config, 1.0, {
      orderbook: {
        bids: [{ price: "0.01", amount: "10000" }],
        asks: [{ price: "0.01", amount: "10000" }],
      },
    });
    expect(q.pricePerSzx).toBe("0.01");
    expect(q.szxAmount).toBe("100");
    expect(q.usdFeel).toBe(1.0);
  });
});

describe("request binding", () => {
  test("prefixes and matches", () => {
    const id = "req_abc123";
    const memo = requestBinding(id);
    expect(memo.startsWith("iw:")).toBe(true);
    expect(bindingMatches(memo, id)).toBe(true);
    expect(bindingMatches("other", id)).toBe(false);
  });

  test("truncates to 28 bytes", () => {
    const long = "x".repeat(100);
    expect(new TextEncoder().encode(requestBinding(long)).length).toBeLessThanOrEqual(
      28,
    );
  });
});

describe("buildPayToSink", () => {
  test("embeds binding memo and returns XDR", () => {
    const built = buildPayToSink(config, {
      sourcePublicKey: source,
      sequence: "1",
      szxAmount: "0.5",
      requestId: "req_1",
      timebounds: { minTime: 1, maxTime: 2 },
    });
    expect(built.xdr.length).toBeGreaterThan(40);
    expect(built.binding).toBe(requestBinding("req_1"));
    expect(built.szxAmount).toBe("0.5");
    expect(built.sink).toBe(sink);
  });
});

describe("buildSwapUsdcToSzx", () => {
  test("builds pathPaymentStrictSend XDR", () => {
    const built = buildSwapUsdcToSzx(config, {
      sourcePublicKey: source,
      sequence: "1",
      usdcAmount: "1.0",
      minSzxOut: "95",
      timebounds: { minTime: 1, maxTime: 2 },
    });
    expect(built.xdr.length).toBeGreaterThan(40);
    expect(built.usdcAmount).toBe("1.0");
    expect(built.minSzxOut).toBe("95");
  });

  test("defaults minSzxOut with 1% slippage buffer", () => {
    const built = buildSwapUsdcToSzx(config, {
      sourcePublicKey: source,
      sequence: "1",
      usdcAmount: "100",
      timebounds: { minTime: 1, maxTime: 2 },
    });
    expect(built.minSzxOut).toBe("99");
  });
});

describe("verifyPayToSink", () => {
  const expectation = {
    requestId: "req_42",
    sink,
    asset: { code: "SZX", issuer },
    minSzxAmount: "0.5",
  };

  function reader(overrides?: {
    memo?: string | null;
    amount?: string;
    to?: string;
    successful?: boolean;
  }): HorizonReader {
    return {
      async loadTransaction() {
        return {
          hash: "abc",
          memo: overrides?.memo ?? requestBinding("req_42"),
          memo_type: "text",
          successful: overrides?.successful ?? true,
        };
      },
      async loadPayments() {
        return [
          {
            type: "payment",
            to: overrides?.to ?? sink,
            amount: overrides?.amount ?? "0.5",
            asset_code: "SZX",
            asset_issuer: issuer,
            transaction_hash: "abc",
          },
        ];
      },
    };
  }

  test("accepts matching settlement", async () => {
    const result = await verifyPayToSink(reader(), "abc", expectation);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe("0.5");
  });

  test("rejects binding mismatch", async () => {
    const result = await verifyPayToSink(
      reader({ memo: "wrong" }),
      "abc",
      expectation,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects insufficient amount", async () => {
    const result = await verifyPayToSink(
      reader({ amount: "0.1" }),
      "abc",
      expectation,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects wrong sink", async () => {
    const result = await verifyPayToSink(
      reader({ to: Keypair.random().publicKey() }),
      "abc",
      expectation,
    );
    expect(result.ok).toBe(false);
  });
});
