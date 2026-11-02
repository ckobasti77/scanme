// ScanMe Menu V1 (K22) — the wrong-PIN rules of the waiter panel (master
// §10.6): five misses lock a device for 15 minutes, thirty misses from unknown
// devices lock the venue's new devices, a known device is never stopped by the
// venue lock.

import { describe, expect, test } from "vitest";
import {
  PIN_ATTEMPT_RETENTION_MS,
  PIN_DEVICE_MAX_FAILURES,
  PIN_KNOWN_DEVICE_MS,
  PIN_LOCK_MS,
  PIN_VENUE_ALL_MAX_FAILURES,
  PIN_VENUE_MAX_FAILURES,
  PIN_WINDOW_MS,
  STAFF_SESSION_MS,
  attemptsLeftAt,
  evaluateAttempt,
  isKnownDevice,
  isPinFormat,
  liveFailures,
  lockedUntilAt,
  registerFailure,
  registerSuccess,
  venueLockMs,
  type PinCounter,
} from "./pin-policy";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const T0 = 1_800_000_000_000;

describe("constants", () => {
  test("a device is locked after 5 wrong PINs, a venue after 30", () => {
    expect(PIN_DEVICE_MAX_FAILURES).toBe(5);
    expect(PIN_VENUE_MAX_FAILURES).toBe(30);
  });

  test("the window and the lock last 15 minutes", () => {
    expect(PIN_WINDOW_MS).toBe(15 * MINUTE);
    expect(PIN_LOCK_MS).toBe(15 * MINUTE);
  });

  test("a staff sign-in lasts 12 hours and makes the device known for as long", () => {
    expect(STAFF_SESSION_MS).toBe(12 * HOUR);
    expect(PIN_KNOWN_DEVICE_MS).toBe(12 * HOUR);
  });

  test("counters are kept for the known-device time plus one window", () => {
    expect(PIN_ATTEMPT_RETENTION_MS).toBe(12 * HOUR + 15 * MINUTE);
  });
});

describe("isPinFormat", () => {
  test.each(["000", "123", "999", "007"])("%s is a PIN", (value) => {
    expect(isPinFormat(value)).toBe(true);
  });

  test.each(["12", "1234", "12a", " 123", "123 ", "", "1 3", "-12", "1.5", "١٢٣"])(
    "%j is not a PIN",
    (value) => {
      expect(isPinFormat(value)).toBe(false);
    },
  );

  test("only strings qualify", () => {
    expect(isPinFormat(123 as unknown)).toBe(false);
    expect(isPinFormat(null)).toBe(false);
    expect(isPinFormat(undefined)).toBe(false);
    expect(isPinFormat(["123"] as unknown)).toBe(false);
  });
});

