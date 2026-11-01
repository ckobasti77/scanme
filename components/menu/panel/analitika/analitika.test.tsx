// K30 render tests of the Analitika section of the ScanMe Menu client panel
// (master §13, §14; docs/menu/ANALITIKA-DEFINICIJA.md §5). No DOM in the
// edge-runtime environment: the screen is checked as renderToStaticMarkup
// strings. The rule under test: every number of the screen is a `data-broj`
// that points (aria-describedby) to a sentence of the dictionary that says what
// is counted; too little data shows numbers and a plain message, never a
// percentage; the charts have a table; nothing says how long a request waited.
// Invented data only (fixtures/analitika.ts).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  fixtureIzvestaj,
  fixtureRaspodela,
  IZLOG_DANAS,
  type AnalitikaFixtureStanje,
} from "@/components/menu/fixtures/analitika";
import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import type { IzvestajAnalitike, RaspodelaAnalitike } from "@/lib/menu/analitika/izvestaj";
import {
  formatBroj,
  METRIKE_TRENDA,
  periodIzbora,
  type AnalitikaPlan,
  type IzborPerioda,
  type MetrikaTrenda,
} from "@/lib/menu/analitika/prikaz";
import { poredi } from "@/lib/menu/analitika/period";
import { AnalitikaEkran } from "./analitika";
import { csvSadrzaj } from "./csv-dugme";
import { stavkeRaspodele, type IzborRaspodele } from "./raspodela";

const t = menuAnalitikaSr;
const BOM = String.fromCharCode(0xfeff);
const NOOP = () => {};

// --- Helpers -------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The visible text of some markup. */
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** Where a block's markup starts (the tag that carries its marker) and ends (the tag of the next block, or the end). */
function granice(html: string, ime: string): [number, number] {
  const oznaka = `data-blok="${ime}"`;
  const at = html.indexOf(oznaka);
  if (at < 0) throw new Error(`no block ${ime}`);
  const sledeci = html.indexOf('data-blok="', at + oznaka.length);
  return [html.lastIndexOf("<", at), sledeci < 0 ? html.length : html.lastIndexOf("<", sledeci)];
}

const imaBlok = (html: string, ime: string) => html.includes(`data-blok="${ime}"`);

function blok(html: string, ime: string): string {
  const [od, do_] = granice(html, ime);
  return html.slice(od, do_);
}

/** The markup without one block (the block must be the one that closes the screen or be followed by another). */
function bezBloka(html: string, ime: string): string {
  const [od, do_] = granice(html, ime);
  return html.slice(0, od) + html.slice(do_);
}

type Broj = { kljuc: string; opis: string | undefined; vrednost: number; tekst: string };

/** Every number of the screen: the `data-broj` elements. */
function brojevi(html: string): Broj[] {
  return [...html.matchAll(/<data\b([^>]*)>([^<]*)<\/data>/g)].map((match) => ({
    kljuc: attr(match[1], "data-broj") ?? "",
    opis: attr(match[1], "aria-describedby"),
    vrednost: Number(attr(match[1], "value")),
    tekst: unesc(match[2]),
  }));
}

