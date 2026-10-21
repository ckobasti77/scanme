"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  MISSION_STORAGE_PREFIX,
  advanceLedger,
  markClearShown,
  missionBoard,
  missionDay,
  readLedger,
  staleLedgerKeys,
  writeLedger,
  type MissionBoard,
  type MissionInput,
  type MissionLedger,
} from "@/lib/admin-v2/missions";
import { celebrationsOn, quietModeStore } from "@/lib/admin-v2/quiet-mode";

// ADMIN v2 X4 — the day's mission ledger of one scope (the Dashboard with its
// scope, Zadaci, one event in one phase): kept in this tab, read from and
// written to localStorage in try/catch (lib/admin-v2/missions.ts). The first
// data a visit gets for a mission only sets the state; a count that falls
// after that is a confirmation, unless the quiet mode is on. „Sve čisto“ is a
// celebration once a day: the ledger remembers that it was shown.

/** What was solved in the last step; `seq` changes with every step. */
export type MissionConfirm = {
  seq: number;
  items: { label: string; done: number; total: number; /** Nothing waits in the mission any more. */ complete: boolean }[];
};

type Entry = {
  ledger: MissionLedger | null;
  confirm: MissionConfirm | null;
  /** The all-clear of this visit is the day's first one (it stays a celebration until the block leaves). */
  celebrating: boolean;
  /** The missions this visit already has data for: only a change after that is news. */
  known: ReadonlySet<string>;
  labels: Map<string, string>;
};

const entries = new Map<string, Entry>();
const mounts = new Map<string, number>();
const listeners = new Set<() => void>();
const NONE: ReadonlySet<string> = new Set();
let confirmSeq = 0;
let pruned = false;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Once per page load: ledgers of another day are removed (one is written per event, phase and day). */
function prune(store: Storage, day: string) {
  if (pruned) return;
  pruned = true;
  try {
    const stored: [string, string | null][] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith(MISSION_STORAGE_PREFIX)) stored.push([key, store.getItem(key)]);
    }
    for (const key of staleLedgerKeys(stored, day)) store.removeItem(key);
  } catch {
    // A storage that cannot be listed keeps its old ledgers; they are ignored when read.
  }
}

function entryOf(scope: string): Entry {
  let entry = entries.get(scope);
  if (!entry) {
    const store = storage();
    const day = missionDay(Date.now());
    if (store) prune(store, day);
    // Only today's ledger is progress; yesterday's would show for a moment as today's.
    const stored = readLedger(store, scope);
    entry = { ledger: stored?.day === day ? stored : null, confirm: null, celebrating: false, known: NONE, labels: new Map() };
    entries.set(scope, entry);
  }
  return entry;
}

function replace(scope: string, next: Entry) {
  entries.set(scope, next);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function advance(scope: string, missions: readonly MissionInput[], complete: boolean) {
  const entry = entryOf(scope);
  const quiet = quietModeStore.get();
  const step = advanceLedger(entry.ledger, missions, missionDay(Date.now()), complete);
  let ledger = step.changed ? step.ledger : entry.ledger ?? step.ledger;
  const labels = new Map(entry.labels);
  const known = new Set(entry.known);
  for (const mission of missions) {
    labels.set(mission.id, mission.label);
    known.add(mission.id);
  }
  // The first data of a visit for a mission is its state, not news (a widget that arrives later than the
  // others, a number that fell while the page was closed); with the quiet mode on nothing is confirmed.
  const news = step.resolved.filter((item) => entry.known.has(item.id) && labels.has(item.id));
  const confirm = news.length && celebrationsOn(quiet)
    ? { seq: ++confirmSeq, items: news.map((item) => ({ label: labels.get(item.id) ?? "", done: item.done, total: item.done + item.open, complete: item.open === 0 })) }
    : entry.confirm;
  const clear = missionBoard(missions, ledger).clear;
  let celebrating = entry.celebrating && clear !== "open";
  if (clear === "celebrate" && celebrationsOn(quiet)) {
    ledger = markClearShown(ledger);
    celebrating = true;
  }
  if (ledger !== entry.ledger) writeLedger(storage(), scope, ledger);
  if (ledger === entry.ledger && confirm === entry.confirm && celebrating === entry.celebrating) {
    // Nothing the block shows changed: no re-render, only what the next step compares with.
    entry.labels = labels;
    entry.known = known;
    return;
  }
  replace(scope, { ledger, confirm, celebrating, known, labels });
}

function enter(scope: string) {
  mounts.set(scope, (mounts.get(scope) ?? 0) + 1);
}

/** The last block of a scope left (the sidebar and the phone drawer may both show it): the next visit starts over. */
function leave(scope: string) {
  const left = (mounts.get(scope) ?? 1) - 1;
  if (left > 0) {
    mounts.set(scope, left);
    return;
  }
  mounts.delete(scope);
  const entry = entries.get(scope);
  if (!entry) return;
  if (!entry.celebrating && !entry.confirm) {
    entry.known = NONE;
    return;
  }
  replace(scope, { ...entry, celebrating: false, confirm: null, known: NONE });
}

const serverSnapshot = () => null;
const notQuiet = () => false;

export type MissionProgress = {
  board: MissionBoard;
  confirm: MissionConfirm | null;
  /** The numbers are not (yet) the ones of this scope: the rows are shown, the progress and the all-clear are not claimed. */
  pending?: boolean;
};

/**
 * The missions of `scope` with the progress of the day. `missions` null: the
 * page has not sent them (nothing is written). `complete`: the list is
 * everything there is, so a mission that left it was solved. `hold`: the
 * numbers on hand belong to another scope (they are being replaced), so the
 * ledger is neither read nor written.
 */
export function useMissionProgress(scope: string, missions: readonly MissionInput[] | null, complete = false, hold = false): MissionProgress {
  // The stored ledger is read with the first client snapshot (the server has none), so today's progress is there at once.
  const entry = useSyncExternalStore<Entry | null>(subscribe, () => entryOf(scope), serverSnapshot);
  const quiet = useSyncExternalStore(quietModeStore.subscribe, quietModeStore.get, notQuiet);
  useEffect(() => {
    if (missions && !hold) advance(scope, missions, complete);
  }, [scope, missions, complete, hold]);
  useEffect(() => {
    enter(scope);
    return () => leave(scope);
  }, [scope]);
  return useMemo(() => {
    const list = missions ?? [];
    if (hold) return { board: missionBoard(list, null), confirm: null, pending: true };
    // The render already counts the step the effect is about to store, so a solved item never shows as "0 of what is left".
    const ledger = entry?.ledger ? advanceLedger(entry.ledger, list, entry.ledger.day, complete).ledger : null;
    const board = missionBoard(list, ledger);
    // The day's first all-clear stays a celebration while this block is on the screen; the quiet mode never celebrates.
    const clear = quiet && board.clear === "celebrate" ? "quiet" : !quiet && board.clear === "quiet" && entry?.celebrating ? "celebrate" : board.clear;
    return { board: clear === board.clear ? board : { ...board, clear }, confirm: quiet ? null : entry?.confirm ?? null };
  }, [entry, missions, complete, quiet, hold]);
}
