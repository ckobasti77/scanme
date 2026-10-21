// K16 render tests: combos ("Proveri cenu"), translations and the Room service
// context. Server markup only (renderToStaticMarkup, no DOM), set up like
// k11.test.tsx and k15.test.tsx: useSirina() answers "desktop" on the server,
// effects never run, `@/components/ui/dialog` is replaced by a stand-in that
// renders an open dialog inline and next/link by a plain anchor.
//
// One thing is different from K15. The izlog fetches the data of the Room
// service and translations views only after the editor reports the view in an
// effect (`onPogled`), so its server markup is the LOADING state of those two
// views (the dialog of the price decision is open already, it is initial state).
// `izlogPosleEfekata` re-renders the editor with exactly what the browser has
// after that effect: it takes the izlog's own props and its final snapshot
// (captured through two thin wrappers below, nothing is copied from the izlog)
// and adds `roomServicePodaci` / `prevodi` computed the way the izlog computes
// them. Texts come from the dictionaries; the only literals are invented fixture
// facts and the acceptance labels the owner named.

import { createElement, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { parseEditorPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import type { MenuDraftSnapshot } from "@/lib/menu/snapshot";
import { fieldTranslation, type MenuTranslations } from "@/lib/menu/translation-status";
import { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { detaljIzSnapshota } from "@/lib/menu/studio/detalj";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type { StudioJezici, StudioKontekst, StudioRadnje, StudioRoomService, StudioRsUpozorenje } from "@/lib/menu/studio/model";
import { prevodiStranice, stavkeArtikla } from "@/lib/menu/studio/prevodi";
import { roomServiceIzSnapshota } from "@/lib/menu/studio/room-service";
import { DetaljArtikla } from "./artikal/detalj-artikla";
import { PrevodStavka } from "./prevodi/prevod-stavka";
import { sazetakPrevoda } from "./prevodi/prevodi-artikla";
import { RsKontekst } from "./room-service/rs-kontekst";
import { sazetakPravila } from "./room-service/rs-pravila";
import { RsUpozorenjeDijalog } from "./room-service/rs-upozorenje-dijalog";
import { tekstCene } from "./red-artikla/red-artikla";

type EditorProps = ComponentProps<typeof import("./studio-editor").StudioEditor>;

// What the izlog passes to the editor and the snapshot it holds, of its last server render.
const uhvaceno = vi.hoisted(() => ({
  props: null as EditorProps | null,
  snapshot: null as MenuDraftSnapshot | null,
  pravi: null as ComponentType<EditorProps> | null,
}));

vi.mock("@/lib/menu/studio/iz-snapshota", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/menu/studio/iz-snapshota")>();
  return {
    ...original,
    straniceIzSnapshota: (snapshot: MenuDraftSnapshot, qr: ReadonlySet<string>) => {
      uhvaceno.snapshot = snapshot;
      return original.straniceIzSnapshota(snapshot, qr);
    },
  };
});

vi.mock("./studio-editor", async (importOriginal) => {
  const original = await importOriginal<typeof import("./studio-editor")>();
  uhvaceno.pravi = original.StudioEditor;
  return {
    ...original,
    StudioEditor: (props: EditorProps) => {
      uhvaceno.props = props;
      return <original.StudioEditor {...props} />;
    },
  };
});

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

const posebno = menuStudioSr.posebno;
const rs = posebno.roomService;
const kombo = posebno.kombo;
const prevodi = posebno.prevodi;
const stranice = menuStudioSr.stranice;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in k11/k15)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;
const bezTagova = (markup: string) => unesc(markup.replace(/<[^>]+>/g, "")).trim();
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

/** Every element of this tag whose opening tag matches `trag` (a regex source), as wholes. */
function sviElementi(html: string, ime: string, trag: string): string[] {
  const re = new RegExp(`<${ime}\\b[^>]*${trag}`, "g");
  return [...html.matchAll(re)].map((match) => element(html, mora(match.index, "no index")));
}

function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
}

type Dugme = { tag: string; text: string };
const dugmad = (html: string): Dugme[] =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => ({ tag: prviTag(match[0]), text: bezTagova(match[1]) }));

function dugmeSaOznakom(html: string, oznaka: string): Dugme {
  const match = new RegExp(`<button\\b[^>]*\\s${oznaka}=""[^>]*>([\\s\\S]*?)</button>`).exec(html);
  if (!match) throw new Error(`no <button ${oznaka}> in the markup`);
  return { tag: prviTag(match[0]), text: bezTagova(match[1]) };
}

