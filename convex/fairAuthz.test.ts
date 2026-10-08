/// <reference types="vite/client" />

// Sajam 2026 B7 — the authz table of every fair Convex function (A8: + fairLeadsInbox, fairFollowUps; A10: + fairDashboard)
// (BACKEND-HANDOFF §11 B7 "authz pregled svih public funkcija", §12, §14
// "javne funkcije ne otkrivaju PII ni admin podatke"). The table below is the
// one in jovan-status/B7.md: a new or re-registered fair function fails the
// first test until it is classified here. Admin functions of fairAdmin and
// fairImport are exercised in fairAdmin.test.ts ("every fairAdmin and import
// function refuses a non-admin and an anonymous caller").

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import * as fairAdmin from "./fairAdmin";
import * as fairAdminQr from "./fairAdminQr";
import * as fairAdminStats from "./fairAdminStats";
import * as fairAnalytics from "./fairAnalytics";
import * as fairDashboard from "./fairDashboard";
import * as fairDevFixtures from "./fairDevFixtures";
import * as fairEmailSender from "./fairEmailSender";
import * as fairEmails from "./fairEmails";
import * as fairExhibitorImport from "./fairExhibitorImport";
import * as fairFollowUps from "./fairFollowUps";
import * as fairImport from "./fairImport";
import * as fairInteractions from "./fairInteractions";
import * as fairInteractionsAdmin from "./fairInteractionsAdmin";
import * as fairLeads from "./fairLeads";
import * as fairLeadsAdmin from "./fairLeadsAdmin";
import * as fairLeadsInbox from "./fairLeadsInbox";
import * as fairPackages from "./fairPackages";
import * as fairPassports from "./fairPassports";
import * as fairPreEvent from "./fairPreEvent";
import * as fairPublic from "./fairPublic";
import * as fairReports from "./fairReports";
import * as fairRetention from "./fairRetention";
import * as fairScans from "./fairScans";
import * as fairSharing from "./fairSharing";
import * as fairSetup from "./fairSetup";
import * as fairSponsoredAdmin from "./fairSponsoredAdmin";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const SEED_AT = Date.parse("2026-10-05T10:00:00+02:00");
const REHEARSAL = Date.parse("2026-10-08T11:00:00+02:00");
const ADMIN_EMAIL = "fair-b7-authz@scanme.test";
const ISSUER = "https://fair-b7-authz.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const EM = "test-elektromobilnost-2026";

