// K27 render tests of Početna, the home of the ScanMe Menu client panel: the
// blocks in order, the calm and the busy Pažnja, "Sada u lokalu" without the
// numbers Pažnja already says, the one dark card with no number in it, and the
// quick entries by role. No DOM in the edge-runtime environment: the screen is
// checked as renderToStaticMarkup strings, sliced by the `data-blok` marker of
// each block. Invented data only (fixtures/pocetna.ts).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { fixtureOperacije } from "@/components/menu/fixtures/operativa-panel";
import { fixturePocetnaInput } from "@/components/menu/fixtures/pocetna";
import { PocetnaIzlog } from "@/components/menu/izlog/pocetna-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import type { MenuTier } from "@/lib/menu/capabilities";
import { homeSummary, type HomeInput } from "@/lib/menu/home-summary";
import type { MenuActor } from "@/lib/menu/permissions";
import { belgradeDateKey } from "@/lib/menu/working-hours";
import { Pocetna, type PocetnaHrefs } from "./pocetna";

const t = menuPanelSr.pocetna;
const MINUT = 60_000;

const HREFS: PocetnaHrefs = {
  editor: "/demo-restoran/client-panel/meni/editor",
  operativa: "/demo-restoran/client-panel/meni/operativa",
  lokal: "/demo-restoran/client-panel/meni/lokal",
  analitika: "/demo-restoran/client-panel/meni/analitika",
  podesavanja: "/demo-restoran/client-panel/meni/podesavanja",
  konobar: "/demo-restoran/konobar",
};

/** Owner, Manager and the ScanMe operator hold every permission Početna looks at. */
const UPRAVLJANJE = ["owner", "manager", "admin"] as const satisfies readonly MenuActor[];
const ULOGE = [...UPRAVLJANJE, "editor"] as const satisfies readonly MenuActor[];
const SADRZAJI = ["paznja", "mirno"] as const;
const PLANOVI = ["standard", "premium"] as const satisfies readonly MenuTier[];
const ULAZI_REDOM = ["editor", "operativa", "lokal", "analitika", "konobar"] as const;

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

function prikazi(ulaz: HomeInput, actor: MenuActor): string {
  return renderToStaticMarkup(<Pocetna summary={homeSummary(ulaz)} actor={actor} nowMs={ulaz.nowMs} hrefs={HREFS} />);
}

function fixtura(sadrzaj: (typeof SADRZAJI)[number], actor: MenuActor, plan: MenuTier = "premium"): string {
  return prikazi(fixturePocetnaInput({ sadrzaj, plan, actor }), actor);
}

const imaBlok = (html: string, ime: string) => html.includes(`data-blok="${ime}"`);

/** The markup of one block: from the tag that carries its marker up to the tag of the next block. */
function blok(html: string, ime: string): string {
  const oznaka = `data-blok="${ime}"`;
  const at = html.indexOf(oznaka);
  if (at < 0) throw new Error(`no block ${ime}`);
  const sledeci = html.indexOf('data-blok="', at + oznaka.length);
  return html.slice(html.lastIndexOf("<", at), sledeci < 0 ? html.length : html.lastIndexOf("<", sledeci));
}

type Veza = { href: string; tekst: string };

function veze(html: string): Veza[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: attr(match[1], "href") ?? "",
    tekst: tekst(match[2]),
  }));
}

/** The lines of Pažnja: the `data-paznja-stavka` marker, and the markup of the line. */
function redoviPaznje(paznja: string): { vrsta: string; html: string }[] {
  return [...paznja.matchAll(/<li data-paznja-stavka="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => ({
    vrsta: match[1],
    html: match[2],
  }));
}

/**
 * Pažnja in its three parts: the list of the lines about the floor, what sits right under it (the buttons)
 * and the list of the other lines. A part that is not there is "".
 */
function dijeloviPaznje(paznja: string): { operativne: string; dugmad: string; ostale: string } {
  const prviKraj = paznja.indexOf("</ul>") + "</ul>".length;
  const drugiPocetak = paznja.indexOf("<ul", prviKraj);
  return {
    operativne: paznja.slice(0, prviKraj),
    dugmad: paznja.slice(prviKraj, drugiPocetak < 0 ? undefined : drugiPocetak),
    ostale: drugiPocetak < 0 ? "" : paznja.slice(drugiPocetak),
  };
}

function operacijeOd(ulaz: HomeInput): NonNullable<HomeInput["operations"]> {
  if (!ulaz.operations) throw new Error("the fixture has no operations for this role");
  return ulaz.operations;
}

