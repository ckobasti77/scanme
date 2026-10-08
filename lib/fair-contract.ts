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

/**
 * N3 — the one category of an exhibitor for the map filter (NOC-KONTEKST §3,
 * odluka vlasnika 8. 10.). Stored on `fairParticipations.category`.
 */
export const FAIR_EXHIBITOR_CATEGORIES = ["automobili", "moto", "energija", "usluge", "hrana", "ostalo", "scanme"] as const;
export type FairExhibitorCategory = (typeof FAIR_EXHIBITOR_CATEGORIES)[number];

/** N3 — the zones of a fair map (lib/fair-map); `zadnji-deo` exists only where the organizer draws it. */
export const FAIR_MAP_ZONE_IDS = ["hala", "ispred", "zadnji-deo"] as const;
export type FairMapZoneIdValue = (typeof FAIR_MAP_ZONE_IDS)[number];

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
/** K3 `skipped`: a lead email whose hard switch was off at claim time; closed, never sent. */
export type FairEmailDeliveryStatus = "queued" | "sent" | "failed" | "suppressed" | "skipped";
/** B0 design: HANDOFF §5.5 names fairPassportConfigs without fields. */
export type FairPassportConfigStatus = "draft" | "published" | "withdrawn";
export type FairPassportEligibleStatus = "required" | "removed";
/**
 * Admin UX A7 — why a brand does not meet the passport condition (MASTER §11,
 * `fairBrandPassportProblems` in lib/fair-entitlements.ts).
 */
export type FairBrandPassportProblem =
  | "fewer_than_two_models"
  | "model_not_published"
  | "model_not_candidate"
  | "model_below_starter"
  | "multiple_exhibitors";
/**
 * Admin UX A7 — where a model's lead form setting comes from: the exhibitor's
 * default (`fairParticipationLeadDefaults`, applied in one move) or the
 * model's own exception. A row without the field predates A7 and is an exception.
 */
export type FairLeadConfigSource = "default" | "override";
export type FairReportStatus =
  | "queued"
  | "building"
  | "pending_review"
  | "approved"
  | "sent"
  | "failed";
export type FairReportFormat = "pdf" | "xlsx" | "csv";
/**
 * B6: metric groups of the exhibitor's daily dataset (MASTER §12, HANDOFF §10).
 * Which groups a model gets comes ONLY from `fairReportMetrics(tier)` in
 * lib/fair-entitlements.ts; a group the package lacks is omitted from the
 * dataset, never reported as 0.
 */
export const FAIR_REPORT_METRICS = [
  "stand_scans",
  "model_scans",
  "hourly_scans",
  "day_comparison",
  "interest",
  "test_drive",
  "rating_overall",
  "rating_dimensions",
  "audience",
  "survey",
  "sponsored_garage",
] as const;
export type FairReportMetric = (typeof FAIR_REPORT_METRICS)[number];
/** MASTER §12: the daily dataset is ready at most 60 minutes after the day closes. */
export const FAIR_REPORT_READY_WITHIN_MS = 60 * 60 * 1000;
export type FairSponsoredSnapshotStatus = "draft" | "published" | "retired";
/**
 * Admin UX A9: who published a snapshot — `admin` (manual "Osveži") or `auto`
 * (the system, after a change of the event's published Advanced models).
 * A snapshot without the field predates A9 and was published by an admin.
 */
export type FairSponsoredSnapshotTrigger = "admin" | "auto";
/**
 * JOVAN-DELTA §2: only the garage sponsored strip writes events. The map and
 * the fair displays never write a sponsored event (no impressions anywhere).
 */
export type FairSponsoredActionSurface = "garage";
export type FairSponsoredActionKind = "open_model" | "garage_add";
export type FairShareCollectionStatus = "active" | "expired";
export type FairTrafficKind = "direct_view" | "share_action" | "share_open";
export type FairShareChannel = "native" | "whatsapp" | "viber" | "copy";
/** MASTER §4.6: absent on a stored account means "standard". */
export type FairClientSegment = "standard" | "event_only";

export type FairRatingMode = "none" | "overall" | "dimensions";
/** Advanced replaces the Starter overall rating with these three (§4.1). */
export const FAIR_RATING_DIMENSIONS = ["appearance", "specifications", "price"] as const;
export type FairRatingDimension = (typeof FAIR_RATING_DIMENSIONS)[number];
/** Half-star scale 1–5 in steps of 0.5 (owner decision, 8 Oct 2026; MASTER §7). */
export type FairRatingValue = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

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
export const FAIR_SHARE_COLLECTION_MAX_MODELS = 5;
export const FAIR_SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{24}$/;
/** Survey has at most five questions (MASTER §9.2). */
export const FAIR_SURVEY_MAX_QUESTIONS = 5;
/** Audience question options: at least 2 (HANDOFF §5.3), at most 5 (DATA-INTAKE §6.5). */
export const FAIR_AUDIENCE_OPTIONS_MIN = 2;
export const FAIR_AUDIENCE_OPTIONS_MAX = 5;
export const FAIR_RATING_MIN = 1;
export const FAIR_RATING_MAX = 5;
export const FAIR_RATING_STEP = 0.5;
/**
 * PII purge moment for both events: 16 November 2026 at 00:00 Europe/Belgrade
 * (CET, UTC+1) = 2026-11-15T23:00:00Z. MASTER §13 says "16. novembra"; the
 * start of that day is the conservative reading — open question in
 * FAIR-BACKEND-CONTRACT.md. Purge/cookie expiry use this one value.
 */
