/// <reference types="vite/client" />

// ScanMe Menu V1 — K13: the public read path that the new /[slug]/meni renders
// from (plan K12-1, K12-3, K12-7). Added to menuPublic since K05:
//
//   live         version number + unavailable article keys, by slug (the small
//                subscription of an open phone);
//   pageMedia    signed image URLs of ONE page, ready assets of the venue itself,
//                at most MENU_PUBLIC_MEDIA_CAP point reads;
//   cutover      a service that replaced a legacy menu (legacyMenuId) is public
//                only once migration.status is "cutover";
//   logoUrl      stored file first, else the external URL, else null.
//
// Proven here: live (publish, live availability without a new version, gating,
// tenants), the draft never leaking into page / live / pageMedia, an archived or
// hidden page being gone for guests, another venue's data (pages and assets)
// never reaching a guest, the cutover rule and its revert, logoUrl, and the read
// budget of a menu bigger than the media cap.
//
// Fictional tenants only (the repo is public).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MENU_PUBLIC_MEDIA_CAP } from "./menuPublic";
import schema from "./schema";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  seedQrLink,
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

// -----------------------------------------------------------------------------
// World and content helpers (the same patterns as convex/menuPublic.test.ts)
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

/** Tenant B's default page: "Pasta" with one article "Špageti" (600). */
async function menuContentB(t: T, w: MenuWorldSeed) {
  const pasta = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pasta");
  const spaghetti = await addArticle(t, w.otherOwnerId, pasta.sectionId, "Špageti", 600);
  return { pasta, spaghetti };
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

function readLive(t: T, slug: string) {
  return t.query(api.menuPublic.live, { slug });
}

function readMedia(t: T, args: { slug: string; pageSlug?: string; lang?: string }) {
  return t.query(api.menuPublic.pageMedia, args);
}

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

// -----------------------------------------------------------------------------
// Media helpers: assets are inserted directly (the editor does not upload yet)
// -----------------------------------------------------------------------------

type StorageRefs = { avif: Id<"_storage">; webp: Id<"_storage">; thumb: Id<"_storage"> };

const WEBP_SIZE = { width: 1200, height: 800 };
const THUMB_SIZE = { width: 300, height: 200 };

/** Three small stored blobs with different content, so each has its own URL. */
async function storeRefs(t: T, label = "x"): Promise<StorageRefs> {
  return await t.run(async (ctx) => ({
    avif: await ctx.storage.store(new Blob([`avif-${label}`])),
    webp: await ctx.storage.store(new Blob([`webp-${label}`])),
    thumb: await ctx.storage.store(new Blob([`thumb-${label}`])),
  }));
}

async function storageUrl(t: T, ref: Id<"_storage">) {
  return await t.run(async (ctx) => await ctx.storage.getUrl(ref));
}

async function insertAsset(
  t: T,
  businessId: Id<"businesses">,
  refs: StorageRefs,
  status: "ready" | "purged" = "ready",
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("mediaAssets", {
        businessId,
        kind: "image",
        provider: "convex",
        variants: {
          avif: { ref: refs.avif, ...WEBP_SIZE, bytes: 4 },
          webp: { ref: refs.webp, ...WEBP_SIZE, bytes: 4 },
          thumb: { ref: refs.thumb, ...THUMB_SIZE, bytes: 5 },
        },
        status,
        createdAt: Date.now(),
      }),
  );
}

/** Points an article row at an asset, the way a finished upload would. */
async function showImage(t: T, articleId: Id<"menuArticles">, assetId: Id<"mediaAssets">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(articleId, { mediaMode: "image", imageMediaId: assetId });
  });
}

/** Rewrites text inside the PUBLIC parts of a service's versions (to plant ids a real flow cannot write). */
async function rewritePublicParts(
  t: T,
  menuServiceId: Id<"menuServices">,
  replacements: Array<[from: string, to: string]>,
) {
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("menuVersionParts").collect();
    for (const row of rows) {
      if (row.menuServiceId !== menuServiceId || row.scope !== "public") continue;
      let data = row.data;
      for (const [from, to] of replacements) data = data.split(from).join(to);
      if (data !== row.data) await ctx.db.patch(row._id, { data });
    }
  });
}

// =============================================================================
// 1. live — version number and "Privremeno nedostupno" by slug
// =============================================================================

