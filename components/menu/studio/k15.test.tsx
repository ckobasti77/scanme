// K15 render tests: the article detail. Server markup only (renderToStaticMarkup,
// no DOM), like k11.test.tsx: useSirina() answers "desktop" on the server, so the
// three-column layout renders, effects never run (the impact dialog stays in its
// loading state) and `@/components/ui/dialog` is replaced by a stand-in that
// renders an open dialog inline. The detail is rendered through the izlog
// (`fokus=artikal`, `fokus=varijante`) and on its own (DetaljArtikla with data
// built by detaljIzSnapshota). Texts come from the dictionaries; the only
// literals are fixture facts (invented names), marked where they are used.

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_ALLERGEN_CODES } from "@/lib/menu/allergens";
import { parseEditorPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { detaljIzSnapshota } from "@/lib/menu/studio/detalj";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import * as m from "@/lib/menu/studio/memorija";
import * as md from "@/lib/menu/studio/memorija-detalj";
import type { StudioKontekst, StudioRadnje } from "@/lib/menu/studio/model";
import { DetaljArtikla, type DetaljPocetno } from "./artikal/detalj-artikla";

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

const t = menuStudioSr.artikal;
const g = t.grupe;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in k11.test.tsx)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

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

/** The markup a person can see: every subtree under `hidden=""` is dropped. */
function bezSakrivenog(html: string): string {
  const re = new RegExp(TAG.source, "g");
  let izlaz = "";
  let pozicija = 0;
  let dubina = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    const [oznaka, zatvara, ime, samozatvarajuci] = match;
    const jeVoid = VOID.has(ime.toLowerCase()) || Boolean(samozatvarajuci);
    if (dubina === 0) izlaz += html.slice(pozicija, match.index);
    pozicija = match.index + oznaka.length;
    if (dubina > 0) {
      if (!jeVoid) dubina += zatvara ? -1 : 1;
      continue;
    }
    if (!zatvara && /\shidden=""/.test(oznaka)) {
      if (!jeVoid) dubina = 1;
      continue;
    }
    izlaz += oznaka;
  }
  return dubina === 0 ? izlaz + html.slice(pozicija) : izlaz;
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

/** The collapsible group of the detail with this suffix (`varijante`, `alergeni`, `gde`, `dostupnost`). */
function grupa(html: string, sufiks: string) {
  const sekcija = elementSaTragom(html, "section", `data-grupa-detalja="`.concat(mora(new RegExp(`data-grupa-detalja="([^"]*-${sufiks})"`).exec(html), `no group ${sufiks}`)[1], `"`));
  const dugme = mora(/<button\b[^>]*aria-expanded="[^"]*"[^>]*>[\s\S]*?<\/button>/.exec(sekcija), "no header button")[0];
  const telo = mora(/<div id="[^"]*-telo"[^>]*>/.exec(sekcija), "no group body");
  return {
    sekcija,
    dugme,
    expanded: attr(prviTag(dugme), "aria-expanded"),
    naslov: mora(/<span>([^<]*)<\/span>/.exec(dugme), "no group title")[1],
    sazetak: bezTagova(mora(/<span data-sazetak=""[^>]*>([\s\S]*?)<\/span>/.exec(dugme), "no group summary")[1]),
    teloTag: telo[0],
    telo: sekcija.slice(telo.index),
  };
}

/** The detail article as a whole. */
const detalj = (html: string) => elementSaTragom(html, "article", "data-detalj-artikla=");

/** The work area (tabpanel) of the editor at desktop width. */
const radniProstor = (html: string) => elementSaTragom(html, "div", 'role="tabpanel"');

const izlog = (query: IzlogSearchParams) => renderToStaticMarkup(<EditorIzlog params={parseEditorPreview(query)} />);

// -----------------------------------------------------------------------------
// The detail on its own
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

