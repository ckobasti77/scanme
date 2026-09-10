import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  clientAccountCapabilities,
  requireClientAccountAccess,
  requireClientAccountCapability,
  requireClientVenueAccess,
  requireClientVenueCapability,
} from "./lib/clientAccountAccess";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  clientLifecycleStatusValidator,
  clientRoleValidator,
  normalizeAdminSearchText,
} from "./lib/adminV1Validators";

const contactViewValidator = v.object({
  id: v.id("accountContacts"),
  firstName: v.string(),
  lastName: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  positionTitle: v.string(),
  isOwner: v.boolean(),
  status: v.union(v.literal("active"), v.literal("inactive")),
});

const capabilitiesValidator = v.object({
  canManageAccount: v.boolean(),
  canManageVenue: v.boolean(),
  canCancelService: v.boolean(),
  canBuyServices: v.boolean(),
  canBuyPremium: v.boolean(),
});

const accessViewValidator = v.object({
  membershipId: v.union(v.id("accountMemberships"), v.null()),
  role: v.union(v.literal("admin"), clientRoleValidator),
  venueAccess: v.union(v.literal("all"), v.literal("selected"), v.null()),
  isPrimaryOwner: v.boolean(),
  capabilities: capabilitiesValidator,
});

const accountViewValidator = v.object({
  id: v.id("accounts"),
  code: v.string(),
  ownerDisplayName: v.string(),
  status: clientLifecycleStatusValidator,
  defaultContact: contactViewValidator,
  access: accessViewValidator,
});

function canonicalAccount(account: Doc<"accounts">) {
  if (
    account.adminV1MigrationVersion !== 1 ||
    !account.smkCode ||
    !account.ownerDisplayName ||
    !account.clientStatus ||
    !account.primaryOwnerMembershipId ||
    !account.defaultContactId
  ) {
    throw new ConvexError("Klijentski nalog još nije migriran na ADMIN-02 model.");
  }
  return {
    code: account.smkCode,
    ownerDisplayName: account.ownerDisplayName,
    status: account.clientStatus,
    primaryOwnerMembershipId: account.primaryOwnerMembershipId,
    defaultContactId: account.defaultContactId,
  };
}

function contactView(contact: Doc<"accountContacts">) {
  return {
    id: contact._id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.normalizedEmail ?? null,
    phone: contact.normalizedPhone ?? null,
    positionTitle: contact.positionTitle,
    isOwner: contact.isOwner,
    status: contact.status,
  };
}

function accessView(
  account: Doc<"accounts">,
  membership: Doc<"accountMemberships"> | null,
  isAdmin: boolean,
) {
  return {
    membershipId: membership?._id ?? null,
    role: isAdmin ? ("admin" as const) : membership!.role,
    venueAccess: membership?.venueAccess ?? null,
    isPrimaryOwner: membership?._id === account.primaryOwnerMembershipId,
    capabilities: clientAccountCapabilities(membership, isAdmin),
  };
}

export const getAccount = query({
  args: { accountId: v.id("accounts") },
  returns: accountViewValidator,
  handler: async (ctx, args) => {
    const access = await requireClientAccountAccess(ctx, args.accountId);
    const canonical = canonicalAccount(access.account);
    const contact = await ctx.db.get(canonical.defaultContactId);
    if (!contact || contact.accountId !== access.account._id) {
      throw new ConvexError("Podrazumevani kontakt ne pripada klijentskom nalogu.");
    }
    return {
      id: access.account._id,
      code: canonical.code,
      ownerDisplayName: canonical.ownerDisplayName,
      status: canonical.status,
      defaultContact: contactView(contact),
      access: accessView(access.account, access.membership, access.isAdmin),
    };
  },
});

export const getVenue = query({
  args: { businessId: v.id("businesses") },
  returns: v.object({
    account: v.object({
      id: v.id("accounts"),
      code: v.string(),
      ownerDisplayName: v.string(),
      status: clientLifecycleStatusValidator,
    }),
    venue: v.object({
      id: v.id("businesses"),
      code: v.string(),
      name: v.string(),
      city: v.union(v.string(), v.null()),
      address: v.union(v.string(), v.null()),
      status: clientLifecycleStatusValidator,
      legalEntityId: v.union(v.id("legalEntities"), v.null()),
      brandId: v.union(v.id("brands"), v.null()),
      venueGroupId: v.union(v.id("venueGroups"), v.null()),
    }),
    effectiveContact: contactViewValidator,
    contactSource: v.union(v.literal("account"), v.literal("venue_override")),
    access: accessViewValidator,
  }),
  handler: async (ctx, args) => {
    const access = await requireClientVenueAccess(ctx, args.businessId);
    const canonical = canonicalAccount(access.account);
    if (
      access.business.adminV1MigrationVersion !== 1 ||
      !access.business.smlCode ||
      !access.business.clientStatus
    ) {
      throw new ConvexError("Lokal još nije migriran na ADMIN-02 model.");
    }
    const effectiveContactId =
      access.business.defaultContactOverrideId ?? canonical.defaultContactId;
    const contact = await ctx.db.get(effectiveContactId);
    if (!contact || contact.accountId !== access.account._id) {
      throw new ConvexError("Kontakt lokala ne pripada klijentskom nalogu.");
    }
    return {
      account: {
        id: access.account._id,
        code: canonical.code,
        ownerDisplayName: canonical.ownerDisplayName,
        status: canonical.status,
      },
      venue: {
        id: access.business._id,
        code: access.business.smlCode,
        name: access.business.name,
        city: access.business.city ?? null,
        address: access.business.address ?? null,
        status: access.business.clientStatus,
        legalEntityId: access.business.legalEntityId ?? null,
        brandId: access.business.brandId ?? null,
        venueGroupId: access.business.venueGroupId ?? null,
      },
      effectiveContact: contactView(contact),
      contactSource: access.business.defaultContactOverrideId
        ? ("venue_override" as const)
        : ("account" as const),
      access: accessView(access.account, access.membership, access.isAdmin),
    };
  },
});

