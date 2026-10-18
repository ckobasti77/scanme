import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { appendPlacement, assertPageActive } from "./menuCatalog";
import { pageHasActiveQr } from "./menuPages";
import { getMenuAccess, loadOwned, requireMenuAccessToRow, resolveMenuAccess } from "./lib/menuAccess";
import { loadDraftState, touchDraft } from "./lib/menuDraft";
import { getUrl as storageGetUrl } from "./lib/storage";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ADDON_GROUPS_PER_ARTICLE,
  MENU_MAX_ADDON_OPTIONS_PER_GROUP,
  MENU_MAX_ARTICLES,
  MENU_MAX_PAGES,
  MENU_MAX_PLACEMENTS_PER_ARTICLE,
  MENU_MAX_VARIANTS_PER_ARTICLE,
  MENU_TEXT,
} from "../lib/menu/limits";
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
//   - quickAddMany: the table entry of several articles, all or nothing;
//   - articleDetail (K15): the article detail in one subscription;
//   - searchArticles (K15): articles by name for "Primeni i na druge artikle".
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

// -----------------------------------------------------------------------------
// K15 — the article detail (master §5.5–§5.7, §7.3–§7.6, §7.9, §13.4)
// -----------------------------------------------------------------------------

/**
 * Everything the article detail shows, in ONE subscription while it is open:
 * the shared article (base price, quantity, media, switches, allergens, tags,
 * promotion), its variants, its add-on groups with their add-ons and how many
 * articles each group is linked to (a linked group shows its impact before a
 * change), its image URL, and every page and section that shows it. Bounded
 * reads only (≤ 20 variants, ≤ 10 groups × ≤ 30 add-ons, ≤ 1.000 placements).
 * null for a missing article and for every refusal.
 */
export const articleDetail = query({
  args: { menuServiceId: v.id("menuServices"), articleKey: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const { menuService } = access;
    const article = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuService._id).eq("key", args.articleKey))
      .unique();
    if (!article) return null;

    const variants = await ctx.db
      .query("menuVariants")
      .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
      .take(MENU_MAX_VARIANTS_PER_ARTICLE);
    const links = await ctx.db
      .query("menuArticleAddonGroups")
      .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
      .take(MENU_MAX_ADDON_GROUPS_PER_ARTICLE);
    const addonGroups = [];
    for (const link of links) {
      const group = await ctx.db.get(link.groupId);
      if (!group || group.menuServiceId !== menuService._id) continue;
      const options = await ctx.db
        .query("menuAddonOptions")
        .withIndex("by_groupId_and_order", (q) => q.eq("groupId", group._id))
        .take(MENU_MAX_ADDON_OPTIONS_PER_GROUP);
      addonGroups.push({
        groupId: group._id,
        key: group.key,
        name: group.name,
        selection: group.selection,
        required: group.required,
        minSelect: group.minSelect ?? null,
        maxSelect: group.maxSelect ?? null,
        linkCount: group.linkCount,
        options: options.map((option) => ({
          optionId: option._id,
          key: option.key,
          name: option.name,
          priceDeltaRsd: option.priceDeltaRsd,
        })),
      });
    }

    const placementRows = await ctx.db
      .query("menuPlacements")
      .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
      .take(MENU_MAX_PLACEMENTS_PER_ARTICLE + 1);
    const pages = new Map<Id<"menuPages">, Doc<"menuPages"> | null>();
    const sections = new Map<Id<"menuSections">, Doc<"menuSections"> | null>();
    const placements = [];
    for (const placement of placementRows.slice(0, MENU_MAX_PLACEMENTS_PER_ARTICLE)) {
      if (!pages.has(placement.pageId)) pages.set(placement.pageId, await ctx.db.get(placement.pageId));
      if (!sections.has(placement.sectionId)) sections.set(placement.sectionId, await ctx.db.get(placement.sectionId));
      const page = pages.get(placement.pageId);
      const section = sections.get(placement.sectionId);
      if (!page || !section || page.menuServiceId !== menuService._id) continue;
      placements.push({
        placementId: placement._id,
        pageId: page._id,
        pageName: page.name,
        pageOrder: page.order,
        pageIsDefault: page.isDefault,
        pageArchived: page.archivedAt !== undefined,
        sectionId: section._id,
        sectionName: section.name,
        sectionOrder: section.order,
        order: placement.order,
        visibility: placement.visibility,
      });
    }
    placements.sort((a, b) => a.pageOrder - b.pageOrder || a.sectionOrder - b.sectionOrder || a.order - b.order);

    let image: { mediaId: Id<"mediaAssets">; url: string | null } | null = null;
    if (article.imageMediaId) {
      const asset = await ctx.db.get(article.imageMediaId);
      const usable = asset !== null && asset.status === "ready" && asset.businessId === access.business._id;
      image = {
        mediaId: article.imageMediaId,
        url: usable ? await storageGetUrl(ctx, asset.variants.webp.ref as Id<"_storage">) : null,
      };
    }

    return {
      article: {
        articleId: article._id,
        key: article.key,
        kind: article.kind,
        name: article.name,
        description: article.description ?? null,
        basePriceRsd: article.basePriceRsd ?? null,
        quantityValue: article.quantityValue ?? null,
        quantityUnit: article.quantityUnit ?? null,
        mediaMode: article.mediaMode,
        iconKey: article.iconKey ?? null,
        imageMediaId: article.imageMediaId ?? null,
        variantsEnabled: article.variantsEnabled ?? false,
        addonsEnabled: article.addonsEnabled ?? false,
        noteEnabled: article.noteEnabled ?? false,
        priceCheck: article.priceCheck !== undefined,
        allergens: article.allergens
          ? {
              contains: article.allergens.contains,
              mayContain: article.allergens.mayContain,
              otherText: article.allergens.otherText ?? null,
            }
          : null,
        tags: article.tags ?? [],
        promo: article.promo ?? null,
      },
      image,
      allergensEnabled: menuService.settings?.allergensEnabled === true,
      variants: variants.map((variant) => ({
        variantId: variant._id,
        key: variant.key,
        name: variant.name,
        priceRsd: variant.priceRsd ?? null,
      })),
      addonGroups,
      placements,
      placementsTruncated: placementRows.length > MENU_MAX_PLACEMENTS_PER_ARTICLE,
    };
  },
});

/** At most this many articles answer one search ("Primeni i na druge artikle"). */
const MENU_STUDIO_SEARCH_LIMIT = 50;

/**
 * Articles of the whole menu whose name contains the query (diacritics, case
 * and punctuation ignored, as duplicate detection does), by name, at most
 * MENU_STUDIO_SEARCH_LIMIT. Called once per (debounced) query, never
 * subscribed; the scan is bounded by the article ceiling of a menu.
 */
export const searchArticles = query({
  args: { menuServiceId: v.id("menuServices"), query: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const needle = normalizeArticleName(args.query.slice(0, MENU_TEXT.articleName));
    if (needle === "") return [];
    const found: { articleId: Id<"menuArticles">; key: string; name: string; basePriceRsd: number | null }[] = [];
    const rows = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_nameNormalized", (q) => q.eq("menuServiceId", access.menuService._id))
      .take(MENU_MAX_ARTICLES);
    for (const article of rows) {
      if (!article.nameNormalized.includes(needle)) continue;
      found.push({ articleId: article._id, key: article.key, name: article.name, basePriceRsd: article.basePriceRsd ?? null });
      if (found.length >= MENU_STUDIO_SEARCH_LIMIT) break;
    }
    return found;
  },
});
