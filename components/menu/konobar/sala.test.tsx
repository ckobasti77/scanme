// K23 render tests: the floor of the waiter panel (sala/, sto/, zona.tsx, the
// header's sound switch and the late chip) over the izlog fixture "Demo
// restoran" (fixtureKonobar + fixtureSale, 18:27 in Belgrade). Server markup
// only (renderToStaticMarkup, no DOM): effects do not run and
// useSyncExternalStore answers with its server snapshot, so the clock stands at
// IZLOG_SADA, useSiroko() is false (phone wording) and the sound starts as the
// izlog says. Texts are read from the dictionaries; the only Serbian literal is
// "slobodan", the word that must be ABSENT wherever the occupancy module is off.
// Invented data only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { KONOBAR_IZLOG_OSOBA, fixtureKonobar, fixtureSale, mestoPoNazivu, zonaPoNazivu } from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { clockTime, formatElapsed } from "@/lib/menu/elapsed-time";
import { parseKonobarPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { OCCUPANCY_STATES } from "@/lib/menu/occupancy";
import { DEFAULT_PANEL_TIMING } from "@/lib/menu/thresholds";
import stil from "./konobar.module.css";
import { mestaSale, opisMestaSale } from "./sala/pogled";
import { vrstaNaslov } from "./vrsta";

const t = menuKonobarSr;
const z = menuZajednickoSr.stanja;

// --- Helpers (markup is read back with small regexes, as in konobar.test.tsx) ---------

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

/** What a person could read: no tags, no styles, one line (sr-only text included). */
const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

function attr(otvor: string, ime: string): string | undefined {
  const value = new RegExp(`\\s${ime}="([^"]*)"`).exec(otvor)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The text of every <h{nivo}>. */
const naslovi = (html: string, nivo: 1 | 2 | 3): string[] =>
  [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((m) => tekst(m[1]));

/** The first capture group of `re`, or a loud failure when the markup lacks the part. */
function izdvoji(html: string, re: RegExp): string {
  const unutra = re.exec(html)?.[1];
  if (unutra === undefined) throw new Error(`markup part not found: ${re}`);
  return unutra;
}

type DugmeMarkup = {
  /** The attributes of the opening tag. */
  otvor: string;
  /** Everything between <button ...> and </button>. */
  markup: string;
  tekst: string;
  ime: string | undefined;
  pritisnuto: string | undefined;
  iskljuceno: boolean;
  klase: string;
};

const dugmad = (html: string): DugmeMarkup[] =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, otvor, unutra]) => ({
    otvor,
    markup: unutra,
    tekst: tekst(unutra),
    ime: attr(otvor, "aria-label"),
    pritisnuto: attr(otvor, "aria-pressed"),
    iskljuceno: /\sdisabled=""/.test(otvor),
    klase: attr(otvor, "class") ?? "",
  }));

const dugme = (html: string, naziv: string) => dugmad(html).find((b) => b.tekst === naziv);
const kartica = (html: string, id: string) => izdvoji(html, new RegExp(`(<article\\b[^>]*data-zahtev="${id}"[^>]*>[\\s\\S]*?</article>)`));
const redosled = (html: string) => [...html.matchAll(/<article data-zahtev="([^"]+)"/g)].map((m) => m[1]);
const imaMin48 = (klase: string) => /\bmin-h-(12|14|16)\b/.test(klase);
/** Does the markup carry a data-kasni attribute (the late mark)? */
const jeKasni = (markup: string) => /\sdata-kasni(?:=|\s|>)/.test(markup);
const klaseSa = (markup: string, trazeno: string) =>
  [...markup.matchAll(/\sclass="([^"]*)"/g)].map((m) => unesc(m[1]).split(/\s+/)).filter((klase) => klase.includes(trazeno));

/** The markup between two anchors (the floor section / the contextual side pane). */
function pocetakPana(html: string): number {
  const oznaka = html.indexOf("data-bocni-pano");
  if (oznaka < 0) throw new Error("the side pane is missing");
  return html.lastIndexOf("<div", oznaka);
}

function stranaSale(html: string): string {
  const pocetak = html.indexOf('<section aria-labelledby="sala-naslov"');
  if (pocetak < 0) throw new Error("the floor section is missing");
  return html.slice(pocetak, pocetakPana(html));
}

function bocniPano(html: string): string {
  const pocetak = pocetakPana(html);
  return html.slice(pocetak, html.indexOf("<nav", pocetak));
}

const kontekstPana = (html: string) => {
  const pano = bocniPano(html);
  return attr(pano.slice(0, pano.indexOf(">")), "data-kontekst");
};

const legenda = (html: string) => izdvoji(html, /(<section\b[^>]*data-legenda[^>]*>[\s\S]*?<\/section>)/);

/** The floor tiles / table-view buttons of a position (the phone list has a second button in the table view). */
const plocice = (html: string, id: string) => dugmad(html).filter((b) => attr(b.otvor, "data-mesto") === id);
const sveMesta = (html: string) => dugmad(html).filter((b) => attr(b.otvor, "data-mesto") !== undefined);
const znacke = (b: DugmeMarkup) => [...b.markup.matchAll(/data-znacka="([a-z]+)"/g)].map((m) => m[1]);

/** The row of a position in the real <table> (a segment from its <tr> on). */
function redTabele(html: string, id: string): string {
  const red = html.split(/<tr\b/).find((deo) => deo.includes(`data-mesto="${id}"`));
  if (red === undefined) throw new Error(`table row not found for ${id}`);
  return red;
}

const celije = (red: string) =>
  [...red.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, , otvor, unutra]) => ({ otvor, markup: unutra, tekst: tekst(unutra) }));

const zaglavljaTabele = (html: string) =>
  [...izdvoji(html, /<thead>([\s\S]*?)<\/thead>/).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => tekst(m[1]));

const pre = (min: number, sek = 0) => IZLOG_SADA - (min * 60 + sek) * 1000;

// --- Fixtures and renderers ---------------------------------------------------------

const FX = fixtureKonobar();
const zahtevPo = (id: string) => FX.zahtevi.find((r) => r.id === id)!;
const SALA = fixtureSale().sala;
const nazivMesta = new Map(SALA.positions.map((mesto) => [mesto.id, mesto.label]));

function mestoId(naziv: string): string {
  const id = mestoPoNazivu(SALA, naziv);
  if (id === null) throw new Error(`fixture has no position "${naziv}"`);
  return id;
}

function zonaId(naziv: string): string {
  const id = zonaPoNazivu(SALA, naziv);
  if (id === null) throw new Error(`fixture has no zone "${naziv}"`);
  return id;
}

const kes = new Map<string, string>();
/** The izlog of the waiter panel for a query string (rendered once per query). */
function izlog(upit: IzlogSearchParams = {}): string {
  const kljuc = JSON.stringify(upit);
  let html = kes.get(kljuc);
  if (html === undefined) {
    html = renderToStaticMarkup(<KonobarIzlog params={parseKonobarPreview(upit)} />);
    kes.set(kljuc, html);
  }
  return html;
}

