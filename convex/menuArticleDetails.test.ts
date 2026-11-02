/// <reference types="vite/client" />

// ScanMe Menu V1 — K04: allergens and tags (master §7.3, §5.5), the deletion of
// a shared article with its consequences (§5.6) and the publish issues of one
// article (§5.5). Content is created through the real catalog mutations; rows
// that belong to other K04 modules (combos, variants, add-ons, Room service,
// availability) are inserted directly.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type { MenuAllergenCode } from "../lib/menu/allergens";
import { deletionConfirmToken, type ArticleDeletionImpact } from "../lib/menu/deletion";
import { ARTICLE_ERROR } from "../lib/menu/errors/article";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import { MENU_MAX_PLACEMENTS_PER_ARTICLE, MENU_TEXT } from "../lib/menu/limits";
import { normalizeArticleName } from "../lib/menu/text";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";
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

const D = api.menuArticleDetails;

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

// -----------------------------------------------------------------------------
// Content through the real mutations
// -----------------------------------------------------------------------------

/** A second standard page inserted directly (like menuCatalog.test.ts). */
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
) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

/** Tenant A: "Pića" with one article "Vranac" at 250 (`null` = no price). */
async function oneArticle(t: T, w: MenuWorldSeed, priceRsd: number | null = 250) {
  const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
  const created = await quickAdd(t, w.ownerId, section.sectionId, "Vranac", priceRsd ?? undefined);
  return {
    sectionId: section.sectionId,
    articleId: created.articleId,
    key: created.key,
    placementId: created.placementId,
  };
}

/** Another article in the first section of tenant A's world. */
async function anotherArticle(t: T, w: MenuWorldSeed, name: string, priceRsd: number) {
  const sections = await t.run(async (ctx) =>
    ctx.db
      .query("menuSections")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
      .take(1),
  );
  const created = await quickAdd(t, w.ownerId, sections[0]._id, name, priceRsd);
  return { articleId: created.articleId, key: created.key };
}

// -----------------------------------------------------------------------------
// Rows owned by other K04 modules
// -----------------------------------------------------------------------------

async function insertCombo(
  t: T,
  menuServiceId: Id<"menuServices">,
  name: string,
  components: Id<"menuArticles">[],
  extra: { priceCheck?: boolean } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const key = newMenuKey("article");
    const comboId = await ctx.db.insert("menuArticles", {
      menuServiceId,
      key,
      kind: "combo",
      name,
      nameNormalized: normalizeArticleName(name),
      basePriceRsd: 900,
      mediaMode: "none",
      ...(extra.priceCheck
        ? { priceCheck: { since: now, changedComponentKeys: [], removedComponentNames: ["Stari"] } }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
    for (const [index, componentArticleId] of components.entries()) {
      await ctx.db.insert("menuComboComponents", {
        menuServiceId,
        comboArticleId: comboId,
        componentArticleId,
        quantity: 1,
        order: (index + 1) * 1024,
        createdAt: now,
      });
    }
    return { comboId, key };
  });
}

async function insertVariant(
  t: T,
  menuServiceId: Id<"menuServices">,
  articleId: Id<"menuArticles">,
  name: string,
  priceRsd: number | null,
  order = 1024,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const key = newMenuKey("variant");
    const variantId = await ctx.db.insert("menuVariants", {
      menuServiceId,
      articleId,
      key,
      name,
      ...(priceRsd !== null ? { priceRsd } : {}),
      order,
      createdAt: now,
      updatedAt: now,
    });
    return { variantId, key };
  });
}

async function insertGroup(
  t: T,
  menuServiceId: Id<"menuServices">,
  input: {
    name: string;
    optionCount: number;
    linkCount: number;
    selection?: "single" | "multiple";
    required?: boolean;
    minSelect?: number;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const key = newMenuKey("addonGroup");
    const groupId = await ctx.db.insert("menuAddonGroups", {
      menuServiceId,
      key,
      name: input.name,
      selection: input.selection ?? "multiple",
      required: input.required ?? false,
      ...(input.minSelect !== undefined ? { minSelect: input.minSelect } : {}),
      linkCount: input.linkCount,
      createdAt: now,
      updatedAt: now,
    });
    for (let index = 0; index < input.optionCount; index += 1) {
      await ctx.db.insert("menuAddonOptions", {
        menuServiceId,
        groupId,
        key: newMenuKey("addonOption"),
        name: `Dodatak ${index + 1}`,
        priceDeltaRsd: 20,
        order: (index + 1) * 1024,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { groupId, key };
  });
}

async function linkGroup(
  t: T,
  menuServiceId: Id<"menuServices">,
  articleId: Id<"menuArticles">,
  groupId: Id<"menuAddonGroups">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuArticleAddonGroups", {
      menuServiceId,
      articleId,
      groupId,
      order: 1024,
      createdAt: Date.now(),
    }),
  );
}

async function insertRoomService(
  t: T,
  menuServiceId: Id<"menuServices">,
  articleId: Id<"menuArticles">,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const categoryId = await ctx.db.insert("menuRoomServiceCategories", {
      menuServiceId,
      key: newMenuKey("roomServiceCategory"),
      name: "Hrana u sobu",
      order: 1024,
      createdAt: now,
      updatedAt: now,
    });
    const itemId = await ctx.db.insert("menuRoomServiceItems", {
      menuServiceId,
      categoryId,
      articleId,
      order: 1024,
      markupApplies: false,
      createdAt: now,
      updatedAt: now,
    });
    return { categoryId, itemId };
  });
}

async function markUnavailable(t: T, menuServiceId: Id<"menuServices">, articleKey: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuAvailability", { menuServiceId, articleKey, since: Date.now() }),
  );
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

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

async function articleDoc(t: T, articleId: Id<"menuArticles">) {
  return await t.run(async (ctx) => ctx.db.get(articleId));
}

async function pageDoc(t: T, pageId: Id<"menuPages">) {
  const page = await t.run(async (ctx) => ctx.db.get(pageId));
  if (!page) throw new Error("page missing");
  return page;
}

