// ADMIN v3 V4 — the journal folded into a snapshot kept in this browser (plan
// §6.2), so the history is read from the server once and later only the new rows
// are added. Pure; the only I/O are the two storage helpers, always in try/catch.

import { GAME_ACTIONS, mergeRows, toActivityRow } from "./activity";
import { levelOf } from "./levels";
import { dayKey } from "./time";
import type { ActivityRow, ScoredAction, XpMark, XpSnapshot, XpTotals } from "./types";
import { scoreRows } from "./xp";

export const XP_SNAPSHOT_PREFIX = "scanme.admin.game.xp.v1.";
/** 26 h: the rows the repeat rules, the combo and the daily cap of the next rows need (the longest Belgrade day is 25 h). */
export const XP_TAIL_MS = 26 * 3_600_000;
/** Rows per page of the journal, and the pages read on the first open of a device (1.000 rows). */
export const XP_PAGE_SIZE = 50;
export const XP_HISTORY_PAGES = 20;

export const EMPTY_SNAPSHOT: XpSnapshot = Object.freeze({
  v: 1,
  through: 0,
  since: null,
  complete: false,
  totals: Object.freeze({ xp: 0, actions: 0, deliveries: 0, bestChain: 0, marks: Object.freeze({}) }) as XpTotals,
  tail: Object.freeze([]) as unknown as ActivityRow[],
}) as XpSnapshot;

const LEVEL_MARKS: ReadonlyArray<readonly [number, XpMark]> = [
  [6, "level6"],
  [11, "level11"],
  [16, "level16"],
  [21, "level21"],
];

/**
 * Adds the rows that are new to the snapshot. The tail is context: the new rows are
 * scored together with it, but only the new rows add to the totals (and a row of the
 * tail a new row has undone leaves them). A late row (older than `through` and not in
 * the tail) is ignored. The input is not changed.
 */
export function foldSnapshot(snapshot: XpSnapshot | null, rows: readonly ActivityRow[], complete?: boolean): XpSnapshot {
  const base = snapshot ?? EMPTY_SNAPSHOT;
  const inTail = new Set(base.tail.map((row) => row.id));
  const fresh = mergeRows(
    rows.filter((row) => Number.isFinite(row.occurredAt) && row.occurredAt >= base.through && !inTail.has(row.id)).map(toActivityRow),
  );
  const isComplete = base.complete || complete === true;
  if (fresh.length === 0) return isComplete === base.complete ? base : { ...base, complete: isComplete };

  const freshIds = new Set(fresh.map((row) => row.id));
  const all = mergeRows(base.tail, fresh);
  const totals: XpTotals = { ...base.totals, marks: { ...base.totals.marks } };
  const mark = (key: XpMark, at: number) => {
    if (totals.marks[key] === undefined) totals.marks[key] = at;
  };
  const scored = scoreRows(all);
  // A row of the tail that carried XP and no longer does was taken back by a new row (a sticker undone
  // within its five minutes): its XP leaves the totals, so every device ends with the same number.
  const stillScored = new Set(scored.map((action) => action.id));
  for (const action of scoreRows(base.tail)) {
    if (stillScored.has(action.id)) continue;
    totals.xp = Math.max(0, totals.xp - action.xp);
    totals.actions = Math.max(0, totals.actions - 1);
  }
  for (const action of scored) {
    if (!freshIds.has(action.id)) continue;
    totals.xp += action.xp;
    totals.actions += 1;
    if (action.action === GAME_ACTIONS.delivery) totals.deliveries += 1;
    totals.bestChain = Math.max(totals.bestChain, action.chain);
    if (totals.actions >= 1) mark("first", action.at);
    if (totals.actions >= 100) mark("actions100", action.at);
    if (totals.deliveries >= 10) mark("deliveries10", action.at);
    if (action.chain >= 5) mark("chain5", action.at);
    const level = levelOf(totals.xp);
    for (const [from, key] of LEVEL_MARKS) if (level >= from) mark(key, action.at);
  }

  const through = Math.max(base.through, fresh[fresh.length - 1].occurredAt);
  return {
    v: 1,
    through,
    since: base.since === null ? fresh[0].occurredAt : Math.min(base.since, fresh[0].occurredAt),
    complete: isComplete,
    totals,
    tail: all.filter((row) => row.occurredAt > through - XP_TAIL_MS),
  };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const MARK_KEYS: readonly XpMark[] = ["first", "actions100", "deliveries10", "chain5", "level6", "level11", "level16", "level21"];

/** The stored text back into a snapshot; anything that is not the exact shape is null. */
export function parseSnapshot(text: string | null | undefined): XpSnapshot | null {
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return null;
    const s = raw as Record<string, unknown>;
    if (s.v !== 1 || !finite(s.through) || typeof s.complete !== "boolean") return null;
    if (s.since !== null && !finite(s.since)) return null;
    const t = s.totals as Record<string, unknown> | null;
    if (typeof t !== "object" || t === null) return null;
    if (!finite(t.xp) || !finite(t.actions) || !finite(t.deliveries) || !finite(t.bestChain)) return null;
    const rawMarks = t.marks as Record<string, unknown> | null;
    if (typeof rawMarks !== "object" || rawMarks === null || Array.isArray(rawMarks)) return null;
    const marks: XpTotals["marks"] = {};
    for (const key of MARK_KEYS) {
      const value = rawMarks[key];
      if (value === undefined) continue;
      if (!finite(value)) return null;
      marks[key] = value;
    }
    if (!Array.isArray(s.tail)) return null;
    const tail: ActivityRow[] = [];
    for (const item of s.tail as unknown[]) {
      if (typeof item !== "object" || item === null) return null;
      const r = item as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.action !== "string" || typeof r.actorKind !== "string" || typeof r.href !== "string" || !finite(r.occurredAt)) return null;
      tail.push({ id: r.id, action: r.action, actorKind: r.actorKind, occurredAt: r.occurredAt, href: r.href });
    }
    return {
      v: 1,
      through: s.through,
      since: s.since as number | null,
      complete: s.complete,
      totals: { xp: t.xp, actions: t.actions, deliveries: t.deliveries, bestChain: t.bestChain, marks },
      tail,
    };
  } catch {
    return null;
  }
}

export function readSnapshot(storage: Pick<Storage, "getItem"> | null | undefined, userId: string): XpSnapshot | null {
  try {
    return parseSnapshot(storage?.getItem(XP_SNAPSHOT_PREFIX + userId));
  } catch {
    return null;
  }
}

/** false when the snapshot could not be kept (the history is then read again on the next open). */
export function writeSnapshot(storage: Pick<Storage, "setItem"> | null | undefined, userId: string, snapshot: XpSnapshot): boolean {
  try {
    if (!storage) return false;
    storage.setItem(XP_SNAPSHOT_PREFIX + userId, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/** The tail scored on its own: what the combo and „today“ are made of. */
export function tailScored(snapshot: XpSnapshot): ScoredAction[] {
  return scoreRows(snapshot.tail);
}

/** XP of the actions of the tail on the Belgrade day of `now`. */
export function todayXp(snapshot: XpSnapshot, now: number): number {
  const today = dayKey(now);
  return tailScored(snapshot).reduce((sum, action) => (dayKey(action.at) === today ? sum + action.xp : sum), 0);
}

/** The tail has at least one action that carries XP on that Belgrade day. */
export function workedOn(snapshot: XpSnapshot, day: string): boolean {
  return tailScored(snapshot).some((action) => dayKey(action.at) === day);
}
