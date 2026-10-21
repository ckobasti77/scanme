// ScanMe Menu V1 (K29) — periods of the analytics: the last 7 / 30 / 90 days, a
// Premium custom period, the previous period of the same length, the
// comparison, and the retention cut-offs (docs/menu/ANALITIKA-DEFINICIJE.md §2
// and §7; tags [period], [poredjenje], [retencija-24m]).

import { describe, expect, test } from "vitest";
import { MAX_DANA_PERIODA, MENU_ANALYTICS_DAILY_MONTHS, MENU_ANALYTICS_RAW_DAYS } from "./definicije";
import {
  brojDana,
  daniPerioda,
  granicaSirovih,
  jeDan,
  najstarijiDanAgregata,
  poredi,
  poslednjihDana,
  prethodniPeriod,
  proveriPeriod,
} from "./period";

const DAN_MS = 24 * 60 * 60 * 1000;

describe("jeDan", () => {
  test.each(["2026-10-21", "2026-02-28", "2028-02-29", "2000-02-29", "2026-12-31", "2026-01-01"])(
    "[period] %s is a real calendar day",
    (value) => {
      expect(jeDan(value)).toBe(true);
    },
  );

  test.each(["2026-02-29", "2100-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-04-00", "2026-06-31"])(
    "[period] %s is not a real calendar day",
    (value) => {
      expect(jeDan(value)).toBe(false);
    },
  );

  test.each(["", " ", "2026-4-1", "2026-04-1", "26-04-01", "2026/04/01", "2026-04-01T00:00", " 2026-04-01", "2026-04-01 ", "abcd-ef-gh", "20260401", "2026-04-011"])(
    "[period] %j has the wrong format",
    (value) => {
      expect(jeDan(value)).toBe(false);
    },
  );
});

describe("brojDana", () => {
  test("[period] one day is 1 (both ends included)", () => {
    expect(brojDana({ od: "2026-10-21", do: "2026-10-21" })).toBe(1);
  });

  test("[period] counts both ends, across months and years", () => {
    expect(brojDana({ od: "2026-10-01", do: "2026-10-07" })).toBe(7);
    expect(brojDana({ od: "2026-12-30", do: "2027-01-02" })).toBe(4);
    expect(brojDana({ od: "2026-10-24", do: "2026-10-26" })).toBe(3);
  });

  test("[period] leap years: 29 February is a day, the whole year is 365 or 366 days", () => {
    expect(brojDana({ od: "2028-02-28", do: "2028-03-01" })).toBe(3);
    expect(brojDana({ od: "2026-02-28", do: "2026-03-01" })).toBe(2);
    expect(brojDana({ od: "2026-01-01", do: "2026-12-31" })).toBe(365);
    expect(brojDana({ od: "2028-01-01", do: "2028-12-31" })).toBe(366);
  });

  test("[period] a reversed period is 0 or less", () => {
    expect(brojDana({ od: "2026-10-02", do: "2026-10-01" })).toBe(0);
    expect(brojDana({ od: "2026-10-07", do: "2026-10-01" })).toBeLessThanOrEqual(0);
  });

  test("[period] the clock change does not shorten or lengthen a period (calendar arithmetic)", () => {
    expect(brojDana({ od: "2026-10-25", do: "2026-10-25" })).toBe(1);
    expect(brojDana({ od: "2026-03-29", do: "2026-03-30" })).toBe(2);
  });
});

