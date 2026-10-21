// ScanMe Menu V1 (K22) — the rules of wrong PINs of the waiter panel
// (master §10.6: "strogo ograničavanje pokušaja i privremena blokada posle
// pet pogrešnih pokušaja"; K01 §4.4; plan docs/meni/planovi/K19.md K19-14).
//
// Two counters, one pure rule for both (convex/menuWaiter.ts stores them in
// menuPinAttempts):
//   device  5 wrong PINs within 15 minutes lock THIS device for 15 minutes.
//           While locked, every attempt is refused — the right PIN too, so
//           the sixth try after five misses never gets in.
//   venue   30 wrong PINs within 15 minutes from devices WITHOUT a sign-in in
//           the last 12 hours lock every such NEW device of the venue for 15
//           minutes. A device that signed in during the shift keeps working.
// A success makes the device "known" for 12 h; misses of a window that is
// still open stay counted, so a valid PIN cannot be used to probe the others.
//
// K33 (security review B1, B2): a known device is made by ANY valid PIN, so one
// valid PIN could mint known devices and probe the others five at a time each.
// A third counter therefore counts the misses of EVERY device of the venue:
//   all     60 wrong PINs within 15 minutes stop PIN sign-in on every device of
//           the venue, known ones too (live sessions keep working; the Owner
//           and Managers enter with their account and can lift it).
// The two venue counters escalate: the n-th lock in a row lasts 15 min, 1 h,
// 4 h, then 12 h; a row untouched for 12 h 15 min is swept by the cron, which
// ends the streak (`unlockPins` ends it too). The device lock stays as master
// §10.6 says: five misses, 15 minutes.

/** Wrong PINs one device may type before it is locked (master §10.6). */
export const PIN_DEVICE_MAX_FAILURES = 5;
/** Wrong PINs from new devices of one venue before every new device is locked. */
export const PIN_VENUE_MAX_FAILURES = 30;
/** K33: wrong PINs from all devices of one venue (known too) before PIN sign-in stops everywhere. */
export const PIN_VENUE_ALL_MAX_FAILURES = 60;
/** The window the failures are counted in. */
export const PIN_WINDOW_MS = 15 * 60 * 1000;
/** How long a lock lasts. */
export const PIN_LOCK_MS = 15 * 60 * 1000;
/** K33: how long the n-th venue lock in a row lasts (the last step repeats). */
export const PIN_VENUE_LOCK_STEPS_MS = [PIN_LOCK_MS, 60 * 60 * 1000, 4 * 60 * 60 * 1000, 12 * 60 * 60 * 1000] as const;

/** The length of the `streak`-th venue lock in a row (1 = the first). */
export function venueLockMs(streak: number): number {
  const index = Math.min(Math.max(1, Math.floor(streak)), PIN_VENUE_LOCK_STEPS_MS.length) - 1;
  return PIN_VENUE_LOCK_STEPS_MS[index];
}
/** A staff sign-in lasts this long (master §10.6: "do 12 sati ili do ručne odjave"). */
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
/** A device that signed in this recently is "known": the venue lock never stops it. */
export const PIN_KNOWN_DEVICE_MS = STAFF_SESSION_MS;
/** Counters untouched for this long carry no information any more (deleted by the cron). */
export const PIN_ATTEMPT_RETENTION_MS = PIN_KNOWN_DEVICE_MS + PIN_WINDOW_MS;

/** A PIN is exactly three digits (master §10.6). */
export const PIN_PATTERN = /^\d{3}$/;

export function isPinFormat(value: unknown): value is string {
  return typeof value === "string" && PIN_PATTERN.test(value);
}

/** The stored counter (menuPinAttempts), or null when the device or venue never missed. */
export type PinCounter = {
  failures: number;
  windowStartedAt: number;
  lockedUntil?: number;
  lastSuccessAt?: number;
  /** K33: venue locks in a row (venue counters only). */
  lockStreak?: number;
};

/** The lock end when `counter` is locked at `now`, otherwise null. */
export function lockedUntilAt(counter: PinCounter | null, now: number): number | null {
  return counter?.lockedUntil !== undefined && counter.lockedUntil > now ? counter.lockedUntil : null;
}