/** Everything the functions under test may write for one service, to prove "nothing changed". */
async function world(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => ({
    service: await ctx.db.get(menuServiceId),
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
    components: await ctx.db
      .query("menuComboComponents")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    roomServiceItems: await ctx.db
      .query("menuRoomServiceItems")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    availability: await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    audit: await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}

async function auditRows(t: T, menuServiceId: Id<"menuServices">, action: string) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.filter((row) => row.action === action);
}

async function issues(t: T, userId: Id<"users">, articleId: Id<"menuArticles">) {
  const result = await as(t, userId).query(D.articleIssues, { articleId });
  if (!result) throw new Error("articleIssues returned null");
  return result;
}

async function enableAllergens(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  return await as(t, userId).mutation(D.setAllergensEnabled, { menuServiceId, enabled: true });
}

type AllergenInput = {
  contains: MenuAllergenCode[];
  mayContain: MenuAllergenCode[];
  otherText?: string;
} | null;

function setAllergens(
  t: T,
  userId: Id<"users">,
  articleId: Id<"menuArticles">,
  expected: AllergenInput,
  allergens: AllergenInput,
) {
  return as(t, userId).mutation(D.setArticleAllergens, { articleId, expected, allergens });
}

/** The confirm token of a deletion, taken from the first (token-less) call. */
async function confirmTokenOf(t: T, userId: Id<"users">, articleId: Id<"menuArticles">) {
  const result = await as(t, userId).mutation(D.deleteArticle, { articleId });
  if (result.status !== "confirm") throw new Error("expected a confirm answer");
  return result.confirmToken;
}

// =============================================================================
// Allergens
// =============================================================================

describe("allergens (master §7.3)", () => {
  test("off by default: a record cannot be set, clearing is still allowed, nothing is touched", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    expect(await as(t, w.ownerId).query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toEqual({
      enabled: false,
    });
    const before = await world(t, w.a.menuServiceId);

    await expect(
      setAllergens(t, w.ownerId, f.articleId, null, { contains: ["milk"], mayContain: [] }),
    ).rejects.toThrow(ARTICLE_ERROR.allergensDisabled);
    await expect(
      setAllergens(t, w.ownerId, f.articleId, null, { contains: [], mayContain: ["nuts"] }),
    ).rejects.toThrow(ARTICLE_ERROR.allergensDisabled);
    expect(await world(t, w.a.menuServiceId)).toEqual(before);

    // Clearing (null) is always allowed; with no record it is a no-op.
    expect(await setAllergens(t, w.ownerId, f.articleId, null, null)).toEqual({ ok: true });
    expect(await world(t, w.a.menuServiceId)).toEqual(before);
  });

  test("setAllergensEnabled goes through the draft once, keeps the other settings and is a no-op when equal", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, {
        settings: { languages: { source: "sr", translations: ["en"] } },
      });
    });
    const owner = as(t, w.ownerId);
    const settingsOf = async () =>
      (await t.run(async (ctx) => ctx.db.get(w.a.menuServiceId)))?.settings;
    const start = await draftOf(t, w.a.menuServiceId);

    // Absent = off: switching off is already the state.
    expect(await owner.mutation(D.setAllergensEnabled, { menuServiceId: w.a.menuServiceId, enabled: false })).toEqual({ ok: true });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(start.revision);
    expect(await settingsOf()).toEqual({ languages: { source: "sr", translations: ["en"] } });

    expect(await enableAllergens(t, w.ownerId, w.a.menuServiceId)).toEqual({ ok: true });
    const on = await draftOf(t, w.a.menuServiceId);
    expect(on.revision).toBe(start.revision + 1);
    expect(on.lastEditByUserId).toBe(w.ownerId);
    expect(await settingsOf()).toEqual({
      languages: { source: "sr", translations: ["en"] },
      allergensEnabled: true,
    });
    expect(await owner.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toEqual({
      enabled: true,
    });

    await enableAllergens(t, w.ownerId, w.a.menuServiceId);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(on.revision);

    await owner.mutation(D.setAllergensEnabled, { menuServiceId: w.a.menuServiceId, enabled: false });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(on.revision + 1);
    expect(await settingsOf()).toEqual({
      languages: { source: "sr", translations: ["en"] },
      allergensEnabled: false,
    });
    expect(await owner.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toEqual({
      enabled: false,
    });
  });

  test("contains and mayContain are normalized: unique, canonical order, overlap stays in contains", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await enableAllergens(t, w.ownerId, w.a.menuServiceId);
    const before = await draftOf(t, w.a.menuServiceId);

    const result = await setAllergens(t, w.ownerId, f.articleId, null, {
      contains: ["milk", "gluten", "milk"],
      mayContain: ["gluten", "nuts", "eggs", "nuts"],
    });
    expect(result).toEqual({ ok: true });

    const article = await articleDoc(t, f.articleId);
    expect(article?.allergens).toStrictEqual({
      contains: ["gluten", "milk"],
      mayContain: ["eggs", "nuts"],
    });
    expect(article?.updatedByUserId).toBe(w.ownerId);
    const after = await draftOf(t, w.a.menuServiceId);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.lastEditByUserId).toBe(w.ownerId);

    // The same content again (any order) is a no-op: no write, no revision.
    expect(
      await setAllergens(
        t,
        w.ownerId,
        f.articleId,
        { contains: ["gluten", "milk"], mayContain: ["eggs", "nuts"] },
        { contains: ["milk", "gluten"], mayContain: ["nuts", "eggs", "milk"] },
      ),
    ).toEqual({ ok: true });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(after.revision);
  });

  test("'Drugo' (other) must say what it is; the text is cleaned, bounded and dropped when other is not listed", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await enableAllergens(t, w.ownerId, w.a.menuServiceId);
    const before = await world(t, w.a.menuServiceId);

    const invalid: AllergenInput[] = [
      { contains: ["other"], mayContain: [] },
      { contains: ["other"], mayContain: [], otherText: "   " },
      { contains: [], mayContain: ["other"] },
      { contains: ["other"], mayContain: [], otherText: "x".repeat(MENU_TEXT.allergenOtherText + 1) },
      { contains: ["milk"], mayContain: [], otherText: "x".repeat(MENU_TEXT.allergenOtherText + 1) },
    ];
    for (const allergens of invalid) {
      await expect(setAllergens(t, w.ownerId, f.articleId, null, allergens)).rejects.toThrow(
        MENU_ERROR.invalidInput,
      );
    }
    expect(await world(t, w.a.menuServiceId)).toEqual(before);

    expect(
      await setAllergens(t, w.ownerId, f.articleId, null, {
        contains: ["other"],
        mayContain: ["fish"],
        otherText: "  Lešnik   krem  ",
      }),
    ).toEqual({ ok: true });
    expect((await articleDoc(t, f.articleId))?.allergens).toStrictEqual({
      contains: ["other"],
      mayContain: ["fish"],
      otherText: "Lešnik krem",
    });

    // The text at exactly the limit is fine.
    const atLimit = "x".repeat(MENU_TEXT.allergenOtherText);
    expect(
      await setAllergens(
        t,
        w.ownerId,
        f.articleId,
        { contains: ["other"], mayContain: ["fish"], otherText: "Lešnik krem" },
        { contains: [], mayContain: ["other"], otherText: atLimit },
      ),
    ).toEqual({ ok: true });
    expect((await articleDoc(t, f.articleId))?.allergens?.otherText).toBe(atLimit);

    // No 'other' in the lists: the text is dropped.
    expect(
      await setAllergens(
        t,
        w.ownerId,
        f.articleId,
        { contains: [], mayContain: ["other"], otherText: atLimit },
        { contains: ["milk"], mayContain: [], otherText: "bilo šta" },
      ),
    ).toEqual({ ok: true });
    expect((await articleDoc(t, f.articleId))?.allergens).toStrictEqual({
      contains: ["milk"],
      mayContain: [],
    });
  });

  test("two empty lists REMOVE the record: absent means unknown, never 'contains nothing'", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await enableAllergens(t, w.ownerId, w.a.menuServiceId);

    // With no record, empty lists change nothing.
    const untouched = await world(t, w.a.menuServiceId);
    expect(
      await setAllergens(t, w.ownerId, f.articleId, null, { contains: [], mayContain: [] }),
    ).toEqual({ ok: true });
    expect(await world(t, w.a.menuServiceId)).toEqual(untouched);

    const record = { contains: ["milk" as const], mayContain: [] };
    await setAllergens(t, w.ownerId, f.articleId, null, record);
    expect((await articleDoc(t, f.articleId))?.allergens).toStrictEqual(record);
    const before = await draftOf(t, w.a.menuServiceId);

    expect(
      await setAllergens(t, w.ownerId, f.articleId, record, {
        contains: [],
        mayContain: [],
        otherText: "ostalo",
      }),
    ).toEqual({ ok: true });
    const article = await articleDoc(t, f.articleId);
    expect(article).not.toBeNull();
    expect("allergens" in (article ?? {})).toBe(false);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(before.revision + 1);
  });

  test("null clears the record, also while allergens are off", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await enableAllergens(t, w.ownerId, w.a.menuServiceId);
    const record = { contains: ["eggs" as const], mayContain: ["nuts" as const] };
    await setAllergens(t, w.ownerId, f.articleId, null, record);

    const before = await draftOf(t, w.a.menuServiceId);
    expect(await setAllergens(t, w.ownerId, f.articleId, record, null)).toEqual({ ok: true });
    expect("allergens" in ((await articleDoc(t, f.articleId)) ?? {})).toBe(false);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(before.revision + 1);

    // And while the system is off.
    await setAllergens(t, w.ownerId, f.articleId, null, record);
    await as(t, w.ownerId).mutation(D.setAllergensEnabled, {
      menuServiceId: w.a.menuServiceId,
      enabled: false,
    });
    expect(await setAllergens(t, w.ownerId, f.articleId, record, null)).toEqual({ ok: true });
    expect("allergens" in ((await articleDoc(t, f.articleId)) ?? {})).toBe(false);
  });

  test("compare-and-set: a conflict writes nothing and returns the current record; expected is normalized", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await enableAllergens(t, w.ownerId, w.a.menuServiceId);

    // Someone else (the manager) saved first.
    await setAllergens(t, w.managerId, f.articleId, null, { contains: ["milk"], mayContain: [] });
    const before = await world(t, w.a.menuServiceId);

    const stale = await setAllergens(t, w.ownerId, f.articleId, null, {
      contains: ["eggs"],
      mayContain: [],
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["allergens"],
      current: { allergens: { contains: ["milk"], mayContain: [] } },
      attempted: { allergens: { contains: ["eggs"], mayContain: [] } },
    });
    // A stale clear conflicts too.
    expect(await setAllergens(t, w.ownerId, f.articleId, null, null)).toMatchObject({
      ok: false,
      conflicts: ["allergens"],
    });
    expect(await world(t, w.a.menuServiceId)).toEqual(before);

    // The retry with the value it now sees works.
    expect(
      await setAllergens(
        t,
        w.ownerId,
        f.articleId,
        { contains: ["milk"], mayContain: [] },
        { contains: ["eggs"], mayContain: [] },
      ),
    ).toEqual({ ok: true });
    expect((await articleDoc(t, f.articleId))?.allergens).toStrictEqual({
      contains: ["eggs"],
      mayContain: [],
    });

    // `expected` is compared in its normalized form: duplicates, order and overlap do not matter.
    await setAllergens(
      t,
      w.ownerId,
      f.articleId,
      { contains: ["eggs"], mayContain: [] },
      { contains: ["milk", "gluten"], mayContain: ["eggs", "nuts"] },
    );
    expect(
      await setAllergens(
        t,
        w.ownerId,
        f.articleId,
        { contains: ["milk", "gluten", "milk"], mayContain: ["nuts", "eggs", "gluten"] },
        null,
      ),
    ).toEqual({ ok: true });
    expect("allergens" in ((await articleDoc(t, f.articleId)) ?? {})).toBe(false);

    // A conflict against "no record".
    expect(
      await setAllergens(t, w.ownerId, f.articleId, { contains: ["fish"], mayContain: [] }, null),
    ).toEqual({ ok: false, conflicts: ["allergens"], current: { allergens: null }, attempted: { allergens: null } });
  });

  test("switching the system off keeps every stored record; new records are refused until it is on again", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await enableAllergens(t, w.ownerId, w.a.menuServiceId);
    await setAllergens(t, w.ownerId, f.articleId, null, { contains: ["gluten"], mayContain: ["nuts"] });

    await as(t, w.ownerId).mutation(D.setAllergensEnabled, {
      menuServiceId: w.a.menuServiceId,
      enabled: false,
    });
    expect((await articleDoc(t, f.articleId))?.allergens).toStrictEqual({
      contains: ["gluten"],
      mayContain: ["nuts"],
    });
    await expect(
      setAllergens(
        t,
        w.ownerId,
        f.articleId,
        { contains: ["gluten"], mayContain: ["nuts"] },
        { contains: ["milk"], mayContain: [] },
      ),
    ).rejects.toThrow(ARTICLE_ERROR.allergensDisabled);

    await enableAllergens(t, w.ownerId, w.a.menuServiceId);
    expect((await articleDoc(t, f.articleId))?.allergens).toStrictEqual({
      contains: ["gluten"],
      mayContain: ["nuts"],
    });
  });
});

