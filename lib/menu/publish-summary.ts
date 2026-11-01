// ScanMe Menu V1 — the consequences of a publication (master spec: "broj
// izmenjenih cena, novih i uklonjenih artikala, strukturnih izmena").
//
// PURE. It compares the draft that is about to go live (`next`) with the draft
// snapshot of the version that is live now (`previous`, null on the first
// publication) and counts what guests will notice:
//
//   changedPrices    articles that stay on the menu (shown, or in Room service)
//                    and whose price signature changed: the base price, the
//                    variant prices (only while variants are on) or the Room
//                    service prices.
//   newArticles      articles shown to guests now and not before.
//   removedArticles  articles shown to guests before and not now (hidden,
//                    taken off a page, or deleted).
//   structural       hidden / removed from a page / deleted / reordered.
//
// "Shown" is exactly what the compiler publishes (shownPlacements in
// ./snapshot): a visible placement in a visible section of a public page.
// Inputs are never mutated; the snapshots are sorted into canonical copies.

import {
  canonicalJson,
  indexSnapshot,
  isPagePublic,
  shownPlacements,
  sortSnapshot,
  type MenuDraftSnapshot,
  type SnapshotIndex,
  type SnapshotRoomServiceItem,
} from "./snapshot";

export type MenuPublishSummary = {
  changedPrices: number;
  newArticles: number;
  removedArticles: number;
  structural: { hidden: number; removedFromPage: number; deleted: number; reordered: number };
};

export type MenuPublishPriceChange = {
  articleKey: string;
  name: string;
  before: number | null;
  after: number | null;
};

export type MenuPublishSummaryDetail = MenuPublishSummary & {
  priceChanges: MenuPublishPriceChange[];
};

/** How many price changes the detail lists (the count stays exact). */
export const MENU_SUMMARY_PRICE_SAMPLE = 20;

export const EMPTY_PUBLISH_SUMMARY: MenuPublishSummary = {
  changedPrices: 0,
  newArticles: 0,
  removedArticles: 0,
  structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
};

/** Only the counts (what menuVersions.summary stores). */
export function summaryCounts(detail: MenuPublishSummaryDetail): MenuPublishSummary {
  return {
    changedPrices: detail.changedPrices,
    newArticles: detail.newArticles,
    removedArticles: detail.removedArticles,
    structural: {
      hidden: detail.structural.hidden,
      removedFromPage: detail.structural.removedFromPage,
      deleted: detail.structural.deleted,
      reordered: detail.structural.reordered,
    },
  };
}

type Prepared = {
  snapshot: MenuDraftSnapshot;
  index: SnapshotIndex;
  shown: Set<string>;
  roomService: Map<string, SnapshotRoomServiceItem>;
};

function prepare(input: MenuDraftSnapshot): Prepared {
  const snapshot = sortSnapshot(input);
  const index = indexSnapshot(snapshot);
  const shown = new Set<string>();
  for (const page of snapshot.pages) {
    for (const { placements } of shownPlacements(index, page)) {
      for (const placement of placements) shown.add(placement.articleKey);
    }
  }
  const roomService = new Map<string, SnapshotRoomServiceItem>();
  for (const item of snapshot.roomService.items) {
    if (!roomService.has(item.articleKey)) roomService.set(item.articleKey, item);
  }
  return { snapshot, index, shown, roomService };
}

type KeyedPrice = [key: string, priceRsd: number | null];

function sortedPairs(pairs: KeyedPrice[]): KeyedPrice[] {
  return pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Everything about one article's price that a guest could see, as canonical JSON. */
function priceSignature(articleKey: string, side: Prepared): string {
  const article = side.index.articles.get(articleKey);
  if (!article) return canonicalJson(null);
  const variants = article.variantsEnabled
    ? sortedPairs(
        (side.index.variantsByArticle.get(articleKey) ?? []).map((variant): KeyedPrice => [
          variant.key,
          variant.priceRsd,
        ]),
      )
    : null;
  const item = side.roomService.get(articleKey);
  const rs = item
    ? {
        manual: item.manualPriceRsd,
        variants: sortedPairs(
          (item.manualVariantPrices ?? []).map((row): KeyedPrice => [row.variantKey, row.priceRsd]),
        ),
      }
    : null;
  return canonicalJson({ base: article.basePriceRsd, variants, rs });
}

/** The members of `list` that `other` also has, in the order of `list`. */
function common(list: readonly string[], other: readonly string[]): string[] {
  const keys = new Set(other);
  return list.filter((key) => keys.has(key));
}

/** True when the members present in both lists come in a different order. */
function reordered(before: readonly string[], after: readonly string[]): boolean {
  const left = common(before, after);
  const right = common(after, before);
  return left.length !== right.length || left.some((key, position) => key !== right[position]);
}

function compareChanges(a: MenuPublishPriceChange, b: MenuPublishPriceChange): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.articleKey < b.articleKey ? -1 : a.articleKey > b.articleKey ? 1 : 0;
}

