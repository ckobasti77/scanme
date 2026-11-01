// ADMIN v3 V4 — the boss of the day (plan §6.4). Pure: the backlog of „Za
// reakciju“ is the boss, its health is a weighted sum of the three counts, a hit
// is a fall between two reads. A postponement is not a hit and never a victory;
// nothing here draws or reads the clock itself.

import type { BossCounts, BossEvent, BossView, DayRecord } from "./types";

/** Health per item: an urgent item weighs most, what is only on today's list least. */
export const BOSS_WEIGHTS = { urgent: 3, needsReply: 2, today: 1 } as const;
/** A fall of the backlog is mine when an action of mine carried XP in this window before it (ms). */
export const BOSS_MINE_MS = 10_000;

/** A day nothing was seen on. */
export const EMPTY_DAY: DayRecord = { work: false, clear: false, bossMax: 0, bossDown: null };

/** 3 × urgent + 2 × needsReply + today. */
export function bossHp(counts: BossCounts): number {
  return BOSS_WEIGHTS.urgent * counts.urgent + BOSS_WEIGHTS.needsReply * counts.needsReply + BOSS_WEIGHTS.today * counts.today;
}

/** What the boss looks like now: `hpMax` is the largest backlog this browser saw today. */
export function bossView(counts: BossCounts | null, day: DayRecord | undefined): BossView {
  if (counts === null) return { kind: "unavailable" };
  const hp = bossHp(counts);
  const hpMax = Math.max(day?.bossMax ?? 0, hp);
  if (hpMax === 0) return { kind: "none" };
  const down = day?.bossDown ?? null;
  if (hp === 0 && down !== null) return { kind: "down", hpMax, downAt: down };
  // hp 0 without a victory: everything left is only postponed, so the boss is not beaten.
  return { kind: "alive", hp, hpMax, share: hp / hpMax, returned: down !== null };
}

export type BossStepContext = {
  now: number;
  /** The last action of mine that carried XP (server time); null: none known. */
  lastXpAt: number | null;
  /** The last postponement of mine (server time); null: none known. */
  lastSnoozeAt: number | null;
  day: DayRecord | undefined;
};

// A moment counts as recent when it is at most BOSS_MINE_MS before now; a moment ahead of now (clock skew) counts too.
const recent = (at: number | null, now: number): at is number => at !== null && now - at <= BOSS_MINE_MS;

/** What happened to the boss between two reads of the counts. The first read (no previous) is a state, not an event. */
export function bossStep(prevHp: number | null, hp: number, ctx: BossStepContext): BossEvent[] {
  if (prevHp === null) return [];
  if (hp > prevHp) return [{ kind: "grew", amount: hp - prevHp }];
  if (hp === prevHp) return [];
  const damage = prevHp - hp;
  // The postponement wins unless an action of mine that carried XP came after it.
  if (recent(ctx.lastSnoozeAt, ctx.now) && (ctx.lastXpAt === null || ctx.lastSnoozeAt >= ctx.lastXpAt)) return [{ kind: "snoozed", damage }];
  const events: BossEvent[] = [{ kind: "hit", damage, mine: recent(ctx.lastXpAt, ctx.now) }];
  if (hp === 0 && (ctx.day?.bossDown ?? null) === null) events.push({ kind: "defeated" });
  return events;
}

/**
 * The record of a day after one more read. Returns the same object when nothing
 * changes, so a caller can compare by identity before it writes.
 */
export function advanceDay(
  day: DayRecord | undefined,
  facts: { hp: number | null; urgent: number | null; work: boolean; defeatedAt: number | null },
): DayRecord {
  const base = day ?? EMPTY_DAY;
  const bossMax = Math.max(base.bossMax, facts.hp ?? 0);
  const work = base.work || facts.work;
  const bossDown = base.bossDown ?? facts.defeatedAt;
  const clear = base.clear || facts.urgent === 0 || bossDown !== null;
  if (bossMax === base.bossMax && work === base.work && bossDown === base.bossDown && clear === base.clear) return base;
  return { work, clear, bossMax, bossDown };
}
