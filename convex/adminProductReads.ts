import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { query } from "./_generated/server";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { requireClientVenueAccess } from "./lib/clientAccountAccess";
import { accessKind, accessState, SUBJECT_CHANNEL_LIMIT } from "./lib/accessValidators";
import { adminOrderProductTypeValidator } from "./lib/adminOrderValidators";
import { channelsFor, requireScope, subjectInScope } from "./lib/accessOperations";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";

const scope = { accountId: v.id("accounts"), businessId: v.id("businesses") };
type PageOptions = { numItems: number; cursor: string | null; endCursor?: string | null; maximumRowsRead?: number; maximumBytesRead?: number; id?: number };
function boundedPage(options: PageOptions) {
  if (!Number.isInteger(options.numItems) || options.numItems < 1 || options.numItems > 50) throw new ConvexError("access_page_size_invalid");
  return { ...options, maximumRowsRead: Math.min(options.maximumRowsRead ?? 250, 250), maximumBytesRead: Math.min(options.maximumBytesRead ?? 1_000_000, 1_000_000) };
}
function search(value: string | undefined) {
  if (value && value.length > 120) throw new ConvexError("access_search_too_long");
  return normalizeAdminSearchText(value ?? "");
}

/** Indexed projection: no hydration/query per row, including text search. */
export const listInventory = query({
  args: { ...scope, paginationOpts: paginationOptsValidator, search: v.optional(v.string()), state: v.optional(accessState), productType: v.optional(adminOrderProductTypeValidator), sort: v.union(v.literal("smf"), v.literal("position")), direction: v.union(v.literal("asc"), v.literal("desc")) },
  returns: paginationResultValidator(schema.doc("productInventory")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const options = boundedPage(args.paginationOpts);
    const term = search(args.search);
    if (term) return ctx.db.query("productInventory").withSearchIndex("search_inventory", q => {
      let index = q.search("searchText", term).eq("accountId", args.accountId).eq("businessId", args.businessId);
      if (args.state) index = index.eq("state", args.state);
      if (args.productType) index = index.eq("productType", args.productType);
      return index;
    }).paginate(options);
    if (args.sort === "position") {
      if (args.state && args.productType) return ctx.db.query("productInventory").withIndex("by_business_state_type_position_smf", q => q.eq("businessId", args.businessId).eq("state", args.state!).eq("productType", args.productType!)).order(args.direction).paginate(options);
      if (args.state) return ctx.db.query("productInventory").withIndex("by_business_state_position_smf", q => q.eq("businessId", args.businessId).eq("state", args.state!)).order(args.direction).paginate(options);
      if (args.productType) return ctx.db.query("productInventory").withIndex("by_business_type_position_smf", q => q.eq("businessId", args.businessId).eq("productType", args.productType!)).order(args.direction).paginate(options);
    }
    if (args.state && args.productType) return ctx.db.query("productInventory").withIndex("by_business_state_type_smf", q => q.eq("businessId", args.businessId).eq("state", args.state!).eq("productType", args.productType!)).order(args.direction).paginate(options);
    if (args.state) return ctx.db.query("productInventory").withIndex("by_businessId_and_state_and_smfCode", q => q.eq("businessId", args.businessId).eq("state", args.state!)).order(args.direction).paginate(options);
    if (args.productType) return ctx.db.query("productInventory").withIndex("by_businessId_and_productType_and_smfCode", q => q.eq("businessId", args.businessId).eq("productType", args.productType!)).order(args.direction).paginate(options);
    if (args.sort === "position") return ctx.db.query("productInventory").withIndex("by_businessId_and_position_and_smfCode", q => q.eq("businessId", args.businessId)).order(args.direction).paginate(options);
    return ctx.db.query("productInventory").withIndex("by_businessId_and_smfCode", q => q.eq("businessId", args.businessId)).order(args.direction).paginate(options);
  },
});