/** The explanation sentences (`data-objasnjenje`) by id. */
function objasnjenja(html: string): Map<string, string> {
  const izlaz = new Map<string, string>();
  for (const match of html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    if (!/\sdata-objasnjenje=/.test(match[1])) continue;
    izlaz.set(attr(match[1], "id") ?? "", tekst(match[2]));
  }
  return izlaz;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A dictionary template with its `{placeholders}` as `.+`. */
const sablonRegex = (sablon: string) =>
  new RegExp(`^${sablon.split(/\{\w+\}/).map(escapeRegex).join(".+")}$`);

/** Every sentence an explanation may say (docs/menu/ANALITIKA-DEFINICIJE.md §5 in plain language). */
const OBJASNJENJA: readonly string[] = [
  ...Object.values(t.metrike).map((m) => m.objasnjenje),
  ...Object.values(t.zahtevi.objasnjenja),
  t.zahtevi.udeoObjasnjenje,
  t.zahtevi.otkazaliObjasnjenje,
  t.zahtevi.roomServiceObjasnjenje,
  ...Object.values(t.rezervacije.stavke).map((s) => s.objasnjenje),
  t.rezervacije.udeoObjasnjenje,
  t.rezervacije.otkazaliObjasnjenje,
  t.najotvaraniji.opis,
  t.kartice.opis,
  ...Object.values(t.tok.koraci).map((k) => k.objasnjenje),
  t.pocetna.najotvaranijiObjasnjenje,
  t.kasnjenje,
];
const OBJASNJENJA_SABLONI = [t.poredjenje.objasnjenje, t.raspodela.objasnjenje].map(sablonRegex);

const jeObjasnjenje = (rec: string) => OBJASNJENJA.includes(rec) || OBJASNJENJA_SABLONI.some((re) => re.test(rec));

/** Every number has an explanation: described-by exists exactly once, on a `data-objasnjenje` element with a dictionary sentence. */
function proveriObjasnjenja(html: string, prefiks: string): Broj[] {
  const lista = brojevi(html);
  const obj = objasnjenja(html);
  expect(lista.length).toBeGreaterThan(0);
  for (const broj of lista) {
    const ime = `${broj.kljuc} (${broj.opis})`;
    expect(broj.kljuc, ime).not.toBe("");
    expect(broj.opis, ime).toBeTruthy();
    expect(broj.opis!.startsWith(prefiks), ime).toBe(true);
    expect(count(html, `id="${broj.opis}"`), ime).toBe(1);
    const recenica = obj.get(broj.opis!);
    expect(recenica, ime).toBeTruthy();
    expect(jeObjasnjenje(recenica!), `${ime}: "${recenica}"`).toBe(true);
  }
  return lista;
}

/** The text of the element with this id (up to its closing tag). */
function tekstPoId(html: string, id: string): string | undefined {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return undefined;
  const start = html.lastIndexOf("<", at);
  const ime = /^<(\w+)/.exec(html.slice(start))?.[1] ?? "p";
  return tekst(html.slice(html.indexOf(">", at) + 1, html.indexOf(`</${ime}>`, at)));
}

/** The radio inputs of the period choice. */
function radiji(html: string) {
  return [...html.matchAll(/<input\b([^>]*)>/g)]
    .map((match) => match[1])
    .filter((tag) => attr(tag, "type") === "radio" && ["d7", "d30", "d90", "izbor"].includes(attr(tag, "value") ?? ""))
    .map((tag) => ({
      vrednost: attr(tag, "value") as string,
      disabled: /\sdisabled(=|\s|$)/.test(tag),
      checked: /\schecked(=|\s|$)/.test(tag),
      opis: attr(tag, "aria-describedby"),
    }));
}

// --- The screen under test ---------------------------------------------------------

type Opcije = {
  plan?: AnalitikaPlan;
  izbor?: IzborPerioda;
  stanje?: AnalitikaFixtureStanje;
  /** Absent = the fixture; undefined = loading; null = failed. */
  izvestaj?: IzvestajAnalitike | null;
  trend?: MetrikaTrenda;
  raspodela?: IzborRaspodele;
  paketHref?: string | null;
};

const D7: IzborPerioda = { vrsta: "d7" };
const D30: IzborPerioda = { vrsta: "d30" };
const D90: IzborPerioda = { vrsta: "d90" };
const JEZIK: IzborRaspodele = { metrika: "otvaranja", dimenzija: "jezik" };
const KARTICA: IzborRaspodele = { metrika: "skenovi", dimenzija: "kartica" };

function izvestajZa(opcije: Pick<Opcije, "plan" | "izbor" | "stanje">): IzvestajAnalitike {
  return fixtureIzvestaj({
    period: periodIzbora(opcije.izbor ?? D30, IZLOG_DANAS),
    stanje: opcije.stanje ?? "puno",
    premium: opcije.plan === "premium",
  });
}

function prikazi(opcije: Opcije = {}): string {
  const plan = opcije.plan ?? "standard";
  const izbor = opcije.izbor ?? D30;
  const stanje = opcije.stanje ?? "puno";
  const raspodela = opcije.raspodela ?? { metrika: "otvaranja", dimenzija: null };
  const izvestaj = "izvestaj" in opcije ? opcije.izvestaj : izvestajZa({ plan, izbor, stanje });
  const raspodelaPodaci =
    plan === "premium" && raspodela.dimenzija
      ? fixtureRaspodela({ period: periodIzbora(izbor, IZLOG_DANAS), stanje, metrika: raspodela.metrika, dimenzija: raspodela.dimenzija })
      : undefined;
  return renderToStaticMarkup(
    <AnalitikaEkran
      plan={plan}
      danas={IZLOG_DANAS}
      izbor={izbor}
      onIzbor={NOOP}
      izvestaj={izvestaj}
      trend={opcije.trend ?? "otvaranja"}
      onTrend={NOOP}
      raspodela={raspodela}
      onRaspodela={NOOP}
      raspodelaPodaci={raspodelaPodaci}
      slug="demo-restoran"
      paketHref={"paketHref" in opcije ? (opcije.paketHref as string | null) : "/x/podesavanja"}
    />,
  );
}

/** The report of a state with the sessions replaced (a venue with that many sessions). */
function saSesijama(opcije: Pick<Opcije, "plan" | "izbor" | "stanje">, broj: number | null): IzvestajAnalitike {
  const izvestaj = izvestajZa(opcije);
  return { ...izvestaj, sesije: { ...izvestaj.sesije, broj } };
}

/** What no screen state may contain: a percentage outside the sentences that explain how things are counted. */
function vidljivoBezObjasnjenja(html: string): string {
  let ostalo = bezBloka(html, "kako-brojimo");
  ostalo = ostalo.replace(/<p\b[^>]*\sdata-objasnjenje=[^>]*>[\s\S]*?<\/p>/g, "");
  ostalo = ostalo.replace(/<div data-stanje="malo-podataka"[\s\S]*?<\/p><\/div><\/div>/, "");
  return tekst(ostalo);
}

/** Every state of the screen, for the checks that must hold everywhere. */
const SVA_STANJA: { naziv: string; html: () => string }[] = [
  { naziv: "standard puno d7", html: () => prikazi({ izbor: D7 }) },
  { naziv: "standard puno d30", html: () => prikazi() },
  { naziv: "standard malo-podataka", html: () => prikazi({ stanje: "malo-podataka" }) },
  { naziv: "standard prazno", html: () => prikazi({ stanje: "prazno" }) },
  { naziv: "standard bez-sesija", html: () => prikazi({ stanje: "bez-sesija" }) },
  { naziv: "premium puno d30 jezik", html: () => prikazi({ plan: "premium", raspodela: JEZIK }) },
  { naziv: "premium puno d90 kartica", html: () => prikazi({ plan: "premium", izbor: D90, raspodela: KARTICA }) },
  { naziv: "premium malo-podataka", html: () => prikazi({ plan: "premium", stanje: "malo-podataka", raspodela: JEZIK }) },
  { naziv: "premium prazno", html: () => prikazi({ plan: "premium", stanje: "prazno" }) },
  { naziv: "premium bez-sesija", html: () => prikazi({ plan: "premium", stanje: "bez-sesija", raspodela: JEZIK }) },
  { naziv: "ucitavanje", html: () => prikazi({ izvestaj: undefined }) },
  { naziv: "greska", html: () => prikazi({ izvestaj: null }) },
];

// --- 1. Every number explains itself -------------------------------------------------

describe("Analitika: every number has its explanation", () => {
  test("[objasnjenje] svaka prikazana brojka ima objašnjenje iz definicija", () => {
    const slucajevi: { naziv: string; html: string; najmanje: number }[] = [
      { naziv: "standard puno d7", html: prikazi({ izbor: D7 }), najmanje: 30 },
      { naziv: "standard puno d30", html: prikazi({ izbor: D30 }), najmanje: 30 },
      { naziv: "premium puno d30 jezik", html: prikazi({ plan: "premium", raspodela: JEZIK }), najmanje: 30 },
      { naziv: "premium puno d7 kartica", html: prikazi({ plan: "premium", izbor: D7, raspodela: KARTICA }), najmanje: 30 },
      { naziv: "premium puno d90 kartica", html: prikazi({ plan: "premium", izbor: D90, raspodela: KARTICA }), najmanje: 30 },
      { naziv: "premium bez-sesija", html: prikazi({ plan: "premium", stanje: "bez-sesija", raspodela: JEZIK }), najmanje: 20 },
      { naziv: "standard malo-podataka", html: prikazi({ stanje: "malo-podataka" }), najmanje: 10 },
      { naziv: "premium malo-podataka", html: prikazi({ plan: "premium", stanje: "malo-podataka", raspodela: JEZIK }), najmanje: 10 },
    ];
    for (const slucaj of slucajevi) {
      const lista = proveriObjasnjenja(slucaj.html, "an-obj-");
      expect(lista.length, slucaj.naziv).toBeGreaterThan(slucaj.najmanje);
    }
  });

  test("[objasnjenje] i kad se prati zahtevi ili rezervacije, grafikon ima svoje objašnjenje", () => {
    for (const metrika of METRIKE_TRENDA) {
      for (const plan of ["standard", "premium"] as const) {
        const html = prikazi({ plan, trend: metrika });
        proveriObjasnjenja(html, "an-obj-");
        expect(html).toContain(`data-grafikon="trend-${metrika}"`);
      }
    }
  });

  test("[objasnjenje] brojka vodi do rečenice koja pripada baš njoj", () => {
    const html = prikazi({ plan: "premium", raspodela: JEZIK });
    const obj = objasnjenja(html);
    const lista = brojevi(html);
    const recenica = (kljuc: string) => obj.get(lista.find((b) => b.kljuc === kljuc)?.opis ?? "");
    expect(recenica("otvaranja")).toBe(t.metrike.otvaranja.objasnjenje);
    expect(recenica("detalji")).toBe(t.metrike.detalji.objasnjenje);
    expect(recenica("skenovi")).toBe(t.metrike.skenovi.objasnjenje);
    expect(recenica("sesije")).toBe(t.metrike.sesije.objasnjenje);
    expect(recenica("zahtevi-call-poslato")).toBe(t.zahtevi.objasnjenja.poslato);
    expect(recenica("zahtevi-ukupno-zavrseno")).toBe(t.zahtevi.objasnjenja.zavrseno);
    expect(recenica("zahtevi-udeo")).toBe(t.zahtevi.udeoObjasnjenje);
    expect(recenica("rezervacije-realizovano")).toBe(t.rezervacije.stavke.realizovano.objasnjenje);
    expect(recenica("rezervacije-udeo")).toBe(t.rezervacije.udeoObjasnjenje);
    expect(recenica("tok-detalj")).toBe(t.tok.koraci.detalj.objasnjenje);
    expect(recenica("tok-sesije")).toBe(t.tok.koraci.sesije.objasnjenje);
    expect(recenica("najotvaraniji-ar_cevapi01")).toBe(t.najotvaraniji.opis);
    expect(recenica("kartice-card_demo_04")).toBe(t.kartice.opis);
    expect(recenica("otvaranja-poredjenje-razlika")).toMatch(/^Poređenje je sa istim brojem dana/);
    expect(recenica("raspodela-sr")).toBe(
      fmt(t.raspodela.objasnjenje, { metrika: t.raspodela.metrike.otvaranja, dimenzija: t.raspodela.dimenzije.jezik }),
    );
  });
});

// --- 2. Too little data ---------------------------------------------------------------

describe("Analitika: too little data", () => {
  test("[malo-podataka] ispod 20 sesija nema procenata nego jasna poruka", () => {
    for (const plan of ["standard", "premium"] as const) {
      const html = prikazi({ plan, stanje: "malo-podataka", raspodela: plan === "premium" ? JEZIK : undefined });
      const izvestaj = izvestajZa({ plan, stanje: "malo-podataka" });
      // The fixture really is "less than 20 sessions", with numbers to show.
      expect(izvestaj.sesije.broj ?? Infinity).toBeLessThan(20);
      expect(izvestaj.metrike.otvaranja.ukupno).toBeGreaterThan(0);

      const text = tekst(html);
      expect(text).toContain(t.stanja.maloNaslov);
      expect(text).toContain(t.stanja.maloOpis);
      expect(html).toContain('data-stanje="malo-podataka"');
      expect(count(html, 'data-stanje="malo-podataka"')).toBe(1);

      const kljucevi = brojevi(html).map((b) => b.kljuc);
      expect(kljucevi.length).toBeGreaterThan(10);
      expect(kljucevi.filter((k) => k.endsWith("-udeo") || k.endsWith("-promena"))).toEqual([]);
      expect(vidljivoBezObjasnjenja(html)).not.toContain("%");
      expect(vidljivoBezObjasnjenja(html).length).toBeGreaterThan(200);
    }
  });

  test("[malo-podataka] Premium: poređenje je u rečima, raspodela i tok bez procenata", () => {
    // The previous period of the fixture is empty (no comparison, said once); give it a few opens so the line shows.
    const osnova = izvestajZa({ plan: "premium", stanje: "malo-podataka" });
    const prethodni = osnova.prethodni!;
    const izvestaj: IzvestajAnalitike = {
      ...osnova,
      prethodni: {
        ...prethodni,
        ukupno: { ...prethodni.ukupno, otvaranja: 5 },
        poredjenje: { ...prethodni.poredjenje, otvaranja: poredi(osnova.metrike.otvaranja.ukupno, 5) },
      },
    };
    const html = prikazi({ plan: "premium", stanje: "malo-podataka", raspodela: JEZIK, izvestaj });
    expect(html).toContain("data-promena=");
    expect(brojevi(html).some((b) => b.kljuc === "otvaranja-poredjenje-razlika")).toBe(true);
    expect(imaBlok(html, "raspodela")).toBe(true);
    expect(brojevi(blok(html, "raspodela")).length).toBeGreaterThan(0);
    expect(tekst(blok(html, "raspodela"))).not.toContain("od ukupno");
    expect(vidljivoBezObjasnjenja(html)).not.toContain("%");
  });

  test("[malo-podataka] kad ima 20 sesija i dovoljno zahteva i rezervacija, procenat se vidi", () => {
    for (const plan of ["standard", "premium"] as const) {
      const opcije = { plan, izbor: D30 } as const;
      const html = prikazi({ ...opcije, izvestaj: saSesijama(opcije, 20) });
      const lista = brojevi(html);
      const zahtevi = lista.find((b) => b.kljuc === "zahtevi-udeo");
      const rezervacije = lista.find((b) => b.kljuc === "rezervacije-udeo");
      expect(zahtevi).toBeDefined();
      expect(rezervacije).toBeDefined();
      expect(zahtevi!.tekst).toMatch(/^\d+(,\d)?%$/);
      expect(rezervacije!.tekst).toMatch(/^\d+(,\d)?%$/);
      expect(html).not.toContain('data-stanje="malo-podataka"');
      expect(tekst(html)).not.toContain(t.stanja.maloNaslov);
    }
    const premium = prikazi({ plan: "premium", izvestaj: saSesijama({ plan: "premium", izbor: D30 }, 20), raspodela: JEZIK });
    expect(brojevi(premium).some((b) => b.kljuc.endsWith("-promena") && b.tekst.endsWith("%"))).toBe(true);
    expect(brojevi(premium).some((b) => b.kljuc.startsWith("tok-") && b.kljuc.endsWith("-udeo"))).toBe(true);
    expect(brojevi(premium).some((b) => b.kljuc.startsWith("raspodela-") && b.kljuc.endsWith("-udeo"))).toBe(true);
  });

  test("[malo-podataka] 19 sesija je još malo, 20 je dovoljno", () => {
    const opcije = { izbor: D30 } as const;
    expect(brojevi(prikazi({ ...opcije, izvestaj: saSesijama(opcije, 19) })).some((b) => b.kljuc.endsWith("-udeo"))).toBe(false);
    expect(brojevi(prikazi({ ...opcije, izvestaj: saSesijama(opcije, 20) })).some((b) => b.kljuc.endsWith("-udeo"))).toBe(true);
  });

  test("[malo-podataka] 500 otvaranja meni a 12 sesija je i dalje malo: nema procenta", () => {
    for (const plan of ["standard", "premium"] as const) {
      const osnova = saSesijama({ plan, izbor: D30 }, 12);
      const izvestaj: IzvestajAnalitike = {
        ...osnova,
        metrike: { ...osnova.metrike, otvaranja: { ukupno: 500, poDanu: osnova.metrike.otvaranja.poDanu } },
      };
      const html = prikazi({ plan, izvestaj });
      expect(html).toContain('data-stanje="malo-podataka"');
      expect(tekst(html)).toContain(t.stanja.maloNaslov);
      expect(brojevi(html).filter((b) => b.kljuc.endsWith("-udeo") || b.kljuc.endsWith("-promena"))).toEqual([]);
      expect(vidljivoBezObjasnjenja(html)).not.toContain("%");
      // The 500 is still a number of the screen.
      expect(brojevi(html).find((b) => b.kljuc === "otvaranja")?.tekst).toBe("500");
    }
  });
});

// --- 3. Empty ---------------------------------------------------------------------------

describe("Analitika: empty period", () => {
  test("says nothing is counted yet: no number, and on Standard still the Premium card", () => {
    const standard = prikazi({ stanje: "prazno" });
    expect(tekst(standard)).toContain(t.stanja.praznoNaslov);
    expect(tekst(standard)).toContain(t.stanja.praznoOpis);
    expect(brojevi(standard)).toEqual([]);
    expect(standard).not.toContain("data-broj=");
    expect(standard).not.toContain('data-stanje="malo-podataka"');
    expect(imaBlok(standard, "premium")).toBe(true);
    expect(imaBlok(standard, "kako-brojimo")).toBe(true);
    expect(imaBlok(standard, "trend")).toBe(false);
    expect(imaBlok(standard, "zahtevi")).toBe(false);

    const premium = prikazi({ plan: "premium", stanje: "prazno" });
    expect(tekst(premium)).toContain(t.stanja.praznoNaslov);
    expect(brojevi(premium)).toEqual([]);
    expect(imaBlok(premium, "premium")).toBe(false);
  });

  test("the period and its choices are still there", () => {
    const html = prikazi({ stanje: "prazno" });
    expect(radiji(html).map((r) => r.vrednost)).toEqual(["d7", "d30", "d90", "izbor"]);
    expect(tekst(html)).toContain(t.period.prikazano.split(":")[0] + ":");
    expect(tekst(html)).toContain(t.kasnjenje);
  });
});

// --- 4. Standard locks --------------------------------------------------------------------

describe("Analitika: Standard", () => {
  test("90 days and a period of your own are visible, disabled, and point to the reason", () => {
    const html = prikazi({ plan: "standard", izbor: D7 });
    const lista = radiji(html);
    expect(lista.map((r) => r.vrednost)).toEqual(["d7", "d30", "d90", "izbor"]);
    const poVrednosti = Object.fromEntries(lista.map((r) => [r.vrednost, r]));
    expect(poVrednosti.d7).toMatchObject({ disabled: false, checked: true });
    expect(poVrednosti.d30).toMatchObject({ disabled: false, checked: false });
    for (const zakljucano of ["d90", "izbor"]) {
      expect(poVrednosti[zakljucano].disabled).toBe(true);
      const opis = poVrednosti[zakljucano].opis;
      expect(opis).toBeTruthy();
      expect(count(html, `id="${opis}"`)).toBe(1);
      expect(tekstPoId(html, opis!)).toBe(t.period.zakljucano);
    }
    expect(poVrednosti.d7.opis).toBeUndefined();
    expect(poVrednosti.d30.opis).toBeUndefined();
    expect(count(html, "data-zakljucano")).toBe(2);
  });

  test("the CSV button is there, disabled, with the reason", () => {
    const html = prikazi({ plan: "standard" });
    const csv = /<div data-csv="zakljucano"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];
    expect(csv).toBeDefined();
    const dugme = /<button\b([^>]*)>([\s\S]*?)<\/button>/.exec(csv!);
    expect(dugme).not.toBeNull();
    expect(dugme![1]).toMatch(/\sdisabled(=|\s|$)/);
    expect(tekst(dugme![2])).toBe(t.csv.dugme);
    const opis = attr(dugme![1], "aria-describedby");
    expect(opis).toBeTruthy();
    expect(tekstPoId(html, opis!)).toBe(t.csv.zakljucano);
    expect(html).not.toContain('data-csv="dostupno"');
  });

  test("the Premium card lists everything Premium adds, with a link to the package", () => {
    const html = prikazi({ plan: "standard" });
    const kartica = blok(html, "premium");
    const text = tekst(kartica);
    expect(text).toContain(t.premium.naslov);
    expect(text).toContain(t.premium.opis);
    expect(count(kartica, "<li")).toBe(t.premium.stavke.length);
    for (const stavka of t.premium.stavke) expect(text).toContain(stavka);
    expect(text).toContain(t.premium.razlog);
    expect(kartica).toContain('href="/x/podesavanja"');
    expect(text).toContain(t.premium.paket);
    // A role that cannot open Podešavanja gets the sentence and no link.
    const bezVeze = blok(prikazi({ plan: "standard", paketHref: null }), "premium");
    expect(bezVeze).not.toContain("<a ");
    expect(tekst(bezVeze)).toContain(t.premium.razlog);
  });

  test("no guest flow, no breakdown, no comparison", () => {
    for (const izbor of [D7, D30]) {
      const html = prikazi({ plan: "standard", izbor });
      expect(imaBlok(html, "tok")).toBe(false);
      expect(imaBlok(html, "raspodela")).toBe(false);
      expect(html).not.toContain("data-promena");
      expect(brojevi(html).filter((b) => b.kljuc.includes("poredjenje"))).toEqual([]);
      expect(html).not.toContain('id="an-obj-poredjenje"');
      expect(imaBlok(html, "premium")).toBe(true);
    }
  });

  test("the blocks of the screen, in order", () => {
    const html = prikazi();
    const redom = ["trend", "zahtevi", "rezervacije", "najotvaraniji", "kartice", "premium", "kako-brojimo"];
    const mesta = redom.map((ime) => html.indexOf(`data-blok="${ime}"`));
    expect(mesta.every((mesto) => mesto > 0)).toBe(true);
    expect(mesta).toEqual([...mesta].sort((a, b) => a - b));
    expect(html.indexOf("<h1")).toBeLessThan(mesta[0]);
  });
});

