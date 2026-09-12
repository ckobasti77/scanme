import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import {
  actionSeverityValidator,
  actionSignalValidator,
  adminV1ServiceTypeValidator,
  serviceOperationalStateValidator,
  serviceSummariesValidator,
} from "./lib/adminActionValidators";
import {
  emptyServiceSummaries,
  refreshClientReadModel,
} from "./lib/adminReadModelEngine";
import {
  normalizeAdminEmail,
  normalizeAdminPhone,
  normalizeAdminSearchText,
} from "./lib/adminV1Validators";
import { writeAdminAudit } from "./lib/adminAudit";

const MAX_CONTACTS = 100;
const MAX_ORGANIZATION_ROWS = 50;
const MAX_OPEN_ACTIONS = 20;
const MAX_VENUE_SERVICES = 10;
const MAX_ACTIVITY_PAGE = 50;

const contactViewValidator = v.object({
  id: v.id("accountContacts"),
  firstName: v.string(),
  lastName: v.string(),
  displayName: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  positionTitle: v.string(),
  isOwner: v.boolean(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  isDefault: v.boolean(),
});

const actionSummaryValidator = v.object({
  id: v.id("actionItems"),
  causeId: v.string(),
  businessId: v.union(v.id("businesses"), v.null()),
  severity: actionSeverityValidator,
  description: v.union(v.string(), v.null()),
  dueAt: v.union(v.number(), v.null()),
  relevantAt: v.number(),
  contextHref: v.union(v.string(), v.null()),
  resolutionRule: v.union(
    v.literal("source_fact_changed"),
    v.literal("manual_problem_resolution"),
  ),
});

const premiumStatusValidator = v.union(
  v.literal("active"),
  v.literal("grace"),
  v.literal("suspended"),
  v.literal("inactive"),
  v.null(),
);

const profileValidator = v.object({
  accountId: v.id("accounts"),
  accountName: v.string(),
  ownerDisplayName: v.string(),
  smkCode: v.string(),
  status: v.union(v.literal("active"), v.literal("archived")),
  premiumStatus: premiumStatusValidator,
  premiumWarning: v.boolean(),
  venueCount: v.number(),
  contacts: v.array(contactViewValidator),
  defaultContactId: v.id("accountContacts"),
  openActions: v.array(actionSummaryValidator),
  openActionCount: v.number(),
  openActionCountCapped: v.boolean(),
  serviceSummaries: serviceSummariesValidator,
  legalEntities: v.array(v.object({
    id: v.id("legalEntities"),
    name: v.string(),
    taxId: v.union(v.string(), v.null()),
    registrationNumber: v.union(v.string(), v.null()),
    address: v.union(v.string(), v.null()),
  })),
  brands: v.array(v.object({ id: v.id("brands"), name: v.string() })),
  venueGroups: v.array(v.object({ id: v.id("venueGroups"), name: v.string() })),
  tags: v.array(v.object({
    id: v.id("accountTags"),
    kind: v.union(v.literal("friend"), v.literal("custom")),
    label: v.string(),
  })),
  organizationRowsCapped: v.boolean(),
});

const venueListItemValidator = v.object({
  businessId: v.id("businesses"),
  name: v.string(),
  smlCode: v.string(),
  city: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("archived")),
  productCount: v.number(),
  signal: actionSignalValidator,
});

const subscriptionViewValidator = v.object({
  id: v.id("subscriptions"),
  period: v.union(v.literal("monthly"), v.literal("annual")),
  status: serviceOperationalStateValidator,
  warning: v.boolean(),
  startsAt: v.number(),
  paidThrough: v.union(v.number(), v.null()),
  graceEndsAt: v.union(v.number(), v.null()),
  nextTransitionAt: v.union(v.number(), v.null()),
  cancelAtPeriodEnd: v.boolean(),
});

const venueDetailValidator = v.object({
  businessId: v.id("businesses"),
  name: v.string(),
  smlCode: v.string(),
  city: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("archived")),
  legalEntity: v.union(v.object({
    name: v.string(),
    taxId: v.union(v.string(), v.null()),
    registrationNumber: v.union(v.string(), v.null()),
    address: v.union(v.string(), v.null()),
  }), v.null()),
  brand: v.union(v.object({ name: v.string() }), v.null()),
  venueGroup: v.union(v.object({ name: v.string() }), v.null()),
  effectiveContact: contactViewValidator,
  contactSource: v.union(v.literal("account"), v.literal("venue_override")),
  productCount: v.number(),
  services: v.array(v.object({
    profileId: v.id("serviceProfiles"),
    type: adminV1ServiceTypeValidator,
    profileStatus: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived"),
    ),
    subscription: v.union(subscriptionViewValidator, v.null()),
  })),
  openActions: v.array(actionSummaryValidator),
  openActionsCapped: v.boolean(),
});

