import { describe, expect, test } from "vitest";
import { ADMIN_DURATION, ADMIN_MOTION_MAX, ADMIN_STAGGER_TOTAL } from "./motion";

// ADMIN v2 X6 (RX N5) — the limits of ZADATAK §1 and §7 as numbers: a
// transition lasts at most 250 ms, a change of the frame at most 320 ms, and
// a staggered group (the sidebar content, the digits of a rolling number) ends
// within the same 250 ms: its elements move in `state` and the whole stagger
// is added to that.

describe("the motion tokens", () => {
  test("the four durations are 120, 180, 240 and 320 ms; exits (state) are shorter than entries (move)", () => {
    expect(ADMIN_DURATION).toEqual({ feedback: 0.12, state: 0.18, move: 0.24, frame: 0.32 });
    expect(ADMIN_DURATION.state).toBeLessThan(ADMIN_DURATION.move);
  });

  test("a transition inside the frame lasts at most 250 ms, also with its stagger", () => {
    expect(ADMIN_DURATION.move).toBeLessThanOrEqual(0.25);
    expect(ADMIN_DURATION.state + ADMIN_STAGGER_TOTAL).toBeCloseTo(0.25, 10);
    // ZADATAK §7: the whole stagger is at most 120 ms.
    expect(ADMIN_STAGGER_TOTAL).toBeLessThanOrEqual(0.12);
  });

  test("nothing is longer than the change of the frame", () => {
    for (const value of Object.values(ADMIN_DURATION)) expect(value).toBeLessThanOrEqual(ADMIN_DURATION.frame);
    expect(ADMIN_DURATION.frame).toBeLessThanOrEqual(ADMIN_MOTION_MAX);
  });
});
