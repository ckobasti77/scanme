/// <reference types="vite/client" />

// ScanMe Menu V1 — K06: the COMPATIBILITY LAYER between the legacy `menus` model
// and the new Menu service (K01 §6, master §6.2–§6.3, §17.4). Proven here:
//
//   - a legacy menu that is not migrated, or migrated only into the new draft,
//     or whose new model is already published, is shown to guests exactly as
//     before (the public route switches only in K13);
//   - existing `menu` QR cards resolve to the same place at every stage;
//   - the legacy writers (old editor, its publish and live "nema više", the old
//     admin import and publish) keep working until the cutover and refuse after
//     it, writing nothing; the revert brings them back;
//   - a cutover of one service never blocks another venue's legacy menu, and a
//     venue with no new service at all keeps working on the legacy path.
//
// Fictional tenants only (the repo is public). The scheduler is driven with fake
// timers + finishAllScheduledFunctions, the repo idiom.

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { menuEditorSr } from "../lib/i18n/sr/menu-editor";
import type { MenuModel } from "../lib/menu-blocks";
import {
  legacyDraftModel,
  legacySnapshot,
  seedLegacyMenu,
} from "../lib/menu/testkit/legacy";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
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

// The pure model types storage ids as strings; the validator brands them.
// Runtime-identical: the same boundary cast convex/menu.test.ts uses.
type ArgModel = NonNullable<FunctionArgs<typeof api.menu.saveDraft>["model"]>;
const asArgModel = (model: MenuModel) => model as unknown as ArgModel;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

// -----------------------------------------------------------------------------
// World and flow helpers
// -----------------------------------------------------------------------------

/**
 * The menu world with tenant A's LEGACY menu seeded (published, slug SLUG_A,
 * draft = the live generation = legacyDraftModel()). `legacyB` gives tenant B a
 * legacy menu of its own as well.
 */
async function setup(options: { legacyB?: boolean } = {}) {
  const t = newTest();
  rateLimiterTest.register(t);
  vi.useFakeTimers();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const menuId = await t.run(async (ctx) => {
    const seeded = await seedLegacyMenu(ctx, {
      businessId: w.a.businessId,
      serviceProfileId: w.a.serviceProfileId,
      draft: legacyDraftModel(),
      generations: [legacyDraftModel()],
    });
    return seeded.menuId;
  });
  let menuIdB: Id<"menus"> | null = null;
  if (options.legacyB) {
    menuIdB = await t.run(async (ctx) => {
      const seeded = await seedLegacyMenu(ctx, {
        businessId: w.b.businessId,
        serviceProfileId: w.b.serviceProfileId,
        draft: legacyDraftModel(),
        generations: [legacyDraftModel()],
      });
      return seeded.menuId;
    });
  }
  return { t, w, menuId, menuIdB };
}

async function settle(t: T) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function migrationStatus(t: T, menuServiceId: Id<"menuServices">) {
  const service = await t.run(async (ctx) => await ctx.db.get(menuServiceId));
  return service?.migration?.status ?? null;
}

/**
 * The full migration into the new draft: batches of 3 articles, so the run
 * continues itself through the scheduler (8 articles = three batches).
 */
async function migrate(t: T, menuServiceId: Id<"menuServices">) {
  const first = await t.mutation(internal.menuMigration.migrateLegacyMenuBatch, {
    menuServiceId,
    batchSize: 3,
  });
  if (!first.ok) throw new Error(`migration blocked: ${first.blockers.join(", ")}`);
  // Three of eight articles written: the rest is finished only by the scheduler.
  expect(first.done).toBe(false);
  await settle(t);
  expect(await migrationStatus(t, menuServiceId)).toBe("migrated");
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
  await settle(t);
  return result;
}

async function cutover(t: T, menuServiceId: Id<"menuServices">) {
  const result = await t.mutation(internal.menuMigration.cutoverLegacyMenu, { menuServiceId });
  if (!result.ok) throw new Error(`cutover refused: ${result.blockers.join(", ")}`);
  expect(await migrationStatus(t, menuServiceId)).toBe("cutover");
}

