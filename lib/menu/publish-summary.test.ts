// ScanMe Menu V1 — the summary of a publication ("broj izmenjenih cena, novih i
// uklonjenih artikala, strukturnih izmena"). Fictional data only.

import { describe, expect, test } from "vitest";
import {
  EMPTY_PUBLISH_SUMMARY,
  MENU_SUMMARY_PRICE_SAMPLE,
  summarizePublication,
  summaryCounts,
  type MenuPublishSummary,
} from "./publish-summary";
import type {
  MenuDraftSnapshot,
  SnapshotArticle,
  SnapshotPage,
  SnapshotPlacement,
  SnapshotRoomServiceItem,
  SnapshotSection,
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
): SnapshotVariant {
  return { key, articleKey, name: key, priceRsd, order, translations: null };
}

function roomServiceItem(
  articleKey: string,
  overrides: Partial<SnapshotRoomServiceItem> = {},
): SnapshotRoomServiceItem {
  return {
    articleKey,
    categoryKey: "rc_main",
    order: 1,
    markupApplies: false,
    manualPriceRsd: null,
    priceWarning: null,
    manualVariantPrices: null,
    ...overrides,
  };
}

/** One page, one section, three shown articles; tests override whole lists. */
function draft(parts: Partial<MenuDraftSnapshot> = {}): MenuDraftSnapshot {
  return {
    formatVersion: 1,
    settings: { languages: null, allergensEnabled: null },
    presentation: null,
    pages: [page("pg_main", 1, { isDefault: true })],
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

function placementOf(snapshot: MenuDraftSnapshot, sectionKey: string, articleKey: string): SnapshotPlacement {
  const row = snapshot.placements.find(
    (candidate) => candidate.sectionKey === sectionKey && candidate.articleKey === articleKey,
  );
  if (!row) throw new Error(`test fixture: no placement ${sectionKey}|${articleKey}`);
  return row;
}

function counts(overrides: Partial<Omit<MenuPublishSummary, "structural">> & {
  structural?: Partial<MenuPublishSummary["structural"]>;
} = {}): MenuPublishSummary {
  const { structural, ...rest } = overrides;
  return {
    ...EMPTY_PUBLISH_SUMMARY,
    ...rest,
    structural: { ...EMPTY_PUBLISH_SUMMARY.structural, ...structural },
  };
}

function summary(previous: MenuDraftSnapshot | null, next: MenuDraftSnapshot): MenuPublishSummary {
  return summaryCounts(summarizePublication(previous, next));
}

const VARIANTS = [
  variant("va_mala", "ar_pljeskavica", 400, 1),
  variant("va_velika", "ar_pljeskavica", 600, 2),
];

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("summarizePublication: first publication and no change", () => {
  test("first publication: every shown article is new, nothing else is counted", () => {
    const detail = summarizePublication(null, draft());
    expect(detail).toEqual({ ...counts({ newArticles: 3 }), priceChanges: [] });
  });

  test("first publication counts only articles that guests see", () => {
    const next = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_kafa").visibility = "hidden";
      d.articles.push(article("ar_orphan", "Čaj", 150));
    });
    expect(summary(null, next)).toEqual(counts({ newArticles: 2 }));
  });

  test("identical snapshots: all zeros", () => {
    const before = draft();
    const detail = summarizePublication(before, edit(before, () => undefined));
    expect(detail).toEqual({ ...EMPTY_PUBLISH_SUMMARY, priceChanges: [] });
    expect(summaryCounts(detail)).toEqual(EMPTY_PUBLISH_SUMMARY);
  });

  test("the empty summary is all zeros", () => {
    expect(EMPTY_PUBLISH_SUMMARY).toEqual({
      changedPrices: 0,
      newArticles: 0,
      removedArticles: 0,
      structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
    });
  });

  test("summaryCounts drops the price list and copies the counts", () => {
    const detail = summarizePublication(
      draft(),
      edit(draft(), (d) => {
        find(d.articles, "ar_kafa").basePriceRsd = 200;
      }),
    );
    expect(detail.priceChanges).toHaveLength(1);
    const plain = summaryCounts(detail);
    expect(plain).toEqual(counts({ changedPrices: 1 }));
    expect("priceChanges" in plain).toBe(false);
    expect(plain.structural).not.toBe(detail.structural);
  });
});

