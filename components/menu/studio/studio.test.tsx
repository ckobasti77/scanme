// K10 render tests: the real editor (StudioEditor) in the izlog (EditorIzlog) and
// on its own. Server markup only (renderToStaticMarkup, no DOM): useSirina()
// answers "desktop" on the server, so the three-column layout is what renders,
// and the Radix menus and dialogs are closed (their portals render nothing).
// Texts come from the dictionaries, never typed in Serbian here; the only
// literals are fixture facts (an invented venue), each marked where it is used.

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { DARK_MENU_DESIGN } from "@/components/menu/menu-fixtures";
import { DEFAULT_MENU_DESIGN } from "@/lib/design-engine/menu-tokens";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parseEditorPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import type { StanjePolja } from "@/lib/menu/studio/autosave-queue";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type {
  StudioKontekst,
  StudioPodaci,
  StudioRadnje,
  StudioRadniSadrzaj,
  StudioRed,
} from "@/lib/menu/studio/model";
import { STUDIO_SKUPLJENO_PREKO } from "./ponuda/radni-prostor";
import { brojArtikalaTekst } from "./ponuda/sekcija-blok";
import { RedArtikla, type RedRadnje } from "./red-artikla/red-artikla";
import { StudioEditor } from "./studio-editor";

// Nothing in the editor uses next/link; the stub keeps the file independent of
// the global one, as the other izlog render tests do.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

const t = menuStudioSr;
const z = menuZajednickoSr;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in panel-izlog.test.tsx)
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
/** Element openings (`<div`, `<path`, ...): the size of the DOM the markup would build. */
const elementi = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;
const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();

/** The opening tag at the start of a piece of markup. */
const prviTag = (markup: string) => markup.slice(0, markup.indexOf(">") + 1);

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

const jeOnemoguceno = (tag: string) => /\sdisabled=""/.test(tag);

function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
}

type Dugme = { tag: string; text: string };

/** Every <button> with its opening tag and its text. */
const dugmad = (html: string): Dugme[] =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => ({
    tag: prviTag(match[0]),
    text: bezTagova(match[1]),
  }));

/** The one <button> carrying a data marker such as `data-dodaj`. */
function dugmeSaOznakom(html: string, oznaka: string): Dugme {
  const match = new RegExp(`<button\\b[^>]*\\s${oznaka}=""[^>]*>([\\s\\S]*?)</button>`).exec(html);
  if (!match) throw new Error(`no <button ${oznaka}> in the markup`);
  return { tag: prviTag(match[0]), text: bezTagova(match[1]) };
}

const brojDugmadSaOznakom = (html: string, oznaka: string) => count(html, ` ${oznaka}=""`);

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

type SekcijaMarkup = { key: string; markup: string };

/** The section cards of the work area (the preview has its own sections, without data-sekcija). */
const sekcije = (html: string): SekcijaMarkup[] =>
  [...html.matchAll(/<section\b[^>]*\sdata-sekcija="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map((match) => ({
    key: match[1],
    markup: match[0],
  }));

/** The body of a section card: its opening tag and everything after it. */
function teloSekcije(sekcija: string): { tag: string; sadrzaj: string } {
  const dugme = /<button\b[^>]*\saria-controls="([^"]+)"[^>]*>/.exec(sekcija);
  if (!dugme) throw new Error("the section has no toggle button");
  const telo = new RegExp(`<div\\b[^>]*\\sid="${dugme[1]}"[^>]*>`).exec(sekcija);
  if (!telo) throw new Error(`no body with id ${dugme[1]}`);
  return { tag: telo[0], sadrzaj: sekcija.slice(telo.index + telo[0].length) };
}

/** The style attribute of the preview's root, which holds the --menu-* tokens. */
function pregledStil(html: string): string {
  const start = html.indexOf("data-pregled-sadrzaj");
  if (start < 0) throw new Error("no preview body in the markup");
  const match = /<div\b[^>]*\sstyle="([^"]*)"/.exec(html.slice(start));
  if (!match) throw new Error("the preview body has no style attribute");
  return unesc(match[1]);
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

// -----------------------------------------------------------------------------
// The editor on its own (read-only, and synthetic content for the 60-article rule)
// -----------------------------------------------------------------------------

// Never called in a server render; if one runs, the test says which.
const radnje = new Proxy(
  {},
  {
    get: (_cilj, ime) => () => {
      throw new Error(`StudioRadnje.${String(ime)} must not run in a server render`);
    },
  },
) as StudioRadnje;

