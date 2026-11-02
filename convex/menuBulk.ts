import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getMenuAccess, loadOwned, requireMenuAccessToRow } from "./lib/menuAccess";
import { flagCombosForPriceChange } from "./lib/menuArticleHooks";
import { menuVisibilityValidator } from "./lib/menuDomainValidators";
import { touchDraft } from "./lib/menuDraft";
import { applyArticleDeletion, loadDeletionPlan, type DeletionPlan } from "./menuArticleDetails";
import { assertPageActive } from "./menuCatalog";
import { flagRoomServicePriceWarnings } from "./menuRoomService";
import { bulkDeletionConfirmToken } from "../lib/menu/deletion";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import {
  MENU_MAX_BULK_BATCH,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_SECTIONS_PER_PAGE,
} from "../lib/menu/limits";
import { orderAfter } from "../lib/menu/order";
import { isValidRsd } from "../lib/menu/rsd";

// =============================================================================
// ScanMe Menu V1 — `Izaberi više` (K11; master §5.6, §13.4; K09 §4.5).
//
// ONE mutation per group action, each over at most MENU_MAX_BULK_BATCH
// articles or placements of ONE Menu service (the `menuServiceId` argument).
// Every id must belong to that service (loadOwned): a single foreign or
// missing id refuses the whole batch as `menu/not_found`, and a caller without
// a role there gets the same answer (requireMenuAccessToRow: no existence
// oracle across tenants). Each action is one transaction — all of it or none.
//
// Everything is a DRAFT change (touchDraft exactly once per batch that changed
// something; never on a refusal, a conflict, a "confirm" answer or a no-op),
// published only by Objavi — except availability, which is LIVE operational
// state (menuAvailability, "menu.availability", no touchDraft, not gated by
// client editing), exactly like menuAvailability.setAvailability.
//
//   setPrices        THE base price of many articles; compare-and-set on the
//                    price the owner saw for EVERY article, all or nothing;
//                    the same consequences as menuCatalog.setBasePrice (Room
//                    service warnings, combos "check the price").
//   setAvailability  "Privremeno nedostupno" / "Dostupno", live.
//   setVisibility    "Sakrij" / "Prikaži" placements (they keep their place).
//   removeFromPage   "Ukloni sa ove stranice": placements go, articles stay.
//   moveToSection    placements of one page to the end of a section of that
//                    page, in their current order.
//   addToPage        articles shown in a section (another page's, usually).
//   deleteImpact     (query) what deleting the articles removes, per article.
//   deleteArticles   two steps with a token over the impact of the whole batch
//                    (menuArticleDetails.deleteArticle per article).
// =============================================================================

function refuse(code: MenuErrorCode): ConvexError<string> {
  return new ConvexError(code);
}

/** Distinct ids in the order given; refuses an empty or too large batch. */
function batchOf<T extends string>(ids: readonly T[]): T[] {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MENU_MAX_BULK_BATCH) throw refuse(MENU_ERROR.invalidInput);
  return unique;
}

async function loadAll<T extends "menuArticles" | "menuPlacements">(
  ctx: MutationCtx,
  ids: readonly Id<T>[],
  menuServiceId: Id<"menuServices">,
): Promise<Doc<T>[]> {
  const docs: Doc<T>[] = [];
  for (const id of ids) docs.push(await loadOwned(ctx, id, menuServiceId));
  return docs;
}

/** The pages of `placements`, each active (an archived page is not edited). */
async function activePagesOf(
  ctx: MutationCtx,
  placements: readonly Doc<"menuPlacements">[],
  menuServiceId: Id<"menuServices">,
): Promise<Map<Id<"menuPages">, Doc<"menuPages">>> {
  const pages = new Map<Id<"menuPages">, Doc<"menuPages">>();
  for (const placement of placements) {
    if (pages.has(placement.pageId)) continue;
    const page = await loadOwned(ctx, placement.pageId, menuServiceId);
    assertPageActive(page);
    pages.set(page._id, page);
  }
  return pages;
}

// -----------------------------------------------------------------------------
// Prices
// -----------------------------------------------------------------------------

