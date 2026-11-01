import { describe, expect, test } from "vitest";
import type { FairPublicMapStand } from "../fair-contract";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { buildFairMapView } from "./view";
import { AMF_ENTRANCE_ANCHORS, AMF_HALL_ANCHORS, AMF_MAP_HEAT_STEPS, AMF_MAP_LEGEND_STEPS, amfMapHeatStep, amfTopographicPopupPosition, amfTopographicSize, buildAmfTopographicExhibits, fairMapContourOpacity, fairMapContourPath, fairMapHeatEligible, fairMapTopographicLevel, hitAmfTopographicExhibit, searchAmfTopographicExhibits } from "./topography";
import { fairMapWebsiteUrl } from "./websites";
import { amfEntrancePoint } from "./amf-entrance-plan";

function stand(name: string, location: string, extra = {}): FairPublicMapStand {
  return {
    participationId: `fixture-${name}`,
    exhibitorName: name,
    standId: `fixture-stand-${name}`,
    mapLocationId: location,
    code: "fixture",
    displayName: name,
    brands: [{ brandId: `fixture-brand-${name}`, brandName: name, models: [{ id: `fixture-model-${name}`, slug: `fixture-${name.toLowerCase()}`, displayName: `${name} model` }] }],
    ...extra,
  };
}

describe("AMF topographic heat eligibility", () => {
  test("explicit paid/active flag wins, including an explicit opt-out", () => {
    expect(fairMapHeatEligible({ heatEligible: true, packageTier: "included" })).toBe(true);
    expect(fairMapHeatEligible({ heatEligible: false, packageTier: "advanced" })).toBe(false);
  });
  test("falls back to existing entitlement rules, not scan levels or passports", () => {
    expect(fairMapHeatEligible({ packageTier: "included" })).toBe(false);
    expect(fairMapHeatEligible({ packageTier: "starter" })).toBe(true);
    expect(fairMapHeatEligible({ packageTier: "advanced" })).toBe(true);
    expect(fairMapHeatEligible({ brands: [{ models: [{ packageTier: "included" }, { packageTier: "starter" }] }] })).toBe(true);
    expect(fairMapHeatEligible({})).toBe(false);
  });
  test.each([0, 1, 2, 3, 4, 5])("fixed band profile, visible and below 1 (band %d)", (band) => {
    expect(fairMapContourOpacity(true, band)).toBeGreaterThanOrEqual(0.1);
    expect(fairMapContourOpacity(true, band)).toBeLessThanOrEqual(0.8 + 1e-9);
    if (band > 0) expect(fairMapContourOpacity(true, band)).toBeGreaterThan(fairMapContourOpacity(true, band - 1));
  });
  test.each([[0, 1], [0.01, 2], [0.5, 5], [1, 9], [NaN, 1], [-1, 1], [5, 9]])("heat level %d is step %d", (level, step) => {
    expect(amfMapHeatStep(level)).toBe(step);
  });
  test("nine steps from muted yellow to the bright orange, legend 1/5/9", () => {
    expect(AMF_MAP_HEAT_STEPS).toHaveLength(9);
    expect(AMF_MAP_HEAT_STEPS[0]).toBe("#d8c27a");
    expect(AMF_MAP_HEAT_STEPS[8]).toBe("#e2602a");
    expect(AMF_MAP_LEGEND_STEPS).toEqual([1, 5, 9]);
  });
});

