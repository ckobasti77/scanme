// ADMIN v3 V4 — the badges (plan §6.6): 16 of one operator's work and 4 of the
// fair. Pure: a badge is earned when its condition holds over the totals of the
// server journal (any device derives it again), the record of the days of this
// browser, or a date this browser kept for a moment it saw. `badgeTriggers`
// says which of those moments a read just made.

import { BADGE_IDS, type BadgeId, type Rarity } from "./ids";
import { belgradeHour, isWorkday, shiftDay } from "./time";
import type { BadgeDef, BadgeFacts, BadgeInput, BadgeSource, BadgeState, DayLedger, XpMark } from "./types";

const def = (id: BadgeId, rarity: Rarity, group: BadgeDef["group"], source: BadgeSource): BadgeDef => ({ id, rarity, group, source });

/** The twenty badges, in the order of BADGE_IDS. */
export const BADGES: readonly BadgeDef[] = [
  def("prvi_korak", "obicna", "personal", "server"),
  def("sef_je_pao", "obicna", "personal", "local"),
  def("inbox_nula", "obicna", "personal", "local"),
  def("nula_hitnih", "retka", "personal", "local"),
  def("sef_pre_podne", "retka", "personal", "local"),
  def("kombo_x3", "retka", "personal", "server"),
  def("pet_u_nizu", "retka", "personal", "local"),
  def("stotka", "retka", "personal", "server"),
  def("kurir", "retka", "personal", "server"),
  def("operater", "retka", "personal", "server"),
  def("dispecer", "epska", "personal", "server"),
  def("dvadeset_u_nizu", "epska", "personal", "local"),
  def("prvi_u_nedelji", "epska", "personal", "local"),
  def("komandant", "epska", "personal", "server"),
  def("savrsena_nedelja", "legendarna", "personal", "local"),
  def("legenda", "legendarna", "personal", "server"),
  def("sajam_spreman", "retka", "fair", "fair"),
  def("prvi_lead", "retka", "fair", "fair"),
  def("rekord_sata", "retka", "fair", "fair"),
  def("sto_skenova", "epska", "fair", "fair"),
];

export function badgeDef(id: BadgeId): BadgeDef {
  return BADGES.find((badge) => badge.id === id) ?? BADGES[0];
}

/**
 * The earliest moment of the days the boss fell on and that pass `keep`; with how many days passed it.
 * The boss belongs to the team, a badge to one operator: only a day I worked on counts (`work`: at least
 * one action of mine carried XP that day).
 */
function bossDowns(days: DayLedger, keep: (at: number) => boolean = () => true): { first: number | null; count: number } {
  let first: number | null = null;
  let count = 0;
  for (const day of Object.values(days)) {
    if (day.bossDown === null || !day.work || !keep(day.bossDown)) continue;
    count += 1;
    if (first === null || day.bossDown < first) first = day.bossDown;
  }
  return { first, count };
}

/**
 * Five working days in a row, each with a beaten boss (a weekend is skipped, not
 * counted and not breaking): when the fifth fell, and the longest such run.
 */
function perfectWeek(days: DayLedger): { earnedAt: number | null; longest: number } {
  const keys = Object.keys(days).sort();
  if (keys.length === 0) return { earnedAt: null, longest: 0 };
  let run = 0;
  let longest = 0;
  let earnedAt: number | null = null;
  const last = keys[keys.length - 1];
  for (let key = keys[0]; key <= last; key = shiftDay(key, 1)) {
    if (!isWorkday(key)) continue;
    // A day the team beat the boss without me is not a day of my week.
    const down = days[key]?.work ? days[key].bossDown : null;
    if (down === null) {
      run = 0;
      continue;
    }
    run += 1;
    longest = Math.max(longest, run);
    if (run === 5 && earnedAt === null) earnedAt = down;
  }
  return { earnedAt, longest: Math.min(longest, 5) };
}