export const FAIR_PII_PURGE_AT_MS = Date.UTC(2026, 10, 15, 23, 0, 0);
/**
 * Admin UX A8 — every lead is handed to its exhibitor by the end of
 * 15 November 2026 Europe/Belgrade (MASTER §13): the last millisecond before
 * the purge. Shown as the deadline next to the undelivered leads.
 */
export const FAIR_LEAD_DELIVERY_DEADLINE_MS = FAIR_PII_PURGE_AT_MS - 1;
/**
 * B7: the 16 Nov purge deletes these categories IN THIS ORDER (HANDOFF §5.6,
 * MASTER §13). A row is only deleted after every row that points at it is
 * gone: outbox → leads (contact, consent snapshot, suppression) → the
 * visitor-linkable raw rows → fairVisitors last. Anonymous aggregates
 * (fairMetricCountShards, frozen report datasets) are never a category.
 */
export const FAIR_PURGE_CATEGORIES = [
  "email_deliveries",
  "leads",
  "survey_responses",
  "ratings",
  "audience_votes",
  "brand_favorites",
  "passport_stamps",
  "sponsored_actions",
  "traffic_events",
  "share_collections",
  "unique_scans",
  "scan_events",
  "visitors",
] as const;
export type FairPurgeCategory = (typeof FAIR_PURGE_CATEGORIES)[number];
export type FairPurgeMode = "dry_run" | "execute";
export type FairPurgeTrigger = "cron" | "admin" | "cli";
export type FairPurgeRunStatus = "running" | "completed";
export type FairPurgeCategoryStatus = "pending" | "running" | "done";
/**
 * B7 (§9.44), N5 soft cap: at most this many immediate confirmations to ONE
 * address per window, whatever visitor or model asked for them. A visitor
 * leaving leads at a stand or two in one hour sends ≤ 5; a script cycling fake
 * visitor hashes is held at 10 emails/hour per victim address. N5: a lead
 * above it is still STORED; its confirmation row is `skipped` with
 * `RECIPIENT_CAP` (nothing is sent) and it gets no follow-up.
 */
export const FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT = 10;
/** N5 hard cap: from this many leads with one address per window on, the submit is refused (`RATE_LIMITED`). */
export const FAIR_LEAD_LEADS_PER_RECIPIENT = 30;
export const FAIR_LEAD_RECIPIENT_WINDOW_MS = 60 * 60 * 1000;

/** `dateKey` is the event-local calendar day, `YYYY-MM-DD` in Europe/Belgrade. */
export const FAIR_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** `hourKey` is the event-local hour, `YYYY-MM-DDTHH` (24h) in Europe/Belgrade. */
export const FAIR_HOUR_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}$/;
/** Server-computed visitor hash: lowercase 64-char hex (HANDOFF §4.2). */
export const FAIR_VISITOR_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isFairVisitorHash(value: string): boolean {
  return FAIR_VISITOR_HASH_PATTERN.test(value);
}

/**
 * K1: FAIR_GATEWAY_SECRET — the shared secret only the Next server and the
 * Convex deployment of one environment know. Every visitor-specific fair
 * function refuses a call without it. A shorter configured value counts as
 * missing on both sides (fail closed).
 */
export const FAIR_GATEWAY_SECRET_MIN_LENGTH = 32;

