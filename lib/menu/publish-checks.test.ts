// ScanMe Menu V1 (K05) — the checks of a whole publication: K04's article
// rules over exactly the articles guests would see, plus translations, Room
// service and language limits, and the fingerprint of the warnings. Fictional
// data only.

import { describe, expect, test } from "vitest";
import {
  MENU_ISSUE_SAMPLE,
  checkPublication,
  issuesFingerprint,
  translationWarnings,
  validationArticles,
  type MenuPublishIssue,
  type PublishCheckContext,
} from "./publish-checks";
import type { MenuPromo } from "./promo";
import { publishedLanguages } from "./snapshot";
import type {
  MenuDraftSnapshot,
  SnapshotAddonGroup,
  SnapshotAddonOption,
  SnapshotArticle,
  SnapshotArticleAddonGroup,
  SnapshotComboComponent,
  SnapshotPage,
  SnapshotPlacement,
  SnapshotRoomServiceCategory,
  SnapshotRoomServiceItem,
  SnapshotSection,
  SnapshotTranslationEntry,
  SnapshotTranslations,
  SnapshotVariant,
} from "./snapshot";

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

function page(key: string, order: number, overrides: Partial<SnapshotPage> = {}): SnapshotPage {
  return {
    key,
    slug: key.replace(/^pg_/, ""),
    name: key,
    publicTitle: null,
    isDefault: false,
    order,
    visibility: "visible",
    archivedAt: null,
    iconKey: null,
    navigation: "standalone",
    translations: null,
    ...overrides,
  };
}

function section(
  key: string,
  pageKey: string,
  order: number,
  overrides: Partial<SnapshotSection> = {},
): SnapshotSection {
  return {
    key,
    pageKey,
    name: key,
    description: null,
    iconKey: null,
    order,
    visibility: "visible",
    translations: null,
    ...overrides,
  };
}

function article(
  key: string,
  name: string,
  basePriceRsd: number | null,
  overrides: Partial<SnapshotArticle> = {},
): SnapshotArticle {
  return {
    key,
    kind: "item",
    name,
    description: null,
    quantityValue: null,
    quantityUnit: null,
    basePriceRsd,
    mediaMode: "none",
    imageMediaId: null,
    iconKey: null,
    variantsEnabled: false,
    addonsEnabled: false,
    noteEnabled: false,
    allergens: null,
    tags: null,
    promo: null,
    priceCheck: null,
    translations: null,
    ...overrides,
  };
}

function placement(
  pageKey: string,
  sectionKey: string,
  articleKey: string,
  order: number,
  overrides: Partial<SnapshotPlacement> = {},
): SnapshotPlacement {
  return { pageKey, sectionKey, articleKey, order, visibility: "visible", ...overrides };
}

function variant(
  key: string,
  articleKey: string,
  priceRsd: number | null,
  order: number,
  overrides: Partial<SnapshotVariant> = {},
): SnapshotVariant {
  return { key, articleKey, name: key, priceRsd, order, translations: null, ...overrides };
}

function group(key: string, overrides: Partial<SnapshotAddonGroup> = {}): SnapshotAddonGroup {
  return {
    key,
    name: key,
    selection: "multiple",
    required: false,
    minSelect: null,
    maxSelect: null,
    translations: null,
    ...overrides,
  };
}

function option(
  key: string,
  groupKey: string,
  order: number,
  overrides: Partial<SnapshotAddonOption> = {},
): SnapshotAddonOption {
  return { key, groupKey, name: key, priceDeltaRsd: 0, order, translations: null, ...overrides };
}

function link(articleKey: string, groupKey: string, order: number): SnapshotArticleAddonGroup {
  return { articleKey, groupKey, order };
}

function component(comboKey: string, componentKey: string, order: number): SnapshotComboComponent {
  return { comboKey, componentKey, quantity: 1, order };
}

function roomServiceCategory(
  key: string,
  name: string,
  order: number,
  translations: SnapshotTranslations = null,
): SnapshotRoomServiceCategory {
  return { key, name, order, translations };
}

function roomServiceItem(
  articleKey: string,
  categoryKey: string,
  order: number,
  overrides: Partial<SnapshotRoomServiceItem> = {},
): SnapshotRoomServiceItem {
  return {
    articleKey,
    categoryKey,
    order,
    markupApplies: false,
    manualPriceRsd: null,
    priceWarning: null,
    manualVariantPrices: null,
    ...overrides,
  };
}

const confirmed = (
  fields: Pick<SnapshotTranslationEntry, "name" | "description" | "publicTitle">,
): SnapshotTranslationEntry => ({ ...fields, status: "confirmed" });

const suggested = (
  fields: Pick<SnapshotTranslationEntry, "name" | "description" | "publicTitle">,
): SnapshotTranslationEntry => ({ ...fields, status: "suggested" });

/** One default page, one section, three complete shown articles. Tests override whole lists. */
function draft(parts: Partial<MenuDraftSnapshot> = {}): MenuDraftSnapshot {
  return {
    formatVersion: 1,
    settings: { languages: null, allergensEnabled: null },
    presentation: null,
    pages: [page("pg_main", 1, { isDefault: true, name: "Kompletan meni" })],
    sections: [section("se_main", "pg_main", 1)],
    articles: [
      article("ar_pljeskavica", "Pljeskavica", 450),
      article("ar_cevapi", "Ćevapi", 520),
      article("ar_kafa", "Kafa", 180),
    ],
    placements: [
      placement("pg_main", "se_main", "ar_pljeskavica", 1),
      placement("pg_main", "se_main", "ar_cevapi", 2),
      placement("pg_main", "se_main", "ar_kafa", 3),
    ],
    variants: [],
    addonGroups: [],
    addonOptions: [],
    articleAddonGroups: [],
    comboComponents: [],
    roomService: { config: null, categories: [], items: [] },
    ...parts,
  };
}

