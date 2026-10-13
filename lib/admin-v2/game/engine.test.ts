import { describe, expect, test } from "vitest";
import { BOSS_PENDING_MS, gameStep, gameView, initialGame, nextTickAt, type GameEffect, type GameInput, type GameState, type GameStored } from "./engine";
import { xpForLevel } from "./levels";
import { dayKey, dayStart, shiftDay } from "./time";
import type { ActivityRow, BossCounts, CeremonyPlan, XpSnapshot } from "./types";

// ADMIN v3 V4 — the engine: what the game makes of what the admin reads.

/** Tuesday 13 Oct 2026, 10:00 in Belgrade. */
const T0 = Date.UTC(2026, 9, 13, 8, 0);
const MIN = 60_000;
const ME = "user-test-ana";

const RESOLVED = "admin_v1_problem_resolved";
const REPLY = "admin_v1_conversation_reply_sent";
const SNOOZED = "admin_v1_action_snoozed";

let seq = 0;
const row = (action: string, at: number, href?: string): ActivityRow => {
  seq += 1;
  return { id: `r${seq}`, action, actorKind: "admin", occurredAt: at, href: href ?? `/admin/test/${seq}` };
};

const snapshot = (xp: number, tail: ActivityRow[] = []): XpSnapshot => ({
  v: 1,
  through: tail.length ? tail[tail.length - 1].occurredAt : T0 - 60 * MIN,
  since: T0 - 30 * 24 * 60 * MIN,
  complete: true,
  totals: { xp, actions: 12, deliveries: 0, bestChain: 1, marks: { first: T0 - 30 * 24 * 60 * MIN } },
  tail,
});

const stored = (xp: number, extra: Partial<GameStored> = {}): GameStored => ({ snapshot: snapshot(xp), days: {}, badgeDates: {}, seen: [], ...extra });

/** Runs inputs one after another; returns the last state and every effect. */
function run(state: GameState, ...inputs: GameInput[]): { state: GameState; effects: GameEffect[] } {
  const effects: GameEffect[] = [];
  for (const input of inputs) {
    const step = gameStep(state, input);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

/** A game whose journal was already read: level 3, nothing waiting to be celebrated. */
function liveGame(xp = xpForLevel(3) + 10, extra: Partial<GameStored> = {}): GameState {
  return run(initialGame(ME, stored(xp, extra)), { type: "journal", rows: [], initial: true, now: T0 }).state;
}

const COUNTS: BossCounts = { urgent: 2, needsReply: 1, today: 3 };
const plans = (effects: GameEffect[]): CeremonyPlan[] => effects.flatMap((effect) => (effect.type === "ceremony" ? [effect.plan] : []));
const bossEvents = (effects: GameEffect[]) => effects.flatMap((effect) => (effect.type === "boss" ? [effect.event] : []));

describe("the first read is the state, not news", () => {
  test("the history brings XP and badges without a spark or a ceremony", () => {
    const rows = [row(RESOLVED, T0 - 50 * MIN), row(REPLY, T0 - 30 * MIN), row(RESOLVED, T0 - 10 * MIN)];
    const { state, effects } = run(initialGame(ME, null), { type: "journal", rows, initial: true, complete: true, now: T0 });
    expect(effects).toEqual([]);
    expect(state.live).toBe(true);
    const view = gameView(state, T0);
    expect(view.operator).toMatchObject({ xp: 75, level: 1, rank: "pripravnik", todayXp: 75, complete: true });
    expect(view.badges.find((badge) => badge.id === "prvi_korak")?.earnedAt).toBe(T0 - 50 * MIN);
    // What the first read found is never celebrated later.
    expect(state.seen).toEqual(expect.arrayContaining(["level:1", "badge:prvi_korak"]));
  });

  test("before the journal is read the operator is not shown", () => {
    const state = initialGame(ME, stored(500));
    expect(gameView(state, T0)).toMatchObject({ operator: null, combo: null, streak: null, boss: { kind: "unavailable" }, team: null });
  });

  test("a level reached while away is not a ceremony on the next visit", () => {
    // The stored snapshot is 5 XP short of level 4; the catch-up read crosses it.
    const start = initialGame(ME, stored(xpForLevel(4) - 5));
    const first = run(start, { type: "journal", rows: [row(RESOLVED, T0 - 5 * MIN)], initial: true, now: T0 });
    expect(first.effects).toEqual([]);
    expect(gameView(first.state, T0).operator?.level).toBe(4);
    expect(first.state.seen).toContain("level:4");
  });
});

describe("XP of a new action", () => {
  test("a new row is a gain with its XP", () => {
    const { state, effects } = run(liveGame(), { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN });
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ type: "gain", xp: 30 });
    expect(gameView(state, T0 + MIN).operator?.todayXp).toBe(30);
  });

  test("the same row twice is one gain; a row that carries no XP is none", () => {
    const solved = row(RESOLVED, T0 + MIN);
    const once = run(liveGame(), { type: "journal", rows: [solved], now: T0 + MIN });
    const twice = run(once.state, { type: "journal", rows: [solved], now: T0 + 2 * MIN });
    expect(twice.effects).toEqual([]);
    expect(twice.state.snapshot).toBe(once.state.snapshot);
    expect(run(liveGame(), { type: "journal", rows: [row(SNOOZED, T0 + MIN)], now: T0 + MIN }).effects).toEqual([]);
  });

  test("three actions inside two minutes are a combo", () => {
    const rows = [row(RESOLVED, T0 + 1000), row(REPLY, T0 + 20_000), row(RESOLVED, T0 + 40_000)];
    const { state, effects } = run(liveGame(), ...rows.map((item): GameInput => ({ type: "journal", rows: [item], now: item.occurredAt })));
    // 30 + 15 + 30 × 2.
    expect(effects.reduce((sum, effect) => sum + (effect.type === "gain" ? effect.xp : 0), 0)).toBe(105);
    expect(gameView(state, T0 + 41_000).combo).toMatchObject({ chain: 3, multiplier: 2, toNext: 2 });
    expect(gameView(state, T0 + 40_000 + 120_001).combo).toBeNull();
  });
});

