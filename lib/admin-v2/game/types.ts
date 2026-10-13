import type { BadgeId, FairChallengeId, FairNodeId, RankId, Rarity, XpActionId } from "./ids";

// ADMIN v3 V4 — the contract of the game (ZADATAK-V3 §4; plan §6). Every number
// of the game comes from one of two places:
//   - the server: the journal of admin actions (`adminActivity.list`, one row per
//     admin mutation) and the counts of „Za reakciju“ (`adminDashboard.reactions`);
//   - this browser: what the server does not keep through time (was „Hitno“ at
//     zero today, the largest backlog of the day, the day an event badge was seen),
//     in localStorage, always in try/catch.
// The schema is not changed and no number is invented. The pure functions that
// fill these types live beside this file; the React side is components/admin/game.

// --- the journal -----------------------------------------------------------------

/** One row of the server journal of admin actions, reduced to what the game reads. */
export type ActivityRow = {
  /** The id of the `adminActivityRows` document. */
  id: string;
  /** The slug the mutation wrote (`admin_v1_problem_resolved`, …). */
  action: string;
  /** `admin` for a person of the team; a row of any other kind carries no XP. */
  actorKind: string;
  /** Server time of the action (ms). */
  occurredAt: number;
  /** What the action was done on; the repeat rules of the XP table compare it. */
  href: string;
};

// --- XP, combo, level --------------------------------------------------------------

/** How often the same thing may carry XP again. */
export type XpRepeat =
  /** Every row counts (the thing cannot be done twice). */
  | { kind: "every" }
  /** The same `href` counts once in this window (ms). */
  | { kind: "perHref"; windowMs: number };

export type XpRule = {
  label: XpActionId;
  xp: number;
  /** The action enters a combo chain. */
  combo: boolean;
  repeat: XpRepeat;
};

/** A row that carries XP, after the XP table, the repeat rules and the combo. */
export type ScoredAction = {
  id: string;
  action: string;
  label: XpActionId;
  /** `occurredAt` of the row. */
  at: number;
  /** XP of the table. */
  base: number;
  /** Its place in its combo chain, from 1; 0 for an action that does not enter the combo. */
  chain: number;
  multiplier: 1 | 2 | 3;
  /** What the combo added, after the daily cap. */
  bonus: number;
  /** `base + bonus`. */
  xp: number;
};

/** A milestone of the journal and when it was reached (the time of the row that reached it). */
export type XpMark = "first" | "actions100" | "deliveries10" | "chain5" | "level6" | "level11" | "level16" | "level21";

export type XpTotals = {
  xp: number;
  /** Rows that carried XP. */
  actions: number;
  /** Completed deliveries among them. */
  deliveries: number;
  /** The longest combo chain. */
  bestChain: number;
  marks: Partial<Record<XpMark, number>>;
};

/**
 * The journal folded into totals, kept in this browser so the history is read
 * from the server once. `tail` keeps the rows of the last 24 hours: the repeat
 * rules, the combo and the daily cap of the next rows need them.
 */
export type XpSnapshot = {
  v: 1;
  /** `occurredAt` of the newest row folded in; 0 when nothing was. */
  through: number;
  /** `occurredAt` of the oldest row ever folded; null when nothing was. */
  since: number | null;
  /** The history was read back to its first row („XP se računa od …“ is shown when it was not). */
  complete: boolean;
  totals: XpTotals;
  tail: ActivityRow[];
};

export type OperatorView = {
  level: number;
  rank: RankId;
  xp: number;
  /** XP inside the current level, the XP the level spans, and their share (0–1). */
  into: number;
  span: number;
  share: number;
  /** XP of the Belgrade day so far. */
  todayXp: number;
  since: number | null;
  complete: boolean;
};

export type ComboView = {
  /** Actions in the running chain. */
  chain: number;
  multiplier: 1 | 2 | 3;
  /** Actions still needed for the next multiplier; null at ×3. */
  toNext: number | null;
  /** The last action of the chain and when the chain runs out (ms). */
  lastAt: number;
  expiresAt: number;
};

// --- the day: boss and streak ------------------------------------------------------