/** Failures that still count at `now` (an expired window counts nothing). */
export function liveFailures(counter: PinCounter | null, now: number): number {
  if (!counter) return 0;
  return now - counter.windowStartedAt < PIN_WINDOW_MS ? counter.failures : 0;
}

/** A device that signed in within the last 12 hours. */
export function isKnownDevice(counter: PinCounter | null, now: number): boolean {
  return counter?.lastSuccessAt !== undefined && now - counter.lastSuccessAt < PIN_KNOWN_DEVICE_MS;
}

export type AttemptVerdict =
  | { kind: "allowed" }
  | { kind: "locked"; scope: "device" | "venue"; lockedUntil: number };

/**
 * May this device try a PIN now? The device lock always applies; the
 * all-devices lock (K33) applies to every device; the new-device venue lock
 * applies only to a device that is not known (no sign-in in 12 h).
 */
export function evaluateAttempt(
  input: { device: PinCounter | null; venue: PinCounter | null; all?: PinCounter | null },
  now: number,
): AttemptVerdict {
  const deviceLock = lockedUntilAt(input.device, now);
  if (deviceLock !== null) return { kind: "locked", scope: "device", lockedUntil: deviceLock };
  const allLock = lockedUntilAt(input.all ?? null, now);
  if (allLock !== null) return { kind: "locked", scope: "venue", lockedUntil: allLock };
  if (!isKnownDevice(input.device, now)) {
    const venueLock = lockedUntilAt(input.venue, now);
    if (venueLock !== null) return { kind: "locked", scope: "venue", lockedUntil: venueLock };
  }
  return { kind: "allowed" };
}

export type FailureResult = {
  counter: PinCounter;
  /** This failure placed the lock (audit it once). */
  justLocked: boolean;
  /** Wrong PINs left before the lock (0 when locked). */
  attemptsLeft: number;
};

/**
 * Count one wrong PIN against a counter that allows `max` within the window.
 * `escalate` (the venue counters, K33): each lock in a row lasts longer.
 */
export function registerFailure(counter: PinCounter | null, now: number, max: number, escalate = false): FailureResult {
  const windowAlive = counter !== null && now - counter.windowStartedAt < PIN_WINDOW_MS;
  const failures = (windowAlive ? counter.failures : 0) + 1;
  const windowStartedAt = windowAlive ? counter.windowStartedAt : now;
  const lastSuccessAt = counter?.lastSuccessAt;
  const lockStreak = counter?.lockStreak;
  const base = {
    failures,
    windowStartedAt,
    ...(lastSuccessAt !== undefined ? { lastSuccessAt } : {}),
    ...(lockStreak !== undefined ? { lockStreak } : {}),
  };
  if (failures >= max) {
    // A full window starts again after the lock, so the next five are counted afresh.
    const streak = escalate ? (lockStreak ?? 0) + 1 : undefined;
    return {
      counter: {
        ...base,
        failures: 0,
        windowStartedAt: now,
        lockedUntil: now + (streak !== undefined ? venueLockMs(streak) : PIN_LOCK_MS),
        ...(streak !== undefined ? { lockStreak: streak } : {}),
      },
      justLocked: true,
      attemptsLeft: 0,
    };
  }
  return { counter: base, justLocked: false, attemptsLeft: max - failures };
}

/**
 * A successful sign-in: the device is known for 12 h. Misses of a window that
 * is still open STAY counted (security review K22): otherwise one valid PIN
 * would let its holder probe the others four at a time; an expired window
 * starts over.
 */
export function registerSuccess(counter: PinCounter | null, now: number): PinCounter {
  const windowAlive = counter !== null && now - counter.windowStartedAt < PIN_WINDOW_MS;
  return windowAlive
    ? { failures: counter.failures, windowStartedAt: counter.windowStartedAt, lastSuccessAt: now }
    : { failures: 0, windowStartedAt: now, lastSuccessAt: now };
}

/** Wrong PINs this device may still type at `now` (for the "još N pokušaja" line). */
export function attemptsLeftAt(counter: PinCounter | null, now: number): number {
  if (lockedUntilAt(counter, now) !== null) return 0;
  return Math.max(0, PIN_DEVICE_MAX_FAILURES - liveFailures(counter, now));
}
