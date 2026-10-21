// ADMIN v3 V4 — the combo (plan §6.3). Pure: actions that enter the combo and
// follow each other within two minutes make a chain; the chain multiplies the
// base XP of the actions in it, and what the combo adds is capped per Belgrade
// day. Time is the server's `occurredAt`, so every device reads the same chain.

import { dayKey } from "./time";
import type { ActivityRow, ComboView, ScoredAction, XpRule } from "./types";

/** The longest gap between two actions of one chain (ms). */
export const COMBO_WINDOW_MS = 120_000;
/** The most XP the combo adds in one Belgrade day. */
export const COMBO_DAY_CAP = 200;

/** 1st and 2nd action ×1, 3rd and 4th ×2, from the 5th ×3; no chain is ×1. */
export function comboMultiplier(chain: number): 1 | 2 | 3 {
  if (chain >= 5) return 3;
  if (chain >= 3) return 2;
  return 1;
}

/** Counted rows (oldest first, from `countedRows`) become scored actions with their chain, multiplier and capped bonus. */
export function applyCombo(counted: ReadonlyArray<{ row: ActivityRow; rule: XpRule }>): ScoredAction[] {
  const out: ScoredAction[] = [];
  const bonusByDay = new Map<string, number>();
  let chain = 0;
  let lastComboAt: number | null = null;
  for (const { row, rule } of counted) {
    const at = row.occurredAt;
    let multiplier: 1 | 2 | 3 = 1;
    let bonus = 0;
    let place = 0;
    if (rule.combo) {
      // A chain goes on while the gap is at most the window; a non-combo action never reaches this branch, so it does not break it.
      chain = lastComboAt !== null && at - lastComboAt <= COMBO_WINDOW_MS ? chain + 1 : 1;
      lastComboAt = at;
      place = chain;
      multiplier = comboMultiplier(chain);
      const day = dayKey(at);
      const used = bonusByDay.get(day) ?? 0;
      bonus = Math.max(0, Math.min(rule.xp * (multiplier - 1), COMBO_DAY_CAP - used));
      bonusByDay.set(day, used + bonus);
    }
    out.push({ id: row.id, action: row.action, label: rule.label, at, base: rule.xp, chain: place, multiplier, bonus, xp: rule.xp + bonus });
  }
  return out;
}

/** The chain that still runs at `now` (its last action is at most two minutes old), or null. */
export function comboNow(scored: readonly ScoredAction[], now: number): ComboView | null {
  let last: ScoredAction | null = null;
  for (const action of scored) {
    if (action.chain <= 0 || action.at > now) continue;
    if (last === null || action.at >= last.at) last = action;
  }
  if (last === null || now - last.at > COMBO_WINDOW_MS) return null;
  const toNext = last.chain < 3 ? 3 - last.chain : last.chain < 5 ? 5 - last.chain : null;
  return { chain: last.chain, multiplier: last.multiplier, toNext, lastAt: last.at, expiresAt: last.at + COMBO_WINDOW_MS };
}
