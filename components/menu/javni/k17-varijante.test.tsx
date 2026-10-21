// K17 render tests for the two additions to the public renderer: the Premium
// layout variant (`data-varijanta` on the menu root) and the menu-wide media
// display (`data-mediji` on the root, a ceiling over each article's own choice).
// Set up like javni.test.tsx: the izlog fixtures go through the REAL publish path
// (fixtureMenu -> compileSnapshot -> parsePublicPage), and JavniMeni is rendered
// with an appearance built by javniIzgled from the fixture's presentation with
// the K17 fields overridden. Server markup only (renderToStaticMarkup, no DOM).
// No text of the interface is asserted here; the only literals are attribute
// values of the renderer and the names of the izlog examples.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { javniIzlog, type JavniIzlogPrikaz } from "@/components/menu/fixtures/javni";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { MENU_DEFAULT_PRESENTATION, type MenuLayout, type MenuMediaMode, type MenuPresentationValues } from "@/lib/menu/presentation";
import { primeniPrikazMedija } from "@/lib/menu/public-view";
import type { PublicSection } from "@/lib/menu/snapshot";
import { JavniMeni } from "./javni-meni";

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in javni.test.tsx)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

/** The opening tag at the start of a piece of markup. */
const prviTag = (markup: string) => markup.slice(0, markup.indexOf(">") + 1);

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
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

type StranicaPrikaz = Extract<JavniIzlogPrikaz, { vrsta: "stranica" }>;

function stranica(over: Record<string, string>): StranicaPrikaz {
  const prikaz = javniIzlog(parsePublicPreview(over));
  if (prikaz.vrsta !== "stranica") throw new Error(`expected a menu page for ${JSON.stringify(over)}`);
  return prikaz;
}

const neprazne = (sekcije: readonly PublicSection[]) => sekcije.filter((sekcija) => sekcija.articles.length > 0);

type Prikaz = Partial<MenuPresentationValues> & { pocetnaKategorija?: string | null };

/**
 * The page rendered in an appearance built from its own presentation with `over`
 * laid on top. Nothing is "Privremeno nedostupno" (that marker draws a small icon
 * of its own, which is not media).
 */
function prikazi(prikaz: StranicaPrikaz, over: Prikaz = {}): string {
  const { pocetnaKategorija = null, ...izgled } = over;
  return renderToStaticMarkup(
    <JavniMeni
      view={prikaz.view}
      izgled={javniIzgled({ ...prikaz.presentation, ...izgled })}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={[]}
      pocetnaKategorija={pocetnaKategorija}
    />,
  );
}

/** The rows of a page; for `Kategorije` the rows of every category, one render per category. */
function sviRedovi(prikaz: StranicaPrikaz, over: Prikaz): Red[] {
  const layout = over.layout ?? prikaz.presentation.layout;
  if (layout !== "categories") return redovi(prikazi(prikaz, over));
  return neprazne(prikaz.view.sekcije).flatMap((sekcija) => redovi(prikazi(prikaz, { ...over, pocetnaKategorija: sekcija.key })));
}

const brojArtikalaUFixturi = (prikaz: StranicaPrikaz) => prikaz.view.sekcije.reduce((zbir, sekcija) => zbir + sekcija.articles.length, 0);

// The restaurant example with every article set to a photo (the fixture resolves most of
// them; the fourth of every four has no photo yet): the richest case for a media ceiling.
const SLIKE = stranica({ primer: "restoran", mediji: "slika" });
const LAYOUTI_SA_MEDIJIMA = ["flow", "categories"] as const satisfies readonly MenuLayout[];

// -----------------------------------------------------------------------------
// The Premium layout variant
// -----------------------------------------------------------------------------

