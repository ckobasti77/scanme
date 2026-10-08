import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { FAIR_PII_PURGE_AT_MS, fairIsPreEvent, fairModelPath } from "../lib/fair-contract";
import { buildFairReportEmail, fairLeadEmailMessage, fairReportEmailMessage, type FairLeadEmailMessage } from "./lib/fairEmails";
import { fairDailyReportFileName, fairReportDateText } from "./lib/fairReportFiles";
import { fairFollowUpValues, renderFairFollowUp } from "./lib/fairFollowUp";
import { fairPairFollowUpFacts, fairPairLeads } from "./lib/fairLeadActivity";
import {
  FAIR_EMAIL_CLAIM_LEASE_MS,
  FAIR_EMAIL_MAX_ATTEMPTS,
  FAIR_EMAIL_RETRY_DELAYS_MS,
  FAIR_EMAIL_STALE_MS,
  fairActiveExhibitorFollowUp,
  fairActiveFollowUpTemplate,
  fairExhibitorName,
  fairFollowUpEnabled,
  fairLeadDelivery,
  fairLeadsEnabled,
  fairModelFullName,
  scheduleFairEmailSend,
} from "./lib/fairLeads";

// =============================================================================
// Sajam automobila 2026 — B4 email outbox (BACKEND-HANDOFF §5.4, §9). All
// internal. A lead mutation only inserts a fairEmailDeliveries row and
// schedules convex/fairEmailSender.ts; the Node action claims the row here,
// sends through Resend with Idempotency-Key = dedupeKey, then marks it.
//
// Exactly-once rules:
//   - one row per dedupeKey (`fair-lead/<leadId>/<kind>`), created only in the
//     transaction that created the lead — a submit retry never adds one;
//   - only a `queued` row is claimed; `sent` is final;
//   - a retry reuses the same row and the same Idempotency-Key, so Resend
//     itself refuses a second delivery of the same message;
//   - a follow-up re-reads its lead at claim time and becomes `suppressed`
//     instead of being sent when an admin recorded the opt-out;
//   - K3: a lead email becomes `skipped` (lastError LEADS_DISABLED or
//     FOLLOW_UP_DISABLED) when its hard switch is off at claim time;
//   - Admin UX A8: one follow-up per (visitor email, exhibitor) pair — the
//     first claimed row sends with the exhibitor's text and merge fields, the
//     pair's other rows become `skipped` (FOLLOW_UP_MERGED); a suppression on
//     any lead of the pair suppresses the pair.
//
// B6 adds `daily_report` rows (one per send of an approved report run,
// dedupeKey `fair-report/<runId>/<n>`). The claim re-checks the run right
// before delivery: only a manually approved run (or an already sent one, for
// a resend) with its stored file is ever handed to the sender.
//
// N5: a claim stamps `claimedAt` (cleared by markSent/markFailed). While it is
// younger than FAIR_EMAIL_CLAIM_LEASE_MS a second sender of the same row
// skips, so a re-scheduled row is never sent twice in parallel. The 5-minute
// cron `requeueStaleDeliveries` re-schedules a `queued` row whose moment
// passed > 5 min ago (lost or crashed send) with the same dedupeKey — the
// Resend Idempotency-Key — so a send that did reach Resend is not repeated.
// =============================================================================

const deliveryArgs = { deliveryId: v.id("fairEmailDeliveries") };

/**
 * Called by the sender immediately before sending. Returns the message to
 * send or `skip` (not queued, not due yet, switch off, suppressed, missing data).
 */
