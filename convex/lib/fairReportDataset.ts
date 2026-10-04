import { v, type Infer } from "convex/values";
import { belgradeParts } from "../../lib/belgrade-time";
import { fairReportMetrics, getFairEntitlements } from "../../lib/fair-entitlements";
import type { FairPackageTier, FairReportMetric } from "../../lib/fair-contract";
import { fairAudienceQuestionStatus, fairPackageTier, fairSurveyQuestionKind } from "./fairValidators";

// =============================================================================
// Sajam automobila 2026 — B6 daily dataset (MASTER §12, HANDOFF §5.6, §7, §10).
// One dataset = one exhibitor participation × one fair day. It is frozen on
// the fairReportRuns row when the run is built, so the admin reviews exactly
// what is later rendered and sent.
//
// Day window: [fairEventDays.startsAt, fairEventDays.endsAt) — the Belgrade
// calendar day (00:00–24:00), the same bucket as `dateKey`. Once the window has
// closed nothing writes into its buckets any more, so a rebuild gives the same
// numbers. Ratings and Glas publike counts are cumulative (their counters
// have no day bucket) and are read when the run is built.
//
// Package projection: every model contributes ONLY the metric groups of
// `fairReportMetrics(tier at the end of the day)` (lib/fair-entitlements.ts).
// A group the package lacks is absent from the dataset — never a 0.
// =============================================================================

export const FAIR_REPORT_DATASET_VERSION = 1;
/** Technical caps (bounded reads). */
export const FAIR_REPORT_MODELS_CAP = 100;
export const FAIR_REPORT_STANDS_CAP = 50;
export const FAIR_REPORT_ROWS_CAP = 1000;

export const fairReportMetric = v.union(
  v.literal("stand_scans"),
  v.literal("model_scans"),
  v.literal("hourly_scans"),
  v.literal("day_comparison"),
  v.literal("interest"),
  v.literal("test_drive"),
  v.literal("rating_overall"),
  v.literal("rating_dimensions"),
  v.literal("audience"),
  v.literal("survey"),
  v.literal("sponsored_garage"),
);

const scanCounts = v.object({ total: v.number(), unique: v.number() });
/** A count read from at most FAIR_REPORT_ROWS_CAP raw rows; `capped` = "at least". */
const cappedCount = v.object({ count: v.number(), capped: v.boolean() });
const ratingField = v.union(v.literal("overall"), v.literal("appearance"), v.literal("specifications"), v.literal("price"));

export const fairReportRating = v.object({ field: ratingField, count: v.number(), average: v.union(v.number(), v.null()) });

export const fairReportAudience = v.object({
  questionId: v.id("fairAudienceQuestions"),
  prompt: v.string(),
  status: fairAudienceQuestionStatus,
  totalVotes: v.number(),
  options: v.array(v.object({ optionId: v.string(), label: v.string(), count: v.number() })),
});

/** Aggregated answers only — never one visitor's response. */
export const fairReportSurvey = v.object({
  surveyId: v.id("fairSurveys"),
  version: v.number(),
  title: v.optional(v.string()),
  responses: v.number(),
  capped: v.boolean(),
  questions: v.array(
    v.object({
      questionId: v.string(),
      prompt: v.string(),
      kind: fairSurveyQuestionKind,
      answers: v.array(v.object({ value: v.string(), label: v.optional(v.string()), count: v.number() })),
    }),
  ),
});

const sponsoredCounts = v.object({ openModel: v.number(), garageAdd: v.number() });

export const fairReportHour = v.object({ hourKey: v.string(), total: v.number(), unique: v.number() });

/** What one model's analytics query returns before projection (internal). */
export const fairReportModelRaw = v.object({
  eventModelId: v.id("fairEventModels"),
  displayName: v.string(),
  variant: v.optional(v.string()),
  standId: v.id("fairStands"),
  sortOrder: v.number(),
  tier: fairPackageTier,
  scans: v.optional(scanCounts),
  hourly: v.optional(v.array(fairReportHour)),
  interest: v.optional(cappedCount),
  testDrive: v.optional(cappedCount),
  ratings: v.optional(v.array(fairReportRating)),
  audience: v.optional(v.array(fairReportAudience)),
  surveys: v.optional(v.array(fairReportSurvey)),
  sponsored: v.optional(sponsoredCounts),
  previous: v.optional(
    v.object({
      tier: fairPackageTier,
      scans: v.optional(scanCounts),
      interest: v.optional(cappedCount),
      testDrive: v.optional(cappedCount),
      sponsored: v.optional(sponsoredCounts),
    }),
  ),
});
export type FairReportModelRaw = Infer<typeof fairReportModelRaw>;

