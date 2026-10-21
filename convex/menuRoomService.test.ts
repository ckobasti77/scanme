/// <reference types="vite/client" />

// ScanMe Menu V1 — K03: Room service (master §5.3, §21.4). A Premium channel of
// one Menu service that re-uses the shared articles: its own selection,
// categories, order and price rules (base → % markup → manual RS price → one
// fee per order). Covered here: the Premium gate (a fact of the ACCOUNT), roles,
// tenant isolation, the price model, the base-price warning, the selection
// (including the one-time import of "Kompletan meni") and the draft revision.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { ROOM_SERVICE_ERROR } from "../lib/menu/errors/room-service";
import { newMenuKey } from "../lib/menu/keys";
import { MENU_MAX_ROOM_SERVICE_BATCH } from "../lib/menu/limits";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addVenueToAccount,
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
type Caller = Pick<T, "mutation" | "query">;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const RS = api.menuRoomService;
const ROOM_CATEGORY = "Hrana u sobu";
const EMPTY_CATEGORY = "Pića u sobu";

// -----------------------------------------------------------------------------
// Error helpers
// -----------------------------------------------------------------------------

const CODE_PATTERN = /\b(?:menu|plan|room_service)\/[a-z_]+/;

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

/** The result of a call, or `{ error: code }` when it was refused. */
async function settle(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    return { error: errorCode(error) };
  }
}

// -----------------------------------------------------------------------------
// World
// -----------------------------------------------------------------------------

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

async function premium(
  t: T,
  accountId: Id<"accounts">,
  via: "plan" | "subscription" = "plan",
) {
  await t.run(async (ctx) => {
    await grantAccountPremium(ctx, { accountId, via });
  });
}

/** Premium is gone again (a plan Premium that ended or was withdrawn). */
async function downgradeToBasic(t: T, accountId: Id<"accounts">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(accountId, { plan: "basic", updatedAt: Date.now() });
  });
}

type Tenant = "a" | "b";

function tenantOf(w: MenuWorldSeed, tenant: Tenant) {
  return tenant === "a" ? { ...w.a, ownerId: w.ownerId } : { ...w.b, ownerId: w.otherOwnerId };
}

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
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

/**
 * The main menu ("Kompletan meni") of a tenant, built through the real
 * mutations by its owner. "Pića": Jelen pivo 200, Espreso 150.
 * "Hrana": Pljeskavica 450, Pita sa sirom 320.
 */
async function menuContent(t: T, w: MenuWorldSeed, tenant: Tenant = "a") {
  const x = tenantOf(w, tenant);
  const drinks = await addSection(t, x.ownerId, x.defaultPageId, "Pića");
  const food = await addSection(t, x.ownerId, x.defaultPageId, "Hrana");
  const beer = await quickAdd(t, x.ownerId, drinks.sectionId, "Jelen pivo", 200);
  const coffee = await quickAdd(t, x.ownerId, drinks.sectionId, "Espreso", 150);
  const burger = await quickAdd(t, x.ownerId, food.sectionId, "Pljeskavica", 450);
  const pita = await quickAdd(t, x.ownerId, food.sectionId, "Pita sa sirom", 320);
  return {
    drinksSectionId: drinks.sectionId,
    foodSectionId: food.sectionId,
    beerId: beer.articleId,
    coffeeId: coffee.articleId,
    burgerId: burger.articleId,
    pitaId: pita.articleId,
    beerPlacementId: beer.placementId,
    burgerPlacementId: burger.placementId,
  };
}

async function rsView(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const view = await as(t, userId).query(RS.get, { menuServiceId });
  if (!view) throw new Error("menuRoomService.get returned null");
  return view;
}
type RsView = Awaited<ReturnType<typeof rsView>>;

function allItems(view: RsView) {
  return view.categories.flatMap((category) => category.items);
}

function findItem(view: RsView, articleId: Id<"menuArticles">) {
  const item = allItems(view).find((candidate) => candidate.article.articleId === articleId);
  if (!item) throw new Error("the article is not in the Room service view");
  return item;
}

function itemIdOf(view: RsView, articleId: Id<"menuArticles">) {
  return findItem(view, articleId).itemId;
}

function namesIn(view: RsView, categoryId: Id<"menuRoomServiceCategories">) {
  const category = view.categories.find((candidate) => candidate.categoryId === categoryId);
  if (!category) throw new Error("category missing from the Room service view");
  return category.items.map((item) => item.article.name);
}

function categoryNames(view: RsView) {
  return view.categories.map((category) => category.name);
}

/**
 * Premium (unless told otherwise) + the main menu + Room service with two
 * categories: "Hrana u sobu" (Pljeskavica, Pita sa sirom) and an empty
 * "Pića u sobu". Espreso and Jelen pivo are NOT in Room service.
 */
async function rsFixture(
  t: T,
  w: MenuWorldSeed,
  tenant: Tenant = "a",
  options: { premium?: boolean } = {},
) {
  const x = tenantOf(w, tenant);
  if (options.premium !== false) await premium(t, x.accountId);
  const menu = await menuContent(t, w, tenant);
  const owner = as(t, x.ownerId);
  const room = await owner.mutation(RS.addCategory, {
    menuServiceId: x.menuServiceId,
    name: ROOM_CATEGORY,
  });
  const empty = await owner.mutation(RS.addCategory, {
    menuServiceId: x.menuServiceId,
    name: EMPTY_CATEGORY,
  });
  await owner.mutation(RS.addItems, {
    categoryId: room.categoryId,
    articleIds: [menu.burgerId, menu.pitaId],
  });
  const view = await rsView(t, x.ownerId, x.menuServiceId);
  return {
    ...x,
    ...menu,
    categoryId: room.categoryId,
    emptyCategoryId: empty.categoryId,
    burgerItemId: itemIdOf(view, menu.burgerId),
    pitaItemId: itemIdOf(view, menu.pitaId),
  };
}
type Fixture = Awaited<ReturnType<typeof rsFixture>>;

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  const state = await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
  if (!state) throw new Error("draft state missing");
  return state.revision;
}

/** Everything Room service writes for one service, to prove "nothing changed". */
async function rsRows(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => ({
    revision: (
      await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
        .unique()
    )?.revision,
    config: await ctx.db
      .query("menuRoomService")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    categories: await ctx.db
      .query("menuRoomServiceCategories")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    items: await ctx.db
      .query("menuRoomServiceItems")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}

async function featuresOf(t: T, menuServiceId: Id<"menuServices">) {
  const service = await t.run(async (ctx) => ctx.db.get(menuServiceId));
  if (!service) throw new Error("menu service missing");
  return service.features;
}

async function setMarkup(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  percent: number | null,
  expectedPercent: number | null = null,
) {
  return await as(t, userId).mutation(RS.updateSettings, {
    menuServiceId,
    expected: { markupPercent: expectedPercent },
    patch: { markupPercent: percent },
  });
}

async function setBase(
  t: T,
  userId: Id<"users">,
  articleId: Id<"menuArticles">,
  expectedPriceRsd: number | null,
  priceRsd: number | null,
) {
  return await as(t, userId).mutation(api.menuCatalog.setBasePrice, {
    articleId,
    expectedPriceRsd,
    priceRsd,
  });
}

async function setManual(
  t: T,
  userId: Id<"users">,
  itemId: Id<"menuRoomServiceItems">,
  expectedManualPriceRsd: number | null,
  manualPriceRsd: number | null,
) {
  return await as(t, userId).mutation(RS.setManualPrice, {
    itemId,
    expectedManualPriceRsd,
    manualPriceRsd,
  });
}

// -----------------------------------------------------------------------------
// All twelve Room service writes, addressed at one fixture
// -----------------------------------------------------------------------------

const WRITE_NAMES = [
  "updateSettings",
  "addCategory",
  "renameCategory",
  "moveCategory",
  "removeCategory",
  "addItems",
  "importWholeMenu",
  "moveItem",
  "removeItem",
  "setItemsMarkup",
  "setManualPrice",
  "resolvePriceWarning",
] as const;
type WriteName = (typeof WRITE_NAMES)[number];

function writesOf(caller: Caller, f: Fixture): Record<WriteName, () => Promise<unknown>> {
  return {
    updateSettings: () =>
      caller.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { markupPercent: null },
        patch: { markupPercent: 10 },
      }),
    addCategory: () =>
      caller.mutation(RS.addCategory, { menuServiceId: f.menuServiceId, name: "Novo" }),
    renameCategory: () =>
      caller.mutation(RS.renameCategory, {
        categoryId: f.categoryId,
        name: "Preimenovano",
        expectedName: ROOM_CATEGORY,
      }),
    moveCategory: () => caller.mutation(RS.moveCategory, { categoryId: f.categoryId, toIndex: 1 }),
    removeCategory: () =>
      caller.mutation(RS.removeCategory, { categoryId: f.emptyCategoryId }),
    addItems: () =>
      caller.mutation(RS.addItems, { categoryId: f.categoryId, articleIds: [f.coffeeId] }),
    importWholeMenu: () =>
      caller.mutation(RS.importWholeMenu, { menuServiceId: f.menuServiceId }),
    moveItem: () =>
      caller.mutation(RS.moveItem, { itemId: f.burgerItemId, toCategoryId: f.emptyCategoryId }),
    removeItem: () => caller.mutation(RS.removeItem, { itemId: f.burgerItemId }),
    setItemsMarkup: () =>
      caller.mutation(RS.setItemsMarkup, {
        menuServiceId: f.menuServiceId,
        itemIds: [f.burgerItemId],
        markupApplies: true,
      }),
    setManualPrice: () =>
      caller.mutation(RS.setManualPrice, {
        itemId: f.burgerItemId,
        expectedManualPriceRsd: null,
        manualPriceRsd: 600,
      }),
    resolvePriceWarning: () =>
      caller.mutation(RS.resolvePriceWarning, { itemId: f.burgerItemId, action: "keepManual" }),
  };
}

