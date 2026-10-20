// K14 render tests: the guest's tools on the public menu (search, filters,
// allergens, languages, EUR) over the izlog fixtures, which go through the REAL
// publish path (fixtureMenu -> compileSnapshot -> parsePublicPage). Server
// markup only (renderToStaticMarkup, no DOM). Texts come from the dictionaries,
// never typed in Serbian here; the only literals are fixture facts (an invented
// venue and its English names from PREVODI_EN).

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { javniIzlog, type JavniIzlogPrikaz } from "@/components/menu/fixtures/javni";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { epochToBelgradeLocal } from "@/lib/belgrade-time";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { brojUpozorenja } from "@/lib/menu/allergen-warnings";
import { datumKursa, eurIzRsd, formatEur, iznosEur, kursJeSvez, type MenuKurs } from "@/lib/menu/currency";
import { dostupniFilteri } from "@/lib/menu/filters";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { brojArtikala, sidroArtikla, type JavnaStranicaView } from "@/lib/menu/public-view";
import { pretraziStranicu } from "@/lib/menu/search";
import type { PublicArticle, PublicSection } from "@/lib/menu/snapshot";
import { JavniMeni, type JavniPocetno } from "./javni-meni";

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
const DAN = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in javni.test.tsx)
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
  const value = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The inner markup of every <h{nivo}>. */
function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
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

/** The detail <dialog> of an open article. */
function dijalogDetalja(html: string): string {
  const dijalog = /<dialog\b[^>]*\sdata-detalj="[^"]*"[^>]*>[\s\S]*?<\/dialog>/.exec(html)?.[0];
  if (!dijalog) throw new Error("no article detail <dialog> in the markup");
  return dijalog;
}

type Over = Record<string, string>;
type StranicaPrikaz = Extract<JavniIzlogPrikaz, { vrsta: "stranica" }>;

const izlog = (over: Over) => renderToStaticMarkup(<JavniIzlog params={parsePublicPreview(over)} />);

function stranica(over: Over): StranicaPrikaz {
  const prikaz = javniIzlog(parsePublicPreview(over));
  if (prikaz.vrsta !== "stranica") throw new Error(`expected a menu page for ${JSON.stringify(over)}`);
  return prikaz;
}

type PrikaziExtra = {
  view?: JavnaStranicaView;
  kurs?: MenuKurs | null;
  pocetno?: JavniPocetno;
  pocetniDetalj?: string | null;
  pocetnaKategorija?: string | null;
};

/** What the izlog renders for a page (kurs, starting choices and language links included), with parts overridden. */
function prikazi(prikaz: StranicaPrikaz, extra: PrikaziExtra = {}): string {
  return renderToStaticMarkup(
    <JavniMeni
      view={extra.view ?? prikaz.view}
      izgled={javniIzgled(prikaz.presentation)}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={prikaz.nedostupni}
      pocetniDetalj={extra.pocetniDetalj !== undefined ? extra.pocetniDetalj : prikaz.pocetniDetalj}
      pocetnaKategorija={extra.pocetnaKategorija !== undefined ? extra.pocetnaKategorija : prikaz.pocetnaKategorija}
      kurs={extra.kurs !== undefined ? extra.kurs : prikaz.kurs}
      pocetno={extra.pocetno ?? prikaz.pocetno}
      jezikLinkovi={prikaz.jezikLinkovi}
      cuvaj={false}
    />,
  );
}

const sviArtikli = (prikaz: StranicaPrikaz) => prikaz.view.sekcije.flatMap((sekcija) => sekcija.articles);
const neprazne = (sekcije: readonly PublicSection[]) => sekcije.filter((sekcija) => sekcija.articles.length > 0);
const poId = (prikaz: StranicaPrikaz) => new Map(sviArtikli(prikaz).map((article) => [sidroArtikla(article.key), article]));

const sadrziMleko = (article: PublicArticle) => article.allergens?.contains.includes("milk") === true;
const tragoviMleka = (article: PublicArticle) =>
  article.allergens !== null && !article.allergens.contains.includes("milk") && article.allergens.mayContain.includes("milk");

/** What the warning of an article should be while only milk is marked. */
function ocekivano(article: PublicArticle): "sadrzi" | "tragovi" | "nepoznato" | undefined {
  if (article.allergens === null) return "nepoznato";
  if (sadrziMleko(article)) return "sadrzi";
  if (tragoviMleka(article)) return "tragovi";
  return undefined;
}

/** The text a screen reader or a guest could read, one line (no tags, no styles). */
const tekst = (html: string) => bezTagova(html.replace(/<style[\s\S]*?<\/style>/g, ""));
const nijeBezbedno = (html: string) => expect(tekst(html)).not.toMatch(/bezbedn|\bsafe\b/i);

