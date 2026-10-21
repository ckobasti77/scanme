// ScanMe Menu V1 (K25) — the venue's working hours and the reservation times a
// guest may ask for (lib/menu/working-hours.ts; master §11.2, §11.6, §13.9).
// Everything is Belgrade wall-clock. Reference dates (2026): Wed 21 Oct and
// Sat 24 Oct are summer time (CEST, UTC+2); Sunday 25 Oct at 03:00 the clocks
// go back to 02:00 (CET, UTC+1); Sunday 29 Mar at 02:00 they jump to 03:00.
// Invented venues only.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import {
  MENU_HOURS_END_MAX,
  MENU_HOURS_MAX_INTERVALS,
  RESERVATION_MAX_DAYS_AHEAD,
  RESERVATION_SLOT_MIN,
  WORKING_DAYS,
  addDays,
  belgradeDateKey,
  emptyWorkingHours,
  hasAnyHours,
  hhmm,
  intervalFromInput,
  isValidWorkingHours,
  isWithinHours,
  minutesFromHhmm,
  openDates,
  requestedTimeProblem,
  slotsFor,
  weekdayOf,
  type WorkingHours,
  type WorkingInterval,
} from "./working-hours";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Belgrade wall-clock "YYYY-MM-DDTHH:mm" → epoch (throws on a non-existent time, so a typo cannot hide). */
function local(value: string): number {
  const epoch = belgradeLocalToEpoch(value);
  if (epoch === null) throw new Error(`bad local time ${value}`);
  return epoch;
}

function open(start: string, end: string): WorkingInterval {
  const interval = intervalFromInput(start, end);
  if (!interval) throw new Error(`bad interval ${start}-${end}`);
  return interval;
}

/** `days[0]` = Monday … `days[6]` = Sunday; days not named are closed. */
function week(days: Record<number, WorkingInterval[]>): WorkingHours {
  return { days: Array.from({ length: WORKING_DAYS }, (_, index) => days[index] ?? []) };
}

const everyDay = (start: string, end: string): WorkingHours => ({
  days: Array.from({ length: WORKING_DAYS }, () => [open(start, end)]),
});

const MON = 0;
const TUE = 1;
const WED = 2;
const FRI = 4;
const SAT = 5;
const SUN = 6;

/** Wed 21 Oct 2026, 12:00 Belgrade (10:00Z). */
const NOW = local("2026-10-21T12:00");

describe("constants", () => {
  test("the limits of the master", () => {
    expect(WORKING_DAYS).toBe(7);
    expect(MENU_HOURS_MAX_INTERVALS).toBe(3);
    expect(MENU_HOURS_END_MAX).toBe(30 * 60);
    expect(RESERVATION_SLOT_MIN).toBe(15);
    expect(RESERVATION_MAX_DAYS_AHEAD).toBe(60);
  });
});

describe("hhmm", () => {
  test.each([
    [0, "00:00"],
    [5, "00:05"],
    [600, "10:00"],
    [1080, "18:00"],
    [1439, "23:59"],
    [1440, "00:00"],
    [1560, "02:00"],
    [1590, "02:30"], // 26:30 reads as the next day's 02:30
    [1800, "06:00"],
    [-30, "23:30"],
  ])("%i minutes read %s", (minutes, text) => {
    expect(hhmm(minutes)).toBe(text);
  });
});

describe("minutesFromHhmm", () => {
  test.each([
    ["00:00", 0],
    ["07:05", 425],
    ["7:05", 425],
    ["18:30", 1110],
    [" 18:30 ", 1110],
    ["23:59", 1439],
  ])("%j is %i minutes", (text, minutes) => {
    expect(minutesFromHhmm(text)).toBe(minutes);
  });

  test.each(["", "  ", "1830", "18:5", "18.30", "18:30:00", "24:00", "25:10", "12:60", "-1:30", "ab:cd", "18:30 pm"])(
    "%j is not a time",
    (text) => {
      expect(minutesFromHhmm(text)).toBeNull();
    },
  );
});

