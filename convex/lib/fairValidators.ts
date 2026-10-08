import { v } from "convex/values";

// Sajam automobila 2026 — Convex validators for the fair tables (B0,
// BACKEND-HANDOFF §5, JOVAN-DELTA-2026-10-02). Each union mirrors a type in
// lib/fair-contract.ts; convex/fairSchema.test.ts asserts they are identical.
// Rules a Convex validator cannot express (string format, number range, array
// length, cross-field shape) are enforced at write time by the owning
// mutation with the pure helpers in lib/fair-contract.ts / fair-entitlements.ts.

export const fairPackageTier = v.union(
  v.literal("included"),
  v.literal("starter"),
  v.literal("advanced"),
);

export const fairEventStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("live"),
  v.literal("ended"),
  v.literal("archived"),
);

export const fairParticipationStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("withdrawn"),
);

/** N3 — FAIR_EXHIBITOR_CATEGORIES: the exhibitor's one map-filter category. */
export const fairExhibitorCategory = v.union(
  v.literal("automobili"),
  v.literal("moto"),
  v.literal("energija"),
  v.literal("usluge"),
  v.literal("hrana"),
  v.literal("ostalo"),
  v.literal("scanme"),
);

/** N3 — FAIR_MAP_ZONE_IDS. */
export const fairMapZoneId = v.union(v.literal("hala"), v.literal("ispred"), v.literal("zadnji-deo"));

// B0 placeholder (HANDOFF §5.1 names the field without values).
export const fairStandStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("withdrawn"),
);

export const fairModelStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("withdrawn"),
);

export const fairQrAssignmentStatus = v.union(v.literal("assigned"), v.literal("released"));
/** N1 — FAIR_QR_KINDS: a car sticker or a panel with its own URL. */
export const fairQrKind = v.union(v.literal("sticker"), v.literal("panel"));

export const fairAudienceQuestionStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("closed"),
);

// B0 placeholder (HANDOFF §5.3 names the field without values). A published
// version with responses is never edited in place; a new version retires it.
export const fairSurveyStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("retired"),
);

export const fairSurveyQuestionKind = v.union(v.literal("yes_no"), v.literal("single_choice"));

export const fairLeadKind = v.union(v.literal("interest"), v.literal("test_drive"));

export const fairContactRequirement = v.union(
  v.literal("one_of"),
  v.literal("email"),
  v.literal("phone"),
  v.literal("both"),
);

export const fairPreferredContact = v.union(v.literal("email"), v.literal("phone"));

// Admin UX A7 — exhibitor default vs the model's own exception (lib/fair-contract FairLeadConfigSource).
export const fairLeadConfigSource = v.union(v.literal("default"), v.literal("override"));

export const fairConsentStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("retired"),
);

export const fairLeadStatus = v.union(v.literal("received"), v.literal("delivered"));

export const fairMessageTemplateKind = v.union(
  v.literal("immediate_confirmation"),
  v.literal("post_event_follow_up"),
);

export const fairMessageTemplateStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("retired"),
);

export const fairEmailDeliveryKind = v.union(
  v.literal("immediate_confirmation"),
  v.literal("post_event_follow_up"),
  v.literal("exhibitor_delivery"),
  v.literal("daily_report"),
);

export const fairEmailDeliveryStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("suppressed"),
  // K3: closed at claim time because a lead switch was off; never sent.
  v.literal("skipped"),
);

// B0 design (HANDOFF §5.5 names fairPassportConfigs without fields).
export const fairPassportConfigStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("withdrawn"),
);

export const fairPassportEligibleStatus = v.union(v.literal("required"), v.literal("removed"));

// Admin UX A7 — lib/fair-contract FairBrandPassportProblem (fairBrandPassportProblems).
export const fairBrandPassportProblem = v.union(
  v.literal("fewer_than_two_models"),
  v.literal("model_not_published"),
  v.literal("model_not_candidate"),
  v.literal("model_below_starter"),
  v.literal("multiple_exhibitors"),
);

export const fairReportStatus = v.union(
  v.literal("queued"),
  v.literal("building"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("sent"),
  v.literal("failed"),
);

export const fairReportFormat = v.union(v.literal("pdf"), v.literal("xlsx"), v.literal("csv"));

export const fairSponsoredSnapshotStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("retired"),
);

// Admin UX A9: manual ("admin") or system ("auto") publish of a snapshot.
export const fairSponsoredSnapshotTrigger = v.union(v.literal("admin"), v.literal("auto"));

