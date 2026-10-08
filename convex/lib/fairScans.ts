import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { belgradeParts } from "../../lib/belgrade-time";
import { FAIR_PII_PURGE_AT_MS, fairIsPreEvent, fairModelPath, isFairVisitorHash } from "../../lib/fair-contract";
import { isAdminEmail } from "./access";
import { activeAssignmentForModel } from "./fairCatalog";
import { bumpFairCount, fairScanCountKeys } from "./fairCountShards";
import { fairGatewayVerdict } from "./fairGateway";
import { rateLimiter } from "./rateLimits";

// =============================================================================
// Sajam automobila 2026 — B2 fair scan pipeline (BACKEND-HANDOFF §4.2, §5.2,
// §10; MASTER §5). Called ONLY from the fair_model branch of
// cards.resolveAndRecord, inside the same transaction that wrote the generic
// cardScanEvents row, with the same server-generated requestId. There is no
// other public scan entry point: a model page load, a garage open or a
// sponsored card never reaches this code.
//
// Identity: Convex only ever sees `visitorHash` (lowercase 64-hex HMAC that
// the Next server computed from the HttpOnly cookie token). The raw token never
// reaches Convex; nothing here logs. K1: the hash is trusted only together
// with FAIR_GATEWAY_SECRET (lib/fairGateway.ts); a new visitor row is capped
// per caller-IP HMAC (`fairVisitorCreate`).
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Event-local time buckets (HANDOFF §5.2, §10): `dateKey` = `YYYY-MM-DD`,
 * `hourKey` = `YYYY-MM-DDTHH` (24h), both in Europe/Belgrade regardless of
 * the server's zone. On the October DST fall-back the repeated 02:00 hour maps
 * to the same `hourKey` (wall-clock bucket).
 */
export function fairTimeKeys(at: number): { dateKey: string; hourKey: string } {
  const parts = belgradeParts(at);
  const dateKey = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  return { dateKey, hourKey: `${dateKey}T${pad(parts.hour)}` };
}

/**
 * What /r/[cardCode] opens for a `fair_model` target, or null (→ invalid).
 * Same gates as the admin resolve test (convex/lib/fairQr.ts): the model is
 * published and this card belongs to the model's ACTIVE QR assignment. The
 * card check repeats accessResolution's assignment check on purpose, so a
 * card outside the access inventory can never open a fair model.
 */
export async function openableFairModel(
  ctx: Ctx,
  card: Doc<"cards">,
  target: Doc<"cardTargets">,
): Promise<{ model: Doc<"fairEventModels">; path: string } | null> {
  if (target.kind !== "fair_model" || !target.fairEventModelId) return null;
  const model = await ctx.db.get(target.fairEventModelId);
  if (!model || model.status !== "published") return null;
  const event = await ctx.db.get(model.eventId);
  if (!event) return null;
  const assignment = await activeAssignmentForModel(ctx, model._id);
  if (!assignment || assignment.cardId !== card._id) return null;
  return { model, path: fairModelPath(event.slug, model.slug) };
}

/**
 * Admin exclusion is derived ONLY from the authenticated ScanMe session the
 * /r handler forwards (Convex Auth token) — never from an argument. A signed-in
 * non-admin (e.g. a client) counts like any visitor.
 */
export async function fairSessionAdminUserId(ctx: MutationCtx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user && isAdminEmail(user.email) ? user._id : null;
}

export type FairVisitorUpsert = { ok: true; visitorId: Id<"fairVisitors"> } | { ok: false; retryAfterMs: number };

/**
 * Pseudonymous upsert by hash (HANDOFF §5.2): one row per visitorHash. K1: a
 * NEW row first spends one `fairVisitorCreate` token keyed by the gateway's
 * IP HMAC (absent → one shared bucket); a refusal writes nothing.
 */
