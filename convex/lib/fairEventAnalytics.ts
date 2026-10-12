import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { belgradeParts } from "../../lib/belgrade-time";
import { fairScanCountKey, readFairCount } from "./fairCountShards";
import { fairAudienceOptionCounts, fairModelSurveys } from "./fairInteractions";
import { fairDayCountFrom } from "./fairPreEvent";

// =============================================================================
// ADMIN v2 X3 — Analitika v2 (admin only, read only). The aggregations behind
// fairEventAnalytics.getEventEngagement and getModelAnalytics:
//   engagement — scans per model and fair day, visitors and leads per day, how
//     many models one visitor scanned, the visitors who did more than scan
//     (rated, voted, answered a survey, left a lead), the visitors with a
//     passport stamp and scans per model by package;
//   one model  — its scans per day and per hour, the ratings 1–5, the votes of
//     its questions and its leads by kind.
// Everything starts at the event's analytics cutoff and leaves admin rows out,
// like the two existing reads. A day and an hour are Europe/Belgrade buckets.
// Every row read is capped; a cap that was hit is returned as `capped`. Nothing
// here returns a visitor id or a contact: visitor ids are only counted.
//
// Two Convex limits bound a query: 32 000 documents read and 4 096 index
// ranges. The ranges are the tighter one here (a counter is one range per
// bucket), so the engagement read has a budget for them: with every cap hit it
// stays near 3 500 ranges (counterRanges + 4 per model + questions + surveys).
// =============================================================================

const HOUR_MS = 3_600_000;

export type FairAnalyticsDay = Pick<Doc<"fairEventDays">, "dateKey" | "label" | "startsAt" | "endsAt">;

export type FairEngagementCaps = {
  /** Counter buckets read for the scans per model and day (one index range each). */
  counterRanges: number;
  uniqueRows: number;
  ratings: number;
  votes: number;
  surveyRows: number;
  leads: number;
  stamps: number;
  questionsPerModel: number;
  /** Questions and survey versions whose answers are read (one index range each). */
  questions: number;
  surveys: number;
};
export const FAIR_ENGAGEMENT_CAPS: FairEngagementCaps = {
  counterRanges: 2400,
  uniqueRows: 5000,
  ratings: 2000,
  votes: 2000,
  surveyRows: 2000,
  leads: 3000,
  stamps: 2500,
  questionsPerModel: 30,
  questions: 300,
  surveys: 200,
};

export type FairModelAnalyticsCaps = { ratings: number; leads: number; questions: number };
export const FAIR_MODEL_ANALYTICS_CAPS: FairModelAnalyticsCaps = { ratings: 500, leads: 500, questions: 30 };

