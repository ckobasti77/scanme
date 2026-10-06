// Admin UX A1 — client-side column sorting for AdminDataView. Lists are
// already bounded (paginated or `take`), so sorting the loaded rows is cheap.

export type SortDirection = "asc" | "desc";
export type SortState = { columnId: string; direction: SortDirection } | null;
export type SortValue = string | number | null | undefined;

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

/** Header click cycle: rastuće → opadajuće → bez sortiranja; another column starts at rastuće. */
export function nextSortState(current: SortState, columnId: string): SortState {
  if (!current || current.columnId !== columnId) return { columnId, direction: "asc" };
  return current.direction === "asc" ? { columnId, direction: "desc" } : null;
}

export function compareSortValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable sort; empty values stay last in both directions. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((left, right) => {
      const leftEmpty = left.key === null || left.key === undefined || left.key === "";
      const rightEmpty = right.key === null || right.key === undefined || right.key === "";
      if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? left.index - right.index : leftEmpty ? 1 : -1;
      return sign * compareSortValues(left.key, right.key) || left.index - right.index;
    })
    .map((entry) => entry.row);
}
