/// <reference types="vite/client" />

// ScanMe Menu V1 — K02: the catalog (sections, shared articles, placements;
// master §5.1–§5.3, §5.6). One real product = one article with ONE base price;
// pages show it through placements that carry order and visibility only.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ARTICLES,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_SECTIONS_PER_PAGE,
} from "../lib/menu/limits";
import { DEFAULT_PAGE_SLUG } from "../lib/menu/slugs";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";
import {
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

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

/** A second standard page ("Vinska karta") inserted directly; menuPages.ts is a later concern. */
async function secondPage(t: T, menuServiceId: Id<"menuServices">, name = "Vinska karta") {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPages", {
      menuServiceId,
      key: newMenuKey("page"),
      slug: "vinska-karta",
      name,
      isDefault: false,
      order: 2048,
      visibility: "visible",
      navigation: "standalone",
      placementCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
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
  allowDuplicate?: boolean,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
    ...(allowDuplicate ? { allowDuplicate } : {}),
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

async function content(t: T, userId: Id<"users">, pageId: Id<"menuPages">) {
  const result = await as(t, userId).query(api.menuCatalog.pageContent, { pageId });
  if (!result) throw new Error("pageContent returned null");
  return result;
}

type PageContent = Awaited<ReturnType<typeof content>>;

function pricesOf(page: PageContent) {
  return page.sections.flatMap((section) =>
    section.placements.map((placement) => placement.article.basePriceRsd),
  );
}

function namesOf(page: PageContent, sectionIndex = 0) {
  return page.sections[sectionIndex].placements.map((placement) => placement.article.name);
}

/** Tenant A: "Rakije" on the default page and "Vina" on "Vinska karta" both show the article "Vranac" at 250. */
async function sharedFixture(t: T, w: MenuWorldSeed) {
  const barSection = await addSection(t, w.ownerId, w.a.defaultPageId, "Rakije");
  const winePageId = await secondPage(t, w.a.menuServiceId);
  const wineSection = await addSection(t, w.ownerId, winePageId, "Vina");
  const created = await quickAdd(t, w.ownerId, barSection.sectionId, "Vranac", 250);
  const shown = await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
    sectionId: wineSection.sectionId,
    articleId: created.articleId,
  });
  return {
    barSectionId: barSection.sectionId,
    wineSectionId: wineSection.sectionId,
    winePageId,
    articleId: created.articleId,
    barPlacementId: created.placementId,
    winePlacementId: shown.placementId,
  };
}

/** Tenant B: one section with one article, created by B's own owner. */
async function tenantBFixture(t: T, w: MenuWorldSeed) {
  const section = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
  const created = await quickAdd(t, w.otherOwnerId, section.sectionId, "Jelen pivo", 200);
  return {
    sectionId: section.sectionId,
    articleId: created.articleId,
    placementId: created.placementId,
  };
}

/** Everything the catalog writes for one service, to prove "nothing changed". */
async function snapshot(t: T, menuServiceId: Id<"menuServices">) {
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

describe("one article, one price, many pages", () => {
  test("a single setBasePrice changes the price on every page the article is shown on", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);

    expect(pricesOf(await content(t, w.ownerId, w.a.defaultPageId))).toEqual([250]);
    expect(pricesOf(await content(t, w.ownerId, f.winePageId))).toEqual([250]);

    const result = await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 280,
    });
    expect(result).toEqual({ ok: true });

    const onDefault = await content(t, w.ownerId, w.a.defaultPageId);
    const onWine = await content(t, w.ownerId, f.winePageId);
    expect(pricesOf(onDefault)).toEqual([280]);
    expect(pricesOf(onWine)).toEqual([280]);
    // Same article identity on both pages, and exactly one article row exists.
    expect(onDefault.sections[0].placements[0].article.articleId).toBe(f.articleId);
    expect(onWine.sections[0].placements[0].article.articleId).toBe(f.articleId);
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.articles).toHaveLength(1);
    expect(state.articles[0].basePriceRsd).toBe(280);
  });

  test("a placement stores order and visibility only, never a price", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const placements = await t.run(async (ctx) => [
      await ctx.db.get(f.barPlacementId),
      await ctx.db.get(f.winePlacementId),
    ]);
    for (const placement of placements) {
      expect(placement).not.toBeNull();
      const priceKeys = Object.keys(placement ?? {}).filter((key) =>
        key.toLowerCase().includes("price"),
      );
      expect(priceKeys).toEqual([]);
    }
  });

  test("clearing the price clears it everywhere (null is 'no price')", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: null,
    });
    expect(pricesOf(await content(t, w.ownerId, w.a.defaultPageId))).toEqual([null]);
    expect(pricesOf(await content(t, w.ownerId, f.winePageId))).toEqual([null]);
    const article = await t.run(async (ctx) => ctx.db.get(f.articleId));
    expect(article?.basePriceRsd).toBeUndefined();
  });
});

