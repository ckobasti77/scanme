import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { FAIR_MAP_GEOMETRIES, fairMapEventSlugCandidates, fairMapForEventCode, fairMapLabelPoint, fairMapLocationById, isFairMapStandLocation } from "./index";
import type { FairMapPoint, FairMapZone } from "./types";

const geometries = Object.values(FAIR_MAP_GEOMETRIES);

function signedArea(polygon: readonly FairMapPoint[]) {
  let sum = 0;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  });
  return sum / 2;
}

/** Pixel size from the JPEG frame header (SOFn). */
function jpegSize(file: string) {
  const data = readFileSync(file);
  let offset = 2;
  while (offset < data.length) {
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  throw new Error(`no JPEG frame in ${file}`);
}

describe.each(geometries)("map geometry $key", (geometry) => {
  const locations = geometry.zones.flatMap((zone) => zone.locations.map((location) => ({ zone, location })));
  const shapes = geometry.zones.flatMap((zone) => [...zone.locations, ...zone.landmarks].map((shape) => ({ zone, shape })));

  test("starts with the hall and the area in front of it; each zone has its organizer image at its real pixel size", () => {
    expect(geometry.zones.slice(0, 2).map((zone) => zone.id)).toEqual(["hala", "ispred"]);
    for (const zone of geometry.zones) {
      expect(zone.image.src).toMatch(/^\/sajam\/mape\/[a-z-]+\.jpg$/);
      expect(jpegSize(join(process.cwd(), "public", zone.image.src)), zone.image.src).toEqual({ width: zone.image.width, height: zone.image.height });
      expect(zone.locations.some((location) => isFairMapStandLocation(geometry.key, location.id))).toBe(true);
    }
  });

  test("mapLocationIds are unique in the event, belong to their zone and never collide with landmark ids", () => {
    const ids = shapes.map(({ shape }) => shape.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { zone, location } of locations) {
      expect(location.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (location.placement === "organizer") expect(location.id === zone.id || location.id.startsWith(`${zone.id}-`), location.id).toBe(true);
    }
  });

  test("every polygon (and the N4 zone outline) has at least 3 points, lies inside its image and encloses an area", () => {
    const outlines = geometry.zones.flatMap((zone) => (zone.outline ? [{ zone, shape: { id: `${zone.id}-obris`, polygon: zone.outline } }] : []));
    for (const { zone, shape } of [...shapes, ...outlines]) {
      expect(shape.polygon.length, shape.id).toBeGreaterThanOrEqual(3);
      for (const [x, y] of shape.polygon) {
        expect(Number.isFinite(x) && Number.isFinite(y), shape.id).toBe(true);
        expect(x >= 0 && x <= zone.image.width && y >= 0 && y <= zone.image.height, `${shape.id} (${x}, ${y})`).toBe(true);
      }
      expect(Math.abs(signedArea(shape.polygon)), shape.id).toBeGreaterThan(0);
    }
  });

  test("has exactly one ScanMe location: a placeholder is never a stand location, an organizer-confirmed one takes stands", () => {
    const scanme = locations.filter(({ location }) => location.kind === "scanme");
    expect(scanme).toHaveLength(1);
    const [{ location }] = scanme;
    expect(isFairMapStandLocation(geometry.key, location.id)).toBe(location.placement === "organizer");
  });

  test("everything but ScanMe is traced from the organizer image; boxes of a split stand carry their group's label", () => {
    for (const { zone, location } of locations) {
      if (location.kind !== "scanme") expect(location.placement, location.id).toBe("organizer");
      if (location.group) {
        const group = zone.groups?.find((row) => row.id === location.group);
        expect(group, location.id).toBeDefined();
        expect(location.label).toBe(group!.label);
        expect(location.areaM2, `${location.id}: the group has the m²`).toBeUndefined();
      }
    }
    for (const zone of geometry.zones) {
      for (const group of zone.groups ?? []) expect(zone.locations.filter((row) => row.group === group.id).length, group.id).toBeGreaterThan(1);
    }
  });
});

describe("Sajam elektromobilnosti 2026 — organizer maps of 7. 10. (N3)", () => {
  const map = ELEKTROMOBILNOST_2026_MAP;
  const zone = (id: FairMapZone["id"]) => map.zones.find((row) => row.id === id)!;
  const near = (polygon: readonly FairMapPoint[], [x, y]: FairMapPoint, slack: number) => {
    const [cx, cy] = fairMapLabelPoint(polygon);
    return Math.hypot(cx - x, cy - y) <= slack;
  };

  test("captured 7. 10. from the organizer's three files: hall, in front of the hall, rear area", () => {
    expect(map.capturedOn).toBe("2026-10-07");
    expect(map.zones.map((row) => [row.id, row.image.src, row.image.width, row.image.height, row.image.organizerFile])).toEqual([
      ["hala", "/sajam/mape/elektro-hala.jpg", 1375, 1080, "mapa-popunjena-0910-0710.jpg"],
      ["ispred", "/sajam/mape/elektro-ispred.jpg", 1239, 1080, "mapa-popunjena-0910-ispred-0510-1.jpg"],
      ["zadnji-deo", "/sajam/mape/elektro-zadnji-deo.jpg", 1920, 988, "mapa-zadnji-deo.jpg"],
    ]);
  });

  test("hall: the 11 organizer stands with their m², and the partner logos Hotel Lotos (by 10B) and Restoran Vidovdan (by 10A) as points", () => {
    const hall = zone("hala");
    expect(hall.locations.filter((row) => row.kind === "stand").map((row) => [row.id, row.label, row.areaM2])).toEqual([
      ["hala-1a", "1A", 60], ["hala-1b", "1B", 50], ["hala-1c", "1C", 50], ["hala-2", "2", 490], ["hala-5", "5", 160], ["hala-6", "6", 275],
      ["hala-9", "9", 110], ["hala-10a", "10A", 98], ["hala-10b", "10B", 132], ["hala-11", "11", 120], ["hala-12", "12", 14],
    ]);
    const partners = hall.locations.filter((row) => row.kind === "partner");
    expect(partners.map((row) => [row.id, row.label])).toEqual([["hala-partner-10b", "uz 10B"], ["hala-partner-10a", "uz 10A"]]);
    expect(near(partners[0].polygon, [398, 418], 8)).toBe(true);
    expect(near(partners[1].polygon, [393, 660], 8)).toBe(true);
    // A partner point takes the partner's stand row, but it is not a stand box.
    expect(isFairMapStandLocation("test-elektromobilnost-2026", "hala-partner-10b")).toBe(true);
  });

  test("in front of the hall: every box drawn anew; S1–S5 and the old ScanMe placeholder are gone", () => {
    const front = zone("ispred");
    expect(front.locations.map((row) => row.id)).toEqual([
      "ispred-12-1", "ispred-12-2", "ispred-13-1", "ispred-13-2", "ispred-13-3", "ispred-13-4", "ispred-14",
      "ispred-15-1", "ispred-15-2", "ispred-15-3", "ispred-15-4", "ispred-16", "ispred-17", "ispred-18", "ispred-19", "ispred-20-22",
    ]);
    for (const gone of ["ispred-s1", "ispred-s2", "ispred-s3", "ispred-s4", "ispred-s5", "scanme", "ispred-12", "ispred-13", "ispred-15", "ispred-20", "ispred-21", "ispred-22"]) {
      expect(fairMapLocationById("elektromobilnost-2026", gone), gone).toBeNull();
    }
    expect(front.locations.find((row) => row.id === "ispred-20-22")).toMatchObject({ label: "20–22", areaM2: 12 });
    expect(front.locations.filter((row) => !row.group).map((row) => [row.label, row.areaM2])).toEqual([
      ["14", 3], ["16", 1], ["17", 20], ["18", 1], ["19", 6], ["20–22", 12],
    ]);
  });

  test("split stands 12, 13 and 15: one label per group with the group's m²; box 13-3 exists although empty", () => {
    const front = zone("ispred");
    expect(front.groups).toEqual([
      { id: "ispred-12", label: "12", areaM2: 9, badge: [338, 27] },
      { id: "ispred-13", label: "13", areaM2: 12, badge: [65, 327] },
      { id: "ispred-15", label: "15", areaM2: 12, badge: [733, 254] },
    ]);
    expect(front.locations.filter((row) => row.group === "ispred-13").map((row) => row.id)).toEqual(["ispred-13-1", "ispred-13-2", "ispred-13-3", "ispred-13-4"]);
  });

  test("stand 14 is the ScanMe stand, organizer-confirmed (placement organizer), and the event's only ScanMe location", () => {
    expect(fairMapLocationById("elektromobilnost-2026", "ispred-14")).toEqual({
      zoneId: "ispred",
      location: { id: "ispred-14", label: "14", kind: "scanme", placement: "organizer", areaM2: 3, badge: [402, 192], polygon: expect.any(Array) },
    });
    expect(map.zones.flatMap((row) => row.locations).filter((row) => row.kind === "scanme").map((row) => row.id)).toEqual(["ispred-14"]);
  });

  test("landmarks drawn by the organizer: main entrance, parking rows, the totem and stairs; never a route", () => {
    expect(zone("ispred").landmarks.map((row) => row.kind).sort()).toEqual(["entrance", "parking", "stairs", "totem"]);
    expect(zone("zadnji-deo").landmarks.map((row) => row.kind).sort()).toEqual(["parking", "parking", "stairs", "stairs"]);
  });

  test("rear area: one open area location over the green outline, without stand numbers", () => {
    const rear = zone("zadnji-deo");
    expect(rear.locations.map((row) => [row.id, row.kind, row.label, row.placement])).toEqual([["zadnji-deo", "area", "Zadnji deo", "organizer"]]);
    expect(Math.abs(signedArea(rear.locations[0].polygon))).toBeGreaterThan(0.4 * rear.image.width * rear.image.height);
    expect(isFairMapStandLocation("elektromobilnost-2026", "zadnji-deo")).toBe(true);
  });
});

describe("N4: zone outlines and stand-number positions of the Elektro map", () => {
  test("each zone has its outline; numbers printed beside the boxes stay inside the image", () => {
    for (const zone of ELEKTROMOBILNOST_2026_MAP.zones) {
      expect(zone.outline?.length, zone.id).toBeGreaterThanOrEqual(3);
      const points = [...zone.locations.flatMap((row) => (row.badge ? [row.badge] : [])), ...(zone.groups ?? []).flatMap((row) => (row.badge ? [row.badge] : []))];
      for (const [x, y] of points) expect(x > 0 && x < zone.image.width && y > 0 && y < zone.image.height, `${zone.id} ${x},${y}`).toBe(true);
    }
    // The rear area's outline is its one area.
    const rear = ELEKTROMOBILNOST_2026_MAP.zones[2];
    expect(rear.outline).toEqual(rear.locations[0].polygon);
  });
});

describe("Auto Moto Fest 2026 geometry stays as it was (N3 changes only the Elektro map)", () => {
  test("two zones, the same location ids and the ScanMe placeholder", () => {
    expect(AUTO_MOTO_FEST_2026_MAP.capturedOn).toBe("2026-09-30");
    expect(AUTO_MOTO_FEST_2026_MAP.zones.map((zone) => [zone.id, zone.locations.map((row) => row.id)])).toEqual([
      ["hala", ["hala-1", "hala-2", "hala-3", "hala-5", "hala-6-7", "hala-8", "hala-9", "hala-10", "hala-11"]],
      ["ispred", ["ispred-12", "ispred-13", "ispred-14", "ispred-15", "ispred-16", "ispred-17", "ispred-18", "ispred-19", "ispred-20", "ispred-21", "ispred-22", "ispred-s1-s2", "ispred-s3", "ispred-s4", "ispred-s5", "scanme"]],
    ]);
    expect(AUTO_MOTO_FEST_2026_MAP.zones[1].locations.at(-1)).toMatchObject({ id: "scanme", kind: "scanme", placement: "placeholder" });
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
    // N3: the organizer's ScanMe stand takes the stands of Enigma IT and ScanMe; the AMF placeholder never does.
    expect(isFairMapStandLocation("test-elektromobilnost-2026", "ispred-14")).toBe(true);
    expect(isFairMapStandLocation("auto-moto-fest-2026", "scanme")).toBe(false);
    expect(isFairMapStandLocation("elektromobilnost-2026", "ispred-s1")).toBe(false);
  });
});

describe("public map event slug (M1)", () => {
  test("only next dev falls back from a real slug to its DEV TEST event; production never does", () => {
    expect(fairMapEventSlugCandidates("elektromobilnost-2026", false)).toEqual(["elektromobilnost-2026"]);
    expect(fairMapEventSlugCandidates("elektromobilnost-2026", true)).toEqual(["elektromobilnost-2026", "test-elektromobilnost-2026"]);
    expect(fairMapEventSlugCandidates("test-auto-moto-fest-2026", true)).toEqual(["test-auto-moto-fest-2026"]);
  });
});
