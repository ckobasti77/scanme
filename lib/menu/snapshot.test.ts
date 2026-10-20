// ScanMe Menu V1 (K05) — the published version: what a draft snapshot compiles
// to, what guests may read in it, how it is cut into parts and read back.
// Fictional data only.

import { describe, expect, test } from "vitest";
import { MENU_VERSION_PART_MAX_BYTES } from "./budget";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "./presentation";
import type { MenuPromo } from "./promo";
import {
  MENU_INTERNAL_LANG,
  MENU_PART_INTERNAL,
  MENU_PART_ROOM_SERVICE,
  MENU_PART_SPLITTER,
  MENU_SNAPSHOT_FORMAT,
  canonicalJson,
  chunkPage,
  compileArticle,
  compilePage,
  compileRoomService,
  compileSnapshot,
  confirmedTranslation,
  hashString,
  indexSnapshot,
  isPagePublic,
  parseInternal,
  parsePublicPage,
  parseRoomService,
  parseSplitter,
  publishedLanguages,
  shownPlacements,
  snapshotHash,
  sortSnapshot,
  splitUtf8,
  type CompileContext,
  type CompiledVersion,
  type MenuDraftSnapshot,
  type PublicArticle,
  type PublicPageDoc,
  type SnapshotAddonGroup,
  type SnapshotAddonOption,
  type SnapshotArticle,
  type SnapshotArticleAddonGroup,
  type SnapshotComboComponent,
  type SnapshotPage,
  type SnapshotPlacement,
  type SnapshotRoomServiceCategory,
  type SnapshotRoomServiceItem,
  type SnapshotSection,
  type SnapshotTranslationEntry,
  type SnapshotTranslations,
  type SnapshotVariant,
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
  priceDeltaRsd: number,
  order: number,
  overrides: Partial<SnapshotAddonOption> = {},
): SnapshotAddonOption {
  return { key, groupKey, name: key, priceDeltaRsd, order, translations: null, ...overrides };
}

function link(articleKey: string, groupKey: string, order: number): SnapshotArticleAddonGroup {
  return { articleKey, groupKey, order };
}

function component(comboKey: string, componentKey: string, quantity: number, order: number): SnapshotComboComponent {
  return { comboKey, componentKey, quantity, order };
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

/** One default page, one section, two shown articles; tests override whole lists. */
function draft(parts: Partial<MenuDraftSnapshot> = {}): MenuDraftSnapshot {
  return {
    formatVersion: 1,
    settings: { languages: null, allergensEnabled: null },
    presentation: null,
    pages: [page("pg_main", 1, { isDefault: true, name: "Kompletan meni", slug: "glavni" })],
    sections: [section("se_main", "pg_main", 1)],
    articles: [article("ar_cevapi", "Ćevapi", 520), article("ar_kafa", "Kafa", 180)],
    placements: [placement("pg_main", "se_main", "ar_cevapi", 1), placement("pg_main", "se_main", "ar_kafa", 2)],
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

/** Every list reversed, so the order of the input proves nothing. */
function scramble(source: MenuDraftSnapshot): MenuDraftSnapshot {
  return edit(source, (d) => {
    d.pages.reverse();
    d.sections.reverse();
    d.articles.reverse();
    d.placements.reverse();
    d.variants.reverse();
    d.addonGroups.reverse();
    d.addonOptions.reverse();
    d.articleAddonGroups.reverse();
    d.comboComponents.reverse();
    d.roomService.categories.reverse();
    d.roomService.items.reverse();
  });
}

function find<T extends { key: string }>(rows: readonly T[], key: string): T {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) throw new Error(`test fixture: no row ${key}`);
  return row;
}

function ctx(overrides: Partial<CompileContext> = {}): CompileContext {
  return { languages: ["sr"], roomService: false, scheduledPromos: false, ...overrides };
}

/** One article compiled the way a page part carries it. */
function compiledArticle(
  snapshot: MenuDraftSnapshot,
  articleKey: string,
  options: { lang?: string; sourceLang?: string; allergensEnabled?: boolean; context?: CompileContext } = {},
): PublicArticle {
  const index = indexSnapshot(snapshot);
  const row = index.articles.get(articleKey);
  if (!row) throw new Error(`test fixture: no article ${articleKey}`);
  return compileArticle(
    index,
    row,
    options.lang ?? "sr",
    options.sourceLang ?? "sr",
    options.allergensEnabled ?? false,
    options.context ?? ctx(),
  );
}

function compiledPage(snapshot: MenuDraftSnapshot, pageKey: string, context: CompileContext = ctx()): PublicPageDoc {
  const index = indexSnapshot(snapshot);
  return compilePage(index, find(snapshot.pages, pageKey), "sr", "sr", false, context);
}

const encoder = new TextEncoder();
const byteLength = (value: string) => encoder.encode(value).length;

/** The data of one logical part, in part order. */
function partData(version: CompiledVersion, scope: "public" | "internal", lang: string, pageKey: string): string[] {
  return version.parts
    .filter((row) => row.scope === scope && row.lang === lang && row.pageKey === pageKey)
    .sort((a, b) => a.part - b.part)
    .map((row) => row.data);
}

const pageDocOf = (version: CompiledVersion, lang: string, pageKey: string) =>
  parsePublicPage(partData(version, "public", lang, pageKey));
const splitterOf = (version: CompiledVersion, lang: string) =>
  parseSplitter(partData(version, "public", lang, MENU_PART_SPLITTER)[0]);
const roomServiceOf = (version: CompiledVersion, lang: string) =>
  parseRoomService(partData(version, "public", lang, MENU_PART_ROOM_SERVICE));
const publicPartIds = (version: CompiledVersion) =>
  version.parts
    .filter((row) => row.scope === "public")
    .map((row) => `${row.lang}/${row.pageKey}/${row.part}`)
    .sort();
const publicText = (version: CompiledVersion) =>
  version.parts
    .filter((row) => row.scope === "public")
    .map((row) => row.data)
    .join("\n");
const internalText = (version: CompiledVersion) =>
  version.parts
    .filter((row) => row.scope === "internal")
    .map((row) => row.data)
    .join("");

/**
 * A draft with every kind of thing guests must NOT see: a hidden page, an
 * archived page, a hidden section, an empty section, a section whose only
 * placement is hidden, a hidden placement, an unplaced article, and internal
 * names. Next to them: the visible menu, a combo, variants, add-ons, allergens
 * and two Room service articles (one of them on no page).
 */
function richDraft(): MenuDraftSnapshot {
  return draft({
    settings: { languages: { source: "sr", translations: ["en"] }, allergensEnabled: true },
    pages: [
      page("pg_main", 1, { isDefault: true, name: "Kompletan meni", slug: "glavni" }),
      page("pg_pice", 2, { name: "Pića interno", publicTitle: "Pića", slug: "pica" }),
      page("pg_skrivena", 3, { name: "Interna stranica", publicTitle: "Interni naslov", visibility: "hidden" }),
      page("pg_arhiva", 4, { name: "Stara stranica", publicTitle: "Arhivski naslov", archivedAt: 1_760_000_000_000 }),
    ],
    sections: [
      section("se_hrana", "pg_main", 1, { name: "Roštilj", description: "Sa žara" }),
      section("se_skrivena", "pg_main", 2, { name: "Skrivena sekcija", visibility: "hidden" }),
      section("se_prazna", "pg_main", 3, { name: "Prazna sekcija" }),
      section("se_sve_skriveno", "pg_main", 4, { name: "Sekcija skrivenih" }),
      section("se_pice", "pg_pice", 1, { name: "Topli napici" }),
      section("se_na_skrivenoj", "pg_skrivena", 1, { name: "Sekcija skrivene stranice" }),
      section("se_arhiva", "pg_arhiva", 1, { name: "Sekcija arhive" }),
    ],
    articles: [
      article("ar_cevapi", "Ćevapi", 520, {
        description: "Sa lukom",
        variantsEnabled: true,
        addonsEnabled: true,
        allergens: { contains: ["gluten"], mayContain: [], otherText: null },
        tags: ["ljuto"],
      }),
      article("ar_kafa", "Kafa", 180),
      article("ar_set", "Doručak set", 600, { kind: "combo" }),
      article("ar_sok", "Sok", 150),
      article("ar_skriven_plasman", "Skriveni plasman", 100),
      article("ar_u_skrivenoj", "Artikal skrivene sekcije", 100),
      article("ar_na_skrivenoj", "Artikal skrivene stranice", 100),
      article("ar_u_arhivi", "Artikal arhive", 100),
      article("ar_nigde", "Artikal nigde", 100),
    ],
    placements: [
      placement("pg_main", "se_hrana", "ar_cevapi", 1),
      placement("pg_main", "se_hrana", "ar_set", 2),
      placement("pg_main", "se_hrana", "ar_skriven_plasman", 3, { visibility: "hidden" }),
      placement("pg_main", "se_skrivena", "ar_u_skrivenoj", 1),
      placement("pg_main", "se_sve_skriveno", "ar_skriven_plasman", 1, { visibility: "hidden" }),
      placement("pg_pice", "se_pice", "ar_kafa", 1),
      placement("pg_skrivena", "se_na_skrivenoj", "ar_na_skrivenoj", 1),
      placement("pg_arhiva", "se_arhiva", "ar_u_arhivi", 1),
    ],
    variants: [variant("va_mali", "ar_cevapi", 420, 1, { name: "Mali" }), variant("va_veliki", "ar_cevapi", 650, 2, { name: "Veliki" })],
    addonGroups: [group("ag_prilozi", { name: "Prilozi" })],
    addonOptions: [option("ao_kajmak", "ag_prilozi", 50, 1, { name: "Kajmak" })],
    articleAddonGroups: [link("ar_cevapi", "ag_prilozi", 1)],
    comboComponents: [component("ar_set", "ar_cevapi", 1, 1), component("ar_set", "ar_kafa", 2, 2)],
    roomService: {
      config: { markupBps: 1500, markupScope: "all", deliveryFeeRsd: 200 },
      categories: [roomServiceCategory("rc_hrana", "Hrana u sobi", 1)],
      items: [roomServiceItem("ar_sok", "rc_hrana", 1), roomServiceItem("ar_kafa", "rc_hrana", 2)],
    },
  });
}

const HIDDEN_STRINGS = [
  "Kompletan meni",
  "Pića interno",
  "Interna stranica",
  "Interni naslov",
  "pg_skrivena",
  "Stara stranica",
  "Arhivski naslov",
  "pg_arhiva",
  "Skrivena sekcija",
  "se_skrivena",
  "Prazna sekcija",
  "se_prazna",
  "Sekcija skrivenih",
  "se_sve_skriveno",
  "Sekcija skrivene stranice",
  "se_na_skrivenoj",
  "Sekcija arhive",
  "se_arhiva",
  "Skriveni plasman",
  "ar_skriven_plasman",
  "Artikal skrivene sekcije",
  "ar_u_skrivenoj",
  "Artikal skrivene stranice",
  "ar_na_skrivenoj",
  "Artikal arhive",
  "ar_u_arhivi",
  "Artikal nigde",
  "ar_nigde",
];

// -----------------------------------------------------------------------------
// compileSnapshot: what guests get
// -----------------------------------------------------------------------------

describe("compileSnapshot: public parts hold only what guests see", () => {
  test("no hidden or archived page, section or placement, no unplaced article, no internal name", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"], roomService: true }));
    const text = publicText(version);
    for (const forbidden of HIDDEN_STRINGS) {
      expect(text.includes(forbidden), forbidden).toBe(false);
    }
    for (const shown of ["Ćevapi", "Kafa", "Roštilj", "Topli napici", "Pića", "pg_main", "pg_pice"]) {
      expect(text.includes(shown), shown).toBe(true);
    }
  });

  test("the internal part is the control: it does hold every hidden thing", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"] }));
    const text = internalText(version);
    for (const forbidden of HIDDEN_STRINGS) {
      expect(text.includes(forbidden), forbidden).toBe(true);
    }
  });

  test("a section shows only its visible, existing articles; sections without one are left out", () => {
    const version = compileSnapshot(richDraft(), ctx());
    const main = pageDocOf(version, "sr", "pg_main");
    expect(main?.sections.map((row) => row.key)).toEqual(["se_hrana"]);
    expect(main?.sections[0].articles.map((row) => row.key)).toEqual(["ar_cevapi", "ar_set"]);
    const drinks = pageDocOf(version, "sr", "pg_pice");
    expect(drinks?.sections.map((row) => row.key)).toEqual(["se_pice"]);
    expect(drinks?.sections[0].articles.map((row) => row.key)).toEqual(["ar_kafa"]);
  });

  test("a section whose placements all point to missing articles or other pages is left out", () => {
    const snapshot = edit(draft(), (d) => {
      d.sections.push(section("se_siroce", "pg_main", 2), section("se_tudja", "pg_main", 3));
      d.placements.push(
        placement("pg_main", "se_siroce", "ar_nepostojeci", 1),
        placement("pg_druga", "se_tudja", "ar_kafa", 1),
      );
    });
    const doc = pageDocOf(compileSnapshot(snapshot, ctx()), "sr", "pg_main");
    expect(doc?.sections.map((row) => row.key)).toEqual(["se_main"]);
  });

  test("the default page has no title unless a public title is set", () => {
    const withoutTitle = compileSnapshot(draft(), ctx());
    expect(splitterOf(withoutTitle, "sr").pages[0].title).toBeNull();
    expect(pageDocOf(withoutTitle, "sr", "pg_main")?.page.title).toBeNull();

    const withTitle = compileSnapshot(
      edit(draft(), (d) => {
        d.pages[0].publicTitle = "Naša ponuda";
      }),
      ctx(),
    );
    expect(splitterOf(withTitle, "sr").pages[0].title).toBe("Naša ponuda");
    expect(pageDocOf(withTitle, "sr", "pg_main")?.page.title).toBe("Naša ponuda");
  });

  test("the page meta carries exactly the public fields, never the internal name", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr"] }));
    expect(splitterOf(version, "sr").pages).toEqual([
      { key: "pg_main", slug: "glavni", title: null, isDefault: true, navigation: "standalone", iconKey: null },
      { key: "pg_pice", slug: "pica", title: "Pića", isDefault: false, navigation: "standalone", iconKey: null },
    ]);
    expect(pageDocOf(version, "sr", "pg_pice")?.page).toEqual(splitterOf(version, "sr").pages[1]);
  });

  test("pages are in their order, whatever the order of the input", () => {
    const snapshot = edit(richDraft(), (d) => {
      find(d.pages, "pg_main").order = 5;
    });
    const ids = (value: MenuDraftSnapshot) =>
      splitterOf(compileSnapshot(value, ctx()), "sr").pages.map((row) => row.key);
    expect(ids(snapshot)).toEqual(["pg_pice", "pg_main"]);
    expect(ids(scramble(snapshot))).toEqual(["pg_pice", "pg_main"]);
  });
});

