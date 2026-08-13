export type TierId = "cheap" | "balanced" | "premium";

export const TIERS: Record<
  TierId,
  { label: string; usdFeel: number; description: string }
> = {
  cheap: {
    label: "Cheap",
    usdFeel: 0.01,
    description: "Fast, low-cost completions",
  },
  balanced: {
    label: "Balanced",
    usdFeel: 0.03,
    description: "Default Fixed USD Feel",
  },
  premium: {
    label: "Premium",
    usdFeel: 0.1,
    description: "Higher-capability models",
  },
};

export const PROXY_URL =
  import.meta.env.VITE_PROXY_URL ?? "http://127.0.0.1:8787";

/** Public testnet ids from docs/testnet-assets.json */
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

export const SZX_CONFIG = {
  asset: {
    code: "SZX" as const,
    issuer: "GAUR24CEIVAPOLAVTHYEKAI5VVYAVOHWZ3RJZOTVVFQSJXNAUFXJ4ZQ5",
  },
  sink: "GCRKN24XQI46JJKGGZLREWQFQGGFV4QNDZG7Q7ZWP4EVV4TRVDOX5LGA",
  horizonUrl: HORIZON_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  quoteAsset: {
    code: "USDC" as const,
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
};

export const TIER_STORAGE_KEY = "inferwallet.tier";
