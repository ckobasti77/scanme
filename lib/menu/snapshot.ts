// ScanMe Menu V1 (K05) — the published version (K01 §3.3, recipe §6).
//
// PURE. Convex turns the draft rows into a MenuDraftSnapshot (every entity by
// its stable key, ids resolved to keys: convex/lib/menuDraftLoad.ts) and this
// module compiles it into the JSON parts of an immutable version:
//
//   internal  `_all`        the whole draft snapshot, for restoring a version
//                           and for the publish summary. No public query reads it.
//   public    `_splitter`   per language: visible pages, published languages,
//                           appearance, allergens on/off, Room service flag.
//   public    <pageKey>     per language and page: visible sections with the
//                           articles guests see, in order.
//   public    `_rs`         per language: Room service (only when published).
//
// The public parts NEVER carry hidden or archived pages, sections or
// placements, internal names (the default page's "Kompletan meni"), AI
// suggestions that were not confirmed, or articles of other pages. Text is
// resolved per language at compile time: a confirmed translation, else the
// source text (master §7.7). Prices stay whole dinars; promo activity is NOT
// decided here (the renderer calls promoStateAt with its own clock).
//
// Page parts are split by whole articles (a long section continues in the
// next part, `continued: true`); the internal part is split at character
// boundaries. Every part is ≤ MENU_VERSION_PART_MAX_BYTES of UTF-8.

import { addonBounds, normalizeAddonRules } from "./addons";
import { MENU_VERSION_PART_MAX_BYTES, utf8ByteLength } from "./budget";
import { checkPromo, isPromoScheduled, type MenuPromo } from "./promo";
import {
  MENU_DEFAULT_PRESENTATION,
  type MenuMediaMode,
  type MenuPresentationValues,
} from "./presentation";
import {
  roomServiceUnitPrice,
  type RoomServicePriceOrigin,
  type RoomServiceRule,
} from "./room-service-pricing";

export const MENU_SNAPSHOT_FORMAT = 1;
/** `lang` of the internal part. */
export const MENU_INTERNAL_LANG = "*";
export const MENU_PART_INTERNAL = "_all";
export const MENU_PART_SPLITTER = "_splitter";
export const MENU_PART_ROOM_SERVICE = "_rs";

// =============================================================================
// The internal snapshot: the whole draft by stable keys
// =============================================================================

export type MenuVisibility = "visible" | "hidden";
export type MenuPageNavigation = "standalone" | "back" | "shared";

export type SnapshotTranslationEntry = {
  name?: string;
  description?: string;
  publicTitle?: string;
  nameHash?: string;
  descriptionHash?: string;
  titleHash?: string;
  status: "confirmed" | "suggested";
};
export type SnapshotTranslations = Record<string, SnapshotTranslationEntry> | null;

export type SnapshotPage = {
  key: string;
  slug: string;
  name: string;
  publicTitle: string | null;
  isDefault: boolean;
  order: number;
  visibility: MenuVisibility;
  archivedAt: number | null;
  iconKey: string | null;
  navigation: MenuPageNavigation;
  translations: SnapshotTranslations;
};

export type SnapshotSection = {
  key: string;
  pageKey: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  order: number;
  visibility: MenuVisibility;
  translations: SnapshotTranslations;
};

export type SnapshotAllergens = {
  contains: string[];
  mayContain: string[];
  otherText: string | null;
};

export type SnapshotPriceCheck = {
  since: number;
  changedComponentKeys: string[];
  removedComponentNames: string[];
};

export type SnapshotArticle = {
  key: string;
  kind: "item" | "combo";
  name: string;
  description: string | null;
  quantityValue: number | null;
  quantityUnit: string | null;
  basePriceRsd: number | null;
  mediaMode: MenuMediaMode;
  imageMediaId: string | null;
  iconKey: string | null;
  variantsEnabled: boolean;
  addonsEnabled: boolean;
  noteEnabled: boolean;
  /** null = no record: UNKNOWN, never "safe" (master §7.3). */
  allergens: SnapshotAllergens | null;
  tags: string[] | null;
  promo: MenuPromo | null;
  priceCheck: SnapshotPriceCheck | null;
  translations: SnapshotTranslations;
};

