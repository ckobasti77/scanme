import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { fairHeatCap, fairHeatLevel } from "../lib/fair-heat";
import { loadEventCatalog } from "./fairAdmin";
import { requireAdmin } from "./lib/access";
import { requireFairEvent } from "./lib/fairCatalog";
import { fairScanCountKey, readFairCount, type FairScanMetric } from "./lib/fairCountShards";
import { fairHeatWindow, fairStandWindowCounts } from "./lib/fairHeat";
import { fairAudienceOptionCounts, fairModelSurveys, fairRatingSummary } from "./lib/fairInteractions";
import { fairExhibitorName } from "./lib/fairLeads";
import { fairAnalyticsCutoff, fairDayCountFrom } from "./lib/fairPreEvent";
import { fairTimeKeys } from "./lib/fairScans";

// =============================================================================
// SAJAM SUPER Korak 4 — `Događaji → Analitika` (admin only).
//
// Two reads, both polled by the admin (button + every 60 s while visible),
// never a live subscription (A0 nalaz 0.5):
//   getEventAnalytics — the counters: KPIs, scans per day and per hour from
//     08:00, the model and stand ranking, the heat of every map location
//     (the same scale as the public map, with the exact counts and share);
//   getEventAudience  — the raw rows: unique VISITORS (not pairs), visitors
//     per model and per stand, devices, stamps and completed passports.
// Every number starts at the event's analytics cutoff (9. 10. 08:00 for
// Elektromobilnost): pre-event and admin rows never count (B2, JOVAN-DELTA
// 2026-10-08b / 2026-10-09). Definitions (Korak 5):
//   scans          = every fair scan (scan_total)
//   uniquePerModel = one per visitor AND model (scan_unique = fairUniqueScans rows)
//   visitors       = distinct visitors (one person scanning three cars = 1)
// The time comes in as `at`; nothing here returns a visitor id or contact.
// =============================================================================

const MODELS_CAP = 150;
const LEADS_CAP = 3000;
const SURVEY_ROWS_CAP = 2000;
const SHARES_CAP = 2000;
const QUESTIONS_PER_MODEL_CAP = 30;
const UNIQUE_ROWS_CAP = 5000;
const DEVICE_SAMPLE_CAP = 1500;
const STAMPS_CAP = 2500;
const PASSPORTS_CAP = 50;
const HOUR_MS = 3_600_000;
/** The hour series starts at the hall's opening hour. */
export const FAIR_ANALYTICS_FIRST_HOUR = 8;

const count2 = v.object({ today: v.number(), total: v.number() });
const heatRow = v.object({ locationId: v.string(), count: v.number(), share: v.number(), level: v.number() });

type Day = { dateKey: string; label: string; startsAt: number; endsAt: number };

function exhibited(models: Doc<"fairEventModels">[]) {
  return models.filter((model) => model.status !== "draft").slice(0, MODELS_CAP);
}

async function brandNames(ctx: QueryCtx, models: Doc<"fairEventModels">[]) {
  const names = new Map<string, string>();
  for (const brandId of new Set(models.map((model) => model.brandId))) {
    const brand = await ctx.db.get(brandId);
    names.set(brandId, brand?.name ?? "");
  }
  return names;
}

