import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { fairSpecification } from "./lib/fairValidators";
import { removePreEventRow } from "./fairPreEvent";
import { countFairScan } from "./lib/fairScans";

// Narrow, compare-before-write operations for the owner's 30 Oct live review.
// CLI/internal only; backups and DEV rehearsal precede the production calls.
export const applySpecs = internalMutation({
  args: { models: v.array(v.object({
    slug: v.string(),
    expectedSpecifications: v.array(fairSpecification),
    specifications: v.array(fairSpecification),
    expectedSecondary: v.optional(v.string()),
    priceSecondaryText: v.optional(v.string()),
    // Hotfix 30 Oct 2026: the main price may change too, compared like the rest.
    expectedPriceText: v.optional(v.string()),
    priceText: v.optional(v.string()),
  })) },
  returns: v.object({ updated: v.number(), unchanged: v.number() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.query("fairEvents").withIndex("by_code", q => q.eq("code", "auto-moto-fest-2026")).unique();
    // Hotfix 30 Oct 2026: a call may carry part of the 18 models (CLI argument size).
    if (!event || args.models.length < 1 || args.models.length > 18 || new Set(args.models.map(m => m.slug)).size !== args.models.length) throw new Error("AMF_REVIEW_SCOPE");
    const models = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", q => q.eq("eventId", event._id)).take(200);
    if (models.length >= 200) throw new Error("AMF_REVIEW_SCOPE");
    const same = (a: typeof args.models[number]["specifications"], b: typeof a) => {
      const values = (items: typeof a) => items.map(s => [s.id, s.groupId, s.groupLabel, s.groupOrder, s.order, s.label, s.value, s.isHighlight]);
      return JSON.stringify(values(a)) === JSON.stringify(values(b));
    };
    let updated = 0;
    for (const change of args.models) {
      const model = models.find(m => m.slug === change.slug);
      if (!model) throw new Error("AMF_REVIEW_MODEL_MISSING");
      const priceText = change.priceText ?? model.priceText;
      if (same(model.specifications, change.specifications) && model.priceSecondaryText === change.priceSecondaryText && model.priceText === priceText) continue;
      if (!same(model.specifications, change.expectedSpecifications) || model.priceSecondaryText !== change.expectedSecondary || (change.priceText !== undefined && model.priceText !== change.expectedPriceText)) throw new Error("AMF_REVIEW_STALE");
      await ctx.db.patch(model._id, { specifications: change.specifications, priceSecondaryText: change.priceSecondaryText, priceText, updatedAt: Date.now() });
      updated++;
    }
    return { updated, unchanged: args.models.length - updated };
  },
});

export const removeAccidentalVote = internalMutation({
  args: { expectedVoteId: v.id("fairAudienceVotes"), expectedUpdatedAt: v.number() },
  returns: v.object({ deleted: v.number(), counterCorrected: v.boolean() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.query("fairEvents").withIndex("by_code", q => q.eq("code", "auto-moto-fest-2026")).unique();
    if (!event) throw new Error("AMF_REVIEW_SCOPE");
    const model = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_slug", q => q.eq("eventId", event._id).eq("slug", "skoda-octavia")).unique();
    if (!model) throw new Error("AMF_REVIEW_SCOPE");
    const questions = await ctx.db.query("fairAudienceQuestions").withIndex("by_eventModelId_and_eventDayId", q => q.eq("eventModelId", model._id)).take(100);
    const from = Date.parse("2026-10-30T08:26:00+01:00");
    const to = Date.parse("2026-10-30T08:31:00+01:00");
    const candidates = [];
    for (const question of questions.filter(q => q.prompt === "Koji Škoda automobil sa našeg štanda vam je privukao najviše pažnje?")) {
      const votes = await ctx.db.query("fairAudienceVotes").withIndex("by_questionId_and_updatedAt", q => q.eq("questionId", question._id)).take(1001);
      if (votes.length > 1000) throw new Error("AMF_VOTE_AMBIGUOUS");
      candidates.push(...votes.filter(vote => vote.createdAt >= from && vote.createdAt < to));
    }
    if (!candidates.length && !await ctx.db.get(args.expectedVoteId)) return { deleted: 0, counterCorrected: false };
    if (candidates.length !== 1 || candidates[0]._id !== args.expectedVoteId || candidates[0].updatedAt !== args.expectedUpdatedAt) throw new Error("AMF_VOTE_AMBIGUOUS");
    const vote = candidates[0];
    await removePreEventRow(ctx, event, "audience_votes", vote);
    return { deleted: 1, counterCorrected: vote.isAdminExcluded !== true };
  },
});

/** Removes only this review's explicitly marked synthetic DEV lead and outbox. */
export const removeReviewLead = internalMutation({
  args: { leadId: v.id("fairLeads") },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return { deleted: 0 };
    const event = await ctx.db.get(lead.eventId);
    if (event?.code !== "auto-moto-fest-2026" || lead.contactName !== "TEST AMF REVIEW DELETE" || lead.email !== "amf-review-20261030@example.invalid") throw new Error("AMF_REVIEW_NOT_TEST_LEAD");
    await removePreEventRow(ctx, event, "leads", lead);
    return { deleted: 1 };
  },
});

/**
 * Owner decision of 30 Oct 2026 (MASTER §20): AMF admin scans count. Backfills
 * the AMF scans that were not counted: every admin-excluded fairScanEvents row
 * gets its unique row, scan counters and passport stamp at its own time, and
 * becomes a counted row. Idempotent per requestId: a counted row is never
 * touched again. Generic sticker scans without any fair row are only reported
 * (no visitor is known for them).
 */
export const backfillAmfScans = internalMutation({
  args: { dryRun: v.boolean() },
  returns: v.object({
    adminExcludedFound: v.number(),
    restored: v.number(),
    stampsAdded: v.number(),
    genericWithoutFairRow: v.number(),
  }),
  handler: async (ctx, args) => {
    const event = await ctx.db.query("fairEvents").withIndex("by_code", q => q.eq("code", "auto-moto-fest-2026")).unique();
    if (!event) throw new Error("AMF_REVIEW_SCOPE");
    const rows = await ctx.db.query("fairScanEvents").withIndex("by_eventId_and_occurredAt", q => q.eq("eventId", event._id)).take(4001);
    if (rows.length > 4000) throw new Error("AMF_BACKFILL_TOO_MANY");
    const excluded = rows.filter(row => row.isAdminExcluded);
    let stampsAdded = 0;
    if (!args.dryRun) {
      for (const row of excluded) {
        const model = await ctx.db.get(row.eventModelId);
        if (!model) throw new Error("AMF_REVIEW_MODEL_MISSING");
        await ctx.db.patch(row._id, { isAdminExcluded: false });
        if (await countFairScan(ctx, { visitorId: row.visitorId, model, now: row.occurredAt }) === "stamped") stampsAdded++;
      }
    }
    const fairRequestIds = new Set(rows.map(row => row.requestId));
    const assignments = await ctx.db.query("fairQrAssignments").withIndex("by_eventId_and_status", q => q.eq("eventId", event._id)).take(500);
    let genericWithoutFairRow = 0;
    for (const assignment of assignments) {
      const scans = await ctx.db.query("cardScanEvents").withIndex("by_cardId_and_occurredAt", q => {
        const from = q.eq("cardId", assignment.cardId).gte("occurredAt", assignment.assignedAt);
        return assignment.releasedAt === undefined ? from : from.lt("occurredAt", assignment.releasedAt);
      }).take(4001);
      if (scans.length > 4000) throw new Error("AMF_BACKFILL_TOO_MANY");
      genericWithoutFairRow += scans.filter(scan => scan.targetKind === "fair_model" && !fairRequestIds.has(scan.requestId)).length;
    }
    return { adminExcludedFound: excluded.length, restored: args.dryRun ? 0 : excluded.length, stampsAdded, genericWithoutFairRow };
  },
});
