// ScanMe Menu V1 (K26) — the pure part of the OAuth callback of the venue
// mailbox (app/api/meni/mail/callback/route.ts; plan docs/meni/planovi/K24.md
// §3.1). The provider returns with `code` and `state` (or `error` when the
// person declined); the route hands them to menuMailActions.completeConnect
// and sends the browser back to Podešavanja of that venue with a stable code
// only: never a token, a code or a provider message in a URL.

import { MAIL_ERROR, isMailErrorCode, type MailErrorCode } from "../errors/mail";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CODE_PATTERN = /^[\x21-\x7e]{1,2048}$/;

/** Where a person without a session signs in first (the client panel entry). */
export const MAIL_CALLBACK_SIGN_IN_PATH = "/client-panel";

export type MailCallbackArgs = { state: string; code?: string };

/**
 * The arguments for completeConnect, or null when the URL has no usable
 * state. A provider error (declined consent) sends the state without a code.
 */
export function readMailCallback(params: URLSearchParams): MailCallbackArgs | null {
  const state = params.get("state");
  if (!state || !STATE_PATTERN.test(state)) return null;
  const code = params.get("code");
  if (params.get("error") || !code || !CODE_PATTERN.test(code)) return { state };
  return { state, code };
}

export type MailCallbackOutcome = { ok: true; slug: string } | { ok: false; code: string; slug: string | null };

/** What Podešavanja shows after the callback (`?posta=povezano` or `?posta=greska&kod=mail/*`); anything else is ignored. */
export function readMailReturn(params: URLSearchParams): { ishod: "povezano" } | { ishod: "greska"; code: MailErrorCode } | null {
  const posta = params.get("posta");
  if (posta === "povezano") return { ishod: "povezano" };
  if (posta !== "greska") return null;
  const kod = params.get("kod");
  return { ishod: "greska", code: isMailErrorCode(kod) ? kod : MAIL_ERROR.providerUnavailable };
}

/** The page the browser goes back to, with `posta=povezano` or `posta=greska&kod=<mail/*>`. */
export function mailCallbackRedirect(outcome: MailCallbackOutcome): string {
  const slug = outcome.slug && outcome.slug.length <= 80 && SLUG_PATTERN.test(outcome.slug) ? outcome.slug : null;
  const base = slug ? `/${slug}/client-panel/meni/podesavanja` : MAIL_CALLBACK_SIGN_IN_PATH;
  if (outcome.ok && slug) return `${base}?${new URLSearchParams({ posta: "povezano" })}`;
  const code: MailErrorCode = !outcome.ok && isMailErrorCode(outcome.code) ? outcome.code : MAIL_ERROR.providerUnavailable;
  return `${base}?${new URLSearchParams({ posta: "greska", kod: code })}`;
}
