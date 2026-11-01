/// <reference types="vite/client" />

// Sajam elektromobilnosti 2026 — the real-event setup is idempotent and the
// committed intake payload imports and publishes cleanly on top of it.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { bumpFairCount, fairScanCountKey } from "./lib/fairCountShards";
import schema from "./schema";
import type { FairImportPayload } from "./fairImport";
import payloadJson from "../docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json";
import amfPayloadJson from "../docs/events/auto-moto-fest-2026/intake/prod-2026-10-30/b1-payload-dev.json";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-08T10:00:00+02:00");
const ADMIN_EMAIL = "fair-setup@scanme.test";
const payload = payloadJson as FairImportPayload;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  return t;
}

async function rowCounts(t: Awaited<ReturnType<typeof setup>>) {
  return t.run(async (ctx) => ({
    events: (await ctx.db.query("fairEvents").collect()).length,
    days: (await ctx.db.query("fairEventDays").collect()).length,
    accounts: (await ctx.db.query("accounts").collect()).length,
    contacts: (await ctx.db.query("accountContacts").collect()).length,
    businesses: (await ctx.db.query("businesses").collect()).length,
    brands: (await ctx.db.query("brands").collect()).length,
  }));
}

test("bootstrapEvent is idempotent", async () => {
  const t = await setup();
  const first = await t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
  expect(first).toMatchObject({ event: "created", days: { created: 3 }, brands: { created: 6, unchanged: 0 } });
  expect(first.clients.map((c) => [c.smkCode, c.result])).toEqual([
    ["SMK-SAJAM-26-CUBI", "created"],
    ["SMK-SAJAM-26-GRAND-MOTORS", "created"],
    ["SMK-SAJAM-26-AUTO-MIG", "created"],
    ["SMK-SAJAM-26-FERUM", "created"],
    ["SMK-SAJAM-26-BENTU", "created"],
  ]);
  const before = await rowCounts(t);
  expect(before).toEqual({ events: 1, days: 3, accounts: 5, contacts: 5, businesses: 5, brands: 6 });

  const second = await t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
  expect(second).toMatchObject({ eventId: first.eventId, event: "unchanged", days: { unchanged: 3 }, brands: { created: 0, unchanged: 6 } });
  expect(second.clients.every((c) => c.result === "unchanged")).toBe(true);
  expect(await rowCounts(t)).toEqual(before);

  const event = await t.run((ctx) => ctx.db.get(first.eventId));
  expect(event).toMatchObject({ code: "elektromobilnost-2026", slug: "elektromobilnost-2026", status: "published", timezone: "Europe/Belgrade" });
  const contacts = await t.run((ctx) => ctx.db.query("accountContacts").collect());
  expect(contacts.every((c) => c.firstName === "Kontakt" && c.normalizedEmail === undefined && c.normalizedPhone === undefined)).toBe(true);
});

test("a non-admin actor is refused", async () => {
  const t = await setup();
  await expect(t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: "someone@scanme.test" })).rejects.toThrow("fair_setup_actor_not_admin");
});

