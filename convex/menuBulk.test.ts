/// <reference types="vite/client" />

// ScanMe Menu V1 — K11: the group actions of the editor's "Izaberi više"
// (convex/menuBulk.ts; master §5.6, §13.4; K09 §4.5). Covers:
//   - access: the role matrix, client editing switched off, a signed-out caller;
//   - tenant isolation: ONE foreign id refuses the whole batch, nothing written;
//   - the batch limits (1..200 distinct ids; duplicates count once);
//   - setPrices: compare-and-set on EVERY article, all or nothing, combos and
//     Room service follow like menuCatalog.setBasePrice;
//   - setAvailability (LIVE: no draft revision), setVisibility, removeFromPage,
//     moveToSection, addToPage, pageSections;
//   - deleteImpact / deleteArticles: the impact of the whole batch, the token,
//     page counters when one page held several of the deleted articles;
//   - draft only: guests read the published menu until the next publish.
// Every batch that changes something moves the draft revision exactly once;
// a refusal, a conflict, a "confirm" answer or a no-op never does.
// Fictional venue and articles only (the repo is public).

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_BULK_BATCH,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_PRICE_RSD,
} from "../lib/menu/limits";
import { DEFAULT_PAGE_SLUG } from "../lib/menu/slugs";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
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

const B = api.menuBulk;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

/** The machine code a refused call raises (ConvexError data), or null when it resolved. */
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    throw error;
  }
}

// -----------------------------------------------------------------------------
// The functions under test, bound to a caller and a Menu service
// -----------------------------------------------------------------------------

type PriceChange = {
  articleId: Id<"menuArticles">;
  expectedPriceRsd: number | null;
  priceRsd: number;
};

/** userId null = signed out; the service defaults to tenant A. */
function bulkAs(
  f: { t: T; w: MenuWorldSeed },
  userId: Id<"users"> | null,
  menuServiceId: Id<"menuServices"> = f.w.a.menuServiceId,
) {
  const caller = userId ? as(f.t, userId) : f.t;
  return {
    setPrices: (changes: PriceChange[]) =>
      caller.mutation(B.setPrices, { menuServiceId, changes }),
    setAvailability: (articleIds: Id<"menuArticles">[], available: boolean) =>
      caller.mutation(B.setAvailability, { menuServiceId, articleIds, available }),
    setVisibility: (placementIds: Id<"menuPlacements">[], visibility: "visible" | "hidden") =>
      caller.mutation(B.setVisibility, { menuServiceId, placementIds, visibility }),
    removeFromPage: (placementIds: Id<"menuPlacements">[]) =>
      caller.mutation(B.removeFromPage, { menuServiceId, placementIds }),
    moveToSection: (placementIds: Id<"menuPlacements">[], toSectionId: Id<"menuSections">) =>
      caller.mutation(B.moveToSection, { menuServiceId, placementIds, toSectionId }),
    addToPage: (articleIds: Id<"menuArticles">[], sectionId: Id<"menuSections">) =>
      caller.mutation(B.addToPage, { menuServiceId, articleIds, sectionId }),
    deleteImpact: (articleIds: Id<"menuArticles">[]) =>
      caller.query(B.deleteImpact, { menuServiceId, articleIds }),
    deleteArticles: (articleIds: Id<"menuArticles">[], confirmToken?: string) =>
      caller.mutation(B.deleteArticles, {
        menuServiceId,
        articleIds,
        ...(confirmToken !== undefined ? { confirmToken } : {}),
      }),
    pageSections: (pageId: Id<"menuPages">) => caller.query(B.pageSections, { pageId }),
  };
}
type Bulk = ReturnType<typeof bulkAs>;

function asConfirm<R extends { status: string }>(result: R) {
  if (result.status !== "confirm") throw new Error(`expected a confirm answer, got ${result.status}`);
  return result as Extract<R, { status: "confirm" }>;
}

/** The two-step deletion: ask, then confirm with the token that came back. */
async function deleteConfirmed(b: Bulk, articleIds: Id<"menuArticles">[]) {
  const asked = asConfirm(await b.deleteArticles(articleIds));
  return await b.deleteArticles(articleIds, asked.confirmToken);
}

// -----------------------------------------------------------------------------
// Draft content through the real mutations
// -----------------------------------------------------------------------------

