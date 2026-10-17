/// <reference types="vite/client" />

// ScanMe Menu V1 — K04: the manual Room service price of ONE variant (K03
// deferred it to K04; master §5.3). Same price order as an article (variant
// price, falling back to the base price → markup → manual RS price) and the
// same old/new warning when the price under a manual RS price changes.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { onVariantPriceChanged, onVariantRemoved } from "./lib/menuArticleHooks";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { newMenuKey } from "../lib/menu/keys";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const RS = api.menuRoomService;
const CODE_PATTERN = /\b(?:menu|plan|room_service)\/[a-z_]+/;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(CODE_PATTERN)?.[0] ?? text;
  }
}

async function revision(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique();
    return state?.revision ?? -1;
  });
}

async function insertVariant(
  t: T,
  input: {
    menuServiceId: Id<"menuServices">;
    articleId: Id<"menuArticles">;
    name: string;
    priceRsd?: number;
    order: number;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const key = newMenuKey("variant");
    const variantId = await ctx.db.insert("menuVariants", {
      menuServiceId: input.menuServiceId,
      articleId: input.articleId,
      key,
      name: input.name,
      ...(input.priceRsd !== undefined ? { priceRsd: input.priceRsd } : {}),
      order: input.order,
      createdAt: now,
      updatedAt: now,
    });
    return { variantId, key };
  });
}

/**
 * Premium tenant A, "Kafa" (base 200) with variants Mala 180, Velika 250 and
 * Domaća (no own price → the base price), in Room service with a 10 % markup.
 */
async function setup(options: { premium?: boolean } = {}) {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  if (options.premium !== false) {
    await t.run(async (ctx) => await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));
  }
  const owner = as(t, w.ownerId);
  const { sectionId } = await owner.mutation(api.menuCatalog.addSection, {
    pageId: w.a.defaultPageId,
    name: "Topli napici",
  });
  const added = await owner.mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name: "Kafa",
    priceRsd: 200,
  });
  if (added.status !== "created") throw new Error("expected created");
  const articleId = added.articleId;
  await t.run(async (ctx) => {
    await ctx.db.patch(articleId, { variantsEnabled: true });
  });
  const small = await insertVariant(t, { menuServiceId: w.a.menuServiceId, articleId, name: "Mala", priceRsd: 180, order: 1024 });
  const large = await insertVariant(t, { menuServiceId: w.a.menuServiceId, articleId, name: "Velika", priceRsd: 250, order: 2048 });
  const house = await insertVariant(t, { menuServiceId: w.a.menuServiceId, articleId, name: "Domaća", order: 3072 });

  let itemId: Id<"menuRoomServiceItems"> | null = null;
  if (options.premium !== false) {
    const { categoryId } = await owner.mutation(RS.addCategory, {
      menuServiceId: w.a.menuServiceId,
      name: "Napici u sobu",
    });
    await owner.mutation(RS.addItems, { categoryId, articleIds: [articleId] });
    await owner.mutation(RS.updateSettings, {
      menuServiceId: w.a.menuServiceId,
      expected: { markupPercent: null },
      patch: { markupPercent: 10 },
    });
  }
  itemId = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("menuRoomServiceItems")
      .withIndex("by_articleId", (q) => q.eq("articleId", articleId))
      .first();
    return row?._id ?? null;
  });
  return { t, w, articleId, small, large, house, itemId };
}

async function variantsView(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const view = await as(t, userId).query(RS.get, { menuServiceId });
  if (!view) throw new Error("get returned null");
  const item = view.categories.flatMap((category) => category.items)[0];
  return Object.fromEntries(item.variants.map((variant) => [variant.name, variant]));
}

async function article(t: T, articleId: Id<"menuArticles">) {
  const doc = await t.run(async (ctx) => await ctx.db.get(articleId));
  if (!doc) throw new Error("article missing");
  return doc;
}

