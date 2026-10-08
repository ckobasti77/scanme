/// <reference types="vite/client" />

// Admin exclusion for every fair write and the admin DEV tools
// (JOVAN-DELTA 2026-10-09): what a signed-in ScanMe admin does on the public
// fair pages is stored (so it can be tested) but never counted, reported or
// exported; the DEV tools only ever touch the admin visitor's own rows.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { readFairCount, fairScanCountKey } from "./lib/fairCountShards";
import { fairAudienceVoteKey, fairFavoriteKey, fairRatingCountKey, fairRatingSumKey } from "./lib/fairInteractions";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const OPENING = Date.parse("2026-10-09T00:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const ADMIN_EMAIL = "fair-admin-dev@scanme.test";
const ISSUER = "https://fair-admin-dev.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(DAY1);
});
afterEach(() => vi.useRealTimers());

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const clientUserId = await ctx.db.insert("users", { email: "klijent@scanme.test" });
    const client = async (code: string, brandNames: string[]) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: DAY1, updatedAt: DAY1,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: DAY1,
      });
      const brandIds: Id<"brands">[] = [];
      for (const name of brandNames) {
        brandIds.push(await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: DAY1, updatedAt: DAY1 }));
      }
      return { accountId, businessId, brandIds };
    };
    return { adminId, clientUserId, a: await client("TA", ["TEST Volta"]), inventory: await client("TQ", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const nonAdmin = t.withIdentity({ subject: ids.clientUserId, issuer: ISSUER });
  const [volta] = ids.a.brandIds;
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST admin dev", venueName: "TEST hala",
    startsAt: OPENING, endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  const { dayId: day1 } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
    eventId, externalKey: "test-ad-izlagac-a", accountId: ids.a.accountId, businessId: ids.a.businessId,
  });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
    eventId, participationId, externalKey: "test-ad-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "ispred-14",
  });
  const model = async (externalKey: string) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId: volta, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
      specifications: [spec(1), spec(2)], packageTier: "advanced", passportEligible: true,
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    return modelId;
  };
  const x1 = await model("test-volta-x1");
  const x2 = await model("test-volta-x2");
  const { passportId } = await admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId, brandId: volta });
  await admin.mutation(api.fairInteractionsAdmin.publishPassport, { passportId });
  return { t, admin, nonAdmin, ...ids, eventId, day1, participationId, x1, x2, passportId };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const count = (f: Fixture, key: string) => f.t.run(async (ctx) => readFairCount(ctx, key));
const gw = (visitorHash: string) => ({ gatewaySecret: GATEWAY_SECRET, visitorHash });

async function openQuestion(f: Fixture) {
  const { questionId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, {
    eventModelId: f.x1, eventDayId: f.day1, prompt: "TEST pitanje", options: [{ id: "a", label: "A", order: 1 }, { id: "b", label: "B", order: 2 }], sortOrder: 1,
  });
  await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId });
  return questionId;
}

async function insertLead(f: Fixture, visitorHash: string, isAdminExcluded: boolean) {
  return f.t.run(async (ctx) => {
    const visitorRow = await ctx.db.query("fairVisitors").withIndex("by_visitorHash", (q) => q.eq("visitorHash", visitorHash)).unique();
    const visitorId = visitorRow?._id ?? (await ctx.db.insert("fairVisitors", { visitorHash, firstSeenAt: DAY1, lastSeenAt: DAY1 }));
    return ctx.db.insert("fairLeads", {
      submissionId: `test-lead-${visitorHash.slice(0, 8)}`, kind: "interest", visitorId, eventId: f.eventId, eventModelId: f.x1, participationId: f.participationId,
      contactName: "TEST Posetilac", email: "test@example.invalid", consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST",
      consentedAt: DAY1, status: "received", followUpSuppressed: false, createdAt: DAY1, purgeAt: Date.parse("2026-11-16T00:00:00+01:00"),
      ...(isAdminExcluded ? { isAdminExcluded: true } : {}),
    });
  });
}

