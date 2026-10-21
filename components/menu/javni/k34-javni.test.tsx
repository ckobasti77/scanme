// K34 tests for the review fixes of the public menu: B4 (a photo lies over its
// stand-in glyph), B5 (the EUR tilde has a fallback), B8 (the category tiles follow
// the menu-wide media display), B11 (the `close` handler of the native <dialog>s under
// React Strict Mode), B13 (dir="rtl" for Arabic and Hebrew) and B17 (the allergen
// button is not a toggle). Set up like javni.test.tsx and k17-varijante.test.tsx: the
// izlog fixtures go through the REAL publish path (fixtureMenu -> compileSnapshot ->
// parsePublicPage); server markup only (renderToStaticMarkup, no DOM). Texts come from
// the dictionaries; the only literals are attribute values of the renderer and fixture
// facts. The stylesheet and three sources are read as text (no bundler involved).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import { javniIzlog, type JavniIzlogPrikaz } from "@/components/menu/fixtures/javni";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { MENU_DEFAULT_PRESENTATION, type MenuMediaMode, type MenuPresentationValues } from "@/lib/menu/presentation";
import { kategorije, primeniPrikazMedija, type JavniRazdelnikView, type PublicImage } from "@/lib/menu/public-view";
import type { PublicArticle, PublicPageMeta } from "@/lib/menu/snapshot";
import { AlergeniDugme } from "./alergeni";
import { ArtikalKartica, ArtikalRed } from "./artikal";
import { DetaljArtikla, DetaljSadrzaj } from "./detalj";
import { naZatvaranje } from "./dijalog-zatvaranje";
import { JavniGlif } from "./glif";
import { JavniMeni } from "./javni-meni";
import { JavniOkvir } from "./okvir";
import { JavniRazdelnik } from "./razdelnik";

const t = menuJavniSr;
const SADA = IZLOG_SADA;

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

const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The opening tag of the menu root (`data-javni-meni`). */
function koren(html: string): string {
  const tag = /<div\b[^>]*\sdata-javni-meni=""[^>]*>/.exec(html)?.[0];
  if (!tag) throw new Error("no public menu root in the markup");
  return tag;
}

/** The inner markup of the first decorative media box (`<span class="medij" aria-hidden="true">`). */
const medij = (markup: string) =>
  /<span class="[^"]*medij[^"]*" aria-hidden="true">([\s\S]*?)<\/span>/.exec(markup)?.[1] ?? "";

/** The path data of the first svg in a piece of markup: which glyph it draws. */
const putanje = (markup: string) =>
  [...(/<svg\b[\s\S]*?<\/svg>/.exec(markup)?.[0] ?? "").matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]).join("|");

/** The glyph the icon set draws for a key (a missing or unknown key takes the fallback, then the default). */
const glif = (iconKey: string | null, rezerva: string | null = null) =>
  putanje(renderToStaticMarkup(<JavniGlif iconKey={iconKey} rezerva={rezerva} />));

/** The stand-in glyph must come first in the box, so the photo (a later sibling) paints over it. */
function glifIspodSlike(kutija: string) {
  expect(kutija.indexOf("<svg")).toBeGreaterThanOrEqual(0);
  expect(kutija.indexOf("<img")).toBeGreaterThan(kutija.indexOf("<svg"));
  expect(attr(/<svg\b[^>]*>/.exec(kutija)?.[0] ?? "", "aria-hidden")).toBe("true");
  expect(attr(/<img\b[^>]*>/.exec(kutija)?.[0] ?? "", "alt")).toBe("");
}

type StranicaPrikaz = Extract<JavniIzlogPrikaz, { vrsta: "stranica" }>;

function stranica(over: Record<string, string>): StranicaPrikaz {
  const prikaz = javniIzlog(parsePublicPreview(over));
  if (prikaz.vrsta !== "stranica") throw new Error(`expected a menu page for ${JSON.stringify(over)}`);
  return prikaz;
}

type Prikaz = Partial<MenuPresentationValues>;