/** The refusal code of every write ( null = it succeeded ), in a readable record. */
async function writeCodes(caller: Caller, f: Fixture) {
  const writes = writesOf(caller, f);
  const codes = {} as Record<WriteName, string | null>;
  for (const name of WRITE_NAMES) codes[name] = await codeOf(writes[name]());
  return codes;
}

function everyWrite(code: string | null) {
  return Object.fromEntries(WRITE_NAMES.map((name) => [name, code]));
}

// =============================================================================
// A. The Premium gate
// =============================================================================

describe("A. the Premium gate", () => {
  test("Premium gone: every Room service write gives plan/premium_required for the owner and nothing changes", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await downgradeToBasic(t, w.a.accountId);
    const before = await rsRows(t, f.menuServiceId);

    expect(await writeCodes(as(t, w.ownerId), f)).toEqual(
      everyWrite(MENU_PLAN_ERROR.premiumRequired),
    );
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
  });

  test("a venue that never had Premium is refused the same way and gets no Room service row", async () => {
    const { t, w } = await setup();
    await menuContent(t, w, "a");
    const owner = as(t, w.ownerId);
    const id = w.a.menuServiceId;

    await expectCode(
      owner.mutation(RS.updateSettings, {
        menuServiceId: id,
        expected: { markupPercent: null },
        patch: { markupPercent: 10 },
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await expectCode(
      owner.mutation(RS.addCategory, { menuServiceId: id, name: "Hrana" }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await expectCode(
      owner.mutation(RS.importWholeMenu, { menuServiceId: id }),
      MENU_PLAN_ERROR.premiumRequired,
    );

    const rows = await rsRows(t, id);
    expect(rows.config).toEqual([]);
    expect(rows.categories).toEqual([]);
    expect(rows.items).toEqual([]);
  });

  test("get still answers on Standard, with available false and the empty shape", async () => {
    const { t, w } = await setup();
    await menuContent(t, w, "a");
    const view = await rsView(t, w.ownerId, w.a.menuServiceId);
    expect(view).toMatchObject({
      enabled: false,
      available: false,
      settings: { markupPercent: null, markupScope: "all", deliveryFeeRsd: null },
      categories: [],
      notInRoomService: 4,
      truncated: false,
    });
  });

  test("get keeps showing the existing Room service once Premium is gone, flagged available false", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    expect((await rsView(t, w.ownerId, f.menuServiceId)).available).toBe(true);

    await downgradeToBasic(t, w.a.accountId);
    const view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.available).toBe(false);
    expect(categoryNames(view)).toEqual([ROOM_CATEGORY, EMPTY_CATEGORY]);
    expect(namesIn(view, f.categoryId)).toEqual(["Pljeskavica", "Pita sa sirom"]);
  });

  test("setFeature roomService ON is refused on Standard and works right after the account gets Premium", async () => {
    const { t, w } = await setup();
    const owner = as(t, w.ownerId);
    const id = w.a.menuServiceId;
    const enable = { menuServiceId: id, feature: "roomService" as const, enabled: true };

    await expectCode(owner.mutation(api.menuServices.setFeature, enable), MENU_PLAN_ERROR.premiumRequired);
    expect((await featuresOf(t, id)).roomService).toBe(false);

    await premium(t, w.a.accountId);
    expect(await owner.mutation(api.menuServices.setFeature, enable)).toEqual({ ok: true });
    expect((await featuresOf(t, id)).roomService).toBe(true);
    const view = await rsView(t, w.ownerId, id);
    expect(view).toMatchObject({ enabled: true, available: true });
  });

  test("switching Room service OFF still works after Premium is gone; switching it ON again does not", async () => {
    const { t, w } = await setup();
    const owner = as(t, w.ownerId);
    const id = w.a.menuServiceId;
    await premium(t, w.a.accountId);
    await owner.mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "roomService",
      enabled: true,
    });
    expect((await featuresOf(t, id)).roomService).toBe(true);

    await downgradeToBasic(t, w.a.accountId);
    expect(
      await owner.mutation(api.menuServices.setFeature, {
        menuServiceId: id,
        feature: "roomService",
        enabled: false,
      }),
    ).toEqual({ ok: true });
    expect((await featuresOf(t, id)).roomService).toBe(false);

    await expectCode(
      owner.mutation(api.menuServices.setFeature, {
        menuServiceId: id,
        feature: "roomService",
        enabled: true,
      }),
      MENU_PLAN_ERROR.premiumRequired,
    );
  });

  test("Premium is a fact of the ACCOUNT: one grant makes both venues of account A Premium, account B stays Standard", async () => {
    const { t, w } = await setup();
    const second = await t.run(async (ctx) =>
      addVenueToAccount(ctx, {
        accountId: w.a.accountId,
        name: "Kafana kod Mike - Filijala",
        slug: "kafana-kod-mike-filijala",
        actorUserId: w.adminId,
      }),
    );
    const owner = as(t, w.ownerId);
    const otherOwner = as(t, w.otherOwnerId);

    for (const menuServiceId of [w.a.menuServiceId, second.menuServiceId]) {
      await expectCode(
        owner.mutation(RS.addCategory, { menuServiceId, name: "Hrana" }),
        MENU_PLAN_ERROR.premiumRequired,
      );
    }

    await premium(t, w.a.accountId);

    for (const menuServiceId of [w.a.menuServiceId, second.menuServiceId]) {
      const created = await owner.mutation(RS.addCategory, { menuServiceId, name: "Hrana" });
      expect(created.key).toMatch(/^rc_[0-9a-z]{12}$/);
      expect((await rsView(t, w.ownerId, menuServiceId)).available).toBe(true);
    }
    await expectCode(
      otherOwner.mutation(RS.addCategory, { menuServiceId: w.b.menuServiceId, name: "Hrana" }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect((await rsView(t, w.otherOwnerId, w.b.menuServiceId)).available).toBe(false);
  });

  test("a subscription Premium opens the gate like a plan Premium", async () => {
    const { t, w } = await setup();
    const owner = as(t, w.ownerId);
    await expectCode(
      owner.mutation(RS.addCategory, { menuServiceId: w.a.menuServiceId, name: "Hrana" }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await premium(t, w.a.accountId, "subscription");
    const created = await owner.mutation(RS.addCategory, {
      menuServiceId: w.a.menuServiceId,
      name: "Hrana",
    });
    expect(created.key).toMatch(/^rc_/);
    expect((await rsView(t, w.ownerId, w.a.menuServiceId)).available).toBe(true);
  });
});

// =============================================================================
// B. Roles
// =============================================================================

describe("B. roles", () => {
  test("owner, manager, editor and the ScanMe admin can write Room service", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const who = {
      owner: w.ownerId,
      manager: w.managerId,
      editor: w.editorId,
      admin: w.adminId,
    };
    for (const [label, userId] of Object.entries(who)) {
      const created = await as(t, userId).mutation(RS.addCategory, {
        menuServiceId: w.a.menuServiceId,
        name: `Kategorija ${label}`,
      });
      expect(created.key, label).toMatch(/^rc_[0-9a-z]{12}$/);
    }
    const view = await rsView(t, w.ownerId, w.a.menuServiceId);
    expect(categoryNames(view)).toEqual([
      "Kategorija owner",
      "Kategorija manager",
      "Kategorija editor",
      "Kategorija admin",
    ]);
  });

  test("finance, view-only and a stranger get menu/not_found from every write and change nothing", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const before = await rsRows(t, f.menuServiceId);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      expect(await writeCodes(as(t, userId), f)).toEqual(everyWrite(MENU_ERROR.notFound));
    }
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
  });

  test("nobody signed in gets menu/unauthenticated from every write", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const before = await rsRows(t, f.menuServiceId);

    expect(await writeCodes(t, f)).toEqual(everyWrite(MENU_ERROR.unauthenticated));
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
  });

  test("setFeature needs features.edit: owner and manager may, the editor gets menu/forbidden", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const id = w.a.menuServiceId;
    const toggle = (enabled: boolean) => ({
      menuServiceId: id,
      feature: "roomService" as const,
      enabled,
    });

    await expectCode(
      as(t, w.editorId).mutation(api.menuServices.setFeature, toggle(true)),
      MENU_ERROR.forbidden,
    );
    expect((await featuresOf(t, id)).roomService).toBe(false);

    expect(await as(t, w.managerId).mutation(api.menuServices.setFeature, toggle(true))).toEqual({
      ok: true,
    });
    expect((await featuresOf(t, id)).roomService).toBe(true);

    expect(await as(t, w.ownerId).mutation(api.menuServices.setFeature, toggle(false))).toEqual({
      ok: true,
    });
    expect((await featuresOf(t, id)).roomService).toBe(false);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      await expectCode(
        as(t, userId).mutation(api.menuServices.setFeature, toggle(true)),
        MENU_ERROR.notFound,
      );
    }
    expect((await featuresOf(t, id)).roomService).toBe(false);
  });

  test("get is an object for owner, manager, editor and admin and null for everyone else", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const view = await as(t, userId).query(RS.get, { menuServiceId: f.menuServiceId });
      expect(view).not.toBeNull();
      expect(view?.categories.map((category) => category.name)).toEqual([
        ROOM_CATEGORY,
        EMPTY_CATEGORY,
      ]);
    }
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      expect(await as(t, userId).query(RS.get, { menuServiceId: f.menuServiceId })).toBeNull();
    }
    expect(await t.query(RS.get, { menuServiceId: f.menuServiceId })).toBeNull();
  });

  test("with client editing switched off the owner, manager and editor get menu/editing_disabled; the admin still writes; reading stays open", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const before = await rsRows(t, f.menuServiceId);

    for (const userId of [w.ownerId, w.managerId, w.editorId]) {
      expect(await writeCodes(as(t, userId), f)).toEqual(everyWrite(MENU_ERROR.editingDisabled));
      expect(await as(t, userId).query(RS.get, { menuServiceId: f.menuServiceId })).not.toBeNull();
    }
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);

    const created = await as(t, w.adminId).mutation(RS.addCategory, {
      menuServiceId: f.menuServiceId,
      name: "Podrška",
    });
    expect(created.key).toMatch(/^rc_/);
  });
});

