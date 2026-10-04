import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { normalizeCode } from "./lib/codes";
import { getEntitlement } from "./lib/entitlements";
import { venueOrderingEnabled } from "./lib/plans";

// =============================================================================
// TASK-65 — the shift, the PIN, and the tablet heartbeat (RFC-004 §2.6, §2.7).
//
// This is the manned-presence backend for the waiter panel. The failure it
// prevents is silent: on a Friday night the till-side tablet sleeps, and the
// guest's phone would still show "available" — because a reactive Convex QUERY
// does NOT re-run merely because time passed (guidelines §331). So shift
// availability is a MATERIALIZED boolean, `orderingShifts.stale`, flipped by a
// scheduled mutation + cron backstop — never computed from Date.now() in a
// query. This is the exact reserve→commit doctrine venueReservations already
// uses (RFC-004 §1.b): a runAt flip, a superseded-state guard, a cron sweep.
//
//   heartbeat  → patches lastHeartbeatAt + stale:false, reschedules the flip.
//   markShiftStale (internal, the runAt flip) → no-ops if a NEWER heartbeat
//     arrived (compares expectedHeartbeatAt with the stored value); it reads no
//     clock at all — it fires at the scheduled instant.
//   sweepStaleShifts (internal, the cron backstop) → catches a lost runAt.
//
// The guest query that READS `stale`/`paused` is TASK-67; this file adds NO
// query, so nothing here can read the wall clock in a query by construction.
// Date.now() appears only inside mutations/internalMutations, where it is
// allowed.
//
// Staff identity is NOT a users account (§2.7) — a waiter is floor staff, the
// owner owns the login. A PIN opens a shift and mints a 256-bit shift bearer;
// panel actions authenticate with that bearer. The PIN is a floor convenience,
// not a security boundary (the real boundary is physical possession of the
// tablet), but it still opens a panel that sees every order — so it is hashed,
// compared in constant time, and a wrong PIN never reveals whether the venue
// has a PIN at all.
//
// Errors are MACHINE CODES (the memoriesPipeline.ts discipline), not prose:
// the panel UI (TASK-68) maps them to Serbian via i18n. Nothing here is a
// user-facing string.
//
// PIN provisioning (owner sets/rotates PINs) is deliberately NOT here — RFC-004
// §4 makes PIN policy an owner input, not this task; the exported hashPin() is
// what a later owner-config surface (and the tests) use to write staffPins.rows.
// =============================================================================

// --- Thresholds — PLACEHOLDERS awaiting the owner (RFC-004 §5 Q4/Q5); see
// docs/tasks/BLOCKED.md. All tunable in code with no DB migration. ------------
export const STALE_MS = 60_000; // §5 Q5: ~60s of silence ⇒ the tablet is gone (cause A).
const SWEEP_BATCH = 100; // cron backstop batch (mirror venueReservations).
const PBKDF2_ITERATIONS = 100_000; // §5 Q4-adjacent; PIN length policy is owner's.
const PIN_SALT_BYTES = 16;
const BEARER_BYTES = 32; // 256-bit shift bearer.

// Machine error codes (TASK-68 maps to i18n). `invalidPin` is identical for a
// wrong PIN and a venue with no PIN configured — existence is never disclosed.
export const SHIFT_ERROR = {
  notFound: "shift/not_found",
  locked: "shift/locked",
  invalidPin: "shift/invalid_pin",
  invalidBearer: "shift/invalid_bearer",
  noOpenShift: "shift/no_open_shift",
} as const;

// -----------------------------------------------------------------------------
// Crypto — all in the default Convex runtime via Web Crypto (crypto.subtle +
// crypto.getRandomValues), proven by convex/lib/invitations.ts and lib/codes.ts.
// No "use node" action, no ctx.db hop, no env secret.
// -----------------------------------------------------------------------------

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time string equality — the XOR fold from memoriesPipeline.ts:63-70
// (that module keeps it private; re-implementing 6 lines is cleaner than
// editing an unrelated file). No short-circuit on the first differing byte;
// length is not secret.
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function pbkdf2Hex(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

// Salted PBKDF2-SHA256, self-describing: `pbkdf2-sha256$<iter>$<saltHex>$<hashHex>`.
// A low-entropy PIN is slowed by iteration count; exported so tests + a future
// owner-config surface write staffPins.pinHash the same way this file verifies it.
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PIN_SALT_BYTES));
  const hash = await pbkdf2Hex(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${hash}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const actual = await pbkdf2Hex(pin, hexToBytes(parts[2]), iterations);
  return timingSafeEqualString(actual, parts[3]);
}

