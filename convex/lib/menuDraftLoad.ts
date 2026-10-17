import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MENU_DRAFT_LOAD_LIMITS } from "../../lib/menu/budget";
import { MENU_VERSION_ERROR } from "../../lib/menu/errors/versions";
import type { MenuPresentationValues } from "../../lib/menu/presentation";
import {
  MENU_SNAPSHOT_FORMAT,
  sortSnapshot,
  type MenuDraftSnapshot,
  type SnapshotTranslations,
} from "../../lib/menu/snapshot";

// =============================================================================
// ScanMe Menu V1 (K05) — the whole draft of one Menu service, read once.
//
// Publish, its preview and restore need every draft row: one bounded index
// read per table (by menuServiceId), never a per-item query. Ids are turned
// into stable keys, so the result (a MenuDraftSnapshot, lib/menu/snapshot.ts)
// is what a version stores and what a restore compares against. A draft over
// any MENU_DRAFT_LOAD_LIMITS ceiling is refused as too large: nothing is
// written by the caller.
//
// Rows whose parent is missing (a dangling placement, a link to a deleted
// group) are left out of the snapshot; they never reach guests.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

export type DraftDocs = {
  pages: Doc<"menuPages">[];
  sections: Doc<"menuSections">[];
  articles: Doc<"menuArticles">[];
  placements: Doc<"menuPlacements">[];
  variants: Doc<"menuVariants">[];
  addonGroups: Doc<"menuAddonGroups">[];
  addonOptions: Doc<"menuAddonOptions">[];
  articleAddonGroups: Doc<"menuArticleAddonGroups">[];
  comboComponents: Doc<"menuComboComponents">[];
  roomServiceConfig: Doc<"menuRoomService"> | null;
  roomServiceCategories: Doc<"menuRoomServiceCategories">[];
  roomServiceItems: Doc<"menuRoomServiceItems">[];
  presentation: Doc<"menuPresentation"> | null;
};

export type LoadedDraft = { docs: DraftDocs; snapshot: MenuDraftSnapshot };

function bounded<T>(rows: T[], limit: number): T[] {
  if (rows.length > limit) throw new ConvexError(MENU_VERSION_ERROR.publishTooLarge);
  return rows;
}

function translationsOf(value: Doc<"menuArticles">["translations"]): SnapshotTranslations {
  return value === undefined ? null : (value as SnapshotTranslations);
}

export function presentationValues(row: Doc<"menuPresentation">): MenuPresentationValues {
  return {
    layout: row.layout,
    paletteId: row.paletteId,
    brandColors: row.brandColors ?? null,
    fontPairId: row.fontPairId,
    density: row.density,
    emphasis: row.emphasis,
    defaultMediaMode: row.defaultMediaMode,
    search: row.search,
    filters: row.filters,
    currencyToggle: row.currencyToggle,
    branding: row.branding,
  };
}

export async function loadDraftDocs(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<DraftDocs> {
  const L = MENU_DRAFT_LOAD_LIMITS;
  const id = menuServiceId;
  return {
    pages: bounded(
      await ctx.db
        .query("menuPages")
        .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", id))
        .take(L.pages + 1),
      L.pages,
    ),
    sections: bounded(
      await ctx.db
        .query("menuSections")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.sections + 1),
      L.sections,
    ),
    articles: bounded(
      await ctx.db
        .query("menuArticles")
        .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", id))
        .take(L.articles + 1),
      L.articles,
    ),
    placements: bounded(
      await ctx.db
        .query("menuPlacements")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.placements + 1),
      L.placements,
    ),
    variants: bounded(
      await ctx.db
        .query("menuVariants")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.variants + 1),
      L.variants,
    ),
    addonGroups: bounded(
      await ctx.db
        .query("menuAddonGroups")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.addonGroups + 1),
      L.addonGroups,
    ),
    addonOptions: bounded(
      await ctx.db
        .query("menuAddonOptions")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.addonOptions + 1),
      L.addonOptions,
    ),
    articleAddonGroups: bounded(
      await ctx.db
        .query("menuArticleAddonGroups")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.articleAddonGroups + 1),
      L.articleAddonGroups,
    ),
    comboComponents: bounded(
      await ctx.db
        .query("menuComboComponents")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.comboComponents + 1),
      L.comboComponents,
    ),
    roomServiceConfig: await ctx.db
      .query("menuRoomService")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
      .first(),
    roomServiceCategories: bounded(
      await ctx.db
        .query("menuRoomServiceCategories")
        .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", id))
        .take(L.roomServiceCategories + 1),
      L.roomServiceCategories,
    ),
    roomServiceItems: bounded(
      await ctx.db
        .query("menuRoomServiceItems")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
        .take(L.roomServiceItems + 1),
      L.roomServiceItems,
    ),
    presentation: await ctx.db
      .query("menuPresentation")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", id))
      .first(),
  };
}

