import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { touchDraft, writeMenuAudit } from "./lib/menuDraft";
import {
  LEGACY_MIGRATION_ACTOR_REF,
  defaultPageOf,
  legacyMenuForService,
  legacyPlanOptions,
  loadActiveMenuService,
  loadLegacySource,
  loadLegacyTarget,
  writeLegacySlice,
} from "./lib/menuLegacyMigration";
import type { MenuMigrationBlocker } from "../lib/menu/errors/migration";
import {
  MENU_MIGRATION_BATCH,
  matchOrderingItems,
  planLegacyMenu,
  type LegacySource,
} from "../lib/menu/legacy-mapping";
import {
  MENU_MAX_ARTICLE_BATCH,
  MENU_MAX_PLACEMENTS_PER_ARTICLE,
  MENU_MAX_VARIANTS_PER_ARTICLE,
} from "../lib/menu/limits";

// =============================================================================
// ScanMe Menu V1 (K06) — migration of the legacy `menus` model into the new
// model (recipe §12; master §6.2–§6.3, §17.4). INTERNAL ONLY: the migration is
// ScanMe's job (master §6.2), never the client's, so nothing here is callable
// from a browser. Run by an operator with `npx convex run` — and not in this
// run: the functions are proven by tests and released later, with approval.
//
//   planLegacyMigration     the report only (nothing is written): counts,
//                           prices, duplicates, text, what is not mapped,
//                           the ordering list, and — after a migration — the
//                           differences between migrated rows and the source.
//   migrateLegacyMenuBatch  writes ≤ 100 articles per transaction and continues
//                           itself through the scheduler; idempotent (derived
//                           keys, an existing key is never written again).
//   purgeMigratedService    rollback of the migration: removes only rows a
//                           migration or import created and nobody changed.
//   cutoverLegacyMenu       switches the legacy writers off (only after the new
//                           model is published); revertLegacyCutover undoes it.
//
// The legacy tables are never written or deleted here (widen → migrate →
// narrow); the legacy public menu keeps serving until the new model is
// published and the public route switches (K13).
// =============================================================================

function sourceChanged(
  migration: NonNullable<Doc<"menuServices">["migration"]>,
  menuId: Id<"menus">,
  source: LegacySource,
): boolean {
  return (
    migration.legacyMenuId !== menuId ||
    migration.sourceKind !== source.kind ||
    migration.sourceRevision !== source.revision
  );
}

function batchSizeOf(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return MENU_MIGRATION_BATCH;
  return Math.min(MENU_MIGRATION_BATCH, Math.max(1, Math.floor(requested)));
}

/**
 * The report-only mode (master §6.3): what a migration would write and what
 * the operator must check, plus, for rows already migrated, whether they still
 * match the legacy source. Reads the whole source in one transaction — the
 * same per-item pattern as the legacy public read (convex/menu.ts
 * publicMenuBySlug), so any legacy menu guests can open can be planned.
 */
export const planLegacyMigration = internalQuery({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const service = await loadActiveMenuService(ctx, args.menuServiceId);
    const menu = await legacyMenuForService(ctx, service);
    const source = await loadLegacySource(ctx, menu, { withPairings: true });
    const page = await defaultPageOf(ctx, service._id);
    const loaded = await loadLegacyTarget(ctx, service, page, { verify: true });
    const plan = planLegacyMenu(source, loaded.target, legacyPlanOptions(true));
    const blockers: MenuMigrationBlocker[] = [...plan.report.blockers];
    if (service.migration && sourceChanged(service.migration, menu._id, source)) {
      blockers.unshift("source_changed");
    }
    const orderingRows = await ctx.db
      .query("orderingItems")
      .withIndex("by_businessId_and_order", (q) => q.eq("businessId", service.businessId))
      .take(500);
    return {
      legacyMenuId: menu._id,
      migration: service.migration ?? null,
      report: { ...plan.report, blockers },
      orderingItems: matchOrderingItems(orderingRows, plan.articles),
    };
  },
});

