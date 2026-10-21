// K08 render tests: the client panel in the izlog (PanelIzlog). The real shell,
// the real section states and the real whole-screen states, with an invented
// venue and the role, plan and theme from the query string, read through the
// same parser as the route (parsePanelPreview).
//
// K27: Početna, Operativa, Funkcionalnosti and Lokal i QR are the real sections
// over invented data (`stanje=paznja|mirno`, `ping=poslat`, `zahtev=`, `filteri=1`);
// only Tim i pristupi, Analitika and Podešavanja are still "u pripremi".
// K28: Tim i pristupi (`modal=`, `stanje=bez-zona`) and Podešavanja are real screens too, and
// `poziv=` shows the invitation page instead of the panel; only Analitika is still "u pripremi".
//
// The shared next/link stub (vitest.config.ts) keeps only href, children and
// className, so it drops aria-current. These tests need aria-current, so the
// file replaces the stub with one that forwards every anchor attribute. It
// builds the element with createElement: it is the stand-in for next/link.

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureVenue, IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuPanelDict } from "@/lib/i18n/types";
import { clockTime } from "@/lib/menu/elapsed-time";
import { parsePanelPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { MENU_PING_COOLDOWN_MS } from "@/lib/menu/limits";
import { PANEL_NAV_SEKCIJE, type PanelNavSekcija } from "@/lib/menu/panel-nav";
import { PANEL_IZLOG_PUTANJA, PanelIzlog } from "./panel-izlog";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

// Widened to the interface, as the components do: the notes exist only for some sections.
const t: MenuPanelDict = menuPanelSr;

// Built dynamically so this file stays clean under a raw substring scan for
// the other products' namespaces.
const VENUE_NS = ["--", "venue", "-"].join("");
const LINKS_NS = ["--", "links", "-"].join("");

const PUTANJA = "/dev/menu-panel-preview";
const KONOBAR_PUTANJA = "/dev/menu-konobar-preview";
const KONOBAR_PIN = `${KONOBAR_PUTANJA}?ekran=pin`;
const SVE_SEKCIJE: readonly PanelNavSekcija[] = PANEL_NAV_SEKCIJE;
// K27: the sections that are still the "u pripremi" card; every other section is a real screen.
// K28 (intentional): was ["tim", "analitika", "podesavanja"]; now ["analitika"] (Tim and Podešavanja are real).
const U_PRIPREMI: readonly PanelNavSekcija[] = ["analitika"];
const STVARNE_SEKCIJE: readonly PanelNavSekcija[] = ["pocetna", "operativa", "funkcionalnosti", "lokal"];
// K27: the blocks of Početna, in the order of the screen, and its quick entries.
const BLOKOVI_POCETNE = ["paznja", "meni", "sada", "analitika", "brzi-ulazi"] as const;
const ULAZI_REDOM = ["editor", "operativa", "lokal", "analitika", "konobar"] as const;
const MINUT = 60_000;

/**
 * The panel as the route renders it for a query string. `sekcija=primitivi`
 * is the primitives page of the route, not a panel section, so it is refused.
 */
function panel(query: IzlogSearchParams): string {
  const parsed = parsePanelPreview(query);
  const sekcija = parsed.sekcija;
  if (sekcija === "primitivi") throw new Error("sekcija=primitivi is not a panel section");
  return renderToStaticMarkup(<PanelIzlog params={{ ...parsed, sekcija }} />);
}

// What React puts into markup for text.
const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

// The reverse, for attribute values read back out of markup.
const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

function openTag(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>`).exec(html);
  if (!match) throw new Error(`no <${tag}> in: ${html}`);
  return match[0];
}

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The markup of the first <tag>...</tag>. */
function element(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`).exec(html);
  if (!match) throw new Error(`no <${tag}> element in: ${html}`);
  return match[0];
}

function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
}

type Sidro = { tag: string; href: string | undefined; sekcija: string | undefined; current: boolean; text: string };

function sidra(html: string): Sidro[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const tag = `<a${match[1]}>`;
    return {
      tag,
      href: attr(tag, "href"),
      sekcija: attr(tag, "data-sekcija"),
      current: attr(tag, "aria-current") === "page",
      text: match[2].replace(/<[^>]+>/g, "").trim(),
    };
  });
}

/** The links of the side navigation (the one <nav>). */
const navLinks = (html: string) => sidra(element(html, "nav"));

/** The izlog link of one panel section, as PanelIzlog builds it (theme last, left out when absent). */
const navHref = (sekcija: PanelNavSekcija, uloga = "vlasnik", plan = "standard", tema: string | null = null) =>
  `${PUTANJA}?sekcija=${sekcija}&uloga=${uloga}&plan=${plan}${tema ? `&tema=${tema}` : ""}`;

/**
 * K27: the markup of one block of Početna, from the tag that carries its
 * `data-blok` marker to the tag of the next block (or the end of the markup).
 */
function blok(html: string, ime: string): string {
  const oznaka = `data-blok="${ime}"`;
  const at = html.indexOf(oznaka);
  if (at < 0) throw new Error(`no block ${ime}`);
  const sledeci = html.indexOf('data-blok="', at + oznaka.length);
  return html.slice(html.lastIndexOf("<", at), sledeci < 0 ? html.length : html.lastIndexOf("<", sledeci));
}

const regexSigurno = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Prekidac = { ukljucen: boolean; onemogucen: boolean; opisan: string[] };

/** K27: the switch of one Funkcionalnosti card (from its `data-funkcija` marker to the next card's). */
function prekidacFunkcije(html: string, kljuc: string): { kartica: string; prekidac: Prekidac } {
  const pocetak = html.indexOf(`data-funkcija="${kljuc}"`);
  if (pocetak < 0) throw new Error(`no card for ${kljuc}`);
  const kraj = html.indexOf('data-funkcija="', pocetak + 1);
  const kartica = html.slice(pocetak, kraj < 0 ? undefined : kraj);
  const tag = /<input\b[^>]*role="switch"[^>]*>/.exec(kartica)?.[0];
  if (!tag) throw new Error(`no switch in the card of ${kljuc}`);
  return {
    kartica,
    prekidac: {
      ukljucen: /\schecked=""/.test(tag),
      onemogucen: /\sdisabled=""/.test(tag),
      opisan: (attr(tag, "aria-describedby") ?? "").split(" ").filter(Boolean),
    },
  };
}

/** The text of the element with this id, as long as it holds no markup of its own. */
function tekstElementa(html: string, id: string): string | undefined {
  const match = new RegExp(`\\sid="${regexSigurno(id)}"[^>]*>([^<]*)<`).exec(html);
  return match ? unesc(match[1]) : undefined;
}

const ulogaRed = (uloga: string) => `>${esc(fmt(t.shell.uloga, { uloga }))}</p>`;
const znackaPremium = `>${esc(t.shell.premium)}</span>`;
const nemaSkoka = (links: readonly Sidro[]) => links.filter((link) => !link.href?.startsWith("#"));
/** K27: a link of the izlog leads to the panel izlog or, for the waiter panel, to the waiter izlog. */
const unutarIzloga = (href: string | undefined) =>
  href !== undefined && (href.startsWith(PUTANJA) || href.startsWith(KONOBAR_PUTANJA));
/**
 * K28: an icon is fine when it is hidden from assistive technology or when it is a meaningful image with a
 * label (the QR code of the waiter-panel link on Tim i pristupi: `role="img"` and a non-empty `aria-label`).
 */
const jeDekorativan = (svg: string) =>
  svg.includes('aria-hidden="true"') || (svg.includes('role="img"') && /\saria-label="[^"]+"/.test(svg));

/** Whether the markup is the shell (frame, navigation) and not a whole-screen state. */
const jeOkvir = (html: string) => html.includes('data-menu-panel=""');

describe("PANEL_IZLOG_PUTANJA", () => {
  test("is the panel dev route", () => {
    expect(PANEL_IZLOG_PUTANJA).toBe(PUTANJA);
  });
});

