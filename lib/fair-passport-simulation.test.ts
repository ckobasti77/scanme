import { describe, expect, it } from "vitest";
import {
  FAIR_PASSPORT_SIM_BRANDS,
  buildFairPassportSimulation,
  parseFairPassportSim,
  serializeFairPassportSim,
} from "./fair-passport-simulation";
import { fairBrandVector } from "./fair-brand-logo";

describe("fair passport simulation cookie", () => {
  it("round-trips a choice", () => {
    for (const config of [
      { brands: "all", models: "random", state: "mixed" },
      { brands: "test", models: 11, state: "new" },
      { brands: 3, models: 2, state: "start" },
    ] as const) {
      expect(parseFairPassportSim(serializeFairPassportSim(config))).toEqual(config);
    }
  });

  it("rejects anything else", () => {
    for (const value of [undefined, "", "all", "0.2.start", "99.2.start", "all.7.start", "all.2.done", "all.2.start.x"]) {
      expect(parseFairPassportSim(value)).toBeNull();
    }
  });
});

describe("buildFairPassportSimulation", () => {
  it("lists every car brand of the fair with a vector logo except SWM", () => {
    const sim = buildFairPassportSimulation({ brands: "all", models: 2, state: "start" });
    expect(sim.catalog).toHaveLength(FAIR_PASSPORT_SIM_BRANDS.length);
    expect(sim.catalog.filter((entry) => !fairBrandVector(entry.brandName)).map((entry) => entry.brandName)).toEqual(["SWM"]);
    expect(new Set(sim.catalog.flatMap((entry) => entry.models.map((model) => model.eventModelId))).size).toBe(FAIR_PASSPORT_SIM_BRANDS.length * 2);
  });

  it("adds the long-name and raster-logo test brands", () => {
    const sim = buildFairPassportSimulation({ brands: "test", models: 6, state: "start" });
    expect(sim.catalog.at(-1)?.brandLogoUrl).toBeTruthy();
    expect(sim.catalog.at(-2)?.brandName.length).toBeGreaterThan(20);
  });

  it("keeps random model counts between 1 and 11 and stable", () => {
    const a = buildFairPassportSimulation({ brands: "all", models: "random", state: "start" });
    const b = buildFairPassportSimulation({ brands: "all", models: "random", state: "start" });
    const counts = a.catalog.map((entry) => entry.models.length);
    expect(counts).toEqual(b.catalog.map((entry) => entry.models.length));
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts)).toBeLessThanOrEqual(11);
  });

  it("builds each state from stamped and stuck stamps", () => {
    const of = (state: "start" | "partial" | "new" | "complete") => {
      const sim = buildFairPassportSimulation({ brands: 1, models: 6, state });
      return { progress: sim.progress[0], stuck: sim.stuck[sim.catalog[0].passportId] };
    };
    expect(of("start").progress.stampedCount).toBe(0);
    expect(of("partial").progress).toMatchObject({ stampedCount: 3, completed: false });
    expect(of("partial").stuck).toHaveLength(3);
    expect(of("new").progress.stampedCount).toBe(3);
    expect(of("new").stuck).toHaveLength(1);
    expect(of("complete")).toMatchObject({ progress: { stampedCount: 6, completed: true } });
    expect(of("complete").stuck).toHaveLength(6);
  });

  it("mixes states across brands and separates storage per choice", () => {
    const sim = buildFairPassportSimulation({ brands: 4, models: 6, state: "mixed" });
    expect(sim.progress.map((row) => row.stampedCount)).toEqual([3, 3, 6, 0]);
    expect(sim.eventId).not.toBe(buildFairPassportSimulation({ brands: 4, models: 6, state: "new" }).eventId);
  });
});