describe("menuPublic.live", () => {
  test("is null for an unknown, malformed or unpublished slug; after the first publish it is version 1 with nothing unavailable", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    // B has a draft but nothing published.
    await menuContentB(t, w);

    for (const slug of ["nepostojeci-lokal", "Ne Postoji!", "", SLUG_A, SLUG_B]) {
      expect(await readLive(t, slug), slug).toBeNull();
    }

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const expected = { menuServiceId: w.a.menuServiceId, versionNumber: 1, unavailableKeys: [] };
    expect(await readLive(t, SLUG_A)).toEqual(expected);
    // The slug is read the way the page query reads it: case and spaces do not matter.
    expect(await readLive(t, "  KAFANA-KOD-MIKE ")).toEqual(expected);
    // B still has nothing published.
    expect(await readLive(t, SLUG_B)).toBeNull();
  });

  test("an unavailable article shows in live at once without a new publication, back to available removes it, a second publication raises the version", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const pageBefore = await readPage(t, { slug: SLUG_A });
    const revisionBefore = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.beer.articleId,
      available: false,
    });
    expect(await readLive(t, SLUG_A)).toEqual({
      menuServiceId: w.a.menuServiceId,
      versionNumber: 1,
      unavailableKeys: [content.beer.key],
    });

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.pita.articleId,
      available: false,
    });
    expect((await readLive(t, SLUG_A))?.unavailableKeys).toEqual([content.beer.key, content.pita.key].sort());
    expect((await readLive(t, SLUG_A))?.versionNumber).toBe(1);

    // Nothing was published: same page, no draft change, version still 1.
    expect(await readPage(t, { slug: SLUG_A })).toEqual(pageBefore);
    const status = await draftStatus(t, w.ownerId, w.a.menuServiceId);
    expect(status.revision).toBe(revisionBefore);
    expect(status.state).toBe("clean");

    // The live layer is the very same list the older availability query serves.
    expect((await readLive(t, SLUG_A))?.unavailableKeys).toEqual(
      (await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId }))?.articleKeys,
    );

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.beer.articleId,
      available: true,
    });
    expect((await readLive(t, SLUG_A))?.unavailableKeys).toEqual([content.pita.key]);

    // A second publication raises the version; the live availability is not part of a version.
    await owner.mutation(api.menuCatalog.setBasePrice, {
      articleId: content.burger.articleId,
      expectedPriceRsd: 450,
      priceRsd: 480,
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await readLive(t, SLUG_A)).toEqual({
      menuServiceId: w.a.menuServiceId,
      versionNumber: 2,
      unavailableKeys: [content.pita.key],
    });
    expect(asPage(await readPage(t, { slug: SLUG_A })).versionNumber).toBe(2);

    await owner.mutation(api.menuAvailability.setAvailability, {
      articleId: content.pita.articleId,
      available: true,
    });
    expect((await readLive(t, SLUG_A))?.unavailableKeys).toEqual([]);
  });

  test("is null while the business is inactive or archived, the Menu profile is inactive or the Menu service is archived, and comes back unchanged", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: content.coffee.articleId,
      available: false,
    });
    const live = await readLive(t, SLUG_A);
    expect(live).toEqual({
      menuServiceId: w.a.menuServiceId,
      versionNumber: 1,
      unavailableKeys: [content.coffee.key],
    });

    // The Menu profile (serviceProfiles) is not active.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    expect(await readLive(t, SLUG_A)).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "active" });
    });
    expect(await readLive(t, SLUG_A)).toEqual(live);

    // The business is inactive, then archived.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });
    expect(await readLive(t, SLUG_A)).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "active", archivedAt: Date.now() });
    });
    expect(await readLive(t, SLUG_A)).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { archivedAt: undefined });
    });
    expect(await readLive(t, SLUG_A)).toEqual(live);

    // The Menu service is archived.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "archived" });
    });
    expect(await readLive(t, SLUG_A)).toBeNull();
  });

  test("tenants: an unavailable article of A never appears in B's live, and B's never in A's", async () => {
    const { t, w } = await setup();
    const a = await menuContent(t, w);
    const b = await menuContentB(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);

    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: a.burger.articleId,
      available: false,
    });
    expect(await readLive(t, SLUG_A)).toEqual({
      menuServiceId: w.a.menuServiceId,
      versionNumber: 1,
      unavailableKeys: [a.burger.key],
    });
    expect(await readLive(t, SLUG_B)).toEqual({
      menuServiceId: w.b.menuServiceId,
      versionNumber: 1,
      unavailableKeys: [],
    });

    await as(t, w.otherOwnerId).mutation(api.menuAvailability.setAvailability, {
      articleId: b.spaghetti.articleId,
      available: false,
    });
    expect((await readLive(t, SLUG_B))?.unavailableKeys).toEqual([b.spaghetti.key]);
    expect((await readLive(t, SLUG_A))?.unavailableKeys).toEqual([a.burger.key]);

    // The two services have their own version counters.
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: a.beer.articleId,
      expectedPriceRsd: 200,
      priceRsd: 210,
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect((await readLive(t, SLUG_A))?.versionNumber).toBe(2);
    expect((await readLive(t, SLUG_B))?.versionNumber).toBe(1);
  });
});

// =============================================================================
// 2. The draft never leaks (plan K13 item 7)
// =============================================================================