/** The counts of „Za reakciju“ the boss is made of (scope „Sve“: the boss belongs to the team). */
export type BossCounts = { urgent: number; needsReply: number; today: number };

/** What this browser saw on one Belgrade day. */
export type DayRecord = {
  /** At least one action of mine carried XP that day (a fact of the server journal). */
  work: boolean;
  /** „Hitno“ was seen at zero, or the boss was beaten. */
  clear: boolean;
  /** The largest backlog seen that day. */
  bossMax: number;
  /** When the backlog was first brought to zero after it had been above it (ms); null: not beaten. A postponement is not a victory. */
  bossDown: number | null;
};

/** Key: the Belgrade day, `2026-10-13`. At most the last 60 days are kept. */
export type DayLedger = Record<string, DayRecord>;

export type BossView =
  /** The counts are not available now. */
  | { kind: "unavailable" }
  /** Nothing has waited today: there is no boss, and no victory. */
  | { kind: "none" }
  | { kind: "alive"; hp: number; hpMax: number; share: number; /** It was beaten earlier today and new backlog brought it back. */ returned: boolean }
  | { kind: "down"; hpMax: number; downAt: number };

/** What happened to the boss between two reads of the counts. */
export type BossEvent =
  /** The backlog fell; `mine`: an action of mine that carries XP happened in the 10 s before. */
  | { kind: "hit"; damage: number; mine: boolean }
  /** It fell because I postponed an item: no damage is claimed. */
  | { kind: "snoozed"; damage: number }
  | { kind: "grew"; amount: number }
  /** It reached zero for the first time today. */
  | { kind: "defeated" };

export type StreakView = {
  /** Working days in a row that are written down, up to today. */
  count: number;
  best: number;
  /** The size of the flame: 0 none, 1 for 1–2 days, 2 for 3–4, 3 for 5–9, 4 for 10–19, 5 from 20. */
  flame: 0 | 1 | 2 | 3 | 4 | 5;
  /** Today is already written down. */
  todayDone: boolean;
  /** The working day that broke the last streak (`2026-10-13`); null when none did. */
  brokenOn: string | null;
  /** The first day this browser has a record of; the streak is kept from then. */
  since: string | null;
};

// --- badges ------------------------------------------------------------------------

/** Where the date of a badge comes from: derived again on any device, or seen only on this one. */
export type BadgeSource = "server" | "local" | "fair";

export type BadgeDef = {
  id: BadgeId;
  rarity: Rarity;
  group: "personal" | "fair";
  source: BadgeSource;
};

export type BadgeState = BadgeDef & {
  /** When it was won (ms); null: locked. */
  earnedAt: number | null;
  /** How many times (the boss of the day falls more than once). */
  count?: number;
  /** How far a locked badge is. */
  progress?: { value: number; target: number };
};

export type BadgeInput = {
  totals: XpTotals;
  level: number;
  days: DayLedger;
  streak: StreakView;
  /** The dates of the badges that are moments seen on this device (kept in localStorage). */
  local: Partial<Record<BadgeId, number>>;
};

/** The facts of one moment that may award a badge that is a moment (not derivable later). */
export type BadgeFacts = {
  /** The counts of the previous read and of this one; null: not available. */
  prevCounts: BossCounts | null;
  counts: BossCounts | null;
  /** I sent a reply / solved an item on this Belgrade day (the server journal). */
  repliedToday: boolean;
  resolvedToday: boolean;
  streak: StreakView;
  /** I was first in the table of the team when the previous week ended. */
  wonLastWeek: boolean;
  fair: {
    /** Every node of the mission map was lit before the opening. */
    ready: boolean;
    firstLead: boolean;
    /** A new record of an hour was seen while the page was open. */
    hourRecordSeen: boolean;
    /** The record of an hour of the event; null: not known. */
    hourRecord: number | null;
  };
};

// --- the team ----------------------------------------------------------------------

export type TeamMember = { id: string; name: string };

/** The journal of one member, read back from now. */
export type TeamJournal = {
  rows: ActivityRow[];
  /** The read reached its limit before the start of the period: the numbers are „at least“. */
  capped: boolean;
};