// --- 5. Premium -----------------------------------------------------------------------------

describe("Analitika: Premium", () => {
  test("nothing is locked: every period, the CSV button, the guest flow and the breakdown", () => {
    const html = prikazi({ plan: "premium", izbor: D90, raspodela: JEZIK });
    const lista = radiji(html);
    expect(lista.map((r) => r.vrednost)).toEqual(["d7", "d30", "d90", "izbor"]);
    expect(lista.every((r) => !r.disabled && r.opis === undefined)).toBe(true);
    expect(lista.find((r) => r.checked)?.vrednost).toBe("d90");
    expect(html).not.toContain("data-zakljucano");
    expect(tekst(html)).not.toContain(t.period.zakljucano);
    expect(tekst(html)).not.toContain(t.csv.zakljucano);
    expect(imaBlok(html, "premium")).toBe(false);

    const csv = /<div data-csv="dostupno"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];
    expect(csv).toBeDefined();
    const dugme = /<button\b([^>]*)>([\s\S]*?)<\/button>/.exec(csv!);
    expect(dugme![1]).not.toMatch(/\sdisabled(=|\s|$)/);
    expect(tekst(dugme![2])).toBe(t.csv.dugme);
    expect(tekstPoId(html, attr(dugme![1], "aria-describedby")!)).toBe(t.csv.opis);
    expect(html).not.toContain('data-csv="zakljucano"');

    expect(imaBlok(html, "tok")).toBe(true);
    expect(imaBlok(html, "raspodela")).toBe(true);
  });

  test("the CSV button waits for the report", () => {
    const html = prikazi({ plan: "premium", izvestaj: undefined });
    const dugme = /<div data-csv="dostupno"[^>]*>[\s\S]*?<button\b([^>]*)>/.exec(html)?.[1];
    expect(dugme).toMatch(/\sdisabled(=|\s|$)/);
  });

  test("every number can be compared with the previous period, in words, explained once", () => {
    const html = prikazi({ plan: "premium", izbor: D7 });
    const redovi = [...html.matchAll(/<p data-promena="(vise|manje|isto)"[^>]*>([\s\S]*?)<\/p>/g)];
    expect(redovi.length).toBeGreaterThanOrEqual(5);
    for (const red of redovi) expect(tekst(red[2])).toMatch(/prethodnih 7 dana/);
    const obj = objasnjenja(html).get("an-obj-poredjenje");
    expect(obj).toBeDefined();
    expect(sablonRegex(t.poredjenje.objasnjenje).test(obj!)).toBe(true);
    expect(count(html, 'id="an-obj-poredjenje"')).toBe(1);
    // Every comparison number points to it.
    const poredjenja = brojevi(html).filter((b) => b.kljuc.includes("-poredjenje-"));
    expect(poredjenja.length).toBeGreaterThan(0);
    expect(poredjenja.every((b) => b.opis === "an-obj-poredjenje")).toBe(true);
  });

  test("a comparison of 'isto' says so with no number", () => {
    const izvestaj = izvestajZa({ plan: "premium", izbor: D7 });
    const jednako: IzvestajAnalitike = {
      ...izvestaj,
      prethodni: {
        ...izvestaj.prethodni!,
        poredjenje: { ...izvestaj.prethodni!.poredjenje, otvaranja: { razlika: 0, procenat: null } },
      },
    };
    const html = prikazi({ plan: "premium", izbor: D7, izvestaj: jednako });
    expect(tekst(html)).toContain(fmt(t.poredjenje.isto, { dana: 7 }));
    expect(brojevi(html).some((b) => b.kljuc.startsWith("otvaranja-poredjenje"))).toBe(false);
  });

  test("[poredjenje] Poslati zahtevi and Zahtevi za rezervaciju lines say what they compare", () => {
    const html = prikazi({ plan: "premium", izbor: D7 });
    const zahtevi = tekst(blok(html, "zahtevi"));
    const rezervacije = tekst(blok(html, "rezervacije"));
    expect(zahtevi).toContain(`${t.poredjenje.zahtevi} `);
    expect(rezervacije).toContain(`${t.poredjenje.rezervacije} `);
  });

  test("[poredjenje] a previous period with no data at all says so once, instead of comparison lines", () => {
    // The 'malo-podataka' fixture counts only the last four days, so the 30 days before are empty.
    const html = prikazi({ plan: "premium", stanje: "malo-podataka" });
    const izvestaj = izvestajZa({ plan: "premium", stanje: "malo-podataka" });
    expect(html).toContain('data-poredjenje="nema"');
    expect(count(html, 'data-poredjenje="nema"')).toBe(1);
    const recenica = tekst(/data-poredjenje="nema"[^>]*>([\s\S]*?)<\/p>/.exec(html)![1]);
    expect(sablonRegex(t.poredjenje.nemaPrethodnog).test(recenica)).toBe(true);
    expect(izvestaj.prethodni).not.toBeNull();
    expect(html).not.toContain("data-promena");
    expect(html).not.toContain('id="an-obj-poredjenje"');
    expect(brojevi(html).filter((b) => b.kljuc.includes("-poredjenje-"))).toEqual([]);
    // Every number that remains still has its explanation.
    proveriObjasnjenja(html, "an-obj-");
  });

  test("[poredjenje] a metric that counted 0 in the previous period has no comparison line, the others keep theirs", () => {
    const osnova = izvestajZa({ plan: "premium", izbor: D7 });
    const prethodni = osnova.prethodni!;
    const izvestaj: IzvestajAnalitike = {
      ...osnova,
      prethodni: { ...prethodni, ukupno: { ...prethodni.ukupno, skenovi: 0 }, poredjenje: { ...prethodni.poredjenje, skenovi: poredi(osnova.metrike.skenovi.ukupno, 0) } },
    };
    const lista = brojevi(prikazi({ plan: "premium", izbor: D7, izvestaj })).map((b) => b.kljuc);
    expect(lista).not.toContain("skenovi-poredjenje-razlika");
    expect(lista).toContain("otvaranja-poredjenje-razlika");
  });

  test("[bez-sesija] the guest flow and the Sesije tile say that sessions are not measured", () => {
    const html = prikazi({ plan: "premium", stanje: "bez-sesija", raspodela: JEZIK });
    const tok = blok(html, "tok");
    expect(tekst(tok)).toContain(t.tok.nedostupno);
    expect(tok).toContain('data-tok="nedostupno"');
    expect(brojevi(tok)).toEqual([]);

    const sesije = /<section\b[^>]*data-pokazatelj="sesije"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(sesije).not.toBe("");
    expect(tekst(sesije)).toContain(t.sesije.nedostupno);
    expect(tekst(sesije)).toContain(t.sesije.neMere);
    expect(sesije).toContain('data-sesije="nedostupno"');
    expect(brojevi(sesije)).toEqual([]);
    expect(brojevi(html).some((b) => b.kljuc === "sesije")).toBe(false);
    // The other three tiles still count.
    for (const kljuc of ["otvaranja", "detalji", "skenovi"]) expect(brojevi(html).some((b) => b.kljuc === kljuc)).toBe(true);
  });

  test("[bez-sesija] Standard's Sesije tile says the same, and nothing else is hidden", () => {
    const html = prikazi({ plan: "standard", stanje: "bez-sesija" });
    const sesije = /<section\b[^>]*data-pokazatelj="sesije"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(tekst(sesije)).toContain(t.sesije.nedostupno);
    expect(tekst(sesije)).toContain(t.sesije.neMere);
    expect(imaBlok(html, "zahtevi")).toBe(true);
  });

  test("sessions that carry an id on too few opens are 'nepouzdane', with their own sentence", () => {
    const html = prikazi({ plan: "standard", izvestaj: { ...izvestajZa({}), sesije: { broj: null, pokrivenost: 0.5 } } });
    expect(tekst(html)).toContain(t.sesije.nepouzdane);
    expect(tekst(html)).not.toContain(t.sesije.neMere);
  });

  test("the guest flow shows each step as a count, with shares only with enough sessions", () => {
    const html = prikazi({ plan: "premium" });
    const tok = blok(html, "tok");
    const kljucevi = brojevi(tok).map((b) => b.kljuc);
    expect(kljucevi).toEqual(
      expect.arrayContaining(["tok-sesije", "tok-detalj", "tok-zahtev", "tok-porudzbina", "tok-rezervacija"]),
    );
    expect(kljucevi).toContain("tok-detalj-udeo");
    expect(kljucevi).not.toContain("tok-sesije-udeo");
    for (const korak of Object.values(t.tok.koraci)) expect(tekst(tok)).toContain(korak.naziv);
  });
});