describe("intervalFromInput", () => {
  test("a plain day interval", () => {
    expect(intervalFromInput("10:00", "23:00")).toEqual({ start: 600, end: 1380 });
  });

  test("an end before the start means after midnight: 18:00-02:00 is 1080-1560", () => {
    expect(intervalFromInput("18:00", "02:00")).toEqual({ start: 1080, end: 1560 });
    expect(intervalFromInput("22:00", "00:00")).toEqual({ start: 1320, end: 1440 });
    expect(intervalFromInput("23:00", "06:00")).toEqual({ start: 1380, end: 1800 });
  });

  test("an end equal to the start means a full 24 hours later, if that still fits in 30:00", () => {
    expect(intervalFromInput("00:00", "00:00")).toEqual({ start: 0, end: 1440 });
    expect(intervalFromInput("06:00", "06:00")).toEqual({ start: 360, end: 1800 });
    // 10:00 + 24 h is 34:00, past the 30:00 limit.
    expect(intervalFromInput("10:00", "10:00")).toBeNull();
  });

  test("an end past 06:00 the next morning is refused", () => {
    expect(intervalFromInput("23:00", "06:05")).toBeNull();
    expect(intervalFromInput("18:00", "07:00")).toBeNull();
  });

  test("minutes must be on the five-minute step", () => {
    expect(intervalFromInput("18:05", "23:55")).toEqual({ start: 1085, end: 1435 });
    expect(intervalFromInput("18:03", "23:00")).toBeNull();
    expect(intervalFromInput("18:00", "23:02")).toBeNull();
  });

  test("anything that is not two clock fields is refused", () => {
    expect(intervalFromInput("", "23:00")).toBeNull();
    expect(intervalFromInput("18:00", "")).toBeNull();
    expect(intervalFromInput("24:00", "02:00")).toBeNull();
    expect(intervalFromInput("18:00", "30:00")).toBeNull();
    expect(intervalFromInput("abc", "def")).toBeNull();
  });
});

