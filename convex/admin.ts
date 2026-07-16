import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { isAdminEmail, requireAdmin } from "./lib/access";
import { aggregateMetricRows, getMetricRows, metricsRangeConfig } from "./lib/metrics";
import { isSafePublicDestination, normalizeEmail, normalizePhone, requireSlug, requireText } from "./lib/validation";

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

function normalizeOptionalEmail(value: string) {
  const email = value.trim();
  return email ? normalizeEmail(email) : "";
}

function normalizeOptionalPhone(value: string) {
  const phone = value.trim();
  return phone ? normalizePhone(phone) : "";
}

function normalizeOptionalPosition(value: string) {
  return value.trim() ? requireText(value, "Uloga", 2, 80) : "";
}

async function createContactAndInvitation(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  contact: { firstName: string; lastName: string; email: string; phone: string; positionTitle: string },
  { sendInvitation = true }: { sendInvitation?: boolean } = {},
) {
  const now = Date.now();
  const normalizedEmail = normalizeOptionalEmail(contact.email);
  const contactId = await ctx.db.insert("businessContacts", {
    businessId,
    firstName: requireText(contact.firstName, "Ime", 2, 80),
    lastName: requireText(contact.lastName, "Prezime", 2, 80),
    normalizedEmail,
    phone: normalizeOptionalPhone(contact.phone),
    positionTitle: normalizeOptionalPosition(contact.positionTitle),
    status: "invited",
    createdAt: now,
    updatedAt: now,
  });
  if (!normalizedEmail) return { contactId, invitationId: null };
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
  if (sendInvitation) {
    await ctx.scheduler.runAfter(0, internal.invitationEmails.sendInvitation, { invitationId });
  }
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
        const contactRows = await ctx.db
          .query("businessContacts")
          .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
          .order("asc")
          .take(50);
        const activeContactRows = contactRows.filter((contact) => contact.status !== "inactive");
        const orderedContactRows = activeContactRows.length
          ? activeContactRows
          : contactRows.length
            ? [contactRows[contactRows.length - 1]]
            : [];
        const contactViews = await Promise.all(
          orderedContactRows.map(async (contact) => {
            const invitations = await ctx.db
              .query("businessInvitations")
              .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
              .order("desc")
              .take(1);
            const invitation = invitations[0] ?? null;
            return {
              id: contact._id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.normalizedEmail,
              phone: contact.phone,
              positionTitle: contact.positionTitle,
              status: contact.status,
              invitation: invitation
                ? {
                    id: invitation._id,
                    status: invitation.status,
                    expiresAt: invitation.expiresAt,
                    failureReason: invitation.failureReason ?? null,
                    sentAt: invitation.sentAt ?? null,
                  }
                : null,
            };
          }),
        );
        const contact = contactViews[0] ?? null;
        return {
          id: business._id,
          name: business.name,
          clientPanelSlug: business.slug,
          status: business.status,
          archivedAt: business.archivedAt ?? null,
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
          contact,
          contacts: contactViews,
          invitation: contact?.invitation ?? null,
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
    contacts: v.optional(v.array(v.object(contactArgs))),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    positionTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = requireText(args.name, "Naziv lokala", 2, 120);
    const slug = requireSlug(args.slug);
    const destinationUrl = args.destinationUrl.trim();
    if (destinationUrl && !isSafePublicDestination(destinationUrl)) {
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
      destinationUrl,
      type: "google_review",
      active: true,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const legacyContact = args.firstName || args.lastName || args.email || args.phone || args.positionTitle
      ? {
          firstName: args.firstName ?? "",
          lastName: args.lastName ?? "",
          email: args.email ?? "",
          phone: args.phone ?? "",
          positionTitle: args.positionTitle ?? "",
        }
      : null;
    const contacts = args.contacts?.length ? args.contacts : legacyContact ? [legacyContact] : [];
    const invitations = [];
    for (const contact of contacts) {
      invitations.push(await createContactAndInvitation(ctx, businessId, contact, { sendInvitation: false }));
    }
    return {
      businessId,
      linkId,
      invitationId: invitations[0]?.invitationId ?? null,
      invitationIds: invitations.map(({ invitationId }) => invitationId),
    };
  },
});

