import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { query } from "./_generated/server";
import schema, { serviceTypeValidator } from "./schema";
import { requireAdmin } from "./lib/access";
import { requireClientVenueAccess } from "./lib/clientAccountAccess";
import { accessKind, accessState, SUBJECT_CHANNEL_LIMIT } from "./lib/accessValidators";
import { adminOrderProductTypeValidator } from "./lib/adminOrderValidators";
import { channelsFor, requireScope, subjectInScope } from "./lib/accessOperations";
import { normalizeAdminHumanCode, normalizeAdminSearchText } from "./lib/adminV1Validators";

const scope = { accountId: v.id("accounts"), businessId: v.id("businesses") };
type PageOptions = { numItems: number; cursor: string | null; endCursor?: string | null; maximumRowsRead?: number; maximumBytesRead?: number; id?: number };
const venueFilter = v.union(v.literal("all"), v.literal("problem"), v.literal("active"));
const venueSort = v.union(v.literal("urgency"), v.literal("name"));
const designKind = v.union(v.literal("template"), v.literal("custom"));
const venueRow = v.object({
  accountId: v.id("accounts"),
  businessId: v.id("businesses"),
  smkCode: v.string(),
  smlCode: v.string(),
  ownerDisplayName: v.string(),
  venueName: v.string(),
  city: v.union(v.string(), v.null()),
  effectiveContactEmail: v.union(v.string(), v.null()),
  effectiveContactPhone: v.union(v.string(), v.null()),
  productCount: v.union(v.number(), v.null()),
  qrCount: v.union(v.number(), v.null()),
  nfcCount: v.union(v.number(), v.null()),
  channelCount: v.union(v.number(), v.null()),
  activeChannelCount: v.union(v.number(), v.null()),
  problemCount: v.union(v.number(), v.null()),
  isProductProjectionComplete: v.boolean(),
  serviceTypes: v.array(v.union(v.literal("scanme_links"), v.literal("google_review"), v.literal("scanme_menu"))),
  clientStatus: v.union(v.literal("active"), v.literal("archived")),
  signal: v.object({ severity: v.union(v.literal("blocking"), v.literal("warning"), v.literal("information"), v.null()), causeId: v.union(v.string(), v.null()) }),
  urgencyRank: v.number(),
  hasOpenAction: v.boolean(),
  updatedAt: v.number(),
});
const productDetail = v.object({
  product: schema.doc("physicalProducts"),
  subject: schema.doc("accessSubjects"),
  channels: v.array(schema.doc("accessChannels")),
});
const productDetailWithContext = v.object({
  ...productDetail.fields,
  context: v.object({
    accountName: v.string(), smkCode: v.union(v.string(), v.null()),
    venueName: v.string(), smlCode: v.union(v.string(), v.null()), city: v.union(v.string(), v.null()),
  }),
});
const channelDetail = v.object({
  channel: schema.doc("accessChannels"),
  subject: schema.doc("accessSubjects"),
  originalSubject: v.union(schema.doc("accessSubjects"), v.null()),
  product: v.union(schema.doc("physicalProducts"), v.null()),
  digitalQr: v.union(schema.doc("digitalQrCodes"), v.null()),
  context: v.object({
    accountName: v.string(), smkCode: v.union(v.string(), v.null()),
    venueName: v.string(), smlCode: v.union(v.string(), v.null()), city: v.union(v.string(), v.null()),
  }),
});
function boundedPage(options: PageOptions) {
  if (!Number.isInteger(options.numItems) || options.numItems < 1 || options.numItems > 50) throw new ConvexError("access_page_size_invalid");
  return { ...options, maximumRowsRead: Math.min(options.maximumRowsRead ?? 250, 250), maximumBytesRead: Math.min(options.maximumBytesRead ?? 1_000_000, 1_000_000) };
}
function search(value: string | undefined) {
  if (value && value.length > 120) throw new ConvexError("access_search_too_long");
  return normalizeAdminSearchText(value ?? "");
}
function inventorySearch(value: string | undefined, design: "template" | "custom" | undefined, service: string | undefined) {
  return [search(value), design ? `design ${design}` : "", service].filter(Boolean).join(" ");
}
function exactAccessCode(value: string | undefined): { kind: "SMF" | "SMQ"; code: string } | null {
  if (!value) return null;
  const candidate = value.trim().toUpperCase().replace(/\s+/g, "-");
  if (!candidate.startsWith("SMF-") && !candidate.startsWith("SMQ-")) return null;
  const kind = candidate.slice(0, 3) as "SMF" | "SMQ";
  try {
    return { kind, code: normalizeAdminHumanCode(candidate, kind) };
  } catch {
    return null;
  }
}
function venueView(row: import("./_generated/dataModel").Doc<"adminVenueReadModels">) {
  const complete = row.productFactsComplete === true && row.canonicalProductCount !== undefined && row.canonicalQrCount !== undefined && row.canonicalNfcCount !== undefined && row.canonicalActiveChannelCount !== undefined && row.canonicalProblemCount !== undefined;
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
    productCount: complete ? row.canonicalProductCount! : null,
    qrCount: complete ? row.canonicalQrCount! : null,
    nfcCount: complete ? row.canonicalNfcCount! : null,
    channelCount: complete ? row.canonicalQrCount! + row.canonicalNfcCount! : null,
    activeChannelCount: complete ? row.canonicalActiveChannelCount! : null,
    problemCount: complete ? row.canonicalProblemCount! : null,
    isProductProjectionComplete: complete,
    serviceTypes: row.serviceTypes,
    clientStatus: row.clientStatus,
    signal: row.signal,
    urgencyRank: row.urgencyRank,
    hasOpenAction: row.hasOpenAction ?? row.signal.severity !== null,
    updatedAt: row.updatedAt,
  };
}
async function readProduct(ctx: import("./_generated/server").QueryCtx, args: { accountId: import("./_generated/dataModel").Id<"accounts">; businessId: import("./_generated/dataModel").Id<"businesses">; productId: import("./_generated/dataModel").Id<"physicalProducts"> }) {
  await requireAdmin(ctx);
  const product = await ctx.db.get(args.productId);
  if (!product) throw new ConvexError("access_product_missing");
  const subject = await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
  return { product, subject, channels: await channelsFor(ctx, subject._id) };
}

