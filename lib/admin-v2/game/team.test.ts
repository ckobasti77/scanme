import { describe, expect, it } from "vitest";
import { TEAM_PAGES, lastWeekWinner, teamBoard, teamSince } from "./team";
import type { ActivityRow, TeamJournal, TeamMember } from "./types";

const MIN = 60_000;
const HOUR = 3_600_000;

// October 2026 in Belgrade is UTC+2 until Sunday the 25th, then UTC+1.
const MON_12 = Date.UTC(2026, 9, 11, 22, 0); // Monday 12 Oct 00:00
const MON_5 = Date.UTC(2026, 9, 4, 22, 0); // Monday 5 Oct 00:00
const hour = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h - 2, m); // Belgrade wall clock, before the change of the clock
const TUE_NOW = hour(13, 10); // Tuesday 13 Oct 10:00
const WED_NOW = hour(14, 10);

let seq = 0;
/** A delivery is 30 XP and enters the combo; rows 3 min apart or more do not chain. */
const delivery = (at: number): ActivityRow => ({ id: `t${++seq}`, action: "admin_order_delivery_completed", actorKind: "admin", occurredAt: at, href: `/o/${seq}` });
const printer = (at: number): ActivityRow => ({ id: `t${++seq}`, action: "admin_order_sent_to_printer", actorKind: "admin", occurredAt: at, href: `/o/${seq}` });
const deliveries = (...times: number[]) => times.map(delivery);
const journal = (rows: ActivityRow[], capped = false): TeamJournal => ({ rows, capped });
const team = (...names: string[]): TeamMember[] => names.map((name) => ({ id: `user:TEST-${name.toLowerCase()}`, name: `TEST ${name}` }));
const id = (name: string) => `user:TEST-${name.toLowerCase()}`;

describe("teamSince", () => {
  it("is Monday 00:00 of the previous week in Belgrade", () => {
    expect(TEAM_PAGES).toBe(4);
    expect(teamSince(TUE_NOW)).toBe(MON_5);
    expect(teamSince(MON_12)).toBe(MON_5);
    expect(teamSince(MON_12 - 1)).toBe(Date.UTC(2026, 9, 4 - 7, 22, 0));
  });

  it("follows the change of the clock", () => {
    // Monday 26 Oct 10:00 is UTC+1; the previous Monday (19 Oct) 00:00 was still UTC+2.
    expect(teamSince(Date.UTC(2026, 9, 26, 9, 0))).toBe(Date.UTC(2026, 9, 18, 22, 0));
  });
});