// =============================================================================
// C. Tenant isolation
// =============================================================================

describe("C. tenant isolation", () => {
  test("B's owner cannot reach A's Room service with any write, A's owner cannot reach B's", async () => {
    const { t, w } = await setup();
    const fa = await rsFixture(t, w, "a");
    const fb = await rsFixture(t, w, "b");
    const beforeA = await rsRows(t, fa.menuServiceId);
    const beforeB = await rsRows(t, fb.menuServiceId);

    expect(await writeCodes(as(t, w.otherOwnerId), fa)).toEqual(everyWrite(MENU_ERROR.notFound));
    expect(await writeCodes(as(t, w.ownerId), fb)).toEqual(everyWrite(MENU_ERROR.notFound));

    expect(await rsRows(t, fa.menuServiceId)).toEqual(beforeA);
    expect(await rsRows(t, fb.menuServiceId)).toEqual(beforeB);
  });

  test("B's owner adding a category to A's service, renaming or removing A's category gets menu/not_found", async () => {
    const { t, w } = await setup();
    const fa = await rsFixture(t, w, "a");
    await rsFixture(t, w, "b");
    const otherOwner = as(t, w.otherOwnerId);
    const before = await rsRows(t, fa.menuServiceId);

    await expectCode(
      otherOwner.mutation(RS.addCategory, { menuServiceId: fa.menuServiceId, name: "Upad" }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      otherOwner.mutation(RS.renameCategory, {
        categoryId: fa.categoryId,
        name: "Upad",
        expectedName: ROOM_CATEGORY,
      }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      otherOwner.mutation(RS.removeCategory, { categoryId: fa.emptyCategoryId }),
      MENU_ERROR.notFound,
    );
    expect(await rsRows(t, fa.menuServiceId)).toEqual(before);
  });

  test("addItems with an article of another tenant is menu/not_found and writes nothing, even beside a valid article", async () => {
    const { t, w } = await setup();
    const fa = await rsFixture(t, w, "a");
    const fb = await rsFixture(t, w, "b");
    const owner = as(t, w.ownerId);
    const before = await rsRows(t, fa.menuServiceId);
    const beforeB = await rsRows(t, fb.menuServiceId);

    await expectCode(
      owner.mutation(RS.addItems, { categoryId: fa.categoryId, articleIds: [fb.coffeeId] }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      owner.mutation(RS.addItems, {
        categoryId: fa.categoryId,
        articleIds: [fa.coffeeId, fb.coffeeId],
      }),
      MENU_ERROR.notFound,
    );
    expect(await rsRows(t, fa.menuServiceId)).toEqual(before);
    expect(await rsRows(t, fb.menuServiceId)).toEqual(beforeB);
    expect(allItems(await rsView(t, w.ownerId, fa.menuServiceId)).map((i) => i.article.name)).toEqual([
      "Pljeskavica",
      "Pita sa sirom",
    ]);
  });

  test("moveItem into another tenant's category (or before another tenant's item) is menu/not_found", async () => {
    const { t, w } = await setup();
    const fa = await rsFixture(t, w, "a");
    const fb = await rsFixture(t, w, "b");
    const owner = as(t, w.ownerId);
    const beforeA = await rsRows(t, fa.menuServiceId);
    const beforeB = await rsRows(t, fb.menuServiceId);

    await expectCode(
      owner.mutation(RS.moveItem, { itemId: fa.burgerItemId, toCategoryId: fb.categoryId }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      owner.mutation(RS.moveItem, {
        itemId: fa.burgerItemId,
        toCategoryId: fa.categoryId,
        beforeItemId: fb.burgerItemId,
      }),
      MENU_ERROR.notFound,
    );
    expect(await rsRows(t, fa.menuServiceId)).toEqual(beforeA);
    expect(await rsRows(t, fb.menuServiceId)).toEqual(beforeB);
  });

  test("setItemsMarkup with another tenant's item id on my service is menu/not_found and leaves their item alone", async () => {
    const { t, w } = await setup();
    const fa = await rsFixture(t, w, "a");
    const fb = await rsFixture(t, w, "b");
    const owner = as(t, w.ownerId);
    const beforeB = await rsRows(t, fb.menuServiceId);

    await expectCode(
      owner.mutation(RS.setItemsMarkup, {
        menuServiceId: fa.menuServiceId,
        itemIds: [fb.burgerItemId],
        markupApplies: true,
      }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      owner.mutation(RS.setItemsMarkup, {
        menuServiceId: fa.menuServiceId,
        itemIds: [fa.burgerItemId, fb.burgerItemId],
        markupApplies: true,
      }),
      MENU_ERROR.notFound,
    );
    expect(await rsRows(t, fb.menuServiceId)).toEqual(beforeB);
    expect(findItem(await rsView(t, w.ownerId, fa.menuServiceId), fa.burgerId).markupApplies).toBe(
      false,
    );
  });

  test("get of another tenant's service is null in both directions", async () => {
    const { t, w } = await setup();
    const fa = await rsFixture(t, w, "a");
    const fb = await rsFixture(t, w, "b");
    expect(await as(t, w.otherOwnerId).query(RS.get, { menuServiceId: fa.menuServiceId })).toBeNull();
    expect(await as(t, w.ownerId).query(RS.get, { menuServiceId: fb.menuServiceId })).toBeNull();
    expect(await as(t, w.ownerId).query(RS.get, { menuServiceId: fa.menuServiceId })).not.toBeNull();
  });
});

// =============================================================================
// D. The price model
// =============================================================================

describe("D. price model", () => {
  test("a 15 % markup on all articles: 450 RSD shows 518 RSD, origin computed; no base price stays without a price", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);

    expect(await setMarkup(t, w.ownerId, f.menuServiceId, 15)).toEqual({ ok: true });

    // An article without a base price joins Room service.
    const water = await quickAdd(t, w.ownerId, f.foodSectionId, "Voda");
    await owner.mutation(RS.addItems, { categoryId: f.categoryId, articleIds: [water.articleId] });

    const view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.settings).toEqual({ markupPercent: 15, markupScope: "all", deliveryFeeRsd: null });
    expect(findItem(view, f.burgerId)).toMatchObject({
      basePriceRsd: 450,
      priceRsd: 518,
      origin: "computed",
      manualPriceRsd: null,
      warning: null,
    });
    expect(findItem(view, f.pitaId)).toMatchObject({ basePriceRsd: 320, priceRsd: 368, origin: "computed" });
    expect(findItem(view, water.articleId)).toMatchObject({
      basePriceRsd: null,
      priceRsd: null,
      origin: "inherited",
    });

    const rows = await rsRows(t, f.menuServiceId);
    expect(rows.config).toHaveLength(1);
    expect(rows.config[0]).toMatchObject({ markupBps: 1500, markupScope: "all" });
  });

  test("without any markup every item inherits the article's base price", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(findItem(view, f.burgerId)).toMatchObject({ priceRsd: 450, origin: "inherited" });
    expect(findItem(view, f.pitaId)).toMatchObject({ priceRsd: 320, origin: "inherited" });
  });

  test("scope 'selected': items inherit the base price until they are selected with setItemsMarkup", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);

    expect(
      await owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { markupScope: "all" },
        patch: { markupScope: "selected" },
      }),
    ).toEqual({ ok: true });
    let view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.settings).toEqual({ markupPercent: 15, markupScope: "selected", deliveryFeeRsd: null });
    expect(findItem(view, f.burgerId)).toMatchObject({ priceRsd: 450, origin: "inherited" });
    expect(findItem(view, f.pitaId)).toMatchObject({ priceRsd: 320, origin: "inherited" });

    const select = { menuServiceId: f.menuServiceId, itemIds: [f.burgerItemId] };
    expect(await owner.mutation(RS.setItemsMarkup, { ...select, markupApplies: true })).toEqual({
      changed: 1,
    });
    view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(findItem(view, f.burgerId)).toMatchObject({
      priceRsd: 518,
      origin: "computed",
      markupApplies: true,
    });
    expect(findItem(view, f.pitaId)).toMatchObject({ priceRsd: 320, origin: "inherited" });

    // Selecting again changes nothing.
    expect(await owner.mutation(RS.setItemsMarkup, { ...select, markupApplies: true })).toEqual({
      changed: 0,
    });

    // Deselecting goes back to the base price.
    expect(await owner.mutation(RS.setItemsMarkup, { ...select, markupApplies: false })).toEqual({
      changed: 1,
    });
    view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(findItem(view, f.burgerId)).toMatchObject({ priceRsd: 450, origin: "inherited" });

    await expectCode(
      owner.mutation(RS.setItemsMarkup, {
        menuServiceId: f.menuServiceId,
        itemIds: [],
        markupApplies: true,
      }),
      MENU_ERROR.invalidInput,
    );
  });

  test("scope 'all' ignores the per-item selection", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    const view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(findItem(view, f.burgerId)).toMatchObject({ markupApplies: false, priceRsd: 518, origin: "computed" });
  });

  test("a manual price wins and stays exactly as entered (599 stays 599 with a markup); null goes back to the rule", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);

    expect(await setManual(t, w.ownerId, f.burgerItemId, null, 600)).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 600,
      origin: "manual",
      manualPriceRsd: 600,
      basePriceRsd: 450,
    });

    expect(await setManual(t, w.ownerId, f.burgerItemId, 600, 599)).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 599,
      origin: "manual",
    });
    // Another item is untouched.
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.pitaId)).toMatchObject({
      priceRsd: 368,
      origin: "computed",
    });

    expect(await setManual(t, w.ownerId, f.burgerItemId, 599, null)).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 518,
      origin: "computed",
      manualPriceRsd: null,
    });
  });

  test("a manual price wins without any markup too, and does not follow later markup changes", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 600,
      origin: "manual",
    });
    await setMarkup(t, w.ownerId, f.menuServiceId, 50);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 600,
      origin: "manual",
    });
  });

  test("setManualPrice with a stale expected price returns the conflict and writes nothing", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    const before = await rsRows(t, f.menuServiceId);

    const result = await setManual(t, w.ownerId, f.burgerItemId, 700, 650);
    expect(result).toMatchObject({
      ok: false,
      conflicts: ["manualPriceRsd"],
      current: { manualPriceRsd: 600 },
    });
    // The editor thought there was no manual price at all.
    expect(await setManual(t, w.ownerId, f.burgerItemId, null, 650)).toMatchObject({
      ok: false,
      conflicts: ["manualPriceRsd"],
    });
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId).manualPriceRsd).toBe(600);
  });

  test("updateSettings with stale expected values returns the conflict and writes nothing (all or nothing)", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    await owner.mutation(RS.updateSettings, {
      menuServiceId: f.menuServiceId,
      expected: { deliveryFeeRsd: null },
      patch: { deliveryFeeRsd: 100 },
    });
    const before = await rsRows(t, f.menuServiceId);

    expect(await setMarkup(t, w.ownerId, f.menuServiceId, 25, 20)).toMatchObject({
      ok: false,
      conflicts: ["markupPercent"],
      current: { markupPercent: null },
    });
    // One stale key rejects the whole patch, the fresh key is not applied either.
    expect(
      await owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { markupPercent: null, deliveryFeeRsd: 999 },
        patch: { markupPercent: 25, deliveryFeeRsd: 250 },
      }),
    ).toMatchObject({ ok: false, conflicts: ["deliveryFeeRsd"], current: { deliveryFeeRsd: 100 } });
    expect(
      await owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { markupScope: "selected" },
        patch: { markupScope: "all" },
      }),
    ).toMatchObject({ ok: false, conflicts: ["markupScope"] });

    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
    expect((await rsView(t, w.ownerId, f.menuServiceId)).settings).toEqual({
      markupPercent: null,
      markupScope: "all",
      deliveryFeeRsd: 100,
    });
  });

  test("invalid markups, fees, manual prices and patches are menu/invalid_input and write nothing", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const before = await rsRows(t, f.menuServiceId);

    for (const percent of [300.01, -1, 1.234, 301]) {
      await expectCode(setMarkup(t, w.ownerId, f.menuServiceId, percent), MENU_ERROR.invalidInput);
    }
    for (const fee of [-5, 1.5, 1_000_001]) {
      await expectCode(
        owner.mutation(RS.updateSettings, {
          menuServiceId: f.menuServiceId,
          expected: { deliveryFeeRsd: null },
          patch: { deliveryFeeRsd: fee },
        }),
        MENU_ERROR.invalidInput,
      );
    }
    for (const price of [1.5, -1, 1_000_001]) {
      await expectCode(
        setManual(t, w.ownerId, f.burgerItemId, null, price),
        MENU_ERROR.invalidInput,
      );
    }
    // A key in the patch must also be in expected; an empty patch is refused.
    await expectCode(
      owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: {},
        patch: { markupPercent: 10 },
      }),
      MENU_ERROR.invalidInput,
    );
    await expectCode(
      owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { markupPercent: null },
        patch: { markupPercent: 10, markupScope: "selected" },
      }),
      MENU_ERROR.invalidInput,
    );
    await expectCode(
      owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { markupPercent: null },
        patch: {},
      }),
      MENU_ERROR.invalidInput,
    );

    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
  });

  test("markup boundaries: 0.01, 0.29, 12.5 and 300 are accepted exactly", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    let expected: number | null = null;
    for (const percent of [0.01, 0.29, 12.5, 300]) {
      expect(await setMarkup(t, w.ownerId, f.menuServiceId, percent, expected)).toEqual({ ok: true });
      expect((await rsView(t, w.ownerId, f.menuServiceId)).settings.markupPercent).toBe(percent);
      expected = percent;
    }
    // 450 + 300 % = 1800.
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 1800,
      origin: "computed",
    });
  });

  test("delivery fee 200 shows in settings and changes no item price; 0 and null remove it", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const setFee = (expected: number | null, fee: number | null) =>
      owner.mutation(RS.updateSettings, {
        menuServiceId: f.menuServiceId,
        expected: { deliveryFeeRsd: expected },
        patch: { deliveryFeeRsd: fee },
      });

    expect(await setFee(null, 200)).toEqual({ ok: true });
    let view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.settings.deliveryFeeRsd).toBe(200);
    expect(findItem(view, f.burgerId).priceRsd).toBe(450);

    expect(await setFee(200, 0)).toEqual({ ok: true });
    view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.settings.deliveryFeeRsd).toBeNull();
    expect((await rsRows(t, f.menuServiceId)).config[0].deliveryFeeRsd).toBeUndefined();

    expect(await setFee(null, 200)).toEqual({ ok: true });
    expect((await rsView(t, w.ownerId, f.menuServiceId)).settings.deliveryFeeRsd).toBe(200);
    expect(await setFee(200, null)).toEqual({ ok: true });
    expect((await rsView(t, w.ownerId, f.menuServiceId)).settings.deliveryFeeRsd).toBeNull();
    expect((await rsRows(t, f.menuServiceId)).config[0].deliveryFeeRsd).toBeUndefined();
  });

  test("markup 0 and null remove the markup and show as null", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);

    expect(await setMarkup(t, w.ownerId, f.menuServiceId, 0, 15)).toEqual({ ok: true });
    let view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.settings.markupPercent).toBeNull();
    expect(findItem(view, f.burgerId)).toMatchObject({ priceRsd: 450, origin: "inherited" });
    expect((await rsRows(t, f.menuServiceId)).config[0].markupBps).toBeUndefined();

    await setMarkup(t, w.ownerId, f.menuServiceId, 10, null);
    expect(await setMarkup(t, w.ownerId, f.menuServiceId, null, 10)).toEqual({ ok: true });
    view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(view.settings.markupPercent).toBeNull();
    expect(findItem(view, f.burgerId)).toMatchObject({ priceRsd: 450, origin: "inherited" });
  });
});