describe("K17 layout variant on the menu root", () => {
  const koreni = (over: Prikaz) => koren(prikazi(SLIKE, over));
  const varijanta = (layout: MenuLayout, layoutVariant: string | undefined) =>
    attr(koreni({ layout, ...(layoutVariant === undefined ? {} : { layoutVariant }) }), "data-varijanta");

  test('Tok with the variant "kartice": the root says data-varijanta="kartice" (and is still Tok)', () => {
    const root = koreni({ layout: "flow", layoutVariant: "kartice" });
    expect(attr(root, "data-varijanta")).toBe("kartice");
    expect(attr(root, "data-layout")).toBe("flow");
  });

  test('Kompaktno with "kartice": a variant of another layout is not applied, there is no data-varijanta', () => {
    const root = koreni({ layout: "compact", layoutVariant: "kartice" });
    expect(root).not.toContain("data-varijanta");
    expect(attr(root, "data-layout")).toBe("compact");
  });

  test("no variant chosen: no data-varijanta in any layout", () => {
    for (const layout of ["flow", "categories", "compact"] as const) {
      expect(koreni({ layout }), layout).not.toContain("data-varijanta");
    }
    // The default presentation of a venue that never chose anything.
    const zadano = renderToStaticMarkup(
      <JavniMeni
        view={SLIKE.view}
        izgled={javniIzgled(MENU_DEFAULT_PRESENTATION)}
        slike={SLIKE.slike}
        sadaMs={SLIKE.sadaMs}
        nedostupni={[]}
      />,
    );
    expect(koren(zadano)).not.toContain("data-varijanta");
  });

  test("each layout has its own variant; an unknown one and another layout's are ignored", () => {
    expect(varijanta("flow", "kartice")).toBe("kartice");
    expect(varijanta("categories", "lista")).toBe("lista");
    expect(varijanta("compact", "dve-kolone")).toBe("dve-kolone");

    expect(varijanta("flow", "lista")).toBeUndefined();
    expect(varijanta("flow", "dve-kolone")).toBeUndefined();
    expect(varijanta("categories", "kartice")).toBeUndefined();
    expect(varijanta("compact", "lista")).toBeUndefined();
    expect(varijanta("flow", "nepoznata")).toBeUndefined();
    expect(varijanta("flow", "")).toBeUndefined();
  });

  test("a variant only re-arranges: the same rows with the same content, only the root attribute differs", () => {
    const osnovni = prikazi(SLIKE, { layout: "flow" });
    const kartice = prikazi(SLIKE, { layout: "flow", layoutVariant: "kartice" });
    expect(redovi(kartice).map((red) => red.markup)).toEqual(redovi(osnovni).map((red) => red.markup));
    expect(kartice.replace(' data-varijanta="kartice"', "")).toBe(osnovni);
  });
});

// -----------------------------------------------------------------------------
// The menu-wide media display
// -----------------------------------------------------------------------------