/** The rows of an open category over a page, with every row of the page checked against its article. */
function proveriRedove(rows: Red[], artikli: Map<string, PublicArticle>) {
  for (const row of rows) {
    const article = artikli.get(row.id);
    expect(article, row.id).toBeDefined();
    const ocekivana = ocekivano(article as PublicArticle);
    expect(attr(prviTag(row.markup), "data-upozorenje"), (article as PublicArticle).name).toBe(ocekivana);
    if (ocekivana === "sadrzi") {
      expect(row.markup).toContain(esc(d.allergenKinds.contains));
      expect(row.markup).toContain(esc(t.alergeni.kratko.milk));
    } else if (ocekivana === "tragovi") {
      expect(row.markup).toContain(esc(d.allergenKinds.mayContain));
      expect(row.markup).toContain(esc(t.alergeni.kratko.milk));
      expect(row.markup).not.toContain(esc(`${d.allergenKinds.contains}:`));
    } else if (ocekivana === "nepoznato") {
      expect(row.markup).toContain(esc(t.alergeni.nepoznato));
    } else {
      expect(row.markup).not.toContain("data-upozorenje");
    }
  }
}

/** The 1-based position (as `kategorija=N`) of the first non-empty section that has a milk article. */
function kategorijaSaMlekom(prikaz: StranicaPrikaz): number {
  const index = neprazne(prikaz.view.sekcije).findIndex((sekcija) => sekcija.articles.some(sadrziMleko));
  if (index < 0) throw new Error("no section with a milk article in the fixture");
  return index + 1;
}

// -----------------------------------------------------------------------------
// A. Allergens warn, never hide
// -----------------------------------------------------------------------------