// =============================================================================
// E. A base-price change (menuCatalog.setBasePrice)
// =============================================================================

describe("E. base price change", () => {
  test("an item without a manual price simply follows: 450 -> 500 with 15 % shows 575, no warning", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);

    expect(await setBase(t, w.ownerId, f.burgerId, 450, 500)).toEqual({ ok: true });
    const item = findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId);
    expect(item).toMatchObject({
      basePriceRsd: 500,
      priceRsd: 575,
      origin: "computed",
      manualPriceRsd: null,
      warning: null,
    });
    const row = await t.run(async (ctx) => ctx.db.get(f.burgerItemId));
    expect(row?.priceWarning).toBeUndefined();
  });

  test("clearing the base price of an item without a manual price leaves it without a price", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    await setBase(t, w.ownerId, f.burgerId, 450, null);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: null,
      priceRsd: null,
      origin: "inherited",
      warning: null,
    });
  });

  test("an item with a manual price keeps it and shows the old/new base warning", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);

    await setBase(t, w.ownerId, f.burgerId, 450, 500);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: 500,
      priceRsd: 600,
      origin: "manual",
      manualPriceRsd: 600,
      warning: {
        oldBaseRsd: 450,
        newBaseRsd: 500,
        roomServicePriceRsd: 600,
        recomputedPriceRsd: 575,
      },
    });
  });

  test("a second change keeps the first old base; changing back to it clears the warning", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);

    await setBase(t, w.ownerId, f.burgerId, 450, 500);
    await setBase(t, w.ownerId, f.burgerId, 500, 520);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 600,
      warning: { oldBaseRsd: 450, newBaseRsd: 520, roomServicePriceRsd: 600, recomputedPriceRsd: 598 },
    });

    await setBase(t, w.ownerId, f.burgerId, 520, 450);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: 450,
      priceRsd: 600,
      origin: "manual",
      warning: null,
    });
  });

  test("clearing the base price of an item with a manual price keeps the manual price and warns", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    await setBase(t, w.ownerId, f.burgerId, 450, null);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: null,
      priceRsd: 600,
      origin: "manual",
      warning: { oldBaseRsd: 450, newBaseRsd: null, roomServicePriceRsd: 600, recomputedPriceRsd: null },
    });
  });

  test("resolvePriceWarning keepManual keeps the manual price and clears the warning", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    await setBase(t, w.ownerId, f.burgerId, 450, 500);

    expect(
      await as(t, w.ownerId).mutation(RS.resolvePriceWarning, {
        itemId: f.burgerItemId,
        action: "keepManual",
      }),
    ).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: 500,
      priceRsd: 600,
      origin: "manual",
      manualPriceRsd: 600,
      warning: null,
    });
    const row = await t.run(async (ctx) => ctx.db.get(f.burgerItemId));
    expect(row?.priceWarning).toBeUndefined();
    expect(row?.manualPriceRsd).toBe(600);
  });

  test("resolvePriceWarning recomputeFromMarkup drops the manual price: the price follows the CURRENT base", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    await setBase(t, w.ownerId, f.burgerId, 450, 500);
    await setBase(t, w.ownerId, f.burgerId, 500, 520);

    expect(
      await as(t, w.ownerId).mutation(RS.resolvePriceWarning, {
        itemId: f.burgerItemId,
        action: "recomputeFromMarkup",
      }),
    ).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: 520,
      priceRsd: 598,
      origin: "computed",
      manualPriceRsd: null,
      warning: null,
    });
    const row = await t.run(async (ctx) => ctx.db.get(f.burgerItemId));
    expect(row?.manualPriceRsd).toBeUndefined();
    expect(row?.priceWarning).toBeUndefined();
  });

  test("resolvePriceWarning without a warning is an ok no-op", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    const before = await rsRows(t, f.menuServiceId);

    for (const action of ["keepManual", "recomputeFromMarkup"] as const) {
      expect(
        await as(t, w.ownerId).mutation(RS.resolvePriceWarning, { itemId: f.burgerItemId, action }),
      ).toEqual({ ok: true });
    }
    // Nothing was resolved, so the manual price is still there.
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId).manualPriceRsd).toBe(600);
  });

  test("setManualPrice clears a pending warning, with the same price or a new one", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setMarkup(t, w.ownerId, f.menuServiceId, 15);
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);

    await setBase(t, w.ownerId, f.burgerId, 450, 500);
    expect(await setManual(t, w.ownerId, f.burgerItemId, 600, 600)).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 600,
      origin: "manual",
      warning: null,
    });

    await setBase(t, w.ownerId, f.burgerId, 500, 540);
    expect(await setManual(t, w.ownerId, f.burgerItemId, 600, 610)).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      priceRsd: 610,
      origin: "manual",
      warning: null,
    });

    // Removing the manual price also clears a pending warning.
    await setBase(t, w.ownerId, f.burgerId, 540, 560);
    expect(await setManual(t, w.ownerId, f.burgerItemId, 610, null)).toEqual({ ok: true });
    expect(findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId)).toMatchObject({
      basePriceRsd: 560,
      priceRsd: 644,
      origin: "computed",
      warning: null,
    });
  });

  test("the article keeps ONE name and description: renaming it shows in Room service, no copy lives there", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);

    expect(
      await owner.mutation(api.menuCatalog.updateArticleFields, {
        articleId: f.burgerId,
        expected: { name: "Pljeskavica", description: null },
        patch: { name: "Pljeskavica sa kajmakom", description: "Na žaru, sa lukom" },
      }),
    ).toEqual({ ok: true });

    const item = findItem(await rsView(t, w.ownerId, f.menuServiceId), f.burgerId);
    expect(item.article).toMatchObject({
      articleId: f.burgerId,
      name: "Pljeskavica sa kajmakom",
      description: "Na žaru, sa lukom",
    });

    const row = await t.run(async (ctx) => ctx.db.get(f.burgerItemId));
    expect(Object.keys(row ?? {}).filter((key) => /name|description/i.test(key))).toEqual([]);

    const page = await owner.query(api.menuCatalog.pageContent, { pageId: f.defaultPageId });
    const shown = page?.sections.flatMap((section) => section.placements.map((p) => p.article.name));
    expect(shown).toContain("Pljeskavica sa kajmakom");
  });
});

