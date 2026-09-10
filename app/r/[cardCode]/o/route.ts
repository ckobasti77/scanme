import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  resolverIpHash,
  resolverRedirect,
} from "@/lib/card-resolver-http";
import {
  buildOrderingCookieValue,
  orderingCookieHeader,
} from "@/lib/ordering-guest-cookie";

// TASK-63 (RFC-004 §2.2, §2.14) — the card-aware ordering hop:
// GET /r/[cardCode]/o?venue=<venueCode> → mint an ordering guest WITH the card's
// cardId → Set-Cookie (Path=/o/[code]) → 302 to the clean /o/[code] URL.
//
// This route is the ONLY way from a card into ordering. A plain client link to
// /o/[code] is FORBIDDEN: it would skip the minting branch, the guest would have
// no cardId, and an order with no table is worthless — the waiter would not know
// where to carry it. Both the direct table_ordering card (302'd here from the
// /r/[cardCode] resolver) and the bare-splitter ordering button point HERE.
export const dynamic = "force-dynamic";

const redirect = resolverRedirect;

export async function GET(
  request: Request,
  { params }: RouteContext<"/r/[cardCode]/o">,
) {
  const { cardCode } = await params;
  const invalid = () => redirect(new URL("/r/nevazeca", request.url).toString());

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return invalid();

  const venueCode = new URL(request.url).searchParams.get("venue") ?? "";

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const outcome = await convex.mutation(api.cards.resolveTableOrdering, {
      cardCode,
      venueCode,
      ipHash: resolverIpHash(request),
    });

    if (outcome.kind !== "table_ordering") {
      // "invalid" and "rate_limited" read the same to a guest as on the main
      // resolver: ask the staff.
      return invalid();
    }

    // The guest lands on /o/[code] — the venue ordering code, never the card
    // code — already carrying an identity, with a clean URL.
    const location = new URL(`/o/${outcome.code}`, request.url).toString();
    const secret = process.env.SCANME_GUEST_SECRET;
    if (!outcome.guestKey || !secret) {
      // Guest minting was throttled (or the secret is unset): still reach the
      // ordering page, just without an identity cookie.
      return redirect(location);
    }
    return redirect(
      location,
      orderingCookieHeader(
        outcome.code,
        buildOrderingCookieValue(outcome.guestKey, outcome.code, secret),
      ),
    );
  } catch {
    return invalid();
  }
}
