// ScanMe Menu V1 (K20) — the schematic floor layout of "Lokal i QR" (master
// §9.2 "rasporedi stolove na način koji odgovara lokalu", §13.6; mockups
// README: schematic and adjustable, never photorealistic).
//
// Each zone (and "Bez zone") is its own surface: a grid of FLOOR_COLUMNS
// square cells whose height grows with the content. A position is a rectangle
// or a circle of whole cells on the grid of its zone. Pure and dependency-free:
// Convex validates writes with isValidLayout, the editor moves and resizes
// with the same functions, so the two can never disagree.

export const FLOOR_COLUMNS = 24;
/** Rows a zone may use (500 positions of 1×1 fit many times over). */
export const FLOOR_MAX_ROWS = 120;
/** Rows a zone shows at least, so an empty or sparse zone still reads as a room. */
export const FLOOR_MIN_ROWS = 6;
export const FLOOR_MIN_SIZE = 1;
export const FLOOR_MAX_SIZE = 8;

export type FloorShape = "rect" | "round";
export type FloorLayout = { x: number; y: number; w: number; h: number; shape: FloorShape };
export type FloorPositionKind = "table" | "room" | "other";

/** The size a new position gets before anyone moves it. */
export function defaultLayoutSize(kind: FloorPositionKind): Pick<FloorLayout, "w" | "h" | "shape"> {
  switch (kind) {
    case "table":
      return { w: 3, h: 2, shape: "rect" };
    case "room":
      return { w: 3, h: 2, shape: "rect" };
    case "other":
      return { w: 4, h: 2, shape: "rect" };
  }
}

function isWhole(value: number): boolean {
  return Number.isInteger(value);
}

