import { describe, expect, test } from "bun:test";
import { SpendGuards } from "./guards.ts";

describe("spend guards", () => {
  test("kill switch blocks even with budget", () => {
    const g = new SpendGuards({
      dailyUsdCeiling: 100,
      killSwitchEnv: true,
    });
    const r = g.check(0.01);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("kill_switch");
  });

  test("daily ceiling blocks after spend", () => {
    const g = new SpendGuards({
      dailyUsdCeiling: 0.05,
      killSwitchEnv: false,
    });
    expect(g.check(0.03).ok).toBe(true);
    g.record(0.03);
    const r = g.check(0.03);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("daily_ceiling");
  });
});
