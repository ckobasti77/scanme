// ScanMe Menu V1 (K30) — the Premium CSV export (master §14.1): Excel-friendly
// (BOM, `;`, CRLF), Serbian headers, aggregate counts only, no formulas
// (tag [csv]).

import { describe, expect, test } from "vitest";
import { menuAnalitikaSr } from "../../i18n/sr/menu-analitika";
import { CSV_BOM, CSV_SEPARATOR, csvPerioda, csvPolje, csvRaspodele, imeCsvFajla, kolonePerioda } from "./csv";
import { METRIKE, type Metrika } from "./definicije";
import type { IzvestajAnalitike, RaspodelaAnalitike } from "./izvestaj";

const DANI = ["2026-10-19", "2026-10-20", "2026-10-21"];

/** A full report with zeros; `poDanu` of a metric sets its days and total. */
function izvestaj(
  opcije: {
    poDanu?: Partial<Record<Metrika, number[]>>;
    sesije?: number | null;
    konverzije?: boolean;
  } = {},
): IzvestajAnalitike {
  const metrike = Object.fromEntries(
    METRIKE.map((metrika) => {
      const poDanu = opcije.poDanu?.[metrika] ?? DANI.map(() => 0);
      return [metrika, { ukupno: poDanu.reduce((a, b) => a + b, 0), poDanu }];
    }),
  ) as unknown as IzvestajAnalitike["metrike"];
  const nula = { poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 };
  return {
    period: { od: DANI[0], do: DANI[2], dana: DANI.length },
    dani: DANI,
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
    konverzije: opcije.konverzije
      ? {
          sesije: 50,
          saDetaljem: 30,
          saZahtevom: 10,
          saPorudzbinom: 5,
          saRezervacijom: 2,
          udeo: { detalj: 60, zahtev: 20, porudzbina: 10, rezervacija: 4 },
        }
      : null,
    prethodni: null,
  };
}

function linije(dokument: string): string[] {
  return dokument.replace(CSV_BOM, "").split("\r\n");
}

const KOLONE = menuAnalitikaSr.csv.kolone;
const ZAGLAVLJE_OSNOVNO = [
  KOLONE.otvaranja,
  KOLONE.detalji,
  KOLONE.skenovi,
  KOLONE.zahtevi,
  KOLONE.porudzbine,
  KOLONE.zahteviPrihvaceni,
  KOLONE.zahteviZavrseni,
  KOLONE.zahteviOtkazani,
  KOLONE.rezervacije,
  KOLONE.rezervacijePrihvacene,
  KOLONE.rezervacijePredlozi,
  KOLONE.rezervacijeOdbijene,
  KOLONE.rezervacijeRealizovane,
  KOLONE.rezervacijeOtkazane,
];

