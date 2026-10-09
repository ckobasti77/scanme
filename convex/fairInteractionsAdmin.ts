import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  FAIR_ADMIN_LIST_LIMIT,
  FAIR_AUDIENCE_OPTIONS_MAX,
  FAIR_AUDIENCE_OPTIONS_MIN,
  FAIR_SURVEY_MAX_QUESTIONS,
  FAIR_SURVEY_OPTIONS_MAX,
} from "../lib/fair-contract";
import { fairAudienceQuestionsRemaining, fairBrandPassportProblems, getFairEntitlements } from "../lib/fair-entitlements";
import { requireAdmin } from "./lib/access";
import { fairAdminError, isFairExternalKey, optionalText, requireText } from "./lib/fairCatalog";
import {
  PASSPORT_MODELS_CAP,
  PASSPORTS_PER_EVENT_CAP,
  QUESTIONS_PER_MODEL_CAP,
  SURVEY_VERSIONS_PER_MODEL_CAP,
  fairAudienceOptionCounts,
  fairModelQuestions,
  fairModelSurveys,
  fairModelTierAt,
  fairRatingSummary,
} from "./lib/fairInteractions";
import { syncFairSponsoredSnapshot } from "./lib/fairSponsored";
import {
  fairAudienceQuestionStatus,
  fairChoiceOption,
  fairPassportConfigStatus,
  fairPassportEligibleStatus,
  fairSurveyQuestion,
  fairSurveyStatus,
} from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B3 admin commands for interactions (BACKEND-HANDOFF
// §7 fairAdmin: "upsert/publish/close audience question, upsert/publish
// survey, set sponsored-result question"; §5.5 passport configuration and
// freeze; MASTER §9, §11). Every function requires requireAdmin: the ScanMe
// team enters exhibitor questions/surveys and configures passports (no
// exhibitor self-service). Errors are ConvexError({ code }) with
// FAIR_ADMIN_ISSUE_CODES. Package rights come only from lib/fair-entitlements.
//
// Rating count/sum/average is readable HERE (admin/report projection) and
// nowhere public (JOVAN-DELTA §1).
// =============================================================================

const OPTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const upsertResult = v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged"));

async function requireModel(ctx: MutationCtx, eventModelId: Id<"fairEventModels">) {
  const model = await ctx.db.get(eventModelId);
  if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
  return model;
}

async function requireQuestion(ctx: MutationCtx, questionId: Id<"fairAudienceQuestions">) {
  const question = await ctx.db.get(questionId);
  if (!question) fairAdminError("FAIR_QUESTION_NOT_FOUND");
  return question;
}

function normalizeOptions(options: ReadonlyArray<{ id: string; label: string; order: number }>, min: number, max: number, code: "INVALID_INPUT" | "FAIR_SURVEY_INVALID") {
  if (options.length < min || options.length > max) fairAdminError(code, { field: "options", min, max });
  const ids = new Set<string>();
  const orders = new Set<number>();
  const out = options.map((option) => {
    const id = option.id.trim();
    if (!OPTION_ID_PATTERN.test(id) || ids.has(id)) fairAdminError(code, { field: "options.id" });
    if (!Number.isInteger(option.order) || orders.has(option.order)) fairAdminError(code, { field: "options.order" });
    ids.add(id);
    orders.add(option.order);
    return { id, label: requireText(option.label, "options.label", 120), order: option.order };
  });
  return out.sort((a, b) => a.order - b.order);
}

function sameOptions(a: Doc<"fairAudienceQuestions">["options"], b: Doc<"fairAudienceQuestions">["options"]) {
  return a.length === b.length && a.every((option, index) => option.id === b[index].id && option.label === b[index].label && option.order === b[index].order);
}

async function questionHasVotes(ctx: MutationCtx, questionId: Id<"fairAudienceQuestions">) {
  const vote = await ctx.db
    .query("fairAudienceVotes")
    .withIndex("by_questionId_and_updatedAt", (q) => q.eq("questionId", questionId))
    .first();
  return vote !== null;
}

// -----------------------------------------------------------------------------
// Glas publike
// -----------------------------------------------------------------------------

/**
 * Creates or edits a draft/published question (≥2, ≤5 options). Idempotent by
 * `questionId` or event + `externalKey`. After the first vote the prompt and
 * options are immutable (FAIR_QUESTION_LOCKED): a change of meaning is a NEW
 * question with a new id that starts from zero. The window defaults to the
 * fair day (`startsAt`/`endsAt` of fairEventDays).
 */
export const upsertAudienceQuestion = mutation({
  args: {
    eventModelId: v.id("fairEventModels"),
    eventDayId: v.id("fairEventDays"),
    questionId: v.optional(v.id("fairAudienceQuestions")),
    externalKey: v.optional(v.string()),
    prompt: v.string(),
    options: v.array(fairChoiceOption),
    sortOrder: v.number(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  },
  returns: v.object({ questionId: v.id("fairAudienceQuestions"), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const model = await requireModel(ctx, args.eventModelId);
    const day = await ctx.db.get(args.eventDayId);
    if (!day || day.eventId !== model.eventId) fairAdminError("FAIR_EVENT_DAY_NOT_FOUND");
    if (getFairEntitlements(await fairModelTierAt(ctx, model, now)).audienceQuestionsPerDay === 0) {
      fairAdminError("FAIR_FEATURE_NOT_ENTITLED", { feature: "audienceQuestions" });
    }
    if (args.externalKey !== undefined && !isFairExternalKey(args.externalKey)) fairAdminError("INVALID_INPUT", { field: "externalKey" });
    const prompt = requireText(args.prompt, "prompt", 300);
    const options = normalizeOptions(args.options, FAIR_AUDIENCE_OPTIONS_MIN, FAIR_AUDIENCE_OPTIONS_MAX, "INVALID_INPUT");
    if (!Number.isInteger(args.sortOrder)) fairAdminError("INVALID_INPUT", { field: "sortOrder" });
    const startsAt = args.startsAt ?? day.startsAt;
    const endsAt = args.endsAt ?? day.endsAt;
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) fairAdminError("INVALID_INPUT", { field: "endsAt" });

    let existing: Doc<"fairAudienceQuestions"> | null = null;
    if (args.questionId) {
      existing = await requireQuestion(ctx, args.questionId);
    } else if (args.externalKey) {
      existing = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", model.eventId).eq("externalKey", args.externalKey))
        .first();
    }
    if (!existing) {
      const questionId = await ctx.db.insert("fairAudienceQuestions", {
        eventId: model.eventId,
        eventDayId: day._id,
        eventModelId: model._id,
        ...(args.externalKey ? { externalKey: args.externalKey } : {}),
        prompt,
        options,
        status: "draft",
        sortOrder: args.sortOrder,
        startsAt,
        endsAt,
        showOnSponsoredRotation: false,
        createdAt: now,
        updatedAt: now,
      });
      return { questionId, result: "created" as const };
    }

    if (existing.eventModelId !== model._id) fairAdminError("FAIR_LINK_CONFLICT", { field: "eventModelId" });
    if (existing.status === "closed") fairAdminError("FAIR_QUESTION_STATUS", { status: existing.status });
    if (existing.status === "published" && existing.eventDayId !== day._id) fairAdminError("FAIR_QUESTION_STATUS", { field: "eventDayId" });
    const meaningChanged = existing.prompt !== prompt || !sameOptions(existing.options, options);
    if (meaningChanged && (await questionHasVotes(ctx, existing._id))) fairAdminError("FAIR_QUESTION_LOCKED");
    const unchanged = !meaningChanged && existing.eventDayId === day._id && existing.sortOrder === args.sortOrder
      && existing.startsAt === startsAt && existing.endsAt === endsAt;
    if (unchanged) return { questionId: existing._id, result: "unchanged" as const };
    await ctx.db.patch(existing._id, { eventDayId: day._id, prompt, options, sortOrder: args.sortOrder, startsAt, endsAt, updatedAt: now });
    return { questionId: existing._id, result: "updated" as const };
  },
});

/**
 * Draft → published. The daily entitlement is checked against the tier in
 * force NOW: Starter 1, Advanced 5 per fair day; every question of that model
 * and day that was ever published (published or closed) counts, so on the
 * upgrade day the Starter question counts toward the 5 (HANDOFF §4.1, §5.3).
 */
export const publishAudienceQuestion = mutation({
  args: { questionId: v.id("fairAudienceQuestions") },
  returns: v.object({ status: fairAudienceQuestionStatus, remainingForDay: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const question = await requireQuestion(ctx, args.questionId);
    const model = await requireModel(ctx, question.eventModelId);
    const tier = await fairModelTierAt(ctx, model, now);
    if (getFairEntitlements(tier).audienceQuestionsPerDay === 0) fairAdminError("FAIR_FEATURE_NOT_ENTITLED", { feature: "audienceQuestions" });
    const sameDay = await ctx.db
      .query("fairAudienceQuestions")
      .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id).eq("eventDayId", question.eventDayId))
      .take(QUESTIONS_PER_MODEL_CAP);
    const used = sameDay.filter((row) => row.status !== "draft").length;
    if (question.status === "published") return { status: question.status, remainingForDay: fairAudienceQuestionsRemaining(tier, used) };
    if (question.status !== "draft") fairAdminError("FAIR_QUESTION_STATUS", { status: question.status });
    if (fairAudienceQuestionsRemaining(tier, used) < 1) fairAdminError("FAIR_QUESTION_DAY_LIMIT", { tier, used });
    await ctx.db.patch(question._id, { status: "published", updatedAt: now });
    return { status: "published" as const, remainingForDay: fairAudienceQuestionsRemaining(tier, used + 1) };
  },
});

/**
 * Admin "Otvori odmah" (pre-event access, JOVAN-DELTA 2026-10-08b): publishes
 * a draft with the same daily limit as publishAudienceQuestion and opens it
 * from now, also before its fair day. A published question that starts later
 * opens now. The question stays on its fair day (quota, dashboard, results).
 */
export const openAudienceQuestionNow = mutation({
  args: { questionId: v.id("fairAudienceQuestions") },
  returns: v.object({ status: fairAudienceQuestionStatus, startsAt: v.number(), remainingForDay: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const question = await requireQuestion(ctx, args.questionId);
    if (question.status === "closed") fairAdminError("FAIR_QUESTION_STATUS", { status: question.status });
    if (question.endsAt !== undefined && question.endsAt <= now) fairAdminError("FAIR_QUESTION_STATUS", { field: "endsAt" });
    const model = await requireModel(ctx, question.eventModelId);
    const tier = await fairModelTierAt(ctx, model, now);
    if (getFairEntitlements(tier).audienceQuestionsPerDay === 0) fairAdminError("FAIR_FEATURE_NOT_ENTITLED", { feature: "audienceQuestions" });
    const sameDay = await ctx.db
      .query("fairAudienceQuestions")
      .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id).eq("eventDayId", question.eventDayId))
      .take(QUESTIONS_PER_MODEL_CAP);
    let used = sameDay.filter((row) => row.status !== "draft").length;
    if (question.status === "draft") {
      if (fairAudienceQuestionsRemaining(tier, used) < 1) fairAdminError("FAIR_QUESTION_DAY_LIMIT", { tier, used });
      used += 1;
    }
    const startsAt = Math.min(question.startsAt, now);
    if (question.status !== "published" || startsAt !== question.startsAt) {
      await ctx.db.patch(question._id, { status: "published", startsAt, updatedAt: now });
    }
    return { status: "published" as const, startsAt, remainingForDay: fairAudienceQuestionsRemaining(tier, used) };
  },
});

