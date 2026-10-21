// ScanMe Menu V1 (K30) — how the panel shows the analytics: the periods of a
// plan, "too little data", the rule of 20, the comparison in words, formats,
// chart scales and breakdown names (docs/menu/ANALITIKA-DEFINICIJE.md §2, §5;
// tags [poredjenje], [pravilo-20]).

import { describe, expect, test } from "vitest";
import { menuAnalitikaSr } from "../../i18n/sr/menu-analitika";
import { DIMENZIJE, METRIKE, MIN_IMENILAC, OSTALO, type Dimenzija, type Metrika } from "./definicije";
import type { IzvestajAnalitike } from "./izvestaj";
import { poredi } from "./period";
import {
  bazaPodataka,
  danKratko,
  dimenzijeMetrike,
  formatBroj,
  formatProcenat,
  indeksNajveceg,
  izborDozvoljen,
  lepaSkala,
  nazivVrednosti,
  opsegTekst,
  periodIzbora,
  poredjenjeDostupno,
  prethodniBezPodataka,
  promena,
  proveriIzbor,
  stanjePodataka,
  udeoPrikaza,
  uskladiDimenziju,
  type IzborPerioda,
  type NaziviRaspodele,
} from "./prikaz";

const DANAS = "2026-10-21";

/** A full report with zeros; `otvaranja` and `sesije` are the knobs the rule of 20 reads. */
function izvestaj(
  opcije: {
    otvaranja?: number;
    sesije?: number | null;
    ostale?: Partial<Record<Metrika, number>>;
  } = {},
): IzvestajAnalitike {
  const dani = ["2026-10-19", "2026-10-20", "2026-10-21"];
  const ukupno: Partial<Record<Metrika, number>> = { ...opcije.ostale };
  if (opcije.otvaranja !== undefined) ukupno.otvaranja = opcije.otvaranja;
  const metrike = Object.fromEntries(
    METRIKE.map((metrika) => [metrika, { ukupno: ukupno[metrika] ?? 0, poDanu: dani.map(() => 0) }]),
  ) as unknown as IzvestajAnalitike["metrike"];
  const nula = { poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 };
  return {
    period: { od: dani[0], do: dani[2], dana: 3 },
    dani,
    metrike,
    zahtevi: { call: nula, bill: nula, order: nula },
    porudzbinePoKanalu: { standard: 0, roomService: 0 },
    zahteviOtkazao: { gost: 0, osoblje: 0 },
    rezervacije: {
      poslato: 0,
      prihvaceno: 0,
      odbijeno: 0,
      predlozeno: 0,
      realizovano: 0,
      otkazano: 0,
      otkazao: { gost: 0, osoblje: 0 },
    },
    sesije: { broj: opcije.sesije ?? null, pokrivenost: opcije.sesije == null ? null : 1 },
    najotvaraniji: [],
    skenovi: [],
    konverzije: null,
    prethodni: null,
  };
}

const NAZIVI: NaziviRaspodele = {
  ostalo: menuAnalitikaSr.raspodela.ostalo,
  uklonjeno: menuAnalitikaSr.raspodela.uklonjeno,
  bezNaziva: menuAnalitikaSr.raspodela.bezNaziva,
  sat: menuAnalitikaSr.raspodela.sat,
  uredjaji: menuAnalitikaSr.raspodela.uredjaji,
  kanali: menuAnalitikaSr.raspodela.kanali,
  ko: menuAnalitikaSr.raspodela.ko,
  vrsteZahteva: menuAnalitikaSr.zahtevi.vrste,
  jezici: { sr: "srpski", en: "english" },
};

