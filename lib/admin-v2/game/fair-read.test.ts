import { describe, expect, test } from "vitest";
import { fairEnded, fairReadKey } from "./fair-read";

// ADMIN v3 V5 — the decision of the hourly read of Pregled, and the end of a fair by its day keys.

describe("fairReadKey", () => {
  test("a closed day reads nothing, on screen or off", () => {
    expect(fairReadKey({ eventId: "event-test", dayOpen: false, inView: true })).toBeNull();
    expect(fairReadKey({ eventId: "event-test", dayOpen: false, inView: false })).toBeNull();
  });

  test("an open day reads nothing while the block is off the screen", () => {
    expect(fairReadKey({ eventId: "event-test", dayOpen: true, inView: false })).toBeNull();
  });

  test("an open day with the block on the screen reads, under a key of its event", () => {
    expect(fairReadKey({ eventId: "event-test", dayOpen: true, inView: true })).toBe("hall:event-test");
    expect(fairReadKey({ eventId: "event-other", dayOpen: true, inView: true })).not.toBe(fairReadKey({ eventId: "event-test", dayOpen: true, inView: true }));
  });

  // The decision takes no floor plan: an event without one reads the same hours for its challenges.
});

describe("fairEnded", () => {
  const days = ["2026-10-09", "2026-10-10", "2026-10-11"];

  test("before and during the fair it has not ended, also on its last day", () => {
    expect(fairEnded(days, "2026-10-08")).toBe(false);
    expect(fairEnded(days, "2026-10-10")).toBe(false);
    expect(fairEnded(days, "2026-10-11")).toBe(false);
  });

  test("the day after the last fair day it has ended, whatever the order of the keys", () => {
    expect(fairEnded(days, "2026-10-12")).toBe(true);
    expect(fairEnded([...days].reverse(), "2026-10-12")).toBe(true);
  });

  test("an event without days has not ended", () => {
    expect(fairEnded([], "2030-01-01")).toBe(false);
  });
});
