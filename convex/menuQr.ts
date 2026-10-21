import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { generateCode } from "./lib/codes";
import {
  activeMenuServiceForBusiness,
  getMenuAccess,
  loadManyOwned,
  loadOwned,
  requireMenuAccess,
  requireMenuAccessToRow,
  type MenuAccess,
} from "./lib/menuAccess";
import { auditActorKind, writeMenuAudit } from "./lib/menuDraft";
import { currentTargetOfCard, menuQrLinkOfCard } from "./lib/menuQrResolve";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { FLOOR_ERROR } from "../lib/menu/errors/floor";
import { MENU_MAX_PAGES, MENU_MAX_QR_CARDS, MENU_MAX_QR_MINT_BATCH } from "../lib/menu/limits";
import type { LokalKartica, LokalStranica } from "../lib/menu/lokal/model";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";

// =============================================================================
// ScanMe Menu V1 (K20) — the Menu QR cards of a venue (master §9.2: the client
// sees which card stands on which table, uses several cards for different
// destinations without a fee, and sees the status of each card and link).
//
// A Menu QR card is a `cards` row whose CURRENT destination (cardTargets.kind)
// is "menu", plus at most ONE `menuQrLinks` row that says which page it opens
// and which position (table, room) it stands on. These writes are operational:
// they apply at once and never touch the draft (no touchDraft). Cards adopted
// by a ScanMe access channel (cards.accessChannelId, ADMIN-12) are READ-ONLY
// here: only ScanMe changes them (FLOOR_ERROR.cardReadOnly). Everything needs
// `venue.edit` (owner, manager, ScanMe admin).
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

/** Fresh-code attempts per card before giving up (a 32^8 space: a miss is a freak). */
const CODE_ATTEMPTS = 8;

type MenuCardRow = {
  card: Doc<"cards">;
  /** The link row of THIS service, or null. */
  link: Doc<"menuQrLinks"> | null;
  /** The card's current destination is the Menu. */
  opensMenu: boolean;
};

/**
 * The Menu cards of a business: current target "menu", OR a link row of this
 * service (a card retargeted away still shows, with opensMenu false). Bounded
 * to MENU_MAX_QR_CARDS cards of the business (cards of every destination, read
 * oldest first); `truncated` says there were more.
 */
export async function menuCardRows(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  businessId: Id<"businesses">,
): Promise<{ rows: MenuCardRow[]; truncated: boolean }> {
  const cards = await ctx.db
    .query("cards")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .take(MENU_MAX_QR_CARDS + 1);
  const truncated = cards.length > MENU_MAX_QR_CARDS;
  const rows: MenuCardRow[] = [];
  for (const card of cards.slice(0, MENU_MAX_QR_CARDS)) {
    const found = await menuQrLinkOfCard(ctx, card._id);
    const link = found && found.menuServiceId === menuServiceId ? found : null;
    const target = await currentTargetOfCard(ctx, card);
    const opensMenu = target?.kind === "menu";
    if (opensMenu || link) rows.push({ card, link, opensMenu });
  }
  return { rows, truncated };
}

async function lastScanAtOf(ctx: DatabaseCtx, cardId: Id<"cards">): Promise<number | null> {
  const last = await ctx.db
    .query("cardScanEvents")
    .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
    .order("desc")
    .first();
  return last?.occurredAt ?? null;
}

/** The ACTIVE page of the service, or FLOOR_ERROR.pageUnavailable (archived or unknown key). */
async function loadActivePage(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  pageKey: string,
): Promise<Doc<"menuPages">> {
  const page = await ctx.db
    .query("menuPages")
    .withIndex("by_menuServiceId_and_key", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("key", pageKey),
    )
    .first();
  if (!page || page.archivedAt !== undefined) {
    throw new ConvexError(FLOOR_ERROR.pageUnavailable);
  }
  return page;
}

function assertPositionActive(position: Doc<"menuPositions">): void {
  if (!position.active) throw new ConvexError(FLOOR_ERROR.positionArchived);
}

async function uniqueCardCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateCode();
    const taken = await ctx.db
      .query("cards")
      .withIndex("by_cardCode", (q) => q.eq("cardCode", candidate))
      .first();
    if (!taken) return candidate;
  }
  throw new ConvexError(MENU_ERROR.limitReached);
}

