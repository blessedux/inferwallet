/** Decimal amount helpers at Stellar's 7-decimal precision (no float for money). */

const SCALE = 10_000_000n; // 7 decimals

function parseDecimal(value: string | number): bigint {
  const s = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }
  const negative = s.startsWith("-");
  const [wholePart = "0", fracPart = ""] = (negative ? s.slice(1) : s).split(".");
  const frac = (fracPart + "0000000").slice(0, 7);
  const stroops = BigInt(wholePart) * SCALE + BigInt(frac);
  return negative ? -stroops : stroops;
}

export function formatStroops(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  const body = frac.length ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function toStroops(value: string | number): bigint {
  return parseDecimal(value);
}

/** Compare a >= b for decimal strings. */
export function amountGte(a: string, b: string): boolean {
  return parseDecimal(a) >= parseDecimal(b);
}

/**
 * Convert Fixed USD Feel → SZX amount given counter-asset units per 1 SZX.
 * szx = usdFeel / pricePerSzx
 */
export function szxForUsdFeel(usdFeel: number, pricePerSzx: string): string {
  if (!(usdFeel > 0) || !Number.isFinite(usdFeel)) {
    throw new Error(`usdFeel must be a positive finite number, got ${usdFeel}`);
  }
  const price = parseDecimal(pricePerSzx);
  if (price <= 0n) {
    throw new Error(`pricePerSzx must be positive, got ${pricePerSzx}`);
  }
  // usdFeel may have more than 7 decimals; scale via string truncation
  const usdStroops = parseDecimal(usdFeel.toFixed(7));
  // szx_stroops = usd_stroops * SCALE / price_stroops
  const szxStroops = (usdStroops * SCALE) / price;
  if (szxStroops <= 0n) {
    throw new Error("Computed SZX amount is zero — price too high or usdFeel too small");
  }
  return formatStroops(szxStroops);
}

/**
 * Mid price from best bid/ask (counter per base). Falls back to whichever side exists.
 */
export function midPrice(bestBid?: string, bestAsk?: string): string {
  if (bestBid && bestAsk) {
    const bid = parseDecimal(bestBid);
    const ask = parseDecimal(bestAsk);
    return formatStroops((bid + ask) / 2n);
  }
  if (bestAsk) return bestAsk;
  if (bestBid) return bestBid;
  throw new Error("SDEX orderbook has no bids or asks");
}