/** The page rendered in an appearance built from its own presentation with `over` laid on top (as in k17-varijante). */
function prikazi(prikaz: StranicaPrikaz, over: Prikaz = {}, view = prikaz.view): string {
  return renderToStaticMarkup(
    <JavniMeni
      view={view}
      izgled={javniIzgled({ ...prikaz.presentation, ...over })}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={[]}
      pocetnaKategorija={null}
    />,
  );
}

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

const SLIKE_PROBNE: Record<string, PublicImage> = {
  m_probna: { thumbUrl: "/probna-mala.jpg", url: "/probna-velika.jpg", width: 800, height: 500 },
};
const sSlikom = (iconKey: string | null) =>
  clanak({ media: { mode: "image", imageMediaId: "m_probna", iconKey } });
const sIkonicom = (iconKey: string | null) =>
  clanak({ media: { mode: "icon", imageMediaId: null, iconKey } });

const css = readFileSync(join(process.cwd(), "components/menu/javni/javni.module.css"), "utf8").replace(/\r\n/g, "\n");
const izvor = (relativno: string) => readFileSync(join(process.cwd(), relativno), "utf8").replace(/\r\n/g, "\n");

// -----------------------------------------------------------------------------
// B4 — a photo lies over its stand-in glyph (MENU-UX 1.2: a photo that fails to load shows the icon)
// -----------------------------------------------------------------------------

