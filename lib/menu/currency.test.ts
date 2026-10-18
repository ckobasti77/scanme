// ScanMe Menu V1 (K14) — the informative EUR price: freshness of the rate in
// Belgrade calendar days, RSD → EUR rounding half up, and the Serbian format.

import { describe, expect, test } from "vitest";
import {
  MENU_KURS_MAX,
  MENU_KURS_MIN,
  MENU_KURS_SVEZINA_DANA,
  datumKursa,
  eurIzRsd,
  formatEur,
  iznosEur,
  jeIspravanKurs,
  kursJeSvez,
} from "./currency";

const kurs = (effectiveDate: string, rate = 117.2) => ({ rate, effectiveDate });

describe("MENU_KURS_SVEZINA_DANA", () => {
  test("is four days, so Friday's list still serves on Tuesday", () => {
    expect(MENU_KURS_SVEZINA_DANA).toBe(4);
  });
});

describe("jeIspravanKurs", () => {
  test("accepts a plausible rate, boundaries included", () => {
    expect(jeIspravanKurs(117.2)).toBe(true);
    expect(jeIspravanKurs(MENU_KURS_MIN)).toBe(true);
    expect(jeIspravanKurs(MENU_KURS_MAX)).toBe(true);
  });

  test("refuses implausible rates", () => {
    for (const rate of [0, -117, Number.NaN, Number.POSITIVE_INFINITY, 10000, MENU_KURS_MIN - 0.01, MENU_KURS_MAX + 0.01]) {
      expect(jeIspravanKurs(rate)).toBe(false);
    }
  });
});

describe("kursJeSvez", () => {
  // 2026-10-16 is a Friday. Belgrade is on CEST (UTC+2) until 2026-10-25, then CET (UTC+1).
  const PODNE_PETAK = Date.UTC(2026, 9, 16, 10, 0);

  test("the same Belgrade day is fresh", () => {
    expect(kursJeSvez(kurs("2026-10-16"), PODNE_PETAK)).toBe(true);
  });

  test("4 days old is fresh, 5 days old is not", () => {
    expect(kursJeSvez(kurs("2026-10-12"), PODNE_PETAK)).toBe(true);
    expect(kursJeSvez(kurs("2026-10-11"), PODNE_PETAK)).toBe(false);
  });

  test("a Friday rate is still fresh on the following Tuesday, not on Wednesday", () => {
    const utorak = Date.UTC(2026, 9, 20, 10, 0);
    const sreda = Date.UTC(2026, 9, 21, 10, 0);
    expect(kursJeSvez(kurs("2026-10-16"), utorak)).toBe(true);
    expect(kursJeSvez(kurs("2026-10-16"), sreda)).toBe(false);
  });

  test("a date in the future is not fresh", () => {
    expect(kursJeSvez(kurs("2026-10-17"), PODNE_PETAK)).toBe(false);
    expect(kursJeSvez(kurs("2027-01-01"), PODNE_PETAK)).toBe(false);
  });

  test("an impossible date is not fresh", () => {
    expect(kursJeSvez(kurs("2026-02-31"), Date.UTC(2026, 2, 1, 10, 0))).toBe(false);
    expect(kursJeSvez(kurs("2026-13-01"), PODNE_PETAK)).toBe(false);
    expect(kursJeSvez(kurs("2026-00-10"), PODNE_PETAK)).toBe(false);
  });

  test("a malformed date is not fresh", () => {
    for (const datum of ["16.10.2026", "16.10.2026.", "2026-10-1", "2026/10/16", "", "danas", "2026-10-16T08:00:00"]) {
      expect(kursJeSvez(kurs(datum), PODNE_PETAK)).toBe(false);
    }
  });

  test("an implausible rate is not fresh", () => {
    for (const rate of [0, Number.NaN, 10000, -1]) {
      expect(kursJeSvez(kurs("2026-10-16", rate), PODNE_PETAK)).toBe(false);
    }
  });

  test("no rate at all is not fresh", () => {
    expect(kursJeSvez(null, PODNE_PETAK)).toBe(false);
    expect(kursJeSvez(undefined, PODNE_PETAK)).toBe(false);
  });

  test("summer: the Belgrade day changes at 22:00 UTC (23:30 UTC is already the next day)", () => {
    // 2026-10-17 23:30 UTC = 2026-10-18 01:30 in Belgrade (CEST).
    const sad = Date.UTC(2026, 9, 17, 23, 30);
    expect(kursJeSvez(kurs("2026-10-14"), sad)).toBe(true); // 4 days old
    expect(kursJeSvez(kurs("2026-10-13"), sad)).toBe(false); // 5 days old
    expect(kursJeSvez(kurs("2026-10-18"), sad)).toBe(true); // today in Belgrade
    expect(kursJeSvez(kurs("2026-10-19"), sad)).toBe(false); // tomorrow

    // One hour earlier it is still the 17th in Belgrade.
    const ranije = Date.UTC(2026, 9, 17, 21, 30);
    expect(kursJeSvez(kurs("2026-10-13"), ranije)).toBe(true); // 4 days old
    expect(kursJeSvez(kurs("2026-10-12"), ranije)).toBe(false);
    expect(kursJeSvez(kurs("2026-10-18"), ranije)).toBe(false);
  });

  test("winter (after 2026-10-25): the Belgrade day changes at 23:00 UTC", () => {
    // 2026-11-05 22:30 UTC = 23:30 on the 5th in Belgrade (CET); 23:30 UTC = 00:30 on the 6th.
    const pre = Date.UTC(2026, 10, 5, 22, 30);
    const posle = Date.UTC(2026, 10, 5, 23, 30);
    expect(kursJeSvez(kurs("2026-11-01"), pre)).toBe(true); // 4 days
    expect(kursJeSvez(kurs("2026-10-31"), pre)).toBe(false); // 5 days
    expect(kursJeSvez(kurs("2026-11-02"), posle)).toBe(true); // 4 days
    expect(kursJeSvez(kurs("2026-11-01"), posle)).toBe(false); // 5 days
    expect(kursJeSvez(kurs("2026-11-06"), pre)).toBe(false); // not yet the 6th
    expect(kursJeSvez(kurs("2026-11-06"), posle)).toBe(true);
  });
});

