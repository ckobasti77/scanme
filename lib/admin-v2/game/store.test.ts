import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GameEffect } from "./engine";
import { BOSS_PENDING_MS } from "./engine";
import { GAME_KEYS } from "./ledger";
import { XP_SNAPSHOT_PREFIX } from "./snapshot";
import { createGameStore } from "./store";
import type { ActivityRow } from "./types";

// ADMIN v3 V4 — the store of the game: the engine, what it keeps in the browser and its timers.

const T0 = Date.UTC(2026, 9, 13, 8, 0);
const ME = "user-test-ana";
let seq = 0;
const row = (action: string, at: number): ActivityRow => ({ id: `s${++seq}`, action, actorKind: "admin", occurredAt: at, href: `/admin/test/${seq}` });

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the game store", () => {
  test("before it starts it is an empty game and ignores what it is told", () => {
    const store = createGameStore();
    store.dispatch({ type: "counts", counts: { urgent: 1, needsReply: 0, today: 0 } });
    expect(store.started()).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ view: { operator: null, boss: { kind: "unavailable" }, badges: [], team: null }, bossEvent: null, gain: null });
  });

  test("what the engine keeps is written to the browser and read on the next start", () => {
    const storage = memoryStorage();
    const first = createGameStore({ storage: () => storage });
    first.start(ME);
    first.dispatch({ type: "journal", rows: [row("admin_v1_problem_resolved", T0 - 60_000)], initial: true, complete: true });
    first.dispatch({ type: "counts", counts: { urgent: 0, needsReply: 0, today: 2 } });
    expect([...storage.map.keys()].sort()).toEqual([GAME_KEYS.days + ME, GAME_KEYS.seen + ME, XP_SNAPSHOT_PREFIX + ME].sort());

    const second = createGameStore({ storage: () => storage });
    second.start(ME);
    expect(second.through()).toBe(T0 - 60_000);
    second.dispatch({ type: "journal", rows: [], initial: true });
    expect(second.getSnapshot().view.operator).toMatchObject({ xp: 30, complete: true });
    // Another person on the same browser starts from nothing.
    const other = createGameStore({ storage: () => storage });
    other.start("user-test-marko");
    expect(other.through()).toBe(0);
  });

  test("a storage that throws, and no storage at all, never break the game", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    for (const storage of [() => broken, () => null]) {
      const store = createGameStore({ storage });
      store.start(ME);
      store.dispatch({ type: "journal", rows: [row("admin_v1_problem_resolved", T0 - 60_000)], initial: true });
      expect(store.getSnapshot().view.operator?.xp).toBe(30);
    }
  });

  test("effects reach the listeners, and the last gain and boss event are on the snapshot", () => {
    const store = createGameStore();
    const effects: GameEffect[] = [];
    store.onEffect((effect) => effects.push(effect));
    store.start(ME);
    // The history already has an action, so the next one is not the badge of the first step.
    store.dispatch({ type: "journal", rows: [row("admin_v1_task_created", T0 - 3_600_000)], initial: true });
    store.dispatch({ type: "counts", counts: { urgent: 2, needsReply: 0, today: 0 } });
    vi.setSystemTime(T0 + 1000);
    store.dispatch({ type: "journal", rows: [row("admin_v1_problem_resolved", T0 + 900)] });
    store.dispatch({ type: "counts", counts: { urgent: 1, needsReply: 0, today: 0 } });
    expect(effects.map((effect) => effect.type)).toEqual(["gain", "boss"]);
    const snapshot = store.getSnapshot();
    expect(snapshot.gain?.xp).toBe(30);
    expect(snapshot.bossEvent).toMatchObject({ kind: "hit", damage: 3, mine: true });
    // Every event has its own sequence number, so the same event twice is shown twice.
    expect(snapshot.bossEvent?.seq).not.toBe(snapshot.gain?.seq);
  });

  test("a fall nobody explains is settled by the store's own timer", () => {
    const store = createGameStore();
    const seen: string[] = [];
    store.start(ME);
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().bossEvent?.kind ?? "-"));
    store.dispatch({ type: "journal", rows: [], initial: true });
    store.dispatch({ type: "counts", counts: { urgent: 2, needsReply: 0, today: 0 } });
    vi.setSystemTime(T0 + 1000);
    store.dispatch({ type: "counts", counts: { urgent: 1, needsReply: 0, today: 0 } });
    expect(store.getSnapshot().bossEvent).toBeNull();
    vi.advanceTimersByTime(BOSS_PENDING_MS + 10);
    expect(store.getSnapshot().bossEvent).toMatchObject({ kind: "hit", damage: 3, mine: false });
    unsubscribe();
  });

  test("the combo leaves the view by itself when its two minutes run out", () => {
    const store = createGameStore();
    store.start(ME);
    const unsubscribe = store.subscribe(() => {});
    store.dispatch({ type: "journal", rows: [], initial: true });
    // The newer row is a little ahead of the browser clock (the time of the server): it still counts.
    store.dispatch({ type: "journal", rows: [row("admin_v1_problem_resolved", T0 - 500), row("admin_v1_conversation_reply_sent", T0 + 10)] });
    expect(store.getSnapshot().view.combo).toMatchObject({ chain: 2, multiplier: 1, expiresAt: T0 + 10 + 120_000 });
    vi.advanceTimersByTime(120_100);
    expect(store.getSnapshot().view.combo).toBeNull();
    unsubscribe();
  });

  test("without a subscriber no timer is left running", () => {
    const store = createGameStore();
    store.start(ME);
    const unsubscribe = store.subscribe(() => {});
    expect(vi.getTimerCount()).toBe(1);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("what a fair page tells before the game starts is kept and told again at the start", () => {
    const store = createGameStore();
    store.dispatch({ type: "fair", fair: { firstLead: true } });
    store.dispatch({ type: "fair", fair: { hourRecord: 120 } });
    expect(store.live()).toBe(false);
    store.start(ME);
    store.dispatch({ type: "journal", rows: [], initial: true });
    expect(store.live()).toBe(true);
    const earned = store.getSnapshot().view.badges.filter((badge) => badge.earnedAt !== null).map((badge) => badge.id);
    expect(earned).toEqual(expect.arrayContaining(["prvi_lead", "sto_skenova"]));
  });

  test("two tabs of one person: a tab keeps what the other one wrote", () => {
    const storage = memoryStorage();
    const first = createGameStore({ storage: () => storage });
    const second = createGameStore({ storage: () => storage });
    for (const store of [first, second]) {
      store.start(ME);
      store.dispatch({ type: "journal", rows: [], initial: true });
    }
    first.dispatch({ type: "fair", fair: { firstLead: true } });
    vi.setSystemTime(T0 + 60_000);
    // The second tab read the storage before the first one wrote: its own write must not take the badge back.
    second.dispatch({ type: "fair", fair: { hourRecord: 120, firstLead: true } });
    const dates = JSON.parse(storage.map.get(GAME_KEYS.badges + ME) ?? "{}") as Record<string, number>;
    expect(dates).toMatchObject({ prvi_lead: T0, sto_skenova: T0 + 60_000 });
    const seen = JSON.parse(storage.map.get(GAME_KEYS.seen + ME) ?? "[]") as string[];
    expect(seen).toEqual(expect.arrayContaining(["badge:prvi_lead", "badge:sto_skenova"]));
  });

  test("the snapshot keeps its identity between changes (a stable value for React)", () => {
    const store = createGameStore();
    store.start(ME);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.dispatch({ type: "journal", rows: [], initial: true });
    expect(store.getSnapshot()).not.toBe(first);
  });
});