const activityValidator = v.object({
  id: v.id("adminAuditLog"),
  action: v.string(),
  actorUserId: v.id("users"),
  businessId: v.union(v.id("businesses"), v.null()),
  createdAt: v.number(),
});

const actionEventValidator = v.object({
  id: v.id("actionItemEvents"),
  event: v.string(),
  actorKind: v.union(v.literal("admin"), v.literal("system")),
  reason: v.union(v.string(), v.null()),
  until: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

const contactInput = {
  firstName: v.string(),
  lastName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  positionTitle: v.string(),
};

function required(value: string, code: string, max = 160) {
  const result = value.trim().replace(/\s+/g, " ");
  if (!result || result.length > max) throw new ConvexError(code);
  return result;
}

function normalizedEmail(value: string | undefined) {
  const email = value ? normalizeAdminEmail(value) : "";
  if (!email) return undefined;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("admin_profile_contact_email_invalid");
  }
  return email;
}

function normalizedPhone(value: string | undefined) {
  const phone = value ? normalizeAdminPhone(value) : "";
  if (!phone) return undefined;
  if (phone.length < 7 || phone.length > 15) {
    throw new ConvexError("admin_profile_contact_phone_invalid");
  }
  return phone;
}

function contactView(contact: Doc<"accountContacts">, defaultContactId: Id<"accountContacts">) {
  return {
    id: contact._id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    displayName: `${contact.firstName} ${contact.lastName}`.trim(),
    email: contact.normalizedEmail ?? null,
    phone: contact.normalizedPhone ?? null,
    positionTitle: contact.positionTitle,
    isOwner: contact.isOwner,
    status: contact.status,
    isDefault: contact._id === defaultContactId,
  };
}

function actionSummary(item: Doc<"actionItems">) {
  return {
    id: item._id,
    causeId: item.causeId,
    businessId: item.businessId ?? null,
    severity: item.severity,
    description: item.description ?? null,
    dueAt: item.dueAt ?? null,
    relevantAt: item.relevantAt,
    contextHref: item.contextHref ?? null,
    resolutionRule: item.resolutionRule,
  };
}

async function resolveAccount(ctx: QueryCtx, rawAccountId: string) {
  const accountId = ctx.db.normalizeId("accounts", rawAccountId);
  if (!accountId) return null;
  const account = await ctx.db.get(accountId);
  if (
    !account ||
    account.adminV1MigrationVersion !== 1 ||
    !account.smkCode ||
    !account.ownerDisplayName ||
    !account.clientStatus ||
    !account.primaryOwnerMembershipId ||
    !account.defaultContactId
  ) return null;
  return account as Doc<"accounts"> & {
    smkCode: string;
    ownerDisplayName: string;
    clientStatus: "active" | "archived";
    defaultContactId: Id<"accountContacts">;
  };
}

async function requireProfileAccount(ctx: QueryCtx, accountId: Id<"accounts">) {
  const account = await ctx.db.get(accountId);
  if (
    !account ||
    account.adminV1MigrationVersion !== 1 ||
    !account.primaryOwnerMembershipId ||
    !account.defaultContactId
  ) throw new ConvexError("admin_profile_account_not_found");
  return account;
}

export const getProfile = query({
  args: { accountId: v.string() },
  returns: v.union(profileValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const account = await resolveAccount(ctx, args.accountId);
    if (!account) return null;
    const [
      contactsPlusOne,
      entitiesPlusOne,
      brandsPlusOne,
      groupsPlusOne,
      tagsPlusOne,
      actionsPlusOne,
      serviceRows,
      clientReadModel,
      premium,
    ] = await Promise.all([
      ctx.db.query("accountContacts").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).take(MAX_CONTACTS + 1),
      ctx.db.query("legalEntities").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).take(MAX_ORGANIZATION_ROWS + 1),
      ctx.db.query("brands").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).take(MAX_ORGANIZATION_ROWS + 1),
      ctx.db.query("venueGroups").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).take(MAX_ORGANIZATION_ROWS + 1),
      ctx.db.query("accountTags").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).take(MAX_ORGANIZATION_ROWS + 1),
      ctx.db.query("actionItems").withIndex(
        "by_account_state_severity_priority",
        (q) => q.eq("accountId", account._id).eq("state", "open"),
      ).take(MAX_OPEN_ACTIONS + 1),
      ctx.db.query("adminServiceAggregates").withIndex("by_accountId_and_serviceType", (q) => q.eq("accountId", account._id)).take(4),
      ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).unique(),
      ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", account._id).eq("targetKey", "premium")).unique(),
    ]);
    if (contactsPlusOne.length > MAX_CONTACTS) {
      throw new ConvexError("admin_profile_contact_limit");
    }
    const defaultContact = contactsPlusOne.find((contact) => contact._id === account.defaultContactId);
    if (!defaultContact) throw new ConvexError("admin_profile_default_contact_invalid");
    const cappedGroups = [entitiesPlusOne, brandsPlusOne, groupsPlusOne, tagsPlusOne];
    const organizationRowsCapped = cappedGroups.some((rows) => rows.length > MAX_ORGANIZATION_ROWS);
    const serviceSummaries = emptyServiceSummaries();
    for (const row of serviceRows) serviceSummaries[row.serviceType] = row.summary;
    return {
      accountId: account._id,
      accountName: account.name,
      ownerDisplayName: account.ownerDisplayName,
      smkCode: account.smkCode,
      status: account.clientStatus,
      premiumStatus: premium?.facts.status ?? null,
      premiumWarning: premium?.facts.warning ?? false,
      venueCount: clientReadModel?.venueCount ?? 0,
      contacts: contactsPlusOne
        .sort((left, right) => Number(right.status === "active") - Number(left.status === "active") || left.normalizedName.localeCompare(right.normalizedName))
        .map((contact) => contactView(contact, account.defaultContactId!)),
      defaultContactId: account.defaultContactId,
      openActions: actionsPlusOne.slice(0, MAX_OPEN_ACTIONS).map(actionSummary),
      openActionCount: Math.min(actionsPlusOne.length, MAX_OPEN_ACTIONS),
      openActionCountCapped: actionsPlusOne.length > MAX_OPEN_ACTIONS,
      serviceSummaries,
      legalEntities: entitiesPlusOne.slice(0, MAX_ORGANIZATION_ROWS).map((entity) => ({
        id: entity._id,
        name: entity.name,
        taxId: entity.taxId ?? null,
        registrationNumber: entity.registrationNumber ?? null,
        address: entity.address ?? null,
      })),
      brands: brandsPlusOne.slice(0, MAX_ORGANIZATION_ROWS).map((brand) => ({ id: brand._id, name: brand.name })),
      venueGroups: groupsPlusOne.slice(0, MAX_ORGANIZATION_ROWS).map((group) => ({ id: group._id, name: group.name })),
      tags: tagsPlusOne.slice(0, MAX_ORGANIZATION_ROWS).map((tag) => ({
        id: tag._id,
        kind: tag.kind,
        label: tag.label?.trim() || "",
      })),
      organizationRowsCapped,
    };
  },
});

