import { describe, expect, it } from "vitest";
import { GAME_ACTIONS, actedOn, actorKeyOf, lastActionAt, mergeRows, toActivityRow } from "./activity";
import type { ActivityRow } from "./types";

const row = (id: string, action: string, at: number, over: Partial<ActivityRow> = {}): ActivityRow => ({ id, action, actorKind: "admin", occurredAt: at, href: "/h", ...over });

describe("GAME_ACTIONS", () => {
  it("names the four server actions", () => {
    expect(GAME_ACTIONS).toEqual({
      resolved: "admin_v1_problem_resolved",
      reply: "admin_v1_conversation_reply_sent",
      snoozed: "admin_v1_action_snoozed",
      delivery: "admin_order_delivery_completed",
    });
  });
});

describe("actorKeyOf", () => {
  it("prefixes the user id", () => {
    expect(actorKeyOf("TEST-ana")).toBe("user:TEST-ana");
    expect(actorKeyOf("")).toBe("user:");
  });
});

describe("toActivityRow", () => {
  it("keeps only the five fields", () => {
    const server = { id: "r1", action: "a", actorKind: "admin", occurredAt: 5, href: "/x", actorKey: "user:TEST-ana", summary: "secret", _creationTime: 1 };
    const result = toActivityRow(server);
    expect(result).toEqual({ id: "r1", action: "a", actorKind: "admin", occurredAt: 5, href: "/x" });
    expect(Object.keys(result).sort()).toEqual(["action", "actorKind", "href", "id", "occurredAt"]);
  });
});

describe("mergeRows", () => {
  it("is empty for no lists and for empty lists", () => {
    expect(mergeRows()).toEqual([]);
    expect(mergeRows([], [])).toEqual([]);
  });

  it("merges, drops a repeated id (the first wins) and puts the oldest first", () => {
    const a = row("r2", "x", 200);
    const b = row("r1", "x", 100);
    const aAgain = row("r2", "other", 999);
    expect(mergeRows([a], [b, aAgain])).toEqual([b, a]);
  });

  it("orders rows of equal time by id", () => {
    const list = [row("rb", "x", 100), row("ra", "x", 100), row("rc", "x", 50)];
    expect(mergeRows(list).map((r) => r.id)).toEqual(["rc", "ra", "rb"]);
  });

  it("does not change its input", () => {
    const list = [row("r2", "x", 200), row("r1", "x", 100)];
    const copy = JSON.parse(JSON.stringify(list));
    mergeRows(list, list);
    expect(list).toEqual(copy);
  });
});

describe("lastActionAt", () => {
  const rows = [
    row("r1", GAME_ACTIONS.reply, 100),
    row("r2", GAME_ACTIONS.reply, 300),
    row("r3", GAME_ACTIONS.resolved, 200),
    row("r4", GAME_ACTIONS.reply, 900, { actorKind: "system" }),
  ];

  it("is the newest admin row of one of the actions", () => {
    expect(lastActionAt(rows, [GAME_ACTIONS.reply])).toBe(300);
    expect(lastActionAt(rows, [GAME_ACTIONS.reply, GAME_ACTIONS.resolved])).toBe(300);
    expect(lastActionAt(rows, [GAME_ACTIONS.resolved])).toBe(200);
  });

  it("is null when there is no such row (and a row of another actor kind does not count)", () => {
    expect(lastActionAt([], [GAME_ACTIONS.reply])).toBeNull();
    expect(lastActionAt(rows, [GAME_ACTIONS.delivery])).toBeNull();
    expect(lastActionAt(rows, [])).toBeNull();
    expect(lastActionAt([rows[3]], [GAME_ACTIONS.reply])).toBeNull();
  });
});

describe("actedOn", () => {
  // 23:59 on the 13th and 00:01 on the 14th in Belgrade.
  const lateTue = Date.UTC(2026, 9, 13, 21, 59);
  const earlyWed = Date.UTC(2026, 9, 13, 22, 1);

  it("looks at the Belgrade day", () => {
    const rows = [row("r1", GAME_ACTIONS.reply, lateTue)];
    expect(actedOn(rows, [GAME_ACTIONS.reply], "2026-10-13")).toBe(true);
    expect(actedOn(rows, [GAME_ACTIONS.reply], "2026-10-14")).toBe(false);
    expect(actedOn([row("r2", GAME_ACTIONS.reply, earlyWed)], [GAME_ACTIONS.reply], "2026-10-14")).toBe(true);
    expect(actedOn([row("r2", GAME_ACTIONS.reply, earlyWed)], [GAME_ACTIONS.reply], "2026-10-13")).toBe(false);
  });

  it("needs an admin row of one of the actions", () => {
    expect(actedOn([], [GAME_ACTIONS.reply], "2026-10-13")).toBe(false);
    expect(actedOn([row("r1", GAME_ACTIONS.resolved, lateTue)], [GAME_ACTIONS.reply], "2026-10-13")).toBe(false);
    expect(actedOn([row("r1", GAME_ACTIONS.reply, lateTue, { actorKind: "system" })], [GAME_ACTIONS.reply], "2026-10-13")).toBe(false);
  });
});