describe("compileSnapshot: the parts", () => {
  test("per language: the splitter and one part per public page; the internal part is `_all` in language `*`", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"] }));
    expect(publicPartIds(version)).toEqual([
      "en/_splitter/0",
      "en/pg_main/0",
      "en/pg_pice/0",
      "sr/_splitter/0",
      "sr/pg_main/0",
      "sr/pg_pice/0",
    ]);
    const internal = version.parts.filter((row) => row.scope === "internal");
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((row) => row.lang === MENU_INTERNAL_LANG && row.pageKey === MENU_PART_INTERNAL)).toBe(true);
    expect(MENU_INTERNAL_LANG).toBe("*");
    expect(MENU_PART_INTERNAL).toBe("_all");
    expect(MENU_PART_SPLITTER).toBe("_splitter");
    expect(MENU_PART_ROOM_SERVICE).toBe("_rs");
  });

  test("the internal part comes first and part numbers count from 0 without gaps", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"], roomService: true }));
    expect(version.parts[0].scope).toBe("internal");
    const groups = new Map<string, number[]>();
    for (const row of version.parts) {
      const id = `${row.scope}/${row.lang}/${row.pageKey}`;
      groups.set(id, [...(groups.get(id) ?? []), row.part]);
    }
    for (const [id, numbers] of groups) {
      expect(numbers, id).toEqual(numbers.map((_, i) => i));
    }
  });

  test("`_rs` exists per language only when Room service is published and has items", () => {
    const languages = ["sr", "en"];
    const withRs = compileSnapshot(richDraft(), ctx({ languages, roomService: true }));
    expect(publicPartIds(withRs).filter((id) => id.includes("/_rs/"))).toEqual(["en/_rs/0", "sr/_rs/0"]);
    expect(splitterOf(withRs, "sr").roomService).toBe(true);

    const switchedOff = compileSnapshot(richDraft(), ctx({ languages, roomService: false }));
    expect(publicPartIds(switchedOff).some((id) => id.includes("/_rs/"))).toBe(false);
    expect(splitterOf(switchedOff, "sr").roomService).toBe(false);

    const noItems = compileSnapshot(
      edit(richDraft(), (d) => {
        d.roomService.items = [];
      }),
      ctx({ languages, roomService: true }),
    );
    expect(publicPartIds(noItems).some((id) => id.includes("/_rs/"))).toBe(false);
    expect(splitterOf(noItems, "sr").roomService).toBe(false);

    const orphanItems = compileSnapshot(
      edit(richDraft(), (d) => {
        d.roomService.items = [roomServiceItem("ar_nepostojeci", "rc_hrana", 1)];
      }),
      ctx({ languages, roomService: true }),
    );
    expect(publicPartIds(orphanItems).some((id) => id.includes("/_rs/"))).toBe(false);
    expect(splitterOf(orphanItems, "sr").roomService).toBe(false);
  });

  test("without a published language there is only the internal part", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: [] }));
    expect(version.parts.every((row) => row.scope === "internal")).toBe(true);
    expect(version.languages).toEqual([]);
    expect(version.publicPageCount).toBe(2);
  });

  test("the splitter says who, in what language and with what appearance", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"] }));
    const sr = splitterOf(version, "sr");
    const en = splitterOf(version, "en");
    expect(sr).toMatchObject({ lang: "sr", sourceLang: "sr", languages: ["sr", "en"], roomService: false });
    expect(en).toMatchObject({ lang: "en", sourceLang: "sr", languages: ["sr", "en"] });
    expect(sr.presentation).toEqual(MENU_DEFAULT_PRESENTATION);
  });

  test("a saved appearance is published as it is", () => {
    const presentation: MenuPresentationValues = {
      ...MENU_DEFAULT_PRESENTATION,
      layout: "categories",
      brandColors: ["#aa3311"],
      search: true,
      filters: ["vegan"],
    };
    const version = compileSnapshot(edit(draft(), (d) => void (d.presentation = presentation)), ctx());
    expect(splitterOf(version, "sr").presentation).toEqual(presentation);
  });

  test("the source language comes from the context, not from the settings", () => {
    const snapshot = edit(draft(), (d) => {
      d.settings = { languages: { source: "sr", translations: ["en"] }, allergensEnabled: null };
    });
    const version = compileSnapshot(snapshot, ctx({ languages: ["en", "sr"] }));
    expect(splitterOf(version, "sr").sourceLang).toBe("en");
  });

  test("counts: public pages, and distinct articles guests can see (pages and Room service)", () => {
    const withoutRs = compileSnapshot(richDraft(), ctx());
    expect(withoutRs.publicPageCount).toBe(2);
    // Ćevapi, Doručak set, Kafa.
    expect(withoutRs.publicArticleCount).toBe(3);
    // Room service adds Sok; Kafa is on a page already and counts once.
    const withRs = compileSnapshot(richDraft(), ctx({ roomService: true }));
    expect(withRs.publicArticleCount).toBe(4);
  });

  test("bytes: each part knows its UTF-8 size and the version is their sum", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"], roomService: true }));
    for (const row of version.parts) expect(row.bytes).toBe(byteLength(row.data));
    expect(version.bytes).toBe(version.parts.reduce((sum, row) => sum + byteLength(row.data), 0));
  });

  test("the input is not mutated, even when its lists are out of order", () => {
    const snapshot = scramble(richDraft());
    const before = JSON.stringify(snapshot);
    compileSnapshot(snapshot, ctx({ languages: ["sr", "en"], roomService: true }));
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  test("the order of the input lists does not change the parts or the hash", () => {
    const original = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"], roomService: true }));
    const shuffled = compileSnapshot(scramble(richDraft()), ctx({ languages: ["sr", "en"], roomService: true }));
    expect(shuffled.parts).toEqual(original.parts);
    expect(shuffled.contentHash).toBe(original.contentHash);
  });
});