export const setPrices = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    changes: v.array(
      v.object({
        articleId: v.id("menuArticles"),
        expectedPriceRsd: v.union(v.number(), v.null()),
        priceRsd: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const ids = args.changes.map((change) => change.articleId);
    // A duplicate article would make "the price the owner saw" ambiguous.
    if (batchOf(ids).length !== ids.length) throw refuse(MENU_ERROR.invalidInput);
    if (args.changes.some((change) => !isValidRsd(change.priceRsd))) throw refuse(MENU_ERROR.invalidInput);
    if (args.changes.some((change) => change.expectedPriceRsd !== null && !isValidRsd(change.expectedPriceRsd))) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const articles = await loadAll(ctx, ids, args.menuServiceId);

    // Compare-and-set on EVERY article first: one stale price writes nothing.
    const conflicts = articles.flatMap((article, index) => {
      const change = args.changes[index];
      const current = article.basePriceRsd ?? null;
      return current === change.expectedPriceRsd
        ? []
        : [{ articleId: article._id, currentPriceRsd: current, attemptedPriceRsd: change.priceRsd }];
    });
    if (conflicts.length > 0) return { status: "conflict" as const, conflicts };

    const now = Date.now();
    let changed = 0;
    // Items first, combos last: a component changed in the same batch flags its
    // combo, and the combo's own new price (the owner's answer) then clears it.
    const order = articles
      .map((article, index) => ({ article, priceRsd: args.changes[index].priceRsd }))
      .sort((a, b) => (a.article.kind === "combo" ? 1 : 0) - (b.article.kind === "combo" ? 1 : 0));
    for (const { article, priceRsd } of order) {
      const previous = article.basePriceRsd ?? null;
      if (priceRsd === previous) continue;
      await ctx.db.patch(article._id, {
        basePriceRsd: priceRsd,
        // K04: a new combo price is the client's decision on "check the combo price".
        ...(article.kind === "combo" ? { priceCheck: undefined } : {}),
        updatedAt: now,
        updatedByUserId: access.user._id,
      });
      await flagRoomServicePriceWarnings(ctx, article._id, previous, priceRsd);
      await flagCombosForPriceChange(ctx, article, now);
      changed += 1;
    }
    if (changed > 0) await touchDraft(ctx, args.menuServiceId, access.user._id);
    return { status: "changed" as const, changed };
  },
});

// -----------------------------------------------------------------------------
// Availability (LIVE)
// -----------------------------------------------------------------------------

export const setAvailability = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    articleIds: v.array(v.id("menuArticles")),
    available: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.availability");
    const articles = await loadAll(ctx, batchOf(args.articleIds), args.menuServiceId);
    const now = Date.now();
    let changed = 0;
    for (const article of articles) {
      const existing = await ctx.db
        .query("menuAvailability")
        .withIndex("by_menuServiceId_and_articleKey", (q) =>
          q.eq("menuServiceId", args.menuServiceId).eq("articleKey", article.key),
        )
        .take(5);
      if (args.available) {
        for (const row of existing) await ctx.db.delete(row._id);
        if (existing.length > 0) changed += 1;
      } else if (existing.length === 0) {
        await ctx.db.insert("menuAvailability", {
          menuServiceId: args.menuServiceId,
          articleKey: article.key,
          since: now,
          setByUserId: access.user._id,
        });
        changed += 1;
      }
    }
    // Live state, not the draft: no touchDraft.
    return { available: args.available, changed };
  },
});

// -----------------------------------------------------------------------------
// Placements: hide / show, remove from this page, move to a section
// -----------------------------------------------------------------------------

export const setVisibility = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    placementIds: v.array(v.id("menuPlacements")),
    visibility: menuVisibilityValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const placements = await loadAll(ctx, batchOf(args.placementIds), args.menuServiceId);
    await activePagesOf(ctx, placements, args.menuServiceId);
    const now = Date.now();
    let changed = 0;
    for (const placement of placements) {
      if (placement.visibility === args.visibility) continue;
      await ctx.db.patch(placement._id, { visibility: args.visibility, updatedAt: now });
      changed += 1;
    }
    if (changed > 0) await touchDraft(ctx, args.menuServiceId, access.user._id);
    return { changed };
  },
});