describe("quickAddArticle", () => {
  test("creates the article and its placement, counts both, bumps the revision by exactly 1", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Pivo");
    const before = await draftOf(t, w.a.menuServiceId);

    const created = await quickAdd(t, w.ownerId, sectionId, "  Jelen   pivo ", 180);

    const after = await draftOf(t, w.a.menuServiceId);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount + 1);
    expect(after.lastEditByUserId).toBe(w.ownerId);

    const page = await t.run(async (ctx) => ctx.db.get(w.a.defaultPageId));
    expect(page?.placementCount).toBe(1);

    const article = await t.run(async (ctx) => ctx.db.get(created.articleId));
    expect(article).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      key: created.key,
      kind: "item",
      name: "Jelen pivo",
      nameNormalized: "jelen pivo",
      basePriceRsd: 180,
      mediaMode: "none",
    });
    expect(created.key).toMatch(/^ar_[0-9a-z]{12}$/);
    const placement = await t.run(async (ctx) => ctx.db.get(created.placementId));
    expect(placement).toMatchObject({
      pageId: w.a.defaultPageId,
      sectionId,
      articleId: created.articleId,
      visibility: "visible",
    });
  });

  test("an article may be created without a price; the boundary prices 0 and 1_000_000 are valid", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Razno");
    const free = await quickAdd(t, w.ownerId, sectionId, "Voda iz česme", 0);
    const top = await quickAdd(t, w.ownerId, sectionId, "Šampanjac", 1_000_000);
    const none = await quickAdd(t, w.ownerId, sectionId, "Dnevna ponuda");
    const articles = await t.run(async (ctx) => [
      await ctx.db.get(free.articleId),
      await ctx.db.get(top.articleId),
      await ctx.db.get(none.articleId),
    ]);
    expect(articles[0]?.basePriceRsd).toBe(0);
    expect(articles[1]?.basePriceRsd).toBe(1_000_000);
    expect(articles[2]?.basePriceRsd).toBeUndefined();
  });

  test("a price that is not whole dinars within 0..1_000_000, or a bad name, is refused and nothing is written", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    const before = await snapshot(t, w.a.menuServiceId);
    for (const priceRsd of [1.5, -1, 1_000_001]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, {
          sectionId,
          name: "Kafa",
          priceRsd,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    for (const name of ["", "   ", "x".repeat(121)]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, { sectionId, name }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a similar name returns the candidates and writes nothing; allowDuplicate creates a second article", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Rakije");
    const first = await quickAdd(t, w.ownerId, sectionId, "Šljivovica", 400);
    const before = await snapshot(t, w.a.menuServiceId);

    const similar = await as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, {
      sectionId,
      name: "sljivovica ",
    });
    expect(similar).toEqual({
      status: "similar",
      candidates: [
        { articleId: first.articleId, key: first.key, name: "Šljivovica", basePriceRsd: 400 },
      ],
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    const second = await quickAdd(t, w.ownerId, sectionId, "sljivovica ", undefined, true);
    expect(second.articleId).not.toBe(first.articleId);
    const after = await snapshot(t, w.a.menuServiceId);
    expect(after.articles).toHaveLength(2);
    expect(after.draft?.articleCount).toBe(2);
  });

  test("at MENU_MAX_ARTICLES the call is refused with limitReached and nothing changes", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .unique();
      await ctx.db.patch(state!._id, { articleCount: MENU_MAX_ARTICLES });
    });
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, { sectionId, name: "Sok" }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a full page refuses new placements (quickAdd and addPlacement) with limitReached", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const other = await addSection(t, w.ownerId, w.a.defaultPageId, "Druga grupa");
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.defaultPageId, { placementCount: MENU_MAX_PLACEMENTS_PER_PAGE });
    });
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, {
        sectionId: f.barSectionId,
        name: "Sok",
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(
      as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
        sectionId: other.sectionId,
        articleId: f.articleId,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

describe("compare-and-set: nobody silently overwrites a newer change", () => {
  test("a stale price write conflicts, returns the current price and writes nothing", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    // Owner and manager both loaded the page and saw 250.
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 280,
    });
    const before = await snapshot(t, w.a.menuServiceId);

    const stale = await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 300,
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 280 },
      attempted: { basePriceRsd: 300 },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect(pricesOf(await content(t, w.managerId, w.a.defaultPageId))).toEqual([280]);

    // After reloading, the manager's write goes through.
    const retry = await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 280,
      priceRsd: 300,
    });
    expect(retry).toEqual({ ok: true });
    expect(pricesOf(await content(t, w.managerId, f.winePageId))).toEqual([300]);
  });

  test("setting the price it already has is a no-op: no revision bump", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const before = await draftOf(t, w.a.menuServiceId);
    const result = await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 250,
    });
    expect(result).toEqual({ ok: true });
    expect(await draftOf(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a successful price change bumps the revision once; an invalid price is refused", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const before = await snapshot(t, w.a.menuServiceId);
    for (const priceRsd of [1.5, -1, 1_000_001]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
          articleId: f.articleId,
          expectedPriceRsd: 250,
          priceRsd,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 260,
    });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(before.draft!.revision + 1);
  });

  test("updateArticleFields: a stale name conflicts, the current name comes back, nothing is written", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const renamed = await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId: f.articleId,
      expected: { name: "Vranac" },
      patch: { name: "Vranac Rezerva" },
    });
    expect(renamed).toEqual({ ok: true });
    const article = await t.run(async (ctx) => ctx.db.get(f.articleId));
    expect(article).toMatchObject({ name: "Vranac Rezerva", nameNormalized: "vranac rezerva" });
    const before = await snapshot(t, w.a.menuServiceId);

    const stale = await as(t, w.managerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId: f.articleId,
      expected: { name: "Vranac" },
      patch: { name: "Vranac Barrique" },
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["name"],
      current: { name: "Vranac Rezerva" },
      attempted: { name: "Vranac Barrique" },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    // The rename is the same article on both pages.
    expect(namesOf(await content(t, w.ownerId, f.winePageId))).toEqual(["Vranac Rezerva"]);
  });

  test("updateArticleFields sets description and quantity, and null clears an optional field", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const owner = as(t, w.ownerId);
    const set = await owner.mutation(api.menuCatalog.updateArticleFields, {
      articleId: f.articleId,
      expected: { description: null, quantityValue: null, quantityUnit: null },
      patch: { description: "  Crno   vino ", quantityValue: 0.75, quantityUnit: " l " },
    });
    expect(set).toEqual({ ok: true });
    const withFields = await content(t, w.ownerId, f.winePageId);
    expect(withFields.sections[0].placements[0].article).toMatchObject({
      description: "Crno vino",
      quantityValue: 0.75,
      quantityUnit: "l",
    });

    const cleared = await owner.mutation(api.menuCatalog.updateArticleFields, {
      articleId: f.articleId,
      expected: { description: "Crno vino", quantityValue: 0.75 },
      patch: { description: null, quantityValue: null },
    });
    expect(cleared).toEqual({ ok: true });
    const article = await t.run(async (ctx) => ctx.db.get(f.articleId));
    expect(article?.description).toBeUndefined();
    expect(article?.quantityValue).toBeUndefined();
    expect(article?.quantityUnit).toBe("l");
    expect(article?.basePriceRsd).toBe(250);
  });

  test("updateArticleFields refuses malformed input before writing; an unchanged value does not bump the revision", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);
    type Fields = {
      name?: string;
      description?: string | null;
      quantityValue?: number | null;
      quantityUnit?: string | null;
    };
    const bad: { expected: Fields; patch: Fields }[] = [
      { expected: {}, patch: {} },
      { expected: { name: "Vranac" }, patch: {} },
      { expected: {}, patch: { name: "Novo" } },
      { expected: { name: "Vranac" }, patch: { name: "   " } },
      { expected: { name: "Vranac" }, patch: { name: "x".repeat(121) } },
      { expected: { quantityValue: null }, patch: { quantityValue: 0 } },
      { expected: { quantityValue: null }, patch: { quantityValue: -1 } },
      { expected: { quantityValue: null }, patch: { quantityValue: 100_001 } },
      { expected: { description: null }, patch: { description: "x".repeat(601) } },
      { expected: { quantityUnit: null }, patch: { quantityUnit: "y".repeat(21) } },
    ];
    for (const { expected, patch } of bad) {
      await expect(
        owner.mutation(api.menuCatalog.updateArticleFields, {
          articleId: f.articleId,
          expected,
          patch,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    const same = await owner.mutation(api.menuCatalog.updateArticleFields, {
      articleId: f.articleId,
      expected: { name: "Vranac" },
      patch: { name: "  Vranac " },
    });
    expect(same).toEqual({ ok: true });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("renameSection: the stale name conflicts, the fresh one renames", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Pica");
    const owner = as(t, w.ownerId);
    expect(
      await owner.mutation(api.menuCatalog.renameSection, {
        sectionId,
        name: "Pića",
        expectedName: "Pica",
      }),
    ).toEqual({ ok: true });
    const before = await snapshot(t, w.a.menuServiceId);
    expect(
      await as(t, w.managerId).mutation(api.menuCatalog.renameSection, {
        sectionId,
        name: "Napici",
        expectedName: "Pica",
      }),
    ).toEqual({ ok: false, conflicts: ["name"], current: { name: "Pića" }, attempted: { name: "Napici" } });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    await expect(
      owner.mutation(api.menuCatalog.renameSection, {
        sectionId,
        name: "   ",
        expectedName: "Pića",
      }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
  });
});

describe("sections", () => {
  test("addSection appends with a stable key; moveSection reorders; no-op moves do not touch the draft", async () => {
    const { t, w } = await setup();
    const owner = as(t, w.ownerId);
    const s1 = await addSection(t, w.ownerId, w.a.defaultPageId, "Doručak");
    await addSection(t, w.ownerId, w.a.defaultPageId, "Ručak");
    const s3 = await addSection(t, w.ownerId, w.a.defaultPageId, "Večera");
    expect(s1.key).toMatch(/^sc_[0-9a-z]{12}$/);

    const listed = async () =>
      (await content(t, w.ownerId, w.a.defaultPageId)).sections.map((s) => s.name);
    expect(await listed()).toEqual(["Doručak", "Ručak", "Večera"]);

    await owner.mutation(api.menuCatalog.moveSection, { sectionId: s3.sectionId, toIndex: 0 });
    expect(await listed()).toEqual(["Večera", "Doručak", "Ručak"]);
    const orders = (await content(t, w.ownerId, w.a.defaultPageId)).sections.map((s) => s.order);
    expect(orders).toEqual([1024, 2048, 3072]);

    const before = await draftOf(t, w.a.menuServiceId);
    await owner.mutation(api.menuCatalog.moveSection, { sectionId: s3.sectionId, toIndex: 0 });
    expect(await draftOf(t, w.a.menuServiceId)).toEqual(before);

    // Past the end clamps to the last position.
    await owner.mutation(api.menuCatalog.moveSection, { sectionId: s3.sectionId, toIndex: 99 });
    expect(await listed()).toEqual(["Doručak", "Ručak", "Večera"]);
    for (const toIndex of [-1, 1.5]) {
      await expect(
        owner.mutation(api.menuCatalog.moveSection, { sectionId: s1.sectionId, toIndex }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
  });

  test("a page holds at most MENU_MAX_SECTIONS_PER_PAGE sections", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_SECTIONS_PER_PAGE; index += 1) {
        await ctx.db.insert("menuSections", {
          menuServiceId: w.a.menuServiceId,
          pageId: w.a.defaultPageId,
          key: newMenuKey("section"),
          name: `Grupa ${index}`,
          order: (index + 1) * 1024,
          visibility: "visible",
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(addSection(t, w.ownerId, w.a.defaultPageId, "Jedna previše")).rejects.toThrow(
      MENU_ERROR.limitReached,
    );
    await expect(addSection(t, w.ownerId, w.a.defaultPageId, "   ")).rejects.toThrow();
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("removeSection deletes its placements, keeps the articles and fixes the page count", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const extra = await quickAdd(t, w.ownerId, f.barSectionId, "Lozovača", 350);

    const result = await as(t, w.ownerId).mutation(api.menuCatalog.removeSection, {
      sectionId: f.barSectionId,
    });
    expect(result).toEqual({ ok: true });

    const after = await snapshot(t, w.a.menuServiceId);
    expect(after.articles).toHaveLength(2);
    expect(after.sections.map((s) => s._id)).toEqual([f.wineSectionId]);
    expect(after.placements.map((p) => p._id)).toEqual([f.winePlacementId]);
    expect(after.pages.find((p) => p._id === w.a.defaultPageId)?.placementCount).toBe(0);
    expect(after.pages.find((p) => p._id === f.winePageId)?.placementCount).toBe(1);
    // The shared article is still shown, at the same price, on the other page.
    expect(pricesOf(await content(t, w.ownerId, f.winePageId))).toEqual([250]);
    expect(after.articles.map((a) => a._id)).toContain(extra.articleId);
    expect(after.draft?.articleCount).toBe(2);
  });
});

describe("placements: where an article is shown", () => {
  test("removePlacement removes only this appearance; the article stays on the other page", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const result = await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, {
      placementId: f.barPlacementId,
    });
    expect(result).toEqual({ ok: true });

    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.articles.map((a) => a._id)).toEqual([f.articleId]);
    expect(state.placements.map((p) => p._id)).toEqual([f.winePlacementId]);
    expect(state.pages.find((p) => p._id === w.a.defaultPageId)?.placementCount).toBe(0);
    expect(state.pages.find((p) => p._id === f.winePageId)?.placementCount).toBe(1);
    expect(state.draft?.articleCount).toBe(1);
    expect(namesOf(await content(t, w.ownerId, f.winePageId))).toEqual(["Vranac"]);
    expect((await content(t, w.ownerId, w.a.defaultPageId)).sections[0].placements).toEqual([]);
  });

  test("setPlacementVisibility hides on this page only and keeps the position; the same value is a no-op", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const second = await quickAdd(t, w.ownerId, f.barSectionId, "Lozovača", 350);
    const owner = as(t, w.ownerId);
    const orderBefore = (await content(t, w.ownerId, w.a.defaultPageId)).sections[0].placements.map(
      (p) => p.order,
    );

    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: f.barPlacementId,
      visibility: "hidden",
    });
    const onDefault = await content(t, w.ownerId, w.a.defaultPageId);
    expect(onDefault.sections[0].placements.map((p) => p.visibility)).toEqual(["hidden", "visible"]);
    expect(onDefault.sections[0].placements.map((p) => p.order)).toEqual(orderBefore);
    expect(onDefault.sections[0].placements[1].placementId).toBe(second.placementId);
    // Hidden here, still visible on the other page.
    expect((await content(t, w.ownerId, f.winePageId)).sections[0].placements[0].visibility).toBe(
      "visible",
    );

    const before = await snapshot(t, w.a.menuServiceId);
    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: f.barPlacementId,
      visibility: "hidden",
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: f.barPlacementId,
      visibility: "visible",
    });
    expect(
      (await content(t, w.ownerId, w.a.defaultPageId)).sections[0].placements[0].visibility,
    ).toBe("visible");
  });

  test("the same article twice in one section is refused with placementExists", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
        sectionId: f.wineSectionId,
        articleId: f.articleId,
      }),
    ).rejects.toThrow(MENU_ERROR.placementExists);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // A different section of the same page is fine: one article, two sections.
    const other = await addSection(t, w.ownerId, f.winePageId, "Preporuka");
    const added = await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: other.sectionId,
      articleId: f.articleId,
    });
    expect(added.placementId).toBeTruthy();
    const page = await content(t, w.ownerId, f.winePageId);
    expect([namesOf(page, 0), namesOf(page, 1)]).toEqual([["Vranac"], ["Vranac"]]);
  });

  test("an archived page refuses section, placement and article-in-section changes with pageArchived", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const spare = await quickAdd(t, w.ownerId, f.barSectionId, "Lozovača", 350);
    await t.run(async (ctx) => {
      await ctx.db.patch(f.winePageId, { archivedAt: Date.now() });
    });
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);

    await expect(
      owner.mutation(api.menuCatalog.addPlacement, {
        sectionId: f.wineSectionId,
        articleId: spare.articleId,
      }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    await expect(
      owner.mutation(api.menuCatalog.quickAddArticle, { sectionId: f.wineSectionId, name: "Sok" }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    await expect(
      owner.mutation(api.menuCatalog.addSection, { pageId: f.winePageId, name: "Nova" }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    await expect(
      owner.mutation(api.menuCatalog.removePlacement, { placementId: f.winePlacementId }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    await expect(
      owner.mutation(api.menuCatalog.setPlacementVisibility, {
        placementId: f.winePlacementId,
        visibility: "hidden",
      }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    await expect(
      owner.mutation(api.menuCatalog.removeSection, { sectionId: f.wineSectionId }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    await expect(
      owner.mutation(api.menuCatalog.renameSection, {
        sectionId: f.wineSectionId,
        name: "Vinoteka",
        expectedName: "Vina",
      }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // The archived page is still readable and the article-level price still applies to it.
    const archived = await content(t, w.ownerId, f.winePageId);
    expect(archived.page.archived).toBe(true);
    await owner.mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 270,
    });
    expect(pricesOf(await content(t, w.ownerId, f.winePageId))).toEqual([270]);
  });

  test("movePlacement reorders inside a section with one row written, and a no-op move does not touch the draft", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Piva");
    const a = await quickAdd(t, w.ownerId, sectionId, "Pivo A", 100);
    const b = await quickAdd(t, w.ownerId, sectionId, "Pivo B", 110);
    const c = await quickAdd(t, w.ownerId, sectionId, "Pivo C", 120);
    const owner = as(t, w.ownerId);
    const names = async () => namesOf(await content(t, w.ownerId, w.a.defaultPageId));
    const orderOf = async (placementId: Id<"menuPlacements">) =>
      (await t.run(async (ctx) => ctx.db.get(placementId)))?.order;
    expect(await names()).toEqual(["Pivo A", "Pivo B", "Pivo C"]);

    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: c.placementId,
      toSectionId: sectionId,
      beforePlacementId: a.placementId,
    });
    expect(await names()).toEqual(["Pivo C", "Pivo A", "Pivo B"]);
    // Only C was rewritten.
    expect(await orderOf(a.placementId)).toBe(1024);
    expect(await orderOf(b.placementId)).toBe(2048);

    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: c.placementId,
      toSectionId: sectionId,
    });
    expect(await names()).toEqual(["Pivo A", "Pivo B", "Pivo C"]);

    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: a.placementId,
      toSectionId: sectionId,
      beforePlacementId: c.placementId,
    });
    expect(await names()).toEqual(["Pivo B", "Pivo A", "Pivo C"]);

    const before = await snapshot(t, w.a.menuServiceId);
    // Already last / already right before the target / before itself: nothing to do.
    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: c.placementId,
      toSectionId: sectionId,
    });
    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: a.placementId,
      toSectionId: sectionId,
      beforePlacementId: c.placementId,
    });
    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: a.placementId,
      toSectionId: sectionId,
      beforePlacementId: a.placementId,
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("movePlacement renumbers the section when the gap between neighbours is exhausted", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Piva");
    const a = await quickAdd(t, w.ownerId, sectionId, "Pivo A", 100);
    const b = await quickAdd(t, w.ownerId, sectionId, "Pivo B", 110);
    const c = await quickAdd(t, w.ownerId, sectionId, "Pivo C", 120);
    await t.run(async (ctx) => {
      await ctx.db.patch(a.placementId, { order: 1 });
      await ctx.db.patch(b.placementId, { order: 1 + Number.EPSILON });
    });

    await as(t, w.ownerId).mutation(api.menuCatalog.movePlacement, {
      placementId: c.placementId,
      toSectionId: sectionId,
      beforePlacementId: b.placementId,
    });
    const page = await content(t, w.ownerId, w.a.defaultPageId);
    expect(namesOf(page)).toEqual(["Pivo A", "Pivo C", "Pivo B"]);
    expect(page.sections[0].placements.map((p) => p.order)).toEqual([1024, 1536, 2048]);
  });

  test("movePlacement moves to another section of the same page; the page count does not change", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const owner = as(t, w.ownerId);
    const second = await addSection(t, w.ownerId, w.a.defaultPageId, "Poslastice");
    const other = await quickAdd(t, w.ownerId, second.sectionId, "Palačinke", 300);
    const before = await draftOf(t, w.a.menuServiceId);

    await owner.mutation(api.menuCatalog.movePlacement, {
      placementId: f.barPlacementId,
      toSectionId: second.sectionId,
      beforePlacementId: other.placementId,
    });
    const page = await content(t, w.ownerId, w.a.defaultPageId);
    expect(namesOf(page, 0)).toEqual([]);
    expect(namesOf(page, 1)).toEqual(["Vranac", "Palačinke"]);
    const after = await snapshot(t, w.a.menuServiceId);
    expect(after.pages.find((p) => p._id === w.a.defaultPageId)?.placementCount).toBe(2);
    expect(after.draft?.revision).toBe(before.revision + 1);
    expect(after.draft?.articleCount).toBe(before.articleCount);
    // It is still the one shared article on the other page.
    expect(pricesOf(await content(t, w.ownerId, f.winePageId))).toEqual([250]);
  });

  test("movePlacement refuses a section of another page and a 'before' outside the target section", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const owner = as(t, w.ownerId);
    const extra = await addSection(t, w.ownerId, w.a.defaultPageId, "Poslastice");
    const before = await snapshot(t, w.a.menuServiceId);

    // Moving between pages is a later step.
    await expect(
      owner.mutation(api.menuCatalog.movePlacement, {
        placementId: f.barPlacementId,
        toSectionId: f.wineSectionId,
      }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    // 'before' must sit in the target section.
    await expect(
      owner.mutation(api.menuCatalog.movePlacement, {
        placementId: f.barPlacementId,
        toSectionId: extra.sectionId,
        beforePlacementId: f.winePlacementId,
      }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("moving into a section that already shows the article is refused with placementExists", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const owner = as(t, w.ownerId);
    const second = await addSection(t, w.ownerId, w.a.defaultPageId, "Poslastice");
    const shownThere = await owner.mutation(api.menuCatalog.addPlacement, {
      sectionId: second.sectionId,
      articleId: f.articleId,
    });
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuCatalog.movePlacement, {
        placementId: f.barPlacementId,
        toSectionId: second.sectionId,
      }),
    ).rejects.toThrow(MENU_ERROR.placementExists);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect(shownThere.placementId).toBeTruthy();
  });
});