function kontekst(izmene: Partial<StudioKontekst> = {}): StudioKontekst {
  return {
    lokal: "Demo restoran",
    slug: "demo-restoran",
    rezim: "hospitality",
    actor: "owner",
    mozeUredjivanje: true,
    mozeObjavu: true,
    mozeDostupnost: true,
    plan: "standard",
    roomService: false,
    ...izmene,
  };
}

function renderStudio(podaci: StudioPodaci): string {
  return renderToStaticMarkup(
    <StudioEditor podaci={podaci} radnje={radnje} izabranaStranica={null} onIzaberiStranicu={() => undefined} />,
  );
}

/** The medium fixture menu: its page column, the work area of the main page and the unavailable keys. */
function srednjiMeni() {
  const meni = fixtureMenu("srednji");
  const glavna = meni.snapshot.pages.find((page) => page.isDefault);
  if (!glavna) throw new Error("the fixture has no main page");
  const sadrzaj = sadrzajIzSnapshota(meni.snapshot, glavna.key);
  if (!sadrzaj) throw new Error("the main page has no content");
  return {
    meni,
    sadrzaj,
    stranice: straniceIzSnapshota(meni.snapshot, new Set([glavna.key])),
    nedostupni: new Set(meni.unavailableArticleKeys),
  };
}

function srednjiPodaci(izmene: Partial<StudioKontekst>): StudioPodaci {
  const { sadrzaj, stranice, nedostupni } = srednjiMeni();
  return {
    kontekst: kontekst(izmene),
    stranice,
    sadrzaj,
    status: { stanje: "clean", objavljenaVerzija: 7, objavljenoU: IZLOG_SADA - 3 * 3_600_000 },
    nedostupni,
    povezano: true,
  };
}

/** A page with the given numbers of articles per section, all named and priced the same simple way. */
function sinteticki(velicine: readonly number[]): StudioPodaci {
  const sadrzaj: StudioRadniSadrzaj = {
    stranica: { id: "pg_probe", key: "pg_probe", naziv: menuDomenSr.defaultPageName, podrazumevana: true, arhivirana: false },
    skraceno: false,
    sekcije: velicine.map((broj, s) => ({
      id: `sc_${s}`,
      key: `sc_${s}`,
      naziv: `Sekcija ${s + 1}`,
      redosled: s,
      redovi: Array.from({ length: broj }, (_, r) => ({
        prikazId: `sc_${s}/ar_${s}_${r}`,
        redosled: r,
        sakriven: false,
        artikal: {
          id: `ar_${s}_${r}`,
          key: `ar_${s}_${r}`,
          vrsta: "item" as const,
          naziv: `Artikal ${s + 1}-${r + 1}`,
          opis: null,
          cena: 100 + r,
          kolicina: null,
          jedinica: null,
          medij: "none" as const,
          ikonica: null,
          varijante: false,
          proveriCenu: false,
        },
      })),
    })),
  };
  return {
    kontekst: kontekst(),
    stranice: [
      {
        id: "pg_probe",
        key: "pg_probe",
        slug: "kompletan-meni",
        naziv: menuDomenSr.defaultPageName,
        podrazumevana: true,
        arhivirana: false,
        sakrivena: false,
        imaQr: false,
        brojPrikaza: velicine.reduce((a, b) => a + b, 0),
      },
    ],
    sadrzaj,
    status: { stanje: "clean", objavljenaVerzija: 1, objavljenoU: IZLOG_SADA },
    nedostupni: new Set<string>(),
    povezano: true,
  };
}

// =============================================================================
// 1. The default editor
// =============================================================================