/** A deep copy changed by `change` — the original stays as it was. */
function edit(source: MenuDraftSnapshot, change: (copy: MenuDraftSnapshot) => void): MenuDraftSnapshot {
  const copy = JSON.parse(JSON.stringify(source)) as MenuDraftSnapshot;
  change(copy);
  return copy;
}

function find<T extends { key: string }>(rows: T[], key: string): T {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) throw new Error(`test fixture: no row ${key}`);
  return row;
}

const PREMIUM = { roomService: true, scheduledPromos: true, maxLanguages: 10 };
const STANDARD = { roomService: false, scheduledPromos: false, maxLanguages: 1 };

function context(overrides: Partial<PublishCheckContext> = {}): PublishCheckContext {
  return { roomServiceSwitch: false, capabilities: PREMIUM, ...overrides };
}

const withLanguages = (translations: string[], source = "sr") => ({
  languages: { source, translations },
  allergensEnabled: null,
});

const codes = (issues: readonly MenuPublishIssue[]) => issues.map((issue) => issue.code);
const ofCode = (issues: readonly MenuPublishIssue[], code: MenuPublishIssue["code"]) =>
  issues.filter((issue) => issue.code === code);

/** The shown Room service article without a price. */
function roomServiceDraft(overrides: Partial<MenuDraftSnapshot> = {}): MenuDraftSnapshot {
  return draft({
    articles: [...draft().articles, article("ar_dorucak", "Doručak u sobi", null)],
    roomService: {
      config: { markupBps: 0, markupScope: "all", deliveryFeeRsd: null },
      categories: [roomServiceCategory("rc_hrana", "Hrana", 1)],
      items: [roomServiceItem("ar_dorucak", "rc_hrana", 1)],
    },
    ...overrides,
  });
}

// -----------------------------------------------------------------------------
// validationArticles: K04 semantics over the snapshot
// -----------------------------------------------------------------------------

