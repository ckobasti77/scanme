/// <reference types="vite/client" />

// Sajam 2026 P1 (Aleksa, 8. 10. 2026) — pre-event: packages from assignment,
// Glas publike before its day, pre-event data outside every number, the
// admin reset (dry run + slug) and no exhibitor email or follow-up for a
// pre-event lead. NOTHING IS SENT: global `fetch` is a mock in every test and
// the Resend key is a fake. Visitor hashes come from the real Next helper.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import type { FairImportPayload } from "./fairImport";
import { FAIR_PRE_EVENT_BATCH_SIZE } from "./fairPreEvent";
import { bumpFairCount, fairScanCountKey, fairScanCountKeys, readFairCount } from "./lib/fairCountShards";
import { fairAudienceVoteKey, fairFavoriteKey, fairModelTierAt, fairRatingCountKey, fairRatingSumKey } from "./lib/fairInteractions";
import { fairPairLeads } from "./lib/fairLeadActivity";
import { fairTimeKeys } from "./lib/fairScans";
import payloadJson from "../docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const STARTS_AT = Date.parse("2026-10-09T00:00:00+02:00");
const ASSIGNED = Date.parse("2026-10-08T09:00:00+02:00");
const PRE = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const EVENT_ENDS = Date.parse("2026-10-12T00:00:00+02:00");
const FOLLOW_UP_AT = Date.parse("2026-10-13T10:00:00+02:00");
const EM = "test-elektromobilnost-2026";
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-p1.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
// K1: a TEST gateway secret (not a real value).
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
// K3: a TEST legal approval record (not a real review).
const LEGAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };
const EMAIL = "posetilac.p1@example.invalid";

let fetchCalls = 0;
beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
  process.env.FAIR_LEADS_ENABLED = "true";
  process.env.FAIR_FOLLOWUP_ENABLED = "true";
  fetchCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    fetchCalls += 1;
    return Response.json({ id: `re_test_message_${fetchCalls}` });
  }));
  vi.useFakeTimers();
  vi.setSystemTime(ASSIGNED);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
let sequence = 0;
const nextId = (prefix: string) => `test-p1-${prefix}-${++sequence}`;
const options = [{ id: "test-da", label: "TEST da", order: 1 }, { id: "test-ne", label: "TEST ne", order: 2 }];

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