export type SnapshotPlacement = {
  pageKey: string;
  sectionKey: string;
  articleKey: string;
  order: number;
  visibility: MenuVisibility;
};

export type SnapshotVariant = {
  key: string;
  articleKey: string;
  name: string;
  priceRsd: number | null;
  order: number;
  translations: SnapshotTranslations;
};

export type SnapshotAddonGroup = {
  key: string;
  name: string;
  selection: "single" | "multiple";
  required: boolean;
  minSelect: number | null;
  maxSelect: number | null;
  translations: SnapshotTranslations;
};

export type SnapshotAddonOption = {
  key: string;
  groupKey: string;
  name: string;
  priceDeltaRsd: number;
  order: number;
  translations: SnapshotTranslations;
};

export type SnapshotArticleAddonGroup = { articleKey: string; groupKey: string; order: number };

export type SnapshotComboComponent = {
  comboKey: string;
  componentKey: string;
  quantity: number;
  order: number;
};

export type SnapshotPriceWarning = {
  oldBaseRsd: number | null;
  newBaseRsd: number | null;
  at: number;
};

export type SnapshotRoomServiceCategory = {
  key: string;
  name: string;
  order: number;
  translations: SnapshotTranslations;
};

export type SnapshotRoomServiceItem = {
  articleKey: string;
  categoryKey: string;
  order: number;
  markupApplies: boolean;
  manualPriceRsd: number | null;
  priceWarning: SnapshotPriceWarning | null;
  manualVariantPrices:
    | { variantKey: string; priceRsd: number; priceWarning: SnapshotPriceWarning | null }[]
    | null;
};

export type SnapshotRoomServiceConfig = {
  markupBps: number | null;
  markupScope: "all" | "selected";
  deliveryFeeRsd: number | null;
};

export type SnapshotSettings = {
  languages: { source: string; translations: string[] } | null;
  /** null = never set (off). */
  allergensEnabled: boolean | null;
};

export type MenuDraftSnapshot = {
  formatVersion: typeof MENU_SNAPSHOT_FORMAT;
  settings: SnapshotSettings;
  /** null = no menuPresentation row (MENU_DEFAULT_PRESENTATION applies). */
  presentation: MenuPresentationValues | null;
  pages: SnapshotPage[];
  sections: SnapshotSection[];
  articles: SnapshotArticle[];
  placements: SnapshotPlacement[];
  variants: SnapshotVariant[];
  addonGroups: SnapshotAddonGroup[];
  addonOptions: SnapshotAddonOption[];
  articleAddonGroups: SnapshotArticleAddonGroup[];
  comboComponents: SnapshotComboComponent[];
  roomService: {
    config: SnapshotRoomServiceConfig | null;
    categories: SnapshotRoomServiceCategory[];
    items: SnapshotRoomServiceItem[];
  };
};

const byOrderThenKey = <T extends { order: number }>(keyOf: (row: T) => string) =>
  (a: T, b: T) => a.order - b.order || compareStrings(keyOf(a), keyOf(b));

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The same snapshot with every list in its canonical order, so equal drafts
 * give byte-equal JSON (the content hash, restore diffs, tests).
 */