export const fairReportModel = v.object({
  eventModelId: v.id("fairEventModels"),
  displayName: v.string(),
  variant: v.optional(v.string()),
  standId: v.id("fairStands"),
  tier: fairPackageTier,
  /** The groups this model's package has; everything else is omitted. */
  metrics: v.array(fairReportMetric),
  scans: v.optional(scanCounts),
  interest: v.optional(cappedCount),
  testDrive: v.optional(cappedCount),
  ratings: v.optional(v.array(fairReportRating)),
  audience: v.optional(v.array(fairReportAudience)),
  surveys: v.optional(v.array(fairReportSurvey)),
  sponsored: v.optional(sponsoredCounts),
});
export type FairReportModel = Infer<typeof fairReportModel>;

export const fairReportComparisonMetric = v.union(
  v.literal("scans_total"),
  v.literal("scans_unique"),
  v.literal("interest"),
  v.literal("test_drive"),
  v.literal("sponsored_open_model"),
  v.literal("sponsored_garage_add"),
);
export type FairReportComparisonMetric = Infer<typeof fairReportComparisonMetric>;

export const fairReportStand = v.object({
  standId: v.id("fairStands"),
  code: v.string(),
  displayName: v.string(),
  /** All-time stand total/unique when the run was built (every package has it). */
  total: v.number(),
  unique: v.number(),
});

export const fairDailyDataset = v.object({
  version: v.literal(FAIR_REPORT_DATASET_VERSION),
  eventId: v.id("fairEvents"),
  eventTitle: v.string(),
  eventSlug: v.string(),
  eventDayId: v.id("fairEventDays"),
  dateKey: v.string(),
  dayLabel: v.string(),
  participationId: v.id("fairParticipations"),
  exhibitorName: v.string(),
  windowStart: v.number(),
  windowEnd: v.number(),
  builtAt: v.number(),
  stands: v.array(fairReportStand),
  models: v.array(fairReportModel),
  modelsTruncated: v.boolean(),
  /** Hourly scans summed over the models whose package has `hourly_scans`. */
  hourly: v.optional(v.array(fairReportHour)),
  /** From the second fair day; like-for-like over models entitled on both days. */
  comparison: v.optional(
    v.object({
      previousEventDayId: v.id("fairEventDays"),
      previousDateKey: v.string(),
      rows: v.array(v.object({ metric: fairReportComparisonMetric, current: v.number(), previous: v.number() })),
    }),
  ),
});
export type FairDailyDataset = Infer<typeof fairDailyDataset>;

// -----------------------------------------------------------------------------
// Time window
// -----------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

