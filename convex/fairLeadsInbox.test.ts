/// <reference types="vite/client" />

// Sajam 2026 Admin UX A8 — the lead inbox, the activity next to a lead and
// "Označi isporučeno" (ADMIN-UX §7, §12.4; MASTER §4, §8, §12, §13;
// FAIR-BACKEND-CONTRACT §34). Admin only; the activity covers ONLY the models
// of the lead's exhibitor and never carries a visitor id, hash or request id.
// No email is sent (scheduled sends are never run here; `fetch` is a mock).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_PII_PURGE_AT_MS } from "../lib/fair-contract";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const EVENT_ENDS = Date.parse("2026-10-12T00:00:00+02:00");
const ADMIN_EMAIL = "fair-a8-inbox@scanme.test";
const ISSUER = "https://fair-a8-inbox.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const LEGAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  process.env.FAIR_LEADS_ENABLED = "true";
  process.env.FAIR_FOLLOWUP_ENABLED = "true";
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
let sequence = 0;
const submissionId = () => `test-a8-inbox-${++sequence}`;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandName: string | null) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      const brandId = brandName
        ? await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING })
        : null;
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("TA", "TEST Volta"), b: await client("TB", "TEST Om"), c: await client("TC", "TEST Kulon"), inventory: await client("TQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: EVENT_ENDS, status: "published", garagePriority: 1, qrInventoryBusinessId: ids.inventory.businessId,
  });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const exhibitor = async (key: string, client: typeof ids.a, location: string) => {
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: `test-em-${key}`, accountId: client.accountId, businessId: client.businessId });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: `test-em-stand-${key}`, code: `TEST-${key}`, displayName: `TEST štand ${key}`, mapLocationId: location });
    const model = async (externalKey: string, packageTier: Tier) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: client.brandId!, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier, passportEligible: true,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: modelId, leadKind: "interest", contactRequirement: "one_of", enabled: packageTier !== "included" });
      if (packageTier === "advanced") await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: modelId, leadKind: "test_drive", contactRequirement: "one_of", enabled: true });
      return modelId;
    };
    return { participationId, model };
  };
  const a = await exhibitor("a", ids.a, "ispred-14");
  const b = await exhibitor("b", ids.b, "ispred-15");
  const c = await exhibitor("c", ids.c, "ispred-16");
  const models = {
    x2: await a.model("test-volta-x2", "advanced"),
    x3: await a.model("test-volta-x3", "advanced"),
    x1: await a.model("test-volta-x1", "starter"),
    z2: await b.model("test-om-z2", "advanced"),
    k1: await c.model("test-kulon-k1", "starter"),
  };
  for (const leadKind of ["interest", "test_drive"] as const) {
    const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId, leadKind, text: "TEST saglasnost: ScanMe i {izlagac}." });
    await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL });
  }
  vi.setSystemTime(DAY1);
  return { t, admin, member, ...ids, eventId, a, b, c, models };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function submit(f: Fixture, visitorHash: string, eventModelId: Id<"fairEventModels">, kind: "interest" | "test_drive" = "interest", contactName = "TEST Posetilac") {
  await f.t.mutation(api.fairLeads.submitLead, {
    gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId, kind, submissionId: submissionId(), contactName,
    email: "posetilac.inbox@example.invalid", phone: "+381 60 000 0088", consentAccepted: true, consentVersion: 1,
  });
  vi.advanceTimersByTime(1000);
}

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const page = (numItems = 10) => ({ numItems, cursor: null });

/** Visitor V leaves leads at A (Advanced x2, Starter x1) and B (z2); another visitor at C (Starter). */
async function leads(f: Fixture) {
  const v = fairVisitorHash(generateFairVisitorToken(), SECRET);
  await submit(f, v, f.models.x2, "interest", "TEST V interes");
  await submit(f, v, f.models.x2, "test_drive", "TEST V probna");
  await submit(f, v, f.models.x1, "interest", "TEST V starter");
  await submit(f, v, f.models.z2, "interest", "TEST V kod B");
  await submit(f, fairVisitorHash(generateFairVisitorToken(), SECRET), f.models.k1, "interest", "TEST drugi kod C");
  const all = await rows(f, "fairLeads");
  const by = (name: string) => all.find((lead) => lead.contactName === name)!;
  return { hash: v, visitorId: by("TEST V interes").visitorId, x2: by("TEST V interes"), x2Drive: by("TEST V probna"), x1: by("TEST V starter"), z2: by("TEST V kod B"), k1: by("TEST drugi kod C") };
}

