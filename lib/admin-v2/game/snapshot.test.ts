import { describe, expect, it } from "vitest";
import {
  EMPTY_SNAPSHOT,
  XP_HISTORY_PAGES,
  XP_PAGE_SIZE,
  XP_SNAPSHOT_PREFIX,
  XP_TAIL_MS,
  foldSnapshot,
  parseSnapshot,
  readSnapshot,
  tailScored,
  todayXp,
  workedOn,
  writeSnapshot,
} from "./snapshot";
import type { ActivityRow, XpSnapshot } from "./types";
import { scoreRows } from "./xp";

// Tuesday 2026-10-13, 10:00 in Belgrade.
const T0 = Date.UTC(2026, 9, 13, 8, 0);
const SEC = 1000;
const MIN = 60_000;
const HOUR = 3_600_000;

let seq = 0;
const row = (action: string, at: number, href?: string, over: Partial<ActivityRow> = {}): ActivityRow => {
  const id = `s${String(++seq).padStart(5, "0")}`;
  return { id, action, actorKind: "admin", occurredAt: at, href: href ?? `/h/${id}`, ...over };
};
const printer = (at: number) => row("admin_order_sent_to_printer", at);
const delivery = (at: number) => row("admin_order_delivery_completed", at);

/** The rows folded in two parts split by time must give the totals of the rows folded at once. */
function foldedInTwo(rows: ActivityRow[], splitAt: number) {
  const first = foldSnapshot(null, rows.filter((r) => r.occurredAt < splitAt));
  return foldSnapshot(first, rows.filter((r) => r.occurredAt >= splitAt));
}

describe("constants", () => {
  it("fixes the key, the tail and the reading", () => {
    expect(XP_SNAPSHOT_PREFIX).toBe("scanme.admin.game.xp.v1.");
    expect(XP_TAIL_MS).toBe(26 * HOUR);
    expect(XP_PAGE_SIZE).toBe(50);
    expect(XP_HISTORY_PAGES).toBe(20);
  });

  it("has an empty snapshot that nothing can change", () => {
    expect(EMPTY_SNAPSHOT).toEqual({ v: 1, through: 0, since: null, complete: false, totals: { xp: 0, actions: 0, deliveries: 0, bestChain: 0, marks: {} }, tail: [] });
    expect(Object.isFrozen(EMPTY_SNAPSHOT)).toBe(true);
    expect(Object.isFrozen(EMPTY_SNAPSHOT.totals)).toBe(true);
    expect(Object.isFrozen(EMPTY_SNAPSHOT.tail)).toBe(true);
  });
});