describe("admin session: stored, never counted", () => {
  test("rating, vote and brand favorite from an admin session move no counter; a visitor's do", async () => {
    const f = await setup();
    const questionId = await openQuestion(f);
    const me = visitor();
    const other = visitor();

    await f.admin.mutation(api.fairInteractions.upsertRating, { ...gw(me), eventModelId: f.x1, appearance: 5 });
    await f.admin.mutation(api.fairInteractions.upsertRating, { ...gw(me), eventModelId: f.x1, appearance: 3 });
    await f.admin.mutation(api.fairInteractions.upsertAudienceVote, { ...gw(me), questionId, optionId: "a" });
    await f.admin.mutation(api.fairInteractions.upsertAudienceVote, { ...gw(me), questionId, optionId: "b" });
    expect(await count(f, fairRatingCountKey("appearance", f.x1))).toBe(0);
    expect(await count(f, fairRatingSumKey("appearance", f.x1))).toBe(0);
    expect(await count(f, fairAudienceVoteKey(questionId, "a"))).toBe(0);
    expect(await count(f, fairAudienceVoteKey(questionId, "b"))).toBe(0);
    expect((await rows(f, "fairRatings"))[0]).toMatchObject({ appearance: 3, isAdminExcluded: true });
    expect((await rows(f, "fairAudienceVotes"))[0]).toMatchObject({ optionId: "b", isAdminExcluded: true });

    // A signed-in non-admin and an anonymous visitor count as before.
    await f.nonAdmin.mutation(api.fairInteractions.upsertRating, { ...gw(other), eventModelId: f.x1, appearance: 4 });
    await f.t.mutation(api.fairInteractions.upsertAudienceVote, { ...gw(visitor()), questionId, optionId: "a" });
    expect(await count(f, fairRatingCountKey("appearance", f.x1))).toBe(1);
    expect(await count(f, fairAudienceVoteKey(questionId, "a"))).toBe(1);

    // Passport completed through the DEV tools, then a favorite: not counted either.
    await f.admin.mutation(api.fairAdminDev.grantStamps, { ...gw(me), eventId: f.eventId, eventModelIds: [f.x1, f.x2] });
    await f.admin.mutation(api.fairInteractions.upsertBrandFavorite, { ...gw(me), passportId: f.passportId, eventModelId: f.x2 });
    expect(await count(f, fairFavoriteKey(f.passportId, f.x2))).toBe(0);
    expect((await rows(f, "fairBrandFavoriteVotes"))[0]).toMatchObject({ isAdminExcluded: true });
  });

  test("an admin-session lead stays out of the inbox, counts and exports", async () => {
    const f = await setup();
    await insertLead(f, visitor(), false);
    await insertLead(f, visitor(), true);
    const counts = await f.admin.query(api.fairAdminStats.getLeadCounts, { eventId: f.eventId });
    expect(counts.byModel.find((row) => row.eventModelId === f.x1)).toMatchObject({ interest: 1 });
    const inbox = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: { numItems: 10, cursor: null } });
    expect(inbox.page).toHaveLength(1);
    const withTests = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, includePreEvent: true, paginationOpts: { numItems: 10, cursor: null } });
    expect(withTests.page).toHaveLength(2);
    const exported = await f.admin.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.participationId, paginationOpts: { numItems: 10, cursor: null } });
    expect(exported.page).toHaveLength(1);
  });
});

