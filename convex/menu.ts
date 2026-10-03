import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireServiceEditorAccess } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { requireSlug } from "./lib/validation";
import { menuDesignValidator, menuModelValidator } from "./lib/menuValidators";
import {
  assertMenuGroup,
  clampMenu,
  type MenuModel,
} from "../lib/menu-blocks";
import { menuModelToRows, menuRowsToModel, type MenuRows } from "../lib/menu-rows";
import { countItems } from "../lib/menu-export/rows";
import {
  AVAILABILITY_CONFLICT_CODE,
  type AvailabilityConflictData,
  type AvailabilityConflictItem,
  type AvailabilityConflictMode,
} from "../lib/menu-publish";
import { daypartGroups, resolveEffectiveDaypart } from "../lib/menu-dayparts";
import { getDict } from "../lib/i18n";
import { menuPhotosEnabled, menuVideoEnabled } from "./lib/plans";
import { getEntitlement } from "./lib/entitlements";

// =============================================================================
// TASK-51 — the Menu editor backend: draft save, publish, uploads, the editor
// read model. FORKED from the editor slice of convex/venue.ts (RFC-003 §1.a):
// the same draft/published contract, the same OCC — `publishDraft` takes
// `expectedDraftRevision` and throws on mismatch; `saveDraft` bumps the
// revision and never guards (the Venue shape, not a second pattern).
//
// Persistence (BLOCKED TASK-51 §2): the DRAFT is the inline model
// (lib/menu-blocks.ts) stored on `menus.draftModel` + `draftDesign` — one
// document, one patch per autosave. The PUBLISHED menu is the six RFC-003
// §2.13 tables, written here through lib/menu-rows.ts on publish (replace all
// rows for the menu), so the public render (§4 TASK-52) reads rows and live
// `available` flags (§2.6) have a row to live on. `publishDraft` is the ONLY
// writer of those tables and of `menus.design/status/publishedAt`.
//
// Access (TASK-61, RFC-003 §1.c): the editor guard is now
// `requireServiceEditorAccess(profile, ["scanme_menu"])` — the shipped Venue
// shape (loadEventForEditor) — resolving the menu's `scanme_menu` serviceProfile
// first. access.ts is only CALLED, never edited.
// =============================================================================

const dict = getDict("menu-editor");

// The pure model types storage ids as `string`; the validator brands them
// `Id<"_storage">` (compile-time only). Cast at the boundary, as venue.ts does.
type StoredModel = NonNullable<Doc<"menus">["draftModel"]>;
const EMPTY_MODEL: MenuModel = { groups: [], dayparts: [] };
const asPureModel = (model: StoredModel | undefined): MenuModel =>
  (model ?? EMPTY_MODEL) as unknown as MenuModel;
const asStoredModel = (model: MenuModel): StoredModel =>
  model as unknown as StoredModel;

// Text bounds the validator does not carry (the model is pure data, and
// `clampMenu` bounds numbers only). Trim + cut; empty optional text ⇒ absent.
const TEXT_MAX = {
  groupTitle: 80,
  itemName: 120,
  itemDescription: 600,
  productType: 60,
  iconKey: 60,
  variantLabel: 40,
  daypartKey: 40,
  daypartLabel: 40,
} as const;

function cut(value: string, max: number) {
  return value.trim().slice(0, max);
}

function cutOptional(value: string | undefined, max: number) {
  if (value === undefined) return undefined;
  const text = cut(value, max);
  return text === "" ? undefined : text;
}

function normalizeModelText(model: MenuModel): MenuModel {
  return {
    ...model,
    groups: model.groups.map((group) => ({
      ...group,
      base: {
        ...group.base,
        title: cut(group.base.title, TEXT_MAX.groupTitle),
        iconKey: cutOptional(group.base.iconKey, TEXT_MAX.iconKey),
        daypartKey: cutOptional(group.base.daypartKey, TEXT_MAX.daypartKey),
      },
      items: group.items.map((item) => ({
        ...item,
        name: cut(item.name, TEXT_MAX.itemName),
        description: cutOptional(item.description, TEXT_MAX.itemDescription),
        productType: cut(item.productType, TEXT_MAX.productType),
        iconKey: cutOptional(item.iconKey, TEXT_MAX.iconKey),
        variants: item.variants.map((variant) => ({
          ...variant,
          label: cut(variant.label, TEXT_MAX.variantLabel),
        })),
      })),
    })),
    dayparts: model.dayparts.map((daypart) => ({
      ...daypart,
      key: cut(daypart.key, TEXT_MAX.daypartKey),
      label: cut(daypart.label, TEXT_MAX.daypartLabel),
    })),
    daypartOverride: cutOptional(model.daypartOverride, TEXT_MAX.daypartKey),
  };
}

// -----------------------------------------------------------------------------
// Shared loaders / gates
// -----------------------------------------------------------------------------

async function businessBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

