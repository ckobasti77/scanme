/// <reference types="vite/client" />

// ScanMe Menu V1 — K04: promotions / akcije (master §7.6). An article has its
// regular price and an optional promotion (a promo price OR a discount percent;
// the other value is derived). Switching a promotion on and off by hand is
// Standard; a SCHEDULED promotion (start and/or end) needs Premium. Whether it
// runs now is computed from the time where it is read, never by a query here.
// Covered: both modes, the Premium gate, invalid promotions, compare-and-set,
// one draft change per success, roles and tenant isolation.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ARTICLE_ERROR } from "../lib/menu/errors/article";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { promoStateAt, promoWindowFromBelgradeLocal } from "../lib/menu/promo";
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

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const P = api.menuPromos;

// -----------------------------------------------------------------------------
// Error helpers
// -----------------------------------------------------------------------------

const CODE_PATTERN = /\b(?:menu|plan|article)\/[a-z_]+/;

function errorCode(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  const text = error instanceof Error ? error.message : String(error);
  return text.match(CODE_PATTERN)?.[0] ?? text;
}

/** The machine code a call was refused with, or null when it succeeded. */
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return errorCode(error);
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  expect(await codeOf(promise)).toBe(code);
}

// -----------------------------------------------------------------------------
// World
// -----------------------------------------------------------------------------

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

