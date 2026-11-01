/// <reference types="vite/client" />

// ScanMe Menu V1 — K04: combos (master §5.4). A combo is its own article built
// from existing ordinary articles; its price is MANUAL. A component price
// change only raises "check the combo price" (priceCheck) and never changes the
// published price; only the client's decision (keep it, or set a new price)
// clears the flag. Covered: creation, the acceptance scenario, component
// validation, replacing components, the read model, roles and tenant isolation.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ARTICLE_ERROR } from "../lib/menu/errors/article";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_MAX_ARTICLES } from "../lib/menu/limits";
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

const C = api.menuCombos;

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

/** Tenant A: section "Meniji" with Burger 650, Pomfrit 250 and Sok (no price). */
async function fixture(t: T, w: MenuWorldSeed) {
  const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Meniji");
  const burger = await quickAdd(t, w.ownerId, section.sectionId, "Burger", 650);
  const fries = await quickAdd(t, w.ownerId, section.sectionId, "Pomfrit", 250);
  const juice = await quickAdd(t, w.ownerId, section.sectionId, "Sok");
  return {
    sectionId: section.sectionId,
    burgerId: burger.articleId,
    burgerKey: burger.key,
    friesId: fries.articleId,
    friesKey: fries.key,
    juiceId: juice.articleId,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

/** "Burger meni" 990 RSD with Burger and Pomfrit, created by the owner. */
async function burgerMeni(t: T, w: MenuWorldSeed, f: Fixture) {
  return await as(t, w.ownerId).mutation(C.createCombo, {
    sectionId: f.sectionId,
    name: "Burger meni",
    priceRsd: 990,
    components: [
      { articleId: f.burgerId, quantity: 1 },
      { articleId: f.friesId, quantity: 1 },
    ],
  });
}

/** Tenant B: one section with one article, created by B's own owner. */
async function tenantBFixture(t: T, w: MenuWorldSeed) {
  const section = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
  const beer = await quickAdd(t, w.otherOwnerId, section.sectionId, "Jelen pivo", 200);
  const mate = await quickAdd(t, w.otherOwnerId, section.sectionId, "Pljeskavica", 450);
  return { sectionId: section.sectionId, articleId: beer.articleId, mateId: mate.articleId };
}

async function setPrice(
  t: T,
  userId: Id<"users">,
  articleId: Id<"menuArticles">,
  from: number | null,
  to: number | null,
) {
  return await as(t, userId).mutation(api.menuCatalog.setBasePrice, {
    articleId,
    expectedPriceRsd: from,
    priceRsd: to,
  });
}

async function articleOf(t: T, articleId: Id<"menuArticles">) {
  const article = await t.run(async (ctx) => await ctx.db.get(articleId));
  if (!article) throw new Error("article missing");
  return article;
}

async function componentRows(t: T, comboArticleId: Id<"menuArticles">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuComboComponents")
      .withIndex("by_comboArticleId_and_order", (q) => q.eq("comboArticleId", comboArticleId))
      .collect(),
  );
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

/** Everything combos write for one service, to prove "nothing changed". */
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
  }));
}

// =============================================================================
// createCombo
// =============================================================================

