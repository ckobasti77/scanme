// K25 render tests: reservations in the waiter panel (components/menu/konobar/rezervacije,
// the queue, the floor, the table detail) over the izlog fixture "Demo restoran" at 18:27 in
// Belgrade (fixtureKonobarRezervacije = K07's eight reservations, hold 15 min). Server markup only
// (renderToStaticMarkup, no DOM): effects do not run and useSyncExternalStore answers with its
// server snapshot, so the clock stands at IZLOG_SADA. Texts are read from the dictionaries; the only
// Serbian literals are the guests' invented names and "slobodan", the word that must be ABSENT.
// Invented data only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  fixtureKonobar,
  fixtureKonobarRezervacije,
  fixtureSale,
  mestoPoNazivu,
  rezervacijeIstogStola,
} from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { belgradeLocalToEpoch, epochToBelgradeLocal } from "@/lib/belgrade-time";
import { clockTime } from "@/lib/menu/elapsed-time";
import { parseKonobarPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { reservationsByTable } from "@/lib/menu/reservation-queue";
import stil from "./konobar.module.css";
import type { KonobarRadnje, KonobarRezervacija, KonobarRezervacije } from "./model";
import { KonobarPanel, type KonobarPanelProps } from "./panel";
import { RadniRed } from "./radni-red/radni-red";
import { DetaljRezervacije, mejlHref, telefonHref, type DetaljRezervacijeProps } from "./rezervacije/detalj-rezervacije";
import { KarticaRezervacije, glavnaRadnjaRezervacije } from "./rezervacije/kartica-rezervacije";
import { primeniRezervaciju, type RezKontekst, type RezMemorija } from "./rezervacije/memorija";
import { msDoSledecegSata, okvirOd } from "./rezervacije/okvir-vremena";
import { PredlogIzmene } from "./rezervacije/predlog-izmene";
import { predlogDatumi, predlogVremena, prviPredlog } from "./rezervacije/predlog-vreme";
import { RezervacijeStola } from "./rezervacije/rezervacije-stola";
import { grupisiMesta } from "./rezervacije/vezivanje-stola";
import { mestaSale, opisMestaSale } from "./sala/pogled";

const t = menuKonobarSr;
const tr = menuKonobarSr.rezervacije;
const d = menuDomenSr;

// --- Helpers (markup is read back with small regexes, as in konobar.test.tsx) ----------

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

const naslovi = (html: string, nivo: 1 | 2 | 3): string[] =>
  [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((m) => tekst(m[1]));

function izdvoji(html: string, re: RegExp): string {
  const unutra = re.exec(html)?.[1];
  if (unutra === undefined) throw new Error(`markup part not found: ${re}`);
  return unutra;
}

type DugmeMarkup = {
  otvor: string;
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
const imaMin48 = (klase: string) => /\bmin-h-(12|14|16)\b/.test(klase);
const klaseSa = (markup: string, trazeno: string) =>
  [...markup.matchAll(/\sclass="([^"]*)"/g)].map((m) => unesc(m[1]).split(/\s+/)).filter((klase) => klase.includes(trazeno));
const kasniKlasa = typeof stil.kasni === "string" && stil.kasni !== "" ? stil.kasni : null;

const rezKartica = (html: string, id: string) =>
  izdvoji(html, new RegExp(`(<article\\b[^>]*data-rezervacija="${id}"[^>]*>[\\s\\S]*?</article>)`));
const redosledRez = (html: string) => [...html.matchAll(/<article data-rezervacija="([^"]+)"/g)].map((m) => m[1]);
const redosledZahtevi = (html: string) => [...html.matchAll(/<article data-zahtev="([^"]+)"/g)].map((m) => m[1]);

/** The status label of a card or detail: an icon right before a word. */
function statusKartice(html: string): string | null {
  const m = /<span data-status-ton="[a-z]+"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span class="min-w-0">([\s\S]*?)<\/span><\/span>/.exec(html);
  return m ? tekst(m[1]) : null;
}

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
const plocice = (html: string, id: string) => dugmad(html).filter((b) => attr(b.otvor, "data-mesto") === id);

function redTabele(html: string, id: string): string {
  const red = html.split(/<tr\b/).find((deo) => deo.includes(`data-mesto="${id}"`));
  if (red === undefined) throw new Error(`table row not found for ${id}`);
  return red;
}

const celije = (red: string) =>
  [...red.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, , otvor, unutra]) => ({ otvor, markup: unutra, tekst: tekst(unutra) }));
const zaglavljaTabele = (html: string) =>
  [...izdvoji(html, /<thead>([\s\S]*?)<\/thead>/).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => tekst(m[1]));
const filteri = (html: string) => dugmad(izdvoji(html, new RegExp(`<div role="group" aria-label="${t.red.filteri}"[^>]*>([\\s\\S]*?)</div>`)));

// --- Fixtures and renderers ---------------------------------------------------------

const FX = fixtureKonobar();
const REZ = fixtureKonobarRezervacije();
const SALA_FX = fixtureSale();
const SALA = SALA_FX.sala;
const NISTA = () => undefined;
const salaIshod = async () => ({ ok: true as const, changed: true });
const rezIshod = async () => ({ ok: true as const, status: "accepted" as const, changed: true });
const ishod = (status: "accepted" | "done" | "cancelled") => async () => ({ ok: true as const, status, changed: true });
const RADNJE: KonobarRadnje = {
  preuzmi: ishod("accepted"),
  zavrsi: ishod("done"),
  otkazi: ishod("cancelled"),
  odjava: NISTA,
  postaviZauzetost: salaIshod,
  postaviMojuZonu: salaIshod,
  postaviZonuOsoblja: salaIshod,
  prihvatiRezervaciju: rezIshod,
  odbijRezervaciju: rezIshod,
  predloziIzmenu: rezIshod,
  gostPrihvataPredlog: rezIshod,
  otkaziRezervaciju: rezIshod,
  poveziSto: rezIshod,
  gostiStigli: rezIshod,
};

const red = (id: string): KonobarRezervacija => REZ.rezervacije.rows.find((kandidat) => kandidat.id === id)!;
const detaljRez = (id: string, rezervacije: KonobarRezervacije = REZ.rezervacije) => ({
  ...REZ.detalji[id],
  sameTable: rezervacijeIstogStola(rezervacije.rows, REZ.detalji[id].reservation),
});

function mestoId(naziv: string): string {
  const id = mestoPoNazivu(SALA, naziv);
  if (id === null) throw new Error(`fixture has no position "${naziv}"`);
  return id;
}

function panel(preko: Partial<KonobarPanelProps> = {}): string {
  return renderToStaticMarkup(
    <KonobarPanel
      lokal={FX.lokal}
      korisnik={FX.korisnik}
      red={{ zahtevi: FX.zahtevi, skraceno: false, otkazani: FX.otkazani }}
      izabranId={null}
      detalj={undefined}
      onIzaberi={NISTA}
      radnje={RADNJE}
      veza="online"
      pocetnoMs={IZLOG_SADA}
      izlogOd={IZLOG_SADA}
      sala={SALA}
      zauzetost={SALA_FX.zauzetost}
      rezervacije={REZ.rezervacije}
      {...preko}
    />,
  );
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

const REZERVACIJE: IzlogSearchParams = { ekran: "rezervacije" };
const detaljIzloga = (id: string, preko: IzlogSearchParams = {}): IzlogSearchParams => ({ ekran: "rezervacije", rezervacija: id, ...preko });

const OSNOVA_DETALJA: Omit<DetaljRezervacijeProps, "detalj"> = {
  sala: SALA,
  sadaMs: IZLOG_SADA,
  holdMin: 15,
  zauzetostUkljucena: false,
  radi: null,
  greska: null,
  radnjeIskljucene: false,
  onNazad: NISTA,
  onPrihvati: NISTA,
  onOdbij: NISTA,
  onPredlozi: NISTA,
  onGostPrihvata: NISTA,
  onOtkazi: NISTA,
  onPoveziSto: NISTA,
  onGostiStigli: NISTA,
  onOtvoriDrugu: NISTA,
};

function detalj(id: string, preko: Partial<DetaljRezervacijeProps> = {}, rezervacije: KonobarRezervacije = REZ.rezervacije): string {
  return renderToStaticMarkup(<DetaljRezervacije {...OSNOVA_DETALJA} detalj={detaljRez(id, rezervacije)} {...preko} />);
}

const minuta = (n: number) => n * 60_000;

// --- 1. The Rezervacije filter ---------------------------------------------------------

describe("the Rezervacije filter of the work queue", () => {
  const html = izlog(REZERVACIJE);
  const pano = bocniPano(html);

  test("the three filters, Rezervacije pressed, with the count of the new ones", () => {
    expect(naslovi(html, 1)).toEqual([t.red.naslov]);
    const f = filteri(html);
    expect(f.map((b) => b.tekst.split(" ")[0])).toEqual([t.red.filter.sve, t.red.filter.zahtevi, t.red.filter.rezervacije]);
    expect(f.map((b) => b.pritisnuto)).toEqual(["false", "false", "true"]);
    expect(f.every((b) => imaMin48(b.klase))).toBe(true);
    // One new reservation (rv_01): the badge on its filter and on Sve (7 requests + 1).
    expect(f[2].tekst).toContain("1");
    expect(f[2].tekst).toContain(fmt(tr.noviBroj.one, { n: 1 }));
    expect(f[0].tekst).toBe(`${t.red.filter.sve} 8`);
    expect(f[1].tekst).toBe(`${t.red.filter.zahtevi} 7`);
  });

  test("the groups in order, with headings and counts; empty groups are not drawn", () => {
    const g = tr.grupe;
    expect(naslovi(pano, 2)).toEqual([`${g.cekajuOdgovor} 2`, `${g.kasne} 1`, `${g.uskoro} 1`, `${g.kasnije} 1`, `${g.stigli} 1`, `${g.otkazane} 1`]);
    expect(naslovi(pano, 2).join(" ")).not.toContain(g.danas);
    expect(redosledRez(pano)).toEqual(["rv_01", "rv_03", "rv_07", "rv_02", "rv_08", "rv_05", "rv_06"]);
    // A declined reservation is not listed at all.
    expect(pano).not.toContain('data-rezervacija="rv_04"');
    // The requests do not belong to this filter.
    expect(redosledZahtevi(pano)).toEqual([]);
  });

  test("the groups, each reservation under its own heading", () => {
    const grupa = (kljuc: string) => redosledRez(izdvoji(pano, new RegExp(`(<section\\b[^>]*data-rez-grupa="${kljuc}"[\\s\\S]*?</section>)`)));
    expect(grupa("cekajuOdgovor")).toEqual(["rv_01", "rv_03"]);
    expect(grupa("kasne")).toEqual(["rv_07"]);
    expect(grupa("uskoro")).toEqual(["rv_02"]);
    expect(grupa("kasnije")).toEqual(["rv_08"]);
    expect(grupa("stigli")).toEqual(["rv_05"]);
    expect(grupa("otkazane")).toEqual(["rv_06"]);
  });

  test("an empty list is an honest empty state; a venue without the form but with reservations says so", () => {
    const prazno = fixtureKonobarRezervacije({ prazno: true });
    const bez = panel({ rezervacije: prazno.rezervacije, pocetniFilterReda: "rezervacije" });
    expect(naslovi(bocniPano(bez), 2)).toEqual([t.red.praznoRezervacije.naslov]);
    expect(bocniPano(bez)).not.toContain("data-rezervacija=");
    expect(filteri(bez).map((b) => b.pritisnuto)).toEqual(["false", "false", "true"]);

    const iskljuceno = panel({ rezervacije: { ...REZ.rezervacije, mode: "off" }, pocetniFilterReda: "rezervacije" });
    expect(tekst(bocniPano(iskljuceno))).toContain(tr.iskljuceno);
    expect(redosledRez(bocniPano(iskljuceno))).toHaveLength(7);
    expect(tekst(bocniPano(panel({ pocetniFilterReda: "rezervacije" })))).not.toContain(tr.iskljuceno);
  });

  test("more than 200 of a status: the sentence says the earliest are shown", () => {
    expect(tekst(bocniPano(panel({ rezervacije: { ...REZ.rezervacije, skraceno: true }, pocetniFilterReda: "rezervacije" })))).toContain(tr.skraceno);
    expect(tekst(pano)).not.toContain(tr.skraceno);
  });

  test("the filter shows only when the venue takes reservations or has some; K22's honest empty filter stays when nothing is wired", () => {
    const naziviFiltera = (h: string) => filteri(h).map((b) => b.tekst.split(" ")[0]);
    // The form is on: shown, even without reservations.
    expect(naziviFiltera(panel({ rezervacije: fixtureKonobarRezervacije({ prazno: true }).rezervacije }))).toContain(t.red.filter.rezervacije);
    // Off and nothing to show: no filter. Still loading: no filter yet (no flash).
    expect(naziviFiltera(panel({ rezervacije: { rows: [], skraceno: false, mode: "off", holdMinutes: 15 } }))).toEqual([t.red.filter.sve, t.red.filter.zahtevi]);
    expect(naziviFiltera(panel({ rezervacije: null }))).toEqual([t.red.filter.sve, t.red.filter.zahtevi]);
    // Off, but reservations exist: shown (they stay workable, K24-16).
    expect(naziviFiltera(panel({ rezervacije: { ...REZ.rezervacije, mode: "off" } }))).toContain(t.red.filter.rezervacije);
    // Not wired at all (no `rezervacije` prop): the three filters of K22.
    expect(naziviFiltera(panel({ rezervacije: undefined }))).toEqual([t.red.filter.sve, t.red.filter.zahtevi, t.red.filter.rezervacije]);
  });
});

// --- 2. Sve and Zahtevi ----------------------------------------------------------------

describe("Sve and Zahtevi", () => {
  const html = izlog();
  const pano = bocniPano(html);

  test("Sve: the new reservation stands in Novi after the new requests, as a reservation card", () => {
    const novi = izdvoji(pano, /(<section\b[^>]*data-grupa="new"[\s\S]*?<\/section>)/);
    expect(redosledZahtevi(novi)).toEqual(["rq_04", "rq_01", "rq_03", "rq_02"]);
    expect(redosledRez(novi)).toEqual(["rv_01"]);
    expect(novi.indexOf('data-rezervacija="rv_01"')).toBeGreaterThan(novi.indexOf('data-zahtev="rq_02"'));
    // Heading count: 4 requests + 1 reservation.
    expect(naslovi(novi, 2)).toEqual([`${t.red.grupaNovi} 5`]);
    // The accepted requests are untouched.
    const prihvaceni = izdvoji(pano, /(<section\b[^>]*data-grupa="accepted"[\s\S]*?<\/section>)/);
    expect(redosledZahtevi(prihvaceni)).toEqual(["rq_05", "rq_06", "rq_12"]);
    expect(redosledRez(prihvaceni)).toEqual([]);
  });

  test("Sve: the Uskoro section under the queue has the late and the near reservations, the late one first", () => {
    const uskoro = pano.slice(pano.indexOf('<section aria-labelledby="radni-red-uskoro"'));
    expect(naslovi(uskoro, 2)).toEqual([t.red.uskoro]);
    expect(redosledRez(uskoro)).toEqual(["rv_07", "rv_02"]);
    expect(pano.indexOf('id="radni-red-uskoro"')).toBeGreaterThan(pano.indexOf('data-rezervacija="rv_01"'));
    expect(pano).not.toContain('data-rezervacija="rv_08"');
  });

  test("Zahtevi has no reservations and no Uskoro section", () => {
    const zahtevi = renderToStaticMarkup(
      <RadniRed
        red={{ zahtevi: FX.zahtevi, skraceno: false, otkazani: [] }}
        sadaMs={IZLOG_SADA}
        radiId={null}
        onOtvori={NISTA}
        onRadnja={NISTA}
        radnjeIskljucene={false}
        obavestenja={[]}
        onZatvoriObavestenje={NISTA}
        pocetniFilter="zahtevi"
        rezervacije={REZ.rezervacije}
      />,
    );
    expect(zahtevi).not.toContain("data-rezervacija=");
    expect(zahtevi).not.toContain('id="radni-red-uskoro"');
    expect(redosledZahtevi(zahtevi)).toHaveLength(FX.zahtevi.length);
    expect(filteri(zahtevi).map((b) => b.pritisnuto)).toEqual(["false", "true", "false"]);
  });

  test("no reservations at all: Sve is the K22 queue (no Uskoro, no reservation card)", () => {
    const bez = bocniPano(panel({ rezervacije: { rows: [], skraceno: false, mode: "off", holdMinutes: 15 } }));
    expect(bez).not.toContain("data-rezervacija=");
    expect(bez).not.toContain('id="radni-red-uskoro"');
    expect(redosledZahtevi(bez)).toEqual(["rq_04", "rq_01", "rq_03", "rq_02", "rq_05", "rq_06", "rq_12"]);
  });
});

// --- 3. The reservation card -------------------------------------------------------------

describe("the reservation card", () => {
  const pano = bocniPano(izlog(REZERVACIJE));
  const kartica = (id: string) => rezKartica(pano, id);
  const termin = (id: string) => {
    const r = red(id);
    return { dan: clockTime(r.requestedAt), gosti: r.partySize };
  };

  test("rv_01 (new): kind icon in its colour + the word, the guest, the term and guests, no table, a note, the status, Odgovori", () => {
    const k = kartica("rv_01");
    expect(k).toMatch(/<span aria-hidden="true" data-vrsta="reservation"[^>]*><svg/);
    expect(k).toContain("text-[var(--mp-vrsta-rezervacija)]");
    for (const druga of ["poziv", "racun", "porudzbina"]) expect(k).not.toContain(`--mp-vrsta-${druga}`);
    const sav = tekst(k);
    expect(naslovi(k, 3)).toEqual([t.sala.vrste.reservation]);
    expect(sav).toContain("Marija P.");
    expect(sav).toContain(`Danas · ${termin("rv_01").dan} · 4 osobe`);
    expect(sav).toContain(tr.bezStola);
    expect(sav).toContain(tr.imaNapomenu);
    expect(statusKartice(k)).toBe(d.reservationStatuses.new);
    expect(k).toContain('data-status="new"');
    expect(k).not.toContain("data-rez-kasni");

    const [naslov, radnja, ...ostalo] = dugmad(k);
    expect(ostalo).toHaveLength(0);
    expect(naslov.ime).toBe(fmt(tr.otvoriCitac, { ime: "Marija P.", termin: "Danas · 19:00" }));
    expect(radnja.tekst).toBe(tr.radnja.odgovori);
    expect(radnja.ime).toBe(fmt(tr.radnjaCitac, { radnja: tr.radnja.odgovori, ime: "Marija P.", termin: "Danas · 19:00" }));
    expect(imaMin48(radnja.klase)).toBe(true);
    expect(radnja.iskljuceno).toBe(false);
  });

  test("the status is always an icon AND a word, and says what it is", () => {
    const ocekivano = {
      rv_01: d.reservationStatuses.new,
      rv_03: d.reservationStatuses.change_proposed,
      rv_07: d.reservationStatuses.accepted,
      rv_02: d.reservationStatuses.accepted,
      rv_08: d.reservationStatuses.accepted,
      rv_05: d.reservationStatuses.arrived,
      rv_06: d.reservationStatuses.cancelled,
    };
    for (const [id, rec] of Object.entries(ocekivano)) expect(statusKartice(kartica(id)), id).toBe(rec);
  });

  test("rv_03 (a proposal): Odgovori too, the proposed term is named", () => {
    const k = kartica("rv_03");
    expect(dugmad(k)[1].tekst).toBe(tr.radnja.odgovori);
    expect(tekst(k)).toContain(fmt(tr.predlogKratko, { termin: "Danas · 20:15" }));
  });

  test("rv_02 (accepted, 93 minutes ahead, Sto 6): the table is named, nothing ticks, the action only opens", () => {
    const k = kartica("rv_02");
    expect(tekst(k)).toContain("Sto 6");
    expect(tekst(k)).not.toContain(tr.bezStola);
    expect(dugmad(k)[1].tekst).toBe(tr.radnja.otvori);
    expect(k).not.toContain("data-rez-faza");
    expect(k).not.toContain("data-rez-kasni");
    expect(tekst(k)).not.toContain("kasni");
    expect(tekst(k)).not.toContain("u terminu");
  });

  test("rv_07 (25 minutes past the term, hold 15): red, 'kasni 25:00', the late chip with its calm pulse, Stigli su", () => {
    const k = kartica("rv_07");
    expect(k).toContain('data-rez-kasni="true"');
    expect(k).toContain('data-rez-faza="kasni"');
    expect(tekst(k)).toContain(fmt(tr.kasni, { vreme: "25:00" }));
    expect(tekst(k)).toContain("kasni 25:00");
    // The reader hears minutes, not a number changing every second.
    expect(tekst(k)).toContain(fmt(tr.kasni, { vreme: "25 min" }));
    const chip = klaseSa(k, "bg-[var(--mp-opasnost-meko)]");
    expect(chip.length).toBeGreaterThanOrEqual(1);
    for (const klasa of ["relative", "rounded-full", "text-[var(--mp-opasnost)]"]) expect(chip[0], klasa).toContain(klasa);
    if (kasniKlasa) expect(chip[0]).toContain(kasniKlasa);
    // Word + icon + colour: the clock-alert icon is there (one more svg than a calm accepted card).
    expect(count(k, "<svg")).toBe(count(kartica("rv_02"), "<svg") + 1);
    const radnja = dugmad(k)[1];
    expect(radnja.tekst).toBe(tr.radnja.stigli);
    expect(imaMin48(radnja.klase)).toBe(true);
    expect(radnja.ime).toBe(fmt(tr.radnjaCitac, { radnja: tr.radnja.stigli, ime: "Ivana B.", termin: "Danas · 18:02" }));
  });

  test("within the hold the lateness is calm: 'u terminu · 05:00', no red, and Stigli su", () => {
    const uHoldu = { ...red("rv_07"), requestedAt: IZLOG_SADA - minuta(5) };
    const k = renderToStaticMarkup(
      <KarticaRezervacije red={uHoldu} sadaMs={IZLOG_SADA} holdMin={15} radi={false} onOtvori={NISTA} onStigli={NISTA} radnjeIskljucene={false} />,
    );
    expect(k).toContain('data-rez-faza="u-terminu"');
    expect(k).not.toContain("data-rez-kasni");
    expect(tekst(k)).toContain(fmt(tr.uTerminu, { vreme: "05:00" }));
    expect(k).not.toContain("bg-[var(--mp-opasnost-meko)]");
    expect(dugmad(k)[1].tekst).toBe(tr.radnja.stigli);
    // The venue's own hold decides: a 30-minute hold keeps 25 minutes calm.
    const dugoDrzanje = renderToStaticMarkup(
      <KarticaRezervacije red={red("rv_07")} sadaMs={IZLOG_SADA} holdMin={30} radi={false} onOtvori={NISTA} onStigli={NISTA} radnjeIskljucene={false} />,
    );
    expect(dugoDrzanje).not.toContain("data-rez-kasni");
    expect(tekst(dugoDrzanje)).toContain(fmt(tr.uTerminu, { vreme: "25:00" }));
  });

  test("an arrived and a cancelled reservation can only be opened", () => {
    for (const id of ["rv_05", "rv_06", "rv_08"]) {
      expect(dugmad(kartica(id))[1].tekst, id).toBe(tr.radnja.otvori);
    }
  });

  test("the main action by status and time (glavnaRadnjaRezervacije)", () => {
    const r = (status: KonobarRezervacija["status"], pomak: number) => glavnaRadnjaRezervacije({ status, requestedAt: IZLOG_SADA + pomak }, IZLOG_SADA, 15);
    expect(r("new", minuta(300))).toBe("odgovori");
    expect(r("change_proposed", minuta(300))).toBe("odgovori");
    expect(r("accepted", minuta(300))).toBe("otvori");
    expect(r("accepted", minuta(90))).toBe("otvori");
    expect(r("accepted", 0)).toBe("stigli");
    expect(r("accepted", -minuta(5))).toBe("stigli");
    expect(r("accepted", -minuta(25))).toBe("stigli");
    expect(r("arrived", -minuta(5))).toBe("otvori");
    expect(r("cancelled", -minuta(5))).toBe("otvori");
  });

  test("offline: the main action waits, the title still opens; a request in flight shows the spinner", () => {
    const offline = bocniPano(panel({ veza: "offline", poslednjaVezaMs: IZLOG_SADA - minuta(2), pocetniFilterReda: "rezervacije" }));
    for (const id of ["rv_01", "rv_07", "rv_02"]) {
      const [naslov, radnja] = dugmad(rezKartica(offline, id));
      expect(radnja.iskljuceno, id).toBe(true);
      expect(naslov.iskljuceno, id).toBe(false);
    }
    const uToku = renderToStaticMarkup(
      <KarticaRezervacije red={red("rv_01")} sadaMs={IZLOG_SADA} holdMin={15} radi onOtvori={NISTA} onStigli={NISTA} radnjeIskljucene={false} />,
    );
    expect(uToku).toContain('aria-busy="true"');
  });
});

// --- 4. The guest's cancellation ------------------------------------------------------

describe("a guest cancels a reservation: a strip until 'U redu', no reminder", () => {
  const trakeRez = (html: string) => [...html.matchAll(/<li role="status"[^>]*>([\s\S]*?)<\/li>/g)].filter((m) => tekst(m[1]).includes("rezervaciju"));

  test("otkazana=1: an info strip with the guest and the term, role=status, and a button to close it", () => {
    const html = izlog({ otkazana: "1" });
    const trake = trakeRez(html);
    expect(trake).toHaveLength(1);
    expect(tekst(trake[0][1])).toBe(fmt(tr.otkazaoGost, { ime: "Luka T.", termin: "Danas · 19:15" }));
    expect(trake[0][0]).toContain("--mp-info-meko");
    expect(dugmad(trake[0][1])[0].ime).toBe(t.red.zatvoriObavestenje);
    expect(html).toContain("data-rez-obavestenja");
    // The request strip of K22 (a guest cancelled an order) is a separate one and stays.
    expect(tekst(html)).toContain(fmt(t.red.otkazaoGost, { vrsta: d.requestKinds.order, mesto: "Sto 8", vreme: "18:01" }));
    // The cancelled reservation is also listed under Otkazane.
    expect(redosledRez(bocniPano(izlog({ ...REZERVACIJE, otkazana: "1" })))).toContain("rv_06");
  });

  test("cancelled 40 minutes ago (older than half an hour) or by the staff: no strip", () => {
    expect(trakeRez(izlog())).toHaveLength(0);
    expect(izlog()).not.toContain("data-rez-obavestenja");
    const staff = { ...REZ.rezervacije, rows: REZ.rezervacije.rows.map((r) => (r.id === "rv_06" ? { ...r, cancelledAt: IZLOG_SADA - minuta(2), cancelledBy: "staff" as const } : r)) };
    expect(trakeRez(panel({ rezervacije: staff }))).toHaveLength(0);
  });

  test("the strip is in the queue, not on the floor, and the panel has one polite live region", () => {
    const html = izlog({ otkazana: "1" });
    expect(bocniPano(html)).toContain("data-rez-obavestenja");
    expect(stranaSale(html)).not.toContain("data-rez-obavestenja");
    expect(count(html, 'aria-live="polite"')).toBe(1);
  });
});

// --- 5. The detail ------------------------------------------------------------------

describe("the detail of a reservation", () => {
  test("it fills the one contextual pane next to the floor, with exactly one h1", () => {
    const html = izlog(detaljIzloga("rv_01"));
    expect(kontekstPana(html)).toBe("rezervacija");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual([tr.detalj.naslov]);
    expect(bocniPano(html)).toContain('data-detalj-rezervacije="rv_01"');
    expect(html).toContain('<section aria-labelledby="sala-naslov"');
    expect(dugme(bocniPano(html), tr.detalj.nazad)?.ime).toBe(tr.detalj.nazadCitac);
  });

  test("rv_01 (new): the term, guests, name, the e-mail as a link, the note, when it was sent; no decision yet", () => {
    const html = detalj("rv_01");
    const sav = tekst(html);
    expect(statusKartice(html)).toBe(d.reservationStatuses.new);
    expect(tekst(izdvoji(html, /(<dl\b[^>]*data-rez-termin[\s\S]*?<\/dl>)/))).toBe(`${tr.detalj.termin} Danas · 19:00 ${tr.detalj.gosti} 4 osobe`);
    expect(sav).toContain("Marija P.");
    expect(sav).toContain(tr.detalj.kontakt);
    expect(html).toContain('href="mailto:gost@example.com"');
    expect(html).not.toContain("href=\"tel:");
    expect(sav).toContain("Rođendan, molimo sto bliže prozoru.");
    expect(sav).not.toContain(tr.detalj.bezNapomene);
    expect(sav).toContain(fmt(tr.detalj.poslato, { vreme: clockTime(red("rv_01").createdAt) }));
    expect(sav).toContain(tr.detalj.bezStola);
    expect(sav).not.toContain(tr.detalj.vezao.split("{")[0]);
    // No decision line before anyone decided.
    expect(izdvoji(html, /(<div class="grid gap-1" data-rez-poslato="[^"]*">[\s\S]*?<\/div>)/)).not.toContain("font-semibold");
  });

  test("Pozovi is a tel: link and Piši a mailto: link, plain links of at least 48 px named for what they do", () => {
    const html = detalj("rv_02");
    const poziv = izdvoji(html, /(<a\b[^>]*href="tel:[^"]*"[^>]*>[\s\S]*?<\/a>)/);
    expect(attr(poziv, "href")).toBe("tel:+381600000000");
    expect(attr(poziv, "aria-label")).toBe(fmt(tr.detalj.pozoviCitac, { telefon: "+381 60 000 0000" }));
    expect(tekst(poziv)).toBe(tr.detalj.pozovi);
    expect(imaMin48(attr(poziv, "class") ?? "")).toBe(true);
    const pismo = izdvoji(detalj("rv_01"), /(<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>)/);
    expect(attr(pismo, "aria-label")).toBe(fmt(tr.detalj.pisiCitac, { email: "gost@example.com" }));
    expect(tekst(pismo)).toBe(tr.detalj.pisi);
    expect(imaMin48(attr(pismo, "class") ?? "")).toBe(true);
    // Nothing is sent from here: no template, no message in the link.
    expect(attr(pismo, "href")).not.toContain("?");
    expect(telefonHref("+381 (60) 000-0000")).toBe("tel:+381600000000");
    expect(mejlHref("a@b.rs?subject=x&body=y")).not.toContain("?");
    expect(mejlHref("a@b.rs")).toBe("mailto:a@b.rs");
    // K25 (main agent, security review): no extra recipient or header from the guest's text.
    expect(mejlHref("a,drugi@b.rs")).toBe("mailto:a%2Cdrugi@b.rs");
    expect(mejlHref("a;b@c.rs")).not.toContain(";");
    expect(mejlHref("<a>@b.rs")).toBe("mailto:%3Ca%3E@b.rs");
  });

  test("rv_01 (new) offers Prihvati, Predloži izmenu and Odbij; nothing from the other statuses", () => {
    const html = detalj("rv_01");
    const radnje = [dugme(html, tr.detalj.prihvati), dugme(html, tr.detalj.predlozi), dugme(html, tr.detalj.odbij)];
    expect(radnje.every((b) => b !== undefined && !b.iskljuceno && imaMin48(b.klase))).toBe(true);
    for (const nema of [tr.detalj.stigli, tr.detalj.otkazi, tr.detalj.gostPrihvata, tr.detalj.poveziSto, tr.detalj.promeniSto]) {
      expect(dugme(html, nema), nema).toBeUndefined();
    }
    // Nothing is open until it is asked for: no form, no confirmation, no table picker.
    expect(html).not.toContain("data-predlog-izmene");
    expect(html).not.toContain("data-izbor-stola");
    expect(html).not.toContain("data-potvrda");
    expect(tekst(html)).not.toContain(tr.detalj.odbijPitanje);
    expect(dugme(html, tr.detalj.predlozi)?.otvor).toContain('aria-expanded="false"');
  });

  test("rv_03 (a proposal): Gost prihvata predlog with its explanation, and Odbij; the proposed term and message are shown", () => {
    const html = detalj("rv_03");
    expect(statusKartice(html)).toBe(d.reservationStatuses.change_proposed);
    expect(dugme(html, tr.detalj.gostPrihvata)).toBeDefined();
    expect(imaMin48(dugme(html, tr.detalj.gostPrihvata)!.klase)).toBe(true);
    expect(tekst(html)).toContain(tr.detalj.gostPrihvataOpis);
    expect(dugme(html, tr.detalj.odbij)).toBeDefined();
    for (const nema of [tr.detalj.prihvati, tr.detalj.stigli, tr.detalj.otkazi]) expect(dugme(html, nema), nema).toBeUndefined();
    expect(tekst(html)).toContain(tr.detalj.predlogNaslov);
    expect(tekst(html)).toContain(fmt(tr.detalj.predlogTermin, { termin: "Danas · 20:15" }));
    expect(tekst(html)).toContain("Imamo sto za vas u 20:15.");
    expect(tekst(html)).toContain(fmt(tr.detalj.odluka, { status: d.reservationStatuses.change_proposed, ime: "Jelena", vreme: clockTime(red("rv_03").createdAt + minuta(12)) }));
  });

  test("rv_02 (accepted, Sto 6): Gosti su stigli, Otkaži rezervaciju, the table with Promeni sto and Ukloni sto; the table picker only when asked", () => {
    const html = detalj("rv_02");
    expect(statusKartice(html)).toBe(d.reservationStatuses.accepted);
    for (const radnja of [tr.detalj.stigli, tr.detalj.otkazi, tr.detalj.promeniSto, tr.detalj.ukloniSto]) {
      const b = dugme(html, radnja);
      expect(b, radnja).toBeDefined();
      expect(b?.iskljuceno, radnja).toBe(false);
      expect(imaMin48(b?.klase ?? ""), radnja).toBe(true);
    }
    for (const nema of [tr.detalj.prihvati, tr.detalj.predlozi, tr.detalj.odbij, tr.detalj.gostPrihvata, tr.detalj.poveziSto]) {
      expect(dugme(html, nema), nema).toBeUndefined();
    }
    expect(tekst(html)).toContain("Sto 6");
    expect(tekst(html)).toContain(fmt(tr.detalj.vezao, { ime: "Milan" }));
    expect(html).not.toContain("data-izbor-stola");
    expect(tekst(html)).not.toContain(tr.detalj.izaberiStoOpis);
    expect(dugme(html, tr.detalj.promeniSto)?.otvor).toContain('aria-expanded="false"');
  });

  test("an accepted reservation without a table offers Poveži sa stolom and says that arrival works without one", () => {
    const bezStola = { ...REZ.detalji.rv_02, reservation: { ...REZ.detalji.rv_02.reservation, positionId: null, positionLabel: null, boundBy: null }, sameTable: [] };
    const prazno = renderToStaticMarkup(<DetaljRezervacije {...OSNOVA_DETALJA} detalj={bezStola} />);
    expect(dugme(prazno, tr.detalj.poveziSto)).toBeDefined();
    expect(dugme(prazno, tr.detalj.promeniSto)).toBeUndefined();
    expect(dugme(prazno, tr.detalj.ukloniSto)).toBeUndefined();
    expect(tekst(prazno)).toContain(tr.detalj.bezStola);
    expect(tekst(prazno)).toContain(tr.detalj.stigliBezStola);
  });

  test("the arrival hint about occupancy appears only with the module and a table", () => {
    expect(tekst(detalj("rv_02", { zauzetostUkljucena: true }))).toContain(tr.detalj.stigliZauzetost);
    expect(tekst(detalj("rv_02", { zauzetostUkljucena: false }))).not.toContain(tr.detalj.stigliZauzetost);
    expect(tekst(detalj("rv_02"))).not.toContain(tr.detalj.stigliBezStola);
    expect(tekst(izlog(detaljIzloga("rv_02", { zauzetost: "1" })))).toContain(tr.detalj.stigliZauzetost);
    expect(tekst(izlog(detaljIzloga("rv_02")))).not.toContain(tr.detalj.stigliZauzetost);
  });

  test("the table picker, opened on purpose: the floor's positions by zone, an explicit choice, the current table marked", () => {
    const html = detalj("rv_02", { pocetno: { otvoreno: "sto" } });
    const izbor = izdvoji(html, /(<section\b[^>]*data-izbor-stola[\s\S]*?<\/section>)/);
    expect(naslovi(izbor, 2)).toEqual([tr.detalj.izaberiSto]);
    expect(tekst(izbor)).toContain(tr.detalj.izaberiStoOpis);
    const izbori = dugmad(izbor).filter((b) => attr(b.otvor, "data-izbor-sto") !== undefined);
    expect(izbori).toHaveLength(SALA.positions.length);
    expect(izbori.every((b) => imaMin48(b.klase) && !b.iskljuceno && (b.pritisnuto === "true" || b.pritisnuto === "false"))).toBe(true);
    expect(izbori.filter((b) => b.pritisnuto === "true").map((b) => attr(b.otvor, "data-izbor-sto"))).toEqual([mestoId("Sto 6")]);
    // Grouped by zone, in the zones' order, "Bez zone" last.
    const zone = [...SALA.zones].sort((a, b) => a.order - b.order).map((zona) => zona.name);
    expect(naslovi(izbor, 3).slice(0, zone.length)).toEqual(zone);
    // Nothing is chosen for the waiter.
    expect(tekst(izbor)).not.toContain("slobodan");
  });

  test("the picker groups by zone with the label's number as a number (Sto 2 before Sto 10)", () => {
    const grupe = grupisiMesta(SALA);
    const nazivi = grupe.map((g) => g.naziv);
    expect(nazivi.slice(0, SALA.zones.length)).toEqual([...SALA.zones].sort((a, b) => a.order - b.order).map((z) => z.name));
    const bezZone = SALA.positions.some((m) => m.zoneId === null);
    expect(nazivi.at(-1)).toBe(bezZone ? t.sala.bezZone : nazivi.at(-1));
    for (const g of grupe) {
      const labele = g.mesta.map((m) => m.label);
      const sort = [...labele].sort((a, b) => a.localeCompare(b, "sr-Latn", { numeric: true, sensitivity: "base" }));
      expect(labele, g.naziv ?? "").toEqual(sort);
    }
    expect(grupe.flatMap((g) => g.mesta)).toHaveLength(SALA.positions.length);
    // No floor yet: no table, an honest sentence (never a guess).
    expect(grupisiMesta({ zones: [], positions: [] })).toEqual([]);
  });

  test("Predloži izmenu opens an inline form: date, time on the 15-minute grid, an optional message of at most 300 characters", () => {
    const html = detalj("rv_01", { pocetno: { otvoreno: "predlog" } });
    expect(html).toContain("data-predlog-izmene");
    expect(tekst(html)).toContain(tr.predlog.opis);
    const selekti = [...html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)];
    expect(selekti).toHaveLength(2);
    for (const rec of [tr.predlog.datum, tr.predlog.vreme, tr.predlog.poruka]) expect(tekst(html)).toContain(rec);
    expect(html).toMatch(/<textarea\b[^>]*maxLength="300"/i);
    expect(html).toContain(`placeholder="${tr.predlog.porukaPrimer}"`);
    expect(dugme(html, tr.predlog.sacuvaj)).toBeDefined();
    expect(dugme(html, tr.predlog.odustani)).toBeDefined();
    expect(imaMin48(dugme(html, tr.predlog.sacuvaj)!.klase)).toBe(true);
    expect(dugme(html, tr.detalj.predlozi)?.otvor).toContain('aria-expanded="true"');
  });

  test("the proposal form: 61 days from today, today's times only after now, the first time after the requested one is chosen", () => {
    const html = renderToStaticMarkup(
      <PredlogIzmene zahtevaniTermin={red("rv_01").requestedAt} sadaMs={IZLOG_SADA} radi={false} iskljuceno={false} onSacuvaj={NISTA} onOdustani={NISTA} />,
    );
    const [datumi, vremena] = [...html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)].map((m) => [...m[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((o) => ({ vrednost: attr(o[1], "value"), natpis: tekst(o[2]), izabrano: /\sselected=""/.test(o[1]) })));
    expect(datumi).toHaveLength(61);
    expect(datumi.slice(0, 3).map((o) => o.natpis)).toEqual([d.relativeDays.today, d.relativeDays.tomorrow, "Pon 19. 10."]);
    expect(datumi[0].vrednost).toBe("2026-10-17");
    expect(datumi[60].vrednost).toBe("2026-12-16");
    expect(datumi.filter((o) => o.izabrano).map((o) => o.vrednost)).toEqual(["2026-10-17"]);
    // 18:30 … 23:45 (the clock stands at 18:27), on the grid, and the first one after 19:00 chosen.
    expect(vremena).toHaveLength(22);
    expect(vremena[0].vrednost).toBe("18:30");
    expect(vremena.every((o) => /^\d\d:(00|15|30|45)$/.test(o.vrednost ?? ""))).toBe(true);
    expect(vremena.filter((o) => o.izabrano).map((o) => o.vrednost)).toEqual(["19:15"]);
  });

  test("Odbij and Otkaži rezervaciju ask first: the question, both answers of at least 48 px, the opener is gone", () => {
    const odbij = detalj("rv_01", { pocetno: { otvoreno: "odbij" } });
    expect(tekst(odbij)).toContain(tr.detalj.odbijPitanje);
    expect(tekst(odbij)).toContain(tr.detalj.odbijOpis);
    for (const odgovor of [dugme(odbij, tr.detalj.odbijDa), dugme(odbij, tr.detalj.odbijNe)]) {
      expect(odgovor?.iskljuceno).toBe(false);
      expect(imaMin48(odgovor?.klase ?? "")).toBe(true);
    }
    expect(dugme(odbij, tr.detalj.odbij)).toBeUndefined();

    const otkazi = detalj("rv_02", { pocetno: { otvoreno: "otkazi" } });
    expect(tekst(otkazi)).toContain(tr.detalj.otkaziPitanje);
    expect(tekst(otkazi)).toContain(tr.detalj.otkaziOpis);
    expect(dugme(otkazi, tr.detalj.otkaziDa)).toBeDefined();
    expect(dugme(otkazi, tr.detalj.otkaziNe)).toBeDefined();
    expect(dugme(otkazi, tr.detalj.otkazi)).toBeUndefined();
    // The other actions stay where they were.
    expect(dugme(otkazi, tr.detalj.stigli)).toBeDefined();
  });

  test.each([
    { id: "rv_05", linija: fmt(tr.detalj.realizovana, { vreme: "18:04" }), status: d.reservationStatuses.arrived },
    { id: "rv_04", linija: fmt(tr.detalj.odbijena, { vreme: clockTime(REZ.detalji.rv_04.reservation.decidedAt!) }), status: d.reservationStatuses.declined },
    { id: "rv_06", linija: fmt(tr.detalj.otkazanaGost, { vreme: clockTime(REZ.detalji.rv_06.reservation.cancelledAt!) }), status: d.reservationStatuses.cancelled },
  ])("$id is read-only: no action, the line says what happened", ({ id, linija, status }) => {
    const html = detalj(id);
    expect(html).not.toContain("data-radnje-detalja");
    expect(izdvoji(html, /(<p\b[^>]*data-rez-zavrseno[\s\S]*?<\/p>)/)).toContain(linija);
    expect(statusKartice(html)).toBe(status);
    for (const radnja of [tr.detalj.prihvati, tr.detalj.predlozi, tr.detalj.odbij, tr.detalj.stigli, tr.detalj.otkazi, tr.detalj.gostPrihvata]) {
      expect(dugme(html, radnja), `${id}: ${radnja}`).toBeUndefined();
    }
    // The contact stays (the staff may still tell the guest), except there is nothing to tell after the arrival.
    if (id !== "rv_05") expect(html).toMatch(/href="(tel|mailto):/);
  });

  test("the reply to the guest has a place (K26): Javite gostu, except after an arrival or the guest's own cancellation", () => {
    for (const id of ["rv_01", "rv_02", "rv_03", "rv_04"]) {
      const html = detalj(id);
      expect(naslovi(html, 2), id).toContain(tr.detalj.javiteGostu);
      expect(tekst(html), id).toContain(tr.detalj.javiteGostuOpis);
    }
    for (const id of ["rv_05", "rv_06"]) expect(naslovi(detalj(id), 2), id).not.toContain(tr.detalj.javiteGostu);
  });

  test("the other reservations of the same table that day are listed and can be opened", () => {
    const rezervacije = {
      ...REZ.rezervacije,
      rows: [...REZ.rezervacije.rows, { ...red("rv_01"), id: "rv_x1", status: "accepted" as const, positionId: red("rv_02").positionId, positionLabel: "Sto 6", requestedAt: red("rv_02").requestedAt + minuta(150) }],
    };
    const html = detalj("rv_02", {}, rezervacije);
    expect(naslovi(html, 2)).toContain(tr.detalj.drugeNaStolu);
    const drugi = izdvoji(html, /(<section aria-labelledby="rez-drugi"[\s\S]*?<\/section>)/);
    expect(dugmad(drugi)).toHaveLength(1);
    expect(dugmad(drugi)[0].ime).toBe(fmt(tr.otvoriCitac, { ime: "Marija P.", termin: "Danas · 22:30" }));
    expect(detalj("rv_02")).not.toContain("rez-drugi");
  });

  test("offline: every action waits and the reason stays next to them, once", () => {
    for (const id of ["rv_01", "rv_03", "rv_02"]) {
      const html = detalj(id, { radnjeIskljucene: true, razlogIskljucenja: t.detalj.offline });
      const radnje = dugmad(izdvoji(html, /(<div\b[^>]*data-radnje-detalja[\s\S]*?<\/article>)/)).filter((b) => b.tekst !== "");
      expect(radnje.length).toBeGreaterThanOrEqual(2);
      expect(radnje.every((b) => b.iskljuceno), id).toBe(true);
      expect(count(tekst(html), t.detalj.offline), id).toBe(1);
      expect(html).toContain('aria-describedby="rez-razlog"');
    }
    // The back button still works offline.
    expect(dugme(detalj("rv_01", { radnjeIskljucene: true }), tr.detalj.nazad)?.iskljuceno).toBe(false);
  });

  test("an action in flight shows the spinner on its button and keeps the others from being pressed; an error is an alert", () => {
    const html = detalj("rv_01", { radi: "prihvati", greska: d.errors["reservation/status_changed"] });
    expect(dugmad(html).find((b) => b.tekst.startsWith(tr.detalj.prihvati))?.otvor).toContain('aria-busy="true"');
    expect(dugme(html, tr.detalj.predlozi)?.iskljuceno).toBe(true);
    expect(dugme(html, tr.detalj.odbij)?.iskljuceno).toBe(true);
    expect(izdvoji(html, /<div role="alert"[^>]*>([\s\S]*?)<\/div>/)).toContain(d.errors["reservation/status_changed"]);
    expect(detalj("rv_01")).not.toContain('role="alert"');
  });

  test("loading, gone, and opened from a table (the back button names the table)", () => {
    const ucitava = renderToStaticMarkup(<DetaljRezervacije {...OSNOVA_DETALJA} detalj={undefined} />);
    expect(ucitava).toContain('aria-busy="true"');
    expect(ucitava).toContain('data-oblik="forma"');
    expect(tekst(ucitava)).toContain(tr.detalj.ucitava);
    expect(count(ucitava, "<h1")).toBe(1);
    expect(ucitava).not.toContain("data-detalj-rezervacije");

    const nestala = renderToStaticMarkup(<DetaljRezervacije {...OSNOVA_DETALJA} detalj={null} />);
    expect(naslovi(nestala, 2)).toContain(tr.detalj.nestala.naslov);
    expect(tekst(nestala)).toContain(tr.detalj.nestala.opis);
    expect(count(nestala, "<h1")).toBe(1);

    const sTable = panel({ izabranoMestoId: mestoId("Sto 7"), izabranaRezervacijaId: "rv_07", detaljRezervacije: detaljRez("rv_07") });
    expect(kontekstPana(sTable)).toBe("rezervacija");
    expect(dugme(bocniPano(sTable), "Sto 7")?.ime).toBe(fmt(t.sto.nazadNaStoCitac, { sto: "Sto 7" }));
  });

  test("the lateness of an accepted reservation in the detail: red 'kasni 25:00' after the hold", () => {
    const html = detalj("rv_07");
    expect(html).toContain('data-rez-faza="kasni"');
    expect(tekst(html)).toContain("kasni 25:00");
    expect(klaseSa(html, "bg-[var(--mp-opasnost-meko)]").length).toBeGreaterThanOrEqual(1);
    // Before the term nothing ticks.
    expect(detalj("rv_02")).not.toContain("data-rez-faza");
  });
});

// --- 6. The floor ----------------------------------------------------------------------

describe("the floor: a bound reservation on its table", () => {
  const RASPORED: IzlogSearchParams = { ekran: "sala-raspored" };
  const TABELA: IzlogSearchParams = { ekran: "sala-tabela" };

  test("Sto 7 (rv_07, 25 minutes past the term, hold 15): the badge is red with 'kasni 25:00', the clock icon and the calm pulse", () => {
    const sto7 = plocice(izlog(RASPORED), mestoId("Sto 7"))[0];
    const znacka = izdvoji(sto7.markup, /(<span\b[^>]*data-rez-znacka[^>]*>[\s\S]*?<\/span>\s*<\/span>)/);
    expect(znacka).toContain('data-rez-kasni="true"');
    expect(tekst(znacka)).toContain("kasni 25:00");
    const klase = (attr(znacka, "class") ?? "").split(/\s+/);
    for (const klasa of ["relative", "rounded-full", "bg-[var(--mp-opasnost-meko)]", "text-[var(--mp-opasnost)]"]) expect(klase, klasa).toContain(klasa);
    if (kasniKlasa) expect(klase).toContain(kasniKlasa);
    expect(sto7.markup).toContain("text-[var(--mp-vrsta-rezervacija)]");
    // The requests' own badges are untouched: the reservation is a separate mark, not a request kind.
    expect([...sto7.markup.matchAll(/data-znacka="([a-z]+)"/g)].map((m) => m[1]).sort()).toEqual(["bill", "order"]);
  });

  test("Sto 6 (rv_02 at 20:00, 93 minutes ahead): a calm badge with the term, nothing late", () => {
    const sto6 = plocice(izlog(RASPORED), mestoId("Sto 6"))[0];
    expect(sto6.markup).toContain("data-rez-znacka");
    expect(sto6.markup).not.toContain("data-rez-kasni");
    expect(sto6.markup).toContain('data-rez-faza="uskoro"');
    expect(tekst(sto6.markup)).toContain("20:00");
    expect(sto6.markup).not.toContain("bg-[var(--mp-opasnost-meko)]");
  });

  test("tables without a reservation to show have no badge: tomorrow's (Sto 2), the arrived (Sto 4), and a table with none", () => {
    const html = izlog(RASPORED);
    for (const naziv of ["Sto 2", "Sto 4", "Sto 9", "Sto 3"]) expect(plocice(html, mestoId(naziv))[0].markup, naziv).not.toContain("data-rez-znacka");
  });

  test("the badge appears 120 minutes before the term and goes with the arrival or the cancellation", () => {
    const sala = SALA;
    const mesta = (rows: KonobarRezervacija[], sada = IZLOG_SADA) =>
      mestaSale({ sala, zahtevi: [], rezervacije: { poStolu: reservationsByTable(rows, sada, 15), holdMin: 15 } });
    const sto = (m: ReturnType<typeof mesta>, naziv: string) => m.find((kandidat) => kandidat.label === naziv)!;
    const rows = REZ.rezervacije.rows;
    expect(sto(mesta(rows), "Sto 7").rezervacija?.row.id).toBe("rv_07");
    expect(sto(mesta(rows), "Sto 6").rezervacija?.row.id).toBe("rv_02");
    // 2 h 1 min before the term of rv_02: not yet.
    expect(sto(mesta(rows, red("rv_02").requestedAt - minuta(121)), "Sto 6").rezervacija).toBeNull();
    expect(sto(mesta(rows, red("rv_02").requestedAt - minuta(120)), "Sto 6").rezervacija?.row.id).toBe("rv_02");
    // The guests arrived, or it was cancelled: the table shows nothing, and is never 'free' either.
    const stigli = rows.map((r) => (r.id === "rv_07" ? { ...r, status: "arrived" as const, arrivedAt: IZLOG_SADA } : r));
    const otkazano = rows.map((r) => (r.id === "rv_07" ? { ...r, status: "cancelled" as const, cancelledAt: IZLOG_SADA, cancelledBy: "staff" as const } : r));
    for (const izmenjeno of [stigli, otkazano]) {
      const m = sto(mesta(izmenjeno), "Sto 7");
      expect(m.rezervacija).toBeNull();
      expect(m.occupancy).toBe("neutral");
    }
    // Without the data the view model is the K23 one.
    expect(mestaSale({ sala, zahtevi: [] }).every((m) => m.rezervacija === undefined)).toBe(true);
  });

  test("the tile's name says the reservation with the guest, the guests, the term and the lateness", () => {
    const m = mestaSale({ sala: SALA, zahtevi: FX.zahtevi, rezervacije: { poStolu: reservationsByTable(REZ.rezervacije.rows, IZLOG_SADA, 15), holdMin: 15 } });
    const sto6 = m.find((kandidat) => kandidat.label === "Sto 6")!;
    expect(opisMestaSale(sto6, IZLOG_SADA)).toBe(
      fmt(t.sala.mestoCitac, { mesto: `Sto 6, ${sto6.zoneName}`, stanje: fmt(tr.znackaCitac, { ime: "Nikola S.", gosti: "6 osoba", termin: "Danas · 20:00" }) }),
    );
    expect(opisMestaSale(sto6, IZLOG_SADA)).not.toContain(t.sala.neutralnoCitac);
    // Two minutes into the term (within the hold): calm, in minutes for the reader.
    expect(opisMestaSale(sto6, red("rv_02").requestedAt + minuta(2))).toContain(fmt(tr.uTerminu, { vreme: "2 min" }));
    expect(opisMestaSale(sto6, red("rv_02").requestedAt + minuta(20))).toContain(fmt(tr.kasni, { vreme: "20 min" }));
    const sto7 = m.find((kandidat) => kandidat.label === "Sto 7")!;
    expect(plocice(izlog(RASPORED), mestoId("Sto 7"))[0].ime).toBe(opisMestaSale(sto7, IZLOG_SADA));
  });

  test("Tabela: the Rezervacija column has the guest, the time and the guests, the lateness, or a dash", () => {
    const html = izlog(TABELA);
    const k = t.sala.kolone;
    const zaglavlja = zaglavljaTabele(html);
    expect(zaglavlja).toEqual([k.sto, k.call, k.order, k.bill, k.reservation, k.konobar]);
    const kolona = (naziv: string) => celije(redTabele(html, mestoId(naziv)))[zaglavlja.indexOf(k.reservation)];
    expect(kolona("Sto 7").otvor).toContain('data-rez-celija="rv_07"');
    expect(kolona("Sto 7").otvor).toContain('data-rez-kasni=""');
    for (const rec of ["Ivana B.", "18:02", "5 osoba", "kasni 25:00"]) expect(kolona("Sto 7").tekst, rec).toContain(rec);
    expect(klaseSa(kolona("Sto 7").markup, "bg-[var(--mp-opasnost-meko)]").length).toBeGreaterThanOrEqual(1);
    for (const rec of ["Nikola S.", "20:00", "6 osoba"]) expect(kolona("Sto 6").tekst, rec).toContain(rec);
    expect(kolona("Sto 6").otvor).not.toContain("data-rez-kasni");
    // K25 (main agent): an empty reservation cell says "nema rezervacije", not "nema aktivnih zahteva".
    expect(kolona("Sto 3").tekst).toBe(`${t.sala.neutralno} ${t.sala.nemaRezervacijeCitac}`);
    expect(kolona("Sto 3").otvor).not.toContain("data-rez-celija");
    // The phone list carries it too, as one more state of the card.
    const lista = plocice(html, mestoId("Sto 7")).flatMap((b) => [...b.markup.matchAll(/data-lista-rez="([^"]+)"/g)].map((m) => m[1]));
    expect(lista).toEqual(["rv_07"]);
    expect(plocice(html, mestoId("Sto 3")).every((b) => !b.markup.includes("data-lista-rez"))).toBe(true);
  });

  test("the legend names the reservation (icon + word) next to the requests", () => {
    for (const upit of [RASPORED, TABELA]) {
      const natpisi = tekst(legenda(izlog(upit)));
      for (const vrsta of ["call", "order", "bill", "reservation"] as const) expect(natpisi).toContain(t.sala.vrste[vrsta]);
    }
    expect(legenda(izlog(RASPORED))).toContain("--mp-vrsta-rezervacija");
  });

  test("a venue without reservations has neither column nor legend entry nor badge", () => {
    const bez = panel({ rezervacije: { rows: [], skraceno: false, mode: "off", holdMinutes: 15 }, pocetniPrikaz: "sala", pocetniPrikazSale: "tabela" });
    expect(zaglavljaTabele(bez)).not.toContain(t.sala.kolone.reservation);
    expect(tekst(legenda(bez))).not.toContain(t.sala.vrste.reservation);
    expect(stranaSale(bez)).not.toContain("data-rez-");
  });

  test("never 'free': a reserved table keeps its own state, with and without the occupancy module", () => {
    // The state of a table is what the staff set by hand (only with the module); a reservation never changes it.
    const sModulom = fixtureSale({ zauzetost: true }).zauzetost;
    if (sModulom.off) throw new Error("the module is on in this fixture");
    const rucno = new Map<string, string>(sModulom.states.map((s) => [s.positionId, s.state]));
    for (const upit of [RASPORED, { ...RASPORED, zauzetost: "1" }]) {
      const html = izlog(upit);
      expect(html, JSON.stringify(upit)).toContain("data-rez-");
      for (const naziv of ["Sto 6", "Sto 7"]) {
        for (const b of plocice(html, mestoId(naziv))) {
          expect(attr(b.otvor, "data-zauzetost"), `${JSON.stringify(upit)} ${naziv}`).toBe(upit.zauzetost === "1" ? rucno.get(mestoId(naziv)) : undefined);
        }
      }
    }
    // The status column of the table view says the hand-set state (or "Bez oznake"), whatever the reservation is.
    const tabela = izlog({ ...TABELA, zauzetost: "1" });
    const zaglavlja = zaglavljaTabele(tabela);
    for (const naziv of ["Sto 6", "Sto 7", "Sto 3"]) {
      const stanje = rucno.get(mestoId(naziv)) as keyof typeof t.zauzetost | undefined;
      const celija = celije(redTabele(tabela, mestoId(naziv)))[zaglavlja.indexOf(t.sala.kolone.status)];
      expect(celija.tekst, naziv).toBe(stanje ? t.zauzetost[stanje] : `${t.sala.neutralno} ${t.sto.neutralno}`);
    }
    // The word 'free' exists only for what the staff marked by hand, and only with the module.
    expect(tekst(tabela)).toContain(t.zauzetost.free);
    expect(izlog(RASPORED).toLowerCase()).not.toContain("slobodan");
    expect(izlog(TABELA).toLowerCase()).not.toContain("slobodan");
  });
});

// --- 7. The table detail ---------------------------------------------------------------

describe("the table detail: the reservations of the table", () => {
  const STO_7: IzlogSearchParams = { ekran: "sto", rezervacija: "1" };

  test("rezervacija=1 opens Sto 7 with its late reservation: Gosti su stigli and Otvori, 'kasni 25:00'", () => {
    const html = izlog(STO_7);
    expect(naslovi(html, 1)).toEqual(["Sto 7"]);
    expect(kontekstPana(html)).toBe("sto");
    const pano = bocniPano(html);
    expect(naslovi(pano, 2)).toEqual([t.sto.aktivni, tr.sto.naslov]);
    const odeljak = izdvoji(pano, /(<section aria-labelledby="sto-rezervacija"[\s\S]*?<\/section>)/);
    expect(redosledRez(odeljak)).toEqual(["rv_07"]);
    const k = rezKartica(odeljak, "rv_07");
    expect(naslovi(k, 3)).toEqual(["Ivana B."]);
    expect(tekst(k)).toContain("kasni 25:00");
    expect(k).toContain('data-rez-kasni="true"');
    const [stigli, otvori, ...ostalo] = dugmad(k);
    expect(ostalo).toHaveLength(0);
    expect(stigli.tekst).toBe(tr.detalj.stigli);
    expect(stigli.ime).toBe(fmt(tr.radnjaCitac, { radnja: tr.detalj.stigli, ime: "Ivana B.", termin: "Danas · 18:02" }));
    expect(otvori.tekst).toBe(tr.radnja.otvori);
    expect(otvori.ime).toBe(fmt(tr.otvoriCitac, { ime: "Ivana B.", termin: "Danas · 18:02" }));
    expect(imaMin48(stigli.klase) && imaMin48(otvori.klase)).toBe(true);
    // Nobody waits for a table: the sentence says so; no occupancy without the module.
    expect(tekst(odeljak)).toContain(tr.sto.nemaZaPovezivanje);
    expect(dugme(odeljak, tr.sto.poveziRezervaciju)).toBeUndefined();
    expect(html).not.toContain("data-sto-zauzetost");
    expect(tekst(html).toLowerCase()).not.toContain("slobodan");
  });

  test("a table with no reservation and nothing to bind has no reservation section (Sto 3, Sto 9)", () => {
    for (const naziv of ["Sto 3", "Sto 9"]) {
      const pano = bocniPano(izlog({ ekran: "sto", sto: naziv }));
      expect(naslovi(pano, 2), naziv).toEqual([t.sto.aktivni]);
      expect(pano, naziv).not.toContain("data-sto-rezervacije");
    }
  });

  test("a cancelled reservation of the table: 'Rezervacija otkazana · gost · 18:08' for two hours, only Otvori", () => {
    const otkazana: KonobarRezervacija = { ...red("rv_06"), positionId: mestoId("Sto 3"), positionLabel: "Sto 3", cancelledAt: IZLOG_SADA - minuta(19), cancelledBy: "guest" };
    const rezervacije = { ...REZ.rezervacije, rows: [...REZ.rezervacije.rows.filter((r) => r.id !== "rv_06"), otkazana] };
    const html = panel({ rezervacije, izabranoMestoId: mestoId("Sto 3"), detaljMesta: { cards: [] }, pocetniPrikaz: "sala" });
    const k = rezKartica(bocniPano(html), "rv_06");
    expect(tekst(k)).toContain(fmt(tr.sto.otkazana, { ko: tr.sto.ko.guest, vreme: "18:08" }));
    expect(tekst(k)).toContain("Rezervacija otkazana · gost · 18:08");
    expect(dugmad(k).map((b) => b.tekst)).toEqual([tr.radnja.otvori]);
    // Older than two hours: gone from the table.
    const staro = { ...REZ.rezervacije, rows: [...REZ.rezervacije.rows.filter((r) => r.id !== "rv_06"), { ...otkazana, cancelledAt: IZLOG_SADA - minuta(121) }] };
    expect(panel({ rezervacije: staro, izabranoMestoId: mestoId("Sto 3"), detaljMesta: { cards: [] } })).not.toContain('data-rezervacija="rv_06"');
    // The staff's own cancellation names the staff.
    const osoblje = { ...REZ.rezervacije, rows: [...REZ.rezervacije.rows.filter((r) => r.id !== "rv_06"), { ...otkazana, cancelledBy: "staff" as const }] };
    expect(tekst(rezKartica(bocniPano(panel({ rezervacije: osoblje, izabranoMestoId: mestoId("Sto 3"), detaljMesta: { cards: [] } })), "rv_06"))).toContain(
      fmt(tr.sto.otkazana, { ko: tr.sto.ko.staff, vreme: "18:08" }),
    );
  });

  test("Poveži rezervaciju lists today's accepted reservations without a table; the list opens only on a tap, and each is an explicit choice", () => {
    const nevezana: KonobarRezervacija = { ...red("rv_02"), positionId: null, positionLabel: null };
    const rows = REZ.rezervacije.rows.map((r) => (r.id === "rv_02" ? nevezana : r));
    const rezervacije = { ...REZ.rezervacije, rows };
    // Any table now offers the binding (here Sto 3, which has no reservation of its own).
    const zatvoreno = panel({ rezervacije, izabranoMestoId: mestoId("Sto 3"), detaljMesta: { cards: [] }, pocetniPrikaz: "sala" });
    const odeljak = izdvoji(bocniPano(zatvoreno), /(<section aria-labelledby="sto-rezervacija"[\s\S]*?<\/section>)/);
    expect(naslovi(odeljak, 2)).toEqual([tr.sto.naslov]);
    const otvarac = dugme(odeljak, tr.sto.poveziRezervaciju);
    expect(otvarac?.otvor).toContain('aria-expanded="false"');
    expect(imaMin48(otvarac?.klase ?? "")).toBe(true);
    expect(odeljak).not.toContain("data-povezi-rezervaciju");
    expect(tekst(odeljak)).not.toContain("Nikola S.");

    const otvoreno = renderToStaticMarkup(
      <RezervacijeStola mestoId={mestoId("Sto 3")} redovi={rows} sadaMs={IZLOG_SADA} holdMin={15} radiId={null} radnjeIskljucene={false} razlogId={undefined} onOtvori={NISTA} onStigli={NISTA} onPovezi={NISTA} pocetnoPovezivanje />,
    );
    expect(tekst(otvoreno)).toContain(tr.sto.poveziOpis);
    const izbori = dugmad(otvoreno).filter((b) => attr(b.otvor, "data-povezi") !== undefined);
    expect(izbori.map((b) => attr(b.otvor, "data-povezi"))).toEqual(["rv_02"]);
    expect(izbori[0].ime).toBe(fmt(tr.sto.poveziCitac, { ime: "Nikola S.", termin: "Danas · 20:00" }));
    expect(izbori[0].tekst).toContain("Nikola S.");
    expect(imaMin48(izbori[0].klase)).toBe(true);
    expect(izbori[0].iskljuceno).toBe(false);
    // Tomorrow's reservation without a table is not offered today.
    const sutra = rows.map((r) => (r.id === "rv_08" ? { ...r, positionId: null, positionLabel: null } : r));
    expect(
      dugmad(renderToStaticMarkup(
        <RezervacijeStola mestoId={mestoId("Sto 3")} redovi={sutra} sadaMs={IZLOG_SADA} holdMin={15} radiId={null} radnjeIskljucene={false} razlogId={undefined} onOtvori={NISTA} onStigli={NISTA} onPovezi={NISTA} pocetnoPovezivanje />,
      )).filter((b) => attr(b.otvor, "data-povezi") !== undefined).map((b) => attr(b.otvor, "data-povezi")),
    ).toEqual(["rv_02"]);
  });

  test("offline: the arrival and the binding wait, Otvori still opens", () => {
    const html = izlog({ ...STO_7, stanje: "offline" });
    const k = rezKartica(bocniPano(html), "rv_07");
    const [stigli, otvori] = dugmad(k);
    expect(stigli.iskljuceno).toBe(true);
    expect(attr(stigli.otvor, "aria-describedby")).toBe("sto-razlog");
    expect(otvori.iskljuceno).toBe(false);
    expect(count(html, 'id="sto-razlog"')).toBe(1);
  });

  test("the arrival is offered once the time is near: not for a booking later today", () => {
    const kasnije = { ...red("rv_07"), requestedAt: IZLOG_SADA + minuta(180) };
    const html = renderToStaticMarkup(
      <RezervacijeStola mestoId={red("rv_07").positionId!} redovi={[kasnije]} sadaMs={IZLOG_SADA} holdMin={15} radiId={null} radnjeIskljucene={false} razlogId={undefined} onOtvori={NISTA} onStigli={NISTA} onPovezi={NISTA} />,
    );
    expect(dugmad(html).map((b) => b.tekst)).toEqual([tr.radnja.otvori]);
  });
});

// --- 8. Every K25 screen: headings, names, targets, words ---------------------------------

const K25_EKRANI: [string, IzlogSearchParams][] = [
  ["the Rezervacije filter", REZERVACIJE],
  ["the queue (Sve)", {}],
  ["a new reservation", detaljIzloga("rv_01")],
  ["a proposal", detaljIzloga("rv_03")],
  ["an accepted reservation", detaljIzloga("rv_02")],
  ["a late reservation", detaljIzloga("rv_07")],
  ["tomorrow's reservation", detaljIzloga("rv_08")],
  ["an arrived reservation", detaljIzloga("rv_05")],
  ["a declined reservation", detaljIzloga("rv_04")],
  ["a cancelled reservation", detaljIzloga("rv_06")],
  ["the table with a late reservation", { ekran: "sto", rezervacija: "1" }],
  ["the guest's cancellation", { otkazana: "1" }],
  ["no reservations", { ...REZERVACIJE, stanje: "prazno" }],
  ["offline", { ...REZERVACIJE, stanje: "offline" }],
  ["the floor", { ekran: "sala-raspored" }],
  ["the table view", { ekran: "sala-tabela" }],
];

describe("every K25 screen", () => {
  // K33 (A7): on the floor screens the side pane is `hidden lg:block` on a phone and keeps its own h1 in the markup;
  // "exactly one h1" is what a phone shows (a hidden pane is not in the accessibility tree).
  const h1NaTelefonu = (html: string) => {
    const pocetak = pocetakPana(html);
    const sakriven = (attr(html.slice(pocetak, html.indexOf(">", pocetak)), "class") ?? "").split(/\s+/).includes("hidden");
    return count(html, "<h1") - (sakriven ? count(bocniPano(html), "<h1") : 0);
  };

  test.each(K25_EKRANI)("%s: exactly one h1", (_ime, upit) => {
    expect(h1NaTelefonu(izlog(upit))).toBe(1);
  });

  test.each(K25_EKRANI)("%s: every button has visible text or an accessible name", (_ime, upit) => {
    for (const b of dugmad(izlog(upit))) expect(b.tekst !== "" || (b.ime ?? "") !== "", JSON.stringify(b.otvor)).toBe(true);
  });

  test.each(K25_EKRANI)("%s: every button of a reservation is at least 48 px high", (_ime, upit) => {
    const html = izlog(upit);
    const pano = bocniPano(html);
    // The title of a queue card is stretched over the whole card (data-razvucen), so the action beside it is the 48 px target.
    const dugmadKartica = [...pano.matchAll(/<article\b[^>]*data-rezervacija=[\s\S]*?<\/article>/g)]
      .flatMap((m) => dugmad(m[0]))
      .filter((b) => !b.otvor.includes("data-razvucen"));
    const detaljPocetak = pano.indexOf("data-detalj-rezervacije=");
    const dugmadDetalja = detaljPocetak < 0 ? [] : dugmad(pano.slice(detaljPocetak));
    for (const b of [...dugmadKartica, ...dugmadDetalja]) expect(imaMin48(b.klase), `${b.tekst || b.ime}: ${b.klase}`).toBe(true);
    for (const a of pano.matchAll(/<a\b[^>]*href="(?:tel|mailto):[^"]*"[^>]*>/g)) expect(imaMin48(attr(a[0], "class") ?? "")).toBe(true);
  });

  test.each(K25_EKRANI)("%s: never says 'slobodan' or the words of a kitchen without the occupancy module", (_ime, upit) => {
    const html = izlog(upit);
    for (const rec of ["slobodan", "kuhinj", "krenuo", "preuzimanja"]) expect(html.toLowerCase().includes(rec), rec).toBe(false);
    expect(html).not.toContain("data-zauzetost=");
    for (const rec of Object.values(t.zauzetost)) expect(tekst(html), rec).not.toContain(rec);
  });

  test("the polite live region is empty on the first render: what is already there is not news", () => {
    expect(izlog(detaljIzloga("rv_01"))).toContain('<p aria-live="polite" aria-atomic="true" class="sr-only"></p>');
    expect(izlog(REZERVACIJE)).toContain('<p aria-live="polite" aria-atomic="true" class="sr-only"></p>');
  });

  test("reservation states reach the screens: the form's reservations list, an empty list, and the K22 queue unchanged by the izlog's other states", () => {
    expect(redosledRez(bocniPano(izlog(REZERVACIJE)))).toHaveLength(7);
    expect(naslovi(bocniPano(izlog({ ...REZERVACIJE, stanje: "prazno" })), 2)).toEqual([t.red.praznoRezervacije.naslov]);
    expect(redosledRez(bocniPano(izlog({ stanje: "prazno" })))).toEqual([]);
    expect(izlog({ ekran: "rezervacije", rezervacija: "rv_zz" })).toContain(`aria-labelledby="radni-red-naslov"`);
    expect(kontekstPana(izlog({ ekran: "rezervacije", rezervacija: "rv_zz" }))).toBe("red");
  });
});

// --- 9. The subscription window and the proposal's dates ----------------------------------

describe("the window of the reservations subscription (okvir-vremena)", () => {
  const SAT = 3_600_000;

  test("fromMs is the start of the current hour minus 12 hours and changes once an hour", () => {
    const sada = Date.UTC(2026, 9, 17, 16, 27, 31);
    expect(okvirOd(sada)).toBe(Date.UTC(2026, 9, 17, 4, 0, 0));
    expect(okvirOd(Date.UTC(2026, 9, 17, 16, 0, 0))).toBe(okvirOd(Date.UTC(2026, 9, 17, 16, 59, 59, 999)));
    expect(okvirOd(Date.UTC(2026, 9, 17, 17, 0, 0))).toBe(okvirOd(sada) + SAT);
    expect(msDoSledecegSata(sada)).toBe(32 * 60_000 + 29_000);
    expect(msDoSledecegSata(Date.UTC(2026, 9, 17, 17, 0, 0))).toBe(SAT);
  });

  test("it is a Belgrade hour boundary, also across the change to winter time (25 October 2026)", () => {
    for (const sada of [Date.UTC(2026, 9, 17, 16, 27), Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30), Date.UTC(2026, 9, 25, 2, 45), Date.UTC(2026, 9, 26, 9, 5)]) {
      const od = okvirOd(sada);
      expect(epochToBelgradeLocal(od).slice(-2), String(sada)).toBe("00");
      expect(sada - od).toBeGreaterThanOrEqual(12 * SAT);
      expect(sada - od).toBeLessThan(13 * SAT);
    }
  });
});

describe("the dates and times of a proposal (predlog-vreme)", () => {
  test("61 days from today, the last day of the 60 only while a time fits", () => {
    const datumi = predlogDatumi(IZLOG_SADA);
    expect(datumi).toHaveLength(61);
    expect(datumi[0]).toBe("2026-10-17");
    expect(datumi[60]).toBe("2026-12-16");
    // Late at night the day is over: today leaves the list.
    const kasno = belgradeLocalToEpoch("2026-10-17T23:50")!;
    expect(predlogDatumi(kasno)[0]).toBe("2026-10-18");
    expect(predlogVremena("2026-10-17", kasno)).toEqual([]);
    // 60 days ahead at the very edge: the day exists only for the times before the same clock time.
    // (60 x 24 h later the same instant reads 17:27 in Belgrade: winter time.)
    const najkasnije = predlogVremena("2026-12-16", IZLOG_SADA);
    expect(najkasnije.at(-1)?.vreme).toBe("17:15");
  });

  test("the 15-minute grid, in the future and at most 60 days ahead; not limited to working hours", () => {
    const danas = predlogVremena("2026-10-17", IZLOG_SADA);
    expect(danas[0].vreme).toBe("18:30");
    expect(danas.at(-1)?.vreme).toBe("23:45");
    const sutra = predlogVremena("2026-10-18", IZLOG_SADA);
    expect(sutra).toHaveLength(96);
    expect(sutra[0].vreme).toBe("00:00");
    expect(sutra.every((s) => s.epoch > IZLOG_SADA && s.epoch <= IZLOG_SADA + 60 * 86_400_000)).toBe(true);
    expect(sutra.every((s, i) => i === 0 || s.epoch - sutra[i - 1].epoch === 15 * 60_000)).toBe(true);
  });

  test("the day of the change to winter time has every wall-clock time once, and each maps back to itself", () => {
    const dan = predlogVremena("2026-10-25", IZLOG_SADA);
    expect(dan).toHaveLength(96);
    for (const slot of dan) expect(epochToBelgradeLocal(slot.epoch)).toBe(`2026-10-25T${slot.vreme}`);
  });

  test("the first proposal is the first time after the requested one, or after now when that has passed", () => {
    expect(prviPredlog(IZLOG_SADA, red("rv_01").requestedAt)).toEqual({ datum: "2026-10-17", vreme: "19:15" });
    expect(prviPredlog(IZLOG_SADA, red("rv_07").requestedAt)).toEqual({ datum: "2026-10-17", vreme: "18:30" });
    expect(prviPredlog(IZLOG_SADA, red("rv_08").requestedAt)).toEqual({ datum: "2026-10-18", vreme: "13:15" });
    expect(prviPredlog(belgradeLocalToEpoch("2026-10-17T23:50")!, belgradeLocalToEpoch("2026-10-17T23:00")!)).toEqual({ datum: "2026-10-18", vreme: "00:00" });
  });
});

// --- 10. The izlog's memory (the server's rules on plain objects) ---------------------------

describe("the izlog's reservations in memory (memorija.ts)", () => {
  const memorija: RezMemorija = { redovi: REZ.rezervacije.rows, detalji: REZ.detalji };
  const ctx = (preko: Partial<RezKontekst> = {}): RezKontekst => ({ ime: "Milan", sada: IZLOG_SADA, sala: SALA, zauzetost: { off: true }, ...preko });
  const status = (m: RezMemorija, id: string) => m.detalji[id].reservation.status;

  test("accept: a new request becomes accepted, stamped with who and when; the list row follows", () => {
    const korak = primeniRezervaciju(memorija, ctx(), { vrsta: "prihvati", id: "rv_01", ocekivani: "new" });
    expect(korak.ishod).toEqual({ ok: true, status: "accepted", changed: true });
    expect(status(korak.memorija, "rv_01")).toBe("accepted");
    expect(korak.memorija.detalji.rv_01.reservation.decidedBy).toBe("Milan");
    expect(korak.memorija.detalji.rv_01.reservation.decidedAt).toBe(IZLOG_SADA);
    expect(korak.memorija.redovi.find((r) => r.id === "rv_01")?.status).toBe("accepted");
    // Accepting again changes nothing; the memory stays the same object.
    const opet = primeniRezervaciju(korak.memorija, ctx(), { vrsta: "prihvati", id: "rv_01", ocekivani: "accepted" });
    expect(opet.ishod).toEqual({ ok: true, status: "accepted", changed: false });
    expect(opet.memorija).toBe(korak.memorija);
  });

  test("what the waiter saw is not what is there: nothing is written and the status is named", () => {
    const korak = primeniRezervaciju(memorija, ctx(), { vrsta: "prihvati", id: "rv_01", ocekivani: "accepted" });
    expect(korak.ishod).toEqual({ ok: false, code: "reservation/status_changed", status: "new" });
    expect(korak.memorija).toBe(memorija);
    expect(primeniRezervaciju(memorija, ctx(), { vrsta: "prihvati", id: "rv_zz", ocekivani: "new" }).ishod).toEqual({ ok: false, code: "reservation/not_found" });
    // The refusal reads in words.
    expect(d.errors["reservation/status_changed"]).toContain("promenila");
  });

  test("decline removes the reservation from the list but keeps its detail; propose stores the term and the message", () => {
    const odbijena = primeniRezervaciju(memorija, ctx(), { vrsta: "odbij", id: "rv_01", ocekivani: "new" });
    expect(status(odbijena.memorija, "rv_01")).toBe("declined");
    expect(odbijena.memorija.redovi.some((r) => r.id === "rv_01")).toBe(false);
    const predlog = primeniRezervaciju(memorija, ctx(), { vrsta: "predlozi", id: "rv_01", ocekivani: "new", proposedAt: IZLOG_SADA + minuta(180), poruka: "Imamo sto u 21:30." });
    expect(predlog.ishod).toEqual({ ok: true, status: "change_proposed", changed: true });
    expect(predlog.memorija.detalji.rv_01.reservation.proposedAt).toBe(IZLOG_SADA + minuta(180));
    expect(predlog.memorija.detalji.rv_01.reservation.proposalNote).toBe("Imamo sto u 21:30.");
    expect(predlog.memorija.redovi.find((r) => r.id === "rv_01")?.proposedAt).toBe(IZLOG_SADA + minuta(180));
  });

  test("the guest agrees: the proposed time becomes the term; only a proposal can be agreed", () => {
    const korak = primeniRezervaciju(memorija, ctx(), { vrsta: "gostPrihvata", id: "rv_03", ocekivani: "change_proposed" });
    expect(korak.ishod).toEqual({ ok: true, status: "accepted", changed: true });
    expect(korak.memorija.detalji.rv_03.reservation.requestedAt).toBe(red("rv_03").proposedAt);
    expect(clockTime(korak.memorija.detalji.rv_03.reservation.requestedAt)).toBe("20:15");
    expect(primeniRezervaciju(memorija, ctx(), { vrsta: "gostPrihvata", id: "rv_01", ocekivani: "new" }).ishod).toMatchObject({ ok: false, code: "reservation/invalid_transition" });
  });

  test("bind: only an accepted reservation, a table of the floor, null removes it; the same table changes nothing", () => {
    const sto3 = mestoId("Sto 3");
    const povezana = primeniRezervaciju(memorija, ctx(), { vrsta: "poveziSto", id: "rv_02", ocekivani: "accepted", positionId: sto3 });
    expect(povezana.ishod).toEqual({ ok: true, status: "accepted", changed: true });
    expect(povezana.memorija.detalji.rv_02.reservation).toMatchObject({ positionId: sto3, positionLabel: "Sto 3", boundBy: "Milan" });
    expect(povezana.memorija.redovi.find((r) => r.id === "rv_02")).toMatchObject({ positionId: sto3, positionLabel: "Sto 3" });
    expect(primeniRezervaciju(povezana.memorija, ctx(), { vrsta: "poveziSto", id: "rv_02", ocekivani: "accepted", positionId: sto3 }).ishod).toMatchObject({ ok: true, changed: false });
    const uklonjena = primeniRezervaciju(povezana.memorija, ctx(), { vrsta: "poveziSto", id: "rv_02", ocekivani: "accepted", positionId: null });
    expect(uklonjena.memorija.detalji.rv_02.reservation).toMatchObject({ positionId: null, positionLabel: null });
    expect(primeniRezervaciju(memorija, ctx(), { vrsta: "poveziSto", id: "rv_02", ocekivani: "accepted", positionId: "ps_nema" }).ishod).toMatchObject({ ok: false, code: "reservation/position_invalid" });
    expect(primeniRezervaciju(memorija, ctx(), { vrsta: "poveziSto", id: "rv_01", ocekivani: "new", positionId: sto3 }).ishod).toMatchObject({ ok: false, code: "reservation/invalid_transition" });
  });

  test("arrive without the occupancy module: the reservation is realized, the occupancy is untouched", () => {
    const korak = primeniRezervaciju(memorija, ctx({ sala: { ...SALA, occupancyEnabled: false } }), { vrsta: "stigli", id: "rv_07", ocekivani: "accepted", positionId: null });
    expect(korak.ishod).toEqual({ ok: true, status: "arrived", changed: true });
    expect(korak.memorija.detalji.rv_07.reservation).toMatchObject({ status: "arrived", arrivedAt: IZLOG_SADA, arrivedBy: "Milan" });
    expect(korak.zauzetost).toEqual({ off: true });
    // The table shows nothing any more (the guests are here).
    expect(reservationsByTable(korak.memorija.redovi, IZLOG_SADA, 15).has(mestoId("Sto 7"))).toBe(false);
  });

  test("arrive with the module and a table: that table becomes Zauzet, and only that one", () => {
    const sala = fixtureSale({ zauzetost: true });
    const korak = primeniRezervaciju(memorija, ctx({ sala: sala.sala, zauzetost: sala.zauzetost }), { vrsta: "stigli", id: "rv_07", ocekivani: "accepted", positionId: null });
    expect(korak.zauzetost).not.toBe(sala.zauzetost);
    if (korak.zauzetost.off || sala.zauzetost.off) throw new Error("the module is on");
    expect(korak.zauzetost.states.find((s) => s.positionId === mestoId("Sto 7"))).toMatchObject({ state: "occupied", updatedBy: "Milan", updatedAt: IZLOG_SADA });
    expect(korak.zauzetost.states.filter((s) => s.positionId !== mestoId("Sto 7"))).toEqual(sala.zauzetost.states.filter((s) => s.positionId !== mestoId("Sto 7")));
    // A table chosen at the arrival is bound first.
    const nevezana = primeniRezervaciju(memorija, ctx(), { vrsta: "poveziSto", id: "rv_02", ocekivani: "accepted", positionId: null });
    const sto3 = mestoId("Sto 3");
    const stigli = primeniRezervaciju(nevezana.memorija, ctx({ sala: sala.sala, zauzetost: sala.zauzetost }), { vrsta: "stigli", id: "rv_02", ocekivani: "accepted", positionId: sto3 });
    expect(stigli.memorija.detalji.rv_02.reservation).toMatchObject({ status: "arrived", positionId: sto3, positionLabel: "Sto 3" });
    if (stigli.zauzetost.off) throw new Error("the module is on");
    expect(stigli.zauzetost.states.find((s) => s.positionId === sto3)?.state).toBe("occupied");
    // Without a table the arrival works and nothing is occupied.
    const bezStola = primeniRezervaciju(nevezana.memorija, ctx({ sala: sala.sala, zauzetost: sala.zauzetost }), { vrsta: "stigli", id: "rv_02", ocekivani: "accepted", positionId: null });
    expect(bezStola.ishod).toMatchObject({ ok: true, status: "arrived" });
    expect(bezStola.zauzetost).toBe(sala.zauzetost);
    // A table that is not on the floor is refused.
    expect(primeniRezervaciju(memorija, ctx(), { vrsta: "stigli", id: "rv_02", ocekivani: "accepted", positionId: "ps_nema" }).ishod).toMatchObject({ ok: false, code: "reservation/position_invalid" });
  });

  test("cancel: an accepted reservation is cancelled by the staff and frees nothing by itself; a final one cannot move", () => {
    const korak = primeniRezervaciju(memorija, ctx(), { vrsta: "otkazi", id: "rv_02", ocekivani: "accepted" });
    expect(korak.memorija.detalji.rv_02.reservation).toMatchObject({ status: "cancelled", cancelledBy: "staff", cancelledByName: "Milan", cancelledAt: IZLOG_SADA });
    expect(korak.zauzetost).toEqual({ off: true });
    expect(primeniRezervaciju(korak.memorija, ctx(), { vrsta: "stigli", id: "rv_02", ocekivani: "cancelled", positionId: null }).ishod).toMatchObject({ ok: false });
    expect(primeniRezervaciju(memorija, ctx(), { vrsta: "otkazi", id: "rv_01", ocekivani: "new" }).ishod).toMatchObject({ ok: false, code: "reservation/invalid_transition" });
  });
});

// --- 11. The izlog's fixture ----------------------------------------------------------------

describe("fixtureKonobarRezervacije", () => {
  test("the K07 reservations as the waiter's list: mode form, hold 15, a declined one only in the detail", () => {
    const { rezervacije, detalji } = REZ;
    expect(rezervacije.mode).toBe("form");
    expect(rezervacije.holdMinutes).toBe(15);
    expect(rezervacije.skraceno).toBe(false);
    expect(rezervacije.rows.map((r) => r.id)).toEqual(["rv_01", "rv_03", "rv_02", "rv_07", "rv_08", "rv_05", "rv_06"]);
    expect(Object.keys(detalji).sort()).toEqual(["rv_01", "rv_02", "rv_03", "rv_04", "rv_05", "rv_06", "rv_07", "rv_08"]);
    expect(detalji.rv_04.reservation.status).toBe("declined");
  });

  test("the bound tables are the floor's own positions (id and label)", () => {
    const po = (id: string) => SALA.positions.find((m) => m.id === red(id).positionId);
    expect(po("rv_02")?.label).toBe("Sto 6");
    expect(po("rv_07")?.label).toBe("Sto 7");
    expect(po("rv_08")?.label).toBe("Sto 2");
    expect(po("rv_05")?.label).toBe("Sto 4");
    expect(red("rv_02").positionLabel).toBe("Sto 6");
    expect(red("rv_01").positionId).toBeNull();
    expect(red("rv_01").hasNote).toBe(true);
    expect(red("rv_02").hasNote).toBe(false);
  });

  test("otkazana=1: the guest cancelled rv_06 two minutes ago; otherwise 40 minutes; prazno: nothing", () => {
    expect(red("rv_06").cancelledAt).toBe(IZLOG_SADA - minuta(40));
    expect(fixtureKonobarRezervacije({ otkazana: true }).rezervacije.rows.find((r) => r.id === "rv_06")?.cancelledAt).toBe(IZLOG_SADA - minuta(2));
    expect(fixtureKonobarRezervacije({ prazno: true }).rezervacije.rows).toEqual([]);
    expect(fixtureKonobarRezervacije({ nacin: "external" }).rezervacije.mode).toBe("external");
    expect(red("rv_05").arrivedAt).toBe(red("rv_05").requestedAt + minuta(4));
  });

  test("the detail has what the decision needs and the same-table list is that day's accepted or arrived ones", () => {
    expect(REZ.detalji.rv_01.reservation).toMatchObject({ contactEmail: "gost@example.com", contactPhone: null, decidedBy: null });
    expect(REZ.detalji.rv_02.reservation).toMatchObject({ contactPhone: "+381 60 000 0000", boundBy: "Milan", decidedBy: "Jelena" });
    expect(REZ.detalji.rv_05.reservation.arrivedBy).toBe("Milan");
    expect(rezervacijeIstogStola(REZ.rezervacije.rows, red("rv_02"))).toEqual([]);
    const druga = { ...red("rv_01"), id: "rv_x2", status: "arrived" as const, positionId: red("rv_02").positionId, requestedAt: red("rv_02").requestedAt - minuta(240) };
    expect(rezervacijeIstogStola([...REZ.rezervacije.rows, druga], red("rv_02")).map((r) => r.id)).toEqual(["rv_x2"]);
    expect(rezervacijeIstogStola(REZ.rezervacije.rows, red("rv_01"))).toEqual([]);
  });
});