describe("foldSnapshot", () => {
  it("folds rows into totals, through, since and tail", () => {
    const rows = [delivery(T0), printer(T0 + 10 * SEC), row("admin_v1_action_snoozed", T0 + 20 * SEC)];
    const snap = foldSnapshot(null, rows);
    expect(snap.v).toBe(1);
    expect(snap.totals).toMatchObject({ xp: 30 + 10, actions: 2, deliveries: 1, bestChain: 2 });
    expect(snap.through).toBe(T0 + 20 * SEC);
    expect(snap.since).toBe(T0);
    expect(snap.complete).toBe(false);
    // Rows without XP stay in the tail: undo and snooze need them later.
    expect(snap.tail.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("returns the empty snapshot untouched for no rows, and never changes it", () => {
    expect(foldSnapshot(null, [])).toBe(EMPTY_SNAPSHOT);
    expect(EMPTY_SNAPSHOT.totals.xp).toBe(0);
    expect(EMPTY_SNAPSHOT.tail).toHaveLength(0);
    foldSnapshot(null, [printer(T0)]);
    expect(EMPTY_SNAPSHOT.totals.xp).toBe(0);
    expect(EMPTY_SNAPSHOT.since).toBeNull();
  });

  it("does not change its input", () => {
    const rows = [printer(T0 + SEC), printer(T0)];
    const base = foldSnapshot(null, [printer(T0 - HOUR)]);
    const rowsCopy = JSON.parse(JSON.stringify(rows));
    const baseCopy = JSON.parse(JSON.stringify(base));
    foldSnapshot(base, rows, true);
    expect(rows).toEqual(rowsCopy);
    expect(base).toEqual(baseCopy);
  });

  it("is idempotent: the same rows twice are the same as once", () => {
    const rows = [printer(T0), printer(T0 + 30 * SEC), delivery(T0 + 60 * SEC), delivery(T0 + 5 * HOUR)];
    const once = foldSnapshot(null, rows);
    const twice = foldSnapshot(once, rows);
    expect(twice).toBe(once);
    expect(foldSnapshot(null, [...rows, ...rows])).toEqual(once);
  });

  it("is idempotent for an overlapping page too", () => {
    const rows = Array.from({ length: 10 }, (_, i) => printer(T0 + i * 30 * SEC));
    const part = foldSnapshot(null, rows.slice(0, 7));
    const overlapped = foldSnapshot(part, rows.slice(3));
    expect(overlapped.totals).toEqual(foldSnapshot(null, rows).totals);
  });

  it("ignores a late row: older than through and not in the tail", () => {
    const base = foldSnapshot(null, [printer(T0 + HOUR)]);
    const late = printer(T0);
    expect(foldSnapshot(base, [late])).toBe(base);
  });

  it("takes a row of the same time as through whose id is not in the tail", () => {
    const base = foldSnapshot(null, [printer(T0)]);
    const sibling = printer(T0);
    const next = foldSnapshot(base, [sibling]);
    expect(next.totals.actions).toBe(2);
    expect(next.through).toBe(T0);
  });

  it("skips a row with a time that is not a number", () => {
    expect(foldSnapshot(null, [printer(Number.NaN)])).toBe(EMPTY_SNAPSHOT);
  });

  it("does not count a row of another actor kind", () => {
    const snap = foldSnapshot(null, [row("admin_order_sent_to_printer", T0, "/x", { actorKind: "system" })]);
    expect(snap.totals).toMatchObject({ xp: 0, actions: 0 });
    // The row is still a fact of the journal: through and since move.
    expect(snap.through).toBe(T0);
    expect(snap.since).toBe(T0);
  });

  it("keeps `since` at the oldest row ever folded", () => {
    const base = foldSnapshot(null, [printer(T0)]);
    const older = foldSnapshot({ ...base, through: 0 }, [printer(T0 - 5 * HOUR)]);
    expect(older.since).toBe(T0 - 5 * HOUR);
    expect(foldSnapshot(base, [printer(T0 + MIN)]).since).toBe(T0);
  });

  it("sets `complete` once and keeps it", () => {
    const base = foldSnapshot(null, [printer(T0)]);
    const done = foldSnapshot(base, [], true);
    expect(done).not.toBe(base);
    expect(done).toEqual({ ...base, complete: true });
    expect(foldSnapshot(done, [], true)).toBe(done);
    expect(foldSnapshot(done, [printer(T0 + MIN)]).complete).toBe(true);
    expect(foldSnapshot(base, [], false)).toBe(base);
    expect(foldSnapshot(null, [], true)).toEqual({ ...EMPTY_SNAPSHOT, complete: true });
  });

  it("cuts the tail to 26 h before through and never keeps an older row", () => {
    const rows = [printer(T0), printer(T0 + 10 * HOUR), printer(T0 + 20 * HOUR), printer(T0 + 30 * HOUR), printer(T0 + 36 * HOUR)];
    const snap = foldSnapshot(null, rows);
    expect(snap.through).toBe(T0 + 36 * HOUR);
    expect(snap.tail.every((r) => r.occurredAt > snap.through - XP_TAIL_MS)).toBe(true);
    expect(snap.tail.map((r) => r.occurredAt)).toEqual([T0 + 20 * HOUR, T0 + 30 * HOUR, T0 + 36 * HOUR]);
    // A row exactly 26 h before through is out, one millisecond newer is in.
    const edge = foldSnapshot(null, [printer(T0), printer(T0 + XP_TAIL_MS), printer(T0 + 1)]);
    expect(edge.tail.map((r) => r.occurredAt)).toEqual([T0 + 1, T0 + XP_TAIL_MS]);
  });

  it("keeps the tail short through many folds", () => {
    let snap: XpSnapshot | null = null;
    for (let day = 0; day < 10; day++) snap = foldSnapshot(snap, [printer(T0 + day * 24 * HOUR), printer(T0 + day * 24 * HOUR + MIN)]);
    expect(snap?.tail.length).toBeLessThanOrEqual(4);
    expect(snap?.tail.every((r) => r.occurredAt > (snap?.through ?? 0) - XP_TAIL_MS)).toBe(true);
    expect(snap?.totals.actions).toBe(20);
  });

  describe("marks", () => {
    it("writes `first` at the time of the first action with XP", () => {
      const snap = foldSnapshot(null, [row("admin_v1_action_snoozed", T0 - HOUR), printer(T0)]);
      expect(snap.totals.marks).toEqual({ first: T0 });
    });

    it("writes `actions100` at the hundredth action", () => {
      const rows = Array.from({ length: 105 }, (_, i) => printer(T0 + i * 3 * MIN));
      const snap = foldSnapshot(null, rows);
      expect(snap.totals.actions).toBe(105);
      expect(snap.totals.marks.actions100).toBe(rows[99].occurredAt);
      expect(foldSnapshot(null, rows.slice(0, 99)).totals.marks.actions100).toBeUndefined();
    });

    it("writes `deliveries10` at the tenth delivery", () => {
      const rows = Array.from({ length: 12 }, (_, i) => delivery(T0 + i * 3 * MIN));
      const snap = foldSnapshot(null, rows);
      expect(snap.totals.deliveries).toBe(12);
      expect(snap.totals.marks.deliveries10).toBe(rows[9].occurredAt);
      expect(foldSnapshot(null, rows.slice(0, 9)).totals.marks.deliveries10).toBeUndefined();
    });

    it("writes `chain5` at the first action with a chain of 5", () => {
      const rows = Array.from({ length: 7 }, (_, i) => printer(T0 + i * 10 * SEC));
      const snap = foldSnapshot(null, rows);
      expect(snap.totals.bestChain).toBe(7);
      expect(snap.totals.marks.chain5).toBe(rows[4].occurredAt);
      expect(foldSnapshot(null, rows.slice(0, 4)).totals.marks.chain5).toBeUndefined();
    });

    it("writes the level marks when the level is first reached", () => {
      // Deliveries 3 min apart: no combo, 30 XP each. 1500 XP (level 6) is the 50th.
      const rows = Array.from({ length: 52 }, (_, i) => delivery(T0 + i * 3 * MIN));
      const snap = foldSnapshot(null, rows);
      expect(snap.totals.xp).toBe(1560);
      expect(snap.totals.marks.level6).toBe(rows[49].occurredAt);
      expect(snap.totals.marks.level11).toBeUndefined();
      expect(foldSnapshot(null, rows.slice(0, 49)).totals.marks.level6).toBeUndefined();
    });

    it("writes the marks of every level it jumped over with the same time", () => {
      const rows = Array.from({ length: 800 }, (_, i) => delivery(T0 + i * 3 * MIN));
      const snap = foldSnapshot(null, rows);
      expect(snap.totals.xp).toBe(24_000);
      expect(snap.totals.marks.level21).toBe(rows[699].occurredAt);
      expect(snap.totals.marks.level16).toBe(rows[399].occurredAt);
      expect(snap.totals.marks.level11).toBe(rows[183].occurredAt);
    });

    it("writes a mark once: later folds do not move it", () => {
      const first = foldSnapshot(null, [printer(T0)]);
      const later = foldSnapshot(first, [printer(T0 + HOUR)]);
      expect(later.totals.marks.first).toBe(T0);
    });
  });

  describe("the same totals in two parts as at once", () => {
    it("when the boundary cuts a combo chain", () => {
      const rows = Array.from({ length: 8 }, (_, i) => printer(T0 + i * 20 * SEC));
      const once = foldSnapshot(null, rows);
      for (const cut of [1, 2, 3, 4, 5, 6, 7]) expect(foldedInTwo(rows, rows[cut].occurredAt).totals).toEqual(once.totals);
      expect(once.totals.bestChain).toBe(8);
    });

    it("when the boundary cuts a day with almost the whole daily bonus used", () => {
      // Six deliveries one second apart use 180 of 200; the 7th gets 20 and the rest nothing.
      const rows = Array.from({ length: 10 }, (_, i) => delivery(T0 + i * SEC));
      const once = foldSnapshot(null, rows);
      expect(once.totals.xp).toBe(10 * 30 + 200);
      for (const cut of [3, 5, 6, 7, 8]) expect(foldedInTwo(rows, rows[cut].occurredAt).totals).toEqual(once.totals);
    });

    it("when the boundary cuts a day that goes on after midnight in Belgrade", () => {
      const rows = [
        ...Array.from({ length: 8 }, (_, i) => delivery(Date.UTC(2026, 9, 13, 21, 59) + i * 5 * SEC)),
        ...Array.from({ length: 4 }, (_, i) => delivery(Date.UTC(2026, 9, 13, 22, 1) + i * SEC)),
      ];
      const once = foldSnapshot(null, rows);
      for (const cut of [4, 7, 8, 9, 11]) expect(foldedInTwo(rows, rows[cut].occurredAt).totals).toEqual(once.totals);
    });

    it("when the boundary cuts the 24 h repeat window", () => {
      const task = "/task/TEST-1";
      const rows = [
        row("admin_v1_task_completed", T0, task),
        row("admin_v1_task_completed", T0 + 23 * HOUR, task),
        row("admin_v1_task_completed", T0 + 24 * HOUR, task),
        row("admin_v1_task_completed", T0 + 25 * HOUR, task),
      ];
      const once = foldSnapshot(null, rows);
      expect(once.totals.actions).toBe(2);
      for (const cut of [1, 2, 3]) expect(foldedInTwo(rows, rows[cut].occurredAt).totals).toEqual(once.totals);
    });

    it("when the boundary cuts the 10 min reply window", () => {
      const rows = [
        row("admin_v1_conversation_reply_sent", T0, "/c/TEST-1"),
        row("admin_v1_conversation_reply_sent", T0 + 9 * MIN, "/c/TEST-1"),
        row("admin_v1_conversation_reply_sent", T0 + 10 * MIN + 1, "/c/TEST-1"),
      ];
      const once = foldSnapshot(null, rows);
      expect(once.totals.actions).toBe(2);
      for (const cut of [1, 2]) expect(foldedInTwo(rows, rows[cut].occurredAt).totals).toEqual(once.totals);
    });

    it("for a long mixed journal split at every row", () => {
      // A pseudo-random day-and-night journal: several actions, hrefs from a small set.
      let state = 20_261_013;
      const next = () => {
        state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return state / 4_294_967_296;
      };
      const actions = ["admin_order_sent_to_printer", "admin_order_delivery_completed", "admin_v1_problem_resolved", "digital_qr_linked", "admin_v1_action_snoozed", "admin_order_payment_recorded"];
      let at = T0;
      const rows: ActivityRow[] = [];
      for (let i = 0; i < 120; i++) {
        at += Math.floor(next() * 5) === 0 ? Math.floor(next() * 14 * HOUR) : Math.floor(next() * 150 * SEC);
        rows.push(row(actions[Math.floor(next() * actions.length)], at, `/o/${Math.floor(next() * 4)}`));
      }
      const once = foldSnapshot(null, rows);
      for (let cut = 1; cut < rows.length; cut++) {
        if (rows[cut].occurredAt === rows[cut - 1].occurredAt) continue;
        expect(foldedInTwo(rows, rows[cut].occurredAt).totals).toEqual(once.totals);
      }
    });

    it("when the rows come in three parts", () => {
      const rows = Array.from({ length: 12 }, (_, i) => printer(T0 + i * 25 * SEC));
      const a = foldSnapshot(null, rows.slice(0, 4));
      const b = foldSnapshot(a, rows.slice(4, 8));
      const c = foldSnapshot(b, rows.slice(8));
      expect(c.totals).toEqual(foldSnapshot(null, rows).totals);
      expect(c.through).toBe(rows[11].occurredAt);
    });
  });
});

describe("tailScored, todayXp, workedOn", () => {
  const NOW = T0 + 5 * HOUR;

  it("scores the tail on its own", () => {
    const rows = [printer(T0), printer(T0 + 10 * SEC), printer(T0 + 20 * SEC)];
    const snap = foldSnapshot(null, rows);
    expect(tailScored(snap)).toEqual(scoreRows(snap.tail));
    expect(tailScored(snap).map((a) => a.chain)).toEqual([1, 2, 3]);
    expect(tailScored(EMPTY_SNAPSHOT)).toEqual([]);
  });

  it("adds the XP of the Belgrade day of `now` only", () => {
    // Yesterday 23:30 Belgrade (21:30 UTC) is still in the tail; today's two rows are 3 min apart, so no combo.
    const yesterday = printer(Date.UTC(2026, 9, 12, 21, 30));
    const today = [printer(Date.UTC(2026, 9, 12, 22, 5)), delivery(Date.UTC(2026, 9, 12, 22, 8))];
    const snap = foldSnapshot(null, [yesterday, ...today]);
    expect(snap.tail).toHaveLength(3);
    expect(todayXp(snap, Date.UTC(2026, 9, 13, 10, 0))).toBe(40);
    expect(todayXp(snap, Date.UTC(2026, 9, 12, 21, 45))).toBe(10);
  });

  it("is 0 for an empty snapshot, and when the tail is of an earlier day", () => {
    expect(todayXp(EMPTY_SNAPSHOT, NOW)).toBe(0);
    expect(todayXp(foldSnapshot(null, [printer(T0 - 2 * 24 * HOUR)]), NOW)).toBe(0);
  });

  it("says whether an action with XP is in the tail on a day", () => {
    const snap = foldSnapshot(null, [printer(T0), row("admin_v1_action_snoozed", T0 + 3 * HOUR)]);
    expect(workedOn(snap, "2026-10-13")).toBe(true);
    expect(workedOn(snap, "2026-10-12")).toBe(false);
    expect(workedOn(foldSnapshot(null, [row("admin_v1_action_snoozed", T0)]), "2026-10-13")).toBe(false);
    expect(workedOn(EMPTY_SNAPSHOT, "2026-10-13")).toBe(false);
  });
});

describe("parseSnapshot", () => {
  const good = (): XpSnapshot =>
    foldSnapshot(null, [printer(T0), printer(T0 + 5 * SEC), row("admin_v1_action_snoozed", T0 + 9 * SEC)], true);

  it("reads back what was written", () => {
    const snap = good();
    expect(parseSnapshot(JSON.stringify(snap))).toEqual(snap);
    expect(parseSnapshot(JSON.stringify(EMPTY_SNAPSHOT))).toEqual(EMPTY_SNAPSHOT);
  });

  it("is null for nothing, damaged text and the wrong kind of value", () => {
    for (const text of [null, undefined, "", "{", "not json", "null", "[]", "42", '"text"', "true"]) expect(parseSnapshot(text)).toBeNull();
  });

  it("is null for a different version or a field of the wrong type", () => {
    const base = JSON.parse(JSON.stringify(good()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const broken = (patch: (s: Record<string, any>) => void) => {
      const copy = JSON.parse(JSON.stringify(base));
      patch(copy);
      return parseSnapshot(JSON.stringify(copy));
    };
    expect(broken((s) => (s.v = 2))).toBeNull();
    expect(broken((s) => delete s.v)).toBeNull();
    expect(broken((s) => (s.through = "1"))).toBeNull();
    expect(broken((s) => (s.through = null))).toBeNull();
    expect(broken((s) => (s.since = "x"))).toBeNull();
    expect(broken((s) => delete s.since)).toBeNull();
    expect(broken((s) => (s.complete = 1))).toBeNull();
    expect(broken((s) => (s.totals = null))).toBeNull();
    expect(broken((s) => (s.totals.xp = "5"))).toBeNull();
    expect(broken((s) => (s.totals.actions = null))).toBeNull();
    expect(broken((s) => (s.totals.marks = null))).toBeNull();
    expect(broken((s) => (s.totals.marks.first = "x"))).toBeNull();
    expect(broken((s) => (s.tail = {}))).toBeNull();
    expect(broken((s) => (s.tail[0].id = 5))).toBeNull();
    expect(broken((s) => delete s.tail[0].href)).toBeNull();
    expect(broken((s) => (s.tail[0].occurredAt = null))).toBeNull();
    expect(broken((s) => s.tail.push(null))).toBeNull();
  });

  it("is null for a number that is not finite", () => {
    // JSON has no NaN; a huge exponent reads as Infinity.
    expect(parseSnapshot(JSON.stringify(good()).replace(/"through":\d+/, '"through":1e999'))).toBeNull();
  });

  it("keeps only the five fields of a row and the known marks", () => {
    const base = JSON.parse(JSON.stringify(good()));
    base.tail[0].secret = "x";
    base.totals.marks.unknown = 5;
    const snap = parseSnapshot(JSON.stringify(base));
    expect(Object.keys(snap?.tail[0] ?? {}).sort()).toEqual(["action", "actorKind", "href", "id", "occurredAt"]);
    expect(snap?.totals.marks).not.toHaveProperty("unknown");
  });
});

describe("readSnapshot and writeSnapshot", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  const snap = foldSnapshot(null, [printer(T0)]);

  it("writes under the prefix and the user and reads it back", () => {
    const store = memory();
    expect(writeSnapshot(store, "TEST-ana", snap)).toBe(true);
    expect([...store.data.keys()]).toEqual(["scanme.admin.game.xp.v1.TEST-ana"]);
    expect(readSnapshot(store, "TEST-ana")).toEqual(snap);
    expect(readSnapshot(store, "TEST-bor")).toBeNull();
  });

  it("is null for a damaged value", () => {
    const store = memory();
    store.data.set(XP_SNAPSHOT_PREFIX + "TEST-ana", "{oops");
    expect(readSnapshot(store, "TEST-ana")).toBeNull();
  });

  it("never throws: a storage that throws gives null / false", () => {
    const failing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readSnapshot(failing, "TEST-ana")).toBeNull();
    expect(writeSnapshot(failing, "TEST-ana", snap)).toBe(false);
  });

  it("handles a missing storage", () => {
    expect(readSnapshot(null, "TEST-ana")).toBeNull();
    expect(readSnapshot(undefined, "TEST-ana")).toBeNull();
    expect(writeSnapshot(null, "TEST-ana", snap)).toBe(false);
    expect(writeSnapshot(undefined, "TEST-ana", snap)).toBe(false);
  });
});

describe("a sticker undone after it was already folded (V4 review)", () => {
  const AT = Date.UTC(2026, 9, 13, 8, 0);
  const sticker: ActivityRow = { id: "undo-1", action: "fair_qr_assigned", actorKind: "admin", occurredAt: AT, href: "/admin/test/qr-1" };
  const undo: ActivityRow = { id: "undo-2", action: "fair_qr_link_undone", actorKind: "admin", occurredAt: AT + 60_000, href: "/admin/test/qr-1" };
  const other: ActivityRow = { id: "undo-3", action: "admin_v1_problem_resolved", actorKind: "admin", occurredAt: AT - 600_000, href: "/admin/test/p-1" };

  it("its XP leaves the totals, so a device that was open ends with the same number as one that reads the history at once", () => {
    const open = foldSnapshot(foldSnapshot(null, [other, sticker]), [undo]);
    const atOnce = foldSnapshot(null, [other, sticker, undo]);
    expect(foldSnapshot(null, [other, sticker]).totals).toMatchObject({ xp: 40, actions: 2 });
    expect(open.totals).toMatchObject({ xp: 30, actions: 1 });
    expect(open.totals.xp).toBe(atOnce.totals.xp);
    expect(open.totals.actions).toBe(atOnce.totals.actions);
  });

  it("an undo that comes too late, or for another sticker, takes nothing back", () => {
    const late: ActivityRow = { ...undo, occurredAt: AT + 5 * 60_000 + 1 };
    expect(foldSnapshot(foldSnapshot(null, [other, sticker]), [late]).totals).toMatchObject({ xp: 40, actions: 2 });
    const elsewhere: ActivityRow = { ...undo, href: "/admin/test/qr-2" };
    expect(foldSnapshot(foldSnapshot(null, [other, sticker]), [elsewhere]).totals).toMatchObject({ xp: 40, actions: 2 });
  });
});
