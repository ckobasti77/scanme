/// <reference types="vite/client" />

// ScanMe Menu V1 — K16 additions to the editor read/write model:
//   - menuCatalog.setBasePrice answers `{ ok: true, roomServiceWarning }` (the
//     editor asks about a manual Room service price at once);
//   - menuStudio.articleDetail carries the combo (components, "Proveri cenu")
//     and the translations of the article and its variants;
//   - menuStudio.searchArticles carries `kind`;
//   - the Room service writes stay a Premium feature.
// Fictional venues only (seed.ts). No network is touched.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { TEST_ADMIN_EMAIL, TEST_ISSUER, grantAccountPremium, seedMenuWorld, type MenuWorldSeed } from "../lib/menu/testkit/seed";

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

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(/\b(?:menu|plan|room_service)\/[a-z_]+/)?.[0] ?? text;
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  expect(await codeOf(promise)).toBe(code);
}

function orThrow<R>(value: R | null): R {
  if (value === null) throw new Error("expected a result, got null");
  return value;
}

// -----------------------------------------------------------------------------
// World: tenant A (Premium unless told otherwise) sells Ćevapi, Lepinja and
// Kajmak in "Roštilj" and Pivo in "Pića"; Pljeskavica 450 is the Room service
// article (category "Hrana u sobu", markup 15 %).
// -----------------------------------------------------------------------------

async function quickAdd(t: T, userId: Id<"users">, sectionId: Id<"menuSections">, name: string, priceRsd: number) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, { sectionId, name, priceRsd });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

async function setup(options: { premium?: boolean } = {}) {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const premium = options.premium !== false;
  if (premium) {
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
  }
  const owner = as(t, w.ownerId);
  const grill = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Roštilj" });
  const drinks = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Pića" });
  const cevapi = await quickAdd(t, w.ownerId, grill.sectionId, "Ćevapi", 650);
  const lepinja = await quickAdd(t, w.ownerId, grill.sectionId, "Lepinja", 60);
  const kajmak = await quickAdd(t, w.ownerId, grill.sectionId, "Kajmak", 100);
  const burger = await quickAdd(t, w.ownerId, grill.sectionId, "Pljeskavica", 450);
  const beer = await quickAdd(t, w.ownerId, drinks.sectionId, "Pivo", 200);
  return { t, w, owner, grillId: grill.sectionId, drinksId: drinks.sectionId, cevapi, lepinja, kajmak, burger, beer };
}
type World = Awaited<ReturnType<typeof setup>>;

/** Room service on, one category with the burger, markup 15 %. */
async function withRoomService(world: World) {
  const { t, w, owner, burger } = world;
  const id = w.a.menuServiceId;
  await owner.mutation(api.menuServices.setFeature, { menuServiceId: id, feature: "roomService", enabled: true });
  const category = await owner.mutation(RS.addCategory, { menuServiceId: id, name: "Hrana u sobu" });
  await owner.mutation(RS.addItems, { categoryId: category.categoryId, articleIds: [burger.articleId] });
  await owner.mutation(RS.updateSettings, {
    menuServiceId: id,
    expected: { markupPercent: null },
    patch: { markupPercent: 15 },
  });
  const view = orThrow(await owner.query(RS.get, { menuServiceId: id }));
  const item = view.categories.flatMap((c) => c.items).find((candidate) => candidate.article.articleId === burger.articleId);
  if (!item) throw new Error("the burger is not in Room service");
  return { ...world, itemId: item.itemId, categoryId: category.categoryId, t };
}

async function rsItem(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">, articleId: Id<"menuArticles">) {
  const view = orThrow(await as(t, userId).query(RS.get, { menuServiceId }));
  const item = view.categories.flatMap((c) => c.items).find((candidate) => candidate.article.articleId === articleId);
  if (!item) throw new Error("article not in Room service");
  return item;
}

function setBase(world: World, articleId: Id<"menuArticles">, expected: number | null, price: number | null, userId?: Id<"users">) {
  return as(world.t, userId ?? world.w.ownerId).mutation(api.menuCatalog.setBasePrice, {
    articleId,
    expectedPriceRsd: expected,
    priceRsd: price,
  });
}

function detail(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">, articleKey: string) {
  return as(t, userId).query(api.menuStudio.articleDetail, { menuServiceId, articleKey });
}

// =============================================================================
// setBasePrice -> roomServiceWarning
// =============================================================================

