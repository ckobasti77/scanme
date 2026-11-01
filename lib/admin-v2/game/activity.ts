// ADMIN v3 V4 — small helpers over the rows of the admin journal (plan §6.1).
// Pure; nothing here changes its input.

import { dayKey } from "./time";
import type { ActivityRow } from "./types";

/** The server actions the game reads besides the XP table. */
export const GAME_ACTIONS = {
  resolved: "admin_v1_problem_resolved",
  reply: "admin_v1_conversation_reply_sent",
  snoozed: "admin_v1_action_snoozed",
  delivery: "admin_order_delivery_completed",
} as const;

/** The `actorKey` of the journal for a user (as in convex/lib/adminActivity.ts). */
export const actorKeyOf = (userId: string) => `user:${userId}`;

/** Only the five fields the game reads; a row of the server may carry more. */
export function toActivityRow(row: { id: string; action: string; actorKind: string; occurredAt: number; href: string }): ActivityRow {
  return { id: row.id, action: row.action, actorKind: row.actorKind, occurredAt: row.occurredAt, href: row.href };
}

/** One list, one row per `id` (the first seen wins), oldest first, equal times by `id`. */
export function mergeRows(...lists: ReadonlyArray<readonly ActivityRow[]>): ActivityRow[] {
  const unique = new Map<string, ActivityRow>();
  for (const list of lists) for (const row of list) if (!unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()].sort((a, b) => a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const isAdminOf = (row: ActivityRow, actions: readonly string[]) => row.actorKind === "admin" && actions.includes(row.action);

/** The newest `occurredAt` of an admin row with one of the actions; null when there is none. */
export function lastActionAt(rows: readonly ActivityRow[], actions: readonly string[]): number | null {
  let latest: number | null = null;
  for (const row of rows) if (isAdminOf(row, actions) && (latest === null || row.occurredAt > latest)) latest = row.occurredAt;
  return latest;
}

/** An admin row with one of the actions happened on that Belgrade day. */
export function actedOn(rows: readonly ActivityRow[], actions: readonly string[], day: string): boolean {
  return rows.some((row) => isAdminOf(row, actions) && dayKey(row.occurredAt) === day);
}
