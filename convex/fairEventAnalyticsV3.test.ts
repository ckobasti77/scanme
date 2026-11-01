/// <reference types="vite/client" />

// ADMIN v3 V3 — `fairEventAnalytics.getEventStandHours`, the Vremeplov of the
// admin hall: ONE fair day, hour by hour, per stand. Admin only, read only,
// capped, and counted like getEventAnalytics: from the analytics cutoff,
// without admin rows, in Europe/Belgrade days and hours. Every name and number
// here is a TEST value.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
import { FAIR_ANALYTICS_FIRST_HOUR, getEventAnalytics, getEventStandHours } from "./fairEventAnalytics";
import { FAIR_STAND_HOURS_CAPS, loadFairStandHours } from "./lib/fairEventAnalytics";
import { FAIR_COUNT_SHARDS } from "./lib/fairCountShards";

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
const DAY_ONE = "2026-10-09";
const DAY_TWO = "2026-10-10";
const ADMIN_EMAIL = "fair-analytics-v3@scanme.test";
const ISSUER = "https://fair-analytics-v3.test";
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
const THREE_STANDS: Stand[] = [
  { code: "9", location: "hala-9", models: 2 },
  { code: "6", location: "hala-6", models: 2 },
  { code: "1B", location: "hala-1b", models: 1 },
];

