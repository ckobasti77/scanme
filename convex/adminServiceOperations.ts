import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import {
  actionSignalValidator,
  adminV1ServiceTypeValidator,
  serviceOperationalStateValidator,
} from "./lib/adminActionValidators";
import { writeAdminAudit } from "./lib/adminAudit";
import { normalizeAdminDirectoryQuery } from "./lib/adminV1Validators";

const PAGE_LIMIT = 50;
const listSortValidator = v.union(
  v.literal("urgency"),
  v.literal("name"),
  v.literal("recent"),
);

const rowValidator = v.object({
  accountId: v.id("accounts"),
  businessId: v.id("businesses"),
  serviceProfileId: v.id("serviceProfiles"),
  serviceType: adminV1ServiceTypeValidator,
  subscriptionState: v.union(
    v.literal("active"),
    v.literal("grace"),
    v.literal("suspended"),
    v.literal("inactive"),
  ),
  warning: v.boolean(),
  paidThrough: v.union(v.number(), v.null()),
  graceEndsAt: v.union(v.number(), v.null()),
  configurationState: v.union(
    v.literal("published"),
    v.literal("draft"),
    v.literal("configured"),
    v.literal("unconfigured"),
    v.literal("inactive"),
  ),
  filterState: serviceOperationalStateValidator,
  smkCode: v.string(),
  smlCode: v.string(),
  accountName: v.string(),
  ownerDisplayName: v.string(),
  venueName: v.string(),
  publicSlug: v.string(),
  productCount: v.union(v.number(), v.null()),
  qrCount: v.union(v.number(), v.null()),
  nfcCount: v.union(v.number(), v.null()),
  problemCount: v.union(v.number(), v.null()),
  signal: actionSignalValidator,
  updatedAt: v.number(),
});

function toRow(row: import("./_generated/dataModel").Doc<"adminServiceOperationReadModels">) {
  return {
    accountId: row.accountId,
    businessId: row.businessId,
    serviceProfileId: row.serviceProfileId,
    serviceType: row.serviceType,
    subscriptionState: row.subscriptionState,
    warning: row.warning,
    paidThrough: row.paidThrough,
    graceEndsAt: row.graceEndsAt,
    configurationState: row.configurationState,
    filterState: row.filterState,
    smkCode: row.smkCode,
    smlCode: row.smlCode,
    accountName: row.accountName,
    ownerDisplayName: row.ownerDisplayName,
    venueName: row.venueName,
    publicSlug: row.publicSlug,
    productCount: row.productCount,
    qrCount: row.qrCount,
    nfcCount: row.nfcCount,
    problemCount: row.problemCount,
    signal: row.signal,
    updatedAt: row.updatedAt,
  };
}

export const list = query({
  args: {
    serviceType: adminV1ServiceTypeValidator,
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    filter: v.union(v.literal("all"), serviceOperationalStateValidator),
    sort: listSortValidator,
  },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > PAGE_LIMIT) {
      throw new ConvexError("admin_service_page_limit");
    }
    const search = normalizeAdminDirectoryQuery(args.search ?? "");
    if (search) {
      const result = await ctx.db
        .query("adminServiceOperationReadModels")
        .withSearchIndex("search_searchText", (q) => {
          const indexed = q.search("searchText", search).eq("serviceType", args.serviceType);
          return args.filter === "all"
            ? indexed
            : indexed.eq("filterState", args.filter);
        })
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toRow) };
    }
    const source = args.filter === "all"
      ? args.sort === "urgency"
        ? ctx.db
            .query("adminServiceOperationReadModels")
            .withIndex("by_type_urgency_name", (q) => q.eq("serviceType", args.serviceType))
        : args.sort === "name"
          ? ctx.db
              .query("adminServiceOperationReadModels")
              .withIndex("by_type_name", (q) => q.eq("serviceType", args.serviceType))
          : ctx.db
              .query("adminServiceOperationReadModels")
              .withIndex("by_type_updated", (q) => q.eq("serviceType", args.serviceType))
              .order("desc")
      : args.sort === "urgency"
        ? ctx.db
            .query("adminServiceOperationReadModels")
            .withIndex("by_type_filter_urgency_name", (q) => q.eq("serviceType", args.serviceType).eq("filterState", args.filter as Exclude<typeof args.filter, "all">))
        : args.sort === "name"
          ? ctx.db
              .query("adminServiceOperationReadModels")
              .withIndex("by_type_filter_name", (q) => q.eq("serviceType", args.serviceType).eq("filterState", args.filter as Exclude<typeof args.filter, "all">))
          : ctx.db
              .query("adminServiceOperationReadModels")
              .withIndex("by_type_filter_updated", (q) => q.eq("serviceType", args.serviceType).eq("filterState", args.filter as Exclude<typeof args.filter, "all">))
              .order("desc");
    const result = await source.paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toRow) };
  },
});