async function quickAdd(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
  priceRsd?: number,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

/** Tenant A: section "Akcije" with Pljeskavica 450, Viski 1000 and Sok (no price). */
async function fixture(t: T, w: MenuWorldSeed) {
  const section = await as(t, w.ownerId).mutation(api.menuCatalog.addSection, {
    pageId: w.a.defaultPageId,
    name: "Akcije",
  });
  const burger = await quickAdd(t, w.ownerId, section.sectionId, "Pljeskavica", 450);
  const whisky = await quickAdd(t, w.ownerId, section.sectionId, "Viski", 1000);
  const juice = await quickAdd(t, w.ownerId, section.sectionId, "Sok");
  return {
    sectionId: section.sectionId,
    burgerId: burger.articleId,
    whiskyId: whisky.articleId,
    juiceId: juice.articleId,
  };
}

async function tenantBArticle(t: T, w: MenuWorldSeed) {
  const section = await as(t, w.otherOwnerId).mutation(api.menuCatalog.addSection, {
    pageId: w.b.defaultPageId,
    name: "Pića",
  });
  return (await quickAdd(t, w.otherOwnerId, section.sectionId, "Jelen pivo", 200)).articleId;
}

async function articleOf(t: T, articleId: Id<"menuArticles">) {
  const article = await t.run(async (ctx) => await ctx.db.get(articleId));
  if (!article) throw new Error("article missing");
  return article;
}

async function draftOf(t: T, menuServiceId: Id<"menuServices">) {
  const state = await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
  if (!state) throw new Error("draft state missing");
  return state;
}

/** Everything promotions can write for one service, to prove "nothing changed". */
async function snapshot(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => ({
    draft: await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
    articles: await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}

async function premium(t: T, accountId: Id<"accounts">) {
  await t.run(async (ctx) => {
    await grantAccountPremium(ctx, { accountId, via: "plan" });
  });
}

/** Premium is gone again (a plan Premium that ended or was withdrawn). */
async function downgradeToBasic(t: T, accountId: Id<"accounts">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(accountId, { plan: "basic", updatedAt: Date.now() });
  });
}

/** 17 Oct 2026, 18:00-22:00 Belgrade time (CEST). */
function eveningWindow() {
  const window = promoWindowFromBelgradeLocal("2026-10-17T18:00", "2026-10-17T22:00");
  if (!window) throw new Error("window");
  return window;
}

const percent15 = { active: true, mode: "percent", percent: 15 } as const;

// =============================================================================
// Manual promotions (Standard)
// =============================================================================

describe("manual promotions on Standard", () => {
  test("a percent promotion is stored as entered and the promo price is derived", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const before = await draftOf(t, w.a.menuServiceId);

    const result = await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: { ...percent15, label: "promo" },
    });
    expect(result).toEqual({ ok: true });

    const article = await articleOf(t, f.burgerId);
    expect(article.promo).toEqual({ active: true, mode: "percent", percent: 15, label: "promo" });
    expect(article.basePriceRsd).toBe(450);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(before.revision + 1);

    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(view).toEqual({
      articleId: f.burgerId,
      promo: { active: true, mode: "percent", percent: 15, label: "promo" },
      scheduled: false,
      prices: [{ key: null, regularRsd: 450, promoRsd: 383, percent: 15 }],
      regularPrices: [{ key: null, regularRsd: 450 }],
    });
  });

  test("a price promotion keeps the exact price, drops a stray percent and derives the percent", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);

    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.whiskyId,
      expected: null,
      promo: { active: true, mode: "price", priceRsd: 899, percent: 50, label: "recommended" },
    });

    const article = await articleOf(t, f.whiskyId);
    expect(article.promo).toEqual({ active: true, mode: "price", priceRsd: 899, label: "recommended" });
    expect(article.promo).not.toHaveProperty("percent");

    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.whiskyId });
    expect(view?.prices).toEqual([{ key: null, regularRsd: 1000, promoRsd: 899, percent: 10 }]);
  });

  test("a percent promotion follows a later change of the regular price; a price promotion does not", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: percent15,
    });
    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.whiskyId,
      expected: null,
      promo: { active: true, mode: "price", priceRsd: 800 },
    });

    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.burgerId,
      expectedPriceRsd: 450,
      priceRsd: 500,
    });
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.whiskyId,
      expectedPriceRsd: 1000,
      priceRsd: 1200,
    });

    const burger = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(burger?.prices).toEqual([{ key: null, regularRsd: 500, promoRsd: 425, percent: 15 }]);
    const whisky = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.whiskyId });
    expect(whisky?.prices).toEqual([{ key: null, regularRsd: 1200, promoRsd: 800, percent: 33 }]);
  });

  test("changing the promotion and removing it with null; removing nothing is a no-op", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: percent15,
    });

    const change = await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: percent15,
      promo: { active: true, mode: "price", priceRsd: 300 },
    });
    expect(change).toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual({
      active: true,
      mode: "price",
      priceRsd: 300,
    });

    const revision = (await draftOf(t, w.a.menuServiceId)).revision;
    const removed = await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: { active: true, mode: "price", priceRsd: 300 },
      promo: null,
    });
    expect(removed).toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toBeUndefined();
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 1);

    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(view).toEqual({
      articleId: f.burgerId,
      promo: null,
      scheduled: false,
      prices: null,
      regularPrices: [{ key: null, regularRsd: 450 }],
    });

    // Nothing to remove: no draft change.
    const again = await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: null,
    });
    expect(again).toEqual({ ok: true });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 1);
  });

  test("the quick switch turns a manual promotion on and off on Standard", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: { active: false, mode: "percent", percent: 20 },
    });

    expect(await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }))
      .toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual({ active: true, mode: "percent", percent: 20 });
    expect(await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: false }))
      .toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual({ active: false, mode: "percent", percent: 20 });
  });

  test("an article with no promotion cannot be switched; the same state is a no-op", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }),
      MENU_ERROR.invalidInput,
    );

    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: percent15,
    });
    const before = await snapshot(t, w.a.menuServiceId);
    expect(await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }))
      .toEqual({ ok: true });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("articlePromo carries no time-based state: the renderer computes it from the stored window", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await premium(t, w.a.accountId);
    const window = eveningWindow();
    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: { ...percent15, ...window },
    });

    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(view?.scheduled).toBe(true);
    expect(view?.promo).toEqual({ ...percent15, ...window });
    expect(Object.keys(view ?? {}).sort()).toEqual(
      ["articleId", "prices", "promo", "regularPrices", "scheduled"].sort(),
    );
    // The same stored promotion, read at different instants (CEST evening window).
    const promo = view?.promo;
    if (!promo) throw new Error("promo missing");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 15, 59))).toBe("scheduled");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 16, 0))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 19, 59))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 20, 0))).toBe("ended");
  });
});