describe("izborDozvoljen / proveriIzbor", () => {
  test.each([
    ["d7", "standard", true],
    ["d30", "standard", true],
    ["d90", "standard", false],
    ["izbor", "standard", false],
    ["d7", "premium", true],
    ["d30", "premium", true],
    ["d90", "premium", true],
    ["izbor", "premium", true],
  ] as const)("[period] %s on %s plan allowed = %s", (vrsta, plan, dozvoljeno) => {
    expect(izborDozvoljen(vrsta, plan)).toBe(dozvoljeno);
  });

  test("[period] Standard: d7 and d30 are fine, d90 and a custom period answer premium", () => {
    expect(proveriIzbor({ vrsta: "d7" }, DANAS, "standard")).toBeNull();
    expect(proveriIzbor({ vrsta: "d30" }, DANAS, "standard")).toBeNull();
    expect(proveriIzbor({ vrsta: "d90" }, DANAS, "standard")).toBe("premium");
    expect(proveriIzbor({ vrsta: "izbor", od: "2026-10-01", do: "2026-10-10" }, DANAS, "standard")).toBe("premium");
  });

  test("[period] Standard: the lock wins over a broken custom period", () => {
    expect(proveriIzbor({ vrsta: "izbor", od: "2026-10-10", do: "2026-10-01" }, DANAS, "standard")).toBe("premium");
  });

  test("[period] Premium: every quick choice and a good custom period pass", () => {
    expect(proveriIzbor({ vrsta: "d7" }, DANAS, "premium")).toBeNull();
    expect(proveriIzbor({ vrsta: "d90" }, DANAS, "premium")).toBeNull();
    expect(proveriIzbor({ vrsta: "izbor", od: "2026-10-01", do: "2026-10-10" }, DANAS, "premium")).toBeNull();
  });

  test("[period] Premium: custom period errors pass through from proveriPeriod", () => {
    const izbor = (od: string, doo: string): IzborPerioda => ({ vrsta: "izbor", od, do: doo });
    expect(proveriIzbor(izbor("2026-10-10", "2026-10-01"), DANAS, "premium")).toBe("obrnut");
    expect(proveriIzbor(izbor("2026-10-01", "2026-10-22"), DANAS, "premium")).toBe("buducnost");
    expect(proveriIzbor(izbor("2024-10-20", "2024-10-25"), DANAS, "premium")).toBe("van_cuvanja");
    expect(proveriIzbor(izbor("2026-02-30", "2026-03-05"), DANAS, "premium")).toBe("neispravan");
    expect(proveriIzbor(izbor("", ""), DANAS, "premium")).toBe("neispravan");
  });

  test("[period] Premium: 366 days is fine, 367 days is too long", () => {
    expect(proveriIzbor({ vrsta: "izbor", od: "2025-10-21", do: "2026-10-21" }, DANAS, "premium")).toBeNull();
    expect(proveriIzbor({ vrsta: "izbor", od: "2025-10-20", do: "2026-10-21" }, DANAS, "premium")).toBe("predug");
  });
});

describe("periodIzbora", () => {
  test("[period] d7 is 7 days ending today, inclusive", () => {
    expect(periodIzbora({ vrsta: "d7" }, "2026-10-17")).toEqual({ od: "2026-10-11", do: "2026-10-17" });
  });

  test("[period] d30 and d90 end today and cover 30 / 90 days", () => {
    expect(periodIzbora({ vrsta: "d30" }, DANAS)).toEqual({ od: "2026-09-22", do: DANAS });
    expect(periodIzbora({ vrsta: "d90" }, DANAS)).toEqual({ od: "2026-07-24", do: DANAS });
  });

  test("[period] crosses a month and a year boundary", () => {
    expect(periodIzbora({ vrsta: "d7" }, "2026-03-03")).toEqual({ od: "2026-02-25", do: "2026-03-03" });
    expect(periodIzbora({ vrsta: "d7" }, "2026-01-03")).toEqual({ od: "2025-12-28", do: "2026-01-03" });
    expect(periodIzbora({ vrsta: "d30" }, "2026-01-15")).toEqual({ od: "2025-12-17", do: "2026-01-15" });
  });

  test("[period] a leap February is counted", () => {
    expect(periodIzbora({ vrsta: "d7" }, "2028-03-02")).toEqual({ od: "2028-02-25", do: "2028-03-02" });
  });

  test("[period] a custom period passes through unchanged", () => {
    expect(periodIzbora({ vrsta: "izbor", od: "2026-01-05", do: "2026-02-10" }, DANAS)).toEqual({
      od: "2026-01-05",
      do: "2026-02-10",
    });
  });
});