export async function upsertFairVisitor(
  ctx: MutationCtx,
  input: { visitorHash: string; ipHash: string | undefined; now: number },
): Promise<FairVisitorUpsert> {
  const { visitorHash, now } = input;
  const existing = await ctx.db
    .query("fairVisitors")
    .withIndex("by_visitorHash", (q) => q.eq("visitorHash", visitorHash))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { lastSeenAt: now });
    return { ok: true, visitorId: existing._id };
  }
  const allowed = await rateLimiter.limit(ctx, "fairVisitorCreate", { key: input.ipHash ?? "shared" });
  if (!allowed.ok) return { ok: false, retryAfterMs: Math.ceil(allowed.retryAfter) };
  return { ok: true, visitorId: await ctx.db.insert("fairVisitors", { visitorHash, firstSeenAt: now, lastSeenAt: now }) };
}

export type FairPassportStampResult = "stamped" | "already_stamped" | "not_in_published_passport";

/**
 * Brand-passport stamp hook (HANDOFF §5.5). A no-op until B3 publishes a
 * passport: it stamps only when the model is a `required` member of a
 * `published` passport of its event, and at most once per visitor+model, so
 * repeated scans never add a second stamp. A removed member stops stamping
 * but earned stamps stay. P1: a pre-event stamp (`scannedAt` before the
 * event's start) is taken over by the visitor's first scan of the model during
 * the fair (`eventStartsAt` given) — it moves to that scan, so it never
 * stands in for a fair-time stamp.
 */
export async function stampFairPassportOnScan(
  ctx: MutationCtx,
  input: { visitorId: Id<"fairVisitors">; model: Doc<"fairEventModels">; now: number; eventStartsAt?: number },
): Promise<FairPassportStampResult> {
  const memberships = await ctx.db
    .query("fairPassportEligibleModels")
    .withIndex("by_eventModelId", (q) => q.eq("eventModelId", input.model._id))
    .take(8);
  for (const membership of memberships) {
    if (membership.status !== "required" || membership.eventId !== input.model.eventId) continue;
    const passport = await ctx.db.get(membership.passportConfigId);
    if (!passport || passport.status !== "published") continue;
    const existing = await ctx.db
      .query("fairPassportStamps")
      .withIndex("by_visitorId_and_eventModelId", (q) =>
        q.eq("visitorId", input.visitorId).eq("eventModelId", input.model._id),
      )
      .first();
    if (existing) {
      const startsAt = input.eventStartsAt;
      if (startsAt !== undefined && existing.scannedAt < startsAt && input.now >= startsAt) {
        await ctx.db.patch(existing._id, { scannedAt: input.now });
        return "stamped";
      }
      return "already_stamped";
    }
    await ctx.db.insert("fairPassportStamps", {
      visitorId: input.visitorId,
      eventId: input.model.eventId,
      brandId: passport.brandId,
      eventModelId: input.model._id,
      scannedAt: input.now,
    });
    return "stamped";
  }
  return "not_in_published_passport";
}

/**
 * - `recorded`: counted (total; unique on the visitor's first scan of the model)
 * - `admin_excluded`: short-term audit row only, outside every metric
 * - `duplicate`: this requestId was already handled — nothing written
 * - `no_visitor`: no valid visitorHash (e.g. secret missing in production)
 * - `gateway_rejected` (K1): a hash without the valid FAIR_GATEWAY_SECRET
 *   (or none configured here) — not trusted, nothing written
 * - `rate_limited`: the per-IP new-identity or the per-visitor fairScan
 *   bucket refused the fair row
 */
export type FairScanRecordStatus =
  | "recorded"
  | "admin_excluded"
  | "duplicate"
  | "no_visitor"
  | "gateway_rejected"
  | "rate_limited";

/**
 * The fair hook of one physical scan. `genericDuplicate` is whether the
 * generic cardScanEvents row for this requestId already existed: a fair row is
 * only ever written by the transaction that inserted the generic row, so one
 * resolver request yields one generic event and at most one fair scan, and a
 * retry with the same requestId adds nothing. Every non-admin scan counts 24/7
 * with no opening-hours, device or bot filter (HANDOFF §5.2, MASTER §5).
 *
 * P1: a scan before the event's start (fairIsPreEvent) is stored with
 * `preEvent: true` (scan row and, on first scan, the unique row) and bumps no
 * counter. The visitor's first scan of the model DURING the fair takes the
 * pre-event unique row over and counts as the unique scan, so a pre-event
 * scan never uses it up.
 */
