import { describe, expect, it } from "vitest";
import {
  MISSION_STORAGE_PREFIX,
  advanceLedger,
  markClearShown,
  missionBoard,
  missionDay,
  parseLedger,
  readLedger,
  ringDash,
  staleLedgerKeys,
  writeLedger,
  type MissionInput,
  type MissionLedger,
} from "./missions";

const DAY = "2026-10-12";
const mission = (id: string, count: number, tone: MissionInput["tone"] = "hitno"): MissionInput => ({ id, label: `TEST ${id}`, count, tone });

describe("mission progress", () => {
  it("starts the day with nothing solved: every mission that waits is open", () => {
    const { ledger, resolved, changed } = advanceLedger(null, [mission("a", 3), mission("b", 2, "uskoro")], DAY);
    expect(resolved).toEqual([]);
    expect(changed).toBe(true);
    const board = missionBoard([mission("a", 3), mission("b", 2, "uskoro")], ledger);
    expect(board).toMatchObject({ done: 0, total: 2, open: 2, share: 0, clear: "open" });
    expect(board.rows.map((row) => row.progress)).toEqual([{ done: 0, total: 3 }, { done: 0, total: 2 }]);
  });

  it("an item that left a mission is solved inside it; the mission is solved when nothing waits in it", () => {
    const start = advanceLedger(null, [mission("a", 3), mission("b", 2, "uskoro")], DAY).ledger;
    const step = advanceLedger(start, [mission("a", 1), mission("b", 0, "uskoro")], DAY);
    // What was solved in the step: two of the three items of a (one is left), both items of b (nothing is left).
    expect(step.resolved).toEqual([{ id: "a", solved: 2, open: 1, done: 2 }, { id: "b", solved: 2, open: 0, done: 2 }]);
    const board = missionBoard([mission("a", 1), mission("b", 0, "uskoro")], step.ledger);
    // „1 od 2 rešeno“: b is done, a still has one item of three.
    expect(board).toMatchObject({ done: 1, total: 2, open: 1, share: 0.5, clear: "open" });
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].progress).toEqual({ done: 2, total: 3 });
  });

  it("three of five missions solved: 3 od 5", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => mission(id, 2));
    const now = five.map((item, index) => ({ ...item, count: index < 3 ? 0 : 2 }));
    const ledger = advanceLedger(advanceLedger(null, five, DAY).ledger, now, DAY).ledger;
    expect(missionBoard(now, ledger)).toMatchObject({ done: 3, total: 5, open: 2, clear: "open" });
    expect(missionBoard(now, ledger).share).toBeCloseTo(0.6);
  });

  it("an item that arrives makes the mission bigger and takes no progress away", () => {
    const start = advanceLedger(null, [mission("a", 3)], DAY).ledger;
    const solved = advanceLedger(start, [mission("a", 1)], DAY).ledger;
    const more = advanceLedger(solved, [mission("a", 4)], DAY);
    expect(more.resolved).toEqual([]);
    expect(missionBoard([mission("a", 4)], more.ledger).rows[0].progress).toEqual({ done: 2, total: 6 });
  });

  it("a solved mission that gets new work is open again, with what was solved kept", () => {
    const start = advanceLedger(null, [mission("a", 2), mission("b", 1)], DAY).ledger;
    const solved = advanceLedger(start, [mission("a", 0), mission("b", 1)], DAY).ledger;
    expect(missionBoard([mission("a", 0), mission("b", 1)], solved)).toMatchObject({ done: 1, total: 2 });
    const again = advanceLedger(solved, [mission("a", 1), mission("b", 1)], DAY).ledger;
    const board = missionBoard([mission("a", 1), mission("b", 1)], again);
    expect(board).toMatchObject({ done: 0, total: 2, open: 2 });
    expect(board.rows[0].progress).toEqual({ done: 2, total: 3 });
  });

  it("the same numbers change nothing (a poll that brings the same data)", () => {
    const start = advanceLedger(null, [mission("a", 3)], DAY).ledger;
    const again = advanceLedger(start, [mission("a", 3)], DAY);
    expect(again.changed).toBe(false);
    expect(again.resolved).toEqual([]);
    expect(again.ledger).toEqual(start);
  });

  it("another day starts from zero", () => {
    const yesterday = advanceLedger(advanceLedger(null, [mission("a", 3)], "2026-10-11").ledger, [mission("a", 0)], "2026-10-11").ledger;
    expect(yesterday.tracks.a).toEqual({ open: 0, done: 3 });
    const today = advanceLedger(markClearShown(yesterday), [mission("a", 2)], DAY);
    expect(today.ledger).toEqual({ day: DAY, tracks: { a: { open: 2, done: 0 } }, clearShown: false });
    expect(today.resolved).toEqual([]);
  });

  it("a mission that is missing is unknown, unless the list is complete", () => {
    const start = advanceLedger(null, [mission("a", 3), mission("b", 2)], DAY).ledger;
    // A Dashboard widget that has not loaded: its mission is not in the list yet.
    const partial = advanceLedger(start, [mission("a", 3)], DAY);
    expect(partial.changed).toBe(false);
    expect(partial.ledger.tracks.b).toEqual({ open: 2, done: 0 });
    // …and it still waits: it counts as open until the page sends it.
    expect(missionBoard([mission("a", 3)], partial.ledger)).toMatchObject({ done: 0, total: 2, open: 2 });
    // An event's actions are the whole list: the rule that no longer fires was solved.
    const complete = advanceLedger(start, [mission("a", 3)], DAY, true);
    expect(complete.resolved).toEqual([{ id: "b", solved: 2, open: 0, done: 2 }]);
    expect(complete.ledger.tracks.b).toEqual({ open: 0, done: 2 });
    expect(missionBoard([mission("a", 3)], complete.ledger)).toMatchObject({ done: 1, total: 2 });
  });

  it("an info line is listed and never counted", () => {
    const missions = [mission("a", 1), mission("note", 14, "info")];
    const { ledger } = advanceLedger(null, missions, DAY);
    expect(ledger.tracks.note).toBeUndefined();
    const board = missionBoard(missions, ledger);
    expect(board).toMatchObject({ total: 1, open: 1 });
    expect(board.rows.map((row) => [row.id, row.progress])).toEqual([["a", { done: 0, total: 1 }], ["note", null]]);
  });

  it("lists only what waits, the most urgent first, in the order it was sent", () => {
    const board = missionBoard([mission("info", 2, "info"), mission("soon", 1, "uskoro"), mission("zero", 0), mission("now", 4), mission("now2", 1)], null);
    expect(board.rows.map((row) => row.id)).toEqual(["now", "now2", "soon", "info"]);
  });

  it("without a ledger nothing is solved yet", () => {
    expect(missionBoard([mission("a", 2), mission("b", 5)], null)).toMatchObject({ done: 0, total: 2, open: 2, clear: "open" });
    expect(missionBoard([], null)).toMatchObject({ done: 0, total: 0, share: 1, clear: "empty" });
  });
});

