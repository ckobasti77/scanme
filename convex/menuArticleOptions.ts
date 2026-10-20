import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  getMenuAccess,
  loadManyOwned,
  loadOwned,
  requireMenuAccessToRow,
} from "./lib/menuAccess";
import { onVariantPriceChanged, onVariantRemoved } from "./lib/menuArticleHooks";
import { menuAddonSelectionValidator } from "./lib/menuDomainValidators";
import { auditActorKind, touchDraft, writeMenuAudit } from "./lib/menuDraft";
import {
  addonBounds,
  isAddonGroupSatisfiable,
  normalizeAddonRules,
  type MenuAddonRules,
} from "../lib/menu/addons";
import { checkCas, type CasValue } from "../lib/menu/cas";
import { ARTICLE_ERROR, type ArticleErrorCode } from "../lib/menu/errors/article";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ADDON_GROUPS,
  MENU_MAX_ADDON_GROUPS_PER_ARTICLE,
  MENU_MAX_ADDON_OPTIONS_PER_GROUP,
  MENU_MAX_ARTICLES,
  MENU_MAX_ARTICLE_BATCH,
  MENU_MAX_VARIANTS_PER_ARTICLE,
  MENU_TEXT,
} from "../lib/menu/limits";
import { moveItem, orderAfter, renumberedOrders } from "../lib/menu/order";
import { isValidRsd } from "../lib/menu/rsd";
import { foldSerbian, requiredText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — variants, add-on groups and the per-article option switches
// (K04; master §5.7, §7.5).
//
// A VARIANT is an alternative version of an article (the guest picks exactly
// one, each has its own final price). An ADD-ON is added on top of the chosen
// article / variant for a positive surcharge or for free (0); a GROUP of
// add-ons allows one or several choices and is required or optional (min / max
// are advanced settings, lib/menu/addons.ts is the only rules source). The free
// note is a separate switch. Variants, add-ons and note are OFF by default, so a
// plain article stays "Naziv + Cena"; turning a switch off keeps all rows.
//
// ONE add-on group can be LINKED to many articles (the same milk choice on every
// coffee) through menuArticleAddonGroups; `menuAddonGroups.linkCount` is the
// exact number of link rows. Changing a linked group changes it for ALL its
// articles; "only this article" (`onlyForArticleId`) first makes an independent
// copy for that article, in the same transaction, and changes the copy.
//
// Every write loads the row (missing = not_found), authorizes against THAT
// row's Menu service (requireMenuAccessToRow, "menu.edit"), proves every other
// id belongs to the same service (loadOwned) and calls touchDraft exactly once
// per successful change — never on a refusal, a CAS conflict or a no-op. Article
// model fields are never touched except the three switches.
// =============================================================================

function refuse(code: MenuErrorCode | ArticleErrorCode): ConvexError<string> {
  return new ConvexError(code);
}

type DbCtx = QueryCtx | MutationCtx;

// -----------------------------------------------------------------------------
// Row loaders and bounded lists
// -----------------------------------------------------------------------------

async function articleForEdit(ctx: MutationCtx, articleId: Id<"menuArticles">) {
  const article = await ctx.db.get(articleId);
  if (!article) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, article.menuServiceId, "menu.edit");
  return { article, access };
}

async function variantForEdit(ctx: MutationCtx, variantId: Id<"menuVariants">) {
  const variant = await ctx.db.get(variantId);
  if (!variant) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, variant.menuServiceId, "menu.edit");
  const article = await loadOwned(ctx, variant.articleId, variant.menuServiceId);
  return { variant, article, access };
}

async function groupForEdit(ctx: MutationCtx, groupId: Id<"menuAddonGroups">) {
  const group = await ctx.db.get(groupId);
  if (!group) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, group.menuServiceId, "menu.edit");
  return { group, access };
}

async function optionForEdit(ctx: MutationCtx, optionId: Id<"menuAddonOptions">) {
  const option = await ctx.db.get(optionId);
  if (!option) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, option.menuServiceId, "menu.edit");
  const group = await loadOwned(ctx, option.groupId, option.menuServiceId);
  return { option, group, access };
}

async function variantsOf(ctx: DbCtx, articleId: Id<"menuArticles">) {
  return await ctx.db
    .query("menuVariants")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", articleId))
    .take(MENU_MAX_VARIANTS_PER_ARTICLE + 1);
}

async function linksOf(ctx: DbCtx, articleId: Id<"menuArticles">) {
  return await ctx.db
    .query("menuArticleAddonGroups")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", articleId))
    .take(MENU_MAX_ADDON_GROUPS_PER_ARTICLE + 1);
}

async function optionsOf(ctx: DbCtx, groupId: Id<"menuAddonGroups">) {
  return await ctx.db
    .query("menuAddonOptions")
    .withIndex("by_groupId_and_order", (q) => q.eq("groupId", groupId))
    .take(MENU_MAX_ADDON_OPTIONS_PER_GROUP + 1);
}

/** The order of a row appended after the last of an (ordered, complete) list. */
function appendOrder(rows: readonly { order: number }[]): number {
  return orderAfter(rows.length > 0 ? rows[rows.length - 1].order : null);
}

