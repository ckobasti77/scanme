// ScanMe Menu V1 (K23) — what a table shows on the waiter panel's floor: the
// parallel active kinds side by side, neutral when nothing is active, the zone
// filter and the "Pretraži sto" search.

import { describe, expect, test } from "vitest";
import type { MenuRequestKind, MenuRequestStatus } from "./request-status";
import {
  TABLE_KINDS,
  activeKinds,
  effectiveZoneFilter,
  isNeutral,
  neutralSummary,
  requestZone,
  summarizeTables,
  tableMatches,
  tableSummaryOf,
  visibleInZone,
  type SummaryRequest,
  type TableSummary,
} from "./table-summary";

type Options = { by?: SummaryRequest["acceptedBy"] };

function req(
  id: string,
  kind: MenuRequestKind,
  status: MenuRequestStatus,
  positionId: string,
  createdAt: number,
  options: Options = {},
): SummaryRequest {
  const acceptedBy = options.by !== undefined ? options.by : null;
  return { id, kind, status, positionId, createdAt, acceptedBy };
}

describe("TABLE_KINDS", () => {
  test("are call, order, bill, reservation in the order of the table view's columns", () => {
    expect([...TABLE_KINDS]).toEqual(["call", "order", "bill", "reservation"]);
  });
});

describe("summarizeTables", () => {
  test("parallel kinds of one position are counted side by side (call + order + bill)", () => {
    const summaries = summarizeTables([
      req("c1", "call", "new", "t1", 100),
      req("o1", "order", "new", "t1", 200),
      req("b1", "bill", "accepted", "t1", 300),
    ]);
    const table = summaries.get("t1")!;
    expect(Object.keys(table.kinds).sort()).toEqual(["bill", "call", "order"]);
    expect(table.active).toBe(3);
    expect(table.newCount).toBe(2);
    expect(table.kinds.call?.count).toBe(1);
    expect(table.kinds.order?.count).toBe(1);
    expect(table.kinds.bill?.count).toBe(1);
    expect(isNeutral(table)).toBe(false);
  });

  test("positions are summarized separately", () => {
    const summaries = summarizeTables([req("a", "call", "new", "t1", 100), req("b", "bill", "new", "t2", 200)]);
    expect([...summaries.keys()].sort()).toEqual(["t1", "t2"]);
    expect(Object.keys(summaries.get("t1")!.kinds)).toEqual(["call"]);
    expect(Object.keys(summaries.get("t2")!.kinds)).toEqual(["bill"]);
  });

  test("only new and accepted count: done and cancelled are ignored", () => {
    const summaries = summarizeTables([
      req("a", "call", "done", "t1", 100),
      req("b", "bill", "cancelled", "t1", 200),
      req("c", "order", "new", "t1", 300),
    ]);
    const table = summaries.get("t1")!;
    expect(table.active).toBe(1);
    expect(Object.keys(table.kinds)).toEqual(["order"]);
    expect(table.oldestAt).toBe(300);
  });

  test("a table with only a done request is absent from the map (neutral)", () => {
    const summaries = summarizeTables([req("a", "call", "done", "t1", 100), req("b", "bill", "cancelled", "t1", 200)]);
    expect(summaries.has("t1")).toBe(false);
    expect(summaries.size).toBe(0);
  });

  test("no requests gives an empty map", () => {
    expect(summarizeTables([]).size).toBe(0);
  });

  test("two requests of one kind are counted under that kind", () => {
    const table = summarizeTables([req("a", "call", "new", "t1", 100), req("b", "call", "accepted", "t1", 200)]).get("t1")!;
    expect(table.kinds.call?.count).toBe(2);
    expect(table.kinds.call?.newCount).toBe(1);
    expect(table.active).toBe(2);
    expect(table.newCount).toBe(1);
  });

  test("oldestAt and oldestId of a kind are those of the oldest request, whatever the input order", () => {
    const table = summarizeTables([
      req("mid", "call", "new", "t1", 200),
      req("old", "call", "new", "t1", 100),
      req("young", "call", "new", "t1", 300),
    ]).get("t1")!;
    expect(table.kinds.call?.oldestAt).toBe(100);
    expect(table.kinds.call?.oldestId).toBe("old");
    expect(table.kinds.call?.count).toBe(3);
    expect(table.kinds.call?.newCount).toBe(3);
  });

  test("equal times are ordered by id", () => {
    const table = summarizeTables([req("b", "call", "new", "t1", 100), req("a", "call", "new", "t1", 100)]).get("t1")!;
    expect(table.kinds.call?.oldestId).toBe("a");
  });

  test("a done request does not become the oldest of its kind", () => {
    const table = summarizeTables([req("done", "call", "done", "t1", 50), req("live", "call", "new", "t1", 100)]).get("t1")!;
    expect(table.kinds.call?.oldestId).toBe("live");
    expect(table.kinds.call?.oldestAt).toBe(100);
  });

  test("the table's oldestAt is the oldest active request of any kind", () => {
    const table = summarizeTables([
      req("b", "bill", "new", "t1", 500),
      req("c", "call", "new", "t1", 300),
      req("o", "order", "accepted", "t1", 400),
    ]).get("t1")!;
    expect(table.oldestAt).toBe(300);
  });

  test("newCount counts the requests still new, per kind and per table", () => {
    const table = summarizeTables([
      req("c1", "call", "new", "t1", 100),
      req("c2", "call", "new", "t1", 150),
      req("c3", "call", "accepted", "t1", 160),
      req("b1", "bill", "accepted", "t1", 200),
    ]).get("t1")!;
    expect(table.kinds.call?.newCount).toBe(2);
    expect(table.kinds.bill?.newCount).toBe(0);
    expect(table.newCount).toBe(2);
    expect(table.active).toBe(4);
  });

  test("oldestIsNew is true when the oldest of a kind is new", () => {
    const table = summarizeTables([req("a", "call", "new", "t1", 100), req("b", "call", "accepted", "t1", 200)]).get("t1")!;
    expect(table.kinds.call?.oldestIsNew).toBe(true);
  });

  test("oldestIsNew is false when the oldest of a kind is accepted, even if a newer one is new", () => {
    const table = summarizeTables([
      req("a", "call", "accepted", "t1", 100, { by: { name: "Ana", isMe: false } }),
      req("b", "call", "new", "t1", 200),
    ]).get("t1")!;
    expect(table.kinds.call?.oldestId).toBe("a");
    expect(table.kinds.call?.oldestIsNew).toBe(false);
    expect(table.kinds.call?.newCount).toBe(1);
  });

  describe("takers", () => {
    test("lists each accepted taker once, in the order of their requests", () => {
      const table = summarizeTables([
        req("a", "call", "accepted", "t1", 100, { by: { name: "Ana", isMe: false } }),
        req("b", "order", "accepted", "t1", 200, { by: { name: "Marko", isMe: true } }),
        req("c", "bill", "accepted", "t1", 300, { by: { name: "Ana", isMe: false } }),
      ]).get("t1")!;
      expect(table.takers).toEqual([
        { name: "Ana", isMe: false },
        { name: "Marko", isMe: true },
      ]);
    });

    test("the order follows the request time, not the input order", () => {
      const table = summarizeTables([
        req("late", "bill", "accepted", "t1", 300, { by: { name: "Ana", isMe: false } }),
        req("early", "call", "accepted", "t1", 100, { by: { name: "Marko", isMe: true } }),
      ]).get("t1")!;
      expect(table.takers.map((taker) => taker.name)).toEqual(["Marko", "Ana"]);
    });

    test("me is listed once, with isMe", () => {
      const table = summarizeTables([
        req("a", "call", "accepted", "t1", 100, { by: { name: "Marko", isMe: true } }),
        req("b", "bill", "accepted", "t1", 200, { by: { name: "Marko", isMe: true } }),
      ]).get("t1")!;
      expect(table.takers).toEqual([{ name: "Marko", isMe: true }]);
    });

    test("a new request has no taker, even if acceptedBy is filled in", () => {
      const table = summarizeTables([req("a", "call", "new", "t1", 100, { by: { name: "Ana", isMe: false } })]).get("t1")!;
      expect(table.takers).toEqual([]);
    });

    test("an accepted request without a taker adds nobody", () => {
      const table = summarizeTables([req("a", "call", "accepted", "t1", 100, { by: null })]).get("t1")!;
      expect(table.takers).toEqual([]);
      expect(table.active).toBe(1);
    });

    test("a taker with an empty name is not listed", () => {
      const table = summarizeTables([req("a", "call", "accepted", "t1", 100, { by: { name: "", isMe: false } })]).get("t1")!;
      expect(table.takers).toEqual([]);
    });

    test("a taker of a done request is not listed", () => {
      const table = summarizeTables([
        req("a", "call", "done", "t1", 100, { by: { name: "Ana", isMe: false } }),
        req("b", "bill", "new", "t1", 200),
      ]).get("t1")!;
      expect(table.takers).toEqual([]);
    });
  });
});

