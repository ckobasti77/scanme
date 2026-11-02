// ScanMe Menu V1 (K25) — reservations on the waiter panel (master §10.2–§10.4,
// §11.3, §11.7; plan docs/meni/planovi/K24.md K24-14, K24-15, §2.5).
//
// The `Rezervacije` filter of the work queue lists them in groups, the next
// thing to do on top:
//   čekaju odgovor  `Novi` (the oldest request first), then `Predložena izmena`
//   kasne           accepted, the hold after the time has passed (red)
//   uskoro          accepted, the time is within two hours or has just come
//   danas           accepted, later today
//   kasnije         accepted, tomorrow and the day after (the 48 h window)
//   stigli          realized today
//   otkazane        cancelled in the last 12 hours (newest first)
// `Sve` shows the new ones among the requests' `Novi` and the `Uskoro`
// section (kasne + uskoro) under the queue. A table bound to an accepted
// reservation shows it on the floor from two hours before its time until the
// guests arrive or it is cancelled. Pure: the live panel and the izlog feed
// it the same rows.

import { belgradeDateKey } from "./working-hours";
import { reservationTiming, RESERVATION_SOON_MIN, type ReservationPhase } from "./reservation-late";
import type { MenuReservationStatus } from "./reservation-status";

/** A reservation as the waiter's list shows it (no contact, no note text: those are in the detail). */
export type ReservationRow = {
  id: string;
  status: MenuReservationStatus;
  guestName: string;
  partySize: number;
  requestedAt: number;
  createdAt: number;
  positionId: string | null;
  positionLabel: string | null;
  /** The note exists (the list shows an icon; the text is in the detail). */
  hasNote: boolean;
  proposedAt: number | null;
  arrivedAt: number | null;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
};

export type ReservationGroups<T extends ReservationRow = ReservationRow> = {
  cekajuOdgovor: T[];
  kasne: T[];
  uskoro: T[];
  danas: T[];
  kasnije: T[];
  stigli: T[];
  otkazane: T[];
};

export const RESERVATION_GROUP_KEYS = ["cekajuOdgovor", "kasne", "uskoro", "danas", "kasnije", "stigli", "otkazane"] as const;
export type ReservationGroupKey = (typeof RESERVATION_GROUP_KEYS)[number];

/** Cancelled reservations stay in the list (and the strip) this long. */
export const RESERVATION_CANCELLED_SHOWN_MS = 12 * 60 * 60 * 1000;
/** A bound reservation shows on its table from this long before its time. */
export const RESERVATION_ON_TABLE_FROM_MS = RESERVATION_SOON_MIN * 60_000;
/** A reservation cancelled this recently is still named in its table's detail. */
export const RESERVATION_CANCELLED_ON_TABLE_MS = 2 * 60 * 60 * 1000;

const byTime = <T extends ReservationRow>(a: T, b: T) =>
  a.requestedAt - b.requestedAt || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byCreated = <T extends ReservationRow>(a: T, b: T) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function groupReservations<T extends ReservationRow>(rows: readonly T[], now: number, holdMin: number): ReservationGroups<T> {
  const groups: ReservationGroups<T> = { cekajuOdgovor: [], kasne: [], uskoro: [], danas: [], kasnije: [], stigli: [], otkazane: [] };
  const today = belgradeDateKey(now);
  const proposed: T[] = [];
  for (const row of rows) {
    switch (row.status) {
      case "new":
        groups.cekajuOdgovor.push(row);
        break;
      case "change_proposed":
        proposed.push(row);
        break;
      case "accepted": {
        const phase = reservationTiming(row.requestedAt, holdMin, now).phase;
        if (phase === "kasni") groups.kasne.push(row);
        else if (phase === "uskoro" || phase === "u-terminu") groups.uskoro.push(row);
        else if (belgradeDateKey(row.requestedAt) === today) groups.danas.push(row);
        else groups.kasnije.push(row);
        break;
      }
      case "arrived":
        if (row.arrivedAt !== null && belgradeDateKey(row.arrivedAt) === today) groups.stigli.push(row);
        break;
      case "cancelled":
        if (row.cancelledAt !== null && now - row.cancelledAt <= RESERVATION_CANCELLED_SHOWN_MS) groups.otkazane.push(row);
        break;
      case "declined":
        break;
    }
  }
  groups.cekajuOdgovor.sort(byCreated);
  proposed.sort(byCreated);
  groups.cekajuOdgovor.push(...proposed);
  groups.kasne.sort(byTime);
  groups.uskoro.sort(byTime);
  groups.danas.sort(byTime);
  groups.kasnije.sort(byTime);
  groups.stigli.sort((a, b) => (b.arrivedAt ?? 0) - (a.arrivedAt ?? 0));
  groups.otkazane.sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0));
  return groups;
}