describe("validationArticles", () => {
  const NO_RS = { roomServicePublished: false };
  const byKey = (rows: ReturnType<typeof validationArticles>) => Object.fromEntries(rows.map((row) => [row.key, row]));

  test("one entry per article, in key order, with the K04 fields", () => {
    const rows = validationArticles(draft(), NO_RS);
    expect(rows.map((row) => row.key)).toEqual(["ar_cevapi", "ar_kafa", "ar_pljeskavica"]);
    expect(byKey(rows).ar_kafa).toEqual({
      key: "ar_kafa",
      kind: "item",
      name: "Kafa",
      basePriceRsd: 180,
      variantsEnabled: false,
      variants: [],
      addonsEnabled: false,
      addonGroups: [],
      promo: null,
      comboComponentCount: 0,
      priceCheckPending: false,
      sectionCount: 1,
      visibleCount: 1,
      inRoomService: false,
      componentOfCombos: 0,
    });
  });

  test("a hidden placement counts as placed but not visible", () => {
    const snapshot = edit(draft(), (d) => {
      const hidden = d.placements.find((row) => row.articleKey === "ar_kafa");
      if (hidden) hidden.visibility = "hidden";
    });
    expect(byKey(validationArticles(snapshot, NO_RS)).ar_kafa).toMatchObject({ sectionCount: 1, visibleCount: 0 });
  });

  test("a hidden section and a hidden page count as placed but not visible", () => {
    const snapshot = draft({
      pages: [page("pg_main", 1, { isDefault: true }), page("pg_skrivena", 2, { visibility: "hidden" })],
      sections: [
        section("se_main", "pg_main", 1),
        section("se_skrivena", "pg_main", 2, { visibility: "hidden" }),
        section("se_na_skrivenoj", "pg_skrivena", 1),
      ],
      articles: [article("ar_a", "A", 100), article("ar_b", "B", 100), article("ar_c", "C", 100)],
      placements: [
        placement("pg_main", "se_main", "ar_a", 1),
        placement("pg_main", "se_skrivena", "ar_b", 1),
        placement("pg_skrivena", "se_na_skrivenoj", "ar_c", 1),
      ],
    });
    const rows = byKey(validationArticles(snapshot, NO_RS));
    expect(rows.ar_a).toMatchObject({ sectionCount: 1, visibleCount: 1 });
    expect(rows.ar_b).toMatchObject({ sectionCount: 1, visibleCount: 0 });
    expect(rows.ar_c).toMatchObject({ sectionCount: 1, visibleCount: 0 });
  });

  test("a placement on an archived page counts as nothing", () => {
    const snapshot = draft({
      pages: [page("pg_main", 1, { isDefault: true }), page("pg_arhiva", 2, { archivedAt: 1_760_000_000_000 })],
      sections: [section("se_main", "pg_main", 1), section("se_arhiva", "pg_arhiva", 1)],
      articles: [article("ar_a", "A", 100)],
      placements: [placement("pg_arhiva", "se_arhiva", "ar_a", 1)],
    });
    expect(byKey(validationArticles(snapshot, NO_RS)).ar_a).toMatchObject({ sectionCount: 0, visibleCount: 0 });
  });

  test("a placement whose page or section does not exist counts as nothing", () => {
    const snapshot = draft({
      articles: [article("ar_a", "A", 100), article("ar_b", "B", 100)],
      placements: [
        placement("pg_main", "se_nigde", "ar_a", 1),
        placement("pg_nigde", "se_main", "ar_b", 1),
      ],
    });
    const rows = byKey(validationArticles(snapshot, NO_RS));
    expect(rows.ar_a).toMatchObject({ sectionCount: 0, visibleCount: 0 });
    expect(rows.ar_b).toMatchObject({ sectionCount: 0, visibleCount: 0 });
  });

  test("an article placed in two sections is counted twice", () => {
    const snapshot = draft({
      sections: [section("se_main", "pg_main", 1), section("se_druga", "pg_main", 2)],
      articles: [article("ar_a", "A", 100)],
      placements: [placement("pg_main", "se_main", "ar_a", 1), placement("pg_main", "se_druga", "ar_a", 1)],
    });
    expect(byKey(validationArticles(snapshot, NO_RS)).ar_a).toMatchObject({ sectionCount: 2, visibleCount: 2 });
  });

  test("Room service membership counts only when Room service is published", () => {
    const snapshot = roomServiceDraft();
    expect(byKey(validationArticles(snapshot, { roomServicePublished: true })).ar_dorucak.inRoomService).toBe(true);
    expect(byKey(validationArticles(snapshot, { roomServicePublished: false })).ar_dorucak.inRoomService).toBe(false);
    expect(byKey(validationArticles(snapshot, { roomServicePublished: true })).ar_kafa.inRoomService).toBe(false);
  });

  test("variants are listed only while variants are on", () => {
    const snapshot = draft({
      articles: [
        article("ar_a", "A", 100, { variantsEnabled: true }),
        article("ar_b", "B", 100, { variantsEnabled: false }),
      ],
      placements: [placement("pg_main", "se_main", "ar_a", 1), placement("pg_main", "se_main", "ar_b", 2)],
      variants: [variant("va_a1", "ar_a", 120, 1), variant("va_a2", "ar_a", null, 2), variant("va_b1", "ar_b", 90, 1)],
    });
    const rows = byKey(validationArticles(snapshot, NO_RS));
    expect(rows.ar_a.variants).toEqual([
      { key: "va_a1", priceRsd: 120 },
      { key: "va_a2", priceRsd: null },
    ]);
    expect(rows.ar_b.variants).toEqual([]);
  });

  test("add-on groups are listed only while add-ons are on, with their option count and rules", () => {
    const snapshot = draft({
      articles: [
        article("ar_a", "A", 100, { addonsEnabled: true }),
        article("ar_b", "B", 100, { addonsEnabled: false }),
      ],
      placements: [placement("pg_main", "se_main", "ar_a", 1), placement("pg_main", "se_main", "ar_b", 2)],
      addonGroups: [
        group("ag_sosovi", { required: true, minSelect: 2, maxSelect: 3 }),
        group("ag_prazna", { selection: "single" }),
      ],
      addonOptions: [option("ao_1", "ag_sosovi", 1), option("ao_2", "ag_sosovi", 2), option("ao_3", "ag_sosovi", 3)],
      articleAddonGroups: [
        link("ar_a", "ag_sosovi", 1),
        link("ar_a", "ag_prazna", 2),
        link("ar_a", "ag_nigde", 3),
        link("ar_b", "ag_sosovi", 1),
      ],
    });
    const rows = byKey(validationArticles(snapshot, NO_RS));
    expect(rows.ar_a.addonGroups).toEqual([
      { key: "ag_sosovi", selection: "multiple", required: true, minSelect: 2, maxSelect: 3, optionCount: 3 },
      { key: "ag_prazna", selection: "single", required: false, minSelect: null, maxSelect: null, optionCount: 0 },
    ]);
    expect(rows.ar_b.addonGroups).toEqual([]);
  });

  test("combo components are counted and the price check is pending only for a combo", () => {
    const pending = { since: 1_760_000_000_000, changedComponentKeys: ["ar_kafa"], removedComponentNames: [] };
    const snapshot = draft({
      articles: [
        article("ar_set", "Doručak set", 600, { kind: "combo", priceCheck: pending }),
        article("ar_set2", "Ručak set", 800, { kind: "combo" }),
        article("ar_kafa", "Kafa", 180, { priceCheck: pending }),
        article("ar_sok", "Sok", 150),
      ],
      placements: [placement("pg_main", "se_main", "ar_set", 1), placement("pg_main", "se_main", "ar_set2", 2)],
      comboComponents: [
        component("ar_set", "ar_kafa", 1),
        component("ar_set", "ar_sok", 2),
        component("ar_set2", "ar_kafa", 1),
      ],
    });
    const rows = byKey(validationArticles(snapshot, NO_RS));
    expect(rows.ar_set).toMatchObject({ comboComponentCount: 2, priceCheckPending: true });
    expect(rows.ar_set2).toMatchObject({ comboComponentCount: 1, priceCheckPending: false });
    expect(rows.ar_kafa).toMatchObject({ comboComponentCount: 0, priceCheckPending: false, componentOfCombos: 2 });
    expect(rows.ar_sok).toMatchObject({ componentOfCombos: 1 });
  });

  test("the promotion is passed through", () => {
    const promo: MenuPromo = { active: true, mode: "percent", percent: 10 };
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").promo = promo;
    });
    expect(byKey(validationArticles(snapshot, NO_RS)).ar_kafa.promo).toEqual(promo);
  });

  test("the snapshot is not mutated", () => {
    const snapshot = draft();
    snapshot.articles.reverse();
    snapshot.placements.reverse();
    const before = JSON.stringify(snapshot);
    validationArticles(snapshot, NO_RS);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});

// -----------------------------------------------------------------------------
// checkPublication: article rules over the publication
// -----------------------------------------------------------------------------