export const listChannels = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()), state: v.optional(accessState), binding: v.optional(v.union(v.literal("digital"), v.literal("physical"))), direction: v.union(v.literal("asc"), v.literal("desc")) },
  returns: paginationResultValidator(schema.doc("accessChannels")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = boundedPage(args.paginationOpts);
    const term = search(args.search);
    if (term) return ctx.db.query("accessChannels").withSearchIndex("search_channels", q => {
      let index = q.search("searchText", term);
      if (args.state) index = index.eq("state", args.state);
      if (args.binding) index = index.eq("binding", args.binding);
      return index;
    }).paginate(options);
    if (args.binding && args.state) return ctx.db.query("accessChannels").withIndex("by_binding_and_state_and_updatedAt", q => q.eq("binding", args.binding!).eq("state", args.state!)).order(args.direction).paginate(options);
    if (args.binding) return ctx.db.query("accessChannels").withIndex("by_binding_and_updatedAt", q => q.eq("binding", args.binding!)).order(args.direction).paginate(options);
    if (args.state) return ctx.db.query("accessChannels").withIndex("by_state_and_updatedAt", q => q.eq("state", args.state!)).order(args.direction).paginate(options);
    return ctx.db.query("accessChannels").withIndex("by_updatedAt").order(args.direction).paginate(options);
  },
});

export const listVenues = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()), accountId: v.optional(v.id("accounts")) },
  // ADMIN-04's legacy product/channel counts are not canonical SMF totals.
  returns: paginationResultValidator(v.object({ accountId: v.id("accounts"), businessId: v.id("businesses"), smkCode: v.string(), smlCode: v.string(), ownerDisplayName: v.string(), venueName: v.string(), city: v.union(v.string(), v.null()), effectiveContactEmail: v.union(v.string(), v.null()), effectiveContactPhone: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = boundedPage(args.paginationOpts);
    const term = search(args.search);
    const result = term ? await ctx.db.query("adminVenueReadModels").withSearchIndex("search_searchText", q => {
      const index = q.search("searchText", term);
      return args.accountId ? index.eq("accountId", args.accountId) : index;
    }).paginate(options) : args.accountId
      ? await ctx.db.query("adminVenueReadModels").withIndex("by_accountId_and_normalizedVenueName", q => q.eq("accountId", args.accountId!)).paginate(options)
      : await ctx.db.query("adminVenueReadModels").withIndex("by_normalizedVenueName").paginate(options);
    return { ...result, page: result.page.map(({ accountId, businessId, smkCode, smlCode, ownerDisplayName, venueName, city, effectiveContactEmail, effectiveContactPhone }) => ({ accountId, businessId, smkCode, smlCode, ownerDisplayName, venueName, city, effectiveContactEmail, effectiveContactPhone })) };
  },
});

