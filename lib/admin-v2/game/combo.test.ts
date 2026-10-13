import { describe, expect, it } from "vitest";
import { COMBO_DAY_CAP, COMBO_WINDOW_MS, applyCombo, comboMultiplier, comboNow } from "./combo";
import type { ActivityRow, ScoredAction } from "./types";
import { countedRows, scoreRows } from "./xp";

// Tuesday 2026-10-13, 10:00 in Belgrade.
const T0 = Date.UTC(2026, 9, 13, 8, 0);

let seq = 0;
const row = (action: string, at: number, href?: string): ActivityRow => ({ id: `c${++seq}`, action, actorKind: "admin", occurredAt: at, href: href ?? `/h/${seq}` });
/** Printer rows: 10 XP, combo, every row counts. */
const printer = (at: number) => row("admin_order_sent_to_printer", at);
const chainOf = (times: number[]) => scoreRows(times.map(printer));

describe("comboMultiplier", () => {
  it("is x1, x1, x2, x2, x3 and stays x3", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(comboMultiplier)).toEqual([1, 1, 1, 2, 2, 3, 3, 3]);
  });
});

describe("applyCombo", () => {
  it("is empty for an empty input", () => {
    expect(applyCombo([])).toEqual([]);
  });

  it("numbers the chain and gives the bonus of the multiplier", () => {
    const scored = chainOf([0, 10, 20, 30, 40, 50].map((s) => T0 + s * 1000));
    expect(scored.map((a) => a.chain)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(scored.map((a) => a.multiplier)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(scored.map((a) => a.bonus)).toEqual([0, 0, 10, 10, 20, 20]);
    expect(scored.map((a) => a.xp)).toEqual([10, 10, 20, 20, 30, 30]);
    expect(scored.every((a) => a.xp === a.base + a.bonus)).toBe(true);
  });

  it("keeps the chain with a gap of exactly 120 s and breaks it at 120 s + 1 ms", () => {
    const kept = chainOf([T0, T0 + COMBO_WINDOW_MS]);
    expect(kept.map((a) => a.chain)).toEqual([1, 2]);
    const broken = chainOf([T0, T0 + COMBO_WINDOW_MS + 1]);
    expect(broken.map((a) => a.chain)).toEqual([1, 1]);
  });

  it("measures the gap from the previous action, not from the start of the chain", () => {
    const scored = chainOf([T0, T0 + 100_000, T0 + 200_000, T0 + 300_000]);
    expect(scored.map((a) => a.chain)).toEqual([1, 2, 3, 4]);
  });

  it("restarts at 1 after a broken chain", () => {
    const scored = chainOf([T0, T0 + 1000, T0 + 2000, T0 + 500_000, T0 + 501_000]);
    expect(scored.map((a) => a.chain)).toEqual([1, 2, 3, 1, 2]);
    expect(scored[3].multiplier).toBe(1);
  });

  it("gives an action outside the combo chain 0, x1, no bonus - and it does not break the chain", () => {
    const rows = [
      printer(T0),
      row("digital_qr_linked", T0 + 60_000),
      printer(T0 + 100_000),
      row("admin_v1_task_created", T0 + 400_000),
      printer(T0 + 150_000),
    ];
    const scored = scoreRows(rows);
    const by = (label: string) => scored.filter((a) => a.label === label);
    expect(by("digitalni_qr")[0]).toMatchObject({ chain: 0, multiplier: 1, bonus: 0, xp: 10 });
    expect(by("novi_zadatak")[0]).toMatchObject({ chain: 0, multiplier: 1, bonus: 0, xp: 3 });
    expect(by("stampa").map((a) => a.chain)).toEqual([1, 2, 3]);
  });

  it("does not let the non-combo action join the gap", () => {
    // 0 s printer, 100 s digital QR, 200 s printer: the gap between printers is 200 s, so the chain breaks.
    const scored = scoreRows([printer(T0), row("digital_qr_linked", T0 + 100_000), printer(T0 + 200_000)]);
    expect(scored.filter((a) => a.label === "stampa").map((a) => a.chain)).toEqual([1, 1]);
  });

  it("caps the bonus of a Belgrade day at 200 and cuts the last bonus to what is left", () => {
    // Deliveries (30 XP) one second apart: the bonus grows 0, 0, 30, 30, 60, 60, 60 ... until the day has 200.
    const times = Array.from({ length: 12 }, (_, i) => T0 + i * 1000);
    const scored = scoreRows(times.map((at) => row("admin_order_delivery_completed", at)));
    expect(scored.map((a) => a.bonus)).toEqual([0, 0, 30, 30, 60, 60, 20, 0, 0, 0, 0, 0]);
    expect(scored.reduce((sum, a) => sum + a.bonus, 0)).toBe(COMBO_DAY_CAP);
    expect(scored[6]).toMatchObject({ multiplier: 3, base: 30, bonus: 20, xp: 50 });
    expect(scored[7]).toMatchObject({ multiplier: 3, bonus: 0, xp: 30 });
  });

  it("starts the next Belgrade day from zero", () => {
    // 23:59 Belgrade on the 13th (21:59 UTC), then 00:01 on the 14th (22:01 UTC): the chain goes on (gap 85 s), the day changes.
    const before = Array.from({ length: 8 }, (_, i) => Date.UTC(2026, 9, 13, 21, 59) + i * 5000);
    const after = Array.from({ length: 3 }, (_, i) => Date.UTC(2026, 9, 13, 22, 1) + i * 1000);
    const scored = scoreRows([...before, ...after].map((at) => row("admin_order_delivery_completed", at)));
    expect(scored.slice(0, 8).reduce((sum, a) => sum + a.bonus, 0)).toBe(COMBO_DAY_CAP);
    expect(scored.slice(8).map((a) => a.chain)).toEqual([9, 10, 11]);
    expect(scored.slice(8).map((a) => a.bonus)).toEqual([60, 60, 60]);
  });

  it("does not change its input", () => {
    const counted = countedRows([printer(T0), printer(T0 + 1000)]);
    const copy = JSON.parse(JSON.stringify(counted));
    applyCombo(counted);
    expect(counted).toEqual(copy);
  });
});

describe("comboNow", () => {
  it("is null for no actions", () => {
    expect(comboNow([], T0)).toBeNull();
  });

  it("describes a running chain and what is needed for the next multiplier", () => {
    const scored = chainOf([T0, T0 + 10_000]);
    expect(comboNow(scored, T0 + 20_000)).toEqual({ chain: 2, multiplier: 1, toNext: 1, lastAt: T0 + 10_000, expiresAt: T0 + 10_000 + COMBO_WINDOW_MS });
    expect(comboNow(chainOf([T0]), T0)).toMatchObject({ chain: 1, toNext: 2 });
  });

  it("counts toNext for every chain length and has none from x3", () => {
    const toNext = (n: number) => comboNow(chainOf(Array.from({ length: n }, (_, i) => T0 + i * 1000)), T0 + n * 1000)?.toNext;
    expect([1, 2, 3, 4, 5, 6].map(toNext)).toEqual([2, 1, 2, 1, null, null]);
  });

  it("still runs exactly 120 s after the last action and is gone 1 ms later", () => {
    const scored = chainOf([T0]);
    expect(comboNow(scored, T0 + COMBO_WINDOW_MS)).not.toBeNull();
    expect(comboNow(scored, T0 + COMBO_WINDOW_MS + 1)).toBeNull();
  });

  it("is not broken by an action that does not enter the combo", () => {
    const scored = scoreRows([printer(T0), printer(T0 + 10_000), row("digital_qr_linked", T0 + 20_000)]);
    expect(comboNow(scored, T0 + 30_000)).toMatchObject({ chain: 2, lastAt: T0 + 10_000 });
  });

  it("is null when only actions outside the combo are there", () => {
    expect(comboNow(scoreRows([row("digital_qr_linked", T0)]), T0)).toBeNull();
  });

  it("ignores an action from the future", () => {
    const scored = chainOf([T0, T0 + 10_000, T0 + 20_000]);
    expect(comboNow(scored, T0 + 15_000)).toMatchObject({ chain: 2, lastAt: T0 + 10_000 });
    expect(comboNow(scored, T0 - 1)).toBeNull();
  });

  it("does not change its input", () => {
    const scored: ScoredAction[] = chainOf([T0, T0 + 1000]);
    const copy = JSON.parse(JSON.stringify(scored));
    comboNow(scored, T0 + 5000);
    expect(scored).toEqual(copy);
  });
});
