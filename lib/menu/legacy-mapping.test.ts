// ScanMe Menu V1 (K06) — the legacy menu → new model mapping: stable keys, the
// plan (sections, articles, variants, placements), the report the operator
// reads, the ceilings, the post-migration verification and the ordering-list
// match. Pure module, no Convex context. Fictional venue and prices only.

import { describe, expect, test } from "vitest";
import {
  MENU_MIGRATION_BLOCKERS,
  MENU_MIGRATION_DIFFERENCES,
  MENU_MIGRATION_ERROR,
  MENU_MIGRATION_MANUAL_CHECKS,
  MENU_MIGRATION_WARNINGS,
} from "./errors/migration";
import { isMenuKey } from "./keys";
import {
  MENU_MIGRATION_MAX_DUPLICATES,
  MENU_MIGRATION_MAX_ISSUES,
  MENU_MIGRATION_MAX_UNMATCHED,
  hasEncodingSuspect,
  legacyIconKey,
  legacyKey,
  legacyPrice,
  legacySourceFromModel,
  matchOrderingItems,
  planLegacyMenu,
  plannedWrites,
  type LegacyMigrationPlan,
  type LegacyPlanOptions,
  type LegacyPlannedArticle,
  type LegacySource,
  type LegacySourceGroup,
  type LegacySourceItem,
  type LegacyTarget,
} from "./legacy-mapping";
import { ORDER_STEP } from "./order";
import { legacyBigModel, legacyDraftModel } from "./testkit/legacy";

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

const FALLBACKS = { sectionName: "Bez naziva", variantName: "Varijanta" } as const;
const OPTIONS: LegacyPlanOptions = { fallbacks: FALLBACKS, verify: false };
const VERIFY: LegacyPlanOptions = { fallbacks: FALLBACKS, verify: true };

const EMPTY_TARGET: LegacyTarget = {
  articleCount: 0,
  pagePlacementCount: 0,
  sections: [],
  articles: [],
  variants: [],
  placements: [],
};

function sourceItem(
  id: string,
  name: string,
  fields: Partial<Omit<LegacySourceItem, "id" | "name">> = {},
): LegacySourceItem {
  return { productType: "jelo", available: true, variants: [], pairingCount: 0, ...fields, id, name };
}

function sourceGroup(
  id: string,
  title: string,
  items: LegacySourceItem[],
  fields: Partial<Omit<LegacySourceGroup, "id" | "title" | "items">> = {},
): LegacySourceGroup {
  return { shape: "lista", ...fields, id, title, items };
}

function sourceOf(groups: LegacySourceGroup[], fields: Partial<LegacySource> = {}): LegacySource {
  return {
    kind: "draft",
    revision: 1,
    hasUnpublishedChanges: false,
    groups,
    daypartCount: 0,
    daypartOverride: false,
    ...fields,
  };
}

/** One group "Jela" with the given items. */
function singleGroup(items: LegacySourceItem[], fields: Partial<LegacySource> = {}): LegacySource {
  return sourceOf([sourceGroup("g-jela", "Jela", items)], fields);
}

function draftSource(): LegacySource {
  return legacySourceFromModel(legacyDraftModel(), {
    kind: "draft",
    revision: 7,
    hasUnpublishedChanges: false,
  });
}

function plan(
  source: LegacySource,
  target: LegacyTarget = EMPTY_TARGET,
  options: LegacyPlanOptions = OPTIONS,
): LegacyMigrationPlan {
  return planLegacyMenu(source, target, options);
}

function draftPlan(): LegacyMigrationPlan {
  return plan(draftSource());
}

function articleNamed(result: LegacyMigrationPlan, name: string): LegacyPlannedArticle {
  const found = result.articles.find((article) => article.name === name);
  if (!found) throw new Error(`article "${name}" is not in the plan`);
  return found;
}

function warningCodes(result: LegacyMigrationPlan): string[] {
  return result.report.warnings.map((warning) => warning.code);
}

/** A target that holds exactly what the plan would write (the state after a finished migration). */
function targetFrom(result: LegacyMigrationPlan): LegacyTarget {
  return {
    articleCount: result.articles.length,
    pagePlacementCount: result.articles.length,
    sections: result.sections.map((section) => ({
      key: section.key,
      name: section.name,
      order: section.order,
    })),
    articles: result.articles.map((article) => ({
      key: article.key,
      name: article.name,
      nameNormalized: article.nameNormalized,
      ...(article.basePriceRsd !== undefined ? { basePriceRsd: article.basePriceRsd } : {}),
    })),
    variants: result.articles.flatMap((article) =>
      article.variants.map((variant) => ({
        articleKey: article.key,
        name: variant.name,
        ...(variant.priceRsd !== undefined ? { priceRsd: variant.priceRsd } : {}),
        order: variant.order,
      })),
    ),
    placements: result.articles.map((article) => ({
      articleKey: article.key,
      sectionKey: article.sectionKey,
      order: article.placementOrder,
    })),
  };
}

/** The ordered article keys of the plan, grouped by section key. */
function keysBySection(result: LegacyMigrationPlan): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const article of result.articles) {
    const list = map.get(article.sectionKey) ?? [];
    list.push(article.key);
    map.set(article.sectionKey, list);
  }
  return map;
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      return true;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

// Mojibake fixtures written as escapes so the file survives any editor re-encoding.
const MOJIBAKE_C_ACUTE = "Ä‡evapi"; // "Ä‡evapi" — UTF-8 "ćevapi" read as Windows-1252
const MOJIBAKE_S_CARON = "Å¡ljivovica"; // "Å¡ljivovica"
const REPLACEMENT_CHAR = "�";

// -----------------------------------------------------------------------------
// 1. legacyKey
// -----------------------------------------------------------------------------

describe("legacyKey", () => {
  test("the same input always gives the same key", () => {
    expect(legacyKey("article", "itm-espreso")).toBe(legacyKey("article", "itm-espreso"));
    expect(legacyKey("section", "grp-topli")).toBe(legacyKey("section", "grp-topli"));
  });

  test("different inputs give different keys (2000 random UUIDs, no collision)", () => {
    const keys = new Set<string>();
    for (let index = 0; index < 2000; index += 1) {
      keys.add(legacyKey("article", crypto.randomUUID()));
    }
    expect(keys.size).toBe(2000);
  });

  test("the same legacy id of another kind gives another key", () => {
    const keys = new Set([
      legacyKey("section", "x1"),
      legacyKey("article", "x1"),
      legacyKey("variant", "x1"),
    ]);
    expect(keys.size).toBe(3);
  });

  test("the shape passes isMenuKey with the right kind and prefix", () => {
    const section = legacyKey("section", "grp-topli");
    const article = legacyKey("article", "itm-espreso");
    const variant = legacyKey("variant", "itm-kapucino/var-mala");
    expect(section.startsWith("sc_")).toBe(true);
    expect(article.startsWith("ar_")).toBe(true);
    expect(variant.startsWith("va_")).toBe(true);
    expect(isMenuKey(section, "section")).toBe(true);
    expect(isMenuKey(article, "article")).toBe(true);
    expect(isMenuKey(variant, "variant")).toBe(true);
    expect(isMenuKey(section, "article")).toBe(false);
    expect(isMenuKey(article)).toBe(true);
  });

  test("odd ids (empty, unicode, very long) still give a valid key", () => {
    for (const id of ["", "Ćevapi đurđevak", "x".repeat(5000), "🍽️"]) {
      expect(isMenuKey(legacyKey("article", id), "article")).toBe(true);
    }
  });
});

// -----------------------------------------------------------------------------
// 2. legacySourceFromModel
// -----------------------------------------------------------------------------