export const claimDelivery = internalMutation({
  args: deliveryArgs,
  returns: v.union(
    v.object({ action: v.literal("skip") }),
    v.object({ action: v.literal("send"), message: fairLeadEmailMessage }),
    v.object({ action: v.literal("send_report"), report: fairReportEmailMessage }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const skip = { action: "skip" as const };
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "queued" || delivery.scheduledFor > now) return skip;
    // N5: another sender holds this row (a send in flight) — never a parallel second send.
    if (delivery.claimedAt !== undefined && now - delivery.claimedAt < FAIR_EMAIL_CLAIM_LEASE_MS) return skip;
    if (delivery.kind === "daily_report") {
      const run = delivery.reportRunId ? await ctx.db.get(delivery.reportRunId) : null;
      // The approval gate, again, immediately before delivery (MASTER §12).
      if (!run || run.approvedAt === undefined || (run.status !== "approved" && run.status !== "sent") || !run.dataset) {
        await ctx.db.patch(delivery._id, { status: "failed", lastError: "REPORT_NOT_SENDABLE", updatedAt: now });
        return skip;
      }
      if (!run.storageId) {
        await ctx.db.patch(delivery._id, { status: "failed", lastError: "REPORT_FILE_MISSING", updatedAt: now });
        return skip;
      }
      await ctx.db.patch(delivery._id, { attemptCount: delivery.attemptCount + 1, claimedAt: now, updatedAt: now });
      const email = buildFairReportEmail({
        eventTitle: run.dataset.eventTitle,
        dayLabel: run.dataset.dayLabel,
        dateText: fairReportDateText(run.dataset.windowStart),
        exhibitorName: run.dataset.exhibitorName,
        correction: run.correctionOfReportRunId !== undefined,
      });
      return {
        action: "send_report" as const,
        report: {
          dedupeKey: delivery.dedupeKey,
          recipient: delivery.recipient,
          ...email,
          storageId: run.storageId,
          fileName: fairDailyReportFileName(run.dataset, run.format),
        },
      };
    }
    if (delivery.kind !== "immediate_confirmation" && delivery.kind !== "post_event_follow_up") return skip;
    // K3: the hard switches, again, immediately before delivery. A switch that
    // was turned off after the row was queued closes it as `skipped`; nothing
    // is sent and the sender never sees the recipient.
    const switchOff =
      !fairLeadsEnabled() ? "LEADS_DISABLED"
      : delivery.kind === "post_event_follow_up" && !fairFollowUpEnabled() ? "FOLLOW_UP_DISABLED"
      : null;
    if (switchOff) {
      await ctx.db.patch(delivery._id, { status: "skipped", lastError: switchOff, updatedAt: now });
      return skip;
    }
    const lead = delivery.leadId ? await ctx.db.get(delivery.leadId) : null;
    const model = lead ? await ctx.db.get(lead.eventModelId) : null;
    const event = model ? await ctx.db.get(model.eventId) : null;
    const exhibitorName = lead ? await fairExhibitorName(ctx, lead.participationId) : null;
    if (!lead || !model || !event || !exhibitorName) {
      await ctx.db.patch(delivery._id, { status: "failed", lastError: "LEAD_MISSING", updatedAt: now });
      return skip;
    }

    let template: FairLeadEmailMessage["template"];
    let pairContactName: string | null = null;
    let pairModelNames: string | null = null;
    if (delivery.kind === "post_event_follow_up") {
      // P1: a lead from before the event's start never gets the follow-up
      // (also a row queued before P1); nothing is sent.
      if (fairIsPreEvent(lead.createdAt, event)) {
        await ctx.db.patch(delivery._id, { status: "skipped", lastError: "PRE_EVENT", updatedAt: now });
        return skip;
      }
      // MASTER §8: suppression is checked immediately before delivery.
      if (lead.followUpSuppressed) {
        await ctx.db.patch(delivery._id, { status: "suppressed", updatedAt: now });
        return skip;
      }
      // Admin UX A8 (ADMIN-UX §7): ONE follow-up per (visitor email, exhibitor).
      // Every Advanced lead still queues its own row at submit; the first row
      // of a pair that is claimed sends for the whole pair and closes its
      // queued siblings as skipped/FOLLOW_UP_MERGED, in this transaction.
      const pair = await fairPairLeads(ctx, lead.participationId, delivery.recipient);
      if (!pair.some((row) => row._id === lead._id)) pair.push(lead);
      if (pair.some((row) => row.followUpSuppressed)) {
        await ctx.db.patch(delivery._id, { status: "suppressed", updatedAt: now });
        return skip;
      }
      const queuedSiblings = [];
      for (const row of pair) {
        if (row._id === lead._id) continue;
        const sibling = await fairLeadDelivery(ctx, row._id, "post_event_follow_up");
        if (!sibling || sibling._id === delivery._id) continue;
        // Already sent, being sent (claimed) or failed for the pair (admin retry): this row is not a second email.
        if (sibling.status === "sent" || sibling.status === "failed" || (sibling.status === "queued" && sibling.attemptCount > 0)) {
          await ctx.db.patch(delivery._id, { status: "skipped", lastError: "FOLLOW_UP_MERGED", updatedAt: now });
          return skip;
        }
        if (sibling.status === "queued") queuedSiblings.push(sibling);
      }
      for (const sibling of queuedSiblings) {
        await ctx.db.patch(sibling._id, { status: "skipped", lastError: "FOLLOW_UP_MERGED", updatedAt: now });
      }
      // DATA-INTAKE §6.7: the body is the exhibitor's text — A8 the active text
      // of the exhibitor, else (B4 compatibility) the model's text; none →
      // nothing is invented.
      const active = (await fairActiveExhibitorFollowUp(ctx, lead.participationId)) ?? (await fairActiveFollowUpTemplate(ctx, model._id));
      if (!active) {
        await ctx.db.patch(delivery._id, { status: "failed", lastError: "FOLLOW_UP_TEMPLATE_MISSING", updatedAt: now });
        return skip;
      }
      const facts = await fairPairFollowUpFacts(ctx, { participationId: lead.participationId, leads: pair, eventTitle: event.title });
      const values = fairFollowUpValues(facts);
      template = renderFairFollowUp({ subject: active.subject, plainText: active.plainText }, values);
      pairContactName = values.ime;
      pairModelNames = values.modeli;
    }

    await ctx.db.patch(delivery._id, { attemptCount: delivery.attemptCount + 1, claimedAt: now, updatedAt: now });
    const confirmation = delivery.kind === "immediate_confirmation";
    const followUp = confirmation ? await fairLeadDelivery(ctx, lead._id, "post_event_follow_up") : null;
    // N5: the confirmation says where the car is and which contact was shared.
    const stand = confirmation ? await ctx.db.get(model.standId) : null;
    return {
      action: "send" as const,
      message: {
        kind: delivery.kind,
        dedupeKey: delivery.dedupeKey,
        recipient: delivery.recipient,
        leadKind: lead.kind,
        contactName: pairContactName ?? lead.contactName,
        // A8: the follow-up footer names every model of the pair.
        modelName: pairModelNames ?? fairModelFullName(model),
        exhibitorName,
        eventTitle: event.title,
        modelPath: fairModelPath(event.slug, model.slug),
        // K3: announce the reply-to-cancel option only while the follow-up can still go out.
        followUpScheduled: followUp !== null && fairFollowUpEnabled(),
        ...(template ? { template } : {}),
        ...(confirmation
          ? {
              venueName: event.venueName,
              ...(stand?.displayName.trim() ? { standName: stand.displayName.trim() } : {}),
              ...(lead.email ? { contactEmail: lead.email } : {}),
              ...(lead.phone ? { contactPhone: lead.phone } : {}),
            }
          : {}),
      },
    };
  },
});

