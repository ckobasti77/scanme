// Sajam automobila 2026 — the ONE authority for package rights (B0,
// BACKEND-HANDOFF §4.1, MASTER §4). UI, mutations and reports read these pure
// functions; nobody re-derives package rules elsewhere. No Convex, React,
// Next or Node imports.

import {
  FAIR_PACKAGE_TIERS,
  isFairRatingValue,
  type FairBrandPassportProblem,
  type FairEntitlements,
  type FairErrorCode,
  type FairLeadActivityGroup,
  type FairModelCapabilities,
  type FairModelStatus,
  type FairPackageTier,
  type FairReportMetric,
} from "./fair-contract";

// -----------------------------------------------------------------------------
// Catalog — HANDOFF §4.1, row by row
// -----------------------------------------------------------------------------

export const FAIR_ENTITLEMENT_CATALOG: Readonly<
  Record<FairPackageTier, Readonly<FairEntitlements>>
> = {
  included: {
    publicModelPage: true,
    garage: true,
    standScanTotals: true,
    modelAnalytics: false,
    ratingMode: "none",
    interest: false,
    audienceQuestionsPerDay: 0,
    dailyReport: false,
    testDrive: false,
    survey: false,
    postEventFollowUp: false,
    sponsoredMapRotation: false,
    sponsoredGarageRotation: false,
    passportEligibleTier: false,
  },
  starter: {
    publicModelPage: true,
    garage: true,
    standScanTotals: true,
    modelAnalytics: true,
    ratingMode: "overall",
    interest: true,
    audienceQuestionsPerDay: 1,
    dailyReport: true,
    testDrive: false,
    survey: false,
    postEventFollowUp: false,
    sponsoredMapRotation: false,
    sponsoredGarageRotation: false,
    passportEligibleTier: true,
  },
  // Advanced inherits every Starter business right EXCEPT the rating shape: it
  // replaces the single overall rating with three optional dimensions and has
  // no fourth/derived overall (MASTER §4.3, §7).
  advanced: {
    publicModelPage: true,
    garage: true,
    standScanTotals: true,
    modelAnalytics: true,
    ratingMode: "dimensions",
    interest: true,
    audienceQuestionsPerDay: 5,
    dailyReport: true,
    testDrive: true,
    survey: true,
    postEventFollowUp: true,
    sponsoredMapRotation: true,
    sponsoredGarageRotation: true,
    passportEligibleTier: true,
  },
};

export function getFairEntitlements(tier: FairPackageTier): Readonly<FairEntitlements> {
  return FAIR_ENTITLEMENT_CATALOG[tier];
}

export function fairTierRank(tier: FairPackageTier): number {
  return FAIR_PACKAGE_TIERS.indexOf(tier);
}

// -----------------------------------------------------------------------------
// Package changes — upgrade only, effective from the activation moment
// -----------------------------------------------------------------------------

export type FairPackageChangeProblem = "same_tier" | "downgrade";

/**
 * Only an upgrade along included → starter → advanced is allowed; there is no
 * downgrade during the fair (MASTER §4.4). A direct included → advanced jump
 * is an upgrade too (open question in FAIR-BACKEND-CONTRACT.md).
 */
export function fairPackageChangeProblem(
  from: FairPackageTier,
  to: FairPackageTier,
): FairPackageChangeProblem | null {
  if (from === to) return "same_tier";
  return fairTierRank(to) > fairTierRank(from) ? null : "downgrade";
}

export function canUpgradeFairPackage(from: FairPackageTier, to: FairPackageTier): boolean {
  return fairPackageChangeProblem(from, to) === null;
}

/**
 * P1 (Aleksa, 8. 10. 2026): a package's rights start when the package is
 * assigned — never later. A requested start in the future (DATA-INTAKE
 * `package_active_from`, e.g. the fair's first day) is taken as the moment of
 * assignment; a requested start in the past is kept as before.
 */
export function fairPackageActivationAt(requested: number | undefined, assignedAt: number): number {
  return requested === undefined ? assignedAt : Math.min(requested, assignedAt);
}

