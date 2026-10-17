import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { nextComboPriceCheck, sameComboPriceCheck } from "../../lib/menu/combo";
import { MENU_MAX_COMBOS_PER_COMPONENT } from "../../lib/menu/limits";
import { nextPriceWarning } from "../../lib/menu/room-service-pricing";

// =============================================================================
// ScanMe Menu V1 (K04) — cross-module consequences of article changes. Every
// helper runs in the SAME transaction as the change that causes it (no job, no
// second mutation), touches only rows of the same Menu service and is bounded.
// None of them calls touchDraft: the calling mutation does, exactly once.
//
//   price of an ordinary article (base or variant) changed
//     → every combo that contains it gets "check the combo price" (master §5.4)
//       and keeps its manual price;
//   variant price changed → a manual Room service price of that variant gets
//     the same old/new warning as the article's manual RS price (master §5.3);
//   article deleted → combos lose the component and get the flag; RS rows of
//     the article are removed by the caller.
// =============================================================================

async function combosContaining(ctx: MutationCtx, componentArticleId: Id<"menuArticles">) {
  return await ctx.db
    .query("menuComboComponents")
    .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", componentArticleId))
    .take(MENU_MAX_COMBOS_PER_COMPONENT);
}

async function flagCombo(
  ctx: MutationCtx,
  comboArticleId: Id<"menuArticles">,
  menuServiceId: Id<"menuServices">,
  change: Parameters<typeof nextComboPriceCheck>[1],
): Promise<boolean> {
  const combo = await ctx.db.get(comboArticleId);
  if (!combo || combo.menuServiceId !== menuServiceId || combo.kind !== "combo") return false;
  const priceCheck = nextComboPriceCheck(combo.priceCheck, change);
  if (sameComboPriceCheck(priceCheck, combo.priceCheck)) return false;
  await ctx.db.patch(combo._id, { priceCheck, updatedAt: change.at });
  return true;
}

/**
 * A price of `component` (its base price or one of its variant prices) changed:
 * every combo containing it gets the price-check flag. The combo price itself
 * is never touched. Returns how many combos were newly flagged.
 */
export async function flagCombosForPriceChange(
  ctx: MutationCtx,
  component: Doc<"menuArticles">,
  at: number = Date.now(),
): Promise<number> {
  if (component.kind !== "item") return 0;
  let flagged = 0;
  for (const row of await combosContaining(ctx, component._id)) {
    if (row.menuServiceId !== component.menuServiceId) continue;
    const changed = await flagCombo(ctx, row.comboArticleId, component.menuServiceId, {
      kind: "price_changed",
      componentKey: component.key,
      at,
    });
    if (changed) flagged += 1;
  }
  return flagged;
}

/**
 * `component` is being deleted: its component rows are removed and every combo
 * that contained it gets the flag (with the deleted name, which can no longer
 * be looked up). Returns the affected combo ids.
 */
export async function detachComponentFromCombos(
  ctx: MutationCtx,
  component: Doc<"menuArticles">,
  at: number = Date.now(),
): Promise<Id<"menuArticles">[]> {
  const comboIds: Id<"menuArticles">[] = [];
  for (const row of await combosContaining(ctx, component._id)) {
    if (row.menuServiceId !== component.menuServiceId) continue;
    await ctx.db.delete(row._id);
    await flagCombo(ctx, row.comboArticleId, component.menuServiceId, {
      kind: "removed",
      componentName: component.name,
      at,
    });
    if (!comboIds.includes(row.comboArticleId)) comboIds.push(row.comboArticleId);
  }
  return comboIds;
}

/**
 * A variant's OWN price of `article` changed (null = none; the variant then
 * uses the base price): combos are flagged and a manual Room service price of
 * that variant keeps its value and gets / updates / loses the old-new warning
 * (lib/menu/room-service-pricing.ts nextPriceWarning, the same rule as the
 * article's base price), compared on the effective variant price.
 */
export async function onVariantPriceChanged(
  ctx: MutationCtx,
  input: {
    article: Doc<"menuArticles">;
    variantKey: string;
    previousRsd: number | null;
    nextRsd: number | null;
    at?: number;
  },
): Promise<void> {
  const at = input.at ?? Date.now();
  const base = input.article.basePriceRsd ?? null;
  const previousRsd = input.previousRsd ?? base;
  const nextRsd = input.nextRsd ?? base;
  if (previousRsd === nextRsd) return;
  await flagCombosForPriceChange(ctx, input.article, at);

  const items = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_articleId", (q) => q.eq("articleId", input.article._id))
    .take(5);
  for (const item of items) {
    if (item.menuServiceId !== input.article.menuServiceId) continue;
    const prices = item.manualVariantPrices ?? [];
    let changed = false;
    const next = prices.map((entry) => {
      if (entry.variantKey !== input.variantKey) return entry;
      const existing = entry.priceWarning ?? null;
      const warning = nextPriceWarning({
        existing,
        manualPriceRsd: entry.priceRsd,
        previousBaseRsd: previousRsd,
        nextBaseRsd: nextRsd,
        at,
      });
      const same =
        (warning === null && existing === null) ||
        (warning !== null &&
          existing !== null &&
          warning.oldBaseRsd === existing.oldBaseRsd &&
          warning.newBaseRsd === existing.newBaseRsd &&
          warning.at === existing.at);
      if (same) return entry;
      changed = true;
      return {
        variantKey: entry.variantKey,
        priceRsd: entry.priceRsd,
        ...(warning ? { priceWarning: warning } : {}),
      };
    });
    if (changed) await ctx.db.patch(item._id, { manualVariantPrices: next, updatedAt: at });
  }
}

/**
 * A variant of `article` is being deleted: combos are flagged (a price option
 * disappeared) and its manual Room service price is dropped.
 */
export async function onVariantRemoved(
  ctx: MutationCtx,
  input: { article: Doc<"menuArticles">; variantKey: string; at?: number },
): Promise<void> {
  const at = input.at ?? Date.now();
  await flagCombosForPriceChange(ctx, input.article, at);
  const items = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_articleId", (q) => q.eq("articleId", input.article._id))
    .take(5);
  for (const item of items) {
    if (item.menuServiceId !== input.article.menuServiceId) continue;
    const prices = item.manualVariantPrices ?? [];
    const next = prices.filter((entry) => entry.variantKey !== input.variantKey);
    if (next.length === prices.length) continue;
    await ctx.db.patch(item._id, {
      manualVariantPrices: next.length > 0 ? next : undefined,
      updatedAt: at,
    });
  }
}
