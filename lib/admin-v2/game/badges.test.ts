import { describe, expect, test } from "vitest";
import { BADGES, badgeDef, badgeStates, badgeTriggers, newlyEarned } from "./badges";
import { BADGE_IDS, FAIR_BADGE_IDS, PERSONAL_BADGE_IDS, type BadgeId } from "./ids";
import type { BadgeFacts, BadgeInput, BadgeState, DayLedger, StreakView, XpMark } from "./types";

const streak = (patch: Partial<StreakView> = {}): StreakView => ({ count: 0, best: 0, flame: 0, todayDone: false, brokenOn: null, since: null, ...patch });
const input = (patch: Partial<BadgeInput> = {}): BadgeInput => ({
  totals: { xp: 0, actions: 0, deliveries: 0, bestChain: 0, marks: {} },
  level: 1,
  days: {},
  streak: streak(),
  local: {},
  ...patch,
});
const withMarks = (marks: Partial<Record<XpMark, number>>, extra: { actions?: number; deliveries?: number } = {}): BadgeInput["totals"] => ({
  xp: 0,
  actions: extra.actions ?? 0,
  deliveries: extra.deliveries ?? 0,
  bestChain: 0,
  marks,
});
const state = (states: BadgeState[], id: BadgeId) => states.find((badge) => badge.id === id)!;
const down = (bossDown: number | null) => ({ work: true, clear: true, bossMax: 5, bossDown });

// Belgrade is UTC+2 in summer and UTC+1 in winter.
const SUMMER_1159 = Date.UTC(2026, 9, 13, 9, 59);
const SUMMER_1200 = Date.UTC(2026, 9, 13, 10, 0);
const WINTER_1159 = Date.UTC(2026, 11, 15, 10, 59);
const WINTER_1200 = Date.UTC(2026, 11, 15, 11, 0);

describe("BADGES", () => {
  test("twenty badges in the order of the ids", () => {
    expect(BADGES.map((badge) => badge.id)).toEqual([...BADGE_IDS]);
    expect(BADGES).toHaveLength(20);
    expect(BADGES.filter((badge) => badge.group === "personal").map((badge) => badge.id)).toEqual([...PERSONAL_BADGE_IDS]);
    expect(BADGES.filter((badge) => badge.group === "fair").map((badge) => badge.id)).toEqual([...FAIR_BADGE_IDS]);
  });
  test("rarity, group and source of every badge", () => {
    const table = BADGES.map((badge) => `${badge.id}:${badge.rarity}:${badge.group}:${badge.source}`);
    expect(table).toEqual([
      "prvi_korak:obicna:personal:server",
      "sef_je_pao:obicna:personal:local",
      "inbox_nula:obicna:personal:local",
      "nula_hitnih:retka:personal:local",
      "sef_pre_podne:retka:personal:local",
      "kombo_x3:retka:personal:server",
      "pet_u_nizu:retka:personal:local",
      "stotka:retka:personal:server",
      "kurir:retka:personal:server",
      "operater:retka:personal:server",
      "dispecer:epska:personal:server",
      "dvadeset_u_nizu:epska:personal:local",
      "prvi_u_nedelji:epska:personal:local",
      "komandant:epska:personal:server",
      "savrsena_nedelja:legendarna:personal:local",
      "legenda:legendarna:personal:server",
      "sajam_spreman:retka:fair:fair",
      "prvi_lead:retka:fair:fair",
      "rekord_sata:retka:fair:fair",
      "sto_skenova:epska:fair:fair",
    ]);
  });
  test("eight are derived again on any device, twelve in all can be shown without a bar of the fair", () => {
    expect(BADGES.filter((badge) => badge.source === "server")).toHaveLength(8);
    expect(BADGES.filter((badge) => badge.group === "personal").length).toBeGreaterThanOrEqual(12);
  });
  test("badgeDef finds each one", () => {
    for (const id of BADGE_IDS) expect(badgeDef(id).id).toBe(id);
  });
});

