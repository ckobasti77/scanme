import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { DraftDocs } from "./menuDraftLoad";
import { utf8ByteLength } from "../../lib/menu/budget";
import {
  RESTORE_IDENTITY,
  diffByIdentity,
  type IdentityDiff,
} from "../../lib/menu/restore-plan";
import {
  canonicalJson,
  type MenuDraftSnapshot,
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
  type SnapshotVariant,
} from "../../lib/menu/snapshot";
import { normalizeArticleName } from "../../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 (K05) — writes a restore plan (lib/menu/restore-plan.ts) into
// the draft rows. Only the DIFFERENCE between the current draft and the
// planned one is written: rows are matched by their stable key (pages,
// sections, articles, variants, add-on groups and options, Room service
// categories) or by their natural identity (placement = section + article,
// add-on link = article + group, combo component = combo + component, Room
// service item = article). Exact counters (placementCount, linkCount) are
// recomputed from the planned draft. Live layers (menuAvailability, QR links,
// feature switches) and published versions are never touched.
// =============================================================================

type Translations = Doc<"menuArticles">["translations"];
const tr = (value: SnapshotPage["translations"]): Translations =>
  (value ?? undefined) as Translations;
const opt = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

export type RestoreDiffs = {
  pages: IdentityDiff<SnapshotPage>;
  sections: IdentityDiff<SnapshotSection>;
  articles: IdentityDiff<SnapshotArticle>;
  variants: IdentityDiff<SnapshotVariant>;
  addonGroups: IdentityDiff<SnapshotAddonGroup>;
  addonOptions: IdentityDiff<SnapshotAddonOption>;
  placements: IdentityDiff<SnapshotPlacement>;
  articleAddonGroups: IdentityDiff<SnapshotArticleAddonGroup>;
  comboComponents: IdentityDiff<SnapshotComboComponent>;
  roomServiceCategories: IdentityDiff<SnapshotRoomServiceCategory>;
  roomServiceItems: IdentityDiff<SnapshotRoomServiceItem>;
  settings: boolean;
  presentation: boolean;
  roomServiceConfig: boolean;
};

const byKey = (row: { key: string }) => row.key;

export function restoreDiffs(current: MenuDraftSnapshot, final: MenuDraftSnapshot): RestoreDiffs {
  return {
    pages: diffByIdentity(current.pages, final.pages, byKey),
    sections: diffByIdentity(current.sections, final.sections, byKey),
    articles: diffByIdentity(current.articles, final.articles, byKey),
    variants: diffByIdentity(current.variants, final.variants, byKey),
    addonGroups: diffByIdentity(current.addonGroups, final.addonGroups, byKey),
    addonOptions: diffByIdentity(current.addonOptions, final.addonOptions, byKey),
    placements: diffByIdentity(current.placements, final.placements, RESTORE_IDENTITY.placement),
    articleAddonGroups: diffByIdentity(
      current.articleAddonGroups,
      final.articleAddonGroups,
      RESTORE_IDENTITY.articleAddonGroup,
    ),
    comboComponents: diffByIdentity(
      current.comboComponents,
      final.comboComponents,
      RESTORE_IDENTITY.comboComponent,
    ),
    roomServiceCategories: diffByIdentity(
      current.roomService.categories,
      final.roomService.categories,
      byKey,
    ),
    roomServiceItems: diffByIdentity(
      current.roomService.items,
      final.roomService.items,
      RESTORE_IDENTITY.roomServiceItem,
    ),
    settings: canonicalJson(current.settings) !== canonicalJson(final.settings),
    presentation: canonicalJson(current.presentation) !== canonicalJson(final.presentation),
    roomServiceConfig:
      canonicalJson(current.roomService.config) !== canonicalJson(final.roomService.config),
  };
}

const TABLE_DIFFS = [
  "pages",
  "sections",
  "articles",
  "variants",
  "addonGroups",
  "addonOptions",
  "placements",
  "articleAddonGroups",
  "comboComponents",
  "roomServiceCategories",
  "roomServiceItems",
] as const;