describe("compileSnapshot: the internal part", () => {
  test("round-trips through parseInternal to the sorted snapshot", () => {
    const snapshot = scramble(richDraft());
    const version = compileSnapshot(snapshot, ctx({ languages: ["sr", "en"] }));
    const restored = parseInternal(partData(version, "internal", MENU_INTERNAL_LANG, MENU_PART_INTERNAL));
    expect(restored).toEqual(sortSnapshot(snapshot));
    expect(restored.formatVersion).toBe(MENU_SNAPSHOT_FORMAT);
  });

  test("a draft over the part maximum is split at character boundaries and still round-trips", () => {
    const filler = "Domaći ćevapi od mešanog mesa, sa lukom i kajmakom. ".repeat(10);
    const snapshot = draft({
      articles: Array.from({ length: 1400 }, (_, i) =>
        article(`ar_${String(i).padStart(4, "0")}`, `Artikal ${i}`, 100 + i, { description: filler }),
      ),
      placements: [],
    });
    const version = compileSnapshot(snapshot, ctx());
    const internal = version.parts.filter((row) => row.scope === "internal");
    expect(internal.length).toBeGreaterThan(1);
    expect(internal.map((row) => row.part)).toEqual(internal.map((_, i) => i));
    for (const row of internal) expect(row.bytes).toBeLessThanOrEqual(MENU_VERSION_PART_MAX_BYTES);
    const restored = parseInternal(internal.map((row) => row.data));
    expect(restored).toEqual(sortSnapshot(snapshot));
  });

  test("a snapshot of another format is refused", () => {
    const wrong = JSON.stringify({ ...draft(), formatVersion: 2 });
    expect(() => parseInternal([wrong])).toThrow(/unsupported format/);
  });

  test("the content hash is the snapshot hash", () => {
    const snapshot = richDraft();
    expect(compileSnapshot(snapshot, ctx()).contentHash).toBe(snapshotHash(snapshot));
  });
});

// -----------------------------------------------------------------------------
// Translations
// -----------------------------------------------------------------------------

describe("translations", () => {
  function translatedDraft(): MenuDraftSnapshot {
    return draft({
      settings: { languages: { source: "sr", translations: ["en", "de"] }, allergensEnabled: null },
      pages: [
        page("pg_main", 1, { isDefault: true, slug: "glavni" }),
        page("pg_pice", 2, {
          publicTitle: "Pića",
          slug: "pica",
          translations: {
            en: confirmed({ publicTitle: "Drinks" }),
            de: suggested({ publicTitle: "Getränke" }),
            sr: confirmed({ publicTitle: "Ignored" }),
          },
        }),
      ],
      sections: [
        section("se_main", "pg_main", 1, {
          name: "Roštilj",
          description: "Sa žara",
          translations: {
            en: confirmed({ name: "Grill", description: "From the grill" }),
            de: suggested({ name: "Grill DE" }),
          },
        }),
        section("se_pice", "pg_pice", 1, {
          name: "Topli napici",
          translations: { en: confirmed({ name: "Hot drinks" }) },
        }),
      ],
      articles: [
        article("ar_cevapi", "Ćevapi", 520, {
          description: "Sa lukom",
          variantsEnabled: true,
          addonsEnabled: true,
          translations: {
            en: confirmed({ name: "Cevapi", description: "With onion" }),
            de: suggested({ name: "Cevapi DE", description: "Mit Zwiebeln" }),
            sr: confirmed({ name: "Ignored sr" }),
          },
        }),
        article("ar_kafa", "Kafa", 180, {
          translations: {
            en: confirmed({ name: "", description: "Hot" }),
            de: confirmed({ name: "   " }),
          },
        }),
        article("ar_set", "Doručak set", 600, { kind: "combo" }),
      ],
      placements: [
        placement("pg_main", "se_main", "ar_cevapi", 1),
        placement("pg_main", "se_main", "ar_set", 2),
        placement("pg_pice", "se_pice", "ar_kafa", 1),
      ],
      variants: [
        variant("va_mali", "ar_cevapi", 420, 1, { name: "Mali", translations: { en: confirmed({ name: "Small" }) } }),
      ],
      addonGroups: [group("ag_prilozi", { name: "Prilozi", translations: { en: confirmed({ name: "Sides" }) } })],
      addonOptions: [
        option("ao_kajmak", "ag_prilozi", 50, 1, { name: "Kajmak", translations: { en: confirmed({ name: "Cream" }) } }),
      ],
      articleAddonGroups: [link("ar_cevapi", "ag_prilozi", 1)],
      comboComponents: [component("ar_set", "ar_cevapi", 1, 1), component("ar_set", "ar_kafa", 1, 2)],
    });
  }

  const version = () => compileSnapshot(translatedDraft(), ctx({ languages: ["sr", "en", "de"] }));

  test("confirmed translations are used for every kind of text", () => {
    const v = version();
    const main = pageDocOf(v, "en", "pg_main");
    expect(main?.sections[0]).toMatchObject({ name: "Grill", description: "From the grill" });
    const cevapi = main?.sections[0].articles[0];
    expect(cevapi).toMatchObject({ name: "Cevapi", description: "With onion" });
    expect(cevapi?.variants[0].name).toBe("Small");
    expect(cevapi?.addonGroups[0].name).toBe("Sides");
    expect(cevapi?.addonGroups[0].options[0].name).toBe("Cream");
    const drinks = pageDocOf(v, "en", "pg_pice");
    expect(drinks?.page.title).toBe("Drinks");
    expect(drinks?.sections[0].name).toBe("Hot drinks");
    expect(splitterOf(v, "en").pages[1].title).toBe("Drinks");
  });

  test("an AI suggestion is never published: the source text shows", () => {
    const v = version();
    const main = pageDocOf(v, "de", "pg_main");
    expect(main?.sections[0]).toMatchObject({ name: "Roštilj", description: "Sa žara" });
    expect(main?.sections[0].articles[0]).toMatchObject({ name: "Ćevapi", description: "Sa lukom" });
    expect(pageDocOf(v, "de", "pg_pice")?.page.title).toBe("Pića");
    expect(publicText(v).includes("Getränke")).toBe(false);
    expect(publicText(v).includes("Mit Zwiebeln")).toBe(false);
    expect(publicText(v).includes("Grill DE")).toBe(false);
  });

  test("an empty or blank confirmed text falls back to the source text", () => {
    const v = version();
    expect(pageDocOf(v, "en", "pg_pice")?.sections[0].articles[0].name).toBe("Kafa");
    expect(pageDocOf(v, "de", "pg_pice")?.sections[0].articles[0].name).toBe("Kafa");
  });

  test("a translation does not invent a description the source does not have", () => {
    const kafa = pageDocOf(version(), "en", "pg_pice")?.sections[0].articles[0];
    expect(kafa?.description).toBeNull();
  });

  test("the source language always shows the source text, whatever its entry says", () => {
    const v = version();
    expect(pageDocOf(v, "sr", "pg_main")?.sections[0].articles[0].name).toBe("Ćevapi");
    expect(pageDocOf(v, "sr", "pg_pice")?.page.title).toBe("Pića");
  });

  test("combo components carry their translated names", () => {
    const v = version();
    const combo = pageDocOf(v, "en", "pg_main")?.sections[0].articles[1];
    expect(combo?.combo?.components).toEqual([
      { articleKey: "ar_cevapi", name: "Cevapi", quantity: 1 },
      { articleKey: "ar_kafa", name: "Kafa", quantity: 1 },
    ]);
    const source = pageDocOf(v, "sr", "pg_main")?.sections[0].articles[1];
    expect(source?.combo?.components.map((row) => row.name)).toEqual(["Ćevapi", "Kafa"]);
  });

  test("a different source language is respected", () => {
    const snapshot = edit(translatedDraft(), (d) => {
      d.settings = { languages: { source: "en", translations: ["sr"] }, allergensEnabled: null };
    });
    // English is the source here: its text is the stored one, and "sr" has no translations.
    const v = compileSnapshot(snapshot, ctx({ languages: ["en", "sr"] }));
    expect(pageDocOf(v, "en", "pg_main")?.sections[0].name).toBe("Roštilj");
    expect(pageDocOf(v, "sr", "pg_main")?.sections[0].name).toBe("Roštilj");
  });
});