describe("summarizePublication: prices", () => {
  test("a base price change is counted and listed", () => {
    const next = edit(draft(), (d) => {
      find(d.articles, "ar_pljeskavica").basePriceRsd = 480;
    });
    const detail = summarizePublication(draft(), next);
    expect(summaryCounts(detail)).toEqual(counts({ changedPrices: 1 }));
    expect(detail.priceChanges).toEqual([
      { articleKey: "ar_pljeskavica", name: "Pljeskavica", before: 450, after: 480 },
    ]);
  });

  test("a price set or cleared is a change with null on one side", () => {
    const cleared = edit(draft(), (d) => {
      find(d.articles, "ar_kafa").basePriceRsd = null;
    });
    const detail = summarizePublication(draft(), cleared);
    expect(detail.priceChanges).toEqual([{ articleKey: "ar_kafa", name: "Kafa", before: 180, after: null }]);
  });

  test("a variant price change is counted while variants are on", () => {
    const before = draft({ variants: VARIANTS });
    before.articles = before.articles.map((row) =>
      row.key === "ar_pljeskavica" ? { ...row, variantsEnabled: true } : row,
    );
    const next = edit(before, (d) => {
      find(d.variants, "va_velika").priceRsd = 650;
    });
    const detail = summarizePublication(before, next);
    expect(summaryCounts(detail)).toEqual(counts({ changedPrices: 1 }));
    // The listed price is the base price; the variants only decide the count.
    expect(detail.priceChanges).toEqual([
      { articleKey: "ar_pljeskavica", name: "Pljeskavica", before: 450, after: 450 },
    ]);
  });

  test("a variant price change is not counted while variants are off", () => {
    const before = draft({ variants: VARIANTS });
    const next = edit(before, (d) => {
      find(d.variants, "va_velika").priceRsd = 650;
    });
    expect(summary(before, next)).toEqual(counts());
  });

  test("a removed variant changes the signature only while variants are on", () => {
    const on = edit(draft({ variants: VARIANTS }), (d) => {
      find(d.articles, "ar_pljeskavica").variantsEnabled = true;
    });
    const withoutOne = edit(on, (d) => {
      d.variants = d.variants.filter((row) => row.key !== "va_mala");
    });
    expect(summary(on, withoutOne)).toEqual(counts({ changedPrices: 1 }));
  });

  test("a Room service manual price change is counted, even for an article no page shows", () => {
    const before = draft({
      articles: [article("ar_kafa", "Kafa", 180)],
      placements: [],
      roomService: {
        config: null,
        categories: [],
        items: [roomServiceItem("ar_kafa", { manualPriceRsd: 250 })],
      },
    });
    const next = edit(before, (d) => {
      d.roomService.items[0].manualPriceRsd = 280;
    });
    expect(summary(before, next)).toEqual(counts({ changedPrices: 1 }));
  });

  test("a Room service manual variant price change is counted", () => {
    const manual = (priceRsd: number) => [
      { variantKey: "va_mala", priceRsd, priceWarning: null },
      { variantKey: "va_velika", priceRsd: 700, priceWarning: null },
    ];
    const before = draft({
      roomService: {
        config: null,
        categories: [],
        items: [roomServiceItem("ar_pljeskavica", { manualVariantPrices: manual(450) })],
      },
    });
    const next = edit(before, (d) => {
      d.roomService.items[0].manualVariantPrices = manual(480);
    });
    expect(summary(before, next)).toEqual(counts({ changedPrices: 1 }));
  });

  test("putting an article into Room service with a manual price changes its signature", () => {
    const next = edit(draft(), (d) => {
      d.roomService.items.push(roomServiceItem("ar_kafa", { manualPriceRsd: 220 }));
    });
    expect(summary(draft(), next)).toEqual(counts({ changedPrices: 1 }));
  });

  test("a price change of an article that is not shown and not in Room service is not counted", () => {
    const before = draft({ articles: [...draft().articles, article("ar_orphan", "Čaj", 150)] });
    const next = edit(before, (d) => {
      find(d.articles, "ar_orphan").basePriceRsd = 170;
    });
    expect(summary(before, next)).toEqual(counts());
  });

  test("a price change of a hidden article is not counted", () => {
    const before = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_kafa").visibility = "hidden";
    });
    const next = edit(before, (d) => {
      find(d.articles, "ar_kafa").basePriceRsd = 200;
    });
    expect(summary(before, next)).toEqual(counts());
  });

  test("a new article is not a price change", () => {
    const next = edit(draft(), (d) => {
      d.articles.push(article("ar_palacinke", "Palačinke", 300));
      d.placements.push(placement("pg_main", "se_main", "ar_palacinke", 4));
    });
    expect(summary(draft(), next)).toEqual(counts({ newArticles: 1 }));
  });

  test("priceChanges are sorted by name then key and capped, while the count stays exact", () => {
    const total = MENU_SUMMARY_PRICE_SAMPLE + 5;
    const names = Array.from({ length: total }, (_, i) => `Artikal ${String(i + 1).padStart(2, "0")}`);
    // Built in descending order so sorting has to do the work.
    const rows = names.map((name, i) => ({ key: `ar_${String(i + 1).padStart(2, "0")}`, name })).reverse();
    const make = (price: number) =>
      draft({
        articles: rows.map((row) => article(row.key, row.name, price)),
        placements: rows.map((row, i) => placement("pg_main", "se_main", row.key, i + 1)),
      });
    const detail = summarizePublication(make(100), make(150));
    expect(detail.changedPrices).toBe(total);
    expect(detail.priceChanges).toHaveLength(MENU_SUMMARY_PRICE_SAMPLE);
    expect(detail.priceChanges.map((row) => row.name)).toEqual(names.slice(0, MENU_SUMMARY_PRICE_SAMPLE));
    expect(detail.priceChanges[0]).toEqual({
      articleKey: "ar_01",
      name: "Artikal 01",
      before: 100,
      after: 150,
    });
  });

  test("equal names are ordered by article key", () => {
    const make = (price: number) =>
      draft({
        articles: [article("ar_b", "Kafa", price), article("ar_a", "Kafa", price)],
        placements: [placement("pg_main", "se_main", "ar_b", 1), placement("pg_main", "se_main", "ar_a", 2)],
      });
    const detail = summarizePublication(make(100), make(120));
    expect(detail.priceChanges.map((row) => row.articleKey)).toEqual(["ar_a", "ar_b"]);
  });
});