describe("the default panel ({})", () => {
  const html = panel({});

  test("is the shell with the eight sections in order, in a single navigation", () => {
    expect(jeOkvir(html)).toBe(true);
    expect(count(html, "<nav")).toBe(1);
    expect(openTag(html, "nav")).toContain(`aria-label="${esc(t.shell.navigacija)}"`);
    const links = navLinks(html);
    expect(links).toHaveLength(8);
    expect(links.map((link) => link.sekcija)).toEqual([...SVE_SEKCIJE]);
    expect(links.map((link) => link.text)).toEqual(SVE_SEKCIJE.map((sekcija) => esc(t.sekcije[sekcija])));
  });

  test("Početna is the current page, and only Početna", () => {
    const links = navLinks(html);
    expect(links.filter((link) => link.current).map((link) => link.sekcija)).toEqual(["pocetna"]);
    expect(count(html, 'aria-current="page"')).toBe(1);
  });

  test("names the invented venue and the mode, in words", () => {
    expect(html).toContain(">Demo restoran</p>");
    expect(element(html, "aside")).toContain(">Demo restoran</p>");
    expect(element(html, "header")).toContain(">Demo restoran</p>");
    const rezim = fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes.hospitality });
    expect(count(html, `<p data-rezim="" class="`)).toBe(2);
    expect(html).toContain(`>${esc(rezim)}</p>`);
  });

  test("the nav links stay inside the izlog, with the role and plan kept", () => {
    const links = navLinks(html);
    expect(links.map((link) => link.href)).toEqual(SVE_SEKCIJE.map((sekcija) => navHref(sekcija)));
    expect(links[0].href).toBe("/dev/menu-panel-preview?sekcija=pocetna&uloga=vlasnik&plan=standard");
    for (const link of links) expect(link.href).toMatch(/^\/dev\/menu-panel-preview\?sekcija=[a-z]+&uloga=vlasnik&plan=standard$/);
  });

  // K27 (intentional): the real Početna carries the quick entry "Konobarski panel", which leads to the
  // waiter izlog, so a link may now start with either izlog route (it used to be the panel route only).
  test("every link on the page stays inside the izlog (the skip link jumps within the page)", () => {
    const sve = sidra(html);
    expect(sve.length).toBeGreaterThan(8);
    for (const link of nemaSkoka(sve)) expect(unutarIzloga(link.href)).toBe(true);
    expect(sve[0].href).toBe("#menu-panel-sadrzaj");
    // The public menu is not linked from Početna: no link leaves for an absolute address.
    expect(sve.filter((link) => /^[a-z]+:/i.test(link.href ?? ""))).toEqual([]);
  });

  // K27 review (intentional): the Pažnja line about unpublished changes no longer has its own "Otvori Editor"
  // (the Meni block next to it has the button), so the one such link is in the Meni block and none in Pažnja.
  test("the link back to the client panel is the izlog start, and the one Editor link (the Meni block's) opens the izlog Editor section", () => {
    const sve = sidra(html);
    const nazad = sve.filter((link) => link.text === esc(t.shell.nazadNaKlijentskiPanel));
    expect(nazad.map((link) => link.href)).toEqual([PUTANJA]);
    const editor = sve.filter((link) => link.text === esc(t.sekcija.otvoriEditor));
    expect(editor.map((link) => link.href)).toEqual([navHref("editor")]);
    const main = element(html, "main");
    expect(sidra(blok(main, "meni")).filter((link) => link.text === esc(t.sekcija.otvoriEditor))).toHaveLength(1);
    expect(sidra(blok(main, "paznja")).filter((link) => link.text === esc(t.sekcija.otvoriEditor))).toHaveLength(0);
  });

  // K27 (intentional): was "Početna in preparation" (one h2, one h3, the 'u pripremi' card); it is the real screen now.
  test("the content is the real Početna: one h1, then Pažnja, Meni, Sada u lokalu, Analitika and Brzi ulazi, inside main", () => {
    const main = element(html, "main");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.pocetna)]);
    expect(naslovi(main, 2)).toEqual(
      [t.pocetna.paznja.naslov, t.pocetna.meni.naslov, t.pocetna.sada.naslov, t.pocetna.analitika.naslov, t.pocetna.brziUlazi.naslov].map(esc),
    );
    const mesta = BLOKOVI_POCETNE.map((ime) => main.indexOf(`data-blok="${ime}"`));
    expect(mesta.every((mesto) => mesto > 0)).toBe(true);
    expect(mesta).toEqual([...mesta].sort((a, b) => a - b));
    expect(main.indexOf("<h1")).toBeLessThan(mesta[0]);
    expect(main).toContain('data-paznja="paznja"');
    expect(main).not.toContain("data-sekcija-u-pripremi");
    expect(main).not.toContain(esc(t.sekcija.uPripremi));
    expect(main).not.toContain(esc(t.sekcija.staDolazi));
    expect(main).not.toContain(esc(t.sekcija.praznoNaslov));
    expect(count(html, "<main")).toBe(1);
  });

  // K27 (intentional): was "the owner sees all five lines of Početna" (the 'u pripremi' list); it is now all five
  // blocks, the lines of Pažnja and all five quick entries.
  test("the owner sees all five blocks of Početna, the lines of Pažnja and all five quick entries", () => {
    const main = element(html, "main");
    for (const ime of BLOKOVI_POCETNE) expect(main).toContain(`data-blok="${ime}"`);
    // The dark card is the only one of the screen.
    expect(count(main, 'data-kartica="istaknuta"')).toBe(1);
    expect(blok(main, "analitika")).toContain('data-kartica="istaknuta"');
    // Standard plan: no Room service line.
    expect([...main.matchAll(/data-paznja-stavka="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "zahtevi-kasne",
      "rezervacije-kasne",
      "rezervacije-cekaju",
      "posta",
      "neobjavljeno",
    ]);
    const ulazi = sidra(blok(main, "brzi-ulazi"));
    expect(ulazi.map((link) => attr(link.tag, "data-ulaz"))).toEqual([...ULAZI_REDOM]);
    expect(ulazi.map((link) => link.href)).toEqual([
      navHref("editor"),
      navHref("operativa"),
      navHref("lokal"),
      navHref("analitika"),
      KONOBAR_PIN,
    ]);
  });

  // K27 review (intentional): was Podešavanja, Editor (unpublished changes), Operativa. The floor lines come first
  // now with Operativa right under them, then the other lines; the unpublished-changes line has no link (the Meni
  // block has the Editor button).
  test("Pažnja comes first and leads on: Operativa for the floor right under its lines, then Podešavanja for the mailbox", () => {
    const paznja = blok(element(html, "main"), "paznja");
    expect(sidra(paznja).map((link) => [link.text, link.href])).toEqual([
      [esc(t.pocetna.paznja.radnje.operativa), navHref("operativa")],
      [esc(t.pocetna.paznja.radnje.podesavanja), navHref("podesavanja")],
    ]);
    // Staff are on shift in the fixture, so there is no way to the waiter panel in Pažnja.
    expect(paznja).not.toContain(esc(t.pocetna.paznja.radnje.konobar));
  });

  test("the role line is the owner's, and there is no Premium badge on the Standard plan", () => {
    expect(html).toContain(ulogaRed(menuDomenSr.roles.owner));
    expect(html).not.toContain(znackaPremium);
  });

  test("an owner sees all eight sections, so the shell does not explain a short list", () => {
    expect(html).not.toContain(esc(t.shell.ostaleSekcije));
  });
});

describe("the Editor action, on every section in the izlog", () => {
  // K20: "lokal" has its real screen (Lokal i QR). K27: so do Početna, Operativa and Funkcionalnosti;
  // only Tim i pristupi, Analitika and Podešavanja are still sections in preparation.
  // K28: Tim i pristupi and Podešavanja are real screens too; only Analitika is left.
  const SA_EKRANOM = SVE_SEKCIJE.filter((sekcija) => U_PRIPREMI.includes(sekcija));

  // K27 (intentional): was "each of the six sections in preparation"; three of them became real screens.
  // K28 (intentional): was "each of the three sections in preparation" (tim, analitika, podesavanja); now only Analitika.
  test("the one section in preparation (Analitika) offers the Editor, with the sentence, in the card", () => {
    // K28 (intentional): was ["tim", "analitika", "podesavanja"]; now ["analitika"].
    expect(SA_EKRANOM).toEqual(["analitika"]);
    for (const sekcija of SA_EKRANOM) {
      const main = element(panel({ sekcija }), "main");
      expect(sidra(main).filter((link) => link.text === esc(t.sekcija.otvoriEditor)).map((link) => link.href)).toEqual([
        navHref("editor"),
      ]);
      expect(main).toContain(`>${esc(t.sekcija.zaSadaEditor)}</p>`);
      expect(sidra(element(main, "header"))).toEqual([]);
    }
  });

  test("K20: Lokal i QR is the real screen, not a section in preparation", () => {
    const main = element(panel({ sekcija: "lokal" }), "main");
    expect(main).toContain("data-lokal-izlog");
    expect(main).toContain(">Lokal i QR</h1>");
    expect(main).not.toContain(esc(t.sekcija.zaSadaEditor));
  });

  test("it keeps the role, the plan and the theme in its link", () => {
    // K28 (intentional): was sekcija "tim"; Tim i pristupi is a real screen without the Editor card, so Analitika carries the check.
    const html = panel({ sekcija: "analitika", uloga: "menadzer", plan: "premium", tema: "tamna" });
    const link = sidra(element(html, "main")).filter((sidro) => sidro.text === esc(t.sekcija.otvoriEditor));
    expect(link.map((sidro) => sidro.href)).toEqual([navHref("editor", "menadzer", "premium", "tamna")]);
  });

  test("a section the role does not see offers no Editor action (only the way back to Početna)", () => {
    const main = element(panel({ uloga: "urednik", sekcija: "tim" }), "main");
    expect(main).not.toContain(esc(t.sekcija.otvoriEditor));
    expect(main).not.toContain(esc(t.sekcija.zaSadaEditor));
  });
});

