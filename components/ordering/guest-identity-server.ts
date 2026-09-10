import { cookies } from "next/headers";
import {
  orderingCookieName,
  verifyOrderingCookieValue,
} from "@/lib/ordering-guest-cookie";

// TASK-66 — server-side read of the ordering guest identity for /o/[code].
//
// A deliberate fork of components/memories/guest-identity-server.ts, matching
// the fork of the cookie module itself (see lib/ordering-guest-cookie.ts): two
// independent products, two cookie names, two Path scopes, and no shared file
// whose edit could silently reshape the other.
//
// The page lives under the cookie's Path=/o/[code] scope, so the cookie rides
// the page request and the server component can verify the HMAC and render the
// correct first paint — no whoami round-trip before the guest sees the two
// buttons. Server-only (node:crypto via the cookie module).
//
// A null guestKey means the identity never arrived: the mint was throttled, the
// guest reached /o/[code] by a link instead of the card-aware hop, or the
// cookie was cleared. The surface must then refuse both actions and tell the
// guest to re-scan the card on the table — the alternative, a request with no
// table, is worthless to the waiter (RFC-004 §2.2, risk #1).

export interface OrderingGuestIdentity {
  guestKey: string | null;
}

export async function readOrderingIdentity(
  code: string,
): Promise<OrderingGuestIdentity> {
  const secret = process.env.SCANME_GUEST_SECRET;
  if (!secret) return { guestKey: null };
  const store = await cookies();
  const value = store.get(orderingCookieName(code))?.value ?? null;
  if (!value || value.length > 256) return { guestKey: null };
  return { guestKey: verifyOrderingCookieValue(value, code, secret) };
}
