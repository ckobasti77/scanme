// K30 render tests of the "Poslednjih 7 dana" card of Početna: the one darker
// card of the screen, a short look back with the definitions of Analitika. It
// shows only numbers no other block of Početna shows (menu opens by day, article
// opens, QR scans, the most opened article) and never a percentage. No DOM in the
// edge-runtime environment: markup strings from renderToStaticMarkup.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureIzvestaj, IZLOG_DANAS, type AnalitikaFixtureStanje } from "@/components/menu/fixtures/analitika";
import { fixturePocetnaInput } from "@/components/menu/fixtures/pocetna";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { IzvestajAnalitike } from "@/lib/menu/analitika/izvestaj";
import { poslednjihDana } from "@/lib/menu/analitika/period";
import { danKratko, formatBroj } from "@/lib/menu/analitika/prikaz";
import { homeSummary } from "@/lib/menu/home-summary";
import type { MenuActor } from "@/lib/menu/permissions";
import { AnalitikaKartica } from "./analitika-kartica";
import { Pocetna, type PocetnaHrefs } from "./pocetna";

const t = menuAnalitikaSr;
const HREF = "/demo-restoran/client-panel/meni/analitika";

const HREFS: PocetnaHrefs = {
  editor: "/demo-restoran/client-panel/meni/editor",
  operativa: "/demo-restoran/client-panel/meni/operativa",
  lokal: "/demo-restoran/client-panel/meni/lokal",
  analitika: HREF,
  podesavanja: "/demo-restoran/client-panel/meni/podesavanja",
  konobar: "/demo-restoran/konobar",
};

// --- Helpers -------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;

const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

type Broj = { kljuc: string; opis: string | undefined; vrednost: number; tekst: string };

function brojevi(html: string): Broj[] {
  return [...html.matchAll(/<data\b([^>]*)>([^<]*)<\/data>/g)].map((match) => ({
    kljuc: attr(match[1], "data-broj") ?? "",
    opis: attr(match[1], "aria-describedby"),
    vrednost: Number(attr(match[1], "value")),
    tekst: unesc(match[2]),
  }));
}

