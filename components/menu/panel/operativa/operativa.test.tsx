// K27 render tests of Operativa, the read-only overview of the client panel
// (master §13.5): the list of active requests and who took them, the quiet
// reminder to the waiter, the filters, the staff on shift, today's reservations
// and the detail of one request. No DOM in the edge-runtime environment: the
// screen is checked as a renderToStaticMarkup string (a Radix drawer renders
// only its opener on the server, so the content of the detail drawer is checked
// through DetaljSadrzaj). Invented data only (fixtures/operativa-panel.ts).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { fixtureOperacije } from "@/components/menu/fixtures/operativa-panel";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { clockTime } from "@/lib/menu/elapsed-time";
import { MENU_PING_COOLDOWN_MS } from "@/lib/menu/limits";
import {
  BEZ_FILTERA,
  FILTER_NEPREUZETI,
  operacijeView,
  type OperacijeFilteri,
  type OperacijePodaci,
} from "@/lib/menu/operations-view";
import { DetaljSadrzaj, trajanjeTekst } from "./detalj";
import { Operativa, PingDetalja, type OperativaDetalj } from "./operativa";

const t = menuPanelSr.operativa;
const d = menuDomenSr;
const KONOBAR_HREF = "/demo-restoran/konobar";
const PAZNJA = fixtureOperacije({ sadrzaj: "paznja", pingPoslat: false });
const MIRNO = fixtureOperacije({ sadrzaj: "mirno", pingPoslat: false });

// What React puts into markup for text, and back for attribute values.
const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

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

type Dugme = { tag: string; ime: string };

/** Every <button> of the markup with the name a person gets: its aria-label, else its text. */
function dugmad(html: string): Dugme[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
    tag: match[0],
    ime: attr(match[1], "aria-label") ?? tekst(match[2]),
  }));
}

/** The markup of one request card (<li data-zahtev="rq_05" …>…</li>), by id. */
function kartica(html: string, id: string): string {
  const pocetak = html.indexOf(`<li data-zahtev="${id}"`);
  if (pocetak < 0) throw new Error(`no card for ${id}`);
  return html.slice(pocetak, html.indexOf("</li>", pocetak) + "</li>".length);
}

function karticaRezervacije(html: string, id: string): string {
  const pocetak = html.indexOf(`<li data-rezervacija="${id}"`);
  if (pocetak < 0) throw new Error(`no reservation ${id}`);
  return html.slice(pocetak, html.indexOf("</li>", pocetak) + "</li>".length);
}

const idKartica = (html: string) => [...html.matchAll(/<li data-zahtev="([^"]+)"/g)].map((match) => match[1]);
const jePing = (dugme: Dugme) => dugme.ime.startsWith(t.ping.dugme);
/** The attribute, not the `aria-disabled:` classes every button carries. */
const onemogucen = (tag: string | undefined) => /\saria-disabled="true"/.test(tag ?? "");

type Opcije = {
  podaci?: OperacijePodaci;
  filteri?: OperacijeFilteri;
  izabranId?: string | null;
  detalj?: OperativaDetalj | null | undefined;
  nowMs?: number;
  pocetnoFilteriOtvoreni?: boolean;
};

function prikazi(opcije: Opcije = {}): string {
  return renderToStaticMarkup(
    <Operativa
      podaci={opcije.podaci ?? PAZNJA}
      nowMs={opcije.nowMs ?? IZLOG_SADA}
      filteri={opcije.filteri ?? BEZ_FILTERA}
      onFilteri={() => undefined}
      izabranId={opcije.izabranId ?? null}
      onIzaberi={() => undefined}
      detalj={"detalj" in opcije ? opcije.detalj : null}
      onPing={() => Promise.resolve({ ok: true as const, sentAt: IZLOG_SADA })}
      konobarHref={KONOBAR_HREF}
      pocetnoFilteriOtvoreni={opcije.pocetnoFilteriOtvoreni}
    />,
  );
}

const idKonobara = (ime: string) => {
  const smena = PAZNJA.onShift.find((kandidat) => kandidat.name === ime);
  if (!smena) throw new Error(`${ime} is not on shift in the fixture`);
  return smena.staffId;
};