export type TeamRow = {
  id: string;
  name: string;
  me: boolean;
  /** XP of the week (Monday 00:00 in Belgrade to now). */
  xp: number;
  atLeast: boolean;
  actions: number;
  bestChain: number;
  rank: number;
  /** The first three with any XP. */
  medal: 1 | 2 | 3 | null;
  /** Places gained (+) or lost (−) since the end of yesterday; null on a Monday and for a member with no XP before today. */
  move: number | null;
};

export type TeamBoard = {
  /** Monday 00:00 in Belgrade (ms). */
  weekStart: number;
  rows: TeamRow[];
};

// --- the fair ----------------------------------------------------------------------

/** What the mission map reads; `fairDashboard.getEventDashboard` has this shape. */
export type FairChainInput = {
  kpis: {
    models: { published: number; total: number };
    questions: { covered: number; required: number } | null;
  };
  sections: {
    modeli: { withErrors: number };
    qr: { publishedWithoutQr: number; onWithdrawn: number };
    izlagaci: { active: number; total: number };
    leadovi: { followUpActive: number; followUpNeeded: number } | null;
  };
};

export type FairNode = {
  id: FairNodeId;
  /** `locked`: there is nothing to do in it yet; `open`: in progress; `lit`: done. */
  state: "locked" | "open" | "lit";
  done: number;
  total: number;
};

export type FairChallengeInput = {
  /** 1-based fair day that is open. */
  dayIndex: number;
  todayKey: string;
  /** The previous fair day; null on the first one. */
  yesterdayKey: string | null;
  /** The Belgrade hour now (0–23). */
  hour: number;
  scansToday: number;
  /** null: the event has no leads. */
  leadsToday: number | null;
  /** Open urgent items of the event. */
  urgentOpen: number;
  /** Scans per fair day and hour; null while that read is not in (challenges that need it are left out). */
  hours: ReadonlyArray<{ dateKey: string; hour: number; scans: number }> | null;
};

export type FairChallenge = {
  id: FairChallengeId;
  value: number;
  target: number;
  done: boolean;
  /** Its deadline passed today without it being met. */
  missed: boolean;
};

// --- ceremonies --------------------------------------------------------------------

export type CeremonyEvent =
  | { kind: "level"; level: number; rank: RankId; /** The level is the first of a new rank. */ rankUp: boolean; at: number }
  | { kind: "boss"; dayKey: string; at: number }
  | { kind: "badge"; badge: BadgeId; rarity: Rarity; at: number }
  /** A record of the fair (v2 showed it as a toast); `title` is the finished sentence. */
  | { kind: "record"; key: string; title: string; at: number };

/** `big`: the medal in the centre of the screen with particles; `card`: a card beside the XP chip. */
export type CeremonySize = "big" | "card";

export type CeremonyItem = {
  /** The same key is never celebrated twice (`level:7`, `boss:2026-10-13`, `badge:kurir`, `record:<key>`). */
  key: string;
  size: CeremonySize;
  event: CeremonyEvent;
  /** A new rank and the badge of that rank are one ceremony: the badge it also stands for. */
  alsoBadge?: BadgeId;
};

export type CeremonyPlan = {
  /** What is shown, in order: at most two. */
  show: CeremonyItem[];
  /** What did not fit: one toast says how many. */
  rest: CeremonyItem[];
  /** The keys to remember as celebrated (shown and rest). */
  seen: string[];
};

/** How a ceremony may appear right now. */
export type CeremonyEnv = {
  quiet: boolean;
  reducedMotion: boolean;
  /** Focus is in a field. */
  editable: boolean;
  /** A dialog or a menu is open. */
  modal: boolean;
  /** A narrow screen. */
  phone: boolean;
};

/** `layer`: over the screen; `toast`: one calm line; `none`: nothing at all. */
export type CeremonyForm = { as: "layer"; size: CeremonySize } | { as: "toast" } | { as: "none" };

// --- the view the UI draws -----------------------------------------------------------

export type GameView = {
  /** null while the journal is being read (and when it cannot be). */
  operator: OperatorView | null;
  combo: ComboView | null;
  streak: StreakView | null;
  boss: BossView;
  badges: BadgeState[];
  team: TeamBoard | null;
};
