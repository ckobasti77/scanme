import { GAME_ACTIONS, actedOn } from "./activity";
import { badgeStates, badgeTriggers, newlyEarned } from "./badges";
import { BOSS_MINE_MS, advanceDay, bossHp, bossStep, bossView } from "./boss";
import { ceremonyKey, ceremonyQueue } from "./ceremonies";
import { comboNow } from "./combo";
import type { BadgeId } from "./ids";
import { pruneDays } from "./ledger";
import { levelOf, operatorView, rankOf, rankStartLevel } from "./levels";
import { foldSnapshot, tailScored, workedOn } from "./snapshot";
import { streakView } from "./streak";
import { lastWeekWinner, teamBoard } from "./team";
import { dayKey } from "./time";
import type {
  ActivityRow,
  BadgeFacts,
  BadgeState,
  BossCounts,
  BossEvent,
  CeremonyEvent,
  CeremonyPlan,
  DayLedger,
  GameView,
  ScoredAction,
  TeamJournal,
  TeamMember,
  XpSnapshot,
} from "./types";

// ADMIN v3 V4 — the engine of the game: one pure reducer over everything the
// game knows. The React side (components/admin/game/game-provider.tsx) only
// feeds it what it read (the journal of my actions, the counts of „Za
// reakciju“, the journals of the team, the facts of a fair page) and plays the
// effects it returns (a spark for gained XP, a hit on the boss, a ceremony).
// The first read of anything is the state, not news: no effect comes from it.

/** A fall of the backlog waits this long for the row of my own action before it is called the team's. */
export const BOSS_PENDING_MS = 3_000;

export type FairFacts = BadgeFacts["fair"];
const NO_FAIR: FairFacts = { ready: false, firstLead: false, hourRecordSeen: false, hourRecord: null };

export type GameState = {
  userId: string;
  /** null until the journal was read. */
  snapshot: XpSnapshot | null;
  /** The first read of the journal is in: from now on new rows are news. */
  live: boolean;
  /** undefined: the counts were never read; null: they are not available. */
  counts: BossCounts | null | undefined;
  /** A fall of the backlog whose cause is not known yet, with the counts before it. */
  pending: { from: number; at: number; counts: BossCounts } | null;
  /**
   * When this browser saw a row of mine that carried XP, and a postponement of mine, arrive. The clock of
   * the browser, like the reads of the counts: the rows carry the time of the server, and the two clocks differ.
   */
  myXpSeenAt: number | null;
  mySnoozeSeenAt: number | null;
  days: DayLedger;
  badgeDates: Partial<Record<BadgeId, number>>;
  /** The keys of what was already celebrated. */
  seen: string[];
  team: { members: readonly TeamMember[]; journals: Readonly<Record<string, TeamJournal>> } | null;
  fair: FairFacts;
  /** The badges as of the last step (what a new one is compared with). */
  badges: BadgeState[];
};

export type GameStored = {
  snapshot: XpSnapshot | null;
  days: DayLedger;
  badgeDates: Partial<Record<BadgeId, number>>;
  seen: readonly string[];
};

export type GameInput =
  /** Rows of my journal. `initial`: the first read (history included); `complete`: it reached the first row. */
  | { type: "journal"; rows: readonly ActivityRow[]; initial?: boolean; complete?: boolean; now: number }
  | { type: "counts"; counts: BossCounts | null; now: number }
  | { type: "team"; members: readonly TeamMember[]; journals: Readonly<Record<string, TeamJournal>>; now: number }
  | { type: "fair"; fair: Partial<FairFacts>; now: number }
  /** A record of the fair seen on a page (v2 showed it as a toast). */
  | { type: "record"; key: string; title: string; now: number }
  /** Time passed: a pending fall is settled, a new day starts. */
  | { type: "tick"; now: number };

export type GameEffect =
  /** My actions carried XP. */
  | { type: "gain"; xp: number; actions: ScoredAction[] }
  | { type: "boss"; event: BossEvent }
  | { type: "ceremony"; plan: CeremonyPlan };

export function initialGame(userId: string, stored: GameStored | null): GameState {
  return {
    userId,
    snapshot: stored?.snapshot ?? null,
    live: false,
    counts: undefined,
    pending: null,
    myXpSeenAt: null,
    mySnoozeSeenAt: null,
    days: stored?.days ?? {},
    badgeDates: stored?.badgeDates ?? {},
    seen: [...(stored?.seen ?? [])],
    team: null,
    fair: NO_FAIR,
    badges: [],
  };
}

const levelOfState = (snapshot: XpSnapshot | null) => (snapshot ? levelOf(snapshot.totals.xp) : 1);

