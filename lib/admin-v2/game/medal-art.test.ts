import { describe, expect, test } from "vitest";
import { BADGE_IDS, RANK_IDS, RARITIES } from "./ids";
import { BADGE_ART, MEDAL_TILT_MAX_DEG, RANK_ART, lockedPalette, medalMaterial, medalPalette, medalTilt, spinStep, type MedalArt } from "./medal-art";

// ADMIN v3 V4 — the signs, the materials and the hand on the medal: pure data and
// two small physics functions, so they are proven here without WebGL.

const ARGUMENTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };
const LOW = 8;
const HIGH = 92;

/** Walks a path: only the allowed commands, every coordinate in the box (the radii and flags of an arc are checked as such). */
function problems(d: string): string[] {
  const found: string[] = [];
  if (!/^M/.test(d)) found.push("does not start with M");
  if (/[^MLHVCQAZ0-9 .\-]/.test(d)) found.push("has a character that is not allowed");
  const tokens = d.match(/[MLHVCQAZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let command = "";
  let values: number[] = [];
  const check = () => {
    if (command === "") return;
    const size = ARGUMENTS[command];
    if (size === 0) {
      if (values.length !== 0) found.push("Z with arguments");
      return;
    }
    if (values.length === 0 || values.length % size !== 0) {
      found.push(`${command} has ${values.length} numbers`);
      return;
    }
    for (let at = 0; at < values.length; at += size) {
      const group = values.slice(at, at + size);
      if (command === "A") {
        const [rx, ry, , large, sweep, x, y] = group;
        if (!(rx > 0 && rx <= 50 && ry > 0 && ry <= 50)) found.push("an arc radius is out of range");
        if (![0, 1].includes(large) || ![0, 1].includes(sweep)) found.push("an arc flag is not 0 or 1");
        if (x < LOW || x > HIGH || y < LOW || y > HIGH) found.push(`an arc ends at ${x} ${y}`);
      } else {
        for (const value of group) if (value < LOW || value > HIGH) found.push(`${command} has ${value}`);
      }
    }
  };
  for (const token of tokens) {
    if (/[A-Z]/.test(token)) {
      check();
      command = token;
      values = [];
    } else values.push(Number(token));
  }
  check();
  return found;
}

const signOf = (art: MedalArt) => art.paths.join("|");

describe("the checker of a path", () => {
  test("it sees a coordinate out of the box, a path without M, a stray character and a short command", () => {
    expect(problems("M 10 10 L 90 90 Z")).toEqual([]);
    expect(problems("M 5 10 L 90 90 Z")).not.toEqual([]);
    expect(problems("M 10 10 L 90 93 Z")).not.toEqual([]);
    expect(problems("L 10 10 Z")).not.toEqual([]);
    expect(problems("M 10 10 l 20 20 Z")).not.toEqual([]);
    expect(problems("M 10 10 L 20 Z")).not.toEqual([]);
    expect(problems("M 10 10 A 20 20 0 2 1 40 40 Z")).not.toEqual([]);
  });
});

describe("the signs of the badges", () => {
  test("every one of the twenty badges has a sign of one to three paths", () => {
    expect(BADGE_IDS).toHaveLength(20);
    for (const id of BADGE_IDS) {
      const art = BADGE_ART[id];
      expect(art, id).toBeDefined();
      expect(art.paths.length, id).toBeGreaterThanOrEqual(1);
      expect(art.paths.length, id).toBeLessThanOrEqual(3);
      for (const path of art.paths) expect(path.length, id).toBeGreaterThan(10);
    }
  });

  test("every path starts with M, uses only the allowed commands and keeps every coordinate in 8–92", () => {
    for (const id of BADGE_IDS) for (const path of BADGE_ART[id].paths) expect(problems(path), `${id}: ${path}`).toEqual([]);
    for (const id of RANK_IDS) for (const path of RANK_ART[id].paths) expect(problems(path), `${id}: ${path}`).toEqual([]);
  });

  test("no two badges share a sign", () => {
    const signs = BADGE_IDS.map((id) => signOf(BADGE_ART[id]));
    expect(new Set(signs).size).toBe(BADGE_IDS.length);
  });
});

describe("the signs of the ranks", () => {
  test("five ranks, five different signs, each a bigger stack of chevrons", () => {
    expect(RANK_IDS).toHaveLength(5);
    const signs = RANK_IDS.map((id) => signOf(RANK_ART[id]));
    expect(new Set(signs).size).toBe(5);
    // One chevron is six points: M plus five L, and a Z.
    RANK_IDS.forEach((id, index) => {
      const path = RANK_ART[id].paths[0];
      expect(path.match(/M/g), id).toHaveLength(index + 1);
    });
  });
});

describe("medalMaterial", () => {
  test("common is matte, rare metal, epic holographic, legendary holographic with a glow", () => {
    expect(medalMaterial("obicna")).toBe("matte");
    expect(medalMaterial("retka")).toBe("metal");
    expect(medalMaterial("epska")).toBe("holo");
    expect(medalMaterial("legendarna")).toBe("holo-glow");
  });
});

describe("medalPalette", () => {
  const HEX = /^#[0-9a-f]{6}$/i;

  test("every rarity in both themes gives three hex colours", () => {
    for (const rarity of RARITIES) {
      for (const theme of ["light", "dark"] as const) {
        const palette = medalPalette(rarity, theme);
        expect(palette.base, `${rarity} ${theme}`).toMatch(HEX);
        expect(palette.rim, `${rarity} ${theme}`).toMatch(HEX);
        expect(palette.sign, `${rarity} ${theme}`).toMatch(HEX);
      }
    }
  });

  test("the rarities are told apart by their base colour in each theme", () => {
    for (const theme of ["light", "dark"] as const) {
      const bases = RARITIES.map((rarity) => medalPalette(rarity, theme).base);
      expect(new Set(bases).size, theme).toBe(RARITIES.length);
    }
  });

  test("the locked silhouette has its own dark colours in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const palette = lockedPalette(theme);
      for (const colour of [palette.base, palette.rim, palette.sign]) expect(colour).toMatch(HEX);
    }
    expect(lockedPalette("dark").base).not.toBe(lockedPalette("light").base);
  });
});

