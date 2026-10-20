import { describe, expect, test } from "vitest";
import { ADMIN_CEREMONY } from "@/lib/admin-v2/motion";
import {
  BURST_FROM,
  CEREMONY_PARTICLES_MAX,
  PARTICLE_TRAIL_LAG,
  RANK_BADGE,
  ceremonyForm,
  ceremonyKey,
  ceremonyParticles,
  ceremonyQueue,
  ceremonySeconds,
  ceremonySize,
  particleAt,
  particleTrail,
  planSeconds,
  strikeRing,
} from "./ceremonies";
import type { BadgeId, Rarity } from "./ids";
import type { CeremonyEnv, CeremonyEvent, CeremonyItem, CeremonyPlan } from "./types";

const level = (value: number, rankUp = false, rank: "pripravnik" | "operater" | "dispecer" | "komandant" | "legenda" = "pripravnik", at = 1): CeremonyEvent => ({ kind: "level", level: value, rank, rankUp, at });
const boss = (dayKey = "2026-10-13", at = 2): CeremonyEvent => ({ kind: "boss", dayKey, at });
const badge = (id: BadgeId, rarity: Rarity, at = 3): CeremonyEvent => ({ kind: "badge", badge: id, rarity, at });
const record = (key = "hour", at = 4): CeremonyEvent => ({ kind: "record", key, title: "TEST rekord", at });
const item = (event: CeremonyEvent): CeremonyItem => ({ key: ceremonyKey(event), size: ceremonySize(event), event });
const keys = (items: CeremonyItem[]) => items.map((entry) => entry.key);
const calm: CeremonyEnv = { quiet: false, reducedMotion: false, editable: false, modal: false, phone: false };

describe("ceremonyKey and ceremonySize", () => {
  test("keys", () => {
    expect(ceremonyKey(level(7))).toBe("level:7");
    expect(ceremonyKey(boss())).toBe("boss:2026-10-13");
    expect(ceremonyKey(badge("kurir", "retka"))).toBe("badge:kurir");
    expect(ceremonyKey(record("hour:5"))).toBe("record:hour:5");
  });
  test("level, boss, epic and legendary badges are big", () => {
    expect(ceremonySize(level(2))).toBe("big");
    expect(ceremonySize(boss())).toBe("big");
    expect(ceremonySize(badge("dispecer", "epska"))).toBe("big");
    expect(ceremonySize(badge("legenda", "legendarna"))).toBe("big");
  });
  test("common and rare badges and records are cards", () => {
    expect(ceremonySize(badge("prvi_korak", "obicna"))).toBe("card");
    expect(ceremonySize(badge("kurir", "retka"))).toBe("card");
    expect(ceremonySize(record())).toBe("card");
  });
  test("the badges of the ranks", () => {
    expect(RANK_BADGE).toEqual({ operater: "operater", dispecer: "dispecer", komandant: "komandant", legenda: "legenda" });
  });
});

