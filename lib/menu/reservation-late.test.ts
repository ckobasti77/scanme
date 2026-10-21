// ScanMe Menu V1 (K25) — the time of a reservation on the waiter panel
// (lib/menu/reservation-late.ts; master §10.4, §11.5): `kasnije` / `uskoro` /
// `u-terminu` / `kasni`, the live lateness and the venue's hold. Nothing here
// cancels or frees anything. Invented times only.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_RESERVATION_HOLD_MIN,
  RESERVATION_HOLD_MAX,
  RESERVATION_HOLD_MIN,
  RESERVATION_SOON_MIN,
  isValidReservationHold,
  lateText,
  reservationHoldOf,
  reservationTiming,
} from "./reservation-late";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** The time of the reservation: Saturday 24 Oct 2026, 20:00 Belgrade. */
const AT = Date.UTC(2026, 9, 24, 18, 0, 0);
const HOLD = 15;

describe("constants", () => {
  test("the defaults and limits of the hold", () => {
    expect(DEFAULT_RESERVATION_HOLD_MIN).toBe(15);
    expect(RESERVATION_HOLD_MIN).toBe(5);
    expect(RESERVATION_HOLD_MAX).toBe(180);
    expect(RESERVATION_SOON_MIN).toBe(120);
  });
});

describe("isValidReservationHold and reservationHoldOf", () => {
  test("a hold is a whole number of minutes from 5 to 180", () => {
    for (const minutes of [5, 6, 15, 30, 90, 179, 180]) expect(isValidReservationHold(minutes), String(minutes)).toBe(true);
    for (const minutes of [4, 0, -15, 181, 1.5, 15.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidReservationHold(minutes), String(minutes)).toBe(false);
    }
  });

  test("the stored hold is used when valid, otherwise the default 15", () => {
    expect(reservationHoldOf(5)).toBe(5);
    expect(reservationHoldOf(30)).toBe(30);
    expect(reservationHoldOf(180)).toBe(180);
    expect(reservationHoldOf(undefined)).toBe(15);
    expect(reservationHoldOf(null)).toBe(15);
    expect(reservationHoldOf(4)).toBe(15);
    expect(reservationHoldOf(181)).toBe(15);
    expect(reservationHoldOf(1.5)).toBe(15);
    expect(reservationHoldOf(0)).toBe(15);
    expect(reservationHoldOf(-30)).toBe(15);
    expect(reservationHoldOf(Number.NaN)).toBe(15);
    expect(reservationHoldOf("30" as unknown as number)).toBe(15);
  });
});

describe("reservationTiming: before the time", () => {
  test("more than two hours ahead is 'kasnije'", () => {
    expect(reservationTiming(AT, HOLD, AT - 121 * MINUTE)).toEqual({ phase: "kasnije", lateSeconds: null });
    expect(reservationTiming(AT, HOLD, AT - 24 * 60 * MINUTE)).toEqual({ phase: "kasnije", lateSeconds: null });
    expect(reservationTiming(AT, HOLD, AT - 120 * MINUTE - 1)).toEqual({ phase: "kasnije", lateSeconds: null });
  });

  test("exactly two hours ahead is already 'uskoro'", () => {
    expect(reservationTiming(AT, HOLD, AT - 120 * MINUTE)).toEqual({ phase: "uskoro", lateSeconds: null });
    expect(reservationTiming(AT, HOLD, AT - 120 * MINUTE + 1)).toEqual({ phase: "uskoro", lateSeconds: null });
  });

  test("within two hours, down to the last millisecond, is 'uskoro' and nothing ticks", () => {
    expect(reservationTiming(AT, HOLD, AT - 30 * MINUTE)).toEqual({ phase: "uskoro", lateSeconds: null });
    expect(reservationTiming(AT, HOLD, AT - 1)).toEqual({ phase: "uskoro", lateSeconds: null });
  });
});

