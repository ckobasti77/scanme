import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// =============================================================================
// ScanMe Menu V1 (K20) — what a Menu QR card opens (master §9.1; plan K19 §3).
//
// The ONLY Menu logic the printed-card resolver runs (convex/cards.ts, branch
// `menu`), kept out of cards.ts so that file changes by one call. Nothing here
// touches fair, ordering or any other card kind. A card without a menuQrLinks
// row, with an inactive row, or with a row of another business's service
// resolves exactly as before K20: `/{slug}/meni`, no page, no position.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

/** The Menu link row of a card (one per card; convex/menuQr.ts upserts it). */
export async function menuQrLinkOfCard(
  ctx: DatabaseCtx,
  cardId: Id<"cards">,
): Promise<Doc<"menuQrLinks"> | null> {
  // take(2), not unique(): a duplicate written outside menuQr.ts must never
  // break a scan; the first row wins.
  const rows = await ctx.db
    .query("menuQrLinks")
    .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
    .take(2);
  return rows[0] ?? null;
}

export type ResolvedMenuCardLink = {
  menuService: Doc<"menuServices">;
  /** Slug of the active page the card opens; absent = the menu's entry. */
  pagePath?: string;
  /** The active position the card stands on; absent = no position. */
  position?: Doc<"menuPositions">;
};

/**
 * The active Menu link of a card, or null when the card has none (or a link
 * that must not count: inactive row, inactive service, service of another
 * business). An archived or missing page is dropped (the card opens the
 * menu's entry); an archived position is dropped (no position, never another).
 */
export async function resolveMenuCardLink(
  ctx: DatabaseCtx,
  card: Doc<"cards">,
): Promise<ResolvedMenuCardLink | null> {
  const link = await menuQrLinkOfCard(ctx, card._id);
  if (!link || !link.active) return null;
  const menuService = await ctx.db.get(link.menuServiceId);
  if (!menuService || menuService.status !== "active" || menuService.businessId !== card.businessId) {
    return null;
  }
  const resolved: ResolvedMenuCardLink = { menuService };
  if (link.pageKey) {
    const pageKey = link.pageKey;
    const page = await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_key", (q) =>
        q.eq("menuServiceId", menuService._id).eq("key", pageKey),
      )
      .unique();
    if (page && page.archivedAt === undefined) resolved.pagePath = page.slug;
  }
  if (link.positionId) {
    const position = await ctx.db.get(link.positionId);
    if (position && position.active && position.menuServiceId === menuService._id) {
      resolved.position = position;
    }
  }
  return resolved;
}

/**
 * The extra fields of the resolver's `menu` outcome (convex/cards.ts). Empty
 * object = the pre-K20 outcome; `hop` sends the scan through
 * /r/[cardCode]/meni, the single place that opens a guest session.
 */
export async function menuCardOutcomeFields(
  ctx: DatabaseCtx,
  card: Doc<"cards">,
): Promise<{ pagePath?: string; hop?: true; cardCode?: string }> {
  const resolved = await resolveMenuCardLink(ctx, card);
  if (!resolved) return {};
  return {
    ...(resolved.pagePath ? { pagePath: resolved.pagePath } : {}),
    ...(resolved.position ? { hop: true as const, cardCode: card.cardCode } : {}),
  };
}

/**
 * The card's CURRENT destination, legacy and adopted cards alike (adopted
 * cards carry it on their access subject — convex/lib/accessResolution.ts).
 * null when the card has no destination.
 */
export async function currentTargetOfCard(
  ctx: DatabaseCtx,
  card: Doc<"cards">,
): Promise<Doc<"cardTargets"> | null> {
  if (!card.accessChannelId) {
    return card.currentTargetId ? await ctx.db.get(card.currentTargetId) : null;
  }
  const channel = await ctx.db.get(card.accessChannelId);
  const subject = channel ? await ctx.db.get(channel.subjectId) : null;
  return subject?.currentTargetId ? await ctx.db.get(subject.currentTargetId) : null;
}

/**
 * K34: whether a scan of the card opens the Menu now, by the resolver's rule (convex/cards.ts
 * resolveAndRecord): a card adopted by ADMIN-12 (`accessChannelId`) is switched by its access
 * channel (`redirectEnabled` and `state === "active"`; a missing channel is a broken mapping)
 * and its destination lives on the access subject; `cards.status` counts only for a legacy card.
 */
export async function cardOpensMenu(
  ctx: DatabaseCtx,
  card: Doc<"cards">,
  businessId: Id<"businesses">,
): Promise<boolean> {
  if (card.businessId !== businessId) return false;
  if (card.accessChannelId) {
    const channel = await ctx.db.get(card.accessChannelId);
    if (!channel || !channel.redirectEnabled || channel.state !== "active") return false;
  } else if (card.status !== "active") {
    return false;
  }
  const target = await currentTargetOfCard(ctx, card);
  return target?.kind === "menu";
}

/**
 * Whether an ACTIVE QR card stands on the position (master §9.2): the link row
 * is active, the card belongs to the business, is active and still opens the
 * Menu. Such a position cannot be archived (K19-12), like a page with a QR.
 */
export async function positionHasActiveQr(
  ctx: DatabaseCtx,
  input: {
    menuServiceId: Id<"menuServices">;
    businessId: Id<"businesses">;
    positionId: Id<"menuPositions">;
  },
): Promise<boolean> {
  const links = await ctx.db
    .query("menuQrLinks")
    .withIndex("by_positionId", (q) => q.eq("positionId", input.positionId))
    .take(100);
  for (const link of links) {
    if (!link.active || link.menuServiceId !== input.menuServiceId) continue;
    const card = await ctx.db.get(link.cardId);
    // K34: adopted cards are switched by their access channel (before, any adopted card counted).
    if (card && (await cardOpensMenu(ctx, card, input.businessId))) return true;
  }
  return false;
}