const RASPORED: IzlogSearchParams = { ekran: "sala-raspored" };
const TABELA: IzlogSearchParams = { ekran: "sala-tabela" };
const STO_3: IzlogSearchParams = { ekran: "sto" };
const sto = (naziv: string, preko: IzlogSearchParams = {}): IzlogSearchParams => ({ ekran: "sto", sto: naziv, ...preko });

/** The wait of a state on the table as the tile's accessible name says it: kind, time, whole minutes. */
const citac = (vrsta: "call" | "order" | "bill", sekunde: number) =>
  fmt(t.sala.stanjeCitac, {
    vrsta: t.sala.vrste[vrsta],
    vreme: clockTime(IZLOG_SADA - sekunde * 1000),
    trajanje: fmt(t.vreme.minuti, { n: Math.floor(sekunde / 60) }),
  });

const brojMesta = (n: number) => fmt(t.sala.brojMesta[srPluralCategory(n)], { n });
const naslovPovrsi = (ime: string, n: number) => `${ime} ${brojMesta(n)}`;
const uZoni = (zoneId: string | null) => SALA.positions.filter((mesto) => mesto.zoneId === zoneId).length;

/** The K07 requests of each table with what they make of it: [table, kinds in column order]. */
const PARALELNO: [string, string[]][] = [
  ["Sto 3", ["call", "order"]],
  ["Sto 5", ["call", "bill"]],
  ["Sto 7", ["order", "bill"]],
  ["Sto 1", ["call"]],
  ["Sto 2", []],
  ["Sto 9", []],
];

// --- 1. Parallel states -------------------------------------------------------------

describe("the floor (Raspored): every parallel state of a table side by side", () => {
  test.each(PARALELNO)("%s shows exactly these badges: %j", (naziv, vrste) => {
    const plocica = plocice(izlog(RASPORED), mestoId(naziv));
    expect(plocica).toHaveLength(1);
    // After the UX review the badges stand oldest first (the first one always carries its wait), so compare as sets.
    expect([...znacke(plocica[0])].sort()).toEqual([...vrste].sort());
    expect(count(plocica[0].markup, "data-znacka=")).toBe(vrste.length);
  });

  test("the section is the floor in its Raspored view, with the toggle pressed on Raspored", () => {
    const html = izlog(RASPORED);
    const sala = stranaSale(html);
    expect(sala).toContain('data-sala="raspored"');
    expect(naslovi(sala, 2)).toEqual([t.sala.naslov]);
    const prikaz = dugmad(sala).filter((b) => ([t.sala.raspored, t.sala.tabela] as string[]).includes(b.tekst));
    expect(prikaz.map((b) => [b.tekst, b.pritisnuto])).toEqual([
      [t.sala.raspored, "true"],
      [t.sala.tabela, "false"],
    ]);
    expect(html).not.toContain("<table");
  });

  test("the tile's accessible name says every state with its time and wait; a neutral table says nothing active", () => {
    const html = izlog(RASPORED);
    const imeStola = (naziv: string) => plocice(html, mestoId(naziv))[0].ime;
    const stanja = (...delovi: string[]) => delovi.join("; ");

    expect(imeStola("Sto 3")).toBe(
      fmt(t.sala.mestoCitac, { mesto: "Sto 3, Glavna sala", stanje: stanja(citac("call", 8 * 60 + 12), citac("order", 14 * 60)) }),
    );
    expect(imeStola("Sto 3")).toContain(t.sala.vrste.call);
    expect(imeStola("Sto 3")).toContain(t.sala.vrste.order);
    expect(imeStola("Sto 3")).not.toContain(t.sala.vrste.bill);
    expect(imeStola("Sto 3")).not.toContain(t.sala.neutralnoCitac);

    expect(imeStola("Sto 5")).toBe(
      fmt(t.sala.mestoCitac, { mesto: "Sto 5, Glavna sala", stanje: stanja(citac("call", 9 * 60), citac("bill", 3 * 60 + 10)) }),
    );
    expect(imeStola("Sto 7")).toBe(
      fmt(t.sala.mestoCitac, { mesto: "Sto 7, Glavna sala", stanje: stanja(citac("order", 6 * 60 + 10), citac("bill", 5 * 60)) }),
    );
    expect(imeStola("Sto 1")).toBe(fmt(t.sala.mestoCitac, { mesto: "Sto 1, Glavna sala", stanje: citac("call", 17 * 60) }));

    for (const naziv of ["Sto 2", "Sto 9"]) {
      const mesto = SALA.positions.find((kandidat) => kandidat.label === naziv)!;
      const zona = SALA.zones.find((kandidat) => kandidat.id === mesto.zoneId)!.name;
      expect(imeStola(naziv)).toBe(fmt(t.sala.mestoCitac, { mesto: `${naziv}, ${zona}`, stanje: t.sala.neutralnoCitac }));
    }
  });

  test("the badges carry the wait of their own kind and the tile carries the longest wait", () => {
    const sto3 = plocice(izlog(RASPORED), mestoId("Sto 3"))[0].markup;
    expect(sto3).toContain(formatElapsed(8 * 60 + 12));
    expect(sto3).toContain(formatElapsed(14 * 60));
    const sto1 = plocice(izlog(RASPORED), mestoId("Sto 1"))[0].markup;
    expect(sto1).toContain(formatElapsed(17 * 60));
  });

  test("a table with nothing active shows only its name: no badge, no wait, no late mark", () => {
    const sto2 = plocice(izlog(RASPORED), mestoId("Sto 2"))[0];
    expect(sto2.markup).not.toContain("data-znacka");
    expect(jeKasni(sto2.markup)).toBe(false);
    expect(sto2.markup).not.toMatch(/\d\d:\d\d/);
    expect(sto2.pritisnuto).toBe("false");
  });
});

