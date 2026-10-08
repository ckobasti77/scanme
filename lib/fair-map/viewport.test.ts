import { describe, expect, test } from "vitest";
import { FAIR_MAP_FOCUS_ZOOM, FAIR_MAP_MAX_ZOOM, fairMapClamp, fairMapFit, fairMapFitScale, fairMapFocus, fairMapLimits, fairMapZoomAt } from "./viewport";

// N4 — pan/zoom math of a zone map: fit, clamp, zoom around a point and the
// focus on a selected stand (the phone sheet keeps it in the upper part).

const content = { width: 1375, height: 1080 };
const phone = { width: 358, height: 300 };
const limits = fairMapLimits(phone, content, 12);

describe("fit and limits", () => {
  test("the whole zone fits with padding; zoom goes from fit to 4× fit", () => {
    expect(fairMapFitScale(phone, content, 12)).toBeCloseTo(Math.min(334 / 1375, 276 / 1080));
    expect(limits.max).toBeCloseTo(limits.min * FAIR_MAP_MAX_ZOOM);
    const fit = fairMapFit(phone, content, limits);
    expect(fit.scale).toBe(limits.min);
    // Centred both ways when smaller than the viewport.
    expect(fit.x).toBeCloseTo((phone.width - content.width * fit.scale) / 2);
    expect(fit.y).toBeCloseTo((phone.height - content.height * fit.scale) / 2);
    expect(fairMapFitScale({ width: 0, height: 300 }, content, 12)).toBe(0);
  });

  test("clamp keeps the scale in range and the content on screen", () => {
    const tooFar = fairMapClamp({ scale: limits.max * 10, x: 5000, y: -9000 }, phone, content, limits);
    expect(tooFar.scale).toBe(limits.max);
    expect(tooFar.x).toBeLessThanOrEqual(12);
    expect(tooFar.y).toBeGreaterThanOrEqual(phone.height - content.height * limits.max - 12);
    expect(fairMapClamp({ scale: 0.0001, x: 0, y: 0 }, phone, content, limits).scale).toBe(limits.min);
  });
});

describe("zoom and focus", () => {
  test("zooming keeps the map point under the finger/cursor in place", () => {
    const start = { scale: limits.min * 2, x: -100, y: -80 };
    const point = { x: 150, y: 120 };
    const before = { x: (point.x - start.x) / start.scale, y: (point.y - start.y) / start.scale };
    const next = fairMapZoomAt(start, 1.5, point, phone, content, limits);
    expect((point.x - next.x) / next.scale).toBeCloseTo(before.x);
    expect((point.y - next.y) / next.scale).toBeCloseTo(before.y);
  });

  test("focus puts the stand at the chosen height and never closer than 3× fit", () => {
    const stand = { minX: 324, minY: 0, maxX: 431, maxY: 108 };
    const view = fairMapFocus(stand, { width: 358, height: 420 }, content, fairMapLimits({ width: 358, height: 420 }, content, 12), 0.36);
    const own = fairMapLimits({ width: 358, height: 420 }, content, 12);
    expect(view.scale).toBeLessThanOrEqual(own.min * FAIR_MAP_FOCUS_ZOOM + 1e-9);
    const cx = (stand.minX + stand.maxX) / 2;
    expect(cx * view.scale + view.x).toBeCloseTo(358 / 2, 0);
    // A big stand stays at the fitted view.
    expect(fairMapFocus({ minX: 0, minY: 0, maxX: 1375, maxY: 1080 }, phone, content, limits).scale).toBe(limits.min);
  });
});