// --- 6. Charts have a text equivalent -----------------------------------------------------------

describe("Analitika: charts", () => {
  function grafikon(html: string, kljuc: string) {
    const od = html.indexOf(`<figure data-grafikon="${kljuc}"`);
    expect(od).toBeGreaterThanOrEqual(0);
    return html.slice(od, html.indexOf("</figure>", od) + "</figure>".length);
  }

  function proveriGrafikon(opcije: Opcije, metrika: MetrikaTrenda, dana: number) {
    const html = prikazi({ ...opcije, trend: metrika });
    const izvestaj = izvestajZa(opcije);
    const slika = grafikon(html, `trend-${metrika}`);
    const niz = izvestaj.metrike[metrika].poDanu;
    expect(izvestaj.dani).toHaveLength(dana);

    // The picture is one labelled image with the metric's name; the numbers are in the table.
    const img = /<div role="img" aria-label="([^"]*)"/.exec(slika);
    expect(img).not.toBeNull();
    const oznaka = unesc(img![1]);
    expect(oznaka).toContain(t.metrike[metrika].naziv);
    expect(oznaka).toContain(`ukupno ${formatBroj(niz.reduce((a, b) => a + b, 0))}`);
    expect(oznaka).toContain(`Najviše ${formatBroj(Math.max(...niz))}`);

    expect(count(slika, "<table")).toBe(1);
    const telo = /<tbody>([\s\S]*?)<\/tbody>/.exec(slika)?.[1] ?? "";
    expect(count(telo, "<tr")).toBe(dana);
    const dani = [...telo.matchAll(/<time datetime="([^"]+)"/gi)].map((m) => m[1]);
    expect(dani).toEqual([...izvestaj.dani]);
    const celije = brojevi(telo);
    expect(celije.map((c) => c.kljuc)).toEqual(izvestaj.dani.map((dan) => `trend-${metrika}-dan-${dan}`));
    expect(celije.map((c) => c.vrednost)).toEqual([...niz]);
    expect(celije.map((c) => c.tekst)).toEqual(niz.map(formatBroj));
    expect(tekst(slika)).toContain(t.trend.tabela);
    expect(tekst(slika)).toContain(t.trend.kolonaDan);
    return slika;
  }

  test("the 7-day trend has a labelled image and a table with one row per day equal to the report", () => {
    for (const metrika of METRIKE_TRENDA) proveriGrafikon({ plan: "standard", izbor: D7 }, metrika, 7);
  });

  test("the 30-day trend has a labelled image and a table with one row per day equal to the report", () => {
    for (const metrika of METRIKE_TRENDA) proveriGrafikon({ plan: "standard", izbor: D30 }, metrika, 30);
  });

  test("Premium: 90 days, and a period of its own, keep the table", () => {
    proveriGrafikon({ plan: "premium", izbor: D90 }, "otvaranja", 90);
    proveriGrafikon({ plan: "premium", izbor: { vrsta: "izbor", od: "2026-10-10", do: "2026-10-16" } }, "otvaranja", 7);
  });

  test("the chart is a series of the metric chosen: one segment option per trend metric, the chosen one checked", () => {
    const html = prikazi({ trend: "zahtevi" });
    const trend = blok(html, "trend");
    const opcije = [...trend.matchAll(/<input\b([^>]*)>/g)].map((m) => ({ v: attr(m[1], "value"), checked: /\schecked(=|\s|$)/.test(m[1]) }));
    expect(opcije.map((o) => o.v)).toEqual([...METRIKE_TRENDA]);
    expect(opcije.filter((o) => o.checked).map((o) => o.v)).toEqual(["zahtevi"]);
    for (const m of METRIKE_TRENDA) expect(tekst(trend)).toContain(t.metrike[m].naziv);
  });

  test("today's column is said in words when the period ends today, and only then", () => {
    for (const izbor of [D7, D30, D90]) {
      const html = prikazi({ plan: "premium", izbor });
      expect(count(tekst(grafikon(html, "trend-otvaranja")), t.trend.danas)).toBe(1);
    }
    const jucer = prikazi({ plan: "premium", izbor: { vrsta: "izbor", od: "2026-10-10", do: "2026-10-16" } });
    expect(tekst(jucer)).not.toContain(t.trend.danas);
  });
});

