import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { adminSearchSr } from "../lib/i18n/sr/admin-search";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { upsertContactReadModel } from "./lib/adminSearchProjection";
import {
  normalizeAdminDirectoryQuery,
  normalizeAdminEmail,
  normalizeAdminPhone,
} from "./lib/adminV1Validators";

const groupValidator = v.union(
  v.literal("clients"),
  v.literal("venues"),
  v.literal("contacts"),
  v.literal("products"),
  v.literal("channels"),
  v.literal("orders"),
);

type SearchGroup = "clients" | "venues" | "contacts" | "products" | "channels" | "orders";
type SearchResult = {
  id: string;
  group: SearchGroup;
  title: string;
  code: string | null;
  ownerLabel: string | null;
  smkCode: string | null;
  venueLabel: string | null;
  smlCode: string | null;
  meta: string | null;
  status: string | null;
  href: string;
};

const resultValidator = v.object({
  id: v.string(),
  group: groupValidator,
  title: v.string(),
  code: v.union(v.string(), v.null()),
  ownerLabel: v.union(v.string(), v.null()),
  smkCode: v.union(v.string(), v.null()),
  venueLabel: v.union(v.string(), v.null()),
  smlCode: v.union(v.string(), v.null()),
  meta: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  href: v.string(),
});

const previewGroupValidator = v.object({
  group: groupValidator,
  results: v.array(resultValidator),
  hasMore: v.boolean(),
});

const GROUPS: SearchGroup[] = ["clients", "venues", "contacts", "products", "channels", "orders"];
const MAX_TERM = 120;
const MAX_PAGE = 50;

function emptyPage(): PaginationResult<SearchResult> {
  return { page: [], continueCursor: "", isDone: true };
}

function singlePage(result: SearchResult | null, pagination: PaginationOptions): PaginationResult<SearchResult> {
  if (pagination.cursor !== null) return emptyPage();
  return { page: result ? [result] : [], continueCursor: "", isDone: true };
}

function mapPage<T>(page: PaginationResult<T>, mapper: (row: T) => SearchResult): PaginationResult<SearchResult> {
  return { ...page, page: page.page.map(mapper) };
}

function clientResult(row: Doc<"adminClientReadModels">): SearchResult {
  return {
    id: String(row.accountId), group: "clients", title: row.accountName, code: row.smkCode,
    ownerLabel: row.ownerDisplayName, smkCode: row.smkCode, venueLabel: row.firstVenueName,
    smlCode: null, meta: row.defaultContactEmail ?? row.defaultContactPhone,
    status: row.clientStatus, href: `/admin/klijenti/${row.accountId}`,
  };
}

function venueResult(row: Doc<"adminVenueReadModels">): SearchResult {
  return {
    id: String(row.businessId), group: "venues", title: row.venueName, code: row.smlCode,
    ownerLabel: row.ownerDisplayName, smkCode: row.smkCode, venueLabel: row.venueName,
    smlCode: row.smlCode, meta: row.city, status: row.clientStatus,
    href: `/admin/klijenti/${row.accountId}?section=venues&venue=${row.businessId}`,
  };
}

function contactResult(row: Doc<"adminContactReadModels">): SearchResult {
  return {
    id: String(row.contactId), group: "contacts", title: row.displayName, code: null,
    ownerLabel: row.accountName, smkCode: row.smkCode, venueLabel: null, smlCode: null,
    meta: row.normalizedEmail ?? row.normalizedPhone ?? row.positionTitle,
    status: row.status, href: `/admin/klijenti/${row.accountId}?contact=${row.contactId}`,
  };
}

function productResult(row: Doc<"adminProductReadModels">): SearchResult {
  return {
    id: row.sourceRecordId, group: "products", title: row.displayName, code: row.smfCode,
    ownerLabel: row.ownerDisplayName, smkCode: row.smkCode, venueLabel: row.venueName,
    smlCode: row.smlCode, meta: null, status: row.operationalStatus,
    href: `/admin/operativa/proizvodi?venue=${row.businessId}&product=${encodeURIComponent(row.sourceRecordId)}&smf=${encodeURIComponent(row.smfCode)}`,
  };
}

