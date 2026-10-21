/// <reference types="vite/client" />

// ADMIN v2 X3 — the two new reads of `Događaji → Analitika`
// (getEventEngagement, getModelAnalytics): admin only, read only, capped, and
// counted like the two existing reads: from the analytics cutoff, without
// admin rows, in Europe/Belgrade days and hours. Every name and number here
// is a TEST value.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
import { getEventAnalytics, getEventAudience, getEventEngagement, getModelAnalytics } from "./fairEventAnalytics";
import { FAIR_ENGAGEMENT_CAPS, FAIR_MODEL_ANALYTICS_CAPS, loadFairEngagement, loadFairModelAnalytics } from "./lib/fairEventAnalytics";
import { FAIR_COUNT_SHARDS } from "./lib/fairCountShards";
import { FAIR_PII_PURGE_AT_MS } from "../lib/fair-contract";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const at = (local: string) => Date.parse(`${local}:00+02:00`);
const SETUP_AT = at("2026-10-09T06:00");
const CUTOFF = at("2026-10-09T08:00");
const PRE_EVENT = at("2026-10-09T07:40");
const NINE = at("2026-10-09T09:15");
const ELEVEN = at("2026-10-09T11:20");
const NOON = at("2026-10-09T12:00");
const DAY_ONE_START = at("2026-10-09T00:00");
const DAY_MS = 86_400_000;
const ADMIN_EMAIL = "fair-analytics-v2@scanme.test";
const ISSUER = "https://fair-analytics-v2.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(SETUP_AT);
});
afterEach(() => vi.useRealTimers());

const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);

type Stand = { code: string; location: string; models: number };