// -----------------------------------------------------------------------------
// Pure aggregations
// -----------------------------------------------------------------------------

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` of `at` in Europe/Belgrade (the same bucket as fairTimeKeys). */
export function fairBelgradeDateKey(at: number): string {
  const parts = belgradeParts(at);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** How many of `timestamps` fall on each Belgrade day of `dayKeys`; a moment outside every day is not counted. */
export function fairCountByDay(dayKeys: readonly string[], timestamps: readonly number[]): number[] {
  const index = new Map(dayKeys.map((key, at) => [key, at]));
  const counts = dayKeys.map(() => 0);
  for (const at of timestamps) {
    const day = index.get(fairBelgradeDateKey(at));
    if (day !== undefined) counts[day] += 1;
  }
  return counts;
}

/**
 * Distinct visitors per fair day from the unique rows (one per visitor and
 * model): a visitor counts on the day of the first and on the day of the last
 * scan of any of their rows. For "today" this is the same rule as
 * getEventAudience (`lastScannedAt` inside today). A middle day misses only a
 * visitor who that day scanned nothing new and scanned the same cars again on
 * a later day; counting those would mean reading every scan row.
 */
export function fairVisitorsByDay(
  dayKeys: readonly string[],
  rows: ReadonlyArray<{ visitorId: string; firstScannedAt: number; lastScannedAt: number }>,
): number[] {
  const index = new Map(dayKeys.map((key, at) => [key, at]));
  const sets = dayKeys.map(() => new Set<string>());
  for (const row of rows) {
    for (const at of [row.firstScannedAt, row.lastScannedAt]) {
      const day = index.get(fairBelgradeDateKey(at));
      if (day !== undefined) sets[day].add(row.visitorId);
    }
  }
  return sets.map((set) => set.size);
}

/** How many visitors scanned 1, 2, 3 or 4+ models (one row = one visitor and one model). */
export function fairVisitorDepth(rows: ReadonlyArray<{ visitorId: string }>) {
  const perVisitor = new Map<string, number>();
  for (const row of rows) perVisitor.set(row.visitorId, (perVisitor.get(row.visitorId) ?? 0) + 1);
  const depth = { one: 0, two: 0, three: 0, fourPlus: 0, visitors: perVisitor.size };
  for (const models of perVisitor.values()) {
    if (models === 1) depth.one += 1;
    else if (models === 2) depth.two += 1;
    else if (models === 3) depth.three += 1;
    else depth.fourPlus += 1;
  }
  return depth;
}

/** Visitors who did more than scan, by what they did; only visitors of `scanners` count (the funnel stays a subset). */
export function fairEngagedVisitors(
  scanners: ReadonlySet<string>,
  byKind: { rating: Iterable<string>; vote: Iterable<string>; survey: Iterable<string>; lead: Iterable<string> },
) {
  const everyone = new Set<string>();
  const count = (ids: Iterable<string>) => {
    const own = new Set<string>();
    for (const id of ids) {
      if (!scanners.has(id)) continue;
      own.add(id);
      everyone.add(id);
    }
    return own.size;
  };
  const rating = count(byKind.rating);
  const vote = count(byKind.vote);
  const survey = count(byKind.survey);
  const lead = count(byKind.lead);
  return { visitors: everyone.size, rating, vote, survey, lead };
}

const TIER_ORDER = ["advanced", "starter", "included"];

/** Scans per model by package, in the fixed order Napredni, Starter, Besplatan; a package without a model is left out. */
export function fairPackageComparison(models: ReadonlyArray<{ tier: string; scans: number }>) {
  const byTier = new Map<string, { models: number; scans: number }>();
  for (const model of models) {
    const row = byTier.get(model.tier) ?? { models: 0, scans: 0 };
    row.models += 1;
    row.scans += model.scans;
    byTier.set(model.tier, row);
  }
  return [...byTier]
    .sort(([a], [b]) => (TIER_ORDER.indexOf(a) + 1 || 99) - (TIER_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b))
    .map(([tier, row]) => ({ tier, models: row.models, scans: row.scans, scansPerModel: Math.round((row.scans / row.models) * 10) / 10 }));
}

/** Ratings 1–5 in five buckets by whole star: 1 and 1,5 in the first … 5 alone in the last. */
export function fairRatingBuckets(values: readonly number[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const value of values) {
    if (!(value >= 1 && value <= 5)) continue;
    buckets[Math.floor(value) - 1] += 1;
  }
  return buckets;
}

// -----------------------------------------------------------------------------
// Bounded reads
// -----------------------------------------------------------------------------

type Range<T> = { take(count: number): Promise<T[]> };

/** The rows of several index ranges under ONE shared cap; `capped` when at least one row was left out. */
async function readWithin<T>(cap: number, ranges: ReadonlyArray<() => Range<T>>): Promise<{ rows: T[]; capped: boolean }> {
  const rows: T[] = [];
  for (const range of ranges) {
    const left = cap - rows.length;
    const page = await range().take(left + 1);
    if (page.length > left) return { rows: [...rows, ...page.slice(0, left)], capped: true };
    rows.push(...page);
  }
  return { rows, capped: false };
}

export async function loadFairEngagement(
  ctx: QueryCtx,
  input: { event: Doc<"fairEvents">; cutoff: number; days: readonly FairAnalyticsDay[]; models: ReadonlyArray<Doc<"fairEventModels">> },
  caps: FairEngagementCaps = FAIR_ENGAGEMENT_CAPS,
) {
  const { event, cutoff, days, models } = input;
  const dayKeys = days.map((day) => day.dateKey);

  // Scans per model and fair day, from the day (or, on the opening day, hour)
  // counters. A day whose start is before the cutoff is read hour by hour, so
  // the models that fit the range budget get a series and the rest do not.
  const rangesPerModel = Math.max(1, days.reduce((total, day) => total + (cutoff <= day.startsAt ? 1 : cutoff >= day.endsAt ? 0 : Math.ceil((day.endsAt - cutoff) / HOUR_MS)), 0));
  const withSeries = models.slice(0, Math.floor(caps.counterRanges / rangesPerModel));
  const modelRows = [];
  for (const model of withSeries) {
    const base = fairScanCountKey("scan_total", "model", model._id);
    const scansByDay: number[] = [];
    for (const day of days) scansByDay.push(await fairDayCountFrom(ctx, base, day, cutoff));
    modelRows.push({ eventModelId: model._id, tier: model.packageTier, scansByDay });
  }

  // One row per visitor and model (an admin scan never makes one).
  const uniques = await readWithin(caps.uniqueRows, models.map((model) => () =>
    ctx.db
      .query("fairUniqueScans")
      .withIndex("by_eventModelId_and_firstScannedAt", (q) => q.eq("eventModelId", model._id).gte("firstScannedAt", cutoff)),
  ));
  const scanners = new Set<string>(uniques.rows.map((row) => row.visitorId));

  // A row is pre-event by its creation time; a rating or a vote changed after the opening stays pre-event.
  const ratings = await readWithin(caps.ratings, models.map((model) => () =>
    ctx.db
      .query("fairRatings")
      .withIndex("by_eventModelId_and_updatedAt", (q) => q.eq("eventModelId", model._id).gte("updatedAt", cutoff))
      .filter((q) => q.and(q.neq(q.field("isAdminExcluded"), true), q.gte(q.field("createdAt"), cutoff))),
  ));

  const allQuestions: Doc<"fairAudienceQuestions">[] = [];
  const allSurveys: Doc<"fairSurveys">[] = [];
  for (const model of models) {
    const rows = await ctx.db
      .query("fairAudienceQuestions")
      .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id))
      .take(caps.questionsPerModel);
    allQuestions.push(...rows.filter((row) => row.status !== "draft"));
    allSurveys.push(...(await fairModelSurveys(ctx, model._id)));
  }
  const questions = allQuestions.slice(0, caps.questions);
  const surveys = allSurveys.slice(0, caps.surveys);
  const votes = await readWithin(caps.votes, questions.map((question) => () =>
    ctx.db
      .query("fairAudienceVotes")
      .withIndex("by_questionId_and_updatedAt", (q) => q.eq("questionId", question._id).gte("updatedAt", cutoff))
      .filter((q) => q.and(q.neq(q.field("isAdminExcluded"), true), q.gte(q.field("createdAt"), cutoff))),
  ));
  const surveyRows = await readWithin(caps.surveyRows, surveys.map((survey) => () =>
    ctx.db
      .query("fairSurveyResponses")
      .withIndex("by_surveyId_and_submittedAt", (q) => q.eq("surveyId", survey._id).gte("submittedAt", cutoff))
      .filter((q) => q.neq(q.field("isAdminExcluded"), true)),
  ));

  const leads = await readWithin(caps.leads, [() =>
    ctx.db
      .query("fairLeads")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).gte("createdAt", cutoff))
      .filter((q) => q.neq(q.field("isAdminExcluded"), true)),
  ]);

  const stamps = await readWithin(caps.stamps, [() =>
    ctx.db
      .query("fairPassportStamps")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", cutoff))
      .filter((q) => q.and(q.eq(q.field("eventId"), event._id), q.neq(q.field("isAdminExcluded"), true))),
  ]);

  const visitorsByDay = fairVisitorsByDay(dayKeys, uniques.rows);
  const leadsByDay = fairCountByDay(dayKeys, leads.rows.map((row) => row.createdAt));
  return {
    days: days.map((day, index) => ({ dateKey: day.dateKey, label: day.label, visitors: visitorsByDay[index], leads: leadsByDay[index] })),
    models: modelRows.map((row) => ({ eventModelId: row.eventModelId, scansByDay: row.scansByDay })),
    depth: fairVisitorDepth(uniques.rows),
    engaged: fairEngagedVisitors(scanners, {
      rating: ratings.rows.map((row) => row.visitorId),
      vote: votes.rows.map((row) => row.visitorId),
      survey: surveyRows.rows.map((row) => row.visitorId),
      lead: leads.rows.map((row) => row.visitorId),
    }),
    stampVisitors: new Set(stamps.rows.map((row) => row.visitorId)).size,
    // A package average of a part of the models would mislead: without every series there is none.
    packages: withSeries.length < models.length ? [] : fairPackageComparison(modelRows.map((row) => ({ tier: row.tier, scans: row.scansByDay.reduce((sum, value) => sum + value, 0) }))),
    capped: {
      days: withSeries.length < models.length,
      visitors: uniques.capped,
      ratings: ratings.capped,
      votes: votes.capped || questions.length < allQuestions.length,
      surveys: surveyRows.capped || surveys.length < allSurveys.length,
      leads: leads.capped,
      stamps: stamps.capped,
    },
  };
}

export async function loadFairModelAnalytics(
  ctx: QueryCtx,
  input: { cutoff: number; days: readonly FairAnalyticsDay[]; model: Doc<"fairEventModels">; at: number; firstHour: number },
  caps: FairModelAnalyticsCaps = FAIR_MODEL_ANALYTICS_CAPS,
) {
  const { cutoff, days, model, at } = input;
  const total = fairScanCountKey("scan_total", "model", model._id);
  const unique = fairScanCountKey("scan_unique", "model", model._id);

  const dayRows = [];
  const hourRows = [];
  for (const day of days) {
    dayRows.push({
      dateKey: day.dateKey,
      label: day.label,
      scans: await fairDayCountFrom(ctx, total, day, cutoff),
      uniquePerModel: await fairDayCountFrom(ctx, unique, day, cutoff),
    });
    // Hours from the hall's opening hour, never before the cutoff or after `at`.
    const first = day.startsAt + input.firstHour * HOUR_MS;
    for (let start = Math.max(first, cutoff); start < day.endsAt && start <= at; start += HOUR_MS) {
      const hour = belgradeParts(start).hour;
      const hourKey = `${day.dateKey}T${pad(hour)}`;
      hourRows.push({
        dateKey: day.dateKey,
        hour,
        scans: await readFairCount(ctx, `${total}:${hourKey}`),
        uniquePerModel: await readFairCount(ctx, `${unique}:${hourKey}`),
      });
    }
  }

  const ratings = await readWithin(caps.ratings, [() =>
    ctx.db
      .query("fairRatings")
      .withIndex("by_eventModelId_and_updatedAt", (q) => q.eq("eventModelId", model._id).gte("updatedAt", cutoff))
      .filter((q) => q.and(q.neq(q.field("isAdminExcluded"), true), q.gte(q.field("createdAt"), cutoff))),
  ]);
  // Every value a visitor gave: `overall` (Starter) or the dimensions (Napredni), as in the model ranking.
  const values = ratings.rows.flatMap((row) => [row.overall, row.appearance, row.specifications, row.price].filter((value): value is number => value !== undefined));
  const sum = values.reduce((acc, value) => acc + value, 0);

  const questions = await ctx.db
    .query("fairAudienceQuestions")
    .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id))
    .take(caps.questions);
  const questionRows = [];
  for (const question of questions.filter((row) => row.status !== "draft")) {
    const votes = (await fairAudienceOptionCounts(ctx, question)).counts.reduce((acc, value) => acc + value, 0);
    questionRows.push({ prompt: question.prompt, votes });
  }

  const leads = await readWithin(caps.leads, [() =>
    ctx.db
      .query("fairLeads")
      .withIndex("by_eventModelId_and_createdAt", (q) => q.eq("eventModelId", model._id).gte("createdAt", cutoff))
      .filter((q) => q.neq(q.field("isAdminExcluded"), true)),
  ]);

  return {
    eventModelId: model._id,
    days: dayRows,
    hours: hourRows,
    ratings: {
      count: values.length,
      average: values.length ? Math.round((sum / values.length) * 100) / 100 : null,
      buckets: fairRatingBuckets(values),
      capped: ratings.capped,
    },
    votes: { total: questionRows.reduce((acc, row) => acc + row.votes, 0), questions: questionRows },
    leads: {
      total: leads.rows.length,
      interest: leads.rows.filter((row) => row.kind === "interest").length,
      testDrive: leads.rows.filter((row) => row.kind === "test_drive").length,
      capped: leads.capped,
    },
  };
}