function badgesOf(state: GameState, now: number): BadgeState[] {
  return badgeStates({
    totals: (state.snapshot ?? foldSnapshot(null, [])).totals,
    level: levelOfState(state.snapshot),
    days: state.days,
    streak: streakView(state.days, dayKey(now)),
    local: state.badgeDates,
  });
}

/** Everything the UI draws, at `now`. */
export function gameView(state: GameState, now: number): GameView {
  const today = dayKey(now);
  return {
    operator: state.snapshot && state.live ? operatorView(state.snapshot, now) : null,
    // The rows carry the time of the server: a browser clock that runs behind must not hide my newest action.
    combo: state.snapshot && state.live ? comboNow(tailScored(state.snapshot), Math.max(now, state.snapshot.through)) : null,
    streak: state.live ? streakView(state.days, today) : null,
    boss: state.counts === undefined ? { kind: "unavailable" } : bossView(state.counts, state.days[today]),
    badges: state.badges.length ? state.badges : badgesOf(state, now),
    team: state.team ? teamBoard(state.team.members, state.team.journals, now, state.userId) : null,
  };
}

/** Did I work on that Belgrade day: the day record says so, or the journal of the last day does. */
const workedThat = (state: GameState, day: string) => state.days[day]?.work === true || (state.snapshot ? workedOn(state.snapshot, day) : false);