/** A model's package history: the tier it started with and its upgrades. */
export type FairPackageHistory = {
  initialTier: FairPackageTier;
  /** When the initial tier took effect (model creation / first activation). */
  startedAt: number;
  activations: ReadonlyArray<{ toTier: FairPackageTier; activatedAt: number }>;
};

function sortedActivations(history: FairPackageHistory) {
  return [...history.activations].sort((a, b) => a.activatedAt - b.activatedAt);
}

/** Tier in force at `at`. An activation is effective from its own instant. */
export function fairTierAt(history: FairPackageHistory, at: number): FairPackageTier {
  let tier = history.initialTier;
  for (const activation of sortedActivations(history)) {
    if (activation.activatedAt > at) break;
    tier = activation.toTier;
  }
  return tier;
}

/** Paid features that a package unlocks. */
export type FairPaidFeature =
  | "modelAnalytics"
  | "rating"
  | "interest"
  | "audienceQuestions"
  | "dailyReport"
  | "testDrive"
  | "survey"
  | "postEventFollowUp"
  | "sponsoredMapRotation"
  | "sponsoredGarageRotation";

export function fairTierHasFeature(tier: FairPackageTier, feature: FairPaidFeature): boolean {
  const rights = FAIR_ENTITLEMENT_CATALOG[tier];
  switch (feature) {
    case "rating":
      return rights.ratingMode !== "none";
    case "audienceQuestions":
      return rights.audienceQuestionsPerDay > 0;
    default:
      return rights[feature];
  }
}

/**
 * Non-retroactivity (MASTER §4.4, HANDOFF §4.1): a paid interaction at `at` is
 * judged by the tier in force at `at`, never by a later upgrade.
 */
export function fairFeatureActiveAt(
  history: FairPackageHistory,
  feature: FairPaidFeature,
  at: number,
): boolean {
  return fairTierHasFeature(fairTierAt(history, at), feature);
}

/**
 * Earliest instant from which a paid feature's data may be attributed to the
 * model, or null when the model never had the feature. Paid interactions
 * before this instant are never attributed to the feature.
 */
export function fairFeatureSince(
  history: FairPackageHistory,
  feature: FairPaidFeature,
): number | null {
  if (fairTierHasFeature(history.initialTier, feature)) return history.startedAt;
  for (const activation of sortedActivations(history)) {
    if (fairTierHasFeature(activation.toTier, feature)) return activation.activatedAt;
  }
  return null;
}

/**
 * Scans are not paid interactions: every non-admin scan counts regardless of
 * the tier in force when it happened, so scans from before an upgrade stay in
 * later analytics (MASTER §4.4, HANDOFF §10). Kept as a function so reports
 * state the rule instead of silently omitting a filter.
 */
export function fairScanCountsInAnalytics(): true {
  return true;
}

// -----------------------------------------------------------------------------
// Glas publike — 0 / 1 / 5 questions per fair day
// -----------------------------------------------------------------------------

export function fairAudienceQuestionLimit(tier: FairPackageTier): 0 | 1 | 5 {
  return FAIR_ENTITLEMENT_CATALOG[tier].audienceQuestionsPerDay;
}

/**
 * Questions that may still be published for one fair day. `tierNow` is the
 * tier in force at publish time; because tiers only go up, an upgrade during
 * the day lifts the day's total to the new limit and questions already
 * published that day (the Starter one included) count toward it (MASTER §4.4).
 */
export function fairAudienceQuestionsRemaining(
  tierNow: FairPackageTier,
  publishedForDay: number,
): number {
  return Math.max(0, fairAudienceQuestionLimit(tierNow) - Math.max(0, publishedForDay));
}

// -----------------------------------------------------------------------------
// Ratings — Starter overall, Advanced three optional dimensions
// -----------------------------------------------------------------------------

export type FairRatingInput = {
  overall?: number;
  appearance?: number;
  specifications?: number;
  price?: number;
};

/**
 * Validates one rating submission against the tier in force. Starter accepts
 * exactly `overall`; Advanced never accepts `overall` and takes any non-empty
 * combination of appearance/specifications/price. Values are 1–5 in steps of 0.5.
 */
