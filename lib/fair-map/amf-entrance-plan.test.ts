import { describe, expect, test } from "vitest";
import { AMF_ENTRANCE_ANCHORS } from "./topography";
import { amfEntrancePoint, amfForecourtPoint, AMF_ENTRANCE_PLAN, AMF_ENTRANCE_STANDS, AMF_FORECOURT_SCALE } from "./amf-entrance-plan";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { fairMapPointInPolygon } from "./layout";

describe("AMF entrance follows the actual plan, not a responsive stand grid", () => {
  const outdoor = AMF_ENTRANCE_ANCHORS.filter((item) => item.area === "outdoor");
  const doorwayRight = amfEntrancePoint([AMF_ENTRANCE_PLAN.doorway.right, 0])[0];

  test("outdoor contour centers stay to the right of the entrance without stand rectangles", () => {
    expect(outdoor).toHaveLength(5);
    for (const item of outdoor) {
      expect(item.footprint).toBeUndefined();
      expect(item.x).toBeGreaterThan(doorwayRight);
    }
  });
  test("Kia 100 m² is only slightly larger than Xtreme 96 m²", () => {
    const kia = outdoor.find(item => item.key === "kia")!;
    const xtreme = outdoor.find(item => item.key === "xtreme")!;
    expect(kia.rx * kia.ry / (xtreme.rx * xtreme.ry)).toBeCloseTo(100 / 96, 2);
  });
  test("Xtreme is lowered near Kia, not above the forecourt group", () => {
    const kia = outdoor.find(item => item.key === "kia")!;
    const xtreme = outdoor.find(item => item.key === "xtreme")!;
    expect(kia.y - xtreme.y).toBeGreaterThan(0);
    expect(kia.y - xtreme.y).toBeLessThan(110 * AMF_FORECOURT_SCALE);
  });
  test("the whole forecourt grows toward the upper left without moving indoor booths", () => {
    const original = [630, 890] as const;
    const enlarged = amfForecourtPoint(original);
    expect(enlarged[0]).toBeLessThan(original[0]);
    expect(enlarged[1]).toBeLessThan(original[1]);
    const aodes = outdoor.find(item => item.key === "aodes")!;
    expect([aodes.x, aodes.y]).toEqual(amfEntrancePoint(enlarged));
    expect(aodes.rx).toBeCloseTo(145 * 0.85 * AMF_FORECOURT_SCALE);
    expect(amfForecourtPoint([1120, 1080])).toEqual([1120, 1080]);
  });
  test("the foyer keeps its tapered outline and Parking below TON, above the bottom row", () => {
    const wall = AMF_ENTRANCE_PLAN.foyer;
    expect(wall.some(([x, y], i) => i > 0 && x !== wall[i - 1][0] && y !== wall[i - 1][1])).toBe(true);
    const parking = AMF_ENTRANCE_STANDS.parking;
    const ton = AMF_ENTRANCE_STANDS.ton;
    expect(parking[0][0]).toBe(ton[0][0]);
    expect(parking[0][1]).toBeGreaterThan(ton[2][1]);
    expect(parking[2][1]).toBeLessThan(AMF_ENTRANCE_STANDS.servoremont[0][1]);
    expect(parking[2][1]).toBeLessThan(AMF_ENTRANCE_STANDS.benni[0][1]);
  });
  test("indoor booth boundaries stay inside the foyer wall", () => {
    for (const item of AMF_ENTRANCE_ANCHORS.filter(item => item.area === "foyer")) {
      for (const point of AMF_ENTRANCE_STANDS[item.key]) expect(fairMapPointInPolygon(point, AMF_ENTRANCE_PLAN.foyer), item.key).toBe(true);
    }
  });
  test("Benni and its logo leave the main entrance opening free", () => {
    const benni = AMF_ENTRANCE_ANCHORS.find((item) => item.key === "benni")!;
    expect(Math.min(...benni.footprint!.map(([x]) => x))).toBeGreaterThan(doorwayRight);
    expect(benni.x - benni.rx * 0.92).toBeGreaterThan(doorwayRight);
    const scanme = AMF_ENTRANCE_ANCHORS.find((item) => item.key === "scanme")!;
    expect(scanme.y).toBeLessThan(amfEntrancePoint([0, AMF_ENTRANCE_PLAN.stairs.y])[1]);
  });
  test("AODES and Xtreme keep their organizer polygons and diagonal ordering", () => {
    const zone = AUTO_MOTO_FEST_2026_MAP.zones.find((item) => item.id === "ispred")!;
    for (const [key, location] of [["aodes", "ispred-s1-s2"], ["xtreme", "ispred-s3"]]) {
      expect(AMF_ENTRANCE_STANDS[key]).toEqual(zone.locations.find((item) => item.id === location)!.polygon);
    }
    const aodes = outdoor.find((item) => item.key === "aodes")!;
    const xtreme = outdoor.find((item) => item.key === "xtreme")!;
    expect(xtreme.x).toBeGreaterThan(aodes.x);
    expect(xtreme.y).toBeLessThan(aodes.y);
    const bottom = ["auto-happy-outdoor", "swm", "kia"].map((key) => outdoor.find((item) => item.key === key)!);
    expect(bottom.map((item) => item.x)).toEqual(bottom.map((item) => item.x).sort((a, b) => a - b));
    expect(bottom.every((item) => item.y > xtreme.y)).toBe(true);
  });
  test("all projected footprints fit the map with a visible outer margin", () => {
    for (const item of AMF_ENTRANCE_ANCHORS) for (const [x, y] of item.footprint ?? []) {
      expect(x).toBeGreaterThan(20);
      expect(x).toBeLessThan(980);
      expect(y).toBeGreaterThan(20);
      expect(y).toBeLessThan(1360);
    }
  });
  test("base coordinates use one scale before viewport fitting", () => {
    const a = amfEntrancePoint([0, 0]);
    const b = amfEntrancePoint([100, 100]);
    expect(b[0] - a[0]).toBe(b[1] - a[1]);
  });
});
