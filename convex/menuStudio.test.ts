/// <reference types="vite/client" />

// ScanMe Menu V1 — K10: the editor module (convex/menuStudio.ts; master §13.4,
// §5.2, §5.3, §3.2). Covers:
//   - entry: which editor a venue opens (studio / legacy / none);
//   - pages: the page column with "a QR card points here" per page;
//   - the K10 acceptance scenarios: one shared price across standard pages,
//     the QR page that cannot be deleted or archived;
//   - quickAddMany: the table entry, all or nothing, re-use before duplicating;
//   - the new pageContent row fields (variantsEnabled, priceCheck).
// Fictional venue and articles only (the repo is public).

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_MAX_PRICE_RSD, MENU_TEXT } from "../lib/menu/limits";
import { roleCan } from "../lib/menu/permissions";
import { DEFAULT_PAGE_SLUG } from "../lib/menu/slugs";
import { MENU_STUDIO_MAX_QUICK_ROWS } from "../lib/menu/studio/quick-add";
import { seedLegacyMenu } from "../lib/menu/testkit/legacy";
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

async function content(t: T, userId: Id<"users">, pageId: Id<"menuPages">) {
  const result = await as(t, userId).query(api.menuCatalog.pageContent, { pageId });
  if (!result) throw new Error("pageContent returned null");
  return result;
}

type PageContent = Awaited<ReturnType<typeof content>>;

function namesOf(page: PageContent, sectionIndex = 0) {
  return page.sections[sectionIndex].placements.map((placement) => placement.article.name);
}

function pricesOf(page: PageContent) {
  return page.sections.flatMap((section) =>
    section.placements.map((placement) => placement.article.basePriceRsd),
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

/** Everything the editor writes for one service, to prove "nothing changed". */
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

async function pagesOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  return await as(t, userId).query(api.menuStudio.pages, { menuServiceId });
}

async function entryOf(t: T, userId: Id<"users"> | null, slug: string) {
  const caller = userId ? as(t, userId) : t;
  return await caller.query(api.menuStudio.entry, { slug });
}

// -----------------------------------------------------------------------------
// 1. entry
// -----------------------------------------------------------------------------

describe("entry", () => {
  test("owner, manager, editor and admin of the business open the studio", async () => {
    const { t, w } = await setup();
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      expect(await entryOf(t, userId, SLUG_A)).toEqual({ kind: "studio" });
    }
  });

  test("signed-out callers, outsiders, finance, view-only and the owner of another business get none", async () => {
    const { t, w } = await setup();
    expect(await entryOf(t, null, SLUG_A)).toEqual({ kind: "none" });
    for (const userId of [w.outsiderId, w.financeId, w.viewOnlyId, w.otherOwnerId]) {
      expect(await entryOf(t, userId, SLUG_A)).toEqual({ kind: "none" });
    }
    // The owner of B is a studio user of B only.
    expect(await entryOf(t, w.otherOwnerId, SLUG_B)).toEqual({ kind: "studio" });
    expect(await entryOf(t, w.ownerId, SLUG_B)).toEqual({ kind: "none" });
  });

  test("an unknown or malformed slug gives none", async () => {
    const { t, w } = await setup();
    expect(await entryOf(t, w.ownerId, "nema-takvog-lokala")).toEqual({ kind: "none" });
    expect(await entryOf(t, w.ownerId, "Nije Slug!")).toEqual({ kind: "none" });
    expect(await entryOf(t, w.adminId, "nema-takvog-lokala")).toEqual({ kind: "none" });
  });

  describe("a service that mirrors a legacy menu", () => {
    async function tiedToLegacy(migration: "none" | "running" | "migrated" | "cutover") {
      const { t, w } = await setup();
      await t.run(async (ctx) => {
        const { menuId } = await seedLegacyMenu(ctx, {
          businessId: w.a.businessId,
          serviceProfileId: w.a.serviceProfileId,
        });
        const now = Date.now();
        await ctx.db.patch(w.a.menuServiceId, {
          legacyMenuId: menuId,
          ...(migration === "none"
            ? {}
            : {
                migration: {
                  status: migration,
                  legacyMenuId: menuId,
                  sourceKind: "draft" as const,
                  sourceRevision: 1,
                  startedAt: now,
                  ...(migration !== "running" ? { migratedAt: now } : {}),
                  ...(migration === "cutover" ? { cutoverAt: now } : {}),
                },
              }),
        });
      });
      return { t, w };
    }

    test("with no migration the legacy editor stays the only writer", async () => {
      const { t, w } = await tiedToLegacy("none");
      for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
        expect(await entryOf(t, userId, SLUG_A)).toEqual({ kind: "legacy" });
      }
    });

    test("a running or migrated (not yet cut over) migration is still legacy", async () => {
      for (const status of ["running", "migrated"] as const) {
        const { t, w } = await tiedToLegacy(status);
        expect(await entryOf(t, w.ownerId, SLUG_A)).toEqual({ kind: "legacy" });
      }
    });

    test("after the cutover the studio opens", async () => {
      const { t, w } = await tiedToLegacy("cutover");
      for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
        expect(await entryOf(t, userId, SLUG_A)).toEqual({ kind: "studio" });
      }
    });

    test("the legacy state is never shown to someone who cannot read the service, nor to another business", async () => {
      const { t, w } = await tiedToLegacy("none");
      expect(await entryOf(t, null, SLUG_A)).toEqual({ kind: "none" });
      for (const userId of [w.outsiderId, w.financeId, w.viewOnlyId, w.otherOwnerId]) {
        expect(await entryOf(t, userId, SLUG_A)).toEqual({ kind: "none" });
      }
      expect(await entryOf(t, w.otherOwnerId, SLUG_B)).toEqual({ kind: "studio" });
    });
  });
});

