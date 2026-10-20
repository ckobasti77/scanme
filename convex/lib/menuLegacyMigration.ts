import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { menuForBusiness } from "../menu";
import { loadDraftState } from "./menuDraft";
import { MENU_ERROR } from "../../lib/menu/errors/core";
import { MENU_MIGRATION_ERROR } from "../../lib/menu/errors/migration";
import {
  MENU_LEGACY_MAX_GROUPS,
  legacySourceFromModel,
  type LegacyMigrationPlan,
  type LegacyModelInput,
  type LegacyPlanOptions,
  type LegacySource,
  type LegacySourceGroup,
  type LegacyTarget,
} from "../../lib/menu/legacy-mapping";
import {
  MENU_MAX_ARTICLES,
  MENU_MAX_PAGES,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_SECTIONS_PER_PAGE,
  MENU_MAX_VARIANTS_PER_ARTICLE,
} from "../../lib/menu/limits";
import { MENU_DRAFT_LOAD_LIMITS } from "../../lib/menu/budget";
import { menuDomenSr } from "../../lib/i18n/sr/menu-domen";

// =============================================================================
// ScanMe Menu V1 (K06) — reading the legacy source and the target draft, and
// writing a slice of a migration plan (lib/menu/legacy-mapping.ts). Shared by
// convex/menuMigration.ts (the internal migration) and
// convex/menuAdmin.ts importDraftV2 (the internal import, master §6.2).
//
// The legacy tables are only READ here: nothing in the old model is patched
// or deleted (widen → migrate → narrow; narrow is a later, approved step).
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

/** `setByRef` of availability rows written by a migration or an import. */
export const LEGACY_MIGRATION_ACTOR_REF = "legacy-migration";

/** "Ide uz" rows read per legacy item (lib/menu-blocks.ts MAX_PAIRINGS_PER_ITEM is 10). */
const LEGACY_MAX_PAIRINGS_READ = 11;

export function legacyPlanOptions(verify: boolean): LegacyPlanOptions {
  return { fallbacks: menuDomenSr.migrationFallbacks, verify };
}

/** The Menu service, refusing archived or missing ones. */
export async function loadActiveMenuService(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuServices">> {
  const service = await ctx.db.get(menuServiceId);
  if (!service || service.status !== "active") throw new ConvexError(MENU_ERROR.notFound);
  return service;
}

/**
 * The legacy menu guests are served for the business (convex/menu.ts
 * menuForBusiness: the oldest row). A service linked to another legacy row is
 * refused rather than migrating a menu nobody sees.
 */
export async function legacyMenuForService(
  ctx: DatabaseCtx,
  service: Doc<"menuServices">,
): Promise<Doc<"menus">> {
  const menu = await menuForBusiness(ctx, service.businessId);
  if (!menu) throw new ConvexError(MENU_MIGRATION_ERROR.legacyMenuMissing);
  if (service.legacyMenuId && service.legacyMenuId !== menu._id) {
    throw new ConvexError(MENU_MIGRATION_ERROR.legacyMenuMismatch);
  }
  return menu;
}

/** The active default page ("Kompletan meni") every migration and import writes into. */
export async function defaultPageOf(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuPages">> {
  const pages = await ctx.db
    .query("menuPages")
    .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
    .take(MENU_MAX_PAGES + 1);
  const page = pages.find((row) => row.isDefault && row.archivedAt === undefined);
  if (!page) throw new ConvexError(MENU_MIGRATION_ERROR.defaultPageMissing);
  return page;
}

/**
 * The legacy source (K01 §6): the inline draft when the menu has one, else
 * the LIVE generation only (`publishGeneration === publishedGeneration`; an
 * older generation still awaiting cleanup is never read). A draft source also
 * reads the live items once, so a live "nema više" wins over a draft that
 * still says available.
 */
