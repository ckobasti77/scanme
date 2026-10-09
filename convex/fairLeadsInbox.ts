import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import { fairModelTierAt } from "./lib/fairInteractions";
import { fairExhibitorModels, fairVisitorActivity } from "./lib/fairLeadActivity";
import { fairLeadDelivery } from "./lib/fairLeads";
import {
  fairEmailDeliveryStatus,
  fairLeadKind,
  fairLeadStatus,
  fairPackageTier,
  fairSponsoredActionKind,
  fairSurveyQuestionKind,
} from "./lib/fairValidators";
import { fairAnalyticsCutoff } from "./lib/fairPreEvent";

// =============================================================================
// Sajam automobila 2026 — Admin UX A8: the lead inbox (`Događaji → Leadovi`,
// ADMIN-UX §7; MASTER §8, §12, §13). Every function requires requireAdmin:
// contacts and activity are seen only by the ScanMe team.
//
// - listEventLeads: one paginated, indexed list per event, narrowed by
//   exhibitor or model (index), date (index range), kind and delivery
//   (filter over the bounded page). No activity in the list.
// - getLeadDetail: contact, consent snapshot, delivery, and the visitor's
//   activity ONLY on the models of the lead's exhibitor
//   (convex/lib/fairLeadActivity.ts) with "goes to the exhibitor" per group
//   by the package of the lead's model. Never the visitor id or hash.
// - markLeadsDelivered: received → delivered (one lead list or a whole
//   exhibitor, ≤200 per call with hasMore), audited. Delivery itself happens
//   outside the system over the agreed safe channel (P0.2), by 15 Nov.
// =============================================================================

/** At most this many leads per inbox page. */
const INBOX_PAGE_MAX = 50;
/** At most this many leads per "Označi isporučeno" call; the rest is `hasMore`. */
const DELIVER_BATCH_MAX = 200;

const deliveryView = v.union(
  v.null(),
  v.object({
    deliveryId: v.id("fairEmailDeliveries"),
    status: fairEmailDeliveryStatus,
    scheduledFor: v.number(),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  }),
);

const inboxRow = {
  leadId: v.id("fairLeads"),
  createdAt: v.number(),
  kind: fairLeadKind,
  eventModelId: v.id("fairEventModels"),
  participationId: v.id("fairParticipations"),
  contactName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  status: fairLeadStatus,
  deliveredAt: v.optional(v.number()),
  followUpSuppressed: v.boolean(),
  confirmation: deliveryView,
  followUp: deliveryView,
};

async function deliverySummary(ctx: QueryCtx, leadId: Id<"fairLeads">, kind: "immediate_confirmation" | "post_event_follow_up") {
  const row = await fairLeadDelivery(ctx, leadId, kind);
  if (!row) return null;
  return { deliveryId: row._id, status: row.status, scheduledFor: row.scheduledFor, attemptCount: row.attemptCount, ...(row.lastError ? { lastError: row.lastError } : {}) };
}

async function rowOf(ctx: QueryCtx, lead: Doc<"fairLeads">) {
  return {
    leadId: lead._id,
    createdAt: lead.createdAt,
    kind: lead.kind,
    eventModelId: lead.eventModelId,
    participationId: lead.participationId,
    contactName: lead.contactName,
    ...(lead.email !== undefined ? { email: lead.email } : {}),
    ...(lead.phone !== undefined ? { phone: lead.phone } : {}),
    status: lead.status,
    ...(lead.deliveredAt !== undefined ? { deliveredAt: lead.deliveredAt } : {}),
    followUpSuppressed: lead.followUpSuppressed,
    confirmation: await deliverySummary(ctx, lead._id, "immediate_confirmation"),
    followUp: await deliverySummary(ctx, lead._id, "post_event_follow_up"),
  };
}

/**
 * The event's leads, newest first. The most selective index is used: model,
 * else exhibitor, else the event; `from`/`to` (epoch ms, `to` exclusive) are
 * the index range; `kind` and `delivered` filter the bounded page. A brand
 * filter is applied by the screen (brand → exhibitor here, models there).
 * Pre-event leads (before the opening, JOVAN-DELTA 2026-10-08b) are left out
 * unless `includePreEvent`: this list is the hand-over to exhibitors.
 */