// --- 7. What is never measured --------------------------------------------------------------------

describe("Analitika: what is never said", () => {
  const ZABRANJENO = ["prosečno vreme", "prosecno", "vreme preuzimanja", "vreme do preuzimanja"];

  test("never an average time or a time to take a request, except the one sentence that says it is not measured", () => {
    for (const stanje of SVA_STANJA) {
      const html = stanje.html();
      const text = tekst(html).toLowerCase();
      const izvan = imaBlok(html, "kako-brojimo") ? tekst(bezBloka(html, "kako-brojimo")).toLowerCase() : text;
      for (const rec of ZABRANJENO) expect(izvan, `${stanje.naziv}: ${rec}`).not.toContain(rec);
    }
    const html = prikazi({ plan: "premium", raspodela: JEZIK });
    const unutra = tekst(blok(html, "kako-brojimo")).toLowerCase();
    expect(unutra).toContain("ne merimo vreme do preuzimanja zahteva");
    expect(count(tekst(html).toLowerCase(), "vreme do preuzimanja")).toBe(1);
    for (const rec of ["prosečno vreme", "prosecno", "vreme preuzimanja"]) expect(tekst(html).toLowerCase()).not.toContain(rec);
  });

  test("never a mail address or an '@' in any state", () => {
    for (const stanje of SVA_STANJA) expect(stanje.html(), stanje.naziv).not.toContain("@");
  });

  test("never an internal id: no card id, article key or page key reaches the text", () => {
    for (const stanje of SVA_STANJA) {
      const text = tekst(stanje.html().replace(/<data\b[^>]*>/g, "<data>"));
      expect(text, stanje.naziv).not.toMatch(/card_demo|\bar_[a-z0-9]{8}\b|\bpg_[a-z0-9]{8}\b/);
    }
  });
});

