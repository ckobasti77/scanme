import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import {
  actionSignalValidator,
  adminV1ServiceTypeValidator,
  productOperationalStatusValidator,
  productTypeValidator,
  serviceOperationalStateValidator,
  serviceSummariesValidator,
} from "./lib/adminActionValidators";
import {
  syncServiceOperationalState,
  upsertClientReadModel,
  upsertProductReadModel,
  upsertVenueReadModel,
} from "./lib/adminReadModelEngine";
import { normalizeAdminDirectoryQuery } from "./lib/adminV1Validators";

const clientViewValidator = v.object({
  accountId: v.id("accounts"),
  smkCode: v.string(),
  accountName: v.string(),
  ownerDisplayName: v.string(),
  defaultContactEmail: v.union(v.string(), v.null()),
  defaultContactPhone: v.union(v.string(), v.null()),
  firstVenueName: v.union(v.string(), v.null()),
  firstVenueSlug: v.union(v.string(), v.null()),
  venueCount: v.number(),
  clientStatus: v.union(v.literal("active"), v.literal("archived")),
  signal: actionSignalValidator,
  serviceSummaries: serviceSummariesValidator,
  premiumStatus: v.union(v.literal("active"), v.literal("grace"), v.null()),
  updatedAt: v.number(),
});

const venueServiceViewValidator = v.object({
  businessId: v.id("businesses"),
  venueName: v.string(),
  smlCode: v.string(),
  services: v.object({
    scanme_links: v.union(serviceOperationalStateValidator, v.null()),
    google_review: v.union(serviceOperationalStateValidator, v.null()),
    scanme_menu: v.union(serviceOperationalStateValidator, v.null()),
  }),
});

const venueViewValidator = v.object({
  accountId: v.id("accounts"),
  businessId: v.id("businesses"),
  smkCode: v.string(),
  smlCode: v.string(),
  ownerDisplayName: v.string(),
  venueName: v.string(),
  city: v.union(v.string(), v.null()),
  effectiveContactEmail: v.union(v.string(), v.null()),
  effectiveContactPhone: v.union(v.string(), v.null()),
  productCount: v.number(),
  channelCount: v.number(),
  serviceTypes: v.array(adminV1ServiceTypeValidator),
  clientStatus: v.union(v.literal("active"), v.literal("archived")),
  signal: actionSignalValidator,
  updatedAt: v.number(),
});

const productViewValidator = v.object({
  accountId: v.id("accounts"),
  businessId: v.id("businesses"),
  sourceRecordId: v.string(),
  smkCode: v.string(),
  smlCode: v.string(),
  smfCode: v.string(),
  smqCodes: v.array(v.string()),
  ownerDisplayName: v.string(),
  venueName: v.string(),
  productType: productTypeValidator,
  displayName: v.string(),
  operationalStatus: productOperationalStatusValidator,
  signal: actionSignalValidator,
  updatedAt: v.number(),
});

const listSortValidator = v.union(
  v.literal("urgency"),
  v.literal("name"),
  v.literal("recent"),
);

function toClientView(row: import("./_generated/dataModel").Doc<"adminClientReadModels">) {
  return {
    accountId: row.accountId,
    smkCode: row.smkCode,
    accountName: row.accountName,
    ownerDisplayName: row.ownerDisplayName,
    defaultContactEmail: row.defaultContactEmail,
    defaultContactPhone: row.defaultContactPhone,
    firstVenueName: row.firstVenueName,
    firstVenueSlug: row.firstVenueSlug ?? null,
    venueCount: row.venueCount,
    clientStatus: row.clientStatus,
    signal: row.signal,
    serviceSummaries: row.serviceSummaries,
    premiumStatus: row.premiumStatus ?? null,
    updatedAt: row.updatedAt,
  };
}