function objasnjenja(html: string): Map<string, string> {
  const izlaz = new Map<string, string>();
  for (const match of html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    if (!/\sdata-objasnjenje=/.test(match[1])) continue;
    izlaz.set(attr(match[1], "id") ?? "", tekst(match[2]));
  }
  return izlaz;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sablonRegex = (sablon: string) => new RegExp(`^${sablon.split(/\{\w+\}/).map(escapeRegex).join(".+")}$`);

/** Every sentence an explanation may say (the same list as the Analitika screen). */
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

function proveriObjasnjenja(html: string, prefiks: string): Broj[] {
  const lista = brojevi(html);
  const obj = objasnjenja(html);
  expect(lista.length).toBeGreaterThan(0);
  for (const broj of lista) {
    const ime = `${broj.kljuc} (${broj.opis})`;
    expect(broj.opis, ime).toBeTruthy();
    expect(broj.opis!.startsWith(prefiks), ime).toBe(true);
    expect(count(html, `id="${broj.opis}"`), ime).toBe(1);
    const recenica = obj.get(broj.opis!);
    expect(recenica, ime).toBeTruthy();
    expect(jeObjasnjenje(recenica!), `${ime}: "${recenica}"`).toBe(true);
  }
  return lista;
}

const SEDAM_DANA = poslednjihDana(IZLOG_DANAS, 7);

function izvestaj(stanje: AnalitikaFixtureStanje = "puno", premium = false): IzvestajAnalitike {
  return fixtureIzvestaj({ period: SEDAM_DANA, stanje, premium });
}

function kartica(izv: IzvestajAnalitike | null | undefined): string {
  return renderToStaticMarkup(<AnalitikaKartica izvestaj={izv} href={HREF} />);
}

const STANJA: { naziv: string; izv: IzvestajAnalitike | null | undefined }[] = [
  { naziv: "puno", izv: izvestaj("puno") },
  { naziv: "puno premium", izv: izvestaj("puno", true) },
  { naziv: "malo-podataka", izv: izvestaj("malo-podataka") },
  { naziv: "bez-sesija", izv: izvestaj("bez-sesija") },
  { naziv: "prazno", izv: izvestaj("prazno") },
  { naziv: "ucitavanje", izv: undefined },
  { naziv: "nedostupno", izv: null },
];

// --- The numbers ---------------------------------------------------------------------

describe("AnalitikaKartica: numbers", () => {
  test("[objasnjenje] svaka brojka na kartici ima objašnjenje iz definicija", () => {
    for (const stanje of ["puno", "malo-podataka", "bez-sesija"] as const) {
      const lista = proveriObjasnjenja(kartica(izvestaj(stanje)), "an-obj-pocetna-");
      expect(lista.map((b) => b.kljuc)).toEqual(["pocetna-otvaranja", "pocetna-detalji", "pocetna-skenovi", "pocetna-najotvaraniji"]);
    }
  });

  test("the explanation of each number is the one of its metric", () => {
    const html = kartica(izvestaj());
    const obj = objasnjenja(html);
    expect(obj.get("an-obj-pocetna-otvaranja")).toBe(t.metrike.otvaranja.objasnjenje);
    expect(obj.get("an-obj-pocetna-detalji")).toBe(t.metrike.detalji.objasnjenje);
    expect(obj.get("an-obj-pocetna-skenovi")).toBe(t.metrike.skenovi.objasnjenje);
    expect(obj.get("an-obj-pocetna-najotvaraniji")).toBe(t.pocetna.najotvaranijiObjasnjenje);
    expect(obj.get("an-obj-pocetna-kasnjenje")).toBe(t.kasnjenje);
    expect(count(html, "<details")).toBe(1);
  });

  test("the numbers are the report's: opens, article opens, scans and the most opened article", () => {
    const izv = izvestaj();
    const html = kartica(izv);
    const lista = Object.fromEntries(brojevi(html).map((b) => [b.kljuc, b]));
    expect(lista["pocetna-otvaranja"].vrednost).toBe(izv.metrike.otvaranja.ukupno);
    expect(lista["pocetna-otvaranja"].tekst).toBe(formatBroj(izv.metrike.otvaranja.ukupno));
    expect(lista["pocetna-detalji"].vrednost).toBe(izv.metrike.detalji.ukupno);
    expect(lista["pocetna-skenovi"].vrednost).toBe(izv.metrike.skenovi.ukupno);
    expect(lista["pocetna-najotvaraniji"].vrednost).toBe(izv.najotvaraniji[0].broj);
    expect(tekst(html)).toContain(izv.najotvaraniji[0].naziv);
    expect(izv.metrike.otvaranja.ukupno).toBeGreaterThan(0);
  });

  test("it shows only opens, details, scans and the most opened article, never requests or reservations", () => {
    for (const { naziv, izv } of STANJA.slice(0, 4)) {
      const html = kartica(izv);
      expect([...html.matchAll(/data-pocetna-broj="([^"]+)"/g)].map((m) => m[1]), naziv).toEqual([
        "otvaranja",
        "detalji",
        "skenovi",
        "najotvaraniji",
      ]);
      const text = tekst(html);
      // "no duplicate operational numbers": Pažnja and Sada already show requests and reservations.
      expect(text, naziv).not.toContain(t.metrike.zahtevi.naziv);
      expect(text, naziv).not.toContain(t.metrike.rezervacije.naziv);
      expect(text, naziv).not.toContain(t.zahtevi.naslov);
      expect(text, naziv).not.toContain(t.rezervacije.naslov);
      expect(text, naziv).not.toContain(t.metrike.sesije.naziv);
      expect(brojevi(html).some((b) => /zahtev|rezerv|sesij/.test(b.kljuc)), naziv).toBe(false);
    }
  });

  test("no percentage anywhere on the card", () => {
    for (const { naziv, izv } of STANJA) {
      const html = kartica(izv);
      // The text, the labels and the titles; the bar heights are CSS percentages and say nothing to a reader.
      expect(tekst(html), naziv).not.toContain("%");
      expect([...html.matchAll(/(?:aria-label|title|aria-describedby)="([^"]*)"/g)].map((m) => m[1]).join(" "), naziv).not.toContain("%");
      expect(brojevi(html).some((b) => b.tekst.includes("%") || b.kljuc.endsWith("-udeo")), naziv).toBe(false);
    }
  });

  test("every number of the card has its own key", () => {
    const html = kartica(izvestaj());
    const kljucevi = brojevi(html).map((b) => b.kljuc);
    expect(new Set(kljucevi).size).toBe(kljucevi.length);
  });
});

// --- The chart --------------------------------------------------------------------------

describe("AnalitikaKartica: the seven columns", () => {
  test("one labelled image with the seven days and their opens, and seven columns", () => {
    const izv = izvestaj();
    const html = kartica(izv);
    expect(izv.dani).toHaveLength(7);
    const img = /<div role="img" aria-label="([^"]*)"/.exec(html);
    expect(img).not.toBeNull();
    expect(count(html, 'role="img"')).toBe(1);
    const oznaka = unesc(img![1]);
    const dani = izv.dani.map((dan, i) => `${danKratko(dan, t.meseci)} ${formatBroj(izv.metrike.otvaranja.poDanu[i])}`);
    expect(oznaka).toBe(fmt(t.pocetna.grafikon, { dani: dani.join(", ") }));
    expect(oznaka.split(": ")[1].split(", ")).toHaveLength(7);
    expect(count(html, 'title="')).toBe(7);
    for (const dan of dani) expect(html).toContain(`title="${dan.replace(/ (\d+)$/, ": $1")}"`);
  });

  test("with no opens on a day, that day's column has no height but still has its place and its words", () => {
    const izv = izvestaj("malo-podataka");
    const html = kartica(izv);
    const oznaka = unesc(/<div role="img" aria-label="([^"]*)"/.exec(html)![1]);
    expect(oznaka.split(": ")[1].split(", ")).toHaveLength(7);
    expect(oznaka).toContain(`${danKratko(izv.dani[0], t.meseci)} 0`);
  });
});

