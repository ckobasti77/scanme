/// <reference types="vite/client" />

// ScanMe Menu V1 — K05 (master §6.1): "konflikt iste vrednosti ne sme
// neprimetno pregaziti noviju izmenu". Two people (or the same person in two
// tabs) change the SAME value from the same starting point: the first save wins,
// the second writes NOTHING and gets BOTH values back — the one saved
// meanwhile (`current`) and the one it tried to write (`attempted`) — so the
// editor can show the conflict instead of overwriting. Covered for every kind
// of writer that takes an expected value, plus the pure rule (checkCas).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { checkCas, type CasValue } from "../lib/menu/cas";
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

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
}

async function addArticle(
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
 * One article "Pljeskavica" (450 RSD; `null` = no price yet) in a section
 * "Roštilj" of tenant A's default page.
 */
async function burgerFixture(t: T, w: MenuWorldSeed, priceRsd: number | null = 450) {
  const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Roštilj");
  const burger = await addArticle(
    t,
    w.ownerId,
    section.sectionId,
    "Pljeskavica",
    priceRsd === null ? undefined : priceRsd,
  );
  return { section, burger };
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

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  return (await draftOf(t, menuServiceId)).revision;
}

/** The price a person sees in the editor for one article of a page. */
async function priceSeenBy(
  t: T,
  userId: Id<"users">,
  pageId: Id<"menuPages">,
  articleId: Id<"menuArticles">,
) {
  const content = await as(t, userId).query(api.menuCatalog.pageContent, { pageId });
  if (!content) throw new Error("pageContent returned null");
  for (const section of content.sections) {
    const found = section.placements.find((placement) => placement.article.articleId === articleId);
    if (found) return found.article.basePriceRsd;
  }
  throw new Error("the article is not on the page");
}

async function storedPrice(t: T, articleId: Id<"menuArticles">) {
  return (await t.run(async (ctx) => await ctx.db.get(articleId)))?.basePriceRsd ?? null;
}

// =============================================================================
// The master example: the same price, two people
// =============================================================================

describe("conflicts — the same price from the same starting point", () => {
  test("owner and manager both see 450; the manager saves 520, the owner's 480 is refused with both values and nothing is overwritten", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w);
    const service = w.a.menuServiceId;

    expect(await priceSeenBy(t, w.ownerId, w.a.defaultPageId, burger.articleId)).toBe(450);
    expect(await priceSeenBy(t, w.managerId, w.a.defaultPageId, burger.articleId)).toBe(450);

    expect(
      await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 520,
      }),
    ).toEqual({ ok: true });
    const afterManager = await draftOf(t, service);
    expect(afterManager.lastEditByUserId).toBe(w.managerId);

    const refused = await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: burger.articleId,
      expectedPriceRsd: 450,
      priceRsd: 480,
    });
    expect(refused).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 520 },
      attempted: { basePriceRsd: 480 },
    });

    // Nothing moved: not the price, not the revision, not who edited last.
    expect(await storedPrice(t, burger.articleId)).toBe(520);
    const afterOwner = await draftOf(t, service);
    expect(afterOwner.revision).toBe(afterManager.revision);
    expect(afterOwner.lastEditAt).toBe(afterManager.lastEditAt);
    expect(afterOwner.lastEditByUserId).toBe(w.managerId);
    const stored = await t.run(async (ctx) => await ctx.db.get(burger.articleId));
    expect(stored?.updatedByUserId).toBe(w.managerId);

    // After refreshing, the owner sees 520 and can save on top of it knowingly.
    expect(await priceSeenBy(t, w.ownerId, w.a.defaultPageId, burger.articleId)).toBe(520);
    expect(
      await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 520,
        priceRsd: 480,
      }),
    ).toEqual({ ok: true });
    expect(await storedPrice(t, burger.articleId)).toBe(480);
    expect((await draftOf(t, service)).revision).toBe(afterManager.revision + 1);
  });

  test("clearing the price from a stale view conflicts too, and the attempted value is null", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w);
    await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: burger.articleId,
      expectedPriceRsd: 450,
      priceRsd: 520,
    });
    const revision = await revisionOf(t, w.a.menuServiceId);

    expect(
      await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: null,
      }),
    ).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 520 },
      attempted: { basePriceRsd: null },
    });
    expect(await storedPrice(t, burger.articleId)).toBe(520);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
  });

  test("an article nobody priced yet: both see none, the second save is refused and sees the first price", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w, null);
    expect(await priceSeenBy(t, w.ownerId, w.a.defaultPageId, burger.articleId)).toBeNull();
    expect(await priceSeenBy(t, w.managerId, w.a.defaultPageId, burger.articleId)).toBeNull();

    expect(
      await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: null,
        priceRsd: 100,
      }),
    ).toEqual({ ok: true });
    expect(
      await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: null,
        priceRsd: 200,
      }),
    ).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 100 },
      attempted: { basePriceRsd: 200 },
    });
    expect(await storedPrice(t, burger.articleId)).toBe(100);
  });

  test("the same person in two tabs: the tab with the stale value is refused", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w);
    const tabOne = as(t, w.ownerId);
    const tabTwo = as(t, w.ownerId);

    expect(
      await tabOne.mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 500,
      }),
    ).toEqual({ ok: true });
    const revision = await revisionOf(t, w.a.menuServiceId);

    expect(
      await tabTwo.mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 480,
      }),
    ).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 500 },
      attempted: { basePriceRsd: 480 },
    });
    expect(await storedPrice(t, burger.articleId)).toBe(500);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
  });

  test("two saves racing from the same starting point: exactly one wins and the other gets the winner's value", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w);

    const [ownerResult, managerResult] = await Promise.all([
      as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 480,
      }),
      as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 520,
      }),
    ]);

    expect([ownerResult.ok, managerResult.ok].filter(Boolean)).toHaveLength(1);
    const ownerWon = ownerResult.ok;
    const winner = ownerWon ? 480 : 520;
    const loser = ownerWon ? 520 : 480;
    expect(await storedPrice(t, burger.articleId)).toBe(winner);
    expect(ownerWon ? managerResult : ownerResult).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: winner },
      attempted: { basePriceRsd: loser },
    });
    // Exactly one change reached the draft.
    expect((await draftOf(t, w.a.menuServiceId)).lastEditByUserId).toBe(ownerWon ? w.ownerId : w.managerId);
  });

  test("different values do not conflict: one person changes the price, the other the name and description", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w);
    const revision = await revisionOf(t, w.a.menuServiceId);

    expect(
      await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
        articleId: burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 520,
      }),
    ).toEqual({ ok: true });
    expect(
      await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
        articleId: burger.articleId,
        expected: { name: "Pljeskavica", description: null },
        patch: { name: "Pljeskavica XL", description: "Sa kajmakom" },
      }),
    ).toEqual({ ok: true });

    const stored = await t.run(async (ctx) => await ctx.db.get(burger.articleId));
    expect(stored).toMatchObject({ basePriceRsd: 520, name: "Pljeskavica XL", description: "Sa kajmakom" });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision + 2);
  });
});

