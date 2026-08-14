export interface UsageEntry {
  id: string;
  at: number;
  tier: string;
  model: string;
  usdFeel: number;
  szxAmount: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * In-memory session usage ledger (ring buffer).
 * Tracks successful inference requests for the companion UI.
 */
export class UsageLedger {
  private readonly entries: UsageEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  record(entry: UsageEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  list(): UsageEntry[] {
    return [...this.entries];
  }
}