/** Raw activity of visitor V on models of A, of B and of C (no public flow needed to read it back). */
async function activity(f: Fixture, visitorId: Id<"fairVisitors">) {
  return f.t.run(async (ctx) => {
    const day = (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", f.eventId).eq("dateKey", "2026-10-09")).unique())!;
    const at = DAY1 + 5_000;
    for (const eventModelId of [f.models.x2, f.models.x1, f.models.z2]) {
      await ctx.db.insert("fairUniqueScans", { visitorId, eventId: f.eventId, eventModelId, firstScannedAt: at, lastScannedAt: at + 60_000, totalScanCount: 2 });
    }
    await ctx.db.insert("fairRatings", { visitorId, eventId: f.eventId, eventModelId: f.models.x2, appearance: 4, price: 3, createdAt: at, updatedAt: at });
    await ctx.db.insert("fairRatings", { visitorId, eventId: f.eventId, eventModelId: f.models.z2, price: 5, createdAt: at, updatedAt: at });
    const question = async (eventModelId: Id<"fairEventModels">, prompt: string) => {
      const questionId = await ctx.db.insert("fairAudienceQuestions", {
        eventId: f.eventId, eventDayId: day._id, eventModelId, prompt, options: [{ id: "o1", label: `${prompt} odgovor`, order: 1 }, { id: "o2", label: "TEST ne", order: 2 }],
        status: "published", sortOrder: 1, startsAt: day.startsAt, showOnSponsoredRotation: false, createdAt: at, updatedAt: at,
      });
      await ctx.db.insert("fairAudienceVotes", { visitorId, eventId: f.eventId, eventModelId, questionId, optionId: "o1", createdAt: at, updatedAt: at });
    };
    await question(f.models.x2, "TEST pitanje A");
    await question(f.models.z2, "TEST pitanje B");
    const survey = async (eventModelId: Id<"fairEventModels">, prompt: string, key: string) => {
      const surveyId = await ctx.db.insert("fairSurveys", {
        eventId: f.eventId, eventModelId, status: "published", version: 1, createdAt: at, updatedAt: at,
        questions: [
          { id: "q1", prompt, kind: "yes_no", options: [], required: false, order: 1 },
          { id: "q2", prompt: `${prompt} plaćanje`, kind: "single_choice", options: [{ id: "o1", label: "TEST lizing", order: 1 }], required: false, order: 2 },
        ],
      });
      await ctx.db.insert("fairSurveyResponses", { submissionId: key, visitorId, eventId: f.eventId, eventModelId, surveyId, answers: [{ questionId: "q1", value: "yes" }, { questionId: "q2", value: "o1" }], submittedAt: at });
    };
    await survey(f.models.x2, "TEST anketa A", "test-a8-survey-a");
    await survey(f.models.z2, "TEST anketa B", "test-a8-survey-b");
    const x2 = (await ctx.db.get(f.models.x2))!;
    const z2 = (await ctx.db.get(f.models.z2))!;
    const passportId = await ctx.db.insert("fairPassportConfigs", { eventId: f.eventId, brandId: x2.brandId, participationId: f.a.participationId, status: "published", publishedAt: at, createdAt: at, updatedAt: at });
    for (const eventModelId of [f.models.x2, f.models.x3]) {
      await ctx.db.insert("fairPassportEligibleModels", { passportConfigId: passportId, eventId: f.eventId, brandId: x2.brandId, eventModelId, status: "required", createdAt: at });
    }
    await ctx.db.insert("fairPassportStamps", { visitorId, eventId: f.eventId, brandId: x2.brandId, eventModelId: f.models.x2, scannedAt: at });
    await ctx.db.insert("fairBrandFavoriteVotes", { visitorId, eventId: f.eventId, brandId: x2.brandId, eventModelId: f.models.x2, createdAt: at, updatedAt: at });
    await ctx.db.insert("fairPassportStamps", { visitorId, eventId: f.eventId, brandId: z2.brandId, eventModelId: f.models.z2, scannedAt: at });
    await ctx.db.insert("fairSponsoredEvents", { requestId: "test-a8-sponsored-a", eventId: f.eventId, eventModelId: f.models.x2, surface: "garage", kind: "garage_add", occurredAt: at, dateKey: "2026-10-09", hourKey: "2026-10-09T10", visitorId });
    await ctx.db.insert("fairSponsoredEvents", { requestId: "test-a8-sponsored-b", eventId: f.eventId, eventModelId: f.models.z2, surface: "garage", kind: "open_model", occurredAt: at, dateKey: "2026-10-09", hourKey: "2026-10-09T10", visitorId });
    return { brandA: x2.brandId, brandB: z2.brandId };
  });
}

describe("A8 lead inbox: list with filters", () => {
  test("newest first; exhibitor, model, kind, delivery and date filters; bounded pages; no activity in the list", async () => {
    const f = await setup();
    const l = await leads(f);
    const all = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: page() });
    expect(all.page.map((row) => row.contactName)).toEqual(["TEST drugi kod C", "TEST V kod B", "TEST V starter", "TEST V probna", "TEST V interes"]);
    expect(all.page[0]).toMatchObject({ kind: "interest", status: "received", email: "posetilac.inbox@example.invalid", confirmation: { status: "queued" }, followUp: null });
    expect(all.page.find((row) => row.contactName === "TEST V probna")).toMatchObject({ followUp: { status: "queued" } });
    expect(JSON.stringify(all)).not.toMatch(/visitorId|visitorHash|consentTextSnapshot|"scans"|"ratings"/);

    const names = async (args: Record<string, unknown>) =>
      (await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: page(), ...args })).page.map((row) => row.contactName);
    expect(await names({ participationId: f.a.participationId })).toEqual(["TEST V starter", "TEST V probna", "TEST V interes"]);
    expect(await names({ eventModelId: f.models.x2 })).toEqual(["TEST V probna", "TEST V interes"]);
    expect(await names({ kind: "test_drive" })).toEqual(["TEST V probna"]);
    expect(await names({ participationId: f.a.participationId, kind: "interest" })).toEqual(["TEST V starter", "TEST V interes"]);
    expect(await names({ from: l.x1.createdAt, to: l.z2.createdAt + 1 })).toEqual(["TEST V kod B", "TEST V starter"]);
    expect(await names({ delivered: true })).toEqual([]);

    const first = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: page(2) });
    expect(first.page).toHaveLength(2);
    const second = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(second.page.map((row) => row.contactName)).toEqual(["TEST V starter", "TEST V probna"]);
    await expectCode(f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: page(51) }), "INVALID_INPUT");

    const otherEvent = await f.t.run(async (ctx) => ctx.db.insert("fairEvents", {
      code: "test-auto-moto-fest-2026", slug: "test-auto-moto-fest-2026", title: "TEST AMF", venueName: "TEST hala", timezone: "Europe/Belgrade",
      startsAt: DAY1, endsAt: DAY1, status: "draft", garagePriority: 2, piiPurgeAt: FAIR_PII_PURGE_AT_MS, minimumPublicVoteCount: 5, robotsIndexable: false, createdAt: DAY1, updatedAt: DAY1,
    }));
    await expectCode(f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: otherEvent, participationId: f.a.participationId, paginationOpts: page() }), "FAIR_LINK_NOT_FOUND");
    await expectCode(f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: otherEvent, eventModelId: f.models.x2, paginationOpts: page() }), "FAIR_LINK_NOT_FOUND");
    expect((await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: otherEvent, paginationOpts: page() })).page).toEqual([]);
  });
});