describe("findSimilarArticles and pageContent", () => {
  test("findSimilarArticles returns exact matches first, then prefix matches, at most 10", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Vina");
    await quickAdd(t, w.ownerId, sectionId, "Vranac Rezerva", 500);
    const exact = await quickAdd(t, w.ownerId, sectionId, "Vranac", 250);
    await quickAdd(t, w.ownerId, sectionId, "Vranac Barrique", 450);
    await quickAdd(t, w.ownerId, sectionId, "Pinot", 300);
    const owner = as(t, w.ownerId);

    const found = await owner.query(api.menuCatalog.findSimilarArticles, {
      menuServiceId: w.a.menuServiceId,
      name: "VRANAC ",
    });
    expect(found?.map((c) => c.name)).toEqual(["Vranac", "Vranac Barrique", "Vranac Rezerva"]);
    expect(found?.[0]).toEqual({
      articleId: exact.articleId,
      key: exact.key,
      name: "Vranac",
      basePriceRsd: 250,
    });
    expect(
      await owner.query(api.menuCatalog.findSimilarArticles, {
        menuServiceId: w.a.menuServiceId,
        name: "ranac",
      }),
    ).toEqual([]);
    expect(
      await owner.query(api.menuCatalog.findSimilarArticles, {
        menuServiceId: w.a.menuServiceId,
        name: " !! ",
      }),
    ).toEqual([]);

    for (let index = 1; index <= 12; index += 1) {
      await quickAdd(t, w.ownerId, sectionId, `Kola ${index}`);
    }
    const capped = await owner.query(api.menuCatalog.findSimilarArticles, {
      menuServiceId: w.a.menuServiceId,
      name: "kola",
    });
    expect(capped).toHaveLength(10);
  });

  test("pageContent describes the page, sections and placements in order, with the shared article fields", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId: f.articleId,
      expected: { description: null, quantityValue: null, quantityUnit: null },
      patch: { description: "Suvo crno vino", quantityValue: 0.2, quantityUnit: "l" },
    });
    const page = await content(t, w.ownerId, w.a.defaultPageId);
    expect(page.truncated).toBe(false);
    expect(page.page).toEqual({
      pageId: w.a.defaultPageId,
      key: expect.stringMatching(/^pg_/),
      slug: DEFAULT_PAGE_SLUG,
      name: menuDomenSr.defaultPageName,
      publicTitle: null,
      isDefault: true,
      archived: false,
    });
    expect(page.sections).toHaveLength(1);
    expect(page.sections[0]).toMatchObject({
      sectionId: f.barSectionId,
      name: "Rakije",
      description: null,
      order: 1024,
      visibility: "visible",
    });
    expect(page.sections[0].placements[0]).toMatchObject({
      placementId: f.barPlacementId,
      order: 1024,
      visibility: "visible",
      article: {
        articleId: f.articleId,
        kind: "item",
        name: "Vranac",
        description: "Suvo crno vino",
        quantityValue: 0.2,
        quantityUnit: "l",
        basePriceRsd: 250,
        mediaMode: "none",
        iconKey: null,
      },
    });
  });

  test("a page with more than 300 distinct articles is read through one range read", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Sve");
    const count = 305;
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < count; index += 1) {
        const articleId = await ctx.db.insert("menuArticles", {
          menuServiceId: w.a.menuServiceId,
          key: newMenuKey("article"),
          kind: "item",
          name: `Artikal ${index}`,
          nameNormalized: `artikal ${index}`,
          basePriceRsd: index,
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("menuPlacements", {
          menuServiceId: w.a.menuServiceId,
          pageId: w.a.defaultPageId,
          sectionId,
          articleId,
          order: (count - index) * 1024,
          visibility: "visible",
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const page = await content(t, w.ownerId, w.a.defaultPageId);
    expect(page.truncated).toBe(false);
    const placements = page.sections[0].placements;
    expect(placements).toHaveLength(count);
    // Sorted by placement order (the last inserted article has the lowest order).
    expect(placements[0].article.name).toBe(`Artikal ${count - 1}`);
    expect(placements[count - 1].article.name).toBe("Artikal 0");
    expect(placements[count - 1].article.basePriceRsd).toBe(0);
  });
});

describe("roles", () => {
  test("owner, manager, editor and ScanMe admin can add articles and set the price", async () => {
    const { t, w } = await setup();
    const { sectionId } = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    for (const [label, userId] of [
      ["vlasnik", w.ownerId],
      ["menadzer", w.managerId],
      ["urednik", w.editorId],
      ["admin", w.adminId],
    ] as const) {
      const created = await quickAdd(t, userId, sectionId, `Artikal ${label}`, 100);
      const priced = await as(t, userId).mutation(api.menuCatalog.setBasePrice, {
        articleId: created.articleId,
        expectedPriceRsd: 100,
        priceRsd: 120,
      });
      expect(priced).toEqual({ ok: true });
      const article = await t.run(async (ctx) => ctx.db.get(created.articleId));
      expect(article).toMatchObject({ basePriceRsd: 120, updatedByUserId: userId });
    }
    expect((await draftOf(t, w.a.menuServiceId)).articleCount).toBe(4);
  });

  test("finance, view-only, outsiders and the owner of another business get not_found for every row id (no existence oracle); nothing changes", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const before = await snapshot(t, w.a.menuServiceId);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const actor = as(t, userId);
      await expect(
        actor.mutation(api.menuCatalog.quickAddArticle, { sectionId: f.barSectionId, name: "Sok" }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        actor.mutation(api.menuCatalog.setBasePrice, {
          articleId: f.articleId,
          expectedPriceRsd: 250,
          priceRsd: 1,
        }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        actor.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Nova" }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        actor.mutation(api.menuCatalog.removePlacement, { placementId: f.barPlacementId }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        actor.mutation(api.menuCatalog.updateArticleFields, {
          articleId: f.articleId,
          expected: { name: "Vranac" },
          patch: { name: "Hakovano" },
        }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("signed-out callers are refused", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    await expect(
      t.mutation(api.menuCatalog.setBasePrice, {
        articleId: f.articleId,
        expectedPriceRsd: 250,
        priceRsd: 1,
      }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect(await t.query(api.menuCatalog.pageContent, { pageId: w.a.defaultPageId })).toBeNull();
  });

  test("with client editing switched off, clients get editingDisabled and the admin still edits; reading stays open", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const before = await snapshot(t, w.a.menuServiceId);
    for (const userId of [w.ownerId, w.managerId, w.editorId]) {
      await expect(
        as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
          sectionId: f.barSectionId,
          name: "Sok",
        }),
      ).rejects.toThrow(MENU_ERROR.editingDisabled);
      await expect(
        as(t, userId).mutation(api.menuCatalog.setBasePrice, {
          articleId: f.articleId,
          expectedPriceRsd: 250,
          priceRsd: 260,
        }),
      ).rejects.toThrow(MENU_ERROR.editingDisabled);
      expect(await content(t, userId, w.a.defaultPageId)).toBeTruthy();
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    const admin = await as(t, w.adminId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: 250,
      priceRsd: 260,
    });
    expect(admin).toEqual({ ok: true });
    expect(pricesOf(await content(t, w.adminId, f.winePageId))).toEqual([260]);
  });

  test("pageContent and findSimilarArticles are null for finance, outsiders and other businesses", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    for (const userId of [w.outsiderId, w.otherOwnerId, w.financeId, w.viewOnlyId]) {
      const actor = as(t, userId);
      expect(await actor.query(api.menuCatalog.pageContent, { pageId: w.a.defaultPageId })).toBeNull();
      expect(await actor.query(api.menuCatalog.pageContent, { pageId: f.winePageId })).toBeNull();
      expect(
        await actor.query(api.menuCatalog.findSimilarArticles, {
          menuServiceId: w.a.menuServiceId,
          name: "Vranac",
        }),
      ).toBeNull();
    }
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      expect(pricesOf(await content(t, userId, w.a.defaultPageId))).toEqual([250]);
    }
  });
});

