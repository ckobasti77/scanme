// K17 render tests: Izgled, the curated appearance of the public menu (the second
// mode of the editor). Server markup only (renderToStaticMarkup, no DOM), set up
// like k15.test.tsx and k16.test.tsx: useSirina() answers "desktop" on the server,
// effects never run, `@/components/ui/dialog` is replaced by a stand-in that
// renders an open dialog inline and next/link by a plain anchor.
//
// Most tests render the izlog (`tab=izgled`, `plan=premium`, `paleta=<id>`); the
// ones that need a state the izlog never has (Kompaktno, a read-only editor, the
// loading and refused states, an account that lost Premium) render
// IzgledRadniProstor on its own with the props the editor would pass. A control
// is DISABLED when it has its own `disabled` or sits in a disabled <fieldset>
// (that is how the card choices and the segments are switched off). Texts come
// from the dictionaries; the only literals are the acceptance words the owner
// named ("ScanMe", the address of the team) and invented fixture facts.

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu } from "@/components/menu/fixtures";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_PAROVI_FONTOVA } from "@/lib/menu/identity/font-pairs";
import { MENU_JAVNE_PALETE, paletaPoId } from "@/lib/menu/identity/palettes";
import type { MenuIzgledPlan } from "@/lib/menu/identity/premium";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parseEditorPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "@/lib/menu/presentation";
import { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { sadrzajIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type { StudioIzgled, StudioRadnje } from "@/lib/menu/studio/model";
import { IzgledRadniProstor } from "./izgled/izgled-radni-prostor";
import { miniSadrzaj } from "./izgled/raspored-izbor";

// Nothing in the editor uses next/link; the stub keeps the file independent of
// the global one, as the other izlog render tests do.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

// `Dialog` shows its content inline when open (the Radix portal mounts only after effects).
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

const t = menuStudioSr.izgled;
const pregledSr = menuStudioSr.pregled;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in k11/k15/k16)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;
/** The visible text of a piece of markup: tags become spaces, entities are read back, spaces are collapsed. */
const tekst = (markup: string) => unesc(markup.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
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

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;

/** The whole element that opens at `pocetak` (tags are balanced; void elements do not count). */
function element(html: string, pocetak: number): string {
  const re = new RegExp(TAG.source, "g");
  re.lastIndex = pocetak;
  let dubina = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    const [, zatvara, ime, samozatvarajuci] = match;
    if (VOID.has(ime.toLowerCase()) || samozatvarajuci) continue;
    dubina += zatvara ? -1 : 1;
    if (dubina === 0) return html.slice(pocetak, match.index + match[0].length);
  }
  throw new Error(`unbalanced markup from ${pocetak}`);
}

/** The element whose opening tag contains `trag`, as a whole. */
function elementSaTragom(html: string, ime: string, trag: string): string {
  const mesto = html.indexOf(trag);
  if (mesto < 0) throw new Error(`no ${trag} in the markup`);
  const pocetak = html.lastIndexOf(`<${ime}`, mesto);
  if (pocetak < 0) throw new Error(`no <${ime}> before ${trag}`);
  return element(html, pocetak);
}

function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
}

/** One area of Izgled by its id (`izgled-boje`, `izgled-raspored`, ...), as a whole. */
const grupa = (html: string, id: string) => elementSaTragom(html, "section", `data-grupa-izgleda="${id}"`);

type Radio = { tag: string; indeks: number; vrednost: string | undefined; izabran: boolean; onemoguceno: boolean };

/** Every radio of a piece of markup; `onemoguceno` counts a disabled <fieldset> around it. */
function radiji(markup: string): Radio[] {
  const polja = [...markup.matchAll(/<fieldset\b[^>]*\sdisabled=""[^>]*>/g)].map((match) => {
    const pocetak = mora(match.index, "no index");
    return [pocetak, pocetak + element(markup, pocetak).length] as const;
  });
  return [...markup.matchAll(/<input\b[^>]*\stype="radio"[^>]*>/g)].map((match) => {
    const indeks = mora(match.index, "no index");
    return {
      tag: match[0],
      indeks,
      vrednost: attr(match[0], "value"),
      izabran: jeOznaceno(match[0]),
      onemoguceno: jeOnemoguceno(match[0]) || polja.some(([od, kraj]) => indeks > od && indeks < kraj),
    };
  });
}

/** Every switch (`role="switch"`) of a piece of markup. */
const prekidaci = (markup: string) =>
  [...markup.matchAll(/<input\b[^>]*\srole="switch"[^>]*>/g)].map((match) => ({
    tag: match[0],
    onemoguceno: jeOnemoguceno(match[0]),
    ukljucen: jeOznaceno(match[0]),
  }));

type Kartica = {
  vrednost: string;
  markup: string;
  tekst: string;
  zakljucano: boolean;
  izabrano: boolean;
  radio: Radio;
};

