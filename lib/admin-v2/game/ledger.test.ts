import { describe, expect, test } from "vitest";
import { DAYS_KEPT, GAME_KEYS, SEEN_KEPT, parseDays, pruneDays, readBadgeDates, readDays, readSeen, writeBadgeDates, writeDays, writeSeen } from "./ledger";
import { shiftDay } from "./time";
import type { DayLedger } from "./types";

const record = { work: true, clear: false, bossMax: 4, bossDown: null };

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("parseDays", () => {
  test("a good ledger is read back", () => {
    const days: DayLedger = { "2026-10-12": record, "2026-10-13": { work: true, clear: true, bossMax: 9, bossDown: 123 } };
    expect(parseDays(JSON.stringify(days))).toEqual(days);
  });
  test("empty, broken and wrong-shaped text is an empty ledger", () => {
    for (const text of [null, undefined, "", "{nope", "[]", "5", "null", '"x"']) expect(parseDays(text)).toEqual({});
  });
  test("a broken day is skipped, the others stay", () => {
    const text = JSON.stringify({
      "2026-10-12": record,
      "2026-10-13": { work: "yes", clear: true, bossMax: 1, bossDown: null },
      "2026-10-14": { work: true, clear: true, bossMax: -1, bossDown: null },
      "2026-10-15": { work: true, clear: true, bossMax: 1, bossDown: "x" },
      "2026-10-16": null,
      "not a day": record,
    });
    expect(parseDays(text)).toEqual({ "2026-10-12": record });
  });
});

describe("pruneDays", () => {
  const today = "2026-10-13";
  test("keeps the last 60 days up to today", () => {
    expect(DAYS_KEPT).toBe(60);
    const first = shiftDay(today, -59);
    const days: DayLedger = { [shiftDay(first, -1)]: record, [first]: record, [today]: record };
    expect(Object.keys(pruneDays(days, today)).sort()).toEqual([first, today].sort());
  });
  test("returns the same object when nothing is dropped", () => {
    const days: DayLedger = { [today]: record };
    expect(pruneDays(days, today)).toBe(days);
    const empty: DayLedger = {};
    expect(pruneDays(empty, today)).toBe(empty);
  });
  test("does not change its input", () => {
    const old = shiftDay(today, -100);
    const days: DayLedger = { [old]: record, [today]: record };
    pruneDays(days, today);
    expect(Object.keys(days)).toHaveLength(2);
  });
});

describe("days in storage", () => {
  test("round trip under the key of the user", () => {
    const storage = memory();
    const days: DayLedger = { "2026-10-13": record };
    expect(writeDays(storage, "user-a", days)).toBe(true);
    expect(storage.data.has(GAME_KEYS.days + "user-a")).toBe(true);
    expect(readDays(storage, "user-a")).toEqual(days);
    expect(readDays(storage, "user-b")).toEqual({});
  });
  test("a broken value reads as empty", () => {
    expect(readDays(memory({ [GAME_KEYS.days + "u"]: "{" }), "u")).toEqual({});
  });
  test("a storage that throws or is missing is never an error", () => {
    expect(readDays(throwing, "u")).toEqual({});
    expect(writeDays(throwing, "u", {})).toBe(false);
    expect(readDays(null, "u")).toEqual({});
    expect(readDays(undefined, "u")).toEqual({});
    expect(writeDays(null, "u", {})).toBe(false);
  });
});

describe("badge dates", () => {
  test("round trip", () => {
    const storage = memory();
    expect(writeBadgeDates(storage, "u", { inbox_nula: 5, kurir: 6 })).toBe(true);
    expect(readBadgeDates(storage, "u")).toEqual({ inbox_nula: 5, kurir: 6 });
  });
  test("only known ids and finite numbers are read", () => {
    const text = JSON.stringify({ inbox_nula: 7, ghost: 1, kurir: "x", stotka: null, legenda: 9 });
    expect(readBadgeDates(memory({ [GAME_KEYS.badges + "u"]: text }), "u")).toEqual({ inbox_nula: 7, legenda: 9 });
  });
  test("broken or unavailable storage is empty", () => {
    expect(readBadgeDates(memory({ [GAME_KEYS.badges + "u"]: "[1]" }), "u")).toEqual({});
    expect(readBadgeDates(memory({ [GAME_KEYS.badges + "u"]: "{" }), "u")).toEqual({});
    expect(readBadgeDates(throwing, "u")).toEqual({});
    expect(readBadgeDates(null, "u")).toEqual({});
    expect(writeBadgeDates(throwing, "u", {})).toBe(false);
    expect(writeBadgeDates(null, "u", {})).toBe(false);
  });
});

describe("seen keys", () => {
  test("round trip", () => {
    const storage = memory();
    expect(writeSeen(storage, "u", ["level:2", "boss:2026-10-13"])).toBe(true);
    expect(readSeen(storage, "u")).toEqual(["level:2", "boss:2026-10-13"]);
  });
  test("keeps the last 200", () => {
    expect(SEEN_KEPT).toBe(200);
    const storage = memory();
    const keys = Array.from({ length: 250 }, (_, index) => `level:${index}`);
    writeSeen(storage, "u", keys);
    const back = readSeen(storage, "u");
    expect(back).toHaveLength(200);
    expect(back[0]).toBe("level:50");
    expect(back[199]).toBe("level:249");
    expect(keys).toHaveLength(250);
  });
  test("only strings are read; broken storage is empty", () => {
    expect(readSeen(memory({ [GAME_KEYS.seen + "u"]: JSON.stringify(["a", 1, null, "b"]) }), "u")).toEqual(["a", "b"]);
    expect(readSeen(memory({ [GAME_KEYS.seen + "u"]: '{"a":1}' }), "u")).toEqual([]);
    expect(readSeen(memory({ [GAME_KEYS.seen + "u"]: "{" }), "u")).toEqual([]);
    expect(readSeen(throwing, "u")).toEqual([]);
    expect(readSeen(null, "u")).toEqual([]);
    expect(writeSeen(throwing, "u", ["a"])).toBe(false);
    expect(writeSeen(null, "u", ["a"])).toBe(false);
  });
});