describe("Operativa: the screen", () => {
  const html = prikazi();

  test("one H1, the name of the section, with the one-line purpose under it", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(`>${esc(menuPanelSr.sekcije.operativa)}</h1>`);
    expect(html).toContain(`>${esc(t.opis)}</p>`);
  });

  test("the only link leads to the waiter panel", () => {
    const linkovi = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    expect(linkovi).toHaveLength(1);
    expect(attr(linkovi[0][1], "href")).toBe(KONOBAR_HREF);
    expect(tekst(linkovi[0][2])).toBe(t.konobarskiPanel);
  });

  test("the sections are Zahtevi, U smeni and Rezervacije danas", () => {
    const naslovi = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => unesc(match[1]));
    expect(naslovi).toEqual([t.zahtevi.naslov, t.smena.naslov, t.rezervacije.naslov].map(esc));
  });

  test("none of the waiter's actions is on the screen", () => {
    const rez = menuKonobarSr.rezervacije.detalj;
    const radnje = [
      "Preuzmi",
      "Završi",
      "Otkaži",
      "Prihvati",
      ...Object.values(menuKonobarSr.red.radnja),
      ...Object.values(menuKonobarSr.rezervacije.radnja),
      menuKonobarSr.detalj.preuzmi,
      menuKonobarSr.detalj.zavrsi,
      menuKonobarSr.detalj.otkazi,
      menuKonobarSr.detalj.otkaziDa,
      rez.prihvati,
      rez.predlozi,
      rez.odbij,
      rez.odbijDa,
      rez.gostPrihvata,
      rez.stigli,
      rez.otkazi,
      rez.otkaziDa,
      rez.poveziSto,
    ];
    for (const radnja of radnje) expect(html, radnja).not.toContain(esc(radnja));
  });

  test("the only buttons are the filters, Detalj and the reminder", () => {
    const imena = dugmad(html).map((dugme) => dugme.ime);
    expect(imena.length).toBeGreaterThan(0);
    for (const ime of imena) {
      const dozvoljeno =
        ime === t.filteri.dugme ||
        ime === t.filteri.ocisti ||
        ime.startsWith(`${t.red.detalj}:`) ||
        ime.startsWith(t.ping.dugme);
      expect(dozvoljeno, ime).toBe(true);
    }
  });

  test("with filters in force the buttons are still only those, and Očisti filtere and Filteri · N are there", () => {
    const filteri: OperacijeFilteri = { vrsta: "order", konobar: idKonobara("Milan"), zona: null };
    const imena = dugmad(prikazi({ filteri })).map((dugme) => dugme.ime);
    expect(imena).toContain(t.filteri.ocisti);
    expect(imena).toContain(fmt(t.filteri.dugmeBroj, { n: 2 }));
    for (const ime of imena) {
      const dozvoljeno =
        ime === t.filteri.ocisti ||
        ime === fmt(t.filteri.dugmeBroj, { n: 2 }) ||
        ime.startsWith(`${t.red.detalj}:`) ||
        ime.startsWith(t.ping.dugme);
      expect(dozvoljeno, ime).toBe(true);
    }
    expect(dugmad(html).map((dugme) => dugme.ime)).not.toContain(t.filteri.ocisti);
  });

  test("no contact of a guest and no name of a guest anywhere", () => {
    const vidljivo = tekst(html);
    expect(vidljivo).not.toContain("@");
    expect(vidljivo).not.toContain("+381");
    expect(html).not.toContain("example.com");
    for (const ime of ["Marija P.", "Nikola S.", "Jelena M.", "Ivana B.", "Milica D."]) expect(html).not.toContain(ime);
  });

  test("opening a detail and the filter drawer of the telephone do not change the page (drawers render on the client)", () => {
    const otvoreno = prikazi({ izabranId: "rq_05", pocetnoFilteriOtvoreni: true });
    expect(count(otvoreno, "<h1")).toBe(1);
    expect(idKartica(otvoreno)).toEqual(idKartica(html));
  });
});

