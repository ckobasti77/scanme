/// <reference types="vite/client" />

// Sajam elektromobilnosti 2026 — the real-event setup is idempotent and the
// committed intake payload imports and publishes cleanly on top of it.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { FairImportPayload } from "./fairImport";
import payloadJson from "../docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json";

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
