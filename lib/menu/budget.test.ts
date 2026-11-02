// ScanMe Menu V1 (K05) — the budget of one publication: UTF-8 length, the
// ceilings of a version and the headroom kept free in a transaction. Fictional
// data only.

import { describe, expect, test } from "vitest";
import {
  MENU_RETAINED_VERSIONS,
  MENU_TX_RESERVE,
  MENU_VERSION_MAX_BYTES,
  MENU_VERSION_MAX_PARTS,
  MENU_VERSION_PART_MAX_BYTES,
  checkVersionBudget,
  hasWriteHeadroom,
  utf8ByteLength,
} from "./budget";

const encoder = new TextEncoder();
const encodedLength = (value: string) => encoder.encode(value).length;

/** `count` parts of `bytes` each. */
const parts = (count: number, bytes: number) => Array.from({ length: count }, () => ({ bytes }));

describe("constants", () => {
  test("the newest 20 published versions are retained", () => {
    expect(MENU_RETAINED_VERSIONS).toBe(20);
  });

  test("a version part stays below the 1 MiB document limit and a version below 16 MiB", () => {
    expect(MENU_VERSION_PART_MAX_BYTES).toBe(512 * 1024);
    expect(MENU_VERSION_MAX_BYTES).toBe(8 * 1024 * 1024);
    expect(MENU_VERSION_PART_MAX_BYTES).toBeLessThan(1024 * 1024);
    expect(MENU_VERSION_MAX_BYTES).toBeLessThan(16 * 1024 * 1024);
    expect(MENU_VERSION_MAX_PARTS).toBe(1000);
  });

  test("the transaction reserve is 200 documents and 512 KiB", () => {
    expect(MENU_TX_RESERVE).toEqual({ documentsWritten: 200, bytesWritten: 512 * 1024 });
  });
});

describe("utf8ByteLength", () => {
  const samples: [string, string][] = [
    ["empty", ""],
    ["ASCII", "Grilled chicken, 450 RSD"],
    ["Serbian Latin", "Čačak, šećer, đak, žaba, ĆEVAPI sa kajmakom"],
    ["Serbian Cyrillic", "Ћевапи са луком и кајмаком, џем, љуто, њушка"],
    ["emoji", "Pizza 🍕 and beer 🍺 😀"],
    ["mixed scripts", "Kafa ☕ — Ђурђевдан 🎉 čaj"],
    ["a lone high surrogate", "\ud83d"],
    ["a lone high surrogate before ASCII", "\ud83dA"],
    ["a lone high surrogate before a BMP letter", "\ud83dč"],
    ["a lone low surrogate", "\ude00"],
    ["a reversed surrogate pair", "\ude00\ud83d"],
    ["a high surrogate at the end after a valid pair", "😀\ud83d"],
    ["a high surrogate followed by a high surrogate and a low one", "\ud83d😀"],
  ];

  for (const [label, value] of samples) {
    test(`equals the TextEncoder length for ${label}`, () => {
      expect(utf8ByteLength(value)).toBe(encodedLength(value));
    });
  }

  test("code point width boundaries: 1, 2, 3 and 4 bytes", () => {
    const boundaries: [string, number][] = [
      ["\u0000", 1],
      ["\u007f", 1],
      ["\u0080", 2],
      ["߿", 2],
      ["ࠀ", 3],
      ["퟿", 3],
      ["", 3],
      ["￿", 3],
      ["\u{10000}", 4],
      ["\u{10ffff}", 4],
    ];
    for (const [value, bytes] of boundaries) {
      expect(utf8ByteLength(value), JSON.stringify(value)).toBe(bytes);
      expect(encodedLength(value), JSON.stringify(value)).toBe(bytes);
    }
  });

  test("equals the TextEncoder length for a long string of every width", () => {
    const unit = "a č ✓ 🍕 Ђ ";
    const value = unit.repeat(5000);
    expect(utf8ByteLength(value)).toBe(encodedLength(value));
  });

  test("equals the TextEncoder length for the JSON of a Serbian menu line", () => {
    const json = JSON.stringify({ name: "Ćevapi u lepinji", description: "Sa lukom, kajmakom i ajvarom", priceRsd: 520 });
    expect(utf8ByteLength(json)).toBe(encodedLength(json));
  });
});

