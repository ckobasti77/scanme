import { ConvexError } from "convex/values";
import { env } from "../_generated/server";
import { FAIR_GATEWAY_SECRET_MIN_LENGTH } from "../../lib/fair-contract";

// =============================================================================
// Sajam automobila 2026 — K1 trust boundary Next → Convex (RF nalaz 1,
// FAIR-BACKEND-CONTRACT §27). The visitor-specific fair functions are public
// Convex functions, so anyone can call them directly with a made-up
// `visitorHash`. They therefore accept a call only with FAIR_GATEWAY_SECRET,
// which only the Next server (lib/fair-server, app/r) and this deployment
// know — the pattern of memoriesPipeline.requirePipelineSecret.
//
// Fail closed: no (or a too short) secret in this deployment's env →
// FAIR_GATEWAY_NOT_CONFIGURED; a missing or wrong secret in the call →
// FAIR_GATEWAY_UNAUTHORIZED. Callers check BEFORE any read or write. The
// secret is never logged, stored or returned.
// =============================================================================

export type FairGatewayVerdict = "trusted" | "FAIR_GATEWAY_NOT_CONFIGURED" | "FAIR_GATEWAY_UNAUTHORIZED";

// Constant-time string equality (the default Convex runtime has no
// node:crypto): an XOR fold that never short-circuits on the first differing
// character. Length is not secret.
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function fairGatewayVerdict(provided: string | undefined): FairGatewayVerdict {
  const expected = (env.FAIR_GATEWAY_SECRET ?? "").trim();
  if (expected.length < FAIR_GATEWAY_SECRET_MIN_LENGTH) return "FAIR_GATEWAY_NOT_CONFIGURED";
  if (provided === undefined || !timingSafeEqualString(provided, expected)) return "FAIR_GATEWAY_UNAUTHORIZED";
  return "trusted";
}

/** First statement of every visitor-specific fair function: throws a stable code, writes nothing. */
export function requireFairGateway(provided: string | undefined): void {
  const verdict = fairGatewayVerdict(provided);
  if (verdict !== "trusted") throw new ConvexError({ code: verdict });
}
