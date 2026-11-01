// ScanMe Menu V1 (K06) — the legacy menu → new model mapping (recipe §12,
// master §6.2–§6.3). Pure: the Convex layer reads the legacy source (the
// inline draft `menus.draftModel`, or the live generation when there is no
// draft) and the target draft, and this module decides what to write and
// what the operator has to check.
//
//   legacy group            → section on the default page ("Kompletan meni")
//   legacy item             → article + placement (no price on the placement)
//   item.priceRsd           → basePriceRsd (whole dinars)
//   variants                → menuVariants + variantsEnabled
//   iconKey / productType   → iconKey, mediaMode "icon" (the legacy renderer
//                             always shows a glyph)
//   photoStorageId          → legacyPhotoStorageId (K15 turns it into an image)
//   available: false        → a menuAvailability row (live)
//   video, "Ide uz", dayparts, group shapes → reported as not mapped
//
// Keys are DERIVED from the legacy ids (legacyKey), so the same source always
// yields the same keys: a second run finds every key and writes nothing, and
// a batch that crashed is simply run again. Nothing here merges duplicates:
// two legacy items with the same name stay two articles and are reported, the
// operator decides (master §6.2 step 3).

import {
  MENU_MIGRATION_MANUAL_CHECKS,
  type MenuMigrationBlocker,
  type MenuMigrationDifference,
  type MenuMigrationManualCheck,
  type MenuMigrationWarning,
} from "./errors/migration";
import { MENU_KEY_PREFIX } from "./keys";
import {
  MENU_MAX_ARTICLES,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_SECTIONS_PER_PAGE,
  MENU_MAX_VARIANTS_PER_ARTICLE,
  MENU_TEXT,
} from "./limits";
import { ORDER_STEP } from "./order";
import { isValidRsd } from "./rsd";
import { cleanText, normalizeArticleName } from "./text";

/** Articles written by one migration batch (K01 §6: ≤ 100 items per batch). */
export const MENU_MIGRATION_BATCH = 100;
/** Issues listed one by one in a report; the rest are only counted. */
export const MENU_MIGRATION_MAX_ISSUES = 200;
/** Duplicate groups listed in a report. */
export const MENU_MIGRATION_MAX_DUPLICATES = 100;
/** Ordering-list names listed as unmatched. */
export const MENU_MIGRATION_MAX_UNMATCHED = 50;
/** Writes one internal import may plan (one transaction; lib/menu/budget.ts limits). */
export const MENU_IMPORT_MAX_WRITES = 8000;
/** Legacy groups read from a live generation (sections are ≤ 100 per page anyway). */
export const MENU_LEGACY_MAX_GROUPS = 1000;

// -----------------------------------------------------------------------------
// The legacy source
// -----------------------------------------------------------------------------

export type LegacySourceKind = "draft" | "live" | "import";

export type LegacySourceVariant = { id: string; label: string; priceRsd: number };

export type LegacySourceItem = {
  id: string;
  name: string;
  description?: string;
  productType: string;
  priceRsd?: number;
  iconKey?: string;
  photoStorageId?: string;
  videoStorageId?: string;
  available: boolean;
  /** The draft says available, the live menu says "nema više" (the live flag wins). */
  offLive?: boolean;
  variants: LegacySourceVariant[];
  /** "Ide uz" relations of the item; null when the source was read without them. */
  pairingCount: number | null;
};

export type LegacySourceGroup = {
  id: string;
  title: string;
  shape: string;
  iconKey?: string;
  daypartKey?: string;
  items: LegacySourceItem[];
};

export type LegacySource = {
  kind: LegacySourceKind;
  /** menus.draftRevision (draft) or menus.publishedGeneration (live); 0 for an import. */
  revision: number;
  hasUnpublishedChanges: boolean;
  groups: LegacySourceGroup[];
  daypartCount: number;
  daypartOverride: boolean;
};