describe("the table view (Tabela): a column per kind of request", () => {
  test("the header has the columns of the dictionary and neither a reservation nor a status column without the module", () => {
    const k = t.sala.kolone;
    const zaglavlja = zaglavljaTabele(izlog(TABELA));
    // After the UX review the zone and the seats live in the table cell (a narrower table, every kind in view).
    expect(zaglavlja).toEqual([k.sto, k.call, k.order, k.bill, k.konobar]);
    expect(zaglavlja).not.toContain(k.reservation);
    expect(zaglavlja).not.toContain(k.status);
    expect(stranaSale(izlog(TABELA))).toContain('data-sala="tabela"');
  });

  test.each(PARALELNO)("%s: the cells with a state are %j (table and phone list agree)", (naziv, vrste) => {
    const html = izlog(TABELA);
    const id = mestoId(naziv);
    const uTabeli = [...redTabele(html, id).matchAll(/<td data-stanje="([a-z]+)"/g)].map((m) => m[1]);
    const uListi = plocice(html, id).flatMap((b) => [...b.markup.matchAll(/data-lista-stanje="([a-z]+)"/g)].map((m) => m[1]));
    expect(uTabeli).toEqual(vrste);
    expect(uListi).toEqual(vrste);
  });

  test("Sto 3 has a call and an order, a dash in the bill column, and 'Vi' as the waiter", () => {
    const html = izlog(TABELA);
    const k = t.sala.kolone;
    const zaglavlja = zaglavljaTabele(html);
    const red = celije(redTabele(html, mestoId("Sto 3")));
    const kolona = (naziv: string) => red[zaglavlja.indexOf(naziv)];

    expect(red).toHaveLength(zaglavlja.length);
    expect(kolona(k.sto).tekst).toBe("Sto 3 Glavna sala · 4 sedišta");
    expect(attr(kolona(k.call).otvor, "data-stanje")).toBe("call");
    expect(attr(kolona(k.order).otvor, "data-stanje")).toBe("order");
    expect(kolona(k.bill).otvor).not.toContain("data-stanje");
    expect(kolona(k.bill).tekst).toBe(`${t.sala.neutralno} ${t.sala.neutralnoCitac}`);
    expect(kolona(k.konobar).tekst).toBe(t.red.preuzetoVi);
  });

  test("the other waiters are named; a table nobody took has a dash; a manager's account is nobody's 'Vi'", () => {
    const html = izlog(TABELA);
    const k = t.sala.kolone;
    const konobar = (sadrzaj: string, naziv: string) => {
      const red = celije(redTabele(sadrzaj, mestoId(naziv)));
      return red[zaglavljaTabele(sadrzaj).indexOf(k.konobar)].tekst;
    };
    expect(konobar(html, "Sto 5")).toBe(zahtevPo("rq_06").acceptedBy?.name);
    expect(konobar(html, "Sto 7")).toBe(zahtevPo("rq_12").acceptedBy?.name);
    expect(konobar(html, "Sto 1")).toBe(t.sala.neutralno);
    expect(konobar(html, "Sto 2")).toBe(t.sala.neutralno);
    expect(konobar(izlog({ ...TABELA, uloga: "menadzer" }), "Sto 3")).toBe(KONOBAR_IZLOG_OSOBA);
  });

  test("the search is labelled and the table has a caption", () => {
    const html = stranaSale(izlog(TABELA));
    const polje = izdvoji(html, /(<input\b[^>]*>)/);
    expect(attr(polje, "type")).toBe("search");
    expect(attr(polje, "placeholder")).toBe(t.sala.pretraga);
    expect(html).toContain(`<label for="${attr(polje, "id")}" class="sr-only">${t.sala.pretragaOznaka}</label>`);
    expect(html).toContain(`<caption class="sr-only">${t.sala.tabela}</caption>`);
  });
});

// --- 2. Neutral, never free ---------------------------------------------------------

const BEZ_MODULA: [string, IzlogSearchParams][] = [
  ["the work queue (default)", {}],
  ["the floor", RASPORED],
  ["the table view", TABELA],
  ["the table view of a manager", { ...TABELA, uloga: "menadzer" }],
  ["a table detail: Sto 9", sto("Sto 9")],
  ["a table detail: Sto 1 (occupied only in the module)", sto("Sto 1")],
  ["the default table detail", STO_3],
  ["the terrace zone", { ...RASPORED, zona: "Terasa" }],
];

describe("neutral, never free: no occupancy anywhere without the module", () => {
  test.each(BEZ_MODULA)("%s says nothing about occupancy", (_ime, upit) => {
    const html = izlog(upit);
    expect(tekst(html).toLowerCase()).not.toContain("slobodan");
    expect(html.toLowerCase()).not.toContain("slobodan");
    expect(html).not.toContain("data-zauzetost=");
    expect(html).not.toContain("data-sto-zauzetost");
    expect(html).not.toContain("data-zauzetost-dugme");
    for (const rec of Object.values(t.zauzetost)) expect(tekst(html), rec).not.toContain(rec);

    const natpisi = tekst(legenda(html));
    expect(natpisi).not.toContain(t.sala.legendaZauzetost);
    // The dash is explained where it is drawn (the table view); the plan explains the dashed "taken" badge.
    expect(natpisi).toContain(upit.ekran === "sala-tabela" ? t.sala.legendaNeutralno : t.sala.legendaPrihvaceno);
    for (const rec of Object.values(t.zauzetost)) expect(natpisi, rec).not.toContain(rec);
  });

  test("a table with nothing active shows the dash with its reader sentence in every kind column and in the waiter column", () => {
    const html = izlog(TABELA);
    const red = celije(redTabele(html, mestoId("Sto 2")));
    const zaglavlja = zaglavljaTabele(html);
    const k = t.sala.kolone;
    for (const naziv of [k.call, k.order, k.bill]) {
      const celija = red[zaglavlja.indexOf(naziv)];
      expect(celija.tekst, naziv).toBe(`${t.sala.neutralno} ${t.sala.neutralnoCitac}`);
      expect(celija.markup, naziv).toContain('class="sr-only"');
      expect(celija.otvor, naziv).not.toContain("data-stanje");
    }
    expect(red[zaglavlja.indexOf(k.konobar)].tekst).toBe(t.sala.neutralno);
    // The phone list: a dash in the card and the reader sentence in the button's name.
    const kartaStola = plocice(html, mestoId("Sto 2")).find((b) => /\bmin-h-16\b/.test(b.klase))!;
    expect(kartaStola.tekst).toContain(t.sala.neutralno);
    expect(kartaStola.ime).toContain(t.sala.neutralnoCitac);
  });

  test("the legend names the kinds, the taken badge (plan) or the dash (table) and the late threshold, by default 15 minutes", () => {
    const natpisi = tekst(legenda(izlog(RASPORED)));
    for (const vrsta of ["call", "order", "bill"] as const) expect(natpisi).toContain(t.sala.vrste[vrsta]);
    expect(natpisi).not.toContain(t.sala.vrste.reservation);
    expect(natpisi).toContain(t.sala.legendaPrihvaceno);
    expect(natpisi).not.toContain(t.sala.legendaNeutralno);
    expect(tekst(legenda(izlog(TABELA)))).toContain(t.sala.legendaNeutralno);
    expect(natpisi).toContain(fmt(t.sala.legendaKasni, { n: DEFAULT_PANEL_TIMING.lateThresholdMin }));
  });

  test("the table detail has no 'Status stola' heading without the module", () => {
    for (const naziv of ["Sto 1", "Sto 9"]) {
      const html = izlog(sto(naziv));
      expect(naslovi(html, 2)).not.toContain(t.sto.status);
      expect(tekst(html)).not.toContain(t.sto.status);
    }
  });
});

