import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { FairPassportState } from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { requireFairGateway } from "./lib/fairGateway";
import {
  QUESTIONS_PER_MODEL_CAP,
  fairInteractionError,
  fairPassportState,
  findFairVisitor,
  requireFairVisitorRow,
  requireVisitorHash,
} from "./lib/fairInteractions";
import { fairTimeKeys, stampFairPassportOnScan } from "./lib/fairScans";
import { fairPassportStateView } from "./lib/fairValidators";
import { removePreEventRow, type FairPreEventCategory } from "./fairPreEvent";

// =============================================================================
// Admin DEV tools on the public fair pages (JOVAN-DELTA 2026-10-09).
//
// Called only by app/api/fair/admin-dev with the admin's Convex Auth session
// AND the gateway secret: requireAdmin decides who may call, the gateway makes
// the cookie-derived visitorHash trustworthy. Every function touches only the
// rows of THAT visitor (the admin's own phone), never anyone else's.
// Everything written here is admin-excluded: no counter, report or export.
// =============================================================================

const gatewayArgs = { gatewaySecret: v.optional(v.string()), visitorHash: v.string() };
const ROWS_PER_CATEGORY = 200;
const GARAGE_FILL = 5;
/** Models offered by the sheet's pickers (QR "Simuliraj sken", passport pages). */
const PICKER_MODELS = 100;

async function requireAdminVisitor(ctx: QueryCtx | MutationCtx, args: { gatewaySecret?: string; visitorHash: string }) {
  const admin = await requireAdmin(ctx);
  requireFairGateway(args.gatewaySecret);
  requireVisitorHash(args.visitorHash);
  return admin;
}

async function requireEvent(ctx: QueryCtx | MutationCtx, eventId: string) {
  const id = ctx.db.normalizeId("fairEvents", eventId);
  const event = id ? await ctx.db.get(id) : null;
  if (!event) fairInteractionError("INVALID_INPUT", { field: "eventId" });
  return event;
}

async function requirePublishedModel(ctx: MutationCtx, eventModelId: string, eventId: Id<"fairEvents">) {
  const id = ctx.db.normalizeId("fairEventModels", eventModelId);
  const model = id ? await ctx.db.get(id) : null;
  if (!model || model.eventId !== eventId || model.status !== "published") fairInteractionError("FAIR_MODEL_NOT_FOUND");
  return model;
}

/** What the "Admin alati" sheet shows besides the page's own data. */
export const devState = query({
  args: { ...gatewayArgs, eventId: v.string(), eventModelId: v.optional(v.string()) },
  returns: v.object({
    passport: v.union(fairPassportStateView, v.null()),
    garageModelIds: v.array(v.string()),
    questionId: v.union(v.string(), v.null()),
    visitorKnown: v.boolean(),
    models: v.array(v.object({ id: v.string(), slug: v.string(), name: v.string(), brandName: v.string() })),
  }),
  handler: async (ctx, args) => {
    await requireAdminVisitor(ctx, args);
    const event = await requireEvent(ctx, args.eventId);
    const published = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_slug", (q) => q.eq("eventId", event._id))
      .filter((q) => q.eq(q.field("status"), "published"))
      .take(PICKER_MODELS);
    const brandNames = new Map<string, string>();
    for (const model of published) {
      if (!brandNames.has(model.brandId)) brandNames.set(model.brandId, (await ctx.db.get(model.brandId))?.name ?? "");
    }
    let questionId: string | null = null;
    const modelId = args.eventModelId ? ctx.db.normalizeId("fairEventModels", args.eventModelId) : null;
    if (modelId) {
      const now = Date.now();
      const questions = (await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", modelId))
        .take(QUESTIONS_PER_MODEL_CAP))
        .filter((question) => question.status !== "closed" && (question.endsAt === undefined || question.endsAt > now))
        .sort((a, b) => Number(b.status === "published") - Number(a.status === "published") || a.startsAt - b.startsAt);
      questionId = questions[0]?._id ?? null;
    }
    const passport: FairPassportState = await fairPassportState(ctx, event, args.visitorHash);
    return {
      passport,
      garageModelIds: published.slice(0, GARAGE_FILL).map((model) => model._id),
      questionId,
      visitorKnown: (await findFairVisitor(ctx, args.visitorHash)) !== null,
      models: published.map((model) => ({
        id: model._id as string,
        slug: model.slug,
        name: model.variant ? `${model.displayName} ${model.variant}` : model.displayName,
        brandName: brandNames.get(model.brandId) ?? "",
      })),
    };
  },
});

/** "Daj pečat …": as if the admin scanned these models — stamps only, never counted. */
export const grantStamps = mutation({
  args: { ...gatewayArgs, ipHash: v.optional(v.string()), eventId: v.string(), eventModelIds: v.array(v.string()) },
  returns: v.object({ stamped: v.number() }),
  handler: async (ctx, args) => {
    await requireAdminVisitor(ctx, args);
    if (args.eventModelIds.length === 0 || args.eventModelIds.length > 40) fairInteractionError("INVALID_INPUT", { field: "eventModelIds" });
    const event = await requireEvent(ctx, args.eventId);
    const now = Date.now();
    const visitorId = await requireFairVisitorRow(ctx, { visitorHash: args.visitorHash, ipHash: args.ipHash, now });
    let stamped = 0;
    for (const eventModelId of args.eventModelIds) {
      const model = await requirePublishedModel(ctx, eventModelId, event._id);
      if ((await stampFairPassportOnScan(ctx, { visitorId, model, now, adminExcluded: true })) === "stamped") stamped += 1;
    }
    return { stamped };
  },
});