// --- 8. Loading, error, one H1 ---------------------------------------------------------------------

describe("Analitika: loading and error", () => {
  test("loading shows the label for screen readers and no number", () => {
    const html = prikazi({ plan: "premium", izvestaj: undefined });
    expect(html).toContain('data-stanje="ucitavanje"');
    expect(tekst(html)).toContain(t.ucitavanje);
    expect(brojevi(html)).toEqual([]);
    expect(html).not.toContain('data-stanje="greska"');
    expect(tekst(html)).not.toContain(t.greskaNaslov);
  });

  test("a failed load says so and offers to try again", () => {
    const html = prikazi({ izvestaj: null });
    expect(html).toContain('data-stanje="greska"');
    expect(html).toContain('role="alert"');
    expect(tekst(html)).toContain(t.greskaNaslov);
    expect(brojevi(html)).toEqual([]);
    expect(html).not.toContain('data-stanje="ucitavanje"');
    expect(tekst(html)).not.toContain(t.ucitavanje);
  });

  test("the period and the title are there in both", () => {
    for (const izvestaj of [undefined, null]) {
      const html = prikazi({ izvestaj });
      expect(tekst(html)).toContain(t.opis);
      expect(radiji(html)).toHaveLength(4);
      expect(tekst(html)).toContain(t.kasnjenje);
    }
  });

  test("exactly one H1, named Analitika, in every state", () => {
    for (const stanje of SVA_STANJA) {
      const html = stanje.html();
      expect(count(html, "<h1"), stanje.naziv).toBe(1);
      expect(tekst(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ""), stanje.naziv).toBe(t.naslov);
    }
  });

  test("every icon is hidden from a screen reader, every button has a name, every region points at a heading", () => {
    for (const stanje of SVA_STANJA) {
      const html = stanje.html();
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg, stanje.naziv).toContain('aria-hidden="true"');
      for (const dugme of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        expect(tekst(dugme[2]).length > 0 || (attr(dugme[1], "aria-label") ?? "").length > 0, stanje.naziv).toBe(true);
      }
      for (const region of html.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)) {
        expect(html, stanje.naziv).toContain(`id="${region[1]}"`);
      }
    }
  });
});

