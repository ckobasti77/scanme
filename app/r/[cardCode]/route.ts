import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
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

// GET handlers are otherwise cacheable; a cached redirect would send every
// guest to one target (and replay one Set-Cookie), so every response — every
// branch — carries no-store.
const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function redirect(location: string, setCookie?: string) {
  const headers = new Headers({ ...BASE_HEADERS, Location: location });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}

function deviceCategory(userAgent: string) {
  const value = userAgent.toLowerCase();
  if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp/.test(value)) return "bot" as const;
  if (/ipad|tablet/.test(value)) return "tablet" as const;
  if (/mobile|iphone|android/.test(value)) return "mobile" as const;
  if (value) return "desktop" as const;
  return "unknown" as const;
}

// Rate-limit key only: a salted one-way hash of the caller IP. The raw IP is
// never sent to or stored in Convex (GDPR, RFC §2.10); the salt (the guest
// secret) keeps the hash non-reversible by dictionary.
function ipHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  const salt = process.env.SCANME_GUEST_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
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
      ipHash: ipHash(request),
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