export const getProduct = query({
  args: { ...scope, productId: v.id("physicalProducts") },
  returns: v.object({ product: schema.doc("physicalProducts"), subject: schema.doc("accessSubjects"), channels: v.array(schema.doc("accessChannels")) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("access_product_missing");
    const subject = await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
    return { product, subject, channels: await channelsFor(ctx, subject._id) };
  },
});

export const getDigital = query({
  args: { ...scope, digitalQrId: v.id("digitalQrCodes") },
  returns: v.object({ digitalQr: schema.doc("digitalQrCodes"), channel: schema.doc("accessChannels"), subject: schema.doc("accessSubjects"), originalSubject: schema.doc("accessSubjects") }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const digitalQr = await ctx.db.get(args.digitalQrId);
    if (!digitalQr || digitalQr.accountId !== args.accountId || digitalQr.businessId !== args.businessId) throw new ConvexError("access_cross_account_venue");
    const originalSubject = await subjectInScope(ctx, digitalQr.originalSubjectId, args.accountId, args.businessId);
    const channel = await ctx.db.get(digitalQr.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    const subject = await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
    return { digitalQr, channel, subject, originalSubject };
  },
});

export const dailyMetrics = query({
  args: { ...scope, channelId: v.id("accessChannels"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("dailyCardMetrics")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
    return ctx.db.query("dailyCardMetrics").withIndex("by_cardId_and_dateKey", q => q.eq("cardId", channel.cardId)).order("desc").paginate(boundedPage(args.paginationOpts));
  },
});

export const destinationHistory = query({
  args: { ...scope, subjectId: v.id("accessSubjects"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("accessDestinationHistory")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await subjectInScope(ctx, args.subjectId, args.accountId, args.businessId);
    return ctx.db.query("accessDestinationHistory").withIndex("by_subjectId_and_createdAt", q => q.eq("subjectId", args.subjectId)).order("desc").paginate(boundedPage(args.paginationOpts));
  },
});

export const placementHistory = query({
  args: { ...scope, productId: v.id("physicalProducts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("productPlacements")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("access_product_missing");
    await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
    return ctx.db.query("productPlacements").withIndex("by_productId_and_startedAt", q => q.eq("productId", product._id)).order("desc").paginate(boundedPage(args.paginationOpts));
  },
});

export const channelHistory = query({
  args: { ...scope, channelId: v.id("accessChannels"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("accessChannelEvents")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
    return ctx.db.query("accessChannelEvents").withIndex("by_channelId_and_createdAt", q => q.eq("channelId", channel._id)).order("desc").paginate(boundedPage(args.paginationOpts));
  },
});

/** Client defaults to current interval; old scans stay accessible by interval. */
export const clientPlacementHistory = query({
  args: { businessId: v.id("businesses"), productId: v.id("physicalProducts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ placementId: v.id("productPlacements"), name: v.string(), startedAt: v.number(), endedAt: v.optional(v.number()) })),
  handler: async (ctx, args) => {
    await requireClientVenueAccess(ctx, args.businessId);
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== args.businessId) throw new ConvexError("access_cross_account_venue");
    const result = await ctx.db.query("productPlacements").withIndex("by_productId_and_startedAt", q => q.eq("productId", product._id)).order("desc").paginate(boundedPage(args.paginationOpts));
    return { ...result, page: result.page.map(row => ({ placementId: row._id, name: row.name, startedAt: row.startedAt, endedAt: row.endedAt })) };
  },
});

export const placementMetrics = query({
  args: { businessId: v.id("businesses"), productId: v.id("physicalProducts"), placementId: v.optional(v.id("productPlacements")) },
  returns: v.object({ placementId: v.union(v.id("productPlacements"), v.null()), channels: v.array(v.object({ channelId: v.id("accessChannels"), kind: accessKind, scans: v.number() })) }),
  handler: async (ctx, args) => {
    await requireClientVenueAccess(ctx, args.businessId);
    const product = await ctx.db.get(args.productId);
    if (!product || product.businessId !== args.businessId) throw new ConvexError("access_cross_account_venue");
    const subject = (await ctx.db.get(product.subjectId))!;
    const placementId = args.placementId ?? subject.currentPlacementId;
    if (placementId) {
      const placement = await ctx.db.get(placementId);
      if (!placement || placement.productId !== product._id) throw new ConvexError("access_placement_ownership");
    }
    const channels = await channelsFor(ctx, subject._id);
    const totals = await ctx.db.query("accessMetricTotals").withIndex("by_subjectId_and_placementId_and_channelId", q => q.eq("subjectId", subject._id).eq("placementId", placementId)).take(SUBJECT_CHANNEL_LIMIT);
    return { placementId: placementId ?? null, channels: channels.map(channel => ({ channelId: channel._id, kind: channel.kind, scans: totals.find(t => t.channelId === channel._id)?.scans ?? 0 })) };
  },
});

export const scanHistory = query({
  args: { ...scope, channelId: v.id("accessChannels"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("cardScanEvents")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
    return ctx.db.query("cardScanEvents").withIndex("by_cardId_and_occurredAt", q => q.eq("cardId", channel.cardId)).order("desc").paginate(boundedPage(args.paginationOpts));
  },
});

export const legacyTargets = query({
  args: { ...scope, channelId: v.id("accessChannels"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("cardTargets")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
    return ctx.db.query("cardTargets").withIndex("by_cardId", q => q.eq("cardId", channel.cardId)).order("desc").paginate(boundedPage(args.paginationOpts));
  },
});
