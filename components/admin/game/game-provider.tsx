"use client";

import { useConvex, useQuery } from "convex/react";
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { api } from "@/convex/_generated/api";
import { actorKeyOf, mergeRows, toActivityRow } from "@/lib/admin-v2/game/activity";
import { XP_HISTORY_PAGES, XP_PAGE_SIZE } from "@/lib/admin-v2/game/snapshot";
import { createGameStore, type GameStore } from "@/lib/admin-v2/game/store";
import { TEAM_PAGES, teamSince } from "@/lib/admin-v2/game/team";
import type { ActivityRow, TeamJournal, TeamMember } from "@/lib/admin-v2/game/types";
import { pulseStore, resolvedBeat } from "@/lib/admin-v2/pulse";
import { ADMIN_VITRINA_EVENT } from "@/lib/admin-v2/shortcuts";
import { pushAdminToast } from "@/lib/admin-v2/toast";
import { GameContext, type GameApi } from "./game-context";
import { createPreviewGame, type GameFixture } from "./game-preview";

// ADMIN v3 V4 — the game of the frame. One store per frame:
//   live    — a signed-in admin: the store is fed from what the admin already
//             reads plus the journal of their own actions (`adminActivity.list`,
//             an existing query; no new query, no change of the schema);
//   preview — a dev preview that gives a TEST game: nothing read, nothing stored;
//   off     — nobody is signed in (or a preview without a game): an empty game.
// What the server knows and what only this browser knows is written down in
// lib/admin-v2/game/types.ts and in docs/admin/v3/V4.md.

const FIVE_MINUTES = 5 * 60_000;
/** The journals of the team are read again this often while the table is on a screen and the tab is visible. */
const TEAM_REFRESH_MS = 5 * 60_000;
/** A spark may start from the place the admin acted on for this long. */
const AIM_MS = 15_000;
/** A read of the history that failed is tried again after this long, this many times in all. */
const HISTORY_RETRY_MS = 30_000;
const HISTORY_ATTEMPTS = 3;

type Internal = {
  vitrinaOpen: boolean;
  setVitrinaOpen(open: boolean): void;
  /** The place of the last action, once (then it is forgotten). */
  takeAim(): { x: number; y: number } | null;
  teamWatchers: { get(): number; subscribe(listener: () => void): () => void };
};

const InternalContext = createContext<Internal | null>(null);

/** The inside of the game for its own layers (the Vitrina, the ceremonies, the spark). */
export const useGameInternal = () => useContext(InternalContext);

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function createWatchers() {
  let count = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: () => count,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add() {
      count += 1;
      emit();
      return () => {
        count -= 1;
        emit();
      };
    },
  };
}

