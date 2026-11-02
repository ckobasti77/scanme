import type { BadgeId, RankId, Rarity } from "./ids";

// ADMIN v3 V4 — the look of a medal, as pure data (plan §5.3). The signs are SVG
// path data in a 100 × 100 box (every coordinate in 8–92, centre 50, 50) that
// the 3D medal draws into a relief texture and the 2D medal draws as an SVG.
// A path is filled with the even-odd rule, so a hole is a second contour inside
// the first one and two contours of one path never overlap. This file imports
// no `three` and touches no DOM: the scene and the CSS medal both read it.

/** The sign of a medal: SVG path data in a 100 × 100 box (the centre is 50, 50), filled. */
export type MedalArt = { paths: readonly string[] };

type Point = readonly [number, number];
type Command = readonly [string, ...number[]];

// --- drawing helpers (used once, at module load) -------------------------------------

const num = (value: number) => String(Math.round(value * 10) / 10);

const poly = (points: readonly Point[]) => `${points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${num(x)} ${num(y)}`).join(" ")} Z`;

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${num(cx - rx)} ${num(cy)} A ${num(rx)} ${num(ry)} 0 1 1 ${num(cx + rx)} ${num(cy)} A ${num(rx)} ${num(ry)} 0 1 1 ${num(cx - rx)} ${num(cy)} Z`;
const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);
const ring = (cx: number, cy: number, outer: number, inner: number) => `${circle(cx, cy, outer)} ${circle(cx, cy, inner)}`;
const rect = (x: number, y: number, w: number, h: number) => `M ${num(x)} ${num(y)} H ${num(x + w)} V ${num(y + h)} H ${num(x)} Z`;

/** Commands written in a unit box (or in raw coordinates with w = h = 1), placed into the box x, y, w, h. */
const unit = (commands: readonly Command[], x: number, y: number, w: number, h: number) =>
  commands
    .map(([letter, ...values]) => (letter === "Z" ? "Z" : `${letter} ${values.map((value, index) => num(index % 2 === 0 ? x + value * w : y + value * h)).join(" ")}`))
    .join(" ");

const star = (cx: number, cy: number, outer: number, inner: number, points = 5): Point[] =>
  Array.from({ length: points * 2 }, (_, index) => {
    const angle = ((-90 + index * (180 / points)) * Math.PI) / 180;
    const radius = index % 2 === 0 ? outer : inner;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
  });

const turn = (points: readonly Point[], degrees: number, cx: number, cy: number): Point[] => {
  const cos = Math.cos((degrees * Math.PI) / 180);
  const sin = Math.sin((degrees * Math.PI) / 180);
  return points.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos] as const);
};

const mirrorX = (points: readonly Point[]): Point[] => points.map(([x, y]) => [100 - x, y] as const);
const mirrorY = (points: readonly Point[]): Point[] => points.map(([x, y]) => [x, 100 - y] as const);

/** A thin wedge from radius `from` to `to` around (cx, cy) at `degrees`. */
const ray = (cx: number, cy: number, degrees: number, from: number, to: number, half: number): Point[] => {
  const at = (angle: number, radius: number) => [cx + radius * Math.cos((angle * Math.PI) / 180), cy + radius * Math.sin((angle * Math.PI) / 180)] as const;
  return [at(degrees - half, from), at(degrees - half / 2, to), at(degrees + half / 2, to), at(degrees + half, from)];
};

const FLAME: readonly Command[] = [
  ["M", 0.5, 0],
  ["C", 0.62, 0.2, 0.96, 0.35, 0.96, 0.65],
  ["C", 0.96, 0.88, 0.76, 1, 0.5, 1],
  ["C", 0.24, 1, 0.04, 0.88, 0.04, 0.65],
  ["C", 0.04, 0.45, 0.16, 0.37, 0.24, 0.25],
  ["C", 0.28, 0.37, 0.36, 0.45, 0.43, 0.45],
  ["C", 0.43, 0.25, 0.4, 0.12, 0.5, 0],
  ["Z"],
];
const flame = (x: number, y: number, w: number, h: number) => unit(FLAME, x, y, w, h);

