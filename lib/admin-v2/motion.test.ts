import { describe, expect, test } from "vitest";
import { ADMIN_AMBIENT_FPS, ADMIN_CEREMONY, ADMIN_DURATION, ADMIN_LAYER_MAX, ADMIN_MATERIAL, ADMIN_MOTION_MAX, ADMIN_REVEAL, ADMIN_STAGGER_TOTAL } from "./motion";

// ADMIN v2 X6 (RX N5) — the limits of ZADATAK §1 and §7 as numbers: a
// transition lasts at most 250 ms, a change of the frame at most 320 ms, and
// a staggered group (the sidebar content, the digits of a rolling number) ends
// within the same 250 ms: its elements move in `state` and the whole stagger
// is added to that.
// ADMIN v3 V1 — these limits now bound the interaction layer only; the reveal
// and the ceremony layers have their own (ZADATAK-V3 §2).

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

  test("nothing in the interaction layer is longer than the change of the frame", () => {
    for (const value of Object.values(ADMIN_DURATION)) expect(value).toBeLessThanOrEqual(ADMIN_DURATION.frame);
    expect(ADMIN_DURATION.frame).toBeLessThanOrEqual(ADMIN_MOTION_MAX);
  });
});

describe("the three layers of v3", () => {
  test("interaction: press, state and movement stay within 250 ms (the drawer of the frame is the written exception)", () => {
    expect(ADMIN_LAYER_MAX).toEqual({ interakcija: 0.25, reveal: 0.9, ceremonija: 1.8 });
    for (const key of ["feedback", "state", "move"] as const) expect(ADMIN_DURATION[key]).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    expect(ADMIN_DURATION.frame).toBeGreaterThan(ADMIN_LAYER_MAX.interakcija);
    // The material answers the pointer: it belongs to the interaction layer.
    for (const value of [ADMIN_MATERIAL.magnetIn, ADMIN_MATERIAL.magnetOut, ADMIN_MATERIAL.tilt, ADMIN_MATERIAL.glow]) expect(value).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    expect(ADMIN_MATERIAL.magnetMax).toBeLessThanOrEqual(6);
    expect(ADMIN_MATERIAL.tiltMax).toBeLessThanOrEqual(3);
  });

  test("reveal: the budget of a page is 900 ms, the old page leaves within 160 ms, a return is shorter", () => {
    expect(ADMIN_REVEAL.budget).toBe(ADMIN_LAYER_MAX.reveal);
    expect(ADMIN_REVEAL.exit).toBeLessThanOrEqual(0.16);
    expect(ADMIN_REVEAL.short).toBeLessThan(ADMIN_REVEAL.budget);
    expect(ADMIN_REVEAL.scroll).toBeLessThanOrEqual(ADMIN_REVEAL.budget);
    // The latest possible start leaves every kind of node room to finish inside the budget.
    const latest = ADMIN_REVEAL.sweepY + ADMIN_REVEAL.sweepX;
    expect(latest).toBeCloseTo(0.58, 10);
    expect(ADMIN_REVEAL.budget - latest).toBeGreaterThanOrEqual(0.32);
    // The scanner line is gone before the budget ends.
    expect(ADMIN_REVEAL.scan + ADMIN_REVEAL.scanFade).toBeLessThanOrEqual(ADMIN_REVEAL.budget);
    expect(ADMIN_REVEAL.phone.scale * ADMIN_REVEAL.budget).toBeCloseTo(0.675, 10);
  });

  test("ceremony: a big one lasts at most 1800 ms, two in a row at most 3.7 s", () => {
    const total = (part: { in: number; hold: number; out: number }) => part.in + part.hold + part.out;
    expect(total(ADMIN_CEREMONY.big)).toBeLessThanOrEqual(ADMIN_LAYER_MAX.ceremonija);
    expect(total(ADMIN_CEREMONY.compact)).toBeLessThan(total(ADMIN_CEREMONY.big));
    expect(ADMIN_CEREMONY.maxInRow).toBe(2);
    expect(2 * total(ADMIN_CEREMONY.big) + ADMIN_CEREMONY.gap).toBeLessThanOrEqual(3.7);
  });

  test("ambient loops draw at most 30 times a second", () => {
    expect(ADMIN_AMBIENT_FPS).toBe(30);
  });
});
