import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow, type MenuAccess } from "./lib/menuAccess";
import { detachComponentFromCombos } from "./lib/menuArticleHooks";
import { getMenuCapabilities } from "./lib/menuCapabilities";
import { menuArticleAllergensValidator, menuTagCodeValidator } from "./lib/menuDomainValidators";
import { auditActorKind, touchDraft, writeMenuAudit } from "./lib/menuDraft";
import { MENU_ALLERGEN_CODES, type MenuArticleAllergens } from "../lib/menu/allergens";
import { checkCas } from "../lib/menu/cas";
import { deletionConfirmToken, type ArticleDeletionImpact } from "../lib/menu/deletion";
import { ARTICLE_ERROR, type ArticleErrorCode } from "../lib/menu/errors/article";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import {
  MENU_MAX_ADDON_GROUPS_PER_ARTICLE,
  MENU_MAX_ADDON_OPTIONS_PER_GROUP,
  MENU_MAX_COMBOS_PER_COMPONENT,
  MENU_MAX_COMBO_COMPONENTS,
  MENU_MAX_PLACEMENTS_PER_ARTICLE,
  MENU_MAX_VARIANTS_PER_ARTICLE,
  MENU_TEXT,
} from "../lib/menu/limits";
import {
  articlePublishScope,
  validateArticleForPublish,
  type PublishIssue,
  type PublishValidationArticle,
} from "../lib/menu/publish-validation";
import { normalizeTags } from "../lib/menu/tags";
import { cleanText, optionalText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — the details of an article that live outside its price and
// options (K04; master §5.5, §5.6, §7.3): allergens and tags, the deletion of a
// shared article with its consequences, and the publish issues of one article.
//
// ALLERGENS (§7.3) are an OPTIONAL system of the venue: a switch of the service
// (settings.allergensEnabled, off by default) and a record on the articles where
// the venue wants one. An article WITHOUT a record is "unknown" — the system
// never stores an explicit "contains nothing", because missing data must never
// read as safe: a record whose two lists end up empty is removed. Turning the
// system off keeps every stored record (turning it on again brings them back).
//
// DELETION (§5.6): "Obriši artikal" removes the shared article from ALL pages.
// deleteArticle first answers with the impact (pages, combos…) and a confirm
// token and writes nothing; only the call that carries the token of the CURRENT
// impact deletes. Hide / remove / delete are structural and go live only on
// publish — they are draft changes like every other (touchDraft).
//
// Id-taking writes load the row first (missing = not_found) and authorize
// against THAT row's service (requireMenuAccessToRow: no role there = also
// not_found). touchDraft runs exactly once per successful change — never on a
// refusal, a "confirm" answer, a CAS conflict or a no-op. Reads need
// "menu.read" and answer null for every refusal; there is no clock in a query.
// =============================================================================

type DbCtx = QueryCtx | MutationCtx;

function refuse(code: MenuErrorCode | ArticleErrorCode): ConvexError<string> {
  return new ConvexError(code);
}

async function articleForEdit(ctx: MutationCtx, articleId: Id<"menuArticles">) {
  const article = await ctx.db.get(articleId);
  if (!article) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, article.menuServiceId, "menu.edit");
  return { article, access };
}

/** The article and the caller's read access, or null for every refusal. */
async function articleForRead(
  ctx: QueryCtx,
  articleId: Id<"menuArticles">,
): Promise<{ article: Doc<"menuArticles">; access: MenuAccess } | null> {
  const article = await ctx.db.get(articleId);
  if (!article) return null;
  const access = await getMenuAccess(ctx, { menuServiceId: article.menuServiceId }, "menu.read");
  if (!access) return null;
  return { article, access };
}

// -----------------------------------------------------------------------------
// Allergens
// -----------------------------------------------------------------------------

function allergensEnabledOf(service: Doc<"menuServices">): boolean {
  return service.settings?.allergensEnabled === true;
}

/**
 * Turns the allergen system of the menu on or off. Off never deletes the
 * allergen data of any article. The flag is part of the draft (published with
 * the menu); no-op when it already has that value.
 */
export const setAllergensEnabled = mutation({
  args: { menuServiceId: v.id("menuServices"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    if (allergensEnabledOf(access.menuService) === args.enabled) return { ok: true as const };

    await ctx.db.patch(access.menuService._id, {
      settings: { ...access.menuService.settings, allergensEnabled: args.enabled },
      updatedAt: Date.now(),
    });
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return { ok: true as const };
  },
});

/** Whether the menu keeps allergens (absent = off). null for every refusal. */
export const allergenSettings = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    return { enabled: allergensEnabledOf(access.menuService) };
  },
});

