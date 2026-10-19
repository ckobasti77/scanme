import { describe, expect, test } from "vitest";
import { SYSTEMS } from "./catalog";
import { isLastStep, stepAt, stepStart, TOUR_SECONDS, TOUR_STEPS } from "./tour";

describe("vođena tura", () => {
  test("ukupno oko 60 s", () => {
    expect(TOUR_SECONDS).toBeGreaterThanOrEqual(57);
    expect(TOUR_SECONDS).toBeLessThanOrEqual(63);
  });

  test("uvod, deset sistema redom iz kataloga, pa rasklopljen kraj", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["uvod", ...SYSTEMS.map((s) => s.id), "kraj"]);
    expect(TOUR_STEPS[0]).toMatchObject({ group: null, explode: 0 });
    expect(TOUR_STEPS.at(-1)).toMatchObject({ group: null, explode: 1 });
  });

  test("svaki sistem tačno jednom, sa izolovanom grupom", () => {
    const groups = TOUR_STEPS.map((s) => s.group).filter((g) => g !== null);
    expect(groups).toEqual(SYSTEMS.map((s) => s.id));
    for (const s of TOUR_STEPS) if (s.group) expect(s.id).toBe(s.group);
  });

  test("svaki korak ima trajanje i rasklapanje u [0, 1]", () => {
    for (const s of TOUR_STEPS) {
      expect(s.seconds).toBeGreaterThanOrEqual(3);
      expect(s.explode).toBeGreaterThanOrEqual(0);
      expect(s.explode).toBeLessThanOrEqual(1);
    }
  });

  test("stepAt na granicama koraka", () => {
    expect(stepAt(-1)).toBe(0);
    expect(stepAt(0)).toBe(0);
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      const t = stepStart(i);
      expect(stepAt(t - 0.001)).toBe(i - 1);
      expect(stepAt(t)).toBe(i);
    }
    expect(stepAt(TOUR_SECONDS - 0.001)).toBe(TOUR_STEPS.length - 1);
    expect(stepAt(TOUR_SECONDS)).toBe(-1);
  });

  test("početak koraka je zbir prethodnih trajanja", () => {
    let t = 0;
    TOUR_STEPS.forEach((s, i) => {
      expect(stepStart(i)).toBeCloseTo(t, 9);
      t += s.seconds;
    });
    expect(isLastStep(TOUR_STEPS.length - 1)).toBe(true);
    expect(isLastStep(0)).toBe(false);
  });
});
