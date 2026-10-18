// ScanMe Menu V1 — technical ceilings (K01 §3.1, §3.3). These are NOT
// commercial limits (master §3.2: standard pages have no commercial limit);
// they keep every Convex transaction and the public read inside its budget.

/** Articles per Menu service (the legacy import ceiling, docs/perf/menu-publish-ceiling.md). */
export const MENU_MAX_ARTICLES = 2000;
/** Standard pages per Menu service, archived included. */
export const MENU_MAX_PAGES = 50;
/** Sections on one page. */
export const MENU_MAX_SECTIONS_PER_PAGE = 100;
/** Placements (article appearances) on one page. */
export const MENU_MAX_PLACEMENTS_PER_PAGE = 4000;
/** QR links read when checking whether a page may be deleted or archived. */
export const MENU_MAX_QR_LINKS_PER_PAGE = 500;

/** Room service categories per Menu service (K03). An article is in Room service at most once, so items are bounded by MENU_MAX_ARTICLES. */
export const MENU_MAX_ROOM_SERVICE_CATEGORIES = 100;
/** Ids accepted by one Room service bulk call (add articles, markup selection). */
export const MENU_MAX_ROOM_SERVICE_BATCH = 200;

/** K04 — variants of one article (master §5.7: the guest picks one). */
export const MENU_MAX_VARIANTS_PER_ARTICLE = 20;
/** K04 — add-on groups attached to one article. */
export const MENU_MAX_ADDON_GROUPS_PER_ARTICLE = 10;
/** K04 — options inside one add-on group. */
export const MENU_MAX_ADDON_OPTIONS_PER_GROUP = 30;
/** K04 — add-on groups per Menu service (linked groups are shared, so few are needed). */
export const MENU_MAX_ADDON_GROUPS = 500;
/** K04 — articles one call may touch ("Primeni i na druge artikle", the impact list). */
export const MENU_MAX_ARTICLE_BATCH = 200;
/** K04 — components of one combo. */
export const MENU_MAX_COMBO_COMPONENTS = 20;
/** K04 — quantity of one combo component (e.g. 2 × Pivo). */
export const MENU_MAX_COMBO_QUANTITY = 20;
/** K04 — combos re-flagged by one component price change (bounded fan-out). */
export const MENU_MAX_COMBOS_PER_COMPONENT = 200;
/** K04 — placements of one article read by the deletion impact (pages × sections). */
export const MENU_MAX_PLACEMENTS_PER_ARTICLE = 1000;
/** K04 — tags (oznake) on one article. */
export const MENU_MAX_TAGS_PER_ARTICLE = 12;
/** K11 — articles or placements one `Izaberi više` action may touch (menuBulk). */
export const MENU_MAX_BULK_BATCH = 200;

/** Text lengths, in characters after whitespace cleaning. */
export const MENU_TEXT = {
  pageName: 80,
  pagePublicTitle: 80,
  sectionName: 80,
  sectionDescription: 300,
  articleName: 120,
  articleDescription: 600,
  quantityUnit: 20,
  iconKey: 60,
  roomServiceCategoryName: 80,
  // K04
  variantName: 60,
  addonGroupName: 80,
  addonOptionName: 60,
  allergenOtherText: 200,
} as const;

/** Whole dinars; inclusive upper bound of any single price. */
export const MENU_MAX_PRICE_RSD = 1_000_000;
/** Quantity value (e.g. 0.33 l, 250 g). */
export const MENU_MAX_QUANTITY = 100_000;