describe("legacySourceFromModel", () => {
  test("keeps the order of groups and items and the source header", () => {
    const source = draftSource();
    expect(source.kind).toBe("draft");
    expect(source.revision).toBe(7);
    expect(source.hasUnpublishedChanges).toBe(false);
    expect(source.groups.map((group) => group.id)).toEqual(["grp-topli", "grp-rostilj", "grp-pica"]);
    expect(source.groups.map((group) => group.title)).toEqual(["Topli napici", "Roštilj", "Pića"]);
    expect(source.groups.map((group) => group.shape)).toEqual(["lista", "galerija", "lista"]);
    expect(source.groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["itm-espreso", "itm-domaca", "itm-kapucino"],
      ["itm-pljeskavica", "itm-cevapi", "itm-file"],
      ["itm-voda", "itm-limunada"],
    ]);
  });

  test("carries the group daypart binding only when there is one", () => {
    const source = draftSource();
    expect(source.groups[0]).not.toHaveProperty("daypartKey");
    expect(source.groups[1].daypartKey).toBe("rucak");
  });

  test("counts pairings per item, dayparts, and the override flag", () => {
    const source = draftSource();
    const items = source.groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === "itm-limunada")?.pairingCount).toBe(1);
    expect(items.filter((item) => item.pairingCount === 0)).toHaveLength(7);
    expect(source.daypartCount).toBe(1);
    expect(source.daypartOverride).toBe(false);

    const overridden = legacySourceFromModel(
      { ...legacyDraftModel(), daypartOverride: "rucak" },
      { kind: "draft", revision: 1, hasUnpublishedChanges: false },
    );
    expect(overridden.daypartOverride).toBe(true);
  });

  test("liveUnavailableIds: an available item that is off live becomes unavailable and offLive", () => {
    const source = legacySourceFromModel(legacyDraftModel(), {
      kind: "draft",
      revision: 1,
      hasUnpublishedChanges: true,
      liveUnavailableIds: new Set(["itm-espreso"]),
    });
    const espreso = source.groups[0].items[0];
    expect(espreso.available).toBe(false);
    expect(espreso.offLive).toBe(true);
    // the others are untouched
    expect(source.groups[0].items[1].available).toBe(true);
    expect(source.groups[0].items[1]).not.toHaveProperty("offLive");
  });

  test("an item that is already unavailable does not get offLive", () => {
    const source = legacySourceFromModel(legacyDraftModel(), {
      kind: "draft",
      revision: 1,
      hasUnpublishedChanges: false,
      liveUnavailableIds: new Set(["itm-cevapi"]),
    });
    const cevapi = source.groups[1].items[1];
    expect(cevapi.available).toBe(false);
    expect(cevapi).not.toHaveProperty("offLive");
  });

  test("offLive becomes the unavailable_from_live warning and an unavailable article", () => {
    const source = legacySourceFromModel(legacyDraftModel(), {
      kind: "draft",
      revision: 1,
      hasUnpublishedChanges: false,
      liveUnavailableIds: new Set(["itm-espreso", "itm-cevapi"]),
    });
    const result = plan(source);
    expect(articleNamed(result, "Espreso").unavailable).toBe(true);
    expect(result.report.planned.unavailable).toBe(2);
    expect(result.report.warningCounts.unavailable_from_live).toBe(1);
    expect(result.report.warnings).toContainEqual({
      code: "unavailable_from_live",
      section: "Topli napici",
      article: "Espreso",
    });
  });
});

// -----------------------------------------------------------------------------
// 3. planLegacyMenu over the draft fixture
// -----------------------------------------------------------------------------

describe("planLegacyMenu — draft fixture", () => {
  test("three sections in the legacy order", () => {
    const result = draftPlan();
    expect(result.sections.map((section) => section.name)).toEqual(["Topli napici", "Roštilj", "Pića"]);
  });

  test("eight articles", () => {
    const result = draftPlan();
    expect(result.articles).toHaveLength(8);
    expect(result.articles.map((article) => article.name)).toEqual([
      "Espreso",
      "Domaća kafa",
      "Kapućino",
      "Pljeskavica",
      "Ćevapi 10 kom",
      "Pileći file",
      "Kisela voda 0,33 l",
      "Domaća limunada",
    ]);
  });

  test("keys have the stable shape", () => {
    const result = draftPlan();
    for (const section of result.sections) expect(isMenuKey(section.key, "section")).toBe(true);
    for (const article of result.articles) {
      expect(isMenuKey(article.key, "article")).toBe(true);
      for (const variant of article.variants) expect(isMenuKey(variant.key, "variant")).toBe(true);
    }
  });

  test("prices: Espreso 150 is the base price", () => {
    const espreso = articleNamed(draftPlan(), "Espreso");
    expect(espreso.basePriceRsd).toBe(150);
    expect(espreso.variants).toEqual([]);
  });

  test("prices: Kapućino has no base price and two ordered variants", () => {
    const kapucino = articleNamed(draftPlan(), "Kapućino");
    expect(kapucino).not.toHaveProperty("basePriceRsd");
    expect(kapucino.variants.map(({ name, priceRsd, order }) => ({ name, priceRsd, order }))).toEqual([
      { name: "mala", priceRsd: 180, order: ORDER_STEP },
      { name: "velika", priceRsd: 220, order: 2 * ORDER_STEP },
    ]);
  });

  test("Ćevapi is unavailable, the rest are available", () => {
    const result = draftPlan();
    expect(articleNamed(result, "Ćevapi 10 kom").unavailable).toBe(true);
    expect(result.articles.filter((article) => article.unavailable)).toHaveLength(1);
  });

  test("placementOrder grows inside every section", () => {
    const result = draftPlan();
    for (const section of result.sections) {
      const orders = result.articles
        .filter((article) => article.sectionKey === section.key)
        .map((article) => article.placementOrder);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders).toEqual(orders.map((_, index) => (index + 1) * ORDER_STEP));
    }
  });

  test("every article points at a planned section", () => {
    const result = draftPlan();
    const sectionKeys = new Set(result.sections.map((section) => section.key));
    expect(result.articles.every((article) => sectionKeys.has(article.sectionKey))).toBe(true);
    expect(keysBySection(result).get(result.sections[0].key)).toHaveLength(3);
  });

  test("section order grows", () => {
    const orders = draftPlan().sections.map((section) => section.order);
    expect(orders).toEqual([ORDER_STEP, 2 * ORDER_STEP, 3 * ORDER_STEP]);
  });

  test("iconKey is the normalized productType and the media mode is icon", () => {
    const result = draftPlan();
    const domaca = articleNamed(result, "Domaća kafa");
    expect(domaca.iconKey).toBe("domaca kafa");
    expect(domaca.mediaMode).toBe("icon");
    expect(articleNamed(result, "Espreso").iconKey).toBe("kafa");
    expect(result.articles.every((article) => article.mediaMode === "icon")).toBe(true);
  });

  test("the description is cleaned and reported as text_whitespace_changed", () => {
    const result = draftPlan();
    expect(articleNamed(result, "Pljeskavica").description).toBe("Sa lukom i kajmakom");
    expect(result.report.warnings).toContainEqual({
      code: "text_whitespace_changed",
      section: "Roštilj",
      article: "Pljeskavica",
    });
    expect(result.report.text.whitespaceChanged).toBe(1);
  });

  test("legacyRef is draft:<id> for a draft source", () => {
    const result = draftPlan();
    expect(result.sections.map((section) => section.legacyRef)).toEqual([
      "draft:grp-topli",
      "draft:grp-rostilj",
      "draft:grp-pica",
    ]);
    expect(articleNamed(result, "Espreso").legacyRef).toBe("draft:itm-espreso");
  });

  test("the group icon is carried (trimmed) and omitted when blank", () => {
    const result = plan(
      sourceOf([
        sourceGroup("g1", "Jela", [sourceItem("i1", "Čorba")], { iconKey: " kafa " }),
        sourceGroup("g2", "Pića", [sourceItem("i2", "Sok")], { iconKey: "   " }),
        sourceGroup("g3", "Slatko", [sourceItem("i3", "Torta")]),
      ]),
    );
    expect(result.sections[0].iconKey).toBe("kafa");
    expect(result.sections[1]).not.toHaveProperty("iconKey");
    expect(result.sections[2]).not.toHaveProperty("iconKey");
  });

  test("an explicit item iconKey beats the productType; no type and no icon means no media", () => {
    const result = plan(
      singleGroup([
        sourceItem("i1", "Čaj", { productType: "Piće", iconKey: " tea " }),
        sourceItem("i2", "Bez ikone", { productType: "  " }),
      ]),
    );
    expect(articleNamed(result, "Čaj").iconKey).toBe("tea");
    const bare = articleNamed(result, "Bez ikone");
    expect(bare).not.toHaveProperty("iconKey");
    expect(bare.mediaMode).toBe("none");
  });

  test("legacyIconKey strips accents, lowercases and caps at 60 characters", () => {
    expect(legacyIconKey({ productType: " Pića " })).toBe("pica");
    expect(legacyIconKey({ productType: "KAFA" })).toBe("kafa");
    expect(legacyIconKey({ productType: "", iconKey: "  " })).toBeUndefined();
    expect(legacyIconKey({ productType: "x".repeat(100) })).toHaveLength(60);
  });
});

