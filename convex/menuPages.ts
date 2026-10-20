import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  getMenuAccess,
  loadOwned,
  requireMenuAccess,
  requireMenuAccessToRow,
  type MenuAccess,
} from "./lib/menuAccess";
import { auditActorKind, touchDraft, writeMenuAudit } from "./lib/menuDraft";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { checkCas } from "../lib/menu/cas";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_PAGES,
  MENU_MAX_PLACEMENTS_PER_PAGE,
  MENU_MAX_QR_LINKS_PER_PAGE,
  MENU_MAX_SECTIONS_PER_PAGE,
  MENU_TEXT,
} from "../lib/menu/limits";
import { moveItem, orderAfter, renumberedOrders } from "../lib/menu/order";
import { uniquePageSlug } from "../lib/menu/slugs";
import { requiredText } from "../lib/menu/text";
import { fmt } from "../lib/i18n/format";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";

// =============================================================================
// ScanMe Menu V1 — standard pages (K02; master §3.2, LOCKED): "Klijent može
// dodati, preimenovati, duplirati, premestiti, arhivirati i obrisati standardnu
// stranicu. Brisanje stranice povezane sa QR karticom nije dozvoljeno dok se ta
// QR veza ne preusmeri ili isključi."
//
// Reads need menu.read, every write menu.edit (requireMenuAccess). A page's slug
// is derived once and never changes; its key never changes. Every mutation that
// changes the draft calls touchDraft exactly once — never on a refusal, a CAS
// conflict or a no-op.
//
// Mutations that take only a page id resolve the service from the page
// (requireMenuAccessToRow): a caller with NO Menu role in that service gets
// `menu/not_found`, exactly as if the id did not exist. A caller who has a role
// but may not edit (client editing switched off) still gets
// `menu/editing_disabled`.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

async function loadPages(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuPages">[]> {
  return await ctx.db
    .query("menuPages")
    .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
    .take(MENU_MAX_PAGES + 1);
}

/**
 * The page and the caller's edit access, from a page id taken from an argument.
 * A missing page and a page of a service the caller has no role in are both
 * `menu/not_found`.
 */
async function loadPageForEdit(
  ctx: MutationCtx,
  pageId: Id<"menuPages">,
): Promise<{ page: Doc<"menuPages">; access: MenuAccess }> {
  const found = await ctx.db.get(pageId);
  if (!found) throw new ConvexError(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, found.menuServiceId, "menu.edit");
  const page = await loadOwned(ctx, pageId, access.menuService._id);
  return { page, access };
}

function assertNotArchived(page: Doc<"menuPages">): void {
  if (page.archivedAt !== undefined) throw new ConvexError(MENU_ERROR.pageArchived);
}

/** Cuts to at most `max` UTF-16 units without splitting a surrogate pair. */
function truncate(value: string, max: number): string {
  let out = "";
  for (const char of value) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out.trimEnd();
}

/** "{name} (kopija)", with the source name shortened so the result fits. */
function copyName(sourceName: string): string {
  const full = fmt(menuDomenSr.pageCopyName, { name: sourceName });
  if (full.length <= MENU_TEXT.pageName) return full;
  const overhead = fmt(menuDomenSr.pageCopyName, { name: "" }).length;
  return fmt(menuDomenSr.pageCopyName, {
    name: truncate(sourceName, MENU_TEXT.pageName - overhead),
  });
}

/**
 * Whether an ACTIVE QR link points at the page and would break if the page went
 * away (master §3.2). A link blocks only when the link row is active, its card
 * belongs to the business and is active, and the card's CURRENT target is the
 * Menu. A disabled card, an inactive link or a card retargeted elsewhere does
 * not block.
 */
export async function pageHasActiveQr(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  businessId: Id<"businesses">,
  pageKey: string,
): Promise<boolean> {
  const links = await ctx.db
    .query("menuQrLinks")
    .withIndex("by_menuServiceId_and_pageKey", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("pageKey", pageKey),
    )
    .take(MENU_MAX_QR_LINKS_PER_PAGE);
  for (const link of links) {
    if (!link.active) continue;
    const card = await ctx.db.get(link.cardId);
    if (!card || card.status !== "active" || card.businessId !== businessId) continue;
    if (!card.currentTargetId) continue;
    const target = await ctx.db.get(card.currentTargetId);
    if (target?.kind === "menu") return true;
  }
  return false;
}

async function assertNoActiveQr(
  ctx: DatabaseCtx,
  access: MenuAccess,
  page: Doc<"menuPages">,
): Promise<void> {
  const blocked = await pageHasActiveQr(
    ctx,
    access.menuService._id,
    access.menuService.businessId,
    page.key,
  );
  if (blocked) throw new ConvexError(MENU_ERROR.pageHasQr);
}

/** The other non-archived pages of the service, by order. */
function otherLivePages(
  pages: readonly Doc<"menuPages">[],
  page: Doc<"menuPages">,
): Doc<"menuPages">[] {
  return pages.filter((row) => row._id !== page._id && row.archivedAt === undefined);
}

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