export const listEventLeads = query({
  args: {
    eventId: v.id("fairEvents"),
    participationId: v.optional(v.id("fairParticipations")),
    eventModelId: v.optional(v.id("fairEventModels")),
    kind: v.optional(fairLeadKind),
    delivered: v.optional(v.boolean()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    includePreEvent: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(v.object(inboxRow)),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    if (args.paginationOpts.numItems > INBOX_PAGE_MAX) fairAdminError("INVALID_INPUT", { field: "numItems", max: INBOX_PAGE_MAX });
    const from = args.includePreEvent ? (args.from ?? 0) : Math.max(args.from ?? 0, fairAnalyticsCutoff(event));
    const to = args.to ?? Number.MAX_SAFE_INTEGER;
    let indexed;
    if (args.eventModelId) {
      const model = await ctx.db.get(args.eventModelId);
      if (!model || model.eventId !== event._id) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "eventModelId" });
      indexed = ctx.db.query("fairLeads").withIndex("by_eventModelId_and_createdAt", (q) => q.eq("eventModelId", model._id).gte("createdAt", from).lt("createdAt", to));
    } else if (args.participationId) {
      const participation = await ctx.db.get(args.participationId);
      if (!participation || participation.eventId !== event._id) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
      indexed = ctx.db.query("fairLeads").withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", participation._id).gte("createdAt", from).lt("createdAt", to));
    } else {
      indexed = ctx.db.query("fairLeads").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).gte("createdAt", from).lt("createdAt", to));
    }
    let ordered = indexed.order("desc");
    // Admin-session test leads are shown only with includePreEvent, like the
    // pre-event test leads (JOVAN-DELTA 2026-10-09).
    if (!args.includePreEvent) ordered = ordered.filter((q) => q.neq(q.field("isAdminExcluded"), true));
    const { kind, delivered } = args;
    if (kind !== undefined) ordered = ordered.filter((q) => q.eq(q.field("kind"), kind));
    if (delivered !== undefined) ordered = ordered.filter((q) => (delivered ? q.eq(q.field("status"), "delivered") : q.neq(q.field("status"), "delivered")));
    const page = await ordered.paginate(args.paginationOpts);
    const rows = [];
    for (const lead of page.page) rows.push(await rowOf(ctx, lead));
    return { ...page, page: rows };
  },
});

const at = v.number();
const groupBase = { shared: v.boolean(), capped: v.boolean() };
const activityView = v.object({
  tierAtLead: fairPackageTier,
  scans: v.optional(v.object({ ...groupBase, items: v.array(v.object({ eventModelId: v.id("fairEventModels"), firstAt: at, lastAt: at, count: v.number() })) })),
  ratings: v.optional(v.object({
    ...groupBase,
    items: v.array(v.object({
      eventModelId: v.id("fairEventModels"),
      at,
      overall: v.optional(v.number()),
      appearance: v.optional(v.number()),
      specifications: v.optional(v.number()),
      price: v.optional(v.number()),
    })),
  })),
  audienceVotes: v.optional(v.object({ ...groupBase, items: v.array(v.object({ eventModelId: v.id("fairEventModels"), at, prompt: v.string(), answer: v.string() })) })),
  surveyAnswers: v.optional(v.object({
    ...groupBase,
    items: v.array(v.object({
      eventModelId: v.id("fairEventModels"),
      at,
      answers: v.array(v.object({ prompt: v.string(), kind: fairSurveyQuestionKind, answer: v.string() })),
    })),
  })),
  passport: v.optional(v.object({
    ...groupBase,
    items: v.array(v.object({
      brandId: v.id("brands"),
      required: v.union(v.number(), v.null()),
      stamps: v.array(v.object({ eventModelId: v.id("fairEventModels"), at })),
      favoriteModelId: v.optional(v.id("fairEventModels")),
    })),
  })),
  sponsoredActions: v.optional(v.object({ ...groupBase, items: v.array(v.object({ eventModelId: v.id("fairEventModels"), kind: fairSponsoredActionKind, at })) })),
});