// --- 9. The CSV ----------------------------------------------------------------------------------------

describe("csvSadrzaj", () => {
  const izvestaj = izvestajZa({ plan: "premium", izbor: D30 });

  function raspodelaZa(metrika: IzborRaspodele["metrika"], dimenzija: NonNullable<IzborRaspodele["dimenzija"]>): RaspodelaAnalitike {
    return fixtureRaspodela({ period: periodIzbora(D30, IZLOG_DANAS), stanje: "puno", metrika, dimenzija });
  }

  test("the period file: a name with the dates, a BOM, Serbian headers", () => {
    const { ime, tekst: csv } = csvSadrzaj({ izvestaj, raspodela: null, slug: "demo-restoran" });
    expect(ime.endsWith(".csv")).toBe(true);
    expect(ime).toContain(izvestaj.period.od);
    expect(ime).toContain(izvestaj.period.do);
    expect(ime).toContain("demo-restoran");
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1).startsWith(`${t.csv.datum};${t.csv.kolone.otvaranja};`)).toBe(true);
    expect(csv.slice(1).startsWith("Datum;Otvaranja menija;")).toBe(true);
    const redovi = csv.slice(1).trim().split("\r\n");
    // header + one row per day + the total
    expect(redovi).toHaveLength(1 + izvestaj.dani.length + 1);
    expect(redovi[1].startsWith(`${izvestaj.dani[0]};`)).toBe(true);
    expect(redovi[redovi.length - 1].startsWith(`${t.csv.ukupno};${izvestaj.metrike.otvaranja.ukupno};`)).toBe(true);
  });

  test("with a breakdown: the breakdown file, with the values by name and 'Ostalo;Ukupno'", () => {
    const raspodela = raspodelaZa("otvaranja", "jezik");
    const { ime, tekst: csv } = csvSadrzaj({ izvestaj, raspodela, slug: "demo-restoran" });
    expect(ime.endsWith(".csv")).toBe(true);
    expect(ime).toContain(raspodela.period.od);
    expect(ime).toContain(raspodela.period.do);
    expect(ime).toContain("otvaranja-jezik");
    expect(csv.startsWith(BOM)).toBe(true);
    const zaglavlje = csv.slice(1).split("\r\n")[0];
    expect(zaglavlje.startsWith("Datum;")).toBe(true);
    expect(zaglavlje).toContain("Ostalo;Ukupno");
    expect(zaglavlje).toContain("Srpski");
    expect(zaglavlje).toContain("Engleski");
    expect(zaglavlje).not.toContain(t.csv.kolone.otvaranja);
    expect(csv.slice(1).trim().split("\r\n")).toHaveLength(1 + raspodela.dani.length + 1);
  });

  test("no mail address, card id or article key in any file", () => {
    const fajlovi = [
      csvSadrzaj({ izvestaj, raspodela: null, slug: "demo-restoran" }),
      csvSadrzaj({ izvestaj, raspodela: raspodelaZa("otvaranja", "jezik"), slug: "demo-restoran" }),
      csvSadrzaj({ izvestaj, raspodela: raspodelaZa("skenovi", "kartica"), slug: "demo-restoran" }),
      csvSadrzaj({ izvestaj, raspodela: raspodelaZa("detalji", "artikal"), slug: "demo-restoran" }),
      csvSadrzaj({ izvestaj, raspodela: raspodelaZa("detalji", "stranica"), slug: "demo-restoran" }),
    ];
    for (const { ime, tekst: csv } of fajlovi) {
      expect(csv, ime).not.toContain("@");
      expect(csv, ime).not.toContain("card_demo");
      expect(csv, ime).not.toContain("ar_");
      expect(csv, ime).not.toContain("pg_");
      expect(ime, ime).toMatch(/^[a-z0-9-]+\.csv$/);
    }
    // The names a guest-facing person would read are there instead.
    expect(fajlovi[2].tekst).toContain("Sto 4");
    expect(fajlovi[3].tekst).toContain("Ćevapi u lepinji");
  });

  test("a report without reliable sessions leaves the session columns out", () => {
    const { tekst: csv } = csvSadrzaj({ izvestaj: izvestajZa({ plan: "premium", stanje: "bez-sesija" }), raspodela: null, slug: "demo-restoran" });
    const zaglavlje = csv.slice(1).split("\r\n")[0].split(";");
    expect(zaglavlje).not.toContain(t.csv.kolone.sesije);
    expect(zaglavlje).not.toContain(t.csv.kolone.sesijeSaDetaljem);
    expect(zaglavlje).toContain(t.csv.kolone.otvaranja);
  });
});

