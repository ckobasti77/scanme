/// <reference types="vite/client" />

// Sajam 2026 B1 — the DEV TEST catalog is idempotent, clearly TEST-labelled,
// covers both events and all three packages, and creates no QR identity.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { isFairMapStandLocation } from "../lib/fair-map";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-03T10:00:00Z");
const ADMIN_EMAIL = "fair-fixture@scanme.test";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

test("seedTestCatalog is idempotent and only writes TEST fixtures", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const adminId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  const first = await t.mutation(internal.fairDevFixtures.seedTestCatalog, {});
  expect(first).toMatchObject({
    events: { created: 2 }, days: { created: 6 }, clients: { created: 3 }, brands: { created: 3 },
    participations: { created: 4 }, stands: { created: 5 }, models: { created: 10 }, publishedNow: 10,
  });
  const rows = await t.run(async (ctx) => ({
    events: await ctx.db.query("fairEvents").collect(),
    models: await ctx.db.query("fairEventModels").collect(),
    stands: await ctx.db.query("fairStands").collect(),
    accounts: await ctx.db.query("accounts").collect(),
    cards: await ctx.db.query("cards").collect(),
    assignments: await ctx.db.query("fairQrAssignments").collect(),
  }));
  expect(rows.events.every((e) => e.code.startsWith("test-") && e.slug.startsWith("test-") && e.title.startsWith("TEST"))).toBe(true);
  expect(rows.models.every((m) => m.externalKey.startsWith("test-") && m.slug.startsWith("test-") && m.displayName.startsWith("TEST") && m.status === "published")).toBe(true);
  expect(new Set(rows.models.map((m) => m.packageTier))).toEqual(new Set(["included", "starter", "advanced"]));
  expect(rows.models.every((m) => m.specifications.every((s) => s.label.startsWith("TEST") && s.value.startsWith("TEST")) && m.photoUrl === undefined)).toBe(true);
  // M0: every TEST stand sits on a real stand location of its own event's map.
  const eventCode = new Map(rows.events.map((e) => [e._id, e.code]));
  expect(rows.stands.every((s) => s.externalKey.startsWith("test-") && isFairMapStandLocation(eventCode.get(s.eventId) ?? "", s.mapLocationId))).toBe(true);
  expect(rows.accounts.every((a) => a.name.startsWith("TEST") && a.clientSegment === "event_only")).toBe(true);
  expect(rows.cards).toEqual([]);
  expect(rows.assignments).toEqual([]);

  const second = await t.mutation(internal.fairDevFixtures.seedTestCatalog, {});
  expect(second).toMatchObject({
    events: { created: 0, updated: 0 }, days: { created: 0, updated: 0 }, clients: { created: 0, unchanged: 3 }, brands: { created: 0, unchanged: 3 },
    participations: { created: 0, updated: 0, unchanged: 4 }, stands: { created: 0, updated: 0, unchanged: 5 }, models: { created: 0, updated: 0, unchanged: 10 },
    activations: first.activations, publishedNow: 0,
  });
  // Event-only TEST clients never reach the regular Clients directory.
  const admin = t.withIdentity({ subject: adminId, issuer: "https://fair-fixture.test" });
  expect((await admin.query(api.adminReadModels.listClients, { paginationOpts: { numItems: 50, cursor: null }, status: "all", sort: "name" })).page).toEqual([]);
});

test("seedShowcaseCatalog creates five source-based TEST exhibitors and complete review data idempotently", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));

  const first = await t.mutation(internal.fairDevFixtures.seedShowcaseCatalog, {});
  expect(first).toMatchObject({
    clients: { created: 6 },
    brands: { created: 5 },
    days: { created: 3 },
    participations: { created: 5 },
    stands: { created: 5 },
    models: { created: 10 },
    publishedNow: 10,
    qr: { created: 10, unchanged: 0 },
    passport: { created: true, requiredModels: 2 },
    leadConfigs: { created: 10, unchanged: 0 },
    surveys: { created: 3, unchanged: 0 },
    questions: { created: 7, unchanged: 0 },
    snapshot: { created: true, items: 3 },
  });
  const rows = await t.run(async (ctx) => ({
    accounts: await ctx.db.query("accounts").collect(),
    models: await ctx.db.query("fairEventModels").collect(),
    stands: await ctx.db.query("fairStands").collect(),
  }));
  const names = rows.accounts.map((row) => row.name);
  expect(names).toEqual(expect.arrayContaining(["TEST Toyota", "TEST Citroën", "TEST BYD", "TEST Geely", "TEST Ford"]));
  expect(rows.models).toHaveLength(10);
  expect(new Set(rows.models.map((row) => row.packageTier))).toEqual(new Set(["included", "starter", "advanced"]));
  expect(new Set(rows.stands.map((row) => row.mapLocationId))).toEqual(new Set(["hala-1", "hala-2", "hala-3", "hala-5", "hala-6-7"]));

  const second = await t.mutation(internal.fairDevFixtures.seedShowcaseCatalog, {});
  expect(second).toMatchObject({
    clients: { created: 0, unchanged: 6 },
    brands: { created: 0, unchanged: 5 },
    days: { created: 0, updated: 0, unchanged: 3 },
    participations: { created: 0, updated: 0, unchanged: 5 },
    stands: { created: 0, updated: 0, unchanged: 5 },
    models: { created: 0, updated: 0, unchanged: 10 },
    publishedNow: 0,
    qr: { created: 0, unchanged: 10 },
    passport: { created: false, requiredModels: 2 },
    leadConfigs: { created: 0, unchanged: 10 },
    surveys: { created: 0, unchanged: 3 },
    questions: { created: 0, unchanged: 7 },
    snapshot: { created: false, items: 3 },
  });
});

