import type {
  ChatCompletionRequest,
  PendingRequest,
  PendingRequestStatus,
  TierId,
} from "./types.js";

const TIERS: Record<TierId, { usdFeel: number; model: string }> = {
  cheap: { usdFeel: 0.01, model: "openrouter/cheap" },
  balanced: { usdFeel: 0.03, model: "openrouter/balanced" },
  premium: { usdFeel: 0.1, model: "openrouter/premium" },
};

export function tierConfig(tier: TierId) {
  return TIERS[tier];
}

export function parseTier(value: string | null | undefined): TierId {
  if (value === "cheap" || value === "balanced" || value === "premium") {
    return value;
  }
  return "balanced";
}

export class RequestStore {
  private readonly byId = new Map<string, PendingRequest>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60_000) {
    this.ttlMs = ttlMs;
  }

  create(payload: ChatCompletionRequest, tier: TierId): PendingRequest {
    this.gc();
    const id = crypto.randomUUID();
    const cfg = tierConfig(tier);
    const req: PendingRequest = {
      id,
      createdAt: Date.now(),
      tier,
      usdFeel: cfg.usdFeel,
      szxAmount: null,
      status: "awaiting_payment",
      payload,
    };
    this.byId.set(id, req);
    return req;
  }

  get(id: string): PendingRequest | undefined {
    this.gc();
    return this.byId.get(id);
  }

  listPending(): PendingRequest[] {
    this.gc();
    return [...this.byId.values()].filter((r) => r.status === "awaiting_payment");
  }

  markSettled(
    id: string,
    txHash: string,
    szxAmount?: string,
  ): PendingRequest | undefined {
    const req = this.byId.get(id);
    if (!req || req.status !== "awaiting_payment") return undefined;
    req.status = "settled";
    req.settlementTxHash = txHash;
    if (szxAmount) req.szxAmount = szxAmount;
    return req;
  }

  takeSettled(id: string): PendingRequest | undefined {
    const req = this.byId.get(id);
    if (!req || req.status !== "settled") return undefined;
    this.byId.delete(id);
    return req;
  }

  private gc() {
    const now = Date.now();
    for (const [id, req] of this.byId) {
      if (req.status === "awaiting_payment" && now - req.createdAt > this.ttlMs) {
        req.status = "expired" satisfies PendingRequestStatus;
        this.byId.delete(id);
      }
    }
  }
}