describe("menuPublic — the draft never leaks into page, live or pageMedia", () => {
  test("a rename, a price, a section name, a hidden placement, a new article and a new image change nothing for guests until the next publish", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const refs = await storeRefs(t);
    const first = await insertAsset(t, w.a.businessId, refs);
    const second = await insertAsset(t, w.a.businessId, refs);
    await showImage(t, content.beer.articleId, first);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const guestView = async () => ({
      page: await readPage(t, { slug: SLUG_A }),
      live: await readLive(t, SLUG_A),
      media: await readMedia(t, { slug: SLUG_A }),
      entry: await t.query(api.menuPublic.entry, { slug: SLUG_A }),
      availability: await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId }),
    });
    const before = await guestView();
    expect(asPage(before.page).versionNumber).toBe(1);
    expect(before.live?.versionNumber).toBe(1);
    expect(Object.keys(before.media)).toEqual([first]);

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
    await owner.mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: content.coffee.placementId,
      visibility: "hidden",
    });
    await addArticle(t, w.ownerId, content.food.sectionId, "Novi desert", 280);
    // A different image on the draft article.
    await showImage(t, content.beer.articleId, second);

    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("dirty");
    expect(await guestView()).toEqual(before);
    const stillPublished = asPage(await readPage(t, { slug: SLUG_A }));
    expect(sectionNames(stillPublished)).toEqual(["Pića", "Hrana"]);
    expect(articleNames(stillPublished)).toEqual(["Jelen pivo", "Espreso", "Pljeskavica", "Pita sa sirom"]);
    expect(priceOf(stillPublished, "Pljeskavica")).toBe(450);

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const after = await guestView();
    const page = asPage(after.page);
    expect(page.versionNumber).toBe(2);
    expect(sectionNames(page)).toEqual(["Napici", "Hrana"]);
    expect(articleNames(page)).toEqual(["Jelen pivo", "Pljeskavica XL", "Pita sa sirom", "Novi desert"]);
    expect(priceOf(page, "Pljeskavica XL")).toBe(520);
    expect(JSON.stringify(page)).not.toContain("Espreso");
    expect(after.live?.versionNumber).toBe(2);
    expect(after.entry).toEqual({ kind: "new", versionNumber: 2 });
    expect(Object.keys(after.media)).toEqual([second]);
  });

  test("a page added in the draft stays unseen: not in the page list, not asked for by slug, no media", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    const owner = as(t, w.ownerId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const before = await readPage(t, { slug: SLUG_A });

    const dessert = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Poslastice",
    });
    const dessertSection = await addSection(t, w.ownerId, dessert.pageId, "Torte");
    const sacher = await addArticle(t, w.ownerId, dessertSection.sectionId, "Sacher torta", 350);
    const refs = await storeRefs(t);
    await showImage(t, sacher.articleId, await insertAsset(t, w.a.businessId, refs));

    expect(await readPage(t, { slug: SLUG_A })).toEqual(before);
    expect(await readPage(t, { slug: SLUG_A, pageSlug: dessert.slug })).toBeNull();
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: dessert.slug })).toEqual({});
    expect((await readLive(t, SLUG_A))?.versionNumber).toBe(1);

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(asSplitter(await readPage(t, { slug: SLUG_A })).pages.map((row) => row.slug)).toEqual([
      "glavni",
      dessert.slug,
    ]);
    expect(Object.keys(await readMedia(t, { slug: SLUG_A, pageSlug: dessert.slug }))).toHaveLength(1);
  });
});

// =============================================================================
// 3. An archived or hidden page is not available
// =============================================================================

describe("menuPublic — archived and hidden pages", () => {
  async function wineWorld() {
    const { t, w } = await setup();
    await menuContent(t, w);
    const owner = as(t, w.ownerId);
    const wine = await owner.mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    const vranac = await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    const refs = await storeRefs(t);
    const asset = await insertAsset(t, w.a.businessId, refs);
    await showImage(t, vranac.articleId, asset);
    return { t, w, owner, wine, asset };
  }

  test("after archiving the page and publishing again it has no page, no entry in the page list and no media; restoring and publishing brings it back", async () => {
    const { t, w, owner, wine, asset } = await wineWorld();
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const splitter = asSplitter(await readPage(t, { slug: SLUG_A }));
    expect(splitter.pages.map((row) => row.slug)).toEqual(["glavni", wine.slug]);
    expect(Object.keys(await readMedia(t, { slug: SLUG_A, pageSlug: wine.slug }))).toEqual([asset]);

    expect(await owner.mutation(api.menuPages.archive, { pageId: wine.pageId })).toEqual({ changed: true });
    // Archived in the draft only: guests still see the published page until Objavi.
    expect(asSplitter(await readPage(t, { slug: SLUG_A })).pages.map((row) => row.slug)).toEqual([
      "glavni",
      wine.slug,
    ]);
    expect(asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug })).page.slug).toBe(wine.slug);
    expect(Object.keys(await readMedia(t, { slug: SLUG_A, pageSlug: wine.slug }))).toEqual([asset]);

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug })).toBeNull();
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: wine.slug })).toEqual({});
    // One visible page is left: the page itself, with no splitter and no trace of the archived one.
    const single = asPage(await readPage(t, { slug: SLUG_A }));
    expect(single.pages.map((row) => row.slug)).toEqual(["glavni"]);
    expect(JSON.stringify(single)).not.toMatch(/Vranac|Vinska karta|vinska-karta/);
    expect(await readMedia(t, { slug: SLUG_A })).toEqual({});
    expect((await readLive(t, SLUG_A))?.versionNumber).toBe(2);

    await owner.mutation(api.menuPages.restore, { pageId: wine.pageId });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(asSplitter(await readPage(t, { slug: SLUG_A })).pages.map((row) => row.slug)).toEqual([
      "glavni",
      wine.slug,
    ]);
    expect(articleNames(asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug })))).toEqual(["Vranac"]);
    expect(Object.keys(await readMedia(t, { slug: SLUG_A, pageSlug: wine.slug }))).toEqual([asset]);
  });

  test("a hidden page is not public: no page, not in the page list, no media", async () => {
    const { t, w, wine } = await wineWorld();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(asSplitter(await readPage(t, { slug: SLUG_A })).pages).toHaveLength(2);

    // There is no page visibility mutation yet (the existing tests set the field the same way);
    // a real edit makes the draft publishable.
    await t.run(async (ctx) => {
      await ctx.db.patch(wine.pageId, { visibility: "hidden" });
    });
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: (await menuArticleByName(t, w, "Espreso")).articleId,
      expectedPriceRsd: 150,
      priceRsd: 160,
    });
    // Not published yet: still served.
    expect(asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug })).page.slug).toBe(wine.slug);

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug })).toBeNull();
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: wine.slug })).toEqual({});
    const single = asPage(await readPage(t, { slug: SLUG_A }));
    expect(single.pages.map((row) => row.slug)).toEqual(["glavni"]);
    expect(JSON.stringify(single)).not.toContain("Vranac");
  });

  test("a page with an active QR link cannot be archived, so it stays public", async () => {
    const { t, w, owner, wine } = await wineWorld();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await t.run(async (ctx) => {
      await seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: wine.key,
        createdByUserId: w.ownerId,
      });
    });
    await expect(owner.mutation(api.menuPages.archive, { pageId: wine.pageId })).rejects.toThrow();
    // The refused archive wrote nothing: the draft is clean and the page is still served.
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("clean");
    expect(asPage(await readPage(t, { slug: SLUG_A, pageSlug: wine.slug })).page.slug).toBe(wine.slug);
    expect(asSplitter(await readPage(t, { slug: SLUG_A })).pages).toHaveLength(2);
  });
});

