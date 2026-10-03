import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { menuModelValidator } from "./lib/menuValidators";
import { menuForBusiness, prepareDraftModel, publishFromDraft } from "./menu";
import type { MenuModel } from "../lib/menu-blocks";
import { countItems, MENU_MAX_ITEMS } from "../lib/menu-export/rows";
import { migrationDeadline, type MigrationStage } from "../lib/menu-migration";
import { fmt, getDict } from "../lib/i18n";

// =============================================================================
// TASK-58 — the admin Menu management surface (RFC-003 §2.9): the concierge
// enters the client's menu FOR them, tracks the migration (primljeno → u
// izradi → na potvrdi → objavljeno, two working days), and publishes on the
// client's behalf. Every function is `requireAdmin`-gated, and EVERY mutation
// that changes something writes EXACTLY ONE `adminAuditLog` row in the same
// transaction (RFC-002 §2.6 — we are touching someone else's content, so who
// changed what must be traceable). A no-op (grant twice, same stage twice)
// writes NO row and returns `changed: false`, the `setServiceProfileActive`
// precedent (convex/admin.ts).
//
// TASK-61: "grant" now also provisions the `scanme_menu` serviceProfile
// (`ensureMenuProfile`, mirroring venueAdmin.grantVenue) and attaches it to the
// `menus` row, so `subpageActive("menu")` turns true and the location's Menu
// subpage renders through the real route. No entitlement row is written — Basic
// is the default (getEntitlement step 3), Premium rides the account plan.
//
// THE HARD CEILING: an import above MENU_MAX_ITEMS (2000 — the public read's
// ~2045-item databaseQueries ceiling, docs/perf/menu-publish-ceiling.md) is
// refused BEFORE any write with a clear message, never attempted-then-crashed.
// =============================================================================

const dict = getDict("menu-admin");

const migrationStageValidator = v.union(
  v.literal("received"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("published"),
);

type StoredModel = NonNullable<Doc<"menus">["draftModel"]>;
const asPureModel = (model: StoredModel | undefined): MenuModel =>
  (model ?? { groups: [], dayparts: [] }) as unknown as MenuModel;
const asStoredModel = (model: MenuModel): StoredModel =>
  model as unknown as StoredModel;

async function loadBusiness(ctx: MutationCtx, businessId: Id<"businesses">) {
  const business = await ctx.db.get(businessId);
  if (!business || business.archivedAt) {
    throw new ConvexError(dict.loadError);
  }
  return business;
}

async function loadMenu(ctx: MutationCtx, menuId: Id<"menus">) {
  const menu = await ctx.db.get(menuId);
  if (!menu) throw new ConvexError(dict.loadError);
  const business = await loadBusiness(ctx, menu.businessId);
  return { menu, business };
}

// Ensure the business owns an ACTIVE `scanme_menu` service profile, creating it
// if absent and reactivating it if not active. Returns its id. Mirrors
// venueAdmin.grantVenue's profile provisioning (RFC-003 §2.9): the derived slug
// is guarded against a collision in serviceProfiles.by_slug. Idempotent — no
// second profile. Basic is the default entitlement, so no entitlement row.
export async function ensureMenuProfile(
  ctx: MutationCtx,
  business: Doc<"businesses">,
  now: number,
): Promise<Id<"serviceProfiles">> {
  const existing = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", business._id).eq("type", "scanme_menu"),
    )
    .unique();
  if (existing) {
    if (existing.status !== "active") {
      await ctx.db.patch(existing._id, { status: "active", updatedAt: now });
    }
    return existing._id;
  }
  const slug = `${business.slug}-meni`;
  const slugTaken = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (slugTaken) throw new ConvexError(dict.grantSlugConflict);
  return await ctx.db.insert("serviceProfiles", {
    businessId: business._id,
    type: "scanme_menu",
    slug,
    status: "active",
    clientEditingEnabled: true,
    totalScans: 0,
    totalPageViews: 0,
    totalConvertedSessions: 0,
    createdAt: now,
    updatedAt: now,
  });
}

// -----------------------------------------------------------------------------
// Read model
// -----------------------------------------------------------------------------

export const overview = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business || business.archivedAt) return null;
    const menu = await menuForBusiness(ctx, business._id);
    if (!menu) {
      return { business: { id: business._id, name: business.name, slug: business.slug }, menu: null };
    }
    const model = asPureModel(menu.draftModel);
    const deadlineAt = menu.migrationReceivedAt
      ? migrationDeadline(menu.migrationReceivedAt)
      : null;
    return {
      business: { id: business._id, name: business.name, slug: business.slug },
      menu: {
        id: menu._id,
        status: menu.status,
        migrationStage: (menu.migrationStage ?? null) as MigrationStage | null,
        migrationReceivedAt: menu.migrationReceivedAt ?? null,
        migrationStageAt: menu.migrationStageAt ?? null,
        deadlineAt,
        // A display hint evaluated when the query runs (re-evaluated on any
        // change to the menu row); not a stored fact.
        overdue:
          deadlineAt !== null &&
          menu.migrationStage !== "published" &&
          Date.now() > deadlineAt,
        groupsCount: model.groups.length,
        itemsCount: countItems(model),
        publishedAt: menu.publishedAt ?? null,
        hasUnpublishedChanges: menu.hasUnpublishedChanges ?? false,
        draftRevision: menu.draftRevision ?? 0,
      },
    };
  },
});

// -----------------------------------------------------------------------------
// Writes — one audit row each
// -----------------------------------------------------------------------------