async function addPage(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">, name: string) {
  return await as(t, userId).mutation(api.menuPages.add, { menuServiceId, name });
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

async function addPlacement(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  articleId: Id<"menuArticles">,
) {
  const { placementId } = await as(t, userId).mutation(api.menuCatalog.addPlacement, {
    sectionId,
    articleId,
  });
  return placementId;
}

async function content(t: T, userId: Id<"users">, pageId: Id<"menuPages">) {
  const result = await as(t, userId).query(api.menuCatalog.pageContent, { pageId });
  if (!result) throw new Error("pageContent returned null");
  return result;
}

/** Sections of a page, each with the article names in their order. */
async function layout(t: T, userId: Id<"users">, pageId: Id<"menuPages">) {
  const page = await content(t, userId, pageId);
  return page.sections.map((section) => ({
    section: section.name,
    articles: section.placements.map((placement) => placement.article.name),
  }));
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

const articleDoc = async (t: T, id: Id<"menuArticles">) => await t.run(async (ctx) => ctx.db.get(id));
const placementDoc = async (t: T, id: Id<"menuPlacements">) => await t.run(async (ctx) => ctx.db.get(id));
const pageDoc = async (t: T, id: Id<"menuPages">) => await t.run(async (ctx) => ctx.db.get(id));

/** Every row of one service the group actions can write, to prove "nothing changed". */
async function world(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => ({
    draft: await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
    pages: await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    sections: await ctx.db
      .query("menuSections")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    articles: await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    placements: await ctx.db
      .query("menuPlacements")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    components: await ctx.db
      .query("menuComboComponents")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    availability: await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    roomService: await ctx.db
      .query("menuRoomServiceItems")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    audit: await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}

/** The counters the editor trusts: placementCount per page and the draft's articleCount. */
async function expectCountersMatchRows(t: T, menuServiceId: Id<"menuServices">) {
  const rows = await world(t, menuServiceId);
  for (const page of rows.pages) {
    const actual = rows.placements.filter((placement) => placement.pageId === page._id).length;
    expect(page.placementCount, `placementCount of ${page.name}`).toBe(actual);
  }
  expect(rows.draft?.articleCount, "articleCount").toBe(rows.articles.length);
}

async function unavailableKeys(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const rows = await as(t, userId).query(api.menuAvailability.unavailableArticles, { menuServiceId });
  if (!rows) throw new Error("unavailableArticles returned null");
  return rows.map((row) => row.articleKey).sort();
}

// -----------------------------------------------------------------------------
// The shared fixture
//   tenant A, page "Kompletan meni" (default):
//     "Topli napici"   Espresso 150, Kafa 120, Cappuccino 200
//     "Hladni napici"  Limunada 250
//   tenant A, page "Terasa": section "Na terasi" (empty)
//   tenant B, default page: section "Pića" with its own "Espresso" 150
// -----------------------------------------------------------------------------

async function fixture() {
  const { t, w } = await setup();
  const owner = w.ownerId;
  const hot = (await addSection(t, owner, w.a.defaultPageId, "Topli napici")).sectionId;
  const cold = (await addSection(t, owner, w.a.defaultPageId, "Hladni napici")).sectionId;
  const espresso = await quickAdd(t, owner, hot, "Espresso", 150);
  const kafa = await quickAdd(t, owner, hot, "Kafa", 120);
  const cappuccino = await quickAdd(t, owner, hot, "Cappuccino", 200);
  const limunada = await quickAdd(t, owner, cold, "Limunada", 250);
  const terrace = await addPage(t, owner, w.a.menuServiceId, "Terasa");
  const terraceSection = (await addSection(t, owner, terrace.pageId, "Na terasi")).sectionId;
  const sectionB = (await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića")).sectionId;
  const foreign = await quickAdd(t, w.otherOwnerId, sectionB, "Espresso", 150);
  return {
    t,
    w,
    svc: w.a.menuServiceId,
    owner: bulkAs({ t, w }, w.ownerId),
    hot,
    cold,
    espresso,
    kafa,
    cappuccino,
    limunada,
    terrace,
    terraceSection,
    sectionB,
    foreign,
  };
}
type F = Awaited<ReturnType<typeof fixture>>;

/** Espresso + Kafa assembled into the combo "Doručak" 250, shown in the hot section. */
async function addCombo(f: F) {
  return await as(f.t, f.w.ownerId).mutation(api.menuCombos.createCombo, {
    sectionId: f.hot,
    name: "Doručak",
    priceRsd: 250,
    components: [
      { articleId: f.espresso.articleId, quantity: 1 },
      { articleId: f.kafa.articleId, quantity: 1 },
    ],
  });
}

/** `count` extra priced articles, each shown once in the cold section (direct inserts: fast). */
async function seedMany(f: F, count: number) {
  return await f.t.run(async (ctx) => {
    const now = Date.now();
    const articleIds: Id<"menuArticles">[] = [];
    const placementIds: Id<"menuPlacements">[] = [];
    for (let index = 0; index < count; index += 1) {
      const articleId = await ctx.db.insert("menuArticles", {
        menuServiceId: f.svc,
        key: newMenuKey("article"),
        kind: "item",
        name: `Sok broj ${index + 1}`,
        nameNormalized: `sok broj ${index + 1}`,
        basePriceRsd: 100,
        mediaMode: "none",
        createdAt: now,
        updatedAt: now,
      });
      const placementId = await ctx.db.insert("menuPlacements", {
        menuServiceId: f.svc,
        pageId: f.w.a.defaultPageId,
        sectionId: f.cold,
        articleId,
        order: 100_000 + index * 1024,
        visibility: "visible",
        createdAt: now,
        updatedAt: now,
      });
      articleIds.push(articleId);
      placementIds.push(placementId);
    }
    const page = await ctx.db.get(f.w.a.defaultPageId);
    if (page) await ctx.db.patch(page._id, { placementCount: page.placementCount + count });
    const draft = await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", f.svc))
      .unique();
    if (draft) await ctx.db.patch(draft._id, { articleCount: draft.articleCount + count });
    return { articleIds, placementIds };
  });
}

// =============================================================================
// 1. Access
// =============================================================================

/** One call of every group action on espresso & co., for the role matrices. */
const EVERY_ACTION: Record<string, (b: Bulk, f: F) => Promise<unknown>> = {
  setPrices: (b, f) =>
    b.setPrices([{ articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 }]),
  setAvailability: (b, f) => b.setAvailability([f.espresso.articleId], false),
  setVisibility: (b, f) => b.setVisibility([f.espresso.placementId], "hidden"),
  removeFromPage: (b, f) => b.removeFromPage([f.espresso.placementId]),
  moveToSection: (b, f) => b.moveToSection([f.espresso.placementId], f.cold),
  addToPage: (b, f) => b.addToPage([f.espresso.articleId], f.terraceSection),
  deleteArticles: (b, f) => b.deleteArticles([f.espresso.articleId]),
};

describe("access", () => {
  for (const role of ["ownerId", "managerId", "editorId", "adminId"] as const) {
    test(`${role}: every group action is allowed`, async () => {
      const f = await fixture();
      const { t, w } = f;
      const b = bulkAs(f, w[role]);
      const before = await draftOf(t, f.svc);

      expect(await b.setVisibility([f.espresso.placementId], "hidden")).toEqual({ changed: 1 });
      expect(
        await b.setPrices([{ articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 130 }]),
      ).toEqual({ status: "changed", changed: 1 });
      expect(await b.setAvailability([f.limunada.articleId], false)).toEqual({
        available: false,
        changed: 1,
      });
      expect(await b.addToPage([f.espresso.articleId], f.terraceSection)).toEqual({ added: 1, skipped: 0 });
      expect(await b.moveToSection([f.cappuccino.placementId], f.cold)).toEqual({ moved: 1, skipped: 0 });
      expect(await b.removeFromPage([f.kafa.placementId])).toEqual({ removed: 1 });
      expect(await deleteConfirmed(b, [f.limunada.articleId])).toEqual({ status: "deleted", deleted: 1 });

      // Five draft changes + the deletion; availability is live.
      const after = await draftOf(t, f.svc);
      expect(after.revision).toBe(before.revision + 6);
      expect(after.lastEditByUserId).toBe(w[role]);
      await expectCountersMatchRows(t, f.svc);
    });
  }

  for (const role of ["financeId", "viewOnlyId", "outsiderId", "otherOwnerId"] as const) {
    test(`${role}: no role in this service, so menu/not_found from every action and nothing is written`, async () => {
      const f = await fixture();
      const { t, w } = f;
      const b = bulkAs(f, w[role]);
      const mine = await world(t, f.svc);
      const theirs = await world(t, w.b.menuServiceId);

      for (const [name, run] of Object.entries(EVERY_ACTION)) {
        expect(await codeOf(run(b, f)), name).toBe(MENU_ERROR.notFound);
      }
      expect(await world(t, f.svc)).toEqual(mine);
      expect(await world(t, w.b.menuServiceId)).toEqual(theirs);

      // The two reads answer null, not an error.
      expect(await b.pageSections(w.a.defaultPageId)).toBeNull();
      expect(await b.deleteImpact([f.espresso.articleId])).toBeNull();
    });
  }

  test("a signed-out caller is menu/unauthenticated; the reads answer null", async () => {
    const f = await fixture();
    const b = bulkAs(f, null);
    const before = await world(f.t, f.svc);
    for (const [name, run] of Object.entries(EVERY_ACTION)) {
      expect(await codeOf(run(b, f)), name).toBe(MENU_ERROR.unauthenticated);
    }
    expect(await world(f.t, f.svc)).toEqual(before);
    expect(await b.pageSections(f.w.a.defaultPageId)).toBeNull();
    expect(await b.deleteImpact([f.espresso.articleId])).toBeNull();
  });

  describe("client editing switched off", () => {
    async function editingOff() {
      const f = await fixture();
      await f.t.run(async (ctx) => ctx.db.patch(f.w.a.serviceProfileId, { clientEditingEnabled: false }));
      return f;
    }

    for (const role of ["ownerId", "managerId", "editorId"] as const) {
      test(`${role}: menu.edit actions are menu/editing_disabled, availability still works, reads still answer`, async () => {
        const f = await editingOff();
        const { t, w } = f;
        const b = bulkAs(f, w[role]);
        const before = await world(t, f.svc);

        for (const [name, run] of Object.entries(EVERY_ACTION)) {
          if (name === "setAvailability") continue;
          expect(await codeOf(run(b, f)), name).toBe(MENU_ERROR.editingDisabled);
        }
        expect(await world(t, f.svc)).toEqual(before);

        // "Privremeno nedostupno" is live operations, not editing.
        expect(await b.setAvailability([f.espresso.articleId], false)).toEqual({
          available: false,
          changed: 1,
        });
        expect(await unavailableKeys(t, w[role], f.svc)).toEqual([f.espresso.key]);
        expect(await b.setAvailability([f.espresso.articleId], true)).toEqual({
          available: true,
          changed: 1,
        });
        expect((await draftOf(t, f.svc)).revision).toBe(before.draft!.revision);

        expect(await b.pageSections(w.a.defaultPageId)).not.toBeNull();
        expect(await b.deleteImpact([f.espresso.articleId])).not.toBeNull();
      });
    }

    test("the ScanMe admin still edits", async () => {
      const f = await editingOff();
      const b = bulkAs(f, f.w.adminId);
      expect(await b.setVisibility([f.espresso.placementId], "hidden")).toEqual({ changed: 1 });
      expect(
        await b.setPrices([{ articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 }]),
      ).toEqual({ status: "changed", changed: 1 });
    });
  });
});

// =============================================================================
// 2. Tenant isolation
// =============================================================================

describe("tenant isolation: a foreign id refuses the whole batch", () => {
  const CASES: Record<string, (f: F) => Promise<unknown>> = {
    "setPrices, foreign last": (f) =>
      f.owner.setPrices([
        { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
        { articleId: f.foreign.articleId, expectedPriceRsd: 150, priceRsd: 160 },
      ]),
    "setPrices, foreign first": (f) =>
      f.owner.setPrices([
        { articleId: f.foreign.articleId, expectedPriceRsd: 150, priceRsd: 160 },
        { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
      ]),
    setAvailability: (f) => f.owner.setAvailability([f.espresso.articleId, f.foreign.articleId], false),
    setVisibility: (f) =>
      f.owner.setVisibility([f.espresso.placementId, f.foreign.placementId], "hidden"),
    removeFromPage: (f) => f.owner.removeFromPage([f.espresso.placementId, f.foreign.placementId]),
    "moveToSection, foreign placement": (f) =>
      f.owner.moveToSection([f.espresso.placementId, f.foreign.placementId], f.cold),
    "moveToSection, foreign target section": (f) =>
      f.owner.moveToSection([f.espresso.placementId], f.sectionB),
    "addToPage, foreign article": (f) =>
      f.owner.addToPage([f.espresso.articleId, f.foreign.articleId], f.terraceSection),
    "addToPage, foreign section": (f) => f.owner.addToPage([f.espresso.articleId], f.sectionB),
    deleteArticles: (f) => f.owner.deleteArticles([f.espresso.articleId, f.foreign.articleId]),
  };

  for (const [name, run] of Object.entries(CASES)) {
    test(`${name}: menu/not_found, nothing written in either tenant`, async () => {
      const f = await fixture();
      const mine = await world(f.t, f.svc);
      const theirs = await world(f.t, f.w.b.menuServiceId);

      expect(await codeOf(run(f))).toBe(MENU_ERROR.notFound);

      expect(await world(f.t, f.svc)).toEqual(mine);
      expect(await world(f.t, f.w.b.menuServiceId)).toEqual(theirs);
    });
  }

  test("deleteImpact answers null for a foreign id, even next to valid ones", async () => {
    const f = await fixture();
    expect(await f.owner.deleteImpact([f.espresso.articleId, f.foreign.articleId])).toBeNull();
    expect(await f.owner.deleteImpact([f.foreign.articleId])).toBeNull();
    expect(await f.owner.deleteImpact([f.espresso.articleId])).not.toBeNull();
  });

  test("pageSections answers null for a page of another tenant, and for a page that is gone", async () => {
    const f = await fixture();
    expect(await f.owner.pageSections(f.w.b.defaultPageId)).toBeNull();
    const gone = await addPage(f.t, f.w.ownerId, f.svc, "Privremena");
    await as(f.t, f.w.ownerId).mutation(api.menuPages.remove, { pageId: gone.pageId });
    expect(await f.owner.pageSections(gone.pageId)).toBeNull();
  });

  test("the owner of tenant B works on B's own ids; tenant A does not move", async () => {
    const f = await fixture();
    const mine = await world(f.t, f.svc);
    const b = bulkAs(f, f.w.otherOwnerId, f.w.b.menuServiceId);

    expect(await b.setVisibility([f.foreign.placementId], "hidden")).toEqual({ changed: 1 });
    expect(
      await b.setPrices([{ articleId: f.foreign.articleId, expectedPriceRsd: 150, priceRsd: 175 }]),
    ).toEqual({ status: "changed", changed: 1 });
    expect(await world(f.t, f.svc)).toEqual(mine);
    // And B cannot use A's id with its own service id.
    expect(await codeOf(b.setVisibility([f.espresso.placementId], "hidden"))).toBe(MENU_ERROR.notFound);
  });
});

// =============================================================================
// 3. Batch limits
// =============================================================================

describe("batch limits (1..200 distinct ids)", () => {
  test("MENU_MAX_BULK_BATCH is 200", () => {
    expect(MENU_MAX_BULK_BATCH).toBe(200);
  });

  test("an empty batch is menu/invalid_input for every action; deleteImpact answers null", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    const checks: Record<string, () => Promise<unknown>> = {
      setPrices: () => f.owner.setPrices([]),
      setAvailability: () => f.owner.setAvailability([], false),
      setVisibility: () => f.owner.setVisibility([], "hidden"),
      removeFromPage: () => f.owner.removeFromPage([]),
      moveToSection: () => f.owner.moveToSection([], f.cold),
      addToPage: () => f.owner.addToPage([], f.terraceSection),
      deleteArticles: () => f.owner.deleteArticles([]),
    };
    for (const [name, run] of Object.entries(checks)) {
      expect(await codeOf(run()), name).toBe(MENU_ERROR.invalidInput);
    }
    expect(await world(f.t, f.svc)).toEqual(before);
    expect(await f.owner.deleteImpact([])).toBeNull();
  });

  test("201 distinct ids are menu/invalid_input for every action; deleteImpact answers null", async () => {
    const f = await fixture();
    const { articleIds, placementIds } = await seedMany(f, MENU_MAX_BULK_BATCH + 1);
    expect(new Set(articleIds).size).toBe(201);
    const before = await world(f.t, f.svc);

    const checks: Record<string, () => Promise<unknown>> = {
      setPrices: () =>
        f.owner.setPrices(
          articleIds.map((articleId) => ({ articleId, expectedPriceRsd: 100, priceRsd: 110 })),
        ),
      setAvailability: () => f.owner.setAvailability(articleIds, false),
      setVisibility: () => f.owner.setVisibility(placementIds, "hidden"),
      removeFromPage: () => f.owner.removeFromPage(placementIds),
      moveToSection: () => f.owner.moveToSection(placementIds, f.hot),
      addToPage: () => f.owner.addToPage(articleIds, f.terraceSection),
      deleteArticles: () => f.owner.deleteArticles(articleIds),
    };
    for (const [name, run] of Object.entries(checks)) {
      expect(await codeOf(run()), name).toBe(MENU_ERROR.invalidInput);
    }
    expect(await world(f.t, f.svc)).toEqual(before);
    expect(await f.owner.deleteImpact(articleIds)).toBeNull();
  });

  test("setVisibility accepts exactly 200 placements in one batch", async () => {
    const f = await fixture();
    const { placementIds } = await seedMany(f, 200);
    const before = await draftOf(f.t, f.svc);
    expect(await f.owner.setVisibility(placementIds, "hidden")).toEqual({ changed: 200 });
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
  });

  test("setAvailability accepts exactly 200 articles in one batch", async () => {
    const f = await fixture();
    const { articleIds } = await seedMany(f, 200);
    expect(await f.owner.setAvailability(articleIds, false)).toEqual({ available: false, changed: 200 });
    expect(await unavailableKeys(f.t, f.w.ownerId, f.svc)).toHaveLength(200);
  });

  test("setPrices accepts exactly 200 changes in one batch", async () => {
    const f = await fixture();
    const { articleIds } = await seedMany(f, 200);
    const before = await draftOf(f.t, f.svc);
    const result = await f.owner.setPrices(
      articleIds.map((articleId) => ({ articleId, expectedPriceRsd: 100, priceRsd: 110 })),
    );
    expect(result).toEqual({ status: "changed", changed: 200 });
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
  });

  test("removeFromPage, moveToSection and addToPage accept exactly 200", async () => {
    const f = await fixture();
    const { articleIds, placementIds } = await seedMany(f, 200);
    expect(await f.owner.addToPage(articleIds, f.terraceSection)).toEqual({ added: 200, skipped: 0 });
    expect(await f.owner.moveToSection(placementIds, f.hot)).toEqual({ moved: 200, skipped: 0 });
    expect(await f.owner.removeFromPage(placementIds)).toEqual({ removed: 200 });
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("deleteImpact and deleteArticles accept exactly 200; the counters follow", async () => {
    const f = await fixture();
    const { articleIds } = await seedMany(f, 200);
    const impact = await f.owner.deleteImpact(articleIds);
    expect(impact?.articles).toHaveLength(200);
    expect(await deleteConfirmed(f.owner, articleIds)).toEqual({ status: "deleted", deleted: 200 });
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(4);
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("ids are de-duplicated first: 300 copies of one id are one id", async () => {
    const f = await fixture();
    const copies = Array.from({ length: 300 }, () => f.espresso.placementId);
    expect(await f.owner.setVisibility(copies, "hidden")).toEqual({ changed: 1 });
    const articles = Array.from({ length: 300 }, () => f.espresso.articleId);
    expect(await f.owner.setAvailability(articles, false)).toEqual({ available: false, changed: 1 });
    expect((await f.owner.deleteImpact(articles))?.articles).toHaveLength(1);
  });

  test("200 distinct ids plus a repeat are 201 entries but still accepted", async () => {
    const f = await fixture();
    const { placementIds } = await seedMany(f, 200);
    expect(await f.owner.setVisibility([...placementIds, placementIds[0]], "hidden")).toEqual({
      changed: 200,
    });
  });
});

// =============================================================================
// 4. setPrices
// =============================================================================

describe("setPrices", () => {
  test("one stale expected price: a conflict, NEITHER price changes, the revision does not move", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);

    const result = await f.owner.setPrices([
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
      { articleId: f.kafa.articleId, expectedPriceRsd: 100, priceRsd: 130 },
    ]);

    expect(result).toEqual({
      status: "conflict",
      conflicts: [{ articleId: f.kafa.articleId, currentPriceRsd: 120, attemptedPriceRsd: 130 }],
    });
    expect(await world(f.t, f.svc)).toEqual(before);
    expect((await articleDoc(f.t, f.espresso.articleId))?.basePriceRsd).toBe(150);
    expect((await articleDoc(f.t, f.kafa.articleId))?.basePriceRsd).toBe(120);
  });

  test("every stale article is listed, in the order given, with the price it has now", async () => {
    const f = await fixture();
    // Someone else changed Espresso meanwhile.
    await as(f.t, f.w.managerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.espresso.articleId,
      expectedPriceRsd: 150,
      priceRsd: 155,
    });
    const before = await world(f.t, f.svc);

    const result = await f.owner.setPrices([
      { articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 130 },
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
      { articleId: f.limunada.articleId, expectedPriceRsd: null, priceRsd: 260 },
    ]);

    expect(result).toEqual({
      status: "conflict",
      conflicts: [
        { articleId: f.espresso.articleId, currentPriceRsd: 155, attemptedPriceRsd: 160 },
        { articleId: f.limunada.articleId, currentPriceRsd: 250, attemptedPriceRsd: 260 },
      ],
    });
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("all fresh: both prices change and the revision moves exactly once", async () => {
    const f = await fixture();
    const before = await draftOf(f.t, f.svc);

    const result = await f.owner.setPrices([
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
      { articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 130 },
    ]);

    expect(result).toEqual({ status: "changed", changed: 2 });
    const espresso = await articleDoc(f.t, f.espresso.articleId);
    const kafa = await articleDoc(f.t, f.kafa.articleId);
    expect(espresso?.basePriceRsd).toBe(160);
    expect(kafa?.basePriceRsd).toBe(130);
    expect(espresso?.updatedByUserId).toBe(f.w.ownerId);
    expect(kafa?.updatedByUserId).toBe(f.w.ownerId);
    const after = await draftOf(f.t, f.svc);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.lastEditByUserId).toBe(f.w.ownerId);
    // The one shared price is what the page shows.
    const page = await content(f.t, f.w.ownerId, f.w.a.defaultPageId);
    expect(page.sections[0].placements.map((placement) => placement.article.basePriceRsd)).toEqual([
      160, 130, 200,
    ]);
  });

  test("the price is shared: an article shown on two pages changes on both", async () => {
    const f = await fixture();
    await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    await f.owner.setPrices([{ articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 170 }]);
    const onTerrace = await content(f.t, f.w.ownerId, f.terrace.pageId);
    expect(onTerrace.sections[0].placements[0].article.basePriceRsd).toBe(170);
  });

  test("the same prices again change nothing and do not move the revision", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    const result = await f.owner.setPrices([
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 150 },
      { articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 120 },
    ]);
    expect(result).toEqual({ status: "changed", changed: 0 });
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("one real change among no-ops counts only the real one", async () => {
    const f = await fixture();
    const before = await draftOf(f.t, f.svc);
    const result = await f.owner.setPrices([
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 150 },
      { articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 125 },
    ]);
    expect(result).toEqual({ status: "changed", changed: 1 });
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
  });

  test("an article without a price is expected as null; null against a priced article is a conflict", async () => {
    const f = await fixture();
    const unpriced = await quickAdd(f.t, f.w.ownerId, f.cold, "Voda");
    expect(
      await f.owner.setPrices([{ articleId: f.espresso.articleId, expectedPriceRsd: null, priceRsd: 160 }]),
    ).toEqual({
      status: "conflict",
      conflicts: [{ articleId: f.espresso.articleId, currentPriceRsd: 150, attemptedPriceRsd: 160 }],
    });
    expect(
      await f.owner.setPrices([{ articleId: unpriced.articleId, expectedPriceRsd: null, priceRsd: 90 }]),
    ).toEqual({ status: "changed", changed: 1 });
    expect((await articleDoc(f.t, unpriced.articleId))?.basePriceRsd).toBe(90);
    // The price is now 90, not "none" any more.
    expect(
      await f.owner.setPrices([{ articleId: unpriced.articleId, expectedPriceRsd: null, priceRsd: 95 }]),
    ).toMatchObject({ status: "conflict" });
  });

  test("a duplicated article is menu/invalid_input (the price the owner saw would be ambiguous)", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    expect(
      await codeOf(
        f.owner.setPrices([
          { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
          { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 170 },
        ]),
      ),
    ).toBe(MENU_ERROR.invalidInput);
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("a fractional, negative or too large price (new or expected) is menu/invalid_input", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    const one = (change: Partial<PriceChange>) =>
      f.owner.setPrices([
        { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160, ...change },
      ]);
    for (const priceRsd of [12.5, -1, MENU_MAX_PRICE_RSD + 1, Number.NaN]) {
      expect(await codeOf(one({ priceRsd })), `price ${priceRsd}`).toBe(MENU_ERROR.invalidInput);
    }
    for (const expectedPriceRsd of [12.5, -1, MENU_MAX_PRICE_RSD + 1]) {
      expect(await codeOf(one({ expectedPriceRsd })), `expected ${expectedPriceRsd}`).toBe(
        MENU_ERROR.invalidInput,
      );
    }
    expect(await world(f.t, f.svc)).toEqual(before);
    // The ceiling itself and zero are valid.
    expect(await one({ priceRsd: MENU_MAX_PRICE_RSD })).toEqual({ status: "changed", changed: 1 });
  });

  describe("combos", () => {
    test("a combo containing a changed article gets 'check the price' and keeps its own price", async () => {
      const f = await fixture();
      const combo = await addCombo(f);
      const before = await draftOf(f.t, f.svc);

      const result = await f.owner.setPrices([
        { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
        { articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 130 },
      ]);

      expect(result).toEqual({ status: "changed", changed: 2 });
      const flagged = await articleDoc(f.t, combo.articleId);
      expect(flagged?.basePriceRsd).toBe(250);
      expect(flagged?.priceCheck).toMatchObject({ removedComponentNames: [] });
      expect([...(flagged?.priceCheck?.changedComponentKeys ?? [])].sort()).toEqual(
        [f.espresso.key, f.kafa.key].sort(),
      );
      // Still one draft change, however many articles and combos it touched.
      expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
    });

    test("a combo that does not contain a changed article is left alone", async () => {
      const f = await fixture();
      const combo = await addCombo(f);
      await f.owner.setPrices([{ articleId: f.cappuccino.articleId, expectedPriceRsd: 200, priceRsd: 210 }]);
      expect((await articleDoc(f.t, combo.articleId))?.priceCheck).toBeUndefined();
    });

    test("a conflict flags nothing: the combo stays unflagged", async () => {
      const f = await fixture();
      const combo = await addCombo(f);
      const before = await world(f.t, f.svc);
      const result = await f.owner.setPrices([
        { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
        { articleId: f.kafa.articleId, expectedPriceRsd: 999, priceRsd: 130 },
      ]);
      expect(result).toMatchObject({ status: "conflict" });
      expect((await articleDoc(f.t, combo.articleId))?.priceCheck).toBeUndefined();
      expect(await world(f.t, f.svc)).toEqual(before);
    });

    test("a new price for the flagged combo itself clears the flag", async () => {
      const f = await fixture();
      const combo = await addCombo(f);
      await f.owner.setPrices([{ articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 }]);
      expect((await articleDoc(f.t, combo.articleId))?.priceCheck).toBeDefined();

      const result = await f.owner.setPrices([
        { articleId: combo.articleId, expectedPriceRsd: 250, priceRsd: 270 },
      ]);
      expect(result).toEqual({ status: "changed", changed: 1 });
      const cleared = await articleDoc(f.t, combo.articleId);
      expect(cleared?.basePriceRsd).toBe(270);
      expect(cleared?.priceCheck).toBeUndefined();
    });

    // K11 regression (found by the test worker): the combo's own new price in the SAME batch as
    // a component's is the owner's answer, as with two setBasePrice calls; in either order.
    test.each([
      ["component first", false],
      ["combo first", true],
    ])("a combo priced in the same batch as its component ends without the flag (%s)", async (_ime, komboPrvi) => {
      const f = await fixture();
      const combo = await addCombo(f);
      const komponenta = { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 };
      const kombo = { articleId: combo.articleId, expectedPriceRsd: 250, priceRsd: 270 };
      const result = await f.owner.setPrices(komboPrvi ? [kombo, komponenta] : [komponenta, kombo]);
      expect(result).toEqual({ status: "changed", changed: 2 });
      const doc = await articleDoc(f.t, combo.articleId);
      expect(doc?.basePriceRsd).toBe(270);
      expect(doc?.priceCheck).toBeUndefined();
    });
  });

  test("a manual Room service price keeps its value and gets the old/new base warning; a derived one needs nothing", async () => {
    const f = await fixture();
    const { manualId, derivedId } = await f.t.run(async (ctx) => {
      const now = Date.now();
      const categoryId = await ctx.db.insert("menuRoomServiceCategories", {
        menuServiceId: f.svc,
        key: newMenuKey("roomServiceCategory"),
        name: "Hrana u sobu",
        order: 1024,
        createdAt: now,
        updatedAt: now,
      });
      const manualId = await ctx.db.insert("menuRoomServiceItems", {
        menuServiceId: f.svc,
        categoryId,
        articleId: f.espresso.articleId,
        order: 1024,
        markupApplies: false,
        manualPriceRsd: 180,
        createdAt: now,
        updatedAt: now,
      });
      const derivedId = await ctx.db.insert("menuRoomServiceItems", {
        menuServiceId: f.svc,
        categoryId,
        articleId: f.kafa.articleId,
        order: 2048,
        markupApplies: false,
        createdAt: now,
        updatedAt: now,
      });
      return { manualId, derivedId };
    });

    await f.owner.setPrices([
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 170 },
      { articleId: f.kafa.articleId, expectedPriceRsd: 120, priceRsd: 130 },
    ]);

    const manual = await f.t.run(async (ctx) => ctx.db.get(manualId));
    const derived = await f.t.run(async (ctx) => ctx.db.get(derivedId));
    expect(manual?.manualPriceRsd).toBe(180);
    expect(manual?.priceWarning).toMatchObject({ oldBaseRsd: 150, newBaseRsd: 170 });
    expect(derived?.priceWarning).toBeUndefined();
  });
});

// =============================================================================
// 5. setAvailability (LIVE)
// =============================================================================

describe("setAvailability", () => {
  test("marks the articles unavailable at once: no draft revision, readers see it", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);

    expect(await f.owner.setAvailability([f.espresso.articleId, f.kafa.articleId], false)).toEqual({
      available: false,
      changed: 2,
    });

    expect(await unavailableKeys(f.t, f.w.ownerId, f.svc)).toEqual([f.espresso.key, f.kafa.key].sort());
    const after = await world(f.t, f.svc);
    expect(after.draft).toEqual(before.draft);
    // Only the availability layer moved.
    expect({ ...after, availability: [] }).toEqual({ ...before, availability: [] });
    expect(after.availability).toHaveLength(2);
    for (const row of after.availability) {
      expect(row.setByUserId).toBe(f.w.ownerId);
      expect(row.menuServiceId).toBe(f.svc);
    }
  });

  test("'changed' counts only real changes: already unavailable articles are not counted, and never duplicated", async () => {
    const f = await fixture();
    await f.owner.setAvailability([f.espresso.articleId], false);
    const again = await f.owner.setAvailability([f.espresso.articleId, f.kafa.articleId], false);
    expect(again).toEqual({ available: false, changed: 1 });
    expect(await f.owner.setAvailability([f.espresso.articleId, f.kafa.articleId], false)).toEqual({
      available: false,
      changed: 0,
    });
    expect((await world(f.t, f.svc)).availability).toHaveLength(2);
  });

  test("available:true deletes the rows and counts only the articles that had one", async () => {
    const f = await fixture();
    await f.owner.setAvailability([f.espresso.articleId, f.kafa.articleId], false);

    const result = await f.owner.setAvailability([f.espresso.articleId, f.limunada.articleId], true);

    expect(result).toEqual({ available: true, changed: 1 });
    expect(await unavailableKeys(f.t, f.w.ownerId, f.svc)).toEqual([f.kafa.key]);
    expect(await f.owner.setAvailability([f.espresso.articleId], true)).toEqual({
      available: true,
      changed: 0,
    });
    expect((await world(f.t, f.svc)).availability).toHaveLength(1);
  });

  test("never moves the draft revision, in any direction", async () => {
    const f = await fixture();
    const before = await draftOf(f.t, f.svc);
    await f.owner.setAvailability([f.espresso.articleId], false);
    await f.owner.setAvailability([f.espresso.articleId], true);
    await f.owner.setAvailability([f.espresso.articleId], true);
    expect(await draftOf(f.t, f.svc)).toEqual(before);
  });

  test("the row carries the stable article key and the caller", async () => {
    const f = await fixture();
    await bulkAs(f, f.w.editorId).setAvailability([f.cappuccino.articleId], false);
    const rows = (await world(f.t, f.svc)).availability;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ articleKey: f.cappuccino.key, setByUserId: f.w.editorId });
  });

  test("an article of another tenant in the batch is menu/not_found and nothing is written", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    expect(await codeOf(f.owner.setAvailability([f.kafa.articleId, f.foreign.articleId], false))).toBe(
      MENU_ERROR.notFound,
    );
    expect(await world(f.t, f.svc)).toEqual(before);
  });
});

// =============================================================================
// 6. setVisibility
// =============================================================================

describe("setVisibility", () => {
  test("hides and shows placements; they keep their place; the revision moves once per batch", async () => {
    const f = await fixture();
    const before = await draftOf(f.t, f.svc);
    const pageBefore = await content(f.t, f.w.ownerId, f.w.a.defaultPageId);

    expect(
      await f.owner.setVisibility(
        [f.espresso.placementId, f.cappuccino.placementId, f.limunada.placementId],
        "hidden",
      ),
    ).toEqual({ changed: 3 });
    const hidden = await content(f.t, f.w.ownerId, f.w.a.defaultPageId);
    expect(hidden.sections.map((s) => s.placements.map((p) => [p.article.name, p.visibility]))).toEqual([
      [
        ["Espresso", "hidden"],
        ["Kafa", "visible"],
        ["Cappuccino", "hidden"],
      ],
      [["Limunada", "hidden"]],
    ]);
    expect(hidden.sections.map((s) => s.placements.map((p) => p.order))).toEqual(
      pageBefore.sections.map((s) => s.placements.map((p) => p.order)),
    );
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);

    expect(
      await f.owner.setVisibility(
        [f.espresso.placementId, f.cappuccino.placementId, f.limunada.placementId],
        "visible",
      ),
    ).toEqual({ changed: 3 });
    expect(await content(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual(pageBefore);
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 2);
  });

  test("'changed' counts only placements that really change", async () => {
    const f = await fixture();
    await f.owner.setVisibility([f.espresso.placementId], "hidden");
    const before = await draftOf(f.t, f.svc);
    expect(
      await f.owner.setVisibility([f.espresso.placementId, f.kafa.placementId, f.cappuccino.placementId], "hidden"),
    ).toEqual({ changed: 2 });
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
  });

  test("a batch that changes nothing is not a draft change", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    expect(await f.owner.setVisibility([f.espresso.placementId, f.kafa.placementId], "visible")).toEqual({
      changed: 0,
    });
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("placements of several pages go in one batch", async () => {
    const f = await fixture();
    const onTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    const before = await draftOf(f.t, f.svc);
    expect(await f.owner.setVisibility([f.espresso.placementId, onTerrace], "hidden")).toEqual({ changed: 2 });
    expect((await placementDoc(f.t, onTerrace))?.visibility).toBe("hidden");
    expect((await placementDoc(f.t, f.espresso.placementId))?.visibility).toBe("hidden");
    // The article itself is the same one: its other appearances are separate rows.
    expect((await placementDoc(f.t, f.kafa.placementId))?.visibility).toBe("visible");
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
  });

  test("a placement of an archived page refuses the whole batch (menu/page_archived)", async () => {
    const f = await fixture();
    const onTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    await as(f.t, f.w.ownerId).mutation(api.menuPages.archive, { pageId: f.terrace.pageId });
    const before = await world(f.t, f.svc);

    expect(await codeOf(f.owner.setVisibility([f.kafa.placementId, onTerrace], "hidden"))).toBe(
      MENU_ERROR.pageArchived,
    );
    expect(await world(f.t, f.svc)).toEqual(before);
  });
});

// =============================================================================
// 7. removeFromPage
// =============================================================================

describe("removeFromPage", () => {
  test("the placements go, the articles stay, each page's counter goes down by its own number", async () => {
    const f = await fixture();
    const espressoOnTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.kafa.articleId);
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(4);
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(2);
    const before = await draftOf(f.t, f.svc);

    const result = await f.owner.removeFromPage([
      f.espresso.placementId,
      espressoOnTerrace,
      f.kafa.placementId,
    ]);

    expect(result).toEqual({ removed: 3 });
    expect(await placementDoc(f.t, f.espresso.placementId)).toBeNull();
    expect(await placementDoc(f.t, f.kafa.placementId)).toBeNull();
    expect(await placementDoc(f.t, espressoOnTerrace)).toBeNull();
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(2);
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(1);
    // "Ukloni sa ove stranice" is not "Obriši": both articles still exist, and Kafa is still on the terrace.
    expect(await articleDoc(f.t, f.espresso.articleId)).not.toBeNull();
    expect(await articleDoc(f.t, f.kafa.articleId)).not.toBeNull();
    expect(await layout(f.t, f.w.ownerId, f.terrace.pageId)).toEqual([
      { section: "Na terasi", articles: ["Kafa"] },
    ]);
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Cappuccino"] },
      { section: "Hladni napici", articles: ["Limunada"] },
    ]);
    const after = await draftOf(f.t, f.svc);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount);
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("a placement of an archived page refuses the whole batch (menu/page_archived)", async () => {
    const f = await fixture();
    const onTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    await as(f.t, f.w.ownerId).mutation(api.menuPages.archive, { pageId: f.terrace.pageId });
    const before = await world(f.t, f.svc);

    expect(await codeOf(f.owner.removeFromPage([f.kafa.placementId, onTerrace]))).toBe(
      MENU_ERROR.pageArchived,
    );
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("a placement that is already gone is menu/not_found and the others stay", async () => {
    const f = await fixture();
    await f.owner.removeFromPage([f.kafa.placementId]);
    const before = await world(f.t, f.svc);
    expect(await codeOf(f.owner.removeFromPage([f.espresso.placementId, f.kafa.placementId]))).toBe(
      MENU_ERROR.notFound,
    );
    expect(await world(f.t, f.svc)).toEqual(before);
  });
});

// =============================================================================
// 8. moveToSection
// =============================================================================

describe("moveToSection", () => {
  test("appends after the existing rows of the target, in page order (not in the order given)", async () => {
    const f = await fixture();
    const before = await draftOf(f.t, f.svc);

    // Given Cappuccino first, but Espresso comes first on the page.
    const result = await f.owner.moveToSection([f.cappuccino.placementId, f.espresso.placementId], f.cold);

    expect(result).toEqual({ moved: 2, skipped: 0 });
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Kafa"] },
      { section: "Hladni napici", articles: ["Limunada", "Espresso", "Cappuccino"] },
    ]);
    const cold = (await content(f.t, f.w.ownerId, f.w.a.defaultPageId)).sections[1].placements;
    const orders = cold.map((placement) => placement.order);
    expect(orders[0]).toBe(1024); // Limunada did not move
    expect(orders[1]).toBeGreaterThan(orders[0]);
    expect(orders[2]).toBeGreaterThan(orders[1]);
    // The same placement rows moved: ids and visibility are kept.
    expect(cold[1].placementId).toBe(f.espresso.placementId);
    expect(cold[2].placementId).toBe(f.cappuccino.placementId);
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("placements from several sections keep the page order: sections first, then rows", async () => {
    const f = await fixture();
    const other = (await addSection(f.t, f.w.ownerId, f.w.a.defaultPageId, "Ostalo")).sectionId;

    const result = await f.owner.moveToSection(
      [f.limunada.placementId, f.kafa.placementId, f.espresso.placementId],
      other,
    );

    expect(result).toEqual({ moved: 3, skipped: 0 });
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Cappuccino"] },
      { section: "Hladni napici", articles: [] },
      { section: "Ostalo", articles: ["Espresso", "Kafa", "Limunada"] },
    ]);
  });

  test("skips a row already in the target and a row whose article the target already shows", async () => {
    const f = await fixture();
    // Espresso is now ALSO in the cold section.
    const espressoCold = await addPlacement(f.t, f.w.ownerId, f.cold, f.espresso.articleId);
    const before = await draftOf(f.t, f.svc);

    const result = await f.owner.moveToSection(
      [f.espresso.placementId, espressoCold, f.kafa.placementId],
      f.cold,
    );

    // The hot Espresso: cold already shows Espresso. The cold one: already there. Kafa moves.
    expect(result).toEqual({ moved: 1, skipped: 2 });
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Espresso", "Cappuccino"] },
      { section: "Hladni napici", articles: ["Limunada", "Espresso", "Kafa"] },
    ]);
    expect((await placementDoc(f.t, espressoCold))?.sectionId).toBe(f.cold);
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("when everything is skipped nothing is written, not even a revision", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    expect(await f.owner.moveToSection([f.kafa.placementId, f.espresso.placementId], f.hot)).toEqual({
      moved: 0,
      skipped: 2,
    });
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("two placements of one article in the batch: the first (in page order) moves, the other is skipped", async () => {
    const f = await fixture();
    const espressoCold = await addPlacement(f.t, f.w.ownerId, f.cold, f.espresso.articleId);
    const other = (await addSection(f.t, f.w.ownerId, f.w.a.defaultPageId, "Ostalo")).sectionId;

    const result = await f.owner.moveToSection([espressoCold, f.espresso.placementId], other);

    expect(result).toEqual({ moved: 1, skipped: 1 });
    expect((await placementDoc(f.t, f.espresso.placementId))?.sectionId).toBe(other);
    expect((await placementDoc(f.t, espressoCold))?.sectionId).toBe(f.cold);
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Kafa", "Cappuccino"] },
      { section: "Hladni napici", articles: ["Limunada", "Espresso"] },
      { section: "Ostalo", articles: ["Espresso"] },
    ]);
  });

  test("a placement of ANOTHER page is menu/invalid_input and the valid ones in the batch do not move", async () => {
    const f = await fixture();
    const onTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.limunada.articleId);
    const before = await world(f.t, f.svc);

    // Target on the default page, one placement from the terrace.
    expect(await codeOf(f.owner.moveToSection([f.espresso.placementId, onTerrace], f.cold))).toBe(
      MENU_ERROR.invalidInput,
    );
    // Target on the terrace, placements of the default page.
    expect(await codeOf(f.owner.moveToSection([f.espresso.placementId], f.terraceSection))).toBe(
      MENU_ERROR.invalidInput,
    );
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("an archived target page is menu/page_archived", async () => {
    const f = await fixture();
    const onTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    const second = (await addSection(f.t, f.w.ownerId, f.terrace.pageId, "Večernja karta")).sectionId;
    await as(f.t, f.w.ownerId).mutation(api.menuPages.archive, { pageId: f.terrace.pageId });
    const before = await world(f.t, f.svc);
    expect(await codeOf(f.owner.moveToSection([onTerrace], second))).toBe(MENU_ERROR.pageArchived);
    expect(await world(f.t, f.svc)).toEqual(before);
  });
});

// =============================================================================
// 9. addToPage
// =============================================================================

describe("addToPage", () => {
  test("shows the articles in a section of another page, in the order given; that page's counter goes up", async () => {
    const f = await fixture();
    const before = await draftOf(f.t, f.svc);

    const result = await f.owner.addToPage([f.kafa.articleId, f.espresso.articleId], f.terraceSection);

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(await layout(f.t, f.w.ownerId, f.terrace.pageId)).toEqual([
      { section: "Na terasi", articles: ["Kafa", "Espresso"] },
    ]);
    const terrace = await content(f.t, f.w.ownerId, f.terrace.pageId);
    const placements = terrace.sections[0].placements;
    expect(placements[1].order).toBeGreaterThan(placements[0].order);
    expect(placements.every((placement) => placement.visibility === "visible")).toBe(true);
    // The same articles, not copies: one price for both pages.
    expect(placements.map((placement) => placement.article.articleId)).toEqual([
      f.kafa.articleId,
      f.espresso.articleId,
    ]);
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(2);
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(4);
    const after = await draftOf(f.t, f.svc);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount);
    await expectCountersMatchRows(f.t, f.svc);

    await f.owner.setPrices([{ articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 165 }]);
    const shared = await content(f.t, f.w.ownerId, f.terrace.pageId);
    expect(shared.sections[0].placements[1].article.basePriceRsd).toBe(165);
  });

  test("appends after the rows the section already has", async () => {
    const f = await fixture();
    await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.limunada.articleId);
    await f.owner.addToPage([f.cappuccino.articleId], f.terraceSection);
    expect(await layout(f.t, f.w.ownerId, f.terrace.pageId)).toEqual([
      { section: "Na terasi", articles: ["Limunada", "Cappuccino"] },
    ]);
  });

  test("an article the section already shows is skipped, the others are added", async () => {
    const f = await fixture();
    await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
    const before = await draftOf(f.t, f.svc);

    const result = await f.owner.addToPage([f.espresso.articleId, f.cappuccino.articleId], f.terraceSection);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(await layout(f.t, f.w.ownerId, f.terrace.pageId)).toEqual([
      { section: "Na terasi", articles: ["Espresso", "Cappuccino"] },
    ]);
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(2);
    expect((await draftOf(f.t, f.svc)).revision).toBe(before.revision + 1);
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("when every article is a duplicate nothing is written, not even a revision", async () => {
    const f = await fixture();
    const before = await world(f.t, f.svc);
    // They are all in the hot / cold sections already.
    expect(await f.owner.addToPage([f.espresso.articleId, f.kafa.articleId], f.hot)).toEqual({
      added: 0,
      skipped: 2,
    });
    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("another section of the SAME page is allowed (an article may appear in several sections)", async () => {
    const f = await fixture();
    expect(await f.owner.addToPage([f.espresso.articleId], f.cold)).toEqual({ added: 1, skipped: 0 });
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Espresso", "Kafa", "Cappuccino"] },
      { section: "Hladni napici", articles: ["Limunada", "Espresso"] },
    ]);
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(5);
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("repeated ids in the batch are added once", async () => {
    const f = await fixture();
    const result = await f.owner.addToPage(
      [f.kafa.articleId, f.kafa.articleId, f.kafa.articleId],
      f.terraceSection,
    );
    expect(result).toEqual({ added: 1, skipped: 0 });
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(1);
  });

  test("a combo can be added like any article", async () => {
    const f = await fixture();
    const combo = await addCombo(f);
    expect(await f.owner.addToPage([combo.articleId], f.terraceSection)).toEqual({ added: 1, skipped: 0 });
    await expectCountersMatchRows(f.t, f.svc);
  });

  test("the page ceiling refuses the whole batch with menu/limit_reached", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) =>
      ctx.db.patch(f.terrace.pageId, { placementCount: MENU_MAX_PLACEMENTS_PER_PAGE - 1 }),
    );
    const before = await world(f.t, f.svc);

    expect(await codeOf(f.owner.addToPage([f.espresso.articleId, f.kafa.articleId], f.terraceSection))).toBe(
      MENU_ERROR.limitReached,
    );
    expect(await world(f.t, f.svc)).toEqual(before);

    // One article fits exactly.
    expect(await f.owner.addToPage([f.espresso.articleId], f.terraceSection)).toEqual({ added: 1, skipped: 0 });
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(MENU_MAX_PLACEMENTS_PER_PAGE);
  });

  test("a section of an archived page is menu/page_archived", async () => {
    const f = await fixture();
    await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.limunada.articleId);
    await as(f.t, f.w.ownerId).mutation(api.menuPages.archive, { pageId: f.terrace.pageId });
    const before = await world(f.t, f.svc);
    expect(await codeOf(f.owner.addToPage([f.espresso.articleId], f.terraceSection))).toBe(
      MENU_ERROR.pageArchived,
    );
    expect(await world(f.t, f.svc)).toEqual(before);
  });
});

// =============================================================================
// 10. pageSections
// =============================================================================

describe("pageSections", () => {
  test("owner, manager, editor and admin get the sections of the page in order", async () => {
    const f = await fixture();
    const page = await pageDoc(f.t, f.w.a.defaultPageId);
    for (const userId of [f.w.ownerId, f.w.managerId, f.w.editorId, f.w.adminId]) {
      expect(await bulkAs(f, userId).pageSections(f.w.a.defaultPageId)).toEqual({
        pageId: f.w.a.defaultPageId,
        name: page?.name,
        archived: false,
        sections: [
          { sectionId: f.hot, name: "Topli napici" },
          { sectionId: f.cold, name: "Hladni napici" },
        ],
      });
    }
  });

  test("a page without sections has an empty list; an archived page is flagged", async () => {
    const f = await fixture();
    const empty = await addPage(f.t, f.w.ownerId, f.svc, "Prazna");
    expect(await f.owner.pageSections(empty.pageId)).toEqual({
      pageId: empty.pageId,
      name: "Prazna",
      archived: false,
      sections: [],
    });
    await as(f.t, f.w.ownerId).mutation(api.menuPages.archive, { pageId: f.terrace.pageId });
    expect(await f.owner.pageSections(f.terrace.pageId)).toEqual({
      pageId: f.terrace.pageId,
      name: "Terasa",
      archived: true,
      sections: [{ sectionId: f.terraceSection, name: "Na terasi" }],
    });
  });

  test("the sections follow a new section and the page order", async () => {
    const f = await fixture();
    const third = (await addSection(f.t, f.w.ownerId, f.w.a.defaultPageId, "Ostalo")).sectionId;
    const result = await f.owner.pageSections(f.w.a.defaultPageId);
    expect(result?.sections.map((section) => section.sectionId)).toEqual([f.hot, f.cold, third]);
  });

  test("null for a signed-out caller, finance, view-only, an outsider and the owner of another tenant", async () => {
    const f = await fixture();
    expect(await bulkAs(f, null).pageSections(f.w.a.defaultPageId)).toBeNull();
    for (const userId of [f.w.financeId, f.w.viewOnlyId, f.w.outsiderId, f.w.otherOwnerId]) {
      expect(await bulkAs(f, userId).pageSections(f.w.a.defaultPageId)).toBeNull();
    }
    // Each owner reads only their own page.
    expect(await bulkAs(f, f.w.otherOwnerId).pageSections(f.w.b.defaultPageId)).toMatchObject({
      sections: [{ sectionId: f.sectionB, name: "Pića" }],
    });
  });
});

// =============================================================================
// 11. deleteImpact
// =============================================================================

/**
 * Espresso: twice on the default page (hot + cold) and once on the terrace.
 * Kafa: once on the default page and once on the terrace. "Doručak" combo
 * (Espresso + Kafa) on the default page.
 */
async function impactFixture() {
  const f = await fixture();
  const combo = await addCombo(f);
  const espressoCold = await addPlacement(f.t, f.w.ownerId, f.cold, f.espresso.articleId);
  const espressoTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.espresso.articleId);
  const kafaTerrace = await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.kafa.articleId);
  const defaultPage = await pageDoc(f.t, f.w.a.defaultPageId);
  if (!defaultPage) throw new Error("default page missing");
  return { ...f, combo, espressoCold, espressoTerrace, kafaTerrace, defaultPage };
}

