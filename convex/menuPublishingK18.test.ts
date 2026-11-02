/// <reference types="vite/client" />

// ScanMe Menu V1 — K18: the publish dialog and "Vraćanje verzije" in the editor
// (convex/menuPublishing.ts). What the editor relies on and these tests protect:
//   - publishPreview.targets: for every article named by an error or warning,
//     { name, pageKey, pageName, inRoomService } — ONE page that shows it (the
//     default page first, then page order, archived pages never), null when the
//     article is on no page; {} when nothing names an article and when the
//     draft is too large to check;
//   - a restore makes a DRAFT and says so (draftStatus: dirty, restoredFromNumber),
//     guests keep the live version, the next publish records "vraćeno sa verzije N";
//   - a restore made on a stale revision is refused and names who edited since;
//   - roles and tenants: Osoblje (staff) never publishes, accounts without Menu
//     access get nothing (no targets either), another venue never sees these targets.
// Content is created through the real mutations; guests are observed through
// convex/menuPublic.ts. Fictional data only ("Kafana kod Mike", "Demo restoran").

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { menuKonobarSr } from "../lib/i18n/sr/menu-konobar";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { roleCan } from "../lib/menu/permissions";
import type { MenuIssueTarget } from "../lib/menu/publish-targets";
import {
  SLUG_A,
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

const CODE_PATTERN = /\bmenu\/[a-z_]+/;

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

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

// -----------------------------------------------------------------------------
// Draft content through the real mutations
// -----------------------------------------------------------------------------

type Created = {
  articleId: Id<"menuArticles">;
  placementId: Id<"menuPlacements">;
  key: string;
};

async function quickAdd(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
  priceRsd?: number,
): Promise<Created> {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return { articleId: result.articleId, placementId: result.placementId, key: result.key };
}

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
}

async function addPage(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">, name: string) {
  return await as(t, userId).mutation(api.menuPages.add, { menuServiceId, name });
}

/** Tenant A, default page: "Roštilj" with Pljeskavica 450, Ćevapi 600 and Kajmak 150. */
async function draftA(t: T, w: MenuWorldSeed) {
  const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Roštilj");
  const pljeskavica = await quickAdd(t, w.ownerId, section.sectionId, "Pljeskavica", 450);
  const cevapi = await quickAdd(t, w.ownerId, section.sectionId, "Ćevapi", 600);
  const kajmak = await quickAdd(t, w.ownerId, section.sectionId, "Kajmak", 150);
  return { sectionId: section.sectionId, pljeskavica, cevapi, kajmak };
}

/** An extra page of tenant A with one section. */
async function extraPage(t: T, w: MenuWorldSeed, name: string) {
  const page = await addPage(t, w.ownerId, w.a.menuServiceId, name);
  const section = await addSection(t, w.ownerId, page.pageId, `${name} - sekcija`);
  return { pageId: page.pageId, key: page.key, name, sectionId: section.sectionId };
}

async function pageInfo(t: T, pageId: Id<"menuPages">) {
  const row = await t.run(async (ctx) => await ctx.db.get(pageId));
  if (!row) throw new Error("page missing");
  return { key: row.key, name: row.name };
}

async function setPrice(
  t: T,
  userId: Id<"users">,
  articleId: Id<"menuArticles">,
  from: number | null,
  to: number | null,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.setBasePrice, {
    articleId,
    expectedPriceRsd: from,
    priceRsd: to,
  });
  expect(result).toEqual({ ok: true });
}

/** An article that is on no page: it exists in the draft and nowhere else. */
async function unplacedArticle(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
  priceRsd?: number,
): Promise<Created> {
  const created = await quickAdd(t, userId, sectionId, name, priceRsd);
  await as(t, userId).mutation(api.menuCatalog.removePlacement, { placementId: created.placementId });
  return created;
}

async function draftPrice(t: T, articleId: Id<"menuArticles">) {
  return (await t.run(async (ctx) => await ctx.db.get(articleId)))?.basePriceRsd;
}

// -----------------------------------------------------------------------------
// Preview, publish, status, restore
// -----------------------------------------------------------------------------