describe("menuCatalog.setBasePrice: roomServiceWarning", () => {
  test("an article that is not in Room service: { ok: true }", async () => {
    const world = await withRoomService(await setup());
    expect(await setBase(world, world.beer.articleId, 200, 250)).toEqual({ ok: true });
  });

  test("a Room service item WITHOUT a manual price follows the base: no warning", async () => {
    const world = await withRoomService(await setup());
    const { t, w, burger } = world;
    expect(await setBase(world, burger.articleId, 450, 500)).toEqual({ ok: true });
    expect(await rsItem(t, w.ownerId, w.a.menuServiceId, burger.articleId)).toMatchObject({
      basePriceRsd: 500,
      priceRsd: 575,
      origin: "computed",
      warning: null,
    });
  });

  test("a Room service item WITH a manual price keeps it and answers old base, new base, the manual price and the recomputed price (half-up)", async () => {
    const world = await withRoomService(await setup());
    const { t, w, owner, burger, itemId } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });

    // 510 * 1.15 = 586.5 -> 587.
    const result = await setBase(world, burger.articleId, 450, 510);
    expect(result).toEqual({
      ok: true,
      roomServiceWarning: { itemId, oldBaseRsd: 450, newBaseRsd: 510, roomServicePriceRsd: 600, recomputedPriceRsd: 587 },
    });
    expect(await rsItem(t, w.ownerId, w.a.menuServiceId, burger.articleId)).toMatchObject({
      basePriceRsd: 510,
      priceRsd: 600,
      origin: "manual",
      manualPriceRsd: 600,
      warning: { oldBaseRsd: 450, newBaseRsd: 510, roomServicePriceRsd: 600, recomputedPriceRsd: 587 },
    });
  });

  test("a second change keeps the first old base; returning to the old base clears the warning (null)", async () => {
    const world = await withRoomService(await setup());
    const { t, w, owner, burger, itemId } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });

    await setBase(world, burger.articleId, 450, 500);
    expect(await setBase(world, burger.articleId, 500, 520)).toEqual({
      ok: true,
      roomServiceWarning: { itemId, oldBaseRsd: 450, newBaseRsd: 520, roomServicePriceRsd: 600, recomputedPriceRsd: 598 },
    });
    expect(await setBase(world, burger.articleId, 520, 450)).toEqual({ ok: true });
    const item = await rsItem(t, w.ownerId, w.a.menuServiceId, burger.articleId);
    expect(item).toMatchObject({ basePriceRsd: 450, priceRsd: 600, origin: "manual", warning: null });
    const row = await t.run(async (ctx) => ctx.db.get(itemId));
    expect(row?.priceWarning).toBeUndefined();
  });

  test("clearing the base price of an item with a manual price warns with a null new base and null recomputed price", async () => {
    const world = await withRoomService(await setup());
    const { owner, burger, itemId } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });
    expect(await setBase(world, burger.articleId, 450, null)).toEqual({
      ok: true,
      roomServiceWarning: { itemId, oldBaseRsd: 450, newBaseRsd: null, roomServicePriceRsd: 600, recomputedPriceRsd: null },
    });
  });

  test("the same price is the plain { ok: true } no-op", async () => {
    const world = await withRoomService(await setup());
    const { owner, burger, itemId } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });
    expect(await setBase(world, burger.articleId, 450, 450)).toEqual({ ok: true });
  });

  test("a compare-and-set conflict answers as before and writes nothing", async () => {
    const world = await withRoomService(await setup());
    const { t, w, owner, burger, itemId } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });

    const conflict = await setBase(world, burger.articleId, 400, 500);
    expect(conflict).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 450 },
      attempted: { basePriceRsd: 500 },
    });
    expect(conflict).not.toHaveProperty("roomServiceWarning");
    const article = await t.run(async (ctx) => ctx.db.get(burger.articleId));
    expect(article?.basePriceRsd).toBe(450);
    expect((await rsItem(t, w.ownerId, w.a.menuServiceId, burger.articleId)).warning).toBeNull();
  });

  test("resolvePriceWarning: keepManual keeps the manual price (origin manual), recomputeFromMarkup follows the markup (origin computed)", async () => {
    const world = await withRoomService(await setup());
    const { t, w, owner, burger, itemId } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });
    await setBase(world, burger.articleId, 450, 510);

    expect(await owner.mutation(RS.resolvePriceWarning, { itemId, action: "keepManual" })).toEqual({ ok: true });
    expect(await rsItem(t, w.ownerId, w.a.menuServiceId, burger.articleId)).toMatchObject({
      priceRsd: 600,
      origin: "manual",
      manualPriceRsd: 600,
      warning: null,
    });

    // A new change raises it again; this time the owner takes the computed price.
    expect(await setBase(world, burger.articleId, 510, 520)).toMatchObject({
      roomServiceWarning: { oldBaseRsd: 510, newBaseRsd: 520, roomServicePriceRsd: 600, recomputedPriceRsd: 598 },
    });
    expect(await owner.mutation(RS.resolvePriceWarning, { itemId, action: "recomputeFromMarkup" })).toEqual({ ok: true });
    expect(await rsItem(t, w.ownerId, w.a.menuServiceId, burger.articleId)).toMatchObject({
      basePriceRsd: 520,
      priceRsd: 598,
      origin: "computed",
      manualPriceRsd: null,
      warning: null,
    });
  });

  test("the editor, the manager and the admin get the same answer", async () => {
    const world = await withRoomService(await setup());
    const { owner, burger, itemId, w } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });
    let previous = 450;
    for (const userId of [w.editorId, w.managerId, w.adminId]) {
      const next = previous + 10;
      const result = await setBase(world, burger.articleId, previous, next, userId);
      expect(result).toMatchObject({ ok: true, roomServiceWarning: { itemId, oldBaseRsd: 450, newBaseRsd: next, roomServicePriceRsd: 600 } });
      previous = next;
    }
  });

  test("refused callers still get the old refusals (menu/not_found), no warning object", async () => {
    const world = await withRoomService(await setup());
    const { burger, w } = world;
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expectCode(setBase(world, burger.articleId, 450, 500, userId), MENU_ERROR.notFound);
    }
  });
});

