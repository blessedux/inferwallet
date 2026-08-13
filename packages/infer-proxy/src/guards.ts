import { existsSync, readFileSync } from "node:fs";

/**
 * Operator spend guards: daily USD ceiling + kill switch.
 * Applied before OpenRouter forwarding (even when settlement is valid).
 */

export type GuardConfig = {
  /** Max sum of Fixed USD Feel per UTC day. */
  dailyUsdCeiling: number;
  /** Env kill switch (true = stop all forwarding). */
  killSwitchEnv: boolean;
  /** Optional path to a kill-switch file; presence disables forwarding. */
  killSwitchFile?: string;
};

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: "kill_switch" | "daily_ceiling"; message: string };

export class SpendGuards {
  private dayKey = utcDayKey();
  private spentUsd = 0;

  constructor(private readonly config: GuardConfig) {}

  check(usdFeel: number): GuardResult {
    this.rollDay();
    if (this.config.killSwitchEnv || this.fileArmed()) {
      return {
        ok: false,
        reason: "kill_switch",
        message: "Kill switch armed — OpenRouter forwarding disabled",
      };
    }
    if (this.spentUsd + usdFeel > this.config.dailyUsdCeiling + 1e-12) {
      return {
        ok: false,
        reason: "daily_ceiling",
        message: `Daily USD ceiling $${this.config.dailyUsdCeiling} reached (spent $${this.spentUsd.toFixed(4)})`,
      };
    }
    return { ok: true };
  }

  /** Record a successful forward against the daily budget. */
  record(usdFeel: number) {
    this.rollDay();
    this.spentUsd += usdFeel;
  }

  snapshot() {
    this.rollDay();
    return {
      day: this.dayKey,
      spentUsd: this.spentUsd,
      ceiling: this.config.dailyUsdCeiling,
      killSwitch: this.config.killSwitchEnv || this.fileArmed(),
    };
  }

  private fileArmed(): boolean {
    const path = this.config.killSwitchFile;
    if (!path) return false;
    try {
      if (!existsSync(path)) return false;
      const body = readFileSync(path, "utf8").trim().toLowerCase();
      // Empty file or "1"/"true"/"on" arms the switch
      return body === "" || body === "1" || body === "true" || body === "on";
    } catch {
      return false;
    }
  }

  private rollDay() {
    const key = utcDayKey();
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.spentUsd = 0;
    }
  }
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function loadGuardConfig(
  env: Record<string, string | undefined> = process.env,
): GuardConfig {
  return {
    dailyUsdCeiling: Number(env.DAILY_USD_CEILING ?? 50),
    killSwitchEnv:
      env.KILL_SWITCH === "1" ||
      env.KILL_SWITCH === "true" ||
      env.KILL_SWITCH === "on",
    killSwitchFile: env.KILL_SWITCH_FILE,
  };
}