describe("promena", () => {
  test("[poredjenje] more: positive difference and percentage", () => {
    expect(promena({ razlika: 10, procenat: 50 }, "dovoljno")).toEqual({ smer: "vise", razlika: 10, procenat: 50 });
  });

  test("[poredjenje] fewer: difference and percentage are shown positive", () => {
    expect(promena({ razlika: -10, procenat: -50 }, "dovoljno")).toEqual({ smer: "manje", razlika: 10, procenat: 50 });
  });

  test("[poredjenje] the same: no percentage ever", () => {
    expect(promena({ razlika: 0, procenat: 0 }, "dovoljno")).toEqual({ smer: "isto", razlika: 0, procenat: null });
    expect(promena({ razlika: 0, procenat: 12 }, "dovoljno")).toEqual({ smer: "isto", razlika: 0, procenat: null });
  });

  test("[poredjenje] a null percentage (previous period below 20) stays null", () => {
    expect(promena({ razlika: 7, procenat: null }, "dovoljno")).toEqual({ smer: "vise", razlika: 7, procenat: null });
    expect(promena({ razlika: -7, procenat: null }, "dovoljno")).toEqual({ smer: "manje", razlika: 7, procenat: null });
  });

  test.each(["malo", "prazno"] as const)("[poredjenje] stanje %s forces the percentage to null", (stanje) => {
    expect(promena({ razlika: 10, procenat: 50 }, stanje)).toEqual({ smer: "vise", razlika: 10, procenat: null });
    expect(promena({ razlika: -10, procenat: -50 }, stanje)).toEqual({ smer: "manje", razlika: 10, procenat: null });
  });

  test("[poredjenje] razlika and procenat are never negative", () => {
    for (const razlika of [-1000, -1, 1, 1000]) {
      const rezultat = promena({ razlika, procenat: razlika * 2 }, "dovoljno");
      expect(rezultat.razlika).toBeGreaterThan(0);
      expect(rezultat.procenat).toBeGreaterThan(0);
    }
  });

  test("[poredjenje] end to end with poredi(): previous 19 has no percentage, previous 20 has one", () => {
    expect(promena(poredi(30, 19), "dovoljno")).toEqual({ smer: "vise", razlika: 11, procenat: null });
    expect(promena(poredi(30, 20), "dovoljno")).toEqual({ smer: "vise", razlika: 10, procenat: 50 });
  });

  test("[poredjenje] end to end: fewer, the same and an empty previous period", () => {
    expect(promena(poredi(10, 20), "dovoljno")).toEqual({ smer: "manje", razlika: 10, procenat: 50 });
    expect(promena(poredi(20, 20), "dovoljno")).toEqual({ smer: "isto", razlika: 0, procenat: null });
    expect(promena(poredi(5, 0), "dovoljno")).toEqual({ smer: "vise", razlika: 5, procenat: null });
  });
});

describe("stanjePodataka / bazaPodataka", () => {
  test("[pravilo-20] a report with nothing counted is prazno", () => {
    expect(stanjePodataka(izvestaj())).toBe("prazno");
    expect(stanjePodataka(izvestaj({ sesije: 0 }))).toBe("prazno");
  });

  test("[pravilo-20] without sessions the base is the menu opens: 19 is malo, 20 is dovoljno", () => {
    expect(bazaPodataka(izvestaj({ otvaranja: 19 }))).toBe(19);
    expect(stanjePodataka(izvestaj({ otvaranja: 19 }))).toBe("malo");
    expect(stanjePodataka(izvestaj({ otvaranja: MIN_IMENILAC }))).toBe("dovoljno");
    expect(stanjePodataka(izvestaj({ otvaranja: 5000 }))).toBe("dovoljno");
  });

  test("[pravilo-20] with sessions the base is the sessions: 19 is malo, 20 is dovoljno", () => {
    expect(stanjePodataka(izvestaj({ otvaranja: 100, sesije: 19 }))).toBe("malo");
    expect(stanjePodataka(izvestaj({ otvaranja: 100, sesije: 20 }))).toBe("dovoljno");
  });

  test("[pravilo-20] sessions take precedence over opens (500 opens, 12 sessions is malo)", () => {
    const r = izvestaj({ otvaranja: 500, sesije: 12 });
    expect(bazaPodataka(r)).toBe(12);
    expect(stanjePodataka(r)).toBe("malo");
  });

  test("[pravilo-20] few opens but enough sessions is dovoljno", () => {
    expect(stanjePodataka(izvestaj({ otvaranja: 5, sesije: 30 }))).toBe("dovoljno");
  });

  test("[pravilo-20] zero sessions with other counts is malo, not prazno", () => {
    expect(stanjePodataka(izvestaj({ otvaranja: 100, sesije: 0 }))).toBe("malo");
  });

  test("[pravilo-20] any metric above zero (a scan, a request) makes it not prazno", () => {
    expect(stanjePodataka(izvestaj({ ostale: { skenovi: 3 } }))).toBe("malo");
    expect(stanjePodataka(izvestaj({ ostale: { zahtevi: 1 } }))).toBe("malo");
  });
});