// =============================================================================
// Premium: scheduled promotions
// =============================================================================

describe("scheduled promotions need Premium", () => {
  test("a scheduled promotion that is on is refused on Standard, nothing written; allowed after Premium", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const window = eveningWindow();
    const scheduled = { ...percent15, ...window };
    const before = await snapshot(t, w.a.menuServiceId);

    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: scheduled }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    // A start alone, or an end alone, is just as scheduled.
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { ...percent15, startsAt: window.startsAt },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { ...percent15, endsAt: window.endsAt },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await premium(t, w.a.accountId);
    expect(
      await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: scheduled }),
    ).toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual(scheduled);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe((before.draft?.revision ?? 0) + 1);
  });

  test("Premium by subscription opens the same gate", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "subscription" });
    });
    expect(
      await as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { ...percent15, ...eveningWindow() },
      }),
    ).toEqual({ ok: true });
  });

  test("an inactive promotion with dates is allowed on Standard; switching it on then needs Premium, switching off never does", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const window = eveningWindow();
    const dormant = { active: false, mode: "percent", percent: 15, ...window } as const;

    expect(
      await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: dormant }),
    ).toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual(dormant);
    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(view?.scheduled).toBe(true);

    // Switching a scheduled promotion on is Premium.
    const beforeOn = await snapshot(t, w.a.menuServiceId);
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeOn);

    await premium(t, w.a.accountId);
    expect(await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }))
      .toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual({ ...dormant, active: true });

    // Premium ends: switching off still works, switching on does not, removing works.
    await downgradeToBasic(t, w.a.accountId);
    expect(await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: false }))
      .toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual(dormant);
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect(
      await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: dormant, promo: null }),
    ).toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toBeUndefined();
  });

  test("on Premium that ended: saving the identical scheduled promotion is a harmless no-op, changing it is refused", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await premium(t, w.a.accountId);
    const scheduled = { ...percent15, ...eveningWindow() };
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: scheduled });
    await downgradeToBasic(t, w.a.accountId);
    const before = await snapshot(t, w.a.menuServiceId);

    expect(
      await as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: scheduled,
        promo: scheduled,
      }),
    ).toEqual({ ok: true });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: scheduled,
        promo: { ...scheduled, percent: 25 },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

// =============================================================================
// Invalid promotions
// =============================================================================

