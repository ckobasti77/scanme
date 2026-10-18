/// <reference types="vite/client" />

// ScanMe Menu V1 — K15: the article detail and the article search of the
// editor (articleDetail and searchArticles in convex/menuStudio.ts). Both are
// queries: they answer null for every refusal (no error toast on load) and
// never read another venue. Fictional venues only (seed.ts).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { newMenuKey } from "../lib/menu/keys";
import { normalizeArticleName } from "../lib/menu/text";
import { TEST_ADMIN_EMAIL, TEST_ISSUER, seedMenuWorld, type MenuWorldSeed } from "../lib/menu/testkit/seed";

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
// World: tenant A sells Cevapi / Pljeskavica / Lepinja in "Rostilj" on its
// default page; tenant B sells Spageti and its own "Cevapi" lookalike.
// -----------------------------------------------------------------------------

async function quickAdd(t: T, userId: Id<"users">, sectionId: Id<"menuSections">, name: string, priceRsd: number) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, { sectionId, name, priceRsd });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const grill = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Rostilj" });
  const cevapi = await quickAdd(t, w.ownerId, grill.sectionId, "Ćevapi", 650);
  const pljeskavica = await quickAdd(t, w.ownerId, grill.sectionId, "Pljeskavica", 450);
  const lepinja = await quickAdd(t, w.ownerId, grill.sectionId, "Lepinja", 60);

  const pasta = await as(t, w.otherOwnerId).mutation(api.menuCatalog.addSection, {
    pageId: w.b.defaultPageId,
    name: "Pasta",
  });
  const spaghetti = await quickAdd(t, w.otherOwnerId, pasta.sectionId, "Špageti", 700);
  const foreignCevapi = await quickAdd(t, w.otherOwnerId, pasta.sectionId, "Ćevapi sa sirom", 800);
  return { t, w, grill, cevapi, pljeskavica, lepinja, pasta, spaghetti, foreignCevapi };
}

function detail(t: T, userId: Id<"users"> | null, menuServiceId: Id<"menuServices">, articleKey: string) {
  const actor = userId ? as(t, userId) : t;
  return actor.query(api.menuStudio.articleDetail, { menuServiceId, articleKey });
}

function search(t: T, userId: Id<"users"> | null, menuServiceId: Id<"menuServices">, query: string) {
  const actor = userId ? as(t, userId) : t;
  return actor.query(api.menuStudio.searchArticles, { menuServiceId, query });
}

async function storedAsset(t: T, businessId: Id<"businesses">, status: "ready" | "purged" = "ready") {
  return await t.run(async (ctx) => {
    const ref = (label: string) => ctx.storage.store(new Blob([label]));
    const avif = await ref("avif");
    const webp = await ref("webp");
    const thumb = await ref("thumb");
    const mediaId = await ctx.db.insert("mediaAssets", {
      businessId,
      kind: "image",
      provider: "convex",
      variants: {
        avif: { ref: avif, width: 1200, height: 800, bytes: 4 },
        webp: { ref: webp, width: 1200, height: 800, bytes: 4 },
        thumb: { ref: thumb, width: 300, height: 200, bytes: 5 },
      },
      status,
      createdAt: Date.now(),
    });
    return { mediaId, webpUrl: await ctx.storage.getUrl(webp) };
  });
}

function orThrow<R>(value: R | null): R {
  if (value === null) throw new Error("expected a result, got null");
  return value;
}

// =============================================================================
// articleDetail
// =============================================================================