export function fairRatingInputProblem(
  tier: FairPackageTier,
  input: FairRatingInput,
): FairErrorCode | null {
  const mode = FAIR_ENTITLEMENT_CATALOG[tier].ratingMode;
  if (mode === "none") return "FEATURE_NOT_ENTITLED";
  const dimensions = [input.appearance, input.specifications, input.price].filter(
    (value): value is number => value !== undefined,
  );
  if (mode === "overall") {
    if (dimensions.length > 0) return "INVALID_INPUT";
    if (input.overall === undefined || !isFairRatingValue(input.overall)) return "INVALID_INPUT";
    return null;
  }
  if (input.overall !== undefined) return "INVALID_INPUT";
  if (dimensions.length === 0) return "INVALID_INPUT";
  return dimensions.every(isFairRatingValue) ? null : "INVALID_INPUT";
}

// -----------------------------------------------------------------------------
// Analytics, passport and capabilities
// -----------------------------------------------------------------------------

/** `included` sees only its stand's total+unique scans; Starter+ per model. */
export type FairAnalyticsScope = "stand_totals" | "model";

export function fairAnalyticsScope(tier: FairPackageTier): FairAnalyticsScope {
  return FAIR_ENTITLEMENT_CATALOG[tier].modelAnalytics ? "model" : "stand_totals";
}

/**
 * B6 report projection (MASTER §12, HANDOFF §10): the metric groups one
 * model contributes to its exhibitor's dataset, derived from the catalog
 * above. `included` → only its stand's total/unique; Starter → model
 * analytics, hourly split, day comparison, interest, overall rating, Glas
 * publike; Advanced → Starter plus test drive, survey and garage sponsored
 * conversions, with the three rating dimensions INSTEAD of overall. A group
 * not listed is omitted from the dataset (never a fake zero).
 */
export function fairReportMetrics(tier: FairPackageTier): FairReportMetric[] {
  const rights = FAIR_ENTITLEMENT_CATALOG[tier];
  const metrics: FairReportMetric[] = [];
  if (rights.standScanTotals) metrics.push("stand_scans");
  if (rights.modelAnalytics) metrics.push("model_scans");
  if (rights.dailyReport) metrics.push("hourly_scans", "day_comparison");
  if (rights.interest) metrics.push("interest");
  if (rights.testDrive) metrics.push("test_drive");
  if (rights.ratingMode === "overall") metrics.push("rating_overall");
  if (rights.ratingMode === "dimensions") metrics.push("rating_dimensions");
  if (rights.audienceQuestionsPerDay > 0) metrics.push("audience");
  if (rights.survey) metrics.push("survey");
  if (rights.sponsoredGarageRotation) metrics.push("sponsored_garage");
  return metrics;
}

/**
 * Admin UX A8 — does the feature behind an activity group exist in this
 * package at all? A group no model of the exhibitor can have is omitted next
 * to a lead (never shown as an empty 0, MASTER §12).
 */
export function fairLeadActivityAvailable(tier: FairPackageTier, group: FairLeadActivityGroup): boolean {
  const rights = FAIR_ENTITLEMENT_CATALOG[tier];
  switch (group) {
    case "scans": return true;
    case "ratings": return rights.ratingMode !== "none";
    case "audienceVotes": return rights.audienceQuestionsPerDay > 0;
    case "surveyAnswers": return rights.survey;
    case "passport": return rights.passportEligibleTier;
    case "sponsoredActions": return rights.sponsoredGarageRotation;
  }
}

/**
 * Admin UX A8 — whether an activity group goes to the exhibitor together with
 * the lead (ADMIN-UX §7: "Starter manje, Napredni više"): exactly the metric
 * groups of the package (fairReportMetrics, MASTER §4, §12) of the lead's
 * model at the moment of the lead. The brand passport is no package metric,
 * so it stays with the ScanMe team (open question in the contract §34).
 */
export function fairLeadActivityShared(tier: FairPackageTier, group: FairLeadActivityGroup): boolean {
  const metrics = fairReportMetrics(tier);
  switch (group) {
    case "scans": return metrics.includes("model_scans");
    case "ratings": return metrics.includes("rating_overall") || metrics.includes("rating_dimensions");
    case "audienceVotes": return metrics.includes("audience");
    case "surveyAnswers": return metrics.includes("survey");
    case "passport": return false;
    case "sponsoredActions": return metrics.includes("sponsored_garage");
  }
}