// =============================================================================
// articleDetail: combo, translations
// =============================================================================

describe("menuStudio.articleDetail: combo", () => {
  async function comboWorld() {
    const world = await setup({ premium: false });
    const { owner, grillId, cevapi, lepinja } = world;
    const combo = await owner.mutation(api.menuCombos.createCombo, {
      sectionId: grillId,
      name: "Ćevapi meni",
      priceRsd: 700,
      components: [
        { articleId: cevapi.articleId, quantity: 1 },
        { articleId: lepinja.articleId, quantity: 2 },
      ],
    });
    return { ...world, combo };
  }

  test("a combo lists its components with names, quantities and prices; priceCheck is null", async () => {
    const { t, w, combo, cevapi, lepinja } = await comboWorld();
    const result = orThrow(await detail(t, w.editorId, w.a.menuServiceId, combo.key));
    expect(result.article).toMatchObject({ articleId: combo.articleId, kind: "combo", name: "Ćevapi meni", basePriceRsd: 700, priceCheck: false });
    expect(result.combo).toEqual({
      components: [
        { articleId: cevapi.articleId, key: cevapi.key, name: "Ćevapi", quantity: 1, unitPriceRsd: 650 },
        { articleId: lepinja.articleId, key: lepinja.key, name: "Lepinja", quantity: 2, unitPriceRsd: 60 },
      ],
      priceCheck: null,
    });
  });

  test("a changed component price flags 'Proveri cenu' with the component name; the combo price stays; resolvePriceCheck clears it", async () => {
    const world = await comboWorld();
    const { t, w, owner, combo, cevapi } = world;
    await setBase(world, cevapi.articleId, 650, 700);

    const flagged = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, combo.key));
    expect(flagged.article.basePriceRsd).toBe(700);
    expect(flagged.article.priceCheck).toBe(true);
    expect(flagged.combo?.priceCheck).toMatchObject({ changedNames: ["Ćevapi"], removedNames: [] });
    expect(typeof flagged.combo?.priceCheck?.since).toBe("number");
    expect(flagged.combo?.components[0]).toMatchObject({ name: "Ćevapi", unitPriceRsd: 700 });

    expect(await owner.mutation(api.menuCombos.resolvePriceCheck, { comboArticleId: combo.articleId })).toEqual({ ok: true });
    const cleared = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, combo.key));
    expect(cleared.combo?.priceCheck).toBeNull();
    expect(cleared.article).toMatchObject({ basePriceRsd: 700, priceCheck: false });
  });

  test("the changed component is shown by its CURRENT name", async () => {
    const world = await comboWorld();
    const { t, w, owner, combo, cevapi } = world;
    await setBase(world, cevapi.articleId, 650, 700);
    await owner.mutation(api.menuCatalog.updateArticleFields, {
      articleId: cevapi.articleId,
      expected: { name: "Ćevapi" },
      patch: { name: "Ćevapi 10" },
    });
    const flagged = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, combo.key));
    expect(flagged.combo?.priceCheck?.changedNames).toEqual(["Ćevapi 10"]);
  });

  test("an ordinary article has combo: null", async () => {
    const { t, w, cevapi } = await comboWorld();
    const result = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, cevapi.key));
    expect(result.combo).toBeNull();
    expect(result.article.kind).toBe("item");
  });

  test("a refused caller still gets null", async () => {
    const { t, w, combo } = await comboWorld();
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(await detail(t, userId, w.a.menuServiceId, combo.key)).toBeNull();
    }
  });
});

