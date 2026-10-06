import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import {
  fairEventPassportBrandIds,
  fairPassportFreezesAt,
  readFairBrandPassport,
  syncFairBrandPassport,
  syncFairEventPassports,
} from "./lib/fairPassportSync";
import { fairBrandPassportProblem, fairPassportConfigStatus, fairPassportEligibleStatus } from "./lib/fairValidators";

// =============================================================================
// Admin UX A7 — the automatic brand passport (ADMIN-UX §6 Pasoš brenda,
// §12.2; MASTER §11). The rules are in convex/lib/fairPassportSync.ts. A
// passport appears for every brand that meets the condition, without a
// click; `Interakcije → Pasoš` shows why a brand does not, hides or shows a
// passport and refreshes by hand. The B3 manual functions
// (fairInteractionsAdmin upsert/publish/withdraw/removePassportModel) stay as
// the fallback; the emergency removal is still the B3 one.
// =============================================================================

const syncResult = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("withdrawn"),
  v.literal("unchanged"),
  v.literal("frozen"),
  v.literal("too_many_models"),
);
const syncSummary = v.object({
  created: v.number(),
  updated: v.number(),
  withdrawn: v.number(),
  unchanged: v.number(),
  frozen: v.number(),
  too_many_models: v.number(),
});

/** Scheduled by fairAdmin.publishModel / withdrawModel / upgradePackage when the brand's passport would change. */
export const syncBrandPassport = internalMutation({
  args: { eventId: v.id("fairEvents"), brandId: v.id("brands") },
  returns: v.union(syncResult, v.null()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    return syncFairBrandPassport(ctx, { event, brandId: args.brandId, now: Date.now() });
  },
});

/** Every brand of one event; scheduled after a committed catalog import. */
export const syncEventPassports = internalMutation({
  args: { eventId: v.id("fairEvents") },
  returns: v.union(syncSummary, v.null()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    return syncFairEventPassports(ctx, event, Date.now());
  },
});

/** "Osveži pasoše": the same sync, now, for every brand of the event. */
export const refreshPassports = mutation({
  args: { eventId: v.id("fairEvents") },
  returns: syncSummary,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const event = await requireFairEvent(ctx, args.eventId);
    const summary = await syncFairEventPassports(ctx, event, now);
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_passports_refreshed", detail: { eventId: event._id, ...summary }, now });
    return summary;
  },
});

/**
 * Hides a passport from every public read (catalog, model page, garage, map,
 * favorite) or shows it again. Its status, set, stamps and favorites stay;
 * scans keep stamping, so "Prikaži" restores everyone's progress.
 */
export const setPassportHidden = mutation({
  args: { passportId: v.id("fairPassportConfigs"), hidden: v.boolean() },
  returns: v.object({ passportId: v.id("fairPassportConfigs"), hidden: v.boolean(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const passport = await ctx.db.get(args.passportId);
    if (!passport) fairAdminError("FAIR_PASSPORT_NOT_FOUND");
    const hidden = passport.hiddenAt !== undefined;
    if (hidden === args.hidden) return { passportId: passport._id, hidden, changed: false };
    await ctx.db.patch(
      passport._id,
      args.hidden
        ? { hiddenAt: now, hiddenByUserId: admin._id, updatedAt: now }
        : { hiddenAt: undefined, hiddenByUserId: undefined, updatedAt: now },
    );
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: args.hidden ? "fair_passport_hidden" : "fair_passport_shown",
      detail: { eventId: passport.eventId, brandId: passport.brandId, passportId: passport._id },
      now,
    });
    return { passportId: passport._id, hidden: args.hidden, changed: true };
  },
});

const overviewBrand = v.object({
  brandId: v.id("brands"),
  participationId: v.union(v.id("fairParticipations"), v.null()),
  eligible: v.boolean(),
  /** Exhibited (non-withdrawn) models of the brand. */
  exhibited: v.number(),
  problems: v.array(v.object({ code: fairBrandPassportProblem, count: v.number() })),
  tooManyModels: v.boolean(),
  /** When the set stops following the catalog (event opening or an earlier manual freeze). */
  freezesAt: v.number(),
  passport: v.union(
    v.null(),
    v.object({
      passportId: v.id("fairPassportConfigs"),
      status: fairPassportConfigStatus,
      frozenAt: v.optional(v.number()),
      publishedAt: v.optional(v.number()),
      hiddenAt: v.optional(v.number()),
      autoSyncedAt: v.optional(v.number()),
    }),
  ),
  members: v.array(v.object({
    eventModelId: v.id("fairEventModels"),
    status: fairPassportEligibleStatus,
    removedAt: v.optional(v.number()),
    /** Removed by an admin (emergency removal), not by the sync. */
    removedByAdmin: v.boolean(),
  })),
});

/**
 * Every brand of the event with the condition and its reasons, the passport
 * (status, hidden, freeze moment) and its members. No visitor data.
 * Timeless (no clock read): the client compares `freezesAt` with its time.
 */
export const getPassportOverview = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({ eventStartsAt: v.number(), brands: v.array(overviewBrand) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const brands = [];
    for (const brandId of await fairEventPassportBrandIds(ctx, event._id)) {
      const state = await readFairBrandPassport(ctx, event._id, brandId);
      const passport = state.passport;
      const exhibited = state.models.filter((model) => model.status !== "withdrawn");
      brands.push({
        brandId,
        participationId: exhibited[0]?.participationId ?? passport?.participationId ?? state.models[0]?.participationId ?? null,
        eligible: state.check.eligible && !state.tooManyModels,
        exhibited: state.check.exhibited,
        problems: state.check.problems,
        tooManyModels: state.tooManyModels,
        freezesAt: fairPassportFreezesAt(passport, event),
        passport: passport
          ? {
              passportId: passport._id,
              status: passport.status,
              ...(passport.frozenAt !== undefined ? { frozenAt: passport.frozenAt } : {}),
              ...(passport.publishedAt !== undefined ? { publishedAt: passport.publishedAt } : {}),
              ...(passport.hiddenAt !== undefined ? { hiddenAt: passport.hiddenAt } : {}),
              ...(passport.autoSyncedAt !== undefined ? { autoSyncedAt: passport.autoSyncedAt } : {}),
            }
          : null,
        members: state.members.map((row) => ({
          eventModelId: row.eventModelId,
          status: row.status,
          ...(row.removedAt !== undefined ? { removedAt: row.removedAt } : {}),
          removedByAdmin: row.removedByUserId !== undefined,
        })),
      });
    }
    return { eventStartsAt: event.startsAt, brands };
  },
});