describe("badgeStates", () => {
  test("a fresh operator has all twenty locked, in order", () => {
    const states = badgeStates(input());
    expect(states.map((badge) => badge.id)).toEqual([...BADGE_IDS]);
    expect(states.every((badge) => badge.earnedAt === null)).toBe(true);
  });

  test("server badges come from the marks of the journal", () => {
    const states = badgeStates(
      input({
        totals: withMarks({ first: 10, chain5: 20, actions100: 30, deliveries10: 40, level6: 50, level11: 60, level16: 70, level21: 80 }),
        level: 21,
      }),
    );
    expect(state(states, "prvi_korak").earnedAt).toBe(10);
    expect(state(states, "kombo_x3").earnedAt).toBe(20);
    expect(state(states, "stotka").earnedAt).toBe(30);
    expect(state(states, "kurir").earnedAt).toBe(40);
    expect(state(states, "operater").earnedAt).toBe(50);
    expect(state(states, "dispecer").earnedAt).toBe(60);
    expect(state(states, "komandant").earnedAt).toBe(70);
    expect(state(states, "legenda").earnedAt).toBe(80);
  });

  test("local and fair badges come from the dates this browser kept", () => {
    const local = { inbox_nula: 1, nula_hitnih: 2, pet_u_nizu: 3, dvadeset_u_nizu: 4, prvi_u_nedelji: 5, sajam_spreman: 6, prvi_lead: 7, rekord_sata: 8, sto_skenova: 9 } as const;
    const states = badgeStates(input({ local }));
    for (const [id, at] of Object.entries(local)) expect(state(states, id as BadgeId).earnedAt).toBe(at);
    expect(state(states, "sef_je_pao").earnedAt).toBeNull();
  });

  test("a locked badge shows how far it is, an earned one has no bar", () => {
    const locked = badgeStates(input({ totals: withMarks({}, { actions: 140, deliveries: 4 }), level: 9, streak: streak({ best: 7 }) }));
    expect(state(locked, "stotka").progress).toEqual({ value: 100, target: 100 });
    expect(state(locked, "kurir").progress).toEqual({ value: 4, target: 10 });
    expect(state(locked, "operater").progress).toEqual({ value: 6, target: 6 });
    expect(state(locked, "dispecer").progress).toEqual({ value: 9, target: 11 });
    expect(state(locked, "komandant").progress).toEqual({ value: 9, target: 16 });
    expect(state(locked, "legenda").progress).toEqual({ value: 9, target: 21 });
    expect(state(locked, "pet_u_nizu").progress).toEqual({ value: 5, target: 5 });
    expect(state(locked, "dvadeset_u_nizu").progress).toEqual({ value: 7, target: 20 });
    expect(state(locked, "prvi_korak").progress).toBeUndefined();
    expect(state(locked, "inbox_nula").progress).toBeUndefined();

    const earned = badgeStates(input({ totals: withMarks({ actions100: 5, level6: 5 }), level: 7, local: { pet_u_nizu: 9 } }));
    expect(state(earned, "stotka").progress).toBeUndefined();
    expect(state(earned, "operater").progress).toBeUndefined();
    expect(state(earned, "pet_u_nizu").progress).toBeUndefined();
  });

  describe("šef je pao", () => {
    test("earliest victory and how many days it fell", () => {
      const days: DayLedger = { "2026-10-12": down(500), "2026-10-13": down(300), "2026-10-14": down(null), "2026-10-15": down(900) };
      const badge = state(badgeStates(input({ days })), "sef_je_pao");
      expect(badge.earnedAt).toBe(300);
      expect(badge.count).toBe(3);
    });
    test("locked without a victory, and without a count", () => {
      const badge = state(badgeStates(input({ days: { "2026-10-13": down(null) } })), "sef_je_pao");
      expect(badge.earnedAt).toBeNull();
      expect(badge.count).toBeUndefined();
    });
  });

  describe("šef pre podne", () => {
    test("11:59 in Belgrade counts, 12:00 does not (summer)", () => {
      expect(state(badgeStates(input({ days: { "2026-10-13": down(SUMMER_1159) } })), "sef_pre_podne").earnedAt).toBe(SUMMER_1159);
      expect(state(badgeStates(input({ days: { "2026-10-13": down(SUMMER_1200) } })), "sef_pre_podne").earnedAt).toBeNull();
    });
    test("11:59 in Belgrade counts, 12:00 does not (winter)", () => {
      expect(state(badgeStates(input({ days: { "2026-12-15": down(WINTER_1159) } })), "sef_pre_podne").earnedAt).toBe(WINTER_1159);
      expect(state(badgeStates(input({ days: { "2026-12-15": down(WINTER_1200) } })), "sef_pre_podne").earnedAt).toBeNull();
    });
    test("the earliest morning victory wins over an afternoon one", () => {
      const days: DayLedger = { "2026-10-13": down(SUMMER_1200), "2026-12-15": down(WINTER_1159) };
      expect(state(badgeStates(input({ days })), "sef_pre_podne").earnedAt).toBe(WINTER_1159);
    });
  });

  describe("savršena nedelja", () => {
    // 2026-10-05 is a Monday.
    const week = (...keys: string[]): DayLedger => Object.fromEntries(keys.map((key, index) => [key, down(1000 + index)]));
    test("five working days in a row", () => {
      const days = week("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09");
      expect(state(badgeStates(input({ days })), "savrsena_nedelja").earnedAt).toBe(1004);
    });
    test("across a weekend, which is skipped", () => {
      const days = week("2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13");
      expect(state(badgeStates(input({ days })), "savrsena_nedelja").earnedAt).toBe(1004);
    });
    test("a day of the weekend neither counts nor breaks", () => {
      const days = week("2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-12", "2026-10-13");
      expect(state(badgeStates(input({ days })), "savrsena_nedelja").earnedAt).toBe(1005);
    });
    test("a working day without a victory breaks the run and the bar shows the longest", () => {
      const days: DayLedger = { ...week("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-09", "2026-10-12"), "2026-10-08": down(null) };
      const badge = state(badgeStates(input({ days })), "savrsena_nedelja");
      expect(badge.earnedAt).toBeNull();
      expect(badge.progress).toEqual({ value: 3, target: 5 });
    });
    test("a day without a record breaks it too", () => {
      const days = week("2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-12");
      expect(state(badgeStates(input({ days })), "savrsena_nedelja").progress).toEqual({ value: 3, target: 5 });
    });
    test("no days, no progress", () => {
      expect(state(badgeStates(input()), "savrsena_nedelja").progress).toEqual({ value: 0, target: 5 });
    });
  });

  test("does not change its input", () => {
    const given = input({ days: { "2026-10-13": down(1) }, local: { kurir: 3 } });
    const copy = JSON.stringify(given);
    badgeStates(given);
    expect(JSON.stringify(given)).toBe(copy);
  });
});