describe("menuStudio.articleDetail: translations", () => {
  test("article.translations and variants[].translations are null when nothing is translated", async () => {
    const { t, w, owner, cevapi } = await setup({ premium: false });
    await owner.mutation(api.menuArticleOptions.addVariant, { articleId: cevapi.articleId, name: "Mala", priceRsd: 450 });
    const result = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, cevapi.key));
    expect(result.article.translations).toBeNull();
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].translations).toBeNull();
  });

  test("they carry the confirmed text with its hash and a pending suggestion's absence", async () => {
    const { t, w, owner, cevapi } = await setup({ premium: false });
    const variant = await owner.mutation(api.menuArticleOptions.addVariant, { articleId: cevapi.articleId, name: "Mala", priceRsd: 450 });
    await owner.mutation(api.menuSettings.setLanguages, { menuServiceId: w.a.menuServiceId, translations: ["en"] });
    await owner.mutation(api.menuTranslations.setTranslation, {
      kind: "article",
      id: cevapi.articleId,
      lang: "en",
      field: "name",
      expected: null,
      value: "Cevapi",
    });
    await owner.mutation(api.menuTranslations.setTranslation, {
      kind: "variant",
      id: variant.variantId,
      lang: "en",
      field: "name",
      expected: null,
      value: "Small",
    });
    const result = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, cevapi.key));
    expect(result.article.translations).toMatchObject({ en: { status: "confirmed", name: "Cevapi" } });
    expect(result.article.translations?.en.nameHash).toEqual(expect.any(String));
    expect(result.variants[0].translations).toMatchObject({ en: { status: "confirmed", name: "Small" } });
  });
});

// =============================================================================
// searchArticles: kind
// =============================================================================

describe("menuStudio.searchArticles: kind", () => {
  test("results carry kind 'item' or 'combo'", async () => {
    const { t, w, owner, grillId, cevapi, lepinja } = await setup({ premium: false });
    const combo = await owner.mutation(api.menuCombos.createCombo, {
      sectionId: grillId,
      name: "Ćevapi meni",
      components: [
        { articleId: cevapi.articleId, quantity: 1 },
        { articleId: lepinja.articleId, quantity: 1 },
      ],
    });
    const found = orThrow(await as(t, w.editorId).query(api.menuStudio.searchArticles, { menuServiceId: w.a.menuServiceId, query: "cevapi" }));
    expect(Object.fromEntries(found.map((row) => [row.name, row.kind]))).toEqual({ "Ćevapi": "item", "Ćevapi meni": "combo" });
    expect(found.find((row) => row.kind === "combo")).toMatchObject({ articleId: combo.articleId, key: combo.key, basePriceRsd: null });
    expect(found.find((row) => row.kind === "item")).toMatchObject({ articleId: cevapi.articleId, basePriceRsd: 650 });
  });

  test("refused callers get null", async () => {
    const { t, w } = await setup({ premium: false });
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(await as(t, userId).query(api.menuStudio.searchArticles, { menuServiceId: w.a.menuServiceId, query: "cevapi" })).toBeNull();
    }
  });
});

// =============================================================================
// The Room service Premium gate
// =============================================================================

describe("Room service stays a Premium feature", () => {
  test("Standard: addCategory, updateSettings, setItemsMarkup and importWholeMenu throw plan/premium_required", async () => {
    const { t, w, owner } = await setup({ premium: false });
    const id = w.a.menuServiceId;
    await expectCode(owner.mutation(RS.addCategory, { menuServiceId: id, name: "Hrana u sobu" }), MENU_PLAN_ERROR.premiumRequired);
    await expectCode(
      owner.mutation(RS.updateSettings, { menuServiceId: id, expected: { markupPercent: null }, patch: { markupPercent: 10 } }),
      "plan/premium_required",
    );
    await expectCode(owner.mutation(RS.importWholeMenu, { menuServiceId: id }), "plan/premium_required");
    const rows = await t.run(async (ctx) => ctx.db.query("menuRoomServiceCategories").collect());
    expect(rows).toHaveLength(0);
  });

  test("Premium lost: setManualPrice, resolvePriceWarning and addItems throw plan/premium_required and change nothing", async () => {
    const world = await withRoomService(await setup());
    const { t, w, owner, burger, itemId, categoryId, beer } = world;
    await owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: null, manualPriceRsd: 600 });
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.accountId, { plan: "basic", updatedAt: Date.now() });
    });

    await expectCode(
      owner.mutation(RS.setManualPrice, { itemId, expectedManualPriceRsd: 600, manualPriceRsd: 700 }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await expectCode(owner.mutation(RS.resolvePriceWarning, { itemId, action: "keepManual" }), "plan/premium_required");
    await expectCode(owner.mutation(RS.addItems, { categoryId, articleIds: [beer.articleId] }), "plan/premium_required");
    const row = await t.run(async (ctx) => ctx.db.get(itemId));
    expect(row?.manualPriceRsd).toBe(600);
    // The base-price writer is not a Room service write: it still works on Standard.
    expect(await setBase(world, burger.articleId, 450, 460)).toMatchObject({ ok: true });
  });
});