// JOVAN-DELTA §2 narrows HANDOFF §5.7 (`map | display | garage`): only the
// garage strip's explicit actions are written. Map/display never write.
export const fairSponsoredActionSurface = v.literal("garage");

export const fairSponsoredActionKind = v.union(v.literal("open_model"), v.literal("garage_add"));

export const fairShareCollectionStatus = v.union(v.literal("active"), v.literal("expired"));
export const fairTrafficKind = v.union(
  v.literal("direct_view"),
  v.literal("share_action"),
  v.literal("share_open"),
);
export const fairShareChannel = v.union(
  v.literal("native"),
  v.literal("whatsapp"),
  v.literal("viber"),
  v.literal("copy"),
);

// MASTER §4.6 — optional on stored rows; absent means "standard".
export const fairClientSegment = v.union(v.literal("standard"), v.literal("event_only"));

// B7 — the 16 Nov PII purge (FAIR_PURGE_CATEGORIES in lib/fair-contract.ts,
// same order). The audit row holds only these enums, times and row counts.
export const fairPurgeCategory = v.union(
  v.literal("email_deliveries"),
  v.literal("leads"),
  v.literal("survey_responses"),
  v.literal("ratings"),
  v.literal("audience_votes"),
  v.literal("brand_favorites"),
  v.literal("passport_stamps"),
  v.literal("sponsored_actions"),
  v.literal("traffic_events"),
  v.literal("share_collections"),
  v.literal("unique_scans"),
  v.literal("scan_events"),
  v.literal("visitors"),
);
export const fairPurgeMode = v.union(v.literal("dry_run"), v.literal("execute"));
export const fairPurgeTrigger = v.union(v.literal("cron"), v.literal("admin"), v.literal("cli"));
export const fairPurgeRunStatus = v.union(v.literal("running"), v.literal("completed"));
export const fairPurgeCategoryStatus = v.union(v.literal("pending"), v.literal("running"), v.literal("done"));
export const fairPurgeCategoryProgress = v.object({
  category: fairPurgeCategory,
  // Deleted rows (execute) or counted rows (dry_run); never an identifier.
  rows: v.number(),
  status: fairPurgeCategoryStatus,
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
});

// Server-computed HMAC of the visitor token: lowercase 64-char hex, checked
// with isFairVisitorHash before any write. The raw token never reaches Convex.
export const fairVisitorHash = v.string();

// Integer 1–5, checked with isFairRatingValue / fairRatingInputProblem.
export const fairRatingValue = v.number();

// One ordered name–value pair, grouped (JOVAN-DELTA §3). At most
// FAIR_MAX_HIGHLIGHT_SPECIFICATIONS items per model carry isHighlight.
export const fairSpecification = v.object({
  id: v.string(),
  groupId: v.string(),
  groupLabel: v.string(),
  groupOrder: v.number(),
  label: v.string(),
  value: v.string(),
  order: v.number(),
  isHighlight: v.boolean(),
});

// Audience question / survey option. Audience questions need 2–5 options.
export const fairChoiceOption = v.object({
  id: v.string(),
  label: v.string(),
  order: v.number(),
});

// Survey questions are optional individually; a submit needs ≥1 answer.
// `yes_no` questions carry no options (DATA-INTAKE §6.6).
export const fairSurveyQuestion = v.object({
  id: v.string(),
  prompt: v.string(),
  kind: fairSurveyQuestionKind,
  options: v.array(fairChoiceOption),
  required: v.boolean(),
  order: v.number(),
});

// `value` is "yes" | "no" for a yes_no question, else the chosen option id.
export const fairSurveyAnswer = v.object({
  questionId: v.string(),
  value: v.string(),
});

// -----------------------------------------------------------------------------
// fair_model card target guard (HANDOFF §5.1)
// -----------------------------------------------------------------------------

export type FairCardTargetProblem =
  | "fair_model_missing_event_model"
  | "fair_event_model_on_other_kind";

/**
 * A `fair_model` card target must reference its event model, and no other
 * kind may carry `fairEventModelId`. The table validator cannot express this
 * cross-field rule without turning cardTargets into a discriminated union
 * (not additive), so every writer of a fair target calls this guard.
 */
export function fairCardTargetProblem(target: {
  kind: string;
  fairEventModelId?: unknown;
}): FairCardTargetProblem | undefined {
  const hasModel = target.fairEventModelId !== undefined && target.fairEventModelId !== null;
  if (target.kind === "fair_model") {
    return hasModel ? undefined : "fair_model_missing_event_model";
  }
  return hasModel ? "fair_event_model_on_other_kind" : undefined;
}