// =============================================================================
// Name and description (updateArticleFields)
// =============================================================================

describe("conflicts — article fields are all-or-nothing", () => {
  test("only the conflicting field is echoed as attempted, and even the non-conflicting field is not written", async () => {
    const { t, w } = await setup();
    const { burger } = await burgerFixture(t, w);
    // The manager adds a description meanwhile.
    expect(
      await as(t, w.managerId).mutation(api.menuCatalog.updateArticleFields, {
        articleId: burger.articleId,
        expected: { description: null },
        patch: { description: "Sa kajmakom" },
      }),
    ).toEqual({ ok: true });
    const revision = await revisionOf(t, w.a.menuServiceId);

    const refused = await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId: burger.articleId,
      expected: { name: "Pljeskavica", description: null },
      patch: { name: "Pljeskavica XL", description: "Sa lukom" },
    });
    expect(refused).toEqual({
      ok: false,
      conflicts: ["description"],
      current: { name: "Pljeskavica", description: "Sa kajmakom" },
      attempted: { description: "Sa lukom" },
    });

    const stored = await t.run(async (ctx) => await ctx.db.get(burger.articleId));
    expect(stored).toMatchObject({ name: "Pljeskavica", description: "Sa kajmakom" });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
  });
});

// =============================================================================
// The same pattern for every writer with an expected value
// =============================================================================