describe("K25: the reservation blocks of Funkcionalnosti and Podešavanja", () => {
  const rez = t.rezervacije;
  const radno = t.radnoVreme;
  const zadrzavanje = t.zadrzavanje;

  // K27 (intentional): Funkcionalnosti is the real screen now, so the reservation choice stands inside it,
  // between the guest switches and the staff switch, and the 'u pripremi' card it used to stand above is gone.
  test("Funkcionalnosti: the reservation choice stands under the title, between the guest switches and the staff switch; there is no 'u pripremi' card", () => {
    const main = element(panel({ sekcija: "funkcionalnosti" }), "main");
    expect(count(main, "<h1")).toBe(1);
    expect(main.indexOf("<h1")).toBeLessThan(main.indexOf('data-funkcija="ordering"'));
    expect(main.indexOf('data-funkcija="ordering"')).toBeLessThan(main.indexOf("data-rezervacije-izbor"));
    expect(main.indexOf("data-rezervacije-izbor")).toBeLessThan(main.indexOf('data-funkcija="occupancy"'));
    expect(main).not.toContain("data-sekcija-u-pripremi");
    expect(main).toContain(`>${esc(rez.naslov)}</h2>`);
    // The ScanMe form is the default way.
    expect(main).toContain(esc(rez.rezimiOpis.form));
  });

  test("Funkcionalnosti: rezervacije= and radno-vreme= pick the way and the lock", () => {
    expect(panel({ sekcija: "funkcionalnosti", rezervacije: "eksterni" })).toContain(esc(rez.rezimiOpis.external));
    expect(panel({ sekcija: "funkcionalnosti", rezervacije: "iskljuceno" })).toContain(esc(rez.rezimiOpis.off));
    const zakljucano = panel({ sekcija: "funkcionalnosti", "radno-vreme": "prazno", tema: "tamna" });
    expect(zakljucano).toContain(esc(rez.bezRadnogVremena));
    const veza = sidra(element(zakljucano, "main")).filter((sidro) => sidro.text === esc(rez.unesiRadnoVreme));
    expect(veza.map((sidro) => sidro.href)).toEqual([
      `${PUTANJA}?sekcija=podesavanja&uloga=vlasnik&plan=standard&radno-vreme=prazno&tema=tamna`,
    ]);
    expect(panel({ sekcija: "funkcionalnosti" })).not.toContain(esc(rez.bezRadnogVremena));
  });

  // K28 (intentional): was "the working hours and the hold stand above the 'u pripremi' card"; they are blocks of the
  // real Podešavanja now (podesavanja-radnoVreme, podesavanja-zadrzavanje) and there is no 'u pripremi' card.
  test("Podešavanja: the working hours and the hold are blocks of the real section; there is no 'u pripremi' card", () => {
    const main = element(panel({ sekcija: "podesavanja" }), "main");
    expect(count(main, "<h1")).toBe(1);
    expect(main.indexOf("<h1")).toBeLessThan(main.indexOf("data-radno-vreme"));
    expect(main.indexOf("data-radno-vreme")).toBeLessThan(main.indexOf("data-zadrzavanje"));
    expect(main.indexOf('id="podesavanja-radnoVreme"')).toBeLessThan(main.indexOf("data-radno-vreme"));
    expect(main.indexOf("data-radno-vreme")).toBeLessThan(main.indexOf('id="podesavanja-zadrzavanje"'));
    expect(main.indexOf('id="podesavanja-zadrzavanje"')).toBeLessThan(main.indexOf("data-zadrzavanje"));
    expect(main).not.toContain("data-sekcija-u-pripremi");
    expect(main).toContain(`>${esc(radno.naslov)}</h2>`);
    expect(main).toContain(`>${esc(zadrzavanje.naslov)}</h2>`);
    expect(count(main, 'data-dan="')).toBe(7);
    expect(main).not.toContain(esc(radno.prazno));
  });

  test("Podešavanja: radno-vreme=prazno shows the empty hours", () => {
    const main = element(panel({ sekcija: "podesavanja", "radno-vreme": "prazno" }), "main");
    expect(main).toContain(esc(radno.prazno));
    expect(main).not.toContain('type="time"');
  });

  test("an editor gets the forbidden state in both sections, without the blocks", () => {
    for (const sekcija of ["funkcionalnosti", "podesavanja"]) {
      const main = element(panel({ uloga: "urednik", sekcija }), "main");
      expect(main).toContain("data-sekcija-zabranjena");
      expect(main).not.toContain("data-rezervacije-izbor");
      expect(main).not.toContain("data-radno-vreme");
      expect(main).not.toContain("data-zadrzavanje");
    }
  });
});

describe("uloga=urednik", () => {
  test("sees two nav links: Početna and Editor", () => {
    const html = panel({ uloga: "urednik" });
    expect(jeOkvir(html)).toBe(true);
    const links = navLinks(html);
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.sekcija)).toEqual(["pocetna", "editor"]);
    expect(links.map((link) => link.href)).toEqual([navHref("pocetna", "urednik"), navHref("editor", "urednik")]);
    expect(html).toContain(ulogaRed(menuDomenSr.roles.editor));
  });

  // K27 review (intentional): was one "Otvori Editor" link in the 'u pripremi' card, then one in the Pažnja line
  // about unpublished changes and one in the Meni block. The line is only words now (on Standard Pažnja has no link
  // for the editor role at all); the Meni block has the button and the Editor is also a quick entry.
  test("Početna still offers the Editor, which the editor role sees: in the Meni block and as a quick entry", () => {
    const main = element(panel({ uloga: "urednik" }), "main");
    expect(sidra(main).filter((link) => link.text === esc(t.sekcija.otvoriEditor)).map((link) => link.href)).toEqual([
      navHref("editor", "urednik"),
    ]);
    expect(sidra(blok(main, "paznja"))).toEqual([]);
    expect(sidra(blok(main, "meni")).map((link) => link.href)).toEqual([navHref("editor", "urednik")]);
    const ulazi = sidra(blok(main, "brzi-ulazi"));
    expect(ulazi.map((link) => attr(link.tag, "data-ulaz"))).toEqual(["editor"]);
    expect(ulazi.map((link) => link.href)).toEqual([navHref("editor", "urednik")]);
  });

  // K27 (intentional): was "is not promised the Operativa or analytics lines, and the 7 days are not on the
  // page" over the 'u pripremi' list. Početna is real now: the editor sees Pažnja (the menu lines), Meni and
  // the Editor entry, and nothing about operations. (The old "no digit on the page" check is dropped: the
  // Meni block shows the published version.)
  test("Početna shows the menu only: Pažnja, Meni and the Editor entry; no Sada block, no dark Analitika card, no link to operations", () => {
    const main = element(panel({ uloga: "urednik" }), "main");
    expect(BLOKOVI_POCETNE.filter((ime) => main.includes(`data-blok="${ime}"`))).toEqual(["paznja", "meni", "brzi-ulazi"]);
    expect(naslovi(main, 2)).toEqual([t.pocetna.paznja.naslov, t.pocetna.meni.naslov, t.pocetna.brziUlazi.naslov].map(esc));
    expect(count(main, 'data-kartica="istaknuta"')).toBe(0);
    // Not the Sada block and not the "last 7 days" card of Analitika.
    expect(main).not.toContain(esc(t.pocetna.sada.naslov));
    expect(main).not.toContain(esc(t.pocetna.analitika.naslov));
    expect(main).not.toContain(esc(t.pocetna.analitika.prazno));
    // Pažnja has the menu line only: no floor lines, no mailbox line.
    expect([...main.matchAll(/data-paznja-stavka="([^"]+)"/g)].map((match) => match[1])).toEqual(["neobjavljeno"]);
    expect(main).not.toContain(esc(t.pocetna.paznja.radnje.operativa));
    // Every link of the screen leads to the Editor: no Operativa, Analitika, Lokal or waiter panel link.
    expect(new Set(sidra(main).map((link) => link.href))).toEqual(new Set([navHref("editor", "urednik")]));
    expect(main).not.toContain("sekcija=operativa");
    expect(main).not.toContain("sekcija=analitika");
    expect(main).not.toContain(KONOBAR_PUTANJA);
  });

  test("a quiet venue says it in the editor's words: nothing in the menu waits for a decision", () => {
    const main = element(panel({ uloga: "urednik", stanje: "mirno" }), "main");
    expect(main).toContain('data-paznja="mirno"');
    expect(main).toContain(`>${esc(t.pocetna.paznja.mirno)}</p>`);
    expect(main).toContain(`>${esc(t.pocetna.paznja.mirnoUrednik)}</p>`);
    expect(main).not.toContain(esc(t.pocetna.paznja.mirnoOpis));
    expect(main).not.toContain("data-paznja-stavka");
    expect(main).not.toContain('data-blok="sada"');
  });

  test("Operativa, Lokal i QR, Funkcionalnosti and the other hidden sections show the forbidden state, not the real screen", () => {
    for (const sekcija of SVE_SEKCIJE.filter((kandidat) => kandidat !== "pocetna" && kandidat !== "editor")) {
      const html = panel({ uloga: "urednik", sekcija });
      const main = element(html, "main");
      expect(main).toContain('data-sekcija-zabranjena=""');
      expect(naslovi(main, 1)).toEqual([esc(t.sekcije[sekcija])]);
      expect(count(html, "<h1")).toBe(1);
      for (const oznaka of ["data-blok=", "data-operativa", "data-funkcionalnosti", "data-lokal-izlog", "data-podaci-lokala"]) {
        expect(main).not.toContain(oznaka);
      }
    }
  });

  test("the shell explains the short list: the other sections belong to the owner and the manager", () => {
    const html = panel({ uloga: "urednik" });
    expect(count(html, `>${esc(t.shell.ostaleSekcije)}</p>`)).toBe(1);
    expect(html.indexOf(esc(t.shell.ostaleSekcije))).toBeGreaterThan(html.indexOf(ulogaRed(menuDomenSr.roles.editor)));
  });

  test("a hidden section opened by URL shows the forbidden state inside the shell, not the section", () => {
    const html = panel({ uloga: "urednik", sekcija: "tim" });
    expect(jeOkvir(html)).toBe(true);
    expect(navLinks(html)).toHaveLength(2);

    const main = element(html, "main");
    expect(main).toContain('data-sekcija-zabranjena=""');
    expect(naslovi(main, 2)).toEqual([esc(t.stanja.zabranjenoNaslov)]);
    expect(main).toContain(esc(fmt(t.stanja.zabranjenoOpis, { uloga: menuDomenSr.roles.editor })));
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.tim)]);

    // not the section
    expect(html).not.toContain("data-sekcija-u-pripremi");
    expect(html).not.toContain(esc(t.sekcija.staDolazi));
    expect(html).not.toContain(esc(t.sekcija.praznoOpis.tim));

    // the way out is Početna, inside the izlog
    const idi = sidra(main).filter((link) => link.text === esc(t.stanja.idiNaPocetnu));
    expect(idi.map((link) => link.href)).toEqual([navHref("pocetna", "urednik")]);
  });

  test("the forbidden state sits in main and the navigation outside it", () => {
    const html = panel({ uloga: "urednik", sekcija: "podesavanja" });
    expect(html.indexOf("</nav>")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("data-sekcija-zabranjena")).toBeGreaterThan(html.indexOf("<main"));
    expect(naslovi(element(html, "main"), 1)).toEqual([esc(t.sekcije.podesavanja)]);
  });

  test("the Editor section is shown to the editor role, with the collapsed rail", () => {
    const html = panel({ uloga: "urednik", sekcija: "editor" });
    expect(html).toContain('data-nav="skupljena"');
    // K10: the real editor, not an "in preparation" note.
    expect(html).toContain("data-studio=");
    expect(html).not.toContain("data-izlog-korak");
    expect(html).not.toContain("data-sekcija-zabranjena");
  });
});

