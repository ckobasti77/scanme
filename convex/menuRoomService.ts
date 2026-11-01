import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  getMenuAccess,
  loadOwned,
  requireMenuAccessToRow,
  type MenuAccess,
} from "./lib/menuAccess";
import { getMenuCapabilities, requireMenuCapability } from "./lib/menuCapabilities";
import { menuRoomServiceMarkupScopeValidator } from "./lib/menuDomainValidators";
import { loadDraftState, touchDraft } from "./lib/menuDraft";
import { checkCas, type CasValue } from "../lib/menu/cas";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import { ROOM_SERVICE_ERROR, type RoomServiceErrorCode } from "../lib/menu/errors/room-service";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ARTICLES,
  MENU_MAX_PAGES,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_ROOM_SERVICE_BATCH,
  MENU_MAX_ROOM_SERVICE_CATEGORIES,
  MENU_MAX_SECTIONS_PER_PAGE,
  MENU_MAX_VARIANTS_PER_ARTICLE,
  MENU_TEXT,
} from "../lib/menu/limits";
import {
  moveItem as moveInList,
  orderAfter,
  orderBetween,
  renumberedOrders,
} from "../lib/menu/order";
import {
  markupBpsToPercent,
  markupPercentToBps,
  nextPriceWarning,
  priceWarningView,
  resolvePriceWarning as resolveWarningFields,
  roomServiceUnitPrice,
  type RoomServicePriceWarning,
  type RoomServiceRule,
} from "../lib/menu/room-service-pricing";
import { isValidRsd } from "../lib/menu/rsd";
import { requiredText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — Room service (K03; master §5.3, §21.4).
//
// A separate Premium channel of one Menu service, never a page: it re-uses the
// shared articles (name, description, image, allergens stay the article's) and
// owns its selection, categories, order and price rules. Price order:
// base → % markup (all or selected) → manual RS price → one fee per order
// (lib/menu/room-service-pricing.ts). Only a manual price is stored; inherited
// and computed prices always follow the article's base price.
//
// Access: content needs "menu.edit" (lib/menu/permissions.ts: Room service
// content is offer content) and the account's Premium (roomService capability)
// — the on/off switch is menuServices.setFeature ("features.edit"). Reads need
// "menu.read" and work on Standard too (the panel shows the lock). Every id from
// an argument is proven to belong to the same Menu service (loadOwned).
// Content changes stay in the draft: touchDraft exactly once per successful
// change, never on a refusal, a CAS conflict or a no-op.
// =============================================================================

function refuse(code: MenuErrorCode | RoomServiceErrorCode) {
  return new ConvexError(code);
}

/** Above this many distinct articles one range read is cheaper than one get per article. */
const ARTICLE_GET_LIMIT = 300;

type DbCtx = QueryCtx | MutationCtx;

async function loadConfig(
  ctx: DbCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuRoomService"> | null> {
  return await ctx.db
    .query("menuRoomService")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
    .unique();
}

function ruleOf(config: Doc<"menuRoomService"> | null): RoomServiceRule {
  return { markupBps: config?.markupBps ?? 0, markupScope: config?.markupScope ?? "all" };
}

/**
 * K04 — one variant inside Room service: the same price order as the article
 * (variant price, falling back to the base price → markup → manual RS price
 * of THIS variant), its origin and its warning.
 */
function variantPriceView(
  rule: RoomServiceRule,
  item: Doc<"menuRoomServiceItems">,
  variant: Doc<"menuVariants">,
  basePriceRsd: number | null,
) {
  const manual = item.manualVariantPrices?.find((entry) => entry.variantKey === variant.key);
  const pricing = {
    basePriceRsd: variant.priceRsd ?? basePriceRsd,
    markupApplies: item.markupApplies,
    manualPriceRsd: manual?.priceRsd ?? null,
  };
  const price = roomServiceUnitPrice(rule, pricing);
  return {
    variantId: variant._id,
    key: variant.key,
    name: variant.name,
    variantPriceRsd: pricing.basePriceRsd,
    manualPriceRsd: pricing.manualPriceRsd,
    priceRsd: price.priceRsd,
    origin: price.origin,
    warning: manual?.priceWarning ? priceWarningView(rule, pricing, manual.priceWarning) : null,
  };
}

/** Service-addressed write: role and tenant, then the Premium gate. */
async function editService(ctx: MutationCtx, menuServiceId: Id<"menuServices">) {
  const access = await requireMenuAccessToRow(ctx, menuServiceId, "menu.edit");
  await requireMenuCapability(ctx, access.business._id, "roomService");
  return access;
}

/** Row-addressed write: the row's service decides access (no cross-tenant oracle). */
async function editRow<T extends { menuServiceId: Id<"menuServices"> }>(
  ctx: MutationCtx,
  row: T | null,
): Promise<{ row: T; access: MenuAccess }> {
  if (!row) throw refuse(MENU_ERROR.notFound);
  const access = await editService(ctx, row.menuServiceId);
  return { row, access };
}

async function categoriesOf(ctx: DbCtx, menuServiceId: Id<"menuServices">) {
  return await ctx.db
    .query("menuRoomServiceCategories")
    .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
    .take(MENU_MAX_ROOM_SERVICE_CATEGORIES + 1);
}

async function itemsOf(ctx: DbCtx, menuServiceId: Id<"menuServices">) {
  return await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
    .take(MENU_MAX_ARTICLES + 1);
}

async function lastItemOrder(
  ctx: MutationCtx,
  categoryId: Id<"menuRoomServiceCategories">,
): Promise<number | null> {
  const last = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_categoryId_and_order", (q) => q.eq("categoryId", categoryId))
    .order("desc")
    .first();
  return last ? last.order : null;
}

async function articleInRoomService(
  ctx: MutationCtx,
  articleId: Id<"menuArticles">,
): Promise<boolean> {
  const row = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_articleId", (q) => q.eq("articleId", articleId))
    .first();
  return row !== null;
}

type CategoryTranslations = NonNullable<Doc<"menuRoomServiceCategories">["translations"]>;

async function insertCategory(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  name: string,
  lastOrder: number | null,
  translations?: CategoryTranslations,
) {
  const now = Date.now();
  const key = newMenuKey("roomServiceCategory");
  const categoryId = await ctx.db.insert("menuRoomServiceCategories", {
    menuServiceId,
    key,
    name,
    order: orderAfter(lastOrder),
    createdAt: now,
    updatedAt: now,
    ...(translations ? { translations } : {}),
  });
  return { categoryId, key };
}

/**
 * K34: the translations a Room service category takes from the section it is made from
 * ("Preuzmi ceo meni"). A category has one translated field, `name`, and its name IS the
 * section's name, so the confirmed name of each language and its source hash (`nameHash`, the
 * hash of that very text) stay valid: the language keeps its done / stale state. Not carried:
 * the description fields (a category has none) and AI suggestions (a suggestion is no
 * translation until the owner confirms it).
 */
function categoryTranslationsOf(section: Doc<"menuSections">): CategoryTranslations | undefined {
  if (!section.translations) return undefined;
  const copied: CategoryTranslations = {};
  for (const [lang, entry] of Object.entries(section.translations)) {
    if (entry.status !== "confirmed" || !entry.name || entry.name.trim() === "") continue;
    copied[lang] = {
      status: "confirmed",
      name: entry.name,
      ...(entry.nameHash !== undefined ? { nameHash: entry.nameHash } : {}),
    };
  }
  return Object.keys(copied).length > 0 ? copied : undefined;
}

async function insertItem(
  ctx: MutationCtx,
  input: {
    menuServiceId: Id<"menuServices">;
    categoryId: Id<"menuRoomServiceCategories">;
    articleId: Id<"menuArticles">;
    order: number;
  },
) {
  const now = Date.now();
  // Markup applies to the "selected" articles only once someone selects them.
  return await ctx.db.insert("menuRoomServiceItems", {
    ...input,
    markupApplies: false,
    createdAt: now,
    updatedAt: now,
  });
}

// -----------------------------------------------------------------------------
// Read model
// -----------------------------------------------------------------------------

/**
 * The Room service of a Menu service: whether it is on and available (Premium),
 * its price rules, its categories with their articles and the price of each —
 * with its origin ("inherited" | "computed" | "manual") and the base-price
 * warning when there is one — plus how many articles of the service are not in
 * Room service yet. null for every refusal. Bounded (`truncated`).
 */
export const get = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const menuServiceId = access.menuService._id;
    const capabilities = await getMenuCapabilities(ctx, access.business._id);
    const config = await loadConfig(ctx, menuServiceId);
    const rule = ruleOf(config);

    const categoryRows = await categoriesOf(ctx, menuServiceId);
    const itemRows = await itemsOf(ctx, menuServiceId);
    const truncated =
      categoryRows.length > MENU_MAX_ROOM_SERVICE_CATEGORIES || itemRows.length > MENU_MAX_ARTICLES;
    const categories = categoryRows.slice(0, MENU_MAX_ROOM_SERVICE_CATEGORIES);
    const items = itemRows.slice(0, MENU_MAX_ARTICLES);

    const articles = new Map<Id<"menuArticles">, Doc<"menuArticles">>();
    const articleIds = new Set(items.map((item) => item.articleId));
    if (articleIds.size <= ARTICLE_GET_LIMIT) {
      for (const articleId of articleIds) {
        const article = await ctx.db.get(articleId);
        if (article && article.menuServiceId === menuServiceId) articles.set(article._id, article);
      }
    } else {
      const all = await ctx.db
        .query("menuArticles")
        .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
        .take(MENU_MAX_ARTICLES + 1);
      for (const article of all) articles.set(article._id, article);
    }

    const byCategory = new Map<Id<"menuRoomServiceCategories">, Doc<"menuRoomServiceItems">[]>();
    for (const item of items) {
      const list = byCategory.get(item.categoryId);
      if (list) list.push(item);
      else byCategory.set(item.categoryId, [item]);
    }

    // K04: variants of the articles whose variants are on (one bounded index
    // read per such article; Room service selections are small).
    const variantsByArticle = new Map<Id<"menuArticles">, Doc<"menuVariants">[]>();
    for (const article of articles.values()) {
      if (article.variantsEnabled !== true || !articleIds.has(article._id)) continue;
      variantsByArticle.set(
        article._id,
        await ctx.db
          .query("menuVariants")
          .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
          .take(MENU_MAX_VARIANTS_PER_ARTICLE),
      );
    }

    let itemsWithArticle = 0;
    const view = categories.map((category) => ({
      categoryId: category._id,
      key: category.key,
      name: category.name,
      order: category.order,
      items: (byCategory.get(category._id) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order || a._creationTime - b._creationTime)
        .flatMap((item) => {
          const article = articles.get(item.articleId);
          if (!article) return [];
          itemsWithArticle += 1;
          const pricing = {
            basePriceRsd: article.basePriceRsd ?? null,
            markupApplies: item.markupApplies,
            manualPriceRsd: item.manualPriceRsd ?? null,
          };
          const price = roomServiceUnitPrice(rule, pricing);
          return [
            {
              itemId: item._id,
              order: item.order,
              article: {
                articleId: article._id,
                key: article.key,
                kind: article.kind,
                name: article.name,
                description: article.description ?? null,
                mediaMode: article.mediaMode,
                iconKey: article.iconKey ?? null,
              },
              basePriceRsd: pricing.basePriceRsd,
              markupApplies: item.markupApplies,
              manualPriceRsd: pricing.manualPriceRsd,
              priceRsd: price.priceRsd,
              origin: price.origin,
              warning: item.priceWarning ? priceWarningView(rule, pricing, item.priceWarning) : null,
              variants: (variantsByArticle.get(article._id) ?? []).map((variant) =>
                variantPriceView(rule, item, variant, pricing.basePriceRsd),
              ),
            },
          ];
        }),
    }));

    const draft = await loadDraftState(ctx, menuServiceId);
    return {
      enabled: access.menuService.features.roomService,
      available: capabilities.roomService,
      settings: {
        markupPercent: rule.markupBps > 0 ? markupBpsToPercent(rule.markupBps) : null,
        markupScope: rule.markupScope,
        deliveryFeeRsd: config?.deliveryFeeRsd ?? null,
      },
      categories: view,
      notInRoomService: Math.max(0, draft.articleCount - itemsWithArticle),
      truncated,
    };
  },
});