/** The id/key of an article of tenant A's menuContent by name (through the draft rows). */
async function menuArticleByName(t: T, w: MenuWorldSeed, name: string) {
  const row = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", w.a.menuServiceId))
      .collect();
    return rows.find((article) => article.name === name) ?? null;
  });
  if (!row) throw new Error(`no article ${name}`);
  return { articleId: row._id, key: row.key };
}

// =============================================================================
// 4. Another venue's data never reaches a guest
// =============================================================================

describe("menuPublic — another venue's data", () => {
  test("a page slug of another venue is null on this venue, and neither page holds the other's articles", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await menuContentB(t, w);
    const bPage = await as(t, w.otherOwnerId).mutation(api.menuPages.add, {
      menuServiceId: w.b.menuServiceId,
      name: "Desert kod Demo restorana",
    });
    const bDessert = await addSection(t, w.otherOwnerId, bPage.pageId, "Kolači");
    const bCake = await addArticle(t, w.otherOwnerId, bDessert.sectionId, "Baklava", 250);
    const refs = await storeRefs(t, "b");
    const bAsset = await insertAsset(t, w.b.businessId, refs);
    await showImage(t, bCake.articleId, bAsset);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);

    // B's page slug does not exist on A.
    expect(await readPage(t, { slug: SLUG_A, pageSlug: bPage.slug })).toBeNull();
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: bPage.slug })).toEqual({});
    // ... and exists on B, with B's own image.
    const bDessertPage = asPage(await readPage(t, { slug: SLUG_B, pageSlug: bPage.slug }));
    expect(articleNames(bDessertPage)).toEqual(["Baklava"]);
    expect(Object.keys(await readMedia(t, { slug: SLUG_B, pageSlug: bPage.slug }))).toEqual([bAsset]);

    // Both venues have a "glavni" page; each holds only its own articles.
    const mainA = asPage(await readPage(t, { slug: SLUG_A }));
    const mainB = asPage(await readPage(t, { slug: SLUG_B, pageSlug: "glavni" }));
    expect(articleNames(mainA)).toEqual(["Jelen pivo", "Espreso", "Pljeskavica", "Pita sa sirom"]);
    expect(articleNames(mainB)).toEqual(["Špageti"]);
    expect(JSON.stringify(mainA)).not.toMatch(/Špageti|Baklava|Demo restoran|Desert kod/);
    expect(JSON.stringify(mainB)).not.toMatch(/Pljeskavica|Jelen pivo|Espreso|Kafana kod Mike/);
    expect(mainA.menuServiceId).toBe(w.a.menuServiceId);
    expect(mainB.menuServiceId).toBe(w.b.menuServiceId);
    // B's asset never shows up under A's slug, whichever page is asked for.
    expect(await readMedia(t, { slug: SLUG_A })).toEqual({});
  });

  test("pageMedia returns an own ready asset with its URLs and size, and leaves out another business's asset, a purged one and a file that is gone", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const refsOwn = await storeRefs(t, "own");
    const refsForeign = await storeRefs(t, "foreign");
    const refsPurged = await storeRefs(t, "purged");
    const refsGone = await storeRefs(t, "gone");
    const own = await insertAsset(t, w.a.businessId, refsOwn);
    const foreign = await insertAsset(t, w.b.businessId, refsForeign);
    const purged = await insertAsset(t, w.a.businessId, refsPurged, "purged");
    const gone = await insertAsset(t, w.a.businessId, refsGone);
    await t.run(async (ctx) => {
      await ctx.storage.delete(refsGone.thumb);
    });
    await showImage(t, content.beer.articleId, own);
    await showImage(t, content.coffee.articleId, foreign);
    await showImage(t, content.burger.articleId, purged);
    await showImage(t, content.pita.articleId, gone);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const media = await readMedia(t, { slug: SLUG_A });
    expect(Object.keys(media)).toEqual([own]);
    expect(media[own]).toEqual({
      thumbUrl: await storageUrl(t, refsOwn.thumb),
      url: await storageUrl(t, refsOwn.webp),
      width: WEBP_SIZE.width,
      height: WEBP_SIZE.height,
    });
    expect(media[own].thumbUrl).toMatch(/^https:\/\//);
    expect(media[own].url).toMatch(/^https:\/\//);
    expect(media[own].thumbUrl).not.toBe(media[own].url);
    // The foreign, purged and gone assets are named by id nowhere in the result.
    const json = JSON.stringify(media);
    for (const id of [foreign, purged, gone]) expect(json).not.toContain(id);
    expect(json).not.toContain(await storageUrl(t, refsForeign.thumb).then((url) => url ?? "no-url"));
    // Only the asked language and page matter; the tenant B slug has no media at all.
    expect(await readMedia(t, { slug: SLUG_B })).toEqual({});
  });

  test("an asset that changes owner, is purged or is deleted after publishing stops being served at once, and is served again when ready", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const refs = await storeRefs(t);
    const asset = await insertAsset(t, w.a.businessId, refs);
    await showImage(t, content.beer.articleId, asset);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const served = await readMedia(t, { slug: SLUG_A });
    expect(Object.keys(served)).toEqual([asset]);

    // Moved to another business: the tenant check on every read refuses it.
    await t.run(async (ctx) => {
      await ctx.db.patch(asset, { businessId: w.b.businessId });
    });
    expect(await readMedia(t, { slug: SLUG_A })).toEqual({});
    await t.run(async (ctx) => {
      await ctx.db.patch(asset, { businessId: w.a.businessId });
    });
    expect(await readMedia(t, { slug: SLUG_A })).toEqual(served);

    await t.run(async (ctx) => {
      await ctx.db.patch(asset, { status: "purged" });
    });
    expect(await readMedia(t, { slug: SLUG_A })).toEqual({});
    await t.run(async (ctx) => {
      await ctx.db.patch(asset, { status: "ready" });
    });
    expect(await readMedia(t, { slug: SLUG_A })).toEqual(served);

    await t.run(async (ctx) => {
      await ctx.db.delete(asset);
    });
    expect(await readMedia(t, { slug: SLUG_A })).toEqual({});
    // The published page itself still lists the article: it falls back to its icon.
    expect(articleNames(asPage(await readPage(t, { slug: SLUG_A })))).toContain("Jelen pivo");
  });

  test("an image id that is not an id, is empty, or belongs to another table is ignored, and an icon or no-media article carries no image", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const refs = await storeRefs(t);
    const good = await insertAsset(t, w.a.businessId, refs);
    const plantedBad = await insertAsset(t, w.a.businessId, refs);
    const plantedTable = await insertAsset(t, w.a.businessId, refs);
    const iconOnly = await insertAsset(t, w.a.businessId, refs);
    await showImage(t, content.beer.articleId, good);
    await showImage(t, content.coffee.articleId, plantedBad);
    await showImage(t, content.burger.articleId, plantedTable);
    // An icon article keeps a stale imageMediaId on its row; the snapshot drops it.
    await t.run(async (ctx) => {
      await ctx.db.patch(content.pita.articleId, { mediaMode: "icon", iconKey: "pita", imageMediaId: iconOnly });
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(Object.keys(await readMedia(t, { slug: SLUG_A }))).toEqual([good, plantedBad, plantedTable]);

    // Plant what a real flow cannot write: a malformed id and an id of another table.
    await rewritePublicParts(t, w.a.menuServiceId, [
      [plantedBad, "not-an-id"],
      [plantedTable, w.a.businessId],
    ]);
    const media = await readMedia(t, { slug: SLUG_A });
    expect(Object.keys(media)).toEqual([good]);
    expect(JSON.stringify(media)).not.toMatch(/not-an-id/);
    expect(JSON.stringify(media)).not.toContain(iconOnly);
    // The page itself still reads fine.
    expect(articleNames(asPage(await readPage(t, { slug: SLUG_A })))).toHaveLength(4);
  });

  test("the splitter and an unknown page give no media", async () => {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const refs = await storeRefs(t);
    await showImage(t, content.beer.articleId, await insertAsset(t, w.a.businessId, refs));
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    // Two visible pages and no page asked for: that is the splitter, which has no articles.
    expect(await readMedia(t, { slug: SLUG_A })).toEqual({});
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: "nema-takve" })).toEqual({});
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: "Bad Slug!" })).toEqual({});
    expect(Object.keys(await readMedia(t, { slug: SLUG_A, pageSlug: "glavni" }))).toHaveLength(1);
    expect(await readMedia(t, { slug: SLUG_A, pageSlug: wine.slug })).toEqual({});
  });
});