// -----------------------------------------------------------------------------
// 4. The report over the draft fixture
// -----------------------------------------------------------------------------

describe("planLegacyMenu — report over the draft fixture", () => {
  const { report } = draftPlan();

  test("source counts", () => {
    expect(report.source).toEqual({ kind: "draft", revision: 7, groups: 3, items: 8, variants: 2, photos: 0 });
  });

  test("planned counts", () => {
    expect(report.planned).toEqual({
      sections: 3,
      articles: 8,
      variants: 2,
      placements: 8,
      unavailable: 1,
      images: 0,
      skippedItems: 0,
    });
  });

  test("an empty target has everything pending", () => {
    expect(report.target).toEqual({
      existingSections: 0,
      pendingSections: 3,
      existingArticles: 0,
      pendingArticles: 8,
      otherArticles: 0,
    });
  });

  test("not mapped: dayparts, daypart binding, group shape, pairings; no videos", () => {
    expect(report.unmapped).toEqual({
      videos: 0,
      pairings: 1,
      dayparts: 1,
      daypartBindings: 1,
      daypartOverride: false,
      groupShapes: { galerija: 1 },
    });
  });

  test("prices", () => {
    expect(report.prices).toEqual({
      currency: "RSD",
      min: 120,
      max: 790,
      withPrice: 7,
      variantPriced: 1,
      withoutPrice: 0,
      zero: 0,
      rounded: 0,
    });
  });

  test("text counters (five names with č/ć/š/ž/đ, one cleaned description)", () => {
    expect(report.text).toEqual({ withDiacritics: 5, whitespaceChanged: 1, encodingSuspect: 0, cut: 0 });
  });

  test("warningCounts carries the three 'not mapped' warnings", () => {
    expect(report.warningCounts.group_shape_unmapped).toBe(1);
    expect(report.warningCounts.pairings_unmapped).toBe(1);
    expect(report.warningCounts.daypart_unmapped).toBeGreaterThanOrEqual(1);
    expect(report.warningCounts).toEqual({
      text_whitespace_changed: 1,
      group_shape_unmapped: 1,
      daypart_unmapped: 2, // the Roštilj binding and the source-level dayparts
      pairings_unmapped: 1,
    });
    expect(report.warningCount).toBe(5);
    expect(report.warnings).toHaveLength(5);
  });

  test("manual checks are exactly MENU_MIGRATION_MANUAL_CHECKS", () => {
    expect(report.manualChecks).toEqual(MENU_MIGRATION_MANUAL_CHECKS);
  });

  test("no blockers, duplicates or differences", () => {
    expect(report.blockers).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.duplicateCount).toBe(0);
    expect(report.differences).toEqual([]);
    expect(report.differenceCount).toBe(0);
  });

  test("a draft with unpublished changes is reported; a live source is not", () => {
    const draft = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 100 })], { hasUnpublishedChanges: true }));
    expect(warningCodes(draft)).toContain("draft_has_unpublished_changes");
    const live = plan(
      singleGroup([sourceItem("i1", "Čorba", { priceRsd: 100 })], { kind: "live", hasUnpublishedChanges: true }),
    );
    expect(warningCodes(live)).not.toContain("draft_has_unpublished_changes");
  });

  test("an empty source is reported as source_empty", () => {
    const result = plan(sourceOf([]));
    expect(warningCodes(result)).toContain("source_empty");
    expect(result.articles).toEqual([]);
    expect(result.report.prices.min).toBeNull();
    expect(result.report.prices.max).toBeNull();
  });

  test("a daypart override alone is reported, and a null pairing count makes pairings unknown", () => {
    const result = plan(
      singleGroup([sourceItem("i1", "Čorba", { priceRsd: 100, pairingCount: null })], {
        daypartOverride: true,
      }),
    );
    expect(result.report.unmapped.daypartOverride).toBe(true);
    expect(result.report.unmapped.pairings).toBeNull();
    expect(warningCodes(result)).toContain("daypart_unmapped");
    expect(warningCodes(result)).not.toContain("pairings_unmapped");
  });
});

// -----------------------------------------------------------------------------
// 5. Photo and video
// -----------------------------------------------------------------------------

