// K11 render tests: dragging, `Premesti`, `Izaberi više` and the states of an
// article. Server markup only (renderToStaticMarkup, no DOM), like studio.test.tsx:
// the Radix menus render nothing on the server and the Radix dialog mounts its
// portal only after effects, so `@/components/ui/dialog` is replaced here by a
// stand-in whose `Dialog` renders its children inline while `open` is true. The
// dialogs' own content (the parts K11 wrote) is what is tested, not Radix.
// Texts come from the dictionaries, never typed in Serbian here; the only
// literals are fixture facts (an invented venue and invented names), marked
// where they are used.

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { planCena, type CenaArtikla } from "@/lib/menu/bulk-price";
import { parseEditorPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type {
  StudioKontekst,
  StudioPodaci,
  StudioRadnje,
  StudioRed,
  StudioSekcija,
  StudioUticajArtikla,
} from "@/lib/menu/studio/model";
import { STUDIO_MAX_IZBOR } from "@/lib/menu/studio/selection";
import { BrisanjeDijalog, UticajArtikla } from "./izaberi-vise/brisanje-dijalog";
import { CeneDijalog, type CenePocetno } from "./izaberi-vise/cene-dijalog";
import { RasporedDijalog, type RasporedVrsta } from "./izaberi-vise/raspored-dijalog";
import { TrakaIzbora } from "./izaberi-vise/traka-izbora";
import { SekcijaBlok } from "./ponuda/sekcija-blok";
import { StudioEditor } from "./studio-editor";
import { mestaZaPremestanje, PremestiDijalog, type PremestiCilj } from "./premesti/premesti-dijalog";
import { RedArtikla, stavkeReda, type RadnjaReda, type RedRadnje } from "./red-artikla/red-artikla";

// Nothing in the editor uses next/link; the stub keeps the file independent of
// the global one, as the other izlog render tests do.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

// `Dialog` shows its content inline when open. The content keeps the props the
// tests read (role, the panel marker, the described-by opt-out); Radix-only
// props (onCloseAutoFocus, className) are dropped, they are not DOM attributes.
vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/dialog")>();
  return {
    ...original,
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
    DialogContent: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <div role="dialog" data-povrsina={props["data-povrsina"] as string | undefined}>
        {children}
      </div>
    ),
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

const t = menuStudioSr;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in studio.test.tsx)
// -----------------------------------------------------------------------------

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

const count = (html: string, needle: string) => html.split(needle).length - 1;
const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();

/** The opening tag at the start of a piece of markup. */
const prviTag = (markup: string) => markup.slice(0, markup.indexOf(">") + 1);

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

const jeOnemoguceno = (tag: string) => /\sdisabled=""/.test(tag);
const jeOznaceno = (tag: string) => /\schecked=""/.test(tag);

function mora<T>(vrednost: T | undefined | null, poruka: string): T {
  if (vrednost === undefined || vrednost === null) throw new Error(poruka);
  return vrednost;
}

type Dugme = { tag: string; text: string };

/** Every <button> with its opening tag and its text. */
const dugmad = (html: string): Dugme[] =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => ({
    tag: prviTag(match[0]),
    text: bezTagova(match[1]),
  }));

/** The one <button> carrying a data marker such as `data-izaberi-vise`. */
function dugmeSaOznakom(html: string, oznaka: string): Dugme {
  const match = new RegExp(`<button\\b[^>]*\\s${oznaka}=""[^>]*>([\\s\\S]*?)</button>`).exec(html);
  if (!match) throw new Error(`no <button ${oznaka}> in the markup`);
  return { tag: prviTag(match[0]), text: bezTagova(match[1]) };
}

type RedMarkup = { key: string; markup: string };

/** The article rows of the work area, in order. */
const redovi = (html: string): RedMarkup[] =>
  [...html.matchAll(/<li data-red-artikla="" data-artikal="([^"]+)"[^>]*>[\s\S]*?<\/li>/g)].map((match) => ({
    key: match[1],
    markup: match[0],
  }));

/** The input of the shared price in one row. */
function cenaPolje(red: string): string {
  const match = /<input\b[^>]*\sdata-cena-polje=""[^>]*>/.exec(red);
  if (!match) throw new Error(`no price input in: ${red}`);
  return match[0];
}

/** The section cards of the work area (the preview has its own sections, without data-sekcija). */
const sekcije = (html: string): RedMarkup[] =>
  [...html.matchAll(/<section\b[^>]*\sdata-sekcija="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map((match) => ({
    key: match[1],
    markup: match[0],
  }));

/** The checkbox (label state and input tag) of one row or of a section header: the first in the markup. */
function izborPolje(markup: string): { stanje: string; input: string } {
  const match = /<label data-izbor-polje="(nista|deo|sve)"[^>]*>(<input type="checkbox"[^>]*>)/.exec(markup);
  if (!match) throw new Error(`no checkbox in: ${markup.slice(0, 300)}`);
  return { stanje: match[1], input: match[2] };
}

/** The two groups of the selection bar: the phone one (one Radnje menu) and the one from 640 px up. */
function grupe(html: string) {
  const telefon = mora(/<div role="group"[^>]*\sdata-traka-izbora-telefon=""[^>]*>([\s\S]*?)<\/div>/.exec(html), "no phone group")[1];
  const radna = mora(/<div role="group"[^>]*\sdata-traka-radnji="u-toku"[^>]*>([\s\S]*?)<\/div>/.exec(html), "no action group")[1];
  return { telefon: dugmad(telefon), radna: dugmad(radna) };
}

/** The work area (Ponuda) of the editor, without the page column and the preview around it. */
function radniProstor(html: string): string {
  const start = html.indexOf('data-ponuda=""');
  if (start < 0) throw new Error("no work area in the markup");
  const kraj = html.indexOf("<aside", start);
  return kraj < 0 ? html.slice(start) : html.slice(start, kraj);
}

/** Whole-dinar price as the field shows it ("1.450"); written out, not borrowed from the code under test. */
function sTackom(cena: number): string {
  const s = String(cena);
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ".";
    out += s[i];
  }
  return out;
}

/** The editor as the route renders it for a query string. */
function izlog(query: IzlogSearchParams): string {
  return renderToStaticMarkup(<EditorIzlog params={parseEditorPreview(query)} />);
}

const nista = () => undefined;
// Props that return promises and must never run in a server render.
const nikad = nista as never;

/** The medium fixture menu: the work area of the main page. */
function srednjiSadrzaj() {
  const meni = fixtureMenu("srednji");
  const glavna = mora(
    meni.snapshot.pages.find((page) => page.isDefault),
    "the fixture has no main page",
  );
  const sadrzaj = mora(sadrzajIzSnapshota(meni.snapshot, glavna.key), "the main page has no content");
  return {
    meni,
    sadrzaj,
    sviRedovi: sadrzaj.sekcije.flatMap((sekcija) => sekcija.redovi),
    stranice: straniceIzSnapshota(meni.snapshot, new Set([glavna.key])),
    nedostupni: new Set(meni.unavailableArticleKeys),
  };
}

/**
 * The five rows `stanje=izaberi-vise` selects (the rule of editor-izlog): three
 * plain articles of the first section, and from the section with variants one
 * article with variants and one without.
 */
function ocekivaniIzbor(sekcijeStranice: readonly StudioSekcija[]): StudioRed[] {
  const sVarijantama = mora(
    sekcijeStranice.find((sekcija) => sekcija.redovi.some((red) => red.artikal.varijante)),
    "the fixture has no section with variants",
  );
  const prva = mora(
    sekcijeStranice.find((sekcija) => sekcija !== sVarijantama),
    "the fixture has one section only",
  );
  return [
    ...prva.redovi.filter((red) => !red.artikal.varijante).slice(0, 3),
    mora(
      sVarijantama.redovi.find((red) => red.artikal.varijante),
      "no article with variants",
    ),
    mora(
      sVarijantama.redovi.find((red) => !red.artikal.varijante),
      "no plain article in the section with variants",
    ),
  ];
}

const redRadnjeProba = (izmene: Partial<RedRadnje> = {}): RedRadnje => ({
  onCena: nista,
  onPonovo: nista,
  onZadrziMoju: nista,
  onUzmiSacuvanu: nista,
  ...izmene,
});

// An invented article for the rows rendered on their own.
const probniRed: StudioRed = {
  prikazId: "sc_1/ar_1",
  redosled: 1,
  sakriven: false,
  artikal: {
    id: "ar_1",
    key: "ar_1",
    vrsta: "item",
    naziv: "Probni artikal",
    opis: null,
    cena: 250,
    kolicina: null,
    jedinica: null,
    medij: "none",
    ikonica: null,
    varijante: false,
    proveriCenu: false,
  },
};

function prikazReda(props: Partial<ComponentProps<typeof RedArtikla>> = {}): string {
  return renderToStaticMarkup(
    <ul>
      <RedArtikla red={probniRed} nedostupan={false} cenaStanje={undefined} sacuvanoU={undefined} mozeUredjivanje radnje={redRadnjeProba()} {...props} />
    </ul>,
  );
}

// =============================================================================
// 1. The default editor: the K11 additions stay out of the way
// =============================================================================