describe("checkPublication: article rules", () => {
  test("a clean draft is ok, has no issue and a fingerprint of no warnings", () => {
    const result = checkPublication(draft(), context());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.fingerprint).toBe(issuesFingerprint([]));
    expect(result.languages).toEqual({ source: "sr", languages: ["sr"], dropped: [] });
    expect(result.roomServicePublished).toBe(false);
  });

  test("an error in a shown article blocks publishing: ok is false", () => {
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").basePriceRsd = null;
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ code: "price_missing", articleKey: "ar_kafa" }]);
  });

  test("errors are not repeated among the warnings, and warnings do not block", () => {
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").name = "";
      d.articles.push(article("ar_nigde", "Nigde", 100));
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toEqual(["name_missing"]);
    expect(result.warnings).toEqual([{ code: "article_unplaced", articleKey: "ar_nigde" }]);
    const warningsOnly = checkPublication(
      edit(draft(), (d) => {
        d.articles.push(article("ar_nigde", "Nigde", 100));
      }),
      context(),
    );
    expect(warningsOnly.ok).toBe(true);
  });

  test("a hidden incomplete article gives no error and no warning", () => {
    const snapshot = edit(draft(), (d) => {
      d.articles.push(article("ar_skica", "", null));
      d.placements.push(placement("pg_main", "se_main", "ar_skica", 4, { visibility: "hidden" }));
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("an incomplete article in a hidden section or on a hidden page gives no issue either", () => {
    const snapshot = edit(draft(), (d) => {
      d.pages.push(page("pg_skrivena", 2, { visibility: "hidden" }));
      d.sections.push(
        section("se_skrivena", "pg_main", 2, { visibility: "hidden" }),
        section("se_na_skrivenoj", "pg_skrivena", 1),
      );
      d.articles.push(article("ar_x", "", null), article("ar_y", "", null));
      d.placements.push(
        placement("pg_main", "se_skrivena", "ar_x", 1),
        placement("pg_skrivena", "se_na_skrivenoj", "ar_y", 1),
      );
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("an article that is not placed anywhere gives article_unplaced, not an error", () => {
    const snapshot = edit(draft(), (d) => {
      d.articles.push(article("ar_nigde", "", null));
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([{ code: "article_unplaced", articleKey: "ar_nigde" }]);
  });

  test("an article placed only on an archived page is unplaced", () => {
    const snapshot = edit(draft(), (d) => {
      d.pages.push(page("pg_arhiva", 2, { archivedAt: 1_760_000_000_000 }));
      d.sections.push(section("se_arhiva", "pg_arhiva", 1));
      d.articles.push(article("ar_stari", "Stari", 100));
      d.placements.push(placement("pg_arhiva", "se_arhiva", "ar_stari", 1));
    });
    expect(checkPublication(snapshot, context()).warnings).toEqual([
      { code: "article_unplaced", articleKey: "ar_stari" },
    ]);
  });

  test("an article that is only a combo component gives nothing, even when incomplete", () => {
    const snapshot = edit(draft(), (d) => {
      d.articles.push(article("ar_set", "Doručak set", 600, { kind: "combo" }), article("ar_sastojak", "", null));
      d.placements.push(placement("pg_main", "se_main", "ar_set", 4));
      d.comboComponents.push(component("ar_set", "ar_kafa", 1), component("ar_set", "ar_sastojak", 2));
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("a component of a combo that is itself unplaced is still a component: only the combo is reported", () => {
    const snapshot = edit(draft(), (d) => {
      d.articles.push(article("ar_set", "Doručak set", 600, { kind: "combo" }), article("ar_sastojak", "Džem", 50));
      d.comboComponents.push(component("ar_set", "ar_sastojak", 1));
    });
    expect(checkPublication(snapshot, context()).warnings).toEqual([
      { code: "article_unplaced", articleKey: "ar_set" },
    ]);
  });

  test("a shown combo without components and with a pending price check warns", () => {
    const snapshot = edit(draft(), (d) => {
      d.articles.push(
        article("ar_set", "Prazan set", 600, {
          kind: "combo",
          priceCheck: { since: 1_760_000_000_000, changedComponentKeys: [], removedComponentNames: ["Džem"] },
        }),
      );
      d.placements.push(placement("pg_main", "se_main", "ar_set", 4));
    });
    expect(checkPublication(snapshot, context()).warnings).toEqual([
      { code: "combo_price_check", articleKey: "ar_set" },
      { code: "combo_empty", articleKey: "ar_set" },
    ]);
  });

  test("an item with a price check record is not a pending combo check", () => {
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").priceCheck = { since: 1, changedComponentKeys: [], removedComponentNames: [] };
    });
    expect(checkPublication(snapshot, context()).warnings).toEqual([]);
  });

  test("variant and add-on rules apply to a shown article, keyed by the entity", () => {
    const snapshot = edit(draft(), (d) => {
      const kafa = find(d.articles, "ar_kafa");
      kafa.basePriceRsd = null;
      kafa.variantsEnabled = true;
      kafa.addonsEnabled = true;
      d.variants.push(variant("va_mala", "ar_kafa", 150, 1), variant("va_velika", "ar_kafa", null, 2));
      d.addonGroups.push(group("ag_prazna"));
      d.articleAddonGroups.push(link("ar_kafa", "ag_prazna", 1));
    });
    const result = checkPublication(snapshot, context());
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      { code: "variant_price_missing", articleKey: "ar_kafa", entityKey: "va_velika" },
      { code: "addon_group_empty", articleKey: "ar_kafa", entityKey: "ag_prazna" },
    ]);
  });

  test("a variant of an article with variants off is not validated", () => {
    const snapshot = edit(draft(), (d) => {
      d.variants.push(variant("va_bez_cene", "ar_kafa", null, 1));
    });
    expect(checkPublication(snapshot, context()).warnings).toEqual([]);
  });
});

describe("checkPublication: promotions and the plan", () => {
  const scheduled: MenuPromo = { active: true, mode: "percent", percent: 10, startsAt: 1_800_000_000_000 };

  test("a scheduled promotion warns without Premium scheduling and not with it", () => {
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").promo = scheduled;
    });
    expect(
      checkPublication(snapshot, context({ capabilities: { ...PREMIUM, scheduledPromos: false } })).warnings,
    ).toEqual([{ code: "promo_schedule_premium", articleKey: "ar_kafa" }]);
    expect(checkPublication(snapshot, context({ capabilities: PREMIUM })).warnings).toEqual([]);
  });

  test("a promotion that cannot apply warns", () => {
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").promo = { active: true, mode: "price", priceRsd: 200 };
    });
    expect(checkPublication(snapshot, context()).warnings).toEqual([
      { code: "promo_invalid", articleKey: "ar_kafa" },
    ]);
  });

  test("a promotion that is switched off gives no warning", () => {
    const snapshot = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").promo = { ...scheduled, active: false };
    });
    expect(checkPublication(snapshot, context({ capabilities: STANDARD })).warnings).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// checkPublication: Room service
// -----------------------------------------------------------------------------

describe("checkPublication: Room service", () => {
  test("switch on and Premium: Room service is published and its articles are validated as public", () => {
    const result = checkPublication(roomServiceDraft(), context({ roomServiceSwitch: true }));
    expect(result.roomServicePublished).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ code: "price_missing", articleKey: "ar_dorucak" }]);
    expect(codes(result.warnings)).not.toContain("room_service_premium");
  });

  test("switch on without the capability: room_service_premium, and its articles are not validated as public", () => {
    const result = checkPublication(roomServiceDraft(), context({ roomServiceSwitch: true, capabilities: STANDARD }));
    expect(result.roomServicePublished).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    // The Room service article is on no page: it is only unplaced now.
    expect(result.warnings).toEqual([
      { code: "article_unplaced", articleKey: "ar_dorucak" },
      { code: "room_service_premium" },
    ]);
  });

  test("switch off: nothing about Room service, even with the capability", () => {
    const result = checkPublication(roomServiceDraft(), context({ roomServiceSwitch: false }));
    expect(result.roomServicePublished).toBe(false);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).not.toContain("room_service_premium");
  });

  test("switch off without the capability: no room_service_premium either", () => {
    const result = checkPublication(roomServiceDraft(), context({ roomServiceSwitch: false, capabilities: STANDARD }));
    expect(result.roomServicePublished).toBe(false);
    expect(codes(result.warnings)).not.toContain("room_service_premium");
  });

  test("a complete Room service article is valid and gives no warning when published", () => {
    const snapshot = roomServiceDraft();
    find(snapshot.articles, "ar_dorucak").basePriceRsd = 700;
    const result = checkPublication(snapshot, context({ roomServiceSwitch: true }));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("a Room service article that is also on a page is validated either way", () => {
    const snapshot = roomServiceDraft();
    snapshot.placements.push(placement("pg_main", "se_main", "ar_dorucak", 4));
    const withRoomService = checkPublication(snapshot, context({ roomServiceSwitch: true, capabilities: PREMIUM }));
    const without = checkPublication(snapshot, context({ roomServiceSwitch: false, capabilities: PREMIUM }));
    expect(withRoomService.errors).toEqual([{ code: "price_missing", articleKey: "ar_dorucak" }]);
    expect(without.errors).toEqual([{ code: "price_missing", articleKey: "ar_dorucak" }]);
  });
});

// -----------------------------------------------------------------------------
// checkPublication: languages
// -----------------------------------------------------------------------------

describe("checkPublication: languages", () => {
  test("one language_premium warning per dropped language, in settings order", () => {
    const snapshot = edit(draft(), (d) => {
      d.settings = withLanguages(["en", "de", "ru", "fr"]);
    });
    const result = checkPublication(snapshot, context({ capabilities: { ...PREMIUM, maxLanguages: 2 } }));
    expect(result.languages).toEqual({ source: "sr", languages: ["sr", "en"], dropped: ["de", "ru", "fr"] });
    expect(ofCode(result.warnings, "language_premium")).toEqual([
      { code: "language_premium", lang: "de" },
      { code: "language_premium", lang: "ru" },
      { code: "language_premium", lang: "fr" },
    ]);
  });

  test("a Standard account with only the source language has no language warning", () => {
    const result = checkPublication(draft(), context({ capabilities: STANDARD }));
    expect(ofCode(result.warnings, "language_premium")).toEqual([]);
  });

  test("dropped languages are not checked for translations", () => {
    const snapshot = edit(draft(), (d) => {
      d.settings = withLanguages(["en", "de"]);
    });
    const result = checkPublication(snapshot, context({ capabilities: { ...PREMIUM, maxLanguages: 2 } }));
    expect(ofCode(result.warnings, "translation_missing").map((issue) => issue.lang)).toEqual(["en"]);
    expect(ofCode(result.warnings, "language_premium").map((issue) => issue.lang)).toEqual(["de"]);
  });

  test("warnings come in a fixed order: article rules, Room service, languages, translations", () => {
    const snapshot = roomServiceDraft();
    snapshot.settings = withLanguages(["en", "de"]);
    snapshot.articles.push(article("ar_nigde", "Nigde", 100));
    const result = checkPublication(
      snapshot,
      context({ roomServiceSwitch: true, capabilities: { ...STANDARD, maxLanguages: 2 } }),
    );
    expect(codes(result.warnings)).toEqual([
      "article_unplaced",
      "article_unplaced",
      "room_service_premium",
      "language_premium",
      "translation_missing",
    ]);
  });
});

// -----------------------------------------------------------------------------
// translation_missing
// -----------------------------------------------------------------------------

describe("checkPublication: translation_missing", () => {
  const translationOf = (snapshot: MenuDraftSnapshot, ctx: PublishCheckContext = context()) =>
    ofCode(checkPublication(snapshot, ctx).warnings, "translation_missing");

  test("one warning per translation language with the exact count and sorted keys", () => {
    const snapshot = draft({
      settings: withLanguages(["en", "de"]),
      sections: [
        section("se_main", "pg_main", 1, {
          name: "Glavna jela",
          translations: { en: confirmed({ name: "Main courses" }) },
        }),
      ],
      articles: [
        article("ar_a", "Ćevapi", 520, {
          description: "Sa lukom",
          translations: {
            en: confirmed({ name: "Cevapi", description: "With onion" }),
            de: suggested({ name: "Cevapi", description: "Mit Zwiebeln" }),
          },
        }),
        article("ar_b", "Pljeskavica", 450, { translations: { en: confirmed({ name: "Burger" }) } }),
        article("ar_c", "Kafa", 180),
      ],
      placements: [
        placement("pg_main", "se_main", "ar_c", 1),
        placement("pg_main", "se_main", "ar_b", 2),
        placement("pg_main", "se_main", "ar_a", 3),
      ],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["ar_c"] },
      { code: "translation_missing", lang: "de", count: 4, entityKeys: ["ar_a", "ar_b", "ar_c", "se_main"] },
    ]);
  });

  test("a suggested translation counts as missing, a confirmed one does not", () => {
    const base = (status: "confirmed" | "suggested") =>
      draft({
        settings: withLanguages(["en"]),
        articles: [article("ar_a", "Kafa", 180, { translations: { en: { name: "Coffee", status } } })],
        placements: [placement("pg_main", "se_main", "ar_a", 1)],
        sections: [section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } })],
      });
    expect(translationOf(base("confirmed"))).toEqual([]);
    expect(translationOf(base("suggested"))).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["ar_a"] },
    ]);
  });

  test("an empty confirmed text counts as missing", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } })],
      articles: [
        article("ar_a", "Kafa", 180, { translations: { en: confirmed({ name: "   " }) } }),
        article("ar_b", "Čaj", 150, { translations: { en: confirmed({ name: "" }) } }),
      ],
      placements: [placement("pg_main", "se_main", "ar_a", 1), placement("pg_main", "se_main", "ar_b", 2)],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 2, entityKeys: ["ar_a", "ar_b"] },
    ]);
  });

  test("a translated name does not cover a source description that has no translation", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } })],
      articles: [
        article("ar_a", "Kafa", 180, { description: "Domaća", translations: { en: confirmed({ name: "Coffee" }) } }),
      ],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["ar_a"] },
    ]);
  });

  test("a text the source does not have needs no translation", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [section("se_main", "pg_main", 1, { description: "   ", translations: { en: confirmed({ name: "Main" }) } })],
      articles: [article("ar_a", "Kafa", 180, { description: null, translations: { en: confirmed({ name: "Coffee" }) } })],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
    });
    expect(translationOf(snapshot)).toEqual([]);
  });

  test("the keys are capped at the sample size while the count stays exact", () => {
    expect(MENU_ISSUE_SAMPLE).toBe(20);
    const total = MENU_ISSUE_SAMPLE + 5;
    const names = Array.from({ length: total }, (_, i) => `ar_${String(i + 1).padStart(2, "0")}`);
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } })],
      // In descending order so the sort has to do the work.
      articles: names.slice().reverse().map((key) => article(key, `Artikal ${key}`, 100)),
      placements: names.slice().reverse().map((key, i) => placement("pg_main", "se_main", key, i + 1)),
    });
    const [issue] = translationOf(snapshot);
    expect(issue.count).toBe(total);
    expect(issue.entityKeys).toHaveLength(MENU_ISSUE_SAMPLE);
    expect(issue.entityKeys).toEqual(names.slice(0, MENU_ISSUE_SAMPLE));
  });

  test("entities that guests do not see are not counted", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      pages: [
        page("pg_main", 1, { isDefault: true }),
        page("pg_skrivena", 2, { visibility: "hidden", publicTitle: "Skrivena" }),
        page("pg_arhiva", 3, { archivedAt: 1_760_000_000_000, publicTitle: "Arhiva" }),
      ],
      sections: [
        section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } }),
        section("se_skrivena", "pg_main", 2, { visibility: "hidden", name: "Skrivena sekcija" }),
        section("se_prazna", "pg_main", 3, { name: "Prazna sekcija" }),
        section("se_sve_skriveno", "pg_main", 4, { name: "Sve skriveno" }),
        section("se_na_skrivenoj", "pg_skrivena", 1),
        section("se_arhiva", "pg_arhiva", 1),
      ],
      articles: [
        article("ar_prikazan", "Prikazan", 100),
        article("ar_skriven_plasman", "Skriven plasman", 100),
        article("ar_skrivena_sekcija", "Skrivena sekcija", 100),
        article("ar_skrivena_strana", "Skrivena strana", 100),
        article("ar_arhiva", "Arhiva", 100),
        article("ar_nigde", "Nigde", 100),
      ],
      placements: [
        placement("pg_main", "se_main", "ar_prikazan", 1),
        placement("pg_main", "se_main", "ar_skriven_plasman", 2, { visibility: "hidden" }),
        placement("pg_main", "se_skrivena", "ar_skrivena_sekcija", 1),
        placement("pg_main", "se_sve_skriveno", "ar_skriven_plasman", 1, { visibility: "hidden" }),
        placement("pg_skrivena", "se_na_skrivenoj", "ar_skrivena_strana", 1),
        placement("pg_arhiva", "se_arhiva", "ar_arhiva", 1),
      ],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["ar_prikazan"] },
    ]);
  });

  test("the source language is never warned about", () => {
    const only = draft({ settings: withLanguages([]) });
    expect(translationOf(only)).toEqual([]);

    const otherSource = draft({ settings: withLanguages(["sr"], "en") });
    const issues = translationOf(otherSource);
    expect(issues.map((issue) => issue.lang)).toEqual(["sr"]);
    expect(issues.some((issue) => issue.lang === "en")).toBe(false);
  });

  test("a translation language equal to the source is ignored", () => {
    const snapshot = draft({ settings: withLanguages(["sr", "en"]) });
    expect(translationOf(snapshot).map((issue) => issue.lang)).toEqual(["en"]);
  });

  test("a page's public title needs a translation, a page without one does not", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      pages: [
        page("pg_main", 1, { isDefault: true }),
        page("pg_pice", 2, { publicTitle: "Pića" }),
        page("pg_hrana", 3, { publicTitle: "Hrana", translations: { en: confirmed({ publicTitle: "Food" }) } }),
      ],
      sections: [
        section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } }),
        section("se_pice", "pg_pice", 1, { translations: { en: confirmed({ name: "Drinks" }) } }),
        section("se_hrana", "pg_hrana", 1, { translations: { en: confirmed({ name: "Meals" }) } }),
      ],
      articles: [article("ar_a", "Kafa", 100, { translations: { en: confirmed({ name: "Coffee" }) } })],
      placements: [
        placement("pg_main", "se_main", "ar_a", 1),
        placement("pg_pice", "se_pice", "ar_a", 1),
        placement("pg_hrana", "se_hrana", "ar_a", 1),
      ],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["pg_pice"] },
    ]);
  });

  test("variants, add-on groups and options, and combo component names count only where guests see them", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [
        section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } }),
      ],
      articles: [
        article("ar_vranac", "Vranac", 250, {
          variantsEnabled: true,
          addonsEnabled: true,
          translations: { en: confirmed({ name: "Vranac" }) },
        }),
        article("ar_ugasen", "Ugašen", 100, {
          variantsEnabled: false,
          addonsEnabled: false,
          translations: { en: confirmed({ name: "Off" }) },
        }),
        article("ar_set", "Set", 600, { kind: "combo", translations: { en: confirmed({ name: "Set" }) } }),
        article("ar_sir", "Sirna plata", 300),
        article("ar_kafa", "Kafa", 180, { translations: { en: confirmed({ name: "Coffee" }) } }),
      ],
      placements: [
        placement("pg_main", "se_main", "ar_vranac", 1),
        placement("pg_main", "se_main", "ar_ugasen", 2),
        placement("pg_main", "se_main", "ar_set", 3),
      ],
      variants: [
        variant("va_casa", "ar_vranac", 250, 1, { name: "Čaša" }),
        variant("va_flasa", "ar_vranac", 1800, 2, { name: "Flaša", translations: { en: confirmed({ name: "Bottle" }) } }),
        variant("va_skrivena", "ar_ugasen", 90, 1, { name: "Skrivena" }),
      ],
      addonGroups: [
        group("ag_led", { name: "Led" }),
        group("ag_prazna", { name: "Prazna grupa" }),
        group("ag_skrivena", { name: "Skrivena grupa" }),
      ],
      addonOptions: [
        option("ao_led", "ag_led", 1, { name: "Sa ledom" }),
        option("ao_skrivena", "ag_skrivena", 1, { name: "Skrivena opcija" }),
      ],
      articleAddonGroups: [
        link("ar_vranac", "ag_led", 1),
        link("ar_vranac", "ag_prazna", 2),
        link("ar_ugasen", "ag_skrivena", 1),
      ],
      comboComponents: [component("ar_set", "ar_sir", 1), component("ar_set", "ar_kafa", 2)],
    });
    expect(translationOf(snapshot)).toEqual([
      {
        code: "translation_missing",
        lang: "en",
        count: 4,
        entityKeys: ["ag_led", "ao_led", "ar_sir", "va_casa"],
      },
    ]);
  });

  test("a variant with no price at all is not published, so its name needs no translation", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } })],
      articles: [
        article("ar_vino", "Vino", null, {
          variantsEnabled: true,
          translations: { en: confirmed({ name: "Wine" }) },
        }),
      ],
      placements: [placement("pg_main", "se_main", "ar_vino", 1)],
      variants: [
        variant("va_casa", "ar_vino", 250, 1, { name: "Čaša" }),
        variant("va_bez_cene", "ar_vino", null, 2, { name: "Bez cene" }),
      ],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["va_casa"] },
    ]);
  });

  test("Room service categories and articles count only when Room service is published", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      sections: [section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } })],
      articles: [
        ...draft().articles.map((row) => ({ ...row, translations: { en: confirmed({ name: row.name }) } })),
        article("ar_omlet", "Omlet", 400),
      ],
      roomService: {
        config: null,
        categories: [
          roomServiceCategory("rc_dorucak", "Doručak", 1),
          roomServiceCategory("rc_prazna", "Prazna kategorija", 2),
          roomServiceCategory("rc_bez_artikla", "Samo nepostojeći", 3),
        ],
        items: [
          roomServiceItem("ar_omlet", "rc_dorucak", 1),
          roomServiceItem("ar_nepostojeci", "rc_bez_artikla", 1),
        ],
      },
    });

    const published = translationOf(snapshot, context({ roomServiceSwitch: true }));
    expect(published).toEqual([
      { code: "translation_missing", lang: "en", count: 2, entityKeys: ["ar_omlet", "rc_dorucak"] },
    ]);
    expect(translationOf(snapshot, context({ roomServiceSwitch: false }))).toEqual([]);
    expect(translationOf(snapshot, context({ roomServiceSwitch: true, capabilities: { ...PREMIUM, roomService: false } }))).toEqual([]);
  });

  test("an entity shown in two places is counted once", () => {
    const snapshot = draft({
      settings: withLanguages(["en"]),
      pages: [page("pg_main", 1, { isDefault: true }), page("pg_pice", 2)],
      sections: [
        section("se_main", "pg_main", 1, { translations: { en: confirmed({ name: "Main" }) } }),
        section("se_pice", "pg_pice", 1, { translations: { en: confirmed({ name: "Drinks" }) } }),
      ],
      articles: [article("ar_kafa", "Kafa", 180)],
      placements: [placement("pg_main", "se_main", "ar_kafa", 1), placement("pg_pice", "se_pice", "ar_kafa", 1)],
    });
    expect(translationOf(snapshot)).toEqual([
      { code: "translation_missing", lang: "en", count: 1, entityKeys: ["ar_kafa"] },
    ]);
  });

  test("translationWarnings can be called on its own with the published languages", () => {
    const snapshot = draft({ settings: withLanguages(["en"]) });
    const languages = publishedLanguages(snapshot.settings, 5);
    const issues = translationWarnings(snapshot, languages, { roomServicePublished: false });
    expect(issues.map((issue) => issue.lang)).toEqual(["en"]);
    expect(issues[0].count).toBe(4);
    expect(issues[0].entityKeys).toEqual(["ar_cevapi", "ar_kafa", "ar_pljeskavica", "se_main"]);
  });
});

