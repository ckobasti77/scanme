/// <reference types="vite/client" />

// Admin UX A4 — QR inventory of one event (convex/fairAdminQr.ts): the change
// of destination is one atomic transaction with a reason and history, the
// bulk assignment has a dry run and applies only correct rows idempotently,
// and the code detail shows the history and the scan numbers recorded by the
// existing /r/[cardCode] resolver (BACKEND-HANDOFF §5.1, §12 "Identitet i
// scanovi", MASTER §4.4, §5). All data is TEST.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_QR_BULK_MAX_ROWS, FAIR_QR_SCAN_STATS_MAX } from "../lib/fair-contract";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// Day 1 of the TEST elektromobilnost fair, 10:00 in Belgrade (CEST).
const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const ADMIN_EMAIL = "fair-a4-qr@scanme.test";
const ISSUER = "https://fair-a4-qr.test";
const VISITOR_SECRET = "test-fair-visitor-secret-0123456789abcdef";
// TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  delete process.env.FAIR_GATEWAY_SECRET;
  vi.useRealTimers();
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });

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
        accountId, name: `TEST lokal ${code}`, slug: `test-lokal-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: NOW,
      });
      const brandIds: Id<"brands">[] = [];
      for (const name of brandNames) {
        brandIds.push(await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: NOW, updatedAt: NOW }));
      }
      return { accountId, businessId, brandIds };
    };
    return { adminId, memberId, a: await client("TA4", ["TEST Volta"]), b: await client("TB4", []), inventory: await client("TQ4", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });

  // Both TEST fairs share one TEST inventory business, as the two real fairs can.
  const fair = async (code: string, startsAt: string, endsAt: string) => {
    const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
      code, slug: code, title: `TEST ${code}`, venueName: "TEST hala", startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt),
      status: "published", garagePriority: 1, qrInventoryBusinessId: ids.inventory.businessId,
    });
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: `${code}-izlagac-a`, accountId: ids.a.accountId, businessId: ids.a.businessId });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: `${code}-stand-a1`, code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "ispred-14" });
    return { eventId, participationId, standId };
  };
  const em = await fair("test-elektromobilnost-2026", "2026-10-09T00:00:00+02:00", "2026-10-12T00:00:00+02:00");
  const amf = await fair("test-auto-moto-fest-2026", "2026-10-30T00:00:00+01:00", "2026-11-02T00:00:00+01:00");

  const model = async (where: typeof em, externalKey: string, displayName: string) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId: where.eventId, participationId: where.participationId, standId: where.standId, brandId: ids.a.brandIds[0],
      externalKey, displayName, priceText: "TEST cena", specifications: [spec(1), spec(2)], packageTier: "starter", passportEligible: true,
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const slug = await t.run(async (ctx) => (await ctx.db.get(modelId))!.slug);
    return { modelId, slug, externalKey };
  };
  const x1 = await model(em, "test-em-volta-x1", "TEST Volta X1");
  const x2 = await model(em, "test-em-volta-x2", "TEST Volta X2");
  const x3 = await model(em, "test-em-volta-x3", "TEST Volta X3");
  const x4 = await model(em, "test-em-volta-x4", "TEST Volta X4");
  const x5 = await model(em, "test-em-volta-x5", "TEST Volta X5");
  const amfX1 = await model(amf, "test-amf-volta-x1", "TEST Volta X1");

  const qr = async (key: string, scope = { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId }) => {
    const digitalQrId = await admin.mutation(api.adminProducts.createDigital, { ...scope, key });
    return t.run(async (ctx) => {
      const digital = (await ctx.db.get(digitalQrId))!;
      const channel = (await ctx.db.get(digital.channelId))!;
      return { channelId: channel._id, cardId: channel.cardId, subjectId: channel.subjectId, resolverCode: channel.resolverCode, smqCode: digital.smqCode };
    });
  };
  const codes = {
    q1: await qr("test-a4-q1"), q2: await qr("test-a4-q2"), q3: await qr("test-a4-q3"), q4: await qr("test-a4-q4"), q5: await qr("test-a4-q5"), q6: await qr("test-a4-q6"),
    amf: await qr("test-a4-amf"),
  };
  const foreign = await qr("test-a4-foreign", { accountId: ids.b.accountId, businessId: ids.b.businessId });
  return { t, admin, member, ...ids, em, amf, x1, x2, x3, x4, x5, amfX1, codes, foreign };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

async function count(f: Fixture, table: TableNames) {
  return f.t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

/** Every table a QR change writes; a refused change must leave all of them as they were. */
async function qrState(f: Fixture) {
  return f.t.run(async (ctx) => JSON.stringify(await Promise.all(
    (["fairQrAssignments", "cardTargets", "accessSubjects", "accessChannels", "accessDestinationHistory", "accessChannelEvents", "adminAuditLog"] as const)
      .map((table) => ctx.db.query(table).collect()),
  )));
}

let sequence = 0;
async function scan(f: Fixture, code: string, visitorHash: string) {
  return f.t.mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-a4-request-${++sequence}`, deviceCategory: "mobile", ipHash: "test-hall-nat",
    fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}