describe("the default editor (parseEditorPreview({})) after K11", () => {
  const html = izlog({});
  const radni = radniProstor(html);
  const { sadrzaj, sviRedovi } = srednjiSadrzaj();
  const naStrani = redovi(radni);

  test("Izaberi više is off: no checkbox, no selection bar, no mode marker", () => {
    expect(naStrani).toHaveLength(sviRedovi.length);
    expect(radni).not.toContain('type="checkbox"');
    expect(radni).not.toContain("data-izbor-polje");
    expect(radni).not.toContain("data-traka-izbora");
    expect(radni).not.toContain("data-izabran");
    // The slice starts inside the work area's own opening tag, which carries data-izbor only in the mode.
    expect(radni.startsWith('data-ponuda="">')).toBe(true);
    expect(radni).not.toContain('role="dialog"');
  });

  test("the Izaberi više button is a toggle: pressed=false, with its label", () => {
    const dugme = dugmeSaOznakom(radni, "data-izaberi-vise");
    expect(attr(dugme.tag, "aria-pressed")).toBe("false");
    expect(dugme.text).toBe(esc(t.izaberiVise.ukljuci));
    expect(jeOnemoguceno(dugme.tag)).toBe(false);
    expect(count(radni, " data-izaberi-vise=")).toBe(1);
  });

  test("every article row has a row menu button named after the article", () => {
    for (const { key, markup } of naStrani) {
      const red = mora(
        sviRedovi.find((kandidat) => kandidat.artikal.key === key),
        `no fixture row for ${key}`,
      );
      const meni = [...markup.matchAll(/<button\b[^>]*\sdata-meni-reda="([^"]+)"[^>]*>/g)];
      expect(meni).toHaveLength(1);
      const ime = fmt(t.stanjaArtikla.radnje, { naziv: red.artikal.naziv });
      expect(attr(meni[0][0], "aria-label")).toBe(ime);
      expect(attr(meni[0][0], "title")).toBe(ime);
      expect(meni[0][1]).toBe(red.prikazId);
      expect(attr(meni[0][0], "aria-haspopup")).toBe("menu");
      expect(attr(meni[0][0], "type")).toBe("button");
    }
  });

  test("the drag handles are aria-hidden spans (no button, not focusable), one per row, with data-rucica", () => {
    const rucice = [...radni.matchAll(/<[a-z]+\b[^>]*\sdata-rucica="([^"]+)"[^>]*>/g)];
    expect(rucice.map((match) => match[1])).toEqual(sviRedovi.map((red) => red.prikazId));
    for (const [indeks, match] of rucice.entries()) {
      expect(match[0].startsWith("<span ")).toBe(true);
      expect(attr(match[0], "aria-hidden")).toBe("true");
      expect(attr(match[0], "tabindex")).toBeUndefined();
      expect(attr(match[0], "role")).toBeUndefined();
      expect(attr(match[0], "title")).toBe(fmt(t.dnd.rucica, { naziv: sviRedovi[indeks].artikal.naziv }));
    }
    // A handle is empty: the dots are CSS, and it is never inside a button.
    expect(radni).not.toMatch(/<button\b[^>]*data-rucica=/);
    expect([...radni.matchAll(/<span\b[^>]*\sdata-rucica="[^"]+"[^>]*><\/span>/g)]).toHaveLength(sviRedovi.length);
  });

  test("the whole row card is the drag area: its li has the grab cursor, but no tab stop of its own", () => {
    for (const { markup } of naStrani) {
      const li = prviTag(markup);
      expect(attr(li, "class")).toContain("cursor-grab");
      expect(attr(li, "tabindex")).toBeUndefined();
      expect(attr(li, "role")).toBeUndefined();
    }
  });

  test("a row has exactly two focusable controls: the price input and the menu button", () => {
    for (const { markup } of naStrani) {
      expect(count(markup, "<input")).toBe(1);
      expect(count(markup, "<button")).toBe(1);
      expect(count(markup, "<select")).toBe(0);
      expect(count(markup, "<textarea")).toBe(0);
      expect(count(markup, "<a ")).toBe(0);
      expect(count(markup, "tabindex")).toBe(0);
      expect(attr(cenaPolje(markup), "data-cena-polje")).toBe("");
    }
  });

  test("an unavailable row shows its note (live for guests), a hidden row its note (draft); quiet rows show neither", () => {
    const { nedostupni } = srednjiSadrzaj();
    expect(nedostupni.size).toBeGreaterThan(0);
    for (const { key, markup } of naStrani) {
      const nedostupan = nedostupni.has(key);
      const sakriven = /\sdata-sakriven=""/.test(prviTag(markup));
      expect(markup.includes(esc(t.stanjaArtikla.oznakaUzivo))).toBe(nedostupan);
      expect(markup.includes(esc(t.stanjaArtikla.oznakaNacrt))).toBe(sakriven);
      // A hidden row's text block is not dimmed (the note carries the state).
      const blok = mora(/<div class="([^"]*)"><p class="[^"]*">/.exec(markup), "no text block");
      expect(blok[1]).toContain("flex-1");
      expect(blok[1]).not.toContain("opacity");
    }
  });

  test("every section header has an aria-hidden handle span, and its title button is the click target", () => {
    const sekcijeStranice = sekcije(radni);
    expect(sekcijeStranice).toHaveLength(sadrzaj.sekcije.length);
    for (const [indeks, { markup }] of sekcijeStranice.entries()) {
      const rucica = mora(/<span\b[^>]*\sdata-rucica-sekcije="([^"]+)"[^>]*>/.exec(markup), "no section handle");
      expect(rucica[1]).toBe(sadrzaj.sekcije[indeks].key);
      expect(attr(rucica[0], "aria-hidden")).toBe("true");
      expect(attr(rucica[0], "tabindex")).toBeUndefined();
      expect(attr(rucica[0], "title")).toBe(fmt(t.dnd.rucicaSekcija, { naziv: sadrzaj.sekcije[indeks].naziv }));
      expect(markup).not.toMatch(/<button\b[^>]*data-rucica-sekcije=/);
      expect(markup).toContain(' data-drag-ok=""');
    }
  });
});

// =============================================================================
// 2. Izaberi više in the izlog (stanje=izaberi-vise)
// =============================================================================

describe("stanje=izaberi-vise", () => {
  const html = izlog({ stanje: "izaberi-vise" });
  const radni = radniProstor(html);
  const { sadrzaj, sviRedovi } = srednjiSadrzaj();
  const izabrani = ocekivaniIzbor(sadrzaj.sekcije);
  const izabraniKljucevi = new Set(izabrani.map((red) => red.artikal.key));
  const naStrani = redovi(radni);
  const dijalog = radni.slice(radni.indexOf('role="dialog"'));

  test("the mode is on: the toggle is pressed and the work area is marked", () => {
    const dugme = dugmeSaOznakom(radni, "data-izaberi-vise");
    expect(attr(dugme.tag, "aria-pressed")).toBe("true");
    expect(dugme.text).toBe(esc(t.izaberiVise.ukljuci));
    // The slice starts inside the work area's own opening tag.
    expect(radni.startsWith('data-ponuda="" data-izbor=""')).toBe(true);
  });

  test("the selection is the five rows of the rule: three plain, one with variants, one plain beside it", () => {
    expect(izabrani).toHaveLength(5);
    expect(izabrani.filter((red) => red.artikal.varijante)).toHaveLength(1);
    const sekcijeIzbora = new Set(
      sadrzaj.sekcije.filter((sekcija) => sekcija.redovi.some((red) => izabraniKljucevi.has(red.artikal.key))).map((sekcija) => sekcija.key),
    );
    expect(sekcijeIzbora.size).toBe(2);
  });

  test("every article row has a checkbox named after the article", () => {
    expect(naStrani).toHaveLength(sviRedovi.length);
    for (const { key, markup } of naStrani) {
      const red = mora(
        sviRedovi.find((kandidat) => kandidat.artikal.key === key),
        `no fixture row for ${key}`,
      );
      expect(count(markup, 'type="checkbox"')).toBe(1);
      expect(attr(izborPolje(markup).input, "aria-label")).toBe(fmt(t.izaberiVise.izaberi, { naziv: red.artikal.naziv }));
    }
  });

  test("exactly the five rows of the selection are checked and marked as selected", () => {
    const oznacene = naStrani.filter(({ markup }) => jeOznaceno(izborPolje(markup).input));
    expect(oznacene).toHaveLength(5);
    expect(new Set(oznacene.map((red) => red.key))).toEqual(izabraniKljucevi);
    // The row card says it too (not colour alone: the checkbox is the state).
    expect(naStrani.filter(({ markup }) => /\sdata-izabran=""/.test(prviTag(markup))).map((red) => red.key)).toEqual(oznacene.map((red) => red.key));
    for (const { markup } of naStrani) {
      const izabran = jeOznaceno(izborPolje(markup).input);
      expect(izborPolje(markup).stanje).toBe(izabran ? "sve" : "nista");
    }
  });

  test("a section checkbox shows nothing / part / all of its rows through data-izbor-polje", () => {
    const sekcijeStranice = sekcije(radni);
    expect(sekcijeStranice).toHaveLength(sadrzaj.sekcije.length);
    const stanja = sekcijeStranice.map(({ key, markup }) => {
      const sekcija = mora(
        sadrzaj.sekcije.find((kandidat) => kandidat.key === key),
        `no fixture section ${key}`,
      );
      const broj = sekcija.redovi.filter((red) => izabraniKljucevi.has(red.artikal.key)).length;
      const ocekivano = broj === 0 ? "nista" : broj === sekcija.redovi.length ? "sve" : "deo";
      const polje = izborPolje(markup);
      expect(polje.stanje).toBe(ocekivano);
      expect(attr(polje.input, "aria-label")).toBe(fmt(t.izaberiVise.izaberiSekciju, { naziv: sekcija.naziv }));
      // Only "sve" is a checked box; "deo" is the native indeterminate state (set by script), never checked.
      expect(jeOznaceno(polje.input)).toBe(ocekivano === "sve");
      return polje.stanje;
    });
    // Two sections are partly selected; every other one is not selected at all.
    expect(stanja.filter((stanje) => stanje === "deo")).toHaveLength(2);
    expect(stanja.filter((stanje) => stanje === "nista")).toHaveLength(sekcijeStranice.length - 2);
  });

  test("the bar shows how many are selected (5 is the 'many' form) and the note about drafts", () => {
    // The bar comes before the (open) price dialog in the work area.
    const pocetakTrake = radni.indexOf("<div data-traka-izbora=");
    expect(pocetakTrake).toBeGreaterThan(0);
    expect(radni.indexOf('<div role="dialog"')).toBeGreaterThan(pocetakTrake);
    const traka = radni.slice(pocetakTrake, radni.indexOf('<div role="dialog"'));
    const izabrano = mora(/<p[^>]*\sdata-izabrano="(\d+)"[^>]*>([^<]*)<\/p>/.exec(traka), "no count in the bar");
    expect(izabrano[1]).toBe("5");
    expect(izabrano[2]).toBe(esc(fmt(t.izaberiVise.izabrano.many, { n: 5 })));
    expect(traka).toContain(`>${esc(t.izaberiVise.napomena)}</p>`);
    expect(traka).not.toContain(esc(fmt(t.izaberiVise.granica, { n: STUDIO_MAX_IZBOR })));
    expect(traka).not.toContain(esc(t.izaberiVise.nista));
    expect(count(radni, "data-traka-izbora=")).toBe(1);
    // With five selected, nothing in the bar is disabled.
    expect(traka).not.toMatch(/\sdisabled=""/);
  });

  test("in the mode the price inputs are disabled and there is no row menu, handle or add control", () => {
    for (const { markup } of naStrani) {
      expect(jeOnemoguceno(cenaPolje(markup))).toBe(true);
      expect(count(markup, "<button")).toBe(0);
      expect(markup).not.toContain("data-meni-reda");
      expect(markup).not.toContain("data-rucica");
      expect(attr(prviTag(markup), "class")).toContain("cursor-pointer");
      expect(attr(prviTag(markup), "class")).not.toContain("cursor-grab");
    }
    expect(radni).not.toContain("data-rucica-sekcije");
    expect(radni).not.toContain("data-brzi-unos-otvori");
    expect(radni).not.toContain("data-dodaj");
    for (const sekcija of sadrzaj.sekcije) {
      expect(radni).not.toContain(esc(fmt(t.sekcija.radnje, { naziv: sekcija.naziv })));
    }
  });

  test("the price dialog is open on +10 %: its title, the way of change and the typed value", () => {
    expect(count(radni, 'role="dialog"')).toBe(1);
    expect(dijalog).toContain(`<h2>${esc(t.cene.naslov)}</h2>`);
    expect(dijalog).toContain(`<p>${esc(t.cene.opis)}</p>`);
    // The first line says what the change is about: all five selected articles (5 is the 'many' form).
    const izabranoLinija = mora(/<p[^>]*\sdata-cene-izabrano=""[^>]*>([^<]*)<\/p>/.exec(dijalog), "no selection line");
    expect(izabranoLinija[1]).toBe(esc(fmt(t.izaberiVise.izabrano.many, { n: 5 })));
    expect(dijalog.indexOf("data-cene-izabrano")).toBeLessThan(dijalog.indexOf("<fieldset"));
    const radioDugmad = [...dijalog.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0]);
    expect(radioDugmad.filter(jeOznaceno).map((tag) => attr(tag, "value"))).toEqual(["procenat", "povecaj"]);
    const polje = mora(/<input id="([^"]+)" data-cene-vrednost=""[^>]*>/.exec(dijalog), "no value input");
    expect(attr(polje[0], "value")).toBe("10");
    expect(attr(polje[0], "aria-invalid")).toBeUndefined();
    // The label points at the input, and says it is a percentage.
    const oznaka = mora(new RegExp(`<label for="${polje[1]}"[^>]*>([^<]*)</label>`).exec(dijalog), "the input has no label");
    expect(oznaka[1]).toBe(esc(t.cene.vrednostProcenat));
    expect(dijalog).toContain(`>${esc(t.cene.zaokruzivanje)}</p>`);
    expect(dijalog).not.toContain("data-cene-nevazece");
  });

  test("the table has one row per changed article: old price, new price (+10 %, half up) and the difference", () => {
    const redoviTabele = [...dijalog.matchAll(/<tr data-cena-red="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)];
    const ocekivani = izabrani.filter((red) => !red.artikal.varijante);
    expect(redoviTabele).toHaveLength(4);
    expect(redoviTabele.map((red) => red[1])).toEqual(ocekivani.map((red) => red.artikal.id));
    expect(dijalog).toContain(` data-cene-tabela=""`);
    // Plain headers and a caption instead of "(RSD)" in every header.
    const tabela = mora(/<table[^>]*\sdata-cene-tabela=""[^>]*>([\s\S]*?)<\/table>/.exec(dijalog), "no table")[1];
    expect([...tabela.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1])).toEqual([
      esc(t.cene.artikal),
      esc(t.cene.stara),
      esc(t.cene.nova),
      esc(t.cene.razlika),
    ]);
    expect([...tabela.matchAll(/<caption\b[^>]*>([^<]*)<\/caption>/g)].map((match) => match[1])).toEqual([esc(t.cene.uDinarima)]);

    const artikli: CenaArtikla[] = izabrani.map((red) => ({
      artikalId: red.artikal.id,
      naziv: red.artikal.naziv,
      cena: red.artikal.cena,
      varijante: red.artikal.varijante,
    }));
    const plan = planCena(artikli, { nacin: "procenat", smer: "povecaj", vrednost: 10 });
    expect(plan.promene.map((promena) => promena.artikalId)).toEqual(ocekivani.map((red) => red.artikal.id));

    for (const [indeks, red] of redoviTabele.entries()) {
      const fixtureRed = ocekivani[indeks];
      const stara = mora(fixtureRed.artikal.cena, "a changed article has a price");
      // Integer round half up of stara * 1.10, written out here.
      const nova = Math.floor((stara * 110 + 50) / 100);
      const celije = [...red[2].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) => bezTagova(match[2]));
      expect(celije).toEqual([esc(fixtureRed.artikal.naziv), sTackom(stara), sTackom(nova), `+${sTackom(nova - stara)}`]);
      // The preview agrees with the pure plan the confirm button sends.
      expect(plan.promene[indeks]).toMatchObject({ stara, nova, razlika: nova - stara });
    }
  });

  test("the article with variants is listed as skipped, with the reason", () => {
    const preskoceni = mora(/<div[^>]*\sdata-cene-preskoceni=""[^>]*>([\s\S]*?)<\/div>/.exec(dijalog), "no skipped list")[1];
    expect(preskoceni).toContain(`>${esc(t.cene.preskaceSe)}</p>`);
    const stavke = [...preskoceni.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => bezTagova(match[1]));
    const sVarijantama = mora(
      izabrani.find((red) => red.artikal.varijante),
      "no article with variants in the selection",
    );
    expect(stavke).toEqual([`${esc(sVarijantama.artikal.naziv)}: ${esc(t.cene.razlozi.varijante)}`]);
    // It is not in the table.
    expect(dijalog).not.toContain(`data-cena-red="${sVarijantama.artikal.id}"`);
  });

  test("the summary is the plural form of 4 changes and the confirm button is enabled with the same count", () => {
    const sazetak = mora(/<p[^>]*\sdata-cene-sazetak=""[^>]*>([^<]*)<\/p>/.exec(dijalog), "no summary");
    expect(sazetak[1]).toBe(esc(fmt(t.cene.sazetak.few, { n: 4 })));
    const potvrdi = dugmeSaOznakom(dijalog, "data-cene-potvrdi");
    expect(potvrdi.text).toBe(esc(fmt(t.cene.potvrdi.few, { n: 4 })));
    expect(jeOnemoguceno(potvrdi.tag)).toBe(false);
    expect(attr(potvrdi.tag, "aria-busy")).toBeUndefined();
    const otkazi = dugmad(dijalog).map((dugme) => dugme.text);
    expect(otkazi).toContain(esc(t.cene.otkazi));
  });
});