/** The cards (`<label data-izbor>`) of a piece of markup, each with its own radio. */
function kartice(markup: string): Kartica[] {
  const svi = radiji(markup);
  return [...markup.matchAll(/<label\b[^>]*\sdata-izbor="[^"]*"[^>]*>/g)].map((match) => {
    const pocetak = mora(match.index, "no index");
    const label = element(markup, pocetak);
    const tag = prviTag(label);
    const vrednost = mora(attr(tag, "data-izbor"), "card without a value");
    const radio = mora(
      svi.find((kandidat) => kandidat.indeks > pocetak && kandidat.indeks < pocetak + label.length),
      `no radio in the card ${vrednost}`,
    );
    return { vrednost, markup: label, tekst: tekst(label), zakljucano: /\sdata-zakljucano=""/.test(tag), izabrano: /\sdata-izabrano=""/.test(tag), radio };
  });
}

const karticaZa = (markup: string, vrednost: string) =>
  mora(
    kartice(markup).find((kandidat) => kandidat.vrednost === vrednost),
    `no card ${vrednost}`,
  );

/** The server markup of the izlog in Izgled (Standard unless the query says otherwise). */
const izgled = (query: IzlogSearchParams = {}) =>
  renderToStaticMarkup(<EditorIzlog params={parseEditorPreview({ tab: "izgled", ...query })} />);

const STANDARD: MenuIzgledPlan = { extraLayouts: false, reducedBranding: false };
const PREMIUM: MenuIzgledPlan = { extraLayouts: true, reducedBranding: true };

const vrednosti = (over: Partial<MenuPresentationValues> = {}): MenuPresentationValues => ({ ...MENU_DEFAULT_PRESENTATION, ...over });

// Never called in a server render; if one runs, the test says which.
const radnje = new Proxy(
  {},
  {
    get: (_cilj, ime) => () => {
      throw new Error(`StudioRadnje.${String(ime)} must not run in a server render`);
    },
  },
) as StudioRadnje;

const srednji = fixtureMenu("srednji");

/** IzgledRadniProstor on its own, with the props the editor passes (`izgled` undefined = loading, null = refused). */
function prostor(izgledUlaz: StudioIzgled | null | undefined, mozeUredjivanje = true): string {
  const prikaz = izgledUlaz?.vrednosti ?? null;
  return renderToStaticMarkup(
    <IzgledRadniProstor
      izgled={izgledUlaz}
      prikaz={prikaz}
      javni={prikaz ? javniIzgled(prikaz) : null}
      mini={miniSadrzaj([])}
      radnje={radnje}
      red={new AutosaveRed()}
      mozeUredjivanje={mozeUredjivanje}
      naslovId="izgled-naslov-probe"
      lokal={srednji.venueName}
      slug={srednji.slug}
    />,
  );
}

const izIzgleda = (over: Partial<MenuPresentationValues> = {}, plan: MenuIzgledPlan = PREMIUM): StudioIzgled => ({ vrednosti: vrednosti(over), plan });

const PREMIUM_PALETE = ["sampanjac", "indigo", "vino", "sumrak"];
const PREMIUM_PAROVI = ["galerija", "atelje", "grotesk"];

// -----------------------------------------------------------------------------
// A. ScanMe is not offered as a palette of the public menu
// -----------------------------------------------------------------------------

describe("K17 A: the colours are the curated palettes, never the ScanMe palette", () => {
  for (const [ime, query] of [
    ["Standard", {}],
    ["Premium", { plan: "premium" }],
  ] as const) {
    test(`${ime}: the offered palettes are exactly MENU_JAVNE_PALETE, none named ScanMe, none green`, () => {
      const boje = grupa(izgled(query), "izgled-boje");
      const ponudjene = kartice(boje);
      const ids = MENU_JAVNE_PALETE.map((paleta) => paleta.id);

      // Exactly the curated catalog: no extra card (no "scanme", no leftover brand card without a brand palette).
      expect(ponudjene.map((kartica) => kartica.vrednost).sort()).toEqual([...ids].sort());
      expect(radiji(boje).map((radio) => radio.vrednost).sort()).toEqual([...ids].sort());
      expect(ids).toHaveLength(new Set(ids).size);

      // The acceptance: no value, no visible word and no label of the colours group says ScanMe.
      for (const kartica of ponudjene) {
        expect(kartica.vrednost, kartica.vrednost).not.toMatch(/scanme/i);
        expect(kartica.tekst, kartica.vrednost).not.toMatch(/scanme/i);
      }
      expect(tekst(boje)).not.toMatch(/scanme/i);

      // Every card carries the venue-facing name of its palette, and none of them is a green one.
      const imena = t.boje.palete as Record<string, string>;
      expect(Object.keys(imena).sort()).toEqual([...ids].sort());
      for (const kartica of ponudjene) {
        const naziv = mora(imena[kartica.vrednost], `no name for ${kartica.vrednost}`);
        expect(kartica.tekst, kartica.vrednost).toContain(naziv);
        expect(`${kartica.vrednost} ${naziv}`, kartica.vrednost).not.toMatch(/zelen|green/i);
      }
    });
  }

  test("the venue's own brand palette is the one extra card, named for the venue, and only once it has readable colours", () => {
    const ids = MENU_JAVNE_PALETE.map((paleta) => paleta.id);
    const sBrendom = grupa(prostor(izIzgleda({ paletteId: "brend", brandColors: ["#8C2633"] })), "izgled-boje");
    expect(kartice(sBrendom).map((kartica) => kartica.vrednost).sort()).toEqual([...ids, "brend"].sort());
    const brend = karticaZa(sBrendom, "brend");
    expect(brend.izabrano).toBe(true);
    expect(brend.tekst).toContain(t.boje.brend.kartica);
    expect(tekst(sBrendom)).toContain(t.boje.brend.primenjeno);
    expect(tekst(sBrendom)).toContain(t.boje.brend.izmeni);
    expect(tekst(sBrendom)).not.toMatch(/scanme/i);

    // No brand colours saved: the card is not there, and the way to add them is.
    const bezBrenda = grupa(prostor(izIzgleda()), "izgled-boje");
    expect(kartice(bezBrenda).map((kartica) => kartica.vrednost)).not.toContain("brend");
    expect(tekst(bezBrenda)).toContain(t.boje.brend.dodaj);
    expect(tekst(bezBrenda)).not.toContain(t.boje.brend.primenjeno);
  });

  test("the page itself still says ScanMe elsewhere (the signature group), only the colours group does not", () => {
    // Guards the scope of the assertion above: the panel legitimately names ScanMe.
    const html = izgled();
    expect(tekst(grupa(html, "izgled-brending"))).toMatch(/scanme/i);
    expect(tekst(grupa(html, "izgled-boje"))).not.toMatch(/scanme/i);
  });
});