/** Same key as fairTimeKeys(at).hourKey (convex/lib/fairScans.ts), without its server imports (schema.ts imports this file). */
export function fairHourKey(at: number): string {
  const parts = belgradeParts(at);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}`;
}

/**
 * Belgrade `hourKey`s of a window in order, each once. Belgrade offsets are
 * whole hours, so UTC hour starts are Belgrade hour starts; on the October
 * fall-back the repeated 02 hour has one key and is listed once.
 */
export function fairWindowHourKeys(windowStart: number, windowEnd: number): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let at = Math.floor(windowStart / HOUR_MS) * HOUR_MS; at < windowEnd; at += HOUR_MS) {
    const hourKey = fairHourKey(Math.max(at, windowStart));
    if (!seen.has(hourKey)) {
      seen.add(hourKey);
      keys.push(hourKey);
    }
  }
  return keys;
}

// -----------------------------------------------------------------------------
// Projection and assembly (pure; the build action and the tests share it)
// -----------------------------------------------------------------------------

function has(metrics: readonly FairReportMetric[], metric: FairReportMetric) {
  return metrics.includes(metric);
}

/** One model, cut down to the groups its package has. */
export function projectFairReportModel(raw: FairReportModelRaw): FairReportModel {
  const metrics = fairReportMetrics(raw.tier);
  const ratingFields =
    has(metrics, "rating_overall") ? ["overall"] : has(metrics, "rating_dimensions") ? ["appearance", "specifications", "price"] : [];
  return {
    eventModelId: raw.eventModelId,
    displayName: raw.displayName,
    ...(raw.variant !== undefined ? { variant: raw.variant } : {}),
    standId: raw.standId,
    tier: raw.tier,
    metrics,
    ...(has(metrics, "model_scans") && raw.scans ? { scans: raw.scans } : {}),
    ...(has(metrics, "interest") && raw.interest ? { interest: raw.interest } : {}),
    ...(has(metrics, "test_drive") && raw.testDrive ? { testDrive: raw.testDrive } : {}),
    ...(ratingFields.length && raw.ratings ? { ratings: raw.ratings.filter((row) => ratingFields.includes(row.field)) } : {}),
    ...(has(metrics, "audience") && raw.audience ? { audience: raw.audience } : {}),
    ...(has(metrics, "survey") && raw.surveys ? { surveys: raw.surveys } : {}),
    ...(has(metrics, "sponsored_garage") && raw.sponsored ? { sponsored: raw.sponsored } : {}),
  };
}

type ComparisonSource = {
  metric: FairReportComparisonMetric;
  group: FairReportMetric;
  read: (values: { scans?: { total: number; unique: number }; interest?: { count: number }; testDrive?: { count: number }; sponsored?: { openModel: number; garageAdd: number } }) => number | undefined;
};

const COMPARISON: readonly ComparisonSource[] = [
  { metric: "scans_total", group: "model_scans", read: (values) => values.scans?.total },
  { metric: "scans_unique", group: "model_scans", read: (values) => values.scans?.unique },
  { metric: "interest", group: "interest", read: (values) => values.interest?.count },
  { metric: "test_drive", group: "test_drive", read: (values) => values.testDrive?.count },
  { metric: "sponsored_open_model", group: "sponsored_garage", read: (values) => values.sponsored?.openModel },
  { metric: "sponsored_garage_add", group: "sponsored_garage", read: (values) => values.sponsored?.garageAdd },
];

export type FairDailyDatasetContext = {
  event: { _id: FairDailyDataset["eventId"]; title: string; slug: string };
  day: { _id: FairDailyDataset["eventDayId"]; dateKey: string; label: string; startsAt: number; endsAt: number };
  previousDay: { _id: FairDailyDataset["eventDayId"]; dateKey: string } | null;
  participationId: FairDailyDataset["participationId"];
  exhibitorName: string;
  stands: FairDailyDataset["stands"];
  modelsTruncated: boolean;
  builtAt: number;
};

/**
 * Builds the frozen dataset. Hourly and the day comparison exist only when at
 * least one model's package has them; a comparison row only sums models that
 * had the group at the end of BOTH days (like for like, no fake zeros).
 */
export function assembleFairDailyDataset(context: FairDailyDatasetContext, raws: readonly FairReportModelRaw[]): FairDailyDataset {
  const ordered = [...raws].sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "sr"));
  const models = ordered.map(projectFairReportModel);

  const hourlySources = ordered.filter((raw) => has(fairReportMetrics(raw.tier), "hourly_scans") && raw.hourly);
  let hourly: FairDailyDataset["hourly"];
  if (hourlySources.length) {
    const sums = new Map<string, { total: number; unique: number }>();
    for (const key of fairWindowHourKeys(context.day.startsAt, context.day.endsAt)) sums.set(key, { total: 0, unique: 0 });
    for (const raw of hourlySources) {
      for (const hour of raw.hourly ?? []) {
        const sum = sums.get(hour.hourKey) ?? { total: 0, unique: 0 };
        sums.set(hour.hourKey, { total: sum.total + hour.total, unique: sum.unique + hour.unique });
      }
    }
    hourly = [...sums.entries()].map(([hourKey, sum]) => ({ hourKey, ...sum }));
  }

  let comparison: FairDailyDataset["comparison"];
  if (context.previousDay && ordered.some((raw) => has(fairReportMetrics(raw.tier), "day_comparison"))) {
    const rows: NonNullable<FairDailyDataset["comparison"]>["rows"] = [];
    for (const source of COMPARISON) {
      let current = 0;
      let previous = 0;
      let counted = 0;
      for (const raw of ordered) {
        const now = fairReportMetrics(raw.tier);
        if (!has(now, "day_comparison") || !has(now, source.group) || !raw.previous) continue;
        if (!has(fairReportMetrics(raw.previous.tier), source.group)) continue;
        const a = source.read(raw);
        const b = source.read(raw.previous);
        if (a === undefined || b === undefined) continue;
        current += a;
        previous += b;
        counted += 1;
      }
      if (counted) rows.push({ metric: source.metric, current, previous });
    }
    if (rows.length) comparison = { previousEventDayId: context.previousDay._id, previousDateKey: context.previousDay.dateKey, rows };
  }

  return {
    version: FAIR_REPORT_DATASET_VERSION,
    eventId: context.event._id,
    eventTitle: context.event.title,
    eventSlug: context.event.slug,
    eventDayId: context.day._id,
    dateKey: context.day.dateKey,
    dayLabel: context.day.label,
    participationId: context.participationId,
    exhibitorName: context.exhibitorName,
    windowStart: context.day.startsAt,
    windowEnd: context.day.endsAt,
    builtAt: context.builtAt,
    stands: context.stands,
    models,
    modelsTruncated: context.modelsTruncated,
    ...(hourly ? { hourly } : {}),
    ...(comparison ? { comparison } : {}),
  };
}

/** Does any model of the participation have a daily report at `at`? (auto-build gate) */
export function fairTiersHaveDailyReport(tiers: readonly FairPackageTier[]): boolean {
  return tiers.some((tier) => getFairEntitlements(tier).dailyReport);
}