/** Whole cells, inside the grid, size within bounds. */
export function isValidLayout(layout: FloorLayout): boolean {
  const { x, y, w, h, shape } = layout;
  if (![x, y, w, h].every(isWhole)) return false;
  if (shape !== "rect" && shape !== "round") return false;
  if (w < FLOOR_MIN_SIZE || w > FLOOR_MAX_SIZE || h < FLOOR_MIN_SIZE || h > FLOOR_MAX_SIZE) return false;
  return x >= 0 && y >= 0 && x + w <= FLOOR_COLUMNS && y + h <= FLOOR_MAX_ROWS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The nearest valid layout (rounded, size bounded, pushed inside the grid). */
export function clampLayout(layout: FloorLayout): FloorLayout {
  const w = clamp(Math.round(layout.w), FLOOR_MIN_SIZE, FLOOR_MAX_SIZE);
  const h = clamp(Math.round(layout.h), FLOOR_MIN_SIZE, FLOOR_MAX_SIZE);
  return {
    x: clamp(Math.round(layout.x), 0, FLOOR_COLUMNS - w),
    y: clamp(Math.round(layout.y), 0, FLOOR_MAX_ROWS - h),
    w,
    h,
    shape: layout.shape === "round" ? "round" : "rect",
  };
}

export function overlaps(a: FloorLayout, b: FloorLayout): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlapsAny(layout: FloorLayout, others: readonly FloorLayout[]): boolean {
  return others.some((other) => overlaps(layout, other));
}

export function sameLayout(a: FloorLayout | null, b: FloorLayout | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.shape === b.shape;
}

/**
 * The first free spot for a `w × h` rectangle, scanning rows top to bottom and
 * columns left to right (one empty cell kept around neighbours where it fits).
 * null when the zone is full.
 */
export function findFreeSpot(
  occupied: readonly FloorLayout[],
  size: Pick<FloorLayout, "w" | "h">,
): { x: number; y: number } | null {
  const w = clamp(size.w, FLOOR_MIN_SIZE, FLOOR_MAX_SIZE);
  const h = clamp(size.h, FLOOR_MIN_SIZE, FLOOR_MAX_SIZE);
  // First pass keeps a one-cell gap (a readable plan); the second packs tight.
  for (const gap of [1, 0]) {
    for (let y = 0; y + h <= FLOOR_MAX_ROWS; y += 1) {
      for (let x = 0; x + w <= FLOOR_COLUMNS; x += 1) {
        const probe = { x: x - gap, y: y - gap, w: w + 2 * gap, h: h + 2 * gap, shape: "rect" as const };
        if (!overlapsAny(probe, occupied)) return { x, y };
      }
    }
  }
  return null;
}

export type FloorItem = {
  id: string;
  kind: FloorPositionKind;
  order: number;
  layout: FloorLayout | null;
};

/**
 * Where every item of ONE zone is drawn: a stored layout stays where it is;
 * an item without one gets the first free spot, in `order`. Deterministic, so
 * the editor, the waiter panel and the izlog draw the same plan.
 */
export function placeLayouts(items: readonly FloorItem[]): Map<string, FloorLayout> {
  const placed = new Map<string, FloorLayout>();
  const occupied: FloorLayout[] = [];
  for (const item of items) {
    if (item.layout && isValidLayout(item.layout)) {
      placed.set(item.id, item.layout);
      occupied.push(item.layout);
    }
  }
  const pending = items
    .filter((item) => !placed.has(item.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const item of pending) {
    const size = item.layout ? clampLayout(item.layout) : defaultLayoutSize(item.kind);
    const spot = findFreeSpot(occupied, size) ?? { x: 0, y: 0 };
    const layout = clampLayout({ ...size, ...spot, shape: size.shape });
    placed.set(item.id, layout);
    occupied.push(layout);
  }
  return placed;
}

/** A fresh, tidy arrangement of the whole zone in `order` (the "Rasporedi automatski" action). */
export function autoArrange(items: readonly FloorItem[]): Map<string, FloorLayout> {
  return placeLayouts(
    items.map((item) => ({
      ...item,
      layout: null,
    })),
  );
}

/** Rows a zone surface shows: its content plus one free row, at least FLOOR_MIN_ROWS. */
export function rowsNeeded(layouts: Iterable<FloorLayout>): number {
  let bottom = 0;
  for (const layout of layouts) bottom = Math.max(bottom, layout.y + layout.h);
  return clamp(bottom + 1, FLOOR_MIN_ROWS, FLOOR_MAX_ROWS);
}

export type FloorDirection = "left" | "right" | "up" | "down";

const STEP: Record<FloorDirection, { dx: number; dy: number }> = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
};

/**
 * One keyboard step (arrow key): the next cell in that direction where the
 * position does not overlap another; jumps over a neighbour instead of
 * stopping at it. null when there is no free cell before the grid edge.
 */
export function moveStep(
  layout: FloorLayout,
  direction: FloorDirection,
  others: readonly FloorLayout[],
): FloorLayout | null {
  const { dx, dy } = STEP[direction];
  let candidate = layout;
  for (;;) {
    const next = { ...candidate, x: candidate.x + dx, y: candidate.y + dy };
    if (next.x < 0 || next.y < 0 || next.x + next.w > FLOOR_COLUMNS || next.y + next.h > FLOOR_MAX_ROWS) {
      return null;
    }
    if (!overlapsAny(next, others)) return next;
    candidate = next;
  }
}

/**
 * One resize step (Shift + arrow): right/down grow, left/up shrink, keeping
 * the top-left corner. null when the size would leave bounds, the grid or
 * overlap a neighbour.
 */
export function resizeStep(
  layout: FloorLayout,
  direction: FloorDirection,
  others: readonly FloorLayout[],
): FloorLayout | null {
  const { dx, dy } = STEP[direction];
  const next = { ...layout, w: layout.w + dx, h: layout.h + dy };
  if (!isValidLayout(next) || overlapsAny(next, others)) return null;
  return next;
}

/**
 * A pointer drop: the layout moved by whole cells (`dx`, `dy` already
 * converted from pixels). null when the target is outside the grid or taken.
 */
export function dropAt(
  layout: FloorLayout,
  dx: number,
  dy: number,
  others: readonly FloorLayout[],
): FloorLayout | null {
  const next = { ...layout, x: layout.x + Math.round(dx), y: layout.y + Math.round(dy) };
  if (!isValidLayout(next) || overlapsAny(next, others)) return null;
  return next;
}

/** Rectangle ↔ circle (a round table stays square in cells where it can). */
export function toggleShape(layout: FloorLayout): FloorLayout {
  return { ...layout, shape: layout.shape === "round" ? "rect" : "round" };
}

/** Natural order of labels: "Sto 2" before "Sto 10" (Serbian collation). */
export function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, "sr-Latn", { numeric: true, sensitivity: "base" });
}
