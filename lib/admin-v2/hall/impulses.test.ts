import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "@/lib/belgrade-time";
import { HALL_PARTICLES, ambientRates, emitCount, impulseDelays, replayRates, scanImpulses } from "./impulses";
import { hallSeries } from "./timelapse";

// ADMIN v3 V3 — the scan particles: what the scene emits and when. TEST ids and
// invented numbers.

const map = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("scanImpulses", () => {
  test("a new scan of a location is an impulse of the difference", () => {
    expect(scanImpulses(map({ "test-loc-1": 4, "test-loc-2": 7 }), map({ "test-loc-1": 6, "test-loc-2": 7 }))).toEqual([{ locationId: "test-loc-1", count: 2 }]);
  });

  test("the first read is a state, not news", () => {
    expect(scanImpulses(null, map({ "test-loc-1": 40 }))).toEqual([]);
  });

  test("a drop (a new day) gives nothing", () => {
    expect(scanImpulses(map({ "test-loc-1": 40, "test-loc-2": 5 }), map({ "test-loc-1": 3, "test-loc-2": 5 }))).toEqual([]);
  });

  test("a location that was not there counts from 0; one that vanished gives nothing", () => {
    expect(scanImpulses(map({ "test-loc-1": 2 }), map({ "test-loc-3": 3 }))).toEqual([{ locationId: "test-loc-3", count: 3 }]);
  });

  test("sorted by count desc, then location id", () => {
    const impulses = scanImpulses(map({}), map({ "test-loc-b": 2, "test-loc-a": 2, "test-loc-c": 9 }));
    expect(impulses.map((impulse) => impulse.locationId)).toEqual(["test-loc-c", "test-loc-a", "test-loc-b"]);
  });

  test("counts are whole numbers", () => {
    expect(scanImpulses(map({ "test-loc-1": 1 }), map({ "test-loc-1": 3.9 }))).toEqual([{ locationId: "test-loc-1", count: 2 }]);
    expect(scanImpulses(map({ "test-loc-1": 1 }), map({ "test-loc-1": 1.5 }))).toEqual([]);
    expect(scanImpulses(map({}), map({ "test-loc-1": Number.NaN }))).toEqual([]);
  });
});

describe("impulseDelays", () => {
  test("one particle leaves at once", () => {
    expect(impulseDelays(1)).toEqual([0]);
  });

  test("the particles are spread evenly over 8 s, the first at 0 and all before 8", () => {
    expect(impulseDelays(4)).toEqual([0, 2, 4, 6]);
    for (const count of [2, 3, 5, 8, 12]) {
      const delays = impulseDelays(count);
      expect(delays).toHaveLength(count);
      expect(delays[0]).toBe(0);
      expect(Math.max(...delays)).toBeLessThan(HALL_PARTICLES.spreadS);
      expect([...delays].sort((a, b) => a - b)).toEqual(delays);
    }
  });

  test("at most 12 particles per stand", () => {
    expect(impulseDelays(12)).toHaveLength(12);
    expect(impulseDelays(13)).toHaveLength(12);
    expect(impulseDelays(500)).toHaveLength(HALL_PARTICLES.perStandMax);
    expect(impulseDelays(500)[1]).toBeCloseTo(8 / 12, 9);
  });

  test("a fraction is floored; nothing for 0, negative and NaN", () => {
    expect(impulseDelays(2.9)).toHaveLength(2);
    expect(impulseDelays(0)).toEqual([]);
    expect(impulseDelays(-3)).toEqual([]);
    expect(impulseDelays(Number.NaN)).toEqual([]);
  });
});

describe("ambientRates", () => {
  test("the busiest location gets exactly the ambient rate, the rest in proportion", () => {
    const rates = ambientRates(map({ "test-loc-1": 10, "test-loc-2": 5, "test-loc-3": 2 }));
    expect(rates.get("test-loc-1")).toBe(HALL_PARTICLES.ambientRate);
    expect(rates.get("test-loc-2")).toBeCloseTo(0.4, 9);
    expect(rates.get("test-loc-3")).toBeCloseTo(0.16, 9);
  });

  test("zeros (and bad values) are absent", () => {
    const rates = ambientRates(map({ "test-loc-1": 3, "test-loc-2": 0, "test-loc-3": -2, "test-loc-4": Number.NaN }));
    expect([...rates.keys()]).toEqual(["test-loc-1"]);
  });

  test("an empty or all-zero map is empty", () => {
    expect(ambientRates(map({})).size).toBe(0);
    expect(ambientRates(map({ "test-loc-1": 0 })).size).toBe(0);
  });
});

