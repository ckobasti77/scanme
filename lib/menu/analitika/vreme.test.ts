// ScanMe Menu V1 (K29) — the analytics clock: a day is a Belgrade calendar day
// (summer and winter time), never the UTC day and never the guest's phone
// (docs/menu/ANALITIKA-DEFINICIJE.md §2, tag [dan-beograd]).

import { describe, expect, test } from "vitest";
import { danUBeogradu, satUBeogradu } from "./vreme";

const utc = (iso: string) => Date.parse(iso);

describe("danUBeogradu / satUBeogradu", () => {
  // Summer time (CEST, UTC+2): Belgrade midnight is 22:00 UTC the evening before.
  test("[dan-beograd] summer time: 21:59 UTC is still 23:59 of the same Belgrade day", () => {
    expect(danUBeogradu(utc("2026-10-20T21:59:00Z"))).toBe("2026-10-20");
    expect(satUBeogradu(utc("2026-10-20T21:59:00Z"))).toBe(23);
  });

  test("[dan-beograd] summer time: 22:01 UTC is 00:01 of the next Belgrade day", () => {
    expect(danUBeogradu(utc("2026-10-20T22:01:00Z"))).toBe("2026-10-21");
    expect(satUBeogradu(utc("2026-10-20T22:01:00Z"))).toBe(0);
  });

  test("[dan-beograd] summer time: exactly 22:00:00 UTC is Belgrade midnight and starts the new day", () => {
    expect(danUBeogradu(utc("2026-10-20T22:00:00Z"))).toBe("2026-10-21");
    expect(satUBeogradu(utc("2026-10-20T22:00:00Z"))).toBe(0);
    expect(danUBeogradu(utc("2026-10-20T21:59:59.999Z"))).toBe("2026-10-20");
  });

  // Winter time (CET, UTC+1): Belgrade midnight is 23:00 UTC the evening before.
  test("[dan-beograd] winter time: 22:30 UTC on 31 Dec is 23:30 of the same Belgrade day", () => {
    expect(danUBeogradu(utc("2026-12-31T22:30:00Z"))).toBe("2026-12-31");
    expect(satUBeogradu(utc("2026-12-31T22:30:00Z"))).toBe(23);
  });

  test("[dan-beograd] winter time: 23:30 UTC on 31 Dec is already 1 January in Belgrade (year changes)", () => {
    expect(danUBeogradu(utc("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(satUBeogradu(utc("2026-12-31T23:30:00Z"))).toBe(0);
  });

  test("[dan-beograd] the UTC day and the Belgrade day differ in the first hours (not the UTC date)", () => {
    // 00:30 UTC on 1 July is 02:30 in Belgrade, same date; 23:30 UTC on 30 June is 01:30 on 1 July.
    expect(danUBeogradu(utc("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(satUBeogradu(utc("2026-06-30T23:30:00Z"))).toBe(1);
    expect(danUBeogradu(utc("2026-07-01T00:30:00Z"))).toBe("2026-07-01");
    expect(satUBeogradu(utc("2026-07-01T00:30:00Z"))).toBe(2);
  });

  // Autumn change: on 2026-10-25 the clocks go from 03:00 CEST back to 02:00 CET
  // at 01:00 UTC, so the Belgrade day lasts 25 hours and the hour 2 happens twice.
  test("[dan-beograd] autumn DST change: the day starts at 22:00 UTC the evening before", () => {
    expect(danUBeogradu(utc("2026-10-24T21:59:59Z"))).toBe("2026-10-24");
    expect(satUBeogradu(utc("2026-10-24T21:59:59Z"))).toBe(23);
    expect(danUBeogradu(utc("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(satUBeogradu(utc("2026-10-24T22:00:00Z"))).toBe(0);
  });

  test("[dan-beograd] autumn DST change: hour 2 happens twice (00:30 UTC is 02:30 CEST, 01:30 UTC is 02:30 CET)", () => {
    expect(danUBeogradu(utc("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    expect(satUBeogradu(utc("2026-10-25T00:30:00Z"))).toBe(2);
    expect(danUBeogradu(utc("2026-10-25T01:30:00Z"))).toBe("2026-10-25");
    expect(satUBeogradu(utc("2026-10-25T01:30:00Z"))).toBe(2);
    expect(satUBeogradu(utc("2026-10-25T02:30:00Z"))).toBe(3);
  });

  test("[dan-beograd] autumn DST change: the day ends at 23:00 UTC, 25 hours after it started", () => {
    expect(danUBeogradu(utc("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
    expect(satUBeogradu(utc("2026-10-25T22:59:59Z"))).toBe(23);
    expect(danUBeogradu(utc("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
    expect(satUBeogradu(utc("2026-10-25T23:00:00Z"))).toBe(0);
    expect(utc("2026-10-25T23:00:00Z") - utc("2026-10-24T22:00:00Z")).toBe(25 * 60 * 60 * 1000);
  });

  // Spring change: on 2026-03-29 the clocks go from 02:00 CET to 03:00 CEST at 01:00 UTC
  // (a 23-hour day, hour 2 never happens).
  test("[dan-beograd] spring DST change: hour 2 never happens and the day ends at 22:00 UTC", () => {
    expect(danUBeogradu(utc("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    expect(satUBeogradu(utc("2026-03-28T23:00:00Z"))).toBe(0);
    expect(satUBeogradu(utc("2026-03-29T00:59:59Z"))).toBe(1);
    expect(satUBeogradu(utc("2026-03-29T01:00:00Z"))).toBe(3);
    expect(danUBeogradu(utc("2026-03-29T21:59:59Z"))).toBe("2026-03-29");
    expect(danUBeogradu(utc("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
    expect(utc("2026-03-29T22:00:00Z") - utc("2026-03-28T23:00:00Z")).toBe(23 * 60 * 60 * 1000);
  });

  test("[dan-beograd] the hour is always an integer from 0 to 23, over a whole year", () => {
    const start = utc("2026-01-01T00:00:00Z");
    for (let step = 0; step < 365 * 24; step += 5) {
      const sat = satUBeogradu(start + step * 60 * 60 * 1000);
      expect(Number.isInteger(sat)).toBe(true);
      expect(sat).toBeGreaterThanOrEqual(0);
      expect(sat).toBeLessThanOrEqual(23);
    }
  });
});