export function isFairRatingValue(value: number): value is FairRatingValue {
  return Number.isInteger(value / FAIR_RATING_STEP) && value >= FAIR_RATING_MIN && value <= FAIR_RATING_MAX;
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

/** M1 map card of one published model (no price, specs or capabilities: the model page has them). */
export type FairPublicMapModel = {
  id: string;
  slug: string;
  displayName: string;
  variant?: string;
};

/** N3 — the public face of an exhibitor on the map: no contact, no package. */
export type FairPublicMapExhibitor = {
  participationId: string;
  exhibitorName: string;
  /** `businesses.logoUrl`, or the URL of the uploaded logo. */
  logoUrl?: string;
  /** `accounts.websiteUrl` (the link the organizer gives). */
  websiteUrl?: string;
  category?: FairExhibitorCategory;
};

/**
 * M1/N3 — one non-withdrawn stand of a non-withdrawn participation, keyed to
 * the map geometry by `mapLocationId` (lib/fair-map). Since N3 every such
 * stand is listed, also without a published model (`brands` is then empty);
 * different exhibitors may share one location. No contacts or package tiers.
 */
export type FairPublicMapStand = {
  participationId: string;
  exhibitorName: string;
  logoUrl?: string;
  websiteUrl?: string;
  category?: FairExhibitorCategory;
  standId: string;
  mapLocationId: string;
  code: string;
  displayName: string;
  /** Published models of this stand, grouped by brand (may be empty). */
  brands: Array<{ brandId: string; brandName: string; models: FairPublicMapModel[] }>;
};

/** N3 — an exhibitor of the event without a stand yet; `zoneId` is the zone the organizer names, if any. */
export type FairPublicMapUnlocatedExhibitor = {
  participationId: string;
  exhibitorName: string;
  logoUrl?: string;
  websiteUrl?: string;
  category?: FairExhibitorCategory;
  zoneId?: FairMapZoneIdValue;
};

export type FairPublicEventMap = {
  eventId: string;
  stands: FairPublicMapStand[];
  exhibitorsWithoutLocation: FairPublicMapUnlocatedExhibitor[];
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

// -----------------------------------------------------------------------------
// B3 — survey and the visitor's own model state (POST gateway only)
// -----------------------------------------------------------------------------

export type FairSurveyQuestionView = {
  id: string;
  prompt: string;
  kind: FairSurveyQuestionKind;
  /** Empty for `yes_no` (answers are "yes" / "no"). */
  options: FairChoiceOptionView[];
  order: number;
};

/** The published survey version of an Advanced model. Never carries results. */
export type FairSurveyView = {
  surveyId: string;
  eventModelId: string;
  version: number;
  title?: string;
  questions: FairSurveyQuestionView[];
};

/** `value` is "yes" | "no" for a `yes_no` question, else the chosen option id. */
export type FairSurveyAnswerInput = { questionId: string; value: string };

export type FairMySurveyState =
  | { state: "none" }
  | { state: "open"; surveyId: string; version: number }
  | { state: "submitted"; surveyId: string; version: number; submittedAt: number };

/**
 * Everything visitor-specific about one model, read through the same-origin
 * POST gateway (never a URL). Only the visitor's OWN rating and choices plus
 * public (≥5-vote) results; no rating aggregate, no other visitor's state.
 */
export type FairMyModelState = {
  eventModelId: string;
  rating: FairRatingState;
  /** Results of the questions this visitor voted on, with `myOptionId`. */
  audience: FairAudienceResultView[];
  survey: FairMySurveyState;
  /** Progress in the model's brand passport, when it is a required member of a published one. */
  passport: FairPassportProgress | null;
};

/** `submitSurvey` result; `duplicate` = the same submissionId was already stored. */
export type FairSurveySubmitResult = {
  surveyId: string;
  version: number;
  submittedAt: number;
  duplicate: boolean;
};

/** Client-generated idempotency key of a survey submit (and later a lead). */
export const FAIR_SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function isFairSubmissionId(value: string): boolean {
  return FAIR_SUBMISSION_ID_PATTERN.test(value);
}

// -----------------------------------------------------------------------------
// B4 — leads (`Zainteresovan sam`, `Probna vožnja`) and email (HANDOFF §4.4, §5.4)
// -----------------------------------------------------------------------------

/**
 * `fairConsentConfigs` is per event and lead kind, but the consent must name
 * the concrete exhibitor (MASTER §8). The admin-entered text carries this
 * token; the server replaces it with the exhibitor's business name in the
 * shown text and in the stored `consentTextSnapshot`. Activation requires it.
 */
export const FAIR_CONSENT_EXHIBITOR_PLACEHOLDER = "{izlagac}";

/**
 * K3: activation records who did the expert legal review of the text
 * (`legalApprovedBy`, a person or firm, at most this many characters) and
 * when (`legalApprovedAt`, not in the future). Both are entered by the admin.
 */
export const FAIR_CONSENT_LEGAL_APPROVER_MAX = 120;

/** Technical caps of the lead form fields. */
export const FAIR_LEAD_NAME_MAX = 120;
export const FAIR_LEAD_EMAIL_MAX = 254;
export const FAIR_LEAD_PHONE_MAX = 32;

// -----------------------------------------------------------------------------
// N5 — normalization and validation of the lead fields. One implementation for
// Convex (convex/lib/fairLeads.ts `normalizeFairLeadContact`, authoritative)
// and Next (the form validates with the same functions before sending). A
// refusal is `INVALID_INPUT` with `details: { field, reason }` — never the value.
// -----------------------------------------------------------------------------

export type FairLeadInputField = "contactName" | "email" | "phone";
export const FAIR_LEAD_INPUT_REASONS = [
  "empty",
  "too_long",
  /** URL, `www.`, `@` or a domain in the name. */
  "link",
  /** Bidi, zero-width or control characters in the name. */
  "invisible",
  /** Anything but letters, spaces, `.`, `,`, `'`, `-` and at most 3 digits in the name. */
  "characters",
  /** Email or phone that cannot be normalized. */
  "format",
] as const;
export type FairLeadInputReason = (typeof FAIR_LEAD_INPUT_REASONS)[number];

/** A name is at most this many words and digits (no sentence, no phone number). */
export const FAIR_LEAD_NAME_MAX_WORDS = 6;
export const FAIR_LEAD_NAME_MAX_DIGITS = 3;
/** Country code assumed for a national number written with the trunk 0 (`06x…`, `011…`). */
export const FAIR_LEAD_PHONE_DEFAULT_COUNTRY = "381";

// C0/C1 controls, soft hyphen, Arabic letter mark, Hangul fillers, Khmer and
// Mongolian invisibles, zero-width and LRM/RLM (U+200B–U+200F), line/paragraph
// separators and bidi embeddings/overrides (U+2028–U+202E), word joiner,
// invisible operators and bidi isolates (U+2060–U+206F), variation selectors,
// BOM, interlinear annotations and tag characters.
const FAIR_INVISIBLE_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]|[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/u;
// `@`, a scheme, `www.` or a domain-like token (`bit.ly`, `x.com`); the top
// level is ASCII letters, so `M. Petrović` and `J.Petrović` stay names.
const FAIR_LINK_PATTERN = /@|:\/\/|www\.|(?:^|[^\p{L}\p{N}])[\p{L}\p{N}-]+\.[a-z]{2,24}(?![\p{L}\p{N}])/iu;
const FAIR_NAME_PATTERN = /^[\p{L}\p{M}0-9 .,'’-]+$/u;
const FAIR_LETTER_PATTERN = /\p{L}/u;

const digitCount = (value: string) => value.replace(/[^0-9]/g, "").length;

/**
 * What makes a name risky to repeat in an email (a link, invisible
 * characters or a phone-like digit run), or null. The email builder drops
 * such a name from the greeting even if it was stored before N5.
 */
export function fairLeadNameRisk(name: string): "link" | "invisible" | "characters" | null {
  if (FAIR_INVISIBLE_PATTERN.test(name)) return "invisible";
  if (FAIR_LINK_PATTERN.test(name)) return "link";
  return digitCount(name) > FAIR_LEAD_NAME_MAX_DIGITS ? "characters" : null;
}

/** Trimmed name with collapsed spaces, or the reason it is refused. */
export function normalizeFairLeadName(raw: string): { ok: true; value: string } | { ok: false; reason: FairLeadInputReason } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  // Checked before collapsing whitespace, so a zero-width or bidi character can never hide as a space.
  if (FAIR_INVISIBLE_PATTERN.test(trimmed)) return { ok: false, reason: "invisible" };
  const value = trimmed.replace(/\s+/g, " ");
  const risk = fairLeadNameRisk(value);
  if (risk) return { ok: false, reason: risk };
  if (!FAIR_NAME_PATTERN.test(value) || !FAIR_LETTER_PATTERN.test(value)) return { ok: false, reason: "characters" };
  if (value.length > FAIR_LEAD_NAME_MAX || value.split(" ").length > FAIR_LEAD_NAME_MAX_WORDS) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}

const FAIR_EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const FAIR_EMAIL_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Trimmed, lowercase address (stored on the lead and used as the outbox
 * recipient), or null: one `@`, a dot-atom local part of ≤ 64 characters and
 * an ASCII/punycode domain with at least two labels and a real top level.
 */
export function normalizeFairLeadEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value || value.length > FAIR_LEAD_EMAIL_MAX) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return null;
  const local = value.slice(0, at);
  return local.length <= 64 && FAIR_EMAIL_LOCAL_PATTERN.test(local) && FAIR_EMAIL_DOMAIN_PATTERN.test(value.slice(at + 1)) ? value : null;
}