// "The" menu of a business. The schema has no uniqueness on `by_businessId`
// (RFC-003 §2.13), so the editor picks deterministically: the oldest row.
// `createMenu` refuses a second one, so in practice there is at most one.
// Exported for the admin surfaces (convex/menuAdmin.ts, convex/menuExport.ts).
export async function menuForBusiness(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"menus"> | null> {
  const menus = await ctx.db
    .query("menus")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .take(20);
  let oldest: Doc<"menus"> | null = null;
  for (const menu of menus) {
    if (!oldest || menu.createdAt < oldest.createdAt) oldest = menu;
  }
  return oldest;
}

// The `scanme_menu` service profile of a business, if one is provisioned. Menu
// mirrors Venue: an admin grant (menuAdmin.grantMenu) creates it; the editor
// only reads it to enforce access.
async function menuProfileForBusiness(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"serviceProfiles"> | null> {
  return await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", "scanme_menu"),
    )
    .unique();
}

// The profile guarding a menu: its attached `serviceProfileId` when set, else
// the business's `scanme_menu` profile. The fallback makes the guard independent
// of when the backfill runs (TASK-61: serviceProfileId stayed optional).
async function menuEditorProfile(
  ctx: QueryCtx | MutationCtx,
  menu: Doc<"menus">,
): Promise<Doc<"serviceProfiles"> | null> {
  if (menu.serviceProfileId) {
    const profile = await ctx.db.get(menu.serviceProfileId);
    if (profile) return profile;
  }
  return await menuProfileForBusiness(ctx, menu.businessId);
}

// Load a menu enforcing editor access. Every editor write funnels through
// here so the access check can never be forgotten (the loadEventForEditor
// precedent). Exported for later Menu surfaces (TASK-54 live toggles, TASK-58).
export async function loadMenuForEditor(
  ctx: QueryCtx | MutationCtx,
  menuId: Id<"menus">,
) {
  const menu = await ctx.db.get(menuId);
  if (!menu) throw new ConvexError(dict.menuNotFound);
  const profile = await menuEditorProfile(ctx, menu);
  if (!profile) throw new ConvexError(dict.serviceNotProvisioned);
  const access = await requireServiceEditorAccess(ctx, profile, ["scanme_menu"]);
  const business = await ctx.db.get(menu.businessId);
  if (!business) throw new ConvexError(dict.businessNotFound);
  return { menu, business, profile, access };
}

// -----------------------------------------------------------------------------
// Signed media URLs (RFC-003 §3 Risk #4 — the shipped Venue pattern)
// -----------------------------------------------------------------------------

// The storage ids embedded in the draft: item photos (and videos, for the
// sheet). Bare ids have NO public URL — `/api/storage/{id}` without a
// signature is rejected — so the editor query ships this map and the render
// layer substitutes before any renderer runs (components/menu/menu-view.ts).
function collectItemStorageIds(model: MenuModel): string[] {
  const ids = new Set<string>();
  for (const group of model.groups) {
    for (const item of group.items) {
      if (item.photoStorageId) ids.add(item.photoStorageId);
      if (item.videoStorageId) ids.add(item.videoStorageId);
    }
  }
  return [...ids];
}

// storage-id → signed URL. A missing file is simply omitted; the renderer
// then shows the accent tile (§2.4) instead of a broken image.
async function resolveItemMediaUrls(
  ctx: QueryCtx | MutationCtx,
  model: MenuModel,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const id of collectItemStorageIds(model)) {
    const url = await ctx.storage.getUrl(id as Id<"_storage">);
    if (url) urls[id] = url;
  }
  return urls;
}

// -----------------------------------------------------------------------------
// The editor read model
// -----------------------------------------------------------------------------

export const editorBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await businessBySlug(ctx, requireSlug(args.slug));
    if (!business) return null;
    const profile = await menuProfileForBusiness(ctx, business._id);
    if (!profile) return null;
    let access;
    try {
      access = await requireServiceEditorAccess(ctx, profile, ["scanme_menu"]);
    } catch {
      // Access failure is a friendly screen, not a crash (the Venue shape).
      return null;
    }

    const menu = await menuForBusiness(ctx, business._id);

    // Brand source colours for the colour panel's palette derivation: the
    // Links config's stored palette when this business also runs Links — the
    // logo extraction already happened there. Empty otherwise; the
    // generator's deterministic fallback covers that. (Read-only: the Links
    // product is not touched.)
    let brandColors: string[] = [];
    const linksProfile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", business._id).eq("type", "scanme_links"),
      )
      .unique();
    if (linksProfile) {
      const linksConfig = await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", linksProfile._id),
        )
        .unique();
      brandColors = linksConfig?.draftPalette ?? [];
    }

    return {
      businessId: business._id,
      businessName: business.name,
      businessSlug: business.slug,
      editorRole: access.role,
      brandColors,
      menu: menu
        ? {
            id: menu._id,
            status: menu.status,
            draftModel: menu.draftModel ?? asStoredModel(EMPTY_MODEL),
            draftDesign: menu.draftDesign ?? null,
            // Same contract as the public view will use: the editor preview
            // renders the REAL template, so it needs the id → signed-URL map.
            blockImageUrls: await resolveItemMediaUrls(
              ctx,
              asPureModel(menu.draftModel),
            ),
            draftRevision: menu.draftRevision ?? 0,
            publishedRevision: menu.publishedRevision ?? 0,
            publishedAt: menu.publishedAt ?? null,
            hasUnpublishedChanges: menu.hasUnpublishedChanges ?? false,
          }
        : null,
    };
  },
});

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