/**
 * A brand passport can be published only when the brand exhibits at least
 * two models on the event and every one of them is Starter or Advanced
 * (MASTER §11). Pass the brand's exhibited (non-withdrawn) models.
 */
export function fairBrandPassportEligible(
  models: ReadonlyArray<{ packageTier: FairPackageTier }>,
): boolean {
  return (
    models.length >= 2 &&
    models.every((model) => FAIR_ENTITLEMENT_CATALOG[model.packageTier].passportEligibleTier)
  );
}

export type FairBrandPassportCheck = {
  eligible: boolean;
  /** Exhibited (non-withdrawn) models of the brand on the event. */
  exhibited: number;
  /** Every rule the brand breaks; `count` = exhibited models that break it (for the first rule: how many are exhibited). */
  problems: { code: FairBrandPassportProblem; count: number }[];
};

/**
 * Admin UX A7 — the brand passport condition with every reason it fails, for
 * the automatic passport and the admin overview (MASTER §11; the same rules
 * fairInteractionsAdmin.publishPassport has used since B3, contract §9.31):
 * at least two exhibited (non-withdrawn) models, every one of them
 * published, a passport candidate (`passportEligible`) and Starter or
 * Advanced, and all of one exhibitor. Pass every model of the brand on the
 * event; withdrawn ones are ignored.
 */
export function fairBrandPassportProblems(
  models: ReadonlyArray<{ status: FairModelStatus; passportEligible: boolean; packageTier: FairPackageTier; participationId?: string }>,
): FairBrandPassportCheck {
  const exhibited = models.filter((model) => model.status !== "withdrawn");
  const problems: FairBrandPassportCheck["problems"] = [];
  const add = (code: FairBrandPassportProblem, count: number) => {
    if (count > 0) problems.push({ code, count });
  };
  if (exhibited.length < 2) problems.push({ code: "fewer_than_two_models", count: exhibited.length });
  add("model_not_published", exhibited.filter((model) => model.status !== "published").length);
  add("model_not_candidate", exhibited.filter((model) => !model.passportEligible).length);
  add("model_below_starter", exhibited.filter((model) => !FAIR_ENTITLEMENT_CATALOG[model.packageTier].passportEligibleTier).length);
  const exhibitors = new Set(exhibited.flatMap((model) => (model.participationId ? [model.participationId] : [])));
  if (exhibitors.size > 1) problems.push({ code: "multiple_exhibitors", count: exhibitors.size });
  return { eligible: problems.length === 0, exhibited: exhibited.length, problems };
}

/** Live facts the server combines with the tier into public capabilities. */
export type FairCapabilityContext = {
  /** A published audience question is open for this model today. */
  hasOpenAudienceQuestions: boolean;
  /** A published survey version exists for this model. */
  hasPublishedSurvey: boolean;
  /** The model is in the event's published sponsored snapshot. */
  inPublishedSponsoredSnapshot: boolean;
  /** fairLeadConfigs.enabled for `interest` (absent config = false). */
  interestLeadEnabled: boolean;
  /** fairLeadConfigs.enabled for `test_drive` (absent config = false). */
  testDriveLeadEnabled: boolean;
};

export function deriveFairCapabilities(
  tier: FairPackageTier,
  context: FairCapabilityContext,
): FairModelCapabilities {
  const rights = FAIR_ENTITLEMENT_CATALOG[tier];
  return {
    ratingMode: rights.ratingMode,
    canSubmitInterest: rights.interest && context.interestLeadEnabled,
    canRequestTestDrive: rights.testDrive && context.testDriveLeadEnabled,
    hasAudienceQuestions: rights.audienceQuestionsPerDay > 0 && context.hasOpenAudienceQuestions,
    hasSurvey: rights.survey && context.hasPublishedSurvey,
    isSponsored:
      (rights.sponsoredMapRotation || rights.sponsoredGarageRotation) &&
      context.inPublishedSponsoredSnapshot,
  };
}
