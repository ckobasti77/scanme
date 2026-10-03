import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { getEntitlement, upsertManualEntitlement } from "./lib/entitlements";
import { PLAN_LIMITS, type MemoriesPlanKey } from "./lib/plans";
import { generateCode } from "./lib/codes";
import { openOneOffSessionForSpace } from "./memories";
import { getDict } from "../lib/i18n";

// =============================================================================
// TASK-18 — Memories provisioning: the admin-gated write path that makes
// Memories reachable, and celebrations + partnerships' FIRST WRITER. This lives
// here, NOT in convex/memories.ts (the TASK-14 guest identity/quota backend),
// the same way convex/venueAdmin.ts sits apart from convex/venue.ts: admin
// provisioning (requireAdmin, entitlements, tenancy) is a distinct concern from
// the public/guest render backend.
//
// Two provisioning channels (RFC-001 §2.1.6):
//   A. grantMemories — an existing BUSINESS gets a scanme_memories profile and
//      a `recurring` space. Mirrors venueAdmin.grantVenue: admin-gated,
//      idempotent, with a deactivation path that leaves content intact.
//   B. createCelebration — a wedding/birthday is NOT a business at the product
//      level. One transaction creates a `businesses` row (kind:"celebration"),
//      a `celebrations` row, a scanme_memories profile, an entitlement, and one
//      `one_off` space with its upload window. It NEVER calls
//      admin.createBusiness (that provisions a Links profile + google_review
//      dynamicLink + slug machinery, none of it applicable).
//
// SLUG RULES (neither is ever emitted by a URL — Memories spaces are addressed
// by `code`, /m/[code]):
//   - Business-subscription memories profile slug: `${businessSlug}-memories`
//     (the derived pattern the memories dev seed already uses), distinct from
//     the Links bare slug and the `-google-review`/`-venue` derived slugs, so
//     serviceProfiles.by_slug stays unique-per-slug.
//   - Celebration TENANT slug: `celebration-${code}` where `code` is a fresh
//     lowercased Crockford code (insert-retry on businesses.by_slug). A
//     celebration has no public page, so the slug's only job is to be unique
//     and opaque — never human-facing, never a URL. Its memories profile then
//     takes the same `${businessSlug}-memories` derivation.
//
// COMMISSION SNAPSHOT (RFC-001 §2.4 C.15/C.16): when a celebration is sold by a
// partner, the partnership's current `commissionPercent` is COPIED onto the
// celebration row as `referralCommissionPercent` at sale time. Renegotiating
// the partnership later rewrites the partnership row, never the celebrations
// already sold — the partnership is the current terms, the celebration is the
// terms-as-sold.
// =============================================================================

const dict = getDict("memories-admin");

const MEMORIES_PLAN_KEYS = Object.keys(
  PLAN_LIMITS.scanme_memories,
) as MemoriesPlanKey[];

const CODE_INSERT_ATTEMPTS = 5;
const SLUG_INSERT_ATTEMPTS = 5;
// A one_off window that defaults from just the event date runs from the date to
// two days later — long enough for next-morning uploads at a wedding.
const DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000;

function assertMemoriesPlanKey(
  planKey: string,
): asserts planKey is MemoriesPlanKey {
  if (!(MEMORIES_PLAN_KEYS as string[]).includes(planKey)) {
    throw new ConvexError(dict.unknownPlan);
  }
}

function memoriesProfileSlug(businessSlug: string) {
  return `${businessSlug}-memories`;
}

const celebrationKind = v.union(
  v.literal("svadba"),
  v.literal("rodjendan"),
  v.literal("krstenje"),
  v.literal("veridba"),
  v.literal("ispracaj"),
  v.literal("maturska"),
  v.literal("godisnjica"),
  v.literal("other"),
);

const acquisitionChannel = v.union(
  v.literal("direct"),
  v.literal("partner"),
  v.literal("ads"),
  v.literal("other"),
);

