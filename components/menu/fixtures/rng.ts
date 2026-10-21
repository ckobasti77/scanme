// Izlog fixtures: a tiny seeded PRNG (mulberry32) and key generation on top of
// it. Nothing in the fixtures may use Math.random or the clock, so the same
// call always gives the same data (stable previews, stable tests).

import { newMenuKey, type MenuKeyKind, type RandomBytes } from "@/lib/menu/keys";

export type Rng = {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
};

// The same alphabet and length as lib/menu/keys.ts (lowercase Crockford base32).
const KEY_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const KEY_LENGTH = 12;

// Keys already handed out per generator, so a collision inside one fixture
// regenerates instead of repeating.
const usedKeys = new WeakMap<Rng, Set<string>>();

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(list) {
      if (list.length === 0) throw new RangeError("rng.pick needs a non-empty list");
      return list[Math.floor(next() * list.length)];
    },
  };
  usedKeys.set(rng, new Set());
  return rng;
}

function randomBytesFrom(rng: Rng): RandomBytes {
  return (length) => Uint8Array.from({ length }, () => rng.int(0, 255));
}

function claim(rng: Rng, make: () => string): string {
  const used = usedKeys.get(rng) ?? new Set<string>();
  usedKeys.set(rng, used);
  for (;;) {
    const candidate = make();
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** A valid menu key (`ar_…`, `sc_…`, …) that is unique among the keys of this rng. */
export function fixtureKey(kind: MenuKeyKind, rng: Rng): string {
  const bytes = randomBytesFrom(rng);
  return claim(rng, () => newMenuKey(kind, bytes));
}

/** A key outside the menu model (`ps_…` positions, `zn_…` zones, `st_…` staff), unique among this rng's keys. */
export function fixturePrefixedKey(prefix: string, rng: Rng): string {
  return claim(rng, () => {
    let body = "";
    for (let index = 0; index < KEY_LENGTH; index += 1) {
      body += KEY_ALPHABET[rng.int(0, KEY_ALPHABET.length - 1)];
    }
    return `${prefix}_${body}`;
  });
}