export function isFairLeadEmail(value: string): boolean {
  return normalizeFairLeadEmail(value) !== null;
}

/**
 * E.164 (`+381641234567`) or null. Separators (space ( ) . / -) are dropped;
 * `+…` and `00…` are international, a leading 0 is the Serbian trunk prefix
 * (`064…`, `011…` → +381). A trunk 0 written after +381 (`+381 (0)64…`) is
 * dropped. A number without `+`, `00` or `0` is refused: it may be a local
 * number without its 0 or a foreign one without its code, and a guessed
 * number would hand the exhibitor a wrong contact. +381: 7–10 national
 * digits; any number: 8–15 digits in total (E.164).
 */
export function normalizeFairLeadPhone(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > FAIR_LEAD_PHONE_MAX || !/^\+?[0-9 ()./-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (!value.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `${FAIR_LEAD_PHONE_DEFAULT_COUNTRY}${digits.slice(1)}`;
    else return null;
  }
  if (digits.startsWith(`${FAIR_LEAD_PHONE_DEFAULT_COUNTRY}0`)) digits = `${FAIR_LEAD_PHONE_DEFAULT_COUNTRY}${digits.slice(4)}`;
  if (digits.startsWith("0") || digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith(FAIR_LEAD_PHONE_DEFAULT_COUNTRY)) {
    const national = digits.length - FAIR_LEAD_PHONE_DEFAULT_COUNTRY.length;
    if (national < 7 || national > 10) return null;
  }
  return `+${digits}`;
}

export function isFairLeadPhone(value: string): boolean {
  return normalizeFairLeadPhone(value) !== null;
}

/**
 * The missing part of a contact requirement, or null when it is met. Base
 * rule (`one_of`): at least one of email/phone. `preferredContact` never makes
 * a field mandatory (HANDOFF §4.4).
 */
export function fairContactRequirementProblem(
  requirement: FairContactRequirement,
  contact: { email?: string; phone?: string },
): FairContactRequirement | null {
  const email = Boolean(contact.email);
  const phone = Boolean(contact.phone);
  const met =
    requirement === "one_of" ? email || phone
    : requirement === "email" ? email
    : requirement === "phone" ? phone
    : email && phone;
  return met ? null : requirement;
}

/** Public lead form of one model and kind. No PII; consent text is server-rendered. */
export type FairLeadFormView =
  | { eventModelId: string; kind: FairLeadKind; state: "unavailable" }
  /** K3 hard switch: FAIR_LEADS_ENABLED is not "true" on Convex → no form, nothing is stored. */
  | { eventModelId: string; kind: FairLeadKind; state: "leads_disabled" }
  /** Production gate: no active consent version → the form must not collect contacts. */
  | { eventModelId: string; kind: FairLeadKind; state: "consent_not_configured" }
  | {
      eventModelId: string;
      kind: FairLeadKind;
      state: "open";
      contactRequirement: FairContactRequirement;
      preferredContact?: FairPreferredContact;
      /** The browser shows `text` and sends back `version` with `consentAccepted: true`. */
      consent: { version: number; text: string };
    };

/** Body of `POST /api/fair/lead`. `submissionId` is the client idempotency key (FAIR_SUBMISSION_ID_PATTERN). */
export type FairLeadSubmitInput = {
  eventModelId: string;
  kind: FairLeadKind;
  submissionId: string;
  contactName: string;
  email?: string;
  phone?: string;
  consentAccepted: boolean;
  consentVersion: number;
};

/** `submitLead` result. Never carries a contact value. */
export type FairLeadSubmitResult = {
  eventModelId: string;
  kind: FairLeadKind;
  submittedAt: number;
  /**
   * The same submissionId was already stored, or (N5) this visitor already
   * sent this kind for this model: the stored lead is returned and nothing new
   * was written or sent.
   */
  duplicate: boolean;
  /** One immediate confirmation email is queued (an email was given and, N5, the address is under its soft cap). */
  confirmationEmail: boolean;
  /** Advanced: the one post-fair follow-up is scheduled for this lead. */
  followUpScheduled: boolean;
};

/**
 * Stable `fairEmailDeliveries.lastError` prefixes (an HTTP status or `network`
 * may follow after `:`). Never a provider message, address or secret.
 */
export const FAIR_EMAIL_DELIVERY_ERRORS = [
  "RESEND_NOT_CONFIGURED",
  "FOLLOW_UP_TEMPLATE_MISSING",
  "LEAD_MISSING",
  "PROVIDER_REJECTED",
  "PROVIDER_UNAVAILABLE",
  // B6 — daily report: the run was no longer approved/sent or its file was gone at claim time
  "REPORT_NOT_SENDABLE",
  "REPORT_FILE_MISSING",
  // K3 — a hard switch was off at claim time: the row is closed as `skipped`, nothing is sent
  "LEADS_DISABLED",
  "FOLLOW_UP_DISABLED",
  // Admin UX A8 — one follow-up per (visitor email, exhibitor): this row's pair is sent by another row
  "FOLLOW_UP_MERGED",
  // N5 — soft cap per address (FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT): the lead is stored, its confirmation is `skipped`
  "RECIPIENT_CAP",
] as const;
export type FairEmailDeliveryError = (typeof FAIR_EMAIL_DELIVERY_ERRORS)[number];

/**
 * Admin UX A8 — merge fields of the exhibitor's follow-up text (ADMIN-UX §7),
 * written as `{ime}` in the subject or the text. Anything else in braces is
 * refused when the text is saved (FAIR_FOLLOWUP_UNKNOWN_FIELD).
 *   ime — the visitor's name from the lead; izlagac — the exhibitor;
 *   dogadjaj — the event; modeli — the exhibitor's models the visitor left a
 *   lead for; modeli_zainteresovan / modeli_probna_voznja — by lead kind;
 *   modeli_ocenjeni — the exhibitor's models the visitor rated, only where
 *   the model's package has ratings.
 */
export const FAIR_FOLLOW_UP_FIELDS = ["ime", "izlagac", "dogadjaj", "modeli", "modeli_zainteresovan", "modeli_probna_voznja", "modeli_ocenjeni"] as const;
export type FairFollowUpField = (typeof FAIR_FOLLOW_UP_FIELDS)[number];
/** Same limits as the B4 per-model text (plain text only; HTML comes from the ScanMe email template). */
export const FAIR_FOLLOW_UP_SUBJECT_MAX = 150;
export const FAIR_FOLLOW_UP_TEXT_MAX = 5000;
export type FairFollowUpTemplateStatus = "draft" | "active" | "retired";

/**
 * Admin UX A8 — the groups of a visitor's activity on ONE exhibitor's models
 * shown next to a lead (ADMIN-UX §7). Whether a group goes to the exhibitor
 * is decided by lib/fair-entitlements.ts (fairLeadActivityShared).
 */
export const FAIR_LEAD_ACTIVITY_GROUPS = ["scans", "ratings", "audienceVotes", "surveyAnswers", "passport", "sponsoredActions"] as const;
export type FairLeadActivityGroup = (typeof FAIR_LEAD_ACTIVITY_GROUPS)[number];

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

/**
 * Body of `POST /api/fair/sponsored-action`: one explicit action in the garage
 * sponsored strip (`Pogledaj` = open_model, `Dodaj u garažu` = garage_add).
 * `requestId` is the client idempotency key (FAIR_SUBMISSION_ID_PATTERN). Never
 * a QR scan; the garage itself stays in the browser.
 */
export type FairSponsoredActionInput = {
  eventModelId: string;
  surface: FairSponsoredActionSurface;
  kind: FairSponsoredActionKind;
  requestId: string;
};

/** `recordSponsoredAction` result: no metric, no visitor data. */
export type FairSponsoredActionResult = {
  eventModelId: string;
  kind: FairSponsoredActionKind;
  recordedAt: number;
  /** The same requestId was already stored; nothing new was written. */
  duplicate: boolean;
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
  // B2 — the same-origin POST gateway (app/api/fair/**), HANDOFF §4.2.
  "ORIGIN_NOT_ALLOWED",
  "PAYLOAD_TOO_LARGE",
  "VISITOR_UNAVAILABLE",
  // B3 — interactions.
  "PASSPORT_NOT_ACTIVE",
  "SURVEY_NOT_OPEN",
  // B3 gateway: Convex was unreachable or answered without a stable code.
  "SERVICE_UNAVAILABLE",
  // K1 — Next → Convex gateway secret. Convex throws these before reading or
  // writing anything; the Next gateway shows the browser SERVICE_UNAVAILABLE.
  "FAIR_GATEWAY_NOT_CONFIGURED",
  "FAIR_GATEWAY_UNAUTHORIZED",
  // K3 — FAIR_LEADS_ENABLED is not "true": submitLead stores nothing.
  "LEADS_DISABLED",
] as const;
export type FairErrorCode = (typeof FAIR_ERROR_CODES)[number];

/**
 * Non-PII details only: never a token, hash, contact value or free text from
 * a visitor. N5: the Next gateway passes on to the browser only `field`,
 * `required`, `reason` (FAIR_LEAD_INPUT_REASONS) and `retryAfterMs`
 * (lib/fair-server/interactions.ts `fairPublicErrorDetails`).
 */
export type FairErrorDetails = Record<string, string | number | boolean>;

export type FairResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: FairErrorCode; details?: FairErrorDetails };