async function memoriesProfileForBusiness(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
) {
  return await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", "scanme_memories"),
    )
    .unique();
}

async function spaceForProfile(
  ctx: QueryCtx | MutationCtx,
  memoriesProfileId: Id<"serviceProfiles">,
) {
  return await ctx.db
    .query("memoriesSpaces")
    .withIndex("by_memoriesProfileId", (q) =>
      q.eq("memoriesProfileId", memoriesProfileId),
    )
    .first();
}

async function activePartnership(
  ctx: QueryCtx | MutationCtx,
  partnerBusinessId: Id<"businesses">,
) {
  return await ctx.db
    .query("partnerships")
    .withIndex("by_partnerBusinessId_and_status", (q) =>
      q.eq("partnerBusinessId", partnerBusinessId).eq("status", "active"),
    )
    .first();
}

// Generate a Memories space code unique in memoriesSpaces.by_code (Convex
// indexes are not unique, so the check-and-insert runs in this serializable
// transaction — the same insert-retry contract as cards.createCard).
async function uniqueSpaceCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < CODE_INSERT_ATTEMPTS; attempt += 1) {
    const candidate = generateCode();
    const taken = await ctx.db
      .query("memoriesSpaces")
      .withIndex("by_code", (q) => q.eq("code", candidate))
      .unique();
    if (!taken) return candidate;
  }
  throw new ConvexError(dict.celebrationError);
}

async function uniqueCelebrationSlug(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < SLUG_INSERT_ATTEMPTS; attempt += 1) {
    const candidate = `celebration-${generateCode().toLowerCase()}`;
    const taken = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (!taken) return candidate;
  }
  throw new ConvexError(dict.celebrationError);
}

