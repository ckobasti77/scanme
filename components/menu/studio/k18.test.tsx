// K18 render tests: Objavi (the publish review), Verzije (previous publications),
// who else is in the editor, and a conflict of the same value. Server markup only
// (renderToStaticMarkup, no DOM), set up like k11.test.tsx, k16.test.tsx and
// k17.test.tsx: useSirina() answers "desktop" on the server, effects never run,
// `@/components/ui/dialog` is replaced by a stand-in that renders an open dialog
// inline and next/link by a plain anchor.
//
// Most tests render the izlog (`modal=objava|objava-greske|objava-zastarelo|verzije`,
// `stanje=konflikt`); the ones that need a state the izlog never has (a never
// published menu under review, a review without changes, a person who may not
// publish, a draft made from a restored version, someone on the open article) render
// StudioEditor, ObjavaModal or VerzijeDijalog on their own with the props the editor
// would pass. The confirmed state of Objavi (the checkbox ticked) is not reachable in
// a static render and is not covered here. Texts come from the dictionaries; the only
// literals are invented fixture facts (names, prices, times of the izlog) and the
// button words the owner named.

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parseEditorPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import type { AutosaveZbir } from "@/lib/menu/studio/autosave-queue";
import { opisKonflikta, type OpisKonflikta } from "@/lib/menu/studio/conflict";
import { detaljIzSnapshota } from "@/lib/menu/studio/detalj";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type {
  StudioKontekst,
  StudioPodaci,
  StudioPregledObjave,
  StudioPrisutan,
  StudioRadnje,
  StudioStatusNacrta,
  StudioVerzija,
  StudioVerzije,
} from "@/lib/menu/studio/model";
import { KONFLIKT_KLASA, KonfliktPolja } from "./konflikt/konflikt-polja";
import { ObjavaModal } from "./objava/objava-modal";
import { tekstCene } from "./red-artikla/red-artikla";
import { StudioZaglavlje } from "./shell/zaglavlje";
import { StudioEditor } from "./studio-editor";
import { VerzijeDijalog } from "./verzije/verzije-dijalog";

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

const o = menuStudioSr.objavljivanje;
const m = o.modal;
const v = o.verzije;
const prisustvo = o.prisustvo;
const konfliktSr = o.konflikt;
const ob = menuStudioSr.objava;
const zag = menuStudioSr.zaglavlje;
const redSr = menuStudioSr.red;
const zaj = menuZajednickoSr;
const izdanja = menuDomenSr.publishIssues;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in k11/k15/k16/k17)
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

/** The one <button> whose opening tag matches `trag` (a regex source, e.g. `\sdata-objavi=""`). */
function dugmeSaTragom(html: string, trag: string): Dugme {
  const match = new RegExp(`<button\\b[^>]*${trag}[^>]*>([\\s\\S]*?)</button>`).exec(html);
  if (!match) throw new Error(`no <button ${trag}> in the markup`);
  return { tag: prviTag(match[0]), text: bezTagova(match[1]) };
}

/** The text of every paragraph of a piece of markup, in order. */
const paragrafi = (markup: string) => [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => tekst(match[1]));