// -----------------------------------------------------------------------------
// 2. pages
// -----------------------------------------------------------------------------

describe("pages", () => {
  test("returns the pages by order with the documented fields", async () => {
    const { t, w } = await setup();
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const terrace = await addPage(t, w.ownerId, w.a.menuServiceId, "Terasa");
    const section = await addSection(t, w.ownerId, wine.pageId, "Crna vina");
    await quickAdd(t, w.ownerId, section.sectionId, "Vranac", 250);

    const pages = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(pages).not.toBeNull();
    expect(pages!.map((page) => page.pageId)).toEqual([w.a.defaultPageId, wine.pageId, terrace.pageId]);
    expect(pages![0]).toEqual({
      pageId: w.a.defaultPageId,
      key: expect.stringMatching(/^pg_/),
      slug: DEFAULT_PAGE_SLUG,
      name: expect.any(String),
      isDefault: true,
      order: expect.any(Number),
      visibility: "visible",
      archived: false,
      placementCount: 0,
      hasQr: false,
    });
    expect(pages![1]).toMatchObject({
      pageId: wine.pageId,
      key: wine.key,
      slug: wine.slug,
      name: "Vinska karta",
      isDefault: false,
      visibility: "visible",
      archived: false,
      placementCount: 1,
      hasQr: false,
    });
    expect(pages![2]).toMatchObject({ pageId: terrace.pageId, name: "Terasa", placementCount: 0 });
    // Strictly increasing order.
    expect(pages![0].order).toBeLessThan(pages![1].order);
    expect(pages![1].order).toBeLessThan(pages![2].order);
  });

  test("an archived page stays in the list, flagged", async () => {
    const { t, w } = await setup();
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });

    const pages = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(pages!.map((page) => [page.pageId, page.archived])).toEqual([
      [w.a.defaultPageId, false],
      [wine.pageId, true],
    ]);
  });

  test("hasQr is true only for the page an active QR card points at", async () => {
    const { t, w } = await setup();
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const before = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    const defaultKey = before![0].key;
    expect(before!.map((page) => page.hasQr)).toEqual([false, false]);

    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: defaultKey,
        createdByUserId: w.ownerId,
      }),
    );

    const after = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(after!.map((page) => [page.pageId, page.hasQr])).toEqual([
      [w.a.defaultPageId, true],
      [wine.pageId, false],
    ]);
  });

  test("hasQr is false when the link is inactive, the card is disabled, or the card opens a URL", async () => {
    const cases = [
      { name: "inactive link", options: { linkActive: false } },
      { name: "disabled card", options: { cardStatus: "disabled" as const } },
      { name: "card retargeted to a URL", options: { targetKind: "url" as const } },
    ];
    for (const { name, options } of cases) {
      const { t, w } = await setup();
      const defaultKey = (await pagesOf(t, w.ownerId, w.a.menuServiceId))![0].key;
      await t.run(async (ctx) =>
        seedQrLink(ctx, {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          pageKey: defaultKey,
          createdByUserId: w.ownerId,
          ...options,
        }),
      );
      const pages = await pagesOf(t, w.ownerId, w.a.menuServiceId);
      expect(pages![0].hasQr, name).toBe(false);
    }
  });

  test("a QR link of another business never marks a page of this one", async () => {
    const { t, w } = await setup();
    const defaultKey = (await pagesOf(t, w.ownerId, w.a.menuServiceId))![0].key;
    // The link row belongs to service B but carries A's page key.
    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.b.menuServiceId,
        businessId: w.b.businessId,
        pageKey: defaultKey,
        createdByUserId: w.otherOwnerId,
      }),
    );
    const pages = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(pages![0].hasQr).toBe(false);
  });

  test("owner, manager, editor and admin read the column", async () => {
    const { t, w } = await setup();
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const pages = await pagesOf(t, userId, w.a.menuServiceId);
      expect(pages).toHaveLength(1);
    }
  });

  test("null for signed-out callers, outsiders, finance, view-only and the owner of another business", async () => {
    const { t, w } = await setup();
    await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    expect(await t.query(api.menuStudio.pages, { menuServiceId: w.a.menuServiceId })).toBeNull();
    for (const userId of [w.outsiderId, w.financeId, w.viewOnlyId, w.otherOwnerId]) {
      expect(await pagesOf(t, userId, w.a.menuServiceId)).toBeNull();
    }
  });

  test("tenant isolation: each owner sees only their own service's pages", async () => {
    const { t, w } = await setup();
    await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    expect(await pagesOf(t, w.otherOwnerId, w.a.menuServiceId)).toBeNull();
    expect(await pagesOf(t, w.ownerId, w.b.menuServiceId)).toBeNull();
    const own = await pagesOf(t, w.otherOwnerId, w.b.menuServiceId);
    expect(own!.map((page) => page.pageId)).toEqual([w.b.defaultPageId]);
  });
});

