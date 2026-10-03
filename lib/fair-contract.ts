// Sajam automobila 2026 — typed fair contract (B0, BACKEND-HANDOFF §4, §5, §6;
// JOVAN-DELTA-2026-10-02).
//
// Pure TypeScript: no React, Next, Node or Convex imports. The Convex schema
// validators (convex/lib/fairValidators.ts) mirror the unions below and a
// type-level test (convex/fairSchema.test.ts) keeps the two from drifting.
// Backend projections and the public frontend build against these types; the
// frontend renders server-projected `capabilities` and never compares package
// strings to derive rights.
//
// No user-facing text lives here: errors are stable codes that the frontend
// maps through the typed lib/i18n layer.

// -----------------------------------------------------------------------------
// Enumerations (the literal sets the schema stores)
// -----------------------------------------------------------------------------

/** Package tiers in upgrade order: included → starter → advanced (§4.1). */
export const FAIR_PACKAGE_TIERS = ["included", "starter", "advanced"] as const;
export type FairPackageTier = (typeof FAIR_PACKAGE_TIERS)[number];

export type FairEventStatus = "draft" | "published" | "live" | "ended" | "archived";
export type FairParticipationStatus = "draft" | "active" | "withdrawn";
/** B0 placeholder: HANDOFF §5.1 names `fairStands.status` without values. */
export type FairStandStatus = "draft" | "active" | "withdrawn";
export type FairModelStatus = "draft" | "published" | "withdrawn";
export type FairQrAssignmentStatus = "assigned" | "released";
export type FairAudienceQuestionStatus = "draft" | "published" | "closed";
/** B0 placeholder: HANDOFF §5.3 names `fairSurveys.status` without values. */
export type FairSurveyStatus = "draft" | "published" | "retired";
export type FairSurveyQuestionKind = "yes_no" | "single_choice";
export type FairLeadKind = "interest" | "test_drive";
export type FairContactRequirement = "one_of" | "email" | "phone" | "both";
export type FairPreferredContact = "email" | "phone";
export type FairConsentStatus = "draft" | "active" | "retired";
export type FairLeadStatus = "received" | "delivered";
export type FairMessageTemplateKind = "immediate_confirmation" | "post_event_follow_up";
export type FairMessageTemplateStatus = "draft" | "active" | "retired";
export type FairEmailDeliveryKind =
  | "immediate_confirmation"
  | "post_event_follow_up"
  | "exhibitor_delivery"
  | "daily_report";
export type FairEmailDeliveryStatus = "queued" | "sent" | "failed" | "suppressed";
/** B0 design: HANDOFF §5.5 names fairPassportConfigs without fields. */
export type FairPassportConfigStatus = "draft" | "published" | "withdrawn";
export type FairPassportEligibleStatus = "required" | "removed";
export type FairReportStatus =
  | "queued"
  | "building"
  | "pending_review"
  | "approved"
  | "sent"
  | "failed";
export type FairReportFormat = "pdf" | "xlsx" | "csv";
export type FairSponsoredSnapshotStatus = "draft" | "published" | "retired";
/**
 * JOVAN-DELTA §2: only the garage sponsored strip writes events. The map and
 * the fair displays never write a sponsored event (no impressions anywhere).
 */
export type FairSponsoredActionSurface = "garage";
export type FairSponsoredActionKind = "open_model" | "garage_add";
/** MASTER §4.6: absent on a stored account means "standard". */
export type FairClientSegment = "standard" | "event_only";

export type FairRatingMode = "none" | "overall" | "dimensions";
/** Advanced replaces the Starter overall rating with these three (§4.1). */
export const FAIR_RATING_DIMENSIONS = ["appearance", "specifications", "price"] as const;
export type FairRatingDimension = (typeof FAIR_RATING_DIMENSIONS)[number];
export type FairRatingValue = 1 | 2 | 3 | 4 | 5;

// -----------------------------------------------------------------------------
// Constants (business values come from MASTER/HANDOFF; technical caps are
// marked as such)
// -----------------------------------------------------------------------------

export const FAIR_EVENT_TIMEZONE = "Europe/Belgrade";
/** Audience and brand-favorite results become public from 5 votes (MASTER §9.1, §11). */
export const FAIR_PUBLIC_VOTE_THRESHOLD = 5;
/** At most four specifications per model carry `isHighlight` (JOVAN-DELTA §3). */
export const FAIR_MAX_HIGHLIGHT_SPECIFICATIONS = 4;
/** Technical cap on one model's specification list (bounded document array). */
export const FAIR_MAX_SPECIFICATIONS_PER_MODEL = 100;
/** Bounded public read of garage model IDs (HANDOFF §7 getModelsByIds). */
export const FAIR_MAX_MODEL_IDS_PER_READ = 50;
/** Same names and values as lib/fair-client/rotation-slot.ts (MASTER §10). */
export const FAIR_MAP_ROTATION_INTERVAL_MS = 12_000;
export const FAIR_GARAGE_ROTATION_INTERVAL_MS = 8_000;
/** Survey has at most five questions (MASTER §9.2). */
export const FAIR_SURVEY_MAX_QUESTIONS = 5;
/** Audience question options: at least 2 (HANDOFF §5.3), at most 5 (DATA-INTAKE §6.5). */
export const FAIR_AUDIENCE_OPTIONS_MIN = 2;
export const FAIR_AUDIENCE_OPTIONS_MAX = 5;
export const FAIR_RATING_MIN = 1;
export const FAIR_RATING_MAX = 5;
/**
 * PII purge moment for both events: 16 November 2026 at 00:00 Europe/Belgrade
 * (CET, UTC+1) = 2026-11-15T23:00:00Z. MASTER §13 says "16. novembra"; the
 * start of that day is the conservative reading — open question in
 * FAIR-BACKEND-CONTRACT.md. Purge/cookie expiry use this one value.
 */
