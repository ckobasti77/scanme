// ADMIN v2 X4 — missions with progress (ZADATAK §5.1). A mission is something
// that already waits for a reaction („Šta treba da uradim“ of an event, the
// signal counts and the tasks of the Dashboard); its number comes from data the
// page already has. Progress is measured against the day, in two sizes. A
// mission is solved when nothing waits in it any more: „3 od 5 rešeno“ counts
// missions, the same unit as the rows and their badges. Inside one mission
// every item that left it today is solved and every item that arrived makes
// its total bigger („2 od 3“ beside the row). The day's ledger is kept in this
// browser only. An info line is not a task, so it has no progress. Pure; the
// hook (components/admin/admin-ui/use-mission-progress.ts) reads and writes it.

export type MissionTone = "hitno" | "uskoro" | "info";
export type MissionInput = {
  id: string;
  label: string;
  count: number;
  tone: MissionTone;
  href?: string;
  /** The read behind the count was limited: the number is "at least this many" and shows as „4+“. */
  capped?: boolean;
};

/** One mission of the day: how many wait now and how many were solved today. */
export type MissionTrack = { open: number; done: number };

export type MissionLedger = {
  /** The Belgrade day the ledger is for; another day starts from zero. */
  day: string;
  tracks: Record<string, MissionTrack>;
  /** „Sve čisto“ was already shown this day. */
  clearShown: boolean;
};

export const MISSION_STORAGE_PREFIX = "scanme.admin.missions.";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" });

/** `2026-10-12` in Belgrade time: the day a ledger belongs to. */
export const missionDay = (now: number) => dayFormat.format(now);

/** An info line only informs: it is listed, never counted. */
export const isCountedMission = (mission: Pick<MissionInput, "tone">) => mission.tone !== "info";

/** A mission that lost items in a step: how many, and where it stands after it. */
export type MissionStep = { id: string; solved: number; open: number; done: number };

export type MissionAdvance = {
  ledger: MissionLedger;
  /** The missions that lost at least one item in this step. */
  resolved: MissionStep[];
  changed: boolean;
};

/**
 * The ledger after the page showed `missions`. A count that fell is progress,
 * a count that rose is new work. `complete`: the list is everything there is
 * (an event's actions), so a mission that is no longer in it was solved; without
 * it a missing mission is unknown (a Dashboard widget that has not loaded yet)
 * and stays as it was.
 */
export function advanceLedger(previous: MissionLedger | null, missions: readonly MissionInput[], day: string, complete = false): MissionAdvance {
  const base = previous && previous.day === day ? previous : null;
  const tracks: Record<string, MissionTrack> = { ...base?.tracks };
  const resolved: MissionStep[] = [];
  let changed = base === null;
  const seen = new Set<string>();
  for (const mission of missions) {
    if (!isCountedMission(mission)) continue;
    seen.add(mission.id);
    const count = Math.max(0, Math.floor(mission.count));
    const track = tracks[mission.id];
    if (!track) {
      tracks[mission.id] = { open: count, done: 0 };
      changed = true;
    } else if (count !== track.open) {
      const solved = Math.max(0, track.open - count);
      tracks[mission.id] = { open: count, done: track.done + solved };
      if (solved > 0) resolved.push({ id: mission.id, solved, ...tracks[mission.id] });
      changed = true;
    }
  }
  if (complete) {
    for (const [id, track] of Object.entries(tracks)) {
      if (seen.has(id) || track.open === 0) continue;
      tracks[id] = { open: 0, done: track.done + track.open };
      resolved.push({ id, solved: track.open, ...tracks[id] });
      changed = true;
    }
  }
  return { ledger: { day, tracks, clearShown: base?.clearShown ?? false }, resolved, changed };
}

export type MissionRow = MissionInput & {
  /** Items of this mission solved today and its total of the day; null for an info line. */
  progress: { done: number; total: number } | null;
};

/** `celebrate`: the first all-clear of the day; `quiet`: every later one; `empty`: nothing waited today. */
export type MissionClear = "open" | "celebrate" | "quiet" | "empty";

export type MissionBoard = {
  /** The missions that still wait, the most urgent first. */
  rows: MissionRow[];
  /** Missions solved today: something waited in them and nothing does now. */
  done: number;
  /** Missions that had work today (solved + still open). */
  total: number;
  /** Missions that still wait (an info line is not one), with the ones the page has not sent yet. */
  open: number;
  /** done / total, 0–1; 1 when nothing waited at all. */
  share: number;
  clear: MissionClear;
};