// -----------------------------------------------------------------------------
// 3. One shared price across standard pages (master §5.3, K10 acceptance)
// -----------------------------------------------------------------------------

describe("one article, one price, on every page (K10 acceptance)", () => {
  async function sharedFixture() {
    const { t, w } = await setup();
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const barSection = await addSection(t, w.ownerId, w.a.defaultPageId, "Rakije");
    const wineSection = await addSection(t, w.ownerId, wine.pageId, "Crna vina");
    const created = await quickAdd(t, w.ownerId, barSection.sectionId, "Vranac", 250);
    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: wineSection.sectionId,
      articleId: created.articleId,
    });
    return { t, w, wine, articleId: created.articleId };
  }

  async function publishDraft(t: T, w: MenuWorldSeed) {
    const preview = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
      menuServiceId: w.a.menuServiceId,
    });
    if (!preview) throw new Error("expected a publish preview");
    const result = await as(t, w.ownerId).mutation(api.menuPublishing.publish, {
      menuServiceId: w.a.menuServiceId,
      expectedRevision: preview.revision,
    });
    expect(result.ok).toBe(true);
  }

  /** What a guest reads for one page of the published menu: its article prices, or null. */
  async function guestPrices(t: T, pageSlug: string) {
    const result = await t.query(api.menuPublic.page, { slug: SLUG_A, pageSlug });
    if (!result || result.kind !== "page") return null;
    return result.sections.flatMap((section) => section.articles.map((article) => article.priceRsd));
  }

  test("a single setBasePrice shows the new price on BOTH pages and dirties only the draft", async () => {
    const { t, w, wine, articleId } = await sharedFixture();

    // Nothing is published yet: guests read nothing.
    expect(await guestPrices(t, DEFAULT_PAGE_SLUG)).toBeNull();
    expect(await guestPrices(t, wine.slug)).toBeNull();

    await publishDraft(t, w);
    expect(await guestPrices(t, DEFAULT_PAGE_SLUG)).toEqual([250]);
    expect(await guestPrices(t, wine.slug)).toEqual([250]);
    const clean = await as(t, w.ownerId).query(api.menuPublishing.draftStatus, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(clean).toMatchObject({ state: "clean", hasUnpublishedChanges: false });
    const revisionBefore = (await draftOf(t, w.a.menuServiceId)).revision;

    const result = await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId,
      expectedPriceRsd: 250,
      priceRsd: 280,
    });
    expect(result).toEqual({ ok: true });

    // The draft shows the new price on both pages, with one article behind both.
    const onDefault = await content(t, w.ownerId, w.a.defaultPageId);
    const onWine = await content(t, w.ownerId, wine.pageId);
    expect(pricesOf(onDefault)).toEqual([280]);
    expect(pricesOf(onWine)).toEqual([280]);
    expect(onDefault.sections[0].placements[0].article.articleId).toBe(articleId);
    expect(onWine.sections[0].placements[0].article.articleId).toBe(articleId);

    // The draft is dirty and its revision moved by exactly one.
    const status = await as(t, w.ownerId).query(api.menuPublishing.draftStatus, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(status).toMatchObject({ state: "dirty", hasUnpublishedChanges: true });
    expect(status!.revision).toBe(revisionBefore + 1);

    // Guests still read the published prices until the next publish.
    expect(await guestPrices(t, DEFAULT_PAGE_SLUG)).toEqual([250]);
    expect(await guestPrices(t, wine.slug)).toEqual([250]);

    await publishDraft(t, w);
    expect(await guestPrices(t, DEFAULT_PAGE_SLUG)).toEqual([280]);
    expect(await guestPrices(t, wine.slug)).toEqual([280]);
  });

  test("a stale expectedPriceRsd returns the conflict and writes nothing", async () => {
    const { t, w, articleId } = await sharedFixture();
    // Someone else changed the price meanwhile.
    await as(t, w.managerId).mutation(api.menuCatalog.setBasePrice, {
      articleId,
      expectedPriceRsd: 250,
      priceRsd: 260,
    });
    const before = await snapshot(t, w.a.menuServiceId);

    const result = await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId,
      expectedPriceRsd: 250,
      priceRsd: 280,
    });
    expect(result).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 260 },
      attempted: { basePriceRsd: 280 },
    });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