const allergenRecordValidator = v.union(menuArticleAllergensValidator, v.null());

function listsOther(record: MenuArticleAllergens): boolean {
  return record.contains.includes("other") || record.mayContain.includes("other");
}

/**
 * The stored form of a record: unique codes in MENU_ALLERGEN_CODES order, a
 * code in both lists only in `contains`, `otherText` cleaned and only when
 * `other` is listed. Both lists empty = no record (null). Does not judge the
 * text; the write path checks it.
 */
function canonicalAllergens(input: MenuArticleAllergens): MenuArticleAllergens | null {
  const contains = MENU_ALLERGEN_CODES.filter((code) => input.contains.includes(code));
  const mayContain = MENU_ALLERGEN_CODES.filter(
    (code) => input.mayContain.includes(code) && !contains.includes(code),
  );
  if (contains.length === 0 && mayContain.length === 0) return null;
  const record: MenuArticleAllergens = { contains, mayContain };
  const text = cleanText(input.otherText ?? "");
  if (listsOther(record) && text !== "") record.otherText = text;
  return record;
}

function allergenKey(record: MenuArticleAllergens | null): string | null {
  return record === null ? null : JSON.stringify(record);
}

/**
 * Records which allergens an article contains or may contain (traces). `null`
 * means "no record" = unknown, and clearing is always allowed; a record needs
 * the menu's allergens switched on. `expected` is the record the editor last
 * saw (null = none): a different stored record writes nothing and comes back as
 * `current`. Both are normalized before they are compared.
 */
