// K13 render tests: the public menu renderer (components/menu/javni) over the
// izlog fixtures, which go through the REAL publish path (fixtureMenu ->
// compileSnapshot -> parsePublicPage), and over hand-made PublicArticle
// objects for the cases the fixtures do not cover. Server markup only
// (renderToStaticMarkup, no DOM). Texts come from the dictionaries, never typed
// in Serbian here; the only literals are fixture facts (an invented venue).
// `javni-meni-uzivo.tsx` needs a Convex provider and is not rendered here.

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import { javniIzlog, type JavniIzlogPrikaz } from "@/components/menu/fixtures/javni";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { formatRsd } from "@/components/menu/menu-view";
import { formatBelgradeDate } from "@/lib/belgrade-time";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { MENU_DEFAULT_PRESENTATION, type MenuLayout } from "@/lib/menu/presentation";
import {
  brojArtikala,
  cenaPrikaz,
  imaDetalj,
  kolicinaTekst,
  sidroArtikla,
  sidroKategorije,
  sidroSekcije,
  type JavnaStranicaView,
} from "@/lib/menu/public-view";
import type { PublicArticle, PublicPageMeta, PublicSection } from "@/lib/menu/snapshot";
import { ArtikalRed } from "./artikal";
import { DetaljSadrzaj } from "./detalj";
import { JavniGlif } from "./glif";
import { JavniMeni } from "./javni-meni";
import { MENU_KRATAK_SADRZAJ } from "./kompaktno";

// The global stubs (harness/vitest-stubs) keep only src/alt/size/className of an
// image and only href/className of a link. The tests need `loading` (the lazy
// article images) and `tabIndex` / `aria-current` (the editor preview and the
// page navigation), so these two mocks pass the props through.
vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img">) =>
    createElement("img", {
      src: props.src,
      alt: props.alt,
      width: props.width,
      height: props.height,
      sizes: props.sizes,
      className: props.className,
      loading: props.loading,
    }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

const t = menuJavniSr;
const d = menuDomenSr;

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
const countRe = (html: string, re: RegExp) => (html.match(re) ?? []).length;
/** Element openings (`<div`, `<path`, ...): the size of the DOM the markup would build. */
const elementi = (html: string) => countRe(html, /<[a-zA-Z]/g);
const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();
/** The opening tag at the start of a piece of markup. */
const prviTag = (markup: string) => markup.slice(0, markup.indexOf(">") + 1);

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The inner markup of every <h{nivo}>. */
function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
}

/** The text of every <a href="{href}">. */
function linkovi(html: string, href: string): string[] {
  return [...html.matchAll(new RegExp(`<a\\b[^>]*\\shref="${href}"[^>]*>([\\s\\S]*?)</a>`, "g"))].map((match) =>
    bezTagova(match[1]),
  );
}

type Red = { id: string; markup: string };

/** Every `data-artikal` row (Tok row, Kategorije card, Kompaktno line), up to its own closing </li>. */
function redovi(html: string): Red[] {
  const out: Red[] = [];
  for (const start of html.matchAll(/<li\b[^>]*\sdata-artikal=""[^>]*>/g)) {
    const from = start.index ?? 0;
    const tags = /<li[\s>]|<\/li>/g;
    tags.lastIndex = from;
    let depth = 0;
    let end = html.length;
    for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
      depth += tag[0] === "</li>" ? -1 : 1;
      if (depth === 0) {
        end = tag.index + tag[0].length;
        break;
      }
    }
    out.push({ id: attr(start[0], "id") ?? "", markup: html.slice(from, end) });
  }
  return out;
}

/** The opening tag of the menu root (`data-javni-meni`). */
function koren(html: string): string {
  const tag = /<div\b[^>]*\sdata-javni-meni=""[^>]*>/.exec(html)?.[0];
  if (!tag) throw new Error("no public menu root in the markup");
  return tag;
}

/** A `--menu-*` custom property of the root's style attribute. */
function token(tag: string, name: string): string {
  const style = attr(tag, "style") ?? "";
  const match = new RegExp(`${name}:([\\s\\S]*?)(?:;--menu-|$)`).exec(style);
  if (!match) throw new Error(`no ${name} in the root style`);
  return match[1];
}

/** The same markup without the closed <dialog>s (their content is not reachable until opened). */
const bezDijaloga = (html: string) => html.replace(/<dialog\b[\s\S]*?<\/dialog>/g, "");

type Over = Record<string, string>;
type StranicaPrikaz = Extract<JavniIzlogPrikaz, { vrsta: "stranica" }>;

const izlog = (over: Over) => renderToStaticMarkup(<JavniIzlog params={parsePublicPreview(over)} />);

function stranica(over: Over): StranicaPrikaz {
  const prikaz = javniIzlog(parsePublicPreview(over));
  if (prikaz.vrsta !== "stranica") throw new Error(`expected a menu page for ${JSON.stringify(over)}`);
  return prikaz;
}

type PrikaziExtra = { pocetniDetalj?: string | null; pocetnaKategorija?: string | null; ugradjen?: boolean };

/** What the izlog renders for a page, with the starting detail / category / editor form overridden. */
function prikazi(prikaz: StranicaPrikaz, extra: PrikaziExtra = {}): string {
  const pocetniDetalj = extra.pocetniDetalj !== undefined ? extra.pocetniDetalj : prikaz.pocetniDetalj;
  const pocetnaKategorija = extra.pocetnaKategorija !== undefined ? extra.pocetnaKategorija : prikaz.pocetnaKategorija;
  return renderToStaticMarkup(
    <JavniMeni
      view={prikaz.view}
      izgled={javniIzgled(prikaz.presentation)}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={prikaz.nedostupni}
      pocetniDetalj={pocetniDetalj}
      pocetnaKategorija={pocetnaKategorija}
      ugradjen={extra.ugradjen}
    />,
  );
}

const sviArtikli = (prikaz: StranicaPrikaz) => prikaz.view.sekcije.flatMap((sekcija) => sekcija.articles);
const neprazne = (sekcije: readonly PublicSection[]) => sekcije.filter((sekcija) => sekcija.articles.length > 0);

function nadji(prikaz: StranicaPrikaz, uslov: (article: PublicArticle) => boolean): PublicArticle {
  const article = sviArtikli(prikaz).find(uslov);
  if (!article) throw new Error("no such article in the fixture");
  return article;
}

/** The rows of a page; for `Kategorije` the rows of every category, one render per category. */
function sviRedovi(prikaz: StranicaPrikaz): Red[] {
  if (prikaz.presentation.layout !== "categories") return redovi(prikazi(prikaz));
  return neprazne(prikaz.view.sekcije).flatMap((sekcija) =>
    redovi(prikazi(prikaz, { pocetnaKategorija: sekcija.key })),
  );
}

/** The detail <dialog> of an open article. */
function dijalogDetalja(html: string): string {
  const dijalog = /<dialog\b[^>]*\sdata-detalj="[^"]*"[^>]*>[\s\S]*?<\/dialog>/.exec(html)?.[0];
  if (!dijalog) throw new Error("no article detail <dialog> in the markup");
  return dijalog;
}

const SADA = IZLOG_SADA;
const DAN = 24 * 60 * 60 * 1000;

function clanak(over: Partial<PublicArticle> = {}): PublicArticle {
  return {
    key: "ar_probni",
    kind: "item",
    name: "Probni artikal",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 500,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode: "none", imageMediaId: null, iconKey: null },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
    ...over,
  };
}

function detalj(
  article: PublicArticle,
  over: Partial<Omit<ComponentProps<typeof DetaljSadrzaj>, "article">> = {},
): string {
  return renderToStaticMarkup(
    <DetaljSadrzaj
      article={article}
      layout="flow"
      slike={{}}
      sadaMs={SADA}
      nedostupan={false}
      alergeniUkljuceni={true}
      naslovId="naslov-probe"
      {...over}
    />,
  );
}

function red(article: PublicArticle, over: Partial<ComponentProps<typeof ArtikalRed>> = {}): string {
  return renderToStaticMarkup(
    <ul>
      <ArtikalRed article={article} layout="flow" slike={{}} sadaMs={SADA} nedostupan={false} onOtvori={null} {...over} />
    </ul>,
  );
}

/** A hand-made section with `n` plain articles. */
function sekcijaOd(kljuc: string, name: string, n: number): PublicSection {
  return {
    key: kljuc,
    name,
    description: null,
    iconKey: null,
    articles: Array.from({ length: n }, (_, index) => clanak({ key: `ar_${kljuc}_${index}`, name: `Artikal ${index + 1}` })),
  };
}

/** A one-page view over hand-made sections. */
function pogled(sekcije: PublicSection[]): JavnaStranicaView {
  const stranicaMeta: PublicPageMeta = {
    key: "pg_probna",
    slug: "glavni",
    title: null,
    isDefault: true,
    navigation: "standalone",
    iconKey: null,
  };
  return {
    lokal: { naziv: "Probni lokal", slug: "probni", logoUrl: null },
    stranica: stranicaMeta,
    stranice: [stranicaMeta],
    sekcije,
    jezik: "sr",
    jezici: ["sr"],
    alergeniUkljuceni: false,
  };
}

function meniHtml(view: JavnaStranicaView, layout: MenuLayout, ugradjen = false): string {
  return renderToStaticMarkup(
    <JavniMeni
      view={view}
      izgled={javniIzgled({ ...MENU_DEFAULT_PRESENTATION, layout })}
      slike={{}}
      sadaMs={SADA}
      nedostupni={[]}
      ugradjen={ugradjen}
    />,
  );
}

/** A row without its "Privremeno nedostupno" line (Tok and Kategorije draw a small icon in it, which is not media). */
const bezNedostupnog = (markup: string) => markup.replace(/<p class="[^"]*nedostupno[^"]*">[\s\S]*?<\/p>/, "");

