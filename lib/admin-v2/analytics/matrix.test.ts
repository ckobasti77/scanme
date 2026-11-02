import { describe, expect, test } from "vitest";
import { previewAnalytics } from "@/components/admin/events/preview-analytics-fixtures";
import { hourMatrix, type MatrixDay, type MatrixHour } from "./matrix";

// ADMIN v2 X3 — the day × hour matrix „Kad je gužva?“.

const days: MatrixDay[] = [
  { dateKey: "2026-10-09", label: "TEST dan 1" },
  { dateKey: "2026-10-10", label: "TEST dan 2" },
];
const cell = (dateKey: string, hour: number, value: number): MatrixHour => ({ dateKey, hour, value });

describe("hourMatrix: the range of hours", () => {
  test("runs from the first hour to the last hour with a scan; empty trailing hours are left out", () => {
    const matrix = hourMatrix(days, [
      cell("2026-10-09", 8, 1),
      cell("2026-10-09", 9, 3),
      cell("2026-10-09", 10, 0),
      cell("2026-10-10", 8, 2),
      cell("2026-10-10", 9, 0),
      cell("2026-10-10", 10, 0),
      cell("2026-10-10", 11, 0),
    ]);
    expect(matrix.hours).toEqual([8, 9]);
    expect(matrix.rows[0].cells).toHaveLength(2);
    expect(matrix.rows[1].cells).toHaveLength(2);
  });

  test("the first hour is the earliest hour of the series, even an empty one", () => {
    const matrix = hourMatrix(days, [cell("2026-10-09", 7, 0), cell("2026-10-09", 8, 4), cell("2026-10-09", 9, 1)]);
    expect(matrix.hours).toEqual([7, 8, 9]);
    expect(matrix.rows[0].cells).toEqual([0, 4, 1]);
  });

  test("an empty hour between two busy hours stays in the range", () => {
    const matrix = hourMatrix(days, [cell("2026-10-09", 8, 1), cell("2026-10-09", 9, 0), cell("2026-10-09", 10, 2)]);
    expect(matrix.hours).toEqual([8, 9, 10]);
  });

  test("the last hour counts if any day has a scan in it", () => {
    const matrix = hourMatrix(days, [cell("2026-10-09", 8, 1), cell("2026-10-09", 9, 0), cell("2026-10-10", 8, 0), cell("2026-10-10", 9, 5)]);
    expect(matrix.hours).toEqual([8, 9]);
  });
});

describe("hourMatrix: the cells", () => {
  const matrix = hourMatrix(days, [
    cell("2026-10-09", 8, 1),
    cell("2026-10-09", 9, 0),
    cell("2026-10-09", 10, 3),
    cell("2026-10-10", 8, 2),
    // 2026-10-10 has no 9:00 and no 10:00 in the series: those hours have not come yet.
  ]);

  test("an hour that is not in the series is null, a real zero is 0", () => {
    expect(matrix.hours).toEqual([8, 9, 10]);
    expect(matrix.rows[0].cells).toEqual([1, 0, 3]);
    expect(matrix.rows[1].cells).toEqual([2, null, null]);
  });

  test("the total of a row is the sum of its shown hours (null counts as nothing)", () => {
    expect(matrix.rows[0].total).toBe(4);
    expect(matrix.rows[1].total).toBe(2);
  });

  test("a row carries its day's key and label in the order of the days", () => {
    expect(matrix.rows.map((row) => row.dateKey)).toEqual(days.map((entry) => entry.dateKey));
    expect(matrix.rows.map((row) => row.label)).toEqual(days.map((entry) => entry.label));
  });

  test("a day without any hour in the series has only nulls", () => {
    const lonely = hourMatrix(days, [cell("2026-10-09", 8, 1), cell("2026-10-09", 9, 2)]);
    expect(lonely.rows[1].cells).toEqual([null, null]);
    expect(lonely.rows[1].total).toBe(0);
  });
});

