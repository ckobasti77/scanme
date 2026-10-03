import { describe, expect, test } from "vitest";
import { belgradeDateKey, belgradeDayBounds, taskDueFacts } from "./task-time";

describe("ADMIN-10 Europe/Belgrade task time", () => {
  test("a date-only task is due throughout its local day and overdue afterwards", () => {
    const due = { kind: "date", date: "2026-09-12" } as const;
    expect(taskDueFacts(due, Date.parse("2026-09-11T21:59:59.999Z")).phase).toBe("future");
    expect(taskDueFacts(due, Date.parse("2026-09-11T22:00:00.000Z")).phase).toBe("today");
    expect(taskDueFacts(due, Date.parse("2026-09-12T21:59:59.999Z")).phase).toBe("today");
    expect(taskDueFacts(due, Date.parse("2026-09-12T22:00:00.000Z")).phase).toBe("overdue");
  });

  test("an instant becomes overdue only after the exact instant", () => {
    const at = Date.parse("2026-09-12T10:30:00.000Z");
    const due = { kind: "instant", at } as const;
    expect(taskDueFacts(due, at).phase).toBe("today");
    expect(taskDueFacts(due, at + 1).phase).toBe("overdue");
  });

  test("Belgrade DST days retain their real 23-hour and 25-hour lengths", () => {
    const spring = belgradeDayBounds("2026-03-29");
    const autumn = belgradeDayBounds("2026-10-25");
    expect(spring.end - spring.start).toBe(23 * 60 * 60 * 1_000);
    expect(autumn.end - autumn.start).toBe(25 * 60 * 60 * 1_000);
    expect(belgradeDateKey(spring.start)).toBe("2026-03-29");
    expect(belgradeDateKey(autumn.end - 1)).toBe("2026-10-25");
  });
});