describe("the default editor (parseEditorPreview({}))", () => {
  const html = izlog({});
  const { sadrzaj, stranice } = srednjiMeni();

  test("is the desktop three-column layout", () => {
    expect(html).toContain('data-studio="desktop"');
    expect(html).not.toContain('data-studio="telefon"');
    expect(count(html, "<aside")).toBe(2);
  });

  test("has exactly one h1, the default page name", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(menuDomenSr.defaultPageName)]);
  });

  test("the page column lists Kompletan meni first, then the wine list", () => {
    const kolona = /<nav\b[^>]*data-stranice-kolona=""[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0];
    expect(kolona).toBeDefined();
    expect(naslovi(kolona ?? "", 2)).toEqual([esc(t.stranice.naslov)]);
    const stavke = [...(kolona ?? "").matchAll(/<li\b[^>]*\sdata-stranica="([^"]+)"[^>]*>[\s\S]*?<\/li>/g)].map((match) => ({
      key: match[1],
      markup: match[0],
      tekstovi: [...match[0].matchAll(/<span\b[^>]*>([^<]*)<\/span>/g)].map((span) => span[1]),
    }));
    expect(stavke.map((stavka) => stavka.key)).toEqual(stranice.map((stranica) => stranica.key));
    expect(stavke.map((stavka) => stavka.tekstovi[0])).toEqual(stranice.map((stranica) => esc(stranica.naziv)));
    // Fixture facts: the invented venue has these two pages.
    expect(stavke).toHaveLength(2);
    expect(stavke[0].tekstovi[0]).toBe(esc(menuDomenSr.defaultPageName));
    expect(stavke[1].tekstovi[0]).toBe("Vinska karta");
    // The open page is marked for assistive technology, and only it.
    expect(count(kolona ?? "", 'aria-current="page"')).toBe(1);
    expect(attr(prviTag(/<button\b[^>]*aria-current="page"[^>]*>/.exec(stavke[0].markup)?.[0] ?? ""), "aria-current")).toBe("page");
  });

  test("the main page row shows the QR mark, because the izlog links a QR card to it", () => {
    const [glavna, druga] = [...html.matchAll(/<li\b[^>]*\sdata-stranica="[^"]+"[^>]*>[\s\S]*?<\/li>/g)].map((match) => match[0]);
    expect(glavna).toContain(`<span class="sr-only">, ${esc(t.stranice.imaQr)}</span>`);
    expect(druga).not.toContain(esc(t.stranice.imaQr));
    expect(count(html, esc(t.stranice.imaQr))).toBe(1);
  });

  test("the header has the tabs Ponuda and Izgled, Ponuda selected", () => {
    const tabovi = [...html.matchAll(/<button\b[^>]*\srole="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((match) => ({
      tag: prviTag(match[0]),
      text: bezTagova(match[1]),
    }));
    expect(tabovi.map((tab) => tab.text)).toEqual([esc(t.zaglavlje.ponuda), esc(t.zaglavlje.izgled)]);
    expect(tabovi.map((tab) => attr(tab.tag, "aria-selected"))).toEqual(["true", "false"]);
    expect(html).toContain(`role="tablist" aria-label="${esc(t.zaglavlje.rezimi)}"`);
  });

  test("the header has Pregled and Objavi, both usable for an owner", () => {
    const pregled = dugmeSaOznakom(html, "data-pregled-dugme");
    expect(pregled.text).toBe(esc(t.zaglavlje.pregled));
    expect(jeOnemoguceno(pregled.tag)).toBe(false);
    const objavi = dugmeSaOznakom(html, "data-objavi");
    expect(objavi.text).toBe(esc(t.zaglavlje.objavi));
    expect(jeOnemoguceno(objavi.tag)).toBe(false);
    expect(attr(objavi.tag, "title")).toBeUndefined();
  });

  test("the publish seam shows the published version 7 and no unpublished changes", () => {
    expect(html).toContain(`role="group" aria-label="${esc(z.objava.oznaka)}"`);
    expect(count(html, 'role="group" aria-label="' + esc(z.objava.oznaka) + '"')).toBe(1);
    expect(html).toContain(`>${esc(fmt(z.objava.objavljeno, { broj: 7 }))}</span>`);
    expect(html).toContain('data-sav-objave="cisto"');
    expect(html).toContain(`<span>${esc(z.objava.bezIzmena)}</span>`);
    expect(html).toContain('data-cuvanje="sacuvano"');
    expect(html).not.toContain(esc(z.objava.nikadObjavljeno));
  });

  test("+ Dodaj is there, once", () => {
    const dodaj = dugmeSaOznakom(html, "data-dodaj");
    expect(dodaj.text).toBe(esc(t.ponuda.dodaj));
    expect(brojDugmadSaOznakom(html, "data-dodaj")).toBe(1);
    expect(attr(dodaj.tag, "aria-haspopup")).toBe("menu");
    expect(jeOnemoguceno(dodaj.tag)).toBe(false);
  });

  test("the page says its price rule and has a search", () => {
    expect(html).toContain(`>${esc(t.stranice.podrazumevana)}</p>`);
    expect(html).toContain(`<span class="sr-only">${esc(t.ponuda.pretraga)}</span>`);
    expect(html).toContain(`placeholder="${esc(t.ponuda.pretraga)}"`);
  });

  test("the work area lists the sections of the page in order", () => {
    expect(sekcije(html).map((sekcija) => sekcija.key)).toEqual(sadrzaj.sekcije.map((sekcija) => sekcija.key));
    expect(redovi(html).map((red) => red.key)).toEqual(
      sadrzaj.sekcije.flatMap((sekcija) => sekcija.redovi.map((red) => red.artikal.key)),
    );
  });

  test("on Standard there is no Posebne usluge and no Room service", () => {
    expect(html).not.toContain(esc(t.stranice.posebneUsluge));
    expect(html).not.toContain("data-room-service");
  });

  test("on Premium the Posebne usluge heading and the Room service button appear", () => {
    const premium = izlog({ plan: "premium" });
    expect(naslovi(premium, 3)).toContain(esc(t.stranice.posebneUsluge));
    const room = dugmeSaOznakom(premium, "data-room-service");
    expect(room.text).toBe(esc(t.stranice.roomService));
    // It is a button of its own, not one of the pages.
    expect(count(premium, "data-stranica=")).toBe(count(html, "data-stranica="));
    expect(premium).toContain('aria-labelledby="studio-posebne-usluge"');
  });
});