// -----------------------------------------------------------------------------
// B1 — admin catalog, import and QR assignment
// -----------------------------------------------------------------------------

/** Stored `priceText` fallback when no confirmed price exists (HANDOFF §5.1, DATA-INTAKE §6.3). */
export const FAIR_PRICE_ON_REQUEST_TEXT = "Cena na upit";

/** The only import format version the backend accepts (HANDOFF §8). */
export const FAIR_IMPORT_VERSION = 1;
/** One import is one transaction; these caps keep it inside Convex limits. */
export const FAIR_IMPORT_MAX_PARTICIPATIONS = 100;
export const FAIR_IMPORT_MAX_MODELS = 200;
/** Bounded admin catalog reads per event (two fairs × ~100 models fit easily). */
export const FAIR_ADMIN_LIST_LIMIT = 500;

/** A4 — a change of a QR's destination (reassign) needs a reason of this length. */
export const FAIR_QR_REASON_MIN_LENGTH = 3;
export const FAIR_QR_REASON_MAX_LENGTH = 300;
/** A4 — rows of one bulk QR assignment (dry run and commit); one commit stays inside the Convex transaction limits. */
export const FAIR_QR_BULK_MAX_ROWS = 100;
/** A4 — assignment history rows shown on the QR detail (newest first). */
export const FAIR_QR_HISTORY_LIMIT = 50;
/** A4 — cards per getQrScanStats call. */
export const FAIR_QR_SCAN_STATS_MAX = 100;
/** N1 — a field link (fairAdminQr.linkSticker) can be undone this long after it was made. */
export const FAIR_QR_UNDO_WINDOW_MS = 15 * 60 * 1000;
/** N1 — rows of fairAdminQr.listRecentLinks. */
export const FAIR_QR_RECENT_LINKS_MAX = 20;
/** N1 — an inventory QR is a car sticker (never linked or a fair model QR) or a panel with its own URL. */
export const FAIR_QR_KINDS = ["sticker", "panel"] as const;
export type FairQrKind = (typeof FAIR_QR_KINDS)[number];