// -----------------------------------------------------------------------------
// 4. A page an active QR card points at cannot be deleted or archived
// -----------------------------------------------------------------------------

describe("a page with an active QR card (K10 acceptance)", () => {
  async function qrPageFixture(options: { linkActive?: boolean } = {}) {
    const { t, w } = await setup();
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const section = await addSection(t, w.ownerId, wine.pageId, "Crna vina");
    await quickAdd(t, w.ownerId, section.sectionId, "Vranac", 250);
    const qr = await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: wine.key,
        createdByUserId: w.ownerId,
        ...options,
      }),
    );
    return { t, w, wine, qr };
  }

  test("remove and archive are refused with page_has_qr and nothing changes", async () => {
    const { t, w, wine } = await qrPageFixture();
    const before = await snapshot(t, w.a.menuServiceId);
    const column = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(column!.find((page) => page.pageId === wine.pageId)?.hasQr).toBe(true);

    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      expect(await codeOf(as(t, userId).mutation(api.menuPages.remove, { pageId: wine.pageId }))).toBe(
        MENU_ERROR.pageHasQr,
      );
      expect(await codeOf(as(t, userId).mutation(api.menuPages.archive, { pageId: wine.pageId }))).toBe(
        MENU_ERROR.pageHasQr,
      );
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("once the link is deactivated the same page can be deleted", async () => {
    const { t, w, wine, qr } = await qrPageFixture();
    expect(await codeOf(as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId }))).toBe(
      MENU_ERROR.pageHasQr,
    );

    await t.run(async (ctx) => ctx.db.patch(qr.linkId, { active: false }));
    const column = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(column!.find((page) => page.pageId === wine.pageId)?.hasQr).toBe(false);

    const result = await as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId });
    expect(result).toEqual({ deleted: true });
    const after = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(after!.map((page) => page.pageId)).toEqual([w.a.defaultPageId]);
  });

  test("a link that is inactive from the start never blocks removal", async () => {
    const { t, w, wine } = await qrPageFixture({ linkActive: false });
    const column = await pagesOf(t, w.ownerId, w.a.menuServiceId);
    expect(column!.find((page) => page.pageId === wine.pageId)?.hasQr).toBe(false);

    const result = await as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId });
    expect(result).toEqual({ deleted: true });
  });
});

// -----------------------------------------------------------------------------
// 5. quickAddMany
// -----------------------------------------------------------------------------

