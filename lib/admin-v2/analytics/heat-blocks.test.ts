import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { fairMapForEventCode, fairMapLocationTakesStands, type FairMapGeometry, type FairMapLocation } from "@/lib/fair-map";
import { heatBlocks, locationScans } from "./heat-blocks";
import type { AnalyticsHeatRow, AnalyticsModel } from "./types";

// ADMIN v2 X3 — the hall heat map as blocks: the stands of the map, the heights
// from the scans, the colour level from the heat read. The map of Elektromobilnost
// has two zones ("hala" and "ispred"): they stand side by side on one floor.

const geometry = fairMapForEventCode("elektromobilnost-2026")!;
const [firstZone, secondZone] = geometry.zones;
const id = (value: string) => value as Id<"fairEventModels">;

const heatRow = (locationId: string, count: number, share: number, level: number): AnalyticsHeatRow => ({ locationId, count, share, level });
const model = (key: string, mapLocationId: string, scans: { today: number; total: number }): AnalyticsModel => ({
  eventModelId: id(key),
  name: `TEST ${key}`,
  brandName: "TEST Brend",
  exhibitorName: "TEST Izlagač",
  standCode: "1",
  mapLocationId,
  tier: "included",
  scans,
  uniquePerModel: { today: 0, total: 0 },
  leads: 0,
  votes: 0,
  rating: null,
});

describe("heatBlocks: the zones", () => {
  const scene = heatBlocks(geometry, [], new Map());

  test("the map has two zones", () => {
    expect(geometry.zones).toHaveLength(2);
    expect(scene.zones.map((zone) => zone.id)).toEqual([firstZone.id, secondZone.id]);
  });

  test("zones stand side by side: the first at 0, the second beyond the width of the first", () => {
    expect(scene.zones[0].offsetX).toBe(0);
    expect(scene.zones[1].offsetX).toBeGreaterThan(scene.zones[0].width);
  });

  test("the gap between zones is 8 % of the wider zone", () => {
    const gap = Math.max(firstZone.image.width, secondZone.image.width) * 0.08;
    expect(scene.zones[1].offsetX).toBeCloseTo(firstZone.image.width + gap, 6);
  });

  test("the floor is as wide as both zones and the gap, and as deep as the deeper zone", () => {
    expect(scene.width).toBeCloseTo(scene.zones[1].offsetX + secondZone.image.width, 6);
    expect(scene.depth).toBe(Math.max(firstZone.image.height, secondZone.image.height));
  });

  test("the outline of the second zone is moved by its offset", () => {
    expect(secondZone.outline).toBeDefined();
    const moved = scene.zones[1].outline!;
    expect(moved).toHaveLength(secondZone.outline!.length);
    moved.forEach(([x, y], index) => {
      expect(x).toBeCloseTo(secondZone.outline![index][0] + scene.zones[1].offsetX, 6);
      expect(y).toBe(secondZone.outline![index][1]);
    });
  });

  test("the size of a zone is the size of its image", () => {
    expect(scene.zones[0]).toMatchObject({ width: firstZone.image.width, height: firstZone.image.height });
    expect(scene.zones[1]).toMatchObject({ width: secondZone.image.width, height: secondZone.image.height });
  });
});

describe("heatBlocks: which locations are blocks", () => {
  test("every location that takes stands is a block, in the order of the map", () => {
    const expected = geometry.zones.flatMap((zone) => zone.locations.filter(fairMapLocationTakesStands).map((location) => location.id));
    const scene = heatBlocks(geometry, [], new Map());
    expect(scene.blocks.map((block) => block.locationId)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(10);
  });

  test("a placeholder location that is not on the organizer map is not a block", () => {
    const placeholder: FairMapLocation = { id: "test-placeholder", label: "TEST", kind: "stand", placement: "placeholder", polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] };
    const withPlaceholder: FairMapGeometry = { ...geometry, zones: [{ ...firstZone, locations: [...firstZone.locations, placeholder] }, secondZone] };
    const scene = heatBlocks(withPlaceholder, [], new Map([["test-placeholder", 50]]));
    expect(scene.blocks.some((block) => block.locationId === "test-placeholder")).toBe(false);
    expect(scene.blocks).toHaveLength(heatBlocks(geometry, [], new Map()).blocks.length);
    expect(scene.maxValue).toBe(0);
  });

  test("a block knows its zone and label", () => {
    const scene = heatBlocks(geometry, [], new Map());
    const nine = scene.blocks.find((block) => block.locationId === "hala-9")!;
    expect(nine.zoneId).toBe(firstZone.id);
    expect(nine.label).toBe("9");
    const fourteen = scene.blocks.find((block) => block.locationId === "ispred-14")!;
    expect(fourteen.zoneId).toBe(secondZone.id);
  });
});