export function summarizePublication(
  previous: MenuDraftSnapshot | null,
  next: MenuDraftSnapshot,
): MenuPublishSummaryDetail {
  const after = prepare(next);

  // First publication: every shown article is new, nothing else can have changed.
  if (previous === null) {
    return {
      changedPrices: 0,
      newArticles: after.shown.size,
      removedArticles: 0,
      structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
      priceChanges: [],
    };
  }

  const before = prepare(previous);

  let newArticles = 0;
  for (const key of after.shown) if (!before.shown.has(key)) newArticles += 1;
  let removedArticles = 0;
  for (const key of before.shown) if (!after.shown.has(key)) removedArticles += 1;

  // Price changes: articles on both sides that are on the menu now.
  const changes: MenuPublishPriceChange[] = [];
  for (const article of after.snapshot.articles) {
    const old = before.index.articles.get(article.key);
    if (!old) continue;
    if (!after.shown.has(article.key) && !after.roomService.has(article.key)) continue;
    if (priceSignature(article.key, before) === priceSignature(article.key, after)) continue;
    changes.push({
      articleKey: article.key,
      name: article.name,
      before: old.basePriceRsd,
      after: article.basePriceRsd,
    });
  }
  changes.sort(compareChanges);

  // Structural: deleted articles and placements taken off a page.
  let deleted = 0;
  for (const article of before.snapshot.articles) {
    if (!after.index.articles.has(article.key)) deleted += 1;
  }
  const nextPlacements = new Map(
    after.snapshot.placements.map((row) => [`${row.sectionKey}|${row.articleKey}`, row]),
  );
  let removedFromPage = 0;
  let hidden = 0;
  for (const row of before.snapshot.placements) {
    const now = nextPlacements.get(`${row.sectionKey}|${row.articleKey}`);
    if (!now) {
      if (after.index.articles.has(row.articleKey)) removedFromPage += 1;
    } else if (row.visibility === "visible" && now.visibility === "hidden") {
      hidden += 1;
    }
  }
  for (const section of before.snapshot.sections) {
    const now = after.index.sections.get(section.key);
    if (now && section.visibility === "visible" && now.visibility === "hidden") hidden += 1;
  }
  for (const page of before.snapshot.pages) {
    const now = after.index.pages.get(page.key);
    if (now && isPagePublic(page) && !isPagePublic(now)) hidden += 1;
  }

  // Structural: order of the members present on both sides.
  let reorderedCount = 0;
  const pageKeysBefore = before.snapshot.pages.map((page) => page.key);
  const pageKeysAfter = after.snapshot.pages.map((page) => page.key);
  if (reordered(pageKeysBefore, pageKeysAfter)) reorderedCount += 1;
  for (const pageKey of common(pageKeysBefore, pageKeysAfter)) {
    const sectionsBefore = (before.index.sectionsByPage.get(pageKey) ?? []).map((row) => row.key);
    const sectionsAfter = (after.index.sectionsByPage.get(pageKey) ?? []).map((row) => row.key);
    if (reordered(sectionsBefore, sectionsAfter)) reorderedCount += 1;
  }
  for (const sectionKey of before.index.sections.keys()) {
    if (!after.index.sections.has(sectionKey)) continue;
    const articlesBefore = (before.index.placementsBySection.get(sectionKey) ?? []).map(
      (row) => row.articleKey,
    );
    const articlesAfter = (after.index.placementsBySection.get(sectionKey) ?? []).map(
      (row) => row.articleKey,
    );
    if (reordered(articlesBefore, articlesAfter)) reorderedCount += 1;
  }

  return {
    changedPrices: changes.length,
    newArticles,
    removedArticles,
    structural: { hidden, removedFromPage, deleted, reordered: reorderedCount },
    priceChanges: changes.slice(0, MENU_SUMMARY_PRICE_SAMPLE),
  };
}