describe("the optional occupancy module (zauzetost=1)", () => {
  const MODUL: IzlogSearchParams = { zauzetost: "1" };

  test("the legend lists the four states", () => {
    const natpisi = legenda(izlog({ ...RASPORED, ...MODUL }));
    expect(tekst(natpisi)).toContain(t.sala.legendaZauzetost);
    for (const stanje of OCCUPANCY_STATES) {
      expect(natpisi, stanje).toContain(`data-zauzetost="${stanje}"`);
      expect(tekst(natpisi), stanje).toContain(t.zauzetost[stanje]);
    }
    expect(count(natpisi, "data-zauzetost=")).toBe(OCCUPANCY_STATES.length);
  });

  test("Sto 1 (occupied in the fixture) is marked on the tile; an unmarked table has no mark", () => {
    const html = izlog({ ...RASPORED, ...MODUL });
    const sto1 = plocice(html, mestoId("Sto 1"))[0];
    expect(attr(sto1.otvor, "data-zauzetost")).toBe("occupied");
    expect(sto1.markup).toContain('data-zauzetost="occupied"');
    expect(sto1.ime).toContain(`${t.sto.status}: ${t.zauzetost.occupied}`);
    const sto12 = plocice(html, mestoId("Sto 12"))[0];
    expect(sto12.otvor).not.toContain("data-zauzetost");
    expect(sto12.markup).not.toContain("data-zauzetost");
    expect(sto12.ime).toContain(t.sala.neutralnoCitac);
    const stanja = Object.fromEntries(
      [["Sto 2", "free"], ["Sto 4", "reserved"], ["Sto 10", "out_of_service"]].map(([naziv, stanje]) => [
        naziv,
        attr(plocice(html, mestoId(naziv))[0].otvor, "data-zauzetost") === stanje,
      ]),
    );
    expect(stanja).toEqual({ "Sto 2": true, "Sto 4": true, "Sto 10": true });
  });

  test("the table view gets the status column: the state in words, a dash with 'Bez oznake' for an unmarked table", () => {
    const html = izlog({ ...TABELA, ...MODUL });
    const zaglavlja = zaglavljaTabele(html);
    // The status column comes right after the table, so it is never the one cut off.
    expect(zaglavlja).toEqual([
      t.sala.kolone.sto,
      t.sala.kolone.status,
      t.sala.kolone.call,
      t.sala.kolone.order,
      t.sala.kolone.bill,
      t.sala.kolone.konobar,
    ]);
    const status = (naziv: string) => celije(redTabele(html, mestoId(naziv)))[zaglavlja.indexOf(t.sala.kolone.status)];
    expect(status("Sto 1").tekst).toBe(t.zauzetost.occupied);
    expect(status("Sto 1").markup).toContain('data-zauzetost="occupied"');
    expect(status("Sto 12").tekst).toBe(`${t.sala.neutralno} ${t.sto.neutralno}`);
    expect(status("Sto 12").markup).not.toContain("data-zauzetost");
  });

  test("the status section of Sto 1: four buttons, only 'Zauzet' pressed, the current state, and 'Ukloni oznaku'", () => {
    const html = izlog(sto("Sto 1", MODUL));
    const odeljak = izdvoji(html, /(<section aria-labelledby="sto-status"[\s\S]*?<\/section>)/);
    expect(naslovi(odeljak, 2)).toEqual([t.sto.status]);
    expect(html).toContain("data-sto-zauzetost");

    const dugmici = dugmad(odeljak).filter((b) => attr(b.otvor, "data-zauzetost-dugme") !== undefined);
    expect(dugmici.map((b) => attr(b.otvor, "data-zauzetost-dugme"))).toEqual([...OCCUPANCY_STATES]);
    expect(dugmici.map((b) => b.tekst)).toEqual(OCCUPANCY_STATES.map((stanje) => t.zauzetost[stanje]));
    expect(dugmici.map((b) => b.pritisnuto)).toEqual(["false", "true", "false", "false"]);
    expect(dugmici.every((b) => imaMin48(b.klase) && !b.iskljuceno)).toBe(true);

    const trenutno = /<p data-zauzetost-trenutno="([^"]*)"[^>]*>([\s\S]*?)<\/p>/.exec(odeljak);
    expect(trenutno?.[1]).toBe("occupied");
    expect(tekst(trenutno?.[2] ?? "")).toBe(
      fmt(t.sto.statusPromenio, { stanje: t.zauzetost.occupied, vreme: clockTime(pre(20)), ime: KONOBAR_IZLOG_OSOBA }),
    );
    const ukloni = dugme(odeljak, t.sto.ukloniOznaku);
    expect(ukloni).toBeDefined();
    expect(imaMin48(ukloni?.klase ?? "")).toBe(true);
    expect(ukloni?.iskljuceno).toBe(false);
  });

  test("an unmarked table (Sto 12) has no pressed button, the neutral current state and no 'Ukloni oznaku'", () => {
    const html = izlog(sto("Sto 12", MODUL));
    const odeljak = izdvoji(html, /(<section aria-labelledby="sto-status"[\s\S]*?<\/section>)/);
    const dugmici = dugmad(odeljak).filter((b) => attr(b.otvor, "data-zauzetost-dugme") !== undefined);
    expect(dugmici).toHaveLength(OCCUPANCY_STATES.length);
    expect(dugmici.every((b) => b.pritisnuto === "false")).toBe(true);
    const trenutno = /<p data-zauzetost-trenutno="([^"]*)"[^>]*>([\s\S]*?)<\/p>/.exec(odeljak);
    expect(trenutno?.[1]).toBe("neutral");
    expect(tekst(trenutno?.[2] ?? "")).toBe(`${t.sto.neutralno} — ${t.sto.neutralnoOpis}`);
    expect(dugme(odeljak, t.sto.ukloniOznaku)).toBeUndefined();
    expect(odeljak).not.toContain("data-zauzetost-ukloni");
  });
});

// --- 3. Late ------------------------------------------------------------------------