describe("menuStudio.articleDetail", () => {
  test("returns null for an unknown or empty key, a key of the other venue and the other venue's service", async () => {
    const { t, w, cevapi, spaghetti } = await setup();
    expect(await detail(t, w.ownerId, w.a.menuServiceId, "article_unknown")).toBeNull();
    expect(await detail(t, w.ownerId, w.a.menuServiceId, "")).toBeNull();
    // A key of tenant B asked through tenant A's service, and the reverse.
    expect(await detail(t, w.ownerId, w.a.menuServiceId, spaghetti.key)).toBeNull();
    expect(await detail(t, w.otherOwnerId, w.b.menuServiceId, cevapi.key)).toBeNull();
    // Another venue's service is closed to the caller altogether.
    expect(await detail(t, w.ownerId, w.b.menuServiceId, spaghetti.key)).toBeNull();
    expect(await detail(t, w.otherOwnerId, w.a.menuServiceId, cevapi.key)).toBeNull();
  });

  test("owner, manager, editor and admin read it; finance, view-only, an outsider and anonymous get null", async () => {
    const { t, w, cevapi } = await setup();
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const result = orThrow(await detail(t, userId, w.a.menuServiceId, cevapi.key));
      expect(result.article).toMatchObject({ articleId: cevapi.articleId, key: cevapi.key, name: "Ćevapi" });
    }
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId, null]) {
      expect(await detail(t, userId, w.a.menuServiceId, cevapi.key)).toBeNull();
    }
  });

  test("a plain article is Naziv + Cena: no variants, add-ons, image, tags or promotion", async () => {
    const { t, w, cevapi, grill } = await setup();
    const result = orThrow(await detail(t, w.editorId, w.a.menuServiceId, cevapi.key));
    expect(result.article).toEqual({
      articleId: cevapi.articleId,
      key: cevapi.key,
      kind: "item",
      name: "Ćevapi",
      description: null,
      basePriceRsd: 650,
      quantityValue: null,
      quantityUnit: null,
      mediaMode: "none",
      iconKey: null,
      imageMediaId: null,
      variantsEnabled: false,
      addonsEnabled: false,
      noteEnabled: false,
      priceCheck: false,
      allergens: null,
      tags: [],
      promo: null,
    });
    expect(result.image).toBeNull();
    expect(result.allergensEnabled).toBe(false);
    expect(result.variants).toEqual([]);
    expect(result.addonGroups).toEqual([]);
    expect(result.placementsTruncated).toBe(false);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      pageId: w.a.defaultPageId,
      pageIsDefault: true,
      pageArchived: false,
      sectionId: grill.sectionId,
      sectionName: "Rostilj",
      visibility: "visible",
    });
  });

  test("variants, add-on groups with linkCount, placements on two pages sorted by page order, allergens, tags and promo", async () => {
    const { t, w, cevapi, pljeskavica, lepinja } = await setup();
    const owner = as(t, w.ownerId);

    // Variants.
    await owner.mutation(api.menuArticleOptions.addVariant, { articleId: cevapi.articleId, name: "Mala", priceRsd: 450 });
    await owner.mutation(api.menuArticleOptions.addVariant, { articleId: cevapi.articleId, name: "Velika" });

    // One add-on group linked to three articles.
    const group = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: cevapi.articleId,
      name: "Prilozi",
      selection: "multiple",
      required: false,
      options: [
        { name: "Kajmak", priceDeltaRsd: 80 },
        { name: "Ajvar", priceDeltaRsd: 50 },
      ],
    });
    await owner.mutation(api.menuArticleOptions.applyAddonGroupToArticles, {
      groupId: group.groupId,
      articleIds: [pljeskavica.articleId, lepinja.articleId],
    });
    // A group of its own: linkCount 1.
    await owner.mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: cevapi.articleId,
      name: "Luk",
      selection: "single",
      required: true,
      options: [{ name: "Sirov", priceDeltaRsd: 0 }],
    });

    // A second page, moved in front of the default one, with its own section.
    const garden = await owner.mutation(api.menuPages.add, { menuServiceId: w.a.menuServiceId, name: "Bašta" });
    const gardenSection = await owner.mutation(api.menuCatalog.addSection, { pageId: garden.pageId, name: "Letnja ponuda" });
    await owner.mutation(api.menuCatalog.addPlacement, { sectionId: gardenSection.sectionId, articleId: cevapi.articleId });
    await owner.mutation(api.menuPages.move, { pageId: garden.pageId, toIndex: 0 });

    // Allergens, tags, promo.
    await owner.mutation(api.menuArticleDetails.setAllergensEnabled, { menuServiceId: w.a.menuServiceId, enabled: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(cevapi.articleId, {
        allergens: { contains: ["gluten"], mayContain: ["milk"], otherText: "Susam" },
        tags: ["vegan", "spicy"],
        promo: { active: true, mode: "percent", percent: 10 },
        description: "Sa lukom",
        quantityValue: 250,
        quantityUnit: "g",
      });
    });

    const result = orThrow(await detail(t, w.editorId, w.a.menuServiceId, cevapi.key));

    expect(result.variants.map((variant) => [variant.name, variant.priceRsd])).toEqual([
      ["Mala", 450],
      ["Velika", null],
    ]);

    expect(result.addonGroups.map((g) => [g.name, g.linkCount])).toEqual([
      ["Prilozi", 3],
      ["Luk", 1],
    ]);
    const prilozi = result.addonGroups[0];
    expect(prilozi).toMatchObject({ groupId: group.groupId, selection: "multiple", required: false });
    expect(prilozi.options.map((option) => [option.name, option.priceDeltaRsd])).toEqual([
      ["Kajmak", 80],
      ["Ajvar", 50],
    ]);
    // The same group read from another article reports the same linkCount.
    const fromLepinja = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, lepinja.key));
    expect(fromLepinja.addonGroups.map((g) => [g.name, g.linkCount])).toEqual([["Prilozi", 3]]);

    expect(result.placements.map((p) => [p.pageName, p.sectionName, p.pageIsDefault])).toEqual([
      ["Bašta", "Letnja ponuda", false],
      [expect.any(String), "Rostilj", true],
    ]);
    expect(result.placements[0].pageOrder).toBeLessThan(result.placements[1].pageOrder);

    expect(result.allergensEnabled).toBe(true);
    expect(result.article).toMatchObject({
      description: "Sa lukom",
      quantityValue: 250,
      quantityUnit: "g",
      variantsEnabled: true,
      addonsEnabled: true,
      tags: ["vegan", "spicy"],
      promo: { active: true, mode: "percent", percent: 10 },
      allergens: { contains: ["gluten"], mayContain: ["milk"], otherText: "Susam" },
    });
  });

  test("image carries a URL for a ready asset of the article's business and null for one of another business or a purged one", async () => {
    const { t, w, cevapi, pljeskavica, lepinja, spaghetti } = await setup();
    const own = await storedAsset(t, w.a.businessId);
    const foreign = await storedAsset(t, w.b.businessId);
    const purged = await storedAsset(t, w.a.businessId, "purged");
    await t.run(async (ctx) => {
      await ctx.db.patch(cevapi.articleId, { mediaMode: "image", imageMediaId: own.mediaId });
      await ctx.db.patch(pljeskavica.articleId, { mediaMode: "image", imageMediaId: foreign.mediaId });
      await ctx.db.patch(lepinja.articleId, { mediaMode: "image", imageMediaId: purged.mediaId });
    });

    const ok = orThrow(await detail(t, w.editorId, w.a.menuServiceId, cevapi.key));
    expect(own.webpUrl).toBeTruthy();
    expect(ok.image).toEqual({ mediaId: own.mediaId, url: own.webpUrl });
    expect(ok.article.imageMediaId).toBe(own.mediaId);

    const stolen = orThrow(await detail(t, w.editorId, w.a.menuServiceId, pljeskavica.key));
    expect(stolen.image).toEqual({ mediaId: foreign.mediaId, url: null });
    const gone = orThrow(await detail(t, w.editorId, w.a.menuServiceId, lepinja.key));
    expect(gone.image).toEqual({ mediaId: purged.mediaId, url: null });

    // Tenant B's own article never sees tenant A's asset URL either.
    await t.run(async (ctx) => {
      await ctx.db.patch(spaghetti.articleId, { mediaMode: "image", imageMediaId: own.mediaId });
    });
    const crossed = orThrow(await detail(t, w.otherOwnerId, w.b.menuServiceId, spaghetti.key));
    expect(crossed.image).toEqual({ mediaId: own.mediaId, url: null });
  });

  test("an archived page still lists the placement, flagged as archived", async () => {
    const { t, w, cevapi } = await setup();
    const owner = as(t, w.ownerId);
    const second = await owner.mutation(api.menuPages.add, { menuServiceId: w.a.menuServiceId, name: "Zimska karta" });
    const section = await owner.mutation(api.menuCatalog.addSection, { pageId: second.pageId, name: "Supe" });
    await owner.mutation(api.menuCatalog.addPlacement, { sectionId: section.sectionId, articleId: cevapi.articleId });
    await owner.mutation(api.menuPages.archive, { pageId: second.pageId });
    const result = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, cevapi.key));
    expect(result.placements.map((p) => [p.pageName, p.pageArchived])).toEqual([
      [expect.any(String), false],
      ["Zimska karta", true],
    ]);
  });

  test("a group of another venue linked by corrupt data is not shown", async () => {
    const { t, w, cevapi, spaghetti } = await setup();
    const foreignGroup = await as(t, w.otherOwnerId).mutation(api.menuArticleOptions.createAddonGroup, {
      articleId: spaghetti.articleId,
      name: "Sir",
      selection: "single",
      required: false,
      options: [{ name: "Parmezan", priceDeltaRsd: 90 }],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("menuArticleAddonGroups", {
        menuServiceId: w.a.menuServiceId,
        articleId: cevapi.articleId,
        groupId: foreignGroup.groupId,
        order: 1000,
        createdAt: Date.now(),
      });
    });
    const result = orThrow(await detail(t, w.ownerId, w.a.menuServiceId, cevapi.key));
    expect(result.addonGroups).toEqual([]);
  });
});