// "Aktiviraj Meni": provisions the active `scanme_menu` serviceProfile (which
// makes the location's Menu subpage appear) and the `menus` row + migration
// state "received". Idempotent — an existing menu keeps its content (the
// client's), but the profile is still ensured active and attached, so re-grant
// heals a menu that predates the profile (TASK-61 backfill via the grant path).
export const grantMenu = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const business = await loadBusiness(ctx, args.businessId);
    const now = Date.now();
    const serviceProfileId = await ensureMenuProfile(ctx, business, now);
    const existing = await menuForBusiness(ctx, business._id);
    if (existing) {
      if (!existing.serviceProfileId) {
        await ctx.db.patch(existing._id, { serviceProfileId, updatedAt: now });
      }
      return { menuId: existing._id, created: false as const };
    }
    const menuId = await ctx.db.insert("menus", {
      businessId: business._id,
      serviceProfileId,
      status: "draft",
      design: null,
      draftModel: asStoredModel({ groups: [], dayparts: [] }),
      draftRevision: 0,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      migrationStage: "received",
      migrationReceivedAt: now,
      migrationStageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "grant_menu",
      detail: { menuId },
      now,
    });
    return { menuId, created: true as const };
  },
});

// TASK-61 backfill: attach an active `scanme_menu` profile to every menu that
// predates the profile (`menus.serviceProfileId` was optional until TASK-61, so
// menus granted earlier carry only `businessId`). Idempotent — a menu that
// already has a profile is skipped. Run once on prod after deploy via
//   npx convex run menuAdmin:backfillMenuProfiles
// then `menus.serviceProfileId` can be tightened to required (docs/tasks/BLOCKED.md
// TASK-61). Menus are one-per-business, so the single `.collect()` is bounded.
export const backfillMenuProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const menus = await ctx.db.query("menus").collect();
    const now = Date.now();
    let attached = 0;
    for (const menu of menus) {
      if (menu.serviceProfileId) continue;
      const business = await ctx.db.get(menu.businessId);
      if (!business) continue;
      const serviceProfileId = await ensureMenuProfile(ctx, business, now);
      await ctx.db.patch(menu._id, { serviceProfileId, updatedAt: now });
      attached += 1;
    }
    return { scanned: menus.length, attached };
  },
});

export const setMigrationStage = mutation({
  args: { menuId: v.id("menus"), stage: migrationStageValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const { menu, business } = await loadMenu(ctx, args.menuId);
    const from = menu.migrationStage ?? null;
    if (from === args.stage) return { stage: args.stage, changed: false as const };
    const now = Date.now();
    await ctx.db.patch(menu._id, {
      migrationStage: args.stage,
      migrationStageAt: now,
      // A menu the owner created has no receipt; the first stage set stamps it.
      ...(menu.migrationReceivedAt ? {} : { migrationReceivedAt: now }),
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "set_menu_stage",
      detail: { menuId: menu._id, from, to: args.stage },
      now,
    });
    return { stage: args.stage, changed: true as const };
  },
});

// The data entry itself: REPLACES the whole draft with the imported model
// (lib/menu-import.ts on the client turns the admin's lines into this shape).
// The cap is checked first — an over-size import is refused with the reason,
// before a single byte is written.
export const importDraft = mutation({
  args: { menuId: v.id("menus"), model: menuModelValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const incoming = asPureModel(args.model);
    const items = countItems(incoming);
    if (items > MENU_MAX_ITEMS) {
      throw new ConvexError(
        fmt(dict.importTooLarge, { count: items, max: MENU_MAX_ITEMS }),
      );
    }
    const { menu, business } = await loadMenu(ctx, args.menuId);
    const model = prepareDraftModel(incoming);
    const replacedItems = countItems(asPureModel(menu.draftModel));
    const now = Date.now();
    const draftRevision = (menu.draftRevision ?? 0) + 1;
    const stage: MigrationStage | undefined =
      menu.migrationStage === "received" || menu.migrationStage === undefined
        ? "in_progress"
        : undefined;
    await ctx.db.patch(menu._id, {
      draftModel: asStoredModel(model),
      draftRevision,
      hasUnpublishedChanges: true,
      ...(stage ? { migrationStage: stage, migrationStageAt: now } : {}),
      ...(menu.migrationReceivedAt ? {} : { migrationReceivedAt: now }),
      updatedAt: now,
    });
    let variants = 0;
    for (const group of model.groups) {
      for (const item of group.items) variants += item.variants.length;
    }
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "import_menu_draft",
      detail: {
        menuId: menu._id,
        groups: model.groups.length,
        items,
        variants,
        replacedItems,
      },
      now,
    });
    return { draftRevision, groups: model.groups.length, items, variants };
  },
});

// Publish on the client's behalf. We are never the floor, so a live "nema
// više" is ALWAYS kept (publishFromDraft "keepLive") — the kept names go into
// the audit detail and back to the admin screen.
export const publishForClient = mutation({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const { menu, business } = await loadMenu(ctx, args.menuId);
    const result = await publishFromDraft(ctx, menu, {
      onAvailabilityConflict: "keepLive",
    });
    await ctx.db.patch(menu._id, {
      migrationStage: "published",
      migrationStageAt: result.publishedAt,
      ...(menu.migrationReceivedAt ? {} : { migrationReceivedAt: result.publishedAt }),
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "publish_menu",
      detail: {
        menuId: menu._id,
        via: "admin",
        generation: result.generation,
        items: result.itemCount,
        keptUnavailable: result.keptUnavailable.map((item) => item.name),
      },
      now: result.publishedAt,
    });
    return {
      publishedAt: result.publishedAt,
      items: result.itemCount,
      keptUnavailable: result.keptUnavailable,
    };
  },
});