describe("planLegacyMenu — photo and video", () => {
  test("a photo becomes legacyPhotoStorageId, the media mode stays icon, image_pending is reported", () => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 300, photoStorageId: "storage-photo-1" })]));
    const article = articleNamed(result, "Čorba");
    expect(article.legacyPhotoStorageId).toBe("storage-photo-1");
    expect(article.mediaMode).toBe("icon");
    expect(result.report.planned.images).toBe(1);
    expect(result.report.source.photos).toBe(1);
    expect(result.report.warnings).toContainEqual({ code: "image_pending", section: "Jela", article: "Čorba" });
  });

  test("an item without a photo has no legacyPhotoStorageId", () => {
    const article = articleNamed(plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 300 })])), "Čorba");
    expect(article).not.toHaveProperty("legacyPhotoStorageId");
  });

  test("a video is counted as not mapped and reported", () => {
    const result = plan(singleGroup([sourceItem("i1", "Pileći file", { priceRsd: 590, videoStorageId: "storage-video-1" })]));
    expect(result.report.unmapped.videos).toBe(1);
    expect(result.report.warnings).toContainEqual({
      code: "video_unmapped",
      section: "Jela",
      article: "Pileći file",
    });
    expect(result.report.planned.images).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// 6. Prices
// -----------------------------------------------------------------------------

describe("legacyPrice", () => {
  test("whole dinars pass unchanged", () => {
    expect(legacyPrice(150)).toEqual({ price: 150, rounded: false, invalid: false });
    expect(legacyPrice(0)).toEqual({ price: 0, rounded: false, invalid: false });
    expect(legacyPrice(1_000_000)).toEqual({ price: 1_000_000, rounded: false, invalid: false });
  });

  test("a fraction is rounded and flagged", () => {
    expect(legacyPrice(149.6)).toEqual({ price: 150, rounded: true, invalid: false });
    expect(legacyPrice(149.4)).toEqual({ price: 149, rounded: true, invalid: false });
  });

  test("undefined is no price and not invalid", () => {
    expect(legacyPrice(undefined)).toEqual({ rounded: false, invalid: false });
  });

  test.each([-1, -150.2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2_000_000, 1_000_001])(
    "%s is invalid and has no price",
    (raw) => {
      const result = legacyPrice(raw);
      expect(result.invalid).toBe(true);
      expect(result.rounded).toBe(false);
      expect(result).not.toHaveProperty("price");
    },
  );
});

describe("planLegacyMenu — prices", () => {
  test("149.6 becomes 150 with price_rounded", () => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 149.6 })]));
    expect(articleNamed(result, "Čorba").basePriceRsd).toBe(150);
    expect(result.report.prices.rounded).toBe(1);
    expect(result.report.prices.withPrice).toBe(1);
    expect(result.report.warnings).toContainEqual({ code: "price_rounded", section: "Jela", article: "Čorba" });
  });

  test("0 is kept and reported as price_zero", () => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 0 })]));
    expect(articleNamed(result, "Čorba").basePriceRsd).toBe(0);
    expect(result.report.prices.zero).toBe(1);
    expect(result.report.prices.withPrice).toBe(1);
    expect(result.report.prices.min).toBe(0);
    expect(result.report.warnings).toContainEqual({ code: "price_zero", section: "Jela", article: "Čorba" });
  });

  test.each([-5, Number.NaN, 2_000_000])("%s is left out and reported as price_invalid", (raw) => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: raw })]));
    expect(articleNamed(result, "Čorba")).not.toHaveProperty("basePriceRsd");
    expect(result.report.warnings).toContainEqual({ code: "price_invalid", section: "Jela", article: "Čorba" });
    expect(result.report.prices.withPrice).toBe(0);
    expect(result.report.prices.min).toBeNull();
  });

  test("an item without a price and without variants is price_missing", () => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba")]));
    expect(articleNamed(result, "Čorba")).not.toHaveProperty("basePriceRsd");
    expect(result.report.prices.withoutPrice).toBe(1);
    expect(result.report.prices.withPrice).toBe(0);
    expect(result.report.warnings).toContainEqual({ code: "price_missing", section: "Jela", article: "Čorba" });
  });

  test("an item priced only through variants is not price_missing", () => {
    const result = plan(
      singleGroup([sourceItem("i1", "Čorba", { variants: [{ id: "v1", label: "mala", priceRsd: 200 }] })]),
    );
    expect(result.report.prices.variantPriced).toBe(1);
    expect(result.report.prices.withoutPrice).toBe(0);
    expect(warningCodes(result)).not.toContain("price_missing");
  });

  test("a variant with an invalid price stays without priceRsd", () => {
    const result = plan(
      singleGroup([
        sourceItem("i1", "Čorba", {
          variants: [
            { id: "v1", label: "mala", priceRsd: -3 },
            { id: "v2", label: "velika", priceRsd: 200 },
          ],
        }),
      ]),
    );
    const [small, large] = articleNamed(result, "Čorba").variants;
    expect(small.name).toBe("mala");
    expect(small).not.toHaveProperty("priceRsd");
    expect(large.priceRsd).toBe(200);
    expect(result.report.warnings).toContainEqual({ code: "price_invalid", section: "Jela", article: "Čorba" });
    expect(result.report.prices.variantPriced).toBe(1);
    expect(result.report.prices.min).toBe(200);
  });

  test("when every variant price is invalid and there is no base price the item is price_missing", () => {
    const result = plan(
      singleGroup([sourceItem("i1", "Čorba", { variants: [{ id: "v1", label: "mala", priceRsd: Number.NaN }] })]),
    );
    expect(result.report.prices.withoutPrice).toBe(1);
    expect(warningCodes(result)).toEqual(expect.arrayContaining(["price_invalid", "price_missing"]));
  });

  test("variant prices are rounded, zero-checked and counted in min and max", () => {
    const result = plan(
      singleGroup([
        sourceItem("i1", "Čorba", {
          priceRsd: 300,
          variants: [
            { id: "v1", label: "mala", priceRsd: 99.5 },
            { id: "v2", label: "gratis", priceRsd: 0 },
          ],
        }),
      ]),
    );
    expect(articleNamed(result, "Čorba").variants.map((variant) => variant.priceRsd)).toEqual([100, 0]);
    expect(result.report.prices.rounded).toBe(1);
    expect(result.report.prices.zero).toBe(1);
    expect(result.report.prices.min).toBe(0);
    expect(result.report.prices.max).toBe(300);
  });

  // Low-severity edge found while writing these tests (see the report): a price in
  // [-0.5, 0) rounds to -0, which isValidRsd accepts, so a NEGATIVE legacy price is
  // "migrated" as negative zero instead of being dropped as invalid.
  test("a tiny negative price is invalid, never negative zero; -0 becomes 0", () => {
    expect(legacyPrice(-0.4)).toEqual({ rounded: false, invalid: true });
    const zero = legacyPrice(-0);
    expect(zero.invalid).toBe(false);
    expect(Object.is(zero.price, 0)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// 7. Text
// -----------------------------------------------------------------------------

describe("hasEncodingSuspect", () => {
  test.each([MOJIBAKE_C_ACUTE, MOJIBAKE_S_CARON, REPLACEMENT_CHAR, `Pivo ${REPLACEMENT_CHAR}`, "Ã¨"])(
    "flags %j",
    (value) => {
      expect(hasEncodingSuspect(value)).toBe(true);
    },
  );

  test.each(["Äpfel", "Åre", "Ćevapi", "Šljivovica", "Đurđevak", "Čorba", "Kisela voda 0,33 l", ""])(
    "does not flag %j",
    (value) => {
      expect(hasEncodingSuspect(value)).toBe(false);
    },
  );
});

describe("planLegacyMenu — text", () => {
  test("an empty item name skips the item and reports item_name_empty", () => {
    const result = plan(singleGroup([sourceItem("i1", "   ", { priceRsd: 100 }), sourceItem("i2", "Čorba", { priceRsd: 200 })]));
    expect(result.articles.map((article) => article.name)).toEqual(["Čorba"]);
    expect(result.report.planned.skippedItems).toBe(1);
    expect(result.report.planned.articles).toBe(1);
    expect(result.report.source.items).toBe(2);
    expect(result.report.warnings).toContainEqual({ code: "item_name_empty", section: "Jela" });
    // the surviving article still sits first in its section
    expect(result.articles[0].placementOrder).toBe(2 * ORDER_STEP);
  });

  test("an empty group title becomes the fallback section name with section_untitled", () => {
    const result = plan(sourceOf([sourceGroup("g1", "  ", [sourceItem("i1", "Čorba", { priceRsd: 100 })])]));
    expect(result.sections[0].name).toBe("Bez naziva");
    expect(articleNamed(result, "Čorba").sectionKey).toBe(result.sections[0].key);
    expect(result.report.warnings).toContainEqual({ code: "section_untitled", section: "Bez naziva" });
  });

  test("an empty variant label becomes the fallback name with variant_name_empty", () => {
    const result = plan(
      singleGroup([sourceItem("i1", "Čorba", { variants: [{ id: "v1", label: " ", priceRsd: 200 }] })]),
    );
    expect(articleNamed(result, "Čorba").variants[0].name).toBe("Varijanta");
    expect(result.report.warnings).toContainEqual({ code: "variant_name_empty", section: "Jela", article: "Čorba" });
  });

  test("the fallbacks come from the options", () => {
    const result = plan(
      sourceOf([sourceGroup("g1", "", [sourceItem("i1", "Čorba", { variants: [{ id: "v1", label: "", priceRsd: 1 }] })])]),
      EMPTY_TARGET,
      { fallbacks: { sectionName: "Untitled", variantName: "Option" }, verify: false },
    );
    expect(result.sections[0].name).toBe("Untitled");
    expect(result.articles[0].variants[0].name).toBe("Option");
  });

  test("a name longer than 120 characters is cut and reported as text_cut", () => {
    const result = plan(singleGroup([sourceItem("i1", "a".repeat(130), { priceRsd: 100 })]));
    const [article] = result.articles;
    expect(article.name.length).toBeLessThanOrEqual(120);
    expect(article.name).toBe("a".repeat(120));
    expect(result.report.text.cut).toBe(1);
    expect(warningCodes(result)).toContain("text_cut");
  });

  test("a cut that lands on a space is trimmed and still within the limit", () => {
    const result = plan(singleGroup([sourceItem("i1", `${"a".repeat(119)} ${"b".repeat(30)}`, { priceRsd: 100 })]));
    expect(result.articles[0].name).toBe("a".repeat(119));
    expect(result.report.text.cut).toBe(1);
  });

  test("a section name over 80 and a description over 600 characters are cut too", () => {
    const result = plan(
      sourceOf([
        sourceGroup("g1", "s".repeat(90), [sourceItem("i1", "Čorba", { priceRsd: 100, description: "d".repeat(700) })]),
      ]),
    );
    expect(result.sections[0].name).toBe("s".repeat(80));
    expect(result.articles[0].description).toBe("d".repeat(600));
    expect(result.report.text.cut).toBe(2);
  });

  // Low-severity edge found while writing these tests (see the report): the cut is
  // made on UTF-16 code units, so it can split a surrogate pair and leave a lone
  // surrogate (invalid Unicode) in the migrated name.
  test("a cut never leaves a lone surrogate", () => {
    const result = plan(singleGroup([sourceItem("i1", `${"a".repeat(119)}😀tail`, { priceRsd: 100 })]));
    expect(hasLoneSurrogate(result.articles[0].name)).toBe(false);
    expect(result.articles[0].name).toBe("a".repeat(119));
    expect(warningCodes(result)).toContain("text_cut");
  });

  test("inner whitespace is collapsed with a warning, outer whitespace is trimmed silently", () => {
    const collapsed = plan(singleGroup([sourceItem("i1", "Pileća   supa", { priceRsd: 100 })]));
    expect(collapsed.articles[0].name).toBe("Pileća supa");
    expect(warningCodes(collapsed)).toContain("text_whitespace_changed");

    const trimmed = plan(singleGroup([sourceItem("i1", "  Pileća supa  ", { priceRsd: 100 })]));
    expect(trimmed.articles[0].name).toBe("Pileća supa");
    expect(warningCodes(trimmed)).not.toContain("text_whitespace_changed");
  });

  test("a blank description is dropped without a warning", () => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 100, description: "  \n " })]));
    expect(result.articles[0]).not.toHaveProperty("description");
    expect(warningCodes(result)).not.toContain("text_whitespace_changed");
  });

  test("mojibake in a name is text_encoding_suspect", () => {
    const result = plan(singleGroup([sourceItem("i1", MOJIBAKE_C_ACUTE, { priceRsd: 100 })]));
    expect(result.report.text.encodingSuspect).toBe(1);
    expect(result.report.warnings).toContainEqual({
      code: "text_encoding_suspect",
      section: "Jela",
      article: MOJIBAKE_C_ACUTE,
    });
  });

  test("a legitimate name starting with Ä (Äpfel) is not suspect", () => {
    const result = plan(singleGroup([sourceItem("i1", "Äpfel strudel", { priceRsd: 100 })]));
    expect(result.report.text.encodingSuspect).toBe(0);
    expect(warningCodes(result)).not.toContain("text_encoding_suspect");
  });

  test("ten articles without any č/ć/š/ž/đ are diacritics_absent", () => {
    const result = plan(sourceOf(legacyBigModel(1, 10).groups.map(toSourceGroup)));
    expect(result.articles).toHaveLength(10);
    expect(result.report.text.withDiacritics).toBe(0);
    expect(warningCodes(result)).toContain("diacritics_absent");
  });

  test("a single Ćevapi among the ten removes diacritics_absent", () => {
    const groups = legacyBigModel(1, 10).groups.map(toSourceGroup);
    groups[0].items[3] = sourceItem("itm-cevapi", "Ćevapi", { priceRsd: 790 });
    const result = plan(sourceOf(groups));
    expect(result.report.text.withDiacritics).toBe(1);
    expect(warningCodes(result)).not.toContain("diacritics_absent");
  });

  test("nine articles are too few to expect diacritics", () => {
    const result = plan(sourceOf(legacyBigModel(1, 9).groups.map(toSourceGroup)));
    expect(warningCodes(result)).not.toContain("diacritics_absent");
  });
});

