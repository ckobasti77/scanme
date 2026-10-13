// ADMIN v3 V4 — the weekly table of the team (plan §6.7). Pure: the journals of
// the members in, the table out. The week is Monday 00:00 to now in Belgrade; the
// same XP rules and the same combo as for the operator are used.

import { dayKey, dayStart, weekStart } from "./time";
import type { ScoredAction, TeamBoard, TeamJournal, TeamMember, TeamRow } from "./types";
import { scoreRows } from "./xp";

/** At most this many pages of 50 rows are read per member. */
export const TEAM_PAGES = 4;

/** Monday 00:00 of the previous week in Belgrade: how far back a journal has to be read. */
export function teamSince(now: number): number {
  return weekStart(weekStart(now) - 1);
}

type Stats = { xp: number; actions: number; bestChain: number };

/** The totals of the actions inside [from, to); `to` is inclusive when `inclusive` is set. */
function statsOf(scored: readonly ScoredAction[], from: number, to: number, inclusive: boolean): Stats {
  const stats: Stats = { xp: 0, actions: 0, bestChain: 0 };
  for (const action of scored) {
    if (action.at < from || (inclusive ? action.at > to : action.at >= to)) continue;
    stats.xp += action.xp;
    stats.actions += 1;
    stats.bestChain = Math.max(stats.bestChain, action.chain);
  }
  return stats;
}

const oldestOf = (journal: TeamJournal | undefined) => (journal && journal.rows.length > 0 ? Math.min(...journal.rows.map((row) => row.occurredAt)) : null);

/** xp, then actions, both falling; then the name; then the id. */
function order(entries: ReadonlyArray<{ member: TeamMember; stats: Stats }>) {
  return [...entries].sort(
    (a, b) => b.stats.xp - a.stats.xp || b.stats.actions - a.stats.actions || a.member.name.localeCompare(b.member.name, "sr") || (a.member.id < b.member.id ? -1 : a.member.id > b.member.id ? 1 : 0),
  );
}

export function teamBoard(members: readonly TeamMember[], journals: Readonly<Record<string, TeamJournal>>, now: number, meId: string | null): TeamBoard {
  const start = weekStart(now);
  const todayStart = dayStart(dayKey(now));
  const monday = todayStart === start;
  const scoredBy = new Map(members.map((member) => [member.id, scoreRows(journals[member.id]?.rows ?? [])] as const));

  const current = order(members.map((member) => ({ member, stats: statsOf(scoredBy.get(member.id) ?? [], start, now, true) })));
  // The table as it was at the end of yesterday; on a Monday there is no such table in this week.
  const yesterdayStats = new Map(members.map((member) => [member.id, statsOf(scoredBy.get(member.id) ?? [], start, todayStart, false)] as const));
  const yesterday = monday ? [] : order(members.map((member) => ({ member, stats: yesterdayStats.get(member.id) as Stats })));
  const placeBefore = new Map(yesterday.map((entry, index) => [entry.member.id, index + 1] as const));

  const rows: TeamRow[] = current.map(({ member, stats }, index) => {
    const journal = journals[member.id];
    const oldest = oldestOf(journal);
    const rank = index + 1;
    const before = placeBefore.get(member.id);
    const hadXp = !monday && (yesterdayStats.get(member.id) as Stats).actions > 0;
    return {
      id: member.id,
      name: member.name,
      me: member.id === meId,
      xp: stats.xp,
      atLeast: journal !== undefined && journal.capped && oldest !== null && oldest > start,
      actions: stats.actions,
      bestChain: stats.bestChain,
      rank,
      medal: rank <= 3 && stats.xp > 0 ? (rank as 1 | 2 | 3) : null,
      move: hadXp && before !== undefined ? before - rank : null,
    };
  });
  return { weekStart: start, rows };
}

/** The id of the member with the most XP in the previous week; null when nobody had XP or a journal does not reach back to the start of that week. */
export function lastWeekWinner(members: readonly TeamMember[], journals: Readonly<Record<string, TeamJournal>>, now: number): string | null {
  const from = teamSince(now);
  const to = weekStart(now);
  for (const member of members) {
    const journal = journals[member.id];
    const oldest = oldestOf(journal);
    if (journal && journal.capped && oldest !== null && oldest > from) return null;
  }
  const [first] = order(members.map((member) => ({ member, stats: statsOf(scoreRows(journals[member.id]?.rows ?? []), from, to, false) })));
  return first && first.stats.xp > 0 ? first.member.id : null;
}
