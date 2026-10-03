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
