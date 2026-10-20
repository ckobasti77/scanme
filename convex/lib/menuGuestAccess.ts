import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getMenuCapabilities } from "./menuCapabilities";
import { activeBusinessBySlug, publicServiceOf, splitterOf, type PublicService } from "../menuPublic";
import { guestActionsFor, NO_GUEST_ACTIONS, type GuestActions } from "../../lib/menu/guest-actions";
import { isMenuToken, sessionTokenHash } from "../../lib/menu/tokens";

// =============================================================================
// ScanMe Menu V1 (K21) — who a guest is (master §9.1; plan K19 §4.2, K19-2).
//
// A guest has no account. What identifies a guest action is the live server
// session a scanned position card opened (convex/menuGuest.ts mintFromCard):
// the 256-bit token rides the HttpOnly cookie smm_g and only its hash is
// stored. A session counts only when
//   - its token hash exists and it has not ended (a mutation also compares
//     `expiresAt` with the clock; a query sees only the materialized end),
//   - the venue named by the slug is active and owns the session's service,
//   - the service is active, and
//   - the position is still active in the same service.
// Anything else is "no session": another venue's token, an archived table and
// a forged token all look the same (no oracle). The position always comes
// from the session, never from an argument.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

export type MenuGuest = {
  session: Doc<"menuGuestSessions">;
  business: Doc<"businesses">;
  menuService: Doc<"menuServices">;
  position: Doc<"menuPositions">;
};

/**
 * The live guest of `slug` behind `guestToken`, or null. `now` is the clock
 * of a mutation (an expired but not yet materialized session is refused);
 * queries pass null and rely on the materialized `endedAt`.
 */
export async function loadMenuGuest(
  ctx: DatabaseCtx,
  args: { slug: string; guestToken: string },
  now: number | null,
): Promise<MenuGuest | null> {
  if (!isMenuToken(args.guestToken)) return null;
  const tokenHash = await sessionTokenHash(args.guestToken);
  const session = await ctx.db
    .query("menuGuestSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session || session.endedAt !== undefined || !session.positionId) return null;
  if (now !== null && session.expiresAt <= now) return null;
  const business = await activeBusinessBySlug(ctx, args.slug);
  if (!business) return null;
  const menuService = await ctx.db.get(session.menuServiceId);
  if (!menuService || menuService.status !== "active" || menuService.businessId !== business._id) return null;
  const position = await ctx.db.get(session.positionId);
  if (!position || !position.active || position.menuServiceId !== menuService._id) return null;
  return { session, business, menuService, position };
}

/**
 * What this guest may do right now (lib/menu/guest-actions.ts), with the
 * published menu it applies to. No published new-model menu = no actions.
 * Premium and the Room service part are read only for a room whose venue
 * has Room service and ordering on.
 */
export async function guestActionsOf(
  ctx: DatabaseCtx,
  guest: Pick<MenuGuest, "business" | "menuService" | "position">,
): Promise<{ served: PublicService | null; actions: GuestActions }> {
  const served = await publicServiceOf(ctx, guest.business);
  if (!served || served.menuService._id !== guest.menuService._id) return { served: null, actions: NO_GUEST_ACTIONS };
  const features = served.menuService.features;
  const kind = guest.position.kind;
  let premiumRoomService = false;
  let roomServicePublished = false;
  if (kind === "room" && features.roomService && features.ordering) {
    premiumRoomService = (await getMenuCapabilities(ctx, guest.business._id)).roomService;
    if (premiumRoomService) {
      const splitter = await splitterOf(ctx, served, served.version.languages[0] ?? "sr");
      roomServicePublished = splitter?.roomService === true;
    }
  }
  return { served, actions: guestActionsFor({ features, kind, premiumRoomService, roomServicePublished }) };
}
