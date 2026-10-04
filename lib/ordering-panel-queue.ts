// TASK-68 (RFC-004 §2.7, §2.8) — the waiter panel's queue order. Pure and
// dependency-free so it runs in the browser and under vitest alike.
//
// Two rules, both about a waiter reading a tablet across a loud room:
//   1. GROUPED BY TABLE (cardId). A table that called and then ordered is one
//      walk, not two rows scattered through the list.
//   2. OVERDUE ON TOP. A table with a request past its window (§2.8: the
//      materialized `overdue` flag on a still-`sent` row) is the first thing on
//      screen, with a visual that does not need reading. Below that, the table
//      that has waited longest comes first — FIFO, the order a waiter would
//      serve if they could see every table at once.
//
// NO CLOCK. Ordering uses only stored `createdAt` and the materialized
// `overdue` flag; nothing here compares against Date.now(), so the order is a
// pure function of the subscription's payload and re-sorts exactly when the
// payload changes.

export type QueueStatus = "sent" | "accepted" | "enroute";

export interface QueueRequest {
  _id: string;
  cardId: string;
  tableLabel: string;
  status: QueueStatus;
  overdue: boolean;
  createdAt: number;
}

export interface TableGroup<R extends QueueRequest> {
  cardId: string;
  tableLabel: string;
  /** At least one request is late (overdue AND still unaccepted). */
  hasOverdue: boolean;
  /** The group's longest wait, for the FIFO order between groups. */
  oldestCreatedAt: number;
  requests: R[];
}

/** Late = the §2.8 flag on a request nobody has picked up yet. */
export function isLate(request: QueueRequest): boolean {
  return request.overdue && request.status === "sent";
}

function compareRequests(a: QueueRequest, b: QueueRequest): number {
  const lateDiff = Number(isLate(b)) - Number(isLate(a));
  if (lateDiff !== 0) return lateDiff;
  return a.createdAt - b.createdAt;
}

export function groupQueueByTable<R extends QueueRequest>(
  rows: readonly R[],
): TableGroup<R>[] {
  const byCard = new Map<string, TableGroup<R>>();
  for (const row of rows) {
    let group = byCard.get(row.cardId);
    if (!group) {
      group = {
        cardId: row.cardId,
        tableLabel: row.tableLabel,
        hasOverdue: false,
        oldestCreatedAt: row.createdAt,
        requests: [],
      };
      byCard.set(row.cardId, group);
    }
    group.requests.push(row);
    if (isLate(row)) group.hasOverdue = true;
    if (row.createdAt < group.oldestCreatedAt) {
      group.oldestCreatedAt = row.createdAt;
    }
  }
  const groups = Array.from(byCard.values());
  for (const group of groups) group.requests.sort(compareRequests);
  groups.sort((a, b) => {
    const lateDiff = Number(b.hasOverdue) - Number(a.hasOverdue);
    if (lateDiff !== 0) return lateDiff;
    if (a.oldestCreatedAt !== b.oldestCreatedAt) {
      return a.oldestCreatedAt - b.oldestCreatedAt;
    }
    return a.tableLabel.localeCompare(b.tableLabel, "sr-Latn");
  });
  return groups;
}

/**
 * The "new request" detector (the Memories wall's `seenRef` pattern). Returns
 * the `sent` rows not seen before and records every current row as seen, so a
 * request is announced exactly once. The FIRST payload primes the set
 * silently: rows present at mount are the existing queue, not news. Priming
 * is an explicit flag, not "the set is empty" — a panel that opens to an EMPTY
 * queue must still ring for the first request of the night.
 */
export interface SeenRequests {
  primed: boolean;
  ids: Set<string>;
}

export function createSeenRequests(): SeenRequests {
  return { primed: false, ids: new Set() };
}

export function detectNewRequests<R extends QueueRequest>(
  seen: SeenRequests,
  rows: readonly R[],
): R[] {
  const firstLoad = !seen.primed;
  seen.primed = true;
  const fresh: R[] = [];
  for (const row of rows) {
    if (!seen.ids.has(row._id)) {
      seen.ids.add(row._id);
      if (!firstLoad && row.status === "sent") fresh.push(row);
    }
  }
  return fresh;
}
