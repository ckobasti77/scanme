// ScanMe Menu V1 (K25) — the time of a reservation on the waiter panel
// (master §10.4: "Za rezervaciju se prikazuje planirano vreme i live kašnjenje
// nakon početka termina. Tek nakon podešenog praga … stanje postaje crveno";
// §11.5; plan docs/meni/planovi/K24.md K24-10).
//
// The threshold of a reservation is how long the venue holds it after its
// time (`holdMinutes`, set by the manager in Podešavanja, 15 by default), not
// the late threshold of requests. Before the time nothing ticks; from the
// time a neutral "kasni mm:ss" runs; after the hold it turns red (with the
// panel's calm pulse). Nothing is cancelled and no table is freed on its own.

import { elapsedSeconds, formatElapsed } from "./elapsed-time";

export const DEFAULT_RESERVATION_HOLD_MIN = 15;
export const RESERVATION_HOLD_MIN = 5;
export const RESERVATION_HOLD_MAX = 180;
/** "Uskoro": an accepted reservation whose time is at most this far ahead. */
export const RESERVATION_SOON_MIN = 120;

export function isValidReservationHold(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= RESERVATION_HOLD_MIN && minutes <= RESERVATION_HOLD_MAX;
}

/** The stored hold, or the default when it is absent or broken. */
export function reservationHoldOf(stored: number | null | undefined): number {
  return typeof stored === "number" && isValidReservationHold(stored) ? stored : DEFAULT_RESERVATION_HOLD_MIN;
}

/**
 * `kasnije`: more than two hours ahead; `uskoro`: within two hours;
 * `u-terminu`: the time has come, the hold still runs; `kasni`: past the hold.
 */
export type ReservationPhase = "kasnije" | "uskoro" | "u-terminu" | "kasni";

export type ReservationTiming = {
  phase: ReservationPhase;
  /** Seconds since the reservation's time; null before it. */
  lateSeconds: number | null;
};

export function reservationTiming(requestedAt: number, holdMin: number, now: number): ReservationTiming {
  if (now < requestedAt) {
    return { phase: requestedAt - now <= RESERVATION_SOON_MIN * 60_000 ? "uskoro" : "kasnije", lateSeconds: null };
  }
  const lateSeconds = elapsedSeconds(requestedAt, now);
  return { phase: lateSeconds >= holdMin * 60 ? "kasni" : "u-terminu", lateSeconds };
}

/** `07:12` (the "kasni" timer), or null before the time. */
export function lateText(requestedAt: number, now: number): string | null {
  return now < requestedAt ? null : formatElapsed(elapsedSeconds(requestedAt, now));
}