describe("Operativa: the list of requests", () => {
  const html = prikazi();

  test("one list item per active request: late first, then the longest waiting", () => {
    const view = operacijeView(PAZNJA, BEZ_FILTERA, IZLOG_SADA);
    expect(idKartica(html)).toEqual(view.redovi.map((red) => red.id));
    expect(idKartica(html)).toHaveLength(7);
    expect(idKartica(html).slice(0, 2)).toEqual(["rq_05", "rq_04"]);
    expect(count(html, "<ul")).toBeGreaterThanOrEqual(1);
  });

  test("a card names the kind, the place with the zone, the status, who took it and the time", () => {
    const kasni = kartica(html, "rq_05");
    expect(kasni).toContain(`>${esc(d.requestKinds.order)}</p>`);
    expect(kasni).toContain("Sto 3 · Glavna sala");
    expect(kasni).toContain(esc(d.requestStatuses.accepted));
    expect(kasni).toContain(esc(fmt(t.red.preuzeto, { ime: "Milan" })));
    // K27 review (intentional): was "<clock> · čeka 19:00", which an owner reads as a clock time; now "Poslato u <clock> · čeka 19 min".
    expect(tekst(kasni)).toContain(
      fmt(t.red.vreme, { sat: clockTime(IZLOG_SADA - 19 * 60_000), trajanje: fmt(t.red.trajanje.min, { n: 19 }) }),
    );

    const nov = kartica(html, "rq_01");
    expect(nov).toContain(esc(d.requestKinds.call));
    expect(nov).toContain(esc(d.requestStatuses.new));
    expect(nov).toContain(esc(t.red.nepreuzet));
    // K27 review (intentional): was "<clock> · čeka 08:12"; 8 min 12 s is now "čeka 8 min".
    expect(tekst(nov)).toContain(
      fmt(t.red.vreme, { sat: clockTime(IZLOG_SADA - 8 * 60_000 - 12_000), trajanje: fmt(t.red.trajanje.min, { n: 8 }) }),
    );
    // The waiter panel's own mm:ss timer is not used here.
    expect(tekst(kasni)).not.toContain("19:00");
    expect(tekst(nov)).not.toContain("08:12");
  });

  test("a request taken with an account says so", () => {
    expect(kartica(html, "rq_06")).toContain(esc(fmt(t.red.preuzetoNalogom, { ime: "Vlasnik" })));
  });

  test("a late request has the calm chip with the word, the others do not; the count says how many", () => {
    for (const id of ["rq_05", "rq_04"]) {
      expect(kartica(html, id)).toContain('data-kasni="true"');
      expect(kartica(html, id)).toContain(`>${esc(t.red.kasni)}</span>`);
    }
    for (const id of ["rq_01", "rq_02", "rq_03", "rq_06", "rq_12"]) {
      expect(kartica(html, id)).not.toContain("data-kasni");
      expect(kartica(html, id)).not.toContain(`>${esc(t.red.kasni)}</span>`);
    }
    expect(html).toContain(esc(fmt(t.zahtevi.kasni.few, { n: 2 })));
    // K27 review (intentional): was "7 od 7" under the title; with no filter that count says nothing, so it is gone.
    expect(html).not.toContain(esc(fmt(t.zahtevi.broj, { n: 7, ukupno: 7 })));
    // K27 review (intentional): was the permanent line about the reminder under "Zahtevi"; it is written once, in the drawer.
    expect(html).not.toContain(esc(t.ping.objasnjenje));
  });

  test("one plain summary under the title: how many wait for someone, how many are with the staff", () => {
    const nova = PAZNJA.requests.filter((zahtev) => zahtev.status === "new").length;
    const kodOsoblja = PAZNJA.requests.filter((zahtev) => zahtev.status === "accepted").length;
    expect([nova, kodOsoblja]).toEqual([4, 3]);
    const sazetak = `${fmt(t.zahtevi.cekajuPreuzimanje.few, { n: 4 })} · ${fmt(t.zahtevi.kodOsoblja.few, { n: 3 })}`;
    const zaglavlje = html.slice(html.indexOf(`>${esc(t.zahtevi.naslov)}</h2>`), html.indexOf(`<ul class="grid gap-3"`));
    expect(tekst(zaglavlje)).toContain(sazetak);
    expect(zaglavlje).toContain(esc(fmt(t.zahtevi.kasni.few, { n: 2 })));
    expect(count(html, esc(sazetak))).toBe(1);
  });

  test("the summary counts all the active requests, singular forms, and leaves out a part that is zero", () => {
    const samo = (...ids: string[]): OperacijePodaci => ({
      ...PAZNJA,
      requests: PAZNJA.requests.filter((zahtev) => ids.includes(zahtev.id)),
    });
    const jedanNov = tekst(prikazi({ podaci: samo("rq_01" /* new */) }));
    expect(jedanNov).toContain(fmt(t.zahtevi.cekajuPreuzimanje.one, { n: 1 }));
    expect(jedanNov).not.toContain(fmt(t.zahtevi.kodOsoblja.one, { n: 1 }));

    const samoKodOsoblja = tekst(prikazi({ podaci: samo("rq_06" /* taken by the owner's account */) }));
    expect(samoKodOsoblja).toContain(fmt(t.zahtevi.kodOsoblja.one, { n: 1 }));
    expect(samoKodOsoblja).not.toContain(fmt(t.zahtevi.cekajuPreuzimanje.one, { n: 1 }));

    // A filter narrows the list, never the summary: the filtered view says "1 od 7" next to it.
    const filtriran = prikazi({ filteri: { vrsta: null, konobar: idKonobara("Milan"), zona: null } });
    expect(tekst(filtriran)).toContain(`${fmt(t.zahtevi.cekajuPreuzimanje.few, { n: 4 })} · ${fmt(t.zahtevi.kodOsoblja.few, { n: 3 })}`);
    expect(filtriran).toContain(esc(fmt(t.zahtevi.broj, { n: 1, ukupno: 7 })));
  });

  test("the waiting time is in words, not a clock: under a minute, minutes, hours and minutes", () => {
    const cekanje = (sekundi: number) => trajanjeTekst(sekundi);
    expect(cekanje(0)).toBe(t.red.trajanje.manje);
    expect(cekanje(59)).toBe(t.red.trajanje.manje);
    expect(cekanje(60)).toBe(fmt(t.red.trajanje.min, { n: 1 }));
    expect(cekanje(59 * 60 + 59)).toBe(fmt(t.red.trajanje.min, { n: 59 }));
    expect(cekanje(60 * 60)).toBe(fmt(t.red.trajanje.sati, { h: 1, m: 0 }));
    expect(cekanje(125 * 60)).toBe(fmt(t.red.trajanje.sati, { h: 2, m: 5 }));
    // A device clock a little behind the server never gives a negative or a broken wait.
    expect(cekanje(-5)).toBe(t.red.trajanje.manje);
    expect(cekanje(Number.NaN)).toBe(t.red.trajanje.manje);
  });

  test("Detalj is on every card, and its name tells which request it opens", () => {
    for (const id of idKartica(html)) {
      const dugmeDetalj = dugmad(kartica(html, id)).filter((dugme) => dugme.ime.startsWith(`${t.red.detalj}:`));
      expect(dugmeDetalj, id).toHaveLength(1);
    }
    expect(dugmad(kartica(html, "rq_05")).find((dugme) => dugme.ime.startsWith(t.red.detalj))?.ime).toBe(
      fmt(t.red.detaljCitac, { vrsta: d.requestKinds.order, mesto: "Sto 3 · Glavna sala" }),
    );
  });

  test("a venue without zones does not write a zone anywhere", () => {
    const bezZona: OperacijePodaci = {
      ...PAZNJA,
      zones: [],
      onShift: PAZNJA.onShift.map((smena) => ({ ...smena, zoneName: null })),
      requests: PAZNJA.requests.map((zahtev) => ({ ...zahtev, zoneId: null, zoneName: null })),
    };
    const bez = prikazi({ podaci: bezZona });
    expect(bez).not.toContain("Glavna sala");
    expect(bez).not.toContain(esc(t.smena.bezZone));
    expect(tekst(kartica(bez, "rq_05"))).toContain("Sto 3");
    expect(kartica(bez, "rq_05")).not.toContain("Sto 3 ·");
  });
});

