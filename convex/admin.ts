import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { isAdminEmail, requireAdmin } from "./lib/access";
import { isSafePublicDestination, normalizeEmail, requireSlug, requireText } from "./lib/validation";

const INVITATION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const BELGRADE_TIME_ZONE = "Europe/Belgrade";

function dateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function lastDateKeys(days: number) {
  return Array.from({ length: days }, (_, index) =>
    dateKey(Date.now() - index * 24 * 60 * 60 * 1000),
  );
}

function selectPrimaryLink(links: Doc<"dynamicLinks">[]) {
  return links.reduce<Doc<"dynamicLinks"> | null>((selected, link) => {
    if (!selected) return link;
    if (link.active !== selected.active) return link.active ? link : selected;
    return link.updatedAt > selected.updatedAt ? link : selected;
  }, null);
}

const contactArgs = {
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phone: v.string(),
  positionTitle: v.string(),
};

async function createContactAndInvitation(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  contact: { firstName: string; lastName: string; email: string; phone: string; positionTitle: string },
) {
  const now = Date.now();
  const normalizedEmail = normalizeEmail(contact.email);
  const contactId = await ctx.db.insert("businessContacts", {
    businessId,
    firstName: requireText(contact.firstName, "Ime", 2, 80),
    lastName: requireText(contact.lastName, "Prezime", 2, 80),
    normalizedEmail,
    phone: requireText(contact.phone, "Telefon", 5, 40),
    positionTitle: requireText(contact.positionTitle, "Uloga", 2, 80),
    status: "invited",
    createdAt: now,
    updatedAt: now,
  });
  const invitationId = await ctx.db.insert("businessInvitations", {
    businessId,
    contactId,
    normalizedEmail,
    tokenHash: "",
    status: "queued",
    expiresAt: now + INVITATION_LIFETIME,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.invitationEmails.sendInvitation, { invitationId });
  return { contactId, invitationId };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authenticated: false as const, isAdmin: false, email: null };
    const user = await ctx.db.get(userId);
    const email = user?.email?.toLowerCase() ?? null;
    return { authenticated: true as const, isAdmin: isAdminEmail(email ?? undefined), email };
  },
});

export const listBusinesses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const businesses = await ctx.db.query("businesses").order("desc").take(100);
    return await Promise.all(
      businesses.map(async (business) => {
        const links = await ctx.db
          .query("dynamicLinks")
          .withIndex("by_businessId_and_type", (q) =>
            q.eq("businessId", business._id).eq("type", "google_review"),
          )
          .order("desc")
          .take(20);
        const link = selectPrimaryLink(links);
        const contacts = await ctx.db
          .query("businessContacts")
          .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
          .order("desc")
          .take(1);
        const contact = contacts[0] ?? null;
        const invitations = contact
          ? await ctx.db
              .query("businessInvitations")
              .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
              .order("desc")
              .take(1)
          : [];
        return {
          id: business._id,
          name: business.name,
          clientPanelSlug: business.slug,
          status: business.status,
          createdAt: business.createdAt,
          link: link
            ? {
                id: link._id,
                slug: link.slug,
                destinationUrl: link.destinationUrl,
                active: link.active,
                scanCount: link.scanCount,
                updatedAt: link.updatedAt,
              }
            : null,
          contact: contact
            ? {
                id: contact._id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.normalizedEmail,
                phone: contact.phone,
                positionTitle: contact.positionTitle,
                status: contact.status,
              }
            : null,
          invitation: invitations[0]
            ? {
                id: invitations[0]._id,
                status: invitations[0].status,
                expiresAt: invitations[0].expiresAt,
                failureReason: invitations[0].failureReason ?? null,
                sentAt: invitations[0].sentAt ?? null,
              }
            : null,
        };
      }),
    );
  },
});

export const createBusiness = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    destinationUrl: v.string(),
    ...contactArgs,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = requireText(args.name, "Naziv lokala", 2, 120);
    const slug = requireSlug(args.slug);
    if (!isSafePublicDestination(args.destinationUrl)) {
      throw new Error("Destinacija mora biti bezbedan javni HTTPS link.");
    }
    const existingLink = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existingLink) throw new Error("Ovaj QR slug se već koristi.");
    const existingAlias = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existingAlias) throw new Error("Ovaj QR slug je sačuvan za ranije odštampanu adresu.");
    const existingBusiness = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existingBusiness) throw new Error("Oznaka lokala se već koristi.");

    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name,
      slug,
      status: "active",
      createdAt: now,
    });
    const linkId = await ctx.db.insert("dynamicLinks", {
      businessId,
      slug,
      destinationUrl: args.destinationUrl.trim(),
      type: "google_review",
      active: true,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const { invitationId } = await createContactAndInvitation(ctx, businessId, args);
    return { businessId, linkId, invitationId };
  },
});

export const getBusinessMetrics = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .order("desc")
      .take(20);
    const link = selectPrimaryLink(links);
    if (!link) return null;
    const keys = lastDateKeys(7);
    const dailyRows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("dailyScanCounts")
          .withIndex("by_dynamicLinkId_and_dateKey", (q) =>
            q.eq("dynamicLinkId", link._id).eq("dateKey", key),
          )
          .unique(),
      ),
    );
    const recent = (
      await ctx.db
        .query("scanEvents")
        .withIndex("by_dynamicLinkId_and_scannedAt", (q) => q.eq("dynamicLinkId", link._id))
        .order("desc")
        .take(30)
    )
      .filter((event) => event.deviceCategory !== "bot")
      .slice(0, 20);
    return {
      total: link.scanCount,
      today: dailyRows[0]?.count ?? 0,
      last7Days: dailyRows.reduce((sum, row) => sum + (row?.count ?? 0), 0),
      daily: keys.map((key, index) => ({ dateKey: key, count: dailyRows[index]?.count ?? 0 })).reverse(),
      recent: recent.map((event) => ({
        id: event._id,
        scannedAt: event.scannedAt,
        deviceCategory: event.deviceCategory ?? "unknown",
        referrerHost: event.referrerHost ?? null,
      })),
    };
  },
});

