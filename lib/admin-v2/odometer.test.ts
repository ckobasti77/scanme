import { describe, expect, it } from "vitest";
import { odometerColumns, odometerDirection } from "./odometer";

const changedOf = (from: string, to: string) => odometerColumns(from, to).map((column) => column.changed);

describe("odometerColumns", () => {
  it("aligns from the right when the number gains a place (99 -> 100)", () => {
    expect(odometerColumns("99", "100")).toEqual([
      { to: "1", from: null, changed: true },
      { to: "0", from: "9", changed: true },
      { to: "0", from: "9", changed: true },
    ]);
  });

  it("aligns from the right when the number loses a place (100 -> 99)", () => {
    expect(odometerColumns("100", "99")).toEqual([
      { to: "9", from: "0", changed: true },
      { to: "9", from: "0", changed: true },
    ]);
  });

  it("keeps still the digits that did not change", () => {
    expect(changedOf("179", "189")).toEqual([false, true, false]);
    expect(changedOf("5", "5")).toEqual([false]);
  });

  it("treats a thousands separator as a column of its own", () => {
    expect(odometerColumns("1.286", "1.287")).toEqual([
      { to: "1", from: "1", changed: false },
      { to: ".", from: ".", changed: false },
      { to: "2", from: "2", changed: false },
      { to: "8", from: "8", changed: false },
      { to: "7", from: "6", changed: true },
    ]);
  });

  it("keeps the suffix in place and rolls only the digit before it", () => {
    expect(changedOf("412+", "413+")).toEqual([false, false, true, false]);
  });

  it("changes no column for the same text", () => {
    expect(changedOf("1.286", "1.286").some(Boolean)).toBe(false);
    expect(changedOf("412+", "412+").some(Boolean)).toBe(false);
  });

  it("returns no column for an empty text", () => {
    expect(odometerColumns("12", "")).toEqual([]);
  });
});

describe("odometerDirection", () => {
  it("is up when the value grows and down when it falls", () => {
    expect(odometerDirection(99, 100)).toBe(1);
    expect(odometerDirection(100, 99)).toBe(-1);
  });

  it("is up for an equal value", () => {
    expect(odometerDirection(7, 7)).toBe(1);
  });
});