describe("late waits (default threshold 15 min)", () => {
  test("only Sto 1 / rq_04 is late: on the floor and in the queue", () => {
    const html = izlog();
    const naSali = sveMesta(stranaSale(html)).filter((b) => jeKasni(b.markup));
    expect(naSali.map((b) => nazivMesta.get(attr(b.otvor, "data-mesto") ?? ""))).toEqual(["Sto 1"]);

    const red = bocniPano(html);
    expect(redosled(red).filter((id) => jeKasni(kartica(red, id)))).toEqual(["rq_04"]);
  });

  test("on the floor the late badge and the wait carry the late chip; a calm one does not", () => {
    const html = izlog(RASPORED);
    const sto1 = plocice(html, mestoId("Sto 1"))[0];
    const oznaka = izdvoji(sto1.markup, /(<span\b[^>]*data-znacka="call"[^>]*>)/);
    expect(attr(oznaka, "data-kasni")).toBe("true");
    const klase = (attr(oznaka, "class") ?? "").split(/\s+/);
    for (const klasa of ["relative", "rounded-full", "bg-[var(--mp-opasnost-meko)]"]) expect(klase, klasa).toContain(klasa);
    if (typeof stil.kasni === "string" && stil.kasni !== "") expect(klase).toContain(stil.kasni);
    // After the UX review the wait lives in the badge of its kind (no separate, unlabelled wait under the name).
    expect(klaseSa(sto1.markup, "bg-[var(--mp-opasnost-meko)]")).toHaveLength(1);
    // Oldest first: at Sto 3 the order (14 min) stands before the call (8 min).
    expect(znacke(plocice(html, mestoId("Sto 3"))[0])).toEqual(["order", "call"]);
    expect(sto1.markup).toMatch(/data-znacka="call"[\s\S]*?17:00/);

    const sto3 = plocice(html, mestoId("Sto 3"))[0];
    expect(jeKasni(sto3.markup)).toBe(false);
    expect(sto3.markup).not.toContain("bg-[var(--mp-opasnost-meko)]");
    if (typeof stil.kasni === "string" && stil.kasni !== "") expect(sto3.markup).not.toMatch(new RegExp(`\\s${stil.kasni}(\\s|")`));
  });

  test("in the table view the late cell says 'kasni' in words and carries the late chip", () => {
    const html = izlog(TABELA);
    expect(count(html, ' data-kasni=""')).toBe(1);
    expect(count(html, ' data-lista-kasni=""')).toBe(1);

    const zaglavlja = zaglavljaTabele(html);
    const red = celije(redTabele(html, mestoId("Sto 1")));
    const poziv = red[zaglavlja.indexOf(t.sala.kolone.call)];
    expect(poziv.otvor).toContain('data-kasni=""');
    expect(tekst(poziv.markup)).toContain(t.vreme.kasni);
    expect(tekst(poziv.markup)).toContain(`${citac("call", 17 * 60).split(" od ")[1]}, ${t.vreme.kasni}`);
    expect(klaseSa(poziv.markup, "bg-[var(--mp-opasnost-meko)]")).toHaveLength(1);
    expect(klaseSa(poziv.markup, "relative")[0]).toContain("rounded-full");
    if (typeof stil.kasni === "string" && stil.kasni !== "") expect(klaseSa(poziv.markup, stil.kasni)).toHaveLength(1);
    // A calm cell is neither marked nor tinted.
    const mirno = celije(redTabele(html, mestoId("Sto 3")))[zaglavlja.indexOf(t.sala.kolone.call)];
    expect(mirno.otvor).not.toContain("data-kasni");
    expect(mirno.markup).not.toContain("bg-[var(--mp-opasnost-meko)]");
  });

  test("the queue card of rq_04 carries the late chip and the word 'kasni'", () => {
    const html = izlog();
    const kasni = kartica(html, "rq_04");
    expect(tekst(kasni)).toContain(t.vreme.kasni);
    expect(klaseSa(kasni, "bg-[var(--mp-opasnost-meko)]").length).toBeGreaterThanOrEqual(1);
    expect(klaseSa(kasni, "bg-[var(--mp-opasnost-meko)]")[0]).toContain("relative");
    expect(klaseSa(kasni, "bg-[var(--mp-opasnost-meko)]")[0]).toContain("rounded-full");
    if (typeof stil.kasni === "string" && stil.kasni !== "") expect(klaseSa(kasni, stil.kasni).length).toBeGreaterThanOrEqual(1);
    const mirna = kartica(html, "rq_01");
    expect(mirna).not.toContain("bg-[var(--mp-opasnost-meko)]");
    expect(tekst(mirna)).not.toContain(t.vreme.kasni);
  });
});

describe("late waits with the venue's own threshold (kasni=1: 5 minutes)", () => {
  const KASNI: IzlogSearchParams = { kasni: "1" };

  test("more requests are late in the queue and the legend names 5 minutes", () => {
    const html = izlog({ ...RASPORED, ...KASNI });
    const red = bocniPano(html);
    const kasne = redosled(red).filter((id) => jeKasni(kartica(red, id)));
    for (const id of ["rq_01", "rq_03", "rq_04"]) expect(kasne, id).toContain(id);
    expect(kasne).not.toContain("rq_02");
    expect(kasne.length).toBeGreaterThan(1);
    expect(tekst(legenda(html))).toContain(fmt(t.sala.legendaKasni, { n: 5 }));
    expect(tekst(legenda(html))).not.toContain(fmt(t.sala.legendaKasni, { n: DEFAULT_PANEL_TIMING.lateThresholdMin }));
  });

  test("on the floor each kind is judged by its own oldest request", () => {
    const html = izlog({ ...RASPORED, ...KASNI });
    const kasniZnacke = (naziv: string) =>
      Object.fromEntries(
        [...plocice(html, mestoId(naziv))[0].markup.matchAll(/<span\b[^>]*data-znacka="([a-z]+)"[^>]*>/g)].map((m) => [m[1], jeKasni(m[0])]),
      );
    expect(kasniZnacke("Sto 1")).toEqual({ call: true });
    expect(kasniZnacke("Sto 3")).toEqual({ call: true, order: true });
    expect(kasniZnacke("Sto 5")).toEqual({ call: true, bill: false });
    expect(kasniZnacke("Sto 7").order).toBe(true);
    expect(jeKasni(plocice(html, mestoId("Sto 2"))[0].markup)).toBe(false);
  });
});

describe("the late chip's motion (konobar.module.css)", () => {
  const CSS = readFileSync(join(process.cwd(), "components/menu/konobar/konobar.module.css"), "utf8").replace(/\r\n/g, "\n");
  const MEDIA = "@media (prefers-reduced-motion: reduce)";
  const pocetakMedije = CSS.indexOf(MEDIA);
  const pravilo = (css: string) => /\.kasni::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  test("the reduced-motion block exists after the base rules", () => {
    expect(pocetakMedije).toBeGreaterThan(0);
  });

  test("outside reduced motion the ring pulses once every 10 seconds", () => {
    expect(pravilo(CSS.slice(0, pocetakMedije))).toMatch(/animation:\s*kasniPuls 10s/);
  });

  test("with reduced motion the ring stands still and stays visible (a static emphasis)", () => {
    const pravilnik = pravilo(CSS.slice(pocetakMedije));
    expect(pravilnik).toMatch(/animation:\s*none;/);
    expect(pravilnik).toMatch(/opacity:\s*1;/);
  });
});

// --- 4. The table detail ------------------------------------------------------------

