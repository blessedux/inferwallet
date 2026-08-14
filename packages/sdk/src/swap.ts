import {
  Account,
  Asset,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { toAsset } from "./quote.js";
import { toStroops, formatStroops } from "./amount.js";
import type { SzxConfig } from "./types.js";

export interface BuildSwapInput {
  sourcePublicKey: string;
  /** Sequence number of the source account (string or number). */
  sequence: string | number;
  /** USDC amount to send (decimal string or number). */
  usdcAmount: string | number;
  /** Minimum SZX to receive; defaults to quoted amount minus 1% slippage buffer. */
  minSzxOut?: string;
  /** Optional base fee in stroops (default 100). */
  baseFee?: number;
  /** Optional timebounds; defaults to now ± 5 minutes. */
  timebounds?: { minTime: number; maxTime: number };
}

export interface BuiltSwap {
  /** Base64 transaction XDR ready for Freighter `signTransaction`. */
  xdr: string;
  usdcAmount: string;
  minSzxOut: string;
}

/**
 * Build a USDC → SZX swap using pathPaymentStrictSend (direct SDEX book).
 * Returns Freighter-signable transaction XDR (unsigned).
 */
export function buildSwapUsdcToSzx(
  config: SzxConfig,
  input: BuildSwapInput,
): BuiltSwap {
  if (!config.asset.issuer) {
    throw new Error("SZX asset issuer is required");
  }
  if (!config.quoteAsset.issuer) {
    throw new Error("USDC asset issuer is required");
  }

  const account = new Account(input.sourcePublicKey, String(input.sequence));
  const usdcAsset = toAsset(config.quoteAsset);
  const szxAsset = new Asset(config.asset.code, config.asset.issuer);
  
  const usdcAmount = String(input.usdcAmount);
  
  // Default slippage: 1% buffer on minSzxOut
  const minSzxOut = input.minSzxOut ?? (() => {
    const stroops = toStroops(usdcAmount);
    const buffered = (stroops * 99n) / 100n;
    return formatStroops(buffered);
  })();

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
      Operation.pathPaymentStrictSend({
        sendAsset: usdcAsset,
        sendAmount: usdcAmount,
        destination: input.sourcePublicKey,
        destAsset: szxAsset,
        destMin: minSzxOut,
        path: [], // Direct book order
      }),
    )
    .build();

  return {
    xdr: tx.toXDR(),
    usdcAmount,
    minSzxOut,
  };
}