/** The group count of a service is bounded; a new group needs one free slot. */
async function assertGroupCapacity(ctx: MutationCtx, menuServiceId: Id<"menuServices">) {
  const groups = await ctx.db
    .query("menuAddonGroups")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
    .take(MENU_MAX_ADDON_GROUPS);
  if (groups.length >= MENU_MAX_ADDON_GROUPS) throw refuse(MENU_ERROR.limitReached);
}

/** Switches an article option ON as a side effect of adding a variant / group (intent). */
async function enableSwitch(
  ctx: MutationCtx,
  article: Doc<"menuArticles">,
  which: "variantsEnabled" | "addonsEnabled",
  userId: Id<"users">,
): Promise<void> {
  if (article[which] === true) return;
  const fields = which === "variantsEnabled" ? { variantsEnabled: true } : { addonsEnabled: true };
  await ctx.db.patch(article._id, { ...fields, updatedAt: Date.now(), updatedByUserId: userId });
}

// -----------------------------------------------------------------------------
// Compare-and-set and ordering helpers
// -----------------------------------------------------------------------------

function presentKeys<K extends string>(
  fields: Partial<Record<K, unknown>>,
  keys: readonly K[],
): K[] {
  return keys.filter((key) => fields[key] !== undefined);
}

/** The sequence after moving `from` to `toIndex`, or null when nothing moves. */
function movedOrNull<T extends { _id: string }>(
  rows: readonly T[],
  from: number,
  toIndex: number,
): T[] | null {
  const moved = moveItem(rows, from, toIndex);
  return moved.every((row, index) => row._id === rows[index]._id) ? null : moved;
}

async function writeNewOrders<T extends { order: number }>(
  moved: readonly T[],
  write: (row: T, order: number) => Promise<void>,
): Promise<void> {
  const orders = renumberedOrders(moved.length);
  for (let index = 0; index < moved.length; index += 1) {
    if (moved[index].order !== orders[index]) await write(moved[index], orders[index]);
  }
}

function validIndex(toIndex: number): boolean {
  return Number.isInteger(toIndex) && toIndex >= 0;
}

// -----------------------------------------------------------------------------
// Article option switches
// -----------------------------------------------------------------------------

const SWITCH_KEYS = ["variantsEnabled", "addonsEnabled", "noteEnabled"] as const;

/**
 * The three per-article switches (all OFF by default). At least one key is
 * required; only changed values are written; an unchanged call is a no-op.
 * Turning a switch off keeps every variant / group row. Variants are for
 * ordinary articles, so a combo cannot switch them on.
 */