describe("the table detail (ekran=sto: Sto 3)", () => {
  const html = izlog(STO_3);
  const pano = bocniPano(html);

  test("it fills the one contextual pane, with exactly one h1: the table", () => {
    expect(kontekstPana(html)).toBe("sto");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual(["Sto 3"]);
    expect(pano).toContain(`<section aria-labelledby="sto-naslov" class="grid content-start gap-6" data-sto="${mestoId("Sto 3")}">`);
    expect(naslovi(pano, 2)).toEqual([t.sto.aktivni]);
  });

  test("the zone and seats line, and the QR cards of the table", () => {
    const mesto = SALA.positions.find((kandidat) => kandidat.label === "Sto 3")!;
    const sedista = fmt(t.sala.sedista[srPluralCategory(mesto.seats ?? 0)], { n: mesto.seats ?? 0 });
    expect(tekst(izdvoji(pano, /(<header\b[\s\S]*?<\/header>)/))).toContain(`Glavna sala · ${sedista}`);

    const kartice = fixtureSale().kartice[mestoId("Sto 3")]?.cards ?? [];
    const red = izdvoji(pano, /<p data-sto-kartice[^>]*>([\s\S]*?)<\/p>/);
    expect(tekst(red)).toBe(
      kartice.length > 0 ? kartice.map((kartica) => fmt(t.sto.kartica, { naziv: kartica.label })).join(", ") : t.sto.bezKartice,
    );
  });

  test("both active requests are articles in the queue's order, each with one main action of at least 48 px", () => {
    expect(redosled(pano)).toEqual(["rq_01", "rq_05"]);
    const radnje = { rq_01: t.red.radnja.accept, rq_05: t.red.radnja.complete };
    for (const [id, radnja] of Object.entries(radnje)) {
      const zahtev = zahtevPo(id);
      const [naslov, akcija, ...ostalo] = dugmad(kartica(pano, id));
      expect(ostalo, id).toHaveLength(0);
      expect(naslov.ime, id).toBe(fmt(t.red.otvori, { vrsta: vrstaNaslov(zahtev), mesto: "Sto 3" }));
      expect(akcija.tekst, id).toBe(radnja);
      expect(akcija.ime, id).toBe(fmt(t.red.radnjaCitac, { radnja, vrsta: vrstaNaslov(zahtev), mesto: "Sto 3" }));
      expect(imaMin48(akcija.klase), `${id}: ${akcija.klase}`).toBe(true);
      expect(akcija.iskljuceno, id).toBe(false);
    }
  });

  test("the back button is named for the floor on a phone and shows its short word", () => {
    const nazad = dugmad(pano).find((b) => b.ime === t.sto.nazadSalaCitac);
    expect(nazad?.tekst).toBe(t.sto.nazadSala);
    expect(imaMin48(nazad?.klase ?? "")).toBe(true);
    expect(dugmad(pano).some((b) => b.ime === t.sto.nazadRedCitac)).toBe(false);
  });

  test("there is no 'Status stola' heading without the module", () => {
    expect(naslovi(html, 2)).not.toContain(t.sto.status);
    expect(html).not.toContain("data-sto-zauzetost");
  });

  test("on the floor the table's tile is pressed and no other is", () => {
    const sala = stranaSale(html);
    const tiles = sveMesta(sala);
    expect(tiles.filter((b) => b.pritisnuto === "true").map((b) => attr(b.otvor, "data-mesto"))).toEqual([mestoId("Sto 3")]);
    expect(tiles.every((b) => b.pritisnuto === "true" || b.pritisnuto === "false")).toBe(true);
    expect(plocice(sala, mestoId("Sto 3"))[0].pritisnuto).toBe("true");
  });

  test("a table with nothing active says so in words and shows no request", () => {
    const sto9 = izlog(sto("Sto 9"));
    expect(naslovi(sto9, 1)).toEqual(["Sto 9"]);
    expect(redosled(sto9)).toEqual([]);
    expect(tekst(bocniPano(sto9))).toContain(t.sto.nemaAktivnih.table);
    expect(tekst(izdvoji(bocniPano(sto9), /(<header\b[\s\S]*?<\/header>)/))).toContain("Terasa");
  });

  test("an unknown table in the address falls back to Sto 3", () => {
    expect(naslovi(izlog(sto("Sto 99")), 1)).toEqual(["Sto 3"]);
  });
});

// --- 5. Zones -----------------------------------------------------------------------

describe("zones", () => {
  const zonaDugme = (html: string, naziv: string) => dugmad(html).find((b) => b.ime === fmt(t.zona.meniCitac, { zona: naziv }));

  test("by default every zone: the control says so, the floor has every surface and the queue every request", () => {
    const html = izlog(RASPORED);
    expect(zonaDugme(html, t.zona.sve)).toBeDefined();
    expect(html).toContain("data-zona-izbor");
    expect(naslovi(stranaSale(html), 3)).toEqual([
      ...SALA.zones.map((zona) => naslovPovrsi(zona.name, uZoni(zona.id))),
      naslovPovrsi(t.sala.bezZone, uZoni(null)),
    ]);
    expect(sveMesta(stranaSale(html))).toHaveLength(SALA.positions.length);
    expect(redosled(bocniPano(html))).toHaveLength(FX.zahtevi.length);
  });

  test("zona=Terasa: the control names it, the floor keeps Terasa and 'Bez zone' only, the queue is empty", () => {
    const html = izlog({ ...RASPORED, zona: "Terasa" });
    expect(zonaDugme(html, "Terasa")).toBeDefined();
    expect(zonaDugme(html, t.zona.sve)).toBeUndefined();

    const sala = stranaSale(html);
    expect(naslovi(sala, 3)).toEqual([naslovPovrsi("Terasa", uZoni(zonaId("Terasa"))), naslovPovrsi(t.sala.bezZone, uZoni(null))]);
    const ocekivana = SALA.positions.filter((mesto) => mesto.zoneId === zonaId("Terasa") || mesto.zoneId === null).map((mesto) => mesto.id);
    expect(sveMesta(sala).map((b) => attr(b.otvor, "data-mesto"))).toHaveLength(ocekivana.length);
    expect(new Set(sveMesta(sala).map((b) => attr(b.otvor, "data-mesto")))).toEqual(new Set(ocekivana));
    for (const naziv of ["Sto 1", "Sto 3", "Sto 8", "Sto 13"]) expect(plocice(sala, mestoId(naziv)), naziv).toHaveLength(0);

    // All K07 requests are at tables of Glavna sala, so a waiter of the terrace has an empty queue.
    const red = bocniPano(html);
    expect(redosled(red)).toEqual([]);
    expect(naslovi(red, 1)).toEqual([t.red.naslov]);
    expect(naslovi(red, 2)).toEqual([t.red.prazno.naslov]);
    expect(tekst(sala)).toContain(t.zaglavlje.bezAktivnih);
  });

  test("zona=Terasa never hides what waits elsewhere: a strip in the queue and on the floor, one tap back to every zone", () => {
    const html = izlog({ ...RASPORED, zona: "Terasa" });
    const poruka = `${fmt(t.zona.vanZone[srPluralCategory(7)], { n: 7 })} · ${fmt(t.zona.vanZoneKasni, { n: 1 })}`;
    const trake = [...html.matchAll(/<div role="status" data-van-zone[^>]*>([\s\S]*?)<\/div>/g)].map((m) => tekst(m[1]));
    expect(trake).toHaveLength(2);
    for (const traka of trake) {
      expect(traka).toContain(poruka);
      expect(traka).toContain(t.zona.prikaziSve);
    }
    expect(tekst(stranaSale(html))).toContain(fmt(t.sala.zonaPodnaslov, { zona: "Terasa" }));
    // Every zone: no strip, no subtitle.
    expect(izlog(RASPORED)).not.toContain("data-van-zone");
    expect(izlog(RASPORED)).not.toContain("data-sala-zona");
  });

  test("zona=Glavna sala: its requests stay in the queue and the other zones leave the floor", () => {
    const html = izlog({ ...RASPORED, zona: "Glavna sala" });
    expect(zonaDugme(html, "Glavna sala")).toBeDefined();
    expect(redosled(bocniPano(html))).toHaveLength(FX.zahtevi.length);
    expect(plocice(stranaSale(html), mestoId("Sto 9"))).toHaveLength(0);
    expect(plocice(stranaSale(html), mestoId("Sto 3"))).toHaveLength(1);
  });

  test("the table view keeps the filter too", () => {
    const html = izlog({ ...TABELA, zona: "Terasa" });
    expect(html.split(/<tr\b/).filter((deo) => deo.includes("data-mesto="))).toHaveLength(uZoni(zonaId("Terasa")) + uZoni(null));
    expect(plocice(html, mestoId("Sto 3"))).toHaveLength(0);
  });

  test("the Manager's account has the same zone control, and only the Manager's account can assign zones", () => {
    const menadzer = izlog({ ...RASPORED, uloga: "menadzer" });
    expect(zonaDugme(menadzer, t.zona.sve)).toBeDefined();
    expect(menadzer).toContain("data-zona-izbor");
    expect(zonaDugme(izlog({ ...RASPORED, uloga: "menadzer", zona: "Terasa" }), "Terasa")).toBeDefined();
    // The menu (and its "Raspodela zona") opens only on a tap.
    expect(tekst(menadzer)).not.toContain(t.zona.raspodela);

    expect(fixtureSale({ uloga: "menadzer" }).sala.me.canAssignZones).toBe(true);
    expect(fixtureSale({ uloga: "menadzer" }).sala.me.staffId).toBeNull();
    expect(fixtureSale({ uloga: "osoblje" }).sala.me.canAssignZones).toBe(false);
    expect(fixtureSale().sala.me.canAssignZones).toBe(false);
  });
});

