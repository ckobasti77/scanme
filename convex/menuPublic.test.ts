/// <reference types="vite/client" />

// ScanMe Menu V1 — K05: the public read path (master §6.1, §7; K01 A2). Guests
// read ONLY the published version plus two live layers (availability and the
// Room service switch). Covered: which path serves /[slug]/meni (entry), the
// page / splitter / hidden-content rules, the draft never leaking, tenant
// isolation, gating (profile, business, service), languages, Room service,
// live availability and the read budget of a 400-article menu.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  SLUG_A,
  SLUG_B,
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

const INTERNAL_PAGE_NAME = "Kompletan meni";

// -----------------------------------------------------------------------------
// World and content helpers
// -----------------------------------------------------------------------------

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
 * Tenant A's default page: "Pića" (Jelen pivo 200, Espreso 150) and "Hrana"
 * (Pljeskavica 450, Pita sa sirom 320).
 */
async function menuContent(t: T, w: MenuWorldSeed) {
  const drinks = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
  const food = await addSection(t, w.ownerId, w.a.defaultPageId, "Hrana");
  const beer = await addArticle(t, w.ownerId, drinks.sectionId, "Jelen pivo", 200);
  const coffee = await addArticle(t, w.ownerId, drinks.sectionId, "Espreso", 150);
  const burger = await addArticle(t, w.ownerId, food.sectionId, "Pljeskavica", 450);
  const pita = await addArticle(t, w.ownerId, food.sectionId, "Pita sa sirom", 320);
  return { drinks, food, beer, coffee, burger, pita };
}