describe("checkVersionBudget", () => {
  test("no parts fit", () => {
    expect(checkVersionBudget([])).toEqual({ ok: true });
  });

  test("a normal version fits", () => {
    expect(checkVersionBudget([{ bytes: 2_000 }, { bytes: 40_000 }, { bytes: 300_000 }])).toEqual({ ok: true });
  });

  test("exactly the maximum number of parts fits, one more does not", () => {
    expect(checkVersionBudget(parts(MENU_VERSION_MAX_PARTS, 100))).toEqual({ ok: true });
    expect(checkVersionBudget(parts(MENU_VERSION_MAX_PARTS + 1, 100))).toEqual({ ok: false, reason: "parts" });
  });

  test("a part exactly at the part maximum fits, one byte more is part_too_large", () => {
    expect(checkVersionBudget([{ bytes: MENU_VERSION_PART_MAX_BYTES }])).toEqual({ ok: true });
    expect(checkVersionBudget([{ bytes: MENU_VERSION_PART_MAX_BYTES + 1 }])).toEqual({
      ok: false,
      reason: "part_too_large",
    });
  });

  test("one oversized part among small ones is part_too_large wherever it is", () => {
    const small = parts(5, 1_000);
    expect(checkVersionBudget([...small, { bytes: MENU_VERSION_PART_MAX_BYTES + 1 }])).toEqual({
      ok: false,
      reason: "part_too_large",
    });
    expect(checkVersionBudget([{ bytes: MENU_VERSION_PART_MAX_BYTES + 1 }, ...small])).toEqual({
      ok: false,
      reason: "part_too_large",
    });
  });

  test("a total exactly at the version maximum fits, one byte more is bytes", () => {
    const full = MENU_VERSION_MAX_BYTES / MENU_VERSION_PART_MAX_BYTES;
    expect(checkVersionBudget(parts(full, MENU_VERSION_PART_MAX_BYTES))).toEqual({ ok: true });
    expect(checkVersionBudget([...parts(full, MENU_VERSION_PART_MAX_BYTES), { bytes: 1 }])).toEqual({
      ok: false,
      reason: "bytes",
    });
  });

  test("many parts of legal size whose total is over the maximum are bytes", () => {
    expect(checkVersionBudget(parts(17, MENU_VERSION_PART_MAX_BYTES))).toEqual({ ok: false, reason: "bytes" });
  });

  test("too many parts is reported before an oversized part", () => {
    const tooMany = [...parts(MENU_VERSION_MAX_PARTS, 100), { bytes: MENU_VERSION_PART_MAX_BYTES + 1 }];
    expect(checkVersionBudget(tooMany)).toEqual({ ok: false, reason: "parts" });
  });

  test("an oversized part is reported before an oversized total", () => {
    const both = [...parts(20, MENU_VERSION_PART_MAX_BYTES), { bytes: MENU_VERSION_PART_MAX_BYTES + 1 }];
    expect(checkVersionBudget(both)).toEqual({ ok: false, reason: "part_too_large" });
  });
});

describe("hasWriteHeadroom", () => {
  const ample = { documentsWritten: 16_000, bytesWritten: 16 * 1024 * 1024 };

  test("plenty of room", () => {
    expect(hasWriteHeadroom(ample, { documents: 100, bytes: 1_000_000 })).toBe(true);
  });

  test("documents: exactly planned plus the reserve is enough, one fewer is not", () => {
    const planned = { documents: 800, bytes: 1_000 };
    const need = planned.documents + MENU_TX_RESERVE.documentsWritten;
    expect(hasWriteHeadroom({ documentsWritten: need, bytesWritten: ample.bytesWritten }, planned)).toBe(true);
    expect(hasWriteHeadroom({ documentsWritten: need - 1, bytesWritten: ample.bytesWritten }, planned)).toBe(false);
  });

  test("bytes: exactly planned plus the reserve is enough, one fewer is not", () => {
    const planned = { documents: 10, bytes: 2_000_000 };
    const need = planned.bytes + MENU_TX_RESERVE.bytesWritten;
    expect(hasWriteHeadroom({ documentsWritten: ample.documentsWritten, bytesWritten: need }, planned)).toBe(true);
    expect(hasWriteHeadroom({ documentsWritten: ample.documentsWritten, bytesWritten: need - 1 }, planned)).toBe(false);
  });

  test("both budgets must have room", () => {
    const planned = { documents: 500, bytes: 3_000_000 };
    const documentsOnly = { documentsWritten: ample.documentsWritten, bytesWritten: planned.bytes };
    const bytesOnly = { documentsWritten: planned.documents, bytesWritten: ample.bytesWritten };
    expect(hasWriteHeadroom(documentsOnly, planned)).toBe(false);
    expect(hasWriteHeadroom(bytesOnly, planned)).toBe(false);
    expect(hasWriteHeadroom(ample, planned)).toBe(true);
  });

  test("planning nothing still needs the reserve", () => {
    const none = { documents: 0, bytes: 0 };
    const reserve = { documentsWritten: MENU_TX_RESERVE.documentsWritten, bytesWritten: MENU_TX_RESERVE.bytesWritten };
    expect(hasWriteHeadroom(reserve, none)).toBe(true);
    expect(hasWriteHeadroom({ ...reserve, documentsWritten: reserve.documentsWritten - 1 }, none)).toBe(false);
    expect(hasWriteHeadroom({ ...reserve, bytesWritten: reserve.bytesWritten - 1 }, none)).toBe(false);
    expect(hasWriteHeadroom({ documentsWritten: 0, bytesWritten: 0 }, none)).toBe(false);
  });
});