describe("uloga=osoblje", () => {
  const html = panel({ uloga: "osoblje" });

  test("has no client panel: no shell, no navigation", () => {
    expect(jeOkvir(html)).toBe(false);
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("data-nav=");
    expect(html).not.toContain("data-sekcija=");
    expect(html).not.toContain("data-sekcija-u-pripremi");
  });

  test("says there is no access and links the waiter izlog and the way back", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(t.stanja.bezPristupaNaslov)]);
    const links = sidra(html);
    expect(links.map((link) => link.href)).toEqual([PUTANJA, KONOBAR_PIN]);
    expect(links.map((link) => link.text)).toEqual([esc(t.stanja.nazadNaKlijentskiPanel), esc(t.stanja.osobljeDugme)]);
    expect(html).toContain(`>${esc(t.stanja.osobljeOpis)}</p>`);
  });

  test("a section in the URL changes nothing for staff", () => {
    expect(panel({ uloga: "osoblje", sekcija: "tim" })).toBe(html);
    expect(panel({ uloga: "osoblje", sekcija: "editor", plan: "premium" })).toBe(html);
  });
});

describe("uloga=admin and uloga=menadzer", () => {
  test("admin sees all eight sections and the administrator role", () => {
    const html = panel({ uloga: "admin" });
    expect(navLinks(html)).toHaveLength(8);
    expect(navLinks(html).map((link) => link.sekcija)).toEqual([...SVE_SEKCIJE]);
    expect(html).toContain(ulogaRed(menuDomenSr.roles.admin));
    expect(navLinks(html).map((link) => link.href)).toEqual(SVE_SEKCIJE.map((sekcija) => navHref(sekcija, "admin")));
  });

  test("admin can open every section: none is the forbidden state", () => {
    for (const sekcija of SVE_SEKCIJE) {
      expect(panel({ uloga: "admin", sekcija })).not.toContain("data-sekcija-zabranjena");
    }
  });

  // K28 (intentional): was "... and the manager's note on Tim i pristupi" (the 'u pripremi' note); Tim is a real screen
  // now, so the test asserts its h1 and the "Članovi tima" card instead of the note.
  test("a manager sees all eight sections, the role, and the real Tim i pristupi screen", () => {
    const html = panel({ uloga: "menadzer", sekcija: "tim" });
    expect(navLinks(html)).toHaveLength(8);
    expect(html).toContain(ulogaRed(menuDomenSr.roles.manager));
    const main = element(html, "main");
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.tim)]);
    expect(naslovi(main, 2)).toContain(esc(t.tim.clanovi.naslov));
    expect(main).not.toContain("data-sekcija-u-pripremi");
    expect(navLinks(html).filter((link) => link.current).map((link) => link.sekcija)).toEqual(["tim"]);
  });

  // K28 (intentional): was "an owner does not get the manager's note"; the note is gone with the 'u pripremi' card, so
  // neither role gets it, and the owner sees the same real screen.
  test("neither the owner nor the manager gets a manager's note on Tim i pristupi (it is the real screen)", () => {
    const napomena = t.sekcija.napomenaMenadzer.tim;
    for (const uloga of ["vlasnik", "menadzer"]) {
      const html = panel({ uloga, sekcija: "tim" });
      expect(html).not.toContain(esc(napomena ?? ""));
      expect(naslovi(element(html, "main"), 2)).toContain(esc(t.tim.clanovi.naslov));
    }
  });
});

describe("plan", () => {
  test("premium shows the Premium badge in the shell, once", () => {
    const html = panel({ plan: "premium" });
    expect(count(html, znackaPremium)).toBe(1);
    expect(element(html, "aside")).toContain(znackaPremium);
  });

  test("standard has no badge, premium keeps the plan in every nav href", () => {
    expect(panel({ plan: "standard" })).not.toContain(znackaPremium);
    const links = navLinks(panel({ plan: "premium" }));
    expect(links.map((link) => link.href)).toEqual(SVE_SEKCIJE.map((sekcija) => navHref(sekcija, "vlasnik", "premium")));
  });

  test("Analitika on Standard shows its two Premium lines locked", () => {
    const html = panel({ sekcija: "analitika", plan: "standard" });
    const main = element(html, "main");
    expect(count(main, "lucide-lock")).toBe(2);
    expect(main).not.toContain("lucide-circle-check");
    expect(count(main, `<span class="sr-only">, ${esc(t.sekcija.premiumZakljucan)}</span>`)).toBe(2);
    expect(main).not.toContain(esc(t.sekcija.premiumUkljucen));
    // the U pripremi status of the header and the two Premium badges
    expect(count(main, 'data-status-ton="neutralno"')).toBe(3);
    // the Premium note explains the lock
    expect(count(main, `>${esc(t.sekcija.premiumNapomena)}</p>`)).toBe(1);
    // the account badge of the shell is not there on Standard
    expect(html).not.toContain(znackaPremium);
  });

  test("Analitika on Premium shows the same lines unlocked (a check, no lock, no note), and the account badge", () => {
    const html = panel({ sekcija: "analitika", plan: "premium" });
    const main = element(html, "main");
    expect(main).not.toContain("lucide-lock");
    expect(count(main, "lucide-circle-check")).toBe(2);
    expect(count(main, `<span class="sr-only">, ${esc(t.sekcija.premiumUkljucen)}</span>`)).toBe(2);
    expect(main).not.toContain(esc(t.sekcija.premiumZakljucan));
    expect(count(main, 'data-status-ton="neutralno"')).toBe(3);
    expect(main).not.toContain(esc(t.sekcija.premiumNapomena));
    expect(count(html, znackaPremium)).toBe(1);
  });

  test("the plan is a query-string choice and an unknown plan falls back to Standard", () => {
    expect(panel({ plan: "platinum" })).toBe(panel({ plan: "standard" }));
  });

  test("K27: Premium adds the Room service line to Pažnja (with a way to the Editor), Standard has no such line", () => {
    const standard = blok(element(panel({ plan: "standard" }), "main"), "paznja");
    expect(standard).not.toContain('data-paznja-stavka="room-service"');
    const premium = blok(element(panel({ plan: "premium" }), "main"), "paznja");
    expect(count(premium, 'data-paznja-stavka="room-service"')).toBe(1);
    expect(premium).toContain(esc(fmt(t.pocetna.paznja.roomService.few, { n: 2 })));
    // The plan stays in the links of Pažnja.
    for (const link of sidra(premium)) expect(link.href).toContain("plan=premium");
  });
});

