// ADMIN v3 V1 — the registry of the reveal engine (ZADATAK-V3 §2; plan §2.2,
// §2.3). Pure: which kinds of nodes exist, how each one enters, and when. The
// order of an entrance is not a list of groups but the place on the screen
// („Skener“): a node starts when the scan line reaches it, so the work at the
// top of the page comes first. `components/admin/reveal/admin-reveal-root.tsx`
// turns these numbers into GSAP tweens.

import { ADMIN_REVEAL, ADMIN_REVEAL_EASE } from "@/lib/admin-v2/motion";

/** `data-admin-reveal="…"`. */
export const REVEAL_KINDS = ["title", "text", "kpi", "card", "chart", "rows", "media"] as const;
export type RevealKind = (typeof REVEAL_KINDS)[number];

/** `data-admin-draw="…"`: the marks of a chart. */
export const DRAW_KINDS = ["bars", "cells", "funnel", "ring", "line"] as const;
export type DrawKind = (typeof DRAW_KINDS)[number];

export const isRevealKind = (value: string | null | undefined): value is RevealKind => (REVEAL_KINDS as readonly string[]).includes(value ?? "");
export const isDrawKind = (value: string | null | undefined): value is DrawKind => (DRAW_KINDS as readonly string[]).includes(value ?? "");

/** What a node animates from (its end is always its own resting state). */
export type RevealFrom = {
  opacity?: number;
  /** px */
  y?: number;
  scale?: number;
  /** A line of a title rises out of its mask. */
  yPercent?: number;
  /** `inset()` from the right: a tile lights up from the left. */
  clipRight?: number;
};

export type Choreography = {
  /** Seconds, before the budget of the page shortens it. */
  duration: number;
  ease: string;
  from: RevealFrom;
  /** What GSAP clears when the node has arrived, so nothing stays on the element. */
  clear: string;
};

const { out, ignite } = ADMIN_REVEAL_EASE;

/** One choreography per kind. `rows` is the choreography of one row (the container itself never moves). */
export const REVEAL_REGISTRY: Readonly<Record<RevealKind, Choreography>> = {
  title: { duration: ADMIN_REVEAL.title, ease: out, from: { yPercent: 100 }, clear: "transform" },
  text: { duration: ADMIN_REVEAL.text, ease: out, from: { opacity: 0, y: 8 }, clear: "opacity,transform" },
  kpi: { duration: ADMIN_REVEAL.kpi, ease: ignite, from: { clipRight: 100 }, clear: "clipPath" },
  card: { duration: ADMIN_REVEAL.card, ease: out, from: { opacity: 0, y: ADMIN_REVEAL.offset, scale: 0.985 }, clear: "opacity,transform" },
  chart: { duration: ADMIN_REVEAL.card, ease: out, from: { opacity: 0, y: ADMIN_REVEAL.offset, scale: 0.985 }, clear: "opacity,transform" },
  rows: { duration: ADMIN_REVEAL.row, ease: out, from: { opacity: 0, y: 8 }, clear: "opacity,transform" },
  media: { duration: ADMIN_REVEAL.media, ease: out, from: { opacity: 0 }, clear: "opacity" },
};

export type DrawChoreography = { duration: number; stagger: number; ease: string };

export const DRAW_REGISTRY: Readonly<Record<DrawKind, DrawChoreography>> = {
  bars: { duration: ADMIN_REVEAL.bar, stagger: ADMIN_REVEAL.barStagger, ease: out },
  cells: { duration: ADMIN_REVEAL.cell, stagger: ADMIN_REVEAL.cellStep, ease: out },
  funnel: { duration: ADMIN_REVEAL.funnel, stagger: ADMIN_REVEAL.funnelStagger, ease: out },
  ring: { duration: ADMIN_REVEAL.ring, stagger: 0, ease: out },
  line: { duration: ADMIN_REVEAL.line, stagger: 0, ease: out },
};