/**
 * The card and the caller's `venue.edit` access, from a card id taken from an
 * argument. A missing card, a business without an active Menu service and a
 * card of a tenant the caller has no role in are all `menu/not_found` (no
 * existence oracle); an adopted card is `floor/card_read_only`.
 */
async function loadCardForEdit(
  ctx: MutationCtx,
  cardId: Id<"cards">,
): Promise<{ card: Doc<"cards">; access: MenuAccess }> {
  const card = await ctx.db.get(cardId);
  if (!card) throw new ConvexError(MENU_ERROR.notFound);
  const service = await activeMenuServiceForBusiness(ctx, card.businessId);
  if (!service) throw new ConvexError(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, service._id, "venue.edit");
  if (card.accessChannelId) throw new ConvexError(FLOOR_ERROR.cardReadOnly);
  return { card, access };
}

// -----------------------------------------------------------------------------
// listCards — the cards of "Lokal i QR" and the pages they may open.
// -----------------------------------------------------------------------------

export const listCards = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    if (!access) return null;
    const menuServiceId = access.menuService._id;

    const { rows, truncated } = await menuCardRows(ctx, menuServiceId, access.business._id);
    const cards: LokalKartica[] = [];
    for (const { card, link, opensMenu } of rows) {
      cards.push({
        id: card._id,
        cardCode: card.cardCode,
        label: card.label,
        status: card.status,
        managedByScanMe: !!card.accessChannelId,
        opensMenu,
        link: link
          ? {
              pageKey: link.pageKey ?? null,
              positionId: link.positionId ?? null,
              active: link.active,
            }
          : null,
        totalScans: card.totalScans,
        lastScanAt: await lastScanAtOf(ctx, card._id),
        createdAt: card.createdAt,
      });
    }
    cards.sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        a.label.localeCompare(b.label, "sr-Latn", { numeric: true }) ||
        a.cardCode.localeCompare(b.cardCode),
    );

    const pageRows = await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .take(MENU_MAX_PAGES);
    const pages: LokalStranica[] = pageRows
      .filter((page) => page.archivedAt === undefined)
      .map((page) => ({
        key: page.key,
        name: page.name,
        slug: page.slug,
        isDefault: page.isDefault,
      }));

    return { cards, pages, truncated };
  },
});

// -----------------------------------------------------------------------------
// mintCards — new Menu QR cards, for positions (one each) or for a page.
// -----------------------------------------------------------------------------

export const mintCards = mutation({
  args: {
    slug: v.string(),
    positionIds: v.optional(v.array(v.id("menuPositions"))),
    pageKey: v.union(v.string(), v.null()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    const menuServiceId = access.menuService._id;
    const businessId = access.business._id;

    // Exactly one of: positionIds (a card per position) or count (cards for the page).
    if ((args.positionIds === undefined) === (args.count === undefined)) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    let amount: number;
    if (args.positionIds !== undefined) {
      amount = args.positionIds.length;
      if (new Set(args.positionIds).size !== amount) {
        throw new ConvexError(MENU_ERROR.invalidInput);
      }
    } else {
      amount = args.count as number;
      if (!Number.isInteger(amount)) throw new ConvexError(MENU_ERROR.invalidInput);
    }
    if (amount < 1 || amount > MENU_MAX_QR_MINT_BATCH) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }

    const page =
      args.pageKey === null ? null : await loadActivePage(ctx, menuServiceId, args.pageKey);
    const positions = args.positionIds
      ? await loadManyOwned(ctx, args.positionIds, menuServiceId)
      : [];
    positions.forEach(assertPositionActive);

    // The ceiling counts the cards of EVERY destination the section reads: a
    // card minted past the window would be the newest, hence the one listCards
    // cannot see. So after any successful mint, listCards is not truncated.
    const existing = await ctx.db
      .query("cards")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .take(MENU_MAX_QR_CARDS + 1);
    if (existing.length + amount > MENU_MAX_QR_CARDS) {
      throw new ConvexError(MENU_ERROR.limitReached);
    }

    // The default page's internal name ("Kompletan meni") is not public: it gets
    // the same neutral label as a card with no page.
    const pageLabel =
      page && !page.isDefault ? page.name : menuDomenSr.qrCardDefaultLabel;
    const now = Date.now();
    const created: { cardId: Id<"cards">; cardCode: string; label: string }[] = [];
    for (let index = 0; index < amount; index += 1) {
      const position = positions[index] ?? null;
      const label = position ? position.label : pageLabel;
      const cardCode = await uniqueCardCode(ctx);
      const cardId = await ctx.db.insert("cards", {
        businessId,
        cardCode,
        label,
        status: "active",
        totalScans: 0,
        createdAt: now,
        updatedAt: now,
      });
      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: "menu",
        createdByUserId: access.user._id,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId, updatedAt: now });
      await ctx.db.insert("menuQrLinks", {
        menuServiceId,
        cardId,
        ...(args.pageKey !== null ? { pageKey: args.pageKey } : {}),
        ...(position ? { positionId: position._id } : {}),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      created.push({ cardId, cardCode, label });
    }

    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "qr.minted",
      details: { count: created.length },
    });
    return { created };
  },
});