// =============================================================================
// 2. Article rows and the shared price
// =============================================================================

describe("article rows", () => {
  const html = izlog({});
  const { sadrzaj } = srednjiMeni();
  const sviRedovi = sadrzaj.sekcije.flatMap((sekcija) => sekcija.redovi);

  test("every article has a row with its price input", () => {
    const naStrani = redovi(html);
    expect(naStrani).toHaveLength(sviRedovi.length);
    expect(count(html, ' data-cena-polje=""')).toBe(sviRedovi.length);
    expect(naStrani.map((red) => red.key)).toEqual(sviRedovi.map((red) => red.artikal.key));
  });

  test("each price input is named after its article, numeric and editable", () => {
    for (const { key, markup } of redovi(html)) {
      const red = sviRedovi.find((kandidat) => kandidat.artikal.key === key);
      if (!red) throw new Error(`no fixture row for ${key}`);
      const polje = cenaPolje(markup);
      expect(attr(polje, "aria-label")).toBe(fmt(t.red.cena, { naziv: red.artikal.naziv }));
      expect(attr(polje, "inputMode")).toBe("numeric");
      expect(attr(polje, "type")).toBe("text");
      expect(jeOnemoguceno(polje)).toBe(false);
      expect(attr(polje, "value")).toBe(red.artikal.cena === null ? "" : sTackom(red.artikal.cena));
      // The name is shown in the row too.
      expect(markup).toContain(`>${esc(red.artikal.naziv)}</p>`);
    }
  });

  test("a price from a thousand up has its thousands dot: Daska sa mezetom is 1.450", () => {
    // Fixture facts: the invented venue's board costs 1450 dinars.
    const daska = sviRedovi.find((red) => red.artikal.naziv === "Daska sa mezetom");
    expect(daska?.artikal.cena).toBe(1450);
    const markup = redovi(html).find((red) => red.key === daska?.artikal.key)?.markup ?? "";
    const polje = cenaPolje(markup);
    expect(attr(polje, "value")).toBe("1.450");
    expect(attr(polje, "aria-label")).toBe(fmt(t.red.cena, { naziv: "Daska sa mezetom" }));
    // The currency sits beside the field as a decorative label.
    expect(markup).toContain(`<span aria-hidden="true" class="`);
    expect(markup).toContain(`>${esc(t.red.rsd)}</span>`);
  });

  test("a quiet row has no message and no status mark", () => {
    for (const { markup } of redovi(html)) {
      expect(markup).not.toContain('role="alert"');
      expect(attr(cenaPolje(markup), "aria-invalid")).toBeUndefined();
      expect(markup).toContain('data-cena-stanje="mirno"');
    }
  });

  test("no price input is shared by two rows (ids are unique)", () => {
    const idovi = redovi(html).map((red) => attr(cenaPolje(red.markup), "id"));
    expect(new Set(idovi).size).toBe(idovi.length);
  });
});

// =============================================================================
// 3. Sections
// =============================================================================