describe("admin DEV tools", () => {
  test("admin only, gateway only", async () => {
    const f = await setup();
    const args = { ...gw(visitor()), eventId: f.eventId, eventModelIds: [f.x1] };
    await expect(f.t.mutation(api.fairAdminDev.grantStamps, args)).rejects.toThrow();
    await expect(f.nonAdmin.mutation(api.fairAdminDev.grantStamps, args)).rejects.toThrow(/administratorski/);
    await expect(f.admin.mutation(api.fairAdminDev.grantStamps, { ...args, gatewaySecret: "wrong-secret-0123456789abcdef-0123456789" })).rejects.toThrow();
    await expect(f.nonAdmin.query(api.fairAdminDev.devState, { ...gw(visitor()), eventId: f.eventId })).rejects.toThrow(/administratorski/);
    await expect(f.nonAdmin.mutation(api.fairAdminDev.resetMine, { ...gw(visitor()), eventId: f.eventId, scope: "all" })).rejects.toThrow(/administratorski/);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(0);
  });

  test("stamps and a simulated scan: excluded stamp + audit row, no counter, no unique scan", async () => {
    const f = await setup();
    const me = visitor();
    expect(await f.admin.mutation(api.fairAdminDev.grantStamps, { ...gw(me), eventId: f.eventId, eventModelIds: [f.x1] })).toEqual({ stamped: 1 });
    expect(await f.admin.mutation(api.fairAdminDev.simulateScan, { ...gw(me), eventId: f.eventId, eventModelId: f.x2 })).toEqual({ stamped: true });
    expect(await f.admin.mutation(api.fairAdminDev.simulateScan, { ...gw(me), eventId: f.eventId, eventModelId: f.x2 })).toEqual({ stamped: false });
    expect((await rows(f, "fairPassportStamps")).every((row) => row.isAdminExcluded === true)).toBe(true);
    expect(await rows(f, "fairScanEvents")).toEqual([expect.objectContaining({ isAdminExcluded: true, adminUserId: f.adminId }), expect.objectContaining({ isAdminExcluded: true })]);
    expect(await rows(f, "fairUniqueScans")).toHaveLength(0);
    expect(await count(f, fairScanCountKey("scan_total", "model", f.x2, "2026-10-09"))).toBe(0);

    const state = await f.admin.query(api.fairAdminDev.devState, { ...gw(me), eventId: f.eventId, eventModelId: f.x1 });
    expect(state.passport?.progress[0]).toMatchObject({ stampedCount: 2, requiredCount: 2, completed: true });
    expect(state.garageModelIds).toHaveLength(2);
    expect(state.visitorKnown).toBe(true);
  });

  test("resetMine deletes only my rows; a row counted before is taken back out of the counters", async () => {
    const f = await setup();
    const questionId = await openQuestion(f);
    const me = visitor();
    const other = visitor();
    // Counted: rated anonymously on this phone before signing in.
    await f.t.mutation(api.fairInteractions.upsertRating, { ...gw(me), eventModelId: f.x2, appearance: 4 });
    await f.admin.mutation(api.fairInteractions.upsertRating, { ...gw(me), eventModelId: f.x1, appearance: 5 });
    await f.admin.mutation(api.fairInteractions.upsertAudienceVote, { ...gw(me), questionId, optionId: "a" });
    await f.t.mutation(api.fairInteractions.upsertRating, { ...gw(other), eventModelId: f.x2, appearance: 2 });
    await f.t.mutation(api.fairInteractions.upsertAudienceVote, { ...gw(other), questionId, optionId: "a" });
    await f.admin.mutation(api.fairAdminDev.grantStamps, { ...gw(me), eventId: f.eventId, eventModelIds: [f.x1, f.x2] });
    await insertLead(f, me, true);
    expect(await count(f, fairRatingCountKey("appearance", f.x2))).toBe(2);

    expect(await f.admin.mutation(api.fairAdminDev.resetMine, { ...gw(me), eventId: f.eventId, scope: "passport" })).toEqual({ deleted: 2, more: false });
    expect(await f.admin.mutation(api.fairAdminDev.resetMine, { ...gw(me), eventId: f.eventId, scope: "answers" })).toEqual({ deleted: 3, more: false });
    expect(await f.admin.mutation(api.fairAdminDev.resetMine, { ...gw(me), eventId: f.eventId, scope: "all" })).toEqual({ deleted: 1, more: false });

    expect(await count(f, fairRatingCountKey("appearance", f.x2))).toBe(1);
    expect(await count(f, fairRatingSumKey("appearance", f.x2))).toBe(2);
    expect(await count(f, fairAudienceVoteKey(questionId, "a"))).toBe(1);
    expect(await rows(f, "fairRatings")).toHaveLength(1);
    expect(await rows(f, "fairAudienceVotes")).toHaveLength(1);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(0);
    expect(await rows(f, "fairLeads")).toHaveLength(0);
    expect((await rows(f, "adminAuditLog")).filter((row) => row.action === "fair_admin_dev_reset")).toHaveLength(3);
  });
});
