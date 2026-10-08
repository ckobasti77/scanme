/// <reference types="vite/client" />

// Sajam 2026 N1 — QR stickers on the fair floor: the printed SA26 inventory
// (convex/fairPrintInventory.ts, TEST provisioning of SA26-001…012 + panels),
// every reasonable typed sticker number in every QR path, the guards of every
// new link (panel, withdrawn, draft), fairAdminQr.linkSticker / undoLink /
// listRecentLinks, adminProducts.bulkRetarget next to a linked sticker, and
// the admin shortcut of /r/[cardCode] („Poveži nalepnicu“) that writes no
// scan while visitors see exactly what they saw before. All data is TEST.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_QR_RECENT_LINKS_MAX, FAIR_QR_UNDO_WINDOW_MS } from "../lib/fair-contract";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// The morning the stickers go on the cars: the day before the TEST fair opens.
const NOW = Date.parse("2026-10-08T09:00:00+02:00");
const ADMIN_EMAIL = "fair-n1-nalepnice@scanme.test";
const ISSUER = "https://fair-n1.test";
const VISITOR_SECRET = "test-fair-visitor-secret-0123456789abcdef";
// TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const EM = "test-elektromobilnost-2026";
const AMF = "test-auto-moto-fest-2026";
const REASON = { link: "Teren: povezivanje nalepnice", move: "Teren: premeštanje nalepnice", replace: "Teren: zamena nalepnice", undo: "Teren: poništeno povezivanje", restore: "Teren: vraćeno posle poništavanja" };

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
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: NOW,
      });
      const brandIds: Id<"brands">[] = [];
      for (const name of brandNames) {
        brandIds.push(await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: NOW, updatedAt: NOW }));
      }
      return { accountId, businessId, brandIds };
    };
    return { adminId, memberId, a: await client("TN1A", ["TEST Volta"]), b: await client("TN1B", ["TEST Om"]), foreign: await client("TN1F", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });

  // The printed inventory exactly as on DEV/production: SA26-001…012 (TEST batch) and the three panels.
  const printed = await t.mutation(internal.fairPrintInventory.provisionBatch, { ownerEmail: ADMIN_EMAIL, startOrdinal: 1, count: 12 });
  const panels = await t.mutation(internal.fairPrintInventory.provisionPanels, { ownerEmail: ADMIN_EMAIL });
  const inventory = await t.run(async (ctx) => (await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", "SML-SAJAM-26-QR")).first())!);
  const sticker = async (n: number) => {
    const row = printed[n - 1];
    return t.run(async (ctx) => {
      const digital = (await ctx.db.get(row.digitalQrId))!;
      const channel = (await ctx.db.get(digital.channelId))!;
      return { label: row.printedCode, resolverCode: channel.resolverCode, smqCode: digital.smqCode, channelId: channel._id, cardId: channel.cardId, subjectId: channel.subjectId };
    });
  };
  const s: Record<number, Awaited<ReturnType<typeof sticker>>> = {};
  for (let n = 1; n <= 12; n += 1) s[n] = await sticker(n);
  const panel = await t.run(async (ctx) => {
    const digital = (await ctx.db.get(panels[0].digitalQrId))!;
    const channel = (await ctx.db.get(digital.channelId))!;
    return { label: panels[0].printedCode, resolverCode: channel.resolverCode, channelId: channel._id, cardId: channel.cardId };
  });

  // Both TEST fairs use the printed inventory, as the two real fairs can.
  const fair = async (code: string, startsAt: string, endsAt: string) => {
    const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
      code, slug: code, title: `TEST ${code}`, venueName: "TEST hala", startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt),
      status: "published", garagePriority: 1, qrInventoryBusinessId: inventory._id,
    });
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: `${code}-izlagac-a`, accountId: ids.a.accountId, businessId: ids.a.businessId });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: `${code}-stand-a1`, code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "ispred-14" });
    return { eventId, participationId, standId };
  };
  const em = await fair(EM, "2026-10-09T00:00:00+02:00", "2026-10-12T00:00:00+02:00");
  const amf = await fair(AMF, "2026-10-30T00:00:00+01:00", "2026-11-02T00:00:00+01:00");
  const emB = await t.run(async (ctx) => {
    const participationId = await ctx.db.insert("fairParticipations", { externalKey: `${EM}-izlagac-b`, eventId: em.eventId, accountId: ids.b.accountId, businessId: ids.b.businessId, status: "active", createdAt: NOW, updatedAt: NOW });
    const standId = await ctx.db.insert("fairStands", { eventId: em.eventId, participationId, externalKey: `${EM}-stand-b1`, code: "TEST-B1", displayName: "TEST štand B1", mapLocationId: "ispred-18", status: "active", createdAt: NOW, updatedAt: NOW });
    return { participationId, standId };
  });

  const model = async (where: { eventId: Id<"fairEvents">; participationId: Id<"fairParticipations">; standId: Id<"fairStands"> }, brandId: Id<"brands">, externalKey: string, displayName: string, status: "published" | "draft" | "withdrawn", variant?: string) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId: where.eventId, participationId: where.participationId, standId: where.standId, brandId,
      externalKey, displayName, ...(variant ? { variant } : {}), priceText: "TEST cena", specifications: [spec(1), spec(2)], packageTier: "starter", passportEligible: true,
    });
    if (status !== "draft") await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    if (status === "withdrawn") await admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: modelId });
    const slug = await t.run(async (ctx) => (await ctx.db.get(modelId))!.slug);
    return { modelId, slug };
  };
  const brand = ids.a.brandIds[0];
  const x1 = await model(em, brand, "test-n1-volta-x1", "TEST Volta X1", "published", "Premium");
  const x2 = await model(em, brand, "test-n1-volta-x2", "TEST Volta X2", "published");
  const x3 = await model(em, brand, "test-n1-volta-x3", "TEST Volta X3", "published");
  const x4 = await model(em, brand, "test-n1-volta-x4", "TEST Volta X4", "published");
  const draft = await model(em, brand, "test-n1-volta-nacrt", "TEST Volta nacrt", "draft");
  const withdrawn = await model(em, brand, "test-n1-volta-povucen", "TEST Volta povučen", "withdrawn");
  const omB = await model({ eventId: em.eventId, ...emB }, ids.b.brandIds[0], "test-n1-om-b1", "TEST Om B1", "draft");
  const amfX1 = await model(amf, brand, "test-n1-amf-volta-x1", "TEST Volta X1", "published");
  return { t, admin, member, ...ids, inventory, s, panel, em, amf, emB, x1, x2, x3, x4, draft, withdrawn, omB, amfX1 };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
