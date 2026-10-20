// ADMIN v2 X4 — pure logic of the list FLIP (ZADATAK §7): from the rectangles
// of the items before and after a re-render (keyed by item) it works out which
// items have to glide from their old place and which are new.

export type FlipRect = { left: number; top: number };

/** A list longer than this is not animated. */
export const FLIP_MAX_ITEMS = 80;
/** A shift smaller than this (px, either axis) is not animated. */
export const FLIP_MIN_DELTA = 1;
/**
 * A list filtered by its query gets the new rows a moment after the filter
 * changed: for this long (ms) the next change of the rows still belongs to it.
 */
export const FLIP_ARMED_MS = 1500;

/** Whether a change of the rows at `now` still belongs to the filter change at `armedAt`. */
export const flipArmed = (armedAt: number | null, now: number) => armedAt !== null && now - armedAt <= FLIP_ARMED_MS;

export type FlipMove<K> = { key: K; dx: number; dy: number };

/**
 * `dx`/`dy` is the offset to start from: the old place relative to the new one,
 * so a tween from (dx, dy) to (0, 0) glides the item from where it was. Items
 * that are gone from `after` are ignored.
 */
export function flipMoves<K>(before: ReadonlyMap<K, FlipRect>, after: ReadonlyMap<K, FlipRect>): { moved: FlipMove<K>[]; entered: K[] } {
  const moved: FlipMove<K>[] = [];
  const entered: K[] = [];
  for (const [key, now] of after) {
    const old = before.get(key);
    if (!old) {
      entered.push(key);
      continue;
    }
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) >= FLIP_MIN_DELTA || Math.abs(dy) >= FLIP_MIN_DELTA) moved.push({ key, dx, dy });
  }
  return { moved, entered };
}
