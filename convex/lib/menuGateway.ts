import { env } from "../_generated/server";

// =============================================================================
// ScanMe Menu V1 (K33, security review B3) — which IP bucket a guest or PIN
// call may use. The guest actions, reservations, analytics and the PIN sign-in
// are public Convex functions; their Next handlers pass a salted hash of the
// caller IP (`ipHash`) as a rate-limit key. A direct call could make one up
// per attempt and slip past every per-IP bucket, so with MENU_GATEWAY_SECRET
// set on this deployment an `ipHash` counts only together with that secret,
// which only the Next server knows (the pattern of convex/lib/fairGateway.ts).
// Any other caller lands in ONE shared bucket (as a missing hash always did).
//
// Not fail-closed on purpose: without the secret (local dev, a deployment not
// configured yet) the hash is trusted as before K33, so nothing that worked
// stops working; docs/menu/MENU-ARHITEKTURA.md §15 lists setting it as a
// production step. The secret is never logged, stored or returned.
// =============================================================================

/** The hash of the caller IP a Next handler sends (hex, never the address). */
export const MENU_IP_HASH_PATTERN = /^[0-9a-f]{16,64}$/;
/** The bucket of every call whose IP hash is missing, malformed or untrusted. */
export const MENU_SHARED_IP_KEY = "shared";
/** Shorter secrets are treated as not configured. */
export const MENU_GATEWAY_SECRET_MIN_LENGTH = 32;

// Constant-time string equality (the default Convex runtime has no
// node:crypto); length is not secret.
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when this deployment has a usable gateway secret. */
export function menuGatewayConfigured(): boolean {
  return (env.MENU_GATEWAY_SECRET ?? "").trim().length >= MENU_GATEWAY_SECRET_MIN_LENGTH;
}

// K34: set after the first mismatch warning of this runtime instance, so the log
// carries one line and not one per call.
let mismatchWarned = false;

/** The rate-limit key of a call: its own IP hash only when it may be trusted. */
export function menuIpKey(ipHash: string | undefined, gateway: string | undefined): string {
  if (!ipHash || !MENU_IP_HASH_PATTERN.test(ipHash)) return MENU_SHARED_IP_KEY;
  const expected = (env.MENU_GATEWAY_SECRET ?? "").trim();
  if (expected.length < MENU_GATEWAY_SECRET_MIN_LENGTH) return ipHash;
  if (gateway !== undefined && timingSafeEqualString(gateway, expected)) return ipHash;
  // K34: a valid-looking hash without the right secret. If the Next handler's MENU_GATEWAY_SECRET differs
  // from this deployment's (or is missing), every legitimate call of every venue lands in the ONE shared
  // bucket and starves it; say so once. Only the condition is logged, never the secret or the hash.
  if (!mismatchWarned) {
    mismatchWarned = true;
    console.warn("MENU_GATEWAY_MISMATCH: an IP hash came without the gateway secret; per-IP buckets are shared");
  }
  return MENU_SHARED_IP_KEY;
}
