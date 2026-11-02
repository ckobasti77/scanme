// ScanMe Menu V1 (K22) — the work queue of the waiter panel (master §10.2,
// §8.4; plan docs/meni/planovi/K19.md §5 "Radni red"; mockup 10).
//
// One list, ordered so the next thing to do is on top:
//   1. `Novi`, the one waiting longest first;
//   2. `Prihvaćen`, mine first, then the others, the longest waiting first.
// Each card has ONE main action: a call or a bill is taken right from the
// queue (`Preuzmi`); an order is opened first (`Pregledaj`), since the waiter
// checks its lines; a request I already took is finished (`Završi`); one a
// colleague took is only opened. Reservations (K25) join the same list; until
// then the `Rezervacije` filter is honestly empty.

import type { MenuRequestKind, MenuRequestStatus } from "./request-status";

export const QUEUE_FILTERS = ["sve", "zahtevi", "rezervacije"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

/** What the ordering and the main action need from a queue row. */
export type QueueRow = {
  id: string;
  kind: MenuRequestKind;
  status: MenuRequestStatus;
  createdAt: number;
  acceptedBy: { isMe: boolean } | null;
};

export type QueueAction = "accept" | "review" | "complete";

function rank(row: QueueRow): number {
  if (row.status === "new") return 0;
  if (row.status === "accepted") return row.acceptedBy?.isMe ? 1 : 2;
  return 3;
}

/** The queue order (a new array; ties keep the oldest first, then the id). */
export function sortQueue<T extends QueueRow>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.status === "new" || row.status === "accepted")
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Requests shown under a filter. Reservations are not requests (K25 adds its own rows). */
export function filterQueue<T extends QueueRow>(rows: readonly T[], filter: QueueFilter): T[] {
  return filter === "rezervacije" ? [] : rows.slice();
}

/** The one main action of a queue card. */
export function primaryAction(row: QueueRow): QueueAction {
  if (row.status === "accepted") return row.acceptedBy?.isMe ? "complete" : "review";
  return row.kind === "order" ? "review" : "accept";
}

/** "4 aktivna zahteva · najstariji 08:12": how many are open and since when the oldest NEW one waits. */
export function queueSummary(rows: readonly QueueRow[]): { active: number; newCount: number; oldestNewAt: number | null } {
  let active = 0;
  let newCount = 0;
  let oldestNewAt: number | null = null;
  for (const row of rows) {
    if (row.status !== "new" && row.status !== "accepted") continue;
    active += 1;
    if (row.status === "new") {
      newCount += 1;
      if (oldestNewAt === null || row.createdAt < oldestNewAt) oldestNewAt = row.createdAt;
    }
  }
  return { active, newCount, oldestNewAt };
}

/**
 * Requests that arrived since the previous snapshot of the queue, for the
 * polite announcement ("Nov poziv konobara · Sto 12"). The first snapshot
 * (`previous` null) announces nothing: what was already there is not news.
 */
export function newArrivals<T extends QueueRow>(previous: ReadonlySet<string> | null, rows: readonly T[]): T[] {
  if (previous === null) return [];
  return rows.filter((row) => row.status === "new" && !previous.has(row.id)).sort((a, b) => a.createdAt - b.createdAt);
}

/** Cancellations by the guest newer than `since`, newest first (the "Gost je otkazao" strip). */
export function guestCancellationsSince<T extends { cancelledAt: number | null; cancelledBy: "guest" | "staff" | null }>(
  rows: readonly T[],
  since: number,
): T[] {
  return rows
    .filter((row) => row.cancelledBy === "guest" && row.cancelledAt !== null && row.cancelledAt > since)
    .sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0));
}