export const listVenues = query({
  args: { accountId: v.id("accounts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(venueListItemValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireProfileAccount(ctx, args.accountId);
    const result = await ctx.db
      .query("adminVenueReadModels")
      .withIndex("by_accountId_and_normalizedVenueName", (q) => q.eq("accountId", args.accountId))
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((venue) => ({
        businessId: venue.businessId,
        name: venue.venueName,
        smlCode: venue.smlCode,
        city: venue.city,
        status: venue.clientStatus,
        productCount: venue.productCount,
        signal: venue.signal,
      })),
    };
  },
});

export const getVenueDetail = query({
  args: { accountId: v.id("accounts"), businessId: v.string() },
  returns: v.union(venueDetailValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const account = await requireProfileAccount(ctx, args.accountId);
    const businessId = ctx.db.normalizeId("businesses", args.businessId);
    if (!businessId) return null;
    const business = await ctx.db.get(businessId);
    if (
      !business ||
      business.accountId !== account._id ||
      business.kind === "celebration" ||
      business.adminV1MigrationVersion !== 1 ||
      !business.smlCode ||
      !business.clientStatus
    ) return null;
    const [legalEntity, brand, venueGroup, accountContact, overrideContact, profilesPlusOne, subscriptionsPlusOne, readModel, actionsPlusOne] = await Promise.all([
      business.legalEntityId ? ctx.db.get(business.legalEntityId) : null,
      business.brandId ? ctx.db.get(business.brandId) : null,
      business.venueGroupId ? ctx.db.get(business.venueGroupId) : null,
      ctx.db.get(account.defaultContactId!),
      business.defaultContactOverrideId ? ctx.db.get(business.defaultContactOverrideId) : null,
      ctx.db.query("serviceProfiles").withIndex("by_businessId", (q) => q.eq("businessId", business._id)).take(MAX_VENUE_SERVICES + 1),
      ctx.db.query("subscriptions").withIndex("by_businessId", (q) => q.eq("businessId", business._id)).take(MAX_VENUE_SERVICES * 2 + 1),
      ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", business._id)).unique(),
      ctx.db.query("actionItems").withIndex(
        "by_business_state_severity_priority",
        (q) => q.eq("businessId", business._id).eq("state", "open"),
      ).take(MAX_OPEN_ACTIONS + 1),
    ]);
    if (profilesPlusOne.length > MAX_VENUE_SERVICES || subscriptionsPlusOne.length > MAX_VENUE_SERVICES * 2) {
      throw new ConvexError("admin_profile_venue_service_limit");
    }
    const effectiveContact = overrideContact ?? accountContact;
    if (!effectiveContact || effectiveContact.accountId !== account._id) {
      throw new ConvexError("admin_profile_venue_contact_invalid");
    }
    const subscriptionByProfile = new Map(
      subscriptionsPlusOne
        .filter((subscription) => subscription.target.kind === "service_instance")
        .map((subscription) => [subscription.target.kind === "service_instance" ? String(subscription.target.serviceProfileId) : "", subscription]),
    );
    return {
      businessId: business._id,
      name: business.name,
      smlCode: business.smlCode,
      city: business.city ?? null,
      address: business.address ?? null,
      status: business.clientStatus,
      legalEntity: legalEntity && legalEntity.accountId === account._id ? {
        name: legalEntity.name,
        taxId: legalEntity.taxId ?? null,
        registrationNumber: legalEntity.registrationNumber ?? null,
        address: legalEntity.address ?? null,
      } : null,
      brand: brand && brand.accountId === account._id ? { name: brand.name } : null,
      venueGroup: venueGroup && venueGroup.accountId === account._id ? { name: venueGroup.name } : null,
      effectiveContact: contactView(effectiveContact, account.defaultContactId!),
      contactSource: overrideContact ? "venue_override" as const : "account" as const,
      productCount: readModel?.productCount ?? 0,
      services: profilesPlusOne
        .filter((profile) => profile.type === "scanme_links" || profile.type === "google_review" || profile.type === "scanme_menu")
        .map((profile) => {
          const subscription = subscriptionByProfile.get(String(profile._id));
          return {
            profileId: profile._id,
            type: profile.type as "scanme_links" | "google_review" | "scanme_menu",
            profileStatus: profile.status,
            subscription: subscription ? {
              id: subscription._id,
              period: subscription.period,
              status: subscription.facts.status,
              warning: subscription.facts.warning,
              startsAt: subscription.startsAt,
              paidThrough: subscription.facts.paidThrough,
              graceEndsAt: subscription.facts.graceEndsAt,
              nextTransitionAt: subscription.facts.nextTransitionAt,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            } : null,
          };
        }),
      openActions: actionsPlusOne.slice(0, MAX_OPEN_ACTIONS).map(actionSummary),
      openActionsCapped: actionsPlusOne.length > MAX_OPEN_ACTIONS,
    };
  },
});

