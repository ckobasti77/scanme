// ScanMe Menu V1 — K10: "danas u 14:32", "juče u 9:05", "17. 10. u 9:05". All
// times are Belgrade wall-clock: CEST (UTC+2) until the last Sunday of October
// (25 October 2026), CET (UTC+1) after that.

import { describe, expect, test } from "vitest";
import { kadaTekst } from "./kada";

const reci = { danas: "danas u {vreme}", juce: "juče u {vreme}", datum: "{datum} u {vreme}" };

describe("kadaTekst", () => {
  // 2026-10-18 14:32 in Belgrade = 12:32 UTC (CEST).
  const sada = Date.UTC(2026, 9, 18, 12, 32);

  test("the same Belgrade day is danas, the minutes are zero-padded, the hour is not", () => {
    expect(kadaTekst(Date.UTC(2026, 9, 18, 12, 32), sada, reci)).toBe("danas u 14:32");
    // 07:05 UTC = 09:05 Belgrade.
    expect(kadaTekst(Date.UTC(2026, 9, 18, 7, 5), sada, reci)).toBe("danas u 9:05");
    // 00:00 Belgrade = 22:00 UTC the day before (CEST).
    expect(kadaTekst(Date.UTC(2026, 9, 17, 22, 0), sada, reci)).toBe("danas u 0:00");
  });

  test("the previous Belgrade day is juče", () => {
    // 2026-10-17 09:05 Belgrade = 07:05 UTC.
    expect(kadaTekst(Date.UTC(2026, 9, 17, 7, 5), sada, reci)).toBe("juče u 9:05");
    // 23:59 Belgrade on the 17th = 21:59 UTC.
    expect(kadaTekst(Date.UTC(2026, 9, 17, 21, 59), sada, reci)).toBe("juče u 23:59");
  });

  test("older than yesterday uses the date, day and month without leading zeros", () => {
    // 2026-10-16 09:05 Belgrade = 07:05 UTC.
    expect(kadaTekst(Date.UTC(2026, 9, 16, 7, 5), sada, reci)).toBe("16. 10. u 9:05");
    // 2026-09-03 11:00 Belgrade = 09:00 UTC.
    expect(kadaTekst(Date.UTC(2026, 8, 3, 9, 0), sada, reci)).toBe("3. 9. u 11:00");
    // Across the year boundary.
    expect(kadaTekst(Date.UTC(2025, 11, 31, 10, 30), sada, reci)).toBe("31. 12. u 11:30");
  });

  test("the day is the Belgrade day, not the UTC day", () => {
    // 22:30 UTC on the 17th is already 00:30 on the 18th in Belgrade: danas.
    expect(kadaTekst(Date.UTC(2026, 9, 17, 22, 30), sada, reci)).toBe("danas u 0:30");
    // And `sada` just after Belgrade midnight turns an evening of the 17th into juče.
    const posleponoci = Date.UTC(2026, 9, 17, 22, 5); // 00:05 on the 18th, Belgrade
    expect(kadaTekst(Date.UTC(2026, 9, 17, 18, 0), posleponoci, reci)).toBe("juče u 20:00");
  });

  test("the offset follows daylight saving time: CEST before 25 Oct 2026, CET after", () => {
    // Summer time: 12:00 UTC on 2026-10-24 is 14:00.
    const sub = Date.UTC(2026, 9, 24, 12, 0);
    expect(kadaTekst(sub, sub, reci)).toBe("danas u 14:00");
    // Winter time: 12:00 UTC on 2026-10-26 is 13:00.
    const pon = Date.UTC(2026, 9, 26, 12, 0);
    expect(kadaTekst(pon, pon, reci)).toBe("danas u 13:00");
    // The change happens at 01:00 UTC on Sunday 25 Oct: 00:59 UTC is 02:59, 01:00 UTC is 02:00 again.
    expect(kadaTekst(Date.UTC(2026, 9, 25, 0, 59), Date.UTC(2026, 9, 25, 0, 59), reci)).toBe("danas u 2:59");
    expect(kadaTekst(Date.UTC(2026, 9, 25, 1, 0), Date.UTC(2026, 9, 25, 1, 0), reci)).toBe("danas u 2:00");
  });

  test("juče and the date work across the daylight saving change", () => {
    // Monday 26 Oct 2026, 10:00 Belgrade (CET) = 09:00 UTC.
    const ponedeljak = Date.UTC(2026, 9, 26, 9, 0);
    // Sunday 25 Oct 2026, 08:15 Belgrade (CET) = 07:15 UTC -> juče.
    expect(kadaTekst(Date.UTC(2026, 9, 25, 7, 15), ponedeljak, reci)).toBe("juče u 8:15");
    // Saturday 24 Oct 2026, 08:15 Belgrade (CEST) = 06:15 UTC -> the date.
    expect(kadaTekst(Date.UTC(2026, 9, 24, 6, 15), ponedeljak, reci)).toBe("24. 10. u 8:15");
  });

  test("a publication from the future of `sada` still reads as a date, never as danas", () => {
    // Clock skew: the epoch is two days after `sada`.
    expect(kadaTekst(Date.UTC(2026, 9, 20, 12, 0), sada, reci)).toBe("20. 10. u 14:00");
  });

  test("the phrases come from the dictionary passed in", () => {
    const en = { danas: "today at {vreme}", juce: "yesterday at {vreme}", datum: "{datum} at {vreme}" };
    expect(kadaTekst(Date.UTC(2026, 9, 18, 12, 32), sada, en)).toBe("today at 14:32");
    expect(kadaTekst(Date.UTC(2026, 9, 17, 7, 5), sada, en)).toBe("yesterday at 9:05");
    expect(kadaTekst(Date.UTC(2026, 9, 16, 7, 5), sada, en)).toBe("16. 10. at 9:05");
  });
});