// The first menu of a business. Refuses a second one; the draft starts empty
// and undesigned (the render clamps a null design to the engine default). The
// menu is bound to the business's `scanme_menu` profile — which the admin grant
// (menuAdmin.grantMenu) provisions — so the guard and the render share one
// ownership record (Venue's createEvent requires a venueProfileId the same way).
export const createMenu = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await businessBySlug(ctx, requireSlug(args.slug));
    if (!business) throw new ConvexError(dict.businessNotFound);
    const profile = await menuProfileForBusiness(ctx, business._id);
    if (!profile) throw new ConvexError(dict.serviceNotProvisioned);
    await requireServiceEditorAccess(ctx, profile, ["scanme_menu"]);
    const existing = await menuForBusiness(ctx, business._id);
    if (existing) throw new ConvexError(dict.menuAlreadyExists);
    const now = Date.now();
    const menuId = await ctx.db.insert("menus", {
      businessId: business._id,
      serviceProfileId: profile._id,
      status: "draft",
      design: null,
      draftModel: asStoredModel(EMPTY_MODEL),
      draftRevision: 0,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      createdAt: now,
      updatedAt: now,
    });
    return { menuId };
  },
});

// The ONE normalization every draft write goes through (never trusts client
// input): the one-shape-per-group rule via assertMenuGroup, bounds via
// clampMenu, text bounds here. Shared with the admin import (convex/menuAdmin.ts)
// so an admin-entered draft is byte-for-byte what the editor would have saved.
export function prepareDraftModel(model: MenuModel): MenuModel {
  for (const group of model.groups) assertMenuGroup(group);
  return clampMenu(normalizeModelText(model));
}

// Draft writer: normalizes on write (prepareDraftModel) — bumps
// `draftRevision`, sets the dirty flag. An omitted arg leaves that field
// unchanged. No OCC on save (the Venue contract): the revision only ever
// increments, and publish is what compares it.
export const saveDraft = mutation({
  args: {
    menuId: v.id("menus"),
    model: v.optional(menuModelValidator),
    design: v.optional(menuDesignValidator),
  },
  handler: async (ctx, args) => {
    const { menu } = await loadMenuForEditor(ctx, args.menuId);
    const now = Date.now();
    const draftRevision = (menu.draftRevision ?? 0) + 1;
    const patch: Partial<Doc<"menus">> = {
      hasUnpublishedChanges: true,
      draftRevision,
      updatedAt: now,
    };
    if (args.model !== undefined) {
      patch.draftModel = asStoredModel(prepareDraftModel(asPureModel(args.model)));
    }
    if (args.design !== undefined) {
      patch.draftDesign = args.design;
    }
    await ctx.db.patch(menu._id, patch);
    return { draftRevision, hasUnpublishedChanges: true };
  },
});

// Editor media uploads: item photos POST to a URL minted here. Gated through
// the same loadMenuForEditor funnel as every draft write, so an upload URL
// can never be minted without editor access.
export const generateEditorUploadUrl = mutation({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    await loadMenuForEditor(ctx, args.menuId);
    return await ctx.storage.generateUploadUrl();
  },
});

// Delete every published row of a menu — the five §2.13 child tables, through
// their own indexes. Bounded by the menu's own size.
// Exported (TASK-60, docs/perf/menu-publish-ceiling.md): the perf seed calls
// this and insertPublishedRows directly so it measures the SAME transaction
// publishDraft runs, without needing an authenticated editor session.
export async function deletePublishedRows(ctx: MutationCtx, menuId: Id<"menus">) {
  const items = await ctx.db
    .query("menuItems")
    .withIndex("by_menuId", (q) => q.eq("menuId", menuId))
    .collect();
  for (const item of items) {
    const variants = await ctx.db
      .query("itemVariants")
      .withIndex("by_itemId_and_order", (q) => q.eq("itemId", item._id))
      .collect();
    for (const variant of variants) await ctx.db.delete(variant._id);
    const pairings = await ctx.db
      .query("itemPairings")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .collect();
    for (const pairing of pairings) await ctx.db.delete(pairing._id);
    await ctx.db.delete(item._id);
  }
  const groups = await ctx.db
    .query("menuGroups")
    .withIndex("by_menuId_and_order", (q) => q.eq("menuId", menuId))
    .collect();
  for (const group of groups) await ctx.db.delete(group._id);
  const dayparts = await ctx.db
    .query("menuDayparts")
    .withIndex("by_menuId_and_order", (q) => q.eq("menuId", menuId))
    .collect();
  for (const daypart of dayparts) await ctx.db.delete(daypart._id);
}

