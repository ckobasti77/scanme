import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { appendPlacement, assertPageActive } from "./menuCatalog";
import { pageHasActiveQr } from "./menuPages";
import { getMenuAccess, loadOwned, requireMenuAccessToRow, resolveMenuAccess } from "./lib/menuAccess";
import { loadDraftState, touchDraft } from "./lib/menuDraft";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import { MENU_MAX_ARTICLES, MENU_MAX_PAGES, MENU_TEXT } from "../lib/menu/limits";
import { roleCan } from "../lib/menu/permissions";
import { isValidRsd } from "../lib/menu/rsd";
import { MENU_STUDIO_MAX_QUICK_ROWS } from "../lib/menu/studio/quick-add";
import { normalizeArticleName, requiredText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — the editor ("studio", K10; master §13.4, §5.2, §6.1).
//
// The editor reads the catalog through the existing queries (menuServices.
// context, menuCatalog.pageContent, menuPublishing.draftStatus,
// menuAvailability.unavailableArticles) and writes through the existing
// mutations. This module adds only what they do not cover:
//   - entry: which editor a venue opens (the new one or the legacy one);
//   - pages: the page column, with "a QR card points here" per page, so the
//     editor can explain a blocked delete BEFORE the person tries it;
//   - quickAddMany: the table entry of several articles, all or nothing.
// =============================================================================

/**
 * Which editor `/[slug]/meni/editor` and the panel open (K09 §1.1):
 * - studio: the caller can read an active Menu service of the new model that
 *   is not tied to an unfinished legacy migration;
 * - legacy: the service still mirrors a legacy menu that has not been cut over,
 *   so the legacy editor stays its only writer (no double edits, K06);
 * - none: everything else (not signed in, no service, no role) — the legacy
 *   route then behaves exactly as before.
 */
export const entry = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const access = await resolveMenuAccess(ctx, { businessSlug: args.slug });
    if (typeof access === "string" || !roleCan(access.actor, "menu.read")) {
      return { kind: "none" as const };
    }
    const { menuService } = access;
    if (menuService.legacyMenuId !== undefined && menuService.migration?.status !== "cutover") {
      return { kind: "legacy" as const };
    }
    return { kind: "studio" as const };
  },
});

/**
 * The page column of the editor: every page by order (archived ones flagged)
 * and whether an active QR card points at it (delete and archive are then
 * refused, master §3.2). null for every refusal.
 */
export const pages = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const { menuService } = access;
    const rows = await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuService._id))
      .take(MENU_MAX_PAGES + 1);
    const out = [];
    for (const page of rows) {
      out.push({
        pageId: page._id,
        key: page.key,
        slug: page.slug,
        name: page.name,
        isDefault: page.isDefault,
        order: page.order,
        visibility: page.visibility,
        archived: page.archivedAt !== undefined,
        placementCount: page.placementCount,
        hasQr: await pageHasActiveQr(ctx, menuService._id, menuService.businessId, page.key),
      });
    }
    return out;
  },
});

const quickRowValidator = v.object({
  sectionId: v.id("menuSections"),
  name: v.string(),
  priceRsd: v.union(v.number(), v.null()),
  /**
   * The person's answer after a "similar" reply: a new article anyway, the
   * existing article (`existingArticleId`), or leave the row out.
   */
  decision: v.optional(v.union(v.literal("new"), v.literal("existing"), v.literal("skip"))),
  existingArticleId: v.optional(v.id("menuArticles")),
});

/**
 * "Brzo dodaj više artikala" (master §13.4): rows of name, price and section
 * of ONE page, in one transaction. All or nothing: when a row without a
 * decision matches an existing article by name (master §5.2), nothing is
 * written and every such row comes back with its candidates; the second call
 * carries a decision per row. Invalid input refuses the whole call.
 */