// =============================================================================
// 5. The cutover rule (plan K12-1)
// =============================================================================

describe("menuPublic — a migrated service is public only after the cutover", () => {
  type Migration = NonNullable<Doc<"menuServices">["migration"]>;

  function migrationState(menuId: Id<"menus">, status: Migration["status"]): Migration {
    const now = Date.now();
    return {
      status,
      legacyMenuId: menuId,
      sourceKind: "live",
      sourceRevision: 1,
      startedAt: now,
      ...(status === "running" ? {} : { migratedAt: now }),
      ...(status === "cutover" ? { cutoverAt: now } : {}),
    };
  }

  /** Venue A with a published legacy menu, linked to its Menu service; content published in the new model. */
  async function linkedWorld(options: { legacyStatus?: "published" | "draft" } = {}) {
    const { t, w } = await setup();
    const content = await menuContent(t, w);
    const refs = await storeRefs(t);
    const asset = await insertAsset(t, w.a.businessId, refs);
    await showImage(t, content.beer.articleId, asset);
    const now = Date.now();
    const legacyMenuId = await t.run(
      async (ctx) =>
        await ctx.db.insert("menus", {
          businessId: w.a.businessId,
          status: options.legacyStatus ?? "published",
          design: null,
          ...(options.legacyStatus === "draft" ? {} : { publishedAt: now }),
          createdAt: now,
          updatedAt: now,
        }),
    );
    const link = async (migration: Migration | undefined) => {
      await t.run(async (ctx) => {
        await ctx.db.patch(w.a.menuServiceId, { legacyMenuId, migration });
      });
    };
    await link(migrationState(legacyMenuId, "migrated"));
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    return { t, w, content, asset, legacyMenuId, link };
  }

  async function guestSurface(t: T, w: MenuWorldSeed) {
    return {
      entry: await t.query(api.menuPublic.entry, { slug: SLUG_A }),
      page: await readPage(t, { slug: SLUG_A }),
      pageMedia: await readMedia(t, { slug: SLUG_A }),
      live: await readLive(t, SLUG_A),
      availability: await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId }),
      roomService: await t.query(api.menuPublic.roomService, { slug: SLUG_A }),
    };
  }

  const LEGACY_ONLY = {
    entry: { kind: "legacy" },
    page: null,
    pageMedia: {},
    live: null,
    availability: null,
    roomService: null,
  };

  test("linked, running or migrated but not cut over: guests get the legacy menu and nothing from the new model; the cutover switches, the revert switches back", async () => {
    const { t, w, asset, legacyMenuId, link } = await linkedWorld();

    // Linked to a legacy menu with no migration state at all, then running, then migrated.
    for (const migration of [undefined, migrationState(legacyMenuId, "running"), migrationState(legacyMenuId, "migrated")]) {
      await link(migration);
      expect(await guestSurface(t, w), migration?.status ?? "linked").toEqual(LEGACY_ONLY);
    }

    // A migration that is still running cannot be cut over.
    await link(migrationState(legacyMenuId, "running"));
    const refused = await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: w.a.menuServiceId });
    expect(refused).toMatchObject({ ok: false, blockers: ["not_migrated"] });
    expect(await guestSurface(t, w)).toEqual(LEGACY_ONLY);

    // Migrated and published: the cutover makes the new model public.
    await link(migrationState(legacyMenuId, "migrated"));
    const cut = await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: w.a.menuServiceId });
    expect(cut).toEqual({ ok: true, changed: true });
    const publicSurface = await guestSurface(t, w);
    expect(publicSurface.entry).toEqual({ kind: "new", versionNumber: 1 });
    expect(asPage(publicSurface.page).versionNumber).toBe(1);
    expect(articleNames(asPage(publicSurface.page))).toEqual([
      "Jelen pivo",
      "Espreso",
      "Pljeskavica",
      "Pita sa sirom",
    ]);
    expect(Object.keys(publicSurface.pageMedia)).toEqual([asset]);
    expect(publicSurface.live).toEqual({ menuServiceId: w.a.menuServiceId, versionNumber: 1, unavailableKeys: [] });
    expect(publicSurface.availability).toEqual({ articleKeys: [] });

    // Reverting the cutover sends guests back to the legacy menu.
    const reverted = await t.mutation(internal.menuMigration.revertLegacyCutover, { menuServiceId: w.a.menuServiceId });
    expect(reverted).toEqual({ ok: true, changed: true });
    expect(await guestSurface(t, w)).toEqual(LEGACY_ONLY);

    // Cutting over again brings the same public surface back.
    expect(await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: w.a.menuServiceId })).toEqual({
      ok: true,
      changed: true,
    });
    expect(await guestSurface(t, w)).toEqual(publicSurface);
  });

  test("an unavailable article is invisible to guests of the new model until the cutover", async () => {
    const { t, w, content, legacyMenuId, link } = await linkedWorld();
    await link(migrationState(legacyMenuId, "migrated"));
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: content.burger.articleId,
      available: false,
    });
    expect(await readLive(t, SLUG_A)).toBeNull();
    expect(await t.query(api.menuPublic.availability, { menuServiceId: w.a.menuServiceId })).toBeNull();

    await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: w.a.menuServiceId });
    expect((await readLive(t, SLUG_A))?.unavailableKeys).toEqual([content.burger.key]);
  });

  test("with an unpublished legacy menu a migrated service shows nothing until the cutover", async () => {
    const { t, w, legacyMenuId, link } = await linkedWorld({ legacyStatus: "draft" });
    await link(migrationState(legacyMenuId, "migrated"));
    expect(await guestSurface(t, w)).toEqual({ ...LEGACY_ONLY, entry: { kind: "none" } });

    await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: w.a.menuServiceId });
    expect((await guestSurface(t, w)).entry).toEqual({ kind: "new", versionNumber: 1 });
  });

  test("another venue without a legacy link is public while this one waits for its cutover", async () => {
    const { t, w } = await linkedWorld();
    await menuContentB(t, w);
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);

    expect(await guestSurface(t, w)).toEqual(LEGACY_ONLY);
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_B })).toEqual({ kind: "new", versionNumber: 1 });
    expect(articleNames(asPage(await readPage(t, { slug: SLUG_B })))).toEqual(["Špageti"]);
    expect(await readLive(t, SLUG_B)).toEqual({
      menuServiceId: w.b.menuServiceId,
      versionNumber: 1,
      unavailableKeys: [],
    });
  });

  test("a service that never had a legacy menu needs no cutover", async () => {
    const { t, w } = await setup();
    await menuContent(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const service = await t.run(async (ctx) => await ctx.db.get(w.a.menuServiceId));
    expect(service?.legacyMenuId).toBeUndefined();
    expect(service?.migration).toBeUndefined();
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "new", versionNumber: 1 });
    expect(await readLive(t, SLUG_A)).not.toBeNull();
  });
});

