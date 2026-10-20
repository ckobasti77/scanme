// ADMIN v3 V1 — the Pulse of the system (ZADATAK-V3 §2; plan §3): the thin
// EKG line on the bottom edge of the navbar. Pure: how the numbers the admin
// already reads (the HUD of the fair, the counts of „Za reakciju“) become
// beats, what a beat looks like and how lively the last minute was. A calm
// line means a calm system. Nothing here draws; `components/admin/frame/
// admin-pulse.tsx` does.

/** `reseno` comes only from the admin's own journal of actions (V4), never from a falling count. */
export const PULSE_KINDS = ["sken", "reseno", "promena", "novo", "hitno", "lead"] as const;
export type PulseKind = (typeof PULSE_KINDS)[number];

export type PulseBeat = {
  kind: PulseKind;
  /** When the beat is drawn (ms); scans of one read are spread over the next minute, so it may be ahead of now. */
  at: number;
  /** How many events the beat stands for. */
  weight: number;
};

/** The line shows the last minute. */
export const PULSE_WINDOW_MS = 60_000;
/** The scans of one read are spread over the time to the next one (the HUD is read every 60 s). */
export const PULSE_SPREAD_MS = 55_000;
/** More scans than this in one read: this many beats, each standing for more scans. */
export const PULSE_MAX_SCAN_BEATS = 24;
/** The store keeps at most this many beats. */
export const PULSE_BUFFER = 120;
/** This many events in a minute is full energy. */
export const PULSE_ENERGY_FULL = 12;
/** No beat is higher than this (px): the canvas of 20 px stays under the text of the links. */
export const PULSE_AMPLITUDE_MAX = 12;
/** Width of one beat (px). */
export const PULSE_BEAT_WIDTH = 28;
/** Height of the canvas (px). */
export const PULSE_HEIGHT = 20;

/** What the frame knows at one read; null: that number is not available now. */
export type PulseRead = {
  scansToday: number | null;
  /** The scan count is partial („412+“): its difference is not known. */
  scansCapped: boolean;
  leadsToday: number | null;
  /** Open items of „Za reakciju“. */
  total: number | null;
  urgent: number | null;
};

export const EMPTY_PULSE_READ: PulseRead = { scansToday: null, scansCapped: false, leadsToday: null, total: null, urgent: null };

const rise = (previous: number | null, next: number | null) => (previous === null || next === null ? 0 : next - previous);

/**
 * The beats between two reads. The first read is the state, not news: no
 * beat. New scans become beats spread evenly over the next 55 s; new leads one
 * beat; a rising urgent count `hitno`, a rising total `novo`, a falling total
 * `promena` (neutral: an item may also have been postponed).
 */
export function pulseFromReads(previous: PulseRead | null, next: PulseRead, now: number): PulseBeat[] {
  if (!previous) return [];
  const beats: PulseBeat[] = [];

  const scans = previous.scansCapped || next.scansCapped ? 0 : rise(previous.scansToday, next.scansToday);
  if (scans > 0) {
    const count = Math.min(scans, PULSE_MAX_SCAN_BEATS);
    for (let index = 0; index < count; index += 1) {
      beats.push({ kind: "sken", at: now + Math.round((index * PULSE_SPREAD_MS) / count), weight: scans / count });
    }
  }

  const leads = rise(previous.leadsToday, next.leadsToday);
  if (leads > 0) beats.push({ kind: "lead", at: now, weight: leads });

  const urgent = Math.max(0, rise(previous.urgent, next.urgent));
  const total = rise(previous.total, next.total);
  if (urgent > 0) beats.push({ kind: "hitno", at: now, weight: urgent });
  if (total - urgent > 0) beats.push({ kind: "novo", at: now, weight: total - urgent });
  if (total < 0) beats.push({ kind: "promena", at: now, weight: -total });

  return beats;
}

/** The beat of an item the admin solved (from the journal of their own actions; V4 sends it). */
export function resolvedBeat(at: number, weight = 1): PulseBeat {
  return { kind: "reseno", at, weight: Math.max(1, weight) };
}

export type PulseTheme = "light" | "dark";

export type BeatShape = {
  /** The CSS custom property of the colour. */
  color: string;
  /** Height of the spike (px), upwards only. */
  amplitude: number;
  spikes: 1 | 2;
  /** A soft glow under the line (the dark theme only). */
  glow: boolean;
};