// -----------------------------------------------------------------------------
// B. Premium choices: visible, locked with the reason on Standard; open on Premium
// -----------------------------------------------------------------------------

describe("K17 B: Premium palettes, font pairs, layout variant and signature", () => {
  test("the Premium sets are the ones the catalogs mark (guards the lists used below)", () => {
    expect(MENU_JAVNE_PALETE.filter((paleta) => paleta.premium).map((paleta) => paleta.id).sort()).toEqual([...PREMIUM_PALETE].sort());
    expect(MENU_PAROVI_FONTOVA.filter((par) => par.premium).map((par) => par.id).sort()).toEqual([...PREMIUM_PAROVI].sort());
  });

  // K17 (critique): a locked card is aria-disabled, NOT disabled — it stays reachable by Tab and the
  // arrow keys so its reason is heard, and choosing it does nothing (kontrole.tsx).
  test("Standard: Premium palettes and pairs are locked (aria-disabled, still reachable), the reason sits under them and the radio points at it", () => {
    const html = izgled();

    const boje = grupa(html, "izgled-boje");
    for (const id of PREMIUM_PALETE) {
      const kartica = karticaZa(boje, id);
      expect(kartica.zakljucano, id).toBe(true);
      expect(attr(kartica.radio.tag, "aria-disabled"), id).toBe("true");
      expect(kartica.radio.onemoguceno, id).toBe(false);
      expect(kartica.tekst, id).toContain(t.premium);
    }
    expect(tekst(boje)).toContain(t.boje.zakljucano);

    const pismo = grupa(html, "izgled-pismo");
    for (const id of PREMIUM_PAROVI) {
      const kartica = karticaZa(pismo, id);
      expect(kartica.zakljucano, id).toBe(true);
      expect(attr(kartica.radio.tag, "aria-disabled"), id).toBe("true");
      expect(kartica.radio.onemoguceno, id).toBe(false);
      expect(kartica.tekst, id).toContain(t.premium);
    }
    expect(tekst(pismo)).toContain(t.pismo.zakljucano);

    // The locked radio is described by the reason (the one sentence under the cards).
    for (const [skup, id, razlog] of [
      [boje, "vino", t.boje.zakljucano],
      [pismo, "galerija", t.pismo.zakljucano],
    ] as const) {
      const opisan = mora(attr(karticaZa(skup, id).radio.tag, "aria-describedby"), `${id} is not described by its reason`);
      expect(tekst(elementSaTragom(skup, "p", `id="${opisan}"`))).toBe(razlog);
    }

    // Nothing else is locked: exactly the Premium ones, the rest is open.
    expect(kartice(boje).filter((kartica) => kartica.zakljucano).map((kartica) => kartica.vrednost).sort()).toEqual([...PREMIUM_PALETE].sort());
    expect(kartice(pismo).filter((kartica) => kartica.zakljucano).map((kartica) => kartica.vrednost).sort()).toEqual([...PREMIUM_PAROVI].sort());
    for (const kartica of [...kartice(boje), ...kartice(pismo)]) {
      if (!kartica.zakljucano) {
        expect(kartica.radio.onemoguceno, kartica.vrednost).toBe(false);
        expect(attr(kartica.radio.tag, "aria-disabled"), kartica.vrednost).toBeUndefined();
        expect(kartica.tekst, kartica.vrednost).not.toContain(t.premium);
      }
    }
  });

  test('Standard: the layout variant "kartice" is locked with its reason; the three layouts and "Osnovna" stay open', () => {
    const raspored = grupa(izgled(), "izgled-raspored");
    const kartica = karticaZa(raspored, "kartice");
    expect(kartica.zakljucano).toBe(true);
    expect(attr(kartica.radio.tag, "aria-disabled")).toBe("true");
    expect(kartica.radio.onemoguceno).toBe(false);
    expect(kartica.tekst).toContain(t.raspored.varijante.opisi.kartice.naziv);
    expect(tekst(raspored)).toContain(t.raspored.varijante.zakljucano);
    expect(tekst(elementSaTragom(raspored, "p", `id="${mora(attr(kartica.radio.tag, "aria-describedby"), "no reason link")}"`))).toBe(
      t.raspored.varijante.zakljucano,
    );

    for (const otvorena of ["flow", "categories", "compact", "osnovna"]) {
      const druga = karticaZa(raspored, otvorena);
      expect(druga.zakljucano, otvorena).toBe(false);
      expect(druga.radio.onemoguceno, otvorena).toBe(false);
    }
    expect(karticaZa(raspored, "osnovna").izabrano).toBe(true);
  });

  test("Standard: the reduced signature is disabled with its reason, the standard one is chosen and open", () => {
    const brending = grupa(izgled(), "izgled-brending");
    const radio = radiji(brending);
    expect(radio.map((r) => r.vrednost)).toEqual(["standard", "reduced"]);
    const [standardni, smanjen] = radio;
    expect(smanjen.onemoguceno).toBe(true);
    expect(standardni.onemoguceno).toBe(false);
    expect(standardni.izabran).toBe(true);
    expect(smanjen.izabran).toBe(false);
    expect(tekst(brending)).toContain(t.brending.zakljucano);
    // The segment names both signatures, the description is the chosen one's.
    expect(tekst(brending)).toContain(t.brending.vrednosti.reduced);
    expect(tekst(brending)).toContain(t.brending.opisi.standard);
  });

  test("Premium: nothing is locked, every Premium choice is open, no reason is shown", () => {
    const html = izgled({ plan: "premium" });
    expect(html).not.toContain("data-zakljucano");

    const boje = grupa(html, "izgled-boje");
    const pismo = grupa(html, "izgled-pismo");
    for (const id of PREMIUM_PALETE) {
      expect(karticaZa(boje, id).zakljucano, id).toBe(false);
      expect(karticaZa(boje, id).radio.onemoguceno, id).toBe(false);
    }
    for (const id of PREMIUM_PAROVI) {
      expect(karticaZa(pismo, id).zakljucano, id).toBe(false);
      expect(karticaZa(pismo, id).radio.onemoguceno, id).toBe(false);
    }
    const raspored = grupa(html, "izgled-raspored");
    expect(karticaZa(raspored, "kartice").zakljucano).toBe(false);
    expect(karticaZa(raspored, "kartice").radio.onemoguceno).toBe(false);
    for (const radio of radiji(grupa(html, "izgled-brending"))) expect(radio.onemoguceno, String(radio.vrednost)).toBe(false);

    // Every radio of the page is open, and none of the four reasons is on screen.
    for (const radio of radiji(html)) expect(radio.onemoguceno, String(radio.vrednost)).toBe(false);
    const sve = tekst(html);
    for (const razlog of [t.boje.zakljucano, t.pismo.zakljucano, t.raspored.varijante.zakljucano, t.brending.zakljucano]) {
      expect(sve).not.toContain(razlog);
    }

    // The Premium cards stay visible with a quiet mark; the same values are offered as on Standard.
    expect(karticaZa(boje, "vino").tekst).toContain(t.premium);
    expect(kartice(boje).map((kartica) => kartica.vrednost)).toEqual(kartice(grupa(izgled(), "izgled-boje")).map((kartica) => kartica.vrednost));
  });

  test("an account that lost Premium keeps its Premium choices on screen and is told what guests see instead", () => {
    const sPremiumDelovima: Partial<MenuPresentationValues> = { fontPairId: "galerija", branding: "reduced" };
    const izgubio = prostor(izIzgleda(sPremiumDelovima, STANDARD));
    expect(tekst(izgubio)).toContain(t.izgubljenPremium);
    expect(izgubio).toContain("data-izgubljen-premium");
    // The chosen Premium pair is still the selected card, only locked.
    const galerija = karticaZa(grupa(izgubio, "izgled-pismo"), "galerija");
    expect(galerija.izabrano).toBe(true);
    expect(galerija.zakljucano).toBe(true);

    expect(prostor(izIzgleda(sPremiumDelovima, PREMIUM))).not.toContain("data-izgubljen-premium");
    expect(prostor(izIzgleda({}, STANDARD))).not.toContain("data-izgubljen-premium");
  });
});

