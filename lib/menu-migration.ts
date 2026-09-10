// Menu migration — the concierge onboarding stages and the two-working-day
// deadline (RFC-003 §2.9, TASK-58). "Primljeno → u izradi → na potvrdi →
// objavljeno" is visible on the admin Menu subpage, not a promise in an email.
// Pure: the stage union mirrors `menus.migrationStage` in convex/schema.ts;
// the deadline is computed in Europe/Belgrade (the venue zone every Menu
// clock uses, lib/belgrade-time.ts), skipping Saturday and Sunday.

import { belgradeParts } from "./belgrade-time";

export const MIGRATION_STAGES = ["received", "in_progress", "review", "published"] as const;
export type MigrationStage = (typeof MIGRATION_STAGES)[number];

export const MIGRATION_SLA_WORKING_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function belgradeWeekday(epoch: number): number {
  const p = belgradeParts(epoch);
  // Day-of-week of the Belgrade calendar date (0 = Sunday) — computed on the
  // UTC calendar of the same Y-M-D, which has the same weekday by definition.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

// The deadline: `days` working days after `receivedAt`, at the same Belgrade
// wall-clock time. A weekend receipt counts from the next working day.
export function migrationDeadline(
  receivedAt: number,
  days: number = MIGRATION_SLA_WORKING_DAYS,
): number {
  let at = receivedAt;
  let remaining = days;
  while (remaining > 0) {
    at += DAY_MS;
    const weekday = belgradeWeekday(at);
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return at;
}

export function isMigrationStage(value: unknown): value is MigrationStage {
  return typeof value === "string" && (MIGRATION_STAGES as readonly string[]).includes(value);
}
