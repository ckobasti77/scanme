// ADMIN v3 V4 — what the game keeps in this browser (plan §6.9): the record of
// the days, the dates of the badges that are moments, and what was already
// celebrated. Everything is in try/catch; a broken value is dropped and a
// storage that throws or is missing reads as empty, never as an error (the same
// rule as the mission ledger of v2).

import { BADGE_IDS, type BadgeId } from "./ids";
import { shiftDay } from "./time";
import type { DayLedger, DayRecord } from "./types";

/** Each key is followed by the id of the signed-in user. */
export const GAME_KEYS = {
  days: "scanme.admin.game.days.v1.",
  badges: "scanme.admin.game.badges.v1.",
  seen: "scanme.admin.game.seen.v1.",
} as const;

/** The record of at most this many days is kept. */
export const DAYS_KEPT = 60;
/** At most this many celebrated keys are kept (the newest). */
export const SEEN_KEPT = 200;

type Read = Pick<Storage, "getItem"> | null | undefined;
type Write = Pick<Storage, "setItem"> | null | undefined;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function parseDay(value: unknown): DayRecord | null {
  if (!isRecord(value)) return null;
  const { work, clear, bossMax, bossDown } = value;
  if (typeof work !== "boolean" || typeof clear !== "boolean" || !isCount(bossMax)) return null;
  if (bossDown !== null && !(typeof bossDown === "number" && Number.isFinite(bossDown))) return null;
  return { work, clear, bossMax, bossDown };
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A broken text is an empty ledger; a broken day is left out. */
export function parseDays(text: string | null | undefined): DayLedger {
  const raw = parseJson(text);
  const days: DayLedger = {};
  if (!isRecord(raw)) return days;
  for (const [key, value] of Object.entries(raw)) {
    if (!DAY_KEY.test(key)) continue;
    const day = parseDay(value);
    if (day) days[key] = day;
  }
  return days;
}

/** The last 60 days up to `today`; the same object when there is nothing to drop. */
export function pruneDays(days: DayLedger, today: string): DayLedger {
  const first = shiftDay(today, -(DAYS_KEPT - 1));
  const old = Object.keys(days).filter((key) => key < first);
  if (old.length === 0) return days;
  const kept: DayLedger = {};
  for (const [key, day] of Object.entries(days)) if (key >= first) kept[key] = day;
  return kept;
}

export function readDays(storage: Read, userId: string): DayLedger {
  try {
    return parseDays(storage?.getItem(GAME_KEYS.days + userId));
  } catch {
    return {};
  }
}

/** false when the ledger could not be kept (it then lasts until the page is closed). */
export function writeDays(storage: Write, userId: string, days: DayLedger): boolean {
  return write(storage, GAME_KEYS.days + userId, days);
}

const isBadgeId = (value: string): value is BadgeId => (BADGE_IDS as readonly string[]).includes(value);

/** Only the known badges with a finite date. */
export function readBadgeDates(storage: Read, userId: string): Partial<Record<BadgeId, number>> {
  const dates: Partial<Record<BadgeId, number>> = {};
  try {
    const raw = parseJson(storage?.getItem(GAME_KEYS.badges + userId));
    if (!isRecord(raw)) return dates;
    for (const [id, at] of Object.entries(raw)) if (isBadgeId(id) && typeof at === "number" && Number.isFinite(at)) dates[id] = at;
  } catch {
    return {};
  }
  return dates;
}

export function writeBadgeDates(storage: Write, userId: string, dates: Partial<Record<BadgeId, number>>): boolean {
  return write(storage, GAME_KEYS.badges + userId, dates);
}

/** The keys already celebrated, oldest first. */
export function readSeen(storage: Read, userId: string): string[] {
  try {
    const raw = parseJson(storage?.getItem(GAME_KEYS.seen + userId));
    return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === "string").slice(-SEEN_KEPT) : [];
  } catch {
    return [];
  }
}

/** Keeps the last 200 keys. */
export function writeSeen(storage: Write, userId: string, keys: readonly string[]): boolean {
  return write(storage, GAME_KEYS.seen + userId, keys.slice(-SEEN_KEPT));
}

function write(storage: Write, key: string, value: unknown): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