describe("udeoPrikaza", () => {
  test("[pravilo-20] null when the state is malo, even with a denominator of 20 or more", () => {
    expect(udeoPrikaza(5, 20, "malo")).toBeNull();
    expect(udeoPrikaza(5, 5000, "malo")).toBeNull();
  });

  test("[pravilo-20] null when the state is prazno", () => {
    expect(udeoPrikaza(0, 100, "prazno")).toBeNull();
  });

  test("[pravilo-20] null below a denominator of 20 even when dovoljno", () => {
    expect(udeoPrikaza(5, 19, "dovoljno")).toBeNull();
    expect(udeoPrikaza(0, 0, "dovoljno")).toBeNull();
    expect(udeoPrikaza(1, Number.NaN, "dovoljno")).toBeNull();
  });

  test("[pravilo-20] a number from 20 on", () => {
    expect(udeoPrikaza(5, 20, "dovoljno")).toBe(25);
    expect(udeoPrikaza(12, 30, "dovoljno")).toBe(40);
    expect(udeoPrikaza(0, 20, "dovoljno")).toBe(0);
    expect(udeoPrikaza(1, 3000, "dovoljno")).toBe(0);
  });

  test("[pravilo-20] never above 100 and never below 0", () => {
    expect(udeoPrikaza(50, 20, "dovoljno")).toBe(100);
    expect(udeoPrikaza(20, 20, "dovoljno")).toBe(100);
    expect(udeoPrikaza(-4, 20, "dovoljno")).toBe(0);
  });
});

describe("formatBroj", () => {
  test.each([
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [1000, "1.000"],
    [1284, "1.284"],
    [12345, "12.345"],
    [1234567, "1.234.567"],
    [-1284, "-1.284"],
    [-5, "-5"],
    [1234.6, "1.235"],
    [999.5, "1.000"],
  ])("%d is %s", (n, tekst) => {
    expect(formatBroj(n)).toBe(tekst);
  });
});

describe("formatProcenat", () => {
  test.each([
    [0, "0%"],
    [40, "40%"],
    [100, "100%"],
    [12.5, "12,5%"],
    [33.33, "33,3%"],
    [12.04, "12%"],
    [99.96, "100%"],
    [0.04, "0%"],
  ])("%d is %s", (p, tekst) => {
    expect(formatProcenat(p)).toBe(tekst);
  });
});

describe("danKratko / opsegTekst", () => {
  const meseci = menuAnalitikaSr.meseci;

  test("danKratko drops the leading zero and names the month", () => {
    expect(danKratko("2026-10-15", meseci)).toBe("15. okt");
    expect(danKratko("2026-01-05", meseci)).toBe("5. jan");
    expect(danKratko("2026-12-31", meseci)).toBe("31. dec");
  });

  test("opsegTekst in one year shows the year once", () => {
    expect(opsegTekst({ od: "2026-10-11", do: "2026-10-17" }, meseci)).toBe("11. okt – 17. okt 2026");
  });

  test("opsegTekst across years shows both years", () => {
    expect(opsegTekst({ od: "2025-12-28", do: "2026-01-03" }, meseci)).toBe("28. dec 2025 – 3. jan 2026");
  });

  test("opsegTekst uses the dictionary template", () => {
    expect(opsegTekst({ od: "2026-10-11", do: "2026-10-17" }, meseci, menuAnalitikaSr.period.opseg)).toBe(
      "11. okt – 17. okt 2026",
    );
    expect(opsegTekst({ od: "2026-10-11", do: "2026-10-17" }, meseci, "od {od} do {do}")).toBe("od 11. okt do 17. okt 2026");
  });

  test("opsegTekst of a single day", () => {
    expect(opsegTekst({ od: "2026-10-21", do: "2026-10-21" }, meseci)).toBe("21. okt – 21. okt 2026");
  });
});

describe("lepaSkala", () => {
  test.each([
    [0, 1],
    [-5, 1],
    [Number.NaN, 1],
    [1, 1],
    [2, 2],
    [3, 5],
    [7, 10],
    [10, 10],
    [11, 20],
    [120, 200],
    [250, 250],
    [251, 500],
    [501, 1000],
    [1000, 1000],
    [1284, 2000],
    [0.3, 1],
  ])("axis top for %d is %d", (max, skala) => {
    expect(lepaSkala(max)).toBe(skala);
  });

  test("the top is always at or above the largest value and a whole number", () => {
    for (const max of [1, 4, 6, 9, 13, 24, 26, 49, 51, 99, 101, 249, 999, 1001, 24999, 123456]) {
      const skala = lepaSkala(max);
      expect(skala).toBeGreaterThanOrEqual(max);
      expect(Number.isInteger(skala)).toBe(true);
    }
  });
});