describe("registerFailure", () => {
  test("the first failure of a device that never missed starts a window", () => {
    const result = registerFailure(null, T0, PIN_DEVICE_MAX_FAILURES);
    expect(result).toEqual({
      counter: { failures: 1, windowStartedAt: T0 },
      justLocked: false,
      attemptsLeft: 4,
    });
    expect(result.counter).not.toHaveProperty("lockedUntil");
    expect(result.counter).not.toHaveProperty("lastSuccessAt");
  });

  test("failures inside the window count up and the window keeps its start", () => {
    const row: PinCounter = { failures: 2, windowStartedAt: T0 };
    const result = registerFailure(row, T0 + 5 * MINUTE, PIN_DEVICE_MAX_FAILURES);
    expect(result.counter).toEqual({ failures: 3, windowStartedAt: T0 });
    expect(result.justLocked).toBe(false);
    expect(result.attemptsLeft).toBe(2);
  });

  test("a failure one millisecond before the window ends still counts", () => {
    const row: PinCounter = { failures: 2, windowStartedAt: T0 };
    const result = registerFailure(row, T0 + PIN_WINDOW_MS - 1, PIN_DEVICE_MAX_FAILURES);
    expect(result.counter.failures).toBe(3);
    expect(result.counter.windowStartedAt).toBe(T0);
  });

  test("a window older than 15 minutes restarts at one failure", () => {
    const row: PinCounter = { failures: 4, windowStartedAt: T0 };
    const now = T0 + PIN_WINDOW_MS;
    const result = registerFailure(row, now, PIN_DEVICE_MAX_FAILURES);
    expect(result.counter).toEqual({ failures: 1, windowStartedAt: now });
    expect(result.justLocked).toBe(false);
    expect(result.attemptsLeft).toBe(4);
  });

  test("attempts left go 4, 3, 2, 1 over the first four failures", () => {
    let counter: PinCounter | null = null;
    const left: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = registerFailure(counter, T0 + i * 1000, PIN_DEVICE_MAX_FAILURES);
      expect(result.justLocked).toBe(false);
      left.push(result.attemptsLeft);
      counter = result.counter;
    }
    expect(left).toEqual([4, 3, 2, 1]);
    expect(counter?.failures).toBe(4);
  });

  test("the fifth failure locks the device for 15 minutes and starts a fresh window", () => {
    const now = T0 + 4 * MINUTE;
    const row: PinCounter = { failures: 4, windowStartedAt: T0 };
    const result = registerFailure(row, now, PIN_DEVICE_MAX_FAILURES);
    expect(result.justLocked).toBe(true);
    expect(result.attemptsLeft).toBe(0);
    expect(result.counter).toEqual({
      failures: 0,
      windowStartedAt: now,
      lockedUntil: now + PIN_LOCK_MS,
    });
  });

  test("lastSuccessAt survives a failure", () => {
    const row: PinCounter = { failures: 1, windowStartedAt: T0, lastSuccessAt: T0 - HOUR };
    const result = registerFailure(row, T0 + 1000, PIN_DEVICE_MAX_FAILURES);
    expect(result.counter.lastSuccessAt).toBe(T0 - HOUR);
  });

  test("lastSuccessAt survives the lock and a restarted window", () => {
    const lockingRow: PinCounter = { failures: 4, windowStartedAt: T0, lastSuccessAt: T0 - HOUR };
    const locked = registerFailure(lockingRow, T0 + 1000, PIN_DEVICE_MAX_FAILURES);
    expect(locked.justLocked).toBe(true);
    expect(locked.counter.lastSuccessAt).toBe(T0 - HOUR);

    const staleRow: PinCounter = { failures: 3, windowStartedAt: T0, lastSuccessAt: T0 - HOUR };
    const restarted = registerFailure(staleRow, T0 + 2 * PIN_WINDOW_MS, PIN_DEVICE_MAX_FAILURES);
    expect(restarted.counter.failures).toBe(1);
    expect(restarted.counter.lastSuccessAt).toBe(T0 - HOUR);
  });

  test("a counter that never signed in gets no lastSuccessAt key", () => {
    const result = registerFailure({ failures: 1, windowStartedAt: T0 }, T0 + 1000, PIN_DEVICE_MAX_FAILURES);
    expect("lastSuccessAt" in result.counter).toBe(false);
  });

  test("the venue limit locks at the thirtieth failure, not before", () => {
    let counter: PinCounter | null = null;
    for (let i = 1; i <= 29; i += 1) {
      const result = registerFailure(counter, T0 + i * 1000, PIN_VENUE_MAX_FAILURES);
      expect(result.justLocked).toBe(false);
      expect(result.attemptsLeft).toBe(PIN_VENUE_MAX_FAILURES - i);
      counter = result.counter;
    }
    expect(counter?.failures).toBe(29);

    const now = T0 + 30 * 1000;
    const thirtieth = registerFailure(counter, now, PIN_VENUE_MAX_FAILURES);
    expect(thirtieth.justLocked).toBe(true);
    expect(thirtieth.attemptsLeft).toBe(0);
    expect(thirtieth.counter).toEqual({
      failures: 0,
      windowStartedAt: now,
      lockedUntil: now + PIN_LOCK_MS,
    });
  });

  test("does not mutate the stored counter", () => {
    const row: PinCounter = { failures: 4, windowStartedAt: T0 };
    registerFailure(row, T0 + 1000, PIN_DEVICE_MAX_FAILURES);
    expect(row).toEqual({ failures: 4, windowStartedAt: T0 });
  });
});