// -----------------------------------------------------------------------------
// C. One heading of level 1
// -----------------------------------------------------------------------------

describe("K17 C: Izgled has exactly one h1", () => {
  for (const [ime, query] of [
    ["Standard", {}],
    ["Premium", { plan: "premium" }],
  ] as const) {
    test(`${ime}: one visible <h1> with the title of Izgled, the areas are h2`, () => {
      const html = izgled(query);
      expect(count(html, "<h1")).toBe(1);
      const h1 = naslovi(html, 1);
      expect(h1).toHaveLength(1);
      expect(tekst(h1[0])).toBe(t.naslov);
      // Visible: the one heading is not the screen-reader-only one of the phone panes.
      expect(prviTag(mora(/<h1\b[^>]*>/.exec(html), "no h1 tag")[0])).not.toContain("sr-only");
      // The preview is a picture of the menu: the public renderer draws no h1 inside the editor.
      expect(elementSaTragom(html, "div", "data-pregled-sadrzaj")).not.toContain("<h1");
      // The areas below it are h2 (and none of them is a second h1).
      const h2 = naslovi(html, 2).map(tekst);
      for (const naslov of [t.raspored.naslov, t.boje.naslov, t.pismo.naslov, t.gustina.naslov, t.naglasak.naslov, t.mediji.naslov, t.zaGoste.naslov, t.brending.naslov, t.prilagodjen.naslov]) {
        expect(h2, naslov).toContain(naslov);
      }
    });
  }

  test("tab=izgled mounts Izgled; the default editor is Ponuda and does not", () => {
    expect(izgled()).toContain('data-izgled=""');
    const ponuda = renderToStaticMarkup(<EditorIzlog params={parseEditorPreview({})} />);
    expect(ponuda).not.toContain("data-izgled");
    expect(ponuda).not.toContain("data-grupa-izgleda");
    // Izgled is the same on every page: no page column beside it.
    expect(izgled()).not.toContain("data-stranice-kolona");
  });
});