describe("eurIzRsd", () => {
  test("rounds half up to the cent", () => {
    expect(eurIzRsd(1, 200)).toBe(0.01); // 0.005
    expect(eurIzRsd(3, 200)).toBe(0.02); // 0.015
    expect(eurIzRsd(7, 40)).toBe(0.18); // 0.175
    expect(eurIzRsd(201, 200)).toBe(1.01); // 1.005
  });

  test("a normal conversion", () => {
    expect(eurIzRsd(1490, 117.2)).toBe(12.71); // 12.7133...
    expect(eurIzRsd(1000, 100)).toBe(10);
    expect(eurIzRsd(0, 117.2)).toBe(0);
  });

  test("rounds down below the half", () => {
    expect(eurIzRsd(1, 300)).toBe(0); // 0.00333
    expect(eurIzRsd(2, 300)).toBe(0.01); // 0.00666
  });

  test("agrees with exact half-up arithmetic for many rates and prices (float noise removed)", () => {
    // Exact reference on integers: rate has at most 4 decimals.
    const mismatches: string[] = [];
    for (const rate of [117.2, 117.1655, 100, 117, 117.5, 116.8, 120.25, 99.995]) {
      const r = Math.round(rate * 10000);
      for (let rsd = 0; rsd <= 6000; rsd += 1) {
        const centi = Math.floor((rsd * 100 * 10000 * 2 + r) / (2 * r));
        const ocekivano = centi / 100;
        if (eurIzRsd(rsd, rate) !== ocekivano) mismatches.push(`${rsd}/${rate}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("iznosEur", () => {
  test("a thousands dot, a decimal comma, always two decimals", () => {
    expect(iznosEur(1234.5)).toBe("1.234,50");
    expect(iznosEur(0)).toBe("0,00");
    expect(iznosEur(1234567.891)).toBe("1.234.567,89");
    expect(iznosEur(5)).toBe("5,00");
    expect(iznosEur(0.07)).toBe("0,07");
    expect(iznosEur(999.999)).toBe("1.000,00");
    expect(iznosEur(100)).toBe("100,00");
  });

  test("a negative amount keeps its sign", () => {
    expect(iznosEur(-1234.5)).toBe("-1.234,50");
  });
});

describe("formatEur", () => {
  test("is the approximate line under the RSD price", () => {
    expect(formatEur(1490, 117.2)).toBe("~ 12,71 EUR");
    expect(formatEur(0, 117.2)).toBe("~ 0,00 EUR");
    expect(formatEur(1, 200)).toBe("~ 0,01 EUR");
  });

  test("uses the thousands dot for big amounts", () => {
    expect(formatEur(1_500_000, 117.2)).toBe("~ 12.798,63 EUR");
  });
});

describe("datumKursa", () => {
  test("shows the date the Serbian way", () => {
    expect(datumKursa("2026-10-16")).toBe("16. 10. 2026.");
    expect(datumKursa("2026-01-05")).toBe("5. 1. 2026.");
  });

  test("a value that is not a date comes back as it is", () => {
    expect(datumKursa("danas")).toBe("danas");
  });
});
