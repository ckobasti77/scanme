import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getMenuAccess, loadOwned, requireMenuAccessToRow } from "./lib/menuAccess";
import { loadDraftState, touchDraft } from "./lib/menuDraft";
import { appendPlacement, assertPageActive } from "./menuCatalog";
import { checkComboComponents, comboComponentsTotal } from "../lib/menu/combo";
import { ARTICLE_ERROR, type ArticleErrorCode } from "../lib/menu/errors/article";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ARTICLES,
  MENU_MAX_COMBOS_PER_COMPONENT,
  MENU_MAX_COMBO_COMPONENTS,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_TEXT,
} from "../lib/menu/limits";
import { renumberedOrders } from "../lib/menu/order";
import { isValidRsd } from "../lib/menu/rsd";
import { normalizeArticleName, requiredText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — combos (K04; master §5.4).
//
// A combo is its own article (kind "combo") assembled from existing ordinary
// articles of the same Menu service. Its price is MANUAL (the combo's
// basePriceRsd, written by menuCatalog.setBasePrice like every other price)
// and is never recomputed. When the price of a component changes or a
// component is deleted, menuCatalog.setBasePrice / the deletion path only set
// the "check the combo price" flag (`priceCheck`, convex/lib/menuArticleHooks.ts);
// the published price changes only when the client decides: keeps the price
// (resolvePriceCheck) or sets a new one (setBasePrice, which clears the flag).
//
// Every write loads the row first (missing = not_found), authorizes against
// THAT row's Menu service (requireMenuAccessToRow, "menu.edit") and proves every
// other id belongs to the same service (loadOwned). touchDraft runs exactly
// once per successful change, never on a refusal or a no-op. Reads need
// "menu.read" and return null for every refusal.
// =============================================================================

function refuse(code: MenuErrorCode | ArticleErrorCode): ConvexError<string> {
  return new ConvexError(code);
}

const componentsValidator = v.array(
  v.object({ articleId: v.id("menuArticles"), quantity: v.number() }),
);

type ComponentInput = { articleId: Id<"menuArticles">; quantity: number };

/**
 * The checked component list: well-formed (lib/menu/combo.ts), every article
 * of THIS service (a foreign id is not_found) and an ordinary article (a combo
 * inside a combo is refused).
 */
async function checkedComponents(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  components: readonly ComponentInput[],
  comboArticleId?: Id<"menuArticles">,
): Promise<ComponentInput[]> {
  const checked = checkComboComponents<Id<"menuArticles">>(components, comboArticleId);
  if (checked === null) throw refuse(ARTICLE_ERROR.comboComponentInvalid);
  for (const component of checked) {
    const article = await loadOwned(ctx, component.articleId, menuServiceId);
    if (article.kind !== "item") throw refuse(ARTICLE_ERROR.comboComponentInvalid);
  }
  return checked;
}

async function insertComponents(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  comboArticleId: Id<"menuArticles">,
  components: readonly ComponentInput[],
): Promise<void> {
  const orders = renumberedOrders(components.length);
  const now = Date.now();
  for (let index = 0; index < components.length; index += 1) {
    await ctx.db.insert("menuComboComponents", {
      menuServiceId,
      comboArticleId,
      componentArticleId: components[index].articleId,
      quantity: components[index].quantity,
      order: orders[index],
      createdAt: now,
    });
  }
}

async function comboForEdit(ctx: MutationCtx, comboArticleId: Id<"menuArticles">) {
  const combo = await ctx.db.get(comboArticleId);
  if (!combo) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, combo.menuServiceId, "menu.edit");
  if (combo.kind !== "combo") throw refuse(ARTICLE_ERROR.notCombo);
  return { combo, access };
}

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

/**
 * Creates a combo article with its components and shows it in a section, like
 * menuCatalog.quickAddArticle does for an ordinary article (a combo is never
 * checked for a duplicate name). The price is optional and manual.
 */
export const createCombo = mutation({
  args: {
    sectionId: v.id("menuSections"),
    name: v.string(),
    priceRsd: v.optional(v.number()),
    components: componentsValidator,
  },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section) throw refuse(MENU_ERROR.notFound);
    const access = await requireMenuAccessToRow(ctx, section.menuServiceId, "menu.edit");
    const page = await loadOwned(ctx, section.pageId, section.menuServiceId);
    assertPageActive(page);
    const name = requiredText(args.name, MENU_TEXT.articleName);
    if (name === null) throw refuse(MENU_ERROR.invalidInput);
    if (args.priceRsd !== undefined && !isValidRsd(args.priceRsd)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    const components = await checkedComponents(ctx, section.menuServiceId, args.components);

    const draft = await loadDraftState(ctx, section.menuServiceId);
    if (draft.articleCount >= MENU_MAX_ARTICLES) throw refuse(MENU_ERROR.limitReached);
    if (page.placementCount >= MENU_MAX_PLACEMENTS_PER_PAGE) {
      throw refuse(MENU_ERROR.limitReached);
    }

    const now = Date.now();
    const key = newMenuKey("article");
    const articleId = await ctx.db.insert("menuArticles", {
      menuServiceId: section.menuServiceId,
      key,
      kind: "combo",
      name,
      nameNormalized: normalizeArticleName(name),
      ...(args.priceRsd !== undefined ? { basePriceRsd: args.priceRsd } : {}),
      mediaMode: "none",
      createdAt: now,
      updatedAt: now,
      updatedByUserId: access.user._id,
    });
    await insertComponents(ctx, section.menuServiceId, articleId, components);
    const placementId = await appendPlacement(ctx, {
      page,
      sectionId: section._id,
      articleId,
    });
    await touchDraft(ctx, section.menuServiceId, access.user._id, { articleDelta: 1 });
    return { articleId, placementId, key };
  },
});

