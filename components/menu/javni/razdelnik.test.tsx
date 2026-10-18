// K13 render tests: the splitter (JavniRazdelnik), the page navigation
// (NavigacijaStranica) and the "page not available" state, over the izlog
// fixtures (the real publish path) and over hand-made views. Server markup only
// (renderToStaticMarkup, no DOM). Texts come from the dictionaries; the only
// literals are fixture facts (an invented venue and its URLs).

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { javniIzlog } from "@/components/menu/fixtures/javni";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { MENU_DEFAULT_PRESENTATION } from "@/lib/menu/presentation";
import type { JavniRazdelnikView } from "@/lib/menu/public-view";
import type { PublicPageMeta } from "@/lib/menu/snapshot";
import { NavigacijaStranica } from "./navigacija-stranica";
import { JavniRazdelnik } from "./razdelnik";
import { StranicaNedostupna } from "./stanja";

// The global link stub keeps only href and className; these tests read
// `aria-current`, `tabIndex` and `data-stranica`, so the mock passes the props through.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

const t = menuJavniSr;
const d = menuDomenSr;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// What React puts into markup for text.
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
const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();
const prviTag = (markup: string) => markup.slice(0, markup.indexOf(">") + 1);

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** Every <a> with its opening tag and inner markup. */
const sidra = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => ({
    tag: prviTag(match[0]),
    markup: match[0],
    href: attr(prviTag(match[0]), "href"),
  }));

/** The decorative media box of a splitter link: an <img> (cover) or an <svg> (icon). */
function medij(link: string): string {
  return /<span class="[^"]*medij[^"]*" aria-hidden="true">([\s\S]*?)<\/span>/.exec(link)?.[1] ?? "";
}

/** The name of a splitter link. */
function naziv(link: string): string {
  return /<span class="[^"]*stranicaNaziv[^"]*">([\s\S]*?)<\/span>/.exec(link)?.[1] ?? "";
}

/** The monogram letter of the header (the one aria-hidden <span> that is plain text), or null. */
function monogramSlovo(html: string): string | null {
  return /<span\b[^>]*aria-hidden="true">([^<]+)<\/span>/.exec(html)?.[1] ?? null;
}

const meta = (slug: string, title: string | null, over: Partial<PublicPageMeta> = {}): PublicPageMeta => ({
  key: `pg_${slug}`,
  slug,
  title,
  isDefault: false,
  navigation: "shared",
  iconKey: null,
  ...over,
});

// -----------------------------------------------------------------------------
// The splitter in the izlog
// -----------------------------------------------------------------------------

describe("JavniIzlog stanje=razdelnik (primer restoran)", () => {
  const over = { primer: "restoran", stanje: "razdelnik" };
  const prikaz = javniIzlog(parsePublicPreview(over));
  if (prikaz.vrsta !== "razdelnik") throw new Error("expected the splitter");
  const html = renderToStaticMarkup(<JavniIzlog params={parsePublicPreview(over)} />);
  const nav = /<nav\b[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";

  test("exactly one h1 (the venue), one main, one nav named with the dictionary", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(/<h1\b[^>]*>([^<]*)<\/h1>/.exec(html)?.[1]).toBe(esc(prikaz.view.lokal.naziv));
    expect(count(html, "<main")).toBe(1);
    expect(count(html, "<nav")).toBe(1);
    expect(attr(prviTag(nav), "aria-label")).toBe(t.razdelnik.stranice);
    expect(nav).toContain("data-razdelnik");
  });

  test("one link per public page, in the published order: glavni first, then vinska-karta", () => {
    const hrefovi = sidra(nav).map((link) => link.href);
    expect(hrefovi).toEqual(["/demo-restoran/meni/glavni", "/demo-restoran/meni/vinska-karta"]);
    expect(hrefovi).toEqual(prikaz.view.stranice.map((stranica) => `/${prikaz.view.lokal.slug}/meni/${stranica.slug}`));
  });

  test('the default page is "Meni", the other one has its own title; never the editor\'s "Kompletan meni"', () => {
    const [glavni, vinska] = sidra(nav).map((link) => naziv(link.markup));
    expect(glavni).toBe(esc(t.razdelnik.meni));
    expect(prikaz.view.stranice[1].title).not.toBeNull();
    expect(vinska).toBe(esc(prikaz.view.stranice[1].title as string));
    expect(html).not.toContain(esc(d.defaultPageName));
  });

  test("the intro line is shown", () => {
    expect(nav).toContain(`>${esc(t.razdelnik.uvod)}</p>`);
  });

  test("the first page shows its cover image, the others an icon", () => {
    const [prva, druga] = sidra(nav).map((link) => medij(link.markup));
    for (const link of sidra(nav)) expect(link.tag).not.toContain("data-bez-medija");
    expect(prva).toContain("<img");
    expect(attr(/<img\b[^>]*>/.exec(prva)?.[0] ?? "", "alt")).toBe("");
    expect(prva).not.toContain("<svg");
    expect(druga).toContain("<svg");
    expect(druga).not.toContain("<img");
    expect(Object.values(prikaz.naslovne).filter((slika) => slika !== null)).toHaveLength(1);
  });

  test("every primer gets the same two pages, one h1, one nav", () => {
    for (const primer of ["kafic", "restoran", "prestizni"]) {
      const markup = renderToStaticMarkup(<JavniIzlog params={parsePublicPreview({ primer, stanje: "razdelnik" })} />);
      expect(count(markup, "<h1"), primer).toBe(1);
      expect(count(markup, "<nav"), primer).toBe(1);
      expect(sidra(markup).map((link) => link.href), primer).toEqual([
        "/demo-restoran/meni/glavni",
        "/demo-restoran/meni/vinska-karta",
      ]);
      expect(markup, primer).not.toContain(esc(d.defaultPageName));
    }
  });
});