describe("AMF topographic geometry and catalog", () => {
  const view = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Toyota", "hala-2", { heatEligible: true }), stand("Audi", "hala-1", { heatEligible: false }), stand("Partner bez paketa", "hala-3", { brands: [] })], []);
  const items = buildAmfTopographicExhibits(view);

  test("all entrance exhibitors remain visible, with the forecourt separate from the foyer", () => {
    for (const anchor of AMF_ENTRANCE_ANCHORS) expect(items.find((item) => item.key === anchor.key)).toMatchObject({ zoneId: "ispred", area: anchor.area, models: [], paid: false });
    expect(AMF_ENTRANCE_ANCHORS.filter((item) => item.area === "outdoor").map((item) => item.key)).toEqual(["moto-revolution", "aodes", "xtreme", "auto-happy-outdoor", "swm", "kia"]);
    const [x, y] = amfEntrancePoint([380, 205]);
    expect(items.find((item) => item.key === "scanme")).toMatchObject({ locationId: "ispred-14", x, y, paid: false });
    // 30 Oct 2026 (owner): SWM's S6 got its shared location id.
    expect(items.find((item) => item.key === "swm")?.locationId).toBe("ispred-s6");
  });
  test("foyer booths cannot heat, even if the same paid exhibitor also has outdoor vehicles", () => {
    const paid = { heatEligible: true, participationId: "same-auto-happy" };
    const catalog = [stand("Auto Happy", "ispred-19", paid), stand("Auto Happy", "ispred-s4", paid), stand("Goes", "ispred-17", { heatEligible: true })];
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, catalog, []));
    expect(all.find((item) => item.key === "auto-happy-foyer")).toMatchObject({ paid: false, locationId: "ispred-19" });
    expect(all.find((item) => item.key === "auto-happy-outdoor")).toMatchObject({ paid: true, locationId: "ispred-s4" });
    const goes = all.find((item) => item.key === "goes")!;
    expect(goes.paid).toBe(false);
    expect(fairMapTopographicLevel(goes, all, new Map([["ispred-17", 1]]), new Map([["fixture-Goes", 1]]))).toBe(0);
  });
  test("entrance website links work without payment; an unpublished Makete URL is not invented", () => {
    for (const anchor of AMF_ENTRANCE_ANCHORS.filter((item) => item.key !== "makete")) expect(items.find((item) => item.key === anchor.key)?.websiteUrl).toMatch(/^https?:\/\//);
    expect(items.find((item) => item.key === "makete")?.websiteUrl).toBeUndefined();
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Enigma IT", "ispred-14", { websiteUrl: "https://www.enigmait.rs/" })], []));
    expect(all.find((item) => item.key === "scanme")).toMatchObject({ participationId: "fixture-Enigma IT", websiteUrl: "https://www.enigmait.rs/" });
  });

  test("all plan brands and every additional free catalog exhibitor remain visible", () => {
    for (const anchor of AMF_HALL_ANCHORS) expect(items.some((item) => item.key === anchor.key)).toBe(true);
    expect(items.find((item) => item.name === "Partner bez paketa")).toMatchObject({ paid: false, models: [] });
    expect(items.find((item) => item.key === "toyota")?.paid).toBe(true);
    expect(items.find((item) => item.key === "audi")?.paid).toBe(false);
  });
  test("preserves mapLocationIds and never invents models or passport completions", () => {
    expect(items.find((item) => item.key === "toyota")).toMatchObject({ locationId: "hala-2", models: [{ id: "fixture-model-Toyota" }] });
    expect(items.find((item) => item.key === "mercedes")).toMatchObject({ models: [], passportIds: [], paid: false });
    expect(items.find((item) => item.key === "grawe")?.locationId).toBeNull();
  });
  test("one paid package enables the exhibitor's other stand, but never another exhibitor sharing the place", () => {
    const paid = stand("Toyota", "hala-2", { participationId: "same-exhibitor", packageTier: "starter" });
    const included = stand("Audi", "hala-1", { participationId: "same-exhibitor", packageTier: "included" });
    const free = stand("Volkswagen", "hala-1", { participationId: "other-exhibitor", packageTier: "included", brands: [] });
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [paid, included, free], []));
    expect(all.find((item) => item.key === "audi")?.paid).toBe(true);
    expect(all.find((item) => item.key === "vw")?.paid).toBe(false);
    const audi = all.find((item) => item.key === "audi")!;
    expect(fairMapTopographicLevel(audi, all, new Map([["hala-1", 1]]))).toBe(0);
    expect(fairMapTopographicLevel(audi, all, new Map([["hala-1", 1]]), new Map([["same-exhibitor", 0.35]]))).toBe(0.35);
    expect(fairMapTopographicLevel(all.find((item) => item.key === "vw")!, all, new Map([["hala-1", 1]]), new Map([["other-exhibitor", 1]]))).toBe(0);
  });
  test("any ScanMe package with a model tints the booth; a brand level wins on a shared location", () => {
    const starter = stand("Audi", "hala-1", { participationId: "starter-exhibitor", packageTier: "starter" });
    const free = stand("Volkswagen", "hala-1", { participationId: "catalog-only", brands: [] });
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [starter, free], []));
    const audi = all.find((item) => item.key === "audi")!;
    expect(audi.paid).toBe(true);
    expect(all.find((item) => item.key === "vw")?.paid).toBe(false);
    expect(fairMapTopographicLevel(audi, all, new Map([["hala-1", 1]]))).toBe(0);
    expect(fairMapTopographicLevel(audi, all, new Map([["hala-1", 1]]), undefined, new Map([["fixture-brand-Audi", 0.4]]))).toBe(0.4);
  });
  test("an unknown brand never inherits another brand's payment from location alone", () => {
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Audi", "hala-1", { heatEligible: true })], []));
    expect(all.find((item) => item.key === "audi")?.paid).toBe(true);
    expect(all.find((item) => item.key === "vw")).toMatchObject({ paid: false, participationId: null, models: [] });
  });
  test("Raiffeisen remains a small edge footprint, and north landmarks stay in place", () => {
    const bank = items.find((item) => item.key === "raiffeisen")!;
    const dongfeng = items.find((item) => item.key === "dongfeng")!;
    expect(bank.small).toBe(true);
    expect(bank.x).toBeLessThan(326);
    expect(bank.y).toBeLessThan(1195);
    expect(Math.hypot((bank.x - dongfeng.x) / dongfeng.rx, (bank.y - dongfeng.y) / dongfeng.ry)).toBeLessThan(1.3);
    expect(items.find((item) => item.key === "auto1")!.x).toBeLessThan(345);
    expect(items.find((item) => item.key === "grawe")!.y).toBeGreaterThan(140);
  });
  test("AUTO 1 clears the north stairs and still matches the organizer's old name", () => {
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("AUTO1.com", "hala-11")], []));
    const auto1 = all.find((item) => item.key === "auto1")!;
    expect(auto1.name).toBe("AUTO 1");
    expect(auto1.participationId).toBe("fixture-AUTO1.com");
    expect(auto1.x + 90).toBeLessThan(345);
  });
  test("each motorcycle brand has a separate contour footprint", () => {
    const moto = AMF_HALL_ANCHORS.filter((item) => item.moto);
    for (const [i, a] of moto.entries()) for (const b of moto.slice(i + 1)) {
      expect(Math.abs(a.x - b.x) > (a.rx + b.rx) * 1.16 || Math.abs(a.y - b.y) > (a.ry + b.ry) * 1.16).toBe(true);
    }
  });
  test("preserves the organizer's shared-stand arrangement across the whole hall", () => {
    const byKey = (key: string) => AMF_HALL_ANCHORS.find((item) => item.key === key)!;
    expect(byKey("skoda").ry).toBeGreaterThan(byKey("mercedes").ry);
    expect(byKey("mercedes").y).toBe((byKey("lotos").y + byKey("vidovdan").y) / 2);
    expect(byKey("mercedes").y).toBeGreaterThan(byKey("toyota").y + 200);
    expect(Math.abs(byKey("fiat").y - byKey("dongfeng").y)).toBeLessThan(50);
    expect(byKey("fiat").x).toBeLessThan(byKey("dongfeng").x);
    expect(Math.abs(byKey("dacia").y - byKey("renault").y)).toBeLessThan(50);
    expect(byKey("dacia").x).toBeLessThan(byKey("renault").x);
    for (const key of ["motogrini", "tvs"]) {
      expect(byKey(key).y).toBeGreaterThan(byKey("geely").y);
      expect(byKey(key).y).toBeLessThan(byKey("toyota").y);
    }
  });
  test("all organizer anchors offer a website even without a paid service", () => {
    expect(items.filter((item) => AMF_HALL_ANCHORS.some((anchor) => anchor.key === item.key)).every((item) => Boolean(item.websiteUrl))).toBe(true);
    const own = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Toyota", "hala-2", { websiteUrl: "https://example.org/dealer", heatEligible: false })], []));
    expect(own.find((item) => item.key === "toyota")).toMatchObject({ paid: false, websiteUrl: "https://example.org/dealer" });
    for (const url of ["javascript:alert(1)", "https://fixture.example.invalid", "not-a-url"]) expect(fairMapWebsiteUrl(url)).toBeUndefined();
  });
  test("the drawing fills phone space instead of retaining a fixed paper aspect ratio", () => {
    expect(amfTopographicSize({ width: 378, height: 600 }).height).toBeCloseTo(1600);
    expect(amfTopographicSize({ width: 348, height: 350 }).height).toBe(1100);
  });
  test.each([{ x: 8, y: 8 }, { x: 350, y: 490 }, { x: 180, y: 250 }, { x: -100, y: 900 }])("the summit pop-up stays on screen at %j", (anchor) => {
    const position = amfTopographicPopupPosition(anchor, { width: 360, height: 500 }, { width: 232, height: 144 });
    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.y).toBeGreaterThanOrEqual(8);
    expect(position.x + 232).toBeLessThanOrEqual(352);
    expect(position.y + 144).toBeLessThanOrEqual(492);
  });
  test("smooth nested contours are deterministic and finite", () => {
    const item = items.find((item) => item.key === "toyota")!;
    const path = fairMapContourPath(item, 0);
    expect(path).toBe(fairMapContourPath(item, 0));
    expect(path).toMatch(/^M.+C.+ Z$/);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(fairMapContourPath(item, 5)).not.toBe(path);
  });
  test("search and expanded finger hit targets return individual brands", () => {
    expect(searchAmfTopographicExhibits(items, "skoda")[0].key).toBe("skoda");
    expect(searchAmfTopographicExhibits(items, "Toyota model")[0].key).toBe("toyota");
    expect(searchAmfTopographicExhibits(items, "nepostojeci brend")).toHaveLength(0);
    const small = items.find((item) => item.key === "lotos")!;
    expect(hitAmfTopographicExhibit(items, small.x, small.y, 0.3)?.key).toBe("lotos");
  });
});
