import { describe, expect, test } from "vitest";
import {
  fairMapDeepLinkSearch,
  fairMapDirectory,
  fairMapExhibitors,
  fairMapFilterCounts,
  fairMapLitLocations,
  fairMapLocationSummary,
  fairMapReadDeepLink,
  fairMapScanmeTarget,
  fairMapSearch,
} from "./explore";
import { buildFairMapPreview } from "./preview-fixture";

// N4 — map v2 logic over the organizer's real list (38 exhibitors on the 7. 10.
// maps) with the preview's TEST models: filters and their counts, search,
// dimming, the directory, the selected location and the ?zona=/?stand= link.

const { view } = buildFairMapPreview();

describe("exhibitors and filter counts", () => {
  test("every exhibitor once with all its places; Venera Bike has three, Markus Pro none", () => {
    const list = fairMapExhibitors(view);
    expect(list).toHaveLength(38);
    expect(list.find((row) => row.exhibitorName === "Venera Bike")!.places.map((place) => place.location.id)).toEqual(["hala-12", "ispred-19", "ispred-20-22"]);
    const markus = list.find((row) => row.exhibitorName === "Auto servis Markus Pro")!;
    expect(markus.places).toEqual([]);
    expect(markus.withoutLocation).toEqual({ zoneId: "ispred" });
  });

  test("the chips count exhibitors per category (NOC §3), Sve counts everyone", () => {
    expect(fairMapFilterCounts(view)).toEqual({ sve: 38, automobili: 17, moto: 4, energija: 2, usluge: 8, hrana: 2, ostalo: 3, scanme: 2 });
  });
});

describe("dimming and search", () => {
  test("nothing dims without a filter or query; a filter keeps only its stands lit (shared stand: one match is enough)", () => {
    expect(fairMapLitLocations(view, "sve", "  ")).toBeNull();
    expect([...fairMapLitLocations(view, "automobili", "")!].sort()).toEqual(["hala-10b", "hala-11", "hala-1a", "hala-1b", "hala-2", "hala-5", "hala-6", "hala-9"]);
    // Stand 2 holds cars and Motogrini (moto): it stays lit for both filters.
    expect([...fairMapLitLocations(view, "moto", "")!].sort()).toEqual(["hala-10a", "hala-12", "hala-1c", "hala-2", "ispred-19", "ispred-20-22"]);
    expect([...fairMapLitLocations(view, "scanme", "")!]).toEqual(["ispred-14"]);
    expect([...fairMapLitLocations(view, "hrana", "")!].sort()).toEqual(["hala-partner-10a", "hala-partner-10b"]);
  });

  test("search covers exhibitor, brand and model, ignores case and diacritics, and every word must match", () => {
    expect(fairMapSearch(view, "sve", "SKODA").map((row) => [row.exhibitorName, row.place?.location.id])).toEqual([["Škoda", "hala-11"]]);
    expect(fairMapSearch(view, "sve", "citroen").map((row) => row.exhibitorName)).toEqual(["Citroën"]);
    expect(fairMapSearch(view, "sve", "test model c")).toEqual([
      expect.objectContaining({ exhibitorName: "Toyota", models: ["TEST model C"], place: expect.objectContaining({ zoneId: "hala" }) }),
    ]);
    expect(fairMapSearch(view, "sve", "byd toyota")).toEqual([]);
    expect(fairMapSearch(view, "sve", "venera").map((row) => row.place?.location.id)).toEqual(["hala-12", "ispred-19", "ispred-20-22"]);
  });

  test("an exhibitor without a place is found too (with its zone), but not outside its category", () => {
    expect(fairMapSearch(view, "sve", "markus")).toEqual([expect.objectContaining({ exhibitorName: "Auto servis Markus Pro", place: null, zoneHint: "ispred" })]);
    expect(fairMapSearch(view, "automobili", "markus")).toEqual([]);
    expect(fairMapSearch(view, "usluge", "markus")).toHaveLength(1);
  });

  test("results are capped", () => {
    expect(fairMapSearch(view, "sve", "a", 5)).toHaveLength(5);
  });
});