// -----------------------------------------------------------------------------
// B2 — public read projections (convex/fairPublic.ts). Shapes equal
// FairPublicEvent / FairPublicModel in lib/fair-contract.ts (type test in
// convex/fairPublic.test.ts). Ids travel as plain strings; no PII field exists
// here and no rating aggregate (JOVAN-DELTA §1).
// -----------------------------------------------------------------------------

export const fairPublicEventView = v.object({
  id: v.string(),
  code: v.string(),
  slug: v.string(),
  title: v.string(),
  venueName: v.string(),
  timezone: v.literal("Europe/Belgrade"),
  startsAt: v.number(),
  endsAt: v.number(),
  status: fairEventStatus,
  garagePriority: v.number(),
  days: v.array(
    v.object({
      id: v.string(),
      dateKey: v.string(),
      label: v.string(),
      startsAt: v.number(),
      endsAt: v.number(),
      sortOrder: v.number(),
    }),
  ),
});

export const fairModelCapabilitiesView = v.object({
  ratingMode: v.union(v.literal("none"), v.literal("overall"), v.literal("dimensions")),
  canSubmitInterest: v.boolean(),
  canRequestTestDrive: v.boolean(),
  hasAudienceQuestions: v.boolean(),
  hasSurvey: v.boolean(),
  isSponsored: v.boolean(),
});

export const fairPublicModelView = v.object({
  id: v.string(),
  eventId: v.string(),
  eventSlug: v.string(),
  eventTitle: v.string(),
  participationId: v.string(),
  exhibitorName: v.string(),
  brandId: v.string(),
  brandName: v.string(),
  standId: v.string(),
  standMapLocationId: v.string(),
  slug: v.string(),
  displayName: v.string(),
  variant: v.optional(v.string()),
  priceText: v.string(),
  specificationGroups: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      order: v.number(),
      items: v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          value: v.string(),
          order: v.number(),
          isHighlight: v.boolean(),
        }),
      ),
    }),
  ),
  photoUrl: v.optional(v.string()),
  capabilities: fairModelCapabilitiesView,
});

// -----------------------------------------------------------------------------
// B3 — interaction views (convex/fairPublic.ts, convex/fairInteractions.ts).
// Shapes equal the lib/fair-contract.ts types (type test in
// convex/fairInteractions.test.ts). No rating count/sum/average anywhere:
// those live only in the admin projection (JOVAN-DELTA §1).
// -----------------------------------------------------------------------------

export const fairRatingValueView = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5));

export const fairRatingStateView = v.union(
  v.object({ mode: v.literal("none") }),
  v.object({ mode: v.literal("overall"), overall: v.optional(fairRatingValueView) }),
  v.object({
    mode: v.literal("dimensions"),
    appearance: v.optional(fairRatingValueView),
    specifications: v.optional(fairRatingValueView),
    price: v.optional(fairRatingValueView),
  }),
);

export const fairAudienceQuestionView = v.object({
  id: v.string(),
  eventModelId: v.string(),
  dateKey: v.string(),
  prompt: v.string(),
  options: v.array(fairChoiceOption),
  order: v.number(),
});

export const fairAudienceResultView = v.union(
  v.object({ questionId: v.string(), state: v.literal("waiting_for_minimum"), myOptionId: v.optional(v.string()) }),
  v.object({
    questionId: v.string(),
    state: v.literal("public"),
    options: v.array(v.object({ optionId: v.string(), percentage: v.number() })),
    myOptionId: v.optional(v.string()),
  }),
);

export const fairSurveyView = v.object({
  surveyId: v.string(),
  eventModelId: v.string(),
  version: v.number(),
  title: v.optional(v.string()),
  questions: v.array(
    v.object({ id: v.string(), prompt: v.string(), kind: fairSurveyQuestionKind, options: v.array(fairChoiceOption), order: v.number() }),
  ),
});

export const fairMySurveyStateView = v.union(
  v.object({ state: v.literal("none") }),
  v.object({ state: v.literal("open"), surveyId: v.string(), version: v.number() }),
  v.object({ state: v.literal("submitted"), surveyId: v.string(), version: v.number(), submittedAt: v.number() }),
);

export const fairPassportFavoriteResultView = v.union(
  v.object({ state: v.literal("waiting_for_minimum") }),
  v.object({ state: v.literal("public"), options: v.array(v.object({ eventModelId: v.string(), percentage: v.number() })) }),
);

