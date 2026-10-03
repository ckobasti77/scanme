import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  isFairSubmissionId,
  type FairPassportState,
  type FairSponsoredActionKind,
  type FairSponsoredActionResult,
  type FairSurveySubmitResult,
} from "../lib/fair-contract";
import { fairRatingInputProblem, getFairEntitlements } from "../lib/fair-entitlements";
import { bumpFairCount } from "./lib/fairCountShards";
import {
  applyFairRating,
  fairAudienceResult,
  fairAudienceVoteKey,
  fairEventAcceptsInteractions,
  fairFavoriteKey,
  fairInteractionError,
  fairModelQuestions,
  fairModelSurveys,
  fairModelTierAt,
  fairOwnRatingState,
  fairPassportProgress,
  fairPassportState,
  fairPassportRequiredMembers,
  fairPublishedPassportForModel,
  fairQuestionOpen,
  fairSurveyAnswersProblem,
  fairVisitorSurveyResponse,
  fairVoteThreshold,
  findFairVisitor,
  requireInteractiveModel,
  requireVisitorHash,
  type FairRatingInputValues,
} from "./lib/fairInteractions";
import { fairTimeKeys, upsertFairVisitor } from "./lib/fairScans";
import { fairActiveSponsoredSnapshot, fairSponsoredCountKeys, fairSponsoredItems } from "./lib/fairSponsored";
import {
  fairAudienceResultView,
  fairMyModelStateView,
  fairPassportProgressView,
  fairPassportStateView,
  fairRatingStateView,
  fairSponsoredActionResultView,
  fairSurveyAnswer,
} from "./lib/fairValidators";
import { rateLimiter } from "./lib/rateLimits";

// =============================================================================
// Sajam automobila 2026 — B3 visitor interactions (BACKEND-HANDOFF §7
// fairInteractions). Called ONLY by the Next same-origin POST gateway
// (app/api/fair/**, lib/fair-server/interactions.ts), which reads the HttpOnly
// cookie and passes the HMAC `visitorHash` — so a hash never travels in a URL,
// an analytics tool or a browser cache key. The raw token never reaches Convex.
//
// Rules (HANDOFF §7): validate → published event-model → entitlement at the
// moment of the interaction → per-visitor rate limit → source row + projection
// in one transaction → return only what the UI needs. Every refusal throws
// ConvexError({ code }) (lib/fair-contract FAIR_ERROR_CODES), so nothing is
// partially written. Nothing here returns PII, another visitor's state or a
// rating count/sum/average (JOVAN-DELTA §1).
// =============================================================================

type MyModelState = Infer<typeof fairMyModelStateView>;

const ratingValue = v.optional(v.number());

async function requireLimit(
  ctx: Parameters<typeof rateLimiter.limit>[0],
  name: "fairRating" | "fairAudienceVote" | "fairSurveySubmit" | "fairBrandFavorite" | "fairSponsoredAction",
  key: string,
) {
  const status = await rateLimiter.limit(ctx, name, { key });
  if (!status.ok) fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.ceil(status.retryAfter) });
}

// -----------------------------------------------------------------------------
// Reads (gateway POST → query; a query never creates a visitor)
// -----------------------------------------------------------------------------

/** The visitor's own state for one model page: own rating, own votes, survey state, passport N/M. */
export const getMyModelState = query({
  args: { visitorHash: v.string(), eventModelId: v.string() },
  returns: fairMyModelStateView,
  handler: async (ctx, args): Promise<MyModelState> => {
    requireVisitorHash(args.visitorHash);
    const modelId = ctx.db.normalizeId("fairEventModels", args.eventModelId);
    const model = modelId ? await ctx.db.get(modelId) : null;
    if (!model || model.status !== "published") fairInteractionError("FAIR_MODEL_NOT_FOUND");
    const event = await ctx.db.get(model.eventId);
    if (!event) fairInteractionError("FAIR_MODEL_NOT_FOUND");
    const visitor = await findFairVisitor(ctx, args.visitorHash);
    const visitorId = visitor?._id ?? null;
    const threshold = fairVoteThreshold(event);

    const rating = visitorId
      ? await ctx.db
          .query("fairRatings")
          .withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", visitorId).eq("eventModelId", model._id))
          .unique()
      : null;

    const audience: MyModelState["audience"] = [];
    if (visitorId) {
      for (const question of await fairModelQuestions(ctx, model._id)) {
        if (question.status === "draft") continue;
        const vote = await ctx.db
          .query("fairAudienceVotes")
          .withIndex("by_visitorId_and_questionId", (q) => q.eq("visitorId", visitorId).eq("questionId", question._id))
          .unique();
        if (vote) audience.push(await fairAudienceResult(ctx, question, threshold, vote.optionId));
      }
    }

    const surveys = await fairModelSurveys(ctx, model._id);
    const answered = visitorId ? await fairVisitorSurveyResponse(ctx, visitorId, surveys) : null;
    const published = surveys.find((survey) => survey.status === "published");
    const survey: MyModelState["survey"] = answered
      ? { state: "submitted", surveyId: answered.survey._id, version: answered.survey.version, submittedAt: answered.response.submittedAt }
      : published && getFairEntitlements(model.packageTier).survey
        ? { state: "open", surveyId: published._id, version: published.version }
        : { state: "none" };

    const passport = await fairPublishedPassportForModel(ctx, model);
    const progress = passport
      ? await fairPassportProgress(ctx, { passport, required: await fairPassportRequiredMembers(ctx, passport._id), visitorId, threshold })
      : null;

    return {
      eventModelId: model._id,
      rating: fairOwnRatingState(model.packageTier, rating),
      audience,
      survey,
      passport: progress,
    };
  },
});

