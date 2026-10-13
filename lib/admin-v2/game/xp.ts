// ADMIN v3 V4 — the XP table and the rules that decide which rows of the admin
// journal carry XP (plan §6.2). Pure: rows in, scored actions out. The input is
// not changed, may come unsorted and may repeat an `id`.

import { applyCombo } from "./combo";
import type { XpActionId } from "./ids";
import type { ActivityRow, ScoredAction, XpRepeat, XpRule } from "./types";

const HOUR_MS = 3_600_000;
const EVERY: XpRepeat = { kind: "every" };
const perHref = (windowMs: number): XpRepeat => ({ kind: "perHref", windowMs });
const rule = (label: XpActionId, xp: number, combo: boolean, repeat: XpRepeat): XpRule => ({ label, xp, combo, repeat });

const channel = rule("kanal", 10, true, perHref(24 * HOUR_MS));
const sticker = rule("nalepnica", 10, true, EVERY);

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
  digital_qr_linked: rule("digitalni_qr", 10, false, EVERY),
  admin_v1_manual_communication_logged: rule("komunikacija", 5, false, EVERY),
  admin_v1_task_created: rule("novi_zadatak", 3, false, EVERY),
});

/** An undo within `windowMs` takes back the last sticker linked on the same `href`. */
export const XP_UNDO = { action: "fair_qr_link_undone", cancels: ["fair_qr_assigned", "fair_qr_reassigned"], windowMs: 5 * 60_000 } as const;

export function xpRule(action: string): XpRule | null {
  return Object.prototype.hasOwnProperty.call(XP_TABLE, action) ? XP_TABLE[action] : null;
}

const byTime = (a: ActivityRow, b: ActivityRow) => a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Rows that carry XP, oldest first, after the actor rule, the repeat rules and the undo rule; before the combo. */
export function countedRows(rows: readonly ActivityRow[]): Array<{ row: ActivityRow; rule: XpRule }> {
  const unique = new Map<string, ActivityRow>();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  const counted: Array<{ row: ActivityRow; rule: XpRule }> = [];
  // The time of the last counted row per label and href: the repeat windows measure from it.
  const lastCounted = new Map<string, number>();
  for (const row of [...unique.values()].sort(byTime)) {
    if (row.actorKind !== "admin") continue;
    if (row.action === XP_UNDO.action) {
      for (let i = counted.length - 1; i >= 0; i--) {
        const earlier = counted[i].row;
        if (row.occurredAt - earlier.occurredAt > XP_UNDO.windowMs) break;
        if (earlier.href === row.href && (XP_UNDO.cancels as readonly string[]).includes(earlier.action)) {
          counted.splice(i, 1);
          break;
        }
      }
      continue;
    }
    const found = xpRule(row.action);
    if (!found) continue;
    if (found.repeat.kind === "perHref") {
      const key = `${found.label}\u0000${row.href}`;
      const last = lastCounted.get(key);
      if (last !== undefined && row.occurredAt - last <= found.repeat.windowMs) continue;
      lastCounted.set(key, row.occurredAt);
    }
    counted.push({ row, rule: found });
  }
  return counted;
}

/** countedRows + applyCombo. */
export function scoreRows(rows: readonly ActivityRow[]): ScoredAction[] {
  return applyCombo(countedRows(rows));
}