function toVenueView(row: import("./_generated/dataModel").Doc<"adminVenueReadModels">) {
  return {
    accountId: row.accountId,
    businessId: row.businessId,
    smkCode: row.smkCode,
    smlCode: row.smlCode,
    ownerDisplayName: row.ownerDisplayName,
    venueName: row.venueName,
    city: row.city,
    effectiveContactEmail: row.effectiveContactEmail,
    effectiveContactPhone: row.effectiveContactPhone,
    productCount: row.productCount,
    channelCount: row.channelCount,
    serviceTypes: row.serviceTypes,
    clientStatus: row.clientStatus,
    signal: row.signal,
    updatedAt: row.updatedAt,
  };
}

function toProductView(row: import("./_generated/dataModel").Doc<"adminProductReadModels">) {
  return {
    accountId: row.accountId,
    businessId: row.businessId,
    sourceRecordId: row.sourceRecordId,
    smkCode: row.smkCode,
    smlCode: row.smlCode,
    smfCode: row.smfCode,
    smqCodes: row.smqCodes,
    ownerDisplayName: row.ownerDisplayName,
    venueName: row.venueName,
    productType: row.productType,
    displayName: row.displayName,
    operationalStatus: row.operationalStatus,
    signal: row.signal,
    updatedAt: row.updatedAt,
  };
}

export const syncClient = internalMutation({
  args: {
    accountId: v.id("accounts"),
    venueCount: v.number(),
    firstVenueName: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.id("adminClientReadModels"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertClientReadModel(ctx, args);
  },
});

export const syncVenue = internalMutation({
  args: {
    businessId: v.id("businesses"),
    productCount: v.number(),
    channelCount: v.number(),
    updatedAt: v.number(),
  },
  returns: v.id("adminVenueReadModels"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertVenueReadModel(ctx, args);
  },
});

export const syncProduct = internalMutation({
  args: {
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    sourceRecordId: v.string(),
    smfCode: v.string(),
    smqCodes: v.array(v.string()),
    productType: productTypeValidator,
    displayName: v.string(),
    operationalStatus: productOperationalStatusValidator,
    updatedAt: v.number(),
  },
  returns: v.id("adminProductReadModels"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertProductReadModel(ctx, args);
  },
});

export const syncServiceState = internalMutation({
  args: {
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    serviceProfileId: v.id("serviceProfiles"),
    serviceType: adminV1ServiceTypeValidator,
    state: serviceOperationalStateValidator,
    updatedAt: v.number(),
  },
  returns: v.id("adminServiceStates"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return syncServiceOperationalState(ctx, args);
  },
});

export const clients = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.union(v.literal("all"), v.literal("active"), v.literal("archived")),
    sort: listSortValidator,
  },
  returns: paginationResultValidator(clientViewValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = normalizeAdminDirectoryQuery(args.search ?? "");
    if (search) {
      const result = await ctx.db
        .query("adminClientReadModels")
        .withSearchIndex("search_searchText", (q) => {
          const match = q.search("searchText", search);
          return args.status === "all" ? match : match.eq("clientStatus", args.status);
        })
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toClientView) };
    }
    if (args.status === "all") {
      const result = args.sort === "urgency"
        ? await ctx.db.query("adminClientReadModels").withIndex("by_urgencyRank_and_normalizedOwnerDisplayName").paginate(args.paginationOpts)
        : args.sort === "name"
          ? await ctx.db.query("adminClientReadModels").withIndex("by_normalizedOwnerDisplayName").paginate(args.paginationOpts)
          : await ctx.db.query("adminClientReadModels").withIndex("by_updatedAt").order("desc").paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toClientView) };
    }
    const status: "active" | "archived" = args.status;
    const result = args.sort === "urgency"
      ? await ctx.db.query("adminClientReadModels").withIndex("by_clientStatus_and_urgencyRank_and_normalizedOwnerDisplayName", (q) => q.eq("clientStatus", status)).paginate(args.paginationOpts)
      : args.sort === "name"
        ? await ctx.db.query("adminClientReadModels").withIndex("by_clientStatus_and_normalizedOwnerDisplayName", (q) => q.eq("clientStatus", status)).paginate(args.paginationOpts)
        : await ctx.db.query("adminClientReadModels").withIndex("by_clientStatus_and_updatedAt", (q) => q.eq("clientStatus", status)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toClientView) };
  },
});