/**
 * The TEST elektromobilnost fair (9–11 Oct). Everything is assigned on 8 Oct at
 * 09:00 with the fair's first day as `packageActiveFrom` — exactly what the
 * real intake payload carries.
 */
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandName: string | null) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: ASSIGNED, updatedAt: ASSIGNED,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: ASSIGNED,
      });
      const brandId = brandName
        ? await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: ASSIGNED, updatedAt: ASSIGNED })
        : null;
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("TA", "TEST Volta"), inventory: await client("TQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: EM, slug: EM, title: "TEST elektromobilnost", venueName: "TEST hala", startsAt: STARTS_AT, endsAt: EVENT_ENDS, status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  const { dayId: day1 } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const { dayId: day2 } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-10", label: "TEST dan 2", sortOrder: 2 });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: "test-em-izlagac-a", accountId: ids.a.accountId, businessId: ids.a.businessId });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: "test-em-stand-a", code: "TEST-A", displayName: "TEST štand A", mapLocationId: "ispred-14" });
  let qrSequence = 0;
  const model = async (externalKey: string, packageTier: "starter" | "advanced") => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId: ids.a.brandId!, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
      specifications: [spec(1), spec(2)], packageTier, packageActiveFrom: STARTS_AT, passportEligible: true,
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const digitalQrId = await admin.mutation(api.adminProducts.createDigital, { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-p1-${++qrSequence}` });
    const code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
    await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    return { id: modelId, code };
  };
  const starter = await model("test-volta-x1", "starter");
  const advanced = await model("test-volta-x2", "advanced");
  await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: starter.id, leadKind: "interest", contactRequirement: "one_of", enabled: true });
  await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: advanced.id, leadKind: "interest", contactRequirement: "one_of", enabled: true });
  await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: advanced.id, leadKind: "test_drive", contactRequirement: "one_of", enabled: true });
  await admin.mutation(api.fairLeadsAdmin.upsertFollowUpTemplate, { eventModelId: advanced.id, subject: "TEST naslov", plainText: "TEST tekst izlagača." });
  for (const leadKind of ["interest", "test_drive"] as const) {
    const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId, leadKind, text: "TEST saglasnost: ScanMe i {izlagac}." });
    await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL });
  }
  const passportId = (await admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId, brandId: ids.a.brandId! })).passportId;
  await admin.mutation(api.fairInteractionsAdmin.publishPassport, { passportId });
  const { surveyId } = await admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, {
    eventModelId: advanced.id, questions: [{ id: "test-preporuka", prompt: "TEST da li biste preporučili?", kind: "yes_no", options: [], required: false, order: 1 }],
  });
  await admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId });
  const question = async (eventModelId: Id<"fairEventModels">, eventDayId: Id<"fairEventDays">, sortOrder: number, publish = true) => {
    const { questionId } = await admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { eventModelId, eventDayId, prompt: `TEST pitanje ${sortOrder}?`, options, sortOrder });
    if (publish) await admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId });
    return questionId;
  };
  const starterDay1 = await question(starter.id, day1, 1);
  const advancedDay2 = await question(advanced.id, day2, 1);
  return { t, admin, member, ...ids, eventId, day1, day2, participationId, standId, starter, advanced, passportId, surveyId, questions: { starterDay1, advancedDay2 }, question };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const count = (f: Fixture, key: string) => f.t.run(async (ctx) => readFairCount(ctx, key));
const drain = (f: Fixture) => f.t.finishAllScheduledFunctions(vi.runAllTimers);

const scan = (f: Fixture, code: string, visitorHash: string) =>
  f.t.mutation(api.cards.resolveAndRecord, { cardCode: code, requestId: nextId("scan"), deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash });
const rate = (f: Fixture, visitorHash: string, eventModelId: string, values: { overall?: number; appearance?: number; specifications?: number; price?: number }) =>
  f.t.mutation(api.fairInteractions.upsertRating, { gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId, ...values });
const vote = (f: Fixture, visitorHash: string, questionId: string, optionId: string) =>
  f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash, questionId, optionId });
const answerSurvey = (f: Fixture, visitorHash: string, value: "yes" | "no") =>
  f.t.mutation(api.fairInteractions.submitSurvey, { gatewaySecret: GATEWAY_SECRET, visitorHash, surveyId: f.surveyId, submissionId: nextId("survey"), answers: [{ questionId: "test-preporuka", value }] });
const lead = (f: Fixture, visitorHash: string, eventModelId: Id<"fairEventModels">, kind: "interest" | "test_drive") =>
  f.t.mutation(api.fairLeads.submitLead, {
    gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId, kind, submissionId: nextId("lead"), contactName: "TEST Posetilac", email: EMAIL, consentAccepted: true, consentVersion: 1,
  });
const scanCounts = async (f: Fixture, eventModelId: Id<"fairEventModels">, dateKey?: string) =>
  (await f.t.query(internal.fairScans.modelScanCounts, { eventModelId, ...(dateKey ? { dateKey } : {}) }))!;
const summary = (f: Fixture, eventModelId: Id<"fairEventModels">) => f.admin.query(api.fairInteractionsAdmin.getModelInteractionSummary, { eventModelId });
const ratingOf = (s: Awaited<ReturnType<typeof summary>>, field: string) => s.ratings.find((row) => row.field === field)!;
const votesOf = (s: Awaited<ReturnType<typeof summary>>, questionId: string) => s.questions.find((row) => row.questionId === questionId)?.total ?? 0;
const tierAt = (f: Fixture, eventModelId: Id<"fairEventModels">, at: number) => f.t.run(async (ctx) => fairModelTierAt(ctx, (await ctx.db.get(eventModelId))!, at));

/** Reproduces a package written before P1 that still waits for a later start. */
async function legacyFuturePackage(f: Fixture, eventModelId: Id<"fairEventModels">, from: number) {
  await f.t.run(async (ctx) => {
    await ctx.db.patch(eventModelId, { packageActivatedAt: from });
    for (const row of await ctx.db.query("fairPackageActivations").withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", eventModelId)).collect()) {
      await ctx.db.patch(row._id, { activatedAt: from });
    }
  });
}

// =============================================================================
// 1. Paket važi od dodele
// =============================================================================

describe("P1 — a package is in force from its assignment", () => {
  test("assigned on 8. 10. with the fair's first day as start: the form, Glas publike and the survey work at once", async () => {
    const f = await setup();
    const stored = await f.t.run(async (ctx) => ({
      models: await Promise.all([f.starter.id, f.advanced.id].map((id) => ctx.db.get(id))),
      activations: await ctx.db.query("fairPackageActivations").collect(),
    }));
    expect(stored.models.map((row) => row!.packageActivatedAt)).toEqual([ASSIGNED, ASSIGNED]);
    expect(stored.activations.map((row) => [row.toTier, row.activatedAt]).sort()).toEqual([["advanced", ASSIGNED], ["starter", ASSIGNED]]);

    vi.setSystemTime(PRE);
    expect(await tierAt(f, f.starter.id, PRE)).toBe("starter");
    expect(await tierAt(f, f.advanced.id, PRE)).toBe("advanced");
    const v1 = visitor();
    // Forms (Starter interest, Napredni probna vožnja).
    expect(await lead(f, v1, f.starter.id, "interest")).toMatchObject({ duplicate: false, confirmationEmail: true });
    expect(await lead(f, v1, f.advanced.id, "test_drive")).toMatchObject({ duplicate: false, confirmationEmail: true });
    // The survey (Napredni).
    expect(await answerSurvey(f, v1, "yes")).toMatchObject({ duplicate: false });
    // Glas publike (opened before its day by the admin) and ratings.
    await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: f.questions.advancedDay2 });
    expect(await vote(f, v1, f.questions.advancedDay2, "test-da")).toMatchObject({ myOptionId: "test-da" });
    expect(await rate(f, v1, f.starter.id, { overall: 4 })).toEqual({ mode: "overall", overall: 4 });
    expect(await rate(f, v1, f.advanced.id, { price: 3 })).toEqual({ mode: "dimensions", price: 3 });
  });

  test("import / fairSetup: the real payload committed on 8. 10. is in force from the import; a second commit is unchanged", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const NOW = Date.parse("2026-10-08T10:00:00+02:00");
    vi.setSystemTime(NOW);
    await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
    await t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
    const payload = payloadJson as FairImportPayload;
    expect(payload.participations.flatMap((p) => p.brands.flatMap((b) => b.models)).every((m) => m.packageActiveFrom === "2026-10-09T00:00:00+02:00")).toBe(true);
    const committed = await t.mutation(internal.fairSetup.importCommit, { payload, actorEmail: ADMIN_EMAIL });
    expect(committed.results.models).toMatchObject({ created: 15 });
    const after = await t.run(async (ctx) => ({ models: await ctx.db.query("fairEventModels").collect(), activations: await ctx.db.query("fairPackageActivations").collect() }));
    expect(after.models).toHaveLength(15);
    expect(after.models.every((row) => row.packageActivatedAt === NOW)).toBe(true);
    expect(after.activations.length).toBeGreaterThan(0);
    expect(after.activations.every((row) => row.activatedAt === NOW)).toBe(true);
    for (const model of after.models) {
      expect(await t.run(async (ctx) => fairModelTierAt(ctx, (await ctx.db.get(model._id))!, NOW))).toBe(model.packageTier);
    }
    vi.setSystemTime(NOW + 60_000);
    const again = await t.mutation(internal.fairSetup.importCommit, { payload, actorEmail: ADMIN_EMAIL });
    expect(again.results).toMatchObject({ participations: { unchanged: 5 }, stands: { unchanged: 5 }, models: { unchanged: 15 }, upgrades: 0 });
    expect(await t.run(async (ctx) => (await ctx.db.query("fairPackageActivations").collect()).length)).toBe(after.activations.length);
  });

  test("upgrade: a package still waiting for a future start (row before P1) moves to its assignment, the upgrade starts now", async () => {
    const f = await setup();
    await legacyFuturePackage(f, f.starter.id, Date.parse("2026-10-09T09:00:00+02:00"));
    vi.setSystemTime(PRE);
    const result = await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.starter.id, toTier: "advanced" });
    expect(result).toMatchObject({ fromTier: "starter", toTier: "advanced", activatedAt: PRE });
    const history = await f.t.run(async (ctx) => ctx.db.query("fairPackageActivations").withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", f.starter.id)).collect());
    expect(history.map((row) => [row.fromTier, row.toTier, row.activatedAt])).toEqual([["included", "starter", ASSIGNED], ["starter", "advanced", PRE]]);
    expect((await f.t.run((ctx) => ctx.db.get(f.starter.id)))!).toMatchObject({ packageTier: "advanced", packageActivatedAt: PRE });
    // Never a later downgrade in the history.
    expect(await tierAt(f, f.starter.id, PRE)).toBe("advanced");
    expect(await tierAt(f, f.starter.id, DAY1)).toBe("advanced");
    expect(await tierAt(f, f.starter.id, ASSIGNED + 1)).toBe("starter");
  });

  test("migration: dryRun (default) only reports; the real run settles every event; a second run finds nothing", async () => {
    const f = await setup();
    await legacyFuturePackage(f, f.starter.id, Date.parse("2026-10-09T09:00:00+02:00"));
    await legacyFuturePackage(f, f.advanced.id, Date.parse("2026-10-09T09:00:00+02:00"));
    vi.setSystemTime(PRE);
    const snapshot = () => f.t.run(async (ctx) => JSON.stringify([await ctx.db.query("fairEventModels").collect(), await ctx.db.query("fairPackageActivations").collect()]));
    const before = await snapshot();
    expect(await tierAt(f, f.advanced.id, PRE)).toBe("included");

    const dry = await f.t.mutation(internal.fairPackages.migrateFutureActivations, {});
    expect(dry).toMatchObject({ dryRun: true, now: PRE, events: 1, modelsScanned: 2, capped: false });
    expect(dry.moved.map((row) => [row.externalKey, row.from, row.to]).sort()).toEqual([
      ["test-volta-x1", Date.parse("2026-10-09T09:00:00+02:00"), ASSIGNED],
      ["test-volta-x2", Date.parse("2026-10-09T09:00:00+02:00"), ASSIGNED],
    ]);
    expect(await snapshot()).toBe(before);

    const real = await f.t.mutation(internal.fairPackages.migrateFutureActivations, { dryRun: false });
    expect(real).toMatchObject({ dryRun: false });
    expect(real.moved).toHaveLength(2);
    expect(real.moved.every((row) => row.activations.length === 1 && row.activations[0].to === ASSIGNED)).toBe(true);
    const models = await f.t.run(async (ctx) => Promise.all([f.starter.id, f.advanced.id].map((id) => ctx.db.get(id))));
    expect(models.map((row) => row!.packageActivatedAt)).toEqual([ASSIGNED, ASSIGNED]);
    expect((await rows(f, "fairPackageActivations")).every((row) => row.activatedAt === ASSIGNED)).toBe(true);
    expect(await tierAt(f, f.advanced.id, PRE)).toBe("advanced");

    const again = await f.t.mutation(internal.fairPackages.migrateFutureActivations, { dryRun: false });
    expect(again.moved).toEqual([]);
  });
});

// =============================================================================
// 2. Glas publike pre svog dana
// =============================================================================

describe("P1 — Glas publike before its day", () => {
  test("the admin opens a published question early; the public list and the vote use one rule; the question keeps its day", async () => {
    const f = await setup();
    vi.setSystemTime(PRE);
    const q = f.questions.advancedDay2;
    const v1 = visitor();
    await expectCode(vote(f, v1, q, "test-da"), "QUESTION_NOT_OPEN");
    const list = (at?: number) => f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.advanced.id, dateKey: "2026-10-08", ...(at !== undefined ? { at } : {}) });
    expect(await list(PRE)).toEqual([]);

    expect(await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: q })).toEqual({ questionId: q, startsAt: PRE, opened: true });
    const stored = (await f.t.run((ctx) => ctx.db.get(q)))!;
    expect(stored).toMatchObject({ status: "published", eventDayId: f.day2, startsAt: PRE });
    // Opening again changes nothing.
    expect(await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: q })).toEqual({ questionId: q, startsAt: PRE, opened: false });

    expect((await list(PRE)).map((row) => row.id)).toEqual([q]);
    expect((await list(PRE))[0]).toMatchObject({ dateKey: "2026-10-10", prompt: "TEST pitanje 1?" });
    // Without `at` the read is exactly as before (today's day only).
    expect(await list()).toEqual([]);
    expect(await vote(f, v1, q, "test-da")).toMatchObject({ state: "waiting_for_minimum", myOptionId: "test-da" });
    // Pre-event: the visitor's own vote, in no count.
    expect(votesOf(await summary(f, f.advanced.id), q)).toBe(0);
    // During the fair the same visitor's vote counts once.
    vi.setSystemTime(DAY1);
    await vote(f, v1, q, "test-ne");
    const s = await summary(f, f.advanced.id);
    expect(votesOf(s, q)).toBe(1);
    expect(s.questions.find((row) => row.questionId === q)!.options).toEqual([{ optionId: "test-da", count: 0 }, { optionId: "test-ne", count: 1 }]);
    await vote(f, v1, q, "test-da");
    expect((await summary(f, f.advanced.id)).questions.find((row) => row.questionId === q)!.options).toEqual([{ optionId: "test-da", count: 1 }, { optionId: "test-ne", count: 0 }]);
  });

  test("the daily limit stays per fair day (Starter 1) — opening early does not move or widen it", async () => {
    const f = await setup();
    vi.setSystemTime(PRE);
    await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: f.questions.starterDay1 });
    const second = await f.question(f.starter.id, f.day1, 2, false);
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: second }), "FAIR_QUESTION_DAY_LIMIT");
    // Another day of the same Starter model still has its own one.
    const otherDay = await f.question(f.starter.id, f.day2, 3, false);
    expect(await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: otherDay })).toMatchObject({ status: "published", remainingForDay: 0 });
    expect((await f.t.run((ctx) => ctx.db.get(f.questions.starterDay1)))!.eventDayId).toBe(f.day1);
  });

  test("only a published question with an open window can be opened; admins only", async () => {
    const f = await setup();
    vi.setSystemTime(PRE);
    const draft = await f.question(f.advanced.id, f.day2, 4, false);
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: draft }), "FAIR_QUESTION_STATUS");
    await f.admin.mutation(api.fairInteractionsAdmin.closeAudienceQuestion, { questionId: f.questions.advancedDay2 });
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: f.questions.advancedDay2 }), "FAIR_QUESTION_STATUS");
    // A window that already ended.
    await f.t.run((ctx) => ctx.db.patch(f.questions.starterDay1, { endsAt: PRE - 1 }));
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: f.questions.starterDay1 }), "FAIR_QUESTION_STATUS");
    await expect(f.member.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: draft })).rejects.toThrow();
    await expect(f.t.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: draft })).rejects.toThrow();
  });
});

// =============================================================================
// 3. Pre-event oznaka
// =============================================================================

describe("P1 — pre-event writes are stored but in no number", () => {
  test("a pre-event scan is in no counter and never uses up the unique scan; the first fair scan counts as unique", async () => {
    const f = await setup();
    const v1 = visitor();
    vi.setSystemTime(PRE);
    expect(await scan(f, f.advanced.code, v1)).toMatchObject({ kind: "fair_model", fairScan: "recorded" });
    expect(await scan(f, f.advanced.code, v1)).toMatchObject({ fairScan: "recorded" });
    let c = await scanCounts(f, f.advanced.id, "2026-10-08");
    expect(c).toMatchObject({ model: { total: 0, unique: 0 }, stand: { total: 0, unique: 0 }, day: { total: 0, unique: 0 }, raw: { scanEvents: 0, uniqueVisitors: 0, preEventScanEvents: 2 } });
    expect((await rows(f, "fairScanEvents")).every((row) => row.preEvent === true)).toBe(true);
    const [preUnique] = await rows(f, "fairUniqueScans");
    expect(preUnique).toMatchObject({ preEvent: true, firstScannedAt: PRE, totalScanCount: 2 });
    const [preStamp] = await rows(f, "fairPassportStamps");
    expect(preStamp).toMatchObject({ eventModelId: f.advanced.id, scannedAt: PRE });

    vi.setSystemTime(DAY1);
    await scan(f, f.advanced.code, v1);
    c = await scanCounts(f, f.advanced.id, "2026-10-09");
    expect(c).toMatchObject({ model: { total: 1, unique: 1 }, stand: { total: 1, unique: 1 }, day: { total: 1, unique: 1 }, raw: { scanEvents: 1, uniqueVisitors: 1, preEventScanEvents: 2 } });
    const [taken] = await rows(f, "fairUniqueScans");
    expect(taken).toMatchObject({ firstScannedAt: DAY1, lastScannedAt: DAY1, totalScanCount: 1 });
    expect(taken.preEvent).toBeUndefined();
    // The pre-event stamp moved to the fair scan.
    expect((await rows(f, "fairPassportStamps"))[0]).toMatchObject({ scannedAt: DAY1 });

    await scan(f, f.advanced.code, v1);
    expect((await scanCounts(f, f.advanced.id)).model).toEqual({ total: 2, unique: 1 });
    // The pre-event day bucket stays empty.
    expect(await count(f, fairScanCountKey("scan_total", "model", f.advanced.id, "2026-10-08"))).toBe(0);
  });

  test("ratings, favorites, survey answers and garage actions before the start are the visitor's own; the first fair write counts", async () => {
    const f = await setup();
    const v1 = visitor();
    vi.setSystemTime(PRE);
    // Rating: pre-event, the visitor sees it, nobody counts it.
    await rate(f, v1, f.starter.id, { overall: 4 });
    expect((await f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, eventModelId: f.starter.id })).rating).toEqual({ mode: "overall", overall: 4 });
    expect(ratingOf(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 0, sum: 0 });
    await rate(f, v1, f.advanced.id, { appearance: 3 });
    // Passport completed before the start → the favorite is pre-event too.
    await scan(f, f.starter.code, v1);
    await scan(f, f.advanced.code, v1);
    expect(await f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, passportId: f.passportId, eventModelId: f.advanced.id })).toMatchObject({ completed: true, favoriteModelId: f.advanced.id });
    expect(await count(f, fairFavoriteKey(f.passportId, f.advanced.id))).toBe(0);
    // Survey and a garage action before the start.
    await answerSurvey(f, v1, "yes");
    expect(await f.t.mutation(api.fairInteractions.recordSponsoredAction, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, eventModelId: f.advanced.id, surface: "garage", kind: "open_model", requestId: nextId("sponsored") })).toMatchObject({ duplicate: false });
    expect(await count(f, `sponsored_open_model:model:${f.advanced.id}`)).toBe(0);
    expect((await rows(f, "fairSponsoredEvents"))[0]).toMatchObject({ preEvent: true });
    expect((await rows(f, "fairRatings")).every((row) => row.preEvent === true)).toBe(true);

    vi.setSystemTime(DAY1);
    // The first fair rating takes the row over: the pre-event values are dropped.
    await rate(f, v1, f.starter.id, { overall: 5 });
    expect(ratingOf(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 1, sum: 5 });
    await rate(f, v1, f.advanced.id, { price: 4 });
    const advancedSummary = await summary(f, f.advanced.id);
    expect(ratingOf(advancedSummary, "price")).toMatchObject({ count: 1, sum: 4 });
    expect(ratingOf(advancedSummary, "appearance")).toMatchObject({ count: 0, sum: 0 });
    const advancedRow = (await rows(f, "fairRatings")).find((row) => row.eventModelId === f.advanced.id)!;
    expect(advancedRow).toMatchObject({ price: 4, createdAt: DAY1 });
    expect(advancedRow.appearance).toBeUndefined();
    expect(advancedRow.preEvent).toBeUndefined();
    // The favorite during the fair counts once.
    await f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, passportId: f.passportId, eventModelId: f.advanced.id });
    expect(await count(f, fairFavoriteKey(f.passportId, f.advanced.id))).toBe(1);
    // The pre-event survey answer gives way to the first fair answer; only that one is left.
    expect(await answerSurvey(f, v1, "no")).toMatchObject({ duplicate: false });
    const answers = await rows(f, "fairSurveyResponses");
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ submittedAt: DAY1, answers: [{ questionId: "test-preporuka", value: "no" }] });
    await expectCode(answerSurvey(f, v1, "yes"), "SURVEY_ALREADY_SUBMITTED");
    await f.t.mutation(api.fairInteractions.recordSponsoredAction, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, eventModelId: f.advanced.id, surface: "garage", kind: "open_model", requestId: nextId("sponsored") });
    expect(await count(f, `sponsored_open_model:model:${f.advanced.id}`)).toBe(1);
    expect(await count(f, `sponsored_open_model:model:${f.advanced.id}:2026-10-09`)).toBe(1);
  });

  test("a rating or vote written before P1 (counted then) leaves the counters at the visitor's next pre-event write", async () => {
    const f = await setup();
    const v1 = visitor();
    const q = f.questions.advancedDay2;
    vi.setSystemTime(PRE);
    await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: q });
    // Rows the code before P1 wrote (and counted) for this visitor.
    await f.t.run(async (ctx) => {
      const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: v1, firstSeenAt: PRE, lastSeenAt: PRE });
      await ctx.db.insert("fairRatings", { visitorId, eventId: f.eventId, eventModelId: f.starter.id, overall: 3, createdAt: PRE, updatedAt: PRE });
      await bumpFairCount(ctx, fairRatingCountKey("overall", f.starter.id), 1);
      await bumpFairCount(ctx, fairRatingSumKey("overall", f.starter.id), 3);
      await ctx.db.insert("fairAudienceVotes", { visitorId, eventId: f.eventId, eventModelId: f.advanced.id, questionId: q, optionId: "test-da", createdAt: PRE, updatedAt: PRE });
      await bumpFairCount(ctx, fairAudienceVoteKey(q, "test-da"), 1);
    });
    expect(ratingOf(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 1, sum: 3 });
    await rate(f, v1, f.starter.id, { overall: 4 });
    await vote(f, v1, q, "test-ne");
    expect(ratingOf(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 0, sum: 0 });
    expect((await summary(f, f.advanced.id)).questions.find((row) => row.questionId === q)!.options).toEqual([{ optionId: "test-da", count: 0 }, { optionId: "test-ne", count: 0 }]);
    expect((await rows(f, "fairRatings"))[0]).toMatchObject({ overall: 4, preEvent: true });
    expect((await rows(f, "fairAudienceVotes"))[0]).toMatchObject({ optionId: "test-ne", preEvent: true });
    // During the fair the visitor's first write counts once.
    vi.setSystemTime(DAY1);
    await rate(f, v1, f.starter.id, { overall: 5 });
    await vote(f, v1, q, "test-ne");
    expect(ratingOf(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 1, sum: 5 });
    expect((await summary(f, f.advanced.id)).questions.find((row) => row.questionId === q)!.options).toEqual([{ optionId: "test-da", count: 0 }, { optionId: "test-ne", count: 1 }]);
  });

  test("the daily dataset counts leads and survey answers from the event's start, even inside a fair day that began earlier", async () => {
    const f = await setup();
    const v1 = visitor();
    const v2 = visitor();
    // The event starts at 09:00 on day 1 (the day window is still 00:00–24:00).
    const lateStart = Date.parse("2026-10-09T09:00:00+02:00");
    await f.t.run((ctx) => ctx.db.patch(f.eventId, { startsAt: lateStart }));
    vi.setSystemTime(Date.parse("2026-10-09T08:00:00+02:00"));
    await lead(f, v1, f.advanced.id, "interest");
    await answerSurvey(f, v1, "yes");
    vi.setSystemTime(DAY1);
    await lead(f, v2, f.advanced.id, "interest");
    await answerSurvey(f, v2, "no");
    const raw = await f.t.query(internal.fairAnalytics.modelDayRaw, { eventModelId: f.advanced.id, participationId: f.participationId, eventDayId: f.day1 });
    expect(raw!.interest).toEqual({ count: 1, capped: false });
    expect(raw!.surveys![0]).toMatchObject({ responses: 1 });
    expect(raw!.surveys![0].questions[0].answers).toEqual([{ value: "yes", count: 0 }, { value: "no", count: 1 }]);
  });
});

// =============================================================================
// 4. Pre-event leads: confirmation yes, exhibitor email / follow-up / export no
// =============================================================================

describe("P1 — a pre-event lead never reaches the exhibitor", () => {
  test("its confirmation goes out, but it has no follow-up and is in no export, list, count or pair", async () => {
    const f = await setup();
    const v1 = visitor();
    vi.setSystemTime(PRE);
    const pre = await lead(f, v1, f.advanced.id, "test_drive");
    expect(pre).toMatchObject({ duplicate: false, confirmationEmail: true, followUpScheduled: false });
    const deliveries = await rows(f, "fairEmailDeliveries");
    expect(deliveries.map((row) => row.kind)).toEqual(["immediate_confirmation"]);
    // The confirmation is sent (to the mock) and announces no follow-up.
    const claim = await f.t.mutation(internal.fairEmails.claimDelivery, { deliveryId: deliveries[0]._id });
    expect(claim).toMatchObject({ action: "send", message: { kind: "immediate_confirmation", followUpScheduled: false } });

    vi.setSystemTime(DAY1);
    // The same visitor, model and kind during the fair: a new lead (not a duplicate), with its follow-up.
    const fair = await lead(f, v1, f.advanced.id, "test_drive");
    expect(fair).toMatchObject({ duplicate: false, followUpScheduled: true });
    const leads = await rows(f, "fairLeads");
    expect(leads).toHaveLength(2);
    const preLead = leads.find((row) => row.createdAt === PRE)!;
    const fairLead = leads.find((row) => row.createdAt === DAY1)!;
    // A second submit during the fair is a duplicate of the fair lead.
    expect(await lead(f, v1, f.advanced.id, "test_drive")).toMatchObject({ duplicate: true, submittedAt: DAY1 });

    const exported = await f.admin.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.participationId, paginationOpts: { numItems: 50, cursor: null } });
    expect(exported.page.map((row) => row.leadId)).toEqual([fairLead._id]);
    const file = await f.admin.query(internal.fairReports.leadsExportPage, { eventId: f.eventId, participationId: f.participationId, cursor: null });
    expect(file.rows.map((row) => row.createdAt)).toEqual([DAY1]);
    const inbox = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: { numItems: 50, cursor: null } });
    expect(inbox.page.map((row) => row.leadId)).toEqual([fairLead._id]);
    const earlyInbox = await f.admin.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, from: 0, to: STARTS_AT, paginationOpts: { numItems: 50, cursor: null } });
    expect(earlyInbox.page).toEqual([]);
    const counts = await f.admin.query(api.fairAdminStats.getLeadCounts, { eventId: f.eventId });
    expect(counts.byModel).toEqual([{ eventModelId: f.advanced.id, interest: 0, testDrive: 1, undelivered: 1 }]);
    const dashboard = await f.admin.query(api.fairDashboard.getEventDashboard, { eventId: f.eventId, at: DAY1 });
    expect(dashboard.kpis.leads).toMatchObject({ total: 1 });
    const estimate = await f.admin.query(api.fairFollowUps.estimateFollowUps, { eventId: f.eventId });
    expect(estimate.byParticipation).toEqual([{ participationId: f.participationId, pairs: 1, sent: 0, suppressed: 0 }]);
    expect((await f.t.run((ctx) => fairPairLeads(ctx, f.participationId, EMAIL))).map((row) => row._id)).toEqual([fairLead._id]);
    // Handing over the exhibitor's leads marks only the fair lead.
    expect(await f.admin.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, participationId: f.participationId })).toMatchObject({ delivered: 1, hasMore: false });
    expect((await f.t.run((ctx) => ctx.db.get(preLead._id)))!.status).toBe("received");
  });

  test("the visitor's activity next to a fair lead leaves out everything from before the start", async () => {
    const f = await setup();
    const v1 = visitor();
    vi.setSystemTime(PRE);
    await scan(f, f.advanced.code, v1);
    await rate(f, v1, f.advanced.id, { appearance: 5 });
    await f.t.mutation(api.fairInteractions.recordSponsoredAction, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, eventModelId: f.advanced.id, surface: "garage", kind: "open_model", requestId: nextId("sponsored") });
    vi.setSystemTime(DAY1);
    await lead(f, v1, f.advanced.id, "interest");
    const [fairLead] = await rows(f, "fairLeads");
    let detail = await f.admin.query(api.fairLeadsInbox.getLeadDetail, { leadId: fairLead._id });
    expect(detail!.activity.scans!.items).toEqual([]);
    expect(detail!.activity.ratings!.items).toEqual([]);
    expect(detail!.activity.sponsoredActions!.items).toEqual([]);
    expect(detail!.activity.passport!.items).toEqual([]);
    // During the fair the same visitor's scan and rating appear.
    await scan(f, f.advanced.code, v1);
    await rate(f, v1, f.advanced.id, { price: 4 });
    detail = await f.admin.query(api.fairLeadsInbox.getLeadDetail, { leadId: fairLead._id });
    expect(detail!.activity.scans!.items).toEqual([{ eventModelId: f.advanced.id, firstAt: DAY1, lastAt: DAY1, count: 1 }]);
    expect(detail!.activity.ratings!.items).toEqual([{ eventModelId: f.advanced.id, at: DAY1, price: 4 }]);
    expect(detail!.activity.passport!.items.map((row) => row.stamps)).toEqual([[{ eventModelId: f.advanced.id, at: DAY1 }]]);
  });

  test("a follow-up queued for a pre-event lead before P1 is closed as PRE_EVENT at send time, nothing is sent", async () => {
    const f = await setup();
    const v1 = visitor();
    vi.setSystemTime(PRE);
    await lead(f, v1, f.advanced.id, "test_drive");
    const [preLead] = await rows(f, "fairLeads");
    // The row a submit before P1 would have queued.
    const deliveryId = await f.t.run((ctx) => ctx.db.insert("fairEmailDeliveries", {
      dedupeKey: `fair-lead/${preLead._id}/post_event_follow_up`, leadId: preLead._id, kind: "post_event_follow_up", recipient: EMAIL,
      status: "queued", scheduledFor: FOLLOW_UP_AT, attemptCount: 0, createdAt: PRE, updatedAt: PRE,
    }));
    vi.setSystemTime(FOLLOW_UP_AT + 1);
    const before = fetchCalls;
    expect(await f.t.mutation(internal.fairEmails.claimDelivery, { deliveryId })).toEqual({ action: "skip" });
    expect((await f.t.run((ctx) => ctx.db.get(deliveryId)))!).toMatchObject({ status: "skipped", lastError: "PRE_EVENT" });
    await f.t.action(internal.fairEmailSender.sendDelivery, { deliveryId });
    expect(fetchCalls).toBe(before);
  });
});

// =============================================================================
// 5. Resetuj pre-event podatke
// =============================================================================

/** Pre-event data of every kind (P1 rows and rows written before P1, counted then), plus fair data. */
async function mixedData(f: Fixture) {
  const [v1, v3] = [visitor(), visitor()];
  const q = f.questions.advancedDay2;
  vi.setSystemTime(PRE);
  await f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: q });
  // P1 rows (pre-event, never counted).
  await scan(f, f.starter.code, v1);
  await scan(f, f.advanced.code, v1);
  await rate(f, v1, f.starter.id, { overall: 4 });
  await vote(f, v1, q, "test-da");
  await f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, passportId: f.passportId, eventModelId: f.starter.id });
  await answerSurvey(f, v1, "yes");
  await lead(f, v1, f.advanced.id, "test_drive");
  await f.t.mutation(api.fairInteractions.recordSponsoredAction, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, eventModelId: f.advanced.id, surface: "garage", kind: "garage_add", requestId: nextId("sponsored") });
  // Rows written before P1 (pre-event, counted then) by two TEST visitors:
  // v2 only before the start; v4 before and again during the fair.
  const legacy = await f.t.run(async (ctx) => {
    const v2 = await ctx.db.insert("fairVisitors", { visitorHash: "b".repeat(64), firstSeenAt: PRE, lastSeenAt: PRE });
    const v4 = await ctx.db.insert("fairVisitors", { visitorHash: "d".repeat(64), firstSeenAt: PRE, lastSeenAt: DAY1 });
    const starter = (await ctx.db.get(f.starter.id))!;
    const scanRow = async (visitorId: Id<"fairVisitors">, at: number) => {
      const time = fairTimeKeys(at);
      await ctx.db.insert("fairScanEvents", {
        requestId: nextId("legacy-scan"), visitorId, eventId: f.eventId, eventModelId: starter._id, standId: starter.standId, brandId: starter.brandId,
        occurredAt: at, dateKey: time.dateKey, hourKey: time.hourKey, isAdminExcluded: false,
      });
      for (const key of fairScanCountKeys("scan_total", { eventModelId: starter._id, standId: starter.standId }, time)) await bumpFairCount(ctx, key);
    };
    const uniqueRow = async (visitorId: Id<"fairVisitors">, first: number, last: number, total: number) => {
      await ctx.db.insert("fairUniqueScans", { visitorId, eventId: f.eventId, eventModelId: starter._id, firstScannedAt: first, lastScannedAt: last, totalScanCount: total });
      for (const key of fairScanCountKeys("scan_unique", { eventModelId: starter._id, standId: starter.standId }, fairTimeKeys(first))) await bumpFairCount(ctx, key);
    };
    await scanRow(v2, PRE);
    await uniqueRow(v2, PRE, PRE, 1);
    await scanRow(v4, PRE);
    await scanRow(v4, DAY1);
    await uniqueRow(v4, PRE, DAY1, 2);
    await ctx.db.insert("fairPassportStamps", { visitorId: v4, eventId: f.eventId, brandId: starter.brandId, eventModelId: starter._id, scannedAt: PRE });
    await ctx.db.insert("fairRatings", { visitorId: v2, eventId: f.eventId, eventModelId: f.advanced.id, appearance: 3, createdAt: PRE, updatedAt: PRE });
    await bumpFairCount(ctx, fairRatingCountKey("appearance", f.advanced.id), 1);
    await bumpFairCount(ctx, fairRatingSumKey("appearance", f.advanced.id), 3);
    await ctx.db.insert("fairAudienceVotes", { visitorId: v2, eventId: f.eventId, eventModelId: f.advanced.id, questionId: q, optionId: "test-ne", createdAt: PRE, updatedAt: PRE });
    await bumpFairCount(ctx, fairAudienceVoteKey(q, "test-ne"), 1);
    // A shared collection and its traffic (no counter): the link stays, the pre-event traffic goes.
    const shareCollectionId = await ctx.db.insert("fairShareCollections", { requestId: nextId("share"), codeHash: "c".repeat(64), eventId: f.eventId, eventModelIds: [starter._id], status: "active", createdAt: PRE, expiresAt: Date.parse("2026-11-16T00:00:00+01:00") });
    const pre = fairTimeKeys(PRE);
    await ctx.db.insert("fairTrafficEvents", { requestId: nextId("traffic"), eventId: f.eventId, shareCollectionId, kind: "share_open", occurredAt: PRE, dateKey: pre.dateKey, hourKey: pre.hourKey });
    const day1 = fairTimeKeys(DAY1);
    await ctx.db.insert("fairTrafficEvents", { requestId: nextId("traffic"), eventId: f.eventId, shareCollectionId, kind: "share_open", occurredAt: DAY1, dateKey: day1.dateKey, hourKey: day1.hourKey });
    return { v2, v4, shareCollectionId };
  });
  // Fair data (from the start on).
  vi.setSystemTime(DAY1);
  await scan(f, f.advanced.code, v3);
  await rate(f, v3, f.starter.id, { overall: 2 });
  await vote(f, v3, q, "test-da");
  await lead(f, v3, f.starter.id, "interest");
  // Whatever the writes scheduled (confirmation sends, passport/sponsored sync) runs now, before any snapshot.
  await drain(f);
  return { v1, v3, q, ...legacy };
}

const VISITOR_TABLES = [
  "fairScanEvents", "fairUniqueScans", "fairPassportStamps", "fairRatings", "fairAudienceVotes", "fairBrandFavoriteVotes",
  "fairSurveyResponses", "fairLeads", "fairEmailDeliveries", "fairSponsoredEvents", "fairTrafficEvents",
] as const;
const KEPT_TABLES = [
  "fairEvents", "fairEventDays", "fairParticipations", "fairStands", "fairEventModels", "fairPackageActivations", "fairQrAssignments", "cards", "cardTargets",
  "accessChannels", "accessSubjects", "fairConsentConfigs", "fairLeadConfigs", "fairMessageTemplates", "fairAudienceQuestions", "fairSurveys", "fairPassportConfigs",
  "fairPassportEligibleModels", "fairShareCollections", "fairVisitors", "brands", "businesses", "accounts",
] as const;
async function snapshotOf(f: Fixture, tables: readonly TableNames[]) {
  return f.t.run(async (ctx) => {
    const out: Record<string, unknown[]> = {};
    for (const table of tables) out[table] = await ctx.db.query(table).collect();
    return JSON.stringify(out);
  });
}

describe("P1 — „Resetuj pre-event podatke“", () => {
  test("the overview and the dry run count every kind; the dry run and a wrong slug delete nothing", async () => {
    const f = await setup();
    await mixedData(f);
    const expected = {
      email_deliveries: 1, leads: 1, survey_responses: 1, ratings: 2, audience_votes: 2, brand_favorites: 1,
      // v1's two stamps; v4's pre-P1 stamp moves to the fair (v4 scanned the model again during the fair).
      passport_stamps: 2, sponsored_actions: 1, traffic_events: 1,
      // v1's two and v2's; v4's row has a fair scan, so it stays.
      unique_scans: 3, scan_events: 4,
    };
    const overview = await f.admin.query(api.fairPreEvent.getPreEventSummary, { eventId: f.eventId });
    expect(Object.fromEntries(overview.categories.map((row) => [row.category, row.count]))).toEqual(expected);
    expect(overview).toMatchObject({ eventSlug: EM, startsAt: STARTS_AT, capPerCategory: 200, total: 19, capped: false });
    expect(await f.t.query(internal.fairPreEvent.previewPreEventReset, { eventSlug: EM })).toEqual(overview);
    expect(await f.t.query(internal.fairPreEvent.previewPreEventReset, { eventSlug: "nema-ga" })).toBeNull();

    const before = await snapshotOf(f, [...VISITOR_TABLES, ...KEPT_TABLES, "fairMetricCountShards"]);
    expect(await f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId })).toEqual({ dryRun: true, started: false, summary: overview });
    expect(await f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: true, confirmSlug: EM })).toMatchObject({ dryRun: true, started: false });
    await expectCode(f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false }), "FAIR_RESET_CONFIRMATION_MISMATCH");
    await expectCode(f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false, confirmSlug: "elektromobilnost-2026" }), "FAIR_RESET_CONFIRMATION_MISMATCH");
    await expect(f.member.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false, confirmSlug: EM })).rejects.toThrow();
    await expect(f.t.query(api.fairPreEvent.getPreEventSummary, { eventId: f.eventId })).rejects.toThrow();
    await drain(f);
    expect(await snapshotOf(f, [...VISITOR_TABLES, ...KEPT_TABLES, "fairMetricCountShards"])).toBe(before);
  });

  test("the confirmed reset deletes only pre-event visitor data, fixes the counters of pre-P1 rows, keeps everything else and is idempotent", async () => {
    const f = await setup();
    const data = await mixedData(f);
    const kept = await snapshotOf(f, KEPT_TABLES);
    const fairRows = await f.t.run(async (ctx) => ({
      scans: (await ctx.db.query("fairScanEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", f.eventId).gte("occurredAt", STARTS_AT)).collect()).map((row) => row._id),
      leads: (await ctx.db.query("fairLeads").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", f.eventId).gte("createdAt", STARTS_AT)).collect()).map((row) => row._id),
    }));

    const started = await f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false, confirmSlug: ` ${EM} ` });
    expect(started).toMatchObject({ dryRun: false, started: true, summary: { total: 19 } });
    await drain(f);

    // Nothing pre-event is left; the fair rows are intact.
    const overview = await f.admin.query(api.fairPreEvent.getPreEventSummary, { eventId: f.eventId });
    expect(overview.total).toBe(0);
    expect((await rows(f, "fairScanEvents")).map((row) => row._id).sort()).toEqual(fairRows.scans.sort());
    expect((await rows(f, "fairLeads")).map((row) => row._id)).toEqual(fairRows.leads);
    expect((await rows(f, "fairEmailDeliveries")).every((row) => fairRows.leads.includes(row.leadId!))).toBe(true);
    expect(await rows(f, "fairSurveyResponses")).toEqual([]);
    expect(await rows(f, "fairBrandFavoriteVotes")).toEqual([]);
    expect(await rows(f, "fairSponsoredEvents")).toEqual([]);
    expect((await rows(f, "fairTrafficEvents")).map((row) => row.occurredAt)).toEqual([DAY1]);
    expect((await rows(f, "fairRatings")).map((row) => [row.createdAt, row.overall])).toEqual([[DAY1, 2]]);
    expect((await rows(f, "fairAudienceVotes")).map((row) => [row.createdAt, row.optionId])).toEqual([[DAY1, "test-da"]]);
    // v4 (pre-P1, scanned again during the fair): unique row and stamp move to the fair.
    const uniques = await rows(f, "fairUniqueScans");
    expect(uniques.map((row) => [row.visitorId, row.firstScannedAt, row.totalScanCount]).sort()).toEqual(
      [[data.v4, DAY1, 1], [(await f.t.run((ctx) => ctx.db.query("fairVisitors").withIndex("by_visitorHash", (q) => q.eq("visitorHash", data.v3)).unique()))!._id, DAY1, 1]].sort(),
    );
    // v3 earned its stamp during the fair; v4's pre-P1 stamp moved there.
    const v3Id = (await f.t.run((ctx) => ctx.db.query("fairVisitors").withIndex("by_visitorHash", (q) => q.eq("visitorHash", data.v3)).unique()))!._id;
    expect((await rows(f, "fairPassportStamps")).map((row) => [row.visitorId, row.eventModelId, row.scannedAt]).sort()).toEqual([[data.v4, f.starter.id, DAY1], [v3Id, f.advanced.id, DAY1]].sort());
    // Catalog, QR, consents, forms, questions, surveys, passports, shared links and visitors are untouched.
    expect(await snapshotOf(f, KEPT_TABLES)).toBe(kept);

    // Counters = the fair only (pre-P1 shares removed, v4's unique moved to its fair scan).
    expect((await scanCounts(f, f.starter.id)).model).toEqual({ total: 1, unique: 1 });
    expect((await scanCounts(f, f.starter.id, "2026-10-08")).day).toEqual({ total: 0, unique: 0 });
    expect((await scanCounts(f, f.starter.id, "2026-10-09")).day).toEqual({ total: 1, unique: 1 });
    expect((await scanCounts(f, f.advanced.id)).model).toEqual({ total: 1, unique: 1 });
    expect((await scanCounts(f, f.starter.id)).stand).toEqual({ total: 2, unique: 2 });
    expect(ratingOf(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 1, sum: 2 });
    expect(ratingOf(await summary(f, f.advanced.id), "appearance")).toMatchObject({ count: 0, sum: 0 });
    expect((await summary(f, f.advanced.id)).questions.find((row) => row.questionId === data.q)!.options).toEqual([{ optionId: "test-da", count: 1 }, { optionId: "test-ne", count: 0 }]);
    expect(await count(f, fairFavoriteKey(f.passportId, f.starter.id))).toBe(0);

    // Audit: started and completed, with counts only.
    const audit = (await rows(f, "adminAuditLog")).filter((row) => row.action.startsWith("fair_pre_event_reset"));
    expect(audit.map((row) => row.action)).toEqual(["fair_pre_event_reset_started", "fair_pre_event_reset_completed"]);
    expect(audit.map((row) => row.detail ?? "").join(" ")).not.toContain("example.invalid");

    // Idempotent: a second run finds nothing and changes nothing.
    const after = await snapshotOf(f, [...VISITOR_TABLES, ...KEPT_TABLES, "fairMetricCountShards"]);
    await f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false, confirmSlug: EM });
    await drain(f);
    expect(await snapshotOf(f, [...VISITOR_TABLES, ...KEPT_TABLES, "fairMetricCountShards"])).toBe(after);
  });

  test("more rows than one batch are deleted over several scheduled transactions", async () => {
    const f = await setup();
    const rowsToDelete = FAIR_PRE_EVENT_BATCH_SIZE + 30;
    await f.t.run(async (ctx) => {
      const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: "e".repeat(64), firstSeenAt: PRE, lastSeenAt: PRE });
      const model = (await ctx.db.get(f.advanced.id))!;
      const time = fairTimeKeys(PRE);
      for (let index = 0; index < rowsToDelete; index += 1) {
        await ctx.db.insert("fairScanEvents", {
          requestId: `test-p1-batch-${index}`, visitorId, eventId: f.eventId, eventModelId: model._id, standId: model.standId, brandId: model.brandId,
          occurredAt: PRE + index, dateKey: time.dateKey, hourKey: time.hourKey, isAdminExcluded: false, preEvent: true,
        });
      }
    });
    expect((await f.admin.query(api.fairPreEvent.getPreEventSummary, { eventId: f.eventId })).categories.find((row) => row.category === "scan_events")).toEqual({ category: "scan_events", count: 130, capped: false });
    vi.setSystemTime(DAY1);
    await f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false, confirmSlug: EM });
    await drain(f);
    expect(await rows(f, "fairScanEvents")).toEqual([]);
    const completed = (await rows(f, "adminAuditLog")).find((row) => row.action === "fair_pre_event_reset_completed")!;
    expect(JSON.parse(completed.detail!)).toMatchObject({ deleted: rowsToDelete });
  });
});
