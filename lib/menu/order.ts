// ScanMe Menu V1 — sparse ordering. Rows carry a numeric `order`; a new row
// goes after the last one, and a move takes the midpoint of its new
// neighbours, so one move writes one row. When doubles run out of room
// between two neighbours, the caller renumbers the (bounded) list.

export const ORDER_STEP = 1024;

/** Order of a row appended after `last` (null = empty list). */
export function orderAfter(last: number | null): number {
  return last === null ? ORDER_STEP : last + ORDER_STEP;
}

/**
 * Order strictly between two neighbours (null = list edge), or null when the
 * gap is exhausted and the list must be renumbered first.
 */
export function orderBetween(prev: number | null, next: number | null): number | null {
  if (prev === null && next === null) return ORDER_STEP;
  if (prev === null) return (next as number) - ORDER_STEP;
  if (next === null) return prev + ORDER_STEP;
  const mid = (prev + next) / 2;
  return mid > prev && mid < next ? mid : null;
}

/** Fresh evenly spaced orders for `count` rows: 1024, 2048, … */
export function renumberedOrders(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * ORDER_STEP);
}

/**
 * Moves the element at `from` to index `to` (clamped) and returns the new
 * sequence. Used for short lists (pages, sections) that are renumbered whole.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = items.slice();
  if (from < 0 || from >= result.length) return result;
  const [moved] = result.splice(from, 1);
  const target = Math.max(0, Math.min(to, result.length));
  result.splice(target, 0, moved);
  return result;
}
