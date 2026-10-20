import { describe, expect, test } from "vitest";
import { CHART_OTHER_COLOR, CHART_SLOTS, chartColor, entityColors, SEQ_STEPS, seqColor, seqInk, seqStep } from "./palette";

// ADMIN v2 X3 — colours of the analytics charts: a colour follows its entity, not its rank.

describe("chartColor", () => {
  test("is the CSS variable of the slot", () => {
    expect(chartColor(3)).toBe("var(--admin-chart-3)");
    expect(chartColor(1)).toBe("var(--admin-chart-1)");
    expect(CHART_SLOTS).toBe(8);
    expect(CHART_OTHER_COLOR).toBe("var(--admin-chart-other)");
  });
});

describe("entityColors", () => {
  test("the same entity gets the same colour whatever the order of the input", () => {
    const forward = entityColors(["TEST A", "TEST B", "TEST C"]);
    const backward = entityColors(["TEST C", "TEST B", "TEST A"]);
    const shuffled = entityColors(["TEST B", "TEST C", "TEST A"]);
    for (const key of ["TEST A", "TEST B", "TEST C"]) {
      expect(backward.get(key)).toEqual(forward.get(key));
      expect(shuffled.get(key)).toEqual(forward.get(key));
    }
  });

  test("duplicates do not shift any colour", () => {
    const clean = entityColors(["TEST A", "TEST B", "TEST C"]);
    const duplicated = entityColors(["TEST B", "TEST A", "TEST B", "TEST C", "TEST A"]);
    expect(duplicated.size).toBe(3);
    for (const key of clean.keys()) expect(duplicated.get(key)).toEqual(clean.get(key));
  });

  test("the first eight sorted keys get the slots 1 … 8 in order", () => {
    const keys = Array.from({ length: 8 }, (_, index) => `TEST ${index + 1}`);
    const colors = entityColors([...keys].reverse());
    keys.forEach((key, index) => {
      expect(colors.get(key)).toEqual({ slot: index + 1, color: `var(--admin-chart-${index + 1})` });
    });
  });

  test("the ninth and later share the neutral colour and have no slot", () => {
    const keys = Array.from({ length: 11 }, (_, index) => `TEST ${String(index + 1).padStart(2, "0")}`);
    const colors = entityColors(keys);
    expect(colors.size).toBe(11);
    expect(colors.get("TEST 08")?.slot).toBe(8);
    for (const key of ["TEST 09", "TEST 10", "TEST 11"]) {
      expect(colors.get(key)).toEqual({ slot: null, color: CHART_OTHER_COLOR });
    }
  });

  test("numeric parts are compared as numbers, so 2 comes before 10", () => {
    const colors = entityColors(["10", "9", "2"]);
    expect(colors.get("2")?.slot).toBe(1);
    expect(colors.get("9")?.slot).toBe(2);
    expect(colors.get("10")?.slot).toBe(3);
  });

  test("an empty list is an empty map", () => {
    expect(entityColors([]).size).toBe(0);
  });
});

describe("seqStep", () => {
  test("no value, a negative value or no scale is no step", () => {
    expect(seqStep(0, 10)).toBeNull();
    expect(seqStep(-3, 10)).toBeNull();
    expect(seqStep(5, 0)).toBeNull();
    expect(seqStep(5, -1)).toBeNull();
    expect(seqStep(0, 0)).toBeNull();
    expect(seqStep(Number.NaN, 10)).toBeNull();
  });

  test("the maximum is the darkest step", () => {
    expect(seqStep(10, 10)).toBe(700);
  });

  test("a value above the maximum is clamped to the darkest step", () => {
    expect(seqStep(25, 10)).toBe(700);
  });

  test("a very small value is still the lightest step", () => {
    expect(seqStep(0.001, 10)).toBe(100);
    expect(seqStep(1, 100)).toBe(100);
  });

  test("the scale is cut into seven equal parts of the maximum", () => {
    // 100 / 7 ≈ 14,29 per step.
    expect(seqStep(14, 100)).toBe(100);
    expect(seqStep(15, 100)).toBe(200);
    expect(seqStep(29, 100)).toBe(300);
    expect(seqStep(43, 100)).toBe(400);
    expect(seqStep(58, 100)).toBe(500);
    expect(seqStep(72, 100)).toBe(600);
    expect(seqStep(86, 100)).toBe(700);
  });

  test("never gets lighter as the value grows, over the whole range", () => {
    let previous = 0;
    for (let value = 0.25; value <= 12; value += 0.25) {
      const step = seqStep(value, 10);
      expect(step).not.toBeNull();
      expect(step!).toBeGreaterThanOrEqual(previous);
      previous = step!;
    }
    expect(previous).toBe(700);
  });

  test("uses every step of the scale", () => {
    const used = new Set<number | null>();
    for (let value = 1; value <= 100; value += 1) used.add(seqStep(value, 100));
    expect([...used].sort()).toEqual([...SEQ_STEPS].sort());
  });
});

describe("seqColor / seqInk", () => {
  test("are the CSS variables of the step", () => {
    expect(seqColor(100)).toBe("var(--admin-seq-100)");
    expect(seqColor(700)).toBe("var(--admin-seq-700)");
    expect(seqInk(300)).toBe("var(--admin-seq-on-300)");
    expect(seqInk(700)).toBe("var(--admin-seq-on-700)");
  });

  test("the steps are 100 … 700", () => {
    expect([...SEQ_STEPS]).toEqual([100, 200, 300, 400, 500, 600, 700]);
  });
});
