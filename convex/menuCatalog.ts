import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getMenuAccess, loadOwned, requireMenuAccessToRow } from "./lib/menuAccess";
import { flagCombosForPriceChange } from "./lib/menuArticleHooks";
import { menuVisibilityValidator } from "./lib/menuDomainValidators";
import { loadDraftState, touchDraft } from "./lib/menuDraft";
import { flagRoomServicePriceWarnings } from "./menuRoomService";
import { checkCas, type CasValue } from "../lib/menu/cas";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ARTICLES,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_QUANTITY,
  MENU_MAX_SECTIONS_PER_PAGE,
  MENU_TEXT,
} from "../lib/menu/limits";
import { moveItem, orderAfter, orderBetween, renumberedOrders } from "../lib/menu/order";
import { isValidRsd } from "../lib/menu/rsd";
import { normalizeArticleName, optionalText, requiredText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — the catalog: sections, shared articles and placements
// (K02; master §5.1–§5.3, §5.6).
//
// One real product = ONE article with ONE base price in whole dinars. A page
// shows it through a placement, which carries only order and visibility —
// never a price. setBasePrice is therefore the only price writer, and it
// applies to every page the article appears on. Every change stays in the
// draft (touchDraft exactly once per successful change; never on a refusal, a
// CAS conflict, a "similar" answer or a no-op).
//
// Id-taking functions load the row first (missing = not_found), authorize
// against THAT row's Menu service (requireMenuAccessToRow: a caller with no
// role there also gets not_found), then prove every other id argument belongs
// to the same service (loadOwned). Writes need "menu.edit", reads "menu.read".
// =============================================================================

function refuse(code: MenuErrorCode): ConvexError<string> {
  return new ConvexError(code);
}

export function assertPageActive(page: Doc<"menuPages">): void {
  if (page.archivedAt !== undefined) throw refuse(MENU_ERROR.pageArchived);
}

async function sectionForEdit(ctx: MutationCtx, sectionId: Id<"menuSections">) {
  const section = await ctx.db.get(sectionId);
  if (!section) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, section.menuServiceId, "menu.edit");
  const page = await loadOwned(ctx, section.pageId, section.menuServiceId);
  return { section, page, access };
}

async function placementForEdit(ctx: MutationCtx, placementId: Id<"menuPlacements">) {
  const placement = await ctx.db.get(placementId);
  if (!placement) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, placement.menuServiceId, "menu.edit");
  const page = await loadOwned(ctx, placement.pageId, placement.menuServiceId);
  return { placement, page, access };
}

async function articleForEdit(ctx: MutationCtx, articleId: Id<"menuArticles">) {
  const article = await ctx.db.get(articleId);
  if (!article) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, article.menuServiceId, "menu.edit");
  return { article, access };
}

async function lastPlacementOrder(
  ctx: MutationCtx,
  sectionId: Id<"menuSections">,
): Promise<number | null> {
  const last = await ctx.db
    .query("menuPlacements")
    .withIndex("by_sectionId_and_order", (q) => q.eq("sectionId", sectionId))
    .order("desc")
    .first();
  return last ? last.order : null;
}

/** Appends a visible placement to a section and counts it on the page (also used by menuCombos, K04). */
export async function appendPlacement(
  ctx: MutationCtx,
  input: {
    page: Doc<"menuPages">;
    sectionId: Id<"menuSections">;
    articleId: Id<"menuArticles">;
  },
): Promise<Id<"menuPlacements">> {
  if (input.page.placementCount >= MENU_MAX_PLACEMENTS_PER_PAGE) {
    throw refuse(MENU_ERROR.limitReached);
  }
  const now = Date.now();
  const last = await lastPlacementOrder(ctx, input.sectionId);
  const placementId = await ctx.db.insert("menuPlacements", {
    menuServiceId: input.page.menuServiceId,
    pageId: input.page._id,
    sectionId: input.sectionId,
    articleId: input.articleId,
    order: orderAfter(last),
    visibility: "visible",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(input.page._id, { placementCount: input.page.placementCount + 1 });
  return placementId;
}

function candidateOf(article: Doc<"menuArticles">) {
  return {
    articleId: article._id,
    key: article.key,
    name: article.name,
    basePriceRsd: article.basePriceRsd ?? null,
  };
}

// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------

export const addSection = mutation({
  args: { pageId: v.id("menuPages"), name: v.string() },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) throw refuse(MENU_ERROR.notFound);
    const access = await requireMenuAccessToRow(ctx, page.menuServiceId, "menu.edit");
    assertPageActive(page);
    const name = requiredText(args.name, MENU_TEXT.sectionName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);

    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE);
    if (sections.length >= MENU_MAX_SECTIONS_PER_PAGE) throw refuse(MENU_ERROR.limitReached);

    const now = Date.now();
    const key = newMenuKey("section");
    const sectionId = await ctx.db.insert("menuSections", {
      menuServiceId: page.menuServiceId,
      pageId: page._id,
      key,
      name,
      order: orderAfter(sections.length > 0 ? sections[sections.length - 1].order : null),
      visibility: "visible",
      createdAt: now,
      updatedAt: now,
    });
    await touchDraft(ctx, page.menuServiceId, access.user._id);
    return { sectionId, key };
  },
});