describe("A8 lead detail: activity only on the lead's exhibitor's models", () => {
  test("an Advanced lead shows every group of its exhibitor, marked as going to the exhibitor by package; nothing of B, no visitor id or hash", async () => {
    const f = await setup();
    const l = await leads(f);
    const { brandA, brandB } = await activity(f, l.visitorId);
    const detail = (await f.admin.query(api.fairLeadsInbox.getLeadDetail, { leadId: l.x2._id }))!;
    expect(detail.lead).toMatchObject({ contactName: "TEST V interes", consentVersion: 1, consentTextSnapshot: "TEST saglasnost: ScanMe i TEST izlagač TA.", status: "received" });
    const { activity: a } = detail;
    expect(a.tierAtLead).toBe("advanced");
    expect(a.scans).toMatchObject({ shared: true, capped: false });
    expect(a.scans!.items.map((item) => item.eventModelId).sort()).toEqual([f.models.x1, f.models.x2].sort());
    expect(a.ratings).toMatchObject({ shared: true, items: [{ eventModelId: f.models.x2, appearance: 4, price: 3 }] });
    expect(a.audienceVotes).toMatchObject({ shared: true, items: [{ eventModelId: f.models.x2, prompt: "TEST pitanje A", answer: "TEST pitanje A odgovor" }] });
    expect(a.surveyAnswers).toMatchObject({
      shared: true,
      items: [{ eventModelId: f.models.x2, answers: [{ prompt: "TEST anketa A", kind: "yes_no", answer: "yes" }, { prompt: "TEST anketa A plaćanje", kind: "single_choice", answer: "TEST lizing" }] }],
    });
    // The passport is no package metric: shown to the admin, not marked as going to the exhibitor.
    expect(a.passport).toMatchObject({ shared: false, items: [{ brandId: brandA, required: 2, stamps: [{ eventModelId: f.models.x2 }], favoriteModelId: f.models.x2 }] });
    expect(a.sponsoredActions).toMatchObject({ shared: true, items: [{ eventModelId: f.models.x2, kind: "garage_add" }] });

    const text = JSON.stringify(detail);
    for (const secret of [f.models.z2, brandB, l.visitorId, l.hash, "test-a8-sponsored", "TEST pitanje B", "TEST anketa B", "test-a8-survey"]) {
      expect({ secret, leaked: text.includes(secret) }).toEqual({ secret, leaked: false });
    }
    expect(text).not.toMatch(/"(visitorId|visitorHash|requestId|submissionId)"/);
  });

  test("a Starter lead of the same exhibitor shows the Advanced-only groups as not going to the exhibitor; an exhibitor without the feature has no such group", async () => {
    const f = await setup();
    const l = await leads(f);
    await activity(f, l.visitorId);
    const starter = (await f.admin.query(api.fairLeadsInbox.getLeadDetail, { leadId: l.x1._id }))!.activity;
    expect(starter.tierAtLead).toBe("starter");
    expect([starter.scans?.shared, starter.ratings?.shared, starter.audienceVotes?.shared]).toEqual([true, true, true]);
    expect([starter.surveyAnswers?.shared, starter.sponsoredActions?.shared, starter.passport?.shared]).toEqual([false, false, false]);
    // Exhibitor C has only Starter models: no survey and no sponsored group at all (never an empty 0).
    const onlyStarter = (await f.admin.query(api.fairLeadsInbox.getLeadDetail, { leadId: l.k1._id }))!.activity;
    expect(Object.keys(onlyStarter).sort()).toEqual(["audienceVotes", "passport", "ratings", "scans", "tierAtLead"]);
    expect(onlyStarter.scans!.items).toEqual([]);
    // The lead at B sees B's model only.
    const atB = JSON.stringify((await f.admin.query(api.fairLeadsInbox.getLeadDetail, { leadId: l.z2._id }))!.activity);
    expect(atB).toContain(f.models.z2);
    for (const own of [f.models.x2, f.models.x1]) expect(atB).not.toContain(own);
  });
});