// Create a fresh recurring space for a business's memories profile.
async function createRecurringSpace(
  ctx: MutationCtx,
  business: Doc<"businesses">,
  memoriesProfileId: Id<"serviceProfiles">,
  name: string,
  now: number,
) {
  const code = await uniqueSpaceCode(ctx);
  const spaceId = await ctx.db.insert("memoriesSpaces", {
    businessId: business._id,
    memoriesProfileId,
    code,
    name,
    mode: "recurring",
    status: "active",
    nightCutoffHour: 6,
    defaultVisibility: "everyone",
    guestVisibilityChoice: true,
    // Both host switches default OFF — a space is private to its guests and
    // host until the host opts in (RFC-001 §2.4 C.4).
    publicGalleryEnabled: false,
    wallEnabled: false,
    totalPhotos: 0,
    totalGuests: 0,
    createdAt: now,
    updatedAt: now,
  });
  return { spaceId, code };
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// -----------------------------------------------------------------------------
// A. Grant Memories to an existing business (recurring subscription).
// -----------------------------------------------------------------------------

// Idempotent, mirroring venueAdmin.grantVenue: granting twice never creates a
// second profile or a second space. A re-grant reactivates the profile,
// re-upserts the entitlement (so the plan tier can change), and ensures the
// recurring space exists — returning the existing ids with created:false.
export const grantMemories = mutation({
  args: {
    businessId: v.id("businesses"),
    planKey: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertMemoriesPlanKey(args.planKey);

    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError(dict.businessNotFound);
    if (business.archivedAt) throw new ConvexError(dict.businessArchived);
    if (business.kind === "celebration") {
      throw new ConvexError(dict.businessNotABusiness);
    }

    const now = Date.now();
    const spaceName = optionalTrimmed(args.name) ?? business.name;
    const existing = await memoriesProfileForBusiness(ctx, args.businessId);

    if (existing) {
      if (existing.status !== "active") {
        await ctx.db.patch(existing._id, { status: "active", updatedAt: now });
      }
      const entitlementId = await upsertManualEntitlement(ctx, {
        businessId: args.businessId,
        product: "scanme_memories",
        planKey: args.planKey,
        now,
      });
      let space = await spaceForProfile(ctx, existing._id);
      if (!space) {
        const created = await createRecurringSpace(
          ctx,
          business,
          existing._id,
          spaceName,
          now,
        );
        space = await ctx.db.get(created.spaceId);
      }
      return {
        created: false as const,
        memoriesProfileId: existing._id,
        spaceId: space!._id,
        code: space!.code,
        entitlementId,
      };
    }

    // Fresh grant. Guard the derived `-memories` slug against a collision in
    // serviceProfiles.by_slug (the one index that resolves by slug).
    const slug = memoriesProfileSlug(business.slug);
    const slugTaken = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (slugTaken) throw new ConvexError(dict.grantError);

    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId: args.businessId,
      type: "scanme_memories",
      slug,
      status: "active",
      // No owner-facing editor for Memories (spaces are run from the client
      // panel, not an editor), so clientEditingEnabled stays false.
      clientEditingEnabled: false,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const { spaceId, code } = await createRecurringSpace(
      ctx,
      business,
      memoriesProfileId,
      spaceName,
      now,
    );
    const entitlementId = await upsertManualEntitlement(ctx, {
      businessId: args.businessId,
      product: "scanme_memories",
      planKey: args.planKey,
      now,
    });

    return {
      created: true as const,
      memoriesProfileId,
      spaceId,
      code,
      entitlementId,
    };
  },
});

// Turn Memories off without deleting content — the mirror of
// venueAdmin.deactivateVenue, but Memories enforcement lives in the space
// status + entitlement (reserveUpload never reads the PROFILE status), so
// flipping the profile alone would not stop uploads. This flips the profile to
// inactive (so the host panel's section disappears) AND expires the
// business-scoped Memories entitlement (so reserveUpload refuses with
// "notActivated"). Every space, session and photo row is left untouched, and a
// re-grant reactivates both.
export const deactivateMemories = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await memoriesProfileForBusiness(ctx, args.businessId);
    if (!profile) throw new ConvexError(dict.profileNotFound);
    const now = Date.now();
    if (profile.status !== "inactive") {
      await ctx.db.patch(profile._id, { status: "inactive", updatedAt: now });
    }
    const entitlements = await ctx.db
      .query("entitlements")
      .withIndex("by_businessId_and_product", (q) =>
        q.eq("businessId", args.businessId).eq("product", "scanme_memories"),
      )
      .take(50);
    for (const entitlement of entitlements) {
      if (entitlement.status === "active") {
        await ctx.db.patch(entitlement._id, {
          status: "expired",
          updatedAt: now,
        });
      }
    }
    return { deactivated: true as const, memoriesProfileId: profile._id };
  },
});

// -----------------------------------------------------------------------------
// B. Create a celebration (its own tenant). NEVER via admin.createBusiness.
// -----------------------------------------------------------------------------

export type CelebrationInput = {
  kind: Doc<"celebrations">["kind"];
  title: string;
  celebrantNames?: string;
  eventDate: number;
  venueName?: string;
  venueBusinessId?: Id<"businesses">;
  acquisitionChannel: Doc<"celebrations">["acquisitionChannel"];
  referredByBusinessId?: Id<"businesses">;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  planKey: string;
  windowStartAt?: number;
  windowEndAt?: number;
  spaceName?: string;
};