// =============================================================================
// 6. logoUrl
// =============================================================================

describe("menuPublic.page — logoUrl", () => {
  async function logoWorld() {
    const { t, w } = await setup();
    await menuContent(t, w);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Vina");
    await addArticle(t, w.ownerId, wineSection.sectionId, "Vranac", 900);
    await menuContentB(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);
    return { t, w, wine };
  }

  /** logoUrl of the splitter (two visible pages), of the page and of the single-page B. */
  async function logos(t: T) {
    return {
      splitter: asSplitter(await readPage(t, { slug: SLUG_A })).logoUrl,
      page: asPage(await readPage(t, { slug: SLUG_A, pageSlug: "glavni" })).logoUrl,
      tenantB: asPage(await readPage(t, { slug: SLUG_B })).logoUrl,
    };
  }

  test("is null by default", async () => {
    const { t } = await logoWorld();
    expect(await logos(t)).toEqual({ splitter: null, page: null, tenantB: null });
  });

  test("an external logo URL is returned at once, without publishing, and only for its own venue", async () => {
    const { t, w } = await logoWorld();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { logoUrl: "https://example.com/logo.png" });
    });
    expect(await logos(t)).toEqual({
      splitter: "https://example.com/logo.png",
      page: "https://example.com/logo.png",
      tenantB: null,
    });
    expect((await readLive(t, SLUG_A))?.versionNumber).toBe(1);

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { logoUrl: undefined });
    });
    expect((await logos(t)).page).toBeNull();
  });

  test("a stored logo file is preferred over the URL; if the file is gone the URL is used", async () => {
    const { t, w } = await logoWorld();
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["logo-bytes"])));
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { logoUrl: "https://example.com/logo.png", logoStorageId: storageId });
    });
    const stored = await storageUrl(t, storageId);
    expect(stored).toMatch(/^https:\/\//);
    expect(stored).not.toBe("https://example.com/logo.png");
    expect(await logos(t)).toEqual({ splitter: stored, page: stored, tenantB: null });

    // Only the stored file (no URL).
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { logoUrl: undefined });
    });
    expect((await logos(t)).page).toBe(stored);

    // The file is deleted: the URL, else nothing.
    await t.run(async (ctx) => {
      await ctx.storage.delete(storageId);
    });
    expect((await logos(t)).page).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { logoUrl: "https://example.com/logo.png" });
    });
    expect((await logos(t)).page).toBe("https://example.com/logo.png");
  });
});