describe("tableSummaryOf", () => {
  test("returns the summary of a known position", () => {
    const summaries = summarizeTables([req("a", "call", "new", "t1", 100)]);
    expect(tableSummaryOf(summaries, "t1")).toBe(summaries.get("t1"));
  });

  test("returns a neutral summary for an unknown position", () => {
    const summary = tableSummaryOf(new Map(), "nowhere");
    expect(summary.positionId).toBe("nowhere");
    expect(summary.active).toBe(0);
    expect(summary.kinds).toEqual({});
    expect(summary.newCount).toBe(0);
    expect(summary.oldestAt).toBeNull();
    expect(summary.takers).toEqual([]);
    expect(isNeutral(summary)).toBe(true);
  });
});

describe("neutralSummary and isNeutral", () => {
  test("a neutral summary has nothing active", () => {
    expect(neutralSummary("t1")).toEqual({ positionId: "t1", kinds: {}, active: 0, newCount: 0, oldestAt: null, takers: [] });
    expect(isNeutral(neutralSummary("t1"))).toBe(true);
  });

  test("a summary with an active request is not neutral", () => {
    const table = summarizeTables([req("a", "call", "accepted", "t1", 100)]).get("t1")!;
    expect(isNeutral(table)).toBe(false);
  });
});

describe("activeKinds", () => {
  test("follows the TABLE_KINDS order, whatever order the requests came in", () => {
    const table = summarizeTables([
      req("b", "bill", "new", "t1", 100),
      req("o", "order", "new", "t1", 200),
      req("c", "call", "new", "t1", 300),
    ]).get("t1")!;
    expect(activeKinds(table)).toEqual(["call", "order", "bill"]);
  });

  test("a neutral table has no kinds", () => {
    expect(activeKinds(neutralSummary("t1"))).toEqual([]);
  });

  test("a reservation comes last", () => {
    const withReservation: TableSummary = {
      ...neutralSummary("t1"),
      kinds: {
        reservation: { count: 1, newCount: 1, oldestId: "r", oldestAt: 1, oldestIsNew: true },
        bill: { count: 1, newCount: 1, oldestId: "b", oldestAt: 2, oldestIsNew: true },
        call: { count: 1, newCount: 1, oldestId: "c", oldestAt: 3, oldestIsNew: true },
      },
      active: 3,
    };
    expect(activeKinds(withReservation)).toEqual(["call", "bill", "reservation"]);
  });
});