describe("isValidWorkingHours", () => {
  const valid = (): WorkingHours =>
    week({
      [MON]: [open("08:00", "12:00"), open("17:00", "23:00")],
      [FRI]: [open("18:00", "02:00")],
      [SAT]: [open("12:00", "03:00")],
      [SUN]: [open("12:00", "16:00")],
    });

  test("a closed week is valid, and so is a normal one", () => {
    expect(isValidWorkingHours(emptyWorkingHours())).toBe(true);
    expect(isValidWorkingHours(valid())).toBe(true);
  });

  test("a week has exactly seven days", () => {
    expect(isValidWorkingHours({ days: valid().days.slice(0, 6) })).toBe(false);
    expect(isValidWorkingHours({ days: [...valid().days, []] })).toBe(false);
    expect(isValidWorkingHours({ days: [] })).toBe(false);
    expect(isValidWorkingHours({ days: "pon-ned" as unknown as WorkingInterval[][] })).toBe(false);
  });

  test("a day has at most three intervals", () => {
    const three = [
      { start: 60, end: 120 },
      { start: 180, end: 240 },
      { start: 300, end: 360 },
    ];
    expect(isValidWorkingHours(week({ [TUE]: three }))).toBe(true);
    expect(isValidWorkingHours(week({ [TUE]: [...three, { start: 420, end: 480 }] }))).toBe(false);
  });

  test("intervals inside a day must not overlap and must be in order; touching is fine", () => {
    expect(isValidWorkingHours(week({ [MON]: [{ start: 600, end: 720 }, { start: 700, end: 800 }] }))).toBe(false);
    expect(isValidWorkingHours(week({ [MON]: [{ start: 700, end: 800 }, { start: 600, end: 650 }] }))).toBe(false);
    expect(isValidWorkingHours(week({ [MON]: [{ start: 600, end: 720 }, { start: 600, end: 720 }] }))).toBe(false);
    expect(isValidWorkingHours(week({ [MON]: [{ start: 600, end: 720 }, { start: 720, end: 800 }] }))).toBe(true);
  });

  test("each interval is checked: step of 5, end after start, start inside the day, end at most 30:00", () => {
    const bad: WorkingInterval[] = [
      { start: 601, end: 720 }, // start off the 5-minute step
      { start: 600, end: 722 }, // end off the step
      { start: 720, end: 720 }, // empty
      { start: 720, end: 600 }, // backwards
      { start: 1440, end: 1500 }, // starts at 24:00
      { start: -5, end: 60 }, // negative
      { start: 600.5, end: 700 }, // not whole minutes
      { start: 1400, end: 1805 }, // past 30:00
      { start: 1380, end: 1900 },
    ];
    for (const interval of bad) {
      expect(isValidWorkingHours(week({ [WED]: [interval] })), JSON.stringify(interval)).toBe(false);
    }
    expect(isValidWorkingHours(week({ [WED]: [{ start: 1400, end: 1800 }] }))).toBe(true);
    expect(isValidWorkingHours(week({ [WED]: [{ start: 0, end: 5 }] }))).toBe(true);
  });

  test("an interval past midnight must not overlap the next day's first interval", () => {
    // Saturday until 02:00, Sunday opens at 01:00: overlap.
    expect(isValidWorkingHours(week({ [SAT]: [open("20:00", "02:00")], [SUN]: [{ start: 60, end: 300 }] }))).toBe(false);
    // Opening exactly when the night ends is fine.
    expect(isValidWorkingHours(week({ [SAT]: [open("20:00", "02:00")], [SUN]: [{ start: 120, end: 300 }] }))).toBe(true);
    // A closed next day is fine.
    expect(isValidWorkingHours(week({ [SAT]: [open("20:00", "05:00")] }))).toBe(true);
    // An interval ending exactly at midnight never touches the next day.
    expect(isValidWorkingHours(week({ [SAT]: [open("20:00", "00:00")], [SUN]: [{ start: 0, end: 300 }] }))).toBe(true);
  });

  test("the night of Sunday runs into Monday: the week wraps", () => {
    expect(isValidWorkingHours(week({ [SUN]: [open("20:00", "02:00")], [MON]: [{ start: 60, end: 300 }] }))).toBe(false);
    expect(isValidWorkingHours(week({ [SUN]: [open("20:00", "02:00")], [MON]: [{ start: 120, end: 300 }] }))).toBe(true);
    expect(isValidWorkingHours(week({ [SUN]: [open("20:00", "02:00")] }))).toBe(true);
  });

  test("an interval that runs past midnight cannot be followed by another one of the same day starting before it ends", () => {
    expect(isValidWorkingHours(week({ [MON]: [{ start: 1200, end: 1560 }, { start: 1400, end: 1700 }] }))).toBe(false);
  });
});

describe("emptyWorkingHours and hasAnyHours", () => {
  test("a closed week has seven separate empty days", () => {
    const hours = emptyWorkingHours();
    expect(hours.days).toHaveLength(7);
    expect(hours.days.every((day) => day.length === 0)).toBe(true);
    expect(hours.days[0]).not.toBe(hours.days[1]);
    expect(hasAnyHours(hours)).toBe(false);
  });

  test("hasAnyHours: null, undefined and a closed week have none; one interval is enough", () => {
    expect(hasAnyHours(null)).toBe(false);
    expect(hasAnyHours(undefined)).toBe(false);
    expect(hasAnyHours(week({ [SUN]: [open("12:00", "16:00")] }))).toBe(true);
  });
});