describe("deleteImpact", () => {
  test("lists, per article, the pages (with names and counts) and the combos that contain it", async () => {
    const f = await impactFixture();
    const impact = await f.owner.deleteImpact([f.espresso.articleId, f.kafa.articleId]);

    expect(impact).not.toBeNull();
    expect(impact?.overLimit).toBe(false);
    expect(impact?.confirmToken).toMatch(/^bulk1#/);
    expect(impact?.articles).toEqual([
      {
        articleKey: f.espresso.key,
        pages: [
          { pageKey: f.defaultPage.key, name: f.defaultPage.name, archived: false, placements: 2 },
          { pageKey: f.terrace.key, name: "Terasa", archived: false, placements: 1 },
        ],
        combos: [{ articleKey: f.combo.key, name: "Doručak" }],
        comboComponents: 0,
        variants: 0,
        addonGroupLinks: 0,
        inRoomService: false,
        unavailable: false,
        articleId: f.espresso.articleId,
        name: "Espresso",
        kind: "item",
      },
      {
        articleKey: f.kafa.key,
        pages: [
          { pageKey: f.defaultPage.key, name: f.defaultPage.name, archived: false, placements: 1 },
          { pageKey: f.terrace.key, name: "Terasa", archived: false, placements: 1 },
        ],
        combos: [{ articleKey: f.combo.key, name: "Doručak" }],
        comboComponents: 0,
        variants: 0,
        addonGroupLinks: 0,
        inRoomService: false,
        unavailable: false,
        articleId: f.kafa.articleId,
        name: "Kafa",
        kind: "item",
      },
    ]);
  });

  test("a combo reports its own components; an archived page is flagged; unavailable is flagged", async () => {
    const f = await impactFixture();
    await as(f.t, f.w.ownerId).mutation(api.menuPages.archive, { pageId: f.terrace.pageId });
    await f.owner.setAvailability([f.cappuccino.articleId], false);

    const impact = await f.owner.deleteImpact([f.combo.articleId, f.cappuccino.articleId, f.kafa.articleId]);

    const [combo, cappuccino, kafa] = impact!.articles;
    expect(combo).toMatchObject({ name: "Doručak", kind: "combo", comboComponents: 2, combos: [] });
    expect(combo.pages).toEqual([
      { pageKey: f.defaultPage.key, name: f.defaultPage.name, archived: false, placements: 1 },
    ]);
    expect(cappuccino).toMatchObject({ name: "Cappuccino", unavailable: true });
    expect(kafa.pages.map((page) => [page.name, page.archived])).toEqual([
      [f.defaultPage.name, false],
      ["Terasa", true],
    ]);
  });

  test("the token follows the batch, not the order of the ids", async () => {
    const f = await impactFixture();
    const forward = await f.owner.deleteImpact([f.espresso.articleId, f.kafa.articleId]);
    const backward = await f.owner.deleteImpact([f.kafa.articleId, f.espresso.articleId]);
    const onlyOne = await f.owner.deleteImpact([f.espresso.articleId]);
    expect(forward?.confirmToken).toBe(backward?.confirmToken);
    expect(forward?.confirmToken).not.toBe(onlyOne?.confirmToken);
  });

  test("ids are de-duplicated; a deleted article makes the whole answer null", async () => {
    const f = await impactFixture();
    const once = await f.owner.deleteImpact([f.espresso.articleId, f.espresso.articleId]);
    expect(once?.articles).toHaveLength(1);

    await deleteConfirmed(f.owner, [f.cappuccino.articleId]);
    expect(await f.owner.deleteImpact([f.espresso.articleId, f.cappuccino.articleId])).toBeNull();
  });

  test("it is a read: nothing is written", async () => {
    const f = await impactFixture();
    const before = await world(f.t, f.svc);
    await f.owner.deleteImpact([f.espresso.articleId, f.kafa.articleId]);
    expect(await world(f.t, f.svc)).toEqual(before);
  });
});

// =============================================================================
// 12. deleteArticles
// =============================================================================

describe("deleteArticles", () => {
  test("without a token, or with a wrong one, the answer is 'confirm' with the impact and NOTHING is written", async () => {
    const f = await impactFixture();
    const ids = [f.espresso.articleId, f.kafa.articleId];
    const impact = await f.owner.deleteImpact(ids);
    const before = await world(f.t, f.svc);

    const asked = asConfirm(await f.owner.deleteArticles(ids));
    expect(asked.confirmToken).toBe(impact?.confirmToken);
    expect(asked.articles).toEqual(impact?.articles);

    const wrong = asConfirm(await f.owner.deleteArticles(ids, "bulk1#nije-token"));
    expect(wrong.confirmToken).toBe(impact?.confirmToken);

    // The token of ANOTHER batch does not confirm this one.
    const other = await f.owner.deleteImpact([f.cappuccino.articleId]);
    const mismatched = asConfirm(await f.owner.deleteArticles(ids, other?.confirmToken));
    expect(mismatched.confirmToken).toBe(impact?.confirmToken);

    expect(await world(f.t, f.svc)).toEqual(before);
  });

  test("with the token everything goes at once: placements on all pages, counters, combo flag, draft count", async () => {
    const f = await impactFixture();
    // Default page: Espresso x2, Kafa, Cappuccino, Limunada, Doručak. Terrace: Espresso, Kafa.
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(6);
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(2);
    const before = await draftOf(f.t, f.svc);
    const ids = [f.espresso.articleId, f.kafa.articleId];

    const result = await deleteConfirmed(f.owner, ids);

    expect(result).toEqual({ status: "deleted", deleted: 2 });
    // Gone: the articles and every appearance on every page.
    expect(await articleDoc(f.t, f.espresso.articleId)).toBeNull();
    expect(await articleDoc(f.t, f.kafa.articleId)).toBeNull();
    for (const placementId of [
      f.espresso.placementId,
      f.kafa.placementId,
      f.espressoCold,
      f.espressoTerrace,
      f.kafaTerrace,
    ]) {
      expect(await placementDoc(f.t, placementId)).toBeNull();
    }
    expect(await layout(f.t, f.w.ownerId, f.w.a.defaultPageId)).toEqual([
      { section: "Topli napici", articles: ["Cappuccino", "Doručak"] },
      { section: "Hladni napici", articles: ["Limunada"] },
    ]);
    expect(await layout(f.t, f.w.ownerId, f.terrace.pageId)).toEqual([{ section: "Na terasi", articles: [] }]);

    // The page that held THREE rows of the two articles goes down by three, the terrace by two.
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(3);
    expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(0);
    await expectCountersMatchRows(f.t, f.svc);

    // The combo lost both components and says so; its price is untouched.
    const combo = await articleDoc(f.t, f.combo.articleId);
    expect(combo?.basePriceRsd).toBe(250);
    expect(combo?.priceCheck?.changedComponentKeys).toEqual([]);
    expect([...(combo?.priceCheck?.removedComponentNames ?? [])].sort()).toEqual(["Espresso", "Kafa"]);
    expect((await world(f.t, f.svc)).components).toEqual([]);

    // One draft change for the whole batch; two articles fewer.
    const after = await draftOf(f.t, f.svc);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount - 2);
    expect(after.lastEditByUserId).toBe(f.w.ownerId);

    // One audit row per deleted article.
    const audit = (await world(f.t, f.svc)).audit.filter((row) => row.action === "article.deleted");
    expect(audit.map((row) => row.entityKey).sort()).toEqual([f.espresso.key, f.kafa.key].sort());

    // The other tenant is untouched and the deleted ids are gone for the readers.
    expect(await f.owner.deleteImpact(ids)).toBeNull();
    expect((await articleDoc(f.t, f.foreign.articleId))?.name).toBe("Espresso");
  });

  test("two articles on the same page: the counter drops by both (the bulk case)", async () => {
    const f = await fixture();
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(4);
    await deleteConfirmed(f.owner, [f.espresso.articleId, f.kafa.articleId, f.cappuccino.articleId]);
    expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(1);
    await expectCountersMatchRows(f.t, f.svc);
  });

  for (const order of ["combo first", "component first"] as const) {
    test(`a combo AND one of its components in the same batch (${order}) is deleted without error`, async () => {
      const f = await impactFixture();
      const ids =
        order === "combo first"
          ? [f.combo.articleId, f.espresso.articleId]
          : [f.espresso.articleId, f.combo.articleId];
      const before = await draftOf(f.t, f.svc);

      const result = await deleteConfirmed(f.owner, ids);

      expect(result).toEqual({ status: "deleted", deleted: 2 });
      expect(await articleDoc(f.t, f.combo.articleId)).toBeNull();
      expect(await articleDoc(f.t, f.espresso.articleId)).toBeNull();
      // The other component and its appearances are untouched.
      expect(await articleDoc(f.t, f.kafa.articleId)).not.toBeNull();
      expect(await placementDoc(f.t, f.kafaTerrace)).not.toBeNull();
      // No component row survives for the deleted combo.
      expect((await world(f.t, f.svc)).components).toEqual([]);
      // Default page: Espresso x2 and the combo went, Kafa/Cappuccino/Limunada stay.
      expect((await pageDoc(f.t, f.w.a.defaultPageId))?.placementCount).toBe(3);
      expect((await pageDoc(f.t, f.terrace.pageId))?.placementCount).toBe(1);
      await expectCountersMatchRows(f.t, f.svc);
      const after = await draftOf(f.t, f.svc);
      expect(after.revision).toBe(before.revision + 1);
      expect(after.articleCount).toBe(before.articleCount - 2);
    });
  }

  test("the token is the same whatever the order of the ids", async () => {
    const f = await impactFixture();
    const a = asConfirm(await f.owner.deleteArticles([f.combo.articleId, f.espresso.articleId]));
    const b = asConfirm(await f.owner.deleteArticles([f.espresso.articleId, f.combo.articleId]));
    expect(a.confirmToken).toBe(b.confirmToken);
    // A token read before works for the reversed order too.
    expect(await f.owner.deleteArticles([f.espresso.articleId, f.combo.articleId], a.confirmToken)).toEqual({
      status: "deleted",
      deleted: 2,
    });
  });

  test("an impact that changed after the token was read is a 'confirm' again, with the new token", async () => {
    const f = await impactFixture();
    const ids = [f.espresso.articleId];
    const seen = await f.owner.deleteImpact(ids);
    const staleToken = seen!.confirmToken;

    // Meanwhile Espresso appears on one more section of the terrace.
    const extra = (await addSection(f.t, f.w.ownerId, f.terrace.pageId, "Večernja karta")).sectionId;
    await addPlacement(f.t, f.w.ownerId, extra, f.espresso.articleId);
    const before = await world(f.t, f.svc);

    const again = asConfirm(await f.owner.deleteArticles(ids, staleToken));
    expect(again.confirmToken).not.toBe(staleToken);
    expect(again.articles[0].pages.find((page) => page.name === "Terasa")?.placements).toBe(2);
    expect(await world(f.t, f.svc)).toEqual(before);

    // The new token deletes.
    expect(await f.owner.deleteArticles(ids, again.confirmToken)).toEqual({ status: "deleted", deleted: 1 });
    expect(await articleDoc(f.t, f.espresso.articleId)).toBeNull();
  });

  test("a changed availability also invalidates the token", async () => {
    const f = await impactFixture();
    const ids = [f.cappuccino.articleId];
    const seen = await f.owner.deleteImpact(ids);
    await f.owner.setAvailability(ids, false);
    const again = asConfirm(await f.owner.deleteArticles(ids, seen!.confirmToken));
    expect(again.confirmToken).not.toBe(seen!.confirmToken);
    expect(await articleDoc(f.t, f.cappuccino.articleId)).not.toBeNull();
  });

  test("an editor deletes too (menu.edit); a combo-only batch works", async () => {
    const f = await impactFixture();
    const result = await deleteConfirmed(bulkAs(f, f.w.editorId), [f.combo.articleId]);
    expect(result).toEqual({ status: "deleted", deleted: 1 });
    // The components stay; nothing is flagged because the combo is gone.
    expect(await articleDoc(f.t, f.espresso.articleId)).not.toBeNull();
    expect((await world(f.t, f.svc)).components).toEqual([]);
    await expectCountersMatchRows(f.t, f.svc);
  });
});