describe("quickAddMany", () => {
  type Row = {
    sectionId: Id<"menuSections">;
    name: string;
    priceRsd: number | null;
    decision?: "new" | "existing" | "skip";
    existingArticleId?: Id<"menuArticles">;
  };

  /** Page 1 ("Topli napici", "Hladni napici") with Espresso 150 already in "Topli napici". */
  async function fixture() {
    const { t, w } = await setup();
    const hot = await addSection(t, w.ownerId, w.a.defaultPageId, "Topli napici");
    const cold = await addSection(t, w.ownerId, w.a.defaultPageId, "Hladni napici");
    const espresso = await quickAdd(t, w.ownerId, hot.sectionId, "Espresso", 150);
    return {
      t,
      w,
      hotId: hot.sectionId,
      coldId: cold.sectionId,
      espressoId: espresso.articleId,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function quickAddMany(
    f: Pick<Fixture, "t">,
    userId: Id<"users">,
    pageId: Id<"menuPages">,
    rows: Row[],
  ) {
    return await as(f.t, userId).mutation(api.menuStudio.quickAddMany, { pageId, rows });
  }

  describe("new names", () => {
    test("adds the rows to their sections in order, counts them and bumps the revision once", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await draftOf(t, w.a.menuServiceId);

      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.hotId, name: "Cappuccino", priceRsd: 200 },
        { sectionId: f.coldId, name: "  Limunada   ", priceRsd: 250 },
        { sectionId: f.hotId, name: "Čaj", priceRsd: null },
      ]);
      expect(result).toEqual({ status: "added", created: 3, reused: 0, skipped: 0 });

      const page = await content(t, w.ownerId, w.a.defaultPageId);
      expect(namesOf(page, 0)).toEqual(["Espresso", "Cappuccino", "Čaj"]);
      expect(namesOf(page, 1)).toEqual(["Limunada"]);
      expect(page.sections[0].placements.map((placement) => placement.article.basePriceRsd)).toEqual([
        150,
        200,
        null,
      ]);
      expect(page.sections[1].placements[0].article.basePriceRsd).toBe(250);

      const after = await draftOf(t, w.a.menuServiceId);
      expect(after.articleCount).toBe(before.articleCount + 3);
      expect(after.revision).toBe(before.revision + 1);
      expect(after.lastEditByUserId).toBe(w.ownerId);

      const pageDoc = await t.run(async (ctx) => ctx.db.get(w.a.defaultPageId));
      expect(pageDoc?.placementCount).toBe(4);
      const articles = (await snapshot(t, w.a.menuServiceId)).articles;
      expect(articles.find((article) => article.name === "Cappuccino")).toMatchObject({
        kind: "item",
        nameNormalized: "cappuccino",
        basePriceRsd: 200,
        mediaMode: "none",
      });
      expect(articles.find((article) => article.name === "Čaj")?.basePriceRsd).toBeUndefined();
    });

    test("accepts the maximum number of rows in one call", async () => {
      const f = await fixture();
      const { t, w } = f;
      const rows: Row[] = Array.from({ length: MENU_STUDIO_MAX_QUICK_ROWS }, (_, index) => ({
        sectionId: f.coldId,
        name: `Sok broj ${index + 1}`,
        priceRsd: 100 + index,
      }));
      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, rows);
      expect(result).toEqual({
        status: "added",
        created: MENU_STUDIO_MAX_QUICK_ROWS,
        reused: 0,
        skipped: 0,
      });
      const page = await content(t, w.ownerId, w.a.defaultPageId);
      expect(page.sections[1].placements).toHaveLength(MENU_STUDIO_MAX_QUICK_ROWS);
    });
  });

  describe("similar names", () => {
    test("a row whose normalized name equals an existing article comes back as similar and NOTHING is written", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await snapshot(t, w.a.menuServiceId);
      const contentBefore = await content(t, w.ownerId, w.a.defaultPageId);

      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.hotId, name: "Cappuccino", priceRsd: 200 },
        { sectionId: f.coldId, name: "espresso ", priceRsd: 160 },
        { sectionId: f.coldId, name: "Limunada", priceRsd: 250 },
      ]);
      expect(result).toEqual({
        status: "similar",
        rows: [
          {
            index: 1,
            candidates: [
              {
                articleId: f.espressoId,
                key: expect.stringMatching(/^ar_/),
                name: "Espresso",
                basePriceRsd: 150,
              },
            ],
          },
        ],
      });

      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
      expect(await content(t, w.ownerId, w.a.defaultPageId)).toEqual(contentBefore);
      expect((await draftOf(t, w.a.menuServiceId)).revision).toBe(before.draft!.revision);
    });

    test("diacritics and punctuation do not make a name different", async () => {
      const { t, w } = await setup();
      const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Rakije");
      await quickAdd(t, w.ownerId, section.sectionId, "Šljivovica 0,5", 400);
      const result = await as(t, w.ownerId).mutation(api.menuStudio.quickAddMany, {
        pageId: w.a.defaultPageId,
        rows: [{ sectionId: section.sectionId, name: "sljivovica 0.5", priceRsd: 420 }],
      });
      expect(result).toMatchObject({ status: "similar", rows: [{ index: 0 }] });
    });

    test("an article of another business does not count as similar", async () => {
      const { t, w } = await setup();
      const sectionB = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
      await quickAdd(t, w.otherOwnerId, sectionB.sectionId, "Espresso", 150);
      const sectionA = await addSection(t, w.ownerId, w.a.defaultPageId, "Topli napici");
      const result = await as(t, w.ownerId).mutation(api.menuStudio.quickAddMany, {
        pageId: w.a.defaultPageId,
        rows: [{ sectionId: sectionA.sectionId, name: "Espresso", priceRsd: 150 }],
      });
      expect(result).toEqual({ status: "added", created: 1, reused: 0, skipped: 0 });
    });

    test("decision existing adds a placement of the SAME article: no new article, price shared", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await draftOf(t, w.a.menuServiceId);

      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.coldId, name: "espresso ", priceRsd: 999, decision: "existing", existingArticleId: f.espressoId },
        { sectionId: f.coldId, name: "Limunada", priceRsd: 250 },
      ]);
      expect(result).toEqual({ status: "added", created: 1, reused: 1, skipped: 0 });

      const page = await content(t, w.ownerId, w.a.defaultPageId);
      expect(namesOf(page, 1)).toEqual(["Espresso", "Limunada"]);
      // The re-used row carries the article's own price, not the typed one.
      expect(page.sections[1].placements[0].article).toMatchObject({
        articleId: f.espressoId,
        basePriceRsd: 150,
      });
      expect(page.sections[0].placements[0].article.articleId).toBe(f.espressoId);

      const state = await snapshot(t, w.a.menuServiceId);
      expect(state.articles.filter((article) => article.nameNormalized === "espresso")).toHaveLength(1);
      expect(state.articles).toHaveLength(2);
      // Only the new article raises the article count.
      const after = await draftOf(t, w.a.menuServiceId);
      expect(after.articleCount).toBe(before.articleCount + 1);
      expect(after.revision).toBe(before.revision + 1);
    });

    test("decision existing can show an article of ANOTHER page of the same service", async () => {
      const f = await fixture();
      const { t, w } = f;
      const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
      const wineSection = await addSection(t, w.ownerId, wine.pageId, "Aperitivi");
      const before = await draftOf(t, w.a.menuServiceId);

      const result = await quickAddMany(f, w.ownerId, wine.pageId, [
        { sectionId: wineSection.sectionId, name: "Espresso", priceRsd: 150, decision: "existing", existingArticleId: f.espressoId },
      ]);
      expect(result).toEqual({ status: "added", created: 0, reused: 1, skipped: 0 });

      const onWine = await content(t, w.ownerId, wine.pageId);
      expect(onWine.sections[0].placements[0].article.articleId).toBe(f.espressoId);
      const after = await draftOf(t, w.a.menuServiceId);
      expect(after.articleCount).toBe(before.articleCount);
      expect(after.revision).toBe(before.revision + 1);
      const pageDoc = await t.run(async (ctx) => ctx.db.get(wine.pageId));
      expect(pageDoc?.placementCount).toBe(1);
    });

    test("decision new creates a duplicate on purpose", async () => {
      const f = await fixture();
      const { t, w } = f;
      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.coldId, name: "Espresso", priceRsd: 180, decision: "new" },
      ]);
      expect(result).toEqual({ status: "added", created: 1, reused: 0, skipped: 0 });

      const state = await snapshot(t, w.a.menuServiceId);
      const espressos = state.articles.filter((article) => article.nameNormalized === "espresso");
      expect(espressos.map((article) => article.basePriceRsd).sort()).toEqual([150, 180]);
      const page = await content(t, w.ownerId, w.a.defaultPageId);
      expect(namesOf(page, 1)).toEqual(["Espresso"]);
      expect(page.sections[1].placements[0].article.articleId).not.toBe(f.espressoId);
    });

    test("decision skip writes nothing for that row; the other rows are still added", async () => {
      const f = await fixture();
      const { t, w } = f;
      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.coldId, name: "Espresso", priceRsd: 150, decision: "skip" },
        { sectionId: f.coldId, name: "Limunada", priceRsd: 250 },
      ]);
      expect(result).toEqual({ status: "added", created: 1, reused: 0, skipped: 1 });
      const page = await content(t, w.ownerId, w.a.defaultPageId);
      expect(namesOf(page, 1)).toEqual(["Limunada"]);
    });

    test("a call where every row is skipped writes nothing, not even a revision", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await snapshot(t, w.a.menuServiceId);
      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.coldId, name: "Espresso", priceRsd: 150, decision: "skip" },
      ]);
      expect(result).toEqual({ status: "added", created: 0, reused: 0, skipped: 1 });
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    });

    test("a decision on one row does not hide a similar answer for another row without one", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await snapshot(t, w.a.menuServiceId);
      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.coldId, name: "Espresso", priceRsd: 150, decision: "new" },
        { sectionId: f.coldId, name: "ESPRESSO", priceRsd: 150 },
      ]);
      expect(result).toMatchObject({ status: "similar", rows: [{ index: 1 }] });
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    });

    test("decision existing for an article already shown in that section is counted as skipped", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await snapshot(t, w.a.menuServiceId);

      const result = await quickAddMany(f, w.ownerId, w.a.defaultPageId, [
        { sectionId: f.hotId, name: "Espresso", priceRsd: 150, decision: "existing", existingArticleId: f.espressoId },
      ]);
      expect(result).toEqual({ status: "added", created: 0, reused: 0, skipped: 1 });
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    });
  });

  describe("invalid input refuses the whole call", () => {
    const valid = (f: Fixture): Row => ({ sectionId: f.hotId, name: "Cappuccino", priceRsd: 200 });

    async function expectInvalid(f: Fixture, rows: Row[], pageId?: Id<"menuPages">) {
      const before = await snapshot(f.t, f.w.a.menuServiceId);
      const code = await codeOf(quickAddMany(f, f.w.ownerId, pageId ?? f.w.a.defaultPageId, rows));
      expect(code).toBe(MENU_ERROR.invalidInput);
      expect(await snapshot(f.t, f.w.a.menuServiceId)).toEqual(before);
    }

    test("an empty or blank name", async () => {
      const f = await fixture();
      await expectInvalid(f, [valid(f), { sectionId: f.hotId, name: "", priceRsd: 100 }]);
      await expectInvalid(f, [valid(f), { sectionId: f.hotId, name: "   ", priceRsd: 100 }]);
    });

    test("a name longer than the limit", async () => {
      const f = await fixture();
      await expectInvalid(f, [
        valid(f),
        { sectionId: f.hotId, name: "x".repeat(MENU_TEXT.articleName + 1), priceRsd: 100 },
      ]);
    });

    test("a fractional, negative or too large price", async () => {
      const f = await fixture();
      await expectInvalid(f, [valid(f), { sectionId: f.hotId, name: "Sok", priceRsd: 12.5 }]);
      await expectInvalid(f, [valid(f), { sectionId: f.hotId, name: "Sok", priceRsd: -1 }]);
      await expectInvalid(f, [
        valid(f),
        { sectionId: f.hotId, name: "Sok", priceRsd: MENU_MAX_PRICE_RSD + 1 },
      ]);
    });

    test("a section of ANOTHER page of the same service", async () => {
      const f = await fixture();
      const wine = await addPage(f.t, f.w.ownerId, f.w.a.menuServiceId, "Vinska karta");
      const wineSection = await addSection(f.t, f.w.ownerId, wine.pageId, "Crna vina");
      await expectInvalid(f, [valid(f), { sectionId: wineSection.sectionId, name: "Vranac", priceRsd: 250 }]);
    });

    test("no rows, or more than the maximum", async () => {
      const f = await fixture();
      await expectInvalid(f, []);
      const tooMany: Row[] = Array.from({ length: MENU_STUDIO_MAX_QUICK_ROWS + 1 }, (_, index) => ({
        sectionId: f.coldId,
        name: `Sok broj ${index + 1}`,
        priceRsd: 100,
      }));
      expect(tooMany).toHaveLength(51);
      await expectInvalid(f, tooMany);
    });

    test("decision existing without an article id", async () => {
      const f = await fixture();
      await expectInvalid(f, [
        valid(f),
        { sectionId: f.hotId, name: "Espresso", priceRsd: 150, decision: "existing" },
      ]);
    });
  });

  describe("tenant isolation", () => {
    test("another business's section, article or page is not_found and nothing is written", async () => {
      const f = await fixture();
      const { t, w } = f;
      const sectionB = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
      const articleB = await quickAdd(t, w.otherOwnerId, sectionB.sectionId, "Jelen pivo", 200);
      const beforeA = await snapshot(t, w.a.menuServiceId);
      const beforeB = await snapshot(t, w.b.menuServiceId);

      // A's owner on A's page with a section of B.
      expect(
        await codeOf(
          quickAddMany(f, w.ownerId, w.a.defaultPageId, [
            { sectionId: f.hotId, name: "Cappuccino", priceRsd: 200 },
            { sectionId: sectionB.sectionId, name: "Sok", priceRsd: 100 },
          ]),
        ),
      ).toBe(MENU_ERROR.notFound);
      // A's owner on A's page re-using an article of B.
      expect(
        await codeOf(
          quickAddMany(f, w.ownerId, w.a.defaultPageId, [
            { sectionId: f.hotId, name: "Jelen pivo", priceRsd: 200, decision: "existing", existingArticleId: articleB.articleId },
          ]),
        ),
      ).toBe(MENU_ERROR.notFound);
      // A's owner on B's page.
      expect(
        await codeOf(
          quickAddMany(f, w.ownerId, w.b.defaultPageId, [
            { sectionId: sectionB.sectionId, name: "Sok", priceRsd: 100 },
          ]),
        ),
      ).toBe(MENU_ERROR.notFound);
      // B's owner on A's page.
      expect(
        await codeOf(
          quickAddMany(f, w.otherOwnerId, w.a.defaultPageId, [
            { sectionId: f.hotId, name: "Sok", priceRsd: 100 },
          ]),
        ),
      ).toBe(MENU_ERROR.notFound);

      expect(await snapshot(t, w.a.menuServiceId)).toEqual(beforeA);
      expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
    });
  });

  describe("roles", () => {
    test("owner, manager, editor and admin may add rows", async () => {
      const f = await fixture();
      const { t, w } = f;
      const names = new Map<Id<"users">, string>([
        [w.ownerId, "Sok od narandže"],
        [w.managerId, "Sok od jabuke"],
        [w.editorId, "Sok od kajsije"],
        [w.adminId, "Sok od breskve"],
      ]);
      for (const [userId, name] of names) {
        const result = await quickAddMany(f, userId, w.a.defaultPageId, [
          { sectionId: f.coldId, name, priceRsd: 220 },
        ]);
        expect(result, name).toEqual({ status: "added", created: 1, reused: 0, skipped: 0 });
      }
      const page = await content(t, w.ownerId, w.a.defaultPageId);
      expect(namesOf(page, 1)).toEqual([...names.values()]);
    });

    test("finance, view-only and outsiders get not_found and nothing is written", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await snapshot(t, w.a.menuServiceId);
      for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
        const code = await codeOf(
          quickAddMany(f, userId, w.a.defaultPageId, [{ sectionId: f.coldId, name: "Sok", priceRsd: 100 }]),
        );
        expect(code).toBe(MENU_ERROR.notFound);
      }
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    });

    test("a signed-out caller is refused", async () => {
      const f = await fixture();
      const { t, w } = f;
      const before = await snapshot(t, w.a.menuServiceId);
      const code = await codeOf(
        t.mutation(api.menuStudio.quickAddMany, {
          pageId: w.a.defaultPageId,
          rows: [{ sectionId: f.coldId, name: "Sok", priceRsd: 100 }],
        }),
      );
      expect(code).toBe(MENU_ERROR.unauthenticated);
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    });

    test("with client editing switched off clients get editing_disabled; the admin still adds", async () => {
      const f = await fixture();
      const { t, w } = f;
      await t.run(async (ctx) => {
        await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
      });
      const before = await snapshot(t, w.a.menuServiceId);
      for (const userId of [w.ownerId, w.managerId, w.editorId]) {
        const code = await codeOf(
          quickAddMany(f, userId, w.a.defaultPageId, [{ sectionId: f.coldId, name: "Sok", priceRsd: 100 }]),
        );
        expect(code).toBe(MENU_ERROR.editingDisabled);
      }
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

      const admin = await quickAddMany(f, w.adminId, w.a.defaultPageId, [
        { sectionId: f.coldId, name: "Sok", priceRsd: 100 },
      ]);
      expect(admin).toEqual({ status: "added", created: 1, reused: 0, skipped: 0 });
    });

    test("an archived page refuses the table entry with page_archived", async () => {
      const f = await fixture();
      const { t, w } = f;
      const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
      const wineSection = await addSection(t, w.ownerId, wine.pageId, "Crna vina");
      await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
      const before = await snapshot(t, w.a.menuServiceId);

      const code = await codeOf(
        quickAddMany(f, w.ownerId, wine.pageId, [
          { sectionId: wineSection.sectionId, name: "Vranac", priceRsd: 250 },
        ]),
      );
      expect(code).toBe(MENU_ERROR.pageArchived);
      expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    });
  });
});