describe("createCombo", () => {
  test("creates a combo article with a manual price, places it in the section and stores the components", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const before = await draftOf(t, w.a.menuServiceId);

    const created = await as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name: "  Burger   meni ",
      priceRsd: 990,
      components: [
        { articleId: f.burgerId, quantity: 1 },
        { articleId: f.friesId, quantity: 2 },
      ],
    });

    const combo = await articleOf(t, created.articleId);
    expect(combo).toMatchObject({
      kind: "combo",
      name: "Burger meni",
      nameNormalized: "burger meni",
      basePriceRsd: 990,
      mediaMode: "none",
      key: created.key,
      menuServiceId: w.a.menuServiceId,
      updatedByUserId: w.ownerId,
    });
    expect(combo.priceCheck).toBeUndefined();

    // Components, in the given order, each once with its quantity.
    const rows = await componentRows(t, created.articleId);
    expect(
      rows.map((row) => ({
        component: row.componentArticleId,
        quantity: row.quantity,
        order: row.order,
        service: row.menuServiceId,
      })),
    ).toEqual([
      { component: f.burgerId, quantity: 1, order: 1024, service: w.a.menuServiceId },
      { component: f.friesId, quantity: 2, order: 2048, service: w.a.menuServiceId },
    ]);

    // Placed in the section, visible, and shown by the page like any article.
    const placement = await t.run(async (ctx) => await ctx.db.get(created.placementId));
    expect(placement).toMatchObject({
      sectionId: f.sectionId,
      articleId: created.articleId,
      visibility: "visible",
    });
    const page = await as(t, w.ownerId).query(api.menuCatalog.pageContent, {
      pageId: w.a.defaultPageId,
    });
    const shown = page?.sections[0].placements.find((p) => p.article.articleId === created.articleId);
    expect(shown?.article).toMatchObject({ kind: "combo", name: "Burger meni", basePriceRsd: 990 });
    const pageRow = await t.run(async (ctx) => await ctx.db.get(w.a.defaultPageId));
    expect(pageRow?.placementCount).toBe(4);

    // One draft change: revision +1, one more article.
    const after = await draftOf(t, w.a.menuServiceId);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount + 1);
    expect(after.lastEditByUserId).toBe(w.ownerId);
  });

  test("the price is optional", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const created = await as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name: "Meni dana",
      components: [{ articleId: f.burgerId, quantity: 1 }],
    });
    const combo = await articleOf(t, created.articleId);
    expect(combo.kind).toBe("combo");
    expect(combo.basePriceRsd).toBeUndefined();
  });

  test("an invalid name or price, an archived page and the article ceiling write nothing", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const components = [{ articleId: f.burgerId, quantity: 1 }];
    const before = await snapshot(t, w.a.menuServiceId);

    for (const name of ["", "   ", "x".repeat(121)]) {
      await expectCode(
        as(t, w.ownerId).mutation(C.createCombo, { sectionId: f.sectionId, name, components }),
        MENU_ERROR.invalidInput,
      );
    }
    for (const priceRsd of [-1, 12.5, 1_000_001]) {
      await expectCode(
        as(t, w.ownerId).mutation(C.createCombo, {
          sectionId: f.sectionId,
          name: "Meni",
          priceRsd,
          components,
        }),
        MENU_ERROR.invalidInput,
      );
    }

    await t.run(async (ctx) => {
      const draft = await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .unique();
      if (!draft) throw new Error("draft state missing");
      await ctx.db.patch(draft._id, { articleCount: MENU_MAX_ARTICLES });
    });
    await expectCode(
      as(t, w.ownerId).mutation(C.createCombo, { sectionId: f.sectionId, name: "Meni", components }),
      MENU_ERROR.limitReached,
    );
    await t.run(async (ctx) => {
      const draft = await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .unique();
      if (!draft) throw new Error("draft state missing");
      await ctx.db.patch(draft._id, { articleCount: before.draft?.articleCount ?? 0 });
      await ctx.db.patch(w.a.defaultPageId, { archivedAt: Date.now() });
    });
    await expectCode(
      as(t, w.ownerId).mutation(C.createCombo, { sectionId: f.sectionId, name: "Meni", components }),
      MENU_ERROR.pageArchived,
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.defaultPageId, { archivedAt: undefined });
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

// =============================================================================
// The acceptance scenario (master §5.4)
// =============================================================================

describe("a component price change only raises 'check the combo price'", () => {
  test("Burger meni 990 with Burger 650 and Pomfrit 250: the published price never changes by itself", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    expect((await articleOf(t, combo.articleId)).basePriceRsd).toBe(990);

    // 1. Burger 650 -> 700: the combo is flagged with Burger, the price is still 990.
    expect(await setPrice(t, w.ownerId, f.burgerId, 650, 700)).toEqual({ ok: true });
    const flagged = await articleOf(t, combo.articleId);
    expect(flagged.basePriceRsd).toBe(990);
    expect(flagged.priceCheck).toMatchObject({
      changedComponentKeys: [f.burgerKey],
      removedComponentNames: [],
    });
    const since = flagged.priceCheck?.since;
    expect(typeof since).toBe("number");

    const detail = await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: combo.articleId });
    expect(detail?.priceRsd).toBe(990);
    expect(detail?.priceCheck).toEqual({
      since,
      changedComponents: [{ key: f.burgerKey, name: "Burger" }],
      removedComponentNames: [],
    });
    expect(detail?.componentsTotal).toEqual({ totalRsd: 950, complete: true });

    // 2. Pomfrit 250 -> 300: its key is added, the first `since` stays, price 990.
    expect(await setPrice(t, w.ownerId, f.friesId, 250, 300)).toEqual({ ok: true });
    const flaggedTwice = await articleOf(t, combo.articleId);
    expect(flaggedTwice.basePriceRsd).toBe(990);
    expect(flaggedTwice.priceCheck).toEqual({
      since,
      changedComponentKeys: [f.burgerKey, f.friesKey],
      removedComponentNames: [],
    });

    // Changing the same component again does not grow the list.
    expect(await setPrice(t, w.ownerId, f.burgerId, 700, 720)).toEqual({ ok: true });
    expect((await articleOf(t, combo.articleId)).priceCheck?.changedComponentKeys).toEqual([
      f.burgerKey,
      f.friesKey,
    ]);

    // 3. "Zadrži cenu": the flag goes, the price is still 990, one draft change.
    const revision = (await draftOf(t, w.a.menuServiceId)).revision;
    expect(await as(t, w.ownerId).mutation(C.resolvePriceCheck, { comboArticleId: combo.articleId }))
      .toEqual({ ok: true });
    const resolved = await articleOf(t, combo.articleId);
    expect(resolved.priceCheck).toBeUndefined();
    expect(resolved.basePriceRsd).toBe(990);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 1);
    expect(
      (await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: combo.articleId }))?.priceCheck,
    ).toBeNull();

    // Resolving again is a no-op: no draft change.
    expect(await as(t, w.ownerId).mutation(C.resolvePriceCheck, { comboArticleId: combo.articleId }))
      .toEqual({ ok: true });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 1);
  });

  test("a new combo price (setBasePrice 990 -> 1050) clears the flag; the combo is the only price writer's target", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    await setPrice(t, w.ownerId, f.burgerId, 650, 700);
    expect((await articleOf(t, combo.articleId)).priceCheck).toBeDefined();

    expect(await setPrice(t, w.ownerId, combo.articleId, 990, 1050)).toEqual({ ok: true });
    const updated = await articleOf(t, combo.articleId);
    expect(updated.basePriceRsd).toBe(1050);
    expect(updated.priceCheck).toBeUndefined();

    // A later component change raises a fresh flag with a new `since`.
    await setPrice(t, w.ownerId, f.friesId, 250, 260);
    const again = await articleOf(t, combo.articleId);
    expect(again.basePriceRsd).toBe(1050);
    expect(again.priceCheck?.changedComponentKeys).toEqual([f.friesKey]);
  });

  test("a component with the same price (no change) raises no flag; a combo containing nothing changed stays clean", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    expect(await setPrice(t, w.ownerId, f.burgerId, 650, 650)).toEqual({ ok: true });
    // An article that is in no combo: Sok.
    expect(await setPrice(t, w.ownerId, f.juiceId, null, 120)).toEqual({ ok: true });
    expect((await articleOf(t, combo.articleId)).priceCheck).toBeUndefined();
  });
});

