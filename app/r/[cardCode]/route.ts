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

// The printed-card resolver (RFC-001 §2.7, TASK-14 STEP 1): GET /r/[cardCode]
// → server-side 302. This URL is the only thing printed on physical cards, so
// every outcome must be a redirect a browser (or a JS-less scanner) follows.
//
// Server-side on purpose: (a) the HttpOnly guest cookie can only ride a server
// response; (b) Set-Cookie on the redirect means /m/[code] arrives already
// authenticated with a CLEAN URL — no card code in the address bar or in
// referrers; (c) a printed-card tap must not depend on JS.
export const dynamic = "force-dynamic";

// The no-store redirect and the salted IP hash live in
// lib/card-resolver-http.ts, shared with the splitter's /m hop (TASK-37).
const redirect = resolverRedirect;

function deviceCategory(userAgent: string) {
  const value = userAgent.toLowerCase();
  if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp/.test(value)) return "bot" as const;
  if (/ipad|tablet/.test(value)) return "tablet" as const;
  if (/mobile|iphone|android/.test(value)) return "mobile" as const;
  if (value) return "desktop" as const;
  return "unknown" as const;
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/r/[cardCode]">,
) {
  const { cardCode } = await params;
  const invalid = () => redirect(new URL("/r/nevazeca", request.url).toString());

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return invalid();

  try {
    // requestId is GENERATED HERE, server-side, and is the only idempotency
    // token this pipeline has. It is never read from the request: RFC §1.e
    // audited the Links endpoints where client-supplied UUIDs let anyone
    // inflate counters — every new endpoint closes that hole.
    const requestId = crypto.randomUUID();
    const convex = new ConvexHttpClient(convexUrl);
    const outcome = await convex.mutation(api.cards.resolveAndRecord, {
      cardCode,
      requestId,
      deviceCategory: deviceCategory(request.headers.get("user-agent") ?? ""),
      ipHash: resolverIpHash(request),
    });

    switch (outcome.kind) {
      case "venue":
        return redirect(
          new URL(`/${outcome.businessSlug}/venue`, request.url).toString(),
        );
      case "event":
        return redirect(
          new URL(
            `/${outcome.businessSlug}/venue/${outcome.eventSlug}`,
            request.url,
          ).toString(),
        );
      case "service_page":
        return redirect(new URL(`/${outcome.slug}`, request.url).toString());
      case "splitter":
        // TASK-37: the bare splitter page. cardCode comes back normalized
        // from the resolver, so the URL is canonical.
        return redirect(
          new URL(`/r/${outcome.cardCode}/izbor`, request.url).toString(),
        );
      case "url":
        // External target, already validated by isSafePublicDestination.
        return redirect(outcome.url);
      case "memories_space": {
        // The guest lands on /m/[code] — the SPACE code, never the card code.
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
      }
      default:
        // "invalid" and "rate_limited" — a dead card and a throttled flood
        // read the same to a guest: ask the staff.
        return invalid();
    }
  } catch {
    // A resolver failure must still land the guest somewhere sensible.
    return invalid();
  }
}