// =============================================================================
// F. Selection
// =============================================================================

describe("F. selection", () => {
  test("addItems adds in the given order, collapses repeats and counts articles already in Room service", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);

    expect(
      await owner.mutation(RS.addItems, {
        categoryId: f.emptyCategoryId,
        articleIds: [f.coffeeId, f.beerId, f.coffeeId],
      }),
    ).toEqual({ added: 2, alreadyIn: 0 });
    let view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(namesIn(view, f.emptyCategoryId)).toEqual(["Espreso", "Jelen pivo"]);

    // Already in Room service: in the same category or in another one.
    expect(
      await owner.mutation(RS.addItems, {
        categoryId: f.emptyCategoryId,
        articleIds: [f.burgerId, f.pitaId, f.coffeeId],
      }),
    ).toEqual({ added: 0, alreadyIn: 3 });
    view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(namesIn(view, f.emptyCategoryId)).toEqual(["Espreso", "Jelen pivo"]);
    expect(namesIn(view, f.categoryId)).toEqual(["Pljeskavica", "Pita sa sirom"]);

    // A new article beside an existing one is appended at the end.
    const stew = await quickAdd(t, w.ownerId, f.foodSectionId, "Gulaš", 500);
    expect(
      await owner.mutation(RS.addItems, {
        categoryId: f.categoryId,
        articleIds: [f.beerId, stew.articleId],
      }),
    ).toEqual({ added: 1, alreadyIn: 1 });
    expect(namesIn(await rsView(t, w.ownerId, f.menuServiceId), f.categoryId)).toEqual([
      "Pljeskavica",
      "Pita sa sirom",
      "Gulaš",
    ]);

    // An article is in Room service exactly once.
    const rows = await rsRows(t, f.menuServiceId);
    const articleIds = rows.items.map((item) => item.articleId);
    expect(new Set(articleIds).size).toBe(articleIds.length);
    expect(articleIds).toHaveLength(5);
  });

  test("addItems takes 1 to 200 distinct articles per call", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const many = await t.run(async (ctx) => {
      const now = Date.now();
      const ids: Id<"menuArticles">[] = [];
      for (let index = 0; index <= MENU_MAX_ROOM_SERVICE_BATCH; index += 1) {
        ids.push(
          await ctx.db.insert("menuArticles", {
            menuServiceId: w.a.menuServiceId,
            key: newMenuKey("article"),
            kind: "item",
            name: `Artikal ${index}`,
            nameNormalized: `artikal ${index}`,
            mediaMode: "none",
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      return ids;
    });
    expect(many).toHaveLength(MENU_MAX_ROOM_SERVICE_BATCH + 1);
    const before = await rsRows(t, f.menuServiceId);

    await expectCode(
      owner.mutation(RS.addItems, { categoryId: f.emptyCategoryId, articleIds: [] }),
      MENU_ERROR.invalidInput,
    );
    await expectCode(
      owner.mutation(RS.addItems, { categoryId: f.emptyCategoryId, articleIds: many }),
      MENU_ERROR.invalidInput,
    );
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);

    expect(
      await owner.mutation(RS.addItems, {
        categoryId: f.emptyCategoryId,
        articleIds: many.slice(0, MENU_MAX_ROOM_SERVICE_BATCH),
      }),
    ).toEqual({ added: MENU_MAX_ROOM_SERVICE_BATCH, alreadyIn: 0 });
  });

  test("importWholeMenu copies visible sections and visible placements, in order, and skips the hidden ones", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const m = await menuContent(t, w, "a");
    const owner = as(t, w.ownerId);
    const juice = await quickAdd(t, w.ownerId, m.drinksSectionId, "Sok od jabuke", 120);
    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: juice.placementId,
      visibility: "hidden",
    });
    const secret = await addSection(t, w.ownerId, w.a.defaultPageId, "Tajni meni");
    await quickAdd(t, w.ownerId, secret.sectionId, "Torta", 300);
    await t.run(async (ctx) => {
      await ctx.db.patch(secret.sectionId, { visibility: "hidden" });
    });

    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: w.a.menuServiceId })).toEqual({
      categoriesCreated: 2,
      itemsAdded: 4,
      alreadyIn: 0,
    });

    const view = await rsView(t, w.ownerId, w.a.menuServiceId);
    expect(
      view.categories.map((category) => ({
        name: category.name,
        items: category.items.map((item) => item.article.name),
      })),
    ).toEqual([
      { name: "Pića", items: ["Jelen pivo", "Espreso"] },
      { name: "Hrana", items: ["Pljeskavica", "Pita sa sirom"] },
    ]);
    // 6 articles in the menu, 4 copied: the hidden placement and the hidden section are missing.
    expect(view.notInRoomService).toBe(2);
    expect(allItems(view).every((item) => item.markupApplies === false)).toBe(true);
  });

  test("importWholeMenu re-uses a Room service category with the same name; a second call adds nothing; later menu changes are not mirrored", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const m = await menuContent(t, w, "a");
    const owner = as(t, w.ownerId);
    const id = w.a.menuServiceId;
    const existing = await owner.mutation(RS.addCategory, { menuServiceId: id, name: "Hrana" });
    await owner.mutation(RS.addItems, { categoryId: existing.categoryId, articleIds: [m.pitaId] });

    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: id })).toEqual({
      categoriesCreated: 1,
      itemsAdded: 3,
      alreadyIn: 1,
    });
    let view = await rsView(t, w.ownerId, id);
    expect(categoryNames(view)).toEqual(["Hrana", "Pića"]);
    expect(namesIn(view, existing.categoryId)).toEqual(["Pita sa sirom", "Pljeskavica"]);
    expect(view.notInRoomService).toBe(0);

    // A second call adds nothing and does not touch the draft.
    const revision = await revisionOf(t, id);
    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: id })).toEqual({
      categoriesCreated: 0,
      itemsAdded: 0,
      alreadyIn: 4,
    });
    expect(await revisionOf(t, id)).toBe(revision);

    // It is a one-time copy: a new menu article is only picked up by the next import.
    await quickAdd(t, w.ownerId, m.drinksSectionId, "Limunada", 180);
    view = await rsView(t, w.ownerId, id);
    expect(view.notInRoomService).toBe(1);
    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: id })).toEqual({
      categoriesCreated: 0,
      itemsAdded: 1,
      alreadyIn: 4,
    });
    view = await rsView(t, w.ownerId, id);
    expect(namesIn(view, view.categories[1].categoryId)).toEqual(["Jelen pivo", "Espreso", "Limunada"]);
    expect(view.notInRoomService).toBe(0);
  });

  test("an article shown in two sections is imported once: the second appearance counts as already in", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const m = await menuContent(t, w, "a");
    const owner = as(t, w.ownerId);
    await owner.mutation(api.menuCatalog.addPlacement, {
      sectionId: m.foodSectionId,
      articleId: m.beerId,
    });

    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: w.a.menuServiceId })).toEqual({
      categoriesCreated: 2,
      itemsAdded: 4,
      alreadyIn: 1,
    });
    const view = await rsView(t, w.ownerId, w.a.menuServiceId);
    expect(allItems(view).filter((item) => item.article.articleId === m.beerId)).toHaveLength(1);
    expect(view.categories.find((category) => category.name === "Hrana")?.items).toHaveLength(2);
  });

  test("get().notInRoomService is the number of the service's articles that are not in Room service", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const notIn = async () => (await rsView(t, w.ownerId, f.menuServiceId)).notInRoomService;

    expect(await notIn()).toBe(2); // Espreso, Jelen pivo
    await owner.mutation(RS.addItems, { categoryId: f.emptyCategoryId, articleIds: [f.coffeeId] });
    expect(await notIn()).toBe(1);
    await quickAdd(t, w.ownerId, f.drinksSectionId, "Limunada", 180);
    expect(await notIn()).toBe(2);
    await owner.mutation(RS.removeItem, { itemId: f.burgerItemId });
    expect(await notIn()).toBe(3);
  });

  test("category names are cleaned and validated", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);

    await owner.mutation(RS.addCategory, { menuServiceId: f.menuServiceId, name: "  Deserti   i   kafa " });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))).toEqual([
      ROOM_CATEGORY,
      EMPTY_CATEGORY,
      "Deserti i kafa",
    ]);

    await expectCode(
      owner.mutation(RS.addCategory, { menuServiceId: f.menuServiceId, name: "   " }),
      MENU_ERROR.invalidInput,
    );
    await expectCode(
      owner.mutation(RS.addCategory, { menuServiceId: f.menuServiceId, name: "x".repeat(81) }),
      MENU_ERROR.invalidInput,
    );
    await expectCode(
      owner.mutation(RS.renameCategory, {
        categoryId: f.categoryId,
        name: "   ",
        expectedName: ROOM_CATEGORY,
      }),
      MENU_ERROR.invalidInput,
    );
  });

  test("renameCategory renames by compare-and-set", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);

    expect(
      await owner.mutation(RS.renameCategory, {
        categoryId: f.categoryId,
        name: "Topla jela",
        expectedName: ROOM_CATEGORY,
      }),
    ).toEqual({ ok: true });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))[0]).toBe("Topla jela");

    expect(
      await owner.mutation(RS.renameCategory, {
        categoryId: f.categoryId,
        name: "Drugo",
        expectedName: ROOM_CATEGORY,
      }),
    ).toMatchObject({ ok: false, conflicts: ["name"], current: { name: "Topla jela" } });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))[0]).toBe("Topla jela");
  });

  test("removeCategory refuses a non-empty category and removes an empty one", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const before = await rsRows(t, f.menuServiceId);

    await expectCode(
      owner.mutation(RS.removeCategory, { categoryId: f.categoryId }),
      ROOM_SERVICE_ERROR.categoryNotEmpty,
    );
    expect(await rsRows(t, f.menuServiceId)).toEqual(before);

    expect(await owner.mutation(RS.removeCategory, { categoryId: f.emptyCategoryId })).toEqual({
      ok: true,
    });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))).toEqual([ROOM_CATEGORY]);

    // Once its articles are taken out, the first category can go too.
    await owner.mutation(RS.removeItem, { itemId: f.burgerItemId });
    await owner.mutation(RS.removeItem, { itemId: f.pitaItemId });
    expect(await owner.mutation(RS.removeCategory, { categoryId: f.categoryId })).toEqual({ ok: true });
    expect((await rsView(t, w.ownerId, f.menuServiceId)).categories).toEqual([]);
  });

  test("moveCategory reorders (the index is clamped) and refuses a bad index", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const third = await owner.mutation(RS.addCategory, {
      menuServiceId: f.menuServiceId,
      name: "Dezerti",
    });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))).toEqual([
      ROOM_CATEGORY,
      EMPTY_CATEGORY,
      "Dezerti",
    ]);

    expect(await owner.mutation(RS.moveCategory, { categoryId: third.categoryId, toIndex: 0 })).toEqual({
      ok: true,
    });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))).toEqual([
      "Dezerti",
      ROOM_CATEGORY,
      EMPTY_CATEGORY,
    ]);

    expect(await owner.mutation(RS.moveCategory, { categoryId: third.categoryId, toIndex: 99 })).toEqual({
      ok: true,
    });
    expect(categoryNames(await rsView(t, w.ownerId, f.menuServiceId))).toEqual([
      ROOM_CATEGORY,
      EMPTY_CATEGORY,
      "Dezerti",
    ]);

    for (const toIndex of [-1, 1.5]) {
      await expectCode(
        owner.mutation(RS.moveCategory, { categoryId: third.categoryId, toIndex }),
        MENU_ERROR.invalidInput,
      );
    }
  });

  test("moveItem reorders inside a category (before another item) and moves between categories", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    await owner.mutation(RS.addItems, {
      categoryId: f.categoryId,
      articleIds: [f.coffeeId],
    });
    const coffeeItemId = itemIdOf(await rsView(t, w.ownerId, f.menuServiceId), f.coffeeId);
    const room = () => rsView(t, w.ownerId, f.menuServiceId).then((v) => namesIn(v, f.categoryId));
    const empty = () =>
      rsView(t, w.ownerId, f.menuServiceId).then((v) => namesIn(v, f.emptyCategoryId));
    expect(await room()).toEqual(["Pljeskavica", "Pita sa sirom", "Espreso"]);

    // The last one goes to the front.
    expect(
      await owner.mutation(RS.moveItem, {
        itemId: coffeeItemId,
        toCategoryId: f.categoryId,
        beforeItemId: f.burgerItemId,
      }),
    ).toEqual({ ok: true });
    expect(await room()).toEqual(["Espreso", "Pljeskavica", "Pita sa sirom"]);

    // Between two others.
    await owner.mutation(RS.moveItem, {
      itemId: coffeeItemId,
      toCategoryId: f.categoryId,
      beforeItemId: f.pitaItemId,
    });
    expect(await room()).toEqual(["Pljeskavica", "Espreso", "Pita sa sirom"]);

    // No `before` means the end of the category.
    await owner.mutation(RS.moveItem, { itemId: f.burgerItemId, toCategoryId: f.categoryId });
    expect(await room()).toEqual(["Espreso", "Pita sa sirom", "Pljeskavica"]);

    // Into another category (the end of it), then in front of its first item.
    await owner.mutation(RS.moveItem, { itemId: f.pitaItemId, toCategoryId: f.emptyCategoryId });
    expect(await room()).toEqual(["Espreso", "Pljeskavica"]);
    expect(await empty()).toEqual(["Pita sa sirom"]);
    await owner.mutation(RS.moveItem, {
      itemId: coffeeItemId,
      toCategoryId: f.emptyCategoryId,
      beforeItemId: f.pitaItemId,
    });
    expect(await room()).toEqual(["Pljeskavica"]);
    expect(await empty()).toEqual(["Espreso", "Pita sa sirom"]);

    // `before` must be an item of the target category.
    await expectCode(
      owner.mutation(RS.moveItem, {
        itemId: coffeeItemId,
        toCategoryId: f.categoryId,
        beforeItemId: f.pitaItemId,
      }),
      MENU_ERROR.invalidInput,
    );
  });

  test("many moves in front of the same item keep the order correct (the order gap is renumbered when used up)", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    await owner.mutation(RS.addItems, {
      categoryId: f.categoryId,
      articleIds: [f.coffeeId, f.beerId],
    });
    const view = await rsView(t, w.ownerId, f.menuServiceId);
    const coffeeItemId = itemIdOf(view, f.coffeeId);
    const beerItemId = itemIdOf(view, f.beerId);

    // Alternate two items in front of the second one: each move halves the same gap.
    for (let round = 0; round < 60; round += 1) {
      await owner.mutation(RS.moveItem, {
        itemId: round % 2 === 0 ? coffeeItemId : beerItemId,
        toCategoryId: f.categoryId,
        beforeItemId: f.pitaItemId,
      });
    }
    // Start: Pljeskavica, Pita, Espreso, Jelen pivo. The 60th (last) move put
    // Jelen pivo directly before Pita, so Espreso sits before it.
    expect(namesIn(await rsView(t, w.ownerId, f.menuServiceId), f.categoryId)).toEqual([
      "Pljeskavica",
      "Espreso",
      "Jelen pivo",
      "Pita sa sirom",
    ]);
    const orders = (await rsRows(t, f.menuServiceId)).items
      .filter((item) => item.categoryId === f.categoryId)
      .map((item) => item.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  test("removeItem takes the article out of Room service only: it stays in the menu and can be added again", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);

    expect(await owner.mutation(RS.removeItem, { itemId: f.burgerItemId })).toEqual({ ok: true });
    const view = await rsView(t, w.ownerId, f.menuServiceId);
    expect(namesIn(view, f.categoryId)).toEqual(["Pita sa sirom"]);

    const page = await owner.query(api.menuCatalog.pageContent, { pageId: f.defaultPageId });
    const food = page?.sections.find((section) => section.sectionId === f.foodSectionId);
    expect(food?.placements.map((placement) => placement.article.name)).toEqual([
      "Pljeskavica",
      "Pita sa sirom",
    ]);
    const article = await t.run(async (ctx) => ctx.db.get(f.burgerId));
    expect(article).toMatchObject({ name: "Pljeskavica", basePriceRsd: 450 });

    expect(
      await owner.mutation(RS.addItems, { categoryId: f.categoryId, articleIds: [f.burgerId] }),
    ).toEqual({ added: 1, alreadyIn: 0 });
  });
});