export const quickAddMany = mutation({
  args: { pageId: v.id("menuPages"), rows: v.array(quickRowValidator) },
  handler: async (ctx, args) => {
    const found = await ctx.db.get(args.pageId);
    if (!found) throw new ConvexError(MENU_ERROR.notFound);
    const access = await requireMenuAccessToRow(ctx, found.menuServiceId, "menu.edit");
    const page = await loadOwned(ctx, args.pageId, access.menuService._id);
    assertPageActive(page);
    if (args.rows.length === 0 || args.rows.length > MENU_STUDIO_MAX_QUICK_ROWS) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }

    // 1. Validate every row before anything is written.
    const sections = new Map<Id<"menuSections">, Doc<"menuSections">>();
    const rows: {
      sectionId: Id<"menuSections">;
      name: string;
      nameNormalized: string;
      priceRsd: number | null;
      decision: "new" | "existing" | "skip" | null;
      existing: Doc<"menuArticles"> | null;
    }[] = [];
    for (const row of args.rows) {
      let section = sections.get(row.sectionId);
      if (!section) {
        section = await loadOwned(ctx, row.sectionId, page.menuServiceId);
        if (section.pageId !== page._id) throw new ConvexError(MENU_ERROR.invalidInput);
        sections.set(section._id, section);
      }
      const decision = row.decision ?? null;
      if (decision === "skip") {
        rows.push({ sectionId: section._id, name: "", nameNormalized: "", priceRsd: null, decision, existing: null });
        continue;
      }
      if (decision === "existing") {
        if (!row.existingArticleId) throw new ConvexError(MENU_ERROR.invalidInput);
        const existing = await loadOwned(ctx, row.existingArticleId, page.menuServiceId);
        rows.push({ sectionId: section._id, name: existing.name, nameNormalized: "", priceRsd: null, decision, existing });
        continue;
      }
      const name = requiredText(row.name, MENU_TEXT.articleName);
      if (name === null) throw new ConvexError(MENU_ERROR.invalidInput);
      if (row.priceRsd !== null && !isValidRsd(row.priceRsd)) throw new ConvexError(MENU_ERROR.invalidInput);
      rows.push({
        sectionId: section._id,
        name,
        nameNormalized: normalizeArticleName(name),
        priceRsd: row.priceRsd,
        decision,
        existing: null,
      });
    }

    // 2. Re-use before duplicating: rows without a decision that match.
    const similar: {
      index: number;
      candidates: { articleId: Id<"menuArticles">; key: string; name: string; basePriceRsd: number | null }[];
    }[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.decision !== null || row.nameNormalized === "") continue;
      const matches = await ctx.db
        .query("menuArticles")
        .withIndex("by_menuServiceId_and_nameNormalized", (q) =>
          q.eq("menuServiceId", page.menuServiceId).eq("nameNormalized", row.nameNormalized),
        )
        .take(5);
      if (matches.length > 0) {
        similar.push({
          index,
          candidates: matches.map((article) => ({
            articleId: article._id,
            key: article.key,
            name: article.name,
            basePriceRsd: article.basePriceRsd ?? null,
          })),
        });
      }
    }
    if (similar.length > 0) return { status: "similar" as const, rows: similar };

    // 3. Write. Limits are checked against the counts this call itself raises.
    const creating = rows.filter((row) => row.decision === null || row.decision === "new").length;
    const draft = await loadDraftState(ctx, page.menuServiceId);
    if (draft.articleCount + creating > MENU_MAX_ARTICLES) throw new ConvexError(MENU_ERROR.limitReached);

    let current: Doc<"menuPages"> = page;
    let created = 0;
    let reused = 0;
    let skipped = 0;
    const now = Date.now();
    for (const row of rows) {
      if (row.decision === "skip") {
        skipped += 1;
        continue;
      }
      let articleId: Id<"menuArticles">;
      if (row.decision === "existing" && row.existing) {
        const already = await ctx.db
          .query("menuPlacements")
          .withIndex("by_sectionId_and_articleId", (q) =>
            q.eq("sectionId", row.sectionId).eq("articleId", row.existing!._id),
          )
          .first();
        if (already) {
          skipped += 1;
          continue;
        }
        articleId = row.existing._id;
        reused += 1;
      } else {
        articleId = await ctx.db.insert("menuArticles", {
          menuServiceId: page.menuServiceId,
          key: newMenuKey("article"),
          kind: "item",
          name: row.name,
          nameNormalized: row.nameNormalized,
          ...(row.priceRsd !== null ? { basePriceRsd: row.priceRsd } : {}),
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
          updatedByUserId: access.user._id,
        });
        created += 1;
      }
      // appendPlacement counts the placement on the page doc it is given, so
      // every call gets the count as this call left it.
      await appendPlacement(ctx, { page: current, sectionId: row.sectionId, articleId });
      current = { ...current, placementCount: current.placementCount + 1 };
    }

    if (created + reused > 0) {
      await touchDraft(ctx, page.menuServiceId, access.user._id, { articleDelta: created });
    }
    return { status: "added" as const, created, reused, skipped };
  },
});