type Case = {
  /** The key the conflict is reported under. */
  field: string;
  start: CasValue;
  first: CasValue;
  second: CasValue;
  menuServiceId: Id<"menuServices">;
  write: (userId: Id<"users">, expected: CasValue, value: CasValue) => Promise<unknown>;
  stored: () => Promise<CasValue>;
};

const CASES: { name: string; build: (t: T, w: MenuWorldSeed) => Promise<Case> }[] = [
  {
    name: "setBasePrice (price of the shared article)",
    build: async (t, w) => {
      const { burger } = await burgerFixture(t, w);
      return {
        field: "basePriceRsd",
        start: 450,
        first: 520,
        second: 480,
        menuServiceId: w.a.menuServiceId,
        write: (userId, expected, value) =>
          as(t, userId).mutation(api.menuCatalog.setBasePrice, {
            articleId: burger.articleId,
            expectedPriceRsd: expected as number | null,
            priceRsd: value as number | null,
          }),
        stored: () => storedPrice(t, burger.articleId),
      };
    },
  },
  {
    name: "updateArticleFields (article name)",
    build: async (t, w) => {
      const { burger } = await burgerFixture(t, w);
      return {
        field: "name",
        start: "Pljeskavica",
        first: "Pljeskavica sa kajmakom",
        second: "Pljeskavica XL",
        menuServiceId: w.a.menuServiceId,
        write: (userId, expected, value) =>
          as(t, userId).mutation(api.menuCatalog.updateArticleFields, {
            articleId: burger.articleId,
            expected: { name: expected as string },
            patch: { name: value as string },
          }),
        stored: async () => (await t.run(async (ctx) => await ctx.db.get(burger.articleId)))?.name ?? null,
      };
    },
  },
  {
    name: "updateVariant (variant price)",
    build: async (t, w) => {
      const { burger } = await burgerFixture(t, w);
      const { variantId } = await as(t, w.ownerId).mutation(api.menuArticleOptions.addVariant, {
        articleId: burger.articleId,
        name: "Velika",
        priceRsd: 650,
      });
      return {
        field: "priceRsd",
        start: 650,
        first: 700,
        second: 690,
        menuServiceId: w.a.menuServiceId,
        write: (userId, expected, value) =>
          as(t, userId).mutation(api.menuArticleOptions.updateVariant, {
            variantId,
            expected: { priceRsd: expected as number | null },
            patch: { priceRsd: value as number | null },
          }),
        stored: async () => (await t.run(async (ctx) => await ctx.db.get(variantId)))?.priceRsd ?? null,
      };
    },
  },
  {
    name: "menuPages.rename (page name)",
    build: async (t, w) => {
      const { pageId } = await as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name: "Vinska karta",
      });
      return {
        field: "name",
        start: "Vinska karta",
        first: "Vina",
        second: "Karta vina",
        menuServiceId: w.a.menuServiceId,
        write: (userId, expected, value) =>
          as(t, userId).mutation(api.menuPages.rename, {
            pageId,
            name: value as string,
            expectedName: expected as string,
          }),
        stored: async () => (await t.run(async (ctx) => await ctx.db.get(pageId)))?.name ?? null,
      };
    },
  },
  {
    name: "renameSection (section name)",
    build: async (t, w) => {
      const { section } = await burgerFixture(t, w);
      return {
        field: "name",
        start: "Roštilj",
        first: "Sa roštilja",
        second: "Roštilj i ostalo",
        menuServiceId: w.a.menuServiceId,
        write: (userId, expected, value) =>
          as(t, userId).mutation(api.menuCatalog.renameSection, {
            sectionId: section.sectionId,
            name: value as string,
            expectedName: expected as string,
          }),
        stored: async () =>
          (await t.run(async (ctx) => await ctx.db.get(section.sectionId)))?.name ?? null,
      };
    },
  },
  {
    name: "Room service setManualPrice (Premium)",
    build: async (t, w) => {
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
      });
      const { burger } = await burgerFixture(t, w);
      const owner = as(t, w.ownerId);
      const category = await owner.mutation(api.menuRoomService.addCategory, {
        menuServiceId: w.a.menuServiceId,
        name: "Hrana u sobu",
      });
      await owner.mutation(api.menuRoomService.addItems, {
        categoryId: category.categoryId,
        articleIds: [burger.articleId],
      });
      const view = await owner.query(api.menuRoomService.get, { menuServiceId: w.a.menuServiceId });
      const item = view?.categories
        .flatMap((row) => row.items)
        .find((row) => row.article.articleId === burger.articleId);
      if (!item) throw new Error("the article is not in Room service");
      return {
        field: "manualPriceRsd",
        start: null,
        first: 600,
        second: 650,
        menuServiceId: w.a.menuServiceId,
        write: (userId, expected, value) =>
          as(t, userId).mutation(api.menuRoomService.setManualPrice, {
            itemId: item.itemId,
            expectedManualPriceRsd: expected as number | null,
            manualPriceRsd: value as number | null,
          }),
        stored: async () =>
          (await t.run(async (ctx) => await ctx.db.get(item.itemId)))?.manualPriceRsd ?? null,
      };
    },
  },
];