describe("B4: a photo lies over the glyph the row shows without it", () => {
  const redTok = (article: PublicArticle, over: Partial<Parameters<typeof ArtikalRed>[0]> = {}) =>
    renderToStaticMarkup(
      <ul>
        <ArtikalRed article={article} layout="flow" slike={SLIKE_PROBNE} sadaMs={SADA} nedostupan={false} onOtvori={null} {...over} />
      </ul>,
    );
  const karticaKat = (article: PublicArticle, over: Partial<Parameters<typeof ArtikalKartica>[0]> = {}) =>
    renderToStaticMarkup(
      <ul>
        <ArtikalKartica
          article={article}
          layout="categories"
          slike={SLIKE_PROBNE}
          sadaMs={SADA}
          nedostupan={false}
          onOtvori={null}
          {...over}
        />
      </ul>,
    );

  test("a Tok row with a photo has its own glyph under the photo, in the one decorative box", () => {
    const markup = redTok(sSlikom("vino"));
    expect(markup).toContain('data-medij="slika"');
    const kutija = medij(markup);
    glifIspodSlike(kutija);
    expect(putanje(kutija)).toBe(glif("vino"));
  });

  test("the glyph is the one the row shows without a photo: the article's icon, else the section's, else the default", () => {
    const ispod = (iconKey: string | null, sekcijaIkonica: string | null = null) =>
      putanje(medij(redTok(sSlikom(iconKey), { sekcijaIkonica })));
    expect(ispod("vino")).toBe(glif("vino"));
    expect(ispod(null, "rostilj")).toBe(glif("rostilj"));
    expect(ispod("nema-takve-ikonice", "rostilj")).toBe(glif("rostilj"));
    expect(ispod(null)).toBe(glif(null));
    expect(new Set([ispod("vino"), ispod(null, "rostilj"), ispod(null)]).size).toBe(3);
  });

  test("a photo that did not resolve gives the very same row as an icon article: one glyph, no <img>", () => {
    const bezSlike = redTok(sSlikom("vino"), { slike: {} });
    expect(bezSlike).not.toContain("<img");
    expect(bezSlike).toBe(redTok(sIkonicom("vino"), { slike: {} }));
    expect(putanje(medij(bezSlike))).toBe(glif("vino"));
  });

  test("a Kategorije card with a photo has the glyph under it too", () => {
    const markup = karticaKat(sSlikom("vino"), { sekcijaIkonica: "rostilj" });
    const kutija = medij(markup);
    glifIspodSlike(kutija);
    expect(putanje(kutija)).toBe(glif("vino"));
    expect(putanje(medij(karticaKat(sSlikom(null), { sekcijaIkonica: "rostilj" })))).toBe(glif("rostilj"));
  });

  test("Kompaktno still draws no media at all, whatever the article has", () => {
    const markup = redTok(sSlikom("vino"), { layout: "compact" });
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("data-medij");
    expect(medij(markup)).toBe("");
  });

  test("a category tile with a photo has the tile's own glyph under it", () => {
    const slike = stranica({ primer: "restoran", mediji: "slika" });
    const kartice = kategorije(slike.view.sekcije, slike.slike);
    const html = prikazi(slike, { layout: "categories", defaultMediaMode: "image" });
    const plocice = [...html.matchAll(/<a\b[^>]*\shref="#k-[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
    expect(plocice).toHaveLength(kartice.length);
    expect(kartice.some((kartica) => kartica.slika !== null)).toBe(true);
    plocice.forEach((tile, index) => {
      const kutija = medij(tile);
      expect(putanje(kutija), kartice[index].naziv).toBe(glif(kartice[index].iconKey));
      expect(kutija.includes("<img"), kartice[index].naziv).toBe(kartice[index].slika !== null);
      if (kartice[index].slika) glifIspodSlike(kutija);
    });
  });

  test("the article detail's hero photo lies over a glyph in its own box, which is still the first block after the close bar", () => {
    const detalj = (article: PublicArticle, over: Partial<Parameters<typeof DetaljSadrzaj>[0]> = {}) =>
      renderToStaticMarkup(
        <DetaljSadrzaj
          article={article}
          layout="flow"
          slike={SLIKE_PROBNE}
          sadaMs={SADA}
          nedostupan={false}
          alergeniUkljuceni={false}
          naslovId="naslov-probe"
          {...over}
        />,
      );
    const markup = detalj(sSlikom("vino"));
    const hero = /<div class="[^"]*detaljMedij[^"]*">([\s\S]*?)<\/div>/.exec(markup)?.[1] ?? "";
    glifIspodSlike(hero);
    expect(putanje(hero)).toBe(glif("vino"));
    expect(hero).toContain('src="/probna-velika.jpg"');
    expect(markup.indexOf("detaljMedij")).toBeLessThan(markup.indexOf("detaljTelo"));
    // Nothing to put a glyph under: no photo (or a photo that did not resolve, or Kompaktno) leaves no hero box.
    for (const bez of [detalj(sSlikom("vino"), { slike: {} }), detalj(sSlikom("vino"), { layout: "compact" }), detalj(clanak())]) {
      expect(bez).not.toContain("detaljMedij");
      expect(bez).not.toContain("<img");
    }
    // In the dialog the hero is the one element between the close bar and the body, so the body stays off
    // `:nth-child(2)` and the title is not padded for a close button it does not sit under.
    const dijalog = renderToStaticMarkup(
      <DetaljArtikla
        article={sSlikom("vino")}
        layout="flow"
        slike={SLIKE_PROBNE}
        sadaMs={SADA}
        nedostupan={false}
        alergeniUkljuceni={false}
        onZatvori={() => {}}
      />,
    );
    expect(dijalog).toMatch(/<\/button><\/div><div class="[^"]*detaljMedij[^"]*">.*<\/div><div class="[^"]*detaljTelo[^"]*"/);
  });

  test("the splitter's cover photo lies over the page's glyph", () => {
    const pageMeta = (key: string, iconKey: string | null): PublicPageMeta => ({
      key: `pg_${key}`,
      slug: key,
      title: key,
      isDefault: false,
      navigation: "shared",
      iconKey,
    });
    const view: JavniRazdelnikView = {
      lokal: { naziv: "Probni lokal", slug: "probni", logoUrl: null },
      stranice: [pageMeta("a", "vino"), pageMeta("b", "rostilj")],
      jezik: "sr",
      jezici: ["sr"],
    };
    const html = renderToStaticMarkup(
      <JavniRazdelnik
        view={view}
        izgled={javniIzgled(MENU_DEFAULT_PRESENTATION)}
        naslovne={{ pg_a: SLIKE_PROBNE.m_probna, pg_b: null }}
      />,
    );
    const veze = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
    expect(veze).toHaveLength(2);
    glifIspodSlike(medij(veze[0]));
    expect(putanje(medij(veze[0]))).toBe(glif("vino"));
    expect(medij(veze[1])).not.toContain("<img");
    expect(putanje(medij(veze[1]))).toBe(glif("rostilj"));
  });

  test("the stylesheet stacks the glyph and the photo in one grid cell, and the hero box carries the aspect ratio and the crop", () => {
    expect(css).toMatch(/\.medij > \.glif,\s*\.medij > img \{\s*grid-area: 1 \/ 1;\s*\}/);
    expect(css).toMatch(/\.detaljMedij > \.glif,\s*\.detaljMedij > \.detaljSlika \{\s*grid-area: 1 \/ 1;\s*\}/);
    expect(/\.detaljMedij \{([^}]*)\}/.exec(css)?.[1]).toMatch(/aspect-ratio: 16 \/ 10;[\s\S]*max-height: 36dvh;/);
    // The photo fills its box (no background of its own: a photo that fails to load must leave the glyph visible).
    const slika = /\n\.detaljSlika \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(slika).toMatch(/width: 100%;/);
    expect(slika).toMatch(/height: 100%;/);
    expect(slika).not.toMatch(/background/);
    expect(/\n\.medij img \{([^}]*)\}/.exec(css)?.[1] ?? "").not.toMatch(/background/);
  });
});

