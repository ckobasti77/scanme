// ScanMe Menu V1 (K22) — the live timer of the waiter panel: the Belgrade
// wall-clock time of an event and how long it has been waiting
// (`18:43 · čeka 08:12`).

import { describe, expect, test } from "vitest";
import {
  DEFAULT_LATE_THRESHOLD_MIN,
  clockTime,
  clockTimeWithSeconds,
  elapsedForReader,
  elapsedSeconds,
  formatElapsed,
  isLate,
  waitingFor,
} from "./elapsed-time";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// 21 Oct 2026 is summer time in Belgrade (CEST, UTC+2); 1 Dec 2026 is winter time (CET, UTC+1).
const SUMMER = Date.UTC(2026, 9, 21, 16, 43, 7);
const WINTER = Date.UTC(2026, 11, 1, 17, 5, 0);

describe("formatElapsed", () => {
  test.each([
    [0, "00:00"],
    [1, "00:01"],
    [9, "00:09"],
    [59, "00:59"],
    [60, "01:00"],
    [492, "08:12"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [3912, "1:05:12"],
    [36000, "10:00:00"],
    [36061, "10:01:01"],
    [360000, "100:00:00"],
  ])("%d s is %s", (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected);
  });

  test("negative values show 00:00", () => {
    expect(formatElapsed(-1)).toBe("00:00");
    expect(formatElapsed(-3600)).toBe("00:00");
  });

  test("fractions of a second are floored", () => {
    expect(formatElapsed(0.9)).toBe("00:00");
    expect(formatElapsed(59.9)).toBe("00:59");
    expect(formatElapsed(3599.99)).toBe("59:59");
    expect(formatElapsed(3600.5)).toBe("1:00:00");
  });
});

describe("elapsedSeconds", () => {
  test("counts whole seconds", () => {
    expect(elapsedSeconds(1000, 1000)).toBe(0);
    expect(elapsedSeconds(1000, 2000)).toBe(1);
    expect(elapsedSeconds(0, 492 * SECOND)).toBe(492);
  });

  test("floors a partial second", () => {
    expect(elapsedSeconds(0, 999)).toBe(0);
    expect(elapsedSeconds(0, 1999)).toBe(1);
    expect(elapsedSeconds(1500, 5499)).toBe(3);
  });

  test("is never negative when the device clock is behind the server", () => {
    expect(elapsedSeconds(10_000, 9_000)).toBe(0);
    expect(elapsedSeconds(10_000, 0)).toBe(0);
  });
});

describe("waitingFor", () => {
  const created = SUMMER;

  test("is the formatted wait", () => {
    expect(waitingFor(created, created)).toBe("00:00");
    expect(waitingFor(created, created + 45 * SECOND)).toBe("00:45");
    expect(waitingFor(created, created + 492 * SECOND)).toBe("08:12");
    expect(waitingFor(created, created + 3912 * SECOND)).toBe("1:05:12");
  });

  test("a partial second does not tick early", () => {
    expect(waitingFor(created, created + 492 * SECOND + 999)).toBe("08:12");
  });

  test("a future createdAt shows 00:00", () => {
    expect(waitingFor(created + MINUTE, created)).toBe("00:00");
  });
});

describe("clockTime", () => {
  test("is the Belgrade summer time (UTC+2)", () => {
    expect(clockTime(SUMMER)).toBe("18:43");
  });

  test("is the Belgrade winter time (UTC+1)", () => {
    expect(clockTime(WINTER)).toBe("18:05");
  });

  test("pads hours and minutes to two digits and uses 00 at midnight", () => {
    // 22:05:09 UTC in summer is 00:05:09 the next day in Belgrade.
    expect(clockTime(Date.UTC(2026, 9, 21, 22, 5, 9))).toBe("00:05");
    // 03:04 UTC in summer is 05:04 in Belgrade.
    expect(clockTime(Date.UTC(2026, 9, 21, 3, 4, 0))).toBe("05:04");
  });

  test("follows the switch back to winter time on 25 Oct 2026", () => {
    // 00:59:59 UTC is still CEST (02:59:59); 01:00:00 UTC is CET (02:00:00).
    expect(clockTime(Date.UTC(2026, 9, 25, 0, 59, 59))).toBe("02:59");
    expect(clockTime(Date.UTC(2026, 9, 25, 1, 0, 0))).toBe("02:00");
  });
});

