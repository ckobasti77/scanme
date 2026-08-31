import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import type { AccountPlan } from "./lib/plans";
import { requireSlug, requireText } from "./lib/validation";

// =============================================================================
// TASK-30 — Enterprise provisioning (RFC-002 §2.2, §4 task 4).
//
// One Enterprise account groups 10–15 locations; one login sees them all. The
// governing decision (§2.2.2) is that access stays (user, business):
// `requireBusinessAccess` is NOT touched. An Enterprise login reaches its N
// locations through N `businessMemberships` rows — the many-per-user shape the
// schema already supports (`by_userId_and_active`). This file writes those rows;
// the sensitive access code is not in this diff at all.
//
// The fan-out — account + N businesses + N memberships — is resumable, exactly
// as RFC risk #5 requires. It mirrors the `convex/memories.ts` sweeps: an entry
// mutation creates the account (atomically) and hands a bounded, self-
// rescheduling continuation the work list. Every per-location and per-membership
// write is idempotent (keyed on the globally-unique business slug and on
// (user, business)), so a run that stops mid-fan-out is completed by re-invoking
// the continuation — from any index — without ever creating a duplicate.
//
// It deliberately does NOT create service profiles. Which services a location
// owns is a per-location decision (§2.2.3: `serviceProfiles.status` is the
// ownership gate, decided by the purchase flow / admin activation, tasks 5/10).
// Provisioning establishes the account, the locations, and the access rows; the
// account plan resolves each location's tier live through `getEntitlement`
// step 3, with zero per-location entitlement writes.
// =============================================================================

// Locations processed per continuation step. Enterprise is 10–15 locations, so
// this is typically one or two steps; the bound is what keeps a large onboarding
// within a single mutation's transaction budget and makes the fan-out resumable.
const PROVISION_BATCH = 10;

const accountPlanValidator = v.union(
  v.literal("basic"),
  v.literal("premium"),
  v.literal("enterprise"),
);

const planPeriodValidator = v.union(
  v.literal("monthly"),
  v.literal("annual"),
);

// The Enterprise-negotiated capability deviations. Same optional-subset shape as
// entitlements.overrides / accounts.overrides.
const overridesValidator = v.object({
  photosPerGuest: v.optional(v.number()),
  maxImageDimension: v.optional(v.number()),
  retentionDays: v.optional(v.number()),
  allowedBlockKeys: v.optional(v.array(v.string())),
});

const locationValidator = v.object({
  name: v.string(),
  slug: v.string(),
});

type OverridesArg = {
  photosPerGuest?: number;
  maxImageDimension?: number;
  retentionDays?: number;
  allowedBlockKeys?: string[];
};