export function sortSnapshot(snapshot: MenuDraftSnapshot): MenuDraftSnapshot {
  const grouped = <T>(rows: readonly T[], group: (row: T) => string, within: (a: T, b: T) => number) =>
    rows.slice().sort((a, b) => compareStrings(group(a), group(b)) || within(a, b));
  return {
    ...snapshot,
    pages: snapshot.pages.slice().sort(byOrderThenKey((row) => row.key)),
    sections: grouped(snapshot.sections, (row) => row.pageKey, byOrderThenKey((row) => row.key)),
    articles: snapshot.articles.slice().sort((a, b) => compareStrings(a.key, b.key)),
    placements: grouped(snapshot.placements, (row) => row.sectionKey, byOrderThenKey((row) => row.articleKey)),
    variants: grouped(snapshot.variants, (row) => row.articleKey, byOrderThenKey((row) => row.key)),
    addonGroups: snapshot.addonGroups.slice().sort((a, b) => compareStrings(a.key, b.key)),
    addonOptions: grouped(snapshot.addonOptions, (row) => row.groupKey, byOrderThenKey((row) => row.key)),
    articleAddonGroups: grouped(
      snapshot.articleAddonGroups,
      (row) => row.articleKey,
      byOrderThenKey((row) => row.groupKey),
    ),
    comboComponents: grouped(
      snapshot.comboComponents,
      (row) => row.comboKey,
      byOrderThenKey((row) => row.componentKey),
    ),
    roomService: {
      config: snapshot.roomService.config,
      categories: snapshot.roomService.categories.slice().sort(byOrderThenKey((row) => row.key)),
      items: grouped(snapshot.roomService.items, (row) => row.categoryKey, byOrderThenKey((row) => row.articleKey)),
    },
  };
}

// -----------------------------------------------------------------------------
// Canonical JSON and a small content hash
// -----------------------------------------------------------------------------

/** JSON with object keys sorted at every level (undefined members dropped). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) out[key] = canonicalize(member);
    }
    return out;
  }
  return value;
}

/** cyrb53: a fast 53-bit string hash as 14 hex digits. Not cryptographic. */
export function hashString(value: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(14, "0");
}

export function snapshotHash(snapshot: MenuDraftSnapshot): string {
  return hashString(canonicalJson(sortSnapshot(snapshot)));
}

// =============================================================================
// What guests see
// =============================================================================

export type PublicPageMeta = {
  key: string;
  slug: string;
  /** The public title in this language; null = no title (the default page has none). */
  title: string | null;
  isDefault: boolean;
  navigation: MenuPageNavigation;
  iconKey: string | null;
};

export type PublicVariant = { key: string; name: string; priceRsd: number };

export type PublicAddonGroup = {
  key: string;
  name: string;
  selection: "single" | "multiple";
  required: boolean;
  /** How many add-ons a guest must and may pick (lib/menu/addons.ts addonBounds). */
  minSelect: number;
  maxSelect: number;
  options: { key: string; name: string; priceDeltaRsd: number }[];
};

export type PublicArticle = {
  key: string;
  kind: "item" | "combo";
  name: string;
  description: string | null;
  quantityValue: number | null;
  quantityUnit: string | null;
  /** The shared base price (whole RSD); null when only variants carry prices. */
  priceRsd: number | null;
  variants: PublicVariant[];
  addonGroups: PublicAddonGroup[];
  noteEnabled: boolean;
  media: { mode: MenuMediaMode; imageMediaId: string | null; iconKey: string | null };
  /** null when the venue's allergen system is off OR the article has no record (unknown). */
  allergens: SnapshotAllergens | null;
  tags: string[];
  /** A valid, switched-on promotion; the renderer decides activity with promoStateAt. */
  promo: MenuPromo | null;
  combo: { components: { articleKey: string; name: string; quantity: number }[] } | null;
};

export type PublicSection = {
  key: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  articles: PublicArticle[];
};

export type PublicPageDoc = { page: PublicPageMeta; sections: PublicSection[] };

export type PublicSplitterDoc = {
  lang: string;
  sourceLang: string;
  /** Published languages, source first. */
  languages: string[];
  /** Visible, non-archived pages in order. */
  pages: PublicPageMeta[];
  presentation: MenuPresentationValues;
  allergensEnabled: boolean;
  /** A Room service part exists in this version (the live switch still decides). */
  roomService: boolean;
};

export type PublicRoomServiceArticle = Omit<PublicArticle, "variants" | "priceRsd"> & {
  priceRsd: number | null;
  priceOrigin: RoomServicePriceOrigin;
  variants: (PublicVariant & { priceOrigin: RoomServicePriceOrigin })[];
};

