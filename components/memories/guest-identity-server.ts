import { cookies } from "next/headers";
import {
  guestCookieName,
  verifyGuestCookieValue,
} from "@/lib/memories-guest-cookie";

// TASK-17 — server-side read of the guest identity for the /m/[code] pages.
// The pages live under the cookie's Path=/m/[code] scope, so the cookie rides
// the page request itself: the server component can verify the HMAC and hand
// the page a complete, correct first paint — no whoami round-trip before the
// guest sees their state. Server-only (node:crypto via the cookie module).

export interface GuestIdentity {
  guestKey: string | null;
  /** The verified raw cookie value — what the client mirrors to localStorage. */
  cookieValue: string | null;
}

export async function readGuestIdentity(code: string): Promise<GuestIdentity> {
  const secret = process.env.SCANME_GUEST_SECRET;
  if (!secret) return { guestKey: null, cookieValue: null };
  const store = await cookies();
  const value = store.get(guestCookieName(code))?.value ?? null;
  if (!value || value.length > 256) {
    return { guestKey: null, cookieValue: null };
  }
  const guestKey = verifyGuestCookieValue(value, code, secret);
  return guestKey
    ? { guestKey, cookieValue: value }
    : { guestKey: null, cookieValue: null };
}