// --- The states ---------------------------------------------------------------------------

describe("AnalitikaKartica: states", () => {
  test("loading: a skeleton with its label, no number", () => {
    const html = kartica(undefined);
    expect(html).toContain('data-stanje="ucitavanje"');
    expect(tekst(html)).toContain(t.pocetna.ucitavanje);
    expect(brojevi(html)).toEqual([]);
    expect(html).not.toContain("data-pocetna-broj");
    expect(html).not.toContain('role="img"');
  });

  test("unavailable: one honest sentence, no number", () => {
    const html = kartica(null);
    expect(tekst(html)).toContain(t.pocetna.greska);
    expect(brojevi(html)).toEqual([]);
    expect(html).not.toContain('data-stanje="ucitavanje"');
  });

  test("empty: says there is no data yet, and what makes it appear", () => {
    const html = kartica(izvestaj("prazno"));
    expect(tekst(html)).toContain(t.pocetna.prazno);
    expect(tekst(html)).toContain(t.pocetna.praznoOpis);
    expect(html).toContain('data-stanje="prazno"');
    expect(brojevi(html)).toEqual([]);
    expect(html).not.toContain("data-pocetna-broj");
    expect(html).not.toContain("<details");
  });

  test("little data still shows the numbers: this card never shows a percentage that could mislead", () => {
    const izv = izvestaj("malo-podataka");
    const html = kartica(izv);
    expect(html).not.toContain('data-stanje="prazno"');
    expect(tekst(html)).not.toContain(t.pocetna.prazno);
    const lista = Object.fromEntries(brojevi(html).map((b) => [b.kljuc, b.vrednost]));
    expect(lista["pocetna-otvaranja"]).toBe(izv.metrike.otvaranja.ukupno);
    expect(lista["pocetna-otvaranja"]).toBeGreaterThan(0);
    expect(tekst(html)).not.toContain(t.stanja.maloNaslov);
  });

  test("sessions that are not measured do not hide the numbers of this card", () => {
    const html = kartica(izvestaj("bez-sesija"));
    expect(brojevi(html).map((b) => b.kljuc)).toContain("pocetna-otvaranja");
    expect(tekst(html)).not.toContain(t.sesije.neMere);
  });

  test("a link to Analitika in every state, once, named 'Otvori Analitiku'", () => {
    for (const { naziv, izv } of STANJA) {
      const html = kartica(izv);
      const veze = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: attr(m[1], "href"), tekst: tekst(m[2]) }));
      expect(veze, naziv).toEqual([{ href: HREF, tekst: t.pocetna.otvori }]);
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg, naziv).toContain('aria-hidden="true"');
    }
  });

  test("the card is the dark one, titled 'Poslednjih 7 dana', with its sentence", () => {
    for (const { naziv, izv } of STANJA) {
      const html = kartica(izv);
      expect(html, naziv).toContain('data-kartica="istaknuta"');
      expect(html, naziv).toContain('data-blok="analitika"');
      expect(count(html, 'data-kartica="'), naziv).toBe(1);
      expect([...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => tekst(m[1])), naziv).toEqual([
        menuPanelSr.pocetna.analitika.naslov,
      ]);
      expect(tekst(html), naziv).toContain(t.pocetna.opis);
    }
  });
});