describe("lockedUntilAt", () => {
  test("null for a counter that never existed or never locked", () => {
    expect(lockedUntilAt(null, T0)).toBeNull();
    expect(lockedUntilAt({ failures: 2, windowStartedAt: T0 }, T0)).toBeNull();
  });

  test("returns the end of the lock while it is in the future", () => {
    const counter: PinCounter = { failures: 0, windowStartedAt: T0, lockedUntil: T0 + PIN_LOCK_MS };
    expect(lockedUntilAt(counter, T0)).toBe(T0 + PIN_LOCK_MS);
    expect(lockedUntilAt(counter, T0 + PIN_LOCK_MS - 1)).toBe(T0 + PIN_LOCK_MS);
  });

  test("is null exactly at the end and after it", () => {
    const counter: PinCounter = { failures: 0, windowStartedAt: T0, lockedUntil: T0 + PIN_LOCK_MS };
    expect(lockedUntilAt(counter, T0 + PIN_LOCK_MS)).toBeNull();
    expect(lockedUntilAt(counter, T0 + PIN_LOCK_MS + 1)).toBeNull();
  });
});

describe("liveFailures", () => {
  test("zero without a counter", () => {
    expect(liveFailures(null, T0)).toBe(0);
  });

  test("the stored failures while the window is alive", () => {
    const counter: PinCounter = { failures: 3, windowStartedAt: T0 };
    expect(liveFailures(counter, T0)).toBe(3);
    expect(liveFailures(counter, T0 + PIN_WINDOW_MS - 1)).toBe(3);
  });

  test("zero once the window is 15 minutes old", () => {
    const counter: PinCounter = { failures: 3, windowStartedAt: T0 };
    expect(liveFailures(counter, T0 + PIN_WINDOW_MS)).toBe(0);
    expect(liveFailures(counter, T0 + 2 * PIN_WINDOW_MS)).toBe(0);
  });
});

describe("isKnownDevice", () => {
  test("no counter or no sign-in is unknown", () => {
    expect(isKnownDevice(null, T0)).toBe(false);
    expect(isKnownDevice({ failures: 1, windowStartedAt: T0 }, T0)).toBe(false);
  });

  test("a sign-in within 12 hours is known", () => {
    const counter: PinCounter = { failures: 0, windowStartedAt: T0, lastSuccessAt: T0 };
    expect(isKnownDevice(counter, T0)).toBe(true);
    expect(isKnownDevice(counter, T0 + 12 * HOUR - 1)).toBe(true);
  });

  test("exactly 12 hours after the sign-in the device is no longer known", () => {
    const counter: PinCounter = { failures: 0, windowStartedAt: T0, lastSuccessAt: T0 };
    expect(isKnownDevice(counter, T0 + 12 * HOUR)).toBe(false);
    expect(isKnownDevice(counter, T0 + 13 * HOUR)).toBe(false);
  });
});

describe("registerSuccess", () => {
  test("a device that never missed starts clean and is known from now", () => {
    expect(registerSuccess(null, T0)).toEqual({ failures: 0, windowStartedAt: T0, lastSuccessAt: T0 });
  });

  // Security review K22: a valid PIN must not reset the misses of an open window.
  test("keeps the misses of a window that is still open", () => {
    const counter = { failures: 3, windowStartedAt: T0 };
    expect(registerSuccess(counter, T0 + MINUTE)).toEqual({ failures: 3, windowStartedAt: T0, lastSuccessAt: T0 + MINUTE });
    expect(attemptsLeftAt(registerSuccess(counter, T0 + MINUTE), T0 + MINUTE)).toBe(2);
  });

  test("starts over when the window has passed", () => {
    const counter = { failures: 3, windowStartedAt: T0 };
    expect(registerSuccess(counter, T0 + PIN_WINDOW_MS)).toEqual({
      failures: 0,
      windowStartedAt: T0 + PIN_WINDOW_MS,
      lastSuccessAt: T0 + PIN_WINDOW_MS,
    });
  });

  test("has no lock, so the device may try again right away", () => {
    const counter = registerSuccess(null, T0);
    expect(lockedUntilAt(counter, T0)).toBeNull();
    expect(isKnownDevice(counter, T0)).toBe(true);
    expect(attemptsLeftAt(counter, T0)).toBe(PIN_DEVICE_MAX_FAILURES);
  });
});

