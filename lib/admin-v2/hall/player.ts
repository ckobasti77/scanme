import type { TimelapsePlayer } from "./types";

// ADMIN v3 V3 — the player of the Vremeplov (ZADATAK-V3 §3.2), pure. A moment
// `t` is hours from the start of the first hour of the day's series (0 … `end`).
// „Premotaj dan“ plays the whole day in about 12 seconds; a pause, a move of
// the slider and „Uživo“ work at any moment. The 3D scene and the controls
// both compute `t` from the same player and the same clock, so they never
// disagree and nothing has to be sent between them every frame.

/** The whole day takes this long (ms), whatever its length. */
export const TIMELAPSE_PLAY_MS = 12_000;
/** The numbers and the rank beside the hall follow the replay this often (ms): plain text, four times a second. */
export const TIMELAPSE_TEXT_MS = 250;

const clamp = (value: number, end: number) => Math.min(Math.max(0, end), Math.max(0, Number.isFinite(value) ? value : 0));

/** The moment a replay that started at `fromT` has reached after `elapsedMs`; it stops at `end`. */
export function playT(fromT: number, elapsedMs: number, end: number): number {
  if (!(end > 0)) return 0;
  return clamp(fromT + (Math.max(0, elapsedMs) / TIMELAPSE_PLAY_MS) * end, end);
}

/**
 * The moment the player shows at `now` (the clock of `performance.now()`); null = the live picture.
 * Without motion (reduced motion, the quiet mode) a replay does not glide: it jumps hour by hour.
 */
export function playerT(player: TimelapsePlayer, now: number, end: number, motion = true): number | null {
  if (player.mode === "live") return null;
  if (player.mode === "paused") return clamp(player.t, end);
  const t = playT(player.fromT, now - player.startedAt, end);
  return motion || t >= end ? t : Math.floor(t);
}

/** A replay that has reached the end of the day is over. */
export function playerDone(player: TimelapsePlayer, now: number, end: number): boolean {
  return player.mode === "playing" && playT(player.fromT, now - player.startedAt, end) >= end;
}

export type PlayerAction =
  /** „Premotaj dan“ / „Pauza“. */
  | { type: "toggle" }
  /** The slider (or `?vremeplov=<hour>`): a moment of the day. */
  | { type: "seek"; t: number }
  /** „Uživo“, and a change of the day. */
  | { type: "live" }
  /** The replay has reached the end: it stays there, paused. */
  | { type: "finish" };

export function playerReduce(player: TimelapsePlayer, action: PlayerAction, context: { now: number; end: number }): TimelapsePlayer {
  const { now, end } = context;
  switch (action.type) {
    case "live":
      return { mode: "live" };
    case "seek":
      return { mode: "paused", t: clamp(action.t, end) };
    case "finish":
      return player.mode === "playing" ? { mode: "paused", t: clamp(end, end) } : player;
    case "toggle": {
      if (!(end > 0)) return player;
      if (player.mode === "playing") return { mode: "paused", t: playT(player.fromT, now - player.startedAt, end) };
      // From the live picture and from the end of the day the replay starts at the opening; a pause goes on from where it stood.
      const from = player.mode === "paused" && player.t < end ? player.t : 0;
      return { mode: "playing", fromT: from, startedAt: now };
    }
  }
}

/**
 * Where a key of the slider moves the moment: the arrows by one whole hour, Page Up / Down by three,
 * Home and End to the opening and the end of the day. null = not a key of the slider.
 */
export function seekByKey(key: string, t: number, end: number): number | null {
  const at = clamp(t, end);
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(Math.floor(at + 1e-9) + 1, end);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(Math.ceil(at - 1e-9) - 1, end);
    case "PageUp":
      return clamp(Math.floor(at + 1e-9) + 3, end);
    case "PageDown":
      return clamp(Math.ceil(at - 1e-9) - 3, end);
    case "Home":
      return 0;
    case "End":
      return clamp(end, end);
    default:
      return null;
  }
}

/** The slider gives any position; the moment it means is the nearest whole hour (or the end of an open day). */
export function seekByPosition(position: number, end: number): number {
  const whole = Math.round(Number.isFinite(position) ? position : 0);
  return clamp(whole > end ? end : whole, end);
}
