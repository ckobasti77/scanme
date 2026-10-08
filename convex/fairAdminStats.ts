import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/access";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import { fairQrKindOf, fairQrModelFactsLoader } from "./lib/fairQr";
import { fairModelStatus, fairQrKind } from "./lib/fairValidators";
import { FAIR_ADMIN_LIST_LIMIT } from "../lib/fair-contract";

// Admin UX A3 — read-only numbers for the `Modeli` list and the model detail
// (also used by Izlagači in A5 and Pregled in A10). Admin only, no visitor or
// contact PII in the result. Every read is indexed and bounded; nothing is
// written.

/** Lead rows read per call across the whole event; above it the counts are partial (`capped`). */
export const FAIR_LEAD_COUNT_LIMIT = 4000;

/**
 * Leads per model and per participation of one event: `fairLeads` by
 * participation (`by_participationId_and_createdAt`), within one shared
 * budget. `undelivered` = not yet marked as delivered to the exhibitor.
 */
export const getLeadCounts = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    byModel: v.array(v.object({ eventModelId: v.id("fairEventModels"), interest: v.number(), testDrive: v.number(), undelivered: v.number() })),
    byParticipation: v.array(v.object({ participationId: v.id("fairParticipations"), total: v.number(), undelivered: v.number() })),
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const participations = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
      .take(FAIR_ADMIN_LIST_LIMIT + 1);
    if (participations.length > FAIR_ADMIN_LIST_LIMIT) fairAdminError("INVALID_INPUT", { reason: "catalog_limit" });

    const byModel = new Map<Id<"fairEventModels">, { interest: number; testDrive: number; undelivered: number }>();
    const byParticipation: { participationId: Id<"fairParticipations">; total: number; undelivered: number }[] = [];
    let budget = FAIR_LEAD_COUNT_LIMIT;
    let capped = false;
    for (const participation of participations) {
      if (budget <= 0) {
        capped = true;
        break;
      }
      // P1: pre-event leads (before the event's start) are in no admin count.
      const leads = await ctx.db
        .query("fairLeads")
        .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", participation._id).gte("createdAt", event.startsAt))
        .take(budget + 1);
      if (leads.length > budget) {
        capped = true;
        leads.length = budget;
      }
      budget -= leads.length;
      let undelivered = 0;
      for (const lead of leads) {
        const row = byModel.get(lead.eventModelId) ?? { interest: 0, testDrive: 0, undelivered: 0 };
        if (lead.kind === "interest") row.interest += 1;
        else row.testDrive += 1;
        if (lead.status !== "delivered") {
          row.undelivered += 1;
          undelivered += 1;
        }
        byModel.set(lead.eventModelId, row);
      }
      if (leads.length) byParticipation.push({ participationId: participation._id, total: leads.length, undelivered });
      if (capped) break;
    }
    return {
      byModel: [...byModel].map(([eventModelId, counts]) => ({ eventModelId, ...counts })),
      byParticipation,
      capped,
    };
  },
});

/**
 * Printed codes of the models with an active QR assignment in one event:
 * the resolver code and the SMQ serial from the assignment's access channel
 * (each channel read once by id; the assignments are bounded by the catalog
 * limit, like `getEventCatalog`).
 */
export const getModelQrCodes = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.array(v.object({
    eventModelId: v.id("fairEventModels"),
    resolverCode: v.string(),
    smqCode: v.union(v.string(), v.null()),
    // N1: the printed label, the kind of the code and the car as the field team names it.
    label: v.string(),
    kind: fairQrKind,
    modelStatus: v.union(fairModelStatus, v.null()),
    exhibitorName: v.union(v.string(), v.null()),
    standCode: v.union(v.string(), v.null()),
    standName: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const assignments = await ctx.db
      .query("fairQrAssignments")
      .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", "assigned"))
      .take(FAIR_ADMIN_LIST_LIMIT + 1);
    if (assignments.length > FAIR_ADMIN_LIST_LIMIT) fairAdminError("INVALID_INPUT", { reason: "catalog_limit" });
    const facts = fairQrModelFactsLoader(ctx);
    const [channels, cards, subjects, models] = await Promise.all([
      Promise.all(assignments.map((row) => ctx.db.get(row.accessChannelId))),
      Promise.all(assignments.map((row) => ctx.db.get(row.cardId))),
      Promise.all(assignments.map((row) => ctx.db.get(row.accessSubjectId))),
      Promise.all(assignments.map((row) => facts(row.eventModelId))),
    ]);
    return assignments.map((row, index) => ({
      eventModelId: row.eventModelId,
      resolverCode: row.resolverCode,
      smqCode: channels[index]?.smqCode ?? null,
      label: cards[index]?.label ?? row.resolverCode,
      kind: fairQrKindOf(subjects[index]),
      modelStatus: models[index]?.model.status ?? null,
      exhibitorName: models[index]?.exhibitorName ?? null,
      standCode: models[index]?.standCode ?? null,
      standName: models[index]?.standName ?? null,
    }));
  },
});
