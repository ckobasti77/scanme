import { normalizeCode } from "@/convex/lib/codes";
import {
  buildGuestCookieValue,
  guestCookieHeader,
  verifyGuestCookieValue,
} from "@/lib/memories-guest-cookie";

// Guest-identity recovery (RFC-001 §2.6, TASK-14 STEP 2): the guest UI mirrors
// the cookie value into localStorage; when the HttpOnly cookie is gone (new
// browser profile quirk, cleared site data, a re-scan overwrote it), the client
// POSTs the mirrored value here. We re-validate the HMAC — the value is
// self-authenticating, no database read — and re-set the cookie. A guest who
// loses both the cookie AND the mirror simply becomes a new guest; that is
// acceptable by design (the quota is a soft limit, not a security boundary).
//
// Machine-to-machine endpoint: responses are JSON status codes, no prose.
export const dynamic = "force-dynamic";

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function json(status: number, body: object, setCookie?: string) {
  const headers = new Headers({
    ...BASE_HEADERS,
    "Content-Type": "application/json",
  });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/m/[code]/restore">,
) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) return json(404, { ok: false });

  const secret = process.env.SCANME_GUEST_SECRET;
  if (!secret) return json(503, { ok: false });

  let value: unknown;
  try {
    const body = (await request.json()) as { value?: unknown };
    value = body.value;
  } catch {
    return json(400, { ok: false });
  }
  if (typeof value !== "string" || value.length > 256) {
    return json(400, { ok: false });
  }

  const guestKey = verifyGuestCookieValue(value, code, secret);
  if (!guestKey) return json(401, { ok: false });

  // Rebuild the canonical value from the verified key (never echo the input),
  // and set it with the exact constraint attributes.
  return json(
    200,
    { ok: true },
    guestCookieHeader(code, buildGuestCookieValue(guestKey, code, secret)),
  );
}
