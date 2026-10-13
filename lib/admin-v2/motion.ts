// ADMIN v3 — the one place of the admin motion tokens (ZADATAK-V3 §2). Seconds
// for GSAP; the same values are CSS custom properties in app/globals.css
// (`--admin-dur-1…4`, `--admin-ease-out`, `--admin-ease-in`, `--admin-reveal-*`,
// `--admin-ceremony-max`, `--admin-shimmer`). Three layers:
//   interakcija — press, hover, a state change: at most 250 ms (the drawer of
//                 the frame, 320 ms, is the one written exception);
//   reveal      — the entrance of a page, its charts, the scroll: at most
//                 900 ms for the whole page, and it never blocks input;
//   ceremonija  — a level, a badge, a record: at most 1800 ms, skippable.
// The v2 limits (`ADMIN_MOTION_MAX`, `ADMIN_ENTER_OFFSET`, `ADMIN_STAGGER_TOTAL`)
// are no longer the limit of everything: they bound the interaction layer only.

// Layer 1 — interaction. The v2 values, unchanged.
export const ADMIN_DURATION = {
  /** Press, hover, colour. */
  feedback: 0.12,
  /** A state change (accordion, chip); also every exit. */
  state: 0.18,
  /** Movement inside the frame (navbar line, sidebar content, drawer in). */
  move: 0.24,
  /** A change of the frame itself. */
  frame: 0.32,
} as const;

export const ADMIN_EASE = {
  /** Entries and state changes: decelerates, no overshoot. */
  out: "power3.out",
  /** Exits: accelerates away. */
  in: "power2.in",
} as const;

/**
 * The whole stagger of one group of elements of the interaction layer never exceeds this. A staggered
 * group moves in `state` (0.18 s), so its last element ends at 0.25 s: the limit of a transition.
 */
export const ADMIN_STAGGER_TOTAL = 0.07;
/** Offset of an entering block of the interaction layer (px). */
export const ADMIN_ENTER_OFFSET = 7;
/** A pressed button; the same value is in app/globals.css. */
export const ADMIN_PRESS_SCALE = 0.98;
/** The interaction layer together with the frame (the drawer, 320 ms) stays below this (seconds). */
export const ADMIN_MOTION_MAX = 0.4;

/** The upper limit of each layer (seconds). */
export const ADMIN_LAYER_MAX = { interakcija: 0.25, reveal: 0.9, ceremonija: 1.8 } as const;

// Layer 2 — reveal (lib/admin-v2/reveal/registry.ts turns these into a schedule).
export const ADMIN_REVEAL = {
  /** The whole entrance of a page. */
  budget: 0.9,
  /** A return to a page that had its full entrance a moment ago. */
  short: 0.36,
  /** One group revealed on scroll. */
  scroll: 0.5,
  /** Content that arrives this long after the navigation still gets its choreography. */
  window: 1.2,
  /** A page has its full entrance again after this long (ms). */
  rearmMs: 20 * 60_000,
  /** Share of the screen height above which a node belongs to the entrance (below: scroll). */
  threshold: 0.92,
  /**
   * V5 — the fuse: a node that still waits below the fold this long after the navigation is put into its
   * final state without a move (as is everything that waits when the page is printed). Content never
   * depends on a trigger.
   */
  fuse: 30,
  /** The old page dims on a click that leaves it. */
  exit: 0.14,
  exitOpacity: 0.55,
  exitScale: 0.992,
  /** The dim is taken back when the path did not change this long after the click. */
  exitBack: 0.4,
  /** The scanner: the start of a node is its place on the screen (top, then left). */
  sweepY: 0.5,
  sweepX: 0.08,
  scan: 0.5,
  scanFade: 0.12,
  title: 0.5,
  titleStagger: 0.06,
  titleShort: 0.32,
  text: 0.32,
  kpi: 0.42,
  count: 0.6,
  card: 0.4,
  /** Rise of a card (px). */
  offset: 14,
  media: 0.3,
  row: 0.24,
  rowsMax: 12,
  bar: 0.45,
  barStagger: 0.03,
  cell: 0.24,
  cellStep: 0.018,
  cellWave: 0.5,
  funnel: 0.45,
  funnelStagger: 0.08,
  ring: 0.55,
  line: 0.55,
  /** A row that arrives while the page is open. */
  liveRow: 0.24,
  liveEdge: 1.2,
  /** A phone: shorter, fewer rows. */
  phone: { scale: 0.75, sweepY: 0.375, rowsMax: 8 },
} as const;

export const ADMIN_REVEAL_EASE = { out: "expo.out", ignite: "adminIgnite", in: "power2.in" } as const;
/** The one custom curve of the admin (`CustomEase.create("adminIgnite", …)`). */
export const ADMIN_IGNITE_CURVE = "0.05,0.7,0.1,1";

// Layer 3 — ceremony (V4 draws them; the limits are tested here).
export const ADMIN_CEREMONY = {
  big: { in: 0.38, hold: 0.94, out: 0.3 },
  compact: { in: 0.24, hold: 0.72, out: 0.24 },
  gap: 0.4,
  maxInRow: 2,
  /** The words under the medal come in and leave. */
  words: { in: 0.2, out: 0.16 },
  /** V5 — the medal of a big ceremony lands with a punch: from this scale, a little past 1, to 1 (curve `adminIgnite`). */
  medal: { from: 0.4, over: 1.12 },
  /** V5 — the one ring of the strike goes out as the medal lands. */
  ring: 0.7,
} as const;

/**
 * V5 — the comet of gained XP (the chain of cause): from the place of the action to the bar of the boss,
 * then into the XP chip. Ceremony layer: decoration over the screen, it never takes input. `head` and
 * `tail` are px; the rest seconds.
 */
export const ADMIN_SPARK = { toBoss: 0.25, toChip: 0.6, fade: 0.12, label: 0.9, head: 9, tail: 120, strike: 0.25, ring: 0.4 } as const;

/** Small moves of the game outside a ceremony: the damage number floats off (reveal layer), the XP bar follows its number (interaction). */
export const ADMIN_GAME_MOTION = { damagePop: 0.6, xpBar: 0.22 } as const;

/**
 * V5 — the stage of the 3D kit. `fade`: the canvas fades in over the 2D picture. „Skener pali“ (`ignite`):
 * on a full entrance the 2D picture waits as a shade (`shade` of its opacity), the scene may start
 * `igniteAfter` s after the navigation and lights up over it; a scene that is not there after
 * `igniteDeadline` s leaves the 2D picture at full strength.
 */
export const ADMIN_STAGE_MOTION = { fade: 0.3, startAfter: 1, igniteAfter: 0.35, igniteDeadline: 2.5, shade: 0.15 } as const;

/** Ambient loops (WebGL, the Pulse) draw at most this often. */
export const ADMIN_AMBIENT_FPS = 30;
/** The live edge of the screen follows `--admin-energy` this slowly (seconds; `--admin-edge-fade` in CSS). */
export const ADMIN_EDGE_FADE = 0.6;
/** The material: the light that follows the cursor (px), the magnet (px) and the tilt (degrees). */
export const ADMIN_MATERIAL = { light: 360, magnetRadius: 40, magnetMax: 6, magnetIn: 0.2, magnetOut: 0.18, tiltMax: 3, tilt: 0.15, glow: 0.12 } as const;
/** One pass of the skeleton shimmer (seconds). */
export const ADMIN_SHIMMER = 1.4;