describe("sections", () => {
  const html = izlog({});
  const { sadrzaj } = srednjiMeni();

  test("each section is a <section> named by its own h2, open, with its article count", () => {
    const naStrani = sekcije(html);
    expect(naStrani).toHaveLength(sadrzaj.sekcije.length);
    for (const [indeks, { markup }] of naStrani.entries()) {
      const ocekivana = sadrzaj.sekcije[indeks];
      const naslov = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/.exec(markup);
      expect(naslov).not.toBeNull();
      expect(count(markup, "<h2")).toBe(1);
      expect(attr(prviTag(markup), "aria-labelledby")).toBe(attr(`<h2${naslov?.[1] ?? ""}>`, "id"));
      expect(bezTagova(naslov?.[2] ?? "")).toBe(`${esc(ocekivana.naziv)} ${esc(brojArtikalaTekst(ocekivana.redovi.length))}`);
      const dugme = /<button\b[^>]*\saria-controls="[^"]+"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(attr(dugme, "aria-expanded")).toBe("true");
      expect(jeOnemoguceno(dugme)).toBe(false);
      const telo = teloSekcije(markup);
      expect(/\shidden=""/.test(telo.tag)).toBe(false);
    }
  });

  test("each section offers Dodaj stavku u ovu kategoriju, inside its own body", () => {
    expect(brojDugmadSaOznakom(html, "data-brzi-unos-otvori")).toBe(sadrzaj.sekcije.length);
    for (const { markup } of sekcije(html)) {
      const dugme = dugmeSaOznakom(markup, "data-brzi-unos-otvori");
      expect(dugme.text).toBe(esc(t.brziUnos.dodajStavku));
      expect(jeOnemoguceno(dugme.tag)).toBe(false);
      expect(teloSekcije(markup).sadrzaj).toContain("data-brzi-unos-otvori");
    }
  });

  test("each section has the action menu named after it", () => {
    for (const [indeks, { markup }] of sekcije(html).entries()) {
      const ime = fmt(t.sekcija.radnje, { naziv: sadrzaj.sekcije[indeks].naziv });
      expect(markup).toContain(`aria-label="${esc(ime)}"`);
    }
  });

  test("quick entry is closed: no open form", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain("data-brzi-unos=");
  });
});

// =============================================================================
// 4. An empty menu
// =============================================================================

describe("stanje=prazno", () => {
  const html = izlog({ stanje: "prazno" });

  test("shows the empty state with the way to the first section", () => {
    expect(naslovi(html, 2)).toContain(esc(t.ponuda.praznoNaslov));
    expect(html).toContain(`>${esc(t.ponuda.praznoOpis)}</p>`);
    expect(dugmad(html).map((dugme) => dugme.text)).toContain(esc(t.ponuda.prvaSekcija));
    expect(dugmad(html).map((dugme) => dugme.text)).toContain(esc(t.ponuda.brzoVise));
  });

  test("has no sections, no article rows and no quick entry", () => {
    expect(redovi(html)).toHaveLength(0);
    expect(sekcije(html)).toHaveLength(0);
    expect(html).not.toContain("data-red-artikla");
    expect(html).not.toContain("data-cena-polje");
    expect(html).not.toContain("data-brzi-unos-otvori");
  });

  test("still has one h1 (the main page) and + Dodaj", () => {
    expect(naslovi(html, 1)).toEqual([esc(menuDomenSr.defaultPageName)]);
    expect(brojDugmadSaOznakom(html, "data-dodaj")).toBe(1);
  });

  test("says the menu was never published", () => {
    expect(html).toContain(`>${esc(z.objava.nikadObjavljeno)}</span>`);
    expect(html).toContain(esc(z.objava.gostiNeVide));
    expect(html).not.toContain(esc(fmt(z.objava.objavljeno, { broj: 7 })));
  });

  test("has only the main page, no QR mark, and an empty preview", () => {
    expect(count(html, "data-stranica=")).toBe(1);
    expect(html).not.toContain(esc(t.stranice.imaQr));
    expect(html).toContain(esc(t.pregled.prazno));
    expect(html).not.toContain("data-pregled-sadrzaj");
  });

  test("state=empty (the older query) gives the same markup", () => {
    expect(izlog({ state: "empty" })).toBe(html);
  });
});

// =============================================================================
// 5. A large menu
// =============================================================================

describe("stanje=veliki", () => {
  const html = izlog({ stanje: "veliki" });
  const meni = fixtureMenu("veliki");
  const glavna = meni.snapshot.pages.find((page) => page.isDefault);
  const sadrzaj = glavna ? sadrzajIzSnapshota(meni.snapshot, glavna.key) : null;

  test("is a page of about four hundred articles", () => {
    expect(sadrzaj).not.toBeNull();
    const ukupno = (sadrzaj?.sekcije ?? []).reduce((zbir, sekcija) => zbir + sekcija.redovi.length, 0);
    expect(ukupno).toBeGreaterThanOrEqual(400);
    expect(sekcije(html)).toHaveLength(sadrzaj?.sekcije.length ?? -1);
  });

  test("a section opens or starts collapsed by the 60-article rule, and a collapsed body holds no rows", () => {
    for (const [indeks, { markup }] of sekcije(html).entries()) {
      const broj = sadrzaj?.sekcije[indeks].redovi.length ?? -1;
      const skupljena = broj > STUDIO_SKUPLJENO_PREKO;
      const dugme = /<button\b[^>]*\saria-controls="[^"]+"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(attr(dugme, "aria-expanded")).toBe(skupljena ? "false" : "true");
      const telo = teloSekcije(markup);
      expect(/\shidden=""/.test(telo.tag)).toBe(skupljena);
      expect(count(telo.sadrzaj, "data-red-artikla")).toBe(skupljena ? 0 : broj);
    }
  });

  // Measured: 7996 elements for the whole editor on the 402-article page
  // (work area, page column and the live preview), also after a collapsed
  // section stopped rendering its rows (no veliki section is over 60, so none
  // is collapsed here). The budget is that plus about 20%; a change that makes
  // the page heavier fails here on purpose.
  const BUDZET_ELEMENATA = 9600;
  test("the whole editor stays inside the element budget", () => {
    expect(elementi(html)).toBeLessThanOrEqual(BUDZET_ELEMENATA);
  });
});