/** legacyBigModel group → source group (through the real adapter). */
function toSourceGroup(group: ReturnType<typeof legacyBigModel>["groups"][number]): LegacySourceGroup {
  const source = legacySourceFromModel(
    { groups: [group], dayparts: [] },
    { kind: "draft", revision: 1, hasUnpublishedChanges: false },
  );
  return source.groups[0];
}

// -----------------------------------------------------------------------------
// 8. Duplicates
// -----------------------------------------------------------------------------

describe("planLegacyMenu — duplicates", () => {
  const twoEspresos = (secondPrice: number): LegacySource =>
    sourceOf([
      sourceGroup("g-topli", "Topli napici", [sourceItem("i1", "Espreso", { priceRsd: 150 })]),
      sourceGroup("g-pica", "Pića", [sourceItem("i2", "espreso ", { priceRsd: secondPrice })]),
    ]);

  test("two items with the same normalized name stay two separate articles", () => {
    const result = plan(twoEspresos(150));
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].key).not.toBe(result.articles[1].key);
    expect(result.articles[0].nameNormalized).toBe("espreso");
    expect(result.articles[1].nameNormalized).toBe("espreso");
  });

  test("the duplicate is reported with both occurrences and both sections", () => {
    const { report } = plan(twoEspresos(150));
    expect(report.duplicateCount).toBe(1);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]).toEqual({
      nameNormalized: "espreso",
      names: ["Espreso", "espreso"],
      sections: ["Topli napici", "Pića"],
      occurrences: 2,
      inDraft: 0,
      samePrice: true,
    });
    expect(report.warnings).toContainEqual({ code: "duplicate_name", article: "Espreso" });
  });

  test("samePrice is false when the prices differ", () => {
    expect(plan(twoEspresos(170)).report.duplicates[0].samePrice).toBe(false);
  });

  test("samePrice also compares the variants", () => {
    const result = plan(
      sourceOf([
        sourceGroup("g1", "Topli", [
          sourceItem("i1", "Kafa", { priceRsd: 150, variants: [{ id: "v1", label: "mala", priceRsd: 120 }] }),
        ]),
        sourceGroup("g2", "Pića", [
          sourceItem("i2", "Kafa", { priceRsd: 150, variants: [{ id: "v1", label: "mala", priceRsd: 130 }] }),
        ]),
      ]),
    );
    expect(result.report.duplicates[0].samePrice).toBe(false);
  });

  test("an existing article of the target with the same normalized name is counted as inDraft", () => {
    const target: LegacyTarget = {
      ...EMPTY_TARGET,
      articleCount: 1,
      articles: [{ key: "ar_clientmade01", name: "ESPRESO", nameNormalized: "espreso", basePriceRsd: 140 }],
    };
    const result = plan(singleGroup([sourceItem("i1", "Espreso", { priceRsd: 150 })]), target);
    expect(result.report.duplicates).toHaveLength(1);
    expect(result.report.duplicates[0]).toMatchObject({ occurrences: 1, inDraft: 1 });
    expect(result.report.target.otherArticles).toBe(1);
    expect(result.report.target.pendingArticles).toBe(1);
    expect(result.report.warnings).toContainEqual({ code: "target_not_empty" });
  });

  test("a client article with another name is target_not_empty but not a duplicate", () => {
    const target: LegacyTarget = {
      ...EMPTY_TARGET,
      articleCount: 1,
      articles: [{ key: "ar_clientmade01", name: "Palačinke", nameNormalized: "palacinke" }],
    };
    const result = plan(singleGroup([sourceItem("i1", "Espreso", { priceRsd: 150 })]), target);
    expect(result.report.duplicates).toEqual([]);
    expect(warningCodes(result)).toContain("target_not_empty");
  });

  test("the listed duplicates are capped, the count is not", () => {
    const items: LegacySourceItem[] = [];
    const pairs = MENU_MIGRATION_MAX_DUPLICATES + 50;
    for (let index = 0; index < pairs; index += 1) {
      items.push(sourceItem(`a${index}`, `Jelo ${index}`, { priceRsd: 100 }));
      items.push(sourceItem(`b${index}`, `Jelo ${index}`, { priceRsd: 100 }));
    }
    const { report } = plan(singleGroup(items));
    expect(report.duplicates).toHaveLength(MENU_MIGRATION_MAX_DUPLICATES);
    expect(report.duplicateCount).toBe(pairs);
    expect(report.warningCounts.duplicate_name).toBe(pairs);
  });
});

// -----------------------------------------------------------------------------
// 9. Repeated or empty ids
// -----------------------------------------------------------------------------