describe("teamBoard", () => {
  it("is empty for no members", () => {
    expect(teamBoard([], {}, TUE_NOW, null)).toEqual({ weekStart: MON_12, rows: [] });
  });

  it("gives a member without a journal zeros", () => {
    const board = teamBoard(team("Ana"), {}, TUE_NOW, null);
    expect(board.rows).toEqual([
      { id: id("Ana"), name: "TEST Ana", me: false, xp: 0, atLeast: false, actions: 0, bestChain: 0, rank: 1, medal: null, move: null },
    ]);
  });

  it("counts the week from Monday 00:00 in Belgrade to now", () => {
    const rows = deliveries(
      MON_12 - MIN, // Sunday 23:59: last week
      MON_12, // Monday 00:00: this week
      hour(13, 9), // Tuesday 09:00
      TUE_NOW, // exactly now: counted
      TUE_NOW + MIN, // the future: not counted
    );
    const [row] = teamBoard(team("Ana"), { [id("Ana")]: journal(rows) }, TUE_NOW, null).rows;
    expect(row).toMatchObject({ xp: 90, actions: 3 });
  });

  it("uses the older rows as context: a chain that began last week goes on", () => {
    const rows = [printer(MON_12 - 30_000), printer(MON_12 + 30_000), printer(MON_12 + 60_000)];
    const [row] = teamBoard(team("Ana"), { [id("Ana")]: journal(rows) }, TUE_NOW, null).rows;
    // The first row is last week's; this week has two actions with chain 2 and 3 (x1 and x2: 10 + 10 + 10 bonus).
    expect(row).toMatchObject({ actions: 2, bestChain: 3, xp: 10 + 20 });
  });

  it("reports the longest chain of the week", () => {
    const burst = [0, 20, 40, 60, 80].map((s) => printer(hour(13, 9) + s * 1000));
    const [row] = teamBoard(team("Ana"), { [id("Ana")]: journal([...burst, delivery(hour(13, 9, 30))]) }, TUE_NOW, null).rows;
    expect(row.bestChain).toBe(5);
  });

  it("orders by XP, then by the number of actions", () => {
    const members: TeamMember[] = [
      { id: "user:TEST-5", name: "TEST Eva" },
      { id: "user:TEST-4", name: "TEST Dora" },
      { id: "user:TEST-3", name: "TEST Cara" },
      { id: "user:TEST-2", name: "TEST Bora" },
      { id: "user:TEST-1", name: "TEST Ana" },
    ];
    const journals = {
      "user:TEST-1": journal(deliveries(hour(13, 9), hour(13, 8))), // 60 XP
      "user:TEST-2": journal([printer(hour(13, 8)), printer(hour(13, 9)), printer(hour(13, 7))]), // 30 XP, 3 actions
      "user:TEST-3": journal(deliveries(hour(13, 9))), // 30 XP, 1 action
      "user:TEST-4": journal(deliveries(hour(13, 6))), // 30 XP, 1 action
      "user:TEST-5": journal([]),
    };
    const board = teamBoard(members, journals, TUE_NOW, null);
    expect(board.rows.map((r) => r.id)).toEqual(["user:TEST-1", "user:TEST-2", "user:TEST-3", "user:TEST-4", "user:TEST-5"]);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("breaks a tie of XP and actions by name with the Serbian collation, then by id", () => {
    const members: TeamMember[] = [
      { id: "user:TEST-b", name: "TEST Zlata" },
      { id: "user:TEST-a", name: "TEST Zlata" },
      { id: "user:TEST-c", name: "TEST Ana" },
    ];
    const one = () => journal(deliveries(hour(13, 9)));
    const board = teamBoard(members, { "user:TEST-b": one(), "user:TEST-a": one(), "user:TEST-c": one() }, TUE_NOW, null);
    expect(board.rows.map((r) => r.id)).toEqual(["user:TEST-c", "user:TEST-a", "user:TEST-b"]);
  });

  it("gives medals to the first three with XP, never to a member without XP", () => {
    const members = team("Ana", "Bora", "Cara", "Dora", "Eva");
    const journals = {
      [id("Ana")]: journal(deliveries(hour(13, 9), hour(13, 8), hour(13, 7))),
      [id("Bora")]: journal(deliveries(hour(13, 9), hour(13, 8))),
      [id("Cara")]: journal(deliveries(hour(13, 9))),
      [id("Dora")]: journal(deliveries(hour(13, 6))),
    };
    const board = teamBoard(members, journals, TUE_NOW, null);
    expect(board.rows.map((r) => [r.name, r.medal])).toEqual([
      ["TEST Ana", 1],
      ["TEST Bora", 2],
      ["TEST Cara", 3],
      ["TEST Dora", null],
      ["TEST Eva", null],
    ]);

    const two = teamBoard(members, { [id("Ana")]: journals[id("Ana")], [id("Bora")]: journals[id("Bora")] }, TUE_NOW, null);
    expect(two.rows.map((r) => r.medal)).toEqual([1, 2, null, null, null]);
    expect(teamBoard(members, {}, TUE_NOW, null).rows.every((r) => r.medal === null)).toBe(true);
  });

  it("marks me, and nobody for a null or unknown id", () => {
    const members = team("Ana", "Bora");
    expect(teamBoard(members, {}, TUE_NOW, id("Bora")).rows.map((r) => r.me)).toEqual([false, true]);
    expect(teamBoard(members, {}, TUE_NOW, null).rows.some((r) => r.me)).toBe(false);
    expect(teamBoard(members, {}, TUE_NOW, "user:TEST-nobody").rows.some((r) => r.me)).toBe(false);
  });

  it("says `at least` only when the read was capped inside the week", () => {
    const members = team("Ana", "Bora", "Cara", "Dora");
    const journals = {
      [id("Ana")]: journal(deliveries(hour(13, 9), hour(13, 8)), true), // capped, oldest row is after Monday 00:00
      [id("Bora")]: journal(deliveries(MON_5 + HOUR, hour(13, 9)), true), // capped, but reached into last week
      [id("Cara")]: journal(deliveries(hour(13, 9), hour(13, 8)), false), // not capped
      [id("Dora")]: journal([], true), // nothing read
    };
    const board = teamBoard(members, journals, TUE_NOW, null);
    const by = (name: string) => board.rows.find((r) => r.id === id(name))?.atLeast;
    expect([by("Ana"), by("Bora"), by("Cara"), by("Dora")]).toEqual([true, false, false, false]);
  });

  describe("move", () => {
    const members = team("Ana", "Bora", "Cara");
    const journals = () => ({
      // Monday and Tuesday: Ana 60 XP, Bora 30 XP. Wednesday: Bora +90, Cara first action.
      [id("Ana")]: journal(deliveries(hour(12, 10), hour(13, 10))),
      [id("Bora")]: journal(deliveries(hour(13, 11), hour(14, 8), hour(14, 8, 10), hour(14, 8, 20))),
      [id("Cara")]: journal(deliveries(hour(14, 9))),
    });

    it("is the place at the end of yesterday minus the place now", () => {
      const board = teamBoard(members, journals(), WED_NOW, null);
      expect(board.rows.map((r) => [r.name, r.rank, r.move])).toEqual([
        ["TEST Bora", 1, 1],
        ["TEST Ana", 2, -1],
        ["TEST Cara", 3, null],
      ]);
    });

    it("is 0 for a member who kept the place", () => {
      const calm = { [id("Ana")]: journal(deliveries(hour(12, 10), hour(13, 10))), [id("Bora")]: journal(deliveries(hour(13, 11))) };
      const board = teamBoard(members.slice(0, 2), calm, WED_NOW, null);
      expect(board.rows.map((r) => r.move)).toEqual([0, 0]);
    });

    it("is null for everyone on a Monday", () => {
      const monday = hour(12, 12);
      const board = teamBoard(members, journals(), monday, null);
      expect(board.rows.every((r) => r.move === null)).toBe(true);
      expect(board.weekStart).toBe(MON_12);
    });

    it("is null for a member with no XP action before today in this week (last week does not count)", () => {
      const only = { [id("Ana")]: journal(deliveries(MON_12 - HOUR, hour(14, 9))) };
      const [row] = teamBoard(team("Ana"), only, WED_NOW, null).rows;
      expect(row.move).toBeNull();
    });
  });

  it("does not change its input", () => {
    const members = team("Ana", "Bora");
    const journals = { [id("Ana")]: journal(deliveries(hour(13, 9), hour(13, 8))), [id("Bora")]: journal(deliveries(hour(12, 9))) };
    const copy = JSON.parse(JSON.stringify({ members, journals }));
    teamBoard(members, journals, WED_NOW, id("Ana"));
    expect({ members, journals }).toEqual(copy);
  });
});

describe("lastWeekWinner", () => {
  const members = team("Ana", "Bora", "Cara");

  it("is the member with the most XP in the previous week", () => {
    const journals = {
      [id("Ana")]: journal(deliveries(hour(6, 10))),
      [id("Bora")]: journal(deliveries(hour(7, 10), hour(8, 10))),
      [id("Cara")]: journal(deliveries(hour(9, 10))),
    };
    expect(lastWeekWinner(members, journals, TUE_NOW)).toBe(id("Bora"));
  });

  it("counts only the previous week: from Monday 00:00 to the next Monday 00:00", () => {
    const journals = {
      [id("Ana")]: journal(deliveries(MON_5 - HOUR, MON_5 - 4 * HOUR, hour(5, 10))), // two rows of the week before are out
      [id("Bora")]: journal(deliveries(MON_12, hour(12, 9), hour(13, 9))), // this week's rows are out
      [id("Cara")]: journal(deliveries(MON_5, MON_12 - 1)), // the edges: Monday 00:00 in, Sunday 23:59:59.999 in
    };
    expect(lastWeekWinner(members, journals, TUE_NOW)).toBe(id("Cara"));
  });

  it("breaks a tie like the table: actions, then name, then id", () => {
    const journals = {
      [id("Ana")]: journal(deliveries(hour(6, 10))),
      [id("Bora")]: journal(deliveries(hour(7, 10))),
    };
    expect(lastWeekWinner(members, journals, TUE_NOW)).toBe(id("Ana"));
    const moreActions = { ...journals, [id("Bora")]: journal([printer(hour(7, 10)), printer(hour(7, 11)), printer(hour(7, 12))]) };
    expect(lastWeekWinner(members, moreActions, TUE_NOW)).toBe(id("Bora"));
  });

  it("is null when nobody had XP, or there are no members or journals", () => {
    expect(lastWeekWinner(members, {}, TUE_NOW)).toBeNull();
    expect(lastWeekWinner([], {}, TUE_NOW)).toBeNull();
    expect(lastWeekWinner(members, { [id("Ana")]: journal(deliveries(hour(13, 9))) }, TUE_NOW)).toBeNull();
  });

  it("is null when the journal of a member was capped after the start of that week", () => {
    const journals = {
      [id("Ana")]: journal(deliveries(hour(6, 10), hour(7, 10), hour(8, 10))),
      [id("Bora")]: journal(deliveries(hour(10, 10), hour(11, 10)), true), // read stopped on Saturday: Monday to Friday is unknown
    };
    expect(lastWeekWinner(members, journals, TUE_NOW)).toBeNull();
  });

  it("names the winner when a capped journal reached back to the start of that week", () => {
    const journals = {
      [id("Ana")]: journal(deliveries(hour(6, 10)), false),
      [id("Bora")]: journal(deliveries(MON_5 - HOUR, hour(7, 10), hour(8, 10)), true),
    };
    expect(lastWeekWinner(members, journals, TUE_NOW)).toBe(id("Bora"));
  });

  it("does not change its input", () => {
    const journals = { [id("Ana")]: journal(deliveries(hour(8, 10), hour(6, 10))) };
    const copy = JSON.parse(JSON.stringify(journals));
    lastWeekWinner(members, journals, TUE_NOW);
    expect(journals).toEqual(copy);
  });
});
