import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { requireMenuCapability } from "./lib/menuCapabilities";
import { menuPromoValidator } from "./lib/menuDomainValidators";
import { touchDraft } from "./lib/menuDraft";
import { checkCas, type CasValue } from "../lib/menu/cas";
import { ARTICLE_ERROR, type ArticleErrorCode } from "../lib/menu/errors/article";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import { MENU_MAX_VARIANTS_PER_ARTICLE } from "../lib/menu/limits";
import {
  checkPromo,
  isPromoScheduled,
  promoPrices,
  regularPrices,
  type MenuPromo,
  type MenuPromoPriceContext,
} from "../lib/menu/promo";

// =============================================================================
// ScanMe Menu V1 — promotions / akcije (K04; master §7.6).
//
// An article has its regular price and an optional promotion: a promo PRICE or a
// discount PERCENT (the client enters one, lib/menu/promo.ts derives the
// other), an optional label, and an optional schedule. The promotion is stored
// on the shared article, so it shows on every page the article is on. Only the
// entered value is stored, in the normalized form checkPromo returns.
//
// Plans: switching a promotion on and off by hand is Standard. A SCHEDULED
// promotion (a start and/or an end) needs Premium (capability
// "scheduledPromos"); removing a promotion, saving an inactive one and a manual
// one never do. Whether a promotion is running NOW is computed where it is read
// from the time (promoStateAt) — never by a query here, never by a job; after
// the end the regular price comes back by itself.
//
// Row-addressed writes: load the article (missing = not_found), authorize
// against ITS service (requireMenuAccessToRow, "menu.edit"). touchDraft runs
// exactly once per successful change, never on a refusal, a CAS conflict or a
// no-op. Reads need "menu.read" and return null for every refusal.
// =============================================================================

function refuse(code: MenuErrorCode | ArticleErrorCode): ConvexError<string> {
  return new ConvexError(code);
}

type DbCtx = QueryCtx | MutationCtx;
type StoredPromo = Infer<typeof menuPromoValidator>;

/** The regular prices a promotion of this article applies to: base price, variant switch and variant prices. */
async function priceContext(ctx: DbCtx, article: Doc<"menuArticles">): Promise<MenuPromoPriceContext> {
  const variants = await ctx.db
    .query("menuVariants")
    .withIndex("by_articleId_and_order", (q) => q.eq("articleId", article._id))
    .take(MENU_MAX_VARIANTS_PER_ARTICLE);
  return {
    basePriceRsd: article.basePriceRsd ?? null,
    variantsEnabled: article.variantsEnabled === true,
    variants: variants.map((variant) => ({ key: variant.key, priceRsd: variant.priceRsd ?? null })),
  };
}

/** One fixed key order, so equal promotions compare equal whatever order their keys arrived in. */
function canonical(promo: MenuPromo | null): StoredPromo | null {
  if (promo === null) return null;
  return {
    active: promo.active,
    mode: promo.mode,
    ...(promo.priceRsd !== undefined ? { priceRsd: promo.priceRsd } : {}),
    ...(promo.percent !== undefined ? { percent: promo.percent } : {}),
    ...(promo.label !== undefined ? { label: promo.label } : {}),
    ...(promo.startsAt !== undefined ? { startsAt: promo.startsAt } : {}),
    ...(promo.endsAt !== undefined ? { endsAt: promo.endsAt } : {}),
  };
}

function samePromo(a: MenuPromo | null, b: MenuPromo | null): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

async function articleForEdit(ctx: MutationCtx, articleId: Id<"menuArticles">) {
  const article = await ctx.db.get(articleId);
  if (!article) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, article.menuServiceId, "menu.edit");
  return { article, access };
}

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

/**
 * Sets, changes or removes (promo = null) the promotion of an article by
 * compare-and-set: `expected` is the promotion the editor last saw (null = none).
 * A conflict writes nothing and returns the current promotion. The promotion
 * must make a discount for the article's regular prices (article/promo_invalid).
 * A promotion that is switched on AND scheduled needs Premium.
 */
export const setPromo = mutation({
  args: {
    articleId: v.id("menuArticles"),
    expected: v.union(menuPromoValidator, v.null()),
    promo: v.union(menuPromoValidator, v.null()),
  },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const stored: MenuPromo | null = article.promo ?? null;

    const cas = checkCas<"promo">(
      { promo: canonical(stored) },
      // checkCas compares structured values as JSON; the shape is fixed by canonical().
      { promo: canonical(args.expected) as unknown as CasValue },
      { promo: canonical(args.promo) },
    );
    if (!cas.ok) return cas;

    let next: MenuPromo | null = null;
    if (args.promo !== null) {
      next = checkPromo(args.promo, await priceContext(ctx, article));
      if (next === null) throw refuse(ARTICLE_ERROR.promoInvalid);
    }
    if (samePromo(next, stored)) return { ok: true as const };

    if (next !== null && next.active && isPromoScheduled(next)) {
      await requireMenuCapability(ctx, access.business._id, "scheduledPromos");
    }
    await ctx.db.patch(article._id, {
      promo: canonical(next) ?? undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

/**
 * The quick manual switch of an existing promotion ("Uključi" / "Isključi").
 * Switching on re-checks the promotion against the current regular price (it
 * may have changed since) and needs Premium when the promotion is scheduled;
 * switching off never needs either.
 */
export const setPromoActive = mutation({
  args: { articleId: v.id("menuArticles"), active: v.boolean() },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const stored: MenuPromo | null = article.promo ?? null;
    if (stored === null) throw refuse(MENU_ERROR.invalidInput);
    if (stored.active === args.active) return { ok: true as const };

    let next: MenuPromo = { ...stored, active: false };
    if (args.active) {
      const checked = checkPromo({ ...stored, active: true }, await priceContext(ctx, article));
      if (checked === null) throw refuse(ARTICLE_ERROR.promoInvalid);
      if (isPromoScheduled(checked)) {
        await requireMenuCapability(ctx, access.business._id, "scheduledPromos");
      }
      next = checked;
    }
    await ctx.db.patch(article._id, {
      promo: canonical(next) ?? undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Read model
// -----------------------------------------------------------------------------

/**
 * The promotion of an article for the editor: the stored promotion, whether it
 * is scheduled (Premium), the regular and promo price of every price the guest
 * can pick (base price or each variant) and the regular prices alone. There is
 * no time-based state here (a query must not read the clock): the UI and the
 * renderer compute promoStateAt(promo, now) from lib/menu/promo.ts. null when
 * the article is missing or the caller cannot read its service.
 */
export const articlePromo = query({
  args: { articleId: v.id("menuArticles") },
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) return null;
    const access = await getMenuAccess(ctx, { menuServiceId: article.menuServiceId }, "menu.read");
    if (!access) return null;

    const promo = canonical(article.promo ?? null);
    const context = await priceContext(ctx, article);
    return {
      articleId: article._id,
      promo,
      scheduled: promo !== null && isPromoScheduled(promo),
      prices: promo === null ? null : promoPrices(promo, context),
      regularPrices: regularPrices(context),
    };
  },
});
