/// <reference types="vite/client" />

// Sajam 2026 B2 — anonymous identity and the fair scan hook in the existing
// /r/[cardCode] resolver (BACKEND-HANDOFF §5.2, §10 definitions, §12
// "Identitet i scanovi"; MASTER §5). Visitor hashes are made with the real
// Next-side helper (lib/fair-server/visitor.ts), exactly as the route does.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { fairTimeKeys } from "./lib/fairScans";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// Day 1 of the TEST elektromobilnost fair, 10:00 in Belgrade (CEST).
const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b2.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });

function newVisitor() {
  const token = generateFairVisitorToken();
  return { token, hash: fairVisitorHash(token, SECRET) };
}

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandNames: string[]) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: NOW, updatedAt: NOW,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: NOW,
      });
      const brandIds: Id<"brands">[] = [];
      for (const name of brandNames) {
        brandIds.push(await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: NOW, updatedAt: NOW }));
      }
      return { accountId, businessId, brandIds };
    };
    return { adminId, memberId, a: await client("TA", ["TEST Volta"]), inventory: await client("TQ", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });

  const fair = async (code: string, startsAt: string, endsAt: string) => {
    const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
      code, slug: code, title: `TEST ${code}`, venueName: "TEST hala", startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt),
      status: "published", garagePriority: 1, qrInventoryBusinessId: ids.inventory.businessId,
    });
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
      eventId, externalKey: `${code}-izlagac-a`, accountId: ids.a.accountId, businessId: ids.a.businessId,
    });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `${code}-stand-a1`, code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: `${code}-loc-a1`,
    });
    return { eventId, participationId, standId };
  };
  const em = await fair("test-elektromobilnost-2026", "2026-10-09T00:00:00+02:00", "2026-10-12T00:00:00+02:00");
  const amf = await fair("test-auto-moto-fest-2026", "2026-10-30T00:00:00+01:00", "2026-11-02T00:00:00+01:00");

  const model = async (where: typeof em, externalKey: string, displayName: string, packageTier: "included" | "starter" | "advanced") => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId: where.eventId, participationId: where.participationId, standId: where.standId, brandId: ids.a.brandIds[0],
      externalKey, displayName, priceText: "TEST cena", specifications: [spec(1), spec(2)], packageTier, passportEligible: packageTier !== "included",
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const digitalQrId = await admin.mutation(api.adminProducts.createDigital, {
      accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-${externalKey}`,
    });
    const code = await t.run(async (ctx) => {
      const qr = (await ctx.db.get(digitalQrId))!;
      return (await ctx.db.get(qr.channelId))!.resolverCode;
    });
    await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    const slug = await t.run(async (ctx) => (await ctx.db.get(modelId))!.slug);
    return { modelId, code, slug };
  };
  const emX1 = await model(em, "test-em-volta-x1", "TEST Volta X1", "starter");
  const emX2 = await model(em, "test-em-volta-x2", "TEST Volta X2", "included");
  // The same commercial model on the second fair is a separate event-model.
  const amfX1 = await model(amf, "test-amf-volta-x1", "TEST Volta X1", "starter");
  return { t, admin, member, ...ids, em, amf, emX1, emX2, amfX1 };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
type Caller = Fixture["t"] | Fixture["admin"];

let sequence = 0;
async function scan(
  caller: Caller,
  code: string,
  visitorHash?: string,
  options: { requestId?: string; deviceCategory?: "mobile" | "bot" } = {},
) {
  return caller.mutation(api.cards.resolveAndRecord, {
    cardCode: code,
    requestId: options.requestId ?? `test-request-${++sequence}`,
    deviceCategory: options.deviceCategory ?? "mobile",
    // One shared NAT for the whole hall.
    ipHash: "test-hall-nat",
    ...(visitorHash ? { fairVisitorHash: visitorHash } : {}),
  });
}

async function counts(f: Fixture, eventModelId: Id<"fairEventModels">, buckets: { dateKey?: string; hourKey?: string } = {}) {
  return (await f.t.query(internal.fairScans.modelScanCounts, { eventModelId, ...buckets }))!;
}

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}

const modelPath = (eventSlug: string, slug: string) => `/sajam/${eventSlug}/model/${slug}`;

describe("total and unique scans (HANDOFF §10)", () => {
  test("10 scans of one QR by one device = 10 total, 1 unique; each request = one generic + one fair row", async () => {
    const f = await setup();
    const visitor = newVisitor();
    for (let i = 0; i < 10; i++) {
      expect(await scan(f.t, f.emX1.code, visitor.hash)).toEqual({
        kind: "fair_model",
        path: modelPath("test-elektromobilnost-2026", f.emX1.slug),
        fairScan: "recorded",
      });
    }
    const c = await counts(f, f.emX1.modelId);
    expect(c.model).toEqual({ total: 10, unique: 1 });
    expect(c.stand).toEqual({ total: 10, unique: 1 });
    expect(c.raw).toEqual({ scanEvents: 10, adminExcluded: 0, uniqueVisitors: 1, capped: false });

    const generic = await rows(f, "cardScanEvents");
    const fairScans = await rows(f, "fairScanEvents");
    expect(generic).toHaveLength(10);
    expect(fairScans).toHaveLength(10);
    expect(new Set(fairScans.map((row) => row.requestId))).toEqual(new Set(generic.map((row) => row.requestId)));
    expect(await rows(f, "fairVisitors")).toHaveLength(1);
    const [unique] = await rows(f, "fairUniqueScans");
    expect(unique).toMatchObject({ eventModelId: f.emX1.modelId, totalScanCount: 10, firstScannedAt: NOW, lastScannedAt: NOW });
  });

  test("a retry with the same requestId adds no generic row, no fair row and no count", async () => {
    const f = await setup();
    const visitor = newVisitor();
    const first = await scan(f.t, f.emX1.code, visitor.hash, { requestId: "test-retry-1" });
    const retry = await scan(f.t, f.emX1.code, visitor.hash, { requestId: "test-retry-1" });
    expect(first).toMatchObject({ kind: "fair_model", fairScan: "recorded" });
    // Same destination, nothing written the second time.
    expect(retry).toEqual({ ...first, fairScan: "duplicate" });
    expect(await rows(f, "cardScanEvents")).toHaveLength(1);
    expect(await rows(f, "fairScanEvents")).toHaveLength(1);
    expect((await counts(f, f.emX1.modelId)).model).toEqual({ total: 1, unique: 1 });
    const card = await f.t.run(async (ctx) => ctx.db.query("cards").withIndex("by_cardCode", (q) => q.eq("cardCode", f.emX1.code)).unique());
    expect(card?.totalScans).toBe(1);
  });

  test("another model = new unique; the same model on the other fair = separate unique; another device = new unique", async () => {
    const f = await setup();
    const a = newVisitor();
    const b = newVisitor();
    await scan(f.t, f.emX1.code, a.hash);
    await scan(f.t, f.emX2.code, a.hash);
    await scan(f.t, f.amfX1.code, a.hash);
    await scan(f.t, f.emX1.code, b.hash);
    expect((await counts(f, f.emX1.modelId)).model).toEqual({ total: 2, unique: 2 });
    expect((await counts(f, f.emX2.modelId)).model).toEqual({ total: 1, unique: 1 });
    expect((await counts(f, f.amfX1.modelId)).model).toEqual({ total: 1, unique: 1 });
    // emX1 and emX2 share the elektromobilnost stand; the AMF stand is separate.
    expect((await counts(f, f.emX1.modelId)).stand).toEqual({ total: 3, unique: 3 });
    expect((await counts(f, f.amfX1.modelId)).stand).toEqual({ total: 1, unique: 1 });
    // One identity across both fairs (MASTER §5), one unique row per event-model.
    expect(await rows(f, "fairVisitors")).toHaveLength(2);
    const uniques = await rows(f, "fairUniqueScans");
    expect(uniques).toHaveLength(4);
    expect(new Set(uniques.map((row) => row.eventId))).toEqual(new Set([f.em.eventId, f.amf.eventId]));
  });

  test("a scan from before a package upgrade stays in the model's counts", async () => {
    const f = await setup();
    const visitor = newVisitor();
    await scan(f.t, f.emX2.code, visitor.hash); // included
    vi.setSystemTime(NOW + 60_000);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.emX2.modelId, toTier: "starter" });
    vi.setSystemTime(NOW + 120_000);
    await scan(f.t, f.emX2.code, visitor.hash); // starter, same QR
    const c = await counts(f, f.emX2.modelId);
    expect(c.model).toEqual({ total: 2, unique: 1 });
    expect(c.raw.scanEvents).toBe(2);
  });
});

describe("admin exclusion and 24/7 counting (HANDOFF §5.2, §12)", () => {
  test("a signed-in ScanMe admin is excluded from fair metrics; the generic scan is unchanged", async () => {
    const f = await setup();
    const visitor = newVisitor();
    expect(await scan(f.admin, f.emX1.code, visitor.hash)).toMatchObject({ kind: "fair_model", fairScan: "admin_excluded" });
    const [audit] = await rows(f, "fairScanEvents");
    expect(audit).toMatchObject({ isAdminExcluded: true, adminUserId: f.adminId });
    expect(await rows(f, "fairUniqueScans")).toEqual([]);
    expect(await rows(f, "fairMetricCountShards")).toEqual([]);
    expect((await counts(f, f.emX1.modelId)).model).toEqual({ total: 0, unique: 0 });
    // Generic card metrics behave exactly as before (counted, not filtered).
    expect(await rows(f, "cardScanEvents")).toHaveLength(1);
    const card = await f.t.run(async (ctx) => ctx.db.query("cards").withIndex("by_cardCode", (q) => q.eq("cardCode", f.emX1.code)).unique());
    expect(card?.totalScans).toBe(1);
  });

  test("a signed-in non-admin and an anonymous scan both count", async () => {
    const f = await setup();
    await scan(f.member, f.emX1.code, newVisitor().hash);
    await scan(f.t, f.emX1.code, newVisitor().hash);
    expect((await counts(f, f.emX1.modelId)).model).toEqual({ total: 2, unique: 2 });
    expect((await rows(f, "fairScanEvents")).every((row) => !row.isAdminExcluded && row.adminUserId === undefined)).toBe(true);
  });

  test("no public argument can claim admin exclusion", async () => {
    const f = await setup();
    for (const extra of [{ isAdmin: true }, { isAdminExcluded: true }, { adminUserId: f.adminId }]) {
      await expect(
        f.t.mutation(api.cards.resolveAndRecord, {
          cardCode: f.emX1.code, requestId: `test-flag-${Object.keys(extra)[0]}`, ipHash: "test-hall-nat", fairVisitorHash: newVisitor().hash,
          ...extra,
        } as never),
      ).rejects.toThrow();
    }
    expect(await rows(f, "fairScanEvents")).toEqual([]);
  });

  test("non-admin scans count outside opening hours and without a bot/device filter", async () => {
    const f = await setup();
    // A week before the fair opens (the limiter's clock only moves forward).
    vi.setSystemTime(Date.parse("2026-10-01T12:00:00+02:00"));
    expect(await scan(f.t, f.emX1.code, newVisitor().hash)).toMatchObject({ fairScan: "recorded" });
    // 03:17 in Belgrade, the night after the fair closed; a link-preview bot.
    vi.setSystemTime(Date.parse("2026-10-12T03:17:00+02:00"));
    expect(await scan(f.t, f.emX1.code, newVisitor().hash, { deviceCategory: "bot" })).toMatchObject({ fairScan: "recorded" });
    expect((await counts(f, f.emX1.modelId)).model).toEqual({ total: 2, unique: 2 });
    // The generic card total keeps its existing bot suppression.
    const card = await f.t.run(async (ctx) => ctx.db.query("cards").withIndex("by_cardCode", (q) => q.eq("cardCode", f.emX1.code)).unique());
    expect(card?.totalScans).toBe(1);
  });
});

describe("Europe/Belgrade keys (HANDOFF §5.2, §12)", () => {
  test("dateKey/hourKey follow Belgrade wall-clock across midnight and DST, not the server zone", () => {
    expect(fairTimeKeys(Date.parse("2026-10-09T21:59:59Z"))).toEqual({ dateKey: "2026-10-09", hourKey: "2026-10-09T23" });
    expect(fairTimeKeys(Date.parse("2026-10-09T22:00:00Z"))).toEqual({ dateKey: "2026-10-10", hourKey: "2026-10-10T00" });
    expect(fairTimeKeys(Date.parse("2026-10-10T00:00:00Z"))).toEqual({ dateKey: "2026-10-10", hourKey: "2026-10-10T02" });
    // Second fair is after the DST change: UTC+1.
    expect(fairTimeKeys(Date.parse("2026-10-31T22:59:59Z"))).toEqual({ dateKey: "2026-10-31", hourKey: "2026-10-31T23" });
    expect(fairTimeKeys(Date.parse("2026-10-31T23:00:00Z"))).toEqual({ dateKey: "2026-11-01", hourKey: "2026-11-01T00" });
    // 25 Oct 2026 fall-back: 02:30 CEST and 02:30 CET share the wall-clock hour.
    expect(fairTimeKeys(Date.parse("2026-10-25T00:30:00Z")).hourKey).toBe("2026-10-25T02");
    expect(fairTimeKeys(Date.parse("2026-10-25T01:30:00Z")).hourKey).toBe("2026-10-25T02");
  });

  test("scans on both sides of Belgrade midnight land in their own day and hour buckets", async () => {
    const f = await setup();
    const visitor = newVisitor();
    vi.setSystemTime(Date.parse("2026-10-09T21:59:59Z")); // 23:59:59 CEST
    await scan(f.t, f.emX1.code, visitor.hash);
    vi.setSystemTime(Date.parse("2026-10-09T22:00:00Z")); // 00:00:00 CEST next day
    await scan(f.t, f.emX1.code, visitor.hash);
    const stored = (await rows(f, "fairScanEvents")).map((row) => [row.dateKey, row.hourKey]);
    expect(stored).toEqual([["2026-10-09", "2026-10-09T23"], ["2026-10-10", "2026-10-10T00"]]);
    // The unique scan belongs to the day/hour of the FIRST scan.
    expect((await counts(f, f.emX1.modelId, { dateKey: "2026-10-09", hourKey: "2026-10-09T23" }))).toMatchObject({
      day: { total: 1, unique: 1 },
      hour: { total: 1, unique: 1 },
    });
    expect((await counts(f, f.emX1.modelId, { dateKey: "2026-10-10", hourKey: "2026-10-10T00" }))).toMatchObject({
      day: { total: 1, unique: 0 },
      hour: { total: 1, unique: 0 },
    });
  });
});

describe("identity hygiene and resolver boundaries", () => {
  test("the raw visitor token is never stored; the hash lives only in fairVisitors", async () => {
    const f = await setup();
    const visitor = newVisitor();
    await scan(f.t, f.emX1.code, visitor.hash, { requestId: "test-hygiene-1" });
    await scan(f.t, f.emX1.code, visitor.hash, { requestId: "test-hygiene-1" });
    await scan(f.t, f.emX2.code, visitor.hash);
    await scan(f.admin, f.amfX1.code, visitor.hash);
    const tablesWithHash: string[] = [];
    for (const table of Object.keys(schema.tables) as TableNames[]) {
      const dump = JSON.stringify(await rows(f, table));
      expect(dump, table).not.toContain(visitor.token);
      if (dump.includes(visitor.hash)) tablesWithHash.push(table);
    }
    expect(tablesWithHash).toEqual(["fairVisitors"]);
    const visitors = await rows(f, "fairVisitors");
    expect(visitors.map((row) => Object.keys(row).sort())).toEqual([["_creationTime", "_id", "firstSeenAt", "lastSeenAt", "visitorHash"]]);
  });

  test("without a valid visitor hash the redirect and the generic scan still work, with no fair row", async () => {
    const f = await setup();
    const path = modelPath("test-elektromobilnost-2026", f.emX1.slug);
    // Production without FAIR_VISITOR_HASH_SECRET sends no hash at all.
    expect(await scan(f.t, f.emX1.code)).toEqual({ kind: "fair_model", path, fairScan: "no_visitor" });
    // A malformed value is ignored, never stored.
    expect(await scan(f.t, f.emX1.code, "A".repeat(64))).toMatchObject({ fairScan: "no_visitor" });
    expect(await scan(f.t, f.emX1.code, "abc")).toMatchObject({ fairScan: "no_visitor" });
    expect(await rows(f, "cardScanEvents")).toHaveLength(3);
    expect(await rows(f, "fairScanEvents")).toEqual([]);
    expect(await rows(f, "fairVisitors")).toEqual([]);
  });

  test("a withdrawn model or a released QR opens nothing and writes no fair scan", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.emX1.modelId });
    expect(await scan(f.t, f.emX1.code, newVisitor().hash)).toEqual({ kind: "invalid" });
    await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: f.emX2.modelId, reason: "TEST release" });
    expect(await scan(f.t, f.emX2.code, newVisitor().hash)).toEqual({ kind: "invalid" });
    expect(await rows(f, "fairScanEvents")).toEqual([]);
    expect(await rows(f, "fairVisitors")).toEqual([]);
  });

  test("other products ignore the fair hash: a URL card resolves as before and creates no visitor", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      const cardId = await ctx.db.insert("cards", {
        businessId: f.a.businessId, cardCode: "WXYZ2345", label: "TEST", status: "active", totalScans: 0, createdAt: NOW, updatedAt: NOW,
      });
      const targetId = await ctx.db.insert("cardTargets", { cardId, kind: "url", url: "https://example.com/", createdByUserId: f.adminId, createdAt: NOW });
      await ctx.db.patch(cardId, { currentTargetId: targetId });
    });
    expect(await scan(f.t, "WXYZ2345", newVisitor().hash)).toEqual({ kind: "url", url: "https://example.com/" });
    expect(await rows(f, "fairVisitors")).toEqual([]);
    expect(await rows(f, "fairScanEvents")).toEqual([]);
  });

  test("the per-visitor fairScan limit never throttles other visitors behind the same NAT", async () => {
    const f = await setup();
    const burst = newVisitor();
    for (let i = 0; i < 20; i++) expect(await scan(f.t, f.emX1.code, burst.hash)).toMatchObject({ fairScan: "recorded" });
    // The 21st scan in the same minute: still redirected, only the fair row is skipped.
    expect(await scan(f.t, f.emX1.code, burst.hash)).toEqual({
      kind: "fair_model",
      path: modelPath("test-elektromobilnost-2026", f.emX1.slug),
      fairScan: "rate_limited",
    });
    expect(await scan(f.t, f.emX1.code, newVisitor().hash)).toMatchObject({ fairScan: "recorded" });
    expect((await counts(f, f.emX1.modelId)).model).toEqual({ total: 21, unique: 2 });
    expect(await rows(f, "cardScanEvents")).toHaveLength(22);
  });
});

describe("brand passport stamp hook (HANDOFF §5.5)", () => {
  test("no-op until a passport is published; then one stamp per visitor+model; never for admins", async () => {
    const f = await setup();
    const passportId = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("fairPassportConfigs", {
        eventId: f.em.eventId, brandId: f.a.brandIds[0], participationId: f.em.participationId, status: "draft", createdAt: NOW, updatedAt: NOW,
      });
      for (const eventModelId of [f.emX1.modelId, f.emX2.modelId]) {
        await ctx.db.insert("fairPassportEligibleModels", {
          passportConfigId: id, eventId: f.em.eventId, brandId: f.a.brandIds[0], eventModelId, status: "required", createdAt: NOW,
        });
      }
      return id;
    });
    const visitor = newVisitor();
    await scan(f.t, f.emX1.code, visitor.hash);
    expect(await rows(f, "fairPassportStamps")).toEqual([]);

    await f.t.run(async (ctx) => ctx.db.patch(passportId, { status: "published", publishedAt: NOW }));
    await scan(f.t, f.emX1.code, visitor.hash);
    await scan(f.t, f.emX1.code, visitor.hash);
    await scan(f.t, f.emX2.code, visitor.hash);
    const stamps = await rows(f, "fairPassportStamps");
    expect(stamps.map((row) => row.eventModelId).sort()).toEqual([f.emX1.modelId, f.emX2.modelId].sort());
    expect(stamps.every((row) => row.brandId === f.a.brandIds[0] && row.eventId === f.em.eventId)).toBe(true);

    // An emergency-removed member stops stamping; earned stamps stay.
    await f.t.run(async (ctx) => {
      const member = await ctx.db.query("fairPassportEligibleModels").withIndex("by_eventModelId", (q) => q.eq("eventModelId", f.emX2.modelId)).first();
      await ctx.db.patch(member!._id, { status: "removed", removedAt: NOW });
    });
    const late = newVisitor();
    await scan(f.t, f.emX2.code, late.hash);
    await scan(f.admin, f.emX1.code, newVisitor().hash);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(2);
  });
});
