import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  FAIR_PII_PURGE_AT_MS,
  FAIR_PUBLIC_VOTE_THRESHOLD,
  FAIR_RATING_DIMENSIONS,
  isFairRatingValue,
  isFairVisitorHash,
  type FairAudienceResultView,
  type FairErrorCode,
  type FairErrorDetails,
  type FairPackageTier,
  type FairPassportCatalogEntry,
  type FairPassportFavoriteResultView,
  type FairPassportProgress,
  type FairPassportState,
  type FairRatingState,
} from "../../lib/fair-contract";
import { fairTierAt, getFairEntitlements } from "../../lib/fair-entitlements";
import { bumpFairCount, readFairCount } from "./fairCountShards";
import { upsertFairVisitor } from "./fairScans";

// =============================================================================
// Sajam automobila 2026 — B3 interaction core (BACKEND-HANDOFF §5.3, §5.5, §7
// fairInteractions, §9, §10; MASTER §7, §9, §11; JOVAN-DELTA §1, §3).
// Shared by convex/fairInteractions.ts (gateway-facing), convex/fairPublic.ts
// (public reads) and convex/fairInteractionsAdmin.ts (requireAdmin).
//
// Every visitor write follows HANDOFF §7: validate input → load the published
// event-model → server-side entitlement at the moment of the interaction →
// per-visitor rate limit → source row + projection in the same transaction.
// Failures THROW ConvexError({ code }) with a stable FairErrorCode, so a
// refused call commits nothing (no partial write, no visitor row, no limiter
// token).
//
// Aggregates live in fairMetricCountShards (anonymous; they survive the
// 16 Nov purge). Rating count/sum is read ONLY by admin/report projections
// (JOVAN-DELTA §1); public and visitor reads never touch those keys.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

// Bounded child reads (technical caps, not business rules).
export const QUESTIONS_PER_MODEL_CAP = 50;
export const SURVEY_VERSIONS_PER_MODEL_CAP = 50;
export const PASSPORT_MODELS_CAP = 40;
export const PASSPORTS_PER_EVENT_CAP = 100;
const STAMPS_PER_BRAND_CAP = 100;
const ACTIVATIONS_CAP = 20;

export function fairInteractionError(code: FairErrorCode, details?: FairErrorDetails): never {
  throw new ConvexError(details ? { code, details } : { code });
}

export function requireVisitorHash(visitorHash: string): string {
  if (!isFairVisitorHash(visitorHash)) fairInteractionError("INVALID_INPUT", { field: "visitorHash" });
  return visitorHash;
}

/**
 * The visitor row of a write (K1): an existing row, or a new one when the
 * per-IP `fairVisitorCreate` bucket allows it — else RATE_LIMITED, nothing written.
 */
export async function requireFairVisitorRow(
  ctx: MutationCtx,
  input: { visitorHash: string; ipHash: string | undefined; now: number },
): Promise<Id<"fairVisitors">> {
  const visitor = await upsertFairVisitor(ctx, input);
  if (!visitor.ok) fairInteractionError("RATE_LIMITED", { retryAfterMs: visitor.retryAfterMs });
  return visitor.visitorId;
}

/** Read-only visitor lookup (queries never create a visitor). */
export async function findFairVisitor(ctx: Ctx, visitorHash: string): Promise<Doc<"fairVisitors"> | null> {
  return ctx.db
    .query("fairVisitors")
    .withIndex("by_visitorHash", (q) => q.eq("visitorHash", visitorHash))
    .unique();
}

/**
 * Interactions are open while the event is `published` or `live` and before
 * the PII purge moment (no visitor-linkable row may be created after it).
 * `draft`, `ended` and `archived` events refuse new interactions.
 */
export function fairEventAcceptsInteractions(event: Doc<"fairEvents">, now: number): boolean {
  return (event.status === "published" || event.status === "live") && now < FAIR_PII_PURGE_AT_MS;
}