/** A TEST event with three fair days; `withQr` gives every model a sticker so it can be scanned through /r. */
async function setup(stands: Stand[] = [{ code: "9", location: "hala-9", models: 2 }], withQr = true) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "clan@example.invalid" });
    const client = async (code: string, brandName: string | null) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: SETUP_AT, updatedAt: SETUP_AT,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: SETUP_AT,
      });
      const brandId = brandName
        ? await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: SETUP_AT, updatedAt: SETUP_AT })
        : null;
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("VA", "TEST Volta"), inventory: await client("VQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "elektromobilnost-2026", slug: "elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: DAY_ONE_START, endsAt: DAY_ONE_START + 3 * DAY_MS, status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  for (const [index, dateKey] of ["2026-10-09", "2026-10-10", "2026-10-11"].entries()) {
    await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey, label: `TEST dan ${index + 1}`, sortOrder: index + 1 });
  }
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: "test-v2-a", accountId: ids.a.accountId, businessId: ids.a.businessId });
  let qr = 0;
  const models: Array<{ id: Id<"fairEventModels">; code: string; standId: Id<"fairStands">; tier: "included" | "starter" | "advanced" }> = [];
  const standIds: Id<"fairStands">[] = [];
  for (const stand of stands) {
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: `test-v2-${stand.code.toLowerCase()}`, code: stand.code, displayName: `TEST ${stand.code}`, mapLocationId: stand.location });
    standIds.push(standId);
    for (let index = 0; index < stand.models; index += 1) {
      const key = `test-v2-${stand.code.toLowerCase()}-${index + 1}`;
      const tier = stand.code === "9" && index === 0 ? "advanced" : "included";
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: ids.a.brandId!, externalKey: key, displayName: `TEST ${key}`, priceText: "TEST cena",
        specifications: [{ label: "TEST", value: "TEST", order: 1, isHighlight: true }], packageTier: tier, passportEligible: false,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      let code = "";
      if (withQr) {
        const digitalQrId = await admin.mutation(api.adminProducts.createDigital, { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-v2-${++qr}` });
        code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
        await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
      }
      models.push({ id: modelId, code, standId, tier });
    }
  }
  return { t, admin, member, ids, eventId, participationId, brandId: ids.a.brandId!, models, standIds };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

let requestSequence = 0;
async function scanAt(f: Fixture, when: number, code: string, visitorHash: string, as: "visitor" | "admin" | "bot" = "visitor") {
  vi.setSystemTime(when);
  return (as === "admin" ? f.admin : f.t).mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-v2-request-${++requestSequence}`, deviceCategory: as === "admin" ? "desktop" : as === "bot" ? "bot" : "mobile", ipHash: "test-hall-nat",
    fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}

const visitorId = (f: Fixture, hash: string) =>
  f.t.run(async (ctx) => (await ctx.db.query("fairVisitors").withIndex("by_visitorHash", (q) => q.eq("visitorHash", hash)).unique())!._id);

async function insertRating(f: Fixture, input: { visitor: Id<"fairVisitors">; model: Id<"fairEventModels">; value: number; createdAt: number; updatedAt?: number; admin?: boolean }) {
  await f.t.run(async (ctx) => {
    await ctx.db.insert("fairRatings", {
      visitorId: input.visitor, eventId: f.eventId, eventModelId: input.model, overall: input.value, createdAt: input.createdAt, updatedAt: input.updatedAt ?? input.createdAt,
      ...(input.admin ? { isAdminExcluded: true } : {}),
    });
  });
}

let leadSequence = 0;
async function insertLead(f: Fixture, input: { visitor: Id<"fairVisitors">; model: Id<"fairEventModels">; createdAt: number; kind?: "interest" | "test_drive"; admin?: boolean }) {
  await f.t.run(async (ctx) => {
    await ctx.db.insert("fairLeads", {
      submissionId: `test-v2-lead-${++leadSequence}`, kind: input.kind ?? "interest", visitorId: input.visitor, eventId: f.eventId, eventModelId: input.model, participationId: f.participationId,
      contactName: "TEST posetilac", email: "posetilac@example.invalid", consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST saglasnost", consentedAt: input.createdAt,
      status: "received", followUpSuppressed: false, createdAt: input.createdAt, purgeAt: FAIR_PII_PURGE_AT_MS,
      ...(input.admin ? { isAdminExcluded: true } : {}),
    });
  });
}

const engagement = (f: Fixture, when: number) => f.admin.query(api.fairEventAnalytics.getEventEngagement, { eventId: f.eventId, at: when });
const modelAnalytics = (f: Fixture, model: Id<"fairEventModels">, when: number) => f.admin.query(api.fairEventAnalytics.getModelAnalytics, { eventId: f.eventId, eventModelId: model, at: when });

describe("ADMIN v2 X3: the new analytics reads are admin only and read only", () => {
  test("an anonymous and a non-admin caller are refused; a model of another event is not found", async () => {
    const f = await setup();
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairEventAnalytics.getEventEngagement, { eventId: f.eventId, at: NOON })).rejects.toThrow();
      await expect(caller.query(api.fairEventAnalytics.getModelAnalytics, { eventId: f.eventId, eventModelId: f.models[0].id, at: NOON })).rejects.toThrow();
    }
    const { eventId: other } = await f.admin.mutation(api.fairAdmin.upsertEvent, {
      code: "test-drugi-2026", slug: "test-drugi-2026", title: "TEST drugi", venueName: "TEST hala", startsAt: DAY_ONE_START, endsAt: DAY_ONE_START + DAY_MS, status: "published", garagePriority: 2,
      qrInventoryBusinessId: f.ids.inventory.businessId,
    });
    await expect(f.admin.query(api.fairEventAnalytics.getModelAnalytics, { eventId: other, eventModelId: f.models[0].id, at: NOON })).rejects.toThrow(/FAIR_MODEL_NOT_FOUND/);
  });

  test("both are queries: they are registered as queries and write nothing", async () => {
    expect((getEventEngagement as unknown as { isQuery?: boolean }).isQuery).toBe(true);
    expect((getModelAnalytics as unknown as { isQuery?: boolean }).isQuery).toBe(true);
    const f = await setup();
    await scanAt(f, NINE, f.models[0].code, visitor());
    const count = () => f.t.run(async (ctx) => {
      let rows = 0;
      for (const table of ["fairUniqueScans", "fairScanEvents", "fairMetricCountShards", "fairRatings", "fairLeads", "fairPassportStamps", "fairVisitors"] as const) rows += (await ctx.db.query(table).collect()).length;
      return rows;
    });
    const before = await count();
    await engagement(f, NOON);
    await modelAnalytics(f, f.models[0].id, NOON);
    expect(await count()).toBe(before);
  });
});