// ADMIN-06 browser adapter. The internal query above remains available to
// backend workflows, while this public surface is explicitly admin-gated and
// returns only the already-materialized directory view.
export const listClients = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.union(v.literal("all"), v.literal("active"), v.literal("archived")),
    sort: listSortValidator,
  },
  returns: paginationResultValidator(clientViewValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = normalizeAdminDirectoryQuery(args.search ?? "");
    if (search) {
      const result = await ctx.db
        .query("adminClientReadModels")
        .withSearchIndex("search_searchText", (q) => {
          const match = q.search("searchText", search);
          return args.status === "all" ? match : match.eq("clientStatus", args.status);
        })
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toClientView) };
    }
    if (args.status === "all") {
      const result = args.sort === "urgency"
        ? await ctx.db.query("adminClientReadModels").withIndex("by_urgencyRank_and_normalizedOwnerDisplayName").paginate(args.paginationOpts)
        : args.sort === "name"
          ? await ctx.db.query("adminClientReadModels").withIndex("by_normalizedOwnerDisplayName").paginate(args.paginationOpts)
          : await ctx.db.query("adminClientReadModels").withIndex("by_updatedAt").order("desc").paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toClientView) };
    }
    const status: "active" | "archived" = args.status;
    const result = args.sort === "urgency"
      ? await ctx.db.query("adminClientReadModels").withIndex("by_clientStatus_and_urgencyRank_and_normalizedOwnerDisplayName", (q) => q.eq("clientStatus", status)).paginate(args.paginationOpts)
      : args.sort === "name"
        ? await ctx.db.query("adminClientReadModels").withIndex("by_clientStatus_and_normalizedOwnerDisplayName", (q) => q.eq("clientStatus", status)).paginate(args.paginationOpts)
        : await ctx.db.query("adminClientReadModels").withIndex("by_clientStatus_and_updatedAt", (q) => q.eq("clientStatus", status)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toClientView) };
  },
});

const CLIENT_SERVICE_DETAIL_LIMIT = 500;
const DETAIL_STATE_PRIORITY = {
  problem: 0,
  suspended: 1,
  grace: 2,
  warning: 3,
  inactive: 4,
  active: 5,
} as const;