// =============================================================================
// 7. Read budget — live and pageMedia on a menu bigger than the media cap
// =============================================================================

describe("menuPublic — read budget of live and pageMedia", () => {
  const SECTIONS = 9;
  const PER_SECTION = 45;
  const TOTAL = SECTIONS * PER_SECTION; // 405 > MENU_PUBLIC_MEDIA_CAP

  test(
    `a ${TOTAL}-article menu with an image on every article: live reads a handful of documents, pageMedia resolves exactly ${MENU_PUBLIC_MEDIA_CAP} images`,
    async () => {
      expect(TOTAL).toBeGreaterThan(MENU_PUBLIC_MEDIA_CAP);
      const t = convexTest({ schema, modules, transactionLimits: true });
      const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));

      const articles: Array<{ articleId: Id<"menuArticles">; key: string }> = [];
      for (let s = 0; s < SECTIONS; s += 1) {
        const section = await addSection(t, w.ownerId, w.a.defaultPageId, `Sekcija ${s + 1}`);
        for (let i = 0; i < PER_SECTION; i += 1) {
          const created = await addArticle(t, w.ownerId, section.sectionId, `Artikal ${s + 1}-${i + 1}`, 100 + i);
          articles.push({ articleId: created.articleId, key: created.key });
        }
      }
      expect(articles).toHaveLength(TOTAL);

      // One asset per article (they share three stored files: only the asset rows matter here).
      const refs = await storeRefs(t);
      const assetIds = await t.run(async (ctx) => {
        const ids: Array<Id<"mediaAssets">> = [];
        for (const { articleId } of articles) {
          const assetId = await ctx.db.insert("mediaAssets", {
            businessId: w.a.businessId,
            kind: "image",
            provider: "convex",
            variants: {
              avif: { ref: refs.avif, ...WEBP_SIZE, bytes: 4 },
              webp: { ref: refs.webp, ...WEBP_SIZE, bytes: 4 },
              thumb: { ref: refs.thumb, ...THUMB_SIZE, bytes: 5 },
            },
            status: "ready",
            createdAt: Date.now(),
          });
          await ctx.db.patch(articleId, { mediaMode: "image", imageMediaId: assetId });
          ids.push(assetId);
        }
        return ids;
      });

      await publishNow(t, w.ownerId, w.a.menuServiceId);
      const unavailable = [articles[0], articles[100], articles[TOTAL - 1]];
      for (const { articleId } of unavailable) {
        await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, { articleId, available: false });
      }

      const measured = await t.run(async (ctx) => {
        const start = await ctx.meta.getTransactionMetrics();
        const live = await ctx.runQuery(
          api.menuPublic.live,
          { slug: SLUG_A },
          { transactionLimits: { documentsRead: 15, databaseQueries: 10 } },
        );
        const afterLive = await ctx.meta.getTransactionMetrics();
        const media = await ctx.runQuery(
          api.menuPublic.pageMedia,
          { slug: SLUG_A },
          {
            transactionLimits: {
              documentsRead: MENU_PUBLIC_MEDIA_CAP + 10,
              databaseQueries: MENU_PUBLIC_MEDIA_CAP + 10,
            },
          },
        );
        const afterMedia = await ctx.meta.getTransactionMetrics();
        return {
          live,
          liveDocuments: afterLive.documentsRead.used - start.documentsRead.used,
          liveQueries: afterLive.databaseQueries.used - start.databaseQueries.used,
          media,
          mediaDocuments: afterMedia.documentsRead.used - afterLive.documentsRead.used,
          mediaQueries: afterMedia.databaseQueries.used - afterLive.databaseQueries.used,
        };
      });

      // live: the answer is complete, and the cost does not depend on the size of the menu.
      expect(measured.live).toEqual({
        menuServiceId: w.a.menuServiceId,
        versionNumber: 1,
        unavailableKeys: unavailable.map((row) => row.key).sort(),
      });
      expect(measured.liveDocuments).toBeGreaterThan(0);
      expect(measured.liveDocuments).toBeLessThanOrEqual(15);
      expect(measured.liveQueries).toBeLessThanOrEqual(10);

      // pageMedia: exactly the cap, in page order; the last articles fall back to their icon.
      const ids = Object.keys(measured.media);
      expect(ids).toHaveLength(MENU_PUBLIC_MEDIA_CAP);
      expect(new Set(ids)).toEqual(new Set(assetIds.slice(0, MENU_PUBLIC_MEDIA_CAP)));
      for (const missing of assetIds.slice(MENU_PUBLIC_MEDIA_CAP)) expect(measured.media[missing]).toBeUndefined();
      // One read per resolved image plus the handful of documents of the venue, service, profile,
      // version and parts (measured: 400 + 6).
      expect(measured.mediaDocuments).toBeGreaterThan(MENU_PUBLIC_MEDIA_CAP - 1);
      expect(measured.mediaDocuments).toBeLessThanOrEqual(MENU_PUBLIC_MEDIA_CAP + 10);
      expect(measured.mediaQueries).toBeLessThanOrEqual(MENU_PUBLIC_MEDIA_CAP + 10);

      // Control: the nested limits are really enforced (a limit below the real cost throws).
      await expect(
        t.run(
          async (ctx) =>
            await ctx.runQuery(api.menuPublic.pageMedia, { slug: SLUG_A }, { transactionLimits: { documentsRead: 100 } }),
        ),
      ).rejects.toThrow(/too many documents/i);
    },
    240_000,
  );
});
