// K08 render tests: the client panel in the izlog (PanelIzlog). The real shell,
// the real section states and the real whole-screen states, with an invented
// venue and the role, plan and theme from the query string, read through the
// same parser as the route (parsePanelPreview).
//
// The shared next/link stub (vitest.config.ts) keeps only href, children and
// className, so it drops aria-current. These tests need aria-current, so the
// file replaces the stub with one that forwards every anchor attribute. It
// builds the element with createElement: it is the stand-in for next/link.

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuPanelDict } from "@/lib/i18n/types";
import { parsePanelPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
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
const KONOBAR_PIN = "/dev/menu-konobar-preview?ekran=pin";
const SVE_SEKCIJE: readonly PanelNavSekcija[] = PANEL_NAV_SEKCIJE;

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

const ulogaRed = (uloga: string) => `>${esc(fmt(t.shell.uloga, { uloga }))}</p>`;
const znackaPremium = `>${esc(t.shell.premium)}</span>`;
const nemaSkoka = (links: readonly Sidro[]) => links.filter((link) => !link.href?.startsWith("#"));

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

  test("every link on the page stays inside the izlog (the skip link jumps within the page)", () => {
    const sve = sidra(html);
    expect(sve.length).toBeGreaterThan(8);
    for (const link of nemaSkoka(sve)) expect(link.href?.startsWith(PUTANJA)).toBe(true);
    expect(sve[0].href).toBe("#menu-panel-sadrzaj");
  });

  test("the link back to the client panel is the izlog start, and the Editor link opens the izlog Editor section", () => {
    const sve = sidra(html);
    const nazad = sve.filter((link) => link.text === esc(t.shell.nazadNaKlijentskiPanel));
    expect(nazad.map((link) => link.href)).toEqual([PUTANJA]);
    const editor = sve.filter((link) => link.text === esc(t.sekcija.otvoriEditor));
    expect(editor.map((link) => link.href)).toEqual([navHref("editor")]);
  });

  test("the content is Početna in preparation: one h1, one h2, one h3, inside main", () => {
    const main = element(html, "main");
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(main, 1)).toEqual([esc(t.sekcije.pocetna)]);
    expect(naslovi(main, 2)).toEqual([esc(t.sekcija.praznoNaslov)]);
    expect(naslovi(main, 3)).toEqual([esc(t.sekcija.staDolazi)]);
    expect(main).toContain('data-sekcija-u-pripremi="pocetna"');
    expect(main).toContain(`<span class="min-w-0">${esc(t.sekcija.uPripremi)}</span>`);
    expect(count(html, "<main")).toBe(1);
  });

  test("the owner sees all five lines of Početna", () => {
    const main = element(html, "main");
    expect(count(main, "<li")).toBe(t.sekcija.stavke.pocetna.length);
    expect(t.sekcija.stavke.pocetna).toHaveLength(5);
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
  // K20: "lokal" has its real screen (Lokal i QR), so it is no longer a section in preparation.
  const SA_EKRANOM = SVE_SEKCIJE.filter((sekcija) => sekcija !== "editor" && sekcija !== "lokal");

  test("each of the six sections in preparation offers the Editor, with the sentence, in the card", () => {
    expect(SA_EKRANOM).toHaveLength(6);
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
    const html = panel({ sekcija: "tim", uloga: "menadzer", plan: "premium", tema: "tamna" });
    const link = sidra(element(html, "main")).filter((sidro) => sidro.text === esc(t.sekcija.otvoriEditor));
    expect(link.map((sidro) => sidro.href)).toEqual([navHref("editor", "menadzer", "premium", "tamna")]);
  });

  test("a section the role does not see offers no Editor action (only the way back to Početna)", () => {
    const main = element(panel({ uloga: "urednik", sekcija: "tim" }), "main");
    expect(main).not.toContain(esc(t.sekcija.otvoriEditor));
    expect(main).not.toContain(esc(t.sekcija.zaSadaEditor));
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

  test("Početna still offers the Editor, which the editor role sees", () => {
    const html = panel({ uloga: "urednik" });
    expect(sidra(html).filter((link) => link.text === esc(t.sekcija.otvoriEditor)).map((link) => link.href)).toEqual([
      navHref("editor", "urednik"),
    ]);
  });

  test("Početna is not promised the Operativa or analytics lines, and the 7 days are not on the page", () => {
    const html = panel({ uloga: "urednik" });
    const main = element(html, "main");
    const pocetna = t.sekcija.stavke.pocetna;
    expect(count(main, "<li")).toBe(pocetna.filter((stavka) => !stavka.dozvola).length);
    expect(count(main, "<li")).toBe(3);
    for (const stavka of pocetna) {
      expect(main.includes(esc(stavka.tekst))).toBe(!stavka.dozvola);
    }
    expect(main.replace(/<[^>]+>/g, " ")).not.toMatch(/\d/);
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

  test("a manager sees all eight sections, the role, and the manager's note on Tim i pristupi", () => {
    const html = panel({ uloga: "menadzer", sekcija: "tim" });
    expect(navLinks(html)).toHaveLength(8);
    expect(html).toContain(ulogaRed(menuDomenSr.roles.manager));
    const napomena = t.sekcija.napomenaMenadzer.tim;
    expect(napomena).toBeDefined();
    expect(html).toContain(esc(napomena ?? ""));
    expect(navLinks(html).filter((link) => link.current).map((link) => link.sekcija)).toEqual(["tim"]);
  });

  test("an owner does not get the manager's note", () => {
    const napomena = t.sekcija.napomenaMenadzer.tim;
    expect(panel({ uloga: "vlasnik", sekcija: "tim" })).not.toContain(esc(napomena ?? ""));
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
    for (const query of [{}, { sekcija: "editor" }, { uloga: "urednik", sekcija: "tim" }, { sekcija: "analitika" }]) {
      const links = nemaSkoka(sidra(panel({ ...query, tema: "tamna" })));
      expect(links.length).toBeGreaterThan(2);
      for (const link of links) expect(link.href).toContain("tema=tamna");
    }
  });

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
    for (const query of [{}, { sekcija: "editor" }, { stanje: "bez-pristupa" }, { uloga: "urednik", sekcija: "tim" }]) {
      expect(panel(query)).not.toContain("tema=");
    }
  });

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
    ];
    for (const upit of upiti) {
      const html = panel(upit);
      expect(count(html, "<h1")).toBe(1);
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
    }
  });

  test("the skip link is the first link of the shell and the target exists once", () => {
    const html = panel({ uloga: "admin", sekcija: "lokal" });
    expect(sidra(html)[0].href).toBe("#menu-panel-sadrzaj");
    expect(count(html, 'id="menu-panel-sadrzaj"')).toBe(1);
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
    ];
    const html = upiti.map(panel).join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});