// -----------------------------------------------------------------------------
// The fingerprint
// -----------------------------------------------------------------------------

describe("issuesFingerprint", () => {
  const unplaced = (articleKey: string): MenuPublishIssue => ({ code: "article_unplaced", articleKey });

  test("is independent of the order of the warnings", () => {
    const a = unplaced("ar_a");
    const b: MenuPublishIssue = { code: "translation_missing", lang: "en", count: 3, entityKeys: ["x", "y", "z"] };
    const c: MenuPublishIssue = { code: "addon_group_empty", articleKey: "ar_a", entityKey: "ag_x" };
    expect(issuesFingerprint([a, b, c])).toBe(issuesFingerprint([c, a, b]));
    expect(issuesFingerprint([a, b, c])).toBe(issuesFingerprint([b, c, a]));
  });

  test("differs for different warnings and for none", () => {
    expect(issuesFingerprint([unplaced("ar_a")])).not.toBe(issuesFingerprint([unplaced("ar_b")]));
    expect(issuesFingerprint([unplaced("ar_a")])).not.toBe(issuesFingerprint([]));
    expect(issuesFingerprint([unplaced("ar_a")])).not.toBe(issuesFingerprint([unplaced("ar_a"), unplaced("ar_b")]));
  });

  test("tells apart the entity, the language and the count of a warning", () => {
    const empty = (entityKey: string): MenuPublishIssue => ({ code: "addon_group_empty", articleKey: "ar_a", entityKey });
    const missing = (lang: string, count: number): MenuPublishIssue => ({ code: "translation_missing", lang, count });
    expect(issuesFingerprint([empty("ag_1")])).not.toBe(issuesFingerprint([empty("ag_2")]));
    expect(issuesFingerprint([missing("en", 3)])).not.toBe(issuesFingerprint([missing("de", 3)]));
    expect(issuesFingerprint([missing("en", 3)])).not.toBe(issuesFingerprint([missing("en", 4)]));
  });

  test("is a stable string for the same warnings", () => {
    expect(issuesFingerprint([unplaced("ar_a")])).toBe(issuesFingerprint([unplaced("ar_a")]));
    expect(typeof issuesFingerprint([])).toBe("string");
  });
});