test("the intake payload dry-runs clean, commits idempotently and publishes all 15 models", async () => {
  const t = await setup();
  await t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
  const dry = await t.query(internal.fairSetup.importDryRun, { payload });
  expect(dry.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  expect(dry.ok).toBe(true);
  expect(dry.summary).toMatchObject({ participations: { new: 5 }, stands: { new: 5 }, models: { new: 15 } });
  // hala-6 is shared by AUTO MIG and Grand Motors (owner decision O4).
  expect(dry.issues).toContainEqual(expect.objectContaining({ severity: "warning", code: "FAIR_MAP_LOCATION_TAKEN", details: { mapLocationId: "hala-6" } }));

  const committed = await t.mutation(internal.fairSetup.importCommit, { payload, actorEmail: ADMIN_EMAIL });
  expect(committed).toMatchObject({ committed: true, results: { participations: { created: 5 }, stands: { created: 5 }, models: { created: 15 } } });
  const again = await t.mutation(internal.fairSetup.importCommit, { payload, actorEmail: ADMIN_EMAIL });
  expect(again.results).toMatchObject({ participations: { unchanged: 5 }, stands: { unchanged: 5 }, models: { unchanged: 15 } });

  const published = await t.mutation(internal.fairSetup.publishEventModels, { eventCode: "elektromobilnost-2026", actorEmail: ADMIN_EMAIL });
  expect(published.published).toHaveLength(15);
  expect(published.published).toEqual(expect.arrayContaining(["jmev-ev3", "jmev-yi", "jmev-ewind", "mazda-cx-5", "bentu-mango"]));
  const rerun = await t.mutation(internal.fairSetup.publishEventModels, { eventCode: "elektromobilnost-2026", actorEmail: ADMIN_EMAIL });
  expect(rerun).toMatchObject({ published: [], alreadyPublished: 15 });

  // JOVAN-DELTA 2026-10-08b: the packages (package_active_from 9 Oct) are in
  // force from the import, and the publish brings the JMEV passport (the only
  // brand that qualifies) with it.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const state = await t.run(async (ctx) => ({
    models: await ctx.db.query("fairEventModels").collect(),
    passports: await ctx.db.query("fairPassportConfigs").collect(),
    brands: await ctx.db.query("brands").collect(),
  }));
  expect(state.models.every((row) => row.packageActivatedAt <= NOW)).toBe(true);
  expect(state.passports.map((row) => [state.brands.find((brand) => brand._id === row.brandId)?.name, row.status])).toEqual([["JMEV", "published"]]);
});

test("Auto Moto Fest: the real 18-model intake imports and brings its six brand passports (no SWM)", async () => {
  vi.setSystemTime(Date.parse("2026-10-30T08:00:00+01:00"));
  const t = await setup();
  const amfPayload = amfPayloadJson as FairImportPayload;
  const boot = await t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL, eventCode: "auto-moto-fest-2026" });
  expect(boot).toMatchObject({ event: "created", days: { created: 3 }, brands: { created: 7 } });
  const event = await t.run((ctx) => ctx.db.get(boot.eventId));
  expect(event).toMatchObject({ code: "auto-moto-fest-2026", title: "Auto Moto Fest 2026", venueName: "Hala Čair, Niš", status: "published" });

  const dry = await t.query(internal.fairSetup.importDryRun, { payload: amfPayload });
  expect(dry.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  await t.mutation(internal.fairSetup.importCommit, { payload: amfPayload, actorEmail: ADMIN_EMAIL });
  const published = await t.mutation(internal.fairSetup.publishEventModels, { eventCode: "auto-moto-fest-2026", actorEmail: ADMIN_EMAIL });
  expect([...published.published].sort()).toEqual(amfPayload.participations.flatMap(p => p.brands.flatMap(b => b.models.map(m => m.slug))).sort());
  expect(published.published).toHaveLength(18);

  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const passports = await t.run((ctx) => ctx.db.query("fairPassportConfigs").collect());
  expect(passports.map((row) => row.status)).toEqual(Array(6).fill("published"));
  // SWM exhibits more cars than it bought the service for: it gets no passport.
  const brandNames = await t.run(async (ctx) => Promise.all(passports.map(async (row) => (await ctx.db.get(row.brandId))!.name)));
  expect(brandNames.sort()).toEqual(["Dongfeng", "Fiat", "Ford", "Ineos", "MG", "Škoda"].sort());
});

