import { describe, expect, test } from "vitest";
import {
  EMPTY_PULSE_READ,
  PULSE_AMPLITUDE_MAX,
  PULSE_BEAT_WIDTH,
  PULSE_BUFFER,
  PULSE_HEIGHT,
  PULSE_KINDS,
  PULSE_MAX_SCAN_BEATS,
  PULSE_SPREAD_MS,
  PULSE_WINDOW_MS,
  beatAmplitude,
  beatPoints,
  beatShape,
  beatX,
  createPulseStore,
  demoBeats,
  pruneBeats,
  pulseActive,
  pulseEnergy,
  pulseFromReads,
  resolvedBeat,
  visibleBeats,
  type PulseBeat,
  type PulseRead,
} from "./pulse";

// ADMIN v3 V1 — the Pulse of the system: real events become beats, a calm
// system is a flat line. Every beat comes from a number the admin already
// reads; nothing is invented, and a falling count is never called „rešeno“.

const NOW = Date.parse("2026-10-30T11:00:00+01:00");
const read = (extra: Partial<PulseRead> = {}): PulseRead => ({ scansToday: 100, scansCapped: false, leadsToday: 4, total: 10, urgent: 2, ...extra });
const kinds = (beats: readonly PulseBeat[]) => beats.map((beat) => beat.kind);

describe("reads become beats", () => {
  test("the first read is the state, not news: no beat", () => {
    expect(pulseFromReads(null, read(), NOW)).toEqual([]);
  });

  test("the same numbers again: a flat line", () => {
    expect(pulseFromReads(read(), read(), NOW)).toEqual([]);
  });

  test("new scans become beats spread evenly over the next 55 s", () => {
    const beats = pulseFromReads(read(), read({ scansToday: 105 }), NOW);
    expect(kinds(beats)).toEqual(["sken", "sken", "sken", "sken", "sken"]);
    expect(beats.map((beat) => beat.at - NOW)).toEqual([0, 11_000, 22_000, 33_000, 44_000]);
    for (const beat of beats) {
      expect(beat.weight).toBe(1);
      expect(beat.at - NOW).toBeLessThan(PULSE_SPREAD_MS);
    }
  });

  test("more than 24 scans in one read: 24 beats that each stand for more scans", () => {
    const beats = pulseFromReads(read(), read({ scansToday: 100 + 240 }), NOW);
    expect(beats).toHaveLength(PULSE_MAX_SCAN_BEATS);
    for (const beat of beats) expect(beat.weight).toBe(10);
    expect(Math.max(...beats.map((beat) => beat.at)) - NOW).toBeLessThan(PULSE_SPREAD_MS);
    // The sum of the weights is the number of scans: nothing is lost and nothing is added.
    expect(beats.reduce((sum, beat) => sum + beat.weight, 0)).toBe(240);
  });

  test("a partial scan count gives no scan beat (its difference is not known)", () => {
    expect(pulseFromReads(read({ scansCapped: true }), read({ scansToday: 180, scansCapped: true }), NOW)).toEqual([]);
    expect(pulseFromReads(read(), read({ scansToday: 180, scansCapped: true }), NOW)).toEqual([]);
    expect(pulseFromReads(read({ scansCapped: true }), read({ scansToday: 180 }), NOW)).toEqual([]);
  });

  test("a new fair day (the count starts again) and a missing number give no beat", () => {
    expect(pulseFromReads(read({ scansToday: 900 }), read({ scansToday: 3 }), NOW)).toEqual([]);
    expect(pulseFromReads(EMPTY_PULSE_READ, read(), NOW)).toEqual([]);
    expect(pulseFromReads(read(), EMPTY_PULSE_READ, NOW)).toEqual([]);
  });

  test("a new lead is one beat that stands for all of them", () => {
    expect(pulseFromReads(read(), read({ leadsToday: 7 }), NOW)).toEqual([{ kind: "lead", at: NOW, weight: 3 }]);
    expect(pulseFromReads(read({ leadsToday: null }), read({ leadsToday: 7 }), NOW)).toEqual([]);
  });

  test("a rising urgent count is `hitno`, a rising total `novo`, a falling total `promena`", () => {
    expect(pulseFromReads(read(), read({ total: 11, urgent: 3 }), NOW)).toEqual([{ kind: "hitno", at: NOW, weight: 1 }]);
    expect(pulseFromReads(read(), read({ total: 12 }), NOW)).toEqual([{ kind: "novo", at: NOW, weight: 2 }]);
    expect(pulseFromReads(read(), read({ total: 13, urgent: 3 }), NOW)).toEqual([{ kind: "hitno", at: NOW, weight: 1 }, { kind: "novo", at: NOW, weight: 2 }]);
    expect(pulseFromReads(read(), read({ total: 8 }), NOW)).toEqual([{ kind: "promena", at: NOW, weight: 2 }]);
    // An item that became urgent without a new one: only `hitno`.
    expect(pulseFromReads(read(), read({ urgent: 4 }), NOW)).toEqual([{ kind: "hitno", at: NOW, weight: 2 }]);
  });

  test("counts that are not ready (the projection) are skipped; the other sources still beat", () => {
    const beats = pulseFromReads(read({ total: null, urgent: null }), read({ total: 12, urgent: 5, scansToday: 101 }), NOW);
    expect(kinds(beats)).toEqual(["sken"]);
  });

  test("`reseno` never comes from the counts, only from the journal of the admin's own actions", () => {
    const falls = [read({ total: 0, urgent: 0 }), read({ total: 9 }), read({ urgent: 0 }), read({ total: 9, urgent: 1 })];
    for (const next of falls) expect(kinds(pulseFromReads(read(), next, NOW))).not.toContain("reseno");
    expect(resolvedBeat(NOW)).toEqual({ kind: "reseno", at: NOW, weight: 1 });
    expect(resolvedBeat(NOW, 0).weight).toBe(1);
  });
});