// M1 — public event map (fairPublic.getEventMap)
const fairPublicMapExhibitorFields = {
  participationId: v.string(),
  exhibitorName: v.string(),
  logoUrl: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  category: v.optional(fairExhibitorCategory),
};

export const fairPublicEventMapView = v.object({
  eventId: v.string(),
  exhibitorsWithoutLocation: v.array(v.object({ ...fairPublicMapExhibitorFields, zoneId: v.optional(fairMapZoneId) })),
  stands: v.array(
    v.object({
      ...fairPublicMapExhibitorFields,
      standId: v.string(),
      mapLocationId: v.string(),
      code: v.string(),
      displayName: v.string(),
      brands: v.array(
        v.object({
          brandId: v.string(),
          brandName: v.string(),
          models: v.array(v.object({ id: v.string(), slug: v.string(), displayName: v.string(), variant: v.optional(v.string()) })),
        }),
      ),
    }),
  ),
});

export const fairPassportProgressView = v.object({
  passportId: v.string(),
  stampedModelIds: v.array(v.string()),
  stampedCount: v.number(),
  requiredCount: v.number(),
  completed: v.boolean(),
  favoriteModelId: v.optional(v.string()),
  favoriteResult: v.optional(fairPassportFavoriteResultView),
});

export const fairPassportCatalogEntryView = v.object({
  passportId: v.string(),
  eventId: v.string(),
  brandId: v.string(),
  brandName: v.string(),
  brandLogoUrl: v.optional(v.string()),
  standMapLocationIds: v.array(v.string()),
  models: v.array(
    v.object({ eventModelId: v.string(), slug: v.string(), displayName: v.string(), variant: v.optional(v.string()) }),
  ),
});

export const fairPassportStateView = v.object({
  eventId: v.string(),
  catalog: v.array(fairPassportCatalogEntryView),
  progress: v.array(fairPassportProgressView),
});

export const fairMyModelStateView = v.object({
  eventModelId: v.string(),
  rating: fairRatingStateView,
  audience: v.array(fairAudienceResultView),
  survey: fairMySurveyStateView,
  passport: v.union(fairPassportProgressView, v.null()),
});

// B4 — lead form (fairPublic.getLeadForm) and submitLead result; never a contact value.
export const fairLeadFormView = v.union(
  v.object({ eventModelId: v.string(), kind: fairLeadKind, state: v.literal("unavailable") }),
  v.object({ eventModelId: v.string(), kind: fairLeadKind, state: v.literal("leads_disabled") }),
  v.object({ eventModelId: v.string(), kind: fairLeadKind, state: v.literal("consent_not_configured") }),
  v.object({
    eventModelId: v.string(),
    kind: fairLeadKind,
    state: v.literal("open"),
    contactRequirement: fairContactRequirement,
    preferredContact: v.optional(fairPreferredContact),
    consent: v.object({ version: v.number(), text: v.string() }),
  }),
);

export const fairLeadSubmitResultView = v.object({
  eventModelId: v.string(),
  kind: fairLeadKind,
  submittedAt: v.number(),
  duplicate: v.boolean(),
  confirmationEmail: v.boolean(),
  followUpScheduled: v.boolean(),
});

// B5 — sponsored rotation projections (read-only, no impression field) and
// the result of an explicit garage strip action (lib/fair-contract.ts).
export const fairSponsoredModelCardView = v.object({
  eventModelId: v.string(),
  eventId: v.string(),
  eventSlug: v.string(),
  slug: v.string(),
  brandId: v.string(),
  brandName: v.string(),
  displayName: v.string(),
  variant: v.optional(v.string()),
  priceText: v.string(),
  visual: v.union(v.literal("photo"), v.literal("brand_logo"), v.literal("event_placeholder")),
  photoUrl: v.optional(v.string()),
  brandLogoUrl: v.optional(v.string()),
  standMapLocationId: v.string(),
  order: v.number(),
  audienceResult: v.optional(
    v.object({ questionId: v.string(), prompt: v.string(), options: v.array(fairChoiceOption), result: fairAudienceResultView }),
  ),
});

export const fairSponsoredRotationView = v.object({
  surface: v.union(v.literal("map"), v.literal("garage")),
  eventId: v.string(),
  snapshotId: v.string(),
  version: v.number(),
  dayKey: v.string(),
  seed: v.string(),
  epochMs: v.number(),
  intervalMs: v.number(),
  items: v.array(fairSponsoredModelCardView),
});

export const fairSponsoredActionResultView = v.object({
  eventModelId: v.string(),
  kind: fairSponsoredActionKind,
  recordedAt: v.number(),
  duplicate: v.boolean(),
});