// The whole celebration-provisioning transaction, WITHOUT the admin gate — so
// the admin mutation (below) and the dev seed (convex/memoriesDevSeed.ts) run
// one implementation. Everything except requireAdmin lives here.
export async function provisionCelebration(
  ctx: MutationCtx,
  args: CelebrationInput,
) {
  {
    assertMemoriesPlanKey(args.planKey);

    const title = args.title.trim();
    if (!title) throw new ConvexError(dict.celebrationTitleRequired);
    const contactName = args.contactName.trim();
    if (!contactName) throw new ConvexError(dict.celebrationContactRequired);
    if (!Number.isFinite(args.eventDate) || args.eventDate <= 0) {
      throw new ConvexError(dict.celebrationDateRequired);
    }

    // Upload window: default to [eventDate, eventDate + 48h] when unset.
    const windowStartAt = args.windowStartAt ?? args.eventDate;
    const windowEndAt = args.windowEndAt ?? args.eventDate + DEFAULT_WINDOW_MS;
    if (windowStartAt >= windowEndAt) {
      throw new ConvexError(dict.windowOrderInvalid);
    }

    // Commission snapshot for the partner channel (RFC §2.4 C.15/C.16).
    let referredByBusinessId: Id<"businesses"> | undefined;
    let referralCommissionPercent: number | undefined;
    if (args.acquisitionChannel === "partner") {
      if (!args.referredByBusinessId) {
        throw new ConvexError(dict.partnerRequired);
      }
      const partnership = await activePartnership(
        ctx,
        args.referredByBusinessId,
      );
      if (!partnership) throw new ConvexError(dict.partnershipNotFound);
      if (!partnership.productScope.includes("scanme_memories")) {
        throw new ConvexError(dict.partnershipScopeMismatch);
      }
      referredByBusinessId = args.referredByBusinessId;
      // THE SNAPSHOT: copied now, never re-read from the partnership again.
      referralCommissionPercent = partnership.commissionPercent;
    }

    const now = Date.now();

    // 1. The tenant row (kind:"celebration"; name = the celebration title).
    const slug = await uniqueCelebrationSlug(ctx);
    const businessId = await ctx.db.insert("businesses", {
      name: title,
      slug,
      kind: "celebration",
      status: "active",
      createdAt: now,
    });

    // 2. The celebrations product row.
    const celebrationId = await ctx.db.insert("celebrations", {
      businessId,
      kind: args.kind,
      title,
      celebrantNames: optionalTrimmed(args.celebrantNames),
      eventDate: args.eventDate,
      venueName: optionalTrimmed(args.venueName),
      venueBusinessId: args.venueBusinessId,
      acquisitionChannel: args.acquisitionChannel,
      referredByBusinessId,
      referralCommissionPercent,
      contactName,
      contactPhone: optionalTrimmed(args.contactPhone),
      contactEmail: optionalTrimmed(args.contactEmail),
      status: "booked",
      createdAt: now,
      updatedAt: now,
    });

    // 3. The scanme_memories profile (derived slug; never a URL).
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      slug: memoriesProfileSlug(slug),
      status: "active",
      clientEditingEnabled: false,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 4. The entitlement (business-scoped).
    const entitlementId = await upsertManualEntitlement(ctx, {
      businessId,
      product: "scanme_memories",
      planKey: args.planKey,
      now,
    });

    // 5. The one_off space with its upload window.
    const code = await uniqueSpaceCode(ctx);
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code,
      name: optionalTrimmed(args.spaceName) ?? title,
      mode: "one_off",
      status: "active",
      windowStartAt,
      windowEndAt,
      defaultVisibility: "everyone",
      guestVisibilityChoice: true,
      publicGalleryEnabled: false,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Open the single one_off session synchronously (same transaction) and
    // schedule its close at windowEndAt — the wedding's night exists the
    // instant the space does.
    const space = (await ctx.db.get(spaceId))!;
    const { sessionId } = await openOneOffSessionForSpace(ctx, space, now);

    return {
      businessId,
      celebrationId,
      memoriesProfileId,
      entitlementId,
      spaceId,
      sessionId,
      code,
      slug,
      referralCommissionPercent: referralCommissionPercent ?? null,
    };
  }
}