describe("medalTilt", () => {
  test("the pointer at the edge leans the medal by 8 degrees, at the centre not at all", () => {
    expect(MEDAL_TILT_MAX_DEG).toBe(8);
    expect(medalTilt(0, 0)).toEqual({ x: 0, y: 0 });
    expect(medalTilt(1, 0)).toEqual({ x: 0, y: 8 });
    expect(medalTilt(-1, 0)).toEqual({ x: 0, y: -8 });
    // A pointer above the centre lifts the face: about the horizontal axis, against the sign of y.
    expect(medalTilt(0, 1)).toEqual({ x: -8, y: 0 });
    expect(medalTilt(0, -1)).toEqual({ x: 8, y: 0 });
  });

  test("it grows with the pointer", () => {
    expect(medalTilt(0.5, 0).y).toBeCloseTo(4, 10);
    expect(medalTilt(0, 0.25).x).toBeCloseTo(-2, 10);
  });

  test("a pointer outside −1…1 is cut, and a number that is not finite means no lean", () => {
    expect(medalTilt(9, -9)).toEqual({ x: 8, y: 8 });
    expect(medalTilt(-40, 40)).toEqual({ x: -8, y: -8 });
    expect(medalTilt(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });
});

describe("spinStep", () => {
  const run = (velocity: number, steps: number, dt: number, angle = 0) => {
    let state = { angle, velocity };
    for (let step = 0; step < steps; step += 1) state = spinStep(state.angle, state.velocity, dt);
    return state;
  };

  test("the speed falls by half every 0.35 s and the medal keeps turning in the same direction", () => {
    const after = spinStep(0, 4, 0.35);
    expect(after.velocity).toBeCloseTo(2, 10);
    expect(after.angle).toBeGreaterThan(0);
    // Half the speed after one half-life: the angle is the area under the curve, 4 × τ × (1 − ½).
    expect(after.angle).toBeCloseTo((4 * 0.35) / Math.LN2 / 2, 10);
    expect(spinStep(0, -4, 0.35)).toEqual({ angle: -after.angle, velocity: -after.velocity });
  });

  test("it never speeds up and never turns back", () => {
    let state = { angle: 0, velocity: 6 };
    for (let step = 0; step < 400; step += 1) {
      const next = spinStep(state.angle, state.velocity, 1 / 30);
      expect(Math.abs(next.velocity)).toBeLessThanOrEqual(Math.abs(state.velocity));
      expect(next.angle).toBeGreaterThanOrEqual(state.angle);
      state = next;
    }
  });

  test("under 0.02 rad/s it stops: the speed is exactly 0 and the angle stays", () => {
    expect(spinStep(1.5, 0.019, 1 / 30)).toEqual({ angle: 1.5, velocity: 0 });
    expect(spinStep(1.5, -0.019, 1 / 30)).toEqual({ angle: 1.5, velocity: 0 });
    const end = run(3, 600, 1 / 30);
    expect(end.velocity).toBe(0);
    // It stopped: another second changes nothing.
    expect(spinStep(end.angle, end.velocity, 1)).toEqual(end);
  });

  test("the total turn of a fling is the same however the frames fall (1 × 0.1 s = 10 × 0.01 s)", () => {
    for (const velocity of [0.5, 3, -7.5]) {
      const one = run(velocity, 1, 0.1, 0.4);
      const ten = run(velocity, 10, 0.01, 0.4);
      expect(ten.angle).toBeCloseTo(one.angle, 6);
      expect(ten.velocity).toBeCloseTo(one.velocity, 6);
    }
  });

  test("also across the moment it stops, and for a long run in frames of 33 ms or 8 ms", () => {
    const slow = run(0.05, 1, 3, 0);
    const fine = run(0.05, 300, 0.01, 0);
    expect(fine.velocity).toBe(0);
    expect(slow.velocity).toBe(0);
    expect(fine.angle).toBeCloseTo(slow.angle, 6);
    const a = run(5, 200, 1 / 30);
    const b = run(5, 800, 1 / 120);
    expect(a.angle).toBeCloseTo(b.angle, 6);
    // The whole fling is the speed over the decay rate, less what is left when it stops.
    expect(a.angle).toBeCloseTo((0.35 / Math.LN2) * (5 - 0.02), 6);
  });

  test("a step of no time, or a negative one, changes nothing", () => {
    expect(spinStep(1, 2, 0)).toEqual({ angle: 1, velocity: 2 });
    expect(spinStep(1, 2, -0.5)).toEqual({ angle: 1, velocity: 2 });
  });
});