describe("ceremonyQueue", () => {
  test("an empty input is an empty plan", () => {
    expect(ceremonyQueue([], new Set())).toEqual({ show: [], rest: [], seen: [] });
  });

  test("priority: level, boss, badge by rarity, record", () => {
    const plan = ceremonyQueue(
      [record("a"), badge("kurir", "retka", 5), badge("prvi_korak", "obicna", 1), badge("dispecer", "epska", 9), badge("legenda", "legendarna", 9), boss(), level(3)],
      new Set(),
    );
    expect(keys([...plan.show, ...plan.rest])).toEqual(["level:3", "boss:2026-10-13", "badge:legenda", "badge:dispecer", "badge:kurir", "badge:prvi_korak", "record:a"]);
  });

  test("equal rarity is ordered by time, then by id", () => {
    const plan = ceremonyQueue([badge("stotka", "retka", 9), badge("kurir", "retka", 5), badge("kombo_x3", "retka", 5)], new Set());
    expect(keys([...plan.show, ...plan.rest])).toEqual(["badge:kombo_x3", "badge:kurir", "badge:stotka"]);
  });

  test("at most two are shown, the rest is counted", () => {
    const plan = ceremonyQueue([level(2), boss(), badge("kurir", "retka"), record()], new Set());
    expect(ADMIN_CEREMONY.maxInRow).toBe(2);
    expect(keys(plan.show)).toEqual(["level:2", "boss:2026-10-13"]);
    expect(keys(plan.rest)).toEqual(["badge:kurir", "record:hour"]);
    expect(plan.seen).toEqual(["level:2", "boss:2026-10-13", "badge:kurir", "record:hour"]);
  });

  test("a key already seen is skipped, and a key given twice is celebrated once", () => {
    const plan = ceremonyQueue([level(2), boss(), boss(), badge("kurir", "retka")], new Set(["level:2", "badge:kurir"]));
    expect(keys(plan.show)).toEqual(["boss:2026-10-13"]);
    expect(plan.rest).toEqual([]);
    expect(plan.seen).toEqual(["boss:2026-10-13"]);
  });

  test("everything seen leaves an empty plan", () => {
    expect(ceremonyQueue([level(2), boss()], new Set(["level:2", "boss:2026-10-13"]))).toEqual({ show: [], rest: [], seen: [] });
  });

  test("several levels at once: only the highest, the others are settled", () => {
    const plan = ceremonyQueue([level(3), level(5), level(4)], new Set());
    expect(keys(plan.show)).toEqual(["level:5"]);
    expect(plan.rest).toEqual([]);
    expect([...plan.seen].sort()).toEqual(["level:3", "level:4", "level:5"]);
  });

  test("a new rank and its badge are one ceremony", () => {
    const plan = ceremonyQueue([badge("operater", "retka"), level(6, true, "operater"), badge("kurir", "retka")], new Set());
    expect(keys(plan.show)).toEqual(["level:6", "badge:kurir"]);
    expect(plan.show[0].alsoBadge).toBe("operater");
    expect(plan.show[0].size).toBe("big");
    expect([...plan.seen].sort()).toEqual(["badge:kurir", "badge:operater", "level:6"]);
  });

  test("a rank without a badge in the list stays a plain level", () => {
    const plan = ceremonyQueue([level(6, true, "operater")], new Set());
    expect(plan.show[0].alsoBadge).toBeUndefined();
    expect(plan.seen).toEqual(["level:6"]);
  });

  test("a level that is not a new rank does not take the badge", () => {
    const plan = ceremonyQueue([level(7, false, "operater"), badge("operater", "retka")], new Set());
    expect(keys(plan.show)).toEqual(["level:7", "badge:operater"]);
    expect(plan.show[0].alsoBadge).toBeUndefined();
  });

  test("the first rank has no badge to merge", () => {
    const plan = ceremonyQueue([level(1, true, "pripravnik")], new Set());
    expect(plan.show[0].alsoBadge).toBeUndefined();
  });

  test("a merged badge does not take a place in the row", () => {
    const plan = ceremonyQueue([level(11, true, "dispecer"), badge("dispecer", "epska"), boss(), badge("kurir", "retka")], new Set());
    expect(keys(plan.show)).toEqual(["level:11", "boss:2026-10-13"]);
    expect(keys(plan.rest)).toEqual(["badge:kurir"]);
  });

  test("the sizes follow the events", () => {
    const plan = ceremonyQueue([badge("kurir", "retka"), badge("legenda", "legendarna")], new Set());
    expect(plan.show.map((entry) => entry.size)).toEqual(["big", "card"]);
  });

  test("does not change its input", () => {
    const events = [level(3), level(5), boss(), badge("kurir", "retka")];
    const seen = new Set(["level:3"]);
    const copy = JSON.stringify(events);
    ceremonyQueue(events, seen);
    expect(JSON.stringify(events)).toBe(copy);
    expect([...seen]).toEqual(["level:3"]);
  });
});