// -----------------------------------------------------------------------------
// D. The three layouts, each with a live miniature
// -----------------------------------------------------------------------------

describe("K17 D: the layouts", () => {
  const LAYOUTI = ["flow", "categories", "compact"] as const;

  test("three cards, each with its own miniature; Tok is chosen by default and the others are not", () => {
    const html = izgled();
    expect(count(html, "data-mini-raspored=")).toBe(3);
    const raspored = grupa(html, "izgled-raspored");
    const izbor = kartice(raspored).filter((kartica) => (LAYOUTI as readonly string[]).includes(kartica.vrednost));
    expect(izbor.map((kartica) => kartica.vrednost)).toEqual([...LAYOUTI]);
    for (const kartica of izbor) {
      expect(count(kartica.markup, "data-mini-raspored="), kartica.vrednost).toBe(1);
      expect(kartica.markup, kartica.vrednost).toContain(`data-mini-raspored="${kartica.vrednost}"`);
      expect(kartica.tekst, kartica.vrednost).toContain(t.raspored.layouti[kartica.vrednost as (typeof LAYOUTI)[number]].naziv);
      expect(kartica.izabrano, kartica.vrednost).toBe(kartica.vrednost === "flow");
      expect(kartica.radio.izabran, kartica.vrednost).toBe(kartica.vrednost === "flow");
    }
    // The line under the cards names the chosen layout and says what it is.
    const opis = tekst(elementSaTragom(raspored, "p", "data-opis-rasporeda"));
    expect(opis).toContain(t.raspored.layouti.flow.naziv);
    expect(opis).toContain(t.raspored.layouti.flow.opis);
  });

  test("the same on Premium: three miniatures, Tok chosen", () => {
    const html = izgled({ plan: "premium" });
    expect(count(html, "data-mini-raspored=")).toBe(3);
    expect(karticaZa(grupa(html, "izgled-raspored"), "flow").izabrano).toBe(true);
  });

  test("the miniatures show the open page's names, not stand-ins", () => {
    const glavna = mora(
      srednji.snapshot.pages.find((page) => page.isDefault),
      "no main page",
    );
    const sadrzaj = mora(sadrzajIzSnapshota(srednji.snapshot, glavna.key), "no content of the main page");
    const ocekivano = miniSadrzaj(
      sadrzaj.sekcije.map((sekcija) => ({
        naziv: sekcija.naziv,
        redovi: sekcija.redovi.filter((red) => !red.sakriven).map((red) => ({ naziv: red.artikal.naziv, cena: red.artikal.cena })),
      })),
    );
    // The fixture is a real menu: the stand-in words are only for an empty page.
    expect(ocekivano.sekcije).not.toEqual([t.raspored.mini.sekcija, t.raspored.mini.druga, t.raspored.mini.treca, t.raspored.mini.cetvrta]);

    const raspored = grupa(izgled(), "izgled-raspored");
    const mini = (layout: string) => {
      const kartica = karticaZa(raspored, layout);
      return tekst(elementSaTragom(kartica.markup, "span", `data-mini-raspored="${layout}"`));
    };
    const tok = mini("flow");
    for (const sekcija of ocekivano.sekcije.slice(0, 3)) expect(tok, sekcija).toContain(sekcija);
    for (const artikal of ocekivano.artikli) {
      expect(tok, artikal.naziv).toContain(artikal.naziv);
      expect(tok, artikal.naziv).toContain(artikal.cena);
    }
    const kategorije = mini("categories");
    for (const sekcija of ocekivano.sekcije.slice(0, 4)) expect(kategorije, sekcija).toContain(sekcija);
    const kompaktno = mini("compact");
    expect(kompaktno).toContain(ocekivano.sekcije[0]);
    for (const artikal of ocekivano.artikli) expect(kompaktno, artikal.naziv).toContain(artikal.naziv);
  });

  test("the miniatures wear the draft palette: topla by default, bordo with paleta=bordo", () => {
    const stil = (html: string, layout: string) => {
      const kartica = karticaZa(grupa(html, "izgled-raspored"), layout);
      return mora(attr(prviTag(elementSaTragom(kartica.markup, "span", `data-mini-raspored="${layout}"`)), "style"), "no style");
    };
    for (const [query, paleta] of [
      [{}, paletaPoId("topla")],
      [{ paleta: "bordo" }, paletaPoId("bordo")],
    ] as const) {
      const html = izgled(query);
      for (const layout of LAYOUTI) {
        const stilovi = stil(html, layout);
        expect(stilovi, `${paleta.id} ${layout}`).toContain(`--menu-page:${paleta.boje.page}`);
        expect(stilovi, `${paleta.id} ${layout}`).toContain(`--menu-accent:${paleta.boje.accent}`);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// E. Kompaktno switches the media choice off and says why
// -----------------------------------------------------------------------------

describe("K17 E: the menu-wide media choice", () => {
  test("Kompaktno: the choice is off (iskljuceno), the three radios are disabled and the reason is shown", () => {
    const html = prostor(izIzgleda({ layout: "compact" }));
    const mediji = elementSaTragom(html, "div", "data-mediji-izbor=");
    expect(attr(prviTag(mediji), "data-mediji-izbor")).toBe("iskljuceno");
    const radio = radiji(mediji);
    expect(radio.map((r) => r.vrednost).sort()).toEqual(["icon", "image", "none"]);
    for (const r of radio) expect(r.onemoguceno, String(r.vrednost)).toBe(true);
    const napomena = elementSaTragom(mediji, "p", "data-mediji-kompaktno");
    expect(tekst(napomena)).toBe(t.mediji.kompaktno);
    // The three values are still named, so the venue sees what the choice will be again.
    for (const naziv of Object.values(t.mediji.vrednosti)) expect(tekst(mediji)).toContain(naziv);
  });

  test("Kompaktno: the chosen value is kept and shown (the choice applies again after a change of layout)", () => {
    const mediji = elementSaTragom(prostor(izIzgleda({ layout: "compact", defaultMediaMode: "icon" })), "div", "data-mediji-izbor=");
    expect(karticaZa(mediji, "icon").izabrano).toBe(true);
    expect(karticaZa(mediji, "image").izabrano).toBe(false);
  });

  test("Tok and Kategorije: the choice is on (ukljuceno), the radios are open and no reason is shown", () => {
    for (const layout of ["flow", "categories"] as const) {
      const html = prostor(izIzgleda({ layout, defaultMediaMode: "none" }));
      const mediji = elementSaTragom(html, "div", "data-mediji-izbor=");
      expect(attr(prviTag(mediji), "data-mediji-izbor"), layout).toBe("ukljuceno");
      for (const r of radiji(mediji)) expect(r.onemoguceno, `${layout} ${r.vrednost}`).toBe(false);
      expect(radiji(mediji)).toHaveLength(3);
      expect(mediji, layout).not.toContain("data-mediji-kompaktno");
      expect(tekst(html), layout).not.toContain(t.mediji.kompaktno);
      expect(karticaZa(mediji, "none").izabrano, layout).toBe(true);
    }
  });

  test("the izlog starts on Tok, so its media choice is on", () => {
    const mediji = elementSaTragom(izgled(), "div", "data-mediji-izbor=");
    expect(attr(prviTag(mediji), "data-mediji-izbor")).toBe("ukljuceno");
    expect(karticaZa(mediji, "image").izabrano).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// F. The preview: three devices, the public renderer, the draft palette
// -----------------------------------------------------------------------------

describe("K17 F: the preview beside Izgled", () => {
  // K17 (critique): beside the column a fourth button opens the large preview (tablet and desktop need room).
  test("three device buttons named by the dictionary, the phone pressed, in a labelled group, then Uvećaj pregled", () => {
    const html = izgled();
    const uredjaji = elementSaTragom(html, "div", `aria-label="${pregledSr.uredjaj}"`);
    const sva = [...uredjaji.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
    expect(sva).toHaveLength(4);
    expect(attr(sva[3], "aria-label")).toBe(pregledSr.uvecaj);
    expect(attr(sva[3], "aria-pressed")).toBeUndefined();
    const dugmad = sva.slice(0, 3);
    const ocekivano = [
      [pregledSr.telefon, "true"],
      [pregledSr.tablet, "false"],
      [pregledSr.desktop, "false"],
    ] as const;
    dugmad.forEach((dugme, i) => {
      expect(attr(dugme, "aria-label")).toBe(ocekivano[i][0]);
      expect(attr(dugme, "title")).toBe(ocekivano[i][0]);
      expect(attr(dugme, "aria-pressed")).toBe(ocekivano[i][1]);
    });
    expect(attr(prviTag(uredjaji), "role")).toBe("group");
    // The note says it is the draft, not what guests see.
    expect(tekst(html)).toContain(pregledSr.napomena);
  });

  test("its content is the public renderer inside the device frame, inert and out of the accessibility tree", () => {
    const html = izgled();
    expect(count(html, "data-javni-meni=")).toBe(1);
    const okvir = elementSaTragom(html, "div", "data-okvir-uredjaja=");
    expect(attr(prviTag(okvir), "data-okvir-uredjaja")).toBe("telefon");
    const koren = mora(/<div\b[^>]*\sdata-javni-meni=""[^>]*>/.exec(okvir), "no public renderer inside the device frame")[0];
    expect(attr(koren, "data-ugradjen")).toBe("");
    // The frame is a [data-bezel] of the same device and the whole picture is inert.
    const bezel = elementSaTragom(html, "div", 'data-bezel="telefon"');
    expect(bezel).toContain(okvir);
    const slika = prviTag(elementSaTragom(bezel, "div", "data-pregled-sadrzaj"));
    expect(slika).toContain(' inert=""');
    expect(attr(slika, "aria-hidden")).toBe("true");
    // Inside the editor the renderer draws no landmark and no heading of level 1.
    expect(okvir).not.toContain("<h1");
    expect(okvir).not.toContain("<main");
    expect(okvir).not.toContain("<footer");
    // And it is the menu of the open page.
    const glavna = mora(
      srednji.snapshot.pages.find((page) => page.isDefault),
      "no main page",
    );
    const sadrzaj = mora(sadrzajIzSnapshota(srednji.snapshot, glavna.key), "no content");
    expect(tekst(okvir)).toContain(sadrzaj.sekcije[0].naziv);
  });

  test("the draft palette: topla by default, bordo with paleta=bordo (the choice and the picture agree)", () => {
    const korenPaleta = (html: string) =>
      attr(mora(/<div\b[^>]*\sdata-javni-meni=""[^>]*>/.exec(elementSaTragom(html, "div", "data-okvir-uredjaja=")), "no renderer")[0], "data-paleta");
    expect(korenPaleta(izgled())).toBe("topla");
    const bordo = izgled({ paleta: "bordo" });
    expect(korenPaleta(bordo)).toBe("bordo");
    const boje = grupa(bordo, "izgled-boje");
    expect(karticaZa(boje, "bordo").izabrano).toBe(true);
    expect(karticaZa(boje, "topla").izabrano).toBe(false);
    // The tokens of the picture are bordo's.
    expect(elementSaTragom(bordo, "div", "data-okvir-uredjaja=")).toContain(`--menu-accent:${paletaPoId("bordo").boje.accent}`);
  });

  test("a Premium palette needs a Premium account: paleta=vino is ignored on Standard (topla), honoured on Premium (vino)", () => {
    const korenPaleta = (html: string) =>
      attr(mora(/<div\b[^>]*\sdata-javni-meni=""[^>]*>/.exec(elementSaTragom(html, "div", "data-okvir-uredjaja=")), "no renderer")[0], "data-paleta");

    const standard = izgled({ paleta: "vino" });
    expect(korenPaleta(standard)).toBe("topla");
    expect(karticaZa(grupa(standard, "izgled-boje"), "topla").izabrano).toBe(true);
    expect(karticaZa(grupa(standard, "izgled-boje"), "vino").izabrano).toBe(false);

    const premium = izgled({ paleta: "vino", plan: "premium" });
    expect(korenPaleta(premium)).toBe("vino");
    expect(karticaZa(grupa(premium, "izgled-boje"), "vino").izabrano).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// G. A read-only editor
// -----------------------------------------------------------------------------

describe("K17 G: read-only", () => {
  test("every radio and every switch is disabled, and so is the brand-colours button", () => {
    const html = prostor(izIzgleda({ search: true }, PREMIUM), false);
    const sviRadiji = radiji(html);
    // Layouts 3 + variant 2 + palettes + pairs + density 3 + emphasis 2 + media 3 + signature 2.
    expect(sviRadiji.length).toBe(3 + 2 + MENU_JAVNE_PALETE.length + MENU_PAROVI_FONTOVA.length + 3 + 2 + 3 + 2);
    for (const radio of sviRadiji) expect(radio.onemoguceno, String(radio.vrednost)).toBe(true);

    const prekidac = prekidaci(html);
    expect(prekidac).toHaveLength(3);
    for (const p of prekidac) expect(jeOnemoguceno(p.tag)).toBe(true);
    // A switch that is on stays on (read-only shows the state, it does not clear it).
    expect(prekidac[0].ukljucen).toBe(true);

    const boje = grupa(html, "izgled-boje");
    const dugme = mora(/<button\b[^>]*>/.exec(boje), "no brand-colours button")[0];
    expect(jeOnemoguceno(dugme)).toBe(true);
  });

  test("the same props with editing allowed leave all of them open (so the check above means something)", () => {
    const html = prostor(izIzgleda({}, PREMIUM), true);
    for (const radio of radiji(html)) expect(radio.onemoguceno, String(radio.vrednost)).toBe(false);
    expect(prekidaci(html)).toHaveLength(3);
    for (const p of prekidaci(html)) expect(p.onemoguceno).toBe(false);
    expect(jeOnemoguceno(mora(/<button\b[^>]*>/.exec(grupa(html, "izgled-boje")), "no brand-colours button")[0])).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// H. "Zatraži prilagođen dizajn": a mail link, no price
// -----------------------------------------------------------------------------

describe("K17 H: fully custom design", () => {
  test("one mailto: link to the team with the venue in the subject, and the section is the last area", () => {
    const html = izgled();
    const sekcija = elementSaTragom(html, "section", "data-prilagodjen-dizajn");
    const linkovi = [...sekcija.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
    expect(linkovi).toHaveLength(1);
    const href = mora(attr(linkovi[0], "href"), "the link has no href");
    const tema = fmt(t.prilagodjen.tema, { lokal: srednji.venueName });
    expect(href.startsWith(`mailto:office@scanme.rs?subject=${encodeURIComponent(tema)}&body=`)).toBe(true);
    // The body names the venue and its address; nothing is sent from the app (no form). K17 (critique):
    // the address is also shown, with one button that only copies it (for a web mailbox).
    const telo = decodeURIComponent(href.slice(href.indexOf("&body=") + "&body=".length));
    expect(telo).toBe(fmt(t.prilagodjen.telo, { lokal: srednji.venueName, slug: srednji.slug }));
    expect(sekcija).not.toContain("<form");
    const dugmad = [...sekcija.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
    expect(dugmad).toHaveLength(1);
    expect(tekst(dugmad[0])).toContain(t.prilagodjen.kopiraj);
    expect(attr(dugmad[0], "type")).toBe("button");
    expect(tekst(sekcija)).toContain("office@scanme.rs");
    // The words: heading, one sentence, the action and what it does.
    expect(tekst(naslovi(sekcija, 2)[0])).toBe(t.prilagodjen.naslov);
    expect(tekst(sekcija)).toContain(t.prilagodjen.opis);
    expect(tekst(sekcija)).toContain(t.prilagodjen.akcija);
    expect(tekst(sekcija)).toContain(t.prilagodjen.akcijaOpis);
    // It comes after every other area.
    const grupe = [...html.matchAll(/data-grupa-izgleda="[^"]*"/g)];
    expect(html.indexOf("data-prilagodjen-dizajn")).toBeGreaterThan(mora(grupe[grupe.length - 1].index, "no index"));
  });

  test("no price is promised: no RSD, no EUR, no amount before din, no currency sign (markup and mail text)", () => {
    for (const html of [izgled(), izgled({ plan: "premium" })]) {
      const sekcija = elementSaTragom(html, "section", "data-prilagodjen-dizajn");
      const href = mora(attr(/<a\b[^>]*>/.exec(sekcija)?.[0] ?? "", "href"), "no href");
      const sve = `${tekst(sekcija)} ${decodeURIComponent(href)}`;
      expect(sve).not.toMatch(/RSD/i);
      expect(sve).not.toMatch(/EUR/i);
      expect(sve).not.toMatch(/\d\s*din/i);
      expect(sve).not.toMatch(/[€$]/);
    }
  });
});

// -----------------------------------------------------------------------------
// I. Loading and refused
// -----------------------------------------------------------------------------

describe("K17 I: loading and error states", () => {
  test("izgled undefined: a loading status in the shape of a form, the title, no control", () => {
    const html = prostor(undefined);
    expect(count(html, "<h1")).toBe(1);
    expect(tekst(naslovi(html, 1)[0])).toBe(t.naslov);
    const stanje = elementSaTragom(html, "div", 'data-stanje="ucitavanje"');
    expect(attr(prviTag(stanje), "role")).toBe("status");
    expect(attr(prviTag(stanje), "data-oblik")).toBe("forma");
    expect(tekst(stanje)).not.toBe("");
    expect(html).not.toContain('data-stanje="greska"');
    expect(html).not.toContain("data-grupa-izgleda");
    expect(radiji(html)).toHaveLength(0);
    expect(prekidaci(html)).toHaveLength(0);
  });

  test("izgled null: the error text is announced, the title stays, no control", () => {
    const html = prostor(null);
    expect(count(html, "<h1")).toBe(1);
    expect(tekst(naslovi(html, 1)[0])).toBe(t.naslov);
    const greska = elementSaTragom(html, "div", 'data-stanje="greska"');
    expect(attr(prviTag(greska), "role")).toBe("alert");
    expect(tekst(greska)).toContain(t.greska);
    expect(html).not.toContain('data-stanje="ucitavanje"');
    expect(html).not.toContain("data-grupa-izgleda");
    expect(radiji(html)).toHaveLength(0);
    expect(prekidaci(html)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// J. The intro says draft and publish
// -----------------------------------------------------------------------------

describe("K17 J: the introduction", () => {
  test("it says the changes go to the draft and guests see them after publishing", () => {
    for (const html of [izgled(), izgled({ plan: "premium" }), prostor(izIzgleda({}, STANDARD))]) {
      expect(tekst(html)).toContain(t.uvod);
    }
    // The words themselves: the draft ("nacrt") and publishing ("objav...").
    expect(t.uvod).toMatch(/nacrt/i);
    expect(t.uvod).toMatch(/objav/i);
  });
});