export const setArticleOptionSwitches = mutation({
  args: {
    articleId: v.id("menuArticles"),
    variantsEnabled: v.optional(v.boolean()),
    addonsEnabled: v.optional(v.boolean()),
    noteEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    if (SWITCH_KEYS.every((key) => args[key] === undefined)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    if (args.variantsEnabled === true && article.kind === "combo") {
      throw refuse(ARTICLE_ERROR.notCombo);
    }

    const changes: { variantsEnabled?: boolean; addonsEnabled?: boolean; noteEnabled?: boolean } =
      {};
    for (const key of SWITCH_KEYS) {
      const next = args[key];
      if (next !== undefined && next !== (article[key] ?? false)) changes[key] = next;
    }
    if (Object.keys(changes).length === 0) return { ok: true as const };

    await ctx.db.patch(article._id, {
      ...changes,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Variants
// -----------------------------------------------------------------------------

/**
 * Appends a variant (an alternative version of the article with its own final
 * price). Adding one expresses intent, so the article's `variantsEnabled`
 * switch goes ON in the same change. Combos have no variants.
 */
export const addVariant = mutation({
  args: {
    articleId: v.id("menuArticles"),
    name: v.string(),
    priceRsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    if (article.kind === "combo") throw refuse(ARTICLE_ERROR.notCombo);
    const name = requiredText(args.name, MENU_TEXT.variantName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);
    if (args.priceRsd !== undefined && !isValidRsd(args.priceRsd)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const variants = await variantsOf(ctx, article._id);
    if (variants.length >= MENU_MAX_VARIANTS_PER_ARTICLE) throw refuse(MENU_ERROR.limitReached);

    const now = Date.now();
    const key = newMenuKey("variant");
    const variantId = await ctx.db.insert("menuVariants", {
      menuServiceId: article.menuServiceId,
      articleId: article._id,
      key,
      name,
      ...(args.priceRsd !== undefined ? { priceRsd: args.priceRsd } : {}),
      order: appendOrder(variants),
      createdAt: now,
      updatedAt: now,
    });
    await enableSwitch(ctx, article, "variantsEnabled", access.user._id);
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { variantId, key };
  },
});

// In `expected`, null means "the variant has no price"; in `patch`, null clears it.
const variantFieldsValidator = v.object({
  name: v.optional(v.string()),
  priceRsd: v.optional(v.union(v.number(), v.null())),
});
type VariantFieldKey = keyof Infer<typeof variantFieldsValidator>;
const VARIANT_FIELD_KEYS: readonly VariantFieldKey[] = ["name", "priceRsd"];

/**
 * Name and price of a variant by compare-and-set: every key in `patch` must
 * also be in `expected`. A price change also reaches combos that contain the
 * article and a manual Room service price of the variant (onVariantPriceChanged,
 * same transaction).
 */
export const updateVariant = mutation({
  args: {
    variantId: v.id("menuVariants"),
    expected: variantFieldsValidator,
    patch: variantFieldsValidator,
  },
  handler: async (ctx, args) => {
    const { variant, article, access } = await variantForEdit(ctx, args.variantId);

    const patchKeys = presentKeys(args.patch, VARIANT_FIELD_KEYS);
    if (patchKeys.length === 0 || patchKeys.some((key) => args.expected[key] === undefined)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    let name: string | undefined;
    if (args.patch.name !== undefined) {
      const cleaned = requiredText(args.patch.name, MENU_TEXT.variantName);
      if (cleaned === null) throw refuse(MENU_ERROR.invalidInput);
      name = cleaned;
    }
    const price = args.patch.priceRsd;
    if (price !== undefined && price !== null && !isValidRsd(price)) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    const expected: Partial<Record<VariantFieldKey, CasValue>> = {};
    for (const key of presentKeys(args.expected, VARIANT_FIELD_KEYS)) {
      expected[key] = args.expected[key] ?? null;
    }
    const cas = checkCas<VariantFieldKey>(
      { name: variant.name, priceRsd: variant.priceRsd },
      expected,
      args.patch,
    );
    if (!cas.ok) return cas;

    const nameChanged = name !== undefined && name !== variant.name;
    const priceChanged = price !== undefined && price !== (variant.priceRsd ?? null);
    if (!nameChanged && !priceChanged) return { ok: true as const };

    const now = Date.now();
    await ctx.db.patch(variant._id, {
      ...(nameChanged ? { name } : {}),
      ...(priceChanged ? { priceRsd: price ?? undefined } : {}),
      updatedAt: now,
    });
    if (priceChanged) {
      await onVariantPriceChanged(ctx, {
        article,
        variantKey: variant.key,
        previousRsd: variant.priceRsd ?? null,
        nextRsd: price ?? null,
        at: now,
      });
    }
    await touchDraft(ctx, variant.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** Deletes a variant. `variantsEnabled` is not changed (the switch is the client's decision). */
export const removeVariant = mutation({
  args: { variantId: v.id("menuVariants") },
  handler: async (ctx, args) => {
    const { variant, article, access } = await variantForEdit(ctx, args.variantId);
    await ctx.db.delete(variant._id);
    await onVariantRemoved(ctx, { article, variantKey: variant.key });
    await touchDraft(ctx, variant.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

export const moveVariant = mutation({
  args: { variantId: v.id("menuVariants"), toIndex: v.number() },
  handler: async (ctx, args) => {
    const { variant, access } = await variantForEdit(ctx, args.variantId);
    if (!validIndex(args.toIndex)) throw refuse(MENU_ERROR.invalidInput);

    const variants = await variantsOf(ctx, variant.articleId);
    const from = variants.findIndex((candidate) => candidate._id === variant._id);
    if (from === -1) throw refuse(MENU_ERROR.notFound);
    const moved = movedOrNull(variants, from, args.toIndex);
    if (moved === null) return { ok: true as const };

    const now = Date.now();
    await writeNewOrders(moved, async (row, order) => {
      await ctx.db.patch(row._id, { order, updatedAt: now });
    });
    await touchDraft(ctx, variant.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Add-on groups (linked: one group, many articles)
// -----------------------------------------------------------------------------

const optionInputValidator = v.object({ name: v.string(), priceDeltaRsd: v.number() });

/**
 * A NEW add-on group for this article, with its options and rules; the group
 * is linked to the article (linkCount 1) and the article's `addonsEnabled`
 * switch goes ON. Rules go through normalizeAddonRules (contradictions →
 * article/addon_rules_invalid).
 */
export const createAddonGroup = mutation({
  args: {
    articleId: v.id("menuArticles"),
    name: v.string(),
    selection: menuAddonSelectionValidator,
    required: v.boolean(),
    minSelect: v.optional(v.number()),
    maxSelect: v.optional(v.number()),
    options: v.optional(v.array(optionInputValidator)),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const name = requiredText(args.name, MENU_TEXT.addonGroupName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);
    const rules = normalizeAddonRules({
      selection: args.selection,
      required: args.required,
      minSelect: args.minSelect,
      maxSelect: args.maxSelect,
    });
    if (rules === null) throw refuse(ARTICLE_ERROR.addonRulesInvalid);

    const optionInputs = args.options ?? [];
    if (optionInputs.length > MENU_MAX_ADDON_OPTIONS_PER_GROUP) {
      throw refuse(MENU_ERROR.limitReached);
    }
    const options: { name: string; priceDeltaRsd: number }[] = [];
    for (const input of optionInputs) {
      const optionName = requiredText(input.name, MENU_TEXT.addonOptionName);
      if (optionName === null || !isValidRsd(input.priceDeltaRsd)) {
        throw refuse(MENU_ERROR.invalidInput);
      }
      options.push({ name: optionName, priceDeltaRsd: input.priceDeltaRsd });
    }

    const links = await linksOf(ctx, article._id);
    if (links.length >= MENU_MAX_ADDON_GROUPS_PER_ARTICLE) throw refuse(MENU_ERROR.limitReached);
    await assertGroupCapacity(ctx, article.menuServiceId);

    const now = Date.now();
    const key = newMenuKey("addonGroup");
    const groupId = await ctx.db.insert("menuAddonGroups", {
      menuServiceId: article.menuServiceId,
      key,
      name,
      selection: rules.selection,
      required: rules.required,
      ...(rules.minSelect !== undefined ? { minSelect: rules.minSelect } : {}),
      ...(rules.maxSelect !== undefined ? { maxSelect: rules.maxSelect } : {}),
      linkCount: 1,
      createdAt: now,
      updatedAt: now,
      updatedByUserId: access.user._id,
    });
    let order: number | null = null;
    for (const option of options) {
      order = orderAfter(order);
      await ctx.db.insert("menuAddonOptions", {
        menuServiceId: article.menuServiceId,
        groupId,
        key: newMenuKey("addonOption"),
        name: option.name,
        priceDeltaRsd: option.priceDeltaRsd,
        order,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("menuArticleAddonGroups", {
      menuServiceId: article.menuServiceId,
      articleId: article._id,
      groupId,
      order: appendOrder(links),
      createdAt: now,
    });
    await enableSwitch(ctx, article, "addonsEnabled", access.user._id);
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { groupId, key };
  },
});

/** "Use an existing group": links a group of the same service to the article. */
export const attachAddonGroup = mutation({
  args: { articleId: v.id("menuArticles"), groupId: v.id("menuAddonGroups") },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const group = await loadOwned(ctx, args.groupId, article.menuServiceId);
    const links = await linksOf(ctx, article._id);
    if (links.some((link) => link.groupId === group._id)) {
      throw refuse(ARTICLE_ERROR.addonGroupAttached);
    }
    if (links.length >= MENU_MAX_ADDON_GROUPS_PER_ARTICLE) throw refuse(MENU_ERROR.limitReached);

    await ctx.db.insert("menuArticleAddonGroups", {
      menuServiceId: article.menuServiceId,
      articleId: article._id,
      groupId: group._id,
      order: appendOrder(links),
      createdAt: Date.now(),
    });
    await ctx.db.patch(group._id, { linkCount: group.linkCount + 1 });
    await enableSwitch(ctx, article, "addonsEnabled", access.user._id);
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/**
 * Unlinks a group from the article. The group itself stays, even at 0 links
 * (it can be re-used from the "existing groups" picker); data is never deleted
 * silently — deleteAddonGroup is the explicit way.
 */
export const detachAddonGroup = mutation({
  args: { articleId: v.id("menuArticles"), groupId: v.id("menuAddonGroups") },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const group = await loadOwned(ctx, args.groupId, article.menuServiceId);
    const link = (await linksOf(ctx, article._id)).find((row) => row.groupId === group._id);
    if (!link) throw refuse(ARTICLE_ERROR.addonGroupNotAttached);

    await ctx.db.delete(link._id);
    await ctx.db.patch(group._id, { linkCount: Math.max(0, group.linkCount - 1) });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** Reorders the groups of one article. */
export const moveArticleAddonGroup = mutation({
  args: {
    articleId: v.id("menuArticles"),
    groupId: v.id("menuAddonGroups"),
    toIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const group = await loadOwned(ctx, args.groupId, article.menuServiceId);
    if (!validIndex(args.toIndex)) throw refuse(MENU_ERROR.invalidInput);

    const links = await linksOf(ctx, article._id);
    const from = links.findIndex((link) => link.groupId === group._id);
    if (from === -1) throw refuse(ARTICLE_ERROR.addonGroupNotAttached);
    const moved = movedOrNull(links, from, args.toIndex);
    if (moved === null) return { ok: true as const };

    await writeNewOrders(moved, async (row, order) => {
      await ctx.db.patch(row._id, { order });
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/**
 * "Primeni i na druge artikle": links the group to the chosen articles. A
 * foreign article id is not_found and nothing is written; articles that
 * already have the group, or are at the per-article limit, are skipped and
 * counted.
 */
export const applyAddonGroupToArticles = mutation({
  args: { groupId: v.id("menuAddonGroups"), articleIds: v.array(v.id("menuArticles")) },
  handler: async (ctx, args) => {
    const { group, access } = await groupForEdit(ctx, args.groupId);
    const ids = [...new Set(args.articleIds)];
    if (ids.length === 0 || ids.length > MENU_MAX_ARTICLE_BATCH) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const articles = await loadManyOwned(ctx, ids, group.menuServiceId);

    const now = Date.now();
    let attached = 0;
    let alreadyAttached = 0;
    let skippedAtLimit = 0;
    for (const article of articles) {
      const links = await linksOf(ctx, article._id);
      if (links.some((link) => link.groupId === group._id)) {
        alreadyAttached += 1;
        continue;
      }
      if (links.length >= MENU_MAX_ADDON_GROUPS_PER_ARTICLE) {
        skippedAtLimit += 1;
        continue;
      }
      await ctx.db.insert("menuArticleAddonGroups", {
        menuServiceId: group.menuServiceId,
        articleId: article._id,
        groupId: group._id,
        order: appendOrder(links),
        createdAt: now,
      });
      await enableSwitch(ctx, article, "addonsEnabled", access.user._id);
      attached += 1;
    }
    if (attached > 0) {
      await ctx.db.patch(group._id, { linkCount: group.linkCount + attached });
      await touchDraft(ctx, group.menuServiceId, access.user._id);
    }
    return { attached, alreadyAttached, skippedAtLimit };
  },
});

// -----------------------------------------------------------------------------
// "Only for this article": the independent copy of a linked group
// -----------------------------------------------------------------------------

type CopiedGroup = {
  groupId: Id<"menuAddonGroups">;
  /** Old option id → the option id of the copy. */
  optionIdMap: Map<Id<"menuAddonOptions">, Id<"menuAddonOptions">>;
};

/**
 * Makes an independent copy of `group` for the article behind `link`: a new
 * group (new key, same name and rules, linkCount 1) with a copy of every option
 * (new keys, same order / name / price); the link is repointed to the copy and
 * the original loses one link. The caller guarantees the group has other links.
 */
async function copyGroupForLink(
  ctx: MutationCtx,
  group: Doc<"menuAddonGroups">,
  link: Doc<"menuArticleAddonGroups">,
  userId: Id<"users">,
): Promise<CopiedGroup> {
  await assertGroupCapacity(ctx, group.menuServiceId);
  const options = await optionsOf(ctx, group._id);
  const now = Date.now();
  const groupId = await ctx.db.insert("menuAddonGroups", {
    menuServiceId: group.menuServiceId,
    key: newMenuKey("addonGroup"),
    name: group.name,
    selection: group.selection,
    required: group.required,
    ...(group.minSelect !== undefined ? { minSelect: group.minSelect } : {}),
    ...(group.maxSelect !== undefined ? { maxSelect: group.maxSelect } : {}),
    linkCount: 1,
    ...(group.translations ? { translations: group.translations } : {}),
    createdAt: now,
    updatedAt: now,
    updatedByUserId: userId,
  });
  const optionIdMap = new Map<Id<"menuAddonOptions">, Id<"menuAddonOptions">>();
  for (const option of options) {
    const copyId = await ctx.db.insert("menuAddonOptions", {
      menuServiceId: group.menuServiceId,
      groupId,
      key: newMenuKey("addonOption"),
      name: option.name,
      priceDeltaRsd: option.priceDeltaRsd,
      order: option.order,
      ...(option.translations ? { translations: option.translations } : {}),
      createdAt: now,
      updatedAt: now,
    });
    optionIdMap.set(option._id, copyId);
  }
  await ctx.db.patch(link._id, { groupId });
  await ctx.db.patch(group._id, { linkCount: Math.max(0, group.linkCount - 1) });
  return { groupId, optionIdMap };
}

/**
 * Validates `onlyForArticleId` (an article of the same service that is linked
 * to the group) without writing. null = no scope: the change is for ALL linked
 * articles.
 */
async function loadScope(
  ctx: MutationCtx,
  group: Doc<"menuAddonGroups">,
  onlyForArticleId: Id<"menuArticles"> | undefined,
): Promise<Doc<"menuArticleAddonGroups"> | null> {
  if (onlyForArticleId === undefined) return null;
  const article = await loadOwned(ctx, onlyForArticleId, group.menuServiceId);
  const link = (await linksOf(ctx, article._id)).find((row) => row.groupId === group._id);
  if (!link) throw refuse(ARTICLE_ERROR.addonGroupNotAttached);
  return link;
}

type WriteTarget = {
  groupId: Id<"menuAddonGroups">;
  copied: boolean;
  optionIdMap: ReadonlyMap<Id<"menuAddonOptions">, Id<"menuAddonOptions">> | null;
};

/**
 * The group a change is written to. Without a scope, or when the scoped article
 * is the group's only link, it is the group itself; otherwise the independent
 * copy made right now. Call it only after validation and CAS: it writes.
 */
async function writeTargetFor(
  ctx: MutationCtx,
  group: Doc<"menuAddonGroups">,
  scope: Doc<"menuArticleAddonGroups"> | null,
  userId: Id<"users">,
): Promise<WriteTarget> {
  if (scope === null || group.linkCount <= 1) {
    return { groupId: group._id, copied: false, optionIdMap: null };
  }
  const copy = await copyGroupForLink(ctx, group, scope, userId);
  return { groupId: copy.groupId, copied: true, optionIdMap: copy.optionIdMap };
}

/**
 * Makes the article's group independent: "kopija samo za ovaj artikal". If the
 * article is the group's only link nothing is written (`copied: false`).
 */
export const copyAddonGroupForArticle = mutation({
  args: { articleId: v.id("menuArticles"), groupId: v.id("menuAddonGroups") },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const group = await loadOwned(ctx, args.groupId, article.menuServiceId);
    const link = await loadScope(ctx, group, article._id);
    const target = await writeTargetFor(ctx, group, link, access.user._id);
    if (!target.copied) return { groupId: target.groupId, copied: false };
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { groupId: target.groupId, copied: true };
  },
});

// In `expected`, null means "not set"; in `patch`, null clears minSelect / maxSelect.
const groupFieldsValidator = v.object({
  name: v.optional(v.string()),
  selection: v.optional(menuAddonSelectionValidator),
  required: v.optional(v.boolean()),
  minSelect: v.optional(v.union(v.number(), v.null())),
  maxSelect: v.optional(v.union(v.number(), v.null())),
});
type GroupFieldKey = keyof Infer<typeof groupFieldsValidator>;
const GROUP_FIELD_KEYS: readonly GroupFieldKey[] = [
  "name",
  "selection",
  "required",
  "minSelect",
  "maxSelect",
];

/**
 * Name and rules of a group by compare-and-set (every key in `patch` must be in
 * `expected`); the merged result goes through normalizeAddonRules. Without
 * `onlyForArticleId` the shared group changes for ALL linked articles. With it
 * and other links present, the article first gets an independent copy (same
 * transaction) and the copy is changed. `groupId` is the group that now holds
 * the change.
 */
export const updateAddonGroup = mutation({
  args: {
    groupId: v.id("menuAddonGroups"),
    expected: groupFieldsValidator,
    patch: groupFieldsValidator,
    onlyForArticleId: v.optional(v.id("menuArticles")),
  },
  handler: async (ctx, args) => {
    const { group, access } = await groupForEdit(ctx, args.groupId);

    const patchKeys = presentKeys(args.patch, GROUP_FIELD_KEYS);
    if (patchKeys.length === 0 || patchKeys.some((key) => args.expected[key] === undefined)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    let name: string | undefined;
    if (args.patch.name !== undefined) {
      const cleaned = requiredText(args.patch.name, MENU_TEXT.addonGroupName);
      if (cleaned === null) throw refuse(MENU_ERROR.invalidInput);
      name = cleaned;
    }
    const scope = await loadScope(ctx, group, args.onlyForArticleId);

    const expected: Partial<Record<GroupFieldKey, CasValue>> = {};
    for (const key of presentKeys(args.expected, GROUP_FIELD_KEYS)) {
      expected[key] = args.expected[key] ?? null;
    }
    const cas = checkCas<GroupFieldKey>(
      {
        name: group.name,
        selection: group.selection,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
      },
      expected,
      args.patch,
    );
    if (!cas.ok) return cas;

    const rules = normalizeAddonRules({
      selection: args.patch.selection ?? group.selection,
      required: args.patch.required ?? group.required,
      minSelect: args.patch.minSelect === undefined ? group.minSelect : args.patch.minSelect,
      maxSelect: args.patch.maxSelect === undefined ? group.maxSelect : args.patch.maxSelect,
    });
    if (rules === null) throw refuse(ARTICLE_ERROR.addonRulesInvalid);

    const nextName = name ?? group.name;
    const changed =
      nextName !== group.name ||
      rules.selection !== group.selection ||
      rules.required !== group.required ||
      (rules.minSelect ?? null) !== (group.minSelect ?? null) ||
      (rules.maxSelect ?? null) !== (group.maxSelect ?? null);
    if (!changed) return { ok: true as const, groupId: group._id, copied: false };

    const target = await writeTargetFor(ctx, group, scope, access.user._id);
    await ctx.db.patch(target.groupId, {
      name: nextName,
      selection: rules.selection,
      required: rules.required,
      minSelect: rules.minSelect,
      maxSelect: rules.maxSelect,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, group.menuServiceId, access.user._id);
    return { ok: true as const, groupId: target.groupId, copied: target.copied };
  },
});

/** Deletes a group everywhere: every link, every option and the group; audited. */
export const deleteAddonGroup = mutation({
  args: { groupId: v.id("menuAddonGroups") },
  handler: async (ctx, args) => {
    const { group, access } = await groupForEdit(ctx, args.groupId);
    // A group is linked to an article at most once, so links are bounded by the article ceiling.
    const links = await ctx.db
      .query("menuArticleAddonGroups")
      .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
      .take(MENU_MAX_ARTICLES);
    const options = await optionsOf(ctx, group._id);

    for (const link of links) await ctx.db.delete(link._id);
    for (const option of options) await ctx.db.delete(option._id);
    await ctx.db.delete(group._id);
    await writeMenuAudit(ctx, {
      menuServiceId: group.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "addon_group.deleted",
      entityType: "menuAddonGroups",
      entityKey: group.key,
      details: { name: group.name, links: links.length },
    });
    await touchDraft(ctx, group.menuServiceId, access.user._id);
    return { deleted: true as const, links: links.length };
  },
});

// -----------------------------------------------------------------------------
// Add-on options
// -----------------------------------------------------------------------------

/** Adds an add-on (positive surcharge or free = 0) to the end of a group. */
export const addAddonOption = mutation({
  args: {
    groupId: v.id("menuAddonGroups"),
    name: v.string(),
    priceDeltaRsd: v.number(),
    onlyForArticleId: v.optional(v.id("menuArticles")),
  },
  handler: async (ctx, args) => {
    const { group, access } = await groupForEdit(ctx, args.groupId);
    const name = requiredText(args.name, MENU_TEXT.addonOptionName);
    if (name === null || !isValidRsd(args.priceDeltaRsd)) throw refuse(MENU_ERROR.invalidInput);
    const scope = await loadScope(ctx, group, args.onlyForArticleId);
    const options = await optionsOf(ctx, group._id);
    if (options.length >= MENU_MAX_ADDON_OPTIONS_PER_GROUP) throw refuse(MENU_ERROR.limitReached);

    const target = await writeTargetFor(ctx, group, scope, access.user._id);
    const now = Date.now();
    const key = newMenuKey("addonOption");
    // A copy has the same options at the same orders, so the original's last order applies.
    const optionId = await ctx.db.insert("menuAddonOptions", {
      menuServiceId: group.menuServiceId,
      groupId: target.groupId,
      key,
      name,
      priceDeltaRsd: args.priceDeltaRsd,
      order: appendOrder(options),
      createdAt: now,
      updatedAt: now,
    });
    await touchDraft(ctx, group.menuServiceId, access.user._id);
    return { ok: true as const, groupId: target.groupId, copied: target.copied, optionId, key };
  },
});

const optionFieldsValidator = v.object({
  name: v.optional(v.string()),
  priceDeltaRsd: v.optional(v.number()),
});
type OptionFieldKey = keyof Infer<typeof optionFieldsValidator>;
const OPTION_FIELD_KEYS: readonly OptionFieldKey[] = ["name", "priceDeltaRsd"];

/**
 * Name and surcharge of an add-on by compare-and-set. `onlyForArticleId` works
 * as in updateAddonGroup: on a shared group the article gets a copy first and
 * the copied option is changed. A conflict writes nothing, not even a copy.
 */
export const updateAddonOption = mutation({
  args: {
    optionId: v.id("menuAddonOptions"),
    expected: optionFieldsValidator,
    patch: optionFieldsValidator,
    onlyForArticleId: v.optional(v.id("menuArticles")),
  },
  handler: async (ctx, args) => {
    const { option, group, access } = await optionForEdit(ctx, args.optionId);

    const patchKeys = presentKeys(args.patch, OPTION_FIELD_KEYS);
    if (patchKeys.length === 0 || patchKeys.some((key) => args.expected[key] === undefined)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    let name: string | undefined;
    if (args.patch.name !== undefined) {
      const cleaned = requiredText(args.patch.name, MENU_TEXT.addonOptionName);
      if (cleaned === null) throw refuse(MENU_ERROR.invalidInput);
      name = cleaned;
    }
    const price = args.patch.priceDeltaRsd;
    if (price !== undefined && !isValidRsd(price)) throw refuse(MENU_ERROR.invalidInput);
    const scope = await loadScope(ctx, group, args.onlyForArticleId);

    const expected: Partial<Record<OptionFieldKey, CasValue>> = {};
    for (const key of presentKeys(args.expected, OPTION_FIELD_KEYS)) {
      expected[key] = args.expected[key] ?? null;
    }
    const cas = checkCas<OptionFieldKey>(
      { name: option.name, priceDeltaRsd: option.priceDeltaRsd },
      expected,
      args.patch,
    );
    if (!cas.ok) return cas;

    const nameChanged = name !== undefined && name !== option.name;
    const priceChanged = price !== undefined && price !== option.priceDeltaRsd;
    if (!nameChanged && !priceChanged) {
      return { ok: true as const, groupId: group._id, copied: false, optionId: option._id };
    }

    const target = await writeTargetFor(ctx, group, scope, access.user._id);
    const optionId = target.optionIdMap?.get(option._id) ?? option._id;
    await ctx.db.patch(optionId, {
      ...(nameChanged ? { name } : {}),
      ...(priceChanged ? { priceDeltaRsd: price } : {}),
      updatedAt: Date.now(),
    });
    await touchDraft(ctx, group.menuServiceId, access.user._id);
    return { ok: true as const, groupId: target.groupId, copied: target.copied, optionId };
  },
});

/** Deletes one add-on. `onlyForArticleId` as in updateAddonGroup. */
export const removeAddonOption = mutation({
  args: {
    optionId: v.id("menuAddonOptions"),
    onlyForArticleId: v.optional(v.id("menuArticles")),
  },
  handler: async (ctx, args) => {
    const { option, group, access } = await optionForEdit(ctx, args.optionId);
    const scope = await loadScope(ctx, group, args.onlyForArticleId);

    const target = await writeTargetFor(ctx, group, scope, access.user._id);
    await ctx.db.delete(target.optionIdMap?.get(option._id) ?? option._id);
    await touchDraft(ctx, group.menuServiceId, access.user._id);
    return { ok: true as const, groupId: target.groupId, copied: target.copied };
  },
});

/** Reorders the add-ons of a group. `onlyForArticleId` as in updateAddonGroup. */
export const moveAddonOption = mutation({
  args: {
    optionId: v.id("menuAddonOptions"),
    toIndex: v.number(),
    onlyForArticleId: v.optional(v.id("menuArticles")),
  },
  handler: async (ctx, args) => {
    const { option, group, access } = await optionForEdit(ctx, args.optionId);
    if (!validIndex(args.toIndex)) throw refuse(MENU_ERROR.invalidInput);
    const scope = await loadScope(ctx, group, args.onlyForArticleId);

    const options = await optionsOf(ctx, group._id);
    const from = options.findIndex((candidate) => candidate._id === option._id);
    if (from === -1) throw refuse(MENU_ERROR.notFound);
    if (movedOrNull(options, from, args.toIndex) === null) {
      return { ok: true as const, groupId: group._id, copied: false };
    }

    const target = await writeTargetFor(ctx, group, scope, access.user._id);
    // The copy keeps the original orders, so the same positions apply to its options.
    const targetOptions = target.copied ? await optionsOf(ctx, target.groupId) : options;
    const targetOptionId = target.optionIdMap?.get(option._id) ?? option._id;
    const targetFrom = targetOptions.findIndex((candidate) => candidate._id === targetOptionId);
    const moved = movedOrNull(targetOptions, targetFrom, args.toIndex);
    if (moved === null) throw refuse(MENU_ERROR.invalidInput);

    const now = Date.now();
    await writeNewOrders(moved, async (row, order) => {
      await ctx.db.patch(row._id, { order, updatedAt: now });
    });
    await touchDraft(ctx, group.menuServiceId, access.user._id);
    return { ok: true as const, groupId: target.groupId, copied: target.copied };
  },
});

// -----------------------------------------------------------------------------
// Read model
// -----------------------------------------------------------------------------

function rulesOf(
  group: Pick<Doc<"menuAddonGroups">, "selection" | "required" | "minSelect" | "maxSelect">,
): MenuAddonRules {
  return {
    selection: group.selection,
    required: group.required,
    ...(group.minSelect !== undefined ? { minSelect: group.minSelect } : {}),
    ...(group.maxSelect !== undefined ? { maxSelect: group.maxSelect } : {}),
  };
}

/**
 * Everything the editor shows for one article's variants and add-ons: the three
 * switches (false when absent), its variants and its add-on groups with their
 * options, resolved bounds and whether a guest could satisfy each group. The
 * rows are returned even while a switch is off. null when the article is
 * missing or the caller cannot read the service.
 */
export const articleOptions = query({
  args: { articleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) return null;
    const access = await getMenuAccess(
      ctx,
      { menuServiceId: article.menuServiceId },
      "menu.read",
    );
    if (!access) return null;

    const variantRows = (await variantsOf(ctx, article._id)).slice(0, MENU_MAX_VARIANTS_PER_ARTICLE);
    const linkRows = (await linksOf(ctx, article._id)).slice(0, MENU_MAX_ADDON_GROUPS_PER_ARTICLE);

    const addonGroups = [];
    for (const link of linkRows) {
      const group = await ctx.db.get(link.groupId);
      if (!group || group.menuServiceId !== article.menuServiceId) continue;
      const optionRows = (await optionsOf(ctx, group._id)).slice(
        0,
        MENU_MAX_ADDON_OPTIONS_PER_GROUP,
      );
      const rules = rulesOf(group);
      addonGroups.push({
        groupId: group._id,
        key: group.key,
        name: group.name,
        selection: group.selection,
        required: group.required,
        minSelect: group.minSelect ?? null,
        maxSelect: group.maxSelect ?? null,
        linkCount: group.linkCount,
        bounds: addonBounds(rules, optionRows.length),
        satisfiable: isAddonGroupSatisfiable(rules, optionRows.length),
        options: optionRows.map((option) => ({
          optionId: option._id,
          key: option.key,
          name: option.name,
          priceDeltaRsd: option.priceDeltaRsd,
          order: option.order,
        })),
      });
    }

    return {
      articleId: article._id,
      kind: article.kind,
      variantsEnabled: article.variantsEnabled ?? false,
      addonsEnabled: article.addonsEnabled ?? false,
      noteEnabled: article.noteEnabled ?? false,
      variants: variantRows.map((variant) => ({
        variantId: variant._id,
        key: variant.key,
        name: variant.name,
        priceRsd: variant.priceRsd ?? null,
        order: variant.order,
      })),
      addonGroups,
    };
  },
});

/**
 * "Koje artikle pogađa": the articles a shared group is linked to, shown before
 * the client changes it (at most MENU_MAX_ARTICLE_BATCH; `truncated` beyond).
 * null when the group is missing or the caller cannot read the service.
 */
export const addonGroupUsage = query({
  args: { groupId: v.id("menuAddonGroups") },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    const access = await getMenuAccess(ctx, { menuServiceId: group.menuServiceId }, "menu.read");
    if (!access) return null;

    const links = await ctx.db
      .query("menuArticleAddonGroups")
      .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
      .take(MENU_MAX_ARTICLE_BATCH + 1);
    const articles = [];
    for (const link of links.slice(0, MENU_MAX_ARTICLE_BATCH)) {
      const article = await ctx.db.get(link.articleId);
      if (!article || article.menuServiceId !== group.menuServiceId) continue;
      articles.push({ articleId: article._id, key: article.key, name: article.name });
    }
    return {
      groupId: group._id,
      linkCount: group.linkCount,
      articles,
      truncated: links.length > MENU_MAX_ARTICLE_BATCH,
    };
  },
});

/** The "use an existing group" picker: the add-on groups of a Menu service, by name. */
export const listAddonGroups = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;

    const groups = await ctx.db
      .query("menuAddonGroups")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", access.menuService._id))
      .take(MENU_MAX_ADDON_GROUPS);
    return groups
      .map((group) => ({ group, sortKey: foldSerbian(group.name) }))
      .sort(
        (a, b) =>
          (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0) ||
          a.group._creationTime - b.group._creationTime,
      )
      .map(({ group }) => ({
        groupId: group._id,
        key: group.key,
        name: group.name,
        selection: group.selection,
        required: group.required,
        linkCount: group.linkCount,
      }));
  },
});
