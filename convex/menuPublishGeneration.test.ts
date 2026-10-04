/// <reference types="vite/client" />

// TASK-60c — the generation-based publish, provable with convex-test (no
// browser). Covers the four owner criteria:
//   1. republish sees the NEW generation in full, the old one gone;
//   2. the guest NEVER sees a partial menu — a read while gen N+1 physically
//      coexists with gen N returns a WHOLE generation (N until the flip, N+1
//      after), never a mix;
//   3. cleanup drains every old generation with no orphaned rows;
//   4. a LOST cleanup continuation is recovered by the sweepStuckMenuCleanups
//      cron reserve (TASK-65 shape).
//
// Scheduled cleanup is driven via fake timers + finishAllScheduledFunctions(
// vi.runAllTimers) — the repo idiom (enterpriseProvisioning.test.ts) that drains
// the REAL runAfter(0) continuation publishDraft kicks off, proving the wiring.
//
// NOTE: convex-test runs a mocked transaction engine that does NOT enforce the
// 4096-databaseQueries limit — that ceiling proof lives in the perf harness on
// the real deployment (convex/menuPerfSeed.ts, docs/perf/menu-publish-ceiling.md).
// These tests prove CORRECTNESS; the perf seed proves the limit.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { defaults, itemDefaults, type MenuGroup, type MenuModel } from "../lib/menu-blocks";
import { insertPublishedRows } from "./menu";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const MEMBER_EMAIL = "vlasnik@scanme.test";
const ISSUER = "https://test.local";
const SLUG = "kafana-kod-mike";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type T = ReturnType<typeof convexTest>;
type ArgModel = NonNullable<FunctionArgs<typeof api.menu.saveDraft>["model"]>;
const asArgModel = (model: MenuModel) => model as unknown as ArgModel;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const memberId = await ctx.db.insert("users", {
      email: MEMBER_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana kod Mike",
      slug: SLUG,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId: memberId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    // TASK-61: the editor guard needs an active scanme_menu profile.
    await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_menu",
      slug: `${SLUG}-meni`,
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { memberId, businessId };
  });
}

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: ISSUER });
}

function group(shape: MenuGroup["shape"], id: string, title: string): MenuGroup {
  const g = defaults(shape);
  return { ...g, base: { ...g.base, id, title } };
}

// A minimal, distinguishable model: one "lista" group with two named items and
// no variants/pairings/dayparts — so a public read's item names identify the
// generation exactly.
function genModel(marker: string): MenuModel {
  const g = group("lista", `${marker}-g`, `${marker} grupa`);
  g.items = [
    { ...itemDefaults(), id: `${marker}-a`, name: `${marker} A`, productType: "jelo", priceRsd: 100 },
    { ...itemDefaults(), id: `${marker}-b`, name: `${marker} B`, productType: "jelo", priceRsd: 200 },
  ];
  return { groups: [g], dayparts: [] };
}

// A richer model that carries variants + a pairing, to prove those children are
// cleaned up too (they have no generation column — they die with their item).
function variantModel(): MenuModel {
  const g = group("lista", "vm-g", "Pića");
  g.items = [
    {
      ...itemDefaults(),
      id: "vm-rakija",
      name: "Šljivovica",
      productType: "rakija",
      priceRsd: 250,
      variants: [
        { id: "vm-v1", label: "0.3 l", priceRsd: 250 },
        { id: "vm-v2", label: "0.5 l", priceRsd: 390 },
      ],
      pairings: [{ id: "vm-p", pairedItemId: "vm-meze" }],
    },
    { ...itemDefaults(), id: "vm-meze", name: "Meze", productType: "kajmak", priceRsd: 800 },
  ];
  return { groups: [g], dayparts: [] };
}

async function publish(me: ReturnType<typeof as>, menuId: Id<"menus">, model: MenuModel) {
  const { draftRevision } = await me.mutation(api.menu.saveDraft, {
    menuId,
    model: asArgModel(model),
  });
  return me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
}

async function publicItemNames(t: T, slug = SLUG): Promise<string[]> {
  const view = await t.query(api.menu.publicMenuBySlug, { slug });
  if (!view) return [];
  return view.groups.flatMap((g) => g.items.map((i) => i.name));
}

// Count of rows physically present, so a test can prove old generations are gone
// (not merely hidden).
async function rowCounts(t: T, menuId: Id<"menus">) {
  return t.run(async (ctx) => {
    const menu = await ctx.db.get(menuId);
    const items = await ctx.db.query("menuItems").collect();
    const groups = await ctx.db.query("menuGroups").collect();
    const dayparts = await ctx.db.query("menuDayparts").collect();
    const variants = await ctx.db.query("itemVariants").collect();
    const pairings = await ctx.db.query("itemPairings").collect();
    const liveGen = menu?.publishedGeneration;
    const below = (g: number | undefined) =>
      liveGen !== undefined && (g ?? -1) < liveGen;
    return {
      liveGen,
      pendingCleanup: menu?.pendingCleanup ?? false,
      items: items.length,
      groups: groups.length,
      variants: variants.length,
      pairings: pairings.length,
      oldItems: items.filter((r) => below(r.publishGeneration)).length,
      oldGroups: groups.filter((r) => below(r.publishGeneration)).length,
      oldDayparts: dayparts.filter((r) => below(r.publishGeneration)).length,
    };
  });
}