// =============================================================================
// Component validation
// =============================================================================

describe("component validation", () => {
  test("createCombo refuses a combo inside a combo, duplicates, bad quantities and an empty list", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const inner = await burgerMeni(t, w, f);
    const before = await snapshot(t, w.a.menuServiceId);

    const bad: { label: string; components: { articleId: Id<"menuArticles">; quantity: number }[] }[] = [
      { label: "a combo as a component", components: [{ articleId: inner.articleId, quantity: 1 }] },
      {
        label: "a combo next to an article",
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: inner.articleId, quantity: 1 },
        ],
      },
      {
        label: "the same article twice",
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: f.burgerId, quantity: 2 },
        ],
      },
      { label: "quantity 0", components: [{ articleId: f.burgerId, quantity: 0 }] },
      { label: "quantity 21", components: [{ articleId: f.burgerId, quantity: 21 }] },
      { label: "quantity 1.5", components: [{ articleId: f.burgerId, quantity: 1.5 }] },
      { label: "an empty list", components: [] },
    ];
    for (const { label, components } of bad) {
      expect(
        await codeOf(
          as(t, w.ownerId).mutation(C.createCombo, {
            sectionId: f.sectionId,
            name: "Loš meni",
            priceRsd: 500,
            components,
          }),
        ),
        label,
      ).toBe(ARTICLE_ERROR.comboComponentInvalid);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("setComboComponents refuses the combo itself, a combo, duplicates, bad quantities and an empty list", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    const other = await as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name: "Drugi meni",
      priceRsd: 700,
      components: [{ articleId: f.juiceId, quantity: 1 }],
    });
    const before = await snapshot(t, w.a.menuServiceId);

    const bad: { label: string; components: { articleId: Id<"menuArticles">; quantity: number }[] }[] = [
      { label: "the combo itself", components: [{ articleId: combo.articleId, quantity: 1 }] },
      {
        label: "the combo itself among others",
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: combo.articleId, quantity: 1 },
        ],
      },
      { label: "another combo", components: [{ articleId: other.articleId, quantity: 1 }] },
      {
        label: "duplicates",
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: f.burgerId, quantity: 1 },
        ],
      },
      { label: "quantity 0", components: [{ articleId: f.burgerId, quantity: 0 }] },
      { label: "quantity 21", components: [{ articleId: f.burgerId, quantity: 21 }] },
      { label: "an empty list", components: [] },
    ];
    for (const { label, components } of bad) {
      expect(
        await codeOf(
          as(t, w.ownerId).mutation(C.setComboComponents, {
            comboArticleId: combo.articleId,
            components,
          }),
        ),
        label,
      ).toBe(ARTICLE_ERROR.comboComponentInvalid);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("an article of another tenant is not_found and nothing is written", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    const b = await tenantBFixture(t, w);
    const beforeA = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);

    await expectCode(
      as(t, w.ownerId).mutation(C.createCombo, {
        sectionId: f.sectionId,
        name: "Tuđi meni",
        priceRsd: 500,
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: b.articleId, quantity: 1 },
        ],
      }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      as(t, w.ownerId).mutation(C.setComboComponents, {
        comboArticleId: combo.articleId,
        components: [{ articleId: b.articleId, quantity: 1 }],
      }),
      MENU_ERROR.notFound,
    );
    // Even an admin who may act on both services cannot mix them.
    await expectCode(
      as(t, w.adminId).mutation(C.setComboComponents, {
        comboArticleId: combo.articleId,
        components: [{ articleId: b.articleId, quantity: 1 }],
      }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      as(t, w.adminId).mutation(C.createCombo, {
        sectionId: b.sectionId,
        name: "Meni",
        components: [{ articleId: f.burgerId, quantity: 1 }],
      }),
      MENU_ERROR.notFound,
    );

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
  });
});