// -----------------------------------------------------------------------------
// Price rules (markup and the per-order fee)
// -----------------------------------------------------------------------------

// In `expected`, null means "none"; in `patch`, null (or 0) removes the markup / fee.
const settingsFieldsValidator = v.object({
  markupPercent: v.optional(v.union(v.number(), v.null())),
  markupScope: v.optional(menuRoomServiceMarkupScopeValidator),
  deliveryFeeRsd: v.optional(v.union(v.number(), v.null())),
});
type SettingsFields = Infer<typeof settingsFieldsValidator>;
type SettingsKey = keyof SettingsFields;
const SETTINGS_KEYS: readonly SettingsKey[] = ["markupPercent", "markupScope", "deliveryFeeRsd"];

/**
 * Markup percent (up to two decimals, 0–300 %), its scope (all or selected
 * articles) and the fixed fee added once per order. Compare-and-set: every key
 * in `patch` must also be in `expected` (the value the editor last saw).
 */
export const updateSettings = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    expected: settingsFieldsValidator,
    patch: settingsFieldsValidator,
  },
  handler: async (ctx, args) => {
    const access = await editService(ctx, args.menuServiceId);
    const patchKeys = SETTINGS_KEYS.filter((key) => args.patch[key] !== undefined);
    if (patchKeys.length === 0 || patchKeys.some((key) => args.expected[key] === undefined)) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    let markupBps: number | undefined;
    if (args.patch.markupPercent !== undefined) {
      const bps =
        args.patch.markupPercent === null ? 0 : markupPercentToBps(args.patch.markupPercent);
      if (bps === null) throw refuse(MENU_ERROR.invalidInput);
      markupBps = bps;
    }
    const fee = args.patch.deliveryFeeRsd;
    if (fee !== undefined && fee !== null && !isValidRsd(fee)) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    const config = await loadConfig(ctx, access.menuService._id);
    const rule = ruleOf(config);
    const current = {
      markupPercent: rule.markupBps > 0 ? markupBpsToPercent(rule.markupBps) : null,
      markupScope: rule.markupScope,
      deliveryFeeRsd: config?.deliveryFeeRsd ?? null,
    };
    const expected: Partial<Record<SettingsKey, CasValue>> = {};
    for (const key of SETTINGS_KEYS) {
      if (args.expected[key] !== undefined) expected[key] = args.expected[key] ?? null;
    }
    const cas = checkCas<SettingsKey>(current, expected, args.patch);
    if (!cas.ok) return cas;

    const next = {
      markupBps: markupBps ?? rule.markupBps,
      markupScope: args.patch.markupScope ?? rule.markupScope,
      deliveryFeeRsd: fee === undefined ? current.deliveryFeeRsd : fee === 0 ? null : fee,
    };
    if (
      next.markupBps === rule.markupBps &&
      next.markupScope === rule.markupScope &&
      next.deliveryFeeRsd === current.deliveryFeeRsd
    ) {
      return { ok: true as const };
    }

    const now = Date.now();
    const fields = {
      markupBps: next.markupBps > 0 ? next.markupBps : undefined,
      markupScope: next.markupScope,
      deliveryFeeRsd: next.deliveryFeeRsd ?? undefined,
      updatedAt: now,
      updatedByUserId: access.user._id,
    };
    if (config) {
      await ctx.db.patch(config._id, fields);
    } else {
      await ctx.db.insert("menuRoomService", {
        menuServiceId: access.menuService._id,
        ...fields,
        createdAt: now,
      });
    }
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Categories (Room service's own, with their own order)
// -----------------------------------------------------------------------------

export const addCategory = mutation({
  args: { menuServiceId: v.id("menuServices"), name: v.string() },
  handler: async (ctx, args) => {
    const access = await editService(ctx, args.menuServiceId);
    const name = requiredText(args.name, MENU_TEXT.roomServiceCategoryName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);
    const categories = await categoriesOf(ctx, access.menuService._id);
    if (categories.length >= MENU_MAX_ROOM_SERVICE_CATEGORIES) {
      throw refuse(MENU_ERROR.limitReached);
    }
    const created = await insertCategory(
      ctx,
      access.menuService._id,
      name,
      categories.length > 0 ? categories[categories.length - 1].order : null,
    );
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return created;
  },
});

export const renameCategory = mutation({
  args: {
    categoryId: v.id("menuRoomServiceCategories"),
    name: v.string(),
    expectedName: v.string(),
  },
  handler: async (ctx, args) => {
    const { row: category, access } = await editRow(ctx, await ctx.db.get(args.categoryId));
    const name = requiredText(args.name, MENU_TEXT.roomServiceCategoryName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);
    const cas = checkCas<"name">({ name: category.name }, { name: args.expectedName }, { name });
    if (!cas.ok) return cas;
    if (name === category.name) return { ok: true as const };

    await ctx.db.patch(category._id, { name, updatedAt: Date.now() });
    await touchDraft(ctx, category.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

export const moveCategory = mutation({
  args: { categoryId: v.id("menuRoomServiceCategories"), toIndex: v.number() },
  handler: async (ctx, args) => {
    const { row: category, access } = await editRow(ctx, await ctx.db.get(args.categoryId));
    if (!Number.isInteger(args.toIndex) || args.toIndex < 0) throw refuse(MENU_ERROR.invalidInput);

    const categories = await categoriesOf(ctx, category.menuServiceId);
    const from = categories.findIndex((candidate) => candidate._id === category._id);
    if (from === -1) throw refuse(MENU_ERROR.notFound);
    const moved = moveInList(categories, from, args.toIndex);
    if (moved.every((candidate, index) => candidate._id === categories[index]._id)) {
      return { ok: true as const };
    }
    const orders = renumberedOrders(moved.length);
    const now = Date.now();
    for (let index = 0; index < moved.length; index += 1) {
      if (moved[index].order !== orders[index]) {
        await ctx.db.patch(moved[index]._id, { order: orders[index], updatedAt: now });
      }
    }
    await touchDraft(ctx, category.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** Only an empty category can be removed — articles never leave Room service silently. */
export const removeCategory = mutation({
  args: { categoryId: v.id("menuRoomServiceCategories") },
  handler: async (ctx, args) => {
    const { row: category, access } = await editRow(ctx, await ctx.db.get(args.categoryId));
    const anyItem = await ctx.db
      .query("menuRoomServiceItems")
      .withIndex("by_categoryId_and_order", (q) => q.eq("categoryId", category._id))
      .first();
    if (anyItem) throw refuse(ROOM_SERVICE_ERROR.categoryNotEmpty);
    await ctx.db.delete(category._id);
    await touchDraft(ctx, category.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Selection: chosen articles, or the whole "Kompletan meni" copied once
// -----------------------------------------------------------------------------

/**
 * Adds chosen articles to a category, in the given order. An article is in Room
 * service at most once: articles already there are skipped and counted.
 */
export const addItems = mutation({
  args: {
    categoryId: v.id("menuRoomServiceCategories"),
    articleIds: v.array(v.id("menuArticles")),
  },
  handler: async (ctx, args) => {
    const { row: category, access } = await editRow(ctx, await ctx.db.get(args.categoryId));
    const ids = [...new Set(args.articleIds)];
    if (ids.length === 0 || ids.length > MENU_MAX_ROOM_SERVICE_BATCH) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const articles = [];
    for (const id of ids) articles.push(await loadOwned(ctx, id, category.menuServiceId));

    let order = await lastItemOrder(ctx, category._id);
    let added = 0;
    let alreadyIn = 0;
    for (const article of articles) {
      if (await articleInRoomService(ctx, article._id)) {
        alreadyIn += 1;
        continue;
      }
      order = orderAfter(order);
      await insertItem(ctx, {
        menuServiceId: category.menuServiceId,
        categoryId: category._id,
        articleId: article._id,
        order,
      });
      added += 1;
    }
    if (added > 0) await touchDraft(ctx, category.menuServiceId, access.user._id);
    return { added, alreadyIn };
  },
});

/**
 * "Preuzmi ceo meni" (K01 OTV 6): a ONE-TIME copy of the visible content of
 * "Kompletan meni" — each visible section becomes a Room service category
 * (an existing category with the same name is re-used, also one created
 * earlier in the same import), each visible article an item. A new category
 * takes the confirmed name translations of its section (K34). Articles already
 * in Room service are skipped. Later changes to the main menu are not
 * mirrored; `get.notInRoomService` tells the editor what is missing.
 */
export const importWholeMenu = mutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await editService(ctx, args.menuServiceId);
    const menuServiceId = access.menuService._id;

    const pages = await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .take(MENU_MAX_PAGES + 1);
    const page = pages.find((candidate) => candidate.isDefault && candidate.archivedAt === undefined);
    if (!page) throw refuse(MENU_ERROR.notFound);

    const sections = (
      await ctx.db
        .query("menuSections")
        .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
        .take(MENU_MAX_SECTIONS_PER_PAGE)
    ).filter((section) => section.visibility === "visible");
    const placements = await ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_PLACEMENTS_PER_PAGE);
    const bySection = new Map<Id<"menuSections">, Doc<"menuPlacements">[]>();
    for (const placement of placements) {
      if (placement.visibility !== "visible") continue;
      const list = bySection.get(placement.sectionId);
      if (list) list.push(placement);
      else bySection.set(placement.sectionId, [placement]);
    }

    const inRoomService = new Set((await itemsOf(ctx, menuServiceId)).map((item) => item.articleId));
    const categories = await categoriesOf(ctx, menuServiceId);
    const categoryByName = new Map(categories.map((category) => [category.name, category._id]));
    let categoryCount = categories.length;
    let lastCategoryOrder = categories.length > 0 ? categories[categories.length - 1].order : null;

    let categoriesCreated = 0;
    let itemsAdded = 0;
    let alreadyIn = 0;
    for (const section of sections) {
      const sectionPlacements = (bySection.get(section._id) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
      const fresh: Id<"menuArticles">[] = [];
      for (const placement of sectionPlacements) {
        if (inRoomService.has(placement.articleId)) {
          alreadyIn += 1;
          continue;
        }
        inRoomService.add(placement.articleId);
        fresh.push(placement.articleId);
      }
      if (fresh.length === 0) continue;

      let categoryId = categoryByName.get(section.name);
      let order: number | null = null;
      if (categoryId) {
        order = await lastItemOrder(ctx, categoryId);
      } else {
        if (categoryCount >= MENU_MAX_ROOM_SERVICE_CATEGORIES) throw refuse(MENU_ERROR.limitReached);
        // K34: the category takes the section's confirmed name translations, and a later section
        // of the same name in this import re-uses it (as it does an existing category).
        const created = await insertCategory(
          ctx,
          menuServiceId,
          section.name,
          lastCategoryOrder,
          categoryTranslationsOf(section),
        );
        categoryId = created.categoryId;
        categoryByName.set(section.name, categoryId);
        lastCategoryOrder = orderAfter(lastCategoryOrder);
        categoryCount += 1;
        categoriesCreated += 1;
      }
      for (const articleId of fresh) {
        order = orderAfter(order);
        await insertItem(ctx, { menuServiceId, categoryId, articleId, order });
        itemsAdded += 1;
      }
    }

    if (categoriesCreated + itemsAdded > 0) {
      await touchDraft(ctx, menuServiceId, access.user._id);
    }
    return { categoriesCreated, itemsAdded, alreadyIn };
  },
});

/** The item of a category that sorts directly before `beforeOrder` (null = last), skipping `movingId`. */
async function neighbourBefore(
  ctx: MutationCtx,
  categoryId: Id<"menuRoomServiceCategories">,
  movingId: Id<"menuRoomServiceItems">,
  beforeOrder: number | null,
): Promise<Doc<"menuRoomServiceItems"> | null> {
  const rows = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_categoryId_and_order", (q) =>
      beforeOrder === null
        ? q.eq("categoryId", categoryId)
        : q.eq("categoryId", categoryId).lt("order", beforeOrder),
    )
    .order("desc")
    .take(2);
  return rows.find((row) => row._id !== movingId) ?? null;
}

/**
 * Moves an item into `toCategoryId`, directly before `beforeItemId` (or to the
 * end). One row is written; only an exhausted order gap renumbers the category.
 */
export const moveItem = mutation({
  args: {
    itemId: v.id("menuRoomServiceItems"),
    toCategoryId: v.id("menuRoomServiceCategories"),
    beforeItemId: v.optional(v.id("menuRoomServiceItems")),
  },
  handler: async (ctx, args) => {
    const { row: item, access } = await editRow(ctx, await ctx.db.get(args.itemId));
    const toCategory = await loadOwned(ctx, args.toCategoryId, item.menuServiceId);
    const before = args.beforeItemId
      ? await loadOwned(ctx, args.beforeItemId, item.menuServiceId)
      : null;
    if (before && before.categoryId !== toCategory._id) throw refuse(MENU_ERROR.invalidInput);
    if (before && before._id === item._id) return { ok: true as const };

    const categoryChanged = item.categoryId !== toCategory._id;
    const prev = await neighbourBefore(ctx, toCategory._id, item._id, before?.order ?? null);
    const alreadyThere =
      !categoryChanged &&
      (prev === null || item.order > prev.order) &&
      (before === null || item.order < before.order);
    if (alreadyThere) return { ok: true as const };

    const now = Date.now();
    let order = orderBetween(prev?.order ?? null, before?.order ?? null);
    if (order === null) {
      const siblings = (
        await ctx.db
          .query("menuRoomServiceItems")
          .withIndex("by_categoryId_and_order", (q) => q.eq("categoryId", toCategory._id))
          .take(MENU_MAX_ARTICLES + 1)
      ).filter((row) => row._id !== item._id);
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

    await ctx.db.patch(item._id, { categoryId: toCategory._id, order, updatedAt: now });
    await touchDraft(ctx, item.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** Takes the article out of Room service; the article itself stays in the menu. */
export const removeItem = mutation({
  args: { itemId: v.id("menuRoomServiceItems") },
  handler: async (ctx, args) => {
    const { row: item, access } = await editRow(ctx, await ctx.db.get(args.itemId));
    await ctx.db.delete(item._id);
    await touchDraft(ctx, item.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Prices of single items
// -----------------------------------------------------------------------------

/** Which items are "selected" for the markup (read when the scope is "selected"). */
export const setItemsMarkup = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    itemIds: v.array(v.id("menuRoomServiceItems")),
    markupApplies: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await editService(ctx, args.menuServiceId);
    const ids = [...new Set(args.itemIds)];
    if (ids.length === 0 || ids.length > MENU_MAX_ROOM_SERVICE_BATCH) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const items = [];
    for (const id of ids) items.push(await loadOwned(ctx, id, access.menuService._id));
    const now = Date.now();
    let changed = 0;
    for (const item of items) {
      if (item.markupApplies === args.markupApplies) continue;
      await ctx.db.patch(item._id, { markupApplies: args.markupApplies, updatedAt: now });
      changed += 1;
    }
    if (changed > 0) await touchDraft(ctx, access.menuService._id, access.user._id);
    return { changed };
  },
});

/**
 * The manual Room service price of one article, kept exactly as entered; null
 * goes back to the rule (inherited or computed). Compare-and-set on the manual
 * price the editor last saw. Setting a price resolves a pending warning.
 */
export const setManualPrice = mutation({
  args: {
    itemId: v.id("menuRoomServiceItems"),
    expectedManualPriceRsd: v.union(v.number(), v.null()),
    manualPriceRsd: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const { row: item, access } = await editRow(ctx, await ctx.db.get(args.itemId));
    if (args.manualPriceRsd !== null && !isValidRsd(args.manualPriceRsd)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const cas = checkCas<"manualPriceRsd">(
      { manualPriceRsd: item.manualPriceRsd },
      { manualPriceRsd: args.expectedManualPriceRsd },
      { manualPriceRsd: args.manualPriceRsd },
    );
    if (!cas.ok) return cas;
    if (args.manualPriceRsd === (item.manualPriceRsd ?? null) && !item.priceWarning) {
      return { ok: true as const };
    }

    await ctx.db.patch(item._id, {
      manualPriceRsd: args.manualPriceRsd ?? undefined,
      priceWarning: undefined,
      updatedAt: Date.now(),
    });
    await touchDraft(ctx, item.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/**
 * The two answers to the warning raised when the base price of an article with
 * a manual Room service price changed (master §5.3): "Zadrži ručnu cenu"
 * (keepManual) or "Ponovo izračunaj prema markup-u" (recomputeFromMarkup).
 */
export const resolvePriceWarning = mutation({
  args: {
    itemId: v.id("menuRoomServiceItems"),
    action: v.union(v.literal("keepManual"), v.literal("recomputeFromMarkup")),
  },
  handler: async (ctx, args) => {
    const { row: item, access } = await editRow(ctx, await ctx.db.get(args.itemId));
    if (!item.priceWarning) return { ok: true as const };
    const fields = resolveWarningFields(args.action, item.manualPriceRsd ?? null);
    await ctx.db.patch(item._id, {
      manualPriceRsd: fields.manualPriceRsd ?? undefined,
      priceWarning: undefined,
      updatedAt: Date.now(),
    });
    await touchDraft(ctx, item.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// K04 — manual Room service price per variant (K03 deferred it to K04)
// -----------------------------------------------------------------------------

type VariantPriceEntry = NonNullable<Doc<"menuRoomServiceItems">["manualVariantPrices"]>[number];

function withVariantEntry(
  entries: readonly VariantPriceEntry[],
  variantKey: string,
  entry: VariantPriceEntry | null,
): VariantPriceEntry[] | undefined {
  const next = entries.filter((candidate) => candidate.variantKey !== variantKey);
  if (entry) next.push(entry);
  return next.length > 0 ? next : undefined;
}

/**
 * The manual Room service price of ONE variant of the item's article, kept
 * exactly as entered; null goes back to the rule. Compare-and-set on the
 * manual price the editor last saw. Setting a price resolves a pending warning
 * of that variant. A variant price change raises the same old/new warning as
 * the base price (convex/lib/menuArticleHooks.ts onVariantPriceChanged).
 */
export const setManualVariantPrice = mutation({
  args: {
    itemId: v.id("menuRoomServiceItems"),
    variantId: v.id("menuVariants"),
    expectedManualPriceRsd: v.union(v.number(), v.null()),
    manualPriceRsd: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const { row: item, access } = await editRow(ctx, await ctx.db.get(args.itemId));
    const variant = await loadOwned(ctx, args.variantId, item.menuServiceId);
    if (variant.articleId !== item.articleId) throw refuse(MENU_ERROR.invalidInput);
    if (args.manualPriceRsd !== null && !isValidRsd(args.manualPriceRsd)) {
      throw refuse(MENU_ERROR.invalidInput);
    }

    const entries = item.manualVariantPrices ?? [];
    const current = entries.find((entry) => entry.variantKey === variant.key) ?? null;
    const cas = checkCas<"manualPriceRsd">(
      { manualPriceRsd: current?.priceRsd },
      { manualPriceRsd: args.expectedManualPriceRsd },
      { manualPriceRsd: args.manualPriceRsd },
    );
    if (!cas.ok) return cas;
    if (args.manualPriceRsd === (current?.priceRsd ?? null) && !current?.priceWarning) {
      return { ok: true as const };
    }
    const next = withVariantEntry(
      entries,
      variant.key,
      args.manualPriceRsd === null ? null : { variantKey: variant.key, priceRsd: args.manualPriceRsd },
    );
    if ((next?.length ?? 0) > MENU_MAX_VARIANTS_PER_ARTICLE) throw refuse(MENU_ERROR.limitReached);

    await ctx.db.patch(item._id, { manualVariantPrices: next, updatedAt: Date.now() });
    await touchDraft(ctx, item.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/** "Zadrži ručnu cenu" / "Ponovo izračunaj prema markup-u" for one variant. */
export const resolveVariantPriceWarning = mutation({
  args: {
    itemId: v.id("menuRoomServiceItems"),
    variantKey: v.string(),
    action: v.union(v.literal("keepManual"), v.literal("recomputeFromMarkup")),
  },
  handler: async (ctx, args) => {
    const { row: item, access } = await editRow(ctx, await ctx.db.get(args.itemId));
    const entries = item.manualVariantPrices ?? [];
    const current = entries.find((entry) => entry.variantKey === args.variantKey);
    if (!current?.priceWarning) return { ok: true as const };
    const fields = resolveWarningFields(args.action, current.priceRsd);
    const next = withVariantEntry(
      entries,
      args.variantKey,
      fields.manualPriceRsd === null
        ? null
        : { variantKey: args.variantKey, priceRsd: fields.manualPriceRsd },
    );
    await ctx.db.patch(item._id, { manualVariantPrices: next, updatedAt: Date.now() });
    await touchDraft(ctx, item.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Hook for menuCatalog.setBasePrice
// -----------------------------------------------------------------------------

function sameWarning(a: RoomServicePriceWarning | null, b: RoomServicePriceWarning | null) {
  if (a === null || b === null) return a === b;
  return a.oldBaseRsd === b.oldBaseRsd && a.newBaseRsd === b.newBaseRsd && a.at === b.at;
}

/**
 * Called in the same transaction as a base price change. An item WITHOUT a
 * manual price needs nothing (its price is derived); an item WITH one keeps it
 * and gets / updates / loses the warning (lib/menu/room-service-pricing.ts
 * nextPriceWarning). Bounded: an article is in Room service at most once.
 * K16: returns the warning that now stands (old base, new base, the manual RS
 * price and what recomputing would give), so the editor can ask at once.
 */
export async function flagRoomServicePriceWarnings(
  ctx: MutationCtx,
  articleId: Id<"menuArticles">,
  previousBaseRsd: number | null,
  nextBaseRsd: number | null,
): Promise<RoomServiceWarningAnswer | null> {
  let answer: RoomServiceWarningAnswer | null = null;
  const items = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_articleId", (q) => q.eq("articleId", articleId))
    .take(5);
  const at = Date.now();
  for (const item of items) {
    const existing = item.priceWarning ?? null;
    const warning = nextPriceWarning({
      existing,
      manualPriceRsd: item.manualPriceRsd ?? null,
      previousBaseRsd,
      nextBaseRsd,
      at,
    });
    const variantPrices = await variantWarningsAfterBaseChange(
      ctx,
      item,
      previousBaseRsd,
      nextBaseRsd,
      at,
    );
    if (warning && item.manualPriceRsd !== undefined) {
      const rule = ruleOf(await loadConfig(ctx, item.menuServiceId));
      const view = priceWarningView(
        rule,
        { basePriceRsd: nextBaseRsd, markupApplies: item.markupApplies, manualPriceRsd: item.manualPriceRsd },
        warning,
      );
      answer = { itemId: item._id, ...view };
    }
    if (sameWarning(warning, existing) && variantPrices === null) continue;
    await ctx.db.patch(item._id, {
      priceWarning: warning ?? undefined,
      ...(variantPrices !== null ? { manualVariantPrices: variantPrices } : {}),
      updatedAt: at,
    });
  }
  return answer;
}

export type RoomServiceWarningAnswer = {
  itemId: Id<"menuRoomServiceItems">;
  oldBaseRsd: number | null;
  newBaseRsd: number | null;
  roomServicePriceRsd: number | null;
  recomputedPriceRsd: number | null;
};

/**
 * K04 — a variant WITHOUT its own price uses the base price, so a manual RS
 * price of such a variant warns on a base price change too. null = nothing
 * changed (the common case: no manual variant prices at all).
 */
async function variantWarningsAfterBaseChange(
  ctx: MutationCtx,
  item: Doc<"menuRoomServiceItems">,
  previousBaseRsd: number | null,
  nextBaseRsd: number | null,
  at: number,
): Promise<VariantPriceEntry[] | undefined | null> {
  const entries = item.manualVariantPrices ?? [];
  if (entries.length === 0) return null;
  const variants = await ctx.db
    .query("menuVariants")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", item.articleId))
    .take(MENU_MAX_VARIANTS_PER_ARTICLE);
  const followsBase = new Set(
    variants.filter((variant) => variant.priceRsd === undefined).map((variant) => variant.key),
  );
  let changed = false;
  const next = entries.map((entry) => {
    if (!followsBase.has(entry.variantKey)) return entry;
    const existing = entry.priceWarning ?? null;
    const warning = nextPriceWarning({
      existing,
      manualPriceRsd: entry.priceRsd,
      previousBaseRsd,
      nextBaseRsd,
      at,
    });
    if (sameWarning(warning, existing)) return entry;
    changed = true;
    return {
      variantKey: entry.variantKey,
      priceRsd: entry.priceRsd,
      ...(warning ? { priceWarning: warning } : {}),
    };
  });
  return changed ? next : null;
}