describe("Room service — variant prices", () => {
  test("variants follow the price order: own price or base → markup", async () => {
    const { t, w } = await setup();
    const view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Mala"]).toMatchObject({ variantPriceRsd: 180, priceRsd: 198, origin: "computed", manualPriceRsd: null });
    expect(view["Velika"]).toMatchObject({ variantPriceRsd: 250, priceRsd: 275, origin: "computed" });
    expect(view["Domaća"]).toMatchObject({ variantPriceRsd: 200, priceRsd: 220, origin: "computed" });
  });

  test("a manual price per variant is kept exactly, by compare-and-set", async () => {
    const { t, w, large, itemId } = await setup();
    const owner = as(t, w.ownerId);
    const before = await revision(t, w.a.menuServiceId);

    expect(
      await owner.mutation(RS.setManualVariantPrice, {
        itemId: itemId!,
        variantId: large.variantId,
        expectedManualPriceRsd: null,
        manualPriceRsd: 299,
      }),
    ).toEqual({ ok: true });
    expect(await revision(t, w.a.menuServiceId)).toBe(before + 1);
    let view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Velika"]).toMatchObject({ priceRsd: 299, origin: "manual", manualPriceRsd: 299 });
    expect(view["Mala"]).toMatchObject({ priceRsd: 198, origin: "computed" });

    const stale = await owner.mutation(RS.setManualVariantPrice, {
      itemId: itemId!,
      variantId: large.variantId,
      expectedManualPriceRsd: null,
      manualPriceRsd: 310,
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["manualPriceRsd"],
      current: { manualPriceRsd: 299 },
      attempted: { manualPriceRsd: 310 },
    });
    expect(await revision(t, w.a.menuServiceId)).toBe(before + 1);

    await owner.mutation(RS.setManualVariantPrice, {
      itemId: itemId!,
      variantId: large.variantId,
      expectedManualPriceRsd: 299,
      manualPriceRsd: null,
    });
    view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Velika"]).toMatchObject({ priceRsd: 275, origin: "computed", manualPriceRsd: null });
    const stored = await t.run(async (ctx) => await ctx.db.get(itemId!));
    expect(stored?.manualVariantPrices).toBeUndefined();
  });

  test("a variant price change keeps the manual price and warns; returning clears it", async () => {
    const { t, w, articleId, large, itemId } = await setup();
    await as(t, w.ownerId).mutation(RS.setManualVariantPrice, {
      itemId: itemId!,
      variantId: large.variantId,
      expectedManualPriceRsd: null,
      manualPriceRsd: 300,
    });
    const kafa = await article(t, articleId);

    await t.run(async (ctx) => {
      await ctx.db.patch(large.variantId, { priceRsd: 260 });
      await onVariantPriceChanged(ctx, { article: kafa, variantKey: large.key, previousRsd: 250, nextRsd: 260 });
    });
    let view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Velika"]).toMatchObject({ priceRsd: 300, origin: "manual" });
    expect(view["Velika"].warning).toEqual({
      oldBaseRsd: 250,
      newBaseRsd: 260,
      roomServicePriceRsd: 300,
      recomputedPriceRsd: 286,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(large.variantId, { priceRsd: 250 });
      await onVariantPriceChanged(ctx, { article: kafa, variantKey: large.key, previousRsd: 260, nextRsd: 250 });
    });
    view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Velika"].warning).toBeNull();
  });

  test("a variant that falls back to the base price warns on a base price change", async () => {
    const { t, w, articleId, house, large, itemId } = await setup();
    const owner = as(t, w.ownerId);
    for (const variant of [house, large]) {
      await owner.mutation(RS.setManualVariantPrice, {
        itemId: itemId!,
        variantId: variant.variantId,
        expectedManualPriceRsd: null,
        manualPriceRsd: 230,
      });
    }
    await owner.mutation(api.menuCatalog.setBasePrice, { articleId, expectedPriceRsd: 200, priceRsd: 220 });

    const view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Domaća"].warning).toMatchObject({ oldBaseRsd: 200, newBaseRsd: 220, roomServicePriceRsd: 230 });
    // Velika has its own price: the base price change does not concern it.
    expect(view["Velika"].warning).toBeNull();
  });

  test("resolving: keep the manual price, or recompute from the markup", async () => {
    const { t, w, articleId, small, large, itemId } = await setup();
    const owner = as(t, w.ownerId);
    for (const variant of [small, large]) {
      await owner.mutation(RS.setManualVariantPrice, {
        itemId: itemId!,
        variantId: variant.variantId,
        expectedManualPriceRsd: null,
        manualPriceRsd: 300,
      });
    }
    const kafa = await article(t, articleId);
    await t.run(async (ctx) => {
      await onVariantPriceChanged(ctx, { article: kafa, variantKey: small.key, previousRsd: 180, nextRsd: 190 });
      await onVariantPriceChanged(ctx, { article: kafa, variantKey: large.key, previousRsd: 250, nextRsd: 270 });
      await ctx.db.patch(small.variantId, { priceRsd: 190 });
      await ctx.db.patch(large.variantId, { priceRsd: 270 });
    });

    await owner.mutation(RS.resolveVariantPriceWarning, { itemId: itemId!, variantKey: small.key, action: "keepManual" });
    await owner.mutation(RS.resolveVariantPriceWarning, { itemId: itemId!, variantKey: large.key, action: "recomputeFromMarkup" });
    const view = await variantsView(t, w.ownerId, w.a.menuServiceId);
    expect(view["Mala"]).toMatchObject({ priceRsd: 300, origin: "manual", warning: null });
    expect(view["Velika"]).toMatchObject({ priceRsd: 297, origin: "computed", manualPriceRsd: null, warning: null });
  });

  test("deleting a variant drops its manual price", async () => {
    const { t, w, articleId, large, itemId } = await setup();
    await as(t, w.ownerId).mutation(RS.setManualVariantPrice, {
      itemId: itemId!,
      variantId: large.variantId,
      expectedManualPriceRsd: null,
      manualPriceRsd: 300,
    });
    const kafa = await article(t, articleId);
    await t.run(async (ctx) => {
      await onVariantRemoved(ctx, { article: kafa, variantKey: large.key });
      await ctx.db.delete(large.variantId);
    });
    const stored = await t.run(async (ctx) => await ctx.db.get(itemId!));
    expect(stored?.manualVariantPrices).toBeUndefined();
  });
});

