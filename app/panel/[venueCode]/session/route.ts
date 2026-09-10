import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { SHIFT_ERROR } from "@/convex/orderingShifts";
import {
  buildShiftCookieValue,
  clearShiftCookieHeader,
  shiftCookieHeader,
} from "@/lib/ordering-shift-cookie";

// TASK-68 (RFC-004 §2.7) — the panel's session route.
//
// POST {pin}  → orderingShifts.openShift (TASK-65) → Set-Cookie
//               (HttpOnly; Path=/panel/[code]) + JSON { ok, bearer, staffLabel }.
//               The raw bearer goes back in the body too, because the page's
//               client component drives every panel mutation with it as an
//               argument (the guestKey discipline); the cookie is for the
//               tablet that reloads.
// DELETE      → clears the cookie. The shift itself is closed by the client
//               calling orderingShifts.closeShift with the bearer; this only
//               drops the now-useless cookie.
//
// Machine-to-machine: JSON status codes and the TASK-65 machine codes, no
// prose. The `ordering-panel` dictionary maps codes to Serbian in the browser.
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

const STATUS_FOR_CODE: Record<string, number> = {
  [SHIFT_ERROR.invalidPin]: 401,
  [SHIFT_ERROR.locked]: 423,
  [SHIFT_ERROR.notFound]: 404,
};

export async function POST(
  request: Request,
  { params }: RouteContext<"/panel/[venueCode]/session">,
) {
  const { venueCode } = await params;
  const code = normalizeCode(venueCode);
  if (!code) return json(404, { ok: false, code: SHIFT_ERROR.notFound });

  const secret = process.env.SCANME_GUEST_SECRET;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!secret || !convexUrl) return json(503, { ok: false });

  let pin: unknown;
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = body.pin;
  } catch {
    return json(400, { ok: false });
  }
  if (typeof pin !== "string" || pin.length === 0 || pin.length > 32) {
    return json(400, { ok: false });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const opened = await convex.mutation(api.orderingShifts.openShift, {
      code,
      pin,
    });
    return json(
      200,
      { ok: true, bearer: opened.bearer, staffLabel: opened.staffLabel },
      shiftCookieHeader(code, buildShiftCookieValue(opened.bearer, code, secret)),
    );
  } catch (cause) {
    if (cause instanceof ConvexError && typeof cause.data === "string") {
      const status = STATUS_FOR_CODE[cause.data];
      if (status) return json(status, { ok: false, code: cause.data });
    }
    return json(502, { ok: false });
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/panel/[venueCode]/session">,
) {
  const { venueCode } = await params;
  const code = normalizeCode(venueCode);
  if (!code) return json(404, { ok: false });
  return json(200, { ok: true }, clearShiftCookieHeader(code));
}
