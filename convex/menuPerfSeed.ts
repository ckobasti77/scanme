import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  cleanupGenerationBatch,
  deletePublishedRows,
  insertPublishedRows,
} from "./menu";
import { DEFAULT_MENU_DESIGN } from "../lib/design-engine/menu-tokens";
import { countMenuRows, menuModelToRows } from "../lib/menu-rows";
import type { MenuGroup, MenuGroupShape, MenuItem, MenuModel } from "../lib/menu-blocks";

// =============================================================================
// TASK-60 — perf/seed tooling for docs/perf/menu-first-paint.md and
// docs/perf/menu-publish-ceiling.md. An OPERATOR tool, never part of
// `npm run check`, mirroring scripts/load + convex/memoriesLoadSeed.ts and
// convex/venueDevSeed.ts: internal-only (deploy-key `npx convex run`),
// throwaway businesses under fixed slugs, idempotent provisioning.
//
// The publish-ceiling measurement (RFC-003 §4 TASK-60) needs to run the EXACT
// transaction `publishDraft` runs (delete-then-insert across the six §2.13
// tables) at 100/400/1000 items. `publishDraft` itself is a public mutation
// gated by `requireBusinessAccess` (convex/lib/access.ts — off limits per the
// task preamble), which needs a real authenticated editor session that a
// deploy-key script does not have. Rather than reimplementing publish's body
// (which would measure a fiction, not the real code), this module calls the
// exact same exported helpers `deletePublishedRows` / `insertPublishedRows`
// convex/menu.ts uses, inside one mutation — identical database operations,
// identical transaction, only the auth check removed. `access.ts` is
// untouched; `menu.ts` only had two functions marked `export`.
// =============================================================================

const CEILING_PREFIX = "menu-perf-ceiling";
const GEN_PREFIX = "menu-perf-gen"; // TASK-60c generation-model businesses (fresh, own rows)
const FIRST_PAINT_BASIC_SLUG = "menu-perf-fp-basic";
const FIRST_PAINT_PREMIUM_SLUG = "menu-perf-fp-premium";

// A well-known minimal valid 1x1 red PNG (68 bytes) — same placeholder-image
// technique as convex/venueDevSeed.ts's VENUE_DEMO_IMAGE_PNG_BASE64. Content
// doesn't matter for a first-paint measurement (§2.12: images are not
// render-blocking, only the SSR HTML is), only that it is a real, decodable
// storage object so the render path (menuStorageUrl / next/image) is genuine.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ---------------------------------------------------------------------------
// Provisioning — idempotent by slug, mirrors venueDevSeed / memoriesLoadSeed.
// ---------------------------------------------------------------------------

async function ensureMenuBusiness(
  ctx: MutationCtx,
  args: { slug: string; name: string; plan: "basic" | "premium" },
): Promise<{ menuId: Id<"menus">; businessId: Id<"businesses">; created: boolean }> {
  const now = Date.now();
  const existingBusiness = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .unique();

  if (existingBusiness) {
    const existingMenu = await ctx.db
      .query("menus")
      .withIndex("by_businessId", (q) => q.eq("businessId", existingBusiness._id))
      .first();
    if (existingMenu) {
      return { menuId: existingMenu._id, businessId: existingBusiness._id, created: false };
    }
    const menuId = await ctx.db.insert("menus", {
      businessId: existingBusiness._id,
      status: "draft",
      design: null,
      draftRevision: 0,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      createdAt: now,
      updatedAt: now,
    });
    return { menuId, businessId: existingBusiness._id, created: true };
  }

  const accountId = await ctx.db.insert("accounts", {
    name: args.name,
    plan: args.plan,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const businessId = await ctx.db.insert("businesses", {
    name: args.name,
    slug: args.slug,
    status: "demo",
    accountId,
    createdAt: now,
  });
  const menuId = await ctx.db.insert("menus", {
    businessId,
    status: "draft",
    design: null,
    draftModel: undefined,
    draftRevision: 0,
    publishedRevision: 0,
    hasUnpublishedChanges: false,
    createdAt: now,
    updatedAt: now,
  });
  return { menuId, businessId, created: true };
}

export const provision = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    plan: v.union(v.literal("basic"), v.literal("premium")),
  },
  handler: async (ctx, args) => ensureMenuBusiness(ctx, args),
});