describe("Operativa: the quiet reminder", () => {
  const html = prikazi();

  test("the button is only on requests a waiter took, and has the long name for a screen reader", () => {
    const sKonobarom = PAZNJA.requests.filter((zahtev) => zahtev.acceptedBy?.kind === "staff").map((zahtev) => zahtev.id);
    expect(sKonobarom.sort()).toEqual(["rq_05", "rq_12"]);
    for (const id of idKartica(html)) {
      const pingDugmad = dugmad(kartica(html, id)).filter(jePing);
      expect(pingDugmad, id).toHaveLength(sKonobarom.includes(id) ? 1 : 0);
    }
    const dugme = dugmad(kartica(html, "rq_05")).find(jePing);
    expect(dugme?.ime).toBe(
      fmt(t.ping.dugmeCitac, { ime: "Milan", vrsta: d.requestKinds.order, mesto: "Sto 3 · Glavna sala" }),
    );
    expect(onemogucen(dugme?.tag)).toBe(false);
    expect(kartica(html, "rq_05")).toContain(`>${esc(t.ping.dugme)}</button>`);
  });

  test("a new request has no button and says nothing about a reminder", () => {
    for (const id of ["rq_01", "rq_02", "rq_03", "rq_04"]) {
      const sadrzaj = kartica(html, id);
      expect(sadrzaj, id).not.toContain(esc(t.ping.dugme));
      expect(sadrzaj, id).not.toContain(esc(t.ping.razlozi.nepreuzet));
      expect(sadrzaj, id).not.toContain(esc(t.ping.razlozi.nalog));
    }
  });

  test("a request an account took has the reason and no button", () => {
    const sadrzaj = kartica(html, "rq_06");
    expect(dugmad(sadrzaj).filter(jePing)).toHaveLength(0);
    expect(sadrzaj).toContain(esc(t.ping.razlozi.nalog));
  });

  test("a polite status line is in the page for every request a reminder concerns", () => {
    expect(kartica(html, "rq_05")).toMatch(/<p role="status" aria-live="polite">/);
    expect(kartica(html, "rq_01")).not.toContain('role="status"');
  });

  test("a reminder sent two minutes ago: the time, the reason and a button that waits", () => {
    const poslat = prikazi({ podaci: fixtureOperacije({ sadrzaj: "paznja", pingPoslat: true }) });
    const sadrzaj = kartica(poslat, "rq_05");
    const poslatU = IZLOG_SADA - 2 * 60_000;
    expect(sadrzaj).toContain(esc(fmt(t.ping.poslat, { vreme: clockTime(poslatU) })));
    expect(sadrzaj).toContain(esc(fmt(t.ping.razlozi.poslat, { vreme: clockTime(poslatU + MENU_PING_COOLDOWN_MS) })));
    const dugme = dugmad(sadrzaj).find(jePing);
    expect(onemogucen(dugme?.tag)).toBe(true);
    const opisId = attr(dugme?.tag ?? "", "aria-describedby");
    expect(opisId).toBeTruthy();
    expect(sadrzaj).toContain(`<p id="${opisId}"`);
    // The other waiter's request is not affected.
    expect(onemogucen(dugmad(kartica(poslat, "rq_12")).find(jePing)?.tag)).toBe(false);
  });

  test("a reminder the waiter has seen says so", () => {
    const videno: OperacijePodaci = {
      ...PAZNJA,
      requests: PAZNJA.requests.map((zahtev) =>
        zahtev.id === "rq_05" ? { ...zahtev, lastPing: { at: IZLOG_SADA - 8 * 60_000, seen: true } } : zahtev,
      ),
    };
    const sadrzaj = kartica(prikazi({ podaci: videno }), "rq_05");
    expect(sadrzaj).toContain(esc(fmt(t.ping.vidjen, { vreme: clockTime(IZLOG_SADA - 8 * 60_000) })));
    // Eight minutes have passed: the reminder may be sent again.
    expect(onemogucen(dugmad(sadrzaj).find(jePing)?.tag)).toBe(false);
    expect(sadrzaj).not.toContain(esc(t.ping.razlozi.poslat.split("{")[0]));
  });
});