describe("reassignQr — „Promeni odredište“", () => {
  test("moves the code to another model of the event in one transaction, with reason, history and the new resolver target", async () => {
    const f = await setup();
    const first = await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.codes.q1.resolverCode });
    const historyBefore = await count(f, "accessDestinationHistory");
    const eventsBefore = await f.t.run((ctx) => ctx.db.query("accessChannelEvents").withIndex("by_channelId_and_createdAt", (q) => q.eq("channelId", f.codes.q1.channelId)).collect());

    vi.setSystemTime(NOW + 60_000);
    const moved = await f.admin.mutation(api.fairAdminQr.reassignQr, { eventId: f.em.eventId, code: f.codes.q1.smqCode, toEventModelId: f.x2.modelId, reason: "  TEST nalepnica je na pogrešnom autu  " });
    expect(moved).toMatchObject({ fromAssignmentId: first.assignmentId, fromEventModelId: f.x1.modelId, toEventModelId: f.x2.modelId });

    const state = await f.t.run(async (ctx) => ({
      old: (await ctx.db.get(first.assignmentId))!,
      next: (await ctx.db.get(moved.toAssignmentId))!,
      channel: (await ctx.db.get(f.codes.q1.channelId))!,
      subject: (await ctx.db.get(f.codes.q1.subjectId))!,
      channelEvents: await ctx.db.query("accessChannelEvents").withIndex("by_channelId_and_createdAt", (q) => q.eq("channelId", f.codes.q1.channelId)).collect(),
      audit: await ctx.db.query("adminAuditLog").collect(),
    }));
    expect(state.old).toMatchObject({ status: "released", releasedAt: NOW + 60_000, releasedByUserId: f.adminId, reason: "TEST nalepnica je na pogrešnom autu" });
    expect(state.next).toMatchObject({ status: "assigned", eventId: f.em.eventId, eventModelId: f.x2.modelId, accessChannelId: f.codes.q1.channelId, assignedAt: NOW + 60_000, reason: "TEST nalepnica je na pogrešnom autu" });
    expect(await f.t.run((ctx) => ctx.db.get(state.subject.currentTargetId!))).toMatchObject({ kind: "fair_model", fairEventModelId: f.x2.modelId });
    expect(await count(f, "accessDestinationHistory")).toBe(historyBefore + 1);
    // The channel never passed through `problem`, as a release followed by an assign would.
    expect(state.channel.state).toBe("active");
    expect(state.channelEvents.length).toBe(eventsBefore.length);
    expect(state.audit.some((row) => row.action === "fair_qr_reassigned")).toBe(true);
    // One active row per channel and per model.
    const active = await f.t.run((ctx) => ctx.db.query("fairQrAssignments").withIndex("by_eventId_and_status", (q) => q.eq("eventId", f.em.eventId).eq("status", "assigned")).collect());
    expect(active.map((row) => row.eventModelId)).toEqual([f.x2.modelId]);

    // The printed code now opens the new model; resolveTest writes no scan.
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: f.codes.q1.resolverCode })).toMatchObject({ outcome: "fair_model", eventModelId: f.x2.modelId, path: `/sajam/test-elektromobilnost-2026/model/${f.x2.slug}` });
    expect(await count(f, "cardScanEvents")).toBe(0);
    const scanned = await scan(f, f.codes.q1.resolverCode, fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET));
    expect(scanned).toMatchObject({ kind: "fair_model", path: `/sajam/test-elektromobilnost-2026/model/${f.x2.slug}` });
  });

  test("a model that already has a QR, a model of the other event, no reason, the same model or a free code change nothing", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.codes.q1.resolverCode });
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x2.modelId, resolverCode: f.codes.q2.resolverCode });
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.amfX1.modelId, resolverCode: f.codes.amf.resolverCode });
    const before = await qrState(f);
    const reassign = (code: string, toEventModelId: Id<"fairEventModels">, reason = "TEST razlog") =>
      f.admin.mutation(api.fairAdminQr.reassignQr, { eventId: f.em.eventId, code, toEventModelId, reason });

    await expectCode(reassign(f.codes.q1.resolverCode, f.x2.modelId), "FAIR_MODEL_ALREADY_ASSIGNED");
    await expectCode(reassign(f.codes.q1.resolverCode, f.amfX1.modelId), "FAIR_MODEL_OTHER_EVENT");
    await expectCode(reassign(f.codes.q1.resolverCode, f.x3.modelId, ""), "FAIR_REASON_REQUIRED");
    await expectCode(reassign(f.codes.q1.resolverCode, f.x3.modelId, "  x "), "FAIR_REASON_REQUIRED");
    await expectCode(reassign(f.codes.q1.resolverCode, f.x3.modelId, "x".repeat(301)), "FAIR_REASON_REQUIRED");
    await expectCode(reassign(f.codes.q1.resolverCode, f.x1.modelId), "FAIR_QR_SAME_TARGET");
    await expectCode(reassign(f.codes.q3.resolverCode, f.x3.modelId), "FAIR_QR_NOT_ASSIGNED");
    await expectCode(reassign(f.codes.amf.resolverCode, f.x3.modelId), "FAIR_QR_OTHER_EVENT");
    await expectCode(reassign(f.foreign.resolverCode, f.x3.modelId), "FAIR_QR_NOT_IN_INVENTORY");
    await expectCode(reassign("ZZZZZZZZ", f.x3.modelId), "FAIR_QR_NOT_FOUND");
    expect(await qrState(f)).toBe(before);
  });
});

