import { describe, expect, test } from "vitest";
import { ORBIT_RADIUS } from "./geometry";
import { CALM_DOTS_MAX, backlogHp, backlogRing, hash32, minStarGap, orbitLayout, orbitOf, spreadAngles, starSize } from "./layout";
import type { ConstellationCounts, ConstellationItem, ConstellationPriority, OrbitIndex, Star } from "./types";

const TAU = Math.PI * 2;
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const PRIORITIES: ConstellationPriority[] = ["blocking_or_overdue", "due_today", "needs_reply", "grace_or_warning", "waiting_scanme", "waiting_client", "other"];

const item = (id: string, priority: ConstellationPriority, waitMs = 1000): ConstellationItem => ({ id, priority, relevantAt: NOW - waitMs });
const counts = (patch: Partial<ConstellationCounts> = {}): ConstellationCounts => ({
  total: 0,
  urgent: 0,
  today: 0,
  needsReply: 0,
  graceOrWarning: 0,
  waitingScanme: 0,
  waitingClient: 0,
  calm: 0,
  ...patch,
});
const baseAngle = (id: string) => (hash32(id) / 2 ** 32) * TAU;
const starOf = (stars: Star[], id: string) => stars.find((star) => star.id === id)!;
/** The distance on the circle between two angles. */
const circular = (a: number, b: number) => {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
};
/** Every neighbour on the circle (and the closing pair) is at least `gap` apart. */
function expectSpaced(angles: number[], gap: number) {
  const sorted = [...angles].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index += 1) {
    const next = index === sorted.length - 1 ? sorted[0] + TAU : sorted[index + 1];
    expect(next - sorted[index], `neighbours ${index}`).toBeGreaterThanOrEqual(gap - 1e-6);
  }
}
/** The cyclic order of the indices by angle. */
function cyclicOrder(angles: readonly number[]): number[] {
  const order = angles.map((_, index) => index).sort((a, b) => angles[a] - angles[b] || a - b);
  const start = order.indexOf(Math.min(...order));
  return [...order.slice(start), ...order.slice(0, start)];
}
const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}:${index}`);

describe("hash32", () => {
  test("FNV-1a 32-bit: the known vectors, always a non-negative integer below 2^32", () => {
    expect(hash32("")).toBe(0x811c9dc5);
    expect(hash32("a")).toBe(0xe40c292c);
    expect(hash32("foobar")).toBe(0xbf9cf968);
    for (const text of ["", "x", "task:test:1", "č ć š đ ž", "😀"]) {
      const value = hash32(text);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe("urgency is the distance from the core", () => {
  test("every priority goes to the expected orbit", () => {
    const expected: Record<ConstellationPriority, OrbitIndex> = {
      blocking_or_overdue: 1,
      due_today: 2,
      needs_reply: 3,
      grace_or_warning: 3,
      waiting_scanme: 3,
      waiting_client: 3,
      other: 4,
    };
    for (const priority of PRIORITIES) expect(orbitOf(priority), priority).toBe(expected[priority]);
  });

  test("a more urgent item stands nearer the core", () => {
    const radiusOf = (priority: ConstellationPriority) => ORBIT_RADIUS[orbitOf(priority)];
    expect(radiusOf("blocking_or_overdue")).toBeLessThan(radiusOf("due_today"));
    expect(radiusOf("due_today")).toBeLessThan(radiusOf("needs_reply"));
    expect(radiusOf("needs_reply")).toBeLessThan(radiusOf("other"));
    const layout = orbitLayout(PRIORITIES.map((priority) => item(`task:test:${priority}`, priority)), null, NOW);
    for (const priority of PRIORITIES) expect(starOf(layout.stars, `task:test:${priority}`).orbit).toBe(orbitOf(priority));
  });

  test("an item star carries its tone, pulse and no „more“", () => {
    const layout = orbitLayout(PRIORITIES.map((priority) => item(`task:test:${priority}`, priority)), null, NOW);
    expect(starOf(layout.stars, "task:test:blocking_or_overdue")).toMatchObject({ kind: "item", tone: "danger", pulse: true, more: 0 });
    expect(starOf(layout.stars, "task:test:due_today")).toMatchObject({ tone: "warning", pulse: false });
    expect(starOf(layout.stars, "task:test:waiting_client")).toMatchObject({ tone: "neutral", pulse: false });
    expect(starOf(layout.stars, "task:test:other")).toMatchObject({ orbit: 4, tone: "success", pulse: false });
  });
});

describe("starSize", () => {
  test("up to an hour small, up to a day medium, longer large", () => {
    expect(starSize(0)).toBe("small");
    expect(starSize(HOUR)).toBe("small");
    expect(starSize(HOUR + 1)).toBe("medium");
    expect(starSize(24 * HOUR)).toBe("medium");
    expect(starSize(24 * HOUR + 1)).toBe("large");
    expect(starSize(30 * 24 * HOUR)).toBe("large");
  });

  test("a negative or unknown wait is small", () => {
    expect(starSize(-5 * HOUR)).toBe("small");
    expect(starSize(Number.NaN)).toBe("small");
  });

  test("the layout sizes a star by now − relevantAt", () => {
    const layout = orbitLayout([item("task:test:s", "needs_reply", HOUR), item("task:test:m", "needs_reply", 5 * HOUR), item("task:test:l", "needs_reply", 48 * HOUR), item("task:test:f", "needs_reply", -HOUR)], null, NOW);
    expect(starOf(layout.stars, "task:test:s").size).toBe("small");
    expect(starOf(layout.stars, "task:test:m").size).toBe("medium");
    expect(starOf(layout.stars, "task:test:l").size).toBe("large");
    expect(starOf(layout.stars, "task:test:f").size).toBe("small");
  });
});

describe("a stable place per id", () => {
  test("the same id has the same angle, whatever else is on the other orbits or far away on its own", () => {
    const target = "task:test:target";
    const alone = starOf(orbitLayout([item(target, "due_today")], null, NOW).stars, target).angle;
    expect(alone).toBeCloseTo(baseAngle(target), 12);

    const far = ids("task:test:far", 400).filter((id) => circular(baseAngle(id), baseAngle(target)) > 2 * minStarGap(2)).slice(0, 3);
    const crowded = orbitLayout(
      [
        ...far.map((id) => item(id, "due_today")),
        ...ids("task:test:other", 6).map((id) => item(id, "blocking_or_overdue")),
        ...ids("task:test:wait", 6).map((id) => item(id, "waiting_client")),
        item(target, "due_today"),
      ],
      counts({ urgent: 20 }),
      NOW,
    );
    expect(starOf(crowded.stars, target).angle).toBeCloseTo(alone, 12);
  });

  test("two calls give the same picture", () => {
    const items = [...ids("task:test:a", 9).map((id) => item(id, "due_today")), ...ids("task:test:b", 5).map((id) => item(id, "other"))];
    const c = counts({ urgent: 3, today: 14, calm: 90 });
    expect(orbitLayout(items, c, NOW, 40)).toEqual(orbitLayout(items, c, NOW, 40));
  });

  test("the order of the input does not change the picture", () => {
    const items = ids("task:test:o", 8).map((id) => item(id, "needs_reply"));
    expect(orbitLayout([...items].reverse(), null, NOW)).toEqual(orbitLayout(items, null, NOW));
  });
});

describe("stars on one orbit do not overlap", () => {
  const cases: Array<[OrbitIndex, ConstellationPriority, Partial<ConstellationCounts>]> = [
    [1, "blocking_or_overdue", { urgent: 20 }],
    [2, "due_today", { today: 20 }],
    [3, "needs_reply", { needsReply: 10, graceOrWarning: 10 }],
  ];

  for (const [orbit, priority, patch] of cases) {
    test(`12 items and the „+N“ star on orbit ${orbit} keep the gap, the closing pair included`, () => {
      const layout = orbitLayout(ids(`task:test:o${orbit}`, 12).map((id) => item(id, priority)), counts(patch), NOW);
      const onOrbit = layout.stars.filter((star) => star.orbit === orbit);
      expect(onOrbit).toHaveLength(13);
      expect(onOrbit.filter((star) => star.kind === "more")).toHaveLength(1);
      expectSpaced(onOrbit.map((star) => star.angle), minStarGap(orbit));
    });
  }

  test("two ids whose angles are almost the same are moved apart", () => {
    const candidates = ids("task:test:near", 3000).sort((a, b) => baseAngle(a) - baseAngle(b));
    let best: [string, string] = [candidates[0], candidates[1]];
    for (let index = 1; index < candidates.length - 1; index += 1) {
      if (baseAngle(candidates[index + 1]) - baseAngle(candidates[index]) < baseAngle(best[1]) - baseAngle(best[0])) best = [candidates[index], candidates[index + 1]];
    }
    const closeness = baseAngle(best[1]) - baseAngle(best[0]);
    expect(closeness).toBeLessThan(minStarGap(2) / 20);

    const layout = orbitLayout(best.map((id) => item(id, "due_today")), null, NOW);
    const [a, b] = best.map((id) => starOf(layout.stars, id).angle);
    expect(circular(a, b)).toBeGreaterThanOrEqual(minStarGap(2) - 1e-6);
    // The order on the circle is kept.
    expect(a).toBeLessThan(b);
  });

  test("a crowd that cannot fit on an orbit is spread evenly", () => {
    const layout = orbitLayout(ids("task:test:crowd", 30).map((id) => item(id, "blocking_or_overdue")), null, NOW);
    const angles = layout.stars.map((star) => star.angle).sort((a, b) => a - b);
    for (let index = 1; index < angles.length; index += 1) expect(angles[index] - angles[index - 1]).toBeCloseTo(TAU / 30, 9);
  });
});

describe("spreadAngles", () => {
  test("an empty list and a single angle", () => {
    expect(spreadAngles([], 0.3)).toEqual([]);
    expect(spreadAngles([2.5], 0.3)).toEqual([2.5]);
    expect(spreadAngles([-1], 0.3)[0]).toBeCloseTo(TAU - 1, 12);
  });

  test("angles that are already apart stay the same", () => {
    const apart = [0.2, 1.5, 3.0, 4.4, 5.9];
    expect(spreadAngles(apart, 0.5)).toEqual(apart);
    // In any order of the input, and normalized into [0, 2π).
    expect(spreadAngles([4.4, 0.2, 5.9, 1.5, 3.0], 0.5)).toEqual([4.4, 0.2, 5.9, 1.5, 3.0]);
    expect(spreadAngles([0.2 + TAU, 1.5 - TAU], 0.5)[1]).toBeCloseTo(1.5, 12);
  });

  test("a pair that is too close moves apart symmetrically", () => {
    const [a, b] = spreadAngles([3.0, 3.1], 0.5);
    expect(b - a).toBeCloseTo(0.5, 9);
    expect((a + b) / 2).toBeCloseTo(3.05, 9);
  });

  test("the closing pair at the seam is moved apart, too", () => {
    const result = spreadAngles([0.05, TAU - 0.05, 3], 0.4);
    expectSpaced(result, 0.4);
    result.forEach((angle) => {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TAU);
    });
  });

  test("a full circle is spaced evenly, from the smallest angle", () => {
    const result = spreadAngles([1, 1, 1, 1], 2);
    const sorted = [...result].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(1, 12);
    for (let index = 1; index < sorted.length; index += 1) expect(sorted[index] - sorted[index - 1]).toBeCloseTo(TAU / 4, 12);
  });

  test("the index order and the circular order are kept", () => {
    const angles = [3.2, 0.1, 3.25, 6.2, 3.3, 0.15, 5.0];
    const result = spreadAngles(angles, 0.4);
    expect(result).toHaveLength(angles.length);
    expectSpaced(result, 0.4);
    expect(cyclicOrder(result)).toEqual(cyclicOrder(angles));
    result.forEach((angle) => {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TAU);
    });

    const crowded = [2, 2.01, 2.02, 2.03, 2.04, 2.05];
    expect(cyclicOrder(spreadAngles(crowded, 0.5))).toEqual(cyclicOrder(crowded));
    expect(cyclicOrder(spreadAngles(crowded.slice().reverse(), 1.2))).toEqual(cyclicOrder(crowded.slice().reverse()));
  });

  test("it does not change its input and is deterministic", () => {
    const angles = Object.freeze([1, 1.01, 1.02]);
    expect(spreadAngles(angles, 0.4)).toEqual(spreadAngles(angles, 0.4));
  });
});

describe("the „+N“ star", () => {
  test("a rest above zero gives a star that stands for it", () => {
    const layout = orbitLayout([item("task:test:u", "blocking_or_overdue")], counts({ urgent: 5, today: 3 }), NOW);
    const urgent = layout.stars.find((star) => star.id === "more:1");
    expect(urgent).toMatchObject({ kind: "more", orbit: 1, size: "medium", tone: "danger", pulse: true, more: 4 });
    expect(layout.stars.find((star) => star.id === "more:2")).toMatchObject({ kind: "more", orbit: 2, tone: "warning", pulse: false, more: 3 });
  });

  test("no rest (zero or negative) gives no star", () => {
    const named = [item("task:test:u1", "blocking_or_overdue"), item("task:test:u2", "blocking_or_overdue"), item("task:test:t1", "due_today")];
    const exact = orbitLayout(named, counts({ urgent: 2, today: 1 }), NOW);
    expect(exact.stars.filter((star) => star.kind === "more")).toEqual([]);
    const fewer = orbitLayout(named, counts({ urgent: 1, today: 0 }), NOW);
    expect(fewer.stars.filter((star) => star.kind === "more")).toEqual([]);
  });

  test("orbit 3 adds up four counters", () => {
    const layout = orbitLayout([item("task:test:n1", "needs_reply"), item("task:test:w1", "waiting_client")], counts({ needsReply: 3, graceOrWarning: 4, waitingScanme: 5, waitingClient: 6 }), NOW);
    expect(layout.stars.find((star) => star.id === "more:3")).toMatchObject({ kind: "more", orbit: 3, tone: "neutral", pulse: false, more: 16 });
  });

  test("it has its own stable angle on its orbit", () => {
    const layout = orbitLayout([], counts({ urgent: 2, today: 2, needsReply: 2 }), NOW);
    for (const orbit of [1, 2, 3] as const) {
      expect(starOf(layout.stars, `more:${orbit}`).angle).toBeCloseTo(baseAngle(`more:${orbit}`), 12);
    }
  });

  test("the calm orbit never gets one", () => {
    const layout = orbitLayout([], counts({ calm: 30 }), NOW);
    expect(layout.stars).toEqual([]);
  });
});

describe("the calm orbit", () => {
  test("a named calm item is a star on orbit 4 and reduces the unnamed calm total", () => {
    const layout = orbitLayout([item("task:test:c1", "other"), item("task:test:c2", "other")], counts({ calm: 10 }), NOW);
    expect(layout.stars.filter((star) => star.orbit === 4)).toHaveLength(2);
    expect(layout.calmTotal).toBe(8);
    expect(layout.calm).toHaveLength(8);
  });

  test("the unnamed total is never negative", () => {
    const layout = orbitLayout([item("task:test:c1", "other"), item("task:test:c2", "other")], counts({ calm: 1 }), NOW);
    expect(layout.calmTotal).toBe(0);
    expect(layout.calm).toEqual([]);
  });

  test("at most 60 dots are drawn and the total stays exact", () => {
    const layout = orbitLayout([], counts({ calm: 200 }), NOW);
    expect(CALM_DOTS_MAX).toBe(60);
    expect(layout.calm).toHaveLength(60);
    expect(layout.calmTotal).toBe(200);
    expect(orbitLayout([], counts({ calm: 60 }), NOW).calm).toHaveLength(60);
    expect(orbitLayout([], counts({ calm: 7 }), NOW).calm).toHaveLength(7);
  });

  test("the dots form a belt around the outer orbit with angles in [0, 2π)", () => {
    for (const total of [1, 7, 60, 200]) {
      const layout = orbitLayout([], counts({ calm: total }), NOW);
      for (const dot of layout.calm) {
        expect(dot.angle).toBeGreaterThanOrEqual(0);
        expect(dot.angle).toBeLessThan(TAU);
        expect(Math.abs(dot.radius - ORBIT_RADIUS[4])).toBeLessThanOrEqual(0.025);
      }
    }
  });

  test("the dots are spread around the whole orbit, one in each share of the circle", () => {
    const layout = orbitLayout([], counts({ calm: 12 }), NOW);
    const sorted = layout.calm.map((dot) => dot.angle).sort((a, b) => a - b);
    sorted.forEach((angle, index) => {
      expect(angle).toBeGreaterThan((index / 12) * TAU);
      expect(angle).toBeLessThan(((index + 1) / 12) * TAU);
    });
  });
});

describe("the backlog ring", () => {
  test("hp is 3 × urgent + 2 × needs a reply + 1 × today", () => {
    expect(backlogHp(counts({ urgent: 2, needsReply: 3, today: 4, graceOrWarning: 9, waitingScanme: 9, waitingClient: 9, calm: 9 }))).toBe(16);
    expect(backlogHp(counts())).toBe(0);
  });

  test("share is hp / hpMax", () => {
    expect(backlogRing(counts({ urgent: 1, needsReply: 1, today: 1 }))).toEqual({ hp: 6, hpMax: 6, share: 1 });
    expect(backlogRing(counts({ urgent: 1, needsReply: 1, today: 1 }), 12)).toEqual({ hp: 6, hpMax: 12, share: 0.5 });
  });

  test("an hp above the largest seen raises the largest", () => {
    expect(backlogRing(counts({ urgent: 4 }), 6)).toEqual({ hp: 12, hpMax: 12, share: 1 });
  });

  test("no hp and no largest is a share of 0, not NaN", () => {
    expect(backlogRing(counts())).toEqual({ hp: 0, hpMax: 0, share: 0 });
    expect(backlogRing(counts(), 0)).toEqual({ hp: 0, hpMax: 0, share: 0 });
    expect(backlogRing(counts(), 10)).toEqual({ hp: 0, hpMax: 10, share: 0 });
  });

  test("the layout carries the ring; without counts it is null", () => {
    expect(orbitLayout([], counts({ urgent: 1 }), NOW, 6).backlog).toEqual({ hp: 3, hpMax: 6, share: 0.5 });
    expect(backlogRing(null, 5)).toBeNull();
  });
});

describe("without counts", () => {
  test("only the named stars are drawn: no „+N“, no dots, no ring, no invented zero", () => {
    const layout = orbitLayout([item("task:test:1", "blocking_or_overdue"), item("task:test:2", "other")], null, NOW, 20);
    expect(layout.stars.map((star) => star.id).sort()).toEqual(["task:test:1", "task:test:2"]);
    expect(layout.stars.every((star) => star.kind === "item")).toBe(true);
    expect(layout.calm).toEqual([]);
    expect(layout.calmTotal).toBe(0);
    expect(layout.backlog).toBeNull();
  });

  test("no items and no counts is an empty picture", () => {
    expect(orbitLayout([], null, NOW)).toEqual({ stars: [], calm: [], calmTotal: 0, backlog: null });
  });
});

describe("the order and the purity of the layout", () => {
  test("stars are ordered by orbit, then by angle", () => {
    const items = PRIORITIES.flatMap((priority) => ids(`task:test:${priority}`, 3).map((id) => item(id, priority)));
    const { stars } = orbitLayout(items, counts({ urgent: 9, today: 9, needsReply: 9 }), NOW);
    for (let index = 1; index < stars.length; index += 1) {
      const [a, b] = [stars[index - 1], stars[index]];
      expect(a.orbit < b.orbit || (a.orbit === b.orbit && a.angle <= b.angle)).toBe(true);
    }
  });

  test("it does not change its input", () => {
    const items = Object.freeze(ids("task:test:f", 5).map((id) => Object.freeze(item(id, "due_today"))));
    const c = Object.freeze(counts({ today: 8, calm: 4 }));
    expect(() => orbitLayout(items, c, NOW, 3)).not.toThrow();
    expect(items.map((entry) => entry.id)).toEqual(ids("task:test:f", 5));
  });
});