describe("summarizePublication: new and removed articles", () => {
  test("a new shown article is counted as new", () => {
    const next = edit(draft(), (d) => {
      d.articles.push(article("ar_palacinke", "Palačinke", 300));
      d.placements.push(placement("pg_main", "se_main", "ar_palacinke", 4));
    });
    expect(summary(draft(), next)).toEqual(counts({ newArticles: 1 }));
  });

  test("a new article that is not placed is not counted", () => {
    const next = edit(draft(), (d) => {
      d.articles.push(article("ar_palacinke", "Palačinke", 300));
    });
    expect(summary(draft(), next)).toEqual(counts());
  });

  test("an article that was hidden and is shown now counts as new", () => {
    const before = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_kafa").visibility = "hidden";
    });
    expect(summary(before, draft())).toEqual(counts({ newArticles: 1 }));
  });

  test("a hidden placement is a removed article and a hidden one", () => {
    const next = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_kafa").visibility = "hidden";
    });
    expect(summary(draft(), next)).toEqual(counts({ removedArticles: 1, structural: { hidden: 1 } }));
  });

  test("hiding one of two placements of an article keeps it on the menu", () => {
    const before = edit(draft(), (d) => {
      d.sections.push(section("se_drinks", "pg_main", 2));
      d.placements.push(placement("pg_main", "se_drinks", "ar_kafa", 1));
    });
    const next = edit(before, (d) => {
      placementOf(d, "se_drinks", "ar_kafa").visibility = "hidden";
    });
    expect(summary(before, next)).toEqual(counts({ structural: { hidden: 1 } }));
  });

  test("an article placed in a section and already hidden is not hidden again", () => {
    const hidden = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_kafa").visibility = "hidden";
    });
    expect(summary(hidden, hidden)).toEqual(counts());
  });
});