// =============================================================================
// 2b. The price dialog on its own: plural forms, signs, rounding and the refusals
// =============================================================================

describe("CeneDijalog (Promeni cene)", () => {
  // Invented articles; the prices are chosen for the rounding they exercise.
  const artikal = (id: string, cena: number | null, varijante = false): CenaArtikla => ({
    artikalId: id,
    naziv: `Artikal ${id}`,
    cena,
    varijante,
  });

  const prikaz = (artikli: readonly CenaArtikla[], pocetno: CenePocetno | null) =>
    renderToStaticMarkup(<CeneDijalog otvoreno onOtvoreno={nista} artikli={artikli} pocetno={pocetno} onPrimeni={nikad} onGotovo={nista} />);

  const redTabele = (html: string, id: string) => {
    const red = mora(new RegExp(`<tr data-cena-red="${id}"[^>]*>([\\s\\S]*?)</tr>`).exec(html), `no row for ${id}`);
    return [...red[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) => bezTagova(match[1]));
  };

  test("closed: nothing is rendered", () => {
    const html = renderToStaticMarkup(
      <CeneDijalog otvoreno={false} onOtvoreno={nista} artikli={[artikal("a", 100)]} pocetno={null} onPrimeni={nikad} onGotovo={nista} />,
    );
    expect(html).toBe("");
  });

  test("the summary and the confirm button take the plural form of the number of changes: 1, 4 and 5", () => {
    const pocetno: CenePocetno = { nacin: "procenat", smer: "povecaj", vrednost: "10" };
    const jedan = prikaz([artikal("a", 480)], pocetno);
    const cetiri = prikaz([artikal("a", 480), artikal("b", 500), artikal("c", 600), artikal("d", 700)], pocetno);
    const pet = prikaz([artikal("a", 480), artikal("b", 500), artikal("c", 600), artikal("d", 700), artikal("e", 800)], pocetno);
    for (const [html, n, oblik] of [
      [jedan, 1, "one"],
      [cetiri, 4, "few"],
      [pet, 5, "many"],
    ] as const) {
      expect(mora(/<p[^>]*\sdata-cene-sazetak=""[^>]*>([^<]*)<\/p>/.exec(html), "no summary")[1]).toBe(esc(fmt(t.cene.sazetak[oblik], { n })));
      const potvrdi = dugmeSaOznakom(html, "data-cene-potvrdi");
      expect(potvrdi.text).toBe(esc(fmt(t.cene.potvrdi[oblik], { n })));
      expect(jeOnemoguceno(potvrdi.tag)).toBe(false);
      expect(count(html, "data-cena-red=")).toBe(n);
      // Every article is changed here, so the selection line has the same number and form.
      expect(mora(/<p[^>]*\sdata-cene-izabrano=""[^>]*>([^<]*)<\/p>/.exec(html), "no selection line")[1]).toBe(
        esc(fmt(t.izaberiVise.izabrano[oblik], { n })),
      );
    }
  });

  test("the summary, Otkaži and the confirm button sit together in one sticky footer, after the preview", () => {
    const html = prikaz([artikal("a", 480)], { nacin: "procenat", smer: "povecaj", vrednost: "10" });
    const podnozjeStart = html.lastIndexOf("<div ", html.indexOf("data-cene-sazetak"));
    const podnozje = html.slice(podnozjeStart);
    expect(attr(prviTag(podnozje), "class")).toContain("sticky");
    expect(podnozje).toContain(" data-cene-sazetak=");
    expect(podnozje).toContain(" data-cene-potvrdi=");
    expect(dugmad(podnozje).map((dugme) => dugme.text)).toEqual([esc(t.cene.otkazi), esc(fmt(t.cene.potvrdi.one, { n: 1 }))]);
    // The form and the preview stay above the footer.
    expect(podnozje).not.toContain("data-cene-vrednost");
    expect(podnozje).not.toContain("data-cene-tabela");
    expect(html.indexOf("data-cene-tabela")).toBeLessThan(podnozjeStart);
  });

  test("the table has the plain headers, a caption saying the amounts are in dinars, and no currency in the cells", () => {
    const html = prikaz([artikal("a", 480), artikal("b", 1450)], { nacin: "procenat", smer: "povecaj", vrednost: "10" });
    const tabela = mora(/<table[^>]*\sdata-cene-tabela=""[^>]*>([\s\S]*?)<\/table>/.exec(html), "no table")[1];
    const zaglavlja = [...tabela.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(zaglavlja).toEqual([esc(t.cene.artikal), esc(t.cene.stara), esc(t.cene.nova), esc(t.cene.razlika)]);
    const natpis = [...tabela.matchAll(/<caption\b[^>]*>([^<]*)<\/caption>/g)].map((match) => match[1]);
    expect(natpis).toEqual([esc(t.cene.uDinarima)]);
    // The caption comes first inside the table, as HTML requires.
    expect(tabela.trimStart().startsWith("<caption")).toBe(true);
    expect(redTabele(html, "b")).toEqual([esc("Artikal b"), "1.450", "1.595", "+145"]);
    expect(tabela).not.toContain(esc(t.red.rsd));
  });

  test("a decrease rounds half up and shows a minus sign: 905 -10 % is 815, difference -90", () => {
    const html = prikaz([artikal("a", 480), artikal("b", 905)], { nacin: "procenat", smer: "smanji", vrednost: "10" });
    // 480 * 0.9 = 432 exactly; 905 * 0.9 = 814.5, which rounds up to 815.
    expect(redTabele(html, "a")).toEqual([esc("Artikal a"), "480", "432", "−48"]);
    expect(redTabele(html, "b")).toEqual([esc("Artikal b"), "905", "815", "−90"]);
    const smer = [...html.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0]).filter(jeOznaceno);
    expect(smer.map((tag) => attr(tag, "value"))).toEqual(["procenat", "smanji"]);
  });

  test("a price without a value gets the same price for all, shown as 'bez cene' with no difference", () => {
    const html = prikaz([artikal("a", null), artikal("b", 480)], { nacin: "ista", vrednost: "1500" });
    expect(redTabele(html, "a")).toEqual([esc("Artikal a"), esc(t.cene.bezCene), "1.500", "—"]);
    expect(redTabele(html, "b")).toEqual([esc("Artikal b"), "480", "1.500", "+1.020"]);
    // "Ista cena" has no direction group.
    expect(html).not.toContain(esc(t.cene.smer));
  });

  test("the reasons for skipping: variants, no price, no change", () => {
    const html = prikaz(
      [artikal("v", 400, true), artikal("n", null), artikal("p", 480), artikal("c", 100)],
      // 0,01 % of 480 is 0,048 dinars: the price stays the same.
      { nacin: "procenat", smer: "povecaj", vrednost: "0,01" },
    );
    const preskoceni = mora(/<div[^>]*\sdata-cene-preskoceni=""[^>]*>([\s\S]*?)<\/div>/.exec(html), "no skipped list")[1];
    const stavke = [...preskoceni.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => bezTagova(match[1]));
    expect(stavke).toEqual([
      `${esc("Artikal v")}: ${esc(t.cene.razlozi.varijante)}`,
      `${esc("Artikal n")}: ${esc(t.cene.razlozi.bez_cene)}`,
      `${esc("Artikal p")}: ${esc(t.cene.razlozi.bez_promene)}`,
      `${esc("Artikal c")}: ${esc(t.cene.razlozi.bez_promene)}`,
    ]);
    // Nothing changes: no table, the summary says so, and confirming is not possible.
    expect(html).not.toContain("data-cene-tabela");
    expect(html).toContain(`>${esc(t.cene.nistaSeNeMenja)}</p>`);
    const potvrdi = dugmeSaOznakom(html, "data-cene-potvrdi");
    expect(jeOnemoguceno(potvrdi.tag)).toBe(true);
    expect(potvrdi.text).toBe(esc(t.cene.primeni));
    // All four articles are in the selection, though none changes.
    expect(html).toContain(`>${esc(fmt(t.izaberiVise.izabrano.few, { n: 4 }))}</p>`);
  });

  test("a price that would go below 0 blocks the whole change and says which article", () => {
    const html = prikaz([artikal("a", 500), artikal("b", 800)], { nacin: "iznos", smer: "smanji", vrednost: "600" });
    const nevazece = mora(/<div[^>]*\sdata-cene-nevazece=""[^>]*>([\s\S]*?)<\/div>/.exec(html), "no invalid list");
    expect(attr(prviTag(nevazece[0]), "role")).toBe("alert");
    expect(nevazece[1]).toContain(`>${esc(t.cene.nevazeceNaslov)}</p>`);
    expect(nevazece[1]).toContain(esc(t.cene.nevazece.negativna));
    expect(nevazece[1]).toContain(esc("Artikal a"));
    expect(nevazece[1]).not.toContain(esc("Artikal b"));
    expect(nevazece[1]).toContain(`<p>${esc(t.cene.nevazeceOpis)}</p>`);
    // Article b (800 - 600 = 200) would change, but nothing may be written while a row is invalid.
    expect(redTabele(html, "b")).toEqual([esc("Artikal b"), "800", "200", "−600"]);
    const potvrdi = dugmeSaOznakom(html, "data-cene-potvrdi");
    expect(jeOnemoguceno(potvrdi.tag)).toBe(true);
    // One article would change (b), so the label counts it, but the button stays disabled.
    expect(potvrdi.text).toBe(esc(fmt(t.cene.potvrdi.one, { n: 1 })));
  });

  test("a price over 1.000.000 RSD is refused the same way", () => {
    const html = prikaz([artikal("a", 900_000)], { nacin: "procenat", smer: "povecaj", vrednost: "20" });
    expect(html).toContain(esc(t.cene.nevazece.prevelika));
    expect(jeOnemoguceno(dugmeSaOznakom(html, "data-cene-potvrdi").tag)).toBe(true);
  });

  test("nothing typed yet: no preview, no summary, the rounding hint stays and confirming is disabled", () => {
    const html = prikaz([artikal("a", 480)], null);
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("data-cena-red");
    expect(html).toContain(`>${esc(t.cene.zaokruzivanje)}</p>`);
    expect(mora(/<p[^>]*\sdata-cene-sazetak=""[^>]*>([^<]*)<\/p>/.exec(html), "no summary")[1]).toBe("");
    const potvrdi = dugmeSaOznakom(html, "data-cene-potvrdi");
    expect(jeOnemoguceno(potvrdi.tag)).toBe(true);
    // Nothing to apply yet: the plain verb, not "Primeni na 0 ...".
    expect(potvrdi.text).toBe(esc(t.cene.primeni));
    // The first line still says how many articles the change is about (1 is the 'one' form).
    expect(mora(/<p[^>]*\sdata-cene-izabrano=""[^>]*>([^<]*)<\/p>/.exec(html), "no selection line")[1]).toBe(
      esc(fmt(t.izaberiVise.izabrano.one, { n: 1 })),
    );
    // The default way of change is a percentage up.
    const izabrano = [...html.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0]).filter(jeOznaceno);
    expect(izabrano.map((tag) => attr(tag, "value"))).toEqual(["procenat", "povecaj"]);
  });

  test("a wrong value is flagged on the input and explained in the hint", () => {
    const html = prikaz([artikal("a", 480)], { nacin: "procenat", smer: "povecaj", vrednost: "abc" });
    const polje = mora(/<input id="[^"]+" data-cene-vrednost=""[^>]*>/.exec(html), "no value input")[0];
    expect(attr(polje, "aria-invalid")).toBe("true");
    const pomoc = mora(new RegExp(`<p id="${attr(polje, "aria-describedby")}"[^>]*>([^<]*)</p>`).exec(html), "no hint for the input");
    expect(pomoc[1]).toBe(esc(t.cene.greske.procenat_opseg));
    expect(html).not.toContain("data-cena-red");
    expect(jeOnemoguceno(dugmeSaOznakom(html, "data-cene-potvrdi").tag)).toBe(true);
  });

  test("an amount has no decimals: the hint says whole dinars", () => {
    const html = prikaz([artikal("a", 480)], { nacin: "iznos", smer: "povecaj", vrednost: "10,5" });
    expect(html).toContain(`>${esc(t.cene.greske.iznos_ceo)}</p>`);
    expect(html).toContain(esc(t.cene.vrednostIznos));
  });
});