describe("clockTimeWithSeconds", () => {
  test("adds the seconds in summer time", () => {
    expect(clockTimeWithSeconds(SUMMER)).toBe("18:43:07");
  });

  test("adds the seconds in winter time", () => {
    expect(clockTimeWithSeconds(WINTER)).toBe("18:05:00");
  });

  test("pads every part and uses 00 at midnight", () => {
    expect(clockTimeWithSeconds(Date.UTC(2026, 9, 21, 22, 5, 9))).toBe("00:05:09");
  });

  test("starts with the same minutes as clockTime", () => {
    expect(clockTimeWithSeconds(SUMMER).startsWith(clockTime(SUMMER))).toBe(true);
    expect(clockTimeWithSeconds(WINTER).startsWith(clockTime(WINTER))).toBe(true);
  });
});

describe("elapsedForReader", () => {
  test("splits the seconds into hours, minutes and seconds", () => {
    expect(elapsedForReader(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(elapsedForReader(45)).toEqual({ hours: 0, minutes: 0, seconds: 45 });
    expect(elapsedForReader(60)).toEqual({ hours: 0, minutes: 1, seconds: 0 });
    expect(elapsedForReader(492)).toEqual({ hours: 0, minutes: 8, seconds: 12 });
    expect(elapsedForReader(3599)).toEqual({ hours: 0, minutes: 59, seconds: 59 });
    expect(elapsedForReader(3600)).toEqual({ hours: 1, minutes: 0, seconds: 0 });
    expect(elapsedForReader(3912)).toEqual({ hours: 1, minutes: 5, seconds: 12 });
    expect(elapsedForReader(36000)).toEqual({ hours: 10, minutes: 0, seconds: 0 });
  });

  test("negative values read as zero", () => {
    expect(elapsedForReader(-30)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });

  test("fractions of a second are floored", () => {
    expect(elapsedForReader(59.9)).toEqual({ hours: 0, minutes: 0, seconds: 59 });
    expect(elapsedForReader(3911.99)).toEqual({ hours: 1, minutes: 5, seconds: 11 });
  });
});

describe("isLate", () => {
  const created = SUMMER;

  test("the default threshold is 15 minutes", () => {
    expect(DEFAULT_LATE_THRESHOLD_MIN).toBe(15);
  });

  test("14:59 is not late, 15:00 is", () => {
    expect(isLate(created, created + 14 * MINUTE + 59 * SECOND)).toBe(false);
    expect(isLate(created, created + 15 * MINUTE - 1)).toBe(false);
    expect(isLate(created, created + 15 * MINUTE)).toBe(true);
    expect(isLate(created, created + 60 * MINUTE)).toBe(true);
  });

  test("a request that was just made is not late", () => {
    expect(isLate(created, created)).toBe(false);
  });

  test("a createdAt in the future is not late", () => {
    expect(isLate(created + MINUTE, created)).toBe(false);
  });

  test("honours the venue's own threshold", () => {
    expect(isLate(created, created + 5 * MINUTE - 1, 5)).toBe(false);
    expect(isLate(created, created + 5 * MINUTE, 5)).toBe(true);
    expect(isLate(created, created + 15 * MINUTE, 30)).toBe(false);
    expect(isLate(created, created + 30 * MINUTE, 30)).toBe(true);
  });

  test("a threshold of zero makes every request late at once", () => {
    expect(isLate(created, created, 0)).toBe(true);
  });
});