// --- 10. The rows of a breakdown -------------------------------------------------------------------------

describe("stavkeRaspodele", () => {
  const period = periodIzbora(D30, IZLOG_DANAS);
  const artikli = fixtureRaspodela({ period, stanje: "puno", metrika: "detalji", dimenzija: "artikal" });
  // The metric's period total, as the screen passes it: the values and "Ostalo" add up to it in the fixtures.
  const ukupnoArtikala = artikli.vrednosti.reduce((a, v) => a + v.ukupno, 0) + artikli.ostalo.ukupno;

  test("'Ostalo' is the last row when it counted anything, and is marked as such", () => {
    expect(artikli.ostalo.ukupno).toBeGreaterThan(0);
    const stavke = stavkeRaspodele(artikli, "dovoljno", ukupnoArtikala);
    expect(stavke).toHaveLength(artikli.vrednosti.length + 1);
    const zadnja = stavke[stavke.length - 1];
    expect(zadnja).toMatchObject({ kljuc: "ostalo", naziv: t.raspodela.ostalo, broj: artikli.ostalo.ukupno, ostalo: true });
    expect(stavke.slice(0, -1).some((s) => s.ostalo)).toBe(false);
    expect(stavke[0].naziv).toBe("Ćevapi u lepinji");
  });

  test("no 'Ostalo' row when nothing is left over", () => {
    const jezici = fixtureRaspodela({ period, stanje: "puno", metrika: "otvaranja", dimenzija: "jezik" });
    expect(jezici.ostalo.ukupno).toBe(0);
    const stavke = stavkeRaspodele(jezici, "dovoljno", jezici.vrednosti.reduce((a, v) => a + v.ukupno, 0));
    expect(stavke.map((s) => s.kljuc)).toEqual(jezici.vrednosti.map((v) => v.vrednost));
    expect(stavke.some((s) => s.ostalo)).toBe(false);
    expect(stavke.map((s) => s.naziv)).toEqual(["Srpski", "Engleski", "Nemački"]);
  });

  test("the shares are null under 'malo' and 'prazno', and add up to about 100 otherwise", () => {
    for (const stanje of ["malo", "prazno"] as const) {
      expect(stavkeRaspodele(artikli, stanje, ukupnoArtikala).every((s) => s.udeo === null)).toBe(true);
    }
    const stavke = stavkeRaspodele(artikli, "dovoljno", ukupnoArtikala);
    expect(stavke.every((s) => typeof s.udeo === "number")).toBe(true);
    const zbir = stavke.reduce((a, s) => a + (s.udeo ?? 0), 0);
    expect(Math.abs(zbir - 100)).toBeLessThan(stavke.length * 0.1 + 0.01);
  });

  test("a value whose article is gone says so, and an empty name is 'Bez naziva'", () => {
    const raspodela: RaspodelaAnalitike = {
      ...artikli,
      vrednosti: [
        { vrednost: "ar_gone0001", naziv: null, ukupno: 30, poDanu: [] },
        { vrednost: "ar_empty001", naziv: "  ", ukupno: 20, poDanu: [] },
      ],
      ostalo: { ukupno: 0, poDanu: [] },
    };
    const stavke = stavkeRaspodele(raspodela, "dovoljno", 50);
    expect(stavke.map((s) => s.naziv)).toEqual([t.raspodela.uklonjeno, t.raspodela.bezNaziva]);
    expect(stavke.map((s) => s.udeo)).toEqual([60, 40]);
  });

  test("[bez-podatka] what carried no value is a muted row after 'Ostalo'; shares are of the metric's total", () => {
    const stavke = stavkeRaspodele(artikli, "dovoljno", ukupnoArtikala + 100);
    const zadnja = stavke[stavke.length - 1];
    expect(zadnja).toMatchObject({ kljuc: "bez-podatka", naziv: t.raspodela.bezPodatka, broj: 100, ostalo: true });
    expect(stavke[stavke.length - 2].kljuc).toBe("ostalo");
    expect(stavke.reduce((a, s) => a + s.broj, 0)).toBe(ukupnoArtikala + 100);
    expect(zadnja.udeo).toBe(Math.round((100 / (ukupnoArtikala + 100)) * 1000) / 10);
    // Under "malo" no share at all, the row stays.
    expect(stavkeRaspodele(artikli, "malo", ukupnoArtikala + 100).every((s) => s.udeo === null)).toBe(true);
    // For QR cards it says that the open came from a plain link.
    const kartice = fixtureRaspodela({ period, stanje: "puno", metrika: "otvaranja", dimenzija: "kartica" });
    const zbirKartica = kartice.vrednosti.reduce((a, v) => a + v.ukupno, 0) + kartice.ostalo.ukupno;
    const kRed = stavkeRaspodele(kartice, "dovoljno", zbirKartica + 7);
    expect(kRed[kRed.length - 1]).toMatchObject({ kljuc: "bez-podatka", naziv: t.raspodela.bezKartice, broj: 7 });
    // A total below the rows never makes a negative row.
    expect(stavkeRaspodele(artikli, "dovoljno", 0).some((s) => s.kljuc === "bez-podatka")).toBe(false);
  });
});

describe("Analitika: scans per card", () => {
  test("at most 10 cards by name, the rest is one 'Ostale kartice' row, and the rows add up to the scans total", () => {
    const izvestaj = izvestajZa({ izbor: D30 });
    expect(izvestaj.skenovi.length).toBeGreaterThan(10);
    const html = blok(prikazi({ izbor: D30 }), "kartice");
    const redovi = brojevi(html).filter((b) => b.kljuc.startsWith("kartice-"));
    expect(redovi).toHaveLength(11);
    expect(redovi[10].kljuc).toBe("kartice-ostale");
    expect(tekst(html)).toContain(t.kartice.ostale);
    expect(redovi.reduce((a, b) => a + b.vrednost, 0)).toBe(izvestaj.metrike.skenovi.ukupno);
  });
});
