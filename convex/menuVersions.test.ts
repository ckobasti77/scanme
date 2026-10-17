/// <reference types="vite/client" />

// ScanMe Menu V1 — K05: versions, retention and restore (convex/menuPublishing.ts).
// Covered: exactly the newest 20 snapshots are kept and the older ones are
// pruned; pruning is bounded (batches with continuations) and never touches a
// live or non-retired version; the cron reserve restarts only stale prunes;
// restoreVersion turns a version into the DRAFT (same keys, exact counters)
// while guests keep seeing the live version until the next publish; restoring
// the live version discards draft edits; stale / unknown / retired refusals;
// pages with an active QR link are kept and reported; roles, tenants, audit.
// Fictional data only ("Kafana kod Mike", "Demo restoran").

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_PRUNE_BATCH, MENU_RETAINED_VERSIONS } from "../lib/menu/budget";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { DEFAULT_PAGE_SLUG } from "../lib/menu/slugs";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  seedQrLink,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

afterEach(() => {
  vi.useRealTimers();
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

const MINUTE = 60_000;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

// -----------------------------------------------------------------------------
// Building and publishing a menu
// -----------------------------------------------------------------------------

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
}

async function addArticle(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
  priceRsd: number,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    priceRsd,
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

async function setPrice(
  t: T,
  userId: Id<"users">,
  articleId: Id<"menuArticles">,
  from: number,
  to: number,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.setBasePrice, {
    articleId,
    expectedPriceRsd: from,
    priceRsd: to,
  });
  if (!result.ok) throw new Error("setBasePrice conflict");
}

/** Section "Roštilj" with the article "Pljeskavica" (450) on the default page of tenant A. */
async function simpleMenu(t: T, w: MenuWorldSeed) {
  const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Roštilj");
  const pljeskavica = await addArticle(t, w.ownerId, section.sectionId, "Pljeskavica", 450);
  return { sectionId: section.sectionId, articleId: pljeskavica.articleId, key: pljeskavica.key };
}

/** The preview the person reviewed, then the publication of exactly that revision. */
async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const me = as(t, userId);
  const preview = await me.query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!preview) throw new Error("publishPreview was refused");
  const result = await me.mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${result.reason}`);
  return result;
}

async function statusOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const status = await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId });
  if (!status) throw new Error("draftStatus was refused");
  return status;
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

/** Restores with the current draft revision and expects it to succeed. */
async function restoreOk(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  versionNumber: number,
) {
  const { revision } = await statusOf(t, userId, menuServiceId);
  const result = await restoreAt(t, userId, menuServiceId, versionNumber, revision);
  if (!result.ok) throw new Error(`restore refused: ${result.reason}`);
  return result;
}

async function listedNumbers(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const listed = await as(t, userId).query(api.menuPublishing.listVersions, { menuServiceId });
  if (!listed) throw new Error("listVersions was refused");
  return listed.versions.map((version) => version.number);
}

// -----------------------------------------------------------------------------
// What guests see
// -----------------------------------------------------------------------------

async function publicMenu(t: T, slug: string = SLUG_A) {
  const page = await t.query(api.menuPublic.page, { slug, pageSlug: DEFAULT_PAGE_SLUG });
  if (!page || page.kind !== "page") throw new Error("expected a public page");
  return {
    versionNumber: page.versionNumber,
    sections: page.sections.map((section) => ({
      name: section.name,
      articles: section.articles.map((article) => ({
        name: article.name,
        priceRsd: article.priceRsd,
        variants: article.variants.map((variant) => `${variant.name} ${variant.priceRsd}`),
      })),
    })),
  };
}
type PublicMenu = Awaited<ReturnType<typeof publicMenu>>;

function publicNames(menu: PublicMenu): string[] {
  return menu.sections.flatMap((section) => section.articles.map((article) => article.name));
}

// -----------------------------------------------------------------------------
// Reading the draft and the stored versions directly
// -----------------------------------------------------------------------------

function sorted<R>(rows: R[]): R[] {
  return rows.slice().sort((a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/** The whole draft of a service in terms of stable keys (ids differ after a restore). */
async function draftSummary(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const pages = await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const articles = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const placements = await ctx.db
      .query("menuPlacements")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const variants = await ctx.db
      .query("menuVariants")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const groups = await ctx.db
      .query("menuAddonGroups")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const options = await ctx.db
      .query("menuAddonOptions")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const links = await ctx.db
      .query("menuArticleAddonGroups")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const state = await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique();

    const pageKey = new Map<string, string>(pages.map((row) => [row._id, row.key]));
    const sectionKey = new Map<string, string>(sections.map((row) => [row._id, row.key]));
    const articleKey = new Map<string, string>(articles.map((row) => [row._id, row.key]));
    const groupKey = new Map<string, string>(groups.map((row) => [row._id, row.key]));
    const missing = "<missing>";

    return {
      articleCount: state?.articleCount ?? -1,
      pages: sorted(
        pages.map((row) => ({
          key: row.key,
          slug: row.slug,
          name: row.name,
          isDefault: row.isDefault,
          order: row.order,
          visibility: row.visibility,
          archived: row.archivedAt !== undefined,
          placementCount: row.placementCount,
        })),
      ),
      sections: sorted(
        sections.map((row) => ({
          key: row.key,
          page: pageKey.get(row.pageId) ?? missing,
          name: row.name,
          order: row.order,
          visibility: row.visibility,
        })),
      ),
      articles: sorted(
        articles.map((row) => ({
          key: row.key,
          name: row.name,
          basePriceRsd: row.basePriceRsd ?? null,
          variantsEnabled: row.variantsEnabled === true,
          addonsEnabled: row.addonsEnabled === true,
        })),
      ),
      placements: sorted(
        placements.map((row) => ({
          page: pageKey.get(row.pageId) ?? missing,
          section: sectionKey.get(row.sectionId) ?? missing,
          article: articleKey.get(row.articleId) ?? missing,
          order: row.order,
          visibility: row.visibility,
        })),
      ),
      variants: sorted(
        variants.map((row) => ({
          key: row.key,
          article: articleKey.get(row.articleId) ?? missing,
          name: row.name,
          priceRsd: row.priceRsd ?? null,
          order: row.order,
        })),
      ),
      groups: sorted(
        groups.map((row) => ({ key: row.key, name: row.name, linkCount: row.linkCount })),
      ),
      options: sorted(
        options.map((row) => ({
          key: row.key,
          group: groupKey.get(row.groupId) ?? missing,
          name: row.name,
          priceDeltaRsd: row.priceDeltaRsd,
          order: row.order,
        })),
      ),
      links: sorted(
        links.map((row) => ({
          article: articleKey.get(row.articleId) ?? missing,
          group: groupKey.get(row.groupId) ?? missing,
          order: row.order,
        })),
      ),
    };
  });
}
type DraftSummary = Awaited<ReturnType<typeof draftSummary>>;

/** The exact counters of a draft: placementCount, linkCount and articleCount against the real rows. */
function counterProblems(summary: DraftSummary): string[] {
  const problems: string[] = [];
  for (const page of summary.pages) {
    const actual = summary.placements.filter((row) => row.page === page.key).length;
    if (page.placementCount !== actual) {
      problems.push(`page ${page.name}: placementCount ${page.placementCount}, rows ${actual}`);
    }
  }
  for (const group of summary.groups) {
    const actual = summary.links.filter((row) => row.group === group.key).length;
    if (group.linkCount !== actual) {
      problems.push(`group ${group.name}: linkCount ${group.linkCount}, rows ${actual}`);
    }
  }
  if (summary.articleCount !== summary.articles.length) {
    problems.push(`articleCount ${summary.articleCount}, rows ${summary.articles.length}`);
  }
  return problems;
}

async function versionRows(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuVersions")
        .withIndex("by_menuServiceId_and_number", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
}

async function versionRow(t: T, versionId: Id<"menuVersions">) {
  return await t.run(async (ctx) => await ctx.db.get(versionId));
}

async function allParts(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("menuVersionParts").collect());
}

async function partsOf(t: T, versionId: Id<"menuVersions">) {
  return (await allParts(t)).filter((part) => part.versionId === versionId);
}

async function auditRows(t: T, menuServiceId: Id<"menuServices">, action: string) {
  const rows = await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuAuditLog")
        .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
  return rows.filter((row) => row.action === action);
}

async function draftPrice(t: T, articleId: Id<"menuArticles">) {
  return (await t.run(async (ctx) => await ctx.db.get(articleId)))?.basePriceRsd;
}

const VOLATILE_FIELDS = new Set([
  "_id",
  "_creationTime",
  "createdAt",
  "updatedAt",
  "updatedByUserId",
  "menuServiceId",
]);

// Optional switches: absent and `false` mean the same everywhere (`=== true` reads),
// and the snapshot normalizes absent to false, so a restore writes an explicit false.
const FALSE_IS_ABSENT = new Set(["variantsEnabled", "addonsEnabled", "noteEnabled"]);

function normalizeValue(value: unknown, labels: Map<string, string>): unknown {
  if (typeof value === "string") return labels.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, labels));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => !VOLATILE_FIELDS.has(key) && !(FALSE_IS_ABSENT.has(key) && item === false))
        .map(([key, item]) => [key, normalizeValue(item, labels)]),
    );
  }
  return value;
}

function plain(docs: readonly object[]): Record<string, unknown>[] {
  return docs as unknown as Record<string, unknown>[];
}

/**
 * EVERY stored field of every draft row of a service (and the service settings),
 * minus ids and timestamps, with references turned into stable keys. A restore
 * that forgets a field shows up as a difference here.
 */
async function rawDraft(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const tables: Record<string, Record<string, unknown>[]> = {
      pages: plain(
        await ctx.db
          .query("menuPages")
          .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      sections: plain(
        await ctx.db
          .query("menuSections")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      articles: plain(
        await ctx.db
          .query("menuArticles")
          .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      placements: plain(
        await ctx.db
          .query("menuPlacements")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      variants: plain(
        await ctx.db
          .query("menuVariants")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      groups: plain(
        await ctx.db
          .query("menuAddonGroups")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      options: plain(
        await ctx.db
          .query("menuAddonOptions")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      links: plain(
        await ctx.db
          .query("menuArticleAddonGroups")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      components: plain(
        await ctx.db
          .query("menuComboComponents")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      roomServiceConfig: plain(
        await ctx.db
          .query("menuRoomService")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      roomServiceCategories: plain(
        await ctx.db
          .query("menuRoomServiceCategories")
          .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
      roomServiceItems: plain(
        await ctx.db
          .query("menuRoomServiceItems")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
          .collect(),
      ),
    };
    const service = await ctx.db.get(menuServiceId);

    const labels = new Map<string, string>();
    for (const [name, rows] of Object.entries(tables)) {
      for (const row of rows) {
        if (typeof row.key === "string") labels.set(String(row._id), `${name}:${row.key}`);
      }
    }
    return {
      settings: normalizeValue(service?.settings ?? null, labels),
      tables: Object.fromEntries(
        Object.entries(tables).map(([name, rows]) => [
          name,
          sorted(rows.map((row) => normalizeValue(row, labels))),
        ]),
      ),
    };
  });
}

/** A pending prune continuation in the scheduler. */
async function pendingPrunes(t: T) {
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.state.kind === "pending" && job.name.includes("pruneVersion"));
}

/** A version row that looks like a published one, with `parts` fake parts. */
async function insertFakeVersion(
  t: T,
  w: MenuWorldSeed,
  input: { number: number; parts: number; retiredAt?: number },
) {
  return await t.run(async (ctx) => {
    const versionId = await ctx.db.insert("menuVersions", {
      menuServiceId: w.a.menuServiceId,
      number: input.number,
      publishedAt: 1,
      publishedByUserId: w.ownerId,
      actorKind: "user",
      draftRevision: 0,
      summary: {
        changedPrices: 0,
        newArticles: 0,
        removedArticles: 0,
        structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
      },
      languages: ["sr"],
      pageCount: 0,
      articleCount: 0,
      bytes: 0,
      partCount: input.parts,
      formatVersion: 1,
      contentHash: "fake",
      ...(input.retiredAt !== undefined ? { retiredAt: input.retiredAt } : {}),
    });
    for (let index = 0; index < input.parts; index += 1) {
      await ctx.db.insert("menuVersionParts", {
        versionId,
        menuServiceId: w.a.menuServiceId,
        scope: "public",
        lang: "sr",
        pageKey: `fake-${index}`,
        part: 0,
        data: "{}",
      });
    }
    return versionId;
  });
}

// -----------------------------------------------------------------------------
// Retention: the newest 20 snapshots
// -----------------------------------------------------------------------------

describe("menuVersions — retention of the newest 20 snapshots", () => {
  test(
    "23 publications leave exactly the newest 20 versions (4..23) and prune the parts of 1..3",
    { timeout: 120_000 },
    async () => {
      // Fake timers freeze the scheduled prunes so the state "right after
      // publishing" can be observed before the background deletion runs.
      vi.useFakeTimers();
      const { t, w } = await setup();
      const menuServiceId = w.a.menuServiceId;
      const menu = await simpleMenu(t, w);

      let price = 450;
      for (let n = 1; n <= 23; n += 1) {
        if (n > 1) {
          await setPrice(t, w.ownerId, menu.articleId, price, price + 10);
          price += 10;
        }
        const published = await publishNow(t, w.ownerId, menuServiceId);
        expect(published.versionNumber).toBe(n);

        if (n === MENU_RETAINED_VERSIONS) {
          // 20 publications: nothing is pushed out yet.
          const rows = await versionRows(t, menuServiceId);
          expect(rows.map((row) => row.number)).toEqual(range(1, 20));
          expect(rows.every((row) => row.retiredAt === undefined)).toBe(true);
          expect(await listedNumbers(t, w.ownerId, menuServiceId)).toEqual(range(1, 20).reverse());
        }

        if (n === MENU_RETAINED_VERSIONS + 1) {
          // Right after publication 21, before any background work: version 1 is
          // retired (and nothing else), still physically there, and the list
          // already shows exactly the newest 20.
          const rows = await versionRows(t, menuServiceId);
          expect(rows).toHaveLength(21);
          expect(rows.filter((row) => row.retiredAt !== undefined).map((row) => row.number)).toEqual([1]);
          const first = rows[0];
          expect(first.number).toBe(1);
          expect(first.retiredAt).toBeTypeOf("number");
          expect((await partsOf(t, first._id)).length).toBe(first.partCount);
          expect(first.partCount).toBeGreaterThan(0);

          const listed = await as(t, w.ownerId).query(api.menuPublishing.listVersions, { menuServiceId });
          expect(listed?.versions).toHaveLength(MENU_RETAINED_VERSIONS);
          expect(listed?.versions.map((version) => version.number)).toEqual(range(2, 21).reverse());
          expect(listed?.versions.filter((version) => version.isLive).map((version) => version.number)).toEqual([21]);
          expect(listed?.liveVersionNumber).toBe(21);
        }
      }

      // After publication 23 (still before the background pruning): 1..3 are retired.
      const beforeDrain = await versionRows(t, menuServiceId);
      expect(beforeDrain).toHaveLength(23);
      expect(beforeDrain.filter((row) => row.retiredAt !== undefined).map((row) => row.number)).toEqual([1, 2, 3]);
      const removedIds = new Set(beforeDrain.slice(0, 3).map((row) => row._id));
      for (const row of beforeDrain.slice(0, 3)) {
        expect((await partsOf(t, row._id)).length).toBe(row.partCount);
      }
      const listedBefore = await as(t, w.ownerId).query(api.menuPublishing.listVersions, { menuServiceId });
      expect(listedBefore?.versions.map((version) => version.number)).toEqual(range(4, 23).reverse());

      // The background deletion.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const rows = await versionRows(t, menuServiceId);
      expect(rows.map((row) => row.number)).toEqual(range(4, 23));
      expect(rows.every((row) => row.retiredAt === undefined)).toBe(true);

      // No part of versions 1..3 remains, and every kept version has ALL its parts.
      const parts = await allParts(t);
      expect(parts.some((part) => removedIds.has(part.versionId))).toBe(false);
      for (const row of rows) {
        expect(parts.filter((part) => part.versionId === row._id)).toHaveLength(row.partCount);
      }
      expect(parts).toHaveLength(rows.reduce((sum, row) => sum + row.partCount, 0));

      // The list: 20 newest first, live only on 23.
      const listed = await as(t, w.ownerId).query(api.menuPublishing.listVersions, { menuServiceId });
      expect(listed?.versions).toHaveLength(MENU_RETAINED_VERSIONS);
      expect(listed?.versions.map((version) => version.number)).toEqual(range(4, 23).reverse());
      expect(listed?.versions.filter((version) => version.isLive).map((version) => version.number)).toEqual([23]);
      expect(listed?.liveVersionNumber).toBe(23);

      // The live version was never retired and still serves guests.
      const service = await t.run(async (ctx) => await ctx.db.get(menuServiceId));
      const newest = rows[rows.length - 1];
      expect(service?.liveVersionId).toBe(newest._id);
      expect(newest.retiredAt).toBeUndefined();
      const guests = await publicMenu(t);
      expect(guests.versionNumber).toBe(23);
      expect(guests.sections[0].articles[0].priceRsd).toBe(450 + 22 * 10);
    },
  );

  test(
    "a version pushed out with more than one batch of real parts is deleted by the continuation chain publishing starts",
    { timeout: 120_000 },
    async () => {
      vi.useFakeTimers();
      const { t, w } = await setup();
      const menuServiceId = w.a.menuServiceId;
      const owner = as(t, w.ownerId);
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan", plan: "premium" });
      });
      // 3 languages × (41 pages + splitter) + the internal part > one prune batch.
      await owner.mutation(api.menuSettings.setLanguages, { menuServiceId, translations: ["en", "de"] });
      const menu = await simpleMenu(t, w);
      for (let page = 1; page <= 40; page += 1) {
        await owner.mutation(api.menuPages.add, { menuServiceId, name: `Strana ${page}` });
      }

      let price = 450;
      for (let n = 1; n <= MENU_RETAINED_VERSIONS + 1; n += 1) {
        if (n > 1) {
          await setPrice(t, w.ownerId, menu.articleId, price, price + 10);
          price += 10;
        }
        expect((await publishNow(t, w.ownerId, menuServiceId)).versionNumber).toBe(n);
      }

      const rows = await versionRows(t, menuServiceId);
      expect(rows).toHaveLength(MENU_RETAINED_VERSIONS + 1);
      const [pushedOut] = rows;
      expect(pushedOut.number).toBe(1);
      expect(pushedOut.retiredAt).toBeTypeOf("number");
      expect(pushedOut.partCount).toBeGreaterThan(MENU_PRUNE_BATCH);
      expect(await partsOf(t, pushedOut._id)).toHaveLength(pushedOut.partCount);
      expect(await pendingPrunes(t)).toHaveLength(1);

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await versionRow(t, pushedOut._id)).toBeNull();
      expect(await partsOf(t, pushedOut._id)).toEqual([]);
      expect(await pendingPrunes(t)).toEqual([]);
      const kept = await versionRows(t, menuServiceId);
      expect(kept.map((row) => row.number)).toEqual(range(2, MENU_RETAINED_VERSIONS + 1));
      const parts = await allParts(t);
      for (const row of kept) {
        expect(parts.filter((part) => part.versionId === row._id)).toHaveLength(row.partCount);
      }
      expect((await publicMenu(t)).versionNumber).toBe(MENU_RETAINED_VERSIONS + 1);
    },
  );
});

// -----------------------------------------------------------------------------
// Retention: bounded pruning and the cron reserve
// -----------------------------------------------------------------------------

describe("menuVersions — bounded pruning", () => {
  test("pruneVersion deletes a retired version's parts one batch at a time, then the version row", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    const parts = 2 * MENU_PRUNE_BATCH + 50;
    const versionId = await insertFakeVersion(t, w, { number: 1001, parts, retiredAt: Date.now() });
    expect(await partsOf(t, versionId)).toHaveLength(parts);

    // Hop 1 and 2: one full batch each, the version row stays.
    expect(await t.mutation(internal.menuPublishing.pruneVersion, { versionId })).toBeNull();
    expect(await partsOf(t, versionId)).toHaveLength(parts - MENU_PRUNE_BATCH);
    expect(await versionRow(t, versionId)).not.toBeNull();

    expect(await t.mutation(internal.menuPublishing.pruneVersion, { versionId })).toBeNull();
    expect(await partsOf(t, versionId)).toHaveLength(parts - 2 * MENU_PRUNE_BATCH);
    expect(await versionRow(t, versionId)).not.toBeNull();

    // Hop 3: the last (short) batch also removes the version row.
    expect(await t.mutation(internal.menuPublishing.pruneVersion, { versionId })).toBeNull();
    expect(await partsOf(t, versionId)).toHaveLength(0);
    expect(await versionRow(t, versionId)).toBeNull();

    // Idempotent: the version is gone, a late continuation is a no-op.
    expect(await t.mutation(internal.menuPublishing.pruneVersion, { versionId })).toBeNull();
  });

  test("a full batch schedules its own continuation, which drains the whole version (also an exact multiple of the batch)", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    const parts = 2 * MENU_PRUNE_BATCH;
    const versionId = await insertFakeVersion(t, w, { number: 1001, parts, retiredAt: Date.now() });
    const other = await insertFakeVersion(t, w, { number: 1002, parts: 10, retiredAt: undefined });

    await t.mutation(internal.menuPublishing.pruneVersion, { versionId });
    expect(await partsOf(t, versionId)).toHaveLength(parts - MENU_PRUNE_BATCH);
    const jobs = await pendingPrunes(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args).toEqual([{ versionId }]);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await versionRow(t, versionId)).toBeNull();
    expect(await partsOf(t, versionId)).toEqual([]);
    expect(await pendingPrunes(t)).toEqual([]);
    // A neighbouring version that was not retired is untouched.
    expect(await partsOf(t, other)).toHaveLength(10);
  });

  test("a retired version below one batch is deleted in one call, without a continuation", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    const versionId = await insertFakeVersion(t, w, {
      number: 1001,
      parts: MENU_PRUNE_BATCH - 1,
      retiredAt: Date.now(),
    });

    await t.mutation(internal.menuPublishing.pruneVersion, { versionId });

    expect(await versionRow(t, versionId)).toBeNull();
    expect(await partsOf(t, versionId)).toEqual([]);
    expect(await pendingPrunes(t)).toEqual([]);
  });

  test("pruneVersion never deletes a version that is not retired", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    const versionId = await insertFakeVersion(t, w, { number: 1001, parts: 2 * MENU_PRUNE_BATCH + 20 });

    expect(await t.mutation(internal.menuPublishing.pruneVersion, { versionId })).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await versionRow(t, versionId)).not.toBeNull();
    expect(await partsOf(t, versionId)).toHaveLength(2 * MENU_PRUNE_BATCH + 20);
    expect(await pendingPrunes(t)).toEqual([]);
  });

  test("pruneVersion never deletes the live version, even when it is marked retired", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    await simpleMenu(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const [live] = await versionRows(t, w.a.menuServiceId);
    expect(live.number).toBe(1);
    await t.run(async (ctx) => {
      await ctx.db.patch(live._id, { retiredAt: Date.now() });
    });

    expect(await t.mutation(internal.menuPublishing.pruneVersion, { versionId: live._id })).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await versionRow(t, live._id)).not.toBeNull();
    expect(await partsOf(t, live._id)).toHaveLength(live.partCount);
    expect(live.partCount).toBeGreaterThan(0);
    // Guests are still served by it.
    expect((await publicMenu(t)).versionNumber).toBe(1);
  });

  test("sweepRetiredVersions restarts pruning only for versions retired more than 10 minutes ago", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    const now = Date.now();
    const stale = await insertFakeVersion(t, w, {
      number: 1001,
      parts: MENU_PRUNE_BATCH + 50,
      retiredAt: now - 11 * MINUTE,
    });
    const justOver = await insertFakeVersion(t, w, { number: 1002, parts: 3, retiredAt: now - 10 * MINUTE - 1 });
    const exactlyTen = await insertFakeVersion(t, w, { number: 1003, parts: 3, retiredAt: now - 10 * MINUTE });
    const fresh = await insertFakeVersion(t, w, { number: 1004, parts: 3, retiredAt: now - 2 * MINUTE });
    const justRetired = await insertFakeVersion(t, w, { number: 1005, parts: 3, retiredAt: now });
    const notRetired = await insertFakeVersion(t, w, { number: 1006, parts: 3 });

    expect(await t.mutation(internal.menuPublishing.sweepRetiredVersions, {})).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // The stale ones are fully gone (the first needed a continuation).
    for (const versionId of [stale, justOver]) {
      expect(await versionRow(t, versionId)).toBeNull();
      expect(await partsOf(t, versionId)).toEqual([]);
    }
    // The fresh ones are left alone: their own continuation may still be running.
    for (const versionId of [exactlyTen, fresh, justRetired, notRetired]) {
      expect(await versionRow(t, versionId)).not.toBeNull();
      expect(await partsOf(t, versionId)).toHaveLength(3);
    }
  });

  test("sweepRetiredVersions leaves the live version alone even when it was marked retired long ago", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    await simpleMenu(t, w);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const [live] = await versionRows(t, w.a.menuServiceId);
    await t.run(async (ctx) => {
      await ctx.db.patch(live._id, { retiredAt: Date.now() - 60 * MINUTE });
    });

    await t.mutation(internal.menuPublishing.sweepRetiredVersions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await versionRow(t, live._id)).not.toBeNull();
    expect(await partsOf(t, live._id)).toHaveLength(live.partCount);
    expect((await publicMenu(t)).versionNumber).toBe(1);
  });

  test("sweepRetiredVersions is bounded: one run restarts at most a small batch, the next run continues", async () => {
    vi.useFakeTimers();
    const { t, w } = await setup();
    const stale = Date.now() - 30 * MINUTE;
    // menuPublishing.ts SWEEP_BATCH = 20: a sweep never schedules more than that
    // many prunes in one transaction, so 25 stale versions need two sweeps.
    const total = 25;
    for (let index = 0; index < total; index += 1) {
      await insertFakeVersion(t, w, { number: 2001 + index, parts: 0, retiredAt: stale });
    }

    await t.mutation(internal.menuPublishing.sweepRetiredVersions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const afterFirst = (await versionRows(t, w.a.menuServiceId)).length;
    expect(afterFirst).toBe(total - 20);

    await t.mutation(internal.menuPublishing.sweepRetiredVersions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await versionRows(t, w.a.menuServiceId)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Restore: a version becomes the draft, the public menu stays
// -----------------------------------------------------------------------------

/**
 * Version 1: three grill articles (Ćevapi with the variant "Veliki"), a drink,
 * one add-on group "Prilozi" linked to three articles. Then edits of every
 * kind (price, rename, variants, a deletion, two new articles, a detached
 * group, a hidden placement) and version 2.
 */
async function buildHistory(t: T, w: MenuWorldSeed) {
  const owner = as(t, w.ownerId);
  const menuServiceId = w.a.menuServiceId;
  const grill = await addSection(t, w.ownerId, w.a.defaultPageId, "Roštilj");
  const drinks = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
  const pljeskavica = await addArticle(t, w.ownerId, grill.sectionId, "Pljeskavica", 450);
  const cevapi = await addArticle(t, w.ownerId, grill.sectionId, "Ćevapi", 600);
  const raznjici = await addArticle(t, w.ownerId, grill.sectionId, "Ražnjići", 700);
  const sok = await addArticle(t, w.ownerId, drinks.sectionId, "Sok", 150);
  const veliki = await owner.mutation(api.menuArticleOptions.addVariant, {
    articleId: cevapi.articleId,
    name: "Veliki",
    priceRsd: 800,
  });
  const prilozi = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
    articleId: pljeskavica.articleId,
    name: "Prilozi",
    selection: "multiple",
    required: false,
    options: [
      { name: "Luk", priceDeltaRsd: 0 },
      { name: "Kajmak", priceDeltaRsd: 100 },
    ],
  });
  for (const linked of [cevapi, raznjici]) {
    await owner.mutation(api.menuArticleOptions.attachAddonGroup, {
      articleId: linked.articleId,
      groupId: prilozi.groupId,
    });
  }

  const v1 = await publishNow(t, w.ownerId, menuServiceId);
  const summaryV1 = await draftSummary(t, menuServiceId);
  const publicV1 = await publicMenu(t);

  // --- edits of every kind -------------------------------------------------------
  await setPrice(t, w.ownerId, pljeskavica.articleId, 450, 520);
  const renamed = await owner.mutation(api.menuCatalog.updateArticleFields, {
    articleId: cevapi.articleId,
    expected: { name: "Ćevapi" },
    patch: { name: "Ćevapčići" },
  });
  expect(renamed).toEqual({ ok: true });
  await owner.mutation(api.menuArticleOptions.removeVariant, { variantId: veliki.variantId });
  await owner.mutation(api.menuArticleOptions.addVariant, {
    articleId: cevapi.articleId,
    name: "Mali",
    priceRsd: 500,
  });
  await addArticle(t, w.ownerId, grill.sectionId, "Gurmanska", 900);
  await addArticle(t, w.ownerId, grill.sectionId, "Pohovani sir", 350);
  const confirm = await owner.mutation(api.menuArticleDetails.deleteArticle, {
    articleId: raznjici.articleId,
  });
  if (confirm.status !== "confirm") throw new Error("expected the confirm step");
  const deleted = await owner.mutation(api.menuArticleDetails.deleteArticle, {
    articleId: raznjici.articleId,
    confirmToken: confirm.confirmToken,
  });
  expect(deleted.status).toBe("deleted");
  await owner.mutation(api.menuArticleOptions.detachAddonGroup, {
    articleId: cevapi.articleId,
    groupId: prilozi.groupId,
  });
  await owner.mutation(api.menuCatalog.setPlacementVisibility, {
    placementId: sok.placementId,
    visibility: "hidden",
  });

  const v2 = await publishNow(t, w.ownerId, menuServiceId);
  const summaryV2 = await draftSummary(t, menuServiceId);
  const publicV2 = await publicMenu(t);

  expect(v1.versionNumber).toBe(1);
  expect(v2.versionNumber).toBe(2);
  return {
    pljeskavica,
    cevapi,
    raznjici,
    sok,
    veliki,
    prilozi,
    summaryV1,
    summaryV2,
    publicV1,
    publicV2,
  };
}

describe("menuVersions — restoreVersion makes a draft and leaves the public menu alone", () => {
  test("restores a version into the draft: content, same keys, variants and exact counters; guests keep seeing the live version", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const h = await buildHistory(t, w);

    // The edits really changed things (so the restore has work to do).
    expect(h.summaryV1.articleCount).toBe(4);
    expect(h.summaryV2.articleCount).toBe(5);
    expect(h.summaryV1.pages[0].placementCount).toBe(4);
    expect(h.summaryV2.pages[0].placementCount).toBe(5);
    expect(h.summaryV1.groups[0].linkCount).toBe(3);
    expect(h.summaryV2.groups[0].linkCount).toBe(1);
    expect(counterProblems(h.summaryV1)).toEqual([]);
    expect(counterProblems(h.summaryV2)).toEqual([]);
    expect(publicNames(h.publicV1)).toEqual(["Pljeskavica", "Ćevapi", "Ražnjići", "Sok"]);
    expect(publicNames(h.publicV2)).toEqual(["Pljeskavica", "Ćevapčići", "Gurmanska", "Pohovani sir"]);

    const before = await statusOf(t, w.ownerId, menuServiceId);
    expect(before).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      liveVersionNumber: 2,
      restoredFromNumber: null,
    });

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);
    expect(restored).toMatchObject({
      ok: true,
      versionNumber: 1,
      state: "dirty",
      keptPages: [],
      renamedSlugs: [],
      droppedImages: 0,
    });
    expect(restored.changes).toBeGreaterThan(0);
    expect(restored.revision).toBeGreaterThan(before.revision);

    // The draft is version 1 again: same rows, same stable keys, exact counters.
    const after = await draftSummary(t, menuServiceId);
    expect(after).toEqual(h.summaryV1);
    expect(counterProblems(after)).toEqual([]);
    const article = (name: string) => after.articles.find((row) => row.name === name);
    expect(article("Pljeskavica")?.basePriceRsd).toBe(450);
    expect(article("Ćevapi")?.key).toBe(h.cevapi.key);
    expect(article("Ćevapčići")).toBeUndefined();
    expect(article("Ražnjići")?.key).toBe(h.raznjici.key); // deleted, back with the SAME key
    expect(article("Gurmanska")).toBeUndefined();
    expect(article("Pohovani sir")).toBeUndefined();
    expect(after.articleCount).toBe(4);
    expect(after.pages[0].placementCount).toBe(4);
    expect(after.groups.map((group) => group.linkCount)).toEqual([3]);
    expect(after.links).toHaveLength(3);
    expect(after.variants.map((variant) => [variant.key, variant.name, variant.priceRsd])).toEqual([
      [h.veliki.key, "Veliki", 800],
    ]);
    expect(after.placements.find((row) => row.article === h.sok.key)?.visibility).toBe("visible");

    // The editor's own reads agree.
    const owner = as(t, w.ownerId);
    const options = await owner.query(api.menuArticleOptions.articleOptions, {
      articleId: h.cevapi.articleId,
    });
    expect(options?.variants.map((variant) => variant.name)).toEqual(["Veliki"]);
    expect(options?.addonGroups.map((group) => group.name)).toEqual(["Prilozi"]);
    const usage = await owner.query(api.menuArticleOptions.addonGroupUsage, {
      groupId: h.prilozi.groupId,
    });
    expect(usage?.linkCount).toBe(3);
    expect(usage?.articles.map((row) => row.name).sort()).toEqual(
      ["Pljeskavica", "Ćevapi", "Ražnjići"].sort(),
    );
    const content = await owner.query(api.menuCatalog.pageContent, { pageId: w.a.defaultPageId });
    expect(
      content?.sections.map((section) => [section.name, section.placements.map((row) => row.article.name)]),
    ).toEqual([
      ["Roštilj", ["Pljeskavica", "Ćevapi", "Ražnjići"]],
      ["Pića", ["Sok"]],
    ]);

    // The public menu did not change at all; the draft says so.
    expect(await publicMenu(t)).toEqual(h.publicV2);
    const status = await statusOf(t, w.ownerId, menuServiceId);
    expect(status).toMatchObject({
      state: "dirty",
      hasUnpublishedChanges: true,
      liveVersionNumber: 2,
      restoredFromNumber: 1,
      publishedRevision: before.revision,
      revision: restored.revision,
    });
  });

  test("publishing the restored draft shows version 1's content to guests as version 3, recorded as restored from 1", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const h = await buildHistory(t, w);
    await restoreOk(t, w.ownerId, menuServiceId, 1);

    const v3 = await publishNow(t, w.ownerId, menuServiceId);
    expect(v3.versionNumber).toBe(3);

    expect(await publicMenu(t)).toEqual({ ...h.publicV1, versionNumber: 3 });
    const listed = await as(t, w.ownerId).query(api.menuPublishing.listVersions, { menuServiceId });
    expect(listed?.versions.map((version) => version.number)).toEqual([3, 2, 1]);
    expect(listed?.versions[0]).toMatchObject({ number: 3, restoredFromNumber: 1, isLive: true });
    expect(listed?.versions.find((version) => version.number === 2)?.restoredFromNumber).toBeNull();
    expect(listed?.versions.find((version) => version.number === 1)?.restoredFromNumber).toBeNull();
    const rows = await versionRows(t, menuServiceId);
    expect(rows.map((row) => row.restoredFromNumber)).toEqual([undefined, undefined, 1]);

    // The marker is consumed: the next version is not "restored from 1" again.
    const status = await statusOf(t, w.ownerId, menuServiceId);
    expect(status).toMatchObject({ state: "clean", liveVersionNumber: 3, restoredFromNumber: null });
    expect(await draftSummary(t, menuServiceId)).toEqual(h.summaryV1);
  });

  test("a restore never touches the published versions or their parts", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    await buildHistory(t, w);
    const versionsBefore = await versionRows(t, menuServiceId);
    const partsBefore = await allParts(t);
    const serviceBefore = await t.run(async (ctx) => await ctx.db.get(menuServiceId));
    expect(partsBefore.length).toBeGreaterThan(0);

    await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(await versionRows(t, menuServiceId)).toEqual(versionsBefore);
    expect(await allParts(t)).toEqual(partsBefore);
    const serviceAfter = await t.run(async (ctx) => await ctx.db.get(menuServiceId));
    expect(serviceAfter?.liveVersionId).toBe(serviceBefore?.liveVersionId);
    expect(serviceAfter?.liveVersionNumber).toBe(2);
  });
});

describe("menuVersions — restoring the live version and no-op restores", () => {
  test("restoring the live version discards the draft edits: clean, and publish reports no_changes", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    const summaryV1 = await draftSummary(t, menuServiceId);

    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    await addArticle(t, w.ownerId, menu.sectionId, "Gurmanska", 900);
    expect((await statusOf(t, w.ownerId, menuServiceId)).state).toBe("dirty");

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);
    expect(restored).toMatchObject({ ok: true, versionNumber: 1, state: "clean", keptPages: [] });
    expect(restored.changes).toBeGreaterThan(0);

    const status = await statusOf(t, w.ownerId, menuServiceId);
    expect(status).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      restoredFromNumber: null,
      liveVersionNumber: 1,
      revision: restored.revision,
      publishedRevision: restored.revision,
    });
    expect(await draftSummary(t, menuServiceId)).toEqual(summaryV1);

    const preview = await as(t, w.ownerId).query(api.menuPublishing.publishPreview, { menuServiceId });
    expect(preview?.state).toBe("clean");
    const publish = await as(t, w.ownerId).mutation(api.menuPublishing.publish, {
      menuServiceId,
      expectedRevision: status.revision,
    });
    expect(publish).toMatchObject({ ok: false, reason: "no_changes" });
    expect(await listedNumbers(t, w.ownerId, menuServiceId)).toEqual([1]);
  });

  test("restoring the live version after the draft was edited back by hand marks it clean without writing rows", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    const summaryV1 = await draftSummary(t, menuServiceId);

    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    await setPrice(t, w.ownerId, menu.articleId, 520, 450);
    const before = await statusOf(t, w.ownerId, menuServiceId);
    expect(before.state).toBe("dirty"); // the revision moved even though the content is the same
    expect(await draftSummary(t, menuServiceId)).toEqual(summaryV1);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);
    expect(restored).toMatchObject({ ok: true, changes: 0, state: "clean", revision: before.revision });

    const after = await statusOf(t, w.ownerId, menuServiceId);
    expect(after).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      revision: before.revision,
      publishedRevision: before.revision,
    });
    expect(await draftSummary(t, menuServiceId)).toEqual(summaryV1);
  });

  test("restoring the live version after restoring an older one cancels the restore: clean, marker cleared", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const h = await buildHistory(t, w);

    await restoreOk(t, w.ownerId, menuServiceId, 1);
    expect((await statusOf(t, w.ownerId, menuServiceId)).restoredFromNumber).toBe(1);
    expect(await draftSummary(t, menuServiceId)).toEqual(h.summaryV1);

    const back = await restoreOk(t, w.ownerId, menuServiceId, 2);
    expect(back).toMatchObject({ ok: true, versionNumber: 2, state: "clean" });
    expect(back.changes).toBeGreaterThan(0);
    expect(await statusOf(t, w.ownerId, menuServiceId)).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      restoredFromNumber: null,
      liveVersionNumber: 2,
    });
    expect(await draftSummary(t, menuServiceId)).toEqual(h.summaryV2);
    expect(counterProblems(await draftSummary(t, menuServiceId))).toEqual([]);

    // And the older one can be restored again afterwards.
    await restoreOk(t, w.ownerId, menuServiceId, 1);
    expect(await statusOf(t, w.ownerId, menuServiceId)).toMatchObject({
      state: "dirty",
      restoredFromNumber: 1,
    });
    expect(await draftSummary(t, menuServiceId)).toEqual(h.summaryV1);
  });

  test("restoring the live version of a clean draft changes nothing: no changes, same revision", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    const before = await statusOf(t, w.ownerId, menuServiceId);
    const summary = await draftSummary(t, menuServiceId);
    const versions = await versionRows(t, menuServiceId);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored).toMatchObject({ ok: true, changes: 0, state: "clean", revision: before.revision });
    expect(await statusOf(t, w.ownerId, menuServiceId)).toEqual(before);
    expect(await draftSummary(t, menuServiceId)).toEqual(summary);
    expect(await versionRows(t, menuServiceId)).toEqual(versions);
  });

  test("restoring a non-live version the draft already equals writes nothing: no changes, same revision, no audit row", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId); // v1
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    await publishNow(t, w.ownerId, menuServiceId); // v2 (live)

    const first = await restoreOk(t, w.ownerId, menuServiceId, 1);
    expect(first.changes).toBeGreaterThan(0);
    const before = await statusOf(t, w.ownerId, menuServiceId);
    const summary = await draftSummary(t, menuServiceId);
    const audits = (await auditRows(t, menuServiceId, "version.restored")).length;
    expect(audits).toBe(1);

    const again = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(again).toMatchObject({ ok: true, changes: 0, state: "dirty", revision: before.revision });
    expect(await statusOf(t, w.ownerId, menuServiceId)).toEqual(before);
    expect(await draftSummary(t, menuServiceId)).toEqual(summary);
    expect(await auditRows(t, menuServiceId, "version.restored")).toHaveLength(audits);
  });
});

describe("menuVersions — restore refusals", () => {
  test("a wrong expectedRevision is refused as stale_draft and nothing changes", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    const status = await statusOf(t, w.ownerId, menuServiceId);
    const summary = await draftSummary(t, menuServiceId);

    for (const wrong of [status.revision - 1, status.revision + 1, 0]) {
      const result = await restoreAt(t, w.ownerId, menuServiceId, 1, wrong);
      expect(result, `expectedRevision ${wrong}`).toMatchObject({
        ok: false,
        reason: "stale_draft",
        revision: status.revision,
      });
    }

    expect(await statusOf(t, w.ownerId, menuServiceId)).toEqual(status);
    expect(await draftSummary(t, menuServiceId)).toEqual(summary);
    expect(await draftPrice(t, menu.articleId)).toBe(520);
    expect(await auditRows(t, menuServiceId, "version.restored")).toEqual([]);
  });

  test("an edit by another person after the person looked makes the restore stale and names that person", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    const seen = await statusOf(t, w.ownerId, menuServiceId);

    await setPrice(t, w.managerId, menu.articleId, 450, 470);

    const result = await restoreAt(t, w.ownerId, menuServiceId, 1, seen.revision);
    expect(result).toMatchObject({
      ok: false,
      reason: "stale_draft",
      revision: seen.revision + 1,
      lastEditBy: { userId: w.managerId },
    });
    // The manager's edit survived.
    expect(await draftPrice(t, menu.articleId)).toBe(470);
  });

  test("an unknown version number is menu/not_found and writes nothing", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    const status = await statusOf(t, w.ownerId, menuServiceId);
    const summary = await draftSummary(t, menuServiceId);

    for (const unknown of [2, 99, 0, -1]) {
      expect(
        await codeOf(restoreAt(t, w.ownerId, menuServiceId, unknown, status.revision)),
        `version ${unknown}`,
      ).toBe(MENU_ERROR.notFound);
    }

    expect(await statusOf(t, w.ownerId, menuServiceId)).toEqual(status);
    expect(await draftSummary(t, menuServiceId)).toEqual(summary);
    expect(await auditRows(t, menuServiceId, "version.restored")).toEqual([]);
  });

  test("a retired version is menu/not_found, even while its row still exists, and is not listed", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId); // v1
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    await publishNow(t, w.ownerId, menuServiceId); // v2
    await setPrice(t, w.ownerId, menu.articleId, 520, 600);
    const [v1] = await versionRows(t, menuServiceId);
    await t.run(async (ctx) => {
      await ctx.db.patch(v1._id, { retiredAt: Date.now() });
    });
    const status = await statusOf(t, w.ownerId, menuServiceId);
    const summary = await draftSummary(t, menuServiceId);

    expect(await listedNumbers(t, w.ownerId, menuServiceId)).toEqual([2]);
    expect(await codeOf(restoreAt(t, w.ownerId, menuServiceId, 1, status.revision))).toBe(
      MENU_ERROR.notFound,
    );
    expect(await draftSummary(t, menuServiceId)).toEqual(summary);

    // The live (not retired) version still restores.
    const ok = await restoreOk(t, w.ownerId, menuServiceId, 2);
    expect(ok).toMatchObject({ ok: true, state: "clean" });
    expect(await draftPrice(t, menu.articleId)).toBe(520);
  });
});

// -----------------------------------------------------------------------------
// Restore fidelity: every attribute survives the round trip
// -----------------------------------------------------------------------------

describe("menuVersions — restore fidelity", () => {
  test(
    "restoring the live version rebuilds every draft row exactly: article attributes, options, combos, Room service and settings",
    { timeout: 60_000 },
    async () => {
      const { t, w } = await setup();
      const menuServiceId = w.a.menuServiceId;
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan", plan: "premium" });
      });
      const owner = as(t, w.ownerId);

      // --- version 1: every kind of content --------------------------------------
      const grill = await addSection(t, w.ownerId, w.a.defaultPageId, "Roštilj");
      const pljeskavica = await addArticle(t, w.ownerId, grill.sectionId, "Pljeskavica", 450);
      const cevapi = await addArticle(t, w.ownerId, grill.sectionId, "Ćevapi", 600);
      expect(
        await owner.mutation(api.menuCatalog.updateArticleFields, {
          articleId: pljeskavica.articleId,
          expected: { description: null, quantityValue: null, quantityUnit: null },
          patch: { description: "Sa roštilja", quantityValue: 250, quantityUnit: "g" },
        }),
      ).toEqual({ ok: true });
      expect(
        await owner.mutation(api.menuArticleDetails.setArticleTags, {
          articleId: pljeskavica.articleId,
          expected: [],
          tags: ["spicy", "house_special"],
        }),
      ).toEqual({ ok: true });
      await owner.mutation(api.menuArticleDetails.setAllergensEnabled, { menuServiceId, enabled: true });
      expect(
        await owner.mutation(api.menuArticleDetails.setArticleAllergens, {
          articleId: pljeskavica.articleId,
          expected: null,
          allergens: { contains: ["gluten"], mayContain: ["milk"] },
        }),
      ).toEqual({ ok: true });
      await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
        articleId: pljeskavica.articleId,
        noteEnabled: true,
      });
      expect(
        await owner.mutation(api.menuPromos.setPromo, {
          articleId: pljeskavica.articleId,
          expected: null,
          promo: { active: true, mode: "percent", percent: 10 },
        }),
      ).toEqual({ ok: true });
      const veliki = await owner.mutation(api.menuArticleOptions.addVariant, {
        articleId: cevapi.articleId,
        name: "Veliki",
        priceRsd: 800,
      });
      const prilozi = await owner.mutation(api.menuArticleOptions.createAddonGroup, {
        articleId: cevapi.articleId,
        name: "Prilozi",
        selection: "multiple",
        required: false,
        options: [
          { name: "Luk", priceDeltaRsd: 0 },
          { name: "Kajmak", priceDeltaRsd: 100 },
        ],
      });
      await owner.mutation(api.menuArticleOptions.attachAddonGroup, {
        articleId: pljeskavica.articleId,
        groupId: prilozi.groupId,
      });
      await owner.mutation(api.menuCombos.createCombo, {
        sectionId: grill.sectionId,
        name: "Roštilj set",
        priceRsd: 1500,
        components: [
          { articleId: pljeskavica.articleId, quantity: 1 },
          { articleId: cevapi.articleId, quantity: 2 },
        ],
      });
      await owner.mutation(api.menuSettings.setLanguages, { menuServiceId, translations: ["en"] });
      const category = await owner.mutation(api.menuRoomService.addCategory, {
        menuServiceId,
        name: "Hrana",
      });
      await owner.mutation(api.menuRoomService.addItems, {
        categoryId: category.categoryId,
        articleIds: [pljeskavica.articleId, cevapi.articleId],
      });
      const items = await t.run(
        async (ctx) => await ctx.db.query("menuRoomServiceItems").collect(),
      );
      const itemOf = (articleId: Id<"menuArticles">) => {
        const item = items.find((row) => row.articleId === articleId);
        if (!item) throw new Error("expected a Room service item");
        return item._id;
      };
      expect(
        await owner.mutation(api.menuRoomService.updateSettings, {
          menuServiceId,
          expected: { markupPercent: null, markupScope: "all", deliveryFeeRsd: null },
          patch: { markupPercent: 15, markupScope: "selected", deliveryFeeRsd: 200 },
        }),
      ).toEqual({ ok: true });
      await owner.mutation(api.menuRoomService.setItemsMarkup, {
        menuServiceId,
        itemIds: [itemOf(cevapi.articleId)],
        markupApplies: true,
      });
      expect(
        await owner.mutation(api.menuRoomService.setManualPrice, {
          itemId: itemOf(pljeskavica.articleId),
          expectedManualPriceRsd: null,
          manualPriceRsd: 550,
        }),
      ).toEqual({ ok: true });
      expect(
        await owner.mutation(api.menuRoomService.setManualVariantPrice, {
          itemId: itemOf(cevapi.articleId),
          variantId: veliki.variantId,
          expectedManualPriceRsd: null,
          manualPriceRsd: 950,
        }),
      ).toEqual({ ok: true });

      await publishNow(t, w.ownerId, menuServiceId);
      const raw1 = await rawDraft(t, menuServiceId);
      const summary1 = await draftSummary(t, menuServiceId);
      // Sanity: the fixture really holds the attributes the restore must bring back.
      expect(raw1.tables.components).toHaveLength(2);
      expect(raw1.tables.roomServiceItems).toHaveLength(2);
      expect(raw1.tables.roomServiceConfig).toHaveLength(1);
      expect(JSON.stringify(raw1)).toContain("Sa roštilja");
      expect(JSON.stringify(raw1)).toContain("house_special");
      expect(JSON.stringify(raw1)).toContain("manualVariantPrices");

      // --- edits that touch every one of them -------------------------------------
      const currentPage = summary1.pages[0];
      await setPrice(t, w.ownerId, pljeskavica.articleId, 450, 520); // Room service + combo warnings
      expect(
        await owner.mutation(api.menuCatalog.updateArticleFields, {
          articleId: pljeskavica.articleId,
          expected: { description: "Sa roštilja", quantityValue: 250 },
          patch: { description: null, quantityValue: 300 },
        }),
      ).toEqual({ ok: true });
      await owner.mutation(api.menuArticleDetails.setArticleTags, {
        articleId: pljeskavica.articleId,
        expected: ["spicy", "house_special"],
        tags: [],
      });
      await owner.mutation(api.menuArticleDetails.setArticleAllergens, {
        articleId: pljeskavica.articleId,
        expected: { contains: ["gluten"], mayContain: ["milk"] },
        allergens: null,
      });
      await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
        articleId: pljeskavica.articleId,
        noteEnabled: false,
      });
      await owner.mutation(api.menuPromos.setPromo, {
        articleId: pljeskavica.articleId,
        expected: { active: true, mode: "percent", percent: 10 },
        promo: null,
      });
      const confirm = await owner.mutation(api.menuArticleDetails.deleteArticle, {
        articleId: cevapi.articleId,
      });
      if (confirm.status !== "confirm") throw new Error("expected the confirm step");
      await owner.mutation(api.menuArticleDetails.deleteArticle, {
        articleId: cevapi.articleId,
        confirmToken: confirm.confirmToken,
      });
      await owner.mutation(api.menuArticleOptions.deleteAddonGroup, { groupId: prilozi.groupId });
      await owner.mutation(api.menuSettings.setLanguages, { menuServiceId, translations: [] });
      await owner.mutation(api.menuArticleDetails.setAllergensEnabled, { menuServiceId, enabled: false });
      await owner.mutation(api.menuRoomService.updateSettings, {
        menuServiceId,
        expected: { markupPercent: 15, markupScope: "selected", deliveryFeeRsd: 200 },
        patch: { markupPercent: 20, markupScope: "all", deliveryFeeRsd: null },
      });
      await owner.mutation(api.menuRoomService.renameCategory, {
        categoryId: category.categoryId,
        name: "Jelo",
        expectedName: "Hrana",
      });
      await owner.mutation(api.menuPages.rename, {
        pageId: w.a.defaultPageId,
        name: "Glavni meni",
        expectedName: currentPage.name,
      });
      expect(await rawDraft(t, menuServiceId)).not.toEqual(raw1);

      // --- restore the live version: the draft is version 1 again ------------------
      const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);
      expect(restored).toMatchObject({ ok: true, state: "clean", keptPages: [], droppedImages: 0 });
      expect(restored.changes).toBeGreaterThan(0);

      expect(await rawDraft(t, menuServiceId)).toEqual(raw1);
      const summary = await draftSummary(t, menuServiceId);
      expect(summary).toEqual(summary1);
      expect(counterProblems(summary)).toEqual([]);
      const status = await statusOf(t, w.ownerId, menuServiceId);
      expect(status).toMatchObject({ state: "clean", hasUnpublishedChanges: false });
      const publish = await as(t, w.ownerId).mutation(api.menuPublishing.publish, {
        menuServiceId,
        expectedRevision: status.revision,
      });
      expect(publish).toMatchObject({ ok: false, reason: "no_changes" });
    },
  );
});

describe("menuVersions — images that no longer exist", () => {
  async function insertMedia(t: T, businessId: Id<"businesses">) {
    return await t.run(async (ctx) => {
      const variant = { ref: "fake-ref", width: 100, height: 100, bytes: 1000 };
      return await ctx.db.insert("mediaAssets", {
        businessId,
        kind: "image",
        provider: "convex",
        variants: { avif: variant, webp: variant, thumb: variant },
        status: "ready",
        createdAt: Date.now(),
      });
    });
  }

  test("a purged or foreign image is dropped by the restore (icon or nothing instead) and reported", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w); // Pljeskavica: image that will be purged
    const cevapi = await addArticle(t, w.ownerId, menu.sectionId, "Ćevapi", 600); // image stays
    const raznjici = await addArticle(t, w.ownerId, menu.sectionId, "Ražnjići", 700); // foreign image, has an icon
    const purged = await insertMedia(t, w.a.businessId);
    const healthy = await insertMedia(t, w.a.businessId);
    const foreign = await insertMedia(t, w.b.businessId);
    await t.run(async (ctx) => {
      await ctx.db.patch(menu.articleId, { mediaMode: "image", imageMediaId: purged });
      await ctx.db.patch(cevapi.articleId, { mediaMode: "image", imageMediaId: healthy });
      await ctx.db.patch(raznjici.articleId, {
        mediaMode: "image",
        imageMediaId: foreign,
        iconKey: "grill",
      });
    });
    await publishNow(t, w.ownerId, menuServiceId);
    await t.run(async (ctx) => {
      await ctx.db.patch(purged, { status: "purged" });
    });

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored).toMatchObject({ ok: true, droppedImages: 2, state: "dirty", keptPages: [] });
    expect(restored.changes).toBeGreaterThan(0);
    const rows = await t.run(async (ctx) => ({
      menu: await ctx.db.get(menu.articleId),
      cevapi: await ctx.db.get(cevapi.articleId),
      raznjici: await ctx.db.get(raznjici.articleId),
    }));
    expect(rows.menu).toMatchObject({ mediaMode: "none" });
    expect(rows.menu?.imageMediaId).toBeUndefined();
    expect(rows.cevapi).toMatchObject({ mediaMode: "image", imageMediaId: healthy });
    expect(rows.raznjici).toMatchObject({ mediaMode: "icon", iconKey: "grill" });
    expect(rows.raznjici?.imageMediaId).toBeUndefined();
    const audits = await auditRows(t, menuServiceId, "version.restored");
    expect(audits[0].details).toMatchObject({ number: 1, droppedImages: 2 });
    // The draft now differs from the live version (the images are gone).
    expect((await statusOf(t, w.ownerId, menuServiceId)).state).toBe("dirty");
  });
});

// -----------------------------------------------------------------------------
// Restore and QR-linked pages
// -----------------------------------------------------------------------------

/**
 * Version 1 (Pljeskavica 450 on the default page), then: a page "Doručak" with a
 * section, a NEW article "Omlet" and a second placement of Pljeskavica, plus a
 * price edit (520) that the restore must undo.
 */
async function qrScenario(t: T, w: MenuWorldSeed) {
  const owner = as(t, w.ownerId);
  const menu = await simpleMenu(t, w);
  await publishNow(t, w.ownerId, w.a.menuServiceId);
  const summaryV1 = await draftSummary(t, w.a.menuServiceId);
  const page = await owner.mutation(api.menuPages.add, {
    menuServiceId: w.a.menuServiceId,
    name: "Doručak",
  });
  const section = await addSection(t, w.ownerId, page.pageId, "Jutarnji meni");
  const omlet = await addArticle(t, w.ownerId, section.sectionId, "Omlet", 300);
  await owner.mutation(api.menuCatalog.addPlacement, {
    sectionId: section.sectionId,
    articleId: menu.articleId,
  });
  await setPrice(t, w.ownerId, menu.articleId, 450, 520);
  return { menu, page, section, omlet, summaryV1 };
}

async function linkQr(
  t: T,
  w: MenuWorldSeed,
  pageKey: string,
  link: { linkActive?: boolean; cardStatus?: "active" | "disabled"; targetKind?: "menu" | "url" } = {},
) {
  await t.run(async (ctx) => {
    await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey,
      createdByUserId: w.ownerId,
      ...link,
    });
  });
}

describe("menuVersions — a page with an active QR link survives a restore", () => {
  test("keeps the page, its section, placements and its new article, and reports it", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const s = await qrScenario(t, w);
    await linkQr(t, w, s.page.key);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored).toMatchObject({
      ok: true,
      versionNumber: 1,
      state: "dirty", // the kept page is not in the live version
      keptPages: [{ key: s.page.key, name: "Doručak", reason: "qr_missing_in_version" }],
      renamedSlugs: [],
    });
    expect(restored.keptPages).toHaveLength(1);
    expect(restored.changes).toBeGreaterThan(0);

    const after = await draftSummary(t, menuServiceId);
    const kept = after.pages.find((row) => row.key === s.page.key);
    expect(kept).toMatchObject({
      name: "Doručak",
      slug: s.page.slug,
      archived: false,
      isDefault: false,
      placementCount: 2,
    });
    expect(after.sections.find((row) => row.key === s.section.key)).toMatchObject({
      page: s.page.key,
      name: "Jutarnji meni",
    });
    expect(after.articles.map((row) => row.key).sort()).toEqual([s.menu.key, s.omlet.key].sort());
    expect(after.articles.find((row) => row.key === s.omlet.key)).toMatchObject({
      name: "Omlet",
      basePriceRsd: 300,
    });
    expect(
      after.placements
        .filter((row) => row.page === s.page.key)
        .map((row) => row.article)
        .sort(),
    ).toEqual([s.menu.key, s.omlet.key].sort());
    expect(after.articleCount).toBe(2);
    expect(counterProblems(after)).toEqual([]);
    // Everything else is version 1 again (the price edit was undone).
    expect(after.articles.find((row) => row.key === s.menu.key)?.basePriceRsd).toBe(450);
    expect(after.pages.find((row) => row.isDefault)).toEqual(s.summaryV1.pages[0]);

    // Recorded for the audit.
    const audits = await auditRows(t, menuServiceId, "version.restored");
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toMatchObject({ number: 1, keptPages: 1 });

    // Guests still see version 1 only…
    expect(await publicMenu(t)).toMatchObject({ versionNumber: 1 });
    const live = await t.query(api.menuPublic.page, { slug: SLUG_A });
    expect(live?.kind).toBe("page");

    // …and the next publication carries the kept page.
    await publishNow(t, w.ownerId, menuServiceId);
    const splitter = await t.query(api.menuPublic.page, { slug: SLUG_A });
    expect(splitter?.kind).toBe("splitter");
    if (splitter?.kind !== "splitter") throw new Error("expected the splitter");
    expect(splitter.pages.map((row) => row.slug)).toEqual([DEFAULT_PAGE_SLUG, s.page.slug]);
    const breakfast = await t.query(api.menuPublic.page, { slug: SLUG_A, pageSlug: s.page.slug });
    if (breakfast?.kind !== "page") throw new Error("expected the page");
    expect(breakfast.sections.flatMap((row) => row.articles.map((article) => article.name)).sort()).toEqual(
      ["Omlet", "Pljeskavica"].sort(),
    );
  });

  test("without a QR link the same page is removed by the restore, with its section, placements and article", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const s = await qrScenario(t, w);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored).toMatchObject({ ok: true, state: "clean", keptPages: [], renamedSlugs: [] });
    const after = await draftSummary(t, menuServiceId);
    expect(after).toEqual(s.summaryV1);
    expect(after.pages.some((row) => row.key === s.page.key)).toBe(false);
    expect(after.sections.some((row) => row.key === s.section.key)).toBe(false);
    expect(after.articles.some((row) => row.key === s.omlet.key)).toBe(false);
    expect(counterProblems(after)).toEqual([]);
    expect((await statusOf(t, w.ownerId, menuServiceId)).state).toBe("clean");
  });

  test.each([
    { name: "an inactive link", link: { linkActive: false } },
    { name: "a disabled card", link: { cardStatus: "disabled" as const } },
    { name: "a card retargeted to a URL", link: { targetKind: "url" as const } },
  ])("$name does not keep the page", async ({ link }) => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const s = await qrScenario(t, w);
    await linkQr(t, w, s.page.key, link);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored).toMatchObject({ ok: true, keptPages: [] });
    expect(await draftSummary(t, menuServiceId)).toEqual(s.summaryV1);
  });

  test("a page archived in the version but live in the draft with an active QR link stays unarchived and is reported", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    await simpleMenu(t, w);
    const old = await owner.mutation(api.menuPages.add, { menuServiceId, name: "Stari meni" });
    expect(await owner.mutation(api.menuPages.archive, { pageId: old.pageId })).toEqual({ changed: true });
    await publishNow(t, w.ownerId, menuServiceId); // version 1 has the page archived
    expect(await owner.mutation(api.menuPages.restore, { pageId: old.pageId })).toEqual({ changed: true });
    await linkQr(t, w, old.key);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored).toMatchObject({
      ok: true,
      state: "dirty",
      keptPages: [{ key: old.key, name: "Stari meni", reason: "qr_archived_in_version" }],
    });
    const after = await draftSummary(t, menuServiceId);
    expect(after.pages.find((row) => row.key === old.key)?.archived).toBe(false);
  });

  test("a kept page that had become the default hands the flag back: exactly one default page remains", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    await simpleMenu(t, w);
    const defaultKey = (await draftSummary(t, menuServiceId)).pages[0].key;
    await publishNow(t, w.ownerId, menuServiceId);
    const second = await owner.mutation(api.menuPages.add, { menuServiceId, name: "Doručak" });
    // Archiving the default page hands the default flag to the next page.
    expect(await owner.mutation(api.menuPages.archive, { pageId: w.a.defaultPageId })).toEqual({
      changed: true,
    });
    const middle = await draftSummary(t, menuServiceId);
    expect(middle.pages.filter((row) => row.isDefault).map((row) => row.key)).toEqual([second.key]);
    await linkQr(t, w, second.key);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored.keptPages).toEqual([
      { key: second.key, name: "Doručak", reason: "qr_missing_in_version" },
    ]);
    const after = await draftSummary(t, menuServiceId);
    expect(after.pages.filter((row) => row.isDefault).map((row) => row.key)).toEqual([defaultKey]);
    expect(after.pages.find((row) => row.key === defaultKey)?.archived).toBe(false);
    expect(after.pages.find((row) => row.key === second.key)).toMatchObject({
      isDefault: false,
      archived: false,
    });
  });

  test("a kept page whose slug the restored version uses for another page gets a free slug", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    await simpleMenu(t, w);
    const original = await owner.mutation(api.menuPages.add, { menuServiceId, name: "Doručak" });
    await publishNow(t, w.ownerId, menuServiceId); // version 1 has the page "Doručak"
    await owner.mutation(api.menuPages.remove, { pageId: original.pageId });
    const replacement = await owner.mutation(api.menuPages.add, { menuServiceId, name: "Doručak" });
    expect(replacement.slug).toBe(original.slug); // the slug was free again
    expect(replacement.key).not.toBe(original.key);
    await linkQr(t, w, replacement.key);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    expect(restored.keptPages).toEqual([
      { key: replacement.key, name: "Doručak", reason: "qr_missing_in_version" },
    ]);
    expect(restored.renamedSlugs).toHaveLength(1);
    expect(restored.renamedSlugs[0]).toMatchObject({ pageKey: replacement.key, from: original.slug });
    const after = await draftSummary(t, menuServiceId);
    // The version's page is back with its own key and slug; the kept page moved aside.
    expect(after.pages.find((row) => row.key === original.key)?.slug).toBe(original.slug);
    expect(after.pages.find((row) => row.key === replacement.key)?.slug).toBe(
      restored.renamedSlugs[0].to,
    );
    expect(restored.renamedSlugs[0].to).not.toBe(original.slug);
    expect(new Set(after.pages.map((row) => row.slug)).size).toBe(after.pages.length);
  });
});

// -----------------------------------------------------------------------------
// Roles and tenants
// -----------------------------------------------------------------------------

describe("menuVersions — roles", () => {
  test("owner, manager, editor and admin may list and restore; every restore is audited with its actor kind", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);

    const allowed = [
      { label: "owner", userId: w.ownerId, actorKind: "user" },
      { label: "manager", userId: w.managerId, actorKind: "user" },
      { label: "editor", userId: w.editorId, actorKind: "user" },
      { label: "admin", userId: w.adminId, actorKind: "admin" },
    ] as const;
    for (const { label, userId } of allowed) {
      await setPrice(t, w.ownerId, menu.articleId, 450, 460);

      const listed = await as(t, userId).query(api.menuPublishing.listVersions, { menuServiceId });
      expect(listed?.versions.map((version) => version.number), label).toEqual([1]);

      const result = await restoreOk(t, userId, menuServiceId, 1);
      expect(result, label).toMatchObject({ ok: true, state: "clean" });
      expect(result.changes, label).toBeGreaterThan(0);
      expect(await draftPrice(t, menu.articleId), label).toBe(450);
    }

    const audits = await auditRows(t, menuServiceId, "version.restored");
    expect(audits.map((row) => row.actorKind)).toEqual(allowed.map((row) => row.actorKind));
    expect(audits.map((row) => row.actorUserId)).toEqual(allowed.map((row) => row.userId));
  });

  test("finance, view-only and outsiders get not_found for a restore and null for the list, and nothing changes", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    const status = await statusOf(t, w.ownerId, menuServiceId);
    const summary = await draftSummary(t, menuServiceId);

    const refused = [
      { label: "finance", userId: w.financeId },
      { label: "viewOnly", userId: w.viewOnlyId },
      { label: "outsider", userId: w.outsiderId },
    ];
    for (const { label, userId } of refused) {
      expect(
        await codeOf(restoreAt(t, userId, menuServiceId, 1, status.revision)),
        label,
      ).toBe(MENU_ERROR.notFound);
      expect(
        await as(t, userId).query(api.menuPublishing.listVersions, { menuServiceId }),
        label,
      ).toBeNull();
    }

    expect(await statusOf(t, w.ownerId, menuServiceId)).toEqual(status);
    expect(await draftSummary(t, menuServiceId)).toEqual(summary);
    expect(await draftPrice(t, menu.articleId)).toBe(520);
    expect(await auditRows(t, menuServiceId, "version.restored")).toEqual([]);
  });

  test("anonymous callers are refused", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    const status = await statusOf(t, w.ownerId, menuServiceId);

    expect(
      await codeOf(
        t.mutation(api.menuPublishing.restoreVersion, {
          menuServiceId,
          versionNumber: 1,
          expectedRevision: status.revision,
        }),
      ),
    ).toBe(MENU_ERROR.unauthenticated);
    expect(await t.query(api.menuPublishing.listVersions, { menuServiceId })).toBeNull();
  });

  test("client editing switched off blocks a restore for the owner but not for admin, and listing still works", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const status = await statusOf(t, w.ownerId, menuServiceId);

    expect(await codeOf(restoreAt(t, w.ownerId, menuServiceId, 1, status.revision))).toBe(
      MENU_ERROR.editingDisabled,
    );
    expect(await draftPrice(t, menu.articleId)).toBe(520);
    expect(await listedNumbers(t, w.ownerId, menuServiceId)).toEqual([1]);

    const asAdmin = await restoreAt(t, w.adminId, menuServiceId, 1, status.revision);
    expect(asAdmin).toMatchObject({ ok: true, state: "clean" });
    expect(await draftPrice(t, menu.articleId)).toBe(450);
  });
});

describe("menuVersions — tenant isolation", () => {
  test("another account's owner can neither list nor restore, and restoring one venue never changes the other", async () => {
    const { t, w } = await setup();
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;

    // Tenant A: versions 1 and 2, then an unpublished edit.
    const menuA = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, a);
    await setPrice(t, w.ownerId, menuA.articleId, 450, 520);
    await publishNow(t, w.ownerId, a);
    await setPrice(t, w.ownerId, menuA.articleId, 520, 600);

    // Tenant B: its own menu, version 1 and an unpublished edit.
    const sectionB = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pića");
    const articleB = await addArticle(t, w.otherOwnerId, sectionB.sectionId, "Sok", 150);
    await publishNow(t, w.otherOwnerId, b);
    await setPrice(t, w.otherOwnerId, articleB.articleId, 150, 170);

    const statusA = await statusOf(t, w.ownerId, a);
    const statusB = await statusOf(t, w.otherOwnerId, b);
    const summaryA = await draftSummary(t, a);
    const summaryB = await draftSummary(t, b);
    const versionsB = await versionRows(t, b);
    const publicB = await publicMenu(t, SLUG_B);

    // Each sees only its own versions…
    const listA = await as(t, w.ownerId).query(api.menuPublishing.listVersions, { menuServiceId: a });
    const listB = await as(t, w.otherOwnerId).query(api.menuPublishing.listVersions, { menuServiceId: b });
    expect(listA?.versions.map((version) => version.number)).toEqual([2, 1]);
    expect(listB?.versions.map((version) => version.number)).toEqual([1]);
    expect(new Set([...(listA?.versions ?? []), ...(listB?.versions ?? [])].map((row) => row.versionId)).size).toBe(3);

    // …and is refused on the other tenant.
    expect(await as(t, w.otherOwnerId).query(api.menuPublishing.listVersions, { menuServiceId: a })).toBeNull();
    expect(await as(t, w.ownerId).query(api.menuPublishing.listVersions, { menuServiceId: b })).toBeNull();
    expect(await codeOf(restoreAt(t, w.otherOwnerId, a, 1, statusA.revision))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(restoreAt(t, w.ownerId, b, 1, statusB.revision))).toBe(MENU_ERROR.notFound);
    // A version number that exists only in A is not found in B.
    expect(await codeOf(restoreAt(t, w.otherOwnerId, b, 2, statusB.revision))).toBe(MENU_ERROR.notFound);
    expect(await statusOf(t, w.ownerId, a)).toEqual(statusA);
    expect(await draftSummary(t, a)).toEqual(summaryA);

    // A real restore in A leaves B completely alone.
    const restored = await restoreOk(t, w.ownerId, a, 1);
    expect(restored).toMatchObject({ ok: true, state: "dirty" });
    expect(await draftPrice(t, menuA.articleId)).toBe(450);
    expect(await statusOf(t, w.otherOwnerId, b)).toEqual(statusB);
    expect(await draftSummary(t, b)).toEqual(summaryB);
    expect(await versionRows(t, b)).toEqual(versionsB);
    expect(await publicMenu(t, SLUG_B)).toEqual(publicB);
    expect(await draftPrice(t, articleB.articleId)).toBe(170);
    expect(await auditRows(t, b, "version.restored")).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Audit
// -----------------------------------------------------------------------------

describe("menuVersions — audit", () => {
  test("a restore writes a version.restored row with actor, version number and counts", async () => {
    const { t, w } = await setup();
    const menuServiceId = w.a.menuServiceId;
    const menu = await simpleMenu(t, w);
    await publishNow(t, w.ownerId, menuServiceId);
    await setPrice(t, w.ownerId, menu.articleId, 450, 520);
    await addArticle(t, w.ownerId, menu.sectionId, "Gurmanska", 900);
    expect(await auditRows(t, menuServiceId, "version.restored")).toEqual([]);

    const restored = await restoreOk(t, w.ownerId, menuServiceId, 1);

    const rows = await auditRows(t, menuServiceId, "version.restored");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      menuServiceId,
      actorKind: "user",
      actorUserId: w.ownerId,
      action: "version.restored",
      entityType: "menuVersions",
      entityKey: "1",
      details: { number: 1, changes: restored.changes, keptPages: 0, droppedImages: 0 },
    });
    expect(rows[0].createdAt).toBeGreaterThan(0);
  });
});