type Who = "ownerId" | "managerId" | "editorId";

const PAIRS: { label: string; first: Who; second: Who }[] = [
  { label: "owner saves first, manager second", first: "ownerId", second: "managerId" },
  { label: "manager saves first, owner second", first: "managerId", second: "ownerId" },
  { label: "the owner in two tabs (second tab is stale)", first: "ownerId", second: "ownerId" },
  { label: "editor saves first, owner second", first: "editorId", second: "ownerId" },
];

for (const testCase of CASES) {
  describe(`conflicts — ${testCase.name}`, () => {
    for (const pair of PAIRS) {
      test(`${pair.label}: the later save is refused with both values and nothing is overwritten`, async () => {
        const { t, w } = await setup();
        const c = await testCase.build(t, w);
        const firstUser = w[pair.first];
        const secondUser = w[pair.second];
        expect(await c.stored()).toEqual(c.start);

        expect(await c.write(firstUser, c.start, c.first)).toEqual({ ok: true });
        const afterFirst = await draftOf(t, c.menuServiceId);
        expect(await c.stored()).toEqual(c.first);
        expect(afterFirst.lastEditByUserId).toBe(firstUser);

        const refused = await c.write(secondUser, c.start, c.second);
        expect(refused).toEqual({
          ok: false,
          conflicts: [c.field],
          current: { [c.field]: c.first },
          attempted: { [c.field]: c.second },
        });
        expect(await c.stored()).toEqual(c.first);
        const afterRefusal = await draftOf(t, c.menuServiceId);
        expect(afterRefusal.revision).toBe(afterFirst.revision);
        expect(afterRefusal.lastEditAt).toBe(afterFirst.lastEditAt);
        expect(afterRefusal.lastEditByUserId).toBe(firstUser);

        // Seeing the saved value first, the later writer can save on top of it.
        expect(await c.write(secondUser, c.first, c.second)).toEqual({ ok: true });
        expect(await c.stored()).toEqual(c.second);
        const afterRetry = await draftOf(t, c.menuServiceId);
        expect(afterRetry.revision).toBe(afterFirst.revision + 1);
        expect(afterRetry.lastEditByUserId).toBe(secondUser);
      });
    }
  });
}

