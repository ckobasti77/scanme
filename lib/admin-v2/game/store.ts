import { gameStep, gameView, initialGame, nextTickAt, type FairFacts, type GameEffect, type GameInput, type GameState, type GameStored } from "./engine";
import { readBadgeDates, readDays, readSeen, writeBadgeDates, writeDays, writeSeen } from "./ledger";
import { readSnapshot, writeSnapshot } from "./snapshot";
import { dayKey, dayStart, shiftDay } from "./time";
import type { BossEvent, GameView } from "./types";

// ADMIN v3 V4 — the game of this tab: the state of the engine, what it keeps in
// the browser (localStorage, through the readers that never throw) and the
// timers the engine asks for. No React here; the frame subscribes
// (components/admin/game/game-provider.tsx) and a dev preview fills the same
// store with TEST data and no storage.

export type GameSnapshot = {
  view: GameView;
  /** The moment `view` was worked out for (ms). */
  now: number;
  /** The last thing that happened to the boss; `seq` changes with every one. */
  bossEvent: (BossEvent & { seq: number }) | null;
  /** The last XP my actions carried; `seq` changes with every gain. */
  gain: { seq: number; xp: number } | null;
};

/** `GameInput` without its time: the store stamps it with its clock. */
type WithoutNow<Input> = Input extends unknown ? Omit<Input, "now"> : never;
export type GameAction = WithoutNow<GameInput>;

const EMPTY_VIEW: GameView = { operator: null, combo: null, streak: null, boss: { kind: "unavailable" }, badges: [], team: null };
const EMPTY: GameSnapshot = { view: EMPTY_VIEW, now: 0, bossEvent: null, gain: null };
/** A timer never waits less than this (ms). */
const TIMER_MIN_MS = 50;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function createGameStore(options: { clock?: () => number; storage?: () => Storage | null } = {}) {
  const clock = options.clock ?? Date.now;
  const storage = options.storage ?? (() => null);
  let state: GameState | null = null;
  let snapshot: GameSnapshot = EMPTY;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** What a fair page told before the game started (a hard reload of an event page): kept and told again at the start. */
  let early: Partial<FairFacts> | null = null;
  const listeners = new Set<() => void>();
  const effectListeners = new Set<(effect: GameEffect) => void>();

  const publish = (bossEvent = snapshot.bossEvent, gain = snapshot.gain) => {
    if (!state) return;
    const now = clock();
    snapshot = { view: gameView(state, now), now, bossEvent, gain };
    for (const listener of listeners) listener();
  };

  const persist = (before: GameState, after: GameState) => {
    const store = storage();
    if (after.snapshot && after.snapshot !== before.snapshot) writeSnapshot(store, after.userId, after.snapshot);
    if (after.days !== before.days) writeDays(store, after.userId, after.days);
    // Another tab of the same person may have written since this one read: its dates and keys are kept
    // (the earlier date of a badge wins), so one tab never takes back what the other celebrated.
    if (after.badgeDates !== before.badgeDates) {
      const merged = { ...readBadgeDates(store, after.userId) };
      for (const [id, at] of Object.entries(after.badgeDates) as [keyof typeof merged, number][]) merged[id] = Math.min(at, merged[id] ?? at);
      writeBadgeDates(store, after.userId, merged);
    }
    if (after.seen !== before.seen) writeSeen(store, after.userId, [...new Set([...readSeen(store, after.userId), ...after.seen])]);
  };

  /** One wake-up for whatever comes first: a pending fall of the backlog, the end of the combo, the next Belgrade day. */
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!state || !listeners.size) return;
    const now = clock();
    const due = [nextTickAt(state), snapshot.view.combo?.expiresAt ?? null, dayStart(shiftDay(dayKey(now), 1))].filter((at): at is number => at !== null);
    timer = setTimeout(() => {
      timer = null;
      dispatch({ type: "tick" });
    }, Math.max(TIMER_MIN_MS, Math.min(...due) - now + 1));
  };

  function dispatch(action: GameAction) {
    if (!state) {
      if (action.type === "fair") early = { ...early, ...action.fair };
      return;
    }
    const before = state;
    const step = gameStep(before, { ...action, now: clock() } as GameInput);
    state = step.state;
    persist(before, state);
    let { bossEvent, gain } = snapshot;
    for (const effect of step.effects) {
      if (effect.type === "boss") bossEvent = { ...effect.event, seq: ++seq };
      else if (effect.type === "gain") gain = { seq: ++seq, xp: effect.xp };
    }
    publish(bossEvent, gain);
    for (const effect of step.effects) for (const listener of effectListeners) listener(effect);
    schedule();
  }

  return {
    /** Starts (or restarts) the game of a user. `stored` undefined: what this browser kept is read. */
    start(userId: string, stored?: GameStored) {
      const store = storage();
      state = initialGame(userId, stored ?? { snapshot: readSnapshot(store, userId), days: readDays(store, userId), badgeDates: readBadgeDates(store, userId), seen: readSeen(store, userId) });
      snapshot = EMPTY;
      publish(null, null);
      schedule();
      if (early) {
        const fair = early;
        early = null;
        dispatch({ type: "fair", fair });
      }
    },
    started: () => state !== null,
    /** The first read of the journal is in: what happens from now on is news. */
    live: () => state?.live === true,
    userId: () => state?.userId ?? null,
    /** `occurredAt` of the newest row already folded in: the history is read back to it. */
    through: () => state?.snapshot?.through ?? 0,
    dispatch,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      schedule();
      return () => {
        listeners.delete(listener);
        if (!listeners.size && timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
    },
    /** What the engine wants played: a spark, a hit, a ceremony. */
    onEffect(listener: (effect: GameEffect) => void) {
      effectListeners.add(listener);
      return () => {
        effectListeners.delete(listener);
      };
    },
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
