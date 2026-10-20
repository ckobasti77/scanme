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

/** K20 — positions (tables, rooms, other) per Menu service, archived excluded (master §9). */
export const MENU_MAX_POSITIONS = 500;
/** K20 — active zones per Menu service (master §9.3: zones are optional). */
export const MENU_MAX_ZONES = 30;
/** K20 — positions one call may create ("Dodaj stolove 1–20") or lay out. */
export const MENU_MAX_POSITION_BATCH = 100;
/** K20 — Menu QR cards of one business read by the Lokal i QR section. */
export const MENU_MAX_QR_CARDS = 500;
/** K20 — Menu QR cards minted by one call. */
export const MENU_MAX_QR_MINT_BATCH = 50;
/** K20 — seats of one position (master §9.2: optional). */
export const MENU_MAX_SEATS = 99;

/** K21 — lines of one order sent to the waiter (plan K19-8). */
export const MENU_MAX_CART_LINES = 30;
/** K21 — quantity of one cart line. */
export const MENU_MAX_CART_QUANTITY = 50;
/** K21 — different standard pages one order may draw articles from (bounded reads of the version). */
export const MENU_MAX_CART_PAGES = 5;
/** K21 — add-ons picked on one cart line (≤ MENU_MAX_ADDON_GROUPS_PER_ARTICLE × a few options). */
export const MENU_MAX_CART_ADDONS = 20;
/** K21 — orders of one position still `Novi` (waiting for the waiter); one more is refused (flood guard). */
export const MENU_MAX_OPEN_ORDERS_PER_POSITION = 5;
/** K21 — orders of one guest device still `Novi` in one venue. */
export const MENU_MAX_OPEN_ORDERS_PER_DEVICE = 3;
/** K21 — an open call or bill is returned instead of a new one only while it is this recent (a forgotten one never blocks the table). */
export const MENU_REQUEST_DEDUPE_MS = 30 * 60 * 1000;
/** K21 — the guest's own requests "Moji zahtevi" lists (newest first). */
export const MENU_MAX_MY_REQUESTS = 20;

/** K22 — active staff members (PIN identities) of one Menu service. */
export const MENU_MAX_STAFF = 100;
/** K22 — requests of ONE status the waiter panel reads (`Novi`, `Prihvaćen`); more = `truncated`. */
export const MENU_MAX_ACTIVE_REQUESTS = 300;
/** K22 — the last cancelled requests the waiter panel reads (to tell the waiter "Gost je otkazao"). */
export const MENU_MAX_RECENT_CANCELLED = 20;
/** K22 — other open requests of the same position shown in a request detail ("Ostalo na ovom stolu"). */
export const MENU_MAX_OTHERS_ON_POSITION = 20;
/** K22 — live staff sessions one sweep (panel code change, PIN reset) ends in one transaction. */
export const MENU_MAX_STAFF_SESSIONS_ENDED = 500;

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
  // K20
  zoneName: 60,
  positionLabel: 40,
  // K21 — the guest's free note on a cart line (only where the article has the note on).
  cartLineNote: 280,
  // K22 — the name of a staff member as the waiter panel shows it ("Ana", "Marko I.").
  staffName: 40,
} as const;

/** Whole dinars; inclusive upper bound of any single price. */
export const MENU_MAX_PRICE_RSD = 1_000_000;
/** Quantity value (e.g. 0.33 l, 250 g). */
export const MENU_MAX_QUANTITY = 100_000;
