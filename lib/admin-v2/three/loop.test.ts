import { describe, expect, test } from "vitest";
import { FRAME_SLACK_MS, loopActive, shouldRender, type LoopState } from "./loop";

const live: LoopState = { visible: true, inView: true, paused: false, dirty: false, ambient: true };
const state = (patch: Partial<LoopState>): LoopState => ({ ...live, ...patch });

/** Draws counted over `seconds` of rAF at `hz`; a drawn frame is what `shouldRender` allows. */
function drawsOver(seconds: number, hz: number, patch: Partial<LoopState> = {}, fps = 30): number {
  const step = 1000 / hz;
  let lastFrameAt = 0;
  let draws = 0;
  for (let now = 1000; now < 1000 + seconds * 1000; now += step) {
    if (shouldRender({ ...state(patch), lastFrameAt, now, fps })) {
      draws += 1;
      lastFrameAt = now;
    }
  }
  return draws;
}

describe("loopActive", () => {
  test("a visible, on-screen, running ambient scene is active", () => {
    expect(loopActive(live)).toBe(true);
  });

  test("a hidden tab, an off-screen host or a paused scene is not", () => {
    expect(loopActive(state({ visible: false }))).toBe(false);
    expect(loopActive(state({ inView: false }))).toBe(false);
    expect(loopActive(state({ paused: true }))).toBe(false);
  });

  test("a dirty scene is active without an ambient loop", () => {
    expect(loopActive(state({ ambient: false, dirty: true }))).toBe(true);
  });

  test("neither dirty nor ambient is not active", () => {
    expect(loopActive(state({ ambient: false, dirty: false }))).toBe(false);
  });
});

describe("shouldRender", () => {
  const base = { lastFrameAt: 1000, now: 1001, fps: 30 };

  test("a hidden tab does not draw, even when dirty", () => {
    expect(shouldRender({ ...state({ visible: false, dirty: true }), ...base })).toBe(false);
    expect(drawsOver(2, 60, { visible: false })).toBe(0);
  });

  test("an off-screen host does not draw", () => {
    expect(shouldRender({ ...state({ inView: false, dirty: true }), ...base })).toBe(false);
    expect(drawsOver(2, 60, { inView: false })).toBe(0);
  });

  test("a paused scene does not draw", () => {
    expect(shouldRender({ ...state({ paused: true, dirty: true }), ...base })).toBe(false);
    expect(drawsOver(2, 60, { paused: true })).toBe(0);
  });

  test("a dirty scene draws at once, even 1 ms after the last frame", () => {
    expect(shouldRender({ ...state({ dirty: true }), ...base })).toBe(true);
    expect(shouldRender({ ...state({ dirty: true, ambient: false }), ...base })).toBe(true);
  });

  test("an ambient-only scene waits for the frame gap", () => {
    expect(shouldRender({ ...state({}), ...base })).toBe(false);
    expect(shouldRender({ ...state({}), lastFrameAt: 1000, now: 1000 + 1000 / 30 - FRAME_SLACK_MS + 0.01, fps: 30 })).toBe(true);
  });

  test("a scene that was never drawn draws", () => {
    expect(shouldRender({ ...state({}), lastFrameAt: 0, now: 5, fps: 30 })).toBe(true);
  });

  test("ambient at 60 Hz draws every other frame: about 30 a second", () => {
    const draws = drawsOver(2, 60);
    expect(draws).toBeGreaterThanOrEqual(58);
    expect(draws).toBeLessThanOrEqual(62);
  });

  test("ambient at 120 Hz and at 144 Hz still draws at most about 30 a second", () => {
    expect(drawsOver(2, 120)).toBeLessThanOrEqual(62);
    expect(drawsOver(2, 120)).toBeGreaterThanOrEqual(58);
    expect(drawsOver(2, 144)).toBeLessThanOrEqual(62);
  });

  test("nothing to draw draws nothing", () => {
    expect(drawsOver(2, 60, { ambient: false, dirty: false })).toBe(0);
  });
});