// =============================================================================
// setComboComponents / resolvePriceCheck
// =============================================================================

describe("setComboComponents", () => {
  test("replaces the whole list in the given order and leaves the price and the flag alone", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    await setPrice(t, w.ownerId, f.burgerId, 650, 700);
    const flagged = await articleOf(t, combo.articleId);
    expect(flagged.priceCheck).toBeDefined();
    const revision = (await draftOf(t, w.a.menuServiceId)).revision;

    const result = await as(t, w.ownerId).mutation(C.setComboComponents, {
      comboArticleId: combo.articleId,
      components: [
        { articleId: f.friesId, quantity: 2 },
        { articleId: f.juiceId, quantity: 1 },
      ],
    });
    expect(result).toEqual({ ok: true });

    const rows = await componentRows(t, combo.articleId);
    expect(rows.map((row) => [row.componentArticleId, row.quantity, row.order])).toEqual([
      [f.friesId, 2, 1024],
      [f.juiceId, 1, 2048],
    ]);
    // Burger is no longer in the combo; nothing else holds on to it.
    const burgerInCombos = await t.run(async (ctx) =>
      ctx.db
        .query("menuComboComponents")
        .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", f.burgerId))
        .collect(),
    );
    expect(burgerInCombos).toEqual([]);

    // The price and the flag are the client's decision, not a side effect.
    const after = await articleOf(t, combo.articleId);
    expect(after.basePriceRsd).toBe(990);
    expect(after.priceCheck).toEqual(flagged.priceCheck);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 1);
  });

  test("an identical list is a no-op: no rows rewritten, the draft revision does not move", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    const rowsBefore = await componentRows(t, combo.articleId);
    const before = await snapshot(t, w.a.menuServiceId);

    expect(
      await as(t, w.ownerId).mutation(C.setComboComponents, {
        comboArticleId: combo.articleId,
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: f.friesId, quantity: 1 },
        ],
      }),
    ).toEqual({ ok: true });

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect((await componentRows(t, combo.articleId)).map((row) => row._id)).toEqual(
      rowsBefore.map((row) => row._id),
    );
  });

  test("a different quantity or a different order is a change", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    const revision = (await draftOf(t, w.a.menuServiceId)).revision;

    await as(t, w.ownerId).mutation(C.setComboComponents, {
      comboArticleId: combo.articleId,
      components: [
        { articleId: f.burgerId, quantity: 1 },
        { articleId: f.friesId, quantity: 3 },
      ],
    });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 1);

    await as(t, w.ownerId).mutation(C.setComboComponents, {
      comboArticleId: combo.articleId,
      components: [
        { articleId: f.friesId, quantity: 3 },
        { articleId: f.burgerId, quantity: 1 },
      ],
    });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(revision + 2);
    expect((await componentRows(t, combo.articleId)).map((row) => row.componentArticleId)).toEqual([
      f.friesId,
      f.burgerId,
    ]);
  });

  test("an ordinary article is not a combo: article/not_combo, nothing written", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await burgerMeni(t, w, f);
    const before = await snapshot(t, w.a.menuServiceId);

    await expectCode(
      as(t, w.ownerId).mutation(C.setComboComponents, {
        comboArticleId: f.burgerId,
        components: [{ articleId: f.friesId, quantity: 1 }],
      }),
      ARTICLE_ERROR.notCombo,
    );
    await expectCode(
      as(t, w.ownerId).mutation(C.resolvePriceCheck, { comboArticleId: f.burgerId }),
      ARTICLE_ERROR.notCombo,
    );
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

// =============================================================================
// Read model
// =============================================================================

describe("comboDetail and combosContainingArticle", () => {
  test("comboDetail resolves the components, their regular prices and the one-by-one total", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name: "Burger meni",
      priceRsd: 990,
      components: [
        { articleId: f.burgerId, quantity: 1 },
        { articleId: f.friesId, quantity: 2 },
      ],
    });

    const detail = await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: combo.articleId });
    expect(detail).toMatchObject({
      articleId: combo.articleId,
      key: combo.key,
      name: "Burger meni",
      priceRsd: 990,
      priceCheck: null,
      componentsTotal: { totalRsd: 1150, complete: true },
    });
    expect(
      detail?.components.map((c) => ({
        articleId: c.articleId,
        key: c.key,
        name: c.name,
        quantity: c.quantity,
        unitPriceRsd: c.unitPriceRsd,
        order: c.order,
      })),
    ).toEqual([
      { articleId: f.burgerId, key: f.burgerKey, name: "Burger", quantity: 1, unitPriceRsd: 650, order: 1024 },
      { articleId: f.friesId, key: f.friesKey, name: "Pomfrit", quantity: 2, unitPriceRsd: 250, order: 2048 },
    ]);
    const rows = await componentRows(t, combo.articleId);
    expect(detail?.components.map((c) => c.componentId)).toEqual(rows.map((row) => row._id));
  });

  test("a component without a price makes the total incomplete; a combo without a price shows null", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name: "Meni sa sokom",
      components: [
        { articleId: f.burgerId, quantity: 1 },
        { articleId: f.juiceId, quantity: 1 },
      ],
    });
    const detail = await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: combo.articleId });
    expect(detail?.priceRsd).toBeNull();
    expect(detail?.components.map((c) => c.unitPriceRsd)).toEqual([650, null]);
    expect(detail?.componentsTotal).toEqual({ totalRsd: 650, complete: false });
  });

  test("the flag resolves changed keys to names of existing articles and drops unknown ones", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    await t.run(async (ctx) => {
      await ctx.db.patch(combo.articleId, {
        priceCheck: {
          since: 1234,
          changedComponentKeys: [f.burgerKey, "article_obrisan", f.friesKey],
          removedComponentNames: ["Sok od jabuke"],
        },
      });
    });
    const detail = await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: combo.articleId });
    expect(detail?.priceCheck).toEqual({
      since: 1234,
      changedComponents: [
        { key: f.burgerKey, name: "Burger" },
        { key: f.friesKey, name: "Pomfrit" },
      ],
      removedComponentNames: ["Sok od jabuke"],
    });
  });

  test("comboDetail is null for an ordinary article and for a missing one", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    expect(await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: f.burgerId })).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.delete(combo.articleId);
    });
    expect(await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: combo.articleId })).toBeNull();
  });

  test("combosContainingArticle lists the combos with the quantity; an article in no combo gets []", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const first = await burgerMeni(t, w, f);
    const second = await as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name: "Pomfrit duplo",
      priceRsd: 400,
      components: [{ articleId: f.friesId, quantity: 2 }],
    });

    const burgerIn = await as(t, w.ownerId).query(C.combosContainingArticle, { articleId: f.burgerId });
    expect(burgerIn).toEqual([
      { articleId: first.articleId, key: first.key, name: "Burger meni", quantity: 1 },
    ]);

    const friesIn = await as(t, w.ownerId).query(C.combosContainingArticle, { articleId: f.friesId });
    expect(friesIn).toHaveLength(2);
    expect(friesIn).toEqual(
      expect.arrayContaining([
        { articleId: first.articleId, key: first.key, name: "Burger meni", quantity: 1 },
        { articleId: second.articleId, key: second.key, name: "Pomfrit duplo", quantity: 2 },
      ]),
    );

    expect(await as(t, w.ownerId).query(C.combosContainingArticle, { articleId: f.juiceId })).toEqual([]);
    // A combo that is nobody's component.
    expect(
      await as(t, w.ownerId).query(C.combosContainingArticle, { articleId: first.articleId }),
    ).toEqual([]);
  });
});