// =============================================================================
// 13. Draft only: guests read the published menu until the next publish
// =============================================================================

type GuestMenu = { section: string; articles: string[] }[];

async function publishDraft(t: T, w: MenuWorldSeed) {
  const preview = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
    menuServiceId: w.a.menuServiceId,
  });
  if (!preview) throw new Error("expected a publish preview");
  const result = await as(t, w.ownerId).mutation(api.menuPublishing.publish, {
    menuServiceId: w.a.menuServiceId,
    expectedRevision: preview.revision,
    ...(preview.warnings.length > 0 ? { acknowledgedWarnings: preview.fingerprint } : {}),
  });
  expect(result).toMatchObject({ ok: true });
}

/** What a guest reads for one page of the published menu: sections with "Name price". */
async function guestMenu(t: T, pageSlug: string): Promise<GuestMenu | null> {
  const result = await t.query(api.menuPublic.page, { slug: SLUG_A, pageSlug });
  if (!result || result.kind !== "page") return null;
  return result.sections.map((section) => ({
    section: section.name,
    articles: section.articles.map((article) => `${article.name} ${article.priceRsd}`),
  }));
}

const PUBLISHED_DEFAULT: GuestMenu = [
  { section: "Topli napici", articles: ["Espresso 150", "Kafa 120", "Cappuccino 200"] },
  { section: "Hladni napici", articles: ["Limunada 250"] },
];
const PUBLISHED_TERRACE: GuestMenu = [{ section: "Na terasi", articles: ["Limunada 250", "Cappuccino 200"] }];

