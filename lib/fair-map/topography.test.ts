import { describe, expect, test } from "vitest";
import type { FairPublicMapStand } from "../fair-contract";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { buildFairMapView } from "./view";
import { AMF_HALL_ANCHORS, amfTopographicPopupPosition, amfTopographicSize, buildAmfTopographicExhibits, fairMapContourOpacity, fairMapContourPath, fairMapHeatEligible, fairMapTopographicLevel, hitAmfTopographicExhibit, searchAmfTopographicExhibits } from "./topography";
import { fairMapWebsiteUrl } from "./websites";

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
  test.each([0, 1, 2, 3, 4, 5])("paid zero-scans tint stays visible, grey never heats (band %d)", (band) => {
    expect(fairMapContourOpacity(true, 0, band)).toBeGreaterThan(0);
    expect(fairMapContourOpacity(false, 0, band)).toBe(fairMapContourOpacity(false, 1, band));
    if (band > 0) expect(fairMapContourOpacity(true, 1, band)).toBeGreaterThan(fairMapContourOpacity(true, 0, band));
    expect(fairMapContourOpacity(true, 100, band)).toBeLessThanOrEqual(1);
    expect(fairMapContourOpacity(true, NaN, band)).toBe(fairMapContourOpacity(true, 0, band));
  });
});

describe("AMF topographic geometry and catalog", () => {
  const view = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Toyota", "hala-2", { heatEligible: true }), stand("Audi", "hala-1", { heatEligible: false }), stand("Partner bez paketa", "hala-3", { brands: [] })], []);
  const items = buildAmfTopographicExhibits(view);

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
    const free = stand("Volkswagen", "hala-1", { participationId: "other-exhibitor", packageTier: "included" });
    const all = buildAmfTopographicExhibits(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [paid, included, free], []));
    expect(all.find((item) => item.key === "audi")?.paid).toBe(true);
    expect(all.find((item) => item.key === "vw")?.paid).toBe(false);
    const audi = all.find((item) => item.key === "audi")!;
    expect(fairMapTopographicLevel(audi, all, new Map([["hala-1", 1]]))).toBe(0);
    expect(fairMapTopographicLevel(audi, all, new Map([["hala-1", 1]]), new Map([["same-exhibitor", 0.35]]))).toBe(0.35);
    expect(fairMapTopographicLevel(all.find((item) => item.key === "vw")!, all, new Map([["hala-1", 1]]), new Map([["other-exhibitor", 1]]))).toBe(0);
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