const TONE_ORDER: Record<MissionTone, number> = { hitno: 0, uskoro: 1, info: 2 };

/**
 * What the missions block shows. Without a ledger (the server render, the first
 * paint) nothing is solved yet: the total is what waits now.
 */
export function missionBoard(missions: readonly MissionInput[], ledger: MissionLedger | null): MissionBoard {
  const rows = missions
    .filter((mission) => mission.count > 0)
    .map((mission, index) => ({ mission, index }))
    .sort((left, right) => TONE_ORDER[left.mission.tone] - TONE_ORDER[right.mission.tone] || left.index - right.index)
    .map(({ mission }): MissionRow => {
      if (!isCountedMission(mission)) return { ...mission, progress: null };
      const done = ledger?.tracks[mission.id]?.done ?? 0;
      return { ...mission, progress: { done, total: done + mission.count } };
    });
  const waiting = new Set(missions.filter((mission) => isCountedMission(mission) && mission.count > 0).map((mission) => mission.id));
  const listed = new Set(missions.map((mission) => mission.id));
  // A mission the page has not sent yet (a Dashboard widget that is still loading) waits as it did when it was
  // last seen: without this the first widget to arrive with zeros would look like „Sve čisto“.
  const pending = ledger ? Object.entries(ledger.tracks).filter(([id, track]) => !listed.has(id) && track.open > 0).length : 0;
  const open = waiting.size + pending;
  // A solved mission counts also when it is no longer listed (an event's rule that stopped firing).
  const done = ledger ? Object.entries(ledger.tracks).filter(([id, track]) => !waiting.has(id) && track.open === 0 && track.done > 0).length : 0;
  const total = done + open;
  const clear: MissionClear = open > 0 ? "open" : total === 0 ? "empty" : ledger?.clearShown ? "quiet" : "celebrate";
  return { rows, done, total, open, share: total > 0 ? done / total : 1, clear };
}

/** The ledger once „Sve čisto“ was shown: it will not be shown again this day. */
export function markClearShown(ledger: MissionLedger): MissionLedger {
  return ledger.clearShown ? ledger : { ...ledger, clearShown: true };
}

const isTrack = (value: unknown): value is MissionTrack =>
  typeof value === "object" && value !== null
  && Number.isFinite((value as MissionTrack).open) && (value as MissionTrack).open >= 0
  && Number.isFinite((value as MissionTrack).done) && (value as MissionTrack).done >= 0;

/** A stored ledger, or null when the text is not one (a broken or foreign value is dropped, never an error). */
export function parseLedger(text: string | null | undefined): MissionLedger | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<MissionLedger> | null;
    if (!value || typeof value.day !== "string" || typeof value.tracks !== "object" || value.tracks === null) return null;
    const tracks: Record<string, MissionTrack> = {};
    for (const [id, track] of Object.entries(value.tracks)) {
      if (isTrack(track)) tracks[id] = { open: track.open, done: track.done };
    }
    return { day: value.day, tracks, clearShown: value.clearShown === true };
  } catch {
    return null;
  }
}

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function readLedger(storage: Pick<Storage, "getItem"> | null | undefined, scope: string): MissionLedger | null {
  try {
    return parseLedger(storage?.getItem(MISSION_STORAGE_PREFIX + scope));
  } catch {
    return null;
  }
}

/** false when the ledger could not be kept (the progress then lasts until the page is closed). */
export function writeLedger(storage: Pick<Storage, "setItem"> | null | undefined, scope: string, ledger: MissionLedger): boolean {
  try {
    if (!storage) return false;
    storage.setItem(MISSION_STORAGE_PREFIX + scope, JSON.stringify(ledger));
    return true;
  } catch {
    return false;
  }
}

/**
 * The stored ledgers that are not of `day` any more (yesterday's, or of an event phase that is over):
 * their keys, so the browser does not keep one per event and day for ever.
 */
export function staleLedgerKeys(stored: ReadonlyArray<readonly [key: string, text: string | null]>, day: string): string[] {
  return stored.filter(([key, text]) => key.startsWith(MISSION_STORAGE_PREFIX) && parseLedger(text)?.day !== day).map(([key]) => key);
}

/** The dash array of a progress ring: the solved part of a circle with this circumference. */
export function ringDash(share: number, circumference: number): string {
  const part = Math.min(1, Math.max(0, share)) * circumference;
  return `${part.toFixed(2)} ${(circumference - part).toFixed(2)}`;
}