export const storePlaceholderImage = internalAction({
  args: {},
  handler: async (ctx): Promise<Id<"_storage">> => {
    const bytes = Uint8Array.from(atob(PLACEHOLDER_PNG_BASE64), (c) => c.charCodeAt(0));
    return await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
  },
});

// ---------------------------------------------------------------------------
// A synthetic MenuModel — pure, no Convex — generated at the requested size.
// Items are spread evenly across `groupCount` groups; every item carries
// `variantsPerItem` variants (variants are the row multiplier the RFC calls
// out — §4 TASK-60). No pairings: the RFC's own note is variants-only.
// ---------------------------------------------------------------------------

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

const FIRST_PAINT_SHAPES: MenuGroupShape[] = [
  "lista",
  "galerija",
  "traka",
  "istaknuto",
  "tabela_varijanti",
];

function makeItem(
  index: number,
  variantsPerItem: number,
  photoStorageId: string | undefined,
): MenuItem {
  return {
    id: nextId("item"),
    name: `Stavka ${index}`,
    description: "Test stavka za merenje performansi.",
    productType: "jelo",
    priceRsd: 500 + (index % 20) * 50,
    available: true,
    photoStorageId,
    variants: Array.from({ length: variantsPerItem }, (_, v) => ({
      id: nextId("variant"),
      label: v === 0 ? "0.3 l" : v === 1 ? "0.5 l" : `Varijanta ${v + 1}`,
      priceRsd: 100 * (v + 1),
    })),
    pairings: [],
  };
}

function makeGroup(shape: MenuGroupShape, title: string, items: MenuItem[]): MenuGroup {
  const base = { id: nextId("group"), title };
  switch (shape) {
    case "lista":
    case "galerija":
    case "traka":
    case "istaknuto":
    case "tabela_varijanti":
      return { shape, base, items };
  }
}

// Uniform shape (all "lista") — shape has no bearing on row count, and the
// ceiling measurement only cares about groups/items/variants row totals.
function generateCeilingModel(
  itemCount: number,
  variantsPerItem: number,
  groupCount: number,
): MenuModel {
  const perGroup = Math.ceil(itemCount / groupCount);
  const groups: MenuGroup[] = [];
  let remaining = itemCount;
  for (let g = 0; g < groupCount && remaining > 0; g += 1) {
    const take = Math.min(perGroup, remaining);
    const items: MenuItem[] = [];
    for (let i = 0; i < take; i += 1) {
      items.push(makeItem(itemCount - remaining + i, variantsPerItem, undefined));
    }
    groups.push(makeGroup("lista", `Grupa ${g + 1}`, items));
    remaining -= take;
  }
  return { groups, dayparts: [] };
}

// One group per shape, a realistic small menu (RFC-003 §2.12's target page).
function generateFirstPaintModel(
  itemsPerGroup: number,
  photoStorageId: string | undefined,
): MenuModel {
  let itemIndex = 0;
  const groupTitles: Record<MenuGroupShape, string> = {
    lista: "Predjela",
    galerija: "Glavna jela",
    traka: "Pića",
    istaknuto: "Preporuka kuće",
    tabela_varijanti: "Pivo i sokovi",
  };
  const groups = FIRST_PAINT_SHAPES.map((shape) => {
    const count = shape === "istaknuto" ? Math.min(2, itemsPerGroup) : itemsPerGroup;
    const items: MenuItem[] = [];
    for (let i = 0; i < count; i += 1) {
      itemIndex += 1;
      const withVariants = shape === "tabela_varijanti" ? 2 : 0;
      items.push(makeItem(itemIndex, withVariants, photoStorageId));
    }
    return makeGroup(shape, groupTitles[shape], items);
  });
  return { groups, dayparts: [] };
}

// ---------------------------------------------------------------------------
// The measured write — identical transaction to publishDraft's body.
// ---------------------------------------------------------------------------