describe("bulk assignment — dry run and commit", () => {
  test("the dry run reports every row (unknown code, code taken, model has a QR, duplicates) and writes nothing", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.codes.q1.resolverCode });
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x4.modelId, resolverCode: f.codes.q5.resolverCode });
    const before = await qrState(f);
    // Every code and model appears once, except in the duplicate rows 8 and 9.
    const rows = [
      { code: f.codes.q2.smqCode, model: f.x2.externalKey },               // 0 ok (SMQ + externalKey)
      { code: f.codes.q1.resolverCode.toLowerCase(), model: f.x1.modelId }, // 1 unchanged (same pair, lower case, model id)
      { code: f.codes.q5.resolverCode, model: f.x3.externalKey },          // 2 code taken by X4
      { code: f.codes.q3.resolverCode, model: f.x4.externalKey },          // 3 X4 already has a QR
      { code: "ZZZZZZZZ", model: "test-nepostoji-a" },                     // 4 unknown code
      { code: f.foreign.resolverCode, model: "test-nepostoji-b" },         // 5 not in the inventory
      { code: f.codes.q4.resolverCode, model: "test-nepostoji-c" },        // 6 unknown model
      { code: f.codes.amf.resolverCode, model: f.amfX1.modelId },          // 7 model of the other event
      { code: f.codes.q6.resolverCode, model: f.x5.externalKey },          // 8 + 9 the same code twice
      { code: f.codes.q6.smqCode, model: f.x5.modelId },
      { code: "", model: f.x5.externalKey },                               // 10 empty cell
    ];
    const plan = await f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.em.eventId, rows });
    expect(plan.rows.map((row) => [row.index, row.status, row.issue ?? null])).toEqual([
      [0, "ok", null],
      [1, "unchanged", null],
      [2, "error", "FAIR_QR_ALREADY_ASSIGNED"],
      [3, "error", "FAIR_MODEL_ALREADY_ASSIGNED"],
      [4, "error", "FAIR_QR_NOT_FOUND"],
      [5, "error", "FAIR_QR_NOT_IN_INVENTORY"],
      [6, "error", "FAIR_MODEL_NOT_FOUND"],
      [7, "error", "FAIR_MODEL_OTHER_EVENT"],
      [8, "error", "FAIR_BULK_DUPLICATE_CODE"],
      [9, "error", "FAIR_BULK_DUPLICATE_CODE"],
      [10, "error", "FAIR_BULK_ROW_INVALID"],
    ]);
    expect(plan.rows[0]).toMatchObject({ resolverCode: f.codes.q2.resolverCode, smqCode: f.codes.q2.smqCode, eventModelId: f.x2.modelId });
    expect(plan.rows[2]).toMatchObject({ assignedEventModelId: f.x4.modelId });
    expect(plan.summary).toEqual({ ok: 1, unchanged: 1, errors: 9 });
    // The same model twice is a duplicate too.
    const twice = await f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.em.eventId, rows: [{ code: f.codes.q2.resolverCode, model: f.x2.externalKey }, { code: f.codes.q3.resolverCode, model: f.x2.modelId }] });
    expect(twice.rows.map((row) => row.issue)).toEqual(["FAIR_BULK_DUPLICATE_MODEL", "FAIR_BULK_DUPLICATE_MODEL"]);
    expect(await qrState(f)).toBe(before);
    await expectCode(
      f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.em.eventId, rows: Array.from({ length: FAIR_QR_BULK_MAX_ROWS + 1 }, () => ({ code: "ZZZZZZZZ", model: "x" })) }),
      "FAIR_BULK_TOO_LARGE",
    );
  });

  test("the commit applies only the correct rows; a repeated commit makes no duplicate", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.codes.q1.resolverCode });
    const rows = [
      { code: f.codes.q2.smqCode, model: f.x2.externalKey },
      { code: f.codes.q3.resolverCode, model: f.x3.modelId },
      { code: f.codes.q1.resolverCode, model: f.x1.externalKey },
      { code: "ZZZZZZZZ", model: "test-nepostoji" },
    ];
    const first = await f.admin.mutation(api.fairAdminQr.bulkAssignQrCommit, { eventId: f.em.eventId, rows: [...rows.slice(0, 3), rows[3]] });
    expect(first.summary).toEqual({ applied: 2, unchanged: 1, errors: 1 });
    expect(first.rows.map((row) => [row.index, row.status, row.issue ?? null])).toEqual([[0, "applied", null], [1, "applied", null], [2, "unchanged", null], [3, "error", "FAIR_QR_NOT_FOUND"]]);
    const assignments = async () => f.t.run((ctx) => ctx.db.query("fairQrAssignments").collect());
    const afterFirst = await assignments();
    expect(afterFirst.filter((row) => row.status === "assigned").map((row) => [row.eventModelId, row.resolverCode]).sort()).toEqual([
      [f.x1.modelId, f.codes.q1.resolverCode], [f.x2.modelId, f.codes.q2.resolverCode], [f.x3.modelId, f.codes.q3.resolverCode],
    ].sort());
    expect(afterFirst.find((row) => row.eventModelId === f.x2.modelId)).toMatchObject({ reason: "fair_qr_bulk_assigned", assignedByUserId: f.adminId });

    const before = await qrState(f);
    const again = await f.admin.mutation(api.fairAdminQr.bulkAssignQrCommit, { eventId: f.em.eventId, rows });
    expect(again.summary).toEqual({ applied: 0, unchanged: 3, errors: 1 });
    expect(await assignments()).toEqual(afterFirst);
    expect(await qrState(f)).toBe(before);
    // Each new code opens its model through the resolver.
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: f.codes.q3.resolverCode })).toMatchObject({ outcome: "fair_model", eventModelId: f.x3.modelId });
  });
});