/** Stable `externalKey`: lowercase ASCII, digits and single hyphens (DATA-INTAKE §4). */
export const FAIR_EXTERNAL_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Public model slug: same alphabet as the external key, at most 80 characters. */
export const FAIR_SLUG_MAX_LENGTH = 80;

/**
 * Stable codes of admin/import validation issues. Errors block the write;
 * warnings never invent data (missing price → fallback text, missing photo →
 * frontend placeholder). Text is mapped by the admin UI through lib/i18n.
 */
export const FAIR_ADMIN_ISSUE_CODES = [
  "INVALID_INPUT",
  "FAIR_MODEL_NOT_FOUND",
  "FAIR_EVENT_NOT_FOUND",
  "FAIR_IMPORT_VERSION_UNSUPPORTED",
  "FAIR_IMPORT_TOO_LARGE",
  "FAIR_LINK_NOT_FOUND",
  "FAIR_LINK_CONFLICT",
  "FAIR_CLIENT_SEGMENT_MISMATCH",
  "FAIR_CLIENT_CODE_TAKEN",
  "FAIR_NOT_EVENT_ONLY",
  "FAIR_DUPLICATE_KEY",
  "FAIR_SLUG_TAKEN",
  "FAIR_MAP_LOCATION_INVALID",
  "FAIR_MAP_LOCATION_TAKEN",
  "FAIR_SPECIFICATIONS_INVALID",
  "FAIR_HIGHLIGHT_LIMIT",
  "FAIR_PACKAGE_DOWNGRADE",
  "FAIR_PACKAGE_SAME_TIER",
  "FAIR_PACKAGE_CHANGE_REQUIRES_UPGRADE",
  "FAIR_PUBLISH_INVALID",
  "FAIR_QR_INVENTORY_NOT_CONFIGURED",
  "FAIR_QR_NOT_IN_INVENTORY",
  "FAIR_QR_ALREADY_ASSIGNED",
  "FAIR_MODEL_ALREADY_ASSIGNED",
  "FAIR_QR_SUBJECT_SHARED",
  "FAIR_QR_NOT_ASSIGNED",
  // A4 — QR detail, change of destination (reassign) and bulk assignment
  "FAIR_QR_NOT_FOUND",
  "FAIR_QR_OTHER_EVENT",
  "FAIR_QR_SAME_TARGET",
  "FAIR_MODEL_OTHER_EVENT",
  "FAIR_REASON_REQUIRED",
  "FAIR_BULK_TOO_LARGE",
  "FAIR_BULK_ROW_INVALID",
  "FAIR_BULK_DUPLICATE_CODE",
  "FAIR_BULK_DUPLICATE_MODEL",
  // N1 — field linking of stickers: a panel is no car sticker, a withdrawn
  // model or participation takes no new link, the sticker moved since the
  // admin saw it, and the undo window / an undo after a later change
  "FAIR_QR_NOT_MODEL_STICKER",
  "FAIR_MODEL_WITHDRAWN",
  "FAIR_QR_HOLDER_CHANGED",
  "FAIR_QR_UNDO_EXPIRED",
  "FAIR_QR_UNDO_SUPERSEDED",
  // B3 — Glas publike, survey and passport admin commands
  "FAIR_FEATURE_NOT_ENTITLED",
  "FAIR_EVENT_DAY_NOT_FOUND",
  "FAIR_QUESTION_NOT_FOUND",
  "FAIR_QUESTION_LOCKED",
  "FAIR_QUESTION_DAY_LIMIT",
  "FAIR_QUESTION_STATUS",
  "FAIR_SURVEY_NOT_FOUND",
  "FAIR_SURVEY_INVALID",
  "FAIR_SURVEY_LOCKED",
  "FAIR_PASSPORT_NOT_FOUND",
  "FAIR_PASSPORT_NOT_ELIGIBLE",
  "FAIR_PASSPORT_FROZEN",
  "FAIR_PASSPORT_EVENT_STARTED",
  // B4 — consent, lead settings, follow-up text, leads and the email outbox
  "FAIR_CONSENT_NOT_FOUND",
  "FAIR_CONSENT_STATUS",
  "FAIR_CONSENT_EXHIBITOR_MISSING",
  // K3 — activation needs the legal approval record (legalApprovedBy + legalApprovedAt)
  "FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED",
  "FAIR_LEAD_NOT_FOUND",
  // Admin UX A7 — "vrati na podrazumevano" without an exhibitor default
  "FAIR_LEAD_DEFAULT_MISSING",
  "FAIR_EMAIL_DELIVERY_NOT_FOUND",
  "FAIR_EMAIL_DELIVERY_STATUS",
  // Admin UX A8 — the exhibitor's follow-up text (merge fields, draft → active → retired)
  "FAIR_FOLLOWUP_UNKNOWN_FIELD",
  "FAIR_FOLLOWUP_NOT_FOUND",
  "FAIR_FOLLOWUP_STATUS",
  // B5 — sponsored snapshot (more Advanced models than one snapshot holds)
  "FAIR_SPONSORED_LIMIT",
  // B6 — report runs and exports
  "FAIR_REPORT_NOT_FOUND",
  "FAIR_REPORT_STATUS",
  "FAIR_REPORT_NOT_APPROVED",
  "FAIR_REPORT_RECIPIENT_MISSING",
  "FAIR_REPORT_EXPORT_TOO_LARGE",
  // K4 — a manual build before the day's close (fairEventDays.endsAt) is refused
  "FAIR_DAY_NOT_CLOSED",
  // JOVAN-DELTA 2026-10-08b — "Resetuj pre-event podatke": the typed
  // confirmation is missing, or the data changed since the dry run
  "FAIR_PRE_EVENT_RESET_CONFIRM",
  "FAIR_PRE_EVENT_RESET_STALE",
  // Warnings
  "FAIR_PRICE_MISSING",
  "FAIR_PHOTO_MISSING",
  "FAIR_QR_MISSING",
  // N1 — a withdrawn model keeps its sticker link; withdrawModel reports it
  "FAIR_QR_STILL_LINKED",
] as const;
export type FairAdminIssueCode = (typeof FAIR_ADMIN_ISSUE_CODES)[number];