describe("weekdayOf, addDays and belgradeDateKey", () => {
  test.each([
    ["2026-10-26", 0],
    ["2026-10-21", 2],
    ["2026-10-24", 5],
    ["2026-10-25", 6],
    ["2026-01-01", 3],
    ["2026-12-31", 3],
    ["2027-01-01", 4],
    ["2028-02-29", 1],
  ])("%s is weekday %i (Monday = 0)", (dateKey, weekday) => {
    expect(weekdayOf(dateKey)).toBe(weekday);
  });

  test.each([
    ["2026-10-21", 0, "2026-10-21"],
    ["2026-10-21", 1, "2026-10-22"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-11-30", 1, "2026-12-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-01-31", 30, "2026-03-02"],
    ["2026-10-21", 60, "2026-12-20"],
    ["2026-10-25", -1, "2026-10-24"],
  ])("%s %i days is %s", (dateKey, days, expected) => {
    expect(addDays(dateKey, days)).toBe(expected);
  });

  test("belgradeDateKey is the Belgrade calendar day, not the UTC one", () => {
    expect(belgradeDateKey(Date.UTC(2026, 9, 24, 21, 59))).toBe("2026-10-24"); // 23:59 CEST
    expect(belgradeDateKey(Date.UTC(2026, 9, 24, 22, 0))).toBe("2026-10-25"); // 00:00 CEST
    expect(belgradeDateKey(Date.UTC(2026, 9, 25, 22, 59))).toBe("2026-10-25"); // 23:59 CET
    expect(belgradeDateKey(Date.UTC(2026, 9, 25, 23, 0))).toBe("2026-10-26"); // 00:00 CET
    expect(belgradeDateKey(Date.UTC(2026, 11, 31, 23, 30))).toBe("2027-01-01");
  });
});

describe("slotsFor", () => {
  test("the 15-minute grid inside an interval, start included and end excluded", () => {
    const hours = everyDay("12:00", "14:00");
    const slots = slotsFor("2026-10-24", hours, NOW);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toBe(local("2026-10-24T12:00"));
    expect(slots[7]).toBe(local("2026-10-24T13:45"));
    expect(slots).not.toContain(local("2026-10-24T14:00"));
    for (let index = 1; index < slots.length; index += 1) expect(slots[index] - slots[index - 1]).toBe(15 * MIN);
  });

  test("a closed day has no slots", () => {
    expect(slotsFor("2026-10-24", week({ [FRI]: [open("12:00", "14:00")] }), NOW)).toEqual([]);
  });

  test("slots in the past are dropped, and a slot at exactly 'now' is dropped too", () => {
    const hours = everyDay("12:00", "14:00");
    const expected = ["12:45", "13:00", "13:15", "13:30", "13:45"].map((time) => local(`2026-10-24T${time}`));
    expect(slotsFor("2026-10-24", hours, local("2026-10-24T12:30"))).toEqual(expected);
    expect(slotsFor("2026-10-24", hours, local("2026-10-24T12:31"))).toEqual(expected);
    expect(slotsFor("2026-10-24", hours, local("2026-10-24T13:45"))).toEqual([]);
    expect(slotsFor("2026-10-23", hours, local("2026-10-24T09:00"))).toEqual([]);
  });

  test("an interval past midnight belongs to the day it opened on and yields next-calendar-day epochs", () => {
    const hours = week({ [FRI]: [open("18:00", "02:00")] });
    const slots = slotsFor("2026-10-23", hours, NOW);
    expect(slots).toHaveLength(32);
    expect(slots[0]).toBe(local("2026-10-23T18:00"));
    expect(slots[slots.length - 1]).toBe(local("2026-10-24T01:45"));
    expect(belgradeDateKey(slots[0])).toBe("2026-10-23");
    expect(belgradeDateKey(slots[slots.length - 1])).toBe("2026-10-24");
    // 00:00-01:45 on Saturday are Friday's slots, not Saturday's.
    expect(slotsFor("2026-10-24", hours, NOW)).toEqual([]);
  });

  test("the night of Sunday runs into Monday's calendar day", () => {
    const hours = week({ [SUN]: [open("22:00", "01:00")] });
    const slots = slotsFor("2026-10-25", hours, NOW);
    const expected = [
      ...["22:00", "22:15", "22:30", "22:45", "23:00", "23:15", "23:30", "23:45"].map((time) => local(`2026-10-25T${time}`)),
      ...["00:00", "00:15", "00:30", "00:45"].map((time) => local(`2026-10-26T${time}`)),
    ];
    expect(slots).toEqual(expected);
  });

  test("several intervals give one ascending list without duplicates", () => {
    const hours = week({ [MON]: [open("10:00", "12:00"), open("18:00", "20:00")] });
    const slots = slotsFor("2026-10-26", hours, NOW);
    expect(slots).toHaveLength(16);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots[0]).toBe(local("2026-10-26T10:00"));
    expect(slots[15]).toBe(local("2026-10-26T19:45"));
  });

  test("an interval that starts off the grid gets its first slot on the next quarter: 12:05 -> 12:15", () => {
    const hours = week({ [MON]: [{ start: 12 * 60 + 5, end: 13 * 60 }] });
    expect(isValidWorkingHours(hours)).toBe(true);
    expect(slotsFor("2026-10-26", hours, NOW)).toEqual(["12:15", "12:30", "12:45"].map((time) => local(`2026-10-26T${time}`)));
  });

  test("an interval shorter than the first grid step may offer nothing", () => {
    const hours = week({ [MON]: [{ start: 12 * 60 + 5, end: 12 * 60 + 10 }] });
    expect(slotsFor("2026-10-26", hours, NOW)).toEqual([]);
  });

  test("at most 60 days ahead: the last slot is exactly now + 60 days", () => {
    const hours = everyDay("08:00", "23:00");
    // 12:00 CEST + 60 x 24 h = 11:00 CET on Sunday 20 Dec.
    const latest = NOW + 60 * DAY;
    expect(latest).toBe(local("2026-12-20T11:00"));
    const slots = slotsFor("2026-12-20", hours, NOW);
    expect(slots).toHaveLength(13); // 08:00 ... 11:00
    expect(slots[0]).toBe(local("2026-12-20T08:00"));
    expect(slots[slots.length - 1]).toBe(latest);
    expect(slotsFor("2026-12-21", hours, NOW)).toEqual([]);
    expect(slotsFor("2027-03-01", hours, NOW)).toEqual([]);
  });

  test("a time that does not exist (spring 2026, 02:00-03:00 on 29 March) is not offered", () => {
    const hours = week({ [SUN]: [open("01:00", "04:00")] });
    const now = local("2026-03-20T12:00");
    const slots = slotsFor("2026-03-29", hours, now);
    // 01:00 CET ... 01:45 CET, then 03:00 CEST ... 03:45 CEST: one unbroken quarter-hour run in UTC.
    expect(slots).toEqual(Array.from({ length: 8 }, (_, index) => Date.UTC(2026, 2, 29, 0, 0) + index * 15 * MIN));
  });
});

