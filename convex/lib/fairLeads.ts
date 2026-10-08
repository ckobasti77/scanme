import type { Doc, Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  FAIR_CONSENT_EXHIBITOR_PLACEHOLDER,
  fairContactRequirementProblem,
  normalizeFairLeadEmail,
  normalizeFairLeadName,
  normalizeFairLeadPhone,
  type FairContactRequirement,
  type FairEmailDeliveryError,
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
//
// K3 (RF nalaz 3): above that gate sit two hard switches in this deployment's
// env, so no single admin click opens the flow. Each is on only when its value
// is exactly "true"; missing or anything else = off.
//   - FAIR_LEADS_ENABLED: submitLead and getLeadForm, and again in
//     claimDelivery right before any lead email (confirmation or follow-up);
//   - FAIR_FOLLOWUP_ENABLED: the post-fair follow-up is scheduled only while
//     it is on, and claimDelivery checks it again right before sending.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

/** K3: the lead flow (store, confirm, follow up) is open only when FAIR_LEADS_ENABLED is exactly "true". */
export function fairLeadsEnabled(): boolean {
  return env.FAIR_LEADS_ENABLED === "true";
}

/** K3: the one post-fair follow-up is scheduled/sent only when FAIR_FOLLOWUP_ENABLED is exactly "true". */
export function fairFollowUpEnabled(): boolean {
  return env.FAIR_FOLLOWUP_ENABLED === "true";
}

export type FairLeadEmailKind = "immediate_confirmation" | "post_event_follow_up";

/** Follow-up window after the relevant fair (MASTER §8, DATA-INTAKE §6.7): 24–48 h. */
export const FAIR_FOLLOW_UP_MIN_DELAY_MS = 24 * 60 * 60 * 1000;
export const FAIR_FOLLOW_UP_MAX_DELAY_MS = 48 * 60 * 60 * 1000;
/** Technical choice inside the locked window: a morning hour instead of midnight (open question). */
export const FAIR_FOLLOW_UP_HOUR = 10;

/** Outbox retry policy: one send plus at most two automatic retries, then `failed` (admin may retry). */
export const FAIR_EMAIL_MAX_ATTEMPTS = 3;
export const FAIR_EMAIL_RETRY_DELAYS_MS = [60 * 1000, 10 * 60 * 1000] as const;
/** N5: a `queued` row whose moment passed longer ago than this is stuck (its send was lost or crashed). */
export const FAIR_EMAIL_STALE_MS = 5 * 60 * 1000;
/** N5: a claim younger than this is a send in flight (a Convex action runs at most 10 minutes). */
export const FAIR_EMAIL_CLAIM_LEASE_MS = 11 * 60 * 1000;

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

/** Admin UX A7: the exhibitor's default for one lead form (admin input; the public flow never reads it). */
export async function fairParticipationLeadDefault(ctx: Ctx, participationId: Id<"fairParticipations">, kind: FairLeadKind) {
  return ctx.db
    .query("fairParticipationLeadDefaults")
    .withIndex("by_participationId_and_leadKind", (q) => q.eq("participationId", participationId).eq("leadKind", kind))
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

/** Admin UX A8 — the exhibitor's active follow-up text (one per participation), or null. */
export async function fairActiveExhibitorFollowUp(ctx: Ctx, participationId: Id<"fairParticipations">) {
  return ctx.db
    .query("fairExhibitorFollowUpTemplates")
    .withIndex("by_participationId_and_status", (q) => q.eq("participationId", participationId).eq("status", "active"))
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
 * N5: the lead fields as stored — name trimmed with collapsed spaces, email
 * trimmed and lowercase, phone in E.164 (+381 for `06x…`); an empty
 * email/phone counts as absent. The same lib/fair-contract.ts functions the
 * form uses. A refused field is INVALID_INPUT with `{ field, reason }` (never
 * the value); a missing required channel is CONTACT_REQUIREMENT_NOT_MET
 * (`preferredContact` never requires anything).
 */
export function normalizeFairLeadContact(
  input: { contactName: string; email?: string; phone?: string },
  requirement: FairContactRequirement,
): { contactName: string; email?: string; phone?: string } {
  const name = normalizeFairLeadName(input.contactName);
  if (!name.ok) fairInteractionError("INVALID_INPUT", { field: "contactName", reason: name.reason });
  const rawEmail = input.email?.trim() || undefined;
  const rawPhone = input.phone?.trim() || undefined;
  const email = rawEmail === undefined ? undefined : (normalizeFairLeadEmail(rawEmail) ?? fairInteractionError("INVALID_INPUT", { field: "email", reason: "format" }));
  const phone = rawPhone === undefined ? undefined : (normalizeFairLeadPhone(rawPhone) ?? fairInteractionError("INVALID_INPUT", { field: "phone", reason: "format" }));
  const missing = fairContactRequirementProblem(requirement, { email, phone });
  if (missing) fairInteractionError("CONTACT_REQUIREMENT_NOT_MET", { required: missing });
  return { contactName: name.value, ...(email !== undefined ? { email } : {}), ...(phone !== undefined ? { phone } : {}) };
}

/**
 * Creates the outbox row (idempotent by dedupeKey) and schedules the Node
 * sender. A mutation never sends: fairEmailSender.sendDelivery does, through
 * the Resend seam, with Idempotency-Key = dedupeKey. N5: with `skipped` the
 * row is written closed (`skipped` + that code) and nothing is scheduled, so
 * the admin sees why no email went out.
 */
export async function queueFairLeadEmail(
  ctx: MutationCtx,
  input: { leadId: Id<"fairLeads">; kind: FairLeadEmailKind; recipient: string; scheduledFor: number; now: number; skipped?: FairEmailDeliveryError },
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
    status: input.skipped ? "skipped" : "queued",
    scheduledFor: input.scheduledFor,
    attemptCount: 0,
    ...(input.skipped ? { lastError: input.skipped } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  });
  if (!input.skipped) await scheduleFairEmailSend(ctx, deliveryId, input.scheduledFor, input.now);
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
