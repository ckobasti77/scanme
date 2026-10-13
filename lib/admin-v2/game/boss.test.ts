import { describe, expect, test } from "vitest";
import { BOSS_MINE_MS, BOSS_WEIGHTS, EMPTY_DAY, advanceDay, bossHp, bossStep, bossView } from "./boss";
import type { DayRecord } from "./types";

const day = (patch: Partial<DayRecord> = {}): DayRecord => ({ ...EMPTY_DAY, ...patch });
const NOW = 1_800_000_000_000;
const ctx = (patch: Partial<Parameters<typeof bossStep>[2]> = {}) => ({ now: NOW, lastXpAt: null, lastSnoozeAt: null, day: undefined, ...patch });

describe("bossHp", () => {
  test("weights urgent 3, needs reply 2, today 1", () => {
    expect(BOSS_WEIGHTS).toEqual({ urgent: 3, needsReply: 2, today: 1 });
    expect(bossHp({ urgent: 2, needsReply: 3, today: 4 })).toBe(6 + 6 + 4);
  });
  test("zero counts give zero health", () => {
    expect(bossHp({ urgent: 0, needsReply: 0, today: 0 })).toBe(0);
  });
  test("each count is weighed alone", () => {
    expect(bossHp({ urgent: 1, needsReply: 0, today: 0 })).toBe(3);
    expect(bossHp({ urgent: 0, needsReply: 1, today: 0 })).toBe(2);
    expect(bossHp({ urgent: 0, needsReply: 0, today: 1 })).toBe(1);
  });
});

describe("bossView", () => {
  test("counts null is unavailable, whatever the day says", () => {
    expect(bossView(null, undefined)).toEqual({ kind: "unavailable" });
    expect(bossView(null, day({ bossMax: 9, bossDown: 5 }))).toEqual({ kind: "unavailable" });
  });
  test("nothing waited all day: no boss and no victory", () => {
    expect(bossView({ urgent: 0, needsReply: 0, today: 0 }, undefined)).toEqual({ kind: "none" });
    expect(bossView({ urgent: 0, needsReply: 0, today: 0 }, day())).toEqual({ kind: "none" });
  });
  test("alive: share is hp over the largest backlog of the day", () => {
    expect(bossView({ urgent: 1, needsReply: 1, today: 0 }, day({ bossMax: 10 }))).toEqual({ kind: "alive", hp: 5, hpMax: 10, share: 0.5, returned: false });
  });
  test("without a record of the day the current hp is its own maximum", () => {
    expect(bossView({ urgent: 0, needsReply: 0, today: 4 }, undefined)).toEqual({ kind: "alive", hp: 4, hpMax: 4, share: 1, returned: false });
  });
  test("hpMax grows when the backlog exceeds the record", () => {
    const view = bossView({ urgent: 4, needsReply: 0, today: 0 }, day({ bossMax: 5 }));
    expect(view).toMatchObject({ kind: "alive", hp: 12, hpMax: 12, share: 1 });
  });
  test("down: zero health after a victory", () => {
    expect(bossView({ urgent: 0, needsReply: 0, today: 0 }, day({ bossMax: 8, bossDown: NOW }))).toEqual({ kind: "down", hpMax: 8, downAt: NOW });
  });
  test("returned: beaten earlier, new backlog arrived", () => {
    expect(bossView({ urgent: 0, needsReply: 0, today: 2 }, day({ bossMax: 8, bossDown: NOW }))).toMatchObject({ kind: "alive", hp: 2, returned: true });
  });
  test("zero health without a victory stays alive (only postponed)", () => {
    expect(bossView({ urgent: 0, needsReply: 0, today: 0 }, day({ bossMax: 8 }))).toEqual({ kind: "alive", hp: 0, hpMax: 8, share: 0, returned: false });
  });
});