test("seedElectromobilityReviewCatalog creates real JMEV and BYD review models idempotently", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));

  const first = await t.mutation(internal.fairDevFixtures.seedElectromobilityReviewCatalog, {});
  expect(first).toMatchObject({
    clients: { created: 2, unchanged: 0 },
    brands: { created: 2, unchanged: 0 },
    participations: { created: 2 },
    stands: { created: 2 },
    models: { created: 5 },
    publishedNow: 5,
    passports: [
      { brand: "TEST JMEV", created: true, requiredModels: 3 },
      { brand: "TEST BYD", created: true, requiredModels: 2 },
    ],
  });
  const rows = await t.run(async (ctx) => ({
    models: await ctx.db.query("fairEventModels").collect(),
    stands: await ctx.db.query("fairStands").collect(),
    leadConfigs: await ctx.db.query("fairLeadConfigs").collect(),
    surveys: await ctx.db.query("fairSurveys").collect(),
    questions: await ctx.db.query("fairAudienceQuestions").collect(),
    snapshots: await ctx.db.query("fairSponsoredSnapshots").collect(),
    snapshotItems: await ctx.db.query("fairSponsoredSnapshotItems").collect(),
  }));
  const jmev = rows.models.filter((model) => model.displayName.startsWith("TEST JMEV"));
  expect(jmev).toHaveLength(3);
  expect(jmev.every((model) => model.packageTier === "advanced" && model.passportEligible)).toBe(true);
  expect(jmev.find((model) => model.displayName.endsWith("EWIND"))?.specifications)
    .toEqual(expect.arrayContaining([expect.objectContaining({ label: "Domet (CLTC)", value: "610 km" })]));
  expect(new Set(rows.stands.map((stand) => stand.mapLocationId))).toEqual(new Set(["hala-12", "ispred-14"]));
  expect(rows.leadConfigs).toHaveLength(8);
  expect(rows.surveys).toHaveLength(3);
  expect(rows.questions).toHaveLength(5);
  expect(rows.snapshots).toHaveLength(1);
  expect(rows.snapshotItems).toHaveLength(3);

  const elight = await t.query(api.fairPublic.getModelBySlug, {
    eventSlug: "test-elektromobilnost-2026",
    modelSlug: "test-jmev-elight",
  });
  expect(elight?.capabilities).toEqual({
    ratingMode: "dimensions",
    canSubmitInterest: true,
    canRequestTestDrive: true,
    hasAudienceQuestions: true,
    hasSurvey: true,
    isSponsored: true,
  });

  const catalog = await t.query(api.fairPublic.getPassportCatalog, { eventSlug: "test-elektromobilnost-2026" });
  expect(catalog?.catalog.map((passport) => [passport.brandName, passport.models.length]))
    .toEqual([["TEST JMEV", 3], ["TEST BYD", 2]]);

  const second = await t.mutation(internal.fairDevFixtures.seedElectromobilityReviewCatalog, {});
  expect(second).toMatchObject({
    clients: { created: 0, unchanged: 2 },
    brands: { created: 0, unchanged: 2 },
    participations: { created: 0, updated: 0, unchanged: 2 },
    stands: { created: 0, updated: 0, unchanged: 2 },
    models: { created: 0, updated: 0, unchanged: 5 },
    publishedNow: 0,
    passports: [
      { brand: "TEST JMEV", created: false, requiredModels: 3 },
      { brand: "TEST BYD", created: false, requiredModels: 2 },
    ],
  });
  const rowsAfterSecondSeed = await t.run(async (ctx) => ({
    leadConfigs: await ctx.db.query("fairLeadConfigs").collect(),
    surveys: await ctx.db.query("fairSurveys").collect(),
    questions: await ctx.db.query("fairAudienceQuestions").collect(),
    snapshots: await ctx.db.query("fairSponsoredSnapshots").collect(),
    snapshotItems: await ctx.db.query("fairSponsoredSnapshotItems").collect(),
  }));
  expect(rowsAfterSecondSeed).toMatchObject({
    leadConfigs: expect.arrayContaining(rows.leadConfigs),
    surveys: expect.arrayContaining(rows.surveys),
    questions: expect.arrayContaining(rows.questions),
    snapshots: expect.arrayContaining(rows.snapshots),
    snapshotItems: expect.arrayContaining(rows.snapshotItems),
  });
  expect(rowsAfterSecondSeed.leadConfigs).toHaveLength(8);
  expect(rowsAfterSecondSeed.surveys).toHaveLength(3);
  expect(rowsAfterSecondSeed.questions).toHaveLength(5);
  expect(rowsAfterSecondSeed.snapshots).toHaveLength(1);
  expect(rowsAfterSecondSeed.snapshotItems).toHaveLength(3);
});

