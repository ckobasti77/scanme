// ScanMe Menu V1 (K20) — the card-aware Menu hop: GET /r/[cardCode]/meni
// (plan K19 §3.3). The printed-card resolver sends a scan here when the card
// stands on a table or a room. This handler asks Convex to open the guest
// session (menuGuest.mintFromCard), sets the guest cookies and 302s to the
// CLEAN menu URL — the position never appears in an address.
//
// `(request, deps) => Response` so it is tested without Next or Convex; the
// route file only wires the dependencies. Every branch is no-store, exactly
// like the resolver (lib/card-resolver-http.ts).

import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_DEVICE_MAX_AGE_S,
  MENU_GUEST_SESSION_COOKIE,
  MENU_GUEST_SESSION_MAX_AGE_S,
  MENU_HOP_COOKIE_PATH,
  cookieHeader,
  deviceCookieContext,
  guestMenuPath,
  readCookie,
  sessionCookieContext,
  signCookieValue,
  verifyCookieValue,
} from "../signed-cookie";

export type GuestHopMintOutcome =
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | {
      kind: "menu";
      slug: string;
      pagePath: string | null;
      session: { guestToken: string; deviceToken: string } | null;
    };

export type GuestHopDeps = {
  /** menuGuest.mintFromCard over HTTP; may throw (network). */
  mint(input: { cardCode: string; ipHash: string; deviceToken?: string }): Promise<GuestHopMintOutcome>;
  /** SCANME_GUEST_SECRET; null = no cookies (the menu opens without a position). */
  secret: string | null;
  /** The salted IP hash of the resolver (resolverIpHash). */
  ipHash: string;
  /** Called once when the secret is missing (a deploy problem, logged by the route). */
  onMissingSecret?: () => void;
};

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function redirect(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ ...NO_STORE, Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function handleGuestHop(
  request: Request,
  cardCode: string,
  deps: GuestHopDeps,
): Promise<Response> {
  const invalid = () => redirect(new URL("/r/nevazeca", request.url).toString());
  try {
    const deviceToken = deps.secret
      ? await verifyCookieValue(
          readCookie(request.headers.get("cookie"), MENU_GUEST_DEVICE_COOKIE),
          deps.secret,
          deviceCookieContext(),
        )
      : null;
    const outcome = await deps.mint({
      cardCode,
      ipHash: deps.ipHash,
      ...(deviceToken ? { deviceToken } : {}),
    });
    if (outcome.kind !== "menu") return invalid();

    const menuPath = guestMenuPath(outcome.slug);
    const location = new URL(
      outcome.pagePath ? `${menuPath}/${outcome.pagePath}` : menuPath,
      request.url,
    ).toString();
    if (!outcome.session) return redirect(location);
    if (!deps.secret) {
      deps.onMissingSecret?.();
      return redirect(location);
    }

    const session = await signCookieValue(
      outcome.session.guestToken,
      deps.secret,
      sessionCookieContext(outcome.slug),
    );
    const device = await signCookieValue(outcome.session.deviceToken, deps.secret, deviceCookieContext());
    return redirect(location, [
      cookieHeader(MENU_GUEST_SESSION_COOKIE, session, {
        path: menuPath,
        maxAgeS: MENU_GUEST_SESSION_MAX_AGE_S,
      }),
      cookieHeader(MENU_GUEST_DEVICE_COOKIE, device, {
        path: menuPath,
        maxAgeS: MENU_GUEST_DEVICE_MAX_AGE_S,
      }),
      cookieHeader(MENU_GUEST_DEVICE_COOKIE, device, {
        path: MENU_HOP_COOKIE_PATH,
        maxAgeS: MENU_GUEST_DEVICE_MAX_AGE_S,
      }),
    ]);
  } catch {
    // A failed hop must still land the guest somewhere sensible.
    return invalid();
  }
}
