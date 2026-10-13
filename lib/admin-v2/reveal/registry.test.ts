import { describe, expect, test } from "vitest";
import { ADMIN_REVEAL } from "@/lib/admin-v2/motion";
import {
  DRAW_KINDS,
  DRAW_REGISTRY,
  REVEAL_KINDS,
  REVEAL_REGISTRY,
  countFrame,
  fitStagger,
  groupSchedule,
  isCountable,
  isDrawKind,
  isRevealKind,
  revealBudget,
  revealEnd,
  revealRowsMax,
  revealSchedule,
  waveDelays,
  type RevealItem,
} from "./registry";

// ADMIN v3 V1 — the registry and the schedule of the reveal engine: every kind
// has a choreography, and whatever the page holds and wherever it stands, the
// entrance ends inside the budget of the page (900 ms, 675 ms on a phone,
// 360 ms on a return).

const SCREEN = { width: 1160, height: 840 };
const PHONE = { width: 390, height: 780 };
const ALL = [...REVEAL_KINDS, ...DRAW_KINDS];

describe("the registry", () => {
  test("every kind of node has a choreography that only moves transform, opacity and clip-path", () => {
    for (const kind of REVEAL_KINDS) {
      const choreography = REVEAL_REGISTRY[kind];
      expect(choreography.duration).toBeGreaterThan(0);
      expect(choreography.duration).toBeLessThanOrEqual(ADMIN_REVEAL.budget);
      expect(choreography.ease).toBeTruthy();
      expect(Object.keys(choreography.from).length).toBeGreaterThan(0);
      for (const property of choreography.clear.split(",")) expect(["opacity", "transform", "clipPath"]).toContain(property);
    }
    for (const kind of DRAW_KINDS) expect(DRAW_REGISTRY[kind].duration).toBeGreaterThan(0);
    expect(REVEAL_REGISTRY.kpi.from).toEqual({ clipRight: 100 });
    expect(REVEAL_REGISTRY.title.from).toEqual({ yPercent: 100 });
  });

  test("an unknown value of the attribute is not a kind (`off` keeps a panel still)", () => {
    expect(isRevealKind("card")).toBe(true);
    expect(isRevealKind("off")).toBe(false);
    expect(isRevealKind(null)).toBe(false);
    expect(isDrawKind("funnel")).toBe(true);
    expect(isDrawKind("pie")).toBe(false);
  });
});

describe("the schedule of an entrance", () => {
  const grid = (viewport: { width: number; height: number }): RevealItem[] => {
    const items: RevealItem[] = [];
    for (const kind of ALL) {
      for (let y = -0.2; y <= 1.2; y += 0.1) {
        for (let x = -0.2; x <= 1.2; x += 0.2) items.push({ kind, top: y * viewport.height, left: x * viewport.width });
      }
    }
    return items;
  };

  test("every kind at every place ends within 900 ms and starts at 580 ms at the latest", () => {
    const slots = revealSchedule(grid(SCREEN), SCREEN);
    expect(revealBudget()).toBe(0.9);
    expect(revealEnd(slots)).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(Math.max(...slots.map((slot) => slot.start))).toBeCloseTo(0.58, 10);
    for (const slot of slots) {
      expect(slot.start).toBeGreaterThanOrEqual(0);
      // Whatever starts last still has at least 320 ms to arrive.
      expect(slot.duration).toBeGreaterThanOrEqual(0.24 - 1e-9);
    }
  });

  test("a phone is shorter: 675 ms, no sweep from the left", () => {
    const slots = revealSchedule(grid(PHONE), PHONE, { phone: true });
    expect(revealBudget({ phone: true })).toBeCloseTo(0.675, 10);
    expect(revealEnd(slots)).toBeLessThanOrEqual(0.675 + 1e-9);
    const [left, right] = revealSchedule([{ kind: "card", top: 200, left: 0 }, { kind: "card", top: 200, left: 300 }], PHONE, { phone: true });
    expect(left.start).toBe(right.start);
  });

  test("the scan goes from the top: a higher node never starts after a lower one, and the left one first in a row", () => {
    const column = [0, 60, 120, 400, 800].map((top) => ({ kind: "card" as const, top, left: 40 }));
    const starts = revealSchedule(column, SCREEN).map((slot) => slot.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBeLessThan(starts[4]);
    const [first, second] = revealSchedule([{ kind: "kpi", top: 100, left: 0 }, { kind: "kpi", top: 100, left: 600 }], SCREEN);
    expect(first.start).toBeLessThan(second.start);
  });

  test("twelve rows of 52 px cascade about 30 ms apart; the first one starts early", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ kind: "rows" as const, top: 170 + index * 52, left: 24 }));
    const slots = revealSchedule(rows, SCREEN);
    expect(slots[0].start).toBeLessThan(0.12);
    const gaps = slots.slice(1).map((slot, index) => slot.start - slots[index].start);
    for (const gap of gaps) expect(gap).toBeCloseTo((0.5 * 52) / SCREEN.height, 10);
    expect(revealEnd(slots)).toBeLessThanOrEqual(0.9);
  });

  test("only the first 12 rows of a list enter one by one (8 on a phone)", () => {
    expect(revealRowsMax()).toBe(12);
    expect(revealRowsMax(true)).toBe(8);
  });

  test("a return is short: at most 360 ms, a title in 320 ms, the rest a fade", () => {
    const slots = revealSchedule(grid(SCREEN), SCREEN, { mode: "short" });
    expect(revealBudget({ mode: "short" })).toBe(0.36);
    expect(revealEnd(slots)).toBeLessThanOrEqual(0.36 + 1e-9);
    const [title, card] = revealSchedule([{ kind: "title", top: 0, left: 0 }, { kind: "card", top: 0, left: 0 }], SCREEN, { mode: "short" });
    expect(title).toEqual({ start: 0, duration: 0.32 });
    expect(card).toEqual({ start: 0, duration: 0.18 });
  });

  test("a group revealed on scroll enters 60 ms apart and is done within 500 ms", () => {
    const six = groupSchedule(["card", "card", "chart", "rows", "kpi", "card"]);
    expect(six[1].start - six[0].start).toBeLessThanOrEqual(0.06 + 1e-9);
    expect(revealEnd(six)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(groupSchedule(["card"])).toEqual([{ start: 0, duration: 0.4 }]);
    expect(revealEnd(groupSchedule(Array.from({ length: 30 }, () => "bars" as const)))).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(revealEnd(groupSchedule(["card", "card", "card"], { phone: true }))).toBeLessThanOrEqual(0.375 + 1e-9);
  });
});

