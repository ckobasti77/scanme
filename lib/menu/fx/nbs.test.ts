// ScanMe Menu V1 (K14) — reads the NBS middle EUR rate out of fixture JSON.
// Never the network: a broken source must give null, never a wrong price.

import { describe, expect, test } from "vitest";
import { parseNbsMiddleRate } from "./nbs";

const red = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: "EUR",
  date: "2026-10-16",
  date_from: "2026-10-16",
  number: 200,
  parity: 1,
  cbrate: 117.1655,
  exchange_buy: 116.814,
  exchange_middle: 117.1655,
  exchange_sell: 117.517,
  created_at: "2026-10-16 08:00:04",
  ...over,
});

describe("parseNbsMiddleRate", () => {
  test("reads the middle rate and the date", () => {
    expect(parseNbsMiddleRate(red())).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
  });

  test("uses exchange_middle, not buy, sell or cbrate", () => {
    expect(parseNbsMiddleRate(red({ exchange_middle: 117.2, cbrate: 110, exchange_buy: 100, exchange_sell: 130 }))).toEqual({
      rate: 117.2,
      effectiveDate: "2026-10-16",
    });
  });

  test("parity divides the rate", () => {
    expect(parseNbsMiddleRate(red({ parity: 100, exchange_middle: 11720 }))).toEqual({ rate: 117.2, effectiveDate: "2026-10-16" });
  });

  test("a missing parity means 1", () => {
    const bezParitete: Record<string, unknown> = { ...red() };
    delete bezParitete.parity;
    expect(parseNbsMiddleRate(bezParitete)).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
  });

  test("an invalid parity is refused", () => {
    expect(parseNbsMiddleRate(red({ parity: 0 }))).toBeNull();
    expect(parseNbsMiddleRate(red({ parity: -1 }))).toBeNull();
    expect(parseNbsMiddleRate(red({ parity: "abc" }))).toBeNull();
    expect(parseNbsMiddleRate(red({ parity: null }))).toBeNull();
  });

  test("numbers as strings are accepted, with a comma or a dot", () => {
    expect(parseNbsMiddleRate(red({ exchange_middle: "117,1655" }))).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
    expect(parseNbsMiddleRate(red({ exchange_middle: " 117.1655 " }))).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
    expect(parseNbsMiddleRate(red({ exchange_middle: "117,1655", parity: "1" }))).toEqual({
      rate: 117.1655,
      effectiveDate: "2026-10-16",
    });
  });

  test("the rate is rounded to four decimals", () => {
    expect(parseNbsMiddleRate(red({ exchange_middle: 117.123456789 }))?.rate).toBe(117.1235);
  });

  test("a code in lower case or with spaces is still EUR", () => {
    expect(parseNbsMiddleRate(red({ code: " eur " }))?.rate).toBe(117.1655);
  });

  test("another currency is refused", () => {
    expect(parseNbsMiddleRate(red({ code: "USD", exchange_middle: 100.5 }))).toBeNull();
    expect(parseNbsMiddleRate(red({ code: "CHF", exchange_middle: 120 }))).toBeNull();
  });

  test("a date with a time keeps the date part", () => {
    expect(parseNbsMiddleRate(red({ date: "2026-10-16T08:00:00" }))).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
    expect(parseNbsMiddleRate(red({ date: " 2026-10-16 08:00:04 " }))).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
  });

  test("a missing or invalid date is refused", () => {
    const bezDatuma: Record<string, unknown> = { ...red() };
    delete bezDatuma.date;
    expect(parseNbsMiddleRate(bezDatuma)).toBeNull();
    for (const date of ["", "16.10.2026", "2026-10-1", "2026-13-01", "danas", "2026/10/16", 20261016, null]) {
      expect(parseNbsMiddleRate(red({ date }))).toBeNull();
    }
  });

  // SOURCE BUG (lib/menu/fx/nbs.ts:29): Date.parse is lenient in V8 and accepts a
  // day that does not exist in the month, so "2026-02-31" passes as a real date.
  // The header of nbs.ts says an impossible date is refused. This test fails until fixed.
  test("BUG: an impossible calendar date (2026-02-31) is refused", () => {
    expect(parseNbsMiddleRate(red({ date: "2026-02-31" }))).toBeNull();
    expect(parseNbsMiddleRate(red({ date: "2026-04-31" }))).toBeNull();
  });

  test("a missing or unreadable exchange_middle is refused", () => {
    const bezSrednjeg: Record<string, unknown> = { ...red() };
    delete bezSrednjeg.exchange_middle;
    expect(parseNbsMiddleRate(bezSrednjeg)).toBeNull();
    for (const exchange_middle of [null, "", "abc", "117,1,6", "-117", Number.NaN, Number.POSITIVE_INFINITY, {}, [117]]) {
      expect(parseNbsMiddleRate(red({ exchange_middle }))).toBeNull();
    }
  });

  test("an implausible rate is refused", () => {
    for (const exchange_middle of [0, 1, 49.9, 500.1, 10000, 117165]) {
      expect(parseNbsMiddleRate(red({ exchange_middle }))).toBeNull();
    }
  });

  test("a row with no code is read as EUR", () => {
    const bezKoda: Record<string, unknown> = { ...red() };
    delete bezKoda.code;
    expect(parseNbsMiddleRate(bezKoda)).toEqual({ rate: 117.1655, effectiveDate: "2026-10-16" });
  });

  test("anything that is not an object is refused", () => {
    for (const ulaz of [null, undefined, [], [red()], "EUR", "", 117.1655, 0, true]) {
      expect(parseNbsMiddleRate(ulaz)).toBeNull();
    }
  });
});