export const detail = query({
  args: { serviceProfileId: v.id("serviceProfiles") },
  returns: v.union(
    v.null(),
    v.object({
      row: rowValidator,
      editorHref: v.union(v.string(), v.null()),
      publicHref: v.union(v.string(), v.null()),
      clientHref: v.string(),
      googleDestination: v.union(v.string(), v.null()),
      actions: v.array(v.object({
        causeId: v.string(),
        severity: v.union(v.literal("blocking"), v.literal("warning"), v.literal("information")),
        description: v.union(v.string(), v.null()),
        relevantAt: v.number(),
      })),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("adminServiceOperationReadModels")
      .withIndex("by_serviceProfileId", (q) => q.eq("serviceProfileId", args.serviceProfileId))
      .unique();
    if (!row) return null;
    const [business, googleLink, actions] = await Promise.all([
      ctx.db.get(row.businessId),
      row.serviceType === "google_review"
        ? ctx.db
            .query("dynamicLinks")
            .withIndex("by_businessId_and_type", (q) => q.eq("businessId", row.businessId).eq("type", "google_review"))
            .first()
        : null,
      ctx.db
        .query("actionItems")
        .withIndex(
          "by_serviceProfileId_and_state_and_priority",
          (q) => q.eq("serviceProfileId", row.serviceProfileId).eq("state", "open"),
        )
        .take(5),
    ]);
    if (!business) throw new ConvexError("admin_service_business_missing");
    const editorHref = row.serviceType === "scanme_links"
      ? `/admin/scanme-links/${row.businessId}/editor`
      : row.serviceType === "scanme_menu"
        ? `/${business.slug}/meni/editor`
        : `/${business.slug}/client-panel`;
    const publicHref = row.serviceType === "scanme_menu"
      ? `/${business.slug}/meni`
      : row.serviceType === "google_review"
        ? (googleLink?.active ? `/${googleLink.slug}` : null)
        : `/${row.publicSlug}`;
    return {
      row: toRow(row),
      editorHref,
      publicHref,
      clientHref: `/${business.slug}/client-panel`,
      googleDestination: googleLink?.destinationUrl ?? null,
      actions: actions.map((action) => ({
        causeId: action.causeId,
        severity: action.severity,
        description: action.description ?? null,
        relevantAt: action.relevantAt,
      })),
    };
  },
});

export const changeLifecycle = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    operation: v.union(v.literal("suspend"), v.literal("reactivate")),
    reason: v.string(),
    key: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("active"), v.literal("grace"), v.literal("suspended"), v.literal("inactive")),
    warning: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile || !["scanme_links", "google_review", "scanme_menu"].includes(profile.type)) {
      throw new ConvexError("admin_service_profile_invalid");
    }
    const business = await ctx.db.get(profile.businessId);
    if (!business?.accountId) throw new ConvexError("admin_service_business_missing");
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_accountId_and_targetKey", (q) =>
        q.eq("accountId", business.accountId!).eq("targetKey", `service:${profile._id}`),
      )
      .unique();
    if (!subscription || subscription.businessId !== business._id) {
      throw new ConvexError("admin_service_subscription_missing");
    }
    const facts: { status: "active" | "grace" | "suspended" | "inactive"; warning: boolean } =
      await ctx.runMutation(internal.subscriptions.control, {
        subscriptionId: subscription._id,
        operation: args.operation,
        reason: args.reason,
        key: args.key,
      });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: business.accountId,
      businessId: business._id,
      action: `admin_service_${args.operation}`,
      detail: { serviceProfileId: profile._id, serviceType: profile.type, key: args.key },
      now: Date.now(),
    });
    return facts;
  },
});
