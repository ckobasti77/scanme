import { cookies } from "next/headers";
import {
  shiftCookieName,
  verifyShiftCookieValue,
} from "@/lib/ordering-shift-cookie";

// TASK-68 — server-side read of the shift bearer for /panel/[venueCode].
//
// A fork of ./guest-identity-server.ts for the panel, matching the fork of the
// cookie module itself (lib/ordering-shift-cookie.ts). The page lives under the
// cookie's Path=/panel/[code] scope, so a tablet that reloads the panel after a
// PIN login gets the shift back in the FIRST paint — no PIN again, no whoami
// round-trip. Server-only (node:crypto via the cookie module).
//
// A null bearer means: no PIN login on this device yet, the cookie expired, or
// the value failed the HMAC. Whether a non-null bearer is still THE bearer of
// an open shift is Convex's call (orderingPanel.panelView), not this file's.

export async function readShiftBearer(code: string): Promise<string | null> {
  const secret = process.env.SCANME_GUEST_SECRET;
  if (!secret) return null;
  const store = await cookies();
  const value = store.get(shiftCookieName(code))?.value ?? null;
  if (!value || value.length > 256) return null;
  return verifyShiftCookieValue(value, code, secret);
}