describe("planLegacyMenu — repeated and empty ids", () => {
  test("two items with the same id get different keys and duplicate_source_id", () => {
    const result = plan(
      sourceOf([
        sourceGroup("g1", "Topli", [sourceItem("same", "Espreso", { priceRsd: 150 })]),
        sourceGroup("g2", "Pića", [sourceItem("same", "Sok", { priceRsd: 200 })]),
      ]),
    );
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].key).not.toBe(result.articles[1].key);
    expect(result.articles.map((article) => article.legacyRef)).toEqual(["draft:same", "draft:same#2"]);
    expect(result.report.warningCounts.duplicate_source_id).toBe(1);
    expect(result.report.warnings).toContainEqual({ code: "duplicate_source_id", section: "Pića", article: "Sok" });
  });

  test("two groups with the same id get different section keys", () => {
    const result = plan(
      sourceOf([
        sourceGroup("same", "Topli", [sourceItem("i1", "Espreso", { priceRsd: 150 })]),
        sourceGroup("same", "Pića", [sourceItem("i2", "Sok", { priceRsd: 200 })]),
      ]),
    );
    expect(result.sections[0].key).not.toBe(result.sections[1].key);
    expect(result.report.warnings).toContainEqual({ code: "duplicate_source_id", section: "Pića" });
  });

  test("an empty group id gets a positional id, deterministically", () => {
    const source = sourceOf([
      sourceGroup("", "Topli", [sourceItem("i1", "Espreso", { priceRsd: 150 })]),
      sourceGroup("", "Pića", [sourceItem("i2", "Sok", { priceRsd: 200 })]),
    ]);
    const first = plan(source);
    const second = plan(source);
    expect(first.sections.map((section) => section.key)).toEqual(second.sections.map((section) => section.key));
    expect(first.sections[0].key).not.toBe(first.sections[1].key);
    expect(first.sections.map((section) => section.legacyRef)).toEqual(["draft:g0", "draft:g1"]);
    expect(first.sections[0].key).toBe(legacyKey("section", "g0"));
  });

  test("an empty item id gets a positional id, deterministically", () => {
    const source = singleGroup([sourceItem("", "Espreso", { priceRsd: 150 }), sourceItem(" ", "Sok", { priceRsd: 200 })]);
    const first = plan(source);
    const second = plan(source);
    expect(first.articles.map((article) => article.key)).toEqual(second.articles.map((article) => article.key));
    expect(first.articles.map((article) => article.legacyRef)).toEqual(["draft:g0i0", "draft:g0i1"]);
    expect(first.articles[0].key).not.toBe(first.articles[1].key);
  });

  test("an id that equals a positional id of another entity is still made unique", () => {
    const result = plan(singleGroup([sourceItem("g0i1", "Espreso", { priceRsd: 150 }), sourceItem("", "Sok", { priceRsd: 200 })]));
    // the empty id of the second item is "g0i1", which the first item already took
    expect(result.articles[0].key).not.toBe(result.articles[1].key);
  });

  test("variants with the same id inside one item get different keys", () => {
    const result = plan(
      singleGroup([
        sourceItem("i1", "Kafa", {
          variants: [
            { id: "v", label: "mala", priceRsd: 100 },
            { id: "v", label: "velika", priceRsd: 150 },
          ],
        }),
      ]),
    );
    const keys = articleNamed(result, "Kafa").variants.map((variant) => variant.key);
    expect(new Set(keys).size).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// 10. Determinism and idempotence
// -----------------------------------------------------------------------------

describe("planLegacyMenu — determinism", () => {
  test("two runs over the same source give identical sections and articles", () => {
    const first = draftPlan();
    const second = draftPlan();
    expect(second.sections).toEqual(first.sections);
    expect(second.articles).toEqual(first.articles);
    expect(second.report).toEqual(first.report);
  });

  test("a live source with the same ids gets the same keys as a draft source", () => {
    const model = legacyDraftModel();
    const draft = plan(legacySourceFromModel(model, { kind: "draft", revision: 4, hasUnpublishedChanges: false }));
    const live = plan(legacySourceFromModel(model, { kind: "live", revision: 2, hasUnpublishedChanges: false }));
    expect(live.sections.map((section) => section.key)).toEqual(draft.sections.map((section) => section.key));
    expect(live.articles.map((article) => article.key)).toEqual(draft.articles.map((article) => article.key));
    expect(live.articles.map((article) => article.variants.map((variant) => variant.key))).toEqual(
      draft.articles.map((article) => article.variants.map((variant) => variant.key)),
    );
    // only the reference prefix differs
    expect(live.articles[0].legacyRef).toBe("live:itm-espreso");
    expect(draft.articles[0].legacyRef).toBe("draft:itm-espreso");
    expect(live.sections[0].legacyRef).toBe("live:grp-topli");
    expect(live.report.source.kind).toBe("live");
  });

  test("an import source gets the import prefix", () => {
    const result = plan(singleGroup([sourceItem("i1", "Čorba", { priceRsd: 100 })], { kind: "import", revision: 0 }));
    expect(result.articles[0].legacyRef).toBe("import:i1");
  });

  test("the keys do not depend on the item position or the neighbours", () => {
    const alone = plan(singleGroup([sourceItem("i2", "Sok", { priceRsd: 200 })]));
    const withNeighbour = plan(
      singleGroup([sourceItem("i1", "Espreso", { priceRsd: 150 }), sourceItem("i2", "Sok", { priceRsd: 200 })]),
    );
    expect(articleNamed(withNeighbour, "Sok").key).toBe(articleNamed(alone, "Sok").key);
  });
});

// -----------------------------------------------------------------------------
// 11. The target
// -----------------------------------------------------------------------------

describe("planLegacyMenu — target", () => {
  test("a target that already holds every planned key has nothing pending", () => {
    const first = draftPlan();
    const again = plan(draftSource(), targetFrom(first));
    expect(again.report.target).toEqual({
      existingSections: 3,
      pendingSections: 0,
      existingArticles: 8,
      pendingArticles: 0,
      otherArticles: 0,
    });
    expect(warningCodes(again)).not.toContain("target_not_empty");
    expect(again.report.blockers).toEqual([]);
  });

  test("a target that holds half of the keys gives exact counts", () => {
    const source = sourceOf(legacyBigModel(2, 4).groups.map(toSourceGroup));
    const full = plan(source);
    expect(full.articles).toHaveLength(8);
    const half: LegacyTarget = {
      ...EMPTY_TARGET,
      articleCount: 4,
      pagePlacementCount: 4,
      sections: full.sections.slice(0, 1).map((section) => ({ key: section.key, name: section.name, order: section.order })),
      articles: full.articles.slice(0, 4).map((article) => ({
        key: article.key,
        name: article.name,
        nameNormalized: article.nameNormalized,
      })),
    };
    const result = plan(source, half);
    expect(result.report.target).toEqual({
      existingSections: 1,
      pendingSections: 1,
      existingArticles: 4,
      pendingArticles: 4,
      otherArticles: 0,
    });
  });

  test("client sections (keys not from the plan) push the planned sections after them", () => {
    const target: LegacyTarget = {
      ...EMPTY_TARGET,
      sections: [
        { key: "sc_clientmade01", name: "Moja sekcija", order: 5000 },
        { key: "sc_clientmade02", name: "Druga sekcija", order: 300 },
      ],
    };
    const result = draftPlan();
    const pushed = plan(draftSource(), target);
    expect(pushed.sections.every((section) => section.order > 5000)).toBe(true);
    expect(pushed.sections.map((section) => section.order)).toEqual([
      5000 + ORDER_STEP,
      5000 + 2 * ORDER_STEP,
      5000 + 3 * ORDER_STEP,
    ]);
    // the same keys either way: only the order moves
    expect(pushed.sections.map((section) => section.key)).toEqual(result.sections.map((section) => section.key));
  });

  test("an already planned section with a high order does not push the others", () => {
    const first = draftPlan();
    const target: LegacyTarget = {
      ...EMPTY_TARGET,
      sections: first.sections.map((section) => ({ key: section.key, name: section.name, order: 90_000 })),
    };
    const again = plan(draftSource(), target);
    expect(again.sections.map((section) => section.order)).toEqual(first.sections.map((section) => section.order));
  });
});

// -----------------------------------------------------------------------------
// 12. Ceilings (blockers)
// -----------------------------------------------------------------------------

describe("planLegacyMenu — blockers", () => {
  const bigSource = (groups: number, itemsPerGroup: number) =>
    sourceOf(legacyBigModel(groups, itemsPerGroup).groups.map(toSourceGroup));

  test("101 groups is sections_limit", () => {
    expect(plan(bigSource(101, 1)).report.blockers).toEqual(["sections_limit"]);
  });

  test("100 groups still fits", () => {
    expect(plan(bigSource(100, 1)).report.blockers).toEqual([]);
  });

  test("client sections count towards sections_limit", () => {
    const clientSections = Array.from({ length: 98 }, (_, index) => ({
      key: `sc_client${String(index).padStart(5, "0")}`,
      name: `Sekcija ${index}`,
      order: index,
    }));
    const target: LegacyTarget = { ...EMPTY_TARGET, sections: clientSections };
    expect(plan(draftSource(), target).report.blockers).toEqual(["sections_limit"]);
    expect(plan(bigSource(2, 1), target).report.blockers).toEqual([]);
  });

  test("articleCount 1995 plus 8 new articles is articles_limit", () => {
    const result = plan(draftSource(), { ...EMPTY_TARGET, articleCount: 1995 });
    expect(result.report.blockers).toEqual(["articles_limit"]);
  });

  test("articleCount 1992 plus 8 new articles is exactly the ceiling and fits", () => {
    const result = plan(draftSource(), { ...EMPTY_TARGET, articleCount: 1992 });
    expect(result.report.blockers).toEqual([]);
  });

  test("pagePlacementCount 3995 plus 8 is placements_limit", () => {
    const result = plan(draftSource(), { ...EMPTY_TARGET, pagePlacementCount: 3995 });
    expect(result.report.blockers).toEqual(["placements_limit"]);
  });

  test("both counters over give both blockers", () => {
    const result = plan(draftSource(), { ...EMPTY_TARGET, articleCount: 2000, pagePlacementCount: 4000 });
    expect(result.report.blockers).toEqual(["articles_limit", "placements_limit"]);
  });

  test("planned keys that already exist are not counted twice", () => {
    const first = draftPlan();
    const target: LegacyTarget = {
      ...targetFrom(first),
      articleCount: 2000,
      pagePlacementCount: 4000,
    };
    const again = plan(draftSource(), target);
    expect(again.report.target.pendingArticles).toBe(0);
    expect(again.report.blockers).toEqual([]);
  });

  test("a partly migrated target counts only the pending articles", () => {
    const first = draftPlan();
    const half = targetFrom(first);
    const target: LegacyTarget = {
      ...half,
      articles: half.articles.slice(0, 4), // 4 exist, 4 pending
      articleCount: 1997, // 1997 + 4 = 2001
    };
    expect(plan(draftSource(), target).report.blockers).toEqual(["articles_limit"]);
    expect(plan(draftSource(), { ...target, articleCount: 1996 }).report.blockers).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 13. Verification
// -----------------------------------------------------------------------------

describe("planLegacyMenu — verify", () => {
  const migrated = draftPlan();
  const exact = targetFrom(migrated);
  const espresoKey = articleNamed(migrated, "Espreso").key;
  const kapucinoKey = articleNamed(migrated, "Kapućino").key;
  const domacaKey = articleNamed(migrated, "Domaća kafa").key;

  function verify(target: LegacyTarget, options: LegacyPlanOptions = VERIFY) {
    return plan(draftSource(), target, options).report;
  }

  test("a target that matches the plan has no differences", () => {
    const report = verify(exact);
    expect(report.differenceCount).toBe(0);
    expect(report.differences).toEqual([]);
  });

  test("a changed price is price_differs", () => {
    const report = verify({
      ...exact,
      articles: exact.articles.map((article) =>
        article.key === espresoKey ? { ...article, basePriceRsd: 160 } : article,
      ),
    });
    expect(report.differences).toEqual([{ code: "price_differs", section: "Topli napici", article: "Espreso" }]);
    expect(report.differenceCount).toBe(1);
  });

  test("a removed base price is price_differs", () => {
    const report = verify({
      ...exact,
      articles: exact.articles.map((article) =>
        article.key === espresoKey ? { key: article.key, name: article.name, nameNormalized: article.nameNormalized } : article,
      ),
    });
    expect(report.differences.map((difference) => difference.code)).toEqual(["price_differs"]);
  });

  test("a changed name is name_differs", () => {
    const report = verify({
      ...exact,
      articles: exact.articles.map((article) =>
        article.key === espresoKey ? { ...article, name: "Espreso (novo)" } : article,
      ),
    });
    expect(report.differences).toEqual([{ code: "name_differs", section: "Topli napici", article: "Espreso" }]);
  });

  test("a missing variant is variants_differ", () => {
    const report = verify({
      ...exact,
      variants: exact.variants.filter((variant) => !(variant.articleKey === kapucinoKey && variant.name === "velika")),
    });
    expect(report.differences).toEqual([{ code: "variants_differ", section: "Topli napici", article: "Kapućino" }]);
  });

  test("a changed variant price is variants_differ", () => {
    const report = verify({
      ...exact,
      variants: exact.variants.map((variant) =>
        variant.articleKey === kapucinoKey && variant.name === "mala" ? { ...variant, priceRsd: 190 } : variant,
      ),
    });
    expect(report.differences.map((difference) => difference.code)).toEqual(["variants_differ"]);
  });

  test("variants are compared by their order, not by the row order", () => {
    const report = verify({
      ...exact,
      variants: exact.variants.slice().reverse(),
    });
    expect(report.differenceCount).toBe(0);
    const swapped = verify({
      ...exact,
      variants: exact.variants.map((variant) =>
        variant.articleKey === kapucinoKey ? { ...variant, order: 3 * ORDER_STEP - variant.order } : variant,
      ),
    });
    expect(swapped.differences.map((difference) => difference.code)).toEqual(["variants_differ"]);
  });

  test("a missing placement is placement_missing", () => {
    const report = verify({
      ...exact,
      placements: exact.placements.filter((placement) => placement.articleKey !== espresoKey),
    });
    expect(report.differences).toEqual([{ code: "placement_missing", section: "Topli napici", article: "Espreso" }]);
  });

  test("a placement in another section is placement_missing", () => {
    const [other] = migrated.sections.filter((section) => section.name === "Pića");
    const report = verify({
      ...exact,
      placements: exact.placements.map((placement) =>
        placement.articleKey === espresoKey ? { ...placement, sectionKey: other.key } : placement,
      ),
    });
    expect(report.differences.map((difference) => difference.code)).toEqual(["placement_missing"]);
  });

  test("two placements swapped inside a section are order_differs", () => {
    const report = verify({
      ...exact,
      placements: exact.placements.map((placement) => {
        if (placement.articleKey === espresoKey) return { ...placement, order: 2 * ORDER_STEP };
        if (placement.articleKey === domacaKey) return { ...placement, order: ORDER_STEP };
        return placement;
      }),
    });
    expect(report.differences).toEqual([{ code: "order_differs", section: "Topli napici" }]);
    expect(report.differenceCount).toBe(1);
  });

  test("order_differs is reported once per section, however many rows are out of order", () => {
    const report = verify({
      ...exact,
      placements: exact.placements.map((placement) => ({ ...placement, order: 100 })),
    });
    expect(report.differences.filter((difference) => difference.code === "order_differs")).toHaveLength(3);
  });

  test("articles that are not in the target yet are pending, not differences", () => {
    const report = verify({ ...exact, articles: [], variants: [], placements: [] });
    expect(report.differenceCount).toBe(0);
    expect(report.target.pendingArticles).toBe(8);
  });

  test("with verify false the differences are not computed", () => {
    const broken: LegacyTarget = {
      ...exact,
      articles: exact.articles.map((article) => ({ ...article, basePriceRsd: 1 })),
      placements: [],
    };
    const report = verify(broken, OPTIONS);
    expect(report.differences).toEqual([]);
    expect(report.differenceCount).toBe(0);
    expect(verify(broken, VERIFY).differenceCount).toBeGreaterThan(0);
  });

  test("differences do not leak into the warnings", () => {
    const report = verify({ ...exact, placements: [] });
    expect(report.differenceCount).toBeGreaterThan(0);
    for (const code of MENU_MIGRATION_DIFFERENCES) {
      expect(report.warnings.map((warning) => warning.code)).not.toContain(code);
      expect(report.warningCounts).not.toHaveProperty(code);
    }
  });
});

// -----------------------------------------------------------------------------
// 14. Issue cap
// -----------------------------------------------------------------------------

describe("planLegacyMenu — the issue list is capped, the counts are not", () => {
  test("300 items without a price list 200 warnings and count all 300", () => {
    const items = Array.from({ length: 300 }, (_, index) => sourceItem(`i${index}`, `Jelo ${index}`));
    items[0] = sourceItem("i0", "Ćevapi"); // one diacritic keeps diacritics_absent out of the count
    const { report } = plan(singleGroup(items));
    expect(MENU_MIGRATION_MAX_ISSUES).toBe(200);
    expect(report.warnings).toHaveLength(MENU_MIGRATION_MAX_ISSUES);
    expect(report.warningCount).toBe(300);
    expect(report.warningCounts.price_missing).toBe(300);
    expect(report.prices.withoutPrice).toBe(300);
  });

  test("the first issues are the ones listed", () => {
    const items = Array.from({ length: 250 }, (_, index) => sourceItem(`i${index}`, `Jelo ${index}`));
    const { report } = plan(singleGroup(items));
    expect(report.warnings[0]).toEqual({ code: "price_missing", section: "Jela", article: "Jelo 0" });
    expect(report.warnings.at(-1)).toEqual({ code: "price_missing", section: "Jela", article: "Jelo 199" });
  });

  test("differences are capped the same way", () => {
    const source = singleGroup(Array.from({ length: 250 }, (_, index) => sourceItem(`i${index}`, `Jelo ${index}`, { priceRsd: 100 })));
    const first = plan(source);
    const target: LegacyTarget = {
      ...targetFrom(first),
      articles: targetFrom(first).articles.map((article) => ({ ...article, basePriceRsd: 999 })),
    };
    const { report } = plan(source, target, VERIFY);
    expect(report.differences).toHaveLength(MENU_MIGRATION_MAX_ISSUES);
    expect(report.differenceCount).toBe(250);
  });
});

// -----------------------------------------------------------------------------
// 15. plannedWrites
// -----------------------------------------------------------------------------

describe("plannedWrites", () => {
  test("sections + 2 per article + variants + 1 per unavailable article", () => {
    // 3 sections + 8 × 2 (article + placement) + 2 variants + 1 unavailable
    expect(plannedWrites(draftPlan())).toBe(3 + 16 + 2 + 1);
    expect(plannedWrites(draftPlan())).toBe(22);
  });

  test("an empty plan writes nothing", () => {
    expect(plannedWrites({ sections: [], articles: [] })).toBe(0);
  });

  test("a big model: sections + 2 per article", () => {
    const result = plan(sourceOf(legacyBigModel(4, 25).groups.map(toSourceGroup)));
    expect(plannedWrites(result)).toBe(4 + 2 * 100);
  });
});

// -----------------------------------------------------------------------------
// 16. matchOrderingItems
// -----------------------------------------------------------------------------

describe("matchOrderingItems", () => {
  const { articles } = draftPlan();

  test("matches by normalized name and counts the rest", () => {
    const result = matchOrderingItems(
      [
        { name: "ESPRESO", priceRsd: 150 },
        { name: "Kapucino", priceRsd: 220 },
        { name: "Domaća kafa", priceRsd: 999 },
        { name: "Nepostojeće piće", priceRsd: 100 },
        { name: "Kisela voda 0.33 l" },
      ],
      articles,
    );
    expect(result).toEqual({
      total: 5,
      matched: 4,
      unmatched: 1,
      priceDiffers: 1,
      unmatchedNames: ["Nepostojeće piće"],
    });
  });

  test("a name that differs only by case and spacing matches", () => {
    const result = matchOrderingItems([{ name: "ESPRESO", priceRsd: 150 }, { name: "  espreso  ", priceRsd: 150 }], articles);
    expect(result.matched).toBe(2);
    expect(result.priceDiffers).toBe(0);
  });

  test("priceDiffers when the price equals neither the base price nor a variant price", () => {
    const result = matchOrderingItems([{ name: "Espreso", priceRsd: 151 }], articles);
    expect(result).toMatchObject({ matched: 1, priceDiffers: 1 });
  });

  test("a price that equals a variant price is not a difference", () => {
    const result = matchOrderingItems(
      [
        { name: "Kapućino", priceRsd: 180 },
        { name: "Kapućino", priceRsd: 220 },
      ],
      articles,
    );
    expect(result).toMatchObject({ matched: 2, priceDiffers: 0 });
  });

  test("an ordering item without a price never differs", () => {
    expect(matchOrderingItems([{ name: "Espreso" }], articles)).toMatchObject({ matched: 1, priceDiffers: 0 });
  });

  test("with several articles of one name, any of them may match the price", () => {
    const twins = plan(
      sourceOf([
        sourceGroup("g1", "Topli", [sourceItem("i1", "Kafa", { priceRsd: 150 })]),
        sourceGroup("g2", "Pića", [sourceItem("i2", "Kafa", { priceRsd: 180 })]),
      ]),
    ).articles;
    expect(matchOrderingItems([{ name: "Kafa", priceRsd: 180 }], twins).priceDiffers).toBe(0);
    expect(matchOrderingItems([{ name: "Kafa", priceRsd: 200 }], twins).priceDiffers).toBe(1);
  });

  test("an empty ordering list and an empty menu", () => {
    expect(matchOrderingItems([], articles)).toEqual({
      total: 0,
      matched: 0,
      unmatched: 0,
      priceDiffers: 0,
      unmatchedNames: [],
    });
    expect(matchOrderingItems([{ name: "Espreso", priceRsd: 150 }], [])).toMatchObject({
      total: 1,
      matched: 0,
      unmatched: 1,
    });
  });

  test("unmatchedNames lists at most 50, unmatched counts all", () => {
    const names = Array.from({ length: 60 }, (_, index) => ({ name: `Nepoznato ${index + 1}` }));
    const result = matchOrderingItems(names, articles);
    expect(MENU_MIGRATION_MAX_UNMATCHED).toBe(50);
    expect(result.unmatched).toBe(60);
    expect(result.unmatchedNames).toHaveLength(50);
    expect(result.unmatchedNames[0]).toBe("Nepoznato 1");
    expect(result.unmatchedNames[49]).toBe("Nepoznato 50");
  });
});

// -----------------------------------------------------------------------------
// 17. variants_truncated
// -----------------------------------------------------------------------------

describe("planLegacyMenu — variants_truncated", () => {
  const variants = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `v${index}`, label: `Veličina ${index}`, priceRsd: 100 + index }));

  test("25 variants plan 20 and warn", () => {
    const result = plan(singleGroup([sourceItem("i1", "Kafa", { variants: variants(25) })]));
    const article = articleNamed(result, "Kafa");
    expect(article.variants).toHaveLength(20);
    expect(article.variants.map((variant) => variant.name)).toEqual(
      Array.from({ length: 20 }, (_, index) => `Veličina ${index}`),
    );
    expect(article.variants.at(-1)?.order).toBe(20 * ORDER_STEP);
    expect(new Set(article.variants.map((variant) => variant.key)).size).toBe(20);
    expect(result.report.planned.variants).toBe(20);
    expect(result.report.source.variants).toBe(25);
    expect(result.report.warnings).toContainEqual({ code: "variants_truncated", section: "Jela", article: "Kafa" });
  });

  test("exactly 20 variants fit without a warning", () => {
    const result = plan(singleGroup([sourceItem("i1", "Kafa", { variants: variants(20) })]));
    expect(articleNamed(result, "Kafa").variants).toHaveLength(20);
    expect(warningCodes(result)).not.toContain("variants_truncated");
  });
});

// -----------------------------------------------------------------------------
// The machine codes
// -----------------------------------------------------------------------------

describe("migration codes", () => {
  test("blockers, warnings and differences never share a code", () => {
    const all = [...MENU_MIGRATION_BLOCKERS, ...MENU_MIGRATION_WARNINGS, ...MENU_MIGRATION_DIFFERENCES];
    expect(new Set(all).size).toBe(all.length);
  });

  test("the error codes are unique and namespaced", () => {
    const codes = Object.values(MENU_MIGRATION_ERROR);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code.startsWith("migration/")).toBe(true);
  });

  test("the manual checks are the four master §6.3 items, in order", () => {
    expect(MENU_MIGRATION_MANUAL_CHECKS).toEqual([
      "image_rights",
      "allergens_provided",
      "phone_layout",
      "preview_before_publish",
    ]);
  });

  test("every code a plan emits is a declared warning or difference", () => {
    const messy = plan(
      sourceOf(
        [
          sourceGroup("g1", "", [
            sourceItem("dup", "Espreso", { priceRsd: 149.6, photoStorageId: "p", videoStorageId: "v", pairingCount: 2 }),
            sourceItem("dup", "espreso", { priceRsd: 0, available: false, offLive: true }),
            sourceItem("i3", "   "),
            sourceItem("i4", MOJIBAKE_C_ACUTE, { priceRsd: -1, variants: [{ id: "v", label: "", priceRsd: 1 }] }),
          ], { shape: "galerija", daypartKey: "rucak" }),
        ],
        { hasUnpublishedChanges: true, daypartCount: 1 },
      ),
      { ...EMPTY_TARGET, articles: [{ key: "ar_clientmade01", name: "X", nameNormalized: "x" }] },
    );
    const declared = new Set<string>([...MENU_MIGRATION_WARNINGS, ...MENU_MIGRATION_DIFFERENCES]);
    expect(messy.report.warnings.length).toBeGreaterThan(10);
    for (const warning of messy.report.warnings) expect(declared.has(warning.code)).toBe(true);
  });
});