// =============================================================================
// searchArticles
// =============================================================================

describe("menuStudio.searchArticles", () => {
  test("finds Ćevapi by 'cevapi' (diacritics and case ignored), with key and price", async () => {
    const { t, w, cevapi } = await setup();
    for (const query of ["cevapi", "ĆEVAPI", "Ćevapi", "  cevap  ", "vapi"]) {
      expect(await search(t, w.editorId, w.a.menuServiceId, query)).toEqual([
        { articleId: cevapi.articleId, key: cevapi.key, name: "Ćevapi", basePriceRsd: 650 },
      ]);
    }
  });

  test("an article without a price answers basePriceRsd null; a query without hits answers []", async () => {
    const { t, w, grill } = await setup();
    const quick = await as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, {
      sectionId: grill.sectionId,
      name: "Dnevna ponuda",
    });
    if (quick.status !== "created") throw new Error("not created");
    expect(await search(t, w.ownerId, w.a.menuServiceId, "dnevna")).toEqual([
      { articleId: quick.articleId, key: quick.key, name: "Dnevna ponuda", basePriceRsd: null },
    ]);
    expect(await search(t, w.ownerId, w.a.menuServiceId, "nema takvog")).toEqual([]);
  });

  test("an empty or punctuation-only query answers []", async () => {
    const { t, w } = await setup();
    expect(await search(t, w.ownerId, w.a.menuServiceId, "")).toEqual([]);
    expect(await search(t, w.ownerId, w.a.menuServiceId, "   ")).toEqual([]);
    expect(await search(t, w.ownerId, w.a.menuServiceId, "...")).toEqual([]);
  });

  test("never returns an article of another venue, even with a similar name", async () => {
    const { t, w, cevapi, foreignCevapi } = await setup();
    const fromA = await search(t, w.ownerId, w.a.menuServiceId, "cevapi");
    expect(fromA?.map((row) => row.articleId)).toEqual([cevapi.articleId]);
    const fromB = await search(t, w.otherOwnerId, w.b.menuServiceId, "cevapi");
    expect(fromB?.map((row) => row.articleId)).toEqual([foreignCevapi.articleId]);
    // Tenant B's owner asking tenant A's service gets nothing at all.
    expect(await search(t, w.otherOwnerId, w.a.menuServiceId, "cevapi")).toBeNull();
    expect(await search(t, w.ownerId, w.b.menuServiceId, "cevapi")).toBeNull();
  });

  test("answers null for finance, view-only, an outsider and anonymous; owner, manager, editor and admin search", async () => {
    const { t, w } = await setup();
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, null]) {
      expect(await search(t, userId, w.a.menuServiceId, "cevapi")).toBeNull();
    }
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      expect((await search(t, userId, w.a.menuServiceId, "cevapi"))?.length).toBe(1);
    }
  });

  test("answers at most 50 articles", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 60; i += 1) {
        const name = `Čorba ${String(i).padStart(2, "0")}`;
        await ctx.db.insert("menuArticles", {
          menuServiceId: w.a.menuServiceId,
          key: newMenuKey("article"),
          kind: "item",
          name,
          nameNormalized: normalizeArticleName(name),
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const found = orThrow(await search(t, w.ownerId, w.a.menuServiceId, "corba"));
    expect(found).toHaveLength(50);
    expect(new Set(found.map((row) => row.articleId)).size).toBe(50);
    // The cut does not hide articles that match a narrower query.
    expect(orThrow(await search(t, w.ownerId, w.a.menuServiceId, "corba 59"))).toHaveLength(1);
  });
});