describe("indeksNajveceg", () => {
  test("empty and all-zero series give -1", () => {
    expect(indeksNajveceg([])).toBe(-1);
    expect(indeksNajveceg([0, 0, 0])).toBe(-1);
  });

  test("finds the largest", () => {
    expect(indeksNajveceg([1, 5, 3])).toBe(1);
    expect(indeksNajveceg([0, 0, 9])).toBe(2);
    expect(indeksNajveceg([4])).toBe(0);
  });

  test("ties give the first", () => {
    expect(indeksNajveceg([2, 7, 7, 1])).toBe(1);
    expect(indeksNajveceg([3, 3, 3])).toBe(0);
  });
});

describe("uskladiDimenziju / dimenzijeMetrike", () => {
  test("keeps an allowed dimension", () => {
    expect(uskladiDimenziju("otvaranja", "jezik")).toBe("jezik");
    expect(uskladiDimenziju("detalji", "artikal")).toBe("artikal");
    expect(uskladiDimenziju("zahteviOtkazani", "ko")).toBe("ko");
  });

  test("replaces a foreign dimension with the first allowed one", () => {
    expect(uskladiDimenziju("zahtevi", "jezik")).toBe("zahtev");
    expect(uskladiDimenziju("rezervacije", "jezik")).toBe("sat");
    expect(uskladiDimenziju("skenovi", "stranica")).toBe("kartica");
    expect(uskladiDimenziju("otvaranja", "artikal")).toBe("stranica");
  });

  test("null stays null", () => {
    expect(uskladiDimenziju("otvaranja", null)).toBeNull();
    expect(uskladiDimenziju("rezervacije", null)).toBeNull();
  });

  test("every offered metric has at least one dimension", () => {
    for (const metrika of ["otvaranja", "detalji", "skenovi", "zahtevi", "zahteviOtkazani", "rezervacije"] as const) {
      expect(dimenzijeMetrike(metrika).length).toBeGreaterThan(0);
    }
  });
});

describe("nazivVrednosti", () => {
  test.each(DIMENZIJE)("the %s dimension: the ostalo bucket is named Ostalo", (dimenzija: Dimenzija) => {
    expect(nazivVrednosti(dimenzija, OSTALO, "Neko ime", NAZIVI)).toBe("Ostalo");
  });

  test.each(["stranica", "artikal", "kartica"] as const)("%s: name, removed and blank names", (dimenzija) => {
    expect(nazivVrednosti(dimenzija, "id1", "Capricciosa", NAZIVI)).toBe("Capricciosa");
    expect(nazivVrednosti(dimenzija, "id1", null, NAZIVI)).toBe("Više nije u meniju");
    expect(nazivVrednosti(dimenzija, "id1", "", NAZIVI)).toBe("Bez naziva");
    expect(nazivVrednosti(dimenzija, "id1", "   ", NAZIVI)).toBe("Bez naziva");
  });

  test("sat: an hour range, with midnight wrapping", () => {
    expect(nazivVrednosti("sat", "18", null, NAZIVI)).toBe("18–19 h");
    expect(nazivVrednosti("sat", "0", null, NAZIVI)).toBe("00–01 h");
    expect(nazivVrednosti("sat", "9", null, NAZIVI)).toBe("09–10 h");
    expect(nazivVrednosti("sat", "23", null, NAZIVI)).toBe("23–00 h");
  });

  test.each(["24", "-1", "abc", "1.5", "12h"])("sat: invalid hour %j returns the raw value", (vrednost) => {
    expect(nazivVrednosti("sat", vrednost, null, NAZIVI)).toBe(vrednost);
  });

  test("jezik: a known language is capitalized, an unknown one is the upper-case code", () => {
    expect(nazivVrednosti("jezik", "sr", null, NAZIVI)).toBe("Srpski");
    expect(nazivVrednosti("jezik", "en", null, NAZIVI)).toBe("English");
    expect(nazivVrednosti("jezik", "de", null, NAZIVI)).toBe("DE");
  });

  test("uredjaj: mapped, unknown stays raw", () => {
    expect(nazivVrednosti("uredjaj", "telefon", null, NAZIVI)).toBe("Telefon");
    expect(nazivVrednosti("uredjaj", "tablet", null, NAZIVI)).toBe("Tablet");
    expect(nazivVrednosti("uredjaj", "racunar", null, NAZIVI)).toBe("Računar");
    expect(nazivVrednosti("uredjaj", "tv", null, NAZIVI)).toBe("tv");
  });

  test("kanal: mapped, unknown stays raw", () => {
    expect(nazivVrednosti("kanal", "standard", null, NAZIVI)).toBe("Stranice menija");
    expect(nazivVrednosti("kanal", "room_service", null, NAZIVI)).toBe("Room service");
    expect(nazivVrednosti("kanal", "drugo", null, NAZIVI)).toBe("drugo");
  });

  test("ko: mapped, unknown stays raw", () => {
    expect(nazivVrednosti("ko", "guest", null, NAZIVI)).toBe("Gost");
    expect(nazivVrednosti("ko", "staff", null, NAZIVI)).toBe("Osoblje");
    expect(nazivVrednosti("ko", "sistem", null, NAZIVI)).toBe("sistem");
  });

  test("zahtev: mapped, unknown stays raw", () => {
    expect(nazivVrednosti("zahtev", "call", null, NAZIVI)).toBe("Poziv konobara");
    expect(nazivVrednosti("zahtev", "bill", null, NAZIVI)).toBe("Račun");
    expect(nazivVrednosti("zahtev", "order", null, NAZIVI)).toBe("Porudžbina");
    expect(nazivVrednosti("zahtev", "x", null, NAZIVI)).toBe("x");
  });
});

