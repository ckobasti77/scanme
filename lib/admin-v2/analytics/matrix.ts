// ADMIN v2 X3 — the day × hour matrix: „Kad je gužva?“. One row per fair day,
// one column per hour from the hall's opening hour; trailing hours in which no
// day has a scan are left out. Used for the whole fair and for one model.

export type MatrixDay = { dateKey: string; label: string };
export type MatrixHour = { dateKey: string; hour: number; value: number };

export type HourMatrix = {
  hours: number[];
  rows: Array<{
    dateKey: string;
    label: string;
    /** Sum of the shown hours of the day. */
    total: number;
    /** One cell per hour of `hours`; null = the hour is not in the series (it has not come yet). */
    cells: Array<number | null>;
  }>;
  max: number;
  peak: { dateKey: string; label: string; hour: number; value: number } | null;
};

export function hourMatrix(days: readonly MatrixDay[], hours: readonly MatrixHour[]): HourMatrix {
  const byCell = new Map<string, number>();
  let first = Number.POSITIVE_INFINITY;
  let last = -1;
  for (const row of hours) {
    byCell.set(`${row.dateKey}|${row.hour}`, row.value);
    first = Math.min(first, row.hour);
    if (row.value > 0) last = Math.max(last, row.hour);
  }
  if (last < 0) return { hours: [], rows: days.map((day) => ({ ...day, total: 0, cells: [] })), max: 0, peak: null };
  const range = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  let peak: HourMatrix["peak"] = null;
  const rows = days.map((day) => {
    const cells = range.map((hour) => byCell.get(`${day.dateKey}|${hour}`) ?? null);
    cells.forEach((value, index) => {
      // The first of equal peaks wins, so the label does not jump between them.
      if (value !== null && value > (peak?.value ?? 0)) peak = { dateKey: day.dateKey, label: day.label, hour: range[index], value };
    });
    return { dateKey: day.dateKey, label: day.label, total: cells.reduce<number>((total, value) => total + (value ?? 0), 0), cells };
  });
  return { hours: range, rows, max: (peak as HourMatrix["peak"])?.value ?? 0, peak };
}