export const markSent = internalMutation({
  args: { ...deliveryArgs, providerMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status === "sent") return null;
    const now = Date.now();
    await ctx.db.patch(delivery._id, { status: "sent", providerMessageId: args.providerMessageId, lastError: undefined, claimedAt: undefined, updatedAt: now });
    const run = delivery.reportRunId ? await ctx.db.get(delivery.reportRunId) : null;
    if (run) await ctx.db.patch(run._id, { status: "sent", providerMessageId: args.providerMessageId, error: undefined, updatedAt: now });
    return null;
  },
});

/**
 * A retryable failure re-queues the same row (same dedupeKey → same
 * Idempotency-Key) with backoff until FAIR_EMAIL_MAX_ATTEMPTS; otherwise the
 * row becomes `failed` and waits for an admin retry. `error` is a stable code.
 */
export const markFailed = internalMutation({
  args: { ...deliveryArgs, error: v.string(), retryable: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "queued") return null;
    const now = Date.now();
    const lastError = args.error.slice(0, 120);
    if (args.retryable && delivery.attemptCount < FAIR_EMAIL_MAX_ATTEMPTS) {
      const delay = FAIR_EMAIL_RETRY_DELAYS_MS[Math.max(0, delivery.attemptCount - 1)] ?? FAIR_EMAIL_RETRY_DELAYS_MS[FAIR_EMAIL_RETRY_DELAYS_MS.length - 1];
      await ctx.db.patch(delivery._id, { lastError, scheduledFor: now + delay, claimedAt: undefined, updatedAt: now });
      await scheduleFairEmailSend(ctx, delivery._id, now + delay, now);
      return null;
    }
    await failFairDelivery(ctx, delivery, lastError, now);
    return null;
  },
});