describe("TASK-60c — generation-based publish", () => {
  test("republish serves the NEW generation in full; the old one is gone after cleanup", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    vi.useFakeTimers();
    try {
      const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });

      const first = await publish(me, menuId, genModel("G1"));
      expect(first.publishedAt).toBeGreaterThan(0);
      expect(await publicItemNames(t)).toEqual(["G1 A", "G1 B"]);
      expect((await rowCounts(t, menuId)).liveGen).toBe(1);

      await publish(me, menuId, genModel("G2"));
      // The live generation flipped to 2 immediately (inline flip).
      expect((await rowCounts(t, menuId)).liveGen).toBe(2);
      expect(await publicItemNames(t)).toEqual(["G2 A", "G2 B"]);

      // Cleanup runs off the critical path; drive the scheduled continuation.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const after = await rowCounts(t, menuId);
      expect(after.oldItems).toBe(0);
      expect(after.oldGroups).toBe(0);
      expect(after.items).toBe(2); // only generation 2 survives
      expect(after.groups).toBe(1);
      expect(after.pendingCleanup).toBe(false);
      expect(await publicItemNames(t)).toEqual(["G2 A", "G2 B"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the guest NEVER sees a partial menu: a read while both generations coexist returns a WHOLE generation", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    // Fake timers (never advanced) freeze the scheduled cleanup so it cannot fire
    // mid-test — this test is about the read, not cleanup.
    vi.useFakeTimers();
    try {
      const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });

      // Generation 1 is live.
      await publish(me, menuId, genModel("G1"));
      expect(await publicItemNames(t)).toEqual(["G1 A", "G1 B"]);

      // Simulate mid-publish: generation 2 rows are WRITTEN but the pointer has
      // NOT flipped yet (both generations physically coexist in the tables).
      await t.run(async (ctx) => {
        await insertPublishedRows(ctx, menuId, genModel("G2"), 2);
      });

      // The guest still sees the COMPLETE generation 1 — no G2 leakage, no mix.
      expect(await publicItemNames(t)).toEqual(["G1 A", "G1 B"]);

      // Flip the pointer (the atomic publish moment).
      await t.run(async (ctx) => {
        await ctx.db.patch(menuId, { publishedGeneration: 2 });
      });

      // Now the guest sees the COMPLETE generation 2 — again no mix.
      expect(await publicItemNames(t)).toEqual(["G2 A", "G2 B"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cleanup drains EVERY old generation and orphans nothing (variants + pairings included)", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    vi.useFakeTimers();
    try {
      const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });

      // Three publishes: gen 1 carries variants + a pairing, gen 2 and 3 do not.
      await publish(me, menuId, variantModel());
      await publish(me, menuId, genModel("G2"));
      await publish(me, menuId, genModel("G3"));
      expect((await rowCounts(t, menuId)).liveGen).toBe(3);

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const after = await rowCounts(t, menuId);
      expect(after.oldItems).toBe(0);
      expect(after.oldGroups).toBe(0);
      expect(after.oldDayparts).toBe(0);
      // Only generation 3 (genModel G3: 1 group, 2 items, no children) survives.
      expect(after.items).toBe(2);
      expect(after.groups).toBe(1);
      expect(after.variants).toBe(0); // generation 1's variants are gone
      expect(after.pairings).toBe(0); // generation 1's pairing is gone
      expect(after.pendingCleanup).toBe(false);
      expect(await publicItemNames(t)).toEqual(["G3 A", "G3 B"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a LOST cleanup continuation is recovered by the sweepStuckMenuCleanups cron reserve", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    vi.useFakeTimers();
    try {
      const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
      await publish(me, menuId, variantModel());

      // Build a "lost continuation" state by hand: generation 2 written + flipped,
      // pendingCleanup=true, but pendingCleanupSince stale and NO scheduled
      // cleanup pending (as if the runAfter was dropped). Generation 1 is stranded.
      await t.run(async (ctx) => {
        await insertPublishedRows(ctx, menuId, genModel("G2"), 2);
        await ctx.db.patch(menuId, {
          publishedGeneration: 2,
          pendingCleanup: true,
          pendingCleanupSince: Date.now() - 10 * 60_000, // 10 min stale
        });
      });
      const before = await rowCounts(t, menuId);
      expect(before.oldItems).toBeGreaterThan(0); // generation 1 is stranded

      // The cron reserve finds the stale menu and re-schedules cleanup.
      const swept = await t.mutation(internal.menu.sweepStuckMenuCleanups, {});
      expect(swept.resumed).toBe(1);

      // Its rescheduled continuation drains the stranded generation.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const after = await rowCounts(t, menuId);
      expect(after.oldItems).toBe(0);
      expect(after.variants).toBe(0);
      expect(after.pairings).toBe(0);
      expect(after.pendingCleanup).toBe(false);
      expect(await publicItemNames(t)).toEqual(["G2 A", "G2 B"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a fresh (non-stale) pending cleanup is left alone by the cron reserve", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    vi.useFakeTimers();
    try {
      const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
      await publish(me, menuId, genModel("G1"));
      await publish(me, menuId, genModel("G2")); // pendingCleanupSince = now

      // A just-published menu is fresh; the sweep must not touch it.
      const swept = await t.mutation(internal.menu.sweepStuckMenuCleanups, {});
      expect(swept.resumed).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