export const listActivity = query({
  args: { accountId: v.id("accounts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(activityValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireProfileAccount(ctx, args.accountId);
    if (args.paginationOpts.numItems > MAX_ACTIVITY_PAGE) {
      throw new ConvexError("admin_profile_activity_page_limit");
    }
    const result = await ctx.db
      .query("adminAuditLog")
      .withIndex("by_accountId_and_createdAt", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((entry) => ({
        id: entry._id,
        action: entry.action,
        actorUserId: entry.actorUserId,
        businessId: entry.businessId ?? null,
        createdAt: entry.createdAt,
      })),
    };
  },
});

export const listActionHistory = query({
  args: {
    accountId: v.id("accounts"),
    actionItemId: v.id("actionItems"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(actionEventValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireProfileAccount(ctx, args.accountId);
    const actionItem = await ctx.db.get(args.actionItemId);
    if (!actionItem || actionItem.accountId !== args.accountId) {
      throw new ConvexError("admin_profile_action_not_found");
    }
    if (args.paginationOpts.numItems > MAX_ACTIVITY_PAGE) {
      throw new ConvexError("admin_profile_activity_page_limit");
    }
    const result = await ctx.db
      .query("actionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (q) => q.eq("actionItemId", actionItem._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((event) => ({
        id: event._id,
        event: event.event,
        actorKind: event.actor.kind,
        reason: event.reason ?? null,
        until: event.until ?? null,
        createdAt: event.createdAt,
      })),
    };
  },
});

