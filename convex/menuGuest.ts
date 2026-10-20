import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { cardResolution } from "./lib/accessResolution";
import { normalizeCode } from "./lib/codes";
import { activeMenuServiceForBusiness } from "./lib/menuAccess";
import { menuRequestChannelValidator, menuPaymentPreferenceValidator } from "./lib/menuDomainValidators";
import { guestActionsOf, loadMenuGuest, type MenuGuest } from "./lib/menuGuestAccess";
import { resolveMenuCardLink } from "./lib/menuQrResolve";
import { applyRequestAction } from "./lib/menuRequests";
import { rateLimiter } from "./lib/rateLimits";
import { getUrl as storageGetUrl } from "./lib/storage";
import {
  MENU_PUBLIC_MEDIA_CAP,
  activeBusinessBySlug,
  publicParts,
  publicServiceOf,
  splitterOf,
  type PublicService,
} from "./menuPublic";
import {
  checkOrderShape,
  isOrderAttemptKey,
  priceOrder,
  type CartArticle,
  type OrderLineInput,
  type OrderTotals,
} from "../lib/menu/cart";
import { REQUEST_ERROR, type RequestErrorCode } from "../lib/menu/errors/requests";
import { MENU_ROOM_SERVICE_PATH, type GuestActions } from "../lib/menu/guest-actions";
import type { PublicImage } from "../lib/menu/public-view";
import {
  MENU_MAX_CART_LINES,
  MENU_MAX_MY_REQUESTS,
  MENU_MAX_OPEN_ORDERS_PER_DEVICE,
  MENU_MAX_OPEN_ORDERS_PER_POSITION,
  MENU_REQUEST_DEDUPE_MS,
} from "../lib/menu/limits";
import type { MenuPaymentPreference, MenuRequestChannel, MenuRequestKind, MenuRequestStatus } from "../lib/menu/request-status";
import {
  MENU_PART_ROOM_SERVICE,
  parsePublicPage,
  parseRoomService,
} from "../lib/menu/snapshot";
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
// K21 adds the guest actions on top of that session (master §8; plan K19
// §4.2, K19-5…K19-10): call the waiter, ask for the bill (cash or card), send
// an order to the waiter for review (standard pages, or Room service from a
// room) and "Moji zahtevi" with cancelling a request that is still `new`.
// The Next server actions of the public menu call the writes with the
// HttpOnly cookies (the raw tokens never reach the page); the phone reads its
// own requests with the device's venue-scoped hash (`myRequests`). Every
// write checks the session, the venue's switches and three buckets (the IP,
// the guest, the position), and returns refusals as values so a spent bucket
// stays spent. Nothing here sends anything to a kitchen or takes a payment.
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
    // K21: a room card without its own page opens Room service when the room can order from it.
    if (pagePath === null && link.position.kind === "room") {
      const { actions } = await guestActionsOf(ctx, { business, menuService: link.menuService, position: link.position });
      if (actions.roomService) return { kind: "menu", slug: business.slug, pagePath: MENU_ROOM_SERVICE_PATH, session };
    }
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
 * The position of a live guest session of THIS venue and (K21) the actions it
 * offers right now, or null (no session, ended, another venue's token,
 * archived position). Reads no clock: an expired session disappears when
 * expireSession materializes `endedAt`.
 */
export const sessionView = query({
  args: { slug: v.string(), guestToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    position: { label: string; kind: Doc<"menuPositions">["kind"] };
    actions: GuestActions;
    expiresAt: number;
  } | null> => {
    const guest = await loadMenuGuest(ctx, args, null);
    if (!guest) return null;
    const { actions } = await guestActionsOf(ctx, guest);
    return {
      position: { label: guest.position.label, kind: guest.position.kind },
      actions,
      expiresAt: guest.session.expiresAt,
    };
  },
});

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

// =============================================================================
// K21 — the guest actions
// =============================================================================