describe("hourMatrix: the peak", () => {
  test("is the largest cell with its day and hour; max is its value", () => {
    const matrix = hourMatrix(days, [
      cell("2026-10-09", 8, 1),
      cell("2026-10-09", 9, 4),
      cell("2026-10-10", 8, 2),
      cell("2026-10-10", 9, 9),
    ]);
    expect(matrix.peak).toEqual({ dateKey: "2026-10-10", label: "TEST dan 2", hour: 9, value: 9 });
    expect(matrix.max).toBe(9);
  });

  test("of equal cells the earlier day wins", () => {
    const matrix = hourMatrix(days, [cell("2026-10-09", 8, 1), cell("2026-10-09", 9, 5), cell("2026-10-10", 8, 5), cell("2026-10-10", 9, 5)]);
    expect(matrix.peak).toEqual({ dateKey: "2026-10-09", label: "TEST dan 1", hour: 9, value: 5 });
  });

  test("of equal cells on one day the earlier hour wins", () => {
    const matrix = hourMatrix(days, [cell("2026-10-09", 8, 3), cell("2026-10-09", 9, 3), cell("2026-10-09", 10, 3)]);
    expect(matrix.peak?.hour).toBe(8);
    expect(matrix.max).toBe(3);
  });

  test("does not depend on the order of the hour rows", () => {
    const rows = [cell("2026-10-10", 9, 9), cell("2026-10-09", 8, 1), cell("2026-10-10", 8, 2), cell("2026-10-09", 9, 4)];
    const forward = hourMatrix(days, rows);
    const backward = hourMatrix(days, [...rows].reverse());
    expect(backward.peak).toEqual(forward.peak);
    expect(backward.rows).toEqual(forward.rows);
    expect(backward.hours).toEqual(forward.hours);
  });
});

describe("hourMatrix: nothing to show", () => {
  test("all zeros: no hours, max 0, no peak, but every day still has a row", () => {
    const matrix = hourMatrix(days, [cell("2026-10-09", 8, 0), cell("2026-10-09", 9, 0), cell("2026-10-10", 8, 0)]);
    expect(matrix.hours).toEqual([]);
    expect(matrix.max).toBe(0);
    expect(matrix.peak).toBeNull();
    expect(matrix.rows).toEqual([
      { dateKey: "2026-10-09", label: "TEST dan 1", total: 0, cells: [] },
      { dateKey: "2026-10-10", label: "TEST dan 2", total: 0, cells: [] },
    ]);
  });

  test("an empty series is the same", () => {
    const matrix = hourMatrix(days, []);
    expect(matrix.hours).toEqual([]);
    expect(matrix.max).toBe(0);
    expect(matrix.peak).toBeNull();
    expect(matrix.rows).toHaveLength(2);
  });

  test("no days and no hours is empty", () => {
    expect(hourMatrix([], [])).toEqual({ hours: [], rows: [], max: 0, peak: null });
  });
});

describe("hourMatrix with the fixtures", () => {
  const series = previewAnalytics.hours.map((row) => ({ dateKey: row.dateKey, hour: row.hour, value: row.scans }));
  const matrix = hourMatrix(previewAnalytics.days, series);

  test("the busiest hour of the fair is Nedelja at 12:00 with 39 scans", () => {
    expect(matrix.peak).toEqual({ dateKey: "2026-10-11", label: "Nedelja", hour: 12, value: 39 });
    expect(matrix.max).toBe(39);
  });

  test("the hours run from 8 to the last hour with a scan (21, a single Subota scan)", () => {
    expect(matrix.hours[0]).toBe(8);
    expect(matrix.hours.at(-1)).toBe(21);
    expect(matrix.hours).toHaveLength(14);
  });

  test("the row totals are the scans of each day", () => {
    expect(matrix.rows.map((row) => row.total)).toEqual(previewAnalytics.days.map((entry) => entry.scans));
  });

  test("every shown hour is in the series of every day", () => {
    for (const row of matrix.rows) expect(row.cells.every((value) => value !== null)).toBe(true);
  });
});