export type FairAdminIssue = {
  severity: "error" | "warning";
  code: FairAdminIssueCode;
  /** Location in the import payload or entity, e.g. `participations[0].brands[1].models[2]`. */
  path: string;
  details?: FairErrorDetails;
};

/** Public model route opened by `/r/[cardCode]` for an assigned fair QR (B2 resolver fair hook). */
export function fairModelPath(eventSlug: string, modelSlug: string): string {
  return `/sajam/${eventSlug}/model/${modelSlug}`;
}

/** N1 — where `/r/[cardCode]` sends a signed-in admin who scans an unlinked or unpublished sticker („Poveži nalepnicu“). */
/** The fair app privacy page, linked from the fair footers and every consent text. */
export const FAIR_PRIVACY_PATH = "/sajam/privatnost";

export function fairAdminLinkPath(eventSlug: string, cardCode: string): string {
  return `/admin/dogadjaji/${encodeURIComponent(eventSlug)}/povezi?kod=${encodeURIComponent(cardCode)}`;
}

// -----------------------------------------------------------------------------
// Admin UX A10 — the event dashboard (`Događaji → Pregled`,
// convex/fairDashboard.ts getEventDashboard). The backend returns rules,
// tones, numbers and links; the admin builds every sentence in lib/i18n.
// -----------------------------------------------------------------------------

