/// <reference types="vite/client" />

// Sajam 2026 B7 — end to end on the integration TEST seed for the 8 Oct 2026
// test (BACKEND-HANDOFF §11 B7, §12, §14; MASTER §2, §18; V2 §14): both TEST
// fairs, 2 TEST exhibitors, 10 TEST models over the 3 packages, a passport, an
// Advanced question and survey, a published snapshot. One TEST visitor goes
// scan → model → total/unique → rating and vote → passport and favorite →
// survey → lead (CONSENT_NOT_CONFIGURED) → garage sponsored action; the daily
// dataset is built; the purge preview lists the visitor's rows and the purge
// deletes every one of them while the anonymous aggregates stay.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_PII_PURGE_AT_MS, FAIR_PURGE_CATEGORIES } from "../lib/fair-contract";
import { FAIR_PURGE_TABLES } from "./fairRetention";
// Loaded up front: the scheduler imports these dynamically (see fairReports.test.ts).
import "./fairAnalytics";
import "./fairEmails";
import "./fairEmailSender";
import "./fairReports";
import "./fairRetention";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const SEED_AT = Date.parse("2026-10-05T10:00:00+02:00");
const REHEARSAL = Date.parse("2026-10-08T11:00:00+02:00");
const REHEARSAL_END = Date.parse("2026-10-09T00:00:00+02:00");
const ADMIN_EMAIL = "fair-b7-e2e@scanme.test";
const ISSUER = "https://fair-b7-e2e.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const EM = "test-elektromobilnost-2026";
const AMF = "test-auto-moto-fest-2026";

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

const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
let sequence = 0;
const requestId = () => `test-e2e-${++sequence}`;

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const adminId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
  const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const model = async (eventCode: string, externalKey: string) => t.run(async (ctx) => {
    const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", eventCode)).unique())!;
    return (await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey)).unique())!;
  });
  const qr = (externalKey: string) => seed.qr.find((row) => row.modelExternalKey === externalKey)!;
  return { t, admin, seed, model, qr };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

const rows = <T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> => f.t.run(async (ctx) => ctx.db.query(table).collect());
const scan = (f: Fixture, code: string, visitorHash: string, id = requestId()) =>
  f.t.mutation(api.cards.resolveAndRecord, { cardCode: code, requestId: id, deviceCategory: "mobile", ipHash: "test-hall-nat", fairVisitorHash: visitorHash });
const drain = (f: Fixture) => f.t.finishAllScheduledFunctions(vi.runAllTimers);

describe("B7 integration TEST seed (8 Oct 2026)", () => {
  test("covers both fairs, 2 exhibitors, 10 models over all 3 packages, QR, passport, Advanced question and survey, snapshot — idempotently", async () => {
    const f = await setup();
    const { seed } = f;
    expect(seed.catalog).toMatchObject({ events: { created: 2 }, models: { created: 10 }, participations: { created: 4 }, days: { created: 7 } });
    expect(seed.rehearsal).toMatchObject({ eventStartsAt: Date.parse("2026-10-08T00:00:00+02:00"), activationsMoved: 0 });
    expect(seed.qr).toHaveLength(10);
    expect(new Set(seed.qr.map((row) => row.tier))).toEqual(new Set(["included", "starter", "advanced"]));
    expect(new Set(seed.qr.map((row) => row.eventCode))).toEqual(new Set([EM, AMF]));
    expect(seed.qr.every((row) => row.created && row.path.startsWith("/sajam/test-"))).toBe(true);
    expect(seed.passport).toEqual({ created: true, requiredModels: 2 });
    expect(seed.surveys).toEqual({ created: 2, unchanged: 0 });
    expect(seed.questions).toEqual({ created: 4, unchanged: 0 });
    expect(seed.leadConfigs.created).toBe(10); // 7 Starter+ interest forms + 3 Advanced test-drive forms
    expect(seed.snapshots).toEqual([
      { eventCode: EM, created: true, version: 1, items: 2 },
      { eventCode: AMF, created: true, version: 1, items: 1 },
    ]);

    const accounts = await rows(f, "accounts");
    const exhibitors = new Set((await rows(f, "fairParticipations")).map((row) => row.accountId));
    expect(exhibitors.size).toBe(2);
    expect(accounts.filter((row) => exhibitors.has(row._id)).every((row) => row.name.startsWith("TEST"))).toBe(true);
    expect((await rows(f, "fairEventModels")).every((row) => row.externalKey.startsWith("test-") && row.displayName.startsWith("TEST"))).toBe(true);
    // No consent text exists: the lead path stays closed (CONSENT_NOT_CONFIGURED).
    expect(await rows(f, "fairConsentConfigs")).toEqual([]);

    const again = await f.t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
    expect(again.catalog).toMatchObject({ events: { created: 0, updated: 0 }, days: { created: 0, updated: 0 }, models: { created: 0, updated: 0 } });
    expect(again.qr.every((row) => !row.created)).toBe(true);
    expect(again.qr.map((row) => row.resolverCode)).toEqual(seed.qr.map((row) => row.resolverCode));
    expect(again.passport.created).toBe(false);
    expect(again).toMatchObject({ surveys: { created: 0, unchanged: 2 }, questions: { created: 0, unchanged: 4 }, leadConfigs: { created: 0, unchanged: 10 } });
    expect(again.snapshots.every((row) => !row.created && row.version === 1)).toBe(true);
    await expect(f.t.mutation(internal.fairDevFixtures.seedTestQr, { eventCode: "elektromobilnost-2026" })).rejects.toThrow("fair_dev_fixture_not_test");
  });

  test("an existing DEV catalog (packages from 9 Oct) is aligned to the rehearsal without touching upgraded history", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
    await t.mutation(internal.fairDevFixtures.seedTestCatalog, {});
    const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
    expect(seed.catalog.events.updated).toBe(1);
    expect(seed.rehearsal.activationsMoved).toBe(4); // EM: 2 Advanced + 2 Starter
    const models = await t.run((ctx) => ctx.db.query("fairEventModels").collect());
    const em = models.filter((row) => row.externalKey.startsWith("test-em26-") && row.packageTier !== "included");
    expect(em.every((row) => row.packageActivatedAt === Date.parse("2026-10-08T00:00:00+02:00"))).toBe(true);
    const amf = models.filter((row) => row.externalKey.startsWith("test-amf26-") && row.packageTier !== "included");
    expect(amf.every((row) => row.packageActivatedAt === Date.parse("2026-10-30T09:00:00+01:00"))).toBe(true);
    expect((await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {})).rehearsal.activationsMoved).toBe(0);
  });
});