describe("csvPolje", () => {
  test("[csv] plain text stays as it is", () => {
    expect(csvPolje("Pizza")).toBe("Pizza");
    expect(csvPolje("Pizza Capricciosa")).toBe("Pizza Capricciosa");
    expect(csvPolje("")).toBe("");
  });

  test("[csv] a field with ; is quoted", () => {
    expect(csvPolje("a;b")).toBe('"a;b"');
  });

  test("[csv] a field with a double quote is quoted and the quote doubled", () => {
    expect(csvPolje('Pizza "Sef"')).toBe('"Pizza ""Sef"""');
  });

  test("[csv] a field with a newline (LF, CR or CRLF) is quoted", () => {
    expect(csvPolje("a\nb")).toBe('"a\nb"');
    expect(csvPolje("a\r\nb")).toBe('"a\r\nb"');
    expect(csvPolje("a\rb")).toBe('"a\rb"');
  });

  test("[csv] leading or trailing space gets the field quoted", () => {
    expect(csvPolje(" a")).toBe('" a"');
    expect(csvPolje("a ")).toBe('"a "');
    expect(csvPolje("a b")).toBe("a b");
  });

  test.each(["=1+1", "+381601234567", "-5", "@SUM(A1)", "\tcmd"])("[csv] formula guard: %j gets a leading apostrophe", (vrednost) => {
    const polje = csvPolje(vrednost);
    expect(polje.startsWith("'")).toBe(true);
    expect(polje).toBe(`'${vrednost}`);
  });

  test("[csv] a formula guard and quoting combine", () => {
    expect(csvPolje('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvPolje("=a;b")).toBe("\"'=a;b\"");
  });

  test("[csv] a sign in the middle of the text is left alone", () => {
    expect(csvPolje("a=b")).toBe("a=b");
    expect(csvPolje("a-b")).toBe("a-b");
    expect(csvPolje("mail@x")).toBe("mail@x");
  });

  test("[csv] numbers are written as rounded digits, negative too", () => {
    expect(csvPolje(0)).toBe("0");
    expect(csvPolje(12)).toBe("12");
    expect(csvPolje(1284)).toBe("1284");
    expect(csvPolje(12.4)).toBe("12");
    expect(csvPolje(12.6)).toBe("13");
    expect(csvPolje(-7)).toBe("-7");
  });

  test("[csv] numbers are never formula-guarded", () => {
    expect(csvPolje(-7)).not.toContain("'");
  });

  test("[csv] NaN and infinity become an empty field", () => {
    expect(csvPolje(Number.NaN)).toBe("");
    expect(csvPolje(Number.POSITIVE_INFINITY)).toBe("");
    expect(csvPolje(Number.NEGATIVE_INFINITY)).toBe("");
  });

  test("[csv] Serbian letters pass through as they are", () => {
    expect(csvPolje("čćžšđ ČĆŽŠĐ")).toBe("čćžšđ ČĆŽŠĐ");
  });
});

describe("csvPerioda format", () => {
  test("[csv] the document starts with exactly one BOM", () => {
    const dokument = csvPerioda(izvestaj());
    expect(CSV_BOM).toBe("﻿");
    expect(dokument.charCodeAt(0)).toBe(0xfeff);
    expect(dokument.split("﻿").length - 1).toBe(1);
    expect(dokument.startsWith("﻿Datum")).toBe(true);
  });

  test("[csv] fields are separated by ; and lines by CRLF, ending with CRLF", () => {
    const dokument = csvPerioda(izvestaj());
    expect(CSV_SEPARATOR).toBe(";");
    expect(dokument.endsWith("\r\n")).toBe(true);
    expect(dokument.endsWith("\r\n\r\n")).toBe(false);
    // no bare LF anywhere: every \n is part of a \r\n
    expect(dokument.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    // no comma separators
    expect(dokument).not.toContain(",");
  });

  test("[csv] every line has the same number of fields", () => {
    const dokument = csvPerioda(izvestaj({ sesije: 40, konverzije: true }));
    const redovi = linije(dokument).slice(0, -1);
    const sirina = redovi[0].split(";").length;
    for (const r of redovi) expect(r.split(";").length).toBe(sirina);
  });
});

describe("csvPerioda columns", () => {
  test("[csv] header without sessions: Datum and the 14 metric columns, exact", () => {
    const [zaglavlje] = linije(csvPerioda(izvestaj()));
    expect(zaglavlje).toBe(
      "Datum;Otvaranja menija;Otvaranja artikala;Skeniranja QR kartica;Poslati zahtevi;Porudžbine;" +
        "Prihvaćeni zahtevi;Završeni zahtevi;Otkazani zahtevi;Zahtevi za rezervaciju;Prihvaćene rezervacije;" +
        "Predložene izmene rezervacija;Odbijene rezervacije;Realizovane rezervacije;Otkazane rezervacije",
    );
  });

  test("[csv] the first five headers are hard-coded Serbian", () => {
    const polja = linije(csvPerioda(izvestaj()))[0].split(";");
    expect(polja.slice(0, 6)).toEqual([
      "Datum",
      "Otvaranja menija",
      "Otvaranja artikala",
      "Skeniranja QR kartica",
      "Poslati zahtevi",
      "Porudžbine",
    ]);
  });

  test("[csv] the header follows the dictionary", () => {
    const polja = linije(csvPerioda(izvestaj()))[0].split(";");
    expect(polja).toEqual([menuAnalitikaSr.csv.datum, ...ZAGLAVLJE_OSNOVNO]);
    expect(polja).toHaveLength(15);
  });

  test("[csv] sessions column appears only when sesije.broj is not null", () => {
    expect(linije(csvPerioda(izvestaj({ sesije: null })))[0]).not.toContain("Sesije");
    const polja = linije(csvPerioda(izvestaj({ sesije: 0 })))[0].split(";");
    expect(polja).toEqual([menuAnalitikaSr.csv.datum, ...ZAGLAVLJE_OSNOVNO, KOLONE.sesije]);
    expect(polja.at(-1)).toBe("Sesije");
  });

  test("[csv] the 4 flow columns appear only when konverzije is not null", () => {
    const bez = linije(csvPerioda(izvestaj({ sesije: 50 })))[0].split(";");
    expect(bez).not.toContain(KOLONE.sesijeSaDetaljem);
    const sa = linije(csvPerioda(izvestaj({ sesije: 50, konverzije: true })))[0].split(";");
    expect(sa).toEqual([
      menuAnalitikaSr.csv.datum,
      ...ZAGLAVLJE_OSNOVNO,
      KOLONE.sesije,
      KOLONE.sesijeSaDetaljem,
      KOLONE.sesijeSaZahtevom,
      KOLONE.sesijeSaPorudzbinom,
      KOLONE.sesijeSaRezervacijom,
    ]);
    expect(sa.slice(-4)).toEqual([
      "Sesije sa otvorenim artiklom",
      "Sesije sa zahtevom",
      "Sesije sa porudžbinom",
      "Sesije sa rezervacijom",
    ]);
  });

  test("[csv] kolonePerioda mirrors the same rules", () => {
    expect(kolonePerioda(izvestaj())).toHaveLength(14);
    expect(kolonePerioda(izvestaj({ sesije: 10 }))).toHaveLength(15);
    expect(kolonePerioda(izvestaj({ sesije: 10, konverzije: true }))).toHaveLength(19);
  });

  test("[csv] the internal metric otvaranjaSaSesijom never appears, in any shape", () => {
    expect(kolonePerioda(izvestaj({ sesije: 10, konverzije: true }))).not.toContain("otvaranjaSaSesijom" as never);
    const dokument = csvPerioda(
      izvestaj({ sesije: 10, konverzije: true, poDanu: { otvaranjaSaSesijom: [777, 888, 999] } }),
    );
    expect(dokument).not.toContain("otvaranjaSaSesijom");
    expect(dokument).not.toMatch(/777|888|999/);
  });
});

describe("csvPerioda rows", () => {
  const dokument = csvPerioda(
    izvestaj({
      poDanu: { otvaranja: [10, 0, 25], detalji: [3, 4, 5], zahtevi: [1, 2, 0], rezervacijeOtkazane: [0, 0, 9] },
    }),
  );

  test("[csv] one row per day in order with ISO dates, then the Ukupno row", () => {
    const redovi = linije(dokument);
    expect(redovi[1].split(";")[0]).toBe("2026-10-19");
    expect(redovi[2].split(";")[0]).toBe("2026-10-20");
    expect(redovi[3].split(";")[0]).toBe("2026-10-21");
    expect(redovi[4].split(";")[0]).toBe("Ukupno");
    for (const dan of redovi.slice(1, 4)) expect(dan.split(";")[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("[csv] day rows carry that day's counts in the column order", () => {
    const redovi = linije(dokument);
    // Datum, otvaranja, detalji, skenovi, zahtevi, porudzbine, ..., rezervacijeOtkazane (last)
    expect(redovi[1].split(";").slice(0, 5)).toEqual(["2026-10-19", "10", "3", "0", "1"]);
    expect(redovi[2].split(";").slice(0, 5)).toEqual(["2026-10-20", "0", "4", "0", "2"]);
    expect(redovi[3].split(";").slice(0, 5)).toEqual(["2026-10-21", "25", "5", "0", "0"]);
    expect(redovi[3].split(";").at(-1)).toBe("9");
  });

  test("[csv] the Ukupno row holds the totals", () => {
    const ukupno = linije(dokument)[4].split(";");
    expect(ukupno.slice(0, 5)).toEqual(["Ukupno", "35", "12", "0", "3"]);
    expect(ukupno.at(-1)).toBe("9");
  });

  test("[csv] the total of each column equals the sum of its day rows", () => {
    const redovi = linije(dokument).slice(1, 5).map((r) => r.split(";"));
    const dani = redovi.slice(0, 3);
    const ukupno = redovi[3];
    for (let i = 1; i < ukupno.length; i++) {
      expect(dani.reduce((zbir, r) => zbir + Number(r[i]), 0)).toBe(Number(ukupno[i]));
    }
  });

  test("[csv] a missing day value counts as 0", () => {
    const r = izvestaj({ poDanu: { otvaranja: [4] } });
    const redovi = linije(csvPerioda(r));
    expect(redovi[2].split(";")[1]).toBe("0");
    expect(redovi[3].split(";")[1]).toBe("0");
  });

  test("[csv] sessions and flow values land under their own headers", () => {
    const r = izvestaj({
      sesije: 50,
      konverzije: true,
      poDanu: { sesije: [10, 20, 20], sesijeSaDetaljem: [5, 10, 15], sesijeSaRezervacijom: [0, 1, 1] },
    });
    const redovi = linije(csvPerioda(r));
    const zaglavlje = redovi[0].split(";");
    const ukupno = redovi[4].split(";");
    expect(ukupno[zaglavlje.indexOf("Sesije")]).toBe("50");
    expect(ukupno[zaglavlje.indexOf("Sesije sa otvorenim artiklom")]).toBe("30");
    expect(ukupno[zaglavlje.indexOf("Sesije sa rezervacijom")]).toBe("2");
    expect(redovi[2].split(";")[zaglavlje.indexOf("Sesije")]).toBe("20");
  });

  test("[csv] UTF-8 characters survive as they are", () => {
    const tekst = { ...menuAnalitikaSr.csv, datum: "Datum čćžšđ", ukupno: "Ukupno ČĆŽŠĐ" };
    const redovi = linije(csvPerioda(izvestaj(), tekst));
    expect(redovi[0].startsWith("Datum čćžšđ;")).toBe(true);
    expect(redovi.at(-2)?.startsWith("Ukupno ČĆŽŠĐ;")).toBe(true);
    expect(csvPerioda(izvestaj())).toContain("Porudžbine");
    expect(csvPerioda(izvestaj())).toContain("Prihvaćeni zahtevi");
    expect(csvPerioda(izvestaj())).toContain("Završeni zahtevi");
  });
});

describe("csv has no personal data", () => {
  const SESIJA = "sess-9f8e7d6c5b4a39281706";
  const kartica = "k7n2m4p6q8r3t5v9w2x4";
  const r: IzvestajAnalitike = {
    ...izvestaj({ sesije: 40, konverzije: true, poDanu: { otvaranja: [10, 20, 30], zahtevi: [1, 2, 3] } }),
    najotvaraniji: [{ artikal: "artikal-id-123456789", naziv: "Pizza", broj: 12 }],
    skenovi: [{ kartica, naziv: "Sto 4", broj: 9 }],
  };
  const raspodela: RaspodelaAnalitike = {
    period: { od: DANI[0], do: DANI[2], dana: 3 },
    dani: DANI,
    metrika: "detalji",
    dimenzija: "artikal",
    vrednosti: [
      { vrednost: "artikal-id-123456789", naziv: "Pizza", ukupno: 12, poDanu: [4, 4, 4] },
      { vrednost: "artikal-id-987654321", naziv: "Pasta", ukupno: 6, poDanu: [1, 2, 3] },
    ],
    ostalo: { ukupno: 3, poDanu: [1, 1, 1] },
  };
  const naziv = (v: RaspodelaAnalitike["vrednosti"][number]) => v.naziv ?? "";

  const dokumenti = [csvPerioda(r), csvRaspodele(raspodela, naziv)];

  test.each([0, 1])("[csv] document %d has no @, no +381, no session or card id", (i) => {
    const dokument = dokumenti[i];
    expect(dokument).not.toContain("@");
    expect(dokument).not.toContain("+381");
    expect(dokument).not.toContain(SESIJA);
    expect(dokument).not.toContain(kartica);
    expect(dokument).not.toContain("artikal-id");
  });

  test.each([0, 1])("[csv] document %d has no phone-like digit run once the ISO dates are removed", (i) => {
    const bezDatuma = dokumenti[i].replace(/\d{4}-\d{2}-\d{2}/g, "");
    expect(bezDatuma).not.toMatch(/\d{6,}/);
  });

  test("[csv] the period CSV is only the header, the day rows and the total row", () => {
    const redovi = linije(csvPerioda(r)).slice(0, -1);
    expect(redovi).toHaveLength(r.dani.length + 2);
    expect(redovi[0].startsWith("Datum;")).toBe(true);
    expect(redovi.at(-1)?.startsWith("Ukupno;")).toBe(true);
    expect(csvPerioda(r)).not.toContain("Pizza");
    expect(csvPerioda(r)).not.toContain("Sto 4");
  });

  test("[csv] a longer period still has days + 2 lines", () => {
    const dani = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const dugacak = izvestaj();
    const redovi = linije(
      csvPerioda({
        ...dugacak,
        dani,
        metrike: Object.fromEntries(
          METRIKE.map((m) => [m, { ukupno: 0, poDanu: dani.map(() => 0) }]),
        ) as unknown as IzvestajAnalitike["metrike"],
      }),
    ).slice(0, -1);
    expect(redovi).toHaveLength(33);
  });
});

describe("csvRaspodele", () => {
  const raspodela: RaspodelaAnalitike = {
    period: { od: DANI[0], do: DANI[2], dana: 3 },
    dani: DANI,
    metrika: "detalji",
    dimenzija: "artikal",
    vrednosti: [
      { vrednost: "a1", naziv: "Pizza", ukupno: 9, poDanu: [4, 3, 2] },
      { vrednost: "a2", naziv: "Čevapi", ukupno: 6, poDanu: [0, 1, 5] },
    ],
    ostalo: { ukupno: 4, poDanu: [1, 0, 3] },
  };
  const naziv = (v: RaspodelaAnalitike["vrednosti"][number]) => v.naziv ?? v.vrednost;

  test("[csv] header is Datum, the value names, Ostalo, Ukupno", () => {
    const dokument = csvRaspodele(raspodela, naziv);
    expect(dokument.startsWith("﻿")).toBe(true);
    expect(dokument.endsWith("\r\n")).toBe(true);
    expect(linije(dokument)[0]).toBe("Datum;Pizza;Čevapi;Ostalo;Ukupno");
  });

  test("[csv] day rows list the counts and sum correctly", () => {
    const redovi = linije(csvRaspodele(raspodela, naziv));
    expect(redovi[1]).toBe("2026-10-19;4;0;1;5");
    expect(redovi[2]).toBe("2026-10-20;3;1;0;4");
    expect(redovi[3]).toBe("2026-10-21;2;5;3;10");
  });

  test("[csv] the total row holds the totals and their sum", () => {
    const redovi = linije(csvRaspodele(raspodela, naziv));
    expect(redovi[4]).toBe("Ukupno;9;6;4;19");
    // 3 day rows + header + total row (+ the empty tail after the last CRLF)
    expect(redovi).toHaveLength(6);
    expect(redovi[5]).toBe("");
  });

  test("[csv] the day totals add up to the grand total", () => {
    const redovi = linije(csvRaspodele(raspodela, naziv)).slice(1, 5).map((r) => r.split(";").map(Number));
    const zbirDana = redovi.slice(0, 3).reduce((zbir, r) => zbir + r.at(-1)!, 0);
    expect(zbirDana).toBe(redovi[3].at(-1));
  });

  test("[csv] an empty list of values still gives Datum, Ostalo, Ukupno", () => {
    const prazna: RaspodelaAnalitike = { ...raspodela, vrednosti: [], ostalo: { ukupno: 0, poDanu: [0, 0, 0] } };
    const redovi = linije(csvRaspodele(prazna, naziv));
    expect(redovi[0]).toBe("Datum;Ostalo;Ukupno");
    expect(redovi[1]).toBe("2026-10-19;0;0");
    expect(redovi[4]).toBe("Ukupno;0;0");
  });

  test("[csv] an article name that is a formula is neutralized", () => {
    const zlo: RaspodelaAnalitike = {
      ...raspodela,
      vrednosti: [{ vrednost: "a1", naziv: '=HYPERLINK("x")', ukupno: 1, poDanu: [1, 0, 0] }],
      ostalo: { ukupno: 0, poDanu: [0, 0, 0] },
    };
    const zaglavlje = linije(csvRaspodele(zlo, naziv))[0];
    expect(zaglavlje).toBe('Datum;"\'=HYPERLINK(""x"")";Ostalo;Ukupno');
    expect(zaglavlje).not.toContain(";=");
  });

  test.each(["=1+1", "+1", "-1", "@x"])("[csv] value name %j gets the apostrophe guard", (ime) => {
    const zlo: RaspodelaAnalitike = {
      ...raspodela,
      vrednosti: [{ vrednost: "a1", naziv: ime, ukupno: 1, poDanu: [1, 0, 0] }],
    };
    expect(linije(csvRaspodele(zlo, naziv))[0].split(";")[1]).toBe(`'${ime}`);
  });

  test("[csv] a name with ; or a quote is quoted so the columns stay aligned", () => {
    const cudno: RaspodelaAnalitike = {
      ...raspodela,
      vrednosti: [{ vrednost: "a1", naziv: 'Meso; "veliko"', ukupno: 1, poDanu: [1, 0, 0] }],
    };
    expect(linije(csvRaspodele(cudno, naziv))[0]).toBe('Datum;"Meso; ""veliko""";Ostalo;Ukupno');
  });

  test("[csv] the Ostalo and Ukupno labels can be overridden", () => {
    const dokument = csvRaspodele(raspodela, naziv, { ...menuAnalitikaSr.csv, ukupno: "Zbir" }, "Drugo");
    expect(linije(dokument)[0]).toBe("Datum;Pizza;Čevapi;Drugo;Zbir");
    expect(linije(dokument)[4].startsWith("Zbir;")).toBe(true);
  });
});

describe("imeCsvFajla", () => {
  const OD = "2026-09-22";
  const DO = "2026-10-21";

  test("[csv] period file: base, slug and dates", () => {
    expect(imeCsvFajla({ slug: "demo-restoran", od: OD, do: DO })).toBe(
      "scanme-analitika-demo-restoran-2026-09-22-2026-10-21.csv",
    );
  });

  test("[csv] breakdown file: metric and dimension at the end", () => {
    expect(imeCsvFajla({ slug: "demo-restoran", od: OD, do: DO, metrika: "otvaranja", dimenzija: "jezik" })).toBe(
      "scanme-analitika-demo-restoran-2026-09-22-2026-10-21-otvaranja-jezik.csv",
    );
  });

  test("[csv] without a slug, or with only a metric", () => {
    expect(imeCsvFajla({ od: OD, do: DO })).toBe("scanme-analitika-2026-09-22-2026-10-21.csv");
    expect(imeCsvFajla({ od: OD, do: DO, metrika: "detalji" })).toBe("scanme-analitika-2026-09-22-2026-10-21-detalji.csv");
  });

  test("[csv] camelCase metric names are lower-cased and kept", () => {
    expect(imeCsvFajla({ od: OD, do: DO, metrika: "zahteviOtkazani", dimenzija: "ko" })).toBe(
      "scanme-analitika-2026-09-22-2026-10-21-zahteviotkazani-ko.csv",
    );
  });

  test("[csv] Serbian characters in the slug are stripped to -", () => {
    expect(imeCsvFajla({ slug: "Čokolada Šećer", od: OD, do: DO })).toBe(
      "scanme-analitika-okolada-e-er-2026-09-22-2026-10-21.csv",
    );
  });

  test("[csv] a slug with nothing safe in it is left out", () => {
    expect(imeCsvFajla({ slug: "čćžšđ", od: OD, do: DO })).toBe("scanme-analitika-2026-09-22-2026-10-21.csv");
    expect(imeCsvFajla({ slug: "", od: OD, do: DO })).toBe("scanme-analitika-2026-09-22-2026-10-21.csv");
  });

  test("[csv] path characters and spaces never get through", () => {
    const ime = imeCsvFajla({ slug: '../..\\Moj "Lokal"; rm -rf /', od: OD, do: DO, metrika: "a/b", dimenzija: "c d" });
    expect(ime).toMatch(/^[a-z0-9-]+\.csv$/);
    expect(ime).toBe("scanme-analitika-moj-lokal-rm--rf-2026-09-22-2026-10-21-a-b-c-d.csv");
  });

  test("[csv] only safe characters, always ending in .csv", () => {
    for (const slug of ["demo", "Demo Restoran 2", "a_b.c", "ŽŽŽ", "x--y", "-x-"]) {
      expect(imeCsvFajla({ slug, od: OD, do: DO, metrika: "otvaranja", dimenzija: "sat" })).toMatch(/^[a-z0-9-]+\.csv$/);
    }
  });

  test("[csv] a custom base name is used", () => {
    expect(imeCsvFajla({ od: OD, do: DO }, "izvoz")).toBe("izvoz-2026-09-22-2026-10-21.csv");
  });
});