// A section over the threshold is not in any izlog fixture (the largest has
// 30 articles), so the rule is checked on a page built for it.
describe("a section of more than 60 articles", () => {
  const html = renderStudio(sinteticki([61, STUDIO_SKUPLJENO_PREKO, 5, 400]));
  const naStrani = sekcije(html);

  test("the threshold is 60", () => {
    expect(STUDIO_SKUPLJENO_PREKO).toBe(60);
    expect(naStrani).toHaveLength(4);
  });

  test("starts collapsed: aria-expanded false, body hidden and empty", () => {
    for (const indeks of [0, 3]) {
      const { markup } = naStrani[indeks];
      const dugme = /<button\b[^>]*\saria-controls="[^"]+"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(attr(dugme, "aria-expanded")).toBe("false");
      const telo = teloSekcije(markup);
      expect(/\shidden=""/.test(telo.tag)).toBe(true);
      expect(telo.sadrzaj).toBe("</div></section>");
      expect(telo.sadrzaj).not.toContain("data-red-artikla");
      expect(telo.sadrzaj).not.toContain("data-brzi-unos-otvori");
      expect(telo.sadrzaj).not.toContain("<li");
    }
  });

  test("a collapsed section still says its name and how many articles it holds", () => {
    expect(bezTagova(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(naStrani[0].markup)?.[1] ?? "")).toBe(
      `${esc("Sekcija 1")} ${esc(brojArtikalaTekst(61))}`,
    );
    expect(naStrani[3].markup).toContain(esc(brojArtikalaTekst(400)));
  });

  test("a section of exactly 60 and a small one start open with all their rows", () => {
    for (const [indeks, broj] of [[1, 60], [2, 5]] as const) {
      const { markup } = naStrani[indeks];
      const dugme = /<button\b[^>]*\saria-controls="[^"]+"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(attr(dugme, "aria-expanded")).toBe("true");
      const telo = teloSekcije(markup);
      expect(/\shidden=""/.test(telo.tag)).toBe(false);
      expect(count(telo.sadrzaj, "data-red-artikla")).toBe(broj);
      expect(telo.sadrzaj).toContain("data-brzi-unos-otvori");
    }
  });

  test("only the open sections put rows and quick entry in the page", () => {
    expect(redovi(html)).toHaveLength(65);
    expect(count(html, "data-red-artikla")).toBe(65);
    expect(brojDugmadSaOznakom(html, "data-brzi-unos-otvori")).toBe(2);
  });

  test("every toggle points at a body that exists", () => {
    for (const { markup } of naStrani) {
      const dugme = /<button\b[^>]*\saria-controls="([^"]+)"[^>]*>/.exec(markup);
      expect(dugme).not.toBeNull();
      expect(count(markup, `id="${dugme?.[1]}"`)).toBe(1);
    }
  });
});

// =============================================================================
// 6. Read-only
// =============================================================================