describe("Operativa: the filters", () => {
  test("the kind, the waiter and the zone, each with a visible label", () => {
    const html = prikazi();
    expect(count(html, "<select")).toBe(3);
    expect(count(html, "<label")).toBe(3);
    for (const naziv of [t.filteri.vrsta, t.filteri.konobar, t.filteri.zona]) expect(html).toContain(`>${esc(naziv)}</label>`);
    const opcije = [...html.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/g)].map((match) => unesc(match[1]));
    expect(opcije).toEqual(
      expect.arrayContaining([
        t.filteri.sve,
        d.requestKinds.call,
        d.requestKinds.bill,
        d.requestKinds.order,
        t.filteri.svi,
        t.filteri.nepreuzeti,
        "Milan",
        "Jelena",
        "Stefan",
        t.filteri.sveZone,
        "Glavna sala",
        "Terasa",
        "VIP",
      ]),
    );
  });

  test("no zone filter when the venue has no zones", () => {
    const html = prikazi({ podaci: { ...PAZNJA, zones: [] } });
    expect(count(html, "<select")).toBe(2);
    expect(html).not.toContain(`>${esc(t.filteri.zona)}</label>`);
    expect(html).not.toContain(esc(t.filteri.sveZone));
  });

  test("the chosen values are selected", () => {
    const html = prikazi({ filteri: { vrsta: "order", konobar: FILTER_NEPREUZETI, zona: null } });
    const izabrane = [...html.matchAll(/<option\b([^>]*)>/g)]
      .filter((match) => /\sselected=""/.test(match[1]))
      .map((match) => attr(match[1], "value"));
    // One chosen option per select; the zone select has none chosen, so it shows "Sve zone".
    expect(izabrane).toEqual(["order", FILTER_NEPREUZETI, ""]);
  });

  test("a waiter filter shows only the requests of that waiter", () => {
    const html = prikazi({ filteri: { vrsta: null, konobar: idKonobara("Milan"), zona: null } });
    expect(idKartica(html)).toEqual(["rq_05"]);
    expect(html).toContain(esc(fmt(t.zahtevi.broj, { n: 1, ukupno: 7 })));
  });

  test("'Još niko nije preuzeo' shows the new requests, none with a reminder", () => {
    const html = prikazi({ filteri: { vrsta: null, konobar: FILTER_NEPREUZETI, zona: null } });
    expect(idKartica(html).sort()).toEqual(["rq_01", "rq_02", "rq_03", "rq_04"]);
    expect(dugmad(html).filter(jePing)).toHaveLength(0);
  });

  test("the filter button names how many filters are in force", () => {
    expect(dugmad(prikazi()).map((dugme) => dugme.ime)).toContain(t.filteri.dugme);
    const dva = prikazi({ filteri: { vrsta: "bill", konobar: null, zona: PAZNJA.zones[0].id } });
    expect(dugmad(dva).map((dugme) => dugme.ime)).toContain(fmt(t.filteri.dugmeBroj, { n: 2 }));
  });
});

