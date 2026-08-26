import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { hashInvitationToken } from "./lib/invitations";
import { upsertManualEntitlement } from "./lib/entitlements";
import { normalizeEmail } from "./lib/validation";
import { clampBlockList, type VenueBlock } from "../lib/venue-blocks";

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

// =============================================================================
// TASK-11 STEP 3 — the one-command demo seed. Follows convex/demo.ts exactly:
// env-key-gated (same guard shape + 16-char minimum), clearly marked demo data,
// safe to re-run (returns the existing demo instead of duplicating it). Unlike
// demo.ts it is an `action`, not a `mutation`, for one reason: the block
// validators brand gallery/profile `storageId` as `Id<"_storage">`, so a
// path-shaped fixture id (`/dev-venue/1.jpg`) is REJECTED at write time — the
// demo gallery needs REAL storage ids, and `ctx.storage.store` exists only on an
// action's storage writer. The action stores one placeholder image, then a
// single internal mutation writes every row in one transaction. It is still run
// with one `npx convex run` line.
//
// The seed writes published* directly (mirroring how admin.createBusiness
// pre-fills Links `published*` at row creation, RFC §1.d) so `/[slug]/venue`
// shows the LIVE state the instant the seed finishes. That is the accepted
// seeding exception to venue.ts's "publishDraft is the only writer of
// published*" invariant, which governs the request path, not one-shot demo data.
// =============================================================================

const VENUE_DEMO_SLUG = "venue-primer";
const VENUE_DEMO_NAME = "Venue primer — Klub Mimeza";
const VENUE_DEMO_DISPLAY = "Klub Mimeza";
const VENUE_DEMO_EVENT_SLUG = "otvaranje-sezone";
const VENUE_DEMO_EVENT_TITLE = "Otvaranje letnje sezone";

// A verified 2×2 PNG (amber/ink checkerboard). Stored to Convex file storage so
// the seeded gallery/profile blocks carry real `Id<"_storage">` values;
// next/image upscales it to a flat placeholder swatch — enough to exercise the
// gallery + lightbox render path end to end.
const VENUE_DEMO_IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO4tixJRU2LQUVN69qyJAAhZgSlJk3PFgAAAABJRU5ErkJggg==";

function assertVenueDemoKey(setupKey: string) {
  const configuredKey = env.SCANME_VENUE_DEMO_SETUP_KEY;
  if (!configuredKey || setupKey !== configuredKey || configuredKey.length < 16) {
    throw new Error("Venue demo podešavanje nije dozvoljeno.");
  }
}

const venueDemoPaths = {
  slug: VENUE_DEMO_SLUG,
  eventSlug: VENUE_DEMO_EVENT_SLUG,
  editorPath: `/${VENUE_DEMO_SLUG}/venue/editor`,
  publicPath: `/${VENUE_DEMO_SLUG}/venue`,
};

// A representative published block set (RFC §2.5 twelve types minus pastEvents,
// which needs an archive that a fresh demo has none of). Storage ids come from
// the seed's stored placeholder so gallery/profile images resolve.
function venueDemoBlocks(
  imageStorageId: Id<"_storage">,
  eventStartsAt: number,
  eventEndsAt: number,
): VenueBlock[] {
  const image = imageStorageId as unknown as string;
  const hoursAfterStart = (h: number) => eventStartsAt + h * 3_600_000;
  const blocks: VenueBlock[] = [
    {
      type: "countdown",
      base: { id: "seed-countdown", visible: true, animation: "fade-up" },
      props: {
        // A future milestone so the demo shows a live, ticking countdown.
        target: { kind: "custom", timestamp: eventStartsAt + 3 * 86_400_000 },
        units: { days: true, hours: true, minutes: true, seconds: true },
        style: "cards",
        completedBehavior: "message",
        completedMessage: "Vrata su otvorena — vidimo se unutra!",
      },
    },
    {
      type: "eventDateTime",
      base: { id: "seed-datetime", visible: true, surface: "card" },
      props: {
        startsAt: eventStartsAt,
        endsAt: eventEndsAt,
        venueName: "Klub Mimeza",
        address: "Karađorđeva 2, Beograd",
        showAddToCalendar: true,
        googleCalendarLink: true,
        icsDownload: true,
      },
    },
    {
      type: "richText",
      base: { id: "seed-intro", visible: true },
      props: {
        content:
          "Otvaramo letnju sezonu na krovu. Tri benda, koktel karta i pogled na Savu.\n\nUlaz je slobodan uz rezervaciju stola.",
      },
    },
    {
      type: "programTimeline",
      base: { id: "seed-program", visible: true, animation: "reveal" },
      props: {
        heading: "Program večeri",
        layout: "timeline",
        showTimes: true,
        items: [
          { id: "p1", startsAt: hoursAfterStart(0), title: "Otvaranje i welcome koktel", subtitle: "DJ Lenka na gramofonima" },
          { id: "p2", startsAt: hoursAfterStart(1.5), title: "Divlje jagode — akustični set" },
          { id: "p3", startsAt: hoursAfterStart(3), title: "Mimeza houseband", subtitle: "uz specijalne goste" },
          { id: "p4", startsAt: hoursAfterStart(5), title: "Afterparty na krovu" },
        ],
      },
    },
    {
      type: "profileCards",
      base: { id: "seed-profiles", visible: true },
      props: {
        heading: "Nastupaju",
        layout: "grid",
        columns: 3,
        items: [
          { id: "a1", name: "DJ Lenka", role: "warm-up", imageStorageId: image },
          { id: "a2", name: "Divlje jagode", role: "akustični set", imageStorageId: image },
          { id: "a3", name: "Mimeza houseband", role: "glavni program", imageStorageId: image },
        ],
      },
    },
    {
      type: "gallery",
      base: { id: "seed-gallery", visible: true, animation: "reveal" },
      props: {
        layout: "grid",
        columns: 3,
        gap: 8,
        aspect: "square",
        lightbox: true,
        items: [1, 2, 3, 4, 5, 6].map((n) => ({
          id: `g${n}`,
          storageId: image,
          caption: n === 1 ? "Krovna terasa" : undefined,
        })),
      },
    },
    {
      type: "priceList",
      base: { id: "seed-price", visible: true, surface: "card" },
      props: {
        heading: "Koktel karta",
        currency: "RSD",
        sections: [
          {
            id: "s1",
            title: "Kokteli",
            items: [
              { id: "s1a", name: "Mimeza spritz", description: "bazga, prosecco, grejp", price: 890 },
              { id: "s1b", name: "Sava sour", description: "šljivovica, limun, belance", price: 950 },
              { id: "s1c", name: "Kalemegdan mule", price: 870 },
            ],
          },
          {
            id: "s2",
            title: "Bez alkohola",
            items: [
              { id: "s2a", name: "Domaća limunada sa lavandom", price: 450 },
              { id: "s2b", name: "Hladni espresso tonik", price: 520 },
            ],
          },
        ],
      },
    },
    {
      type: "map",
      base: { id: "seed-map", visible: true },
      props: {
        location: { kind: "address", address: "Karađorđeva 2, Beograd" },
        zoom: 16,
        pinLabel: "Klub Mimeza — ulaz iz Male Vasine",
        display: "embed",
      },
    },
    {
      type: "reservation",
      base: { id: "seed-reservation", visible: true, surface: "card" },
      props: {
        heading: "Rezerviši sto",
        fields: { name: true, phone: true, email: false, partySize: true, note: true },
        capacity: 120,
        confirmationMessage: "Sto je rezervisan — potvrda stiže porukom.",
      },
    },
    {
      type: "share",
      base: { id: "seed-share", visible: true },
      props: {
        channels: ["whatsapp", "viber", "copy"],
        message: "Vidimo se na otvaranju sezone kod Mimeze!",
      },
    },
    {
      type: "spacer",
      base: { id: "seed-spacer", visible: true },
      props: { height: 24, divider: true },
    },
  ];
  return clampBlockList(blocks);
}

