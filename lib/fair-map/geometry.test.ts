import { describe, expect, test } from "vitest";
import { FAIR_MAP_GEOMETRIES, fairMapForEventCode, isFairMapStandLocation } from "./index";
import type { FairMapPoint } from "./types";

const geometries = Object.values(FAIR_MAP_GEOMETRIES);

function signedArea(polygon: readonly FairMapPoint[]) {
  let sum = 0;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  });
  return sum / 2;
}

describe.each(geometries)("map geometry $key", (geometry) => {
  const locations = geometry.zones.flatMap((zone) => zone.locations.map((location) => ({ zone, location })));
  const shapes = geometry.zones.flatMap((zone) => [...zone.locations, ...zone.landmarks].map((shape) => ({ zone, shape })));

  test("has the hall and the area in front of it, each with its organizer image", () => {
    expect(geometry.zones.map((zone) => zone.id)).toEqual(["hala", "ispred"]);
    for (const zone of geometry.zones) {
      expect(zone.image.src).toMatch(/^\/sajam\/mape\/[a-z-]+\.jpg$/);
      expect(zone.image.width).toBeGreaterThan(0);
      expect(zone.image.height).toBeGreaterThan(0);
      expect(zone.locations.some((location) => location.kind === "stand")).toBe(true);
    }
  });

  test("mapLocationIds are unique in the event and never collide with landmark ids", () => {
    const ids = shapes.map(({ shape }) => shape.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { zone, location } of locations) {
      expect(location.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (location.kind === "stand") expect(location.id.startsWith(`${zone.id}-`)).toBe(true);
    }
  });

  test("every polygon has at least 3 points, lies inside its image and encloses an area", () => {
    for (const { zone, shape } of shapes) {
      expect(shape.polygon.length, shape.id).toBeGreaterThanOrEqual(3);
      for (const [x, y] of shape.polygon) {
        expect(Number.isFinite(x) && Number.isFinite(y), shape.id).toBe(true);
        expect(x >= 0 && x <= zone.image.width && y >= 0 && y <= zone.image.height, `${shape.id} (${x}, ${y})`).toBe(true);
      }
      expect(Math.abs(signedArea(shape.polygon)), shape.id).toBeGreaterThan(0);
    }
  });

  test("has exactly one ScanMe location and it is not an exhibitor stand", () => {
    const scanme = locations.filter(({ location }) => location.kind === "scanme");
    expect(scanme).toHaveLength(1);
    expect(isFairMapStandLocation(geometry.key, scanme[0].location.id)).toBe(false);
  });

  test("organizer stands are traced from the image, only ScanMe may be a placeholder", () => {
    for (const { location } of locations) {
      expect(location.placement).toBe(location.kind === "stand" ? "organizer" : "placeholder");
    }
  });
});

describe("event code → geometry", () => {
  test("real and DEV TEST events share one map; unknown events have none", () => {
    expect(fairMapForEventCode("elektromobilnost-2026")?.key).toBe("elektromobilnost-2026");
    expect(fairMapForEventCode("test-elektromobilnost-2026")?.key).toBe("elektromobilnost-2026");
    expect(fairMapForEventCode("auto-moto-fest-2026")?.key).toBe("auto-moto-fest-2026");
    expect(fairMapForEventCode("test-auto-moto-fest-2026")?.key).toBe("auto-moto-fest-2026");
    expect(fairMapForEventCode("test-draft-fair-2026")).toBeNull();
    expect(fairMapForEventCode("toString")).toBeNull();
  });

  test("stand ids are checked against the event's own map", () => {
    expect(isFairMapStandLocation("elektromobilnost-2026", "hala-1a")).toBe(true);
    expect(isFairMapStandLocation("auto-moto-fest-2026", "hala-1a")).toBe(false);
    expect(isFairMapStandLocation("auto-moto-fest-2026", "hala-6-7")).toBe(true);
    expect(isFairMapStandLocation("test-auto-moto-fest-2026", "ispred-s1-s2")).toBe(true);
    expect(isFairMapStandLocation("elektromobilnost-2026", "hala-1-a12")).toBe(false);
    expect(isFairMapStandLocation("unknown-2026", "hala-2")).toBe(false);
  });
});
