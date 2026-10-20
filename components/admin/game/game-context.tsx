"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { FairFacts } from "@/lib/admin-v2/game/engine";
import { createGameStore, type GameSnapshot, type GameStore } from "@/lib/admin-v2/game/store";
import type { BossCounts } from "@/lib/admin-v2/game/types";
import { pushAdminToast } from "@/lib/admin-v2/toast";

// ADMIN v3 V4 — how a page reaches the game of the frame. `useGame()` is the
// view (operator, combo, streak, boss, badges, team) that follows the store;
// `useGameApi()` are the few things a page may tell the game. Outside a frame
// (a test, an older screen) both work and show an empty game: a record is then
// the v2 toast and nothing else happens.

/** Dev preview only: what a TEST page may do to the TEST game. */
export type GamePreviewControls = {
  /** One TEST action of mine, now; `resolved` also takes one urgent item off the backlog. */
  act(kind: "resolved" | "reply" | "task" | "delivery"): void;
  setCounts(counts: BossCounts | null): void;
  /** One more urgent item. */
  backlog(): void;
  /** The backlog falls to zero by my action. */
  clearBacklog(): void;
  reset(): void;
};

export type GameApi = {
  store: GameStore;
  openVitrina(): void;
  /** A record of the fair seen on a page: a card beside the XP chip (a toast where the ceremony cannot show). */
  celebrate(record: { key: string; title: string }): void;
  /**
   * Facts of the fair page of ONE event that may award a fair badge. `event` is a stable key of the event (its
   * code); `ended` says its fair is over, and then the report is ignored. The first report of a fact is the
   * state (the badge is dated, no ceremony); only a fact seen false/lower that rises while the page is open is news.
   */
  reportFair(report: { event: string; ended: boolean; facts: Partial<FairFacts> }): void;
  /** Where the spark of the next gained XP starts (viewport px): the star or the row the admin has just solved. */
  aim(point: { x: number; y: number } | null): void;
  /** The team table is on the screen: its journals are read while at least one watcher exists. */
  watchTeam(): () => void;
  preview: GamePreviewControls | null;
};

const idle = createGameStore();

const FALLBACK: GameApi = {
  store: idle,
  openVitrina() {},
  celebrate: (record) => void pushAdminToast(record),
  reportFair() {},
  aim() {},
  watchTeam: () => () => {},
  preview: null,
};

export const GameContext = createContext<GameApi>(FALLBACK);

export const useGameApi = () => useContext(GameContext);

/** The game as the UI draws it; it follows the store of the frame. */
export function useGame(): GameSnapshot {
  const { store } = useContext(GameContext);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