/** The published model and its event, or a stable error. `id` arrives as a string from the gateway. */
export async function requireInteractiveModel(ctx: Ctx, rawModelId: string, now: number) {
  const modelId = ctx.db.normalizeId("fairEventModels", rawModelId);
  const model = modelId ? await ctx.db.get(modelId) : null;
  if (!model || model.status !== "published") fairInteractionError("FAIR_MODEL_NOT_FOUND");
  const event = await ctx.db.get(model.eventId);
  if (!event) fairInteractionError("FAIR_MODEL_NOT_FOUND");
  if (!fairEventAcceptsInteractions(event, now)) fairInteractionError("EVENT_NOT_ACTIVE");
  return { model, event };
}

/**
 * Tier in force at `at` (HANDOFF §4.1: an activation is effective from its own
 * instant, never retroactively). Fast path: the stored tier once its
 * activation moment has passed; otherwise the activation history decides
 * (e.g. a package imported with a future `package_active_from`).
 */
export async function fairModelTierAt(ctx: Ctx, model: Doc<"fairEventModels">, at: number): Promise<FairPackageTier> {
  if (model.packageActivatedAt <= at) return model.packageTier;
  const activations = await ctx.db
    .query("fairPackageActivations")
    .withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", model._id))
    .take(ACTIVATIONS_CAP);
  return fairTierAt({ initialTier: "included", startedAt: model.createdAt, activations }, at);
}

// -----------------------------------------------------------------------------
// Whole-number percentages (largest remainder: they always sum to 100)
// -----------------------------------------------------------------------------

export function fairWholePercentages(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((count) => (Math.max(0, count) * 100) / total);
  const result = raw.map(Math.floor);
  let rest = 100 - result.reduce((sum, value) => sum + value, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (rest <= 0) break;
    result[index] += 1;
    rest -= 1;
  }
  return result;
}

/** MASTER §9.1 / §11: results become public from five votes. */
export function fairVoteThreshold(event: Doc<"fairEvents">): number {
  return Math.max(FAIR_PUBLIC_VOTE_THRESHOLD, event.minimumPublicVoteCount);
}

// -----------------------------------------------------------------------------
// Ratings (HANDOFF §5.3, MASTER §7, JOVAN-DELTA §1)
// Keys (admin/report only): rating_count_<field>:model:<eventModelId> and
// rating_sum_<field>:model:<eventModelId>, field ∈ overall | appearance |
// specifications | price.
// -----------------------------------------------------------------------------

export const FAIR_RATING_FIELDS = ["overall", ...FAIR_RATING_DIMENSIONS] as const;
export type FairRatingField = (typeof FAIR_RATING_FIELDS)[number];
export type FairRatingInputValues = Partial<Record<FairRatingField, number>>;

export function fairRatingCountKey(field: FairRatingField, eventModelId: string) {
  return `rating_count_${field}:model:${eventModelId}`;
}

export function fairRatingSumKey(field: FairRatingField, eventModelId: string) {
  return `rating_sum_${field}:model:${eventModelId}`;
}

/**
 * Patches the visitor's one row for the model. Only the SENT fields move the
 * aggregates: a first value adds to count and sum, a changed value only moves
 * the sum by the difference (HANDOFF §10: a rating change never adds to count).
 */
