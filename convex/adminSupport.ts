import { ConvexError, v } from "convex/values";
import { adminSearchSr } from "../lib/i18n/sr/admin-search";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";

type DbCtx = QueryCtx | MutationCtx;

function adminName(admin: Doc<"users">) {
  const name = typeof admin.name === "string" ? admin.name.trim() : "";
  const email = typeof admin.email === "string" ? admin.email.trim() : "";
  return name || email || adminSearchSr.unknownAdmin;
}

async function requireOwnedContext(
  ctx: DbCtx,
  contextId: Id<"adminDebugContexts">,
) {
  const admin = await requireAdmin(ctx);
  const context = await ctx.db.get(contextId);
  if (!context) throw new ConvexError("admin_debug_context_not_found");
  if (context.adminUserId !== admin._id) {
    throw new ConvexError("admin_debug_context_forbidden");
  }
  return { admin, context };
}

export const start = mutation({
  args: {
    accountId: v.id("accounts"),
    businessId: v.optional(v.id("businesses")),
  },
  returns: v.object({ contextId: v.id("adminDebugContexts") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const account = await ctx.db
      .query("adminClientReadModels")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .unique();
    if (!account) throw new ConvexError("admin_debug_account_not_found");
    if (args.businessId) {
      const business = await ctx.db.get(args.businessId);
      if (
        !business ||
        business.kind === "celebration" ||
        business.accountId !== args.accountId
      ) {
        throw new ConvexError("admin_debug_scope_mismatch");
      }
    }
    const now = Date.now();
    const contextId = await ctx.db.insert("adminDebugContexts", {
      adminUserId: admin._id,
      accountId: args.accountId,
      ...(args.businessId ? { businessId: args.businessId } : {}),
      state: "active",
      createdAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: args.accountId,
      ...(args.businessId ? { businessId: args.businessId } : {}),
      action: "admin_debug_entered",
      detail: { debugContextId: contextId },
      now,
    });
    return { contextId };
  },
});

export const exit = mutation({
  args: { contextId: v.id("adminDebugContexts") },
  returns: v.object({ state: v.literal("ended") }),
  handler: async (ctx, args) => {
    const { admin, context } = await requireOwnedContext(ctx, args.contextId);
    if (context.state === "ended") return { state: "ended" as const };
    const now = Date.now();
    await ctx.db.patch(context._id, { state: "ended", endedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: context.accountId,
      ...(context.businessId ? { businessId: context.businessId } : {}),
      action: "admin_debug_exited",
      detail: { debugContextId: context._id },
      now,
    });
    return { state: "ended" as const };
  },
});

const contextViewValidator = v.object({
  contextId: v.id("adminDebugContexts"),
  state: v.union(v.literal("active"), v.literal("ended")),
  accountId: v.id("accounts"),
  accountName: v.string(),
  smkCode: v.string(),
  clientStatus: v.union(v.literal("active"), v.literal("archived")),
  adminName: v.string(),
  businessId: v.union(v.id("businesses"), v.null()),
  venueName: v.union(v.string(), v.null()),
  smlCode: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

export const getContext = query({
  args: { contextId: v.id("adminDebugContexts") },
  returns: contextViewValidator,
  handler: async (ctx, args) => {
    const { admin, context } = await requireOwnedContext(ctx, args.contextId);
    const account = await ctx.db
      .query("adminClientReadModels")
      .withIndex("by_accountId", (q) => q.eq("accountId", context.accountId))
      .unique();
    if (!account) throw new ConvexError("admin_debug_account_not_found");
    const venue = context.businessId
      ? await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", context.businessId!)).unique()
      : null;
    return {
      contextId: context._id,
      state: context.state,
      accountId: account.accountId,
      accountName: account.accountName,
      smkCode: account.smkCode,
      clientStatus: account.clientStatus,
      adminName: adminName(admin),
      businessId: venue?.businessId ?? null,
      venueName: venue?.venueName ?? null,
      smlCode: venue?.smlCode ?? null,
      city: venue?.city ?? null,
      createdAt: context.createdAt,
    };
  },
});

const venueValidator = v.object({
  businessId: v.id("businesses"),
  venueName: v.string(),
  smlCode: v.string(),
  city: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("archived")),
  productCount: v.number(),
  channelCount: v.number(),
});

export const readOverview = query({
  args: { contextId: v.id("adminDebugContexts") },
  returns: v.object({
    ownerDisplayName: v.string(),
    defaultContactEmail: v.union(v.string(), v.null()),
    defaultContactPhone: v.union(v.string(), v.null()),
    venueCount: v.number(),
    venues: v.array(venueValidator),
    venuesCapped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { context } = await requireOwnedContext(ctx, args.contextId);
    if (context.state !== "active") throw new ConvexError("admin_debug_context_ended");
    const account = await ctx.db
      .query("adminClientReadModels")
      .withIndex("by_accountId", (q) => q.eq("accountId", context.accountId))
      .unique();
    if (!account) throw new ConvexError("admin_debug_account_not_found");
    const rows = context.businessId
      ? [await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", context.businessId!)).unique()].filter(Boolean) as Doc<"adminVenueReadModels">[]
      : await ctx.db.query("adminVenueReadModels").withIndex("by_accountId_and_normalizedVenueName", (q) => q.eq("accountId", context.accountId)).take(51);
    return {
      ownerDisplayName: account.ownerDisplayName,
      defaultContactEmail: account.defaultContactEmail,
      defaultContactPhone: account.defaultContactPhone,
      venueCount: account.venueCount,
      venues: rows.slice(0, 50).map((row) => ({
        businessId: row.businessId,
        venueName: row.venueName,
        smlCode: row.smlCode,
        city: row.city,
        status: row.clientStatus,
        productCount: row.productCount,
        channelCount: row.channelCount,
      })),
      venuesCapped: rows.length > 50,
    };
  },
});
