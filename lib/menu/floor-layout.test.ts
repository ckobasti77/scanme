import { describe, expect, test } from "vitest";
import {
  FLOOR_COLUMNS,
  FLOOR_MAX_ROWS,
  FLOOR_MIN_ROWS,
  autoArrange,
  clampLayout,
  compareLabels,
  defaultLayoutSize,
  dropAt,
  findFreeSpot,
  isValidLayout,
  moveStep,
  overlaps,
  placeLayouts,
  resizeStep,
  rowsNeeded,
  sameLayout,
  toggleShape,
  type FloorItem,
  type FloorLayout,
} from "./floor-layout";

const at = (x: number, y: number, w = 3, h = 2, shape: FloorLayout["shape"] = "rect"): FloorLayout => ({
  x,
  y,
  w,
  h,
  shape,
});

describe("isValidLayout / clampLayout", () => {
  test("whole cells inside the grid, size 1..8", () => {
    expect(isValidLayout(at(0, 0))).toBe(true);
    expect(isValidLayout(at(FLOOR_COLUMNS - 3, FLOOR_MAX_ROWS - 2))).toBe(true);
    expect(isValidLayout(at(FLOOR_COLUMNS - 2, 0))).toBe(false);
    expect(isValidLayout(at(-1, 0))).toBe(false);
    expect(isValidLayout(at(0, FLOOR_MAX_ROWS - 1))).toBe(false);
    expect(isValidLayout(at(0.5, 0))).toBe(false);
    expect(isValidLayout(at(0, 0, 0, 2))).toBe(false);
    expect(isValidLayout(at(0, 0, 9, 2))).toBe(false);
    expect(isValidLayout({ ...at(0, 0), shape: "triangle" as never })).toBe(false);
  });

  test("clampLayout rounds and pushes inside", () => {
    expect(clampLayout(at(30.4, -2, 3.6, 0))).toEqual({ x: FLOOR_COLUMNS - 4, y: 0, w: 4, h: 1, shape: "rect" });
    expect(isValidLayout(clampLayout(at(99, 999, 20, 20, "round")))).toBe(true);
  });
});

describe("overlaps and free spots", () => {
  test("touching edges do not overlap", () => {
    expect(overlaps(at(0, 0), at(3, 0))).toBe(false);
    expect(overlaps(at(0, 0), at(2, 1))).toBe(true);
    expect(sameLayout(at(1, 1), at(1, 1))).toBe(true);
    expect(sameLayout(at(1, 1), null)).toBe(false);
    expect(sameLayout(null, null)).toBe(true);
  });

  test("findFreeSpot keeps a gap first, then packs tight", () => {
    expect(findFreeSpot([], { w: 3, h: 2 })).toEqual({ x: 0, y: 0 });
    // With one table at the origin the gap pushes the next one a cell away.
    expect(findFreeSpot([at(0, 0)], { w: 3, h: 2 })).toEqual({ x: 4, y: 0 });
  });

  test("placeLayouts keeps stored layouts and places the rest in order without overlap", () => {
    const items: FloorItem[] = [
      { id: "b", kind: "table", order: 2, layout: null },
      { id: "a", kind: "table", order: 1, layout: at(0, 0) },
      { id: "c", kind: "other", order: 3, layout: null },
      { id: "bad", kind: "room", order: 4, layout: at(23, 0) },
    ];
    const placed = placeLayouts(items);
    expect(placed.get("a")).toEqual(at(0, 0));
    const all = [...placed.values()];
    expect(all.every(isValidLayout)).toBe(true);
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) expect(overlaps(all[i], all[j])).toBe(false);
    }
    expect(placed.get("c")?.w).toBe(defaultLayoutSize("other").w);
    // Deterministic.
    expect([...placeLayouts(items)]).toEqual([...placed]);
  });

  test("autoArrange ignores stored layouts", () => {
    const items: FloorItem[] = [
      { id: "a", kind: "table", order: 1, layout: at(20, 30) },
      { id: "b", kind: "table", order: 2, layout: at(0, 0) },
    ];
    const arranged = autoArrange(items);
    expect(arranged.get("a")).toEqual(at(0, 0));
    expect(arranged.get("b")).toEqual(at(4, 0));
  });

  test("rowsNeeded has a floor and follows the content", () => {
    expect(rowsNeeded([])).toBe(FLOOR_MIN_ROWS);
    expect(rowsNeeded([at(0, 10)])).toBe(13);
  });
});

describe("keyboard and pointer steps", () => {
  test("moveStep moves one cell and jumps over a neighbour", () => {
    expect(moveStep(at(0, 0), "right", [])).toEqual(at(1, 0));
    expect(moveStep(at(0, 0), "right", [at(3, 0)])).toEqual(at(6, 0));
    expect(moveStep(at(0, 0), "left", [])).toBeNull();
    expect(moveStep(at(0, 0), "up", [])).toBeNull();
    expect(moveStep(at(FLOOR_COLUMNS - 3, 0), "right", [])).toBeNull();
    expect(moveStep(at(0, 0), "down", [at(0, 2, 3, 2)])).toEqual(at(0, 4));
  });

  test("resizeStep grows right/down and shrinks left/up within bounds", () => {
    expect(resizeStep(at(0, 0), "right", [])).toEqual(at(0, 0, 4, 2));
    expect(resizeStep(at(0, 0), "up", [])).toEqual(at(0, 0, 3, 1));
    expect(resizeStep(at(0, 0, 1, 1), "left", [])).toBeNull();
    expect(resizeStep(at(0, 0, 8, 2), "right", [])).toBeNull();
    expect(resizeStep(at(0, 0), "right", [at(3, 0)])).toBeNull();
  });

  test("dropAt rounds the delta and refuses taken or outside cells", () => {
    expect(dropAt(at(0, 0), 2.4, 1.6, [])).toEqual(at(2, 2));
    expect(dropAt(at(0, 0), -1, 0, [])).toBeNull();
    expect(dropAt(at(0, 0), 3, 0, [at(4, 0)])).toBeNull();
  });

  test("toggleShape switches rect and round", () => {
    expect(toggleShape(at(0, 0)).shape).toBe("round");
    expect(toggleShape(at(0, 0, 3, 2, "round")).shape).toBe("rect");
  });
});

test("compareLabels sorts numbers naturally", () => {
  expect(["Sto 10", "Sto 2", "Šank", "Sto 1"].sort(compareLabels)).toEqual(["Sto 1", "Sto 2", "Sto 10", "Šank"]);
});