const BASE: Readonly<Record<PulseKind, { amplitude: number; spikes: 1 | 2; dark: string; light: string }>> = {
  // #6FC05D on a light surface has a contrast of about 2:1, so the light theme draws the darker success green.
  sken: { amplitude: 6, spikes: 1, dark: "--admin-nav-line", light: "--admin-success" },
  reseno: { amplitude: 10, spikes: 1, dark: "--admin-nav-line", light: "--admin-success" },
  promena: { amplitude: 4, spikes: 1, dark: "--admin-text-muted", light: "--admin-text-muted" },
  novo: { amplitude: 7, spikes: 1, dark: "--admin-warning", light: "--admin-warning" },
  hitno: { amplitude: 9, spikes: 2, dark: "--admin-danger", light: "--admin-danger" },
  lead: { amplitude: 9, spikes: 1, dark: "--admin-chart-1", light: "--admin-chart-1" },
};

/** `base × (1 + log2(weight))`, never above 12 px. */
export function beatAmplitude(base: number, weight: number): number {
  return Math.min(PULSE_AMPLITUDE_MAX, base * (1 + Math.log2(Math.max(1, weight))));
}

export function beatShape(kind: PulseKind, weight: number, theme: PulseTheme): BeatShape {
  const base = BASE[kind];
  return { color: base[theme], amplitude: beatAmplitude(base.amplitude, weight), spikes: base.spikes, glow: kind === "reseno" && theme === "dark" };
}

/** Where a beat stands: the right edge is now, the left one a minute ago. */
export function beatX(width: number, now: number, at: number): number {
  return width - ((now - at) * width) / PULSE_WINDOW_MS;
}

/** How long a beat is still on the line after it left the window (its own width, on the narrowest canvas). */
const TAIL_MS = 6_000;

/** The beats the line shows at `now`: already due and not yet out of the window. */
export function visibleBeats(beats: readonly PulseBeat[], now: number): PulseBeat[] {
  return beats.filter((beat) => beat.at <= now && now - beat.at < PULSE_WINDOW_MS + TAIL_MS);
}

/** Drops what left the window and keeps at most 120 beats (the newest ones). */
export function pruneBeats(beats: readonly PulseBeat[], now: number): PulseBeat[] {
  const kept = beats.filter((beat) => now - beat.at < PULSE_WINDOW_MS + TAIL_MS);
  return kept.length > PULSE_BUFFER ? kept.slice(kept.length - PULSE_BUFFER) : kept;
}

/** true while a beat is on the line or about to arrive: only then the line needs to be redrawn. */
export function pulseActive(beats: readonly PulseBeat[], now: number): boolean {
  return beats.some((beat) => now - beat.at < PULSE_WINDOW_MS + TAIL_MS);
}

/** How lively the last minute was, 0–1: the events of the last 60 s over 12. */
export function pulseEnergy(beats: readonly PulseBeat[], now: number): number {
  let events = 0;
  for (const beat of beats) {
    if (beat.at <= now && now - beat.at < PULSE_WINDOW_MS) events += Math.max(1, beat.weight);
  }
  return Math.min(1, events / PULSE_ENERGY_FULL);
}

/**
 * The outline of one beat as offsets from its centre: `[dx, height]` in px,
 * height upwards. One spike: a small rise (15 %), the sharp peak, a small echo
 * (25 %), the return. `hitno`: two spikes 10 px apart.
 */
export function beatPoints(amplitude: number, spikes: 1 | 2): ReadonlyArray<readonly [number, number]> {
  const half = PULSE_BEAT_WIDTH / 2;
  if (spikes === 2) {
    return [[-half, 0], [-7, 0], [-5, amplitude], [-3, 0], [3, 0], [5, amplitude], [7, 0], [half, 0]];
  }
  return [[-half, 0], [-9, amplitude * 0.15], [-5, 0], [-1, amplitude], [3, 0], [7, amplitude * 0.25], [11, 0], [half, 0]];
}

/** Dev (`?puls=demo`): one beat of every kind, frozen across the line. */
export function demoBeats(now: number): PulseBeat[] {
  return PULSE_KINDS.map((kind, index) => ({ kind, at: now - Math.round((1 - (0.12 + index * 0.15)) * PULSE_WINDOW_MS), weight: kind === "sken" ? 3 : 1 }));
}

/** The beats of this tab: the feed pushes, the canvas reads. */
export function createPulseStore() {
  let beats: PulseBeat[] = [];
  const listeners = new Set<() => void>();
  return {
    push(next: readonly PulseBeat[], now: number) {
      if (!next.length) return;
      beats = pruneBeats([...beats, ...next].sort((a, b) => a.at - b.at), now);
      for (const listener of listeners) listener();
    },
    replace(next: readonly PulseBeat[]) {
      beats = [...next];
      for (const listener of listeners) listener();
    },
    beats: () => beats,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type PulseStore = ReturnType<typeof createPulseStore>;

export const pulseStore = createPulseStore();