const ZERO_WRITES = {
  sections: 0,
  articles: 0,
  placements: 0,
  variants: 0,
  availability: 0,
  skippedExisting: 0,
};

/**
 * One batch of the migration: ensures the planned sections, writes the
 * articles of [cursor, cursor + batchSize) that do not exist yet, and
 * schedules the next batch until the plan is done. A finished migration
 * (`migrated` or `cutover`) is never run again: the second run changes
 * nothing. A run that stopped (status `running`) is resumed by calling it
 * again, from any cursor: existing keys are skipped.
 */
export const migrateLegacyMenuBatch = internalMutation({
  args: {
    menuServiceId: v.id("menuServices"),
    cursor: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const service = await loadActiveMenuService(ctx, args.menuServiceId);
    const status = service.migration?.status;
    if (status === "migrated" || status === "cutover") {
      return { ok: true as const, done: true, alreadyMigrated: true, status, cursor: 0, total: 0, written: ZERO_WRITES };
    }
    // A continuation whose run was purged in the meantime stops here; a new
    // run starts again from cursor 0.
    if (!service.migration && args.cursor !== undefined && args.cursor > 0) {
      return { ok: true as const, done: true, alreadyMigrated: false, status: "stopped" as const, cursor: 0, total: 0, written: ZERO_WRITES };
    }
    const menu = await legacyMenuForService(ctx, service);
    const source = await loadLegacySource(ctx, menu, { withPairings: false });
    if (service.migration && sourceChanged(service.migration, menu._id, source)) {
      return { ok: false as const, blockers: ["source_changed"] as MenuMigrationBlocker[] };
    }
    const page = await defaultPageOf(ctx, service._id);
    const loaded = await loadLegacyTarget(ctx, service, page, { verify: false });
    const plan = planLegacyMenu(source, loaded.target, legacyPlanOptions(false));
    if (plan.report.blockers.length > 0) {
      return { ok: false as const, blockers: plan.report.blockers };
    }

    const now = Date.now();
    const batchSize = batchSizeOf(args.batchSize);
    const cursor =
      args.cursor !== undefined && Number.isFinite(args.cursor) ? Math.max(0, Math.floor(args.cursor)) : 0;
    const migration: NonNullable<Doc<"menuServices">["migration"]> = service.migration ?? {
      status: "running",
      legacyMenuId: menu._id,
      sourceKind: source.kind === "live" ? "live" : "draft",
      sourceRevision: source.revision,
      startedAt: now,
    };
    if (!service.migration) {
      await ctx.db.patch(service._id, { migration, legacyMenuId: menu._id, updatedAt: now });
    }

    const written = await writeLegacySlice(ctx, {
      menuServiceId: service._id,
      loaded,
      plan,
      from: cursor,
      to: cursor + batchSize,
      now,
    });
    if (written.sections > 0 || written.articles > 0) {
      await touchDraft(ctx, service._id, null, { articleDelta: written.articles });
    }

    const next = Math.min(cursor + batchSize, plan.articles.length);
    const done = next >= plan.articles.length;
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.menuMigration.migrateLegacyMenuBatch, {
        menuServiceId: service._id,
        cursor: next,
        batchSize,
      });
    } else {
      await ctx.db.patch(service._id, {
        migration: { ...migration, status: "migrated", migratedAt: now },
        updatedAt: now,
      });
      const report = plan.report;
      await writeMenuAudit(ctx, {
        menuServiceId: service._id,
        actorKind: "system",
        actorRef: LEGACY_MIGRATION_ACTOR_REF,
        action: "legacy.migrated",
        entityType: "menus",
        entityKey: menu._id,
        details: {
          source: source.kind,
          sourceRevision: source.revision,
          sections: report.planned.sections,
          articles: report.planned.articles,
          variants: report.planned.variants,
          unavailable: report.planned.unavailable,
          images: report.planned.images,
          skippedItems: report.planned.skippedItems,
          duplicates: report.duplicateCount,
          warnings: report.warningCount,
        },
      });
    }
    return { ok: true as const, done, alreadyMigrated: false, status: done ? "migrated" : "running", cursor: next, total: plan.articles.length, written };
  },
});

