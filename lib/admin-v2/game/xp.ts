// ADMIN v3 V4 — the XP table and the rules that decide which rows of the admin
// journal carry XP (plan §6.2). Pure: rows in, scored actions out. The input is
// not changed, may come unsorted and may repeat an `id`.

import { applyCombo } from "./combo";
import type { XpActionId } from "./ids";
import { dayKey } from "./time";
import type { ActivityRow, ScoredAction, XpRepeat, XpRule } from "./types";

const HOUR_MS = 3_600_000;
const EVERY: XpRepeat = { kind: "every" };
const perHref = (windowMs: number): XpRepeat => ({ kind: "perHref", windowMs });
const rule = (label: XpActionId, xp: number, combo: boolean, repeat: XpRepeat, dailyMax?: number): XpRule => ({ label, xp, combo, repeat, ...(dailyMax === undefined ? {} : { dailyMax }) });

/**
 * V5 (RV N1) — the cheap actions carry XP only this many times a Belgrade day, per kind. They cost a
 * click (an empty task, a sticker moved back and forth), so without a limit they would fill the weekly
 * table of the team. The work that is hard to repeat (a solved item, a delivery, a reply) has none.
 */
export const XP_DAILY_MAX = { kanal: 10, nalepnica: 20, digitalni_qr: 10, komunikacija: 10, novi_zadatak: 10 } as const;

const channel = rule("kanal", 10, true, perHref(24 * HOUR_MS), XP_DAILY_MAX.kanal);
const sticker = rule("nalepnica", 10, true, EVERY, XP_DAILY_MAX.nalepnica);

/** Key: the `action` slug of the journal. Anything not listed carries no XP. */
export const XP_TABLE: Readonly<Record<string, XpRule>> = Object.freeze({
  admin_v1_problem_resolved: rule("resena_stavka", 30, true, EVERY),
  admin_v1_task_completed: rule("zavrsen_zadatak", 25, true, perHref(24 * HOUR_MS)),
  admin_order_delivery_completed: rule("isporuka", 30, true, EVERY),
  admin_v1_conversation_reply_sent: rule("odgovor", 15, true, perHref(10 * 60_000)),
  admin_order_payment_recorded: rule("uplata", 15, true, perHref(60_000)),
  admin_order_design_approved: rule("dizajn", 15, true, EVERY),
  admin_order_quality_control_recorded: rule("kontrola", 15, true, EVERY),
  admin_order_sent_to_printer: rule("stampa", 10, true, EVERY),
  access_channel_changed: channel,
  access_channels_bulk_changed: channel,
  fair_qr_assigned: sticker,
  fair_qr_reassigned: sticker,
  digital_qr_linked: rule("digitalni_qr", 10, false, EVERY, XP_DAILY_MAX.digitalni_qr),
  admin_v1_manual_communication_logged: rule("komunikacija", 5, false, EVERY, XP_DAILY_MAX.komunikacija),
  admin_v1_task_created: rule("novi_zadatak", 3, false, EVERY, XP_DAILY_MAX.novi_zadatak),
});

/** An undo within `windowMs` takes back the last sticker linked on the same `href`. */
export const XP_UNDO = { action: "fair_qr_link_undone", cancels: ["fair_qr_assigned", "fair_qr_reassigned"], windowMs: 5 * 60_000 } as const;

export function xpRule(action: string): XpRule | null {
  return Object.prototype.hasOwnProperty.call(XP_TABLE, action) ? XP_TABLE[action] : null;
}

const byTime = (a: ActivityRow, b: ActivityRow) => a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Rows that carry XP, oldest first, after the actor rule, the repeat rules, the daily limits and the undo rule; before the combo. */
export function countedRows(rows: readonly ActivityRow[]): Array<{ row: ActivityRow; rule: XpRule }> {
  const unique = new Map<string, ActivityRow>();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  const counted: Array<{ row: ActivityRow; rule: XpRule }> = [];
  // The time of the last counted row per label and href: the repeat windows measure from it.
  const lastCounted = new Map<string, number>();
  // How many rows of a label already carry XP on a Belgrade day (the daily limit of the cheap actions).
  const perDay = new Map<string, number>();
  const dayOf = (found: XpRule, row: ActivityRow) => `${found.label}\u0000${dayKey(row.occurredAt)}`;
  for (const row of [...unique.values()].sort(byTime)) {
    if (row.actorKind !== "admin") continue;
    if (row.action === XP_UNDO.action) {
      for (let i = counted.length - 1; i >= 0; i--) {
        const earlier = counted[i].row;
        if (row.occurredAt - earlier.occurredAt > XP_UNDO.windowMs) break;
        if (earlier.href === row.href && (XP_UNDO.cancels as readonly string[]).includes(earlier.action)) {
          // The sticker that was taken back gives its place of the day back as well.
          const slot = dayOf(counted[i].rule, earlier);
          if (perDay.has(slot)) perDay.set(slot, Math.max(0, (perDay.get(slot) ?? 0) - 1));
          counted.splice(i, 1);
          break;
        }
      }
      continue;
    }
    const found = xpRule(row.action);
    if (!found) continue;
    const repeatKey = found.repeat.kind === "perHref" ? `${found.label}\u0000${row.href}` : null;
    if (repeatKey !== null && found.repeat.kind === "perHref") {
      const last = lastCounted.get(repeatKey);
      if (last !== undefined && row.occurredAt - last <= found.repeat.windowMs) continue;
    }
    if (found.dailyMax !== undefined) {
      const slot = dayOf(found, row);
      const used = perDay.get(slot) ?? 0;
      if (used >= found.dailyMax) continue;
      perDay.set(slot, used + 1);
    }
    if (repeatKey !== null) lastCounted.set(repeatKey, row.occurredAt);
    counted.push({ row, rule: found });
  }
  return counted;
}

/** countedRows + applyCombo. */
export function scoreRows(rows: readonly ActivityRow[]): ScoredAction[] {
  return applyCombo(countedRows(rows));
}
