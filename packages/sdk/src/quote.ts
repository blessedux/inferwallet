import { Asset, Horizon } from "@stellar/stellar-sdk";
import { midPrice, szxForUsdFeel } from "./amount.js";
import type { ClassicAssetRef, QuoteResult, SzxConfig } from "./types.js";

export function toAsset(ref: ClassicAssetRef): Asset {
  if (!ref.issuer || ref.code === "XLM") {
    return Asset.native();
  }
  return new Asset(ref.code, ref.issuer);
}

export type OrderbookLike = {
  bids: Array<{ price: string; amount: string }>;
  asks: Array<{ price: string; amount: string }>;
};

export type HorizonServer = Pick<Horizon.Server, "orderbook">;

/**
 * Fetch SZX/quoteAsset orderbook and size SZX for a Fixed USD Feel.
 * Price is counter (quoteAsset) units per 1 SZX.
 */
export async function quoteSzxForUsdFeel(
  config: SzxConfig,
  usdFeel: number,
  opts?: { server?: HorizonServer; orderbook?: OrderbookLike },
): Promise<QuoteResult> {
  const book =
    opts?.orderbook ??
    (await fetchOrderbook(
      opts?.server ?? new Horizon.Server(config.horizonUrl),
      config.asset,
      config.quoteAsset,
    ));

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const pricePerSzx = midPrice(bestBid, bestAsk);
  const szxAmount = szxForUsdFeel(usdFeel, pricePerSzx);

  return {
    szxAmount,
    pricePerSzx,
    usdFeel,
    source: "orderbook",
  };
}

async function fetchOrderbook(
  server: HorizonServer,
  selling: ClassicAssetRef,
  buying: ClassicAssetRef,
): Promise<OrderbookLike> {
  const result = await server
    .orderbook(toAsset(selling), toAsset(buying))
    .call();
  return {
    bids: result.bids.map((l) => ({ price: l.price, amount: l.amount })),
    asks: result.asks.map((l) => ({ price: l.price, amount: l.amount })),
  };
}

/**
 * Quote SZX output for a USDC input amount (swap path).
 * Price is counter (quoteAsset/USDC) units per 1 SZX.
 */
export async function quoteSzxForUsdc(
  config: SzxConfig,
  usdcAmount: number,
  opts?: { server?: HorizonServer; orderbook?: OrderbookLike },
): Promise<QuoteResult> {
  const book =
    opts?.orderbook ??
    (await fetchOrderbook(
      opts?.server ?? new Horizon.Server(config.horizonUrl),
      config.asset,
      config.quoteAsset,
    ));

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const pricePerSzx = midPrice(bestBid, bestAsk);
  const szxAmount = szxForUsdFeel(usdcAmount, pricePerSzx);

  return {
    szxAmount,
    pricePerSzx,
    usdFeel: usdcAmount,
    source: "orderbook",
  };
}
