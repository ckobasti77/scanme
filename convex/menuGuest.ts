import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { cardResolution } from "./lib/accessResolution";
import { normalizeCode } from "./lib/codes";
import { resolveMenuCardLink } from "./lib/menuQrResolve";
import { rateLimiter } from "./lib/rateLimits";
import {
  deviceKeyHashFor,
  isMenuToken,
  newMenuToken,
  sessionTokenHash,
} from "../lib/menu/tokens";

// =============================================================================
// ScanMe Menu V1 (K20) — the guest side of a scanned position (master §9.1;
// plan K19 §3.3, §4.1, K19-2…K19-4).
//
// A QR card that stands on a table or a room opens the menu WITH that
// position: /r/[cardCode] (convex/cards.ts) 302s to the hop /r/[cardCode]/meni,
// whose handler (lib/menu/http/guest-hop.ts) calls `mintFromCard`, the single
// place that opens a guest session. The guest never picks a position and the
// URL never carries one: the position lives in the server session, reached by
// a 256-bit token in the HttpOnly cookie smm_g. A card without a position
// opens its page with no session at all — nothing is invented.
//
// K21 adds the guest actions (call, bill, order, Moji zahtevi) on top of the
// session this module opens.
// =============================================================================

/** The server-side life of a guest session (the cookie smm_g matches it). */
export const MENU_GUEST_SESSION_MS = 3 * 60 * 60 * 1000;
/** Ended or expired sessions are deleted after this grace period. */
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const SESSION_SWEEP_BATCH = 200;
/** Sessions of one device in one venue read when reusing or ending them. */
const DEVICE_SESSIONS_READ = 20;
const IP_HASH_PATTERN = /^[0-9a-f]{16,64}$/;

export type MenuGuestHopOutcome =
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | {
      kind: "menu";
      /** The venue (business slug) whose menu opens. */
      slug: string;
      /** Slug of the linked page; null = the menu's entry. */
      pagePath: string | null;
      /**
       * The opened session (raw tokens for the handler's cookies only); null
       * when the card has no position or the per-card burst was throttled —
       * the guest still reaches the menu, just without a position.
       */
      session: { guestToken: string; deviceToken: string } | null;
    };

async function scheduleExpiry(
  ctx: MutationCtx,
  sessionId: Id<"menuGuestSessions">,
  expiresAt: number,
): Promise<void> {
  await ctx.scheduler.runAt(expiresAt, internal.menuGuest.expireSession, { sessionId });
}

/**
 * Open (or renew) the guest session of a scanned position card. Public
 * because the Next handler calls it over HTTP, like cards.resolveTableOrdering;
 * it re-checks the card from scratch, so calling it directly gains nothing a
 * scan would not give.
 */
