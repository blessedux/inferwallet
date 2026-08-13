/**
 * Session Prepay balance — meters Fixed USD Feel across requests.
 * Funded by a larger Pay-to-Sink; debited per Cursor request until exhausted.
 */

export type PrepayState = {
  /** Remaining prepaid capacity in USD feel units. */
  remainingUsd: number;
  /** Remaining SZX (informational; metering uses USD feel). */
  remainingSzx: string;
  fundedAt: number;
  fundTxHash: string;
  publicKey: string;
};

export class PrepayLedger {
  private state: PrepayState | null = null;

  get(): PrepayState | null {
    return this.state ? { ...this.state } : null;
  }

  fund(input: {
    usd: number;
    szx: string;
    txHash: string;
    publicKey: string;
  }): PrepayState {
    if (!(input.usd > 0)) throw new Error("prepay usd must be positive");
    const prev = this.state;
    this.state = {
      remainingUsd: (prev?.remainingUsd ?? 0) + input.usd,
      remainingSzx: addDecimal(prev?.remainingSzx ?? "0", input.szx),
      fundedAt: Date.now(),
      fundTxHash: input.txHash,
      publicKey: input.publicKey,
    };
    return this.get()!;
  }

  /** Debit Fixed USD Feel if enough remains. Returns false if insufficient. */
  tryDebit(usdFeel: number): boolean {
    if (!this.state || this.state.remainingUsd + 1e-12 < usdFeel) return false;
    const ratio =
      this.state.remainingUsd > 0 ? usdFeel / this.state.remainingUsd : 1;
    const szxDebit = (Number(this.state.remainingSzx) * ratio).toFixed(7);
    this.state = {
      ...this.state,
      remainingUsd: Math.max(0, this.state.remainingUsd - usdFeel),
      remainingSzx: subDecimal(this.state.remainingSzx, szxDebit),
    };
    if (this.state.remainingUsd < 1e-9) {
      this.state.remainingUsd = 0;
      this.state.remainingSzx = "0.0000000";
    }
    return true;
  }

  clear() {
    this.state = null;
  }
}

function addDecimal(a: string, b: string): string {
  return (Number(a) + Number(b)).toFixed(7);
}

function subDecimal(a: string, b: string): string {
  return Math.max(0, Number(a) - Number(b)).toFixed(7);
}
