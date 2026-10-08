import { describe, expect, test } from "vitest";
import type { FairPassportCatalogEntry, FairPublicMapStand } from "../fair-contract";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { buildFairMapView, fairMapPlacedLocation, fairMapSearchKey, fairPassportProgressFor, searchFairMapStands } from "./view";
import type { FairMapGeometry } from "./types";

function stand(id: string, mapLocationId: string, brandId: string, brandName: string, models: string[]): FairPublicMapStand {
  return {
    participationId: `p-${id}`,
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
    expect(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [], []).zones.map((zone) => zone.scanme)).toEqual([null, null]);
    // N3: the organizer confirmed stand 14 in front of the hall for the Elektro fair.
    expect(buildFairMapView(ELEKTROMOBILNOST_2026_MAP, [], []).zones.map((zone) => zone.scanme?.id ?? null)).toEqual([null, "ispred-14", null]);
    const confirmed: FairMapGeometry = {
      ...AUTO_MOTO_FEST_2026_MAP,
      zones: AUTO_MOTO_FEST_2026_MAP.zones.map((zone) => ({
        ...zone,
        locations: zone.locations.map((location) => (location.kind === "scanme" ? { ...location, placement: "organizer" as const } : location)),
      })),
    };
    expect(buildFairMapView(confirmed, [], []).zones.find((zone) => zone.zone.id === "ispred")!.scanme?.id).toBe("scanme");
  });
});

describe("buildFairMapView with every exhibitor (N3)", () => {
  const bare = (id: string, mapLocationId: string, exhibitorName: string): FairPublicMapStand => ({
    participationId: `p-${id}`, standId: id, mapLocationId, code: id, displayName: `TEST ${id}`, exhibitorName, brands: [],
  });

  test("exhibitors without a model, a shared location, partner points, the ScanMe stand and the rear area are all placed", () => {
    const stands = [
      volta,
      bare("byd", "hala-2", "TEST BYD"),
      bare("toyota", "hala-2", "TEST Toyota"),
      bare("lotos", "hala-partner-10b", "TEST Hotel"),
      bare("enigma", "ispred-14", "TEST Enigma"),
      bare("scanme", "ispred-14", "TEST ScanMe"),
      bare("venera-19", "ispred-19", "TEST Venera"),
      bare("venera-20", "ispred-20-22", "TEST Venera"),
      bare("auto1", "zadnji-deo", "TEST AUTO1"),
    ];
    const view = buildFairMapView(ELEKTROMOBILNOST_2026_MAP, stands, [], [{ participationId: "p-markus", exhibitorName: "TEST Markus", zoneId: "ispred" }]);
    expect(view.zones.map((zone) => [zone.zone.id, zone.stands.length])).toEqual([["hala", 4], ["ispred", 4], ["zadnji-deo", 1]]);
    expect(view.unplaced).toEqual([]);
    expect(view.withoutLocation.map((row) => [row.exhibitorName, row.zoneId])).toEqual([["TEST Markus", "ispred"]]);
    // One entry per occupied location, in geometry order; a shared one lists all its stands.
    expect(view.zones[0].locations.map((row) => [row.location.id, row.stands.map((stand) => stand.stand.standId)])).toEqual([
      ["hala-2", ["byd", "toyota"]],
      ["hala-12", ["a1"]],
      ["hala-partner-10b", ["lotos"]],
    ]);
    expect(fairMapPlacedLocation(view, "ispred-14")).toMatchObject({ zoneId: "ispred", location: { kind: "scanme" }, stands: [{ stand: { standId: "enigma" } }, { stand: { standId: "scanme" } }] });
    expect(fairMapPlacedLocation(view, "zadnji-deo")).toMatchObject({ zoneId: "zadnji-deo", location: { kind: "area" } });
    expect(fairMapPlacedLocation(view, "ispred-16")).toBeNull();
  });

  test("a location that is not on the organizer map (the AMF ScanMe placeholder) takes no stand", () => {
    const view = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [bare("x", "scanme", "TEST X")], []);
    expect(view.unplaced.map((row) => row.standId)).toEqual(["x"]);
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
