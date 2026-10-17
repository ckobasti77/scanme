/// <reference types="vite/client" />

// ScanMe Menu V1 — K04: variants, linked add-on groups and the per-article
// option switches (master §5.7, §7.5). A plain article stays "Naziv + Cena";
// variants, add-ons and note are switches that are OFF by default. One add-on
// group can be linked to many articles; the client edits it for all of them or
// makes an independent copy for one article.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { ARTICLE_ERROR } from "../lib/menu/errors/article";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ADDON_GROUPS,
  MENU_MAX_ADDON_GROUPS_PER_ARTICLE,
  MENU_MAX_ADDON_OPTIONS_PER_GROUP,
  MENU_MAX_ARTICLE_BATCH,
  MENU_MAX_VARIANTS_PER_ARTICLE,
} from "../lib/menu/limits";
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
type Actor = ReturnType<typeof as>;

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

/** The `ok: true` branch of a CAS-style result; fails the test on a conflict. */
function ok<R extends { ok: boolean }>(result: R): Extract<R, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result as Extract<R, { ok: true }>;
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

/** Three coffees in one section of a tenant's default page. */
async function coffeeFixture(t: T, userId: Id<"users">, pageId: Id<"menuPages">) {
  const section = await as(t, userId).mutation(api.menuCatalog.addSection, {
    pageId,
    name: "Topli napici",
  });
  const kafa = await quickAdd(t, userId, section.sectionId, "Kafa", 150);
  const kapucino = await quickAdd(t, userId, section.sectionId, "Kapućino", 200);
  const late = await quickAdd(t, userId, section.sectionId, "Late", 220);
  return {
    sectionId: section.sectionId,
    kafaId: kafa.articleId,
    kafaKey: kafa.key,
    kapucinoId: kapucino.articleId,
    kapucinoKey: kapucino.key,
    lateId: late.articleId,
    lateKey: late.key,
  };
}
type Coffees = Awaited<ReturnType<typeof coffeeFixture>>;

const MILK_OPTIONS = [
  { name: "Sojino", priceDeltaRsd: 30 },
  { name: "Bademovo", priceDeltaRsd: 40 },
  { name: "Bez laktoze", priceDeltaRsd: 0 },
];

/** A new "Mleko" group (single choice, optional, three options) created on Kafa. */
async function milkOnKafa(t: T, userId: Id<"users">, f: Coffees) {
  return await as(t, userId).mutation(api.menuArticleOptions.createAddonGroup, {
    articleId: f.kafaId,
    name: "Mleko",
    selection: "single",
    required: false,
    options: MILK_OPTIONS,
  });
}

/** "Mleko" linked to Kafa, Kapućino and Late: one group, three articles. */
async function sharedMilk(t: T, userId: Id<"users">, f: Coffees) {
  const milk = await milkOnKafa(t, userId, f);
  for (const articleId of [f.kapucinoId, f.lateId]) {
    await as(t, userId).mutation(api.menuArticleOptions.attachAddonGroup, {
      articleId,
      groupId: milk.groupId,
    });
  }
  return milk;
}

async function optionsView(t: T, userId: Id<"users">, articleId: Id<"menuArticles">) {
  const view = await as(t, userId).query(api.menuArticleOptions.articleOptions, { articleId });
  if (!view) throw new Error("articleOptions returned null");
  return view;
}
type OptionsView = Awaited<ReturnType<typeof optionsView>>;

function namesOf(view: OptionsView) {
  return view.addonGroups.map((group) => group.name);
}

/** Tenant A with a variant ("Mala" 150) and a "Mleko" group, both on Kafa only. */
async function withOptions(t: T, userId: Id<"users">, f: Coffees) {
  const variant = await as(t, userId).mutation(api.menuArticleOptions.addVariant, {
    articleId: f.kafaId,
    name: "Mala",
    priceRsd: 150,
  });
  const milk = await milkOnKafa(t, userId, f);
  const view = await optionsView(t, userId, f.kafaId);
  return {
    ...f,
    variantId: variant.variantId,
    variantKey: variant.key,
    groupId: milk.groupId,
    groupKey: milk.key,
    optionId: view.addonGroups[0].options[0].optionId,
  };
}
type OptionsFixture = Awaited<ReturnType<typeof withOptions>>;

async function insertCombo(t: T, menuServiceId: Id<"menuServices">, name: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuArticles", {
      menuServiceId,
      key: newMenuKey("article"),
      kind: "combo",
      name,
      nameNormalized: name.toLowerCase(),
      basePriceRsd: 500,
      mediaMode: "none",
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function addComponent(
  t: T,
  menuServiceId: Id<"menuServices">,
  comboArticleId: Id<"menuArticles">,
  componentArticleId: Id<"menuArticles">,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("menuComboComponents", {
      menuServiceId,
      comboArticleId,
      componentArticleId,
      quantity: 1,
      order: 1024,
      createdAt: Date.now(),
    });
  });
}

/** Groups inserted straight into a service (to reach MENU_MAX_ADDON_GROUPS cheaply). */
async function fillGroups(t: T, menuServiceId: Id<"menuServices">, count: number) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("menuAddonGroups", {
        menuServiceId,
        key: newMenuKey("addonGroup"),
        name: `Grupa ${index}`,
        selection: "single",
        required: false,
        linkCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

/** `linkCount` is the exact number of link rows, for every group of the service. */
function expectExactLinkCounts(state: { groups: Doc<"menuAddonGroups">[]; links: Doc<"menuArticleAddonGroups">[] }) {
  for (const group of state.groups) {
    const links = state.links.filter((link) => link.groupId === group._id).length;
    expect(group.linkCount, `linkCount of ${group.name}`).toBe(links);
  }
}

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

/** Everything this module writes for one service (and the draft), to prove "nothing changed". */
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
    variants: await ctx.db
      .query("menuVariants")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    groups: await ctx.db
      .query("menuAddonGroups")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    options: await ctx.db
      .query("menuAddonOptions")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    links: await ctx.db
      .query("menuArticleAddonGroups")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    audit: await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}

describe("a plain article and the option switches", () => {
  test("a plain article stays 'Naziv + Cena': all switches off, no variants, no groups", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);

    expect(await optionsView(t, w.ownerId, f.kafaId)).toEqual({
      articleId: f.kafaId,
      kind: "item",
      variantsEnabled: false,
      addonsEnabled: false,
      noteEnabled: false,
      variants: [],
      addonGroups: [],
    });
    const article = await t.run(async (ctx) => ctx.db.get(f.kafaId));
    expect(article?.variantsEnabled).toBeUndefined();
    expect(article?.addonsEnabled).toBeUndefined();
    expect(article?.noteEnabled).toBeUndefined();
  });

  test("setArticleOptionSwitches needs a key, writes only changed values and bumps the revision once", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);

    await expect(
      owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, { articleId: f.kafaId }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    const result = await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
      articleId: f.kafaId,
      variantsEnabled: true,
      noteEnabled: true,
    });
    expect(result).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before.draft!.revision + 1);
    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect([view.variantsEnabled, view.addonsEnabled, view.noteEnabled]).toEqual([
      true,
      false,
      true,
    ]);
    const article = await t.run(async (ctx) => ctx.db.get(f.kafaId));
    expect(article).toMatchObject({
      name: "Kafa",
      basePriceRsd: 150,
      variantsEnabled: true,
      noteEnabled: true,
      updatedByUserId: w.ownerId,
    });
    // The switch that was not named is still absent.
    expect(article?.addonsEnabled).toBeUndefined();
  });

  test("an unchanged switch is a no-op: no write, no revision bump (absent counts as off)", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
      articleId: f.kafaId,
      variantsEnabled: true,
    });
    const before = await snapshot(t, w.a.menuServiceId);

    expect(
      await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
        articleId: f.kafaId,
        variantsEnabled: true,
      }),
    ).toEqual({ ok: true });
    expect(
      await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
        articleId: f.kapucinoId,
        addonsEnabled: false,
        noteEnabled: false,
      }),
    ).toEqual({ ok: true });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    const untouched = await t.run(async (ctx) => ctx.db.get(f.kapucinoId));
    expect(untouched?.addonsEnabled).toBeUndefined();
    expect(untouched?.noteEnabled).toBeUndefined();
  });

  test("turning a switch off keeps every variant and group row", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    await milkOnKafa(t, w.ownerId, f);
    const on = await optionsView(t, w.ownerId, f.kafaId);
    expect([on.variantsEnabled, on.addonsEnabled]).toEqual([true, true]);
    const rowsBefore = await snapshot(t, w.a.menuServiceId);

    await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
      articleId: f.kafaId,
      variantsEnabled: false,
      addonsEnabled: false,
    });
    const off = await optionsView(t, w.ownerId, f.kafaId);
    expect([off.variantsEnabled, off.addonsEnabled, off.noteEnabled]).toEqual([
      false,
      false,
      false,
    ]);
    expect(off.variants).toEqual(on.variants);
    expect(off.addonGroups).toEqual(on.addonGroups);
    const rowsAfter = await snapshot(t, w.a.menuServiceId);
    expect(rowsAfter.variants).toEqual(rowsBefore.variants);
    expect(rowsAfter.groups).toEqual(rowsBefore.groups);
    expect(rowsAfter.options).toEqual(rowsBefore.options);
    expect(rowsAfter.links).toEqual(rowsBefore.links);
  });

  test("a combo cannot switch variants on, but may use add-ons and the note", async () => {
    const { t, w } = await setup();
    const comboId = await insertCombo(t, w.a.menuServiceId, "Kombo doručak");
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
        articleId: comboId,
        variantsEnabled: true,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.notCombo);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    expect(
      await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
        articleId: comboId,
        addonsEnabled: true,
        noteEnabled: true,
      }),
    ).toEqual({ ok: true });
    const view = await optionsView(t, w.ownerId, comboId);
    expect(view).toMatchObject({ kind: "combo", variantsEnabled: false, addonsEnabled: true });
  });
});