describe("K17 menu-wide media display (defaultMediaMode)", () => {
  test("the fixture has what the checks need: photos and icons for the same articles, in both layouts that draw media", () => {
    expect(brojArtikalaUFixturi(SLIKE)).toBeGreaterThan(3);
    for (const layout of LAYOUTI_SA_MEDIJIMA) {
      const reds = sviRedovi(SLIKE, { layout, defaultMediaMode: "image" });
      expect(reds, layout).toHaveLength(brojArtikalaUFixturi(SLIKE));
      expect(reds.some((red) => red.markup.includes("<img")), layout).toBe(true);
      expect(reds.some((red) => red.markup.includes("<svg")), layout).toBe(true);
    }
  });

  test('"none": no <img> and no <svg> in any data-artikal element, in Tok and in Kategorije; the root says data-mediji="none"', () => {
    for (const layout of LAYOUTI_SA_MEDIJIMA) {
      const over: Prikaz = { layout, defaultMediaMode: "none" };
      const reds = sviRedovi(SLIKE, over);
      expect(reds, layout).toHaveLength(brojArtikalaUFixturi(SLIKE));
      for (const red of reds) {
        expect(red.markup, `${layout} ${red.id}`).not.toContain("<img");
        expect(red.markup, `${layout} ${red.id}`).not.toContain("<svg");
        expect(red.markup, `${layout} ${red.id}`).not.toContain("data-medij");
      }
      expect(attr(koren(prikazi(SLIKE, over)), "data-mediji"), layout).toBe("none");
      expect(prikazi(SLIKE, over), layout).not.toContain("<img");
    }
  });

  test('"icon": no <img> in any data-artikal element; every photo became an icon of the set; the root says data-mediji="icon"', () => {
    for (const layout of LAYOUTI_SA_MEDIJIMA) {
      const over: Prikaz = { layout, defaultMediaMode: "icon" };
      const reds = sviRedovi(SLIKE, over);
      expect(reds, layout).toHaveLength(brojArtikalaUFixturi(SLIKE));
      for (const red of reds) {
        expect(red.markup, `${layout} ${red.id}`).not.toContain("<img");
        // Photos are turned into icons, not dropped: the row carries its icon.
        expect(red.markup, `${layout} ${red.id}`).toContain("<svg");
        expect(attr(prviTag(red.markup), "data-medij"), `${layout} ${red.id}`).toBe("ikonica");
      }
      expect(attr(koren(prikazi(SLIKE, over)), "data-mediji"), layout).toBe("icon");
      expect(prikazi(SLIKE, over), layout).not.toContain("<img");
    }
  });

  test('"image": K13 behaviour unchanged: photos where there is one, the icon where there is none, and no data-mediji on the root', () => {
    for (const layout of LAYOUTI_SA_MEDIJIMA) {
      const over: Prikaz = { layout, defaultMediaMode: "image" };
      const reds = sviRedovi(SLIKE, over);
      expect(reds.some((red) => red.markup.includes("<img")), layout).toBe(true);
      expect(reds.some((red) => attr(prviTag(red.markup), "data-medij") === "slika"), layout).toBe(true);
      // The articles without a photo yet keep the icon fallback.
      expect(reds.some((red) => !red.markup.includes("<img") && red.markup.includes("<svg")), layout).toBe(true);
      expect(koren(prikazi(SLIKE, over)), layout).not.toContain("data-mediji");
    }
    // A presentation from before K17 (no defaultMediaMode at all) draws exactly the same.
    const bezPolja = { ...SLIKE.presentation } as Partial<MenuPresentationValues>;
    delete bezPolja.defaultMediaMode;
    const stari = renderToStaticMarkup(
      <JavniMeni
        view={SLIKE.view}
        izgled={javniIzgled(bezPolja as MenuPresentationValues)}
        slike={SLIKE.slike}
        sadaMs={SLIKE.sadaMs}
        nedostupni={[]}
        pocetnaKategorija={null}
      />,
    );
    expect(stari).toBe(prikazi(SLIKE, { defaultMediaMode: "image" }));
    expect(koren(stari)).not.toContain("data-mediji");
    // And the ceiling itself hands back the same sections when it changes nothing.
    expect(primeniPrikazMedija(SLIKE.view.sekcije, "image")).toBe(SLIKE.view.sekcije);
  });

  test("the ceiling only lowers: an article set to text only stays text only under any ceiling", () => {
    const bez = stranica({ primer: "restoran", mediji: "bez" });
    for (const layout of LAYOUTI_SA_MEDIJIMA) {
      for (const mediji of ["image", "icon", "none"] as const satisfies readonly MenuMediaMode[]) {
        const reds = sviRedovi(bez, { layout, defaultMediaMode: mediji });
        expect(reds.length, `${layout} ${mediji}`).toBeGreaterThan(0);
        for (const red of reds) {
          expect(red.markup, `${layout} ${mediji} ${red.id}`).not.toContain("<img");
          expect(red.markup, `${layout} ${mediji} ${red.id}`).not.toContain("<svg");
        }
      }
    }
  });

  test("Kompaktno never has media, whatever the menu-wide display is (and with its variant)", () => {
    for (const mediji of ["image", "icon", "none"] as const satisfies readonly MenuMediaMode[]) {
      for (const layoutVariant of [undefined, "dve-kolone"]) {
        const over: Prikaz = { layout: "compact", defaultMediaMode: mediji, ...(layoutVariant ? { layoutVariant } : {}) };
        const html = prikazi(SLIKE, over);
        const reds = redovi(html);
        const ime = `${mediji} ${layoutVariant ?? "osnovna"}`;
        expect(reds, ime).toHaveLength(brojArtikalaUFixturi(SLIKE));
        expect(html, ime).not.toContain("<img");
        for (const red of reds) {
          expect(red.markup, `${ime} ${red.id}`).not.toContain("<img");
          expect(red.markup, `${ime} ${red.id}`).not.toContain("<svg");
          expect(red.markup, `${ime} ${red.id}`).not.toContain("data-medij");
        }
        expect(attr(koren(html), "data-layout"), ime).toBe("compact");
      }
    }
  });
});