/** The fixture of the owner, with the floor changed. */
function sPodom(izmena: Partial<NonNullable<HomeInput["operations"]>>): HomeInput {
  const osnova = fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor: "owner" });
  return { ...osnova, operations: { ...operacijeOd(osnova), ...izmena } };
}

const ago = (minuta: number) => IZLOG_SADA - minuta * MINUT;

/** The sentences of the "paznja" fixture for the owner on Premium, in the order of importance. */
const REDOVI_PAZNJE = {
  "zahtevi-kasne": fmt(t.paznja.zahteviKasne.few, { n: 2, prag: 15 }),
  "rezervacije-kasne": fmt(t.paznja.rezervacijeKasne.one, { n: 1 }),
  "rezervacije-cekaju": fmt(t.paznja.rezervacijeCekaju.one, { n: 1 }),
  posta: t.paznja.posta,
  "room-service": fmt(t.paznja.roomService.few, { n: 2 }),
  neobjavljeno: fmt(t.paznja.neobjavljeno, { kada: "15. 10. u 18:27" }),
} as const;

// --- The screen ----------------------------------------------------------------

describe("Pocetna: structure", () => {
  test("one H1 named Početna with its sentence, in every role and state", () => {
    for (const actor of ULOGE) {
      for (const sadrzaj of SADRZAJI) {
        for (const plan of PLANOVI) {
          const html = fixtura(sadrzaj, actor, plan);
          expect(count(html, "<h1")).toBe(1);
          expect(tekst(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "")).toBe(menuPanelSr.sekcije.pocetna);
          expect(tekst(html)).toContain(t.opis);
        }
      }
    }
  });

  test("the blocks come in order: Pažnja, Meni, Sada u lokalu, Analitika, Brzi ulazi", () => {
    const html = fixtura("paznja", "owner");
    const redom = ["paznja", "meni", "sada", "analitika", "brzi-ulazi"];
    const mesta = redom.map((ime) => html.indexOf(`data-blok="${ime}"`));
    expect(mesta.every((mesto) => mesto > 0)).toBe(true);
    expect(mesta).toEqual([...mesta].sort((a, b) => a - b));
    expect(html.indexOf("<h1")).toBeLessThan(mesta[0]);
  });

  test("from 1024 px a 12-column grid: Pažnja 7 + Meni 5, Sada 7 + Analitika 5, the entries across", () => {
    const html = fixtura("paznja", "owner");
    expect(html).toContain("lg:grid-cols-12");
    const raspon = { paznja: 7, meni: 5, sada: 7, analitika: 5, "brzi-ulazi": 12 };
    for (const [ime, kolone] of Object.entries(raspon)) expect(blok(html, ime)).toContain(`lg:col-span-${kolone}`);
  });

  // K27 review (new): Meni used to stretch to the height of Pažnja (about 300 px of empty card), and the columns
  // of Sada u lokalu broke words in the 7-column card.
  test("Meni and Analitika are only as tall as their content; Sada's columns sit side by side only where there is room", () => {
    const html = fixtura("paznja", "owner");
    for (const ime of ["meni", "analitika"]) expect(blok(html, ime)).toContain("lg:self-start");
    const sada = blok(html, "sada");
    expect(sada).toContain("lg:grid-cols-1");
    expect(sada).toContain("xl:grid-cols-2");
  });

  test("one H2 per block, in order; the screen's own sub-titles stay below them", () => {
    expect(
      [...fixtura("paznja", "owner").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => tekst(match[1])),
    ).toEqual([t.paznja.naslov, t.meni.naslov, t.sada.naslov, t.analitika.naslov, t.brziUlazi.naslov]);
    expect(
      [...fixtura("paznja", "editor").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => tekst(match[1])),
    ).toEqual([t.paznja.naslov, t.meni.naslov, t.brziUlazi.naslov]);
  });

  test("every named region points at a heading that exists", () => {
    for (const actor of ULOGE) {
      const html = fixtura("paznja", actor);
      const regioni = [...html.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
      expect(regioni.length).toBeGreaterThanOrEqual(3);
      for (const id of regioni) expect(html).toContain(`id="${id}"`);
    }
  });

  test("every link and button has a name, every icon is hidden from a screen reader", () => {
    for (const actor of ULOGE) {
      for (const sadrzaj of SADRZAJI) {
        for (const plan of PLANOVI) {
          const html = fixtura(sadrzaj, actor, plan);
          const sveVeze = veze(html);
          expect(sveVeze.length).toBeGreaterThan(0);
          for (const veza of sveVeze) {
            expect(veza.tekst.length).toBeGreaterThan(0);
            expect(veza.href.length).toBeGreaterThan(0);
          }
          for (const dugme of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
            expect(tekst(dugme[2]).length > 0 || (attr(dugme[1], "aria-label") ?? "").length > 0).toBe(true);
          }
          for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
        }
      }
    }
  });
});

describe("Pocetna: the one dark card", () => {
  test("exactly one for a role that sees analytics, and it is the Analitika block", () => {
    for (const actor of UPRAVLJANJE) {
      for (const sadrzaj of SADRZAJI) {
        const html = fixtura(sadrzaj, actor);
        expect(count(html, 'data-kartica="istaknuta"')).toBe(1);
        expect(blok(html, "analitika")).toContain('data-kartica="istaknuta"');
      }
    }
  });

  test("an Urednik has no analytics, so no dark card either", () => {
    for (const sadrzaj of SADRZAJI) expect(fixtura(sadrzaj, "editor")).not.toContain('data-kartica="istaknuta"');
  });

  test("it says honestly that analytics is coming, with no number", () => {
    for (const sadrzaj of SADRZAJI) {
      const kartica = tekst(blok(fixtura(sadrzaj, "owner"), "analitika"));
      expect(kartica).toContain(t.analitika.prazno);
      expect(kartica).toContain(t.analitika.naslov);
      // The only digit in it is the "7" of "7 dana" in the dictionary's own sentences.
      expect(kartica.replace(t.analitika.naslov, "").replace(t.analitika.praznoOpis, "")).not.toMatch(/\d/);
    }
  });
});

// --- Pažnja ----------------------------------------------------------------------

describe("Pažnja: calm", () => {
  test("says 'Sve je u redu.' once, with its sentence, and offers nothing to do", () => {
    for (const actor of UPRAVLJANJE) {
      for (const plan of PLANOVI) {
        const html = fixtura("mirno", actor, plan);
        const paznja = blok(html, "paznja");
        expect(t.paznja.mirno).toBe("Sve je u redu.");
        expect(count(tekst(html), t.paznja.mirno)).toBe(1);
        expect(count(tekst(paznja), t.paznja.mirno)).toBe(1);
        expect(tekst(paznja)).toContain(t.paznja.mirnoOpis);
        expect(paznja).toContain('data-paznja="mirno"');
        expect(paznja).not.toContain("data-paznja-stavka");
        expect(veze(paznja)).toEqual([]);
      }
    }
  });

  test("an Urednik reads that nothing waits in the menu", () => {
    const paznja = tekst(blok(fixtura("mirno", "editor"), "paznja"));
    expect(paznja).toContain(t.paznja.mirno);
    expect(paznja).toContain(t.paznja.mirnoUrednik);
    expect(paznja).not.toContain(t.paznja.mirnoOpis);
  });

  test("calm has no list and no number; busy has no calm sentence", () => {
    const paznja = blok(fixtura("mirno", "owner"), "paznja");
    expect(paznja).not.toContain("<ul");
    expect(tekst(paznja)).not.toMatch(/\d/);
    expect(fixtura("paznja", "owner")).not.toContain(t.paznja.mirno);
  });
});

describe("Pažnja: busy", () => {
  test("every line is written once, in the order of importance, with a count above them", () => {
    const html = fixtura("paznja", "owner");
    const paznja = blok(html, "paznja");
    const vrste = Object.keys(REDOVI_PAZNJE);
    expect(redoviPaznje(paznja).map((red) => red.vrsta)).toEqual(vrste);
    for (const recenica of Object.values(REDOVI_PAZNJE)) {
      expect(count(tekst(html), recenica)).toBe(1);
      expect(count(tekst(paznja), recenica)).toBe(1);
    }
    const n = vrste.length;
    expect(n).toBe(6);
    expect(count(tekst(paznja), fmt(t.paznja.ima.many, { n }))).toBe(1);
    expect(paznja).toContain('data-paznja="paznja"');
  });

  test("a line is an icon AND words: danger for what hurts guests now, warning for the rest", () => {
    const redovi = redoviPaznje(blok(fixtura("paznja", "owner"), "paznja"));
    const ton = Object.fromEntries(
      [...blok(fixtura("paznja", "owner"), "paznja").matchAll(/data-paznja-stavka="([^"]+)" data-ton="([^"]+)"/g)].map(
        (match) => [match[1], match[2]],
      ),
    );
    expect(ton).toEqual({
      "zahtevi-kasne": "opasnost",
      "rezervacije-kasne": "opasnost",
      "rezervacije-cekaju": "upozorenje",
      posta: "upozorenje",
      "room-service": "upozorenje",
      neobjavljeno: "upozorenje",
    });
    for (const red of redovi) {
      expect(red.html).toMatch(/<svg\b[^>]*aria-hidden="true"/);
      expect(tekst(red.html).length).toBeGreaterThan(0);
    }
  });

  // K27 review (intentional): "neobjavljeno" had its own `Otvori Editor` link; the Meni block next to it has that
  // button now, so the line is only words.
  test("lines about the floor and the unpublished line have no link of their own; Pošta and Room service have one small link", () => {
    const redovi = new Map(redoviPaznje(blok(fixtura("paznja", "owner"), "paznja")).map((red) => [red.vrsta, red.html]));
    for (const vrsta of ["zahtevi-kasne", "rezervacije-kasne", "rezervacije-cekaju", "neobjavljeno"]) {
      expect(redovi.get(vrsta)).not.toContain("<a ");
    }
    expect(veze(redovi.get("posta") ?? "")).toEqual([{ href: HREFS.podesavanja, tekst: t.paznja.radnje.podesavanja }]);
    expect(veze(redovi.get("room-service") ?? "")).toEqual([{ href: HREFS.editor, tekst: t.paznja.radnje.editor }]);
  });

  // K27 review (intentional): the button sat after the last list; it sits directly under the floor lines now, and
  // the other lines follow it in a second list.
  test("one button to Operativa directly under the floor lines, the other lines after it; no waiter-panel link while staff is signed in", () => {
    const paznja = blok(fixtura("paznja", "owner"), "paznja");
    const { operativne, dugmad, ostale } = dijeloviPaznje(paznja);
    expect(redoviPaznje(operativne).map((red) => red.vrsta)).toEqual([
      "zahtevi-kasne",
      "rezervacije-kasne",
      "rezervacije-cekaju",
    ]);
    expect(veze(operativne)).toEqual([]);
    expect(veze(dugmad)).toEqual([{ href: HREFS.operativa, tekst: t.paznja.radnje.operativa }]);
    expect(redoviPaznje(ostale).map((red) => red.vrsta)).toEqual(["posta", "room-service", "neobjavljeno"]);
    expect(veze(ostale).map((veza) => veza.href)).toEqual([HREFS.podesavanja, HREFS.editor]);
    expect(paznja).not.toContain(`href="${HREFS.konobar}"`);
  });

  test("nobody on shift while guests wait: its own line, and a second link to the waiter panel under the floor lines", () => {
    const html = prikazi(sPodom({ staffSessions: [] }), "owner");
    const paznja = blok(html, "paznja");
    const { operativne, dugmad, ostale } = dijeloviPaznje(paznja);
    expect(redoviPaznje(paznja).map((red) => red.vrsta)).toContain("bez-osoblja");
    expect(redoviPaznje(operativne).map((red) => red.vrsta)).toContain("bez-osoblja");
    expect(count(tekst(paznja), t.paznja.bezOsoblja)).toBe(1);
    expect(veze(dugmad)).toEqual([
      { href: HREFS.operativa, tekst: t.paznja.radnje.operativa },
      { href: HREFS.konobar, tekst: t.paznja.radnje.konobar },
    ]);
    expect(veze(ostale).map((veza) => veza.href)).not.toContain(HREFS.konobar);
    // Pažnja says it, so Sada u lokalu leaves the staff line out.
    const sada = tekst(blok(html, "sada"));
    expect(sada).not.toContain(t.sada.osoblje);
    expect(sada).not.toContain(t.sada.osobljeNiko);
  });

  test("an Urednik sees only the menu lines, and no button to Operativa", () => {
    const standard = blok(fixtura("paznja", "editor", "standard"), "paznja");
    expect(redoviPaznje(standard).map((red) => red.vrsta)).toEqual(["neobjavljeno"]);
    const premium = blok(fixtura("paznja", "editor", "premium"), "paznja");
    expect(redoviPaznje(premium).map((red) => red.vrsta)).toEqual(["room-service", "neobjavljeno"]);
    expect(count(tekst(premium), fmt(t.paznja.ima.few, { n: 2 }))).toBe(1);
    for (const paznja of [standard, premium]) {
      expect(veze(paznja).every((veza) => veza.href === HREFS.editor)).toBe(true);
      expect(paznja).not.toContain(t.paznja.radnje.operativa);
      expect(paznja).not.toContain(t.paznja.posta);
    }
  });

  test("Room service is a line on Premium only", () => {
    const standard = fixtura("paznja", "owner", "standard");
    expect(redoviPaznje(blok(standard, "paznja")).map((red) => red.vrsta)).not.toContain("room-service");
    expect(tekst(standard)).not.toContain(REDOVI_PAZNJE["room-service"]);
    expect(count(tekst(standard), fmt(t.paznja.ima.many, { n: 5 }))).toBe(1);
  });
});

// --- Sada u lokalu ---------------------------------------------------------------

function plocice(sada: string) {
  return [
    ...sada.matchAll(/data-vrsta="(call|bill|order)"[^>]*><dt\b[^>]*>([\s\S]*?)<\/dt><dd\b[^>]*>(\d+)<\/dd>/g),
  ].map((match) => ({ kind: match[1], naziv: tekst(match[2]), broj: Number(match[3]) }));
}

describe("Sada u lokalu", () => {
  test("an Urednik has no such block, and neither do its numbers", () => {
    for (const sadrzaj of SADRZAJI) {
      const html = fixtura(sadrzaj, "editor");
      expect(imaBlok(html, "sada")).toBe(false);
      expect(tekst(html)).not.toContain(t.sada.naslov);
    }
  });

  test("requests by kind with their icons and names, as the rest after the late ones", () => {
    for (const actor of UPRAVLJANJE) {
      const sada = blok(fixtura("paznja", actor), "sada");
      expect(plocice(sada)).toEqual([
        { kind: "call", naziv: menuDomenSr.requestKinds.call, broj: 1 },
        { kind: "bill", naziv: menuDomenSr.requestKinds.bill, broj: 1 },
        { kind: "order", naziv: menuDomenSr.requestKinds.order, broj: 1 },
      ]);
      const text = tekst(sada);
      expect(text).toContain(t.sada.ostali);
      expect(text).toContain(t.sada.ostaliOpis);
      expect(sada).toMatch(/<dd\b[^>]*tabular-nums/);
      expect(sada).not.toContain(t.sada.skraceno);
    }
  });

  // K27 review (intentional): was "every kind shows, zeros included" (three tiles of 0, which read like three
  // letters O); when every count is 0 there is one sentence and no tile. With any request left the tiles stay,
  // zeros of single kinds included.
  test("with no late request the label is plain; with no request at all there is one sentence and no tile", () => {
    const sada = blok(fixtura("mirno", "owner"), "sada");
    expect(plocice(sada)).toEqual([]);
    expect(sada).not.toContain("<dl");
    expect(sada).not.toMatch(/<dd\b[^>]*>0<\/dd>/);
    const text = tekst(sada);
    expect(text).toContain(t.sada.aktivni);
    expect(count(text, t.sada.nemaZahteva)).toBe(1);
    expect(text).not.toContain(t.sada.ostali);
    expect(text).not.toContain(t.sada.ostaliOpis);
  });

  test("with a single request the three tiles stay, the other kinds as 0", () => {
    const html = prikazi(sPodom({ requests: [{ kind: "bill", status: "new", createdAt: ago(3) }] }), "owner");
    const sada = blok(html, "sada");
    expect(plocice(sada).map((plocica) => plocica.broj)).toEqual([0, 1, 0]);
    expect(tekst(sada)).not.toContain(t.sada.nemaZahteva);
  });

  test("with only late requests the rest is none: the label says 'the others', one sentence, no tile", () => {
    const html = prikazi(sPodom({ requests: [{ kind: "call", status: "new", createdAt: ago(30) }] }), "owner");
    const sada = blok(html, "sada");
    const text = tekst(sada);
    expect(plocice(sada)).toEqual([]);
    expect(text).toContain(t.sada.ostali);
    expect(text).toContain(t.sada.ostaliOpis);
    expect(count(text, t.sada.nemaZahteva)).toBe(1);
  });

  test("says when the numbers are 'at least' as many", () => {
    const html = prikazi(sPodom({ requestsTruncated: true }), "owner");
    expect(tekst(blok(html, "sada"))).toContain(t.sada.skraceno);
  });

  test("today's reservations: how many are still to come, the next one with its time, guests and table", () => {
    const text = tekst(blok(fixtura("paznja", "owner"), "sada"));
    expect(text).toContain(t.sada.rezervacije);
    // K27 review (intentional): the fixture now has Operativa's evening, whose one reservation still to come
    // is 20:00, six guests, Sto 6 (was two to come, the next 20:00, four guests, Sto 5).
    expect(text).toContain(fmt(t.sada.jos.one, { n: 1 }));
    expect(text).toContain(fmt(t.sada.sledeca, { vreme: "20:00", gosti: fmt(menuDomenSr.guests.many, { n: 6 }) }));
    expect(text).toContain("Sto 6");
    expect(text).not.toContain(t.sada.bezStola);
  });

  test("a next reservation without a table says so; none left says that", () => {
    const mirno = tekst(blok(fixtura("mirno", "owner"), "sada"));
    expect(mirno).toContain(fmt(t.sada.jos.one, { n: 1 }));
    expect(mirno).toContain(fmt(t.sada.sledeca, { vreme: "20:30", gosti: fmt(menuDomenSr.guests.few, { n: 2 }) }));
    expect(mirno).toContain(t.sada.bezStola);

    const nijedna = tekst(blok(prikazi(sPodom({ reservations: [] }), "owner"), "sada"));
    expect(nijedna).toContain(t.sada.nemaRezervacija);
    expect(nijedna).not.toContain(t.sada.sledeca.split(" {")[0]);
    expect(nijedna).not.toContain(t.sada.bezStola);
  });

  test("staff on shift: the number, or 'Niko nije prijavljen' when nobody and nobody waits", () => {
    expect(tekst(blok(fixtura("paznja", "owner"), "sada"))).toContain(
      `${t.sada.osoblje} ${fmt(t.sada.osobljeBroj.few, { n: 3 })}`,
    );
    expect(tekst(blok(fixtura("mirno", "owner"), "sada"))).toContain(fmt(t.sada.osobljeBroj.few, { n: 2 }));
    const niko = prikazi(sPodom({ requests: [], staffSessions: [] }), "owner");
    expect(tekst(blok(niko, "sada"))).toContain(t.sada.osobljeNiko);
    expect(redoviPaznje(blok(niko, "paznja")).map((red) => red.vrsta)).not.toContain("bez-osoblja");
  });

  test("a staff member whose sign-in has run out is not on shift", () => {
    const istekla = prikazi(
      sPodom({ requests: [], staffSessions: [{ expiresAt: ago(5) }, { expiresAt: IZLOG_SADA + 60 * MINUT }] }),
      "owner",
    );
    expect(tekst(blok(istekla, "sada"))).toContain(fmt(t.sada.osobljeBroj.one, { n: 1 }));
  });
});

describe("one number, one block", () => {
  test("the number of late requests is in Pažnja and in no other block", () => {
    const kasne = (["call", "call", "call", "call", "bill", "bill", "order"] as const).map((kind) => ({
      kind,
      status: "new" as const,
      createdAt: ago(30),
    }));
    const svezi = [
      { kind: "call" as const, status: "new" as const, createdAt: ago(2) },
      { kind: "order" as const, status: "accepted" as const, createdAt: ago(1) },
    ];
    const html = prikazi(sPodom({ requests: [...kasne, ...svezi] }), "owner");
    const recenica = fmt(t.paznja.zahteviKasne.many, { n: 7, prag: 15 });
    expect(count(tekst(html), recenica)).toBe(1);
    expect(tekst(blok(html, "paznja"))).toContain(recenica);
    const sedam = /(^|\D)7(\D|$)/;
    for (const ime of ["sada", "meni", "brzi-ulazi"]) expect(tekst(blok(html, ime))).not.toMatch(sedam);
    // The others are what Sada u lokalu counts: the two that are not late.
    expect(plocice(blok(html, "sada")).map((plocica) => plocica.broj)).toEqual([1, 0, 1]);
  });

  test("a late reservation or one waiting for an answer is not counted again among today's", () => {
    const html = fixtura("paznja", "owner");
    const sada = tekst(blok(html, "sada"));
    // 3 reservations are accepted or waiting; Pažnja has 1 late and 1 waiting, Sada the 1 still to come.
    expect(sada).toContain(fmt(t.sada.jos.one, { n: 1 }));
    expect(tekst(blok(html, "paznja"))).toContain(REDOVI_PAZNJE["rezervacije-kasne"]);
    expect(tekst(blok(html, "paznja"))).toContain(REDOVI_PAZNJE["rezervacije-cekaju"]);
    expect(sada).not.toContain(REDOVI_PAZNJE["rezervacije-kasne"]);
    expect(sada).not.toContain(REDOVI_PAZNJE["rezervacije-cekaju"]);
  });
});

// --- Meni ----------------------------------------------------------------------

describe("Meni", () => {
  const z = menuZajednickoSr.objava;

  test("the seam: live version and when, and that there are changes nobody sees yet", () => {
    const meni = blok(fixtura("paznja", "owner"), "meni");
    expect(meni).toContain('data-sav-objave="izmene"');
    const text = tekst(meni);
    expect(text).toContain(fmt(z.objavljeno, { broj: 14 }));
    // K27 review (intentional): was "juče u 18:02", which is later than the edit Pažnja dates 15. 10.; the live
    // version is older than the unpublished edit now (published 14. 10., edited 15. 10.).
    expect(text).toContain(fmt(z.objavljenoKada, { kada: "14. 10. u 18:27" }));
    expect(text).toContain(z.imaIzmena);
    expect(text).not.toContain(t.meni.nikad);
    expect(veze(meni)).toEqual([{ href: HREFS.editor, tekst: menuPanelSr.sekcija.otvoriEditor }]);
  });

  test("a clean draft says there is nothing unpublished", () => {
    const meni = blok(fixtura("mirno", "owner"), "meni");
    expect(meni).toContain('data-sav-objave="cisto"');
    const text = tekst(meni);
    expect(text).toContain(fmt(z.objavljenoKada, { kada: "danas u 14:32" }));
    expect(text).toContain(z.bezIzmena);
  });

  test("a menu never published says so, once, and what happens when it is", () => {
    const osnova = fixturePocetnaInput({ sadrzaj: "mirno", plan: "standard", actor: "owner" });
    const html = prikazi(
      { ...osnova, menu: { state: "never_published", liveVersionNumber: null, livePublishedAt: null, lastEditAt: ago(5) } },
      "owner",
    );
    const meni = blok(html, "meni");
    expect(count(tekst(html), t.meni.nikad)).toBe(1);
    expect(tekst(meni)).toContain(z.nikadObjavljeno);
    expect(tekst(meni)).not.toContain(fmt(z.objavljeno, { broj: 14 }));
  });

  test("every role with the panel sees it and can open the Editor", () => {
    for (const actor of ULOGE) {
      for (const sadrzaj of SADRZAJI) {
        const meni = blok(fixtura(sadrzaj, actor), "meni");
        expect(veze(meni).map((veza) => veza.href)).toEqual([HREFS.editor]);
      }
    }
  });
});

// --- Brzi ulazi --------------------------------------------------------------------

describe("Brzi ulazi", () => {
  test("Owner, Manager and the operator get all five, in order, each with its name and one line", () => {
    for (const actor of UPRAVLJANJE) {
      const ulazi = veze(blok(fixtura("paznja", actor), "brzi-ulazi"));
      expect(ulazi).toEqual(
        ULAZI_REDOM.map((kljuc) => ({
          href: HREFS[kljuc],
          tekst: `${t.brziUlazi[kljuc].naziv} ${t.brziUlazi[kljuc].opis}`,
        })),
      );
    }
  });

  test("an Urednik gets the Editor only, and none of the other sections or the waiter panel", () => {
    for (const sadrzaj of SADRZAJI) {
      const html = fixtura(sadrzaj, "editor");
      expect(veze(blok(html, "brzi-ulazi"))).toEqual([
        { href: HREFS.editor, tekst: `${t.brziUlazi.editor.naziv} ${t.brziUlazi.editor.opis}` },
      ]);
      for (const href of [HREFS.operativa, HREFS.lokal, HREFS.analitika, HREFS.konobar, HREFS.podesavanja]) {
        expect(html).not.toContain(`href="${href}"`);
      }
      const text = tekst(html);
      for (const kljuc of ["operativa", "lokal", "analitika", "konobar"] as const) {
        expect(text).not.toContain(t.brziUlazi[kljuc].naziv);
      }
      expect(imaBlok(html, "analitika")).toBe(false);
    }
  });

  test("a target is at least 44 px (the panel's --mp-meta) and wraps in two columns on a phone", () => {
    const ulazi = blok(fixtura("paznja", "owner"), "brzi-ulazi");
    expect(ulazi).toContain("grid-cols-2");
    expect(count(ulazi, "min-h-[var(--mp-meta)]")).toBe(ULAZI_REDOM.length);
  });
});

// --- The izlog and its fixtures --------------------------------------------------

describe("fixturePocetnaInput", () => {
  test("'paznja' puts six things in Pažnja for the owner on Premium, five on Standard, and is deterministic", () => {
    const premium = homeSummary(fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor: "owner" }));
    expect(premium.stanje).toBe("paznja");
    expect(premium.paznja.map((stavka) => stavka.vrsta)).toEqual(Object.keys(REDOVI_PAZNJE));
    const standard = homeSummary(fixturePocetnaInput({ sadrzaj: "paznja", plan: "standard", actor: "owner" }));
    expect(standard.paznja.map((stavka) => stavka.vrsta)).not.toContain("room-service");
    expect(standard.paznja).toHaveLength(5);
    expect(fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor: "owner" })).toEqual(
      fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor: "owner" }),
    );
  });

  // K27 review (new): the fixture used to say "published yesterday 18:02" next to "changes since 15. 10." (an edit
  // older than the version it is waiting to join), and a different evening than Operativa's.
  test("'paznja': the live version is older than the unpublished edit, and the evening is Operativa's", () => {
    const ulaz = fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor: "owner" });
    expect(ulaz.menu.state).toBe("dirty");
    expect(ulaz.menu.livePublishedAt).toBe(IZLOG_SADA - 72 * 60 * MINUT);
    expect(ulaz.menu.lastEditAt).toBe(IZLOG_SADA - 48 * 60 * MINUT);
    expect(ulaz.menu.livePublishedAt ?? Infinity).toBeLessThan(ulaz.menu.lastEditAt);

    const operativa = fixtureOperacije({ sadrzaj: "paznja", pingPoslat: false });
    const danas = belgradeDateKey(IZLOG_SADA);
    const prva = operativa.reservations
      .filter(
        (rezervacija) =>
          rezervacija.status === "accepted" &&
          rezervacija.requestedAt > IZLOG_SADA &&
          belgradeDateKey(rezervacija.requestedAt) === danas,
      )
      .sort((a, b) => a.requestedAt - b.requestedAt)[0];
    const sazetak = homeSummary(ulaz);
    expect(sazetak.sada?.rezervacije.sledeca).toEqual({
      at: prva.requestedAt,
      partySize: prva.partySize,
      positionLabel: prva.positionLabel,
    });
    expect(sazetak.paznja.find((stavka) => stavka.vrsta === "zahtevi-kasne")).toMatchObject({ broj: 2 });
  });

  test("'mirno': the live version is not older than the last edit", () => {
    const { menu } = fixturePocetnaInput({ sadrzaj: "mirno", plan: "premium", actor: "owner" });
    expect(menu.state).toBe("clean");
    expect(menu.livePublishedAt ?? -Infinity).toBeGreaterThanOrEqual(menu.lastEditAt);
  });

  test("'mirno' leaves nothing for Pažnja, for every role and plan", () => {
    for (const actor of ULOGE) {
      for (const plan of PLANOVI) {
        const sazetak = homeSummary(fixturePocetnaInput({ sadrzaj: "mirno", plan, actor }));
        expect(sazetak.stanje).toBe("mirno");
        expect(sazetak.paznja).toEqual([]);
      }
    }
  });

  test("an Urednik gets no operations and no mailbox, as the server would answer", () => {
    for (const sadrzaj of SADRZAJI) {
      const ulaz = fixturePocetnaInput({ sadrzaj, plan: "premium", actor: "editor" });
      expect(ulaz.operations).toBeNull();
      expect(ulaz.mail).toBeNull();
    }
    expect(fixturePocetnaInput({ sadrzaj: "paznja", plan: "standard", actor: "owner" }).roomServicePriceWarnings).toBeNull();
    expect(fixturePocetnaInput({ sadrzaj: "paznja", plan: "premium", actor: "owner" }).roomServicePriceWarnings).toBe(2);
  });

  test("PocetnaIzlog is the screen over these fixtures", () => {
    for (const actor of ["owner", "editor"] as const) {
      for (const sadrzaj of SADRZAJI) {
        const izlog = renderToStaticMarkup(
          <PocetnaIzlog actor={actor} plan="premium" sadrzaj={sadrzaj} hrefs={HREFS} />,
        );
        expect(izlog).toBe(fixtura(sadrzaj, actor, "premium"));
      }
    }
  });
});