// Loaded only after an admin expands one client's service summary. Three
// indexed, capped reads replace any per-row/per-venue query fan-out.
export const clientVenueServices = query({
  args: {
    accountId: v.id("accounts"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(venueServiceViewValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const venues = await ctx.db
      .query("adminVenueReadModels")
      .withIndex("by_accountId_and_normalizedVenueName", (q) =>
        q.eq("accountId", args.accountId),
      )
      .paginate(args.paginationOpts);
    const pageBusinessIds = new Set(venues.page.map((venue) => venue.businessId));
    const statesByBusiness = new Map<
      string,
      {
        scanme_links: null | import("./_generated/dataModel").Doc<"adminServiceStates">["state"];
        google_review: null | import("./_generated/dataModel").Doc<"adminServiceStates">["state"];
        scanme_menu: null | import("./_generated/dataModel").Doc<"adminServiceStates">["state"];
      }
    >();
    for (const serviceType of ["scanme_links", "google_review", "scanme_menu"] as const) {
      const rows = await ctx.db
        .query("adminServiceStates")
        .withIndex("by_accountId_and_serviceType", (q) =>
          q.eq("accountId", args.accountId).eq("serviceType", serviceType),
        )
        .take(CLIENT_SERVICE_DETAIL_LIMIT + 1);
      if (rows.length > CLIENT_SERVICE_DETAIL_LIMIT) {
        throw new ConvexError("admin_client_service_detail_limit");
      }
      for (const row of rows) {
        if (!pageBusinessIds.has(row.businessId)) continue;
        const current = statesByBusiness.get(row.businessId) ?? {
          scanme_links: null,
          google_review: null,
          scanme_menu: null,
        };
        const previous = current[serviceType];
        if (
          previous === null ||
          DETAIL_STATE_PRIORITY[row.state] < DETAIL_STATE_PRIORITY[previous]
        ) {
          current[serviceType] = row.state;
        }
        statesByBusiness.set(row.businessId, current);
      }
    }
    return {
      ...venues,
      page: venues.page.map((venue) => ({
        businessId: venue.businessId,
        venueName: venue.venueName,
        smlCode: venue.smlCode,
        services: statesByBusiness.get(venue.businessId) ?? {
          scanme_links: null,
          google_review: null,
          scanme_menu: null,
        },
      })),
    };
  },
});

export const venues = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.union(v.literal("all"), v.literal("active"), v.literal("archived")),
    sort: listSortValidator,
  },
  returns: paginationResultValidator(venueViewValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = normalizeAdminDirectoryQuery(args.search ?? "");
    if (search) {
      const result = await ctx.db
        .query("adminVenueReadModels")
        .withSearchIndex("search_searchText", (q) => {
          const match = q.search("searchText", search);
          return args.status === "all" ? match : match.eq("clientStatus", args.status);
        })
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toVenueView) };
    }
    if (args.status === "all") {
      const result = args.sort === "urgency"
        ? await ctx.db.query("adminVenueReadModels").withIndex("by_urgencyRank_and_normalizedVenueName").paginate(args.paginationOpts)
        : args.sort === "name"
          ? await ctx.db.query("adminVenueReadModels").withIndex("by_normalizedVenueName").paginate(args.paginationOpts)
          : await ctx.db.query("adminVenueReadModels").withIndex("by_updatedAt").order("desc").paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toVenueView) };
    }
    const status: "active" | "archived" = args.status;
    const result = args.sort === "urgency"
      ? await ctx.db.query("adminVenueReadModels").withIndex("by_clientStatus_and_urgencyRank_and_normalizedVenueName", (q) => q.eq("clientStatus", status)).paginate(args.paginationOpts)
      : args.sort === "name"
        ? await ctx.db.query("adminVenueReadModels").withIndex("by_clientStatus_and_normalizedVenueName", (q) => q.eq("clientStatus", status)).paginate(args.paginationOpts)
        : await ctx.db.query("adminVenueReadModels").withIndex("by_clientStatus_and_updatedAt", (q) => q.eq("clientStatus", status)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toVenueView) };
  },
});

export const products = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.union(v.literal("all"), productOperationalStatusValidator),
    sort: listSortValidator,
  },
  returns: paginationResultValidator(productViewValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = normalizeAdminDirectoryQuery(args.search ?? "");
    if (search) {
      const result = await ctx.db
        .query("adminProductReadModels")
        .withSearchIndex("search_searchText", (q) => {
          const match = q.search("searchText", search);
          return args.status === "all" ? match : match.eq("operationalStatus", args.status);
        })
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toProductView) };
    }
    if (args.status === "all") {
      const result = args.sort === "urgency"
        ? await ctx.db.query("adminProductReadModels").withIndex("by_urgencyRank_and_normalizedDisplayName").paginate(args.paginationOpts)
        : args.sort === "name"
          ? await ctx.db.query("adminProductReadModels").withIndex("by_normalizedDisplayName").paginate(args.paginationOpts)
          : await ctx.db.query("adminProductReadModels").withIndex("by_updatedAt").order("desc").paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toProductView) };
    }
    const status: "active" | "problem" | "inactive" = args.status;
    const result = args.sort === "urgency"
      ? await ctx.db.query("adminProductReadModels").withIndex("by_operationalStatus_and_urgencyRank_and_normalizedDisplayName", (q) => q.eq("operationalStatus", status)).paginate(args.paginationOpts)
      : args.sort === "name"
        ? await ctx.db.query("adminProductReadModels").withIndex("by_operationalStatus_and_normalizedDisplayName", (q) => q.eq("operationalStatus", status)).paginate(args.paginationOpts)
        : await ctx.db.query("adminProductReadModels").withIndex("by_operationalStatus_and_updatedAt", (q) => q.eq("operationalStatus", status)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toProductView) };
  },
});