export const publishCeilingSize = internalMutation({
  args: {
    menuId: v.id("menus"),
    itemCount: v.number(),
    variantsPerItem: v.number(),
    groupCount: v.number(),
  },
  handler: async (ctx, args) => {
    const model = generateCeilingModel(args.itemCount, args.variantsPerItem, args.groupCount);
    const rows = menuModelToRows(model, args.menuId);
    const rowCount = countMenuRows(rows);

    const t0 = Date.now();
    await deletePublishedRows(ctx, args.menuId);
    await insertPublishedRows(ctx, args.menuId, model);
    const elapsedMs = Date.now() - t0;

    const now = Date.now();
    await ctx.db.patch(args.menuId, {
      status: "published",
      design: null,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      publishedAt: now,
      updatedAt: now,
    });

    const metrics = await ctx.meta.getTransactionMetrics();
    return {
      rowCount,
      groups: rows.groups.length,
      items: rows.items.length,
      variants: rows.variants.length,
      elapsedMs,
      metrics: {
        documentsWritten: metrics.documentsWritten,
        bytesWritten: metrics.bytesWritten,
        documentsRead: metrics.documentsRead,
        bytesRead: metrics.bytesRead,
        databaseQueries: metrics.databaseQueries,
      },
    };
  },
});

export const publishFirstPaintMenu = internalMutation({
  args: {
    menuId: v.id("menus"),
    itemsPerGroup: v.number(),
    photoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const model = generateFirstPaintModel(args.itemsPerGroup, args.photoStorageId);
    await deletePublishedRows(ctx, args.menuId);
    await insertPublishedRows(ctx, args.menuId, model);
    const now = Date.now();
    await ctx.db.patch(args.menuId, {
      status: "published",
      design: null,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      publishedAt: now,
      updatedAt: now,
    });
    return { groups: model.groups.length };
  },
});

// ---------------------------------------------------------------------------
// TASK-60c — the GENERATION-model measurement. Mirrors the NEW publishDraft body
// (write a fresh generation N+1, flip publishedGeneration, NO delete), so a
// republish costs what a fresh publish costs — proving the republish
// databaseQueries no longer climbs toward the 4096 ceiling that crashed the old
// delete-then-insert at ~850 items. Cleanup is measured separately, one batch
// per transaction, and driven to completion by the seed action.
// ---------------------------------------------------------------------------

export const publishCeilingGeneration = internalMutation({
  args: {
    menuId: v.id("menus"),
    itemCount: v.number(),
    variantsPerItem: v.number(),
    groupCount: v.number(),
  },
  handler: async (ctx, args) => {
    const model = generateCeilingModel(args.itemCount, args.variantsPerItem, args.groupCount);
    const rows = menuModelToRows(model, args.menuId);
    const rowCount = countMenuRows(rows);

    const menu = await ctx.db.get(args.menuId);
    const nextGeneration = (menu?.publishedGeneration ?? 0) + 1;

    const t0 = Date.now();
    // The NEW publish path: insert a fresh generation, NO deletePublishedRows.
    await insertPublishedRows(ctx, args.menuId, model, nextGeneration);
    const elapsedMs = Date.now() - t0;

    const now = Date.now();
    await ctx.db.patch(args.menuId, {
      status: "published",
      design: null,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      publishedAt: now,
      publishedGeneration: nextGeneration,
      pendingCleanup: true,
      pendingCleanupSince: now,
      updatedAt: now,
    });

    const metrics = await ctx.meta.getTransactionMetrics();
    return {
      generation: nextGeneration,
      rowCount,
      groups: rows.groups.length,
      items: rows.items.length,
      variants: rows.variants.length,
      elapsedMs,
      metrics: {
        documentsWritten: metrics.documentsWritten,
        bytesWritten: metrics.bytesWritten,
        documentsRead: metrics.documentsRead,
        bytesRead: metrics.bytesRead,
        databaseQueries: metrics.databaseQueries,
      },
    };
  },
});

// One cleanup batch as its own transaction, so getTransactionMetrics reports
// the per-batch deletion cost. Uses the SAME exported cleanupGenerationBatch the
// production cleanupOldGenerations continuation uses.
export const cleanupCeilingBatch = internalMutation({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    if (!menu || menu.publishedGeneration === undefined) {
      return { done: true, deletedItems: 0, metrics: null };
    }
    const { deletedItems, more } = await cleanupGenerationBatch(
      ctx,
      args.menuId,
      menu.publishedGeneration,
    );
    if (!more) await ctx.db.patch(args.menuId, { pendingCleanup: false });
    const metrics = await ctx.meta.getTransactionMetrics();
    return {
      done: !more,
      deletedItems,
      metrics: {
        documentsReadUsed: metrics.documentsRead.used,
        databaseQueriesUsed: metrics.databaseQueries.used,
      },
    };
  },
});