describe("attemptsLeftAt", () => {
  test("a device that never missed has all five", () => {
    expect(attemptsLeftAt(null, T0)).toBe(5);
  });

  test("subtracts the live failures", () => {
    expect(attemptsLeftAt({ failures: 1, windowStartedAt: T0 }, T0 + 1000)).toBe(4);
    expect(attemptsLeftAt({ failures: 4, windowStartedAt: T0 }, T0 + 1000)).toBe(1);
  });

  test("an expired window gives all five back", () => {
    expect(attemptsLeftAt({ failures: 4, windowStartedAt: T0 }, T0 + PIN_WINDOW_MS)).toBe(5);
  });

  test("zero while locked, five again once the lock ends", () => {
    const counter: PinCounter = { failures: 0, windowStartedAt: T0, lockedUntil: T0 + PIN_LOCK_MS };
    expect(attemptsLeftAt(counter, T0 + 1000)).toBe(0);
    expect(attemptsLeftAt(counter, T0 + PIN_LOCK_MS)).toBe(5);
  });

  test("never goes below zero", () => {
    expect(attemptsLeftAt({ failures: 9, windowStartedAt: T0 }, T0 + 1000)).toBe(0);
  });
});

describe("evaluateAttempt", () => {
  const deviceLocked: PinCounter = { failures: 0, windowStartedAt: T0, lockedUntil: T0 + PIN_LOCK_MS };
  const venueLocked: PinCounter = { failures: 0, windowStartedAt: T0, lockedUntil: T0 + 10 * MINUTE };
  const knownDevice: PinCounter = { failures: 0, windowStartedAt: T0 - HOUR, lastSuccessAt: T0 - HOUR };

  test("no counters at all is allowed", () => {
    expect(evaluateAttempt({ device: null, venue: null }, T0)).toEqual({ kind: "allowed" });
  });

  test("counters that never locked are allowed", () => {
    const device: PinCounter = { failures: 3, windowStartedAt: T0 };
    const venue: PinCounter = { failures: 20, windowStartedAt: T0 };
    expect(evaluateAttempt({ device, venue }, T0 + 1000)).toEqual({ kind: "allowed" });
  });

  test("a device lock refuses the attempt with the lock end", () => {
    expect(evaluateAttempt({ device: deviceLocked, venue: null }, T0 + 1000)).toEqual({
      kind: "locked",
      scope: "device",
      lockedUntil: T0 + PIN_LOCK_MS,
    });
  });

  test("the device lock wins over the venue lock", () => {
    expect(evaluateAttempt({ device: deviceLocked, venue: venueLocked }, T0 + 1000)).toEqual({
      kind: "locked",
      scope: "device",
      lockedUntil: T0 + PIN_LOCK_MS,
    });
  });

  test("the device lock stops even a known device", () => {
    const lockedKnown: PinCounter = { ...knownDevice, lockedUntil: T0 + PIN_LOCK_MS };
    expect(evaluateAttempt({ device: lockedKnown, venue: null }, T0 + 1000)).toEqual({
      kind: "locked",
      scope: "device",
      lockedUntil: T0 + PIN_LOCK_MS,
    });
  });

  test("the venue lock stops an unknown device", () => {
    expect(evaluateAttempt({ device: null, venue: venueLocked }, T0 + 1000)).toEqual({
      kind: "locked",
      scope: "venue",
      lockedUntil: T0 + 10 * MINUTE,
    });
    const missedOnly: PinCounter = { failures: 2, windowStartedAt: T0 };
    expect(evaluateAttempt({ device: missedOnly, venue: venueLocked }, T0 + 1000)).toMatchObject({
      kind: "locked",
      scope: "venue",
    });
  });

  test("the venue lock does not stop a device that signed in during the last 12 hours", () => {
    expect(evaluateAttempt({ device: knownDevice, venue: venueLocked }, T0 + 1000)).toEqual({ kind: "allowed" });
  });

  test("a device whose sign-in is 12 hours old is unknown again and meets the venue lock", () => {
    const now = knownDevice.lastSuccessAt! + 12 * HOUR;
    const venue: PinCounter = { failures: 0, windowStartedAt: now, lockedUntil: now + 5 * MINUTE };
    expect(evaluateAttempt({ device: knownDevice, venue }, now)).toEqual({
      kind: "locked",
      scope: "venue",
      lockedUntil: now + 5 * MINUTE,
    });
  });

  test("an expired venue lock lets everyone in", () => {
    expect(evaluateAttempt({ device: null, venue: venueLocked }, T0 + 10 * MINUTE)).toEqual({ kind: "allowed" });
  });
});