// =============================================================================
// 3. Premesti
// =============================================================================

describe("mestaZaPremestanje (pure)", () => {
  // Invented names.
  const nazivi = ["Alfa", "Beta", "Gama"];

  test("starts with 'Na početak' (place 0), then 'Posle: X' for each name, places 1..n", () => {
    expect(mestaZaPremestanje(nazivi, null)).toEqual([
      { indeks: 0, tekst: t.premesti.naPocetak },
      { indeks: 1, tekst: fmt(t.premesti.posle, { naziv: "Alfa" }) },
      { indeks: 2, tekst: fmt(t.premesti.posle, { naziv: "Beta" }) },
      { indeks: 3, tekst: fmt(t.premesti.posle, { naziv: "Gama" }) },
    ]);
  });

  test("an empty list has only 'Na početak'", () => {
    expect(mestaZaPremestanje([], null)).toEqual([{ indeks: 0, tekst: t.premesti.naPocetak }]);
    expect(mestaZaPremestanje([], 0)).toEqual([{ indeks: 0, tekst: fmt(t.premesti.sada, { tekst: t.premesti.naPocetak }) }]);
  });

  test("the current place is marked with the 'sadašnje mesto' form, and only it", () => {
    const sada = (indeks: number) => mestaZaPremestanje(nazivi, indeks).filter((mesto) => mesto.tekst.includes(fmt(t.premesti.sada, { tekst: "" }).trim()));
    expect(mestaZaPremestanje(nazivi, 0)[0].tekst).toBe(fmt(t.premesti.sada, { tekst: t.premesti.naPocetak }));
    expect(mestaZaPremestanje(nazivi, 2)[2].tekst).toBe(fmt(t.premesti.sada, { tekst: fmt(t.premesti.posle, { naziv: "Beta" }) }));
    expect(mestaZaPremestanje(nazivi, 3)[3].tekst).toBe(fmt(t.premesti.sada, { tekst: fmt(t.premesti.posle, { naziv: "Gama" }) }));
    for (const indeks of [0, 1, 2, 3]) {
      expect(sada(indeks)).toHaveLength(1);
      expect(sada(indeks)[0].indeks).toBe(indeks);
    }
    // The other places keep their plain text.
    expect(mestaZaPremestanje(nazivi, 2).map((mesto) => mesto.tekst)).toEqual([
      t.premesti.naPocetak,
      fmt(t.premesti.posle, { naziv: "Alfa" }),
      fmt(t.premesti.sada, { tekst: fmt(t.premesti.posle, { naziv: "Beta" }) }),
      fmt(t.premesti.posle, { naziv: "Gama" }),
    ]);
  });

  test("a current place outside the list marks nothing", () => {
    expect(mestaZaPremestanje(nazivi, 9)).toEqual(mestaZaPremestanje(nazivi, null));
  });
});