/** Upper bound of the documents a restore writes (rows, counters, settings). */
export function restoreWriteEstimate(diffs: RestoreDiffs, final: MenuDraftSnapshot): { documents: number; bytes: number } {
  let documents = 0;
  let bytes = 0;
  for (const table of TABLE_DIFFS) {
    const diff = diffs[table] as IdentityDiff<unknown>;
    documents += diff.inserts.length + diff.updates.length + diff.deletes.length;
    for (const row of diff.inserts) bytes += utf8ByteLength(JSON.stringify(row));
    for (const { after } of diff.updates) bytes += utf8ByteLength(JSON.stringify(after));
  }
  // Counters may patch every page and group; settings, appearance, RS config, draft state.
  documents += final.pages.length + final.addonGroups.length + 4;
  return { documents, bytes };
}

export function restoreChanges(diffs: RestoreDiffs): number {
  let changes = 0;
  for (const table of TABLE_DIFFS) {
    const diff = diffs[table] as IdentityDiff<unknown>;
    changes += diff.inserts.length + diff.updates.length + diff.deletes.length;
  }
  return changes + (diffs.settings ? 1 : 0) + (diffs.presentation ? 1 : 0) + (diffs.roomServiceConfig ? 1 : 0);
}

function countBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  return counts;
}

function required<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error("menu restore: a planned row has no parent");
  return value;
}