// Idempotency probe used by the action before it stores anything, so a re-run
// never orphans a fresh image blob.
export const venueSeedStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", VENUE_DEMO_SLUG))
      .unique();
    return { exists: business !== null };
  },
});

// The one-transaction writer: demo business + active Venue profile + entitlement
// + a currently-LIVE event whose config is published with the representative
// blocks. Internal ⇒ only the seed action (or another function) can call it.
export const applyVenueSeed = internalMutation({
  args: { imageStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", VENUE_DEMO_SLUG))
      .unique();
    if (existing) return { created: false as const };

    const now = Date.now();
    // Live now, ending in 12h — far enough out that the reconcile cron will not
    // end it mid-QA.
    const eventStartsAt = now - 3_600_000;
    const eventEndsAt = now + 12 * 3_600_000;

    const businessId = await ctx.db.insert("businesses", {
      name: VENUE_DEMO_NAME,
      slug: VENUE_DEMO_SLUG,
      status: "demo",
      createdAt: now,
    });
    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: `${VENUE_DEMO_SLUG}-venue`,
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await upsertManualEntitlement(ctx, {
      businessId,
      product: "scanme_venue",
      planKey: "basic",
      now,
    });

    const eventId = await ctx.db.insert("events", {
      businessId,
      slug: VENUE_DEMO_EVENT_SLUG,
      title: VENUE_DEMO_EVENT_TITLE,
      status: "live",
      startsAt: eventStartsAt,
      endsAt: eventEndsAt,
      lifecycleRevision: 0,
      createdAt: now,
      updatedAt: now,
    });

    const blocks = venueDemoBlocks(
      args.imageStorageId,
      eventStartsAt,
      eventEndsAt,
    ) as unknown as Doc<"venueEventConfigs">["draftBlocks"];
    await ctx.db.insert("venueEventConfigs", {
      eventId,
      venueProfileId,
      draftDisplayName: VENUE_DEMO_DISPLAY,
      draftBlocks: blocks,
      publishedDisplayName: VENUE_DEMO_DISPLAY,
      publishedBlocks: blocks,
      hasUnpublishedChanges: false,
      draftRevision: 1,
      publishedRevision: 1,
      publishedAt: now,
      updatedAt: now,
    });
    return { created: true as const };
  },
});

// The public entry point: `npx convex run venueDevSeed:seed '{"setupKey":"…"}'`.
export const seed = action({
  args: { setupKey: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ created: boolean } & typeof venueDemoPaths> => {
    assertVenueDemoKey(args.setupKey);

    const status = await ctx.runQuery(internal.venueDevSeed.venueSeedStatus, {});
    if (status.exists) {
      return { created: false, ...venueDemoPaths };
    }

    // Store the placeholder image → a real _storage id the blocks can reference.
    const bytes = Uint8Array.from(atob(VENUE_DEMO_IMAGE_PNG_BASE64), (c) =>
      c.charCodeAt(0),
    );
    const imageStorageId = await ctx.storage.store(
      new Blob([bytes], { type: "image/png" }),
    );

    const result = await ctx.runMutation(internal.venueDevSeed.applyVenueSeed, {
      imageStorageId,
    });
    return { created: result.created, ...venueDemoPaths };
  },
});