// -----------------------------------------------------------------------------
// JavniRazdelnik with hand-made views
// -----------------------------------------------------------------------------

describe("JavniRazdelnik", () => {
  const izgled = javniIzgled(MENU_DEFAULT_PRESENTATION);
  const lokal = { naziv: "kod Mike", slug: "probni", logoUrl: null as string | null };
  const razdelnik = (stranice: PublicPageMeta[], lokalOver: Partial<typeof lokal> = {}, ugradjen = false) => {
    const view: JavniRazdelnikView = { lokal: { ...lokal, ...lokalOver }, stranice, jezik: "sr", jezici: ["sr"] };
    return renderToStaticMarkup(<JavniRazdelnik view={view} izgled={izgled} ugradjen={ugradjen} />);
  };

  test("pages appear in the given order, with their title or the default name", () => {
    const html = razdelnik([
      meta("zebra", "Zebra stranica"),
      meta("glavni", null, { isDefault: true }),
      meta("alfa", "Alfa stranica"),
    ]);
    const veze = sidra(html);
    expect(veze.map((link) => link.href)).toEqual(["/probni/meni/zebra", "/probni/meni/glavni", "/probni/meni/alfa"]);
    expect(veze.map((link) => naziv(link.markup))).toEqual(["Zebra stranica", esc(t.razdelnik.meni), "Alfa stranica"]);
  });

  test("every page link carries its slug", () => {
    const html = razdelnik([meta("zebra", "Zebra stranica"), meta("alfa", "Alfa stranica")]);
    expect(sidra(html).map((link) => attr(link.tag, "data-stranica"))).toEqual(["zebra", "alfa"]);
  });

  test("a page title is escaped", () => {
    const html = razdelnik([meta("a", "Sokovi & <vina>")]);
    expect(html).toContain("Sokovi &amp; &lt;vina&gt;");
    expect(html).not.toContain("<vina>");
  });

  test("zero pages: the empty-menu state and no navigation", () => {
    const html = razdelnik([]);
    expect(html).toContain(esc(t.stanja.praznoMeniNaslov));
    expect(html).toContain(esc(t.stanja.praznoMeniOpis));
    expect(html).toContain(`>${esc(t.stanja.praznoPitajte)}</p>`);
    expect(html).toContain('data-stanje="prazan-meni"');
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("data-razdelnik");
    expect(count(html, "<h1")).toBe(1);
  });

  test("a logo replaces the monogram: a decorative <img>, no letter", () => {
    const html = razdelnik([meta("glavni", null, { isDefault: true })], { logoUrl: "/logo-probe.png" });
    const img = /<img\b[^>]*>/.exec(html)?.[0] ?? "";
    expect(attr(img, "src")).toBe("/logo-probe.png");
    expect(attr(img, "alt")).toBe("");
    expect(monogramSlovo(html)).toBeNull();
  });

  test("without a logo the monogram is the first letter of the name, uppercase", () => {
    const stranice = [meta("glavni", null, { isDefault: true })];
    expect(monogramSlovo(razdelnik(stranice))).toBe("K"); // "kod Mike"
    expect(monogramSlovo(razdelnik(stranice, { naziv: "  šank" }))).toBe("Š");
    expect(monogramSlovo(razdelnik(stranice, { naziv: "Mika" }))).toBe("M");
    expect(razdelnik(stranice)).not.toContain("<img");
  });

  test("a page without a cover shows its icon; a cover shows an image", () => {
    const stranice = [meta("a", "A", { iconKey: "vino" }), meta("b", "B")];
    const bez = razdelnik(stranice);
    for (const link of sidra(bez)) expect(medij(link.markup)).toContain("<svg");
    const view: JavniRazdelnikView = { lokal, stranice, jezik: "sr", jezici: ["sr"] };
    const sCoverom = renderToStaticMarkup(
      <JavniRazdelnik
        view={view}
        izgled={izgled}
        naslovne={{ pg_a: { thumbUrl: "/probna-mala.jpg", url: "/probna.jpg", width: 640, height: 400 }, pg_b: null }}
      />,
    );
    const [a, b] = sidra(sCoverom).map((link) => medij(link.markup));
    expect(a).toContain('src="/probna-mala.jpg"');
    expect(b).toContain("<svg");
  });

  test("in the editor preview the splitter has no landmarks and no h1", () => {
    const html = razdelnik([meta("a", "A"), meta("b", "B")], {}, true);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).toContain("data-ugradjen");
  });
});