describe("heatBlocks: the polygons", () => {
  const scene = heatBlocks(geometry, [], new Map());
  const offsetOf = (zoneId: string) => scene.zones.find((zone) => zone.id === zoneId)!.offsetX;

  test("a block of the first zone keeps its outline", () => {
    const original = firstZone.locations.find((location) => location.id === "hala-9")!;
    const block = scene.blocks.find((entry) => entry.locationId === "hala-9")!;
    expect(block.polygon).toEqual(original.polygon.map(([x, y]) => [x, y]));
  });

  test("a block of the second zone is moved by the offset of its zone, in x only", () => {
    const original = secondZone.locations.find((location) => location.id === "ispred-17")!;
    const block = scene.blocks.find((entry) => entry.locationId === "ispred-17")!;
    const offset = offsetOf(secondZone.id);
    expect(offset).toBeGreaterThan(0);
    block.polygon.forEach(([x, y], index) => {
      expect(x).toBeCloseTo(original.polygon[index][0] + offset, 6);
      expect(y).toBe(original.polygon[index][1]);
    });
  });

  test("the label stands inside the bounding box of the moved outline", () => {
    for (const block of scene.blocks) {
      const xs = block.polygon.map(([x]) => x);
      const ys = block.polygon.map(([, y]) => y);
      expect(block.center[0]).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(block.center[0]).toBeLessThanOrEqual(Math.max(...xs));
      expect(block.center[1]).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(block.center[1]).toBeLessThanOrEqual(Math.max(...ys));
    }
  });
});

describe("heatBlocks: heights", () => {
  const values = new Map([["hala-9", 40], ["hala-6", 20], ["ispred-17", 10]]);
  const scene = heatBlocks(geometry, [], values);
  const block = (locationId: string) => scene.blocks.find((entry) => entry.locationId === locationId)!;

  test("the tallest block is 1 and the others are value / the biggest", () => {
    expect(scene.maxValue).toBe(40);
    expect(block("hala-9").height).toBe(1);
    expect(block("hala-6").height).toBe(0.5);
    expect(block("ispred-17").height).toBe(0.25);
  });

  test("a block without a value is flat", () => {
    expect(block("hala-1a").value).toBe(0);
    expect(block("hala-1a").height).toBe(0);
  });

  test("a value carries over as it is", () => {
    expect(block("hala-9").value).toBe(40);
  });

  test("no scans anywhere: every block is flat and the maximum is 0", () => {
    const flat = heatBlocks(geometry, [], new Map());
    expect(flat.maxValue).toBe(0);
    expect(flat.blocks.every((entry) => entry.height === 0 && entry.value === 0)).toBe(true);
  });

  test("a negative value is read as 0", () => {
    const negative = heatBlocks(geometry, [], new Map([["hala-9", -5], ["hala-6", 4]]));
    expect(negative.blocks.find((entry) => entry.locationId === "hala-9")!.value).toBe(0);
    expect(negative.maxValue).toBe(4);
  });

  test("a value for a location that is not on the map is ignored", () => {
    const stray = heatBlocks(geometry, [], new Map([["no-such-place", 99], ["hala-9", 3]]));
    expect(stray.maxValue).toBe(3);
  });
});

describe("heatBlocks: the heat read", () => {
  const heat = [heatRow("hala-9", 168, 0.4, 0.9), heatRow("hala-6", 101, 0.25, 0.5)];
  const scene = heatBlocks(geometry, heat, new Map([["hala-9", 1]]));
  const block = (locationId: string) => scene.blocks.find((entry) => entry.locationId === locationId)!;

  test("level, count and share come from the heat row of the location", () => {
    expect(block("hala-9")).toMatchObject({ level: 0.9, count: 168, share: 0.4 });
    expect(block("hala-6")).toMatchObject({ level: 0.5, count: 101, share: 0.25 });
  });

  test("a location without a heat row has level 0 and no count or share", () => {
    expect(block("hala-1a")).toMatchObject({ level: 0, count: null, share: null });
  });

  test("the level does not depend on the height", () => {
    expect(block("hala-6").height).toBe(0);
    expect(block("hala-6").level).toBe(0.5);
  });
});

describe("locationScans", () => {
  const models = [
    model("a", "hala-9", { today: 5, total: 20 }),
    model("b", "hala-9", { today: 2, total: 7 }),
    model("c", "hala-6", { today: 0, total: 3 }),
    model("d", "", { today: 9, total: 90 }),
  ];

  test("sums the scans of the period per map location", () => {
    expect(locationScans(models, "total")).toEqual(new Map([["hala-9", 27], ["hala-6", 3]]));
    expect(locationScans(models, "today")).toEqual(new Map([["hala-9", 7], ["hala-6", 0]]));
  });

  test("skips a model without a map location", () => {
    expect(locationScans(models, "total").has("")).toBe(false);
    expect([...locationScans(models, "total").values()].reduce((total, value) => total + value, 0)).toBe(30);
  });

  test("no models, no locations", () => {
    expect(locationScans([], "total").size).toBe(0);
  });
});
