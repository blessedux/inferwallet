import { Asset } from "@stellar/stellar-sdk";

/** Classic Circle/Centre testnet USDC (SDEX-tradable). */
export const TESTNET_USDC = new Asset(
  "USDC",
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
);

/**
 * Total supply: 100_000_000_000 SZX (100 billion).
 * Classic assets use 7 decimal places (stroop-equivalent: 1 SZX = 10^7 base units).
 */
export const TOTAL_SUPPLY = "100000000000";

/** Target mid for Fixed USD Feel alignment: 1 SZX ≈ $0.01 USDC. */
export const TARGET_PRICE_USDC_PER_SZX = "0.01";

/**
 * Matching SZX inventory for a 150_000 USDC first pool at $0.01:
 * 150_000 / 0.01 = 15_000_000 SZX reserved for the book.
 */
export const POOL_SZX_INVENTORY = "15000000";
export const POOL_USDC_TARGET = "150000";

export const HORIZON_URL = "https://horizon-testnet.stellar.org";
