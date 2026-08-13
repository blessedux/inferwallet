/** Shared config types for InferWallet SDK (classic SZX on Stellar). */

export type NetworkPassphrase =
  | "Test SDF Network ; September 2015"
  | "Public Global Stellar Network ; September 2015"
  | string;

export interface ClassicAssetRef {
  code: string;
  /** Issuer G… pubkey; omit / empty for native XLM. */
  issuer?: string;
}

export interface SzxConfig {
  /** Classic SZX asset. */
  asset: ClassicAssetRef;
  /** Pay-to-Sink destination (treasury / sink G…). */
  sink: string;
  /** Horizon URL, e.g. https://horizon-testnet.stellar.org */
  horizonUrl: string;
  networkPassphrase: NetworkPassphrase;
  /**
   * Counter-asset used for Fixed USD Feel → SZX sizing (typically test USDC).
   * Price is read as counter units per 1 SZX from the SDEX book.
   */
  quoteAsset: ClassicAssetRef;
}

export interface QuoteResult {
  /** SZX amount as a decimal string (Stellar amount precision). */
  szxAmount: string;
  /** Effective counter-asset units per 1 SZX used for the conversion. */
  pricePerSzx: string;
  /** Echo of the Fixed USD Feel input. */
  usdFeel: number;
  source: "orderbook";
}

export interface BuildPaymentInput {
  sourcePublicKey: string;
  /** Sequence number of the source account (string or number). */
  sequence: string | number;
  /** SZX amount to pay (decimal string). */
  szxAmount: string;
  /** Request id embedded as Request Binding (memo). */
  requestId: string;
  /** Optional base fee in stroops (default 100). */
  baseFee?: number;
  /** Optional timebounds; defaults to now ± 5 minutes. */
  timebounds?: { minTime: number; maxTime: number };
}

export interface BuiltPayment {
  /** Base64 transaction XDR ready for Freighter `signTransaction`. */
  xdr: string;
  /** Memo / Request Binding string embedded in the tx. */
  binding: string;
  requestId: string;
  sink: string;
  szxAmount: string;
}

export interface SettlementExpectation {
  requestId: string;
  sink: string;
  asset: ClassicAssetRef;
  /** Minimum SZX amount that must have been paid (decimal string). */
  minSzxAmount: string;
}

export type VerifyOk = {
  ok: true;
  transactionHash: string;
  binding: string;
  amount: string;
};

export type VerifyFail = {
  ok: false;
  reason: string;
};

export type VerifyResult = VerifyOk | VerifyFail;
