// K33 hardening tests: accessibility fixes of the waiter panel (audit A, findings A7 to A10) over the
// izlog fixture "Demo restoran". Server markup only (renderToStaticMarkup, no DOM): effects do not run
// and useSyncExternalStore answers with its server snapshot (a phone), so what is proven here is the
// markup, not the behaviour. A3 (focus returns to "Otkaži" after "Ne") lives in an effect and is
// confirmed in the browser, not here. Invented data only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureKonobar, fixtureKonobarRezervacije, fixtureSale } from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { parseKonobarPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { RezervacijeStola } from "./rezervacije/rezervacije-stola";
import { VezivanjeStola } from "./rezervacije/vezivanje-stola";
import { Sala } from "./sala/sala";
import { ZauzetostStola } from "./sto/zauzetost";
import { Zaglavlje } from "./zaglavlje";
import { VanZone } from "./zona";

const t = menuKonobarSr;
const NISTA = () => undefined;

// --- Helpers (markup is read back with small regexes, as in sala.test.tsx) ---------------

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

function attr(otvor: string, ime: string): string | undefined {
  const value = new RegExp(`\\s${ime}="([^"]*)"`).exec(otvor)?.[1];
  return value === undefined ? undefined : unesc(value);
}

type DugmeMarkup = { otvor: string; markup: string; tekst: string; ime: string | undefined; klase: string; iskljuceno: boolean };

const dugmad = (html: string): DugmeMarkup[] =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, otvor, unutra]) => ({
    otvor,
    markup: unutra,
    tekst: tekst(unutra),
    ime: attr(otvor, "aria-label"),
    klase: attr(otvor, "class") ?? "",
    iskljuceno: /\sdisabled=""/.test(otvor),
  }));

/** Any opacity utility, plain or behind a variant (`opacity-50`, `disabled:opacity-50`, `group-has-[:disabled]:opacity-55`). */
const imaOpacity = (klase: string) => /(^|[\s:])opacity-\d/.test(klase);

const izlog = (upit: IzlogSearchParams = {}) => renderToStaticMarkup(<KonobarIzlog params={parseKonobarPreview(upit)} />);

function pocetakPana(html: string): number {
  const oznaka = html.indexOf("data-bocni-pano");
  if (oznaka < 0) throw new Error("the side pane is missing");
  return html.lastIndexOf("<div", oznaka);
}

/** The class attribute of the element that opens at `pocetak`. */
const klaseNaMestu = (html: string, pocetak: number) => attr(html.slice(pocetak, html.indexOf(">", pocetak)), "class") ?? "";
const jeSakriven = (klase: string) => klase.split(/\s+/).includes("hidden");

const SALA = fixtureSale().sala;
const KORISNIK = fixtureKonobar().korisnik;

// --- A7: one h1 per screen, also on the floor of a phone --------------------------------

