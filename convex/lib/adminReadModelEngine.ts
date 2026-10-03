import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { actionSignal, worstOpenActionForAccount, worstOpenActionForBusiness } from "./adminActionEngine";
import {
  normalizeAdminEmail,
  normalizeAdminHumanCode,
  normalizeAdminPhone,
  normalizeAdminSearchText,
  normalizeAdminSearchToken,
} from "./adminV1Validators";

type DatabaseCtx = QueryCtx | MutationCtx;
type ServiceType = Doc<"adminServiceStates">["serviceType"];
type ServiceState = Doc<"adminServiceStates">["state"];
type ServiceAggregate = Doc<"adminServiceAggregates">["summary"];
type CanonicalAccount = Doc<"accounts"> & {
  smkCode: string;
  ownerDisplayName: string;
  normalizedOwnerDisplayName: string;
  clientStatus: "active" | "archived";
  defaultContactId: Id<"accountContacts">;
};

export const ADMIN_V1_SERVICE_TYPES = [
  "scanme_links",
  "google_review",
  "scanme_menu",
] as const satisfies readonly ServiceType[];

const ADMIN_CLIENT_VENUE_LIMIT = 500;

export function emptyServiceAggregate(): ServiceAggregate {
  return {
    total: 0,
    active: 0,
    warning: 0,
    grace: 0,
    suspended: 0,
    inactive: 0,
    problem: 0,
    worst: null,
  };
}

export function emptyServiceSummaries() {
  return {
    scanme_links: emptyServiceAggregate(),
    google_review: emptyServiceAggregate(),
    scanme_menu: emptyServiceAggregate(),
  };
}

const SERVICE_STATE_ORDER: readonly ServiceState[] = [
  "problem",
  "suspended",
  "grace",
  "warning",
  "inactive",
  "active",
];

function withStateDelta(
  source: ServiceAggregate,
  previous: ServiceState | null,
  next: ServiceState,
): ServiceAggregate {
  const counts = {
    active: source.active,
    warning: source.warning,
    grace: source.grace,
    suspended: source.suspended,
    inactive: source.inactive,
    problem: source.problem,
  };
  if (previous) counts[previous] -= 1;
  counts[next] += 1;
  if (Object.values(counts).some((value) => value < 0)) {
    throw new ConvexError("admin_service_aggregate_drift");
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    total,
    ...counts,
    worst: SERVICE_STATE_ORDER.find((state) => counts[state] > 0) ?? null,
  };
}

export function signalUrgencyRank(signal: ReturnType<typeof actionSignal>) {
  return signal.severity === "blocking"
    ? 0
    : signal.severity === "warning"
      ? 1
      : signal.severity === "information"
        ? 2
        : 3;
}

function required(value: string, code: string, max = 500) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function nonNegativeInteger(value: number, code: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ConvexError(code);
}

function searchText(values: readonly (string | null | undefined)[]) {
  return values
    .flatMap((value) => {
      if (!value) return [];
      const normalized = normalizeAdminSearchText(value);
      const compact = normalizeAdminSearchToken(value);
      return compact && compact !== normalized ? [normalized, compact] : [normalized];
    })
    .filter(Boolean)
    .join(" ");
}

async function requireCanonicalAccount(ctx: DatabaseCtx, accountId: Id<"accounts">) {
  const account = await ctx.db.get(accountId);
  if (
    !account ||
    account.adminV1MigrationVersion !== 1 ||
    !account.smkCode ||
    !account.ownerDisplayName ||
    !account.normalizedOwnerDisplayName ||
    !account.clientStatus ||
    !account.defaultContactId
  ) {
    throw new ConvexError("admin_read_model_account_not_ready");
  }
  const contact = await ctx.db.get(account.defaultContactId);
  if (!contact || contact.accountId !== account._id) {
    throw new ConvexError("admin_read_model_default_contact_invalid");
  }
  return { account: account as CanonicalAccount, contact };
}

async function serviceSummariesForAccount(ctx: DatabaseCtx, accountId: Id<"accounts">) {
  const rows = await ctx.db
    .query("adminServiceAggregates")
    .withIndex("by_accountId_and_serviceType", (q) => q.eq("accountId", accountId))
    .take(ADMIN_V1_SERVICE_TYPES.length + 1);
  if (rows.length > ADMIN_V1_SERVICE_TYPES.length) {
    throw new ConvexError("admin_service_aggregate_invalid");
  }
  const summaries = emptyServiceSummaries();
  for (const row of rows) summaries[row.serviceType] = row.summary;
  return summaries;
}