// =============================================================================
// The rule itself
// =============================================================================

describe("checkCas", () => {
  test("is ok when every expected field still holds its value, and ignores fields it was not asked about", () => {
    expect(checkCas<"price" | "name">({ price: 450, name: "Pljeskavica" }, { price: 450 })).toEqual({ ok: true });
    expect(
      checkCas<"price" | "name">({ price: 450, name: "Pljeskavica" }, { price: 450, name: "Pljeskavica" }),
    ).toEqual({ ok: true });
    expect(checkCas<"price">({ price: 450 }, {})).toEqual({ ok: true });
  });

  test("an absent field and null are the same value", () => {
    expect(checkCas<"description">({}, { description: null })).toEqual({ ok: true });
    expect(checkCas<"description">({ description: undefined }, { description: null })).toEqual({ ok: true });
    expect(checkCas<"description">({ description: null }, { description: null })).toEqual({ ok: true });
    expect(checkCas<"description">({ description: "Sa kajmakom" }, { description: null })).toMatchObject({
      ok: false,
      conflicts: ["description"],
    });
    expect(checkCas<"description">({}, { description: "Sa kajmakom" })).toMatchObject({
      ok: false,
      conflicts: ["description"],
    });
  });

  test("without the third argument a conflict carries no attempted", () => {
    const result = checkCas<"price">({ price: 520 }, { price: 450 });
    expect(result).toEqual({ ok: false, conflicts: ["price"], current: { price: 520 } });
    expect(result).not.toHaveProperty("attempted");
  });

  test("with the third argument only the conflicting fields are echoed", () => {
    const result = checkCas<"price" | "name" | "description">(
      { price: 520, name: "Pljeskavica", description: "Sa kajmakom" },
      { price: 450, name: "Pljeskavica", description: null },
      { price: 480, name: "Pljeskavica XL", description: "Sa lukom" },
    );
    expect(result).toEqual({
      ok: false,
      conflicts: ["price", "description"],
      // Every expected field is reported with its current value, conflicting or not.
      current: { price: 520, name: "Pljeskavica", description: "Sa kajmakom" },
      attempted: { price: 480, description: "Sa lukom" },
    });
    if (result.ok) throw new Error("expected a conflict");
    expect(result.attempted).not.toHaveProperty("name");
  });

  test("a conflicting field the caller did not try to write is not invented in attempted; an undefined attempt is null", () => {
    expect(
      checkCas<"price" | "name">({ price: 520, name: "B" }, { price: 450, name: "A" }, { name: "C" }),
    ).toEqual({
      ok: false,
      conflicts: ["price", "name"],
      current: { price: 520, name: "B" },
      attempted: { name: "C" },
    });
    expect(checkCas<"price">({ price: 520 }, { price: 450 }, { price: undefined })).toEqual({
      ok: false,
      conflicts: ["price"],
      current: { price: 520 },
      attempted: { price: null },
    });
    expect(checkCas<"price">({ price: 520 }, { price: 450 }, {})).toEqual({
      ok: false,
      conflicts: ["price"],
      current: { price: 520 },
      attempted: {},
    });
  });

  test("an absent current value is reported as null", () => {
    expect(checkCas<"price">({}, { price: 450 }, { price: 480 })).toEqual({
      ok: false,
      conflicts: ["price"],
      current: { price: null },
      attempted: { price: 480 },
    });
  });

  test("no conflict means no attempted, even when the attempt is given", () => {
    const result = checkCas<"price">({ price: 450 }, { price: 450 }, { price: 480 });
    expect(result).toEqual({ ok: true });
    expect(result).not.toHaveProperty("attempted");
  });
});