export const createContact = mutation({
  args: { accountId: v.id("accounts"), ...contactInput },
  returns: v.object({ contactId: v.id("accountContacts") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requireProfileAccount(ctx, args.accountId);
    const firstName = required(args.firstName, "admin_profile_contact_first_name_invalid");
    const lastName = required(args.lastName, "admin_profile_contact_last_name_invalid");
    const positionTitle = required(args.positionTitle, "admin_profile_contact_position_invalid");
    const email = normalizedEmail(args.email);
    const phone = normalizedPhone(args.phone);
    const now = Date.now();
    const contactId = await ctx.db.insert("accountContacts", {
      accountId: args.accountId,
      firstName,
      lastName,
      normalizedName: normalizeAdminSearchText(`${firstName} ${lastName}`),
      ...(email ? { normalizedEmail: email } : {}),
      ...(phone ? { normalizedPhone: phone } : {}),
      positionTitle,
      isOwner: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: args.accountId,
      action: "admin_v1_contact_created",
      detail: { contactId },
      now,
    });
    return { contactId };
  },
});

export const updateContact = mutation({
  args: { accountId: v.id("accounts"), contactId: v.id("accountContacts"), ...contactInput },
  returns: v.object({ contactId: v.id("accountContacts") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const account = await requireProfileAccount(ctx, args.accountId);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.accountId !== account._id) {
      throw new ConvexError("admin_profile_contact_not_found");
    }
    const firstName = required(args.firstName, "admin_profile_contact_first_name_invalid");
    const lastName = required(args.lastName, "admin_profile_contact_last_name_invalid");
    const positionTitle = required(args.positionTitle, "admin_profile_contact_position_invalid");
    const email = normalizedEmail(args.email);
    const phone = normalizedPhone(args.phone);
    const now = Date.now();
    await ctx.db.patch(contact._id, {
      firstName,
      lastName,
      normalizedName: normalizeAdminSearchText(`${firstName} ${lastName}`),
      normalizedEmail: email,
      normalizedPhone: phone,
      positionTitle,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: account._id,
      action: "admin_v1_contact_updated",
      detail: { contactId: contact._id },
      now,
    });
    if (account.defaultContactId === contact._id) {
      await refreshClientReadModel(ctx, account._id, now);
    }
    return { contactId: contact._id };
  },
});

export const setContactStatus = mutation({
  args: {
    accountId: v.id("accounts"),
    contactId: v.id("accountContacts"),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  returns: v.object({ contactId: v.id("accountContacts"), status: v.union(v.literal("active"), v.literal("inactive")) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const account = await requireProfileAccount(ctx, args.accountId);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.accountId !== account._id) {
      throw new ConvexError("admin_profile_contact_not_found");
    }
    if (args.status === "inactive" && account.defaultContactId === contact._id) {
      throw new ConvexError("admin_profile_default_contact_cannot_deactivate");
    }
    if (contact.status === args.status) return { contactId: contact._id, status: args.status };
    const now = Date.now();
    await ctx.db.patch(contact._id, { status: args.status, updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: account._id,
      action: args.status === "active" ? "admin_v1_contact_reactivated" : "admin_v1_contact_deactivated",
      detail: { contactId: contact._id },
      now,
    });
    return { contactId: contact._id, status: args.status };
  },
});

export const setDefaultContact = mutation({
  args: { accountId: v.id("accounts"), contactId: v.id("accountContacts") },
  returns: v.object({ defaultContactId: v.id("accountContacts") }),
  handler: async (ctx, args): Promise<{ defaultContactId: Id<"accountContacts"> }> => {
    await requireAdmin(ctx);
    await requireProfileAccount(ctx, args.accountId);
    return ctx.runMutation(api.clientAccounts.setDefaultContact, args);
  },
});

export const resolveManualProblem = mutation({
  args: { accountId: v.id("accounts"), actionItemId: v.id("actionItems"), note: v.string() },
  returns: v.object({ state: v.literal("resolved") }),
  handler: async (ctx, args): Promise<{ state: "resolved" }> => {
    await requireAdmin(ctx);
    await requireProfileAccount(ctx, args.accountId);
    const actionItem = await ctx.db.get(args.actionItemId);
    if (!actionItem || actionItem.accountId !== args.accountId) {
      throw new ConvexError("admin_profile_action_not_found");
    }
    return ctx.runMutation(internal.adminActions.resolveManual, {
      actionItemId: actionItem._id,
      note: args.note,
    });
  },
});
