import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchAction } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { isAdminMailErrorCode, type AdminMailErrorCode } from "@/convex/lib/adminMailContract";

// Admin UX Z1 — Zoho OAuth callback of Pošta (ADMIN-UX-ZAHTEVI §10). Zoho
// (EU) redirects here with `code` and `state`; both go server-side to the
// admin-only Convex action together with the admin's own session token, which
// consumes the one-time state, exchanges the code and stores the encrypted
// tokens. The browser only ever gets a redirect to /admin/posta with a stable
// status code: no token, no code and no Zoho detail. Nothing here is logged.
// `proxy.ts` does not guard /api/admin/*, so a missing session goes to login.
export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = await convexAuthNextjsToken();
  if (!token) return redirectTo(request, `/admin/login?${new URLSearchParams({ returnTo: "/admin/posta" })}`);

  const code = params.get("code");
  const state = params.get("state");
  const location = params.get("location");
  let failure: AdminMailErrorCode | null = null;
  if (params.get("error") || !code || !state) {
    failure = "ZOHO_AUTH_REQUIRED";
  } else if (location && location !== "eu") {
    // Multi-DC: only the EU data centre is supported (the code would be for another DC).
    failure = "ZOHO_REGION_UNSUPPORTED";
  } else {
    try {
      await fetchAction(api.adminMail.completeZohoConnect, { code, state }, { token });
    } catch (error) {
      const data = error instanceof ConvexError ? (error.data as { code?: unknown } | string) : null;
      const reported = data && typeof data === "object" ? data.code : null;
      failure = isAdminMailErrorCode(reported) ? reported : "ZOHO_UNAVAILABLE";
    }
  }
  return redirectTo(request, failure ? `/admin/posta?status=greska&kod=${failure}` : "/admin/posta?status=povezano");
}