describe("article/promo_invalid", () => {
  type PromoInput = {
    active: boolean;
    mode: "price" | "percent";
    priceRsd?: number;
    percent?: number;
    label?: "promo" | "recommended";
    startsAt?: number;
    endsAt?: number;
  };

  /** Every promotion is refused with article/promo_invalid and nothing is written. */
  async function rejectAll(
    t: T,
    userId: Id<"users">,
    menuServiceId: Id<"menuServices">,
    articleId: Id<"menuArticles">,
    promos: { label: string; promo: PromoInput }[],
  ) {
    const before = await snapshot(t, menuServiceId);
    for (const { label, promo } of promos) {
      expect(
        await codeOf(as(t, userId).mutation(P.setPromo, { articleId, expected: null, promo })),
        label,
      ).toBe(ARTICLE_ERROR.promoInvalid);
    }
    expect(await snapshot(t, menuServiceId)).toEqual(before);
  }

  test("a promo price that is not lower than the regular price, or not a whole dinar of at least 1", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await rejectAll(t, w.ownerId, w.a.menuServiceId, f.burgerId, [
      { label: "price equal to the regular price", promo: { active: true, mode: "price", priceRsd: 450 } },
      { label: "price above the regular price", promo: { active: true, mode: "price", priceRsd: 500 } },
      { label: "price 0", promo: { active: true, mode: "price", priceRsd: 0 } },
      { label: "fractional price", promo: { active: true, mode: "price", priceRsd: 299.5 } },
      { label: "price mode without a price", promo: { active: true, mode: "price" } },
      { label: "inactive promo is checked too", promo: { active: false, mode: "price", priceRsd: 450 } },
    ]);
  });

  test("an article without a regular price has nothing to discount", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await rejectAll(t, w.ownerId, w.a.menuServiceId, f.juiceId, [
      { label: "price mode, no regular price", promo: { active: true, mode: "price", priceRsd: 100 } },
      { label: "percent mode, no regular price", promo: { active: true, mode: "percent", percent: 10 } },
    ]);
  });

  test("a percent outside 1..99 or not whole, and a start that is not before the end", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const start = Date.UTC(2026, 9, 17, 16);
    await rejectAll(t, w.ownerId, w.a.menuServiceId, f.burgerId, [
      { label: "percent 0", promo: { active: true, mode: "percent", percent: 0 } },
      { label: "percent 100", promo: { active: true, mode: "percent", percent: 100 } },
      { label: "percent 15.5", promo: { active: true, mode: "percent", percent: 15.5 } },
      { label: "percent mode without a percent", promo: { active: true, mode: "percent" } },
      {
        label: "start after end",
        promo: { active: false, mode: "percent", percent: 10, startsAt: start + 1, endsAt: start },
      },
      {
        label: "start equals end",
        promo: { active: false, mode: "percent", percent: 10, startsAt: start, endsAt: start },
      },
    ]);
  });

  test("a price promotion is refused when variants are enabled; a percent promotion works on variant prices", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(f.burgerId, { variantsEnabled: true });
      const variants = [
        { key: "variant_mala", name: "Mala", priceRsd: 300, order: 1024 },
        { key: "variant_velika", name: "Velika", priceRsd: 500, order: 2048 },
        { key: "variant_bez_cene", name: "Dečija", order: 3072 },
      ];
      for (const variant of variants) {
        await ctx.db.insert("menuVariants", {
          menuServiceId: w.a.menuServiceId,
          articleId: f.burgerId,
          ...variant,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await rejectAll(t, w.ownerId, w.a.menuServiceId, f.burgerId, [
      { label: "price mode with variants", promo: { active: true, mode: "price", priceRsd: 200 } },
    ]);

    expect(
      await as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { active: true, mode: "percent", percent: 10 },
      }),
    ).toEqual({ ok: true });
    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(view?.regularPrices).toEqual([
      { key: "variant_mala", regularRsd: 300 },
      { key: "variant_velika", regularRsd: 500 },
      // A variant without a price follows the base price.
      { key: "variant_bez_cene", regularRsd: 450 },
    ]);
    expect(view?.prices).toEqual([
      { key: "variant_mala", regularRsd: 300, promoRsd: 270, percent: 10 },
      { key: "variant_velika", regularRsd: 500, promoRsd: 450, percent: 10 },
      { key: "variant_bez_cene", regularRsd: 450, promoRsd: 405, percent: 10 },
    ]);
  });

  test("variants switched off keep their rows but no longer count: a price promotion is fine again", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("menuVariants", {
        menuServiceId: w.a.menuServiceId,
        articleId: f.burgerId,
        key: "variant_mala",
        name: "Mala",
        priceRsd: 300,
        order: 1024,
        createdAt: now,
        updatedAt: now,
      });
    });
    expect(
      await as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { active: true, mode: "price", priceRsd: 400 },
      }),
    ).toEqual({ ok: true });
  });

  test("switching on re-checks against the current regular price; switching off never does", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const dormant = { active: false, mode: "price", priceRsd: 300 } as const;
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: dormant });
    // The regular price drops below the promo price: it is no longer a discount.
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.burgerId,
      expectedPriceRsd: 450,
      priceRsd: 250,
    });

    const before = await snapshot(t, w.a.menuServiceId);
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true }),
      ARTICLE_ERROR.promoInvalid,
    );
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // The renderer falls back to the regular price: no promo prices for an invalid promotion.
    const view = await as(t, w.ownerId).query(P.articlePromo, { articleId: f.burgerId });
    expect(view?.prices).toBeNull();
    expect(view?.regularPrices).toEqual([{ key: null, regularRsd: 250 }]);

    // A stored active promotion that went stale can still be switched off.
    await t.run(async (ctx) => {
      await ctx.db.patch(f.burgerId, { promo: { ...dormant, active: true } });
    });
    expect(await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: false }))
      .toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toEqual(dormant);
  });
});

