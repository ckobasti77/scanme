import { describe, expect, it } from "vitest";
import { LEVELS_PER_RANK, levelOf, levelProgress, operatorView, rankOf, rankStartLevel, xpForLevel } from "./levels";
import { EMPTY_SNAPSHOT, foldSnapshot } from "./snapshot";
import type { ActivityRow } from "./types";

describe("xpForLevel", () => {
  it("is 50 x (n - 1) x n", () => {
    expect([1, 2, 3, 6, 11, 16, 21].map(xpForLevel)).toEqual([0, 100, 300, 1500, 5500, 12_000, 21_000]);
  });
});

describe("levelOf", () => {
  it("is exact on every boundary from level 1 to 60 (floating point)", () => {
    for (let n = 1; n <= 60; n++) {
      expect(levelOf(xpForLevel(n))).toBe(n);
      if (n >= 2) expect(levelOf(xpForLevel(n) - 1)).toBe(n - 1);
    }
  });

  it("is exact on the boundaries far beyond the table", () => {
    for (const n of [100, 1000, 10_000, 100_000]) {
      expect(levelOf(xpForLevel(n))).toBe(n);
      expect(levelOf(xpForLevel(n) - 1)).toBe(n - 1);
    }
  });

  it("gives the lowest level for zero, a negative, NaN and an infinite number", () => {
    for (const xp of [0, 1, 99, -1, -5000, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) expect(levelOf(xp)).toBe(1);
  });

  it("stays inside a level between two boundaries", () => {
    expect(levelOf(100)).toBe(2);
    expect(levelOf(299)).toBe(2);
    expect(levelOf(300)).toBe(3);
    expect(levelOf(299.5)).toBe(2);
  });
});

describe("rankOf and rankStartLevel", () => {
  it("spans five levels per rank and the last rank has no end", () => {
    expect(LEVELS_PER_RANK).toBe(5);
    const at = (levels: number[]) => levels.map(rankOf);
    expect(at([1, 5])).toEqual(["pripravnik", "pripravnik"]);
    expect(at([6, 10])).toEqual(["operater", "operater"]);
    expect(at([11, 15])).toEqual(["dispecer", "dispecer"]);
    expect(at([16, 20])).toEqual(["komandant", "komandant"]);
    expect(at([21, 22, 500])).toEqual(["legenda", "legenda", "legenda"]);
  });

  it("treats a level below 1 as the first", () => {
    expect(rankOf(0)).toBe("pripravnik");
    expect(rankOf(-3)).toBe("pripravnik");
  });

  it("starts the ranks at 1, 6, 11, 16, 21", () => {
    expect((["pripravnik", "operater", "dispecer", "komandant", "legenda"] as const).map(rankStartLevel)).toEqual([1, 6, 11, 16, 21]);
  });

  it("enters each rank at the XP of the table of the plan", () => {
    const entry = (xp: number) => rankOf(levelOf(xp));
    expect(entry(0)).toBe("pripravnik");
    expect(entry(1499)).toBe("pripravnik");
    expect(entry(1500)).toBe("operater");
    expect(entry(5499)).toBe("operater");
    expect(entry(5500)).toBe("dispecer");
    expect(entry(11_999)).toBe("dispecer");
    expect(entry(12_000)).toBe("komandant");
    expect(entry(20_999)).toBe("komandant");
    expect(entry(21_000)).toBe("legenda");
    expect([0, 1500, 5500, 12_000, 21_000].map((xp) => levelOf(xp))).toEqual([1, 6, 11, 16, 21]);
  });
});

describe("levelProgress", () => {
  it("measures the XP inside the level", () => {
    expect(levelProgress(0)).toEqual({ level: 1, rank: "pripravnik", into: 0, span: 100, share: 0 });
    expect(levelProgress(150)).toEqual({ level: 2, rank: "pripravnik", into: 50, span: 200, share: 0.25 });
    expect(levelProgress(1500)).toMatchObject({ level: 6, rank: "operater", into: 0, span: 600 });
  });

  it("is empty for a number that is not XP", () => {
    expect(levelProgress(Number.NaN)).toMatchObject({ level: 1, into: 0, share: 0 });
    expect(levelProgress(-40)).toMatchObject({ level: 1, into: 0, share: 0 });
  });

  it("keeps the share below 1 for every XP", () => {
    for (let xp = 0; xp < 3000; xp += 7) {
      const { share } = levelProgress(xp);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThan(1);
    }
  });
});

describe("operatorView", () => {
  const NOW = Date.UTC(2026, 9, 13, 10, 0);
  const printer = (id: string, at: number): ActivityRow => ({ id, action: "admin_order_sent_to_printer", actorKind: "admin", occurredAt: at, href: `/o/${id}` });

  it("is the first level for an empty snapshot", () => {
    expect(operatorView(EMPTY_SNAPSHOT, NOW)).toEqual({ level: 1, rank: "pripravnik", xp: 0, into: 0, span: 100, share: 0, todayXp: 0, since: null, complete: false });
  });

  it("carries the XP, today's XP, the first row and the completeness of the snapshot", () => {
    // Two printer rows today (10 XP each, x1) and one yesterday.
    const rows = [printer("a", NOW - 30 * 3_600_000), printer("b", NOW - 600_000), printer("c", NOW - 300_000)];
    const snapshot = foldSnapshot(null, rows, true);
    const view = operatorView(snapshot, NOW);
    expect(view).toMatchObject({ xp: 30, todayXp: 20, since: rows[0].occurredAt, complete: true, level: 1, rank: "pripravnik", into: 30, span: 100, share: 0.3 });
  });

  it("does not change the snapshot", () => {
    const snapshot = foldSnapshot(null, [printer("a", NOW - 1000)]);
    const copy = JSON.parse(JSON.stringify(snapshot));
    operatorView(snapshot, NOW);
    expect(snapshot).toEqual(copy);
  });
});
