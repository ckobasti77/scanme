import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { belgradeParts } from "../../lib/belgrade-time";
import { fairModelPath, isFairVisitorHash } from "../../lib/fair-contract";
import { isAdminEmail } from "./access";
import { activeAssignmentForModel } from "./fairCatalog";
import { bumpFairCount, fairScanCountKeys } from "./fairCountShards";
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
// reaches Convex; nothing here logs.
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

/** Pseudonymous upsert by hash (HANDOFF §5.2): one row per visitorHash. */
export async function upsertFairVisitor(
  ctx: MutationCtx,
  visitorHash: string,
  now: number,
): Promise<Id<"fairVisitors">> {
  const existing = await ctx.db
    .query("fairVisitors")
    .withIndex("by_visitorHash", (q) => q.eq("visitorHash", visitorHash))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { lastSeenAt: now });
    return existing._id;
  }
  return ctx.db.insert("fairVisitors", { visitorHash, firstSeenAt: now, lastSeenAt: now });
}

export type FairPassportStampResult = "stamped" | "already_stamped" | "not_in_published_passport";

/**
 * Brand-passport stamp hook (HANDOFF §5.5). A no-op until B3 publishes a
 * passport: it stamps only when the model is a `required` member of a
 * `published` passport of its event, and at most once per visitor+model, so
 * repeated scans never add a second stamp. A removed member stops stamping
 * but earned stamps stay.
 */
export async function stampFairPassportOnScan(
  ctx: MutationCtx,
  input: { visitorId: Id<"fairVisitors">; model: Doc<"fairEventModels">; now: number },
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
    if (existing) return "already_stamped";
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
 * - `rate_limited`: the per-visitor fairScan bucket refused the fair row
 */
export type FairScanRecordStatus =
  | "recorded"
  | "admin_excluded"
  | "duplicate"
  | "no_visitor"
  | "rate_limited";

/**
 * The fair hook of one physical scan. `genericDuplicate` is whether the
 * generic cardScanEvents row for this requestId already existed: a fair row is
 * only ever written by the transaction that inserted the generic row, so one
 * resolver request yields one generic event and at most one fair scan, and a
 * retry with the same requestId adds nothing. Every non-admin scan counts 24/7
 * with no opening-hours, device or bot filter (HANDOFF §5.2, MASTER §5).
 */
export async function recordFairScan(
  ctx: MutationCtx,
  input: {
    requestId: string;
    visitorHash: string | undefined;
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

  const { model, now } = input;
  const visitorId = await upsertFairVisitor(ctx, input.visitorHash, now);
  const allowed = await rateLimiter.limit(ctx, "fairScan", { key: visitorId });
  if (!allowed.ok) return "rate_limited";

  const adminUserId = await fairSessionAdminUserId(ctx);
  const time = fairTimeKeys(now);
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
  });
  // Admin scans: audit row only — no unique row, no counter, no stamp.
  if (adminUserId) return "admin_excluded";

  const unique = await ctx.db
    .query("fairUniqueScans")
    .withIndex("by_visitorId_and_eventModelId", (q) =>
      q.eq("visitorId", visitorId).eq("eventModelId", model._id),
    )
    .unique();
  if (unique) {
    await ctx.db.patch(unique._id, { lastScannedAt: now, totalScanCount: unique.totalScanCount + 1 });
  } else {
    await ctx.db.insert("fairUniqueScans", {
      visitorId,
      eventId: model.eventId,
      eventModelId: model._id,
      firstScannedAt: now,
      lastScannedAt: now,
      totalScanCount: 1,
    });
  }
  const ids = { eventModelId: model._id, standId: model.standId };
  for (const key of fairScanCountKeys("scan_total", ids, time)) await bumpFairCount(ctx, key);
  if (!unique) {
    for (const key of fairScanCountKeys("scan_unique", ids, time)) await bumpFairCount(ctx, key);
  }
  await stampFairPassportOnScan(ctx, { visitorId, model, now });
  return "recorded";
}