describe("a marked allergen warns on the card and in the detail, and the article stays visible", () => {
  test("Tok: the same rows with and without the marked allergen, warnings on the right ones", () => {
    const sa = stranica({ primer: "restoran", layout: "tok", alergen: "mleko" });
    const bez = stranica({ primer: "restoran", layout: "tok" });
    const htmlSa = prikazi(sa);
    const htmlBez = prikazi(bez);
    const rowsSa = redovi(htmlSa);
    const rowsBez = redovi(htmlBez);

    expect(sa.view.alergeniUkljuceni).toBe(true);
    expect(sa.pocetno.alergeni).toEqual(["milk"]);
    expect(rowsBez.length).toBeGreaterThan(0);
    // Nothing is hidden: the same articles in the same order.
    expect(rowsSa).toHaveLength(brojArtikala(sa.view.sekcije));
    expect(rowsSa.map((row) => row.id)).toEqual(rowsBez.map((row) => row.id));
    // Without the choice no row warns.
    expect(count(htmlBez, "data-upozorenje")).toBe(0);

    const artikli = poId(sa);
    expect(rowsSa.filter((row) => attr(prviTag(row.markup), "data-upozorenje") === "sadrzi").length).toBeGreaterThan(0);
    proveriRedove(rowsSa, artikli);
    // Every article that lists milk as an ingredient warns; a trace-only one says traces.
    for (const article of sviArtikli(sa).filter(sadrziMleko)) {
      const row = rowsSa.find((candidate) => candidate.id === sidroArtikla(article.key));
      expect(attr(prviTag(row?.markup ?? ""), "data-upozorenje"), article.name).toBe("sadrzi");
    }
    for (const article of sviArtikli(sa).filter(tragoviMleka)) {
      const row = rowsSa.find((candidate) => candidate.id === sidroArtikla(article.key));
      expect(attr(prviTag(row?.markup ?? ""), "data-upozorenje"), article.name).toBe("tragovi");
    }
    nijeBezbedno(htmlSa);
  });

  test("Tok: the allergen button, the bar with the disclaimer and the count of warnings", () => {
    const sa = stranica({ primer: "restoran", layout: "tok", alergen: "mleko" });
    const html = prikazi(sa);
    expect(count(html, "data-alergeni-dugme")).toBe(1);
    expect(html).toContain(esc(fmt(t.alergeni.dugmeBroj, { n: 1 })));
    // The drawer is mounted only after opening.
    expect(html).not.toContain("data-alergeni-fioka");

    const traka = /<div\b[^>]*data-alergeni-traka=""[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0];
    expect(traka).toBeDefined();
    expect(traka).toContain(esc(d.allergenDisclaimer));
    expect(traka).toContain(esc(fmt(t.alergeni.oznaceno, { lista: t.alergeni.kratko.milk })));
    const n = brojUpozorenja(sa.view.sekcije, ["milk"], true);
    expect(n).toBeGreaterThan(0);
    expect(traka).toContain(esc(fmt(t.alergeni.brojUpozorenja[srPluralCategory(n)], { n })));
  });

  test("Tok: the detail of a milk article shows the warning and the structured allergens", () => {
    const sa = stranica({ primer: "restoran", layout: "tok", alergen: "mleko" });
    const sMlekom = sviArtikli(sa).find(sadrziMleko);
    expect(sMlekom).toBeDefined();
    const dijalog = dijalogDetalja(prikazi(sa, { pocetniDetalj: (sMlekom as PublicArticle).key }));
    expect(attr(prviTag(dijalog), "data-detalj")).toBe((sMlekom as PublicArticle).key);
    expect(dijalog).toContain('data-upozorenje="sadrzi"');
    expect(dijalog).toContain(esc(d.allergenKinds.contains));
    expect(dijalog).toContain(esc(t.alergeni.kratko.milk));
    expect(dijalog).toContain("data-alergeni-sadrzi");
    expect(dijalog).toContain(esc(d.allergenDisclaimer));
    nijeBezbedno(dijalog);
  });

  test("Tok: detalj=1 opens the richest article and its detail carries the warning it should", () => {
    const sa = stranica({ primer: "restoran", layout: "tok", alergen: "mleko", detalj: "1" });
    expect(sa.pocetniDetalj).not.toBeNull();
    const html = prikazi(sa);
    const dijalog = dijalogDetalja(html);
    const article = sviArtikli(sa).find((candidate) => candidate.key === sa.pocetniDetalj) as PublicArticle;
    const ocekivana = ocekivano(article);
    if (ocekivana === "nepoznato") {
      // "No data" is said once, by the allergen block, never as "safe".
      expect(dijalog).not.toContain("data-upozorenje");
      expect(count(dijalog, esc(t.detalj.alergeniNepoznato))).toBe(1);
    } else if (ocekivana) expect(dijalog).toContain(`data-upozorenje="${ocekivana}"`);
    else expect(dijalog).not.toContain("data-upozorenje");
    expect(dijalog).toContain("data-alergeni=");
    expect(dijalog).toContain(esc(d.allergenDisclaimer));
    // The same render through the izlog route component.
    expect(izlog({ primer: "restoran", layout: "tok", alergen: "mleko", detalj: "1" })).toContain(
      `data-detalj="${sa.pocetniDetalj}"`,
    );
    // The detail does not hide the rows behind it.
    expect(redovi(html)).toHaveLength(brojArtikala(sa.view.sekcije));
  });

  test("Kategorije: an open category keeps every article and warns on the milk ones", () => {
    const probna = stranica({ primer: "restoran", layout: "kategorije", alergen: "mleko" });
    const n = kategorijaSaMlekom(probna);
    const over = { primer: "restoran", layout: "kategorije", kategorija: String(n) };
    const sa = stranica({ ...over, alergen: "mleko" });
    const bez = stranica(over);
    expect(sa.pocetnaKategorija).not.toBeNull();
    const sekcija = neprazne(sa.view.sekcije)[n - 1];

    const rowsSa = redovi(prikazi(sa));
    const rowsBez = redovi(prikazi(bez));
    expect(rowsBez).toHaveLength(sekcija.articles.length);
    expect(rowsSa.map((row) => row.id)).toEqual(rowsBez.map((row) => row.id));
    expect(rowsSa.filter((row) => attr(prviTag(row.markup), "data-upozorenje") === "sadrzi").length).toBeGreaterThan(0);
    proveriRedove(rowsSa, poId(sa));
    expect(count(prikazi(bez), "data-upozorenje")).toBe(0);
    nijeBezbedno(prikazi(sa));
  });

  test("Kategorije: the detail of a milk article warns as well", () => {
    const sa = stranica({ primer: "restoran", layout: "kategorije", alergen: "mleko" });
    const sMlekom = sviArtikli(sa).find(sadrziMleko) as PublicArticle;
    const dijalog = dijalogDetalja(prikazi(sa, { pocetniDetalj: sMlekom.key }));
    expect(dijalog).toContain('data-upozorenje="sadrzi"');
    expect(dijalog).toContain(esc(t.alergeni.kratko.milk));
  });

  test("Kompaktno: the warning is text only (no svg in any row) and nothing is hidden", () => {
    const sa = stranica({ primer: "prestizni", alergen: "mleko" });
    const bez = stranica({ primer: "prestizni" });
    expect(sa.presentation.layout).toBe("compact");
    const htmlSa = prikazi(sa);
    const rowsSa = redovi(htmlSa);
    const rowsBez = redovi(prikazi(bez));
    expect(rowsSa.length).toBeGreaterThan(0);
    expect(rowsSa.map((row) => row.id)).toEqual(rowsBez.map((row) => row.id));
    expect(rowsSa).toHaveLength(brojArtikala(sa.view.sekcije));
    expect(rowsSa.filter((row) => attr(prviTag(row.markup), "data-upozorenje") === "sadrzi").length).toBeGreaterThan(0);
    proveriRedove(rowsSa, poId(sa));
    for (const row of rowsSa) expect(row.markup, row.id).not.toContain("<svg");
    for (const row of rowsSa.filter((candidate) => candidate.markup.includes('role="note"'))) {
      expect(row.markup, row.id).toContain('data-bez-ikonice=""');
    }
    expect(htmlSa).toContain(esc(d.allergenDisclaimer));
    nijeBezbedno(htmlSa);
  });

  test("an article without an allergen record says so, and stays visible (cafe with milk marked)", () => {
    const sa = stranica({ primer: "kafic", alergen: "mleko" });
    const bez = stranica({ primer: "kafic" });
    const rowsSa = redovi(prikazi(sa));
    const rowsBez = redovi(prikazi(bez));
    expect(rowsSa.length).toBeGreaterThan(0);
    expect(rowsSa.map((row) => row.id)).toEqual(rowsBez.map((row) => row.id));
    for (const article of sviArtikli(sa)) expect(article.allergens, article.name).toBeNull();
    for (const row of rowsSa) {
      expect(attr(prviTag(row.markup), "data-upozorenje"), row.id).toBe("nepoznato");
      expect(row.markup).toContain(esc(t.alergeni.nepoznato));
    }
    // The bar does not count "unknown" as a warning: it says how many articles have no data,
    // never "nothing found", and never calls anything safe.
    const html = prikazi(sa);
    const n = rowsSa.length;
    expect(html).toContain(esc(fmt(t.alergeni.bezPodataka[srPluralCategory(n)], { n })));
    expect(html).not.toContain(esc(t.alergeni.bezUpozorenja));
    nijeBezbedno(html);
  });

  test("with allergens off for the venue there is no allergen button, bar or warning", () => {
    const html = izlog({ primer: "kafic" });
    expect(count(html, "data-alergeni-dugme")).toBe(0);
    expect(count(html, "data-alergeni-traka")).toBe(0);
    expect(count(html, "data-upozorenje")).toBe(0);
    expect(redovi(html).length).toBeGreaterThan(0);
  });

  test("a code in the address works like the Serbian word", () => {
    const rec = redovi(prikazi(stranica({ primer: "restoran", layout: "tok", alergen: "mleko" })));
    const kod = redovi(prikazi(stranica({ primer: "restoran", layout: "tok", alergen: "milk" })));
    expect(kod.map((row) => attr(prviTag(row.markup), "data-upozorenje"))).toEqual(
      rec.map((row) => attr(prviTag(row.markup), "data-upozorenje")),
    );
  });
});