export const removeFromPage = mutation({
  args: { menuServiceId: v.id("menuServices"), placementIds: v.array(v.id("menuPlacements")) },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const placements = await loadAll(ctx, batchOf(args.placementIds), args.menuServiceId);
    const pages = await activePagesOf(ctx, placements, args.menuServiceId);
    const removedPerPage = new Map<Id<"menuPages">, number>();
    for (const placement of placements) {
      await ctx.db.delete(placement._id);
      removedPerPage.set(placement.pageId, (removedPerPage.get(placement.pageId) ?? 0) + 1);
    }
    for (const [pageId, removed] of removedPerPage) {
      const page = pages.get(pageId)!;
      await ctx.db.patch(page._id, { placementCount: Math.max(0, page.placementCount - removed) });
    }
    await touchDraft(ctx, args.menuServiceId, access.user._id);
    return { removed: placements.length };
  },
});

async function lastPlacementOrder(ctx: MutationCtx, sectionId: Id<"menuSections">): Promise<number | null> {
  const last = await ctx.db
    .query("menuPlacements")
    .withIndex("by_sectionId_and_order", (q) => q.eq("sectionId", sectionId))
    .order("desc")
    .first();
  return last ? last.order : null;
}

async function placementOf(
  ctx: MutationCtx,
  sectionId: Id<"menuSections">,
  articleId: Id<"menuArticles">,
): Promise<Doc<"menuPlacements"> | null> {
  return await ctx.db
    .query("menuPlacements")
    .withIndex("by_sectionId_and_articleId", (q) => q.eq("sectionId", sectionId).eq("articleId", articleId))
    .first();
}

/**
 * "Premesti u sekciju": placements of ONE page go to the end of `toSectionId`
 * (a section of that page), in their current order on the page. A placement
 * already in that section stays where it is; one whose article that section
 * already shows is skipped (an article is in a section at most once). Both
 * are counted in `skipped`.
 */
export const moveToSection = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    placementIds: v.array(v.id("menuPlacements")),
    toSectionId: v.id("menuSections"),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const toSection = await loadOwned(ctx, args.toSectionId, args.menuServiceId);
    const page = await loadOwned(ctx, toSection.pageId, args.menuServiceId);
    assertPageActive(page);
    const placements = await loadAll(ctx, batchOf(args.placementIds), args.menuServiceId);
    // Moving to another page is "Dodaj na stranicu" + "Ukloni sa ove stranice".
    if (placements.some((placement) => placement.pageId !== page._id)) throw refuse(MENU_ERROR.invalidInput);

    // Page order: by section order, then by order inside the section.
    const sectionOrder = new Map<Id<"menuSections">, number>();
    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE);
    sections.forEach((section, index) => sectionOrder.set(section._id, index));
    const ordered = placements
      .slice()
      .sort(
        (a, b) =>
          (sectionOrder.get(a.sectionId) ?? 0) - (sectionOrder.get(b.sectionId) ?? 0) ||
          a.order - b.order ||
          a._creationTime - b._creationTime,
      );

    let order = await lastPlacementOrder(ctx, toSection._id);
    const arriving = new Set<Id<"menuArticles">>();
    const now = Date.now();
    let moved = 0;
    let skipped = 0;
    for (const placement of ordered) {
      if (placement.sectionId === toSection._id) {
        skipped += 1;
        continue;
      }
      if (arriving.has(placement.articleId) || (await placementOf(ctx, toSection._id, placement.articleId))) {
        skipped += 1;
        continue;
      }
      arriving.add(placement.articleId);
      order = orderAfter(order);
      await ctx.db.patch(placement._id, { sectionId: toSection._id, order, updatedAt: now });
      moved += 1;
    }
    if (moved > 0) await touchDraft(ctx, args.menuServiceId, access.user._id);
    return { moved, skipped };
  },
});

/**
 * "Dodaj na stranicu": shows each article in `sectionId` (re-use, the same
 * article and price, master §5.1–§5.2), appended in the order given. An
 * article that section already shows is skipped.
 */