export const updateDestination = mutation({
  args: { linkId: v.id("dynamicLinks"), destinationUrl: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!isSafePublicDestination(args.destinationUrl)) {
      throw new Error("Destinacija mora biti bezbedan javni HTTPS link.");
    }
    await ctx.db.patch(args.linkId, {
      destinationUrl: args.destinationUrl.trim(),
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const updateBusinessName = mutation({
  args: { businessId: v.id("businesses"), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    const name = requireText(args.name, "Naziv lokala", 2, 120);
    await ctx.db.patch(args.businessId, { name });
    return { name };
  },
});

export const updateBusinessSlug = mutation({
  args: {
    businessId: v.id("businesses"),
    linkId: v.id("dynamicLinks"),
    kind: v.union(v.literal("qr"), v.literal("clientPanel")),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    const slug = requireSlug(args.slug);
    const link = await ctx.db.get(args.linkId);
    if (!link || link.businessId !== args.businessId || link.type !== "google_review") {
      throw new Error("QR link nije pronađen.");
    }

    const matchingLinks = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingLinks.some((candidate) => candidate._id !== link._id)) {
      throw new Error("Ovaj slug se već koristi za drugu QR adresu.");
    }
    const matchingBusinesses = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingBusinesses.some((candidate) => candidate._id !== business._id)) {
      throw new Error("Ovaj slug se već koristi za drugi klijentski panel.");
    }
    const matchingAliases = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingAliases.some((candidate) => candidate.dynamicLinkId !== link._id)) {
      throw new Error("Ovaj slug je sačuvan za ranije odštampanu QR adresu.");
    }

    if (args.kind === "qr") {
      if (slug !== link.slug) {
        const existingOldSlugAlias = await ctx.db
          .query("dynamicLinkAliases")
          .withIndex("by_slug", (q) => q.eq("slug", link.slug))
          .unique();
        if (!existingOldSlugAlias) {
          await ctx.db.insert("dynamicLinkAliases", {
            slug: link.slug,
            dynamicLinkId: link._id,
            createdAt: Date.now(),
          });
        }
        const promotedAlias = matchingAliases.find(
          (candidate) => candidate.dynamicLinkId === link._id,
        );
        if (promotedAlias) await ctx.db.delete(promotedAlias._id);
        await ctx.db.patch(link._id, { slug, updatedAt: Date.now() });
      }
    } else {
      await ctx.db.patch(business._id, { slug });
    }
    return {
      qrSlug: args.kind === "qr" ? slug : link.slug,
      clientPanelSlug: args.kind === "clientPanel" ? slug : business.slug,
    };
  },
});

export const setBusinessActive = mutation({
  args: { businessId: v.id("businesses"), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .order("desc")
      .take(20);
    const link = selectPrimaryLink(links);
    await ctx.db.patch(args.businessId, { status: args.active ? "active" : "inactive" });
    if (link) await ctx.db.patch(link._id, { active: args.active, updatedAt: Date.now() });
    return { active: args.active };
  },
});

export const resendInvitation = mutation({
  args: { invitationId: v.id("businessInvitations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const previous = await ctx.db.get(args.invitationId);
    if (!previous) throw new Error("Pozivnica nije pronađena.");
    if (previous.status === "accepted") throw new Error("Prihvaćena pozivnica se ne šalje ponovo. Zamenite POC kontakt ako je potrebno.");
    const contact = await ctx.db.get(previous.contactId);
    if (!contact || contact.status === "inactive") throw new Error("POC više nije aktivan.");
    if (previous.status !== "revoked") {
      await ctx.db.patch(previous._id, { status: "revoked", updatedAt: Date.now() });
    }
    const now = Date.now();
    const invitationId = await ctx.db.insert("businessInvitations", {
      businessId: previous.businessId,
      contactId: previous.contactId,
      normalizedEmail: previous.normalizedEmail,
      tokenHash: "",
      status: "queued",
      expiresAt: now + INVITATION_LIFETIME,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.invitationEmails.sendInvitation, { invitationId });
    return { invitationId };
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id("businessInvitations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status === "accepted") {
      throw new Error("Pozivnica ne može biti opozvana.");
    }
    await ctx.db.patch(invitation._id, { status: "revoked", updatedAt: Date.now() });
    return { revoked: true };
  },
});

export const replaceContact = mutation({
  args: { businessId: v.id("businesses"), ...contactArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    const contacts = await ctx.db
      .query("businessContacts")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(50);
    const now = Date.now();
    for (const contact of contacts) {
      await ctx.db.patch(contact._id, { status: "inactive", updatedAt: now });
      if (contact.authUserId) {
        const membership = await ctx.db
          .query("businessMemberships")
          .withIndex("by_userId_and_businessId", (q) =>
            q.eq("userId", contact.authUserId!).eq("businessId", args.businessId),
          )
          .unique();
        if (membership) await ctx.db.patch(membership._id, { active: false, updatedAt: now });
      }
      const invitations = await ctx.db
        .query("businessInvitations")
        .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
        .take(50);
      for (const invitation of invitations) {
        if (invitation.status !== "accepted" && invitation.status !== "revoked") {
          await ctx.db.patch(invitation._id, { status: "revoked", updatedAt: now });
        }
      }
    }
    return await createContactAndInvitation(ctx, args.businessId, args);
  },
});
