import { describe, expect, test } from "vitest";
import { FAIR_MAP_ROTATION_INTERVAL_MS } from "../fair-client/rotation-slot";
import type { FairSponsoredModelCard, FairSponsoredRotationView } from "../fair-contract";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { fairMapRotationAt, fairMapRotationSlotNumber, locateFairMapStand } from "./rotation";
import { buildFairMapView } from "./view";

const EPOCH = Date.parse("2026-10-09T09:00:00+02:00");

function card(id: string, standMapLocationId: string, order: number): FairSponsoredModelCard {
  return {
    eventModelId: id,
    eventId: "e1",
    eventSlug: "test-elektromobilnost-2026",
    slug: id,
    brandId: "b1",
    brandName: "TEST Volta",
    displayName: `TEST ${id}`,
    priceText: "TEST cena",
    visual: "event_placeholder",
    standMapLocationId,
    order,
  };
}

const rotation: FairSponsoredRotationView = {
  surface: "map",
  eventId: "e1",
  snapshotId: "s1",
  version: 1,
  dayKey: "2026-10-09",
  seed: "fair-sponsored-v1:e1",
  epochMs: EPOCH,
  intervalMs: FAIR_MAP_ROTATION_INTERVAL_MS,
  items: [card("m1", "hala-12", 0), card("m2", "ispred-18", 1), card("m3", "hala-2", 2)],
};

describe("fairMapRotationAt (Kodeks rotation-slot over the B5 projection)", () => {
  test("12 s slots: every model once per cycle, in snapshot order", () => {
    const seen = Array.from({ length: 6 }, (_, slot) => fairMapRotationAt(rotation, EPOCH + slot * 12_000 + 5)!.item.eventModelId);
    expect(seen).toEqual(["m1", "m2", "m3", "m1", "m2", "m3"]);
  });

  test("two instances reading the same projection at the same moment show the same slot", () => {
    for (const now of [EPOCH - 60_000, EPOCH, EPOCH + 11_999, EPOCH + 12_000, EPOCH + 7 * 3_600_000 + 123]) {
      const a = fairMapRotationAt(structuredClone(rotation), now);
      const b = fairMapRotationAt(structuredClone(rotation), now);
      expect(a).toEqual(b);
      expect(fairMapRotationSlotNumber(rotation, now)).toBe(a!.slotNumber);
    }
    expect(fairMapRotationAt(rotation, EPOCH + 11_999)!.nextSlotAt).toBe(EPOCH + 12_000);
  });

  test("no snapshot or an empty one means no rotation", () => {
    expect(fairMapRotationAt(null, EPOCH)).toBeNull();
    expect(fairMapRotationAt({ ...rotation, items: [] }, EPOCH)).toBeNull();
    expect(fairMapRotationSlotNumber(null, EPOCH)).toBe(-1);
  });
});

describe("locateFairMapStand", () => {
  test("finds the zone and polygon of a stand, with the catalog stand id when it is published there", () => {
    const view = buildFairMapView(
      ELEKTROMOBILNOST_2026_MAP,
      [{ standId: "st1", mapLocationId: "hala-12", code: "TEST-A1", displayName: "TEST", exhibitorName: "TEST A", brands: [] }],
      [],
    );
    expect(locateFairMapStand(view, "hala-12")).toMatchObject({ zoneId: "hala", standId: "st1", location: { label: "12" } });
    expect(locateFairMapStand(view, "ispred-18")).toMatchObject({ zoneId: "ispred", standId: null });
    expect(locateFairMapStand(view, "scanme")).toBeNull();
    expect(locateFairMapStand(view, "hala-99")).toBeNull();
  });
});