// K1: a TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
// K3: a TEST legal approval record (not a real review), required by every consent activation.
const TEST_LEGAL_APPROVAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  // K3: the lead switches are on in this TEST env (see convex/fairLeads.test.ts for off).
  process.env.FAIR_LEADS_ENABLED = "true";
  process.env.FAIR_FOLLOWUP_ENABLED = "true";
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  vi.useFakeTimers();
  vi.setSystemTime(SEED_AT);
});
afterEach(() => {
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// visitor = public, reached through the same-origin Next gateway with the
// HMAC of the HttpOnly cookie (or a public read without identity);
// admin = public endpoint whose handler starts with requireAdmin;
// internal = not callable from a client at all.
type Access = "visitor" | "admin" | "internal";
const V = "visitor", A = "admin", I = "internal";
const AUTHZ: Record<string, { module: Record<string, unknown>; functions: Record<string, Access> }> = {
  fairPublic: {
    module: fairPublic,
    functions: {
      getEventBySlug: V, getModelBySlug: V, getModelsByIds: V, getEventMap: V, listAudienceQuestionsForModel: V, getAudienceQuestionResult: V,
      getSurveyForModel: V, getPassportCatalog: V, getLeadForm: V, getSponsoredMapRotation: V, getSponsoredGarageRotation: V,
    },
  },
  fairInteractions: {
    module: fairInteractions,
    functions: { getMyModelState: V, getMyPassportProgress: V, upsertRating: V, upsertAudienceVote: V, submitSurvey: V, upsertBrandFavorite: V, recordSponsoredAction: V },
  },
  fairLeads: { module: fairLeads, functions: { submitLead: V } },
  // 5 Oct traffic/share delta (8e72c10), classified at the 2026-10-05 sync;
  // the two writes require FAIR_GATEWAY_SECRET (fairGateway.test.ts).
  fairSharing: { module: fairSharing, functions: { createShareCollection: V, getShareCollectionByCodeHash: V, recordTraffic: V } },
  fairAdmin: {
    module: fairAdmin,
    functions: {
      upsertEvent: A, upsertEventDay: A, upsertParticipation: A, upsertStand: A, ensureBrand: A, upsertModel: A, publishModel: A, withdrawModel: A,
      upgradePackage: A, createEventClient: A, listEventClients: A, convertEventClientToStandard: A, assignQr: A, releaseQr: A, listQrInventory: A,
      resolveTest: A, listEvents: A, getEventCatalog: A, listValidationIssues: A, getEventDirectory: A,
    },
  },
  // Admin UX A3 — read-only numbers of the Modeli list and model detail.
  fairAdminStats: { module: fairAdminStats, functions: { getLeadCounts: A, getModelQrCodes: A } },
  // Admin UX A4 — QR detail, scan numbers, change of destination and bulk assignment.
  fairAdminQr: {
    module: fairAdminQr,
    // N1 — field linking of stickers (link, undo, recent links).
    functions: { getQrDetail: A, getQrScanStats: A, reassignQr: A, bulkAssignQrDryRun: A, bulkAssignQrCommit: A, linkSticker: A, undoLink: A, listRecentLinks: A },
  },
  fairImport: { module: fairImport, functions: { dryRun: A, commit: A } },
  // Izlagači 2026 — the organizer's exhibitor list and the event → printed inventory link: CLI only.
  fairExhibitorImport: { module: fairExhibitorImport, functions: { importSiteExhibitors: I, linkEventQrInventory: I, placeSiteExhibitors: I } },
  // Admin UX A10 — the event dashboard (Pregled and the section badges): numbers and links only.
  fairDashboard: { module: fairDashboard, functions: { getEventDashboard: A } },
  fairInteractionsAdmin: {
    module: fairInteractionsAdmin,
    functions: {
      upsertAudienceQuestion: A, publishAudienceQuestion: A, closeAudienceQuestion: A, setSponsoredResultQuestion: A, upsertSurveyDraft: A, publishSurvey: A,
      retireSurvey: A, upsertPassport: A, publishPassport: A, withdrawPassport: A, removePassportModel: A, getEventInteractions: A, getModelInteractionSummary: A,
      // P1 — „Otvori sada“ (a published question opens before its day).
      openAudienceQuestionNow: A,
    },
  },
  // P1 — pre-event data: the admin overview and reset; the batches and the CLI dry run are internal.
  fairPreEvent: { module: fairPreEvent, functions: { getPreEventSummary: A, resetPreEventData: A, resetPreEventBatch: I, previewPreEventReset: I } },
  // P1 — the package migration (future activations → assignment moment), CLI only.
  fairPackages: { module: fairPackages, functions: { migrateFutureActivations: I } },
  fairLeadsAdmin: {
    module: fairLeadsAdmin,
    functions: {
      getEventConsents: A, saveConsentDraft: A, activateConsent: A, retireConsent: A, getModelLeadSettings: A, upsertLeadConfig: A, upsertFollowUpTemplate: A,
      exportLeads: A, setFollowUpSuppressed: A, retryEmailDelivery: A,
      // Admin UX A7 — lead forms per exhibitor and the K3 switch state.
      getEventLeadForms: A, upsertParticipationLeadDefault: A, applyLeadDefaultsToModels: A, clearLeadOverride: A, getLeadSwitches: A,
    },
  },
  // Admin UX A8 — the lead inbox (activity next to a lead, delivery) and the follow-up per exhibitor.
  fairLeadsInbox: { module: fairLeadsInbox, functions: { listEventLeads: A, getLeadDetail: A, markLeadsDelivered: A } },
  fairFollowUps: {
    module: fairFollowUps,
    functions: {
      getExhibitorFollowUps: A, saveExhibitorFollowUpDraft: A, activateExhibitorFollowUp: A, retireExhibitorFollowUp: A, previewExhibitorFollowUp: A, estimateFollowUps: A,
    },
  },
  // Admin UX A7 — the automatic brand passport (sync jobs are internal).
  fairPassports: {
    module: fairPassports,
    functions: { getPassportOverview: A, refreshPassports: A, setPassportHidden: A, syncBrandPassport: I, syncEventPassports: I },
  },
  // Admin UX A9 — the automatic snapshot (the scheduled sync job is internal).
  fairSponsoredAdmin: {
    module: fairSponsoredAdmin,
    functions: { publishSponsoredSnapshot: A, getSponsoredRotationAdmin: A, setSponsoredAutoPublish: A, getSponsoredQuestionVotes: A, syncSponsoredSnapshotJob: I },
  },
  fairReports: {
    module: fairReports,
    functions: {
      listReportRuns: A, getReportRun: A, requestReportBuild: A, approveReportRun: A, sendReportRun: A, resendReportRun: A, retryReportRun: A,
      createReportCorrection: A, downloadReportRun: A, exportLeadsFile: A, exportOrganizerAggregate: A,
      sweepDailyReports: I, claimBuild: I, completeBuild: I, failBuild: I, buildReportRun: I, reportRunForDownload: I, leadsExportPage: I,
    },
  },
  fairRetention: {
    module: fairRetention,
    functions: { getRetentionOverview: A, startPurgeDryRun: A, purgeTick: I, purgeContinue: I, previewPurge: I, startDryRun: I, listPurgeRuns: I },
  },
  fairAnalytics: { module: fairAnalytics, functions: { reportContext: I, modelDayRaw: I, organizerScope: I, organizerStandDays: I, organizerParticipationLeads: I } },
  fairScans: { module: fairScans, functions: { modelScanCounts: I } },
  // N5: requeueStaleDeliveries — the 5-minute outbox sweep (cron only).
  fairEmails: { module: fairEmails, functions: { claimDelivery: I, markSent: I, markFailed: I, purgeLeadPiiBatch: I, requeueStaleDeliveries: I } },
  fairEmailSender: { module: fairEmailSender, functions: { sendDelivery: I, sendDevTestEmail: I } },
  fairDevFixtures: {
    module: fairDevFixtures,
    // Aleksa (8. 10.): seedElectromobilityReviewCatalog — DEV review catalog of the real event.
    functions: { seedTestCatalog: I, seedTestQr: I, seedTestPassport: I, seedTestSponsoredSnapshot: I, seedIntegrationTest: I, seedShowcaseCatalog: I, seedElectromobilityReviewCatalog: I },
  },
  // Aleksa (8. 10., ebb3102): the real elektromobilnost-2026 setup, internal only (RUNBOOK-EVENT-SETUP.md).
  fairSetup: { module: fairSetup, functions: { bootstrapEvent: I, importDryRun: I, importCommit: I, publishEventModels: I } },
};

type Registered = { isPublic?: boolean; isInternal?: boolean };
function registered(module: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(module)
      .filter(([, value]) => typeof value === "function" && ((value as Registered).isPublic || (value as Registered).isInternal))
      .map(([name, value]) => [name, (value as Registered).isPublic ? "public" : "internal"]),
  );
}

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
    const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EM)).unique())!;
    const model = (await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", "test-em26-volta-x1")).unique())!;
    const day = (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id).eq("dateKey", "2026-10-08")).unique())!;
    const question = (await ctx.db.query("fairAudienceQuestions").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", "test-em26-volta-x1-q-proba")).unique())!;
    const survey = (await ctx.db.query("fairSurveys").withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", model._id).eq("status", "published")).unique())!;
    const passport = (await ctx.db.query("fairPassportConfigs").withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", event._id).eq("brandId", model.brandId)).unique())!;
    // Exhibitor data that must never reach a public function.
    await ctx.db.patch(model.participationId, { reportRecipientEmail: "izvestaji-a@example.invalid", leadDeliveryNote: "TEST napomena o predaji" });
    return { eventId: event._id, modelId: model._id, participationId: model.participationId, brandId: model.brandId, dayId: day._id, questionId: question._id, surveyId: survey._id, passportId: passport._id };
  });
  return { t, admin, member, seed, ...ids };
}