describe("sekcija=editor", () => {
  const html = panel({ sekcija: "editor" });

  test("the rail is collapsed and the Editor is the current section", () => {
    expect(openTag(html, "div")).toContain('data-nav="skupljena"');
    expect(html).not.toContain('data-nav="prosirena"');
    expect(navLinks(html).filter((link) => link.current).map((link) => link.sekcija)).toEqual(["editor"]);
    for (const link of navLinks(html)) expect(attr(link.tag, "title")).toBe(t.sekcije[link.sekcija as PanelNavSekcija]);
  });

  // K10 (intended change, ODLUKE K10): the section is the real editor on an
  // invented menu, so the old "built in K10" note and its link are gone.
  test("the content is the real editor, opened on the main page of the menu", () => {
    const main = element(html, "main");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(menuDomenSr.defaultPageName)]);
    expect(main).toContain("data-studio=");
    expect(main).not.toContain("data-izlog-korak");
  });

  test("no section-in-preparation list is shown for the Editor", () => {
    expect(html).not.toContain("data-sekcija-u-pripremi");
    expect(html).not.toContain(esc(t.sekcija.staDolazi));
  });

  test("leaving the Editor expands the rail again", () => {
    expect(panel({ sekcija: "operativa" })).toContain('data-nav="prosirena"');
  });
});