function renderDetalj(
  naziv: string,
  opcije: { plan?: "standard" | "premium"; mozeUredjivanje?: boolean; alergeni?: boolean; pocetno?: DetaljPocetno } = {},
): string {
  const meni = fixtureMenu("srednji");
  const snapshot =
    opcije.alergeni === false ? { ...meni.snapshot, settings: { ...meni.snapshot.settings, allergensEnabled: false } } : meni.snapshot;
  const glavna = mora(
    snapshot.pages.find((page) => page.isDefault),
    "the fixture has no main page",
  );
  const sadrzaj = mora(sadrzajIzSnapshota(snapshot, glavna.key), "the main page has no content");
  const artikal = mora(
    snapshot.articles.find((candidate) => candidate.name === naziv),
    `no article ${naziv}`,
  );
  const podaci = mora(detaljIzSnapshota(snapshot, artikal.key), "no detail");
  return renderToStaticMarkup(
    <DetaljArtikla
      detalj={podaci}
      sadrzaj={sadrzaj}
      izvorPrikazId={podaci.prikazi.find((prikaz) => prikaz.stranicaId === glavna.key)?.prikazId ?? null}
      stranice={straniceIzSnapshota(snapshot, new Set([glavna.key]))}
      nedostupni={new Set(meni.unavailableArticleKeys)}
      kontekst={kontekst({ plan: opcije.plan ?? "standard", mozeUredjivanje: opcije.mozeUredjivanje ?? true })}
      red={new AutosaveRed()}
      radnje={radnje}
      naslovId="k15-naslov"
      pocetno={opcije.pocetno}
      sada={IZLOG_SADA}
      onNazad={() => undefined}
      najavi={() => undefined}
    />,
  );
}

// Fixture facts (the invented medium venue).
const KAJMAK = "Kajmak sa pogačom";
const CEVAPI = "Ćevapi";
const PRILOZI = "Izaberite dva priloga";
const SVE_GRUPE = ["varijante", "alergeni", "gde", "dostupnost"] as const;

