import { normalizeCode } from "@/convex/lib/codes";
import {
  guestCookieName,
  verifyGuestCookieValue,
} from "@/lib/memories-guest-cookie";

// TASK-16 — GET /m/[code]/whoami: hand the page's own JS its guest identity.
//
// Why this exists: the guest cookie is HttpOnly (client JS cannot read it),
// yet every guest-keyed Convex function takes { code, guestKey } as arguments
// (RFC-001 §2.6 — possession is the capability). The only way client code can
// learn the key it already possesses is a server round-trip that reads the
// cookie and echoes the verified value back. This is that round-trip; it is
// also where the TASK-17 UI will obtain `value` for the localStorage mirror
// that /api/m/[code]/restore consumes.
//
// It MUST live under /m/[code]/ — the cookie is scoped Path=/m/[code], so the
// browser attaches it only to URLs under that path; an /api/m/... twin would
// never see it. Echoing the value to JS does not weaken the design: the
// localStorage mirror is part of the RFC's identity story, and the quota this
// identity carries is a soft limit, not a security boundary.
//
// Machine-to-machine endpoint: responses are JSON status codes, no prose.
export const dynamic = "force-dynamic";

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function json(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      ...BASE_HEADERS,
      "Content-Type": "application/json",
    }),
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/m/[code]/whoami">,
) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) return json(404, { ok: false });

  const secret = process.env.SCANME_GUEST_SECRET;
  if (!secret) return json(503, { ok: false });

  const value = readCookie(request, guestCookieName(code));
  const guestKey =
    value && value.length <= 256
      ? verifyGuestCookieValue(value, code, secret)
      : null;
  if (!guestKey || !value) return json(401, { ok: false });

  return json(200, { ok: true, guestKey, value });
}