// =============================================================================
// Tags
// =============================================================================

describe("tags (master §5.5)", () => {
  test("stored unique and in canonical order; the same set again is a no-op; an empty list removes the field", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    const owner = as(t, w.ownerId);
    const before = await draftOf(t, w.a.menuServiceId);

    expect(
      await owner.mutation(D.setArticleTags, {
        articleId: f.articleId,
        expected: [],
        tags: ["spicy", "vegan", "spicy", "new"],
      }),
    ).toEqual({ ok: true });
    expect((await articleDoc(t, f.articleId))?.tags).toStrictEqual(["vegan", "spicy", "new"]);
    const after = await draftOf(t, w.a.menuServiceId);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.lastEditByUserId).toBe(w.ownerId);

    // The same set in another order: nothing to write.
    expect(
      await owner.mutation(D.setArticleTags, {
        articleId: f.articleId,
        expected: ["new", "vegan", "spicy"],
        tags: ["new", "spicy", "vegan"],
      }),
    ).toEqual({ ok: true });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(after.revision);

    expect(
      await owner.mutation(D.setArticleTags, {
        articleId: f.articleId,
        expected: ["vegan", "spicy", "new"],
        tags: [],
      }),
    ).toEqual({ ok: true });
    expect("tags" in ((await articleDoc(t, f.articleId)) ?? {})).toBe(false);
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(after.revision + 1);

    // Clearing an article without tags is a no-op.
    expect(
      await owner.mutation(D.setArticleTags, { articleId: f.articleId, expected: [], tags: [] }),
    ).toEqual({ ok: true });
    expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(after.revision + 1);
  });

  test("compare-and-set: a stale expected list conflicts and writes nothing; expected is normalized", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await as(t, w.managerId).mutation(D.setArticleTags, {
      articleId: f.articleId,
      expected: [],
      tags: ["vegan", "spicy"],
    });
    const before = await world(t, w.a.menuServiceId);

    const stale = await as(t, w.ownerId).mutation(D.setArticleTags, {
      articleId: f.articleId,
      expected: [],
      tags: ["homemade"],
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(stale).toEqual({
      ok: false,
      conflicts: ["tags"],
      current: { tags: ["vegan", "spicy"] },
      attempted: { tags: ["homemade"] },
    });
    expect(await world(t, w.a.menuServiceId)).toEqual(before);

    expect(
      await as(t, w.ownerId).mutation(D.setArticleTags, {
        articleId: f.articleId,
        expected: ["spicy", "vegan", "spicy"],
        tags: ["homemade"],
      }),
    ).toEqual({ ok: true });
    expect((await articleDoc(t, f.articleId))?.tags).toStrictEqual(["homemade"]);
  });

  test("a value outside the closed list is refused by the validator", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    const before = await world(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(D.setArticleTags, {
        articleId: f.articleId,
        expected: [],
        // "gluten_free" is deliberately not a tag (safety claims belong to the allergen system).
        tags: ["gluten_free" as never],
      }),
    ).rejects.toThrow();
    expect(await world(t, w.a.menuServiceId)).toEqual(before);
  });
});