describe("DST in Belgrade", () => {
  const hours = week({ [SAT]: [open("18:00", "23:00")], [SUN]: [open("18:00", "23:00")] });

  test("Saturday 24 Oct 20:00 is summer time: 18:00Z", () => {
    expect(slotsFor("2026-10-24", hours, NOW)).toContain(Date.UTC(2026, 9, 24, 18, 0));
    expect(local("2026-10-24T20:00")).toBe(Date.UTC(2026, 9, 24, 18, 0));
  });

  test("Sunday 25 Oct 20:00 is winter time: 19:00Z", () => {
    const slots = slotsFor("2026-10-25", hours, NOW);
    expect(slots).toContain(Date.UTC(2026, 9, 25, 19, 0));
    expect(slots[0]).toBe(Date.UTC(2026, 9, 25, 17, 0)); // 18:00 CET
    expect(slots).toHaveLength(20);
    for (let index = 1; index < slots.length; index += 1) expect(slots[index] - slots[index - 1]).toBe(15 * MIN);
  });

  test("isWithinHours and requestedTimeProblem agree with the slots on both sides of the change", () => {
    expect(isWithinHours(Date.UTC(2026, 9, 24, 18, 0), hours)).toBe(true);
    expect(isWithinHours(Date.UTC(2026, 9, 25, 19, 0), hours)).toBe(true);
    expect(requestedTimeProblem(Date.UTC(2026, 9, 25, 19, 0), hours, NOW)).toBeNull();
    // 23:00 CET on Sunday is the end of the interval.
    expect(isWithinHours(Date.UTC(2026, 9, 25, 22, 0), hours)).toBe(false);
    // 22:45 CET is still inside.
    expect(isWithinHours(Date.UTC(2026, 9, 25, 21, 45), hours)).toBe(true);
  });

  test("a night that crosses the clock change offers ascending, unique slots, all accepted by isWithinHours", () => {
    const night = week({ [SAT]: [open("22:00", "03:00")] });
    const slots = slotsFor("2026-10-24", night, NOW);
    expect(slots).toHaveLength(20); // 22:00 ... 02:45 on the wall clock
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
    expect(new Set(slots).size).toBe(slots.length);
    for (const slot of slots) expect(isWithinHours(slot, night), String(slot)).toBe(true);
    expect(slots[0]).toBe(Date.UTC(2026, 9, 24, 20, 0)); // 22:00 CEST
  });
});