// Insert the published rows from the draft through the ONE mapping module
// (lib/menu-rows.ts). Inline ids become real document ids in FK order —
// groups, then items (mapped groupId), then variants and pairings (mapped
// itemId / pairedItemId), then dayparts. A pairing whose target is not in
// this menu has no row id to reference and is skipped.
//
// TASK-60c: `generation` stamps `publishGeneration` on the three parent tables
// (groups/items/dayparts). itemVariants/itemPairings carry NO generation — they
// are reached only through their parent item's `_id`, and each generation mints
// fresh item ids, so reading them by a current-generation item id already
// scopes them to that generation. The param is OPTIONAL: the legacy perf path
// (convex/menuPerfSeed.ts) still calls without it to reproduce the pre-TASK-60c
// delete-then-insert numbers, and those rows are treated as generation-absent.
export async function insertPublishedRows(
  ctx: MutationCtx,
  menuId: Id<"menus">,
  model: MenuModel,
  generation?: number,
) {
  const rows = menuModelToRows(model, menuId);
  const now = Date.now();

  const groupIds = new Map<string, Id<"menuGroups">>();
  for (const row of rows.groups) {
    const id = await ctx.db.insert("menuGroups", {
      menuId,
      title: row.title,
      shape: row.shape,
      iconKey: row.iconKey,
      daypartKey: row.daypartKey,
      order: row.order,
      publishGeneration: generation,
      createdAt: now,
      updatedAt: now,
    });
    groupIds.set(row.id, id);
  }

  const itemIds = new Map<string, Id<"menuItems">>();
  for (const row of rows.items) {
    const groupId = groupIds.get(row.groupId);
    if (!groupId) continue;
    const id = await ctx.db.insert("menuItems", {
      menuId,
      groupId,
      // TASK-58: the inline draft id — the stable key across publishes.
      key: row.id,
      name: row.name,
      description: row.description,
      productType: row.productType,
      priceRsd: row.priceRsd,
      iconKey: row.iconKey,
      photoStorageId: row.photoStorageId as Id<"_storage"> | undefined,
      videoStorageId: row.videoStorageId as Id<"_storage"> | undefined,
      available: row.available,
      order: row.order,
      publishGeneration: generation,
      createdAt: now,
      updatedAt: now,
    });
    itemIds.set(row.id, id);
  }

  for (const row of rows.variants) {
    const itemId = itemIds.get(row.itemId);
    if (!itemId) continue;
    await ctx.db.insert("itemVariants", {
      itemId,
      label: row.label,
      priceRsd: row.priceRsd,
      order: row.order,
    });
  }

  for (const row of rows.pairings) {
    const itemId = itemIds.get(row.itemId);
    const pairedItemId = itemIds.get(row.pairedItemId);
    if (!itemId || !pairedItemId) continue;
    await ctx.db.insert("itemPairings", {
      itemId,
      pairedItemId,
      order: row.order,
    });
  }

  for (const row of rows.dayparts) {
    await ctx.db.insert("menuDayparts", {
      menuId,
      key: row.key,
      label: row.label,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      order: row.order,
      publishGeneration: generation,
    });
  }
}

// The ONLY writer of the published tables and of menus.design/status/
// publishedAt. Takes `expectedDraftRevision`, throws on mismatch (the client
// shows the "changed elsewhere" dialog on exactly this message).
//
// TASK-60c — generation-based publish (docs/perf/menu-publish-ceiling.md).
// Instead of deleting the old published rows (whose per-item variant/pairing
// lookups blew the 4096-databaseQueries ceiling on republish at ~850 items),
// this writes a FRESH generation N+1 and flips `menus.publishedGeneration` in
// the SAME transaction. Because nothing is deleted here, a republish costs
// exactly what a fresh publish costs (~0 database queries — insertPublishedRows
// reads nothing). The old generations are drained afterward by the
// cleanupOldGenerations scheduler continuation (guarded by the
// sweepStuckMenuCleanups cron reserve). The write + flip stay one atomic
// transaction so the guest never sees a partial menu (Convex snapshot
// isolation), and the public query's generation filter keeps N and N+1 from
// mixing while both physically coexist. `draftRevision` is not advanced.
//
// Concurrency: two racing publishes both read `menu.publishedGeneration`; the
// loser conflicts on this row's read+patch, rolls its inserts back, retries,
// and recomputes a higher `nextGen` — so generations stay unique and monotone.
//
// TASK-58 — the live "nema više" trap (RFC-003 §3 Risk 10). `setItemAvailable`
// patches the LIVE row and mirrors into the draft only when the draft is clean,
// so a publish from a stale draft (an editor open with unsaved edits, or a
// browser autosaving an in-memory document that predates the flip) would
// resurrect an item the floor took off. Before writing anything, publish reads
// the live generation's items ONCE (one indexed query, ≤ the menu's item
// count; plus one for the live groups) and matches draft items to live rows by
// the stable `key` (the inline draft id stamped by insertPublishedRows), falling
// back to group-title + name for rows without a key (published before TASK-58,
// or a menu the admin re-entered with fresh ids). A draft item that says
// `available: true` while its live row says `false` is a CONFLICT:
//   - no `onAvailabilityConflict` → throw AVAILABILITY_CONFLICT_CODE with the
//     item names, nothing written (the editor asks the owner);
//   - "keepLive"  → publish those items as `false` and mirror that into the
//     draft (no draftRevision bump), so the next publish does not re-ask;
//   - "overwrite" → publish the draft as-is (the owner's explicit choice).
// `draft false + live true` is NOT a conflict: the editor shows the switch
// off, so publishing `false` is what the owner sees. The alternative rule —
// "publish never touches `available`" — was rejected because the editor's own
// availability switch would become a dead control (an owner could never
// re-enable an item from the editor). BLOCKED TASK-58 records the choice.

export const availabilityConflictValidator = v.union(
  v.literal("keepLive"),
  v.literal("overwrite"),
);