describe("ceremonyForm", () => {
  const big = item(level(3));
  const card = item(badge("kurir", "retka"));
  const rec = item(record());

  test("a calm desktop shows the layer in the size of the item", () => {
    expect(ceremonyForm(big, calm)).toEqual({ as: "layer", size: "big" });
    expect(ceremonyForm(card, calm)).toEqual({ as: "layer", size: "card" });
    expect(ceremonyForm(rec, calm)).toEqual({ as: "layer", size: "card" });
  });
  test("quiet mode turns the layer into a toast, a record into nothing", () => {
    const quiet = { ...calm, quiet: true };
    expect(ceremonyForm(big, quiet)).toEqual({ as: "toast" });
    expect(ceremonyForm(card, quiet)).toEqual({ as: "toast" });
    expect(ceremonyForm(rec, quiet)).toEqual({ as: "none" });
  });
  test("reduced motion is a toast, even for a record", () => {
    const reduced = { ...calm, reducedMotion: true };
    for (const entry of [big, card, rec]) expect(ceremonyForm(entry, reduced)).toEqual({ as: "toast" });
  });
  test("a field in focus or an open dialog is a toast", () => {
    for (const env of [{ ...calm, editable: true }, { ...calm, modal: true }]) for (const entry of [big, card, rec]) expect(ceremonyForm(entry, env)).toEqual({ as: "toast" });
  });
  test("a phone always gets a card", () => {
    const phone = { ...calm, phone: true };
    expect(ceremonyForm(big, phone)).toEqual({ as: "layer", size: "card" });
    expect(ceremonyForm(card, phone)).toEqual({ as: "layer", size: "card" });
  });
  test("every combination of the environment gives a defined form", () => {
    const flags = [false, true];
    for (const quiet of flags) for (const reducedMotion of flags) for (const editable of flags) for (const modal of flags) for (const phone of flags) {
      const env = { quiet, reducedMotion, editable, modal, phone };
      for (const entry of [big, card, rec]) {
        const form = ceremonyForm(entry, env);
        if (quiet || reducedMotion || editable || modal) expect(form.as).toBe(entry === rec && quiet ? "none" : "toast");
        else expect(form).toEqual({ as: "layer", size: phone ? "card" : entry.size });
      }
    }
  });
});

describe("durations", () => {
  test("big and compact phases come from the tokens", () => {
    expect(ceremonySeconds("big")).toEqual({ in: 0.38, hold: 0.94, out: 0.3, total: 1.62 });
    expect(ceremonySeconds("card")).toEqual({ in: 0.24, hold: 0.72, out: 0.24, total: 1.2 });
  });
  test("one ceremony is at most 1.8 s", () => {
    expect(ceremonySeconds("big").total).toBeLessThanOrEqual(1.8);
    expect(ceremonySeconds("card").total).toBeLessThanOrEqual(1.8);
  });
  test("the two longest in a row with the pause are at most 3.7 s", () => {
    const plan = ceremonyQueue([level(2), boss(), badge("legenda", "legendarna"), badge("dispecer", "epska")], new Set());
    expect(plan.show).toHaveLength(2);
    expect(planSeconds(plan)).toBe(3.64);
    expect(planSeconds(plan)).toBeLessThanOrEqual(3.7);
  });
  test("one item has no pause, none has no time", () => {
    const empty: CeremonyPlan = { show: [], rest: [], seen: [] };
    expect(planSeconds(empty)).toBe(0);
    expect(planSeconds({ ...empty, show: [item(badge("kurir", "retka"))] })).toBe(1.2);
    expect(planSeconds({ ...empty, show: [item(level(2)), item(badge("kurir", "retka"))] })).toBe(3.22);
  });
});