// -----------------------------------------------------------------------------
// Rollback of the migration phase
// -----------------------------------------------------------------------------

/** True when the article is used by something the migration did not create. */
async function articleInUse(ctx: MutationCtx, article: Doc<"menuArticles">): Promise<boolean> {
  const addon = await ctx.db
    .query("menuArticleAddonGroups")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
    .first();
  if (addon) return true;
  const combo = await ctx.db
    .query("menuComboComponents")
    .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", article._id))
    .first();
  if (combo) return true;
  const roomService = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
    .first();
  return roomService !== null;
}

/**
 * Removes, in batches, the rows a migration or an import created (`legacyRef`)
 * that nobody changed since: the article with its placements, variants and the
 * availability row the migration set (kept while a version is published —
 * the next publication removes it, K05). An article edited in the new editor
 * (`updatedAt` moved), used by an add-on group, a combo or Room service, or
 * shown in a section the migration did not create, is KEPT and counted. Then
 * the empty migrated sections go, and the migration state is cleared so the
 * menu can be migrated again. The legacy menu is untouched and stays the
 * source. Refused after the cutover (revert it first).
 */
export const purgeMigratedService = internalMutation({
  args: {
    menuServiceId: v.id("menuServices"),
    cursor: v.optional(v.union(v.string(), v.null())),
    deletedSoFar: v.optional(v.number()),
    keptSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const service = await loadActiveMenuService(ctx, args.menuServiceId);
    if (service.migration?.status === "cutover") {
      return { ok: false as const, blockers: ["cutover_active"] as MenuMigrationBlocker[] };
    }
    const result = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", service._id))
      .paginate({ cursor: args.cursor ?? null, numItems: MENU_MAX_ARTICLE_BATCH });

    let deleted = 0;
    let kept = 0;
    const placementsRemovedByPage = new Map<Id<"menuPages">, number>();
    const sectionIsMigrated = new Map<Id<"menuSections">, boolean>();
    for (const article of result.page) {
      if (article.legacyRef === undefined) continue;
      if (article.updatedAt !== article.createdAt || (await articleInUse(ctx, article))) {
        kept += 1;
        continue;
      }
      const placements = await ctx.db
        .query("menuPlacements")
        .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
        .take(MENU_MAX_PLACEMENTS_PER_ARTICLE);
      let foreignPlacement = false;
      for (const placement of placements) {
        if (!sectionIsMigrated.has(placement.sectionId)) {
          const section = await ctx.db.get(placement.sectionId);
          sectionIsMigrated.set(placement.sectionId, section?.legacyRef !== undefined);
        }
        if (!sectionIsMigrated.get(placement.sectionId)) foreignPlacement = true;
      }
      if (foreignPlacement) {
        kept += 1;
        continue;
      }
      for (const placement of placements) {
        await ctx.db.delete(placement._id);
        placementsRemovedByPage.set(
          placement.pageId,
          (placementsRemovedByPage.get(placement.pageId) ?? 0) + 1,
        );
      }
      const variants = await ctx.db
        .query("menuVariants")
        .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
        .take(MENU_MAX_VARIANTS_PER_ARTICLE + 1);
      for (const variant of variants) await ctx.db.delete(variant._id);
      if (!service.liveVersionId) {
        const availability = await ctx.db
          .query("menuAvailability")
          .withIndex("by_menuServiceId_and_articleKey", (q) =>
            q.eq("menuServiceId", service._id).eq("articleKey", article.key),
          )
          .first();
        if (availability?.setByRef === LEGACY_MIGRATION_ACTOR_REF) {
          await ctx.db.delete(availability._id);
        }
      }
      await ctx.db.delete(article._id);
      deleted += 1;
    }
    for (const [pageId, removed] of placementsRemovedByPage) {
      const page = await ctx.db.get(pageId);
      if (page) {
        await ctx.db.patch(page._id, { placementCount: Math.max(0, page.placementCount - removed) });
      }
    }

    const deletedSoFar = (args.deletedSoFar ?? 0) + deleted;
    const keptSoFar = (args.keptSoFar ?? 0) + kept;
    let sectionsDeleted = 0;
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.menuMigration.purgeMigratedService, {
        menuServiceId: service._id,
        cursor: result.continueCursor,
        deletedSoFar,
        keptSoFar,
      });
    } else {
      const sections = await ctx.db
        .query("menuSections")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", service._id))
        .take(1000);
      for (const section of sections) {
        if (section.legacyRef === undefined) continue;
        const placement = await ctx.db
          .query("menuPlacements")
          .withIndex("by_sectionId_and_order", (q) => q.eq("sectionId", section._id))
          .first();
        if (placement) continue;
        await ctx.db.delete(section._id);
        sectionsDeleted += 1;
      }
      const now = Date.now();
      if (service.migration) {
        await ctx.db.patch(service._id, { migration: undefined, updatedAt: now });
      }
      if (service.migration || deletedSoFar > 0 || sectionsDeleted > 0) {
        await writeMenuAudit(ctx, {
          menuServiceId: service._id,
          actorKind: "system",
          actorRef: LEGACY_MIGRATION_ACTOR_REF,
          action: "legacy.purged",
          entityType: "menuServices",
          details: { articles: deletedSoFar, kept: keptSoFar, sections: sectionsDeleted },
        });
      }
    }
    if (deleted > 0 || sectionsDeleted > 0) {
      await touchDraft(ctx, service._id, null, { articleDelta: -deleted });
    }
    return {
      ok: true as const,
      done: result.isDone,
      deleted,
      kept,
      deletedSoFar,
      keptSoFar,
      sectionsDeleted,
    };
  },
});