describe("K15 the article detail in the izlog", () => {
  test("without fokus there is no detail: the list is shown and nothing is hidden", () => {
    const html = izlog({});
    expect(html).not.toContain("data-detalj-artikla");
    expect(html).not.toContain("data-lista-ispod-detalja");
    const prostor = radniProstor(html);
    expect(prostor).toContain("data-red-artikla");
    // The list is visible: removing hidden subtrees keeps every row.
    expect(count(bezSakrivenog(prostor), "data-red-artikla")).toBe(count(prostor, "data-red-artikla"));
    expect(naslovi(bezSakrivenog(html), 1)).toHaveLength(1);
  });

  test("fokus=artikal: the detail takes the work area, the list stays below it, hidden", () => {
    const html = izlog({ fokus: "artikal" });
    const prostor = radniProstor(html);
    const lista = element(prostor, prostor.indexOf("<div hidden"));
    expect(prviTag(lista)).toContain("data-lista-ispod-detalja");
    expect(lista).toContain("data-red-artikla");
    // The detail is in the same tabpanel, outside the hidden list.
    const stanje = m.pocetnoStanje(fixtureMenu("srednji").snapshot);
    const kajmakKey = mora(stanje.snapshot.articles.find((a) => a.name === KAJMAK), "no fixture article").key;
    expect(prostor).toContain(`data-detalj-artikla="${kajmakKey}"`);
    expect(lista).not.toContain("data-detalj-artikla");
    // Nothing from the list shows next to the detail.
    expect(bezSakrivenog(prostor)).not.toContain("data-red-artikla");
    expect(prostor.indexOf("data-lista-ispod-detalja")).toBeLessThan(prostor.indexOf("data-detalj-artikla"));
  });

  test("fokus=artikal: exactly one visible h1, the article name; the way back names the section", () => {
    const html = izlog({ fokus: "artikal" });
    const vidljivo = bezSakrivenog(html);
    const h1 = naslovi(vidljivo, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(KAJMAK);
    // The list's own heading is in the hidden part only.
    expect(naslovi(html, 1).length).toBeGreaterThan(1);
    const nazad = dugmeSaOznakom(detalj(html), "data-nazad-na-listu");
    expect(nazad.text).toBe(fmt(t.nazad, { naziv: "Predjela" }));
    expect(nazad.text).toBe("Nazad na Predjela");
    expect(attr(nazad.tag, "aria-label")).toBe(fmt(t.nazadOznaka, { naziv: "Predjela" }));
    expect(jeOnemoguceno(nazad.tag)).toBe(false);
  });

  test("fokus=artikal: Osnovno first with its labels in order, then Prikaz, then the four groups", () => {
    const html = detalj(izlog({ fokus: "artikal" }));
    const h2 = naslovi(html, 2);
    expect(h2).toHaveLength(6);
    expect(bezTagova(h2[0])).toBe(t.osnovno.naslov);
    expect(bezTagova(h2[1])).toBe(t.prikaz.naslov);
    [g.varijanteIDodaci, g.alergeniIOznake, g.gdeSePrikazuje, g.dostupnostIAkcija].forEach((naslov, i) => {
      expect(h2[i + 2]).toContain(`<span>${esc(naslov)}</span>`);
    });
    // The h1 and the whole of Osnovno come before the other sections.
    const pocetakOsnovnog = html.indexOf(`>${t.osnovno.naslov}</h2>`);
    const pocetakPrikaza = html.indexOf(`>${t.prikaz.naslov}</h2>`);
    expect(html.indexOf("<h1")).toBeLessThan(pocetakOsnovnog);
    const osnovno = html.slice(pocetakOsnovnog, pocetakPrikaza);
    const o = t.osnovno;
    const mesta = [`>${o.naziv}</label>`, `>${o.cena}</span>`, `>${o.sekcija}</label>`, `>${o.opis}</label>`, `>${o.kolicina}</label>`, `>${o.jedinica}</label>`].map(
      (trag) => osnovno.indexOf(trag),
    );
    expect(mesta.every((mesto) => mesto >= 0)).toBe(true);
    expect([...mesta].sort((a, b) => a - b)).toEqual(mesta);
    const poredak = SVE_GRUPE.map((sufiks) => html.indexOf(`-${sufiks}-naslov"`));
    expect(poredak.every((mesto) => mesto > pocetakPrikaza)).toBe(true);
    expect([...poredak].sort((a, b) => a - b)).toEqual(poredak);
  });

  test("fokus=artikal: the image, with an alt that names the article", () => {
    const html = detalj(izlog({ fokus: "artikal" }));
    const slike = [...html.matchAll(/<img\b[^>]*\sdata-slika-artikla=""[^>]*>/g)];
    expect(slike).toHaveLength(1);
    expect(attr(slike[0][0], "alt")).toBe(fmt(t.prikaz.alt, { naziv: KAJMAK }));
    expect(attr(slike[0][0], "alt")).toBe("Slika artikla Kajmak sa pogačom");
    expect(attr(slike[0][0], "src")).toBeTruthy();
  });

  test("fokus=artikal: the allergens group is open with 15 rows and two named checkboxes per row", () => {
    const html = detalj(izlog({ fokus: "artikal" }));
    const alergeni = grupa(html, "alergeni");
    expect(alergeni.expanded).toBe("true");
    expect(alergeni.naslov).toBe(g.alergeniIOznake);
    expect(alergeni.teloTag).not.toMatch(/\shidden=""/);
    const tabela = elementSaTragom(alergeni.telo, "table", "data-alergeni-tabela");
    const telo = element(tabela, tabela.indexOf("<tbody"));
    expect(MENU_ALLERGEN_CODES).toHaveLength(15);
    expect(count(telo, "<tr")).toBe(15);
    for (const kod of MENU_ALLERGEN_CODES) {
      const naziv = menuDomenSr.allergens[kod];
      for (const [vrsta, tekst] of [
        ["sadrzi", t.alergeni.sadrzi],
        ["tragovi", t.alergeni.tragovi],
      ] as const) {
        const oznaka = fmt(t.alergeni.oznakaPolja, { vrsta: tekst, naziv });
        const polje = mora(
          [...telo.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].map((match) => match[0]).find((tag) => attr(tag, "aria-label") === oznaka),
          `no checkbox "${oznaka}"`,
        );
        expect(attr(polje, "data-alergen")).toBe(`${vrsta}:${kod}`);
        // Fixture facts: the article contains milk and gluten, nothing as traces.
        expect(jeOznaceno(polje)).toBe(vrsta === "sadrzi" && (kod === "milk" || kod === "gluten"));
      }
    }
    expect(count(telo, "<input")).toBe(30);
    expect(attr(mora(/<input\b[^>]*data-alergen="sadrzi:milk"[^>]*>/.exec(telo), "no milk")[0], "aria-label")).toBe(`${t.alergeni.sadrzi}: ${menuDomenSr.allergens.milk}`);
    // Something is entered, so the "not entered" note is not shown to the eye.
    expect(alergeni.telo).not.toContain("data-alergeni-nisu-uneti");
  });

  test("Varijante i dodaci is collapsed by default: no body, no switches, summary says it is off", () => {
    const html = detalj(izlog({ fokus: "artikal" }));
    const varijante = grupa(html, "varijante");
    expect(varijante.expanded).toBe("false");
    expect(varijante.naslov).toBe(g.varijanteIDodaci);
    expect(varijante.teloTag).toMatch(/\shidden=""/);
    expect(varijante.telo).not.toContain("data-prekidac-varijante");
    expect(varijante.telo).not.toContain("<input");
    expect(varijante.sazetak).toBe(g.iskljuceno);
    expect(varijante.sazetak).toBe("Isključeno");
    expect(html).not.toContain("data-prekidac-varijante");
    // The other three are closed too, except the allergens one.
    expect(grupa(html, "gde").expanded).toBe("false");
    expect(grupa(html, "dostupnost").expanded).toBe("false");
  });

  test("fokus=varijante: three variants and the linked group with the impact dialog open", () => {
    const html = izlog({ fokus: "varijante" });
    const vidljivo = bezSakrivenog(html);
    const h1 = naslovi(vidljivo, 1);
    expect(h1).toHaveLength(1);
    expect(bezTagova(h1[0])).toBe(CEVAPI);

    const stranica = detalj(html);
    const varijante = grupa(stranica, "varijante");
    expect(varijante.expanded).toBe("true");
    expect(varijante.teloTag).not.toMatch(/\shidden=""/);
    expect(count(varijante.telo, ' data-varijanta="')).toBe(3);
    expect(varijante.telo).toContain("data-prekidac-varijante");
    expect(varijante.sazetak).toContain(fmt(g.varijante.few, { n: 3 }));

    const povezana = elementSaTragom(varijante.telo, "li", "data-grupa-dodataka=");
    expect(bezTagova(mora(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(povezana), "no group title")[1])).toBe(PRILOZI);
    expect(povezana).toContain(" data-povezana");
    expect(bezTagova(povezana)).toContain(fmt(t.dodaci.povezana.many, { n: 6 }));
    expect(bezTagova(povezana)).toContain("Povezana grupa · 6 artikala");
  });

  test("fokus=varijante: the impact dialog offers the two scopes and waits for a choice", () => {
    const html = izlog({ fokus: "varijante" });
    const dijalog = elementSaTragom(html, "div", 'role="dialog"');
    const u = t.uticaj;
    expect(bezTagova(mora(/<h2>([\s\S]*?)<\/h2>/.exec(dijalog), "no dialog title")[1])).toBe(fmt(u.naslov, { naziv: PRILOZI }));
    expect(bezTagova(dijalog)).toContain("Izmena grupe „Izaberite dva priloga“");
    expect(bezTagova(dijalog)).toContain(fmt(u.opis.many, { n: 6 }));
    // The affected list is loaded in an effect, which does not run on the server: the loading state shows.
    expect(dijalog).toContain(u.ucitava);
    expect(dijalog).not.toContain("data-pogodjeni-artikli");
    const radio = [...dijalog.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((match) => match[0]);
    expect(radio.map((tag) => attr(tag, "data-opseg"))).toEqual(["sve", "kopija"]);
    expect(radio.some(jeOznaceno)).toBe(false);
    expect(bezTagova(dijalog)).toContain(u.zaSve);
    expect(bezTagova(dijalog)).toContain(u.kopija);
    expect(bezTagova(dijalog)).toContain(fmt(u.kopijaOpis, { naziv: CEVAPI }));
    const nastavi = dugmeSaOznakom(dijalog, "data-nastavi-uticaj");
    expect(nastavi.text).toBe(u.nastavi);
    expect(jeOnemoguceno(nastavi.tag)).toBe(true);
    const otkazi = dugmad(dijalog).find((dugme) => dugme.text === u.otkazi);
    expect(jeOnemoguceno(mora(otkazi, "no cancel button").tag)).toBe(false);
  });

  test("the izlog's impact data: the group is on six articles, this one among them (what the dialog lists after loading)", () => {
    const meni = fixtureMenu("srednji");
    const stanje = m.pocetnoStanje(meni.snapshot);
    const prilozi = mora(stanje.snapshot.addonGroups.find((group) => group.name === PRILOZI), "no group");
    const kljuc = (naziv: string) => mora(stanje.snapshot.articles.find((a) => a.name === naziv), `no article ${naziv}`).key;
    // The izlog links the group to these three articles (Ćevapi, Pljeskavica sa kajmakom, Ražnjići) on top of its fixture ones.
    const povezano = md.primeniGrupuNa(stanje, prilozi.key, [CEVAPI, "Pljeskavica sa kajmakom", "Ražnjići"].map(kljuc));
    const uticaj = md.uticajGrupe(povezano.stanje, prilozi.key);
    expect(uticaj.ishod.ok).toBe(true);
    if (!uticaj.ishod.ok) return;
    expect(uticaj.ishod.vrednost.ukupno).toBe(6);
    expect(uticaj.ishod.vrednost.skraceno).toBe(false);
    expect(uticaj.ishod.vrednost.artikli).toHaveLength(6);
    expect(uticaj.ishod.vrednost.artikli.map((a) => a.id)).toContain(kljuc(CEVAPI));
    // And the izlog opens the detail of that article with the dialog of that group.
    const html = izlog({ fokus: "varijante" });
    expect(html).toContain(`data-detalj-artikla="${kljuc(CEVAPI)}"`);
    expect(html).toContain(`data-uticaj-grupe="${prilozi.key}"`);
  });
});

describe("K15 the article detail on its own", () => {
  test("a venue without allergens: the group is titled Oznake and has no allergen table, even open", () => {
    const zatvorena = renderDetalj(KAJMAK, { alergeni: false });
    expect(grupa(zatvorena, "alergeni").naslov).toBe(g.oznake);
    expect(grupa(zatvorena, "alergeni").naslov).toBe("Oznake");
    expect(grupa(zatvorena, "alergeni").naslov).not.toBe(g.alergeniIOznake);

    const otvorena = renderDetalj(KAJMAK, { alergeni: false, pocetno: { otvoreneGrupe: ["alergeni"] } });
    const alergeni = grupa(otvorena, "alergeni");
    expect(alergeni.expanded).toBe("true");
    expect(alergeni.naslov).toBe(g.oznake);
    expect(otvorena).not.toContain("data-alergeni-tabela");
    expect(otvorena).not.toContain("data-alergen=");
    expect(otvorena).not.toContain(esc(t.alergeni.sadrzi));
    expect(otvorena).not.toContain(esc(t.alergeni.nepoznato));
    // The tags stay.
    expect(alergeni.telo).toContain("data-oznake");
    expect(bezTagova(alergeni.telo)).toContain(t.oznake.naslov);
    // The summary does not talk about allergens either.
    expect(alergeni.sazetak).not.toContain("alergen");

    // With allergens on, the same group opens with the table and the longer title.
    const sa = renderDetalj(KAJMAK, { pocetno: { otvoreneGrupe: ["alergeni"] } });
    expect(grupa(sa, "alergeni").naslov).toBe(g.alergeniIOznake);
    expect(sa).toContain("data-alergeni-tabela");
  });

  test("a promotion on Standard: the schedule is locked with the Premium mark and the reason", () => {
    const html = renderDetalj(KAJMAK, { plan: "standard", pocetno: { otvoreneGrupe: ["dostupnost"], akcijaOtvorena: true } });
    const polje = elementSaTragom(html, "fieldset", "data-termin-akcije=");
    expect(attr(prviTag(polje), "data-termin-akcije")).toBe("zakljucano");
    expect(jeOnemoguceno(prviTag(polje))).toBe(true);
    const tekst = bezTagova(polje);
    expect(tekst).toContain(t.akcija.premium);
    expect(tekst).toContain(t.akcija.premiumRazlog);
    expect(tekst).not.toContain(t.akcija.terminOpis);
    // K15 critique: on Standard the schedule is a locked note, never empty date fields.
    expect(count(polje, 'type="datetime-local"')).toBe(0);
    // The rest of the form is not locked.
    const forma = html.slice(html.indexOf("data-vrednost-akcije"));
    expect(jeOnemoguceno(prviTag(html.slice(html.lastIndexOf("<input", html.indexOf("data-vrednost-akcije")))))).toBe(false);
    expect(forma).toContain("data-sacuvaj-akciju");
  });

  test("a promotion on Premium: the schedule is enabled and explained", () => {
    const html = renderDetalj(KAJMAK, { plan: "premium", pocetno: { otvoreneGrupe: ["dostupnost"], akcijaOtvorena: true } });
    const polje = elementSaTragom(html, "fieldset", "data-termin-akcije=");
    expect(attr(prviTag(polje), "data-termin-akcije")).toBe("");
    expect(jeOnemoguceno(prviTag(polje))).toBe(false);
    const tekst = bezTagova(polje);
    expect(tekst).toContain(t.akcija.terminOpis);
    expect(tekst).not.toContain(t.akcija.premiumRazlog);
    expect(tekst).not.toContain(t.akcija.premium);
  });

  test("an article without variants can have a promotion price; with variants only the percent", () => {
    const radiPrice = (html: string) =>
      mora(
        [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((match) => match[0]).find((tag) => attr(tag, "value") === "price"),
        "no price radio",
      );
    const procenat = (html: string) =>
      mora(
        [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((match) => match[0]).find((tag) => attr(tag, "value") === "percent"),
        "no percent radio",
      );
    const pocetno = { otvoreneGrupe: ["dostupnost"], akcijaOtvorena: true } as const;

    const bez = renderDetalj(KAJMAK, { pocetno });
    expect(jeOnemoguceno(radiPrice(bez))).toBe(false);
    expect(bez).not.toContain(t.akcija.varijanteCena);

    const sa = renderDetalj(CEVAPI, { pocetno });
    expect(jeOnemoguceno(radiPrice(sa))).toBe(true);
    expect(jeOnemoguceno(procenat(sa))).toBe(false);
    expect(sa).toContain(esc(t.akcija.varijanteCena));
    // The label of the disabled choice is the one the dictionary names.
    expect(sa).toContain(`>${t.akcija.cena}</label>`);
  });

  test("read-only: the name field is disabled and the info line says so", () => {
    const html = renderDetalj(KAJMAK, { mozeUredjivanje: false });
    const oznaka = mora(new RegExp(`<label for="([^"]+)"[^>]*>${esc(t.osnovno.naziv)}</label>`).exec(html), "no name label");
    const polje = mora(new RegExp(`<input\\b[^>]*\\sid="${oznaka[1]}"[^>]*>`).exec(html), "no name input")[0];
    expect(jeOnemoguceno(polje)).toBe(true);
    expect(attr(polje, "value")).toBe(KAJMAK);
    expect(html).toContain(esc(t.samoCitanje));
    expect(html).not.toContain(esc(t.nacrt));
    // The choice of how the article shows is locked too.
    const prikaz = elementSaTragom(html, "section", "data-prikaz-medija=");
    expect(jeOnemoguceno(mora(/<fieldset\b[^>]*>/.exec(prikaz), "no media choice")[0])).toBe(true);

    const uredjivanje = renderDetalj(KAJMAK);
    const polje2 = mora(
      new RegExp(`<input\\b[^>]*\\sid="${mora(new RegExp(`<label for="([^"]+)"[^>]*>${esc(t.osnovno.naziv)}</label>`).exec(uredjivanje), "no label")[1]}"[^>]*>`).exec(uredjivanje),
      "no name input",
    )[0];
    expect(jeOnemoguceno(polje2)).toBe(false);
    expect(uredjivanje).toContain(esc(t.nacrt));
    expect(uredjivanje).not.toContain(esc(t.samoCitanje));
  });

  test("every lucide icon in the detail is hidden from assistive technology", () => {
    const svi = {
      artikal: renderDetalj(KAJMAK, { plan: "premium", pocetno: { otvoreneGrupe: [...SVE_GRUPE], akcijaOtvorena: true } }),
      varijante: renderDetalj(CEVAPI, { pocetno: { otvoreneGrupe: [...SVE_GRUPE], akcijaOtvorena: true, varijante: { uticajGrupe: "" } } }),
      izlogArtikal: detalj(izlog({ fokus: "artikal" })),
      izlogVarijante: izlog({ fokus: "varijante" }),
    };
    for (const [ime, html] of Object.entries(svi)) {
      const ikonice = [...html.matchAll(/<svg\b[^>]*\bclass="[^"]*lucide[^"]*"[^>]*>/g)].map((match) => match[0]);
      expect(ikonice.length, `${ime}: no icons found`).toBeGreaterThan(3);
      for (const ikonica of ikonice) expect(attr(ikonica, "aria-hidden"), `${ime}: ${ikonica}`).toBe("true");
    }
  });
});