describe("directory", () => {
  test("groups in filter order, names sorted; a chosen filter shows only its group", () => {
    const groups = fairMapDirectory(view, "sve");
    expect(groups.map((group) => [group.key, group.entries.length])).toEqual([
      ["automobili", 17], ["moto", 4], ["energija", 2], ["usluge", 8], ["hrana", 2], ["ostalo", 3], ["scanme", 2],
    ]);
    expect(groups[6].entries.map((entry) => entry.exhibitorName)).toEqual(["Enigma IT", "ScanMe"]);
    expect(fairMapDirectory(view, "hrana").map((group) => group.entries.map((entry) => entry.exhibitorName))).toEqual([["Hotel Lotos", "Restoran Vidovdan"]]);
  });
});

describe("selected location", () => {
  test("stand 2: zone, label, m² and its six exhibitors by name; the one chosen from the list comes first", () => {
    const summary = fairMapLocationSummary(view, "hala-2")!;
    expect(summary).toMatchObject({ zoneId: "hala", label: "2", areaM2: 490 });
    expect(summary.stands.map((row) => row.stand.exhibitorName)).toEqual(["BYD", "Citroën", "Farizon", "Geely", "Motogrini", "Toyota"]);
    expect(fairMapLocationSummary(view, "hala-2", "fixture-toyota")!.stands[0].stand.exhibitorName).toBe("Toyota");
  });

  test("a box of a split stand shows its group's label and m²; empty or unknown locations are not selectable", () => {
    expect(fairMapLocationSummary(view, "ispred-13-2")).toMatchObject({ label: "13", areaM2: 12, group: { id: "ispred-13" } });
    expect(fairMapLocationSummary(view, "ispred-16")).toBeNull();
    expect(fairMapLocationSummary(view, "hala-99")).toBeNull();
  });

  test("Pronađi ScanMe goes to the organizer's stand 14", () => {
    expect(fairMapScanmeTarget(view)).toEqual({ zoneId: "ispred", locationId: "ispred-14" });
  });
});

describe("deep link ?zona= / ?stand=", () => {
  test("a stand opens its zone and itself (it wins over a different zona); unknown values are ignored", () => {
    expect(fairMapReadDeepLink({ stand: "hala-2" }, view)).toEqual({ zoneId: "hala", locationId: "hala-2" });
    expect(fairMapReadDeepLink({ zona: "ispred" }, view)).toEqual({ zoneId: "ispred", locationId: null });
    expect(fairMapReadDeepLink({ zona: "ispred", stand: "hala-2" }, view)).toEqual({ zoneId: "hala", locationId: "hala-2" });
    expect(fairMapReadDeepLink({ zona: ["zadnji-deo", "hala"], stand: [" ispred-14 "] }, view)).toEqual({ zoneId: "ispred", locationId: "ispred-14" });
    expect(fairMapReadDeepLink({ zona: "krov", stand: "ispred-16" }, view)).toEqual({ zoneId: null, locationId: null });
    expect(fairMapReadDeepLink({}, view)).toEqual({ zoneId: null, locationId: null });
  });

  test("writing the link keeps every other parameter (prikaz) and removes what is cleared", () => {
    expect(fairMapDeepLinkSearch("?prikaz=ekran", { zoneId: "hala", locationId: "hala-2" })).toBe("?prikaz=ekran&zona=hala&stand=hala-2");
    expect(fairMapDeepLinkSearch("?prikaz=ekran&zona=hala&stand=hala-2", { zoneId: "ispred", locationId: null })).toBe("?prikaz=ekran&zona=ispred");
    expect(fairMapDeepLinkSearch("?stand=hala-2", { zoneId: null, locationId: null })).toBe("");
  });
});