/**
 * All active passports of one event with the visitor's N/M, completion and
 * favorite (model page, garage and map share this one projection, JOVAN-DELTA
 * §3). A visitor with no scan yet gets 0/N for every passport.
 */
export const getMyPassportProgress = query({
  args: { visitorHash: v.string(), eventSlug: v.string() },
  returns: v.union(fairPassportStateView, v.null()),
  handler: async (ctx, args): Promise<FairPassportState | null> => {
    requireVisitorHash(args.visitorHash);
    if (!args.eventSlug || args.eventSlug.length > 120) return null;
    const event = await ctx.db
      .query("fairEvents")
      .withIndex("by_slug", (q) => q.eq("slug", args.eventSlug))
      .first();
    if (!event || event.status === "draft") return null;
    return fairPassportState(ctx, event, args.visitorHash);
  },
});

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

/**
 * Starter: exactly `overall` 1–5. Advanced: any non-empty subset of
 * appearance/specifications/price, never `overall`, no derived overall.
 * Re-rating patches the same row; only the sent fields move the aggregates.
 */
export const upsertRating = mutation({
  args: {
    visitorHash: v.string(),
    eventModelId: v.string(),
    overall: ratingValue,
    appearance: ratingValue,
    specifications: ratingValue,
    price: ratingValue,
  },
  returns: fairRatingStateView,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireVisitorHash(args.visitorHash);
    const { model } = await requireInteractiveModel(ctx, args.eventModelId, now);
    const tier = await fairModelTierAt(ctx, model, now);
    const values: FairRatingInputValues = {};
    if (args.overall !== undefined) values.overall = args.overall;
    if (args.appearance !== undefined) values.appearance = args.appearance;
    if (args.specifications !== undefined) values.specifications = args.specifications;
    if (args.price !== undefined) values.price = args.price;
    const problem = fairRatingInputProblem(tier, values);
    if (problem) fairInteractionError(problem);

    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    await requireLimit(ctx, "fairRating", visitorId);
    const row = await applyFairRating(ctx, { visitorId, model, values, now });
    return fairOwnRatingState(tier, row);
  },
});

/**
 * One changeable vote per visitor and question. A change moves the counter
 * from the old option to the new one, so the number of voters stays the same.
 */
export const upsertAudienceVote = mutation({
  args: { visitorHash: v.string(), questionId: v.string(), optionId: v.string() },
  returns: fairAudienceResultView,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireVisitorHash(args.visitorHash);
    const questionId = ctx.db.normalizeId("fairAudienceQuestions", args.questionId);
    const question = questionId ? await ctx.db.get(questionId) : null;
    if (!question || !fairQuestionOpen(question, now)) fairInteractionError("QUESTION_NOT_OPEN");
    const { model, event } = await requireInteractiveModel(ctx, question.eventModelId, now);
    const tier = await fairModelTierAt(ctx, model, now);
    if (getFairEntitlements(tier).audienceQuestionsPerDay === 0) fairInteractionError("FEATURE_NOT_ENTITLED");
    if (!question.options.some((option) => option.id === args.optionId)) fairInteractionError("INVALID_INPUT", { field: "optionId" });

    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    await requireLimit(ctx, "fairAudienceVote", visitorId);
    const existing = await ctx.db
      .query("fairAudienceVotes")
      .withIndex("by_visitorId_and_questionId", (q) => q.eq("visitorId", visitorId).eq("questionId", question._id))
      .unique();
    if (!existing) {
      await ctx.db.insert("fairAudienceVotes", {
        visitorId,
        eventId: model.eventId,
        eventModelId: model._id,
        questionId: question._id,
        optionId: args.optionId,
        createdAt: now,
        updatedAt: now,
      });
      await bumpFairCount(ctx, fairAudienceVoteKey(question._id, args.optionId), 1);
    } else if (existing.optionId !== args.optionId) {
      await ctx.db.patch(existing._id, { optionId: args.optionId, updatedAt: now });
      await bumpFairCount(ctx, fairAudienceVoteKey(question._id, existing.optionId), -1);
      await bumpFairCount(ctx, fairAudienceVoteKey(question._id, args.optionId), 1);
    }
    return fairAudienceResult(ctx, question, fairVoteThreshold(event), args.optionId);
  },
});

