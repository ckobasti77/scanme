import { describe, expect, test } from "vitest";
import {
  FAIR_GARAGE_ROTATION_INTERVAL_MS,
  FAIR_MAP_ROTATION_INTERVAL_MS,
  getFairRotationItem,
  getFairRotationSlot,
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
});
