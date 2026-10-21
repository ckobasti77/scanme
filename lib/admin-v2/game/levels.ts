// ADMIN v3 V4 — levels and ranks (plan §6.2). Pure: XP in, level and rank out.
// The level n starts at 50 × (n − 1) × n XP; a rank spans five levels.

import type { RankId } from "./ids";
import { todayXp } from "./snapshot";
import type { OperatorView, XpSnapshot } from "./types";

export const LEVELS_PER_RANK = 5;

const RANKS: readonly RankId[] = ["pripravnik", "operater", "dispecer", "komandant", "legenda"];

/** XP at which a level starts: 50 × (n − 1) × n; level 1 starts at 0. */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

/** The highest level whose start is at most `xp`; at least 1 (negative, NaN and infinite XP give 1). */
export function levelOf(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
  // The square root is a float; one integer step each way makes the boundary exact.
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

/** 1–5 pripravnik, 6–10 operater, 11–15 dispecer, 16–20 komandant, 21+ legenda. */
export function rankOf(level: number): RankId {
  const index = Math.floor((Math.max(1, level) - 1) / LEVELS_PER_RANK);
  return RANKS[Math.min(index, RANKS.length - 1)];
}

/** The first level of a rank: 1, 6, 11, 16, 21. */
export function rankStartLevel(rank: RankId): number {
  return RANKS.indexOf(rank) * LEVELS_PER_RANK + 1;
}

export function levelProgress(xp: number): { level: number; rank: RankId; into: number; span: number; share: number } {
  const level = levelOf(xp);
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  const into = Number.isFinite(xp) ? Math.max(0, xp - start) : 0;
  return { level, rank: rankOf(level), into, span, share: Math.min(1, into / span) };
}

export function operatorView(snapshot: XpSnapshot, now: number): OperatorView {
  const { xp } = snapshot.totals;
  return { ...levelProgress(xp), xp, todayXp: todayXp(snapshot, now), since: snapshot.since, complete: snapshot.complete };
}