describe("A8 delivery to the exhibitor (by 15 Nov)", () => {
  test("mark one lead or a whole exhibitor as delivered; idempotent, audited, other events refused; counts follow", async () => {
    const f = await setup();
    const l = await leads(f);
    expect(await f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, leadIds: [l.x2._id] })).toEqual({ delivered: 1, unchanged: 0, hasMore: false });
    expect(await f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, leadIds: [l.x2._id] })).toEqual({ delivered: 0, unchanged: 1, hasMore: false });
    expect((await f.t.run(async (ctx) => ctx.db.get(l.x2._id)))).toMatchObject({ status: "delivered", deliveredAt: expect.any(Number) });
    expect(await f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, participationId: f.a.participationId })).toEqual({ delivered: 2, unchanged: 0, hasMore: false });
    const delivered = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, delivered: true, paginationOpts: page() });
    expect(delivered.page.map((row) => row.contactName).sort()).toEqual(["TEST V interes", "TEST V probna", "TEST V starter"]);
    const counts = await f.admin.query(api.fairAdminStats.getLeadCounts, { eventId: f.eventId });
    expect(counts.byParticipation.find((row) => row.participationId === f.a.participationId)).toMatchObject({ total: 3, undelivered: 0 });
    expect(counts.byParticipation.find((row) => row.participationId === f.b.participationId)).toMatchObject({ total: 1, undelivered: 1 });
    expect((await rows(f, "adminAuditLog")).filter((row) => row.action === "fair_leads_delivered")).toHaveLength(2);

    await expectCode(f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId }), "INVALID_INPUT");
    await expectCode(f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, leadIds: [l.z2._id], participationId: f.b.participationId }), "INVALID_INPUT");
    const otherEvent = await f.t.run(async (ctx) => ctx.db.insert("fairEvents", {
      code: "test-x", slug: "test-x", title: "TEST X", venueName: "TEST", timezone: "Europe/Belgrade", startsAt: DAY1, endsAt: DAY1, status: "draft",
      garagePriority: 9, piiPurgeAt: FAIR_PII_PURGE_AT_MS, minimumPublicVoteCount: 5, robotsIndexable: false, createdAt: DAY1, updatedAt: DAY1,
    }));
    await expectCode(f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: otherEvent, leadIds: [l.z2._id] }), "FAIR_LINK_NOT_FOUND");
    await expectCode(f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: otherEvent, participationId: f.b.participationId }), "FAIR_LINK_NOT_FOUND");
    expect((await f.t.run(async (ctx) => ctx.db.get(l.z2._id)))!.status).toBe("received");
  });

  test("a whole exhibitor is marked in bounded batches (hasMore)", async () => {
    const f = await setup();
    const l = await leads(f);
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 205; i += 1) {
        await ctx.db.insert("fairLeads", {
          submissionId: `test-a8-bulk-${i}`, kind: "interest", visitorId: l.visitorId, eventId: f.eventId, eventModelId: f.models.k1, participationId: f.c.participationId,
          contactName: `TEST masovno ${i}`, consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST", consentedAt: DAY1, status: "received",
          followUpSuppressed: false, createdAt: DAY1 + i, purgeAt: FAIR_PII_PURGE_AT_MS,
        });
      }
    });
    expect(await f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, participationId: f.c.participationId })).toEqual({ delivered: 200, unchanged: 0, hasMore: true });
    expect(await f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, participationId: f.c.participationId })).toEqual({ delivered: 6, unchanged: 0, hasMore: false });
    await expectCode(f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, leadIds: Array(201).fill(l.k1._id) }), "FAIR_BULK_TOO_LARGE");
  });
});