describe("replayRates", () => {
  const DATE = "2026-10-30";
  const start = belgradeLocalToEpoch(`${DATE}T08:00`)!;
  const stand = (standCode: string, mapLocationId: string, scans: number[]) => ({ standCode, mapLocationId, scans, uniquePerModel: scans });
  const series = hallSeries({
    at: start + 4 * 3_600_000,
    dateKey: DATE,
    hours: [8, 9, 10, 11],
    stands: [stand("T1", "test-loc-1", [10, 10, 0, 0]), stand("T2", "test-loc-2", [0, 5, 20, 10]), stand("T3", "test-loc-3", [0, 0, 0, 0])],
    unread: 0,
    capped: false,
  });

  test("in proportion to the scans of the hour t is in, against the busiest hour of the day", () => {
    const rates = replayRates(series, 1.5);
    // The busiest stand-hour of the day is 20 scans.
    expect(rates.get("test-loc-1")).toBeCloseTo((HALL_PARTICLES.replayRate * 10) / 20, 9);
    expect(rates.get("test-loc-2")).toBeCloseTo((HALL_PARTICLES.replayRate * 5) / 20, 9);
  });

  test("the busiest stand-hour gets exactly the replay rate", () => {
    expect(replayRates(series, 2.5).get("test-loc-2")).toBe(HALL_PARTICLES.replayRate);
  });

  test("zero rates are left out", () => {
    const rates = replayRates(series, 2.5);
    expect(rates.has("test-loc-1")).toBe(false);
    expect(rates.has("test-loc-3")).toBe(false);
  });

  test("a whole hour is the start of that hour", () => {
    expect(replayRates(series, 1).has("test-loc-2")).toBe(true);
    expect(replayRates(series, 1).has("test-loc-1")).toBe(true);
  });

  test("nothing at the start, at the end, past the end or on an empty series", () => {
    expect(replayRates(series, 0).size).toBe(0);
    expect(replayRates(series, -1).size).toBe(0);
    expect(replayRates(series, series.end).size).toBe(0);
    expect(replayRates(series, 99).size).toBe(0);
    expect(replayRates(hallSeries({ at: start, dateKey: DATE, hours: [], stands: [], unread: 0, capped: false }), 1).size).toBe(0);
  });
});

describe("emitCount", () => {
  test("whole particles now, the fraction is carried", () => {
    const first = emitCount(1.5, 0, 1);
    expect(first.count).toBe(1);
    expect(first.carry).toBeCloseTo(0.5, 9);
    const second = emitCount(1.5, first.carry, 1);
    expect(second.count).toBe(2);
    expect(second.carry).toBeCloseTo(0, 9);
  });

  test("over many frames the particles add up to the rate", () => {
    const rate = 0.8;
    const seconds = 100;
    const frame = 1 / 60;
    let carry = 0;
    let emitted = 0;
    for (let index = 0; index < seconds * 60; index += 1) {
      const step = emitCount(rate, carry, frame);
      emitted += step.count;
      carry = step.carry;
    }
    expect(Math.abs(emitted - rate * seconds)).toBeLessThanOrEqual(1);
    expect(carry).toBeGreaterThanOrEqual(0);
    expect(carry).toBeLessThan(1);
  });

  test("a slow rate emits nothing for a while, then one", () => {
    let carry = 0;
    const counts: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const step = emitCount(0.8, carry, 1);
      counts.push(step.count);
      carry = step.carry;
    }
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(3);
  });

  test("a long gap between frames never bursts and never piles up", () => {
    const step = emitCount(6, 0, 30);
    expect(step.count).toBe(HALL_PARTICLES.burstMax);
    expect(step.carry).toBeGreaterThanOrEqual(0);
    expect(step.carry).toBeLessThan(1);
  });

  test("bad input emits nothing and keeps a valid carry", () => {
    expect(emitCount(Number.NaN, 0.4, 1)).toEqual({ count: 0, carry: 0.4 });
    expect(emitCount(-1, 0.4, 1)).toEqual({ count: 0, carry: 0.4 });
    expect(emitCount(2, 0.4, -0.1)).toEqual({ count: 0, carry: 0.4 });
    expect(emitCount(2, 0.4, Number.NaN)).toEqual({ count: 0, carry: 0.4 });
    expect(emitCount(Number.NaN, Number.NaN, 1)).toEqual({ count: 0, carry: 0 });
    expect(emitCount(2, -3, 0.25)).toEqual({ count: 0, carry: 0.5 });
  });

  test("a zero rate or a zero frame emits nothing and keeps the carry", () => {
    expect(emitCount(0, 0.3, 1)).toEqual({ count: 0, carry: 0.3 });
    expect(emitCount(5, 0.3, 0)).toEqual({ count: 0, carry: 0.3 });
  });
});