describe("staggered marks", () => {
  test("bars keep 450 ms and 30 ms between them while there is room", () => {
    expect(fitStagger(5, 0.45, 0.03, 0.8)).toEqual({ duration: 0.45, each: 0.03 });
  });

  test("with little room the stagger and the duration give way: the last mark ends in time", () => {
    for (const [count, available] of [[8, 0.32], [40, 0.32], [3, 0.5], [200, 0.4]] as const) {
      const fitted = fitStagger(count, 0.45, 0.03, available);
      expect(fitted.duration + fitted.each * (count - 1)).toBeLessThanOrEqual(available + 1e-9);
      expect(fitted.duration).toBeGreaterThan(0);
      expect(fitted.each).toBeGreaterThanOrEqual(0);
    }
    expect(fitStagger(1, 0.45, 0.03, 0.2)).toEqual({ duration: 0.2, each: 0 });
  });
});

describe("the wave of a matrix", () => {
  const cells = Array.from({ length: 3 * 12 }, (_, index) => ({ row: Math.floor(index / 12), col: index % 12 }));

  test("it starts at the peak and spreads by the Chebyshev distance", () => {
    const { delays, duration } = waveDelays(cells, { row: 1, col: 5 });
    expect(duration).toBe(0.24);
    expect(delays[1 * 12 + 5]).toBe(0);
    expect(Math.min(...delays)).toBe(0);
    // A diagonal neighbour is as far as a direct one.
    expect(delays[0 * 12 + 4]).toBeCloseTo(delays[1 * 12 + 4], 10);
    expect(delays[1 * 12 + 4]).toBeCloseTo(0.018, 10);
    expect(delays[1 * 12 + 7]).toBeCloseTo(0.036, 10);
  });

  test("the whole wave lasts at most 500 ms, also for a large matrix and a short budget", () => {
    const large = Array.from({ length: 7 * 24 }, (_, index) => ({ row: Math.floor(index / 24), col: index % 24 }));
    for (const total of [undefined, 0.32, 0.9]) {
      const { delays, duration } = waveDelays(large, { row: 0, col: 0 }, { total });
      expect(Math.max(...delays) + duration).toBeLessThanOrEqual(Math.min(total ?? 0.5, 0.5) + 1e-9);
    }
    const phone = waveDelays(large, { row: 3, col: 12 }, { phone: true });
    expect(Math.max(...phone.delays) + phone.duration).toBeLessThanOrEqual(0.375 + 1e-9);
  });

  test("without a peak it starts at the first cell; an empty matrix gives nothing", () => {
    expect(waveDelays(cells, null).delays[0]).toBe(0);
    expect(waveDelays([], null).delays).toEqual([]);
  });
});

describe("counting from zero", () => {
  test("the number counts in its own format", () => {
    expect(countFrame("412", 0)).toBe("0");
    expect(countFrame("412", 0.5)).toBe("206");
    expect(countFrame("1.234", 0.5)).toBe("617");
    expect(countFrame("12.500", 0.5)).toBe("6.250");
    expect(countFrame("1.234.567", 0.999)).toBe("1.233.332");
    expect(countFrame("12 %", 0.5)).toBe("6 %");
    expect(countFrame("4,5", 0.5)).toBe("2,3");
    expect(countFrame("4,50", 0)).toBe("0,00");
    expect(countFrame("412+", 0.25)).toBe("103+");
    expect(countFrame("12.500 RSD", 0.1)).toBe("1.250 RSD");
    expect(countFrame("12 500", 0.5)).toBe("6 250");
  });

  test("the end is exactly the final text", () => {
    for (const text of ["412", "1.234", "12 %", "4,5", "412+", "0", "3/12", "bez broja"]) {
      expect(countFrame(text, 1)).toBe(text);
      expect(countFrame(text, 1.4)).toBe(text);
    }
  });

  test("a text with two numbers or with none is not touched", () => {
    for (const text of ["3/12", "1 h 22 min", "Dan 3 / 3", "13. 10. 2026.", "09:30", "—", ""]) {
      expect(countFrame(text, 0.3)).toBe(text);
      expect(isCountable(text)).toBe(false);
    }
    expect(isCountable("412+")).toBe(true);
    expect(isCountable("12 %")).toBe(true);
  });

  test("it never goes above the final value or below zero", () => {
    for (let step = 0; step <= 20; step += 1) {
      const value = Number(countFrame("940", step / 20));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(940);
    }
    expect(countFrame("940", -1)).toBe("0");
    expect(countFrame("940", Number.NaN)).toBe("940");
  });
});
