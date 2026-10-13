import { PREVIEW_ACTIONS as ACTIONS, previewRow as row, type GameFixture } from "@/components/admin/game/game-preview";
import { xpForLevel } from "@/lib/admin-v2/game/levels";
import { dayKey, dayStart, shiftDay, weekStart } from "@/lib/admin-v2/game/time";
import type { ActivityRow, BossCounts, DayLedger, TeamMember } from "@/lib/admin-v2/game/types";

// ADMIN v3 V4 — the TEST data of the game for the dev previews: TEST people and
// invented numbers. Only the dev routes import this file (the store that runs a
// fixture is game-preview.ts), so none of it reaches the real admin.

/** The moment of the TEST game: the same as the Dashboard preview (Wednesday 16 Sep 2026, 10:30 in Belgrade). */
export const GAME_FIXTURE_NOW = Date.UTC(2026, 8, 16, 8, 30);
const HOUR = 3_600_000;
const MINUTE = 60_000;

export type GameFixtureVariant = "nivo" | "rang" | "mirno" | "pocetak";

/** The people of the Team preview (components/admin/admin-team.tsx); the first one is „ja“. */
const MEMBERS: TeamMember[] = [
  { id: "preview-admin-teodora", name: "Teodora" },
  { id: "preview-admin-jovan", name: "Jovan" },
  { id: "preview-admin-aleksa", name: "Aleksa" },
];
const ME = MEMBERS[0].id;

/** The backlog of the Dashboard preview („Sve“): 4 urgent, 1 waits for a reply, 6 for today. */
const COUNTS: BossCounts = { urgent: 4, needsReply: 1, today: 6 };

/**
 * A working week of one TEST member: a few actions on each day up to `now`, and
 * (`burst`) a run of solved items 20 s apart on one day: a combo.
 */
function weekRows(seed: number, now: number, perDay: readonly number[], burst?: { day: number; hour: number; count: number }): ActivityRow[] {
  const monday = weekStart(now);
  const rows: ActivityRow[] = [];
  perDay.forEach((count, day) => {
    for (let index = 0; index < count; index += 1) {
      const at = monday + day * 24 * HOUR + 9 * HOUR + index * 47 * MINUTE + seed * 7 * MINUTE;
      if (at >= now) continue;
      const kind = (["resolved", "reply", "task", "delivery"] as const)[(index + seed + day) % 4];
      rows.push(row(ACTIONS[kind], at, `/admin/test/${seed}-${day}-${index}`));
    }
  });
  for (let index = 0; burst && index < burst.count; index += 1) {
    const at = monday + burst.day * 24 * HOUR + burst.hour * HOUR + 30 * MINUTE + index * 20_000;
    if (at < now) rows.push(row(ACTIONS.resolved, at, `/admin/test/${seed}-burst-${index}`));
  }
  return rows;
}

function days(now: number, hp: number): DayLedger {
  const today = dayKey(now);
  const done = (key: string, hour: number, minute: number) => ({ work: true, clear: true, bossMax: 18 + hour, bossDown: dayStart(key) + hour * HOUR + minute * MINUTE });
  return {
    // Tuesday a week ago was done, Wednesday was missed, then four working days in a row.
    [shiftDay(today, -8)]: done(shiftDay(today, -8), 15, 30),
    [shiftDay(today, -7)]: { work: true, clear: false, bossMax: 21, bossDown: null },
    [shiftDay(today, -6)]: done(shiftDay(today, -6), 16, 10),
    [shiftDay(today, -5)]: done(shiftDay(today, -5), 10, 40),
    [shiftDay(today, -2)]: done(shiftDay(today, -2), 14, 5),
    [shiftDay(today, -1)]: done(shiftDay(today, -1), 11, 20),
    [today]: { work: true, clear: false, bossMax: hp, bossDown: null },
  };
}

/**
 * `nivo`: level 7, one solved item from level 8. `rang`: level 10, one solved
 * item from level 11, the first of „Dispečer“ (a new rank and an epic badge).
 * `mirno`: level 8 with a long way to the next one, so an action shows only
 * what it is about (a badge, the boss). `pocetak`: a new operator with nothing yet.
 */
export function gameFixture(variant: GameFixtureVariant = "nivo", now = GAME_FIXTURE_NOW): GameFixture {
  const hp = 3 * COUNTS.urgent + 2 * COUNTS.needsReply + COUNTS.today;
  const team = {
    members: MEMBERS,
    journals: {
      // Yesterday ended with Jovan first; a combo of five this morning put Teodora („ja“) ahead of him.
      [MEMBERS[0].id]: { rows: weekRows(1, now, [6, 8, 4], { day: 2, hour: 9, count: 5 }), capped: false },
      [MEMBERS[1].id]: { rows: weekRows(2, now, [9, 8, 5], { day: 1, hour: 13, count: 3 }), capped: false },
      [MEMBERS[2].id]: { rows: weekRows(3, now, [5, 8, 2]), capped: false },
    },
  };
  if (variant === "pocetak") {
    return { userId: ME, now, stored: { snapshot: null, days: {}, badgeDates: {}, seen: [] }, counts: COUNTS, team: { members: MEMBERS, journals: {} } };
  }
  const level = variant === "rang" ? 10 : 7;
  // 20 XP short of the next level: one solved item (30 XP) crosses it. `mirno` has just crossed it.
  const xp = variant === "mirno" ? xpForLevel(8) + 10 : xpForLevel(level + 1) - 20;
  const since = now - 34 * 24 * HOUR;
  const tail = [
    row(ACTIONS.reply, now - 150 * MINUTE, "/admin/inbox?conversation=test-1"),
    row(ACTIONS.task, now - 95 * MINUTE, "/admin/zadaci?task=test-1"),
    row(ACTIONS.resolved, now - 40 * MINUTE, "/admin/klijenti/test-1"),
  ];
  return {
    userId: ME,
    now,
    stored: {
      snapshot: {
        v: 1,
        through: tail[tail.length - 1].occurredAt,
        since,
        complete: true,
        totals: {
          xp,
          actions: variant === "rang" ? 286 : 148,
          deliveries: 9,
          bestChain: 4,
          marks: { first: since, actions100: now - 9 * 24 * HOUR, level6: now - 6 * 24 * HOUR },
        },
        tail,
      },
      days: days(now, hp),
      // „Prvi u nedelji“ is epic: the Vitrina of a preview then has a holographic medal to show.
      badgeDates: { inbox_nula: now - 5 * 24 * HOUR, prvi_u_nedelji: now - 2 * 24 * HOUR },
      seen: [],
    },
    counts: COUNTS,
    team,
  };
}

/** The TEST game a dev preview shows when it has no reason for another one. */
export const PREVIEW_GAME: GameFixture = gameFixture();