export function gameStep(previous: GameState, input: GameInput): { state: GameState; effects: GameEffect[] } {
  const now = input.now;
  const today = dayKey(now);
  const effects: GameEffect[] = [];
  const celebrate: CeremonyEvent[] = [];
  const state: GameState = { ...previous };
  /** The first read of the journal: what it brings is the state, never a ceremony. */
  let silent = !previous.live;
  let defeatedAt: number | null = null;
  /** The counts before a fall that has just been settled as a hit (not a postponement): the moment badges read it. */
  let fallFrom: BossCounts | null = null;
  let hpNow: number | null = state.counts ? bossHp(state.counts) : null;

  if (input.type === "journal") {
    const before = state.snapshot;
    const beforeLevel = levelOfState(before);
    const known = new Set((before?.tail ?? []).map((row) => row.id));
    const next = foldSnapshot(before, input.rows, input.complete);
    state.snapshot = next;
    if (input.initial || !previous.live) {
      state.live = true;
      silent = true;
    } else if (next !== before) {
      const gained = tailScored(next).filter((action) => !known.has(action.id));
      if (gained.length) {
        effects.push({ type: "gain", xp: gained.reduce((sum, action) => sum + action.xp, 0), actions: gained });
        state.myXpSeenAt = now;
      }
      if (next.tail.some((row) => !known.has(row.id) && row.action === GAME_ACTIONS.snoozed && row.actorKind === "admin")) state.mySnoozeSeenAt = now;
      const level = levelOfState(next);
      if (level > beforeLevel) {
        const rank = rankOf(level);
        celebrate.push({ kind: "level", level, rank, rankUp: rankStartLevel(rank) > beforeLevel, at: now });
      }
    }
  } else if (input.type === "counts") {
    const hp = input.counts ? bossHp(input.counts) : null;
    const before = previous.counts ? bossHp(previous.counts) : null;
    state.counts = input.counts;
    hpNow = hp;
    if (hp === null || before === null || !previous.counts) state.pending = null;
    else if (hp > before) {
      // New backlog; a fall that was still waiting for its cause is dropped with it.
      effects.push({ type: "boss", event: { kind: "grew", amount: hp - before } });
      state.pending = null;
    } else if (hp < before) state.pending = { from: previous.pending?.from ?? before, at: now, counts: previous.pending?.counts ?? previous.counts };
  } else if (input.type === "team") {
    state.team = { members: input.members, journals: input.journals };
  } else if (input.type === "fair") {
    const fair = { ...state.fair, ...input.fair };
    state.fair = {
      ready: state.fair.ready || fair.ready,
      firstLead: state.fair.firstLead || fair.firstLead,
      hourRecordSeen: state.fair.hourRecordSeen || fair.hourRecordSeen,
      hourRecord: Math.max(state.fair.hourRecord ?? 0, fair.hourRecord ?? 0) || null,
    };
  } else if (input.type === "record") {
    celebrate.push({ kind: "record", key: input.key, title: input.title, at: now });
  }

  // A pending fall of the backlog: settled as soon as my own row explains it, or as the team's after the wait.
  const pending = state.pending;
  if (pending && hpNow !== null) {
    const near = (at: number | null): at is number => at !== null && Math.abs(pending.at - at) <= BOSS_MINE_MS;
    const xpAt = near(state.myXpSeenAt) ? state.myXpSeenAt : null;
    const snoozeAt = near(state.mySnoozeSeenAt) ? state.mySnoozeSeenAt : null;
    if (xpAt !== null || snoozeAt !== null || now - pending.at >= BOSS_PENDING_MS) {
      // The fall and my row arrive through two reads, in either order: the later of them is "now".
      const at = Math.max(pending.at, xpAt ?? 0, snoozeAt ?? 0);
      for (const event of bossStep(pending.from, hpNow, { now: at, lastXpAt: xpAt, lastSnoozeAt: snoozeAt, day: state.days[dayKey(pending.at)] })) {
        if (event.kind === "defeated") defeatedAt = pending.at;
        else effects.push({ type: "boss", event });
        if (event.kind === "hit") fallFrom = pending.counts;
      }
      state.pending = null;
    }
  }

  // The day: what this browser saw of it. A boss that fell just before midnight fell on that day.
  const defeatDay = defeatedAt === null ? null : dayKey(defeatedAt);
  let days = state.days;
  if (defeatDay !== null && defeatDay !== today) {
    const record = advanceDay(days[defeatDay], { hp: null, urgent: null, work: workedThat(state, defeatDay), defeatedAt });
    if (record !== days[defeatDay]) days = { ...days, [defeatDay]: record };
  }
  const record = advanceDay(days[today], {
    hp: hpNow,
    urgent: state.counts ? state.counts.urgent : null,
    work: state.snapshot ? workedOn(state.snapshot, today) : false,
    defeatedAt: defeatDay === today ? defeatedAt : null,
  });
  if (record !== days[today]) days = { ...days, [today]: record };
  if (days !== state.days) state.days = pruneDays(days, today);
  if (defeatedAt !== null && defeatDay !== null) {
    effects.push({ type: "boss", event: { kind: "defeated" } });
    // The boss belongs to the team; the ceremony (and the badges of the day) are for a day I worked on.
    if (workedThat(state, defeatDay)) celebrate.push({ kind: "boss", dayKey: defeatDay, at: defeatedAt });
  }

  // Badges that are a moment: the date is written the first time the facts hold.
  const tail = state.snapshot?.tail ?? [];
  const team = state.team;
  const triggered = badgeTriggers({
    // „Inbox nula“ and „Nula hitnih“ are read only at a fall that was a hit: a postponement empties nothing.
    prevCounts: fallFrom,
    counts: fallFrom ? state.counts ?? null : null,
    repliedToday: actedOn(tail, [GAME_ACTIONS.reply], today),
    resolvedToday: actedOn(tail, [GAME_ACTIONS.resolved], today),
    streak: streakView(state.days, today),
    // A member whose journal was not read is unknown, not empty: then nobody is called first.
    wonLastWeek: team !== null && team.members.every((member) => team.journals[member.id] !== undefined) && lastWeekWinner(team.members, team.journals, now) === state.userId,
    fair: state.fair,
  }).filter((id) => state.badgeDates[id] === undefined);
  if (triggered.length) {
    state.badgeDates = { ...state.badgeDates };
    for (const id of triggered) state.badgeDates[id] = now;
  }

  const badges = badgesOf(state, now);
  const fresh = newlyEarned(previous.badges.length ? previous.badges : null, badges);
  state.badges = badges;
  const bossCelebrated = celebrate.some((event) => event.kind === "boss");
  for (const badge of fresh) {
    // The boss of the day gives its badge with its own ceremony: one moment, not two.
    if (badge.id === "sef_je_pao" && bossCelebrated) continue;
    celebrate.push({ kind: "badge", badge: badge.id, rarity: badge.rarity, at: badge.earnedAt ?? now });
  }

  const seen = new Set(state.seen);
  if (silent) {
    // What the first read finds (a level reached on another device, badges already won) is not celebrated later either.
    const keys = [`level:${levelOfState(state.snapshot)}`, ...badges.filter((badge) => badge.earnedAt !== null).map((badge) => `badge:${badge.id}`), ...celebrate.map(ceremonyKey)];
    const added = keys.filter((key) => !seen.has(key));
    if (added.length) state.seen = [...state.seen, ...added];
  } else if (celebrate.length) {
    const plan = ceremonyQueue(celebrate, seen);
    const marks = bossCelebrated ? [...plan.seen, "badge:sef_je_pao"] : plan.seen;
    const added = marks.filter((key) => !seen.has(key));
    if (added.length) state.seen = [...state.seen, ...added];
    if (plan.show.length || plan.rest.length) effects.push({ type: "ceremony", plan });
  }

  return { state, effects };
}

/** When the engine wants a `tick` at the latest (ms), or null: a pending fall of the backlog is settled then. */
export function nextTickAt(state: GameState): number | null {
  return state.pending ? state.pending.at + BOSS_PENDING_MS : null;
}