describe("getQrDetail and getQrScanStats", () => {
  test("history newest first across events, SMQ lookup, and the fair numbers of the model the code leads to", async () => {
    const f = await setup();
    // q1: X1 → (reassign) X2; scanned twice by one visitor and once by another.
    vi.setSystemTime(NOW - 3_600_000);
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.codes.q1.resolverCode, reason: "TEST prva dodela" });
    vi.setSystemTime(NOW);
    await f.admin.mutation(api.fairAdminQr.reassignQr, { eventId: f.em.eventId, code: f.codes.q1.resolverCode, toEventModelId: f.x2.modelId, reason: "TEST zamena nalepnice" });
    const visitor = fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET);
    await scan(f, f.codes.q1.resolverCode, visitor);
    vi.setSystemTime(NOW + 60_000);
    await scan(f, f.codes.q1.resolverCode, visitor);

    const detail = (await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: f.codes.q1.smqCode }))!;
    expect(detail).toMatchObject({
      resolverCode: f.codes.q1.resolverCode, smqCode: f.codes.q1.smqCode, cardId: f.codes.q1.cardId, channelState: "active",
      current: { sameEvent: true, eventModelId: f.x2.modelId, modelLabel: "TEST Volta X2", modelStatus: "published", path: `/sajam/test-elektromobilnost-2026/model/${f.x2.slug}`, reason: "TEST zamena nalepnice" },
      stats: { total: 2, unique: 1 },
      lastScanAt: NOW + 60_000,
      totalScansAllTime: 2,
      historyCapped: false,
    });
    expect(detail.history.map((row) => [row.status, row.eventModelId, row.reason])).toEqual([
      ["assigned", f.x2.modelId, "TEST zamena nalepnice"],
      ["released", f.x1.modelId, "TEST zamena nalepnice"],
    ]);
    expect(detail.history[1]).toMatchObject({ assignedAt: NOW - 3_600_000, releasedAt: NOW, sameEvent: true, modelLabel: "TEST Volta X1" });
    // The lower-case resolver code finds the same code; a foreign or unknown code is not in the inventory.
    expect((await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: f.codes.q1.resolverCode.toLowerCase() }))?.cardId).toBe(f.codes.q1.cardId);
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: f.foreign.resolverCode })).toBeNull();
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "ZZZZZZZZ" })).toBeNull();

    // A code of the other fair: where it leads, but no numbers of this event.
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.amfX1.modelId, resolverCode: f.codes.amf.resolverCode });
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: f.codes.amf.resolverCode })).toMatchObject({
      current: { sameEvent: false, eventTitle: "TEST test-auto-moto-fest-2026", eventModelId: f.amfX1.modelId }, stats: null, history: [{ status: "assigned", sameEvent: false }],
    });
    // A free code that was never assigned.
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: f.codes.q3.resolverCode })).toMatchObject({ current: null, history: [], stats: null, lastScanAt: null, channelState: "problem" });

    const stats = await f.admin.query(api.fairAdminQr.getQrScanStats, {
      eventId: f.em.eventId, cardIds: [f.codes.q1.cardId, f.codes.q3.cardId, f.codes.amf.cardId, f.foreign.cardId, f.codes.q1.cardId],
    });
    expect(stats).toEqual([
      { cardId: f.codes.q1.cardId, eventModelId: f.x2.modelId, total: 2, unique: 1, lastScanAt: NOW + 60_000 },
      { cardId: f.codes.q3.cardId, eventModelId: null, total: null, unique: null, lastScanAt: null },
      { cardId: f.codes.amf.cardId, eventModelId: null, total: null, unique: null, lastScanAt: null },
    ]);
    await expectCode(f.admin.query(api.fairAdminQr.getQrScanStats, { eventId: f.em.eventId, cardIds: Array.from({ length: FAIR_QR_SCAN_STATS_MAX + 1 }, () => f.codes.q1.cardId) }), "INVALID_INPUT");
    // Reading the detail and the numbers records nothing.
    expect(await count(f, "cardScanEvents")).toBe(2);
    expect(await count(f, "fairScanEvents")).toBe(2);
  });
});