/** Final failure (admin may retry). B6: also fails a run's first send; a failed RESEND keeps the run `sent`. */
async function failFairDelivery(ctx: MutationCtx, delivery: Doc<"fairEmailDeliveries">, lastError: string, now: number) {
  await ctx.db.patch(delivery._id, { status: "failed", lastError, claimedAt: undefined, updatedAt: now });
  const run = delivery.reportRunId ? await ctx.db.get(delivery.reportRunId) : null;
  if (run && (run.status === "approved" || run.status === "sent")) {
    await ctx.db.patch(run._id, { ...(run.status === "approved" ? { status: "failed" as const } : {}), error: lastError, updatedAt: now });
  }
}

const REQUEUE_BATCH_MAX = 50;

/**
 * N5 — the 5-minute outbox sweep (convex/crons.ts). The backstop for a send
 * that was lost (scheduler) or crashed after its claim: up to 50 `queued`
 * rows whose moment passed more than FAIR_EMAIL_STALE_MS ago, oldest first
 * (`by_status_and_scheduledFor`). A row with a live claim is a send in
 * flight and is left alone; a crashed claim with no attempts left becomes
 * `failed` (`PROVIDER_UNAVAILABLE:stalled`, admin retry); any other row gets
 * its sender scheduled again. claimDelivery re-checks everything and the
 * Idempotency-Key stays the dedupeKey, so a re-run never sends twice.
 * A future follow-up is not due yet and is never touched.
 */
export const requeueStaleDeliveries = internalMutation({
  args: {},
  returns: v.object({ requeued: v.number(), failed: v.number(), inFlight: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("fairEmailDeliveries")
      .withIndex("by_status_and_scheduledFor", (q) => q.eq("status", "queued").lt("scheduledFor", now - FAIR_EMAIL_STALE_MS))
      .take(REQUEUE_BATCH_MAX);
    const result = { requeued: 0, failed: 0, inFlight: 0 };
    for (const row of rows) {
      if (row.claimedAt !== undefined && now - row.claimedAt < FAIR_EMAIL_CLAIM_LEASE_MS) {
        result.inFlight += 1;
      } else if (row.claimedAt !== undefined && row.attemptCount >= FAIR_EMAIL_MAX_ATTEMPTS) {
        await failFairDelivery(ctx, row, "PROVIDER_UNAVAILABLE:stalled", now);
        result.failed += 1;
      } else {
        await ctx.scheduler.runAfter(0, internal.fairEmailSender.sendDelivery, { deliveryId: row._id });
        result.requeued += 1;
      }
    }
    return result;
  },
});

const PURGE_BATCH_MAX = 200;

/**
 * Lead/email part of the 16 Nov 2026 PII purge (MASTER §13, HANDOFF §5.6) —
 * the seam B7 composes into the scheduled, audited purge. One bounded batch:
 * outbox rows first (they carry recipients and point at leads), leads only
 * once no outbox row is left, so no orphan remains. Leads hold the contact,
 * the consent snapshot and the suppression; consent/lead configs, exhibitor
 * templates and the anonymous fairMetricCountShards are not touched. Before
 * the purge moment only `dryRun` is accepted. Retry-safe: rerun until
 * `hasMore` is false.
 */
export const purgeLeadPiiBatch = internalMutation({
  args: { limit: v.number(), dryRun: v.boolean() },
  returns: v.object({
    status: v.union(v.literal("not_due"), v.literal("dry_run"), v.literal("deleted")),
    deliveries: v.number(),
    leads: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.max(1, Math.min(PURGE_BATCH_MAX, Math.floor(args.limit)));
    if (!args.dryRun && now < FAIR_PII_PURGE_AT_MS) return { status: "not_due" as const, deliveries: 0, leads: 0, hasMore: false };

    const deliveries = await ctx.db.query("fairEmailDeliveries").take(limit + 1);
    const deliveryBatch = deliveries.slice(0, limit);
    const leads = deliveries.length > limit ? [] : await ctx.db.query("fairLeads").take(limit - deliveryBatch.length + 1);
    const leadBatch = leads.slice(0, limit - deliveryBatch.length);
    const hasMore = deliveries.length > limit || leads.length > leadBatch.length;
    if (args.dryRun) return { status: "dry_run" as const, deliveries: deliveryBatch.length, leads: leadBatch.length, hasMore };

    for (const row of deliveryBatch) await ctx.db.delete(row._id);
    // Leads go only after every outbox row is gone (a full delivery batch
    // leaves leadBatch empty); a lead reference then can never dangle.
    if (deliveries.length <= limit) {
      for (const row of leadBatch) await ctx.db.delete(row._id);
    }
    return { status: "deleted" as const, deliveries: deliveryBatch.length, leads: leadBatch.length, hasMore };
  },
});
