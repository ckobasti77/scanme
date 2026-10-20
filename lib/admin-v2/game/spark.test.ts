import { describe, expect, test } from "vitest";
import { ADMIN_LAYER_MAX, ADMIN_SPARK } from "@/lib/admin-v2/motion";
import { approachAngle, barImpact, curveControl, curveHeading, curvePoint, inView, labelPlace, sparkSeconds, tailLength } from "./spark";

describe("sparkSeconds", () => {
  test("the whole flight, with what the landing leaves behind, stays inside the ceremony layer", () => {
    for (const viaBoss of [true, false]) {
      const time = sparkSeconds(viaBoss);
      expect(time.total).toBeLessThanOrEqual(ADMIN_LAYER_MAX.ceremonija);
      expect(time.landing).toBeLessThan(time.total);
    }
  });
  test("through the boss it has a first leg, and it lands after both legs", () => {
    expect(sparkSeconds(true)).toEqual({ toBoss: ADMIN_SPARK.toBoss, toChip: ADMIN_SPARK.toChip, landing: ADMIN_SPARK.toBoss + ADMIN_SPARK.toChip, total: 1.75 });
    expect(sparkSeconds(false).toBoss).toBe(0);
    expect(sparkSeconds(false).landing).toBe(ADMIN_SPARK.toChip);
    // The first leg is inside the interaction layer.
    expect(ADMIN_SPARK.toBoss).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    // The strike on the bar and the ring around the chip are inside the same flight.
    expect(ADMIN_SPARK.strike).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    expect(ADMIN_SPARK.ring).toBeLessThanOrEqual(ADMIN_SPARK.label);
  });
});

describe("the shape of the comet", () => {
  test("the head is 8–10 px and the tail 100–140 px", () => {
    expect(ADMIN_SPARK.head).toBeGreaterThanOrEqual(8);
    expect(ADMIN_SPARK.head).toBeLessThanOrEqual(10);
    expect(ADMIN_SPARK.tail).toBeGreaterThanOrEqual(100);
    expect(ADMIN_SPARK.tail).toBeLessThanOrEqual(140);
  });
  test("the tail is at least 80 px on a flight of a normal length, and shorter only on a short one", () => {
    expect(tailLength(600)).toBe(ADMIN_SPARK.tail);
    expect(tailLength(140)).toBeGreaterThanOrEqual(80);
    expect(tailLength(72)).toBeLessThan(80);
    expect(tailLength(72)).toBeGreaterThanOrEqual(ADMIN_SPARK.head * 3);
    expect(tailLength(0)).toBe(ADMIN_SPARK.head * 3);
  });
});

describe("inView", () => {
  const screen = { left: 280, right: 1024, top: 56, bottom: 800 };
  test("a box that is at least partly on the screen of the frame is in view; one scrolled out above, below or aside is not", () => {
    expect(inView({ left: 400, right: 800, top: 300, bottom: 306 }, screen)).toBe(true);
    expect(inView({ left: 400, right: 800, top: 52, bottom: 58 }, screen)).toBe(true);
    expect(inView({ left: 400, right: 800, top: 20, bottom: 26 }, screen)).toBe(false);
    expect(inView({ left: 400, right: 800, top: -60, bottom: -54 }, screen)).toBe(false);
    expect(inView({ left: 400, right: 800, top: 820, bottom: 826 }, screen)).toBe(false);
    expect(inView({ left: 1100, right: 1500, top: 300, bottom: 306 }, screen)).toBe(false);
  });
});

describe("barImpact", () => {
  const bar = { left: 1000, right: 1400, top: 300, bottom: 306 };
  test("it strikes at the end of what is left of the boss, in the middle of the bar's height", () => {
    expect(barImpact(bar, 17, 20)).toEqual({ x: 1340, y: 303 });
    expect(barImpact(bar, 10, 20).x).toBe(1200);
  });
  test("never outside the bar, and a bar with no number is hit in the middle", () => {
    expect(barImpact(bar, 0, 20).x).toBe(1006);
    expect(barImpact(bar, 20, 20).x).toBe(1394);
    expect(barImpact(bar, 99, 20).x).toBe(1394);
    expect(barImpact(bar, Number.NaN, 20).x).toBe(1200);
    expect(barImpact(bar, 5, 0).x).toBe(1200);
  });
});

