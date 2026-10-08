import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { eventValidationIssues, loadEventCatalog } from "./fairAdmin";
import { requireAdmin } from "./lib/access";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import { fairScanCountKey, readFairCount } from "./lib/fairCountShards";
import { buildFairDashboard, fairDashboardResult, type FairDashboardFacts } from "./lib/fairDashboardRules";
import { PASSPORTS_PER_EVENT_CAP } from "./lib/fairInteractions";
import { fairActiveConsent, fairFollowUpAt, fairFollowUpEnabled, fairLeadsEnabled } from "./lib/fairLeads";
import { fairPassportFreezesAt } from "./lib/fairPassportSync";
import { fairTimeKeys } from "./lib/fairScans";
import { fairActiveSponsoredSnapshot, fairSponsoredAutoPublishOn, fairSponsoredItems } from "./lib/fairSponsored";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { FAIR_ADMIN_LIST_LIMIT } from "../lib/fair-contract";
import { fairAnalyticsCutoff, fairDayCountFrom } from "./lib/fairPreEvent";

// =============================================================================
// Admin UX A10 — `Događaji → Pregled`: ONE admin query for the event
// dashboard (phase, „Šta treba da uradim“, KPI row, section cards) and the
// urgency badges of the section navigation. Only numbers, rules and links —
// no contact, visitor or other PII, no text (lib/i18n builds it). The rules
// are pure in convex/lib/fairDashboardRules.ts.
//
// Every read is an indexed range of THIS event, bounded (the catalog loader of
// getEventCatalog, then per table / per fair day / per stand); there is no
// read per model. The time comes in as `at` (a query never reads the clock).
// It reads the scan counters (fairMetricCountShards), which change with every
// scan, so the admin calls it once and refreshes it on a 60 s poll (A0 nalaz
// 0.5), never through a reactive subscription.
// =============================================================================

/** Questions read per fair day and status (published, closed); above it the coverage is partial. */
const QUESTIONS_PER_DAY_CAP = 1000;
/** Fair days whose questions and report runs are read (an event has 3). */
const DAYS_CAP = 60;
/** Leads read for the counts (newest first); above it the numbers are partial (`capped`). */
export const FAIR_DASHBOARD_LEADS_CAP = 2000;
/** Report runs read per closed day (as fairReports.listReportRuns). */
const RUNS_PER_DAY_CAP = 300;
/** Stands whose scan counters are summed (4 counter keys each). */
export const FAIR_DASHBOARD_STANDS_CAP = 100;
/** Cards of the QR inventory counted for „dodeljeni / ukupno“. */
const INVENTORY_CAP = 1000;
/** Withdrawn models checked for a frozen passport that still requires them. */
const WITHDRAWN_CHECK_CAP = 25;

async function sumCounts(ctx: QueryCtx, keys: string[]) {
  let total = 0;
  for (const key of keys) total += await readFairCount(ctx, key);
  return total;
}