export const createCelebration = mutation({
  args: {
    kind: celebrationKind,
    title: v.string(),
    celebrantNames: v.optional(v.string()),
    eventDate: v.number(),
    venueName: v.optional(v.string()),
    venueBusinessId: v.optional(v.id("businesses")),
    acquisitionChannel,
    referredByBusinessId: v.optional(v.id("businesses")),
    contactName: v.string(),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    planKey: v.string(),
    windowStartAt: v.optional(v.number()),
    windowEndAt: v.optional(v.number()),
    spaceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await provisionCelebration(ctx, args);
  },
});

// -----------------------------------------------------------------------------
// Partnerships — the standing referral agreement (C.16); createCelebration
// snapshots its commissionPercent at sale time.
// -----------------------------------------------------------------------------

export const createPartnership = mutation({
  args: {
    partnerBusinessId: v.id("businesses"),
    commissionPercent: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.partnerBusinessId);
    if (!business) throw new ConvexError(dict.businessNotFound);
    if (
      !Number.isFinite(args.commissionPercent) ||
      args.commissionPercent < 0 ||
      args.commissionPercent > 100
    ) {
      throw new ConvexError(dict.commissionInvalid);
    }
    const existing = await activePartnership(ctx, args.partnerBusinessId);
    if (existing) throw new ConvexError(dict.partnerAlreadyExists);
    const now = Date.now();
    const partnershipId = await ctx.db.insert("partnerships", {
      partnerBusinessId: args.partnerBusinessId,
      status: "active",
      commissionPercent: args.commissionPercent,
      // This task's channel is Memories; the scope is that product.
      productScope: ["scanme_memories"],
      startedAt: now,
      notes: optionalTrimmed(args.notes),
    });
    return { partnershipId };
  },
});

// -----------------------------------------------------------------------------
// Admin read models.
// -----------------------------------------------------------------------------

type SpaceRow = {
  spaceId: Id<"memoriesSpaces">;
  code: string;
  name: string;
  mode: Doc<"memoriesSpaces">["mode"];
  status: Doc<"memoriesSpaces">["status"];
  businessId: Id<"businesses">;
  tenantName: string;
  tenantKind: "business" | "celebration";
  profileActive: boolean;
  planKey: string | null;
  entitled: boolean;
  windowStartAt: number | null;
  windowEndAt: number | null;
  celebration: {
    kind: Doc<"celebrations">["kind"];
    eventDate: number;
    acquisitionChannel: Doc<"celebrations">["acquisitionChannel"];
    partnerName: string | null;
    referralCommissionPercent: number | null;
  } | null;
};

// Every Memories space across businesses and celebrations, with plan tier,
// status, and (for a celebration) its acquisition channel + partner +
// snapshotted commission. Bounded (200 spaces).
export const listMemoriesSpaces = query({
  args: {},
  handler: async (ctx): Promise<SpaceRow[]> => {
    await requireAdmin(ctx);
    const spaces = await ctx.db.query("memoriesSpaces").order("desc").take(200);
    return await Promise.all(
      spaces.map(async (space): Promise<SpaceRow> => {
        const business = await ctx.db.get(space.businessId);
        const profile = await ctx.db.get(space.memoriesProfileId);
        const entitlement = await getEntitlement(
          ctx,
          space.businessId,
          "scanme_memories",
          space._id,
        );
        const tenantKind: "business" | "celebration" =
          business?.kind === "celebration" ? "celebration" : "business";
        let celebration: SpaceRow["celebration"] = null;
        if (tenantKind === "celebration") {
          const row = await ctx.db
            .query("celebrations")
            .withIndex("by_businessId", (q) =>
              q.eq("businessId", space.businessId),
            )
            .unique();
          if (row) {
            let partnerName: string | null = null;
            if (row.referredByBusinessId) {
              const partner = await ctx.db.get(row.referredByBusinessId);
              partnerName = partner?.name ?? null;
            }
            celebration = {
              kind: row.kind,
              eventDate: row.eventDate,
              acquisitionChannel: row.acquisitionChannel,
              partnerName,
              referralCommissionPercent:
                row.referralCommissionPercent ?? null,
            };
          }
        }
        return {
          spaceId: space._id,
          code: space.code,
          name: space.name,
          mode: space.mode,
          status: space.status,
          businessId: space.businessId,
          tenantName: business?.name ?? space.name,
          tenantKind,
          profileActive: profile?.status === "active",
          planKey: entitlement?.planKey ?? null,
          entitled: entitlement !== null,
          windowStartAt: space.windowStartAt ?? null,
          windowEndAt: space.windowEndAt ?? null,
          celebration,
        };
      }),
    );
  },
});