// =============================================================================
// Deletion with consequences (master §5.6)
// =============================================================================

/**
 * Tenant A. "Vranac" (250) on two pages ("Kompletan meni" / "Rakije" and
 * "Vinska karta" / "Vina"), inside the combo "Vinski set", in Room service,
 * unavailable, with one variant and an add-on link; "Pelinkovac" shares the
 * add-on group "Led" (linkCount 2) and sits on the default page.
 */
async function deletionFixture(t: T, w: MenuWorldSeed) {
  const menuServiceId = w.a.menuServiceId;
  const barSection = await addSection(t, w.ownerId, w.a.defaultPageId, "Rakije");
  const winePageId = await secondPage(t, menuServiceId);
  const wineSection = await addSection(t, w.ownerId, winePageId, "Vina");
  const vranac = await quickAdd(t, w.ownerId, barSection.sectionId, "Vranac", 250);
  const pelinkovac = await quickAdd(t, w.ownerId, barSection.sectionId, "Pelinkovac", 180);
  await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
    sectionId: wineSection.sectionId,
    articleId: vranac.articleId,
  });

  const combo = await insertCombo(t, menuServiceId, "Vinski set", [vranac.articleId]);
  const variant = await insertVariant(t, menuServiceId, vranac.articleId, "0,2 l", 250);
  const group = await insertGroup(t, menuServiceId, { name: "Led", optionCount: 2, linkCount: 2 });
  await linkGroup(t, menuServiceId, vranac.articleId, group.groupId);
  const otherLinkId = await linkGroup(t, menuServiceId, pelinkovac.articleId, group.groupId);
  const roomService = await insertRoomService(t, menuServiceId, vranac.articleId);
  const availabilityId = await markUnavailable(t, menuServiceId, vranac.key);

  return {
    barSectionId: barSection.sectionId,
    wineSectionId: wineSection.sectionId,
    winePageId,
    articleId: vranac.articleId,
    key: vranac.key,
    otherArticleId: pelinkovac.articleId,
    comboId: combo.comboId,
    comboKey: combo.key,
    variantId: variant.variantId,
    groupId: group.groupId,
    otherLinkId,
    categoryId: roomService.categoryId,
    roomServiceItemId: roomService.itemId,
    availabilityId,
  };
}