export const mintFromCard = mutation({
  args: {
    cardCode: v.string(),
    // A salted hash of the caller IP computed by the handler, a rate-limit key
    // only (the cards.resolveAndRecord contract); absent → one shared bucket.
    ipHash: v.optional(v.string()),
    // The raw device token from the HttpOnly cookie smm_d (Path=/r), already
    // verified by the handler; anything malformed starts a new device.
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MenuGuestHopOutcome> => {
    const ipKey = args.ipHash && IP_HASH_PATTERN.test(args.ipHash) ? args.ipHash : "shared";
    const allowed = await rateLimiter.limit(ctx, "menuGuestHop", { key: ipKey });
    if (!allowed.ok) return { kind: "rate_limited" };

    const cardCode = normalizeCode(args.cardCode);
    if (!cardCode) return { kind: "invalid" };
    const card = await ctx.db
      .query("cards")
      .withIndex("by_cardCode", (q) => q.eq("cardCode", cardCode))
      .unique();
    if (!card || (!card.accessChannelId && card.status !== "active")) return { kind: "invalid" };
    const { target, channel, problem } = await cardResolution(ctx, card);
    if (problem || (channel && (!channel.redirectEnabled || channel.state !== "active"))) {
      return { kind: "invalid" };
    }
    if (!target || target.kind !== "menu") return { kind: "invalid" };
    const business = await ctx.db.get(card.businessId);
    if (!business) return { kind: "invalid" };

    const link = await resolveMenuCardLink(ctx, card);
    const pagePath = link?.pagePath ?? null;
    if (!link?.position) return { kind: "menu", slug: business.slug, pagePath, session: null };

    const perCard = await rateLimiter.limit(ctx, "menuGuestHopCard", { key: card._id });
    if (!perCard.ok) return { kind: "menu", slug: business.slug, pagePath, session: null };

    const session = await openSession(ctx, {
      menuService: link.menuService,
      position: link.position,
      cardId: card._id,
      deviceToken: isMenuToken(args.deviceToken) ? args.deviceToken : null,
      now: Date.now(),
    });
    return { kind: "menu", slug: business.slug, pagePath, session };
  },
});

async function openSession(
  ctx: MutationCtx,
  input: {
    menuService: Doc<"menuServices">;
    position: Doc<"menuPositions">;
    cardId: Id<"cards">;
    deviceToken: string | null;
    now: number;
  },
): Promise<{ guestToken: string; deviceToken: string }> {
  const { menuService, position, cardId, now } = input;
  const deviceToken = input.deviceToken ?? newMenuToken();
  const deviceKeyHash = await deviceKeyHashFor(menuService._id, deviceToken);
  const guestToken = newMenuToken();
  const tokenHash = await sessionTokenHash(guestToken);
  const expiresAt = now + MENU_GUEST_SESSION_MS;

  const sessions = await ctx.db
    .query("menuGuestSessions")
    .withIndex("by_menuServiceId_and_deviceKeyHash", (q) =>
      q.eq("menuServiceId", menuService._id).eq("deviceKeyHash", deviceKeyHash),
    )
    .order("desc")
    .take(DEVICE_SESSIONS_READ);
  let reused: Doc<"menuGuestSessions"> | null = null;
  for (const session of sessions) {
    if (session.endedAt !== undefined || session.expiresAt <= now) continue;
    if (!reused && session.positionId === position._id) {
      reused = session;
      continue;
    }
    // The same phone moved to another table: the old position stops acting
    // for it at once (a guest is at one place at a time).
    await ctx.db.patch(session._id, { endedAt: now });
  }

  if (reused) {
    // A new token every scan: the old cookie value stops working, the session
    // (and K21's requests on it) continues.
    await ctx.db.patch(reused._id, { tokenHash, cardId, lastSeenAt: now, expiresAt });
    await scheduleExpiry(ctx, reused._id, expiresAt);
  } else {
    const sessionId = await ctx.db.insert("menuGuestSessions", {
      menuServiceId: menuService._id,
      tokenHash,
      deviceKeyHash,
      positionId: position._id,
      cardId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
    await scheduleExpiry(ctx, sessionId, expiresAt);
  }
  return { guestToken, deviceToken };
}

/**
 * The position of a live guest session of THIS venue, or null (no session,
 * ended, another venue's token, archived position). Reads no clock: an
 * expired session disappears when expireSession materializes `endedAt`.
 */
export const sessionView = query({
  args: { slug: v.string(), guestToken: v.string() },
  handler: async (ctx, args) => {
    if (!isMenuToken(args.guestToken)) return null;
    return await viewOf(ctx, args.slug, await sessionTokenHash(args.guestToken));
  },
});

async function viewOf(
  ctx: QueryCtx,
  slug: string,
  tokenHash: string,
): Promise<{ position: { label: string; kind: Doc<"menuPositions">["kind"] }; expiresAt: number } | null> {
  const session = await ctx.db
    .query("menuGuestSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session || session.endedAt !== undefined || !session.positionId) return null;
  const menuService = await ctx.db.get(session.menuServiceId);
  if (!menuService || menuService.status !== "active") return null;
  const business = await ctx.db.get(menuService.businessId);
  if (!business || business.slug !== slug) return null;
  const position = await ctx.db.get(session.positionId);
  if (!position || !position.active || position.menuServiceId !== menuService._id) return null;
  return { position: { label: position.label, kind: position.kind }, expiresAt: session.expiresAt };
}

/** Materializes the end of a session at its expiry (no-op when it was renewed). */
export const expireSession = internalMutation({
  args: { sessionId: v.id("menuGuestSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.endedAt !== undefined) return null;
    const now = Date.now();
    if (session.expiresAt > now) return null;
    await ctx.db.patch(session._id, { endedAt: session.expiresAt });
    return null;
  },
});

/**
 * Cron reserve (convex/crons.ts): ends sessions whose scheduled expiry was
 * lost and deletes sessions that expired more than a day ago, in batches.
 */
export const sweepExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("menuGuestSessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(SESSION_SWEEP_BATCH);
    for (const session of expired) {
      if (session.expiresAt < now - SESSION_RETENTION_MS) {
        await ctx.db.delete(session._id);
      } else if (session.endedAt === undefined) {
        await ctx.db.patch(session._id, { endedAt: session.expiresAt });
      }
    }
    const deletable = expired.filter((session) => session.expiresAt < now - SESSION_RETENTION_MS);
    if (expired.length === SESSION_SWEEP_BATCH && deletable.length > 0) {
      await ctx.scheduler.runAfter(0, internal.menuGuest.sweepExpiredSessions, {});
    }
    return { processed: expired.length };
  },
});
