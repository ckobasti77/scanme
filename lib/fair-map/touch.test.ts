import { describe, expect, test } from "vitest";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { fairMapBounds, fairMapLabelPoint } from "./shape";
import { FAIR_MAP_TOUCH_MIN_PX, fairMapTouchLocation, fairMapTouchZone } from "./touch";
import { fairMapLocationTakesStands, type FairMapLocation, type FairMapPoint } from "./types";
import { FAIR_MAP_MAX_ZOOM, fairMapFitScale } from "./viewport";

// D1 (RN N7) — invisible touch zones of the vector map: on a phone every
// occupied location answers to a finger within at least 44 CSS px, without
// any change to the drawing.

const box = (id: string, x: number, y: number, width: number, height: number): FairMapLocation => ({
  id,
  label: id,
  kind: "stand",
  placement: "organizer",
  polygon: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
});

/** Fitted scale of a zone in the map card of a phone `width` CSS px wide (page and card padding ≈ 32 px, map padding 12 px). */
function phoneFit(width: number, image: { width: number; height: number }) {
  const card = width - 32;
  return fairMapFitScale({ width: card, height: (card * image.height) / image.width }, image, 12);
}

describe("fairMapTouchZone", () => {
  test("a small stand grows to 44 CSS px around its centre at every zoom; a big one keeps its own box", () => {
    const small = box("s", 100, 200, 7, 13).polygon;
    for (const scale of [0.15, 0.25, 1, FAIR_MAP_MAX_ZOOM]) {
      const zone = fairMapTouchZone(small, scale);
      expect(zone.width * scale).toBeCloseTo(Math.max(7 * scale, FAIR_MAP_TOUCH_MIN_PX));
      expect(zone.height * scale).toBeCloseTo(Math.max(13 * scale, FAIR_MAP_TOUCH_MIN_PX));
      expect(zone.x + zone.width / 2).toBeCloseTo(103.5);
      expect(zone.y + zone.height / 2).toBeCloseTo(206.5);
    }
    expect(fairMapTouchZone(box("b", 0, 0, 1000, 600).polygon, 0.25)).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
  });
});

describe("fairMapTouchLocation", () => {
  const a = box("a", 0, 0, 10, 10);
  const b = box("b", 30, 0, 10, 10);
  const big = box("big", 0, 400, 1000, 600);
  const scale = 0.25; // 44 CSS px = 176 image px

  test("a finger on a stand selects that stand", () => {
    expect(fairMapTouchLocation([5, 5], [a, b, big], scale)).toBe("a");
    expect(fairMapTouchLocation([35, 5], [a, b, big], scale)).toBe("b");
    expect(fairMapTouchLocation([500, 700], [a, b, big], scale)).toBe("big");
  });

  test("a finger next to small stands selects the nearest box inside its zone (a tie keeps the first)", () => {
    expect(fairMapTouchLocation([12, 5], [a, b], scale)).toBe("a");
    expect(fairMapTouchLocation([28, 5], [a, b], scale)).toBe("b");
    expect(fairMapTouchLocation([20, 5], [a, b], scale)).toBe("a");
    expect(fairMapTouchLocation([5, 60], [a, b], scale)).toBe("a");
  });

  test("an L-shaped neighbour whose box covers the finger loses to the small stand whose drawing is nearer", () => {
    const small = box("small", 100, 100, 8, 12);
    // An L: its bounding box (0..400 × 0..400) holds the finger, its drawing is far from it.
    const l: FairMapLocation = { ...box("l", 0, 0, 1, 1), id: "l", polygon: [[0, 300], [400, 300], [400, 0], [380, 0], [380, 280], [0, 280]] };
    expect(fairMapTouchLocation([104, 125], [l, small], scale)).toBe("small");
    expect(fairMapTouchLocation([104, 270], [l, small], scale)).toBe("l");
  });

  test("outside every zone nothing is selected; zoomed in, the zone shrinks to 44 CSS px", () => {
    expect(fairMapTouchLocation([300, 5], [a, b], scale)).toBeNull();
    // At 4× (44 CSS px = 11 image px) a finger 20 image px away is too far.
    expect(fairMapTouchLocation([5, 30], [a], 4)).toBeNull();
    expect(fairMapTouchLocation([5, 10.4], [a], 4)).toBe("a");
    expect(fairMapTouchLocation([5, 5], [], scale)).toBeNull();
  });
});

describe("the real map (elektromobilnost-2026) on a phone", () => {
  const zones = ELEKTROMOBILNOST_2026_MAP.zones.map((zone) => ({ zone, locations: zone.locations.filter(fairMapLocationTakesStands) }));

  test("RN N7: at the fitted phone view several stands are drawn under 44 px — exactly the ones the touch zone is for", () => {
    const tiny = zones.flatMap(({ zone, locations }) => {
      const scale = phoneFit(360, zone.image);
      return locations.filter((location) => {
        const bounds = fairMapBounds(location.polygon);
        return Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * scale < FAIR_MAP_TOUCH_MIN_PX;
      }).map((location) => location.id);
    });
    for (const id of ["ispred-14", "ispred-18", "hala-12"]) expect(tiny).toContain(id);
  });

  test("every location that takes stands gets a touch zone of at least 44×44 CSS px at 360, 390 and 412 px and up to full zoom, around its own box", () => {
    for (const { zone, locations } of zones) {
      for (const width of [360, 390, 412]) {
        const fit = phoneFit(width, zone.image);
        for (const scale of [fit, fit * 2, fit * FAIR_MAP_MAX_ZOOM]) {
          for (const location of locations) {
            const touch = fairMapTouchZone(location.polygon, scale);
            const bounds = fairMapBounds(location.polygon);
            const label = `${location.id} @${width}px ×${(scale / fit).toFixed(0)}`;
            expect(touch.width * scale, label).toBeGreaterThanOrEqual(FAIR_MAP_TOUCH_MIN_PX - 1e-9);
            expect(touch.height * scale, label).toBeGreaterThanOrEqual(FAIR_MAP_TOUCH_MIN_PX - 1e-9);
            expect(touch.x, label).toBeLessThanOrEqual(bounds.minX + 1e-9);
            expect(touch.x + touch.width, label).toBeGreaterThanOrEqual(bounds.maxX - 1e-9);
          }
        }
      }
    }
  });

  test("a finger on any location's own drawing selects that location; a finger beside a tiny stand, off its drawing, still reaches it", () => {
    for (const { zone, locations } of zones) {
      const scale = phoneFit(360, zone.image);
      for (const location of locations) {
        expect(fairMapTouchLocation(fairMapLabelPoint(location.polygon), locations, scale), location.id).toBe(location.id);
      }
    }
    const front = zones.find(({ zone }) => zone.id === "ispred")!;
    const scale = phoneFit(360, front.zone.image);
    const stand18 = front.locations.find((location) => location.id === "ispred-18")!;
    const bounds = fairMapBounds(stand18.polygon);
    // 12 CSS px above the centre of stand 18 (its drawing is 8×13 px here): off the drawing, so before D1 nothing was selected.
    const above: FairMapPoint = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2 - 12 / scale];
    expect(above[1]).toBeLessThan(bounds.minY);
    expect(fairMapTouchLocation(above, front.locations, scale)).toBe("ispred-18");
    // Below it the drawing of 20–22 is nearer to the finger than 18's: the nearer drawing wins.
    const below: FairMapPoint = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2 + 18 / scale];
    expect(fairMapTouchLocation(below, [stand18], scale)).toBe("ispred-18");
    expect(fairMapTouchLocation(below, front.locations, scale)).toBe("ispred-20-22");
  });
});