describe("variants", () => {
  test("addVariant appends with a stable key, own prices, switches variants on; one revision per add", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const start = await revisionOf(t, w.a.menuServiceId);

    const first = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "  Mala   šolja ",
      priceRsd: 150,
    });
    expect(first.key).toMatch(/^va_[0-9a-z]{12}$/);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);
    // Adding expressed intent: the switch is on, the rest of the article is untouched.
    const article = await t.run(async (ctx) => ctx.db.get(f.kafaId));
    expect(article).toMatchObject({
      name: "Kafa",
      basePriceRsd: 150,
      variantsEnabled: true,
      updatedByUserId: w.ownerId,
    });
    expect(article?.addonsEnabled).toBeUndefined();
    expect(article?.noteEnabled).toBeUndefined();

    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Velika",
      priceRsd: 200,
    });
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Porodična",
    });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 3);

    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.variantsEnabled).toBe(true);
    expect(view.variants.map((v) => [v.name, v.priceRsd, v.order])).toEqual([
      ["Mala šolja", 150, 1024],
      ["Velika", 200, 2048],
      ["Porodična", null, 3072],
    ]);
    expect(view.variants[0]).toMatchObject({ variantId: first.variantId, key: first.key });
    // A variant has its own price; the article keeps its base price.
    expect(article?.basePriceRsd).toBe(150);
  });

  test("a bad name or price is refused and nothing is written (60 characters and 0 / 1_000_000 are fine)", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);
    for (const name of ["", "   ", "x".repeat(61)]) {
      await expect(
        owner.mutation(api.menuArticleOptions.addVariant, { articleId: f.kafaId, name }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    for (const priceRsd of [1.5, -1, 1_000_001]) {
      await expect(
        owner.mutation(api.menuArticleOptions.addVariant, {
          articleId: f.kafaId,
          name: "Mala",
          priceRsd,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "x".repeat(60),
      priceRsd: 0,
    });
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Skupa",
      priceRsd: 1_000_000,
    });
    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.variants.map((v) => v.priceRsd)).toEqual([0, 1_000_000]);
  });

  test("updateVariant is compare-and-set: a stale write returns the current values and writes nothing", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const mala = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    const start = await revisionOf(t, w.a.menuServiceId);

    expect(
      await owner.mutation(api.menuArticleOptions.updateVariant, {
        variantId: mala.variantId,
        expected: { name: "Mala" },
        patch: { name: "Mala šolja" },
      }),
    ).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);
    const afterRename = await snapshot(t, w.a.menuServiceId);

    // The manager still saw the old name.
    const stale = await as(t, w.managerId).mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { name: "Mala" },
      patch: { name: "Druga" },
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["name"],
      current: { name: "Mala šolja" },
      attempted: { name: "Druga" },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(afterRename);

    // One field right, one stale: nothing is applied, the current values of the expected keys come back.
    const partial = await owner.mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { name: "Mala", priceRsd: 150 },
      patch: { name: "Nova", priceRsd: 180 },
    });
    expect(partial).toEqual({
      ok: false,
      conflicts: ["name"],
      current: { name: "Mala šolja", priceRsd: 150 },
      // K05: only the conflicting field's attempted value is echoed.
      attempted: { name: "Nova" },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(afterRename);

    const price = await owner.mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { priceRsd: 150 },
      patch: { priceRsd: 160 },
    });
    expect(price).toEqual({ ok: true });
    expect(
      await owner.mutation(api.menuArticleOptions.updateVariant, {
        variantId: mala.variantId,
        expected: { priceRsd: 150 },
        patch: { priceRsd: 170 },
      }),
    ).toEqual({ ok: false, conflicts: ["priceRsd"], current: { priceRsd: 160 }, attempted: { priceRsd: 170 } });
    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.variants[0]).toMatchObject({ name: "Mala šolja", priceRsd: 160 });
  });

  test("updateVariant: null in patch clears the price, null in expected means 'no price'", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const velika = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Velika",
      priceRsd: 200,
    });

    expect(
      await owner.mutation(api.menuArticleOptions.updateVariant, {
        variantId: velika.variantId,
        expected: { priceRsd: 200 },
        patch: { priceRsd: null },
      }),
    ).toEqual({ ok: true });
    expect((await optionsView(t, w.ownerId, f.kafaId)).variants[0].priceRsd).toBeNull();
    const row = await t.run(async (ctx) => ctx.db.get(velika.variantId));
    expect(row?.priceRsd).toBeUndefined();

    // Expecting the old price now conflicts; expecting "none" (null) works.
    expect(
      await owner.mutation(api.menuArticleOptions.updateVariant, {
        variantId: velika.variantId,
        expected: { priceRsd: 200 },
        patch: { priceRsd: 210 },
      }),
    ).toEqual({ ok: false, conflicts: ["priceRsd"], current: { priceRsd: null }, attempted: { priceRsd: 210 } });
    expect(
      await owner.mutation(api.menuArticleOptions.updateVariant, {
        variantId: velika.variantId,
        expected: { priceRsd: null },
        patch: { priceRsd: 210 },
      }),
    ).toEqual({ ok: true });
    expect((await optionsView(t, w.ownerId, f.kafaId)).variants[0].priceRsd).toBe(210);
  });

  test("updateVariant refuses malformed input before writing; an unchanged value is a no-op", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const mala = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    const before = await snapshot(t, w.a.menuServiceId);

    type Fields = { name?: string; priceRsd?: number | null };
    const bad: { expected: Fields; patch: Fields }[] = [
      { expected: {}, patch: {} },
      { expected: { name: "Mala" }, patch: {} },
      { expected: {}, patch: { name: "Nova" } },
      { expected: { name: "Mala" }, patch: { name: "   " } },
      { expected: { name: "Mala" }, patch: { name: "x".repeat(61) } },
      { expected: { priceRsd: 150 }, patch: { priceRsd: 1.5 } },
      { expected: { priceRsd: 150 }, patch: { priceRsd: -1 } },
      { expected: { priceRsd: 150 }, patch: { priceRsd: 1_000_001 } },
    ];
    for (const { expected, patch } of bad) {
      await expect(
        owner.mutation(api.menuArticleOptions.updateVariant, {
          variantId: mala.variantId,
          expected,
          patch,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    expect(
      await owner.mutation(api.menuArticleOptions.updateVariant, {
        variantId: mala.variantId,
        expected: { name: "Mala", priceRsd: 150 },
        patch: { name: "  Mala ", priceRsd: 150 },
      }),
    ).toEqual({ ok: true });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("moveVariant reorders, clamps past the end, and a no-op move does not touch the draft", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const a = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "A",
      priceRsd: 100,
    });
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "B",
      priceRsd: 110,
    });
    const c = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "C",
      priceRsd: 120,
    });
    const listed = async () => (await optionsView(t, w.ownerId, f.kafaId)).variants;

    const start = await revisionOf(t, w.a.menuServiceId);
    expect(
      await owner.mutation(api.menuArticleOptions.moveVariant, {
        variantId: c.variantId,
        toIndex: 0,
      }),
    ).toEqual({ ok: true });
    expect((await listed()).map((v) => [v.name, v.order])).toEqual([
      ["C", 1024],
      ["A", 2048],
      ["B", 3072],
    ]);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const before = await snapshot(t, w.a.menuServiceId);
    await owner.mutation(api.menuArticleOptions.moveVariant, { variantId: c.variantId, toIndex: 0 });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await owner.mutation(api.menuArticleOptions.moveVariant, { variantId: c.variantId, toIndex: 99 });
    expect((await listed()).map((v) => v.name)).toEqual(["A", "B", "C"]);
    for (const toIndex of [-1, 1.5]) {
      await expect(
        owner.mutation(api.menuArticleOptions.moveVariant, { variantId: a.variantId, toIndex }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
  });

  test("removeVariant deletes the row, keeps the switch and bumps the revision once", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const mala = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Velika",
      priceRsd: 200,
    });
    const start = await revisionOf(t, w.a.menuServiceId);

    expect(
      await owner.mutation(api.menuArticleOptions.removeVariant, { variantId: mala.variantId }),
    ).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);
    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.variants.map((v) => v.name)).toEqual(["Velika"]);
    expect(view.variantsEnabled).toBe(true);

    await owner.mutation(api.menuArticleOptions.removeVariant, {
      variantId: view.variants[0].variantId,
    });
    // Even the last variant leaves the switch as the client set it.
    expect((await optionsView(t, w.ownerId, f.kafaId)).variantsEnabled).toBe(true);
    await expect(
      owner.mutation(api.menuArticleOptions.removeVariant, { variantId: mala.variantId }),
    ).rejects.toThrow(MENU_ERROR.notFound);
  });

  test("an article holds at most MENU_MAX_VARIANTS_PER_ARTICLE variants", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_VARIANTS_PER_ARTICLE - 1; index += 1) {
        await ctx.db.insert("menuVariants", {
          menuServiceId: w.a.menuServiceId,
          articleId: f.kafaId,
          key: newMenuKey("variant"),
          name: `Varijanta ${index}`,
          priceRsd: 100 + index,
          order: (index + 1) * 1024,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    // The 20th still fits...
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Poslednja",
      priceRsd: 300,
    });
    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.variants).toHaveLength(MENU_MAX_VARIANTS_PER_ARTICLE);
    expect(view.variants[MENU_MAX_VARIANTS_PER_ARTICLE - 1].name).toBe("Poslednja");

    // ...the 21st does not, and another article is not affected.
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuArticleOptions.addVariant, { articleId: f.kafaId, name: "Jedna previše" }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kapucinoId,
      name: "Mali",
    });
  });

  test("variants are refused on a combo article", async () => {
    const { t, w } = await setup();
    const comboId = await insertCombo(t, w.a.menuServiceId, "Kombo doručak");
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuArticleOptions.addVariant, {
        articleId: comboId,
        name: "Mali",
        priceRsd: 400,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.notCombo);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

describe("variant price changes reach combos and Room service", () => {
  async function comboOf(t: T, comboId: Id<"menuArticles">) {
    const combo = await t.run(async (ctx) => ctx.db.get(comboId));
    if (!combo) throw new Error("combo missing");
    return combo;
  }

  test("a variant price change flags the combos that contain the article; the combo price stays", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const containing = await insertCombo(t, w.a.menuServiceId, "Kombo doručak");
    await addComponent(t, w.a.menuServiceId, containing, f.kafaId);
    const unrelated = await insertCombo(t, w.a.menuServiceId, "Kombo večera");
    await addComponent(t, w.a.menuServiceId, unrelated, f.lateId);

    const mala = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    // A new variant is a new option, not a price change.
    expect((await comboOf(t, containing)).priceCheck).toBeUndefined();
    // A rename and an unchanged price are not price changes either.
    await owner.mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { name: "Mala", priceRsd: 150 },
      patch: { name: "Mala šolja", priceRsd: 150 },
    });
    expect((await comboOf(t, containing)).priceCheck).toBeUndefined();

    const changed = await owner.mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { priceRsd: 150 },
      patch: { priceRsd: 170 },
    });
    expect(changed).toEqual({ ok: true });

    const flagged = await comboOf(t, containing);
    expect(flagged.basePriceRsd).toBe(500);
    expect(flagged.priceCheck).toEqual({
      since: expect.any(Number),
      changedComponentKeys: [f.kafaKey],
      removedComponentNames: [],
    });
    const other = await comboOf(t, unrelated);
    expect(other.priceCheck).toBeUndefined();
    expect(other.basePriceRsd).toBe(500);
  });

  test("removing a variant flags the combos again; their price is still untouched", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const combo = await insertCombo(t, w.a.menuServiceId, "Kombo doručak");
    await addComponent(t, w.a.menuServiceId, combo, f.kafaId);
    const mala = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    expect((await comboOf(t, combo)).priceCheck).toBeUndefined();

    await owner.mutation(api.menuArticleOptions.removeVariant, { variantId: mala.variantId });
    const flagged = await comboOf(t, combo);
    expect(flagged.priceCheck).toMatchObject({ changedComponentKeys: [f.kafaKey] });
    expect(flagged.basePriceRsd).toBe(500);
  });

  test("a manual Room service price of a variant keeps its value, warns about the old/new variant price, and is dropped with the variant", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const mala = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Mala",
      priceRsd: 150,
    });
    const velika = await owner.mutation(api.menuArticleOptions.addVariant, {
      articleId: f.kafaId,
      name: "Velika",
      priceRsd: 200,
    });
    const itemId = await t.run(async (ctx) => {
      const now = Date.now();
      const categoryId = await ctx.db.insert("menuRoomServiceCategories", {
        menuServiceId: w.a.menuServiceId,
        key: newMenuKey("roomServiceCategory"),
        name: "Pića",
        order: 1024,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("menuRoomServiceItems", {
        menuServiceId: w.a.menuServiceId,
        categoryId,
        articleId: f.kafaId,
        order: 1024,
        markupApplies: false,
        manualVariantPrices: [
          { variantKey: mala.key, priceRsd: 190 },
          { variantKey: velika.key, priceRsd: 260 },
        ],
        createdAt: now,
        updatedAt: now,
      });
    });
    const prices = async () =>
      (await t.run(async (ctx) => ctx.db.get(itemId)))?.manualVariantPrices;

    await owner.mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { priceRsd: 150 },
      patch: { priceRsd: 170 },
    });
    expect(await prices()).toEqual([
      {
        variantKey: mala.key,
        priceRsd: 190,
        priceWarning: { oldBaseRsd: 150, newBaseRsd: 170, at: expect.any(Number) },
      },
      { variantKey: velika.key, priceRsd: 260 },
    ]);

    // Back to the price the manual price was confirmed against: the warning goes.
    await owner.mutation(api.menuArticleOptions.updateVariant, {
      variantId: mala.variantId,
      expected: { priceRsd: 170 },
      patch: { priceRsd: 150 },
    });
    expect(await prices()).toEqual([
      { variantKey: mala.key, priceRsd: 190 },
      { variantKey: velika.key, priceRsd: 260 },
    ]);

    await owner.mutation(api.menuArticleOptions.removeVariant, { variantId: mala.variantId });
    expect(await prices()).toEqual([{ variantKey: velika.key, priceRsd: 260 }]);
    await owner.mutation(api.menuArticleOptions.removeVariant, { variantId: velika.variantId });
    expect(await prices()).toBeUndefined();
  });
});