/** The path data of the first svg in a piece of markup: which glyph it draws. */
const putanje = (markup: string) =>
  [...(/<svg\b[\s\S]*?<\/svg>/.exec(markup)?.[0] ?? "").matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]).join("|");

/** The list `<ul>` tags of a Tok page (the ones directly followed by article rows), in order. */
const listeTokaTagovi = (html: string) => [...html.matchAll(/<ul\b([^>]*)>(?=<li id="a-)/g)].map((match) => match[0]);

// -----------------------------------------------------------------------------
// Tok
// -----------------------------------------------------------------------------

describe("Tok (primer kafic)", () => {
  const over = { primer: "kafic" };
  const prikaz = stranica(over);
  const html = izlog(over);
  const { sekcije, lokal } = prikaz.view;
  const rows = redovi(html);

  test("exactly one h1 with the venue name, one main, the footer", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(/<h1\b[^>]*>([^<]*)<\/h1>/.exec(html)?.[1]).toBe(esc(lokal.naziv));
    expect(count(html, "<main")).toBe(1);
    expect(count(html, "<header")).toBe(1);
    expect(count(html, "<footer")).toBe(1);
    expect(html).toContain(esc(t.podnozje.pokrece));
  });

  test("the navigation has one #s- link per section; each section has an id and an h2", () => {
    expect(sekcije.length).toBeGreaterThan(1);
    expect(count(html, "<nav")).toBe(1);
    const nav = /<nav\b[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(attr(prviTag(nav), "aria-label")).toBe(t.navigacija.sekcije);
    expect(count(nav, 'href="#s-')).toBe(sekcije.length);
    expect(count(nav, 'aria-current="true"')).toBe(1);
    for (const sekcija of sekcije) {
      expect(nav).toContain(`href="#${sidroSekcije(sekcija.key)}"`);
      expect(html).toContain(`<section id="${sidroSekcije(sekcija.key)}"`);
    }
    expect(count(html, 'id="s-')).toBe(sekcije.length * 2); // the section and its heading
    expect(naslovi(html, 2)).toEqual(sekcije.map((sekcija) => esc(sekcija.name)));
  });

  test("every article is a row (data-artikal) with a heading and a detail button", () => {
    expect(rows).toHaveLength(brojArtikala(sekcije));
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const article of sviArtikli(prikaz)) {
      const row = rows.find((candidate) => candidate.id === sidroArtikla(article.key));
      expect(row, article.name).toBeDefined();
      expect(count(row!.markup, "<h3")).toBe(1);
      expect(count(row!.markup, "<button")).toBe(1);
      const dugme = /<button\b([^>]*)>([\s\S]*?)<\/button>/.exec(row!.markup);
      const tag = `<button${dugme?.[1] ?? ""}>`;
      expect(attr(tag, "aria-haspopup")).toBe("dialog");
      // Label in name (WCAG 2.5.3): no aria-label; the accessible name is the visible name (+ quantity).
      expect(tag, article.name).not.toContain("aria-label");
      const kolicina = kolicinaTekst(article);
      expect(bezTagova(dugme?.[2] ?? "")).toBe(esc(kolicina ? `${article.name} ${kolicina}` : article.name));
    }
  });

  test("prices are whole dinars with RSD in the same element, never split", () => {
    expect(count(html, "RSD</span>")).toBeGreaterThanOrEqual(brojArtikala(sekcije));
    // Every "RSD" directly follows its amount inside one element: no space, no wrapper.
    const iznosi = [...html.matchAll(/([^>]*)<span class="[^"]*valuta[^"]*">RSD<\/span>/g)].map((match) => match[1]);
    expect(iznosi).toHaveLength(count(html, "RSD</span>"));
    for (const iznos of iznosi) expect(iznos).toMatch(/\d$/);
    // The amount is a plain number with thousands dots, e.g. 1.490.
    for (const match of html.matchAll(/(\d[\d.]*)<span class="[^"]*valuta[^"]*">RSD<\/span>/g)) {
      expect(match[1]).toMatch(/^\d{1,3}(?:\.\d{3})*$/);
    }
    for (const row of rows) expect(count(row.markup, "RSD</span>"), row.id).toBeGreaterThanOrEqual(1);
  });

  test("a price from 1000 up carries the thousands dot (1.450 style)", () => {
    const tok = stranica({ primer: "restoran", layout: "tok" });
    const markup = prikazi(tok);
    const redoviPoId = new Map(redovi(markup).map((row) => [row.id, row]));
    const skupi = sviArtikli(tok).filter((article) => article.priceRsd !== null && article.priceRsd >= 1000 && article.promo === null);
    expect(skupi.length).toBeGreaterThan(0);
    for (const article of skupi) {
      const iznos = formatRsd(article.priceRsd as number);
      expect(iznos).toMatch(/^\d{1,3}(?:\.\d{3})+$/);
      const re = new RegExp(`>${iznos.replace(/\./g, "\\.")}<span class="[^"]*valuta[^"]*">RSD</span>`);
      expect(redoviPoId.get(sidroArtikla(article.key))?.markup, article.name).toMatch(re);
    }
  });

  test("the root carries layout and palette; the global theme toggle is hidden", () => {
    const root = koren(html);
    expect(attr(root, "data-layout")).toBe("flow");
    expect(attr(root, "data-paleta")).toBe("espresso");
    expect(attr(root, "lang")).toBe(prikaz.view.jezik);
    // The frame hides the theme toggle, then paints the page behind the venue's own colour.
    const boja = javniIzgled(prikaz.presentation).boje.page;
    expect(boja).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(token(root, "--menu-page")).toBe(boja);
    expect(html).toContain(`<style>[data-theme-toggle="global"]{display:none!important}html{background:${boja}}</style>`);
    expect(count(html, "<style")).toBe(1);
  });

  test("the café shows icons, never images; an article without a known icon shows no tile", () => {
    expect(html).not.toContain("<img");
    let sIkonicom = 0;
    let bezMedija = 0;
    for (const article of sviArtikli(prikaz)) {
      const row = rows.find((candidate) => candidate.id === sidroArtikla(article.key))!;
      if (article.media.mode === "icon") {
        sIkonicom += 1;
        expect(row.markup, article.name).toContain("<svg");
        expect(attr(prviTag(row.markup), "data-medij"), article.name).toBe("ikonica");
        // Its own icon: the glyph of its key, not a placeholder.
        const ocekivano = putanje(renderToStaticMarkup(<JavniGlif iconKey={article.media.iconKey} />));
        expect(ocekivano).not.toBe("");
        expect(putanje(row.markup), article.name).toBe(ocekivano);
      } else {
        bezMedija += 1;
        expect(article.media.mode, article.name).toBe("none");
        expect(bezNedostupnog(row.markup), article.name).not.toContain("<svg");
        expect(prviTag(row.markup), article.name).not.toContain("data-medij");
      }
    }
    expect(sIkonicom).toBeGreaterThan(0);
    expect(bezMedija).toBeGreaterThan(0);
  });

  test('a section list says what media its rows carry (data-ima-medij), none when no row has any', () => {
    const liste = listeTokaTagovi(html);
    expect(liste).toHaveLength(sekcije.length);
    sekcije.forEach((sekcija, index) => {
      const imaIkonicu = sekcija.articles.some((article) => article.media.mode === "icon");
      expect(attr(liste[index], "data-ima-medij"), sekcija.name).toBe(imaIkonicu ? "ikonica" : undefined);
    });
  });

  test("Tok with photos: a row says photo or icon, and so does its section list", () => {
    const tok = stranica({ primer: "restoran", layout: "tok", mediji: "slika" });
    const markup = prikazi(tok);
    const liste = listeTokaTagovi(markup);
    expect(liste).toHaveLength(tok.view.sekcije.length);
    tok.view.sekcije.forEach((sekcija, index) => {
      expect(attr(liste[index], "data-ima-medij"), sekcija.name).toBe("slika");
    });
    const rowsTok = redovi(markup);
    for (const article of sviArtikli(tok)) {
      const row = rowsTok.find((candidate) => candidate.id === sidroArtikla(article.key))!;
      const id = article.media.imageMediaId;
      const imaSliku = id !== null && tok.slike[id] !== undefined;
      expect(attr(prviTag(row.markup), "data-medij"), article.name).toBe(imaSliku ? "slika" : "ikonica");
    }
  });

  test("Tok without media: no data-ima-medij, no data-medij", () => {
    const markup = prikazi(stranica({ primer: "restoran", layout: "tok", mediji: "bez" }));
    expect(markup).not.toContain("data-ima-medij");
    expect(markup).not.toContain("data-medij");
  });
});

describe("the icon of a row", () => {
  const ikonica = (iconKey: string | null, sekcijaIkonica: string | null = null) =>
    putanje(
      red(clanak({ media: { mode: "icon", imageMediaId: null, iconKey } }), { sekcijaIkonica }),
    );

  test("its own icon wins; without one the section's icon shows; without either the default glyph", () => {
    const vino = ikonica("vino");
    const rostilj = ikonica("rostilj");
    const zadata = ikonica(null);
    expect(vino).not.toBe("");
    expect(new Set([vino, rostilj, zadata]).size).toBe(3);
    expect(ikonica(null, "vino")).toBe(vino);
    expect(ikonica("rostilj", "vino")).toBe(rostilj);
    expect(ikonica(null, null)).toBe(zadata);
  });

  test("a key outside the icon set takes the section's icon, then the default glyph", () => {
    const vino = ikonica("vino");
    const zadata = ikonica(null);
    expect(ikonica("nema-takve-ikonice", "vino")).toBe(vino);
    expect(ikonica("nema-takve-ikonice")).toBe(zadata);
  });

  test("the section's icon is not used when the article's media is off or the layout is Kompaktno", () => {
    const bez = red(clanak({ media: { mode: "none", imageMediaId: null, iconKey: null } }), { sekcijaIkonica: "vino" });
    expect(bez).not.toContain("<svg");
    const kompaktno = red(clanak({ media: { mode: "icon", imageMediaId: null, iconKey: null } }), {
      layout: "compact",
      sekcijaIkonica: "vino",
    });
    expect(kompaktno).not.toContain("<svg");
  });
});

// -----------------------------------------------------------------------------
// Kategorije
// -----------------------------------------------------------------------------

describe("Kategorije (primer restoran)", () => {
  const prikaz = stranica({ primer: "restoran" });
  const prikazane = neprazne(prikaz.view.sekcije);

  test("starts on the grid: one tile link per non-empty section with its article count", () => {
    const html = prikazi(prikaz);
    expect(count(html, 'data-kategorije="mreza"')).toBe(1);
    expect(count(html, "data-artikal")).toBe(0);
    expect(count(html, "<h1")).toBe(1);
    const plocice = [...html.matchAll(/<a\b[^>]*\shref="#k-[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
    expect(plocice).toHaveLength(prikazane.length);
    prikazane.forEach((sekcija, index) => {
      expect(attr(prviTag(plocice[index]), "href")).toBe(`#${sidroKategorije(sekcija.key)}`);
      const n = sekcija.articles.length;
      const tekst = bezTagova(plocice[index]);
      expect(tekst).toContain(esc(sekcija.name));
      expect(tekst).toContain(esc(fmt(t.kategorije.artikli[srPluralCategory(n)], { n })));
    });
  });

  test("the article count follows the Serbian plural (1 / 2-4 / 5-20 / 21 / 22 ...)", () => {
    const ocekivano = { 1: "one", 2: "few", 4: "few", 5: "many", 11: "many", 12: "many", 14: "many", 21: "one", 22: "few", 25: "many", 101: "one" } as const;
    const sekcije = Object.keys(ocekivano).map((kljuc) => sekcijaOd(`sc_n${kljuc}`, `Sekcija ${kljuc}`, Number(kljuc)));
    const html = meniHtml(pogled(sekcije), "categories");
    const plocice = [...html.matchAll(/<a\b[^>]*\shref="#k-[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((match) => bezTagova(match[0]));
    expect(plocice).toHaveLength(sekcije.length);
    (Object.entries(ocekivano) as [string, "one" | "few" | "many"][]).forEach(([kljuc, oblik], index) => {
      const n = Number(kljuc);
      expect(plocice[index]).toContain(esc(fmt(t.kategorije.artikli[oblik], { n })));
    });
  });

  test("with a category open: its articles, an h2 with its name, back to the grid, next category", () => {
    const otvorena = stranica({ primer: "restoran", kategorija: "1" });
    const html = prikazi(otvorena);
    const [prva, druga] = prikazane;
    expect(count(html, 'data-kategorije="kategorija"')).toBe(1);
    expect(count(html, 'data-kategorije="mreza"')).toBe(0);
    expect(naslovi(html, 2)).toEqual([esc(prva.name)]);
    expect(redovi(html)).toHaveLength(prva.articles.length);
    // Back link: the fragment "#" (the grid), named with the dictionary. There are two: one
    // above the heading and one in the bottom row, under the articles.
    const nazad = [...html.matchAll(/<a\b[^>]*\shref="#"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => bezTagova(match[1]));
    expect(nazad).toEqual([esc(t.navigacija.sveKategorije), esc(t.navigacija.sveKategorije)]);
    // The chip row lists every category and marks the open one.
    expect(count(html, 'aria-current="true"')).toBe(1);
    for (const sekcija of prikazane) expect(html).toContain(`href="#${sidroKategorije(sekcija.key)}"`);
    // The bottom row: back to the grid first, then "Sledeća": a link to the next category, named with it.
    const donjiRed = /<p class="[^"]*sledeca[^"]*">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(donjiRed.indexOf('href="#"')).toBeGreaterThanOrEqual(0);
    expect(donjiRed.indexOf('href="#"')).toBeLessThan(donjiRed.indexOf(`href="#${sidroKategorije(druga.key)}"`));
    expect(linkovi(donjiRed, `#${sidroKategorije(druga.key)}`)).toEqual([esc(fmt(t.navigacija.sledeca, { naziv: druga.name }))]);
    expect(linkovi(html, `#${sidroKategorije(druga.key)}`)).toContain(esc(fmt(t.navigacija.sledeca, { naziv: druga.name })));
  });

  test("the last category keeps the way back but has no next link; an unknown category falls back to the grid", () => {
    const poslednja = stranica({ primer: "restoran", kategorija: String(prikazane.length) });
    const html = prikazi(poslednja);
    const prefiks = t.navigacija.sledeca.slice(0, t.navigacija.sledeca.indexOf("{"));
    expect(naslovi(html, 2)).toEqual([esc(prikazane[prikazane.length - 1].name)]);
    expect(html).not.toContain(esc(prefiks));
    const donjiRed = /<p class="[^"]*sledeca[^"]*">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(linkovi(donjiRed, "#")).toEqual([esc(t.navigacija.sveKategorije)]);
    expect(count(donjiRed, "<a")).toBe(1);
    const nepostojeca = stranica({ primer: "restoran", kategorija: "99" });
    expect(count(prikazi(nepostojeca), 'data-kategorije="mreza"')).toBe(1);
  });

  test("images: articles with a resolved image show <img>, the others the icon fallback (svg)", () => {
    const slika = stranica({ primer: "restoran", kategorija: "1", mediji: "slika" });
    const html = prikazi(slika);
    const rows = redovi(html);
    const artikli = neprazne(slika.view.sekcije)[0].articles;
    expect(rows).toHaveLength(artikli.length);
    rows.forEach((row, index) => {
      const id = artikli[index].media.imageMediaId;
      const imaSliku = id !== null && slika.slike[id] !== undefined;
      expect(row.markup.includes("<img"), `${artikli[index].name} image`).toBe(imaSliku);
      expect(bezNedostupnog(row.markup).includes("<svg"), `${artikli[index].name} icon`).toBe(!imaSliku);
      expect(attr(prviTag(row.markup), "data-medij"), artikli[index].name).toBe(imaSliku ? "slika" : "ikonica");
    });
    // The fourth article of the fixture has no resolved image: the icon shows instead.
    expect(rows[3].markup).toContain("<svg");
    expect(rows[3].markup).not.toContain("<img");
    expect(rows.some((row) => row.markup.includes("<img"))).toBe(true);
    expect(rows.some((row) => row.markup.includes("<svg"))).toBe(true);
  });

  test("every image is decorative (alt empty) and article images load lazily", () => {
    const slucajevi: Over[] = [{ primer: "restoran" }, { primer: "restoran", kategorija: "1" }, { primer: "restoran", kategorija: "3", mediji: "slika" }];
    for (const over of slucajevi) {
      const html = prikazi(stranica(over));
      const slike = html.match(/<img\b[^>]*>/g) ?? [];
      expect(slike.length, JSON.stringify(over)).toBeGreaterThan(0);
      for (const img of slike) {
        expect(attr(img, "alt")).toBe("");
        expect(attr(img, "loading")).toBe("lazy");
      }
    }
  });

  test("mediji=ikonica shows icons only (an article without an icon of the set shows no tile); mediji=bez shows no media", () => {
    const sIkonicama = stranica({ primer: "restoran", kategorija: "1", mediji: "ikonica" });
    const ikonice = prikazi(sIkonicama);
    expect(ikonice).not.toContain("<img");
    const rowsIkonice = redovi(ikonice);
    const artikli = neprazne(sIkonicama.view.sekcije)[0].articles;
    expect(rowsIkonice).toHaveLength(artikli.length);
    rowsIkonice.forEach((row, index) => {
      const imaIkonicu = artikli[index].media.mode === "icon";
      expect(bezNedostupnog(row.markup).includes("<svg"), artikli[index].name).toBe(imaIkonicu);
      expect(attr(prviTag(row.markup), "data-medij"), artikli[index].name).toBe(imaIkonicu ? "ikonica" : undefined);
    });
    expect(artikli.some((article) => article.media.mode === "icon")).toBe(true);
    const bez = prikazi(stranica({ primer: "restoran", kategorija: "1", mediji: "bez" }));
    for (const row of redovi(bez)) {
      expect(row.markup).not.toContain("<img");
      expect(bezNedostupnog(row.markup)).not.toContain("<svg");
      expect(row.markup).not.toContain("data-medij");
    }
  });
});

// -----------------------------------------------------------------------------
// Kompaktno
// -----------------------------------------------------------------------------

describe("Kompaktno (primer prestizni)", () => {
  const MEDIJI = [undefined, "slika", "ikonica", "bez"] as const;
  const overZa = (mediji?: string): Over => (mediji ? { primer: "prestizni", mediji } : { primer: "prestizni" });

  test("the root is compact and dark; the palette is the dark one", () => {
    const root = koren(izlog(overZa()));
    expect(attr(root, "data-layout")).toBe("compact");
    expect(attr(root, "data-ton")).toBe("tamna");
    expect(attr(root, "data-paleta")).toBe("ponoc");
  });

  test("master 7.1: no <img> anywhere in a data-artikal element, whatever the media mode", () => {
    for (const mediji of MEDIJI) {
      const html = izlog(overZa(mediji));
      const rows = redovi(html);
      expect(rows.length, String(mediji)).toBeGreaterThan(0);
      expect(html, String(mediji)).not.toContain("<img");
      for (const row of rows) {
        expect(row.markup, `${mediji}: ${row.id}`).not.toContain("<img");
        expect(row.markup, `${mediji}: ${row.id}`).not.toContain("data-medij");
      }
    }
  });

  test("master 7.1: no <svg> in any data-artikal element, whatever the media mode", () => {
    const sSvg: string[] = [];
    for (const mediji of MEDIJI) {
      for (const row of redovi(izlog(overZa(mediji)))) {
        if (!row.markup.includes("<svg")) continue;
        const izvor = row.markup.includes("nedostupnoIkonica") ? "the unavailable marker" : "media";
        sSvg.push(`${mediji}: ${row.id} (${izvor})`);
      }
    }
    expect(sSvg).toEqual([]);
  });

  test("a row is a tab stop only when the detail adds something (wine lines are not)", () => {
    const kafic = stranica({ primer: "kafic", layout: "kompaktno" });
    expect(kafic.view.alergeniUkljuceni).toBe(false);
    const rows = redovi(prikazi(kafic));
    expect(rows).toHaveLength(brojArtikala(kafic.view.sekcije));
    for (const article of sviArtikli(kafic)) {
      const row = rows.find((candidate) => candidate.id === sidroArtikla(article.key));
      expect(count(row!.markup, "<button"), article.name).toBe(imaDetalj(article, "compact", false) ? 1 : 0);
    }
    expect(rows.some((row) => !row.markup.includes("<button"))).toBe(true);
    expect(rows.some((row) => row.markup.includes("<button"))).toBe(true);
  });

  test("with allergens on (the allergens live only in the detail) every line opens the detail", () => {
    const prestizni = stranica({ primer: "prestizni" });
    expect(prestizni.view.alergeniUkljuceni).toBe(true);
    const rows = redovi(prikazi(prestizni));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(count(row.markup, "<button"), row.id).toBe(1);
  });

  /** The inline index nav (the one with a class; the dialog's nav has none). */
  const uvucenIndeks = (html: string) => /<nav\b[^>]*class="[^"]*indeks[^"]*"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  const sadrzajDijalog = (html: string) => /<dialog\b[^>]*aria-labelledby="javni-sadrzaj-naslov"[^>]*>[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? "";

  test("the contents: a bar button opening a dialog named by a visible heading, and an inline index for a short menu", () => {
    const prikaz = stranica({ primer: "prestizni" });
    expect(prikaz.view.sekcije.length).toBeLessThanOrEqual(MENU_KRATAK_SADRZAJ);
    const html = prikazi(prikaz);
    // The bar button: a visible "Sadržaj" with an explicit name.
    const dugme = /<button\b([^>]*\saria-haspopup="dialog"[^>]*)>([\s\S]*?)<\/button>/.exec(html);
    expect(attr(`<button${dugme?.[1] ?? ""}>`, "aria-label")).toBe(t.navigacija.otvoriSadrzaj);
    expect(bezTagova(dugme?.[2] ?? "")).toBe(esc(t.navigacija.sadrzaj));
    // The dialog is named by its visible h2, not by an aria-label.
    const dijalog = sadrzajDijalog(html);
    expect(dijalog).not.toBe("");
    expect(attr(prviTag(dijalog), "aria-label")).toBeUndefined();
    expect(attr(prviTag(dijalog), "aria-labelledby")).toBe("javni-sadrzaj-naslov");
    expect(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(dijalog)?.[1]).toBe(esc(t.stanja.sadrzajNaslov));
    expect(dijalog).toContain('<h2 id="javni-sadrzaj-naslov"');
    expect(count(dijalog, 'href="#s-')).toBe(prikaz.view.sekcije.length);
    expect(dijalog).toContain(`>${esc(t.detalj.zatvori)}</button>`);
    // A short menu also shows the contents inline.
    const nav = uvucenIndeks(html);
    expect(attr(prviTag(nav), "aria-label")).toBe(t.navigacija.sekcije);
    expect(count(nav, 'href="#s-')).toBe(prikaz.view.sekcije.length);
    // The section headings are the page's h2s, after the dialog's own.
    expect(naslovi(html, 2)).toEqual([esc(t.stanja.sadrzajNaslov), ...prikaz.view.sekcije.map((sekcija) => esc(sekcija.name))]);
  });

  test("the inline index is only for a short menu: up to MENU_KRATAK_SADRZAJ sections; the bar and dialog are always there", () => {
    const sekcije = (n: number) => Array.from({ length: n }, (_, index) => sekcijaOd(`sc_k${n}_${index}`, `Sekcija ${index + 1}`, 2));
    const granica = meniHtml(pogled(sekcije(MENU_KRATAK_SADRZAJ)), "compact");
    const iznad = meniHtml(pogled(sekcije(MENU_KRATAK_SADRZAJ + 1)), "compact");
    expect(uvucenIndeks(granica)).not.toBe("");
    expect(uvucenIndeks(iznad)).toBe("");
    for (const html of [granica, iznad]) {
      expect(html).toContain(`aria-label="${esc(t.navigacija.otvoriSadrzaj)}"`);
      expect(sadrzajDijalog(html)).not.toBe("");
    }
    expect(count(sadrzajDijalog(iznad), 'href="#s-')).toBe(MENU_KRATAK_SADRZAJ + 1);
    // One section needs no contents at all.
    const jedna = meniHtml(pogled(sekcije(1)), "compact");
    expect(jedna).not.toContain("<dialog");
    expect(jedna).not.toContain(esc(t.navigacija.otvoriSadrzaj));
    expect(uvucenIndeks(jedna)).toBe("");
  });

  test("in the editor preview the contents bar stays but the dialog is not rendered at all", () => {
    const html = prikazi(stranica({ primer: "prestizni" }), { ugradjen: true });
    expect(html).toContain(`aria-label="${esc(t.navigacija.otvoriSadrzaj)}"`);
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("javni-sadrzaj-naslov");
    expect(html).not.toContain(esc(t.stanja.sadrzajNaslov));
  });

  test("tags are a quiet line in the same markup: a list of plain badges, no promotion or highlight classes", () => {
    const prikaz = stranica({ primer: "prestizni" });
    const html = prikazi(prikaz);
    const rows = redovi(html);
    const sOznakama = sviArtikli(prikaz).filter((article) => article.tags.length > 0 && article.promo === null);
    expect(sOznakama.length).toBeGreaterThan(0);
    for (const article of sOznakama) {
      const row = rows.find((candidate) => candidate.id === sidroArtikla(article.key))!;
      const lista = /<ul class="[^"]*oznake[^"]*">([\s\S]*?)<\/ul>/.exec(row.markup)?.[1] ?? "";
      const stavke = [...lista.matchAll(/<li class="([^"]*)">([\s\S]*?)<\/li>/g)];
      expect(stavke.map((stavka) => stavka[2]), article.name).toEqual(
        article.tags.map((kod) => esc(d.tags[kod as keyof typeof d.tags])),
      );
      for (const stavka of stavke) {
        expect(stavka[1]).toMatch(/^_?oznaka(?:_|$)/);
        expect(stavka[1]).not.toContain("oznakaAkcija");
        if (stavka[2] !== esc(d.tags.recommended)) expect(stavka[1], article.name).not.toContain("oznakaIstaknuta");
      }
    }
  });

  test("the unavailable label is text only here; Tok and Kategorije draw a small icon with it", () => {
    const kompaktno = redovi(prikazi(stranica({ primer: "prestizni" }))).filter((row) => / data-nedostupno=""/.test(prviTag(row.markup)));
    expect(kompaktno.length).toBeGreaterThan(0);
    for (const row of kompaktno) {
      const oznaka = /<p class="[^"]*nedostupno[^"]*">([\s\S]*?)<\/p>/.exec(row.markup)?.[1];
      expect(oznaka, row.id).toBe(esc(d.unavailable));
    }
    const tok = redovi(prikazi(stranica({ primer: "restoran", layout: "tok" }))).filter((row) => / data-nedostupno=""/.test(prviTag(row.markup)));
    expect(tok.length).toBeGreaterThan(0);
    for (const row of tok) {
      const oznaka = /<p class="[^"]*nedostupno[^"]*">([\s\S]*?)<\/p>/.exec(row.markup)?.[1] ?? "";
      expect(oznaka, row.id).toContain("<svg");
      expect(oznaka, row.id).toContain(esc(d.unavailable));
    }
  });
});

// -----------------------------------------------------------------------------
// The three primers
// -----------------------------------------------------------------------------

describe("the three primers are intentionally different", () => {
  const PRIMERI = ["kafic", "restoran", "prestizni"] as const;
  const izgledi = PRIMERI.map((primer) => {
    const root = koren(izlog({ primer }));
    return {
      primer,
      paleta: attr(root, "data-paleta"),
      layout: attr(root, "data-layout"),
      gustina: attr(root, "data-gustina"),
      naglasak: attr(root, "data-naglasak"),
      naslovnaPorodica: token(root, "--menu-heading-family"),
      tekstPorodica: token(root, "--menu-font-family"),
    };
  });
  const razliciti = (vrednosti: (string | undefined)[]) => new Set(vrednosti).size === vrednosti.length;

  test("palette, layout and heading font differ pairwise", () => {
    expect(razliciti(izgledi.map((izgled) => izgled.paleta))).toBe(true);
    expect(razliciti(izgledi.map((izgled) => izgled.layout))).toBe(true);
    expect(razliciti(izgledi.map((izgled) => izgled.naslovnaPorodica))).toBe(true);
    expect(razliciti(izgledi.map((izgled) => izgled.tekstPorodica))).toBe(true);
  });

  test("density and emphasis (as a pair) differ pairwise", () => {
    expect(razliciti(izgledi.map((izgled) => `${izgled.gustina}/${izgled.naglasak}`))).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Privremeno nedostupno
// -----------------------------------------------------------------------------

describe("Privremeno nedostupno", () => {
  const SLUCAJEVI: Over[] = [
    { primer: "kafic" },
    { primer: "restoran" }, // Kategorije: every category is rendered in turn
    { primer: "restoran", layout: "tok" },
    { primer: "prestizni" },
  ];
  for (const over of SLUCAJEVI) {
    test(`only the unavailable articles say so (${JSON.stringify(over)})`, () => {
      const prikaz = stranica(over);
      const rows = sviRedovi(prikaz);
      const ocekivani = prikaz.nedostupni.map(sidroArtikla).sort();
      expect(ocekivani.length).toBeGreaterThan(0);
      const sa = rows.filter((row) => / data-nedostupno=""/.test(prviTag(row.markup)));
      expect(sa.map((row) => row.id).sort()).toEqual(ocekivani);
      const ocekivaniSet = new Set(ocekivani);
      for (const row of rows) {
        expect(row.markup.includes(esc(d.unavailable)), row.id).toBe(ocekivaniSet.has(row.id));
      }
    });
  }
});

// -----------------------------------------------------------------------------
// Empty page
// -----------------------------------------------------------------------------

describe("stanje=prazno", () => {
  for (const primer of ["kafic", "restoran", "prestizni"]) {
    test(`${primer}: the empty-page message and no rows`, () => {
      const html = izlog({ primer, stanje: "prazno" });
      expect(html).toContain(esc(t.stanja.praznoNaslov));
      expect(html).toContain('data-stanje="prazno"');
      expect(count(html, "data-artikal")).toBe(0);
      expect(count(html, "<h1")).toBe(1);
    });
  }

  test("a multi-page menu offers the way back to the menu; a one-page menu has none and says to ask the staff", () => {
    const visestrani = izlog({ primer: "restoran", stanje: "prazno" });
    const otvori = linkovi(visestrani, "/demo-restoran/meni");
    expect(otvori).toContain(esc(t.stanja.otvoriMeni));
    expect(visestrani).not.toContain(esc(t.stanja.praznoPitajte));
    const jednostrani = izlog({ primer: "kafic", stanje: "prazno" });
    expect(linkovi(jednostrani, "/kafana-kod-mike/meni")).toEqual([]);
    expect(jednostrani).toContain(`>${esc(t.stanja.praznoPitajte)}</p>`);
    expect(jednostrani).toContain(esc(t.stanja.praznoOpis));
  });

  test("the empty page of a one-page menu in the editor preview also asks to turn to the staff", () => {
    const html = prikazi(stranica({ primer: "kafic", stanje: "prazno" }), { ugradjen: true });
    expect(html).toContain(esc(t.stanja.praznoNaslov));
    expect(html).toContain(esc(t.stanja.praznoPitajte));
  });
});

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

describe("pages of a multi-page menu", () => {
  test("the default page is called with the dictionary name, never the editor's name", () => {
    const prikaz = stranica({ primer: "restoran" });
    const html = prikazi(prikaz);
    const nav = /<nav\b[^>]*class="[^"]*straniceTraka[^"]*"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(attr(prviTag(nav), "aria-label")).toBe(t.navigacija.stranice);
    expect(linkovi(nav, "/demo-restoran/meni/glavni")).toEqual([esc(t.razdelnik.meni)]);
    expect(html).not.toContain(esc(d.defaultPageName));
  });

  test("another page shows its title under the venue name and is the current page in the navigation", () => {
    const prikaz = stranica({ primer: "restoran", stranica: "vinska-karta" });
    const html = prikazi(prikaz);
    const naslov = prikaz.view.stranica.title;
    expect(naslov).not.toBeNull();
    expect(prikaz.view.stranica.slug).toBe("vinska-karta");
    expect(html).toContain(`>${esc(naslov as string)}</p>`);
    const trenutna = [...html.matchAll(/<a\b[^>]*\saria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => match[1]);
    expect(trenutna).toEqual([esc(naslov as string)]);
  });
});

// -----------------------------------------------------------------------------
// Large menus
// -----------------------------------------------------------------------------

describe("stanje=veliki", () => {
  const MAX_ELEMENATA = 8000;

  for (const layout of ["tok", "kompaktno"] as const) {
    test(`${layout}: renders more than 300 rows within the DOM budget`, () => {
      const prikaz = stranica({ primer: "restoran", stanje: "veliki", layout });
      const html = prikazi(prikaz);
      const rows = redovi(html);
      const broj = elementi(html);
      console.info(
        `[K13 veliki] layout=${layout} markup=${html.length} bytes, elements=${broj}, rows=${rows.length}, ` +
          `buttons=${count(html, "<button")}, sections=${prikaz.view.sekcije.length}`,
      );
      expect(rows.length).toBeGreaterThan(300);
      expect(rows).toHaveLength(brojArtikala(prikaz.view.sekcije));
      expect(broj).toBeLessThanOrEqual(MAX_ELEMENATA);
      if (layout === "kompaktno") {
        // A long menu: no inline index (it would push the menu off the first screen), the contents
        // are the bar button and the dialog, which lists every section.
        expect(prikaz.view.sekcije.length).toBeGreaterThan(MENU_KRATAK_SADRZAJ);
        expect(/<nav\b[^>]*class="[^"]*indeks[^"]*"/.test(html)).toBe(false);
        expect(html).toContain(`aria-label="${esc(t.navigacija.otvoriSadrzaj)}"`);
        const dijalog = /<dialog\b[^>]*aria-labelledby="javni-sadrzaj-naslov"[^>]*>[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? "";
        expect(count(dijalog, 'href="#s-')).toBe(prikaz.view.sekcije.length);
      }
    });
  }

  test("kategorije: the grid is light; the categories together hold more than 300 rows", () => {
    const prikaz = stranica({ primer: "restoran", stanje: "veliki", layout: "kategorije" });
    const mreza = prikazi(prikaz);
    const brojMreze = elementi(mreza);
    console.info(`[K13 veliki] layout=kategorije (grid) markup=${mreza.length} bytes, elements=${brojMreze}, rows=0`);
    expect(count(mreza, 'data-kategorije="mreza"')).toBe(1);
    expect(count(mreza, "data-artikal")).toBe(0);
    expect(brojMreze).toBeLessThanOrEqual(MAX_ELEMENATA);

    let zbirRedova = 0;
    let najveciElementi = 0;
    let najveceBajtova = 0;
    for (const sekcija of neprazne(prikaz.view.sekcije)) {
      const html = prikazi(prikaz, { pocetnaKategorija: sekcija.key });
      const rows = redovi(html);
      expect(rows).toHaveLength(sekcija.articles.length);
      zbirRedova += rows.length;
      najveciElementi = Math.max(najveciElementi, elementi(html));
      najveceBajtova = Math.max(najveceBajtova, html.length);
    }
    console.info(
      `[K13 veliki] layout=kategorije (largest open category) markup=${najveceBajtova} bytes, elements=${najveciElementi}, ` +
        `rows in all categories=${zbirRedova}`,
    );
    expect(zbirRedova).toBeGreaterThan(300);
    expect(najveciElementi).toBeLessThanOrEqual(MAX_ELEMENATA);
  });

  test("the worst case (Tok with icons on every row) stays within the DOM budget", () => {
    const prikaz = stranica({ primer: "restoran", stanje: "veliki", layout: "tok", mediji: "ikonica" });
    const html = prikazi(prikaz);
    const broj = elementi(html);
    console.info(`[K13 veliki] layout=tok mediji=ikonica markup=${html.length} bytes, elements=${broj}, rows=${redovi(html).length}`);
    expect(broj).toBeLessThanOrEqual(MAX_ELEMENATA);
  });
});

// -----------------------------------------------------------------------------
// The editor form (ugradjen)
// -----------------------------------------------------------------------------

describe("the editor form (ugradjen)", () => {
  test("no landmarks, no h1, no <style>, no buttons; marked data-ugradjen", () => {
    const prikaz = stranica({ primer: "kafic" });
    const html = prikazi(prikaz, { ugradjen: true });
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<style");
    expect(html).toContain("data-ugradjen");
    expect(html).toContain(esc(prikaz.view.lokal.naziv));
    expect(redovi(html)).toHaveLength(brojArtikala(prikaz.view.sekcije));
  });

  test("the detail never opens, even with a starting detail", () => {
    const prikaz = stranica({ primer: "kafic", detalj: "1" });
    expect(prikaz.pocetniDetalj).not.toBeNull();
    expect(prikazi(prikaz, { ugradjen: true })).not.toContain("data-detalj");
    expect(prikazi(prikaz)).toContain("data-detalj");
  });

  for (const over of [{ primer: "kafic" }, { primer: "restoran" }, { primer: "prestizni" }]) {
    test(`nothing in the preview is a tab stop (${over.primer})`, () => {
      const html = bezDijaloga(prikazi(stranica(over), { ugradjen: true }));
      const fokusabilni = [...html.matchAll(/<(?:a|button|input|select|textarea)\b[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => attr(tag, "tabindex") !== "-1");
      expect(fokusabilni).toEqual([]);
    });
  }
});

// -----------------------------------------------------------------------------
// Promotion
// -----------------------------------------------------------------------------

describe("promotion", () => {
  const prikaz = stranica({ primer: "restoran", layout: "tok" });
  const html = prikazi(prikaz);
  const rows = redovi(html);
  const sAkcijom = sviArtikli(prikaz).filter((article) => article.promo !== null);

  test("an article with a running promotion shows the struck regular price and the label", () => {
    expect(sAkcijom.length).toBeGreaterThan(0);
    for (const article of sAkcijom) {
      const row = rows.find((candidate) => candidate.id === sidroArtikla(article.key))!;
      const cena = cenaPrikaz(article, prikaz.sadaMs);
      if (cena.vrsta !== "osnovna") throw new Error("the fixture promotion is expected on a base price");
      expect(cena.akcijska, article.name).not.toBeNull();
      expect(cena.akcijska as number).toBeLessThan(cena.rsd);
      const del = /<del\b[^>]*>([\s\S]*?)<\/del>/.exec(row.markup)?.[1] ?? "";
      expect(del, article.name).toContain(esc(t.artikal.redovnaCena));
      expect(bezTagova(del)).toBe(`${esc(t.artikal.redovnaCena)} ${formatRsd(cena.rsd)}`);
      // The promotion amount is named for screen readers too ("Akcijska cena"), right after the struck price.
      expect(row.markup).toMatch(
        new RegExp(
          `</del><span class="[^"]*">${esc(t.artikal.akcijskaCena)} </span>${formatRsd(cena.akcijska as number).replace(/\./g, "\\.")}<span class="[^"]*valuta[^"]*">RSD</span>`,
        ),
      );
      expect(count(row.markup, esc(t.artikal.akcijskaCena)), article.name).toBe(1);
      if (article.promo?.label === "promo") expect(row.markup).toContain(`>${esc(d.promoLabels.promo)}</li>`);
    }
    expect(count(html, "<del")).toBe(sAkcijom.length);
    expect(count(html, esc(t.artikal.akcijskaCena))).toBe(sAkcijom.length);
  });

  test("a row without a promotion has no struck price and no promotion price label", () => {
    const kljucevi = new Set(sAkcijom.map((article) => sidroArtikla(article.key)));
    for (const row of rows) {
      if (kljucevi.has(row.id)) continue;
      expect(row.markup, row.id).not.toContain("<del");
      expect(row.markup, row.id).not.toContain(esc(t.artikal.akcijskaCena));
    }
  });

  const aktivna = { active: true, mode: "percent", percent: 20, label: "promo" } as const;
  const clanakSaAkcijom = (promo: PublicArticle["promo"]) => clanak({ priceRsd: 1000, promo });

  test("only a promotion running at that moment counts (ended, scheduled and switched off show the regular price)", () => {
    const stanja: [string, PublicArticle["promo"]][] = [
      ["ended", { ...aktivna, endsAt: SADA - 1 }],
      ["scheduled", { ...aktivna, startsAt: SADA + DAN }],
      ["off", { ...aktivna, active: false }],
    ];
    for (const [naziv, promo] of stanja) {
      const markup = red(clanakSaAkcijom(promo));
      expect(markup, naziv).not.toContain("<del");
      expect(markup, naziv).not.toContain(esc(d.promoLabels.promo));
      expect(markup, naziv).not.toContain(esc(t.artikal.akcijskaCena));
      expect(markup, naziv).toContain(`${formatRsd(1000)}<span`);
    }
    const trenutno = red(clanakSaAkcijom({ ...aktivna, startsAt: SADA - DAN, endsAt: SADA + DAN }));
    expect(trenutno).toContain("<del");
    expect(trenutno).toContain(`>${esc(d.promoLabels.promo)}</li>`);
    expect(bezTagova(/<p\b[^>]*>[\s\S]*?<\/p>/.exec(trenutno)?.[0] ?? "")).toBe(
      `${esc(t.artikal.redovnaCena)} ${formatRsd(1000)}${esc(t.artikal.akcijskaCena)} ${formatRsd(800)}RSD`,
    );
  });

  test('badges: only "Akcija" and "Preporuka" are filled; every other tag is a plain outlined badge', () => {
    const markup = red(
      clanak({
        promo: aktivna,
        tags: ["vegan", "recommended", "spicy"],
      }),
    );
    const stavke = [...markup.matchAll(/<li class="([^"]*)">([^<]*)<\/li>/g)].map((match) => ({ klasa: match[1], tekst: match[2] }));
    const poTekstu = (tekst: string) => stavke.find((stavka) => stavka.tekst === esc(tekst));
    expect(stavke.map((stavka) => stavka.tekst)).toEqual(
      [d.promoLabels.promo, d.tags.vegan, d.tags.recommended, d.tags.spicy].map(esc),
    );
    expect(poTekstu(d.promoLabels.promo)?.klasa).toContain("oznakaAkcija");
    expect(poTekstu(d.promoLabels.promo)?.klasa).not.toContain("oznakaIstaknuta");
    expect(poTekstu(d.tags.recommended)?.klasa).toContain("oznakaIstaknuta");
    expect(poTekstu(d.tags.recommended)?.klasa).not.toContain("oznakaAkcija");
    for (const obicna of [d.tags.vegan, d.tags.spicy]) {
      const klasa = poTekstu(obicna)?.klasa ?? "";
      expect(klasa).toContain("oznaka");
      expect(klasa).not.toContain("oznakaAkcija");
      expect(klasa).not.toContain("oznakaIstaknuta");
    }
    // A "recommended" promotion label is the same filled "Preporuka".
    const poPromociji = red(clanak({ promo: { ...aktivna, label: "recommended" } }));
    expect(/<li class="([^"]*)">([^<]*)<\/li>/.exec(poPromociji)?.[1]).toContain("oznakaIstaknuta");
  });

  test('the "recommended" label shows "Preporuka" once, even when the article is also tagged so', () => {
    const preporuka = esc(d.tags.recommended);
    const sOba = red(clanak({ promo: { ...aktivna, label: "recommended" }, tags: ["recommended"] }));
    expect(count(sOba, `>${preporuka}</li>`)).toBe(1);
    expect(sOba).not.toContain(esc(d.promoLabels.promo));
    const samoOznaka = red(clanak({ tags: ["recommended"] }));
    expect(count(samoOznaka, `>${preporuka}</li>`)).toBe(1);
  });

  test("variants: each variant price is struck and reduced on its own", () => {
    const markup = red(
      clanak({
        priceRsd: null,
        variants: [
          { key: "v_mala", name: "Mala", priceRsd: 300 },
          { key: "v_velika", name: "Velika", priceRsd: 500 },
        ],
        promo: { active: true, mode: "percent", percent: 10, label: "promo" },
      }),
    );
    expect(count(markup, "<del")).toBe(2);
    expect(markup).toContain(`${formatRsd(270)}<span`);
    expect(markup).toContain(`${formatRsd(450)}<span`);
  });
});

// -----------------------------------------------------------------------------
// Detail
// -----------------------------------------------------------------------------

describe("article detail (detalj=1)", () => {
  const prikaz = stranica({ primer: "restoran", detalj: "1" });
  const html = prikazi(prikaz);
  const dijalog = dijalogDetalja(html);

  test("a labelled <dialog> with the article's h2 and a close button", () => {
    expect(prikaz.pocetniDetalj).not.toBeNull();
    expect(count(html, "<dialog")).toBe(1);
    const labela = attr(prviTag(dijalog), "aria-labelledby");
    expect(labela).toBeTruthy();
    const h2 = /<h2\b[^>]*>[\s\S]*?<\/h2>/.exec(dijalog)?.[0] ?? "";
    expect(attr(prviTag(h2), "id")).toBe(labela);
    // The title takes the focus when the sheet opens (programmatically only: not a tab stop).
    expect(attr(prviTag(h2), "tabindex")).toBe("-1");
    expect(prviTag(h2)).toContain("data-detalj-naslov");
    const article = nadji(prikaz, (candidate) => candidate.key === prikaz.pocetniDetalj);
    expect(bezTagova(h2)).toBe(esc(article.name));
    const zatvori = /<button\b[^>]*>/.exec(dijalog)?.[0] ?? "";
    expect(attr(zatvori, "aria-label")).toBe(t.detalj.zatvori);
  });

  test("the richest article is picked: promotion with the struck price and an add-on group with its rule", () => {
    const article = nadji(prikaz, (candidate) => candidate.key === prikaz.pocetniDetalj);
    expect(article.promo).not.toBeNull();
    expect(article.addonGroups.length).toBeGreaterThan(0);
    expect(dijalog).toContain("<del");
    expect(dijalog).toContain(esc(t.artikal.redovnaCena));
    expect(dijalog).toContain(esc(t.artikal.akcijskaCena));
    expect(dijalog).toContain(`>${esc(d.promoLabels.promo)}</li>`);
    // The base price sits right under the title, with no "Cena" heading of its own.
    expect(dijalog.indexOf("detaljCena")).toBeGreaterThan(dijalog.indexOf("</h2>"));
    expect(dijalog.indexOf("detaljCena")).toBeLessThan(dijalog.indexOf("<del"));
    for (const grupa of article.addonGroups) {
      // The group name is a paragraph, followed by its rule in parentheses.
      expect(dijalog).toMatch(new RegExp(`<p class="[^"]*detaljGrupa[^"]*">${esc(grupa.name)} `));
      const pravilo = grupa.selection === "single" ? t.detalj.biraSeJedno : t.detalj.biraSeVise;
      if (grupa.selection === "multiple" && grupa.minSelect === grupa.maxSelect) {
        // Exactly N: "obavezno, tačno N" — no "može više".
        expect(grupa.required).toBe(true);
        expect(dijalog).toContain(`(${esc(t.detalj.obavezno)}, ${esc(fmt(t.detalj.izborTacno, { n: grupa.maxSelect }))})`);
        expect(dijalog).not.toContain(esc(pravilo));
      } else {
        expect(dijalog).toContain(esc(pravilo));
        if (grupa.required) expect(dijalog).toContain(esc(t.detalj.obavezno));
      }
      for (const opcija of grupa.options) {
        expect(dijalog).toContain(esc(opcija.name));
        if (opcija.priceDeltaRsd > 0) expect(dijalog).toContain(`+${formatRsd(opcija.priceDeltaRsd)}`);
      }
    }
  });

  test("an article with variants lists every variant with its price", () => {
    const sVarijantama = nadji(prikaz, (article) => article.variants.length > 0 && (article.allergens?.contains.length ?? 0) > 0);
    const markup = dijalogDetalja(prikazi(prikaz, { pocetniDetalj: sVarijantama.key }));
    expect(markup).toContain(`>${esc(t.detalj.varijante)}</h3>`);
    for (const varijanta of sVarijantama.variants) {
      expect(markup).toContain(`<span>${esc(varijanta.name)}</span>`);
      expect(markup).toContain(`>${formatRsd(varijanta.priceRsd)}<span class="`);
    }
  });

  test("a single-choice add-on group says so", () => {
    const sJednim = nadji(prikaz, (article) => article.addonGroups.some((grupa) => grupa.selection === "single"));
    const markup = dijalogDetalja(prikazi(prikaz, { pocetniDetalj: sJednim.key }));
    expect(markup).toContain(esc(t.detalj.biraSeJedno));
  });

  test("with allergens on, the block names what the article contains and shows the disclaimer", () => {
    const sAlergenima = nadji(prikaz, (article) => (article.allergens?.contains.length ?? 0) > 0);
    const markup = dijalogDetalja(prikazi(prikaz, { pocetniDetalj: sAlergenima.key }));
    expect(markup).toContain("data-alergeni");
    expect(markup).toContain(esc(d.allergenKinds.contains));
    for (const kod of sAlergenima.allergens?.contains ?? []) {
      expect(markup).toContain(esc(d.allergens[kod as keyof typeof d.allergens]));
    }
    expect(markup).toContain(esc(d.allergenDisclaimer));
  });

  test("without the allergen system (the café) there is no allergen block", () => {
    const kafic = stranica({ primer: "kafic", detalj: "1" });
    expect(kafic.view.alergeniUkljuceni).toBe(false);
    const markup = dijalogDetalja(prikazi(kafic));
    expect(markup).not.toContain("data-alergeni");
    expect(markup).not.toContain(esc(d.allergenDisclaimer));
  });

  test("the dialog opens in every layout; Kompaktno has no image in it", () => {
    for (const layout of ["tok", "kategorije", "kompaktno"]) {
      const markup = prikazi(stranica({ primer: "restoran", detalj: "1", layout }));
      expect(dijalogDetalja(markup), layout).toContain(`aria-label="${esc(t.detalj.zatvori)}"`);
    }
    const kompaktno = dijalogDetalja(prikazi(stranica({ primer: "restoran", detalj: "1", layout: "kompaktno" })));
    expect(kompaktno).not.toContain("<img");
  });
});

describe("DetaljSadrzaj with hand-made articles", () => {
  const dodaci = (over: Partial<PublicArticle["addonGroups"][number]> = {}): PublicArticle["addonGroups"] => [
    {
      key: "ag_probna",
      name: "Grupa dodataka",
      selection: "multiple",
      required: false,
      minSelect: 0,
      maxSelect: 3,
      options: [
        { key: "ao_1", name: "Dodatak A", priceDeltaRsd: 0 },
        { key: "ao_2", name: "Dodatak B", priceDeltaRsd: 60 },
        { key: "ao_3", name: "Dodatak C", priceDeltaRsd: 0 },
        { key: "ao_4", name: "Dodatak D", priceDeltaRsd: 0 },
      ],
      ...over,
    },
  ];

  test("allergens unknown (null) with the system on: says the venue entered none", () => {
    const html = detalj(clanak({ allergens: null }));
    expect(html).toContain("data-alergeni");
    expect(html).toContain(esc(t.detalj.alergeniNepoznato));
    expect(html).toContain(esc(d.allergenDisclaimer));
  });

  test("allergen system off: no allergen block, no disclaimer", () => {
    const html = detalj(clanak({ allergens: { contains: ["gluten"], mayContain: [], otherText: null } }), { alergeniUkljuceni: false });
    expect(html).not.toContain("data-alergeni");
    expect(html).not.toContain(esc(d.allergenDisclaimer));
    expect(html).not.toContain(esc(d.allergens.gluten));
    expect(html).not.toContain(esc(t.detalj.alergeniNepoznato));
  });

  test("contains and may-contain lists are named with the allergen dictionary", () => {
    const html = detalj(
      clanak({ allergens: { contains: ["gluten", "milk"], mayContain: ["nuts", "sesame"], otherText: "Probni tekst" } }),
    );
    const sadrzi = /<p\b[^>]*data-alergeni-sadrzi=""[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(bezTagova(sadrzi)).toBe(`${esc(d.allergenKinds.contains)}: ${esc(d.allergens.gluten)}, ${esc(d.allergens.milk)}`);
    const tragovi = /<p\b[^>]*data-alergeni-tragovi=""[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(bezTagova(tragovi)).toBe(`${esc(d.allergenKinds.mayContain)}: ${esc(d.allergens.nuts)}, ${esc(d.allergens.sesame)}`);
    expect(html).toContain(esc(fmt(t.detalj.drugo, { tekst: "Probni tekst" })));
    expect(html).not.toContain(esc(t.detalj.alergeniNepoznato));
    expect(html).not.toContain(esc(t.detalj.alergeniNista));
  });

  test("only may-contain: no contains line; an empty record says no allergens were named", () => {
    const samoTragovi = detalj(clanak({ allergens: { contains: [], mayContain: ["eggs"], otherText: null } }));
    expect(samoTragovi).not.toContain("data-alergeni-sadrzi");
    expect(samoTragovi).toContain("data-alergeni-tragovi");
    const prazno = detalj(clanak({ allergens: { contains: [], mayContain: [], otherText: null } }));
    expect(prazno).toContain(esc(t.detalj.alergeniNista));
    expect(prazno).not.toContain("data-alergeni-sadrzi");
  });

  test("combo components are listed; a quantity above 1 is shown, 1 is not", () => {
    const html = detalj(
      clanak({
        kind: "combo",
        combo: {
          components: [
            { articleKey: "ar_deo1", name: "Prvi deo", quantity: 2 },
            { articleKey: "ar_deo2", name: "Drugi deo", quantity: 1 },
          ],
        },
      }),
    );
    expect(html).toContain(`>${esc(t.detalj.sastav)}</h3>`);
    const stavke = [...html.matchAll(/<li class="[^"]*detaljStavka[^"]*">([\s\S]*?)<\/li>/g)].map((match) => bezTagova(match[1]));
    expect(stavke).toEqual([`${esc(fmt(t.detalj.kolicinaKomada, { n: 2 }))} Prvi deo`, "Drugi deo"]);
  });

  test("the quantity is written with a decimal comma", () => {
    expect(detalj(clanak({ quantityValue: 0.33, quantityUnit: "l" }))).toContain(">0,33 l<");
    expect(detalj(clanak({ quantityValue: 250, quantityUnit: "g" }))).toContain(">250 g<");
    expect(detalj(clanak())).not.toContain("detaljKolicina");
  });

  test("unavailable: the label shows and the body is marked", () => {
    const html = detalj(clanak(), { nedostupan: true });
    expect(html).toContain(esc(d.unavailable));
    expect(html).toContain('data-nedostupno=""');
    const dostupan = detalj(clanak());
    expect(dostupan).not.toContain(esc(d.unavailable));
    expect(dostupan).not.toContain("data-nedostupno");
  });

  test("the h2 carries the given id (the dialog is labelled by it) and can take the focus", () => {
    const html = detalj(clanak({ name: "Naziv probe" }), { naslovId: "id-probe" });
    expect(html).toContain('<h2 id="id-probe"');
    const h2 = /<h2\b[^>]*>/.exec(html)?.[0] ?? "";
    expect(attr(h2, "tabindex")).toBe("-1");
    expect(h2).toContain("data-detalj-naslov");
    expect(naslovi(html, 2)).toEqual(["Naziv probe"]);
  });

  test("variants: a heading, every variant and its price; no single price under the title", () => {
    const html = detalj(
      clanak({
        priceRsd: null,
        variants: [
          { key: "v1", name: "Mala", priceRsd: 1500 },
          { key: "v2", name: "Velika", priceRsd: 2200 },
        ],
      }),
    );
    expect(html).toContain(`>${esc(t.detalj.varijante)}</h3>`);
    expect(html).not.toContain("detaljCena");
    expect(html).toContain(`<span>Mala</span>`);
    expect(html).toContain(`>${formatRsd(1500)}<span class="`);
    expect(html).toContain(`>${formatRsd(2200)}<span class="`);
    expect(formatRsd(1500)).toBe("1.500");
  });

  test("a base price sits right under the title (and the quantity), with no price heading", () => {
    const sKolicinom = detalj(clanak({ priceRsd: 1490, quantityValue: 0.33, quantityUnit: "l" }), { alergeniUkljuceni: false });
    expect(sKolicinom).toMatch(
      /<\/h2><p class="[^"]*detaljKolicina[^"]*">0,33 l<\/p><p class="[^"]*detaljCena[^"]*">1\.490<span class="[^"]*valuta[^"]*">RSD<\/span><\/p>/,
    );
    const bez = detalj(clanak({ priceRsd: 1490 }), { alergeniUkljuceni: false });
    expect(bez).toMatch(/<\/h2><p class="[^"]*detaljCena[^"]*">1\.490<span/);
    // Nothing below the title is headed "Cena": no h3 at all for a plain article.
    expect(count(bez, "<h3")).toBe(0);
    expect(count(bez, "<del")).toBe(0);
  });

  test("an article without a price has no price block", () => {
    const html = detalj(clanak({ priceRsd: null }));
    expect(html).not.toContain("detaljCena");
    expect(html).not.toContain(`>${esc(t.detalj.varijante)}</h3>`);
  });

  test("add-on rules: single, multiple, required, exactly N, with and without a limit", () => {
    const jedno = detalj(clanak({ addonGroups: dodaci({ selection: "single", minSelect: 0, maxSelect: 1 }) }));
    expect(jedno).toContain(`(${esc(t.detalj.biraSeJedno)})`);
    const jednoObavezno = detalj(clanak({ addonGroups: dodaci({ selection: "single", required: true, minSelect: 1, maxSelect: 1 }) }));
    expect(jednoObavezno).toContain(`(${esc(t.detalj.biraSeJedno)}, ${esc(t.detalj.obavezno)})`);
    // Exactly N of a multiple group: "obavezno, tačno N" and no "može više".
    const tacno = detalj(clanak({ addonGroups: dodaci({ selection: "multiple", required: true, minSelect: 2, maxSelect: 2 }) }));
    expect(tacno).toContain(`(${esc(t.detalj.obavezno)}, ${esc(fmt(t.detalj.izborTacno, { n: 2 }))})`);
    expect(tacno).not.toContain(esc(t.detalj.biraSeVise));
    const tacnoSve = detalj(clanak({ addonGroups: dodaci({ selection: "multiple", required: true, minSelect: 4, maxSelect: 4 }) }));
    expect(tacnoSve).toContain(`(${esc(t.detalj.obavezno)}, ${esc(fmt(t.detalj.izborTacno, { n: 4 }))})`);
    expect(tacnoSve).not.toContain(esc(t.detalj.biraSeVise));
    const doTri = detalj(clanak({ addonGroups: dodaci({ selection: "multiple", minSelect: 0, maxSelect: 3 }) }));
    expect(doTri).toContain(`(${esc(t.detalj.biraSeVise)}, ${esc(fmt(t.detalj.izborDo, { max: 3 }))})`);
    const obavezno = detalj(clanak({ addonGroups: dodaci({ selection: "multiple", required: true, minSelect: 2, maxSelect: 3 }) }));
    expect(obavezno).toContain(
      `(${esc(t.detalj.biraSeVise)}, ${esc(t.detalj.obavezno)}, ${esc(fmt(t.detalj.izborOdDo, { min: 2, max: 3 }))})`,
    );
    const bezOgranicenja = detalj(clanak({ addonGroups: dodaci({ selection: "multiple", minSelect: 0, maxSelect: 4 }) }));
    expect(bezOgranicenja).toContain(`(${esc(t.detalj.biraSeVise)})`);
    expect(bezOgranicenja).not.toContain(esc(fmt(t.detalj.izborDo, { max: 4 })));
  });

  test("add-on options list the surcharge only when there is one; the group name is a paragraph", () => {
    const html = detalj(clanak({ addonGroups: dodaci() }));
    expect(html).toContain(`>${esc(t.detalj.dodaci)}</h3>`);
    expect(html).toMatch(/<p class="[^"]*detaljGrupa[^"]*">Grupa dodataka <span/);
    expect(count(html, "<h3")).toBe(2); // "Dodaci" and the allergen block's heading; the group is not a heading
    expect(count(html, `+${formatRsd(60)}`)).toBe(1);
    expect(count(html, "+0")).toBe(0);
    for (const ime of ["Dodatak A", "Dodatak B", "Dodatak C", "Dodatak D"]) expect(html).toContain(`<span>${ime}</span>`);
  });

  test("a running promotion shows its end date; one that ended shows the regular price only", () => {
    const kraj = SADA + 3 * DAN;
    const aktivna = detalj(clanak({ priceRsd: 1000, promo: { active: true, mode: "percent", percent: 20, label: "promo", endsAt: kraj } }));
    expect(aktivna).toContain("<del");
    expect(aktivna).toContain(esc(fmt(t.detalj.akcijaDo, { datum: formatBelgradeDate(kraj) })));
    const zavrsena = detalj(clanak({ priceRsd: 1000, promo: { active: true, mode: "percent", percent: 20, label: "promo", endsAt: SADA - DAN } }));
    expect(zavrsena).not.toContain("<del");
    expect(zavrsena).not.toContain(esc(t.artikal.akcijskaCena));
    expect(zavrsena).not.toContain(esc(fmt(t.detalj.akcijaDo, { datum: formatBelgradeDate(SADA - DAN) })));
  });

  test("the promotion shows both prices to a screen reader and its end date once, after the price or the variants", () => {
    const kraj = SADA + 3 * DAN;
    const napomena = esc(fmt(t.detalj.akcijaDo, { datum: formatBelgradeDate(kraj) }));
    const osnovna = detalj(clanak({ priceRsd: 1000, promo: { active: true, mode: "percent", percent: 20, label: "promo", endsAt: kraj } }));
    expect(osnovna).toContain(`<span class="`); // the two sr-only labels
    expect(osnovna).toContain(`${esc(t.artikal.redovnaCena)} </span>${formatRsd(1000)}</del>`);
    expect(osnovna).toContain(`${esc(t.artikal.akcijskaCena)} </span>${formatRsd(800)}<span`);
    expect(count(osnovna, napomena)).toBe(1);
    expect(osnovna.indexOf(napomena)).toBeGreaterThan(osnovna.indexOf("detaljCena"));
    const varijante = detalj(
      clanak({
        priceRsd: null,
        variants: [
          { key: "v1", name: "Mala", priceRsd: 300 },
          { key: "v2", name: "Velika", priceRsd: 500 },
        ],
        promo: { active: true, mode: "percent", percent: 10, label: "promo", endsAt: kraj },
      }),
    );
    expect(count(varijante, "<del")).toBe(2);
    expect(count(varijante, esc(t.artikal.akcijskaCena))).toBe(2);
    expect(count(varijante, napomena)).toBe(1);
    expect(varijante.indexOf(napomena)).toBeGreaterThan(varijante.indexOf(esc(t.detalj.varijante)));
    expect(varijante).not.toContain("detaljCena");
  });

  test("the large image shows for Tok and Kategorije when it is resolved, never for Kompaktno", () => {
    const article = clanak({ media: { mode: "image", imageMediaId: "m_probna", iconKey: null } });
    const slike = { m_probna: { thumbUrl: "/probna-mala.jpg", url: "/probna-velika.jpg", width: 800, height: 500 } };
    const tok = detalj(article, { slike });
    expect(tok).toContain('src="/probna-velika.jpg"');
    expect(attr(/<img\b[^>]*>/.exec(tok)?.[0] ?? "", "alt")).toBe("");
    expect(detalj(article, { slike, layout: "compact" })).not.toContain("<img");
    expect(detalj(article, { slike: {} })).not.toContain("<img");
  });
});

// -----------------------------------------------------------------------------
// Whole-markup rules
// -----------------------------------------------------------------------------

describe("rules that hold for every rendered state", () => {
  const PRIMERI = ["kafic", "restoran", "prestizni"];
  const LAYOUTI = ["tok", "kategorije", "kompaktno"];
  const MEDIJI = ["slika", "ikonica", "bez"];
  const STANJA: Over[] = [
    { detalj: "1" },
    { kategorija: "1" },
    { kategorija: "2", detalj: "1" },
    { stanje: "razdelnik" },
    { stanje: "prazno" },
    { stranica: "vinska-karta" },
  ];
  const matrica: Over[] = [];
  for (const primer of PRIMERI) {
    for (const layout of LAYOUTI) {
      for (const mediji of MEDIJI) matrica.push({ primer, layout, mediji });
      matrica.push({ primer, layout, detalj: "1" });
    }
    for (const stanje of STANJA) matrica.push({ primer, ...stanje });
  }

  // One render per state, shared by the four tests below.
  let renderi: { over: Over; html: string }[] | null = null;
  const sviRenderi = () => (renderi ??= matrica.map((over) => ({ over, html: izlog(over) })));

  test("the matrix is big enough to mean something", () => {
    expect(matrica.length).toBeGreaterThan(50);
    expect(sviRenderi().every((render) => render.html.length > 0)).toBe(true);
  });

  test('every svg is aria-hidden="true"', () => {
    const bez: string[] = [];
    for (const { over, html } of sviRenderi()) {
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) {
        if (attr(svg, "aria-hidden") !== "true") bez.push(`${JSON.stringify(over)}: ${svg}`);
      }
    }
    expect(bez).toEqual([]);
  });

  test("the frame's <style> hides the theme toggle, then paints html in the venue's page colour", () => {
    const pogresni: string[] = [];
    for (const { over, html } of sviRenderi()) {
      const stilovi = html.match(/<style>[\s\S]*?<\/style>/g) ?? [];
      const stil = /^<style>\[data-theme-toggle="global"\]\{display:none!important\}html\{background:(#[0-9a-fA-F]{3,8})\}<\/style>$/.exec(stilovi[0] ?? "");
      if (stilovi.length !== 1 || !stil || stil[1] !== token(koren(html), "--menu-page")) pogresni.push(JSON.stringify(over));
    }
    expect(pogresni).toEqual([]);
    // Three different venues, three different page colours.
    const boje = new Set(
      ["kafic", "restoran", "prestizni"].map((primer) => /html\{background:([^}]*)\}/.exec(izlog({ primer }))?.[1]),
    );
    expect(boje.size).toBe(3);
  });

  test('"Kompletan meni" (the default page name of the editor) never reaches a guest', () => {
    const sa = sviRenderi()
      .filter(({ html }) => html.includes(esc(d.defaultPageName)))
      .map(({ over }) => JSON.stringify(over));
    expect(sa).toEqual([]);
  });

  test("every state has exactly one h1 and one main", () => {
    const pogresni = sviRenderi()
      .filter(({ html }) => naslovi(html, 1).length !== 1 || count(html, "<main") !== 1)
      .map(({ over }) => JSON.stringify(over));
    expect(pogresni).toEqual([]);
  });

  test("every <img> in the public menu is decorative (alt is empty)", () => {
    const pogresni: string[] = [];
    for (const { over, html } of sviRenderi()) {
      for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
        if (attr(img, "alt") !== "") pogresni.push(`${JSON.stringify(over)}: ${img}`);
      }
    }
    expect(pogresni).toEqual([]);
  });
});
