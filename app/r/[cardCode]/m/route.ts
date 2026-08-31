import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  resolverIpHash,
  resolverRedirect,
} from "@/lib/card-resolver-http";
import {
  buildGuestCookieValue,
  guestCookieHeader,
} from "@/lib/memories-guest-cookie";

// TASK-37 (RFC-002 §2.4) — the splitter's card-aware Memories hop:
// GET /r/[cardCode]/m?space=<spaceCode> → mint guest WITH the card's cardId →
// Set-Cookie (Path=/m/[code]) → 302 to the clean /m/[code] URL.
//
// This route is the ONLY way from a bare splitter into Memories. A plain
// client link from the splitter page to /m/[code] is FORBIDDEN: it would skip
// the minting branch, the guest would have no cardId, the table identity
// would be lost and the per-table quota (the Memories billing model) would
// silently die. The splitter page's Memories button must always point HERE.
export const dynamic = "force-dynamic";

const redirect = resolverRedirect;

export async function GET(
  request: Request,
  { params }: RouteContext<"/r/[cardCode]/m">,
) {
  const { cardCode } = await params;
  const invalid = () => redirect(new URL("/r/nevazeca", request.url).toString());

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return invalid();

  const spaceCode = new URL(request.url).searchParams.get("space") ?? "";

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const outcome = await convex.mutation(api.cards.resolveSplitterMemories, {
      cardCode,
      spaceCode,
      ipHash: resolverIpHash(request),
    });

    if (outcome.kind !== "memories_space") {
      // "invalid" and "rate_limited" read the same to a guest as on the main
      // resolver: ask the staff.
      return invalid();
    }

    // Same cookie semantics as the direct memories_space resolve: the guest
    // lands on /m/[code] — the SPACE code, never the card code — already
    // authenticated, with a clean URL.
    const location = new URL(`/m/${outcome.code}`, request.url).toString();
    const secret = process.env.SCANME_GUEST_SECRET;
    if (!outcome.guestKey || !secret) {
      // Guest minting was throttled (or the secret is unset): still reach
      // the space, just without an identity cookie.
      return redirect(location);
    }
    return redirect(
      location,
      guestCookieHeader(
        outcome.code,
        buildGuestCookieValue(outcome.guestKey, outcome.code, secret),
      ),
    );
  } catch {
    return invalid();
  }
}