const polja = (html: string) => [...html.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map((match) => match[0]);
const svgTagovi = (markup: string) => [...markup.matchAll(/<svg\b[^>]*>/g)].map((match) => match[0]);

/** Every svg of a piece of markup must be decoration for screen readers; returns how many there are. */
function sveSakriveno(markup: string, gde: string): number {
  const tagovi = svgTagovi(markup);
  for (const tag of tagovi) expect(attr(tag, "aria-hidden"), `${gde}: ${tag.slice(0, 140)}`).toBe("true");
  return tagovi.length;
}

type Mnozina = { one: string; few: string; many: string };
const mnozina = (grupa: Mnozina, n: number) => fmt(grupa[srPluralCategory(n)], { n });
const escRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The number in a sentence built from a plural group (`grupa`, `ostalo` = its other
 * placeholders), or null when no form fits the sentence or the form does not agree
 * with the number it states.
 */
function brojUMnozini(grupa: Mnozina, recenica: string, ostalo: Record<string, string> = {}): number | null {
  for (const kategorija of ["one", "few", "many"] as const) {
    const sablon = escRegex(fmt(grupa[kategorija], { ...ostalo, n: "\u0000" })).replace("\u0000", "(\\d+)");
    const poklapanje = new RegExp(`^${sablon}$`).exec(recenica);
    if (poklapanje && srPluralCategory(Number(poklapanje[1])) === kategorija) return Number(poklapanje[1]);
  }
  return null;
}

/** The server markup of the izlog (deterministic: one render per query). */
const kes = new Map<string, string>();
function izlog(query: IzlogSearchParams = {}): string {
  const kljuc = JSON.stringify(query);
  let html = kes.get(kljuc);
  if (html === undefined) {
    html = renderToStaticMarkup(<EditorIzlog params={parseEditorPreview(query)} />);
    kes.set(kljuc, html);
  }
  return html;
}

/** The (single) dialog of the markup. */
const dijalog = (html: string) => elementSaTragom(html, "div", 'role="dialog"');

// Fixture facts (the invented medium venue and the izlog's K18 setup).
const srednji = fixtureMenu("srednji");
const glavnaStranica = mora(
  srednji.snapshot.pages.find((page) => page.isDefault),
  "no main page",
);
const RUCAK = "Ručak dana";
const PRSUT = "Pršut sa sirom";
const CORBA_GRASKA = "Čorba od graška";
const AJVAR = "Ajvar sa tostom";
const GIBANICA = "Gibanica";
const ANA = "Ana Petrović";
const MARKO = "Marko Ilić";
const JELENA = "Jelena Kostić";
const cenaArtikla = (naziv: string) => mora(srednji.snapshot.articles.find((article) => article.name === naziv)?.basePriceRsd, `no price for ${naziv}`);

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
const SACUVANO: AutosaveZbir = { stanje: "sacuvano", neuspelo: 0, poslednjeU: null };

/** Rows of the work area, as wholes. */
function redArtikla(html: string, naziv: string): string {
  const redovi = [...html.matchAll(/<li\b[^>]*\sdata-red-artikla=""/g)].map((match) => element(html, mora(match.index, "no index")));
  return mora(
    redovi.find((red) => red.includes(`>${naziv}</p>`)),
    `no row ${naziv}`,
  );
}

// -----------------------------------------------------------------------------
// The editor, ObjavaModal and VerzijeDijalog on their own
// -----------------------------------------------------------------------------

const kontekst = (izmene: Partial<StudioKontekst> = {}): StudioKontekst => ({
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
});

const statusNacrta = (izmene: Partial<StudioStatusNacrta> = {}): StudioStatusNacrta => ({
  stanje: "dirty",
  objavljenaVerzija: 3,
  objavljenoU: IZLOG_SADA - 3 * 3_600_000,
  revizija: 4,
  poslednjaIzmena: null,
  vracenoIz: null,
  ...izmene,
});

function podaciSrednji(izmene: { kontekst?: Partial<StudioKontekst>; status?: Partial<StudioStatusNacrta>; prisustvo?: StudioPrisutan[] } = {}): StudioPodaci {
  const sadrzaj = mora(sadrzajIzSnapshota(srednji.snapshot, glavnaStranica.key), "no content of the main page");
  return {
    kontekst: kontekst(izmene.kontekst),
    stranice: straniceIzSnapshota(srednji.snapshot, new Set([glavnaStranica.key])),
    sadrzaj,
    status: statusNacrta({ objavljenaVerzija: 7, ...izmene.status }),
    nedostupni: new Set(srednji.unavailableArticleKeys),
    povezano: true,
    prisustvo: izmene.prisustvo,
  };
}

function urednik(podaci: StudioPodaci, ostalo: Partial<ComponentProps<typeof StudioEditor>> = {}): string {
  return renderToStaticMarkup(
    <StudioEditor podaci={podaci} radnje={radnje} izabranaStranica={null} onIzaberiStranicu={nista} sada={IZLOG_SADA} {...ostalo} />,
  );
}

const SAZETAK_NULA = { cene: 0, novi: 0, uklonjeni: 0, sakriveno: 0, uklonjenoSaStranice: 0, obrisano: 0, redosled: 0 };

function pregledProbe(izmene: Partial<StudioPregledObjave> = {}): StudioPregledObjave {
  return {
    revizija: 4,
    stanje: "dirty",
    mozeObjavu: true,
    menjaSe: true,
    prevelik: false,
    greske: [],
    upozorenja: [],
    otisak: "otisak-probe",
    sazetak: { ...SAZETAK_NULA, cene: 1 },
    objavljenaVerzija: 3,
    ciljevi: {},
    promeneCena: [],
    ...izmene,
  };
}

function modal(
  ulaz: {
    pregled?: Partial<StudioPregledObjave>;
    status?: Partial<StudioStatusNacrta>;
    cuvanje?: AutosaveZbir;
    konflikata?: number;
    bezPocetnog?: boolean;
    /** The editor has a way to the translations (a language is on). */
    prevodi?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <ObjavaModal
      otvoreno
      onOtvoreno={nista}
      status={statusNacrta(ulaz.status)}
      cuvanje={ulaz.cuvanje ?? SACUVANO}
      konflikata={ulaz.konflikata}
      sada={IZLOG_SADA}
      onPokusajCuvanje={nista}
      nazivArtikla={() => null}
      onPregled={() => Promise.reject(new Error("onPregled must not run in a server render"))}
      onObjavi={() => Promise.reject(new Error("onObjavi must not run in a server render"))}
      onIdiNaArtikal={nista}
      onOtvoriPrevode={ulaz.prevodi ? nista : null}
      onPregledNacrta={nista}
      pocetno={ulaz.bezPocetnog ? undefined : { pregled: pregledProbe(ulaz.pregled) }}
    />,
  );
}

const verzijaProbe = (broj: number, izmene: Partial<StudioVerzija> = {}): StudioVerzija => ({
  broj,
  objavljenoU: IZLOG_SADA - (4 - broj) * 86_400_000,
  objavio: ANA,
  sazetak: SAZETAK_NULA,
  vracenoIz: null,
  uzivo: false,
  ...izmene,
});

const VERZIJE_PROBE: StudioVerzije = {
  uzivo: 3,
  verzije: [
    verzijaProbe(3, { uzivo: true, sazetak: { ...SAZETAK_NULA, cene: 2 } }),
    verzijaProbe(2, { objavio: null, vracenoIz: 1 }),
    verzijaProbe(1, { objavio: MARKO, sazetak: { ...SAZETAK_NULA, novi: 5 } }),
  ],
};

function verzijeDijalog(
  ulaz: { verzije?: StudioVerzije; status?: Partial<StudioStatusNacrta>; mozeVracanje?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <VerzijeDijalog
      otvoreno
      onOtvoreno={nista}
      status={statusNacrta(ulaz.status)}
      mozeVracanje={ulaz.mozeVracanje ?? true}
      sada={IZLOG_SADA}
      onUcitaj={() => Promise.reject(new Error("onUcitaj must not run in a server render"))}
      onVrati={() => Promise.reject(new Error("onVrati must not run in a server render"))}
      onPregledajIObjavi={nista}
      pocetno={ulaz.verzije ? { verzije: ulaz.verzije } : undefined}
    />,
  );
}

// -----------------------------------------------------------------------------
// A. modal=objava: the review before Objavi
// -----------------------------------------------------------------------------

/** The reason text under a waiting `Objavi meni`, and the link from the button to it. */
function objaviDugme(d: string) {
  const dugme = dugmeSaTragom(d, `\\sdata-objavi-potvrdi=""`);
  const razlogId = attr(dugme.tag, "aria-describedby");
  const razlog = razlogId ? elementSaTragom(d, "p", `id="${razlogId}"`) : null;
  return { dugme, razlogId, razlog };
}

describe("K18 A: modal=objava (consequences, warnings to confirm)", () => {
  test("one dialog, titled Objavi izmene with its description; the review is already loaded; exactly one h1 (the page)", () => {
    const html = izlog({ modal: "objava" });
    expect(count(html, 'role="dialog"')).toBe(1);
    const d = dijalog(html);
    expect(bezTagova(mora(/<h2>([\s\S]*?)<\/h2>/.exec(d), "no dialog title")[1])).toBe(ob.naslov);
    expect(bezTagova(mora(/<p>([\s\S]*?)<\/p>/.exec(d), "no dialog description")[1])).toBe(ob.opis);
    expect(attr(prviTag(elementSaTragom(d, "div", 'data-objava="')), "data-objava")).toBe("pregled");
    expect(d).not.toContain('data-stanje="ucitavanje"');
    // The other dialogs are closed; the page has its one h1.
    const h1 = naslovi(html, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(glavnaStranica.name);
    // Nothing blocks and nothing is stale in this state.
    for (const trag of ["data-objava-greske", "data-objava-zastarelo", 'role="alert"']) expect(d, trag).not.toContain(trag);
    expect(tekst(d)).not.toContain(ob.bezDozvole);
    expect(tekst(d)).not.toContain(ob.prevelik);
  });

  test("consequences: one line per kind in the master's order, in numbers; structural changes with their details", () => {
    const sekcija = elementSaTragom(dijalog(izlog({ modal: "objava" })), "section", 'data-objava-posledice=""');
    expect(attr(prviTag(sekcija), "aria-labelledby")).toBe("objava-posledice");
    expect(bezTagova(naslovi(sekcija, 3)[0])).toBe(m.posledice.naslov);

    const redovi = sviElementi(sekcija, "li", `\\sdata-posledica="[^"]*"`);
    expect(redovi.map((red) => attr(prviTag(red), "data-posledica"))).toEqual(["cene", "novi", "uklonjeni", "strukturne"]);
    // The line leads each row (the price row goes on with its disclosure, the structural one with its details).
    expect(tekst(redovi[0]).startsWith(`${mnozina(ob.cene, 3)} ${m.posledice.pogledajCene} `)).toBe(true);
    expect(tekst(redovi[1])).toBe(mnozina(ob.novi, 1));
    expect(tekst(redovi[2])).toBe(mnozina(ob.uklonjeni, 1));
    // One hidden article and one section in a new order = two changes of the layout, said in words.
    const detalji = [mnozina(m.posledice.strukturneDetalji.sakriveno, 1), mnozina(m.posledice.strukturneDetalji.redosled, 1)].join(" · ");
    expect(tekst(redovi[3])).toBe(`${mnozina(ob.strukturne, 2)} ${detalji}`);

    // The tones are decoration: every icon tile is hidden from screen readers.
    for (const red of redovi) {
      expect(sveSakriveno(red, String(attr(prviTag(red), "data-posledica")))).toBeGreaterThan(0);
    }
    // This is a review with changes: none of the other statements is on screen.
    expect(tekst(sekcija)).not.toContain(ob.bezPromena);
    expect(tekst(sekcija)).not.toContain(ob.prvaObjava);
    expect(tekst(sekcija)).not.toContain(ob.ostalo);
  });

  test("Pogledaj izmenjene cene: a disclosure, open for three changed prices, listing old → new prices with the words for screen readers", () => {
    const sekcija = elementSaTragom(dijalog(izlog({ modal: "objava" })), "section", 'data-objava-posledice=""');
    expect(count(sekcija, "<details")).toBe(1);
    const cene = sviElementi(sekcija, "li", `\\sdata-posledica="cene"`)[0];
    const lista = elementSaTragom(cene, "details", 'data-objava-cene=""');
    // Open while there are at most five changed prices (the costliest thing to get wrong; K18 critique).
    expect(/\sopen=""/.test(prviTag(lista))).toBe(true);
    expect(tekst(mora(/<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(lista), "no summary")[1])).toBe(m.posledice.pogledajCene);

    // Sorted by name; the old and the new price are said in words for assistive technology too.
    const stavke = sviElementi(lista, "li", "");
    const ocekivano = [
      ["Kajmak sa pogačom", 480, 520],
      [PRSUT, 920, 960],
      ["Punjene paprike", 760, 820],
    ] as const;
    expect(stavke).toHaveLength(ocekivano.length);
    ocekivano.forEach(([naziv, pre, posle], i) => {
      expect(tekst(stavke[i])).toBe(`${naziv} ${m.posledice.cenaPre} ${pre} ${menuStudioSr.red.rsd} ${m.posledice.cenaPosle} ${posle} ${menuStudioSr.red.rsd}`);
      expect(tekst(stavke[i])).toBe(`${naziv} ${m.posledice.cenaPre} ${tekstCene(pre)} ${m.posledice.cenaPosle} ${tekstCene(posle)}`);
      // The arrow between the prices is decoration.
      expect(sveSakriveno(stavke[i], naziv)).toBe(1);
    });
    // The fixture prices behind those numbers (the izlog starts from them).
    expect(cenaArtikla("Kajmak sa pogačom")).toBe(480);
    expect(cenaArtikla(PRSUT)).toBe(920);
    expect(cenaArtikla("Punjene paprike")).toBe(760);
    // All three changed prices are listed, so there is no "and N more" line.
    expect(tekst(lista)).not.toContain(mnozina(m.posledice.josCena, 1));
  });

  test("warnings: the combo (Idi na artikal) and the English translation (Otvori prevode), nothing else", () => {
    const sekcija = elementSaTragom(dijalog(izlog({ modal: "objava" })), "section", 'data-objava-upozorenja=""');
    expect(bezTagova(naslovi(sekcija, 3)[0])).toBe(ob.upozorenjaNaslov);
    expect(tekst(sekcija)).toContain(m.upozorenja.opis);
    expect(sviElementi(sekcija, "li", "")).toHaveLength(2);

    const artikli = sviElementi(sekcija, "li", `\\sdata-problem-artikal="[^"]*"`);
    expect(artikli).toHaveLength(1);
    const gde = fmt(m.greske.naStranici, { stranica: glavnaStranica.name });
    expect(tekst(artikli[0])).toBe([RUCAK, gde, izdanja.combo_price_check, m.greske.idiNaArtikal].join(" "));
    const idi = dugmad(artikli[0]);
    expect(idi).toHaveLength(1);
    expect(idi[0].text).toBe(m.greske.idiNaArtikal);
    expect(attr(idi[0].tag, "aria-label")).toBe(fmt(m.greske.idiNaArtikalOznaka, { naziv: RUCAK }));
    expect(jeOnemoguceno(idi[0].tag)).toBe(false);
    expect(attr(idi[0].tag, "data-idi-na-artikal")).toBe(attr(prviTag(artikli[0]), "data-problem-artikal"));

    const ostali = sviElementi(sekcija, "li", `\\sdata-problem-objave="[^"]*"`);
    expect(ostali).toHaveLength(1);
    expect(attr(prviTag(ostali[0]), "data-problem-objave")).toBe("translation_missing");
    // The line is the sentence, then the way to the translations.
    expect(tekst(ostali[0]).endsWith(` ${m.upozorenja.otvoriPrevode}`)).toBe(true);
    const recenica = tekst(ostali[0]).slice(0, -(m.upozorenja.otvoriPrevode.length + 1));
    // English, with the number of texts in the form that agrees with it.
    const n = brojUMnozini(m.upozorenja.jezik, recenica, { jezik: "Engleski" });
    expect(n, recenica).not.toBeNull();
    expect(n).toBeGreaterThan(0);
    expect(dugmad(ostali[0]).map((dugme) => dugme.text)).toEqual([m.upozorenja.otvoriPrevode]);
    expect(m.upozorenja.otvoriPrevode).toBe("Otvori prevode");
    expect(m.greske.idiNaArtikal).toBe("Idi na artikal");
  });

  test("the confirmation is unchecked: Objavi meni waits, says why, and the button points at the reason", () => {
    const d = dijalog(izlog({ modal: "objava" }));
    const polje = mora(/<input\b[^>]*\sdata-objava-potvrda=""[^>]*>/.exec(d), "no confirmation checkbox")[0];
    expect(attr(polje, "type")).toBe("checkbox");
    expect(jeOznaceno(polje)).toBe(false);
    const oznaka = elementSaTragom(d, "label", `for="${mora(attr(polje, "id"), "the checkbox has no id")}"`);
    expect(tekst(oznaka)).toBe(ob.potvrda);
    // The checkbox sits with the warnings it confirms.
    expect(elementSaTragom(d, "section", 'data-objava-upozorenja=""')).toContain("data-objava-potvrda");

    const { dugme, razlogId, razlog } = objaviDugme(d);
    expect(dugme.text).toBe(ob.objavi);
    expect(ob.objavi).toBe("Objavi meni");
    expect(jeOnemoguceno(dugme.tag)).toBe(true);
    expect(attr(dugme.tag, "type")).toBe("button");
    expect(razlogId).toBeTruthy();
    expect(razlog).not.toBeNull();
    expect(tekst(mora(razlog, "no reason"))).toBe(m.razlozi.potvrda);
    expect(attr(prviTag(mora(razlog, "no reason")), "data-objava-razlog")).toBe("potvrda");
    // One reason only, and it is the one the button points at.
    expect(count(d, "data-objava-razlog=")).toBe(1);
  });

  test("the safety sentence names version 7, the draft preview is one button away, and Nazad is the other footer button", () => {
    const d = dijalog(izlog({ modal: "objava" }));
    const sigurnost = elementSaTragom(d, "p", 'data-objava-sigurnost=""');
    expect(tekst(sigurnost)).toBe(fmt(m.sigurnostVerzija, { broj: 7 }));
    expect(tekst(sigurnost)).not.toContain(m.sigurnostPrva);
    expect(sveSakriveno(sigurnost, "sigurnost")).toBe(1);

    const pregled = dugmeSaTragom(d, `\\sdata-objava-pregled=""`);
    expect(pregled.text).toBe(m.pregledNacrta);
    expect(m.pregledNacrta).toBe("Pogledaj pregled nacrta");
    expect(jeOnemoguceno(pregled.tag)).toBe(false);
    expect(tekst(d)).toContain(m.pregledNacrtaOpis);

    // Footer: the reason, then Nazad and Objavi meni.
    const tekstovi = dugmad(d).map((dugme) => dugme.text);
    expect(tekstovi).toContain(ob.nazad);
    expect(tekstovi[tekstovi.length - 1]).toBe(ob.objavi);
    expect(tekstovi[tekstovi.length - 2]).toBe(ob.nazad);
    // The footer says nothing about the live version before this (no restore).
    expect(tekst(d)).not.toContain(fmt(o.nacrtIz, { broj: 7 }));
  });

  test("every icon of the dialog is hidden from screen readers", () => {
    const d = dijalog(izlog({ modal: "objava" }));
    expect(sveSakriveno(d, "modal=objava")).toBeGreaterThanOrEqual(8);
  });
});

// -----------------------------------------------------------------------------
// B. modal=objava-greske: errors lock the publication and lead to their articles
// -----------------------------------------------------------------------------

describe("K18 B: modal=objava-greske (errors)", () => {
  const html = izlog({ modal: "objava-greske" });

  test("the errors block: the count in the right plural form, the explanation, one line per article", () => {
    const d = dijalog(html);
    const sekcija = elementSaTragom(d, "section", 'data-objava-greske=""');
    expect(attr(prviTag(sekcija), "aria-labelledby")).toBe("objava-greske");
    expect(bezTagova(naslovi(sekcija, 3)[0])).toBe(ob.greskeNaslov);
    expect(sveSakriveno(mora(/<h3\b[\s\S]*?<\/h3>/.exec(sekcija), "no heading")[0], "greske naslov")).toBe(1);
    // The count in the form that agrees with it, then the explanation.
    expect(paragrafi(sekcija)).toContain(`${fmt(m.greske.broj.few, { n: 2 })}. ${ob.greskeOpis}`);

    const stavke = sviElementi(sekcija, "li", `\\sdata-problem-artikal="[^"]*"`);
    expect(stavke).toHaveLength(2);
    expect(sviElementi(sekcija, "li", "")).toHaveLength(2);

    const gde = fmt(m.greske.naStranici, { stranica: glavnaStranica.name });
    for (const naziv of [AJVAR, CORBA_GRASKA]) {
      const stavka = mora(
        stavke.find((kandidat) => tekst(kandidat).startsWith(`${naziv} `)),
        `no line for ${naziv}`,
      );
      // One line: name, where it is, what is wrong, one way to it.
      expect(tekst(stavka), naziv).toBe([naziv, gde, izdanja.price_missing, m.greske.idiNaArtikal].join(" "));
      const dugmici = dugmad(stavka);
      expect(dugmici, naziv).toHaveLength(1);
      expect(dugmici[0].text).toBe(m.greske.idiNaArtikal);
      expect(attr(dugmici[0].tag, "aria-label"), naziv).toBe(fmt(m.greske.idiNaArtikalOznaka, { naziv }));
      expect(jeOnemoguceno(dugmici[0].tag)).toBe(false);
      expect(attr(dugmici[0].tag, "data-idi-na-artikal")).toBe(attr(prviTag(stavka), "data-problem-artikal"));
    }
  });

  test("the warnings wait: their count is said once the errors are fixed, and there is no confirmation to tick meanwhile", () => {
    const d = dijalog(html);
    const sekcija = elementSaTragom(d, "section", 'data-objava-greske=""');
    // The same warnings as in modal=objava (the combo and the English translation).
    const upozorenja = sviElementi(elementSaTragom(dijalog(izlog({ modal: "objava" })), "section", 'data-objava-upozorenja=""'), "li", "").length;
    expect(upozorenja).toBeGreaterThan(0);
    const odlozena = paragrafi(sekcija).filter((recenica) => brojUMnozini(m.greske.upozorenjaKasnije, recenica) !== null);
    expect(odlozena).toHaveLength(1);
    expect(brojUMnozini(m.greske.upozorenjaKasnije, odlozena[0])).toBe(upozorenja);
    expect(odlozena[0]).toBe(mnozina(m.greske.upozorenjaKasnije, upozorenja));

    expect(d).not.toContain("data-objava-potvrda");
    expect(d).not.toContain("data-objava-upozorenja");
    expect(tekst(d)).not.toContain(ob.potvrda);
    expect(tekst(d)).not.toContain(m.upozorenja.opis);
  });

  test("Objavi meni is disabled with the reason for errors, linked by aria-describedby", () => {
    const d = dijalog(html);
    const { dugme, razlog } = objaviDugme(d);
    expect(jeOnemoguceno(dugme.tag)).toBe(true);
    expect(dugme.text).toBe(ob.objavi);
    expect(tekst(mora(razlog, "no reason"))).toBe(m.razlozi.greske);
    expect(attr(prviTag(mora(razlog, "no reason")), "data-objava-razlog")).toBe("greske");
    expect(count(d, "data-objava-razlog=")).toBe(1);
  });

  test("the consequences of the draft are still shown, and the dialog is the only one open; one h1", () => {
    expect(count(html, 'role="dialog"')).toBe(1);
    expect(dijalog(html)).toContain('data-objava-posledice=""');
    expect(naslovi(html, 1)).toHaveLength(1);
    expect(sveSakriveno(dijalog(html), "modal=objava-greske")).toBeGreaterThanOrEqual(8);
  });
});

// -----------------------------------------------------------------------------
// C. modal=objava-zastarelo: a newer edit makes the review stale
// -----------------------------------------------------------------------------

describe("K18 C: modal=objava-zastarelo (stale review)", () => {
  const html = izlog({ modal: "objava-zastarelo" });

  test("the stale block is an alert: the title, who changed the draft and when, the instruction, and Osveži spisak izmena", () => {
    const d = dijalog(html);
    const blok = elementSaTragom(d, "div", 'data-objava-zastarelo=""');
    expect(attr(prviTag(blok), "role")).toBe("alert");
    const delovi = [...blok.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => tekst(match[1]));
    // The invented colleague changed a price one minute before "now" (the izlog's fixed clock: 18:27, Belgrade).
    expect(delovi).toEqual([
      m.zastarelo.naslov,
      fmt(m.zastarelo.poslednja, { ime: MARKO, kada: fmt(zag.danas, { vreme: "18:26" }) }),
      m.zastarelo.uputstvo,
    ]);
    const osvezi = dugmeSaTragom(blok, `\\sdata-objava-osvezi=""`);
    expect(osvezi.text).toBe(m.zastarelo.osvezi);
    expect(m.zastarelo.osvezi).toBe("Osveži spisak izmena");
    expect(jeOnemoguceno(osvezi.tag)).toBe(false);
    expect(dugmad(blok)).toHaveLength(1);
    expect(sveSakriveno(blok, "zastarelo")).toBe(1);
    // It comes before the consequences of the old review.
    expect(d.indexOf("data-objava-zastarelo")).toBeLessThan(d.indexOf("data-objava-posledice"));
  });

  test("Objavi meni is disabled with the reason for a stale review", () => {
    const d = dijalog(html);
    const { dugme, razlog } = objaviDugme(d);
    expect(jeOnemoguceno(dugme.tag)).toBe(true);
    expect(tekst(mora(razlog, "no reason"))).toBe(m.razlozi.zastarelo);
    expect(attr(prviTag(mora(razlog, "no reason")), "data-objava-razlog")).toBe("zastarelo");
    expect(count(d, "data-objava-razlog=")).toBe(1);
  });

  test("one dialog, no error block, exactly one h1", () => {
    expect(count(html, 'role="dialog"')).toBe(1);
    expect(dijalog(html)).not.toContain("data-objava-greske");
    expect(naslovi(html, 1)).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// D. modal=verzije
// -----------------------------------------------------------------------------

describe("K18 D: modal=verzije (previous publications)", () => {
  const html = izlog({ modal: "verzije" });

  test("one dialog, titled Prethodne objave; the description says a restore makes a new draft", () => {
    expect(count(html, 'role="dialog"')).toBe(1);
    const d = dijalog(html);
    expect(bezTagova(mora(/<h2>([\s\S]*?)<\/h2>/.exec(d), "no dialog title")[1])).toBe(v.naslov);
    expect(attr(prviTag(elementSaTragom(d, "div", 'data-verzije-korak="')), "data-verzije-korak")).toBe("lista");
    expect(tekst(d)).toContain(v.opis);
    // The sentence is about a draft and about publishing (the dictionary's words for them).
    expect(v.opis).toMatch(/nacrt/i);
    expect(v.opis).toMatch(/objav/i);
    // No message, no refusal for this person, one h1.
    expect(d).not.toContain('role="alert"');
    expect(tekst(d)).not.toContain(v.bezDozvole);
    expect(naslovi(html, 1)).toHaveLength(1);
    expect(dugmad(d).map((dugme) => dugme.text)).toContain(ob.zatvori);
  });

  test("seven versions, newest first; only 7 is live (data-uzivo, the badge, the screen-reader sentence)", () => {
    const lista = elementSaTragom(dijalog(html), "ol", 'data-verzije=""');
    const stavke = sviElementi(lista, "li", `\\sdata-verzija="\\d+"`);
    expect(stavke.map((stavka) => Number(attr(prviTag(stavka), "data-verzija")))).toEqual([7, 6, 5, 4, 3, 2, 1]);
    for (const stavka of stavke) {
      const broj = Number(attr(prviTag(stavka), "data-verzija"));
      const uzivo = broj === 7;
      expect(/\sdata-uzivo=""/.test(prviTag(stavka)), `data-uzivo on ${broj}`).toBe(uzivo);
      expect(tekst(stavka), `version ${broj}`).toContain(fmt(v.verzija, { broj }));
      expect(tekst(stavka).includes(v.uzivo), `badge on ${broj}`).toBe(uzivo);
      expect(tekst(stavka).includes(v.uzivoOpis), `description on ${broj}`).toBe(uzivo);
    }
    expect(count(lista, `>${v.uzivo}</span>`)).toBe(1);
    expect(sveSakriveno(stavke[0], "version 7")).toBeGreaterThan(0);
  });

  test("who published and when: Ana Petrović on odd versions, Marko Ilić on even ones; the times are in Belgrade time", () => {
    const stavke = sviElementi(elementSaTragom(dijalog(html), "ol", 'data-verzije=""'), "li", `\\sdata-verzija="\\d+"`);
    for (const stavka of stavke) {
      const broj = Number(attr(prviTag(stavka), "data-verzija"));
      expect(tekst(stavka), `version ${broj}`).toContain(` · ${broj % 2 === 1 ? ANA : MARKO}`);
    }
    // 7: three hours before the izlog's "now" (18:27 Belgrade); 6: two days and three hours before that.
    expect(tekst(stavke[0])).toContain(`${fmt(zag.danas, { vreme: "15:27" })} · ${ANA}`);
    expect(tekst(stavke[1])).toContain(`${fmt(zag.datum, { datum: "15. 10.", vreme: "12:27" })} · ${MARKO}`);
  });

  test("version 7 offers Odbaci izmene nacrta (the draft has an unpublished change); 1-6 each offer Vrati kao nacrt", () => {
    const stavke = sviElementi(elementSaTragom(dijalog(html), "ol", 'data-verzije=""'), "li", `\\sdata-verzija="\\d+"`);
    const tekuca = stavke[0];
    const odbaci = dugmeSaTragom(tekuca, `\\sdata-verzija-odbaci=""`);
    expect(odbaci.text).toBe(v.odbaci);
    expect(v.odbaci).toBe("Odbaci izmene nacrta");
    expect(attr(odbaci.tag, "aria-label")).toBe(fmt(v.odbaciOznaka, { broj: 7 }));
    expect(dugmad(tekuca)).toHaveLength(1);
    expect(tekuca).not.toContain("data-verzija-vrati");

    for (const stavka of stavke.slice(1)) {
      const broj = Number(attr(prviTag(stavka), "data-verzija"));
      const vrati = dugmeSaTragom(stavka, `\\sdata-verzija-vrati="${broj}"`);
      expect(vrati.text, `version ${broj}`).toBe(v.vrati);
      expect(attr(vrati.tag, "aria-label"), `version ${broj}`).toBe(fmt(v.vratiOznaka, { broj }));
      expect(jeOnemoguceno(vrati.tag), `version ${broj}`).toBe(false);
      expect(dugmad(stavka), `version ${broj}`).toHaveLength(1);
      expect(stavka, `version ${broj}`).not.toContain("data-verzija-odbaci");
    }
    expect(v.vrati).toBe("Vrati kao nacrt");
    expect(count(dijalog(html), "data-verzija-vrati=")).toBe(6);
    expect(count(dijalog(html), "data-verzija-odbaci=")).toBe(1);
  });

  test("each version states what changed, as numbers in the right plural form (or says it was the look/settings)", () => {
    const stavke = sviElementi(elementSaTragom(dijalog(html), "ol", 'data-verzije=""'), "li", `\\sdata-verzija="\\d+"`);
    const grupe = [ob.cene, ob.novi, ob.uklonjeni, ob.strukturne];
    for (const stavka of stavke) {
      const broj = Number(attr(prviTag(stavka), "data-verzija"));
      // The summary is the one paragraph made only of such phrases (the others: title, who and when, restore note).
      const sazeci = paragrafi(stavka).filter(
        (odeljak) => odeljak === v.bezPromenaPonude || odeljak.split(" · ").every((deo) => grupe.some((grupa) => brojUMnozini(grupa, deo) !== null)),
      );
      expect(sazeci, `version ${broj}`).toHaveLength(1);
    }
    // Version 7 differs from 6 by the izlog's invented history: a few prices.
    expect(tekst(stavke[0])).toContain(fmt(ob.cene.few, { n: 3 }));
  });
});

// -----------------------------------------------------------------------------
// E. stanje=konflikt: a conflict of the same value, and who else is here
// -----------------------------------------------------------------------------

describe("K18 E: stanje=konflikt", () => {
  const html = izlog({ stanje: "konflikt" });
  const red = redArtikla(html, PRSUT);
  const kutija = elementSaTragom(red, "div", 'data-konflikt=""');

  test("the row shows the conflict as an alert: the saved value, who else is here, nothing overwritten, and exactly two ways out", () => {
    expect(attr(prviTag(kutija), "role")).toBe("alert");
    expect(/\sdata-konflikt="ista"/.test(prviTag(kutija))).toBe(false);
    const odeljci = [...kutija.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => tekst(match[1]));
    expect(odeljci).toEqual([
      fmt(redSr.konflikt, { sacuvano: `980 ${redSr.rsd}` }),
      `${fmt(konfliktSr.drugi.jedan, { imena: MARKO })} ${konfliktSr.nistaPrepisano}`,
    ]);
    expect(odeljci[0]).toBe(fmt(redSr.konflikt, { sacuvano: "980 RSD" }));
    // The presence sentence is its own paragraph, marked as such.
    expect(attr(prviTag(elementSaTragom(kutija, "p", "data-konflikt-drugi")), "data-konflikt-drugi")).toBe("");

    const dugmici = dugmad(kutija);
    expect(dugmici.map((dugme) => dugme.text)).toEqual([
      fmt(redSr.zadrziMoju, { moja: "950 RSD" }),
      fmt(konfliktSr.uzmiSacuvanu, { vrednost: `980 ${redSr.rsd}` }),
    ]);
    expect(dugmici[0].text).toBe(`Zadrži moju (950 ${redSr.rsd})`);
    for (const dugme of dugmici) expect(jeOnemoguceno(dugme.tag)).toBe(false);
  });

  test("the price field holds the person's value 950, is invalid and points at the box", () => {
    const polje = mora(
      polja(red).find((tag) => tag.includes("data-cena-polje")),
      "no price field",
    );
    expect(attr(polje, "value")).toBe("950");
    expect(attr(polje, "aria-invalid")).toBe("true");
    const opisId = mora(attr(polje, "aria-describedby"), "the price field is not described by the box");
    expect(attr(prviTag(kutija), "id")).toBe(opisId);
    expect(attr(polje, "aria-label")).toBe(fmt(redSr.cena, { naziv: PRSUT }));
    expect(jeOnemoguceno(polje)).toBe(false);
    // The other rows are calm: no conflict, no invalid price.
    expect(count(html, "data-konflikt=")).toBe(1);
    expect(count(html, 'aria-invalid="true"')).toBe(1);
  });

  test("the row badge says who is editing it: Marko Ilić uređuje (once, only on this row)", () => {
    const oznaka = elementSaTragom(red, "span", 'data-prisustvo-red=""');
    expect(tekst(oznaka)).toBe(fmt(prisustvo.naArtiklu.jedan, { imena: MARKO }));
    expect(tekst(oznaka)).toBe(`${MARKO} uređuje`);
    expect(count(html, "data-prisustvo-red=")).toBe(1);
    expect(sveSakriveno(oznaka, "row badge")).toBe(1);
  });

  test("the header group names both colleagues in the plural form, with initials hidden from screen readers", () => {
    expect(count(html, "data-prisustvo-zaglavlje=")).toBe(1);
    const grupa = elementSaTragom(html, "p", 'data-prisustvo-zaglavlje=""');
    expect(attr(prviTag(grupa), "role")).toBe("group");
    expect(attr(prviTag(grupa), "aria-label")).toBe(prisustvo.oznaka);
    const imena = fmt(prisustvo.dvoje, { a: JELENA, b: MARKO });
    expect(tekst(grupa).endsWith(fmt(prisustvo.uredjuje.vise, { imena }))).toBe(true);
    expect(fmt(prisustvo.uredjuje.vise, { imena })).toBe(`Još uređuju: ${JELENA} i ${MARKO}`);
    // The initials are decoration: their own span is aria-hidden and the names are said in words.
    const inicijali = elementSaTragom(grupa, "span", 'aria-hidden="true"');
    expect(tekst(inicijali)).toBe("JK MI");
    expect(tekst(grupa)).toBe(`JK MI Još uređuju: ${JELENA} i ${MARKO}`);
  });

  test("the save state says not saved, a conflict offers no Pokušaj ponovo but Idi na izbor (the choice is in the field)", () => {
    const seam = elementSaTragom(html, "div", 'data-sav-objave="');
    expect(attr(prviTag(seam), "data-sav-objave")).toBe("izmene");
    const stanje = elementSaTragom(seam, "span", 'data-cuvanje="');
    expect(attr(prviTag(stanje), "data-cuvanje")).toBe("greska");
    expect(tekst(stanje)).toBe(zaj.cuvanje.nijeSacuvano);
    expect(attr(prviTag(stanje), "role")).toBe("status");
    // Nowhere in the editor: not in the seam, not in the row, not in the box. The seam leads to the choice.
    expect(dugmad(seam).map((dugme) => dugme.text)).toEqual([konfliktSr.idiNaIzbor]);
    expect(attr(dugmad(seam)[0].tag, "data-idi-na-konflikt")).toBe("");
    expect(dugmad(html).map((dugme) => dugme.text)).not.toContain(zaj.stanja.pokusajPonovo);
    expect(dugmad(html).map((dugme) => dugme.text)).not.toContain(redSr.pokusajPonovo);
  });

  test("no dialog is open, and the page has one h1", () => {
    expect(html).not.toContain('role="dialog"');
    expect(naslovi(html, 1)).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// F. The default izlog and the never-published one: the Verzije button
// -----------------------------------------------------------------------------

describe("K18 F: the header of the default izlog", () => {
  test("no dialog is open; the published menu has a Verzije button with a description; Objavi is open", () => {
    const html = izlog();
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("data-prisustvo-zaglavlje");
    expect(html).not.toContain("data-nacrt-iz");
    expect(html).not.toContain("data-prisustvo-red");
    expect(html).not.toContain("data-konflikt");
    expect(count(html, "data-verzije-dugme=")).toBe(1);
    const dugme = dugmeSaTragom(html, `\\sdata-verzije-dugme=""`);
    expect(dugme.text).toBe(o.verzije.dugme);
    expect(o.verzije.dugme).toBe("Verzije");
    expect(attr(dugme.tag, "title")).toBe(o.verzije.dugmeOznaka);
    expect(jeOnemoguceno(dugme.tag)).toBe(false);
    expect(attr(dugme.tag, "type")).toBe("button");
    expect(sveSakriveno(mora(/<button\b[^>]*\sdata-verzije-dugme=""[^>]*>[\s\S]*?<\/button>/.exec(html), "no button")[0], "Verzije")).toBe(1);

    const objavi = dugmeSaTragom(html, `\\sdata-objavi=""`);
    expect(objavi.text).toBe(zag.objavi);
    expect(jeOnemoguceno(objavi.tag)).toBe(false);
    expect(attr(objavi.tag, "title")).toBeUndefined();
  });

  test("a menu that was never published (stanje=prazno) has no Verzije button, and no dialog", () => {
    const html = izlog({ stanje: "prazno" });
    expect(html).not.toContain("data-verzije-dugme");
    expect(dugmad(html).map((dugme) => dugme.text)).not.toContain(o.verzije.dugme);
    expect(html).not.toContain('role="dialog"');
    expect(dugmad(html).map((dugme) => dugme.text)).toContain(zag.objavi);
  });
});

// -----------------------------------------------------------------------------
// G. The editor on its own: rights, a restored draft, someone on the open article
// -----------------------------------------------------------------------------

describe("K18 G: the editor by rights", () => {
  test("a person who may not publish: Objavi is disabled and says why (K10 kept); the person who may has it open", () => {
    const bez = urednik(podaciSrednji({ kontekst: { mozeObjavu: false } }));
    const dugme = dugmeSaTragom(bez, `\\sdata-objavi=""`);
    expect(jeOnemoguceno(dugme.tag)).toBe(true);
    expect(attr(dugme.tag, "title")).toBe(zag.bezObjave);
    expect(dugme.text).toBe(zag.objavi);

    const sa = urednik(podaciSrednji());
    const otvoreno = dugmeSaTragom(sa, `\\sdata-objavi=""`);
    expect(jeOnemoguceno(otvoreno.tag)).toBe(false);
    expect(attr(otvoreno.tag, "title")).toBeUndefined();
  });

  test("versions for a person who may not restore: the list and the live badge, no Vrati kao nacrt, no Odbaci, and the reason", () => {
    const html = urednik(podaciSrednji({ kontekst: { mozeObjavu: false } }), { pocetno: { verzije: { verzije: VERZIJE_PROBE } } });
    const d = dijalog(html);
    expect(tekst(d)).toContain(v.bezDozvole);
    const stavke = sviElementi(d, "li", `\\sdata-verzija="\\d+"`);
    expect(stavke.map((stavka) => attr(prviTag(stavka), "data-verzija"))).toEqual(["3", "2", "1"]);
    expect(tekst(d)).toContain(v.uzivo);
    expect(d).not.toContain("data-verzija-vrati");
    expect(d).not.toContain("data-verzija-odbaci");
    expect(dugmad(d).map((dugme) => dugme.text)).toEqual([ob.zatvori]);
    expect(tekst(d)).not.toContain(v.vrati);
    expect(tekst(d)).not.toContain(v.odbaci);

    // The same list for a person who may: the live one (the draft is dirty) and the older ones have their buttons.
    const sMogucnoscu = dijalog(urednik(podaciSrednji(), { pocetno: { verzije: { verzije: VERZIJE_PROBE } } }));
    expect(count(sMogucnoscu, "data-verzija-vrati=")).toBe(2);
    expect(count(sMogucnoscu, "data-verzija-odbaci=")).toBe(1);
    expect(tekst(sMogucnoscu)).not.toContain(v.bezDozvole);
  });

  test("a clean draft has nothing to discard: the live version has no Odbaci, the older ones still have Vrati", () => {
    const d = dijalog(verzijeDijalog({ verzije: VERZIJE_PROBE, status: { stanje: "clean" } }));
    expect(d).not.toContain("data-verzija-odbaci");
    expect(count(d, "data-verzija-vrati=")).toBe(2);
    expect(tekst(d)).not.toContain(v.odbaci);
  });

  test("a version made from another one says so, one without a name is a member of the team, an unchanged one says it changed the look", () => {
    const d = dijalog(verzijeDijalog({ verzije: VERZIJE_PROBE }));
    const stavke = sviElementi(d, "li", `\\sdata-verzija="\\d+"`);
    expect(tekst(stavke[1])).toContain(fmt(v.iz, { broj: 1 }));
    expect(tekst(stavke[1])).toContain(` · ${v.nepoznato}`);
    expect(tekst(stavke[1])).toContain(v.bezPromenaPonude);
    expect(tekst(stavke[0])).not.toContain(v.iz.split("{")[0]);
    expect(tekst(stavke[0])).toContain(mnozina(ob.cene, 2));
    expect(tekst(stavke[2])).toContain(mnozina(ob.novi, 5));
    expect(tekst(stavke[2])).toContain(` · ${MARKO}`);
  });

  test("a menu without versions (or still loading) says so, with no list and no buttons to restore", () => {
    const prazno = dijalog(verzijeDijalog({ verzije: { uzivo: null, verzije: [] } }));
    expect(tekst(prazno)).toContain(v.prazno);
    expect(prazno).not.toContain("data-verzija=");
    expect(bezTagova(naslovi(prazno, 3)[0])).toBe(v.prazno);

    const ucitava = dijalog(verzijeDijalog());
    expect(attr(prviTag(elementSaTragom(ucitava, "div", 'data-verzije-korak="')), "data-verzije-korak")).toBe("ucitava");
    expect(tekst(ucitava)).toContain(v.ucitava);
    expect(ucitava).toContain('data-stanje="ucitavanje"');
    expect(ucitava).not.toContain("data-verzija=");
  });
});

describe("K18 H: a draft made from a restored version", () => {
  const html = urednik(podaciSrednji({ status: { stanje: "dirty", vracenoIz: 5 } }));

  test("the header says Nacrt iz verzije 5, with its explanation in the title and for screen readers", () => {
    expect(count(html, "data-nacrt-iz=")).toBe(1);
    const oznaka = elementSaTragom(html, "span", 'data-nacrt-iz="5"');
    expect(attr(prviTag(oznaka), "title")).toBe(o.nacrtIzOpis);
    expect(tekst(oznaka)).toBe(`${fmt(o.nacrtIz, { broj: 5 })} ${o.nacrtIzOpis}`);
    expect(fmt(o.nacrtIz, { broj: 5 })).toBe("Nacrt iz verzije 5");
    // The title is for the mouse; screen readers get the same explanation as text.
    expect(tekst(elementSaTragom(oznaka, "span", 'class="sr-only"'))).toBe(o.nacrtIzOpis);
    expect(sveSakriveno(oznaka, "nacrt iz")).toBe(1);
  });

  test("it is shown only while the draft is unpublished: a clean draft or no restore shows nothing", () => {
    expect(urednik(podaciSrednji({ status: { stanje: "clean", vracenoIz: 5 } }))).not.toContain("data-nacrt-iz");
    expect(urednik(podaciSrednji({ status: { stanje: "dirty", vracenoIz: null } }))).not.toContain("data-nacrt-iz");
    expect(urednik(podaciSrednji({ status: { stanje: "dirty" } }))).not.toContain("data-nacrt-iz");
  });

  test("the review remembers it: Objavi names the version the draft came from", () => {
    const d = dijalog(
      renderToStaticMarkup(
        <ObjavaModal
          otvoreno
          onOtvoreno={nista}
          status={statusNacrta({ vracenoIz: 5 })}
          cuvanje={SACUVANO}
          sada={IZLOG_SADA}
          onPokusajCuvanje={nista}
          nazivArtikla={() => null}
          onPregled={() => Promise.reject(new Error("must not run"))}
          onObjavi={() => Promise.reject(new Error("must not run"))}
          onIdiNaArtikal={nista}
          onOtvoriPrevode={null}
          onPregledNacrta={nista}
          pocetno={{ pregled: pregledProbe() }}
        />,
      ),
    );
    const sekcija = elementSaTragom(d, "section", 'data-objava-posledice=""');
    expect(tekst(sekcija)).toContain(`${fmt(o.nacrtIz, { broj: 5 })}.`);
    expect(tekst(elementSaTragom(modal(), "section", 'data-objava-posledice=""'))).not.toContain(fmt(o.nacrtIz, { broj: 5 }));
  });
});

describe("K18 I: someone on the open article", () => {
  const marko: StudioPrisutan = { id: "u-marko", ime: MARKO, entitet: { vrsta: "article", key: mora(srednji.snapshot.articles.find((a) => a.name === GIBANICA)?.key, "no Gibanica") } };
  const gibanicaKey = mora(marko.entitet?.key, "no key");

  /** The editor with the detail of Gibanica open. */
  function sDetaljem(prisutni: StudioPrisutan[] | undefined): string {
    const podaci: StudioPodaci = {
      ...podaciSrednji({ prisustvo: prisutni }),
      detalj: mora(detaljIzSnapshota(srednji.snapshot, gibanicaKey), "no detail of Gibanica"),
    };
    return urednik(podaci, { otvorenArtikal: gibanicaKey, onOtvoriArtikal: nista });
  }

  test("the strip: a quiet status that names the person, says nothing is locked and that a conflict asks", () => {
    const html = sDetaljem([marko]);
    expect(count(html, "data-prisustvo-detalj=")).toBe(1);
    const traka = elementSaTragom(html, "div", 'data-prisustvo-detalj=""');
    expect(attr(prviTag(traka), "role")).toBe("status");
    expect(tekst(traka)).toBe(`${fmt(prisustvo.detalj.jedan, { imena: MARKO })} ${prisustvo.detaljOpis}`);
    expect(sveSakriveno(traka, "strip")).toBe(1);
    // The detail is open (its h1 is the article), and the strip is inside it.
    const detalj = elementSaTragom(html, "article", "data-detalj-artikla=");
    expect(detalj).toContain("data-prisustvo-detalj");
    expect(bezTagova(mora(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(detalj), "no h1")[1])).toBe(GIBANICA);
    // The list below the detail shows the same person on the row.
    expect(tekst(elementSaTragom(redArtikla(html, GIBANICA), "span", 'data-prisustvo-red=""'))).toBe(fmt(prisustvo.naArtiklu.jedan, { imena: MARKO }));
  });

  test("two people on the article: the verb is in the plural; someone elsewhere does not make the strip", () => {
    const html = sDetaljem([
      marko,
      { id: "u-jelena", ime: JELENA, entitet: marko.entitet },
      { id: "u-ana", ime: ANA, entitet: { vrsta: "article", key: "neki-drugi-artikal" } },
    ]);
    const traka = elementSaTragom(html, "div", 'data-prisustvo-detalj=""');
    expect(tekst(traka)).toBe(`${fmt(prisustvo.detalj.vise, { imena: fmt(prisustvo.dvoje, { a: JELENA, b: MARKO }) })} ${prisustvo.detaljOpis}`);
    expect(tekst(traka)).not.toContain(ANA);
    // The singular and the plural sentence are different sentences.
    expect(prisustvo.detalj.vise).not.toBe(prisustvo.detalj.jedan);
    // The header still counts everyone in the editor, once.
    expect(tekst(elementSaTragom(html, "p", 'data-prisustvo-zaglavlje=""'))).toContain(
      fmt(prisustvo.uredjuje.vise, { imena: fmt(prisustvo.jos, { imena: `${ANA}, ${JELENA}`, n: 1 }) }),
    );
  });

  test("nobody on this article: no strip (someone on another article, or on the page, or nobody at all)", () => {
    expect(sDetaljem(undefined)).not.toContain("data-prisustvo-detalj");
    expect(sDetaljem([])).not.toContain("data-prisustvo-detalj");
    expect(sDetaljem([{ id: "u-ana", ime: ANA, entitet: { vrsta: "article", key: "neki-drugi-artikal" } }])).not.toContain("data-prisustvo-detalj");
    expect(sDetaljem([{ id: "u-jelena", ime: JELENA, entitet: { vrsta: "page", key: glavnaStranica.key } }])).not.toContain("data-prisustvo-detalj");
    expect(sDetaljem([{ id: "u-nema", ime: null, entitet: null }])).not.toContain("data-prisustvo-detalj");
  });

  test("the header lists each person once, shows at most three initials, counts the rest, and calls a nameless person a member of the team", () => {
    const grupa = (prisutni: StudioPrisutan[]) => elementSaTragom(urednik(podaciSrednji({ prisustvo: prisutni })), "p", 'data-prisustvo-zaglavlje=""');
    // Marko is on two things: he counts once, and the verb is singular.
    const jedan = grupa([marko, { id: marko.id, ime: MARKO, entitet: { vrsta: "page", key: glavnaStranica.key } }]);
    expect(tekst(jedan)).toBe(`MI ${fmt(prisustvo.uredjuje.jedan, { imena: MARKO })}`);

    const cetvoro = grupa([
      { id: "u1", ime: "Dragan Jović", entitet: null },
      { id: "u2", ime: "Ivana Savić", entitet: null },
      { id: "u3", ime: JELENA, entitet: null },
      { id: "u4", ime: MARKO, entitet: null },
    ]);
    expect(tekst(elementSaTragom(cetvoro, "span", 'aria-hidden="true"'))).toBe("DJ IS JK");
    expect(tekst(cetvoro)).toBe(
      `DJ IS JK ${fmt(prisustvo.uredjuje.vise, { imena: fmt(prisustvo.jos, { imena: "Dragan Jović, Ivana Savić", n: 2 }) })}`,
    );

    const bezImena = grupa([{ id: "u9", ime: null, entitet: null }]);
    expect(tekst(bezImena)).toContain(fmt(prisustvo.uredjuje.jedan, { imena: prisustvo.clanTima }));
  });
});

// -----------------------------------------------------------------------------
// J. The review dialog on its own: states the izlog never has
// -----------------------------------------------------------------------------

describe("K18 J: Objavi on its own", () => {
  test("a menu that was never published: the first publication, the safety sentence for it, and Objavi is open without a reason", () => {
    const d = dijalog(
      modal({
        pregled: { stanje: "never_published", objavljenaVerzija: null, sazetak: { ...SAZETAK_NULA, novi: 12 } },
        status: { stanje: "never_published", objavljenaVerzija: null, objavljenoU: null },
      }),
    );
    const sekcija = elementSaTragom(d, "section", 'data-objava-posledice=""');
    expect(tekst(sekcija)).toContain(ob.prvaObjava);
    const redovi = sviElementi(sekcija, "li", `\\sdata-posledica="[^"]*"`);
    expect(redovi.map((red) => attr(prviTag(red), "data-posledica"))).toEqual(["novi"]);
    expect(tekst(redovi[0])).toBe(mnozina(ob.novi, 12));
    expect(tekst(elementSaTragom(d, "p", 'data-objava-sigurnost=""'))).toBe(m.sigurnostPrva);
    expect(tekst(d)).not.toContain(fmt(m.sigurnostVerzija, { broj: 3 }));

    const { dugme, razlogId } = objaviDugme(d);
    expect(jeOnemoguceno(dugme.tag)).toBe(false);
    expect(razlogId).toBeUndefined();
    expect(d).not.toContain("data-objava-razlog");
    expect(d).not.toContain("data-objava-potvrda");
  });

  test("nothing changes for guests: the statement replaces the list, and Objavi waits with its reason", () => {
    const d = dijalog(
      modal({
        pregled: { stanje: "clean", menjaSe: false, sazetak: SAZETAK_NULA },
        status: { stanje: "clean" },
      }),
    );
    const sekcija = elementSaTragom(d, "section", 'data-objava-posledice=""');
    const poruka = elementSaTragom(sekcija, "p", 'role="status"');
    expect(tekst(poruka)).toBe(ob.bezPromena);
    expect(sekcija).not.toContain("<ul");
    expect(sekcija).not.toContain("data-posledica=");
    const { dugme, razlog } = objaviDugme(d);
    expect(jeOnemoguceno(dugme.tag)).toBe(true);
    expect(tekst(mora(razlog, "no reason"))).toBe(m.razlozi.bezPromena);
    expect(attr(prviTag(mora(razlog, "no reason")), "data-objava-razlog")).toBe("bez-promena");
  });

  test("changes that are not about the menu itself (look, settings) say so instead of an empty list", () => {
    const d = dijalog(modal({ pregled: { sazetak: SAZETAK_NULA } }));
    const sekcija = elementSaTragom(d, "section", 'data-objava-posledice=""');
    expect(sviElementi(sekcija, "li", "")).toHaveLength(1);
    expect(tekst(sekcija)).toContain(ob.ostalo);
    expect(sekcija).not.toContain("data-posledica=");
    expect(jeOnemoguceno(objaviDugme(d).dugme.tag)).toBe(false);
  });

  test("more changed prices than the review lists: the rest is counted in the right plural form", () => {
    const promene = [
      { artikalKey: "a1", naziv: "Prva", pre: 100, posle: 120 },
      { artikalKey: "a2", naziv: "Druga", pre: 200, posle: null },
      { artikalKey: "a3", naziv: "Treća", pre: null, posle: 300 },
    ];
    // [changed prices in all, the form of the rest (all - 3): 4 few, 5 many, 21 one, 22 few]
    for (const [ukupno, oblik] of [
      [7, "few"],
      [8, "many"],
      [24, "one"],
      [25, "few"],
    ] as const) {
      const lista = elementSaTragom(dijalog(modal({ pregled: { sazetak: { ...SAZETAK_NULA, cene: ukupno }, promeneCena: promene } })), "details", 'data-objava-cene=""');
      const stavke = sviElementi(lista, "li", "");
      expect(stavke, String(ukupno)).toHaveLength(4);
      expect(tekst(stavke[3]), String(ukupno)).toBe(fmt(m.posledice.josCena[oblik], { n: ukupno - 3 }));
      // A price that is not there says so in words, never an empty number.
      expect(tekst(stavke[1])).toBe(`Druga ${m.posledice.cenaPre} 200 ${menuStudioSr.red.rsd} ${m.posledice.cenaPosle} ${m.posledice.bezCene}`);
      expect(tekst(stavke[2])).toBe(`Treća ${m.posledice.cenaPre} ${m.posledice.bezCene} ${m.posledice.cenaPosle} 300 ${menuStudioSr.red.rsd}`);
    }
    // All the changed prices are listed: no "and N more" line.
    const sve = elementSaTragom(dijalog(modal({ pregled: { sazetak: { ...SAZETAK_NULA, cene: 3 }, promeneCena: promene } })), "details", 'data-objava-cene=""');
    expect(sviElementi(sve, "li", "")).toHaveLength(3);
  });

  test("a person who may not publish is told so; a menu too big for one publication is told so; both wait", () => {
    const bezDozvole = dijalog(modal({ pregled: { mozeObjavu: false } }));
    expect(tekst(elementSaTragom(bezDozvole, "p", 'role="status"'))).toBe(ob.bezDozvole);
    expect(jeOnemoguceno(objaviDugme(bezDozvole).dugme.tag)).toBe(true);
    // No dedicated reason line for lack of rights: the sentence above is the reason.
    expect(bezDozvole).not.toContain("data-objava-razlog");

    const prevelik = dijalog(modal({ pregled: { prevelik: true } }));
    expect(attr(prviTag(elementSaTragom(prevelik, "p", `role="alert"`)), "role")).toBe("alert");
    expect(tekst(elementSaTragom(prevelik, "p", `role="alert"`))).toBe(ob.prevelik);
    expect(jeOnemoguceno(objaviDugme(prevelik).dugme.tag)).toBe(true);
    expect(tekst(mora(objaviDugme(prevelik).razlog, "no reason"))).toBe(m.razlozi.prevelik);
  });

  test("own edits still saving: the review waits for them (loading text), and Objavi names the reason", () => {
    const ceka = modal({ cuvanje: { stanje: "cuva-se", neuspelo: 0, poslednjeU: null }, bezPocetnog: true });
    expect(attr(prviTag(elementSaTragom(dijalog(ceka), "div", 'data-objava="')), "data-objava")).toBe("ucitava");
    expect(tekst(dijalog(ceka))).toContain(m.cekaCuvanje);
    expect(tekst(dijalog(ceka))).not.toContain(ob.ucitava);
    expect(jeOnemoguceno(objaviDugme(dijalog(ceka)).dugme.tag)).toBe(true);

    const ucitava = modal({ bezPocetnog: true });
    expect(tekst(dijalog(ucitava))).toContain(ob.ucitava);
    expect(tekst(dijalog(ucitava))).not.toContain(m.cekaCuvanje);

    // A review is already there but an edit started saving after it: the button says why.
    const cuvaSe = dijalog(modal({ cuvanje: { stanje: "cuva-se", neuspelo: 0, poslednjeU: null } }));
    expect(jeOnemoguceno(objaviDugme(cuvaSe).dugme.tag)).toBe(true);
    expect(tekst(mora(objaviDugme(cuvaSe).razlog, "no reason"))).toBe(m.razlozi.cuvaSe);
  });

  test("edits that failed to save are named and will not be published; a retry is offered unless they are conflicts", () => {
    const greska: AutosaveZbir = { stanje: "greska", neuspelo: 3, poslednjeU: null };
    // Three failed, one of them a conflict: the other two can be retried; the conflict waits for a choice.
    const sPokusajem = dijalog(modal({ cuvanje: greska, konflikata: 1 }));
    const upozorenje = mora(
      sviElementi(sPokusajem, "div", `\\srole="alert"`).find((kandidat) => tekst(kandidat).includes(fmt(m.nesacuvano.few, { n: 2 }))),
      "no alert about unsaved edits",
    );
    expect(tekst(upozorenje)).toBe(`${fmt(m.nesacuvano.few, { n: 2 })} ${m.pokusajCuvanje}`);
    expect(dugmad(upozorenje).map((dugme) => dugme.text)).toEqual([m.pokusajCuvanje]);
    expect(jeOnemoguceno(dugmad(upozorenje)[0].tag)).toBe(false);
    const konflikt = elementSaTragom(sPokusajem, "div", 'data-objava-konflikti=""');
    expect(tekst(konflikt)).toBe(fmt(m.konflikti.one, { n: 1 }));
    expect(count(sPokusajem, 'role="alert"')).toBe(2);
    // Not "Nacrt je sačuvan." while something did not save.
    expect(tekst(sPokusajem)).toContain(m.opisNesacuvano);
    expect(tekst(sPokusajem)).not.toContain(ob.opis);
    // A conflict locks Objavi meni, with its reason.
    expect(jeOnemoguceno(objaviDugme(sPokusajem).dugme.tag)).toBe(true);
    expect(tekst(mora(objaviDugme(sPokusajem).razlog, "no reason"))).toBe(m.razlozi.konflikt);

    // Every failed edit is a conflict: no retry, no unsaved-edits notice, only the choice.
    const samoKonflikti = dijalog(modal({ cuvanje: { stanje: "greska", neuspelo: 2, poslednjeU: null }, konflikata: 2 }));
    expect(tekst(samoKonflikti)).toContain(fmt(m.konflikti.few, { n: 2 }));
    expect(tekst(samoKonflikti)).not.toContain(fmt(m.nesacuvano.few, { n: 2 }));
    expect(tekst(samoKonflikti)).not.toContain(m.pokusajCuvanje);

    // Failed saves alone do not lock publishing (BLOCKED K18-2): the saved draft goes out.
    const samoGreske = dijalog(modal({ cuvanje: { stanje: "greska", neuspelo: 1, poslednjeU: null }, konflikata: 0 }));
    expect(tekst(samoGreske)).toContain(fmt(m.nesacuvano.one, { n: 1 }));
    expect(jeOnemoguceno(objaviDugme(samoGreske).dugme.tag)).toBe(false);
  });

  test("the unsaved edits are counted in the form that agrees with the number", () => {
    for (const [n, oblik] of [
      [1, "one"],
      [2, "few"],
      [4, "few"],
      [5, "many"],
      [11, "many"],
      [21, "one"],
      [22, "few"],
    ] as const) {
      const d = dijalog(modal({ cuvanje: { stanje: "greska", neuspelo: n, poslednjeU: null }, konflikata: 0 }));
      expect(paragrafi(d), String(n)).toContain(fmt(m.nesacuvano[oblik], { n }));
      const k = dijalog(modal({ cuvanje: { stanje: "greska", neuspelo: n, poslednjeU: null }, konflikata: n }));
      expect(paragrafi(k), String(n)).toContain(fmt(m.konflikti[oblik], { n }));
    }
  });

  test("the error count and the warnings still to check are counted in the form that agrees with the number", () => {
    const greske = (n: number) => Array.from({ length: n }, (_, i) => ({ kod: "price_missing", artikalKey: `x${i}` }));
    const upozorenja = (n: number) => Array.from({ length: n }, (_, i) => ({ kod: "combo_price_check", artikalKey: `y${i}`, jezik: null, broj: null }));
    for (const [n, oblik] of [
      [1, "one"],
      [2, "few"],
      [5, "many"],
      [12, "many"],
      [21, "one"],
      [23, "few"],
    ] as const) {
      const sekcija = elementSaTragom(dijalog(modal({ pregled: { greske: greske(n), upozorenja: upozorenja(n) } })), "section", 'data-objava-greske=""');
      expect(sviElementi(sekcija, "li", `\\sdata-problem-artikal="[^"]*"`), String(n)).toHaveLength(n);
      expect(paragrafi(sekcija), String(n)).toContain(`${fmt(m.greske.broj[oblik], { n })}. ${ob.greskeOpis}`);
      expect(paragrafi(sekcija), String(n)).toContain(fmt(m.greske.upozorenjaKasnije[oblik], { n }));
    }
  });

  test("warnings of the whole publication: the language sentence in each plural form, the fallback without a number, an unknown code as it is", () => {
    const jezik = (broj: number | null, kod = "translation_missing", jezikKod: string | null = "de") => ({ kod, artikalKey: null, jezik: jezikKod, broj });
    for (const [n, oblik] of [
      [1, "one"],
      [3, "few"],
      [7, "many"],
      [21, "one"],
    ] as const) {
      const sekcija = elementSaTragom(dijalog(modal({ pregled: { upozorenja: [jezik(n)] } })), "section", 'data-objava-upozorenja=""');
      expect(tekst(elementSaTragom(sekcija, "li", 'data-problem-objave="translation_missing"')), String(n)).toBe(fmt(m.upozorenja.jezik[oblik], { jezik: "Nemački", n }));
      // No way to the translations from here (the editor passes none when no language is on).
      expect(dugmad(sekcija)).toHaveLength(0);
    }
    const bezBroja = elementSaTragom(dijalog(modal({ pregled: { upozorenja: [jezik(null)] } })), "section", 'data-objava-upozorenja=""');
    expect(tekst(elementSaTragom(bezBroja, "li", 'data-problem-objave="translation_missing"'))).toBe(`${izdanja.translation_missing} (DE)`);
    expect(dugmad(bezBroja)).toHaveLength(0);
    const bezJezika = elementSaTragom(dijalog(modal({ pregled: { upozorenja: [jezik(null, "translation_missing", null)] } })), "section", 'data-objava-upozorenja=""');
    expect(tekst(elementSaTragom(bezJezika, "li", 'data-problem-objave="translation_missing"'))).toBe(izdanja.translation_missing);
    // A code the dictionary does not know is shown as it is, never "undefined".
    const nepoznat = elementSaTragom(dijalog(modal({ pregled: { upozorenja: [jezik(null, "nepoznat_kod", null)] } })), "section", 'data-objava-upozorenja=""');
    expect(tekst(elementSaTragom(nepoznat, "li", 'data-problem-objave="nepoznat_kod"'))).toBe("nepoznat_kod");
    // With the way to the translations, the button is there.
    const sPrevodima = elementSaTragom(dijalog(modal({ pregled: { upozorenja: [jezik(2)] }, prevodi: true })), "section", 'data-objava-upozorenja=""');
    expect(dugmad(sPrevodima).map((dugme) => dugme.text)).toEqual([m.upozorenja.otvoriPrevode]);
    // The confirmation is there whenever warnings are and no error is, and Objavi waits for it.
    expect(sPrevodima).toContain("data-objava-potvrda");
  });

  test("the loading, the error and the unpublished states have no stray icon: every svg of the dialog is hidden", () => {
    for (const html of [
      modal(),
      modal({ bezPocetnog: true }),
      modal({ pregled: { stanje: "clean", menjaSe: false } }),
      modal({ cuvanje: { stanje: "greska", neuspelo: 3, poslednjeU: null } }),
      modal({ pregled: { greske: [{ kod: "price_missing", artikalKey: "x1" }], upozorenja: [] } }),
    ]) {
      sveSakriveno(dijalog(html), "standalone modal");
    }
  });

  test("a review with an error that the server could not place: a plain line without a button; with unnamed articles", () => {
    const d = dijalog(
      modal({
        pregled: {
          greske: [
            { kod: "price_missing", artikalKey: "x1" },
            { kod: "name_missing", artikalKey: null },
          ],
          ciljevi: { x1: { naziv: "  ", stranicaKey: null, stranica: null, roomService: false } },
        },
      }),
    );
    const sekcija = elementSaTragom(d, "section", 'data-objava-greske=""');
    // x1 has no name anywhere: the generic one; no page: it is on no page; the other error is not an article.
    const stavke = sviElementi(sekcija, "li", "");
    expect(stavke).toHaveLength(2);
    expect(tekst(stavke[0])).toBe([m.greske.bezNaziva, m.greske.bezStranice, izdanja.price_missing, m.greske.idiNaArtikal].join(" "));
    expect(attr(dugmad(stavke[0])[0].tag, "aria-label")).toBe(fmt(m.greske.idiNaArtikalOznaka, { naziv: m.greske.bezNaziva }));
    expect(tekst(stavke[1])).toBe(izdanja.name_missing);
    expect(dugmad(stavke[1])).toHaveLength(0);
    expect(tekst(sekcija)).toContain(mnozina(m.greske.broj, 2));

    // An article in Room service only.
    const rs = dijalog(modal({ pregled: { greske: [{ kod: "price_missing", artikalKey: "x2" }], ciljevi: { x2: { naziv: "Probno jelo", stranicaKey: null, stranica: null, roomService: true } } } }));
    expect(tekst(elementSaTragom(rs, "li", 'data-problem-artikal="x2"'))).toBe(["Probno jelo", m.greske.roomService, izdanja.price_missing, m.greske.idiNaArtikal].join(" "));
    expect(tekst(elementSaTragom(rs, "section", 'data-objava-greske=""'))).toContain(mnozina(m.greske.broj, 1));
  });

  test("a stale review names who changed the draft: a colleague, a nameless member of the team, the person themself, or nobody", () => {
    const zastarelo = (poslednjaIzmena: StudioStatusNacrta["poslednjaIzmena"]) =>
      paragrafi(elementSaTragom(dijalog(modal({ status: { revizija: 9, poslednjaIzmena } })), "div", 'data-objava-zastarelo=""'));
    // IZLOG_SADA is 18:27 in Belgrade.
    const minutPre = IZLOG_SADA - 60_000;
    const satPre = IZLOG_SADA - 3_600_000;
    expect(zastarelo({ ime: MARKO, ja: false, u: minutPre })).toEqual([
      m.zastarelo.naslov,
      fmt(m.zastarelo.poslednja, { ime: MARKO, kada: fmt(zag.danas, { vreme: "18:26" }) }),
      m.zastarelo.uputstvo,
    ]);
    expect(zastarelo({ ime: null, ja: false, u: satPre })).toEqual([
      m.zastarelo.naslov,
      fmt(m.zastarelo.poslednja, { ime: prisustvo.clanTima, kada: fmt(zag.danas, { vreme: "17:27" }) }),
      m.zastarelo.uputstvo,
    ]);
    // The person's own edit (a second tab): no name, "Vaša".
    expect(zastarelo({ ime: ANA, ja: true, u: minutPre })).toEqual([
      m.zastarelo.naslov,
      fmt(m.zastarelo.ja, { kada: fmt(zag.danas, { vreme: "18:26" }) }),
      m.zastarelo.uputstvo,
    ]);
    expect(zastarelo(null)).toEqual([m.zastarelo.naslov, m.zastarelo.uputstvo]);
    // Yesterday and earlier are dated, not "danas".
    const juce = zastarelo({ ime: MARKO, ja: false, u: IZLOG_SADA - 24 * 3_600_000 });
    expect(juce[1]).toBe(fmt(m.zastarelo.poslednja, { ime: MARKO, kada: fmt(zag.juce, { vreme: "18:27" }) }));
    const ranije = zastarelo({ ime: MARKO, ja: false, u: IZLOG_SADA - 5 * 24 * 3_600_000 });
    expect(ranije[1]).toBe(fmt(m.zastarelo.poslednja, { ime: MARKO, kada: fmt(zag.datum, { datum: "12. 10.", vreme: "18:27" }) }));
    // A review of the same revision is not stale.
    expect(dijalog(modal())).not.toContain("data-objava-zastarelo");
  });

  test("the reason under Objavi follows one order: stale, saving, too big, errors, no changes, warnings", () => {
    const greske = [{ kod: "price_missing", artikalKey: "x1" }];
    const upozorenja = [{ kod: "translation_missing", artikalKey: null, jezik: "en", broj: 2 }];
    const cuvaSe: AutosaveZbir = { stanje: "cuva-se", neuspelo: 0, poslednjeU: null };
    const sve = { greske, upozorenja, prevelik: true, menjaSe: false };
    const slucajevi: [string, string, string][] = [
      [modal({ pregled: sve, status: { revizija: 9 }, cuvanje: cuvaSe }), "zastarelo", m.razlozi.zastarelo],
      [modal({ pregled: sve, cuvanje: cuvaSe }), "cuva-se", m.razlozi.cuvaSe],
      [modal({ pregled: sve }), "prevelik", m.razlozi.prevelik],
      [modal({ pregled: { greske, upozorenja, menjaSe: false } }), "greske", m.razlozi.greske],
      [modal({ pregled: { upozorenja, menjaSe: false } }), "bez-promena", m.razlozi.bezPromena],
      [modal({ pregled: { upozorenja } }), "potvrda", m.razlozi.potvrda],
    ];
    for (const [html, kod, ocekivano] of slucajevi) {
      const { dugme, razlog } = objaviDugme(dijalog(html));
      expect(jeOnemoguceno(dugme.tag), kod).toBe(true);
      expect(attr(prviTag(mora(razlog, kod)), "data-objava-razlog"), kod).toBe(kod);
      expect(tekst(mora(razlog, kod)), kod).toBe(ocekivano);
    }
    // Without the right to publish nothing else matters: the sentence about the role is the reason.
    const bezPrava = dijalog(modal({ pregled: { ...sve, mozeObjavu: false }, status: { revizija: 9 }, cuvanje: cuvaSe }));
    expect(objaviDugme(bezPrava).razlog).toBeNull();
    expect(jeOnemoguceno(objaviDugme(bezPrava).dugme.tag)).toBe(true);
    expect(tekst(bezPrava)).toContain(ob.bezDozvole);
  });
});

// -----------------------------------------------------------------------------
// K. One h1 and decorative icons in every izlog state
// -----------------------------------------------------------------------------

const STANJA: [string, IzlogSearchParams][] = [
  ["default", {}],
  ["stanje=prazno", { stanje: "prazno" }],
  ["modal=objava", { modal: "objava" }],
  ["modal=objava-greske", { modal: "objava-greske" }],
  ["modal=objava-zastarelo", { modal: "objava-zastarelo" }],
  ["modal=verzije", { modal: "verzije" }],
  ["stanje=konflikt", { stanje: "konflikt" }],
];

describe("K18 K: every izlog state has exactly one visible h1", () => {
  for (const [ime, query] of STANJA) {
    test(`${ime}: one <h1>, with a text, not the screen-reader-only heading of a pane`, () => {
      const html = izlog(query);
      expect(count(html, "<h1")).toBe(1);
      const [naslov] = naslovi(html, 1);
      expect(tekst(naslov).length).toBeGreaterThan(0);
      const tag = mora(/<h1\b[^>]*>/.exec(html), "no h1 tag")[0];
      expect(tag).not.toContain("sr-only");
      // A dialog titles itself with an h2, never a second h1.
      if (html.includes('role="dialog"')) expect(naslovi(dijalog(html), 1)).toHaveLength(0);
    });
  }
});

describe("K18 M: references and ids of every izlog state", () => {
  for (const [ime, query] of STANJA) {
    test(`${ime}: ids are unique, and every aria-labelledby, aria-describedby and aria-controls points at an element that is there`, () => {
      const html = izlog(query);
      const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((match) => unesc(match[1]));
      const duplikati = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(duplikati).toEqual([]);
      const postojeci = new Set(ids);
      const bezCilja: string[] = [];
      for (const match of html.matchAll(/\s(aria-labelledby|aria-describedby|aria-controls)="([^"]*)"/g)) {
        for (const id of unesc(match[2]).split(/\s+/).filter(Boolean)) if (!postojeci.has(id)) bezCilja.push(`${match[1]}="${id}"`);
      }
      expect(bezCilja).toEqual([]);
    });

    test(`${ime}: every svg of the page is hidden from screen readers (the words carry the meaning)`, () => {
      expect(sveSakriveno(izlog(query), ime)).toBeGreaterThan(0);
    });
  }
});

describe("K18 N: the conflict pattern on its own", () => {
  const opis = (izmene: Partial<OpisKonflikta> = {}): OpisKonflikta => ({ sacuvano: "980 RSD", moja: "950 RSD", ista: false, drugi: null, ...izmene });
  const prikaz = (izOpisa: OpisKonflikta, ostalo: { id?: string; className?: string } = {}) =>
    renderToStaticMarkup(
      <KonfliktPolja
        id={ostalo.id}
        opis={izOpisa}
        tekst="saved-sentence"
        zadrziMoju="keep-mine"
        uzmiSacuvanu="take-saved"
        onZadrziMoju={nista}
        onUzmiSacuvanu={nista}
        className={ostalo.className}
      />,
    );

  test("different values and nobody else: the sentence, the promise that nothing is overwritten, two buttons", () => {
    const html = prikaz(opis(), { id: "polje-poruka" });
    expect(attr(prviTag(html), "role")).toBe("alert");
    expect(attr(prviTag(html), "id")).toBe("polje-poruka");
    expect(attr(prviTag(html), "data-konflikt")).toBe("");
    expect(attr(prviTag(html), "class")).toBe(KONFLIKT_KLASA);
    expect(paragrafi(html)).toEqual(["saved-sentence", konfliktSr.nistaPrepisano]);
    expect(html).not.toContain("data-konflikt-drugi");
    expect(dugmad(html).map((dugme) => dugme.text)).toEqual(["keep-mine", "take-saved"]);
  });

  test("others on the article: named once for one person, in the plural for two, with the promise after them", () => {
    const sJednim = opisKonflikta({ sacuvano: 980, pokusano: 950 }, tekstCene, [MARKO]);
    expect(sJednim.ista).toBe(false);
    expect(sJednim.sacuvano).toBe("980 RSD");
    expect(sJednim.moja).toBe("950 RSD");
    expect(sJednim.drugi).toBe(fmt(konfliktSr.drugi.jedan, { imena: MARKO }));
    expect(paragrafi(prikaz(sJednim))).toEqual(["saved-sentence", `${fmt(konfliktSr.drugi.jedan, { imena: MARKO })} ${konfliktSr.nistaPrepisano}`]);

    const sDvoje = opisKonflikta({ sacuvano: 980, pokusano: 950 }, tekstCene, [JELENA, MARKO]);
    expect(sDvoje.drugi).toBe(fmt(konfliktSr.drugi.vise, { imena: fmt(prisustvo.dvoje, { a: JELENA, b: MARKO }) }));
    const html = prikaz(sDvoje);
    expect(attr(prviTag(elementSaTragom(html, "p", "data-konflikt-drugi")), "data-konflikt-drugi")).toBe("");
    expect(paragrafi(html)[1]).toBe(`${sDvoje.drugi} ${konfliktSr.nistaPrepisano}`);
  });

  test("both wrote the same value: nothing to choose, one U redu", () => {
    const ista = opisKonflikta({ sacuvano: 980, pokusano: 980 }, tekstCene, [MARKO]);
    expect(ista.ista).toBe(true);
    const html = prikaz(ista, { id: "polje-poruka" });
    expect(attr(prviTag(html), "role")).toBe("alert");
    expect(attr(prviTag(html), "data-konflikt")).toBe("ista");
    expect(attr(prviTag(html), "id")).toBe("polje-poruka");
    expect(paragrafi(html)).toEqual([konfliktSr.ista]);
    expect(dugmad(html).map((dugme) => dugme.text)).toEqual([konfliktSr.uRedu]);
    expect(html).not.toContain("keep-mine");
    expect(html).not.toContain("data-konflikt-drugi");
  });

  test("a field can give the box its own classes (the price row does)", () => {
    const html = prikaz(opis(), { className: "klasa-polja" });
    expect(attr(prviTag(html), "class")).toBe("klasa-polja");
    expect(attr(prviTag(prikaz(opis({ ista: true }), { className: "klasa-polja" })), "class")).toBe("klasa-polja");
  });
});

describe("K18 O: the header on its own, at every width", () => {
  const zaglavlje = (izmene: Partial<ComponentProps<typeof StudioZaglavlje>> = {}): string =>
    renderToStaticMarkup(
      <StudioZaglavlje
        lokal="Demo restoran"
        rezim="Restoran"
        sirina="desktop"
        tab="ponuda"
        onTab={nista}
        panelId="panel-probe"
        cuvanje={SACUVANO}
        status={statusNacrta()}
        povezano
        mozeObjavu
        prikaziPregled
        onPregled={nista}
        onObjavi={nista}
        {...izmene}
      />,
    );
  const SIRINE = ["desktop", "siroko", "usko", "telefon"] as const;
  const marko = [{ id: "u-marko", ime: MARKO }];

  for (const sirina of SIRINE) {
    test(`${sirina}: Verzije, Nacrt iz verzije 5 and who else is here are each there once`, () => {
      const html = zaglavlje({ sirina, onVerzije: nista, prisutni: marko, status: statusNacrta({ vracenoIz: 5 }) });
      expect(attr(prviTag(html), "data-studio-zaglavlje")).toBe(sirina);
      expect(count(html, "data-verzije-dugme=")).toBe(1);
      expect(dugmeSaTragom(html, `\\sdata-verzije-dugme=""`).text).toBe(o.verzije.dugme);
      expect(count(html, "data-nacrt-iz=")).toBe(1);
      expect(tekst(elementSaTragom(html, "span", 'data-nacrt-iz="5"'))).toBe(`${fmt(o.nacrtIz, { broj: 5 })} ${o.nacrtIzOpis}`);
      expect(count(html, "data-prisustvo-zaglavlje=")).toBe(1);
      expect(tekst(elementSaTragom(html, "p", 'data-prisustvo-zaglavlje=""'))).toBe(`MI ${fmt(prisustvo.uredjuje.jedan, { imena: MARKO })}`);
      sveSakriveno(html, sirina);
    });

    test(`${sirina}: nothing of K18 shows without a published menu, a restore or colleagues`, () => {
      for (const html of [
        zaglavlje({ sirina }),
        zaglavlje({ sirina, onVerzije: null, prisutni: [], status: statusNacrta({ vracenoIz: null }) }),
        // A restored draft with no unpublished changes is the live version again: no mark.
        zaglavlje({ sirina, status: statusNacrta({ stanje: "clean", vracenoIz: 5 }) }),
      ]) {
        expect(html).not.toContain("data-verzije-dugme");
        expect(html).not.toContain("data-nacrt-iz");
        expect(html).not.toContain("data-prisustvo-zaglavlje");
      }
    });

    test(`${sirina}: Pokušaj ponovo only when failed saves can be retried (a conflict waits for a choice instead)`, () => {
      const greska: AutosaveZbir = { stanje: "greska", neuspelo: 1, poslednjeU: null };
      const bez = dugmad(zaglavlje({ sirina, cuvanje: greska })).map((dugme) => dugme.text);
      expect(bez).not.toContain(zaj.stanja.pokusajPonovo);
      const sa = dugmad(zaglavlje({ sirina, cuvanje: greska, onPonovo: nista })).map((dugme) => dugme.text);
      expect(sa).toContain(zaj.stanja.pokusajPonovo);
    });
  }

  test("Objavi stays the one primary action next to them: disabled with the reason for a person who may not publish", () => {
    for (const sirina of SIRINE) {
      const html = zaglavlje({ sirina, mozeObjavu: false, onVerzije: nista });
      const dugme = dugmeSaTragom(html, `\\sdata-objavi=""`);
      expect(jeOnemoguceno(dugme.tag), sirina).toBe(true);
      expect(attr(dugme.tag, "title"), sirina).toBe(zag.bezObjave);
      // Reading the old versions stays possible.
      expect(jeOnemoguceno(dugmeSaTragom(html, `\\sdata-verzije-dugme=""`).tag), sirina).toBe(false);
    }
  });
});

describe("K18 L: icons of the new components are decoration", () => {
  test("header: the Verzije button, the restored-draft mark and the presence group", () => {
    const zaglavlje = (html: string) => elementSaTragom(html, "div", "data-studio-zaglavlje=");
    const html = izlog({ stanje: "konflikt" });
    expect(sveSakriveno(zaglavlje(html), "header")).toBeGreaterThan(0);
    expect(sveSakriveno(elementSaTragom(html, "p", 'data-prisustvo-zaglavlje=""'), "presence")).toBe(0);
    expect(sveSakriveno(elementSaTragom(urednik(podaciSrednji({ status: { vracenoIz: 2 } })), "span", 'data-nacrt-iz="2"'), "nacrt iz")).toBe(1);
  });

  test("the conflict box and the row badge", () => {
    const html = izlog({ stanje: "konflikt" });
    const red = redArtikla(html, PRSUT);
    expect(sveSakriveno(elementSaTragom(red, "div", 'data-konflikt=""'), "conflict box")).toBe(0);
    expect(sveSakriveno(red, "the whole row")).toBeGreaterThan(0);
  });

  test("the three dialogs of the izlog", () => {
    for (const modalIme of ["objava", "objava-greske", "objava-zastarelo", "verzije"] as const) {
      expect(sveSakriveno(dijalog(izlog({ modal: modalIme })), `modal=${modalIme}`), modalIme).toBeGreaterThan(0);
    }
  });
});