describe("the curve", () => {
  const from = { x: 100, y: 500 };
  const to = { x: 700, y: 100 };
  const control = curveControl(from, to);

  test("it starts at the start and ends at the end", () => {
    expect(curvePoint(from, control, to, 0)).toEqual(from);
    expect(curvePoint(from, control, to, 1)).toEqual(to);
  });
  test("it is an arc, not the straight line, and the bend is modest", () => {
    const middle = curvePoint(from, control, to, 0.5);
    const line = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const sideways = Math.hypot(middle.x - line.x, middle.y - line.y);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    expect(sideways).toBeGreaterThan(0);
    expect(sideways).toBeLessThan(length * 0.12);
  });
  test("the heading follows the path: along it at the start and at the end, turning in between", () => {
    const straight = { x: 0, y: 0 };
    const right = { x: 300, y: 0 };
    const flat = curveControl(straight, right, 0);
    expect(curveHeading(straight, flat, right, 0)).toBeCloseTo(0, 6);
    expect(curveHeading(straight, flat, right, 1)).toBeCloseTo(0, 6);
    const start = curveHeading(from, control, to, 0);
    const end = curveHeading(from, control, to, 1);
    const chord = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    expect(Math.abs(start - chord)).toBeGreaterThan(1);
    expect(Math.abs(start - chord)).toBeLessThan(15);
    expect(Math.abs(end - chord)).toBeGreaterThan(1);
    // Stepping a hair along the curve points the same way as the heading says.
    for (const t of [0.1, 0.5, 0.9]) {
      const a = curvePoint(from, control, to, t);
      const b = curvePoint(from, control, to, t + 0.001);
      const step = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      expect(curveHeading(from, control, to, t + 0.0005)).toBeCloseTo(step, 1);
    }
  });
  test("a leg of no length does not produce NaN", () => {
    const point = { x: 10, y: 10 };
    const still = curveControl(point, point);
    expect(curvePoint(point, still, point, 0.5)).toEqual(point);
    expect(Number.isFinite(curveHeading(point, still, point, 0.5))).toBe(true);
  });
});

describe("approachAngle", () => {
  test("it goes the short way round and stops at the target", () => {
    expect(approachAngle(0, 90, 0.5)).toBeCloseTo(45, 6);
    expect(approachAngle(170, -170, 0.5)).toBeCloseTo(180, 6);
    expect(approachAngle(-170, 170, 0.5)).toBeCloseTo(-180, 6);
    expect(approachAngle(30, 30, 0.4)).toBe(30);
    expect(approachAngle(10, 100, 1)).toBeCloseTo(100, 6);
    expect(approachAngle(10, 100, 0)).toBe(10);
  });
});

describe("labelPlace", () => {
  const navbar = { left: 300, right: 1440, top: 0, bottom: 56 };
  const label = { width: 64, height: 22 };

  test("beside the chip, centred on it, on its left, inside the navbar", () => {
    const chip = { left: 1304, right: 1332, top: 14, bottom: 42 };
    const place = labelPlace(chip, label, navbar, 1440);
    expect(place.side).toBe("left");
    expect(place.left + label.width).toBeLessThanOrEqual(chip.left);
    expect(place.top + label.height / 2).toBeCloseTo(28, 6);
    expect(place.top).toBeGreaterThanOrEqual(navbar.top);
    expect(place.top + label.height).toBeLessThanOrEqual(navbar.bottom);
  });
  test("with the ring around the profile icon at 1024 px it is still inside the viewport", () => {
    const ring = { left: 972, right: 1008, top: 10, bottom: 46 };
    const place = labelPlace(ring, label, { left: 0, right: 1024, top: 0, bottom: 56 }, 1024);
    expect(place.left).toBeGreaterThanOrEqual(0);
    expect(place.left + label.width).toBeLessThanOrEqual(1024);
    expect(place.left + label.width).toBeLessThanOrEqual(ring.left);
  });
  test("a chip near the left edge sends it to the right side", () => {
    const place = labelPlace({ left: 20, right: 48, top: 14, bottom: 42 }, label, navbar, 800);
    expect(place.side).toBe("right");
    expect(place.left).toBeGreaterThanOrEqual(48);
    expect(place.left + label.width).toBeLessThanOrEqual(800);
  });
  test("it never leaves the navbar vertically, whatever the chip says", () => {
    const low = labelPlace({ left: 1304, right: 1332, top: 60, bottom: 88 }, label, navbar, 1440);
    expect(low.top + label.height).toBeLessThanOrEqual(navbar.bottom);
    const high = labelPlace({ left: 1304, right: 1332, top: -20, bottom: 8 }, label, navbar, 1440);
    expect(high.top).toBeGreaterThanOrEqual(navbar.top);
  });
  test("a viewport narrower than the pill still gives a position inside the margin", () => {
    const place = labelPlace({ left: 10, right: 30, top: 14, bottom: 42 }, { width: 100, height: 22 }, null, 90);
    expect(place.left).toBeGreaterThanOrEqual(8);
  });
});