/** The pages of a service by order, archived ones included (flagged). null for every refusal. */
export const list = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const pages = await loadPages(ctx, access.menuService._id);
    return pages.map((page) => ({
      pageId: page._id,
      key: page.key,
      slug: page.slug,
      name: page.name,
      publicTitle: page.publicTitle ?? null,
      isDefault: page.isDefault,
      order: page.order,
      visibility: page.visibility,
      archived: page.archivedAt !== undefined,
      navigation: page.navigation,
      placementCount: page.placementCount,
    }));
  },
});

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

/** Adds an empty standard page after the last one. */
export const add = mutation({
  args: { menuServiceId: v.id("menuServices"), name: v.string() },
  handler: async (ctx, args) => {
    const access = await requireMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.edit");
    const name = requiredText(args.name, MENU_TEXT.pageName);
    if (name === null) throw new ConvexError(MENU_ERROR.invalidInput);
    const menuServiceId = access.menuService._id;
    const pages = await loadPages(ctx, menuServiceId);
    if (pages.length >= MENU_MAX_PAGES) throw new ConvexError(MENU_ERROR.limitReached);

    const slug = uniquePageSlug(name, new Set(pages.map((page) => page.slug)));
    const key = newMenuKey("page");
    const now = Date.now();
    const pageId = await ctx.db.insert("menuPages", {
      menuServiceId,
      key,
      slug,
      name,
      isDefault: false,
      order: orderAfter(pages.length > 0 ? pages[pages.length - 1].order : null),
      visibility: "visible",
      navigation: "standalone",
      placementCount: 0,
      createdAt: now,
      updatedAt: now,
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, menuServiceId, access.user._id);
    return { pageId, key, slug };
  },
});

/**
 * Renames a page. The slug never changes. `expectedName` is the name the editor
 * last saw: when someone else changed it meanwhile nothing is written and the
 * current value comes back (master §6.1).
 */
export const rename = mutation({
  args: { pageId: v.id("menuPages"), name: v.string(), expectedName: v.string() },
  handler: async (ctx, args) => {
    const { page, access } = await loadPageForEdit(ctx, args.pageId);
    assertNotArchived(page);
    const name = requiredText(args.name, MENU_TEXT.pageName);
    if (name === null) throw new ConvexError(MENU_ERROR.invalidInput);

    const cas = checkCas({ name: page.name }, { name: args.expectedName }, { name });
    if (!cas.ok) {
      return { ok: false as const, conflicts: cas.conflicts, current: cas.current, attempted: cas.attempted };
    }
    if (name === page.name) return { ok: true as const };

    await ctx.db.patch(page._id, {
      name,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return { ok: true as const };
  },
});

/**
 * Copies a page with its sections and placements. Articles are shared, never
 * copied: every copied placement points at the SAME article. The copy is never
 * the default page.
 */
export const duplicate = mutation({
  args: { pageId: v.id("menuPages") },
  handler: async (ctx, args) => {
    const { page, access } = await loadPageForEdit(ctx, args.pageId);
    assertNotArchived(page);
    const menuServiceId = access.menuService._id;
    const pages = await loadPages(ctx, menuServiceId);
    if (pages.length >= MENU_MAX_PAGES) throw new ConvexError(MENU_ERROR.limitReached);

    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE + 1);
    const placements = await ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_PLACEMENTS_PER_PAGE + 1);
    if (
      sections.length > MENU_MAX_SECTIONS_PER_PAGE ||
      placements.length > MENU_MAX_PLACEMENTS_PER_PAGE
    ) {
      throw new ConvexError(MENU_ERROR.limitReached);
    }
    const sectionIds = new Set<Id<"menuSections">>(sections.map((section) => section._id));
    const copiedPlacements = placements.filter((placement) => sectionIds.has(placement.sectionId));

    const name = copyName(page.name);
    const slug = uniquePageSlug(name, new Set(pages.map((row) => row.slug)));
    const now = Date.now();
    const pageId = await ctx.db.insert("menuPages", {
      menuServiceId,
      key: newMenuKey("page"),
      slug,
      name,
      ...(page.publicTitle !== undefined ? { publicTitle: page.publicTitle } : {}),
      isDefault: false,
      order: orderAfter(pages.length > 0 ? pages[pages.length - 1].order : null),
      visibility: page.visibility,
      ...(page.iconKey !== undefined ? { iconKey: page.iconKey } : {}),
      navigation: page.navigation,
      placementCount: copiedPlacements.length,
      createdAt: now,
      updatedAt: now,
      updatedByUserId: access.user._id,
    });

    const newSectionIds = new Map<Id<"menuSections">, Id<"menuSections">>();
    for (const section of sections) {
      const newSectionId = await ctx.db.insert("menuSections", {
        menuServiceId,
        pageId,
        key: newMenuKey("section"),
        name: section.name,
        ...(section.description !== undefined ? { description: section.description } : {}),
        ...(section.iconKey !== undefined ? { iconKey: section.iconKey } : {}),
        order: section.order,
        visibility: section.visibility,
        createdAt: now,
        updatedAt: now,
      });
      newSectionIds.set(section._id, newSectionId);
    }
    for (const placement of copiedPlacements) {
      const sectionId = newSectionIds.get(placement.sectionId);
      if (!sectionId) continue;
      await ctx.db.insert("menuPlacements", {
        menuServiceId,
        pageId,
        sectionId,
        articleId: placement.articleId,
        order: placement.order,
        visibility: placement.visibility,
        createdAt: now,
        updatedAt: now,
      });
    }

    await touchDraft(ctx, menuServiceId, access.user._id);
    return { pageId, slug };
  },
});

/**
 * Moves a page to `toIndex` in the service's page order (archived pages count,
 * the index is clamped). The list is renumbered; only rows whose order changed
 * are written.
 */
export const move = mutation({
  args: { pageId: v.id("menuPages"), toIndex: v.number() },
  handler: async (ctx, args) => {
    const { page, access } = await loadPageForEdit(ctx, args.pageId);
    assertNotArchived(page);
    if (!Number.isInteger(args.toIndex) || args.toIndex < 0) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    const pages = await loadPages(ctx, access.menuService._id);
    const from = pages.findIndex((row) => row._id === page._id);
    if (from < 0) throw new ConvexError(MENU_ERROR.notFound);

    const moved = moveItem(pages, from, args.toIndex);
    if (moved.every((row, index) => row._id === pages[index]._id)) {
      return { changed: false as const };
    }
    const orders = renumberedOrders(moved.length);
    const now = Date.now();
    for (let index = 0; index < moved.length; index += 1) {
      if (moved[index].order === orders[index]) continue;
      await ctx.db.patch(moved[index]._id, { order: orders[index], updatedAt: now });
    }
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return { changed: true as const };
  },
});

/**
 * Archives a page (hides it from the editor's active list; content is kept).
 * Refused while an active QR link points at it and for the last active page.
 * Archiving the default page hands the default flag to the next active page.
 */
export const archive = mutation({
  args: { pageId: v.id("menuPages") },
  handler: async (ctx, args) => {
    const { page, access } = await loadPageForEdit(ctx, args.pageId);
    if (page.archivedAt !== undefined) return { changed: false as const };
    await assertNoActiveQr(ctx, access, page);

    const menuServiceId = access.menuService._id;
    const others = otherLivePages(await loadPages(ctx, menuServiceId), page);
    if (others.length === 0) throw new ConvexError(MENU_ERROR.lastPage);

    const now = Date.now();
    if (page.isDefault) {
      await ctx.db.patch(others[0]._id, { isDefault: true, updatedAt: now });
    }
    await ctx.db.patch(page._id, {
      archivedAt: now,
      isDefault: false,
      updatedAt: now,
      updatedByUserId: access.user._id,
    });
    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "page.archived",
      entityType: "menuPages",
      entityKey: page.key,
      details: { slug: page.slug },
    });
    await touchDraft(ctx, menuServiceId, access.user._id);
    return { changed: true as const };
  },
});