// -----------------------------------------------------------------------------
// B. EUR
// -----------------------------------------------------------------------------

describe("without a fresh rate the EUR switch is not shown", () => {
  const OVER = { primer: "restoran", layout: "tok" };

  test("a fresh rate: the switch, EUR under every price, the rate note in the detail", () => {
    const prikaz = stranica({ ...OVER, valuta: "eur" });
    expect(prikaz.kurs).not.toBeNull();
    expect(kursJeSvez(prikaz.kurs, prikaz.sadaMs)).toBe(true);
    const rate = (prikaz.kurs as MenuKurs).rate;
    const html = prikazi(prikaz);
    const rows = redovi(html);

    const prekidac = /<div\b[^>]*data-valuta-prekidac=""[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(prekidac).not.toBe("");
    expect(attr(prviTag(prekidac), "aria-label")).toBe(t.valuta.oznaka);
    const dugmad = [...prekidac.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map((m) => ({
      pressed: attr(`<button${m[1]}>`, "aria-pressed"),
      text: m[2],
    }));
    expect(dugmad).toEqual([
      { pressed: "false", text: esc(t.valuta.rsd) },
      { pressed: "true", text: esc(t.valuta.eur) },
    ]);

    expect(count(html, 'data-eur=""')).toBeGreaterThan(0);
    // RSD stays and every priced row also carries its EUR line.
    for (const row of rows) {
      expect(count(row.markup, 'data-eur=""'), row.id).toBe(count(row.markup, "RSD</span>"));
    }
    const jednostavan = sviArtikli(prikaz).find(
      (article) => article.priceRsd !== null && article.variants.length === 0 && article.promo === null,
    ) as PublicArticle;
    const red = rows.find((row) => row.id === sidroArtikla(jednostavan.key));
    // The "~ " is drawn by CSS; the markup has the reader word, the amount and EUR.
    const eurTekst = `${iznosEur(eurIzRsd(jednostavan.priceRsd as number, rate))} EUR`;
    const eurRed = /<span\b[^>]*\sdata-eur=""[^>]*>(<span\b[^>]*>[^<]*<\/span>[^<]*)<\/span>/.exec(red?.markup ?? "");
    expect(eurRed).not.toBeNull();
    expect(bezTagova(eurRed?.[1] ?? "")).toBe(`${esc(t.valuta.eurCitac)} ${eurTekst}`);
    expect(red?.markup).toContain(eurTekst);
    expect(red?.markup).not.toContain("~");
    expect(formatEur(jednostavan.priceRsd as number, rate)).toBe(`~ ${eurTekst}`);
  });

  test("RSD prices are the same with and without the EUR line", () => {
    const sa = prikazi(stranica({ ...OVER, valuta: "eur" }));
    const bez = prikazi(stranica(OVER));
    expect(count(bez, 'data-eur=""')).toBe(0);
    expect(count(bez, "data-valuta-prekidac")).toBe(0);
    expect(count(sa, "RSD</span>")).toBe(count(bez, "RSD</span>"));
    expect(count(sa, "RSD</span>")).toBeGreaterThan(0);
    // RSD amounts, in order, are identical.
    const iznosi = (html: string) => [...html.matchAll(/([\d.]+)<span class="[^"]*valuta[^"]*">RSD<\/span>/g)].map((m) => m[1]);
    expect(iznosi(sa)).toEqual(iznosi(bez));
  });

  test("the detail with EUR carries the approximate-rate note with the rate's date", () => {
    const prikaz = stranica({ ...OVER, valuta: "eur", detalj: "1" });
    const dijalog = dijalogDetalja(prikazi(prikaz));
    const datum = datumKursa((prikaz.kurs as MenuKurs).effectiveDate);
    expect(dijalog).toContain("data-eur-napomena");
    expect(dijalog).toContain(esc(fmt(t.valuta.napomena, { datum })));
    expect(count(dijalog, 'data-eur=""')).toBeGreaterThan(0);
  });

  test("a fresh rate with RSD chosen: the switch shows, no EUR line, no note", () => {
    const prikaz = stranica({ ...OVER, valuta: "eur", detalj: "1" });
    const html = prikazi(prikaz, { pocetno: { ...prikaz.pocetno, valuta: "rsd" } });
    expect(count(html, "data-valuta-prekidac")).toBe(1);
    expect(count(html, 'data-eur=""')).toBe(0);
    expect(count(html, "data-eur-napomena")).toBe(0);
    expect(html).toContain(`aria-pressed="true">${esc(t.valuta.rsd)}<`);
  });

  test("a stale rate (kurs=star): no switch, no EUR, no note; RSD stays", () => {
    const prikaz = stranica({ ...OVER, valuta: "eur", kurs: "star", detalj: "1" });
    expect(prikaz.presentation.currencyToggle).toBe(true);
    expect(prikaz.kurs).not.toBeNull();
    expect(kursJeSvez(prikaz.kurs, prikaz.sadaMs)).toBe(false);
    const html = prikazi(prikaz);
    expect(count(html, "data-valuta-prekidac")).toBe(0);
    expect(count(html, "data-eur")).toBe(0);
    expect(html).not.toContain("EUR");
    for (const row of redovi(html)) expect(row.markup, row.id).toContain("RSD</span>");
    // Through the izlog component too.
    const izlogHtml = izlog({ ...OVER, kurs: "star" });
    expect(count(izlogHtml, "data-valuta-prekidac")).toBe(0);
    expect(count(izlogHtml, "data-eur")).toBe(0);
  });

  test("no rate at all, or the venue's switch off, or a future date: no switch", () => {
    const prikaz = stranica({ ...OVER, valuta: "eur" });
    const view = prikaz.view;
    expect(view.mogucnosti?.valuta).toBe(true);
    const kurs = prikaz.kurs as MenuKurs;

    const bezKursa = prikazi(prikaz, { kurs: null });
    expect(count(bezKursa, "data-valuta-prekidac")).toBe(0);
    expect(count(bezKursa, "data-eur")).toBe(0);

    const iskljuceno = prikazi(prikaz, {
      view: { ...view, mogucnosti: { pretraga: false, filteri: [], valuta: false } },
    });
    expect(count(iskljuceno, "data-valuta-prekidac")).toBe(0);
    expect(count(iskljuceno, "data-eur")).toBe(0);

    const buduci = epochToBelgradeLocal(prikaz.sadaMs + 2 * DAN).slice(0, 10);
    const ubuduce = prikazi(prikaz, { kurs: { ...kurs, effectiveDate: buduci } });
    expect(count(ubuduce, "data-valuta-prekidac")).toBe(0);
    expect(count(ubuduce, "data-eur")).toBe(0);

    const nerealan = prikazi(prikaz, { kurs: { ...kurs, rate: 1 } });
    expect(count(nerealan, "data-valuta-prekidac")).toBe(0);
    expect(count(nerealan, "data-eur")).toBe(0);

    for (const html of [bezKursa, iskljuceno, ubuduce, nerealan]) {
      expect(redovi(html)).toHaveLength(brojArtikala(view.sekcije));
      expect(count(html, "RSD</span>")).toBeGreaterThan(0);
    }
  });

  test("the rate is fresh up to four Belgrade days and stale from the fifth", () => {
    const prikaz = stranica({ ...OVER, valuta: "eur" });
    const kurs = prikaz.kurs as MenuKurs;
    const sa = (dana: number) =>
      prikazi(prikaz, { kurs: { ...kurs, effectiveDate: epochToBelgradeLocal(prikaz.sadaMs - dana * DAN).slice(0, 10) } });
    expect(count(sa(4), "data-valuta-prekidac")).toBe(1);
    expect(count(sa(5), "data-valuta-prekidac")).toBe(0);
    expect(count(sa(5), "data-eur")).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// C. Languages
// -----------------------------------------------------------------------------

/** The h3 text of every row, by row id. */
function naziviRedova(html: string): Map<string, string> {
  return new Map(redovi(html).map((row) => [row.id, bezTagova(naslovi(row.markup, 3)[0] ?? "")]));
}

function jezikIzbor(html: string): { lang: string | undefined; text: string; trenutni: boolean }[] {
  const nav = /<nav\b[^>]*data-jezik-izbor=""[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  return [...nav.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map((m) => ({
    lang: attr(`<a${m[1]}>`, "hreflang"),
    text: m[2],
    trenutni: attr(`<a${m[1]}>`, "aria-current") === "true",
  }));
}

describe("a missing translation shows the source text", () => {
  test("restaurant in English: the root says en; translated names in English, the rest in Serbian", () => {
    const sr = stranica({ primer: "restoran", layout: "tok" });
    const en = stranica({ primer: "restoran", layout: "tok", jezik: "en" });
    const htmlSr = prikazi(sr);
    const htmlEn = prikazi(en);
    expect(attr(koren(htmlEn), "lang")).toBe("en");
    expect(attr(koren(htmlSr), "lang")).toBe("sr");

    const nazSr = naziviRedova(htmlSr);
    const nazEn = naziviRedova(htmlEn);
    // Same structure.
    expect([...nazEn.keys()]).toEqual([...nazSr.keys()]);
    expect(naslovi(htmlEn, 2)).toHaveLength(naslovi(htmlSr, 2).length);
    for (const h of [...naslovi(htmlEn, 2), ...naslovi(htmlEn, 3)]) expect(bezTagova(h)).not.toBe("");

    const naziv = (mapa: Map<string, string>, ime: string) => {
      const article = sviArtikli(sr).find((candidate) => candidate.name === ime) as PublicArticle;
      expect(article, ime).toBeDefined();
      return mapa.get(sidroArtikla(article.key)) ?? "";
    };
    expect(naziv(nazEn, "Pržene lignje")).toContain("Fried squid");
    expect(naziv(nazSr, "Pržene lignje")).toContain(esc("Pržene lignje"));
    // Sarma has no English name in the fixture: the source text stays.
    expect(naziv(nazEn, "Sarma")).toContain("Sarma");
    expect(naziv(nazEn, "Prebranac")).toContain("Prebranac");
    // Some changed, some did not.
    const razlicitih = [...nazEn].filter(([id, ime]) => ime !== nazSr.get(id)).length;
    expect(razlicitih).toBeGreaterThan(0);
    expect(razlicitih).toBeLessThan(nazEn.size);
    for (const ime of nazEn.values()) expect(ime).not.toBe("");
    // Prices do not change with the language.
    expect(count(htmlEn, "RSD</span>")).toBe(count(htmlSr, "RSD</span>"));
  });

  test("cafe in English: the row count is the Serbian one and a missing translation falls back", () => {
    const sr = stranica({ primer: "kafic" });
    const en = stranica({ primer: "kafic", jezik: "en" });
    const nazSr = naziviRedova(prikazi(sr));
    const nazEn = naziviRedova(prikazi(en));
    expect(nazEn.size).toBe(nazSr.size);
    expect([...nazEn.keys()]).toEqual([...nazSr.keys()]);
    const kafa = sviArtikli(sr).find((article) => article.name === "Kafa sa mlekom") as PublicArticle;
    expect(nazEn.get(sidroArtikla(kafa.key))).toContain("Coffee with milk");
    expect(nazSr.get(sidroArtikla(kafa.key))).toContain(esc("Kafa sa mlekom"));
    const istih = [...nazEn].filter(([id, ime]) => ime === nazSr.get(id));
    expect(istih.length).toBeGreaterThan(0);
    for (const ime of nazEn.values()) expect(ime).not.toBe("");
    expect(attr(koren(izlog({ primer: "kafic", jezik: "en" })), "lang")).toBe("en");
  });

  test("the language switch lists the published languages by their own names; the current one is marked", () => {
    const html = izlog({ primer: "restoran", layout: "tok", jezik: "en" });
    expect(jezikIzbor(html)).toEqual([
      { lang: "sr", text: esc(t.jezik.nazivi.sr), trenutni: false },
      { lang: "en", text: esc(t.jezik.nazivi.en), trenutni: true },
    ]);
    const nav = /<nav\b[^>]*data-jezik-izbor=""[^>]*>/.exec(html)?.[0] ?? "";
    expect(attr(nav, "aria-label")).toBe(t.jezik.oznaka);
    // Links keep the address and change only the language.
    expect(html).toMatch(/<a\b[^>]*href="[^"]*jezik=sr"/);
    expect(html).toMatch(/<a\b[^>]*href="[^"]*jezik=en"/);

    const sr = izlog({ primer: "restoran", layout: "tok", jezik: "sr" });
    expect(jezikIzbor(sr).map((opcija) => [opcija.lang, opcija.trenutni])).toEqual([
      ["sr", true],
      ["en", false],
    ]);
  });

  test("without a second language there is no switch", () => {
    expect(count(izlog({ primer: "restoran", layout: "tok" }), "data-jezik-izbor")).toBe(0);
    expect(count(izlog({ primer: "kafic" }), "data-jezik-izbor")).toBe(0);
  });

  test("a language with no translations at all (de) shows every name in Serbian", () => {
    const sr = stranica({ primer: "restoran", layout: "tok" });
    const de = stranica({ primer: "restoran", layout: "tok", jezik: "de" });
    const htmlDe = prikazi(de);
    expect(attr(koren(htmlDe), "lang")).toBe("de");
    expect(naziviRedova(htmlDe)).toEqual(naziviRedova(prikazi(sr)));
    expect(naslovi(htmlDe, 2)).toEqual(naslovi(prikazi(sr), 2));
    expect(jezikIzbor(htmlDe)).toEqual([
      { lang: "sr", text: esc(t.jezik.nazivi.sr), trenutni: false },
      { lang: "de", text: esc(t.jezik.nazivi.de), trenutni: true },
    ]);
  });
});

// -----------------------------------------------------------------------------
// Search and filters
// -----------------------------------------------------------------------------

describe("search and filters", () => {
  const VELIKI = { primer: "restoran", layout: "tok", stanje: "veliki" };

  test("the search field is absent when the venue has search off", () => {
    const html = izlog({ primer: "restoran", layout: "tok" });
    expect(count(html, 'id="javni-pretraga"')).toBe(0);
    expect(count(html, 'role="search"')).toBe(0);
    expect(count(html, "data-rezultati")).toBe(0);
  });

  test("the search field has a label and the venue's placeholder when search is on", () => {
    const html = izlog(VELIKI);
    expect(count(html, 'id="javni-pretraga"')).toBe(1);
    expect(html).toMatch(/<label\b[^>]*for="javni-pretraga"[^>]*>/);
    expect(html).toContain(esc(t.pretraga.oznaka));
    expect(html).toContain(`placeholder="${esc(t.pretraga.placeholder)}"`);
    // No search yet: the whole menu and no results line.
    expect(count(html, "data-rezultati")).toBe(0);
    expect(redovi(html).length).toBeGreaterThan(50);
  });

  test("a query narrows the menu, ignores diacritics and the results line equals the number of rows", () => {
    const celo = stranica(VELIKI);
    const upit = "przene lignje";
    const ocekivani = pretraziStranicu(celo.view.sekcije, upit);
    const n = brojArtikala(ocekivani);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(brojArtikala(celo.view.sekcije));

    const html = izlog({ ...VELIKI, pretraga: upit });
    const rows = redovi(html);
    expect(rows).toHaveLength(n);
    expect(rows.map((row) => row.id)).toEqual(ocekivani.flatMap((s) => s.articles).map((article) => sidroArtikla(article.key)));
    expect(Number(/data-rezultati="(\d+)"/.exec(html)?.[1])).toBe(n);
    expect(html).toContain(esc(fmt(t.pretraga.rezultati[srPluralCategory(n)], { n })));
    expect(html).toContain(esc(t.pretraga.obrisi));
    // The field shows the query.
    expect(html).toMatch(new RegExp(`<input\\b[^>]*id="javni-pretraga"[^>]*value="${upit}"`));
    // The way back to the whole menu is offered.
    expect(html).toContain(esc(t.pretraga.obrisi));
  });

  test("a query with no match says so, with the query, and shows no rows", () => {
    const upit = "zzqxjkw";
    const html = izlog({ ...VELIKI, pretraga: upit });
    expect(redovi(html)).toHaveLength(0);
    expect(/data-rezultati="(\d+)"/.exec(html)?.[1]).toBe("0");
    expect(html).toContain(esc(fmt(t.pretraga.nemaRezultata, { upit })));
    expect(html).toContain(esc(t.pretraga.obrisi));
  });

  test("the filter chips are only codes some article has, and there is no price filter", () => {
    const prikaz = stranica(VELIKI);
    const html = prikazi(prikaz);
    const kodovi = [...html.matchAll(/<button\b[^>]*\sdata-filter="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    const dostupni = dostupniFilteri(prikaz.view.sekcije, prikaz.view.mogucnosti?.filteri ?? [], prikaz.sadaMs);
    expect(kodovi.length).toBeGreaterThan(0);
    expect(kodovi).toEqual(dostupni);
    for (const kod of kodovi) expect(kod.startsWith("price")).toBe(false);
    expect(html).not.toMatch(/data-filter="price/);
    // Every chip starts unpressed.
    for (const m of html.matchAll(/<button\b[^>]*\sdata-filter="[^"]+"[^>]*>/g)) expect(attr(m[0], "aria-pressed")).toBe("false");
    // The group is named from the dictionary.
    expect(html).toContain(`aria-label="${esc(t.pretraga.filteri)}"`);
  });

  test("filter=vegan narrows to vegan articles and its chip is pressed", () => {
    const prikaz = stranica({ ...VELIKI, filter: "vegan" });
    const vegani = sviArtikli(prikaz).filter((article) => article.tags.includes("vegan"));
    expect(vegani.length).toBeGreaterThan(0);
    expect(vegani.length).toBeLessThan(sviArtikli(prikaz).length);
    const html = prikazi(prikaz);
    const rows = redovi(html);
    expect(rows.map((row) => row.id).sort()).toEqual(vegani.map((article) => sidroArtikla(article.key)).sort());
    expect(Number(/data-rezultati="(\d+)"/.exec(html)?.[1])).toBe(vegani.length);
    const chips = new Map(
      [...html.matchAll(/<button\b[^>]*\sdata-filter="([^"]+)"[^>]*>/g)].map((m) => [m[1], attr(m[0], "aria-pressed")]),
    );
    expect(chips.get("vegan")).toBe("true");
    for (const [kod, pressed] of chips) if (kod !== "vegan") expect(pressed, kod).toBe("false");
    // The way back to the whole menu.
    expect(html).toContain(esc(t.pretraga.prikaziSve));
  });

  test("a query and a filter combine", () => {
    const prikaz = stranica({ ...VELIKI, filter: "vegan", pretraga: "salata" });
    const ocekivani = pretraziStranicu(prikaz.view.sekcije, "salata")
      .flatMap((sekcija) => sekcija.articles)
      .filter((article) => article.tags.includes("vegan"));
    const html = prikazi(prikaz);
    expect(redovi(html)).toHaveLength(ocekivani.length);
    expect(Number(/data-rezultati="(\d+)"/.exec(html)?.[1])).toBe(ocekivani.length);
  });

  test("search never runs inside the editor preview", () => {
    const prikaz = stranica(VELIKI);
    const html = renderToStaticMarkup(
      <JavniMeni
        view={prikaz.view}
        izgled={javniIzgled(prikaz.presentation)}
        slike={prikaz.slike}
        sadaMs={prikaz.sadaMs}
        nedostupni={prikaz.nedostupni}
        ugradjen
        cuvaj={false}
      />,
    );
    expect(count(html, 'id="javni-pretraga"')).toBe(0);
    expect(count(html, "data-filter=")).toBe(0);
    expect(count(html, "data-alergeni-dugme")).toBe(0);
  });
});
