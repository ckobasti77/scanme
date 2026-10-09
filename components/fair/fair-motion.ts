// JS mirror of the fair motion tokens in app/sajam/fair-event.css
// (docs/events/sajam-automobila-2026/FAIR-DESIGN-DNA.md §8), for framer-motion.
// Seconds, because framer-motion takes seconds.

export const FAIR_DURATION = {
  /** Press, hover, colour. */
  feedback: 0.12,
  /** A state change; also every exit. */
  state: 0.2,
  /** Overlay and layout: sheet, results, list, map camera. */
  overlay: 0.32,
  /** The one focal moment of a view. */
  focal: 0.48,
  /** One step of a list cascade (whole cascade ≤ 0.2). */
  stagger: 0.04,
} as const;

export const FAIR_EASE = {
  /** Arrivals and state changes: decelerates, no overshoot. */
  enter: [0.16, 1, 0.3, 1],
  /** Exits: accelerates away, shorter than the entry. */
  exit: [0.4, 0, 1, 1],
  /** Movement across the screen. */
  move: [0.65, 0, 0.35, 1],
} as const;