describe("add-on groups: create, rules, attach and detach", () => {
  test("createAddonGroup stores the group, its options and the link, and switches add-ons on", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const start = await revisionOf(t, w.a.menuServiceId);

    const milk = await milkOnKafa(t, w.ownerId, f);
    expect(milk.key).toMatch(/^ag_[0-9a-z]{12}$/);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toMatchObject({
      _id: milk.groupId,
      menuServiceId: w.a.menuServiceId,
      key: milk.key,
      name: "Mleko",
      selection: "single",
      required: false,
      linkCount: 1,
      updatedByUserId: w.ownerId,
    });
    expect(state.groups[0].minSelect).toBeUndefined();
    expect(state.groups[0].maxSelect).toBeUndefined();
    expect(state.options.map((o) => [o.name, o.priceDeltaRsd, o.order])).toEqual([
      ["Sojino", 30, 1024],
      ["Bademovo", 40, 2048],
      ["Bez laktoze", 0, 3072],
    ]);
    for (const option of state.options) {
      expect(option.key).toMatch(/^ao_[0-9a-z]{12}$/);
      expect(option.groupId).toBe(milk.groupId);
    }
    expect(state.links).toHaveLength(1);
    expect(state.links[0]).toMatchObject({ articleId: f.kafaId, groupId: milk.groupId, order: 1024 });

    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.addonsEnabled).toBe(true);
    expect(view.variantsEnabled).toBe(false);
    expect(view.addonGroups).toEqual([
      {
        groupId: milk.groupId,
        key: milk.key,
        name: "Mleko",
        selection: "single",
        required: false,
        minSelect: null,
        maxSelect: null,
        linkCount: 1,
        bounds: { min: 0, max: 1 },
        satisfiable: true,
        options: [
          { optionId: expect.any(String), key: expect.any(String), name: "Sojino", priceDeltaRsd: 30, order: 1024 },
          { optionId: expect.any(String), key: expect.any(String), name: "Bademovo", priceDeltaRsd: 40, order: 2048 },
          { optionId: expect.any(String), key: expect.any(String), name: "Bez laktoze", priceDeltaRsd: 0, order: 3072 },
        ],
      },
    ]);
  });

  test("a group may be created without options and with a cleaned name", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const created = await as(t, w.ownerId).mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "  Vrsta   mleka ",
      selection: "single",
      required: true,
    });
    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.addonGroups[0]).toMatchObject({
      groupId: created.groupId,
      name: "Vrsta mleka",
      options: [],
      bounds: { min: 1, max: 0 },
      satisfiable: false,
    });
  });

  test("advanced rules are stored normalized: min / max kept, a default-only minimum dropped, an unsatisfiable group reported", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const four = [1, 2, 3, 4].map((n) => ({ name: `Dodatak ${n}`, priceDeltaRsd: n * 10 }));

    await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "Sosevi",
      selection: "multiple",
      required: true,
      minSelect: 2,
      maxSelect: 3,
      options: four,
    });
    await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "Preliv",
      selection: "multiple",
      required: true,
      minSelect: 1,
      options: four,
    });
    await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "Posipanje",
      selection: "multiple",
      required: true,
      minSelect: 3,
      options: four.slice(0, 2),
    });

    const view = await optionsView(t, w.ownerId, f.kafaId);
    expect(view.addonGroups.map((g) => g.name)).toEqual(["Sosevi", "Preliv", "Posipanje"]);
    expect(view.addonGroups[0]).toMatchObject({
      minSelect: 2,
      maxSelect: 3,
      bounds: { min: 2, max: 3 },
      satisfiable: true,
    });
    // minSelect 1 on a required group is the default and is not stored.
    expect(view.addonGroups[1]).toMatchObject({
      minSelect: null,
      maxSelect: null,
      bounds: { min: 1, max: 4 },
      satisfiable: true,
    });
    // Three required of two options: stored (a draft may be incomplete), reported as unsatisfiable.
    expect(view.addonGroups[2]).toMatchObject({
      minSelect: 3,
      bounds: { min: 3, max: 2 },
      satisfiable: false,
    });
    const rows = (await snapshot(t, w.a.menuServiceId)).groups;
    expect(rows.find((g) => g.name === "Preliv")?.minSelect).toBeUndefined();
  });

  test("contradicting rules are refused with article/addon_rules_invalid and nothing is written", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);

    type Rules = {
      selection: "single" | "multiple";
      required: boolean;
      minSelect?: number;
      maxSelect?: number;
    };
    const contradictions: Rules[] = [
      { selection: "single", required: true, minSelect: 1 },
      { selection: "single", required: false, maxSelect: 2 },
      { selection: "multiple", required: false, minSelect: 2 },
      { selection: "multiple", required: true, minSelect: 3, maxSelect: 2 },
      { selection: "multiple", required: true, minSelect: 0 },
      { selection: "multiple", required: false, maxSelect: 1.5 },
      { selection: "multiple", required: true, minSelect: MENU_MAX_ADDON_OPTIONS_PER_GROUP + 1 },
    ];
    for (const rules of contradictions) {
      await expect(
        owner.mutation(api.menuArticleOptions.createAddonGroup, {
          articleId: f.kafaId,
          name: "Mleko",
          ...rules,
        }),
      ).rejects.toThrow(ARTICLE_ERROR.addonRulesInvalid);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a bad group name, option name or surcharge is refused; 30 options fit, 31 do not", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);

    type Override = { name?: string; options?: { name: string; priceDeltaRsd: number }[] };
    const bad: Override[] = [
      { name: "" },
      { name: "   " },
      { name: "x".repeat(81) },
      { options: [{ name: "", priceDeltaRsd: 10 }] },
      { options: [{ name: "x".repeat(61), priceDeltaRsd: 10 }] },
      { options: [{ name: "Sok", priceDeltaRsd: 1.5 }] },
      { options: [{ name: "Sok", priceDeltaRsd: -1 }] },
      { options: [{ name: "Sok", priceDeltaRsd: 1_000_001 }] },
    ];
    for (const override of bad) {
      await expect(
        owner.mutation(api.menuArticleOptions.createAddonGroup, {
          articleId: f.kafaId,
          name: "Mleko",
          selection: "single",
          required: false,
          ...override,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    const options = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ name: `Dodatak ${index}`, priceDeltaRsd: 10 }));
    await expect(
      owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name: "Previše",
        selection: "multiple",
        required: false,
        options: options(MENU_MAX_ADDON_OPTIONS_PER_GROUP + 1),
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "Taman",
      selection: "multiple",
      required: false,
      options: options(MENU_MAX_ADDON_OPTIONS_PER_GROUP),
    });
    expect((await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0].options).toHaveLength(
      MENU_MAX_ADDON_OPTIONS_PER_GROUP,
    );
  });

  test("an article links at most MENU_MAX_ADDON_GROUPS_PER_ARTICLE groups (create and attach)", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    for (let index = 0; index < MENU_MAX_ADDON_GROUPS_PER_ARTICLE; index += 1) {
      await owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name: `Grupa ${index}`,
        selection: "single",
        required: false,
      });
    }
    const elsewhere = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kapucinoId,
      name: "Mleko",
      selection: "single",
      required: false,
    });
    const before = await snapshot(t, w.a.menuServiceId);

    await expect(
      owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name: "Jedna previše",
        selection: "single",
        required: false,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(
      owner.mutation(api.menuArticleOptions.attachAddonGroup, {
        articleId: f.kafaId,
        groupId: elsewhere.groupId,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a service holds at most MENU_MAX_ADDON_GROUPS groups; creating and copying are refused at the ceiling", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const milk = await sharedMilk(t, w.ownerId, f);
    await fillGroups(t, w.a.menuServiceId, MENU_MAX_ADDON_GROUPS - 1);
    const before = await snapshot(t, w.a.menuServiceId);

    await expect(
      owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name: "Jedna previše",
        selection: "single",
        required: false,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    // A copy is a new group too.
    await expect(
      owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
        articleId: f.kafaId,
        groupId: milk.groupId,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(
      owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko" },
        patch: { name: "Mleko za Kafu" },
        onlyForArticleId: f.kafaId,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // Editing the shared group in place needs no new group.
    expect(
      ok(
        await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
          groupId: milk.groupId,
          expected: { name: "Mleko" },
          patch: { name: "Mleko za sve" },
        }),
      ),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false });
  });

  test("attachAddonGroup links an existing group once, counts the link and switches add-ons on", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kapucinoId,
      name: "Šećer",
      selection: "single",
      required: false,
    });
    const start = await revisionOf(t, w.a.menuServiceId);

    expect(
      await owner.mutation(api.menuArticleOptions.attachAddonGroup, {
        articleId: f.kapucinoId,
        groupId: milk.groupId,
      }),
    ).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);
    // Appended after the group Kapućino already has.
    expect(namesOf(await optionsView(t, w.ownerId, f.kapucinoId))).toEqual(["Šećer", "Mleko"]);
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups.find((g) => g._id === milk.groupId)?.linkCount).toBe(2);
    expect(state.links).toHaveLength(3);

    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuArticleOptions.attachAddonGroup, {
        articleId: f.kapucinoId,
        groupId: milk.groupId,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonGroupAttached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // Attaching to an article with the switch off turns it on.
    const lateBefore = await optionsView(t, w.ownerId, f.lateId);
    expect(lateBefore.addonsEnabled).toBe(false);
    await owner.mutation(api.menuArticleOptions.attachAddonGroup, {
      articleId: f.lateId,
      groupId: milk.groupId,
    });
    expect((await optionsView(t, w.ownerId, f.lateId)).addonsEnabled).toBe(true);
  });

  test("detachAddonGroup unlinks but KEEPS the group, even at 0 links; it can be attached again", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const milk = await sharedMilk(t, w.ownerId, f);
    const listed = async () =>
      await owner.query(api.menuArticleOptions.listAddonGroups, {
        menuServiceId: w.a.menuServiceId,
      });

    const start = await revisionOf(t, w.a.menuServiceId);
    expect(
      await owner.mutation(api.menuArticleOptions.detachAddonGroup, {
        articleId: f.lateId,
        groupId: milk.groupId,
      }),
    ).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);
    expect((await optionsView(t, w.ownerId, f.lateId)).addonGroups).toEqual([]);
    // The article's switch is the client's decision, not a side effect of detaching.
    expect((await optionsView(t, w.ownerId, f.lateId)).addonsEnabled).toBe(true);
    expect((await listed())?.[0]).toMatchObject({ groupId: milk.groupId, linkCount: 2 });

    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuArticleOptions.detachAddonGroup, {
        articleId: f.lateId,
        groupId: milk.groupId,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonGroupNotAttached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    for (const articleId of [f.kafaId, f.kapucinoId]) {
      await owner.mutation(api.menuArticleOptions.detachAddonGroup, {
        articleId,
        groupId: milk.groupId,
      });
    }
    // Nothing links it any more, yet the group and its options are still there.
    expect(await listed()).toEqual([
      {
        groupId: milk.groupId,
        key: milk.key,
        name: "Mleko",
        selection: "single",
        required: false,
        linkCount: 0,
      },
    ]);
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups).toHaveLength(1);
    expect(state.options).toHaveLength(3);
    expect(state.links).toHaveLength(0);
    expect(
      await owner.query(api.menuArticleOptions.addonGroupUsage, { groupId: milk.groupId }),
    ).toEqual({ groupId: milk.groupId, linkCount: 0, articles: [], truncated: false });

    // "Use an existing group" brings it back.
    await owner.mutation(api.menuArticleOptions.attachAddonGroup, {
      articleId: f.lateId,
      groupId: milk.groupId,
    });
    expect((await optionsView(t, w.ownerId, f.lateId)).addonGroups[0]).toMatchObject({
      groupId: milk.groupId,
      linkCount: 1,
    });
  });

  test("moveArticleAddonGroup reorders the groups of one article; a no-op move does not touch the draft", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const ids: Id<"menuAddonGroups">[] = [];
    for (const name of ["A", "B", "C"]) {
      const created = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name,
        selection: "single",
        required: false,
      });
      ids.push(created.groupId);
    }
    const kapucinoGroup = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kapucinoId,
      name: "Drugi",
      selection: "single",
      required: false,
    });

    const start = await revisionOf(t, w.a.menuServiceId);
    expect(
      await owner.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
        articleId: f.kafaId,
        groupId: ids[2],
        toIndex: 0,
      }),
    ).toEqual({ ok: true });
    expect(namesOf(await optionsView(t, w.ownerId, f.kafaId))).toEqual(["C", "A", "B"]);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const before = await snapshot(t, w.a.menuServiceId);
    await owner.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
      articleId: f.kafaId,
      groupId: ids[2],
      toIndex: 0,
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await expect(
      owner.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
        articleId: f.kafaId,
        groupId: kapucinoGroup.groupId,
        toIndex: 0,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonGroupNotAttached);
    for (const toIndex of [-1, 1.5]) {
      await expect(
        owner.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
          articleId: f.kafaId,
          groupId: ids[0],
          toIndex,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("listAddonGroups lists the service's groups by name (diacritics folded) for the existing-group picker", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    for (const name of ["Sirup", "Šećer", "Mleko"]) {
      await owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name,
        selection: "single",
        required: name === "Mleko",
      });
    }
    const groups = await owner.query(api.menuArticleOptions.listAddonGroups, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(groups?.map((g) => g.name)).toEqual(["Mleko", "Šećer", "Sirup"]);
    expect(groups?.[0]).toEqual({
      groupId: expect.any(String),
      key: expect.stringMatching(/^ag_/),
      name: "Mleko",
      selection: "single",
      required: true,
      linkCount: 1,
    });
  });
});