/** Writes `diffs` (computed against `docs`) so the draft equals `final`. */
export async function applyRestore(
  ctx: MutationCtx,
  input: {
    menuService: Doc<"menuServices">;
    docs: DraftDocs;
    final: MenuDraftSnapshot;
    diffs: RestoreDiffs;
    userId: Id<"users">;
    now: number;
  },
): Promise<void> {
  const { menuService, docs, final, diffs, userId, now } = input;
  const menuServiceId = menuService._id;

  // key → id maps of the existing rows; inserts extend them.
  const pageIds = new Map(docs.pages.map((row) => [row.key, row._id]));
  const sectionIds = new Map(docs.sections.map((row) => [row.key, row._id]));
  const articleIds = new Map(docs.articles.map((row) => [row.key, row._id]));
  const groupIds = new Map(docs.addonGroups.map((row) => [row.key, row._id]));
  const categoryIds = new Map(docs.roomServiceCategories.map((row) => [row.key, row._id]));
  const variantIds = new Map(docs.variants.map((row) => [row.key, row._id]));
  const optionIds = new Map(docs.addonOptions.map((row) => [row.key, row._id]));
  const keyOfSection = new Map(docs.sections.map((row) => [row._id, row.key]));
  const keyOfArticle = new Map(docs.articles.map((row) => [row._id, row.key]));
  const keyOfGroup = new Map(docs.addonGroups.map((row) => [row._id, row.key]));
  const placementIds = new Map<string, Id<"menuPlacements">>();
  for (const row of docs.placements) {
    const sectionKey = keyOfSection.get(row.sectionId);
    const articleKey = keyOfArticle.get(row.articleId);
    if (sectionKey && articleKey) placementIds.set(`${sectionKey}|${articleKey}`, row._id);
  }
  const linkIds = new Map<string, Id<"menuArticleAddonGroups">>();
  for (const row of docs.articleAddonGroups) {
    const articleKey = keyOfArticle.get(row.articleId);
    const groupKey = keyOfGroup.get(row.groupId);
    if (articleKey && groupKey) linkIds.set(`${articleKey}|${groupKey}`, row._id);
  }
  const componentIds = new Map<string, Id<"menuComboComponents">>();
  for (const row of docs.comboComponents) {
    const comboKey = keyOfArticle.get(row.comboArticleId);
    const componentKey = keyOfArticle.get(row.componentArticleId);
    if (comboKey && componentKey) componentIds.set(`${comboKey}|${componentKey}`, row._id);
  }
  const rsItemIds = new Map<string, Id<"menuRoomServiceItems">>();
  for (const row of docs.roomServiceItems) {
    const articleKey = keyOfArticle.get(row.articleId);
    if (articleKey) rsItemIds.set(articleKey, row._id);
  }

  const placementCount = countBy(final.placements, (row) => row.pageKey);
  const linkCount = countBy(final.articleAddonGroups, (row) => row.groupKey);

  // --- settings, appearance, Room service rules --------------------------------
  if (diffs.settings) {
    const settings = { ...(menuService.settings ?? {}) };
    if (final.settings.languages) settings.languages = { ...final.settings.languages };
    else delete settings.languages;
    if (final.settings.allergensEnabled !== null) settings.allergensEnabled = final.settings.allergensEnabled;
    else delete settings.allergensEnabled;
    await ctx.db.patch(menuServiceId, { settings, updatedAt: now });
  }
  if (diffs.presentation) {
    if (docs.presentation && !final.presentation) await ctx.db.delete(docs.presentation._id);
    else if (final.presentation) {
      const values = {
        ...final.presentation,
        // K17: undefined removes a variant the restored version does not have.
        layoutVariant: final.presentation.layoutVariant,
        brandColors: opt(final.presentation.brandColors),
      };
      if (docs.presentation) {
        await ctx.db.patch(docs.presentation._id, { ...values, updatedAt: now, updatedByUserId: userId });
      } else {
        await ctx.db.insert("menuPresentation", {
          menuServiceId,
          ...values,
          createdAt: now,
          updatedAt: now,
          updatedByUserId: userId,
        });
      }
    }
  }
  if (diffs.roomServiceConfig) {
    const config = final.roomService.config;
    if (docs.roomServiceConfig && !config) await ctx.db.delete(docs.roomServiceConfig._id);
    else if (config) {
      const values = {
        markupBps: opt(config.markupBps),
        markupScope: config.markupScope,
        deliveryFeeRsd: opt(config.deliveryFeeRsd),
      };
      if (docs.roomServiceConfig) {
        await ctx.db.patch(docs.roomServiceConfig._id, { ...values, updatedAt: now, updatedByUserId: userId });
      } else {
        await ctx.db.insert("menuRoomService", {
          menuServiceId,
          ...values,
          createdAt: now,
          updatedAt: now,
          updatedByUserId: userId,
        });
      }
    }
  }

  // --- pages ------------------------------------------------------------------
  const pageFields = (page: SnapshotPage) => ({
    key: page.key,
    slug: page.slug,
    name: page.name,
    publicTitle: opt(page.publicTitle),
    isDefault: page.isDefault,
    order: page.order,
    visibility: page.visibility,
    archivedAt: opt(page.archivedAt),
    iconKey: opt(page.iconKey),
    navigation: page.navigation,
    translations: tr(page.translations),
  });
  const patchedPages = new Set<string>();
  for (const page of diffs.pages.inserts) {
    pageIds.set(
      page.key,
      await ctx.db.insert("menuPages", {
        menuServiceId,
        ...pageFields(page),
        placementCount: placementCount.get(page.key) ?? 0,
        createdAt: now,
        updatedAt: now,
        updatedByUserId: userId,
      }),
    );
  }
  for (const { after } of diffs.pages.updates) {
    patchedPages.add(after.key);
    await ctx.db.patch(required(pageIds, after.key), {
      ...pageFields(after),
      placementCount: placementCount.get(after.key) ?? 0,
      updatedAt: now,
      updatedByUserId: userId,
    });
  }

  // --- sections -----------------------------------------------------------------
  const sectionFields = (section: SnapshotSection) => ({
    pageId: required(pageIds, section.pageKey),
    key: section.key,
    name: section.name,
    description: opt(section.description),
    iconKey: opt(section.iconKey),
    order: section.order,
    visibility: section.visibility,
    translations: tr(section.translations),
  });
  for (const section of diffs.sections.inserts) {
    sectionIds.set(
      section.key,
      await ctx.db.insert("menuSections", { menuServiceId, ...sectionFields(section), createdAt: now, updatedAt: now }),
    );
  }
  for (const { after } of diffs.sections.updates) {
    await ctx.db.patch(required(sectionIds, after.key), { ...sectionFields(after), updatedAt: now });
  }

  // --- articles ------------------------------------------------------------------
  const articleFields = (article: SnapshotArticle) => ({
    key: article.key,
    kind: article.kind,
    name: article.name,
    nameNormalized: normalizeArticleName(article.name),
    description: opt(article.description),
    quantityValue: opt(article.quantityValue),
    quantityUnit: opt(article.quantityUnit),
    basePriceRsd: opt(article.basePriceRsd),
    mediaMode: article.mediaMode,
    imageMediaId: article.imageMediaId === null ? undefined : (article.imageMediaId as Id<"mediaAssets">),
    iconKey: opt(article.iconKey),
    variantsEnabled: article.variantsEnabled,
    addonsEnabled: article.addonsEnabled,
    noteEnabled: article.noteEnabled,
    allergens: article.allergens
      ? {
          contains: article.allergens.contains as NonNullable<Doc<"menuArticles">["allergens"]>["contains"],
          mayContain: article.allergens.mayContain as NonNullable<Doc<"menuArticles">["allergens"]>["mayContain"],
          otherText: opt(article.allergens.otherText),
        }
      : undefined,
    tags: article.tags === null ? undefined : (article.tags as NonNullable<Doc<"menuArticles">["tags"]>),
    promo: opt(article.promo),
    priceCheck: opt(article.priceCheck),
    translations: tr(article.translations),
  });
  for (const article of diffs.articles.inserts) {
    articleIds.set(
      article.key,
      await ctx.db.insert("menuArticles", {
        menuServiceId,
        ...articleFields(article),
        createdAt: now,
        updatedAt: now,
        updatedByUserId: userId,
      }),
    );
  }
  for (const { after } of diffs.articles.updates) {
    await ctx.db.patch(required(articleIds, after.key), {
      ...articleFields(after),
      updatedAt: now,
      updatedByUserId: userId,
    });
  }

  // --- add-on groups and options ------------------------------------------------
  const groupFields = (group: SnapshotAddonGroup) => ({
    key: group.key,
    name: group.name,
    selection: group.selection,
    required: group.required,
    minSelect: opt(group.minSelect),
    maxSelect: opt(group.maxSelect),
    translations: tr(group.translations),
  });
  const patchedGroups = new Set<string>();
  for (const group of diffs.addonGroups.inserts) {
    groupIds.set(
      group.key,
      await ctx.db.insert("menuAddonGroups", {
        menuServiceId,
        ...groupFields(group),
        linkCount: linkCount.get(group.key) ?? 0,
        createdAt: now,
        updatedAt: now,
        updatedByUserId: userId,
      }),
    );
  }
  for (const { after } of diffs.addonGroups.updates) {
    patchedGroups.add(after.key);
    await ctx.db.patch(required(groupIds, after.key), {
      ...groupFields(after),
      linkCount: linkCount.get(after.key) ?? 0,
      updatedAt: now,
      updatedByUserId: userId,
    });
  }
  const optionFields = (option: SnapshotAddonOption) => ({
    groupId: required(groupIds, option.groupKey),
    key: option.key,
    name: option.name,
    priceDeltaRsd: option.priceDeltaRsd,
    order: option.order,
    translations: tr(option.translations),
  });
  for (const option of diffs.addonOptions.inserts) {
    await ctx.db.insert("menuAddonOptions", { menuServiceId, ...optionFields(option), createdAt: now, updatedAt: now });
  }
  for (const { after } of diffs.addonOptions.updates) {
    await ctx.db.patch(required(optionIds, after.key), { ...optionFields(after), updatedAt: now });
  }

  // --- variants -------------------------------------------------------------------
  const variantFields = (variant: SnapshotVariant) => ({
    articleId: required(articleIds, variant.articleKey),
    key: variant.key,
    name: variant.name,
    priceRsd: opt(variant.priceRsd),
    order: variant.order,
    translations: tr(variant.translations),
  });
  for (const variant of diffs.variants.inserts) {
    await ctx.db.insert("menuVariants", { menuServiceId, ...variantFields(variant), createdAt: now, updatedAt: now });
  }
  for (const { after } of diffs.variants.updates) {
    await ctx.db.patch(required(variantIds, after.key), { ...variantFields(after), updatedAt: now });
  }

  // --- placements, add-on links, combo components ---------------------------------
  const placementFields = (placement: SnapshotPlacement) => ({
    pageId: required(pageIds, placement.pageKey),
    sectionId: required(sectionIds, placement.sectionKey),
    articleId: required(articleIds, placement.articleKey),
    order: placement.order,
    visibility: placement.visibility,
  });
  for (const placement of diffs.placements.inserts) {
    await ctx.db.insert("menuPlacements", { menuServiceId, ...placementFields(placement), createdAt: now, updatedAt: now });
  }
  for (const { after } of diffs.placements.updates) {
    await ctx.db.patch(required(placementIds, RESTORE_IDENTITY.placement(after)), {
      ...placementFields(after),
      updatedAt: now,
    });
  }
  for (const link of diffs.articleAddonGroups.inserts) {
    await ctx.db.insert("menuArticleAddonGroups", {
      menuServiceId,
      articleId: required(articleIds, link.articleKey),
      groupId: required(groupIds, link.groupKey),
      order: link.order,
      createdAt: now,
    });
  }
  for (const { after } of diffs.articleAddonGroups.updates) {
    await ctx.db.patch(required(linkIds, RESTORE_IDENTITY.articleAddonGroup(after)), { order: after.order });
  }
  for (const component of diffs.comboComponents.inserts) {
    await ctx.db.insert("menuComboComponents", {
      menuServiceId,
      comboArticleId: required(articleIds, component.comboKey),
      componentArticleId: required(articleIds, component.componentKey),
      quantity: component.quantity,
      order: component.order,
      createdAt: now,
    });
  }
  for (const { after } of diffs.comboComponents.updates) {
    await ctx.db.patch(required(componentIds, RESTORE_IDENTITY.comboComponent(after)), {
      quantity: after.quantity,
      order: after.order,
    });
  }

  // --- Room service categories and items -------------------------------------------
  for (const category of diffs.roomServiceCategories.inserts) {
    categoryIds.set(
      category.key,
      await ctx.db.insert("menuRoomServiceCategories", {
        menuServiceId,
        key: category.key,
        name: category.name,
        order: category.order,
        translations: tr(category.translations),
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  for (const { after } of diffs.roomServiceCategories.updates) {
    await ctx.db.patch(required(categoryIds, after.key), {
      name: after.name,
      order: after.order,
      translations: tr(after.translations),
      updatedAt: now,
    });
  }
  const rsItemFields = (item: SnapshotRoomServiceItem) => ({
    categoryId: required(categoryIds, item.categoryKey),
    articleId: required(articleIds, item.articleKey),
    order: item.order,
    markupApplies: item.markupApplies,
    manualPriceRsd: opt(item.manualPriceRsd),
    priceWarning: opt(item.priceWarning),
    manualVariantPrices: item.manualVariantPrices
      ? item.manualVariantPrices.map((price) => ({
          variantKey: price.variantKey,
          priceRsd: price.priceRsd,
          priceWarning: opt(price.priceWarning),
        }))
      : undefined,
  });
  for (const item of diffs.roomServiceItems.inserts) {
    await ctx.db.insert("menuRoomServiceItems", { menuServiceId, ...rsItemFields(item), createdAt: now, updatedAt: now });
  }
  for (const { after } of diffs.roomServiceItems.updates) {
    await ctx.db.patch(required(rsItemIds, after.articleKey), { ...rsItemFields(after), updatedAt: now });
  }

  // --- deletes, children first ---------------------------------------------------------
  for (const item of diffs.roomServiceItems.deletes) await ctx.db.delete(required(rsItemIds, item.articleKey));
  for (const category of diffs.roomServiceCategories.deletes) await ctx.db.delete(required(categoryIds, category.key));
  for (const component of diffs.comboComponents.deletes) {
    await ctx.db.delete(required(componentIds, RESTORE_IDENTITY.comboComponent(component)));
  }
  for (const link of diffs.articleAddonGroups.deletes) {
    await ctx.db.delete(required(linkIds, RESTORE_IDENTITY.articleAddonGroup(link)));
  }
  for (const placement of diffs.placements.deletes) {
    await ctx.db.delete(required(placementIds, RESTORE_IDENTITY.placement(placement)));
  }
  for (const variant of diffs.variants.deletes) await ctx.db.delete(required(variantIds, variant.key));
  for (const option of diffs.addonOptions.deletes) await ctx.db.delete(required(optionIds, option.key));
  for (const group of diffs.addonGroups.deletes) await ctx.db.delete(required(groupIds, group.key));
  for (const article of diffs.articles.deletes) await ctx.db.delete(required(articleIds, article.key));
  for (const section of diffs.sections.deletes) await ctx.db.delete(required(sectionIds, section.key));
  for (const page of diffs.pages.deletes) await ctx.db.delete(required(pageIds, page.key));

  // --- exact counters of the rows that were not rewritten above ----------------------
  for (const page of docs.pages) {
    if (patchedPages.has(page.key) || !final.pages.some((row) => row.key === page.key)) continue;
    const count = placementCount.get(page.key) ?? 0;
    if (page.placementCount !== count) await ctx.db.patch(page._id, { placementCount: count });
  }
  for (const group of docs.addonGroups) {
    if (patchedGroups.has(group.key) || !final.addonGroups.some((row) => row.key === group.key)) continue;
    const count = linkCount.get(group.key) ?? 0;
    if (group.linkCount !== count) await ctx.db.patch(group._id, { linkCount: count });
  }
}
