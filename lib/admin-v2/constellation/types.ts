// ADMIN v3 V2 — the contract of the Constellation (the hero of the Dashboard):
// what the pure layout gives to the 3D scene, to the 2D fallback and to the
// text equivalent. No imports: the scene, the fallback and the tests read the
// same shapes. A star is an open item of „Za reakciju“; its orbit is how
// urgent it is (the same classes the counts of the Dashboard are made of), its
// size how long it has been waiting, its colour the signal of its orbit.

/** `action.priorityClass` of `adminDashboard.reactions`. */
export type ConstellationPriority =
  | "blocking_or_overdue"
  | "due_today"
  | "needs_reply"
  | "grace_or_warning"
  | "waiting_scanme"
  | "waiting_client"
  | "other";

/** What the Constellation needs of one item of „Za reakciju“. */
export type ConstellationItem = {
  /** `action.causeId`: stable for the life of the item. */
  id: string;
  priority: ConstellationPriority;
  /** `action.relevantAt` (ms): the star grows with the wait since then. */
  relevantAt: number;
};

/** `counts` of `adminDashboard.reactions` (null there = the totals are not available). */
export type ConstellationCounts = {
  total: number;
  urgent: number;
  today: number;
  needsReply: number;
  graceOrWarning: number;
  waitingScanme: number;
  waitingClient: number;
  calm: number;
};

/** 1 „Hitno“ (nearest the core), 2 „Danas“, 3 „Čeka“, 4 „Mirno“ (the outer one). */
export type OrbitIndex = 1 | 2 | 3 | 4;
export type StarTone = "danger" | "warning" | "neutral" | "success";
export type StarSize = "small" | "medium" | "large";

export type Star = {
  /** The `id` of the item; `more:<orbit>` for the star that stands for the unnamed rest of an orbit. */
  id: string;
  kind: "item" | "more";
  orbit: OrbitIndex;
  /** Radians in [0, 2π): stable for an id, moved apart from its neighbours on the same orbit. */
  angle: number;
  size: StarSize;
  tone: StarTone;
  /** Urgent stars pulse. */
  pulse: boolean;
  /** `kind: "more"`: how many items it stands for; 0 for an item. */
  more: number;
};

/** An unnamed calm item on the outer orbit. */
export type CalmDot = {
  angle: number;
  /** Share of R: a little off the orbit, so the dots read as a belt. */
  radius: number;
};

/** The backlog of the day as a ring around the core (V4 turns it into the boss of the day). */
export type BacklogRing = {
  hp: number;
  /** The largest `hp` seen (never below `hp`). */
  hpMax: number;
  /** `hp / hpMax`, 0–1; 0 when there is no backlog. */
  share: number;
};

export type ConstellationLayout = {
  stars: Star[];
  /** The unnamed calm items that are drawn (at most `CALM_DOTS_MAX`). */
  calm: CalmDot[];
  /** All the unnamed calm items (may be more than are drawn). */
  calmTotal: number;
  /** null when the counts are not available: no ring, no invented zero. */
  backlog: BacklogRing | null;
};

/** What happened between two reads; the first read is a state, not news. */
export type ConstellationChange =
  /** The item is gone and the total fell: the star leaves for the calm orbit with a trail. */
  | { kind: "resolved"; id: string; star: Star }
  /** The item is gone and the total did not fall (pushed out of the named ones): the star fades. */
  | { kind: "left"; id: string; star: Star }
  /** A new item and the total rose: the star falls into its orbit. */
  | { kind: "arrived"; id: string }
  /** An item that was already open is now among the named ones: the star fades in where it stands. */
  | { kind: "shown"; id: string }
  /** The urgency changed: the star moves to another orbit. */
  | { kind: "moved"; id: string; from: OrbitIndex; to: OrbitIndex };