describe("confirmedTranslation", () => {
  test("a confirmed text of the field", () => {
    const translations: SnapshotTranslations = { en: confirmed({ name: "Coffee", description: "Hot" }) };
    expect(confirmedTranslation(translations, "en", "name")).toBe("Coffee");
    expect(confirmedTranslation(translations, "en", "description")).toBe("Hot");
  });

  test("null for no translations, another language, or a field the entry lacks", () => {
    expect(confirmedTranslation(null, "en", "name")).toBeNull();
    expect(confirmedTranslation({ de: confirmed({ name: "Kaffee" }) }, "en", "name")).toBeNull();
    expect(confirmedTranslation({ en: confirmed({ name: "Coffee" }) }, "en", "publicTitle")).toBeNull();
  });

  test("null for a suggestion", () => {
    expect(confirmedTranslation({ en: suggested({ name: "Coffee" }) }, "en", "name")).toBeNull();
  });

  test("null for an empty or blank text", () => {
    expect(confirmedTranslation({ en: confirmed({ name: "" }) }, "en", "name")).toBeNull();
    expect(confirmedTranslation({ en: confirmed({ name: " \t\n" }) }, "en", "name")).toBeNull();
  });

  test("the text is returned as it is, not trimmed", () => {
    expect(confirmedTranslation({ en: confirmed({ name: " Coffee " }) }, "en", "name")).toBe(" Coffee ");
  });
});

// -----------------------------------------------------------------------------
// Articles
// -----------------------------------------------------------------------------

describe("compileArticle: variants", () => {
  const withVariants = (enabled: boolean) =>
    draft({
      articles: [article("ar_a", "Vranac", 250, { variantsEnabled: enabled })],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
      variants: [
        variant("va_flasa", "ar_a", 1800, 2, { name: "Flaša" }),
        variant("va_casa", "ar_a", 250, 1, { name: "Čaša" }),
        variant("va_bez_cene", "ar_a", null, 3, { name: "Bez cene" }),
      ],
    });

  test("variants show only while variants are on", () => {
    expect(compiledArticle(withVariants(false), "ar_a").variants).toEqual([]);
    expect(compiledArticle(withVariants(true), "ar_a").variants).toHaveLength(3);
  });

  test("variants are in their order, with their own price; a missing price falls back to the base price", () => {
    expect(compiledArticle(withVariants(true), "ar_a").variants).toEqual([
      { key: "va_casa", name: "Čaša", priceRsd: 250 },
      { key: "va_flasa", name: "Flaša", priceRsd: 1800 },
      { key: "va_bez_cene", name: "Bez cene", priceRsd: 250 },
    ]);
  });

  test("a variant with neither its own price nor a base price is left out", () => {
    const snapshot = edit(withVariants(true), (d) => {
      d.articles[0].basePriceRsd = null;
    });
    const compiled = compiledArticle(snapshot, "ar_a");
    expect(compiled.priceRsd).toBeNull();
    expect(compiled.variants.map((row) => row.key)).toEqual(["va_casa", "va_flasa"]);
  });

  test("the shared base price is carried next to the variants", () => {
    expect(compiledArticle(withVariants(true), "ar_a").priceRsd).toBe(250);
  });
});

describe("compileArticle: add-ons", () => {
  /** One article with one group of `optionCount` options. */
  function withGroup(rules: Partial<SnapshotAddonGroup>, optionCount: number, enabled = true): MenuDraftSnapshot {
    return draft({
      articles: [article("ar_a", "Ćevapi", 520, { addonsEnabled: enabled })],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
      addonGroups: [group("ag_a", rules)],
      addonOptions: Array.from({ length: optionCount }, (_, i) => option(`ao_${i}`, "ag_a", 10 * i, i + 1)),
      articleAddonGroups: [link("ar_a", "ag_a", 1)],
    });
  }
  const boundsOf = (snapshot: MenuDraftSnapshot) => {
    const [first] = compiledArticle(snapshot, "ar_a").addonGroups;
    return { min: first.minSelect, max: first.maxSelect };
  };

  test("add-on groups show only while add-ons are on", () => {
    expect(compiledArticle(withGroup({}, 2, false), "ar_a").addonGroups).toEqual([]);
    expect(compiledArticle(withGroup({}, 2, true), "ar_a").addonGroups).toHaveLength(1);
  });

  test("a group carries its rules, bounds and options in order", () => {
    const snapshot = withGroup({ name: "Prilozi", selection: "multiple", required: true, minSelect: 2, maxSelect: 3 }, 4);
    expect(compiledArticle(snapshot, "ar_a").addonGroups).toEqual([
      {
        key: "ag_a",
        name: "Prilozi",
        selection: "multiple",
        required: true,
        minSelect: 2,
        maxSelect: 3,
        options: [
          { key: "ao_0", name: "ao_0", priceDeltaRsd: 0 },
          { key: "ao_1", name: "ao_1", priceDeltaRsd: 10 },
          { key: "ao_2", name: "ao_2", priceDeltaRsd: 20 },
          { key: "ao_3", name: "ao_3", priceDeltaRsd: 30 },
        ],
      },
    ]);
  });

  test("a group without options is left out", () => {
    expect(compiledArticle(withGroup({}, 0), "ar_a").addonGroups).toEqual([]);
  });

  test("a link to a group that does not exist is skipped", () => {
    const snapshot = edit(withGroup({}, 2), (d) => {
      d.articleAddonGroups.push(link("ar_a", "ag_nepostojeca", 2));
    });
    expect(compiledArticle(snapshot, "ar_a").addonGroups.map((row) => row.key)).toEqual(["ag_a"]);
  });

  test("min and max follow the rules: single, optional", () => {
    expect(boundsOf(withGroup({ selection: "single", required: false }, 3))).toEqual({ min: 0, max: 1 });
  });

  test("min and max follow the rules: single, required", () => {
    expect(boundsOf(withGroup({ selection: "single", required: true }, 3))).toEqual({ min: 1, max: 1 });
  });

  test("min and max follow the rules: multiple, optional, no limit", () => {
    expect(boundsOf(withGroup({ selection: "multiple", required: false }, 3))).toEqual({ min: 0, max: 3 });
  });

  test("min and max follow the rules: multiple, required, no limits", () => {
    expect(boundsOf(withGroup({ selection: "multiple", required: true }, 3))).toEqual({ min: 1, max: 3 });
  });

  test("min and max follow the rules: multiple, required with advanced limits", () => {
    expect(boundsOf(withGroup({ selection: "multiple", required: true, minSelect: 2, maxSelect: 3 }, 4))).toEqual({
      min: 2,
      max: 3,
    });
  });

  test("max never exceeds the number of options", () => {
    expect(boundsOf(withGroup({ selection: "multiple", required: false, maxSelect: 9 }, 3))).toEqual({ min: 0, max: 3 });
  });

  test("stored rules that contradict each other fall back to selection and required", () => {
    // `maxSelect` has no meaning for a single choice; `minSelect` only for a required group.
    expect(boundsOf(withGroup({ selection: "single", required: false, maxSelect: 2 }, 3))).toEqual({ min: 0, max: 1 });
    expect(boundsOf(withGroup({ selection: "multiple", required: false, minSelect: 2 }, 3))).toEqual({ min: 0, max: 3 });
  });

  test("group and option names are translated", () => {
    const snapshot = edit(withGroup({ name: "Prilozi", translations: { en: confirmed({ name: "Sides" }) } }, 1), (d) => {
      d.addonOptions[0].name = "Kajmak";
      d.addonOptions[0].translations = { en: confirmed({ name: "Cream" }), de: suggested({ name: "Rahm" }) };
    });
    const english = compiledArticle(snapshot, "ar_a", { lang: "en" }).addonGroups[0];
    expect(english.name).toBe("Sides");
    expect(english.options[0].name).toBe("Cream");
    const german = compiledArticle(snapshot, "ar_a", { lang: "de" }).addonGroups[0];
    expect(german.name).toBe("Prilozi");
    expect(german.options[0].name).toBe("Kajmak");
  });
});