describe("stanje: whole-screen states, no shell navigation", () => {
  const STANJA = [
    { stanje: "ucitava", naslov: undefined },
    { stanje: "prijava", naslov: t.stanja.prijavaNaslov },
    { stanje: "neaktivno", naslov: t.stanja.neaktivnoNaslov },
    { stanje: "bez-pristupa", naslov: t.stanja.bezPristupaNaslov },
  ] as const;

  for (const { stanje, naslov } of STANJA) {
    test(`${stanje} replaces the shell: no navigation, no frame, no section`, () => {
      const html = panel({ stanje });
      expect(jeOkvir(html)).toBe(false);
      expect(html).not.toContain("<nav");
      expect(html).not.toContain("data-nav=");
      expect(html).not.toContain("data-sekcija-u-pripremi");
      if (naslov !== undefined) {
        expect(naslovi(html, 1)).toEqual([esc(naslov)]);
        expect(count(html, "<main")).toBe(1);
      }
    });
  }

  test("ucitava is the loading skeleton with its status text", () => {
    const html = panel({ stanje: "ucitava" });
    expect(html).toContain('role="status"');
    expect(html).toContain(`<span class="sr-only">${esc(t.stanja.ucitavanje)}</span>`);
    expect(html).toContain('data-stanje="ucitavanje"');
  });

  test("prijava links to the izlog start and, for staff without an account, to the waiter izlog", () => {
    const html = panel({ stanje: "prijava" });
    const links = sidra(html);
    expect(links.map((link) => link.href)).toEqual([PUTANJA, KONOBAR_PIN]);
    expect(links.map((link) => link.text)).toEqual([esc(t.stanja.prijavaDugme), esc(t.stanja.osobljeDugme)]);
    expect(naslovi(html, 2)).toEqual([esc(t.stanja.osobljeNaslov)]);
    expect(html).toContain(`>${esc(t.stanja.osobljeOpis)}</p>`);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  test("neaktivno links back to the izlog start", () => {
    const links = sidra(panel({ stanje: "neaktivno" }));
    expect(links.map((link) => link.href)).toEqual([PUTANJA]);
    expect(links[0].text).toBe(esc(t.stanja.nazadNaKlijentskiPanel));
  });

  test("bez-pristupa shows the no-access card, the owner card and the staff card with the waiter izlog link, even for an owner", () => {
    const html = panel({ stanje: "bez-pristupa", uloga: "vlasnik" });
    expect(sidra(html).map((link) => link.href)).toEqual([PUTANJA, KONOBAR_PIN]);
    expect(naslovi(html, 1)).toEqual([esc(t.stanja.bezPristupaNaslov)]);
    expect(naslovi(html, 2)).toEqual([esc(t.stanja.vlasnikNaslov), esc(t.stanja.osobljeNaslov)]);
    expect(html).toContain(`>${esc(t.stanja.vlasnikOpis)}</p>`);
    expect(html).toContain(`>${esc(t.stanja.osobljeOpis)}</p>`);
  });

  test("a state wins over the role and the section", () => {
    expect(panel({ stanje: "prijava", uloga: "osoblje", sekcija: "tim" })).toBe(panel({ stanje: "prijava" }));
    expect(panel({ stanje: "ucitava", uloga: "urednik", sekcija: "tim" })).toBe(panel({ stanje: "ucitava" }));
    expect(panel({ stanje: "neaktivno", uloga: "admin" })).toBe(panel({ stanje: "neaktivno" }));
  });

  test("an unknown state is not an error: the default panel is shown", () => {
    expect(panel({ stanje: "malo-podataka" })).toBe(panel({}));
  });

  // K27: the real sections are mounted by the shell only, so a whole-screen state still replaces them.
  test("K27: a whole-screen state still wins over a real section, whichever section the URL names", () => {
    for (const stanje of ["ucitava", "prijava", "neaktivno", "bez-pristupa"]) {
      for (const sekcija of STVARNE_SEKCIJE) {
        const html = panel({ stanje, sekcija });
        expect(html).toBe(panel({ stanje }));
        expect(jeOkvir(html)).toBe(false);
        for (const oznaka of ["data-blok=", "data-operativa", "data-funkcionalnosti", "data-lokal-izlog", "data-podaci-lokala"]) {
          expect(html).not.toContain(oznaka);
        }
      }
    }
  });

  test("K27: stanje=ucitava on a real section is the loading skeleton", () => {
    for (const sekcija of STVARNE_SEKCIJE) {
      expect(panel({ sekcija, stanje: "ucitava" })).toContain('data-stanje="ucitavanje"');
    }
  });
});

describe("tema", () => {
  test("tema=tamna is kept in every nav href, after the other parameters", () => {
    const links = navLinks(panel({ tema: "tamna" }));
    expect(links).toHaveLength(8);
    expect(links.map((link) => link.href)).toEqual(SVE_SEKCIJE.map((sekcija) => navHref(sekcija, "vlasnik", "standard", "tamna")));
    for (const link of links) expect(link.href).toContain("tema=tamna");
  });

  test("tema=svetla is kept too", () => {
    for (const link of navLinks(panel({ tema: "svetla" }))) expect(link.href).toContain("tema=svetla");
  });

  test("every link on the page keeps the theme, except the skip link", () => {
    for (const query of [
      {},
      { sekcija: "editor" },
      { uloga: "urednik", sekcija: "tim" },
      { sekcija: "analitika" },
      { sekcija: "funkcionalnosti", "radno-vreme": "prazno" },
      { sekcija: "podesavanja" },
      // K28: the real Tim i pristupi (with a zone-less venue) and Podešavanja for a manager on Premium.
      { sekcija: "tim" },
      { sekcija: "tim", stanje: "bez-zona" },
      { sekcija: "podesavanja", uloga: "menadzer", plan: "premium" },
      // K27: the real Početna (both states, owner and editor) and Operativa.
      { stanje: "mirno" },
      { uloga: "urednik" },
      { plan: "premium" },
      { sekcija: "operativa" },
    ]) {
      // K28 (intentional): was every link but the skip link; a `mailto:` link ("Zatraži promenu režima" in Brend i nalog)
      // cannot carry the izlog theme, so it is left out. Every other link, absolute ones included, must keep the theme.
      const links = nemaSkoka(sidra(panel({ ...query, tema: "tamna" }))).filter((link) => !link.href?.startsWith("mailto:"));
      expect(links.length).toBeGreaterThan(2);
      for (const link of links) expect(link.href).toContain("tema=tamna");
    }
  }, 20_000);

  test("the whole-screen states keep the theme in their links", () => {
    expect(sidra(panel({ stanje: "prijava", tema: "tamna" })).map((link) => link.href)).toEqual([
      `${PUTANJA}?tema=tamna`,
      `${KONOBAR_PIN}&tema=tamna`,
    ]);
    expect(sidra(panel({ stanje: "neaktivno", tema: "tamna" })).map((link) => link.href)).toEqual([`${PUTANJA}?tema=tamna`]);
    expect(sidra(panel({ stanje: "bez-pristupa", tema: "tamna" })).map((link) => link.href)).toEqual([
      `${PUTANJA}?tema=tamna`,
      `${KONOBAR_PIN}&tema=tamna`,
    ]);
    expect(sidra(panel({ uloga: "osoblje", tema: "tamna" })).map((link) => link.href)).toEqual([
      `${PUTANJA}?tema=tamna`,
      `${KONOBAR_PIN}&tema=tamna`,
    ]);
  });

  test("the forbidden state keeps the theme in its way out", () => {
    const links = sidra(panel({ uloga: "urednik", sekcija: "tim", tema: "tamna" }));
    expect(links.filter((link) => link.text === esc(t.stanja.idiNaPocetnu)).map((link) => link.href)).toEqual([
      navHref("pocetna", "urednik", "standard", "tamna"),
    ]);
  });

  test("without a theme, no link carries one", () => {
    for (const query of [
      {},
      { sekcija: "editor" },
      { stanje: "bez-pristupa" },
      { uloga: "urednik", sekcija: "tim" },
      // K27: the real sections.
      { stanje: "mirno" },
      { uloga: "urednik" },
      { sekcija: "operativa" },
      { sekcija: "funkcionalnosti" },
      { sekcija: "lokal" },
    ]) {
      expect(panel(query)).not.toContain("tema=");
    }
  }, 20_000);

  test("an unknown theme leaves the URLs clean", () => {
    expect(panel({ tema: "ljubicasta" })).not.toContain("tema=");
  });
});

describe("accessibility of the whole panel", () => {
  test("every state of the izlog has exactly one h1 and every svg is decorative", () => {
    const upiti: IzlogSearchParams[] = [
      {},
      { sekcija: "editor" },
      { sekcija: "analitika", plan: "premium" },
      { uloga: "urednik", sekcija: "tim" },
      { uloga: "osoblje" },
      { stanje: "prijava" },
      { stanje: "neaktivno" },
      { stanje: "bez-pristupa" },
      { sekcija: "funkcionalnosti" },
      { sekcija: "funkcionalnosti", rezervacije: "eksterni", "radno-vreme": "prazno" },
      { sekcija: "podesavanja" },
      { sekcija: "podesavanja", "radno-vreme": "prazno" },
    ];
    for (const upit of upiti) {
      const html = panel(upit);
      expect(count(html, "<h1")).toBe(1);
      // K28 (intentional): was aria-hidden on every svg; a labelled role="img" svg (the QR code of Tim i pristupi) is allowed too.
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(jeDekorativan(svg), svg).toBe(true);
    }
  });

  test("K27: every state of the real sections has exactly one h1 and every svg is decorative", () => {
    const upiti: IzlogSearchParams[] = [
      // The real sections in every content state, role and plan the izlog offers.
      { stanje: "paznja" },
      { stanje: "mirno" },
      { plan: "premium" },
      { plan: "premium", stanje: "mirno" },
      { uloga: "urednik" },
      { uloga: "urednik", stanje: "mirno" },
      { uloga: "urednik", sekcija: "operativa" },
      { sekcija: "operativa" },
      { sekcija: "operativa", stanje: "mirno" },
      { sekcija: "operativa", ping: "poslat" },
      { sekcija: "operativa", zahtev: "rq_05" },
      { sekcija: "operativa", filteri: "1" },
      { sekcija: "funkcionalnosti", plan: "premium" },
      { sekcija: "lokal" },
      { sekcija: "tim" },
      // K28: Tim i pristupi without zones and with each dialog open, the manager's view, and Podešavanja on both plans.
      { sekcija: "tim", stanje: "bez-zona" },
      { sekcija: "tim", modal: "pozivnica" },
      { sekcija: "tim", modal: "pin" },
      { sekcija: "tim", modal: "link-panela" },
      { sekcija: "tim", uloga: "menadzer" },
      { sekcija: "podesavanja", plan: "premium" },
      { sekcija: "podesavanja", uloga: "menadzer", sabloni: "1", posta: "povezana" },
      { sekcija: "analitika" },
    ];
    for (const upit of upiti) {
      const html = panel(upit);
      expect(count(html, "<h1")).toBe(1);
      // K28 (intentional): was aria-hidden on every svg; a labelled role="img" svg (the QR code of Tim i pristupi) is allowed too.
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(jeDekorativan(svg), svg).toBe(true);
    }
  }, 20_000);

  // The Editor is left out: it is the heavy real editor, and the list above already renders it.
  test("K27: every other section has exactly one h1 and decorative svgs, for the owner and the editor role, on both plans", () => {
    for (const uloga of ["vlasnik", "urednik"]) {
      for (const plan of ["standard", "premium"]) {
        for (const sekcija of SVE_SEKCIJE.filter((kandidat) => kandidat !== "editor")) {
          const html = panel({ uloga, plan, sekcija });
          expect(count(html, "<h1")).toBe(1);
          expect(count(html, "<main")).toBe(1);
          // K28 (intentional): was aria-hidden on every svg; a labelled role="img" svg (the QR code of Tim i pristupi) is allowed too.
          for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(jeDekorativan(svg), svg).toBe(true);
        }
      }
    }
  }, 20_000);

  test("K27: every region named by a real section points at a heading that exists", () => {
    for (const sekcija of STVARNE_SEKCIJE) {
      const html = panel({ sekcija });
      for (const [, id] of html.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)) expect(html).toContain(`id="${id}"`);
    }
  });

  test("the skip link is the first link of the shell and the target exists once", () => {
    const html = panel({ uloga: "admin", sekcija: "lokal" });
    expect(sidra(html)[0].href).toBe("#menu-panel-sadrzaj");
    expect(count(html, 'id="menu-panel-sadrzaj"')).toBe(1);
  });
});

describe("K27: which sections are real screens", () => {
  // The Editor is left out: it is the heavy real editor, and the sekcija=editor tests render it.
  // K28 (intentional): was "exactly Tim i pristupi, Analitika and Podešavanja are still 'u pripremi'"; now only Analitika.
  test("exactly Analitika is still 'u pripremi'; every other section is a real screen", () => {
    for (const sekcija of SVE_SEKCIJE.filter((kandidat) => kandidat !== "editor")) {
      const main = element(panel({ sekcija }), "main");
      expect(main.includes(`data-sekcija-u-pripremi="${sekcija}"`)).toBe(U_PRIPREMI.includes(sekcija));
      if (!U_PRIPREMI.includes(sekcija)) {
        expect(main).not.toContain(esc(t.sekcija.uPripremi));
        expect(main).not.toContain(esc(t.sekcija.staDolazi));
      }
    }
  });

  test("Početna, Operativa, Funkcionalnosti and Lokal i QR each have one h1 with the section's name, and the navigation marks them", () => {
    for (const sekcija of STVARNE_SEKCIJE) {
      const html = panel({ sekcija });
      expect(count(html, "<h1")).toBe(1);
      expect(naslovi(element(html, "main"), 1)).toEqual([esc(t.sekcije[sekcija])]);
      expect(navLinks(html).filter((link) => link.current).map((link) => link.sekcija)).toEqual([sekcija]);
    }
  });
});

describe("K27: Početna", () => {
  test("stanje=mirno: Pažnja says 'Sve je u redu.' with no lines, and the other blocks stay", () => {
    const html = panel({ stanje: "mirno" });
    const main = element(html, "main");
    // A content state, not a whole-screen one: the shell and its navigation are there.
    expect(jeOkvir(html)).toBe(true);
    expect(navLinks(html)).toHaveLength(8);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.pocetna)]);
    const paznja = blok(main, "paznja");
    expect(paznja).toContain('data-paznja="mirno"');
    expect(paznja).toContain(`>${esc(t.pocetna.paznja.mirno)}</p>`);
    expect(paznja).toContain(`>${esc(t.pocetna.paznja.mirnoOpis)}</p>`);
    expect(paznja).not.toContain(esc(t.pocetna.paznja.mirnoUrednik));
    expect(sidra(paznja)).toEqual([]);
    expect(main).not.toContain("data-paznja-stavka");
    // Nothing is late and the menu is current.
    expect(main).toContain('data-meni="clean"');
    expect(blok(main, "sada")).toContain(`>${esc(t.pocetna.sada.aktivni)}</h3>`);
    for (const ime of BLOKOVI_POCETNE) expect(main).toContain(`data-blok="${ime}"`);
  });

  test("the default state (stanje=paznja): Pažnja counts its lines, Sada speaks of the rest, the menu has unpublished changes", () => {
    expect(panel({ stanje: "paznja" })).toBe(panel({}));
    const main = element(panel({}), "main");
    const paznja = blok(main, "paznja");
    expect(paznja).toContain(`>${esc(fmt(t.pocetna.paznja.ima[srPluralCategory(5)], { n: 5 }))}</p>`);
    expect(paznja).not.toContain(esc(t.pocetna.paznja.mirno));
    expect(blok(main, "sada")).toContain(`>${esc(t.pocetna.sada.ostali)}</h3>`);
    expect(main).toContain('data-meni="dirty"');
  });

  test("the content state only matters to Početna and Operativa", () => {
    for (const sekcija of ["tim", "analitika", "funkcionalnosti", "lokal"] as const) {
      expect(panel({ sekcija, stanje: "mirno" })).toBe(panel({ sekcija }));
    }
  });

  test("a manager and the ScanMe operator see all five blocks and all five quick entries, like the owner", () => {
    for (const uloga of ["menadzer", "admin"]) {
      const main = element(panel({ uloga, plan: "premium" }), "main");
      for (const ime of BLOKOVI_POCETNE) expect(main).toContain(`data-blok="${ime}"`);
      const ulazi = sidra(blok(main, "brzi-ulazi"));
      expect(ulazi.map((link) => attr(link.tag, "data-ulaz"))).toEqual([...ULAZI_REDOM]);
      // The role and the plan travel with the links to the panel sections.
      expect(ulazi.slice(0, 4).map((link) => link.href)).toEqual(
        (["editor", "operativa", "lokal", "analitika"] as const).map((sekcija) => navHref(sekcija, uloga, "premium")),
      );
      expect(ulazi[4].href).toBe(KONOBAR_PIN);
    }
  });
});

