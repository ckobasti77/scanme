import type { FairMapBounds } from "./shape";

// N4 — pure pan/zoom math of one zone map (screen = map × scale + offset).
// The map component only feeds pointer, wheel and button input into these.

export type FairMapViewport = { scale: number; x: number; y: number };
export type FairMapSize = { width: number; height: number };

/** Zoom-in limit relative to the fitted view (test map: 4). */
export const FAIR_MAP_MAX_ZOOM = 4;
/** A focused stand is shown at most this much bigger than the fitted view. */
export const FAIR_MAP_FOCUS_ZOOM = 3;

export type FairMapLimits = { min: number; max: number; padding: number };

/** Scale that fits the whole content with `padding` on every side. */
export function fairMapFitScale(size: FairMapSize, content: FairMapSize, padding: number): number {
  if (!size.width || !size.height || !content.width || !content.height) return 0;
  return Math.max(Math.min((size.width - 2 * padding) / content.width, (size.height - 2 * padding) / content.height), 0.0001);
}

export function fairMapLimits(size: FairMapSize, content: FairMapSize, padding: number): FairMapLimits {
  const min = fairMapFitScale(size, content, padding);
  return { min, max: min * FAIR_MAP_MAX_ZOOM, padding };
}

/** Keeps the zoom between fit and the limit and the content inside the viewport (centred when smaller). */
export function fairMapClamp(view: FairMapViewport, size: FairMapSize, content: FairMapSize, limits: FairMapLimits): FairMapViewport {
  const scale = Math.min(Math.max(view.scale, limits.min), limits.max);
  const w = content.width * scale;
  const h = content.height * scale;
  const p = limits.padding;
  const x = w + 2 * p <= size.width ? (size.width - w) / 2 : Math.min(p, Math.max(size.width - w - p, view.x));
  const y = h + 2 * p <= size.height ? (size.height - h) / 2 : Math.min(p, Math.max(size.height - h - p, view.y));
  return { scale, x, y };
}

export function fairMapFit(size: FairMapSize, content: FairMapSize, limits: FairMapLimits): FairMapViewport {
  return fairMapClamp({ scale: limits.min, x: 0, y: 0 }, size, content, limits);
}

/** Zoom by `factor` keeping the map point under `point` (screen px) in place. */
export function fairMapZoomAt(
  view: FairMapViewport,
  factor: number,
  point: { x: number; y: number },
  size: FairMapSize,
  content: FairMapSize,
  limits: FairMapLimits,
): FairMapViewport {
  const scale = Math.min(Math.max(view.scale * factor, limits.min), limits.max);
  const ratio = scale / view.scale;
  return fairMapClamp({ scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, size, content, limits);
}

/**
 * Brings `bounds` into view: about half the viewport, centred horizontally
 * and at `anchorY` (0–1) vertically — a phone bottom sheet keeps the stand in
 * the upper part. Never closer than FAIR_MAP_FOCUS_ZOOM × fit.
 */
export function fairMapFocus(
  bounds: FairMapBounds,
  size: FairMapSize,
  content: FairMapSize,
  limits: FairMapLimits,
  anchorY = 0.5,
): FairMapViewport {
  const bw = Math.max(bounds.maxX - bounds.minX, 1);
  const bh = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(Math.max(Math.min((size.width * 0.5) / bw, (size.height * 0.5) / bh), limits.min), Math.min(limits.min * FAIR_MAP_FOCUS_ZOOM, limits.max));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return fairMapClamp({ scale, x: size.width / 2 - cx * scale, y: size.height * anchorY - cy * scale }, size, content, limits);
}