describe("compileArticle: allergens, tags, media and combos", () => {
  const record = { contains: ["gluten", "milk"], mayContain: ["nuts"], otherText: "Sadrži tragove" };
  const withAllergens = (allergens: typeof record | null) =>
    draft({
      articles: [article("ar_a", "Ćevapi", 520, { allergens })],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
    });

  test("allergens are null while the venue's allergen system is not on", () => {
    expect(compiledArticle(withAllergens(record), "ar_a", { allergensEnabled: false }).allergens).toBeNull();
  });

  test("allergens are published when the system is on", () => {
    expect(compiledArticle(withAllergens(record), "ar_a", { allergensEnabled: true }).allergens).toEqual(record);
  });

  test("an article without a record stays unknown (null) even when the system is on", () => {
    expect(compiledArticle(withAllergens(null), "ar_a", { allergensEnabled: true }).allergens).toBeNull();
  });

  test("the setting decides: null and false hide the record, true shows it", () => {
    const hidden = (flag: boolean | null) => {
      const snapshot = edit(withAllergens(record), (d) => void (d.settings.allergensEnabled = flag));
      const version = compileSnapshot(snapshot, ctx());
      return {
        splitter: splitterOf(version, "sr").allergensEnabled,
        allergens: pageDocOf(version, "sr", "pg_main")?.sections[0].articles[0].allergens,
      };
    };
    expect(hidden(null)).toEqual({ splitter: false, allergens: null });
    expect(hidden(false)).toEqual({ splitter: false, allergens: null });
    expect(hidden(true)).toEqual({ splitter: true, allergens: record });
  });

  test("tags default to an empty list and are kept when set", () => {
    const snapshot = draft({
      articles: [
        article("ar_a", "Ćevapi", 520, { tags: null }),
        article("ar_b", "Kafa", 180, { tags: ["novo", "ljuto"] }),
      ],
      placements: [placement("pg_main", "se_main", "ar_a", 1), placement("pg_main", "se_main", "ar_b", 2)],
    });
    expect(compiledArticle(snapshot, "ar_a").tags).toEqual([]);
    expect(compiledArticle(snapshot, "ar_b").tags).toEqual(["novo", "ljuto"]);
  });

  test("the image is published only in image mode", () => {
    const make = (mediaMode: SnapshotArticle["mediaMode"]) =>
      draft({
        articles: [article("ar_a", "Ćevapi", 520, { mediaMode, imageMediaId: "media_1", iconKey: "grill" })],
        placements: [placement("pg_main", "se_main", "ar_a", 1)],
      });
    expect(compiledArticle(make("image"), "ar_a").media).toEqual({ mode: "image", imageMediaId: "media_1", iconKey: "grill" });
    expect(compiledArticle(make("icon"), "ar_a").media).toEqual({ mode: "icon", imageMediaId: null, iconKey: "grill" });
    expect(compiledArticle(make("none"), "ar_a").media).toEqual({ mode: "none", imageMediaId: null, iconKey: "grill" });
  });

  test("a combo lists its components in order with quantity; an item has no combo", () => {
    const snapshot = draft({
      articles: [
        article("ar_set", "Doručak set", 600, { kind: "combo" }),
        article("ar_kafa", "Kafa", 180),
        article("ar_kifla", "Kifla", 60),
      ],
      placements: [placement("pg_main", "se_main", "ar_set", 1)],
      comboComponents: [
        component("ar_set", "ar_kifla", 2, 2),
        component("ar_set", "ar_kafa", 1, 1),
        component("ar_set", "ar_obrisan", 1, 3),
      ],
    });
    expect(compiledArticle(snapshot, "ar_set").combo).toEqual({
      components: [
        { articleKey: "ar_kafa", name: "Kafa", quantity: 1 },
        { articleKey: "ar_kifla", name: "Kifla", quantity: 2 },
      ],
    });
    expect(compiledArticle(snapshot, "ar_kafa").combo).toBeNull();
  });

  test("a combo without components has an empty list", () => {
    const snapshot = draft({
      articles: [article("ar_set", "Prazan set", 600, { kind: "combo" })],
      placements: [placement("pg_main", "se_main", "ar_set", 1)],
    });
    expect(compiledArticle(snapshot, "ar_set").combo).toEqual({ components: [] });
  });

  test("quantity, note switch and kind are carried", () => {
    const snapshot = draft({
      articles: [article("ar_a", "Sok", 150, { quantityValue: 0.33, quantityUnit: "l", noteEnabled: true })],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
    });
    expect(compiledArticle(snapshot, "ar_a")).toMatchObject({
      kind: "item",
      quantityValue: 0.33,
      quantityUnit: "l",
      noteEnabled: true,
      priceRsd: 150,
    });
  });
});

describe("compileArticle: promotions", () => {
  const withPromo = (promo: MenuPromo | null, overrides: Partial<SnapshotArticle> = {}) =>
    draft({
      articles: [article("ar_a", "Ćevapi", 520, { promo, ...overrides })],
      placements: [placement("pg_main", "se_main", "ar_a", 1)],
    });
  const promoOf = (snapshot: MenuDraftSnapshot, context: CompileContext = ctx()) =>
    compiledArticle(snapshot, "ar_a", { context }).promo;

  test("no promotion: null", () => {
    expect(promoOf(withPromo(null))).toBeNull();
  });

  test("a promotion that is switched off is left out", () => {
    expect(promoOf(withPromo({ active: false, mode: "percent", percent: 10 }))).toBeNull();
  });

  test("a promotion that cannot be a discount is left out", () => {
    // Promo price not below the regular price.
    expect(promoOf(withPromo({ active: true, mode: "price", priceRsd: 520 }))).toBeNull();
    // Percent out of range.
    expect(promoOf(withPromo({ active: true, mode: "percent", percent: 100 }))).toBeNull();
    // Percent mode without a percent.
    expect(promoOf(withPromo({ active: true, mode: "percent" }))).toBeNull();
    // A promotion on an article without any regular price.
    expect(promoOf(withPromo({ active: true, mode: "percent", percent: 10 }, { basePriceRsd: null }))).toBeNull();
  });

  test("a price promotion on an article with variants is left out", () => {
    const snapshot = edit(withPromo({ active: true, mode: "price", priceRsd: 400 }, { variantsEnabled: true }), (d) => {
      d.variants.push(variant("va_mali", "ar_a", 450, 1));
    });
    expect(promoOf(snapshot)).toBeNull();
  });

  test("a manual promotion (no schedule) is kept, in its stored form", () => {
    expect(promoOf(withPromo({ active: true, mode: "percent", percent: 15, label: "promo" }))).toEqual({
      active: true,
      mode: "percent",
      percent: 15,
      label: "promo",
    });
    expect(promoOf(withPromo({ active: true, mode: "price", priceRsd: 400 }))).toEqual({
      active: true,
      mode: "price",
      priceRsd: 400,
    });
  });

  test("only the entered value of the mode is kept", () => {
    expect(promoOf(withPromo({ active: true, mode: "price", priceRsd: 400, percent: 10 }))).toEqual({
      active: true,
      mode: "price",
      priceRsd: 400,
    });
  });

  test("a scheduled promotion without Premium scheduling is not published at all", () => {
    const scheduled: MenuPromo = { active: true, mode: "percent", percent: 10, startsAt: 1_800_000_000_000 };
    expect(promoOf(withPromo(scheduled), ctx({ scheduledPromos: false }))).toBeNull();
    const endsOnly: MenuPromo = { active: true, mode: "percent", percent: 10, endsAt: 1_900_000_000_000 };
    expect(promoOf(withPromo(endsOnly), ctx({ scheduledPromos: false }))).toBeNull();
  });

  test("a scheduled promotion with Premium scheduling is kept with its window", () => {
    const scheduled: MenuPromo = {
      active: true,
      mode: "percent",
      percent: 10,
      startsAt: 1_800_000_000_000,
      endsAt: 1_800_086_400_000,
    };
    expect(promoOf(withPromo(scheduled), ctx({ scheduledPromos: true }))).toEqual(scheduled);
  });

  test("a scheduled promotion with an impossible window is left out even with Premium", () => {
    const backwards: MenuPromo = {
      active: true,
      mode: "percent",
      percent: 10,
      startsAt: 1_800_086_400_000,
      endsAt: 1_800_000_000_000,
    };
    expect(promoOf(withPromo(backwards), ctx({ scheduledPromos: true }))).toBeNull();
  });

  test("a percent promotion applies to variants", () => {
    const snapshot = edit(withPromo({ active: true, mode: "percent", percent: 10 }, { variantsEnabled: true }), (d) => {
      d.variants.push(variant("va_mali", "ar_a", 450, 1));
    });
    expect(promoOf(snapshot)).toEqual({ active: true, mode: "percent", percent: 10 });
  });
});

// -----------------------------------------------------------------------------
// Room service
// -----------------------------------------------------------------------------