describe("A8 PII export per exhibitor: columns by package", () => {
  test("the file carries the package and only the activity the lead's package sends; another exhibitor's activity never appears", async () => {
    const f = await setup();
    const l = await leads(f);
    await activity(f, l.visitorId);
    const csv = async (participationId: Id<"fairParticipations">) => {
      const file = await f.admin.action(api.fairReports.exportLeadsFile, { eventId: f.eventId, participationId, format: "csv" });
      return new TextDecoder().decode(new Uint8Array(await new Blob(file.chunks).arrayBuffer()));
    };
    const ofA = await csv(f.a.participationId);
    const header = ofA.split("\r\n").find((line) => line.startsWith("Primljeno"))!;
    expect(header).toBe("Primljeno,Vrsta,Model,Ime,Email,Telefon,Verzija saglasnosti,Saglasnost data,Paket,Skenirani modeli,Ocene,Glas publike,Anketa,Sponzorisana traka");
    const line = (name: string) => ofA.split("\r\n").find((row) => row.includes(name))!;
    expect(line("TEST V interes")).toContain("Napredni");
    expect(line("TEST V interes")).toContain("TEST pitanje A: TEST pitanje A odgovor");
    expect(line("TEST V interes")).toContain("TEST anketa A: Da, TEST anketa A plaćanje: TEST lizing");
    expect(line("TEST V interes")).toContain("TEST test-volta-x2: Dodaj u garažu");
    // A Starter lead: package Starter, no survey and no sponsored cell (empty, not 0).
    expect(line("TEST V starter")).toContain("Starter");
    expect(line("TEST V starter")).not.toContain("TEST anketa A");
    expect(line("TEST V starter")).toMatch(/,,$/);
    for (const other of ["test-om-z2", "TEST pitanje B", "TEST anketa B", "TEST V kod B"]) expect(ofA).not.toContain(other);
    // Exhibitor C has only Starter leads: no survey or sponsored column at all.
    const ofC = await csv(f.c.participationId);
    expect(ofC.split("\r\n").find((row) => row.startsWith("Primljeno"))).toBe("Primljeno,Vrsta,Model,Ime,Email,Telefon,Verzija saglasnosti,Saglasnost data,Paket,Skenirani modeli,Ocene,Glas publike");
  });
});