describe("K27: Operativa", () => {
  const html = panel({ sekcija: "operativa" });
  const main = element(html, "main");

  test("is the real overview: one h1, the link to the waiter izlog, filters, requests; no 'u pripremi' card", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.operativa)]);
    expect(main).toContain("data-operativa=");
    expect(main).toContain("data-filteri=");
    expect(count(main, 'data-zahtev="')).toBeGreaterThan(0);
    expect(main).not.toContain("data-sekcija-u-pripremi");
    expect(main).not.toContain(esc(t.sekcija.uPripremi));
    expect(main).not.toContain(esc(t.sekcija.staDolazi));
    for (const naslov of [t.operativa.zahtevi.naslov, t.operativa.smena.naslov, t.operativa.rezervacije.naslov]) {
      expect(naslovi(main, 2)).toContain(esc(naslov));
    }
    const konobar = sidra(main).filter((link) => link.text === esc(t.operativa.konobarskiPanel));
    expect(konobar.map((link) => link.href)).toEqual([KONOBAR_PIN]);
  });

  test("offers the quiet reminder; nothing has been sent yet", () => {
    expect(main).toContain(esc(t.operativa.ping.dugme));
    expect(main).not.toContain(esc(fmt(t.operativa.ping.poslat, { vreme: clockTime(IZLOG_SADA - 2 * MINUT) })));
  });

  test("ping=poslat: the late order already carries a reminder from two minutes ago, and the next one waits five minutes", () => {
    const poslat = element(panel({ sekcija: "operativa", ping: "poslat" }), "main");
    const prvi = IZLOG_SADA - 2 * MINUT;
    expect(poslat).toContain(esc(fmt(t.operativa.ping.poslat, { vreme: clockTime(prvi) })));
    expect(poslat).toContain(esc(fmt(t.operativa.ping.razlozi.poslat, { vreme: clockTime(prvi + MENU_PING_COOLDOWN_MS) })));
  });

  test("stanje=mirno: no active request, an honest empty state and no reminder", () => {
    const mirno = element(panel({ sekcija: "operativa", stanje: "mirno" }), "main");
    expect(naslovi(mirno, 1)).toEqual([esc(t.sekcije.operativa)]);
    expect(count(mirno, 'data-zahtev="')).toBe(0);
    expect(mirno).toContain(esc(t.operativa.zahtevi.prazno));
    expect(mirno).not.toContain(esc(t.operativa.ping.dugme));
    expect(main).not.toContain(esc(t.operativa.zahtevi.prazno));
    expect(sidra(mirno).filter((link) => link.text === esc(t.operativa.konobarskiPanel)).map((link) => link.href)).toEqual([
      KONOBAR_PIN,
    ]);
  });

  test("a manager sees it; an editor gets the forbidden state instead", () => {
    expect(element(panel({ sekcija: "operativa", uloga: "menadzer" }), "main")).toContain("data-operativa=");
    const urednik = element(panel({ sekcija: "operativa", uloga: "urednik" }), "main");
    expect(urednik).toContain("data-sekcija-zabranjena");
    expect(urednik).not.toContain("data-operativa=");
  });
});

describe("K27: Funkcionalnosti", () => {
  const KLJUCEVI = ["callWaiter", "billRequest", "ordering", "occupancy", "roomService"] as const;

  test("is the real screen: one h1, the switches in their groups, no 'u pripremi' card", () => {
    const html = panel({ sekcija: "funkcionalnosti" });
    const main = element(html, "main");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.funkcionalnosti)]);
    expect(main).toContain("data-funkcionalnosti=");
    expect(main).not.toContain("data-sekcija-u-pripremi");
    for (const kljuc of KLJUCEVI) {
      expect(main).toContain(`data-funkcija="${kljuc}"`);
      expect(main).toContain(esc(t.funkcionalnosti.stavke[kljuc].naziv));
    }
    const h2 = naslovi(main, 2);
    expect(h2[0]).toBe(esc(t.funkcionalnosti.grupe.gost));
    expect(h2).toContain(esc(t.rezervacije.naslov));
    expect(h2.slice(-2)).toEqual([esc(t.funkcionalnosti.grupe.osoblje), esc(t.funkcionalnosti.grupe.posebne)]);
  });

  test("plan=standard: Room service is locked and off, with the Premium reason; the other switches work", () => {
    const html = panel({ sekcija: "funkcionalnosti", plan: "standard" });
    const main = element(html, "main");
    const { kartica, prekidac } = prekidacFunkcije(main, "roomService");
    expect(prekidac.onemogucen).toBe(true);
    expect(prekidac.ukljucen).toBe(false);
    // The reason is the switch's description, so a screen reader reads it with the switch.
    expect(prekidac.opisan.map((id) => tekstElementa(html, id))).toEqual([t.funkcionalnosti.premium.zakljucano]);
    expect(kartica).toContain(esc(t.funkcionalnosti.premium.oznaka));
    expect(kartica).toContain("lucide-lock");
    expect(kartica).not.toContain(esc(t.funkcionalnosti.stavke.roomService.opis));
    // The switches of the invented venue: the call and the bill on, the order and the occupancy off.
    const stanje = Object.fromEntries(
      (["callWaiter", "billRequest", "ordering", "occupancy"] as const).map((kljuc) => {
        const { prekidac: ostali } = prekidacFunkcije(main, kljuc);
        expect(ostali.onemogucen).toBe(false);
        return [kljuc, ostali.ukljucen];
      }),
    );
    expect(stanje).toEqual({ callWaiter: true, billRequest: true, ordering: false, occupancy: false });
  });

  test("plan=premium: Room service is available and on, with its own description", () => {
    const html = panel({ sekcija: "funkcionalnosti", plan: "premium" });
    const { kartica, prekidac } = prekidacFunkcije(element(html, "main"), "roomService");
    expect(prekidac.onemogucen).toBe(false);
    expect(prekidac.ukljucen).toBe(true);
    expect(prekidac.opisan.map((id) => tekstElementa(html, id))).toEqual([t.funkcionalnosti.stavke.roomService.opis]);
    expect(kartica).toContain(esc(t.funkcionalnosti.premium.oznaka));
    expect(kartica).toContain("lucide-circle-check");
    expect(kartica).not.toContain("lucide-lock");
    expect(kartica).not.toContain(esc(t.funkcionalnosti.premium.zakljucano));
    expect(html).not.toContain(esc(t.funkcionalnosti.premium.zakljucano));
  });

  test("a manager can change the switches too (no 'only the owner and the manager' note)", () => {
    const main = element(panel({ sekcija: "funkcionalnosti", uloga: "menadzer" }), "main");
    expect(main).not.toContain(esc(t.funkcionalnosti.nemaPrava));
    expect(prekidacFunkcije(main, "callWaiter").prekidac.onemogucen).toBe(false);
  });
});

describe("K27: Lokal i QR", () => {
  const venue = fixtureVenue("restaurant");

  test("the card 'Podaci o lokalu za Menu' stands right under the h1, with the name and the public link of the venue", () => {
    const html = panel({ sekcija: "lokal" });
    const main = element(html, "main");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.lokal)]);
    expect(main).toContain("data-lokal-izlog=");
    expect(main).not.toContain("data-sekcija-u-pripremi");
    const kartica = main.indexOf("data-podaci-lokala");
    expect(main.indexOf("</h1>")).toBeLessThan(kartica);
    // Before the views of the screen (the list and the plan), and its heading is the first h2 of the screen.
    expect(kartica).toBeLessThan(main.indexOf('role="tabpanel"'));
    expect(naslovi(main, 2)[0]).toBe(esc(t.lokalPodaci.naslov));
    const sadrzaj = main.slice(kartica, main.indexOf("</dl>", kartica));
    expect(sadrzaj).toContain(`>${esc(venue.name)}</dd>`);
    expect(sadrzaj).toContain(esc(`https://scanme.rs/${venue.slug}/meni`));
    expect(sadrzaj).toContain(esc(t.lokalPodaci.naziv));
    expect(sadrzaj).toContain(esc(t.lokalPodaci.link));
    expect(sadrzaj).toContain(esc(t.lokalPodaci.kopiraj));
    // Nothing is copied before the button is pressed.
    expect(sadrzaj).not.toContain(esc(t.lokalPodaci.kopirano));
    expect(sadrzaj).not.toContain(esc(t.lokalPodaci.kopiranjeNeuspelo));
  });

  test("a manager sees the card; an editor gets the forbidden state without it", () => {
    expect(element(panel({ sekcija: "lokal", uloga: "menadzer" }), "main")).toContain("data-podaci-lokala");
    expect(element(panel({ sekcija: "lokal", uloga: "urednik" }), "main")).not.toContain("data-podaci-lokala");
  });
});