/**
 * Advanced only. Idempotent by `submissionId` (a retry returns the stored
 * submit); at least one answer; one final response per visitor and model,
 * never edited afterwards. Results are never public.
 */
export const submitSurvey = mutation({
  args: { visitorHash: v.string(), surveyId: v.string(), submissionId: v.string(), answers: v.array(fairSurveyAnswer) },
  returns: v.object({ surveyId: v.string(), version: v.number(), submittedAt: v.number(), duplicate: v.boolean() }),
  handler: async (ctx, args): Promise<FairSurveySubmitResult> => {
    const now = Date.now();
    requireVisitorHash(args.visitorHash);
    if (!isFairSubmissionId(args.submissionId)) fairInteractionError("INVALID_INPUT", { field: "submissionId" });

    const prior = await ctx.db
      .query("fairSurveyResponses")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", args.submissionId))
      .unique();
    if (prior) {
      const visitor = await findFairVisitor(ctx, args.visitorHash);
      if (!visitor || prior.visitorId !== visitor._id || prior.surveyId !== args.surveyId) fairInteractionError("SUBMISSION_DUPLICATE");
      const survey = await ctx.db.get(prior.surveyId);
      return { surveyId: prior.surveyId, version: survey?.version ?? 0, submittedAt: prior.submittedAt, duplicate: true };
    }

    const surveyId = ctx.db.normalizeId("fairSurveys", args.surveyId);
    const survey = surveyId ? await ctx.db.get(surveyId) : null;
    if (!survey || survey.status !== "published") fairInteractionError("SURVEY_NOT_OPEN");
    const { model } = await requireInteractiveModel(ctx, survey.eventModelId, now);
    const tier = await fairModelTierAt(ctx, model, now);
    if (!getFairEntitlements(tier).survey) fairInteractionError("FEATURE_NOT_ENTITLED");
    const problem = fairSurveyAnswersProblem(survey, args.answers);
    if (problem) fairInteractionError(problem, { field: "answers" });

    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    if (await fairVisitorSurveyResponse(ctx, visitorId, await fairModelSurveys(ctx, model._id))) {
      fairInteractionError("SURVEY_ALREADY_SUBMITTED");
    }
    await requireLimit(ctx, "fairSurveySubmit", visitorId);
    await ctx.db.insert("fairSurveyResponses", {
      submissionId: args.submissionId,
      visitorId,
      eventId: model.eventId,
      eventModelId: model._id,
      surveyId: survey._id,
      answers: args.answers.map((answer) => ({ questionId: answer.questionId, value: answer.value })),
      submittedAt: now,
    });
    return { surveyId: survey._id, version: survey.version, submittedAt: now, duplicate: false };
  },
});

/**
 * Allowed only once the backend sees a stamp on every still-required model of
 * the published passport. One changeable favorite per visitor+event+brand.
 */
