import { describe, expect, test } from "vitest";
import {
  formatBelgradeDate,
  formatBelgradeTime,
  googleCalendarUrl,
  icsContent,
  toUtcBasic,
} from "./venue-calendar";

// Belgrade is CET (UTC+1) in winter and CEST (UTC+2) in summer. The same
// 20:00 wall-clock start therefore maps to a DIFFERENT UTC instant in January
// vs July — exactly the trap the calendar links must survive.
const WINTER_2000_BELGRADE = Date.UTC(2026, 0, 15, 19, 0, 0); // 15 Jan 2026 20:00 CET
const SUMMER_2000_BELGRADE = Date.UTC(2026, 6, 15, 18, 0, 0); // 15 Jul 2026 20:00 CEST

describe("Europe/Belgrade DST correctness", () => {
  test("winter and summer 20:00 wall-clock both display as 20:00", () => {
    expect(formatBelgradeTime(WINTER_2000_BELGRADE)).toBe("20:00");
    expect(formatBelgradeTime(SUMMER_2000_BELGRADE)).toBe("20:00");
  });

  test("dates format in Serbian with the Belgrade zone", () => {
    expect(formatBelgradeDate(WINTER_2000_BELGRADE)).toContain("januar");
    expect(formatBelgradeDate(SUMMER_2000_BELGRADE)).toContain("jul");
  });

  test("UTC basic format carries the DST-shifted instant", () => {
    expect(toUtcBasic(WINTER_2000_BELGRADE)).toBe("20260115T190000Z");
    expect(toUtcBasic(SUMMER_2000_BELGRADE)).toBe("20260715T180000Z");
  });
});

describe("googleCalendarUrl", () => {
  test("emits UTC instants plus the Belgrade ctz hint", () => {
    const url = googleCalendarUrl({
      title: "Nova godina",
      startsAt: WINTER_2000_BELGRADE,
      endsAt: WINTER_2000_BELGRADE + 3 * 3600_000,
      location: "Klub Barok, Beograd",
    });
    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("dates=20260115T190000Z%2F20260115T220000Z");
    expect(url).toContain("ctz=Europe%2FBelgrade");
    expect(url).toContain("Klub+Barok");
  });

  test("defaults a missing end to start + 2h", () => {
    const url = googleCalendarUrl({
      title: "X",
      startsAt: SUMMER_2000_BELGRADE,
    });
    expect(url).toContain("dates=20260715T180000Z%2F20260715T200000Z");
  });
});

describe("icsContent", () => {
  test("valid VCALENDAR with UTC times, CRLF, and escaped text", () => {
    const ics = icsContent({
      uid: "test-1@scanme",
      title: "Svadba; Jovana, Marko",
      startsAt: SUMMER_2000_BELGRADE,
      location: "Sala\nVelika",
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("DTSTART:20260715T180000Z");
    expect(ics).toContain("DTEND:20260715T200000Z");
    expect(ics).toContain("SUMMARY:Svadba\\; Jovana\\, Marko");
    expect(ics).toContain("LOCATION:Sala\\nVelika");
  });
});
