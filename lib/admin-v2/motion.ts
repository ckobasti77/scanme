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

/** The whole stagger of one group of elements never exceeds this. */
export const ADMIN_STAGGER_TOTAL = 0.12;
/** Offset of an entering block (px). */
export const ADMIN_ENTER_OFFSET = 7;
