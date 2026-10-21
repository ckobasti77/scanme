// ScanMe Menu V1 (K23) — table occupancy is an optional module: without it a
// table is neutral (a dash), never "free".

import { describe, expect, test } from "vitest";
import { OCCUPANCY_STATES, isOccupancyState, occupancyView, type OccupancyState } from "./occupancy";

describe("OCCUPANCY_STATES", () => {
  test("are exactly free, occupied, reserved and out of service", () => {
    expect([...OCCUPANCY_STATES]).toEqual(["free", "occupied", "reserved", "out_of_service"]);
  });
});

describe("isOccupancyState", () => {
  test("accepts every state", () => {
    for (const state of OCCUPANCY_STATES) expect(isOccupancyState(state)).toBe(true);
  });

  test("refuses anything else", () => {
    for (const value of ["neutral", "FREE", "", " free", "busy", null, undefined, 0, 1, {}, [], ["free"], true]) {
      expect(isOccupancyState(value)).toBe(false);
    }
  });
});

describe("occupancyView", () => {
  const unmarked: (OccupancyState | null | undefined)[] = [null, undefined];

  test("without the module a table is ALWAYS neutral, whatever rows exist", () => {
    for (const state of OCCUPANCY_STATES) expect(occupancyView(false, state)).toBe("neutral");
    for (const state of unmarked) expect(occupancyView(false, state)).toBe("neutral");
  });

  test("without the module a table is never shown as free", () => {
    expect(occupancyView(false, "free")).not.toBe("free");
  });

  test("with the module an unmarked table is neutral", () => {
    for (const state of unmarked) expect(occupancyView(true, state)).toBe("neutral");
  });

  test("with the module a marked table shows its state", () => {
    for (const state of OCCUPANCY_STATES) expect(occupancyView(true, state)).toBe(state);
  });
});
