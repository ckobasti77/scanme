import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_MAX_ARTICLES } from "../lib/menu/limits";

// =============================================================================
// ScanMe Menu V1 — "Privremeno nedostupno" (K04; master §5.6).
//
// An OPERATIONAL state, not content: the article stays visible to guests with
// a clear "currently unavailable" mark, and the change goes live at once,
// without publishing the rest of the draft. It is therefore NOT a draft change
// (no touchDraft) and never part of a published version (K01 A2): the public
// menu reads this small live layer next to the version (K05).
//
// A menuAvailability row exists only while the article is unavailable, keyed by
// the stable article key. Permission "menu.availability" (owner, manager,
// editor, admin; staff not in V1, K01 OTV 4). It is not gated by
// clientEditingEnabled: switching off client EDITING must not stop the venue
// from marking a sold-out dish (lib/menu/permissions.ts, convex/lib/menuAccess).
// =============================================================================

export const setAvailability = mutation({
  args: { articleId: v.id("menuArticles"), available: v.boolean() },
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) throw new ConvexError(MENU_ERROR.notFound);
    const access = await requireMenuAccessToRow(ctx, article.menuServiceId, "menu.availability");

    const existing = await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId_and_articleKey", (q) =>
        q.eq("menuServiceId", article.menuServiceId).eq("articleKey", article.key),
      )
      .take(5);

    if (args.available) {
      for (const row of existing) await ctx.db.delete(row._id);
      return { available: true as const, changed: existing.length > 0 };
    }
    if (existing.length > 0) return { available: false as const, changed: false };
    await ctx.db.insert("menuAvailability", {
      menuServiceId: article.menuServiceId,
      articleKey: article.key,
      since: Date.now(),
      setByUserId: access.user._id,
    });
    return { available: false as const, changed: true };
  },
});

/**
 * Keys of the articles that are temporarily unavailable right now, for the
 * editor and the panel. null when the caller cannot read the service.
 */
export const unavailableArticles = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const rows = await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", args.menuServiceId))
      .take(MENU_MAX_ARTICLES);
    return rows.map((row) => ({ articleKey: row.articleKey, since: row.since }));
  },
});
