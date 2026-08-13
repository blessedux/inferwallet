import { amountGte } from "./amount.js";
import { bindingMatches } from "./binding.js";
import type {
  ClassicAssetRef,
  SettlementExpectation,
  VerifyResult,
} from "./types.js";

/** Minimal Horizon payment record shape we care about. */
export type HorizonPayment = {
  type?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  transaction_hash?: string;
};

export type HorizonTransaction = {
  hash: string;
  memo?: string | null;
  memo_type?: string | null;
  successful?: boolean;
};

export type HorizonReader = {
  loadTransaction: (hash: string) => Promise<HorizonTransaction>;
  loadPayments: (hash: string) => Promise<HorizonPayment[]>;
};

/**
 * Verify a Horizon transaction is a valid Pay-to-Sink settlement for a request.
 */
export async function verifyPayToSink(
  reader: HorizonReader,
  txHash: string,
  expectation: SettlementExpectation,
): Promise<VerifyResult> {
  let tx: HorizonTransaction;
  try {
    tx = await reader.loadTransaction(txHash);
  } catch {
    return { ok: false, reason: `transaction not found: ${txHash}` };
  }

  if (tx.successful === false) {
    return { ok: false, reason: "transaction failed on-chain" };
  }

  if (!bindingMatches(tx.memo ?? null, expectation.requestId)) {
    return {
      ok: false,
      reason: `Request Binding mismatch: memo=${tx.memo ?? "(none)"}`,
    };
  }

  const payments = await reader.loadPayments(txHash);
  const match = payments.find((p) =>
    isMatchingPayment(p, expectation.sink, expectation.asset),
  );

  if (!match || !match.amount) {
    return {
      ok: false,
      reason: "no matching SZX payment to sink in transaction",
    };
  }

  if (!amountGte(match.amount, expectation.minSzxAmount)) {
    return {
      ok: false,
      reason: `amount ${match.amount} < required ${expectation.minSzxAmount}`,
    };
  }

  return {
    ok: true,
    transactionHash: tx.hash,
    binding: tx.memo ?? "",
    amount: match.amount,
  };
}

function isMatchingPayment(
  p: HorizonPayment,
  sink: string,
  asset: ClassicAssetRef,
): boolean {
  if (p.type && p.type !== "payment") return false;
  if (p.to !== sink) return false;
  if (asset.issuer) {
    return p.asset_code === asset.code && p.asset_issuer === asset.issuer;
  }
  return p.asset_type === "native";
}

/** Create a HorizonReader backed by Horizon REST (fetch). */
export function createHorizonReader(horizonUrl: string): HorizonReader {
  const base = horizonUrl.replace(/\/$/, "");
  return {
    async loadTransaction(hash) {
      const res = await fetch(`${base}/transactions/${hash}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as HorizonTransaction;
    },
    async loadPayments(hash) {
      const res = await fetch(
        `${base}/transactions/${hash}/payments?limit=20`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        _embedded?: { records?: HorizonPayment[] };
      };
      return body._embedded?.records ?? [];
    },
  };
}