// --- 6. Sound -----------------------------------------------------------------------

describe("the sound switch in the header", () => {
  const zvuk = (html: string) => {
    const dugmici = dugmad(html).filter((b) => attr(b.otvor, "data-zvuk") !== undefined);
    expect(dugmici).toHaveLength(1);
    return dugmici[0];
  };

  test("by default the sound is on: pressed, named for what it does, titled 'Zvuk uključen'", () => {
    const b = zvuk(izlog());
    expect(attr(b.otvor, "data-zvuk")).toBe("ukljucen");
    expect(b.pritisnuto).toBe("true");
    expect(b.ime).toBe(t.zvuk.oznaka);
    expect(attr(b.otvor, "title")).toBe(t.zvuk.ukljucen);
    expect(imaMin48(b.klase)).toBe(true);
  });

  test("zvuk=iskljucen starts with the sound off: not pressed, titled 'Zvuk isključen', the same name", () => {
    for (const upit of [{ zvuk: "iskljucen" }, { ...RASPORED, zvuk: "iskljucen" }, { ...STO_3, zvuk: "iskljucen" }]) {
      const b = zvuk(izlog(upit));
      expect(attr(b.otvor, "data-zvuk")).toBe("iskljucen");
      expect(b.pritisnuto).toBe("false");
      expect(b.ime).toBe(t.zvuk.oznaka);
      expect(attr(b.otvor, "title")).toBe(t.zvuk.iskljucen);
    }
  });
});

// --- 7. Offline ---------------------------------------------------------------------