export async function findAvailabilityConflicts(
  ctx: QueryCtx | MutationCtx,
  menu: Doc<"menus">,
  model: MenuModel,
): Promise<AvailabilityConflictItem[]> {
  if (menu.status !== "published") return [];
  const generation = menu.publishedGeneration;
  const liveItems = await ctx.db
    .query("menuItems")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menu._id).eq("publishGeneration", generation),
    )
    .collect();
  const off = liveItems.filter((row) => !row.available);
  if (off.length === 0) return [];

  const liveKeys = new Set<string>();
  for (const row of liveItems) if (row.key) liveKeys.add(row.key);
  const offByKey = new Set<string>();
  for (const row of off) if (row.key) offByKey.add(row.key);

  const liveGroups = await ctx.db
    .query("menuGroups")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menu._id).eq("publishGeneration", generation),
    )
    .collect();
  const groupTitle = new Map(liveGroups.map((g) => [g._id, g.title]));
  const place = (title: string, name: string) => `${title}\u0000${name}`;
  const offByPlace = new Set(
    off.map((row) => place(groupTitle.get(row.groupId) ?? "", row.name)),
  );

  const conflicts: AvailabilityConflictItem[] = [];
  for (const group of model.groups) {
    for (const item of group.items) {
      if (!item.available) continue;
      const byKey = offByKey.has(item.id);
      const byPlace =
        !liveKeys.has(item.id) && offByPlace.has(place(group.base.title, item.name));
      if (byKey || byPlace) conflicts.push({ key: item.id, name: item.name });
    }
  }
  return conflicts;
}

function forceUnavailable(model: MenuModel, keys: Set<string>): MenuModel {
  return {
    ...model,
    groups: model.groups.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        keys.has(item.id) ? { ...item, available: false } : item,
      ),
    })),
  };
}

export type PublishResult = {
  publishedAt: number;
  publishedRevision: number;
  generation: number;
  itemCount: number;
  keptUnavailable: AvailabilityConflictItem[];
};

// The ONE publish transaction, shared by the owner's `publishDraft` and the
// admin's `menuAdmin.publishForClient`. The caller has already loaded + gated
// the menu and (for the owner path) compared the draft revision.
export async function publishFromDraft(
  ctx: MutationCtx,
  menu: Doc<"menus">,
  options: { onAvailabilityConflict?: AvailabilityConflictMode },
): Promise<PublishResult> {
  let model = asPureModel(menu.draftModel);
  const conflicts = await findAvailabilityConflicts(ctx, menu, model);
  let keptUnavailable: AvailabilityConflictItem[] = [];
  if (conflicts.length > 0) {
    if (!options.onAvailabilityConflict) {
      const data: AvailabilityConflictData = {
        code: AVAILABILITY_CONFLICT_CODE,
        items: conflicts,
      };
      throw new ConvexError(data);
    }
    if (options.onAvailabilityConflict === "keepLive") {
      model = forceUnavailable(model, new Set(conflicts.map((c) => c.key)));
      keptUnavailable = conflicts;
    }
  }

  const draftRevision = menu.draftRevision ?? 0;
  const nextGeneration = (menu.publishedGeneration ?? 0) + 1;
  await insertPublishedRows(ctx, menu._id, model, nextGeneration);
  const now = Date.now();
  await ctx.db.patch(menu._id, {
    status: "published",
    design: menu.draftDesign ?? null,
    daypartOverride: model.daypartOverride,
    publishedRevision: draftRevision,
    hasUnpublishedChanges: false,
    publishedAt: now,
    publishedGeneration: nextGeneration,
    pendingCleanup: true,
    pendingCleanupSince: now,
    // keepLive: the draft now says what was published (the mirror rule of
    // setItemAvailable, same "no revision bump").
    ...(keptUnavailable.length > 0 ? { draftModel: asStoredModel(model) } : {}),
  });
  await ctx.scheduler.runAfter(0, internal.menu.cleanupOldGenerations, {
    menuId: menu._id,
  });
  return {
    publishedAt: now,
    publishedRevision: draftRevision,
    generation: nextGeneration,
    itemCount: countItems(model),
    keptUnavailable,
  };
}

export const publishDraft = mutation({
  args: {
    menuId: v.id("menus"),
    expectedDraftRevision: v.number(),
    onAvailabilityConflict: v.optional(availabilityConflictValidator),
  },
  handler: async (ctx, args) => {
    const { menu, business, access } = await loadMenuForEditor(ctx, args.menuId);
    const draftRevision = menu.draftRevision ?? 0;
    if (draftRevision !== args.expectedDraftRevision) {
      throw new ConvexError(dict.draftChanged);
    }
    const result = await publishFromDraft(ctx, menu, {
      onAvailabilityConflict: args.onAvailabilityConflict,
    });
    // TASK-58: an ADMIN publishing through the shared editor is us changing a
    // client's menu — the event that reaches guests leaves one audit row
    // (RFC-002 §2.6). Owner/member publishes write none; autosaves never do.
    if (access.role === "admin") {
      await writeAdminAudit(ctx, {
        actorUserId: access.user._id,
        ...(business.accountId ? { accountId: business.accountId } : {}),
        businessId: business._id,
        action: "publish_menu",
        detail: {
          menuId: menu._id,
          via: "editor",
          generation: result.generation,
          items: result.itemCount,
          keptUnavailable: result.keptUnavailable.map((item) => item.name),
        },
        now: result.publishedAt,
      });
    }
    return {
      publishedAt: result.publishedAt,
      publishedRevision: result.publishedRevision,
      keptUnavailable: result.keptUnavailable,
    };
  },
});