export function GameProvider({ mode, fixture, children }: { mode: "live" | "preview" | "off"; /** Dev preview: the TEST game. */ fixture?: GameFixture; children: ReactNode }) {
  const [game] = useState(() => (mode === "preview" && fixture ? createPreviewGame(fixture) : { store: createGameStore({ storage: browserStorage }), controls: null, arm() {} }));
  const [watchers] = useState(createWatchers);
  const [vitrinaOpen, setVitrinaOpen] = useState(false);
  const aimed = useRef<{ point: { x: number; y: number }; at: number } | null>(null);
  const { store } = game;

  // A preview clock starts to run once the page is in the browser.
  useEffect(() => game.arm(), [game]);
  // Dev: a capture script reaches the TEST game of any preview page (never in production, never the real game).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !game.controls) return;
    const host = window as unknown as { __adminGamePreview?: unknown };
    host.__adminGamePreview = { ...game.controls, celebrate: (record: { key: string; title: string }) => store.dispatch({ type: "record", ...record }) };
    return () => {
      delete host.__adminGamePreview;
    };
  }, [game, store]);
  useEffect(() => {
    const open = () => setVitrinaOpen(true);
    window.addEventListener(ADMIN_VITRINA_EVENT, open);
    return () => window.removeEventListener(ADMIN_VITRINA_EVENT, open);
  }, []);
  // XP of my own action is a beat of the Pulse (`rešeno`), at once.
  useEffect(
    () =>
      store.onEffect((effect) => {
        if (effect.type !== "gain") return;
        const now = Date.now();
        pulseStore.push([resolvedBeat(now, effect.actions.length)], now);
      }),
    [store],
  );

  const value = useMemo<GameApi>(
    () => ({
      store,
      openVitrina: () => setVitrinaOpen(true),
      // Until the game runs (nobody signed in, the journal not read yet) a record is the v2 toast: it is never lost.
      celebrate: (record) => (store.live() ? store.dispatch({ type: "record", ...record }) : void pushAdminToast(record)),
      // Told before the game started (a hard reload of an event page), the store keeps it for the start.
      reportFair: ({ event, ended, facts }) => store.dispatch({ type: "fair", event, ended, fair: facts }),
      aim: (point) => {
        aimed.current = point ? { point, at: Date.now() } : null;
      },
      watchTeam: () => watchers.add(),
      preview: game.controls,
    }),
    [store, watchers, game.controls],
  );
  const takeAim = useCallback(() => {
    const aim = aimed.current;
    aimed.current = null;
    return aim && Date.now() - aim.at <= AIM_MS ? aim.point : null;
  }, []);
  const internal = useMemo<Internal>(() => ({ vitrinaOpen, setVitrinaOpen, takeAim, teamWatchers: watchers }), [vitrinaOpen, takeAim, watchers]);

  return (
    <GameContext.Provider value={value}>
      <InternalContext.Provider value={internal}>
        {children}
        {mode === "live" ? <LiveBoundary><GameLive store={store} /></LiveBoundary> : null}
      </InternalContext.Provider>
    </GameContext.Provider>
  );
}

const noWatchers = () => 0;
const neverChanges = () => () => {};

type Page = { page: Parameters<typeof toActivityRow>[0][]; continueCursor: string; isDone: boolean };

/**
 * The reads behind the game of a signed-in admin. All of them are existing
 * queries: who I am, the newest 50 rows of my journal (a live subscription
 * that runs only when I do something), the counts of „Za reakciju“ (the same
 * subscription the Pulse keeps) and, while the team table is on a screen,
 * the journals of the team.
 */