/**
 * "Simuliraj sken": the admin-excluded audit row a real admin scan writes
 * (lib/fairScans.ts) plus the stamp a visitor's scan would give. No unique
 * scan and no counter.
 */
export const simulateScan = mutation({
  args: { ...gatewayArgs, ipHash: v.optional(v.string()), eventId: v.string(), eventModelId: v.string() },
  returns: v.object({ stamped: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdminVisitor(ctx, args);
    const event = await requireEvent(ctx, args.eventId);
    const model = await requirePublishedModel(ctx, args.eventModelId, event._id);
    const now = Date.now();
    const visitorId = await requireFairVisitorRow(ctx, { visitorHash: args.visitorHash, ipHash: args.ipHash, now });
    const time = fairTimeKeys(now);
    await ctx.db.insert("fairScanEvents", {
      requestId: `admin-dev-${crypto.randomUUID()}`,
      visitorId,
      eventId: model.eventId,
      eventModelId: model._id,
      standId: model.standId,
      brandId: model.brandId,
      occurredAt: now,
      dateKey: time.dateKey,
      hourKey: time.hourKey,
      isAdminExcluded: true,
      adminUserId: admin._id,
    });
    const result = await stampFairPassportOnScan(ctx, { visitorId, model, now, adminExcluded: true });
    return { stamped: result === "stamped" };
  },
});

const RESET_SCOPES = {
  passport: ["passport_stamps", "brand_favorites"],
  answers: ["survey_responses", "ratings", "audience_votes"],
  all: ["leads", "survey_responses", "ratings", "audience_votes", "brand_favorites", "passport_stamps", "sponsored_events"],
} as const satisfies Record<string, readonly FairPreEventCategory[]>;

/** The visitor's own rows of one category at this event (bounded). */
async function ownRows(ctx: MutationCtx, visitorId: Id<"fairVisitors">, eventId: Id<"fairEvents">, category: FairPreEventCategory) {
  const take = ROWS_PER_CATEGORY;
  const ofEvent = <T extends { eventId: Id<"fairEvents"> }>(rows: T[]) => rows.filter((row) => row.eventId === eventId);
  switch (category) {
    case "leads":
      return ofEvent(await ctx.db.query("fairLeads").withIndex("by_visitorId_and_eventModelId_and_kind", (q) => q.eq("visitorId", visitorId)).take(take));
    case "survey_responses":
      return ofEvent(await ctx.db.query("fairSurveyResponses").withIndex("by_visitorId_and_surveyId", (q) => q.eq("visitorId", visitorId)).take(take));
    case "ratings":
      return ofEvent(await ctx.db.query("fairRatings").withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", visitorId)).take(take));
    case "audience_votes":
      return ofEvent(await ctx.db.query("fairAudienceVotes").withIndex("by_visitorId_and_questionId", (q) => q.eq("visitorId", visitorId)).take(take));
    case "brand_favorites":
      return ctx.db.query("fairBrandFavoriteVotes").withIndex("by_visitorId_and_eventId_and_brandId", (q) => q.eq("visitorId", visitorId).eq("eventId", eventId)).take(take);
    case "passport_stamps":
      return ctx.db.query("fairPassportStamps").withIndex("by_visitorId_and_eventId_and_brandId", (q) => q.eq("visitorId", visitorId).eq("eventId", eventId)).take(take);
    case "sponsored_events":
      return ofEvent(await ctx.db.query("fairSponsoredEvents").withIndex("by_visitorId_and_occurredAt", (q) => q.eq("visitorId", visitorId)).take(take));
    default:
      return [] as Doc<"fairLeads">[];
  }
}

/**
 * "Resetuj pasoš" (passport), "Obriši moje odgovore" (answers) and "Resetuj
 * sve moje test podatke" (all): deletes the admin visitor's own rows at this
 * event. A row that was counted (created before the admin signed in) is taken
 * back out of the counters exactly like the pre-event reset does; an
 * admin-excluded row is only deleted. Scans stay (admin scans never count).
 */
export const resetMine = mutation({
  args: { ...gatewayArgs, eventId: v.string(), scope: v.union(v.literal("passport"), v.literal("answers"), v.literal("all")) },
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdminVisitor(ctx, args);
    const event = await requireEvent(ctx, args.eventId);
    const visitor = await findFairVisitor(ctx, args.visitorHash);
    if (!visitor) return { deleted: 0, more: false };
    let deleted = 0;
    let more = false;
    for (const category of RESET_SCOPES[args.scope]) {
      const rows = await ownRows(ctx, visitor._id, event._id, category);
      for (const row of rows) await removePreEventRow(ctx, event, category, row);
      deleted += rows.length;
      if (rows.length >= ROWS_PER_CATEGORY) more = true;
    }
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_admin_dev_reset",
      detail: { eventId: event._id, scope: args.scope, deleted },
      now: Date.now(),
    });
    return { deleted, more };
  },
});