const BOLT: readonly Command[] = [["M", 0.62, 0], ["L", 0.12, 0.56], ["L", 0.46, 0.56], ["L", 0.3, 1], ["L", 0.9, 0.38], ["L", 0.56, 0.38], ["Z"]];
const bolt = (x: number, y: number, w: number, h: number) => unit(BOLT, x, y, w, h);

/** The handle of a cup, in raw coordinates; mirrored for the right side. */
const HANDLE: readonly Command[] = [
  ["M", 30, 24],
  ["L", 18, 24],
  ["L", 18, 34],
  ["C", 18, 46, 25, 52, 33, 54],
  ["L", 32, 47],
  ["C", 28, 45, 26, 41, 26, 34],
  ["L", 30, 34],
  ["Z"],
];

const VIEWFINDER_CORNER: readonly Point[] = [
  [14, 14],
  [36, 14],
  [36, 21],
  [21, 21],
  [21, 36],
  [14, 36],
];

const frame = (x: number, y: number, w: number, h: number, wall: number) => `${rect(x, y, w, h)} ${rect(x + wall, y + wall + 4, w - 2 * wall, h - 2 * wall - 4)}`;

/** A star with `pips` dots under it: the badge of a rank. */
const rankStar = (pips: number): MedalArt => ({
  paths: [
    poly(star(50, 42, 32, 13)),
    Array.from({ length: pips }, (_, index) => circle(50 + (index - (pips - 1) / 2) * 11, 80, 3.6)).join(" "),
  ],
});

// --- the badges ----------------------------------------------------------------------