describe("deleting a shared article (master §5.6)", () => {
  test("the impact lists the pages by name, the combo by name and every row that would go", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);

    const impact = await as(t, w.ownerId).query(D.articleDeletionImpact, { articleId: f.articleId });
    expect(impact).not.toBeNull();
    expect(impact).toMatchObject({
      articleKey: f.key,
      articleId: f.articleId,
      name: "Vranac",
      kind: "item",
      placementCount: 2,
      comboComponents: 0,
      variants: 1,
      addonGroupLinks: 1,
      inRoomService: true,
      unavailable: true,
    });
    expect(impact?.pages.map((page) => [page.name, page.placements, page.archived])).toEqual([
      [menuDomenSr.defaultPageName, 1, false],
      ["Vinska karta", 1, false],
    ]);
    expect(impact?.combos).toEqual([{ articleKey: f.comboKey, name: "Vinski set" }]);

    const bare: ArticleDeletionImpact = {
      articleKey: impact?.articleKey ?? "",
      pages: impact?.pages ?? [],
      combos: impact?.combos ?? [],
      comboComponents: impact?.comboComponents ?? 0,
      variants: impact?.variants ?? 0,
      addonGroupLinks: impact?.addonGroupLinks ?? 0,
      inRoomService: impact?.inRoomService ?? false,
      unavailable: impact?.unavailable ?? false,
    };
    expect(impact?.confirmToken).toBe(deletionConfirmToken(bare));
  });

  test("the FIRST call (no token) answers 'confirm' with both pages and the combo, and deletes NOTHING", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    const before = await world(t, w.a.menuServiceId);

    const result = await as(t, w.ownerId).mutation(D.deleteArticle, { articleId: f.articleId });
    expect(result.status).toBe("confirm");
    if (result.status !== "confirm") return;
    expect(result.impact.pages.map((page) => page.name)).toEqual([
      menuDomenSr.defaultPageName,
      "Vinska karta",
    ]);
    expect(result.impact.combos).toEqual([{ articleKey: f.comboKey, name: "Vinski set" }]);
    const query = await as(t, w.ownerId).query(D.articleDeletionImpact, { articleId: f.articleId });
    expect(result.confirmToken).toBe(query?.confirmToken);

    // Nothing was written: not even the draft revision or an audit row.
    expect(await world(t, w.a.menuServiceId)).toEqual(before);
    expect(await articleDoc(t, f.articleId)).not.toBeNull();
    expect(await auditRows(t, w.a.menuServiceId, "article.deleted")).toEqual([]);

    // A token that matches nothing behaves like no token.
    const garbage = await as(t, w.ownerId).mutation(D.deleteArticle, {
      articleId: f.articleId,
      confirmToken: "nije-token",
    });
    expect(garbage.status).toBe("confirm");
    expect(await world(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a STALE token (the impact changed after the client saw it) confirms again with the new impact", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    const stale = await confirmTokenOf(t, w.ownerId, f.articleId);

    // The article gets one more appearance after the client looked.
    const extra = await addSection(t, w.ownerId, w.a.defaultPageId, "Dodatno");
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: extra.sectionId,
      articleId: f.articleId,
    });
    const before = await world(t, w.a.menuServiceId);

    const result = await as(t, w.ownerId).mutation(D.deleteArticle, {
      articleId: f.articleId,
      confirmToken: stale,
    });
    expect(result.status).toBe("confirm");
    if (result.status !== "confirm") return;
    expect(result.confirmToken).not.toBe(stale);
    expect(result.impact.pages.map((page) => [page.name, page.placements])).toEqual([
      [menuDomenSr.defaultPageName, 2],
      ["Vinska karta", 1],
    ]);
    expect(await world(t, w.a.menuServiceId)).toEqual(before);

    // The new token deletes all three appearances.
    const done = await as(t, w.ownerId).mutation(D.deleteArticle, {
      articleId: f.articleId,
      confirmToken: result.confirmToken,
    });
    expect(done.status).toBe("deleted");
    expect((await pageDoc(t, w.a.defaultPageId)).placementCount).toBe(1); // only Pelinkovac is left
    expect((await pageDoc(t, f.winePageId)).placementCount).toBe(0);
  });

  test("with the right token the article and ALL its rows go, in one transaction", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    const token = await confirmTokenOf(t, w.ownerId, f.articleId);
    const before = await draftOf(t, w.a.menuServiceId);
    expect((await pageDoc(t, w.a.defaultPageId)).placementCount).toBe(2);
    expect((await pageDoc(t, f.winePageId)).placementCount).toBe(1);

    const result = await as(t, w.ownerId).mutation(D.deleteArticle, {
      articleId: f.articleId,
      confirmToken: token,
    });
    expect(result.status).toBe("deleted");
    if (result.status !== "deleted") return;
    expect(result.impact.articleKey).toBe(f.key);

    const rows = await world(t, w.a.menuServiceId);
    // The article, its appearances, variant, add-on link and Room service row are gone.
    expect(rows.articles.map((article) => article._id)).not.toContain(f.articleId);
    expect(rows.placements.filter((placement) => placement.articleId === f.articleId)).toEqual([]);
    expect(rows.variants).toEqual([]);
    expect(rows.links.map((link) => link._id)).toEqual([f.otherLinkId]);
    expect(rows.roomServiceItems).toEqual([]);
    // K05 (intended change): the availability row is live state of the PUBLISHED
    // menu, which still shows the article until Objavi; publish removes it.
    expect(rows.availability.map((row) => row._id)).toEqual([f.availabilityId]);
    // Page counters follow.
    expect((await pageDoc(t, w.a.defaultPageId)).placementCount).toBe(1);
    expect((await pageDoc(t, f.winePageId)).placementCount).toBe(0);
    // The shared add-on group stays with one link left; its options stay.
    expect(rows.groups).toHaveLength(1);
    expect(rows.groups[0]._id).toBe(f.groupId);
    expect(rows.groups[0].linkCount).toBe(1);
    expect(rows.options).toHaveLength(2);
    // Room service's category stays; only the article's row went.
    const category = await t.run(async (ctx) => ctx.db.get(f.categoryId));
    expect(category).not.toBeNull();
    // The other articles and the structure are untouched.
    expect(rows.articles.map((article) => article._id)).toContain(f.otherArticleId);
    expect(rows.sections).toHaveLength(2);
    expect(rows.pages).toHaveLength(2);

    // The combo lost the component and was flagged with the deleted name; its price is untouched.
    expect(rows.components).toEqual([]);
    const combo = await articleDoc(t, f.comboId);
    expect(combo?.basePriceRsd).toBe(900);
    expect(combo?.priceCheck).toEqual({
      since: expect.any(Number),
      changedComponentKeys: [],
      removedComponentNames: ["Vranac"],
    });

    // Draft: one revision, one article fewer.
    const after = await draftOf(t, w.a.menuServiceId);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount - 1);
    expect(after.lastEditByUserId).toBe(w.ownerId);

    // Exactly one audit row.
    const audit = await auditRows(t, w.a.menuServiceId, "article.deleted");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "menuArticles",
      entityKey: f.key,
      details: { name: "Vranac", pages: 2, placements: 2, combos: 1 },
    });

    // The article is gone for the readers too.
    expect(await as(t, w.ownerId).query(D.articleDeletionImpact, { articleId: f.articleId })).toBeNull();
    expect(await as(t, w.ownerId).query(D.articleIssues, { articleId: f.articleId })).toBeNull();
    await expect(
      as(t, w.ownerId).mutation(D.deleteArticle, { articleId: f.articleId, confirmToken: token }),
    ).rejects.toThrow(MENU_ERROR.notFound);
  });

  test("an article with more placements than one deletion may remove is refused before any write", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_PLACEMENTS_PER_ARTICLE; index += 1) {
        await ctx.db.insert("menuPlacements", {
          menuServiceId: w.a.menuServiceId,
          pageId: w.a.defaultPageId,
          sectionId: f.sectionId,
          articleId: f.articleId,
          order: (index + 2) * 1024,
          visibility: "visible",
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const before = await draftOf(t, w.a.menuServiceId);

    await expect(
      as(t, w.ownerId).mutation(D.deleteArticle, { articleId: f.articleId }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(
      as(t, w.ownerId).mutation(D.deleteArticle, { articleId: f.articleId, confirmToken: "x" }),
    ).rejects.toThrow(MENU_ERROR.limitReached);

    expect(await articleDoc(t, f.articleId)).not.toBeNull();
    const placements = await t.run(async (ctx) =>
      ctx.db
        .query("menuPlacements")
        .withIndex("by_articleId", (q) => q.eq("articleId", f.articleId))
        .collect(),
    );
    expect(placements).toHaveLength(MENU_MAX_PLACEMENTS_PER_ARTICLE + 1);
    expect(await draftOf(t, w.a.menuServiceId)).toEqual(before);
  });

  test("deleting a combo removes its own components and leaves the component articles alone", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: f.barSectionId,
      articleId: f.comboId,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("menuComboComponents", {
        menuServiceId: w.a.menuServiceId,
        comboArticleId: f.comboId,
        componentArticleId: f.otherArticleId,
        quantity: 2,
        order: 2048,
        createdAt: Date.now(),
      });
    });

    const impact = await as(t, w.ownerId).query(D.articleDeletionImpact, { articleId: f.comboId });
    expect(impact).toMatchObject({ kind: "combo", comboComponents: 2, placementCount: 1, combos: [] });
    const token = await confirmTokenOf(t, w.ownerId, f.comboId);
    const result = await as(t, w.ownerId).mutation(D.deleteArticle, {
      articleId: f.comboId,
      confirmToken: token,
    });
    expect(result.status).toBe("deleted");

    const rows = await world(t, w.a.menuServiceId);
    expect(rows.articles.map((article) => article._id)).toEqual(
      expect.arrayContaining([f.articleId, f.otherArticleId]),
    );
    expect(rows.articles.map((article) => article._id)).not.toContain(f.comboId);
    expect(rows.components).toEqual([]);
    // Components of a deleted combo are not "changed": no flag anywhere.
    expect(rows.articles.every((article) => article.priceCheck === undefined)).toBe(true);
    expect((await pageDoc(t, w.a.defaultPageId)).placementCount).toBe(2);
    const audit = await auditRows(t, w.a.menuServiceId, "article.deleted");
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ name: "Vinski set", pages: 1, placements: 1, combos: 0 });
  });

  test("an article that is nowhere (no page, no combo, no extras) is deleted with an empty impact", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, { placementId: f.placementId });

    const impact = await as(t, w.ownerId).query(D.articleDeletionImpact, { articleId: f.articleId });
    expect(impact).toMatchObject({
      pages: [],
      combos: [],
      comboComponents: 0,
      variants: 0,
      addonGroupLinks: 0,
      inRoomService: false,
      unavailable: false,
      placementCount: 0,
    });
    const before = await draftOf(t, w.a.menuServiceId);
    const done = await as(t, w.ownerId).mutation(D.deleteArticle, {
      articleId: f.articleId,
      confirmToken: impact?.confirmToken,
    });
    expect(done.status).toBe("deleted");
    expect(await articleDoc(t, f.articleId)).toBeNull();
    const after = await draftOf(t, w.a.menuServiceId);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.articleCount).toBe(before.articleCount - 1);
  });
});