function sameComponents(
  rows: readonly Doc<"menuComboComponents">[],
  next: readonly ComponentInput[],
): boolean {
  return (
    rows.length === next.length &&
    rows.every(
      (row, index) =>
        row.componentArticleId === next[index].articleId && row.quantity === next[index].quantity,
    )
  );
}

/**
 * Replaces the whole component list of a combo (the full new list, in order).
 * The combo price and its "check the combo price" flag are not touched: those
 * are the client's decision. An identical list is a no-op.
 */
export const setComboComponents = mutation({
  args: { comboArticleId: v.id("menuArticles"), components: componentsValidator },
  handler: async (ctx, args) => {
    const { combo, access } = await comboForEdit(ctx, args.comboArticleId);
    const components = await checkedComponents(
      ctx,
      combo.menuServiceId,
      args.components,
      combo._id,
    );

    const rows = await ctx.db
      .query("menuComboComponents")
      .withIndex("by_comboArticleId_and_order", (q) => q.eq("comboArticleId", combo._id))
      .take(MENU_MAX_COMBO_COMPONENTS + 1);
    if (sameComponents(rows, components)) return { ok: true as const };

    for (const row of rows) await ctx.db.delete(row._id);
    await insertComponents(ctx, combo.menuServiceId, combo._id, components);
    await ctx.db.patch(combo._id, { updatedAt: Date.now(), updatedByUserId: access.user._id });
    await touchDraft(ctx, combo.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/**
 * "Zadrži cenu": the client looked at the "check the combo price" warning and
 * keeps the current price. Clears the flag; no-op when there is none. A NEW
 * price goes through menuCatalog.setBasePrice, which clears the flag itself.
 */
export const resolvePriceCheck = mutation({
  args: { comboArticleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const { combo, access } = await comboForEdit(ctx, args.comboArticleId);
    if (!combo.priceCheck) return { ok: true as const };

    await ctx.db.patch(combo._id, {
      priceCheck: undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, combo.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Read model
// -----------------------------------------------------------------------------

/**
 * A combo for the editor: its manual price, the "check the combo price" flag
 * (changed components resolved to their current names), the components with
 * their regular prices and what they would cost one by one. null when the
 * article is not a combo or the caller cannot read the service.
 */
export const comboDetail = query({
  args: { comboArticleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboArticleId);
    if (!combo || combo.kind !== "combo") return null;
    const access = await getMenuAccess(ctx, { menuServiceId: combo.menuServiceId }, "menu.read");
    if (!access) return null;

    const rows = await ctx.db
      .query("menuComboComponents")
      .withIndex("by_comboArticleId_and_order", (q) => q.eq("comboArticleId", combo._id))
      .take(MENU_MAX_COMBO_COMPONENTS);
    const components = [];
    for (const row of rows) {
      const article = await ctx.db.get(row.componentArticleId);
      if (!article || article.menuServiceId !== combo.menuServiceId) continue;
      components.push({
        componentId: row._id,
        articleId: article._id,
        key: article.key,
        name: article.name,
        quantity: row.quantity,
        unitPriceRsd: article.basePriceRsd ?? null,
        order: row.order,
      });
    }

    let priceCheck: {
      since: number;
      changedComponents: { key: string; name: string }[];
      removedComponentNames: string[];
    } | null = null;
    if (combo.priceCheck) {
      const changedComponents: { key: string; name: string }[] = [];
      for (const key of combo.priceCheck.changedComponentKeys.slice(0, MENU_MAX_COMBO_COMPONENTS)) {
        const article = await ctx.db
          .query("menuArticles")
          .withIndex("by_menuServiceId_and_key", (q) =>
            q.eq("menuServiceId", combo.menuServiceId).eq("key", key),
          )
          .first();
        if (article) changedComponents.push({ key: article.key, name: article.name });
      }
      priceCheck = {
        since: combo.priceCheck.since,
        changedComponents,
        removedComponentNames: combo.priceCheck.removedComponentNames,
      };
    }

    return {
      articleId: combo._id,
      key: combo.key,
      name: combo.name,
      priceRsd: combo.basePriceRsd ?? null,
      priceCheck,
      components,
      componentsTotal: comboComponentsTotal(components),
    };
  },
});

/**
 * The combos that contain an article (for "this article is part of 3 combos"
 * and the impact of changing or deleting it). Bounded by
 * MENU_MAX_COMBOS_PER_COMPONENT. null when the article is missing or the caller
 * cannot read its service.
 */
export const combosContainingArticle = query({
  args: { articleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) return null;
    const access = await getMenuAccess(ctx, { menuServiceId: article.menuServiceId }, "menu.read");
    if (!access) return null;

    const rows = await ctx.db
      .query("menuComboComponents")
      .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", article._id))
      .take(MENU_MAX_COMBOS_PER_COMPONENT);
    const combos = [];
    for (const row of rows) {
      if (row.menuServiceId !== article.menuServiceId) continue;
      const combo = await ctx.db.get(row.comboArticleId);
      if (!combo || combo.menuServiceId !== article.menuServiceId || combo.kind !== "combo") {
        continue;
      }
      combos.push({
        articleId: combo._id,
        key: combo.key,
        name: combo.name,
        quantity: row.quantity,
      });
    }
    return combos;
  },
});