export const addToPage = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    articleIds: v.array(v.id("menuArticles")),
    sectionId: v.id("menuSections"),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const section = await loadOwned(ctx, args.sectionId, args.menuServiceId);
    const page = await loadOwned(ctx, section.pageId, args.menuServiceId);
    assertPageActive(page);
    const articles = await loadAll(ctx, batchOf(args.articleIds), args.menuServiceId);

    const toAdd: Doc<"menuArticles">[] = [];
    let skipped = 0;
    for (const article of articles) {
      if (await placementOf(ctx, section._id, article._id)) skipped += 1;
      else toAdd.push(article);
    }
    if (toAdd.length === 0) return { added: 0, skipped };
    if (page.placementCount + toAdd.length > MENU_MAX_PLACEMENTS_PER_PAGE) throw refuse(MENU_ERROR.limitReached);

    const now = Date.now();
    let order = await lastPlacementOrder(ctx, section._id);
    for (const article of toAdd) {
      order = orderAfter(order);
      await ctx.db.insert("menuPlacements", {
        menuServiceId: args.menuServiceId,
        pageId: page._id,
        sectionId: section._id,
        articleId: article._id,
        order,
        visibility: "visible",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(page._id, { placementCount: page.placementCount + toAdd.length });
    await touchDraft(ctx, args.menuServiceId, access.user._id);
    return { added: toAdd.length, skipped };
  },
});

/**
 * The sections of one page, for "Dodaj na stranicu" (the editor holds only the
 * open page). null for every refusal.
 */
export const pageSections = query({
  args: { pageId: v.id("menuPages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) return null;
    const access = await getMenuAccess(ctx, { menuServiceId: page.menuServiceId }, "menu.read");
    if (!access) return null;
    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE);
    return {
      pageId: page._id,
      name: page.name,
      archived: page.archivedAt !== undefined,
      sections: sections.map((section) => ({ sectionId: section._id, name: section.name })),
    };
  },
});

// -----------------------------------------------------------------------------
// Deletion with consequences (master §5.6)
// -----------------------------------------------------------------------------

function impactView(article: Doc<"menuArticles">, plan: DeletionPlan) {
  return { ...plan.impact, articleId: article._id, name: article.name, kind: article.kind };
}

async function plansOf(ctx: QueryCtx | MutationCtx, articles: readonly Doc<"menuArticles">[]) {
  const plans: DeletionPlan[] = [];
  for (const article of articles) plans.push(await loadDeletionPlan(ctx, article));
  return plans;
}

/**
 * What deleting the articles would remove, per article: the pages that show
 * it and the combos that contain it (plus variants, Room service…), and the
 * token that confirms exactly this batch. null for every refusal, including an
 * id of another service.
 */
export const deleteImpact = query({
  args: { menuServiceId: v.id("menuServices"), articleIds: v.array(v.id("menuArticles")) },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const ids = [...new Set(args.articleIds)];
    if (ids.length === 0 || ids.length > MENU_MAX_BULK_BATCH) return null;
    const articles: Doc<"menuArticles">[] = [];
    for (const id of ids) {
      const article = await ctx.db.get(id);
      if (!article || article.menuServiceId !== args.menuServiceId) return null;
      articles.push(article);
    }
    const plans = await plansOf(ctx, articles);
    return {
      articles: articles.map((article, index) => impactView(article, plans[index])),
      overLimit: plans.some((plan) => plan.overLimit),
      confirmToken: bulkDeletionConfirmToken(plans.map((plan) => plan.impact)),
    };
  },
});

/**
 * "Obriši" for the selection: deletes every article from ALL pages. Without
 * `confirmToken`, or with a token that no longer matches the impact of the
 * whole batch, nothing is written and the answer is `{ status: "confirm" }`
 * with the current impact. With the matching token all of them go in one
 * transaction — combos first, so their components are not removed twice.
 */
export const deleteArticles = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    articleIds: v.array(v.id("menuArticles")),
    confirmToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const articles = await loadAll(ctx, batchOf(args.articleIds), args.menuServiceId);
    const plans = await plansOf(ctx, articles);
    if (plans.some((plan) => plan.overLimit)) throw refuse(MENU_ERROR.limitReached);

    const confirmToken = bulkDeletionConfirmToken(plans.map((plan) => plan.impact));
    if (args.confirmToken !== confirmToken) {
      return {
        status: "confirm" as const,
        articles: articles.map((article, index) => impactView(article, plans[index])),
        confirmToken,
      };
    }

    const order = articles
      .map((article, index) => ({ article, plan: plans[index] }))
      .sort((a, b) => (a.article.kind === "combo" ? 0 : 1) - (b.article.kind === "combo" ? 0 : 1));
    for (const { article, plan } of order) await applyArticleDeletion(ctx, article, plan, access);
    await touchDraft(ctx, args.menuServiceId, access.user._id, { articleDelta: -articles.length });
    return { status: "deleted" as const, deleted: articles.length };
  },
});