describe("offline", () => {
  test("the table detail: every main action waits, the reason is shown once, the titles still open", () => {
    const html = izlog(sto("Sto 3", { stanje: "offline" }));
    const pano = bocniPano(html);
    for (const id of ["rq_01", "rq_05"]) {
      const [naslov, akcija] = dugmad(kartica(pano, id));
      expect(akcija.iskljuceno, id).toBe(true);
      expect(attr(akcija.otvor, "aria-describedby"), id).toBe("sto-razlog");
      expect(naslov.iskljuceno, id).toBe(false);
    }
    expect(count(tekst(html), t.detalj.offline)).toBe(1);
    expect(count(html, 'id="sto-razlog"')).toBe(1);
    expect(dugmad(pano).find((b) => b.ime === t.sto.nazadSalaCitac)?.iskljuceno).toBe(false);
    expect(html).toContain('data-stanje="offline"');
    expect(tekst(bocniPano(html))).toContain(z.offlineNaslov);
    expect(tekst(izdvoji(html, /(<header class="sticky[\s\S]*?<\/header>)/))).toContain(t.zaglavlje.bezVeze);
    // Online, nothing waits and no reason is given.
    const online = izlog(STO_3);
    expect(tekst(online)).not.toContain(t.detalj.offline);
    expect(dugmad(bocniPano(online)).filter((b) => b.iskljuceno)).toEqual([]);
  });

  test("with the occupancy module all four state buttons and 'Ukloni oznaku' wait too", () => {
    const html = izlog(sto("Sto 1", { stanje: "offline", zauzetost: "1" }));
    const odeljak = izdvoji(html, /(<section aria-labelledby="sto-status"[\s\S]*?<\/section>)/);
    const dugmici = dugmad(odeljak).filter((b) => attr(b.otvor, "data-zauzetost-dugme") !== undefined);
    expect(dugmici).toHaveLength(OCCUPANCY_STATES.length);
    expect(dugmici.every((b) => b.iskljuceno)).toBe(true);
    expect(dugme(odeljak, t.sto.ukloniOznaku)?.iskljuceno).toBe(true);
    expect(count(tekst(html), t.detalj.offline)).toBe(1);
  });

  test("the work queue and the floor still show the offline strip", () => {
    for (const upit of [{ stanje: "offline" }, { ...RASPORED, stanje: "offline" }, { ...TABELA, veza: "offline" }]) {
      const html = izlog(upit);
      expect(html, JSON.stringify(upit)).toContain('data-stanje="offline"');
      expect(tekst(bocniPano(html)), JSON.stringify(upit)).toContain(z.offlineNaslov);
      expect(tekst(html), JSON.stringify(upit)).toContain(fmt(z.offlineOpis, { vreme: clockTime(pre(2)) }));
    }
    expect(izlog()).not.toContain('data-stanje="offline"');
  });
});

// --- 8. Accessibility basics --------------------------------------------------------

const K23_EKRANI: [string, IzlogSearchParams][] = [
  ["sala-raspored", RASPORED],
  ["sala-tabela", TABELA],
  ["sto", STO_3],
  ["sto with the occupancy module", sto("Sto 1", { zauzetost: "1" })],
  ["sala-raspored with the occupancy module", { ...RASPORED, zauzetost: "1" }],
  ["sala-tabela with the occupancy module", { ...TABELA, zauzetost: "1" }],
];

describe("accessibility basics on the K23 screens", () => {
  test.each(K23_EKRANI)("%s: exactly one h1", (_ime, upit) => {
    expect(count(izlog(upit), "<h1")).toBe(1);
  });

  test.each(K23_EKRANI)("%s: every button has visible text or an accessible name", (_ime, upit) => {
    for (const b of dugmad(izlog(upit))) expect(b.tekst !== "" || (b.ime ?? "") !== "", JSON.stringify(b.otvor)).toBe(true);
  });

  test.each(K23_EKRANI)("%s: every floor tile and table-row button reports aria-pressed", (_ime, upit) => {
    const mesta = sveMesta(izlog(upit));
    expect(mesta.length).toBeGreaterThan(0);
    for (const b of mesta) expect(["true", "false"], b.ime).toContain(b.pritisnuto);
  });

  test.each(K23_EKRANI)("%s: every floor tile and table-row button has an accessible name, and every state button reports aria-pressed", (_ime, upit) => {
    const html = izlog(upit);
    for (const b of sveMesta(html)) expect((b.ime ?? "").length, b.otvor).toBeGreaterThan(0);
    for (const b of dugmad(html).filter((kandidat) => attr(kandidat.otvor, "data-zauzetost-dugme") !== undefined)) {
      expect(["true", "false"], b.tekst).toContain(b.pritisnuto);
    }
  });

  test("the floor and the queue are named regions: the Sala section, the legend, the zone surfaces", () => {
    const html = izlog(RASPORED);
    expect(html).toContain('<section aria-labelledby="sala-naslov"');
    expect(html).toContain(`aria-label="${t.sala.legenda}"`);
    expect(count(html, 'id="sala-naslov"')).toBe(1);
    for (const zona of SALA.zones) expect(count(html, `id="sala-zona-${zona.id}"`), zona.name).toBe(1);
  });
});

// --- 9. The view model (sala/pogled.ts) ---------------------------------------------

describe("the view model of the floor", () => {
  const labele = (mesta: { label: string }[]) => mesta.map((mesto) => mesto.label);

  test("mestaSale sorts by label with numbers as numbers: Sto 2 before Sto 10", () => {
    const redom = labele(mestaSale({ sala: SALA, zahtevi: [] }));
    expect(redom.indexOf("Sto 2")).toBeGreaterThanOrEqual(0);
    expect(redom.indexOf("Sto 2")).toBeLessThan(redom.indexOf("Sto 10"));
    expect(redom.filter((label) => label.startsWith("Sto "))).toEqual(Array.from({ length: 15 }, (_, i) => `Sto ${i + 1}`));
    expect(redom).toHaveLength(SALA.positions.length);
  });

  test("a zone filter keeps the zone's positions and those without a zone", () => {
    const terasa = zonaId("Terasa");
    const ocekivano = SALA.positions.filter((mesto) => mesto.zoneId === terasa || mesto.zoneId === null).map((mesto) => mesto.label);
    const redom = labele(mestaSale({ sala: SALA, zahtevi: [], filterZoneId: terasa }));
    expect(new Set(redom)).toEqual(new Set(ocekivano));
    expect(redom).toHaveLength(ocekivano.length);
    expect(redom).toContain("Sto 12");
    expect(redom).not.toContain("Sto 3");
    // A zone that no longer exists is every zone.
    expect(mestaSale({ sala: SALA, zahtevi: [], filterZoneId: "zn_nema" })).toHaveLength(SALA.positions.length);
  });

  test("every active request is counted under its kind: the kinds of a table are parallel, not one 'main' state", () => {
    const mesta = mestaSale({ sala: SALA, zahtevi: FX.zahtevi });
    const vrste = (naziv: string) => Object.keys(mesta.find((mesto) => mesto.label === naziv)!.summary.kinds).sort();
    expect(vrste("Sto 3")).toEqual(["call", "order"]);
    expect(vrste("Sto 5")).toEqual(["bill", "call"]);
    expect(vrste("Sto 7")).toEqual(["bill", "order"]);
    expect(vrste("Sto 1")).toEqual(["call"]);
    expect(vrste("Sto 2")).toEqual([]);
    expect(mesta.find((mesto) => mesto.label === "Sto 3")!.summary.active).toBe(2);
  });

  test("occupancy is neutral without the module, even when occupancy rows exist", () => {
    const sa = fixtureSale({ zauzetost: true });
    expect(sa.zauzetost.off).toBe(false);
    const bez = mestaSale({ sala: { ...sa.sala, occupancyEnabled: false }, zahtevi: [], zauzetost: sa.zauzetost });
    expect(bez.every((mesto) => mesto.occupancy === "neutral" && mesto.occupancyMeta === null)).toBe(true);
    // The module off on the other side (the rows are not read) gives the same.
    expect(mestaSale({ sala: sa.sala, zahtevi: [], zauzetost: { off: true } }).every((mesto) => mesto.occupancy === "neutral")).toBe(true);
    // Control: with the module the rows are shown, an unmarked table stays neutral.
    const sMod = mestaSale({ sala: sa.sala, zahtevi: [], zauzetost: sa.zauzetost });
    const po = (naziv: string) => sMod.find((mesto) => mesto.label === naziv)!;
    expect(po("Sto 1").occupancy).toBe("occupied");
    expect(po("Sto 2").occupancy).toBe("free");
    expect(po("Sto 12").occupancy).toBe("neutral");
    expect(po("Sto 1").occupancyMeta?.updatedBy).toBe(KONOBAR_IZLOG_OSOBA);
  });

  test("opisMestaSale of a neutral table says there is nothing active, never 'free'", () => {
    const mesta = mestaSale({ sala: SALA, zahtevi: [] });
    const sto2 = mesta.find((mesto) => mesto.label === "Sto 2")!;
    expect(opisMestaSale(sto2, IZLOG_SADA)).toBe(fmt(t.sala.mestoCitac, { mesto: "Sto 2, Glavna sala", stanje: t.sala.neutralnoCitac }));
    expect(opisMestaSale(sto2, IZLOG_SADA)).toContain(t.sala.neutralnoCitac);
    expect(opisMestaSale(sto2, IZLOG_SADA).toLowerCase()).not.toContain("slobodan");
  });

  test("opisMestaSale names every state of an active table and, with the module, the manual status", () => {
    const sa = fixtureSale({ zauzetost: true });
    const mesta = mestaSale({ sala: sa.sala, zahtevi: FX.zahtevi, zauzetost: sa.zauzetost });
    const sto3 = mesta.find((mesto) => mesto.label === "Sto 3")!;
    const opis = opisMestaSale(sto3, IZLOG_SADA);
    expect(opis).toContain(citac("call", 8 * 60 + 12));
    expect(opis).toContain(citac("order", 14 * 60));
    expect(opis).not.toContain(t.sala.neutralnoCitac);
    expect(opis.endsWith(`${t.sto.status}: ${t.zauzetost.occupied}`)).toBe(true);
  });
});