/** The fixture with Limunada and Cappuccino on the terrace, published. */
async function publishedFixture() {
  const f = await fixture();
  await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.limunada.articleId);
  await addPlacement(f.t, f.w.ownerId, f.terraceSection, f.cappuccino.articleId);
  await publishDraft(f.t, f.w);
  return f;
}
type PF = Awaited<ReturnType<typeof publishedFixture>>;

/**
 * Runs `change`; until the next publish guests (and the published version) keep
 * reading the old menu while the draft is dirty; after publishing they read `after`.
 */
async function expectOnlyAfterPublish(
  f: PF,
  change: () => Promise<unknown>,
  after: { default: GuestMenu; terrace: GuestMenu },
) {
  const { t, w } = f;
  expect(await guestMenu(t, DEFAULT_PAGE_SLUG)).toEqual(PUBLISHED_DEFAULT);
  expect(await guestMenu(t, f.terrace.slug)).toEqual(PUBLISHED_TERRACE);
  const clean = await as(t, w.ownerId).query(api.menuPublishing.draftStatus, { menuServiceId: f.svc });
  expect(clean).toMatchObject({ state: "clean", hasUnpublishedChanges: false });

  await change();

  expect(await guestMenu(t, DEFAULT_PAGE_SLUG)).toEqual(PUBLISHED_DEFAULT);
  expect(await guestMenu(t, f.terrace.slug)).toEqual(PUBLISHED_TERRACE);
  const dirty = await as(t, w.ownerId).query(api.menuPublishing.draftStatus, { menuServiceId: f.svc });
  expect(dirty).toMatchObject({ state: "dirty", hasUnpublishedChanges: true });

  await publishDraft(t, w);

  expect(await guestMenu(t, DEFAULT_PAGE_SLUG)).toEqual(after.default);
  expect(await guestMenu(t, f.terrace.slug)).toEqual(after.terrace);
}