describe("a new level", () => {
  test("crossing a level is one big ceremony", () => {
    const { effects, state } = run(liveGame(xpForLevel(4) - 20), { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN });
    const [plan] = plans(effects);
    expect(plan.show).toHaveLength(1);
    expect(plan.show[0]).toMatchObject({ key: "level:4", size: "big", event: { kind: "level", level: 4, rank: "pripravnik", rankUp: false } });
    expect(state.seen).toContain("level:4");
    // The same level is never celebrated twice.
    expect(plans(run(state, { type: "journal", rows: [row(REPLY, T0 + 9 * MIN)], now: T0 + 9 * MIN }).effects)).toEqual([]);
  });

  test("the first level of a rank is a new rank, and its badge is the same ceremony", () => {
    const { effects, state } = run(liveGame(xpForLevel(6) - 20), { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN });
    const [plan] = plans(effects);
    expect(plan.show).toHaveLength(1);
    expect(plan.show[0]).toMatchObject({ key: "level:6", event: { kind: "level", level: 6, rank: "operater", rankUp: true }, alsoBadge: "operater" });
    expect(state.seen).toEqual(expect.arrayContaining(["level:6", "badge:operater"]));
    expect(gameView(state, T0 + MIN).badges.find((badge) => badge.id === "operater")?.earnedAt).toBe(T0 + MIN);
  });
});

