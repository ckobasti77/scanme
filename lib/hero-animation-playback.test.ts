import { describe, expect, it } from "vitest";
import {
  getHeroCarouselCycleAction,
  isHeroAnimationVisible,
  shouldPlayHeroAnimation,
} from "./hero-animation-playback";

describe("shouldPlayHeroAnimation", () => {
  it("plays only while the active hero is visible and unobstructed", () => {
    expect(
      shouldPlayHeroAnimation({
        active: true,
        visible: true,
        paused: false,
        documentHidden: false,
      }),
    ).toBe(true);
  });

  it.each([
    ["inactive", { active: false }],
    ["outside the viewport", { visible: false }],
    ["paused by selector interaction", { paused: true }],
    ["inside a hidden tab", { documentHidden: true }],
  ])("stays paused when %s", (_reason, override) => {
    expect(
      shouldPlayHeroAnimation({
        active: true,
        visible: true,
        paused: false,
        documentHidden: false,
        ...override,
      }),
    ).toBe(false);
  });
});

describe("isHeroAnimationVisible", () => {
  const viewport = { width: 1000, height: 800 };

  it("starts immediately when the newly mounted player is already visible", () => {
    expect(
      isHeroAnimationVisible(
        { top: 100, right: 700, bottom: 700, left: 100, width: 600, height: 600 },
        viewport.width,
        viewport.height,
      ),
    ).toBe(true);
  });

  it("uses the same twelve-percent visibility boundary as the observer", () => {
    const box = { top: 0, right: 1000, bottom: 1000, left: 0, width: 1000, height: 1000 };

    expect(isHeroAnimationVisible(box, 1000, 119)).toBe(false);
    expect(isHeroAnimationVisible(box, 1000, 120)).toBe(true);
  });

  it("stays paused while the player is outside the viewport", () => {
    expect(
      isHeroAnimationVisible(
        { top: 900, right: 600, bottom: 1500, left: 0, width: 600, height: 600 },
        viewport.width,
        viewport.height,
      ),
    ).toBe(false);
  });
});

describe("getHeroCarouselCycleAction", () => {
  it("repeats once before switching after the second completed cycle", () => {
    expect(
      getHeroCarouselCycleAction({ autoplayEnabled: true, completedCycles: 0 }),
    ).toEqual({ action: "repeat", completedCycles: 1 });
    expect(
      getHeroCarouselCycleAction({ autoplayEnabled: true, completedCycles: 1 }),
    ).toEqual({ action: "switch", completedCycles: 0 });
  });

  it("keeps repeating the selected service after manual interaction", () => {
    expect(
      getHeroCarouselCycleAction({ autoplayEnabled: false, completedCycles: 1 }),
    ).toEqual({ action: "repeat", completedCycles: 0 });
  });
});