describe("five wrong PINs, then the sixth try", () => {
  test("is refused even with the right PIN, and is allowed again after 15 minutes", () => {
    let device: PinCounter | null = null;
    let lastResult = registerFailure(null, T0, PIN_DEVICE_MAX_FAILURES);

    for (let i = 0; i < 5; i += 1) {
      const now = T0 + i * 1000;
      expect(evaluateAttempt({ device, venue: null }, now)).toEqual({ kind: "allowed" });
      lastResult = registerFailure(device, now, PIN_DEVICE_MAX_FAILURES);
      device = lastResult.counter;
    }

    // The fifth miss placed the lock.
    expect(lastResult.justLocked).toBe(true);
    expect(lastResult.attemptsLeft).toBe(0);
    const lockEnd = T0 + 4000 + PIN_LOCK_MS;
    expect(device?.lockedUntil).toBe(lockEnd);

    // The sixth try (the caller must not even compare the PIN) is refused.
    const sixth = evaluateAttempt({ device, venue: null }, T0 + 5000);
    expect(sixth).toEqual({ kind: "locked", scope: "device", lockedUntil: lockEnd });
    expect(attemptsLeftAt(device, T0 + 5000)).toBe(0);

    // Still refused one millisecond before the lock ends ...
    expect(evaluateAttempt({ device, venue: null }, lockEnd - 1).kind).toBe("locked");
    // ... and allowed again after 15 minutes, with a full set of attempts.
    expect(evaluateAttempt({ device, venue: null }, lockEnd)).toEqual({ kind: "allowed" });
    expect(attemptsLeftAt(device, lockEnd)).toBe(5);

    // The first miss after the lock starts a fresh count, not a re-lock.
    const afterLock = registerFailure(device, lockEnd, PIN_DEVICE_MAX_FAILURES);
    expect(afterLock.justLocked).toBe(false);
    expect(afterLock.attemptsLeft).toBe(4);
    expect(afterLock.counter.lockedUntil).toBeUndefined();
  });

  test("a sign-in after the lock clears the counter and makes the device known", () => {
    const now = T0 + 20 * MINUTE;
    const device = registerSuccess(null, now);
    const venueLocked: PinCounter = { failures: 0, windowStartedAt: now, lockedUntil: now + 10 * MINUTE };
    expect(evaluateAttempt({ device, venue: venueLocked }, now + 1000)).toEqual({ kind: "allowed" });
  });
});

describe("K33: all-devices lock and escalation (security review B1, B2)", () => {
  test("60 misses of all devices; the venue locks last 15 min, 1 h, 4 h, then 12 h", () => {
    expect(PIN_VENUE_ALL_MAX_FAILURES).toBe(60);
    expect([1, 2, 3, 4, 5, 9].map(venueLockMs)).toEqual([PIN_LOCK_MS, HOUR, 4 * HOUR, 12 * HOUR, 12 * HOUR, 12 * HOUR]);
    expect(venueLockMs(0)).toBe(PIN_LOCK_MS);
  });

  test("an escalating counter counts its streak; a plain one (the device) never does", () => {
    let venue: PinCounter | null = null;
    for (let i = 0; i < PIN_VENUE_MAX_FAILURES; i += 1) venue = registerFailure(venue, T0, PIN_VENUE_MAX_FAILURES, true).counter;
    expect(venue).toMatchObject({ lockedUntil: T0 + PIN_LOCK_MS, lockStreak: 1, failures: 0 });
    const t1 = T0 + PIN_LOCK_MS;
    for (let i = 0; i < PIN_VENUE_MAX_FAILURES; i += 1) venue = registerFailure(venue, t1, PIN_VENUE_MAX_FAILURES, true).counter;
    expect(venue).toMatchObject({ lockedUntil: t1 + HOUR, lockStreak: 2 });

    let device: PinCounter | null = null;
    for (let i = 0; i < PIN_DEVICE_MAX_FAILURES; i += 1) device = registerFailure(device, T0, PIN_DEVICE_MAX_FAILURES).counter;
    expect(device).toEqual({ failures: 0, windowStartedAt: T0, lockedUntil: T0 + PIN_LOCK_MS });
  });

  test("the all-devices lock stops a known device too; the new-device lock does not", () => {
    const known = registerSuccess(null, T0);
    const locked: PinCounter = { failures: 0, windowStartedAt: T0, lockedUntil: T0 + 10 * MINUTE };
    expect(evaluateAttempt({ device: known, venue: locked }, T0 + 1000)).toEqual({ kind: "allowed" });
    expect(evaluateAttempt({ device: known, venue: null, all: locked }, T0 + 1000)).toEqual({
      kind: "locked",
      scope: "venue",
      lockedUntil: T0 + 10 * MINUTE,
    });
  });
});
