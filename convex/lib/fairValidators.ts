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
);

// B0 design (HANDOFF §5.5 names fairPassportConfigs without fields).
export const fairPassportConfigStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("withdrawn"),
);

export const fairPassportEligibleStatus = v.union(v.literal("required"), v.literal("removed"));

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

// JOVAN-DELTA §2 narrows HANDOFF §5.7 (`map | display | garage`): only the
// garage strip's explicit actions are written. Map/display never write.
export const fairSponsoredActionSurface = v.literal("garage");

export const fairSponsoredActionKind = v.union(v.literal("open_model"), v.literal("garage_add"));

// MASTER §4.6 — optional on stored rows; absent means "standard".
export const fairClientSegment = v.union(v.literal("standard"), v.literal("event_only"));

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