async function premiumStatusForAccount(
  ctx: DatabaseCtx,
  accountId: Id<"accounts">,
) {
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_accountId_and_targetKey", (q) =>
      q.eq("accountId", accountId).eq("targetKey", "premium"),
    )
    .unique();
  const status = subscription?.facts.status;
  return status === "active" || status === "grace" ? status : null;
}

export async function upsertClientReadModel(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    venueCount: number;
    firstVenueName?: string;
    updatedAt: number;
  },
) {
  nonNegativeInteger(input.venueCount, "admin_invalid_venue_count");
  const firstVenueName = input.firstVenueName?.trim();
  const { account, contact } = await requireCanonicalAccount(ctx, input.accountId);
  const venues = await ctx.db
    .query("businesses")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .take(ADMIN_CLIENT_VENUE_LIMIT + 1);
  if (venues.length > ADMIN_CLIENT_VENUE_LIMIT) {
    throw new ConvexError("admin_client_venue_limit");
  }
  const firstVenue = firstVenueName
    ? venues.find(
        (venue) =>
          normalizeAdminSearchText(venue.name) ===
          normalizeAdminSearchText(firstVenueName),
      ) ?? null
    : null;
  const signal = actionSignal(await worstOpenActionForAccount(ctx, account._id));
  const defaultContactEmail = contact.normalizedEmail
    ? normalizeAdminEmail(contact.normalizedEmail)
    : null;
  const defaultContactPhone = contact.normalizedPhone
    ? normalizeAdminPhone(contact.normalizedPhone)
    : null;
  const fields = {
    accountId: account._id,
    smkCode: normalizeAdminHumanCode(account.smkCode, "SMK"),
    accountName: account.name,
    ownerDisplayName: account.ownerDisplayName,
    normalizedOwnerDisplayName: normalizeAdminSearchText(account.ownerDisplayName),
    defaultContactEmail,
    defaultContactPhone,
    firstVenueName: firstVenueName || null,
    firstVenueSlug: firstVenue?.slug ?? null,
    venueCount: input.venueCount,
    clientStatus: account.clientStatus,
    signal,
    urgencyRank: signalUrgencyRank(signal),
    serviceSummaries: await serviceSummariesForAccount(ctx, account._id),
    premiumStatus: await premiumStatusForAccount(ctx, account._id),
    searchText: searchText([
      account.name,
      account.ownerDisplayName,
      account.smkCode,
      defaultContactEmail,
      defaultContactPhone,
      firstVenueName,
      ...venues.map((venue) => venue.name),
    ]),
    updatedAt: input.updatedAt,
  };
  const existing = await ctx.db
    .query("adminClientReadModels")
    .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return ctx.db.insert("adminClientReadModels", fields);
}

export async function refreshClientReadModel(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  updatedAt: number,
) {
  const current = await ctx.db
    .query("adminClientReadModels")
    .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
    .unique();
  if (!current) return null;
  return upsertClientReadModel(ctx, {
    accountId,
    venueCount: current.venueCount,
    ...(current.firstVenueName ? { firstVenueName: current.firstVenueName } : {}),
    updatedAt,
  });
}