describe("Operativa: empty states", () => {
  test("nothing is waiting: the state, the reason and no list", () => {
    const html = prikazi({ podaci: MIRNO });
    expect(html).toContain(`>${esc(t.zahtevi.prazno)}</h3>`);
    expect(html).toContain(esc(t.zahtevi.praznoOpis));
    expect(idKartica(html)).toEqual([]);
    expect(dugmad(html).filter((dugme) => dugme.ime.startsWith(t.red.detalj))).toHaveLength(0);
    expect(html).not.toContain(esc(t.zahtevi.praznoFilter));
    expect(count(html, "<h1")).toBe(1);
    // K27 review (intentional): the line about the reminder is no longer permanent, so the empty state does not carry it,
    // and there is no summary of requests when there are none.
    expect(html).not.toContain(esc(t.ping.objasnjenje));
    expect(html).not.toContain(esc(t.zahtevi.cekajuPreuzimanje.one.replace("{n} ", "")));
    expect(html).not.toContain(esc(t.zahtevi.kodOsoblja.one.replace("{n} ", "")));
  });

  test("the filters hide everything: the state names the filters and offers to clear them", () => {
    const filteri: OperacijeFilteri = { vrsta: "call", konobar: idKonobara("Stefan"), zona: null };
    const html = prikazi({ filteri });
    expect(idKartica(html)).toEqual([]);
    expect(html).toContain(`>${esc(t.zahtevi.praznoFilter)}</h3>`);
    expect(html).toContain(esc(t.zahtevi.praznoFilterOpis));
    expect(html).not.toContain(esc(t.zahtevi.prazno));
    expect(dugmad(html).filter((dugme) => dugme.ime === t.filteri.ocisti).length).toBeGreaterThanOrEqual(1);
    expect(html).toContain(esc(fmt(t.zahtevi.broj, { n: 0, ukupno: 7 })));
  });

  test("a cut list says so", () => {
    expect(prikazi({ podaci: { ...PAZNJA, truncated: true } })).toContain(esc(t.zahtevi.skraceno));
    expect(prikazi()).not.toContain(esc(t.zahtevi.skraceno));
  });
});

describe("Operativa: the staff on shift", () => {
  test("name, zone and since when", () => {
    const html = prikazi();
    const odeljak = html.slice(html.indexOf(`>${esc(t.smena.naslov)}</h2>`), html.indexOf(`>${esc(t.rezervacije.naslov)}</h2>`));
    for (const smena of PAZNJA.onShift) {
      expect(odeljak).toContain(`>${esc(smena.name)}</p>`);
      expect(odeljak).toContain(`>${esc(smena.zoneName ?? "")}</p>`);
      expect(odeljak).toContain(esc(fmt(t.smena.od, { vreme: clockTime(smena.since) })));
    }
    expect(PAZNJA.onShift).toHaveLength(3);
  });

  test("nobody signed in: one calm sentence", () => {
    const html = prikazi({ podaci: { ...PAZNJA, onShift: [] } });
    expect(html).toContain(`>${esc(t.smena.prazno)}</p>`);
  });

  test("a session that has run out is no longer on shift", () => {
    const istekla: OperacijePodaci = { ...PAZNJA, onShift: PAZNJA.onShift.map((smena) => ({ ...smena, expiresAt: IZLOG_SADA - 1 })) };
    expect(prikazi({ podaci: istekla })).toContain(`>${esc(t.smena.prazno)}</p>`);
  });
});