describe("reservationTiming: from the time on", () => {
  test("at the time it is 'u-terminu' with zero seconds late", () => {
    expect(reservationTiming(AT, HOLD, AT)).toEqual({ phase: "u-terminu", lateSeconds: 0 });
  });

  test("lateSeconds counts whole seconds since the time", () => {
    expect(reservationTiming(AT, HOLD, AT + 999)).toEqual({ phase: "u-terminu", lateSeconds: 0 });
    expect(reservationTiming(AT, HOLD, AT + SECOND)).toEqual({ phase: "u-terminu", lateSeconds: 1 });
    expect(reservationTiming(AT, HOLD, AT + 61_999)).toEqual({ phase: "u-terminu", lateSeconds: 61 });
    expect(reservationTiming(AT, HOLD, AT + 7 * MINUTE + 12 * SECOND).lateSeconds).toBe(432);
  });

  test("the hold still runs one second before it ends, and at exactly the hold it is 'kasni'", () => {
    expect(reservationTiming(AT, HOLD, AT + HOLD * MINUTE - SECOND)).toEqual({ phase: "u-terminu", lateSeconds: 899 });
    expect(reservationTiming(AT, HOLD, AT + HOLD * MINUTE - 1)).toEqual({ phase: "u-terminu", lateSeconds: 899 });
    expect(reservationTiming(AT, HOLD, AT + HOLD * MINUTE)).toEqual({ phase: "kasni", lateSeconds: 900 });
    expect(reservationTiming(AT, HOLD, AT + HOLD * MINUTE + SECOND)).toEqual({ phase: "kasni", lateSeconds: 901 });
  });

  test("it keeps counting: nothing cancels it, there is no no-show", () => {
    expect(reservationTiming(AT, HOLD, AT + 3 * 60 * MINUTE)).toEqual({ phase: "kasni", lateSeconds: 10_800 });
    expect(reservationTiming(AT, HOLD, AT + 48 * 60 * MINUTE)).toEqual({ phase: "kasni", lateSeconds: 172_800 });
  });

  test("the threshold is the venue's hold, not a fixed one", () => {
    expect(reservationTiming(AT, 5, AT + 5 * MINUTE)).toEqual({ phase: "kasni", lateSeconds: 300 });
    expect(reservationTiming(AT, 5, AT + 5 * MINUTE - SECOND).phase).toBe("u-terminu");
    expect(reservationTiming(AT, 30, AT + 29 * MINUTE).phase).toBe("u-terminu");
    expect(reservationTiming(AT, 30, AT + 30 * MINUTE).phase).toBe("kasni");
    expect(reservationTiming(AT, 180, AT + 179 * MINUTE).phase).toBe("u-terminu");
    expect(reservationTiming(AT, 180, AT + 180 * MINUTE).phase).toBe("kasni");
  });

  test("the hold has no effect before the time", () => {
    for (const hold of [5, 15, 180]) {
      expect(reservationTiming(AT, hold, AT - 60 * MINUTE), String(hold)).toEqual({ phase: "uskoro", lateSeconds: null });
    }
  });
});

describe("lateText", () => {
  test("is null before the time", () => {
    expect(lateText(AT, AT - 1)).toBeNull();
    expect(lateText(AT, AT - 60 * MINUTE)).toBeNull();
  });

  test("is mm:ss from the time on, h:mm:ss after an hour", () => {
    expect(lateText(AT, AT)).toBe("00:00");
    expect(lateText(AT, AT + 999)).toBe("00:00");
    expect(lateText(AT, AT + 7 * MINUTE + 12 * SECOND)).toBe("07:12");
    expect(lateText(AT, AT + 59 * MINUTE + 59 * SECOND)).toBe("59:59");
    expect(lateText(AT, AT + 60 * MINUTE + 5 * SECOND)).toBe("1:00:05");
    expect(lateText(AT, AT + 65 * MINUTE + 12 * SECOND)).toBe("1:05:12");
  });
});