describe("a linked group: change it for ALL linked articles", () => {
  test("addonGroupUsage lists exactly the articles a shared group affects", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await sharedMilk(t, w.ownerId, f);

    expect(
      await as(t, w.ownerId).query(api.menuArticleOptions.addonGroupUsage, {
        groupId: milk.groupId,
      }),
    ).toEqual({
      groupId: milk.groupId,
      linkCount: 3,
      articles: [
        { articleId: f.kafaId, key: f.kafaKey, name: "Kafa" },
        { articleId: f.kapucinoId, key: f.kapucinoKey, name: "Kapućino" },
        { articleId: f.lateId, key: f.lateKey, name: "Late" },
      ],
      truncated: false,
    });
  });

  test("addonGroupUsage shows at most MENU_MAX_ARTICLE_BATCH articles and says when it cut the list", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_ARTICLE_BATCH; index += 1) {
        const articleId = await ctx.db.insert("menuArticles", {
          menuServiceId: w.a.menuServiceId,
          key: newMenuKey("article"),
          kind: "item",
          name: `Artikal ${index}`,
          nameNormalized: `artikal ${index}`,
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("menuArticleAddonGroups", {
          menuServiceId: w.a.menuServiceId,
          articleId,
          groupId: milk.groupId,
          order: 1024,
          createdAt: now,
        });
      }
      await ctx.db.patch(milk.groupId, { linkCount: MENU_MAX_ARTICLE_BATCH + 1 });
    });
    const usage = await as(t, w.ownerId).query(api.menuArticleOptions.addonGroupUsage, {
      groupId: milk.groupId,
    });
    expect(usage?.articles).toHaveLength(MENU_MAX_ARTICLE_BATCH);
    expect(usage?.linkCount).toBe(MENU_MAX_ARTICLE_BATCH + 1);
    expect(usage?.truncated).toBe(true);
  });

  test("updateAddonGroup without onlyForArticleId changes the one shared group for every article", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await sharedMilk(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    const start = await revisionOf(t, w.a.menuServiceId);

    const result = ok(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko", required: false },
        patch: { name: "Vrsta mleka", required: true },
      }),
    );
    expect(result).toEqual({ ok: true, groupId: milk.groupId, copied: false });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    for (const articleId of [f.kafaId, f.kapucinoId, f.lateId]) {
      const view = await optionsView(t, w.ownerId, articleId);
      expect(view.addonGroups).toHaveLength(1);
      expect(view.addonGroups[0]).toMatchObject({
        groupId: milk.groupId,
        name: "Vrsta mleka",
        required: true,
        linkCount: 3,
        bounds: { min: 1, max: 1 },
      });
    }
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].updatedByUserId).toBe(w.ownerId);
  });

  test("adding, changing, moving and removing an option without onlyForArticleId reaches all three articles", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await sharedMilk(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    const everyone = async () =>
      await Promise.all(
        [f.kafaId, f.kapucinoId, f.lateId].map(
          async (articleId) => (await optionsView(t, w.ownerId, articleId)).addonGroups[0],
        ),
      );

    const added = ok(
      await owner.mutation(api.menuArticleOptions.addAddonOption, {
        groupId: milk.groupId,
        name: "  Ovseno ",
        priceDeltaRsd: 50,
      }),
    );
    expect(added).toMatchObject({ ok: true, groupId: milk.groupId, copied: false });
    expect(added.key).toMatch(/^ao_[0-9a-z]{12}$/);
    for (const group of await everyone()) {
      expect(group.groupId).toBe(milk.groupId);
      expect(group.options.map((o) => [o.name, o.priceDeltaRsd, o.order])).toEqual([
        ["Sojino", 30, 1024],
        ["Bademovo", 40, 2048],
        ["Bez laktoze", 0, 3072],
        ["Ovseno", 50, 4096],
      ]);
    }

    const sojino = (await everyone())[0].options[0];
    const changed = ok(
      await owner.mutation(api.menuArticleOptions.updateAddonOption, {
        optionId: sojino.optionId,
        expected: { name: "Sojino", priceDeltaRsd: 30 },
        patch: { priceDeltaRsd: 35 },
      }),
    );
    expect(changed).toEqual({
      ok: true,
      groupId: milk.groupId,
      copied: false,
      optionId: sojino.optionId,
    });
    for (const group of await everyone()) expect(group.options[0].priceDeltaRsd).toBe(35);

    await owner.mutation(api.menuArticleOptions.moveAddonOption, {
      optionId: added.optionId,
      toIndex: 0,
    });
    for (const group of await everyone()) {
      expect(group.options.map((o) => o.name)).toEqual([
        "Ovseno",
        "Sojino",
        "Bademovo",
        "Bez laktoze",
      ]);
    }

    expect(
      await owner.mutation(api.menuArticleOptions.removeAddonOption, {
        optionId: sojino.optionId,
      }),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false });
    for (const group of await everyone()) {
      expect(group.options.map((o) => o.name)).toEqual(["Ovseno", "Bademovo", "Bez laktoze"]);
    }
    expect((await snapshot(t, w.a.menuServiceId)).groups).toHaveLength(1);
  });

  test("group rules change by compare-and-set and always stay valid", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const owner = as(t, w.ownerId);

    // Optional single → required, several choices, at least 2, at most 3.
    ok(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { selection: "single", required: false, minSelect: null, maxSelect: null },
        patch: { selection: "multiple", required: true, minSelect: 2, maxSelect: 3 },
      }),
    );
    expect((await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0]).toMatchObject({
      selection: "multiple",
      required: true,
      minSelect: 2,
      maxSelect: 3,
      bounds: { min: 2, max: 3 },
    });

    // Back to a single choice without clearing min / max contradicts itself.
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { selection: "multiple" },
        patch: { selection: "single" },
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonRulesInvalid);
    // A maximum below the minimum, and a minimum on an optional group, are refused too.
    await expect(
      owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { maxSelect: 3 },
        patch: { maxSelect: 1 },
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonRulesInvalid);
    await expect(
      owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { required: true },
        patch: { required: false },
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonRulesInvalid);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // Clearing min / max together with the selection works (null clears).
    ok(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { selection: "multiple", minSelect: 2, maxSelect: 3 },
        patch: { selection: "single", minSelect: null, maxSelect: null },
      }),
    );
    const row = (await snapshot(t, w.a.menuServiceId)).groups[0];
    expect(row).toMatchObject({ selection: "single", required: true });
    expect(row.minSelect).toBeUndefined();
    expect(row.maxSelect).toBeUndefined();
  });

  test("updateAddonGroup conflicts return the current values and write nothing; unchanged values are a no-op", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await sharedMilk(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    ok(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko" },
        patch: { name: "Mleko 2" },
      }),
    );
    const before = await snapshot(t, w.a.menuServiceId);

    expect(
      await as(t, w.managerId).mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko", required: false },
        patch: { name: "Mleko 3", required: true },
      }),
    ).toEqual({
      ok: false,
      conflicts: ["name"],
      current: { name: "Mleko 2", required: false },
      // K05: only the conflicting field is echoed.
      attempted: { name: "Mleko 3" },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // The same values again change nothing.
    expect(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko 2" },
        patch: { name: "  Mleko 2 " },
      }),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    type Fields = { name?: string };
    const bad: { expected: Fields; patch: Fields }[] = [
      { expected: {}, patch: {} },
      { expected: { name: "Mleko 2" }, patch: {} },
      { expected: {}, patch: { name: "Novo" } },
      { expected: { name: "Mleko 2" }, patch: { name: "   " } },
      { expected: { name: "Mleko 2" }, patch: { name: "x".repeat(81) } },
    ];
    for (const { expected, patch } of bad) {
      await expect(
        owner.mutation(api.menuArticleOptions.updateAddonGroup, {
          groupId: milk.groupId,
          expected,
          patch,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("updateAddonOption: a stale value conflicts and writes nothing; bad values are refused", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    const sojino = (await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0].options[0];
    ok(
      await owner.mutation(api.menuArticleOptions.updateAddonOption, {
        optionId: sojino.optionId,
        expected: { priceDeltaRsd: 30 },
        patch: { priceDeltaRsd: 35 },
      }),
    );
    const before = await snapshot(t, w.a.menuServiceId);

    expect(
      await as(t, w.managerId).mutation(api.menuArticleOptions.updateAddonOption, {
        optionId: sojino.optionId,
        expected: { name: "Sojino", priceDeltaRsd: 30 },
        patch: { name: "Soja", priceDeltaRsd: 45 },
      }),
    ).toEqual({
      ok: false,
      conflicts: ["priceDeltaRsd"],
      current: { name: "Sojino", priceDeltaRsd: 35 },
      attempted: { priceDeltaRsd: 45 },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    type Fields = { name?: string; priceDeltaRsd?: number };
    const bad: { expected: Fields; patch: Fields }[] = [
      { expected: {}, patch: {} },
      { expected: {}, patch: { name: "Soja" } },
      { expected: { name: "Sojino" }, patch: { name: "   " } },
      { expected: { name: "Sojino" }, patch: { name: "x".repeat(61) } },
      { expected: { priceDeltaRsd: 35 }, patch: { priceDeltaRsd: 1.5 } },
      { expected: { priceDeltaRsd: 35 }, patch: { priceDeltaRsd: -5 } },
      { expected: { priceDeltaRsd: 35 }, patch: { priceDeltaRsd: 1_000_001 } },
    ];
    for (const { expected, patch } of bad) {
      await expect(
        owner.mutation(api.menuArticleOptions.updateAddonOption, {
          optionId: sojino.optionId,
          expected,
          patch,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(
      await owner.mutation(api.menuArticleOptions.updateAddonOption, {
        optionId: sojino.optionId,
        expected: { name: "Sojino", priceDeltaRsd: 35 },
        patch: { name: "Sojino", priceDeltaRsd: 35 },
      }),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false, optionId: sojino.optionId });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("addAddonOption refuses a bad option and a full group; a free add-on (0) is valid", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);
    for (const [name, priceDeltaRsd] of [
      ["", 10],
      ["   ", 10],
      ["x".repeat(61), 10],
      ["Ovseno", 1.5],
      ["Ovseno", -1],
      ["Ovseno", 1_000_001],
    ] as const) {
      await expect(
        owner.mutation(api.menuArticleOptions.addAddonOption, {
          groupId: milk.groupId,
          name,
          priceDeltaRsd,
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    for (let index = 3; index < MENU_MAX_ADDON_OPTIONS_PER_GROUP; index += 1) {
      await owner.mutation(api.menuArticleOptions.addAddonOption, {
        groupId: milk.groupId,
        name: `Dodatak ${index}`,
        priceDeltaRsd: index === 3 ? 0 : 10,
      });
    }
    const full = await snapshot(t, w.a.menuServiceId);
    expect(full.options).toHaveLength(MENU_MAX_ADDON_OPTIONS_PER_GROUP);
    await expect(
      owner.mutation(api.menuArticleOptions.addAddonOption, {
        groupId: milk.groupId,
        name: "Jedan previše",
        priceDeltaRsd: 10,
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(full);
  });
});

describe("a linked group: an independent copy for ONE article", () => {
  /** The shared "Mleko" plus a second group on Kafa, and every article's view before any change. */
  async function sharedWithViews() {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await sharedMilk(t, w.ownerId, f);
    await as(t, w.ownerId).mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "Slatkiš",
      selection: "single",
      required: false,
    });
    const views = {
      kafa: await optionsView(t, w.ownerId, f.kafaId),
      kapucino: await optionsView(t, w.ownerId, f.kapucinoId),
      late: await optionsView(t, w.ownerId, f.lateId),
    };
    return { t, w, f, milk, views };
  }

  test("updateAddonGroup with onlyForArticleId gives Kafa its own group; the others keep the original", async () => {
    const { t, w, f, milk, views } = await sharedWithViews();
    const originalKeys = views.kafa.addonGroups[0].options.map((o) => o.key);
    const start = await revisionOf(t, w.a.menuServiceId);

    const result = ok(
      await as(t, w.ownerId).mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko" },
        patch: { name: "Mleko za kafu" },
        onlyForArticleId: f.kafaId,
      }),
    );
    expect(result.copied).toBe(true);
    expect(result.groupId).not.toBe(milk.groupId);
    // Copy + change is ONE change.
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const kafa = await optionsView(t, w.ownerId, f.kafaId);
    // Kafa keeps its position: the copy replaces the original link, "Slatkiš" stays second.
    expect(namesOf(kafa)).toEqual(["Mleko za kafu", "Slatkiš"]);
    expect(kafa.addonGroups[0]).toMatchObject({
      groupId: result.groupId,
      name: "Mleko za kafu",
      linkCount: 1,
    });
    expect(kafa.addonGroups[0].key).not.toBe(milk.key);
    // Same options, but new keys: an independent copy, not a shared row.
    const copiedKeys = kafa.addonGroups[0].options.map((o) => o.key);
    expect(copiedKeys.filter((key) => originalKeys.includes(key))).toEqual([]);
    expect(
      kafa.addonGroups[0].options.map((o) => [o.name, o.priceDeltaRsd, o.order]),
    ).toEqual(views.kafa.addonGroups[0].options.map((o) => [o.name, o.priceDeltaRsd, o.order]));

    // Kapućino and Late are unchanged apart from the shorter link count.
    for (const [articleId, before] of [
      [f.kapucinoId, views.kapucino],
      [f.lateId, views.late],
    ] as const) {
      const after = await optionsView(t, w.ownerId, articleId);
      expect(after.addonGroups).toEqual([{ ...before.addonGroups[0], linkCount: 2 }]);
      expect(after.addonGroups[0].groupId).toBe(milk.groupId);
    }

    // The counts are exact.
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups.find((g) => g._id === milk.groupId)?.linkCount).toBe(2);
    expect(state.groups.find((g) => g._id === result.groupId)?.linkCount).toBe(1);
    expect(state.links.filter((l) => l.groupId === milk.groupId)).toHaveLength(2);
    expect(state.links.filter((l) => l.groupId === result.groupId)).toHaveLength(1);
    expect(state.options.filter((o) => o.groupId === milk.groupId)).toHaveLength(3);
    expect(state.options.filter((o) => o.groupId === result.groupId)).toHaveLength(3);

    // "Koje artikle pogađa" now says so too.
    const usageOriginal = await as(t, w.ownerId).query(api.menuArticleOptions.addonGroupUsage, {
      groupId: milk.groupId,
    });
    expect(usageOriginal?.articles.map((a) => a.name)).toEqual(["Kapućino", "Late"]);
    const usageCopy = await as(t, w.ownerId).query(api.menuArticleOptions.addonGroupUsage, {
      groupId: result.groupId,
    });
    expect(usageCopy?.articles.map((a) => a.name)).toEqual(["Kafa"]);
  });

  test("updateAddonOption with onlyForArticleId changes the option in Kafa's copy only", async () => {
    const { t, w, f, milk, views } = await sharedWithViews();
    const original = views.kafa.addonGroups[0].options[0];

    const result = ok(
      await as(t, w.ownerId).mutation(api.menuArticleOptions.updateAddonOption, {
        optionId: original.optionId,
        expected: { priceDeltaRsd: 30 },
        patch: { priceDeltaRsd: 35 },
        onlyForArticleId: f.kafaId,
      }),
    );
    expect(result.copied).toBe(true);
    expect(result.groupId).not.toBe(milk.groupId);
    expect(result.optionId).not.toBe(original.optionId);

    const kafa = await optionsView(t, w.ownerId, f.kafaId);
    expect(kafa.addonGroups[0].groupId).toBe(result.groupId);
    expect(kafa.addonGroups[0].options[0]).toMatchObject({
      optionId: result.optionId,
      name: "Sojino",
      priceDeltaRsd: 35,
    });
    // The other two options of the copy are untouched.
    expect(kafa.addonGroups[0].options.slice(1).map((o) => o.priceDeltaRsd)).toEqual([40, 0]);
    for (const articleId of [f.kapucinoId, f.lateId]) {
      const group = (await optionsView(t, w.ownerId, articleId)).addonGroups[0];
      expect(group.groupId).toBe(milk.groupId);
      expect(group.linkCount).toBe(2);
      expect(group.options[0]).toMatchObject({ optionId: original.optionId, priceDeltaRsd: 30 });
    }
  });

  test("addAddonOption with onlyForArticleId copies first; afterwards the same flag edits Kafa's own group in place", async () => {
    const { t, w, f, milk, views } = await sharedWithViews();
    const owner = as(t, w.ownerId);
    const original = views.kafa.addonGroups[0].options;
    const kapucinoBefore = views.kapucino.addonGroups[0];

    // Add for Kafa only.
    const added = ok(
      await owner.mutation(api.menuArticleOptions.addAddonOption, {
        groupId: milk.groupId,
        name: "Ovseno",
        priceDeltaRsd: 50,
        onlyForArticleId: f.kafaId,
      }),
    );
    expect(added.copied).toBe(true);
    expect(added.groupId).not.toBe(milk.groupId);
    const kafaGroup = async () => (await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0];
    expect((await kafaGroup()).options.map((o) => [o.name, o.order])).toEqual([
      ["Sojino", 1024],
      ["Bademovo", 2048],
      ["Bez laktoze", 3072],
      ["Ovseno", 4096],
    ]);
    expect((await kafaGroup()).options[3].optionId).toBe(added.optionId);

    // Kafa's group is its own now: the same flag edits it in place, no second copy.
    const sojinoOfCopy = (await kafaGroup()).options[0];
    const removed = await owner.mutation(api.menuArticleOptions.removeAddonOption, {
      optionId: sojinoOfCopy.optionId,
      onlyForArticleId: f.kafaId,
    });
    expect(removed).toEqual({ ok: true, groupId: added.groupId, copied: false });
    expect((await kafaGroup()).options.map((o) => o.name)).toEqual([
      "Bademovo",
      "Bez laktoze",
      "Ovseno",
    ]);
    const moved = await owner.mutation(api.menuArticleOptions.moveAddonOption, {
      optionId: added.optionId,
      toIndex: 0,
      onlyForArticleId: f.kafaId,
    });
    expect(moved).toEqual({ ok: true, groupId: added.groupId, copied: false });
    expect((await kafaGroup()).options.map((o) => o.name)).toEqual([
      "Ovseno",
      "Bademovo",
      "Bez laktoze",
    ]);

    // Kapućino and Late still have the original, exactly as before (linkCount 2 now).
    for (const articleId of [f.kapucinoId, f.lateId]) {
      const group = (await optionsView(t, w.ownerId, articleId)).addonGroups[0];
      expect(group).toEqual({ ...kapucinoBefore, linkCount: 2 });
      expect(group.options.map((o) => o.optionId)).toEqual(original.map((o) => o.optionId));
    }
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups).toHaveLength(3);
    expect(state.options.filter((o) => o.groupId === milk.groupId)).toHaveLength(3);
    expectExactLinkCounts(state);
  });

  test("removeAddonOption with onlyForArticleId on a shared group copies first and removes from the copy", async () => {
    const { t, w, f, milk, views } = await sharedWithViews();
    const sojino = views.late.addonGroups[0].options[0];

    const removed = ok(
      await as(t, w.ownerId).mutation(api.menuArticleOptions.removeAddonOption, {
        optionId: sojino.optionId,
        onlyForArticleId: f.lateId,
      }),
    );
    expect(removed.copied).toBe(true);
    expect(removed.groupId).not.toBe(milk.groupId);

    const late = (await optionsView(t, w.ownerId, f.lateId)).addonGroups[0];
    expect(late).toMatchObject({ groupId: removed.groupId, linkCount: 1 });
    expect(late.options.map((o) => o.name)).toEqual(["Bademovo", "Bez laktoze"]);
    for (const articleId of [f.kafaId, f.kapucinoId]) {
      const group = (await optionsView(t, w.ownerId, articleId)).addonGroups[0];
      expect(group.groupId).toBe(milk.groupId);
      expect(group.linkCount).toBe(2);
      expect(group.options.map((o) => o.name)).toEqual(["Sojino", "Bademovo", "Bez laktoze"]);
    }
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.options.filter((o) => o.groupId === milk.groupId)).toHaveLength(3);
    expectExactLinkCounts(state);
  });

  test("moveAddonOption with onlyForArticleId on a shared group copies first and reorders the copy", async () => {
    const { t, w, f, milk, views } = await sharedWithViews();
    const bademovo = views.kapucino.addonGroups[0].options[1];
    const start = await revisionOf(t, w.a.menuServiceId);

    const moved = ok(
      await as(t, w.ownerId).mutation(api.menuArticleOptions.moveAddonOption, {
        optionId: bademovo.optionId,
        toIndex: 0,
        onlyForArticleId: f.kapucinoId,
      }),
    );
    expect(moved.copied).toBe(true);
    expect(moved.groupId).not.toBe(milk.groupId);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const kapucino = (await optionsView(t, w.ownerId, f.kapucinoId)).addonGroups[0];
    expect(kapucino).toMatchObject({ groupId: moved.groupId, linkCount: 1 });
    expect(kapucino.options.map((o) => [o.name, o.order])).toEqual([
      ["Bademovo", 1024],
      ["Sojino", 2048],
      ["Bez laktoze", 3072],
    ]);
    for (const articleId of [f.kafaId, f.lateId]) {
      const group = (await optionsView(t, w.ownerId, articleId)).addonGroups[0];
      expect(group.groupId).toBe(milk.groupId);
      expect(group.linkCount).toBe(2);
      expect(group.options.map((o) => o.name)).toEqual(["Sojino", "Bademovo", "Bez laktoze"]);
    }
    expectExactLinkCounts(await snapshot(t, w.a.menuServiceId));
  });

  test("copyAddonGroupForArticle makes the copy on request; a group that is not shared is not copied", async () => {
    const { t, w, f, milk } = await sharedWithViews();
    const owner = as(t, w.ownerId);
    const start = await revisionOf(t, w.a.menuServiceId);

    const copied = await owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
      articleId: f.kapucinoId,
      groupId: milk.groupId,
    });
    expect(copied.copied).toBe(true);
    expect(copied.groupId).not.toBe(milk.groupId);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const kapucino = (await optionsView(t, w.ownerId, f.kapucinoId)).addonGroups[0];
    expect(kapucino).toMatchObject({ groupId: copied.groupId, name: "Mleko", linkCount: 1 });
    expect(kapucino.key).not.toBe(milk.key);
    const kafa = (await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0];
    expect(kafa).toMatchObject({ groupId: milk.groupId, linkCount: 2 });

    // Kapućino is the only link of its copy now: nothing to copy, nothing written.
    const before = await snapshot(t, w.a.menuServiceId);
    expect(
      await owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
        articleId: f.kapucinoId,
        groupId: copied.groupId,
      }),
    ).toEqual({ groupId: copied.groupId, copied: false });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await expect(
      owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
        articleId: f.lateId,
        groupId: copied.groupId,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonGroupNotAttached);
  });

  test("when the article is the group's only link, onlyForArticleId edits it in place (no copy)", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const owner = as(t, w.ownerId);

    const result = ok(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko" },
        patch: { name: "Mleko za kafu" },
        onlyForArticleId: f.kafaId,
      }),
    );
    expect(result).toEqual({ ok: true, groupId: milk.groupId, copied: false });
    const optionId = (await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0].options[0].optionId;
    expect(
      await owner.mutation(api.menuArticleOptions.updateAddonOption, {
        optionId,
        expected: { name: "Sojino" },
        patch: { name: "Soja" },
        onlyForArticleId: f.kafaId,
      }),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false, optionId });
    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups).toHaveLength(1);
    expect(state.options).toHaveLength(3);
    expect(state.groups[0]).toMatchObject({ name: "Mleko za kafu", linkCount: 1 });
    expect(state.options[0].name).toBe("Soja");
  });

  test("a conflict or a no-op with onlyForArticleId writes nothing, not even the copy", async () => {
    const { t, w, f, milk, views } = await sharedWithViews();
    const owner = as(t, w.ownerId);
    const sojino = views.kafa.addonGroups[0].options[0];
    const before = await snapshot(t, w.a.menuServiceId);

    expect(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Staro ime" },
        patch: { name: "Novo" },
        onlyForArticleId: f.kafaId,
      }),
    ).toEqual({ ok: false, conflicts: ["name"], current: { name: "Mleko" }, attempted: { name: "Novo" } });
    expect(
      await owner.mutation(api.menuArticleOptions.updateAddonOption, {
        optionId: sojino.optionId,
        expected: { priceDeltaRsd: 99 },
        patch: { priceDeltaRsd: 100 },
        onlyForArticleId: f.kafaId,
      }),
    ).toEqual({ ok: false, conflicts: ["priceDeltaRsd"], current: { priceDeltaRsd: 30 }, attempted: { priceDeltaRsd: 100 } });
    expect(
      await owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { name: "Mleko" },
        patch: { name: "Mleko" },
        onlyForArticleId: f.kafaId,
      }),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false });
    expect(
      await owner.mutation(api.menuArticleOptions.moveAddonOption, {
        optionId: sojino.optionId,
        toIndex: 0,
        onlyForArticleId: f.kafaId,
      }),
    ).toEqual({ ok: true, groupId: milk.groupId, copied: false });
    // Invalid merged rules throw: no orphan copy either.
    await expect(
      owner.mutation(api.menuArticleOptions.updateAddonGroup, {
        groupId: milk.groupId,
        expected: { minSelect: null },
        patch: { minSelect: 2 },
        onlyForArticleId: f.kafaId,
      }),
    ).rejects.toThrow(ARTICLE_ERROR.addonRulesInvalid);

    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    // Still only "Mleko" and "Slatkiš": no copy was made.
    expect((await snapshot(t, w.a.menuServiceId)).groups).toHaveLength(2);
  });

  test("onlyForArticleId must be an article linked to the group", async () => {
    const { t, w, f, milk } = await sharedWithViews();
    const owner = as(t, w.ownerId);
    const tea = await quickAdd(t, w.ownerId, f.sectionId, "Čaj", 120);
    const optionId = (await optionsView(t, w.ownerId, f.kafaId)).addonGroups[0].options[0].optionId;
    const before = await snapshot(t, w.a.menuServiceId);

    const calls: [string, () => Promise<unknown>][] = [
      [
        "updateAddonGroup",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonGroup, {
            groupId: milk.groupId,
            expected: { name: "Mleko" },
            patch: { name: "Novo" },
            onlyForArticleId: tea.articleId,
          }),
      ],
      [
        "addAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.addAddonOption, {
            groupId: milk.groupId,
            name: "Ovseno",
            priceDeltaRsd: 50,
            onlyForArticleId: tea.articleId,
          }),
      ],
      [
        "updateAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonOption, {
            optionId,
            expected: { name: "Sojino" },
            patch: { name: "Soja" },
            onlyForArticleId: tea.articleId,
          }),
      ],
      [
        "removeAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.removeAddonOption, {
            optionId,
            onlyForArticleId: tea.articleId,
          }),
      ],
      [
        "moveAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.moveAddonOption, {
            optionId,
            toIndex: 2,
            onlyForArticleId: tea.articleId,
          }),
      ],
      [
        "copyAddonGroupForArticle",
        () =>
          owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
            articleId: tea.articleId,
            groupId: milk.groupId,
          }),
      ],
    ];
    for (const [label, call] of calls) {
      await expect(call(), label).rejects.toThrow(ARTICLE_ERROR.addonGroupNotAttached);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

describe("applyAddonGroupToArticles ('Primeni i na druge artikle')", () => {
  test("links the group to the chosen articles, skips the already linked, counts exactly, switches add-ons on", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    const start = await revisionOf(t, w.a.menuServiceId);

    const result = await owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
      groupId: milk.groupId,
      articleIds: [f.kapucinoId, f.lateId, f.kafaId],
    });
    expect(result).toEqual({ attached: 2, alreadyAttached: 1, skippedAtLimit: 0 });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups[0].linkCount).toBe(3);
    expect(state.links).toHaveLength(3);
    for (const articleId of [f.kapucinoId, f.lateId]) {
      const view = await optionsView(t, w.ownerId, articleId);
      expect(view.addonsEnabled).toBe(true);
      expect(view.addonGroups[0]).toMatchObject({ groupId: milk.groupId, linkCount: 3 });
    }

    // Everything is linked now: a repeat attaches nothing and does not touch the draft.
    const before = await snapshot(t, w.a.menuServiceId);
    expect(
      await owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
        groupId: milk.groupId,
        articleIds: [f.kafaId, f.kapucinoId, f.lateId],
      }),
    ).toEqual({ attached: 0, alreadyAttached: 3, skippedAtLimit: 0 });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("the same article listed twice is linked once", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    expect(
      await as(t, w.ownerId).mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
        groupId: milk.groupId,
        articleIds: [f.lateId, f.lateId],
      }),
    ).toEqual({ attached: 1, alreadyAttached: 0, skippedAtLimit: 0 });
    expect((await snapshot(t, w.a.menuServiceId)).groups[0].linkCount).toBe(2);
  });

  test("articles at the per-article limit are skipped and counted; the rest are linked", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const owner = as(t, w.ownerId);
    for (let index = 0; index < MENU_MAX_ADDON_GROUPS_PER_ARTICLE; index += 1) {
      await owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.lateId,
        name: `Grupa ${index}`,
        selection: "single",
        required: false,
      });
    }

    expect(
      await owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
        groupId: milk.groupId,
        articleIds: [f.lateId, f.kapucinoId],
      }),
    ).toEqual({ attached: 1, alreadyAttached: 0, skippedAtLimit: 1 });
    expect((await snapshot(t, w.a.menuServiceId)).groups.find((g) => g._id === milk.groupId)?.linkCount).toBe(2);
    expect((await optionsView(t, w.ownerId, f.lateId)).addonGroups).toHaveLength(
      MENU_MAX_ADDON_GROUPS_PER_ARTICLE,
    );

    // Only a skip: nothing is written at all.
    const before = await snapshot(t, w.a.menuServiceId);
    expect(
      await owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
        groupId: milk.groupId,
        articleIds: [f.lateId],
      }),
    ).toEqual({ attached: 0, alreadyAttached: 0, skippedAtLimit: 1 });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("an empty list, or more than MENU_MAX_ARTICLE_BATCH articles, is invalid input", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const articleIds = await t.run(async (ctx) => {
      const now = Date.now();
      const ids: Id<"menuArticles">[] = [];
      for (let index = 0; index < MENU_MAX_ARTICLE_BATCH + 1; index += 1) {
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
    const before = await snapshot(t, w.a.menuServiceId);
    const owner = as(t, w.ownerId);
    await expect(
      owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
        groupId: milk.groupId,
        articleIds: [],
      }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    await expect(
      owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
        groupId: milk.groupId,
        articleIds,
      }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // Exactly the batch size is fine.
    const result = await owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
      groupId: milk.groupId,
      articleIds: articleIds.slice(0, MENU_MAX_ARTICLE_BATCH),
    });
    expect(result.attached).toBe(MENU_MAX_ARTICLE_BATCH);
  });

  test("an article of another business is not_found and nothing is written, not even for the valid ids", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    const b = await coffeeFixture(t, w.otherOwnerId, w.b.defaultPageId);
    const beforeA = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);

    // The owner of A, and a ScanMe admin who may act on both services.
    for (const userId of [w.ownerId, w.adminId]) {
      await expect(
        as(t, userId).mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
          groupId: milk.groupId,
          articleIds: [f.kapucinoId, b.kafaId],
        }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
  });
});