describe("read-only editor (mozeUredjivanje=false)", () => {
  const html = renderStudio(srednjiPodaci({ mozeUredjivanje: false, mozeObjavu: false }));
  const { sadrzaj } = srednjiMeni();
  const sviRedovi = sadrzaj.sekcije.flatMap((sekcija) => sekcija.redovi);

  test("says editing is off, in a status", () => {
    expect(html).toContain(`>${esc(t.zaglavlje.samoCitanje)}</p>`);
    expect(count(html, esc(t.zaglavlje.samoCitanje))).toBe(1);
    expect(izlog({})).not.toContain(esc(t.zaglavlje.samoCitanje));
  });

  test("offers no way to add: no + Dodaj, no quick entry, no add-page, no section menus", () => {
    expect(html).not.toContain("data-dodaj");
    expect(html).not.toContain("data-brzi-unos-otvori");
    expect(html).not.toContain("data-brzi-unos");
    expect(html).not.toContain(esc(t.stranice.dodaj));
    expect(html).not.toContain(esc(t.ponuda.jos));
    expect(html).not.toContain(esc(fmt(t.sekcija.radnje, { naziv: sadrzaj.sekcije[0].naziv })));
    expect(html).not.toContain(esc(fmt(t.stranice.radnje, { naziv: menuDomenSr.defaultPageName })));
  });

  test("still lists every section and article, and every price input is disabled", () => {
    expect(sekcije(html)).toHaveLength(sadrzaj.sekcije.length);
    const naStrani = redovi(html);
    expect(naStrani).toHaveLength(sviRedovi.length);
    for (const { markup } of naStrani) {
      const polje = cenaPolje(markup);
      expect(jeOnemoguceno(polje)).toBe(true);
      expect(attr(polje, "aria-label")).toBeDefined();
    }
  });

  test("the section toggles still work for reading", () => {
    for (const { markup } of sekcije(html)) {
      const dugme = /<button\b[^>]*\saria-controls="[^"]+"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(attr(dugme, "aria-expanded")).toBe("true");
      expect(jeOnemoguceno(dugme)).toBe(false);
    }
  });

  test("Objavi is disabled and says who can publish; Pregled stays available", () => {
    const objavi = dugmeSaOznakom(html, "data-objavi");
    expect(jeOnemoguceno(objavi.tag)).toBe(true);
    expect(attr(objavi.tag, "title")).toBe(t.zaglavlje.bezObjave);
    expect(jeOnemoguceno(dugmeSaOznakom(html, "data-pregled-dugme").tag)).toBe(false);
  });
});

// =============================================================================
// 7. Decorative icons only
// =============================================================================

describe("accessibility of the markup", () => {
  const UPITI: IzlogSearchParams[] = [
    {},
    { plan: "premium" },
    { stanje: "prazno" },
    { design: "dark" },
    { stanje: "veliki" },
  ];

  test("every svg is decorative (aria-hidden) and nothing is role=img", () => {
    for (const upit of UPITI) {
      const html = izlog(upit);
      const svgovi = html.match(/<svg\b[^>]*>/g) ?? [];
      expect(svgovi.length).toBeGreaterThan(0);
      for (const svg of svgovi) expect(svg).toContain('aria-hidden="true"');
      expect(html).not.toContain('role="img"');
    }
  });

  test("every state has exactly one h1", () => {
    for (const upit of UPITI) expect(count(izlog(upit), "<h1")).toBe(1);
  });

  test("the live preview is inert and hidden from assistive technology", () => {
    const html = izlog({});
    const tag = /<div\b[^>]*\sdata-pregled-sadrzaj=""[^>]*>/.exec(html)?.[0] ?? "";
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).toContain('inert=""');
  });

  test("the tab panel is the one the tabs control", () => {
    const html = izlog({});
    const panel = /<div\b[^>]*\srole="tabpanel"[^>]*>/.exec(html)?.[0] ?? "";
    const id = attr(panel, "id");
    expect(id).toBeDefined();
    expect(attr(panel, "aria-labelledby")).toBe("studio-tab-ponuda");
    expect(count(html, `aria-controls="${id}"`)).toBe(2);
  });
});

// =============================================================================
// 8. The design of the preview
// =============================================================================

describe("design=dark", () => {
  const svetao = izlog({});
  const tamni = izlog({ design: "dark" });

  test("the preview carries the dark --menu-* tokens, the default one the default tokens", () => {
    const stilSvetao = pregledStil(svetao);
    const stilTamni = pregledStil(tamni);
    expect(stilTamni).not.toBe(stilSvetao);
    expect(stilSvetao).toContain(`--menu-page:${DEFAULT_MENU_DESIGN.colors.page}`);
    expect(stilTamni).toContain(`--menu-page:${DARK_MENU_DESIGN.colors.page}`);
    expect(stilTamni).toContain(`--menu-title:${DARK_MENU_DESIGN.colors.title}`);
    expect(stilTamni).not.toContain(`--menu-page:${DEFAULT_MENU_DESIGN.colors.page}`);
  });

  test("only the preview changes: the editor itself is the same", () => {
    expect(tamni.slice(0, tamni.indexOf("data-pregled-sadrzaj"))).toBe(svetao.slice(0, svetao.indexOf("data-pregled-sadrzaj")));
  });
});

// =============================================================================
// 9. Unavailable articles
// =============================================================================