// Build `account.overrides` writing ONLY the keys that are actually set. Never a
// key with an `undefined` value: getEntitlement step 3 spreads account.overrides
// over the plan-tier limits (`{ ...tierLimits, ...overrides }`), so a key present
// with value `undefined` would clobber the tier's limit with `undefined`. Returns
// `undefined` (the field is omitted entirely) when no override is set.
function cleanOverrides(input: OverridesArg | undefined) {
  if (!input) return undefined;
  const out: OverridesArg = {};
  if (input.photosPerGuest !== undefined) out.photosPerGuest = input.photosPerGuest;
  if (input.maxImageDimension !== undefined) {
    out.maxImageDimension = input.maxImageDimension;
  }
  if (input.retentionDays !== undefined) out.retentionDays = input.retentionDays;
  if (input.allowedBlockKeys !== undefined) {
    out.allowedBlockKeys = input.allowedBlockKeys;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Create-or-recognize one location and its membership. Idempotent by
// construction:
//   - the business is keyed on its globally-unique slug (businesses.by_slug). A
//     slug already owned by THIS account is a location a prior (partial) run
//     created — recognized and skipped. A slug owned by any OTHER account (or a
//     pre-existing account-less business) is a genuine collision and throws,
//     loud, so provisioning never silently adopts an unrelated business.
//   - the membership is keyed on (userId, businessId) (by_userId_and_businessId),
//     the exact upsert lib/invitations.ts uses on invitation acceptance.
async function ensureLocation(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  ownerUserId: Id<"users">,
  location: { name: string; slug: string },
  now: number,
) {
  const existing = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", location.slug))
    .unique();

  let businessId: Id<"businesses">;
  if (existing) {
    if (existing.accountId !== accountId) {
      throw new ConvexError(
        `Oznaka lokala "${location.slug}" se već koristi za drugi lokal.`,
      );
    }
    businessId = existing._id;
  } else {
    businessId = await ctx.db.insert("businesses", {
      name: location.name,
      slug: location.slug,
      kind: "business",
      accountId,
      status: "active",
      createdAt: now,
    });
  }

  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", ownerUserId).eq("businessId", businessId),
    )
    .unique();
  if (membership) {
    if (!membership.active) {
      await ctx.db.patch(membership._id, { active: true, updatedAt: now });
    }
  } else {
    await ctx.db.insert("businessMemberships", {
      userId: ownerUserId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return businessId;
}

// The resumable fan-out (§2.2, risk #5). One bounded batch of locations per step,
// self-rescheduled via `ctx.scheduler.runAfter(0, …)` — the same continuation
// shape as `convex/memories.ts`'s retention sweep. The scheduled job durably
// carries (accountId, ownerUserId, locations, index): a crash mid-fan-out is
// resumed by re-invoking this mutation with the next index (or, because every
// write is idempotent, from index 0). `nextIndex` in the return value is the
// resume point — the same value the reschedule carries — so a driver (a test, or
// a manual recovery) can advance the fan-out deterministically.
export const provisionEnterpriseLocations = internalMutation({
  args: {
    accountId: v.id("accounts"),
    ownerUserId: v.id("users"),
    locations: v.array(locationValidator),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Nalog nije pronađen.");
    const owner = await ctx.db.get(args.ownerUserId);
    if (!owner) throw new ConvexError("Vlasnički korisnik nije pronađen.");

    const now = Date.now();
    const end = Math.min(args.index + PROVISION_BATCH, args.locations.length);
    for (let i = args.index; i < end; i += 1) {
      await ensureLocation(
        ctx,
        args.accountId,
        args.ownerUserId,
        args.locations[i],
        now,
      );
    }

    const processed = end - args.index;
    if (end < args.locations.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.enterpriseProvisioning.provisionEnterpriseLocations,
        {
          accountId: args.accountId,
          ownerUserId: args.ownerUserId,
          locations: args.locations,
          index: end,
        },
      );
      return { done: false as const, processed, nextIndex: end };
    }
    return { done: true as const, processed, nextIndex: end };
  },
});

// The admin-gated entry point. Creates the Enterprise account atomically and
// kicks off the resumable location fan-out. The account insert and the first
// continuation schedule commit together (Convex mutations are atomic), so the
// fan-out never starts against a half-created account.
export const provisionEnterprise = mutation({
  args: {
    name: v.string(),
    ownerUserId: v.id("users"),
    locations: v.array(locationValidator),
    plan: v.optional(accountPlanValidator),
    planPeriod: v.optional(planPeriodValidator),
    planValidUntil: v.optional(v.number()),
    overrides: v.optional(overridesValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const name = requireText(args.name, "Naziv naloga", 2, 120);
    if (args.locations.length === 0) {
      throw new ConvexError("Enterprise nalog mora imati bar jedan lokal.");
    }

    const owner = await ctx.db.get(args.ownerUserId);
    if (!owner) throw new ConvexError("Vlasnički korisnik nije pronađen.");

    // Validate + normalize every location up front, and reject a duplicated slug
    // within the request, so the fan-out never starts against invalid input.
    const seen = new Set<string>();
    const locations = args.locations.map((location) => {
      const slug = requireSlug(location.slug);
      const locationName = requireText(location.name, "Naziv lokala", 2, 120);
      if (seen.has(slug)) {
        throw new ConvexError(`Duplirana oznaka lokala u zahtevu: ${slug}.`);
      }
      seen.add(slug);
      return { name: locationName, slug };
    });

    const plan: AccountPlan = args.plan ?? "enterprise";
    // §2.2.1: the free Basic plan has no billing period.
    if (plan === "basic" && args.planPeriod !== undefined) {
      throw new ConvexError("Basic plan nema period naplate.");
    }
    const overrides = cleanOverrides(args.overrides);

    const now = Date.now();
    const accountId = await ctx.db.insert("accounts", {
      name,
      plan,
      status: "active",
      planSource: "manual",
      ...(args.planPeriod ? { planPeriod: args.planPeriod } : {}),
      ...(overrides ? { overrides } : {}),
      ...(args.planValidUntil !== undefined
        ? { planValidUntil: args.planValidUntil }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.enterpriseProvisioning.provisionEnterpriseLocations,
      { accountId, ownerUserId: args.ownerUserId, locations, index: 0 },
    );

    return { accountId, locationCount: locations.length };
  },
});
