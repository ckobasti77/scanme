/// <reference types="vite/client" />

// ScanMe Menu V1 — K06: the legacy menu -> new model migration
// (convex/menuMigration.ts; plan and report in lib/menu/legacy-mapping.ts).
// Covered: the exact result of a migration from the inline draft; a second run
// that changes nothing; batches across the page boundary (cursor, one touchDraft
// per batch, interrupt and resume); the report (planned / not mapped / ordering
// list / post-migration differences) that writes nothing; the legacy tables
// never touched; the live generation as a source (two coexisting generations,
// derived keys, the live "nema vise" winning over the draft); source_changed
// and the ceilings; purge (rollback) with its keep rules and batches; cutover
// and its revert; internal-only exports; errors; tenant isolation.
// Fictional data only ("Kafana kod Mike", "Demo restoran").

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as migrationModule from "./menuMigration";
import schema from "./schema";
import { legacyKey } from "../lib/menu/legacy-mapping";
import { MENU_MAX_ARTICLE_BATCH } from "../lib/menu/limits";
import { newMenuKey } from "../lib/menu/keys";
import type { MenuModel } from "../lib/menu-blocks";
import {
  legacyBigModel,
  legacyDraftModel,
  legacySnapshot,
  seedLegacyMenu,
} from "../lib/menu/testkit/legacy";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

// Fake timers in every test: a batch schedules its continuation with
// runAfter(0), and a test decides when (if ever) the scheduler runs
// (finishAllScheduledFunctions) — an interrupted run is just "not run yet".
beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const CODE_PATTERN = /\b(?:menu|migration)\/[a-z_]+/;

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
// Legacy menus
// -----------------------------------------------------------------------------

/** A legacy menu with an inline draft and (by default) the same model published as generation 1. */
async function seedDraftMenu(
  t: T,
  tenant: MenuTenantSeed,
  model: MenuModel = legacyDraftModel(),
  published = true,
): Promise<Id<"menus">> {
  const { menuId } = await t.run(
    async (ctx) =>
      await seedLegacyMenu(ctx, {
        businessId: tenant.businessId,
        serviceProfileId: tenant.serviceProfileId,
        draft: model,
        generations: published ? [model] : [],
      }),
  );
  return menuId;
}

// -----------------------------------------------------------------------------
// Running the migration
// -----------------------------------------------------------------------------

type BatchArgs = { cursor?: number; batchSize?: number };

async function runBatchRaw(t: T, menuServiceId: Id<"menuServices">, args: BatchArgs = {}) {
  return await t.mutation(internal.menuMigration.migrateLegacyMenuBatch, { menuServiceId, ...args });
}

/** One batch that must not be blocked (its scheduled continuation is NOT run). */
async function runBatch(t: T, menuServiceId: Id<"menuServices">, args: BatchArgs = {}) {
  const result = await runBatchRaw(t, menuServiceId, args);
  if (!result.ok) throw new Error(`migration blocked: ${result.blockers.join(",")}`);
  return result;
}

/** The first batch plus every scheduled continuation. Returns the first batch's result. */
async function migrate(t: T, menuServiceId: Id<"menuServices">, args: BatchArgs = {}) {
  const first = await runBatch(t, menuServiceId, args);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return first;
}

async function planOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.query(internal.menuMigration.planLegacyMigration, { menuServiceId });
}

async function purgeRaw(t: T, menuServiceId: Id<"menuServices">) {
  return await t.mutation(internal.menuMigration.purgeMigratedService, { menuServiceId });
}

/** A purge that must be allowed, plus every scheduled continuation. Returns the first call's result. */
async function purge(t: T, menuServiceId: Id<"menuServices">) {
  const first = await purgeRaw(t, menuServiceId);
  if (!first.ok) throw new Error(`purge blocked: ${first.blockers.join(",")}`);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return first;
}