/** Indexed projection: no hydration/query per row, including text search. */
export const listInventory = query({
  args: { ...scope, paginationOpts: paginationOptsValidator, search: v.optional(v.string()), state: v.optional(accessState), productType: v.optional(adminOrderProductTypeValidator), design: v.optional(designKind), service: v.optional(serviceTypeValidator), sort: v.union(v.literal("smf"), v.literal("position")), direction: v.union(v.literal("asc"), v.literal("desc")) },
  returns: paginationResultValidator(schema.doc("productInventory")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const options = boundedPage(args.paginationOpts);
    const term = inventorySearch(args.search, args.design, args.service);
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
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()), state: v.optional(accessState), binding: v.optional(v.union(v.literal("digital"), v.literal("physical"))), kind: v.optional(accessKind), direction: v.union(v.literal("asc"), v.literal("desc")) },
  returns: paginationResultValidator(schema.doc("accessChannels")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = boundedPage(args.paginationOpts);
    const term = search(args.search);
    if (term) return ctx.db.query("accessChannels").withSearchIndex("search_channels", q => {
      let index = q.search("searchText", term);
      if (args.state) index = index.eq("state", args.state);
      if (args.binding) index = index.eq("binding", args.binding);
      if (args.kind) index = index.eq("kind", args.kind);
      return index;
    }).paginate(options);
    if (args.kind && args.binding && args.state) return ctx.db.query("accessChannels").withIndex("by_kind_and_binding_and_state_and_updatedAt", q => q.eq("kind", args.kind!).eq("binding", args.binding!).eq("state", args.state!)).order(args.direction).paginate(options);
    if (args.kind && args.binding) return ctx.db.query("accessChannels").withIndex("by_kind_and_binding_and_updatedAt", q => q.eq("kind", args.kind!).eq("binding", args.binding!)).order(args.direction).paginate(options);
    if (args.kind && args.state) return ctx.db.query("accessChannels").withIndex("by_kind_and_state_and_updatedAt", q => q.eq("kind", args.kind!).eq("state", args.state!)).order(args.direction).paginate(options);
    if (args.kind) return ctx.db.query("accessChannels").withIndex("by_kind_and_updatedAt", q => q.eq("kind", args.kind!)).order(args.direction).paginate(options);
    if (args.binding && args.state) return ctx.db.query("accessChannels").withIndex("by_binding_and_state_and_updatedAt", q => q.eq("binding", args.binding!).eq("state", args.state!)).order(args.direction).paginate(options);
    if (args.binding) return ctx.db.query("accessChannels").withIndex("by_binding_and_updatedAt", q => q.eq("binding", args.binding!)).order(args.direction).paginate(options);
    if (args.state) return ctx.db.query("accessChannels").withIndex("by_state_and_updatedAt", q => q.eq("state", args.state!)).order(args.direction).paginate(options);
    return ctx.db.query("accessChannels").withIndex("by_updatedAt").order(args.direction).paginate(options);
  },
});