export type PublicRoomServiceDoc = {
  deliveryFeeRsd: number | null;
  categories: { key: string; name: string; articles: PublicRoomServiceArticle[] }[];
};

export type CompileContext = {
  /** Published languages, source first (publishedLanguages). */
  languages: readonly string[];
  /** The Room service part is published (switch on AND Premium). */
  roomService: boolean;
  /** Premium: a scheduled promotion stays scheduled; otherwise it is left out. */
  scheduledPromos: boolean;
};

export type PublishedLanguages = { source: string; languages: string[]; dropped: string[] };

/**
 * The languages a publication carries: the source and the translations the
 * plan allows, in the order of Settings. A Standard account above its limit
 * (lost Premium) publishes the first ones and drops the rest with a warning.
 */
export function publishedLanguages(
  settings: SnapshotSettings,
  maxLanguages: number,
): PublishedLanguages {
  const source = settings.languages?.source ?? "sr";
  const translations = (settings.languages?.translations ?? []).filter((lang) => lang !== source);
  const room = Math.max(0, maxLanguages - 1);
  return {
    source,
    languages: [source, ...translations.slice(0, room)],
    dropped: translations.slice(room),
  };
}

type TextField = "name" | "description" | "publicTitle";

/** A confirmed translation of one field, else null. Suggested (AI) text is never published. */
export function confirmedTranslation(
  translations: SnapshotTranslations,
  lang: string,
  field: TextField,
): string | null {
  const entry = translations?.[lang];
  if (!entry || entry.status !== "confirmed") return null;
  const value = entry[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function localized(
  source: string | null,
  translations: SnapshotTranslations,
  lang: string,
  sourceLang: string,
  field: TextField,
): string | null {
  if (source === null) return null;
  if (lang === sourceLang) return source;
  return confirmedTranslation(translations, lang, field) ?? source;
}

/** Indexes of one snapshot, built once per compile. */
export type SnapshotIndex = {
  pages: Map<string, SnapshotPage>;
  sections: Map<string, SnapshotSection>;
  articles: Map<string, SnapshotArticle>;
  groups: Map<string, SnapshotAddonGroup>;
  variantsByArticle: Map<string, SnapshotVariant[]>;
  optionsByGroup: Map<string, SnapshotAddonOption[]>;
  groupsByArticle: Map<string, SnapshotArticleAddonGroup[]>;
  componentsByCombo: Map<string, SnapshotComboComponent[]>;
  placementsBySection: Map<string, SnapshotPlacement[]>;
  sectionsByPage: Map<string, SnapshotSection[]>;
};

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export function indexSnapshot(input: MenuDraftSnapshot): SnapshotIndex {
  const snapshot = sortSnapshot(input);
  return {
    pages: new Map(snapshot.pages.map((row) => [row.key, row])),
    sections: new Map(snapshot.sections.map((row) => [row.key, row])),
    articles: new Map(snapshot.articles.map((row) => [row.key, row])),
    groups: new Map(snapshot.addonGroups.map((row) => [row.key, row])),
    variantsByArticle: groupBy(snapshot.variants, (row) => row.articleKey),
    optionsByGroup: groupBy(snapshot.addonOptions, (row) => row.groupKey),
    groupsByArticle: groupBy(snapshot.articleAddonGroups, (row) => row.articleKey),
    componentsByCombo: groupBy(snapshot.comboComponents, (row) => row.comboKey),
    placementsBySection: groupBy(snapshot.placements, (row) => row.sectionKey),
    sectionsByPage: groupBy(snapshot.sections, (row) => row.pageKey),
  };
}

export function isPagePublic(page: SnapshotPage): boolean {
  return page.visibility === "visible" && page.archivedAt === null;
}

/** Placements guests see on one page, by section, in order (visible all the way up). */
export function shownPlacements(
  index: SnapshotIndex,
  page: SnapshotPage,
): { section: SnapshotSection; placements: SnapshotPlacement[] }[] {
  if (!isPagePublic(page)) return [];
  const out: { section: SnapshotSection; placements: SnapshotPlacement[] }[] = [];
  for (const section of index.sectionsByPage.get(page.key) ?? []) {
    if (section.visibility !== "visible") continue;
    const placements = (index.placementsBySection.get(section.key) ?? []).filter(
      (placement) =>
        placement.visibility === "visible" &&
        placement.pageKey === page.key &&
        index.articles.has(placement.articleKey),
    );
    out.push({ section, placements });
  }
  return out;
}

/** The promotion as guests get it: switched on, applicable, and scheduled only with Premium. */
function publicPromo(
  article: SnapshotArticle,
  variants: readonly SnapshotVariant[],
  context: CompileContext,
): MenuPromo | null {
  const promo = article.promo;
  if (!promo || !promo.active) return null;
  const valid = checkPromo(promo, {
    basePriceRsd: article.basePriceRsd,
    variantsEnabled: article.variantsEnabled,
    variants: article.variantsEnabled
      ? variants.map((variant) => ({ key: variant.key, priceRsd: variant.priceRsd }))
      : [],
  });
  if (!valid) return null;
  // Without Premium a scheduled promotion is not published at all: the
  // regular price shows (never an always-on promo nobody scheduled that way).
  if (isPromoScheduled(valid) && !context.scheduledPromos) return null;
  return valid;
}

export function compileArticle(
  index: SnapshotIndex,
  article: SnapshotArticle,
  lang: string,
  sourceLang: string,
  allergensEnabled: boolean,
  context: CompileContext,
): PublicArticle {
  const text = (value: string | null, translations: SnapshotTranslations, field: TextField) =>
    localized(value, translations, lang, sourceLang, field);
  const variantRows = index.variantsByArticle.get(article.key) ?? [];
  const variants: PublicVariant[] = article.variantsEnabled
    ? variantRows.flatMap((variant) => {
        const priceRsd = variant.priceRsd ?? article.basePriceRsd;
        if (priceRsd === null) return [];
        return [{ key: variant.key, name: text(variant.name, variant.translations, "name") ?? variant.name, priceRsd }];
      })
    : [];

  const addonGroups: PublicAddonGroup[] = [];
  if (article.addonsEnabled) {
    for (const link of index.groupsByArticle.get(article.key) ?? []) {
      const group = index.groups.get(link.groupKey);
      if (!group) continue;
      const options = (index.optionsByGroup.get(group.key) ?? []).map((option) => ({
        key: option.key,
        name: text(option.name, option.translations, "name") ?? option.name,
        priceDeltaRsd: option.priceDeltaRsd,
      }));
      if (options.length === 0) continue;
      const rules = normalizeAddonRules(group) ?? {
        selection: group.selection,
        required: group.required,
      };
      const bounds = addonBounds(rules, options.length);
      addonGroups.push({
        key: group.key,
        name: text(group.name, group.translations, "name") ?? group.name,
        selection: group.selection,
        required: group.required,
        minSelect: bounds.min,
        maxSelect: bounds.max,
        options,
      });
    }
  }

  const combo =
    article.kind === "combo"
      ? {
          components: (index.componentsByCombo.get(article.key) ?? []).flatMap((component) => {
            const part = index.articles.get(component.componentKey);
            if (!part) return [];
            return [
              {
                articleKey: part.key,
                name: text(part.name, part.translations, "name") ?? part.name,
                quantity: component.quantity,
              },
            ];
          }),
        }
      : null;

  return {
    key: article.key,
    kind: article.kind,
    name: text(article.name, article.translations, "name") ?? article.name,
    description: text(article.description, article.translations, "description"),
    quantityValue: article.quantityValue,
    quantityUnit: article.quantityUnit,
    priceRsd: article.basePriceRsd,
    variants,
    addonGroups,
    noteEnabled: article.noteEnabled,
    media: {
      mode: article.mediaMode,
      imageMediaId: article.mediaMode === "image" ? article.imageMediaId : null,
      iconKey: article.iconKey,
    },
    allergens: allergensEnabled ? article.allergens : null,
    tags: article.tags ?? [],
    promo: publicPromo(article, variantRows, context),
    combo,
  };
}

function pageMeta(page: SnapshotPage, lang: string, sourceLang: string): PublicPageMeta {
  return {
    key: page.key,
    slug: page.slug,
    title: localized(page.publicTitle, page.translations, lang, sourceLang, "publicTitle"),
    isDefault: page.isDefault,
    navigation: page.navigation,
    iconKey: page.iconKey,
  };
}

/** One page as guests read it in one language. Sections without a shown article are left out. */
export function compilePage(
  index: SnapshotIndex,
  page: SnapshotPage,
  lang: string,
  sourceLang: string,
  allergensEnabled: boolean,
  context: CompileContext,
): PublicPageDoc {
  const sections: PublicSection[] = [];
  for (const { section, placements } of shownPlacements(index, page)) {
    if (placements.length === 0) continue;
    sections.push({
      key: section.key,
      name: localized(section.name, section.translations, lang, sourceLang, "name") ?? section.name,
      description: localized(section.description, section.translations, lang, sourceLang, "description"),
      iconKey: section.iconKey,
      articles: placements.map((placement) =>
        compileArticle(
          index,
          index.articles.get(placement.articleKey) as SnapshotArticle,
          lang,
          sourceLang,
          allergensEnabled,
          context,
        ),
      ),
    });
  }
  return { page: pageMeta(page, lang, sourceLang), sections };
}

export function compileRoomService(
  snapshot: MenuDraftSnapshot,
  index: SnapshotIndex,
  lang: string,
  sourceLang: string,
  allergensEnabled: boolean,
  context: CompileContext,
): PublicRoomServiceDoc {
  const { config, categories, items } = sortSnapshot(snapshot).roomService;
  const rule: RoomServiceRule = {
    markupBps: config?.markupBps ?? 0,
    markupScope: config?.markupScope ?? "all",
  };
  const itemsByCategory = groupBy(items, (item) => item.categoryKey);
  const out: PublicRoomServiceDoc["categories"] = [];
  for (const category of categories) {
    const articles: PublicRoomServiceArticle[] = [];
    for (const item of itemsByCategory.get(category.key) ?? []) {
      const article = index.articles.get(item.articleKey);
      if (!article) continue;
      const base = compileArticle(index, article, lang, sourceLang, allergensEnabled, context);
      const price = roomServiceUnitPrice(rule, {
        basePriceRsd: article.basePriceRsd,
        markupApplies: item.markupApplies,
        manualPriceRsd: item.manualPriceRsd,
      });
      const variants = base.variants.map((variant) => {
        const own = (index.variantsByArticle.get(article.key) ?? []).find((row) => row.key === variant.key);
        const manual = item.manualVariantPrices?.find((row) => row.variantKey === variant.key);
        const variantPrice = roomServiceUnitPrice(rule, {
          basePriceRsd: own?.priceRsd ?? article.basePriceRsd,
          markupApplies: item.markupApplies,
          manualPriceRsd: manual?.priceRsd ?? null,
        });
        return {
          key: variant.key,
          name: variant.name,
          priceRsd: variantPrice.priceRsd ?? variant.priceRsd,
          priceOrigin: variantPrice.origin,
        };
      });
      articles.push({ ...base, priceRsd: price.priceRsd, priceOrigin: price.origin, variants });
    }
    if (articles.length === 0) continue;
    out.push({
      key: category.key,
      name: localized(category.name, category.translations, lang, sourceLang, "name") ?? category.name,
      articles,
    });
  }
  return { deliveryFeeRsd: config?.deliveryFeeRsd ?? null, categories: out };
}

// =============================================================================
// Parts
// =============================================================================

export type CompiledPart = {
  scope: "public" | "internal";
  lang: string;
  pageKey: string;
  part: number;
  data: string;
  bytes: number;
};

type PagePartJson = {
  page?: PublicPageMeta;
  sections: (Omit<PublicSection, "articles"> & { continued: boolean; articles: PublicArticle[] })[];
};

/**
 * Splits a page into parts of ≤ maxBytes by WHOLE articles: a section that
 * does not fit continues in the next part with `continued: true`. Part 0
 * carries the page meta. A single article larger than a part is an error
 * (it cannot happen within the text limits of lib/menu/limits.ts).
 */
export function chunkPage(doc: PublicPageDoc, maxBytes: number = MENU_VERSION_PART_MAX_BYTES): string[] {
  type Fragment = PagePartJson["sections"][number];
  const size = (value: unknown) => utf8ByteLength(JSON.stringify(value));
  const parts: string[] = [];
  let current: PagePartJson = { page: doc.page, sections: [] };
  // Running estimate of JSON.stringify(current): every array element adds
  // its own size plus one comma, so the estimate never undercounts.
  let bytes = size(current);
  const flush = () => {
    parts.push(JSON.stringify(current));
    current = { sections: [] };
    bytes = size(current);
  };
  const open = (head: Omit<Fragment, "continued" | "articles">, continued: boolean): Fragment => {
    const fragment: Fragment = { ...head, continued, articles: [] };
    current.sections.push(fragment);
    bytes += size(fragment) + 1;
    return fragment;
  };

  for (const section of doc.sections) {
    const head = {
      key: section.key,
      name: section.name,
      description: section.description,
      iconKey: section.iconKey,
    };
    const headBytes = size({ ...head, continued: false, articles: [] }) + 1;
    if (bytes + headBytes > maxBytes && current.sections.length > 0) flush();
    let fragment = open(head, false);
    for (const article of section.articles) {
      const articleBytes = size(article) + 1;
      if (bytes + articleBytes > maxBytes) {
        if (fragment.articles.length === 0 && current.sections.length > 1) {
          // The empty fragment just opened here moves to the next part.
          current.sections.pop();
          flush();
          fragment = open(head, false);
        } else {
          flush();
          fragment = open(head, true);
        }
        if (bytes + articleBytes > maxBytes) {
          throw new Error("menu snapshot: one article is larger than a version part");
        }
      }
      fragment.articles.push(article);
      bytes += articleBytes;
    }
  }
  parts.push(JSON.stringify(current));
  return parts;
}

/** Merges the parts of one page back into the page (continued sections are joined). */
export function parsePublicPage(parts: readonly string[]): PublicPageDoc | null {
  let page: PublicPageMeta | null = null;
  const sections: PublicSection[] = [];
  for (const data of parts) {
    const json = JSON.parse(data) as PagePartJson;
    if (json.page) page = json.page;
    for (const fragment of json.sections) {
      const last = sections[sections.length - 1];
      if (fragment.continued && last && last.key === fragment.key) {
        last.articles.push(...fragment.articles);
        continue;
      }
      sections.push({
        key: fragment.key,
        name: fragment.name,
        description: fragment.description,
        iconKey: fragment.iconKey,
        articles: fragment.articles.slice(),
      });
    }
  }
  return page ? { page, sections } : null;
}

/** Splits a string into pieces of ≤ maxBytes UTF-8, never inside a code point. */
export function splitUtf8(value: string, maxBytes: number = MENU_VERSION_PART_MAX_BYTES): string[] {
  const pieces: string[] = [];
  let start = 0;
  let bytes = 0;
  let index = 0;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    let width = 1;
    let size: number;
    if (code < 0x80) size = 1;
    else if (code < 0x800) size = 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        size = 4;
        width = 2;
      } else size = 3;
    } else size = 3;
    if (bytes + size > maxBytes && index > start) {
      pieces.push(value.slice(start, index));
      start = index;
      bytes = 0;
    }
    bytes += size;
    index += width;
  }
  pieces.push(value.slice(start));
  return pieces;
}

