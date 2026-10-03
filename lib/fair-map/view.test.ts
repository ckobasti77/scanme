import { describe, expect, test } from "vitest";
import type { FairPassportCatalogEntry, FairPublicMapStand } from "../fair-contract";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { buildFairMapView, fairMapSearchKey, fairPassportProgressFor, searchFairMapStands } from "./view";
import type { FairMapGeometry } from "./types";

function stand(id: string, mapLocationId: string, brandId: string, brandName: string, models: string[]): FairPublicMapStand {
  return {
    standId: id,
    mapLocationId,
    code: `TEST-${id}`,
    displayName: `TEST štand ${id}`,
    exhibitorName: `TEST izlagač ${id}`,
    brands: [{ brandId, brandName, models: models.map((name, index) => ({ id: `${id}-m${index}`, slug: `${id}-m${index}`, displayName: name })) }],
  };
}

const volta = stand("a1", "hala-12", "brand-volta", "TEST Volta", ["TEST Volta X1", "TEST Volta X2"]);
const om = stand("b1", "ispred-18", "brand-om", "TEST Om", ["TEST Om Z1"]);
const lost = stand("c1", "hala-99", "brand-x", "TEST Čačak", ["TEST Đurđevak"]);
const passport: FairPassportCatalogEntry = {
  passportId: "p1",
  eventId: "e1",
  brandId: "brand-volta",
  brandName: "TEST Volta",
  standMapLocationIds: ["hala-12"],
  models: [
    { eventModelId: "a1-m0", slug: "a1-m0", displayName: "TEST Volta X1" },
    { eventModelId: "a1-m1", slug: "a1-m1", displayName: "TEST Volta X2" },
  ],
};

describe("buildFairMapView", () => {
  test("places catalog stands on their geometry zone by mapLocationId and keeps unknown ids apart", () => {
    const view = buildFairMapView(ELEKTROMOBILNOST_2026_MAP, [volta, om, lost], [passport]);
    const hala = view.zones.find((zone) => zone.zone.id === "hala")!;
    const ispred = view.zones.find((zone) => zone.zone.id === "ispred")!;
    expect(hala.stands.map((row) => [row.stand.standId, row.location.label])).toEqual([["a1", "12"]]);
    expect(ispred.stands.map((row) => [row.stand.standId, row.location.label])).toEqual([["b1", "18"]]);
    expect(view.unplaced.map((row) => row.standId)).toEqual(["c1"]);
  });

  test("marks only the stands whose brand has an active passport", () => {
    const view = buildFairMapView(ELEKTROMOBILNOST_2026_MAP, [volta, om], [passport]);
    const placed = view.zones.flatMap((zone) => zone.stands);
    expect(placed.find((row) => row.stand.standId === "a1")!.passports.map((entry) => entry.passportId)).toEqual(["p1"]);
    expect(placed.find((row) => row.stand.standId === "b1")!.passports).toEqual([]);
  });

  test("a placeholder ScanMe location is never shown publicly; an organizer-confirmed one is", () => {
    expect(buildFairMapView(ELEKTROMOBILNOST_2026_MAP, [], []).zones.map((zone) => zone.scanme)).toEqual([null, null]);
    const confirmed: FairMapGeometry = {
      ...ELEKTROMOBILNOST_2026_MAP,
      zones: ELEKTROMOBILNOST_2026_MAP.zones.map((zone) => ({
        ...zone,
        locations: zone.locations.map((location) => (location.kind === "scanme" ? { ...location, placement: "organizer" as const } : location)),
      })),
    };
    expect(buildFairMapView(confirmed, [], []).zones.find((zone) => zone.zone.id === "ispred")!.scanme?.id).toBe("scanme");
  });
});

describe("fairPassportProgressFor", () => {
  test("is unknown before the gateway answers, then N/M of the visitor (0/M without a stamp)", () => {
    expect(fairPassportProgressFor(null, passport)).toBeNull();
    expect(fairPassportProgressFor([], passport)).toEqual({ stamped: 0, required: 2, completed: false });
    expect(
      fairPassportProgressFor([{ passportId: "p1", stampedModelIds: ["a1-m0"], stampedCount: 1, requiredCount: 2, completed: false }], passport),
    ).toEqual({ stamped: 1, required: 2, completed: false });
  });
});

describe("searchFairMapStands", () => {
  const placed = buildFairMapView(ELEKTROMOBILNOST_2026_MAP, [volta, om], []).zones.flatMap((zone) => zone.stands);

  test("matches exhibitor, brand, model and stand label; every word must match", () => {
    expect(searchFairMapStands(placed, "volta x2").map((row) => row.stand.standId)).toEqual(["a1"]);
    expect(searchFairMapStands(placed, "om").map((row) => row.stand.standId)).toEqual(["b1"]);
    expect(searchFairMapStands(placed, "18").map((row) => row.stand.standId)).toEqual(["b1"]);
    expect(searchFairMapStands(placed, "volta om")).toEqual([]);
    expect(searchFairMapStands(placed, "   ")).toEqual([]);
  });

  test("ignores case and Serbian diacritics", () => {
    expect(fairMapSearchKey("Čačak ĐURĐEVAK")).toBe("cacak djurdjevak");
    expect(searchFairMapStands(placed, "IZLAGAC A1").map((row) => row.stand.standId)).toEqual(["a1"]);
  });
});