describe("the boss of the day", () => {
  const withBoss = () => run(liveGame(), { type: "counts", counts: COUNTS, now: T0 });

  test("the first read of the counts is the state", () => {
    const { state, effects } = withBoss();
    expect(effects).toEqual([]);
    // 3 × 2 + 2 × 1 + 3.
    expect(gameView(state, T0).boss).toEqual({ kind: "alive", hp: 11, hpMax: 11, share: 1, returned: false });
    expect(state.days[dayKey(T0)]).toMatchObject({ bossMax: 11, bossDown: null, clear: false });
  });

  test("my action, then the fall: a hit of mine", () => {
    const { effects, state } = run(
      withBoss().state,
      { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN },
      { type: "counts", counts: { ...COUNTS, urgent: 1 }, now: T0 + MIN + 800 },
    );
    expect(bossEvents(effects)).toEqual([{ kind: "hit", damage: 3, mine: true }]);
    expect(gameView(state, T0 + 2 * MIN).boss).toMatchObject({ kind: "alive", hp: 8, hpMax: 11 });
  });

  test("the fall, then my action: the hit waits for the row and is still mine", () => {
    const fall = run(withBoss().state, { type: "counts", counts: { ...COUNTS, urgent: 1 }, now: T0 + MIN });
    expect(bossEvents(fall.effects)).toEqual([]);
    expect(nextTickAt(fall.state)).toBe(T0 + MIN + BOSS_PENDING_MS);
    // The bar is already shorter; only the cause is not known yet.
    expect(gameView(fall.state, T0 + MIN).boss).toMatchObject({ hp: 8 });
    const row1 = run(fall.state, { type: "journal", rows: [row(RESOLVED, T0 + MIN - 400)], now: T0 + MIN + 600 });
    expect(bossEvents(row1.effects)).toEqual([{ kind: "hit", damage: 3, mine: true }]);
    expect(nextTickAt(row1.state)).toBeNull();
  });

  test("a fall nobody of mine explains is the team's, after the wait", () => {
    const fall = run(withBoss().state, { type: "counts", counts: { ...COUNTS, today: 1 }, now: T0 + MIN });
    expect(bossEvents(run(fall.state, { type: "tick", now: T0 + MIN + BOSS_PENDING_MS - 1 }).effects)).toEqual([]);
    expect(bossEvents(run(fall.state, { type: "tick", now: T0 + MIN + BOSS_PENDING_MS }).effects)).toEqual([{ kind: "hit", damage: 2, mine: false }]);
  });

  test("a postponed item shortens the bar without damage", () => {
    const { effects } = run(
      withBoss().state,
      { type: "journal", rows: [row(SNOOZED, T0 + MIN)], now: T0 + MIN },
      { type: "counts", counts: { ...COUNTS, urgent: 1 }, now: T0 + MIN + 500 },
    );
    expect(bossEvents(effects)).toEqual([{ kind: "snoozed", damage: 3 }]);
  });

  test("new backlog gives the boss its health back, and raises the largest of the day", () => {
    const { effects, state } = run(withBoss().state, { type: "counts", counts: { ...COUNTS, urgent: 4 }, now: T0 + MIN });
    expect(bossEvents(effects)).toEqual([{ kind: "grew", amount: 6 }]);
    expect(gameView(state, T0 + MIN).boss).toMatchObject({ hp: 17, hpMax: 17 });
  });

  test("the backlog brought to zero by my action: the boss falls, once a day", () => {
    const zero: BossCounts = { urgent: 0, needsReply: 0, today: 0 };
    const down = run(
      withBoss().state,
      { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN },
      { type: "counts", counts: zero, now: T0 + MIN + 500 },
    );
    expect(bossEvents(down.effects)).toEqual([{ kind: "hit", damage: 11, mine: true }, { kind: "defeated" }]);
    const [plan] = plans(down.effects);
    expect(plan.show[0]).toMatchObject({ key: `boss:${dayKey(T0)}`, size: "big", event: { kind: "boss" } });
    // The badge of the day comes with the boss, not as a second ceremony; „Nula hitnih“ is its own.
    const keys = [...plan.show, ...plan.rest].map((item) => item.key);
    expect(keys).not.toContain("badge:sef_je_pao");
    expect(keys).toContain("badge:nula_hitnih");
    expect(down.state.seen).toContain("badge:sef_je_pao");
    expect(gameView(down.state, T0 + 2 * MIN).boss).toEqual({ kind: "down", hpMax: 11, downAt: T0 + MIN + 500 });
    expect(down.state.days[dayKey(T0)]).toMatchObject({ work: true, clear: true, bossDown: T0 + MIN + 500 });
    expect(gameView(down.state, T0 + 2 * MIN).streak).toMatchObject({ count: 1, todayDone: true });

    // New backlog brings it back; beating it again the same day is not a second victory.
    const again = run(
      down.state,
      { type: "counts", counts: { ...zero, today: 2 }, now: T0 + 5 * MIN },
      { type: "journal", rows: [row(RESOLVED, T0 + 6 * MIN)], now: T0 + 6 * MIN },
      { type: "counts", counts: zero, now: T0 + 6 * MIN + 300 },
    );
    expect(bossEvents(again.effects)).toEqual([{ kind: "grew", amount: 2 }, { kind: "hit", damage: 2, mine: true }]);
    expect(plans(again.effects)).toEqual([]);
    expect(again.state.days[dayKey(T0)].bossDown).toBe(T0 + MIN + 500);
  });

  test("a backlog that is at zero only because it was postponed is not a victory", () => {
    const one: BossCounts = { urgent: 1, needsReply: 0, today: 0 };
    const { effects, state } = run(
      liveGame(),
      { type: "counts", counts: one, now: T0 },
      { type: "journal", rows: [row(SNOOZED, T0 + MIN)], now: T0 + MIN },
      { type: "counts", counts: { ...one, urgent: 0 }, now: T0 + MIN + 300 },
    );
    expect(bossEvents(effects)).toEqual([{ kind: "snoozed", damage: 3 }]);
    expect(plans(effects)).toEqual([]);
    expect(gameView(state, T0 + 2 * MIN).boss).toMatchObject({ kind: "alive", hp: 0, hpMax: 3 });
  });

  test("counts that are not available: no bar, no hit; nothing waited: no boss", () => {
    const none = run(withBoss().state, { type: "counts", counts: null, now: T0 + MIN });
    expect(none.effects).toEqual([]);
    expect(gameView(none.state, T0 + MIN).boss).toEqual({ kind: "unavailable" });
    // The numbers coming back are a state again, not a fall.
    expect(run(none.state, { type: "counts", counts: { ...COUNTS, urgent: 0 }, now: T0 + 2 * MIN }).effects).toEqual([]);
    const calm = run(liveGame(), { type: "counts", counts: { urgent: 0, needsReply: 0, today: 0 }, now: T0 });
    expect(gameView(calm.state, T0).boss).toEqual({ kind: "none" });
  });

  test("the largest backlog of the day is kept per Belgrade day", () => {
    const { state } = run(withBoss().state, { type: "counts", counts: { ...COUNTS, today: 0 }, now: T0 + MIN }, { type: "tick", now: T0 + MIN + BOSS_PENDING_MS });
    expect(gameView(state, T0 + 2 * MIN).boss).toMatchObject({ hp: 8, hpMax: 11 });
    // The next day starts from what waits then.
    const tomorrow = dayStart(shiftDay(dayKey(T0), 1)) + 60 * MIN;
    const next = run(state, { type: "tick", now: tomorrow });
    expect(gameView(next.state, tomorrow).boss).toMatchObject({ hp: 8, hpMax: 8 });
    expect(Object.keys(next.state.days).sort()).toEqual([dayKey(T0), dayKey(tomorrow)]);
  });
});

