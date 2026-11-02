// K34 review fixes for the waiter panel, the pure parts (the components are covered in
// components/menu/konobar/k34-konobar.test.tsx).
//   C1  the panel clock runs on the DEVICE clock while request times are the server's:
//       clockOffset moves it to server time (only a real skew, once per page load).
//   C5  a table's occupancy mark never expires, so a mark of an earlier day carries its
//       date: clockTimeOrDate.
// Invented times only.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import {
  CLOCK_SKEW_MAX_MS,
  CLOCK_SKEW_MIN_MS,
  clockOffset,
  clockTimeOrDate,
  isLate,
  waitingFor,
} from "./elapsed-time";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** A Belgrade wall-clock time ("2026-10-21T21:03") as an epoch; a typo fails loudly. */
function belgrade(local: string): number {
  const epoch = belgradeLocalToEpoch(local);
  if (epoch === null) throw new Error(`not a Belgrade time: ${local}`);
  return epoch;
}

// --- C1: clockOffset -----------------------------------------------------------------------

describe("clockOffset: the device clock against the server's", () => {
  const SERVER = Date.UTC(2026, 9, 21, 16, 27, 0);

  test("the limits are a minute and twelve hours", () => {
    expect(CLOCK_SKEW_MIN_MS).toBe(MINUTE);
    expect(CLOCK_SKEW_MAX_MS).toBe(12 * HOUR);
  });

  test("a device within a minute of the server is the page's delivery, not a skew: no correction", () => {
    for (const difference of [0, 1, 999, 2300, 30 * SECOND, 59_999]) {
      expect(clockOffset(SERVER, SERVER + difference), `device ahead by ${difference} ms`).toBe(0);
      expect(clockOffset(SERVER, SERVER - difference), `device behind by ${difference} ms`).toBe(0);
    }
  });

  test("from a minute on the difference is applied: a device ahead moves back, a device behind moves forward", () => {
    expect(clockOffset(SERVER, SERVER + MINUTE)).toBe(-MINUTE);
    expect(clockOffset(SERVER, SERVER - MINUTE)).toBe(MINUTE);
    expect(clockOffset(SERVER, SERVER + 20 * MINUTE)).toBe(-20 * MINUTE);
    expect(clockOffset(SERVER, SERVER - 20 * MINUTE)).toBe(20 * MINUTE);
    expect(clockOffset(SERVER, SERVER + 3 * HOUR)).toBe(-3 * HOUR);
    expect(clockOffset(SERVER, SERVER - 3 * HOUR)).toBe(3 * HOUR);
  });

  test("twelve hours still count, anything beyond is not a clock skew and is left alone", () => {
    expect(clockOffset(SERVER, SERVER + 12 * HOUR)).toBe(-12 * HOUR);
    expect(clockOffset(SERVER, SERVER - 12 * HOUR)).toBe(12 * HOUR);
    expect(clockOffset(SERVER, SERVER + 12 * HOUR + SECOND)).toBe(0);
    expect(clockOffset(SERVER, SERVER - 12 * HOUR - SECOND)).toBe(0);
    // A device set to a wrong date (days off) or a page rendered long ago.
    expect(clockOffset(SERVER, SERVER + 40 * 24 * HOUR)).toBe(0);
    expect(clockOffset(SERVER, SERVER - 40 * 24 * HOUR)).toBe(0);
  });

  test("the offset is whole seconds, so the corrected second turns when the shared tick fires", () => {
    expect(clockOffset(SERVER, SERVER - 20 * MINUTE - 400)).toBe(20 * MINUTE);
    expect(clockOffset(SERVER, SERVER - 20 * MINUTE - 600)).toBe(20 * MINUTE + SECOND);
    expect(clockOffset(SERVER, SERVER + 20 * MINUTE + 400)).toBe(-20 * MINUTE);
    for (const device of [SERVER + 20 * MINUTE + 123, SERVER - 7 * MINUTE - 987, SERVER + 61_499]) {
      expect(clockOffset(SERVER, device) % SECOND === 0, `${device - SERVER}`).toBe(true);
    }
  });

  test("a time that is not a number is no correction", () => {
    expect(clockOffset(Number.NaN, SERVER)).toBe(0);
    expect(clockOffset(SERVER, Number.NaN)).toBe(0);
    expect(clockOffset(Number.POSITIVE_INFINITY, SERVER)).toBe(0);
    expect(clockOffset(SERVER, Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("a skewed device clock, with and without the correction", () => {
  // The server renders the page at SERVER_NOW; the device reads its own clock when the page mounts,
  // three seconds later by the network, and the panel ticks ten seconds after that.
  const SERVER_NOW = Date.UTC(2026, 9, 21, 16, 27, 0);
  const DELIVERY = 3 * SECOND;
  const LATER = 10 * SECOND;

  /** What the panel shows for a request created `agoMs` before the page was rendered, `LATER` after it mounted. */
  function panelShows(skewMs: number, agoMs: number) {
    const createdAt = SERVER_NOW - agoMs;
    const deviceAtMount = SERVER_NOW + DELIVERY + skewMs;
    const deviceNow = deviceAtMount + LATER;
    const corrected = deviceNow + clockOffset(SERVER_NOW, deviceAtMount);
    return {
      before: { wait: waitingFor(createdAt, deviceNow), late: isLate(createdAt, deviceNow) },
      after: { wait: waitingFor(createdAt, corrected), late: isLate(createdAt, corrected) },
    };
  }

  test("a device 20 minutes ahead: before, a request of 30 s was 'late' at once (20:43); now it waits 00:40", () => {
    const { before, after } = panelShows(20 * MINUTE, 30 * SECOND);
    expect(before).toEqual({ wait: "20:43", late: true });
    // Server time at the render plus the ten seconds since the page mounted: 30 s + 10 s.
    expect(after).toEqual({ wait: "00:40", late: false });
  });

  test("a device 20 minutes behind: before, a request of 16 minutes never turned late (00:00); now it is 16:10 and late", () => {
    const { before, after } = panelShows(-20 * MINUTE, 16 * MINUTE);
    expect(before).toEqual({ wait: "00:00", late: false });
    expect(after).toEqual({ wait: "16:10", late: true });
  });

  test("a device a few seconds off keeps its own clock", () => {
    for (const skew of [-5 * SECOND, 0, 5 * SECOND]) {
      const { before, after } = panelShows(skew, 90 * SECOND);
      expect(after, `skew ${skew} ms`).toEqual(before);
    }
  });

  test("a difference above twelve hours is not applied (the clock is left as it was)", () => {
    const { before, after } = panelShows(13 * HOUR, 30 * SECOND);
    expect(after).toEqual(before);
  });
});

// --- C5: clockTimeOrDate -------------------------------------------------------------------

describe("clockTimeOrDate: a mark of today shows the time, an older one its date", () => {
  test("the same Belgrade date: the time alone, as before", () => {
    const now = belgrade("2026-10-21T22:30");
    expect(clockTimeOrDate(belgrade("2026-10-21T21:03"), now)).toBe("21:03");
    expect(clockTimeOrDate(belgrade("2026-10-21T00:00"), now)).toBe("00:00");
    expect(clockTimeOrDate(now, now)).toBe("22:30");
  });

  test("an earlier date: day and month in front, numbers only, no padding of the day or month", () => {
    const now = belgrade("2026-10-21T09:00");
    expect(clockTimeOrDate(belgrade("2026-10-20T21:03"), now)).toBe("20. 10. 21:03");
    expect(clockTimeOrDate(belgrade("2026-10-05T07:09"), now)).toBe("5. 10. 07:09");
    expect(clockTimeOrDate(belgrade("2026-09-30T23:59"), now)).toBe("30. 9. 23:59");
    expect(clockTimeOrDate(belgrade("2026-01-02T00:00"), now)).toBe("2. 1. 00:00");
  });

  test("the date is the Belgrade date, not the UTC one", () => {
    const now = belgrade("2026-10-21T12:00");
    // 00:30 in Belgrade (CEST) is 22:30 UTC of the day before, yet it is today for Belgrade.
    expect(clockTimeOrDate(belgrade("2026-10-21T00:30"), now)).toBe("00:30");
    // 23:30 on the 20th in Belgrade is yesterday at 00:10, only forty minutes later.
    expect(clockTimeOrDate(belgrade("2026-10-20T23:30"), belgrade("2026-10-21T00:10"))).toBe("20. 10. 23:30");
  });

  test("a mark from the same time of day yesterday is not fresh", () => {
    const now = belgrade("2026-10-21T21:03");
    expect(clockTimeOrDate(belgrade("2026-10-20T21:03"), now)).toBe("20. 10. 21:03");
  });

  test("25 Oct 2026, the day the clocks go back (a 25-hour day): one date, whatever the offset in between", () => {
    // 00:30 CEST (22:30 UTC the day before) and 23:40 CET (22:40 UTC) are 24 h 10 min apart but share the date.
    const small = belgrade("2026-10-25T00:30");
    const evening = belgrade("2026-10-25T23:40");
    expect(evening - small).toBe(24 * HOUR + 10 * MINUTE);
    expect(clockTimeOrDate(small, evening)).toBe("00:30");
    // Saturday evening (CEST) read on Sunday morning (CET).
    expect(clockTimeOrDate(belgrade("2026-10-24T21:03"), belgrade("2026-10-25T10:00"))).toBe("24. 10. 21:03");
    // Sunday evening (CET) read just after midnight on Monday.
    expect(clockTimeOrDate(evening, belgrade("2026-10-26T00:10"))).toBe("25. 10. 23:40");
    // And the hours after the switch print as the clock on the wall shows them.
    expect(clockTimeOrDate(belgrade("2026-10-25T03:15"), evening)).toBe("03:15");
  });
});