describe("A7: the floor screen of a phone has exactly one h1", () => {
  const sala = (nivo?: 1 | 2) =>
    renderToStaticMarkup(
      <Sala
        sala={SALA}
        zahtevi={[]}
        zauzetost={undefined}
        filterZoneId={null}
        sadaMs={IZLOG_SADA}
        izabranoId={null}
        onIzaberi={NISTA}
        prikaz="raspored"
        onPrikaz={NISTA}
        podsetnik={new Set<string>()}
        nivo={nivo}
      />,
    );

  test("nivo 1 (the floor is the only visible pane): its heading is the h1, with the same id and no h2", () => {
    const html = sala(1);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain('<h1 id="sala-naslov"');
    expect(count(html, "<h2")).toBe(0);
    expect(tekst(html.slice(html.indexOf("<h1"), html.indexOf("</h1>")))).toBe(t.sala.naslov);
  });

  test("by default (the floor next to another pane) it stays an h2, so a wide screen never has two h1", () => {
    const html = sala();
    expect(count(html, "<h1")).toBe(0);
    expect(html).toContain('<h2 id="sala-naslov"');
    expect(sala(2)).toBe(html);
  });

  test("the panel gives the floor the h1 only when the side pane is hidden on a phone", () => {
    // Floor view, nothing opened: the floor is the one visible pane (the queue pane is hidden below lg).
    const raspored = izlog({ ekran: "sala-raspored" });
    const pano = pocetakPana(raspored);
    expect(jeSakriven(klaseNaMestu(raspored, pano))).toBe(true);
    const floor = raspored.slice(raspored.indexOf('<section aria-labelledby="sala-naslov"'), pano);
    expect(floor).toContain('<h1 id="sala-naslov"');
    // What a phone shows: the whole markup minus the hidden pane has exactly one h1.
    expect(count(raspored, "<h1") - count(raspored.slice(pano, raspored.indexOf("<nav", pano)), "<h1")).toBe(1);

    // Queue, request detail, table detail: the floor is hidden (or beside the pane), the pane owns the h1.
    const upiti: IzlogSearchParams[] = [{}, { ekran: "detalj" }, { ekran: "sto" }];
    for (const upit of upiti) {
      const html = izlog(upit);
      expect(html, JSON.stringify(upit)).toContain('<h2 id="sala-naslov"');
      expect(count(html, "<h1"), JSON.stringify(upit)).toBe(1);
    }
  });
});

// --- A8: "Prikaži sve" is a 48 px target ------------------------------------------------

describe("A8: Prikaži sve inherits the 48 px target of the waiter panel", () => {
  test("no min-h-11 on the button; the base min-h-[var(--mp-meta)] (48 px on the waiter surface) stands", () => {
    const html = renderToStaticMarkup(<VanZone broj={3} kasni={1} onSve={NISTA} />);
    const prikaziSve = dugmad(html).find((b) => b.tekst === t.zona.prikaziSve);
    expect(prikaziSve).toBeDefined();
    expect(prikaziSve!.klase).not.toMatch(/\bmin-h-11\b/);
    expect(prikaziSve!.klase).toContain("min-h-[var(--mp-meta)]");
  });
});

// --- A9: the visible text of the sound switch is part of its accessible name ------------

describe("A9: the sound switch names itself with its visible text (WCAG 2.5.3)", () => {
  const zaglavlje = (ukljucen: boolean) =>
    renderToStaticMarkup(
      <Zaglavlje lokal="Demo restoran" korisnik={KORISNIK} aktivni={2} sadaMs={IZLOG_SADA} onOdjava={NISTA} zvuk={{ ukljucen, onPrebaci: NISTA }} />,
    );

  test.each([
    [true, t.zvuk.ukljucen],
    [false, t.zvuk.iskljucen],
  ])("sound on = %s: the name starts with the visible word and keeps the long label", (ukljucen, vidljivo) => {
    const html = zaglavlje(ukljucen);
    const zvuk = dugmad(html).find((b) => attr(b.otvor, "data-zvuk") !== undefined);
    expect(zvuk).toBeDefined();
    // The visible text (shown from xl) is exactly the dictionary word for the state.
    expect(tekst(zvuk!.markup)).toBe(vidljivo);
    expect(zvuk!.ime).toBeDefined();
    expect(zvuk!.ime!.toLowerCase()).toContain(vidljivo.toLowerCase());
    expect(zvuk!.ime!.startsWith(vidljivo)).toBe(true);
    expect(zvuk!.ime).toContain(t.zvuk.oznaka);
    // The state stays a pressed state and a title, not only a colour.
    expect(attr(zvuk!.otvor, "aria-pressed")).toBe(String(ukljucen));
    expect(attr(zvuk!.otvor, "title")).toBe(vidljivo);
  });
});

// --- A10: disabled data is muted, not faded ---------------------------------------------

