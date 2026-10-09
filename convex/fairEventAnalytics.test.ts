/// <reference types="vite/client" />

// SAJAM SUPER Korak 4 + 5 — `Događaji → Analitika` is admin only, and its
// numbers are the database's: Pregled (fairDashboard), the analytics and the
// raw rows agree. "Unique" has two meanings, shown side by side: one per
// visitor AND model (fairUniqueScans rows, the stand counter sums them) and
// distinct visitors (one person, many cars = 1).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { fairScanCountKey, readFairCount } from "./lib/fairCountShards";
import { fairDayCountFrom } from "./lib/fairPreEvent";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const SETUP_AT = Date.parse("2026-10-09T06:00:00+02:00");
const PRE_EVENT = Date.parse("2026-10-09T07:40:00+02:00");
const NINE = Date.parse("2026-10-09T09:15:00+02:00");
const ELEVEN = Date.parse("2026-10-09T11:20:00+02:00");
const NOON = Date.parse("2026-10-09T12:00:00+02:00");
const ADMIN_EMAIL = "fair-analytics@scanme.test";
const ISSUER = "https://fair-analytics.test";
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

async function setup() {
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
    return { adminId, memberId, a: await client("NA", "TEST JMEV"), inventory: await client("NQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "elektromobilnost-2026", slug: "elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-10", label: "TEST dan 2", sortOrder: 2 });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: "test-an-a", accountId: ids.a.accountId, businessId: ids.a.businessId });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: "test-an-9", code: "9", displayName: "TEST 9", mapLocationId: "hala-9" });
  let qr = 0;
  const model = async (key: string) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId: ids.a.brandId!, externalKey: key, displayName: `TEST ${key}`, priceText: "TEST cena",
      specifications: [{ label: "TEST", value: "TEST", order: 1, isHighlight: true }], packageTier: "included", passportEligible: false,
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const digitalQrId = await admin.mutation(api.adminProducts.createDigital, { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-an-${++qr}` });
    const code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
    await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    return { id: modelId, code };
  };
  return { t, admin, member, eventId, standId, ev3: await model("test-an-ev3"), yi: await model("test-an-yi") };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

let requestSequence = 0;
async function scanAt(f: Fixture, at: number, code: string, visitorHash: string, as: "visitor" | "admin" = "visitor") {
  vi.setSystemTime(at);
  return (as === "admin" ? f.admin : f.t).mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-an-request-${++requestSequence}`, deviceCategory: as === "admin" ? "desktop" : "mobile", ipHash: "test-hall-nat",
    fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}

describe("SAJAM SUPER: Analitika is admin only", () => {
  test("an anonymous and a non-admin caller are refused", async () => {
    const f = await setup();
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairEventAnalytics.getEventAnalytics, { eventId: f.eventId, at: NOON })).rejects.toThrow();
      await expect(caller.query(api.fairEventAnalytics.getEventAudience, { eventId: f.eventId, at: NOON })).rejects.toThrow();
    }
  });
});

describe("SAJAM SUPER Korak 5: Pregled and Analitika count what the database holds", () => {
  test("scans, unique per model and visitors match the rows; pre-event and admin scans never count", async () => {
    const f = await setup();
    const anna = visitor();
    const boris = visitor();
    await scanAt(f, PRE_EVENT, f.ev3.code, visitor()); // before 08:00: pre-event
    await scanAt(f, NINE, f.ev3.code, anna);
    await scanAt(f, NINE, f.ev3.code, anna); // the same car again: a scan, not a new unique
    await scanAt(f, ELEVEN, f.yi.code, anna); // a second car of the same stand
    await scanAt(f, ELEVEN, f.ev3.code, boris);
    await scanAt(f, ELEVEN, f.yi.code, visitor(), "admin"); // a signed-in admin: audit row only

    vi.setSystemTime(NOON);
    const dashboard = await f.admin.query(api.fairDashboard.getEventDashboard, { eventId: f.eventId, at: NOON });
    const analytics = await f.admin.query(api.fairEventAnalytics.getEventAnalytics, { eventId: f.eventId, at: NOON });
    const audience = await f.admin.query(api.fairEventAnalytics.getEventAudience, { eventId: f.eventId, at: NOON });
    const rows = await f.t.run(async (ctx) => ({
      scans: (await ctx.db.query("fairScanEvents").collect()).filter((row) => !row.isAdminExcluded && row.occurredAt >= Date.parse("2026-10-09T08:00:00+02:00")).length,
      unique: (await ctx.db.query("fairUniqueScans").collect()).filter((row) => row.firstScannedAt >= Date.parse("2026-10-09T08:00:00+02:00")),
      standUnique: await fairDayCountFrom(ctx, fairScanCountKey("scan_unique", "stand", f.standId), { dateKey: "2026-10-09", startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-10T00:00:00+02:00") }, Date.parse("2026-10-09T08:00:00+02:00")),
      allTimeStandUnique: await readFairCount(ctx, fairScanCountKey("scan_unique", "stand", f.standId)),
    }));

    // Every scan from 08:00, admin excluded: Anna 3, Boris 1.
    expect(rows.scans).toBe(4);
    expect(dashboard.kpis.scans).toMatchObject({ today: 4, total: 4, uniqueToday: 3, uniqueTotal: 3 });
    expect(analytics.kpis.scans).toEqual({ today: 4, total: 4 });
    // Unique per visitor and model = fairUniqueScans rows from 08:00 (Anna×EV3, Anna×YI, Boris×EV3).
    expect(rows.unique).toHaveLength(3);
    expect(analytics.kpis.uniquePerModel).toEqual({ today: 3, total: 3 });
    // The stand counter sums unique per model: Anna counts twice at stand 9 (two of its cars)…
    expect(rows.standUnique).toBe(3);
    // …and the pre-event scan stays in the all-time counter, never in a fair number.
    expect(rows.allTimeStandUnique).toBe(4);
    // Distinct visitors: Anna and Boris — the stand's visitors count Anna once.
    expect(audience.visitors).toEqual({ today: 2, total: 2, capped: false });
    expect(audience.locations).toEqual([{ locationId: "hala-9", visitors: 2 }]);
    expect(audience.models.map((row) => row.visitors).sort()).toEqual([1, 2]);
    // Devices of the fair scans only (the admin's desktop scan is not one).
    expect(audience.devices).toMatchObject({ mobile: 4, desktop: 0, bots: 0, sample: 4 });

    // Per day and per hour from 08:00, the same totals.
    expect(analytics.days).toEqual([
      { dateKey: "2026-10-09", label: "TEST dan 1", scans: 4, uniquePerModel: 3 },
      { dateKey: "2026-10-10", label: "TEST dan 2", scans: 0, uniquePerModel: 0 },
    ]);
    expect(analytics.hours.map((row) => [row.hour, row.scans, row.uniquePerModel])).toEqual([[8, 0, 0], [9, 2, 1], [10, 0, 0], [11, 2, 2], [12, 0, 0]]);
    expect(analytics.hours.reduce((sum, row) => sum + row.scans, 0)).toBe(rows.scans);
    // The ranking: per model, and the admin heat on the public scale with the exact count and share.
    const ev3 = analytics.models.find((row) => row.eventModelId === f.ev3.id)!;
    expect(ev3).toMatchObject({ scans: { today: 3, total: 3 }, uniquePerModel: { today: 2, total: 2 }, standCode: "9", mapLocationId: "hala-9" });
    expect(analytics.heat.today).toEqual([{ locationId: "hala-9", count: 3, share: 1, level: expect.any(Number) }]);
  });
});

