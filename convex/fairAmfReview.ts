import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { fairSpecification } from "./lib/fairValidators";
import { removePreEventRow } from "./fairPreEvent";

// Narrow, compare-before-write operations for the owner's 30 Oct live review.
// CLI/internal only; backups and DEV rehearsal precede the production calls.
export const applySpecs = internalMutation({
  args: { models: v.array(v.object({
    slug: v.string(),
    expectedSpecifications: v.array(fairSpecification),
    specifications: v.array(fairSpecification),
    expectedSecondary: v.optional(v.string()),
    priceSecondaryText: v.optional(v.string()),
  })) },
  returns: v.object({ updated: v.number(), unchanged: v.number() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.query("fairEvents").withIndex("by_code", q => q.eq("code", "auto-moto-fest-2026")).unique();
    if (!event || args.models.length !== 18 || new Set(args.models.map(m => m.slug)).size !== 18) throw new Error("AMF_REVIEW_SCOPE");
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
      if (same(model.specifications, change.specifications) && model.priceSecondaryText === change.priceSecondaryText) continue;
      if (!same(model.specifications, change.expectedSpecifications) || model.priceSecondaryText !== change.expectedSecondary) throw new Error("AMF_REVIEW_STALE");
      await ctx.db.patch(model._id, { specifications: change.specifications, priceSecondaryText: change.priceSecondaryText, updatedAt: Date.now() });
      updated++;
    }
    return { updated, unchanged: 18 - updated };
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