async function setupAmfWithModels() {
  const liveNow = Date.parse("2026-10-31T12:00:00+01:00");
  vi.setSystemTime(liveNow);
  const t = await setup();
  const amfPayload = amfPayloadJson as FairImportPayload;
  await t.mutation(internal.fairSetup.bootstrapEvent, {
    actorEmail: ADMIN_EMAIL,
    eventCode: "auto-moto-fest-2026",
  });
  await t.mutation(internal.fairSetup.importCommit, { payload: amfPayload, actorEmail: ADMIN_EMAIL });
  await t.mutation(internal.fairSetup.publishEventModels, {
    eventCode: "auto-moto-fest-2026",
    actorEmail: ADMIN_EMAIL,
  });
  return { t, liveNow };
}

async function seedModelScans(
  t: Awaited<ReturnType<typeof setup>>,
  slug: string,
  opts: { total: number; unique?: number; dateKey?: string },
) {
  await t.run(async (ctx) => {
    const model = await ctx.db
      .query("fairEventModels")
      .filter((q) => q.eq(q.field("slug"), slug))
      .first();
    if (!model) throw new Error(`missing_model:${slug}`);
    const dateKey = opts.dateKey ?? "2026-10-31";
    const hourKey = `${dateKey}T12`;
    if (opts.total > 0) {
      await bumpFairCount(ctx, fairScanCountKey("scan_total", "model", model._id), opts.total);
      await bumpFairCount(ctx, fairScanCountKey("scan_total", "model", model._id, dateKey), opts.total);
      await bumpFairCount(ctx, fairScanCountKey("scan_total", "model", model._id, hourKey), opts.total);
    }
    if ((opts.unique ?? 0) > 0) {
      await bumpFairCount(ctx, fairScanCountKey("scan_unique", "model", model._id), opts.unique!);
      await bumpFairCount(ctx, fairScanCountKey("scan_unique", "model", model._id, dateKey), opts.unique!);
      await bumpFairCount(ctx, fairScanCountKey("scan_unique", "model", model._id, hourKey), opts.unique!);
    }
  });
}

test("popular model leader: highest whole-fair total wins across all days", async () => {
  const { t, liveNow } = await setupAmfWithModels();
  await seedModelScans(t, "ineos-grenadier", { total: 40, unique: 35, dateKey: "2026-10-30" });
  await seedModelScans(t, "skoda-kodiaq", { total: 25, unique: 20, dateKey: "2026-10-30" });
  await seedModelScans(t, "skoda-kodiaq", { total: 30, unique: 22, dateKey: "2026-10-31" });

  const res = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: liveNow });
  expect(res).toMatchObject({
    status: "updated",
    leaderSlug: "skoda-kodiaq",
    changed: true,
  });

  const highlighted = await t.run(async (ctx) => {
    const models = await ctx.db.query("fairEventModels").collect();
    return models.filter((m) => m.highlight !== undefined).map((m) => [m.slug, m.highlight]);
  });
  expect(highlighted).toEqual([["skoda-kodiaq", "most_popular"]]);
});

test("popular model leader: a tie keeps the current holder, or breaks by unique scans then alphabetical slug", async () => {
  const { t, liveNow } = await setupAmfWithModels();
  // Nobody holds it yet: tie on totalScans (50) breaks by uniqueScans, then alphabetical by slug.
  await seedModelScans(t, "mg-hs-hybrid", { total: 50, unique: 40 });
  await seedModelScans(t, "ford-kuga", { total: 50, unique: 40 });
  const first = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: liveNow });
  expect(first.leaderSlug).toBe("ford-kuga");

  // Put badge on ineos-grenadier and tie it at the top (50 total) with ford-kuga (even with higher unique on ford-kuga).
  await t.mutation(internal.fairSetup.setModelHighlight, {
    eventCode: "auto-moto-fest-2026",
    modelSlug: "ineos-grenadier",
    highlight: "most_popular",
  });
  await t.mutation(internal.fairSetup.setModelHighlight, {
    eventCode: "auto-moto-fest-2026",
    modelSlug: "ford-kuga",
    highlight: null,
  });
  await seedModelScans(t, "ineos-grenadier", { total: 50, unique: 10 });

  const tied = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: liveNow });
  expect(tied).toMatchObject({
    status: "unchanged",
    leaderSlug: "ineos-grenadier",
    previousHolderSlug: "ineos-grenadier",
    changed: false,
  });
});