describe("the boss belongs to the team, a victory to the one who worked", () => {
  const zero: BossCounts = { urgent: 0, needsReply: 0, today: 0 };

  test("the backlog brought to zero by the team on a day I did nothing: the bar is down, no ceremony, no badge", () => {
    const { state, effects } = run(liveGame(), { type: "counts", counts: COUNTS, now: T0 }, { type: "counts", counts: zero, now: T0 + MIN }, { type: "tick", now: T0 + MIN + BOSS_PENDING_MS });
    expect(bossEvents(effects)).toEqual([{ kind: "hit", damage: 11, mine: false }, { kind: "defeated" }]);
    expect(plans(effects)).toEqual([]);
    expect(gameView(state, T0 + 2 * MIN).boss.kind).toBe("down");
    const badges = gameView(state, T0 + 2 * MIN).badges;
    for (const id of ["sef_je_pao", "sef_pre_podne", "savrsena_nedelja", "nula_hitnih"] as const) expect(badges.find((badge) => badge.id === id)?.earnedAt, id).toBeNull();
    // The day is not written down for the streak either: it takes an action of mine.
    expect(gameView(state, T0 + 2 * MIN).streak).toMatchObject({ count: 0, todayDone: false });
  });

  test("the team brings it to zero on a day I did work: that is my day too", () => {
    const { effects } = run(
      liveGame(),
      { type: "counts", counts: COUNTS, now: T0 },
      { type: "journal", rows: [row(REPLY, T0 + MIN)], now: T0 + MIN },
      { type: "counts", counts: zero, now: T0 + 30 * MIN },
      { type: "tick", now: T0 + 30 * MIN + BOSS_PENDING_MS },
    );
    expect(bossEvents(effects).slice(-2)).toEqual([{ kind: "hit", damage: 11, mine: false }, { kind: "defeated" }]);
    expect(plans(effects).flatMap((plan) => plan.show.map((item) => item.event.kind))).toContain("boss");
  });

  test("my own postponement of the last urgent item gives neither the boss nor „Nula hitnih“", () => {
    const one: BossCounts = { urgent: 1, needsReply: 0, today: 0 };
    const { state, effects } = run(
      liveGame(),
      { type: "counts", counts: one, now: T0 },
      // I solved something else earlier today, so „resolved today“ holds.
      { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN },
      { type: "journal", rows: [row(SNOOZED, T0 + 20 * MIN)], now: T0 + 20 * MIN },
      { type: "counts", counts: zero, now: T0 + 20 * MIN + 400 },
    );
    expect(bossEvents(effects)).toEqual([{ kind: "snoozed", damage: 3 }]);
    expect(state.badgeDates.nula_hitnih).toBeUndefined();
    expect(plans(effects).flatMap((plan) => plan.show.map((item) => item.key))).not.toContain(`boss:${dayKey(T0)}`);
  });

  test("the clock of the browser a minute ahead of the server: my hit is still mine, my postponement still a postponement", () => {
    // The rows carry the time of the server (a minute behind); what counts is when this browser saw them arrive.
    const ahead = 60_000;
    const hit = run(
      liveGame(),
      { type: "counts", counts: COUNTS, now: T0 },
      { type: "counts", counts: { ...COUNTS, urgent: 1 }, now: T0 + MIN + ahead },
      { type: "journal", rows: [row(RESOLVED, T0 + MIN - 300)], now: T0 + MIN + ahead + 500 },
    );
    expect(bossEvents(hit.effects)).toEqual([{ kind: "hit", damage: 3, mine: true }]);
    const snooze = run(
      liveGame(),
      { type: "counts", counts: COUNTS, now: T0 },
      { type: "journal", rows: [row(SNOOZED, T0 + MIN - 300)], now: T0 + MIN + ahead },
      { type: "counts", counts: { ...COUNTS, urgent: 1 }, now: T0 + MIN + ahead + 500 },
    );
    expect(bossEvents(snooze.effects)).toEqual([{ kind: "snoozed", damage: 3 }]);
  });

  test("a boss that falls seconds before midnight fell on that day, also when it is settled after midnight", () => {
    const midnight = dayStart(shiftDay(dayKey(T0), 1));
    const late = run(
      liveGame(),
      { type: "counts", counts: COUNTS, now: midnight - 60 * MIN },
      { type: "journal", rows: [row(RESOLVED, midnight - 30 * MIN)], now: midnight - 30 * MIN },
      { type: "counts", counts: zero, now: midnight - 1000 },
      { type: "tick", now: midnight + 2500 },
    );
    expect(late.state.days[dayKey(T0)]).toMatchObject({ bossDown: midnight - 1000, clear: true });
    expect(late.state.days[dayKey(midnight)]?.bossDown ?? null).toBeNull();
    expect(plans(late.effects).flatMap((plan) => plan.show.map((item) => item.key))).toContain(`boss:${dayKey(T0)}`);
  });
});