// -----------------------------------------------------------------------------
// B5 — the "~" before the EUR price
// -----------------------------------------------------------------------------

describe("B5: the EUR tilde survives browsers without the alt-text syntax", () => {
  test("`.eur::before` has the plain declaration first and the alt-text one after it", () => {
    const pravilo = /\n\.eur::before \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const prosta = pravilo.indexOf('content: "~ ";');
    const saAlt = pravilo.indexOf('content: "~ " / "";');
    expect(prosta).toBeGreaterThanOrEqual(0);
    expect(saAlt).toBeGreaterThan(prosta);
    // Exactly these two: nothing else drops the tilde.
    expect(pravilo.match(/content:/g)).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------
// B8 — the category tiles follow the menu-wide media display
// -----------------------------------------------------------------------------

describe("B8: the Kategorije tiles follow the menu-wide media display", () => {
  // The restaurant example with every article set to a photo (the fixture resolves most of them).
  const SLIKE = stranica({ primer: "restoran", mediji: "slika" });
  const mreza = (mediji: MenuMediaMode, over: Prikaz = {}) =>
    prikazi(SLIKE, { layout: "categories", defaultMediaMode: mediji, ...over });
  const plocice = (html: string) =>
    [...html.matchAll(/<a\b[^>]*\shref="#k-[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
  const BEZ_OGRANICENJA = kategorije(SLIKE.view.sekcije, SLIKE.slike);

  test("the fixture has what the checks need: photo tiles, and sections with a name and a count", () => {
    expect(BEZ_OGRANICENJA.length).toBeGreaterThan(1);
    expect(BEZ_OGRANICENJA.some((kartica) => kartica.slika !== null)).toBe(true);
  });

  test('"image": as before - a photo where the section has one, the glyph under it, no data-mediji on the root', () => {
    const html = mreza("image");
    const kartice = plocice(html);
    expect(kartice).toHaveLength(BEZ_OGRANICENJA.length);
    expect(koren(html)).not.toContain("data-mediji");
    expect(kartice.filter((tile) => tile.includes("<img")).length).toBe(BEZ_OGRANICENJA.filter((kartica) => kartica.slika).length);
    for (const tile of kartice) expect(tile).toContain("<svg");
  });

  test('"icon": the glyph instead of the photo on every tile; the root says data-mediji="icon"', () => {
    const html = mreza("icon");
    const kartice = plocice(html);
    const ograniceno = kategorije(primeniPrikazMedija(SLIKE.view.sekcije, "icon"), SLIKE.slike);
    expect(kartice).toHaveLength(BEZ_OGRANICENJA.length);
    expect(attr(koren(html), "data-mediji")).toBe("icon");
    expect(html).not.toContain("<img");
    kartice.forEach((tile, index) => {
      expect(tile, ograniceno[index].naziv).toContain("<svg");
      expect(putanje(medij(tile)), ograniceno[index].naziv).toBe(glif(ograniceno[index].iconKey));
    });
  });

  test('"none": the root says data-mediji="none", no tile has a photo, and every tile keeps its name and count', () => {
    const html = mreza("none");
    const kartice = plocice(html);
    expect(kartice).toHaveLength(BEZ_OGRANICENJA.length);
    expect(attr(koren(html), "data-mediji")).toBe("none");
    expect(html).not.toContain("<img");
    kartice.forEach((tile, index) => {
      const kartica = BEZ_OGRANICENJA[index];
      expect(bezTagova(tile)).toContain(esc(kartica.naziv));
      expect(bezTagova(tile)).toContain(String(kartica.broj));
    });
  });

  test('the Premium "lista" variant carries both attributes the stylesheet rule for a tile row without media is keyed on', () => {
    const koreni = koren(mreza("none", { layoutVariant: "lista" }));
    expect(attr(koreni, "data-varijanta")).toBe("lista");
    expect(attr(koreni, "data-mediji")).toBe("none");
  });

  test('the stylesheet hides the media box of a tile under data-mediji="none" and gives a "lista" row one column', () => {
    expect(css).toMatch(/\n\.koren\[data-mediji="none"\] \.plocica \.medij \{\s*display: none;\s*\}/);
    const lista = /\n\.koren\[data-varijanta="lista"\]\[data-mediji="none"\] \.plocica \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(lista).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
    // It follows the lista rule it overrides (same specificity: the later one wins).
    expect(css.indexOf('.koren[data-varijanta="lista"][data-mediji="none"] .plocica {')).toBeGreaterThan(
      css.indexOf('.koren[data-varijanta="lista"] .plocica {'),
    );
  });
});

// -----------------------------------------------------------------------------
// B11 — the `close` handler of the native <dialog>s
// -----------------------------------------------------------------------------

describe("B11: naZatvaranje reports a close only when the dialog really is closed", () => {
  test("a dialog that is open does not report (a stale close event of a dialog that was opened again)", () => {
    const onZatvori = vi.fn();
    naZatvaranje(onZatvori)({ currentTarget: { open: true } });
    expect(onZatvori).not.toHaveBeenCalled();
  });

  test("a dialog that is closed reports once per event", () => {
    const onZatvori = vi.fn();
    const rukovalac = naZatvaranje(onZatvori);
    rukovalac({ currentTarget: { open: false } });
    expect(onZatvori).toHaveBeenCalledTimes(1);
    rukovalac({ currentTarget: { open: false } });
    expect(onZatvori).toHaveBeenCalledTimes(2);
  });

  test("Strict Mode: effect (open), cleanup (close), effect again (open), then the queued close event is ignored; a real close still reports", () => {
    const onZatvori = vi.fn();
    const rukovalac = naZatvaranje(onZatvori);
    // A dialog as the browser has it: close() queues the `close` event, it is delivered later.
    const dijalog = { open: false };
    const redEvenata: Array<() => void> = [];
    const showModal = () => {
      dijalog.open = true;
    };
    const close = () => {
      if (!dijalog.open) return;
      dijalog.open = false;
      redEvenata.push(() => rukovalac({ currentTarget: dijalog }));
    };
    const isporuci = () => redEvenata.splice(0).forEach((dogadjaj) => dogadjaj());

    showModal(); // the effect opens it
    close(); // Strict Mode's cleanup
    showModal(); // and the effect runs again
    isporuci(); // the close event queued by the cleanup arrives now
    expect(dijalog.open).toBe(true);
    expect(onZatvori).not.toHaveBeenCalled();

    close(); // Esc / Zatvori / a tap on the backdrop
    isporuci();
    expect(onZatvori).toHaveBeenCalledTimes(1);
  });

  test.each([
    "components/menu/javni/detalj.tsx",
    "components/menu/javni/alergeni.tsx",
    "components/menu/gost/list.tsx",
  ])("%s passes its onClose through naZatvaranje", (fajl) => {
    const kod = izvor(fajl);
    expect(kod).toContain("onClose={naZatvaranje(onZatvori)}");
    expect(kod).not.toContain("onClose={onZatvori}");
    expect(kod).toMatch(/import \{ naZatvaranje \} from "[^"]*\/dijalog-zatvaranje";/);
  });
});

// -----------------------------------------------------------------------------
// B13 — dir="rtl" for Arabic and Hebrew
// -----------------------------------------------------------------------------

describe("B13: the writing direction of the page", () => {
  const izgled = javniIzgled(MENU_DEFAULT_PRESENTATION);
  const lokal = { naziv: "Probni lokal", slug: "probni", logoUrl: null };
  const okvir = (jezik: string) =>
    renderToStaticMarkup(
      <JavniOkvir izgled={izgled} lokal={lokal} naslovStranice={null} jezik={jezik}>
        <p>probni sadrzaj</p>
      </JavniOkvir>,
    );

  test("an Arabic or Hebrew page has dir=\"rtl\" on its root, next to its lang", () => {
    for (const jezik of ["ar", "he"]) {
      const root = koren(okvir(jezik));
      expect(attr(root, "dir"), jezik).toBe("rtl");
      expect(attr(root, "lang"), jezik).toBe(jezik);
    }
  });

  test("Serbian and every other language carry no dir attribute at all", () => {
    for (const jezik of ["sr", "en", "de", "ru", "zh", "ja", "el"]) {
      const root = koren(okvir(jezik));
      expect(root, jezik).not.toMatch(/\sdir=/);
      expect(attr(root, "lang"), jezik).toBe(jezik);
    }
  });

  test("it holds for a whole menu page and for the splitter, not only for the bare frame", () => {
    const prikaz = stranica({ primer: "restoran" });
    const arapski = prikazi(prikaz, {}, { ...prikaz.view, jezik: "ar", jezici: ["sr", "ar"] });
    expect(attr(koren(arapski), "dir")).toBe("rtl");
    expect(koren(prikazi(prikaz))).not.toMatch(/\sdir=/);
    const razdelnik = (jezik: string) =>
      renderToStaticMarkup(
        <JavniRazdelnik
          view={{ lokal, stranice: [], jezik, jezici: jezik === "sr" ? ["sr"] : ["sr", jezik] }}
          izgled={izgled}
        />,
      );
    expect(attr(koren(razdelnik("he")), "dir")).toBe("rtl");
    expect(koren(razdelnik("sr"))).not.toMatch(/\sdir=/);
  });
});

// -----------------------------------------------------------------------------
// B17 — the allergen button opens a dialog; it is not a toggle
// -----------------------------------------------------------------------------

describe("B17: the allergen button announces a dialog and is not a pressed/unpressed toggle", () => {
  test("with and without marked allergens: aria-haspopup=\"dialog\", no aria-pressed, the count stays in the name", () => {
    for (const broj of [0, 2]) {
      const html = renderToStaticMarkup(<AlergeniDugme broj={broj} onOtvori={() => {}} />);
      expect(attr(html, "aria-haspopup"), String(broj)).toBe("dialog");
      expect(html, String(broj)).not.toContain("aria-pressed");
      expect(bezTagova(html)).toBe(broj > 0 ? fmt(t.alergeni.dugmeBroj, { n: broj }) : t.alergeni.dugme);
    }
  });

  test("on a page with a marked allergen the button in the tools row has no aria-pressed either", () => {
    const html = renderToStaticMarkup(
      <JavniIzlog params={parsePublicPreview({ primer: "restoran", layout: "tok", alergen: "mleko" })} />,
    );
    const dugme = /<button\b[^>]*\sdata-alergeni-dugme=""[^>]*>/.exec(html)?.[0] ?? "";
    expect(dugme).not.toBe("");
    expect(attr(dugme, "aria-haspopup")).toBe("dialog");
    expect(dugme).not.toContain("aria-pressed");
  });
});