test("seedTestPassport publishes one TEST brand passport, idempotently, visible on the event map", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  await t.mutation(internal.fairDevFixtures.seedTestCatalog, {});
  const first = await t.mutation(internal.fairDevFixtures.seedTestPassport, {});
  expect(first.created).toBe(true);
  expect(first.requiredModelIds).toHaveLength(2);
  const second = await t.mutation(internal.fairDevFixtures.seedTestPassport, {});
  expect(second).toEqual({ ...first, created: false });
  const catalog = await t.query(api.fairPublic.getPassportCatalog, { eventSlug: "test-elektromobilnost-2026" });
  expect(catalog?.catalog).toEqual([expect.objectContaining({ brandName: "TEST Volta", standMapLocationIds: ["hala-12"] })]);
  // The passport brand's stand is on the public map, keyed by the same mapLocationId.
  const map = await t.query(api.fairPublic.getEventMap, { eventSlug: "test-elektromobilnost-2026" });
  expect(map?.stands.map((stand) => stand.mapLocationId).sort()).toEqual(["hala-12", "ispred-14", "ispred-18"]);
  await expect(t.mutation(internal.fairDevFixtures.seedTestPassport, { eventCode: "elektromobilnost-2026" })).rejects.toThrow("fair_dev_fixture_not_test");
  // TEST Amper has an included model: not eligible, nothing written.
  await expect(t.mutation(internal.fairDevFixtures.seedTestPassport, { brandName: "TEST Amper" })).rejects.toThrow("fair_dev_fixture_passport_not_eligible");
  expect(await t.run((ctx) => ctx.db.query("fairPassportConfigs").collect())).toHaveLength(1);
});

test("seedTestSponsoredSnapshot publishes the TEST Advanced models with a no-vote TEST question, idempotently", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  await t.mutation(internal.fairDevFixtures.seedTestCatalog, {});
  const first = await t.mutation(internal.fairDevFixtures.seedTestSponsoredSnapshot, {});
  expect(first).toMatchObject({ created: true, version: 1, questionsCreated: 2 });
  const rotation = await t.query(api.fairPublic.getSponsoredMapRotation, { eventSlug: "test-elektromobilnost-2026" });
  expect(rotation).toMatchObject({ surface: "map", intervalMs: 12000, version: 1 });
  expect(rotation!.items.map((item) => item.eventModelId)).toEqual(first.eventModelIds);
  expect(rotation!.items.map((item) => item.displayName).sort()).toEqual(["TEST Om Z1", "TEST Volta X1"]);
  for (const item of rotation!.items) {
    expect(item.visual).toBe("event_placeholder");
    expect(item.audienceResult?.result.state).toBe("waiting_for_minimum");
    expect(["hala-12", "ispred-18"]).toContain(item.standMapLocationId);
  }
  expect(await t.mutation(internal.fairDevFixtures.seedTestSponsoredSnapshot, {})).toEqual({ ...first, created: false, questionsCreated: 0 });
  await expect(t.mutation(internal.fairDevFixtures.seedTestSponsoredSnapshot, { eventCode: "elektromobilnost-2026" })).rejects.toThrow("fair_dev_fixture_not_test");
  const rows = await t.run(async (ctx) => ({
    snapshots: await ctx.db.query("fairSponsoredSnapshots").collect(),
    votes: await ctx.db.query("fairAudienceVotes").collect(),
    events: await ctx.db.query("fairSponsoredEvents").collect(),
  }));
  expect(rows.snapshots.filter((row) => row.status === "published")).toHaveLength(1);
  expect(rows.votes).toEqual([]);
  expect(rows.events).toEqual([]);
});
