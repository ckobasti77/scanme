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
import { PLAN_LIMITS, type VenuePlanKey } from "./lib/plans";

// =============================================================================
// TASK-11 — Venue provisioning: the admin-gated write path that makes Venue
// reachable. This lives here, NOT in convex/venue.ts, on purpose: venue.ts is
// the TASK-08 render backend — public queries and owner-facing editor writes,
// provable without a browser and with no admin surface. Admin provisioning is a
// distinct concern (requireAdmin, entitlements, the service registry) and is
// grouped here exactly the way convex/admin.ts is separate from
// convex/scanMeLinks.ts. It deliberately does NOT widen admin.createBusiness
// (RFC-001 §2.1.4 keeps its hardcoded two-profile block untouched).
//
// Venue-profile slug rule (RFC-001 §2.1.4, settled in TASK-02): the venue
// profile stores the DERIVED value `${businessSlug}-venue`. It is distinct from
// the Links profile's bare slug and the `-google-review` review slug, and is
// NEVER emitted by a URL — /[slug]/venue resolves the profile by
// (businessId, type:"scanme_venue"), never through serviceBySlug — so
// serviceProfiles.by_slug stays unique-per-slug and serviceBySlug's `.unique()`
// can never trip over it.
// =============================================================================

// The plan keys the venue catalog actually defines (today only "basic";
// RFC §5 Q1 leaves the tier list open). Validated at the boundary so a bogus
// planKey can never land in an entitlement row.
const VENUE_PLAN_KEYS = Object.keys(
  PLAN_LIMITS.scanme_venue,
) as VenuePlanKey[];

function venueProfileSlug(businessSlug: string) {
  return `${businessSlug}-venue`;
}

function assertVenuePlanKey(planKey: string): asserts planKey is VenuePlanKey {
  if (!(VENUE_PLAN_KEYS as string[]).includes(planKey)) {
    throw new ConvexError(`Nepoznat Venue plan: ${planKey}.`);
  }
}

async function venueProfileForBusiness(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
) {
  return await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", "scanme_venue"),
    )
    .unique();
}

// The event the admin sees as "current" for a Venue business, and the one the
// editor opens: the live event first, else the soonest scheduled, else the most
// recently created event of any status. Bounded reads per business.
async function currentVenueEvent(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"events"> | null> {
  const live = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "live"),
    )
    .first();
  if (live) return live;

  const scheduled = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "scheduled"),
    )
    .take(100);
  let soonest: Doc<"events"> | null = null;
  for (const event of scheduled) {
    if (event.startsAt === undefined) continue;
    if (!soonest || event.startsAt < (soonest.startsAt ?? Infinity)) {
      soonest = event;
    }
  }
  if (soonest) return soonest;

  const recent = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_startsAt", (q) =>
      q.eq("businessId", businessId),
    )
    .order("desc")
    .take(1);
  return recent[0] ?? null;
}

