// ScanMe Menu V1 (K25) — how a reservation's date and time read on the guest's
// form, the cancel link and the waiter panel (lib/menu/reservation-time.ts):
// "Danas · 20:00", "Sutra · 19:30", "Sub 24. 10. · 20:00". Belgrade wall-clock.
// Reference "now": Wed 21 Oct 2026, 18:00 Belgrade (CEST).

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import { dateKeyLabel, reservationTermText, shortDateOf, type ReservationDateLabels } from "./reservation-time";

function local(value: string): number {
  const epoch = belgradeLocalToEpoch(value);
  if (epoch === null) throw new Error(`bad local time ${value}`);
  return epoch;
}

const LABELS: ReservationDateLabels = {
  weekdaysShort: ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"],
  today: "Danas",
  tomorrow: "Sutra",
  shortDate: "{dan} {d}. {m}.",
  term: "{datum} · {vreme}",
};

const NOW = local("2026-10-21T18:00");

describe("shortDateOf", () => {
  test.each([
    ["2026-10-24", "Sub 24. 10."],
    ["2026-10-25", "Ned 25. 10."],
    ["2026-10-26", "Pon 26. 10."],
    ["2026-10-27", "Uto 27. 10."],
    ["2026-10-21", "Sre 21. 10."],
    ["2026-10-22", "Čet 22. 10."],
    ["2026-10-23", "Pet 23. 10."],
  ])("%s reads %s", (dateKey, text) => {
    expect(shortDateOf(dateKey, LABELS)).toBe(text);
  });

  test("the day and the month carry no leading zero", () => {
    expect(shortDateOf("2026-01-05", LABELS)).toBe("Pon 5. 1.");
    expect(shortDateOf("2026-03-09", LABELS)).toBe("Pon 9. 3.");
  });

  test("the year and the month ends work", () => {
    expect(shortDateOf("2026-12-31", LABELS)).toBe("Čet 31. 12.");
    expect(shortDateOf("2027-01-01", LABELS)).toBe("Pet 1. 1.");
    expect(shortDateOf("2028-02-29", LABELS)).toBe("Uto 29. 2.");
  });

  test("the words and their order come from the labels", () => {
    const labels: ReservationDateLabels = { ...LABELS, shortDate: "{d}.{m}. ({dan})" };
    expect(shortDateOf("2026-10-24", labels)).toBe("24.10. (Sub)");
  });
});

describe("dateKeyLabel", () => {
  test("today, tomorrow, and the short date for any other day", () => {
    expect(dateKeyLabel("2026-10-21", NOW, LABELS)).toBe("Danas");
    expect(dateKeyLabel("2026-10-22", NOW, LABELS)).toBe("Sutra");
    expect(dateKeyLabel("2026-10-23", NOW, LABELS)).toBe("Pet 23. 10.");
    expect(dateKeyLabel("2026-10-24", NOW, LABELS)).toBe("Sub 24. 10.");
    expect(dateKeyLabel("2026-12-24", NOW, LABELS)).toBe("Čet 24. 12.");
  });

  test("yesterday is a plain date, not a relative word", () => {
    expect(dateKeyLabel("2026-10-20", NOW, LABELS)).toBe("Uto 20. 10.");
  });

  test("'tomorrow' is found across the end of a month and of a year", () => {
    expect(dateKeyLabel("2026-11-01", local("2026-10-31T20:00"), LABELS)).toBe("Sutra");
    expect(dateKeyLabel("2027-01-01", local("2026-12-31T20:00"), LABELS)).toBe("Sutra");
    expect(dateKeyLabel("2028-02-29", local("2028-02-28T20:00"), LABELS)).toBe("Sutra");
  });

  test("'today' is the Belgrade day: just after local midnight it is already the next date", () => {
    const afterMidnight = Date.UTC(2026, 9, 21, 22, 30); // 00:30 CEST on Thursday 22 Oct
    expect(dateKeyLabel("2026-10-22", afterMidnight, LABELS)).toBe("Danas");
    expect(dateKeyLabel("2026-10-21", afterMidnight, LABELS)).toBe("Sre 21. 10.");
    expect(dateKeyLabel("2026-10-23", afterMidnight, LABELS)).toBe("Sutra");
  });

  test("the day of the clock change keeps counting whole calendar days", () => {
    const saturday = local("2026-10-24T23:00");
    expect(dateKeyLabel("2026-10-25", saturday, LABELS)).toBe("Sutra");
    expect(dateKeyLabel("2026-10-26", saturday, LABELS)).toBe("Pon 26. 10.");
  });
});

describe("reservationTermText", () => {
  test("a later date: 'Sub 24. 10. · 20:00'", () => {
    expect(reservationTermText(local("2026-10-24T20:00"), NOW, LABELS)).toBe("Sub 24. 10. · 20:00");
    expect(reservationTermText(Date.UTC(2026, 9, 24, 18, 0), NOW, LABELS)).toBe("Sub 24. 10. · 20:00");
  });

  test("today and tomorrow use the words", () => {
    expect(reservationTermText(local("2026-10-21T20:00"), NOW, LABELS)).toBe("Danas · 20:00");
    expect(reservationTermText(local("2026-10-22T19:30"), NOW, LABELS)).toBe("Sutra · 19:30");
  });

  test("a time earlier today is still 'Danas'", () => {
    expect(reservationTermText(local("2026-10-21T09:05"), NOW, LABELS)).toBe("Danas · 09:05");
  });

  test("the time reads on the Belgrade clock on both sides of the clock change", () => {
    expect(reservationTermText(Date.UTC(2026, 9, 24, 18, 0), NOW, LABELS)).toBe("Sub 24. 10. · 20:00"); // CEST
    expect(reservationTermText(Date.UTC(2026, 9, 25, 19, 0), NOW, LABELS)).toBe("Ned 25. 10. · 20:00"); // CET
  });

  test("a time after midnight belongs to the next calendar day", () => {
    const halfPastMidnight = Date.UTC(2026, 9, 21, 22, 30); // 00:30 CEST, Thursday
    expect(reservationTermText(halfPastMidnight, NOW, LABELS)).toBe("Sutra · 00:30");
    expect(reservationTermText(local("2026-10-23T01:45"), NOW, LABELS)).toBe("Pet 23. 10. · 01:45");
  });

  test("the words and their order come from the labels", () => {
    const labels: ReservationDateLabels = { ...LABELS, today: "Today", term: "{vreme} - {datum}" };
    expect(reservationTermText(local("2026-10-21T20:00"), NOW, labels)).toBe("20:00 - Today");
    expect(reservationTermText(local("2026-10-24T20:00"), NOW, labels)).toBe("20:00 - Sub 24. 10.");
  });
});
