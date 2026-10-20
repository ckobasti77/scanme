import { expect, test } from "vitest";
import { demoHeatAt, demoHeatOrder, DEMO_HEAT_PULSE_MS, DEMO_HEAT_STAGGER_MS } from "./demo-heat";

const keys = Array.from({ length: 25 }, (_, i) => `stand-${i}`);

test("random order includes every stand exactly once without changing its input", () => {
  const order = demoHeatOrder(keys, () => .3);
  expect(order).not.toEqual(keys);
  expect([...order].sort()).toEqual([...keys].sort());
  expect(new Set(order).size).toBe(keys.length);
  expect(keys[0]).toBe("stand-0");
});

test("every stand receives the same slow peak, duration and total heat per loop", () => {
  const order = demoHeatOrder(keys, () => .6);
  const cycle = keys.length * DEMO_HEAT_STAGGER_MS;
  const totals = new Map(keys.map(key => [key, 0]));
  for (let time = 0; time < cycle; time += 100) {
    for (const [key, value] of demoHeatAt(order, time)) totals.set(key, totals.get(key)! + value);
  }
  for (const [index, key] of order.entries()) {
    const start = index * DEMO_HEAT_STAGGER_MS;
    expect(demoHeatAt(order, start).get(key)).toBe(0);
    expect(demoHeatAt(order, start + DEMO_HEAT_PULSE_MS / 2).get(key)).toBeCloseTo(1);
    expect(demoHeatAt(order, start + DEMO_HEAT_PULSE_MS).get(key)).toBe(0);
    expect(totals.get(key)).toBeCloseTo(totals.get(order[0])!, 6);
    expect(demoHeatAt(order, start + 350).get(key)).toBeLessThan(.06);
  }
});

test("several staggered breaths overlap smoothly, including across the loop seam", () => {
  const cycle = keys.length * DEMO_HEAT_STAGGER_MS;
  for (let time = 0; time <= cycle; time += 200) {
    const current = demoHeatAt(keys, time);
    const next = demoHeatAt(keys, time + 200);
    expect([...current.values()].filter(value => value > .4).length).toBeGreaterThanOrEqual(3);
    for (const key of keys) expect(Math.abs(next.get(key)! - current.get(key)!)).toBeLessThan(.15);
  }
  expect(demoHeatAt(keys, cycle)).toEqual(demoHeatAt(keys, 0));
});

test("no participating stands means no heat", () => {
  expect(demoHeatAt([], 0)).toEqual(new Map());
  for (const order of [["one"], ["one", "two"]]) {
    for (let time = 0; time < 10000; time += 200) {
      expect([...demoHeatAt(order, time).values()].every(value => value >= 0 && value <= 1)).toBe(true);
    }
  }
});