describe("deleting a group", () => {
  test("deleteAddonGroup removes every link, option and the group, and writes the audit row", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await sharedMilk(t, w.ownerId, f);
    const second = await as(t, w.ownerId).mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: f.kafaId,
      name: "Slatkiš",
      selection: "single",
      required: false,
      options: [{ name: "Šećer", priceDeltaRsd: 0 }],
    });
    const start = await revisionOf(t, w.a.menuServiceId);
    const auditBefore = (await snapshot(t, w.a.menuServiceId)).audit.length;

    const result = await as(t, w.ownerId).mutation(api.menuArticleOptions.deleteAddonGroup, {
      groupId: milk.groupId,
    });
    expect(result).toEqual({ deleted: true, links: 3 });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(start + 1);

    const state = await snapshot(t, w.a.menuServiceId);
    expect(state.groups.map((g) => g._id)).toEqual([second.groupId]);
    expect(state.options.map((o) => o.name)).toEqual(["Šećer"]);
    expect(state.links.map((l) => l.groupId)).toEqual([second.groupId]);
    expect(state.audit).toHaveLength(auditBefore + 1);
    expect(state.audit[state.audit.length - 1]).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      actorKind: "user",
      actorUserId: w.ownerId,
      action: "addon_group.deleted",
      entityType: "menuAddonGroups",
      entityKey: milk.key,
      details: { name: "Mleko", links: 3 },
    });
    // The articles keep their switches; only the group is gone.
    expect((await optionsView(t, w.ownerId, f.kapucinoId)).addonGroups).toEqual([]);
    expect(namesOf(await optionsView(t, w.ownerId, f.kafaId))).toEqual(["Slatkiš"]);
    await expect(
      as(t, w.ownerId).mutation(api.menuArticleOptions.deleteAddonGroup, { groupId: milk.groupId }),
    ).rejects.toThrow(MENU_ERROR.notFound);
  });

  test("a ScanMe admin's deletion is audited as an admin action", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const milk = await milkOnKafa(t, w.ownerId, f);
    await as(t, w.adminId).mutation(api.menuArticleOptions.deleteAddonGroup, {
      groupId: milk.groupId,
    });
    const audit = (await snapshot(t, w.a.menuServiceId)).audit;
    expect(audit[audit.length - 1]).toMatchObject({
      actorKind: "admin",
      actorUserId: w.adminId,
      action: "addon_group.deleted",
      details: { name: "Mleko", links: 1 },
    });
  });
});

