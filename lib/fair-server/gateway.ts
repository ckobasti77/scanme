import "server-only";

import type { FairErrorCode, FairErrorDetails } from "@/lib/fair-contract";
import { fairVisitorForRequest, type FairVisitorEnv } from "./visitor";

// =============================================================================
// Sajam automobila 2026 — B2 same-origin POST gateway for visitor-specific
// reads and writes (BACKEND-HANDOFF §4.2, §7). Every app/api/fair/** handler
// goes through `fairGatewayRequest` first:
//   - same-origin only (Sec-Fetch-Site, else Origin == this origin);
//   - bounded JSON body (Content-Length AND the streamed byte count);
//   - `Cache-Control: no-store` on every response;
//   - errors are `{ ok: false, code, details? }` with a stable FairErrorCode —
//     never a token, hash, contact value or upstream message; `details` only
//     carries whitelisted non-PII keys (N5, interactions.ts
//     `fairPublicErrorDetails`) and a 429 always has `Retry-After` (seconds).
// The visitor token is read from the HttpOnly cookie here, never from the
// body or the URL; Convex receives only the hash (B3 adds the mutations).
// =============================================================================

export const FAIR_GATEWAY_MAX_BODY_BYTES = 8 * 1024;
export const FAIR_BOOTSTRAP_MAX_BODY_BYTES = 1024;

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json; charset=utf-8",
};

export function fairGatewayJson(body: unknown, status = 200, setCookie?: string | null): Response {
  const headers = new Headers(BASE_HEADERS);
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Seconds a 429 asks the browser to wait when Convex gave no `retryAfterMs`. */
export const FAIR_DEFAULT_RETRY_AFTER_SECONDS = 60;

export function fairGatewayError(code: FairErrorCode, status: number, details?: FairErrorDetails): Response {
  const response = fairGatewayJson(details ? { ok: false, code, details } : { ok: false, code }, status);
  if (status === 429) {
    const waitMs = details?.retryAfterMs;
    const seconds = typeof waitMs === "number" ? Math.max(1, Math.ceil(waitMs / 1000)) : FAIR_DEFAULT_RETRY_AFTER_SECONDS;
    response.headers.set("Retry-After", String(seconds));
  }
  return response;
}

function requestOrigins(request: Request): Set<string> {
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  return new Set([url.origin, ...(host ? [`${protocol}://${host}`] : [])]);
}

function headerOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Browsers prefer Sec-Fetch-Site, then Origin, then a same-host Referer. */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const expected = requestOrigins(request);
  const origin = headerOrigin(request.headers.get("origin"));
  if (origin !== null) return expected.has(origin);
  const referer = headerOrigin(request.headers.get("referer"));
  return referer !== null && expected.has(referer);
}

export type FairGatewayBody = { ok: true; value: unknown } | { ok: false; response: Response };

/** Reads at most `maxBytes` of JSON; an empty body is `{}`. */
export async function readFairGatewayJson(request: Request, maxBytes = FAIR_GATEWAY_MAX_BODY_BYTES): Promise<FairGatewayBody> {
  const tooLarge = (): FairGatewayBody => ({ ok: false, response: fairGatewayError("PAYLOAD_TOO_LARGE", 413) });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > maxBytes) return tooLarge();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: fairGatewayError("INVALID_INPUT", 400) };
  }
}

/** The common guard of every visitor-specific POST. */
export async function fairGatewayRequest(request: Request, maxBytes = FAIR_GATEWAY_MAX_BODY_BYTES): Promise<FairGatewayBody> {
  if (!isSameOriginRequest(request)) return { ok: false, response: fairGatewayError("ORIGIN_NOT_ALLOWED", 403) };
  return readFairGatewayJson(request, maxBytes);
}

/**
 * POST /api/fair/visitor — direct-visit bootstrap (MASTER §5): makes sure the
 * device holds an anonymous visitor cookie before any interaction. It writes
 * nothing to Convex: the fairVisitors row is created on the first scan or
 * action. The response never contains the token or the hash.
 */
export async function handleFairVisitorBootstrap(
  request: Request,
  now = Date.now(),
  env?: FairVisitorEnv,
): Promise<Response> {
  const body = await fairGatewayRequest(request, FAIR_BOOTSTRAP_MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) {
    return fairGatewayError("INVALID_INPUT", 400);
  }
  const visitor = fairVisitorForRequest(request, now, env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  return fairGatewayJson({ ok: true }, 200, visitor.setCookie);
}