// TASK-60c — drain published rows of generations BELOW the live one, in bounded
// batches across scheduler continuations, OFF the publish critical path (the
// republish delete cost that crashed publish at ~850 items now happens here,
// where it can take as long as it needs and nobody waits). Items (with their
// variant/pairing children — the per-item query cost) are drained first in
// FK-safe order; only once no old item remains are the childless old groups and
// dayparts removed. The threshold is read LIVE from `menu.publishedGeneration`
// every invocation (NOT a captured arg): if a new publish lands mid-cleanup the
// threshold rises monotonically, so a single chain always targets "everything
// below live" and the single `pendingCleanup` flag stays sufficient — no
// intermediate generation is orphaned by a racing publish. `itemVariants` /
// `itemPairings` carry no generation; they are deleted through their old
// parent item's `_id`. Self-reschedules while work remains; clears
// `pendingCleanup` when fully drained. Lost continuations are recovered by the
// sweepStuckMenuCleanups cron (TASK-65 reserve shape).
const MENU_CLEANUP_BATCH = 200; // old items per continuation (2 child queries each)

// One bounded cleanup batch: delete up to MENU_CLEANUP_BATCH old-generation
// items (with their variants + pairings, in FK-safe order), and — only once no
// old item remains — up to MENU_CLEANUP_BATCH childless old groups and dayparts.
// Returns whether more work remains. No scheduling, no flag writes: the caller
// (cleanupOldGenerations) owns those. Exported so the perf harness
// (convex/menuPerfSeed.ts) can measure the real deletion transaction cost per
// batch. `liveGen` is the threshold — everything with publishGeneration below it
// (including generation-absent legacy rows, which sort lowest) is drained.
export async function cleanupGenerationBatch(
  ctx: MutationCtx,
  menuId: Id<"menus">,
  liveGen: number,
): Promise<{ deletedItems: number; more: boolean }> {
  const oldItems = await ctx.db
    .query("menuItems")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menuId).lt("publishGeneration", liveGen),
    )
    .take(MENU_CLEANUP_BATCH);
  for (const item of oldItems) {
    const variants = await ctx.db
      .query("itemVariants")
      .withIndex("by_itemId_and_order", (q) => q.eq("itemId", item._id))
      .collect();
    for (const variant of variants) await ctx.db.delete(variant._id);
    const pairings = await ctx.db
      .query("itemPairings")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .collect();
    for (const pairing of pairings) await ctx.db.delete(pairing._id);
    await ctx.db.delete(item._id);
  }
  if (oldItems.length === MENU_CLEANUP_BATCH) {
    return { deletedItems: oldItems.length, more: true };
  }

  // Items are gone; delete childless old groups + dayparts.
  const oldGroups = await ctx.db
    .query("menuGroups")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menuId).lt("publishGeneration", liveGen),
    )
    .take(MENU_CLEANUP_BATCH);
  for (const group of oldGroups) await ctx.db.delete(group._id);
  const oldDayparts = await ctx.db
    .query("menuDayparts")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menuId).lt("publishGeneration", liveGen),
    )
    .take(MENU_CLEANUP_BATCH);
  for (const daypart of oldDayparts) await ctx.db.delete(daypart._id);

  const more =
    oldGroups.length === MENU_CLEANUP_BATCH ||
    oldDayparts.length === MENU_CLEANUP_BATCH;
  return { deletedItems: oldItems.length, more };
}

export const cleanupOldGenerations = internalMutation({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    if (!menu || menu.pendingCleanup !== true) {
      return { done: true, deletedItems: 0 };
    }
    const liveGen = menu.publishedGeneration;
    if (liveGen === undefined) {
      // No live generation to clean below — clear the flag and stop.
      await ctx.db.patch(menu._id, { pendingCleanup: false });
      return { done: true, deletedItems: 0 };
    }

    const { deletedItems, more } = await cleanupGenerationBatch(
      ctx,
      args.menuId,
      liveGen,
    );
    if (more) {
      // Heartbeat (keeps a healthy chain out of the cron's stale range) + continue.
      await ctx.db.patch(menu._id, { pendingCleanupSince: Date.now() });
      await ctx.scheduler.runAfter(0, internal.menu.cleanupOldGenerations, {
        menuId: args.menuId,
      });
      return { done: false, deletedItems };
    }

    // Fully drained.
    await ctx.db.patch(menu._id, { pendingCleanup: false });
    return { done: true, deletedItems };
  },
});

// TASK-60c — cron reserve for a LOST cleanup continuation (obrazac TASK-65
// sweepStaleShifts). A healthy cleanup chain refreshes `pendingCleanupSince`
// each batch, so it stays out of this range; a menu whose scheduled
// continuation was dropped goes stale and is re-driven here. `eq(pendingCleanup,
// true)` leads the range (so absent/false rows can't leak in — the
// sweepOverdueRequests optional-field trap is avoided), and the heartbeat reset
// keeps a resumed menu from being swept again on the next tick.
const MENU_CLEANUP_STALE_MS = 2 * 60_000; // ~2 min of no progress ⇒ continuation lost
const MENU_CLEANUP_SWEEP_BATCH = 100;