export const FAIR_PII_PURGE_AT_MS = Date.UTC(2026, 10, 15, 23, 0, 0);

/** `dateKey` is the event-local calendar day, `YYYY-MM-DD` in Europe/Belgrade. */
export const FAIR_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** `hourKey` is the event-local hour, `YYYY-MM-DDTHH` (24h) in Europe/Belgrade. */
export const FAIR_HOUR_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}$/;
/** Server-computed visitor hash: lowercase 64-char hex (HANDOFF §4.2). */
export const FAIR_VISITOR_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isFairVisitorHash(value: string): boolean {
  return FAIR_VISITOR_HASH_PATTERN.test(value);
}

export function isFairRatingValue(value: number): value is FairRatingValue {
  return Number.isInteger(value) && value >= FAIR_RATING_MIN && value <= FAIR_RATING_MAX;
}

/** Absent segment is "standard" (widen phase, HANDOFF §5.1). */
export function fairClientSegmentOf(segment: FairClientSegment | undefined): FairClientSegment {
  return segment ?? "standard";
}

// -----------------------------------------------------------------------------
// Entitlements and capabilities
// -----------------------------------------------------------------------------

/** One row per right of HANDOFF §4.1; the catalog lives in lib/fair-entitlements.ts. */
export type FairEntitlements = {
  /** javna stranica modela */
  publicModelPage: boolean;
  /** čuvanje/poređenje u lokalnoj garaži */
  garage: boolean;
  /** ukupna i jedinstvena skeniranja štanda */
  standScanTotals: boolean;
  /** analitika po modelu */
  modelAnalytics: boolean;
  /** ukupna ocena (Starter) ili tri dimenzije (Advanced) */
  ratingMode: FairRatingMode;
  /** `Zainteresovan sam` */
  interest: boolean;
  /** Glas publike po sajamskom danu: 0 / 1 / 5 */
  audienceQuestionsPerDay: 0 | 1 | 5;
  /** dnevni presek */
  dailyReport: boolean;
  /** prijava za probnu vožnju */
  testDrive: boolean;
  /** dodatna anketa */
  survey: boolean;
  /** automatizovani follow-up posle sajma */
  postEventFollowUp: boolean;
  /** sponzorisana rotacija mapa/displeji */
  sponsoredMapRotation: boolean;
  /** sponzorisana rotacija u garaži */
  sponsoredGarageRotation: boolean;
  /** model's tier may count toward a brand passport (MASTER §11: Starter+) */
  passportEligibleTier: boolean;
};

/**
 * Server-projected rights of one published model. Field names match the
 * frontend fixture (lib/fair-client/model-fixtures.ts) on purpose.
 */
export type FairModelCapabilities = {
  ratingMode: FairRatingMode;
  canSubmitInterest: boolean;
  canRequestTestDrive: boolean;
  hasAudienceQuestions: boolean;
  hasSurvey: boolean;
  isSponsored: boolean;
};

// -----------------------------------------------------------------------------
// Public read views
// -----------------------------------------------------------------------------

export type FairPublicEventDay = {
  id: string;
  dateKey: string;
  label: string;
  startsAt: number;
  endsAt: number;
  sortOrder: number;
};

export type FairPublicEvent = {
  id: string;
  code: string;
  slug: string;
  title: string;
  venueName: string;
  timezone: typeof FAIR_EVENT_TIMEZONE;
  startsAt: number;
  endsAt: number;
  status: FairEventStatus;
  garagePriority: number;
  days: FairPublicEventDay[];
};

export type FairSpecificationItem = {
  id: string;
  label: string;
  value: string;
  order: number;
  isHighlight: boolean;
};

export type FairSpecificationGroup = {
  id: string;
  label: string;
  order: number;
  items: FairSpecificationItem[];
};

/** HANDOFF §6 minimum, plus `eventTitle` (from fairEvents.title). */
export type FairPublicModel = {
  id: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  participationId: string;
  exhibitorName: string;
  brandId: string;
  brandName: string;
  standId: string;
  standMapLocationId: string;
  slug: string;
  displayName: string;
  variant?: string;
  priceText: string;
  /** Group and item order come from the server; never re-sort by label. */
  specificationGroups: FairSpecificationGroup[];
  photoUrl?: string;
  capabilities: FairModelCapabilities;
};