describe("B7 end to end on the TEST seed", () => {
  test("scan → model → counts → interactions → lead gate → rotation → daily dataset → purge of the TEST visitor with aggregates kept", async () => {
    const f = await setup();
    const voltaX1 = await f.model(EM, "test-em26-volta-x1"); // Advanced
    const voltaX2 = await f.model(EM, "test-em26-volta-x2"); // Starter
    const omZ1 = await f.model(EM, "test-em26-om-z1"); // Advanced, exhibitor B
    const amfOm = await f.model(AMF, "test-amf26-om-z1"); // Advanced, future fair
    vi.setSystemTime(REHEARSAL);
    const me = visitor();
    const other = visitor();

    // 1. The printed TEST QR opens the published model.
    const first = await scan(f, f.qr("test-em26-volta-x1").resolverCode, me);
    expect(first).toEqual({ kind: "fair_model", path: f.qr("test-em26-volta-x1").path, fairScan: "recorded" });
    const [, , eventSlug, , modelSlug] = f.qr("test-em26-volta-x1").path.split("/");
    const page = await f.t.query(api.fairPublic.getModelBySlug, { eventSlug, modelSlug });
    expect(page).toMatchObject({ id: voltaX1._id, displayName: "TEST Volta X1", capabilities: { ratingMode: "dimensions", canRequestTestDrive: true, hasSurvey: true, isSponsored: true } });

    // 2. Total/unique: 10 scans of one device = 10 total, 1 unique; a retry adds nothing; a second device = 2 unique.
    const retryId = requestId();
    for (let i = 1; i < 10; i += 1) await scan(f, f.qr("test-em26-volta-x1").resolverCode, me, i === 9 ? retryId : undefined);
    expect(await scan(f, f.qr("test-em26-volta-x1").resolverCode, me, retryId)).toMatchObject({ kind: "fair_model" });
    await scan(f, f.qr("test-em26-volta-x1").resolverCode, other);
    expect(await f.t.query(internal.fairScans.modelScanCounts, { eventModelId: voltaX1._id, dateKey: "2026-10-08" })).toMatchObject({
      model: { total: 11, unique: 2 }, day: { total: 11, unique: 2 },
    });

    // 3. Rating and vote change the visitor's row instead of adding one.
    await f.t.mutation(api.fairInteractions.upsertRating, { visitorHash: me, eventModelId: voltaX1._id, appearance: 4 });
    expect(await f.t.mutation(api.fairInteractions.upsertRating, { visitorHash: me, eventModelId: voltaX1._id, appearance: 5, price: 3 })).toMatchObject({ mode: "dimensions", appearance: 5, price: 3 });
    await f.t.mutation(api.fairInteractions.upsertRating, { visitorHash: me, eventModelId: voltaX2._id, overall: 4 });
    expect(await rows(f, "fairRatings")).toHaveLength(2);
    const [question] = await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: voltaX1._id, dateKey: "2026-10-08" });
    expect(question).toMatchObject({ prompt: "TEST pitanje generalne probe?" });
    expect(await f.t.mutation(api.fairInteractions.upsertAudienceVote, { visitorHash: me, questionId: question.id, optionId: "test-ne" })).toMatchObject({ state: "waiting_for_minimum", myOptionId: "test-ne" });
    for (let i = 0; i < 4; i += 1) await f.t.mutation(api.fairInteractions.upsertAudienceVote, { visitorHash: visitor(), questionId: question.id, optionId: "test-da" });
    expect(await f.t.mutation(api.fairInteractions.upsertAudienceVote, { visitorHash: me, questionId: question.id, optionId: "test-da" })).toMatchObject({
      state: "public", myOptionId: "test-da", options: [{ optionId: "test-da", percentage: 100 }, { optionId: "test-ne", percentage: 0 }],
    });

    // 4. Passport: both TEST Volta models scanned → completed → changeable favorite.
    await scan(f, f.qr("test-em26-volta-x2").resolverCode, me);
    const progress = await f.t.query(api.fairInteractions.getMyPassportProgress, { visitorHash: me, eventSlug: EM });
    const volta = progress!.catalog.find((entry) => entry.brandName === "TEST Volta")!;
    expect(progress!.progress.find((row) => row.passportId === volta.passportId)).toMatchObject({ stampedCount: 2, requiredCount: 2, completed: true });
    expect(await f.t.mutation(api.fairInteractions.upsertBrandFavorite, { visitorHash: me, passportId: volta.passportId, eventModelId: voltaX1._id })).toMatchObject({ completed: true, favoriteModelId: voltaX1._id });

    // 5. Advanced survey (one final submit).
    const survey = await f.t.query(api.fairPublic.getSurveyForModel, { eventModelId: voltaX1._id });
    expect(await f.t.mutation(api.fairInteractions.submitSurvey, { visitorHash: me, surveyId: survey!.surveyId, submissionId: "test-e2e-survey-1", answers: [{ questionId: "test-preporuka", value: "yes" }] })).toMatchObject({ duplicate: false });

    // 6. Lead: the form is enabled but no consent text is approved → CONSENT_NOT_CONFIGURED, nothing stored.
    expect(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: voltaX1._id, kind: "test_drive" })).toEqual({ eventModelId: voltaX1._id, kind: "test_drive", state: "consent_not_configured" });
    await expect(f.t.mutation(api.fairLeads.submitLead, {
      visitorHash: me, eventModelId: voltaX1._id, kind: "test_drive", submissionId: "test-e2e-lead-1", contactName: "TEST Posetilac", email: "e2e@example.invalid", consentAccepted: true, consentVersion: 1,
    })).rejects.toMatchObject({ data: { code: "CONSENT_NOT_CONFIGURED" } });
    expect(await rows(f, "fairLeads")).toEqual([]);
    // (For the purge proof only: a TEST consent is activated, one lead is stored, and the consent is retired again.)
    const { consentId } = await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: voltaX1.eventId, leadKind: "test_drive", text: "TEST saglasnost: ScanMe i {izlagac}." });
    await f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId });
    await f.t.mutation(api.fairLeads.submitLead, {
      visitorHash: me, eventModelId: voltaX1._id, kind: "test_drive", submissionId: "test-e2e-lead-2", contactName: "TEST Posetilac", email: "e2e@example.invalid", consentAccepted: true, consentVersion: 1,
    });
    await f.admin.mutation(api.fairLeadsAdmin.retireConsent, { consentId });

    // 7. Rotation: both Advanced models, the rehearsal result on the map; only explicit garage actions write.
    const map = await f.t.query(api.fairPublic.getSponsoredMapRotation, { eventSlug: EM });
    expect(map).toMatchObject({ surface: "map", intervalMs: 12000 });
    expect(map!.items.map((item) => item.eventModelId).sort()).toEqual([voltaX1._id, omZ1._id].sort());
    expect(map!.items.find((item) => item.eventModelId === voltaX1._id)?.audienceResult).toMatchObject({ questionId: question.id, result: { state: "public" } });
    expect(await f.t.query(api.fairPublic.getSponsoredGarageRotation, { eventSlug: EM })).toMatchObject({ surface: "garage", intervalMs: 8000 });
    expect(await f.t.mutation(api.fairInteractions.recordSponsoredAction, { visitorHash: me, eventModelId: omZ1._id, surface: "garage", kind: "open_model", requestId: requestId() })).toMatchObject({ duplicate: false });

    // The future second fair is seeded and readable; its paid features start with its package (30 Oct).
    expect(await f.t.query(api.fairPublic.getEventBySlug, { slug: AMF })).toMatchObject({ slug: AMF });
    await expect(f.t.mutation(api.fairInteractions.upsertRating, { visitorHash: me, eventModelId: amfOm._id, appearance: 5 })).rejects.toMatchObject({ data: { code: "FEATURE_NOT_ENTITLED" } });

    // 8. Daily dataset of the rehearsal day, per exhibitor, without mixing them.
    vi.setSystemTime(REHEARSAL_END + 15 * 60_000);
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 2, more: false });
    // The sweep schedules one build action per run. convex-test runs drained
    // actions concurrently on one in-memory transaction log, where two
    // overlapping storage writes fail ("Write outside of transaction"), so the
    // builds run one after the other here; the scheduled copies then find no
    // `queued` run and do nothing. Production runs them as separate actions.
    for (const run of await rows(f, "fairReportRuns")) await f.t.action(internal.fairReports.buildReportRun, { reportRunId: run._id });
    await drain(f);
    const runs = await rows(f, "fairReportRuns");
    const runA = runs.find((row) => row.participationId === voltaX1.participationId)!;
    expect(runA).toMatchObject({ status: "pending_review", dataThrough: REHEARSAL_END });
    const modelA = runA.dataset!.models.find((row) => row.eventModelId === voltaX1._id)!;
    expect(modelA).toMatchObject({ scans: { total: 11, unique: 2 }, testDrive: { count: 1, capped: false } });
    expect(JSON.stringify(runA.dataset)).not.toContain("TEST Om");
    expect(JSON.stringify(runA.dataset)).not.toContain("e2e@example.invalid");

    // 9. Purge: the preview lists the TEST visitor's rows; afterwards none is left and the aggregates are unchanged.
    const meId = (await f.t.run((ctx) => ctx.db.query("fairVisitors").withIndex("by_visitorHash", (q) => q.eq("visitorHash", me)).unique()))!._id;
    const linked = await f.t.run(async (ctx) => {
      const out: Record<string, number> = {};
      for (const category of FAIR_PURGE_CATEGORIES) {
        const all = await ctx.db.query(FAIR_PURGE_TABLES[category]).collect();
        out[category] = all.filter((row) => ("visitorId" in row && row.visitorId === meId) || row._id === meId || ("leadId" in row && row.leadId !== undefined)).length;
      }
      return out;
    });
    expect(linked).toMatchObject({ email_deliveries: 2, leads: 1, survey_responses: 1, ratings: 2, audience_votes: 1, brand_favorites: 1, passport_stamps: 2, sponsored_actions: 1, unique_scans: 2, scan_events: 11, visitors: 1 });
    const preview = await f.t.query(internal.fairRetention.previewPurge, {});
    for (const row of preview.categories) expect(row.count).toBeGreaterThanOrEqual(linked[row.category]);

    const shards = await rows(f, "fairMetricCountShards");
    const datasets = (await rows(f, "fairReportRuns")).map((row) => row.dataset);
    vi.setSystemTime(FAIR_PII_PURGE_AT_MS);
    expect((await f.t.mutation(internal.fairRetention.purgeTick, {})).status).toBe("started");
    await drain(f);
    for (const category of FAIR_PURGE_CATEGORIES) expect({ category, rows: (await rows(f, FAIR_PURGE_TABLES[category])).length }).toEqual({ category, rows: 0 });
    expect(await rows(f, "fairMetricCountShards")).toEqual(shards);
    expect((await rows(f, "fairReportRuns")).map((row) => row.dataset)).toEqual(datasets);
    expect(await f.t.query(internal.fairScans.modelScanCounts, { eventModelId: voltaX1._id, dateKey: "2026-10-08" })).toMatchObject({ model: { total: 11, unique: 2 }, raw: { scanEvents: 0 } });
    expect(await f.admin.query(api.fairInteractionsAdmin.getModelInteractionSummary, { eventModelId: voltaX1._id })).toMatchObject({
      ratings: expect.arrayContaining([expect.objectContaining({ field: "appearance", count: 1, sum: 5 })]),
    });
    expect(await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: question.id })).toMatchObject({ state: "public" });
    // The visitor's own state is gone with them.
    expect(await f.t.query(api.fairInteractions.getMyModelState, { visitorHash: me, eventModelId: voltaX1._id })).toMatchObject({ rating: { mode: "dimensions" } });
    expect(JSON.stringify(await f.t.query(api.fairInteractions.getMyModelState, { visitorHash: me, eventModelId: voltaX1._id }))).not.toContain('"appearance":5');
  });
});