export const sweepStuckMenuCleanups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const threshold = now - MENU_CLEANUP_STALE_MS;
    const stuck = await ctx.db
      .query("menus")
      .withIndex("by_pendingCleanup_and_pendingCleanupSince", (q) =>
        q.eq("pendingCleanup", true).lte("pendingCleanupSince", threshold),
      )
      .take(MENU_CLEANUP_SWEEP_BATCH);
    for (const menu of stuck) {
      await ctx.db.patch(menu._id, { pendingCleanupSince: now });
      await ctx.scheduler.runAfter(0, internal.menu.cleanupOldGenerations, {
        menuId: menu._id,
      });
    }
    return { resumed: stuck.length };
  },
});

// The live "nema više" toggle (§2.6, §4 TASK-54): flip ONE published item's
// `available` flag. Because the public query reads that field, the flip reaches
// every open phone through its subscription with NO reload — the moat, and the
// one thing a photographed-PDF menu cannot do. Owner auth via loadMenuForEditor
// (requireServiceEditorAccess; the Basic/Premium gate is TASK-55, not here).
//
// Mirrors the flag into the draft so the next publish does not revert it
// (BLOCKED TASK-51 §2b) — but ONLY when the draft is still byte-aligned with
// the published rows (no pending edits). Publish writes group/item `order` as
// the draftModel array indices, so those indices address the same item; a name
// check guards the positional hop. A diverged draft is the owner's in-progress
// work and is left untouched (the pending publish will set availability from
// it). draftRevision is NOT bumped: the live flip is invisible to the editor's
// publish OCC.
export const setItemAvailable = mutation({
  args: { itemId: v.id("menuItems"), available: v.boolean() },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError(dict.itemNotFound);
    const { menu } = await loadMenuForEditor(ctx, item.menuId);
    const now = Date.now();
    await ctx.db.patch(item._id, { available: args.available, updatedAt: now });

    if (menu.hasUnpublishedChanges === false && menu.draftModel) {
      const group = await ctx.db.get(item.groupId);
      if (group) {
        const draft = asPureModel(menu.draftModel);
        const draftItem = draft.groups[group.order]?.items[item.order];
        if (draftItem && draftItem.name === item.name) {
          draftItem.available = args.available;
          await ctx.db.patch(menu._id, {
            draftModel: asStoredModel(draft),
            updatedAt: now,
          });
        }
      }
    }
    return { available: args.available };
  },
});

// -----------------------------------------------------------------------------
// The public read model (TASK-52) — RFC-003 §2.6, §4
// -----------------------------------------------------------------------------

// Read the published rows of a menu (the five child tables) as the mapping
// module's MenuRows: `_id` becomes `id`, the foreign keys become the parent
// ids. `menuRowsToModel` re-sorts by `order`.
//
// TASK-60c: reads ONLY the given generation's rows. Because publishDraft no
// longer deletes old rows (it writes a fresh generation and flips
// `menus.publishedGeneration`), the tables hold N and N+1 side by side between a
// publish and its cleanup — so the generation filter on groups/items/dayparts
// is LOAD-BEARING for correctness, not an optimization: without it the guest
// would get a doubled menu. Variants/pairings need no generation filter — they
// are fetched per current-generation item id, and each generation mints fresh
// item ids, so only this generation's variants/pairings come back.
async function collectPublishedRows(
  ctx: QueryCtx,
  menuId: Id<"menus">,
  generation: number | undefined,
): Promise<MenuRows> {
  const groupDocs = await ctx.db
    .query("menuGroups")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menuId).eq("publishGeneration", generation),
    )
    .collect();
  const itemDocs = await ctx.db
    .query("menuItems")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menuId).eq("publishGeneration", generation),
    )
    .collect();

  const variantDocs: Doc<"itemVariants">[] = [];
  const pairingDocs: Doc<"itemPairings">[] = [];
  for (const item of itemDocs) {
    const variants = await ctx.db
      .query("itemVariants")
      .withIndex("by_itemId_and_order", (q) => q.eq("itemId", item._id))
      .collect();
    variantDocs.push(...variants);
    const pairings = await ctx.db
      .query("itemPairings")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .collect();
    pairingDocs.push(...pairings);
  }

  const daypartDocs = await ctx.db
    .query("menuDayparts")
    .withIndex("by_menuId_and_publishGeneration", (q) =>
      q.eq("menuId", menuId).eq("publishGeneration", generation),
    )
    .collect();

  return {
    groups: groupDocs.map((g) => ({
      id: g._id,
      menuId: g.menuId,
      title: g.title,
      shape: g.shape,
      iconKey: g.iconKey,
      daypartKey: g.daypartKey,
      order: g.order,
    })),
    items: itemDocs.map((i) => ({
      id: i._id,
      menuId: i.menuId,
      groupId: i.groupId,
      name: i.name,
      description: i.description,
      productType: i.productType,
      priceRsd: i.priceRsd,
      iconKey: i.iconKey,
      photoStorageId: i.photoStorageId,
      videoStorageId: i.videoStorageId,
      available: i.available,
      order: i.order,
    })),
    variants: variantDocs.map((variant) => ({
      id: variant._id,
      itemId: variant.itemId,
      label: variant.label,
      priceRsd: variant.priceRsd,
      order: variant.order,
    })),
    pairings: pairingDocs.map((pairing) => ({
      id: pairing._id,
      itemId: pairing.itemId,
      pairedItemId: pairing.pairedItemId,
      order: pairing.order,
    })),
    dayparts: daypartDocs.map((daypart) => ({
      id: daypart._id,
      menuId: daypart.menuId,
      key: daypart.key,
      label: daypart.label,
      startMinute: daypart.startMinute,
      endMinute: daypart.endMinute,
      order: daypart.order,
    })),
  };
}