describe("draft revision: touchDraft exactly once per successful change", () => {
  test("every successful mutation bumps the revision by exactly 1", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);
    const ids: {
      variantId?: Id<"menuVariants">;
      secondVariantId?: Id<"menuVariants">;
      groupId?: Id<"menuAddonGroups">;
      secondGroupId?: Id<"menuAddonGroups">;
      optionId?: Id<"menuAddonOptions">;
      copiedGroupId?: Id<"menuAddonGroups">;
    } = {};
    function need<V>(value: V | undefined): V {
      if (value === undefined) throw new Error("test step ran out of order");
      return value;
    }

    const steps: [string, () => Promise<unknown>][] = [
      [
        "setArticleOptionSwitches",
        () =>
          owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
            articleId: f.kafaId,
            noteEnabled: true,
          }),
      ],
      [
        "addVariant",
        async () => {
          ids.variantId = (
            await owner.mutation(api.menuArticleOptions.addVariant, {
              articleId: f.kafaId,
              name: "Mala",
              priceRsd: 150,
            })
          ).variantId;
        },
      ],
      [
        "addVariant (second)",
        async () => {
          ids.secondVariantId = (
            await owner.mutation(api.menuArticleOptions.addVariant, {
              articleId: f.kafaId,
              name: "Velika",
              priceRsd: 200,
            })
          ).variantId;
        },
      ],
      [
        "updateVariant",
        () =>
          owner.mutation(api.menuArticleOptions.updateVariant, {
            variantId: need(ids.variantId),
            expected: { name: "Mala", priceRsd: 150 },
            patch: { name: "Mala šolja", priceRsd: 160 },
          }),
      ],
      [
        "moveVariant",
        () =>
          owner.mutation(api.menuArticleOptions.moveVariant, {
            variantId: need(ids.secondVariantId),
            toIndex: 0,
          }),
      ],
      [
        "removeVariant",
        () =>
          owner.mutation(api.menuArticleOptions.removeVariant, {
            variantId: need(ids.variantId),
          }),
      ],
      [
        "createAddonGroup",
        async () => {
          const created = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
            articleId: f.kafaId,
            name: "Mleko",
            selection: "single",
            required: false,
            options: MILK_OPTIONS,
          });
          ids.groupId = created.groupId;
        },
      ],
      [
        "createAddonGroup (second)",
        async () => {
          const created = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
            articleId: f.kafaId,
            name: "Slatkiš",
            selection: "single",
            required: false,
          });
          ids.secondGroupId = created.groupId;
        },
      ],
      [
        "attachAddonGroup",
        () =>
          owner.mutation(api.menuArticleOptions.attachAddonGroup, {
            articleId: f.kapucinoId,
            groupId: need(ids.groupId),
          }),
      ],
      [
        "moveArticleAddonGroup",
        () =>
          owner.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
            articleId: f.kafaId,
            groupId: need(ids.secondGroupId),
            toIndex: 0,
          }),
      ],
      [
        "applyAddonGroupToArticles",
        () =>
          owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
            groupId: need(ids.groupId),
            articleIds: [f.lateId],
          }),
      ],
      [
        "updateAddonGroup",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonGroup, {
            groupId: need(ids.groupId),
            expected: { name: "Mleko" },
            patch: { name: "Vrsta mleka" },
          }),
      ],
      [
        "addAddonOption",
        async () => {
          const added = await owner.mutation(api.menuArticleOptions.addAddonOption, {
            groupId: need(ids.groupId),
            name: "Ovseno",
            priceDeltaRsd: 50,
          });
          ids.optionId = added.optionId;
        },
      ],
      [
        "updateAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonOption, {
            optionId: need(ids.optionId),
            expected: { priceDeltaRsd: 50 },
            patch: { priceDeltaRsd: 55 },
          }),
      ],
      [
        "moveAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.moveAddonOption, {
            optionId: need(ids.optionId),
            toIndex: 0,
          }),
      ],
      [
        "updateAddonGroup (only for one article: copy + change)",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonGroup, {
            groupId: need(ids.groupId),
            expected: { required: false },
            patch: { required: true },
            onlyForArticleId: f.lateId,
          }),
      ],
      [
        "copyAddonGroupForArticle",
        async () => {
          const copied = await owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
            articleId: f.kapucinoId,
            groupId: need(ids.groupId),
          });
          ids.copiedGroupId = copied.groupId;
        },
      ],
      [
        "removeAddonOption",
        () =>
          owner.mutation(api.menuArticleOptions.removeAddonOption, {
            optionId: need(ids.optionId),
          }),
      ],
      [
        "detachAddonGroup",
        () =>
          owner.mutation(api.menuArticleOptions.detachAddonGroup, {
            articleId: f.kafaId,
            groupId: need(ids.groupId),
          }),
      ],
      [
        "deleteAddonGroup",
        () =>
          owner.mutation(api.menuArticleOptions.deleteAddonGroup, {
            groupId: need(ids.copiedGroupId),
          }),
      ],
    ];

    for (const [label, run] of steps) {
      const before = await revisionOf(t, w.a.menuServiceId);
      const result = await run();
      if (typeof result === "object" && result !== null && "ok" in result) {
        expect(result, label).toMatchObject({ ok: true });
      }
      expect(await revisionOf(t, w.a.menuServiceId), label).toBe(before + 1);
    }
  });

  test("refusals, conflicts and no-ops never touch the draft", async () => {
    const { t, w } = await setup();
    const f = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);

    const refused: [string, () => Promise<unknown>][] = [
      [
        "no switch named",
        () =>
          owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
            articleId: f.kafaId,
          }),
      ],
      [
        "invalid variant name",
        () =>
          owner.mutation(api.menuArticleOptions.addVariant, { articleId: f.kafaId, name: " " }),
      ],
      [
        "invalid group rules",
        () =>
          owner.mutation(api.menuArticleOptions.createAddonGroup, {
            articleId: f.kafaId,
            name: "Loše",
            selection: "single",
            required: false,
            minSelect: 1,
          }),
      ],
      [
        "attach twice",
        () =>
          owner.mutation(api.menuArticleOptions.attachAddonGroup, {
            articleId: f.kafaId,
            groupId: f.groupId,
          }),
      ],
      [
        "detach a group that is not attached",
        () =>
          owner.mutation(api.menuArticleOptions.detachAddonGroup, {
            articleId: f.kapucinoId,
            groupId: f.groupId,
          }),
      ],
      [
        "apply with no articles",
        () =>
          owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
            groupId: f.groupId,
            articleIds: [],
          }),
      ],
      [
        "invalid option price",
        () =>
          owner.mutation(api.menuArticleOptions.addAddonOption, {
            groupId: f.groupId,
            name: "Ovseno",
            priceDeltaRsd: -5,
          }),
      ],
    ];
    for (const [label, run] of refused) {
      await expect(run(), label).rejects.toThrow();
    }

    const quiet: [string, () => Promise<unknown>][] = [
      [
        "variant conflict",
        () =>
          owner.mutation(api.menuArticleOptions.updateVariant, {
            variantId: f.variantId,
            expected: { name: "Stara" },
            patch: { name: "Nova" },
          }),
      ],
      [
        "variant no-op",
        () =>
          owner.mutation(api.menuArticleOptions.updateVariant, {
            variantId: f.variantId,
            expected: { name: "Mala" },
            patch: { name: "Mala" },
          }),
      ],
      [
        "group conflict",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonGroup, {
            groupId: f.groupId,
            expected: { name: "Staro" },
            patch: { name: "Novo" },
          }),
      ],
      [
        "group no-op",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonGroup, {
            groupId: f.groupId,
            expected: { required: false },
            patch: { required: false },
          }),
      ],
      [
        "option conflict",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonOption, {
            optionId: f.optionId,
            expected: { priceDeltaRsd: 1 },
            patch: { priceDeltaRsd: 2 },
          }),
      ],
      [
        "option no-op",
        () =>
          owner.mutation(api.menuArticleOptions.updateAddonOption, {
            optionId: f.optionId,
            expected: { name: "Sojino" },
            patch: { name: "Sojino" },
          }),
      ],
      [
        "switch no-op",
        () =>
          owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
            articleId: f.kafaId,
            variantsEnabled: true,
            addonsEnabled: true,
          }),
      ],
      [
        "move variant to where it is",
        () =>
          owner.mutation(api.menuArticleOptions.moveVariant, { variantId: f.variantId, toIndex: 0 }),
      ],
      [
        "move group to where it is",
        () =>
          owner.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
            articleId: f.kafaId,
            groupId: f.groupId,
            toIndex: 0,
          }),
      ],
      [
        "move option to where it is",
        () =>
          owner.mutation(api.menuArticleOptions.moveAddonOption, {
            optionId: f.optionId,
            toIndex: 0,
          }),
      ],
      [
        "copy of a group that is not shared",
        () =>
          owner.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
            articleId: f.kafaId,
            groupId: f.groupId,
          }),
      ],
      [
        "apply to articles that already have it",
        () =>
          owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
            groupId: f.groupId,
            articleIds: [f.kafaId],
          }),
      ],
    ];
    for (const [label, run] of quiet) {
      await run();
      expect(await snapshot(t, w.a.menuServiceId), label).toEqual(before);
    }
  });
});