describe("particles", () => {
  test("the budget: at most 120 for a big one, 24 for a card", () => {
    expect(CEREMONY_PARTICLES_MAX).toBe(120);
    expect(ceremonyParticles("big", 1).length).toBeLessThanOrEqual(120);
    expect(ceremonyParticles("big", 1).length).toBeGreaterThan(24);
    expect(ceremonyParticles("card", 1).length).toBeLessThanOrEqual(24);
    expect(ceremonyParticles("card", 1).length).toBeGreaterThan(0);
  });
  test("the same seed gives the same burst, another seed another", () => {
    expect(ceremonyParticles("big", 42)).toEqual(ceremonyParticles("big", 42));
    expect(ceremonyParticles("big", 42)).not.toEqual(ceremonyParticles("big", 43));
  });
  test("every particle is within its limits", () => {
    for (const size of ["big", "card"] as const) {
      for (const particle of ceremonyParticles(size, 7)) {
        expect(particle.angle).toBeGreaterThanOrEqual(0);
        expect(particle.angle).toBeLessThan(Math.PI * 2);
        expect(particle.speed).toBeGreaterThan(0);
        expect(particle.speed).toBeLessThanOrEqual(0.5);
        expect(particle.delay).toBeGreaterThanOrEqual(0);
        expect(particle.delay).toBeLessThanOrEqual(0.25);
        expect(particle.hue).toBeGreaterThanOrEqual(0);
        expect(particle.hue).toBeLessThanOrEqual(1);
        expect(particle.size).toBeGreaterThan(0);
      }
    }
  });
  test("trails, not dots: 2–7 px for a big one, a card smaller (2–4 px)", () => {
    for (const particle of ceremonyParticles("big", 11)) {
      expect(particle.size).toBeGreaterThanOrEqual(2);
      expect(particle.size).toBeLessThanOrEqual(7);
    }
    for (const particle of ceremonyParticles("card", 11)) {
      expect(particle.size).toBeGreaterThanOrEqual(2);
      expect(particle.size).toBeLessThanOrEqual(4);
    }
    // They really reach the range: a burst of 120 is not all thin.
    expect(Math.max(...ceremonyParticles("big", 11).map((particle) => particle.size))).toBeGreaterThan(5.5);
  });
  test("some stream out of the chip behind the medal, the rest burst when it lands", () => {
    const big = ceremonyParticles("big", 21);
    const streaming = big.filter((particle) => particle.delay < BURST_FROM);
    const bursting = big.filter((particle) => particle.delay >= BURST_FROM);
    expect(streaming.length).toBeGreaterThan(20);
    expect(bursting.length).toBeGreaterThan(streaming.length);
    // The burst starts as the medal lands (the end of `in` is at 0.235 of a big ceremony).
    const landing = ceremonySeconds("big").in / ceremonySeconds("big").total;
    expect(BURST_FROM).toBeLessThanOrEqual(landing);
    expect(Math.max(...bursting.map((particle) => particle.delay))).toBeGreaterThanOrEqual(landing - 0.02);
    // A streaming particle stays short; a burst reaches further.
    expect(Math.max(...streaming.map((particle) => particle.speed))).toBeLessThan(0.5 * 0.4 + 1e-9);
  });
  test("no randomness outside the seed", () => {
    const real = Math.random;
    Math.random = () => {
      throw new Error("Math.random used");
    };
    try {
      expect(ceremonyParticles("big", 3)).toHaveLength(120);
    } finally {
      Math.random = real;
    }
  });
});

describe("particleAt", () => {
  const particle = { angle: 0, speed: 0.4, size: 3, delay: 0.2, hue: 0.5 };
  test("nothing is visible at the edges of the ceremony", () => {
    for (const progress of [-1, 0, 1, 2]) expect(particleAt(particle, progress).alpha).toBe(0);
  });
  test("nothing before its delay", () => {
    expect(particleAt(particle, 0.1)).toEqual({ x: 0, y: 0, alpha: 0, scale: 1 });
    expect(particleAt(particle, 0.2).alpha).toBe(0);
  });
  test("it flies out in its direction, easing out, and sinks a little", () => {
    const early = particleAt(particle, 0.4);
    const late = particleAt(particle, 0.9);
    expect(early.x).toBeGreaterThan(0);
    expect(late.x).toBeGreaterThan(early.x);
    expect(late.x).toBeLessThanOrEqual(0.4);
    // Ease-out: the first half of the flight covers more than the second.
    const half = particleAt(particle, 0.2 + 0.8 * 0.5).x;
    expect(half).toBeGreaterThan(0.2);
    expect(late.y).toBeGreaterThan(0);
    expect(late.y).toBeLessThan(0.1);
  });
  test("it fades in, then out, and shrinks from 1 to 0.4", () => {
    const rising = particleAt(particle, 0.25).alpha;
    const peak = particleAt(particle, 0.2 + 0.8 * 0.15).alpha;
    const falling = particleAt(particle, 0.95).alpha;
    expect(rising).toBeGreaterThan(0);
    expect(rising).toBeLessThan(peak);
    expect(peak).toBeCloseTo(1, 5);
    expect(falling).toBeLessThan(peak);
    expect(falling).toBeGreaterThanOrEqual(0);
    expect(particleAt(particle, 0.2001).scale).toBeCloseTo(1, 2);
    expect(particleAt(particle, 0.9999).scale).toBeCloseTo(0.4, 2);
  });
  test("alpha and scale stay in range over the whole ceremony", () => {
    for (const burst of ceremonyParticles("big", 5)) {
      for (let step = 0; step <= 100; step += 1) {
        const at = particleAt(burst, step / 100);
        expect(at.alpha).toBeGreaterThanOrEqual(0);
        expect(at.alpha).toBeLessThanOrEqual(1);
        expect(at.scale).toBeGreaterThanOrEqual(0.4);
        expect(at.scale).toBeLessThanOrEqual(1);
      }
    }
  });
  test("the distance from the origin never shrinks for a particle that flies sideways or down (the sink only adds to it)", () => {
    const bursts = ceremonyParticles("big", 9).filter((burst) => Math.sin(burst.angle) >= 0);
    expect(bursts.length).toBeGreaterThan(30);
    for (const burst of bursts) {
      let last = 0;
      for (let step = 0; step <= 99; step += 1) {
        const at = particleAt(burst, step / 100);
        const distance = Math.hypot(at.x, at.y);
        expect(distance).toBeGreaterThanOrEqual(last - 1e-9);
        last = distance;
        expect(distance).toBeLessThan(0.6);
      }
    }
  });
});