describe("PremestiDijalog content", () => {
  const { sadrzaj } = srednjiSadrzaj();
  // A row in the middle of the first section, so there are places before and after it.
  const prvaSekcija = sadrzaj.sekcije[0];
  const indeksReda = 2;
  const pomeren = prvaSekcija.redovi[indeksReda];
  const cilj: PremestiCilj = { vrsta: "red", red: pomeren, sekcijaId: prvaSekcija.id };
  const prikaz = (premestiCilj: PremestiCilj | null) =>
    renderToStaticMarkup(<PremestiDijalog cilj={premestiCilj} sekcije={sadrzaj.sekcije} onPremesti={async () => true} onZatvori={nista} />);

  type Opcija = { value: string | undefined; text: string; selected: boolean };
  type Polje = { oznaka: string; id: string; select: string; opcije: Opcija[] };

  /** Each <select> with the text of the <label> whose `for` is its id. */
  function polja(html: string): Polje[] {
    const oznake = [...html.matchAll(/<label\b[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/label>/g)].map((match) => ({ za: match[1], tekst: match[2] }));
    return [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)].map((match) => {
      const select = `<select${match[1]}>`;
      const id = mora(attr(select, "id"), "a select without an id");
      const oznaka = mora(
        oznake.find((kandidat) => kandidat.za === id),
        `no label for ${id}`,
      );
      return {
        oznaka: oznaka.tekst,
        id,
        select,
        opcije: [...match[2].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map((opcija) => ({
          value: attr(opcija[1], "value"),
          text: opcija[2],
          selected: /\sselected=""/.test(opcija[1]),
        })),
      };
    });
  }

  test("closed: nothing is rendered", () => {
    expect(prikaz(null)).toBe("");
  });

  test("an article: title, description, and two labelled selects (Sekcija, Mesto) with matching id/for", () => {
    const html = prikaz(cilj);
    expect(html).toContain(`<h2>${esc(fmt(t.premesti.naslov, { naziv: pomeren.artikal.naziv }))}</h2>`);
    expect(html).toContain(`<p>${esc(t.premesti.opis)}</p>`);
    const sva = polja(html);
    expect(sva.map((polje) => polje.oznaka)).toEqual([esc(t.premesti.sekcija), esc(t.premesti.mesto)]);
    expect(count(html, "<select")).toBe(2);
    expect(count(html, "<label")).toBe(2);
    expect(new Set(sva.map((polje) => polje.id)).size).toBe(2);
    expect(attr(sva[0].select, "data-premesti-sekcija")).toBe("");
    expect(attr(sva[1].select, "data-premesti-mesto")).toBe("");
  });

  test("the section select lists every section of the page, the current one chosen", () => {
    const [sekcijaPolje] = polja(prikaz(cilj));
    expect(sekcijaPolje.opcije.map((opcija) => opcija.value)).toEqual(sadrzaj.sekcije.map((sekcija) => sekcija.id));
    expect(sekcijaPolje.opcije.map((opcija) => opcija.text)).toEqual(sadrzaj.sekcije.map((sekcija) => esc(sekcija.naziv)));
    expect(sekcijaPolje.opcije.filter((opcija) => opcija.selected).map((opcija) => opcija.value)).toEqual([prvaSekcija.id]);
  });

  test("the place select: 'Na početak', 'Posle: X' for the other articles, the current place marked and chosen", () => {
    const mesto = polja(prikaz(cilj))[1];
    const ostali = prvaSekcija.redovi.filter((red) => red.prikazId !== pomeren.prikazId);
    const ocekivano = [
      t.premesti.naPocetak,
      ...ostali.map((red) => fmt(t.premesti.posle, { naziv: red.artikal.naziv })),
    ].map((tekst, indeks) => (indeks === indeksReda ? fmt(t.premesti.sada, { tekst }) : tekst));
    expect(mesto.opcije.map((opcija) => opcija.text)).toEqual(ocekivano.map(esc));
    expect(mesto.opcije.map((opcija) => opcija.value)).toEqual(ocekivano.map((_, indeks) => String(indeks)));
    // The moved article is not offered as a place of its own.
    expect(mesto.opcije.map((opcija) => opcija.text).join("|")).not.toContain(esc(fmt(t.premesti.posle, { naziv: pomeren.artikal.naziv })));
    expect(mesto.opcije.filter((opcija) => opcija.selected).map((opcija) => opcija.value)).toEqual([String(indeksReda)]);
    expect(mesto.opcije).toHaveLength(prvaSekcija.redovi.length);
  });

  test("an article's place list follows its section: the first article starts at 'Na početak'", () => {
    const prvi = prvaSekcija.redovi[0];
    const mesto = polja(prikaz({ vrsta: "red", red: prvi, sekcijaId: prvaSekcija.id }))[1];
    expect(mesto.opcije[0].text).toBe(esc(fmt(t.premesti.sada, { tekst: t.premesti.naPocetak })));
    expect(mesto.opcije[0].selected).toBe(true);
    expect(mesto.opcije.filter((opcija) => opcija.selected)).toHaveLength(1);
  });

  test("a section: its own title and description, one labelled select (Mesto) among the other sections", () => {
    const sekcija = sadrzaj.sekcije[1];
    const html = prikaz({ vrsta: "sekcija", sekcija });
    expect(html).toContain(`<h2>${esc(fmt(t.premesti.naslovSekcije, { naziv: sekcija.naziv }))}</h2>`);
    expect(html).toContain(`<p>${esc(t.premesti.opisSekcije)}</p>`);
    const sva = polja(html);
    expect(sva.map((polje) => polje.oznaka)).toEqual([esc(t.premesti.mesto)]);
    expect(html).not.toContain("data-premesti-sekcija");
    const ostale = sadrzaj.sekcije.filter((kandidat) => kandidat.id !== sekcija.id);
    const ocekivano = [t.premesti.naPocetak, ...ostale.map((s) => fmt(t.premesti.posle, { naziv: s.naziv }))].map((tekst, indeks) =>
      indeks === 1 ? fmt(t.premesti.sada, { tekst }) : tekst,
    );
    expect(sva[0].opcije.map((opcija) => opcija.text)).toEqual(ocekivano.map(esc));
    expect(sva[0].opcije.filter((opcija) => opcija.selected).map((opcija) => opcija.value)).toEqual(["1"]);
  });

  test("the confirm button is a submit with the verb, and Otkaži sits beside it", () => {
    const html = prikaz(cilj);
    const potvrdi = dugmeSaOznakom(html, "data-premesti-potvrdi");
    expect(potvrdi.text).toBe(esc(t.premesti.potvrdi));
    expect(attr(potvrdi.tag, "type")).toBe("submit");
    expect(jeOnemoguceno(potvrdi.tag)).toBe(false);
    expect(dugmad(html).map((dugme) => dugme.text)).toEqual([esc(t.premesti.otkazi), esc(t.premesti.potvrdi)]);
    expect(html).toContain("<form");
  });
});

// =============================================================================
// 3b. The group layout dialog (Raspored) and the delete dialog
// =============================================================================

describe("RasporedDijalog content", () => {
  const sekcijeProba = [
    { id: "sc_a", naziv: "Prva sekcija" },
    { id: "sc_b", naziv: "Druga sekcija" },
  ];
  const prikaz = (vrsta: RasporedVrsta | null, stranice: readonly { id: string; naziv: string }[] = []) =>
    renderToStaticMarkup(
      <RasporedDijalog
        vrsta={vrsta}
        broj={3}
        sekcije={sekcijeProba}
        stranice={stranice}
        ucitajSekcije={nikad}
        onPremesti={nikad}
        onDodaj={nikad}
        onUkloni={nikad}
        onZatvori={nista}
      />,
    );

  test("closed: nothing is rendered", () => {
    expect(prikaz(null)).toBe("");
  });

  test("Premesti u sekciju: the count, a labelled section select of this page, and an enabled confirm", () => {
    const html = prikaz("premesti");
    expect(html).toContain(`<h2>${esc(t.izaberiVise.premestiNaslov)}</h2>`);
    expect(html).toContain(`<p>${esc(t.izaberiVise.premestiOpis)}</p>`);
    expect(html).toContain(esc(fmt(t.izaberiVise.izabrano.few, { n: 3 })));
    const oznaka = mora(/<label\b[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/label>/.exec(html), "no label");
    expect(oznaka[2]).toBe(esc(t.izaberiVise.sekcija));
    const select = mora(/<select\b[^>]*>/.exec(html), "no select")[0];
    expect(attr(select, "id")).toBe(oznaka[1]);
    expect([...html.matchAll(/<option\b[^>]*\svalue="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map((match) => [match[1], match[2]])).toEqual(
      sekcijeProba.map((sekcija) => [sekcija.id, esc(sekcija.naziv)]),
    );
    const potvrdi = dugmeSaOznakom(html, "data-raspored-potvrdi");
    expect(potvrdi.text).toBe(esc(t.izaberiVise.premestiDugme));
    expect(jeOnemoguceno(potvrdi.tag)).toBe(false);
  });

  test("Dodaj na drugu stranicu without another page says so and offers no select", () => {
    const html = prikaz("dodaj");
    expect(html).toContain(`<h2>${esc(t.izaberiVise.dodajNaslov)}</h2>`);
    expect(html).toContain(`>${esc(t.izaberiVise.nemaDrugihStranica)}</p>`);
    expect(html).not.toContain("<select");
    expect(jeOnemoguceno(dugmeSaOznakom(html, "data-raspored-potvrdi").tag)).toBe(true);
  });

  test("Dodaj na drugu stranicu with pages: a page select, a section select still loading, confirm disabled", () => {
    const html = prikaz("dodaj", [{ id: "pg_x", naziv: "Karta pića" }]);
    const oznake = [...html.matchAll(/<label\b[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/label>/g)];
    expect(oznake.map((oznaka) => oznaka[2])).toEqual([esc(t.izaberiVise.stranica), esc(t.izaberiVise.sekcija)]);
    const selecti = [...html.matchAll(/<select\b[^>]*>/g)].map((match) => match[0]);
    expect(selecti.map((tag) => attr(tag, "id"))).toEqual(oznake.map((oznaka) => oznaka[1]));
    expect(jeOnemoguceno(selecti[0])).toBe(false);
    // The sections of the other page arrive after an effect, so the server render shows the loading line.
    expect(jeOnemoguceno(selecti[1])).toBe(true);
    expect(html).toContain(`>${esc(t.izaberiVise.ucitavaSekcije)}</option>`);
    expect(html).toContain(">Karta pića</option>");
    expect(jeOnemoguceno(dugmeSaOznakom(html, "data-raspored-potvrdi").tag)).toBe(true);
    expect(dugmeSaOznakom(html, "data-raspored-potvrdi").text).toBe(esc(t.izaberiVise.dodajDugme));
  });

  test("Ukloni sa ove stranice: the count and a danger confirm, no select", () => {
    const html = prikaz("ukloni");
    expect(html).toContain(`<h2>${esc(t.izaberiVise.ukloniNaslov)}</h2>`);
    expect(html).toContain(`<p>${esc(t.izaberiVise.ukloniOpis)}</p>`);
    expect(html).toContain(`>${esc(fmt(t.izaberiVise.izabrano.few, { n: 3 }))}</p>`);
    expect(html).not.toContain("<select");
    expect(dugmeSaOznakom(html, "data-raspored-potvrdi").text).toBe(esc(t.izaberiVise.ukloniDugme));
    expect(dugmad(html).map((dugme) => dugme.text)).toEqual([esc(t.izaberiVise.otkazi), esc(t.izaberiVise.ukloniDugme)]);
  });
});

describe("BrisanjeDijalog content", () => {
  const prikaz = (artikalIds: readonly string[] | null, nazivJednog: string | null) =>
    renderToStaticMarkup(
      <BrisanjeDijalog artikalIds={artikalIds} nazivJednog={nazivJednog} ucitajUticaj={nikad} onObrisi={nikad} onGotovo={nista} onZatvori={nista} />,
    );

  test("closed: nothing is rendered", () => {
    expect(prikaz(null, null)).toBe("");
  });

  test("one article: its name in the title, the single-article description, and the loading line", () => {
    const html = prikaz(["ar_1"], "Probni artikal");
    expect(html).toContain(`<h2>${esc(fmt(t.brisanje.naslovJedan, { naziv: "Probni artikal" }))}</h2>`);
    expect(html).toContain(`<p>${esc(t.brisanje.opis)}</p>`);
    expect(html).toContain(esc(t.brisanje.ucitava));
    // The consequences are not shown yet, so there is nothing to confirm.
    expect(html).not.toContain("data-brisanje-potvrdi");
  });

  test("several articles: the plural title with the count and the plural description", () => {
    const html = prikaz(["a", "b", "c"], null);
    expect(html).toContain(`<h2>${esc(fmt(t.brisanje.naslovVise.few, { n: 3 }))}</h2>`);
    expect(html).toContain(`<p>${esc(t.brisanje.opisVise)}</p>`);
    expect(html).not.toContain(esc(t.brisanje.opis));
  });
});

// =============================================================================
// 4. stavkeReda
// =============================================================================

describe("stavkeReda (the row menu)", () => {
  const s = t.stanjaArtikla;
  const red = (sakriven: boolean): StudioRed => ({ ...probniRed, sakriven });
  const stavke = (izmene: { nedostupan?: boolean; mozeUredjivanje?: boolean; mozeDostupnost?: boolean; sakriven?: boolean }) =>
    stavkeReda(
      red(izmene.sakriven ?? false),
      { nedostupan: izmene.nedostupan ?? false, mozeUredjivanje: izmene.mozeUredjivanje ?? false, mozeDostupnost: izmene.mozeDostupnost ?? false },
      nista,
    );
  const kljucevi = (lista: ReturnType<typeof stavke>) => lista.map((stavka) => stavka.kljuc);

  test("with editing and availability: nedostupno first, then premesti, sakrij, ukloni, obrisi", () => {
    const lista = stavke({ mozeUredjivanje: true, mozeDostupnost: true });
    expect(kljucevi(lista)).toEqual(["nedostupno", "premesti", "sakrij", "ukloni", "obrisi"]);
    const po = Object.fromEntries(lista.map((stavka) => [stavka.kljuc, stavka]));
    // Availability is live at once, hiding is a draft: the description says which.
    expect(po.nedostupno).toMatchObject({ tekst: s.nedostupno, opis: s.odmah });
    expect(po.premesti).toMatchObject({ tekst: s.premesti, opis: s.premestiOpis });
    expect(po.sakrij).toMatchObject({ tekst: s.sakrij });
    expect(po.sakrij.opis).toBeUndefined();
    expect(po.ukloni).toMatchObject({ tekst: s.ukloni, opis: s.ukloniOpis });
    expect(po.obrisi).toMatchObject({ tekst: s.obrisi, opis: s.obrisiOpis });
  });

  test("the live item is in its own group (Odmah za goste); every draft item is in the draft group", () => {
    for (const nedostupan of [false, true]) {
      for (const sakriven of [false, true]) {
        const lista = stavke({ nedostupan, sakriven, mozeUredjivanje: true, mozeDostupnost: true });
        expect(lista.map((stavka) => stavka.grupa)).toEqual([s.grupaUzivo, s.grupaNacrt, s.grupaNacrt, s.grupaNacrt, s.grupaNacrt]);
        // Two groups, each in one piece: the menu draws one label and one separator.
        expect(new Set(lista.map((stavka) => stavka.grupa)).size).toBe(2);
      }
    }
    expect(s.grupaUzivo).not.toBe(s.grupaNacrt);
    // Without the availability right the menu is the draft group alone; without editing it is the live group alone.
    expect(stavke({ mozeUredjivanje: true }).every((stavka) => stavka.grupa === s.grupaNacrt)).toBe(true);
    expect(stavke({ mozeDostupnost: true }).every((stavka) => stavka.grupa === s.grupaUzivo)).toBe(true);
  });

  test("only the deletion is marked as dangerous", () => {
    const lista = stavke({ mozeUredjivanje: true, mozeDostupnost: true });
    expect(lista.filter((stavka) => stavka.opasno === true).map((stavka) => stavka.kljuc)).toEqual(["obrisi"]);
    // Every item has a text and a group, so the menu says what is live and what is a draft
    // (the group label; a description only where it adds something).
    for (const stavka of lista) {
      expect(stavka.tekst.length).toBeGreaterThan(0);
      expect([s.grupaUzivo, s.grupaNacrt]).toContain(stavka.grupa);
    }
  });

  test("an unavailable article offers the 'dostupno' item (still first, still live) instead of 'nedostupno'", () => {
    const lista = stavke({ nedostupan: true, mozeUredjivanje: true, mozeDostupnost: true });
    expect(kljucevi(lista)).toEqual(["dostupno", "premesti", "sakrij", "ukloni", "obrisi"]);
    expect(lista[0]).toMatchObject({ tekst: s.dostupno, opis: s.odmah, grupa: s.grupaUzivo });
    expect(kljucevi(lista)).not.toContain("nedostupno");
    // The two availability texts differ, so the owner reads which way it goes.
    expect(s.dostupno).not.toBe(s.nedostupno);
  });

  test("a hidden row offers the 'prikazi' item instead of 'sakrij', in the same place", () => {
    const lista = stavke({ sakriven: true, mozeUredjivanje: true, mozeDostupnost: true });
    expect(kljucevi(lista)).toEqual(["nedostupno", "premesti", "prikazi", "ukloni", "obrisi"]);
    expect(lista[2]).toMatchObject({ tekst: s.prikazi, grupa: s.grupaNacrt });
    expect(lista[2].opis).toBeUndefined();
    expect(kljucevi(lista)).not.toContain("sakrij");
  });

  test("editing off, availability on: only the availability item", () => {
    expect(kljucevi(stavke({ mozeDostupnost: true }))).toEqual(["nedostupno"]);
    expect(kljucevi(stavke({ mozeDostupnost: true, nedostupan: true }))).toEqual(["dostupno"]);
    // Hiding does not depend on availability, and a hidden row does not change the availability-only menu.
    expect(kljucevi(stavke({ mozeDostupnost: true, sakriven: true }))).toEqual(["nedostupno"]);
  });

  test("editing on, availability off: no availability item", () => {
    expect(kljucevi(stavke({ mozeUredjivanje: true }))).toEqual(["premesti", "sakrij", "ukloni", "obrisi"]);
    expect(kljucevi(stavke({ mozeUredjivanje: true, nedostupan: true }))).toEqual(["premesti", "sakrij", "ukloni", "obrisi"]);
  });

  test("neither right: no menu at all", () => {
    expect(stavke({})).toEqual([]);
    expect(stavke({ nedostupan: true, sakriven: true })).toEqual([]);
  });

  test("choosing an item reports its own action", () => {
    const izabrano: RadnjaReda[] = [];
    const lista = stavkeReda(probniRed, { nedostupan: false, mozeUredjivanje: true, mozeDostupnost: true }, (radnja) => izabrano.push(radnja));
    for (const stavka of lista) stavka.onIzbor();
    expect(izabrano).toEqual(["nedostupno", "premesti", "sakrij", "ukloni", "obrisi"]);
  });
});

// =============================================================================
// 5. RedArtikla on its own
// =============================================================================

describe("RedArtikla in the K11 modes", () => {
  const radnje = redRadnjeProba({ onRadnja: nista, onIzaberi: nista });

  test("in Izaberi više: a checkbox named after the article, a disabled price, no menu, no handle", () => {
    const html = prikazReda({ izborAktivan: true, radnje });
    const polje = izborPolje(html);
    expect(attr(polje.input, "aria-label")).toBe(fmt(t.izaberiVise.izaberi, { naziv: probniRed.artikal.naziv }));
    expect(polje.stanje).toBe("nista");
    expect(jeOznaceno(polje.input)).toBe(false);
    expect(count(html, 'type="checkbox"')).toBe(1);
    expect(jeOnemoguceno(cenaPolje(html))).toBe(true);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("data-meni-reda");
    expect(html).not.toContain("data-rucica");
    expect(attr(prviTag(html.slice(html.indexOf("<li"))), "class")).toContain("cursor-pointer");
  });

  test("a selected row: checked box, marked card", () => {
    const html = prikazReda({ izborAktivan: true, izabran: true, radnje });
    const polje = izborPolje(html);
    expect(polje.stanje).toBe("sve");
    expect(jeOznaceno(polje.input)).toBe(true);
    const li = prviTag(html.slice(html.indexOf("<li")));
    expect(li).toContain(' data-izabran=""');
    expect(attr(li, "class")).toContain("bg-[var(--mp-akcent-meko)]");
  });

  test("the mode needs a way to toggle: without onIzaberi there is no checkbox", () => {
    const html = prikazReda({ izborAktivan: true, radnje: redRadnjeProba({ onRadnja: nista }) });
    expect(html).not.toContain('type="checkbox"');
    expect(jeOnemoguceno(cenaPolje(html))).toBe(true);
  });

  test("with prevlacenje: the li has the drag cursor and there is an aria-hidden handle span, plus the row menu", () => {
    const html = prikazReda({ prevlacenje: true, radnje });
    const li = prviTag(html.slice(html.indexOf("<li")));
    expect(attr(li, "class")).toContain("cursor-grab");
    expect(attr(li, "class")).not.toContain("cursor-pointer");
    const rucica = mora(/<span\b[^>]*\sdata-rucica="([^"]+)"[^>]*>/.exec(html), "no handle");
    expect(rucica[1]).toBe(probniRed.prikazId);
    expect(attr(rucica[0], "aria-hidden")).toBe("true");
    expect(attr(rucica[0], "title")).toBe(fmt(t.dnd.rucica, { naziv: probniRed.artikal.naziv }));
    expect(html).not.toContain('type="checkbox"');
    const meni = mora(/<button\b[^>]*\sdata-meni-reda="([^"]+)"[^>]*>/.exec(html), "no row menu button");
    expect(meni[1]).toBe(probniRed.prikazId);
    expect(attr(meni[0], "aria-label")).toBe(fmt(t.stanjaArtikla.radnje, { naziv: probniRed.artikal.naziv }));
    expect(jeOnemoguceno(cenaPolje(html))).toBe(false);
    expect(count(html, "<button")).toBe(1);
    expect(count(html, "<input")).toBe(1);
  });

  test("without prevlacenje (searching, read-only): no handle and no grab cursor, the menu stays", () => {
    const html = prikazReda({ prevlacenje: false, radnje });
    expect(html).not.toContain("data-rucica");
    expect(attr(prviTag(html.slice(html.indexOf("<li"))), "class")).not.toContain("cursor-grab");
    expect(html).toContain("data-meni-reda");
  });

  test("without onRadnja there is no menu and no handle, also when dragging is on", () => {
    for (const prevlacenje of [true, false]) {
      const html = prikazReda({ prevlacenje, radnje: redRadnjeProba() });
      expect(html).not.toContain("data-rucica");
      expect(html).not.toContain("data-meni-reda");
      expect(html).not.toContain("<button");
      expect(count(html, "<input")).toBe(1);
    }
  });

  test("editing off: the price is disabled, and the menu is there only for the availability right", () => {
    const bezPrava = prikazReda({ mozeUredjivanje: false, radnje });
    expect(jeOnemoguceno(cenaPolje(bezPrava))).toBe(true);
    expect(bezPrava).not.toContain("data-meni-reda");
    const sDostupnoscu = prikazReda({ mozeUredjivanje: false, mozeDostupnost: true, radnje });
    expect(jeOnemoguceno(cenaPolje(sDostupnoscu))).toBe(true);
    expect(sDostupnoscu).toContain("data-meni-reda");
  });

  test("states stay words: a hidden and an unavailable row say so in text", () => {
    const html = prikazReda({ red: { ...probniRed, sakriven: true }, nedostupan: true, radnje });
    expect(html).toContain(`>${esc(t.red.sakriveno)}</span>`);
    expect(html).toContain(`>${esc(t.red.nedostupno)}</span>`);
    expect(prviTag(html.slice(html.indexOf("<li")))).toContain(' data-sakriven=""');
  });

  test("each of the two badges is followed by a small note: hidden says it is a draft, unavailable says guests see it", () => {
    const html = prikazReda({ red: { ...probniRed, sakriven: true }, nedostupan: true, radnje });
    // The badge closes (its label span, then the badge itself), then the note span follows.
    expect(html).toMatch(new RegExp(`${esc(t.red.sakriveno)}</span></span><span class="[^"]*">${esc(t.stanjaArtikla.oznakaNacrt)}</span>`));
    expect(html).toMatch(new RegExp(`${esc(t.red.nedostupno)}</span></span><span class="[^"]*">${esc(t.stanjaArtikla.oznakaUzivo)}</span>`));
    // The two notes say different things (draft versus live).
    expect(t.stanjaArtikla.oznakaNacrt).not.toBe(t.stanjaArtikla.oznakaUzivo);
  });

  test("a note appears only with its own badge", () => {
    const sakriven = prikazReda({ red: { ...probniRed, sakriven: true }, radnje });
    expect(sakriven).toContain(esc(t.stanjaArtikla.oznakaNacrt));
    expect(sakriven).not.toContain(esc(t.stanjaArtikla.oznakaUzivo));
    const nedostupan = prikazReda({ nedostupan: true, radnje });
    expect(nedostupan).toContain(esc(t.stanjaArtikla.oznakaUzivo));
    expect(nedostupan).not.toContain(esc(t.stanjaArtikla.oznakaNacrt));
    const mirno = prikazReda({ radnje });
    expect(mirno).not.toContain(esc(t.stanjaArtikla.oznakaNacrt));
    expect(mirno).not.toContain(esc(t.stanjaArtikla.oznakaUzivo));
  });

  test("a hidden row's text is not dimmed: the badge carries the state, not the opacity", () => {
    const html = prikazReda({ red: { ...probniRed, sakriven: true }, radnje });
    // The text block is the div that holds the name (the one with `flex-1` right before the name paragraph).
    const blok = mora(/<div class="([^"]*)"><p class="[^"]*">Probni artikal<\/p>/.exec(html), "no text block");
    expect(blok[1]).toContain("flex-1");
    expect(blok[1]).not.toContain("opacity");
    // The same class as a quiet row: hiding adds nothing to the text block.
    const mirno = prikazReda({ radnje });
    expect(mora(/<div class="([^"]*)"><p class="[^"]*">Probni artikal<\/p>/.exec(mirno), "no text block")[1]).toBe(blok[1]);
  });
});

describe("SekcijaBlok in Izaberi više", () => {
  const { sadrzaj } = srednjiSadrzaj();
  const sekcija = sadrzaj.sekcije[0];
  const prikaz = (izmene: Partial<ComponentProps<typeof SekcijaBlok>> = {}) =>
    renderToStaticMarkup(
      <SekcijaBlok
        sekcija={sekcija}
        redovi={sekcija.redovi}
        skupljena={false}
        onSkupi={nista}
        nedostupni={new Set<string>()}
        red={new AutosaveRed()}
        mozeUredjivanje
        redRadnje={redRadnjeProba({ onRadnja: nista, onIzaberi: nista })}
        brziUnosOtvoren={false}
        onBrziUnos={nista}
        onDodaj={nikad}
        onDodajPostojeci={nikad}
        onPreimenuj={nikad}
        onObrisi={nista}
        onPremesti={nista}
        prevlacenje
        {...izmene}
      />,
    );
  const ids = sekcija.redovi.map((red) => red.prikazId);

  test("the section checkbox is nista / deo / sve as 0, some and all rows are selected", () => {
    const stanja = [new Set<string>(), new Set([ids[0]]), new Set(ids)].map((izabrani) => {
      const polje = izborPolje(prikaz({ izborAktivan: true, izabrani, onIzaberiSekciju: nista, prevlacenje: false }));
      expect(attr(polje.input, "aria-label")).toBe(fmt(t.izaberiVise.izaberiSekciju, { naziv: sekcija.naziv }));
      return [polje.stanje, jeOznaceno(polje.input), jeOnemoguceno(polje.input)] as const;
    });
    expect(ids.length).toBeGreaterThan(1);
    expect(stanja).toEqual([
      ["nista", false, false],
      ["deo", false, false],
      ["sve", true, false],
    ]);
  });

  test("the rows of the section follow the same selection", () => {
    const html = prikaz({ izborAktivan: true, izabrani: new Set([ids[0]]), onIzaberiSekciju: nista, prevlacenje: false });
    const rows = redovi(html);
    expect(rows).toHaveLength(ids.length);
    expect(rows.map(({ markup }) => jeOznaceno(izborPolje(markup).input))).toEqual(ids.map((_, indeks) => indeks === 0));
  });

  test("an empty section has a disabled checkbox and says it is empty", () => {
    const prazna: StudioSekcija = { ...sekcija, redovi: [] };
    const html = prikaz({ sekcija: prazna, redovi: [], izborAktivan: true, izabrani: new Set(), onIzaberiSekciju: nista, prevlacenje: false });
    const polje = izborPolje(html);
    expect(polje.stanje).toBe("nista");
    expect(jeOnemoguceno(polje.input)).toBe(true);
    expect(html).toContain(`>${esc(t.sekcija.praznaSekcija)}</p>`);
  });

  test("in the mode there is no section menu, handle or quick entry; out of it the handle is back", () => {
    const uModu = prikaz({ izborAktivan: true, izabrani: new Set(), onIzaberiSekciju: nista, prevlacenje: false });
    expect(uModu).not.toContain("data-rucica-sekcije");
    expect(uModu).not.toContain(esc(fmt(t.sekcija.radnje, { naziv: sekcija.naziv })));
    expect(uModu).not.toContain("data-brzi-unos-otvori");
    const bezModa = prikaz();
    expect(bezModa).not.toContain('type="checkbox"');
    expect(bezModa).toContain(`data-rucica-sekcije="${sekcija.key}"`);
    expect(bezModa).toContain(esc(fmt(t.sekcija.radnje, { naziv: sekcija.naziv })));
    expect(bezModa).toContain("data-brzi-unos-otvori");
  });

  test("the section handle exists only when the work area can open Premesti, and only while dragging is on", () => {
    // The menu items sit in a closed Radix menu, so the handle is the visible trace of onPremesti.
    expect(prikaz({ onPremesti: undefined })).not.toContain("data-rucica-sekcije");
    expect(prikaz({ prevlacenje: false })).not.toContain("data-rucica-sekcije");
    expect(prikaz()).toContain("data-rucica-sekcije");
  });
});

// =============================================================================
// 6. TrakaIzbora
// =============================================================================

describe("TrakaIzbora (the bar of Izaberi više)", () => {
  const prikaz = (broj: number, izmene: { mozeUredjivanje?: boolean; mozeDostupnost?: boolean; radi?: boolean } = {}) =>
    renderToStaticMarkup(
      <TrakaIzbora
        broj={broj}
        mozeUredjivanje={izmene.mozeUredjivanje ?? true}
        mozeDostupnost={izmene.mozeDostupnost ?? true}
        radi={izmene.radi ?? false}
        onRadnja={nista}
        onZavrsi={nista}
      />,
    );

  const brojTekst = (html: string) => mora(/<p[^>]*\sdata-izabrano="(\d+)"[^>]*>([^<]*)<\/p>/.exec(html), "no count");
  const zavrsi = esc(t.izaberiVise.zavrsi);

  test("0 selected: it says to choose, every action is disabled, only Završi works", () => {
    const html = prikaz(0);
    expect(brojTekst(html)[1]).toBe("0");
    expect(brojTekst(html)[2]).toBe(esc(t.izaberiVise.nista));
    const { telefon, radna } = grupe(html);
    expect(telefon.map((dugme) => dugme.text)).toEqual([esc(t.izaberiVise.radnje), zavrsi]);
    expect(radna.map((dugme) => dugme.text)).toEqual([
      esc(t.izaberiVise.promeniCene),
      esc(t.izaberiVise.dostupnost),
      esc(t.izaberiVise.raspored),
      esc(t.izaberiVise.vidljivost),
      esc(t.izaberiVise.obrisi),
      zavrsi,
    ]);
    for (const dugme of [...telefon, ...radna]) expect(jeOnemoguceno(dugme.tag)).toBe(dugme.text === zavrsi ? false : true);
    // Disabled menus are plain disabled buttons, not menu triggers.
    expect(html).not.toContain("aria-haspopup");
    // The note about drafts is still shown.
    expect(html).toContain(`>${esc(t.izaberiVise.napomena)}</p>`);
  });

  test("1, 4 and 5 selected use the plural form of the count", () => {
    for (const [n, oblik] of [
      [1, "one"],
      [4, "few"],
      [5, "many"],
    ] as const) {
      expect(brojTekst(prikaz(n))[2]).toBe(esc(fmt(t.izaberiVise.izabrano[oblik], { n })));
    }
  });

  test("with a selection every action is enabled; the menus are triggers", () => {
    const html = prikaz(5);
    const { telefon, radna } = grupe(html);
    for (const dugme of [...telefon, ...radna]) expect(jeOnemoguceno(dugme.tag)).toBe(false);
    const poRadnji = (oznaka: string) =>
      mora(
        dugmad(html).find((dugme) => dugme.tag.includes(`data-izbor-radnja="${oznaka}"`)),
        `no button for ${oznaka}`,
      );
    // Price and delete act at once (a dialog follows); the other groups open a menu.
    for (const oznaka of ["cene", "obrisi"]) expect(attr(poRadnji(oznaka).tag, "aria-haspopup")).toBeUndefined();
    for (const oznaka of ["dostupnost", "raspored", "vidljivost", "sve"]) expect(attr(poRadnji(oznaka).tag, "aria-haspopup")).toBe("menu");
  });

  test("the limit is 200: 200 is fine, 201 shows the limit text, hides the note and disables the actions", () => {
    expect(STUDIO_MAX_IZBOR).toBe(200);
    const uGranici = prikaz(200);
    expect(uGranici).toContain(`>${esc(t.izaberiVise.napomena)}</p>`);
    expect(uGranici).not.toContain(esc(fmt(t.izaberiVise.granica, { n: 200 })));
    for (const dugme of [...grupe(uGranici).telefon, ...grupe(uGranici).radna]) expect(jeOnemoguceno(dugme.tag)).toBe(false);

    const html = prikaz(201);
    expect(brojTekst(html)[1]).toBe("201");
    // 201 ends in 1 but is not 11: the 'one' form.
    expect(brojTekst(html)[2]).toBe(esc(fmt(t.izaberiVise.izabrano.one, { n: 201 })));
    expect(html).toContain(`>${esc(fmt(t.izaberiVise.granica, { n: 200 }))}</p>`);
    expect(html).not.toContain(esc(t.izaberiVise.napomena));
    const { telefon, radna } = grupe(html);
    for (const dugme of [...telefon, ...radna]) expect(jeOnemoguceno(dugme.tag)).toBe(dugme.text === zavrsi ? false : true);
    expect(html).not.toContain("aria-haspopup");
  });

  test("while an action runs (radi) the actions are disabled too", () => {
    const { telefon, radna } = grupe(prikaz(5, { radi: true }));
    for (const dugme of [...telefon, ...radna]) expect(jeOnemoguceno(dugme.tag)).toBe(dugme.text === zavrsi ? false : true);
  });

  test("availability right only (no editing): the availability control and Završi", () => {
    const html = prikaz(3, { mozeUredjivanje: false, mozeDostupnost: true });
    const { telefon, radna } = grupe(html);
    expect(radna.map((dugme) => dugme.text)).toEqual([esc(t.izaberiVise.dostupnost), zavrsi]);
    expect(telefon.map((dugme) => dugme.text)).toEqual([esc(t.izaberiVise.radnje), zavrsi]);
    expect(radna.map((dugme) => jeOnemoguceno(dugme.tag))).toEqual([false, false]);
    for (const nema of [t.izaberiVise.promeniCene, t.izaberiVise.raspored, t.izaberiVise.vidljivost, t.izaberiVise.obrisi]) {
      expect(html).not.toContain(esc(nema));
    }
    expect(html).not.toContain("data-izbor-radnja=\"cene\"");
    expect(html).not.toContain("data-izbor-radnja=\"obrisi\"");
  });

  test("availability right only, nothing selected: the availability control is disabled", () => {
    const { radna } = grupe(prikaz(0, { mozeUredjivanje: false, mozeDostupnost: true }));
    expect(radna.map((dugme) => [dugme.text, jeOnemoguceno(dugme.tag)])).toEqual([
      [esc(t.izaberiVise.dostupnost), true],
      [zavrsi, false],
    ]);
  });

  test("editing right only: no availability control", () => {
    const html = prikaz(3, { mozeUredjivanje: true, mozeDostupnost: false });
    expect(grupe(html).radna.map((dugme) => dugme.text)).toEqual([
      esc(t.izaberiVise.promeniCene),
      esc(t.izaberiVise.raspored),
      esc(t.izaberiVise.vidljivost),
      esc(t.izaberiVise.obrisi),
      zavrsi,
    ]);
    expect(html).not.toContain(`data-izbor-radnja="dostupnost"`);
  });

  test("the bar's groups are named and the count is a polite status", () => {
    const html = prikaz(2);
    expect(count(html, `role="group" aria-label="${esc(t.izaberiVise.traka)}"`)).toBe(2);
    const status = mora(/<p role="status" aria-live="polite"[^>]*\sdata-izabrano="2"[^>]*>/.exec(html), "the count is not a polite status");
    expect(status[0]).toBeTruthy();
  });
});

// =============================================================================
// 6b. The rights of the person, in the whole editor
// =============================================================================

describe("the editor by rights (mozeUredjivanje, mozeDostupnost)", () => {
  // Never called in a server render; if one runs, the test says which.
  const radnje = new Proxy(
    {},
    {
      get: (_cilj, ime) => () => {
        throw new Error(`StudioRadnje.${String(ime)} must not run in a server render`);
      },
    },
  ) as StudioRadnje;
  const { sadrzaj, sviRedovi, stranice, nedostupni } = srednjiSadrzaj();

  /** The work area for a person with these rights; `izbor` opens Izaberi više with those rows selected. */
  function prikaz(prava: Partial<StudioKontekst>, izbor?: readonly string[]): string {
    const podaci: StudioPodaci = {
      kontekst: {
        lokal: "Demo restoran",
        slug: "demo-restoran",
        rezim: "hospitality",
        actor: "owner",
        mozeUredjivanje: true,
        mozeObjavu: true,
        mozeDostupnost: true,
        plan: "standard",
        roomService: false,
        ...prava,
      },
      stranice,
      sadrzaj,
      status: { stanje: "clean", objavljenaVerzija: 7, objavljenoU: IZLOG_SADA - 3 * 3_600_000 },
      nedostupni,
      povezano: true,
    };
    return radniProstor(
      renderToStaticMarkup(
        <StudioEditor
          podaci={podaci}
          radnje={radnje}
          izabranaStranica={null}
          onIzaberiStranicu={nista}
          pocetno={izbor ? { ponuda: { izbor } } : {}}
        />,
      ),
    );
  }

  const prvaDva = sviRedovi.slice(0, 2).map((red) => red.prikazId);

  test("editing and availability: handles, row menus, section menus, + Dodaj and Izaberi više", () => {
    const radni = prikaz({});
    expect(redovi(radni)).toHaveLength(sviRedovi.length);
    expect(count(radni, " data-meni-reda=")).toBe(sviRedovi.length);
    expect(count(radni, " data-rucica=")).toBe(sviRedovi.length);
    expect(count(radni, " data-rucica-sekcije=")).toBe(sadrzaj.sekcije.length);
    expect(radni).toContain(" data-dodaj=");
    expect(attr(dugmeSaOznakom(radni, "data-izaberi-vise").tag, "aria-pressed")).toBe("false");
  });

  test("availability only: a row menu on every row (no handles), Izaberi više, and nothing that edits", () => {
    const radni = prikaz({ mozeUredjivanje: false });
    const naStrani = redovi(radni);
    expect(naStrani).toHaveLength(sviRedovi.length);
    for (const { markup } of naStrani) {
      expect(count(markup, " data-meni-reda=")).toBe(1);
      expect(count(markup, "<button")).toBe(1);
      expect(jeOnemoguceno(cenaPolje(markup))).toBe(true);
    }
    expect(radni).not.toContain("data-rucica");
    expect(radni).not.toContain("data-brzi-unos-otvori");
    expect(radni).not.toContain(" data-dodaj=");
    for (const sekcija of sadrzaj.sekcije) expect(radni).not.toContain(esc(fmt(t.sekcija.radnje, { naziv: sekcija.naziv })));
    expect(attr(dugmeSaOznakom(radni, "data-izaberi-vise").tag, "aria-pressed")).toBe("false");
  });

  test("no rights: no row menu, no handle and no Izaberi više", () => {
    const radni = prikaz({ mozeUredjivanje: false, mozeDostupnost: false });
    const naStrani = redovi(radni);
    expect(naStrani).toHaveLength(sviRedovi.length);
    for (const { markup } of naStrani) {
      expect(count(markup, "<button")).toBe(0);
      expect(jeOnemoguceno(cenaPolje(markup))).toBe(true);
    }
    expect(radni).not.toContain("data-meni-reda");
    expect(radni).not.toContain("data-rucica");
    expect(radni).not.toContain("data-izaberi-vise");
    expect(radni).not.toContain("type=\"checkbox\"");
  });

  test("editing without availability: row menus and Izaberi više stay (the menu just has no availability item)", () => {
    const radni = prikaz({ mozeDostupnost: false });
    expect(count(radni, " data-meni-reda=")).toBe(sviRedovi.length);
    expect(count(radni, " data-rucica=")).toBe(sviRedovi.length);
    expect(radni).toContain("data-izaberi-vise");
  });

  test("Izaberi više with the availability right only: the bar has the availability control and Završi", () => {
    const radni = prikaz({ mozeUredjivanje: false }, prvaDva);
    expect(attr(dugmeSaOznakom(radni, "data-izaberi-vise").tag, "aria-pressed")).toBe("true");
    expect(count(radni, 'type="checkbox"')).toBe(sviRedovi.length + sadrzaj.sekcije.length);
    const traka = radni.slice(radni.indexOf("<div data-traka-izbora="));
    expect(mora(/<p[^>]*\sdata-izabrano="(\d+)"[^>]*>([^<]*)<\/p>/.exec(traka), "no count")[2]).toBe(esc(fmt(t.izaberiVise.izabrano.few, { n: 2 })));
    const { telefon, radna } = grupe(traka);
    expect(radna.map((dugme) => dugme.text)).toEqual([esc(t.izaberiVise.dostupnost), esc(t.izaberiVise.zavrsi)]);
    expect(telefon.map((dugme) => dugme.text)).toEqual([esc(t.izaberiVise.radnje), esc(t.izaberiVise.zavrsi)]);
    expect(radna.map((dugme) => jeOnemoguceno(dugme.tag))).toEqual([false, false]);
    for (const { markup } of redovi(radni)) expect(jeOnemoguceno(cenaPolje(markup))).toBe(true);
  });

  test("Izaberi više with both rights: the bar has every group", () => {
    const radni = prikaz({}, prvaDva);
    const { radna } = grupe(radni.slice(radni.indexOf("<div data-traka-izbora=")));
    expect(radna.map((dugme) => dugme.text)).toEqual([
      esc(t.izaberiVise.promeniCene),
      esc(t.izaberiVise.dostupnost),
      esc(t.izaberiVise.raspored),
      esc(t.izaberiVise.vidljivost),
      esc(t.izaberiVise.obrisi),
      esc(t.izaberiVise.zavrsi),
    ]);
    expect(radni.match(/\sdata-izabran=""/g) ?? []).toHaveLength(2);
  });
});

// =============================================================================
// 7. UticajArtikla (the consequences of a deletion)
// =============================================================================

describe("UticajArtikla", () => {
  // Invented article and page names; the default page name comes from the dictionary.
  const osnova: StudioUticajArtikla = {
    artikalId: "ar_probni",
    naziv: "Probni artikal",
    vrsta: "item",
    stranice: [],
    kombo: [],
    varijante: 0,
    roomService: false,
  };
  const prikaz = (izmene: Partial<StudioUticajArtikla> = {}) => renderToStaticMarkup(<ul><UticajArtikla artikal={{ ...osnova, ...izmene }} /></ul>);
  const pasusi = (html: string) => [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => match[1]);
  // A plain item that is no combo's ingredient says so in a line of its own.
  const bezKomba = esc(t.brisanje.bezKomba);

  test("the pages that show the article are listed, an archived one with its own wording", () => {
    const html = prikaz({
      stranice: [
        { naziv: menuDomenSr.defaultPageName, arhivirana: false, prikaza: 1 },
        { naziv: "Stara karta", arhivirana: true, prikaza: 2 },
      ],
    });
    const lista = `${menuDomenSr.defaultPageName}, ${fmt(t.brisanje.arhivirana, { naziv: "Stara karta" })}`;
    expect(pasusi(html)).toEqual([esc(osnova.naziv), esc(fmt(t.brisanje.stranice, { lista })), bezKomba]);
    expect(html).toContain(' data-uticaj="ar_probni"');
    expect(html).not.toContain(esc(t.brisanje.nijednaStranica));
  });

  test("a name with markup characters is escaped", () => {
    const html = prikaz({ naziv: 'Hleb & "so" <b>', stranice: [{ naziv: "Karta <1>", arhivirana: false, prikaza: 1 }] });
    expect(html).not.toContain("<b>");
    expect(pasusi(html)).toEqual([esc('Hleb & "so" <b>'), esc(fmt(t.brisanje.stranice, { lista: "Karta <1>" })), bezKomba]);
  });

  test("an article on no page says so and has no 'Stranice:' line", () => {
    const html = prikaz({ stranice: [] });
    expect(pasusi(html)).toEqual([esc(osnova.naziv), esc(t.brisanje.nijednaStranica), bezKomba]);
    expect(html).not.toContain(esc(fmt(t.brisanje.stranice, { lista: "" }).trim()));
  });

  test("one combo that loses it uses the singular line, several the plural line, each in its own marked line", () => {
    const stranice = [{ naziv: menuDomenSr.defaultPageName, arhivirana: false, prikaza: 1 }];
    const jedan = prikaz({ stranice, kombo: ["Doručak"] });
    const kombo = mora(/<p[^>]*\sdata-uticaj-kombo=""[^>]*>([^<]*)<\/p>/.exec(jedan), "no combo line");
    expect(kombo[1]).toBe(esc(fmt(t.brisanje.komboJedan, { lista: "Doručak" })));

    const vise = prikaz({ stranice, kombo: ["Doručak", "Ručak za dvoje"] });
    const komboVise = mora(/<p[^>]*\sdata-uticaj-kombo=""[^>]*>([^<]*)<\/p>/.exec(vise), "no combo line");
    expect(komboVise[1]).toBe(esc(fmt(t.brisanje.komboVise, { lista: "Doručak, Ručak za dvoje" })));
    // The two lines differ in number: one combo "loses", several "lose".
    expect(t.brisanje.komboJedan).not.toBe(t.brisanje.komboVise);
    // A combo line replaces the 'not an ingredient' line.
    for (const html of [jedan, vise]) {
      expect(html).not.toContain(bezKomba);
      expect(count(html, "data-uticaj-kombo")).toBe(1);
    }
  });

  test("an item that is no ingredient of any combo says so, in a line without the combo marker", () => {
    const html = prikaz();
    expect(pasusi(html)).toContain(bezKomba);
    expect(html).not.toContain("data-uticaj-kombo");
    expect(count(html, bezKomba)).toBe(1);
  });

  test("a combo article itself has no such line (it is not an ingredient to lose)", () => {
    const html = prikaz({ vrsta: "combo", stranice: [{ naziv: menuDomenSr.defaultPageName, arhivirana: false, prikaza: 1 }] });
    expect(html).not.toContain(bezKomba);
    expect(html).not.toContain("data-uticaj-kombo");
    expect(pasusi(html)).toEqual([esc(osnova.naziv), esc(fmt(t.brisanje.stranice, { lista: menuDomenSr.defaultPageName }))]);
  });

  test("variants take the plural form: 1, 3 and 5", () => {
    for (const [n, oblik] of [
      [1, "one"],
      [3, "few"],
      [5, "many"],
    ] as const) {
      expect(pasusi(prikaz({ varijante: n }))).toContain(esc(fmt(t.brisanje.varijante[oblik], { n })));
    }
    // No variants: no line (name, pages and the 'no combo' line remain).
    expect(pasusi(prikaz({ varijante: 0 }))).toHaveLength(3);
    expect(pasusi(prikaz({ varijante: 0, vrsta: "combo" }))).toHaveLength(2);
  });

  test("a Room service line appears only for an article that is in Room service", () => {
    expect(pasusi(prikaz({ roomService: true }))).toContain(esc(t.brisanje.roomService));
    expect(prikaz({ roomService: false })).not.toContain(esc(t.brisanje.roomService));
  });

  test("everything at once: name, pages, combo, variants, Room service, in that order", () => {
    const html = prikaz({
      stranice: [{ naziv: menuDomenSr.defaultPageName, arhivirana: false, prikaza: 1 }],
      kombo: ["Doručak"],
      varijante: 2,
      roomService: true,
    });
    expect(pasusi(html)).toEqual([
      esc(osnova.naziv),
      esc(fmt(t.brisanje.stranice, { lista: menuDomenSr.defaultPageName })),
      esc(fmt(t.brisanje.komboJedan, { lista: "Doručak" })),
      esc(fmt(t.brisanje.varijante.few, { n: 2 })),
      esc(t.brisanje.roomService),
    ]);
  });
});

// =============================================================================
// 8. No icon in the handle and the row menu
// =============================================================================

describe("article rows carry no icon for the handle and the menu (they are CSS dots)", () => {
  for (const [naziv, upit] of [
    ["default", {}],
    ["stanje=veliki", { stanje: "veliki" }],
  ] as const) {
    test(`${naziv}: an svg in a row is only a status icon, none in the handle or the menu button`, () => {
      const naStrani = redovi(radniProstor(izlog(upit)));
      expect(naStrani.length).toBeGreaterThan(0);
      let bezOznaka = 0;
      for (const { markup } of naStrani) {
        const oznake = count(markup, " data-status-ton=");
        // Each status label carries exactly one icon; nothing else in the row is an svg.
        expect(count(markup, "<svg")).toBe(oznake);
        if (oznake === 0) bezOznaka += 1;

        const meni = mora(/<button\b[^>]*\sdata-meni-reda="[^"]+"[^>]*>([\s\S]*?)<\/button>/.exec(markup), "no row menu button");
        expect(meni[1]).not.toContain("<svg");
        expect(meni[1]).toMatch(/^<span aria-hidden="true" class="[^"]*"><\/span>$/);

        const rucica = mora(/<span\b[^>]*\sdata-rucica="[^"]+"[^>]*>([\s\S]*?)<\/span>/.exec(markup), "no handle");
        expect(rucica[1]).toBe("");
      }
      // The menu itself (a closed portal) is not in the row either, so a plain row has no svg at all.
      expect(bezOznaka).toBeGreaterThan(0);
      const jednostavan = mora(
        naStrani.find(({ markup }) => !markup.includes(" data-status-ton=")),
        "no plain row",
      );
      expect(count(jednostavan.markup, "<svg")).toBe(0);
    });
  }

  test("stanje=veliki: no row has more icons than status labels, over the whole page", () => {
    const naStrani = redovi(radniProstor(izlog({ stanje: "veliki" })));
    expect(naStrani.length).toBeGreaterThanOrEqual(400);
    const viska = naStrani.filter(({ markup }) => count(markup, "<svg") !== count(markup, " data-status-ton="));
    expect(viska.map((red) => red.key)).toEqual([]);
  });
});