describe("summarizePublication: hiding sections and pages", () => {
  test("a hidden section is one hidden and removes its articles", () => {
    const next = edit(draft(), (d) => {
      find(d.sections, "se_main").visibility = "hidden";
    });
    expect(summary(draft(), next)).toEqual(counts({ removedArticles: 3, structural: { hidden: 1 } }));
  });

  test("a hidden page is one hidden and removes its articles", () => {
    const next = edit(draft(), (d) => {
      find(d.pages, "pg_main").visibility = "hidden";
    });
    expect(summary(draft(), next)).toEqual(counts({ removedArticles: 3, structural: { hidden: 1 } }));
  });

  test("an archived page counts as hidden", () => {
    const next = edit(draft(), (d) => {
      find(d.pages, "pg_main").archivedAt = 1_760_000_000_000;
    });
    expect(summary(draft(), next)).toEqual(counts({ removedArticles: 3, structural: { hidden: 1 } }));
  });

  test("a page that was already hidden is not counted again", () => {
    const hidden = edit(draft(), (d) => {
      find(d.pages, "pg_main").visibility = "hidden";
    });
    const archived = edit(hidden, (d) => {
      find(d.pages, "pg_main").archivedAt = 1_760_000_000_000;
    });
    expect(summary(hidden, archived)).toEqual(counts());
  });

  test("a section, a placement and a page hidden together are three hidden", () => {
    const next = edit(draft(), (d) => {
      d.pages.push(page("pg_pice", 2));
      d.sections.push(section("se_pice", "pg_pice", 1));
      d.placements.push(placement("pg_pice", "se_pice", "ar_kafa", 1));
    });
    const hiddenAll = edit(next, (d) => {
      find(d.pages, "pg_pice").visibility = "hidden";
      find(d.sections, "se_main").visibility = "hidden";
      placementOf(d, "se_pice", "ar_kafa").visibility = "hidden";
    });
    // Page pg_pice and its placement are hidden; se_main is hidden. Kafa leaves
    // every page, Pljeskavica and Ćevapi leave with the section.
    expect(summary(next, hiddenAll)).toEqual(counts({ removedArticles: 3, structural: { hidden: 3 } }));
  });
});

describe("summarizePublication: removed from a page vs deleted", () => {
  test("a placement taken off its section while the article stays is removedFromPage", () => {
    const next = edit(draft(), (d) => {
      d.placements = d.placements.filter((row) => row.articleKey !== "ar_kafa");
    });
    expect(summary(draft(), next)).toEqual(
      counts({ removedArticles: 1, structural: { removedFromPage: 1 } }),
    );
  });

  test("a deleted article is deleted, not removedFromPage", () => {
    const next = edit(draft(), (d) => {
      d.articles = d.articles.filter((row) => row.key !== "ar_kafa");
      d.placements = d.placements.filter((row) => row.articleKey !== "ar_kafa");
    });
    expect(summary(draft(), next)).toEqual(counts({ removedArticles: 1, structural: { deleted: 1 } }));
  });

  test("a deleted article whose placement row is still around is not removedFromPage either", () => {
    const next = edit(draft(), (d) => {
      d.articles = d.articles.filter((row) => row.key !== "ar_kafa");
    });
    // The orphan placement shows nothing (shownPlacements needs the article).
    expect(summary(draft(), next)).toEqual(counts({ removedArticles: 1, structural: { deleted: 1 } }));
  });

  test("an unplaced article that is deleted is deleted but not removed", () => {
    const before = draft({ articles: [...draft().articles, article("ar_orphan", "Čaj", 150)] });
    const next = edit(before, (d) => {
      d.articles = d.articles.filter((row) => row.key !== "ar_orphan");
    });
    expect(summary(before, next)).toEqual(counts({ structural: { deleted: 1 } }));
  });

  test("moving an article to another section is one removedFromPage and no removed article", () => {
    const before = edit(draft(), (d) => {
      d.sections.push(section("se_drinks", "pg_main", 2));
    });
    const next = edit(before, (d) => {
      placementOf(d, "se_main", "ar_kafa").sectionKey = "se_drinks";
    });
    expect(summary(before, next)).toEqual(counts({ structural: { removedFromPage: 1 } }));
  });
});

