/// <reference types="vite/client" />

// Admin UX A3 — read-only numbers of the `Modeli` admin list and model detail
// (convex/fairAdminStats.ts): lead counts per model and participation, the
// printed QR codes of assigned models, event isolation, the read cap and
// admin-only access (BACKEND-HANDOFF §12 "Izveštaji i izolacija", §14).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_LEAD_COUNT_LIMIT } from "./fairAdminStats";

const modules = import.meta.glob("./**/*.ts");
const SEED_AT = Date.parse("2026-10-05T10:00:00+02:00");
// Leads are counted from the opening on (pre-event leads are left out, JOVAN-DELTA 2026-10-08b).
const FAIR_DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const ADMIN_EMAIL = "fair-a3-stats@scanme.test";
const ISSUER = "https://fair-a3-stats.test";
const EM = "test-elektromobilnost-2026";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  vi.useFakeTimers();
  vi.setSystemTime(SEED_AT);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const { adminId, memberId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert("users", { email: ADMIN_EMAIL }),
    memberId: await ctx.db.insert("users", { email: "klijent@example.invalid" }),
  }));
  const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
  const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: memberId, issuer: ISSUER });
  const ids = await t.run(async (ctx) => {
    const events = await ctx.db.query("fairEvents").take(10);
    const em = events.find((row) => row.code === EM)!;
    const other = events.find((row) => row.code !== EM)!;
    const emModels = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", em._id)).take(100);
    const otherModels = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", other._id)).take(100);
    const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: "a".repeat(64), firstSeenAt: SEED_AT, lastSeenAt: SEED_AT });
    return { emId: em._id, otherId: other._id, otherCode: other.code, emModels, otherModels, visitorId };
  });
  return { t, admin, member, seed, ...ids };
}

type Setup = Awaited<ReturnType<typeof setup>>;
type LeadModel = { _id: Id<"fairEventModels">; eventId: Id<"fairEvents">; participationId: Id<"fairParticipations"> };

async function insertLeads(f: Setup, model: LeadModel, rows: { kind: "interest" | "test_drive"; delivered?: boolean }[]) {
  await f.t.run(async (ctx) => {
    const base = Math.max(FAIR_DAY1, (await ctx.db.get(model.eventId))!.startsAt);
    for (const [index, row] of rows.entries()) {
      await ctx.db.insert("fairLeads", {
        submissionId: `test-a3-${model._id}-${index}`, kind: row.kind, visitorId: f.visitorId, eventId: model.eventId, eventModelId: model._id,
        participationId: model.participationId, contactName: "TEST Posetilac", email: "test.a3@example.invalid", consentAccepted: true, consentVersion: 1,
        consentTextSnapshot: "TEST saglasnost", consentedAt: SEED_AT, status: row.delivered ? "delivered" : "received",
        ...(row.delivered ? { deliveredAt: SEED_AT } : {}), followUpSuppressed: false, createdAt: base + index, purgeAt: SEED_AT,
      });
    }
  });
}

describe("A3 fairAdminStats", () => {
  test("getLeadCounts counts leads per model (interest, test drive, undelivered) and per participation, only for the event", async () => {
    const f = await setup();
    const [first, second] = f.emModels;
    const foreign = f.otherModels[0];
    await insertLeads(f, first, [{ kind: "interest" }, { kind: "interest", delivered: true }, { kind: "test_drive" }]);
    await insertLeads(f, second, [{ kind: "interest" }]);
    await insertLeads(f, foreign, [{ kind: "interest" }, { kind: "interest" }]);

    const counts = await f.admin.query(api.fairAdminStats.getLeadCounts, { eventId: f.emId });
    expect(counts.capped).toBe(false);
    const byModel = new Map(counts.byModel.map((row) => [row.eventModelId, row]));
    expect(byModel.get(first._id)).toEqual({ eventModelId: first._id, interest: 2, testDrive: 1, undelivered: 2 });
    expect(byModel.get(second._id)).toEqual({ eventModelId: second._id, interest: 1, testDrive: 0, undelivered: 1 });
    expect(byModel.has(foreign._id)).toBe(false);
    const total = counts.byParticipation.reduce((sum, row) => sum + row.total, 0);
    const undelivered = counts.byParticipation.reduce((sum, row) => sum + row.undelivered, 0);
    expect({ total, undelivered }).toEqual({ total: 4, undelivered: 3 });
    const firstParticipation = counts.byParticipation.find((row) => row.participationId === first.participationId)!;
    expect(firstParticipation.total).toBe(first.participationId === second.participationId ? 4 : 3);
    // No contact data in the result.
    expect(JSON.stringify(counts)).not.toContain("example.invalid");
    expect(JSON.stringify(counts)).not.toContain("TEST Posetilac");

    const other = await f.admin.query(api.fairAdminStats.getLeadCounts, { eventId: f.otherId });
    expect(other.byModel).toEqual([{ eventModelId: foreign._id, interest: 2, testDrive: 0, undelivered: 2 }]);
  });

  test("getLeadCounts stops at the read budget and says the numbers are partial", async () => {
    const f = await setup();
    const model = f.emModels[0];
    await insertLeads(f, model, Array.from({ length: FAIR_LEAD_COUNT_LIMIT + 1 }, () => ({ kind: "interest" as const })));
    const counts = await f.admin.query(api.fairAdminStats.getLeadCounts, { eventId: f.emId });
    expect(counts.capped).toBe(true);
    expect(counts.byModel.find((row) => row.eventModelId === model._id)?.interest).toBe(FAIR_LEAD_COUNT_LIMIT);
  }, 60_000);

  test("getModelQrCodes returns the resolver code and SMQ of every assigned model of the event only", async () => {
    const f = await setup();
    const codes = await f.admin.query(api.fairAdminStats.getModelQrCodes, { eventId: f.emId });
    const seeded = f.seed.qr.filter((row) => row.eventCode === EM);
    expect(seeded.length).toBeGreaterThan(0);
    expect(codes.map((row) => row.resolverCode).sort()).toEqual(seeded.map((row) => row.resolverCode).sort());
    const emIds = new Set(f.emModels.map((model) => model._id as string));
    for (const row of codes) {
      expect(emIds.has(row.eventModelId)).toBe(true);
      expect(row.smqCode).toMatch(/^SMQ/);
    }
    const otherCodes = await f.admin.query(api.fairAdminStats.getModelQrCodes, { eventId: f.otherId });
    expect(otherCodes.map((row) => row.resolverCode).sort()).toEqual(f.seed.qr.filter((row) => row.eventCode === f.otherCode).map((row) => row.resolverCode).sort());
  });

  test("both queries refuse an anonymous and a non-admin caller", async () => {
    const f = await setup();
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairAdminStats.getLeadCounts, { eventId: f.emId })).rejects.toThrow();
      await expect(caller.query(api.fairAdminStats.getModelQrCodes, { eventId: f.emId })).rejects.toThrow();
    }
  });
});