// -----------------------------------------------------------------------------
// linkCard — which page a card opens and which position it stands on.
// -----------------------------------------------------------------------------

export const linkCard = mutation({
  args: {
    cardId: v.id("cards"),
    pageKey: v.union(v.string(), v.null()),
    positionId: v.union(v.id("menuPositions"), v.null()),
  },
  handler: async (ctx, args) => {
    const { card, access } = await loadCardForEdit(ctx, args.cardId);
    const menuServiceId = access.menuService._id;

    const target = await currentTargetOfCard(ctx, card);
    if (target?.kind !== "menu") throw new ConvexError(FLOOR_ERROR.cardNotMenu);

    if (args.pageKey !== null) await loadActivePage(ctx, menuServiceId, args.pageKey);
    const position =
      args.positionId === null ? null : await loadOwned(ctx, args.positionId, menuServiceId);
    if (position) assertPositionActive(position);

    const link = await menuQrLinkOfCard(ctx, card._id);
    if (
      link &&
      link.menuServiceId === menuServiceId &&
      link.active &&
      (link.pageKey ?? null) === args.pageKey &&
      (link.positionId ?? null) === args.positionId
    ) {
      return null; // already exactly this: nothing to write, nothing to audit
    }

    const now = Date.now();
    const fields = {
      menuServiceId,
      // undefined removes the field: "absent = no page / no position".
      pageKey: args.pageKey ?? undefined,
      positionId: args.positionId ?? undefined,
      active: true,
      updatedAt: now,
    };
    if (link) {
      await ctx.db.patch(link._id, fields);
    } else {
      await ctx.db.insert("menuQrLinks", {
        menuServiceId,
        cardId: card._id,
        ...(args.pageKey !== null ? { pageKey: args.pageKey } : {}),
        ...(args.positionId !== null ? { positionId: args.positionId } : {}),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const unlinked = args.pageKey === null && args.positionId === null;
    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: unlinked ? "qr.unlinked" : "qr.linked",
      entityType: "cards",
      entityKey: card.cardCode,
      ...(unlinked ? {} : { details: { pageKey: args.pageKey, positionKey: position?.key ?? null } }),
    });
    return null;
  },
});

// -----------------------------------------------------------------------------
// setCardActive — switch a card off (it stops opening anything) or on again.
// -----------------------------------------------------------------------------

export const setCardActive = mutation({
  args: { cardId: v.id("cards"), active: v.boolean() },
  handler: async (ctx, args) => {
    const { card, access } = await loadCardForEdit(ctx, args.cardId);
    const status = args.active ? "active" : "disabled";
    if (card.status === status) return null; // no-op: nothing to write, nothing to audit

    await ctx.db.patch(card._id, { status, updatedAt: Date.now() });
    await writeMenuAudit(ctx, {
      menuServiceId: access.menuService._id,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "qr.card_status",
      entityType: "cards",
      entityKey: card.cardCode,
      details: { active: args.active },
    });
    return null;
  },
});