/** One call of every row-addressed mutation, for the role and tenant tests. */
function writeCalls(f: OptionsFixture): [string, (actor: Actor) => Promise<unknown>][] {
  return [
    [
      "setArticleOptionSwitches",
      (a) =>
        a.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
          articleId: f.kafaId,
          noteEnabled: true,
        }),
    ],
    [
      "addVariant",
      (a) =>
        a.mutation(api.menuArticleOptions.addVariant, { articleId: f.kafaId, name: "Velika" }),
    ],
    [
      "updateVariant",
      (a) =>
        a.mutation(api.menuArticleOptions.updateVariant, {
          variantId: f.variantId,
          expected: { name: "Mala" },
          patch: { name: "Hakovano" },
        }),
    ],
    [
      "moveVariant",
      (a) =>
        a.mutation(api.menuArticleOptions.moveVariant, { variantId: f.variantId, toIndex: 0 }),
    ],
    [
      "removeVariant",
      (a) => a.mutation(api.menuArticleOptions.removeVariant, { variantId: f.variantId }),
    ],
    [
      "createAddonGroup",
      (a) =>
        a.mutation(api.menuArticleOptions.createAddonGroup, {
          articleId: f.kafaId,
          name: "Sirup",
          selection: "single",
          required: false,
        }),
    ],
    [
      "attachAddonGroup",
      (a) =>
        a.mutation(api.menuArticleOptions.attachAddonGroup, {
          articleId: f.kapucinoId,
          groupId: f.groupId,
        }),
    ],
    [
      "detachAddonGroup",
      (a) =>
        a.mutation(api.menuArticleOptions.detachAddonGroup, {
          articleId: f.kafaId,
          groupId: f.groupId,
        }),
    ],
    [
      "moveArticleAddonGroup",
      (a) =>
        a.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
          articleId: f.kafaId,
          groupId: f.groupId,
          toIndex: 0,
        }),
    ],
    [
      "applyAddonGroupToArticles",
      (a) =>
        a.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
          groupId: f.groupId,
          articleIds: [f.kapucinoId],
        }),
    ],
    [
      "copyAddonGroupForArticle",
      (a) =>
        a.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
          articleId: f.kafaId,
          groupId: f.groupId,
        }),
    ],
    [
      "updateAddonGroup",
      (a) =>
        a.mutation(api.menuArticleOptions.updateAddonGroup, {
          groupId: f.groupId,
          expected: { name: "Mleko" },
          patch: { name: "Hakovano" },
        }),
    ],
    [
      "deleteAddonGroup",
      (a) => a.mutation(api.menuArticleOptions.deleteAddonGroup, { groupId: f.groupId }),
    ],
    [
      "addAddonOption",
      (a) =>
        a.mutation(api.menuArticleOptions.addAddonOption, {
          groupId: f.groupId,
          name: "Ovseno",
          priceDeltaRsd: 50,
        }),
    ],
    [
      "updateAddonOption",
      (a) =>
        a.mutation(api.menuArticleOptions.updateAddonOption, {
          optionId: f.optionId,
          expected: { name: "Sojino" },
          patch: { name: "Hakovano" },
        }),
    ],
    [
      "removeAddonOption",
      (a) => a.mutation(api.menuArticleOptions.removeAddonOption, { optionId: f.optionId }),
    ],
    [
      "moveAddonOption",
      (a) =>
        a.mutation(api.menuArticleOptions.moveAddonOption, { optionId: f.optionId, toIndex: 2 }),
    ],
  ];
}