describe("K28: Tim i pristupi, Podešavanja and the invitation page", () => {
  const BLOKOVI_PODESAVANJA = ["radnoVreme", "jezici", "konobar", "zadrzavanje", "posta", "sabloni", "brend"] as const;

  describe("sekcija=tim", () => {
    test("is the real Tim i pristupi for the owner and the manager: one h1, the account members, the staff with a PIN set", () => {
      for (const uloga of ["vlasnik", "menadzer"]) {
        const html = panel({ sekcija: "tim", uloga });
        const main = element(html, "main");
        expect(count(html, "<h1")).toBe(1);
        expect(naslovi(main, 1)).toEqual([esc(t.sekcije.tim)]);
        expect(naslovi(main, 2)).toContain(esc(t.tim.clanovi.naslov));
        expect(main).not.toContain("data-sekcija-u-pripremi");
        expect(main).not.toContain("data-sekcija-zabranjena");
        // The two members that come from the ScanMe account, marked as such.
        expect(count(main, `>${esc(t.tim.clanovi.izNaloga)}</`)).toBeGreaterThanOrEqual(2);
        // The staff of the invented venue: two with a PIN set, one without.
        expect(count(main, esc(t.tim.osoblje.pinPostavljen))).toBeGreaterThanOrEqual(2);
        expect(main).toContain(esc(t.tim.osoblje.pinNije));
        expect(navLinks(html).filter((link) => link.current).map((link) => link.sekcija)).toEqual(["tim"]);
      }
    });

    test("never shows a PIN (a three-digit text) while no dialog is open", () => {
      for (const uloga of ["vlasnik", "menadzer"]) {
        const main = element(panel({ sekcija: "tim", uloga }), "main");
        expect(main).not.toMatch(/>\s*\d{3}\s*</);
        expect(main).not.toContain(esc(t.tim.osoblje.pinJednomNaslov));
      }
    });

    test("stanje=bez-zona hides the zone controls; without it they are there", () => {
      const sZonama = element(panel({ sekcija: "tim" }), "main");
      expect(sZonama).toContain(esc(t.tim.osoblje.zona));
      const bezZona = element(panel({ sekcija: "tim", stanje: "bez-zona" }), "main");
      expect(bezZona).not.toContain(esc(t.tim.osoblje.zona));
      // A content state, not a whole-screen one: the shell and the real screen are still there.
      expect(naslovi(bezZona, 1)).toEqual([esc(t.sekcije.tim)]);
      expect(bezZona).toContain(esc(t.tim.osoblje.pinPostavljen));
    });

    test("an editor gets the forbidden screen, not Tim i pristupi", () => {
      const html = panel({ sekcija: "tim", uloga: "urednik" });
      const main = element(html, "main");
      expect(main).toContain('data-sekcija-zabranjena=""');
      expect(naslovi(main, 1)).toEqual([esc(t.sekcije.tim)]);
      expect(count(html, "<h1")).toBe(1);
      expect(main).not.toContain(esc(t.tim.clanovi.naslov));
      expect(main).not.toContain(esc(t.tim.osoblje.naslov));
    });
  });

  describe("sekcija=podesavanja", () => {
    const html = panel({ sekcija: "podesavanja" });
    const main = element(html, "main");

    test("is the real section: one h1, the seven blocks in order, no 'u pripremi' card", () => {
      expect(count(html, "<h1")).toBe(1);
      expect(naslovi(main, 1)).toEqual([esc(t.sekcije.podesavanja)]);
      expect(main).not.toContain("data-sekcija-u-pripremi");
      expect(main).not.toContain(esc(t.sekcija.uPripremi));
      const mesta = BLOKOVI_PODESAVANJA.map((kljuc) => main.indexOf(`data-podesavanja-blok="${kljuc}"`));
      expect(mesta.every((mesto) => mesto > 0)).toBe(true);
      expect(mesta).toEqual([...mesta].sort((a, b) => a - b));
      expect(count(main, "data-podesavanja-blok=")).toBe(7);
      expect(main.indexOf("<h1")).toBeLessThan(mesta[0]);
      expect(navLinks(html).filter((link) => link.current).map((link) => link.sekcija)).toEqual(["podesavanja"]);
    });

    test("Brend i nalog names the service and only asks ScanMe for a mode change: no control changes the mode", () => {
      const brend = main.slice(main.indexOf('data-podesavanja-blok="brend"'));
      expect(brend).toContain(esc(fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes.hospitality })));
      expect(brend).toContain("ScanMe Menu · Ugostiteljstvo");
      const zahtev = sidra(brend).filter((link) => link.text === esc(t.podesavanja.brend.zatraziPromenu));
      expect(zahtev).toHaveLength(1);
      expect(zahtev[0].href).toMatch(/^mailto:office@scanme\.rs\?/);
      expect(brend).not.toContain("<select");
      expect(brend).not.toContain('type="radio"');
      expect(brend).not.toContain('role="switch"');
    });

    test("plan=standard shows the Premium reason for the third language; plan=premium does not", () => {
      expect(main).toContain(esc(t.podesavanja.jezici.premiumRazlog));
      expect(main).toContain("data-jezici-zakljucano");
      const premium = element(panel({ sekcija: "podesavanja", plan: "premium" }), "main");
      expect(premium).not.toContain(esc(t.podesavanja.jezici.premiumRazlog));
      expect(premium).not.toContain("data-jezici-zakljucano");
    });

    test("an editor gets the forbidden screen, without any block", () => {
      const urednik = panel({ sekcija: "podesavanja", uloga: "urednik" });
      const zabranjeno = element(urednik, "main");
      expect(zabranjeno).toContain('data-sekcija-zabranjena=""');
      expect(naslovi(zabranjeno, 1)).toEqual([esc(t.sekcije.podesavanja)]);
      expect(count(urednik, "<h1")).toBe(1);
      expect(zabranjeno).not.toContain("data-podesavanja");
    });
  });

  describe("poziv=", () => {
    test("poziv=vazeca is the invitation page without the panel shell, with the invented venue and the accept button", () => {
      const html = panel({ poziv: "vazeca" });
      expect(jeOkvir(html)).toBe(false);
      expect(html).not.toContain("<nav");
      expect(html).not.toContain("data-nav=");
      expect(count(html, "<h1")).toBe(1);
      expect(naslovi(html, 1)).toEqual([esc(t.poziv.naslov)]);
      expect(html).toContain("Demo restoran");
      expect(html).toContain(`>${esc(t.poziv.prihvati)}</button>`);
    });

    test("poziv=nevazeca and poziv=istekla say so and never name the venue", () => {
      const nevazeca = panel({ poziv: "nevazeca" });
      expect(naslovi(nevazeca, 1)).toEqual([esc(t.poziv.nevazeciNaslov)]);
      expect(nevazeca).toContain(esc(t.poziv.nevazeciOpis));
      expect(nevazeca).not.toContain("Demo restoran");
      expect(jeOkvir(nevazeca)).toBe(false);
      const istekla = panel({ poziv: "istekla" });
      expect(naslovi(istekla, 1)).toEqual([esc(t.poziv.istekaoNaslov)]);
      expect(istekla).not.toContain("Demo restoran");
    });

    test("every poziv state is its own page outside the shell, whatever the role or section", () => {
      for (const poziv of ["vazeca", "istekla", "nevazeca", "prijava", "drugi-nalog", "prihvaceno"]) {
        const html = panel({ poziv, uloga: "urednik", sekcija: "tim" });
        expect(jeOkvir(html)).toBe(false);
        expect(html).not.toContain("<nav");
        expect(count(html, "<h1")).toBe(1);
        expect(html).toBe(panel({ poziv }));
      }
    });

    test("an unknown poziv value renders the normal panel", () => {
      expect(panel({ poziv: "x" })).toBe(panel({}));
      expect(jeOkvir(panel({ poziv: "x" }))).toBe(true);
    });
  });
});

describe("namespace", () => {
  test("no rendered panel uses another product's CSS namespace", () => {
    const upiti: IzlogSearchParams[] = [
      { tema: "tamna" },
      { sekcija: "editor", tema: "tamna" },
      { sekcija: "analitika", plan: "premium", uloga: "menadzer" },
      { uloga: "urednik", sekcija: "tim" },
      { uloga: "osoblje" },
      { stanje: "ucitava" },
      { stanje: "prijava" },
      { stanje: "neaktivno" },
      { sekcija: "funkcionalnosti", tema: "tamna" },
      { sekcija: "podesavanja", tema: "tamna" },
      // K27: the real sections.
      { stanje: "mirno", tema: "tamna" },
      { uloga: "urednik", tema: "tamna" },
      { sekcija: "operativa", tema: "tamna" },
      { sekcija: "operativa", stanje: "mirno", ping: "poslat", filteri: "1", tema: "tamna" },
      { sekcija: "funkcionalnosti", plan: "premium", tema: "tamna" },
      { sekcija: "lokal", tema: "tamna" },
      // K28: Tim i pristupi (a dialog open), Podešavanja and the invitation page.
      { sekcija: "tim", modal: "pin", tema: "tamna" },
      { sekcija: "podesavanja", plan: "premium", tema: "tamna" },
      { poziv: "vazeca", tema: "tamna" },
    ];
    const html = upiti.map(panel).join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  }, 20_000);
});