// -----------------------------------------------------------------------------
// 6. Staff never reaches these functions
// -----------------------------------------------------------------------------

describe("staff (Osoblje)", () => {
  test("has neither menu.read nor menu.edit: PIN users without accounts never reach the editor", () => {
    expect(roleCan("staff", "menu.edit")).toBe(false);
    expect(roleCan("staff", "menu.read")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// 7. pageContent row fields: variantsEnabled and priceCheck
// -----------------------------------------------------------------------------

describe("pageContent editor row fields", () => {
  test("a plain article has variantsEnabled false and priceCheck false; the variants switch turns the first on", async () => {
    const { t, w } = await setup();
    const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Topli napici");
    const espresso = await quickAdd(t, w.ownerId, section.sectionId, "Espresso", 150);

    const plain = (await content(t, w.ownerId, w.a.defaultPageId)).sections[0].placements[0].article;
    expect(plain).toMatchObject({ articleId: espresso.articleId, variantsEnabled: false, priceCheck: false });

    const switched = await as(t, w.ownerId).mutation(api.menuArticleOptions.setArticleOptionSwitches, {
      articleId: espresso.articleId,
      variantsEnabled: true,
    });
    expect(switched).toEqual({ ok: true });
    const withVariants = (await content(t, w.ownerId, w.a.defaultPageId)).sections[0].placements[0].article;
    expect(withVariants).toMatchObject({ variantsEnabled: true, priceCheck: false });

    await as(t, w.ownerId).mutation(api.menuArticleOptions.setArticleOptionSwitches, {
      articleId: espresso.articleId,
      variantsEnabled: false,
    });
    const off = (await content(t, w.ownerId, w.a.defaultPageId)).sections[0].placements[0].article;
    expect(off.variantsEnabled).toBe(false);
  });

  test("a combo whose component price changed has priceCheck true until its own price is decided", async () => {
    const { t, w } = await setup();
    const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Meniji");
    const burger = await quickAdd(t, w.ownerId, section.sectionId, "Burger", 650);
    const fries = await quickAdd(t, w.ownerId, section.sectionId, "Pomfrit", 250);
    const combo = await as(t, w.ownerId).mutation(api.menuCombos.createCombo, {
      sectionId: section.sectionId,
      name: "Burger meni",
      priceRsd: 990,
      components: [
        { articleId: burger.articleId, quantity: 1 },
        { articleId: fries.articleId, quantity: 1 },
      ],
    });
    const comboRow = async () => {
      const page = await content(t, w.ownerId, w.a.defaultPageId);
      const row = page.sections[0].placements.find((p) => p.article.articleId === combo.articleId);
      if (!row) throw new Error("combo row missing");
      return row.article;
    };

    expect(await comboRow()).toMatchObject({ kind: "combo", basePriceRsd: 990, priceCheck: false });

    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: burger.articleId,
      expectedPriceRsd: 650,
      priceRsd: 700,
    });
    // The combo keeps its manual price and is only flagged.
    expect(await comboRow()).toMatchObject({ kind: "combo", basePriceRsd: 990, priceCheck: true });
    // The component itself is not flagged.
    const page = await content(t, w.ownerId, w.a.defaultPageId);
    const burgerRow = page.sections[0].placements.find((p) => p.article.articleId === burger.articleId);
    expect(burgerRow?.article.priceCheck).toBe(false);

    // The client's decision on the combo price clears the flag.
    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: combo.articleId,
      expectedPriceRsd: 990,
      priceRsd: 1040,
    });
    expect(await comboRow()).toMatchObject({ basePriceRsd: 1040, priceCheck: false });
  });
});