/**
 * One lead for the drawer: contact, the stored consent snapshot, delivery
 * (to the exhibitor and the two emails) and the visitor's activity on the
 * models of THIS exhibitor only. Nothing about another exhibitor, never the
 * visitor id, hash or request id.
 */
export const getLeadDetail = query({
  args: { leadId: v.id("fairLeads") },
  returns: v.union(
    v.null(),
    v.object({
      lead: v.object({ ...inboxRow, consentVersion: v.number(), consentTextSnapshot: v.string(), consentedAt: v.number(), suppressedAt: v.optional(v.number()) }),
      activity: activityView,
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;
    const model = await ctx.db.get(lead.eventModelId);
    const tierAtLead = model ? await fairModelTierAt(ctx, model, lead.createdAt) : "included";
    const models = await fairExhibitorModels(ctx, lead.participationId);
    const activity = await fairVisitorActivity(ctx, { visitorId: lead.visitorId, eventId: lead.eventId, tierAtLead, models });
    return {
      lead: {
        ...(await rowOf(ctx, lead)),
        consentVersion: lead.consentVersion,
        consentTextSnapshot: lead.consentTextSnapshot,
        consentedAt: lead.consentedAt,
        ...(lead.suppressedAt !== undefined ? { suppressedAt: lead.suppressedAt } : {}),
      },
      activity,
    };
  },
});

/**
 * Records that leads were handed to their exhibitor (MASTER §13: by 15 Nov):
 * the given leads, or every received lead of one exhibitor, received →
 * delivered with `deliveredAt`. At most DELIVER_BATCH_MAX per call; `hasMore`
 * says to call again. Leads of another event are refused. Audited.
 */
export const markLeadsDelivered = mutation({
  args: {
    eventId: v.id("fairEvents"),
    leadIds: v.optional(v.array(v.id("fairLeads"))),
    participationId: v.optional(v.id("fairParticipations")),
  },
  returns: v.object({ delivered: v.number(), unchanged: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const event = await requireFairEvent(ctx, args.eventId);
    if ((args.leadIds === undefined) === (args.participationId === undefined)) fairAdminError("INVALID_INPUT", { field: "leadIds" });
    let leads: Doc<"fairLeads">[];
    let hasMore = false;
    let participation: Doc<"fairParticipations"> | null = null;
    if (args.leadIds) {
      if (args.leadIds.length > DELIVER_BATCH_MAX) fairAdminError("FAIR_BULK_TOO_LARGE", { max: DELIVER_BATCH_MAX });
      leads = [];
      for (const leadId of args.leadIds) {
        const lead = await ctx.db.get(leadId);
        if (!lead) fairAdminError("FAIR_LEAD_NOT_FOUND");
        if (lead.eventId !== event._id) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "leadIds" });
        leads.push(lead);
      }
    } else {
      participation = await ctx.db.get(args.participationId!);
      if (!participation || participation.eventId !== event._id) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
      const found = await ctx.db
        .query("fairLeads")
        .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", participation!._id))
        .filter((q) => q.neq(q.field("status"), "delivered"))
        // An admin-session test lead is never handed to an exhibitor (JOVAN-DELTA 2026-10-09).
        .filter((q) => q.neq(q.field("isAdminExcluded"), true))
        .take(DELIVER_BATCH_MAX + 1);
      hasMore = found.length > DELIVER_BATCH_MAX;
      leads = found.slice(0, DELIVER_BATCH_MAX);
    }
    let delivered = 0;
    let unchanged = 0;
    for (const lead of leads) {
      if (lead.status === "delivered") {
        unchanged += 1;
        continue;
      }
      await ctx.db.patch(lead._id, { status: "delivered", deliveredAt: now });
      delivered += 1;
    }
    if (delivered) {
      await writeAdminAudit(ctx, {
        actorUserId: admin._id,
        ...(participation ? { accountId: participation.accountId, businessId: participation.businessId } : {}),
        action: "fair_leads_delivered",
        detail: { eventId: event._id, ...(participation ? { participationId: participation._id } : {}), delivered },
        now,
      });
    }
    return { delivered, unchanged, hasMore };
  },
});