function GameLive({ store }: { store: GameStore }) {
  const convex = useConvex();
  const internal = useGameInternal();
  const me = useQuery(api.adminCommunications.me);
  // The table of the team is on a screen while at least one watcher exists; only then the list of admins is read.
  const wanted = useSyncExternalStore(internal?.teamWatchers.subscribe ?? neverChanges, internal?.teamWatchers.get ?? noWatchers, noWatchers) > 0;
  const admins = useQuery(api.adminTasks.listAdmins, wanted ? {} : "skip");
  const minute = useMinuteNow();
  const actorKey = me ? actorKeyOf(me.id) : null;
  const head = useQuery(api.adminActivity.list, actorKey ? { actorKey, paginationOpts: { numItems: XP_PAGE_SIZE, cursor: null } } : "skip");
  const reactions = useQuery(api.adminDashboard.reactions, { scope: "all", now: Math.floor(minute / FIVE_MINUTES) * FIVE_MINUTES, limit: 1 });
  const [ready, setReady] = useState(false);
  /** Grows when a failed read of the history is to be tried again. */
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The first read: what this browser kept, then the journal back to it (or to its first row, 20 pages at most).
  useEffect(() => {
    if (!me || !actorKey || !head) return;
    const run = `${me.id}:${attempt}`;
    if (started.current === run) return;
    started.current = run;
    if (store.userId() !== me.id) store.start(me.id);
    const through = store.through();
    void (async () => {
      let rows: ActivityRow[] = head.page.map(toActivityRow);
      let cursor = head.continueCursor;
      let done = head.isDone;
      let pages = 1;
      try {
        while (!done && pages < XP_HISTORY_PAGES && !rows.some((row) => row.occurredAt <= through)) {
          const page: Page = await convex.query(api.adminActivity.list, { actorKey, paginationOpts: { numItems: XP_PAGE_SIZE, cursor } });
          rows = rows.concat(page.page.map(toActivityRow));
          cursor = page.continueCursor;
          done = page.isDone;
          pages += 1;
        }
      } catch {
        // A read that broke off is not folded: what it has would move the mark of „read up to here“ past the
        // rows it missed, and they would never be read. The game stays empty and the read is tried again.
        if (alive.current && attempt + 1 < HISTORY_ATTEMPTS) window.setTimeout(() => alive.current && setAttempt((value) => value + 1), HISTORY_RETRY_MS);
        return;
      }
      if (!alive.current) return;
      store.dispatch({ type: "journal", rows, initial: true, complete: done ? true : undefined });
      setReady(true);
    })();
  }, [me, actorKey, head, attempt, convex, store]);

  // After that every new row of the head is news.
  useEffect(() => {
    if (ready && head) store.dispatch({ type: "journal", rows: head.page.map(toActivityRow) });
  }, [ready, head, store]);

  const counts = reactions === undefined ? undefined : reactions.counts;
  const countsState = counts === undefined ? "wait" : counts === null ? "none" : "ok";
  const urgent = counts?.urgent ?? 0;
  const needsReply = counts?.needsReply ?? 0;
  const today = counts?.today ?? 0;
  useEffect(() => {
    if (!ready || countsState === "wait") return;
    store.dispatch({ type: "counts", counts: countsState === "ok" ? { urgent, needsReply, today } : null });
  }, [ready, countsState, urgent, needsReply, today, store]);

  // The table of the team: its journals are read only while it is on a screen, when it appears and then every
  // five minutes while the tab is visible (and when the tab comes back after longer than that).
  const team = useRef<{ members: TeamMember[]; journals: Record<string, TeamJournal>; at: number } | null>(null);
  useEffect(() => {
    if (!wanted || !ready || !admins) return;
    let current = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const since = teamSince(Date.now());
      const journals: Record<string, TeamJournal> = {};
      try {
        await Promise.all(
          admins.map(async (admin) => {
            let rows: ActivityRow[] = [];
            let cursor: string | null = null;
            let done = false;
            let pages = 0;
            const reached = () => rows.length > 0 && rows[rows.length - 1].occurredAt <= since;
            while (!done && pages < TEAM_PAGES && !reached()) {
              const page: Page = await convex.query(api.adminActivity.list, { actorKey: actorKeyOf(admin.id), paginationOpts: { numItems: XP_PAGE_SIZE, cursor } });
              rows = rows.concat(page.page.map(toActivityRow));
              cursor = page.continueCursor;
              done = page.isDone;
              pages += 1;
            }
            journals[admin.id] = { rows, capped: !done && !reached() };
          }),
        );
      } catch {
        // A member whose journal did not load is unknown, not „0 XP“: the table keeps what it showed.
        return;
      }
      if (!current) return;
      team.current = { members: admins.map(({ id, name }) => ({ id, name })), journals, at: Date.now() };
      store.dispatch({ type: "team", members: team.current.members, journals });
    };
    void load();
    const timer = window.setInterval(() => void load(), TEAM_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - (team.current?.at ?? 0) >= TEAM_REFRESH_MS) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [wanted, ready, admins, convex, store]);

  // An action of mine changes my row of the table at once, from the rows already read: no new read for it.
  useEffect(() => {
    const table = team.current;
    if (!ready || !head || !me || !table || !table.journals[me.id]) return;
    const own = table.journals[me.id];
    const rows = mergeRows(own.rows, head.page.map(toActivityRow));
    if (rows.length === own.rows.length) return;
    table.journals = { ...table.journals, [me.id]: { ...own, rows } };
    store.dispatch({ type: "team", members: table.members, journals: table.journals });
  }, [ready, head, me, store]);

  return null;
}

class LiveBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    // A failed read leaves the game empty, never an error on the page.
    return this.state.failed ? null : this.props.children;
  }
}