describe("openDates", () => {
  test("every day with a free slot, from today to 60 days ahead", () => {
    const dates = openDates(everyDay("08:00", "23:00"), NOW);
    expect(dates).toHaveLength(61);
    expect(dates[0]).toBe("2026-10-21"); // slots after 12:00 are still free today
    expect(dates[dates.length - 1]).toBe("2026-12-20");
    expect(dates[1]).toBe("2026-10-22");
  });

  test("a day whose slots are all gone is left out", () => {
    // Wednesday 10:00-12:00 ends at 'now': nothing left today.
    const dates = openDates(week({ [WED]: [open("10:00", "12:00")] }), NOW);
    expect(dates[0]).toBe("2026-10-28");
    expect(dates).not.toContain("2026-10-21");
  });

  test("only the venue's open weekdays appear", () => {
    const dates = openDates(week({ [SAT]: [open("12:00", "16:00")] }), NOW);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((dateKey) => weekdayOf(dateKey) === SAT)).toBe(true);
    expect(dates[0]).toBe("2026-10-24");
    expect(dates[dates.length - 1]).toBe("2026-12-19");
  });

  test("a closed week has no dates", () => {
    expect(openDates(emptyWorkingHours(), NOW)).toEqual([]);
  });

  test("today counts by the Belgrade day: just after local midnight 'today' is already the next day", () => {
    const afterMidnight = Date.UTC(2026, 9, 21, 22, 30); // 00:30 CEST on Thursday 22 Oct
    expect(openDates(everyDay("08:00", "23:00"), afterMidnight)[0]).toBe("2026-10-22");
  });

  test("the rest of last night is not offered as 'today': a slot belongs to the day its interval opened on", () => {
    // Friday 18:00-02:00; now is Saturday 00:30, inside that night. Saturday is closed, Friday is over.
    const hours = week({ [FRI]: [open("18:00", "02:00")] });
    const now = local("2026-10-24T00:30");
    expect(openDates(hours, now)[0]).toBe("2026-10-30"); // the following Friday
  });
});