describe("deletionConfirmToken", () => {
  const impact: ArticleDeletionImpact = {
    articleKey: "ar_aaaaaaaaaaaa",
    pages: [
      { pageKey: "pg_bbbbbbbbbbbb", name: "Vinska karta", archived: false, placements: 1 },
      { pageKey: "pg_aaaaaaaaaaaa", name: "Kompletan meni", archived: false, placements: 2 },
    ],
    combos: [
      { articleKey: "ar_ccccccccccc2", name: "Drugi set" },
      { articleKey: "ar_ccccccccccc1", name: "Vinski set" },
    ],
    comboComponents: 0,
    variants: 1,
    addonGroupLinks: 1,
    inRoomService: true,
    unavailable: false,
  };

  test("same impact, same token; order and names do not matter", () => {
    const token = deletionConfirmToken(impact);
    expect(typeof token).toBe("string");
    expect(deletionConfirmToken({ ...impact })).toBe(token);
    expect(
      deletionConfirmToken({
        ...impact,
        pages: [...impact.pages].reverse(),
        combos: [...impact.combos].reverse(),
      }),
    ).toBe(token);
    expect(
      deletionConfirmToken({
        ...impact,
        pages: impact.pages.map((page) => ({ ...page, name: `${page.name} (preimenovana)` })),
        combos: impact.combos.map((combo) => ({ ...combo, name: "Preimenovan" })),
      }),
    ).toBe(token);
  });

  test("any change of what is removed gives a different token", () => {
    const token = deletionConfirmToken(impact);
    const changes: ArticleDeletionImpact[] = [
      { ...impact, articleKey: "ar_zzzzzzzzzzzz" },
      { ...impact, pages: [{ ...impact.pages[0], placements: 2 }, impact.pages[1]] },
      { ...impact, pages: [impact.pages[0]] },
      {
        ...impact,
        pages: [...impact.pages, { pageKey: "pg_cccccccccccc", name: "Treća", archived: false, placements: 1 }],
      },
      { ...impact, pages: [{ ...impact.pages[0], pageKey: "pg_dddddddddddd" }, impact.pages[1]] },
      { ...impact, combos: [impact.combos[0]] },
      { ...impact, combos: [...impact.combos, { articleKey: "ar_ccccccccccc3", name: "Treći" }] },
      { ...impact, comboComponents: 1 },
      { ...impact, variants: 2 },
      { ...impact, addonGroupLinks: 0 },
      { ...impact, inRoomService: false },
      { ...impact, unavailable: true },
    ];
    const tokens = changes.map(deletionConfirmToken);
    for (const changed of tokens) expect(changed).not.toBe(token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

// =============================================================================
// Publish issues of one article
// =============================================================================

describe("articleIssues (master §5.5)", () => {
  test("a shown article without a price is kept in the draft, is public and has the error price_missing; hiding it removes the error; the price fixes it", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, null);

    const stored = await articleDoc(t, f.articleId);
    expect(stored).not.toBeNull();
    expect(stored?.basePriceRsd).toBeUndefined();
    expect((await draftOf(t, w.a.menuServiceId)).articleCount).toBe(1);

    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "public",
      errors: [{ code: "price_missing", articleKey: f.key }],
      warnings: [],
    });

    await as(t, w.ownerId).mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: f.placementId,
      visibility: "hidden",
    });
    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "hidden",
      errors: [],
      warnings: [],
    });

    await as(t, w.ownerId).mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: f.placementId,
      visibility: "visible",
    });
    expect((await issues(t, w.ownerId, f.articleId)).errors).toHaveLength(1);
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.articleId,
      expectedPriceRsd: null,
      priceRsd: 120,
    });
    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "public",
      errors: [],
      warnings: [],
    });
  });

  test("an article on no page is 'unplaced' (warning only); inside a combo only it is a 'component' (nothing)", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, null);
    await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, { placementId: f.placementId });

    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "unplaced",
      errors: [],
      warnings: [{ code: "article_unplaced", articleKey: f.key }],
    });

    await insertCombo(t, w.a.menuServiceId, "Set", [f.articleId]);
    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "component",
      errors: [],
      warnings: [],
    });
  });

  test("visibility counts as the guest sees it: hidden section or page = hidden; archived page = not placed at all", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, null);

    await t.run(async (ctx) => ctx.db.patch(f.sectionId, { visibility: "hidden" }));
    expect((await issues(t, w.ownerId, f.articleId)).scope).toBe("hidden");
    await t.run(async (ctx) => ctx.db.patch(f.sectionId, { visibility: "visible" }));
    expect((await issues(t, w.ownerId, f.articleId)).scope).toBe("public");

    await t.run(async (ctx) => ctx.db.patch(w.a.defaultPageId, { visibility: "hidden" }));
    expect((await issues(t, w.ownerId, f.articleId)).scope).toBe("hidden");
    await t.run(async (ctx) => ctx.db.patch(w.a.defaultPageId, { visibility: "visible" }));

    await t.run(async (ctx) => ctx.db.patch(w.a.defaultPageId, { archivedAt: Date.now() }));
    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "unplaced",
      errors: [],
      warnings: [{ code: "article_unplaced", articleKey: f.key }],
    });
  });

  test("Room service counts as the section only while Room service is on", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, 120);
    await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, { placementId: f.placementId });
    await insertRoomService(t, w.a.menuServiceId, f.articleId);

    expect((await issues(t, w.ownerId, f.articleId)).scope).toBe("unplaced");

    await t.run(async (ctx) => {
      const service = await ctx.db.get(w.a.menuServiceId);
      if (!service) throw new Error("service missing");
      await ctx.db.patch(w.a.menuServiceId, {
        features: { ...service.features, roomService: true },
      });
    });
    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "public",
      errors: [],
      warnings: [],
    });
  });

  test("variants are read from the draft and counted only while they are on", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, null);
    const small = await insertVariant(t, w.a.menuServiceId, f.articleId, "0,2 l", null, 1024);
    await insertVariant(t, w.a.menuServiceId, f.articleId, "0,5 l", 300, 2048);

    // Variants are off: they do not give the article a price.
    expect((await issues(t, w.ownerId, f.articleId)).errors).toEqual([
      { code: "price_missing", articleKey: f.key },
    ]);

    await t.run(async (ctx) => ctx.db.patch(f.articleId, { variantsEnabled: true }));
    expect(await issues(t, w.ownerId, f.articleId)).toEqual({
      scope: "public",
      errors: [],
      warnings: [{ code: "variant_price_missing", articleKey: f.key, entityKey: small.key }],
    });

    // Variants on and none added: the base price is used, but the editor is told.
    const empty = await anotherArticle(t, w, "Prazno", 100);
    await t.run(async (ctx) => ctx.db.patch(empty.articleId, { variantsEnabled: true }));
    expect(await issues(t, w.ownerId, empty.articleId)).toEqual({
      scope: "public",
      errors: [],
      warnings: [{ code: "variants_empty", articleKey: empty.key }],
    });
  });

  test("linked add-on groups are read from the draft and counted only while add-ons are on", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, 100);
    const emptyGroup = await insertGroup(t, w.a.menuServiceId, { name: "Prazna", optionCount: 0, linkCount: 1 });
    const strictGroup = await insertGroup(t, w.a.menuServiceId, {
      name: "Stroga",
      optionCount: 1,
      linkCount: 1,
      required: true,
      minSelect: 2,
    });
    await linkGroup(t, w.a.menuServiceId, f.articleId, emptyGroup.groupId);
    await linkGroup(t, w.a.menuServiceId, f.articleId, strictGroup.groupId);

    expect((await issues(t, w.ownerId, f.articleId)).warnings).toEqual([]);

    await t.run(async (ctx) => ctx.db.patch(f.articleId, { addonsEnabled: true }));
    const result = await issues(t, w.ownerId, f.articleId);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: "addon_group_empty", articleKey: f.key, entityKey: emptyGroup.key },
        { code: "addon_group_unsatisfiable", articleKey: f.key, entityKey: strictGroup.key },
      ]),
    );
  });

  test("a combo: components, the price-check flag and the manual price come from the draft", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, 100);
    const combo = await insertCombo(t, w.a.menuServiceId, "Vinski set", [], { priceCheck: true });
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: f.sectionId,
      articleId: combo.comboId,
    });

    const result = await issues(t, w.ownerId, combo.comboId);
    expect(result.scope).toBe("public");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      { code: "combo_price_check", articleKey: combo.key },
      { code: "combo_empty", articleKey: combo.key },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.insert("menuComboComponents", {
        menuServiceId: w.a.menuServiceId,
        comboArticleId: combo.comboId,
        componentArticleId: f.articleId,
        quantity: 1,
        order: 1024,
        createdAt: Date.now(),
      });
    });
    expect((await issues(t, w.ownerId, combo.comboId)).warnings).toEqual([
      { code: "combo_price_check", articleKey: combo.key },
    ]);

    // A combo needs its manual price; variants never replace it.
    await t.run(async (ctx) => ctx.db.patch(combo.comboId, { basePriceRsd: undefined }));
    expect((await issues(t, w.ownerId, combo.comboId)).errors).toEqual([
      { code: "price_missing", articleKey: combo.key },
    ]);
  });

  test("a scheduled promotion needs Premium (account level); a manual one does not", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w, 250);
    await t.run(async (ctx) =>
      ctx.db.patch(f.articleId, {
        promo: { active: true, mode: "percent", percent: 10, startsAt: 1_000, endsAt: 2_000 },
      }),
    );
    expect((await issues(t, w.ownerId, f.articleId)).warnings).toEqual([
      { code: "promo_schedule_premium", articleKey: f.key },
    ]);

    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    expect((await issues(t, w.ownerId, f.articleId)).warnings).toEqual([]);

    await t.run(async (ctx) =>
      ctx.db.patch(f.articleId, { promo: { active: true, mode: "price", priceRsd: 300 } }),
    );
    expect((await issues(t, w.ownerId, f.articleId)).warnings).toEqual([
      { code: "promo_invalid", articleKey: f.key },
    ]);
  });
});