// -----------------------------------------------------------------------------
// The splitter of a prestige (Kompaktno) venue
// -----------------------------------------------------------------------------

describe("JavniRazdelnik in the Kompaktno layout", () => {
  test("izlog prestizni: a typographic list, no media box on any page, the monogram still in the markup", () => {
    const html = renderToStaticMarkup(
      <JavniIzlog params={parsePublicPreview({ primer: "prestizni", stanje: "razdelnik" })} />,
    );
    const veze = sidra(html);
    expect(veze).toHaveLength(2);
    for (const veza of veze) {
      expect(veza.tag).toContain("data-bez-medija");
      expect(medij(veza.markup)).toBe("");
      expect(veza.markup).not.toContain("<img");
    }
    // The page names and links are unchanged.
    expect(veze.map((veza) => veza.href)).toEqual(["/demo-restoran/meni/glavni", "/demo-restoran/meni/vinska-karta"]);
    expect(veze.map((veza) => naziv(veza.markup))[0]).toBe(esc(t.razdelnik.meni));
    // The prestige header hides the monogram in CSS only; the markup keeps it.
    expect(monogramSlovo(html)).toBe("R");
  });

  test("only a cover photo gives a page a media box; without one there is no glyph tile", () => {
    const izgled = javniIzgled({ ...MENU_DEFAULT_PRESENTATION, layout: "compact" });
    const stranice = [meta("a", "A", { iconKey: "vino" }), meta("b", "B")];
    const view: JavniRazdelnikView = {
      lokal: { naziv: "kod Mike", slug: "probni", logoUrl: null },
      stranice,
      jezik: "sr",
      jezici: ["sr"],
    };
    const html = renderToStaticMarkup(
      <JavniRazdelnik
        view={view}
        izgled={izgled}
        naslovne={{ pg_a: { thumbUrl: "/probna-mala.jpg", url: "/probna.jpg", width: 640, height: 400 }, pg_b: null }}
      />,
    );
    const [a, b] = sidra(html);
    expect(a.tag).not.toContain("data-bez-medija");
    expect(medij(a.markup)).toContain('src="/probna-mala.jpg"');
    expect(b.tag).toContain("data-bez-medija");
    expect(medij(b.markup)).toBe("");
    // The same pages in a flow layout keep the glyph tile.
    const tok = renderToStaticMarkup(
      <JavniRazdelnik view={view} izgled={javniIzgled(MENU_DEFAULT_PRESENTATION)} />,
    );
    for (const veza of sidra(tok)) {
      expect(veza.tag).not.toContain("data-bez-medija");
      expect(medij(veza.markup)).toContain("<svg");
    }
  });
});