export async function upsertVenueReadModel(
  ctx: MutationCtx,
  input: {
    businessId: Id<"businesses">;
    productCount: number;
    channelCount: number;
    updatedAt: number;
  },
) {
  nonNegativeInteger(input.productCount, "admin_invalid_product_count");
  nonNegativeInteger(input.channelCount, "admin_invalid_channel_count");
  const business = await ctx.db.get(input.businessId);
  if (
    !business ||
    !business.accountId ||
    business.kind === "celebration" ||
    business.adminV1MigrationVersion !== 1 ||
    !business.smlCode ||
    !business.clientStatus
  ) {
    throw new ConvexError("admin_read_model_venue_not_ready");
  }
  const { account, contact: accountContact } = await requireCanonicalAccount(
    ctx,
    business.accountId,
  );
  const contact = business.defaultContactOverrideId
    ? await ctx.db.get(business.defaultContactOverrideId)
    : accountContact;
  if (!contact || contact.accountId !== account._id) {
    throw new ConvexError("admin_read_model_venue_contact_invalid");
  }
  const profiles = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
    .take(11);
  if (profiles.length > 10) throw new ConvexError("admin_read_model_service_limit");
  const serviceTypes = [...new Set(
    profiles
      .filter(
        (profile) =>
          profile.status === "active" &&
          ADMIN_V1_SERVICE_TYPES.includes(profile.type as ServiceType),
      )
      .map((profile) => profile.type as ServiceType),
  )].sort();
  const effectiveContactEmail = contact.normalizedEmail
    ? normalizeAdminEmail(contact.normalizedEmail)
    : null;
  const effectiveContactPhone = contact.normalizedPhone
    ? normalizeAdminPhone(contact.normalizedPhone)
    : null;
  const signal = actionSignal(await worstOpenActionForBusiness(ctx, business._id));
  const fields = {
    accountId: account._id,
    businessId: business._id,
    smkCode: normalizeAdminHumanCode(account.smkCode, "SMK"),
    smlCode: normalizeAdminHumanCode(business.smlCode, "SML"),
    ownerDisplayName: account.ownerDisplayName,
    venueName: business.name,
    normalizedVenueName: normalizeAdminSearchText(business.name),
    city: business.city ?? null,
    effectiveContactEmail,
    effectiveContactPhone,
    productCount: input.productCount,
    channelCount: input.channelCount,
    serviceTypes,
    clientStatus: business.clientStatus,
    signal,
    hasOpenAction: signal.severity !== null,
    urgencyRank: signalUrgencyRank(signal),
    searchText: searchText([
      account.name,
      account.ownerDisplayName,
      account.smkCode,
      business.name,
      business.smlCode,
      business.city,
      effectiveContactEmail,
      effectiveContactPhone,
    ]),
    updatedAt: input.updatedAt,
  };
  const existing = await ctx.db
    .query("adminVenueReadModels")
    .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return ctx.db.insert("adminVenueReadModels", fields);
}