/** Migrated, published as the new model, switched over: the legacy writers are off. */
async function cutoverWorld() {
  const world = await setup();
  await migrate(world.t, world.w.a.menuServiceId);
  await publishNow(world.t, world.w.ownerId, world.w.a.menuServiceId);
  await cutover(world.t, world.w.a.menuServiceId);
  return world;
}

/** What a guest of /[slug]/meni gets from the legacy public queries. */
async function legacyPublicView(t: T, slug: string = SLUG_A) {
  return {
    withoutDaypart: await t.query(api.menu.publicMenuBySlug, { slug }),
    lunch: await t.query(api.menu.publicMenuBySlug, { slug, activeDaypart: "rucak" }),
    daypartState: await t.query(api.menu.menuDaypartStateBySlug, { slug }),
  };
}

function entryOf(t: T, slug: string = SLUG_A) {
  return t.query(api.menuPublic.entry, { slug });
}

function snapshotOf(t: T, menuId: Id<"menus">) {
  return t.run(async (ctx) => await legacySnapshot(ctx, menuId));
}

/** The live (published generation) row of a legacy item, found by its draft key. */
async function liveItemRow(t: T, menuId: Id<"menus">, key: string): Promise<Id<"menuItems">> {
  return await t.run(async (ctx) => {
    const menu = await ctx.db.get(menuId);
    const rows = await ctx.db
      .query("menuItems")
      .withIndex("by_menuId_and_publishGeneration", (q) =>
        q.eq("menuId", menuId).eq("publishGeneration", menu?.publishedGeneration),
      )
      .collect();
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) throw new Error(`no live legacy row for ${key}`);
    return row._id;
  });
}

async function draftRevisionOf(t: T, menuId: Id<"menus">) {
  const menu = await t.run(async (ctx) => await ctx.db.get(menuId));
  return menu?.draftRevision ?? 0;
}

/** The legacy model with Espreso at another price (a visible, checkable edit). */
function modelWithEspresoPrice(priceRsd: number): MenuModel {
  const model = legacyDraftModel();
  return {
    ...model,
    groups: model.groups.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.id === "itm-espreso" ? { ...item, priceRsd } : item,
      ),
    })),
  };
}

function espresoPrice(view: Awaited<ReturnType<typeof legacyPublicView>>["withoutDaypart"]) {
  const espreso = view?.groups.flatMap((group) => group.items).find((item) => item.name === "Espreso");
  return espreso?.priceRsd;
}

const groupTitles = (view: Awaited<ReturnType<typeof legacyPublicView>>["withoutDaypart"]) =>
  view?.groups.map((group) => group.base.title);

// =============================================================================
// 1. Not migrated: shown as before
// =============================================================================

describe("a legacy menu that is not migrated", () => {
  test("is shown exactly as before: groups, prices, a live 'nema vise', dayparts, and the entry stays legacy", async () => {
    const { t } = await setup();

    const view = await legacyPublicView(t);
    expect(view.withoutDaypart?.businessName).toBe("Kafana kod Mike");
    // "Roštilj" is tied to the "rucak" daypart: hidden without it, shown with it.
    expect(groupTitles(view.withoutDaypart)).toEqual(["Topli napici", "Pića"]);
    expect(groupTitles(view.lunch)).toEqual(["Topli napici", "Roštilj", "Pića"]);
    expect(view.lunch?.activeDaypartKey).toBe("rucak");

    const items = view.lunch?.groups.flatMap((group) => group.items) ?? [];
    const price = (name: string) => items.find((item) => item.name === name)?.priceRsd;
    expect(price("Espreso")).toBe(150);
    expect(price("Pljeskavica")).toBe(650);
    expect(price("Kisela voda 0,33 l")).toBe(160);
    const cevapi = items.find((item) => item.name === "Ćevapi 10 kom");
    expect(cevapi?.priceRsd).toBe(790);
    expect(cevapi?.available).toBe(false);
    const kapucino = items.find((item) => item.name === "Kapućino");
    expect(kapucino?.variants.map((variant) => [variant.label, variant.priceRsd])).toEqual([
      ["mala", 180],
      ["velika", 220],
    ]);

    expect(view.daypartState).toEqual({
      businessName: "Kafana kod Mike",
      daypartOverride: null,
      dayparts: [{ key: "rucak", label: "Ručak", startMinute: 720, endMinute: 960 }],
    });

    expect(await entryOf(t)).toEqual({ kind: "legacy" });
  });
});