// =============================================================================
// Compare-and-set and the draft revision
// =============================================================================

describe("compare-and-set", () => {
  test("a stale `expected` returns the current promotion and writes nothing", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: percent15 });
    const before = await snapshot(t, w.a.menuServiceId);

    // The editor still thinks there is no promotion.
    const stale = await as(t, w.managerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: { active: true, mode: "percent", percent: 30 },
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["promo"],
      current: { promo: percent15 },
      attempted: { promo: { active: true, mode: "percent", percent: 30 } },
    });

    // It saw another promotion.
    const other = await as(t, w.managerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: { active: true, mode: "percent", percent: 10 },
      promo: null,
    });
    expect(other).toEqual({ ok: false, conflicts: ["promo"], current: { promo: percent15 }, attempted: { promo: null } });

    // It saw the same promotion, but switched off.
    const switched = await as(t, w.managerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: { ...percent15, active: false },
      promo: null,
    });
    expect(switched).toMatchObject({ ok: false, conflicts: ["promo"] });

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect((await articleOf(t, f.burgerId)).promo).toEqual(percent15);
  });

  test("the conflict on an article without a promotion reports null", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const result = await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: percent15,
      promo: null,
    });
    expect(result).toEqual({ ok: false, conflicts: ["promo"], current: { promo: null }, attempted: { promo: null } });
  });

  test("the order of the keys in `expected` does not matter", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await as(t, w.ownerId).mutation(P.setPromo, {
      articleId: f.burgerId,
      expected: null,
      promo: { active: true, mode: "percent", percent: 15, label: "promo" },
    });
    const shuffled = { label: "promo", percent: 15, mode: "percent", active: true } as const;
    expect(
      await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: shuffled, promo: null }),
    ).toEqual({ ok: true });
    expect((await articleOf(t, f.burgerId)).promo).toBeUndefined();
  });

  test("exactly one draft change per success; none for a refusal, a conflict or a no-op", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const revision = async () => (await draftOf(t, w.a.menuServiceId)).revision;
    const start = await revision();

    // Success: +1.
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: percent15 });
    expect(await revision()).toBe(start + 1);

    // No-op (the same promotion again): +0.
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: percent15, promo: percent15 });
    expect(await revision()).toBe(start + 1);
    // No-op (the same switch): +0.
    await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true });
    expect(await revision()).toBe(start + 1);

    // Conflict: +0.
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: null });
    expect(await revision()).toBe(start + 1);

    // Refusals: +0.
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: percent15,
        promo: { active: true, mode: "percent", percent: 100 },
      }),
      ARTICLE_ERROR.promoInvalid,
    );
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: percent15,
        promo: { ...percent15, ...eveningWindow() },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.juiceId, active: true }),
      MENU_ERROR.invalidInput,
    );
    expect(await revision()).toBe(start + 1);

    // Switch off, then on again: +1 each.
    await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: false });
    expect(await revision()).toBe(start + 2);
    await as(t, w.ownerId).mutation(P.setPromoActive, { articleId: f.burgerId, active: true });
    expect(await revision()).toBe(start + 3);
    // Remove: +1.
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: percent15, promo: null });
    expect(await revision()).toBe(start + 4);
  });
});

// =============================================================================
// Roles and tenant isolation
// =============================================================================