// -----------------------------------------------------------------------------
// NavigacijaStranica
// -----------------------------------------------------------------------------

describe("NavigacijaStranica", () => {
  const glavni = meta("glavni", null, { isDefault: true });
  const vinska = meta("vinska-karta", "Vinska karta");
  const desert = meta("desert", "Desert");
  const sve = [glavni, vinska, desert];
  const nav = (stranica: PublicPageMeta, stranice: PublicPageMeta[], ugradjen?: boolean) =>
    renderToStaticMarkup(<NavigacijaStranica slug="probni" stranica={stranica} stranice={stranice} ugradjen={ugradjen} />);

  test('"standalone" renders nothing', () => {
    expect(nav({ ...vinska, navigation: "standalone" }, sve)).toBe("");
  });

  test('"back" renders one link to the menu named with the dictionary', () => {
    const html = nav({ ...vinska, navigation: "back" }, sve);
    const veze = sidra(html);
    expect(veze).toHaveLength(1);
    expect(veze[0].href).toBe("/probni/meni");
    expect(bezTagova(veze[0].markup)).toBe(esc(t.navigacija.sveStranice));
    expect(html).not.toContain("<nav");
  });

  test('"back" is not a tab stop in the editor preview', () => {
    const veze = sidra(nav({ ...vinska, navigation: "back" }, sve, true));
    expect(attr(veze[0].tag, "tabindex")).toBe("-1");
  });

  test('"shared" links are not tab stops in the editor preview, and none of them is lost', () => {
    const veze = sidra(nav(vinska, sve, true));
    expect(veze).toHaveLength(sve.length);
    for (const veza of veze) expect(attr(veza.tag, "tabindex"), veza.href).toBe("-1");
    // Outside the preview they are ordinary links.
    for (const veza of sidra(nav(vinska, sve))) expect(attr(veza.tag, "tabindex"), veza.href).toBeUndefined();
  });

  test('"shared" renders one link per page, in order, named like the splitter', () => {
    const html = nav(vinska, sve);
    expect(attr(prviTag(html), "aria-label")).toBe(t.navigacija.stranice);
    const veze = sidra(html);
    expect(veze.map((link) => link.href)).toEqual(["/probni/meni/glavni", "/probni/meni/vinska-karta", "/probni/meni/desert"]);
    expect(veze.map((link) => bezTagova(link.markup))).toEqual([esc(t.razdelnik.meni), "Vinska karta", "Desert"]);
  });

  test('"shared" marks only the current page with aria-current="page"', () => {
    for (const [trenutna, indeks] of [[glavni, 0], [vinska, 1], [desert, 2]] as const) {
      const veze = sidra(nav(trenutna, sve));
      const oznacene = veze.map((link, i) => (attr(link.tag, "aria-current") === "page" ? i : -1)).filter((i) => i >= 0);
      expect(oznacene, trenutna.slug).toEqual([indeks]);
      expect(veze.filter((link) => link.tag.includes("aria-current"))).toHaveLength(1);
    }
  });

  test("a one-page menu renders nothing, whatever the navigation", () => {
    for (const navigation of ["shared", "back", "standalone"] as const) {
      expect(nav({ ...vinska, navigation }, [vinska]), navigation).toBe("");
    }
  });
});

// -----------------------------------------------------------------------------
// StranicaNedostupna
// -----------------------------------------------------------------------------

describe("StranicaNedostupna", () => {
  test("says the page is not available and links to the menu", () => {
    const html = renderToStaticMarkup(<StranicaNedostupna meniHref="/probni/meni" />);
    expect(html).toContain('data-stanje="nedostupna"');
    expect(html).toContain(esc(t.stanja.nedostupnaNaslov));
    expect(html).toContain(esc(t.stanja.nedostupnaOpis));
    const veze = sidra(html);
    expect(veze).toHaveLength(1);
    expect(veze[0].href).toBe("/probni/meni");
    expect(bezTagova(veze[0].markup)).toBe(esc(t.stanja.otvoriMeni));
  });

  test("the link goes where it is told", () => {
    const html = renderToStaticMarkup(<StranicaNedostupna meniHref="/drugi-lokal/meni" />);
    expect(sidra(html).map((link) => link.href)).toEqual(["/drugi-lokal/meni"]);
  });
});