export const BADGE_ART: Readonly<Record<BadgeId, MedalArt>> = {
  // A staircase: the first step.
  prvi_korak: {
    paths: [
      poly([
        [18, 80],
        [18, 64],
        [34, 64],
        [34, 48],
        [50, 48],
        [50, 32],
        [66, 32],
        [66, 20],
        [82, 20],
        [82, 80],
      ]),
    ],
  },
  // A crown that falls onto the ground, with two lines of its speed.
  sef_je_pao: {
    paths: [
      poly(
        turn(
          [
            [20, 66],
            [20, 38],
            [35, 52],
            [50, 28],
            [65, 52],
            [80, 38],
            [80, 66],
          ],
          24,
          50,
          50,
        ),
      ),
      rect(18, 82, 64, 5),
      `${rect(60, 12, 22, 3)} ${rect(68, 18, 16, 3)}`,
    ],
  },
  // An envelope: its frame and the fold of its flap.
  inbox_nula: {
    paths: [
      frame(14, 22, 72, 52, 6),
      poly([
        [20, 32],
        [50, 54],
        [80, 32],
        [80, 40],
        [50, 62],
        [20, 40],
      ]),
    ],
  },
  // An exclamation mark in a ring: urgent, at zero.
  nula_hitnih: {
    paths: [
      ring(50, 50, 34, 26),
      `${poly([
        [45.5, 28],
        [54.5, 28],
        [53, 56],
        [47, 56],
      ])} ${circle(50, 66, 4.5)}`,
    ],
  },
  // A half sun rising over the horizon: before noon.
  sef_pre_podne: {
    paths: [
      `M 28 62 A 22 22 0 0 1 72 62 Z ${[-160, -125, -90, -55, -20].map((angle) => poly(ray(50, 62, angle, 28, 40, 8))).join(" ")}`,
      rect(14, 68, 72, 6),
    ],
  },
  // Three bolts: the combo.
  kombo_x3: { paths: [bolt(10, 38, 24, 46), bolt(34, 14, 32, 72), bolt(66, 38, 24, 46)] },
  // A flame over five days.
  pet_u_nizu: {
    paths: [flame(30, 14, 40, 50), [22, 36, 50, 64, 78].map((x) => circle(x, 78, 4.5)).join(" ")],
  },
  // 100.
  stotka: {
    paths: [
      poly([
        [24, 28],
        [31, 28],
        [31, 72],
        [22, 72],
        [22, 40],
        [14, 44],
        [14, 36],
      ]),
      `${ellipse(52, 50, 11, 22)} ${ellipse(52, 50, 5, 15)} ${ellipse(77, 50, 11, 22)} ${ellipse(77, 50, 5, 15)}`,
    ],
  },
  // A delivery truck.
  kurir: {
    paths: [
      `${rect(10, 34, 46, 32)} ${poly([
        [58, 44],
        [74, 44],
        [88, 58],
        [88, 66],
        [58, 66],
      ])} ${poly([
        [62, 48],
        [72, 48],
        [80, 57],
        [62, 57],
      ])}`,
      `${ring(26, 72, 8, 3.2)} ${ring(72, 72, 8, 3.2)}`,
    ],
  },
  operater: rankStar(2),
  dispecer: rankStar(3),
  // One big flame with a cut-out, and a small flame on each side.
  dvadeset_u_nizu: {
    paths: [`${flame(34, 14, 32, 66)} ${flame(43.6, 48.3, 12.8, 25.1)}`, flame(12, 44, 22, 36), flame(66, 44, 22, 36)],
  },
  // A cup.
  prvi_u_nedelji: {
    paths: [
      "M 30 18 H 70 V 40 C 70 54 61 62 50 62 C 39 62 30 54 30 40 Z",
      `${unit(HANDLE, 0, 0, 1, 1)} ${unit(HANDLE, 100, 0, -1, 1)}`,
      `${rect(44, 62, 12, 12)} ${rect(32, 74, 36, 8)}`,
    ],
  },
  komandant: rankStar(4),
  // A week calendar with five days marked.
  savrsena_nedelja: {
    paths: [frame(14, 22, 72, 60, 6), [24, 35, 46, 57, 68].map((x) => rect(x, 51, 9, 9)).join(" "), `${rect(28, 14, 6, 14)} ${rect(66, 14, 6, 14)}`],
  },
  legenda: rankStar(5),
  // A hall with a flag, a door and two windows.
  sajam_spreman: {
    paths: [
      `${poly([
        [10, 46],
        [50, 18],
        [90, 46],
        [90, 82],
        [10, 82],
      ])} ${rect(40, 58, 20, 24)} ${rect(18, 56, 14, 12)} ${rect(68, 56, 14, 12)}`,
      `${rect(49, 8, 2, 10)} ${poly([
        [51, 8],
        [62, 11.5],
        [51, 15],
      ])}`,
    ],
  },
  // A person and a plus: a new lead.
  prvi_lead: {
    paths: [
      `${circle(50, 32, 13)} M 20 80 C 20 60 32 52 50 52 C 68 52 80 60 80 80 Z`,
      poly([
        [73, 15],
        [79, 15],
        [79, 21],
        [85, 21],
        [85, 27],
        [79, 27],
        [79, 33],
        [73, 33],
        [73, 27],
        [67, 27],
        [67, 21],
        [73, 21],
      ]),
    ],
  },
  // A clock with its crown.
  rekord_sata: {
    paths: [
      ring(50, 54, 32, 25),
      poly([
        [47, 34],
        [53, 34],
        [53, 51],
        [68, 51],
        [68, 57],
        [47, 57],
      ]),
      rect(43, 10, 14, 6),
    ],
  },
  // The corners of a viewfinder and a scan line.
  sto_skenova: {
    paths: [
      [VIEWFINDER_CORNER, mirrorX(VIEWFINDER_CORNER), mirrorY(VIEWFINDER_CORNER), mirrorY(mirrorX(VIEWFINDER_CORNER))].map((points) => poly(points)).join(" "),
      rect(20, 46, 60, 8),
    ],
  },
};

// --- the ranks: one to five chevrons ---------------------------------------------------

const chevrons = (count: number): MedalArt => {
  const total = 30 + 13 * (count - 1);
  const first = 50 - total / 2 + 12;
  return {
    paths: [
      Array.from({ length: count }, (_, index) => {
        const cy = first + index * 13;
        return poly([
          [18, cy + 8],
          [50, cy - 12],
          [82, cy + 8],
          [82, cy + 18],
          [50, cy - 2],
          [18, cy + 18],
        ]);
      }).join(" "),
    ],
  };
};

export const RANK_ART: Readonly<Record<RankId, MedalArt>> = {
  pripravnik: chevrons(1),
  operater: chevrons(2),
  dispecer: chevrons(3),
  komandant: chevrons(4),
  legenda: chevrons(5),
};