export const getEventAnalytics = query({
  args: { eventId: v.id("fairEvents"), at: v.number() },
  returns: v.object({
    at: v.number(),
    cutoff: v.number(),
    todayKey: v.string(),
    capped: v.boolean(),
    kpis: v.object({
      scans: count2,
      uniquePerModel: count2,
      leads: v.object({ today: v.number(), total: v.number(), interest: v.number(), testDrive: v.number(), capped: v.boolean() }),
      audienceVotes: v.number(),
      surveys: v.object({ total: v.number(), capped: v.boolean() }),
      shares: v.object({ total: v.number(), capped: v.boolean() }),
    }),
    days: v.array(v.object({ dateKey: v.string(), label: v.string(), scans: v.number(), uniquePerModel: v.number() })),
    hours: v.array(v.object({ dateKey: v.string(), hour: v.number(), scans: v.number(), uniquePerModel: v.number() })),
    models: v.array(
      v.object({
        eventModelId: v.id("fairEventModels"),
        name: v.string(),
        brandName: v.string(),
        exhibitorName: v.string(),
        standCode: v.string(),
        mapLocationId: v.string(),
        tier: v.string(),
        scans: count2,
        uniquePerModel: count2,
        leads: v.number(),
        votes: v.number(),
        rating: v.union(v.null(), v.object({ average: v.number(), count: v.number() })),
      }),
    ),
    heat: v.object({ today: v.array(heatRow), hour: v.array(heatRow) }),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const catalog = await loadEventCatalog(ctx, event._id);
    const cutoff = fairAnalyticsCutoff(event);
    const window = fairHeatWindow(event, args.at);
    const todayKey = window.today.dateKey;
    const days: Day[] = [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder || a.dateKey.localeCompare(b.dateKey));
    const allModels = catalog.models.filter((model) => model.status !== "draft");
    const models = exhibited(catalog.models);
    const standById = new Map(catalog.stands.map((stand) => [stand._id as string, stand]));
    const brands = await brandNames(ctx, models);
    const exhibitors = new Map<string, string>();
    for (const participationId of new Set(models.map((model) => model.participationId))) {
      exhibitors.set(participationId, (await fairExhibitorName(ctx, participationId)) ?? "");
    }

    // Per model and fair day, from the cutoff; "today" is one of those days
    // (or the calendar day when the fair is not on).
    const todayIsFairDay = days.some((day) => day.dateKey === todayKey);
    const perModel = async (metric: FairScanMetric, model: Doc<"fairEventModels">) => {
      const base = fairScanCountKey(metric, "model", model._id);
      const byDay: number[] = [];
      for (const day of days) byDay.push(await fairDayCountFrom(ctx, base, day, cutoff));
      const today = todayIsFairDay ? byDay[days.findIndex((day) => day.dateKey === todayKey)] : await fairDayCountFrom(ctx, base, window.today, cutoff);
      return { byDay, today, total: byDay.reduce((sum, value) => sum + value, 0) };
    };

    // Leads (counted only), Glas publike, ratings, surveys.
    const leadRows = await ctx.db
      .query("fairLeads")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).gte("createdAt", cutoff))
      .filter((q) => q.neq(q.field("isAdminExcluded"), true))
      .take(LEADS_CAP + 1);
    const leads = leadRows.slice(0, LEADS_CAP);
    const leadsByModel = new Map<string, number>();
    for (const lead of leads) leadsByModel.set(lead.eventModelId, (leadsByModel.get(lead.eventModelId) ?? 0) + 1);

    const modelRows = [];
    const dayScans = days.map(() => 0);
    const dayUnique = days.map(() => 0);
    let surveyTotal = 0;
    let surveysCapped = false;
    for (const model of models) {
      const scans = await perModel("scan_total", model);
      const unique = await perModel("scan_unique", model);
      scans.byDay.forEach((value, index) => (dayScans[index] += value));
      unique.byDay.forEach((value, index) => (dayUnique[index] += value));

      const questions = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id))
        .take(QUESTIONS_PER_MODEL_CAP);
      let votes = 0;
      for (const question of questions.filter((row) => row.status !== "draft")) {
        votes += (await fairAudienceOptionCounts(ctx, question)).counts.reduce((sum, value) => sum + value, 0);
      }

      const ratings = await fairRatingSummary(ctx, model._id);
      const ratingCount = ratings.reduce((sum, row) => sum + row.count, 0);
      const ratingSum = ratings.reduce((sum, row) => sum + row.sum, 0);

      for (const survey of await fairModelSurveys(ctx, model._id)) {
        if (surveyTotal >= SURVEY_ROWS_CAP) {
          surveysCapped = true;
          break;
        }
        const responses = await ctx.db
          .query("fairSurveyResponses")
          .withIndex("by_surveyId_and_submittedAt", (q) => q.eq("surveyId", survey._id).gte("submittedAt", cutoff))
          .filter((q) => q.neq(q.field("isAdminExcluded"), true))
          .take(SURVEY_ROWS_CAP - surveyTotal + 1);
        if (responses.length > SURVEY_ROWS_CAP - surveyTotal) surveysCapped = true;
        surveyTotal += Math.min(responses.length, SURVEY_ROWS_CAP - surveyTotal);
      }

      const stand = standById.get(model.standId);
      modelRows.push({
        eventModelId: model._id,
        name: model.variant ? `${model.displayName} ${model.variant}` : model.displayName,
        brandName: brands.get(model.brandId) ?? "",
        exhibitorName: exhibitors.get(model.participationId) ?? "",
        standCode: stand?.code ?? "",
        mapLocationId: stand?.mapLocationId ?? "",
        tier: model.packageTier,
        scans: { today: scans.today, total: scans.total },
        uniquePerModel: { today: unique.today, total: unique.total },
        leads: leadsByModel.get(model._id) ?? 0,
        votes,
        rating: ratingCount > 0 ? { average: Math.round((ratingSum / ratingCount) * 100) / 100, count: ratingCount } : null,
      });
    }

    // Hours from 08:00, per fair day, from the stands that hold a model.
    const scannedStands = [...new Set(models.map((model) => model.standId as string))]
      .map((id) => standById.get(id))
      .filter((stand): stand is Doc<"fairStands"> => stand !== undefined);
    const hours = [];
    for (const day of days) {
      const first = day.startsAt + FAIR_ANALYTICS_FIRST_HOUR * HOUR_MS;
      for (let start = Math.max(first, cutoff); start < day.endsAt && start <= args.at; start += HOUR_MS) {
        const { hourKey } = fairTimeKeys(start);
        let scans = 0;
        let unique = 0;
        for (const stand of scannedStands) {
          scans += await readFairCount(ctx, fairScanCountKey("scan_total", "stand", stand._id, hourKey));
          unique += await readFairCount(ctx, fairScanCountKey("scan_unique", "stand", stand._id, hourKey));
        }
        hours.push({ dateKey: day.dateKey, hour: Number(hourKey.slice(11, 13)), scans, uniquePerModel: unique });
      }
    }

    // Heat: the public map's measure (unique per stand) and scale, with the counts and the share.
    const heatToday = new Map<string, number>();
    const heatHour = new Map<string, number>();
    for (const stand of scannedStands.filter((row) => row.status === "active")) {
      const counts = await fairStandWindowCounts(ctx, "scan_unique", stand._id, window);
      heatToday.set(stand.mapLocationId, (heatToday.get(stand.mapLocationId) ?? 0) + counts.today);
      heatHour.set(stand.mapLocationId, (heatHour.get(stand.mapLocationId) ?? 0) + counts.hour);
    }
    const heatRows = (counts: Map<string, number>, period: "today" | "hour") => {
      const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
      const cap = fairHeatCap(counts.values(), period);
      return [...counts]
        .filter(([, value]) => value > 0)
        .map(([locationId, value]) => ({
          locationId,
          count: Math.round(value * 10) / 10,
          share: total > 0 ? Math.round((value / total) * 1000) / 1000 : 0,
          level: fairHeatLevel(value, cap),
        }))
        .sort((a, b) => b.count - a.count || a.locationId.localeCompare(b.locationId));
    };

    const shareRows = await ctx.db
      .query("fairShareCollections")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).gte("createdAt", cutoff))
      .filter((q) => q.neq(q.field("isAdminExcluded"), true))
      .take(SHARES_CAP + 1);
    const todayStart = window.today.startsAt;

    return {
      at: args.at,
      cutoff,
      todayKey,
      capped: allModels.length > MODELS_CAP,
      kpis: {
        scans: { today: modelRows.reduce((sum, row) => sum + row.scans.today, 0), total: modelRows.reduce((sum, row) => sum + row.scans.total, 0) },
        uniquePerModel: { today: modelRows.reduce((sum, row) => sum + row.uniquePerModel.today, 0), total: modelRows.reduce((sum, row) => sum + row.uniquePerModel.total, 0) },
        leads: {
          today: leads.filter((lead) => lead.createdAt >= todayStart).length,
          total: leads.length,
          interest: leads.filter((lead) => lead.kind === "interest").length,
          testDrive: leads.filter((lead) => lead.kind === "test_drive").length,
          capped: leadRows.length > LEADS_CAP,
        },
        audienceVotes: modelRows.reduce((sum, row) => sum + row.votes, 0),
        surveys: { total: surveyTotal, capped: surveysCapped },
        shares: { total: Math.min(shareRows.length, SHARES_CAP), capped: shareRows.length > SHARES_CAP },
      },
      days: days.map((day, index) => ({ dateKey: day.dateKey, label: day.label, scans: dayScans[index], uniquePerModel: dayUnique[index] })),
      hours,
      models: modelRows,
      heat: { today: heatRows(heatToday, "today"), hour: heatRows(heatHour, "hour") },
    };
  },
});