// -----------------------------------------------------------------------------
// Cutover (no double writes) and its rollback
// -----------------------------------------------------------------------------

/**
 * Switches the legacy writers off for the migrated menu (convex/lib/
 * menuLegacyGuard.ts). Only after the migration finished AND the new model
 * has a published version: until guests get the new menu, the floor must still
 * be able to mark "nema više" on the old one.
 */
export const cutoverLegacyMenu = internalMutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const service = await loadActiveMenuService(ctx, args.menuServiceId);
    const migration = service.migration;
    if (!migration || migration.status === "running") {
      return { ok: false as const, blockers: ["not_migrated"] as MenuMigrationBlocker[] };
    }
    if (migration.status === "cutover") return { ok: true as const, changed: false };
    if (!service.liveVersionId) {
      return { ok: false as const, blockers: ["not_published"] as MenuMigrationBlocker[] };
    }
    const now = Date.now();
    await ctx.db.patch(service._id, {
      migration: { ...migration, status: "cutover", cutoverAt: now },
      updatedAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: service._id,
      actorKind: "system",
      actorRef: LEGACY_MIGRATION_ACTOR_REF,
      action: "legacy.cutover",
      entityType: "menus",
      entityKey: migration.legacyMenuId,
    });
    return { ok: true as const, changed: true };
  },
});

/** Rollback of the cutover: the legacy writers work again (status back to `migrated`). */
export const revertLegacyCutover = internalMutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const service = await loadActiveMenuService(ctx, args.menuServiceId);
    const migration = service.migration;
    if (migration?.status !== "cutover") return { ok: true as const, changed: false };
    const now = Date.now();
    await ctx.db.patch(service._id, {
      migration: {
        status: "migrated",
        legacyMenuId: migration.legacyMenuId,
        sourceKind: migration.sourceKind,
        sourceRevision: migration.sourceRevision,
        startedAt: migration.startedAt,
        ...(migration.migratedAt !== undefined ? { migratedAt: migration.migratedAt } : {}),
      },
      updatedAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: service._id,
      actorKind: "system",
      actorRef: LEGACY_MIGRATION_ACTOR_REF,
      action: "legacy.cutover_reverted",
      entityType: "menus",
      entityKey: migration.legacyMenuId,
    });
    return { ok: true as const, changed: true };
  },
});