async function loadFacts(ctx: QueryCtx, event: Doc<"fairEvents">, at: number): Promise<FairDashboardFacts> {
  const catalog = await loadEventCatalog(ctx, event._id);
  const issues = new Map(eventValidationIssues(event, catalog).map((row) => [row.eventModelId, row.issues]));
  const assigned = new Set(catalog.assignments.map((row) => row.eventModelId));
  const days = [...catalog.days].sort((a, b) => a.startsAt - b.startsAt);
  const { dateKey: todayKey, hourKey } = fairTimeKeys(at);
  const todayStartsAt = belgradeLocalToEpoch(`${todayKey}T00:00`) ?? at;

  // Glas publike: the published and closed questions of every fair day.
  const questions: FairDashboardFacts["questions"] = [];
  let questionsCapped = days.length > DAYS_CAP;
  for (const day of days.slice(0, DAYS_CAP)) {
    for (const status of ["published", "closed"] as const) {
      const rows = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventDayId_and_status", (q) => q.eq("eventDayId", day._id).eq("status", status))
        .take(QUESTIONS_PER_DAY_CAP + 1);
      if (rows.length > QUESTIONS_PER_DAY_CAP) questionsCapped = true;
      for (const row of rows.slice(0, QUESTIONS_PER_DAY_CAP)) {
        questions.push({ id: row._id, modelId: row.eventModelId, dayId: row.eventDayId, showOnSponsoredRotation: row.showOnSponsoredRotation });
      }
    }
  }

  // Leads: counts only (newest first, bounded), pre-event leads left out (JOVAN-DELTA 2026-10-08b).
  const leadRows = await ctx.db
    .query("fairLeads")
    .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).gte("createdAt", fairAnalyticsCutoff(event)))
    // Admin-session test leads left out too (JOVAN-DELTA 2026-10-09).
    .filter((q) => q.neq(q.field("isAdminExcluded"), true))
    .order("desc")
    .take(FAIR_DASHBOARD_LEADS_CAP + 1);
  const leadsCapped = leadRows.length > FAIR_DASHBOARD_LEADS_CAP;
  const leads = leadRows.slice(0, FAIR_DASHBOARD_LEADS_CAP);

  const [interestConsent, testDriveConsent] = await Promise.all([fairActiveConsent(ctx, event._id, "interest"), fairActiveConsent(ctx, event._id, "test_drive")]);
  const formDefaults = await ctx.db
    .query("fairParticipationLeadDefaults")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .take(FAIR_ADMIN_LIST_LIMIT * 2);
  const followUps = await ctx.db
    .query("fairExhibitorFollowUpTemplates")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", "active"))
    .take(FAIR_ADMIN_LIST_LIMIT);

  // Brand passports, and the frozen ones that still require a withdrawn car (MASTER §11).
  const passports = await ctx.db
    .query("fairPassportConfigs")
    .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", event._id))
    .take(PASSPORTS_PER_EVENT_CAP);
  const passportById = new Map<Id<"fairPassportConfigs">, Doc<"fairPassportConfigs">>(passports.map((row) => [row._id, row]));
  const blocked = new Set<Id<"fairPassportConfigs">>();
  for (const model of catalog.models.filter((row) => row.status === "withdrawn").slice(0, WITHDRAWN_CHECK_CAP)) {
    const members = await ctx.db.query("fairPassportEligibleModels").withIndex("by_eventModelId", (q) => q.eq("eventModelId", model._id)).take(PASSPORTS_PER_EVENT_CAP);
    for (const member of members) {
      const passport = passportById.get(member.passportConfigId);
      if (member.status === "required" && passport?.status === "published" && fairPassportFreezesAt(passport, event) <= at) blocked.add(passport._id);
    }
  }

  const snapshot = await fairActiveSponsoredSnapshot(ctx, event._id);
  const sponsoredItems = snapshot
    ? (await fairSponsoredItems(ctx, snapshot._id)).map((item) => ({ modelId: item.eventModelId as string, questionId: (item.audienceQuestionId as string | undefined) ?? null }))
    : null;

  // Daily reports: the newest run of every closed day × exhibitor.
  const reports: FairDashboardFacts["reports"] = [];
  for (const day of days.filter((row) => row.endsAt <= at).slice(0, DAYS_CAP)) {
    const runs = await ctx.db
      .query("fairReportRuns")
      .withIndex("by_eventDayId_and_participationId", (q) => q.eq("eventDayId", day._id))
      .take(RUNS_PER_DAY_CAP);
    const newest = new Map<string, Doc<"fairReportRuns">>();
    for (const run of runs) {
      const current = newest.get(run.participationId);
      if (!current || run.createdAt > current.createdAt) newest.set(run.participationId, run);
    }
    for (const run of newest.values()) reports.push({ dayId: day._id, participationId: run.participationId, status: run.status });
  }

  // Fair scans (admin scans excluded): the fair days' and today's stand
  // counters from the analytics cutoff on, so pre-event scans never count
  // (JOVAN-DELTA 2026-10-08b).
  const stands = catalog.stands.slice(0, FAIR_DASHBOARD_STANDS_CAP);
  const cutoff = fairAnalyticsCutoff(event);
  const fairDays = days.slice(0, DAYS_CAP);
  const today = fairDays.find((day) => day.dateKey === todayKey);
  const standSum = async (metric: "scan_total" | "scan_unique", only?: (typeof fairDays)[number]) => {
    let total = 0;
    for (const stand of stands) {
      for (const day of only ? [only] : fairDays) total += await fairDayCountFrom(ctx, fairScanCountKey(metric, "stand", stand._id), day, cutoff);
    }
    return total;
  };
  const scans = {
    total: await standSum("scan_total"),
    today: today ? await standSum("scan_total", today) : await sumCounts(ctx, stands.map((stand) => fairScanCountKey("scan_total", "stand", stand._id, todayKey))),
    uniqueTotal: await standSum("scan_unique"),
    uniqueToday: today ? await standSum("scan_unique", today) : await sumCounts(ctx, stands.map((stand) => fairScanCountKey("scan_unique", "stand", stand._id, todayKey))),
    capped: catalog.stands.length > FAIR_DASHBOARD_STANDS_CAP,
  };

  let inventory: FairDashboardFacts["inventory"] = { total: null, capped: false };
  if (event.qrInventoryBusinessId) {
    const businessId = event.qrInventoryBusinessId;
    const cards = await ctx.db.query("cards").withIndex("by_businessId", (q) => q.eq("businessId", businessId)).take(INVENTORY_CAP + 1);
    inventory = { total: Math.min(cards.length, INVENTORY_CAP), capped: cards.length > INVENTORY_CAP };
  }

  return {
    at,
    belgradeHour: Number(hourKey.slice(11, 13)),
    event: {
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      piiPurgeAt: event.piiPurgeAt,
      qrInventoryConfigured: Boolean(event.qrInventoryBusinessId),
      sponsoredAutoPublish: fairSponsoredAutoPublishOn(event),
      followUpAt: fairFollowUpAt(event.endsAt),
    },
    days: days.map((day) => ({ id: day._id, dateKey: day.dateKey, label: day.label, startsAt: day.startsAt, endsAt: day.endsAt })),
    participations: catalog.participations.map((row) => ({ id: row._id, status: row.status })),
    models: catalog.models.map((model) => {
      const modelIssues = issues.get(model._id) ?? [];
      return {
        id: model._id,
        participationId: model.participationId,
        brandId: model.brandId,
        status: model.status,
        packageTier: model.packageTier,
        packageActivatedAt: model.packageActivatedAt,
        passportEligible: model.passportEligible,
        hasPhoto: Boolean(model.photoUrl || model.photoStorageId),
        hasActiveQr: assigned.has(model._id),
        errors: modelIssues.filter((issue) => issue.severity === "error").length,
        priceMissing: modelIssues.some((issue) => issue.code === "FAIR_PRICE_MISSING"),
      };
    }),
    assignments: catalog.assignments.length,
    inventory,
    questions,
    questionsCapped,
    consents: { interest: interestConsent !== null, test_drive: testDriveConsent !== null },
    formDefaults: formDefaults.map((row) => ({ participationId: row.participationId, leadKind: row.leadKind, enabled: row.enabled })),
    switches: { leadsEnabled: fairLeadsEnabled(), followUpEnabled: fairFollowUpEnabled() },
    leads: {
      total: leads.length,
      undelivered: leads.filter((lead) => lead.status !== "delivered").length,
      newToday: leads.filter((lead) => lead.createdAt >= todayStartsAt && lead.createdAt <= at).length,
      capped: leadsCapped,
      participationIds: [...new Set(leads.map((lead) => lead.participationId as string))],
    },
    followUpActive: followUps.map((row) => row.participationId),
    passports: passports.map((row) => ({ brandId: row.brandId, status: row.status, hidden: row.hiddenAt !== undefined, freezesAt: fairPassportFreezesAt(row, event) })),
    blockedPassports: blocked.size,
    sponsoredItems,
    reports,
    scans,
  };
}

/**
 * The event dashboard at `at` (epoch ms, the admin rounds it to the minute):
 * phase, the sorted action items, the KPI row and the section cards.
 */
export const getEventDashboard = query({
  args: { eventId: v.id("fairEvents"), at: v.number() },
  returns: fairDashboardResult,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isFinite(args.at) || args.at <= 0) fairAdminError("INVALID_INPUT", { field: "at" });
    const event = await requireFairEvent(ctx, args.eventId);
    return buildFairDashboard(await loadFacts(ctx, event, args.at));
  },
});