describe("„Sve čisto“ at most once a day", () => {
  const solved = () => advanceLedger(advanceLedger(null, [mission("a", 2)], DAY).ledger, [mission("a", 0)], DAY).ledger;

  it("is a celebration the first time everything is solved", () => {
    expect(missionBoard([mission("a", 0)], solved())).toMatchObject({ done: 1, total: 1, open: 0, share: 1, clear: "celebrate" });
  });

  it("is quiet once it was shown that day, also after new work was solved again", () => {
    const shown = markClearShown(solved());
    expect(missionBoard([mission("a", 0)], shown).clear).toBe("quiet");
    const more = advanceLedger(shown, [mission("a", 3)], DAY).ledger;
    expect(missionBoard([mission("a", 3)], more).clear).toBe("open");
    const again = advanceLedger(more, [mission("a", 0)], DAY).ledger;
    expect(again.clearShown).toBe(true);
    expect(missionBoard([mission("a", 0)], again).clear).toBe("quiet");
  });

  it("returns the next day", () => {
    const next = advanceLedger(markClearShown(solved()), [mission("a", 1)], "2026-10-13").ledger;
    const done = advanceLedger(next, [mission("a", 0)], "2026-10-13").ledger;
    expect(missionBoard([mission("a", 0)], done).clear).toBe("celebrate");
  });

  it("a day on which nothing waited is not a celebration", () => {
    const { ledger } = advanceLedger(null, [mission("a", 0)], DAY);
    expect(missionBoard([mission("a", 0)], ledger).clear).toBe("empty");
  });

  it("marking twice returns the same ledger", () => {
    const shown = markClearShown(solved());
    expect(markClearShown(shown)).toBe(shown);
  });
});

describe("widgets that arrive one by one (Dashboard)", () => {
  // Earlier today: the tasks for today were solved, two urgent items still wait.
  const earlier = () => {
    const start = advanceLedger(null, [mission("tasks-today", 2, "uskoro"), mission("reaction-urgent", 2)], DAY).ledger;
    return advanceLedger(start, [mission("tasks-today", 0, "uskoro"), mission("reaction-urgent", 2)], DAY).ledger;
  };

  it("the first widget with zeros is not „Sve čisto“ while another mission is known to wait", () => {
    const ledger = earlier();
    // After a reload only the tasks widget has arrived.
    const first = [mission("tasks-today", 0, "uskoro")];
    const step = advanceLedger(ledger, first, DAY);
    expect(step.resolved).toEqual([]);
    const board = missionBoard(first, step.ledger);
    expect(board).toMatchObject({ done: 1, total: 2, open: 1, clear: "open" });
    expect(board.clear).not.toBe("celebrate");
    // The reactions arrive: the same picture, now with its row.
    const both = [mission("tasks-today", 0, "uskoro"), mission("reaction-urgent", 2)];
    expect(missionBoard(both, advanceLedger(step.ledger, both, DAY).ledger)).toMatchObject({ done: 1, total: 2, open: 1, clear: "open" });
  });

  it("it is „Sve čisto“ only when every mission the day knows is solved", () => {
    const both = [mission("tasks-today", 0, "uskoro"), mission("reaction-urgent", 0)];
    const ledger = advanceLedger(earlier(), both, DAY).ledger;
    expect(missionBoard(both, ledger)).toMatchObject({ done: 2, total: 2, open: 0, clear: "celebrate" });
  });
});

