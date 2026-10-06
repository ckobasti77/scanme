import { describe, expect, test } from "vitest";
import { compareSortValues, nextSortState, sortRows } from "./table-sort";

describe("admin table sort (A1)", () => {
  test("header click cycles rastuće → opadajuće → off; another column restarts", () => {
    const first = nextSortState(null, "naziv");
    expect(first).toEqual({ columnId: "naziv", direction: "asc" });
    const second = nextSortState(first, "naziv");
    expect(second).toEqual({ columnId: "naziv", direction: "desc" });
    expect(nextSortState(second, "naziv")).toBeNull();
    expect(nextSortState(second, "datum")).toEqual({ columnId: "datum", direction: "asc" });
  });

  test("Serbian Latin collation: č, ć, đ, š, ž sort after their base letter", () => {
    const names = ["Žika", "Zoran", "Šabac", "Sava", "Đorđe", "Dragan", "Ćuprija", "Čačak", "Cvetko"];
    expect(sortRows(names, (name) => name, "asc")).toEqual(["Cvetko", "Čačak", "Ćuprija", "Dragan", "Đorđe", "Sava", "Šabac", "Zoran", "Žika"]);
  });

  test("numbers sort numerically, also inside text", () => {
    expect(sortRows([10, 2, 33, 1], (value) => value, "asc")).toEqual([1, 2, 10, 33]);
    expect(sortRows([10, 2, 33, 1], (value) => value, "desc")).toEqual([33, 10, 2, 1]);
    expect(sortRows(["Model 10", "Model 2"], (value) => value, "asc")).toEqual(["Model 2", "Model 10"]);
  });

  test("empty values stay last in both directions and the sort is stable", () => {
    const rows = [
      { id: "a", value: null },
      { id: "b", value: "B" },
      { id: "c", value: "" },
      { id: "d", value: "A" },
      { id: "e", value: "B" },
    ];
    expect(sortRows(rows, (row) => row.value, "asc").map((row) => row.id)).toEqual(["d", "b", "e", "a", "c"]);
    expect(sortRows(rows, (row) => row.value, "desc").map((row) => row.id)).toEqual(["b", "e", "d", "a", "c"]);
    expect(compareSortValues(undefined, null)).toBe(0);
  });

  test("sorting does not mutate the input", () => {
    const input = [3, 1, 2];
    sortRows(input, (value) => value, "asc");
    expect(input).toEqual([3, 1, 2]);
  });
});