function channelResult(row: Doc<"accessChannels">): SearchResult {
  const code = row.smqCode ?? row.smfCode ?? row.resolverCode;
  return {
    id: String(row._id), group: "channels", title: row.kind === "nfc" ? adminSearchSr.channelNfc : adminSearchSr.channelQr,
    code, ownerLabel: row.accountName ?? null, smkCode: row.smkCode ?? null,
    venueLabel: row.venueName ?? null, smlCode: row.smlCode ?? null,
    meta: null, status: row.state,
    href: `/admin/operativa/qr?channel=${row._id}&code=${encodeURIComponent(code)}`,
  };
}

function orderResult(row: Doc<"orderOperations">): SearchResult {
  return {
    id: String(row.orderId), group: "orders", title: row.accountName, code: row.smpCode,
    ownerLabel: row.accountName, smkCode: row.smkCode,
    venueLabel: row.primaryBusinessName ?? null, smlCode: row.primarySmlCode ?? null,
    meta: row.assigneeName, status: row.view,
    href: `/admin/operativa/porudzbine?order=${row.orderId}`,
  };
}

async function validateScope(
  ctx: QueryCtx,
  accountId?: Id<"accounts">,
  businessId?: Id<"businesses">,
) {
  if (!businessId) return;
  const business = await ctx.db.get(businessId);
  if (!business || business.kind === "celebration" || (accountId && business.accountId !== accountId)) {
    throw new ConvexError("admin_search_scope_invalid");
  }
}

function exactCode(term: string, prefix: string) {
  const code = term.trim().toUpperCase();
  return code.startsWith(`${prefix}-`) ? code : null;
}

