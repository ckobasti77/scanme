import { describe, expect, it } from "vitest";
import { XP_TABLE, XP_UNDO, countedRows, scoreRows, xpRule } from "./xp";
import type { ActivityRow } from "./types";

// Tuesday 2026-10-13, 10:00 in Belgrade.
const T0 = Date.UTC(2026, 9, 13, 8, 0);
const MIN = 60_000;
const HOUR = 3_600_000;

let seq = 0;
const row = (action: string, at: number, href = "/admin/test", over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: `r${++seq}`,
  action,
  actorKind: "admin",
  occurredAt: at,
  href,
  ...over,
});

describe("XP_TABLE", () => {
  const cases: Array<[string, string, number, boolean]> = [
    ["admin_v1_problem_resolved", "resena_stavka", 30, true],
    ["admin_v1_task_completed", "zavrsen_zadatak", 25, true],
    ["admin_order_delivery_completed", "isporuka", 30, true],
    ["admin_v1_conversation_reply_sent", "odgovor", 15, true],
    ["admin_order_payment_recorded", "uplata", 15, true],
    ["admin_order_design_approved", "dizajn", 15, true],
    ["admin_order_quality_control_recorded", "kontrola", 15, true],
    ["admin_order_sent_to_printer", "stampa", 10, true],
    ["access_channel_changed", "kanal", 10, true],
    ["access_channels_bulk_changed", "kanal", 10, true],
    ["fair_qr_assigned", "nalepnica", 10, true],
    ["fair_qr_reassigned", "nalepnica", 10, true],
    ["digital_qr_linked", "digitalni_qr", 10, false],
    ["admin_v1_manual_communication_logged", "komunikacija", 5, false],
    ["admin_v1_task_created", "novi_zadatak", 3, false],
  ];

  it.each(cases)("%s -> %s, %i XP, combo %s", (action, label, xp, combo) => {
    expect(xpRule(action)).toMatchObject({ label, xp, combo });
    // A single row carries exactly its table value (a first action is ×1).
    const scored = scoreRows([row(action, T0)]);
    expect(scored).toHaveLength(1);
    expect(scored[0]).toMatchObject({ label, base: xp, xp, chain: combo ? 1 : 0, multiplier: 1, bonus: 0 });
  });

  it("lists exactly the fifteen actions of the plan", () => {
    expect(Object.keys(XP_TABLE)).toHaveLength(15);
  });

  it("gives no XP to anything else", () => {
    for (const action of ["admin_v1_action_snoozed", "admin_v1_note_added", "fair_qr_link_undone", "", "constructor", "__proto__", "toString"]) {
      expect(xpRule(action)).toBeNull();
      expect(scoreRows([row(action, T0)])).toEqual([]);
    }
  });

  it("uses the repeat kinds of the plan", () => {
    expect(xpRule("admin_v1_problem_resolved")?.repeat).toEqual({ kind: "every" });
    expect(xpRule("admin_v1_task_completed")?.repeat).toEqual({ kind: "perHref", windowMs: 24 * HOUR });
    expect(xpRule("admin_v1_conversation_reply_sent")?.repeat).toEqual({ kind: "perHref", windowMs: 10 * MIN });
    expect(xpRule("admin_order_payment_recorded")?.repeat).toEqual({ kind: "perHref", windowMs: 60_000 });
    expect(xpRule("access_channel_changed")?.repeat).toEqual({ kind: "perHref", windowMs: 24 * HOUR });
    expect(xpRule("fair_qr_assigned")?.repeat).toEqual({ kind: "every" });
  });
});

