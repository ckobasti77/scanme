import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { resolverIpHash } from "@/lib/card-resolver-http";
import { menuGatewayArg } from "@/lib/menu/http/gateway";
import { handleStaffLogin, handleStaffLogout } from "@/lib/menu/http/staff-session";
import { normalizePanelCode } from "@/lib/menu/panel-code";

// ScanMe Menu V1 (K22) — the sign-in of the waiter panel: POST {pin} signs this
// device in for 12 hours (HttpOnly cookies smk_s and smk_d), DELETE signs it
// out (lib/menu/http/staff-session.ts; master §10.6). JSON with machine codes;
// the PIN screen says them in Serbian. Never cached, never indexed.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Type": "application/json; charset=utf-8" };

function bezPanela(status: number, code: string) {
  return new Response(JSON.stringify({ ok: false, code }), { status, headers: NO_STORE });
}

function convexKlijent(): ConvexHttpClient | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  return convexUrl ? new ConvexHttpClient(convexUrl) : null;
}

export async function POST(request: Request, { params }: RouteContext<"/[slug]/konobar/[kod]/sesija">) {
  const { slug: sirovSlug, kod } = await params;
  const slug = sirovSlug.toLowerCase();
  const panelCode = normalizePanelCode(kod);
  if (!panelCode) return bezPanela(404, "staff/panel_not_found");
  const convex = convexKlijent();
  if (!convex) return bezPanela(503, "unavailable");
  return await handleStaffLogin(
    request,
    { slug, panelCode },
    {
      login: (input) => convex.mutation(api.menuWaiter.loginWithPin, { ...input, ...menuGatewayArg() }),
      logout: (input) => convex.mutation(api.menuWaiter.logout, input),
      secret: process.env.SCANME_GUEST_SECRET || null,
      ipHash: resolverIpHash(request),
    },
  );
}

export async function DELETE(request: Request, { params }: RouteContext<"/[slug]/konobar/[kod]/sesija">) {
  const { slug: sirovSlug, kod } = await params;
  const slug = sirovSlug.toLowerCase();
  const panelCode = normalizePanelCode(kod);
  if (!panelCode) return bezPanela(404, "staff/panel_not_found");
  const convex = convexKlijent();
  return await handleStaffLogout(
    request,
    { slug, panelCode },
    {
      logout: async (input) => (convex ? await convex.mutation(api.menuWaiter.logout, input) : null),
      secret: process.env.SCANME_GUEST_SECRET || null,
    },
  );
}