const message = (error: unknown) => {
  const data = (error as { data?: unknown }).data;
  return typeof data === "string" ? data : error instanceof Error ? error.message : String(error);
};

describe("B7 authz table of every fair function", () => {
  test("each fair module registers exactly the classified functions (visitor/admin → public, internal → internal)", () => {
    for (const [name, { module, functions }] of Object.entries(AUTHZ)) {
      const expected = Object.fromEntries(Object.entries(functions).map(([fn, access]) => [fn, access === "internal" ? "internal" : "public"]));
      expect({ module: name, functions: registered(module) }).toEqual({ module: name, functions: expected });
    }
  });

  test("every admin function of the B3–B7 admin modules refuses an anonymous and a non-admin caller before touching data", async () => {
    const f = await setup();
    vi.setSystemTime(REHEARSAL);
    const extra = await f.t.run(async (ctx) => {
      const now = Date.now();
      const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: "f".repeat(64), firstSeenAt: now, lastSeenAt: now });
      const leadId = await ctx.db.insert("fairLeads", {
        submissionId: "test-authz-lead", kind: "interest", visitorId, eventId: f.eventId, eventModelId: f.modelId, participationId: f.participationId,
        contactName: "TEST Ime", email: "authz@example.invalid", consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST", consentedAt: now,
        status: "received", followUpSuppressed: false, createdAt: now, purgeAt: now,
      });
      const deliveryId = await ctx.db.insert("fairEmailDeliveries", { dedupeKey: "test-authz", leadId, kind: "immediate_confirmation", recipient: "authz@example.invalid", status: "failed", scheduledFor: now, attemptCount: 3, createdAt: now, updatedAt: now });
      const consentId = await ctx.db.insert("fairConsentConfigs", { eventId: f.eventId, leadKind: "interest", version: 1, text: "TEST {izlagac}", status: "draft", createdAt: now, updatedAt: now });
      const reportRunId = await ctx.db.insert("fairReportRuns", { eventId: f.eventId, eventDayId: f.dayId, participationId: f.participationId, status: "pending_review", dataThrough: now, format: "pdf", createdAt: now, updatedAt: now });
      const adminId = (await ctx.db.query("users").collect()).find((row) => row.email === ADMIN_EMAIL)!._id;
      const followUpDraftId = await ctx.db.insert("fairExhibitorFollowUpTemplates", { eventId: f.eventId, participationId: f.participationId, subject: "TEST {ime}", plainText: "TEST {modeli}", status: "draft", version: 1, updatedByUserId: adminId, createdAt: now, updatedAt: now });
      const followUpActiveId = await ctx.db.insert("fairExhibitorFollowUpTemplates", { eventId: f.eventId, participationId: f.participationId, subject: "TEST", plainText: "TEST", status: "active", version: 2, updatedByUserId: adminId, createdAt: now, updatedAt: now });
      // N1: an active link of the TEST model, the target of undoLink.
      const assignmentId = (await ctx.db.query("fairQrAssignments").withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", f.modelId).eq("status", "assigned")).first())!._id;
      return { leadId, deliveryId, consentId, reportRunId, followUpDraftId, followUpActiveId, assignmentId };
    });
    const question = { eventModelId: f.modelId, eventDayId: f.dayId, prompt: "TEST?", options: [{ id: "a", label: "A", order: 1 }, { id: "b", label: "B", order: 2 }], sortOrder: 9 };
    type Caller = Pick<typeof f.t, "query" | "mutation" | "action">;
    const calls: [string, (caller: Caller) => Promise<unknown>][] = [
      ["upsertAudienceQuestion", (c) => c.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, question)],
      ["publishAudienceQuestion", (c) => c.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: f.questionId })],
      ["closeAudienceQuestion", (c) => c.mutation(api.fairInteractionsAdmin.closeAudienceQuestion, { questionId: f.questionId })],
      ["openAudienceQuestionNow", (c) => c.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: f.questionId })],
      ["getPreEventSummary", (c) => c.query(api.fairPreEvent.getPreEventSummary, { eventId: f.eventId })],
      // The real run with the right slug: only requireAdmin stands between a caller and the delete.
      ["resetPreEventData", (c) => c.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, dryRun: false, confirmSlug: EM })],
      ["setSponsoredResultQuestion", (c) => c.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.modelId, questionId: null })],
      ["upsertSurveyDraft", (c) => c.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.modelId, questions: [{ id: "q", prompt: "TEST?", kind: "yes_no", options: [], required: false, order: 1 }] })],
      ["publishSurvey", (c) => c.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId: f.surveyId })],
      ["retireSurvey", (c) => c.mutation(api.fairInteractionsAdmin.retireSurvey, { surveyId: f.surveyId })],
      ["upsertPassport", (c) => c.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId: f.eventId, brandId: f.brandId })],
      ["publishPassport", (c) => c.mutation(api.fairInteractionsAdmin.publishPassport, { passportId: f.passportId })],
      ["withdrawPassport", (c) => c.mutation(api.fairInteractionsAdmin.withdrawPassport, { passportId: f.passportId })],
      ["removePassportModel", (c) => c.mutation(api.fairInteractionsAdmin.removePassportModel, { passportId: f.passportId, eventModelId: f.modelId })],
      ["getEventInteractions", (c) => c.query(api.fairInteractionsAdmin.getEventInteractions, { eventId: f.eventId })],
      ["getModelInteractionSummary", (c) => c.query(api.fairInteractionsAdmin.getModelInteractionSummary, { eventModelId: f.modelId })],
      ["getEventConsents", (c) => c.query(api.fairLeadsAdmin.getEventConsents, { eventId: f.eventId })],
      ["saveConsentDraft", (c) => c.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: "TEST {izlagac}" })],
      ["activateConsent", (c) => c.mutation(api.fairLeadsAdmin.activateConsent, { consentId: extra.consentId })],
      ["retireConsent", (c) => c.mutation(api.fairLeadsAdmin.retireConsent, { consentId: extra.consentId })],
      ["getModelLeadSettings", (c) => c.query(api.fairLeadsAdmin.getModelLeadSettings, { eventModelId: f.modelId })],
      ["upsertLeadConfig", (c) => c.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.modelId, leadKind: "interest", contactRequirement: "email", enabled: true })],
      ["upsertFollowUpTemplate", (c) => c.mutation(api.fairLeadsAdmin.upsertFollowUpTemplate, { eventModelId: f.modelId, subject: "TEST", plainText: "TEST" })],
      ["exportLeads", (c) => c.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.participationId, paginationOpts: { numItems: 10, cursor: null } })],
      ["setFollowUpSuppressed", (c) => c.mutation(api.fairLeadsAdmin.setFollowUpSuppressed, { leadId: extra.leadId, suppressed: true })],
      ["retryEmailDelivery", (c) => c.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: extra.deliveryId })],
      ["publishSponsoredSnapshot", (c) => c.mutation(api.fairSponsoredAdmin.publishSponsoredSnapshot, { eventId: f.eventId })],
      ["getSponsoredRotationAdmin", (c) => c.query(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId: f.eventId })],
      ["setSponsoredAutoPublish", (c) => c.mutation(api.fairSponsoredAdmin.setSponsoredAutoPublish, { eventId: f.eventId, enabled: false })],
      ["getSponsoredQuestionVotes", (c) => c.query(api.fairSponsoredAdmin.getSponsoredQuestionVotes, { eventId: f.eventId })],
      ["listReportRuns", (c) => c.query(api.fairReports.listReportRuns, { eventId: f.eventId })],
      ["getReportRun", (c) => c.query(api.fairReports.getReportRun, { reportRunId: extra.reportRunId })],
      ["requestReportBuild", (c) => c.mutation(api.fairReports.requestReportBuild, { eventDayId: f.dayId, participationId: f.participationId, format: "csv" })],
      ["approveReportRun", (c) => c.mutation(api.fairReports.approveReportRun, { reportRunId: extra.reportRunId })],
      ["sendReportRun", (c) => c.mutation(api.fairReports.sendReportRun, { reportRunId: extra.reportRunId })],
      ["resendReportRun", (c) => c.mutation(api.fairReports.resendReportRun, { reportRunId: extra.reportRunId })],
      ["retryReportRun", (c) => c.mutation(api.fairReports.retryReportRun, { reportRunId: extra.reportRunId })],
      ["createReportCorrection", (c) => c.mutation(api.fairReports.createReportCorrection, { reportRunId: extra.reportRunId })],
      ["downloadReportRun", (c) => c.action(api.fairReports.downloadReportRun, { reportRunId: extra.reportRunId, format: "csv" })],
      ["exportLeadsFile", (c) => c.action(api.fairReports.exportLeadsFile, { eventId: f.eventId, participationId: f.participationId, format: "csv" })],
      ["exportOrganizerAggregate", (c) => c.action(api.fairReports.exportOrganizerAggregate, { eventId: f.eventId, format: "csv" })],
      ["getRetentionOverview", (c) => c.query(api.fairRetention.getRetentionOverview, {})],
      ["startPurgeDryRun", (c) => c.mutation(api.fairRetention.startPurgeDryRun, {})],
      ["getLeadCounts", (c) => c.query(api.fairAdminStats.getLeadCounts, { eventId: f.eventId })],
      ["getModelQrCodes", (c) => c.query(api.fairAdminStats.getModelQrCodes, { eventId: f.eventId })],
      ["getQrDetail", (c) => c.query(api.fairAdminQr.getQrDetail, { eventId: f.eventId, code: "ZZZZZZZZ" })],
      ["getQrScanStats", (c) => c.query(api.fairAdminQr.getQrScanStats, { eventId: f.eventId, cardIds: [] })],
      ["reassignQr", (c) => c.mutation(api.fairAdminQr.reassignQr, { eventId: f.eventId, code: "ZZZZZZZZ", toEventModelId: f.modelId, reason: "TEST razlog" })],
      ["bulkAssignQrDryRun", (c) => c.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.eventId, rows: [{ code: "ZZZZZZZZ", model: "test-em26-volta-x1" }] })],
      ["bulkAssignQrCommit", (c) => c.mutation(api.fairAdminQr.bulkAssignQrCommit, { eventId: f.eventId, rows: [{ code: "ZZZZZZZZ", model: "test-em26-volta-x1" }] })],
      ["linkSticker", (c) => c.mutation(api.fairAdminQr.linkSticker, { eventId: f.eventId, code: f.seed.qr[0].resolverCode, eventModelId: f.modelId, expectedHolderModelId: null, replaceModelSticker: true })],
      ["undoLink", (c) => c.mutation(api.fairAdminQr.undoLink, { assignmentId: extra.assignmentId })],
      ["listRecentLinks", (c) => c.query(api.fairAdminQr.listRecentLinks, { eventId: f.eventId, now: REHEARSAL })],
      ["getPassportOverview", (c) => c.query(api.fairPassports.getPassportOverview, { eventId: f.eventId })],
      ["refreshPassports", (c) => c.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })],
      ["setPassportHidden", (c) => c.mutation(api.fairPassports.setPassportHidden, { passportId: f.passportId, hidden: true })],
      ["getEventLeadForms", (c) => c.query(api.fairLeadsAdmin.getEventLeadForms, { eventId: f.eventId })],
      ["upsertParticipationLeadDefault", (c) => c.mutation(api.fairLeadsAdmin.upsertParticipationLeadDefault, { participationId: f.participationId, leadKind: "interest", enabled: true, contactRequirement: "one_of" })],
      ["applyLeadDefaultsToModels", (c) => c.mutation(api.fairLeadsAdmin.applyLeadDefaultsToModels, { participationId: f.participationId })],
      ["clearLeadOverride", (c) => c.mutation(api.fairLeadsAdmin.clearLeadOverride, { eventModelId: f.modelId, leadKind: "interest" })],
      ["getLeadSwitches", (c) => c.query(api.fairLeadsAdmin.getLeadSwitches, {})],
      ["listEventLeads", (c) => c.query(api.fairLeadsInbox.listEventLeads, { eventId: f.eventId, paginationOpts: { numItems: 10, cursor: null } })],
      ["getLeadDetail", (c) => c.query(api.fairLeadsInbox.getLeadDetail, { leadId: extra.leadId })],
      ["markLeadsDelivered", (c) => c.mutation(api.fairLeadsInbox.markLeadsDelivered, { eventId: f.eventId, leadIds: [extra.leadId] })],
      ["getExhibitorFollowUps", (c) => c.query(api.fairFollowUps.getExhibitorFollowUps, { eventId: f.eventId })],
      ["saveExhibitorFollowUpDraft", (c) => c.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.participationId, subject: "TEST {ime}", plainText: "TEST" })],
      ["activateExhibitorFollowUp", (c) => c.mutation(api.fairFollowUps.activateExhibitorFollowUp, { templateId: extra.followUpDraftId })],
      ["retireExhibitorFollowUp", (c) => c.mutation(api.fairFollowUps.retireExhibitorFollowUp, { templateId: extra.followUpActiveId })],
      ["previewExhibitorFollowUp", (c) => c.query(api.fairFollowUps.previewExhibitorFollowUp, { participationId: f.participationId, leadId: extra.leadId })],
      ["estimateFollowUps", (c) => c.query(api.fairFollowUps.estimateFollowUps, { eventId: f.eventId })],
      ["getEventDashboard", (c) => c.query(api.fairDashboard.getEventDashboard, { eventId: f.eventId, at: REHEARSAL })],
    ];
    const adminFunctions = ["fairInteractionsAdmin", "fairLeadsAdmin", "fairSponsoredAdmin", "fairReports", "fairRetention", "fairAdminStats", "fairAdminQr", "fairPassports", "fairLeadsInbox", "fairFollowUps", "fairDashboard", "fairPreEvent"].flatMap((name) =>
      Object.entries(AUTHZ[name].functions).filter(([, access]) => access === "admin").map(([fn]) => fn),
    );
    expect(calls.map(([name]) => name).sort()).toEqual(adminFunctions.sort());

    const before = await f.t.run(async (ctx) => JSON.stringify([
      await ctx.db.query("fairAudienceQuestions").collect(), await ctx.db.query("fairSurveys").collect(), await ctx.db.query("fairPassportConfigs").collect(),
      await ctx.db.query("fairConsentConfigs").collect(), await ctx.db.query("fairLeads").collect(), await ctx.db.query("fairEmailDeliveries").collect(),
      await ctx.db.query("fairReportRuns").collect(), await ctx.db.query("fairSponsoredSnapshots").collect(), await ctx.db.query("fairPurgeRuns").collect(),
      await ctx.db.query("fairQrAssignments").collect(), await ctx.db.query("fairPassportEligibleModels").collect(), await ctx.db.query("fairLeadConfigs").collect(),
      await ctx.db.query("fairParticipationLeadDefaults").collect(), await ctx.db.query("fairExhibitorFollowUpTemplates").collect(),
    ]));
    for (const [name, call] of calls) {
      const callers: [Caller, string][] = [[f.t, "Niste prijavljeni."], [f.member, "Nemate administratorski pristup."]];
      for (const [caller, expected] of callers) {
        let error: unknown = null;
        try {
          await call(caller);
        } catch (thrown) {
          error = thrown;
        }
        expect({ name, refused: error !== null && message(error).includes(expected) }).toEqual({ name, refused: true });
      }
    }
    const after = await f.t.run(async (ctx) => JSON.stringify([
      await ctx.db.query("fairAudienceQuestions").collect(), await ctx.db.query("fairSurveys").collect(), await ctx.db.query("fairPassportConfigs").collect(),
      await ctx.db.query("fairConsentConfigs").collect(), await ctx.db.query("fairLeads").collect(), await ctx.db.query("fairEmailDeliveries").collect(),
      await ctx.db.query("fairReportRuns").collect(), await ctx.db.query("fairSponsoredSnapshots").collect(), await ctx.db.query("fairPurgeRuns").collect(),
      await ctx.db.query("fairQrAssignments").collect(), await ctx.db.query("fairPassportEligibleModels").collect(), await ctx.db.query("fairLeadConfigs").collect(),
      await ctx.db.query("fairParticipationLeadDefaults").collect(), await ctx.db.query("fairExhibitorFollowUpTemplates").collect(),
    ]));
    expect(after).toBe(before);
  });

  test("no public or visitor function returns PII, an identifier of another visitor, exhibitor delivery data, QR codes or rating aggregates", async () => {
    const f = await setup();
    vi.setSystemTime(REHEARSAL);
    const me = fairVisitorHash(generateFairVisitorToken(), SECRET);
    const qr = f.seed.qr.find((row) => row.modelExternalKey === "test-em26-volta-x1")!;
    const voltaX2 = f.seed.qr.find((row) => row.modelExternalKey === "test-em26-volta-x2")!;
    const { consentId } = await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: "TEST saglasnost: ScanMe i {izlagac}." });
    await f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...TEST_LEGAL_APPROVAL });
    const name = "TEST Posetilac Authz", email = "posetilac.authz@example.invalid", phone = "+381 60 000 0077";

    const outputs: unknown[] = [];
    outputs.push(await f.t.mutation(api.cards.resolveAndRecord, { cardCode: qr.resolverCode, requestId: "test-authz-scan-1", deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: me }));
    outputs.push(await f.t.mutation(api.cards.resolveAndRecord, { cardCode: voltaX2.resolverCode, requestId: "test-authz-scan-2", deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: me }));
    outputs.push(await f.t.mutation(api.fairLeads.submitLead, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelId: f.modelId, kind: "interest", submissionId: "test-authz-lead-1", contactName: name, email, phone, consentAccepted: true, consentVersion: 1 }));
    outputs.push(await f.t.mutation(api.fairLeads.submitLead, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelId: f.modelId, kind: "interest", submissionId: "test-authz-lead-1", contactName: name, email, phone, consentAccepted: true, consentVersion: 1 }));
    outputs.push(await f.t.mutation(api.fairInteractions.upsertRating, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelId: f.modelId, appearance: 5 }));
    outputs.push(await f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, questionId: f.questionId, optionId: "test-da" }));
    outputs.push(await f.t.mutation(api.fairInteractions.submitSurvey, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, surveyId: f.surveyId, submissionId: "test-authz-survey", answers: [{ questionId: "test-preporuka", value: "no" }] }));
    outputs.push(await f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, passportId: f.passportId, eventModelId: f.modelId }));
    outputs.push(await f.t.mutation(api.fairInteractions.recordSponsoredAction, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelId: f.modelId, surface: "garage", kind: "garage_add", requestId: "test-authz-sponsored" }));
    outputs.push(await f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelId: f.modelId }));
    outputs.push(await f.t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventSlug: EM }));
    const shareCodeHash = "5".repeat(64);
    outputs.push(await f.t.mutation(api.fairSharing.createShareCollection, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelIds: [f.modelId], codeHash: shareCodeHash, requestId: "test-authz-share" }));
    outputs.push(await f.t.mutation(api.fairSharing.recordTraffic, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, kind: "direct_view", requestId: "test-authz-traffic", eventModelId: f.modelId }));
    outputs.push(await f.t.query(api.fairSharing.getShareCollectionByCodeHash, { codeHash: shareCodeHash, now: Date.now() }));
    const [, , eventSlug, , modelSlug] = qr.path.split("/");
    outputs.push(await f.t.query(api.fairPublic.getEventBySlug, { slug: EM }));
    outputs.push(await f.t.query(api.fairPublic.getModelBySlug, { eventSlug, modelSlug }));
    outputs.push(await f.t.query(api.fairPublic.getEventMap, { eventSlug: EM }));
    outputs.push(await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.modelId }));
    outputs.push(await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: f.questionId }));
    outputs.push(await f.t.query(api.fairPublic.getSurveyForModel, { eventModelId: f.modelId }));
    outputs.push(await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: EM }));
    outputs.push(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.modelId, kind: "interest" }));
    outputs.push(await f.t.query(api.fairPublic.getSponsoredMapRotation, { eventSlug: EM }));
    outputs.push(await f.t.query(api.fairPublic.getSponsoredGarageRotation, { eventSlug: EM }));
    const allIds = await f.t.run(async (ctx) => (await ctx.db.query("fairEventModels").collect()).map((row) => row._id as string));
    outputs.push(await f.t.query(api.fairPublic.getModelsByIds, { ids: allIds.slice(0, 50) }));

    const text = JSON.stringify(outputs);
    const visitorRow = await f.t.run(async (ctx) => (await ctx.db.query("fairVisitors").withIndex("by_visitorHash", (q) => q.eq("visitorHash", me)).unique())!);
    const lead = await f.t.run(async (ctx) => (await ctx.db.query("fairLeads").collect())[0]);
    const secrets = [
      // The rendered consent text itself is public (getLeadForm shows it); the per-person snapshot is checked by key below.
      name, email, phone, me, visitorRow._id as string, lead._id as string, "izvestaji-a@example.invalid", "TEST napomena o predaji",
      ...f.seed.qr.map((row) => row.resolverCode), "SMK-TEST", "SML-TEST", "@example.invalid",
    ];
    for (const secret of secrets) expect({ secret, leaked: text.includes(secret) }).toEqual({ secret, leaked: false });
    expect(text).not.toMatch(/"(sum|average|ratingCount|ratingSum|count|totalVotes|packageTier|reportRecipientEmail|leadDeliveryNote|recipient|visitorId|visitorHash|consentTextSnapshot|consentedAt|contactName)"\s*:/);
  });
});