export async function loadLegacySource(
  ctx: DatabaseCtx,
  menu: Doc<"menus">,
  options: { withPairings: boolean },
): Promise<LegacySource> {
  const liveItems =
    menu.status === "published"
      ? await ctx.db
          .query("menuItems")
          .withIndex("by_menuId_and_publishGeneration", (q) =>
            q.eq("menuId", menu._id).eq("publishGeneration", menu.publishedGeneration),
          )
          .take(MENU_MAX_ARTICLES + 1)
      : [];

  if (menu.draftModel) {
    const liveUnavailableIds = new Set<string>();
    for (const row of liveItems) if (!row.available && row.key) liveUnavailableIds.add(row.key);
    return legacySourceFromModel(menu.draftModel as unknown as LegacyModelInput, {
      kind: "draft",
      revision: menu.draftRevision ?? 0,
      hasUnpublishedChanges: menu.hasUnpublishedChanges ?? false,
      liveUnavailableIds,
    });
  }

  const empty: LegacySource = {
    kind: "live",
    revision: menu.publishedGeneration ?? 0,
    hasUnpublishedChanges: false,
    groups: [],
    daypartCount: 0,
    daypartOverride: Boolean(menu.daypartOverride),
  };
  if (menu.status !== "published") return empty;

  const groupRows = await ctx.db
    .query("menuGroups")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menu._id).eq("publishGeneration", menu.publishedGeneration),
    )
    .take(MENU_LEGACY_MAX_GROUPS);
  const daypartRows = await ctx.db
    .query("menuDayparts")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menu._id).eq("publishGeneration", menu.publishedGeneration),
    )
    .take(100);

  const groups = new Map<Id<"menuGroups">, LegacySourceGroup>();
  for (const row of [...groupRows].sort((left, right) => left.order - right.order)) {
    groups.set(row._id, {
      id: row._id,
      title: row.title,
      shape: row.shape,
      ...(row.iconKey !== undefined ? { iconKey: row.iconKey } : {}),
      ...(row.daypartKey !== undefined ? { daypartKey: row.daypartKey } : {}),
      items: [],
    });
  }
  const sortedItems = [...liveItems].sort((left, right) => left.order - right.order);
  for (const item of sortedItems) {
    const group = groups.get(item.groupId);
    if (!group) continue;
    const variants = await ctx.db
      .query("itemVariants")
      .withIndex("by_itemId_and_order", (q) => q.eq("itemId", item._id))
      .take(MENU_MAX_VARIANTS_PER_ARTICLE + 1);
    const pairingCount = options.withPairings
      ? (
          await ctx.db
            .query("itemPairings")
            .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
            .take(LEGACY_MAX_PAIRINGS_READ)
        ).length
      : null;
    group.items.push({
      // TASK-58: `key` is the inline draft id the row was published from.
      id: item.key ?? item._id,
      name: item.name,
      ...(item.description !== undefined ? { description: item.description } : {}),
      productType: item.productType,
      ...(item.priceRsd !== undefined ? { priceRsd: item.priceRsd } : {}),
      ...(item.iconKey !== undefined ? { iconKey: item.iconKey } : {}),
      ...(item.photoStorageId !== undefined ? { photoStorageId: item.photoStorageId } : {}),
      ...(item.videoStorageId !== undefined ? { videoStorageId: item.videoStorageId } : {}),
      available: item.available,
      variants: variants.map((variant) => ({
        id: variant._id,
        label: variant.label,
        priceRsd: variant.priceRsd,
      })),
      pairingCount,
    });
  }
  return {
    ...empty,
    groups: [...groups.values()],
    daypartCount: daypartRows.length,
  };
}

export type LoadedLegacyTarget = {
  target: LegacyTarget;
  page: Doc<"menuPages">;
  sectionIdByKey: Map<string, Id<"menuSections">>;
  articleKeys: Set<string>;
};

/**
 * What the draft already holds: the default page's sections, every article of
 * the service (bounded by MENU_MAX_ARTICLES) and, for the post-migration
 * check, variants and the page's placements.
 */
export async function loadLegacyTarget(
  ctx: DatabaseCtx,
  service: Doc<"menuServices">,
  page: Doc<"menuPages">,
  options: { verify: boolean },
): Promise<LoadedLegacyTarget> {
  const state = await loadDraftState(ctx, service._id);
  const sections = await ctx.db
    .query("menuSections")
    .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
    .take(MENU_MAX_SECTIONS_PER_PAGE + 1);
  const articles = await ctx.db
    .query("menuArticles")
    .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", service._id))
    .take(MENU_MAX_ARTICLES + 1);

  const articleKeyById = new Map(articles.map((article) => [article._id, article.key]));
  const sectionKeyById = new Map(sections.map((section) => [section._id, section.key]));
  let variants: LegacyTarget["variants"] = [];
  let placements: LegacyTarget["placements"] = [];
  if (options.verify) {
    const variantRows = await ctx.db
      .query("menuVariants")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", service._id))
      .take(MENU_DRAFT_LOAD_LIMITS.variants);
    variants = variantRows.flatMap((row) => {
      const articleKey = articleKeyById.get(row.articleId);
      return articleKey
        ? [{ articleKey, name: row.name, ...(row.priceRsd !== undefined ? { priceRsd: row.priceRsd } : {}), order: row.order }]
        : [];
    });
    const placementRows = await ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_PLACEMENTS_PER_PAGE);
    placements = placementRows.flatMap((row) => {
      const articleKey = articleKeyById.get(row.articleId);
      const sectionKey = sectionKeyById.get(row.sectionId);
      return articleKey && sectionKey ? [{ articleKey, sectionKey, order: row.order }] : [];
    });
  }

  return {
    target: {
      articleCount: state.articleCount,
      pagePlacementCount: page.placementCount,
      sections: sections.map((section) => ({ key: section.key, name: section.name, order: section.order })),
      articles: articles.map((article) => ({
        key: article.key,
        name: article.name,
        nameNormalized: article.nameNormalized,
        ...(article.basePriceRsd !== undefined ? { basePriceRsd: article.basePriceRsd } : {}),
      })),
      variants,
      placements,
    },
    page,
    sectionIdByKey: new Map(sections.map((section) => [section.key, section._id])),
    articleKeys: new Set(articles.map((article) => article.key)),
  };
}