describe("roles", () => {
  test("owner, manager, editor and admin can set, switch and remove a promotion", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const editorArticle = await quickAdd(t, w.ownerId, f.sectionId, "Urednikov artikal", 300);
    const adminArticle = await quickAdd(t, w.ownerId, f.sectionId, "Adminov artikal", 400);
    const targets: [string, Id<"users">, Id<"menuArticles">][] = [
      ["vlasnik", w.ownerId, f.burgerId],
      ["menadzer", w.managerId, f.whiskyId],
      ["urednik", w.editorId, editorArticle.articleId],
      ["admin", w.adminId, adminArticle.articleId],
    ];

    for (const [label, userId, articleId] of targets) {
      expect(
        await as(t, userId).mutation(P.setPromo, { articleId, expected: null, promo: percent15 }),
        label,
      ).toEqual({ ok: true });
      expect((await articleOf(t, articleId)).promo).toEqual(percent15);
      expect((await draftOf(t, w.a.menuServiceId)).lastEditByUserId).toBe(userId);
      expect(await as(t, userId).mutation(P.setPromoActive, { articleId, active: false }), label).toEqual({
        ok: true,
      });
      expect(await as(t, userId).query(P.articlePromo, { articleId }), label).toMatchObject({
        promo: { ...percent15, active: false },
      });
      expect(
        await as(t, userId).mutation(P.setPromo, {
          articleId,
          expected: { ...percent15, active: false },
          promo: null,
        }),
        label,
      ).toEqual({ ok: true });
      expect((await articleOf(t, articleId)).promo).toBeUndefined();
    }
  });

  test("finance, view-only, an outsider and another tenant's owner: not_found on writes, null on reads", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await as(t, w.ownerId).mutation(P.setPromo, { articleId: f.burgerId, expected: null, promo: percent15 });
    const before = await snapshot(t, w.a.menuServiceId);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const actor = as(t, userId);
      await expectCode(
        actor.mutation(P.setPromo, { articleId: f.burgerId, expected: percent15, promo: null }),
        MENU_ERROR.notFound,
      );
      await expectCode(
        actor.mutation(P.setPromo, { articleId: f.whiskyId, expected: null, promo: percent15 }),
        MENU_ERROR.notFound,
      );
      await expectCode(
        actor.mutation(P.setPromoActive, { articleId: f.burgerId, active: false }),
        MENU_ERROR.notFound,
      );
      expect(await actor.query(P.articlePromo, { articleId: f.burgerId })).toBeNull();
    }
    expect(await t.query(P.articlePromo, { articleId: f.burgerId })).toBeNull();
    await expectCode(
      t.mutation(P.setPromoActive, { articleId: f.burgerId, active: false }),
      MENU_ERROR.unauthenticated,
    );

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      expect((await as(t, userId).query(P.articlePromo, { articleId: f.burgerId }))?.promo).toEqual(percent15);
    }
  });

  test("the owner of A cannot read or change an article of B; B's promotion is untouched", async () => {
    const { t, w } = await setup();
    await fixture(t, w);
    const bArticle = await tenantBArticle(t, w);
    await as(t, w.otherOwnerId).mutation(P.setPromo, {
      articleId: bArticle,
      expected: null,
      promo: { active: true, mode: "price", priceRsd: 150 },
    });
    const beforeB = await snapshot(t, w.b.menuServiceId);
    const beforeA = await snapshot(t, w.a.menuServiceId);

    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, { articleId: bArticle, expected: null, promo: null }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: bArticle,
        expected: { active: true, mode: "price", priceRsd: 150 },
        promo: percent15,
      }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromoActive, { articleId: bArticle, active: false }),
      MENU_ERROR.notFound,
    );
    expect(await as(t, w.ownerId).query(P.articlePromo, { articleId: bArticle })).toBeNull();

    const own = await as(t, w.otherOwnerId).query(P.articlePromo, { articleId: bArticle });
    expect(own?.prices).toEqual([{ key: null, regularRsd: 200, promoRsd: 150, percent: 25 }]);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
  });

  test("the Premium gate follows the ACCOUNT of the article's venue, not the caller's other venues", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    // Premium on B's account does nothing for A.
    await premium(t, w.b.accountId);
    await expectCode(
      as(t, w.ownerId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { ...percent15, ...eveningWindow() },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    // The admin does not bypass the commercial gate either.
    await expectCode(
      as(t, w.adminId).mutation(P.setPromo, {
        articleId: f.burgerId,
        expected: null,
        promo: { ...percent15, ...eveningWindow() },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect((await articleOf(t, f.burgerId)).promo).toBeUndefined();
  });
});