const polja = (html: string) => [...html.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map((match) => match[0]);
const svgovi = (html: string) => [...html.matchAll(/<svg\b[^>]*>/g)].map((match) => match[0]);

/** The collapsible group of the article detail with this suffix. */
function grupa(html: string, sufiks: string) {
  const sekcija = elementSaTragom(
    html,
    "section",
    `data-grupa-detalja="`.concat(mora(new RegExp(`data-grupa-detalja="([^"]*-${sufiks})"`).exec(html), `no group ${sufiks}`)[1], `"`),
  );
  const dugme = mora(/<button\b[^>]*aria-expanded="[^"]*"[^>]*>[\s\S]*?<\/button>/.exec(sekcija), "no header button")[0];
  const telo = mora(/<div id="[^"]*-telo"[^>]*>/.exec(sekcija), "no group body");
  return {
    sekcija,
    expanded: attr(prviTag(dugme), "aria-expanded"),
    naslov: mora(/<span>([^<]*)<\/span>/.exec(dugme), "no group title")[1],
    sazetak: bezTagova(mora(/<span data-sazetak=""[^>]*>([\s\S]*?)<\/span>/.exec(dugme), "no group summary")[1]),
    teloTag: telo[0],
    telo: sekcija.slice(telo.index),
  };
}

/** The server markup of the izlog, as the browser first paints it. */
const izlog = (query: IzlogSearchParams) => renderToStaticMarkup(<EditorIzlog params={parseEditorPreview(query)} />);

/**
 * The izlog after its first effect: the same props, plus the data the container
 * subscribes to once the editor says the view is open (see the header comment).
 */
function izlogPosleEfekata(query: IzlogSearchParams) {
  const prvi = izlog(query);
  const props = mora(uhvaceno.props, "the izlog did not render the editor");
  const snapshot = mora(uhvaceno.snapshot, "the izlog did not build its snapshot");
  const Pravi = mora(uhvaceno.pravi, "no real editor");
  const glavna = mora(
    snapshot.pages.find((page) => page.isDefault),
    "no main page",
  );
  const roomServicePodaci = props.pocetno?.roomService ? roomServiceIzSnapshota(snapshot) : undefined;
  const lista = props.pocetno?.prevodi ? prevodiStranice(snapshot, glavna.key) : null;
  const podaci: EditorProps["podaci"] = {
    ...props.podaci,
    roomServicePodaci,
    prevodi: lista ? { obuhvat: "stranica", naslov: glavna.name, stavke: lista.stavke, skraceno: lista.skraceno } : undefined,
  };
  const html = renderToStaticMarkup(<Pravi {...props} podaci={podaci} />);
  return { prvi, html, snapshot, glavna, props, roomServicePodaci };
}

// Never called in a server render; if one runs, the test says which.
const radnje = new Proxy(
  {},
  {
    get: (_cilj, ime) => () => {
      throw new Error(`StudioRadnje.${String(ime)} must not run in a server render`);
    },
  },
) as StudioRadnje;

const nista = () => undefined;

// Fixture facts (the invented medium venue and the izlog's K16 setup).
const GIBANICA = "Gibanica";
const SUPA = "Domaća pileća supa";
const SOPSKA = "Šopska salata";
const KAJMAK = "Kajmak sa pogačom";
const RUCAK = "Ručak dana";
const PAPRIKE = "Punjene paprike";
const OSNOVNE = fixtureMenu("srednji").snapshot.articles;
const osnovna = (naziv: string) => mora(OSNOVNE.find((article) => article.name === naziv)?.basePriceRsd, `no price for ${naziv}`);
/** 15 % on top, rounded half up to a whole dinar (the rule of the izlog's setup). */
const saUvecanjem = (cena: number) => Math.floor((cena * 115 + 50) / 100);
const mnozina = (grupa: { one: string; few: string; many: string }, n: number) => fmt(grupa[srPluralCategory(n)], { n });

/** The three Room service rows of the izlog, by article name. */
function redoviRs(html: string) {
  const redovi = sviElementi(html, "li", `\\sdata-rs-red="[^"]*"`);
  return Object.fromEntries(
    redovi.map((red) => [mora(/<p class="font-medium[^"]*">([^<]*)<\/p>/.exec(red), "no row name")[1], red]),
  );
}

const rsUpozorenje = (izlogRs: StudioRoomService): StudioRsUpozorenje =>
  mora(
    izlogRs.kategorije.flatMap((k) => k.redovi).find((r) => r.upozorenje)?.upozorenje,
    "the izlog has no price warning",
  );

// -----------------------------------------------------------------------------
// A. Room service is visible only when switched on, in the group Posebne usluge
// -----------------------------------------------------------------------------

describe("K16 Room service in the structure", () => {
  test("the default izlog (Standard) has no Posebne usluge and no Room service entry", () => {
    const html = izlog({});
    expect(html).not.toContain(stranice.posebneUsluge);
    expect(html).not.toContain("data-room-service");
    expect(html).not.toContain("studio-posebne-usluge");
    // The structure column still lists the pages.
    expect(html).toContain("data-stranica=");
  });

  test("plan=premium: one Room service entry in the group Posebne usluge, not among the pages", () => {
    const html = izlog({ plan: "premium" });
    expect(count(html, "data-room-service")).toBe(1);
    const nav = elementSaTragom(html, "nav", "data-stranice-kolona");
    const listaStranica = element(nav, nav.indexOf("<ul"));
    const sekcija = elementSaTragom(nav, "section", 'aria-labelledby="studio-posebne-usluge"');

    // The group comes after the list of pages and carries its own heading.
    expect(nav.indexOf(listaStranica)).toBeLessThan(nav.indexOf(sekcija));
    expect(bezTagova(mora(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(sekcija), "no group heading")[1])).toBe(stranice.posebneUsluge);
    expect(bezTagova(mora(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(sekcija), "no group heading")[1])).toBe("Posebne usluge");

    // Exactly one entry in the group: a button with the Room service label.
    expect(count(sekcija, "data-room-service")).toBe(1);
    const unos = dugmeSaOznakom(sekcija, "data-room-service");
    expect(unos.text).toBe(stranice.roomService);
    expect(dugmad(sekcija)).toHaveLength(1);
    // Not selected: no aria-current.
    expect(attr(unos.tag, "aria-current")).toBeUndefined();

    // The pages list has the standard pages only: no Room service label, no Room service entry.
    expect(listaStranica).not.toContain(stranice.roomService);
    expect(listaStranica).not.toContain("data-room-service");
    expect(count(listaStranica, "data-stranica=")).toBeGreaterThanOrEqual(2);
    expect(count(listaStranica, "<li")).toBeGreaterThanOrEqual(count(listaStranica, "data-stranica="));
    // Outside the group the label appears nowhere in the structure column.
    expect(nav.replace(sekcija, "")).not.toContain(stranice.roomService);
  });

  test("fokus=room-service&plan=standard: no Room service context, no group, the normal Ponuda list", () => {
    const html = izlog({ fokus: "room-service", plan: "standard" });
    expect(html).not.toContain("data-rs-kontekst");
    expect(html).not.toContain(stranice.posebneUsluge);
    expect(html).not.toContain("data-room-service");
    expect(html).not.toContain("data-rs-upozorenje");
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain("data-red-artikla");
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    const glavna = mora(fixtureMenu("srednji").snapshot.pages.find((page) => page.isDefault), "no main page");
    expect(bezTagova(h1[0])).toBe(glavna.name);
  });
});

// -----------------------------------------------------------------------------
// B. fokus=room-service (Premium by default)
// -----------------------------------------------------------------------------

describe("K16 the Room service context in the izlog", () => {
  test("the first server paint already has the rows (the izlog opens the view from fokus), one h1, and the price decision is open", () => {
    const html = izlog({ fokus: "room-service" });
    expect(html).not.toContain('data-rs-kontekst="ucitava"');
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(rs.naslov);
    expect(html.match(/data-rs-red=/g)).toHaveLength(3);
    // The dialog is initial state.
    const dijalog = elementSaTragom(html, "div", 'role="dialog"');
    expect(bezTagova(mora(/<h2>([\s\S]*?)<\/h2>/.exec(dijalog), "no dialog title")[1])).toBe(rs.dijalog.naslov);
    // And the structure shows the entry as the open one.
    expect(attr(prviTag(dugmeSaOznakom(html, "data-room-service").tag + ">"), "aria-current")).toBe("page");
  });

  test("exactly one h1, the Room service title; the open entry is aria-current", () => {
    const { html } = izlogPosleEfekata({ fokus: "room-service" });
    expect(html).not.toContain("data-rs-kontekst=\"ucitava\"");
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(rs.naslov);
    expect(bezTagova(h1[0])).toBe("Room service");
    expect(attr(dugmeSaOznakom(html, "data-room-service").tag, "aria-current")).toBe("page");
    expect(html).toContain(rs.opis);
    expect(html).toContain(rs.nacrt);
  });

  test("three rows in two categories; each row carries exactly one origin label: inherited, computed, manual", () => {
    const { html } = izlogPosleEfekata({ fokus: "room-service" });
    expect(count(html, "<li" + ' class="grid gap-2 border-t py-3 first:border-t-0 [--border:var(--mp-ivica)]" data-rs-red=')).toBe(3);
    const redovi = redoviRs(html);
    expect(Object.keys(redovi).sort()).toEqual([GIBANICA, SUPA, SOPSKA].sort());

    const poreklo = (red: string) => [...red.matchAll(/\sdata-poreklo="([^"]*)"/g)].map((match) => match[1]);
    expect(poreklo(redovi[SUPA])).toEqual(["inherited"]);
    expect(poreklo(redovi[GIBANICA])).toEqual(["computed"]);
    expect(poreklo(redovi[SOPSKA])).toEqual(["manual"]);

    // The label says it in words, from the dictionary, not by colour alone.
    expect(bezTagova(sviElementi(redovi[SUPA], "span", `\\sdata-poreklo="inherited"`)[0])).toBe(rs.poreklo.inherited);
    expect(bezTagova(sviElementi(redovi[SOPSKA], "span", `\\sdata-poreklo="manual"`)[0])).toBe(rs.poreklo.manual);
    // The computed one names its markup.
    const izracunata = bezTagova(sviElementi(redovi[GIBANICA], "span", `\\sdata-poreklo="computed"`)[0]);
    expect(izracunata).toContain(rs.poreklo.computed);
    expect(izracunata).toContain("+15 %");
    // Only the computed row shows a percent; the others do not.
    expect(redovi[SUPA]).not.toContain("+15 %");
    expect(redovi[SOPSKA]).not.toContain("+15 %");
    // Every label also explains itself in its title.
    expect(attr(sviElementi(redovi[GIBANICA], "span", `\\sdata-poreklo="computed"`)[0], "title")).toBe(fmt(rs.poreklo.computedOpis, { p: "15" }));

    // Together: the origins of all rows are exactly the three of the dictionary.
    const sve = Object.values(redovi).flatMap(poreklo);
    expect([...new Set(sve)].sort()).toEqual(["computed", "inherited", "manual"]);

    // Two categories with their own counts; the articles sit under the right one.
    const kategorije = sviElementi(html, "section", `\\sdata-rs-kategorija="[^"]*"`);
    expect(kategorije).toHaveLength(2);
    const naziviKategorija = kategorije.map((k) => bezTagova(mora(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(k), "no category heading")[1]));
    expect(naziviKategorija[0]).toBe(`Iz kuhinje${mnozina(rs.kategorija.broj, 2)}`);
    expect(naziviKategorija[1]).toBe(`Salate${mnozina(rs.kategorija.broj, 1)}`);
    expect(kategorije[0]).toContain(GIBANICA);
    expect(kategorije[0]).toContain(SUPA);
    expect(kategorije[0]).not.toContain(SOPSKA);
    expect(kategorije[1]).toContain(SOPSKA);
  });

  test("each row shows the base price and an input named after the article; the manual one holds 520", () => {
    const { html } = izlogPosleEfekata({ fokus: "room-service" });
    const redovi = redoviRs(html);
    // The base price of the salad rose by 40 in the setup.
    const osnovneCene: Record<string, number | null> = { [GIBANICA]: osnovna(GIBANICA), [SUPA]: osnovna(SUPA), [SOPSKA]: osnovna(SOPSKA) + 40 };
    const rsCene: Record<string, number> = { [GIBANICA]: saUvecanjem(osnovna(GIBANICA)), [SUPA]: osnovna(SUPA), [SOPSKA]: 520 };
    for (const naziv of [GIBANICA, SUPA, SOPSKA]) {
      const red = redovi[naziv];
      const osnovnaOznaka = bezTagova(sviElementi(red, "span", `\\sdata-rs-osnovna=""`)[0]);
      expect(osnovnaOznaka).toBe(`${rs.red.osnovna} ${tekstCene(osnovneCene[naziv])}`);
      const oznaka = fmt(rs.red.rsCenaOznaka, { naziv });
      const unosi = polja(red).filter((tag) => attr(tag, "aria-label") === oznaka);
      expect(unosi, `exactly one input named "${oznaka}"`).toHaveLength(1);
      expect(attr(unosi[0], "value")).toBe(String(rsCene[naziv]).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
      expect(jeOnemoguceno(unosi[0])).toBe(false);
    }
    expect(attr(polja(redovi[SOPSKA]).find((tag) => attr(tag, "aria-label") === fmt(rs.red.rsCenaOznaka, { naziv: SOPSKA }))!, "value")).toBe("520");
    // The inherited row's Room service price is its base price.
    expect(rsCene[SUPA]).toBe(osnovneCene[SUPA]);
    // The label of the row's price column.
    expect(redovi[SUPA]).toContain(`>${rs.red.rs}</span>`);
  });

  test("the rules summary says 15 % for the selected articles and the fee 300 RSD; the rules are open with their values", () => {
    const { html, roomServicePodaci } = izlogPosleEfekata({ fokus: "room-service" });
    const pravila = mora(roomServicePodaci, "no Room service data").pravila;
    expect(pravila).toEqual({ uvecanje: 15, obuhvat: "selected", naknada: 300 });
    const grupaPravila = elementSaTragom(html, "section", 'data-grupa-detalja="');
    const zaglavlje = mora(/<button\b[^>]*aria-expanded="[^"]*"[^>]*>[\s\S]*?<\/button>/.exec(grupaPravila), "no header")[0];
    expect(attr(prviTag(zaglavlje), "aria-expanded")).toBe("true");
    expect(bezTagova(mora(/<span>([^<]*)<\/span>/.exec(zaglavlje), "no title")[1])).toBe(rs.pravila.naslov);
    const sazetak = bezTagova(mora(/<span data-sazetak=""[^>]*>([\s\S]*?)<\/span>/.exec(zaglavlje), "no summary")[1]);
    expect(sazetak).toBe(sazetakPravila(pravila));
    expect(sazetak).toBe(
      `${fmt(rs.pravila.sazetakUvecanje, { p: "15", obuhvat: rs.pravila.obuhvatIzabraneKratko })} · ${fmt(rs.pravila.sazetakNaknada, { cena: "300 RSD" })}`,
    );
    expect(sazetak).toContain("15 %");
    expect(sazetak).toContain("300 RSD");

    // The open body has the two fields with their values and the scope on "selected".
    const telo = elementSaTragom(grupaPravila, "div", "data-rs-pravila");
    const unosi = polja(telo);
    expect(unosi.map((tag) => attr(tag, "value"))).toEqual(expect.arrayContaining(["15", "300"]));
    expect(bezTagova(telo)).toContain(rs.pravila.uvecanje);
    expect(bezTagova(telo)).toContain(rs.pravila.naknada);
    const obuhvat = [...telo.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((match) => match[0]);
    expect(obuhvat.filter(jeOznaceno)).toHaveLength(1);
    expect(attr(obuhvat.filter(jeOznaceno)[0], "value")).toBe("selected");
    expect(dugmeSaOznakom(telo, "data-rs-sacuvaj-pravila").text).toBe(rs.pravila.sacuvaj);
  });

  test("the markup switch shows on every row when the markup reaches selected articles only", () => {
    const { html } = izlogPosleEfekata({ fokus: "room-service" });
    const redovi = redoviRs(html);
    const prekidac = (naziv: string) =>
      mora(
        polja(redovi[naziv]).find((tag) => attr(tag, "aria-label") === fmt(rs.red.uvecanjeOznaka, { naziv })),
        `no markup switch for ${naziv}`,
      );
    expect(jeOznaceno(prekidac(GIBANICA))).toBe(true);
    expect(jeOznaceno(prekidac(SOPSKA))).toBe(true);
    expect(jeOznaceno(prekidac(SUPA))).toBe(false);
    for (const naziv of [GIBANICA, SUPA, SOPSKA]) expect(attr(prekidac(naziv), "type")).toBe("checkbox");
  });

  test("the warnings bar counts one price waiting for a decision; only the salad row carries the warning", () => {
    const { html, roomServicePodaci } = izlogPosleEfekata({ fokus: "room-service" });
    const traka = elementSaTragom(html, "div", 'data-rs-upozorenja="1"');
    expect(attr(prviTag(traka), "role")).toBe("status");
    expect(count(html, "data-rs-upozorenja=")).toBe(1);
    expect(bezTagova(traka)).toContain(fmt(rs.upozorenja.one, { n: 1 }));
    expect(bezTagova(traka)).toContain("1 cena traži odluku");
    expect(dugmad(traka).map((d) => d.text)).toEqual([rs.pregledaj]);

    const redovi = redoviRs(html);
    const upozorenje = rsUpozorenje(mora(roomServicePodaci, "no data"));
    expect(upozorenje.naziv).toBe(SOPSKA);
    // K33 A18: the saving state of the price field in the same row is a status too (a <span role="status">),
    // so the selector names the warning's <div role="status"> and nothing is loosened.
    const poruka = elementSaTragom(redovi[SOPSKA], "div", '<div role="status"');
    // K16 critique: the warning also says what guests pay; the numbers do not break (no-break space).
    expect(bezTagova(poruka).replace(/ |&nbsp;|&#160;/g, " ")).toContain(
      fmt(rs.red.upozorenje, { stara: tekstCene(osnovna(SOPSKA)), nova: tekstCene(osnovna(SOPSKA) + 40), rs: tekstCene(520) }),
    );
    expect(dugmad(poruka).map((d) => d.text)).toEqual([rs.red.odluci]);
    expect(redovi[GIBANICA]).not.toContain(rs.red.odluci);
    expect(redovi[SUPA]).not.toContain(rs.red.odluci);
  });

  test("the decision dialog is open: four values in order, the literal acceptance buttons and Odluči kasnije", () => {
    const { html } = izlogPosleEfekata({ fokus: "room-service" });
    const dijalog = elementSaTragom(html, "div", 'role="dialog"');
    expect(count(html, 'role="dialog"')).toBe(1);
    expect(bezTagova(mora(/<h2>([\s\S]*?)<\/h2>/.exec(dijalog), "no dialog title")[1])).toBe(rs.dijalog.naslov);
    expect(bezTagova(dijalog)).toContain(fmt(rs.dijalog.opis, { naziv: SOPSKA }));
    expect(attr(prviTag(elementSaTragom(dijalog, "div", "data-rs-upozorenje")), "data-rs-upozorenje")).toBeTruthy();

    const stara = osnovna(SOPSKA);
    const nova = stara + 40;
    const ocekivano = [
      ["stara", rs.dijalog.stara, tekstCene(stara)],
      ["nova", rs.dijalog.nova, tekstCene(nova)],
      ["rs", rs.dijalog.rs, "520 RSD"],
      ["izracunata", rs.dijalog.izracunata, tekstCene(saUvecanjem(nova))],
    ] as const;
    const vrednosti = sviElementi(dijalog, "div", `\\sdata-rs-vrednost="[^"]*"`);
    expect(vrednosti.map((v) => attr(prviTag(v), "data-rs-vrednost"))).toEqual(ocekivano.map(([kljuc]) => kljuc));
    vrednosti.forEach((v, i) => {
      const [, oznaka, vrednost] = ocekivano[i];
      expect(bezTagova(mora(/<dt\b[^>]*>([\s\S]*?)<\/dt>/.exec(v), "no dt")[1])).toBe(oznaka);
      expect(bezTagova(mora(/<dd\b[^>]*>([\s\S]*?)<\/dd>/.exec(v), "no dd")[1])).toBe(vrednost);
    });
    expect(bezTagova(vrednosti[0])).toContain("420");
    expect(bezTagova(vrednosti[1])).toContain("460");

    const zadrzi = dugmeSaOznakom(dijalog, "data-rs-zadrzi");
    const izracunaj = dugmeSaOznakom(dijalog, "data-rs-izracunaj");
    expect(zadrzi.text).toBe(rs.dijalog.zadrzi);
    expect(zadrzi.text).toBe("Zadrži ručnu cenu");
    expect(izracunaj.text).toBe(rs.dijalog.izracunaj);
    expect(izracunaj.text).toBe("Ponovo izračunaj prema markup-u");
    expect(jeOnemoguceno(zadrzi.tag)).toBe(false);
    expect(jeOnemoguceno(izracunaj.tag)).toBe(false);
    const kasnije = mora(dugmad(dijalog).find((d) => d.text === rs.dijalog.kasnije), "no postpone button");
    expect(kasnije.text).toBe("Odluči kasnije");
    expect(jeOnemoguceno(kasnije.tag)).toBe(false);
    expect(dugmad(dijalog)).toHaveLength(3);
    expect(bezTagova(dijalog)).toContain(rs.dijalog.kasnijeOpis);
  });

  test("the legend explains the three origins; the line about the rest of the menu counts what is not in Room service", () => {
    const { html, roomServicePodaci, snapshot } = izlogPosleEfekata({ fokus: "room-service" });
    const legenda = elementSaTragom(html, "p", "data-rs-legenda");
    expect(bezTagova(legenda)).toBe(rs.legenda);
    expect(bezTagova(legenda)).toContain(rs.poreklo.inherited);
    expect(bezTagova(legenda)).toContain(rs.poreklo.computed);
    expect(bezTagova(legenda)).toContain(rs.poreklo.manual);

    const vanRs = mora(roomServicePodaci, "no data").vanRs;
    expect(vanRs).toBeGreaterThan(0);
    expect(vanRs).toBeLessThan(snapshot.articles.length);
    expect(count(html, mnozina(rs.vanRs, vanRs))).toBe(1);
    // The line sits after the categories, not inside one.
    const kategorije = sviElementi(html, "section", `\\sdata-rs-kategorija="[^"]*"`);
    expect(html.indexOf(mnozina(rs.vanRs, vanRs))).toBeGreaterThan(html.indexOf(kategorije[kategorije.length - 1]) + kategorije[kategorije.length - 1].length - 1);
    // Everything is editable here.
    expect(html).toContain("data-rs-traka");
    expect(html).toContain("data-rs-dodaj-iz-ponude");
  });
});

// -----------------------------------------------------------------------------
// B (cont.) The pieces on their own: states of RsKontekst, the dialog
// -----------------------------------------------------------------------------

describe("K16 the Room service pieces on their own", () => {
  const red = new AutosaveRed();
  const prop = (izmene: Partial<ComponentProps<typeof RsKontekst>>): ComponentProps<typeof RsKontekst> => ({
    rs: undefined,
    radnje,
    red,
    mozeUredjivanje: true,
    naslovId: "k16-rs",
    telefon: false,
    najavi: nista,
    onUpozorenje: nista,
    ...izmene,
  });
  const render = (izmene: Partial<ComponentProps<typeof RsKontekst>>) => renderToStaticMarkup(<RsKontekst {...prop(izmene)} />);

  const upozorenjeBezRacuna: StudioRsUpozorenje = {
    stavkaId: "jelo-1",
    naziv: "Probno jelo",
    staraOsnovna: 400,
    novaOsnovna: 450,
    rsCena: 500,
    izracunata: null,
  };
  const dijalog = (upozorenje: StudioRsUpozorenje | null) =>
    renderToStaticMarkup(<RsUpozorenjeDijalog upozorenje={upozorenje} onZatvori={nista} onResi={() => Promise.resolve({ ok: true, vrednost: null })} najavi={nista} />);

  test("the dialog with no computed price: recomputing is disabled, keeping the manual price is not", () => {
    const html = dijalog(upozorenjeBezRacuna);
    const izracunaj = dugmeSaOznakom(html, "data-rs-izracunaj");
    const zadrzi = dugmeSaOznakom(html, "data-rs-zadrzi");
    expect(jeOnemoguceno(izracunaj.tag)).toBe(true);
    expect(jeOnemoguceno(zadrzi.tag)).toBe(false);
    expect(izracunaj.text).toBe(rs.dijalog.izracunaj);
    // The row says there is no value rather than showing a made-up one.
    const izracunataRed = elementSaTragom(html, "div", 'data-rs-vrednost="izracunata"');
    expect(bezTagova(mora(/<dd\b[^>]*>([\s\S]*?)<\/dd>/.exec(izracunataRed), "no dd")[1])).toBe(menuStudioSr.red.bezVrednosti);
    expect(bezTagova(elementSaTragom(html, "div", 'data-rs-vrednost="rs"'))).toContain("500 RSD");
    // With a computed price both are enabled (the contrast case).
    const sa = dijalog({ ...upozorenjeBezRacuna, izracunata: 518 });
    expect(jeOnemoguceno(dugmeSaOznakom(sa, "data-rs-izracunaj").tag)).toBe(false);
    expect(bezTagova(elementSaTragom(sa, "div", 'data-rs-vrednost="izracunata"'))).toContain("518 RSD");
  });

  test("the dialog without a warning renders nothing", () => {
    expect(dijalog(null)).toBe("");
  });

  test("loading: one h1 with the title and a loading state, no actions", () => {
    const html = render({ rs: undefined });
    expect(html).toContain('data-rs-kontekst="ucitava"');
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(rs.naslov);
    expect(attr(prviTag(`<h1${/<h1([^>]*)>/.exec(html)?.[1] ?? ""}>`), "id")).toBe("k16-rs");
    expect(html).not.toContain("data-rs-traka");
    expect(html).not.toContain("data-rs-red");
    expect(html).not.toContain("data-rs-pravila");
  });

  test("error: one h1 with the title and the shared error text", () => {
    const html = render({ rs: null });
    expect(html).toContain('data-rs-kontekst="greska"');
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(rs.naslov);
    expect(bezTagova(html)).toContain(menuStudioSr.stanja.greskaNaslov);
    expect(bezTagova(html)).toContain(menuStudioSr.stanja.greskaOpis);
    expect(html).not.toContain("data-rs-traka");
  });

  test("empty Room service: the empty state and three actions; adding from the menu waits for a category", () => {
    const html = render({
      rs: { pravila: { uvecanje: null, obuhvat: "all", naknada: null }, kategorije: [], vanRs: 0, skraceno: false },
    });
    expect(count(html, "<h1")).toBe(1);
    expect(bezTagova(html)).toContain(rs.praznoNaslov);
    expect(bezTagova(html)).toContain(rs.praznoOpis);
    expect(bezTagova(html)).toContain(rs.radnje.preuzmiOpis);
    expect(html).not.toContain("data-rs-legenda");
    expect(html).not.toContain("data-rs-red");
    expect(html).not.toContain("data-rs-upozorenja");
    // The rules start with their defaults: no markup, no fee.
    expect(bezTagova(html)).toContain(`${rs.pravila.sazetakBezUvecanja} · ${rs.pravila.sazetakBezNaknade}`);

    const traka = elementSaTragom(html, "div", "data-rs-traka");
    const dodaj = dugmeSaOznakom(traka, "data-rs-dodaj-iz-ponude");
    const preuzmi = dugmeSaOznakom(traka, "data-rs-preuzmi");
    const nova = dugmeSaOznakom(traka, "data-rs-nova-kategorija");
    expect(dodaj.text).toBe(rs.radnje.dodaj);
    expect(preuzmi.text).toBe(rs.radnje.preuzmi);
    expect(nova.text).toBe(rs.radnje.kategorija);
    expect(jeOnemoguceno(dodaj.tag)).toBe(true);
    expect(jeOnemoguceno(preuzmi.tag)).toBe(false);
    expect(jeOnemoguceno(nova.tag)).toBe(false);
    expect(dugmad(traka)).toHaveLength(3);
  });

  test("a read-only role: no actions, no menus, no warning button, every input disabled", () => {
    uhvaceno.snapshot = null;
    izlogPosleEfekata({ fokus: "room-service" });
    const podaci = roomServiceIzSnapshota(mora(uhvaceno.snapshot as MenuDraftSnapshot | null, "no snapshot"));
    const html = render({ rs: podaci, mozeUredjivanje: false });
    expect(html).not.toContain("data-rs-traka");
    expect(html).not.toContain("data-rs-dodaj-iz-ponude");
    expect(html).not.toContain("data-rs-sacuvaj-pravila");
    expect(count(html, "data-rs-red=")).toBe(3);
    // The bar still tells there is a price to decide, but offers no way to decide it.
    expect(html).toContain('data-rs-upozorenja="1"');
    expect(html).not.toContain(rs.pregledaj);
    expect(html).not.toContain(rs.red.odluci);
    // No row menu and no category menu.
    expect(html).not.toContain(fmt(rs.red.radnje, { naziv: GIBANICA }));
    expect(html).not.toContain(fmt(rs.kategorija.radnje, { naziv: "Salate" }));
    const sva = polja(html);
    expect(sva.length).toBeGreaterThanOrEqual(8);
    // The scope choice is a radio group inside a disabled fieldset; every other field is disabled itself.
    const radio = sva.filter((tag) => attr(tag, "type") === "radio");
    expect(radio.map((tag) => attr(tag, "value"))).toEqual(["all", "selected"]);
    const onemogucenaGrupa = sviElementi(html, "fieldset", `\\sdisabled=""`);
    expect(onemogucenaGrupa).toHaveLength(1);
    expect(polja(onemogucenaGrupa[0]).filter((tag) => attr(tag, "type") === "radio")).toHaveLength(2);
    for (const polje of sva.filter((tag) => attr(tag, "type") !== "radio")) expect(jeOnemoguceno(polje), polje).toBe(true);
    // The values are still readable.
    expect(sva.map((tag) => attr(tag, "value"))).toEqual(expect.arrayContaining(["520", "15", "300"]));
  });
});

// -----------------------------------------------------------------------------
// C. fokus=kombo
// -----------------------------------------------------------------------------

describe("K16 the combo detail", () => {
  const html = izlog({ fokus: "kombo" });
  const detalj = elementSaTragom(html, "article", "data-detalj-artikla=");
  const odeljak = elementSaTragom(detalj, "section", "data-kombo-detalj");
  const dobijenaCena = tekstCene(osnovna(RUCAK));

  test("the detail of the combo: h1 is its name, the section is titled Sastav komboa", () => {
    expect(bezTagova(mora(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(detalj), "no h1")[1])).toBe(RUCAK);
    expect(bezTagova(mora(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(odeljak), "no section title")[1])).toBe(kombo.naslov);
    expect(bezTagova(odeljak)).toContain(kombo.opis);
    expect(count(detalj, "data-kombo-detalj")).toBe(1);
  });

  test("Proveri cenu: a status box names the changed component and offers to keep the combo price", () => {
    const kutija = elementSaTragom(odeljak, "div", "data-proveri-cenu");
    expect(attr(prviTag(kutija), "role")).toBe("status");
    expect(count(odeljak, "data-proveri-cenu")).toBe(1);
    expect(bezTagova(mora(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(kutija), "no title")[1])).toBe(kombo.proveriNaslov);
    expect(bezTagova(kutija)).toContain(fmt(kombo.promenjeni, { lista: PAPRIKE }));
    expect(bezTagova(kutija)).toContain(fmt(kombo.proveriOpis, { cena: dobijenaCena }));
    expect(bezTagova(kutija)).not.toContain(kombo.uklonjeni.split("{")[0]);
    const zadrzi = dugmeSaOznakom(kutija, "data-zadrzi-cenu");
    expect(zadrzi.text).toBe(fmt(kombo.zadrzi, { cena: dobijenaCena }));
    expect(zadrzi.text).toContain("1.150");
    expect(jeOnemoguceno(zadrzi.tag)).toBe(false);
    expect(dugmad(kutija).map((d) => d.text)).toEqual([fmt(kombo.zadrzi, { cena: dobijenaCena }), kombo.novaCena]);
  });

  test("three components with quantities and regular prices; the new price of the changed one", () => {
    const lista = element(odeljak, odeljak.indexOf('<ul class="grid divide-y'));
    const stavke = sviElementi(lista, "li", "");
    expect(stavke).toHaveLength(3);
    const nazivi = ["Teleća čorba", PAPRIKE, "Kupus salata"];
    stavke.forEach((stavka, i) => {
      expect(bezTagova(stavka)).toContain(nazivi[i]);
      expect(bezTagova(stavka)).toContain(`${kombo.kolicina}: × 1`);
    });
    // The paprike got dearer by 60 in the setup, the others kept their price.
    expect(bezTagova(stavke[0])).toContain(tekstCene(osnovna("Teleća čorba")));
    expect(bezTagova(stavke[1])).toContain(tekstCene(osnovna(PAPRIKE) + 60));
    expect(bezTagova(stavke[2])).toContain(tekstCene(osnovna("Kupus salata")));
  });

  test("the sum is information only: its text, the saving and no control that sets the price to it", () => {
    const zbir = osnovna("Teleća čorba") + osnovna(PAPRIKE) + 60 + osnovna("Kupus salata");
    expect(bezTagova(odeljak)).toContain(fmt(kombo.zbir, { cena: tekstCene(zbir) }));
    expect(bezTagova(odeljak)).toContain(fmt(kombo.usteda, { iznos: tekstCene(zbir - osnovna(RUCAK)) }));
    expect(bezTagova(odeljak)).toContain(kombo.samoInfo);

    // The only buttons: keep the price, type a new one, edit the components.
    expect(dugmad(odeljak).map((d) => d.text)).toEqual([fmt(kombo.zadrzi, { cena: dobijenaCena }), kombo.novaCena, kombo.izmeni]);
    // Nothing in the detail offers the sum as a price: no button names it, no field holds it.
    expect(dugmad(detalj).some((d) => d.text.includes(tekstCene(zbir)) || d.tag.includes(`"${String(zbir)}"`))).toBe(false);
    const nijeZbir = polja(detalj).filter((tag) => attr(tag, "value") === "1.500");
    expect(nijeZbir).toEqual([]);
    // The combo's own price field keeps the price the owner set.
    expect(polja(detalj).map((tag) => attr(tag, "value"))).toContain("1.150");
  });
});

// -----------------------------------------------------------------------------
// D. fokus=prevodi
// -----------------------------------------------------------------------------

/** The item with this title in the translations view (an element with data-prevod-stavka). */
function stavkaPrevoda(html: string, naziv: string): string {
  const sve = sviElementi(html, "div", `\\sdata-prevod-stavka="[^"]*"`);
  return mora(
    sve.find((stavka) => bezTagova(mora(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(stavka), "no item title")[1]) === naziv),
    `no translation item "${naziv}"`,
  );
}
const statusPrevoda = (stavka: string) => attr(prviTag(stavka), "data-prevod-status");
const uklonjeniPredlozi = (html: string) => sviElementi(html, "div", `\\sdata-ai-predlog=""`).reduce((ostatak, kutija) => ostatak.replace(kutija, ""), html);

describe("K16 translations in the izlog", () => {
  test("the first server paint already lists the items (the izlog opens the view from fokus), with exactly one h1", () => {
    const html = izlog({ fokus: "prevodi" });
    expect(html).toContain('data-prevodi-stranice=""');
    expect(naslovi(html, 1)).toHaveLength(1);
    expect(bezTagova(naslovi(html, 1)[0])).toBe("Prevodi: Kompletan meni");
    expect(html).toContain("data-prevod-stavka");
  });

  test("Premium: one h1 with the page name, language tabs en and de, the limit and no AI lock note", () => {
    const { html, glavna } = izlogPosleEfekata({ fokus: "prevodi" });
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(fmt(prevodi.naslovStranice, { naziv: glavna.name }));
    expect(bezTagova(h1[0])).toBe("Prevodi: Kompletan meni");

    const pogled = elementSaTragom(html, "div", "data-prevodi-stranice");
    const tabovi = sviElementi(pogled, "button", `\\srole="tab"`);
    expect(tabovi.map(bezTagova)).toEqual([prevodi.jezici.en, prevodi.jezici.de]);
    expect(tabovi.map((tab) => attr(prviTag(tab), "aria-selected"))).toEqual(["true", "false"]);
    expect(attr(elementSaTragom(pogled, "div", 'role="tablist"'), "aria-label")).toBe(prevodi.jezik);

    expect(bezTagova(pogled)).toContain(fmt(prevodi.limit.premium, { n: 10 }));
    expect(bezTagova(pogled)).not.toContain(prevodi.limit.standard);
    expect(bezTagova(pogled)).not.toContain(prevodi.ai.premium);
    expect(dugmad(pogled)[0].text).toBe(fmt(prevodi.nazad, { naziv: glavna.name }));
  });

  test("the list needs attention first: missing, stale and suggested items are labelled in words, done ones are filtered out", () => {
    const { html } = izlogPosleEfekata({ fokus: "prevodi" });
    const pogled = elementSaTragom(html, "div", "data-prevodi-stranice");
    const stavke = sviElementi(pogled, "div", `\\sdata-prevod-stavka="[^"]*"`);
    const statusi = new Set(stavke.map(statusPrevoda));
    expect([...statusi].sort()).toEqual(["missing", "stale", "suggested"]);
    // Each status shows its own word from the dictionary.
    for (const status of ["missing", "stale", "suggested"] as const) {
      const stavka = mora(stavke.find((s) => statusPrevoda(s) === status), `no ${status} item`);
      expect(bezTagova(stavka)).toContain(prevodi.statusi[status]);
    }
    expect(prevodi.statusi.missing).toBe("Nedostaje");
    expect(prevodi.statusi.stale).toBe("Zastareo");
    expect(prevodi.statusi.suggested).toBe("Predlog čeka potvrdu");
    expect(prevodi.statusi.done).toBe("Prevedeno");
    // The filter is on "Treba pažnju"; the summary still counts the finished ones (Prebranac, Ajvar sa tostom, Predjela).
    const sazetak = mora(/<p class="min-w-0 text-sm font-medium[^"]*">([\s\S]*?)<\/p>/.exec(pogled), "no summary")[1];
    expect(bezTagova(sazetak)).toContain(fmt(prevodi.sazetak.stale, { n: 1 }));
    expect(bezTagova(sazetak)).toContain(fmt(prevodi.sazetak.suggested, { n: 1 }));
    expect(bezTagova(sazetak)).toContain(fmt(prevodi.sazetak.done, { n: 3 }));
    expect(bezTagova(sazetak)).toMatch(/nedostaje: \d+/);
    const filter = [...pogled.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((match) => match[0]);
    expect(filter.filter(jeOznaceno).map((tag) => attr(tag, "value"))).toEqual(["treba"]);
  });

  test("Kajmak sa pogačom: the AI suggestion waits in its own box with two actions, the confirmed field stays empty", () => {
    const { html, snapshot } = izlogPosleEfekata({ fokus: "prevodi" });
    const stavka = stavkaPrevoda(html, KAJMAK);
    expect(statusPrevoda(stavka)).toBe("suggested");
    expect(attr(prviTag(stavka), "data-prevod-stavka")).toBe("article");
    const kutija = elementSaTragom(stavka, "div", "data-ai-predlog");
    expect(attr(prviTag(kutija), "role")).toBe("group");
    expect(bezTagova(kutija)).toContain(prevodi.ai.predlogNaslov);
    expect(bezTagova(kutija)).toContain(prevodi.ai.predlogOpis);
    expect(dugmad(kutija).map((d) => d.text)).toEqual([prevodi.ai.potvrdi, prevodi.ai.odbaci]);
    expect(prevodi.ai.potvrdi).toBe("Potvrdi predlog");
    expect(prevodi.ai.odbaci).toBe("Odbaci predlog");
    for (const d of dugmad(kutija)) expect(jeOnemoguceno(d.tag)).toBe(false);

    // The suggested text sits in editable fields of the box, so the owner can change it first.
    const unosi = polja(kutija);
    const naziv = mora(unosi.find((tag) => tag.startsWith("<input") && attr(tag, "value") === "Kaymak with pogača bread"), "no name suggestion input");
    expect(attr(naziv, "type")).toBe("text");
    expect(kutija).toContain("Homemade kaymak and warm pogača bread.");
    // Outside the box nothing shows the suggestion as if it were a translation...
    expect(uklonjeniPredlozi(stavka)).not.toContain("Kaymak");
    expect(uklonjeniPredlozi(html)).not.toContain("Kaymak");
    // ...and no "Predloži prevod" is offered next to a suggestion that waits.
    expect(stavka).not.toContain(prevodi.ai.predlozi);

    // Nothing is published: the translation of the name is still unconfirmed in the data.
    const clanak = mora(snapshot.articles.find((a) => a.name === KAJMAK), "no article");
    const pogled = fieldTranslation(clanak.name, (clanak.translations as MenuTranslations | null)?.en, "name");
    expect(pogled.confirmed).toBeNull();
    expect(pogled.status).toBe("suggested");
  });

  test("Gibanica is stale: it offers 'Prevod je i dalje dobar' and a new suggestion; Pršut sa sirom is missing and offers a suggestion only", () => {
    const { html } = izlogPosleEfekata({ fokus: "prevodi" });
    const stara = stavkaPrevoda(html, GIBANICA);
    expect(statusPrevoda(stara)).toBe("stale");
    const staraDugmad = dugmad(stara).map((d) => d.text);
    expect(staraDugmad).toContain(prevodi.jeDobar);
    expect(staraDugmad).toContain(prevodi.ai.predlozi);
    expect(bezTagova(stara)).toContain(prevodi.statusOpis.stale);
    // The confirmed (old) translation is still in the field.
    expect(polja(stara).some((tag) => attr(tag, "value") === "Cheese pie")).toBe(true);

    const nedostaje = stavkaPrevoda(html, "Pršut sa sirom");
    expect(statusPrevoda(nedostaje)).toBe("missing");
    const nedostajeDugmad = dugmad(nedostaje).map((d) => d.text);
    expect(nedostajeDugmad).toEqual([prevodi.ai.predlozi]);
    expect(nedostajeDugmad).not.toContain(prevodi.jeDobar);
    expect(bezTagova(nedostaje)).toContain(prevodi.statusOpis.missing);

    // "Predloži prevod" exists exactly for the missing and stale items on screen.
    const sve = sviElementi(html, "div", `\\sdata-prevod-stavka="[^"]*"`);
    const zaPredlog = sve.filter((s) => ["missing", "stale"].includes(statusPrevoda(s) ?? ""));
    expect(zaPredlog.length).toBeGreaterThan(2);
    expect(count(html, `>${prevodi.ai.predlozi}</button>`)).toBe(zaPredlog.length);
  });

  test("a finished item says Prevedeno and offers neither the check nor a new suggestion", () => {
    const { snapshot } = izlogPosleEfekata({ fokus: "prevodi" });
    const prebranac = mora(snapshot.articles.find((a) => a.name === "Prebranac"), "no article");
    const stavka = mora(stavkeArtikla(snapshot, prebranac.key, { vrsta: "sekcija", naziv: null })[0], "no item");
    const jezici: StudioJezici = { izvorni: "sr", prevodi: ["en", "de"], vanLimita: [], max: 10, ai: { dostupno: true, razlog: null } };
    const html = renderToStaticMarkup(
      <PrevodStavka stavka={stavka} jezik="en" nazivJezika={prevodi.jezici.en} ai={jezici.ai} radnje={radnje} red={new AutosaveRed()} mozeUredjivanje najavi={nista} />,
    );
    expect(statusPrevoda(html)).toBe("done");
    expect(bezTagova(html)).toContain(prevodi.statusi.done);
    expect(dugmad(html)).toEqual([]);
    expect(polja(html).some((tag) => attr(tag, "value") === "Baked beans (prebranac)")).toBe(true);
    // The same item in German is missing, so there the suggestion button is offered.
    const nemacki = renderToStaticMarkup(
      <PrevodStavka stavka={stavka} jezik="de" nazivJezika={prevodi.jezici.de} ai={jezici.ai} radnje={radnje} red={new AutosaveRed()} mozeUredjivanje najavi={nista} />,
    );
    expect(statusPrevoda(nemacki)).toBe("missing");
    expect(dugmad(nemacki).map((d) => d.text)).toEqual([prevodi.ai.predlozi]);
  });

  test("Standard: one language, the limit and the AI lock said once, no 'Predloži prevod' anywhere, the waiting suggestion is not published", () => {
    const { html, glavna } = izlogPosleEfekata({ fokus: "prevodi", plan: "standard" });
    const pogled = elementSaTragom(html, "div", "data-prevodi-stranice");
    expect(naslovi(html, 1)).toHaveLength(1);
    expect(bezTagova(naslovi(html, 1)[0])).toBe(fmt(prevodi.naslovStranice, { naziv: glavna.name }));
    // One language: no tab list, just its name.
    expect(pogled).not.toContain('role="tablist"');
    expect(pogled).not.toContain('role="tab"');
    expect(bezTagova(pogled)).toContain(`${prevodi.jezik}: ${prevodi.jezici.en}`);
    expect(pogled).not.toContain(`>${prevodi.jezici.de}<`);

    expect(bezTagova(pogled)).toContain(prevodi.limit.standard);
    expect(bezTagova(pogled)).toContain(prevodi.ai.premium);
    expect(count(pogled, prevodi.ai.premium)).toBe(1);
    expect(bezTagova(pogled)).not.toContain(fmt(prevodi.limit.premium, { n: 10 }));
    expect(html).not.toContain(prevodi.ai.predlozi);

    // A suggestion made earlier still waits for the owner (confirm or throw away), and is never shown as text.
    const kutije = sviElementi(pogled, "div", `\\sdata-ai-predlog=""`);
    expect(kutije).toHaveLength(1);
    expect(dugmad(kutije[0]).map((d) => d.text)).toEqual([prevodi.ai.potvrdi, prevodi.ai.odbaci]);
    expect(uklonjeniPredlozi(html)).not.toContain("Kaymak");
    // The list of the work area and the live preview do not contain it either.
    const prviOdgovor = izlog({ fokus: "prevodi", plan: "standard" });
    expect(uklonjeniPredlozi(prviOdgovor)).not.toContain("Kaymak");
  });
});

// -----------------------------------------------------------------------------
// E. The "Prevodi" group of the article detail
// -----------------------------------------------------------------------------

describe("K16 the Prevodi group of the article detail", () => {
  function kontekst(): StudioKontekst {
    return { lokal: "Demo restoran", slug: "demo-restoran", rezim: "hospitality", actor: "owner", mozeUredjivanje: true, mozeObjavu: true, mozeDostupnost: true, plan: "standard", roomService: false };
  }

  function renderDetalj(naziv: string, jezici: StudioJezici | undefined, otvorene: readonly ("prevodi")[] = []) {
    izlog({ fokus: "prevodi", plan: "standard" });
    const snapshot = mora(uhvaceno.snapshot, "no snapshot");
    const glavna = mora(snapshot.pages.find((page) => page.isDefault), "no main page");
    const artikal = mora(snapshot.articles.find((candidate) => candidate.name === naziv), `no article ${naziv}`);
    const podaci = mora(detaljIzSnapshota(snapshot, artikal.key), "no detail");
    return renderToStaticMarkup(
      <DetaljArtikla
        detalj={podaci}
        sadrzaj={mora(sadrzajIzSnapshota(snapshot, glavna.key), "no content")}
        izvorPrikazId={podaci.prikazi.find((prikaz) => prikaz.stranicaId === glavna.key)?.prikazId ?? null}
        stranice={straniceIzSnapshota(snapshot, new Set([glavna.key]))}
        nedostupni={new Set()}
        kontekst={kontekst()}
        red={new AutosaveRed()}
        radnje={radnje}
        naslovId="k16-naslov"
        pocetno={{ otvoreneGrupe: [...otvorene] }}
        sada={IZLOG_SADA}
        onNazad={nista}
        najavi={nista}
        jezici={jezici}
      />,
    );
  }
  const dvaJezika: StudioJezici = { izvorni: "sr", prevodi: ["en"], vanLimita: [], max: 2, ai: { dostupno: false, razlog: "premium" } };

  test("with a translation language the group exists, collapsed, with a summary of the worst state", () => {
    const html = renderDetalj(GIBANICA, dvaJezika);
    const g = grupa(html, "prevodi");
    expect(g.naslov).toBe(prevodi.naslov);
    expect(g.expanded).toBe("false");
    expect(g.teloTag).toMatch(/\shidden=""/);
    // Gibanica's English name is stale (its Serbian name changed after it was translated).
    expect(g.sazetak).toBe(fmt(prevodi.detaljSazetak, { jezik: "Engleski", status: prevodi.statusi.stale }));
    expect(g.sazetak).toBe("Engleski: Zastareo");
    // A group never opened renders nothing inside.
    expect(g.telo).not.toContain("data-prevod-stavka");
    // It is the last group of the detail.
    const idovi = [...html.matchAll(/data-grupa-detalja="([^"]*)"/g)].map((match) => match[1]);
    expect(idovi[idovi.length - 1]).toMatch(/-prevodi$/);
    expect(idovi).toHaveLength(5);
  });

  test("opened, the group holds the article's own item with its source text and the AI lock reason", () => {
    const html = renderDetalj(GIBANICA, dvaJezika, ["prevodi"]);
    const g = grupa(html, "prevodi");
    expect(g.expanded).toBe("true");
    expect(g.teloTag).not.toMatch(/\shidden=""/);
    expect(g.telo).toContain('data-prevod-stavka="article"');
    expect(bezTagova(g.telo)).toContain(prevodi.limit.standard);
    expect(bezTagova(g.telo)).toContain(prevodi.ai.premium);
    expect(g.telo).not.toContain(prevodi.ai.predlozi);
    expect(dugmad(g.telo).map((d) => d.text)).toContain(prevodi.jeDobar);
    expect(sazetakPrevoda(undefined, dvaJezika)).toBe("");
  });

  test("a simple venue with no translation language is not burdened: the group is absent", () => {
    const bez: StudioJezici = { izvorni: "sr", prevodi: [], vanLimita: [], max: 2, ai: { dostupno: false, razlog: "premium" } };
    const html = renderDetalj(GIBANICA, bez);
    expect(html).not.toMatch(/data-grupa-detalja="[^"]*-prevodi"/);
    expect(html).not.toContain("data-prevod-stavka");
    expect(html).not.toContain(prevodi.nemaJezikaNaslov);
    // The other four groups are all still there.
    expect(count(html, "data-grupa-detalja=")).toBe(4);
    // Not loaded yet (undefined) behaves the same: nothing to show.
    expect(renderDetalj(GIBANICA, undefined)).not.toMatch(/data-grupa-detalja="[^"]*-prevodi"/);
  });
});

// -----------------------------------------------------------------------------
// F. Icons
// -----------------------------------------------------------------------------

describe("K16 icons", () => {
  test("every <svg> in the Room service context, its dialog, the translations view and the combo box is aria-hidden", () => {
    const rsPrikaz = izlogPosleEfekata({ fokus: "room-service" }).html;
    const prevodiPrikaz = izlogPosleEfekata({ fokus: "prevodi" }).html;
    const komboPrikaz = izlog({ fokus: "kombo" });
    // The dialog of the price decision has no icons at all, so it only has to hold the rule.
    const dijalog = elementSaTragom(rsPrikaz, "div", 'role="dialog"');
    for (const ikonica of svgovi(dijalog)) expect(attr(ikonica, "aria-hidden"), ikonica).toBe("true");
    const uzorci = {
      rsKontekst: elementSaTragom(rsPrikaz, "div", "data-rs-kontekst"),
      prevodi: elementSaTragom(prevodiPrikaz, "div", "data-prevodi-stranice"),
      komboOdeljak: elementSaTragom(komboPrikaz, "section", "data-kombo-detalj"),
      strukturaRs: elementSaTragom(izlog({ plan: "premium" }), "section", 'aria-labelledby="studio-posebne-usluge"'),
    };
    for (const [ime, html] of Object.entries(uzorci)) {
      const ikonice = svgovi(html);
      expect(ikonice.length, `${ime}: no icons found`).toBeGreaterThan(0);
      for (const ikonica of ikonice) expect(attr(ikonica, "aria-hidden"), `${ime}: ${ikonica}`).toBe("true");
    }
    // The three big samples have several icons each (origin labels, warnings, statuses).
    expect(svgovi(uzorci.rsKontekst).length).toBeGreaterThan(6);
    expect(svgovi(uzorci.prevodi).length).toBeGreaterThan(6);
  });
});