export async function applyFairRating(
  ctx: MutationCtx,
  input: { visitorId: Id<"fairVisitors">; model: Doc<"fairEventModels">; values: FairRatingInputValues; now: number },
): Promise<Doc<"fairRatings">> {
  const existing = await ctx.db
    .query("fairRatings")
    .withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", input.visitorId).eq("eventModelId", input.model._id))
    .unique();
  const patch: FairRatingInputValues = {};
  for (const field of FAIR_RATING_FIELDS) {
    const value = input.values[field];
    if (value === undefined) continue;
    const previous = existing?.[field];
    if (previous === value) continue;
    patch[field] = value;
    if (previous === undefined) {
      await bumpFairCount(ctx, fairRatingCountKey(field, input.model._id), 1);
      await bumpFairCount(ctx, fairRatingSumKey(field, input.model._id), value);
    } else {
      await bumpFairCount(ctx, fairRatingSumKey(field, input.model._id), value - previous);
    }
  }
  if (existing) {
    if (Object.keys(patch).length) await ctx.db.patch(existing._id, { ...patch, updatedAt: input.now });
    return (await ctx.db.get(existing._id))!;
  }
  const id = await ctx.db.insert("fairRatings", {
    visitorId: input.visitorId,
    eventId: input.model.eventId,
    eventModelId: input.model._id,
    ...patch,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return (await ctx.db.get(id))!;
}

/** The visitor's OWN values in the model's current rating shape. Never an aggregate. */
export function fairOwnRatingState(tier: FairPackageTier, row: Doc<"fairRatings"> | null): FairRatingState {
  const mode = getFairEntitlements(tier).ratingMode;
  const own = (value: number | undefined) => (value !== undefined && isFairRatingValue(value) ? value : undefined);
  if (mode === "none") return { mode: "none" };
  if (mode === "overall") {
    const overall = own(row?.overall);
    return overall === undefined ? { mode } : { mode, overall };
  }
  const state: Extract<FairRatingState, { mode: "dimensions" }> = { mode: "dimensions" };
  for (const field of FAIR_RATING_DIMENSIONS) {
    const value = own(row?.[field]);
    if (value !== undefined) state[field] = value;
  }
  return state;
}

/** Admin/report projection: count, sum and average per rating field (JOVAN-DELTA §1). */
export async function fairRatingSummary(ctx: Ctx, eventModelId: Id<"fairEventModels">) {
  const out = [];
  for (const field of FAIR_RATING_FIELDS) {
    const count = await readFairCount(ctx, fairRatingCountKey(field, eventModelId));
    const sum = await readFairCount(ctx, fairRatingSumKey(field, eventModelId));
    out.push({ field, count, sum, average: count > 0 ? Math.round((sum / count) * 100) / 100 : null });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Glas publike (HANDOFF §5.3, MASTER §9.1)
// Key: audience_votes:question:<questionId>:<optionId>
// -----------------------------------------------------------------------------

export function fairAudienceVoteKey(questionId: string, optionId: string) {
  return `audience_votes:question:${questionId}:${optionId}`;
}

/** Published and inside its own window (startsAt ≤ now < endsAt). */
export function fairQuestionOpen(question: Doc<"fairAudienceQuestions">, now: number): boolean {
  return question.status === "published" && now >= question.startsAt && (question.endsAt === undefined || now < question.endsAt);
}

export async function fairAudienceOptionCounts(ctx: Ctx, question: Doc<"fairAudienceQuestions">) {
  const options = [...question.options].sort((a, b) => a.order - b.order);
  const counts: number[] = [];
  for (const option of options) counts.push(await readFairCount(ctx, fairAudienceVoteKey(question._id, option.id)));
  return { options, counts };
}

/**
 * Public result view: below the threshold only the visitor's own choice (no
 * percentage); from the threshold whole-number percentages per option.
 */
export async function fairAudienceResult(
  ctx: Ctx,
  question: Doc<"fairAudienceQuestions">,
  threshold: number,
  myOptionId?: string,
): Promise<FairAudienceResultView> {
  const { options, counts } = await fairAudienceOptionCounts(ctx, question);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const mine = myOptionId ? { myOptionId } : {};
  if (total < threshold) return { questionId: question._id, state: "waiting_for_minimum", ...mine };
  const percentages = fairWholePercentages(counts);
  return {
    questionId: question._id,
    state: "public",
    options: options.map((option, index) => ({ optionId: option.id, percentage: percentages[index] })),
    ...mine,
  };
}

/** Questions of one model (all days), bounded. */
export async function fairModelQuestions(ctx: Ctx, eventModelId: Id<"fairEventModels">) {
  return ctx.db
    .query("fairAudienceQuestions")
    .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", eventModelId))
    .take(QUESTIONS_PER_MODEL_CAP);
}

// -----------------------------------------------------------------------------
// Survey (HANDOFF §5.3, MASTER §9.2)
// -----------------------------------------------------------------------------

/** All versions of the model's survey, bounded. */
export async function fairModelSurveys(ctx: Ctx, eventModelId: Id<"fairEventModels">) {
  return ctx.db
    .query("fairSurveys")
    .withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", eventModelId))
    .take(SURVEY_VERSIONS_PER_MODEL_CAP);
}

/** "One final version per visitor and model" — any version of this model's survey. */
export async function fairVisitorSurveyResponse(ctx: Ctx, visitorId: Id<"fairVisitors">, surveys: readonly Doc<"fairSurveys">[]) {
  for (const survey of surveys) {
    const response = await ctx.db
      .query("fairSurveyResponses")
      .withIndex("by_visitorId_and_surveyId", (q) => q.eq("visitorId", visitorId).eq("surveyId", survey._id))
      .first();
    if (response) return { survey, response };
  }
  return null;
}

/** Problem code of an answer set against one survey version, or null. */
export function fairSurveyAnswersProblem(
  survey: Doc<"fairSurveys">,
  answers: ReadonlyArray<{ questionId: string; value: string }>,
): "INVALID_INPUT" | null {
  if (answers.length < 1 || answers.length > survey.questions.length) return "INVALID_INPUT";
  const seen = new Set<string>();
  for (const answer of answers) {
    const question = survey.questions.find((row) => row.id === answer.questionId);
    if (!question || seen.has(answer.questionId)) return "INVALID_INPUT";
    seen.add(answer.questionId);
    const valid = question.kind === "yes_no"
      ? answer.value === "yes" || answer.value === "no"
      : question.options.some((option) => option.id === answer.value);
    if (!valid) return "INVALID_INPUT";
  }
  // V1 questions are optional (MASTER §9.2); a question the admin marked
  // `required` must be answered.
  if (survey.questions.some((question) => question.required && !seen.has(question.id))) return "INVALID_INPUT";
  return null;
}

// -----------------------------------------------------------------------------
// Brand passport (HANDOFF §5.5, MASTER §11, JOVAN-DELTA §3)
// Key: brand_favorite:passport:<passportId>:<eventModelId>
// -----------------------------------------------------------------------------

export function fairFavoriteKey(passportId: string, eventModelId: string) {
  return `brand_favorite:passport:${passportId}:${eventModelId}`;
}

/**
 * Admin UX A7: what visitors see — a published passport that the admin has
 * not hidden. A hidden one keeps stamping (stampFairPassportOnScan reads only
 * the status), so showing it again loses no progress.
 */
export function fairIsPublicPassport(passport: Doc<"fairPassportConfigs">): boolean {
  return passport.status === "published" && passport.hiddenAt === undefined;
}

/** The frozen set still required (emergency-removed members excluded). */
export async function fairPassportRequiredMembers(ctx: Ctx, passportId: Id<"fairPassportConfigs">) {
  return ctx.db
    .query("fairPassportEligibleModels")
    .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", passportId).eq("status", "required"))
    .take(PASSPORT_MODELS_CAP);
}

export async function fairFavoriteResult(
  ctx: Ctx,
  passportId: Id<"fairPassportConfigs">,
  modelIds: readonly Id<"fairEventModels">[],
  threshold: number,
): Promise<FairPassportFavoriteResultView> {
  const counts: number[] = [];
  for (const id of modelIds) counts.push(await readFairCount(ctx, fairFavoriteKey(passportId, id)));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total < threshold) return { state: "waiting_for_minimum" };
  const percentages = fairWholePercentages(counts);
  return { state: "public", options: modelIds.map((eventModelId, index) => ({ eventModelId, percentage: percentages[index] })) };
}

/**
 * The visitor's N/M in one published passport. N counts stamps on models that
 * are still required; stamps of an emergency-removed model stay stored (never
 * deleted) but no longer count, and M shrinks with the removal.
 */
export async function fairPassportProgress(
  ctx: Ctx,
  input: {
    passport: Doc<"fairPassportConfigs">;
    required: readonly Doc<"fairPassportEligibleModels">[];
    visitorId: Id<"fairVisitors"> | null;
    threshold: number;
  },
): Promise<FairPassportProgress> {
  const { passport, required, visitorId } = input;
  const requiredIds = required.map((member) => member.eventModelId);
  const base = { passportId: passport._id, requiredCount: requiredIds.length };
  if (!visitorId) return { ...base, stampedModelIds: [], stampedCount: 0, completed: false };
  const stamps = await ctx.db
    .query("fairPassportStamps")
    .withIndex("by_visitorId_and_eventId_and_brandId", (q) =>
      q.eq("visitorId", visitorId).eq("eventId", passport.eventId).eq("brandId", passport.brandId),
    )
    .take(STAMPS_PER_BRAND_CAP);
  const stamped = new Set<string>(stamps.map((stamp) => stamp.eventModelId));
  const stampedModelIds = requiredIds.filter((id) => stamped.has(id));
  const completed = requiredIds.length > 0 && stampedModelIds.length === requiredIds.length;
  const favorite = await ctx.db
    .query("fairBrandFavoriteVotes")
    .withIndex("by_visitorId_and_eventId_and_brandId", (q) =>
      q.eq("visitorId", visitorId).eq("eventId", passport.eventId).eq("brandId", passport.brandId),
    )
    .unique();
  const progress: FairPassportProgress = { ...base, stampedModelIds, stampedCount: stampedModelIds.length, completed };
  if (favorite) {
    progress.favoriteModelId = favorite.eventModelId;
    progress.favoriteResult = await fairFavoriteResult(ctx, passport._id, requiredIds, input.threshold);
  }
  return progress;
}

/** Public catalog entry of one published passport (model page, garage, map). */
export async function fairPassportCatalogEntry(
  ctx: Ctx,
  passport: Doc<"fairPassportConfigs">,
  required: readonly Doc<"fairPassportEligibleModels">[],
): Promise<FairPassportCatalogEntry | null> {
  const brand = await ctx.db.get(passport.brandId);
  if (!brand) return null;
  const models: FairPassportCatalogEntry["models"] = [];
  const locations = new Set<string>();
  for (const member of required) {
    const model = await ctx.db.get(member.eventModelId);
    if (!model) continue;
    models.push({ eventModelId: model._id, slug: model.slug, displayName: model.displayName, ...(model.variant ? { variant: model.variant } : {}) });
    const stand = await ctx.db.get(model.standId);
    if (stand) locations.add(stand.mapLocationId);
  }
  const logoUrl = brand.logoStorageId ? await ctx.storage.getUrl(brand.logoStorageId) : null;
  return {
    passportId: passport._id,
    eventId: passport.eventId,
    brandId: brand._id,
    brandName: brand.name,
    ...(logoUrl ? { brandLogoUrl: logoUrl } : {}),
    standMapLocationIds: [...locations],
    models,
  };
}

/** The published (and not hidden, A7) passport whose required set contains this model, if any. */
export async function fairPublishedPassportForModel(ctx: Ctx, model: Doc<"fairEventModels">) {
  const memberships = await ctx.db
    .query("fairPassportEligibleModels")
    .withIndex("by_eventModelId", (q) => q.eq("eventModelId", model._id))
    .take(8);
  for (const membership of memberships) {
    if (membership.status !== "required" || membership.eventId !== model.eventId) continue;
    const passport = await ctx.db.get(membership.passportConfigId);
    if (passport && fairIsPublicPassport(passport)) return passport;
  }
  return null;
}

/** All published passports of one event (hidden ones skipped, A7) + (when a visitor hash is given) the visitor's progress in each. */
export async function fairPassportState(ctx: Ctx, event: Doc<"fairEvents">, visitorHash: string | null): Promise<FairPassportState> {
  const visitor = visitorHash ? await findFairVisitor(ctx, visitorHash) : null;
  const passports = await ctx.db
    .query("fairPassportConfigs")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", "published"))
    .take(PASSPORTS_PER_EVENT_CAP);
  const threshold = fairVoteThreshold(event);
  const state: FairPassportState = { eventId: event._id, catalog: [], progress: [] };
  for (const passport of passports) {
    if (!fairIsPublicPassport(passport)) continue;
    const required = await fairPassportRequiredMembers(ctx, passport._id);
    const entry = await fairPassportCatalogEntry(ctx, passport, required);
    if (!entry) continue;
    state.catalog.push(entry);
    if (visitorHash !== null) {
      state.progress.push(await fairPassportProgress(ctx, { passport, required, visitorId: visitor?._id ?? null, threshold }));
    }
  }
  return state;
}