/** Published → closed. Votes and the result stay in history; the question still counts toward its day. */
export const closeAudienceQuestion = mutation({
  args: { questionId: v.id("fairAudienceQuestions") },
  returns: v.object({ status: fairAudienceQuestionStatus }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const question = await requireQuestion(ctx, args.questionId);
    if (question.status === "closed") return { status: question.status };
    if (question.status !== "published") fairAdminError("FAIR_QUESTION_STATUS", { status: question.status });
    await ctx.db.patch(question._id, { status: "closed", updatedAt: Date.now() });
    return { status: "closed" as const };
  },
});

/**
 * The ONE question whose result accompanies an Advanced model in the
 * map/display rotation (manual choice, MASTER §9.1). `questionId: null` clears it.
 */
export const setSponsoredResultQuestion = mutation({
  args: { eventModelId: v.id("fairEventModels"), questionId: v.union(v.id("fairAudienceQuestions"), v.null()) },
  returns: v.object({ questionId: v.union(v.id("fairAudienceQuestions"), v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const model = await requireModel(ctx, args.eventModelId);
    if (!getFairEntitlements(await fairModelTierAt(ctx, model, now)).sponsoredMapRotation) {
      fairAdminError("FAIR_FEATURE_NOT_ENTITLED", { feature: "sponsoredMapRotation" });
    }
    if (args.questionId) {
      const chosen = await requireQuestion(ctx, args.questionId);
      if (chosen.eventModelId !== model._id) fairAdminError("FAIR_LINK_CONFLICT", { field: "questionId" });
      if (chosen.status === "draft") fairAdminError("FAIR_QUESTION_STATUS", { status: chosen.status });
    }
    for (const question of await fairModelQuestions(ctx, model._id)) {
      const want = question._id === args.questionId;
      if (question.showOnSponsoredRotation !== want) await ctx.db.patch(question._id, { showOnSponsoredRotation: want, updatedAt: now });
    }
    // Admin UX A9: the chosen result reaches the map without a manual publish.
    await syncFairSponsoredSnapshot(ctx, model.eventId, now, admin._id);
    return { questionId: args.questionId };
  },
});

// -----------------------------------------------------------------------------
// Survey (Advanced only, ≤5 yes_no / single_choice questions, versioned)
// -----------------------------------------------------------------------------

function normalizeSurveyQuestions(questions: ReadonlyArray<Doc<"fairSurveys">["questions"][number]>) {
  if (questions.length < 1 || questions.length > FAIR_SURVEY_MAX_QUESTIONS) fairAdminError("FAIR_SURVEY_INVALID", { field: "questions", max: FAIR_SURVEY_MAX_QUESTIONS });
  const ids = new Set<string>();
  const orders = new Set<number>();
  return questions
    .map((question) => {
      const id = question.id.trim();
      if (!OPTION_ID_PATTERN.test(id) || ids.has(id)) fairAdminError("FAIR_SURVEY_INVALID", { field: "questions.id" });
      if (!Number.isInteger(question.order) || orders.has(question.order)) fairAdminError("FAIR_SURVEY_INVALID", { field: "questions.order" });
      ids.add(id);
      orders.add(question.order);
      const prompt = question.prompt.trim();
      if (!prompt || prompt.length > 300) fairAdminError("FAIR_SURVEY_INVALID", { field: "questions.prompt" });
      const options = question.kind === "yes_no"
        ? (question.options.length ? fairAdminError("FAIR_SURVEY_INVALID", { field: "questions.options" }) : [])
        : normalizeOptions(question.options, FAIR_AUDIENCE_OPTIONS_MIN, FAIR_SURVEY_OPTIONS_MAX, "FAIR_SURVEY_INVALID");
      return { id, prompt, kind: question.kind, options, required: question.required, order: question.order };
    })
    .sort((a, b) => a.order - b.order);
}

async function requireSurveyModel(ctx: MutationCtx, eventModelId: Id<"fairEventModels">, now: number) {
  const model = await requireModel(ctx, eventModelId);
  if (!getFairEntitlements(await fairModelTierAt(ctx, model, now)).survey) fairAdminError("FAIR_FEATURE_NOT_ENTITLED", { feature: "survey" });
  return model;
}

/**
 * Edits the model's ONE draft version (or opens the next version). A
 * published or retired version is never edited in place (FAIR_SURVEY_LOCKED):
 * a new structure is a new version, so stored answers never change meaning.
 */
export const upsertSurveyDraft = mutation({
  args: {
    eventModelId: v.id("fairEventModels"),
    surveyId: v.optional(v.id("fairSurveys")),
    title: v.optional(v.string()),
    questions: v.array(fairSurveyQuestion),
  },
  returns: v.object({ surveyId: v.id("fairSurveys"), version: v.number(), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const model = await requireSurveyModel(ctx, args.eventModelId, now);
    const title = optionalText(args.title, "title", 160);
    const questions = normalizeSurveyQuestions(args.questions);
    const versions = await fairModelSurveys(ctx, model._id);
    const draft = args.surveyId ? versions.find((row) => row._id === args.surveyId) : versions.find((row) => row.status === "draft");
    if (args.surveyId && !draft) fairAdminError("FAIR_SURVEY_NOT_FOUND");
    if (draft && draft.status !== "draft") fairAdminError("FAIR_SURVEY_LOCKED", { status: draft.status });
    if (draft) {
      await ctx.db.patch(draft._id, { questions, ...(title ? { title } : { title: undefined }), updatedAt: now });
      return { surveyId: draft._id, version: draft.version, result: "updated" as const };
    }
    if (versions.length >= SURVEY_VERSIONS_PER_MODEL_CAP) fairAdminError("FAIR_SURVEY_INVALID", { field: "version" });
    const version = versions.reduce((max, row) => Math.max(max, row.version), 0) + 1;
    const surveyId = await ctx.db.insert("fairSurveys", {
      eventId: model.eventId,
      eventModelId: model._id,
      ...(title ? { title } : {}),
      status: "draft",
      questions,
      version,
      createdAt: now,
      updatedAt: now,
    });
    return { surveyId, version, result: "created" as const };
  },
});

/** Draft → published; the previously published version of the model is retired (its answers stay). */
export const publishSurvey = mutation({
  args: { surveyId: v.id("fairSurveys") },
  returns: v.object({ status: fairSurveyStatus, retiredSurveyIds: v.array(v.id("fairSurveys")) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) fairAdminError("FAIR_SURVEY_NOT_FOUND");
    if (survey.status === "published") return { status: survey.status, retiredSurveyIds: [] };
    if (survey.status !== "draft") fairAdminError("FAIR_SURVEY_LOCKED", { status: survey.status });
    await requireSurveyModel(ctx, survey.eventModelId, now);
    normalizeSurveyQuestions(survey.questions);
    const retired: Id<"fairSurveys">[] = [];
    for (const row of await fairModelSurveys(ctx, survey.eventModelId)) {
      if (row.status !== "published") continue;
      await ctx.db.patch(row._id, { status: "retired", updatedAt: now });
      retired.push(row._id);
    }
    await ctx.db.patch(survey._id, { status: "published", updatedAt: now });
    return { status: "published" as const, retiredSurveyIds: retired };
  },
});

/** Published → retired (no new submits; stored answers stay). */
export const retireSurvey = mutation({
  args: { surveyId: v.id("fairSurveys") },
  returns: v.object({ status: fairSurveyStatus }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) fairAdminError("FAIR_SURVEY_NOT_FOUND");
    if (survey.status === "retired") return { status: survey.status };
    if (survey.status !== "published") fairAdminError("FAIR_SURVEY_LOCKED", { status: survey.status });
    await ctx.db.patch(survey._id, { status: "retired", updatedAt: Date.now() });
    return { status: "retired" as const };
  },
});

// -----------------------------------------------------------------------------
// Brand passport (HANDOFF §5.5, MASTER §11)
// -----------------------------------------------------------------------------

/** Exhibited (non-withdrawn) models of one brand on one event, bounded. */
async function brandModels(ctx: MutationCtx, eventId: Id<"fairEvents">, brandId: Id<"brands">) {
  const models = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", eventId).eq("brandId", brandId))
    .take(PASSPORT_MODELS_CAP + 1);
  if (models.length > PASSPORT_MODELS_CAP) fairAdminError("FAIR_PASSPORT_NOT_ELIGIBLE", { reason: "too_many_models" });
  return models.filter((model) => model.status !== "withdrawn");
}

/**
 * Publish rule: ≥2 exhibited models, every one published, marked as a
 * passport candidate (`passportEligible`, DATA-INTAKE §6.3) and Starter or
 * Advanced. Returns the first reason or null. A7: the rules live in
 * fairBrandPassportProblems, shared with the automatic passport; one
 * exhibitor per brand stays FAIR_LINK_CONFLICT here.
 */
function passportProblem(models: readonly Doc<"fairEventModels">[]): string | null {
  const check = fairBrandPassportProblems(models.map((model) => ({ status: model.status, passportEligible: model.passportEligible, packageTier: model.packageTier })));
  return check.problems[0]?.code ?? null;
}

/** Opens (or returns) the brand's draft passport on the event. Idempotent by event + brand. */
export const upsertPassport = mutation({
  args: { eventId: v.id("fairEvents"), brandId: v.id("brands") },
  returns: v.object({ passportId: v.id("fairPassportConfigs"), result: upsertResult, problem: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    if (!(await ctx.db.get(args.eventId))) fairAdminError("FAIR_EVENT_NOT_FOUND");
    if (!(await ctx.db.get(args.brandId))) fairAdminError("FAIR_LINK_NOT_FOUND", { link: "brand" });
    const models = await brandModels(ctx, args.eventId, args.brandId);
    const participations = new Set(models.map((model) => model.participationId));
    if (!models.length) fairAdminError("FAIR_PASSPORT_NOT_ELIGIBLE", { reason: "fewer_than_two_models" });
    if (participations.size > 1) fairAdminError("FAIR_LINK_CONFLICT", { field: "participationId" });
    const existing = await ctx.db
      .query("fairPassportConfigs")
      .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", args.eventId).eq("brandId", args.brandId))
      .first();
    if (existing) return { passportId: existing._id, result: "unchanged" as const, problem: existing.status === "draft" ? passportProblem(models) : null };
    const passportId = await ctx.db.insert("fairPassportConfigs", {
      eventId: args.eventId,
      brandId: args.brandId,
      participationId: models[0].participationId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return { passportId, result: "created" as const, problem: passportProblem(models) };
  },
});

/**
 * Validates, freezes and publishes: the eligible set is written as `required`
 * rows and never rebuilt. Allowed at any time (pre-event access, JOVAN-DELTA
 * 2026-10-08b; was: only before the opening). From now on a scan of a member
 * stamps (B2 hook stampFairPassportOnScan).
 */
export const publishPassport = mutation({
  args: { passportId: v.id("fairPassportConfigs") },
  returns: v.object({ status: fairPassportConfigStatus, requiredModelIds: v.array(v.id("fairEventModels")) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const passport = await ctx.db.get(args.passportId);
    if (!passport) fairAdminError("FAIR_PASSPORT_NOT_FOUND");
    const members = await ctx.db
      .query("fairPassportEligibleModels")
      .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", passport._id).eq("status", "required"))
      .take(PASSPORT_MODELS_CAP);
    if (passport.status === "published") return { status: passport.status, requiredModelIds: members.map((row) => row.eventModelId) };
    if (passport.status !== "draft" || passport.frozenAt !== undefined) fairAdminError("FAIR_PASSPORT_FROZEN", { status: passport.status });
    const event = await ctx.db.get(passport.eventId);
    if (!event) fairAdminError("FAIR_EVENT_NOT_FOUND");
    const models = await brandModels(ctx, passport.eventId, passport.brandId);
    const problem = passportProblem(models);
    if (problem) fairAdminError("FAIR_PASSPORT_NOT_ELIGIBLE", { reason: problem });
    if (models.some((model) => model.participationId !== passport.participationId)) fairAdminError("FAIR_LINK_CONFLICT", { field: "participationId" });
    for (const model of models) {
      await ctx.db.insert("fairPassportEligibleModels", {
        passportConfigId: passport._id,
        eventId: passport.eventId,
        brandId: passport.brandId,
        eventModelId: model._id,
        status: "required",
        createdAt: now,
      });
    }
    await ctx.db.patch(passport._id, { status: "published", frozenAt: now, publishedAt: now, updatedAt: now });
    return { status: "published" as const, requiredModelIds: models.map((model) => model._id) };
  },
});

/**
 * Published → withdrawn: no new stamps or favorites; earned stamps and
 * favorites stay stored. A7: a manual withdrawal also freezes the passport
 * (`frozenAt` = now when it was later), so the automatic sync never
 * publishes it again — the admin's decision wins. Hiding (fairPassports
 * .setPassportHidden) is the reversible way.
 */
export const withdrawPassport = mutation({
  args: { passportId: v.id("fairPassportConfigs") },
  returns: v.object({ status: fairPassportConfigStatus }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const passport = await ctx.db.get(args.passportId);
    if (!passport) fairAdminError("FAIR_PASSPORT_NOT_FOUND");
    if (passport.status === "withdrawn") return { status: passport.status };
    await ctx.db.patch(passport._id, {
      status: "withdrawn",
      ...(passport.frozenAt === undefined || passport.frozenAt > now ? { frozenAt: now } : {}),
      updatedAt: now,
    });
    return { status: "withdrawn" as const };
  },
});

/**
 * Emergency removal of a withdrawn car from the frozen required set (MASTER
 * §11). Flips the member to `removed`; no stamp is deleted, so nobody loses
 * earned progress — M shrinks for everyone.
 */
export const removePassportModel = mutation({
  args: { passportId: v.id("fairPassportConfigs"), eventModelId: v.id("fairEventModels") },
  returns: v.object({ status: fairPassportEligibleStatus, requiredCount: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const passport = await ctx.db.get(args.passportId);
    if (!passport) fairAdminError("FAIR_PASSPORT_NOT_FOUND");
    const memberships = await ctx.db
      .query("fairPassportEligibleModels")
      .withIndex("by_eventModelId", (q) => q.eq("eventModelId", args.eventModelId))
      .take(8);
    const member = memberships.find((row) => row.passportConfigId === passport._id);
    if (!member) fairAdminError("FAIR_MODEL_NOT_FOUND");
    if (member.status === "required") {
      await ctx.db.patch(member._id, { status: "removed", removedAt: now, removedByUserId: admin._id });
      await ctx.db.patch(passport._id, { updatedAt: now });
    }
    const required = await ctx.db
      .query("fairPassportEligibleModels")
      .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", passport._id).eq("status", "required"))
      .take(PASSPORT_MODELS_CAP);
    return { status: "removed" as const, requiredCount: required.length };
  },
});

// -----------------------------------------------------------------------------
// Admin reads
// -----------------------------------------------------------------------------

const questionRow = v.object({
  _id: v.id("fairAudienceQuestions"),
  eventModelId: v.id("fairEventModels"),
  eventDayId: v.id("fairEventDays"),
  externalKey: v.optional(v.string()),
  prompt: v.string(),
  options: v.array(fairChoiceOption),
  status: fairAudienceQuestionStatus,
  sortOrder: v.number(),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  showOnSponsoredRotation: v.boolean(),
});

const surveyRow = v.object({
  _id: v.id("fairSurveys"),
  eventModelId: v.id("fairEventModels"),
  title: v.optional(v.string()),
  status: fairSurveyStatus,
  questions: v.array(fairSurveyQuestion),
  version: v.number(),
});

const passportRow = v.object({
  _id: v.id("fairPassportConfigs"),
  brandId: v.id("brands"),
  participationId: v.id("fairParticipations"),
  status: fairPassportConfigStatus,
  frozenAt: v.optional(v.number()),
  publishedAt: v.optional(v.number()),
  // A7 — hidden from visitors (fairPassports.setPassportHidden).
  hiddenAt: v.optional(v.number()),
  members: v.array(v.object({ eventModelId: v.id("fairEventModels"), status: fairPassportEligibleStatus, removedAt: v.optional(v.number()) })),
});

/** Questions, survey versions and passports of one event for the `Događaji` tab (bounded). No visitor data. */
export const getEventInteractions = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({ questions: v.array(questionRow), surveys: v.array(surveyRow), passports: v.array(passportRow) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const questions = await ctx.db
      .query("fairAudienceQuestions")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", args.eventId))
      .take(FAIR_ADMIN_LIST_LIMIT);
    const advanced = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", args.eventId).eq("packageTier", "advanced"))
      .take(FAIR_ADMIN_LIST_LIMIT);
    const surveys: Doc<"fairSurveys">[] = [];
    for (const model of advanced) surveys.push(...(await fairModelSurveys(ctx, model._id)));
    const configs = await ctx.db
      .query("fairPassportConfigs")
      .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", args.eventId))
      .take(PASSPORTS_PER_EVENT_CAP);
    const passports = [];
    for (const config of configs) {
      const members = await ctx.db
        .query("fairPassportEligibleModels")
        .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", config._id))
        .take(PASSPORT_MODELS_CAP * 2);
      passports.push({
        _id: config._id,
        brandId: config.brandId,
        participationId: config.participationId,
        status: config.status,
        ...(config.frozenAt !== undefined ? { frozenAt: config.frozenAt } : {}),
        ...(config.publishedAt !== undefined ? { publishedAt: config.publishedAt } : {}),
        ...(config.hiddenAt !== undefined ? { hiddenAt: config.hiddenAt } : {}),
        members: members.map((row) => ({ eventModelId: row.eventModelId, status: row.status, ...(row.removedAt !== undefined ? { removedAt: row.removedAt } : {}) })),
      });
    }
    return {
      questions: questions.map((row) => ({
        _id: row._id,
        eventModelId: row.eventModelId,
        eventDayId: row.eventDayId,
        ...(row.externalKey !== undefined ? { externalKey: row.externalKey } : {}),
        prompt: row.prompt,
        options: row.options,
        status: row.status,
        sortOrder: row.sortOrder,
        startsAt: row.startsAt,
        ...(row.endsAt !== undefined ? { endsAt: row.endsAt } : {}),
        showOnSponsoredRotation: row.showOnSponsoredRotation,
      })),
      surveys: surveys.map((row) => ({
        _id: row._id,
        eventModelId: row.eventModelId,
        ...(row.title !== undefined ? { title: row.title } : {}),
        status: row.status,
        questions: row.questions,
        version: row.version,
      })),
      passports,
    };
  },
});

/**
 * Admin/report projection of one model's interactions: rating count, sum and
 * average per field (the ONLY place they are read) and vote counts per
 * question option. Survey answers and favorites go to B6 reports.
 */
export const getModelInteractionSummary = query({
  args: { eventModelId: v.id("fairEventModels") },
  returns: v.object({
    ratings: v.array(v.object({ field: v.string(), count: v.number(), sum: v.number(), average: v.union(v.number(), v.null()) })),
    questions: v.array(v.object({
      questionId: v.id("fairAudienceQuestions"),
      total: v.number(),
      options: v.array(v.object({ optionId: v.string(), count: v.number() })),
    })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const ratings = await fairRatingSummary(ctx, args.eventModelId);
    const questions = [];
    for (const question of await fairModelQuestions(ctx, args.eventModelId)) {
      if (question.status === "draft") continue;
      const { options, counts } = await fairAudienceOptionCounts(ctx, question);
      questions.push({
        questionId: question._id,
        total: counts.reduce((sum, count) => sum + count, 0),
        options: options.map((option, index) => ({ optionId: option.id, count: counts[index] })),
      });
    }
    return { ratings, questions };
  },
});