export const upsertBrandFavorite = mutation({
  args: { visitorHash: v.string(), passportId: v.string(), eventModelId: v.string() },
  returns: fairPassportProgressView,
  handler: async (ctx, args) => {
    const now = Date.now();
    requireVisitorHash(args.visitorHash);
    const passportId = ctx.db.normalizeId("fairPassportConfigs", args.passportId);
    const passport = passportId ? await ctx.db.get(passportId) : null;
    if (!passport || passport.status !== "published") fairInteractionError("PASSPORT_NOT_ACTIVE");
    const event = await ctx.db.get(passport.eventId);
    if (!event) fairInteractionError("PASSPORT_NOT_ACTIVE");
    if (!fairEventAcceptsInteractions(event, now)) fairInteractionError("EVENT_NOT_ACTIVE");
    const required = await fairPassportRequiredMembers(ctx, passport._id);
    const choice = required.find((member) => member.eventModelId === args.eventModelId);
    if (!choice) fairInteractionError("INVALID_INPUT", { field: "eventModelId" });
    const visitor = await findFairVisitor(ctx, args.visitorHash);
    const threshold = fairVoteThreshold(event);
    const before = await fairPassportProgress(ctx, { passport, required, visitorId: visitor?._id ?? null, threshold });
    if (!visitor || !before.completed) fairInteractionError("PASSPORT_NOT_COMPLETE");

    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    await requireLimit(ctx, "fairBrandFavorite", visitorId);
    const existing = await ctx.db
      .query("fairBrandFavoriteVotes")
      .withIndex("by_visitorId_and_eventId_and_brandId", (q) =>
        q.eq("visitorId", visitorId).eq("eventId", passport.eventId).eq("brandId", passport.brandId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("fairBrandFavoriteVotes", {
        visitorId,
        eventId: passport.eventId,
        brandId: passport.brandId,
        eventModelId: choice.eventModelId,
        createdAt: now,
        updatedAt: now,
      });
      await bumpFairCount(ctx, fairFavoriteKey(passport._id, choice.eventModelId), 1);
    } else if (existing.eventModelId !== choice.eventModelId) {
      await ctx.db.patch(existing._id, { eventModelId: choice.eventModelId, updatedAt: now });
      await bumpFairCount(ctx, fairFavoriteKey(passport._id, existing.eventModelId), -1);
      await bumpFairCount(ctx, fairFavoriteKey(passport._id, choice.eventModelId), 1);
    }
    return fairPassportProgress(ctx, { passport, required, visitorId, threshold });
  },
});

// -----------------------------------------------------------------------------
// B5 — explicit garage sponsored actions (JOVAN-DELTA §2, HANDOFF §5.7)
// -----------------------------------------------------------------------------

const SPONSORED_KINDS: readonly string[] = ["open_model", "garage_add"] satisfies FairSponsoredActionKind[];

/**
 * `Pogledaj` (open_model) or `Dodaj u garažu` (garage_add) on a card of the
 * garage sponsored strip — the ONLY sponsored write. Surface must be `garage`:
 * the map and the displays never write, and a passive view is never an event.
 * Idempotent by `requestId`. Not a QR scan (no scan row, counter or stamp) and
 * it never adds the model to the garage — the garage lives in the browser and
 * only the visitor adds to it. The model must be Advanced now and in the
 * event's published snapshot.
 */
export const recordSponsoredAction = mutation({
  args: { visitorHash: v.string(), eventModelId: v.string(), surface: v.string(), kind: v.string(), requestId: v.string() },
  returns: fairSponsoredActionResultView,
  handler: async (ctx, args): Promise<FairSponsoredActionResult> => {
    const now = Date.now();
    requireVisitorHash(args.visitorHash);
    if (args.surface !== "garage") fairInteractionError("INVALID_INPUT", { field: "surface" });
    if (!SPONSORED_KINDS.includes(args.kind)) fairInteractionError("INVALID_INPUT", { field: "kind" });
    const kind = args.kind as FairSponsoredActionKind;
    if (!isFairSubmissionId(args.requestId)) fairInteractionError("INVALID_INPUT", { field: "requestId" });

    const prior = await ctx.db
      .query("fairSponsoredEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (prior) {
      const visitor = await findFairVisitor(ctx, args.visitorHash);
      if (!visitor || prior.visitorId !== visitor._id || prior.eventModelId !== args.eventModelId || prior.kind !== kind) {
        fairInteractionError("SUBMISSION_DUPLICATE");
      }
      return { eventModelId: prior.eventModelId, kind: prior.kind, recordedAt: prior.occurredAt, duplicate: true };
    }

    const { model } = await requireInteractiveModel(ctx, args.eventModelId, now);
    if (!getFairEntitlements(await fairModelTierAt(ctx, model, now)).sponsoredGarageRotation) fairInteractionError("FEATURE_NOT_ENTITLED");
    const snapshot = await fairActiveSponsoredSnapshot(ctx, model.eventId);
    const inSnapshot = snapshot ? (await fairSponsoredItems(ctx, snapshot._id)).some((item) => item.eventModelId === model._id) : false;
    if (!inSnapshot) fairInteractionError("FEATURE_NOT_ENTITLED");

    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    await requireLimit(ctx, "fairSponsoredAction", visitorId);
    const time = fairTimeKeys(now);
    await ctx.db.insert("fairSponsoredEvents", {
      requestId: args.requestId,
      eventId: model.eventId,
      eventModelId: model._id,
      surface: "garage",
      kind,
      occurredAt: now,
      dateKey: time.dateKey,
      hourKey: time.hourKey,
      visitorId,
    });
    for (const key of fairSponsoredCountKeys(kind, model._id, time)) await bumpFairCount(ctx, key);
    return { eventModelId: model._id, kind, recordedAt: now, duplicate: false };
  },
});
