import { describe, expect, test } from "vitest";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { fairMapBadgeRadius, fairMapChipGrid, fairMapInscribedRect, fairMapPointInPolygon, fairMapStandLayout, type FairMapRect } from "./layout";
import type { FairMapLocation, FairMapPoint } from "./types";

// N4 — pure layout of the vector map: logo chips inside every stand, the
// stand number once, and points that are always inside their shape.

const locations = ELEKTROMOBILNOST_2026_MAP.zones.flatMap((zone) => zone.locations);
const location = (id: string) => locations.find((row) => row.id === id)!;
const corners = (rect: FairMapRect): FairMapPoint[] => [
  [rect.x + 0.5, rect.y + 0.5],
  [rect.x + rect.width - 0.5, rect.y + 0.5],
  [rect.x + rect.width - 0.5, rect.y + rect.height - 0.5],
  [rect.x + 0.5, rect.y + rect.height - 0.5],
];

describe("geometry helpers", () => {
  test("point in polygon (even-odd)", () => {
    const square: FairMapPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(fairMapPointInPolygon([5, 5], square)).toBe(true);
    expect(fairMapPointInPolygon([15, 5], square)).toBe(false);
  });

  test("the inscribed rectangle of every location lies inside it; a rectangle stand keeps (almost) its whole box", () => {
    for (const row of locations) {
      const rect = fairMapInscribedRect(row.polygon);
      expect(rect.width * rect.height, row.id).toBeGreaterThan(0);
      for (const point of corners(rect)) expect(fairMapPointInPolygon(point, row.polygon), `${row.id} ${point}`).toBe(true);
    }
    const box = fairMapInscribedRect(location("ispred-17").polygon);
    expect(box.width).toBeGreaterThan(260);
    expect(box.height).toBeGreaterThan(155);
  });

});

describe("logo chips", () => {
  const options = { aspect: 1.7, gap: 8, padding: 8, maxWidth: 200 };

  test("six exhibitors on stand 2: a 3 × 2 grid, inside the box, no overlap, readable size", () => {
    const box = fairMapInscribedRect(location("hala-2").polygon);
    const chips = fairMapChipGrid(box, 6, options);
    expect(chips).toHaveLength(6);
    expect(new Set(chips.map((chip) => Math.round(chip.y))).size).toBe(2);
    for (const chip of chips) {
      expect(chip.x >= box.x && chip.y >= box.y && chip.x + chip.width <= box.x + box.width + 0.01 && chip.y + chip.height <= box.y + box.height + 0.01).toBe(true);
      expect(chip.width).toBeGreaterThan(150);
    }
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const [a, b] = [chips[i], chips[j]];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });

  test("a lone logo in a big area stays a logo (capped) and centred; an odd last row is centred; zero chips is nothing", () => {
    const box = { x: 0, y: 0, width: 1000, height: 600 };
    const [chip] = fairMapChipGrid(box, 1, options);
    expect(chip.width).toBe(200);
    expect(chip.x + chip.width / 2).toBeCloseTo(500);
    expect(chip.y + chip.height / 2).toBeCloseTo(300);
    const three = fairMapChipGrid({ x: 0, y: 0, width: 300, height: 300 }, 3, options);
    expect(three[2].x + three[2].width / 2).toBeCloseTo(150);
    expect(fairMapChipGrid(box, 0, options)).toEqual([]);
  });
});

describe("stand number", () => {
  const hall = ELEKTROMOBILNOST_2026_MAP.zones[0];
  const r = fairMapBadgeRadius(hall);

  test("radius ≈ 1.6 % of the image width; bigger on the display", () => {
    expect(r).toBe(22);
    expect(fairMapBadgeRadius(hall, true)).toBe(35);
  });

  test("inside a stand at the top left, with the chips below it, all inside the stand", () => {
    const layout = fairMapStandLayout(location("hala-11"), r);
    expect(layout.badge).not.toBeNull();
    expect(fairMapPointInPolygon(layout.badge!, location("hala-11").polygon)).toBe(true);
    expect(layout.chips.y).toBeGreaterThan(layout.badge![1]);
    for (const point of corners(layout.chips)) expect(fairMapPointInPolygon(point, location("hala-11").polygon)).toBe(true);
  });

  test("beside the stand where the organizer prints it; once per split stand; none for partners", () => {
    expect(fairMapStandLayout(location("ispred-14"), r).badge).toEqual([402, 192]);
    for (const id of ["ispred-12-1", "ispred-13-3", "ispred-15-4", "hala-partner-10b"]) {
      expect(fairMapStandLayout(location(id) as FairMapLocation, r).badge, id).toBeNull();
    }
    const front = ELEKTROMOBILNOST_2026_MAP.zones[1];
    expect(front.groups!.map((group) => [group.label, group.badge])).toEqual([["12", [338, 27]], ["13", [65, 327]], ["15", [733, 254]]]);
  });
});