async function previewOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const result = await as(t, userId).query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!result) throw new Error("expected a preview");
  return result;
}
type Preview = Awaited<ReturnType<typeof previewOf>>;

function targetsOf(preview: Preview): Record<string, MenuIssueTarget> {
  return preview.targets as Record<string, MenuIssueTarget>;
}

/** What the editor does: preview, then publish the revision it reviewed with its warnings acknowledged. */
async function publishOk(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const preview = await previewOf(t, userId, menuServiceId);
  const result = await as(t, userId).mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish was refused: ${JSON.stringify(result)}`);
  return result;
}

async function statusRaw(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  return await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId });
}

async function statusOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const status = await statusRaw(t, userId, menuServiceId);
  if (!status) throw new Error("draftStatus was refused");
  return status;
}

async function listingOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const listing = await as(t, userId).query(api.menuPublishing.listVersions, { menuServiceId });
  if (!listing) throw new Error("listVersions was refused");
  return listing;
}

async function restoreAt(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  versionNumber: number,
  expectedRevision: number,
) {
  return await as(t, userId).mutation(api.menuPublishing.restoreVersion, {
    menuServiceId,
    versionNumber,
    expectedRevision,
  });
}

/** Version 1 (draftA), then Pljeskavica 450 -> 520 published by the manager as version 2. */
async function twoVersions(t: T, w: MenuWorldSeed) {
  const menu = await draftA(t, w);
  await publishOk(t, w.ownerId, w.a.menuServiceId);
  await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
  await publishOk(t, w.managerId, w.a.menuServiceId);
  return menu;
}

async function guestView(t: T) {
  const result = await t.query(api.menuPublic.page, { slug: SLUG_A });
  if (!result || result.kind !== "page") throw new Error("expected a public page");
  const articles = result.sections.flatMap((section) => section.articles);
  return {
    versionNumber: result.versionNumber,
    priceOf: (key: string) => articles.find((article) => article.key === key)?.priceRsd,
  };
}

async function versionNumbers(t: T, menuServiceId: Id<"menuServices">) {
  const rows = await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuVersions")
        .withIndex("by_menuServiceId_and_number", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
  return rows.map((row) => row.number);
}

async function restoreAudits(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    return rows.filter((row) => row.action === "version.restored");
  });
}

// =============================================================================
// 1. publishPreview.targets
// =============================================================================

describe("K18 — publishPreview targets", () => {
  test("a shown article without a price: price_missing and a target on the default page", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const noPrice = await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.ok).toBe(false);
    expect(preview.errors).toEqual([{ code: "price_missing", articleKey: noPrice.key }]);
    expect(targetsOf(preview)).toEqual({
      [noPrice.key]: {
        name: "Pita sa sirom",
        pageKey: defaultPage.key,
        pageName: defaultPage.name,
        inRoomService: false,
      },
    });
    // The priced articles are not named by any issue, so they have no target.
    expect(Object.keys(targetsOf(preview))).toHaveLength(1);
  });

  test("an article shown only on a second page points at that page", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    const noPrice = await quickAdd(t, w.ownerId, second.sectionId, "Čorba dana");
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.errors).toEqual([{ code: "price_missing", articleKey: noPrice.key }]);
    expect(targetsOf(preview)).toEqual({
      [noPrice.key]: {
        name: "Čorba dana",
        pageKey: second.key,
        pageName: "Dnevna ponuda",
        inRoomService: false,
      },
    });
    expect(second.key).not.toBe(defaultPage.key);
  });

  test("an article shown on both pages points at the default page, whichever page got it first", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    // Created on the second page first, added to the default page afterwards.
    const shared = await quickAdd(t, w.ownerId, second.sectionId, "Specijal dana");
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: menu.sectionId,
      articleId: shared.articleId,
    });
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.errors).toEqual([{ code: "price_missing", articleKey: shared.key }]);
    expect(targetsOf(preview)[shared.key]).toEqual({
      name: "Specijal dana",
      pageKey: defaultPage.key,
      pageName: defaultPage.name,
      inRoomService: false,
    });
  });

  test("an article on two extra pages points at the one that comes first in the page order", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    const third = await extraPage(t, w, "Vikend ponuda");
    const shared = await quickAdd(t, w.ownerId, third.sectionId, "Vikend specijal");
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: second.sectionId,
      articleId: shared.articleId,
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(targetsOf(preview)[shared.key]).toMatchObject({
      pageKey: second.key,
      pageName: "Dnevna ponuda",
    });
  });

  test("targets follow the draft: removing from the default page moves the target, a price clears it", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    const shared = await quickAdd(t, w.ownerId, second.sectionId, "Specijal dana");
    const onDefault = await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: menu.sectionId,
      articleId: shared.articleId,
    });
    const defaultPage = await pageInfo(t, w.a.defaultPageId);
    expect(targetsOf(await previewOf(t, w.ownerId, w.a.menuServiceId))[shared.key]?.pageKey).toBe(
      defaultPage.key,
    );

    await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, {
      placementId: onDefault.placementId,
    });
    const moved = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(moved.errors).toEqual([{ code: "price_missing", articleKey: shared.key }]);
    expect(targetsOf(moved)[shared.key]).toMatchObject({ pageKey: second.key, pageName: "Dnevna ponuda" });

    await setPrice(t, w.ownerId, shared.articleId, null, 380);
    const fixed = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(fixed.ok).toBe(true);
    expect(fixed.errors).toEqual([]);
    expect(targetsOf(fixed)).toEqual({});
  });

  test("an article on no page: the warning has a target without a page", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const unplaced = await unplacedArticle(t, w.ownerId, menu.sectionId, "Pita sa jabukama", 280);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.ok).toBe(true);
    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: unplaced.key }]);
    expect(targetsOf(preview)).toEqual({
      [unplaced.key]: {
        name: "Pita sa jabukama",
        pageKey: null,
        pageName: null,
        inRoomService: false,
      },
    });
  });

  test("an archived page is never a target: an article left only on it has no page", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    const onlyHere = await quickAdd(t, w.ownerId, second.sectionId, "Čorba dana", 320);
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: second.pageId });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: onlyHere.key }]);
    expect(targetsOf(preview)).toEqual({
      [onlyHere.key]: { name: "Čorba dana", pageKey: null, pageName: null, inRoomService: false },
    });
  });

  test("an article on an archived page and on the default page points at the default page", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    const shared = await quickAdd(t, w.ownerId, second.sectionId, "Specijal dana");
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: menu.sectionId,
      articleId: shared.articleId,
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: second.pageId });
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(targetsOf(preview)[shared.key]).toMatchObject({
      pageKey: defaultPage.key,
      pageName: defaultPage.name,
    });
  });

  test("a draft without issues has no targets, before and after publishing", async () => {
    const { t, w } = await setup();
    await draftA(t, w);

    const draft = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(draft.ok).toBe(true);
    expect(draft.errors).toEqual([]);
    expect(draft.warnings).toEqual([]);
    expect(targetsOf(draft)).toEqual({});

    await publishOk(t, w.ownerId, w.a.menuServiceId);
    const clean = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(clean.state).toBe("clean");
    expect(targetsOf(clean)).toEqual({});
  });

  test("a combo whose component price changed: the combo_price_check warning has a target", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const combo = await as(t, w.ownerId).mutation(api.menuCombos.createCombo, {
      sectionId: menu.sectionId,
      name: "Roštilj meni",
      priceRsd: 900,
      components: [
        { articleId: menu.pljeskavica.articleId, quantity: 1 },
        { articleId: menu.cevapi.articleId, quantity: 1 },
      ],
    });
    await publishOk(t, w.ownerId, w.a.menuServiceId);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 480);
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.ok).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([{ code: "combo_price_check", articleKey: combo.key }]);
    expect(targetsOf(preview)).toEqual({
      [combo.key]: {
        name: "Roštilj meni",
        pageKey: defaultPage.key,
        pageName: defaultPage.name,
        inRoomService: false,
      },
    });
  });

  test("errors and warnings both get targets, and nothing else does", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const second = await extraPage(t, w, "Dnevna ponuda");
    const noPrice = await quickAdd(t, w.ownerId, second.sectionId, "Čorba dana");
    const unplaced = await unplacedArticle(t, w.ownerId, menu.sectionId, "Pita sa sirom", 300);
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.errors).toEqual([{ code: "price_missing", articleKey: noPrice.key }]);
    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: unplaced.key }]);
    expect(targetsOf(preview)).toEqual({
      [noPrice.key]: {
        name: "Čorba dana",
        pageKey: second.key,
        pageName: "Dnevna ponuda",
        inRoomService: false,
      },
      [unplaced.key]: { name: "Pita sa sirom", pageKey: null, pageName: null, inRoomService: false },
    });
    expect(Object.keys(targetsOf(preview))).not.toContain(menu.pljeskavica.key);
    expect(second.key).not.toBe(defaultPage.key);
  });

  test("a warning that names no article (missing translations) adds no target", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    await as(t, w.ownerId).mutation(api.menuSettings.setLanguages, {
      menuServiceId: w.a.menuServiceId,
      translations: ["en"],
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toMatchObject({ code: "translation_missing", lang: "en" });
    expect(targetsOf(preview)).toEqual({});
  });

  test("an article in Room service is marked inRoomService, with its page", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan", plan: "premium" });
    });
    const menu = await draftA(t, w);
    const noPrice = await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    const owner = as(t, w.ownerId);
    const category = await owner.mutation(api.menuRoomService.addCategory, {
      menuServiceId: w.a.menuServiceId,
      name: "Hrana",
    });
    await owner.mutation(api.menuRoomService.addItems, {
      categoryId: category.categoryId,
      articleIds: [noPrice.articleId],
    });
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.errors).toEqual([{ code: "price_missing", articleKey: noPrice.key }]);
    expect(targetsOf(preview)).toEqual({
      [noPrice.key]: {
        name: "Pita sa sirom",
        pageKey: defaultPage.key,
        pageName: defaultPage.name,
        inRoomService: true,
      },
    });
  });

  test("an article only in Room service and on no page has inRoomService and no page", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan", plan: "premium" });
    });
    const menu = await draftA(t, w);
    const roomOnly = await unplacedArticle(t, w.ownerId, menu.sectionId, "Doručak u sobu", 700);
    const owner = as(t, w.ownerId);
    const category = await owner.mutation(api.menuRoomService.addCategory, {
      menuServiceId: w.a.menuServiceId,
      name: "Doručak",
    });
    await owner.mutation(api.menuRoomService.addItems, {
      categoryId: category.categoryId,
      articleIds: [roomOnly.articleId],
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    // Room service is not switched on, so guests would not see it: the unplaced warning names it.
    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: roomOnly.key }]);
    expect(targetsOf(preview)).toEqual({
      [roomOnly.key]: { name: "Doručak u sobu", pageKey: null, pageName: null, inRoomService: true },
    });
  });

  test("a draft over the load ceilings explains itself with no targets", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const noPrice = await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    // Control: this draft does name an article.
    expect(Object.keys(targetsOf(await previewOf(t, w.ownerId, w.a.menuServiceId)))).toEqual([noPrice.key]);

    // 1 real section + 1000 fillers = 1001 sections, one over the ceiling of 1000.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 1000; index += 1) {
        await ctx.db.insert("menuSections", {
          menuServiceId: w.a.menuServiceId,
          pageId: w.a.defaultPageId,
          key: `section_praznina_${index}`,
          name: `Praznina ${index}`,
          order: 1000 + index,
          visibility: "visible",
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview).toMatchObject({
      tooLarge: true,
      ok: false,
      canPublish: false,
      wouldChange: true,
      errors: [],
      warnings: [],
      summary: null,
    });
    expect(targetsOf(preview)).toEqual({});
  });
});

// =============================================================================
// 2. A restore makes a draft and says so
// =============================================================================

describe("K18 — a restore makes a draft and says so", () => {
  test("restoring version 1 gives a dirty draft marked 'restored from 1' while guests keep version 2", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    const menu = await twoVersions(t, w);
    const before = await statusOf(t, w.ownerId, id);
    expect(before).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      liveVersionNumber: 2,
      restoredFromNumber: null,
    });
    expect(await draftPrice(t, menu.pljeskavica.articleId)).toBe(520);

    const restored = await restoreAt(t, w.ownerId, id, 1, before.revision);

    if (!restored.ok) throw new Error(`restore refused: ${restored.reason}`);
    expect(restored).toMatchObject({ ok: true, versionNumber: 1, state: "dirty", keptPages: [] });
    expect(restored.changes).toBeGreaterThan(0);
    expect(restored.revision).toBeGreaterThan(before.revision);

    // The draft says what happened.
    const status = await statusOf(t, w.ownerId, id);
    expect(status).toMatchObject({
      state: "dirty",
      hasUnpublishedChanges: true,
      restoredFromNumber: 1,
      liveVersionNumber: 2,
      revision: restored.revision,
      publishedRevision: before.revision,
    });
    expect(typeof status.lastEditAt).toBe("number");
    expect(status.lastEditBy).toEqual({ userId: w.ownerId, name: "vlasnik@example.com", isMe: true });
    // For somebody else the same edit is not "me", and (K33 B6) their e-mail is
    // not shown: the owner has no display name, so the neutral label stands in.
    expect((await statusOf(t, w.managerId, id)).lastEditBy).toEqual({
      userId: w.ownerId,
      name: menuKonobarSr.zaglavlje.nalogBezImena,
      isMe: false,
    });
    expect(await draftPrice(t, menu.pljeskavica.articleId)).toBe(450);

    // Guests still see version 2 with its price.
    const guest = await guestView(t);
    expect(guest.versionNumber).toBe(2);
    expect(guest.priceOf(menu.pljeskavica.key)).toBe(520);

    // The list: two versions, version 2 is live and nothing was added or marked.
    const listing = await listingOf(t, w.ownerId, id);
    expect(listing.liveVersionNumber).toBe(2);
    expect(listing.versions.map((row) => [row.number, row.isLive, row.restoredFromNumber])).toEqual([
      [2, true, null],
      [1, false, null],
    ]);
    // K33 B6: the owner sees their own e-mail, but not the manager's (no display name: the neutral label).
    expect(listing.versions[0].publishedBy).toEqual({ userId: w.managerId, name: menuKonobarSr.zaglavlje.nalogBezImena });
    expect(listing.versions[1].publishedBy).toEqual({ userId: w.ownerId, name: "vlasnik@example.com" });
    expect(listing.versions[0].summary).toMatchObject({ changedPrices: 1 });
    expect(await versionNumbers(t, id)).toEqual([1, 2]);
    expect(await restoreAudits(t, id)).toHaveLength(1);
  });

  test("the preview of the restored draft compares it with the live version", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    const menu = await twoVersions(t, w);
    const before = await statusOf(t, w.ownerId, id);
    await restoreAt(t, w.ownerId, id, 1, before.revision);

    const preview = await previewOf(t, w.ownerId, id);

    expect(preview).toMatchObject({
      state: "dirty",
      liveVersionNumber: 2,
      wouldChange: true,
      ok: true,
      canPublish: true,
    });
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([]);
    expect(targetsOf(preview)).toEqual({});
    expect(preview.summary).toMatchObject({
      changedPrices: 1,
      newArticles: 0,
      removedArticles: 0,
      priceChanges: [{ articleKey: menu.pljeskavica.key, name: "Pljeskavica", before: 520, after: 450 }],
    });
  });

  test("publishing the restored draft makes version 3 'restored from 1' and clears the marker", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    const menu = await twoVersions(t, w);
    const before = await statusOf(t, w.ownerId, id);
    await restoreAt(t, w.ownerId, id, 1, before.revision);
    expect((await statusOf(t, w.ownerId, id)).restoredFromNumber).toBe(1);

    const published = await publishOk(t, w.ownerId, id);

    expect(published.versionNumber).toBe(3);
    const listing = await listingOf(t, w.ownerId, id);
    expect(listing.liveVersionNumber).toBe(3);
    expect(listing.versions.map((row) => [row.number, row.isLive, row.restoredFromNumber])).toEqual([
      [3, true, 1],
      [2, false, null],
      [1, false, null],
    ]);
    expect(listing.versions[0].publishedBy).toEqual({ userId: w.ownerId, name: "vlasnik@example.com" });
    expect(listing.versions[0].summary).toMatchObject({ changedPrices: 1 });

    const status = await statusOf(t, w.ownerId, id);
    expect(status).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      liveVersionNumber: 3,
      restoredFromNumber: null,
    });
    const guest = await guestView(t);
    expect(guest.versionNumber).toBe(3);
    expect(guest.priceOf(menu.pljeskavica.key)).toBe(450);

    // The marker is consumed: an ordinary next edit and publish is not "restored from 1" again.
    await setPrice(t, w.ownerId, menu.kajmak.articleId, 150, 170);
    expect((await statusOf(t, w.ownerId, id)).restoredFromNumber).toBeNull();
    await publishOk(t, w.ownerId, id);
    expect((await listingOf(t, w.ownerId, id)).versions[0]).toMatchObject({
      number: 4,
      restoredFromNumber: null,
    });
  });
});

// =============================================================================
// 3. A stale restore by a second editor
// =============================================================================

describe("K18 — a restore on a stale revision", () => {
  // K33 B6: the owner is told WHO edited, but never by e-mail: neither person has
  // a display name here, so the neutral label stands in.
  test.each([
    ["manager", "managerId", menuKonobarSr.zaglavlje.nalogBezImena],
    ["editor", "editorId", menuKonobarSr.zaglavlje.nalogBezImena],
  ] as const)(
    "an edit by the %s after the owner's preview makes the owner's restore stale and names them",
    async (_label, who, shownName) => {
      const { t, w } = await setup();
      const id = w.a.menuServiceId;
      const menu = await twoVersions(t, w);
      // The owner has an unpublished edit of their own and looks at the preview.
      await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 520, 530);
      const preview = await previewOf(t, w.ownerId, id);
      const reviewed = preview.revision;

      await setPrice(t, w[who], menu.cevapi.articleId, 600, 650);
      const statusBefore = await statusOf(t, w.ownerId, id);
      const guestBefore = await guestView(t);

      const result = await restoreAt(t, w.ownerId, id, 1, reviewed);

      expect(result).toMatchObject({
        ok: false,
        reason: "stale_draft",
        revision: reviewed + 1,
        lastEditBy: { userId: w[who], name: shownName },
      });
      if (result.ok) throw new Error("expected a refusal");
      expect(result.lastEditAt).toBe(statusBefore.lastEditAt);
      expect(typeof result.lastEditAt).toBe("number");

      // Nothing was written: both people's edits survive, no marker, no audit row.
      expect(await draftPrice(t, menu.pljeskavica.articleId)).toBe(530);
      expect(await draftPrice(t, menu.cevapi.articleId)).toBe(650);
      expect(await statusOf(t, w.ownerId, id)).toEqual(statusBefore);
      expect(statusBefore.restoredFromNumber).toBeNull();
      expect(statusBefore.lastEditBy).toMatchObject({ userId: w[who], name: shownName, isMe: false });
      expect(await restoreAudits(t, id)).toEqual([]);
      expect(await versionNumbers(t, id)).toEqual([1, 2]);
      expect(await guestView(t)).toMatchObject({ versionNumber: guestBefore.versionNumber });

      // After looking again (the fresh revision) the same restore goes through.
      const retried = await restoreAt(t, w.ownerId, id, 1, statusBefore.revision);
      expect(retried).toMatchObject({ ok: true, versionNumber: 1, state: "dirty" });
      expect(await draftPrice(t, menu.pljeskavica.articleId)).toBe(450);
      expect(await draftPrice(t, menu.cevapi.articleId)).toBe(600);
      expect((await statusOf(t, w.ownerId, id)).restoredFromNumber).toBe(1);
    },
  );

  test("a revision from the past is stale in either direction and writes nothing", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    const menu = await twoVersions(t, w);
    await setPrice(t, w.ownerId, menu.kajmak.articleId, 150, 170);
    const status = await statusOf(t, w.ownerId, id);

    for (const wrong of [status.revision - 1, status.revision + 1]) {
      expect(await restoreAt(t, w.ownerId, id, 1, wrong), `expectedRevision ${wrong}`).toMatchObject({
        ok: false,
        reason: "stale_draft",
        revision: status.revision,
        lastEditBy: { userId: w.ownerId, name: "vlasnik@example.com" },
      });
    }

    expect(await statusOf(t, w.ownerId, id)).toEqual(status);
    expect(await draftPrice(t, menu.kajmak.articleId)).toBe(170);
    expect(await restoreAudits(t, id)).toEqual([]);
  });
});

// =============================================================================
// 4. Roles and tenants
// =============================================================================

describe("K18 — roles", () => {
  test("staff (Osoblje) never publishes, restores or even reads the Menu", () => {
    expect(roleCan("staff", "menu.publish")).toBe(false);
    expect(roleCan("staff", "menu.edit")).toBe(false);
    expect(roleCan("staff", "menu.read")).toBe(false);
    // Whoever publishes and restores (the same permission) is exactly owner, manager, editor, admin.
    for (const actor of ["owner", "manager", "editor", "admin"] as const) {
      expect(roleCan(actor, "menu.publish"), actor).toBe(true);
    }
  });

  test.each([
    ["owner", "ownerId"],
    ["manager", "managerId"],
    ["editor", "editorId"],
    ["admin", "adminId"],
  ] as const)("the %s gets the targets of the issues", async (_label, who) => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const noPrice = await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    const defaultPage = await pageInfo(t, w.a.defaultPageId);

    const preview = await previewOf(t, w[who], w.a.menuServiceId);

    expect(preview.canPublish).toBe(true);
    expect(targetsOf(preview)).toEqual({
      [noPrice.key]: {
        name: "Pita sa sirom",
        pageKey: defaultPage.key,
        pageName: defaultPage.name,
        inRoomService: false,
      },
    });
  });

  test.each([
    ["finance", "financeId"],
    ["view-only", "viewOnlyId"],
    ["outsider", "outsiderId"],
    ["another venue's owner", "otherOwnerId"],
  ] as const)(
    "%s has no Menu access: no preview (so no targets), no status, restore is not_found, nothing is written",
    async (_label, who) => {
      const { t, w } = await setup();
      const id = w.a.menuServiceId;
      const menu = await twoVersions(t, w);
      await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
      await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 520, 530);
      const status = await statusOf(t, w.ownerId, id);
      const guestBefore = await guestView(t);

      expect(await as(t, w[who]).query(api.menuPublishing.publishPreview, { menuServiceId: id })).toBeNull();
      expect(await statusRaw(t, w[who], id)).toBeNull();
      expect(await as(t, w[who]).query(api.menuPublishing.listVersions, { menuServiceId: id })).toBeNull();
      expect(await codeOf(restoreAt(t, w[who], id, 1, status.revision))).toBe(MENU_ERROR.notFound);

      expect(await statusOf(t, w.ownerId, id)).toEqual(status);
      expect(await draftPrice(t, menu.pljeskavica.articleId)).toBe(530);
      expect(await restoreAudits(t, id)).toEqual([]);
      expect(await versionNumbers(t, id)).toEqual([1, 2]);
      expect((await guestView(t)).versionNumber).toBe(guestBefore.versionNumber);
    },
  );

  test("an anonymous caller gets no preview and a refused restore", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    const menu = await twoVersions(t, w);
    await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    const status = await statusOf(t, w.ownerId, id);

    expect(await t.query(api.menuPublishing.publishPreview, { menuServiceId: id })).toBeNull();
    expect(
      await codeOf(
        t.mutation(api.menuPublishing.restoreVersion, {
          menuServiceId: id,
          versionNumber: 1,
          expectedRevision: status.revision,
        }),
      ),
    ).toBe(MENU_ERROR.unauthenticated);
    expect(await statusOf(t, w.ownerId, id)).toEqual(status);
    expect(await restoreAudits(t, id)).toEqual([]);
  });

  test("with client editing switched off the owner still reads the targets but cannot publish or restore", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    const menu = await twoVersions(t, w);
    const noPrice = await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const status = await statusOf(t, w.ownerId, id);

    const preview = await previewOf(t, w.ownerId, id);
    expect(preview.canPublish).toBe(false);
    expect(Object.keys(targetsOf(preview))).toEqual([noPrice.key]);
    expect(await codeOf(restoreAt(t, w.ownerId, id, 1, status.revision))).toBe(MENU_ERROR.editingDisabled);
    expect(await statusOf(t, w.ownerId, id)).toEqual(status);
    expect(await restoreAudits(t, id)).toEqual([]);

    // ScanMe's admin is not stopped by the switch.
    const asAdmin = await restoreAt(t, w.adminId, id, 1, status.revision);
    expect(asAdmin).toMatchObject({ ok: true, versionNumber: 1, state: "dirty" });
  });
});

describe("K18 — tenant isolation", () => {
  test("each venue's owner sees only the targets of their own venue", async () => {
    const { t, w } = await setup();
    const menuA = await draftA(t, w);
    const noPriceA = await quickAdd(t, w.ownerId, menuA.sectionId, "Pita A");
    const sectionB = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Jela");
    await quickAdd(t, w.otherOwnerId, sectionB.sectionId, "Pasta karbonara", 890);
    const noPriceB = await quickAdd(t, w.otherOwnerId, sectionB.sectionId, "Pita B");
    const pageA = await pageInfo(t, w.a.defaultPageId);
    const pageB = await pageInfo(t, w.b.defaultPageId);
    expect(pageA.key).not.toBe(pageB.key);

    const previewA = await previewOf(t, w.ownerId, w.a.menuServiceId);
    const previewB = await previewOf(t, w.otherOwnerId, w.b.menuServiceId);

    expect(targetsOf(previewA)).toEqual({
      [noPriceA.key]: { name: "Pita A", pageKey: pageA.key, pageName: pageA.name, inRoomService: false },
    });
    expect(targetsOf(previewB)).toEqual({
      [noPriceB.key]: { name: "Pita B", pageKey: pageB.key, pageName: pageB.name, inRoomService: false },
    });
    // Neither preview mentions anything of the other venue.
    expect(JSON.stringify(previewA)).not.toContain(noPriceB.key);
    expect(JSON.stringify(previewA)).not.toContain("Pita B");
    expect(JSON.stringify(previewA)).not.toContain(pageB.key);
    expect(JSON.stringify(previewB)).not.toContain(noPriceA.key);
    expect(JSON.stringify(previewB)).not.toContain("Pita A");
    expect(JSON.stringify(previewB)).not.toContain(pageA.key);

    // And neither owner can ask for the other venue's preview.
    expect(
      await as(t, w.otherOwnerId).query(api.menuPublishing.publishPreview, { menuServiceId: w.a.menuServiceId }),
    ).toBeNull();
    expect(
      await as(t, w.ownerId).query(api.menuPublishing.publishPreview, { menuServiceId: w.b.menuServiceId }),
    ).toBeNull();
  });

  test("a restore in one venue never touches the other and a foreign restore is not_found", async () => {
    const { t, w } = await setup();
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    const menuA = await twoVersions(t, w);
    const sectionB = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Jela");
    const pastaB = await quickAdd(t, w.otherOwnerId, sectionB.sectionId, "Pasta karbonara", 890);
    await publishOk(t, w.otherOwnerId, b);
    await setPrice(t, w.otherOwnerId, pastaB.articleId, 890, 920);
    const statusA = await statusOf(t, w.ownerId, a);
    const statusB = await statusOf(t, w.otherOwnerId, b);

    expect(await codeOf(restoreAt(t, w.otherOwnerId, a, 1, statusA.revision))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(restoreAt(t, w.ownerId, b, 1, statusB.revision))).toBe(MENU_ERROR.notFound);
    // Version 2 exists only in venue A.
    expect(await codeOf(restoreAt(t, w.otherOwnerId, b, 2, statusB.revision))).toBe(MENU_ERROR.notFound);

    const restored = await restoreAt(t, w.ownerId, a, 1, statusA.revision);
    expect(restored).toMatchObject({ ok: true, state: "dirty" });
    expect(await draftPrice(t, menuA.pljeskavica.articleId)).toBe(450);

    expect(await statusOf(t, w.otherOwnerId, b)).toEqual(statusB);
    expect(await draftPrice(t, pastaB.articleId)).toBe(920);
    expect(await restoreAudits(t, b)).toEqual([]);
    expect(await versionNumbers(t, b)).toEqual([1]);
  });
});
