import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchAction } from "convex/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { MAIL_ERROR } from "@/lib/menu/errors/mail";
import {
  MAIL_CALLBACK_SIGN_IN_PATH,
  mailCallbackRedirect,
  readMailCallback,
  type MailCallbackOutcome,
} from "@/lib/menu/http/mail-callback";

// ScanMe Menu V1 (K26) — OAuth callback of the venue mailbox (master §11.4;
// plan docs/meni/planovi/K24.md §3.1). Google or Microsoft returns here with
// `code` and `state`; both go server-side to menuMailActions.completeConnect
// together with the person's own session token, which consumes the one-time
// state (bound to that person and venue), exchanges the code with the PKCE
// verifier and stores the encrypted tokens. The browser only gets a redirect
// to the venue's Podešavanja with a stable code. Nothing is logged; the
// response is never cached and sends no referrer.
export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const token = await convexAuthNextjsToken();
  if (!token) return redirectTo(request, MAIL_CALLBACK_SIGN_IN_PATH);
  const args = readMailCallback(request.nextUrl.searchParams);
  if (!args) return redirectTo(request, mailCallbackRedirect({ ok: false, code: MAIL_ERROR.stateInvalid, slug: null }));
  let outcome: MailCallbackOutcome;
  try {
    outcome = await fetchAction(api.menuMailActions.completeConnect, args, { token });
  } catch {
    outcome = { ok: false, code: MAIL_ERROR.providerUnavailable, slug: null };
  }
  return redirectTo(request, mailCallbackRedirect(outcome));
}