type GrantableBusiness = {
  id: Id<"businesses">;
  name: string;
  slug: string;
  hasMemories: boolean;
};

// Businesses (kind "business") the operator can grant Memories to or set up as
// a partner. `hasMemories` lets the grant picker exclude ones already active.
export const listGrantableBusinesses = query({
  args: {},
  handler: async (ctx): Promise<GrantableBusiness[]> => {
    await requireAdmin(ctx);
    const businesses = await ctx.db.query("businesses").order("desc").take(200);
    const rows: GrantableBusiness[] = [];
    for (const business of businesses) {
      if (business.archivedAt) continue;
      if (business.kind === "celebration") continue;
      const profile = await memoriesProfileForBusiness(ctx, business._id);
      rows.push({
        id: business._id,
        name: business.name,
        slug: business.slug,
        hasMemories: profile?.status === "active",
      });
    }
    return rows;
  },
});

type PartnerRow = {
  partnerBusinessId: Id<"businesses">;
  partnershipId: Id<"partnerships">;
  name: string;
  commissionPercent: number;
  status: Doc<"partnerships">["status"];
  startedAt: number;
  referralCount: number;
  owedCount: number;
  referrals: Array<{
    celebrationId: Id<"celebrations">;
    title: string;
    eventDate: number;
    status: Doc<"celebrations">["status"];
    commissionPercent: number | null;
    billable: boolean;
  }>;
};

// Statuses a commission is owed on (RFC §2.4 C.15).
const BILLABLE = new Set(["booked", "active", "completed"]);

// The partner view: every partnership with the celebrations it referred and
// what is owed. Commission is read from each celebration's SNAPSHOTTED
// `referralCommissionPercent` (the terms-as-sold), never the partnership's
// current percent — so renegotiating terms never rewrites the referral ledger.
export const listPartnerships = query({
  args: {},
  handler: async (ctx): Promise<PartnerRow[]> => {
    await requireAdmin(ctx);
    const partnerships = await ctx.db
      .query("partnerships")
      .withIndex("by_status_and_startedAt", (q) => q.eq("status", "active"))
      .order("desc")
      .take(100);
    return await Promise.all(
      partnerships.map(async (partnership): Promise<PartnerRow> => {
        const business = await ctx.db.get(partnership.partnerBusinessId);
        const referred = await ctx.db
          .query("celebrations")
          .withIndex("by_referredByBusinessId_and_status", (q) =>
            q.eq("referredByBusinessId", partnership.partnerBusinessId),
          )
          .take(200);
        const referrals = referred.map((celebration) => ({
          celebrationId: celebration._id,
          title: celebration.title,
          eventDate: celebration.eventDate,
          status: celebration.status,
          commissionPercent: celebration.referralCommissionPercent ?? null,
          billable: BILLABLE.has(celebration.status),
        }));
        return {
          partnerBusinessId: partnership.partnerBusinessId,
          partnershipId: partnership._id,
          name: business?.name ?? "—",
          commissionPercent: partnership.commissionPercent,
          status: partnership.status,
          startedAt: partnership.startedAt,
          referralCount: referrals.length,
          owedCount: referrals.filter((referral) => referral.billable).length,
          referrals: referrals.sort((a, b) => b.eventDate - a.eventDate),
        };
      }),
    );
  },
});
