import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { hashInvitationToken } from "./lib/invitations";
import { normalizeEmail } from "./lib/validation";

// Dev tooling for the Venue editor (TASK-10 browser QA): provisions a business
// with an active Venue profile and one LIVE event whose config is empty and
// unpublished, so the editor→publish→public-page loop can be exercised end to
// end on a dev deployment. Internal ⇒ callable only via `npx convex run`
// (deploy key) or other functions — never from a client. Deliberately writes
// NO published* field: publishDraft stays the only writer of published content
// (convex/venue.ts invariant #2); the seeded event goes public only when the
// editor itself publishes.
export const seedEditorFixture = internalMutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) return { businessId: existing._id, created: false };

    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: args.name,
      slug: args.slug,
      status: "active",
      createdAt: now,
    });
    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: args.slug,
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    // Live now, ending in 12h — far enough out that the reconcile cron will
    // not end it mid-QA. Status "live" is lifecycle metadata, not published
    // content, so seeding it directly keeps invariant #2 intact.
    const eventId = await ctx.db.insert("events", {
      businessId,
      slug: "probni-dogadjaj",
      title: "Probni događaj",
      status: "live",
      startsAt: now - 3_600_000,
      endsAt: now + 12 * 3_600_000,
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
    return { businessId, created: true };
  },
});

// Companion to seedEditorFixture: a real invitation for a synthetic QA
// account, so an automated editor smoke (load → edit → undo → autosave settle
// → publish, RFC-001 risk #1) can sign up through the PRODUCT's own
// activation flow instead of any auth backdoor. The caller supplies the raw
// token; only its SHA-256 lands in the table, exactly as the production
// invitation flow stores it.
export const seedEditorInvitation = internalMutation({
  args: { businessSlug: v.string(), email: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.businessSlug))
      .unique();
    if (!business) throw new Error("Seed the business first.");
    const now = Date.now();
    const normalizedEmail = normalizeEmail(args.email);
    const contactId = await ctx.db.insert("businessContacts", {
      businessId: business._id,
      firstName: "QA",
      lastName: "Venue",
      normalizedEmail,
      phone: "",
      positionTitle: "QA",
      status: "invited",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("businessInvitations", {
      businessId: business._id,
      contactId,
      normalizedEmail,
      tokenHash: await hashInvitationToken(args.token),
      status: "sent",
      expiresAt: now + 24 * 3_600_000,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { contactId };
  },
});