describe("badges that are a moment", () => {
  test("„Inbox nula“: waiting for a reply falls to zero on a day I replied", () => {
    const { state, effects } = run(
      liveGame(),
      { type: "counts", counts: { urgent: 0, needsReply: 2, today: 0 }, now: T0 },
      { type: "journal", rows: [row(REPLY, T0 + MIN)], now: T0 + MIN },
      { type: "counts", counts: { urgent: 0, needsReply: 0, today: 0 }, now: T0 + MIN + 400 },
    );
    expect(state.badgeDates.inbox_nula).toBe(T0 + MIN + 400);
    expect(plans(effects).flatMap((plan) => [...plan.show, ...plan.rest].map((item) => item.key))).toContain("badge:inbox_nula");
    // The date is written once.
    const later = run(state, { type: "counts", counts: { urgent: 0, needsReply: 1, today: 0 }, now: T0 + 9 * MIN }, { type: "counts", counts: { urgent: 0, needsReply: 0, today: 0 }, now: T0 + 10 * MIN });
    expect(later.state.badgeDates.inbox_nula).toBe(T0 + MIN + 400);
  });

  test("a fair badge from the facts of a fair page: an epic one is a big ceremony", () => {
    const { state, effects } = run(liveGame(), { type: "fair", fair: { hourRecord: 120 }, now: T0 + MIN });
    expect(state.badgeDates.sto_skenova).toBe(T0 + MIN);
    expect(plans(effects)[0].show[0]).toMatchObject({ key: "badge:sto_skenova", size: "big" });
    // The facts are kept: a later, smaller number does not take the record back.
    const later = run(state, { type: "fair", fair: { hourRecord: 40, ready: true }, now: T0 + 2 * MIN });
    expect(later.state.fair).toMatchObject({ hourRecord: 120, ready: true });
    expect(later.state.badgeDates.sajam_spreman).toBe(T0 + 2 * MIN);
  });

  test("a record of the fair is a card, once per key", () => {
    const first = run(liveGame(), { type: "record", key: "hour:d1|14", title: "TEST rekord", now: T0 + MIN });
    expect(plans(first.effects)[0].show[0]).toMatchObject({ key: "record:hour:d1|14", size: "card", event: { kind: "record", title: "TEST rekord" } });
    expect(plans(run(first.state, { type: "record", key: "hour:d1|14", title: "TEST rekord", now: T0 + 2 * MIN }).effects)).toEqual([]);
  });

  test("badges kept in this browser are there from the start and are not celebrated again", () => {
    const state = liveGame(undefined, { badgeDates: { inbox_nula: T0 - 9 * MIN } });
    expect(gameView(state, T0).badges.find((badge) => badge.id === "inbox_nula")?.earnedAt).toBe(T0 - 9 * MIN);
    expect(state.seen).toContain("badge:inbox_nula");
  });
});