describe("tenant isolation", () => {
  test("an article of another business cannot be shown in my section: notFound, nothing written", async () => {
    const { t, w } = await setup();
    const f = await sharedFixture(t, w);
    const b = await tenantBFixture(t, w);
    const beforeA = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);

    await expect(
      as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
        sectionId: f.barSectionId,
        articleId: b.articleId,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);

    // The same the other way round, with an admin who may act on both services.
    await expect(
      as(t, w.adminId).mutation(api.menuCatalog.addPlacement, {
        sectionId: b.sectionId,
        articleId: f.articleId,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    // And with a foreign 'before' placement.
    await expect(
      as(t, w.adminId).mutation(api.menuCatalog.movePlacement, {
        placementId: f.barPlacementId,
        toSectionId: f.barSectionId,
        beforePlacementId: b.placementId,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      as(t, w.adminId).mutation(api.menuCatalog.movePlacement, {
        placementId: f.barPlacementId,
        toSectionId: b.sectionId,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
  });

  test("the owner of A cannot change, hide, remove or read anything of B; B's price is unchanged", async () => {
    const { t, w } = await setup();
    await sharedFixture(t, w);
    const b = await tenantBFixture(t, w);
    const beforeB = await snapshot(t, w.b.menuServiceId);
    const owner = as(t, w.ownerId);

    // No role in B: a row of B is reported as not found (requireMenuAccessToRow, no existence oracle).
    await expect(
      owner.mutation(api.menuCatalog.setBasePrice, {
        articleId: b.articleId,
        expectedPriceRsd: 200,
        priceRsd: 1,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.updateArticleFields, {
        articleId: b.articleId,
        expected: { name: "Jelen pivo" },
        patch: { name: "Hakovano" },
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.quickAddArticle, { sectionId: b.sectionId, name: "Sok" }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.addPlacement, {
        sectionId: b.sectionId,
        articleId: b.articleId,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.removePlacement, { placementId: b.placementId }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.setPlacementVisibility, {
        placementId: b.placementId,
        visibility: "hidden",
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.removeSection, { sectionId: b.sectionId }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuCatalog.addSection, { pageId: w.b.defaultPageId, name: "Nova" }),
    ).rejects.toThrow(MENU_ERROR.notFound);

    expect(await owner.query(api.menuCatalog.pageContent, { pageId: w.b.defaultPageId })).toBeNull();
    expect(
      await owner.query(api.menuCatalog.findSimilarArticles, {
        menuServiceId: w.b.menuServiceId,
        name: "Jelen",
      }),
    ).toBeNull();
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
    const article = await t.run(async (ctx) => ctx.db.get(b.articleId));
    expect(article?.basePriceRsd).toBe(200);
  });

  test("the two businesses keep separate articles, even with the same name", async () => {
    const { t, w } = await setup();
    const sectionA = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    const sectionB = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
    const a = await quickAdd(t, w.ownerId, sectionA.sectionId, "Kafa", 150);
    // No 'similar' across tenants: B creates its own "Kafa" without allowDuplicate.
    const b = await quickAdd(t, w.otherOwnerId, sectionB.sectionId, "Kafa", 200);
    expect(a.articleId).not.toBe(b.articleId);
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: a.articleId,
      expectedPriceRsd: 150,
      priceRsd: 160,
    });
    expect(pricesOf(await content(t, w.otherOwnerId, w.b.defaultPageId))).toEqual([200]);
    expect(pricesOf(await content(t, w.ownerId, w.a.defaultPageId))).toEqual([160]);
    expect((await draftOf(t, w.a.menuServiceId)).articleCount).toBe(1);
    expect((await draftOf(t, w.b.menuServiceId)).articleCount).toBe(1);
  });
});