// =============================================================================
// Roles and tenant isolation
// =============================================================================

describe("roles", () => {
  test("owner, manager, editor and admin can create, replace and resolve; the draft records who", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    for (const [label, userId] of [
      ["vlasnik", w.ownerId],
      ["menadzer", w.managerId],
      ["urednik", w.editorId],
      ["admin", w.adminId],
    ] as const) {
      const created = await as(t, userId).mutation(C.createCombo, {
        sectionId: f.sectionId,
        name: `Meni ${label}`,
        priceRsd: 800,
        components: [{ articleId: f.burgerId, quantity: 1 }],
      });
      expect(await articleOf(t, created.articleId)).toMatchObject({
        kind: "combo",
        updatedByUserId: userId,
      });

      expect(
        await as(t, userId).mutation(C.setComboComponents, {
          comboArticleId: created.articleId,
          components: [
            { articleId: f.burgerId, quantity: 1 },
            { articleId: f.friesId, quantity: 1 },
          ],
        }),
      ).toEqual({ ok: true });
      expect((await draftOf(t, w.a.menuServiceId)).lastEditByUserId).toBe(userId);

      await t.run(async (ctx) => {
        await ctx.db.patch(created.articleId, {
          priceCheck: { since: 1, changedComponentKeys: [f.burgerKey], removedComponentNames: [] },
        });
      });
      expect(
        await as(t, userId).mutation(C.resolvePriceCheck, { comboArticleId: created.articleId }),
      ).toEqual({ ok: true });
      expect((await articleOf(t, created.articleId)).priceCheck).toBeUndefined();

      const detail = await as(t, userId).query(C.comboDetail, { comboArticleId: created.articleId });
      expect(detail?.name).toBe(`Meni ${label}`);
      expect(
        await as(t, userId).query(C.combosContainingArticle, { articleId: f.burgerId }),
      ).not.toBeNull();
    }
    expect((await draftOf(t, w.a.menuServiceId)).articleCount).toBe(7);
  });

  test("finance, view-only, an outsider and another tenant's owner: not_found on writes, null on reads", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    await setPrice(t, w.ownerId, f.burgerId, 650, 700);
    const before = await snapshot(t, w.a.menuServiceId);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const actor = as(t, userId);
      await expectCode(
        actor.mutation(C.createCombo, {
          sectionId: f.sectionId,
          name: "Upad",
          components: [{ articleId: f.burgerId, quantity: 1 }],
        }),
        MENU_ERROR.notFound,
      );
      await expectCode(
        actor.mutation(C.setComboComponents, {
          comboArticleId: combo.articleId,
          components: [{ articleId: f.friesId, quantity: 1 }],
        }),
        MENU_ERROR.notFound,
      );
      await expectCode(
        actor.mutation(C.resolvePriceCheck, { comboArticleId: combo.articleId }),
        MENU_ERROR.notFound,
      );
      expect(await actor.query(C.comboDetail, { comboArticleId: combo.articleId })).toBeNull();
      expect(await actor.query(C.combosContainingArticle, { articleId: f.burgerId })).toBeNull();
    }
    // An anonymous caller reads nothing and writes nothing.
    expect(await t.query(C.comboDetail, { comboArticleId: combo.articleId })).toBeNull();
    expect(await t.query(C.combosContainingArticle, { articleId: f.burgerId })).toBeNull();
    await expectCode(
      t.mutation(C.resolvePriceCheck, { comboArticleId: combo.articleId }),
      MENU_ERROR.unauthenticated,
    );

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect((await articleOf(t, combo.articleId)).priceCheck).toBeDefined();
  });

  test("the owner of A cannot read or change a combo of B, and B's data stays as it was", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    await burgerMeni(t, w, f);
    const b = await tenantBFixture(t, w);
    const bCombo = await as(t, w.otherOwnerId).mutation(C.createCombo, {
      sectionId: b.sectionId,
      name: "Meni B",
      priceRsd: 600,
      components: [{ articleId: b.articleId, quantity: 1 }],
    });
    const beforeB = await snapshot(t, w.b.menuServiceId);
    const beforeA = await snapshot(t, w.a.menuServiceId);

    await expectCode(
      as(t, w.ownerId).mutation(C.setComboComponents, {
        comboArticleId: bCombo.articleId,
        components: [{ articleId: b.mateId, quantity: 1 }],
      }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      as(t, w.ownerId).mutation(C.resolvePriceCheck, { comboArticleId: bCombo.articleId }),
      MENU_ERROR.notFound,
    );
    await expectCode(
      as(t, w.ownerId).mutation(C.createCombo, {
        sectionId: b.sectionId,
        name: "Upad",
        components: [{ articleId: b.articleId, quantity: 1 }],
      }),
      MENU_ERROR.notFound,
    );
    expect(await as(t, w.ownerId).query(C.comboDetail, { comboArticleId: bCombo.articleId })).toBeNull();
    expect(
      await as(t, w.ownerId).query(C.combosContainingArticle, { articleId: b.articleId }),
    ).toBeNull();

    // B's owner sees B's combo, but cannot see A's.
    const own = await as(t, w.otherOwnerId).query(C.comboDetail, { comboArticleId: bCombo.articleId });
    expect(own?.name).toBe("Meni B");

    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
  });

  test("editing switched off by ScanMe blocks the client roles but not the admin", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combo = await burgerMeni(t, w, f);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const before = await snapshot(t, w.a.menuServiceId);
    for (const userId of [w.ownerId, w.managerId, w.editorId]) {
      await expectCode(
        as(t, userId).mutation(C.setComboComponents, {
          comboArticleId: combo.articleId,
          components: [{ articleId: f.friesId, quantity: 1 }],
        }),
        MENU_ERROR.editingDisabled,
      );
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect(
      await as(t, w.adminId).mutation(C.setComboComponents, {
        comboArticleId: combo.articleId,
        components: [{ articleId: f.friesId, quantity: 1 }],
      }),
    ).toEqual({ ok: true });
  });
});
