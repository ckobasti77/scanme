// ADMIN v2 — the one place of the admin motion tokens (ZADATAK §7). Seconds
// for GSAP; the same values are CSS custom properties in app/globals.css
// (`--admin-dur-1…4`, `--admin-ease-out`, `--admin-ease-in`). Exits are
// shorter than entries; nothing in the admin runs longer than `frame`.

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
 * The whole stagger of one group of elements never exceeds this. A staggered group moves in `state`
 * (0.18 s), so its last element ends at 0.25 s: the limit of a transition (ZADATAK §1).
 */
export const ADMIN_STAGGER_TOTAL = 0.07;
/** Offset of an entering block (px). */
export const ADMIN_ENTER_OFFSET = 7;
/** A pressed button (ZADATAK §7); the same value is in app/globals.css. */
export const ADMIN_PRESS_SCALE = 0.98;
/** Nothing in the admin moves longer than this (seconds); the tokens above stay below it. */
export const ADMIN_MOTION_MAX = 0.4;
/** Offset of an entering page inside the screen (px). */
export const ADMIN_PAGE_OFFSET = 6;