describe("prethodniBezPodataka / poredjenjeDostupno", () => {
  /** A report whose previous period has the given totals (every other metric 0). */
  function sPrethodnim(ukupno: Partial<Record<Metrika, number>> | null): IzvestajAnalitike {
    const osnova = izvestaj();
    if (ukupno === null) return osnova;
    const sve = Object.fromEntries(METRIKE.map((metrika) => [metrika, ukupno[metrika] ?? 0])) as Record<Metrika, number>;
    const poredjenje = Object.fromEntries(METRIKE.map((metrika) => [metrika, poredi(0, sve[metrika])])) as unknown as NonNullable<
      IzvestajAnalitike["prethodni"]
    >["poredjenje"];
    return { ...osnova, prethodni: { period: { od: "2026-10-16", do: "2026-10-18" }, ukupno: sve, poredjenje } };
  }

  test("[poredjenje] no previous period (Standard): nothing is 'without data' and nothing is available", () => {
    const bez = sPrethodnim(null);
    expect(prethodniBezPodataka(bez)).toBe(false);
    for (const metrika of METRIKE) expect(poredjenjeDostupno(bez, metrika)).toBe(false);
  });

  test("[poredjenje] a previous period of all zeros has no data, and no comparison is available", () => {
    const prazno = sPrethodnim({});
    expect(prethodniBezPodataka(prazno)).toBe(true);
    for (const metrika of METRIKE) expect(poredjenjeDostupno(prazno, metrika)).toBe(false);
  });

  test("[poredjenje] a single metric with data is enough to have a previous period", () => {
    expect(prethodniBezPodataka(sPrethodnim({ skenovi: 1 }))).toBe(false);
  });

  test("[poredjenje] a metric whose previous total is 0 has no comparison, one with data has", () => {
    const prethodni = sPrethodnim({ otvaranja: 50, detalji: 10, skenovi: 0 });
    expect(poredjenjeDostupno(prethodni, "otvaranja")).toBe(true);
    expect(poredjenjeDostupno(prethodni, "detalji")).toBe(true);
    expect(poredjenjeDostupno(prethodni, "skenovi")).toBe(false);
    expect(poredjenjeDostupno(prethodni, "zahtevi")).toBe(false);
  });

  test("[poredjenje] sessions are compared only when the previous period's sessions were reliable", () => {
    // 90 of 100 opens carried a session id: below 95%, not reliable.
    const nepouzdane = sPrethodnim({ otvaranja: 100, otvaranjaSaSesijom: 90, sesije: 40 });
    expect(poredjenjeDostupno(nepouzdane, "sesije")).toBe(false);
    expect(poredjenjeDostupno(nepouzdane, "otvaranja")).toBe(true);
    // 95 of 100: reliable.
    const pouzdane = sPrethodnim({ otvaranja: 100, otvaranjaSaSesijom: 95, sesije: 40 });
    expect(poredjenjeDostupno(pouzdane, "sesije")).toBe(true);
    // Reliable coverage but no sessions at all: the metric is 0, so still no comparison.
    expect(poredjenjeDostupno(sPrethodnim({ otvaranja: 100, otvaranjaSaSesijom: 100, sesije: 0 }), "sesije")).toBe(false);
  });
});