/** pre = before the opening; sajam = opening → close; posle = close → 16 Nov purge; obrisano = after the purge moment. */
export const FAIR_DASHBOARD_PHASES = ["pre", "sajam", "posle", "obrisano"] as const;
export type FairDashboardPhase = (typeof FAIR_DASHBOARD_PHASES)[number];

/** hitno (danger) > uskoro (warning) > info (neutral). */
export const FAIR_DASHBOARD_TONES = ["hitno", "uskoro", "info"] as const;
export type FairDashboardTone = (typeof FAIR_DASHBOARD_TONES)[number];

/** The next deadline the header counts down to. */
export const FAIR_DASHBOARD_DEADLINES = ["opening", "day_end", "day_start", "lead_delivery", "pii_purge"] as const;
export type FairDashboardDeadline = (typeof FAIR_DASHBOARD_DEADLINES)[number];

/** Rules of „Šta treba da uradim“ (A0-IZVESTAJ §6), in their display order within one tone. */
export const FAIR_DASHBOARD_RULES = [
  "qr_inventory_missing",
  "published_without_qr",
  "published_with_errors",
  "drafts_with_errors",
  "price_missing",
  "qr_on_withdrawn",
  "question_missing_today",
  "question_missing_next_day",
  "sponsored_question_missing",
  "advanced_photo_missing",
  "interest_form_without_consent",
  "test_drive_form_without_consent",
  "leads_switch_off",
  "follow_up_switch_off",
  "leads_undelivered",
  "reports_pending_review",
  "reports_failed",
  "reports_missing",
  "follow_up_text_missing",
  "passport_hidden",
  "passport_missing",
  "passport_blocked",
  "sponsored_out_of_date",
  "pii_purge_countdown",
] as const;
export type FairDashboardRule = (typeof FAIR_DASHBOARD_RULES)[number];

/** `Događaji` sections an action opens (`/admin/dogadjaji/<slug>/<section>?<query>`). */
export const FAIR_DASHBOARD_SECTIONS = [
  "modeli",
  "qr",
  "izlagaci",
  // Izlagači 2026: one Interakcije page (exhibitor cards); `dan` / `stanje` mark the exhibitors to look at.
  "interakcije",
  "sponzorisano",
  "leadovi",
  "leadovi/follow-up",
  "leadovi/podesavanja",
  "izvestaji",
  "brisanje",
] as const;
export type FairDashboardSection = (typeof FAIR_DASHBOARD_SECTIONS)[number];

export type FairDashboardAction = {
  rule: FairDashboardRule;
  tone: FairDashboardTone;
  /** Affected models / exhibitors / runs …; for `pii_purge_countdown` the days left. */
  count: number;
  section: FairDashboardSection;
  /** Filters of the section (its query keys, e.g. `{ status: "objavljen", qr: "nema" }`). */
  query: Record<string, string>;
  /** A dated deadline the sentence names (leads: 15 Nov). */
  deadlineAt?: number;
};

export const FAIR_DASHBOARD_TONE_RANK: Readonly<Record<FairDashboardTone, number>> = { hitno: 0, uskoro: 1, info: 2 };

/** hitno → uskoro → info, then the larger count, then the rule order above (A0-IZVESTAJ §6 „Redosled liste“). */
export function sortFairDashboardActions<T extends Pick<FairDashboardAction, "rule" | "tone" | "count">>(actions: readonly T[]): T[] {
  const ruleIndex = (rule: FairDashboardRule) => FAIR_DASHBOARD_RULES.indexOf(rule);
  return [...actions].sort((a, b) =>
    FAIR_DASHBOARD_TONE_RANK[a.tone] - FAIR_DASHBOARD_TONE_RANK[b.tone]
    || b.count - a.count
    || ruleIndex(a.rule) - ruleIndex(b.rule));
}