export type FairChoiceOptionView = {
  id: string;
  label: string;
  order: number;
};

export type FairAudienceQuestionView = {
  id: string;
  eventModelId: string;
  dateKey: string;
  prompt: string;
  options: FairChoiceOptionView[];
  order: number;
};

/**
 * Below FAIR_PUBLIC_VOTE_THRESHOLD only the visitor's own choice is returned —
 * never a percentage. Percentages are whole numbers.
 */
export type FairAudienceResultView =
  | { questionId: string; state: "waiting_for_minimum"; myOptionId?: string }
  | {
      questionId: string;
      state: "public";
      options: Array<{ optionId: string; percentage: number }>;
      myOptionId?: string;
    };

/**
 * The visitor's OWN ratings only. Public and visitor projections never carry
 * a rating count, sum, average or threshold (JOVAN-DELTA §1).
 */
export type FairRatingState =
  | { mode: "none" }
  | { mode: "overall"; overall?: FairRatingValue }
  | {
      mode: "dimensions";
      appearance?: FairRatingValue;
      specifications?: FairRatingValue;
      price?: FairRatingValue;
    };

export type FairPassportModelView = {
  eventModelId: string;
  slug: string;
  displayName: string;
  variant?: string;
};

export type FairPassportCatalogEntry = {
  passportId: string;
  eventId: string;
  brandId: string;
  brandName: string;
  brandLogoUrl?: string;
  /** Stands of this brand on the event map (map eligibility marker). */
  standMapLocationIds: string[];
  /** The frozen eligible set (HANDOFF §5.5). */
  models: FairPassportModelView[];
};

export type FairPassportFavoriteResultView =
  | { state: "waiting_for_minimum" }
  | { state: "public"; options: Array<{ eventModelId: string; percentage: number }> };

export type FairPassportProgress = {
  passportId: string;
  stampedModelIds: string[];
  /** N of the visitor's N/M */
  stampedCount: number;
  /** M of the visitor's N/M */
  requiredCount: number;
  completed: boolean;
  /** Changeable after completion (MASTER §11). */
  favoriteModelId?: string;
  favoriteResult?: FairPassportFavoriteResultView;
};

/** One projection for model page, garage and map (JOVAN-DELTA §3). */
export type FairPassportState = {
  eventId: string;
  catalog: FairPassportCatalogEntry[];
  progress: FairPassportProgress[];
};

/** Photo first; otherwise brand logo, otherwise the neutral event placeholder (MASTER §10). */
export type FairSponsoredVisual = "photo" | "brand_logo" | "event_placeholder";

export type FairSponsoredModelCard = {
  eventModelId: string;
  eventId: string;
  eventSlug: string;
  slug: string;
  brandId: string;
  brandName: string;
  displayName: string;
  variant?: string;
  priceText: string;
  visual: FairSponsoredVisual;
  photoUrl?: string;
  brandLogoUrl?: string;
  standMapLocationId: string;
  /** Position in the published snapshot (fairSponsoredSnapshotItems.order). */
  order: number;
  /** Map/display only: the admin-selected audience question and its result. */
  audienceResult?: {
    questionId: string;
    prompt: string;
    options: FairChoiceOptionView[];
    result: FairAudienceResultView;
  };
};

/**
 * Read-only rotation of the manually published Advanced snapshot. `items` are
 * already in snapshot order, so the client can call
 * `getFairRotationSlot({ epochMs, nowMs, intervalMs, itemCount: items.length })`
 * from lib/fair-client/rotation-slot.ts and every display shows the same slot.
 * No impression is ever recorded for this view.
 */
export type FairSponsoredRotationView = {
  surface: "map" | "garage";
  eventId: string;
  snapshotId: string;
  version: number;
  dayKey: string;
  seed: string;
  epochMs: number;
  intervalMs: number;
  items: FairSponsoredModelCard[];
};

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Stable error codes. The first seven come from HANDOFF §6 and
 * _ZAJEDNICKO §3; the rest are B0 additions the §12 tests need.
 */
export const FAIR_ERROR_CODES = [
  "FAIR_MODEL_NOT_FOUND",
  "FEATURE_NOT_ENTITLED",
  "CONSENT_REQUIRED",
  "CONSENT_NOT_CONFIGURED",
  "RATE_LIMITED",
  "SUBMISSION_DUPLICATE",
  "EVENT_NOT_ACTIVE",
  "INVALID_INPUT",
  "CONTACT_REQUIREMENT_NOT_MET",
  "QUESTION_NOT_OPEN",
  "SURVEY_ALREADY_SUBMITTED",
  "PASSPORT_NOT_COMPLETE",
] as const;
export type FairErrorCode = (typeof FAIR_ERROR_CODES)[number];

/** Non-PII details only: never a token, hash, contact value or free text from a visitor. */
export type FairErrorDetails = Record<string, string | number | boolean>;

export type FairResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: FairErrorCode; details?: FairErrorDetails };
