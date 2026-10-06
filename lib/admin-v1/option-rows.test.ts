import { describe, expect, test } from "vitest";
import {
  addOptionRow,
  emptyOptionRows,
  invalidOptionRowIds,
  moveOptionRow,
  nextOptionId,
  optionRowsFrom,
  removeOptionRow,
  setOptionLabel,
  toChoiceOptions,
  validateOptionRows,
} from "./option-rows";

// Admin UX A6 — answer options as dynamic rows (A0 §2.9).

const rows = (...labels: string[]) => labels.map((label, index) => ({ id: `o${index + 1}`, label }));

describe("option rows", () => {
  test("a new question starts with two empty rows o1, o2", () => {
    expect(emptyOptionRows()).toEqual([{ id: "o1", label: "" }, { id: "o2", label: "" }]);
  });

  test("add takes the first free id and stops at 5", () => {
    let value = rows("A", "B");
    value = removeOptionRow(addOptionRow(value), "o1");
    expect(value.map((row) => row.id)).toEqual(["o2", "o3"]);
    expect(nextOptionId(value)).toBe("o1");
    value = addOptionRow(value);
    expect(value.map((row) => row.id)).toEqual(["o2", "o3", "o1"]);
    value = addOptionRow(addOptionRow(value));
    expect(value).toHaveLength(5);
    expect(addOptionRow(value)).toHaveLength(5);
  });

  test("remove never goes below 2 rows", () => {
    expect(removeOptionRow(rows("A", "B"), "o1")).toHaveLength(2);
    expect(removeOptionRow(rows("A", "B", "C"), "o2").map((row) => row.label)).toEqual(["A", "C"]);
  });

  test("move up/down changes the order, not the ids; the edges stay", () => {
    const value = rows("A", "B", "C");
    expect(moveOptionRow(value, "o3", -1).map((row) => row.id)).toEqual(["o1", "o3", "o2"]);
    expect(moveOptionRow(value, "o1", 1).map((row) => row.id)).toEqual(["o2", "o1", "o3"]);
    expect(moveOptionRow(value, "o1", -1)).toEqual(value);
    expect(moveOptionRow(value, "o3", 1)).toEqual(value);
    // order follows the rows; the ids (what votes store) stay with their text
    expect(toChoiceOptions(moveOptionRow(value, "o3", -1))).toEqual([
      { id: "o1", label: "A", order: 1 }, { id: "o3", label: "C", order: 2 }, { id: "o2", label: "B", order: 3 },
    ]);
  });

  test("validation: at least 2, no empty rows, no duplicates regardless of case, spaces and diacritics", () => {
    expect(validateOptionRows(rows("Da", "Ne"))).toEqual([]);
    expect(validateOptionRows(rows("Da"))).toEqual([{ kind: "too_few", min: 2 }]);
    expect(validateOptionRows(rows("A", "B", "C", "D", "E", "F"))).toEqual([{ kind: "too_many", max: 5 }]);
    expect(validateOptionRows(rows("Da", "  "))).toEqual([{ kind: "empty", rowIds: ["o2"] }]);
    const duplicate = validateOptionRows(rows("Električni", " elektricni ", "Hibrid"));
    expect(duplicate).toEqual([{ kind: "duplicate", rowIds: ["o1", "o2"] }]);
    expect([...invalidOptionRowIds(duplicate)]).toEqual(["o1", "o2"]);
  });

  test("labels are trimmed for the backend; stored options come back in `order`", () => {
    expect(toChoiceOptions(setOptionLabel(rows("A", "B"), "o2", "  B2 "))).toEqual([{ id: "o1", label: "A", order: 1 }, { id: "o2", label: "B2", order: 2 }]);
    expect(optionRowsFrom([{ id: "o2", label: "B", order: 2 }, { id: "o1", label: "A", order: 1 }])).toEqual(rows("A", "B"));
  });
});