// Verification: how many rows sit at the live generation vs below it (old,
// awaiting/after cleanup). After cleanup completes, `old*` must all be 0.
export const countGenerationRows = internalQuery({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    const liveGen = menu?.publishedGeneration;
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_menuId", (q) => q.eq("menuId", args.menuId))
      .collect();
    const groups = await ctx.db
      .query("menuGroups")
      .withIndex("by_menuId_and_order", (q) => q.eq("menuId", args.menuId))
      .collect();
    const dayparts = await ctx.db
      .query("menuDayparts")
      .withIndex("by_menuId_and_order", (q) => q.eq("menuId", args.menuId))
      .collect();
    const below = (g: number | undefined) =>
      liveGen !== undefined && (g ?? -1) < liveGen;
    return {
      liveGeneration: liveGen ?? null,
      currentItems: items.filter((r) => r.publishGeneration === liveGen).length,
      currentGroups: groups.filter((r) => r.publishGeneration === liveGen).length,
      currentDayparts: dayparts.filter((r) => r.publishGeneration === liveGen).length,
      oldItems: items.filter((r) => below(r.publishGeneration)).length,
      oldGroups: groups.filter((r) => below(r.publishGeneration)).length,
      oldDayparts: dayparts.filter((r) => below(r.publishGeneration)).length,
    };
  },
});

// ---------------------------------------------------------------------------
// Entry points — `npx convex run menuPerfSeed:<name> '{...}'`
// ---------------------------------------------------------------------------

// One throwaway business + menu per ceiling size, so each publish's DELETE
// half starts from zero rows — a rerun of a smaller size never pollutes a
// larger size's measured transaction cost.
export const seedCeiling = internalAction({
  args: { itemCount: v.number(), variantsPerItem: v.optional(v.number()), groupCount: v.optional(v.number()) },
  handler: async (ctx, args): Promise<unknown> => {
    const slug = `${CEILING_PREFIX}-${args.itemCount}`;
    const { menuId } = await ctx.runMutation(internal.menuPerfSeed.provision, {
      slug,
      name: `Menu perf ceiling ${args.itemCount}`,
      plan: "premium",
    });
    return await ctx.runMutation(internal.menuPerfSeed.publishCeilingSize, {
      menuId,
      itemCount: args.itemCount,
      variantsPerItem: args.variantsPerItem ?? 2,
      groupCount: args.groupCount ?? Math.max(1, Math.ceil(args.itemCount / 50)),
    });
  },
});

// TASK-60c — the generation-model measurement, end to end on the real
// deployment: a fresh throwaway business, publish (gen 1), REPUBLISH (gen 2 —
// the case the old delete-then-insert crashed on), then drive cleanup to
// completion and confirm no old rows survive. `fresh` and `republish` metrics
// should be ~identical (no delete cost); `cleanup.maxQueriesPerBatch` shows the
// off-critical-path cost stays far under 4096; `rowsAfterCleanup.old*` must be 0.
//   npx convex run menuPerfSeed:seedCeilingGeneration '{"itemCount":1000}'
export const seedCeilingGeneration = internalAction({
  args: { itemCount: v.number(), variantsPerItem: v.optional(v.number()), groupCount: v.optional(v.number()) },
  handler: async (ctx, args): Promise<unknown> => {
    const slug = `${GEN_PREFIX}-${args.itemCount}`;
    const { menuId } = await ctx.runMutation(internal.menuPerfSeed.provision, {
      slug,
      name: `Menu perf gen ${args.itemCount}`,
      plan: "premium",
    });
    const variantsPerItem = args.variantsPerItem ?? 2;
    const groupCount = args.groupCount ?? Math.max(1, Math.ceil(args.itemCount / 50));

    const fresh = await ctx.runMutation(internal.menuPerfSeed.publishCeilingGeneration, {
      menuId,
      itemCount: args.itemCount,
      variantsPerItem,
      groupCount,
    });
    const republish = await ctx.runMutation(internal.menuPerfSeed.publishCeilingGeneration, {
      menuId,
      itemCount: args.itemCount,
      variantsPerItem,
      groupCount,
    });

    let batches = 0;
    let totalDeletedItems = 0;
    let maxQueriesPerBatch = 0;
    let done = false;
    while (!done) {
      const r: {
        done: boolean;
        deletedItems: number;
        metrics: { documentsReadUsed: number; databaseQueriesUsed: number } | null;
      } = await ctx.runMutation(internal.menuPerfSeed.cleanupCeilingBatch, { menuId });
      batches += 1;
      totalDeletedItems += r.deletedItems;
      if (r.metrics) maxQueriesPerBatch = Math.max(maxQueriesPerBatch, r.metrics.databaseQueriesUsed);
      done = r.done;
      if (batches > 10000) break; // safety valve
    }

    const rowsAfterCleanup = await ctx.runQuery(internal.menuPerfSeed.countGenerationRows, { menuId });
    return {
      fresh,
      republish,
      cleanup: { batches, totalDeletedItems, maxQueriesPerBatch },
      rowsAfterCleanup,
    };
  },
});

