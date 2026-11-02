import type { Doc, Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { hashPin, verifyPin } from "../orderingShifts";
import { isPinFormat } from "../../lib/menu/pin-policy";

// =============================================================================
// ScanMe Menu V1 (K22) — the three-digit staff PIN (master §10.6; K01 §4.4;
// plan docs/meni/planovi/K19.md K19-13).
//
// A PIN is stored twice, never in the clear, and both depend on the pepper:
//   pinLookup = HMAC-SHA256(MENU_PIN_PEPPER, "<menuServiceId>:<pin>")
//               deterministic, so sign-in finds the member with ONE indexed
//               read and uniqueness among active members is one read too;
//   pinHash   = salted PBKDF2-SHA256, 100.000 iterations (the RFC-004 hashPin
//               of convex/orderingShifts.ts) over HMAC(pepper, "hash:…:<pin>"),
//               checked after the lookup matched. Only 1.000 PINs exist, so a
//               plain PBKDF2 of the PIN would fall to a copy of the table in
//               seconds; keyed by the pepper (a Convex env secret) it does not.
// Without MENU_PIN_PEPPER no PIN can be set and nobody signs in with one.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

/** A pepper shorter than this is treated as missing (a typo, not a secret). */
const MIN_PEPPER_LENGTH = 16;
/** Random draws tried before giving up on finding a free PIN. */
const FREE_PIN_DRAWS = 64;

// A well-formed hash no PIN matches (same iteration count as hashPin), run
// when no member has the PIN, so a miss costs the same as a wrong PIN.
const DECOY_PIN_HASH = `pbkdf2-sha256$100000$${"0".repeat(32)}$${"0".repeat(64)}`;

/** The configured pepper, or null when PINs are switched off on this deployment. */
export function pinPepper(): string | null {
  const pepper = env.MENU_PIN_PEPPER?.trim();
  return pepper && pepper.length >= MIN_PEPPER_LENGTH ? pepper : null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256(pepper, "<menuServiceId>:<pin>") as hex: the same PIN differs per venue. */
export async function pinLookupOf(pepper: string, menuServiceId: Id<"menuServices">, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${menuServiceId}:${pin}`)));
}

async function hmacHex(pepper: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** What PBKDF2 sees: the PIN keyed by the pepper and the service (never empty). */
async function pinSecret(pepper: string, menuServiceId: Id<"menuServices">, pin: string): Promise<string> {
  return await hmacHex(pepper, `hash:${menuServiceId}:${pin}`);
}

/** Salted PBKDF2 (convex/orderingShifts.ts) of the pepper-keyed PIN. */
export async function hashStaffPin(pepper: string, menuServiceId: Id<"menuServices">, pin: string): Promise<string> {
  return await hashPin(await pinSecret(pepper, menuServiceId, pin));
}

/** Constant work whether or not a member was found (a decoy hash when none was). */
export async function verifyStaffPin(
  pepper: string,
  menuServiceId: Id<"menuServices">,
  pin: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const matched = await verifyPin(await pinSecret(pepper, menuServiceId, pin), stored ?? DECOY_PIN_HASH);
  return stored ? matched : false;
}

/** The ACTIVE staff member of this service whose PIN has `lookup`, or null. */
export async function activeStaffByLookup(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  lookup: string,
): Promise<Doc<"menuStaff"> | null> {
  const rows = await ctx.db
    .query("menuStaff")
    .withIndex("by_menuServiceId_and_pinLookup", (q) => q.eq("menuServiceId", menuServiceId).eq("pinLookup", lookup))
    .take(10);
  return rows.find((row) => row.active) ?? null;
}

/** "007" for 7: a uniform draw over 000–999. `random` is injectable for tests. */
export function randomPin(
  random: (length: number) => Uint32Array = (length) => crypto.getRandomValues(new Uint32Array(length)),
): string {
  // 2^32 is not a multiple of 1000; reject the top sliver so every PIN is equally likely.
  const limit = Math.floor(0x1_0000_0000 / 1000) * 1000;
  for (;;) {
    const [value] = random(1);
    if (value < limit) return String(value % 1000).padStart(3, "0");
  }
}

/**
 * A PIN no active member of this service has, or null when FREE_PIN_DRAWS
 * random draws all hit a taken one (only near 1.000 members, far above the
 * MENU_MAX_STAFF cap). Each draw is one indexed read.
 */
export async function generateFreePin(
  ctx: DatabaseCtx,
  pepper: string,
  menuServiceId: Id<"menuServices">,
  draw: () => string = () => randomPin(),
): Promise<string | null> {
  for (let attempt = 0; attempt < FREE_PIN_DRAWS; attempt += 1) {
    const pin = draw();
    if (!isPinFormat(pin)) continue;
    const taken = await activeStaffByLookup(ctx, menuServiceId, await pinLookupOf(pepper, menuServiceId, pin));
    if (!taken) return pin;
  }
  return null;
}
