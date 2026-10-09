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


const modules = import.meta.glob("./**/*.ts");
const SETUP_AT = Date.parse("2026-10-09T06:00:00+02:00");
const NOON = Date.parse("2026-10-09T12:00:00+02:00");
const ADMIN_EMAIL = "fair-analytics@scanme.test";
const ISSUER = "https://fair-analytics.test";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(SETUP_AT);
});
afterEach(() => vi.useRealTimers());


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


describe("SAJAM SUPER: Analitika is admin only", () => {
  test("an anonymous and a non-admin caller are refused", async () => {
    const f = await setup();
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairEventAnalytics.getEventAnalytics, { eventId: f.eventId, at: NOON })).rejects.toThrow();
      await expect(caller.query(api.fairEventAnalytics.getEventAudience, { eventId: f.eventId, at: NOON })).rejects.toThrow();
    }
  });
});
