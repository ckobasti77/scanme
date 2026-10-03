import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  FAIR_CONSENT_EXHIBITOR_PLACEHOLDER,
  FAIR_LEAD_NAME_MAX,
  fairContactRequirementProblem,
  isFairLeadEmail,
  isFairLeadPhone,
  type FairContactRequirement,
  type FairLeadKind,
} from "../../lib/fair-contract";
import { belgradeLocalToEpoch, belgradeParts } from "../../lib/belgrade-time";
import { fairInteractionError } from "./fairInteractions";

// =============================================================================
// Sajam automobila 2026 — B4 lead core (BACKEND-HANDOFF §4.4, §5.4, §7;
// MASTER §8, §13). Shared by convex/fairLeads.ts (gateway-facing submit),
// convex/fairPublic.ts (lead form), convex/fairEmails.ts (outbox) and
// convex/fairLeadsAdmin.ts (requireAdmin).
//
// Production gate: a lead is stored only while an ACTIVE fairConsentConfigs
// version exists for the event and lead kind; the server renders the consent
// text itself (exhibitor name included) and stores that exact snapshot.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

export type FairLeadEmailKind = "immediate_confirmation" | "post_event_follow_up";

/** Follow-up window after the relevant fair (MASTER §8, DATA-INTAKE §6.7): 24–48 h. */
export const FAIR_FOLLOW_UP_MIN_DELAY_MS = 24 * 60 * 60 * 1000;
export const FAIR_FOLLOW_UP_MAX_DELAY_MS = 48 * 60 * 60 * 1000;
/** Technical choice inside the locked window: a morning hour instead of midnight (open question). */
export const FAIR_FOLLOW_UP_HOUR = 10;

/** Outbox retry policy: one send plus at most two automatic retries, then `failed` (admin may retry). */
export const FAIR_EMAIL_MAX_ATTEMPTS = 3;
export const FAIR_EMAIL_RETRY_DELAYS_MS = [60 * 1000, 10 * 60 * 1000] as const;

const pad = (value: number) => String(value).padStart(2, "0");

function belgradeAt(year: number, month: number, day: number, hour: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  return belgradeLocalToEpoch(`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(hour)}:00`)!;
}

/**
 * The planned follow-up moment: the first 10:00 Europe/Belgrade at or after
 * `endsAt + 24 h`, never later than `endsAt + 48 h`.
 */
export function fairFollowUpAt(eventEndsAt: number): number {
  const earliest = eventEndsAt + FAIR_FOLLOW_UP_MIN_DELAY_MS;
  const day = belgradeParts(earliest);
  const sameDay = belgradeAt(day.year, day.month, day.day, FAIR_FOLLOW_UP_HOUR);
  const planned = sameDay >= earliest ? sameDay : belgradeAt(day.year, day.month, day.day + 1, FAIR_FOLLOW_UP_HOUR);
  return Math.min(planned, eventEndsAt + FAIR_FOLLOW_UP_MAX_DELAY_MS);
}

/**
 * When a lead submitted at `now` gets its follow-up: the planned moment, or
 * right away for a late lead still inside the window; null once the 48 h
 * window has passed (no follow-up outside the locked window).
 */
export function fairFollowUpScheduleFor(eventEndsAt: number, now: number): number | null {
  const planned = fairFollowUpAt(eventEndsAt);
  if (now <= planned) return planned;
  return now <= eventEndsAt + FAIR_FOLLOW_UP_MAX_DELAY_MS ? now : null;
}

/** Stable outbox key = Resend `Idempotency-Key`: one confirmation and one follow-up per lead. */
export function fairLeadEmailDedupeKey(leadId: Id<"fairLeads">, kind: FairLeadEmailKind): string {
  return `fair-lead/${leadId}/${kind}`;
}

export function fairRenderConsentText(text: string, exhibitorName: string): string {
  return text.split(FAIR_CONSENT_EXHIBITOR_PLACEHOLDER).join(exhibitorName);
}

export async function fairActiveConsent(ctx: Ctx, eventId: Id<"fairEvents">, kind: FairLeadKind) {
  return ctx.db
    .query("fairConsentConfigs")
    .withIndex("by_eventId_and_leadKind_and_status", (q) => q.eq("eventId", eventId).eq("leadKind", kind).eq("status", "active"))
    .first();
}