async function searchGroup(
  ctx: QueryCtx,
  group: SearchGroup,
  term: string,
  pagination: PaginationOptions,
  scope: { accountId?: Id<"accounts">; businessId?: Id<"businesses"> },
): Promise<PaginationResult<SearchResult>> {
  const normalized = normalizeAdminDirectoryQuery(term);
  if (!normalized) return emptyPage();

  if (group === "clients") {
    const code = exactCode(term, "SMK");
    if (code) {
      const account = await ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", code)).unique();
      const row = account ? await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).unique() : null;
      return singlePage(row ? clientResult(row) : null, pagination);
    }
    return mapPage(await ctx.db.query("adminClientReadModels").withSearchIndex("search_searchText", (q) => q.search("searchText", normalized)).paginate(pagination), clientResult);
  }

  if (group === "venues") {
    const code = exactCode(term, "SML");
    if (code) {
      const business = await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", code)).unique();
      if (!business || business.kind === "celebration") return singlePage(null, pagination);
      const row = await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", business._id)).unique();
      return singlePage(row ? venueResult(row) : null, pagination);
    }
    return mapPage(await ctx.db.query("adminVenueReadModels").withSearchIndex("search_searchText", (q) => q.search("searchText", normalized)).paginate(pagination), venueResult);
  }

  if (group === "contacts") {
    const email = term.includes("@") ? normalizeAdminEmail(term) : null;
    const phone = /^[+()\d\s./-]+$/.test(term.trim()) ? normalizeAdminPhone(term) : null;
    if (email) return mapPage(await ctx.db.query("adminContactReadModels").withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", email)).paginate(pagination), contactResult);
    if (phone && phone.length >= 3) return mapPage(await ctx.db.query("adminContactReadModels").withIndex("by_normalizedPhone", (q) => q.eq("normalizedPhone", phone)).paginate(pagination), contactResult);
    return mapPage(await ctx.db.query("adminContactReadModels").withSearchIndex("search_contacts", (q) => scope.accountId ? q.search("searchText", normalized).eq("accountId", scope.accountId) : q.search("searchText", normalized)).paginate(pagination), contactResult);
  }

  if (group === "products") {
    const code = exactCode(term, "SMF");
    if (code) {
      const product = await ctx.db.query("adminProductReadModels").withIndex("by_smfCode", (q) => q.eq("smfCode", code)).unique();
      return singlePage(product ? productResult(product) : null, pagination);
    }
    const suffixMatch = term.trim().match(/^#?(\d{3})$/);
    if (suffixMatch) {
      const suffix = suffixMatch[1];
      if (!scope.businessId && !scope.accountId) return emptyPage();
      return mapPage(
        scope.businessId
          ? await ctx.db.query("adminProductReadModels").withIndex("by_businessId_and_localSuffix", (q) => q.eq("businessId", scope.businessId!).eq("localSuffix", suffix)).paginate(pagination)
          : await ctx.db.query("adminProductReadModels").withIndex("by_accountId_and_localSuffix", (q) => q.eq("accountId", scope.accountId!).eq("localSuffix", suffix)).paginate(pagination),
        productResult,
      );
    }
    return mapPage(await ctx.db.query("adminProductReadModels").withSearchIndex("search_searchText", (q) => q.search("searchText", normalized)).paginate(pagination), productResult);
  }

  if (group === "channels") {
    const code = exactCode(term, "SMQ");
    if (code) {
      const digital = await ctx.db.query("digitalQrCodes").withIndex("by_smqCode", (q) => q.eq("smqCode", code)).unique();
      const channel = digital ? await ctx.db.get(digital.channelId) : null;
      return singlePage(channel ? channelResult(channel) : null, pagination);
    }
    return mapPage(await ctx.db.query("accessChannels").withSearchIndex("search_channels", (q) => {
      const match = q.search("searchText", normalized);
      return scope.businessId ? match.eq("businessId", scope.businessId) : scope.accountId ? match.eq("accountId", scope.accountId) : match;
    }).paginate(pagination), channelResult);
  }

  const code = exactCode(term, "SMP");
  if (code) {
    const order = await ctx.db.query("orderOperations").withIndex("by_smpCode", (q) => q.eq("smpCode", code)).unique();
    return singlePage(order ? orderResult(order) : null, pagination);
  }
  return mapPage(await ctx.db.query("orderOperations").withSearchIndex("search_orders", (q) => q.search("searchText", normalized)).paginate(pagination), orderResult);
}

function validateRequest(term: string, numItems: number) {
  if (term.length > MAX_TERM) throw new ConvexError("admin_search_term_too_long");
  if (numItems < 1 || numItems > MAX_PAGE) throw new ConvexError("admin_search_limit_invalid");
}

export const list = query({
  args: {
    term: v.string(),
    group: groupValidator,
    paginationOpts: paginationOptsValidator,
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
  },
  returns: paginationResultValidator(resultValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    validateRequest(args.term, args.paginationOpts.numItems);
    await validateScope(ctx, args.accountId, args.businessId);
    return searchGroup(ctx, args.group, args.term, args.paginationOpts, args);
  },
});

export const preview = query({
  args: {
    term: v.string(),
    limitPerGroup: v.number(),
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
  },
  returns: v.array(previewGroupValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isInteger(args.limitPerGroup) || args.limitPerGroup < 1 || args.limitPerGroup > 6) {
      throw new ConvexError("admin_search_preview_limit_invalid");
    }
    validateRequest(args.term, args.limitPerGroup);
    await validateScope(ctx, args.accountId, args.businessId);
    if (!args.term.trim()) return [];
    const groups = await Promise.all(GROUPS.map(async (group) => {
      const result = await searchGroup(ctx, group, args.term, { cursor: null, numItems: args.limitPerGroup }, args);
      return { group, results: result.page, hasMore: !result.isDone };
    }));
    return groups.filter((group) => group.results.length > 0);
  },
});

export const backfillContacts = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), examined: v.number(), written: v.number() }),
  handler: async (ctx: MutationCtx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
      throw new ConvexError("admin_search_backfill_limit_invalid");
    }
    const page = await ctx.db.query("accountContacts").paginate({ cursor: args.cursor ?? null, numItems: args.limit });
    let written = 0;
    if (!args.dryRun) {
      for (const contact of page.page) {
        const account = await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", contact.accountId)).unique();
        if (!account) continue;
        await upsertContactReadModel(ctx, contact._id);
        written += 1;
      }
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
  },
});

export const backfillProductSuffixes = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), examined: v.number(), written: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
      throw new ConvexError("admin_search_backfill_limit_invalid");
    }
    const page = await ctx.db.query("adminProductReadModels").paginate({ cursor: args.cursor ?? null, numItems: args.limit });
    let written = 0;
    if (!args.dryRun) {
      for (const product of page.page) {
        const localSuffix = product.smfCode.split("-").at(-1);
        if (!localSuffix || product.localSuffix === localSuffix) continue;
        await ctx.db.patch(product._id, { localSuffix });
        written += 1;
      }
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
  },
});
