// ScanMe Menu V1 (K23) — what a table shows on the waiter panel's floor and
// in its table view (master §10.3: "Oba prikaza treba na prvi pogled da
// pokažu sva paralelna aktivna stanja, ne samo jedno glavno"; §9.4; plan
// docs/meni/planovi/K19.md §4.4, §5 "Sala").
//
// Every active request (`Novi` or `Prihvaćen`) of a position is counted under
// its kind — call (zvonce), bill, order — side by side, never collapsed into
// one "main" state. Reservations (K25) join as the fourth kind. A position
// with nothing active is NEUTRAL: the panel draws a dash, never "free"; that
// a guest sent nothing says nothing about whether the table is free (§9.4).
// Occupancy is a separate, optional, manual module (lib/menu/occupancy.ts).
//
// Pure: the live panel and the izlog feed it the same rows.

import { normalizeArticleName } from "./text";
import type { MenuRequestKind, MenuRequestStatus } from "./request-status";

/** The kinds a table can show at once, in the order of the table view's columns (mockup 08). */
export const TABLE_KINDS = ["call", "order", "bill", "reservation"] as const;
export type TableKind = (typeof TABLE_KINDS)[number];

export type SummaryRequest = {
  id: string;
  kind: MenuRequestKind;
  status: MenuRequestStatus;
  positionId: string;
  createdAt: number;
  acceptedBy: { name: string; isMe: boolean } | null;
};

/** One kind on one table: how many, since when the oldest waits, how many are still new. */
export type KindState = {
  count: number;
  newCount: number;
  /** The oldest active request of this kind (its time is what the floor shows). */
  oldestId: string;
  oldestAt: number;
  /** Is the oldest one still `Novi` (a `Prihvaćen` one is calmer). */
  oldestIsNew: boolean;
};

export type TableSummary = {
  positionId: string;
  kinds: Partial<Record<TableKind, KindState>>;
  /** Active requests of every kind together. */
  active: number;
  newCount: number;
  /** The oldest active request of the table, of any kind. */
  oldestAt: number | null;
  /** Who has the accepted requests, in the order of their requests (oldest first); each person once. */
  takers: { name: string; isMe: boolean }[];
};

const isActive = (status: MenuRequestStatus) => status === "new" || status === "accepted";

/** A neutral summary: nothing active (drawn as a dash). */
export function neutralSummary(positionId: string): TableSummary {
  return { positionId, kinds: {}, active: 0, newCount: 0, oldestAt: null, takers: [] };
}

export function isNeutral(summary: TableSummary): boolean {
  return summary.active === 0;
}

/** The parallel states of every position that has an active request (positions without one are absent: neutral). */
export function summarizeTables(requests: readonly SummaryRequest[]): Map<string, TableSummary> {
  const byPosition = new Map<string, TableSummary>();
  const ordered = requests
    .filter((request) => isActive(request.status))
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const request of ordered) {
    let summary = byPosition.get(request.positionId);
    if (!summary) {
      summary = neutralSummary(request.positionId);
      byPosition.set(request.positionId, summary);
    }
    const isNew = request.status === "new";
    const state = summary.kinds[request.kind];
    if (state) {
      state.count += 1;
      if (isNew) state.newCount += 1;
    } else {
      summary.kinds[request.kind] = {
        count: 1,
        newCount: isNew ? 1 : 0,
        oldestId: request.id,
        oldestAt: request.createdAt,
        oldestIsNew: isNew,
      };
    }
    summary.active += 1;
    if (isNew) summary.newCount += 1;
    if (summary.oldestAt === null) summary.oldestAt = request.createdAt;
    const taker = request.status === "accepted" ? request.acceptedBy : null;
    if (taker && taker.name && !summary.takers.some((known) => known.isMe === taker.isMe && known.name === taker.name)) {
      summary.takers.push({ name: taker.name, isMe: taker.isMe });
    }
  }
  return byPosition;
}

/** The summary of one position (neutral when it has nothing active). */
export function tableSummaryOf(summaries: ReadonlyMap<string, TableSummary>, positionId: string): TableSummary {
  return summaries.get(positionId) ?? neutralSummary(positionId);
}

/** The kinds a table shows, in column order. */
export function activeKinds(summary: TableSummary): TableKind[] {
  return TABLE_KINDS.filter((kind) => summary.kinds[kind] !== undefined);
}

// -----------------------------------------------------------------------------
// Zones are a filter (master §9.3; plan K19-18)
// -----------------------------------------------------------------------------

/**
 * Is a position (or a request) of zone `zoneId` shown under the filter
 * `filterZoneId` (null = every zone)? A position WITHOUT a zone ("Bez zone")
 * belongs to everyone and is always shown.
 */
export function visibleInZone(zoneId: string | null, filterZoneId: string | null): boolean {
  return filterZoneId === null || zoneId === null || zoneId === filterZoneId;
}

/**
 * The zone a request counts under: the CURRENT zone of its position when the
 * floor knows it (a table may have moved since the request), else the zone
 * recorded on the request.
 */
export function requestZone(
  request: { positionId: string; zoneId: string | null },
  positionZones: ReadonlyMap<string, string | null>,
): string | null {
  return positionZones.has(request.positionId) ? (positionZones.get(request.positionId) ?? null) : request.zoneId;
}

/** A zone filter that points at a zone that no longer exists means "every zone". */
export function effectiveZoneFilter(filterZoneId: string | null, zoneIds: readonly string[]): string | null {
  return filterZoneId !== null && zoneIds.includes(filterZoneId) ? filterZoneId : null;
}

// -----------------------------------------------------------------------------
// Searching a table ("Pretraži sto")
// -----------------------------------------------------------------------------

/**
 * Does a table match what the waiter typed? Case and Serbian diacritics are
 * ignored; a bare number matches the table's number ("12" → "Sto 12", not
 * "Sto 120"); otherwise every typed word must start a word of the label or
 * the zone.
 */
export function tableMatches(label: string, zoneName: string | null, query: string): boolean {
  const typed = normalizeArticleName(query);
  if (!typed) return true;
  const labelWords = normalizeArticleName(label).split(" ").filter(Boolean);
  if (/^\d+$/.test(typed)) return labelWords.includes(typed);
  const words = [...labelWords, ...normalizeArticleName(zoneName ?? "").split(" ").filter(Boolean)];
  return typed.split(" ").every((part) => words.some((word) => word.startsWith(part)));
}