describe("daniPerioda", () => {
  test("[period] lists every day inclusive, oldest first", () => {
    expect(daniPerioda({ od: "2026-10-29", do: "2026-11-02" })).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  test("[period] crosses a year", () => {
    expect(daniPerioda({ od: "2026-12-30", do: "2027-01-02" })).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  test("[period] includes 29 February of a leap year and skips it otherwise", () => {
    expect(daniPerioda({ od: "2028-02-28", do: "2028-03-01" })).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(daniPerioda({ od: "2026-02-28", do: "2026-03-01" })).toEqual(["2026-02-28", "2026-03-01"]);
  });

  test("[period] one day is a list of one; a reversed period is an empty list", () => {
    expect(daniPerioda({ od: "2026-10-21", do: "2026-10-21" })).toEqual(["2026-10-21"]);
    expect(daniPerioda({ od: "2026-10-21", do: "2026-10-20" })).toEqual([]);
    expect(daniPerioda({ od: "2026-10-21", do: "2026-10-01" })).toEqual([]);
  });

  test("[period] the length matches brojDana for the longest period", () => {
    const period = { od: "2025-10-21", do: "2026-10-21" };
    const dani = daniPerioda(period);
    expect(dani).toHaveLength(brojDana(period));
    expect(dani[0]).toBe("2025-10-21");
    expect(dani.at(-1)).toBe("2026-10-21");
    expect(new Set(dani).size).toBe(dani.length);
  });
});

describe("poslednjihDana", () => {
  test("[period] 7 days up to and including today", () => {
    const period = poslednjihDana("2026-10-21", 7);
    expect(period).toEqual({ od: "2026-10-15", do: "2026-10-21" });
    expect(brojDana(period)).toBe(7);
  });

  test("[period] 30 days up to and including today", () => {
    const period = poslednjihDana("2026-10-21", 30);
    expect(period).toEqual({ od: "2026-09-22", do: "2026-10-21" });
    expect(brojDana(period)).toBe(30);
  });

  test("[period] 90 days, and 1 day is today only", () => {
    expect(brojDana(poslednjihDana("2026-10-21", 90))).toBe(90);
    expect(poslednjihDana("2026-10-21", 1)).toEqual({ od: "2026-10-21", do: "2026-10-21" });
  });

  test("[period] reaches back across a year change", () => {
    expect(poslednjihDana("2027-01-03", 7)).toEqual({ od: "2026-12-28", do: "2027-01-03" });
  });
});

describe("prethodniPeriod", () => {
  test("[poredjenje] the previous period has the same length and ends the day before", () => {
    const sada = { od: "2026-10-15", do: "2026-10-21" };
    const pre = prethodniPeriod(sada);
    expect(pre).toEqual({ od: "2026-10-08", do: "2026-10-14" });
    expect(brojDana(pre)).toBe(brojDana(sada));
  });

  test("[poredjenje] the two periods touch without a gap or an overlap", () => {
    for (const sada of [
      poslednjihDana("2026-10-21", 7),
      poslednjihDana("2026-10-21", 30),
      poslednjihDana("2027-01-03", 90),
      { od: "2026-03-01", do: "2026-03-31" },
      { od: "2028-02-29", do: "2028-03-02" },
    ]) {
      const pre = prethodniPeriod(sada);
      expect(brojDana(pre)).toBe(brojDana(sada));
      expect(daniPerioda(pre).at(-1)! < sada.od).toBe(true);
      const sutra = daniPerioda({ od: pre.do, do: sada.od });
      expect(sutra).toEqual([pre.do, sada.od]);
    }
  });

  test("[poredjenje] one day compares with the day before; a month with the 31 days before it", () => {
    expect(prethodniPeriod({ od: "2026-10-21", do: "2026-10-21" })).toEqual({ od: "2026-10-20", do: "2026-10-20" });
    expect(prethodniPeriod({ od: "2026-03-01", do: "2026-03-31" })).toEqual({ od: "2026-01-29", do: "2026-02-28" });
  });
});

describe("najstarijiDanAgregata", () => {
  test("[retencija-24m] the same date 24 months back", () => {
    expect(najstarijiDanAgregata("2026-10-21")).toBe("2024-10-21");
    expect(najstarijiDanAgregata("2026-03-05")).toBe("2024-03-05");
    expect(najstarijiDanAgregata("2026-12-31")).toBe("2024-12-31");
  });

  test("[retencija-24m] 29 February falls back to 28 February when the target year is not a leap year", () => {
    expect(najstarijiDanAgregata("2028-02-29")).toBe("2026-02-28");
    expect(najstarijiDanAgregata("2032-02-29")).toBe("2030-02-28");
  });

  test("[retencija-24m] 28 February stays 28 February (even when the target year has a 29th)", () => {
    expect(najstarijiDanAgregata("2026-02-28")).toBe("2024-02-28");
    expect(najstarijiDanAgregata("2024-02-29")).toBe("2022-02-28");
  });

  test("[retencija-24m] the start of a year and January work without wrapping to the wrong year", () => {
    expect(najstarijiDanAgregata("2026-01-15")).toBe("2024-01-15");
    expect(najstarijiDanAgregata("2027-01-01")).toBe("2025-01-01");
    expect(najstarijiDanAgregata("2026-01-31")).toBe("2024-01-31");
  });

  test("[retencija-24m] the constant is 24 months", () => {
    expect(MENU_ANALYTICS_DAILY_MONTHS).toBe(24);
  });
});

describe("granicaSirovih", () => {
  test("[retencija-24m] raw events are kept exactly 90 * 24 hours", () => {
    const sada = Date.UTC(2026, 9, 21, 12, 0, 0);
    expect(MENU_ANALYTICS_RAW_DAYS).toBe(90);
    expect(sada - granicaSirovih(sada)).toBe(90 * DAN_MS);
    expect(granicaSirovih(sada)).toBe(Date.UTC(2026, 6, 23, 12, 0, 0));
  });

  test("[retencija-24m] a plain elapsed-time cut-off (the clock change does not move it)", () => {
    const sada = Date.UTC(2027, 0, 5, 3, 4, 5, 6);
    expect(granicaSirovih(sada)).toBe(sada - 90 * 24 * 60 * 60 * 1000);
  });
});

describe("proveriPeriod", () => {
  const danas = "2026-10-21";

  test("[period] a valid period gives no error", () => {
    expect(proveriPeriod({ od: "2026-10-15", do: "2026-10-21" }, danas)).toBeNull();
    expect(proveriPeriod({ od: "2026-10-21", do: "2026-10-21" }, danas)).toBeNull();
    expect(proveriPeriod({ od: "2026-01-01", do: "2026-03-31" }, danas)).toBeNull();
  });

  test("[period] neispravan: a day that does not exist, a bad format, or a bad today", () => {
    expect(proveriPeriod({ od: "2026-02-29", do: "2026-03-05" }, danas)).toBe("neispravan");
    expect(proveriPeriod({ od: "2026-10-01", do: "21.10.2026" }, danas)).toBe("neispravan");
    expect(proveriPeriod({ od: "", do: "" }, danas)).toBe("neispravan");
    expect(proveriPeriod({ od: "2026-10-01", do: "2026-10-05" }, "danas")).toBe("neispravan");
  });

  test("[period] obrnut: the start is after the end", () => {
    expect(proveriPeriod({ od: "2026-10-10", do: "2026-10-09" }, danas)).toBe("obrnut");
    expect(proveriPeriod({ od: "2026-10-21", do: "2026-10-01" }, danas)).toBe("obrnut");
  });

  test("[period] predug: 367 days is too long, 366 days is the longest allowed", () => {
    const predug = { od: "2025-10-20", do: "2026-10-21" };
    const najduzi = { od: "2025-10-21", do: "2026-10-21" };
    expect(brojDana(predug)).toBe(MAX_DANA_PERIODA + 1);
    expect(brojDana(najduzi)).toBe(MAX_DANA_PERIODA);
    expect(proveriPeriod(predug, danas)).toBe("predug");
    expect(proveriPeriod(najduzi, danas)).toBeNull();
  });

  test("[period] buducnost: the period ends after today; ending today is fine", () => {
    expect(proveriPeriod({ od: "2026-10-20", do: "2026-10-22" }, danas)).toBe("buducnost");
    expect(proveriPeriod({ od: "2026-11-01", do: "2026-11-05" }, danas)).toBe("buducnost");
    expect(proveriPeriod({ od: "2026-10-20", do: "2026-10-21" }, danas)).toBeNull();
  });

  test("[retencija-24m] van_cuvanja: the period starts before the oldest kept daily aggregate", () => {
    expect(najstarijiDanAgregata(danas)).toBe("2024-10-21");
    expect(proveriPeriod({ od: "2024-10-20", do: "2024-10-25" }, danas)).toBe("van_cuvanja");
    expect(proveriPeriod({ od: "2024-10-21", do: "2024-10-25" }, danas)).toBeNull();
  });

  test("[retencija-24m] van_cuvanja: the leap-day cut-off 2026-02-28 is the first kept day on 2028-02-29", () => {
    expect(proveriPeriod({ od: "2026-02-27", do: "2026-03-05" }, "2028-02-29")).toBe("van_cuvanja");
    expect(proveriPeriod({ od: "2026-02-28", do: "2026-03-05" }, "2028-02-29")).toBeNull();
  });
});

describe("poredi", () => {
  test("[poredjenje] no percentage when the previous period is below 20", () => {
    expect(poredi(30, 19)).toEqual({ razlika: 11, procenat: null });
    expect(poredi(30, 19).procenat).toBeNull();
    expect(poredi(5, 0)).toEqual({ razlika: 5, procenat: null });
    expect(poredi(0, 0)).toEqual({ razlika: 0, procenat: null });
  });

  test("[poredjenje] from 20 on the percentage of change is given", () => {
    expect(poredi(30, 20)).toEqual({ razlika: 10, procenat: 50 });
    expect(poredi(100, 20)).toEqual({ razlika: 80, procenat: 400 });
    expect(poredi(100, 100)).toEqual({ razlika: 0, procenat: 0 });
  });

  test("[poredjenje] a decrease has a negative difference and a negative percentage", () => {
    expect(poredi(15, 20)).toEqual({ razlika: -5, procenat: -25 });
    expect(poredi(0, 20)).toEqual({ razlika: -20, procenat: -100 });
  });

  test("[poredjenje] the percentage has one decimal", () => {
    expect(poredi(22, 30)).toEqual({ razlika: -8, procenat: -26.7 });
    expect(poredi(31, 30)).toEqual({ razlika: 1, procenat: 3.3 });
    expect(poredi(33, 30)).toEqual({ razlika: 3, procenat: 10 });
  });

  test("[poredjenje] the difference is given even when the percentage is not", () => {
    expect(poredi(3, 10).razlika).toBe(-7);
    expect(poredi(3, 10).procenat).toBeNull();
  });
});