describe("the team", () => {
  const members = [{ id: ME, name: "TEST Ana" }, { id: "user-test-marko", name: "TEST Marko" }];

  test("the table of the week comes from the journals of the members", () => {
    const journals = {
      [ME]: { rows: [row(RESOLVED, T0 - 60 * MIN), row(REPLY, T0 - 30 * MIN)], capped: false },
      "user-test-marko": { rows: [row(RESOLVED, T0 - 20 * MIN)], capped: false },
    };
    const { state } = run(liveGame(), { type: "team", members, journals, now: T0 });
    const board = gameView(state, T0).team;
    expect(board?.rows.map((item) => [item.name, item.xp, item.rank, item.me])).toEqual([["TEST Ana", 45, 1, true], ["TEST Marko", 30, 2, false]]);
  });

  test("first place at the end of last week is a badge, dated when it was seen", () => {
    const lastWeek = T0 - 7 * 24 * 60 * MIN;
    const journals = { [ME]: { rows: [row(RESOLVED, lastWeek)], capped: false }, "user-test-marko": { rows: [], capped: false } };
    const { state } = run(liveGame(), { type: "team", members, journals, now: T0 });
    expect(state.badgeDates.prvi_u_nedelji).toBe(T0);
    const other = run(liveGame(), { type: "team", members, journals: { [ME]: { rows: [], capped: false }, "user-test-marko": { rows: [row(RESOLVED, lastWeek)], capped: false } }, now: T0 });
    expect(other.state.badgeDates.prvi_u_nedelji).toBeUndefined();
    // A member whose journal was not read is unknown, not empty: nobody is called first then.
    const unknown = run(liveGame(), { type: "team", members, journals: { [ME]: { rows: [row(RESOLVED, lastWeek)], capped: false } }, now: T0 });
    expect(unknown.state.badgeDates.prvi_u_nedelji).toBeUndefined();
  });
});

describe("the engine is pure", () => {
  test("a step never changes the state it was given", () => {
    const before = liveGame();
    const copy = JSON.stringify(before);
    run(before, { type: "counts", counts: COUNTS, now: T0 }, { type: "journal", rows: [row(RESOLVED, T0 + MIN)], now: T0 + MIN }, { type: "fair", fair: { firstLead: true }, now: T0 + MIN });
    expect(JSON.stringify(before)).toBe(copy);
  });
});
