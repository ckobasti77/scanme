import { createHash } from "node:crypto";

// HTTP plumbing shared by the printed-card resolver (app/r/[cardCode]) and
// the splitter's card-aware Memories hop (app/r/[cardCode]/m, TASK-37).
// Server-only (node:crypto): route handlers only. Extracted so the hop can
// never drift from the resolver on the two things that must stay identical —
// the rate-limit key derivation and the no-store redirect semantics.

// GET handlers are otherwise cacheable; a cached redirect would send every
// guest to one target (and replay one Set-Cookie), so every response — every
// branch — carries no-store.
const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export function resolverRedirect(location: string, setCookie?: string) {
  const headers = new Headers({ ...BASE_HEADERS, Location: location });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}

// Rate-limit key only: a salted one-way hash of the caller IP. The raw IP is
// never sent to or stored in Convex (GDPR, RFC §2.10); the salt (the guest
// secret) keeps the hash non-reversible by dictionary.
export function resolverIpHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  const salt = process.env.SCANME_GUEST_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