describe("visibleInZone", () => {
  test("a null filter shows everything", () => {
    expect(visibleInZone("z1", null)).toBe(true);
    expect(visibleInZone("z2", null)).toBe(true);
    expect(visibleInZone(null, null)).toBe(true);
  });

  test("a position without a zone (Bez zone) is always visible", () => {
    expect(visibleInZone(null, "z1")).toBe(true);
  });

  test("the position of the filtered zone is visible", () => {
    expect(visibleInZone("z1", "z1")).toBe(true);
  });

  test("a position of another zone is hidden", () => {
    expect(visibleInZone("z2", "z1")).toBe(false);
  });
});

describe("requestZone", () => {
  test("prefers the current zone of the position", () => {
    const zones = new Map<string, string | null>([["t1", "z2"]]);
    expect(requestZone({ positionId: "t1", zoneId: "z1" }, zones)).toBe("z2");
  });

  test("prefers the map even when the table was moved to Bez zone (null)", () => {
    const zones = new Map<string, string | null>([["t1", null]]);
    expect(requestZone({ positionId: "t1", zoneId: "z1" }, zones)).toBeNull();
  });

  test("falls back to the zone recorded on the request when the position is unknown", () => {
    const zones = new Map<string, string | null>([["t2", "z2"]]);
    expect(requestZone({ positionId: "t1", zoneId: "z1" }, zones)).toBe("z1");
    expect(requestZone({ positionId: "t1", zoneId: null }, zones)).toBeNull();
  });
});

