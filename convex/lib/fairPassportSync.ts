import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { FAIR_ADMIN_LIST_LIMIT } from "../../lib/fair-contract";
import { fairBrandPassportProblems, type FairBrandPassportCheck } from "../../lib/fair-entitlements";
import { PASSPORT_MODELS_CAP, PASSPORTS_PER_EVENT_CAP } from "./fairInteractions";

// =============================================================================
// Admin UX A7 — the automatic brand passport (ADMIN-UX §6 and §12.2, MASTER
// §11). A brand that meets the condition (fairBrandPassportProblems) has a
// published passport whose required set is its exhibited models; a brand
// that stops meeting it has its passport withdrawn. Stamps and favorites are
// never deleted, so no earned progress is lost either way.
//
// The set follows the catalog only until it is frozen: at the event opening
// (`startsAt`, stored as `frozenAt` of an automatic passport) or at an
// earlier manual freeze (publishPassport / withdrawPassport, B3). After that
// the sync changes nothing; the emergency removal (removePassportModel)
// stays manual, and a member an admin removed is never put back.
//
// `hiddenAt` (setPassportHidden) is a separate, admin-only switch: the sync
// keeps a hidden passport's status and set up to date but never shows it.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

export type FairPassportSyncResult = "created" | "updated" | "withdrawn" | "unchanged" | "frozen" | "too_many_models";
export const FAIR_PASSPORT_SYNC_RESULTS = ["created", "updated", "withdrawn", "unchanged", "frozen", "too_many_models"] as const satisfies readonly FairPassportSyncResult[];

/** The moment the passport's set stops following the catalog: the event opening, or an earlier manual freeze. */
export function fairPassportFreezesAt(passport: Pick<Doc<"fairPassportConfigs">, "frozenAt"> | null, event: Pick<Doc<"fairEvents">, "startsAt">): number {
  return passport?.frozenAt !== undefined ? Math.min(passport.frozenAt, event.startsAt) : event.startsAt;
}

export type FairBrandPassportState = {
  /** Every model of the brand on the event (withdrawn included), bounded. */
  models: Doc<"fairEventModels">[];
  tooManyModels: boolean;
  passport: Doc<"fairPassportConfigs"> | null;
  /** Required and removed members of the passport (one row per model). */
  members: Doc<"fairPassportEligibleModels">[];
  check: FairBrandPassportCheck;
};

/** One brand on one event: its models, passport, members and the condition. Bounded reads. */
export async function readFairBrandPassport(ctx: Ctx, eventId: Id<"fairEvents">, brandId: Id<"brands">): Promise<FairBrandPassportState> {
  const rows = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", eventId).eq("brandId", brandId))
    .take(PASSPORT_MODELS_CAP + 1);
  const passport = await ctx.db
    .query("fairPassportConfigs")
    .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", eventId).eq("brandId", brandId))
    .first();
  const members = passport
    ? await ctx.db
        .query("fairPassportEligibleModels")
        .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", passport._id))
        .take(PASSPORT_MODELS_CAP * 2)
    : [];
  const models = rows.slice(0, PASSPORT_MODELS_CAP);
  return { models, tooManyModels: rows.length > PASSPORT_MODELS_CAP, passport, members, check: fairBrandPassportProblems(models) };
}

/** Brands with a model or a passport on the event (bounded by the admin list limits). */
export async function fairEventPassportBrandIds(ctx: Ctx, eventId: Id<"fairEvents">): Promise<Id<"brands">[]> {
  const models = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", eventId))
    .take(FAIR_ADMIN_LIST_LIMIT);
  const passports = await ctx.db
    .query("fairPassportConfigs")
    .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", eventId))
    .take(PASSPORTS_PER_EVENT_CAP);
  return [...new Set([...models.map((model) => model.brandId), ...passports.map((passport) => passport.brandId)])];
}

/**
 * Brings one brand's passport in line with the condition (idempotent: no
 * difference, no write). `dryRun` only reports what would change. Before the
 * freeze:
 * - condition met → the passport exists and is published, `frozenAt` =
 *   event opening, the required set = the exhibited models (a member an
 *   admin removed stays removed);
 * - condition not met → a published passport is withdrawn (its set, stamps
 *   and favorites stay; it is published again once the brand qualifies).
 * A draft opened by hand is adopted; a hidden passport stays hidden.
 */