// =============================================================================
// 2. Migrated into the draft: identical
// =============================================================================

describe("a legacy menu migrated only into the new draft", () => {
  test("is shown IDENTICALLY to guests, the legacy rows are untouched and the draft is not public", async () => {
    const { t, w, menuId } = await setup();
    const before = await legacyPublicView(t);
    const rowsBefore = await snapshotOf(t, menuId);
    expect(await entryOf(t)).toEqual({ kind: "legacy" });

    await migrate(t, w.a.menuServiceId);

    expect(await legacyPublicView(t)).toEqual(before);
    expect(await snapshotOf(t, menuId)).toEqual(rowsBefore);
    // The migrated draft is not public: /[slug]/meni still falls back to legacy.
    expect(await entryOf(t)).toEqual({ kind: "legacy" });
    expect(await t.query(api.menuPublic.page, { slug: SLUG_A })).toBeNull();
  });
});

// =============================================================================
// 3. New model published: the legacy public queries still answer the same
// =============================================================================

describe("a legacy menu whose new model is already published", () => {
  test("the entry switches to 'new' but the legacy public queries keep returning the old content", async () => {
    const { t, w } = await setup();
    const before = await legacyPublicView(t);

    await migrate(t, w.a.menuServiceId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    expect(await entryOf(t)).toEqual({ kind: "new", versionNumber: 1 });
    // The route switch is K13; until then the old queries serve the same menu.
    expect(await legacyPublicView(t)).toEqual(before);
  });
});

// =============================================================================
// 4. QR cards `menu`: the same place at every stage
// =============================================================================

describe("existing `menu` QR cards", () => {
  test("resolve to the same business at every stage: before, after migration, after publishing the new model, after the cutover", async () => {
    const { t, w } = await setup();
    const created = await as(t, w.adminId).mutation(api.cards.createCard, {
      businessId: w.a.businessId,
      label: "Meni Sto 1",
      target: { kind: "menu" },
    });
    const resolve = (requestId: string) =>
      t.mutation(api.cards.resolveAndRecord, {
        cardCode: created.cardCode,
        requestId,
        deviceCategory: "mobile" as const,
        ipHash: "test-ip-hash",
      });
    const targetsOf = () =>
      t.run(async (ctx) =>
        ctx.db
          .query("cardTargets")
          .withIndex("by_cardId", (q) => q.eq("cardId", created.cardId))
          .collect(),
      );
    const expected = { kind: "menu", businessSlug: SLUG_A };
    const targetsBefore = await targetsOf();
    expect(targetsBefore).toHaveLength(1);

    expect(await resolve("req-before")).toEqual(expected);

    await migrate(t, w.a.menuServiceId);
    expect(await resolve("req-migrated")).toEqual(expected);

    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect(await resolve("req-published")).toEqual(expected);

    await cutover(t, w.a.menuServiceId);
    expect(await resolve("req-cutover")).toEqual(expected);

    // Nothing in the migration retargeted the card: still one target, unchanged.
    expect(await targetsOf()).toEqual(targetsBefore);
  });
});

// =============================================================================
// 5. Before the cutover the legacy writers work
// =============================================================================

describe("legacy writers before the cutover", () => {
  test("keep working on a migrated menu: owner saveDraft and live 'nema vise', admin import and publish", async () => {
    const { t, w, menuId } = await setup();
    await migrate(t, w.a.menuServiceId);
    const owner = as(t, w.ownerId);
    const admin = as(t, w.adminId);

    // Owner: the live "nema više" toggle (a live row found by its draft key).
    const espresoRow = await liveItemRow(t, menuId, "itm-espreso");
    expect(await owner.mutation(api.menu.setItemAvailable, { itemId: espresoRow, available: false })).toEqual({
      available: false,
    });
    const afterToggle = await t.query(api.menu.publicMenuBySlug, { slug: SLUG_A });
    const espreso = afterToggle?.groups.flatMap((group) => group.items).find((item) => item.name === "Espreso");
    expect(espreso?.available).toBe(false);

    // Owner: the old editor's autosave.
    expect(
      await owner.mutation(api.menu.saveDraft, { menuId, model: asArgModel(modelWithEspresoPrice(160)) }),
    ).toEqual({ draftRevision: 2, hasUnpublishedChanges: true });

    // Admin: the old data entry and the publish on the client's behalf.
    const imported = await admin.mutation(api.menuAdmin.importDraft, {
      menuId,
      model: asArgModel(modelWithEspresoPrice(170)),
    });
    expect(imported.draftRevision).toBe(3);
    const published = await admin.mutation(api.menuAdmin.publishForClient, { menuId });
    expect(published.items).toBe(8);
    await settle(t);

    // The legacy publish really reached guests: the new price is live.
    expect(espresoPrice(await t.query(api.menu.publicMenuBySlug, { slug: SLUG_A }))).toBe(170);
    expect(await migrationStatus(t, w.a.menuServiceId)).toBe("migrated");
  });
});

// =============================================================================
// 6. After the cutover the legacy writers refuse
// =============================================================================

describe("legacy writers after the cutover", () => {
  // Every refusal carries menuEditorSr.legacyMigrated and writes nothing: the
  // six legacy tables (menu row, groups, items, variants, pairings, dayparts)
  // are identical before and after the attempt.
  async function expectRefused(
    world: Awaited<ReturnType<typeof cutoverWorld>>,
    attempt: (world: Awaited<ReturnType<typeof cutoverWorld>>) => Promise<unknown>,
  ) {
    const before = await snapshotOf(world.t, world.menuId);
    await expect(attempt(world)).rejects.toThrow(menuEditorSr.legacyMigrated);
    expect(await snapshotOf(world.t, world.menuId)).toEqual(before);
  }

  test("saveDraft refuses", async () => {
    const world = await cutoverWorld();
    await expectRefused(world, ({ t, w, menuId }) =>
      as(t, w.ownerId).mutation(api.menu.saveDraft, {
        menuId,
        model: asArgModel(modelWithEspresoPrice(999)),
      }),
    );
  });

  test("publishDraft refuses, even with the right expectedDraftRevision", async () => {
    const world = await cutoverWorld();
    const expectedDraftRevision = await draftRevisionOf(world.t, world.menuId);
    await expectRefused(world, ({ t, w, menuId }) =>
      as(t, w.ownerId).mutation(api.menu.publishDraft, { menuId, expectedDraftRevision }),
    );
  });

  test("setItemAvailable refuses", async () => {
    const world = await cutoverWorld();
    const itemId = await liveItemRow(world.t, world.menuId, "itm-espreso");
    await expectRefused(world, ({ t, w }) =>
      as(t, w.ownerId).mutation(api.menu.setItemAvailable, { itemId, available: false }),
    );
  });

  test("menuAdmin.importDraft refuses", async () => {
    const world = await cutoverWorld();
    await expectRefused(world, ({ t, w, menuId }) =>
      as(t, w.adminId).mutation(api.menuAdmin.importDraft, {
        menuId,
        model: asArgModel(modelWithEspresoPrice(999)),
      }),
    );
  });

  test("menuAdmin.publishForClient refuses", async () => {
    const world = await cutoverWorld();
    await expectRefused(world, ({ t, w, menuId }) =>
      as(t, w.adminId).mutation(api.menuAdmin.publishForClient, { menuId }),
    );
  });
});

// =============================================================================
// 7. The revert brings the legacy writers back
// =============================================================================

describe("revertLegacyCutover", () => {
  test("brings the old writers back: saveDraft refuses after the cutover and passes after the revert", async () => {
    const { t, w, menuId } = await cutoverWorld();
    const owner = as(t, w.ownerId);
    const save = () => owner.mutation(api.menu.saveDraft, { menuId, model: asArgModel(modelWithEspresoPrice(160)) });

    await expect(save()).rejects.toThrow(menuEditorSr.legacyMigrated);

    const reverted = await t.mutation(internal.menuMigration.revertLegacyCutover, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(reverted).toEqual({ ok: true, changed: true });
    expect(await migrationStatus(t, w.a.menuServiceId)).toBe("migrated");

    expect(await save()).toEqual({ draftRevision: 2, hasUnpublishedChanges: true });
  });
});

// =============================================================================
// 8. A cutover of one service does not block another venue's legacy menu
// =============================================================================

describe("the cutover of one venue", () => {
  test("does not block the legacy menu of another venue", async () => {
    const { t, w, menuId, menuIdB } = await setup({ legacyB: true });
    if (!menuIdB) throw new Error("tenant B legacy menu missing");
    await migrate(t, w.a.menuServiceId);
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    await cutover(t, w.a.menuServiceId);

    // Venue A is switched off ...
    await expect(
      as(t, w.ownerId).mutation(api.menu.saveDraft, {
        menuId,
        model: asArgModel(modelWithEspresoPrice(160)),
      }),
    ).rejects.toThrow(menuEditorSr.legacyMigrated);

    // ... venue B keeps its old editor, its live toggle and its legacy entry.
    const otherOwner = as(t, w.otherOwnerId);
    expect(
      await otherOwner.mutation(api.menu.saveDraft, {
        menuId: menuIdB,
        model: asArgModel(modelWithEspresoPrice(160)),
      }),
    ).toEqual({ draftRevision: 2, hasUnpublishedChanges: true });
    const cevapiRow = await liveItemRow(t, menuIdB, "itm-cevapi");
    expect(await otherOwner.mutation(api.menu.setItemAvailable, { itemId: cevapiRow, available: true })).toEqual({
      available: true,
    });
    expect(await entryOf(t, SLUG_B)).toEqual({ kind: "legacy" });
    expect(await migrationStatus(t, w.b.menuServiceId)).toBeNull();
  });
});

// =============================================================================
// 9. A venue without a new Menu service
// =============================================================================

describe("a venue with a legacy menu and no Menu service at all", () => {
  test("keeps the old writers and the legacy entry: the guard does not require a service", async () => {
    const { t, w } = await setup();
    const slug = "bez-novog-servisa";
    const { menuId, ownerId } = await t.run(async (ctx) => {
      const now = Date.now();
      const businessId = await ctx.db.insert("businesses", {
        name: "Bife bez servisa",
        slug,
        status: "active",
        createdAt: now,
      });
      const serviceProfileId = await ctx.db.insert("serviceProfiles", {
        businessId,
        type: "scanme_menu",
        slug: `${slug}-meni`,
        status: "active",
        clientEditingEnabled: true,
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
      const ownerId = await ctx.db.insert("users", {
        email: "bife@example.com",
        emailVerificationTime: now,
      });
      await ctx.db.insert("businessMemberships", {
        userId: ownerId,
        businessId,
        accessRole: "viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const seeded = await seedLegacyMenu(ctx, {
        businessId,
        serviceProfileId,
        draft: legacyDraftModel(),
        generations: [legacyDraftModel()],
      });
      return { menuId: seeded.menuId, ownerId };
    });
    const services = await t.run(async (ctx) => {
      const business = await ctx.db
        .query("businesses")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!business) throw new Error("business missing");
      return await ctx.db
        .query("menuServices")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    });
    expect(services).toEqual([]);
    expect(await entryOf(t, slug)).toEqual({ kind: "legacy" });

    const owner = as(t, ownerId);
    const admin = as(t, w.adminId);
    const itemId = await liveItemRow(t, menuId, "itm-espreso");
    expect(await owner.mutation(api.menu.setItemAvailable, { itemId, available: false })).toEqual({
      available: false,
    });
    expect(
      await owner.mutation(api.menu.saveDraft, { menuId, model: asArgModel(modelWithEspresoPrice(160)) }),
    ).toEqual({ draftRevision: 2, hasUnpublishedChanges: true });
    expect(
      (await admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(modelWithEspresoPrice(170)) }))
        .draftRevision,
    ).toBe(3);
    expect((await admin.mutation(api.menuAdmin.publishForClient, { menuId })).items).toBe(8);
    await settle(t);
    expect(espresoPrice(await t.query(api.menu.publicMenuBySlug, { slug }))).toBe(170);
  });
});