export async function upsertProductReadModel(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    businessId: Id<"businesses">;
    sourceRecordId: string;
    smfCode: string;
    smqCodes: readonly string[];
    productType: Doc<"adminProductReadModels">["productType"];
    displayName: string;
    operationalStatus: Doc<"adminProductReadModels">["operationalStatus"];
    updatedAt: number;
  },
) {
  const sourceRecordId = required(input.sourceRecordId, "admin_product_source_required");
  const displayName = required(input.displayName, "admin_product_name_required");
  if (input.smqCodes.length > 8 || new Set(input.smqCodes).size !== input.smqCodes.length) {
    throw new ConvexError("admin_product_invalid_smq_codes");
  }
  const business = await ctx.db.get(input.businessId);
  if (
    !business ||
    business.kind === "celebration" ||
    business.accountId !== input.accountId ||
    !business.smlCode
  ) {
    throw new ConvexError("admin_product_business_not_in_account");
  }
  const { account } = await requireCanonicalAccount(ctx, input.accountId);
  const smfCode = normalizeAdminHumanCode(input.smfCode, "SMF");
  const smqCodes = input.smqCodes.map((code) => normalizeAdminHumanCode(code, "SMQ"));
  const action = await ctx.db
    .query("actionItems")
    .withIndex(
      "by_product_state_severity_priority",
      (q) => q.eq("productRef", sourceRecordId).eq("state", "open"),
    )
    .first();
  const signal = actionSignal(action);
  const fields = {
    accountId: account._id,
    businessId: business._id,
    sourceRecordId,
    smkCode: normalizeAdminHumanCode(account.smkCode, "SMK"),
    smlCode: normalizeAdminHumanCode(business.smlCode, "SML"),
    smfCode,
    localSuffix: smfCode.split("-").at(-1),
    smqCodes,
    ownerDisplayName: account.ownerDisplayName,
    venueName: business.name,
    productType: input.productType,
    displayName,
    normalizedDisplayName: normalizeAdminSearchText(displayName),
    operationalStatus: input.operationalStatus,
    signal,
    urgencyRank: signalUrgencyRank(signal),
    searchText: searchText([
      account.name,
      account.ownerDisplayName,
      account.smkCode,
      business.name,
      business.smlCode,
      smfCode,
      ...smqCodes,
      displayName,
      input.productType,
    ]),
    updatedAt: input.updatedAt,
  };
  const existing = await ctx.db
    .query("adminProductReadModels")
    .withIndex("by_sourceRecordId", (q) => q.eq("sourceRecordId", sourceRecordId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return ctx.db.insert("adminProductReadModels", fields);
}

export async function syncServiceOperationalState(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    businessId: Id<"businesses">;
    serviceProfileId: Id<"serviceProfiles">;
    serviceType: ServiceType;
    state: ServiceState;
    updatedAt: number;
  },
) {
  const profile = await ctx.db.get(input.serviceProfileId);
  const business = await ctx.db.get(input.businessId);
  if (
    !profile ||
    profile.businessId !== input.businessId ||
    profile.type !== input.serviceType ||
    !business ||
    business.accountId !== input.accountId
  ) {
    throw new ConvexError("admin_service_scope_invalid");
  }
  const existing = await ctx.db
    .query("adminServiceStates")
    .withIndex("by_serviceProfileId", (q) =>
      q.eq("serviceProfileId", input.serviceProfileId),
    )
    .unique();
  if (
    existing &&
    (existing.accountId !== input.accountId ||
      existing.businessId !== input.businessId ||
      existing.serviceType !== input.serviceType)
  ) {
    throw new ConvexError("admin_service_identity_changed");
  }
  if (existing?.state === input.state) {
    await syncServiceOperationReadModel(ctx, input);
    return existing._id;
  }
  const aggregate = await ctx.db
    .query("adminServiceAggregates")
    .withIndex("by_accountId_and_serviceType", (q) =>
      q.eq("accountId", input.accountId).eq("serviceType", input.serviceType),
    )
    .unique();
  const summary = withStateDelta(
    aggregate?.summary ?? emptyServiceAggregate(),
    existing?.state ?? null,
    input.state,
  );
  if (aggregate) {
    await ctx.db.patch(aggregate._id, { summary, updatedAt: input.updatedAt });
  } else {
    await ctx.db.insert("adminServiceAggregates", {
      accountId: input.accountId,
      serviceType: input.serviceType,
      summary,
      updatedAt: input.updatedAt,
    });
  }
  let stateId: Id<"adminServiceStates">;
  if (existing) {
    await ctx.db.patch(existing._id, { state: input.state, updatedAt: input.updatedAt });
    stateId = existing._id;
  } else {
    stateId = await ctx.db.insert("adminServiceStates", input);
  }
  const client = await ctx.db
    .query("adminClientReadModels")
    .withIndex("by_accountId", (q) => q.eq("accountId", input.accountId))
    .unique();
  if (client) {
    await ctx.db.patch(client._id, {
      serviceSummaries: {
        ...client.serviceSummaries,
        [input.serviceType]: summary,
      },
    });
  }
  await syncServiceOperationReadModel(ctx, input);
  return stateId;
}

// This projection intentionally contains list-grade facts only. Deep actions
// and history load separately after a venue is selected, which keeps the
// primary three-service workspace cursor-paginated and N+1-free.
export async function syncServiceOperationReadModel(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    businessId: Id<"businesses">;
    serviceProfileId: Id<"serviceProfiles">;
    serviceType: ServiceType;
    state: ServiceState;
    updatedAt: number;
  },
) {
  const [profile, venue, account] = await Promise.all([
    ctx.db.get(input.serviceProfileId),
    ctx.db
      .query("adminVenueReadModels")
      .withIndex("by_businessId", (q) => q.eq("businessId", input.businessId))
      .unique(),
    ctx.db.get(input.accountId),
  ]);
  if (
    !profile ||
    profile.businessId !== input.businessId ||
    profile.type !== input.serviceType ||
    !venue ||
    venue.accountId !== input.accountId ||
    !account
  ) {
    return null;
  }

  const [subscription, action] = await Promise.all([
    ctx.db
      .query("subscriptions")
      .withIndex("by_accountId_and_targetKey", (q) =>
        q
          .eq("accountId", input.accountId)
          .eq("targetKey", `service:${input.serviceProfileId}`),
      )
      .unique(),
    ctx.db
      .query("actionItems")
      .withIndex(
        "by_serviceProfileId_and_state_and_priority",
        (q) =>
          q.eq("serviceProfileId", input.serviceProfileId).eq("state", "open"),
      )
      .first(),
  ]);

  let configurationState: Doc<"adminServiceOperationReadModels">["configurationState"] =
    "unconfigured";
  if (profile.status !== "active") {
    configurationState = "inactive";
  } else if (input.serviceType === "scanme_links") {
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", input.serviceProfileId),
      )
      .unique();
    configurationState = config?.publishedAt
      ? "published"
      : config?.hasUnpublishedChanges
        ? "draft"
        : config
          ? "configured"
          : "unconfigured";
  } else if (input.serviceType === "google_review") {
    const destination = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", input.businessId).eq("type", "google_review"),
      )
      .first();
    configurationState = destination?.active ? "configured" : "unconfigured";
  } else {
    const menu = await ctx.db
      .query("menus")
      .withIndex("by_businessId", (q) => q.eq("businessId", input.businessId))
      .unique();
    configurationState = menu?.status === "published"
      ? "published"
      : menu
        ? "draft"
        : "unconfigured";
  }

  const signal = actionSignal(action);
  const subscriptionState = subscription?.facts.status ?? "inactive";
  const filterState: ServiceState = signal.severity === "blocking"
    ? "problem"
    : subscriptionState === "active" && subscription?.facts.warning
      ? "warning"
      : subscriptionState;
  const hasCanonicalProductFacts = venue.productFactsComplete === true;
  const fields = {
    accountId: input.accountId,
    businessId: input.businessId,
    serviceProfileId: input.serviceProfileId,
    serviceType: input.serviceType,
    ...(subscription ? { subscriptionId: subscription._id } : {}),
    subscriptionState,
    warning: subscription?.facts.warning ?? false,
    paidThrough: subscription?.facts.paidThrough ?? null,
    graceEndsAt: subscription?.facts.graceEndsAt ?? null,
    configurationState,
    filterState,
    smkCode: venue.smkCode,
    smlCode: venue.smlCode,
    accountName: account.name,
    ownerDisplayName: venue.ownerDisplayName,
    venueName: venue.venueName,
    normalizedVenueName: venue.normalizedVenueName,
    publicSlug: profile.slug,
    productCount: hasCanonicalProductFacts ? venue.canonicalProductCount ?? null : null,
    qrCount: hasCanonicalProductFacts ? venue.canonicalQrCount ?? null : null,
    nfcCount: hasCanonicalProductFacts ? venue.canonicalNfcCount ?? null : null,
    problemCount: hasCanonicalProductFacts ? venue.canonicalProblemCount ?? null : null,
    signal,
    urgencyRank: signalUrgencyRank(signal),
    searchText: searchText([
      venue.ownerDisplayName,
      venue.venueName,
      venue.smkCode,
      venue.smlCode,
    ]),
    updatedAt: input.updatedAt,
  };
  const existing = await ctx.db
    .query("adminServiceOperationReadModels")
    .withIndex("by_serviceProfileId", (q) =>
      q.eq("serviceProfileId", input.serviceProfileId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return ctx.db.insert("adminServiceOperationReadModels", fields);
}

export async function syncSubscriptionServiceState(
  ctx: MutationCtx,
  subscription: Doc<"subscriptions">,
  facts: Doc<"subscriptions">["facts"],
  updatedAt: number,
) {
  if (subscription.target.kind === "account_premium") {
    const client = await ctx.db
      .query("adminClientReadModels")
      .withIndex("by_accountId", (q) => q.eq("accountId", subscription.accountId))
      .unique();
    if (client) {
      const premiumStatus =
        facts.status === "active" || facts.status === "grace"
          ? facts.status
          : null;
      await ctx.db.patch(client._id, { premiumStatus, updatedAt });
    }
    return;
  }
  if (subscription.target.kind !== "service_instance" || !subscription.businessId) return;
  const profile = await ctx.db.get(subscription.target.serviceProfileId);
  if (!profile || !ADMIN_V1_SERVICE_TYPES.includes(profile.type as ServiceType)) return;
  const state: ServiceState = facts.status === "active" && facts.warning
    ? "warning"
    : facts.status;
  await syncServiceOperationalState(ctx, {
    accountId: subscription.accountId,
    businessId: subscription.businessId,
    serviceProfileId: profile._id,
    serviceType: profile.type as ServiceType,
    state,
    updatedAt,
  });
}