describe("A10: disabled elements that carry data use secondary text on a muted surface, not opacity", () => {
  const mutirano = (klase: string) =>
    klase.includes("disabled:text-[var(--mp-tekst-sporedni)]") && klase.includes("disabled:bg-[var(--mp-povrsina-utisana)]");

  test("the table picker of a reservation (VezivanjeStola), offline", () => {
    const html = renderToStaticMarkup(
      <VezivanjeStola sala={SALA} trenutnoId={SALA.positions[0].id} iskljuceno radi={false} onIzaberi={NISTA} onOdustani={NISTA} />,
    );
    const izbori = dugmad(html).filter((b) => attr(b.otvor, "data-izbor-sto") !== undefined);
    expect(izbori.length).toBe(SALA.positions.length);
    expect(izbori.every((b) => b.iskljuceno)).toBe(true);
    for (const b of izbori) expect(imaOpacity(b.klase), b.tekst).toBe(false);
    // Every table but the current one is a muted surface; the current one keeps its ink and fill.
    const nijeTrenutno = izbori.filter((b) => attr(b.otvor, "data-izbor-sto") !== SALA.positions[0].id);
    expect(nijeTrenutno.every((b) => mutirano(b.klase))).toBe(true);
    expect(html).not.toMatch(/(^|[\s:"])opacity-\d/);
  });

  test("the reservations to bind to a table (RezervacijeStola), offline", () => {
    const rez = fixtureKonobarRezervacije().rezervacije.rows;
    const nevezana = rez.map((r) => (r.id === "rv_02" ? { ...r, positionId: null, positionLabel: null } : r));
    const html = renderToStaticMarkup(
      <RezervacijeStola
        mestoId={SALA.positions[0].id}
        redovi={nevezana}
        sadaMs={IZLOG_SADA}
        holdMin={15}
        radiId={null}
        radnjeIskljucene
        razlogId={undefined}
        onOtvori={NISTA}
        onStigli={NISTA}
        onPovezi={NISTA}
        pocetnoPovezivanje
      />,
    );
    const izbori = dugmad(html).filter((b) => attr(b.otvor, "data-povezi") !== undefined);
    expect(izbori.length).toBeGreaterThan(0);
    expect(izbori.every((b) => b.iskljuceno)).toBe(true);
    for (const b of izbori) {
      expect(imaOpacity(b.klase), b.tekst).toBe(false);
      expect(mutirano(b.klase), b.tekst).toBe(true);
    }
  });

  test("the occupancy buttons (ZauzetostStola): offline, and while a change is in flight", () => {
    const offline = renderToStaticMarkup(
      <ZauzetostStola stanje="occupied" meta={{ updatedAt: IZLOG_SADA, updatedBy: "Milan" }} radi={false} iskljuceno onPromena={NISTA} />,
    );
    const radi = renderToStaticMarkup(
      <ZauzetostStola stanje="occupied" meta={{ updatedAt: IZLOG_SADA, updatedBy: "Milan" }} radi iskljuceno={false} onPromena={NISTA} />,
    );
    for (const html of [offline, radi]) {
      const plocice = dugmad(html).filter((b) => attr(b.otvor, "data-zauzetost-dugme") !== undefined);
      expect(plocice).toHaveLength(4);
      for (const b of plocice) expect(imaOpacity(b.klase), b.tekst).toBe(false);
      expect(html).not.toMatch(/(^|[\s:"])opacity-\d/);
    }
    // Offline: the three other states are disabled and muted; the current one (aria-pressed) keeps its ink.
    const drugaStanja = (html: string) =>
      dugmad(html).filter((b) => attr(b.otvor, "data-zauzetost-dugme") !== undefined && attr(b.otvor, "data-zauzetost-dugme") !== "occupied");
    const iskljuceneOffline = drugaStanja(offline);
    expect(iskljuceneOffline).toHaveLength(3);
    expect(iskljuceneOffline.every((b) => b.iskljuceno && mutirano(b.klase))).toBe(true);
    // In flight: the others ignore taps (aria-disabled) and look muted too.
    const ostali = drugaStanja(radi);
    expect(ostali).toHaveLength(3);
    expect(ostali.every((b) => attr(b.otvor, "aria-disabled") === "true" && b.klase.includes("text-[var(--mp-tekst-sporedni)]"))).toBe(true);
  });
});