// =============================================================================
// G. The draft
// =============================================================================

describe("G. the draft revision", () => {
  test("every successful Room service change raises the revision by exactly 1", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const id = f.menuServiceId;
    // Two more articles for the multi-article addItems; Pića stays for the import.
    const stew = await quickAdd(t, w.ownerId, f.foodSectionId, "Gulaš", 500);
    const cabbage = await quickAdd(t, w.ownerId, f.foodSectionId, "Sarma", 420);
    let dessertId: Id<"menuRoomServiceCategories"> | undefined;

    const steps: Array<{
      name: string;
      prepare?: () => Promise<unknown>;
      run: () => Promise<unknown>;
    }> = [
      { name: "updateSettings", run: () => setMarkup(t, w.ownerId, id, 15) },
      {
        name: "addCategory",
        run: async () => {
          const created = await owner.mutation(RS.addCategory, { menuServiceId: id, name: "Dezerti" });
          dessertId = created.categoryId;
        },
      },
      {
        name: "renameCategory",
        run: () =>
          owner.mutation(RS.renameCategory, {
            categoryId: dessertId!,
            name: "Slatkiši",
            expectedName: "Dezerti",
          }),
      },
      {
        name: "moveCategory",
        run: () => owner.mutation(RS.moveCategory, { categoryId: dessertId!, toIndex: 0 }),
      },
      {
        name: "addItems (two articles, one revision)",
        run: () =>
          owner.mutation(RS.addItems, {
            categoryId: f.categoryId,
            articleIds: [stew.articleId, cabbage.articleId],
          }),
      },
      { name: "importWholeMenu", run: () => owner.mutation(RS.importWholeMenu, { menuServiceId: id }) },
      {
        name: "moveItem",
        run: () => owner.mutation(RS.moveItem, { itemId: f.burgerItemId, toCategoryId: dessertId! }),
      },
      {
        name: "setItemsMarkup",
        run: () =>
          owner.mutation(RS.setItemsMarkup, {
            menuServiceId: id,
            itemIds: [f.pitaItemId],
            markupApplies: true,
          }),
      },
      { name: "setManualPrice", run: () => setManual(t, w.ownerId, f.burgerItemId, null, 600) },
      {
        name: "resolvePriceWarning",
        prepare: () => setBase(t, w.ownerId, f.burgerId, 450, 500),
        run: () =>
          owner.mutation(RS.resolvePriceWarning, { itemId: f.burgerItemId, action: "keepManual" }),
      },
      { name: "removeItem", run: () => owner.mutation(RS.removeItem, { itemId: f.pitaItemId }) },
      {
        name: "removeCategory",
        run: () => owner.mutation(RS.removeCategory, { categoryId: f.emptyCategoryId }),
      },
    ];

    const deltas: Record<string, number> = {};
    const failed: string[] = [];
    for (const step of steps) {
      await step.prepare?.();
      const before = await revisionOf(t, id);
      const result = (await step.run()) as { ok?: boolean } | undefined;
      deltas[step.name] = (await revisionOf(t, id)) - before;
      if (result?.ok === false) failed.push(step.name);
    }
    expect(failed).toEqual([]);
    expect(deltas).toEqual(Object.fromEntries(steps.map((step) => [step.name, 1])));
  });

  test("a refusal (Premium gone), a CAS conflict, invalid input and a no-op never touch the revision", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    const owner = as(t, w.ownerId);
    const id = f.menuServiceId;
    // A state in which "the same again" is meaningful.
    await owner.mutation(RS.updateSettings, {
      menuServiceId: id,
      expected: { markupPercent: null, markupScope: "all", deliveryFeeRsd: null },
      patch: { markupPercent: 15, deliveryFeeRsd: 150 },
    });
    await owner.mutation(RS.setItemsMarkup, {
      menuServiceId: id,
      itemIds: [f.burgerItemId],
      markupApplies: true,
    });
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    await owner.mutation(RS.importWholeMenu, { menuServiceId: id });

    const idle: Record<string, () => Promise<unknown>> = {
      // CAS conflicts
      updateSettingsConflict: () => setMarkup(t, w.ownerId, id, 30, 99),
      renameCategoryConflict: () =>
        owner.mutation(RS.renameCategory, {
          categoryId: f.categoryId,
          name: "Drugo",
          expectedName: "Stari naziv",
        }),
      setManualPriceConflict: () => setManual(t, w.ownerId, f.burgerItemId, 700, 650),
      // Invalid input and other refusals
      invalidMarkup: () => setMarkup(t, w.ownerId, id, 300.01, 15),
      invalidManualPrice: () => setManual(t, w.ownerId, f.burgerItemId, 600, 1.5),
      emptyBatch: () => owner.mutation(RS.addItems, { categoryId: f.categoryId, articleIds: [] }),
      nonEmptyCategory: () => owner.mutation(RS.removeCategory, { categoryId: f.categoryId }),
      blankCategoryName: () =>
        owner.mutation(RS.addCategory, { menuServiceId: id, name: "  " }),
      // No-ops
      updateSettingsSame: () =>
        owner.mutation(RS.updateSettings, {
          menuServiceId: id,
          expected: { markupPercent: 15, markupScope: "all", deliveryFeeRsd: 150 },
          patch: { markupPercent: 15, markupScope: "all", deliveryFeeRsd: 150 },
        }),
      renameCategorySame: () =>
        owner.mutation(RS.renameCategory, {
          categoryId: f.categoryId,
          name: ROOM_CATEGORY,
          expectedName: ROOM_CATEGORY,
        }),
      moveCategorySame: () => owner.mutation(RS.moveCategory, { categoryId: f.categoryId, toIndex: 0 }),
      moveItemSame: () =>
        owner.mutation(RS.moveItem, {
          itemId: f.burgerItemId,
          toCategoryId: f.categoryId,
          beforeItemId: f.pitaItemId,
        }),
      addItemsAllAlreadyIn: () =>
        owner.mutation(RS.addItems, {
          categoryId: f.emptyCategoryId,
          articleIds: [f.burgerId, f.pitaId],
        }),
      importWholeMenuAgain: () => owner.mutation(RS.importWholeMenu, { menuServiceId: id }),
      setItemsMarkupSame: () =>
        owner.mutation(RS.setItemsMarkup, {
          menuServiceId: id,
          itemIds: [f.burgerItemId],
          markupApplies: true,
        }),
      setManualPriceSame: () => setManual(t, w.ownerId, f.burgerItemId, 600, 600),
      resolveWithoutWarning: () =>
        owner.mutation(RS.resolvePriceWarning, {
          itemId: f.burgerItemId,
          action: "recomputeFromMarkup",
        }),
    };

    const outcomes: Record<string, unknown> = {};
    const deltas: Record<string, number> = {};
    for (const [name, call] of Object.entries(idle)) {
      const before = await revisionOf(t, id);
      outcomes[name] = await settle(call);
      deltas[name] = (await revisionOf(t, id)) - before;
    }

    expect(deltas).toEqual(Object.fromEntries(Object.keys(idle).map((name) => [name, 0])));
    expect(outcomes).toMatchObject({
      updateSettingsConflict: { ok: false, conflicts: ["markupPercent"] },
      renameCategoryConflict: { ok: false, conflicts: ["name"] },
      setManualPriceConflict: { ok: false, conflicts: ["manualPriceRsd"] },
      invalidMarkup: { error: MENU_ERROR.invalidInput },
      invalidManualPrice: { error: MENU_ERROR.invalidInput },
      emptyBatch: { error: MENU_ERROR.invalidInput },
      nonEmptyCategory: { error: ROOM_SERVICE_ERROR.categoryNotEmpty },
      blankCategoryName: { error: MENU_ERROR.invalidInput },
      updateSettingsSame: { ok: true },
      renameCategorySame: { ok: true },
      moveCategorySame: { ok: true },
      moveItemSame: { ok: true },
      addItemsAllAlreadyIn: { added: 0, alreadyIn: 2 },
      importWholeMenuAgain: { categoriesCreated: 0, itemsAdded: 0 },
      setItemsMarkupSame: { changed: 0 },
      setManualPriceSame: { ok: true },
      resolveWithoutWarning: { ok: true },
    });

    // Premium gone: refused, still no revision.
    await downgradeToBasic(t, w.a.accountId);
    const before = await revisionOf(t, id);
    await expectCode(
      owner.mutation(RS.addCategory, { menuServiceId: id, name: "Novo" }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    await expectCode(setManual(t, w.ownerId, f.burgerItemId, 600, 610), MENU_PLAN_ERROR.premiumRequired);
    expect(await revisionOf(t, id)).toBe(before);
  });

  test("a base price change that raises a Room service warning is still one revision", async () => {
    const { t, w } = await setup();
    const f = await rsFixture(t, w, "a");
    await setManual(t, w.ownerId, f.burgerItemId, null, 600);
    const before = await revisionOf(t, f.menuServiceId);
    await setBase(t, w.ownerId, f.burgerId, 450, 500);
    expect(await revisionOf(t, f.menuServiceId)).toBe(before + 1);
  });
});