describe("compileRoomService", () => {
  function roomServiceDraft(overrides: Partial<MenuDraftSnapshot["roomService"]> = {}): MenuDraftSnapshot {
    return draft({
      articles: [
        article("ar_pljeskavica", "Pljeskavica", 450),
        article("ar_cevapi", "Ćevapi", 520),
        article("ar_sok", "Sok", 150, { variantsEnabled: true }),
        article("ar_bez_cene", "Bez cene", null),
      ],
      placements: [],
      variants: [
        variant("va_mali", "ar_sok", 100, 1, { name: "Mali" }),
        variant("va_veliki", "ar_sok", 200, 2, { name: "Veliki" }),
        variant("va_bez", "ar_sok", null, 3, { name: "Bez cene" }),
      ],
      roomService: {
        config: { markupBps: 1500, markupScope: "all", deliveryFeeRsd: 200 },
        categories: [
          roomServiceCategory("rc_pice", "Pića", 2),
          roomServiceCategory("rc_hrana", "Hrana", 1),
          roomServiceCategory("rc_prazna", "Prazna kategorija", 3),
          roomServiceCategory("rc_nepostojeca", "Samo nepostojeći artikli", 4),
        ],
        items: [
          roomServiceItem("ar_cevapi", "rc_hrana", 2, { manualPriceRsd: 600 }),
          roomServiceItem("ar_pljeskavica", "rc_hrana", 1),
          roomServiceItem("ar_sok", "rc_pice", 1, {
            manualVariantPrices: [{ variantKey: "va_veliki", priceRsd: 260, priceWarning: null }],
          }),
          roomServiceItem("ar_nepostojeci", "rc_nepostojeca", 1),
        ],
        ...overrides,
      },
    });
  }

  function compiledRoomService(
    snapshot: MenuDraftSnapshot,
    options: { lang?: string; allergensEnabled?: boolean } = {},
  ) {
    return compileRoomService(
      snapshot,
      indexSnapshot(snapshot),
      options.lang ?? "sr",
      "sr",
      options.allergensEnabled ?? false,
      ctx({ roomService: true }),
    );
  }

  test("categories and articles in order; empty categories and missing articles are left out", () => {
    const doc = compiledRoomService(roomServiceDraft());
    expect(doc.categories.map((row) => row.key)).toEqual(["rc_hrana", "rc_pice"]);
    expect(doc.categories[0].articles.map((row) => row.key)).toEqual(["ar_pljeskavica", "ar_cevapi"]);
    expect(doc.categories[1].articles.map((row) => row.key)).toEqual(["ar_sok"]);
  });

  test("a markup is computed: 450 + 15 % = 518, rounded half up", () => {
    const [pljeskavica] = compiledRoomService(roomServiceDraft()).categories[0].articles;
    expect(pljeskavica.priceRsd).toBe(518);
    expect(pljeskavica.priceOrigin).toBe("computed");
  });

  test("a manual price wins over the markup and stays as entered", () => {
    const cevapi = compiledRoomService(roomServiceDraft()).categories[0].articles[1];
    expect(cevapi.priceRsd).toBe(600);
    expect(cevapi.priceOrigin).toBe("manual");
  });

  test("variants: a manual variant price wins, the others get the markup, a missing price falls back to the base", () => {
    const sok = compiledRoomService(roomServiceDraft()).categories[1].articles[0];
    // 150 + 15 % = 173 (172.5 rounds up); the variant 100 + 15 % = 115.
    expect(sok.priceRsd).toBe(173);
    expect(sok.variants).toEqual([
      { key: "va_mali", name: "Mali", priceRsd: 115, priceOrigin: "computed" },
      { key: "va_veliki", name: "Veliki", priceRsd: 260, priceOrigin: "manual" },
      { key: "va_bez", name: "Bez cene", priceRsd: 173, priceOrigin: "computed" },
    ]);
  });

  test("the delivery fee is carried; without a config there is none and no markup", () => {
    expect(compiledRoomService(roomServiceDraft()).deliveryFeeRsd).toBe(200);
    const noConfig = compiledRoomService(roomServiceDraft({ config: null }));
    expect(noConfig.deliveryFeeRsd).toBeNull();
    const [pljeskavica] = noConfig.categories[0].articles;
    expect(pljeskavica.priceRsd).toBe(450);
    expect(pljeskavica.priceOrigin).toBe("inherited");
    const noFee = compiledRoomService(
      roomServiceDraft({ config: { markupBps: 0, markupScope: "all", deliveryFeeRsd: null } }),
    );
    expect(noFee.deliveryFeeRsd).toBeNull();
  });

  test("markup scope `selected` applies only to the items marked for it", () => {
    const snapshot = roomServiceDraft({
      config: { markupBps: 1500, markupScope: "selected", deliveryFeeRsd: null },
      items: [
        roomServiceItem("ar_pljeskavica", "rc_hrana", 1, { markupApplies: true }),
        roomServiceItem("ar_cevapi", "rc_hrana", 2, { markupApplies: false }),
      ],
    });
    const [pljeskavica, cevapi] = compiledRoomService(snapshot).categories[0].articles;
    expect(pljeskavica).toMatchObject({ priceRsd: 518, priceOrigin: "computed" });
    expect(cevapi).toMatchObject({ priceRsd: 520, priceOrigin: "inherited" });
  });

  test("an article without a base price and without a manual price has no Room service price", () => {
    const snapshot = roomServiceDraft({
      items: [
        roomServiceItem("ar_bez_cene", "rc_hrana", 1),
        roomServiceItem("ar_pljeskavica", "rc_hrana", 2),
      ],
    });
    const [noPrice] = compiledRoomService(snapshot).categories[0].articles;
    expect(noPrice.priceRsd).toBeNull();
    expect(noPrice.priceOrigin).toBe("inherited");
  });

  test("a manual price makes an article without a base price priceable", () => {
    const snapshot = roomServiceDraft({
      items: [roomServiceItem("ar_bez_cene", "rc_hrana", 1, { manualPriceRsd: 300 })],
    });
    const [priced] = compiledRoomService(snapshot).categories[0].articles;
    expect(priced).toMatchObject({ priceRsd: 300, priceOrigin: "manual" });
  });

  test("a Room service article is the same public article as on a page, with its own prices", () => {
    const snapshot = edit(roomServiceDraft(), (d) => {
      find(d.articles, "ar_pljeskavica").description = "Domaća";
      find(d.articles, "ar_pljeskavica").tags = ["novo"];
    });
    const [pljeskavica] = compiledRoomService(snapshot).categories[0].articles;
    expect(pljeskavica).toMatchObject({ key: "ar_pljeskavica", name: "Pljeskavica", description: "Domaća", tags: ["novo"] });
  });

  test("category and article names are translated with confirmed text only", () => {
    const snapshot = edit(roomServiceDraft(), (d) => {
      find(d.roomService.categories, "rc_hrana").translations = { en: confirmed({ name: "Food" }), de: suggested({ name: "Essen" }) };
      find(d.articles, "ar_pljeskavica").translations = { en: confirmed({ name: "Burger" }) };
    });
    const english = compiledRoomService(snapshot, { lang: "en" });
    expect(english.categories[0].name).toBe("Food");
    expect(english.categories[0].articles[0].name).toBe("Burger");
    const german = compiledRoomService(snapshot, { lang: "de" });
    expect(german.categories[0].name).toBe("Hrana");
    expect(german.categories[0].articles[0].name).toBe("Pljeskavica");
  });

  test("the input is not mutated", () => {
    const snapshot = scramble(roomServiceDraft());
    const before = JSON.stringify(snapshot);
    compiledRoomService(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  test("in a version: `_rs` per language holds the Room service, also for an article on no page", () => {
    const version = compileSnapshot(richDraft(), ctx({ languages: ["sr", "en"], roomService: true }));
    const doc = roomServiceOf(version, "sr");
    expect(doc.deliveryFeeRsd).toBe(200);
    expect(doc.categories).toHaveLength(1);
    expect(doc.categories[0].articles.map((row) => [row.key, row.priceRsd, row.priceOrigin])).toEqual([
      ["ar_sok", 173, "computed"],
      ["ar_kafa", 207, "computed"],
    ]);
    expect(roomServiceOf(version, "en").categories[0].key).toBe("rc_hrana");
  });
});

// -----------------------------------------------------------------------------
// Pages and parts
// -----------------------------------------------------------------------------

describe("isPagePublic and shownPlacements", () => {
  test("a page is public when visible and not archived", () => {
    expect(isPagePublic(page("pg_a", 1))).toBe(true);
    expect(isPagePublic(page("pg_a", 1, { visibility: "hidden" }))).toBe(false);
    expect(isPagePublic(page("pg_a", 1, { archivedAt: 1 }))).toBe(false);
  });

  test("a page that is not public shows nothing", () => {
    const snapshot = richDraft();
    const index = indexSnapshot(snapshot);
    expect(shownPlacements(index, find(snapshot.pages, "pg_skrivena"))).toEqual([]);
    expect(shownPlacements(index, find(snapshot.pages, "pg_arhiva"))).toEqual([]);
    expect(compilePage(index, find(snapshot.pages, "pg_skrivena"), "sr", "sr", false, ctx()).sections).toEqual([]);
  });

  test("a visible page lists its visible sections in order, with visible placements of existing articles", () => {
    const snapshot = richDraft();
    const shown = shownPlacements(indexSnapshot(snapshot), find(snapshot.pages, "pg_main"));
    expect(shown.map((row) => row.section.key)).toEqual(["se_hrana", "se_prazna", "se_sve_skriveno"]);
    expect(shown[0].placements.map((row) => row.articleKey)).toEqual(["ar_cevapi", "ar_set"]);
    expect(shown[1].placements).toEqual([]);
    expect(shown[2].placements).toEqual([]);
  });
});

describe("chunkPage and parsePublicPage", () => {
  /** A page of three sections: a long one, a short one, a medium one. */
  function bigPage(): PublicPageDoc {
    const sizes = [9, 1, 5];
    const articles: SnapshotArticle[] = [];
    const placements: SnapshotPlacement[] = [];
    const sections: SnapshotSection[] = [];
    let counter = 0;
    sizes.forEach((count, s) => {
      const sectionKey = `se_${s}`;
      sections.push(section(sectionKey, "pg_main", s + 1, { name: `Sekcija ${s + 1}`, description: s === 0 ? "Sa žara, šećerom i ćevapima" : null }));
      for (let i = 0; i < count; i += 1) {
        counter += 1;
        const key = `ar_${String(counter).padStart(2, "0")}`;
        articles.push(
          article(key, `Artikal ${counter} ${"Ćevapi ".repeat(1 + ((counter * 7) % 5)).trim()}`, 100 + counter, {
            description: counter % 2 === 0 ? "Domaći recept, čuvan generacijama" : null,
            tags: counter % 3 === 0 ? ["ljuto"] : null,
          }),
        );
        placements.push(placement("pg_main", sectionKey, key, i + 1));
      }
    });
    return compiledPage(draft({ sections, articles, placements }), "pg_main");
  }

  /** The invariants of every chunking: size, shape, and an exact way back. */
  function expectSound(doc: PublicPageDoc, maxBytes: number) {
    const parts = chunkPage(doc, maxBytes);
    expect(parts.length).toBeGreaterThan(0);
    parts.forEach((data, i) => {
      expect(byteLength(data), `part ${i} of ${maxBytes}`).toBeLessThanOrEqual(maxBytes);
      const json = JSON.parse(data) as { page?: unknown };
      expect("page" in json, `page in part ${i}`).toBe(i === 0);
    });
    expect(parsePublicPage(parts)).toEqual(doc);
    return parts;
  }

  test("a page that fits is one part and restores exactly", () => {
    const doc = bigPage();
    const parts = chunkPage(doc);
    expect(parts).toHaveLength(1);
    expect(parsePublicPage(parts)).toEqual(doc);
  });

  test("with a small maximum every part stays within it and the page restores exactly", () => {
    const doc = bigPage();
    const parts = expectSound(doc, 900);
    expect(parts.length).toBeGreaterThan(3);
  });

  test("a long section continues in the next part with `continued: true`", () => {
    const doc = bigPage();
    const parts = chunkPage(doc, 900);
    const fragments = parts.flatMap((data) =>
      (JSON.parse(data) as { sections: { key: string; continued: boolean; articles: unknown[] }[] }).sections,
    );
    const first = fragments.filter((row) => row.key === "se_0");
    expect(first.length).toBeGreaterThan(1);
    expect(first[0].continued).toBe(false);
    expect(first.slice(1).every((row) => row.continued)).toBe(true);
    // The short section is never continued, and no fragment is a continued section's first appearance.
    expect(fragments.filter((row) => row.key === "se_1").every((row) => !row.continued)).toBe(true);
    expect(first.reduce((sum, row) => sum + row.articles.length, 0)).toBe(doc.sections[0].articles.length);
  });

  test("the page meta is only in the first part", () => {
    const parts = chunkPage(bigPage(), 900);
    expect(JSON.parse(parts[0]).page.key).toBe("pg_main");
    for (const data of parts.slice(1)) expect("page" in JSON.parse(data)).toBe(false);
  });

  test("whatever the maximum, parts fit and the page restores exactly", () => {
    const doc = bigPage();
    let checked = 0;
    for (let maxBytes = 700; maxBytes <= 6000; maxBytes += 37) {
      expectSound(doc, maxBytes);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  test("multi-byte text is measured in UTF-8 bytes, not in characters", () => {
    const doc = bigPage();
    expect(JSON.stringify(doc).length).toBeLessThan(byteLength(JSON.stringify(doc)));
    expectSound(doc, 1100);
  });

  test("sections that each fit in a part are not split from their articles", () => {
    const sections = ["a", "b", "c"].map((letter, i) => `se_${letter}${i}`);
    const articles = sections.map((_, i) => article(`ar_${i}`, `Artikal ${i}`, 100));
    const snapshot = draft({
      sections: sections.map((key, i) => section(key, "pg_main", i + 1)),
      articles,
      placements: articles.map((row, i) => placement("pg_main", sections[i], row.key, 1)),
    });
    const doc = compiledPage(snapshot, "pg_main");
    const solo = chunkPage({ page: doc.page, sections: [doc.sections[0]] }, 100000)[0];
    // Room for one section per part only.
    const parts = expectSound(doc, byteLength(solo) + 30);
    expect(parts).toHaveLength(3);
    for (const data of parts) {
      const json = JSON.parse(data) as { sections: { continued: boolean; articles: unknown[] }[] };
      expect(json.sections).toHaveLength(1);
      expect(json.sections[0].continued).toBe(false);
      expect(json.sections[0].articles).toHaveLength(1);
    }
  });

  test("a section header that fits while its first article does not moves to the next part whole", () => {
    const sections = ["se_a", "se_b"];
    const articles = [article("ar_1", "Prvi artikal", 100), article("ar_2", "Drugi artikal", 100)];
    const snapshot = draft({
      sections: sections.map((key, i) => section(key, "pg_main", i + 1)),
      articles,
      placements: [placement("pg_main", "se_a", "ar_1", 1), placement("pg_main", "se_b", "ar_2", 1)],
    });
    const doc = compiledPage(snapshot, "pg_main");
    const articleBytes = byteLength(JSON.stringify(doc.sections[0].articles[0]));
    const onePart = byteLength(chunkPage({ page: doc.page, sections: [doc.sections[0]] }, 100000)[0]);
    // Part 0 holds the first section; the second section's header fits after it,
    // but its article (about 290 bytes) does not.
    const parts = expectSound(doc, onePart + Math.floor(articleBytes / 2));
    expect(parts).toHaveLength(2);
    const second = JSON.parse(parts[1]) as { sections: { key: string; continued: boolean; articles: unknown[] }[] };
    expect(second.sections).toHaveLength(1);
    expect(second.sections[0]).toMatchObject({ key: "se_b", continued: false });
    expect(second.sections[0].articles).toHaveLength(1);
  });

  test("the default maximum is the version part maximum", () => {
    const total = 1900;
    const articles = Array.from({ length: total }, (_, i) => article(`ar_${String(i).padStart(4, "0")}`, `Artikal ${i}`, 100));
    const snapshot = draft({
      articles,
      placements: articles.map((row, i) => placement("pg_main", "se_main", row.key, i + 1)),
    });
    const doc = compiledPage(snapshot, "pg_main");
    expect(byteLength(JSON.stringify(doc))).toBeGreaterThan(MENU_VERSION_PART_MAX_BYTES);
    const parts = chunkPage(doc);
    expect(parts.length).toBeGreaterThan(1);
    for (const data of parts) expect(byteLength(data)).toBeLessThanOrEqual(MENU_VERSION_PART_MAX_BYTES);
    expect(parsePublicPage(parts)).toEqual(doc);
  });

  test("a single article larger than the maximum throws", () => {
    const snapshot = draft({
      articles: [article("ar_veliki", "X".repeat(2000), 100)],
      placements: [placement("pg_main", "se_main", "ar_veliki", 1)],
    });
    const doc = compiledPage(snapshot, "pg_main");
    expect(() => chunkPage(doc, 600)).toThrow(/one article is larger than a version part/);
  });

  test("a page without sections is one part with the page meta", () => {
    const doc = compiledPage(
      draft({ sections: [], placements: [] }),
      "pg_main",
    );
    expect(doc.sections).toEqual([]);
    const parts = chunkPage(doc, 600);
    expect(parts).toHaveLength(1);
    expect(parsePublicPage(parts)).toEqual(doc);
  });

  test("parsePublicPage is null without a first part", () => {
    expect(parsePublicPage([])).toBeNull();
    expect(parsePublicPage([JSON.stringify({ sections: [] })])).toBeNull();
  });

  test("in a version, a page over the part maximum is cut and read back whole", () => {
    const total = 1900;
    const articles = Array.from({ length: total }, (_, i) => article(`ar_${String(i).padStart(4, "0")}`, `Artikal ${i}`, 100));
    const snapshot = draft({
      articles,
      placements: articles.map((row, i) => placement("pg_main", "se_main", row.key, i + 1)),
    });
    const version = compileSnapshot(snapshot, ctx());
    const parts = version.parts.filter((row) => row.scope === "public" && row.pageKey === "pg_main");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((row) => row.part)).toEqual(parts.map((_, i) => i));
    const restored = pageDocOf(version, "sr", "pg_main");
    expect(restored?.sections).toHaveLength(1);
    expect(restored?.sections[0].articles).toHaveLength(total);
  });
});

describe("splitUtf8", () => {
  const surrogatePairSplit = (pieces: string[]) =>
    pieces.slice(1).some((piece, i) => {
      const before = pieces[i].charCodeAt(pieces[i].length - 1);
      const after = piece.charCodeAt(0);
      return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
    });

  function expectSplit(value: string, maxBytes: number): string[] {
    const pieces = splitUtf8(value, maxBytes);
    expect(pieces.join("")).toBe(value);
    for (const piece of pieces) expect(byteLength(piece), JSON.stringify(piece)).toBeLessThanOrEqual(maxBytes);
    expect(surrogatePairSplit(pieces)).toBe(false);
    return pieces;
  }

  test("ASCII is cut every maxBytes characters", () => {
    expect(expectSplit("a".repeat(25), 10)).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(5)]);
  });

  test("an exact multiple does not leave an empty piece", () => {
    expect(expectSplit("a".repeat(20), 10)).toEqual(["a".repeat(10), "a".repeat(10)]);
  });

  test("a short string is one piece, an empty string is one empty piece", () => {
    expect(splitUtf8("kafa", 100)).toEqual(["kafa"]);
    expect(splitUtf8("", 100)).toEqual([""]);
  });

  test("two-byte letters are counted as two bytes", () => {
    expect(expectSplit("čćžšđ", 5)).toEqual(["čć", "žš", "đ"]);
    expect(expectSplit("čćžšđ", 4)).toEqual(["čć", "žš", "đ"]);
    expect(expectSplit("čćžšđ", 3)).toEqual(["č", "ć", "ž", "š", "đ"]);
    expect(expectSplit("čćžšđ", 10)).toEqual(["čćžšđ"]);
  });

  test("emoji (surrogate pairs) are four bytes and never cut in the middle", () => {
    expect(expectSplit("😀😀😀", 8)).toEqual(["😀😀", "😀"]);
    expect(expectSplit("😀😀😀", 7)).toEqual(["😀", "😀", "😀"]);
    expect(expectSplit("😀😀😀", 5)).toEqual(["😀", "😀", "😀"]);
    expect(expectSplit("a😀b", 5)).toEqual(["a😀", "b"]);
    expect(expectSplit("ab😀", 5)).toEqual(["ab", "😀"]);
  });

  test("a character wider than the maximum is kept whole rather than cut", () => {
    expect(splitUtf8("😀😀", 2)).toEqual(["😀", "😀"]);
    expect(splitUtf8("čć", 1)).toEqual(["č", "ć"]);
  });

  test("a lone surrogate counts as three bytes and does not break the join", () => {
    const value = `a\ud83db\ude00c`;
    const pieces = splitUtf8(value, 4);
    expect(pieces.join("")).toBe(value);
    for (const piece of pieces) expect(byteLength(piece)).toBeLessThanOrEqual(4);
  });

  test("the default maximum is the version part maximum", () => {
    const value = "x".repeat(MENU_VERSION_PART_MAX_BYTES * 2 + 10);
    const pieces = splitUtf8(value);
    expect(pieces.map((piece) => piece.length)).toEqual([MENU_VERSION_PART_MAX_BYTES, MENU_VERSION_PART_MAX_BYTES, 10]);
  });

  test("mixed text of every width, many maximums", () => {
    const alphabet = ["a", "Z", " ", "č", "ć", "ž", "š", "đ", "Ђ", "✓", "€", "😀", "🍕", "1"];
    let seed = 20_261_017;
    const next = () => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
      return seed;
    };
    for (let round = 0; round < 40; round += 1) {
      const value = Array.from({ length: 60 + (next() % 200) }, () => alphabet[next() % alphabet.length]).join("");
      for (const maxBytes of [4, 5, 6, 7, 8, 11, 16, 33, 100]) expectSplit(value, maxBytes);
    }
  });

  test("a Serbian menu JSON survives a split into small pieces", () => {
    const json = JSON.stringify(compiledPage(richDraft(), "pg_main"));
    const pieces = expectSplit(json, 64);
    expect(pieces.length).toBeGreaterThan(5);
    expect(JSON.parse(pieces.join(""))).toEqual(JSON.parse(json));
  });
});

// -----------------------------------------------------------------------------
// Canonical JSON and hashes
// -----------------------------------------------------------------------------

describe("canonicalJson", () => {
  test("does not depend on the order of the keys, at any depth", () => {
    const a = { b: 1, a: { d: [{ y: 1, x: 2 }], c: null }, z: "kafa" };
    const b = { z: "kafa", a: { c: null, d: [{ x: 2, y: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":null,"d":[{"x":2,"y":1}]},"b":1,"z":"kafa"}');
  });

  test("keeps the order of an array", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson([3, 1, 2])).not.toBe(canonicalJson([1, 2, 3]));
  });

  test("drops undefined members and keeps null", () => {
    expect(canonicalJson({ a: undefined, b: null, c: 0 })).toBe('{"b":null,"c":0}');
  });

  test("handles primitives", () => {
    expect(canonicalJson("Ćevapi")).toBe('"Ćevapi"');
    expect(canonicalJson(520)).toBe("520");
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
  });

  test("different values give different JSON", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ b: 1 }));
  });
});