// --- material and colour ----------------------------------------------------------------

export type MedalMaterial = "matte" | "metal" | "holo" | "holo-glow";

const MATERIAL: Record<Rarity, MedalMaterial> = { obicna: "matte", retka: "metal", epska: "holo", legendarna: "holo-glow" };

/** The rarity is read in the material: common is matte, rare metal, epic holographic, legendary holographic with a glow. */
export function medalMaterial(rarity: Rarity): MedalMaterial {
  return MATERIAL[rarity];
}

export type MedalPalette = { base: string; rim: string; sign: string };
type MedalTheme = "light" | "dark";

const PALETTE: Record<Rarity, Record<MedalTheme, MedalPalette>> = {
  obicna: {
    light: { base: "#a9b2ac", rim: "#8a948e", sign: "#c9d1cc" },
    dark: { base: "#59625c", rim: "#79837d", sign: "#8a948e" },
  },
  retka: {
    light: { base: "#b8890f", rim: "#8f6a0a", sign: "#e0c36a" },
    dark: { base: "#d4a93c", rim: "#f0cf72", sign: "#fff0b8" },
  },
  epska: {
    light: { base: "#9aa3c9", rim: "#6f78a8", sign: "#d8def6" },
    dark: { base: "#8f99c7", rim: "#c0c8f2", sign: "#eef1ff" },
  },
  legendarna: {
    light: { base: "#d2a53a", rim: "#a67a14", sign: "#fff0c2" },
    dark: { base: "#f0c95a", rim: "#ffe39a", sign: "#fff7dc" },
  },
};

const LOCKED: Record<MedalTheme, MedalPalette> = {
  light: { base: "#4a504d", rim: "#868d89", sign: "#3b403d" },
  dark: { base: "#171b19", rim: "#5f6761", sign: "#2a302d" },
};

/** The base colours of a medal by rarity and theme (hex), used by the shader and by the 2D medal. */
export function medalPalette(rarity: Rarity, theme: MedalTheme): MedalPalette {
  return PALETTE[rarity][theme];
}

/** A locked badge is a dark silhouette: the same in every rarity, only the theme changes. */
export function lockedPalette(theme: MedalTheme): MedalPalette {
  return LOCKED[theme];
}

// --- the hand on the medal ------------------------------------------------------------------

export const MEDAL_TILT_MAX_DEG = 8;

const unitRange = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0);

/**
 * The lean of a medal after the pointer (−1…1 from the centre of the canvas, y up; outside the range it is cut):
 * `y` turns it about the upright axis towards the pointer, `x` about the horizontal one (a pointer above lifts its face).
 * Degrees, at most `MEDAL_TILT_MAX_DEG`.
 */
export function medalTilt(pointerX: number, pointerY: number): { x: number; y: number } {
  return { x: (0 - unitRange(pointerY)) * MEDAL_TILT_MAX_DEG, y: unitRange(pointerX) * MEDAL_TILT_MAX_DEG };
}

/** The speed falls by half every 0.35 s. */
const SPIN_HALF_LIFE_S = 0.35;
/** Below this speed (rad/s) a medal stands still. */
const SPIN_STOP = 0.02;
const SPIN_TAU = SPIN_HALF_LIFE_S / Math.LN2;

/**
 * The inertia of a medal let go by the hand: the speed (rad/s) decays exponentially and the angle is advanced by the exact integral of it,
 * so one step of 0.1 s and ten of 0.01 s end in the same place. Under 0.02 rad/s it stops (velocity 0); a step that crosses that speed
 * advances the angle only to the point where it was reached.
 */
export function spinStep(angle: number, velocity: number, dt: number): { angle: number; velocity: number } {
  const speed = Math.abs(velocity);
  if (!(dt > 0) || speed < SPIN_STOP) return { angle, velocity: speed < SPIN_STOP ? 0 : velocity };
  const direction = Math.sign(velocity);
  const left = speed * Math.exp(-dt / SPIN_TAU);
  if (left < SPIN_STOP) return { angle: angle + direction * SPIN_TAU * (speed - SPIN_STOP), velocity: 0 };
  return { angle: angle + direction * SPIN_TAU * (speed - left), velocity: direction * left };
}