describe("a number the read could only give as \"at least\"", () => {
  it("the row keeps the mark; a limited number that does not move shows no progress and no false one", () => {
    const capped = { ...mission("tasks-overdue", 4), capped: true };
    const start = advanceLedger(null, [capped], DAY).ledger;
    // One of seven real tasks was solved: the read still says "4 or more".
    const step = advanceLedger(start, [capped], DAY);
    expect(step.resolved).toEqual([]);
    expect(missionBoard([capped], step.ledger).rows[0]).toMatchObject({ count: 4, capped: true, progress: { done: 0, total: 4 } });
    // Below the limit the number is exact again and a fall counts.
    const exact = advanceLedger(step.ledger, [mission("tasks-overdue", 3)], DAY);
    expect(exact.resolved).toEqual([{ id: "tasks-overdue", solved: 1, open: 3, done: 1 }]);
  });
});

describe("the ledger in the browser", () => {
  const ledger: MissionLedger = { day: DAY, tracks: { a: { open: 1, done: 2 } }, clearShown: true };

  it("is written and read back under the scope", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    expect(writeLedger(storage, "dashboard", ledger)).toBe(true);
    expect([...values.keys()]).toEqual([`${MISSION_STORAGE_PREFIX}dashboard`]);
    expect(readLedger(storage, "dashboard")).toEqual(ledger);
    expect(readLedger(storage, "zadaci")).toBeNull();
  });

  it("a storage that throws is no progress, never an error", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readLedger(broken, "dashboard")).toBeNull();
    expect(writeLedger(broken, "dashboard", ledger)).toBe(false);
    expect(readLedger(null, "dashboard")).toBeNull();
    expect(writeLedger(undefined, "dashboard", ledger)).toBe(false);
  });

  it("drops a value that is not a ledger", () => {
    expect(parseLedger("")).toBeNull();
    expect(parseLedger("{")).toBeNull();
    expect(parseLedger("null")).toBeNull();
    expect(parseLedger(JSON.stringify({ day: 5, tracks: {} }))).toBeNull();
    expect(parseLedger(JSON.stringify({ day: DAY, tracks: { a: { open: -1, done: 0 }, b: { open: 2, done: 1 }, c: "x" } }))).toEqual({ day: DAY, tracks: { b: { open: 2, done: 1 } }, clearShown: false });
  });
});

describe("old ledgers are removed", () => {
  it("only mission ledgers of another day; today's, foreign keys and broken values of ours", () => {
    const today = JSON.stringify({ day: DAY, tracks: {}, clearShown: false });
    const yesterday = JSON.stringify({ day: "2026-10-11", tracks: {}, clearShown: true });
    expect(staleLedgerKeys([
      [`${MISSION_STORAGE_PREFIX}dashboard:`, today],
      [`${MISSION_STORAGE_PREFIX}zadaci`, yesterday],
      [`${MISSION_STORAGE_PREFIX}event:x:sajam:2:otvoren`, yesterday],
      [`${MISSION_STORAGE_PREFIX}pokvaren`, "{"],
      ["scanme.admin.quiet", "1"],
      ["scanme-theme", "dark"],
    ], DAY)).toEqual([`${MISSION_STORAGE_PREFIX}zadaci`, `${MISSION_STORAGE_PREFIX}event:x:sajam:2:otvoren`, `${MISSION_STORAGE_PREFIX}pokvaren`]);
  });
});

describe("helpers", () => {
  it("the day is the Belgrade day", () => {
    expect(missionDay(Date.parse("2026-10-12T21:59:00Z"))).toBe("2026-10-12");
    expect(missionDay(Date.parse("2026-10-12T22:01:00Z"))).toBe("2026-10-13");
  });

  it("the ring shows the solved share of the circle", () => {
    expect(ringDash(0, 100)).toBe("0.00 100.00");
    expect(ringDash(0.6, 100)).toBe("60.00 40.00");
    expect(ringDash(2, 100)).toBe("100.00 0.00");
    expect(ringDash(-1, 100)).toBe("0.00 100.00");
  });
});