// The public menu: PUBLISHED rows only (never the draft), assembled from the
// six §2.13 tables through the ONE mapping module (lib/menu-rows.ts) into the
// inline model the render layer consumes. No access gate — this is the guest
// page — but it returns null unless a menu exists AND was explicitly published
// (`status === "published"`): the "authority in the query" hiding layer while
// MENU_EXISTS is false (the route is also unlinked and noindexed). Being a
// query, it is a live subscription: an `available` toggle or a price edit
// patches every open phone (§2.6, the moat). Dayparts are carried but NOT
// filtered here (§2.5 auto-switch is TASK-54) — every group is returned.
export const publicMenuBySlug = query({
  args: {
    slug: v.string(),
    // The daypart the CLIENT resolved from the venue-timezone clock (§4
    // TASK-54, the owner decision). The query NEVER reads the wall clock — it
    // only filters by this argument, so crossing a boundary re-runs the
    // reactive query when the client sends a new value. `null` (or omitted) ⇒
    // no daypart active ⇒ only the always-on groups show.
    activeDaypart: v.optional(v.union(v.null(), v.string())),
  },
  handler: async (ctx, args) => {
    const business = await businessBySlug(ctx, requireSlug(args.slug));
    if (!business) return null;
    const menu = await menuForBusiness(ctx, business._id);
    if (!menu || menu.status !== "published") return null;

    const rows = await collectPublishedRows(
      ctx,
      menu._id,
      menu.publishedGeneration,
    );
    const model = menuRowsToModel(rows, {
      daypartOverride: menu.daypartOverride,
    });
    // The manual override BEATS the clock (§2.5); otherwise the client's
    // clock-derived daypart. Applied here (not on the client) so an override
    // flip propagates live through the subscription. Groups with no daypartKey
    // always show.
    const activeDaypartKey = resolveEffectiveDaypart(
      menu.daypartOverride,
      args.activeDaypart ?? null,
    );
    const groups = daypartGroups(model.groups, activeDaypartKey);

    // Capability gate (TASK-55, RFC-003 §2.7): resolve Menu limits for this
    // business. On Basic tier (or when no entitlement exists), photo and video
    // fields (photoStorageId, videoStorageId, and their signed URLs) MUST NOT
    // reach the client — omitted on the server, never hidden via CSS.
    // TASK-61: resolved through the generic chain (space → business → account
    // plan → null); a per-location override now works, which the standalone
    // twin could not do (RFC-003 §2.7, BLOCKED TASK-55).
    const entitlement = await getEntitlement(ctx, business._id, "scanme_menu");
    const photosAllowed = menuPhotosEnabled(entitlement?.limits);
    const videoAllowed = menuVideoEnabled(entitlement?.limits);

    const sanitizedGroups = groups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const { photoStorageId, videoStorageId, ...rest } = item;
        return {
          ...rest,
          ...(photosAllowed && photoStorageId ? { photoStorageId } : {}),
          ...(videoAllowed && videoStorageId ? { videoStorageId } : {}),
        };
      }),
    }));

    const blockImageUrls = await resolveItemMediaUrls(ctx, {
      ...model,
      groups: sanitizedGroups,
    });

    return {
      businessName: business.name,
      design: menu.design ?? null,
      groups: sanitizedGroups,
      blockImageUrls,
      // Daypart windows (for the client to resolve the clock daypart) + the
      // resolved state. `groups` above is already filtered by activeDaypartKey.
      dayparts: model.dayparts,
      daypartOverride: menu.daypartOverride ?? null,
      activeDaypartKey,
    };
  },
});

// The daypart windows + override for a published menu — the lightweight read
// the SSR route uses to resolve the current daypart BEFORE the heavy menu
// fetch (§4 TASK-54), so the first paint is already daypart-correct and the
// first client render matches it (no hydration mismatch). Reads the menus doc +
// menuDayparts only (no items, no media). Does NOT read the wall clock. Live
// like any query; the route reads it one-shot via fetchQuery.
export const menuDaypartStateBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await businessBySlug(ctx, requireSlug(args.slug));
    if (!business) return null;
    const menu = await menuForBusiness(ctx, business._id);
    if (!menu || menu.status !== "published") return null;
    // TASK-60c: filter to the live generation — old generations coexist in the
    // table between a publish and its cleanup, so an unfiltered read would
    // return doubled daypart windows.
    const dayparts = await ctx.db
      .query("menuDayparts")
      .withIndex("by_menuId_and_publishGeneration", (q) =>
        q.eq("menuId", menu._id).eq("publishGeneration", menu.publishedGeneration),
      )
      .collect();
    return {
      businessName: business.name,
      daypartOverride: menu.daypartOverride ?? null,
      dayparts: dayparts.map((d) => ({
        key: d.key,
        label: d.label,
        startMinute: d.startMinute,
        endMinute: d.endMinute,
      })),
    };
  },
});