// A well-formed hash the input PIN cannot match. Run once when a venue has NO
// PINs so timing and response are indistinguishable from a wrong PIN against a
// configured venue. Iteration count tracks PBKDF2_ITERATIONS so the decoy costs
// exactly one real verify.
const DECOY_PIN_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${"0".repeat(
  PIN_SALT_BYTES * 2,
)}$${"0".repeat(64)}`;

// The 256-bit shift bearer: high-entropy, so its stored form is a plain SHA-256
// (no salt/pepper needed — it cannot be brute-forced). Minted raw and returned
// to the caller; only the hash is stored. TASK-68's route sets the raw value as
// the HttpOnly; Path=/panel/[venueCode] cookie.
function mintBearer(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(BEARER_BYTES)).buffer);
}

async function hashBearer(raw: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
  );
}

// -----------------------------------------------------------------------------
// THE availability rule (RFC-004 §2.6) — defined ONCE, here, next to the
// heartbeat that feeds it, and consumed by both the guest query
// (ordering.publicOrderingState) and the guest actions
// (orderingRequests.callWaiter / submitOrder). One disabled state, two causes:
// causeA = the heartbeat went stale (tablet off/asleep/offline), causeB = no
// open shift, or the waiter paused. Callers get a BOOLEAN and nothing else —
// the A/B distinction is diagnostic, for the panel/owner view only, and must
// never reach the guest (§2.6: the remedy is identical, and naming the cause
// invites blame for a two-second fix).
// -----------------------------------------------------------------------------

// Query-safe: reads ONLY materialized booleans, never the wall clock, so a
// reactive subscription re-runs when markShiftStale/pauseOrdering patches the
// row — which is exactly why `stale` is materialized at all (guidelines §331:
// a query does not re-run because time passed).
export function shiftIsAvailable(shift: Doc<"orderingShifts">): boolean {
  return shift.status === "open" && !shift.stale && !shift.paused;
}

// Mutation-only: the same rule PLUS a clock belt. Between the instant
// lastHeartbeatAt + STALE_MS passes and the instant the scheduled
// markShiftStale flip actually lands, the materialized boolean still reads
// "alive" — and an order accepted in that window drops into a dead panel,
// the precise void §2.6/risk #2 exists to prevent. Reading Date.now() here is
// legal and deliberate (this is a mutation, not a query) and mirrors the belt
// memories.reserveUpload puts over its scheduler-materialized session state.
export function shiftIsAvailableAt(
  shift: Doc<"orderingShifts">,
  now: number,
): boolean {
  return shiftIsAvailable(shift) && now - shift.lastHeartbeatAt <= STALE_MS;
}

// -----------------------------------------------------------------------------
// Resolution helpers
// -----------------------------------------------------------------------------

// The single open shift for a venue code, or null. The one-open-shift-per-venue
// invariant (enforced in openShift) means .first() is unambiguous.
// Exported for orderingStatus.ts (TASK-67), whose panel transitions authenticate
// with the same shift bearer as the actions below.
export async function loadOpenShiftByCode(
  ctx: MutationCtx,
  rawCode: string,
): Promise<Doc<"orderingShifts"> | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const config = await ctx.db
    .query("orderingConfig")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!config) return null;
  return await ctx.db
    .query("orderingShifts")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", config.businessId).eq("status", "open"),
    )
    .first();
}

// Constant-time bearer check for every panel action. Exported for the request
// transitions in orderingStatus.ts (TASK-67) — one bearer check, defined once.
export async function requireBearer(
  shift: Doc<"orderingShifts">,
  bearer: string,
): Promise<void> {
  const hash = await hashBearer(bearer);
  if (!timingSafeEqualString(hash, shift.bearerHash)) {
    throw new ConvexError(SHIFT_ERROR.invalidBearer);
  }
}

// -----------------------------------------------------------------------------
// openShift — a PIN opens (or adopts) the venue's single shift and mints a bearer.
// -----------------------------------------------------------------------------

export const openShift = mutation({
  args: { code: v.string(), pin: v.string() },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    if (!code) throw new ConvexError(SHIFT_ERROR.notFound);
    const config = await ctx.db
      .query("orderingConfig")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!config) throw new ConvexError(SHIFT_ERROR.notFound);
    const business = await ctx.db.get(config.businessId);
    if (!business || business.status === "inactive") {
      throw new ConvexError(SHIFT_ERROR.notFound);
    }
    // Capability gate: ordering rides scanme_venue (RFC-004 §2.12).
    const entitlement = await getEntitlement(ctx, config.businessId, "scanme_venue");
    if (!venueOrderingEnabled(entitlement?.limits)) {
      throw new ConvexError(SHIFT_ERROR.locked);
    }

    // PIN check — constant time, no early exit, no existence leak. When the
    // venue has no PIN, one decoy derivation makes "no PIN" indistinguishable
    // from "wrong PIN". When it has PINs, every one is verified (no break) so
    // the timing does not reveal WHICH matched.
    const pins = (
      await ctx.db
        .query("staffPins")
        .withIndex("by_businessId", (q) => q.eq("businessId", config.businessId))
        .collect()
    ).filter((pin) => pin.active);
    let matchedLabel: string | null = null;
    if (pins.length === 0) {
      await verifyPin(args.pin, DECOY_PIN_HASH);
    } else {
      for (const pin of pins) {
        const ok = await verifyPin(args.pin, pin.pinHash);
        if (ok && matchedLabel === null) matchedLabel = pin.label;
      }
    }
    if (matchedLabel === null) throw new ConvexError(SHIFT_ERROR.invalidPin);

    // One open shift per venue — read-then-write OCC single-winner (the
    // venueReservations pattern, §2.7). A second open (concurrent or later)
    // adopts the existing shift and re-mints its bearer rather than opening a
    // second: two concurrent opens ⇒ the loser's read of the empty open-range
    // conflicts with the winner's insert, it retries, sees the open shift, and
    // adopts ⇒ exactly one open row.
    const now = Date.now();
    const bearer = mintBearer();
    const bearerHash = await hashBearer(bearer);
    const existing = await ctx.db
      .query("orderingShifts")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", config.businessId).eq("status", "open"),
      )
      .first();
    let shiftId: Id<"orderingShifts">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        bearerHash,
        staffLabel: matchedLabel,
        lastHeartbeatAt: now,
        stale: false,
        updatedAt: now,
      });
      shiftId = existing._id;
    } else {
      shiftId = await ctx.db.insert("orderingShifts", {
        businessId: config.businessId,
        status: "open",
        staffLabel: matchedLabel,
        bearerHash,
        paused: false,
        lastHeartbeatAt: now,
        stale: false,
        openedAt: now,
        updatedAt: now,
      });
    }
    // Even if the tablet opens and immediately dies, this flip makes it stale.
    await ctx.scheduler.runAt(
      now + STALE_MS,
      internal.orderingShifts.markShiftStale,
      { shiftId, expectedHeartbeatAt: now },
    );
    return { shiftId, bearer, staffLabel: matchedLabel };
  },
});

// -----------------------------------------------------------------------------
// heartbeat — the "before" of the acceptance model (§2.6): the tablet proves it
// is alive; each beat pushes the stale flip further out.
// -----------------------------------------------------------------------------

export const heartbeat = mutation({
  args: { code: v.string(), bearer: v.string() },
  handler: async (ctx, args) => {
    const shift = await loadOpenShiftByCode(ctx, args.code);
    if (!shift) throw new ConvexError(SHIFT_ERROR.noOpenShift);
    await requireBearer(shift, args.bearer);
    const now = Date.now();
    await ctx.db.patch(shift._id, {
      lastHeartbeatAt: now,
      stale: false,
      updatedAt: now,
    });
    await ctx.scheduler.runAt(
      now + STALE_MS,
      internal.orderingShifts.markShiftStale,
      { shiftId: shift._id, expectedHeartbeatAt: now },
    );
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// pause / resume — the manual ordering off-switch (§2.6 cause B). Named per the
// §2.7 panel-action convention that TASK-66/67/68 extend (acceptRequest, …).
// -----------------------------------------------------------------------------

export const pauseOrdering = mutation({
  args: { code: v.string(), bearer: v.string() },
  handler: async (ctx, args) => {
    const shift = await loadOpenShiftByCode(ctx, args.code);
    if (!shift) throw new ConvexError(SHIFT_ERROR.noOpenShift);
    await requireBearer(shift, args.bearer);
    await ctx.db.patch(shift._id, { paused: true, updatedAt: Date.now() });
    return { paused: true as const };
  },
});

export const resumeOrdering = mutation({
  args: { code: v.string(), bearer: v.string() },
  handler: async (ctx, args) => {
    const shift = await loadOpenShiftByCode(ctx, args.code);
    if (!shift) throw new ConvexError(SHIFT_ERROR.noOpenShift);
    await requireBearer(shift, args.bearer);
    await ctx.db.patch(shift._id, { paused: false, updatedAt: Date.now() });
    return { paused: false as const };
  },
});

// -----------------------------------------------------------------------------
// closeShift — ends the manned session. After close the open-lookup returns
// none ⇒ ordering disabled (§2.6 cause B). Idempotent when nothing is open.
// -----------------------------------------------------------------------------

export const closeShift = mutation({
  args: { code: v.string(), bearer: v.string() },
  handler: async (ctx, args) => {
    const shift = await loadOpenShiftByCode(ctx, args.code);
    if (!shift) return { ok: true as const, alreadyClosed: true as const };
    await requireBearer(shift, args.bearer);
    const now = Date.now();
    await ctx.db.patch(shift._id, {
      status: "closed",
      closedAt: now,
      updatedAt: now,
    });
    return { ok: true as const, alreadyClosed: false as const };
  },
});

// -----------------------------------------------------------------------------
// markShiftStale — the runAt flip. Scheduled at now+STALE_MS by open/heartbeat.
// Every guard is an idempotent no-op; the stale DECISION reads no clock at all.
// -----------------------------------------------------------------------------

export const markShiftStale = internalMutation({
  args: { shiftId: v.id("orderingShifts"), expectedHeartbeatAt: v.number() },
  handler: async (ctx, args) => {
    const shift = await ctx.db.get(args.shiftId);
    if (!shift || shift.status !== "open") return { stale: false as const };
    // A newer heartbeat landed after this flip was scheduled → superseded, no-op.
    // This is what a live tablet's steady beat does to every prior flip.
    if (shift.lastHeartbeatAt !== args.expectedHeartbeatAt) {
      return { stale: false as const };
    }
    if (shift.stale) return { stale: true as const };
    await ctx.db.patch(shift._id, { stale: true, updatedAt: Date.now() });
    return { stale: true as const };
  },
});

// -----------------------------------------------------------------------------
// sweepStaleShifts — the cron backstop for a lost runAt (crons.ts). Ranges open
// shifts by heartbeat age across all venues. Date.now() here is fine — this is
// a mutation, not a query. Idempotent: already-stale rows are filtered out.
// -----------------------------------------------------------------------------

export const sweepStaleShifts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const threshold = Date.now() - STALE_MS;
    const due = await ctx.db
      .query("orderingShifts")
      .withIndex("by_status_and_lastHeartbeatAt", (q) =>
        q.eq("status", "open").lte("lastHeartbeatAt", threshold),
      )
      .filter((q) => q.eq(q.field("stale"), false))
      .take(SWEEP_BATCH);
    const now = Date.now();
    for (const shift of due) {
      await ctx.db.patch(shift._id, { stale: true, updatedAt: now });
    }
    return { staled: due.length };
  },
});
