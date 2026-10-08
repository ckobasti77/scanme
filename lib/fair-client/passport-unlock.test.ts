import { describe, expect, it } from "vitest";
import {
  PASSPORT_RIM_LAP_MS,
  PASSPORT_RIM_TAIL_DEG,
  anchorRim,
  createRimState,
  devFavoriteResult,
  drainProgress,
  favoriteLeaders,
  focusCardId,
  litCellCount,
  nextTickIndex,
  passportDotCounts,
  rimFrame,
  sealCenterSize,
} from "./passport-unlock";

describe("rimFrame", () => {
  it("idles one full lap every 2.4 s from its offset", () => {
    const state = createRimState(1000, 30);
    expect(rimFrame(state, 0, false, 1000).tail).toBe(30);
    expect(rimFrame(state, 0, false, 1000 + PASSPORT_RIM_LAP_MS / 4).tail).toBeCloseTo(120);
    expect(rimFrame(state, 0, false, 1000 + PASSPORT_RIM_LAP_MS).tail).toBeCloseTo(30);
  });

  it("starts the fill exactly where the comet is and lets the comet lead", () => {
    const state = createRimState(0, 0);
    const before = rimFrame(state, 0, false, 600).tail;
    anchorRim(state, 600);
    const pressed = rimFrame(state, 0, true, 600);
    expect(pressed.tail).toBeCloseTo(before);
    expect(pressed.start).toBeCloseTo((before + PASSPORT_RIM_TAIL_DEG) % 360);
    const half = rimFrame(state, 0.5, true, 1250);
    expect(half.tail).toBeCloseTo((before + 180) % 360);
    expect(half.start).toBeCloseTo(pressed.start);
    expect(half.fill).toBe(180);
    expect(half.body).toBe(1);
  });

  it("returns to idling from the anchor once fully drained", () => {
    const state = createRimState(0, 10);
    anchorRim(state, 0);
    rimFrame(state, 0.3, true, 100);
    rimFrame(state, 0, false, 900);
    expect(state.anchor).toBeNull();
    expect(rimFrame(state, 0, false, 900).tail).toBeCloseTo(10);
  });
});

describe("cells and drain", () => {
  it("ticks once per cell boundary", () => {
    expect(nextTickIndex(0)).toBe(1);
    expect(nextTickIndex(0.05)).toBe(1);
    expect(nextTickIndex(0.5)).toBe(6);
    expect(nextTickIndex(1)).toBe(10);
  });

  it("counts lit cells", () => {
    expect(litCellCount(0)).toBe(0);
    expect(litCellCount(0.1)).toBe(1);
    expect(litCellCount(0.55)).toBe(5);
    expect(litCellCount(1)).toBe(10);
  });

  it("drains with an ease-out curve", () => {
    expect(drainProgress(0.6, 0)).toBe(0.6);
    expect(drainProgress(0.6, 0.5)).toBeCloseTo(0.075);
    expect(drainProgress(0.6, 1)).toBe(0);
  });
});

describe("focusCardId", () => {
  const models = [
    { eventModelId: "a", slug: "ev3" },
    { eventModelId: "b", slug: "elight" },
    { eventModelId: "c", slug: "ewind" },
  ];

  it("prefers an explicit choice, then the deep link, then the first ready card", () => {
    const ready = new Set(["b", "c"]);
    expect(focusCardId(models, ready, "ewind", "b")).toBe("b");
    expect(focusCardId(models, ready, "ewind")).toBe("c");
    expect(focusCardId(models, ready, undefined)).toBe("b");
    expect(focusCardId(models, ready, "ev3")).toBe("b");
  });

  it("ignores non-ready cards", () => {
    expect(focusCardId(models, new Set(), "ewind", "a")).toBeNull();
  });
});

describe("passportDotCounts", () => {
  it("fills only unlocked stamps and keeps the rest waiting", () => {
    expect(passportDotCounts(["a", "b", "c"], ["c"])).toEqual({ filled: 2, pending: 1 });
    expect(passportDotCounts(["a"], ["x"])).toEqual({ filled: 1, pending: 0 });
    expect(passportDotCounts([], [])).toEqual({ filled: 0, pending: 0 });
  });
});

describe("sealCenterSize", () => {
  it("shrinks long brand names", () => {
    expect(sealCenterSize("JMEV")).toBe(36);
    expect(sealCenterSize("Foton")).toBe(31);
    expect(sealCenterSize("Toyota")).toBe(27);
    expect(sealCenterSize("Mercedes-Benz")).toBe(21);
  });
});

describe("favorite results", () => {
  it("crowns the highest share and shares ties", () => {
    expect(favoriteLeaders({ state: "waiting_for_minimum" })).toEqual([]);
    expect(favoriteLeaders({ state: "public", options: [{ eventModelId: "a", percentage: 40 }, { eventModelId: "b", percentage: 60 }] })).toEqual(["b"]);
    expect(favoriteLeaders({ state: "public", options: [{ eventModelId: "a", percentage: 50 }, { eventModelId: "b", percentage: 50 }] })).toEqual(["a", "b"]);
  });

  it("builds a DEV fixture that sums to 100 with the choice in front", () => {
    const result = devFavoriteResult(["a", "b", "c"], "b", "public");
    expect(result.state).toBe("public");
    if (result.state !== "public") return;
    expect(result.options.map((option) => option.eventModelId)).toEqual(["a", "b", "c"]);
    expect(result.options.reduce((sum, option) => sum + option.percentage, 0)).toBe(100);
    expect(favoriteLeaders(result)).toEqual(["b"]);
    expect(devFavoriteResult(["a"], "a", "below")).toEqual({ state: "waiting_for_minimum" });
  });
});