describe("badgeTriggers", () => {
  const none = { urgent: 0, needsReply: 0, today: 0 };
  const facts = (patch: Partial<BadgeFacts> = {}, fair: Partial<BadgeFacts["fair"]> = {}): BadgeFacts => ({
    prevCounts: { urgent: 2, needsReply: 2, today: 2 },
    counts: { urgent: 2, needsReply: 2, today: 2 },
    repliedToday: false,
    resolvedToday: false,
    streak: streak(),
    wonLastWeek: false,
    fair: { ready: false, firstLead: false, hourRecordSeen: false, hourRecord: null, ...fair },
    ...patch,
  });

  test("a quiet moment awards nothing", () => {
    expect(badgeTriggers(facts())).toEqual([]);
  });
  test("inbox nula: needs reply fell to zero with a reply of mine", () => {
    const moment = facts({ counts: { urgent: 2, needsReply: 0, today: 2 }, repliedToday: true });
    expect(badgeTriggers(moment)).toEqual(["inbox_nula"]);
    expect(badgeTriggers({ ...moment, repliedToday: false })).toEqual([]);
    expect(badgeTriggers({ ...moment, prevCounts: { urgent: 2, needsReply: 0, today: 2 } })).toEqual([]);
  });
  test("nula hitnih: urgent fell to zero with an item of mine solved", () => {
    const moment = facts({ counts: { urgent: 0, needsReply: 2, today: 2 }, resolvedToday: true });
    expect(badgeTriggers(moment)).toEqual(["nula_hitnih"]);
    expect(badgeTriggers({ ...moment, resolvedToday: false })).toEqual([]);
    expect(badgeTriggers({ ...moment, prevCounts: { urgent: 0, needsReply: 2, today: 2 } })).toEqual([]);
  });
  test("both zero at once", () => {
    const moment = facts({ counts: none, repliedToday: true, resolvedToday: true });
    expect(badgeTriggers(moment)).toEqual(["inbox_nula", "nula_hitnih"]);
  });
  test("no previous read awards neither count badge", () => {
    expect(badgeTriggers(facts({ prevCounts: null, counts: none, repliedToday: true, resolvedToday: true }))).toEqual([]);
    expect(badgeTriggers(facts({ counts: null, repliedToday: true, resolvedToday: true }))).toEqual([]);
  });
  test("pet u nizu from 5 days, dvadeset from 20", () => {
    expect(badgeTriggers(facts({ streak: streak({ count: 4 }) }))).toEqual([]);
    expect(badgeTriggers(facts({ streak: streak({ count: 5 }) }))).toEqual(["pet_u_nizu"]);
    expect(badgeTriggers(facts({ streak: streak({ count: 19 }) }))).toEqual(["pet_u_nizu"]);
    expect(badgeTriggers(facts({ streak: streak({ count: 20 }) }))).toEqual(["pet_u_nizu", "dvadeset_u_nizu"]);
  });
  test("prvi u nedelji", () => {
    expect(badgeTriggers(facts({ wonLastWeek: true }))).toEqual(["prvi_u_nedelji"]);
  });
  test("the fair badges", () => {
    expect(badgeTriggers(facts({}, { ready: true }))).toEqual(["sajam_spreman"]);
    expect(badgeTriggers(facts({}, { firstLead: true }))).toEqual(["prvi_lead"]);
    expect(badgeTriggers(facts({}, { hourRecordSeen: true }))).toEqual(["rekord_sata"]);
  });
  test("sto skenova: a record of an hour of 100 or more", () => {
    expect(badgeTriggers(facts({}, { hourRecord: 99 }))).toEqual([]);
    expect(badgeTriggers(facts({}, { hourRecord: 100 }))).toEqual(["sto_skenova"]);
    expect(badgeTriggers(facts({}, { hourRecord: null }))).toEqual([]);
  });
  test("only moment badges are ever awarded", () => {
    const all = badgeTriggers(facts({ counts: none, repliedToday: true, resolvedToday: true, wonLastWeek: true, streak: streak({ count: 25 }) }, { ready: true, firstLead: true, hourRecordSeen: true, hourRecord: 500 }));
    expect(all).toHaveLength(9);
    for (const id of all) expect(badgeDef(id).source).not.toBe("server");
  });
});

describe("newlyEarned", () => {
  const locked = badgeStates(input());
  const earned = badgeStates(input({ totals: withMarks({ first: 5 }) }));

  test("the first read is a state, not an event", () => {
    expect(newlyEarned(null, earned)).toEqual([]);
  });
  test("a badge that was locked and is won now", () => {
    expect(newlyEarned(locked, earned).map((badge) => badge.id)).toEqual(["prvi_korak"]);
  });
  test("nothing changed, nothing new", () => {
    expect(newlyEarned(earned, earned)).toEqual([]);
    expect(newlyEarned(locked, locked)).toEqual([]);
  });
  test("a badge that was already won is not new again", () => {
    expect(newlyEarned(earned, badgeStates(input({ totals: withMarks({ first: 5, chain5: 9 }) }))).map((badge) => badge.id)).toEqual(["kombo_x3"]);
  });
  test("an empty previous list treats everything as locked", () => {
    expect(newlyEarned([], earned).map((badge) => badge.id)).toEqual(["prvi_korak"]);
  });
});