/** The real flow of Objavi: preview, then publish exactly that revision and warning set. */
async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const me = as(t, userId);
  const preview = await me.query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!preview) throw new Error("publishPreview was refused");
  const result = await me.mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${JSON.stringify(result)}`);
  return result;
}

// -----------------------------------------------------------------------------
// Reading the new model
// -----------------------------------------------------------------------------

/** Every row of the service in the tables a migration may touch. */
async function snapshotOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => ({
    service: await ctx.db.get(menuServiceId),
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
    availability: await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    draftState: await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    audit: await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}
type ServiceSnapshot = Awaited<ReturnType<typeof snapshotOf>>;

function articleNamed(snap: ServiceSnapshot, name: string) {
  const article = snap.articles.find((row) => row.name === name);
  if (!article) throw new Error(`article ${name} is missing`);
  return article;
}

function sectionNamed(snap: ServiceSnapshot, name: string) {
  const section = snap.sections.find((row) => row.name === name);
  if (!section) throw new Error(`section ${name} is missing`);
  return section;
}

function draftStateOf(snap: ServiceSnapshot) {
  if (snap.draftState.length !== 1) throw new Error("expected exactly one menuDraftState");
  return snap.draftState[0];
}

function defaultPageOf(snap: ServiceSnapshot) {
  const page = snap.pages.find((row) => row.isDefault);
  if (!page) throw new Error("default page is missing");
  return page;
}

function auditOf(snap: ServiceSnapshot, action: string) {
  return snap.audit.filter((row) => row.action === action);
}

/** Sections in page order, each with its articles in placement order. */
function layoutOf(snap: ServiceSnapshot) {
  const articleName = new Map(snap.articles.map((article) => [article._id, article.name]));
  return [...snap.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const placements = snap.placements
        .filter((placement) => placement.sectionId === section._id)
        .sort((left, right) => left.order - right.order);
      return {
        section: section.name,
        articles: placements.map((placement) => articleName.get(placement.articleId) ?? "?"),
        orders: placements.map((placement) => placement.order),
      };
    });
}

function expectStrictlyAscending(values: number[]) {
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]).toBeGreaterThan(values[index - 1]);
  }
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

// =============================================================================
// A. The result of a migration from the inline draft
// =============================================================================

describe("A. result (source = draft)", () => {
  test("writes sections, articles, placements, variants, availability, counters, state and one audit row", async () => {
    const { t, w } = await setup();
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["slika"])));
    const menuId = await seedDraftMenu(t, w.a, legacyDraftModel({ photoStorageId: photo }));
    const before = await snapshotOf(t, w.a.menuServiceId);

    const first = await migrate(t, w.a.menuServiceId);
    expect(first).toMatchObject({ ok: true, done: true, alreadyMigrated: false, status: "migrated", total: 8 });

    const snap = await snapshotOf(t, w.a.menuServiceId);

    // Sections of the default page: names and order of the legacy groups.
    expect(snap.sections).toHaveLength(3);
    expect(snap.sections.every((section) => section.pageId === w.a.defaultPageId)).toBe(true);
    expect(layoutOf(snap).map((entry) => entry.section)).toEqual(["Topli napici", "Roštilj", "Pića"]);
    expect(sectionNamed(snap, "Topli napici").legacyRef).toBe("draft:grp-topli");
    expect(snap.sections.every((section) => section.legacyRef !== undefined)).toBe(true);

    // Articles and placements: every item once, in the source order of its group.
    expect(snap.articles).toHaveLength(8);
    expect(snap.placements).toHaveLength(8);
    expect(layoutOf(snap).map((entry) => entry.articles)).toEqual([
      ["Espreso", "Domaća kafa", "Kapućino"],
      ["Pljeskavica", "Ćevapi 10 kom", "Pileći file"],
      ["Kisela voda 0,33 l", "Domaća limunada"],
    ]);
    for (const entry of layoutOf(snap)) expectStrictlyAscending(entry.orders);
    expect(snap.placements.every((placement) => placement.pageId === w.a.defaultPageId)).toBe(true);

    // Legacy references on every migrated row.
    expect(snap.articles.every((article) => article.legacyRef?.startsWith("draft:itm-"))).toBe(true);
    expect(articleNamed(snap, "Espreso").legacyRef).toBe("draft:itm-espreso");
    expect(articleNamed(snap, "Espreso").kind).toBe("item");

    // Prices, variants.
    expect(articleNamed(snap, "Espreso").basePriceRsd).toBe(150);
    expect(articleNamed(snap, "Pljeskavica").basePriceRsd).toBe(650);
    const cappuccino = articleNamed(snap, "Kapućino");
    expect(cappuccino.variantsEnabled).toBe(true);
    expect(cappuccino.basePriceRsd).toBeUndefined();
    const cappuccinoVariants = snap.variants
      .filter((variant) => variant.articleId === cappuccino._id)
      .sort((left, right) => left.order - right.order);
    expect(cappuccinoVariants.map((variant) => [variant.name, variant.priceRsd])).toEqual([
      ["mala", 180],
      ["velika", 220],
    ]);
    expect(snap.variants).toHaveLength(2);
    expect(articleNamed(snap, "Espreso").variantsEnabled).toBeUndefined();

    // Text (whitespace is collapsed, like the editor does) and media.
    expect(articleNamed(snap, "Pljeskavica").description).toBe("Sa lukom i kajmakom");
    expect(articleNamed(snap, "Pljeskavica").legacyPhotoStorageId).toBe(photo);
    expect(articleNamed(snap, "Espreso").legacyPhotoStorageId).toBeUndefined();
    expect(snap.articles.every((article) => article.mediaMode === "icon")).toBe(true);

    // The one unavailable item: a live availability row set by the migration.
    expect(snap.availability).toHaveLength(1);
    expect(snap.availability[0]).toMatchObject({
      articleKey: articleNamed(snap, "Ćevapi 10 kom").key,
      setByRef: "legacy-migration",
    });

    // Counters and draft bookkeeping.
    const state = draftStateOf(snap);
    expect(state.articleCount).toBe(8);
    expect(state.revision).toBeGreaterThan(draftStateOf(before).revision);
    expect(state.lastEditByUserId).toBeUndefined();
    expect(defaultPageOf(snap).placementCount).toBe(8);

    // Migration state on the service.
    expect(snap.service?.migration).toMatchObject({
      status: "migrated",
      sourceKind: "draft",
      sourceRevision: 1,
      legacyMenuId: menuId,
    });
    expect(snap.service?.migration?.migratedAt).toBeTypeOf("number");
    expect(snap.service?.legacyMenuId).toBe(menuId);

    // Exactly one audit row, by the system.
    const migrated = auditOf(snap, "legacy.migrated");
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      actorKind: "system",
      actorRef: "legacy-migration",
      entityType: "menus",
      entityKey: menuId,
      details: { source: "draft", sections: 3, articles: 8, variants: 2, unavailable: 1, images: 1 },
    });
  });
});

// =============================================================================
// B. Idempotence
// =============================================================================

describe("B. idempotence", () => {
  test("a second run reports alreadyMigrated and changes no row of the service", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await migrate(t, w.a.menuServiceId);
    const before = await snapshotOf(t, w.a.menuServiceId);
    expect(before.articles).toHaveLength(8);

    const second = await runBatch(t, w.a.menuServiceId);
    expect(second).toMatchObject({
      ok: true,
      done: true,
      alreadyMigrated: true,
      status: "migrated",
      written: { sections: 0, articles: 0, placements: 0, variants: 0, availability: 0, skippedExisting: 0 },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await snapshotOf(t, w.a.menuServiceId);
    expect(after).toEqual(before);
    expect(auditOf(after, "legacy.migrated")).toHaveLength(1);
  });
});

// =============================================================================
// C. Batches across the page boundary
// =============================================================================

describe("C. batches", () => {
  test("21 items in batches of 5: cursor, no duplicates, source order, one touchDraft per batch", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a, legacyBigModel(3, 7));
    const before = await snapshotOf(t, w.a.menuServiceId);

    const first = await runBatch(t, w.a.menuServiceId, { batchSize: 5 });
    expect(first).toMatchObject({ done: false, cursor: 5, status: "running", total: 21 });
    expect(first.written.articles).toBe(5);
    expect(first.written.sections).toBe(3);
    const running = await snapshotOf(t, w.a.menuServiceId);
    expect(running.service?.migration?.status).toBe("running");
    expect(running.articles).toHaveLength(5);
    expect(auditOf(running, "legacy.migrated")).toHaveLength(0);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snap = await snapshotOf(t, w.a.menuServiceId);

    expect(snap.articles).toHaveLength(21);
    expect(snap.placements).toHaveLength(21);
    expect(new Set(snap.articles.map((article) => article.key)).size).toBe(21);
    expect(new Set(snap.sections.map((section) => section.key)).size).toBe(3);
    expect(layoutOf(snap)).toEqual(
      range(3).map((group) => ({
        section: `Grupa ${group + 1}`,
        articles: range(7).map((item) => `Artikal ${group + 1}.${item + 1}`),
        orders: range(7).map((item) => (item + 1) * 1024),
      })),
    );
    expect(snap.service?.migration?.status).toBe("migrated");
    expect(auditOf(snap, "legacy.migrated")).toHaveLength(1);
    expect(defaultPageOf(snap).placementCount).toBe(21);
    expect(draftStateOf(snap).articleCount).toBe(21);
    // 21 items / 5 per batch = 5 batches, each calls touchDraft exactly once.
    expect(draftStateOf(snap).revision - draftStateOf(before).revision).toBe(5);
  });

  test("an interrupted run is resumed from cursor 0: existing keys are skipped, nothing is duplicated", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a, legacyBigModel(3, 7));

    await runBatch(t, w.a.menuServiceId, { batchSize: 5 }); // its continuation is never run
    const interrupted = await snapshotOf(t, w.a.menuServiceId);
    expect(interrupted.articles).toHaveLength(5);

    const again = await runBatch(t, w.a.menuServiceId, { cursor: 0, batchSize: 5 });
    expect(again.written).toMatchObject({ sections: 0, articles: 0, placements: 0, skippedExisting: 5 });
    expect(again.done).toBe(false);
    const afterResume = await snapshotOf(t, w.a.menuServiceId);
    expect(afterResume.articles).toHaveLength(5);
    expect(afterResume.placements).toHaveLength(5);
    // Nothing was written, so the draft was not touched again.
    expect(draftStateOf(afterResume).revision).toBe(draftStateOf(interrupted).revision);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snap = await snapshotOf(t, w.a.menuServiceId);
    expect(snap.articles).toHaveLength(21);
    expect(snap.placements).toHaveLength(21);
    expect(new Set(snap.articles.map((article) => article.key)).size).toBe(21);
    expect(snap.sections).toHaveLength(3);
    expect(defaultPageOf(snap).placementCount).toBe(21);
    expect(draftStateOf(snap).articleCount).toBe(21);
    expect(snap.service?.migration?.status).toBe("migrated");
    expect(auditOf(snap, "legacy.migrated")).toHaveLength(1);
  });
});

// =============================================================================
// D. The report
// =============================================================================

describe("D. planLegacyMigration", () => {
  test("before the migration: what is planned, what is not mapped, the ordering list; nothing is written", async () => {
    const { t, w } = await setup();
    const menuId = await seedDraftMenu(t, w.a);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("orderingItems", {
        businessId: w.a.businessId,
        name: "Espreso",
        priceRsd: 150,
        available: true,
        order: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("orderingItems", {
        businessId: w.a.businessId,
        name: "Burek",
        priceRsd: 300,
        available: true,
        order: 2,
        createdAt: now,
        updatedAt: now,
      });
    });
    const before = await snapshotOf(t, w.a.menuServiceId);

    const plan = await planOf(t, w.a.menuServiceId);
    const after = await snapshotOf(t, w.a.menuServiceId);
    expect(after).toEqual(before);
    expect(after.articles).toHaveLength(0);
    expect(after.sections).toHaveLength(0);

    expect(plan.legacyMenuId).toBe(menuId);
    expect(plan.migration).toBeNull();
    expect(plan.report.source).toMatchObject({ kind: "draft", groups: 3, items: 8, variants: 2, photos: 0 });
    expect(plan.report.planned).toMatchObject({
      sections: 3,
      articles: 8,
      placements: 8,
      variants: 2,
      unavailable: 1,
      images: 0,
      skippedItems: 0,
    });
    expect(plan.report.unmapped).toMatchObject({
      dayparts: 1,
      pairings: 1,
      daypartBindings: 1,
      groupShapes: { galerija: 1 },
    });
    expect(plan.report.target).toMatchObject({
      existingSections: 0,
      pendingSections: 3,
      existingArticles: 0,
      pendingArticles: 8,
      otherArticles: 0,
    });
    expect(plan.report.blockers).toEqual([]);
    expect(plan.report.differenceCount).toBe(0);
    expect(plan.orderingItems).toEqual({
      total: 2,
      matched: 1,
      unmatched: 1,
      priceDiffers: 0,
      unmatchedNames: ["Burek"],
    });
  });

  test("after the migration: nothing pending, no differences; a manual price change is reported", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await migrate(t, w.a.menuServiceId);

    const clean = await planOf(t, w.a.menuServiceId);
    expect(clean.migration).toMatchObject({ status: "migrated", sourceKind: "draft" });
    expect(clean.report.target).toMatchObject({
      existingSections: 3,
      pendingSections: 0,
      existingArticles: 8,
      pendingArticles: 0,
    });
    expect(clean.report.differenceCount).toBe(0);
    expect(clean.report.differences).toEqual([]);
    expect(clean.report.blockers).toEqual([]);

    await t.run(async (ctx) => {
      const espreso = (
        await ctx.db
          .query("menuArticles")
          .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", w.a.menuServiceId))
          .collect()
      ).find((article) => article.name === "Espreso");
      if (!espreso) throw new Error("Espreso is missing");
      await ctx.db.patch(espreso._id, { basePriceRsd: 175 });
    });

    const changed = await planOf(t, w.a.menuServiceId);
    expect(changed.report.differenceCount).toBe(1);
    expect(changed.report.differences).toContainEqual(
      expect.objectContaining({ code: "price_differs", article: "Espreso", section: "Topli napici" }),
    );
    expect(changed.report.target.pendingArticles).toBe(0);
  });
});

// =============================================================================
// E. The legacy documents are never deleted or changed
// =============================================================================

describe("E. legacy tables", () => {
  test("every legacy row is identical after the migration, a second run and a purge", async () => {
    const { t, w } = await setup();
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["slika"])));
    const menuId = await seedDraftMenu(t, w.a, legacyDraftModel({ photoStorageId: photo }));
    const original = await t.run(async (ctx) => await legacySnapshot(ctx, menuId));
    expect(original.groups).toHaveLength(3);
    expect(original.items).toHaveLength(8);
    expect(original.variants).toHaveLength(2);
    expect(original.pairings).toHaveLength(1);
    expect(original.dayparts).toHaveLength(1);

    await migrate(t, w.a.menuServiceId);
    expect(await t.run(async (ctx) => await legacySnapshot(ctx, menuId))).toEqual(original);

    await runBatch(t, w.a.menuServiceId);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(async (ctx) => await legacySnapshot(ctx, menuId))).toEqual(original);

    const purged = await purge(t, w.a.menuServiceId);
    expect(purged.deleted).toBe(8);
    expect(await t.run(async (ctx) => await legacySnapshot(ctx, menuId))).toEqual(original);
    // The stored photo is still there: the legacy menu keeps serving it.
    expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", photo))).not.toBeNull();
  });
});

// =============================================================================
// F. Source = the live generation
// =============================================================================

describe("F. source = live generation", () => {
  test("only the live generation of two coexisting ones is migrated; keys match a draft migration", async () => {
    const { t, w } = await setup();
    const older = legacyBigModel(1, 2);
    const menuId = await t.run(async (ctx) => {
      const seeded = await seedLegacyMenu(ctx, {
        businessId: w.a.businessId,
        serviceProfileId: w.a.serviceProfileId,
        generations: [older, legacyDraftModel()],
      });
      return seeded.menuId;
    });
    // Two generations coexist; only the second is live.
    const generations = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("menuItems")
        .withIndex("by_menuId", (q) => q.eq("menuId", menuId))
        .collect();
      return [...new Set(rows.map((row) => row.publishGeneration))].sort();
    });
    expect(generations).toEqual([1, 2]);

    const plan = await planOf(t, w.a.menuServiceId);
    expect(plan.report.source).toMatchObject({ kind: "live", revision: 2, groups: 3, items: 8 });

    await migrate(t, w.a.menuServiceId);
    const snap = await snapshotOf(t, w.a.menuServiceId);

    expect(snap.articles).toHaveLength(8);
    expect(snap.articles.map((article) => article.name)).not.toContain("Artikal 1.1");
    expect(snap.articles.map((article) => article.name)).not.toContain("Artikal 1.2");
    expect(layoutOf(snap).map((entry) => entry.section)).toEqual(["Topli napici", "Roštilj", "Pića"]);
    expect(snap.service?.migration).toMatchObject({
      status: "migrated",
      sourceKind: "live",
      sourceRevision: 2,
      legacyMenuId: menuId,
    });
    expect(articleNamed(snap, "Espreso").legacyRef).toBe("live:itm-espreso");
    expect(auditOf(snap, "legacy.migrated")[0]?.details).toMatchObject({ source: "live", sourceRevision: 2 });

    // Live rows carry `key` = the inline draft id, so the article key is the
    // same as when the same model is migrated as a draft.
    const espresoKey = articleNamed(snap, "Espreso").key;
    expect(espresoKey).toBe(legacyKey("article", "itm-espreso"));
    const other = await setup();
    await seedDraftMenu(other.t, other.w.a);
    await migrate(other.t, other.w.a.menuServiceId);
    const draftSnap = await snapshotOf(other.t, other.w.a.menuServiceId);
    expect(articleNamed(draftSnap, "Espreso").key).toBe(espresoKey);
    // The variants of the live source come from itemVariants, with the same result.
    const cappuccinoVariants = snap.variants.filter(
      (variant) => variant.articleId === articleNamed(snap, "Kapućino")._id,
    );
    expect(cappuccinoVariants.map((variant) => variant.priceRsd).sort()).toEqual([180, 220]);
  });
});

// =============================================================================
// G. A live "nema vise" wins over the draft
// =============================================================================

describe("G. unavailable in the live version", () => {
  test("the draft says available, the live row says unavailable: availability is written and reported", async () => {
    const { t, w } = await setup();
    const menuId = await seedDraftMenu(t, w.a);
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("menuItems")
        .withIndex("by_menuId", (q) => q.eq("menuId", menuId))
        .collect();
      const live = rows.find((row) => row.key === "itm-espreso");
      if (!live) throw new Error("live Espreso row is missing");
      expect(live.available).toBe(true);
      await ctx.db.patch(live._id, { available: false });
    });

    const plan = await planOf(t, w.a.menuServiceId);
    expect(plan.report.warnings).toContainEqual(
      expect.objectContaining({ code: "unavailable_from_live", article: "Espreso" }),
    );
    expect(plan.report.warningCounts.unavailable_from_live).toBe(1);
    expect(plan.report.planned.unavailable).toBe(2);

    await migrate(t, w.a.menuServiceId);
    const snap = await snapshotOf(t, w.a.menuServiceId);
    const espreso = articleNamed(snap, "Espreso");
    expect(snap.availability.map((row) => row.articleKey).sort()).toEqual(
      [espreso.key, articleNamed(snap, "Ćevapi 10 kom").key].sort(),
    );
    expect(snap.availability.find((row) => row.articleKey === espreso.key)).toMatchObject({
      setByRef: "legacy-migration",
    });
  });
});

// =============================================================================
// H. source_changed
// =============================================================================

describe("H. source_changed", () => {
  test("a legacy edit after the first batch blocks the next batch and the report", async () => {
    const { t, w } = await setup();
    const menuId = await seedDraftMenu(t, w.a);

    const first = await runBatch(t, w.a.menuServiceId, { batchSize: 3 });
    expect(first).toMatchObject({ done: false, cursor: 3 });
    const snapBefore = await snapshotOf(t, w.a.menuServiceId);
    expect(snapBefore.articles).toHaveLength(3);

    await t.run(async (ctx) => {
      const menu = await ctx.db.get(menuId);
      if (!menu) throw new Error("legacy menu is missing");
      await ctx.db.patch(menuId, { draftRevision: (menu.draftRevision ?? 0) + 1 });
    });

    const next = await runBatchRaw(t, w.a.menuServiceId, { cursor: 3, batchSize: 3 });
    expect(next).toEqual({ ok: false, blockers: ["source_changed"] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await snapshotOf(t, w.a.menuServiceId)).toEqual(snapBefore);

    const plan = await planOf(t, w.a.menuServiceId);
    expect(plan.report.blockers[0]).toBe("source_changed");
    expect(plan.migration?.status).toBe("running");
  });
});

// =============================================================================
// I. Ceilings
// =============================================================================

describe("I. ceilings", () => {
  test("a migration that would pass MENU_MAX_ARTICLES writes nothing, not even the migration state", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .unique();
      if (!state) throw new Error("draft state is missing");
      await ctx.db.patch(state._id, { articleCount: 1995 });
    });
    const before = await snapshotOf(t, w.a.menuServiceId);

    const result = await runBatchRaw(t, w.a.menuServiceId);
    expect(result).toEqual({ ok: false, blockers: ["articles_limit"] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await snapshotOf(t, w.a.menuServiceId);
    expect(after).toEqual(before);
    expect(after.service?.migration).toBeUndefined();
    expect(after.articles).toHaveLength(0);
    expect(after.sections).toHaveLength(0);

    const plan = await planOf(t, w.a.menuServiceId);
    expect(plan.report.blockers).toEqual(["articles_limit"]);
  });

  test("exactly reaching the ceiling is allowed", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .unique();
      if (!state) throw new Error("draft state is missing");
      await ctx.db.patch(state._id, { articleCount: 1992 });
    });

    const result = await migrate(t, w.a.menuServiceId);
    expect(result.ok).toBe(true);
    const snap = await snapshotOf(t, w.a.menuServiceId);
    expect(snap.articles).toHaveLength(8);
    expect(draftStateOf(snap).articleCount).toBe(2000);
  });
});

// =============================================================================
// J. purgeMigratedService (rollback)
// =============================================================================

describe("J. purgeMigratedService", () => {
  test("removes what the migration wrote, clears its state, audits, and the menu can be migrated again", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await migrate(t, w.a.menuServiceId);
    expect((await snapshotOf(t, w.a.menuServiceId)).availability).toHaveLength(1);

    const result = await purge(t, w.a.menuServiceId);
    expect(result).toMatchObject({
      ok: true,
      done: true,
      deleted: 8,
      kept: 0,
      deletedSoFar: 8,
      keptSoFar: 0,
      sectionsDeleted: 3,
    });

    const snap = await snapshotOf(t, w.a.menuServiceId);
    expect(snap.articles).toHaveLength(0);
    expect(snap.placements).toHaveLength(0);
    expect(snap.variants).toHaveLength(0);
    expect(snap.availability).toHaveLength(0);
    expect(snap.sections).toHaveLength(0);
    expect(defaultPageOf(snap).placementCount).toBe(0);
    expect(draftStateOf(snap).articleCount).toBe(0);
    expect(draftStateOf(snap).lastEditByUserId).toBeUndefined();
    expect(snap.service?.migration).toBeUndefined();
    const purged = auditOf(snap, "legacy.purged");
    expect(purged).toHaveLength(1);
    expect(purged[0]).toMatchObject({
      actorKind: "system",
      actorRef: "legacy-migration",
      details: { articles: 8, kept: 0, sections: 3 },
    });
    // The report is back to "nothing migrated".
    const plan = await planOf(t, w.a.menuServiceId);
    expect(plan.migration).toBeNull();
    expect(plan.report.target.pendingArticles).toBe(8);

    // A new migration works again.
    const again = await migrate(t, w.a.menuServiceId);
    expect(again).toMatchObject({ done: true, alreadyMigrated: false });
    const migratedAgain = await snapshotOf(t, w.a.menuServiceId);
    expect(migratedAgain.articles).toHaveLength(8);
    expect(migratedAgain.sections).toHaveLength(3);
    expect(migratedAgain.service?.migration?.status).toBe("migrated");
    expect(draftStateOf(migratedAgain).articleCount).toBe(8);
    expect(auditOf(migratedAgain, "legacy.migrated")).toHaveLength(2);
  });

  test("keeps an article edited after the migration and one used by a combo; the section they sit in stays", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await migrate(t, w.a.menuServiceId);
    await t.run(async (ctx) => {
      const articles = await ctx.db
        .query("menuArticles")
        .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .collect();
      const espreso = articles.find((article) => article.name === "Espreso");
      const domaca = articles.find((article) => article.name === "Domaća kafa");
      if (!espreso || !domaca) throw new Error("migrated articles are missing");
      // Edited in the new editor after the migration: updatedAt moved.
      await ctx.db.patch(espreso._id, { updatedAt: espreso.createdAt + 1 });
      // Used by a combo made in the editor (a manual article without legacyRef).
      const now = Date.now();
      const comboId = await ctx.db.insert("menuArticles", {
        menuServiceId: w.a.menuServiceId,
        key: newMenuKey("article"),
        kind: "combo",
        name: "Doručak za dvoje",
        nameNormalized: "dorucak za dvoje",
        basePriceRsd: 500,
        mediaMode: "none",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("menuComboComponents", {
        menuServiceId: w.a.menuServiceId,
        comboArticleId: comboId,
        componentArticleId: domaca._id,
        quantity: 1,
        order: 1024,
        createdAt: now,
      });
    });

    const result = await purge(t, w.a.menuServiceId);
    expect(result).toMatchObject({
      ok: true,
      done: true,
      deleted: 6,
      kept: 2,
      deletedSoFar: 6,
      keptSoFar: 2,
      sectionsDeleted: 2,
    });

    const snap = await snapshotOf(t, w.a.menuServiceId);
    expect(snap.articles.map((article) => article.name).sort()).toEqual(
      ["Domaća kafa", "Doručak za dvoje", "Espreso"].sort(),
    );
    // Their section was not deleted (it still shows them); the other two are gone.
    expect(snap.sections.map((section) => section.name)).toEqual(["Topli napici"]);
    expect(layoutOf(snap)).toEqual([
      { section: "Topli napici", articles: ["Espreso", "Domaća kafa"], orders: [1024, 2048] },
    ]);
    expect(defaultPageOf(snap).placementCount).toBe(2);
    expect(snap.service?.migration).toBeUndefined();
    expect(auditOf(snap, "legacy.purged")[0]?.details).toMatchObject({ articles: 6, kept: 2, sections: 2 });

    // Migrating again keeps the kept rows as they are and writes the rest.
    const again = await migrate(t, w.a.menuServiceId);
    expect(again.written).toMatchObject({ articles: 6, skippedExisting: 2, sections: 2 });
    const migratedAgain = await snapshotOf(t, w.a.menuServiceId);
    expect(migratedAgain.articles).toHaveLength(9);
    expect(articleNamed(migratedAgain, "Espreso").updatedAt).toBe(articleNamed(migratedAgain, "Espreso").createdAt + 1);
  });

  test("keeps a manual section and a manual article (no legacyRef), also inside a migrated section", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    await migrate(t, w.a.menuServiceId);
    const owner = as(t, w.ownerId);
    const manualSection = await owner.mutation(api.menuCatalog.addSection, {
      pageId: w.a.defaultPageId,
      name: "Moja sekcija",
    });
    const manualArticle = await owner.mutation(api.menuCatalog.quickAddArticle, {
      sectionId: manualSection.sectionId,
      name: "Moj artikal",
      priceRsd: 100,
    });
    expect(manualArticle.status).toBe("created");
    const before = await snapshotOf(t, w.a.menuServiceId);
    const drinks = sectionNamed(before, "Pića");
    const inMigrated = await owner.mutation(api.menuCatalog.quickAddArticle, {
      sectionId: drinks._id,
      name: "Moj sok",
      priceRsd: 120,
    });
    expect(inMigrated.status).toBe("created");

    const result = await purge(t, w.a.menuServiceId);
    expect(result).toMatchObject({ ok: true, done: true, deleted: 8, kept: 0, sectionsDeleted: 2 });

    const snap = await snapshotOf(t, w.a.menuServiceId);
    expect(snap.articles.map((article) => article.name).sort()).toEqual(["Moj artikal", "Moj sok"]);
    expect(snap.articles.every((article) => article.legacyRef === undefined)).toBe(true);
    // The manual section stays; the migrated "Pića" stays because a manual article is shown in it.
    expect(layoutOf(snap).map((entry) => [entry.section, entry.articles])).toEqual([
      ["Pića", ["Moj sok"]],
      ["Moja sekcija", ["Moj artikal"]],
    ]);
    expect(sectionNamed(snap, "Moja sekcija").legacyRef).toBeUndefined();
    expect(defaultPageOf(snap).placementCount).toBe(2);
    expect(draftStateOf(snap).articleCount).toBe(2);
    expect(snap.service?.migration).toBeUndefined();
  });

  test("more than 200 articles: the purge continues by itself and leaves no migrated article", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a, legacyBigModel(3, 70), false);
    await migrate(t, w.a.menuServiceId);
    const migrated = await snapshotOf(t, w.a.menuServiceId);
    expect(migrated.articles).toHaveLength(210);
    expect(migrated.placements).toHaveLength(210);
    expect(draftStateOf(migrated).articleCount).toBe(210);

    const first = await purgeRaw(t, w.a.menuServiceId);
    if (!first.ok) throw new Error("purge was blocked");
    expect(first).toMatchObject({ done: false, deleted: MENU_MAX_ARTICLE_BATCH, kept: 0 });
    // Between the pages the migration state is still there (cleared only at the end).
    const midway = await snapshotOf(t, w.a.menuServiceId);
    expect(midway.articles).toHaveLength(10);
    expect(midway.service?.migration?.status).toBe("migrated");
    expect(auditOf(midway, "legacy.purged")).toHaveLength(0);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snap = await snapshotOf(t, w.a.menuServiceId);
    expect(snap.articles.filter((article) => article.legacyRef !== undefined)).toHaveLength(0);
    expect(snap.articles).toHaveLength(0);
    expect(snap.placements).toHaveLength(0);
    expect(snap.sections).toHaveLength(0);
    expect(defaultPageOf(snap).placementCount).toBe(0);
    expect(draftStateOf(snap).articleCount).toBe(0);
    expect(snap.service?.migration).toBeUndefined();
    const purged = auditOf(snap, "legacy.purged");
    expect(purged).toHaveLength(1);
    expect(purged[0]?.details).toMatchObject({ articles: 210, kept: 0, sections: 3 });
  });
});

// =============================================================================
// K. Cutover and its revert
// =============================================================================

describe("K. cutover", () => {
  test("needs a finished migration and a published version; blocks purge and re-run; revert restores", async () => {
    const { t, w } = await setup();
    const menuId = await seedDraftMenu(t, w.a);
    const id = w.a.menuServiceId;

    expect(await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: id })).toEqual({
      ok: false,
      blockers: ["not_migrated"],
    });

    await migrate(t, id);
    expect(await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: id })).toEqual({
      ok: false,
      blockers: ["not_published"],
    });
    expect((await snapshotOf(t, id)).service?.migration?.status).toBe("migrated");

    await publishNow(t, w.ownerId, id);
    const published = await snapshotOf(t, id);
    expect(published.service?.liveVersionId).toBeDefined();

    expect(await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: id })).toEqual({
      ok: true,
      changed: true,
    });
    const cutover = await snapshotOf(t, id);
    expect(cutover.service?.migration?.status).toBe("cutover");
    expect(cutover.service?.migration?.cutoverAt).toBeTypeOf("number");
    const cutoverAudit = auditOf(cutover, "legacy.cutover");
    expect(cutoverAudit).toHaveLength(1);
    expect(cutoverAudit[0]).toMatchObject({ actorKind: "system", entityKey: menuId });

    // Again: nothing changes.
    expect(await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: id })).toEqual({
      ok: true,
      changed: false,
    });
    expect(await snapshotOf(t, id)).toEqual(cutover);

    // Purge is refused, the migration does not run again.
    expect(await purgeRaw(t, id)).toEqual({ ok: false, blockers: ["cutover_active"] });
    const rerun = await runBatch(t, id);
    expect(rerun).toMatchObject({ done: true, alreadyMigrated: true, status: "cutover" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await snapshotOf(t, id)).toEqual(cutover);

    // Revert: back to migrated, cutoverAt gone, audited.
    expect(await t.mutation(internal.menuMigration.revertLegacyCutover, { menuServiceId: id })).toEqual({
      ok: true,
      changed: true,
    });
    const reverted = await snapshotOf(t, id);
    expect(reverted.service?.migration?.status).toBe("migrated");
    expect(reverted.service?.migration).not.toHaveProperty("cutoverAt");
    expect(reverted.service?.migration).toMatchObject({
      legacyMenuId: menuId,
      sourceKind: "draft",
      sourceRevision: 1,
    });
    const revertAudit = auditOf(reverted, "legacy.cutover_reverted");
    expect(revertAudit).toHaveLength(1);
    expect(revertAudit[0]).toMatchObject({ actorKind: "system", entityKey: menuId });

    // A second revert is a no-op; the purge works again.
    expect(await t.mutation(internal.menuMigration.revertLegacyCutover, { menuServiceId: id })).toEqual({
      ok: true,
      changed: false,
    });
    expect(await snapshotOf(t, id)).toEqual(reverted);
    expect(await purgeRaw(t, id)).toMatchObject({ ok: true });
  });

  test("a run that has not finished cannot be cut over", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a, legacyBigModel(3, 7));
    await runBatch(t, w.a.menuServiceId, { batchSize: 5 });
    expect(
      await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: w.a.menuServiceId }),
    ).toEqual({ ok: false, blockers: ["not_migrated"] });
  });
});

// =============================================================================
// L. Internal only
// =============================================================================

describe("L. visibility", () => {
  type Registered = { isPublic?: boolean; isInternal?: boolean };

  test("every export of menuMigration is an internal function; none is public", () => {
    const registry: Record<string, unknown> = migrationModule;
    const names = Object.keys(registry).sort();
    expect(names).toEqual([
      "cutoverLegacyMenu",
      "migrateLegacyMenuBatch",
      "planLegacyMigration",
      "purgeMigratedService",
      "revertLegacyCutover",
    ]);
    for (const name of names) {
      const registered = registry[name] as Registered;
      expect(typeof registry[name], name).toBe("function");
      expect(registered.isInternal, name).toBe(true);
      expect(registered.isPublic, name).not.toBe(true);
    }
  });
});

// =============================================================================
// M. Errors
// =============================================================================

describe("M. errors", () => {
  test("a venue without a legacy menu has nothing to migrate", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    expect(await codeOf(planOf(t, id))).toBe("migration/legacy_menu_missing");
    expect(await codeOf(runBatchRaw(t, id))).toBe("migration/legacy_menu_missing");
    const snap = await snapshotOf(t, id);
    expect(snap.service?.migration).toBeUndefined();
    expect(snap.articles).toHaveLength(0);
  });

  test("a service linked to another legacy row than the one guests are served is refused", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    await seedDraftMenu(t, w.a);
    await t.run(async (ctx) => {
      const { menuId: secondId } = await seedLegacyMenu(ctx, {
        businessId: w.a.businessId,
        serviceProfileId: w.a.serviceProfileId,
      });
      const second = await ctx.db.get(secondId);
      if (!second) throw new Error("second legacy menu is missing");
      // The oldest row is the one guests see (menuForBusiness): make the second one clearly newer.
      await ctx.db.patch(secondId, { createdAt: second.createdAt + 1000 });
      await ctx.db.patch(id, { legacyMenuId: secondId });
    });
    expect(await codeOf(planOf(t, id))).toBe("migration/legacy_menu_mismatch");
    expect(await codeOf(runBatchRaw(t, id))).toBe("migration/legacy_menu_mismatch");
    const snap = await snapshotOf(t, id);
    expect(snap.service?.migration).toBeUndefined();
    expect(snap.articles).toHaveLength(0);
  });

  test("an archived service is not found by any of the functions", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    await seedDraftMenu(t, w.a);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { status: "archived" });
    });
    expect(await codeOf(planOf(t, id))).toBe("menu/not_found");
    expect(await codeOf(runBatchRaw(t, id))).toBe("menu/not_found");
    expect(await codeOf(purgeRaw(t, id))).toBe("menu/not_found");
    expect(
      await codeOf(t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId: id })),
    ).toBe("menu/not_found");
    expect(
      await codeOf(t.mutation(internal.menuMigration.revertLegacyCutover, { menuServiceId: id })),
    ).toBe("menu/not_found");
  });
});

// =============================================================================
// N. Tenant isolation
// =============================================================================

describe("N. tenants", () => {
  test("migrating venue A leaves the service of venue B untouched", async () => {
    const { t, w } = await setup();
    await seedDraftMenu(t, w.a);
    const menuIdB = await seedDraftMenu(t, w.b, legacyBigModel(1, 2));
    const beforeB = await snapshotOf(t, w.b.menuServiceId);
    const legacyB = await t.run(async (ctx) => await legacySnapshot(ctx, menuIdB));

    await migrate(t, w.a.menuServiceId);
    const snapA = await snapshotOf(t, w.a.menuServiceId);
    expect(snapA.articles).toHaveLength(8);
    expect(snapA.articles.every((article) => article.menuServiceId === w.a.menuServiceId)).toBe(true);

    const afterB = await snapshotOf(t, w.b.menuServiceId);
    expect(afterB).toEqual(beforeB);
    expect(afterB.articles).toHaveLength(0);
    expect(afterB.sections).toHaveLength(0);
    expect(afterB.placements).toHaveLength(0);
    expect(afterB.variants).toHaveLength(0);
    expect(afterB.availability).toHaveLength(0);
    expect(auditOf(afterB, "legacy.migrated")).toHaveLength(0);
    expect(afterB.service?.migration).toBeUndefined();
    expect(defaultPageOf(afterB).placementCount).toBe(0);

    // No row anywhere points at B's service from A's migration.
    const stray = await t.run(async (ctx) => {
      const articles = await ctx.db.query("menuArticles").collect();
      const sections = await ctx.db.query("menuSections").collect();
      const placements = await ctx.db.query("menuPlacements").collect();
      return [...articles, ...sections, ...placements].filter(
        (row) => row.menuServiceId === w.b.menuServiceId,
      ).length;
    });
    expect(stray).toBe(0);

    // B's legacy menu is untouched too.
    expect(await t.run(async (ctx) => await legacySnapshot(ctx, menuIdB))).toEqual(legacyB);
  });
});