/** The inline legacy model (lib/menu-blocks.ts MenuModel), structurally. */
export type LegacyModelInput = {
  groups: ReadonlyArray<{
    shape: string;
    base: { id: string; title: string; iconKey?: string; daypartKey?: string };
    items: ReadonlyArray<{
      id: string;
      name: string;
      description?: string;
      productType: string;
      priceRsd?: number;
      iconKey?: string;
      photoStorageId?: string;
      videoStorageId?: string;
      available: boolean;
      variants: ReadonlyArray<{ id: string; label: string; priceRsd: number }>;
      pairings: ReadonlyArray<unknown>;
    }>;
  }>;
  dayparts: ReadonlyArray<unknown>;
  daypartOverride?: string;
};

/**
 * The inline model as a source. `liveUnavailableIds` are draft item ids whose
 * LIVE row says "nema više": the live flag wins, so migrating a draft with
 * unpublished edits never brings back an item the floor took off.
 */
export function legacySourceFromModel(
  model: LegacyModelInput,
  input: {
    kind: LegacySourceKind;
    revision: number;
    hasUnpublishedChanges: boolean;
    liveUnavailableIds?: ReadonlySet<string>;
  },
): LegacySource {
  return {
    kind: input.kind,
    revision: input.revision,
    hasUnpublishedChanges: input.hasUnpublishedChanges,
    groups: model.groups.map((group) => ({
      id: group.base.id,
      title: group.base.title,
      shape: group.shape,
      ...(group.base.iconKey !== undefined ? { iconKey: group.base.iconKey } : {}),
      ...(group.base.daypartKey !== undefined ? { daypartKey: group.base.daypartKey } : {}),
      items: group.items.map((item) => {
        const offLive = item.available && (input.liveUnavailableIds?.has(item.id) ?? false);
        return {
          id: item.id,
          name: item.name,
          ...(item.description !== undefined ? { description: item.description } : {}),
          productType: item.productType,
          ...(item.priceRsd !== undefined ? { priceRsd: item.priceRsd } : {}),
          ...(item.iconKey !== undefined ? { iconKey: item.iconKey } : {}),
          ...(item.photoStorageId !== undefined ? { photoStorageId: item.photoStorageId } : {}),
          ...(item.videoStorageId !== undefined ? { videoStorageId: item.videoStorageId } : {}),
          available: item.available && !offLive,
          ...(offLive ? { offLive: true } : {}),
          variants: item.variants.map((variant) => ({ ...variant })),
          pairingCount: item.pairings.length,
        };
      }),
    })),
    daypartCount: model.dayparts.length,
    daypartOverride: Boolean(model.daypartOverride),
  };
}

// -----------------------------------------------------------------------------
// The target draft (what already exists in the new model)
// -----------------------------------------------------------------------------

export type LegacyTarget = {
  /** menuDraftState.articleCount (every article of the service). */
  articleCount: number;
  /** placementCount of the default page. */
  pagePlacementCount: number;
  /** Sections of the default page. */
  sections: ReadonlyArray<{ key: string; name: string; order: number }>;
  /** Articles of the service. */
  articles: ReadonlyArray<{
    key: string;
    name: string;
    nameNormalized: string;
    basePriceRsd?: number;
  }>;
  /** Variants of the service (verification only; empty when not verifying). */
  variants: ReadonlyArray<{ articleKey: string; name: string; priceRsd?: number; order: number }>;
  /** Placements of the default page (verification only). */
  placements: ReadonlyArray<{ articleKey: string; sectionKey: string; order: number }>;
};

// -----------------------------------------------------------------------------
// The plan
// -----------------------------------------------------------------------------

export type LegacyPlannedSection = {
  key: string;
  legacyRef: string;
  name: string;
  iconKey?: string;
  order: number;
};

export type LegacyPlannedVariant = { key: string; name: string; priceRsd?: number; order: number };

export type LegacyPlannedArticle = {
  key: string;
  legacyRef: string;
  sectionKey: string;
  placementOrder: number;
  name: string;
  nameNormalized: string;
  description?: string;
  basePriceRsd?: number;
  iconKey?: string;
  mediaMode: "icon" | "none";
  legacyPhotoStorageId?: string;
  variants: LegacyPlannedVariant[];
  unavailable: boolean;
};

export type LegacyIssue = {
  code: MenuMigrationWarning | MenuMigrationDifference;
  section?: string;
  article?: string;
};

export type LegacyDuplicate = {
  nameNormalized: string;
  names: string[];
  sections: string[];
  /** Legacy items with this name. */
  occurrences: number;
  /** Articles of the target draft (not from this source) with this name. */
  inDraft: number;
  samePrice: boolean;
};