/** A TEST event with three fair days; `withQr` gives every model a sticker so it can be scanned through /r. */
async function setup(stands: Stand[] = THREE_STANDS, withQr = true) {
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
  for (const [index, dateKey] of [DAY_ONE, DAY_TWO, "2026-10-11"].entries()) {
    await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey, label: `TEST dan ${index + 1}`, sortOrder: index + 1 });
  }
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: "test-v3-a", accountId: ids.a.accountId, businessId: ids.a.businessId });
  let qr = 0;
  const models: Array<{ id: Id<"fairEventModels">; code: string; standId: Id<"fairStands">; standCode: string }> = [];
  const standIds: Id<"fairStands">[] = [];
  for (const stand of stands) {
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: `test-v3-${stand.code.toLowerCase()}`, code: stand.code, displayName: `TEST ${stand.code}`, mapLocationId: stand.location });
    standIds.push(standId);
    for (let index = 0; index < stand.models; index += 1) {
      const key = `test-v3-${stand.code.toLowerCase()}-${index + 1}`;
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: ids.a.brandId!, externalKey: key, displayName: `TEST ${key}`, priceText: "TEST cena",
        specifications: [{ label: "TEST", value: "TEST", order: 1, isHighlight: true }], packageTier: "included", passportEligible: false,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      let code = "";
      if (withQr) {
        const digitalQrId = await admin.mutation(api.adminProducts.createDigital, { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-v3-${++qr}` });
        code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
        await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
      }
      models.push({ id: modelId, code, standId, standCode: stand.code });
    }
  }
  return { t, admin, member, ids, eventId, participationId, brandId: ids.a.brandId!, models, standIds };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

let requestSequence = 0;
async function scanAt(f: Fixture, when: number, code: string, visitorHash: string, as: "visitor" | "admin" | "bot" = "visitor") {
  vi.setSystemTime(when);
  return (as === "admin" ? f.admin : f.t).mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-v3-request-${++requestSequence}`, deviceCategory: as === "admin" ? "desktop" : as === "bot" ? "bot" : "mobile", ipHash: "test-hall-nat",
    fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}

const standHours = (f: Fixture, dateKey: string, when: number) => f.admin.query(api.fairEventAnalytics.getEventStandHours, { eventId: f.eventId, dateKey, at: when });
const analytics = (f: Fixture, when: number) => f.admin.query(api.fairEventAnalytics.getEventAnalytics, { eventId: f.eventId, at: when });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** loadFairStandHours on the event's real stands, with the given caps. */
function loadWith(f: Fixture, dateKey: string, when: number, caps: Partial<typeof FAIR_STAND_HOURS_CAPS>, modelsCapped = false) {
  return f.t.run(async (ctx) => {
    const day = (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", f.eventId).eq("dateKey", dateKey)).unique())!;
    const stands = await Promise.all(f.standIds.map(async (id) => (await ctx.db.get(id))!));
    return loadFairStandHours(ctx as unknown as QueryCtx, { cutoff: CUTOFF, day, at: when, firstHour: FAIR_ANALYTICS_FIRST_HOUR, stands, modelsCapped }, { ...FAIR_STAND_HOURS_CAPS, ...caps });
  });
}

/** For every hour of `dateKey` the sum over stands equals the hour row of getEventAnalytics. */
async function expectSumsMatchAnalytics(f: Fixture, dateKey: string, when: number) {
  vi.setSystemTime(when);
  const data = await standHours(f, dateKey, when);
  const existing = (await analytics(f, when)).hours.filter((row) => row.dateKey === dateKey);
  expect(data.hours).toEqual(existing.map((row) => row.hour));
  data.hours.forEach((_, index) => {
    expect(data.stands.reduce((sum, stand) => sum + stand.scans[index], 0)).toBe(existing[index].scans);
    expect(data.stands.reduce((sum, stand) => sum + stand.uniquePerModel[index], 0)).toBe(existing[index].uniquePerModel);
  });
  return data;
}

describe("ADMIN v3 V3: getEventStandHours is admin only and read only", () => {
  test("an anonymous and a non-admin caller are refused", async () => {
    const f = await setup();
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairEventAnalytics.getEventStandHours, { eventId: f.eventId, dateKey: DAY_ONE, at: NOON })).rejects.toThrow();
    }
  });

  test("it is registered as a query and writes nothing", async () => {
    expect((getEventStandHours as unknown as { isQuery?: boolean }).isQuery).toBe(true);
    const f = await setup();
    await scanAt(f, NINE, f.models[0].code, visitor());
    const count = () => f.t.run(async (ctx) => {
      let rows = 0;
      for (const table of ["fairUniqueScans", "fairScanEvents", "fairMetricCountShards", "fairVisitors", "fairStands", "fairEventModels"] as const) rows += (await ctx.db.query(table).collect()).length;
      return rows;
    });
    const before = await count();
    await standHours(f, DAY_ONE, NOON);
    await standHours(f, DAY_TWO, at("2026-10-10T12:00"));
    expect(await count()).toBe(before);
  });
});

describe("ADMIN v3 V3: the hours and the stands", () => {
  test("empty: no scans gives the hours up to `at` and no stand", async () => {
    const f = await setup();
    const data = await standHours(f, DAY_ONE, NOON);
    expect(data).toEqual({ at: NOON, dateKey: DAY_ONE, hours: range(8, 12), stands: [], unread: 0, capped: false });
  });

  test("`at` before the opening: no hours", async () => {
    const f = await setup();
    await scanAt(f, NINE, f.models[0].code, visitor());
    expect(await standHours(f, DAY_ONE, PRE_EVENT)).toEqual({ at: PRE_EVENT, dateKey: DAY_ONE, hours: [], stands: [], unread: 0, capped: false });
    // Exactly at the cutoff the 08:00 hour has begun.
    expect((await standHours(f, DAY_ONE, CUTOFF)).hours).toEqual([8]);
  });

  test("an unknown day is an empty answer, not an error", async () => {
    const f = await setup();
    await scanAt(f, NINE, f.models[0].code, visitor());
    for (const dateKey of ["2026-10-12", "2026-10-08", "nije-dan", ""]) {
      expect(await standHours(f, dateKey, at("2026-10-11T22:00"))).toEqual({ at: at("2026-10-11T22:00"), dateKey, hours: [], stands: [], unread: 0, capped: false });
    }
  });

  test("a pre-event scan is not counted, the series starts at 08:00, and a stand with only pre-event scans is not returned", async () => {
    const f = await setup();
    const [nine1, , six1] = f.models; // stands 9 and 6
    await scanAt(f, PRE_EVENT, six1.code, visitor()); // only pre-event on stand 6
    await scanAt(f, PRE_EVENT, nine1.code, visitor());
    await scanAt(f, NINE, nine1.code, visitor());
    await scanAt(f, NINE, nine1.code, visitor());
    await scanAt(f, ELEVEN, nine1.code, visitor());
    const data = await expectSumsMatchAnalytics(f, DAY_ONE, NOON);
    expect(data.hours).toEqual(range(8, 12));
    expect(data.stands).toEqual([{ standCode: "9", mapLocationId: "hala-9", scans: [0, 2, 0, 1, 0], uniquePerModel: [0, 2, 0, 1, 0] }]);
    expect(data.unread).toBe(0);
    expect(data.capped).toBe(false);
  });

  test("an admin scan is not counted", async () => {
    const f = await setup();
    const [nine1, , six1] = f.models;
    await scanAt(f, ELEVEN, nine1.code, visitor());
    await scanAt(f, ELEVEN, nine1.code, visitor(), "admin");
    await scanAt(f, ELEVEN, six1.code, visitor(), "admin"); // a stand with only an admin scan
    const data = await expectSumsMatchAnalytics(f, DAY_ONE, NOON);
    expect(data.stands.map((stand) => [stand.standCode, stand.scans])).toEqual([["9", [0, 0, 0, 1, 0]]]);
  });

  test("a bot scan counts exactly as in getEventAnalytics (the counters have no bot filter)", async () => {
    const f = await setup();
    const [nine1] = f.models;
    await scanAt(f, NINE, nine1.code, visitor());
    await scanAt(f, NINE, nine1.code, visitor(), "bot");
    const data = await expectSumsMatchAnalytics(f, DAY_ONE, NOON);
    expect(data.stands[0].scans).toEqual([0, 2, 0, 0, 0]);
    expect((await analytics(f, NOON)).kpis.scans.total).toBe(2);
  });

  test("Belgrade time: 23:30 is hour 23 of its day, 00:30 belongs to the next day and is not in the 08:00+ series", async () => {
    const f = await setup();
    const [nine1] = f.models;
    await scanAt(f, at("2026-10-09T23:30"), nine1.code, visitor());
    await scanAt(f, at("2026-10-10T00:30"), nine1.code, visitor());
    const when = at("2026-10-10T12:00");
    const one = await expectSumsMatchAnalytics(f, DAY_ONE, when);
    expect(one.hours).toEqual(range(8, 23));
    expect(one.stands).toHaveLength(1);
    expect(one.stands[0].scans).toEqual(range(8, 23).map((hour) => (hour === 23 ? 1 : 0)));
    // The 10th: the series starts at 08:00, the 00:30 scan is in the day but outside the series, so the stand is not returned.
    const two = await expectSumsMatchAnalytics(f, DAY_TWO, when);
    expect(two.hours).toEqual(range(8, 12));
    expect(two.stands).toEqual([]);
  });

  test("the sum over stands equals getEventAnalytics.hours for every hour, on the opening day and on the next day (preselection)", async () => {
    const f = await setup();
    const [nine1, nine2, six1, six2, onb] = f.models;
    const plan: Array<[string, number, string]> = [
      ["2026-10-09T08:10", 0, nine1.code], ["2026-10-09T08:20", 1, nine1.code], ["2026-10-09T10:05", 2, nine2.code],
      ["2026-10-09T10:45", 3, six1.code], ["2026-10-09T10:50", 4, six1.code], ["2026-10-09T10:55", 5, six2.code], ["2026-10-09T22:00", 6, onb.code],
      ["2026-10-10T08:30", 7, six2.code], ["2026-10-10T08:40", 8, six2.code], ["2026-10-10T09:10", 9, six1.code], ["2026-10-10T11:00", 10, nine1.code], ["2026-10-10T11:30", 11, nine1.code], ["2026-10-10T11:40", 12, nine2.code],
    ];
    // A visitor scans a model twice at most: the repeat is a scan, not a unique.
    const people = Array.from({ length: 13 }, () => visitor());
    for (const [when, who, code] of plan) await scanAt(f, at(when), code, people[who]);
    await scanAt(f, at("2026-10-10T11:50"), nine1.code, people[10]); // repeat on the second day

    const dayOne = await expectSumsMatchAnalytics(f, DAY_ONE, at("2026-10-10T13:00"));
    expect(dayOne.hours).toEqual(range(8, 23));
    expect(dayOne.stands.map((stand) => stand.standCode)).toEqual(["6", "9", "1B"]); // 3, 3 and 1 scans: the tie goes by stand code
    expect(dayOne.stands.map((stand) => stand.scans.reduce((sum, value) => sum + value, 0))).toEqual([3, 3, 1]);

    const dayTwo = await expectSumsMatchAnalytics(f, DAY_TWO, at("2026-10-10T13:00"));
    expect(dayTwo.hours).toEqual(range(8, 13));
    // Preselection: by the day total, descending (stand 9: 4 scans, stand 6: 3), the stand with none left out.
    expect(dayTwo.stands.map((stand) => [stand.standCode, stand.scans.reduce((sum, value) => sum + value, 0)])).toEqual([["9", 4], ["6", 3]]);
    expect(dayTwo.stands.map((stand) => stand.uniquePerModel.reduce((sum, value) => sum + value, 0))).toEqual([3, 3]);
    expect(dayTwo.unread).toBe(0);
  });
});

describe("ADMIN v3 V3: the caps", () => {
  async function fillThreeStands() {
    const f = await setup();
    const [nine1, , six1, , onb] = f.models;
    // The opening day (no preselection): stand 6 has 3 scans, stand 9 has 2, stand 1B has 1.
    for (const code of [six1.code, six1.code, six1.code, nine1.code, nine1.code, onb.code]) await scanAt(f, at("2026-10-09T09:10"), code, visitor());
    // Day two (preselection): the same. The scans are made in time order (the other order left the first day empty).
    for (const code of [six1.code, six1.code, six1.code, nine1.code, nine1.code, onb.code]) await scanAt(f, at("2026-10-10T09:10"), code, visitor());
    return f;
  }
  const WHEN = at("2026-10-10T23:30");

  test("with the default caps nothing is unread or capped", async () => {
    const f = await fillThreeStands();
    for (const dateKey of [DAY_ONE, DAY_TWO]) {
      const data = await loadWith(f, dateKey, WHEN, {});
      expect(data).toMatchObject({ unread: 0, capped: false });
      expect(data.stands.map((stand) => stand.standCode)).toEqual(["6", "9", "1B"]);
      expect(data.stands.every((stand) => stand.uniquePerModel.length === stand.scans.length)).toBe(true);
    }
  });

  test("a day after the opening: the total budget keeps the strongest stands, the rest are unread", async () => {
    const f = await fillThreeStands();
    // 16 hours; two stands' hourly totals fit, and only one stand's uniques.
    const data = await loadWith(f, DAY_TWO, WHEN, { totalRanges: 32, uniqueRanges: 16 });
    expect(data.hours).toEqual(range(8, 23));
    expect(data.stands.map((stand) => stand.standCode)).toEqual(["6", "9"]);
    expect(data.unread).toBe(1);
    expect(data.capped).toBe(true);
    expect(data.stands[0].uniquePerModel).toHaveLength(16);
    expect(data.stands[1].uniquePerModel).toEqual([]);
    expect(data.stands[1].scans.reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  test("the opening day has no preselection: the stands go by code and a stand beyond the budget is unread", async () => {
    const f = await fillThreeStands();
    const data = await loadWith(f, DAY_ONE, WHEN, { totalRanges: 32 });
    // Stands by code 1B, 6, 9: the first two are read (1B has a scan, 6 has three), 9 did not fit.
    expect(data.stands.map((stand) => stand.standCode)).toEqual(["6", "1B"]);
    expect(data.unread).toBe(1);
    expect(data.capped).toBe(true);
  });

  test("the preselection cap leaves the stands it did not look at unread", async () => {
    const f = await fillThreeStands();
    const data = await loadWith(f, DAY_TWO, WHEN, { preselect: 1 });
    // By code the first stand is 1B: it is the only one looked at.
    expect(data.stands.map((stand) => stand.standCode)).toEqual(["1B"]);
    expect(data.unread).toBe(2);
    expect(data.capped).toBe(true);
  });

  test("a budget below one series reads nothing and says so", async () => {
    const f = await fillThreeStands();
    const data = await loadWith(f, DAY_TWO, WHEN, { totalRanges: 15 });
    expect(data.stands).toEqual([]);
    expect(data.unread).toBe(3);
    expect(data.capped).toBe(true);
  });

  test("more exhibited models than the stands were chosen from is `capped` even with nothing unread", async () => {
    const f = await fillThreeStands();
    expect(await loadWith(f, DAY_TWO, WHEN, {}, true)).toMatchObject({ unread: 0, capped: true });
    // No hours: capped still follows the models.
    expect(await loadWith(f, DAY_ONE, PRE_EVENT, {}, true)).toEqual({ hours: [], stands: [], unread: 0, capped: true });
  });
});

describe("ADMIN v3 V3: cost", () => {
  /**
   * TEST counters in the shape of a three-day fair: 4 stands, hours 08–19,
   * every bucket written as the worst case (as many shard rows as scans, up to
   * all eight). Measured with the transaction metrics of the real handler.
   */
  test("on a fair-shaped data set one read stays near 150 index ranges", async () => {
    const f = await setup([{ code: "9", location: "hala-9", models: 3 }, { code: "6", location: "hala-6", models: 10 }, { code: "1B", location: "hala-1b", models: 1 }, { code: "1A", location: "hala-1a", models: 1 }], false);
    // Invented totals: no number of a stand here is a number of a real stand.
    const standTotals = [200, 150, 90, 50];
    const dayShare = [0.23, 0.385, 0.385];
    const fairHours = range(8, 19);
    vi.setSystemTime(NINE);
    await f.t.run(async (ctx) => {
      const bump = async (key: string, value: number) => {
        const shards = Math.min(FAIR_COUNT_SHARDS, value);
        for (let shard = 0; shard < shards; shard += 1) await ctx.db.insert("fairMetricCountShards", { key, shard, value: shard === 0 ? value - (shards - 1) : 1 });
      };
      for (const [index, standId] of f.standIds.entries()) {
        for (const metric of ["scan_total", "scan_unique"] as const) {
          const total = metric === "scan_total" ? standTotals[index] : Math.round(standTotals[index] * 0.94);
          await bump(`${metric}:stand:${standId}`, total);
          for (const [dayIndex, dateKey] of [DAY_ONE, DAY_TWO, "2026-10-11"].entries()) {
            let day = 0;
            for (const [hourIndex, hour] of fairHours.entries()) {
              // The opening day starts at 08:00 too; every hour has a scan.
              const perHour = Math.max(1, Math.round((total * dayShare[dayIndex]) / fairHours.length + (hourIndex % 3 === 0 ? 0.4 : 0)));
              await bump(`${metric}:stand:${standId}:${dateKey}T${String(hour).padStart(2, "0")}`, perHour);
              day += perHour;
            }
            await bump(`${metric}:stand:${standId}:${dateKey}`, day);
          }
        }
      }
    });

    const when = at("2026-10-11T22:37");
    vi.setSystemTime(when);
    type Handler<Args> = { _handler: (ctx: QueryCtx, args: Args) => Promise<unknown> };
    const cost = (run: (ctx: QueryCtx) => Promise<unknown>) => f.admin.run(async (ctx) => {
      await run(ctx as unknown as QueryCtx);
      const metrics = await (ctx as unknown as QueryCtx).meta.getTransactionMetrics();
      return { documents: metrics.documentsRead.used, queries: metrics.databaseQueries.used, kilobytes: Math.round(metrics.bytesRead.used / 1024) };
    });
    const costs = {
      dayOne: await cost((ctx) => (getEventStandHours as unknown as Handler<{ eventId: Id<"fairEvents">; dateKey: string; at: number }>)._handler(ctx, { eventId: f.eventId, dateKey: DAY_ONE, at: when })),
      dayThree: await cost((ctx) => (getEventStandHours as unknown as Handler<{ eventId: Id<"fairEvents">; dateKey: string; at: number }>)._handler(ctx, { eventId: f.eventId, dateKey: "2026-10-11", at: when })),
      getEventAnalytics: await cost((ctx) => (getEventAnalytics as unknown as Handler<{ eventId: Id<"fairEvents">; at: number }>)._handler(ctx, { eventId: f.eventId, at: when })),
    };
    console.info("ADMIN v3 V3 getEventStandHours cost (TEST counters in the shape of a three-day fair):", JSON.stringify(costs));

    // The answer is the picture of the data: the sum over stands is getEventAnalytics for every hour of every day.
    for (const dateKey of [DAY_ONE, DAY_TWO, "2026-10-11"]) {
      const data = await expectSumsMatchAnalytics(f, dateKey, when);
      expect(data.stands).toHaveLength(4);
      expect(data.capped).toBe(false);
    }
    const RANGES = 4_096;
    const LIMIT = 32_000;
    for (const read of [costs.dayOne, costs.dayThree]) {
      expect(read.queries).toBeLessThan(RANGES / 16);
      expect(read.documents).toBeLessThan(LIMIT / 10);
    }
    // The opening day reads every stand hour by hour without the day counter; the later days add 4 ranges for it.
    expect(costs.dayThree.queries).toBeGreaterThan(costs.dayOne.queries - 8);
  }, 60_000);

  /** The worst case the caps allow: 150 stands with scans on a day after the opening, 16 hours each. */
  test("the worst case stays within 2 150 index ranges and far below the document limit", async () => {
    const f = await setup([{ code: "9", location: "hala-9", models: 1 }], false);
    const fake = Array.from({ length: 150 }, (_, index) => ({
      _id: `test-stand-${String(index).padStart(3, "0")}` as Id<"fairStands">,
      code: `T${String(index).padStart(3, "0")}`,
      mapLocationId: `test-loc-${index}`,
    }));
    await f.t.run(async (ctx) => {
      const bump = async (key: string, value: number) => {
        for (let shard = 0; shard < FAIR_COUNT_SHARDS; shard += 1) await ctx.db.insert("fairMetricCountShards", { key, shard, value });
      };
      // Every stand has the same day total, so they are read by code: the first 75 get their hours read and the
      // first 50 of those their unique. Only the rows the read can reach are written (the others would never be read).
      for (const [index, stand] of fake.entries()) {
        await bump(`scan_total:stand:${stand._id}:${DAY_TWO}`, 1);
        for (const hour of range(8, 23)) {
          if (index < 75) await bump(`scan_total:stand:${stand._id}:${DAY_TWO}T${String(hour).padStart(2, "0")}`, 1);
          if (index < 50) await bump(`scan_unique:stand:${stand._id}:${DAY_TWO}T${String(hour).padStart(2, "0")}`, 1);
        }
      }
    });
    const when = at("2026-10-10T23:30");
    const { data, metrics } = await f.admin.run(async (ctx) => {
      const day = (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", f.eventId).eq("dateKey", DAY_TWO)).unique()) as Doc<"fairEventDays">;
      const result = await loadFairStandHours(ctx as unknown as QueryCtx, { cutoff: CUTOFF, day, at: when, firstHour: FAIR_ANALYTICS_FIRST_HOUR, stands: fake, modelsCapped: false });
      const used = await (ctx as unknown as QueryCtx).meta.getTransactionMetrics();
      return { data: result, metrics: { documents: used.documentsRead.used, queries: used.databaseQueries.used } };
    });
    console.info("ADMIN v3 V3 getEventStandHours worst case (150 stands, 16 hours, 8 shards per bucket):", JSON.stringify(metrics), `unread=${data.unread}`);
    expect(data.hours).toHaveLength(16);
    expect(data.stands).toHaveLength(75); // 1 200 ranges / 16 hours
    expect(data.stands.filter((stand) => stand.uniquePerModel.length === 16)).toHaveLength(50); // 800 ranges / 16 hours
    expect(data.unread).toBe(75);
    expect(data.capped).toBe(true);
    expect(metrics.queries).toBeLessThanOrEqual(150 + 1200 + 800 + 1); // + the day row read above
    expect(metrics.documents).toBeLessThan(17_600);
    expect(metrics.documents).toBeLessThan(32_000);
  }, 120_000);
});