export const listVenues = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()), accountId: v.optional(v.id("accounts")), filter: v.optional(venueFilter), sort: v.optional(venueSort) },
  returns: paginationResultValidator(venueRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = boundedPage(args.paginationOpts);
    const term = search(args.search);
    const filter = args.filter ?? "all";
    const sort = args.sort ?? "urgency";
    const code = exactAccessCode(args.search);
    if (code) {
      const source = code.kind === "SMF"
        ? await ctx.db.query("physicalProducts").withIndex("by_smfCode", q => q.eq("smfCode", code.code)).unique()
        : await ctx.db.query("digitalQrCodes").withIndex("by_smqCode", q => q.eq("smqCode", code.code)).unique();
      const venue = source && (!args.accountId || source.accountId === args.accountId)
        ? await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", q => q.eq("businessId", source.businessId)).unique()
        : null;
      const row = venue && (filter !== "problem" || (venue.hasOpenAction ?? venue.signal.severity !== null)) && (filter !== "active" || venue.clientStatus === "active")
        ? venueView(venue)
        : null;
      return { page: row ? [row] : [], isDone: true, continueCursor: "" };
    }
    const result = term ? await ctx.db.query("adminVenueReadModels").withSearchIndex("search_searchText", q => {
      let index = q.search("searchText", term);
      if (args.accountId) index = index.eq("accountId", args.accountId);
      if (filter === "problem") index = index.eq("hasOpenAction", true);
      if (filter === "active") index = index.eq("clientStatus", "active");
      return index;
    }).paginate(options) : filter === "problem"
      ? args.accountId
        ? sort === "urgency"
        ? await ctx.db.query("adminVenueReadModels").withIndex("by_account_action_urgency_name", q => q.eq("accountId", args.accountId!).eq("hasOpenAction", true)).paginate(options)
          : await ctx.db.query("adminVenueReadModels").withIndex("by_accountId_and_hasOpenAction_and_normalizedVenueName", q => q.eq("accountId", args.accountId!).eq("hasOpenAction", true)).paginate(options)
        : sort === "urgency"
          ? await ctx.db.query("adminVenueReadModels").withIndex("by_hasOpenAction_and_urgencyRank_and_normalizedVenueName", q => q.eq("hasOpenAction", true)).paginate(options)
          : await ctx.db.query("adminVenueReadModels").withIndex("by_hasOpenAction_and_normalizedVenueName", q => q.eq("hasOpenAction", true)).paginate(options)
      : filter === "active"
        ? args.accountId
          ? sort === "urgency"
            ? await ctx.db.query("adminVenueReadModels").withIndex("by_account_status_urgency_name", q => q.eq("accountId", args.accountId!).eq("clientStatus", "active")).paginate(options)
            : await ctx.db.query("adminVenueReadModels").withIndex("by_accountId_and_clientStatus_and_normalizedVenueName", q => q.eq("accountId", args.accountId!).eq("clientStatus", "active")).paginate(options)
          : sort === "urgency"
            ? await ctx.db.query("adminVenueReadModels").withIndex("by_clientStatus_and_urgencyRank_and_normalizedVenueName", q => q.eq("clientStatus", "active")).paginate(options)
            : await ctx.db.query("adminVenueReadModels").withIndex("by_clientStatus_and_normalizedVenueName", q => q.eq("clientStatus", "active")).paginate(options)
        : args.accountId
          ? sort === "urgency"
            ? await ctx.db.query("adminVenueReadModels").withIndex("by_accountId_and_urgencyRank_and_normalizedVenueName", q => q.eq("accountId", args.accountId!)).paginate(options)
            : await ctx.db.query("adminVenueReadModels").withIndex("by_accountId_and_normalizedVenueName", q => q.eq("accountId", args.accountId!)).paginate(options)
          : sort === "urgency"
            ? await ctx.db.query("adminVenueReadModels").withIndex("by_urgencyRank_and_normalizedVenueName").paginate(options)
            : await ctx.db.query("adminVenueReadModels").withIndex("by_normalizedVenueName").paginate(options);
    return { ...result, page: result.page.map(venueView) };
  },
});

