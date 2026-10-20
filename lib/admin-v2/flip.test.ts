import { describe, expect, it } from "vitest";
import { FLIP_ARMED_MS, FLIP_MAX_ITEMS, FLIP_MIN_DELTA, flipArmed, flipMoves, type FlipRect } from "./flip";

const rects = (entries: Record<string, [number, number]>) =>
  new Map<string, FlipRect>(Object.entries(entries).map(([key, [left, top]]) => [key, { left, top }]));

describe("flipMoves", () => {
  it("gives the offset from the old place for an item that changed place", () => {
    const { moved, entered } = flipMoves(rects({ a: [0, 100], b: [0, 140] }), rects({ a: [0, 0], b: [0, 40] }));
    expect(moved).toEqual([
      { key: "a", dx: 0, dy: 100 },
      { key: "b", dx: 0, dy: 100 },
    ]);
    expect(entered).toEqual([]);
  });

  it("covers a move sideways and a move up", () => {
    const { moved } = flipMoves(rects({ a: [10, 0] }), rects({ a: [250, -30] }));
    expect(moved).toEqual([{ key: "a", dx: -240, dy: 30 }]);
  });

  it("leaves out an item that moved less than the minimum", () => {
    const small = FLIP_MIN_DELTA / 2;
    const { moved } = flipMoves(rects({ a: [0, 0], b: [0, 40] }), rects({ a: [small, -small], b: [0, 40 + FLIP_MIN_DELTA] }));
    expect(moved).toEqual([{ key: "b", dx: 0, dy: -FLIP_MIN_DELTA }]);
  });

  it("lists a new item as entered, not moved", () => {
    const { moved, entered } = flipMoves(rects({ a: [0, 0] }), rects({ a: [0, 0], c: [0, 40] }));
    expect(moved).toEqual([]);
    expect(entered).toEqual(["c"]);
  });

  it("ignores an item that is gone", () => {
    const { moved, entered } = flipMoves(rects({ a: [0, 0], gone: [0, 40] }), rects({ a: [0, 0] }));
    expect(moved).toEqual([]);
    expect(entered).toEqual([]);
  });

  it("handles empty sets", () => {
    expect(flipMoves(rects({}), rects({}))).toEqual({ moved: [], entered: [] });
    expect(flipMoves(rects({ a: [0, 0] }), rects({}))).toEqual({ moved: [], entered: [] });
    expect(flipMoves(rects({}), rects({ a: [0, 0] }))).toEqual({ moved: [], entered: ["a"] });
  });

  it("keys items by any value, such as an element", () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const { moved } = flipMoves(new Map([[first, { left: 0, top: 0 }]]), new Map([[first, { left: 0, top: 50 }], [second, { left: 0, top: 0 }]]));
    expect(moved).toEqual([{ key: first, dx: 0, dy: -50 }]);
  });

  it("exposes a sensible limit", () => {
    expect(FLIP_MAX_ITEMS).toBe(80);
  });
});

describe("flipArmed", () => {
  it("a change of the rows shortly after the filter changed still belongs to it", () => {
    expect(flipArmed(1000, 1000)).toBe(true);
    expect(flipArmed(1000, 1000 + FLIP_ARMED_MS)).toBe(true);
  });

  it("later rows (a poll) and rows without a filter change do not", () => {
    expect(flipArmed(1000, 1001 + FLIP_ARMED_MS)).toBe(false);
    expect(flipArmed(null, 5000)).toBe(false);
  });
});