// =============================================================================
// Roles
// =============================================================================

describe("roles", () => {
  test("owner, manager, editor and ScanMe admin can write and read all of it", async () => {
    const { t, w } = await setup();
    const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    for (const [label, userId] of [
      ["vlasnik", w.ownerId],
      ["menadzer", w.managerId],
      ["urednik", w.editorId],
      ["admin", w.adminId],
    ] as const) {
      const actor = as(t, userId);
      const created = await quickAdd(t, userId, section.sectionId, `Artikal ${label}`, 100);

      expect(await enableAllergens(t, userId, w.a.menuServiceId)).toEqual({ ok: true });
      expect(await actor.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toEqual({
        enabled: true,
      });
      expect(
        await actor.mutation(D.setArticleTags, {
          articleId: created.articleId,
          expected: [],
          tags: ["new"],
        }),
      ).toEqual({ ok: true });
      expect(
        await setAllergens(t, userId, created.articleId, null, { contains: ["eggs"], mayContain: [] }),
      ).toEqual({ ok: true });
      const article = await articleDoc(t, created.articleId);
      expect(article).toMatchObject({
        tags: ["new"],
        allergens: { contains: ["eggs"], mayContain: [] },
        updatedByUserId: userId,
      });

      expect(await actor.query(D.articleIssues, { articleId: created.articleId })).toMatchObject({
        scope: "public",
        errors: [],
      });
      expect(
        await actor.query(D.articleDeletionImpact, { articleId: created.articleId }),
      ).toMatchObject({ name: `Artikal ${label}`, placementCount: 1 });

      const token = await confirmTokenOf(t, userId, created.articleId);
      const done = await actor.mutation(D.deleteArticle, {
        articleId: created.articleId,
        confirmToken: token,
      });
      expect(done.status).toBe("deleted");
      expect(await articleDoc(t, created.articleId)).toBeNull();
    }
    expect((await auditRows(t, w.a.menuServiceId, "article.deleted")).map((row) => row.actorKind)).toEqual([
      "user",
      "user",
      "user",
      "admin",
    ]);
  });

  test("finance, view-only, outsiders and the owner of another business get not_found on writes and null on reads; nothing changes", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    const before = await world(t, w.a.menuServiceId);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const actor = as(t, userId);
      await expect(
        actor.mutation(D.setAllergensEnabled, { menuServiceId: w.a.menuServiceId, enabled: true }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        setAllergens(t, userId, f.articleId, null, { contains: ["milk"], mayContain: [] }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(setAllergens(t, userId, f.articleId, null, null)).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        actor.mutation(D.setArticleTags, { articleId: f.articleId, expected: [], tags: ["vegan"] }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(actor.mutation(D.deleteArticle, { articleId: f.articleId })).rejects.toThrow(
        MENU_ERROR.notFound,
      );
      await expect(
        actor.mutation(D.deleteArticle, { articleId: f.articleId, confirmToken: "x" }),
      ).rejects.toThrow(MENU_ERROR.notFound);

      expect(await actor.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toBeNull();
      expect(await actor.query(D.articleIssues, { articleId: f.articleId })).toBeNull();
      expect(await actor.query(D.articleDeletionImpact, { articleId: f.articleId })).toBeNull();
    }
    expect(await world(t, w.a.menuServiceId)).toEqual(before);
  });

  test("signed-out callers are refused", async () => {
    const { t, w } = await setup();
    const f = await oneArticle(t, w);
    await expect(
      t.mutation(D.setAllergensEnabled, { menuServiceId: w.a.menuServiceId, enabled: true }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    await expect(
      t.mutation(D.setArticleTags, { articleId: f.articleId, expected: [], tags: ["vegan"] }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    await expect(t.mutation(D.deleteArticle, { articleId: f.articleId })).rejects.toThrow(
      MENU_ERROR.unauthenticated,
    );
    expect(await t.query(D.articleIssues, { articleId: f.articleId })).toBeNull();
    expect(await t.query(D.articleDeletionImpact, { articleId: f.articleId })).toBeNull();
    expect(await t.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toBeNull();
  });

  test("with client editing switched off, clients get editing_disabled, the admin still edits, reads stay open", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const before = await world(t, w.a.menuServiceId);

    for (const userId of [w.ownerId, w.managerId, w.editorId]) {
      const actor = as(t, userId);
      await expect(
        actor.mutation(D.setAllergensEnabled, { menuServiceId: w.a.menuServiceId, enabled: true }),
      ).rejects.toThrow(MENU_ERROR.editingDisabled);
      await expect(
        setAllergens(t, userId, f.articleId, null, null),
      ).rejects.toThrow(MENU_ERROR.editingDisabled);
      await expect(
        actor.mutation(D.setArticleTags, { articleId: f.articleId, expected: [], tags: ["vegan"] }),
      ).rejects.toThrow(MENU_ERROR.editingDisabled);
      await expect(actor.mutation(D.deleteArticle, { articleId: f.articleId })).rejects.toThrow(
        MENU_ERROR.editingDisabled,
      );

      expect(await actor.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toEqual({
        enabled: false,
      });
      expect(await actor.query(D.articleIssues, { articleId: f.articleId })).not.toBeNull();
      expect(await actor.query(D.articleDeletionImpact, { articleId: f.articleId })).not.toBeNull();
    }
    expect(await world(t, w.a.menuServiceId)).toEqual(before);

    const admin = as(t, w.adminId);
    expect(await enableAllergens(t, w.adminId, w.a.menuServiceId)).toEqual({ ok: true });
    expect(
      await admin.mutation(D.setArticleTags, { articleId: f.articleId, expected: [], tags: ["vegan"] }),
    ).toEqual({ ok: true });
    const token = await confirmTokenOf(t, w.adminId, f.articleId);
    expect(
      (await admin.mutation(D.deleteArticle, { articleId: f.articleId, confirmToken: token })).status,
    ).toBe("deleted");
  });
});

// =============================================================================
// Tenant isolation
// =============================================================================

describe("tenant isolation", () => {
  async function tenantB(t: T, w: MenuWorldSeed) {
    const section = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
    const created = await quickAdd(t, w.otherOwnerId, section.sectionId, "Jelen pivo", 200);
    return { sectionId: section.sectionId, articleId: created.articleId, key: created.key };
  }

  test("the owner of B cannot read the impact or issues of A's article, nor delete or change it; A's data is unchanged", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    await tenantB(t, w);
    const beforeA = await world(t, w.a.menuServiceId);
    const beforeB = await world(t, w.b.menuServiceId);
    const intruder = as(t, w.otherOwnerId);

    expect(await intruder.query(D.articleDeletionImpact, { articleId: f.articleId })).toBeNull();
    expect(await intruder.query(D.articleIssues, { articleId: f.articleId })).toBeNull();
    expect(await intruder.query(D.allergenSettings, { menuServiceId: w.a.menuServiceId })).toBeNull();

    await expect(intruder.mutation(D.deleteArticle, { articleId: f.articleId })).rejects.toThrow(
      MENU_ERROR.notFound,
    );
    // Even with the real token (a leaked token proves nothing).
    const token = await confirmTokenOf(t, w.ownerId, f.articleId);
    await expect(
      intruder.mutation(D.deleteArticle, { articleId: f.articleId, confirmToken: token }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      intruder.mutation(D.setArticleTags, { articleId: f.articleId, expected: [], tags: ["vegan"] }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      setAllergens(t, w.otherOwnerId, f.articleId, null, null),
    ).rejects.toThrow(MENU_ERROR.notFound);

    expect(await world(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await world(t, w.b.menuServiceId)).toEqual(beforeB);
  });

  test("setAllergensEnabled on A's service by the owner of B is not_found and A's switch does not move", async () => {
    const { t, w } = await setup();
    await tenantB(t, w);
    const beforeA = await world(t, w.a.menuServiceId);

    await expect(
      as(t, w.otherOwnerId).mutation(D.setAllergensEnabled, {
        menuServiceId: w.a.menuServiceId,
        enabled: true,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    expect(await world(t, w.a.menuServiceId)).toEqual(beforeA);

    // B's own switch is B's alone.
    expect(await enableAllergens(t, w.otherOwnerId, w.b.menuServiceId)).toEqual({ ok: true });
    expect(
      await as(t, w.otherOwnerId).query(D.allergenSettings, { menuServiceId: w.b.menuServiceId }),
    ).toEqual({ enabled: true });
    expect(
      await as(t, w.ownerId).query(D.allergenSettings, { menuServiceId: w.a.menuServiceId }),
    ).toEqual({ enabled: false });
    expect(await as(t, w.ownerId).query(D.allergenSettings, { menuServiceId: w.b.menuServiceId })).toBeNull();
  });

  test("the owner of A cannot touch B's articles either; deleting in A never reaches B", async () => {
    const { t, w } = await setup();
    const f = await deletionFixture(t, w);
    const b = await tenantB(t, w);
    const beforeB = await world(t, w.b.menuServiceId);
    const owner = as(t, w.ownerId);

    expect(await owner.query(D.articleDeletionImpact, { articleId: b.articleId })).toBeNull();
    expect(await owner.query(D.articleIssues, { articleId: b.articleId })).toBeNull();
    await expect(owner.mutation(D.deleteArticle, { articleId: b.articleId })).rejects.toThrow(
      MENU_ERROR.notFound,
    );
    await expect(
      owner.mutation(D.setArticleTags, { articleId: b.articleId, expected: [], tags: ["new"] }),
    ).rejects.toThrow(MENU_ERROR.notFound);

    const token = await confirmTokenOf(t, w.ownerId, f.articleId);
    expect(
      (await owner.mutation(D.deleteArticle, { articleId: f.articleId, confirmToken: token })).status,
    ).toBe("deleted");
    expect(await world(t, w.b.menuServiceId)).toEqual(beforeB);
    expect(await articleDoc(t, b.articleId)).not.toBeNull();
  });
});