test("popular model leader: a withdrawn model is never chosen", async () => {
  const { t, liveNow } = await setupAmfWithModels();
  await seedModelScans(t, "ineos-grenadier", { total: 200, unique: 150 });
  await seedModelScans(t, "skoda-kodiaq", { total: 80, unique: 70 });

  await t.run(async (ctx) => {
    const grenadier = await ctx.db
      .query("fairEventModels")
      .filter((q) => q.eq(q.field("slug"), "ineos-grenadier"))
      .first();
    await ctx.db.patch(grenadier!._id, { status: "withdrawn", highlight: "most_popular" });
  });

  const res = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: liveNow });
  expect(res).toMatchObject({
    status: "updated",
    leaderSlug: "skoda-kodiaq",
    changed: true,
  });

  const highlighted = await t.run(async (ctx) => {
    const models = await ctx.db.query("fairEventModels").collect();
    return models.filter((m) => m.highlight !== undefined).map((m) => [m.slug, m.highlight]);
  });
  expect(highlighted).toEqual([["skoda-kodiaq", "most_popular"]]);
});

test("popular model leader: nothing is written when the holder is unchanged", async () => {
  const { t, liveNow } = await setupAmfWithModels();
  await seedModelScans(t, "ineos-grenadier", { total: 90, unique: 70 });

  const first = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: liveNow });
  expect(first).toMatchObject({ status: "updated", leaderSlug: "ineos-grenadier", changed: true });

  const snapshotBefore = await t.run(async (ctx) => {
    const models = await ctx.db.query("fairEventModels").collect();
    return models.map((m) => ({ id: m._id, highlight: m.highlight, updatedAt: m.updatedAt }));
  });

  const laterNow = liveNow + 300_000;
  const second = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: laterNow });
  expect(second).toMatchObject({ status: "unchanged", leaderSlug: "ineos-grenadier", changed: false });

  const snapshotAfter = await t.run(async (ctx) => {
    const models = await ctx.db.query("fairEventModels").collect();
    return models.map((m) => ({ id: m._id, highlight: m.highlight, updatedAt: m.updatedAt }));
  });
  expect(snapshotAfter).toEqual(snapshotBefore);
});

test("popular model leader: no runs outside the event window (and keeps final leader after endsAt)", async () => {
  const { t, liveNow } = await setupAmfWithModels();
  await seedModelScans(t, "ineos-grenadier", { total: 60, unique: 50 });
  await t.mutation(internal.fairSetup.recomputePopularModelHighlight, { now: liveNow });

  // Another model gets more scans, but we call recompute before startsAt and after endsAt.
  await seedModelScans(t, "skoda-kodiaq", { total: 120, unique: 100 });
  const event = await t.run((ctx) =>
    ctx.db
      .query("fairEvents")
      .withIndex("by_code", (q) => q.eq("code", "auto-moto-fest-2026"))
      .unique(),
  );

  const beforeStart = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, {
    now: event!.startsAt - 1,
  });
  expect(beforeStart).toMatchObject({ status: "skipped_outside_window", changed: false });

  const atEnd = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, {
    now: event!.endsAt,
  });
  expect(atEnd).toMatchObject({ status: "skipped_outside_window", changed: false });

  const afterEnd = await t.mutation(internal.fairSetup.recomputePopularModelHighlight, {
    now: event!.endsAt + 60_000,
  });
  expect(afterEnd).toMatchObject({ status: "skipped_outside_window", changed: false });

  // Badge stays on ineos-grenadier.
  const highlighted = await t.run(async (ctx) => {
    const models = await ctx.db.query("fairEventModels").collect();
    return models.filter((m) => m.highlight !== undefined).map((m) => m.slug);
  });
  expect(highlighted).toEqual(["ineos-grenadier"]);
});