/** The real flow of Objavi: preview, then publish exactly that revision and warning set. */
async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const owner = as(t, userId);
  const preview = await owner.query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!preview) throw new Error("publishPreview returned null");
  const result = await owner.mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${JSON.stringify(result)}`);
  return result;
}

async function readPage(t: T, args: { slug: string; pageSlug?: string; lang?: string }) {
  return await t.query(api.menuPublic.page, args);
}
type PageResult = Awaited<ReturnType<typeof readPage>>;

function asPage(result: PageResult) {
  if (result === null) throw new Error("expected a page, got null");
  if (result.kind !== "page") throw new Error(`expected a page, got ${result.kind}`);
  return result;
}

function asSplitter(result: PageResult) {
  if (result === null) throw new Error("expected the splitter, got null");
  if (result.kind !== "splitter") throw new Error(`expected the splitter, got ${result.kind}`);
  return result;
}

function sectionNames(result: ReturnType<typeof asPage>) {
  return result.sections.map((section) => section.name);
}

function articleNames(result: ReturnType<typeof asPage>) {
  return result.sections.flatMap((section) => section.articles.map((article) => article.name));
}

function priceOf(result: ReturnType<typeof asPage>, articleName: string) {
  for (const section of result.sections) {
    const found = section.articles.find((article) => article.name === articleName);
    if (found) return found.priceRsd;
  }
  throw new Error(`article ${articleName} is not on the page`);
}

async function draftStatus(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const status = await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId });
  if (!status) throw new Error("draftStatus returned null");
  return status;
}

// =============================================================================
// entry — which path serves /[slug]/meni
// =============================================================================

describe("menuPublic.entry", () => {
  test("is none for an unknown slug, a malformed slug, a venue without a service and an unpublished service", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await t.run(async (ctx) => {
      await ctx.db.insert("businesses", {
        name: "Bez menija",
        slug: "bez-menija",
        status: "active",
        createdAt: Date.now(),
      });
    });

    for (const slug of ["nepostojeci-lokal", "Ne Postoji!", "", "bez-menija", SLUG_A, SLUG_B]) {
      expect(await t.query(api.menuPublic.entry, { slug }), slug).toEqual({ kind: "none" });
    }
  });

  test("is new after a publish and carries the version number", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 1,
    });

    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: content.burger.articleId,
      expectedPriceRsd: 450,
      priceRsd: 480,
    });
    // An unpublished edit does not change what the entry says.
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 1,
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 2,
    });
    // Another venue is unaffected.
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "none" });
  });

  test("is new for a slug typed with capitals and spaces around it", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.entry, { slug: "  KAFANA-KOD-MIKE " })).toEqual({
      kind: "new",
      versionNumber: 1,
    });
  });

  test("is legacy for a venue with only a published legacy menu, and none for a legacy draft", async () => {
    const { t, w } = await setup();
    const now = Date.now();
    const legacyId = await t.run(
      async (ctx) =>
        await ctx.db.insert("menus", {
          businessId: w.a.businessId,
          status: "published",
          design: null,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
    );
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "legacy" });
    // The legacy menu of venue A says nothing about venue B.
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "none" });
    // The new model has no published version: the page read does not serve it.
    expect(await readPage(t, { slug: SLUG_A })).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(legacyId, { status: "draft" });
    });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "none" });
  });

  test("the new model wins as soon as a version is published, even beside a published legacy menu", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("menus", {
        businessId: w.a.businessId,
        status: "published",
        design: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "legacy" });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 1,
    });
  });

  test("is none for an inactive or archived business, with a published version and with a published legacy menu", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("menus", {
        businessId: w.b.businessId,
        status: "published",
        design: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "legacy" });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
      await ctx.db.patch(w.b.businessId, { status: "inactive" });
    });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "none" });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "none" });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "active", archivedAt: Date.now() });
      await ctx.db.patch(w.b.businessId, { status: "active", archivedAt: Date.now() });
    });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "none" });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "none" });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { archivedAt: undefined });
    });
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 1,
    });
  });
});

// =============================================================================
// page — one page, the splitter, and what guests never see
// =============================================================================

describe("menuPublic.page — which page is returned", () => {
  test("a single visible page is returned without a page slug, with everything a guest needs", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const page = asPage(await readPage(t, { slug: SLUG_A }));
    expect(page).toMatchObject({
      kind: "page",
      menuServiceId: w.a.menuServiceId,
      versionNumber: 1,
      business: { name: "Kafana kod Mike", slug: SLUG_A },
      lang: "sr",
      sourceLang: "sr",
      languages: ["sr"],
      allergensEnabled: false,
      roomService: false,
    });
    expect(page.pages).toHaveLength(1);
    expect(page.page).toMatchObject({ slug: "glavni", isDefault: true, title: null });
    expect(sectionNames(page)).toEqual(["Pića", "Hrana"]);
    expect(articleNames(page)).toEqual(["Jelen pivo", "Espreso", "Pljeskavica", "Pita sa sirom"]);
    expect(priceOf(page, "Pljeskavica")).toBe(450);
    expect(priceOf(page, "Espreso")).toBe(150);
  });

  test("the page can also be asked for by its own slug", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const byDefault = asPage(await readPage(t, { slug: SLUG_A }));
    const bySlug = asPage(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" }));
    expect(bySlug).toEqual(byDefault);
  });

  test("with two visible pages and no page slug the splitter lists both; a page slug returns only that page", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const wine = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    // A shared article is shown on both pages.
    await owner.mutation(api.menuCatalog.addPlacement, {
      sectionId: wineSection.sectionId,
      articleId: content.beer.articleId,
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const splitter = asSplitter(await readPage(t, { slug: SLUG_A }));
    expect(splitter.pages.map((page) => page.slug)).toEqual(["glavni", wine.slug]);
    expect(splitter.pages.map((page) => page.isDefault)).toEqual([true, false]);
    expect(splitter).toMatchObject({ versionNumber: 1, lang: "sr", languages: ["sr"] });
    expect(splitter).not.toHaveProperty("sections");

    const main = asPage(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" }));
    expect(articleNames(main)).toEqual(["Jelen pivo", "Espreso", "Pljeskavica", "Pita sa sirom"]);
    expect(JSON.stringify(main)).not.toContain("Vranac");

    const wines = asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug }));
    expect(wines.page.slug).toBe(wine.slug);
    expect(sectionNames(wines)).toEqual(["Vina"]);
    // Vranac was added first, the shared Jelen pivo placement came after it.
    expect(articleNames(wines)).toEqual(["Vranac", "Jelen pivo"]);
    expect(priceOf(wines, "Jelen pivo")).toBe(200);
    expect(JSON.stringify(wines)).not.toContain("Pljeskavica");
  });

  test("a page slug that is hidden, archived, unknown or malformed gives null", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const hidden = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Skrivena stranica",
    });
    const archived = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Arhivirana stranica",
    });
    for (const page of [hidden, archived]) {
      const section = await addSection(t, w.ownerId, page.pageId, "Sekcija");
      await addArticle(t, w.ownerId, section.sectionId, `Artikal ${page.slug}`, 100);
    }
    await owner.mutation(api.menuPages.archive, { pageId: archived.pageId });
    await t.run(async (ctx) => {
      await ctx.db.patch(hidden.pageId, { visibility: "hidden" });
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    for (const pageSlug of [hidden.slug, archived.slug, "nema-takve", "Bad Slug!"]) {
      expect(await readPage(t, { slug: SLUG_A, pageSlug }), pageSlug).toBeNull();
    }
    // Only the default page is visible, so no splitter is needed.
    const page = asPage(await readPage(t, { slug: SLUG_A }));
    expect(page.pages.map((row) => row.slug)).toEqual(["glavni"]);
    const json = JSON.stringify(page);
    for (const text of [hidden.slug, archived.slug, "Skrivena stranica", "Arhivirana stranica"]) {
      expect(json).not.toContain(text);
    }
  });

  test("when every page is hidden the guest gets an empty splitter, never a page", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.defaultPageId, { visibility: "hidden" });
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const splitter = asSplitter(await readPage(t, { slug: SLUG_A }));
    expect(splitter.pages).toEqual([]);
    expect(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" })).toBeNull();
  });
});

describe("menuPublic.page — what guests never see", () => {
  test("the default page has no title and its internal name is nowhere in the result; other internal names stay inside too", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const wine = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Interna vina",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    await t.run(async (ctx) => {
      await ctx.db.patch(wine.pageId, { publicTitle: "Naša vina" });
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const splitter = asSplitter(await readPage(t, { slug: SLUG_A }));
    expect(splitter.pages.map((page) => page.title)).toEqual([null, "Naša vina"]);
    const main = asPage(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" }));
    expect(main.page.title).toBeNull();
    const wines = asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug }));
    expect(wines.page.title).toBe("Naša vina");

    for (const result of [splitter, main, wines]) {
      const json = JSON.stringify(result);
      expect(json).not.toContain(INTERNAL_PAGE_NAME);
      expect(json).not.toContain("Interna vina");
    }
  });

  test("hidden placements, hidden sections, sections without shown articles and empty sections are left out", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);

    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: content.coffee.placementId,
      visibility: "hidden",
    });

    const secret = await addSection(t, w.ownerId, w.a.defaultPageId, "Skrivena sekcija");
    await addArticle(t, w.ownerId, secret.sectionId, "Tajni koktel", 700);
    await t.run(async (ctx) => {
      await ctx.db.patch(secret.sectionId, { visibility: "hidden" });
    });

    const onlyHidden = await addSection(t, w.ownerId, w.a.defaultPageId, "Samo skriveni artikli");
    const hiddenDish = await addArticle(t, w.ownerId, onlyHidden.sectionId, "Skriveno jelo", 500);
    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: hiddenDish.placementId,
      visibility: "hidden",
    });

    await addSection(t, w.ownerId, w.a.defaultPageId, "Prazna sekcija");
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const page = asPage(await readPage(t, { slug: SLUG_A }));
    expect(sectionNames(page)).toEqual(["Pića", "Hrana"]);
    expect(articleNames(page)).toEqual(["Jelen pivo", "Pljeskavica", "Pita sa sirom"]);
    const json = JSON.stringify(page);
    for (const text of [
      "Espreso",
      "Tajni koktel",
      "Skrivena sekcija",
      "Samo skriveni artikli",
      "Skriveno jelo",
      "Prazna sekcija",
    ]) {
      expect(json, text).not.toContain(text);
    }
  });

  test("a hidden page's articles are not served on a visible page that does not show them", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const staff = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Za osoblje",
    });
    const staffSection = await addSection(t, w.ownerId, staff.pageId, "Interno");
    await addArticle(t, w.ownerId, staffSection.sectionId, "Obrok osoblja", 250);
    await t.run(async (ctx) => {
      await ctx.db.patch(staff.pageId, { visibility: "hidden" });
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const page = asPage(await readPage(t, { slug: SLUG_A }));
    expect(JSON.stringify(page)).not.toContain("Obrok osoblja");
    expect(await readPage(t, { slug: SLUG_A, pageSlug: staff.slug })).toBeNull();
  });
});

// =============================================================================
// The draft never leaks
// =============================================================================

describe("menuPublic.page — the draft never leaks", () => {
  test("price, name, section, visibility and new articles/pages change nothing for guests until the next publish", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const before = await readPage(t, { slug: SLUG_A });
    expect(asPage(before).versionNumber).toBe(1);

    await owner.mutation(api.menuCatalog.setBasePrice, {
      articleId: content.burger.articleId,
      expectedPriceRsd: 450,
      priceRsd: 520,
    });
    await owner.mutation(api.menuCatalog.updateArticleFields, {
      articleId: content.burger.articleId,
      expected: { name: "Pljeskavica" },
      patch: { name: "Pljeskavica XL" },
    });
    await owner.mutation(api.menuCatalog.renameSection, {
      sectionId: content.drinks.sectionId,
      name: "Napici",
      expectedName: "Pića",
    });
    await addArticle(t, w.ownerId, content.food.sectionId, "Novi desert", 280);
    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: content.coffee.placementId,
      visibility: "hidden",
    });
    // A second visible page in the draft must not turn the guest page into a splitter.
    const dessert = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Poslastice",
    });
    const dessertSection = await addSection(t, w.ownerId, dessert.pageId, "Torte");
    await addArticle(t, w.ownerId, dessertSection.sectionId, "Sacher torta", 350);

    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("dirty");
    expect(await readPage(t, { slug: SLUG_A })).toEqual(before);
    expect(await readPage(t, { slug: SLUG_A, pageSlug: dessert.slug })).toBeNull();
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 1,
    });

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const splitter = asSplitter(await readPage(t, { slug: SLUG_A }));
    expect(splitter.versionNumber).toBe(2);
    expect(splitter.pages.map((page) => page.slug)).toEqual(["glavni", dessert.slug]);
    const main = asPage(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" }));
    expect(sectionNames(main)).toEqual(["Napici", "Hrana"]);
    expect(articleNames(main)).toEqual(["Jelen pivo", "Pljeskavica XL", "Pita sa sirom", "Novi desert"]);
    expect(priceOf(main, "Pljeskavica XL")).toBe(520);
    expect(JSON.stringify(main)).not.toContain("Espreso");
  });

  test("an article deleted in the draft is still served until the next publish", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const before = await readPage(t, { slug: SLUG_A });

    const impact = await owner.mutation(api.menuArticleDetails.deleteArticle, {
      articleId: content.pita.articleId,
    });
    if (impact.status !== "confirm") throw new Error("expected a confirmation first");
    const deleted = await owner.mutation(api.menuArticleDetails.deleteArticle, {
      articleId: content.pita.articleId,
      confirmToken: impact.confirmToken,
    });
    expect(deleted.status).toBe("deleted");

    expect(await readPage(t, { slug: SLUG_A })).toEqual(before);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(articleNames(asPage(await readPage(t, { slug: SLUG_A })))).toEqual([
      "Jelen pivo",
      "Espreso",
      "Pljeskavica",
    ]);
  });

  test("a venue whose draft was never published returns null from page and roomService", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    expect(await readPage(t, { slug: SLUG_A })).toBeNull();
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("never_published");
  });
});

// =============================================================================
// Tenant isolation
// =============================================================================

describe("menuPublic — tenants", () => {
  test("publishing A never shows on B's slug, and B's unpublished draft returns null for B's slug", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const wine = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    // B only has a draft.
    const pasta = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pasta");
    await addArticle(t, w.otherOwnerId, pasta.sectionId, "Špageti", 600);
    expect(await readPage(t, { slug: SLUG_B })).toBeNull();
    expect(await readPage(t, { slug: SLUG_B, pageSlug: wine.slug })).toBeNull();
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "none" });
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_B })).toBeNull();
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.b.menuServiceId })).toBeNull();

    // Once B publishes, each slug shows only its own content.
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);
    const pageB = asPage(await readPage(t, { slug: SLUG_B }));
    expect(pageB.business).toEqual({ name: "Demo restoran", slug: SLUG_B });
    expect(articleNames(pageB)).toEqual(["Špageti"]);
    expect(pageB.menuServiceId).toBe(w.b.menuServiceId);
    expect(JSON.stringify(pageB)).not.toMatch(/Pljeskavica|Vranac|Kafana kod Mike/);
    // A's second page does not exist on B.
    expect(await readPage(t, { slug: SLUG_B, pageSlug: wine.slug })).toBeNull();

    const splitterA = asSplitter(await readPage(t, { slug: SLUG_A }));
    expect(splitterA.menuServiceId).toBe(w.a.menuServiceId);
    const mainA = asPage(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" }));
    expect(JSON.stringify(mainA)).not.toMatch(/Špageti|Demo restoran/);
  });
});

// =============================================================================
// Gating
// =============================================================================

describe("menuPublic — gating", () => {
  async function publishedWorld() {
    const world = await setup();
    await menuContent(world.t, world.w);
    await publishNow(world.t, world.w.ownerId, world.w.a.menuServiceId);
    return world;
  }

  async function publicSurface(t: T, w: MenuWorldSeed) {
    return {
      entry: await t.query(api.menuPublic.entry, { slug: SLUG_A }),
      page: await readPage(t, { slug: SLUG_A }),
      roomService: await t.query(api.menuPublic.roomService, { slug: SLUG_A }),
      availability: await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId }),
    };
  }

  test("a Menu profile that is not active stops everything, and everything is back when it is active again", async () => {
    const { t, w } = await publishedWorld();
    const live = await publicSurface(t, w);
    expect(live.entry).toEqual({ kind: "new", versionNumber: 1 });
    expect(live.page).not.toBeNull();
    expect(live.availability).toEqual({ articleKeys: [] });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    expect(await publicSurface(t, w)).toEqual({
      entry: { kind: "none" },
      page: null,
      roomService: null,
      availability: null,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "active" });
    });
    expect(await publicSurface(t, w)).toEqual(live);
  });

  test("ScanMe switching client editing off does not hide the published menu", async () => {
    const { t, w } = await publishedWorld();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    expect((await publicSurface(t, w)).entry).toEqual({ kind: "new", versionNumber: 1 });
    expect(asPage(await readPage(t, { slug: SLUG_A })).business.slug).toBe(SLUG_A);
  });

  test("an inactive or archived business serves nothing", async () => {
    const { t, w } = await publishedWorld();
    const live = await publicSurface(t, w);

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });
    expect(await publicSurface(t, w)).toEqual({
      entry: { kind: "none" },
      page: null,
      roomService: null,
      availability: null,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "active", archivedAt: Date.now() });
    });
    expect(await publicSurface(t, w)).toEqual({
      entry: { kind: "none" },
      page: null,
      roomService: null,
      availability: null,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { archivedAt: undefined });
    });
    expect(await publicSurface(t, w)).toEqual(live);
  });

  test("an archived Menu service serves nothing", async () => {
    const { t, w } = await publishedWorld();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "archived" });
    });
    expect(await publicSurface(t, w)).toEqual({
      entry: { kind: "none" },
      page: null,
      roomService: null,
      availability: null,
    });
  });

  test("the public queries need no identity and ignore a signed-in stranger's rights", async () => {
    const { t, w } = await publishedWorld();
    const anonymous = await readPage(t, { slug: SLUG_A });
    const stranger = await as(t, w.outsiderId).query(api.menuPublic.page, { slug: SLUG_A });
    const otherTenant = await as(t, w.otherOwnerId).query(api.menuPublic.page, { slug: SLUG_A });
    expect(stranger).toEqual(anonymous);
    expect(otherTenant).toEqual(anonymous);
  });
});

// =============================================================================
// Languages
// =============================================================================

describe("menuPublic.page — languages", () => {
  async function translatedWorld() {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    await as(t, w.ownerId).mutation(api.menuSettings.setLanguages, {
      menuServiceId: w.a.menuServiceId,
      translations: ["en"],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(content.burger.articleId, {
        translations: { en: { name: "Burger", status: "confirmed" } },
      });
      await ctx.db.patch(content.pita.articleId, {
        translations: { en: { name: "Cheese pie", status: "suggested" } },
      });
      await ctx.db.patch(content.drinks.sectionId, {
        translations: { en: { name: "Drinks", status: "confirmed" } },
      });
      await ctx.db.patch(w.a.defaultPageId, {
        publicTitle: "Naš meni",
        translations: { en: { publicTitle: "Our menu", status: "confirmed" } },
      });
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    return { t, w, content };
  }

  test("a confirmed translation is served, a suggested one never is: the Serbian source shows instead", async () => {
    const { t } = await translatedWorld();

    const en = asPage(await readPage(t, { slug: SLUG_A, lang: "en" }));
    expect(en).toMatchObject({ lang: "en", sourceLang: "sr", languages: ["sr", "en"] });
    expect(articleNames(en)).toEqual(["Jelen pivo", "Espreso", "Burger", "Pita sa sirom"]);
    expect(sectionNames(en)).toEqual(["Drinks", "Hrana"]);
    expect(en.page.title).toBe("Our menu");
    expect(priceOf(en, "Burger")).toBe(450);
    expect(JSON.stringify(en)).not.toContain("Cheese pie");

    const sr = asPage(await readPage(t, { slug: SLUG_A, lang: "sr" }));
    expect(sr.lang).toBe("sr");
    expect(articleNames(sr)).toEqual(["Jelen pivo", "Espreso", "Pljeskavica", "Pita sa sirom"]);
    expect(sectionNames(sr)).toEqual(["Pića", "Hrana"]);
    expect(sr.page.title).toBe("Naš meni");
    expect(JSON.stringify(sr)).not.toMatch(/Burger|Cheese pie|Drinks|Our menu/);
  });

  test("no language, an unknown language, a language outside the version and a malformed code all serve the source language", async () => {
    const { t } = await translatedWorld();
    const source = asPage(await readPage(t, { slug: SLUG_A, lang: "sr" }));
    for (const lang of [undefined, "de", "fr", "x!!", "", "english-text-way-too-long"]) {
      const page = asPage(await readPage(t, { slug: SLUG_A, ...(lang !== undefined ? { lang } : {}) }));
      expect(page.lang, String(lang)).toBe("sr");
      expect(page, String(lang)).toEqual(source);
    }
  });

  test("the asked language is matched ignoring case and surrounding spaces", async () => {
    const { t } = await translatedWorld();
    const page = asPage(await readPage(t, { slug: SLUG_A, lang: " EN " }));
    expect(page.lang).toBe("en");
    expect(articleNames(page)).toContain("Burger");
  });

  test("the splitter and the page carry the same language", async () => {
    const { t, w } = await translatedWorld();
    const owner = as(t, w.ownerId);
    const wine = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const splitter = asSplitter(await readPage(t, { slug: SLUG_A, lang: "en" }));
    expect(splitter.lang).toBe("en");
    expect(splitter.pages.map((page) => page.title)).toEqual(["Our menu", null]);
    const wines = asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug, lang: "en" }));
    expect(wines.lang).toBe("en");
  });

  test("a language added to the draft after publishing is not served until the next publish", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuSettings.setLanguages, {
      menuServiceId: w.a.menuServiceId,
      translations: ["en"],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(content.burger.articleId, {
        translations: { en: { name: "Burger", status: "confirmed" } },
      });
    });

    const page = asPage(await readPage(t, { slug: SLUG_A, lang: "en" }));
    expect(page.lang).toBe("sr");
    expect(page.languages).toEqual(["sr"]);
    expect(articleNames(page)).toContain("Pljeskavica");

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const after = asPage(await readPage(t, { slug: SLUG_A, lang: "en" }));
    expect(after.lang).toBe("en");
    expect(articleNames(after)).toContain("Burger");
  });
});

// =============================================================================
// Room service
// =============================================================================

describe("menuPublic.roomService", () => {
  const RS = api.menuRoomService;

  /**
   * Premium + the main menu + Room service with one category "Hrana u sobu"
   * (Pljeskavica 450 and Pita sa sirom 320), 10 % markup, a manual price of 399
   * for the pita and a delivery fee of 150. The switch is ON; nothing published.
   */
  async function roomServiceDraft(options: { switchOn?: boolean } = {}) {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const category = await owner.mutation(RS.addCategory, {
      menuServiceId: w.a.menuServiceId,
      name: "Hrana u sobu",
    });
    await owner.mutation(RS.addItems, {
      categoryId: category.categoryId,
      articleIds: [content.burger.articleId, content.pita.articleId],
    });
    expect(
      await owner.mutation(RS.updateSettings, {
        menuServiceId: w.a.menuServiceId,
        expected: { markupPercent: null, deliveryFeeRsd: null },
        patch: { markupPercent: 10, deliveryFeeRsd: 150 },
      }),
    ).toEqual({ ok: true });
    const view = await owner.query(RS.get, { menuServiceId: w.a.menuServiceId });
    const pitaItem = view?.categories
      .flatMap((row) => row.items)
      .find((item) => item.article.articleId === content.pita.articleId);
    if (!pitaItem) throw new Error("the pita is not in Room service");
    expect(
      await owner.mutation(RS.setManualPrice, {
        itemId: pitaItem.itemId,
        expectedManualPriceRsd: null,
        manualPriceRsd: 399,
      }),
    ).toEqual({ ok: true });
    if (options.switchOn !== false) {
      expect(
        await owner.mutation(api.menuServices.setFeature, {
          menuServiceId: w.a.menuServiceId,
          feature: "roomService",
          enabled: true,
        }),
      ).toEqual({ ok: true });
    }
    return { t, w, content, category, pitaItem };
  }

  function switchRoomService(t: T, w: MenuWorldSeed, enabled: boolean) {
    return as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: w.a.menuServiceId,
      feature: "roomService",
      enabled,
    });
  }

  test("returns the categories with Room service prices (markup applied) and the delivery fee after a publish", async () => {
    const { t, w } = await roomServiceDraft();
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const rs = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    if (!rs) throw new Error("expected Room service");
    expect(rs).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      versionNumber: 1,
      lang: "sr",
      business: { name: "Kafana kod Mike", slug: SLUG_A },
      deliveryFeeRsd: 150,
      roomService: true,
    });
    expect(rs.categories).toHaveLength(1);
    expect(rs.categories[0].name).toBe("Hrana u sobu");
    expect(rs.categories[0].articles.map((article) => article.name)).toEqual([
      "Pljeskavica",
      "Pita sa sirom",
    ]);
    expect(rs.categories[0].articles[0]).toMatchObject({ priceRsd: 495, priceOrigin: "computed" });
    expect(rs.categories[0].articles[1]).toMatchObject({ priceRsd: 399, priceOrigin: "manual" });

    // The ordinary page keeps the base prices and flags the channel.
    const page = asPage(await readPage(t, { slug: SLUG_A }));
    expect(page.roomService).toBe(true);
    expect(priceOf(page, "Pljeskavica")).toBe(450);
    expect(priceOf(page, "Pita sa sirom")).toBe(320);
    // Articles that are only in Room service stay off the ordinary page's text.
    expect(JSON.stringify(rs)).not.toContain("Espreso");
  });

  test("switching the feature OFF hides it at once without publishing, and ON shows the same content again", async () => {
    const { t, w } = await roomServiceDraft();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const shown = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    expect(shown).not.toBeNull();
    expect(asPage(await readPage(t, { slug: SLUG_A })).roomService).toBe(true);

    expect(await switchRoomService(t, w, false)).toEqual({ ok: true });
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
    expect(asPage(await readPage(t, { slug: SLUG_A })).roomService).toBe(false);
    // A live switch is not a draft change: there is nothing to publish.
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("clean");

    expect(await switchRoomService(t, w, true)).toEqual({ ok: true });
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toEqual(shown);
    expect(asPage(await readPage(t, { slug: SLUG_A })).roomService).toBe(true);
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("clean");
  });

  test("a venue that published with the switch OFF shows no Room service when it is switched ON, until the next publish", async () => {
    const { t, w, category } = await roomServiceDraft({ switchOn: false });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();

    expect(await switchRoomService(t, w, true)).toEqual({ ok: true });
    // The published version has no Room service part: nothing to show yet.
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
    expect(asPage(await readPage(t, { slug: SLUG_A })).roomService).toBe(false);

    // K05 fix: the draft is unchanged, but what guests would get is not. The
    // preview says so and publishing works without any draft edit.
    const preview = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(preview).toMatchObject({ state: "clean", wouldChange: true, roomService: true });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const rs = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    expect(rs?.categories.map((row) => row.name)).toEqual(["Hrana u sobu"]);

    // A draft edit is published as usual.
    await as(t, w.ownerId).mutation(RS.renameCategory, {
      categoryId: category.categoryId,
      name: "Hrana za sobu",
      expectedName: "Hrana u sobu",
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const renamed = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    expect(renamed?.categories.map((row) => row.name)).toEqual(["Hrana za sobu"]);
  });

  test("Premium lost after publishing: the next publish removes Room service even without a draft edit", async () => {
    const { t, w } = await roomServiceDraft();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.accountId, { plan: "basic", updatedAt: Date.now() });
    });
    const preview = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(preview).toMatchObject({ state: "clean", wouldChange: true, roomService: false });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();

    // After that, an unchanged draft with an unchanged output has nothing to publish.
    const again = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(again).toMatchObject({ state: "clean", wouldChange: false });
    const refused = await as(t, w.ownerId).mutation(api.menuPublishing.publish, {
      menuServiceId: w.a.menuServiceId,
      expectedRevision: again?.revision ?? -1,
      acknowledgedWarnings: again?.fingerprint ?? undefined,
    });
    expect(refused).toMatchObject({ ok: false, reason: "no_changes" });
  });

  test("Room service prices follow the published version, not the draft", async () => {
    const { t, w, content } = await roomServiceDraft();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const published = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    const owner = as(t, w.ownerId);

    expect(
      await owner.mutation(RS.updateSettings, {
        menuServiceId: w.a.menuServiceId,
        expected: { markupPercent: 10, deliveryFeeRsd: 150 },
        patch: { markupPercent: 20, deliveryFeeRsd: 300 },
      }),
    ).toEqual({ ok: true });
    expect(
      await owner.mutation(api.menuCatalog.setBasePrice, {
        articleId: content.burger.articleId,
        expectedPriceRsd: 450,
        priceRsd: 500,
      }),
    ).toEqual({ ok: true });
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toEqual(published);

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const next = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    expect(next?.deliveryFeeRsd).toBe(300);
    expect(next?.categories[0].articles[0]).toMatchObject({ name: "Pljeskavica", priceRsd: 600 });
    expect(next?.categories[0].articles[1]).toMatchObject({ name: "Pita sa sirom", priceRsd: 399 });
  });

  test("Premium lost after publishing: the published Room service is served until the next publish, which warns and leaves it out", async () => {
    const { t, w, content } = await roomServiceDraft();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const shown = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    expect(shown).not.toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.accountId, { plan: "basic", updatedAt: Date.now() });
    });
    // The published version does not change by itself.
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toEqual(shown);

    await as(t, w.ownerId).mutation(api.menuCatalog.renameSection, {
      sectionId: content.drinks.sectionId,
      name: "Napici",
      expectedName: "Pića",
    });
    const preview = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(preview?.roomService).toBe(false);
    expect(preview?.warnings.map((warning) => warning.code)).toContain("room_service_premium");

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
    const page = asPage(await readPage(t, { slug: SLUG_A }));
    expect(page.versionNumber).toBe(2);
    expect(page.roomService).toBe(false);
    expect(sectionNames(page)).toEqual(["Napici", "Hrana"]);
  });

  test("no document ids or bookkeeping fields reach guests, in the page, the splitter or Room service", async () => {
    const { t, w } = await roomServiceDraft();
    const owner = as(t, w.ownerId);
    const wine = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const results = [
      await readPage(t, { slug: SLUG_A }),
      await readPage(t, { slug: SLUG_A, pageSlug: "glavni" }),
      await readPage(t, { slug: SLUG_A, pageSlug: wine.slug }),
      await t.query(api.menuPublic.roomService, { slug: SLUG_A }),
      await t.query(api.menuPublic.entry, { slug: SLUG_A }),
      await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId }),
    ];
    for (const result of results) {
      expect(result).not.toBeNull();
      expect(JSON.stringify(result)).not.toMatch(
        /"(_id|_creationTime|nameNormalized|createdAt|updatedAt|updatedByUserId|setByUserId|userId|translations|priceCheck|businessId|accountId)"/,
      );
    }
  });

  test("is null for a venue without Room service, for an unpublished venue and for another tenant's slug", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_B })).toBeNull();
    expect(await t.query(api.menuPublic.roomService, { slug: "Ne Postoji!" })).toBeNull();
  });

  test("a venue switched off by gating (inactive business) serves no Room service even with the switch on", async () => {
    const { t, w } = await roomServiceDraft();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).not.toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });
    expect(await t.query(api.menuPublic.roomService, { slug: SLUG_A })).toBeNull();
  });
});

// =============================================================================
// availability — the live "Privremeno nedostupno" layer
// =============================================================================

describe("menuPublic.availability", () => {
  test("is null for an unpublished service and an empty list after the first publish", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId })).toBeNull();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId })).toEqual({
      articleKeys: [],
    });
  });

  test("lists the unavailable article keys (sorted) at once, without publishing, and the page itself does not change", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const pageBefore = await readPage(t, { slug: SLUG_A });
    const revisionBefore = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;
    const read = () => t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId });

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.burger.articleId,
      available: false,
    });
    expect(await read()).toEqual({ articleKeys: [content.burger.key] });

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.beer.articleId,
      available: false,
    });
    expect(await read()).toEqual({ articleKeys: [content.burger.key, content.beer.key].sort() });

    // Nothing was published: same version, same page, no draft change.
    expect(await readPage(t, { slug: SLUG_A })).toEqual(pageBefore);
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
      kind: "new",
      versionNumber: 1,
    });
    const status = await draftStatus(t, w.ownerId, w.a.menuServiceId);
    expect(status.revision).toBe(revisionBefore);
    expect(status.state).toBe("clean");

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.burger.articleId,
      available: true,
    });
    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.beer.articleId,
      available: true,
    });
    expect(await read()).toEqual({ articleKeys: [] });
  });

  test("each venue's list holds only its own articles", async () => {
    const { t, w } = await setup();
    const a = await menuContent(t, w);
    const pasta = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pasta");
    const b = await addArticle(t, w.otherOwnerId, pasta.sectionId, "Špageti", 600);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: a.burger.articleId,
      available: false,
    });
    await as(t, w.otherOwnerId).mutation(api.menuAvailability.setAvailability, {
      articleId: b.articleId,
      available: false,
    });

    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId })).toEqual({
      articleKeys: [a.burger.key],
    });
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.b.menuServiceId })).toEqual({
      articleKeys: [b.key],
    });
  });

  test("an article deleted in the draft stays listed until the next publish removes its row", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.burger.articleId,
      available: false,
    });

    const impact = await owner.mutation(api.menuArticleDetails.deleteArticle, {
      articleId: content.burger.articleId,
    });
    if (impact.status !== "confirm") throw new Error("expected a confirmation first");
    await owner.mutation(api.menuArticleDetails.deleteArticle, {
      articleId: content.burger.articleId,
      confirmToken: impact.confirmToken,
    });
    // The published menu still shows the article, so it still shows as unavailable.
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId })).toEqual({
      articleKeys: [content.burger.key],
    });

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId })).toEqual({
      articleKeys: [],
    });
  });

  test("is null when the profile or the business is not active, and for an unknown service", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: content.beer.articleId,
      available: false,
    });
    const read = () => t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId });
    expect(await read()).toEqual({ articleKeys: [content.beer.key] });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    expect(await read()).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "active" });
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });
    expect(await read()).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "active" });
    });
    expect(await read()).toEqual({ articleKeys: [content.beer.key] });
  });
});

// =============================================================================
// Budget — a big menu reads a handful of documents
// =============================================================================

/**
 * `sections` x 50 articles on one page, published with the REAL Convex
 * transaction limits enforced, then one guest read of `entry` and `page` run as
 * nested queries with tightened limits (15 documents, 10 queries).
 */
async function expectWithinReadBudget(sections: number) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const perSection = 50;
  for (let s = 0; s < sections; s += 1) {
    const section = await addSection(t, w.ownerId, w.a.defaultPageId, `Sekcija ${s + 1}`);
    for (let i = 0; i < perSection; i += 1) {
      await addArticle(t, w.ownerId, section.sectionId, `Artikal ${s + 1}-${i + 1}`, 100 + i);
    }
  }

  // Real limits are enforced: this throws if the publish goes over them.
  const published = await publishNow(t, w.ownerId, w.a.menuServiceId);
  expect(published.versionNumber).toBe(1);

  const measured = await t.run(async (ctx) => {
    const beforeEntry = await ctx.meta.getTransactionMetrics();
    const entry = await ctx.runQuery(
      api.menuPublic.entry,
      { slug: SLUG_A },
      { transactionLimits: { documentsRead: 15, databaseQueries: 10 } },
    );
    const afterEntry = await ctx.meta.getTransactionMetrics();
    const before = await ctx.meta.getTransactionMetrics();
    // A nested query with tightened limits: it throws if the page read exceeds them.
    const page = await ctx.runQuery(
      api.menuPublic.page,
      { slug: SLUG_A },
      { transactionLimits: { documentsRead: 15, databaseQueries: 10 } },
    );
    const after = await ctx.meta.getTransactionMetrics();
    return {
      entry,
      entryDocumentsRead: afterEntry.documentsRead.used - beforeEntry.documentsRead.used,
      entryQueries: afterEntry.databaseQueries.used - beforeEntry.databaseQueries.used,
      page,
      documentsRead: after.documentsRead.used - before.documentsRead.used,
      databaseQueries: after.databaseQueries.used - before.databaseQueries.used,
    };
  });

  expect(measured.entry).toEqual({ kind: "new", versionNumber: 1 });
  expect(measured.entryDocumentsRead).toBeLessThanOrEqual(15);
  expect(measured.entryQueries).toBeLessThanOrEqual(10);

  expect(measured.documentsRead).toBeGreaterThan(0);
  expect(measured.documentsRead).toBeLessThanOrEqual(15);
  expect(measured.databaseQueries).toBeGreaterThan(0);
  expect(measured.databaseQueries).toBeLessThanOrEqual(10);

  // The whole menu really came back.
  const page = asPage(measured.page);
  expect(page.sections).toHaveLength(sections);
  expect(page.sections.flatMap((section) => section.articles)).toHaveLength(sections * perSection);

  // Control: the nested limits are really enforced (a limit below the real cost throws).
  await expect(
    t.run(
      async (ctx) =>
        await ctx.runQuery(
          api.menuPublic.page,
          { slug: SLUG_A },
          { transactionLimits: { documentsRead: 2 } },
        ),
    ),
  ).rejects.toThrow(/too many documents/i);
}

describe("menuPublic — read budget", () => {
  test(
    "400 articles publish within real Convex limits and one page read stays within 15 documents and 10 queries",
    async () => {
      await expectWithinReadBudget(8);
    },
    180_000,
  );

  test(
    "the 2000-article ceiling still publishes within real Convex limits and reads the same handful of documents",
    async () => {
      await expectWithinReadBudget(40);
    },
    300_000,
  );
});
