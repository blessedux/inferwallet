import {
  Account,
  Asset,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { requestBinding } from "./binding.js";
import type { BuildPaymentInput, BuiltPayment, SzxConfig } from "./types.js";

/**
 * Build a classic Pay-to-Sink payment of SZX with Request Binding (memo).
 * Returns Freighter-signable transaction XDR (unsigned).
 */
export function buildPayToSink(
  config: SzxConfig,
  input: BuildPaymentInput,
): BuiltPayment {
  if (!config.sink.startsWith("G")) {
    throw new Error("sink must be a classic G… account");
  }
  if (!config.asset.issuer) {
    throw new Error("SZX asset issuer is required");
  }

  const binding = requestBinding(input.requestId);
  const account = new Account(input.sourcePublicKey, String(input.sequence));
  const asset = new Asset(config.asset.code, config.asset.issuer);
  const now = Math.floor(Date.now() / 1000);
  const timebounds = input.timebounds ?? {
    minTime: now - 60,
    maxTime: now + 300,
  };

  const tx = new TransactionBuilder(account, {
    fee: String(input.baseFee ?? 100),
    networkPassphrase: config.networkPassphrase,
    timebounds,
  })
    .addOperation(
      Operation.payment({
        destination: config.sink,
        asset,
        amount: input.szxAmount,
      }),
    )
    .addMemo(Memo.text(binding))
    .build();

  return {
    xdr: tx.toXDR(),
    binding,
    requestId: input.requestId,
    sink: config.sink,
    szxAmount: input.szxAmount,
  };
}