describe("authorization", () => {
  test("every fairAdminQr function refuses an anonymous and a non-admin caller before touching data", async () => {
    const f = await setup();
    const linked = await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.codes.q1.resolverCode });
    const before = await qrState(f);
    const rows = [{ code: f.codes.q2.resolverCode, model: f.x2.externalKey }];
    type Caller = Pick<Fixture["t"], "query" | "mutation">;
    const calls: [string, (caller: Caller) => Promise<unknown>][] = [
      ["getQrDetail", (c) => c.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: f.codes.q1.resolverCode })],
      ["getQrScanStats", (c) => c.query(api.fairAdminQr.getQrScanStats, { eventId: f.em.eventId, cardIds: [f.codes.q1.cardId] })],
      ["reassignQr", (c) => c.mutation(api.fairAdminQr.reassignQr, { eventId: f.em.eventId, code: f.codes.q1.resolverCode, toEventModelId: f.x3.modelId, reason: "TEST razlog" })],
      ["bulkAssignQrDryRun", (c) => c.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.em.eventId, rows })],
      ["bulkAssignQrCommit", (c) => c.mutation(api.fairAdminQr.bulkAssignQrCommit, { eventId: f.em.eventId, rows })],
      // N1 — field linking.
      ["linkSticker", (c) => c.mutation(api.fairAdminQr.linkSticker, { eventId: f.em.eventId, code: f.codes.q2.resolverCode, eventModelId: f.x2.modelId, expectedHolderModelId: null })],
      ["undoLink", (c) => c.mutation(api.fairAdminQr.undoLink, { assignmentId: linked.assignmentId })],
      ["listRecentLinks", (c) => c.query(api.fairAdminQr.listRecentLinks, { eventId: f.em.eventId, now: NOW })],
    ];
    for (const [name, call] of calls) {
      for (const [caller, expected] of [[f.t, "Niste prijavljeni."], [f.member, "Nemate administratorski pristup."]] as const) {
        const refused = await call(caller).then(() => false, (error: unknown) => String((error as { data?: unknown }).data ?? error).includes(expected));
        expect({ name, refused }).toEqual({ name, refused: true });
      }
    }
    expect(await qrState(f)).toBe(before);
  });
});