export const renameSection = mutation({
  args: {
    sectionId: v.id("menuSections"),
    name: v.string(),
    expectedName: v.string(),
  },
  handler: async (ctx, args) => {
    const { section, page, access } = await sectionForEdit(ctx, args.sectionId);
    assertPageActive(page);
    const name = requiredText(args.name, MENU_TEXT.sectionName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);

    const cas = checkCas<"name">({ name: section.name }, { name: args.expectedName }, { name });
    if (!cas.ok) return cas;
    if (name === section.name) return { ok: true as const };

    await ctx.db.patch(section._id, { name, updatedAt: Date.now() });
    await touchDraft(ctx, section.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

export const moveSection = mutation({
  args: { sectionId: v.id("menuSections"), toIndex: v.number() },
  handler: async (ctx, args) => {
    const { section, page, access } = await sectionForEdit(ctx, args.sectionId);
    assertPageActive(page);
    if (!Number.isInteger(args.toIndex) || args.toIndex < 0) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE + 1);
    const from = sections.findIndex((candidate) => candidate._id === section._id);
    if (from === -1) throw refuse(MENU_ERROR.notFound);

    const moved = moveItem(sections, from, args.toIndex);
    if (moved.every((candidate, index) => candidate._id === sections[index]._id)) {
      return { ok: true as const };
    }
    const orders = renumberedOrders(moved.length);
    const now = Date.now();
    for (let index = 0; index < moved.length; index += 1) {
      if (moved[index].order !== orders[index]) {
        await ctx.db.patch(moved[index]._id, { order: orders[index], updatedAt: now });
      }
    }
    await touchDraft(ctx, section.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** Deletes the section and its placements. Articles are never deleted. */
export const removeSection = mutation({
  args: { sectionId: v.id("menuSections") },
  handler: async (ctx, args) => {
    const { section, page, access } = await sectionForEdit(ctx, args.sectionId);
    assertPageActive(page);

    const placements = await ctx.db
      .query("menuPlacements")
      .withIndex("by_sectionId_and_order", (q) => q.eq("sectionId", section._id))
      .take(MENU_MAX_PLACEMENTS_PER_PAGE);
    for (const placement of placements) await ctx.db.delete(placement._id);
    await ctx.db.delete(section._id);
    await ctx.db.patch(page._id, {
      placementCount: Math.max(0, page.placementCount - placements.length),
    });
    await touchDraft(ctx, section.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Articles (shared, ONE base price)
// -----------------------------------------------------------------------------

/**
 * Creates a new article and shows it in a section in one step (no separate
 * "library" step, master §5.2). When an article with the same normalized name
 * exists and `allowDuplicate` is not set, nothing is written and the existing
 * candidates are returned so the client can re-use one (addPlacement).
 */
export const quickAddArticle = mutation({
  args: {
    sectionId: v.id("menuSections"),
    name: v.string(),
    priceRsd: v.optional(v.number()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { section, page, access } = await sectionForEdit(ctx, args.sectionId);
    assertPageActive(page);
    const name = requiredText(args.name, MENU_TEXT.articleName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);
    if (args.priceRsd !== undefined && !isValidRsd(args.priceRsd)) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    const draft = await loadDraftState(ctx, section.menuServiceId);
    if (draft.articleCount >= MENU_MAX_ARTICLES) throw refuse(MENU_ERROR.limitReached);
    if (page.placementCount >= MENU_MAX_PLACEMENTS_PER_PAGE) {
      throw refuse(MENU_ERROR.limitReached);
    }

    const nameNormalized = normalizeArticleName(name);
    if (args.allowDuplicate !== true && nameNormalized !== "") {
      const similar = await ctx.db
        .query("menuArticles")
        .withIndex("by_menuServiceId_and_nameNormalized", (q) =>
          q.eq("menuServiceId", section.menuServiceId).eq("nameNormalized", nameNormalized),
        )
        .take(5);
      if (similar.length > 0) {
        return { status: "similar" as const, candidates: similar.map(candidateOf) };
      }
    }

    const now = Date.now();
    const key = newMenuKey("article");
    const articleId = await ctx.db.insert("menuArticles", {
      menuServiceId: section.menuServiceId,
      key,
      kind: "item",
      name,
      nameNormalized,
      ...(args.priceRsd !== undefined ? { basePriceRsd: args.priceRsd } : {}),
      mediaMode: "none",
      createdAt: now,
      updatedAt: now,
      updatedByUserId: access.user._id,
    });
    const placementId = await appendPlacement(ctx, {
      page,
      sectionId: section._id,
      articleId,
    });
    await touchDraft(ctx, section.menuServiceId, access.user._id, { articleDelta: 1 });
    return { status: "created" as const, articleId, placementId, key };
  },
});

// In `expected`, null means "the field is absent"; in `patch`, null clears an
// optional field. Both use this shape.
const articleFieldsValidator = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.union(v.string(), v.null())),
  quantityValue: v.optional(v.union(v.number(), v.null())),
  quantityUnit: v.optional(v.union(v.string(), v.null())),
});
type ArticleFields = Infer<typeof articleFieldsValidator>;
type ArticleFieldKey = keyof ArticleFields;
const ARTICLE_FIELD_KEYS: readonly ArticleFieldKey[] = [
  "name",
  "description",
  "quantityValue",
  "quantityUnit",
];

type ArticleChanges = Partial<
  Pick<
    Doc<"menuArticles">,
    "name" | "nameNormalized" | "description" | "quantityValue" | "quantityUnit"
  >
>;

/** The validated, cleaned form of a patch; null when any value is invalid. */
function cleanedChanges(patch: ArticleFields): ArticleChanges | null {
  const changes: ArticleChanges = {};
  if (patch.name !== undefined) {
    const name = requiredText(patch.name, MENU_TEXT.articleName);
    if (name === null) return null;
    changes.name = name;
    changes.nameNormalized = normalizeArticleName(name);
  }
  if (patch.description !== undefined) {
    if (patch.description === null) {
      changes.description = undefined;
    } else {
      const description = optionalText(patch.description, MENU_TEXT.articleDescription);
      if (description === false) return null;
      changes.description = description;
    }
  }
  if (patch.quantityValue !== undefined) {
    if (patch.quantityValue === null) {
      changes.quantityValue = undefined;
    } else {
      const value = patch.quantityValue;
      if (!Number.isFinite(value) || value <= 0 || value > MENU_MAX_QUANTITY) return null;
      changes.quantityValue = value;
    }
  }
  if (patch.quantityUnit !== undefined) {
    if (patch.quantityUnit === null) {
      changes.quantityUnit = undefined;
    } else {
      const unit = optionalText(patch.quantityUnit, MENU_TEXT.quantityUnit);
      if (unit === false) return null;
      changes.quantityUnit = unit;
    }
  }
  return changes;
}

function presentKeys(fields: ArticleFields): ArticleFieldKey[] {
  return ARTICLE_FIELD_KEYS.filter((key) => fields[key] !== undefined);
}

/**
 * Name, description and quantity of the shared article, by compare-and-set:
 * every key in `patch` must also be in `expected` (the value the editor last
 * saw). A conflict writes nothing and returns the current values.
 */
export const updateArticleFields = mutation({
  args: {
    articleId: v.id("menuArticles"),
    expected: articleFieldsValidator,
    patch: articleFieldsValidator,
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);

    const patchKeys = presentKeys(args.patch);
    if (patchKeys.length === 0 || patchKeys.some((key) => args.expected[key] === undefined)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const changes = cleanedChanges(args.patch);
    if (changes === null) throw refuse(MENU_ERROR.invalidInput);

    const expected: Partial<Record<ArticleFieldKey, CasValue>> = {};
    for (const key of presentKeys(args.expected)) expected[key] = args.expected[key] ?? null;
    const cas = checkCas<ArticleFieldKey>(
      {
        name: article.name,
        description: article.description,
        quantityValue: article.quantityValue,
        quantityUnit: article.quantityUnit,
      },
      expected,
      args.patch,
    );
    if (!cas.ok) return cas;

    const effective: ArticleChanges = {};
    if ("name" in changes && changes.name !== article.name) {
      effective.name = changes.name;
      effective.nameNormalized = changes.nameNormalized;
    }
    if ("description" in changes && changes.description !== article.description) {
      effective.description = changes.description;
    }
    if ("quantityValue" in changes && changes.quantityValue !== article.quantityValue) {
      effective.quantityValue = changes.quantityValue;
    }
    if ("quantityUnit" in changes && changes.quantityUnit !== article.quantityUnit) {
      effective.quantityUnit = changes.quantityUnit;
    }
    if (Object.keys(effective).length === 0) return { ok: true as const };

    await ctx.db.patch(article._id, {
      ...effective,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/**
 * THE price writer (master §5.3): one base price in whole dinars, shown on
 * every page the article is on. `null` clears the price. Compare-and-set on
 * the price the editor last saw (null = none). Room service follows in the same
 * transaction (K03): a derived RS price needs nothing, a manual RS price stays
 * and gets the old/new base warning. Combos follow too (K04, master §5.4): a
 * combo containing this article keeps its manual price and gets "check the
 * combo price"; setting a combo's own price clears that flag.
 */
export const setBasePrice = mutation({
  args: {
    articleId: v.id("menuArticles"),
    expectedPriceRsd: v.union(v.number(), v.null()),
    priceRsd: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    if (args.priceRsd !== null && !isValidRsd(args.priceRsd)) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    const cas = checkCas<"basePriceRsd">(
      { basePriceRsd: article.basePriceRsd },
      { basePriceRsd: args.expectedPriceRsd },
      { basePriceRsd: args.priceRsd },
    );
    if (!cas.ok) return cas;
    if (args.priceRsd === (article.basePriceRsd ?? null)) return { ok: true as const };

    const now = Date.now();
    await ctx.db.patch(article._id, {
      basePriceRsd: args.priceRsd === null ? undefined : args.priceRsd,
      // K04: a new combo price is the client's decision on "check the combo price".
      ...(article.kind === "combo" && article.priceCheck ? { priceCheck: undefined } : {}),
      updatedAt: now,
      updatedByUserId: access.user._id,
    });
    const roomServiceWarning = await flagRoomServicePriceWarnings(
      ctx,
      article._id,
      article.basePriceRsd ?? null,
      args.priceRsd,
    );
    // K04: combos containing this article keep their manual price and get the flag.
    await flagCombosForPriceChange(ctx, article, now);
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    // K16: a manual Room service price kept its value; the editor asks at once (master §5.3).
    // The field is present only with a warning, so the plain answer stays `{ ok: true }`.
    return roomServiceWarning ? { ok: true as const, roomServiceWarning } : { ok: true as const };
  },
});

/**
 * Re-use before duplicating (master §5.2): articles of the service whose
 * normalized name equals, then starts with, the normalized `name`. At most 10.
 * null when the caller cannot read the service.
 */
export const findSimilarArticles = query({
  args: { menuServiceId: v.id("menuServices"), name: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const normalized = normalizeArticleName(args.name);
    if (normalized === "") return [];

    // The prefix range starts at the normalized name itself, so exact matches
    // sort first and one bounded read returns "exact, then prefix".
    const rows = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_nameNormalized", (q) =>
        q
          .eq("menuServiceId", args.menuServiceId)
          .gte("nameNormalized", normalized)
          .lt("nameNormalized", normalized + "￿"),
      )
      .take(10);
    return rows.map(candidateOf);
  },
});

// -----------------------------------------------------------------------------
// Placements (order + visibility, NEVER a price)
// -----------------------------------------------------------------------------

/** Shows an existing article in another section (re-use, master §5.1, §5.2). */
export const addPlacement = mutation({
  args: { sectionId: v.id("menuSections"), articleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const { section, page, access } = await sectionForEdit(ctx, args.sectionId);
    const article = await loadOwned(ctx, args.articleId, section.menuServiceId);
    assertPageActive(page);

    const existing = await ctx.db
      .query("menuPlacements")
      .withIndex("by_sectionId_and_articleId", (q) =>
        q.eq("sectionId", section._id).eq("articleId", article._id),
      )
      .first();
    if (existing) throw refuse(MENU_ERROR.placementExists);

    const placementId = await appendPlacement(ctx, {
      page,
      sectionId: section._id,
      articleId: article._id,
    });
    await touchDraft(ctx, section.menuServiceId, access.user._id);
    return { placementId };
  },
});

/** "Ukloni sa ove stranice": only this appearance goes, the article stays. */
export const removePlacement = mutation({
  args: { placementId: v.id("menuPlacements") },
  handler: async (ctx, args) => {
    const { placement, page, access } = await placementForEdit(ctx, args.placementId);
    assertPageActive(page);

    await ctx.db.delete(placement._id);
    await ctx.db.patch(page._id, { placementCount: Math.max(0, page.placementCount - 1) });
    await touchDraft(ctx, placement.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** "Sakrij" / show on this page; the position is kept. */
export const setPlacementVisibility = mutation({
  args: { placementId: v.id("menuPlacements"), visibility: menuVisibilityValidator },
  handler: async (ctx, args) => {
    const { placement, page, access } = await placementForEdit(ctx, args.placementId);
    assertPageActive(page);
    if (placement.visibility === args.visibility) return { ok: true as const };

    await ctx.db.patch(placement._id, { visibility: args.visibility, updatedAt: Date.now() });
    await touchDraft(ctx, placement.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** The placement of a section that sorts directly before `beforeOrder` (null = last), skipping `movingId`. */
async function neighbourBefore(
  ctx: MutationCtx,
  sectionId: Id<"menuSections">,
  movingId: Id<"menuPlacements">,
  beforeOrder: number | null,
): Promise<Doc<"menuPlacements"> | null> {
  const rows = await ctx.db
    .query("menuPlacements")
    .withIndex("by_sectionId_and_order", (q) =>
      beforeOrder === null
        ? q.eq("sectionId", sectionId)
        : q.eq("sectionId", sectionId).lt("order", beforeOrder),
    )
    .order("desc")
    .take(2);
  return rows.find((row) => row._id !== movingId) ?? null;
}

/**
 * Moves a placement inside its page: into `toSectionId`, directly before
 * `beforePlacementId` (or to the end of the section). One row is written;
 * only when the order gap is exhausted is the section renumbered.
 */
export const movePlacement = mutation({
  args: {
    placementId: v.id("menuPlacements"),
    toSectionId: v.id("menuSections"),
    beforePlacementId: v.optional(v.id("menuPlacements")),
  },
  handler: async (ctx, args) => {
    const { placement, page, access } = await placementForEdit(ctx, args.placementId);
    const toSection = await loadOwned(ctx, args.toSectionId, placement.menuServiceId);
    // Moving between pages is a later step.
    if (toSection.pageId !== placement.pageId) throw refuse(MENU_ERROR.invalidInput);
    assertPageActive(page);

    const before = args.beforePlacementId
      ? await loadOwned(ctx, args.beforePlacementId, placement.menuServiceId)
      : null;
    if (before && before.sectionId !== toSection._id) throw refuse(MENU_ERROR.invalidInput);
    if (before && before._id === placement._id) return { ok: true as const };

    const sectionChanged = placement.sectionId !== toSection._id;
    if (sectionChanged) {
      const existing = await ctx.db
        .query("menuPlacements")
        .withIndex("by_sectionId_and_articleId", (q) =>
          q.eq("sectionId", toSection._id).eq("articleId", placement.articleId),
        )
        .first();
      if (existing) throw refuse(MENU_ERROR.placementExists);
    }

    const prev = await neighbourBefore(ctx, toSection._id, placement._id, before?.order ?? null);
    const alreadyThere =
      !sectionChanged &&
      (prev === null || placement.order > prev.order) &&
      (before === null || placement.order < before.order);
    if (alreadyThere) return { ok: true as const };

    const now = Date.now();
    let order = orderBetween(prev?.order ?? null, before?.order ?? null);
    if (order === null) {
      // No room between the neighbours: renumber the section (bounded) and
      // place the moved row in the fresh gap.
      const siblings = (
        await ctx.db
          .query("menuPlacements")
          .withIndex("by_sectionId_and_order", (q) => q.eq("sectionId", toSection._id))
          .take(MENU_MAX_PLACEMENTS_PER_PAGE + 1)
      ).filter((row) => row._id !== placement._id);
      const fresh = renumberedOrders(siblings.length);
      for (let index = 0; index < siblings.length; index += 1) {
        if (siblings[index].order !== fresh[index]) {
          await ctx.db.patch(siblings[index]._id, { order: fresh[index], updatedAt: now });
        }
      }
      const beforeIndex = before
        ? siblings.findIndex((row) => row._id === before._id)
        : siblings.length;
      if (beforeIndex === -1) throw refuse(MENU_ERROR.invalidInput);
      order = orderBetween(
        beforeIndex > 0 ? fresh[beforeIndex - 1] : null,
        before ? fresh[beforeIndex] : null,
      );
      if (order === null) throw refuse(MENU_ERROR.invalidInput);
    }

    await ctx.db.patch(placement._id, { sectionId: toSection._id, order, updatedAt: now });
    await touchDraft(ctx, placement.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Read model
// -----------------------------------------------------------------------------

// Above this many distinct articles one range read of the service's articles
// is cheaper than one get per article.
const ARTICLE_GET_LIMIT = 300;

/**
 * Everything the editor and the preview need for one page: its sections and
 * their placements with the shared article (name, quantity, THE base price).
 * Hidden placements are included (flagged). null when the page is missing or
 * the caller cannot read the service. Bounded: `truncated` is true when a
 * ceiling cut the lists.
 */
export const pageContent = query({
  args: { pageId: v.id("menuPages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) return null;
    const access = await getMenuAccess(ctx, { menuServiceId: page.menuServiceId }, "menu.read");
    if (!access) return null;

    const sectionRows = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE + 1);
    const placementRows = await ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_PLACEMENTS_PER_PAGE + 1);
    const truncated =
      sectionRows.length > MENU_MAX_SECTIONS_PER_PAGE ||
      placementRows.length > MENU_MAX_PLACEMENTS_PER_PAGE;
    const sections = sectionRows.slice(0, MENU_MAX_SECTIONS_PER_PAGE);
    const placements = placementRows.slice(0, MENU_MAX_PLACEMENTS_PER_PAGE);

    const articleIds = new Set(placements.map((placement) => placement.articleId));
    const articles = new Map<Id<"menuArticles">, Doc<"menuArticles">>();
    if (articleIds.size <= ARTICLE_GET_LIMIT) {
      for (const articleId of articleIds) {
        const article = await ctx.db.get(articleId);
        if (article && article.menuServiceId === page.menuServiceId) {
          articles.set(article._id, article);
        }
      }
    } else {
      const all = await ctx.db
        .query("menuArticles")
        .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", page.menuServiceId))
        .take(MENU_MAX_ARTICLES + 1);
      for (const article of all) articles.set(article._id, article);
    }

    const bySection = new Map<Id<"menuSections">, Doc<"menuPlacements">[]>();
    for (const placement of placements) {
      const list = bySection.get(placement.sectionId);
      if (list) list.push(placement);
      else bySection.set(placement.sectionId, [placement]);
    }

    return {
      page: {
        pageId: page._id,
        key: page.key,
        slug: page.slug,
        name: page.name,
        publicTitle: page.publicTitle ?? null,
        isDefault: page.isDefault,
        archived: page.archivedAt !== undefined,
      },
      sections: sections.map((section) => ({
        sectionId: section._id,
        key: section.key,
        name: section.name,
        description: section.description ?? null,
        order: section.order,
        visibility: section.visibility,
        placements: (bySection.get(section._id) ?? [])
          .slice()
          .sort((a, b) => a.order - b.order || a._creationTime - b._creationTime)
          .flatMap((placement) => {
            const article = articles.get(placement.articleId);
            if (!article) return [];
            return [
              {
                placementId: placement._id,
                order: placement.order,
                visibility: placement.visibility,
                article: {
                  articleId: article._id,
                  key: article.key,
                  kind: article.kind,
                  name: article.name,
                  description: article.description ?? null,
                  quantityValue: article.quantityValue ?? null,
                  quantityUnit: article.quantityUnit ?? null,
                  basePriceRsd: article.basePriceRsd ?? null,
                  mediaMode: article.mediaMode,
                  iconKey: article.iconKey ?? null,
                  // K10: the editor row shows these without another read.
                  variantsEnabled: article.variantsEnabled === true,
                  priceCheck: article.priceCheck !== undefined,
                },
              },
            ];
          }),
      })),
      truncated,
    };
  },
});