/** The snapshot of loaded draft rows (pure mapping; ids become keys). */
export function snapshotOfDocs(menuService: Doc<"menuServices">, docs: DraftDocs): MenuDraftSnapshot {
  const pageKey = new Map(docs.pages.map((row) => [row._id, row.key]));
  const sectionKey = new Map<Id<"menuSections">, { key: string; pageKey: string }>();
  for (const row of docs.sections) {
    const page = pageKey.get(row.pageId);
    if (page) sectionKey.set(row._id, { key: row.key, pageKey: page });
  }
  const articleKey = new Map(docs.articles.map((row) => [row._id, row.key]));
  const groupKey = new Map(docs.addonGroups.map((row) => [row._id, row.key]));
  const categoryKey = new Map(docs.roomServiceCategories.map((row) => [row._id, row.key]));
  const settings = menuService.settings;

  const snapshot: MenuDraftSnapshot = {
    formatVersion: MENU_SNAPSHOT_FORMAT,
    settings: {
      languages: settings?.languages
        ? { source: settings.languages.source, translations: [...settings.languages.translations] }
        : null,
      allergensEnabled: settings?.allergensEnabled ?? null,
    },
    presentation: docs.presentation ? presentationValues(docs.presentation) : null,
    pages: docs.pages.map((row) => ({
      key: row.key,
      slug: row.slug,
      name: row.name,
      publicTitle: row.publicTitle ?? null,
      isDefault: row.isDefault,
      order: row.order,
      visibility: row.visibility,
      archivedAt: row.archivedAt ?? null,
      iconKey: row.iconKey ?? null,
      navigation: row.navigation,
      translations: translationsOf(row.translations),
    })),
    sections: docs.sections.flatMap((row) => {
      const ref = sectionKey.get(row._id);
      if (!ref) return [];
      return [
        {
          key: row.key,
          pageKey: ref.pageKey,
          name: row.name,
          description: row.description ?? null,
          iconKey: row.iconKey ?? null,
          order: row.order,
          visibility: row.visibility,
          translations: translationsOf(row.translations),
        },
      ];
    }),
    articles: docs.articles.map((row) => ({
      key: row.key,
      kind: row.kind,
      name: row.name,
      description: row.description ?? null,
      quantityValue: row.quantityValue ?? null,
      quantityUnit: row.quantityUnit ?? null,
      basePriceRsd: row.basePriceRsd ?? null,
      mediaMode: row.mediaMode,
      imageMediaId: row.imageMediaId ?? null,
      iconKey: row.iconKey ?? null,
      variantsEnabled: row.variantsEnabled === true,
      addonsEnabled: row.addonsEnabled === true,
      noteEnabled: row.noteEnabled === true,
      allergens: row.allergens
        ? {
            contains: [...row.allergens.contains],
            mayContain: [...row.allergens.mayContain],
            otherText: row.allergens.otherText ?? null,
          }
        : null,
      tags: row.tags ? [...row.tags] : null,
      promo: row.promo ? { ...row.promo } : null,
      priceCheck: row.priceCheck
        ? {
            since: row.priceCheck.since,
            changedComponentKeys: [...row.priceCheck.changedComponentKeys],
            removedComponentNames: [...row.priceCheck.removedComponentNames],
          }
        : null,
      translations: translationsOf(row.translations),
    })),
    placements: docs.placements.flatMap((row) => {
      const section = sectionKey.get(row.sectionId);
      const article = articleKey.get(row.articleId);
      if (!section || !article || pageKey.get(row.pageId) !== section.pageKey) return [];
      return [
        {
          pageKey: section.pageKey,
          sectionKey: section.key,
          articleKey: article,
          order: row.order,
          visibility: row.visibility,
        },
      ];
    }),
    variants: docs.variants.flatMap((row) => {
      const article = articleKey.get(row.articleId);
      if (!article) return [];
      return [
        {
          key: row.key,
          articleKey: article,
          name: row.name,
          priceRsd: row.priceRsd ?? null,
          order: row.order,
          translations: translationsOf(row.translations),
        },
      ];
    }),
    addonGroups: docs.addonGroups.map((row) => ({
      key: row.key,
      name: row.name,
      selection: row.selection,
      required: row.required,
      minSelect: row.minSelect ?? null,
      maxSelect: row.maxSelect ?? null,
      translations: translationsOf(row.translations),
    })),
    addonOptions: docs.addonOptions.flatMap((row) => {
      const group = groupKey.get(row.groupId);
      if (!group) return [];
      return [
        {
          key: row.key,
          groupKey: group,
          name: row.name,
          priceDeltaRsd: row.priceDeltaRsd,
          order: row.order,
          translations: translationsOf(row.translations),
        },
      ];
    }),
    articleAddonGroups: docs.articleAddonGroups.flatMap((row) => {
      const article = articleKey.get(row.articleId);
      const group = groupKey.get(row.groupId);
      if (!article || !group) return [];
      return [{ articleKey: article, groupKey: group, order: row.order }];
    }),
    comboComponents: docs.comboComponents.flatMap((row) => {
      const combo = articleKey.get(row.comboArticleId);
      const component = articleKey.get(row.componentArticleId);
      if (!combo || !component) return [];
      return [{ comboKey: combo, componentKey: component, quantity: row.quantity, order: row.order }];
    }),
    roomService: {
      config: docs.roomServiceConfig
        ? {
            markupBps: docs.roomServiceConfig.markupBps ?? null,
            markupScope: docs.roomServiceConfig.markupScope,
            deliveryFeeRsd: docs.roomServiceConfig.deliveryFeeRsd ?? null,
          }
        : null,
      categories: docs.roomServiceCategories.map((row) => ({
        key: row.key,
        name: row.name,
        order: row.order,
        translations: translationsOf(row.translations),
      })),
      items: docs.roomServiceItems.flatMap((row) => {
        const article = articleKey.get(row.articleId);
        const category = categoryKey.get(row.categoryId);
        if (!article || !category) return [];
        return [
          {
            articleKey: article,
            categoryKey: category,
            order: row.order,
            markupApplies: row.markupApplies,
            manualPriceRsd: row.manualPriceRsd ?? null,
            priceWarning: row.priceWarning ? { ...row.priceWarning } : null,
            manualVariantPrices: row.manualVariantPrices
              ? row.manualVariantPrices.map((price) => ({
                  variantKey: price.variantKey,
                  priceRsd: price.priceRsd,
                  priceWarning: price.priceWarning ? { ...price.priceWarning } : null,
                }))
              : null,
          },
        ];
      }),
    },
  };
  return sortSnapshot(snapshot);
}

export async function loadDraft(ctx: DatabaseCtx, menuService: Doc<"menuServices">): Promise<LoadedDraft> {
  const docs = await loadDraftDocs(ctx, menuService._id);
  return { docs, snapshot: snapshotOfDocs(menuService, docs) };
}