describe("hashString", () => {
  test("is deterministic and 14 hex digits", () => {
    expect(hashString("Ćevapi 520")).toBe(hashString("Ćevapi 520"));
    for (const value of ["", "a", "Ćevapi 520", "x".repeat(10_000)]) {
      expect(hashString(value)).toMatch(/^[0-9a-f]{14}$/);
    }
  });

  test("differs for different input", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("ab")).not.toBe(hashString("ba"));
    expect(hashString("")).not.toBe(hashString(" "));
    expect(hashString("Kafa 180")).not.toBe(hashString("Kafa 181"));
  });

  test("the seed changes the hash", () => {
    expect(hashString("Kafa", 1)).not.toBe(hashString("Kafa", 2));
    expect(hashString("Kafa", 0)).toBe(hashString("Kafa"));
  });

  test("a thousand different prices give a thousand different hashes", () => {
    const hashes = new Set(Array.from({ length: 1000 }, (_, i) => hashString(`{"basePriceRsd":${i}}`)));
    expect(hashes.size).toBe(1000);
  });
});

describe("snapshotHash", () => {
  test("is the same for the same snapshot with its lists in another order", () => {
    const snapshot = richDraft();
    expect(snapshotHash(scramble(snapshot))).toBe(snapshotHash(snapshot));
  });

  test("is the same for the same snapshot with its keys in another order", () => {
    const snapshot = richDraft();
    const reordered = JSON.parse(
      JSON.stringify(snapshot, (_key, value: unknown) =>
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    ) as MenuDraftSnapshot;
    expect(snapshotHash(reordered)).toBe(snapshotHash(snapshot));
  });

  test("changes with the content", () => {
    const snapshot = richDraft();
    const dearer = edit(snapshot, (d) => void (find(d.articles, "ar_kafa").basePriceRsd = 190));
    const hidden = edit(snapshot, (d) => void (d.placements[0].visibility = "hidden"));
    expect(snapshotHash(dearer)).not.toBe(snapshotHash(snapshot));
    expect(snapshotHash(hidden)).not.toBe(snapshotHash(snapshot));
    expect(snapshotHash(hidden)).not.toBe(snapshotHash(dearer));
  });

  test("hashing does not change the snapshot", () => {
    const snapshot = scramble(richDraft());
    const before = JSON.stringify(snapshot);
    snapshotHash(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});

// -----------------------------------------------------------------------------
// Languages
// -----------------------------------------------------------------------------

describe("publishedLanguages", () => {
  const settings = (translations: string[], source = "sr") => ({
    languages: { source, translations },
    allergensEnabled: null,
  });

  test("the source comes first, then the translations in order", () => {
    expect(publishedLanguages(settings(["en", "de"]), 5)).toEqual({
      source: "sr",
      languages: ["sr", "en", "de"],
      dropped: [],
    });
  });

  test("translations are capped by the plan's maximum, the rest are dropped", () => {
    expect(publishedLanguages(settings(["en", "de", "ru"]), 2)).toEqual({
      source: "sr",
      languages: ["sr", "en"],
      dropped: ["de", "ru"],
    });
    expect(publishedLanguages(settings(["en", "de", "ru"]), 3)).toEqual({
      source: "sr",
      languages: ["sr", "en", "de"],
      dropped: ["ru"],
    });
  });

  test("a maximum of one keeps only the source, and a maximum below one still keeps the source", () => {
    expect(publishedLanguages(settings(["en", "de"]), 1)).toEqual({ source: "sr", languages: ["sr"], dropped: ["en", "de"] });
    expect(publishedLanguages(settings(["en"]), 0)).toEqual({ source: "sr", languages: ["sr"], dropped: ["en"] });
    expect(publishedLanguages(settings(["en"]), -3)).toEqual({ source: "sr", languages: ["sr"], dropped: ["en"] });
  });

  test("a menu without language settings publishes the default source language", () => {
    expect(publishedLanguages({ languages: null, allergensEnabled: null }, 5)).toEqual({
      source: "sr",
      languages: ["sr"],
      dropped: [],
    });
  });

  test("the source is never listed as a translation", () => {
    expect(publishedLanguages(settings(["sr", "en"]), 5)).toEqual({ source: "sr", languages: ["sr", "en"], dropped: [] });
    expect(publishedLanguages(settings(["en", "sr"], "en"), 5)).toEqual({ source: "en", languages: ["en", "sr"], dropped: [] });
  });

  test("a different source language is respected", () => {
    expect(publishedLanguages(settings(["sr", "de"], "en"), 2)).toEqual({
      source: "en",
      languages: ["en", "sr"],
      dropped: ["de"],
    });
  });
});