// --- Through Početna ----------------------------------------------------------------------

describe("AnalitikaKartica in Pocetna", () => {
  function pocetna(actor: MenuActor, analitika: IzvestajAnalitike | null | undefined): string {
    const ulaz = fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor });
    return renderToStaticMarkup(
      <Pocetna summary={homeSummary(ulaz)} actor={actor} nowMs={IZLOG_SADA} hrefs={HREFS} analitika={analitika} />,
    );
  }

  test("exactly one dark card, and it is this one, in every state of the data", () => {
    for (const { naziv, izv } of STANJA) {
      const html = pocetna("owner", izv);
      expect(count(html, 'data-kartica="istaknuta"'), naziv).toBe(1);
      const at = html.indexOf('data-blok="analitika"');
      expect(at, naziv).toBeGreaterThan(0);
      const pocetak = html.lastIndexOf("<", at);
      expect(html.slice(pocetak, at), naziv).toContain('data-kartica="istaknuta"');
    }
  });

  test("the numbers are in the card and in no other block of Početna", () => {
    const izv = izvestaj();
    const html = pocetna("owner", izv);
    const lista = brojevi(html);
    expect(lista.map((b) => b.kljuc)).toEqual(["pocetna-otvaranja", "pocetna-detalji", "pocetna-skenovi", "pocetna-najotvaraniji"]);
    proveriObjasnjenja(html, "an-obj-pocetna-");
    expect(tekst(html)).toContain(menuPanelSr.pocetna.analitika.naslov);
  });

  test("an Urednik has no analytics, so no card and no number whatever is passed", () => {
    const html = pocetna("editor", izvestaj());
    expect(html).not.toContain('data-kartica="istaknuta"');
    expect(html).not.toContain('data-blok="analitika"');
    expect(brojevi(html)).toEqual([]);
  });

  test("without a report the card is loading, and with null it says so", () => {
    expect(tekst(pocetna("owner", undefined))).toContain(t.pocetna.ucitavanje);
    expect(tekst(pocetna("owner", null))).toContain(t.pocetna.greska);
  });
});