describe("particleTrail", () => {
  const particle = { angle: 0, speed: 0.4, size: 5, delay: 0.2, hue: 0.5 };

  test("nothing at the edges or before it starts", () => {
    for (const progress of [-1, 0, 0.1, 0.2, 1, 2]) expect(particleTrail(particle, progress)).toBeNull();
  });
  test("the head of the trail is where the particle is; the tail is where it was a moment ago", () => {
    const trail = particleTrail(particle, 0.5)!;
    const now = particleAt(particle, 0.5);
    const before = particleAt(particle, 0.5 - PARTICLE_TRAIL_LAG);
    expect(trail.to).toEqual({ x: now.x, y: now.y });
    expect(trail.from).toEqual({ x: before.x, y: before.y });
    expect(trail.alpha).toBe(now.alpha);
    // It flies away from the origin, so the tail is nearer to it than the head.
    expect(Math.hypot(trail.from.x, trail.from.y)).toBeLessThan(Math.hypot(trail.to.x, trail.to.y));
  });
  test("a trail never starts before its particle did", () => {
    const trail = particleTrail(particle, 0.21)!;
    expect(trail.from).toEqual({ x: 0, y: 0 });
    expect(trail.to.x).toBeGreaterThan(0);
  });
  test("the width is the size shrunk by the scale, in the range of the sizes", () => {
    for (const burst of ceremonyParticles("big", 4)) {
      for (let step = 1; step < 100; step += 1) {
        const trail = particleTrail(burst, step / 100);
        if (!trail) continue;
        expect(trail.width).toBeGreaterThanOrEqual(burst.size * 0.4 - 1e-9);
        expect(trail.width).toBeLessThanOrEqual(burst.size + 1e-9);
        expect(trail.alpha).toBeGreaterThan(0);
        expect(trail.alpha).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("strikeRing", () => {
  test("one ring: nothing before the medal lands or after ADMIN_CEREMONY.ring", () => {
    for (const seconds of [-1, 0, ADMIN_CEREMONY.ring, ADMIN_CEREMONY.ring + 1, Number.NaN]) expect(strikeRing(seconds)).toBeNull();
    expect(ADMIN_CEREMONY.ring).toBeLessThanOrEqual(ceremonySeconds("big").hold + ceremonySeconds("big").out);
  });
  test("it goes out, easing out, and fades", () => {
    const early = strikeRing(0.1)!;
    const mid = strikeRing(ADMIN_CEREMONY.ring / 2)!;
    const late = strikeRing(ADMIN_CEREMONY.ring - 0.05)!;
    expect(mid.radius).toBeGreaterThan(early.radius);
    expect(late.radius).toBeGreaterThan(mid.radius);
    expect(late.radius).toBeLessThanOrEqual(0.6);
    // Ease-out: the first half of the time covers more than the second.
    expect(mid.radius - 0.1).toBeGreaterThan(late.radius - mid.radius);
    expect(early.alpha).toBeGreaterThan(mid.alpha);
    expect(mid.alpha).toBeGreaterThan(late.alpha);
    for (const ring of [early, mid, late]) {
      expect(ring.alpha).toBeGreaterThan(0);
      expect(ring.alpha).toBeLessThanOrEqual(1);
      expect(ring.width).toBeGreaterThanOrEqual(1);
    }
    expect(early.width).toBeGreaterThan(late.width);
  });
});