export type LegacyMigrationReport = {
  source: {
    kind: LegacySourceKind;
    revision: number;
    groups: number;
    items: number;
    variants: number;
    photos: number;
  };
  planned: {
    sections: number;
    articles: number;
    variants: number;
    placements: number;
    unavailable: number;
    images: number;
    skippedItems: number;
  };
  target: {
    existingSections: number;
    pendingSections: number;
    existingArticles: number;
    pendingArticles: number;
    /** Articles of the draft that do not come from this source. */
    otherArticles: number;
  };
  prices: {
    currency: "RSD";
    min: number | null;
    max: number | null;
    withPrice: number;
    variantPriced: number;
    withoutPrice: number;
    zero: number;
    rounded: number;
  };
  text: { withDiacritics: number; whitespaceChanged: number; encodingSuspect: number; cut: number };
  unmapped: {
    videos: number;
    /** null when the source was read without "Ide uz" relations. */
    pairings: number | null;
    dayparts: number;
    daypartBindings: number;
    daypartOverride: boolean;
    groupShapes: Record<string, number>;
  };
  duplicates: LegacyDuplicate[];
  duplicateCount: number;
  blockers: MenuMigrationBlocker[];
  warnings: LegacyIssue[];
  warningCount: number;
  warningCounts: Partial<Record<MenuMigrationWarning, number>>;
  differences: LegacyIssue[];
  differenceCount: number;
  manualChecks: readonly MenuMigrationManualCheck[];
};

export type LegacyMigrationPlan = {
  sections: LegacyPlannedSection[];
  articles: LegacyPlannedArticle[];
  report: LegacyMigrationReport;
};

export type LegacyPlanOptions = {
  /** Section and variant names when the legacy one is empty (menu-domen). */
  fallbacks: { sectionName: string; variantName: string };
  /** Compare already migrated rows with the source (post-migration check). */
  verify: boolean;
};

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