describe("roles", () => {
  test("owner, manager, editor and ScanMe admin may change variants, groups and switches", async () => {
    const { t, w } = await setup();
    const f = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const actors = [
      ["vlasnik", w.ownerId],
      ["menadzer", w.managerId],
      ["urednik", w.editorId],
      ["admin", w.adminId],
    ] as const;
    for (let index = 0; index < actors.length; index += 1) {
      const [label, userId] = actors[index];
      const actor = as(t, userId);
      const start = await revisionOf(t, w.a.menuServiceId);
      await actor.mutation(api.menuArticleOptions.addVariant, {
        articleId: f.kafaId,
        name: `Varijanta ${label}`,
        priceRsd: 100,
      });
      const group = await actor.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: f.kafaId,
        name: `Grupa ${label}`,
        selection: "single",
        required: false,
        options: [{ name: "Dodatak", priceDeltaRsd: 10 }],
      });
      await actor.mutation(api.menuArticleOptions.attachAddonGroup, {
        articleId: f.kapucinoId,
        groupId: group.groupId,
      });
      expect(
        await actor.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
          articleId: f.lateId,
          // Flips every time (off → on → off → on), so each call is a real change.
          noteEnabled: index % 2 === 0,
        }),
      ).toEqual({ ok: true });
      const row = await t.run(async (ctx) => ctx.db.get(group.groupId));
      expect(row?.updatedByUserId, label).toBe(userId);
      // Four changes (variant, group, link, switch), one revision each.
      expect(await revisionOf(t, w.a.menuServiceId), label).toBe(start + 4);
    }
    const view = await optionsView(t, w.adminId, f.kafaId);
    expect(view.variants).toHaveLength(4);
    expect(view.addonGroups).toHaveLength(4);
  });

  test("finance, view-only, outsiders and the owner of another business get not_found on every row-addressed mutation; nothing changes", async () => {
    const { t, w } = await setup();
    const f = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    const before = await snapshot(t, w.a.menuServiceId);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const actor = as(t, userId);
      for (const [label, call] of writeCalls(f)) {
        await expect(call(actor), label).rejects.toThrow(MENU_ERROR.notFound);
      }
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("queries return null for finance, view-only, outsiders and other businesses, and data for owner, manager, editor and admin", async () => {
    const { t, w } = await setup();
    const f = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const actor = as(t, userId);
      expect(
        await actor.query(api.menuArticleOptions.articleOptions, { articleId: f.kafaId }),
      ).toBeNull();
      expect(
        await actor.query(api.menuArticleOptions.addonGroupUsage, { groupId: f.groupId }),
      ).toBeNull();
      expect(
        await actor.query(api.menuArticleOptions.listAddonGroups, {
          menuServiceId: w.a.menuServiceId,
        }),
      ).toBeNull();
    }
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const actor = as(t, userId);
      const view = await actor.query(api.menuArticleOptions.articleOptions, {
        articleId: f.kafaId,
      });
      expect(view?.variants.map((v) => v.name)).toEqual(["Mala"]);
      expect(view?.addonGroups.map((g) => g.name)).toEqual(["Mleko"]);
      expect(
        (await actor.query(api.menuArticleOptions.addonGroupUsage, { groupId: f.groupId }))?.linkCount,
      ).toBe(1);
      expect(
        (
          await actor.query(api.menuArticleOptions.listAddonGroups, {
            menuServiceId: w.a.menuServiceId,
          })
        )?.map((g) => g.name),
      ).toEqual(["Mleko"]);
    }
  });

  test("signed-out callers are refused and read null", async () => {
    const { t, w } = await setup();
    const f = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    await expect(
      t.mutation(api.menuArticleOptions.addVariant, { articleId: f.kafaId, name: "Velika" }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    await expect(
      t.mutation(api.menuArticleOptions.deleteAddonGroup, { groupId: f.groupId }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect(await t.query(api.menuArticleOptions.articleOptions, { articleId: f.kafaId })).toBeNull();
    expect(
      await t.query(api.menuArticleOptions.addonGroupUsage, { groupId: f.groupId }),
    ).toBeNull();
    expect(
      await t.query(api.menuArticleOptions.listAddonGroups, { menuServiceId: w.a.menuServiceId }),
    ).toBeNull();
  });

  test("with client editing switched off, clients get editingDisabled on every mutation, the admin still edits, reading stays open", async () => {
    const { t, w } = await setup();
    const f = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const before = await snapshot(t, w.a.menuServiceId);
    for (const userId of [w.ownerId, w.managerId, w.editorId]) {
      for (const [label, call] of writeCalls(f)) {
        await expect(call(as(t, userId)), label).rejects.toThrow(MENU_ERROR.editingDisabled);
      }
      expect(
        (await as(t, userId).query(api.menuArticleOptions.articleOptions, { articleId: f.kafaId }))
          ?.variants,
      ).toHaveLength(1);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    expect(
      await as(t, w.adminId).mutation(api.menuArticleOptions.addVariant, {
        articleId: f.kafaId,
        name: "Velika",
      }),
    ).toMatchObject({ key: expect.stringMatching(/^va_/) });
  });
});

describe("tenant isolation", () => {
  test("the owner of A cannot read or change anything of B, and B's owner nothing of A", async () => {
    const { t, w } = await setup();
    const fa = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    const fb = await withOptions(
      t,
      w.otherOwnerId,
      await coffeeFixture(t, w.otherOwnerId, w.b.defaultPageId),
    );
    const beforeA = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);

    for (const [label, call] of writeCalls(fb)) {
      await expect(call(as(t, w.ownerId)), `A→B ${label}`).rejects.toThrow(MENU_ERROR.notFound);
    }
    for (const [label, call] of writeCalls(fa)) {
      await expect(call(as(t, w.otherOwnerId)), `B→A ${label}`).rejects.toThrow(
        MENU_ERROR.notFound,
      );
    }
    const owner = as(t, w.ownerId);
    expect(
      await owner.query(api.menuArticleOptions.articleOptions, { articleId: fb.kafaId }),
    ).toBeNull();
    expect(
      await owner.query(api.menuArticleOptions.addonGroupUsage, { groupId: fb.groupId }),
    ).toBeNull();
    expect(
      await owner.query(api.menuArticleOptions.listAddonGroups, {
        menuServiceId: w.b.menuServiceId,
      }),
    ).toBeNull();
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
  });

  test("a group of one business together with an article of the other is not_found, nothing is written", async () => {
    const { t, w } = await setup();
    const fa = await withOptions(t, w.ownerId, await coffeeFixture(t, w.ownerId, w.a.defaultPageId));
    const fb = await withOptions(
      t,
      w.otherOwnerId,
      await coffeeFixture(t, w.otherOwnerId, w.b.defaultPageId),
    );
    const beforeA = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);
    const owner = as(t, w.ownerId);
    const admin = as(t, w.adminId);

    const crossings: [string, () => Promise<unknown>][] = [
      [
        "owner A: A article + B group",
        () =>
          owner.mutation(api.menuArticleOptions.attachAddonGroup, {
            articleId: fa.kafaId,
            groupId: fb.groupId,
          }),
      ],
      [
        "admin: A article + B group (attach)",
        () =>
          admin.mutation(api.menuArticleOptions.attachAddonGroup, {
            articleId: fa.kafaId,
            groupId: fb.groupId,
          }),
      ],
      [
        "admin: B article + A group (attach)",
        () =>
          admin.mutation(api.menuArticleOptions.attachAddonGroup, {
            articleId: fb.kafaId,
            groupId: fa.groupId,
          }),
      ],
      [
        "admin: detach",
        () =>
          admin.mutation(api.menuArticleOptions.detachAddonGroup, {
            articleId: fa.kafaId,
            groupId: fb.groupId,
          }),
      ],
      [
        "admin: moveArticleAddonGroup",
        () =>
          admin.mutation(api.menuArticleOptions.moveArticleAddonGroup, {
            articleId: fa.kafaId,
            groupId: fb.groupId,
            toIndex: 0,
          }),
      ],
      [
        "admin: copyAddonGroupForArticle",
        () =>
          admin.mutation(api.menuArticleOptions.copyAddonGroupForArticle, {
            articleId: fa.kafaId,
            groupId: fb.groupId,
          }),
      ],
      [
        "admin: applyAddonGroupToArticles",
        () =>
          admin.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
            groupId: fa.groupId,
            articleIds: [fa.kapucinoId, fb.kapucinoId],
          }),
      ],
      [
        "admin: updateAddonGroup onlyForArticleId of the other business",
        () =>
          admin.mutation(api.menuArticleOptions.updateAddonGroup, {
            groupId: fa.groupId,
            expected: { name: "Mleko" },
            patch: { name: "Hakovano" },
            onlyForArticleId: fb.kafaId,
          }),
      ],
      [
        "admin: addAddonOption onlyForArticleId of the other business",
        () =>
          admin.mutation(api.menuArticleOptions.addAddonOption, {
            groupId: fa.groupId,
            name: "Ovseno",
            priceDeltaRsd: 50,
            onlyForArticleId: fb.kafaId,
          }),
      ],
      [
        "admin: updateAddonOption onlyForArticleId of the other business",
        () =>
          admin.mutation(api.menuArticleOptions.updateAddonOption, {
            optionId: fa.optionId,
            expected: { name: "Sojino" },
            patch: { name: "Hakovano" },
            onlyForArticleId: fb.kafaId,
          }),
      ],
      [
        "admin: removeAddonOption onlyForArticleId of the other business",
        () =>
          admin.mutation(api.menuArticleOptions.removeAddonOption, {
            optionId: fa.optionId,
            onlyForArticleId: fb.kafaId,
          }),
      ],
      [
        "admin: moveAddonOption onlyForArticleId of the other business",
        () =>
          admin.mutation(api.menuArticleOptions.moveAddonOption, {
            optionId: fa.optionId,
            toIndex: 1,
            onlyForArticleId: fb.kafaId,
          }),
      ],
    ];
    for (const [label, call] of crossings) {
      await expect(call(), label).rejects.toThrow(MENU_ERROR.notFound);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
  });

  test("the two businesses keep separate groups and pickers, even with the same names", async () => {
    const { t, w } = await setup();
    const fa = await coffeeFixture(t, w.ownerId, w.a.defaultPageId);
    const fb = await coffeeFixture(t, w.otherOwnerId, w.b.defaultPageId);
    const milkA = await milkOnKafa(t, w.ownerId, fa);
    const milkB = await milkOnKafa(t, w.otherOwnerId, fb);
    expect(milkA.groupId).not.toBe(milkB.groupId);

    await as(t, w.ownerId).mutation(api.menuArticleOptions.updateAddonGroup, {
      groupId: milkA.groupId,
      expected: { name: "Mleko" },
      patch: { name: "Mleko A" },
    });
    expect(namesOf(await optionsView(t, w.otherOwnerId, fb.kafaId))).toEqual(["Mleko"]);
    expect(
      (
        await as(t, w.otherOwnerId).query(api.menuArticleOptions.listAddonGroups, {
          menuServiceId: w.b.menuServiceId,
        })
      )?.map((g) => g.name),
    ).toEqual(["Mleko"]);
    expect(
      (
        await as(t, w.ownerId).query(api.menuArticleOptions.listAddonGroups, {
          menuServiceId: w.a.menuServiceId,
        })
      )?.map((g) => g.name),
    ).toEqual(["Mleko A"]);
    expect((await snapshot(t, w.a.menuServiceId)).groups).toHaveLength(1);
    expect((await snapshot(t, w.b.menuServiceId)).groups).toHaveLength(1);
  });
});