export const getEventAudience = query({
  args: { eventId: v.id("fairEvents"), at: v.number() },
  returns: v.object({
    visitors: v.object({ today: v.number(), total: v.number(), capped: v.boolean() }),
    models: v.array(v.object({ eventModelId: v.id("fairEventModels"), visitors: v.number() })),
    locations: v.array(v.object({ locationId: v.string(), visitors: v.number() })),
    devices: v.object({
      mobile: v.number(),
      tablet: v.number(),
      desktop: v.number(),
      unknown: v.number(),
      bots: v.number(),
      sample: v.number(),
      capped: v.boolean(),
    }),
    stamps: v.object({ total: v.number(), passportsCompleted: v.number(), capped: v.boolean() }),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const catalog = await loadEventCatalog(ctx, event._id);
    const cutoff = fairAnalyticsCutoff(event);
    const todayStart = fairHeatWindow(event, args.at).today.startsAt;
    const models = exhibited(catalog.models);
    const standById = new Map(catalog.stands.map((stand) => [stand._id as string, stand]));

    // Unique visitors from the unique rows (one per visitor and model, admin never has one).
    const everyone = new Set<string>();
    const today = new Set<string>();
    const byLocation = new Map<string, Set<string>>();
    const modelVisitors = [];
    let read = 0;
    let uniquesCapped = false;
    for (const model of models) {
      if (read >= UNIQUE_ROWS_CAP) {
        uniquesCapped = true;
        break;
      }
      const rows = await ctx.db
        .query("fairUniqueScans")
        .withIndex("by_eventModelId_and_firstScannedAt", (q) => q.eq("eventModelId", model._id).gte("firstScannedAt", cutoff))
        .take(UNIQUE_ROWS_CAP - read + 1);
      if (rows.length > UNIQUE_ROWS_CAP - read) uniquesCapped = true;
      const counted = rows.slice(0, UNIQUE_ROWS_CAP - read);
      read += counted.length;
      const locationId = standById.get(model.standId)?.mapLocationId ?? "";
      const atLocation = byLocation.get(locationId) ?? new Set<string>();
      for (const row of counted) {
        everyone.add(row.visitorId);
        atLocation.add(row.visitorId);
        if (row.lastScannedAt >= todayStart) today.add(row.visitorId);
      }
      byLocation.set(locationId, atLocation);
      modelVisitors.push({ eventModelId: model._id, visitors: counted.length });
    }

    // Devices of the newest fair scans (admin scans left out), from the generic scan row of the same request.
    const scans = await ctx.db
      .query("fairScanEvents")
      .withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).gte("occurredAt", cutoff))
      .order("desc")
      .filter((q) => q.neq(q.field("isAdminExcluded"), true))
      .take(DEVICE_SAMPLE_CAP + 1);
    const devices = { mobile: 0, tablet: 0, desktop: 0, unknown: 0, bots: 0 };
    for (const scan of scans.slice(0, DEVICE_SAMPLE_CAP)) {
      const generic = await ctx.db
        .query("cardScanEvents")
        .withIndex("by_requestId", (q) => q.eq("requestId", scan.requestId))
        .first();
      const category = generic?.deviceCategory ?? "unknown";
      if (category === "bot") devices.bots += 1;
      else devices[category] += 1;
    }

    // Stamps and completed brand passports.
    const stamps = await ctx.db
      .query("fairPassportStamps")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", cutoff))
      .filter((q) => q.and(q.eq(q.field("eventId"), event._id), q.neq(q.field("isAdminExcluded"), true)))
      .take(STAMPS_CAP + 1);
    const counted = stamps.slice(0, STAMPS_CAP);
    const passports = await ctx.db
      .query("fairPassportConfigs")
      .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", event._id))
      .take(PASSPORTS_CAP);
    let passportsCompleted = 0;
    for (const passport of passports.filter((row) => row.status === "published")) {
      const required = await ctx.db
        .query("fairPassportEligibleModels")
        .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", passport._id).eq("status", "required"))
        .take(MODELS_CAP);
      if (!required.length) continue;
      const needed = new Set(required.map((row) => row.eventModelId as string));
      const perVisitor = new Map<string, Set<string>>();
      for (const stamp of counted) {
        if (stamp.brandId !== passport.brandId || !needed.has(stamp.eventModelId)) continue;
        const own = perVisitor.get(stamp.visitorId) ?? new Set<string>();
        own.add(stamp.eventModelId);
        perVisitor.set(stamp.visitorId, own);
      }
      for (const own of perVisitor.values()) if (own.size >= needed.size) passportsCompleted += 1;
    }

    return {
      visitors: { today: today.size, total: everyone.size, capped: uniquesCapped },
      models: modelVisitors,
      locations: [...byLocation].filter(([locationId]) => locationId).map(([locationId, set]) => ({ locationId, visitors: set.size })),
      devices: { ...devices, sample: Math.min(scans.length, DEVICE_SAMPLE_CAP), capped: scans.length > DEVICE_SAMPLE_CAP },
      stamps: { total: counted.length, passportsCompleted, capped: stamps.length > STAMPS_CAP },
    };
  },
});