describe("articles that are temporarily unavailable", () => {
  const html = izlog({});
  const { meni } = srednjiMeni();
  const nedostupni = new Set(meni.unavailableArticleKeys);

  test("the fixture has some, and they are on the main page", () => {
    expect(nedostupni.size).toBeGreaterThan(0);
    const kljucevi = redovi(html).map((red) => red.key);
    for (const key of nedostupni) expect(kljucevi).toContain(key);
  });

  test("their rows show the label, in words, and no other row does", () => {
    for (const { key, markup } of redovi(html)) {
      expect(markup.includes(`>${esc(t.red.nedostupno)}</span>`)).toBe(nedostupni.has(key));
    }
    expect(count(html, esc(t.red.nedostupno))).toBe(nedostupni.size);
  });

  test("an unavailable article is still editable", () => {
    for (const { key, markup } of redovi(html)) {
      if (nedostupni.has(key)) expect(jeOnemoguceno(cenaPolje(markup))).toBe(false);
    }
  });
});

// =============================================================================
// RedArtikla on its own: the states of the price
// =============================================================================

describe("RedArtikla price states", () => {
  const akcije: RedRadnje = {
    onCena: () => undefined,
    onPonovo: () => undefined,
    onZadrziMoju: () => undefined,
    onUzmiSacuvanu: () => undefined,
  };
  const red: StudioRed = {
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
  const prikaz = (cenaStanje: StanjePolja | undefined) =>
    renderToStaticMarkup(
      <ul>
        <RedArtikla red={red} nedostupan={false} cenaStanje={cenaStanje} sacuvanoU={undefined} mozeUredjivanje radnje={akcije} />
      </ul>,
    );

  test("a quiet row has no message", () => {
    const html = prikaz(undefined);
    const polje = cenaPolje(html);
    expect(html).not.toContain('role="alert"');
    expect(attr(polje, "aria-invalid")).toBeUndefined();
    expect(attr(polje, "aria-describedby")).toBeUndefined();
    expect(attr(polje, "value")).toBe("250");
  });

  test("a conflict shows the value saved meanwhile and the two ways out", () => {
    const html = prikaz({ faza: "konflikt", vrednost: 250, sacuvano: 260, pokusano: 250 });
    const poruka = /<div\b[^>]*\srole="alert"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(poruka).toContain(`<p>${esc(fmt(t.red.konflikt, { sacuvano: `260 ${t.red.rsd}` }))}</p>`);
    expect(dugmad(poruka).map((dugme) => dugme.text)).toEqual([
      esc(fmt(t.red.zadrziMoju, { moja: `250 ${t.red.rsd}` })),
      esc(t.red.uzmiSacuvanu),
    ]);
    const polje = cenaPolje(html);
    expect(attr(polje, "aria-invalid")).toBe("true");
    expect(attr(polje, "aria-describedby")).toBe(attr(prviTag(poruka), "id"));
    expect(html).toContain('data-cena-stanje="problem"');
  });

  test("a failed save that can be retried says so and offers to retry", () => {
    const html = prikaz({ faza: "greska", vrednost: 250, kod: "mreza", ponovljivo: true });
    const poruka = /<div\b[^>]*\srole="alert"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(poruka).toContain(`<p>${esc(t.red.nijeSacuvano)}</p>`);
    expect(dugmad(poruka).map((dugme) => dugme.text)).toEqual([esc(t.red.pokusajPonovo)]);
    const polje = cenaPolje(html);
    expect(attr(polje, "aria-invalid")).toBe("true");
    expect(attr(polje, "aria-describedby")).toBe(attr(prviTag(poruka), "id"));
    expect(html).toContain('data-cena-stanje="problem"');
  });

  test("a refusal is explained with its own text (and is not offered as a retry of the same thing)", () => {
    const [kod, tekst] = Object.entries(menuDomenSr.errors)[0];
    const html = prikaz({ faza: "greska", vrednost: 250, kod, ponovljivo: false });
    expect(html).toContain(`<p>${esc(`${t.red.nijeSacuvano} ${tekst}`)}</p>`);
    expect(attr(cenaPolje(html), "aria-invalid")).toBe("true");
  });

  test("a price being saved shows the saving mark in words and is not an error", () => {
    const html = prikaz({ faza: "salje", vrednost: 250 });
    expect(html).toContain('data-cena-stanje="cuva-se"');
    expect(html).toContain(`<span class="sr-only">${esc(t.red.cuvaSe)}</span>`);
    expect(html).not.toContain('role="alert"');
    expect(attr(cenaPolje(html), "aria-invalid")).toBeUndefined();
  });
});