describe("Room service — variant prices: gates, roles, tenant", () => {
  test("Standard accounts are refused (Room service is Premium)", async () => {
    const { t, w, large } = await setup();
    const itemId = await t.run(async (ctx) => {
      const row = await ctx.db.query("menuRoomServiceItems").first();
      return row!._id;
    });
    await t.run(async (ctx) => await ctx.db.patch(w.a.accountId, { plan: "basic" }));
    expect(
      await codeOf(
        as(t, w.ownerId).mutation(RS.setManualVariantPrice, {
          itemId,
          variantId: large.variantId,
          expectedManualPriceRsd: null,
          manualPriceRsd: 300,
        }),
      ),
    ).toBe(MENU_PLAN_ERROR.premiumRequired);
  });

  test("the editor may set it; finance and outsiders may not", async () => {
    const { t, w, large, itemId } = await setup();
    expect(
      await codeOf(
        as(t, w.editorId).mutation(RS.setManualVariantPrice, {
          itemId: itemId!,
          variantId: large.variantId,
          expectedManualPriceRsd: null,
          manualPriceRsd: 300,
        }),
      ),
    ).toBeNull();
    for (const userId of [w.financeId, w.outsiderId, w.otherOwnerId]) {
      expect(
        await codeOf(
          as(t, userId).mutation(RS.setManualVariantPrice, {
            itemId: itemId!,
            variantId: large.variantId,
            expectedManualPriceRsd: 300,
            manualPriceRsd: 310,
          }),
        ),
      ).toBe(MENU_ERROR.notFound);
    }
  });

  test("a variant of another article or another venue is refused", async () => {
    const { t, w, itemId } = await setup();
    const owner = as(t, w.ownerId);
    const { sectionId } = await owner.mutation(api.menuCatalog.addSection, {
      pageId: w.a.defaultPageId,
      name: "Sokovi",
    });
    const juice = await owner.mutation(api.menuCatalog.quickAddArticle, { sectionId, name: "Sok", priceRsd: 220 });
    if (juice.status !== "created") throw new Error("expected created");
    const juiceVariant = await insertVariant(t, {
      menuServiceId: w.a.menuServiceId,
      articleId: juice.articleId,
      name: "0,2 l",
      priceRsd: 220,
      order: 1024,
    });
    expect(
      await codeOf(
        owner.mutation(RS.setManualVariantPrice, {
          itemId: itemId!,
          variantId: juiceVariant.variantId,
          expectedManualPriceRsd: null,
          manualPriceRsd: 300,
        }),
      ),
    ).toBe(MENU_ERROR.invalidInput);

    const bSection = await as(t, w.otherOwnerId).mutation(api.menuCatalog.addSection, {
      pageId: w.b.defaultPageId,
      name: "Kafe",
    });
    const bCoffee = await as(t, w.otherOwnerId).mutation(api.menuCatalog.quickAddArticle, {
      sectionId: bSection.sectionId,
      name: "Kafa",
      priceRsd: 210,
    });
    if (bCoffee.status !== "created") throw new Error("expected created");
    const foreign = await insertVariant(t, {
      menuServiceId: w.b.menuServiceId,
      articleId: bCoffee.articleId,
      name: "Velika",
      priceRsd: 260,
      order: 1024,
    });
    expect(
      await codeOf(
        owner.mutation(RS.setManualVariantPrice, {
          itemId: itemId!,
          variantId: foreign.variantId,
          expectedManualPriceRsd: null,
          manualPriceRsd: 300,
        }),
      ),
    ).toBe(MENU_ERROR.notFound);
  });
});
