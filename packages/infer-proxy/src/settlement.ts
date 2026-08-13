import {
  createHorizonReader,
  verifyPayToSink,
  type SettlementExpectation,
  type SzxConfig,
  type VerifyResult,
} from "@inferwallet/sdk";

export type SettlementVerifier = (
  txHash: string,
  expectation: SettlementExpectation,
) => Promise<VerifyResult>;

/** Live Horizon verifier using SDK. */
export function createHorizonVerifier(config: SzxConfig): SettlementVerifier {
  const reader = createHorizonReader(config.horizonUrl);
  return (txHash, expectation) => verifyPayToSink(reader, txHash, expectation);
}

/** Always-accept verifier for local demos without chain (tests / dry-run). */
export function createAcceptAllVerifier(): SettlementVerifier {
  return async (txHash) => ({
    ok: true,
    transactionHash: txHash,
    binding: "demo",
    amount: "0",
  });
}