export async function recordFairScan(
  ctx: MutationCtx,
  input: {
    requestId: string;
    visitorHash: string | undefined;
    // K1: FAIR_GATEWAY_SECRET and the gateway's IP HMAC, as sent by /r.
    gatewaySecret: string | undefined;
    ipHash: string | undefined;
    model: Doc<"fairEventModels">;
    now: number;
    genericDuplicate: boolean;
  },
): Promise<FairScanRecordStatus> {
  if (input.genericDuplicate) return "duplicate";
  const prior = await ctx.db
    .query("fairScanEvents")
    .withIndex("by_requestId", (q) => q.eq("requestId", input.requestId))
    .unique();
  if (prior) return "duplicate";
  if (!input.visitorHash || !isFairVisitorHash(input.visitorHash)) return "no_visitor";
  // K1: a hash is trusted only from the Next gateway. Without the secret the
  // fair part is skipped silently; the generic scan and redirect stay.
  if (fairGatewayVerdict(input.gatewaySecret) !== "trusted") return "gateway_rejected";
  // B7: from the purge moment no visitor-linkable row is created any more,
  // even if a device with a wrong clock still sends its cookie (MASTER §13).
  if (input.now >= FAIR_PII_PURGE_AT_MS) return "no_visitor";

  const { model, now } = input;
  const visitor = await upsertFairVisitor(ctx, { visitorHash: input.visitorHash, ipHash: input.ipHash, now });
  if (!visitor.ok) return "rate_limited";
  const { visitorId } = visitor;
  const allowed = await rateLimiter.limit(ctx, "fairScan", { key: visitorId });
  if (!allowed.ok) return "rate_limited";

  const adminUserId = await fairSessionAdminUserId(ctx);
  const time = fairTimeKeys(now);
  const event = await ctx.db.get(model.eventId);
  const preEvent = event !== null && fairIsPreEvent(now, event);
  await ctx.db.insert("fairScanEvents", {
    requestId: input.requestId,
    visitorId,
    eventId: model.eventId,
    eventModelId: model._id,
    standId: model.standId,
    brandId: model.brandId,
    occurredAt: now,
    dateKey: time.dateKey,
    hourKey: time.hourKey,
    isAdminExcluded: adminUserId !== null,
    ...(adminUserId ? { adminUserId } : {}),
    ...(preEvent ? { preEvent: true } : {}),
  });
  // Admin scans: audit row only — no unique row, no counter, no stamp.
  if (adminUserId) return "admin_excluded";

  const unique = await ctx.db
    .query("fairUniqueScans")
    .withIndex("by_visitorId_and_eventModelId", (q) =>
      q.eq("visitorId", visitorId).eq("eventModelId", model._id),
    )
    .unique();
  // P1: a pre-event unique row (never counted) is taken over by the first scan during the fair.
  const takeOver = unique !== null && unique.preEvent === true && !preEvent;
  if (takeOver) {
    await ctx.db.patch(unique._id, { firstScannedAt: now, lastScannedAt: now, totalScanCount: 1, preEvent: undefined });
  } else if (unique) {
    await ctx.db.patch(unique._id, { lastScannedAt: now, totalScanCount: unique.totalScanCount + 1 });
  } else {
    await ctx.db.insert("fairUniqueScans", {
      visitorId,
      eventId: model.eventId,
      eventModelId: model._id,
      firstScannedAt: now,
      lastScannedAt: now,
      totalScanCount: 1,
      ...(preEvent ? { preEvent: true } : {}),
    });
  }
  if (!preEvent) {
    const ids = { eventModelId: model._id, standId: model.standId };
    for (const key of fairScanCountKeys("scan_total", ids, time)) await bumpFairCount(ctx, key);
    if (!unique || takeOver) {
      for (const key of fairScanCountKeys("scan_unique", ids, time)) await bumpFairCount(ctx, key);
    }
  }
  await stampFairPassportOnScan(ctx, { visitorId, model, now, ...(event ? { eventStartsAt: event.startsAt } : {}) });
  return "recorded";
}