describe("countedRows", () => {
  it("returns nothing for an empty input", () => {
    expect(countedRows([])).toEqual([]);
    expect(scoreRows([])).toEqual([]);
  });

  it("ignores a row whose actor is not an admin", () => {
    const rows = [row("admin_v1_problem_resolved", T0, "/a", { actorKind: "system" }), row("admin_v1_problem_resolved", T0 + 1000, "/b", { actorKind: "" })];
    expect(countedRows(rows)).toEqual([]);
  });

  it("sorts the rows and drops a repeated id", () => {
    const later = row("admin_order_sent_to_printer", T0 + 5000, "/b");
    const earlier = row("admin_order_sent_to_printer", T0, "/a");
    const result = countedRows([later, earlier, { ...later }]);
    expect(result.map((c) => c.row.id)).toEqual([earlier.id, later.id]);
  });

  it("does not change its input", () => {
    const rows = [row("admin_order_sent_to_printer", T0 + 5000), row("admin_order_sent_to_printer", T0)];
    const copy = JSON.parse(JSON.stringify(rows));
    countedRows(rows);
    scoreRows(rows);
    expect(rows).toEqual(copy);
  });

  it("counts the same href again only after the window has passed (24 h task)", () => {
    const a = row("admin_v1_task_completed", T0, "/task/1");
    const onEdge = row("admin_v1_task_completed", T0 + 24 * HOUR, "/task/1");
    const after = row("admin_v1_task_completed", T0 + 24 * HOUR + 1, "/task/1");
    expect(countedRows([a, onEdge]).map((c) => c.row.id)).toEqual([a.id]);
    expect(countedRows([a, after]).map((c) => c.row.id)).toEqual([a.id, after.id]);
  });

  it("measures the window from the last COUNTED row, not from the skipped one", () => {
    const a = row("admin_v1_conversation_reply_sent", T0, "/c/1");
    const skipped = row("admin_v1_conversation_reply_sent", T0 + 9 * MIN, "/c/1");
    const third = row("admin_v1_conversation_reply_sent", T0 + 10 * MIN + 1, "/c/1");
    expect(countedRows([a, skipped, third]).map((c) => c.row.id)).toEqual([a.id, third.id]);
  });

  it("applies the repeat window per href and per label", () => {
    const rows = [
      row("admin_v1_conversation_reply_sent", T0, "/c/1"),
      row("admin_v1_conversation_reply_sent", T0 + 1000, "/c/2"),
      row("admin_v1_task_completed", T0 + 2000, "/c/1"),
    ];
    expect(countedRows(rows)).toHaveLength(3);
  });

  it("applies the 60 s window to payments", () => {
    const a = row("admin_order_payment_recorded", T0, "/o/1");
    const edge = row("admin_order_payment_recorded", T0 + 60_000, "/o/1");
    const after = row("admin_order_payment_recorded", T0 + 60_001, "/o/1");
    expect(countedRows([a, edge]).map((c) => c.row.id)).toEqual([a.id]);
    expect(countedRows([a, after]).map((c) => c.row.id)).toEqual([a.id, after.id]);
  });

  it("shares the 24 h window between the single and the bulk channel change", () => {
    const single = row("access_channel_changed", T0, "/ch/1");
    const bulk = row("access_channels_bulk_changed", T0 + MIN, "/ch/1");
    const other = row("access_channels_bulk_changed", T0 + MIN, "/ch/2");
    expect(countedRows([single, bulk, other]).map((c) => c.row.id)).toEqual([single.id, other.id]);
  });

  it("counts every row of an `every` rule", () => {
    const rows = [row("admin_v1_problem_resolved", T0, "/same"), row("admin_v1_problem_resolved", T0 + 1000, "/same")];
    expect(countedRows(rows)).toHaveLength(2);
  });
});

describe("the undo of a sticker", () => {
  const { windowMs } = XP_UNDO;

  it("takes back the last sticker of the same href within five minutes", () => {
    const assigned = row("fair_qr_assigned", T0, "/sticker/1");
    const undone = row(XP_UNDO.action, T0 + windowMs, "/sticker/1");
    expect(countedRows([assigned, undone])).toEqual([]);
  });

  it("also takes back a reassigned sticker", () => {
    const reassigned = row("fair_qr_reassigned", T0, "/sticker/1");
    expect(countedRows([reassigned, row(XP_UNDO.action, T0 + MIN, "/sticker/1")])).toEqual([]);
  });

  it("leaves the sticker when the undo comes later than five minutes", () => {
    const assigned = row("fair_qr_assigned", T0, "/sticker/1");
    const undone = row(XP_UNDO.action, T0 + windowMs + 1, "/sticker/1");
    expect(countedRows([assigned, undone]).map((c) => c.row.id)).toEqual([assigned.id]);
  });

  it("does nothing without a sticker before it, or for another href", () => {
    const other = row("fair_qr_assigned", T0, "/sticker/2");
    expect(countedRows([row(XP_UNDO.action, T0 + MIN, "/sticker/1")])).toEqual([]);
    expect(countedRows([other, row(XP_UNDO.action, T0 + MIN, "/sticker/1")]).map((c) => c.row.id)).toEqual([other.id]);
  });

  it("takes back only the last one", () => {
    const first = row("fair_qr_assigned", T0, "/sticker/1");
    const second = row("fair_qr_reassigned", T0 + MIN, "/sticker/1");
    const result = countedRows([first, second, row(XP_UNDO.action, T0 + 2 * MIN, "/sticker/1")]);
    expect(result.map((c) => c.row.id)).toEqual([first.id]);
  });

  it("does not take back a sticker of another actor kind (it never counted)", () => {
    const foreign = row("fair_qr_assigned", T0, "/sticker/1", { actorKind: "system" });
    expect(countedRows([foreign, row(XP_UNDO.action, T0 + MIN, "/sticker/1")])).toEqual([]);
  });

  it("does not carry XP itself", () => {
    expect(xpRule(XP_UNDO.action)).toBeNull();
  });
});