describe("the shape of a beat", () => {
  test("every kind has a colour for both themes and never rises above 12 px", () => {
    for (const kind of PULSE_KINDS) {
      for (const theme of ["light", "dark"] as const) {
        for (const weight of [1, 2, 10, 500]) {
          const shape = beatShape(kind, weight, theme);
          expect(shape.color).toMatch(/^--admin-/);
          expect(shape.amplitude).toBeGreaterThan(0);
          expect(shape.amplitude).toBeLessThanOrEqual(PULSE_AMPLITUDE_MAX);
        }
      }
    }
    expect(PULSE_AMPLITUDE_MAX).toBeLessThan(PULSE_HEIGHT);
  });

  test("the colour says the kind; green is the darker one on the light surface", () => {
    expect(beatShape("sken", 1, "dark").color).toBe("--admin-nav-line");
    expect(beatShape("sken", 1, "light").color).toBe("--admin-success");
    expect(beatShape("reseno", 1, "light").color).toBe("--admin-success");
    expect(beatShape("novo", 1, "dark").color).toBe("--admin-warning");
    expect(beatShape("hitno", 1, "light").color).toBe("--admin-danger");
    expect(beatShape("lead", 1, "dark").color).toBe("--admin-chart-1");
    expect(beatShape("promena", 1, "dark").color).toBe("--admin-text-muted");
  });

  test("the amplitude says the kind and the weight: a solved item is higher than a scan, a heavier beat higher", () => {
    expect(beatShape("sken", 1, "dark").amplitude).toBe(6);
    expect(beatShape("reseno", 1, "dark").amplitude).toBe(10);
    expect(beatShape("promena", 1, "dark").amplitude).toBe(4);
    expect(beatAmplitude(6, 2)).toBe(12);
    expect(beatAmplitude(6, 4)).toBe(PULSE_AMPLITUDE_MAX);
    expect(beatAmplitude(4, 2)).toBe(8);
    // A weight below one never lowers a beat.
    expect(beatAmplitude(6, 0)).toBe(6);
  });

  test("`hitno` is a double spike, a solved item glows only in the dark theme", () => {
    expect(beatShape("hitno", 1, "dark").spikes).toBe(2);
    expect(beatShape("sken", 1, "dark").spikes).toBe(1);
    expect(beatShape("reseno", 1, "dark").glow).toBe(true);
    expect(beatShape("reseno", 1, "light").glow).toBe(false);
    expect(beatShape("sken", 1, "dark").glow).toBe(false);
  });

  test("the outline goes only upwards, starts and ends on the line and is 28 px wide", () => {
    for (const spikes of [1, 2] as const) {
      const points = beatPoints(9, spikes);
      expect(points[0]).toEqual([-PULSE_BEAT_WIDTH / 2, 0]);
      expect(points.at(-1)).toEqual([PULSE_BEAT_WIDTH / 2, 0]);
      for (const [, height] of points) {
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(9);
      }
      const xs = points.map(([dx]) => dx);
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
      expect(points.filter(([, height]) => height === 9)).toHaveLength(spikes);
    }
    // The two spikes of `hitno` are 10 px apart.
    const peaks = beatPoints(9, 2).filter(([, height]) => height === 9).map(([dx]) => dx);
    expect(peaks[1] - peaks[0]).toBe(10);
  });
});