const KEY_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** FNV-1a (32 bit) with a seed, finished with the murmur3 mixer. */
function hash32(bytes: Uint8Array, seed: number, reverse: boolean): number {
  let hash = seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[reverse ? bytes.length - 1 - index : index];
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function base32(value: number, chars: number): string {
  let out = "";
  for (let index = 0; index < chars; index += 1) {
    out += KEY_ALPHABET[(value >>> (index * 5)) & 31];
  }
  return out;
}

type LegacyKeyKind = "section" | "article" | "variant";

/**
 * The stable key of a migrated entity: the usual `<prefix>_<12 base32>` form
 * (lib/menu/keys.ts isMenuKey holds), derived from the legacy id instead of
 * random bytes, so the same legacy entity always gets the same key. 60 bits
 * from two independent 32-bit hashes; planLegacyMenu still resolves the
 * (negligible) collisions inside one source.
 */
export function legacyKey(kind: LegacyKeyKind, sourceId: string): string {
  const bytes = new TextEncoder().encode(`${kind}:${sourceId}`);
  const body = base32(hash32(bytes, 0x811c9dc5, false), 6) + base32(hash32(bytes, 0x9747b28c, true), 6);
  return `${MENU_KEY_PREFIX[kind]}_${body}`;
}

/** legacyKey, re-derived with a deterministic suffix while it collides with `used`. */
function uniqueLegacyKey(kind: LegacyKeyKind, sourceId: string, used: Set<string>): string {
  let key = legacyKey(kind, sourceId);
  for (let attempt = 2; used.has(key); attempt += 1) {
    key = legacyKey(kind, `${sourceId}~${attempt}`);
  }
  used.add(key);
  return key;
}

// -----------------------------------------------------------------------------
// Field rules
// -----------------------------------------------------------------------------

// Typical UTF-8 read as Windows-1252/Latin-1 ("Ä‡evapi", "Å¡ljivovica") and
// the replacement character: text that lost its diacritics on the way in.
const ENCODING_SUSPECT = /[ÃÄÅ][\u0080-¿Œ-Ÿˆ˜–-›]|�/;
const SERBIAN_DIACRITICS = /[čćšžđČĆŠŽĐ]/;

export function hasEncodingSuspect(value: string): boolean {
  return ENCODING_SUSPECT.test(value);
}

type CleanField = { text: string; whitespaceChanged: boolean; cut: boolean };

/** The new model's cleaning (lib/menu/text.ts cleanText), reported instead of silent. */
function cleanField(value: string, max: number): CleanField {
  const cleaned = cleanText(value);
  const cut = cleaned.length > max;
  let text = cleaned;
  if (cut) {
    text = cleaned.slice(0, max);
    // Never end on half of a surrogate pair (an emoji on the boundary).
    if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
    text = text.trim();
  }
  return {
    text,
    whitespaceChanged: cleaned !== value.trim(),
    cut,
  };
}

/** A legacy price in whole dinars; rounded when fractional, dropped when invalid. */
export function legacyPrice(raw: number | undefined): {
  price?: number;
  rounded: boolean;
  invalid: boolean;
} {
  if (raw === undefined) return { rounded: false, invalid: false };
  if (!Number.isFinite(raw) || raw < 0) return { rounded: false, invalid: true };
  // `|| 0` turns -0 into 0.
  const whole = Math.round(raw) || 0;
  if (!isValidRsd(whole)) return { rounded: false, invalid: true };
  return { price: whole, rounded: whole !== raw, invalid: false };
}

/**
 * The article icon: the legacy per-item override as is, else the product type
 * normalized like components/menu/menu-glyph-map.ts normalizeProductType, so
 * the public renderer keeps the legacy glyph.
 */
export function legacyIconKey(item: { iconKey?: string; productType: string }): string | undefined {
  const explicit = item.iconKey?.trim();
  const key =
    explicit && explicit.length > 0
      ? explicit
      : item.productType
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .trim()
          .toLowerCase();
  return key.length === 0 ? undefined : key.slice(0, MENU_TEXT.iconKey);
}

// -----------------------------------------------------------------------------
// Planning
// -----------------------------------------------------------------------------

class IssueList {
  readonly listed: LegacyIssue[] = [];
  count = 0;
  readonly counts: Partial<Record<MenuMigrationWarning, number>> = {};

  add(issue: LegacyIssue) {
    this.count += 1;
    if (this.listed.length < MENU_MIGRATION_MAX_ISSUES) this.listed.push(issue);
    if (isWarning(issue.code)) {
      this.counts[issue.code] = (this.counts[issue.code] ?? 0) + 1;
    }
  }
}

const DIFFERENCE_CODES: ReadonlySet<string> = new Set<MenuMigrationDifference>([
  "name_differs",
  "price_differs",
  "variants_differ",
  "placement_missing",
  "order_differs",
]);

function isWarning(code: LegacyIssue["code"]): code is MenuMigrationWarning {
  return !DIFFERENCE_CODES.has(code);
}

/** A legacy id made unique and non-empty; `duplicate` when it had to be changed. */
function uniqueSourceId(
  seen: Map<string, number>,
  raw: string,
  positional: string,
): { id: string; duplicate: boolean } {
  const empty = raw.trim() === "";
  const base = empty ? positional : raw;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  if (count === 0) return { id: base, duplicate: empty };
  return { id: `${base}#${count + 1}`, duplicate: true };
}

/**
 * Maps the whole legacy source onto the default page of the target draft and
 * reports everything master §6.3 asks to check. Deterministic for a given
 * source and target, so every batch of one run computes the same plan.
 */
export function planLegacyMenu(
  source: LegacySource,
  target: LegacyTarget,
  options: LegacyPlanOptions,
): LegacyMigrationPlan {
  const warnings = new IssueList();
  const sections: LegacyPlannedSection[] = [];
  const articles: LegacyPlannedArticle[] = [];
  const seenSectionIds = new Map<string, number>();
  const seenItemIds = new Map<string, number>();

  const sourceCounts = { groups: source.groups.length, items: 0, variants: 0, photos: 0 };
  const planned = { variants: 0, unavailable: 0, images: 0, skippedItems: 0 };
  const prices = { min: null as number | null, max: null as number | null, withPrice: 0, variantPriced: 0, withoutPrice: 0, zero: 0, rounded: 0 };
  const text = { withDiacritics: 0, whitespaceChanged: 0, encodingSuspect: 0, cut: 0 };
  const unmapped = {
    videos: 0,
    pairings: 0 as number | null,
    dayparts: source.daypartCount,
    daypartBindings: 0,
    daypartOverride: source.daypartOverride,
    groupShapes: {} as Record<string, number>,
  };

  const notePrice = (price: number) => {
    prices.min = prices.min === null ? price : Math.min(prices.min, price);
    prices.max = prices.max === null ? price : Math.max(prices.max, price);
  };
  const noteText = (field: CleanField, at: { section?: string; article?: string }) => {
    if (field.whitespaceChanged) {
      text.whitespaceChanged += 1;
      warnings.add({ code: "text_whitespace_changed", ...at });
    }
    if (field.cut) {
      text.cut += 1;
      warnings.add({ code: "text_cut", ...at });
    }
    if (hasEncodingSuspect(field.text)) {
      text.encodingSuspect += 1;
      warnings.add({ code: "text_encoding_suspect", ...at });
    }
  };

  const usedSectionKeys = new Set<string>();
  const usedArticleKeys = new Set<string>();
  const usedVariantKeys = new Set<string>();
  const sectionIds = source.groups.map((group, index) => {
    const sourceId = uniqueSourceId(seenSectionIds, group.id, `g${index}`);
    return { ...sourceId, key: uniqueLegacyKey("section", sourceId.id, usedSectionKeys) };
  });

  // Planned sections go after the sections the client made in the new model.
  const plannedSectionKeys = new Set(sectionIds.map((section) => section.key));
  let baseOrder = 0;
  for (const section of target.sections) {
    if (!plannedSectionKeys.has(section.key)) baseOrder = Math.max(baseOrder, section.order);
  }

  source.groups.forEach((group, groupIndex) => {
    const sectionId = sectionIds[groupIndex];
    const sectionKey = sectionId.key;
    const title = cleanField(group.title, MENU_TEXT.sectionName);
    const sectionName = title.text.length > 0 ? title.text : options.fallbacks.sectionName;
    const atSection = { section: sectionName };
    if (sectionId.duplicate) warnings.add({ code: "duplicate_source_id", ...atSection });
    if (title.text.length === 0) warnings.add({ code: "section_untitled", ...atSection });
    noteText(title, atSection);
    if (group.shape !== "lista") {
      unmapped.groupShapes[group.shape] = (unmapped.groupShapes[group.shape] ?? 0) + 1;
      warnings.add({ code: "group_shape_unmapped", ...atSection });
    }
    if (group.daypartKey) {
      unmapped.daypartBindings += 1;
      warnings.add({ code: "daypart_unmapped", ...atSection });
    }
    const iconKey = group.iconKey?.trim().slice(0, MENU_TEXT.iconKey);
    sections.push({
      key: sectionKey,
      legacyRef: `${source.kind}:${sectionId.id}`,
      name: sectionName,
      ...(iconKey ? { iconKey } : {}),
      order: baseOrder + (groupIndex + 1) * ORDER_STEP,
    });

    group.items.forEach((item, itemIndex) => {
      sourceCounts.items += 1;
      sourceCounts.variants += item.variants.length;
      if (item.photoStorageId) sourceCounts.photos += 1;

      const name = cleanField(item.name, MENU_TEXT.articleName);
      if (name.text.length === 0) {
        planned.skippedItems += 1;
        warnings.add({ code: "item_name_empty", ...atSection });
        return;
      }
      const at = { section: sectionName, article: name.text };
      const itemId = uniqueSourceId(seenItemIds, item.id, `g${groupIndex}i${itemIndex}`);
      if (itemId.duplicate) warnings.add({ code: "duplicate_source_id", ...at });
      noteText(name, at);
      if (SERBIAN_DIACRITICS.test(name.text)) text.withDiacritics += 1;

      let description: string | undefined;
      if (item.description !== undefined) {
        const cleaned = cleanField(item.description, MENU_TEXT.articleDescription);
        if (cleaned.text.length > 0) {
          description = cleaned.text;
          noteText(cleaned, at);
        }
      }

      const base = legacyPrice(item.priceRsd);
      if (base.invalid) warnings.add({ code: "price_invalid", ...at });
      if (base.rounded) {
        prices.rounded += 1;
        warnings.add({ code: "price_rounded", ...at });
      }

      const variants: LegacyPlannedVariant[] = [];
      const seenVariantIds = new Map<string, number>();
      if (item.variants.length > MENU_MAX_VARIANTS_PER_ARTICLE) {
        warnings.add({ code: "variants_truncated", ...at });
      }
      item.variants.slice(0, MENU_MAX_VARIANTS_PER_ARTICLE).forEach((variant, variantIndex) => {
        const variantId = uniqueSourceId(seenVariantIds, variant.id, `v${variantIndex}`);
        const label = cleanField(variant.label, MENU_TEXT.variantName);
        if (label.text.length === 0) warnings.add({ code: "variant_name_empty", ...at });
        noteText(label, at);
        const price = legacyPrice(variant.priceRsd);
        if (price.invalid) warnings.add({ code: "price_invalid", ...at });
        if (price.rounded) {
          prices.rounded += 1;
          warnings.add({ code: "price_rounded", ...at });
        }
        if (price.price !== undefined) {
          notePrice(price.price);
          if (price.price === 0) {
            prices.zero += 1;
            warnings.add({ code: "price_zero", ...at });
          }
        }
        variants.push({
          key: uniqueLegacyKey("variant", `${itemId.id}/${variantId.id}`, usedVariantKeys),
          name: label.text.length > 0 ? label.text : options.fallbacks.variantName,
          ...(price.price !== undefined ? { priceRsd: price.price } : {}),
          order: (variantIndex + 1) * ORDER_STEP,
        });
      });
      planned.variants += variants.length;

      if (base.price !== undefined) {
        prices.withPrice += 1;
        notePrice(base.price);
        if (base.price === 0) {
          prices.zero += 1;
          warnings.add({ code: "price_zero", ...at });
        }
      } else if (variants.some((variant) => variant.priceRsd !== undefined)) {
        prices.variantPriced += 1;
      } else {
        prices.withoutPrice += 1;
        warnings.add({ code: "price_missing", ...at });
      }

      if (item.photoStorageId) {
        planned.images += 1;
        warnings.add({ code: "image_pending", ...at });
      }
      if (item.videoStorageId) {
        unmapped.videos += 1;
        warnings.add({ code: "video_unmapped", ...at });
      }
      if (item.pairingCount === null) {
        unmapped.pairings = null;
      } else if (item.pairingCount > 0) {
        if (unmapped.pairings !== null) unmapped.pairings += item.pairingCount;
        warnings.add({ code: "pairings_unmapped", ...at });
      }
      if (!item.available) planned.unavailable += 1;
      if (item.offLive) warnings.add({ code: "unavailable_from_live", ...at });

      const iconKey = legacyIconKey(item);
      articles.push({
        key: uniqueLegacyKey("article", itemId.id, usedArticleKeys),
        legacyRef: `${source.kind}:${itemId.id}`,
        sectionKey,
        placementOrder: (itemIndex + 1) * ORDER_STEP,
        name: name.text,
        nameNormalized: normalizeArticleName(name.text),
        ...(description !== undefined ? { description } : {}),
        ...(base.price !== undefined ? { basePriceRsd: base.price } : {}),
        ...(iconKey !== undefined ? { iconKey } : {}),
        mediaMode: iconKey !== undefined ? "icon" : "none",
        ...(item.photoStorageId ? { legacyPhotoStorageId: item.photoStorageId } : {}),
        variants,
        unavailable: !item.available,
      });
    });
  });

  if (sourceCounts.items === 0) warnings.add({ code: "source_empty" });
  if (source.kind === "draft" && source.hasUnpublishedChanges) {
    warnings.add({ code: "draft_has_unpublished_changes" });
  }
  if (source.daypartCount > 0 || source.daypartOverride) warnings.add({ code: "daypart_unmapped" });
  if (articles.length >= 10 && text.withDiacritics === 0) warnings.add({ code: "diacritics_absent" });

  // --- What already exists.
  const targetArticleKeys = new Set(target.articles.map((article) => article.key));
  const targetSectionKeys = new Set(target.sections.map((section) => section.key));
  const plannedArticleKeys = new Set(articles.map((article) => article.key));
  const existingArticles = articles.filter((article) => targetArticleKeys.has(article.key)).length;
  const existingSections = sections.filter((section) => targetSectionKeys.has(section.key)).length;
  const pendingArticles = articles.length - existingArticles;
  const otherArticleRows = target.articles.filter((article) => !plannedArticleKeys.has(article.key));
  if (otherArticleRows.length > 0) warnings.add({ code: "target_not_empty" });

  // --- Ceilings (nothing is written while one is exceeded).
  const blockers: MenuMigrationBlocker[] = [];
  const otherSections = target.sections.filter((section) => !plannedSectionKeys.has(section.key)).length;
  if (otherSections + sections.length > MENU_MAX_SECTIONS_PER_PAGE) blockers.push("sections_limit");
  if (target.articleCount + pendingArticles > MENU_MAX_ARTICLES) blockers.push("articles_limit");
  if (target.pagePlacementCount + pendingArticles > MENU_MAX_PLACEMENTS_PER_PAGE) {
    blockers.push("placements_limit");
  }

  // --- Duplicates by normalized name (master §6.3), never merged.
  const sectionNameByKey = new Map(sections.map((section) => [section.key, section.name]));
  const byName = new Map<string, LegacyPlannedArticle[]>();
  for (const article of articles) {
    const list = byName.get(article.nameNormalized) ?? [];
    list.push(article);
    byName.set(article.nameNormalized, list);
  }
  const inDraftByName = new Map<string, number>();
  for (const article of otherArticleRows) {
    inDraftByName.set(article.nameNormalized, (inDraftByName.get(article.nameNormalized) ?? 0) + 1);
  }
  const duplicates: LegacyDuplicate[] = [];
  let duplicateCount = 0;
  for (const [nameNormalized, list] of byName) {
    const inDraft = inDraftByName.get(nameNormalized) ?? 0;
    if (list.length + inDraft < 2) continue;
    duplicateCount += 1;
    warnings.add({ code: "duplicate_name", article: list[0].name });
    if (duplicates.length >= MENU_MIGRATION_MAX_DUPLICATES) continue;
    const priceKeys = new Set(list.map((article) => priceSignature(article)));
    duplicates.push({
      nameNormalized,
      names: [...new Set(list.map((article) => article.name))],
      sections: [...new Set(list.map((article) => sectionNameByKey.get(article.sectionKey) ?? ""))],
      occurrences: list.length,
      inDraft,
      samePrice: priceKeys.size === 1,
    });
  }

  const differences = options.verify ? verifyMigrated(articles, sections, target) : new IssueList();

  return {
    sections,
    articles,
    report: {
      source: { kind: source.kind, revision: source.revision, ...sourceCounts },
      planned: {
        sections: sections.length,
        articles: articles.length,
        placements: articles.length,
        ...planned,
      },
      target: {
        existingSections,
        pendingSections: sections.length - existingSections,
        existingArticles,
        pendingArticles,
        otherArticles: otherArticleRows.length,
      },
      prices: { currency: "RSD", ...prices },
      text,
      unmapped,
      duplicates,
      duplicateCount,
      blockers,
      warnings: warnings.listed,
      warningCount: warnings.count,
      warningCounts: warnings.counts,
      differences: differences.listed,
      differenceCount: differences.count,
      manualChecks: MENU_MIGRATION_MANUAL_CHECKS,
    },
  };
}

function priceSignature(article: LegacyPlannedArticle): string {
  const variants = article.variants.map((variant) => `${variant.name}=${variant.priceRsd ?? ""}`);
  return `${article.basePriceRsd ?? ""}|${variants.join(",")}`;
}

/**
 * The post-migration check: every migrated article still matches its legacy
 * source (name, base price, variants, placement in its section and the order
 * of the section). A difference means someone edited the draft after the
 * migration, or the migration is wrong; either way the operator looks.
 */
function verifyMigrated(
  articles: readonly LegacyPlannedArticle[],
  sections: readonly LegacyPlannedSection[],
  target: LegacyTarget,
): IssueList {
  const differences = new IssueList();
  const targetArticles = new Map(target.articles.map((article) => [article.key, article]));
  const variantsByArticle = new Map<string, Array<{ name: string; priceRsd?: number; order: number }>>();
  for (const variant of target.variants) {
    const list = variantsByArticle.get(variant.articleKey) ?? [];
    list.push(variant);
    variantsByArticle.set(variant.articleKey, list);
  }
  const placementOrder = new Map<string, number>();
  for (const placement of target.placements) {
    placementOrder.set(`${placement.sectionKey}\u0000${placement.articleKey}`, placement.order);
  }
  const sectionName = new Map(sections.map((section) => [section.key, section.name]));

  const ordersBySection = new Map<string, number[]>();
  for (const article of articles) {
    const existing = targetArticles.get(article.key);
    if (!existing) continue;
    const at = { section: sectionName.get(article.sectionKey), article: article.name };
    if (existing.name !== article.name) differences.add({ code: "name_differs", ...at });
    if ((existing.basePriceRsd ?? null) !== (article.basePriceRsd ?? null)) {
      differences.add({ code: "price_differs", ...at });
    }
    const actual = (variantsByArticle.get(article.key) ?? [])
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((variant) => `${variant.name}=${variant.priceRsd ?? ""}`);
    const expected = article.variants.map((variant) => `${variant.name}=${variant.priceRsd ?? ""}`);
    if (actual.join("\u0000") !== expected.join("\u0000")) {
      differences.add({ code: "variants_differ", ...at });
    }
    const order = placementOrder.get(`${article.sectionKey}\u0000${article.key}`);
    if (order === undefined) {
      differences.add({ code: "placement_missing", ...at });
    } else {
      const list = ordersBySection.get(article.sectionKey) ?? [];
      list.push(order);
      ordersBySection.set(article.sectionKey, list);
    }
  }
  for (const [sectionKey, orders] of ordersBySection) {
    for (let index = 1; index < orders.length; index += 1) {
      if (orders[index] <= orders[index - 1]) {
        differences.add({ code: "order_differs", section: sectionName.get(sectionKey) });
        break;
      }
    }
  }
  return differences;
}

/** Writes an import or a batch plans (sections, articles, placements, variants, availability). */
export function plannedWrites(plan: Pick<LegacyMigrationPlan, "sections" | "articles">): number {
  let writes = plan.sections.length;
  for (const article of plan.articles) {
    writes += 2 + article.variants.length + (article.unavailable ? 1 : 0);
  }
  return writes;
}

// -----------------------------------------------------------------------------
// The RFC-004 ordering list (`orderingItems`) — a report only
// -----------------------------------------------------------------------------

export type LegacyOrderingMatch = {
  total: number;
  matched: number;
  unmatched: number;
  /** Matched by name, but no base or variant price equals the ordering price. */
  priceDiffers: number;
  unmatchedNames: string[];
};

/**
 * Matches the venue's ordering list (decoupled from the legacy menu, RFC-004
 * §2.13) to the planned articles by normalized name. Nothing is written: the
 * new guest requests (K21) order articles directly; this tells the operator
 * which ordering entries have no article.
 */
export function matchOrderingItems(
  orderingItems: ReadonlyArray<{ name: string; priceRsd?: number }>,
  articles: ReadonlyArray<Pick<LegacyPlannedArticle, "nameNormalized" | "basePriceRsd" | "variants">>,
): LegacyOrderingMatch {
  const byName = new Map<string, Array<(typeof articles)[number]>>();
  for (const article of articles) {
    const list = byName.get(article.nameNormalized) ?? [];
    list.push(article);
    byName.set(article.nameNormalized, list);
  }
  const result: LegacyOrderingMatch = {
    total: orderingItems.length,
    matched: 0,
    unmatched: 0,
    priceDiffers: 0,
    unmatchedNames: [],
  };
  for (const item of orderingItems) {
    const matches = byName.get(normalizeArticleName(item.name));
    if (!matches) {
      result.unmatched += 1;
      if (result.unmatchedNames.length < MENU_MIGRATION_MAX_UNMATCHED) {
        result.unmatchedNames.push(item.name);
      }
      continue;
    }
    result.matched += 1;
    if (item.priceRsd === undefined) continue;
    const samePrice = matches.some(
      (article) =>
        article.basePriceRsd === item.priceRsd ||
        article.variants.some((variant) => variant.priceRsd === item.priceRsd),
    );
    if (!samePrice) result.priceDiffers += 1;
  }
  return result;
}