/** New requests (and proposals waiting for the guest's answer): the `Rezervacije` badge counts the new ones. */
export function newReservationCount(rows: readonly ReservationRow[]): number {
  return rows.filter((row) => row.status === "new").length;
}

/** `Uskoro` under the queue of `Sve`: the late ones first, then the ones whose time is near. */
export function soonReservations<T extends ReservationRow>(rows: readonly T[], now: number, holdMin: number): T[] {
  const groups = groupReservations(rows, now, holdMin);
  return [...groups.kasne, ...groups.uskoro];
}

/** Reservations that arrived since the previous snapshot (a polite announcement and one short sound). */
export function newReservationArrivals<T extends ReservationRow>(previous: ReadonlySet<string> | null, rows: readonly T[]): T[] {
  if (previous === null) return [];
  return rows.filter((row) => row.status === "new" && !previous.has(row.id)).sort(byCreated);
}

/** Cancellations by the guest newer than `since`, newest first (the strip of K24-15). */
export function guestReservationCancellationsSince<T extends ReservationRow>(rows: readonly T[], since: number): T[] {
  return rows
    .filter((row) => row.status === "cancelled" && row.cancelledBy === "guest" && row.cancelledAt !== null && row.cancelledAt > since)
    .sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0));
}

/** What a table shows for its reservation on the floor. */
export type TableReservation<T extends ReservationRow = ReservationRow> = {
  /** The next accepted reservation of the table (the one the floor marks). */
  row: T;
  phase: ReservationPhase;
  /** More accepted reservations of the same table later on (everything the panel reads, 60 h). */
  more: number;
};

/**
 * The reservation each table shows: its accepted reservation from two hours
 * before the time until the guests arrive or it is cancelled (the earliest
 * when there are several). Tables without one are absent.
 */
export function reservationsByTable<T extends ReservationRow>(
  rows: readonly T[],
  now: number,
  holdMin: number,
): Map<string, TableReservation<T>> {
  const out = new Map<string, TableReservation<T>>();
  const accepted = rows.filter((row) => row.status === "accepted" && row.positionId !== null).sort(byTime);
  for (const row of accepted) {
    const positionId = row.positionId as string;
    const known = out.get(positionId);
    if (known) {
      known.more += 1;
      continue;
    }
    if (row.requestedAt - now > RESERVATION_ON_TABLE_FROM_MS) continue;
    out.set(positionId, { row, phase: reservationTiming(row.requestedAt, holdMin, now).phase, more: 0 });
  }
  return out;
}

/** The reservations of one table today (accepted, arrived and recently cancelled), for the table detail. */
export function reservationsOfTable<T extends ReservationRow>(rows: readonly T[], positionId: string, now: number): T[] {
  const today = belgradeDateKey(now);
  return rows
    .filter((row) => {
      if (row.positionId !== positionId) return false;
      if (row.status === "accepted") return true;
      if (row.status === "arrived") return row.arrivedAt !== null && belgradeDateKey(row.arrivedAt) === today;
      if (row.status === "cancelled") return row.cancelledAt !== null && now - row.cancelledAt <= RESERVATION_CANCELLED_ON_TABLE_MS;
      return false;
    })
    .sort(byTime);
}

/** Accepted reservations without a table whose time is today (the "Poveži rezervaciju" list of a table). */
export function unboundToday<T extends ReservationRow>(rows: readonly T[], now: number): T[] {
  const today = belgradeDateKey(now);
  return rows
    .filter((row) => row.status === "accepted" && row.positionId === null && belgradeDateKey(row.requestedAt) === today)
    .sort(byTime);
}