/** What a guest action answers. Refusals are values: a bucket spent before a refusal stays spent. */
export type GuestRequestOutcome =
  | {
      ok: true;
      /** null when the open call or bill of the table was sent from another phone (its id is not this guest's). */
      requestId: Id<"menuRequests"> | null;
      status: MenuRequestStatus;
      createdAt: number;
      /** The open call or bill of this table, or the order of this send attempt, was returned instead of a new one (K19-7). */
      deduped: boolean;
      /** Orders: the sums written on the request. */
      totals: OrderTotals | null;
      /** Bills: the way of paying the request carries now (another phone may have chosen it). */
      paymentPreference: MenuPaymentPreference | null;
    }
  | {
      ok: false;
      code: RequestErrorCode;
      /** cart_unavailable: the articles "Privremeno nedostupno" right now. */
      unavailableKeys?: string[];
      /** cart_stale: the indexes of the lines whose article, variant or add-on is gone. */
      staleLines?: number[];
      /** cart_price_changed: today's price of every line and the new totals. */
      prices?: { index: number; pieceRsd: number; lineTotalRsd: number }[];
      totals?: OrderTotals;
    };

const refused = (code: RequestErrorCode): { ok: false; code: RequestErrorCode } => ({ ok: false, code });

const ipKeyOf = (ipHash: string | undefined) => (ipHash && IP_HASH_PATTERN.test(ipHash) ? ipHash : "shared");

async function ipAllowed(ctx: MutationCtx, ipHash: string | undefined): Promise<boolean> {
  return (await rateLimiter.limit(ctx, "menuGuestActionIp", { key: ipKeyOf(ipHash) })).ok;
}

/** The open (new or accepted) request of this kind at the position, if any. */
async function openRequestOf(
  ctx: MutationCtx,
  positionId: Id<"menuPositions">,
  kind: MenuRequestKind,
  now: number,
): Promise<Doc<"menuRequests"> | null> {
  for (const status of ["new", "accepted"] as const) {
    const open = await ctx.db
      .query("menuRequests")
      .withIndex("by_positionId_and_kind_and_status", (q) =>
        q.eq("positionId", positionId).eq("kind", kind).eq("status", status),
      )
      .order("desc")
      .first();
    // Only a recent one: a call nobody finished hours ago must not swallow a new call.
    if (open && now - open.createdAt < MENU_REQUEST_DEDUPE_MS) return open;
  }
  return null;
}