describe("isWithinHours", () => {
  const hours = week({
    [FRI]: [open("18:00", "02:00")],
    [SAT]: [open("12:00", "16:00")],
    [SUN]: [open("22:00", "02:00")],
  });

  test("inside an interval of its own day", () => {
    expect(isWithinHours(local("2026-10-23T18:00"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-23T23:45"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-24T12:00"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-24T15:45"), hours)).toBe(true);
  });

  test("the start is inside, the end is outside", () => {
    expect(isWithinHours(local("2026-10-24T16:00"), hours)).toBe(false);
    expect(isWithinHours(local("2026-10-24T11:45"), hours)).toBe(false);
    expect(isWithinHours(local("2026-10-23T17:45"), hours)).toBe(false);
  });

  test("the small hours belong to the previous day's interval", () => {
    expect(isWithinHours(local("2026-10-24T00:00"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-24T01:45"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-24T02:00"), hours)).toBe(false);
    // Saturday itself opens only at 12:00, so Sunday 01:00 is not Saturday's night.
    expect(isWithinHours(local("2026-10-25T01:00"), hours)).toBe(false);
  });

  test("Sunday night runs into Monday, across the week's end", () => {
    expect(isWithinHours(local("2026-10-26T00:00"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-26T01:45"), hours)).toBe(true);
    expect(isWithinHours(local("2026-10-26T02:00"), hours)).toBe(false);
    expect(isWithinHours(local("2026-10-26T12:00"), hours)).toBe(false);
  });

  test("a minute off the 15-minute grid is refused, even inside an interval", () => {
    expect(isWithinHours(local("2026-10-24T12:10"), hours)).toBe(false);
    expect(isWithinHours(local("2026-10-24T12:01"), hours)).toBe(false);
    expect(isWithinHours(local("2026-10-24T12:15"), hours)).toBe(true);
  });

  test("seconds or milliseconds that are not zero are refused", () => {
    const onGrid = local("2026-10-24T12:00");
    expect(isWithinHours(onGrid, hours)).toBe(true);
    expect(isWithinHours(onGrid + 1_000, hours)).toBe(false);
    expect(isWithinHours(onGrid + 1, hours)).toBe(false);
    expect(isWithinHours(onGrid + 59_999, hours)).toBe(false);
  });

  test("a closed day is outside", () => {
    expect(isWithinHours(local("2026-10-26T12:00"), hours)).toBe(false);
    expect(isWithinHours(local("2026-10-22T12:00"), emptyWorkingHours())).toBe(false);
  });
});

describe("requestedTimeProblem", () => {
  const hours = everyDay("10:00", "23:00");

  test("a good time is no problem", () => {
    expect(requestedTimeProblem(local("2026-10-24T20:00"), hours, NOW)).toBeNull();
    expect(requestedTimeProblem(local("2026-10-24T10:00"), hours, NOW)).toBeNull();
    expect(requestedTimeProblem(local("2026-10-24T22:45"), hours, NOW)).toBeNull();
  });

  test("now or earlier is in the past; so is a time that is not a number", () => {
    expect(requestedTimeProblem(NOW, hours, NOW)).toBe("reservation/in_past");
    expect(requestedTimeProblem(NOW - 1, hours, NOW)).toBe("reservation/in_past");
    expect(requestedTimeProblem(local("2026-10-20T20:00"), hours, NOW)).toBe("reservation/in_past");
    expect(requestedTimeProblem(Number.NaN, hours, NOW)).toBe("reservation/in_past");
    expect(requestedTimeProblem(NOW + MIN, hours, NOW)).not.toBe("reservation/in_past");
  });

  test("more than 60 days ahead is too far; exactly 60 days is still allowed", () => {
    const sixtyDays = NOW + 60 * DAY;
    expect(requestedTimeProblem(sixtyDays, hours, NOW)).toBeNull();
    expect(requestedTimeProblem(sixtyDays + 15 * MIN, hours, NOW)).toBe("reservation/too_far");
    expect(requestedTimeProblem(sixtyDays + 1, hours, NOW)).toBe("reservation/too_far");
    expect(requestedTimeProblem(local("2027-03-01T20:00"), hours, NOW)).toBe("reservation/too_far");
  });

  test("outside the hours: before opening, at closing, off the grid, with seconds, on a closed day", () => {
    expect(requestedTimeProblem(local("2026-10-24T09:45"), hours, NOW)).toBe("reservation/outside_hours");
    expect(requestedTimeProblem(local("2026-10-24T23:00"), hours, NOW)).toBe("reservation/outside_hours");
    expect(requestedTimeProblem(local("2026-10-24T20:10"), hours, NOW)).toBe("reservation/outside_hours");
    expect(requestedTimeProblem(local("2026-10-24T20:00") + 1_000, hours, NOW)).toBe("reservation/outside_hours");
    expect(requestedTimeProblem(local("2026-10-24T20:00"), week({ [FRI]: [open("10:00", "23:00")] }), NOW)).toBe(
      "reservation/outside_hours",
    );
  });

  test("a time after midnight is fine when the night before is open", () => {
    const night = week({ [FRI]: [open("18:00", "02:00")] });
    expect(requestedTimeProblem(local("2026-10-24T01:45"), night, NOW)).toBeNull();
    expect(requestedTimeProblem(local("2026-10-24T02:00"), night, NOW)).toBe("reservation/outside_hours");
  });

  test("the order of checks: past first, then too far, then the hours", () => {
    expect(requestedTimeProblem(local("2026-10-20T03:00"), hours, NOW)).toBe("reservation/in_past");
    expect(requestedTimeProblem(local("2027-03-01T03:00"), hours, NOW)).toBe("reservation/too_far");
    expect(requestedTimeProblem(local("2026-10-24T03:00"), hours, NOW)).toBe("reservation/outside_hours");
  });

  test("every slot slotsFor offers is accepted, and the minute before it is not", () => {
    const some = week({
      [MON]: [open("10:00", "12:00"), open("18:00", "01:00")],
      [TUE]: [open("09:00", "17:30")],
      [SAT]: [open("12:05", "14:00")],
    });
    let checked = 0;
    for (let offset = 0; offset < 14; offset += 1) {
      const dateKey = addDays("2026-10-21", offset);
      for (const slot of slotsFor(dateKey, some, NOW)) {
        expect(requestedTimeProblem(slot, some, NOW), new Date(slot).toISOString()).toBeNull();
        expect(requestedTimeProblem(slot - MIN, some, NOW), new Date(slot - MIN).toISOString()).not.toBeNull();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});

// K34: openDates stops at the first slot of a day instead of building the whole grid (the
// reservation form asks for 61 days); the answer must stay exactly the days slotsFor fills.
describe("K34: openDates equals the days with a slot", () => {
  const reference = (hours: WorkingHours, now: number) => {
    const out: string[] = [];
    for (let offset = 0; offset <= RESERVATION_MAX_DAYS_AHEAD; offset += 1) {
      const dateKey = addDays(belgradeDateKey(now), offset);
      if (slotsFor(dateKey, hours, now).length > 0) out.push(dateKey);
    }
    return out;
  };
  const cases: Array<[string, WorkingHours, number]> = [
    ["every day 08–23, at 10:07", everyDay("08:00", "23:00"), local("2026-10-21T10:07")],
    ["every day 08–23, after closing", everyDay("08:00", "23:00"), local("2026-10-21T23:30")],
    ["past midnight 18–02, at 01:30", everyDay("18:00", "02:00"), local("2026-10-22T01:30")],
    ["two intervals on some days, on the DST change", week({ [SAT]: [open("10:00", "14:00"), open("18:00", "23:00")], [SUN]: [open("02:00", "04:00")] }), local("2026-10-24T22:00")],
    ["a single 15-minute slot on Monday", week({ [MON]: [open("12:00", "12:15")] }), local("2026-10-19T11:59")],
    ["closed every day", emptyWorkingHours(), local("2026-10-21T10:00")],
  ];
  test.each(cases)("%s", (_ime, hours, now) => {
    expect(openDates(hours, now)).toEqual(reference(hours, now));
  });
});
