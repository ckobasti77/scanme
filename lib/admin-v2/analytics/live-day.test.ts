import { describe, expect, test } from "vitest";
import { liveDay, liveDayPercent, type LiveDayInput } from "./live-day";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-09T00:00:00+02:00");
const days = [0, 1, 2].map((index) => ({ startsAt: START + index * DAY, endsAt: START + (index + 1) * DAY }));

const input = (over: Partial<LiveDayInput> = {}): LiveDayInput => ({
  phase: { kind: "sajam", dayOpen: true, dayIndex: 3, dayCount: 3 },
  days,
  scansToday: 179,
  leadsToday: 0,
  actions: [{ tone: "hitno" }, { tone: "uskoro" }, { tone: "uskoro" }, { tone: "uskoro" }, { tone: "info" }],
  ...over,
});

describe("ADMIN v2 X3: the open fair day (HUD)", () => {
  test("the last day at 22:38: 94 % of the day has passed and 1 h 22 min is left", () => {
    const now = Date.parse("2026-10-11T22:38:00+02:00");
    const live = liveDay(input(), now)!;
    expect(live).toMatchObject({ dayIndex: 3, dayCount: 3, scansToday: 179, leadsToday: 0, urgent: 1, soon: 3 });
    expect(liveDayPercent(live.progress)).toBe(94);
    expect(live.left).toBe(82 * 60_000);
  });

  test("the progress is the share of the open day, not of the fair", () => {
    const live = liveDay(input({ phase: { kind: "sajam", dayOpen: true, dayIndex: 2, dayCount: 3 } }), START + DAY + 6 * HOUR)!;
    expect(live.progress).toBe(0.25);
    expect(live.left).toBe(18 * HOUR);
  });

  test("an info item is not a task; no item, nothing to react to", () => {
    expect(liveDay(input({ actions: [{ tone: "info" }, { tone: "info" }] }), START + 2 * DAY + HOUR)).toMatchObject({ urgent: 0, soon: 0 });
    expect(liveDay(input({ actions: [] }), START + 2 * DAY + HOUR)).toMatchObject({ urgent: 0, soon: 0 });
  });

  test("leads that no package has stay null, never a zero", () => {
    expect(liveDay(input({ leadsToday: null }), START + 2 * DAY + HOUR)!.leadsToday).toBeNull();
  });

  test("no HUD before the fair, after it, between two fair days or for a day that is not in the list", () => {
    const now = START + 2 * DAY + HOUR;
    expect(liveDay(input({ phase: { kind: "pre", dayOpen: false, dayIndex: null, dayCount: 3 } }), now)).toBeNull();
    expect(liveDay(input({ phase: { kind: "posle", dayOpen: false, dayIndex: null, dayCount: 3 } }), now)).toBeNull();
    expect(liveDay(input({ phase: { kind: "sajam", dayOpen: false, dayIndex: 3, dayCount: 3 } }), now)).toBeNull();
    expect(liveDay(input({ phase: { kind: "sajam", dayOpen: true, dayIndex: 4, dayCount: 3 } }), now)).toBeNull();
    expect(liveDay(input({ days: [] }), now)).toBeNull();
  });

  test("a clock outside the day is held inside it; the percent reads 100 only at the end", () => {
    expect(liveDay(input(), START)!.progress).toBe(0);
    const late = liveDay(input(), START + 4 * DAY)!;
    expect(late.progress).toBe(1);
    expect(late.left).toBe(0);
    expect(liveDayPercent(0.999)).toBe(99);
    expect(liveDayPercent(1)).toBe(100);
    expect(liveDayPercent(-0.2)).toBe(0);
  });
});
