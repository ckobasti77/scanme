/// <reference types="vite/client" />

// SAJAM SUPER Korak 3 — „Gde je gužva“: the public heat levels come from the
// stand scan counters (unique scans), from the analytics cutoff (9. 10. 08:00),
// without admin scans; the public gets levels only, behind the gateway secret.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { fairHeatWindow, fairStandWindowCounts } from "./lib/fairHeat";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const SETUP_AT = Date.parse("2026-10-09T06:00:00+02:00");
const PRE_EVENT = Date.parse("2026-10-09T07:30:00+02:00");
const NINE_TEN = Date.parse("2026-10-09T09:10:00+02:00");
const TEN_FIVE = Date.parse("2026-10-09T10:05:00+02:00");
const TEN_THIRTY = Date.parse("2026-10-09T10:30:00+02:00");
const ADMIN_EMAIL = "fair-heat@scanme.test";
const ISSUER = "https://fair-heat.test";
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

/** The real event code, so the 08:00 analytics cutoff of 9. 10. applies. */
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
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
    return { adminId, a: await client("HA", "TEST JMEV"), b: await client("HB", "TEST Foton"), inventory: await client("HQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "elektromobilnost-2026", slug: "elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const participation = async (key: string, client: typeof ids.a) =>
    (await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: key, accountId: client.accountId, businessId: client.businessId })).participationId;
  const pa = await participation("test-heat-a", ids.a);
  const pb = await participation("test-heat-b", ids.b);
  const stand = async (participationId: Id<"fairParticipations">, key: string, code: string, mapLocationId: string) =>
    (await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: key, code, displayName: `TEST ${code}`, mapLocationId })).standId;
  const stand9 = await stand(pa, "test-heat-9", "9", "hala-9");
  const stand6a = await stand(pa, "test-heat-6a", "6", "hala-6");
  const stand6b = await stand(pb, "test-heat-6b", "6", "hala-6");
  let qr = 0;
  const model = async (participationId: Id<"fairParticipations">, standId: Id<"fairStands">, brandId: Id<"brands">, key: string) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId, externalKey: key, displayName: `TEST ${key}`, priceText: "TEST cena",
      specifications: [{ label: "TEST", value: "TEST", order: 1, isHighlight: true }], packageTier: "included", passportEligible: false,
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const digitalQrId = await admin.mutation(api.adminProducts.createDigital, { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-heat-${++qr}` });
    const code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
    await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    return code;
  };
  const codes = {
    nine: await model(pa, stand9, ids.a.brandId!, "test-heat-jmev"),
    sixA: await model(pa, stand6a, ids.a.brandId!, "test-heat-mazda"),
    sixB: await model(pb, stand6b, ids.b.brandId!, "test-heat-foton"),
  };
  return { t, admin, eventId, stand9, codes };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

let requestSequence = 0;
async function scanAt(f: Fixture, at: number, code: string, visitorHash: string, as: "visitor" | "admin" = "visitor") {
  vi.setSystemTime(at);
  const caller = as === "admin" ? f.admin : f.t;
  return caller.mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-heat-request-${++requestSequence}`, deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}
const heat = (f: Fixture, at: number, gatewaySecret = GATEWAY_SECRET) =>
  f.t.query(api.fairHeat.getMapHeat, { gatewaySecret, eventSlug: "elektromobilnost-2026", at });

describe("SAJAM SUPER: getMapHeat", () => {
  test("only the Next server reads it: without the gateway secret a stable code", async () => {
    const f = await setup();
    await expect(heat(f, TEN_THIRTY, "pogresna-tajna")).rejects.toMatchObject({ data: expect.objectContaining({ code: "FAIR_GATEWAY_UNAUTHORIZED" }) });
    expect(await f.t.query(api.fairHeat.getMapHeat, { gatewaySecret: GATEWAY_SECRET, eventSlug: "nema-sajma", at: TEN_THIRTY })).toBeNull();
  });

  test("levels only (no counts); a location shared by two stands adds up; quiet periods say `enough: false`", async () => {
    const f = await setup();
    expect(await heat(f, TEN_THIRTY)).toEqual({ at: TEN_THIRTY, today: { enough: false, levels: [] }, hour: { enough: false, levels: [] } });
    for (let index = 0; index < 10; index += 1) await scanAt(f, TEN_FIVE, f.codes.nine, visitor());
    for (let index = 0; index < 2; index += 1) await scanAt(f, TEN_FIVE, f.codes.sixA, visitor());
    for (let index = 0; index < 2; index += 1) await scanAt(f, TEN_FIVE, f.codes.sixB, visitor());
    const result = await heat(f, TEN_THIRTY);
    // hala-9: 10, hala-6: 2 + 2 = 4; hot end = max(p95 = 10, 8) = 10 → 1 and (0.4)^0.75.
    expect(result?.today).toEqual({ enough: true, levels: [{ locationId: "hala-6", level: 0.5 }, { locationId: "hala-9", level: 1 }] });
    for (const row of result!.today.levels) expect(Object.keys(row).sort()).toEqual(["level", "locationId"]);
  });

  test("unique per visitor and model: one person scanning the same car again adds nothing", async () => {
    const f = await setup();
    const me = visitor();
    for (let index = 0; index < 6; index += 1) await scanAt(f, TEN_FIVE, f.codes.nine, me);
    expect((await heat(f, TEN_THIRTY))?.today.enough).toBe(false);
  });

  test("pre-event scans (before 08:00) and admin scans never count", async () => {
    const f = await setup();
    for (let index = 0; index < 8; index += 1) await scanAt(f, PRE_EVENT, f.codes.nine, visitor());
    for (let index = 0; index < 8; index += 1) await scanAt(f, TEN_FIVE, f.codes.nine, visitor(), "admin");
    expect(await heat(f, TEN_THIRTY)).toMatchObject({ today: { enough: false }, hour: { enough: false } });
    const counts = await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", "elektromobilnost-2026")).unique())!;
      return fairStandWindowCounts(ctx, "scan_unique", f.stand9, fairHeatWindow(event, TEN_THIRTY));
    });
    expect(counts).toEqual({ today: 0, hour: 0 });
  });

  test("the last hour is the current hour in full plus the previous one weighted by what is left of it", async () => {
    const f = await setup();
    for (let index = 0; index < 4; index += 1) await scanAt(f, NINE_TEN, f.codes.nine, visitor());
    for (let index = 0; index < 3; index += 1) await scanAt(f, TEN_FIVE, f.codes.nine, visitor());
    const counts = await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", "elektromobilnost-2026")).unique())!;
      return fairStandWindowCounts(ctx, "scan_unique", f.stand9, fairHeatWindow(event, TEN_THIRTY));
    });
    // 10:30: the 10 h bucket (3) in full and half of the 9 h bucket (4 × 0.5).
    expect(counts).toEqual({ today: 7, hour: 5 });
    // At 08:20 the 07 h bucket is before the cutoff: only the 08 h bucket is read.
    const window = fairHeatWindow({ code: "elektromobilnost-2026", startsAt: 0 }, Date.parse("2026-10-09T08:20:00+02:00"));
    expect(window.hours).toEqual([{ hourKey: "2026-10-09T08", weight: 1 }]);
  });
});
