import { describe, expect, test } from "vitest";
import {
  ADMIN_AMBIENT_FPS,
  ADMIN_CEREMONY,
  ADMIN_DURATION,
  ADMIN_EDGE_FADE,
  ADMIN_GAME_MOTION,
  ADMIN_LAYER_MAX,
  ADMIN_MATERIAL,
  ADMIN_MOTION_MAX,
  ADMIN_REVEAL,
  ADMIN_SPARK,
  ADMIN_STAGE_MOTION,
  ADMIN_STAGGER_TOTAL,
} from "./motion";

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

// ADMIN v3 V5 (RV N6) — the durations that stood as literals in components are tokens, each inside its layer.
describe("the tokens V5 named", () => {
  test("the comet of gained XP is of the ceremony layer: it lands within 1.8 s, label included", () => {
    const flight = ADMIN_SPARK.toBoss + ADMIN_SPARK.toChip + ADMIN_SPARK.fade;
    expect(flight).toBeLessThanOrEqual(1);
    // The label appears as the comet lands and is gone before the layer's limit.
    expect(ADMIN_SPARK.toBoss + ADMIN_SPARK.toChip + ADMIN_SPARK.label).toBeLessThanOrEqual(ADMIN_LAYER_MAX.ceremonija);
    // What answers the strike and the arrival is short.
    expect(ADMIN_SPARK.strike).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    expect(ADMIN_SPARK.ring).toBeLessThanOrEqual(ADMIN_LAYER_MAX.reveal);
    // RV S8: a comet, not a dash. The head is 8–10 px, the tail 100–140 px.
    expect(ADMIN_SPARK.head).toBeGreaterThanOrEqual(8);
    expect(ADMIN_SPARK.head).toBeLessThanOrEqual(10);
    expect(ADMIN_SPARK.tail).toBeGreaterThanOrEqual(100);
    expect(ADMIN_SPARK.tail).toBeLessThanOrEqual(140);
  });

  test("the parts of a ceremony fit inside it", () => {
    const { big, words, medal, ring } = ADMIN_CEREMONY;
    expect(words.in).toBeLessThanOrEqual(big.in);
    expect(words.out).toBeLessThanOrEqual(big.out);
    expect(ring).toBeLessThanOrEqual(big.hold);
    expect(medal.from).toBeLessThan(1);
    expect(medal.over).toBeGreaterThan(1);
    expect(medal.over).toBeLessThanOrEqual(1.15);
  });

  test("the XP bar follows its number inside the interaction layer; the damage number floats off inside the reveal layer", () => {
    expect(ADMIN_GAME_MOTION.xpBar).toBeGreaterThanOrEqual(0.18);
    expect(ADMIN_GAME_MOTION.xpBar).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    expect(ADMIN_GAME_MOTION.damagePop).toBeLessThanOrEqual(ADMIN_LAYER_MAX.reveal);
  });

  test("the stage: the canvas fades in as a `media` node; a scene that ignites starts while the scan line is still on the screen", () => {
    expect(ADMIN_STAGE_MOTION.fade).toBe(ADMIN_REVEAL.media);
    expect(ADMIN_STAGE_MOTION.igniteAfter).toBeLessThan(ADMIN_REVEAL.scan);
    expect(ADMIN_STAGE_MOTION.igniteAfter).toBeLessThan(ADMIN_STAGE_MOTION.startAfter);
    // The 2D picture never waits as a shade for long, and never as nothing.
    expect(ADMIN_STAGE_MOTION.igniteDeadline).toBeLessThanOrEqual(3);
    expect(ADMIN_STAGE_MOTION.shade).toBeGreaterThan(0);
    expect(ADMIN_STAGE_MOTION.shade).toBeLessThanOrEqual(0.2);
  });

  test("the fuse of the reveal: what waits below the fold is let go long after the entrance, never by it", () => {
    expect(ADMIN_REVEAL.fuse).toBeGreaterThan(ADMIN_REVEAL.budget * 10);
    expect(ADMIN_REVEAL.fuse).toBeLessThanOrEqual(60);
    expect(ADMIN_EDGE_FADE).toBe(0.6);
  });
});