export const seedFirstPaint = internalAction({
  args: {},
  handler: async (ctx): Promise<{ basicSlug: string; premiumSlug: string }> => {
    const basic = await ctx.runMutation(internal.menuPerfSeed.provision, {
      slug: FIRST_PAINT_BASIC_SLUG,
      name: "Menu perf — Basic (bez fotografija)",
      plan: "basic",
    });
    await ctx.runMutation(internal.menuPerfSeed.publishFirstPaintMenu, {
      menuId: basic.menuId,
      itemsPerGroup: 7,
    });

    const premium = await ctx.runMutation(internal.menuPerfSeed.provision, {
      slug: FIRST_PAINT_PREMIUM_SLUG,
      name: "Menu perf — Premium (sa fotografijama)",
      plan: "premium",
    });
    const photoStorageId = await ctx.runAction(internal.menuPerfSeed.storePlaceholderImage, {});
    await ctx.runMutation(internal.menuPerfSeed.publishFirstPaintMenu, {
      menuId: premium.menuId,
      itemsPerGroup: 7,
      photoStorageId,
    });

    return { basicSlug: FIRST_PAINT_BASIC_SLUG, premiumSlug: FIRST_PAINT_PREMIUM_SLUG };
  },
});

// TASK-60b — QA-only accent-colour sample (RFC-003 §4). Contrast is graded on
// the ACTUAL compiled `--menu-*` tokens (accentText/onAccent), so this seeds a
// real published menu with a caller-supplied accent on the live `/{slug}/meni`
// page: no other way exists to reach a non-default design without an
// authenticated editor session (out of scope here, same reasoning as this
// file's header). Colours only — every other design field stays the default.
export const publishAccentSample = internalAction({
  args: { slug: v.string(), accent: v.string() },
  handler: async (ctx, args): Promise<{ slug: string }> => {
    const { menuId } = await ctx.runMutation(internal.menuPerfSeed.provision, {
      slug: args.slug,
      name: `Menu perf accent — ${args.accent}`,
      plan: "basic",
    });
    await ctx.runMutation(internal.menuPerfSeed.publishFirstPaintMenu, {
      menuId,
      itemsPerGroup: 3,
    });
    await ctx.runMutation(internal.menuPerfSeed.setAccent, {
      menuId,
      accent: args.accent,
    });
    return { slug: args.slug };
  },
});

export const setAccent = internalMutation({
  args: { menuId: v.id("menus"), accent: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.menuId, {
      design: {
        ...DEFAULT_MENU_DESIGN,
        colors: {
          ...DEFAULT_MENU_DESIGN.colors,
          accent: args.accent,
          focus: args.accent,
          icon: args.accent,
        },
      },
    });
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const slugs = [
      FIRST_PAINT_BASIC_SLUG,
      FIRST_PAINT_PREMIUM_SLUG,
      `${CEILING_PREFIX}-100`,
      `${CEILING_PREFIX}-400`,
      `${CEILING_PREFIX}-1000`,
    ];
    const out: Record<string, { businessId: Id<"businesses">; menuStatus: string } | null> = {};
    for (const slug of slugs) {
      const business = await ctx.db
        .query("businesses")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!business) {
        out[slug] = null;
        continue;
      }
      const menu = await ctx.db
        .query("menus")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .first();
      out[slug] = { businessId: business._id, menuStatus: menu?.status ?? "none" };
    }
    return out;
  },
});
