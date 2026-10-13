import type { ConstellationChange, ConstellationLayout, Star } from "./types";

// ADMIN v3 V2 — what changed in the Constellation between two reads. Only the
// named stars count; a „+N“ star is a sum, not an item. The first read is a
// state, not news. The totals tell a solved item from one that was only
// pushed out of the named ones (the list is capped), and a new item from one
// that only became visible.

const byOrbitThenId = (a: Star, b: Star) => a.orbit - b.orbit || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function itemsById(layout: ConstellationLayout): Map<string, Star> {
  return new Map(layout.stars.filter((star) => star.kind === "item").map((star) => [star.id, star]));
}

export function constellationDiff(
  prev: ConstellationLayout | null,
  next: ConstellationLayout,
  prevTotal: number | null,
  nextTotal: number | null,
): ConstellationChange[] {
  if (!prev) return [];
  const before = itemsById(prev);
  const after = itemsById(next);
  const known = prevTotal !== null && nextTotal !== null;
  const fell = known ? Math.max(0, prevTotal - nextTotal) : 0;
  const rose = known ? Math.max(0, nextTotal - prevTotal) : 0;

  const gone = [...before.values()].filter((star) => !after.has(star.id)).sort(byOrbitThenId);
  const appeared = [...after.values()].filter((star) => !before.has(star.id)).sort(byOrbitThenId);
  const moved = [...after.values()].filter((star) => before.has(star.id) && before.get(star.id)!.orbit !== star.orbit).sort(byOrbitThenId);

  return [
    ...gone.filter((_, index) => index < fell).map((star): ConstellationChange => ({ kind: "resolved", id: star.id, star })),
    ...gone.filter((_, index) => index >= fell).map((star): ConstellationChange => ({ kind: "left", id: star.id, star })),
    ...appeared.filter((_, index) => index < rose).map((star): ConstellationChange => ({ kind: "arrived", id: star.id })),
    ...appeared.filter((_, index) => index >= rose).map((star): ConstellationChange => ({ kind: "shown", id: star.id })),
    ...moved.map((star): ConstellationChange => ({ kind: "moved", id: star.id, from: before.get(star.id)!.orbit, to: star.orbit })),
  ];
}