async function insertRequest(
  ctx: MutationCtx,
  guest: MenuGuest,
  input: {
    kind: MenuRequestKind;
    channel: MenuRequestChannel;
    paymentPreference?: MenuPaymentPreference;
    order?: { itemCount: number; totals: OrderTotals; versionNumber: number; clientRequestId: string | null };
  },
  now: number,
): Promise<Id<"menuRequests">> {
  const card = guest.session.cardId ? await ctx.db.get(guest.session.cardId) : null;
  const order = input.order;
  return await ctx.db.insert("menuRequests", {
    menuServiceId: guest.menuService._id,
    businessId: guest.business._id,
    kind: input.kind,
    status: "new",
    channel: input.channel,
    positionId: guest.position._id,
    positionLabel: guest.position.label,
    positionKind: guest.position.kind,
    ...(guest.position.zoneId ? { zoneId: guest.position.zoneId } : {}),
    ...(card && card.businessId === guest.business._id ? { cardId: card._id, sourceLabel: card.label } : {}),
    guestSessionId: guest.session._id,
    deviceKeyHash: guest.session.deviceKeyHash,
    ...(input.paymentPreference ? { paymentPreference: input.paymentPreference } : {}),
    ...(order
      ? {
          itemCount: order.itemCount,
          subtotalRsd: order.totals.subtotalRsd,
          ...(input.channel === "room_service" ? { deliveryFeeRsd: order.totals.deliveryFeeRsd } : {}),
          totalRsd: order.totals.totalRsd,
          versionNumber: order.versionNumber,
          ...(order.clientRequestId ? { clientRequestId: order.clientRequestId } : {}),
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  });
}

/** Call the waiter or ask for the bill: one open request of each kind per position (K19-7). */
async function tableRequest(
  ctx: MutationCtx,
  args: { slug: string; guestToken: string; ipHash?: string },
  kind: "call" | "bill",
  payment: MenuPaymentPreference | null,
): Promise<GuestRequestOutcome> {
  const now = Date.now();
  const guest = await loadMenuGuest(ctx, args, now);
  if (!guest) return refused(REQUEST_ERROR.noSession);
  if (!(await ipAllowed(ctx, args.ipHash))) return refused(REQUEST_ERROR.rateLimited);
  const { served, actions } = await guestActionsOf(ctx, guest);
  if (!served) return refused(REQUEST_ERROR.menuUnavailable);
  if (!(kind === "call" ? actions.call : actions.bill)) return refused(REQUEST_ERROR.actionOff);

  const open = await openRequestOf(ctx, guest.position._id, kind, now);
  if (open) {
    let paymentPreference = open.paymentPreference ?? null;
    // The table changed its mind about how to pay while nobody took the bill yet
    // (a write the panel sees, so it spends the guest's bucket).
    if (kind === "bill" && payment && open.status === "new" && open.paymentPreference !== payment) {
      if (!(await rateLimiter.limit(ctx, "menuGuestSession", { key: guest.session._id })).ok) {
        return refused(REQUEST_ERROR.rateLimited);
      }
      await ctx.db.patch(open._id, { paymentPreference: payment, updatedAt: now });
      paymentPreference = payment;
    }
    const mine = open.deviceKeyHash === guest.session.deviceKeyHash;
    return {
      ok: true,
      requestId: mine ? open._id : null,
      status: open.status,
      createdAt: open.createdAt,
      deduped: true,
      totals: null,
      paymentPreference,
    };
  }

  if (!(await rateLimiter.limit(ctx, "menuGuestSession", { key: guest.session._id })).ok) {
    return refused(REQUEST_ERROR.rateLimited);
  }
  if (!(await rateLimiter.limit(ctx, kind === "call" ? "menuCall" : "menuBill", { key: guest.position._id })).ok) {
    return refused(REQUEST_ERROR.rateLimited);
  }
  const requestId = await insertRequest(
    ctx,
    guest,
    { kind, channel: "standard", ...(payment ? { paymentPreference: payment } : {}) },
    now,
  );
  return { ok: true, requestId, status: "new", createdAt: now, deduped: false, totals: null, paymentPreference: payment };
}

const guestArgs = { slug: v.string(), guestToken: v.string(), ipHash: v.optional(v.string()) };

/** `Pozovi konobara` (master §8.1). Tables and other spots only, never a room (K19-5). */
export const callWaiter = mutation({
  args: guestArgs,
  handler: async (ctx, args): Promise<GuestRequestOutcome> => await tableRequest(ctx, args, "call", null),
});

/** `Zatraži račun` with cash or card: a preference for the waiter, never a payment (master §8.1, §8.2). */
export const requestBill = mutation({
  args: { ...guestArgs, payment: menuPaymentPreferenceValidator },
  handler: async (ctx, args): Promise<GuestRequestOutcome> => await tableRequest(ctx, args, "bill", args.payment),
});

/** The published articles an order may name: its standard pages, or the Room service part. */
async function publishedArticles(
  ctx: MutationCtx,
  served: PublicService,
  channel: MenuRequestChannel,
  pageKeys: readonly string[],
): Promise<{ find: (line: OrderLineInput) => CartArticle | null; deliveryFeeRsd: number | null } | null> {
  const lang = served.version.languages[0] ?? "sr";
  if (channel === "room_service") {
    const parts = await publicParts(ctx, served.version._id, lang, MENU_PART_ROOM_SERVICE);
    if (parts.length === 0) return null;
    const doc = parseRoomService(parts);
    const byKey = new Map<string, CartArticle>();
    for (const category of doc.categories) for (const article of category.articles) byKey.set(article.key, article);
    return { find: (line) => byKey.get(line.articleKey) ?? null, deliveryFeeRsd: doc.deliveryFeeRsd };
  }
  const splitter = await splitterOf(ctx, served, lang);
  if (!splitter) return null;
  const pages = new Map<string, Map<string, CartArticle>>();
  for (const pageKey of pageKeys) {
    // Only a page guests can open right now; anything else leaves its lines stale.
    if (!splitter.pages.some((page) => page.key === pageKey)) continue;
    const doc = parsePublicPage(await publicParts(ctx, served.version._id, lang, pageKey));
    if (!doc) continue;
    const byKey = new Map<string, CartArticle>();
    for (const section of doc.sections) for (const article of section.articles) byKey.set(article.key, article);
    pages.set(pageKey, byKey);
  }
  return {
    find: (line) => (line.pageKey ? pages.get(line.pageKey)?.get(line.articleKey) ?? null : null),
    deliveryFeeRsd: null,
  };
}

const orderLineValidator = v.object({
  pageKey: v.optional(v.union(v.string(), v.null())),
  articleKey: v.string(),
  variantKey: v.optional(v.union(v.string(), v.null())),
  addonKeys: v.array(v.string()),
  quantity: v.number(),
  note: v.optional(v.union(v.string(), v.null())),
});

/**
 * An order for the waiter to review (master §8.2): the cart of a table from
 * the standard pages, or a Room service order from a room (K19-8, K19-9).
 * The server re-prices every line from the LIVE published version (names in
 * the menu's source language, the same `linePrice` the phone uses), refuses
 * an unavailable or vanished article as a whole, and asks for a confirmation
 * when the total differs from `seenTotalRsd`. Names and prices are written as
 * a snapshot; a later publication never changes a sent order.
 */
export const submitOrder = mutation({
  args: {
    ...guestArgs,
    channel: menuRequestChannelValidator,
    lines: v.array(orderLineValidator),
    seenTotalRsd: v.number(),
    // The phone's key of this send attempt: a retry after a lost answer gets the order already written.
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GuestRequestOutcome> => {
    // Cheap shape checks first: a malformed order never spends a bucket.
    const shape = checkOrderShape({ channel: args.channel, lines: args.lines, seenTotalRsd: args.seenTotalRsd });
    if (!shape.ok) return refused(shape.code);
    if (args.clientRequestId !== undefined && !isOrderAttemptKey(args.clientRequestId)) {
      return refused(REQUEST_ERROR.invalidInput);
    }
    const now = Date.now();
    const guest = await loadMenuGuest(ctx, args, now);
    if (!guest) return refused(REQUEST_ERROR.noSession);
    if (args.clientRequestId) {
      const sent = await ctx.db
        .query("menuRequests")
        .withIndex("by_guestSessionId_and_clientRequestId", (q) =>
          q.eq("guestSessionId", guest.session._id).eq("clientRequestId", args.clientRequestId),
        )
        .first();
      if (sent) {
        return {
          ok: true,
          requestId: sent._id,
          status: sent.status,
          createdAt: sent.createdAt,
          deduped: true,
          totals:
            sent.totalRsd !== undefined
              ? { subtotalRsd: sent.subtotalRsd ?? sent.totalRsd, deliveryFeeRsd: sent.deliveryFeeRsd ?? 0, totalRsd: sent.totalRsd }
              : null,
          paymentPreference: null,
        };
      }
    }
    if (!(await ipAllowed(ctx, args.ipHash))) return refused(REQUEST_ERROR.rateLimited);
    const { served, actions } = await guestActionsOf(ctx, guest);
    if (!served) return refused(REQUEST_ERROR.menuUnavailable);
    if (!(args.channel === "room_service" ? actions.roomService : actions.order)) {
      return refused(REQUEST_ERROR.actionOff);
    }
    // Spent before the version is read, so refused carts are bounded per guest and per table too.
    if (!(await rateLimiter.limit(ctx, "menuGuestSession", { key: guest.session._id })).ok) {
      return refused(REQUEST_ERROR.rateLimited);
    }
    if (!(await rateLimiter.limit(ctx, "menuOrderAttempt", { key: guest.position._id })).ok) {
      return refused(REQUEST_ERROR.rateLimited);
    }
    // Flood guard: a table (or one phone) with several orders still waiting for the waiter sends no more.
    const openAtPosition = await ctx.db
      .query("menuRequests")
      .withIndex("by_positionId_and_kind_and_status", (q) =>
        q.eq("positionId", guest.position._id).eq("kind", "order").eq("status", "new"),
      )
      .take(MENU_MAX_OPEN_ORDERS_PER_POSITION);
    const openOfDevice = openAtPosition.filter((row) => row.deviceKeyHash === guest.session.deviceKeyHash).length;
    if (openAtPosition.length >= MENU_MAX_OPEN_ORDERS_PER_POSITION || openOfDevice >= MENU_MAX_OPEN_ORDERS_PER_DEVICE) {
      return refused(REQUEST_ERROR.tooManyOpen);
    }

    const published = await publishedArticles(ctx, served, args.channel, shape.pageKeys);
    if (!published) return refused(REQUEST_ERROR.menuUnavailable);
    const unavailable = new Set<string>();
    for (const articleKey of new Set(shape.lines.map((line) => line.articleKey))) {
      const row = await ctx.db
        .query("menuAvailability")
        .withIndex("by_menuServiceId_and_articleKey", (q) =>
          q.eq("menuServiceId", guest.menuService._id).eq("articleKey", articleKey),
        )
        .first();
      if (row) unavailable.add(articleKey);
    }
    const pricing = priceOrder({
      channel: args.channel,
      lines: shape.lines,
      seenTotalRsd: args.seenTotalRsd,
      findArticle: published.find,
      unavailable,
      deliveryFeeRsd: published.deliveryFeeRsd,
      nowMs: now,
    });
    if (!pricing.ok) return pricing;

    // The table's bucket is spent only by an order that is really written.
    if (!(await rateLimiter.limit(ctx, "menuOrder", { key: guest.position._id })).ok) {
      return refused(REQUEST_ERROR.rateLimited);
    }
    const requestId = await insertRequest(
      ctx,
      guest,
      {
        kind: "order",
        channel: args.channel,
        order: {
          itemCount: pricing.lines.length,
          totals: pricing.totals,
          versionNumber: served.version.number,
          clientRequestId: args.clientRequestId ?? null,
        },
      },
      now,
    );
    for (const [index, line] of pricing.lines.entries()) {
      await ctx.db.insert("menuRequestItems", {
        requestId,
        menuServiceId: guest.menuService._id,
        ...(line.pageKey ? { pageKey: line.pageKey } : {}),
        articleKey: line.articleKey,
        name: line.name,
        ...(line.variantKey ? { variantKey: line.variantKey } : {}),
        ...(line.price.variantName ? { variantName: line.price.variantName } : {}),
        addons: line.price.addons,
        unitPriceRsd: line.price.unitPriceRsd,
        quantity: line.quantity,
        lineTotalRsd: line.price.lineTotalRsd,
        ...(line.price.promoApplied ? { promoApplied: true } : {}),
        ...(line.note ? { note: line.note } : {}),
        order: index,
      });
    }
    return { ok: true, requestId, status: "new", createdAt: now, deduped: false, totals: pricing.totals, paymentPreference: null };
  },
});

/**
 * The guest cancels their own request while it is still `new` (master §8.4;
 * K19-6, K19-10). The device cookie identifies the guest; another device, a
 * request of another venue and a request that does not exist all answer
 * `request/not_found`.
 */
export const cancelRequest = mutation({
  args: { slug: v.string(), deviceToken: v.string(), requestId: v.string(), ipHash: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true; status: MenuRequestStatus } | { ok: false; code: RequestErrorCode }> => {
    if (!isMenuToken(args.deviceToken)) return refused(REQUEST_ERROR.noSession);
    if (!(await ipAllowed(ctx, args.ipHash))) return refused(REQUEST_ERROR.rateLimited);
    const business = await activeBusinessBySlug(ctx, args.slug);
    const menuService = business ? await activeMenuServiceForBusiness(ctx, business._id) : null;
    const requestId = ctx.db.normalizeId("menuRequests", args.requestId);
    if (!menuService || !requestId) return refused(REQUEST_ERROR.notFound);
    const request = await ctx.db.get(requestId);
    const deviceKeyHash = await deviceKeyHashFor(menuService._id, args.deviceToken);
    if (!request || request.menuServiceId !== menuService._id || request.deviceKeyHash !== deviceKeyHash) {
      return refused(REQUEST_ERROR.notFound);
    }
    if (!(await rateLimiter.limit(ctx, "menuGuestCancel", { key: deviceKeyHash })).ok) {
      return refused(REQUEST_ERROR.rateLimited);
    }
    const result = await applyRequestAction(ctx, request, "cancel", { kind: "guest" }, Date.now());
    return result.ok ? { ok: true, status: result.status } : result;
  },
});

const DEVICE_KEY_PATTERN = /^[0-9a-f]{64}$/;

export type MyRequestItem = {
  name: string;
  variantName: string | null;
  addons: { optionName: string; priceDeltaRsd: number }[];
  quantity: number;
  unitPriceRsd: number;
  lineTotalRsd: number;
  note: string | null;
};

export type MyRequest = {
  id: Id<"menuRequests">;
  kind: MenuRequestKind;
  status: MenuRequestStatus;
  channel: MenuRequestChannel;
  positionLabel: string;
  paymentPreference: MenuPaymentPreference | null;
  subtotalRsd: number | null;
  deliveryFeeRsd: number | null;
  totalRsd: number | null;
  createdAt: number;
  acceptedAt: number | null;
  doneAt: number | null;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
  items: MyRequestItem[];
};

/**
 * "Moji zahtevi" (master §8.4; K19-10): this device's newest requests in this
 * venue, with their lines. `deviceKey` is the device's venue-scoped hash (the
 * page computes it from the HttpOnly device cookie): it can only READ this
 * list — cancelling needs the device token itself. Returns no staff names and
 * no ids of positions, cards or sessions. Reads no clock: the phone shows the
 * last 12 hours.
 */
export const myRequests = query({
  args: { slug: v.string(), deviceKey: v.string() },
  handler: async (ctx, args): Promise<MyRequest[] | null> => {
    if (!DEVICE_KEY_PATTERN.test(args.deviceKey)) return null;
    const business = await activeBusinessBySlug(ctx, args.slug);
    if (!business) return null;
    const menuService = await activeMenuServiceForBusiness(ctx, business._id);
    if (!menuService) return null;
    const rows = await ctx.db
      .query("menuRequests")
      .withIndex("by_menuServiceId_and_deviceKeyHash_and_createdAt", (q) =>
        q.eq("menuServiceId", menuService._id).eq("deviceKeyHash", args.deviceKey),
      )
      .order("desc")
      .take(MENU_MAX_MY_REQUESTS);
    const out: MyRequest[] = [];
    for (const row of rows) {
      const items =
        row.kind === "order"
          ? await ctx.db
              .query("menuRequestItems")
              .withIndex("by_requestId", (q) => q.eq("requestId", row._id))
              .take(MENU_MAX_CART_LINES)
          : [];
      out.push({
        id: row._id,
        kind: row.kind,
        status: row.status,
        channel: row.channel,
        positionLabel: row.positionLabel,
        paymentPreference: row.paymentPreference ?? null,
        subtotalRsd: row.subtotalRsd ?? null,
        deliveryFeeRsd: row.deliveryFeeRsd ?? null,
        totalRsd: row.totalRsd ?? null,
        createdAt: row.createdAt,
        acceptedAt: row.acceptedAt ?? null,
        doneAt: row.doneAt ?? null,
        cancelledAt: row.cancelledAt ?? null,
        cancelledBy: row.cancelledBy ?? null,
        items: items
          .sort((a, b) => a.order - b.order)
          .map((item) => ({
            name: item.name,
            variantName: item.variantName ?? null,
            addons: item.addons.map((addon) => ({ optionName: addon.optionName, priceDeltaRsd: addon.priceDeltaRsd })),
            quantity: item.quantity,
            unitPriceRsd: item.unitPriceRsd,
            lineTotalRsd: item.lineTotalRsd,
            note: item.note ?? null,
          })),
      });
    }
    return out;
  },
});

/**
 * Signed URLs of the Room service images (K21, the twin of menuPublic.pageMedia
 * for the `_rs` part): read once by the server render of /[slug]/meni/room-service,
 * never subscribed. Only ready assets of the venue itself, at most
 * MENU_PUBLIC_MEDIA_CAP point reads; an article without an entry shows its icon.
 * Empty while Room service is not live.
 */
export const roomServiceMedia = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<Record<string, PublicImage>> => {
    const out: Record<string, PublicImage> = {};
    const business = await activeBusinessBySlug(ctx, args.slug);
    if (!business) return out;
    const served = await publicServiceOf(ctx, business);
    if (!served || !served.menuService.features.roomService) return out;
    const parts = await publicParts(ctx, served.version._id, served.version.languages[0] ?? "sr", MENU_PART_ROOM_SERVICE);
    if (parts.length === 0) return out;
    const ids = new Set<string>();
    for (const category of parseRoomService(parts).categories) {
      for (const article of category.articles) {
        if (article.media.mode === "image" && article.media.imageMediaId) ids.add(article.media.imageMediaId);
      }
    }
    for (const id of [...ids].slice(0, MENU_PUBLIC_MEDIA_CAP)) {
      const assetId = ctx.db.normalizeId("mediaAssets", id);
      if (!assetId) continue;
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.status !== "ready" || asset.businessId !== business._id) continue;
      const thumbUrl = await storageGetUrl(ctx, asset.variants.thumb.ref as Id<"_storage">);
      const url = await storageGetUrl(ctx, asset.variants.webp.ref as Id<"_storage">);
      if (!thumbUrl || !url) continue;
      out[id] = { thumbUrl, url, width: asset.variants.webp.width, height: asset.variants.webp.height };
    }
    return out;
  },
});