export const getBusinessMetrics = query({
  args: {
    businessId: v.id("businesses"),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
    summaryRange: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
  },
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
    const range = args.range ?? "7d";
    const summaryRange = args.summaryRange ?? range;
    const config = metricsRangeConfig[range];
    const summaryConfig = metricsRangeConfig[summaryRange];
    const metricRows = await getMetricRows(ctx, link._id, range);
    const summaryRows = summaryRange === range ? metricRows : await getMetricRows(ctx, link._id, summaryRange);
    const recent = (
      await ctx.db
        .query("scanEvents")
        .withIndex("by_dynamicLinkId_and_scannedAt", (q) => q.eq("dynamicLinkId", link._id))
        .order("desc")
        .take(30)
    )
      .filter((event) => event.deviceCategory !== "bot")
      .slice(0, 20);
    const last7Keys = new Set(lastDateKeys(7));
    const last7Days = metricRows
      .filter((row) => last7Keys.has(row.dateKey))
      .reduce((sum, row) => sum + row.count, 0);
    const todayKey = dateKey(Date.now());
    return {
      total: link.scanCount,
      today: metricRows.find((row) => row.dateKey === todayKey)?.count ?? 0,
      last7Days,
      periodTotal: range === "all" ? link.scanCount : metricRows.reduce((sum, row) => sum + row.count, 0),
      range,
      rangeLabel: config.label,
      summaryRange,
      summaryRangeLabel: summaryConfig.label,
      summaryPeriodTotal: summaryRange === "all" ? link.scanCount : summaryRows.reduce((sum, row) => sum + row.count, 0),
      daily: aggregateMetricRows(metricRows, config.granularity),
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
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    if (business.archivedAt) throw new Error("Arhivirani lokal ne može biti aktiviran.");
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

export const archiveBusiness = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    if (business.archivedAt) throw new Error("Lokal je već arhiviran.");
    if (business.status !== "inactive") {
      throw new Error("Lokal mora biti deaktiviran pre arhiviranja.");
    }

    const now = Date.now();
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(100);
    await ctx.db.patch(args.businessId, { archivedAt: now });
    await Promise.all(
      links.map((link) =>
        ctx.db.patch(link._id, { active: false, updatedAt: now }),
      ),
    );
    return { archivedAt: now };
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

export const addContact = mutation({
  args: { businessId: v.id("businesses"), ...contactArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    return await createContactAndInvitation(ctx, args.businessId, args, { sendInvitation: false });
  },
});

export const updateContact = mutation({
  args: { businessId: v.id("businesses"), contactId: v.id("businessContacts"), ...contactArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId || contact.status === "inactive") {
      throw new Error("POC kontakt nije pronađen.");
    }
    const normalizedEmail = normalizeOptionalEmail(args.email);
    await ctx.db.patch(contact._id, {
      firstName: requireText(args.firstName, "Ime", 2, 80),
      lastName: requireText(args.lastName, "Prezime", 2, 80),
      normalizedEmail,
      phone: normalizeOptionalPhone(args.phone),
      positionTitle: normalizeOptionalPosition(args.positionTitle),
      updatedAt: Date.now(),
    });
    const latestInvitation = await ctx.db
      .query("businessInvitations")
      .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
      .order("desc")
      .take(1);
    let invitationId = latestInvitation[0]?._id ?? null;
    if (normalizedEmail && !latestInvitation[0]) {
      const now = Date.now();
      invitationId = await ctx.db.insert("businessInvitations", {
        businessId: args.businessId,
        contactId: contact._id,
        normalizedEmail,
        tokenHash: "",
        status: "queued",
        expiresAt: now + INVITATION_LIFETIME,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { contactId: contact._id, invitationId };
  },
});

export const deleteContact = mutation({
  args: { businessId: v.id("businesses"), contactId: v.id("businessContacts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId) {
      throw new Error("POC kontakt nije pronađen.");
    }
    const contacts = await ctx.db
      .query("businessContacts")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("asc")
      .take(50);
    const primary = contacts.find((candidate) => candidate.status !== "inactive");
    if (!primary || primary._id === contact._id) {
      throw new Error("Glavni POC kontakt ne može da se obriše. Dodajte drugi kontakt pa obrišite njega.");
    }
    const now = Date.now();
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
    return { deleted: true };
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