describe("Operativa: reservations of today", () => {
  const html = prikazi();

  test("the open ones of today by time, without a name or a contact", () => {
    const ids = [...html.matchAll(/<li data-rezervacija="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["rv_07", "rv_01", "rv_03", "rv_02"]);
    expect(html).toContain(esc(fmt(t.rezervacije.gosti, { vreme: "19:00", gosti: fmt(d.guests.few, { n: 4 }) })));
    expect(html).toContain(esc(fmt(t.rezervacije.gosti, { vreme: "20:00", gosti: fmt(d.guests.many, { n: 6 }) })));
    // Tomorrow's, the declined, the guests who arrived and the cancelled one are not shown.
    for (const id of ["rv_04", "rv_05", "rv_06", "rv_08"]) expect(html).not.toContain(`data-rezervacija="${id}"`);
  });

  test("the status in words, the table when it is bound and 'Bez stola' when not", () => {
    const novi = karticaRezervacije(html, "rv_01");
    expect(novi).toContain(esc(d.reservationStatuses.new));
    expect(novi).toContain(esc(t.rezervacije.bezStola));
    const prihvacena = karticaRezervacije(html, "rv_02");
    expect(prihvacena).toContain(esc(d.reservationStatuses.accepted));
    expect(prihvacena).toContain("Sto 6");
    expect(karticaRezervacije(html, "rv_03")).toContain(esc(d.reservationStatuses.change_proposed));
  });

  test("a table held past the hold is marked late", () => {
    expect(karticaRezervacije(html, "rv_07")).toContain(`>${esc(t.rezervacije.kasni)}</span>`);
    expect(karticaRezervacije(html, "rv_01")).not.toContain(`>${esc(t.rezervacije.kasni)}</span>`);
  });

  test("the quiet venue has one reservation later today; no reservation is one calm sentence", () => {
    const mirno = prikazi({ podaci: MIRNO });
    expect([...mirno.matchAll(/<li data-rezervacija="([^"]+)"/g)]).toHaveLength(1);
    const nema = prikazi({ podaci: { ...MIRNO, reservations: [] } });
    expect(nema).toContain(`>${esc(t.rezervacije.prazno)}</p>`);
    expect(prikazi({ podaci: { ...PAZNJA, reservationsTruncated: true } })).toContain(esc(t.rezervacije.skraceno));
  });
});

describe("DetaljSadrzaj: the read-only detail", () => {
  const view = operacijeView(PAZNJA, BEZ_FILTERA, IZLOG_SADA);
  const red = (id: string) => {
    const nadjen = view.redovi.find((kandidat) => kandidat.id === id);
    if (!nadjen) throw new Error(`no row ${id}`);
    return nadjen;
  };
  const detalj: OperativaDetalj = {
    sourceLabel: "Sto uz prozor",
    subtotalRsd: null,
    deliveryFeeRsd: null,
    items: [
      { name: "Mešano meso", variantName: null, addons: ["Pomfrit", "Grilovano povrće"], quantity: 1, lineTotalRsd: 2840, note: "Bez ljutog." },
      { name: "Ćevapi", variantName: "10 komada", addons: [], quantity: 2, lineTotalRsd: 1990, note: null },
    ],
  };
  const prikaz = (props: Partial<Parameters<typeof DetaljSadrzaj>[0]> & { red: Parameters<typeof DetaljSadrzaj>[0]["red"] }) =>
    renderToStaticMarkup(<DetaljSadrzaj detalj={detalj} nowMs={IZLOG_SADA} imaZone ping={null} {...props} />);

  test("says it is only for looking, and has no button and no waiter action", () => {
    const html = prikazi({ izabranId: "rq_03" });
    expect(html).not.toContain(esc(t.detalj.samoPregled));
    const sadrzaj = prikaz({ red: red("rq_03") });
    expect(sadrzaj).toContain(esc(t.detalj.samoPregled));
    expect(sadrzaj).not.toContain("<button");
    for (const radnja of ["Preuzmi", "Završi", "Otkaži", "Prihvati"]) expect(sadrzaj).not.toContain(radnja);
  });

  test("the state, when it came, who has it, the zone and the card", () => {
    const sadrzaj = prikaz({ red: red("rq_03") });
    const vidljivo = tekst(sadrzaj);
    expect(vidljivo).toContain(`${t.detalj.stanje} ${d.requestStatuses.new}`);
    // K27 review (intentional): was "<label> <clock> · čeka 06:10"; the wait is now in words, "čeka 6 min".
    expect(vidljivo).toContain(
      `${t.detalj.poslato} ${fmt(t.red.vreme, {
        sat: clockTime(IZLOG_SADA - 6 * 60_000 - 10_000),
        trajanje: fmt(t.red.trajanje.min, { n: 6 }),
      })}`,
    );
    expect(vidljivo).toContain(`${t.detalj.ko} ${t.red.nepreuzet}`);
    expect(vidljivo).toContain(`${t.detalj.zona} Glavna sala`);
    expect(vidljivo).toContain(`${t.detalj.kartica} Sto uz prozor`);
    expect(vidljivo).not.toContain(t.detalj.preuzeto + " ");
  });

  test("a request a waiter took: since when and who", () => {
    const vidljivo = tekst(prikaz({ red: red("rq_05") }));
    expect(vidljivo).toContain(`${t.detalj.preuzeto} ${clockTime(IZLOG_SADA - 12 * 60_000)}`);
    expect(vidljivo).toContain(`${t.detalj.ko} ${fmt(t.red.preuzeto, { ime: "Milan" })}`);
    expect(vidljivo).toContain(t.red.kasni);
  });

  test("the lines of an order with variants, add-ons, notes and prices like 1.490 RSD", () => {
    const sadrzaj = prikaz({ red: { ...red("rq_03"), totalRsd: 4830 } });
    const vidljivo = tekst(sadrzaj);
    expect(sadrzaj).toContain(`>${esc(t.detalj.stavke)}</h3>`);
    expect(vidljivo).toContain("1 × Mešano meso");
    expect(vidljivo).toContain("+ Pomfrit, + Grilovano povrće");
    expect(vidljivo).toContain(fmt(t.detalj.napomena, { tekst: "Bez ljutog." }));
    expect(vidljivo).toContain("2 × Ćevapi · 10 komada");
    expect(vidljivo).toContain("2.840 RSD");
    expect(vidljivo).toContain("1.990 RSD");
    expect(vidljivo).toContain(`${t.detalj.ukupno} 4.830 RSD`);
    expect(vidljivo).not.toContain(t.detalj.medjuzbir);
  });

  test("Room service: the channel, the delivery and the total; the payment wish of a bill", () => {
    const sobna = { ...red("rq_03"), channel: "room_service" as const, totalRsd: 3140, paymentPreference: "card" as const };
    const vidljivo = tekst(prikaz({ red: sobna, detalj: { ...detalj, subtotalRsd: 2840, deliveryFeeRsd: 300 } }));
    expect(vidljivo).toContain(t.detalj.roomService);
    expect(vidljivo).toContain(`${t.detalj.medjuzbir} 2.840 RSD`);
    expect(vidljivo).toContain(`${t.detalj.dostava} 300 RSD`);
    expect(vidljivo).toContain(`${t.detalj.ukupno} 3.140 RSD`);
    expect(vidljivo).toContain(`${t.detalj.placanje} ${d.paymentPreferences.card}`);
    const racun = tekst(prikaz({ red: { ...red("rq_02"), paymentPreference: "cash" }, detalj: { ...detalj, items: [] } }));
    expect(racun).toContain(`${t.detalj.placanje} ${d.paymentPreferences.cash}`);
    expect(racun).not.toContain(t.detalj.stavke);
  });

  test("a call has no lines; a venue without zones has no zone row", () => {
    const poziv = prikaz({ red: red("rq_01"), imaZone: false });
    expect(poziv).not.toContain(esc(t.detalj.stavke));
    expect(tekst(poziv)).not.toContain(t.detalj.zona);
  });

  test("loading shows a skeleton; a request that is gone says so", () => {
    const ucitava = prikaz({ red: red("rq_03"), detalj: undefined });
    expect(ucitava).toContain('data-stanje="ucitavanje"');
    expect(ucitava).toContain(esc(t.detalj.ucitava));
    expect(prikaz({ red: red("rq_03"), detalj: undefined, otvoreno: false })).not.toContain('data-stanje="ucitavanje"');
    const nestao = prikaz({ red: null });
    expect(nestao).toContain(`>${esc(t.detalj.nijeAktivan)}</h3>`);
    expect(nestao).not.toContain("<button");
  });

  test("the reminder control may stand in the drawer", () => {
    const sadrzaj = prikaz({ red: red("rq_05"), ping: <p data-ping-slot="">{t.ping.dugme}</p> });
    expect(sadrzaj).toContain('data-ping-slot=""');
  });

  test("the drawer explains the reminder once, next to its button; a request without a button has no such line", () => {
    const ping = (id: string) =>
      renderToStaticMarkup(<PingDetalja red={red(id)} lokalno={undefined} nowMs={IZLOG_SADA} onPosalji={() => undefined} />);
    const sKonobarom = ping("rq_05");
    expect(count(sKonobarom, "<button")).toBe(1);
    expect(sKonobarom).toContain(`>${esc(t.ping.objasnjenje)}</p>`);
    expect(sKonobarom.indexOf(esc(t.ping.objasnjenje))).toBeGreaterThan(sKonobarom.indexOf("<button"));
    // Nobody took it: no control and no line. An account took it: the reason, no button, no line.
    expect(ping("rq_01")).toBe("");
    const nalogom = ping("rq_06");
    expect(nalogom).toContain(esc(t.ping.razlozi.nalog));
    expect(nalogom).not.toContain("<button");
    expect(nalogom).not.toContain(esc(t.ping.objasnjenje));
  });
});