describe("the last minute", () => {
  test("a beat enters at the right edge and leaves at the left one after 60 s", () => {
    expect(beatX(600, NOW, NOW)).toBe(600);
    expect(beatX(600, NOW + 30_000, NOW)).toBe(300);
    expect(beatX(600, NOW + PULSE_WINDOW_MS, NOW)).toBe(0);
  });

  test("a beat that is not due yet is not drawn; one that left the window is gone", () => {
    const beats: PulseBeat[] = [{ kind: "sken", at: NOW + 20_000, weight: 1 }, { kind: "novo", at: NOW - 10_000, weight: 1 }, { kind: "hitno", at: NOW - 80_000, weight: 1 }];
    expect(kinds(visibleBeats(beats, NOW))).toEqual(["novo"]);
    expect(kinds(visibleBeats(beats, NOW + 25_000))).toEqual(["sken", "novo"]);
    expect(kinds(pruneBeats(beats, NOW))).toEqual(["sken", "novo"]);
    expect(pruneBeats(beats, NOW + 10 * PULSE_WINDOW_MS)).toEqual([]);
  });

  test("the line is redrawn only while a beat is on it or on its way", () => {
    expect(pulseActive([], NOW)).toBe(false);
    expect(pulseActive([{ kind: "sken", at: NOW + 40_000, weight: 1 }], NOW)).toBe(true);
    expect(pulseActive([{ kind: "sken", at: NOW - 5_000, weight: 1 }], NOW)).toBe(true);
    expect(pulseActive([{ kind: "sken", at: NOW - 2 * PULSE_WINDOW_MS, weight: 1 }], NOW)).toBe(false);
  });

  test("the buffer keeps the newest 120 beats", () => {
    const many = Array.from({ length: 200 }, (_, index): PulseBeat => ({ kind: "sken", at: NOW - 200 + index, weight: 1 }));
    const kept = pruneBeats(many, NOW);
    expect(kept).toHaveLength(PULSE_BUFFER);
    expect(kept.at(-1)).toEqual(many.at(-1));
  });

  test("the energy is the events of the last 60 s over 12, between 0 and 1", () => {
    expect(pulseEnergy([], NOW)).toBe(0);
    const six = Array.from({ length: 6 }, (_, index): PulseBeat => ({ kind: "sken", at: NOW - index * 1000, weight: 1 }));
    expect(pulseEnergy(six, NOW)).toBe(0.5);
    expect(pulseEnergy([{ kind: "sken", at: NOW, weight: 240 }], NOW)).toBe(1);
    // Beats that are not due yet and beats older than a minute do not count.
    expect(pulseEnergy([{ kind: "sken", at: NOW + 1000, weight: 5 }, { kind: "sken", at: NOW - PULSE_WINDOW_MS, weight: 5 }], NOW)).toBe(0);
    expect(pulseEnergy(six, NOW + 10 * PULSE_WINDOW_MS)).toBe(0);
  });

  test("the dev demo holds one beat of every kind inside the window", () => {
    const beats = demoBeats(NOW);
    expect(kinds(beats).sort()).toEqual([...PULSE_KINDS].sort());
    expect(visibleBeats(beats, NOW)).toHaveLength(PULSE_KINDS.length);
    for (const beat of beats) expect(beatX(1000, NOW, beat.at)).toBeGreaterThan(PULSE_BEAT_WIDTH);
  });
});

describe("the store of beats", () => {
  test("it keeps the beats in time order and tells its listeners", () => {
    const store = createPulseStore();
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.push([{ kind: "novo", at: NOW + 500, weight: 1 }], NOW);
    store.push([{ kind: "sken", at: NOW, weight: 1 }], NOW);
    expect(kinds(store.beats())).toEqual(["sken", "novo"]);
    expect(calls).toBe(2);
    store.push([], NOW);
    expect(calls).toBe(2);
    off();
    store.push([{ kind: "lead", at: NOW, weight: 1 }], NOW);
    expect(calls).toBe(2);
    store.replace([]);
    expect(store.beats()).toEqual([]);
  });
});