export const setArticleAllergens = mutation({
  args: {
    articleId: v.id("menuArticles"),
    expected: allergenRecordValidator,
    allergens: allergenRecordValidator,
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);

    let next: MenuArticleAllergens | null = null;
    if (args.allergens !== null) {
      const text = optionalText(args.allergens.otherText, MENU_TEXT.allergenOtherText);
      if (text === false) throw refuse(MENU_ERROR.invalidInput);
      next = canonicalAllergens(args.allergens);
      // "Drugo" must say what it is.
      if (next !== null && listsOther(next) && next.otherText === undefined) {
        throw refuse(MENU_ERROR.invalidInput);
      }
    }
    if (next !== null && !allergensEnabledOf(access.menuService)) {
      throw refuse(ARTICLE_ERROR.allergensDisabled);
    }

    const stored = article.allergens ? canonicalAllergens(article.allergens) : null;
    const expected = args.expected ? canonicalAllergens(args.expected) : null;
    const cas = checkCas<"allergens">(
      { allergens: allergenKey(stored) },
      { allergens: allergenKey(expected) },
    );
    if (!cas.ok) {
      return {
        ok: false as const,
        conflicts: cas.conflicts,
        current: { allergens: stored },
        // K05: the second editor gets both values.
        attempted: { allergens: next },
      };
    }
    // A stored explicit-empty record is junk that still reads as "unknown"; clearing it is a write.
    const same =
      allergenKey(next) === allergenKey(stored) && (next !== null || article.allergens === undefined);
    if (same) return { ok: true as const };

    await ctx.db.patch(article._id, {
      allergens: next ?? undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

/**
 * Sets the tags and dietary characteristics of an article (a closed list,
 * lib/menu/tags.ts). Stored unique and in the canonical order; an empty list
 * removes the field. `expected` is the list the editor last saw.
 */
export const setArticleTags = mutation({
  args: {
    articleId: v.id("menuArticles"),
    expected: v.array(menuTagCodeValidator),
    tags: v.array(menuTagCodeValidator),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const next = normalizeTags(args.tags);
    const expected = normalizeTags(args.expected);
    if (next === null || expected === null) throw refuse(MENU_ERROR.invalidInput);

    const stored = normalizeTags(article.tags ?? []) ?? [];
    const cas = checkCas<"tags">(
      { tags: JSON.stringify(stored) },
      { tags: JSON.stringify(expected) },
    );
    if (!cas.ok) {
      return { ok: false as const, conflicts: cas.conflicts, current: { tags: stored }, attempted: { tags: next } };
    }
    if (next.join(",") === stored.join(",")) return { ok: true as const };

    await ctx.db.patch(article._id, {
      tags: next.length > 0 ? next : undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Deletion with consequences (master §5.6)
// -----------------------------------------------------------------------------

export type DeletionPlan = {
  impact: ArticleDeletionImpact;
  /** More placements than one deletion may remove (nothing is deleted then). */
  overLimit: boolean;
  placements: Doc<"menuPlacements">[];
  pages: Map<Id<"menuPages">, Doc<"menuPages">>;
  /** When the article is a combo: its own component rows. */
  ownComponents: Doc<"menuComboComponents">[];
  variants: Doc<"menuVariants">[];
  links: Doc<"menuArticleAddonGroups">[];
  roomServiceItems: Doc<"menuRoomServiceItems">[];
  availability: Doc<"menuAvailability">[];
};

/** Everything a deletion removes, with bounded reads (also the source of the impact the client confirms). Also used by menuBulk (K11). */
export async function loadDeletionPlan(ctx: DbCtx, article: Doc<"menuArticles">): Promise<DeletionPlan> {
  const menuServiceId = article.menuServiceId;

  const placementRows = await ctx.db
    .query("menuPlacements")
    .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
    .take(MENU_MAX_PLACEMENTS_PER_ARTICLE + 1);
  const overLimit = placementRows.length > MENU_MAX_PLACEMENTS_PER_ARTICLE;
  const placements = placementRows.slice(0, MENU_MAX_PLACEMENTS_PER_ARTICLE);

  const pages = new Map<Id<"menuPages">, Doc<"menuPages">>();
  const perPage = new Map<Id<"menuPages">, number>();
  for (const placement of placements) {
    perPage.set(placement.pageId, (perPage.get(placement.pageId) ?? 0) + 1);
    if (pages.has(placement.pageId)) continue;
    const page = await ctx.db.get(placement.pageId);
    if (page && page.menuServiceId === menuServiceId) pages.set(page._id, page);
  }

  const componentRows = await ctx.db
    .query("menuComboComponents")
    .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", article._id))
    .take(MENU_MAX_COMBOS_PER_COMPONENT);
  const combos: ArticleDeletionImpact["combos"] = [];
  const seenCombos = new Set<Id<"menuArticles">>();
  for (const row of componentRows) {
    if (row.menuServiceId !== menuServiceId || seenCombos.has(row.comboArticleId)) continue;
    seenCombos.add(row.comboArticleId);
    const combo = await ctx.db.get(row.comboArticleId);
    if (combo && combo.menuServiceId === menuServiceId && combo.kind === "combo") {
      combos.push({ articleKey: combo.key, name: combo.name });
    }
  }

  const ownComponents =
    article.kind === "combo"
      ? await ctx.db
          .query("menuComboComponents")
          .withIndex("by_comboArticleId_and_order", (q) => q.eq("comboArticleId", article._id))
          .take(MENU_MAX_COMBO_COMPONENTS + 1)
      : [];
  const variants = await ctx.db
    .query("menuVariants")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
    .take(MENU_MAX_VARIANTS_PER_ARTICLE + 1);
  const links = await ctx.db
    .query("menuArticleAddonGroups")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
    .take(MENU_MAX_ADDON_GROUPS_PER_ARTICLE + 1);
  const roomServiceItems = (
    await ctx.db
      .query("menuRoomServiceItems")
      .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
      .take(5)
  ).filter((row) => row.menuServiceId === menuServiceId);
  const availability = await ctx.db
    .query("menuAvailability")
    .withIndex("by_menuServiceId_and_articleKey", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("articleKey", article.key),
    )
    .take(5);

  const impact: ArticleDeletionImpact = {
    articleKey: article.key,
    pages: [...pages.values()]
      .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((page) => ({
        pageKey: page.key,
        name: page.name,
        archived: page.archivedAt !== undefined,
        placements: perPage.get(page._id) ?? 0,
      })),
    combos,
    comboComponents: ownComponents.length,
    variants: variants.length,
    addonGroupLinks: links.length,
    inRoomService: roomServiceItems.length > 0,
    unavailable: availability.length > 0,
  };
  return {
    impact,
    overLimit,
    placements,
    pages,
    ownComponents,
    variants,
    links,
    roomServiceItems,
    availability,
  };
}

/**
 * The writes of "Obriši artikal" for a confirmed plan (no touchDraft: the caller
 * calls it once). Shared by deleteArticle and menuBulk.deleteArticles (K11).
 */
export async function applyArticleDeletion(
  ctx: MutationCtx,
  article: Doc<"menuArticles">,
  plan: DeletionPlan,
  access: MenuAccess,
): Promise<void> {
  const now = Date.now();
  const removedPerPage = new Map<Id<"menuPages">, number>();
  for (const placement of plan.placements) {
    await ctx.db.delete(placement._id);
    removedPerPage.set(placement.pageId, (removedPerPage.get(placement.pageId) ?? 0) + 1);
  }
  for (const [pageId, removed] of removedPerPage) {
    // Read again: a batch (menuBulk.deleteArticles) may have changed the count since the plan.
    const page = plan.pages.has(pageId) ? await ctx.db.get(pageId) : null;
    if (page) {
      await ctx.db.patch(page._id, { placementCount: Math.max(0, page.placementCount - removed) });
    }
  }

  for (const variant of plan.variants) await ctx.db.delete(variant._id);
  for (const link of plan.links) {
    await ctx.db.delete(link._id);
    const group = await ctx.db.get(link.groupId);
    if (group && group.menuServiceId === article.menuServiceId) {
      await ctx.db.patch(group._id, { linkCount: Math.max(0, group.linkCount - 1) });
    }
  }

  for (const row of plan.ownComponents) await ctx.db.delete(row._id);
  await detachComponentFromCombos(ctx, article, now);
  for (const item of plan.roomServiceItems) await ctx.db.delete(item._id);
  // K05: the availability row is LIVE state of the published menu, which
  // still shows the article until Objavi; menuPublishing.publish deletes
  // the rows of articles that are gone from the published version.
  await ctx.db.delete(article._id);

  await writeMenuAudit(ctx, {
    menuServiceId: article.menuServiceId,
    actorKind: auditActorKind(access.actor),
    actorUserId: access.user._id,
    action: "article.deleted",
    entityType: "menuArticles",
    entityKey: article.key,
    details: {
      name: article.name,
      pages: plan.impact.pages.length,
      placements: plan.placements.length,
      combos: plan.impact.combos.length,
    },
  });
}

/**
 * What deleting the article would remove: the pages that show it (with how many
 * placements each), the combos that contain it, its variants and add-on links,
 * Room service and availability — plus the token that confirms exactly this
 * impact. null for every refusal.
 */
export const articleDeletionImpact = query({
  args: { articleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const found = await articleForRead(ctx, args.articleId);
    if (!found) return null;
    const { impact } = await loadDeletionPlan(ctx, found.article);
    return {
      ...impact,
      articleId: found.article._id,
      name: found.article.name,
      kind: found.article.kind,
      placementCount: impact.pages.reduce((sum, page) => sum + page.placements, 0),
      confirmToken: deletionConfirmToken(impact),
    };
  },
});

/**
 * "Obriši artikal": deletes the shared article from ALL pages. A call without
 * `confirmToken`, or with a token that no longer matches the current impact,
 * writes NOTHING and answers `{ status: "confirm", impact, confirmToken }` so
 * the client can show what would go. With the matching token everything is
 * removed in one transaction: placements (each page's count goes down), variants,
 * the add-on links (the groups stay, their link counts go down), the article's
 * own combo components, its component rows in other combos (those combos get
 * "check the combo price") and its Room service rows. Its availability row
 * stays until the next publish (K05: live state of the published menu).
 */
export const deleteArticle = mutation({
  args: { articleId: v.id("menuArticles"), confirmToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const plan = await loadDeletionPlan(ctx, article);
    if (plan.overLimit) throw refuse(MENU_ERROR.limitReached);

    const confirmToken = deletionConfirmToken(plan.impact);
    if (args.confirmToken !== confirmToken) {
      return { status: "confirm" as const, impact: plan.impact, confirmToken };
    }

    await applyArticleDeletion(ctx, article, plan, access);
    await touchDraft(ctx, article.menuServiceId, access.user._id, { articleDelta: -1 });
    return { status: "deleted" as const, impact: plan.impact };
  },
});

// -----------------------------------------------------------------------------
// Publish issues of one article
// -----------------------------------------------------------------------------

/** What publish validation needs to know about one article, from the draft rows. */
async function loadValidationArticle(
  ctx: QueryCtx,
  access: MenuAccess,
  article: Doc<"menuArticles">,
): Promise<PublishValidationArticle> {
  const menuServiceId = article.menuServiceId;
  const variantsEnabled = article.variantsEnabled === true;
  const addonsEnabled = article.addonsEnabled === true;

  // The switches keep their rows when turned off; only an enabled one counts.
  const variants = variantsEnabled
    ? await ctx.db
        .query("menuVariants")
        .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
        .take(MENU_MAX_VARIANTS_PER_ARTICLE)
    : [];

  const addonGroups: PublishValidationArticle["addonGroups"] = [];
  if (addonsEnabled) {
    const links = await ctx.db
      .query("menuArticleAddonGroups")
      .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
      .take(MENU_MAX_ADDON_GROUPS_PER_ARTICLE);
    for (const link of links) {
      const group = await ctx.db.get(link.groupId);
      if (!group || group.menuServiceId !== menuServiceId) continue;
      const options = await ctx.db
        .query("menuAddonOptions")
        .withIndex("by_groupId_and_order", (q) => q.eq("groupId", group._id))
        .take(MENU_MAX_ADDON_OPTIONS_PER_GROUP);
      addonGroups.push({
        key: group.key,
        selection: group.selection,
        required: group.required,
        minSelect: group.minSelect ?? null,
        maxSelect: group.maxSelect ?? null,
        optionCount: options.length,
      });
    }
  }

  const comboComponents =
    article.kind === "combo"
      ? await ctx.db
          .query("menuComboComponents")
          .withIndex("by_comboArticleId_and_order", (q) => q.eq("comboArticleId", article._id))
          .take(MENU_MAX_COMBO_COMPONENTS)
      : [];
  const containingCombos = await ctx.db
    .query("menuComboComponents")
    .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", article._id))
    .take(MENU_MAX_COMBOS_PER_COMPONENT);

  const placements = await ctx.db
    .query("menuPlacements")
    .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
    .take(MENU_MAX_PLACEMENTS_PER_ARTICLE);
  const pageCache = new Map<Id<"menuPages">, Doc<"menuPages"> | null>();
  const sectionCache = new Map<Id<"menuSections">, Doc<"menuSections"> | null>();
  let sectionCount = 0;
  let visibleCount = 0;
  for (const placement of placements) {
    // One get per distinct page / section.
    let page = pageCache.get(placement.pageId);
    if (page === undefined) {
      page = await ctx.db.get(placement.pageId);
      pageCache.set(placement.pageId, page);
    }
    let section = sectionCache.get(placement.sectionId);
    if (section === undefined) {
      section = await ctx.db.get(placement.sectionId);
      sectionCache.set(placement.sectionId, section);
    }
    if (!page || !section || page.archivedAt !== undefined) continue;
    sectionCount += 1;
    if (
      placement.visibility === "visible" &&
      section.visibility === "visible" &&
      page.visibility === "visible"
    ) {
      visibleCount += 1;
    }
  }

  // Room service only counts while it is switched on.
  const roomServiceItem = access.menuService.features.roomService
    ? await ctx.db
        .query("menuRoomServiceItems")
        .withIndex("by_articleId", (q) => q.eq("articleId", article._id))
        .first()
    : null;

  return {
    key: article.key,
    kind: article.kind,
    name: article.name,
    basePriceRsd: article.basePriceRsd ?? null,
    variantsEnabled,
    variants: variants.map((variant) => ({ key: variant.key, priceRsd: variant.priceRsd ?? null })),
    addonsEnabled,
    addonGroups,
    promo: article.promo ?? null,
    comboComponentCount: comboComponents.length,
    priceCheckPending: article.kind === "combo" && article.priceCheck !== undefined,
    sectionCount,
    visibleCount,
    inRoomService: roomServiceItem !== null && roomServiceItem.menuServiceId === menuServiceId,
    componentOfCombos: containingCombos.filter((row) => row.menuServiceId === menuServiceId).length,
  };
}

/**
 * What would block or warn when this article is published (master §5.5), read
 * from the draft. `scope` says how the article takes part in the publication
 * (lib/menu/publish-validation.ts): only "public" articles get errors and
 * warnings, a "hidden" or "component" one gets none (the draft keeps incomplete
 * articles), an "unplaced" one only `article_unplaced`. null for every refusal.
 */
export const articleIssues = query({
  args: { articleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const found = await articleForRead(ctx, args.articleId);
    if (!found) return null;
    const { article, access } = found;

    const validationArticle = await loadValidationArticle(ctx, access, article);
    const scope = articlePublishScope(validationArticle);
    let errors: PublishIssue[] = [];
    let warnings: PublishIssue[] = [];
    if (scope === "public") {
      const capabilities = await getMenuCapabilities(ctx, access.business._id);
      ({ errors, warnings } = validateArticleForPublish(validationArticle, {
        scheduledPromos: capabilities.scheduledPromos,
      }));
    } else if (scope === "unplaced") {
      warnings = [{ code: "article_unplaced", articleKey: article.key }];
    }
    return { scope, errors, warnings };
  },
});
