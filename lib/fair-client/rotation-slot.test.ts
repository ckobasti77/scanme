import { describe, expect, test } from "vitest";
import {
  FAIR_GARAGE_ROTATION_INTERVAL_MS,
  FAIR_MAP_ROTATION_INTERVAL_MS,
  advanceSponsoredTimeline,
  createSponsoredTimeline,
  getFairRotationItem,
  getFairRotationSlot,
  getSponsoredTimelineTiming,
  pauseSponsoredTimeline,
  resumeSponsoredTimeline,
  swipeSponsoredTimeline,
} from "./rotation-slot";

describe("fair rotation slot", () => {
  test("uses the locked map and garage intervals", () => {
    expect(FAIR_MAP_ROTATION_INTERVAL_MS).toBe(12_000);
    expect(FAIR_GARAGE_ROTATION_INTERVAL_MS).toBe(8_000);
  });

  test("two clients with the same epoch and time select the same item", () => {
    const input = {
      epochMs: 1_000,
      nowMs: 38_000,
      intervalMs: FAIR_MAP_ROTATION_INTERVAL_MS,
      itemCount: 4,
    };

    expect(getFairRotationSlot(input)).toEqual(getFairRotationSlot(input));
    expect(getFairRotationSlot(input)?.index).toBe(3);
  });

  test("round-robin wraps without favoring an item", () => {
    const indexes = Array.from({ length: 8 }, (_, slotNumber) =>
      getFairRotationSlot({
        epochMs: 0,
        nowMs: slotNumber * FAIR_GARAGE_ROTATION_INTERVAL_MS,
        intervalMs: FAIR_GARAGE_ROTATION_INTERVAL_MS,
        itemCount: 3,
      })?.index,
    );

    expect(indexes).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
  });

  test("reports stable slot boundaries and progress", () => {
    expect(
      getFairRotationSlot({
        epochMs: 10_000,
        nowMs: 15_000,
        intervalMs: 8_000,
        itemCount: 2,
      }),
    ).toEqual({
      index: 0,
      slotNumber: 0,
      slotStartedAt: 10_000,
      nextSlotAt: 18_000,
      progress: 0.625,
    });
  });

  test("a clock before the published epoch stays on the first item", () => {
    expect(
      getFairRotationSlot({
        epochMs: 10_000,
        nowMs: 5_000,
        intervalMs: 8_000,
        itemCount: 2,
      }),
    ).toEqual({
      index: 0,
      slotNumber: 0,
      slotStartedAt: 10_000,
      nextSlotAt: 18_000,
      progress: 0,
    });
  });

  test("invalid or empty rotations return null", () => {
    expect(
      getFairRotationSlot({ epochMs: 0, nowMs: 0, intervalMs: 0, itemCount: 2 }),
    ).toBeNull();
    expect(
      getFairRotationSlot({ epochMs: 0, nowMs: 0, intervalMs: 8_000, itemCount: 0 }),
    ).toBeNull();
    expect(
      getFairRotationItem([], { epochMs: 0, nowMs: 0, intervalMs: 8_000 }),
    ).toBeNull();
  });

  test("returns the active item together with its timing metadata", () => {
    expect(
      getFairRotationItem(["a", "b", "c"], {
        epochMs: 0,
        nowMs: 17_000,
        intervalMs: 8_000,
      }),
    ).toEqual({
      item: "c",
      slot: {
        index: 2,
        slotNumber: 2,
        slotStartedAt: 16_000,
        nextSlotAt: 24_000,
        progress: 0.125,
      },
    });
  });

  test("sponsored timeline: swipe at half starts a full interval and restarts the bar at 0", () => {
    const intervalMs = FAIR_MAP_ROTATION_INTERVAL_MS; // 12_000
    const initial = createSponsoredTimeline({
      epochMs: 0,
      nowMs: 30_000, // slot 2 (model index 2), 6_000 ms into the 12_000 ms slot (halfway)
      intervalMs,
      itemCount: 6,
    });
    expect(initial).not.toBeNull();
    expect(initial?.index).toBe(2);
    expect(initial?.barStartProgress).toBe(0.5);
    expect(initial?.durationMs).toBe(6_000);

    const swiped = swipeSponsoredTimeline(initial, {
      nextIndex: 3,
      nowMs: 30_000,
      intervalMs,
      itemCount: 6,
    });
    expect(swiped).not.toBeNull();
    const timing = getSponsoredTimelineTiming(swiped!);
    expect(swiped?.mode).toBe("local");
    expect(timing.index).toBe(3);
    expect(timing.barStartProgress).toBe(0);
    expect(timing.barDurationMs).toBe(intervalMs);
    expect(timing.barEndAtMs).toBe(30_000 + intervalMs);
    expect(timing.switchAtMs).toBe(30_000 + intervalMs);
  });

  test("sponsored timeline: after swiping 3 -> 4, the end goes to 5 (never back to 3) and continues in order", () => {
    const intervalMs = FAIR_MAP_ROTATION_INTERVAL_MS;
    const itemCount = 6;
    // Start on slot 1 (index 1) on shared clock, swipe to index 3, then swipe 3 -> 4 at half.
    const initial = createSponsoredTimeline({
      epochMs: 0,
      nowMs: 14_000,
      intervalMs,
      itemCount,
    });
    const onThree = swipeSponsoredTimeline(initial, {
      nextIndex: 3,
      nowMs: 15_000,
      intervalMs,
      itemCount,
    });
    const onFour = swipeSponsoredTimeline(onThree, {
      nextIndex: 4,
      nowMs: 21_000, // halfway through model 3's local slot
      intervalMs,
      itemCount,
    });
    expect(onFour?.index).toBe(4);
    expect(onFour?.barStartProgress).toBe(0);
    expect(onFour?.durationMs).toBe(intervalMs);

    // When model 4's timer ends at 21_000 + 12_000 = 33_000 (where the shared clock would be on slot 2 -> index 2 or 3):
    const afterFour = advanceSponsoredTimeline(onFour!, {
      nowMs: onFour!.switchAtMs,
      epochMs: 0,
      itemCount,
    });
    expect(afterFour.index).toBe(5);
    expect(afterFour.barStartProgress).toBe(0);
    expect(afterFour.durationMs).toBe(intervalMs);

    // And the next advance wraps cleanly 5 -> 0:
    const afterFive = advanceSponsoredTimeline(afterFour, {
      nowMs: afterFour.switchAtMs,
      epochMs: 0,
      itemCount,
    });
    expect(afterFive.index).toBe(0);
  });

  test("sponsored timeline: bar end time always equals switch time (including after pause and resume)", () => {
    const intervalMs = 12_000;
    const initial = createSponsoredTimeline({
      epochMs: 0,
      nowMs: 3_000,
      intervalMs,
      itemCount: 5,
    })!;
    const initialTiming = getSponsoredTimelineTiming(initial);
    expect(initialTiming.barEndAtMs).toBe(initialTiming.switchAtMs);

    const swiped = swipeSponsoredTimeline(initial, {
      nextIndex: 2,
      nowMs: 5_000,
      intervalMs,
      itemCount: 5,
    })!;
    const swipedTiming = getSponsoredTimelineTiming(swiped);
    expect(swipedTiming.barEndAtMs).toBe(swipedTiming.switchAtMs);
    expect(swipedTiming.barEndAtMs).toBe(17_000);

    // Pause 3_000 ms into the 12_000 ms slot (progress = 0.25, remaining = 9_000 ms), then resume 4_000 ms later at 12_000:
    const paused = pauseSponsoredTimeline(swiped, 8_000);
    expect(paused.paused).toEqual({ progress: 0.25, remainingMs: 9_000 });
    const resumed = resumeSponsoredTimeline(paused, 12_000);
    const resumedTiming = getSponsoredTimelineTiming(resumed);
    expect(resumedTiming.barStartProgress).toBe(0.25);
    expect(resumedTiming.barDurationMs).toBe(9_000);
    expect(resumedTiming.barEndAtMs).toBe(resumedTiming.switchAtMs);
    expect(resumedTiming.barEndAtMs).toBe(21_000);
  });
});