export function parseInternal(parts: readonly string[]): MenuDraftSnapshot {
  const snapshot = JSON.parse(parts.join("")) as MenuDraftSnapshot;
  if (snapshot.formatVersion !== MENU_SNAPSHOT_FORMAT) {
    throw new Error(`menu snapshot: unsupported format ${String(snapshot.formatVersion)}`);
  }
  return snapshot;
}

export type CompiledVersion = {
  parts: CompiledPart[];
  bytes: number;
  languages: string[];
  publicPageCount: number;
  publicArticleCount: number;
  contentHash: string;
  /** Hash of every public part: what guests get from this version. */
  publicHash: string;
};

function part(scope: CompiledPart["scope"], lang: string, pageKey: string, index: number, data: string): CompiledPart {
  return { scope, lang, pageKey, part: index, data, bytes: utf8ByteLength(data) };
}

/** The whole version: internal parts, then per language the splitter, the pages and Room service. */
export function compileSnapshot(input: MenuDraftSnapshot, context: CompileContext): CompiledVersion {
  const snapshot = sortSnapshot(input);
  const index = indexSnapshot(snapshot);
  const sourceLang = context.languages[0] ?? snapshot.settings.languages?.source ?? "sr";
  const allergensEnabled = snapshot.settings.allergensEnabled === true;
  const presentation = snapshot.presentation ?? MENU_DEFAULT_PRESENTATION;
  const publicPages = snapshot.pages.filter(isPagePublic);

  const internalJson = JSON.stringify(snapshot);
  const parts: CompiledPart[] = splitUtf8(internalJson).map((data, i) =>
    part("internal", MENU_INTERNAL_LANG, MENU_PART_INTERNAL, i, data),
  );

  const shownArticles = new Set<string>();
  for (const page of publicPages) {
    for (const { placements } of shownPlacements(index, page)) {
      for (const placement of placements) shownArticles.add(placement.articleKey);
    }
  }
  const roomService =
    context.roomService && snapshot.roomService.items.some((item) => index.articles.has(item.articleKey));
  if (roomService) {
    for (const item of snapshot.roomService.items) {
      if (index.articles.has(item.articleKey)) shownArticles.add(item.articleKey);
    }
  }

  for (const lang of context.languages) {
    const splitter: PublicSplitterDoc = {
      lang,
      sourceLang,
      languages: [...context.languages],
      pages: publicPages.map((page) => pageMeta(page, lang, sourceLang)),
      presentation,
      allergensEnabled,
      roomService,
    };
    parts.push(part("public", lang, MENU_PART_SPLITTER, 0, JSON.stringify(splitter)));
    for (const page of publicPages) {
      const doc = compilePage(index, page, lang, sourceLang, allergensEnabled, context);
      chunkPage(doc).forEach((data, i) => parts.push(part("public", lang, page.key, i, data)));
    }
    if (roomService) {
      const doc = compileRoomService(snapshot, index, lang, sourceLang, allergensEnabled, context);
      splitUtf8(JSON.stringify(doc)).forEach((data, i) =>
        parts.push(part("public", lang, MENU_PART_ROOM_SERVICE, i, data)),
      );
    }
  }

  return {
    parts,
    bytes: parts.reduce((sum, row) => sum + row.bytes, 0),
    languages: [...context.languages],
    publicPageCount: publicPages.length,
    publicArticleCount: shownArticles.size,
    contentHash: hashString(canonicalJson(snapshot)),
    publicHash: hashString(
      parts
        .filter((row) => row.scope === "public")
        .map((row) => `${row.lang}|${row.pageKey}|${row.part}|${row.data}`)
        .join("\n"),
    ),
  };
}

export function parseSplitter(data: string): PublicSplitterDoc {
  return JSON.parse(data) as PublicSplitterDoc;
}

export function parseRoomService(parts: readonly string[]): PublicRoomServiceDoc {
  return JSON.parse(parts.join("")) as PublicRoomServiceDoc;
}