export const getProduct = query({
  args: { ...scope, productId: v.id("physicalProducts") },
  returns: productDetail,
  handler: readProduct,
});

/** Selected-product drawer read: one bounded detail, never list-row fan-out. */
export const getProductDetail = query({
  args: { ...scope, productId: v.id("physicalProducts") },
  returns: productDetailWithContext,
  handler: async (ctx, args) => {
    const detail = await readProduct(ctx, args);
    const [account, business] = await Promise.all([ctx.db.get(args.accountId), ctx.db.get(args.businessId)]);
    if (!account || !business || business.accountId !== account._id) throw new ConvexError("access_cross_account_venue");
    return {
      ...detail,
      context: { accountName: account.name, smkCode: account.smkCode ?? null, venueName: business.name, smlCode: business.smlCode ?? null, city: business.city ?? null },
    };
  },
});

/** Active, in-venue destination ids for the existing retarget contract. */
export const listDestinationProfiles = query({
  args: scope,
  returns: v.object({
    profiles: v.array(v.object({ profileId: v.id("serviceProfiles"), type: serviceTypeValidator })),
    isComplete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const profiles = await ctx.db.query("serviceProfiles")
      .withIndex("by_businessId_and_status_and_type", q => q.eq("businessId", args.businessId).eq("status", "active"))
      .take(50);
    return {
      profiles: profiles.map(profile => ({ profileId: profile._id, type: profile.type })),
      isComplete: profiles.length < 50,
    };
  },
});

/** Thin selected-venue summary; an incomplete legacy projection is explicit. */
export const getVenueProductSummary = query({
  args: scope,
  returns: v.object({
    productCount: v.union(v.number(), v.null()), qrCount: v.union(v.number(), v.null()), nfcCount: v.union(v.number(), v.null()),
    activeChannelCount: v.union(v.number(), v.null()), problemChannelCount: v.union(v.number(), v.null()),
    smfPrefix: v.union(v.string(), v.null()), firstSuffix: v.union(v.string(), v.null()), lastSuffix: v.union(v.string(), v.null()),
    isComplete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const rows = await ctx.db.query("productInventory").withIndex("by_businessId_and_smfCode", q => q.eq("businessId", args.businessId)).take(250);
    const isComplete = rows.length < 250 && rows.every((row) => row.qrCount !== undefined && row.nfcCount !== undefined && row.activeChannelCount !== undefined && row.problemChannelCount !== undefined);
    if (!isComplete) return { productCount: null, qrCount: null, nfcCount: null, activeChannelCount: null, problemChannelCount: null, smfPrefix: null, firstSuffix: null, lastSuffix: null, isComplete: false };
    const ordered = rows.toSorted((left, right) => left.localSuffix.localeCompare(right.localSuffix));
    return {
      productCount: rows.length,
      qrCount: rows.reduce((sum, row) => sum + row.qrCount!, 0),
      nfcCount: rows.reduce((sum, row) => sum + row.nfcCount!, 0),
      activeChannelCount: rows.reduce((sum, row) => sum + row.activeChannelCount!, 0),
      problemChannelCount: rows.reduce((sum, row) => sum + row.problemChannelCount!, 0),
      smfPrefix: rows.length ? "SMF-" : null,
      firstSuffix: ordered[0]?.localSuffix ?? null,
      lastSuffix: ordered.at(-1)?.localSuffix ?? null,
      isComplete: true,
    };
  },
});

/** Global QR technical drawer with context for digital and physical records. */
export const getChannelDetail = query({
  args: { channelId: v.id("accessChannels") },
  returns: channelDetail,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    const [subject, product, digitalQr, account, business] = await Promise.all([
      ctx.db.get(channel.subjectId),
      channel.physicalProductId ? ctx.db.get(channel.physicalProductId) : null,
      channel.digitalQrId ? ctx.db.get(channel.digitalQrId) : null,
      ctx.db.get(channel.accountId),
      ctx.db.get(channel.businessId),
    ]);
    if (!subject || !account || !business || business.accountId !== account._id) throw new ConvexError("access_cross_account_venue");
    const originalSubject = digitalQr ? await ctx.db.get(digitalQr.originalSubjectId) : null;
    return {
      channel, subject, originalSubject, product, digitalQr,
      context: { accountName: account.name, smkCode: account.smkCode ?? null, venueName: business.name, smlCode: business.smlCode ?? null, city: business.city ?? null },
    };
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