describe("checkPublication: fingerprint", () => {
  test("is the fingerprint of the warnings", () => {
    const snapshot = edit(draft(), (d) => {
      d.settings = withLanguages(["en"]);
      d.articles.push(article("ar_nigde", "Nigde", 100));
    });
    const result = checkPublication(snapshot, context());
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.fingerprint).toBe(issuesFingerprint(result.warnings));
  });

  test("changes when a warning appears and returns when it disappears", () => {
    const clean = draft();
    const withWarning = edit(clean, (d) => {
      d.articles.push(article("ar_nigde", "Nigde", 100));
    });
    const before = checkPublication(clean, context()).fingerprint;
    const during = checkPublication(withWarning, context()).fingerprint;
    const after = checkPublication(
      edit(withWarning, (d) => {
        d.articles = d.articles.filter((row) => row.key !== "ar_nigde");
      }),
      context(),
    ).fingerprint;
    expect(during).not.toBe(before);
    expect(after).toBe(before);
  });

  test("changes when the number of missing translations changes", () => {
    const snapshot = draft({ settings: withLanguages(["en"]) });
    const more = edit(snapshot, (d) => {
      d.articles.push(article("ar_sok", "Sok", 150));
      d.placements.push(placement("pg_main", "se_main", "ar_sok", 4));
    });
    expect(checkPublication(snapshot, context()).fingerprint).not.toBe(checkPublication(more, context()).fingerprint);
  });

  test("changes when a language is dropped by the plan", () => {
    const snapshot = draft({ settings: withLanguages(["en", "de"]) });
    const premium = checkPublication(snapshot, context({ capabilities: PREMIUM }));
    const standard = checkPublication(snapshot, context({ capabilities: { ...PREMIUM, maxLanguages: 2 } }));
    expect(premium.fingerprint).not.toBe(standard.fingerprint);
  });

  test("is the same for the same draft with its lists in another order", () => {
    const snapshot = edit(draft({ settings: withLanguages(["en"]) }), (d) => {
      d.articles.push(article("ar_nigde", "Nigde", 100), article("ar_nigde2", "Nigde 2", 100));
    });
    const reversed = edit(snapshot, (d) => {
      d.articles.reverse();
      d.placements.reverse();
    });
    const first = checkPublication(snapshot, context());
    const second = checkPublication(reversed, context());
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.warnings).toEqual(first.warnings);
  });

  test("the snapshot is not mutated", () => {
    const snapshot = edit(roomServiceDraft(), (d) => {
      d.settings = withLanguages(["en", "de"]);
      d.articles.reverse();
    });
    const before = JSON.stringify(snapshot);
    checkPublication(snapshot, context({ roomServiceSwitch: true, capabilities: STANDARD }));
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