type Caller = Pick<Fixture["t"], "query" | "mutation">;

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

const active = (f: Fixture, eventModelId: Id<"fairEventModels">) =>
  f.t.run((ctx) => ctx.db.query("fairQrAssignments").withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", eventModelId).eq("status", "assigned")).first());

const link = (f: Fixture, code: string, eventModelId: Id<"fairEventModels">, expectedHolderModelId: Id<"fairEventModels"> | null, replaceModelSticker?: boolean, expectedModelStickerCode?: string | null) =>
  f.admin.mutation(api.fairAdminQr.linkSticker, {
    eventId: f.em.eventId, code, eventModelId, expectedHolderModelId,
    ...(replaceModelSticker === undefined ? {} : { replaceModelSticker }),
    ...(expectedModelStickerCode === undefined ? {} : { expectedModelStickerCode }),
  });

let sequence = 0;
function scan(caller: Caller, code: string, visitorHash?: string) {
  return caller.mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-n1-request-${++sequence}`, deviceCategory: "mobile", ipHash: `test-n1-ip-${sequence}`,
    ...(visitorHash ? { fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash } : {}),
  });
}

describe("typed sticker numbers in every QR path", () => {
  test("assignQr, getQrDetail, resolveTest and the bulk dry run take 7, sa26 8, SA26_009 … from the event's inventory", async () => {
    const f = await setup();
    const first = await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: "7" });
    expect(first).toMatchObject({ created: true, modelStatus: "published" });
    expect((await active(f, f.x1.modelId))?.accessChannelId).toBe(f.s[7].channelId);
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x2.modelId, resolverCode: " sa26 8 " });
    expect((await active(f, f.x2.modelId))?.accessChannelId).toBe(f.s[8].channelId);
    // By the SMQ serial printed under the code.
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x4.modelId, resolverCode: f.s[12].smqCode.toLowerCase() });
    expect((await active(f, f.x4.modelId))?.accessChannelId).toBe(f.s[12].channelId);
    // The same pair again, typed differently: unchanged.
    expect(await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: "SA26–007" })).toEqual({ assignmentId: first.assignmentId, created: false, modelStatus: "published" });

    for (const code of ["SA26_009", "9", "sa26-o9", f.s[9].smqCode, f.s[9].resolverCode.toLowerCase()]) {
      expect({ code, cardId: (await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code }))?.cardId }).toEqual({ code, cardId: f.s[9].cardId });
    }
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "13" })).toBeNull();
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "SA27-007" })).toBeNull();
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "0" })).toBeNull();
    expect(await f.admin.query(api.fairAdmin.resolveTest, { eventId: f.em.eventId, resolverCode: "sa26 7" })).toMatchObject({
      resolverCode: f.s[7].resolverCode, outcome: "fair_model", eventModelId: f.x1.modelId, path: `/sajam/${EM}/model/${f.x1.slug}`,
    });
    // Without the event a label is no resolver code.
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: "sa26 7" })).toMatchObject({ outcome: "invalid", problem: "code_invalid" });

    const plan = await f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, {
      eventId: f.em.eventId,
      rows: [{ code: "SA26 10", model: "test-n1-volta-x3" }, { code: "11", model: "test-n1-volta-nacrt" }, { code: "77", model: "test-n1-volta-x4" }],
    });
    expect(plan.rows.map((row) => [row.status, row.issue ?? null, row.resolverCode ?? null, row.modelStatus ?? null])).toEqual([
      ["ok", null, f.s[10].resolverCode, "published"],
      ["ok", null, f.s[11].resolverCode, "draft"],
      ["error", "FAIR_QR_NOT_FOUND", null, "published"],
    ]);
    const commit = await f.admin.mutation(api.fairAdminQr.bulkAssignQrCommit, { eventId: f.em.eventId, rows: [{ code: "SA26 10", model: "test-n1-volta-x3" }] });
    expect(commit.rows).toEqual([{ index: 0, status: "applied", modelStatus: "published" }]);
  });

  test("a label is looked up in the event's current inventory only, through the label index", async () => {
    const f = await setup();
    // A card of another business with the same printed text is never this event's sticker 5.
    const foreignCard = await f.t.run(async (ctx) => ctx.db.insert("cards", { businessId: f.foreign.businessId, cardCode: "TN1F0005", label: "SA26-005", status: "active", totalScans: 0, createdAt: NOW, updatedAt: NOW }));
    expect((await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "5" }))?.cardId).toBe(f.s[5].cardId);
    expect(foreignCard).not.toBe(f.s[5].cardId);
    // A panel is found by its whole label and is shown as a panel.
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "panel-2026-event" })).toMatchObject({ cardId: f.panel.cardId, kind: "panel", label: "PANEL-2026-EVENT" });
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "SA26-005" })).toMatchObject({ kind: "sticker", label: "SA26-005" });
  });
});

describe("guards of every new link", () => {
  test("a panel is no car sticker: FAIR_QR_NOT_MODEL_STICKER in assignQr, linkSticker and the bulk check; nothing written", async () => {
    const f = await setup();
    const before = await qrState(f);
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: "PANEL-2026-EVENT" }), "FAIR_QR_NOT_MODEL_STICKER");
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: f.panel.resolverCode }), "FAIR_QR_NOT_MODEL_STICKER");
    await expectCode(link(f, f.panel.resolverCode, f.x1.modelId, null), "FAIR_QR_NOT_MODEL_STICKER");
    const plan = await f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.em.eventId, rows: [{ code: f.panel.label, model: "test-n1-volta-x1" }] });
    expect(plan.rows[0]).toMatchObject({ status: "error", issue: "FAIR_QR_NOT_MODEL_STICKER" });
    expect(await qrState(f)).toBe(before);
  });

  test("a withdrawn model or a withdrawn participation takes no new link: FAIR_MODEL_WITHDRAWN; nothing written", async () => {
    const f = await setup();
    const before = await qrState(f);
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.withdrawn.modelId, resolverCode: "1" }), "FAIR_MODEL_WITHDRAWN");
    await expectCode(link(f, "1", f.withdrawn.modelId, null), "FAIR_MODEL_WITHDRAWN");
    const plan = await f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.em.eventId, rows: [{ code: "1", model: "test-n1-volta-povucen" }] });
    expect(plan.rows[0]).toMatchObject({ status: "error", issue: "FAIR_MODEL_WITHDRAWN", modelStatus: "withdrawn" });
    // A reassign onto a withdrawn model is refused too.
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: "2" });
    const withLink = await qrState(f);
    await expectCode(f.admin.mutation(api.fairAdminQr.reassignQr, { eventId: f.em.eventId, code: "2", toEventModelId: f.withdrawn.modelId, reason: "TEST razlog" }), "FAIR_MODEL_WITHDRAWN");
    expect(await qrState(f)).toBe(withLink);
    await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: f.x1.modelId, reason: "TEST vraćanje" });
    // The participation of exhibitor B is withdrawn: its draft model takes nothing.
    await f.t.run((ctx) => ctx.db.patch(f.emB.participationId, { status: "withdrawn" }));
    const withdrawnParticipation = await qrState(f);
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.omB.modelId, resolverCode: "3" }), "FAIR_MODEL_WITHDRAWN");
    await expectCode(link(f, "3", f.omB.modelId, null), "FAIR_MODEL_WITHDRAWN");
    expect(await qrState(f)).toBe(withdrawnParticipation);
    expect(before).not.toBe(withdrawnParticipation);
  });

  test("a draft model is allowed and every path returns its status", async () => {
    const f = await setup();
    expect(await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.draft.modelId, resolverCode: "4" })).toMatchObject({ created: true, modelStatus: "draft" });
    await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: f.draft.modelId, reason: "TEST" });
    expect(await link(f, "4", f.draft.modelId, null)).toMatchObject({ created: true, label: "SA26-004", modelStatus: "draft" });
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.x1.modelId, resolverCode: "5" });
    expect(await f.admin.mutation(api.fairAdminQr.reassignQr, { eventId: f.em.eventId, code: "5", toEventModelId: f.omB.modelId, reason: "TEST na nacrt" })).toMatchObject({ toEventModelId: f.omB.modelId, modelStatus: "draft" });
  });

  test("withdrawing a linked model keeps the link and reports it (FAIR_QR_STILL_LINKED); no silent link", async () => {
    const f = await setup();
    await link(f, "6", f.x3.modelId, null);
    const result = await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.x3.modelId });
    expect(result).toMatchObject({ status: "withdrawn", changed: true });
    expect(result.warnings).toEqual([{ severity: "warning", code: "FAIR_QR_STILL_LINKED", path: "qr", details: { resolverCode: f.s[6].resolverCode, label: "SA26-006" } }]);
    expect((await active(f, f.x3.modelId))?.accessChannelId).toBe(f.s[6].channelId);
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("adminAuditLog").collect()).filter((row) => row.action === "fair_model_withdrawn").map((row) => JSON.parse(row.detail!)));
    expect(audit.find((detail) => detail.eventModelId === f.x3.modelId)).toMatchObject({ qrStillLinked: f.s[6].resolverCode });
    // A model without a sticker: no warning.
    expect((await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.x4.modelId })).warnings).toEqual([]);
  });
});

describe("linkSticker — one atomic call on the fair floor", () => {
  test("a free sticker is linked with the automatic reason, a new target, history, channel sync and audit", async () => {
    const f = await setup();
    const history = await count(f, "accessDestinationHistory");
    const result = await link(f, "sa26 7", f.x1.modelId, null);
    expect(result).toEqual({ assignmentId: result.assignmentId, created: true, label: "SA26-007", resolverCode: f.s[7].resolverCode, modelStatus: "published" });
    const state = await f.t.run(async (ctx) => ({
      row: (await ctx.db.get(result.assignmentId))!,
      subject: (await ctx.db.get(f.s[7].subjectId))!,
      channel: (await ctx.db.get(f.s[7].channelId))!,
      audit: (await ctx.db.query("adminAuditLog").collect()).filter((row) => row.action === "fair_qr_assigned"),
    }));
    expect(state.row).toMatchObject({ status: "assigned", eventId: f.em.eventId, eventModelId: f.x1.modelId, reason: REASON.link, assignedByUserId: f.adminId, assignedAt: NOW });
    expect(state.row.previousAssignmentId).toBeUndefined();
    expect(state.row.replacedAssignmentId).toBeUndefined();
    expect(state.subject.destinationKind).toBe("fair_model");
    expect(await f.t.run((ctx) => ctx.db.get(state.subject.currentTargetId!))).toMatchObject({ kind: "fair_model", fairEventModelId: f.x1.modelId });
    expect(await count(f, "accessDestinationHistory")).toBe(history + 1);
    expect(state.channel.state).toBe("active");
    expect(state.audit).toHaveLength(1);
    // A visitor's scan opens the car.
    expect(await scan(f.t, f.s[7].resolverCode, fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET))).toMatchObject({ kind: "fair_model", path: `/sajam/${EM}/model/${f.x1.slug}` });
  });

  test("the same car and sticker again is idempotent: the same row, nothing written", async () => {
    const f = await setup();
    const first = await link(f, "7", f.x1.modelId, null);
    const before = await qrState(f);
    expect(await link(f, "SA26-007", f.x1.modelId, null)).toEqual({ ...first, created: false });
    expect(await link(f, f.s[7].smqCode, f.x1.modelId, f.x1.modelId, true)).toEqual({ ...first, created: false });
    expect(await qrState(f)).toBe(before);
  });

  test("a move needs the exact current holder: the wrong one (or none) → FAIR_QR_HOLDER_CHANGED and no row changes", async () => {
    const f = await setup();
    const onA = await link(f, "7", f.x1.modelId, null);
    const before = await qrState(f);
    const rows = await count(f, "fairQrAssignments");
    // The admin saw the sticker free, or on another car: refused.
    await expectCode(link(f, "7", f.x2.modelId, null), "FAIR_QR_HOLDER_CHANGED");
    await expectCode(link(f, "7", f.x2.modelId, f.x3.modelId), "FAIR_QR_HOLDER_CHANGED");
    await expect(link(f, "7", f.x2.modelId, null)).rejects.toMatchObject({ data: { code: "FAIR_QR_HOLDER_CHANGED", details: { holderModelId: f.x1.modelId } } });
    // A free sticker confirmed as „on car A“ is refused too.
    await expectCode(link(f, "8", f.x2.modelId, f.x1.modelId), "FAIR_QR_HOLDER_CHANGED");
    expect(await count(f, "fairQrAssignments")).toBe(rows);
    expect(await qrState(f)).toBe(before);

    // The confirmed holder: moved in one transaction, the channel never passes through `problem`.
    const eventsBefore = await f.t.run((ctx) => ctx.db.query("accessChannelEvents").withIndex("by_channelId_and_createdAt", (q) => q.eq("channelId", f.s[7].channelId)).collect());
    vi.setSystemTime(NOW + 60_000);
    const moved = await link(f, "7", f.x2.modelId, f.x1.modelId);
    expect(moved).toMatchObject({ created: true, label: "SA26-007", movedFromModelId: f.x1.modelId });
    expect(moved.replacedLabel).toBeUndefined();
    expect(await f.t.run((ctx) => ctx.db.get(onA.assignmentId))).toMatchObject({ status: "released", releasedAt: NOW + 60_000, reason: REASON.move });
    expect(await f.t.run((ctx) => ctx.db.get(moved.assignmentId))).toMatchObject({ status: "assigned", eventModelId: f.x2.modelId, reason: REASON.move, previousAssignmentId: onA.assignmentId });
    expect(await active(f, f.x1.modelId)).toBeNull();
    expect((await f.t.run((ctx) => ctx.db.get(f.s[7].channelId)))!.state).toBe("active");
    expect(await f.t.run((ctx) => ctx.db.query("accessChannelEvents").withIndex("by_channelId_and_createdAt", (q) => q.eq("channelId", f.s[7].channelId)).collect())).toHaveLength(eventsBefore.length);
    expect((await f.t.run((ctx) => ctx.db.query("adminAuditLog").collect())).some((row) => row.action === "fair_qr_reassigned")).toBe(true);
  });

  test("a car that has another sticker: refused without replaceModelSticker, replaced with it (the old one is freed)", async () => {
    const f = await setup();
    const old = await link(f, "2", f.x1.modelId, null);
    const before = await qrState(f);
    await expect(link(f, "7", f.x1.modelId, null)).rejects.toMatchObject({ data: { code: "FAIR_MODEL_ALREADY_ASSIGNED", details: { resolverCode: f.s[2].resolverCode } } });
    await expectCode(link(f, "7", f.x1.modelId, null, false), "FAIR_MODEL_ALREADY_ASSIGNED");
    expect(await qrState(f)).toBe(before);

    // P2: the replacement names the car's sticker the admin saw (SA26-002).
    const replaced = await link(f, "7", f.x1.modelId, null, true, f.s[2].resolverCode);
    expect(replaced).toMatchObject({ created: true, label: "SA26-007", replacedLabel: "SA26-002" });
    expect(replaced.movedFromModelId).toBeUndefined();
    expect(await f.t.run((ctx) => ctx.db.get(old.assignmentId))).toMatchObject({ status: "released", reason: REASON.replace });
    expect(await f.t.run((ctx) => ctx.db.get(replaced.assignmentId))).toMatchObject({ status: "assigned", reason: REASON.link, replacedAssignmentId: old.assignmentId });
    expect(await f.t.run((ctx) => ctx.db.get(f.s[2].channelId))).toMatchObject({ state: "problem", problemReason: "destination_fair_unassigned" });
    expect(await scan(f.t, f.s[2].resolverCode)).toEqual({ kind: "invalid" });
  });

  test("P2 (RN N3): a replacement on stale data — the car's sticker changed since the admin saw it — is FAIR_QR_HOLDER_CHANGED and writes nothing", async () => {
    const f = await setup();
    // Admin 1 sees car X1 with SA26-002. Meanwhile admin 2 replaces it with SA26-003.
    await link(f, "2", f.x1.modelId, null);
    await link(f, "3", f.x1.modelId, null, true, f.s[2].resolverCode);
    const before = await qrState(f);
    const rows = await count(f, "fairQrAssignments");
    // Admin 1 replaces „SA26-002“ with SA26-007: the car now has SA26-003, which admin 1 never saw.
    await expect(link(f, "7", f.x1.modelId, null, true, f.s[2].resolverCode))
      .rejects.toMatchObject({ data: { code: "FAIR_QR_HOLDER_CHANGED", details: { modelResolverCode: f.s[3].resolverCode } } });
    // Without naming the car's sticker (or naming none) a replacement never releases one.
    await expectCode(link(f, "7", f.x1.modelId, null, true), "FAIR_QR_HOLDER_CHANGED");
    await expectCode(link(f, "7", f.x1.modelId, null, true, null), "FAIR_QR_HOLDER_CHANGED");
    expect(await count(f, "fairQrAssignments")).toBe(rows);
    expect(await qrState(f)).toBe(before);
    expect((await active(f, f.x1.modelId))?.accessChannelId).toBe(f.s[3].channelId);

    // The car's sticker was released in the meantime: „replace SA26-003“ is stale too.
    await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: f.x1.modelId, reason: "TEST oslobađanje" });
    const released = await qrState(f);
    await expect(link(f, "7", f.x1.modelId, null, true, f.s[3].resolverCode))
      .rejects.toMatchObject({ data: { code: "FAIR_QR_HOLDER_CHANGED", details: { modelResolverCode: "none" } } });
    expect(await qrState(f)).toBe(released);

    // What the admin sees now (none) links.
    expect(await link(f, "7", f.x1.modelId, null, true, null)).toMatchObject({ created: true, label: "SA26-007" });
    expect((await active(f, f.x1.modelId))?.accessChannelId).toBe(f.s[7].channelId);
  });

  test("a sticker on a car of the other fair is not taken over (FAIR_QR_OTHER_EVENT); a car of the other fair is refused", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.amfX1.modelId, resolverCode: "12" });
    const before = await qrState(f);
    await expectCode(link(f, "12", f.x1.modelId, f.amfX1.modelId), "FAIR_QR_OTHER_EVENT");
    await expectCode(link(f, "1", f.amfX1.modelId, null), "FAIR_MODEL_OTHER_EVENT");
    await expectCode(link(f, "77", f.x1.modelId, null), "FAIR_QR_NOT_FOUND");
    await expectCode(link(f, "TN1F0005", f.x1.modelId, null), "FAIR_QR_NOT_FOUND");
    expect(await qrState(f)).toBe(before);
  });
});

describe("undoLink — 15 minutes, only the active link", () => {
  test("undo a plain link: the sticker is free again, audited", async () => {
    const f = await setup();
    const linked = await link(f, "7", f.x1.modelId, null);
    vi.setSystemTime(NOW + 5 * 60_000);
    expect(await f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: linked.assignmentId })).toEqual({
      undoneAssignmentId: linked.assignmentId, restoredToModelId: null, restoredAssignmentId: null, restoredReplacedLabel: null, restoredReplacedAssignmentId: null,
    });
    expect(await f.t.run((ctx) => ctx.db.get(linked.assignmentId))).toMatchObject({ status: "released", reason: REASON.undo, releasedAt: NOW + 5 * 60_000 });
    expect(await active(f, f.x1.modelId)).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.get(f.s[7].channelId))).toMatchObject({ state: "problem", problemReason: "destination_fair_unassigned" });
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("adminAuditLog").collect()).filter((row) => row.action === "fair_qr_link_undone"));
    expect(audit).toHaveLength(1);
    // Undone once: a second undo is superseded.
    await expectCode(f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: linked.assignmentId }), "FAIR_QR_UNDO_SUPERSEDED");
  });

  test("undo a move: the sticker goes back to its previous car", async () => {
    const f = await setup();
    const onA = await link(f, "7", f.x1.modelId, null);
    const moved = await link(f, "7", f.x2.modelId, f.x1.modelId);
    const result = await f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: moved.assignmentId });
    expect(result).toMatchObject({ undoneAssignmentId: moved.assignmentId, restoredToModelId: f.x1.modelId, restoredReplacedLabel: null });
    expect(await active(f, f.x2.modelId)).toBeNull();
    expect(await active(f, f.x1.modelId)).toMatchObject({ _id: result.restoredAssignmentId, accessChannelId: f.s[7].channelId, reason: REASON.restore });
    expect(await f.t.run((ctx) => ctx.db.get(onA.assignmentId))).toMatchObject({ status: "released" });
    expect((await f.t.run((ctx) => ctx.db.get(f.s[7].channelId)))!.state).toBe("active");
    expect(await scan(f.t, f.s[7].resolverCode, fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET))).toMatchObject({ kind: "fair_model", path: `/sajam/${EM}/model/${f.x1.slug}` });
  });

  test("undo a replacement: the car gets its former sticker back while that one is still free", async () => {
    const f = await setup();
    await link(f, "2", f.x1.modelId, null);
    const replaced = await link(f, "7", f.x1.modelId, null, true, f.s[2].resolverCode);
    const result = await f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: replaced.assignmentId });
    expect(result).toMatchObject({ restoredToModelId: null, restoredAssignmentId: null, restoredReplacedLabel: "SA26-002" });
    expect(await active(f, f.x1.modelId)).toMatchObject({ _id: result.restoredReplacedAssignmentId, accessChannelId: f.s[2].channelId, reason: REASON.restore });
    expect(await f.t.run((ctx) => ctx.db.get(f.s[7].channelId))).toMatchObject({ state: "problem" });
  });

  test("undo a replacement after the former sticker went to another car: only the new link is removed", async () => {
    const f = await setup();
    await link(f, "2", f.x1.modelId, null);
    const replaced = await link(f, "7", f.x1.modelId, null, true, f.s[2].resolverCode);
    await link(f, "2", f.x3.modelId, null);
    const result = await f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: replaced.assignmentId });
    expect(result).toMatchObject({ restoredReplacedLabel: null, restoredReplacedAssignmentId: null });
    expect(await active(f, f.x1.modelId)).toBeNull();
    expect((await active(f, f.x3.modelId))?.accessChannelId).toBe(f.s[2].channelId);
  });

  test("undo a move after the previous car got another sticker: FAIR_QR_UNDO_SUPERSEDED, nothing written", async () => {
    const f = await setup();
    await link(f, "7", f.x1.modelId, null);
    const moved = await link(f, "7", f.x2.modelId, f.x1.modelId);
    await link(f, "8", f.x1.modelId, null);
    const before = await qrState(f);
    await expectCode(f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: moved.assignmentId }), "FAIR_QR_UNDO_SUPERSEDED");
    expect(await qrState(f)).toBe(before);
  });

  test("a link moved on since, or released, is superseded; after 15 minutes the undo has expired (fake timers)", async () => {
    const f = await setup();
    const first = await link(f, "7", f.x1.modelId, null);
    await link(f, "7", f.x2.modelId, f.x1.modelId);
    await expectCode(f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: first.assignmentId }), "FAIR_QR_UNDO_SUPERSEDED");

    const late = await link(f, "9", f.x3.modelId, null);
    const before = await qrState(f);
    vi.setSystemTime(NOW + FAIR_QR_UNDO_WINDOW_MS + 1);
    await expectCode(f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: late.assignmentId }), "FAIR_QR_UNDO_EXPIRED");
    expect(await qrState(f)).toBe(before);
    // Exactly at the end of the window it still works.
    vi.setSystemTime(NOW + FAIR_QR_UNDO_WINDOW_MS);
    expect(await f.admin.mutation(api.fairAdminQr.undoLink, { assignmentId: late.assignmentId })).toMatchObject({ undoneAssignmentId: late.assignmentId });
  });
});

describe("listRecentLinks", () => {
  test("the newest active links of the event with car, exhibitor, stand, who and when, and canUndo at the given time", async () => {
    const f = await setup();
    await link(f, "7", f.x1.modelId, null);
    vi.setSystemTime(NOW + 60_000);
    await link(f, "8", f.omB.modelId, null);
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: f.amfX1.modelId, resolverCode: "12" });
    const list = await f.admin.query(api.fairAdminQr.listRecentLinks, { eventId: f.em.eventId, now: NOW + 2 * 60_000 });
    expect(list.labelFormat).toEqual({ prefix: "SA26", digits: 3, max: 12 });
    expect(list.links).toHaveLength(2);
    expect(list.links[0]).toMatchObject({
      label: "SA26-008", resolverCode: f.s[8].resolverCode, eventModelId: f.omB.modelId, modelName: "TEST Om B1", modelVariant: null, modelStatus: "draft",
      brandName: "TEST Om", exhibitorName: "TEST izlagač TN1B", standCode: "TEST-B1", standName: "TEST štand B1",
      linkedAt: NOW + 60_000, linkedByUserId: f.adminId, linkedByName: ADMIN_EMAIL, reason: REASON.link, undoUntil: NOW + 60_000 + FAIR_QR_UNDO_WINDOW_MS, canUndo: true,
    });
    expect(list.links[1]).toMatchObject({ label: "SA26-007", modelName: "TEST Volta X1", modelVariant: "Premium", modelStatus: "published", brandName: "TEST Volta", exhibitorName: "TEST izlagač TN1A", standCode: "TEST-A1", canUndo: true });
    const later = await f.admin.query(api.fairAdminQr.listRecentLinks, { eventId: f.em.eventId, now: NOW + 16 * 60_000, limit: 1 });
    expect(later.links.map((row) => [row.label, row.canUndo])).toEqual([["SA26-008", true]]);
    const latest = await f.admin.query(api.fairAdminQr.listRecentLinks, { eventId: f.em.eventId, now: NOW + 17 * 60_000 });
    expect(latest.links.map((row) => row.canUndo)).toEqual([false, false]);
    for (const limit of [0, FAIR_QR_RECENT_LINKS_MAX + 1, 1.5]) {
      await expectCode(f.admin.query(api.fairAdminQr.listRecentLinks, { eventId: f.em.eventId, now: NOW, limit }), "INVALID_INPUT");
    }
  });

  test("the QR reads name the code's kind, label, model status, exhibitor and stand", async () => {
    const f = await setup();
    await link(f, "7", f.x1.modelId, null);
    const detail = (await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.em.eventId, code: "7" }))!;
    expect(detail).toMatchObject({ kind: "sticker", label: "SA26-007", current: { modelStatus: "published", brandName: "TEST Volta", exhibitorName: "TEST izlagač TN1A", standCode: "TEST-A1", standName: "TEST štand A1" } });
    const page = await f.admin.query(api.fairAdmin.listQrInventory, { eventId: f.em.eventId, paginationOpts: { numItems: 100, cursor: null } });
    expect(page.page).toHaveLength(15);
    expect(page.page.find((row) => row.cardId === f.s[7].cardId)).toMatchObject({ kind: "sticker", label: "SA26-007", assignment: { eventModelId: f.x1.modelId, modelStatus: "published", exhibitorName: "TEST izlagač TN1A", standCode: "TEST-A1", standName: "TEST štand A1" } });
    expect(page.page.find((row) => row.cardId === f.panel.cardId)).toMatchObject({ kind: "panel", label: "PANEL-2026-EVENT", assignment: null });
    expect(await f.admin.query(api.fairAdminStats.getModelQrCodes, { eventId: f.em.eventId })).toEqual([{
      eventModelId: f.x1.modelId, resolverCode: f.s[7].resolverCode, smqCode: f.s[7].smqCode, label: "SA26-007", kind: "sticker",
      modelStatus: "published", exhibitorName: "TEST izlagač TN1A", standCode: "TEST-A1", standName: "TEST štand A1",
    }]);
  });
});

describe("adminProducts.bulkRetarget next to a fair sticker", () => {
  test("an actively linked sticker is skipped with a reason, never overwritten; a free code is retargeted", async () => {
    const f = await setup();
    await link(f, "7", f.x1.modelId, null);
    const linkBefore = await f.t.run(async (ctx) => ({ subject: (await ctx.db.get(f.s[7].subjectId))!, assignment: await ctx.db.query("fairQrAssignments").collect() }));
    const dynamicLinkId = await f.t.run(async (ctx) => (await ctx.db.query("dynamicLinks").withIndex("by_slug", (q) => q.eq("slug", "sajam-2026-panel-scanme")).unique())!._id);
    const args = {
      accountId: f.inventory.accountId!, businessId: f.inventory._id, productIds: [], channelIds: [f.s[7].channelId, f.s[11].channelId],
      destination: { kind: "dynamic_link" as const, dynamicLinkId }, reason: "TEST opšte preusmeravanje", key: "test-n1-retarget",
    };
    expect(await f.admin.mutation(api.adminProducts.bulkRetarget, args)).toEqual({
      retargeted: 1, skipped: [{ subjectId: f.s[7].subjectId, resolverCode: f.s[7].resolverCode, reason: "fair_sticker_linked" }],
    });
    // A replay of the same command changes nothing.
    expect(await f.admin.mutation(api.adminProducts.bulkRetarget, args)).toBeNull();
    const after = await f.t.run(async (ctx) => ({ linked: (await ctx.db.get(f.s[7].subjectId))!, free: (await ctx.db.get(f.s[11].subjectId))!, assignment: await ctx.db.query("fairQrAssignments").collect() }));
    expect(after.linked).toEqual(linkBefore.subject);
    expect(after.assignment).toEqual(linkBefore.assignment);
    expect(after.free.destinationKind).toBe("dynamic_url");
    expect(await scan(f.t, f.s[7].resolverCode, fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET))).toMatchObject({ kind: "fair_model" });
    // The retargeted code now leads to its own URL: it is no car sticker any more.
    await expectCode(link(f, "11", f.x2.modelId, null), "FAIR_QR_NOT_MODEL_STICKER");
  });
});

describe("/r/[cardCode] admin shortcut „Poveži nalepnicu“", () => {
  const generic = async (f: Fixture) => ({ scans: await count(f, "cardScanEvents"), fair: await count(f, "fairScanEvents"), daily: await count(f, "dailyCardMetrics") });

  test("admin + a never-linked sticker → fair_admin_link to the running/next event, before any scan row", async () => {
    const f = await setup();
    const before = await generic(f);
    expect(await scan(f.admin, f.s[7].resolverCode)).toEqual({ kind: "fair_admin_link", eventSlug: EM, cardCode: f.s[7].resolverCode });
    expect(await scan(f.admin, f.s[7].resolverCode.toLowerCase())).toEqual({ kind: "fair_admin_link", eventSlug: EM, cardCode: f.s[7].resolverCode });
    expect(await generic(f)).toEqual(before);
    expect((await f.t.run((ctx) => ctx.db.get(f.s[7].cardId)))!.totalScans).toBe(0);
    // After the first fair has ended, a free sticker of the shared inventory belongs to the next one.
    vi.setSystemTime(Date.parse("2026-10-20T10:00:00+02:00"));
    expect(await scan(f.admin, f.s[7].resolverCode)).toEqual({ kind: "fair_admin_link", eventSlug: AMF, cardCode: f.s[7].resolverCode });
  });

  test("a visitor and a signed-in non-admin see exactly what they saw before: invalid, no scan row", async () => {
    const f = await setup();
    const before = await generic(f);
    expect(await scan(f.t, f.s[7].resolverCode)).toEqual({ kind: "invalid" });
    expect(await scan(f.t, f.s[7].resolverCode, fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET))).toEqual({ kind: "invalid" });
    expect(await scan(f.member, f.s[7].resolverCode)).toEqual({ kind: "invalid" });
    expect(await generic(f)).toEqual(before);
  });

  test("admin + a published link opens the model as before (scan recorded, admin excluded from the fair numbers)", async () => {
    const f = await setup();
    await link(f, "7", f.x1.modelId, null);
    const before = await generic(f);
    expect(await scan(f.admin, f.s[7].resolverCode, fairVisitorHash(generateFairVisitorToken(), VISITOR_SECRET))).toEqual({
      kind: "fair_model", path: `/sajam/${EM}/model/${f.x1.slug}`, fairScan: "admin_excluded",
    });
    expect((await generic(f)).scans).toBe(before.scans + 1);
  });

  test("admin + a sticker on a draft or withdrawn car → shortcut to that car's event, no scan; a visitor gets invalid as before", async () => {
    const f = await setup();
    await link(f, "4", f.draft.modelId, null);
    await link(f, "6", f.x3.modelId, null);
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.x3.modelId });
    const before = await generic(f);
    expect(await scan(f.admin, f.s[4].resolverCode)).toEqual({ kind: "fair_admin_link", eventSlug: EM, cardCode: f.s[4].resolverCode });
    expect(await scan(f.admin, f.s[6].resolverCode)).toEqual({ kind: "fair_admin_link", eventSlug: EM, cardCode: f.s[6].resolverCode });
    expect(await generic(f)).toEqual(before);
    // The visitor path is unchanged: the generic scan row is written, then invalid.
    expect(await scan(f.t, f.s[4].resolverCode)).toEqual({ kind: "invalid" });
    expect((await generic(f)).scans).toBe(before.scans + 1);
  });

  test("admin + a released sticker → shortcut; a damaged sticker, a panel and a card outside a fair inventory → unchanged", async () => {
    const f = await setup();
    await link(f, "7", f.x1.modelId, null);
    await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: f.x1.modelId, reason: "TEST skinuta nalepnica" });
    expect(await scan(f.admin, f.s[7].resolverCode)).toEqual({ kind: "fair_admin_link", eventSlug: EM, cardCode: f.s[7].resolverCode });

    // Damaged (manual problem): not a fair reason.
    await f.t.run((ctx) => ctx.db.patch(f.s[9].channelId, { manualProblem: "health_damaged" }));
    expect(await scan(f.admin, f.s[9].resolverCode)).toEqual({ kind: "invalid" });
    expect(await scan(f.t, f.s[9].resolverCode)).toEqual({ kind: "invalid" });

    // A panel leads to its own URL for everybody.
    const panelVisitor = await scan(f.t, f.panel.resolverCode);
    expect(panelVisitor).toMatchObject({ kind: "url" });
    expect(await scan(f.admin, f.panel.resolverCode)).toEqual(panelVisitor);

    // A free code of a business that is no fair inventory.
    const digitalQrId = await f.admin.mutation(api.adminProducts.createDigital, { accountId: f.foreign.accountId, businessId: f.foreign.businessId, key: "test-n1-van-sajma" });
    const outside = await f.t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
    expect(await scan(f.admin, outside)).toEqual({ kind: "invalid" });
    expect(await scan(f.t, outside)).toEqual({ kind: "invalid" });
    expect(await scan(f.admin, "ZZZZZZZZ")).toEqual({ kind: "invalid" });
  });
});