describe("effectiveZoneFilter", () => {
  test("a null filter stays every zone", () => {
    expect(effectiveZoneFilter(null, ["z1", "z2"])).toBeNull();
  });

  test("a known zone is kept", () => {
    expect(effectiveZoneFilter("z2", ["z1", "z2"])).toBe("z2");
  });

  test("an unknown zone id means every zone", () => {
    expect(effectiveZoneFilter("gone", ["z1", "z2"])).toBeNull();
    expect(effectiveZoneFilter("z1", [])).toBeNull();
  });
});

describe("tableMatches", () => {
  test("an empty query matches everything", () => {
    expect(tableMatches("Sto 12", "Terasa", "")).toBe(true);
    expect(tableMatches("Sto 12", null, "   ")).toBe(true);
  });

  test("a bare number matches the table's number", () => {
    expect(tableMatches("Sto 12", null, "12")).toBe(true);
    expect(tableMatches("Sto 1", null, "1")).toBe(true);
  });

  test("a bare number does not match a longer or shorter number", () => {
    expect(tableMatches("Sto 120", null, "12")).toBe(false);
    expect(tableMatches("Sto 1", null, "12")).toBe(false);
    expect(tableMatches("Sto 12", null, "1")).toBe(false);
    expect(tableMatches("Sto 12", null, "2")).toBe(false);
  });

  test("a bare number matches the label only, not a number in the zone name", () => {
    expect(tableMatches("Sto 3", "Sala 12", "12")).toBe(false);
  });

  test("case is ignored", () => {
    expect(tableMatches("Sto 3", "Terasa", "terasa")).toBe(true);
    expect(tableMatches("Sto 3", "Terasa", "TERASA")).toBe(true);
    expect(tableMatches("STO 3", null, "sto")).toBe(true);
  });

  test("Serbian diacritics are ignored in both directions", () => {
    expect(tableMatches("Sto 4", "Šank", "sank")).toBe(true);
    expect(tableMatches("Sto 4", "Šank", "Šank")).toBe(true);
    expect(tableMatches("Sto 4", "Sank", "šank")).toBe(true);
    expect(tableMatches("Ćoše", null, "cose")).toBe(true);
    expect(tableMatches("Ćoše", null, "ćoše")).toBe(true);
  });

  test("matches the start of a zone name word", () => {
    expect(tableMatches("Sto 3", "Terasa", "ter")).toBe(true);
    expect(tableMatches("Sto 3", "Bašta uz reku", "reku")).toBe(true);
  });

  test("matches the start of a label word", () => {
    expect(tableMatches("Šank 2", null, "san")).toBe(true);
    expect(tableMatches("Sto 3", null, "st")).toBe(true);
  });

  test("a typed part must start a word, not sit in the middle of one", () => {
    expect(tableMatches("Sto 3", "Terasa", "asa")).toBe(false);
    expect(tableMatches("Sto 3", "Terasa", "erasa")).toBe(false);
  });

  test("with several words, every typed word must start a word of the label or the zone", () => {
    expect(tableMatches("Sto 3", "Terasa", "sto ter")).toBe(true);
    expect(tableMatches("Sto 3", "Terasa", "ter sto")).toBe(true);
    expect(tableMatches("Sto 3", "Terasa", "sto 3")).toBe(true);
  });

  test("a multi-word query is a prefix match per word: 'sto 1' matches Sto 1, Sto 12 and Sto 120", () => {
    // Only a BARE number is exact; a number beside other words only has to start a word.
    expect(tableMatches("Sto 1", null, "sto 1")).toBe(true);
    expect(tableMatches("Sto 12", null, "sto 1")).toBe(true);
    expect(tableMatches("Sto 120", null, "sto 1")).toBe(true);
    expect(tableMatches("Sto 2", null, "sto 1")).toBe(false);
  });

  test("a word that matches nowhere fails the whole query", () => {
    expect(tableMatches("Sto 3", "Terasa", "sto bar")).toBe(false);
    expect(tableMatches("Sto 3", "Terasa", "xyz")).toBe(false);
    expect(tableMatches("Sto 3", null, "ter")).toBe(false);
  });

  test("a table without a zone matches on its label only", () => {
    expect(tableMatches("Sto 3", null, "sto")).toBe(true);
    expect(tableMatches("Sto 3", null, "terasa")).toBe(false);
  });

  test("extra spaces and punctuation in the query are ignored", () => {
    expect(tableMatches("Sto 3", "Terasa", "  sto   ter  ")).toBe(true);
    expect(tableMatches("Sto 12", null, " 12 ")).toBe(true);
  });
});