export async function syncFairBrandPassport(
  ctx: MutationCtx,
  input: { event: Doc<"fairEvents">; brandId: Id<"brands">; now: number; dryRun?: boolean },
): Promise<FairPassportSyncResult> {
  const { event, brandId, now } = input;
  const state = await readFairBrandPassport(ctx, event._id, brandId);
  if (state.tooManyModels) return "too_many_models";
  if (now >= fairPassportFreezesAt(state.passport, event)) return "frozen";
  const writes: Array<() => Promise<unknown>> = [];
  let result: FairPassportSyncResult = "unchanged";
  const passport = state.passport;

  if (state.check.eligible) {
    const exhibited = state.models.filter((model) => model.status !== "withdrawn");
    const participationId = exhibited[0].participationId;
    if (!passport) {
      result = "created";
      writes.push(async () => {
        const passportId = await ctx.db.insert("fairPassportConfigs", {
          eventId: event._id,
          brandId,
          participationId,
          status: "published",
          frozenAt: event.startsAt,
          publishedAt: now,
          autoSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        for (const model of exhibited) {
          await ctx.db.insert("fairPassportEligibleModels", { passportConfigId: passportId, eventId: event._id, brandId, eventModelId: model._id, status: "required", createdAt: now });
        }
      });
    } else {
      const patch: Partial<Pick<Doc<"fairPassportConfigs">, "status" | "publishedAt" | "frozenAt" | "participationId">> = {};
      if (passport.status !== "published") {
        patch.status = "published";
        if (passport.publishedAt === undefined) patch.publishedAt = now;
      }
      if (passport.frozenAt !== event.startsAt) patch.frozenAt = event.startsAt;
      if (passport.participationId !== participationId) patch.participationId = participationId;
      const memberOf = new Map(state.members.map((row) => [row.eventModelId, row]));
      const wanted = new Set(exhibited.map((model) => model._id));
      for (const model of exhibited) {
        const row = memberOf.get(model._id);
        if (!row) {
          writes.push(() => ctx.db.insert("fairPassportEligibleModels", { passportConfigId: passport._id, eventId: event._id, brandId, eventModelId: model._id, status: "required", createdAt: now }));
        } else if (row.status === "removed" && row.removedByUserId === undefined) {
          writes.push(() => ctx.db.patch(row._id, { status: "required", removedAt: undefined }));
        }
      }
      for (const row of state.members) {
        if (row.status === "required" && !wanted.has(row.eventModelId)) writes.push(() => ctx.db.patch(row._id, { status: "removed", removedAt: now }));
      }
      if (writes.length || Object.keys(patch).length) {
        result = "updated";
        writes.push(() => ctx.db.patch(passport._id, { ...patch, autoSyncedAt: now, updatedAt: now }));
      }
    }
  } else if (passport?.status === "published") {
    result = "withdrawn";
    writes.push(() => ctx.db.patch(passport._id, { status: "withdrawn", autoSyncedAt: now, updatedAt: now }));
  }

  if (!input.dryRun) for (const write of writes) await write();
  return result;
}

export type FairPassportSyncSummary = Record<FairPassportSyncResult, number>;

/** Every brand of the event (manual "Osveži pasoše" and the job after an import). */
export async function syncFairEventPassports(ctx: MutationCtx, event: Doc<"fairEvents">, now: number): Promise<FairPassportSyncSummary> {
  const summary: FairPassportSyncSummary = { created: 0, updated: 0, withdrawn: 0, unchanged: 0, frozen: 0, too_many_models: 0 };
  for (const brandId of await fairEventPassportBrandIds(ctx, event._id)) {
    summary[await syncFairBrandPassport(ctx, { event, brandId, now })] += 1;
  }
  return summary;
}

/**
 * The trigger after a model is published, withdrawn or upgraded: when the
 * brand's passport would change, the sync runs right after this transaction
 * (its own transaction, so a sync problem never blocks the catalog change);
 * a no-op schedules nothing.
 */
export async function scheduleFairBrandPassportSync(ctx: MutationCtx, eventId: Id<"fairEvents">, brandId: Id<"brands">, now: number): Promise<boolean> {
  const event = await ctx.db.get(eventId);
  if (!event) return false;
  const result = await syncFairBrandPassport(ctx, { event, brandId, now, dryRun: true });
  if (result !== "created" && result !== "updated" && result !== "withdrawn") return false;
  await ctx.scheduler.runAfter(0, internal.fairPassports.syncBrandPassport, { eventId, brandId });
  return true;
}