describe("summarizePublication: reordering", () => {
  test("swapping two placements inside a section is one reorder", () => {
    const next = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_pljeskavica").order = 2;
      placementOf(d, "se_main", "ar_cevapi").order = 1;
    });
    expect(summary(draft(), next)).toEqual(counts({ structural: { reordered: 1 } }));
  });

  test("sections inside a page: one reorder", () => {
    const before = edit(draft(), (d) => {
      d.sections.push(section("se_drinks", "pg_main", 2));
    });
    const next = edit(before, (d) => {
      find(d.sections, "se_main").order = 2;
      find(d.sections, "se_drinks").order = 1;
    });
    expect(summary(before, next)).toEqual(counts({ structural: { reordered: 1 } }));
  });

  test("pages: one reorder", () => {
    const before = edit(draft(), (d) => {
      d.pages.push(page("pg_pice", 2));
    });
    const next = edit(before, (d) => {
      find(d.pages, "pg_main").order = 2;
      find(d.pages, "pg_pice").order = 1;
    });
    expect(summary(before, next)).toEqual(counts({ structural: { reordered: 1 } }));
  });

  test("reorders in several containers are added up", () => {
    const before = edit(draft(), (d) => {
      d.pages.push(page("pg_pice", 2));
      d.sections.push(section("se_drinks", "pg_main", 2));
    });
    const next = edit(before, (d) => {
      find(d.pages, "pg_main").order = 2;
      find(d.pages, "pg_pice").order = 1;
      find(d.sections, "se_main").order = 2;
      find(d.sections, "se_drinks").order = 1;
      placementOf(d, "se_main", "ar_pljeskavica").order = 9;
    });
    expect(summary(before, next)).toEqual(counts({ structural: { reordered: 3 } }));
  });

  test("renumbering without changing the sequence is not a reorder", () => {
    const next = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_pljeskavica").order = 10;
      placementOf(d, "se_main", "ar_cevapi").order = 20;
      placementOf(d, "se_main", "ar_kafa").order = 30;
    });
    expect(summary(draft(), next)).toEqual(counts());
  });

  test("an article added in the middle is not a reorder", () => {
    const next = edit(draft(), (d) => {
      d.articles.push(article("ar_palacinke", "Palačinke", 300));
      d.placements.push(placement("pg_main", "se_main", "ar_palacinke", 1.5));
    });
    expect(summary(draft(), next)).toEqual(counts({ newArticles: 1 }));
  });

  test("an article removed from the middle is not a reorder", () => {
    const next = edit(draft(), (d) => {
      d.placements = d.placements.filter((row) => row.articleKey !== "ar_cevapi");
    });
    expect(summary(draft(), next)).toEqual(
      counts({ removedArticles: 1, structural: { removedFromPage: 1 } }),
    );
  });

  test("a section added or removed on its own is not a reorder", () => {
    const withExtra = edit(draft(), (d) => {
      d.sections.unshift(section("se_first", "pg_main", 0));
    });
    expect(summary(draft(), withExtra)).toEqual(counts());
    expect(summary(withExtra, draft())).toEqual(counts());
  });

  test("a page added or removed on its own is not a reorder", () => {
    const withExtra = edit(draft(), (d) => {
      d.pages.unshift(page("pg_first", 0));
    });
    expect(summary(draft(), withExtra)).toEqual(counts());
    expect(summary(withExtra, draft())).toEqual(counts());
  });

  test("an addition together with a swap counts only the swap", () => {
    const next = edit(draft(), (d) => {
      d.articles.push(article("ar_palacinke", "Palačinke", 300));
      d.placements.push(placement("pg_main", "se_main", "ar_palacinke", 0));
      placementOf(d, "se_main", "ar_pljeskavica").order = 3;
      placementOf(d, "se_main", "ar_kafa").order = 1;
    });
    expect(summary(draft(), next)).toEqual(counts({ newArticles: 1, structural: { reordered: 1 } }));
  });
});

describe("summarizePublication: inputs", () => {
  test("neither snapshot is mutated, even when its lists are out of order", () => {
    const scramble = (source: MenuDraftSnapshot) =>
      edit(source, (d) => {
        d.pages.reverse();
        d.sections.reverse();
        d.articles.reverse();
        d.placements.reverse();
        d.variants.reverse();
        d.roomService.items.reverse();
      });
    const before = scramble(
      edit(draft({ variants: VARIANTS }), (d) => {
        find(d.articles, "ar_pljeskavica").variantsEnabled = true;
        d.roomService.items.push(roomServiceItem("ar_kafa"), roomServiceItem("ar_cevapi"));
      }),
    );
    const next = scramble(
      edit(before, (d) => {
        find(d.articles, "ar_pljeskavica").basePriceRsd = 480;
        find(d.variants, "va_velika").priceRsd = 650;
        placementOf(d, "se_main", "ar_kafa").visibility = "hidden";
        d.roomService.items.reverse();
      }),
    );
    const beforeJson = JSON.stringify(before);
    const nextJson = JSON.stringify(next);
    const result = summarizePublication(before, next);
    expect(result.changedPrices).toBe(1);
    expect(JSON.stringify(before)).toBe(beforeJson);
    expect(JSON.stringify(next)).toBe(nextJson);
  });

  test("the order of the lists in the input does not change the result", () => {
    const next = edit(draft(), (d) => {
      placementOf(d, "se_main", "ar_pljeskavica").order = 2;
      placementOf(d, "se_main", "ar_cevapi").order = 1;
      find(d.articles, "ar_kafa").basePriceRsd = 200;
    });
    const scrambled = edit(next, (d) => {
      d.placements.reverse();
      d.articles.reverse();
    });
    expect(summarizePublication(draft(), scrambled)).toEqual(summarizePublication(draft(), next));
  });
});