describe("draft only: guests keep the published menu until the next publish", () => {
  test("the published fixture reads as expected", async () => {
    const f = await publishedFixture();
    expect(await guestMenu(f.t, DEFAULT_PAGE_SLUG)).toEqual(PUBLISHED_DEFAULT);
    expect(await guestMenu(f.t, f.terrace.slug)).toEqual(PUBLISHED_TERRACE);
  });

  test("setPrices: the new prices (shared by both pages) appear only after publishing", async () => {
    const f = await publishedFixture();
    await expectOnlyAfterPublish(
      f,
      async () => {
        const result = await f.owner.setPrices([
          { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
          { articleId: f.limunada.articleId, expectedPriceRsd: 250, priceRsd: 270 },
        ]);
        expect(result).toEqual({ status: "changed", changed: 2 });
      },
      {
        default: [
          { section: "Topli napici", articles: ["Espresso 160", "Kafa 120", "Cappuccino 200"] },
          { section: "Hladni napici", articles: ["Limunada 270"] },
        ],
        terrace: [{ section: "Na terasi", articles: ["Limunada 270", "Cappuccino 200"] }],
      },
    );
  });

  test("a price conflict changes neither the draft nor the published menu", async () => {
    const f = await publishedFixture();
    const result = await f.owner.setPrices([
      { articleId: f.espresso.articleId, expectedPriceRsd: 150, priceRsd: 160 },
      { articleId: f.limunada.articleId, expectedPriceRsd: 1, priceRsd: 270 },
    ]);
    expect(result).toMatchObject({ status: "conflict" });
    const status = await as(f.t, f.w.ownerId).query(api.menuPublishing.draftStatus, { menuServiceId: f.svc });
    expect(status).toMatchObject({ state: "clean", hasUnpublishedChanges: false });
    expect(await guestMenu(f.t, DEFAULT_PAGE_SLUG)).toEqual(PUBLISHED_DEFAULT);
  });

  test("setVisibility: a hidden placement leaves the guest page only after publishing", async () => {
    const f = await publishedFixture();
    await expectOnlyAfterPublish(
      f,
      async () => {
        expect(await f.owner.setVisibility([f.espresso.placementId], "hidden")).toEqual({ changed: 1 });
      },
      {
        default: [
          { section: "Topli napici", articles: ["Kafa 120", "Cappuccino 200"] },
          PUBLISHED_DEFAULT[1],
        ],
        terrace: PUBLISHED_TERRACE,
      },
    );
  });

  test("removeFromPage: the placement is gone for guests only after publishing", async () => {
    const f = await publishedFixture();
    await expectOnlyAfterPublish(
      f,
      async () => {
        expect(await f.owner.removeFromPage([f.kafa.placementId])).toEqual({ removed: 1 });
      },
      {
        default: [
          { section: "Topli napici", articles: ["Espresso 150", "Cappuccino 200"] },
          PUBLISHED_DEFAULT[1],
        ],
        terrace: PUBLISHED_TERRACE,
      },
    );
  });

  test("moveToSection: the new place shows only after publishing", async () => {
    const f = await publishedFixture();
    await expectOnlyAfterPublish(
      f,
      async () => {
        expect(await f.owner.moveToSection([f.cappuccino.placementId], f.cold)).toEqual({
          moved: 1,
          skipped: 0,
        });
      },
      {
        default: [
          { section: "Topli napici", articles: ["Espresso 150", "Kafa 120"] },
          { section: "Hladni napici", articles: ["Limunada 250", "Cappuccino 200"] },
        ],
        // The terrace row is a different placement: it did not move.
        terrace: PUBLISHED_TERRACE,
      },
    );
  });

  test("addToPage: the new appearance shows only after publishing", async () => {
    const f = await publishedFixture();
    await expectOnlyAfterPublish(
      f,
      async () => {
        expect(await f.owner.addToPage([f.espresso.articleId], f.terraceSection)).toEqual({
          added: 1,
          skipped: 0,
        });
      },
      {
        default: PUBLISHED_DEFAULT,
        terrace: [{ section: "Na terasi", articles: ["Limunada 250", "Cappuccino 200", "Espresso 150"] }],
      },
    );
  });

  test("deleteArticles: the article leaves every guest page only after publishing", async () => {
    const f = await publishedFixture();
    await expectOnlyAfterPublish(
      f,
      async () => {
        expect(await deleteConfirmed(f.owner, [f.cappuccino.articleId])).toEqual({
          status: "deleted",
          deleted: 1,
        });
      },
      {
        default: [
          { section: "Topli napici", articles: ["Espresso 150", "Kafa 120"] },
          PUBLISHED_DEFAULT[1],
        ],
        terrace: [{ section: "Na terasi", articles: ["Limunada 250"] }],
      },
    );
  });

  test("a 'confirm' answer changes nothing: the draft stays clean", async () => {
    const f = await publishedFixture();
    asConfirm(await f.owner.deleteArticles([f.cappuccino.articleId]));
    const status = await as(f.t, f.w.ownerId).query(api.menuPublishing.draftStatus, { menuServiceId: f.svc });
    expect(status).toMatchObject({ state: "clean", hasUnpublishedChanges: false });
  });

  test("setAvailability is LIVE: guests see it at once, and the draft stays clean", async () => {
    const f = await publishedFixture();
    expect(await f.t.query(api.menuPublic.availability, { menuServiceId: f.svc })).toEqual({ articleKeys: [] });

    expect(await f.owner.setAvailability([f.espresso.articleId, f.kafa.articleId], false)).toEqual({
      available: false,
      changed: 2,
    });

    expect(await f.t.query(api.menuPublic.availability, { menuServiceId: f.svc })).toEqual({
      articleKeys: [f.espresso.key, f.kafa.key].sort(),
    });
    const status = await as(f.t, f.w.ownerId).query(api.menuPublishing.draftStatus, { menuServiceId: f.svc });
    expect(status).toMatchObject({ state: "clean", hasUnpublishedChanges: false });
    // The published page itself is the same.
    expect(await guestMenu(f.t, DEFAULT_PAGE_SLUG)).toEqual(PUBLISHED_DEFAULT);

    await f.owner.setAvailability([f.espresso.articleId], true);
    expect(await f.t.query(api.menuPublic.availability, { menuServiceId: f.svc })).toEqual({
      articleKeys: [f.kafa.key],
    });
  });
});