describe("bossStep", () => {
  test("the first read is a state, not an event", () => {
    expect(bossStep(null, 5, ctx())).toEqual([]);
    expect(bossStep(null, 0, ctx())).toEqual([]);
  });
  test("no change is no event", () => {
    expect(bossStep(5, 5, ctx({ lastXpAt: NOW }))).toEqual([]);
  });
  test("a team hit: the backlog fell with no action of mine", () => {
    expect(bossStep(10, 7, ctx())).toEqual([{ kind: "hit", damage: 3, mine: false }]);
  });
  test("a hit of mine: an action with XP within 10 s", () => {
    expect(BOSS_MINE_MS).toBe(10_000);
    expect(bossStep(10, 7, ctx({ lastXpAt: NOW - 10_000 }))).toEqual([{ kind: "hit", damage: 3, mine: true }]);
    expect(bossStep(10, 7, ctx({ lastXpAt: NOW - 10_001 }))).toEqual([{ kind: "hit", damage: 3, mine: false }]);
  });
  test("a postponement is no damage and no victory", () => {
    expect(bossStep(10, 7, ctx({ lastSnoozeAt: NOW - 2000 }))).toEqual([{ kind: "snoozed", damage: 3 }]);
    expect(bossStep(3, 0, ctx({ lastSnoozeAt: NOW - 2000 }))).toEqual([{ kind: "snoozed", damage: 3 }]);
    expect(bossStep(3, 0, ctx({ lastSnoozeAt: NOW - 10_000 }))).toEqual([{ kind: "snoozed", damage: 3 }]);
  });
  test("an old postponement is not counted", () => {
    expect(bossStep(10, 7, ctx({ lastSnoozeAt: NOW - 10_001 }))).toEqual([{ kind: "hit", damage: 3, mine: false }]);
  });
  test("an action of mine after the postponement makes it a hit", () => {
    expect(bossStep(10, 7, ctx({ lastSnoozeAt: NOW - 5000, lastXpAt: NOW - 1000 }))).toEqual([{ kind: "hit", damage: 3, mine: true }]);
    expect(bossStep(10, 7, ctx({ lastSnoozeAt: NOW - 1000, lastXpAt: NOW - 5000 }))).toEqual([{ kind: "snoozed", damage: 3 }]);
  });
  test("growth reports the amount", () => {
    expect(bossStep(4, 9, ctx())).toEqual([{ kind: "grew", amount: 5 }]);
    expect(bossStep(0, 2, ctx({ lastXpAt: NOW }))).toEqual([{ kind: "grew", amount: 2 }]);
  });
  test("reaching zero defeats the boss once a day", () => {
    expect(bossStep(3, 0, ctx({ lastXpAt: NOW - 100 }))).toEqual([{ kind: "hit", damage: 3, mine: true }, { kind: "defeated" }]);
    expect(bossStep(3, 0, ctx({ day: day({ bossMax: 9 }) }))).toEqual([{ kind: "hit", damage: 3, mine: false }, { kind: "defeated" }]);
    expect(bossStep(3, 0, ctx({ day: day({ bossMax: 9, bossDown: NOW - 1000 }) }))).toEqual([{ kind: "hit", damage: 3, mine: false }]);
  });
  test("a fall that does not reach zero never defeats", () => {
    expect(bossStep(3, 1, ctx())).toEqual([{ kind: "hit", damage: 2, mine: false }]);
  });
});

describe("advanceDay", () => {
  const facts = { hp: null, urgent: null, work: false, defeatedAt: null };
  test("nothing known on an unseen day returns the empty record", () => {
    expect(advanceDay(undefined, facts)).toBe(EMPTY_DAY);
  });
  test("the largest backlog is kept", () => {
    expect(advanceDay(undefined, { ...facts, hp: 7 }).bossMax).toBe(7);
    expect(advanceDay(day({ bossMax: 9 }), { ...facts, hp: 4 }).bossMax).toBe(9);
    expect(advanceDay(day({ bossMax: 3 }), { ...facts, hp: 4 }).bossMax).toBe(4);
  });
  test("work is a fact that stays", () => {
    expect(advanceDay(undefined, { ...facts, work: true }).work).toBe(true);
    expect(advanceDay(day({ work: true }), facts).work).toBe(true);
  });
  test("urgent at zero clears the day, any other count does not", () => {
    expect(advanceDay(undefined, { ...facts, urgent: 0 }).clear).toBe(true);
    expect(advanceDay(undefined, { ...facts, urgent: 2 }).clear).toBe(false);
    expect(advanceDay(day({ clear: true }), { ...facts, urgent: 2 }).clear).toBe(true);
  });
  test("the first victory is kept and clears the day", () => {
    const first = advanceDay(day({ bossMax: 5 }), { ...facts, hp: 0, defeatedAt: 111 });
    expect(first).toEqual({ work: false, clear: true, bossMax: 5, bossDown: 111 });
    expect(advanceDay(first, { ...facts, defeatedAt: 222 }).bossDown).toBe(111);
  });
  test("returns the same object when nothing changes", () => {
    const record = day({ work: true, clear: true, bossMax: 6, bossDown: 5 });
    expect(advanceDay(record, { hp: 4, urgent: 0, work: true, defeatedAt: 9 })).toBe(record);
    expect(advanceDay(record, facts)).toBe(record);
  });
  test("does not change its input", () => {
    const record = day({ bossMax: 1 });
    const copy = { ...record };
    advanceDay(record, { hp: 5, urgent: 0, work: true, defeatedAt: 3 });
    expect(record).toEqual(copy);
    expect(EMPTY_DAY).toEqual({ work: false, clear: false, bossMax: 0, bossDown: null });
  });
});