/** The base duration of anything the schedule places. */
export function revealDuration(kind: RevealKind | DrawKind): number {
  return isRevealKind(kind) ? REVEAL_REGISTRY[kind].duration : DRAW_REGISTRY[kind].duration;
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export type RevealItem = {
  kind: RevealKind | DrawKind;
  /** Place of the node inside the visible screen (px from its top left corner). */
  top: number;
  left: number;
};
export type RevealViewport = { width: number; height: number };
export type RevealScheduleOptions = {
  /** `short`: a return to a page that had its full entrance a moment ago. */
  mode?: "full" | "short";
  /** A phone: shorter, no sweep from left to right. */
  phone?: boolean;
};
export type RevealSlot = { start: number; duration: number };

/** The budget of an entrance (seconds). */
export function revealBudget(options: RevealScheduleOptions = {}): number {
  if (options.mode === "short") return ADMIN_REVEAL.short;
  return options.phone ? ADMIN_REVEAL.budget * ADMIN_REVEAL.phone.scale : ADMIN_REVEAL.budget;
}

/** How many rows of one list enter one after another; the rest is there at once. */
export function revealRowsMax(phone = false): number {
  return phone ? ADMIN_REVEAL.phone.rowsMax : ADMIN_REVEAL.rowsMax;
}

/** How long a returning node fades (seconds). */
const SHORT_FADE = 0.18;
const SHORT_SWEEP = 0.12;

/**
 * When each node starts and how long it moves. Full: the start is the place on
 * the screen (`0.50 × top / H + 0.08 × left / W`), the duration is the one of
 * the kind, cut so that everything ends inside the budget. Short: a title
 * leaves its mask in 320 ms, everything else only fades.
 */
export function revealSchedule(items: readonly RevealItem[], viewport: RevealViewport, options: RevealScheduleOptions = {}): RevealSlot[] {
  const budget = revealBudget(options);
  const height = Math.max(1, viewport.height);
  const width = Math.max(1, viewport.width);
  return items.map((item) => {
    const y = clamp01(item.top / height);
    const x = clamp01(item.left / width);
    if (options.mode === "short") {
      const start = SHORT_SWEEP * y;
      const base = item.kind === "title" ? ADMIN_REVEAL.titleShort : SHORT_FADE;
      return { start, duration: Math.min(base, budget - start) };
    }
    const start = options.phone ? ADMIN_REVEAL.phone.sweepY * y : ADMIN_REVEAL.sweepY * y + ADMIN_REVEAL.sweepX * x;
    const base = revealDuration(item.kind) * (options.phone ? ADMIN_REVEAL.phone.scale : 1);
    return { start, duration: Math.min(base, budget - start) };
  });
}

/** When the last node of a schedule has arrived (seconds). */
export function revealEnd(slots: readonly RevealSlot[]): number {
  return slots.reduce((end, slot) => Math.max(end, slot.start + slot.duration), 0);
}

/**
 * A group that enters outside the entrance of the page (a batch revealed on
 * scroll, content that arrived late): 60 ms apart, the whole group within
 * 500 ms.
 */
export function groupSchedule(kinds: readonly (RevealKind | DrawKind)[], options: { phone?: boolean } = {}): RevealSlot[] {
  const scale = options.phone ? ADMIN_REVEAL.phone.scale : 1;
  const total = ADMIN_REVEAL.scroll * scale;
  const each = kinds.length > 1 ? Math.min(0.06, (total * 0.4) / (kinds.length - 1)) : 0;
  return kinds.map((kind, index) => {
    const start = each * index;
    return { start, duration: Math.min(revealDuration(kind) * scale, total - start) };
  });
}

/**
 * A staggered group of marks (bars, the steps of a funnel) inside `available`
 * seconds: the stagger and, when there is no room, the duration give way, so
 * the last mark ends in time.
 */
export function fitStagger(count: number, duration: number, each: number, available: number): { duration: number; each: number } {
  const room = Math.max(0, available);
  if (count <= 1) return { duration: Math.min(duration, room), each: 0 };
  if (duration + each * (count - 1) <= room) return { duration, each };
  const fitted = Math.min(duration, room * 0.75);
  return { duration: fitted, each: Math.min(each, (room - fitted) / (count - 1)) };
}

export type WaveCell = { row: number; col: number };

/**
 * The wave of a matrix (dan × sat): every cell lights up after the peak by
 * its Chebyshev distance × 18 ms. The step shrinks so that the last cell has
 * arrived within `total` (500 ms). Without a peak the wave starts at the first
 * cell. Returns the delay of each cell (seconds) and how long one cell moves.
 */
export function waveDelays(cells: readonly WaveCell[], peak: WaveCell | null, options: { total?: number; phone?: boolean } = {}): { delays: number[]; duration: number } {
  const scale = options.phone ? ADMIN_REVEAL.phone.scale : 1;
  const total = Math.max(0, Math.min(options.total ?? ADMIN_REVEAL.cellWave, ADMIN_REVEAL.cellWave) * scale);
  const duration = Math.min(ADMIN_REVEAL.cell * scale, total);
  const origin = peak ?? cells[0] ?? { row: 0, col: 0 };
  const distances = cells.map((cell) => Math.max(Math.abs(cell.row - origin.row), Math.abs(cell.col - origin.col)));
  const far = Math.max(0, ...distances);
  const step = far > 0 ? Math.min(ADMIN_REVEAL.cellStep, (total - duration) / far) : 0;
  return { delays: distances.map((distance) => distance * step), duration };
}

// -----------------------------------------------------------------------------
// Counting from zero
// -----------------------------------------------------------------------------

/** A number as the admin writes it: „412“, „1.234“, „12 500“, „4,5“. */
const NUMBER = /\d+(?:[.   ]\d{3})*(?:,\d+)?/g;

function group(digits: string, separator: string): string {
  if (!separator) return digits;
  let result = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) result += separator;
    result += digits[index];
  }
  return result;
}

/** true when `countFrame` can count this text (it holds exactly one number). */
export function isCountable(text: string): boolean {
  const found = text.match(NUMBER);
  return found !== null && found.length === 1;
}

/**
 * The text of a counting number at `progress` (0–1): the one number of
 * `finalText` is replaced by the value in between, in the same format
 * (thousands separator, decimals, what stands before and after it). A text
 * with no number or with two („3/12“, „1 h 22 min“) is returned as it is, and
 * at the end the result is exactly `finalText`.
 */
export function countFrame(finalText: string, progress: number): string {
  if (!(progress < 1)) return finalText;
  const matches = [...finalText.matchAll(NUMBER)];
  if (matches.length !== 1) return finalText;
  const match = matches[0];
  const raw = match[0];
  const [whole, fraction = ""] = raw.split(",");
  const separator = /[.   ]/.exec(whole)?.[0] ?? "";
  const value = Number(`${whole.replace(/[.   ]/g, "")}${fraction ? `.${fraction}` : ""}`);
  if (!Number.isFinite(value)) return finalText;
  const current = (value * clamp01(progress)).toFixed(fraction.length);
  const [currentWhole, currentFraction = ""] = current.split(".");
  const shown = `${group(currentWhole, separator)}${currentFraction ? `,${currentFraction}` : ""}`;
  return `${finalText.slice(0, match.index)}${shown}${finalText.slice(match.index + raw.length)}`;
}
