// ScanMe Menu V1 (K23) — the venue's timing of the waiter panel: the late
// threshold, the reminder interval, and how a late state is emphasised.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_LATE_THRESHOLD_MIN,
  DEFAULT_PANEL_TIMING,
  DEFAULT_REMINDER_MIN,
  isValidLateThreshold,
  isValidReminder,
  jeKasno,
  panelTimingOf,
  puls,
} from "./thresholds";

const MINUTE = 60 * 1000;

describe("DEFAULT_PANEL_TIMING", () => {
  test("is 15 minutes late threshold and a 5 minute reminder", () => {
    expect(DEFAULT_PANEL_TIMING).toEqual({ lateThresholdMin: 15, reminderMin: 5 });
    expect(DEFAULT_LATE_THRESHOLD_MIN).toBe(15);
    expect(DEFAULT_REMINDER_MIN).toBe(5);
  });
});

describe("isValidLateThreshold", () => {
  test("accepts whole minutes 1 to 120", () => {
    for (const minutes of [1, 2, 15, 60, 119, 120]) expect(isValidLateThreshold(minutes)).toBe(true);
  });

  test("refuses 0, 121, fractions, NaN, infinity and negatives", () => {
    for (const minutes of [0, 121, 1.5, 14.99, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(isValidLateThreshold(minutes)).toBe(false);
    }
  });
});

describe("isValidReminder", () => {
  test("accepts 0 (off) and whole minutes up to 60", () => {
    for (const minutes of [0, 1, 5, 30, 59, 60]) expect(isValidReminder(minutes)).toBe(true);
  });

  test("refuses 61, negatives, fractions and NaN", () => {
    for (const minutes of [61, -1, 2.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidReminder(minutes)).toBe(false);
    }
  });
});

describe("panelTimingOf", () => {
  test("nothing stored gives the defaults", () => {
    expect(panelTimingOf(undefined)).toEqual({ lateThresholdMin: 15, reminderMin: 5 });
    expect(panelTimingOf(null)).toEqual({ lateThresholdMin: 15, reminderMin: 5 });
    expect(panelTimingOf({})).toEqual({ lateThresholdMin: 15, reminderMin: 5 });
  });

  test("valid stored values are kept", () => {
    expect(panelTimingOf({ lateThresholdMin: 30, reminderMin: 10 })).toEqual({ lateThresholdMin: 30, reminderMin: 10 });
    expect(panelTimingOf({ lateThresholdMin: 120, reminderMin: 60 })).toEqual({ lateThresholdMin: 120, reminderMin: 60 });
  });

  test("an invalid late threshold falls back alone, the valid reminder stays", () => {
    expect(panelTimingOf({ lateThresholdMin: 0, reminderMin: 10 })).toEqual({ lateThresholdMin: 15, reminderMin: 10 });
    expect(panelTimingOf({ lateThresholdMin: 121, reminderMin: 10 })).toEqual({ lateThresholdMin: 15, reminderMin: 10 });
  });

  test("an invalid reminder falls back alone, the valid late threshold stays", () => {
    expect(panelTimingOf({ lateThresholdMin: 30, reminderMin: 61 })).toEqual({ lateThresholdMin: 30, reminderMin: 5 });
    expect(panelTimingOf({ lateThresholdMin: 30, reminderMin: 2.5 })).toEqual({ lateThresholdMin: 30, reminderMin: 5 });
  });

  test("a missing field falls back while the stored one stays", () => {
    expect(panelTimingOf({ lateThresholdMin: 20 })).toEqual({ lateThresholdMin: 20, reminderMin: 5 });
    expect(panelTimingOf({ reminderMin: 8 })).toEqual({ lateThresholdMin: 15, reminderMin: 8 });
  });

  test("a reminder of 0 (off) is kept as 0, not replaced by the default", () => {
    expect(panelTimingOf({ lateThresholdMin: 30, reminderMin: 0 })).toEqual({ lateThresholdMin: 30, reminderMin: 0 });
    expect(panelTimingOf({ reminderMin: 0 })).toEqual({ lateThresholdMin: 15, reminderMin: 0 });
  });
});

describe("jeKasno", () => {
  const createdAt = 1_000_000;

  test("is late exactly at the threshold", () => {
    expect(jeKasno(createdAt, createdAt + 15 * MINUTE, 15)).toBe(true);
  });

  test("is not late 1 ms before the threshold", () => {
    expect(jeKasno(createdAt, createdAt + 15 * MINUTE - 1, 15)).toBe(false);
  });

  test("is late after the threshold", () => {
    expect(jeKasno(createdAt, createdAt + 15 * MINUTE + 1, 15)).toBe(true);
  });

  test("uses the venue's own threshold", () => {
    expect(jeKasno(createdAt, createdAt + 5 * MINUTE - 1, 5)).toBe(false);
    expect(jeKasno(createdAt, createdAt + 5 * MINUTE, 5)).toBe(true);
    // 5 minutes is not late for a 15 minute venue
    expect(jeKasno(createdAt, createdAt + 5 * MINUTE, 15)).toBe(false);
  });
});

describe("puls", () => {
  test("not late gives nothing, with or without reduced motion", () => {
    expect(puls(false, false)).toBe("nema");
    expect(puls(false, true)).toBe("nema");
  });

  test("late with motion allowed pulses", () => {
    expect(puls(true, false)).toBe("puls");
  });

  test("late with reduced motion is a static mark", () => {
    expect(puls(true, true)).toBe("staticno");
  });
});