export async function fairLeadConfig(ctx: Ctx, eventModelId: Id<"fairEventModels">, kind: FairLeadKind) {
  return ctx.db
    .query("fairLeadConfigs")
    .withIndex("by_eventModelId_and_leadKind", (q) => q.eq("eventModelId", eventModelId).eq("leadKind", kind))
    .unique();
}

export async function fairActiveFollowUpTemplate(ctx: Ctx, eventModelId: Id<"fairEventModels">) {
  return ctx.db
    .query("fairMessageTemplates")
    .withIndex("by_eventModelId_and_kind_and_status", (q) =>
      q.eq("eventModelId", eventModelId).eq("kind", "post_event_follow_up").eq("status", "active"),
    )
    .first();
}

/** The exhibitor named in the consent: the participation's business (same value as FairPublicModel.exhibitorName). */
export async function fairExhibitorName(ctx: Ctx, participationId: Id<"fairParticipations">): Promise<string | null> {
  const participation = await ctx.db.get(participationId);
  const business = participation ? await ctx.db.get(participation.businessId) : null;
  return business?.name.trim() || null;
}

export function fairModelFullName(model: Pick<Doc<"fairEventModels">, "displayName" | "variant">): string {
  return model.variant ? `${model.displayName} ${model.variant}` : model.displayName;
}

/**
 * Trimmed contact fields; an empty email/phone counts as absent. Format
 * errors are INVALID_INPUT, a missing required channel is
 * CONTACT_REQUIREMENT_NOT_MET (`preferredContact` never requires anything).
 */
export function normalizeFairLeadContact(
  input: { contactName: string; email?: string; phone?: string },
  requirement: FairContactRequirement,
): { contactName: string; email?: string; phone?: string } {
  const contactName = input.contactName.trim().replace(/\s+/g, " ");
  const hasControl = [...contactName].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  if (!contactName || contactName.length > FAIR_LEAD_NAME_MAX || hasControl) {
    fairInteractionError("INVALID_INPUT", { field: "contactName" });
  }
  const email = input.email?.trim() || undefined;
  const phone = input.phone?.trim() || undefined;
  if (email !== undefined && !isFairLeadEmail(email)) fairInteractionError("INVALID_INPUT", { field: "email" });
  if (phone !== undefined && !isFairLeadPhone(phone)) fairInteractionError("INVALID_INPUT", { field: "phone" });
  const missing = fairContactRequirementProblem(requirement, { email, phone });
  if (missing) fairInteractionError("CONTACT_REQUIREMENT_NOT_MET", { required: missing });
  return { contactName, ...(email !== undefined ? { email } : {}), ...(phone !== undefined ? { phone } : {}) };
}

/**
 * Creates the outbox row (idempotent by dedupeKey) and schedules the Node
 * sender. A mutation never sends: fairEmailSender.sendDelivery does, through
 * the Resend seam, with Idempotency-Key = dedupeKey.
 */
export async function queueFairLeadEmail(
  ctx: MutationCtx,
  input: { leadId: Id<"fairLeads">; kind: FairLeadEmailKind; recipient: string; scheduledFor: number; now: number },
): Promise<Id<"fairEmailDeliveries">> {
  const dedupeKey = fairLeadEmailDedupeKey(input.leadId, input.kind);
  const existing = await ctx.db
    .query("fairEmailDeliveries")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
    .unique();
  if (existing) return existing._id;
  const deliveryId = await ctx.db.insert("fairEmailDeliveries", {
    dedupeKey,
    leadId: input.leadId,
    kind: input.kind,
    recipient: input.recipient,
    status: "queued",
    scheduledFor: input.scheduledFor,
    attemptCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
  });
  await scheduleFairEmailSend(ctx, deliveryId, input.scheduledFor, input.now);
  return deliveryId;
}

export async function scheduleFairEmailSend(ctx: MutationCtx, deliveryId: Id<"fairEmailDeliveries">, at: number, now: number) {
  if (at <= now) await ctx.scheduler.runAfter(0, internal.fairEmailSender.sendDelivery, { deliveryId });
  else await ctx.scheduler.runAt(at, internal.fairEmailSender.sendDelivery, { deliveryId });
}

export async function fairLeadDelivery(ctx: Ctx, leadId: Id<"fairLeads">, kind: FairLeadEmailKind) {
  return ctx.db
    .query("fairEmailDeliveries")
    .withIndex("by_leadId_and_kind", (q) => q.eq("leadId", leadId).eq("kind", kind))
    .first();
}