/** All twenty badges with when they were won (null: locked) and how far a locked one is. */
export function badgeStates(input: BadgeInput): BadgeState[] {
  const { totals, level, days, streak, local } = input;
  const marks = totals.marks;
  const bossAll = bossDowns(days);
  const bossEarly = bossDowns(days, (at) => belgradeHour(at) < 12);
  const week = perfectWeek(days);

  const mark = (key: XpMark) => marks[key] ?? null;
  const progress = (value: number, target: number) => ({ value: Math.min(value, target), target });

  const earned: Record<BadgeId, number | null> = {
    prvi_korak: mark("first"),
    sef_je_pao: bossAll.first,
    inbox_nula: local.inbox_nula ?? null,
    nula_hitnih: local.nula_hitnih ?? null,
    sef_pre_podne: bossEarly.first,
    kombo_x3: mark("chain5"),
    pet_u_nizu: local.pet_u_nizu ?? null,
    stotka: mark("actions100"),
    kurir: mark("deliveries10"),
    operater: mark("level6"),
    dispecer: mark("level11"),
    dvadeset_u_nizu: local.dvadeset_u_nizu ?? null,
    prvi_u_nedelji: local.prvi_u_nedelji ?? null,
    komandant: mark("level16"),
    savrsena_nedelja: week.earnedAt,
    legenda: mark("level21"),
    sajam_spreman: local.sajam_spreman ?? null,
    prvi_lead: local.prvi_lead ?? null,
    rekord_sata: local.rekord_sata ?? null,
    sto_skenova: local.sto_skenova ?? null,
  };

  // How far a locked badge is; the rest have no bar.
  const bars: Partial<Record<BadgeId, { value: number; target: number }>> = {
    pet_u_nizu: progress(streak.best, 5),
    stotka: progress(totals.actions, 100),
    kurir: progress(totals.deliveries, 10),
    operater: progress(level, 6),
    dispecer: progress(level, 11),
    dvadeset_u_nizu: progress(streak.best, 20),
    komandant: progress(level, 16),
    savrsena_nedelja: progress(week.longest, 5),
    legenda: progress(level, 21),
  };

  return BADGE_IDS.map((id): BadgeState => {
    const base = badgeDef(id);
    const earnedAt = earned[id];
    if (earnedAt !== null) return id === "sef_je_pao" ? { ...base, earnedAt, count: bossAll.count } : { ...base, earnedAt };
    const bar = bars[id];
    return bar ? { ...base, earnedAt: null, progress: bar } : { ...base, earnedAt: null };
  });
}

/**
 * The badges the facts of THIS moment award. The caller writes the date of the
 * ones it does not have yet. Without a previous read nothing is awarded for a
 * count that fell: the first read is a state, not an event.
 */
export function badgeTriggers(facts: BadgeFacts): BadgeId[] {
  const out: BadgeId[] = [];
  const { prevCounts, counts, fair } = facts;
  if (prevCounts !== null && counts !== null) {
    if (prevCounts.needsReply > 0 && counts.needsReply === 0 && facts.repliedToday) out.push("inbox_nula");
    if (prevCounts.urgent > 0 && counts.urgent === 0 && facts.resolvedToday) out.push("nula_hitnih");
  }
  if (facts.streak.count >= 5) out.push("pet_u_nizu");
  if (facts.streak.count >= 20) out.push("dvadeset_u_nizu");
  if (facts.wonLastWeek) out.push("prvi_u_nedelji");
  if (fair.ready) out.push("sajam_spreman");
  if (fair.firstLead) out.push("prvi_lead");
  if (fair.hourRecordSeen) out.push("rekord_sata");
  if (fair.hourRecord !== null && fair.hourRecord >= 100) out.push("sto_skenova");
  return out;
}

/** The badges that were locked in `previous` and are won in `next`; the first read (null) awards nothing. */
export function newlyEarned(previous: readonly BadgeState[] | null, next: readonly BadgeState[]): BadgeState[] {
  if (previous === null) return [];
  const before = new Map(previous.map((badge) => [badge.id, badge.earnedAt] as const));
  return next.filter((badge) => badge.earnedAt !== null && (before.get(badge.id) ?? null) === null);
}