export type LegacyWriteResult = {
  sections: number;
  articles: number;
  placements: number;
  variants: number;
  availability: number;
  /** Planned articles whose key already exists (written earlier): left untouched. */
  skippedExisting: number;
};

/**
 * Writes the planned sections that are missing and the articles of
 * `plan.articles[from, to)` whose key does not exist yet — each with its
 * placement, its variants and, when unavailable, a live availability row.
 * An existing key is never overwritten, so a repeated or resumed batch writes
 * nothing twice and never undoes an edit made in the new editor. The caller
 * calls touchDraft once.
 */
export async function writeLegacySlice(
  ctx: MutationCtx,
  input: {
    menuServiceId: Id<"menuServices">;
    loaded: LoadedLegacyTarget;
    plan: Pick<LegacyMigrationPlan, "sections" | "articles">;
    from: number;
    to: number;
    now: number;
  },
): Promise<LegacyWriteResult> {
  const { menuServiceId, loaded, plan, now } = input;
  const page = loaded.page;
  const result: LegacyWriteResult = {
    sections: 0,
    articles: 0,
    placements: 0,
    variants: 0,
    availability: 0,
    skippedExisting: 0,
  };

  const sectionIdByKey = new Map(loaded.sectionIdByKey);
  for (const section of plan.sections) {
    if (sectionIdByKey.has(section.key)) continue;
    const sectionId = await ctx.db.insert("menuSections", {
      menuServiceId,
      pageId: page._id,
      key: section.key,
      name: section.name,
      ...(section.iconKey ? { iconKey: section.iconKey } : {}),
      order: section.order,
      visibility: "visible",
      legacyRef: section.legacyRef,
      createdAt: now,
      updatedAt: now,
    });
    sectionIdByKey.set(section.key, sectionId);
    result.sections += 1;
  }

  for (const article of plan.articles.slice(input.from, input.to)) {
    if (loaded.articleKeys.has(article.key)) {
      result.skippedExisting += 1;
      continue;
    }
    const sectionId = sectionIdByKey.get(article.sectionKey);
    if (!sectionId) throw new ConvexError(MENU_ERROR.notFound);
    const articleId = await ctx.db.insert("menuArticles", {
      menuServiceId,
      key: article.key,
      kind: "item",
      name: article.name,
      nameNormalized: article.nameNormalized,
      ...(article.description !== undefined ? { description: article.description } : {}),
      ...(article.basePriceRsd !== undefined ? { basePriceRsd: article.basePriceRsd } : {}),
      mediaMode: article.mediaMode,
      ...(article.iconKey !== undefined ? { iconKey: article.iconKey } : {}),
      ...(article.variants.length > 0 ? { variantsEnabled: true } : {}),
      legacyRef: article.legacyRef,
      ...(article.legacyPhotoStorageId
        ? { legacyPhotoStorageId: article.legacyPhotoStorageId as Id<"_storage"> }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("menuPlacements", {
      menuServiceId,
      pageId: page._id,
      sectionId,
      articleId,
      order: article.placementOrder,
      visibility: "visible",
      createdAt: now,
      updatedAt: now,
    });
    for (const variant of article.variants) {
      await ctx.db.insert("menuVariants", {
        menuServiceId,
        articleId,
        key: variant.key,
        name: variant.name,
        ...(variant.priceRsd !== undefined ? { priceRsd: variant.priceRsd } : {}),
        order: variant.order,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (article.unavailable) {
      const existing = await ctx.db
        .query("menuAvailability")
        .withIndex("by_menuServiceId_and_articleKey", (q) =>
          q.eq("menuServiceId", menuServiceId).eq("articleKey", article.key),
        )
        .first();
      if (!existing) {
        await ctx.db.insert("menuAvailability", {
          menuServiceId,
          articleKey: article.key,
          since: now,
          setByRef: LEGACY_MIGRATION_ACTOR_REF,
        });
        result.availability += 1;
      }
    }
    result.articles += 1;
    result.placements += 1;
    result.variants += article.variants.length;
  }

  if (result.placements > 0) {
    await ctx.db.patch(page._id, { placementCount: page.placementCount + result.placements });
  }
  return result;
}