describe("ADMIN v2 X3: aggregations", () => {
  test("empty: an event with models and no scan gives zeros, never NaN", async () => {
    const f = await setup();
    const data = await engagement(f, NOON);
    expect(data.days).toEqual([
      { dateKey: "2026-10-09", label: "TEST dan 1", visitors: 0, leads: 0 },
      { dateKey: "2026-10-10", label: "TEST dan 2", visitors: 0, leads: 0 },
      { dateKey: "2026-10-11", label: "TEST dan 3", visitors: 0, leads: 0 },
    ]);
    expect(data.models).toHaveLength(2);
    for (const row of data.models) expect(row.scansByDay).toEqual([0, 0, 0]);
    expect(data.depth).toEqual({ one: 0, two: 0, three: 0, fourPlus: 0, visitors: 0 });
    expect(data.engaged).toEqual({ visitors: 0, rating: 0, vote: 0, survey: 0, lead: 0 });
    expect(data.stampVisitors).toBe(0);
    expect(data.packages).toEqual([
      { tier: "advanced", models: 1, scans: 0, scansPerModel: 0 },
      { tier: "included", models: 1, scans: 0, scansPerModel: 0 },
    ]);
    expect(Object.values(data.capped)).toEqual([false, false, false, false, false, false, false]);

    const model = await modelAnalytics(f, f.models[0].id, NOON);
    expect(model.days.map((day) => [day.scans, day.uniquePerModel])).toEqual([[0, 0], [0, 0], [0, 0]]);
    // The hours of the first day from 08:00 up to the read; the later days have not come.
    expect(model.hours.map((row) => [row.dateKey, row.hour, row.scans])).toEqual([8, 9, 10, 11, 12].map((hour) => ["2026-10-09", hour, 0]));
    expect(model.ratings).toEqual({ count: 0, average: null, buckets: [0, 0, 0, 0, 0], capped: false });
    expect(model.votes).toEqual({ total: 0, questions: [] });
    expect(model.leads).toEqual({ total: 0, interest: 0, testDrive: 0, capped: false });
    expect(JSON.stringify([data, model])).not.toMatch(/NaN|null,"scans"/);
  });

  test("pre-event and admin rows never count; a rating changed after the opening stays pre-event", async () => {
    const f = await setup();
    const [first, second] = f.models;
    const early = visitor();
    const anna = visitor();
    const boris = visitor();
    await scanAt(f, PRE_EVENT, first.code, early); // before 08:00
    await scanAt(f, NINE, first.code, anna);
    await scanAt(f, NINE, first.code, anna); // repeated: a scan, not a new unique
    await scanAt(f, ELEVEN, second.code, anna);
    await scanAt(f, ELEVEN, first.code, boris);
    await scanAt(f, ELEVEN, second.code, visitor(), "admin"); // audit row only
    const [earlyId, annaId, borisId] = await Promise.all([visitorId(f, early), visitorId(f, anna), visitorId(f, boris)]);
    await insertRating(f, { visitor: earlyId, model: first.id, value: 5, createdAt: PRE_EVENT, updatedAt: NINE }); // pre-event by its creation
    await insertRating(f, { visitor: annaId, model: first.id, value: 4.5, createdAt: NINE });
    await insertRating(f, { visitor: borisId, model: first.id, value: 2, createdAt: NINE, admin: true });
    await insertLead(f, { visitor: earlyId, model: first.id, createdAt: PRE_EVENT });
    await insertLead(f, { visitor: borisId, model: first.id, createdAt: ELEVEN, kind: "test_drive" });
    await insertLead(f, { visitor: annaId, model: first.id, createdAt: ELEVEN, admin: true });

    vi.setSystemTime(NOON);
    const data = await engagement(f, NOON);
    const analytics = await f.admin.query(api.fairEventAnalytics.getEventAnalytics, { eventId: f.eventId, at: NOON });
    // The same scans as the existing read: 3 on the first model, 1 on the second.
    expect(data.models.find((row) => row.eventModelId === first.id)!.scansByDay).toEqual([3, 0, 0]);
    expect(data.models.find((row) => row.eventModelId === second.id)!.scansByDay).toEqual([1, 0, 0]);
    expect(data.models.reduce((sum, row) => sum + row.scansByDay[0], 0)).toBe(analytics.kpis.scans.total);
    // Anna (two models) and Boris (one); the pre-event visitor and the admin are not visitors of the fair.
    expect(data.depth).toEqual({ one: 1, two: 1, three: 0, fourPlus: 0, visitors: 2 });
    expect(data.days.map((day) => day.visitors)).toEqual([2, 0, 0]);
    expect(data.days.map((day) => day.leads)).toEqual([1, 0, 0]);
    // Engaged: Anna rated, Boris left a lead.
    expect(data.engaged).toEqual({ visitors: 2, rating: 1, vote: 0, survey: 0, lead: 1 });
    expect(data.packages).toEqual([
      { tier: "advanced", models: 1, scans: 3, scansPerModel: 3 },
      { tier: "included", models: 1, scans: 1, scansPerModel: 1 },
    ]);

    const model = await modelAnalytics(f, first.id, NOON);
    expect(model.days[0]).toMatchObject({ scans: 3, uniquePerModel: 2 });
    expect(model.hours.map((row) => [row.hour, row.scans, row.uniquePerModel])).toEqual([[8, 0, 0], [9, 2, 1], [10, 0, 0], [11, 1, 1], [12, 0, 0]]);
    expect(model.ratings).toEqual({ count: 1, average: 4.5, buckets: [0, 0, 0, 1, 0], capped: false });
    expect(model.leads).toEqual({ total: 1, interest: 0, testDrive: 1, capped: false });
  });

  test("bots: a bot scan is a scan like in the existing reads, and it is named apart in the devices", async () => {
    const f = await setup();
    const [first] = f.models;
    await scanAt(f, NINE, first.code, visitor());
    await scanAt(f, NINE, first.code, visitor(), "bot");
    vi.setSystemTime(NOON);
    const analytics = await f.admin.query(api.fairEventAnalytics.getEventAnalytics, { eventId: f.eventId, at: NOON });
    const audience = await f.admin.query(api.fairEventAnalytics.getEventAudience, { eventId: f.eventId, at: NOON });
    const data = await engagement(f, NOON);
    const model = await modelAnalytics(f, first.id, NOON);
    // The counters have no bot filter (B2): the new reads count exactly what the existing ones count…
    expect(analytics.kpis.scans.total).toBe(2);
    expect(data.models.find((row) => row.eventModelId === first.id)!.scansByDay[0]).toBe(2);
    expect(model.days[0].scans).toBe(2);
    expect(data.depth.visitors).toBe(audience.visitors.total);
    // …and the device share leaves the bot out and names it.
    expect(audience.devices).toMatchObject({ mobile: 1, bots: 1, sample: 2 });
  });

  test("a day and an hour are Europe/Belgrade: 23:30 belongs to its day, 00:30 to the next one", async () => {
    const f = await setup();
    const [first] = f.models;
    const late = visitor();
    const night = visitor();
    await scanAt(f, at("2026-10-09T23:30"), first.code, late); // 21:30 UTC, the same day everywhere
    await scanAt(f, at("2026-10-10T00:30"), first.code, night); // 22:30 UTC of 9 Oct: the 10th in Belgrade
    const nightId = await visitorId(f, night);
    await insertLead(f, { visitor: nightId, model: first.id, createdAt: at("2026-10-10T00:30") });
    const when = at("2026-10-10T12:00");
    vi.setSystemTime(when);
    const data = await engagement(f, when);
    expect(data.models.find((row) => row.eventModelId === first.id)!.scansByDay).toEqual([1, 1, 0]);
    expect(data.days.map((day) => [day.dateKey, day.visitors, day.leads])).toEqual([["2026-10-09", 1, 0], ["2026-10-10", 1, 1], ["2026-10-11", 0, 0]]);

    const model = await modelAnalytics(f, first.id, when);
    expect(model.days.map((day) => day.scans)).toEqual([1, 1, 0]);
    // The hour series runs from 08:00 of each day in Belgrade hours; 00:30 is in the day, not in the series.
    expect(model.hours.filter((row) => row.scans > 0)).toEqual([{ dateKey: "2026-10-09", hour: 23, scans: 1, uniquePerModel: 1 }]);
    expect(model.hours.filter((row) => row.dateKey === "2026-10-09").map((row) => row.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(model.hours.filter((row) => row.dateKey === "2026-10-10").map((row) => row.hour)).toEqual([8, 9, 10, 11, 12]);
    expect(model.hours.some((row) => row.dateKey === "2026-10-11")).toBe(false);
  });
});

describe("ADMIN v2 X3: every read is capped", () => {
  test("a cap that is hit stops the read and is returned as `capped`", async () => {
    const f = await setup();
    const [first, second] = f.models;
    const hashes = [visitor(), visitor(), visitor()];
    for (const hash of hashes) await scanAt(f, NINE, first.code, hash);
    await scanAt(f, ELEVEN, second.code, hashes[0]);
    const ids = await Promise.all(hashes.map((hash) => visitorId(f, hash)));
    for (const id of ids) {
      await insertRating(f, { visitor: id, model: first.id, value: 4, createdAt: NINE });
      await insertLead(f, { visitor: id, model: first.id, createdAt: NINE });
    }
    const read = (caps: Partial<typeof FAIR_ENGAGEMENT_CAPS>) => f.t.run(async (ctx) => {
      const event = (await ctx.db.get(f.eventId))!;
      const days = await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", f.eventId)).take(10);
      const models = [(await ctx.db.get(first.id))!, (await ctx.db.get(second.id))!];
      return loadFairEngagement(ctx as unknown as QueryCtx, { event, cutoff: CUTOFF, days, models }, { ...FAIR_ENGAGEMENT_CAPS, ...caps });
    });
    const full = await read({});
    expect(full.capped).toEqual({ days: false, visitors: false, ratings: false, votes: false, surveys: false, leads: false, stamps: false });
    expect(full.depth.visitors).toBe(3);
    expect(full.engaged).toMatchObject({ rating: 3, lead: 3 });

    // Four unique rows, a cap of two: two rows are counted and the result says it is partial.
    const capped = await read({ uniqueRows: 2, ratings: 1, leads: 2 });
    expect(capped.capped).toEqual({ days: false, visitors: true, ratings: true, votes: false, surveys: false, leads: true, stamps: false });
    expect(capped.depth.visitors).toBe(2);
    expect(capped.engaged.rating).toBeLessThanOrEqual(1);
    expect(capped.engaged.lead).toBeLessThanOrEqual(2);
    // A cap exactly at the number of rows is not partial.
    expect((await read({ uniqueRows: 4, ratings: 3, leads: 3 })).capped).toEqual(full.capped);
    // The opening day is read hour by hour (16 buckets from 08:00) and the two later days as one bucket each:
    // a budget of 18 ranges holds the series of one model, and no package average is made from a part.
    const narrow = await read({ counterRanges: 18 });
    expect(narrow.capped.days).toBe(true);
    expect(narrow.models).toHaveLength(1);
    expect(narrow.packages).toEqual([]);
    expect(full.models).toHaveLength(2);
    expect(full.packages).toHaveLength(2);

    const one = await f.t.run(async (ctx) => {
      const days = await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", f.eventId)).take(10);
      return loadFairModelAnalytics(ctx as unknown as QueryCtx, { cutoff: CUTOFF, days, model: (await ctx.db.get(first.id))!, at: NOON, firstHour: 8 }, { ...FAIR_MODEL_ANALYTICS_CAPS, ratings: 2, leads: 1 });
    });
    expect(one.ratings).toMatchObject({ count: 2, capped: true });
    expect(one.leads).toMatchObject({ total: 1, capped: true });
  });

  /**
   * The cost of one opening, measured on TEST rows in the shape of a three-day
   * fair: 15 models on 4 stands, 310 visitors with 431 visitor–model rows, 460
   * scans, 210 stamps. Counter shards are written as the worst case (as many
   * shard rows as scans of the bucket, up to all eight).
   */
  test("cost on a fair-shaped data set stays far below the Convex read limit", async () => {
    const f = await setup([{ code: "9", location: "hala-9", models: 3 }, { code: "6", location: "hala-6", models: 10 }, { code: "1B", location: "hala-1b", models: 1 }, { code: "1A", location: "hala-1a", models: 1 }], false);
    const scans = [91, 78, 72, 51, 38, 28, 27, 23, 17, 12, 9, 5, 4, 3, 2];
    const dayShare = [0.23, 0.385, 0.385];
    const fairHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    // Rows are written after the opening: a stamp is read by its creation time.
    vi.setSystemTime(NINE);
    await f.t.run(async (ctx) => {
      const bump = async (key: string, value: number) => {
        const shards = Math.min(FAIR_COUNT_SHARDS, value);
        for (let shard = 0; shard < shards; shard += 1) await ctx.db.insert("fairMetricCountShards", { key, shard, value: shard === 0 ? value - (shards - 1) : 1 });
      };
      const standTotals = new Map<string, number[]>();
      for (const [index, model] of f.models.entries()) {
        for (const metric of ["scan_total", "scan_unique"] as const) {
          const total = metric === "scan_total" ? scans[index] : Math.max(1, Math.round(scans[index] * 0.94));
          await bump(`${metric}:model:${model.id}`, total);
          for (const [dayIndex, dateKey] of ["2026-10-09", "2026-10-10", "2026-10-11"].entries()) {
            const perDay = Math.round(total * dayShare[dayIndex]);
            if (perDay > 0) await bump(`${metric}:model:${model.id}:${dateKey}`, perDay);
            const key = `${metric}:${model.standId}:${dateKey}`;
            const stand = standTotals.get(key) ?? fairHours.map(() => 0);
            for (const [hourIndex, hour] of fairHours.entries()) {
              const perHour = Math.round(perDay / fairHours.length + (hourIndex % 3 === 0 ? 0.4 : 0));
              if (perHour <= 0) continue;
              await bump(`${metric}:model:${model.id}:${dateKey}T${String(hour).padStart(2, "0")}`, perHour);
              stand[hourIndex] += perHour;
            }
            standTotals.set(key, stand);
          }
        }
      }
      for (const [key, hours] of standTotals) {
        const [metric, standId, dateKey] = key.split(":");
        await bump(`${metric}:stand:${standId}:${dateKey}`, hours.reduce((sum, value) => sum + value, 0));
        for (const [hourIndex, hour] of fairHours.entries()) if (hours[hourIndex] > 0) await bump(`${metric}:stand:${standId}:${dateKey}T${String(hour).padStart(2, "0")}`, hours[hourIndex]);
      }
      // 310 visitors: 222 with one model, 62 with two, 19 with three, 7 with four = 431 rows.
      let rows = 0;
      for (let index = 0; index < 310; index += 1) {
        const visitorRow = await ctx.db.insert("fairVisitors", { visitorHash: visitor(), firstSeenAt: NINE, lastSeenAt: NINE });
        const depth = index < 222 ? 1 : index < 284 ? 2 : index < 303 ? 3 : 4;
        const first = NINE + (index % 3) * DAY_MS + (index % 11) * 3_600_000;
        for (let step = 0; step < depth; step += 1) {
          const model = f.models[(index + step * 4) % f.models.length];
          await ctx.db.insert("fairUniqueScans", { visitorId: visitorRow, eventId: f.eventId, eventModelId: model.id, firstScannedAt: first, lastScannedAt: first, totalScanCount: 1 });
          rows += 1;
          if (rows <= 210) await ctx.db.insert("fairPassportStamps", { visitorId: visitorRow, eventId: f.eventId, brandId: f.brandId, eventModelId: model.id, scannedAt: first });
          if (rows <= 18) await ctx.db.insert("fairRatings", { visitorId: visitorRow, eventId: f.eventId, eventModelId: model.id, overall: 4.5, createdAt: first, updatedAt: first });
          if (rows <= 460) {
            await ctx.db.insert("fairScanEvents", {
              requestId: `test-v2-cost-${rows}`, visitorId: visitorRow, eventId: f.eventId, eventModelId: model.id, standId: model.standId, brandId: f.brandId, occurredAt: first,
              dateKey: "2026-10-09", hourKey: "2026-10-09T09", isAdminExcluded: false,
            });
          }
        }
      }
      expect(rows).toBe(431);
    });

    const when = at("2026-10-11T22:37");
    vi.setSystemTime(when);
    type Handler<Args> = { _handler: (ctx: QueryCtx, args: Args) => Promise<unknown> };
    const cost = (run: (ctx: QueryCtx) => Promise<unknown>) => f.admin.run(async (ctx) => {
      await run(ctx as unknown as QueryCtx);
      const metrics = await (ctx as unknown as QueryCtx).meta.getTransactionMetrics();
      return { documents: metrics.documentsRead.used, queries: metrics.databaseQueries.used, kilobytes: Math.round(metrics.bytesRead.used / 1024) };
    });
    const args = { eventId: f.eventId, at: when };
    const costs = {
      getEventAnalytics: await cost((ctx) => (getEventAnalytics as unknown as Handler<typeof args>)._handler(ctx, args)),
      getEventAudience: await cost((ctx) => (getEventAudience as unknown as Handler<typeof args>)._handler(ctx, args)),
      getEventEngagement: await cost((ctx) => (getEventEngagement as unknown as Handler<typeof args>)._handler(ctx, args)),
      getModelAnalytics: await cost((ctx) => (getModelAnalytics as unknown as Handler<typeof args & { eventModelId: Id<"fairEventModels"> }>)._handler(ctx, { ...args, eventModelId: f.models[0].id })),
    };
    console.info("ADMIN v2 X3 cost (TEST rows in the shape of a three-day fair):", JSON.stringify(costs));

    // The numbers of the new reads on this data set.
    const data = await engagement(f, when);
    expect(data.depth).toEqual({ one: 222, two: 62, three: 19, fourPlus: 7, visitors: 310 });
    expect(data.stampVisitors).toBeGreaterThan(0);
    expect(data.capped).toEqual({ days: false, visitors: false, ratings: false, votes: false, surveys: false, leads: false, stamps: false });
    // Convex stops a query at 32 000 documents read. One opening of Analitika is the two existing reads and the new one.
    const LIMIT = 32_000;
    expect(costs.getEventEngagement.documents).toBeLessThan(LIMIT / 8);
    expect(costs.getModelAnalytics.documents).toBeLessThan(LIMIT / 20);
    // …and at 4 096 index ranges, the tighter limit here (a counter bucket is one range).
    const RANGES = 4_096;
    expect(costs.getEventEngagement.queries).toBeLessThan(RANGES / 4);
    expect(costs.getModelAnalytics.queries).toBeLessThan(RANGES / 8);
    // The detail of a model never reads visitor rows: its cost does not grow with the number of visitors.
    expect(costs.getModelAnalytics.documents).toBeLessThan(costs.getEventEngagement.documents);
  }, 60_000);
});