export const setDefaultContact = mutation({
  args: {
    accountId: v.id("accounts"),
    contactId: v.id("accountContacts"),
  },
  returns: v.object({ defaultContactId: v.id("accountContacts") }),
  handler: async (ctx, args) => {
    const access = await requireClientAccountCapability(
      ctx,
      args.accountId,
      "manage_account",
    );
    canonicalAccount(access.account);
    const contact = await ctx.db.get(args.contactId);
    if (
      !contact ||
      contact.accountId !== args.accountId ||
      contact.status !== "active"
    ) {
      throw new ConvexError("Aktivan kontakt nije pronađen u ovom nalogu.");
    }
    const before = access.account.defaultContactId ?? null;
    if (before === contact._id) return { defaultContactId: contact._id };
    const now = Date.now();
    await ctx.db.patch(access.account._id, {
      defaultContactId: contact._id,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: access.user._id,
      accountId: access.account._id,
      action: "admin_v1_contact_default_changed",
      detail: { before, after: contact._id },
      now,
    });
    return { defaultContactId: contact._id };
  },
});

export const setVenueDefaultContactOverride = mutation({
  args: {
    businessId: v.id("businesses"),
    contactId: v.union(v.id("accountContacts"), v.null()),
  },
  returns: v.object({
    businessId: v.id("businesses"),
    defaultContactOverrideId: v.union(v.id("accountContacts"), v.null()),
  }),
  handler: async (ctx, args) => {
    const access = await requireClientVenueCapability(
      ctx,
      args.businessId,
      "manage_venue",
    );
    canonicalAccount(access.account);
    if (args.contactId) {
      const contact = await ctx.db.get(args.contactId);
      if (
        !contact ||
        contact.accountId !== access.account._id ||
        contact.status !== "active"
      ) {
        throw new ConvexError("Aktivan kontakt nije pronađen u ovom nalogu.");
      }
    }
    const before = access.business.defaultContactOverrideId ?? null;
    if (before === args.contactId) {
      return {
        businessId: access.business._id,
        defaultContactOverrideId: args.contactId,
      };
    }
    const now = Date.now();
    await ctx.db.patch(access.business._id, {
      defaultContactOverrideId: args.contactId ?? undefined,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: access.user._id,
      accountId: access.account._id,
      businessId: access.business._id,
      action: "admin_v1_venue_default_contact_changed",
      detail: { before, after: args.contactId },
      now,
    });
    return {
      businessId: access.business._id,
      defaultContactOverrideId: args.contactId,
    };
  },
});

export const transferPrimaryOwner = mutation({
  args: {
    accountId: v.id("accounts"),
    membershipId: v.id("accountMemberships"),
    reason: v.string(),
  },
  returns: v.object({
    primaryOwnerMembershipId: v.id("accountMemberships"),
    ownerDisplayName: v.string(),
  }),
  handler: async (ctx, args) => {
    const access = await requireClientAccountAccess(ctx, args.accountId);
    const canonical = canonicalAccount(access.account);
    if (
      !access.isAdmin &&
      access.membership?._id !== canonical.primaryOwnerMembershipId
    ) {
      throw new ConvexError("Samo primarni vlasnik može preneti vlasništvo.");
    }
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Razlog promene vlasnika je obavezan.");
    const next = await ctx.db.get(args.membershipId);
    if (
      !next ||
      next.accountId !== access.account._id ||
      !next.active ||
      next.role !== "full_access" ||
      next.venueAccess !== "all"
    ) {
      throw new ConvexError("Novi primarni vlasnik mora biti aktivan full-access član ovog naloga.");
    }
    let ownerDisplayName: string;
    if (next.contactId) {
      const contact = await ctx.db.get(next.contactId);
      if (!contact || contact.accountId !== access.account._id) {
        throw new ConvexError("Kontakt novog vlasnika ne pripada ovom nalogu.");
      }
      ownerDisplayName = `${contact.firstName} ${contact.lastName}`.trim();
    } else {
      const user = await ctx.db.get(next.userId);
      ownerDisplayName = user?.name?.trim() || user?.email?.trim() || "Vlasnik";
    }
    const now = Date.now();
    await ctx.db.patch(access.account._id, {
      primaryOwnerMembershipId: next._id,
      ownerDisplayName,
      normalizedOwnerDisplayName: normalizeAdminSearchText(ownerDisplayName),
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: access.user._id,
      accountId: access.account._id,
      action: "admin_v1_primary_owner_transferred",
      detail: {
        before: canonical.primaryOwnerMembershipId,
        after: next._id,
        reason,
      },
      now,
    });
    return { primaryOwnerMembershipId: next._id, ownerDisplayName };
  },
});