// Create the venue profile's first event + its empty, unpublished 1:1 config,
// exactly matching venue.createEvent's shape (draft status, publishedRevision
// initialized to 0, no published-content field written — invariant #2 in
// venue.ts stays intact: publishDraft remains the only writer of published*).
async function createFirstEvent(
  ctx: MutationCtx,
  business: Doc<"businesses">,
  venueProfileId: Id<"serviceProfiles">,
  now: number,
) {
  const eventId = await ctx.db.insert("events", {
    businessId: business._id,
    slug: "dogadjaj",
    title: business.name,
    status: "draft",
    lifecycleRevision: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("venueEventConfigs", {
    eventId,
    venueProfileId,
    hasUnpublishedChanges: false,
    draftRevision: 0,
    publishedRevision: 0,
    updatedAt: now,
  });
  return eventId;
}

// Grant Venue to an existing business in ONE transaction (RFC-001 §2.1.4 + §2.3):
//   1. create the scanme_venue serviceProfiles row (derived `-venue` slug);
//   2. create its first `draft` event + empty venueEventConfigs, so the editor
//      has something to open;
//   3. set the profile status active and upsert the entitlement.
//
// It reuses `upsertManualEntitlement` — the same helper admin.approveActivation
// (TASK-03) calls — rather than duplicating the entitlement write, so the
// "status and entitlement can never drift" guarantee is identical. It does NOT
// call approveActivation itself: that mutation is keyed to a
// serviceActivationRequests row it must close, and the direct admin grant has no
// such request; the reusable core is the entitlement upsert, and that is shared.
//
// Idempotent: granting twice never creates a second profile. If the profile
// already exists it is reactivated (status → active) and its entitlement
// re-upserted (so the plan tier can be changed), and the existing profile is
// returned with `created: false`.
export const grantVenue = mutation({
  args: {
    businessId: v.id("businesses"),
    planKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertVenuePlanKey(args.planKey);

    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    if (business.archivedAt) {
      throw new ConvexError("Arhiviranom lokalu se ne može dodeliti Venue.");
    }

    const now = Date.now();
    const existing = await venueProfileForBusiness(ctx, args.businessId);

    if (existing) {
      // Idempotent re-grant: reactivate the profile and re-upsert the
      // entitlement (the upsert patches the single active row in place — never
      // a second row). No second profile, no second event.
      if (existing.status !== "active") {
        await ctx.db.patch(existing._id, { status: "active", updatedAt: now });
      }
      const entitlementId = await upsertManualEntitlement(ctx, {
        businessId: args.businessId,
        product: "scanme_venue",
        planKey: args.planKey,
        now,
      });
      return {
        created: false as const,
        venueProfileId: existing._id,
        slug: existing.slug,
        entitlementId,
      };
    }

    // Fresh grant. Guard the derived slug against a collision in the one table
    // that resolves by slug (serviceProfiles.by_slug) — the same guard
    // createBusiness applies to its derived slugs.
    const slug = venueProfileSlug(business.slug);
    const slugTaken = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (slugTaken) {
      throw new ConvexError("Izvedeni Venue slug se već koristi.");
    }

    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId: args.businessId,
      type: "scanme_venue",
      slug,
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await createFirstEvent(ctx, business, venueProfileId, now);
    const entitlementId = await upsertManualEntitlement(ctx, {
      businessId: args.businessId,
      product: "scanme_venue",
      planKey: args.planKey,
      now,
    });

    return {
      created: true as const,
      venueProfileId,
      slug,
      eventId,
      entitlementId,
    };
  },
});

// Turn Venue off without deleting the business's content (RFC-001 §2.1 — the
// mirror of setServiceActive's deactivate path). The profile flips to
// "inactive"; every event, config, block and reservation row is left untouched,
// so publicVenuePageState renders the graceful "inactive" state (never a 404)
// and re-granting restores everything.
export const deactivateVenue = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await venueProfileForBusiness(ctx, args.businessId);
    if (!profile) throw new ConvexError("Venue profil nije pronađen.");
    if (profile.status !== "inactive") {
      await ctx.db.patch(profile._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    }
    return { deactivated: true as const, venueProfileId: profile._id };
  },
});

type VenueBusinessRow = {
  id: Id<"businesses">;
  name: string;
  slug: string;
  venue: {
    profileId: Id<"serviceProfiles">;
    status: Doc<"serviceProfiles">["status"];
    planKey: string | null;
    currentEvent: {
      slug: string;
      title: string;
      status: Doc<"events">["status"];
    } | null;
  } | null;
};

// The admin Venue console's read model: every non-archived business, whether it
// owns a Venue profile, at which plan tier, and its current event + lifecycle
// status. Bounded (100 businesses); entitlement is read through the single
// getEntitlement path (§2.3), never the table directly.
export const listVenueBusinesses = query({
  args: {},
  handler: async (ctx): Promise<VenueBusinessRow[]> => {
    await requireAdmin(ctx);
    const businesses = await ctx.db.query("businesses").order("desc").take(100);
    const active = businesses.filter((business) => !business.archivedAt);

    return await Promise.all(
      active.map(async (business): Promise<VenueBusinessRow> => {
        const profile = await venueProfileForBusiness(ctx, business._id);
        if (!profile) {
          return { id: business._id, name: business.name, slug: business.slug, venue: null };
        }
        const entitlement = await getEntitlement(
          ctx,
          business._id,
          "scanme_venue",
        );
        const event = await currentVenueEvent(ctx, business._id);
        return {
          id: business._id,
          name: business.name,
          slug: business.slug,
          venue: {
            profileId: profile._id,
            status: profile.status,
            planKey: entitlement?.planKey ?? null,
            currentEvent: event
              ? { slug: event.slug, title: event.title, status: event.status }
              : null,
          },
        };
      }),
    );
  },
});