/** Brings an archived page back. It is never the default page again. */
export const restore = mutation({
  args: { pageId: v.id("menuPages") },
  handler: async (ctx, args) => {
    const { page, access } = await loadPageForEdit(ctx, args.pageId);
    if (page.archivedAt === undefined) return { changed: false as const };
    await ctx.db.patch(page._id, {
      archivedAt: undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return { changed: true as const };
  },
});

/**
 * Deletes a page with its sections and placements. Articles are never deleted.
 * Refused while an active QR link points at the page (nothing is touched) and
 * for the last active page. Deleting the default page hands the default flag
 * to the next active page.
 */
export const remove = mutation({
  args: { pageId: v.id("menuPages") },
  handler: async (ctx, args) => {
    const { page, access } = await loadPageForEdit(ctx, args.pageId);
    await assertNoActiveQr(ctx, access, page);

    const menuServiceId = access.menuService._id;
    const others = otherLivePages(await loadPages(ctx, menuServiceId), page);
    if (page.archivedAt === undefined && others.length === 0) {
      throw new ConvexError(MENU_ERROR.lastPage);
    }

    const placements = await ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_PLACEMENTS_PER_PAGE + 1);
    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", page._id))
      .take(MENU_MAX_SECTIONS_PER_PAGE + 1);
    if (
      placements.length > MENU_MAX_PLACEMENTS_PER_PAGE ||
      sections.length > MENU_MAX_SECTIONS_PER_PAGE
    ) {
      throw new ConvexError(MENU_ERROR.limitReached);
    }

    if (page.isDefault && others.length > 0) {
      await ctx.db.patch(others[0]._id, { isDefault: true, updatedAt: Date.now() });
    }
    for (const placement of placements) await ctx.db.delete(placement._id);
    for (const section of sections) await ctx.db.delete(section._id);
    await ctx.db.delete(page._id);
    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "page.deleted",
      entityType: "menuPages",
      entityKey: page.key,
      details: { slug: page.slug, name: page.name },
    });
    await touchDraft(ctx, menuServiceId, access.user._id);
    return { deleted: true as const };
  },
});
