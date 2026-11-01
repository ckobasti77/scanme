// K33 render tests: the accessibility fixes of the editor (audit A1, A2, A6, A15,
// A16, A18, A19). Server markup only (renderToStaticMarkup, no DOM), set up like
// k11.test.tsx and k18.test.tsx: effects never run, `@/components/ui/dialog` is
// replaced by a stand-in that renders an open dialog inline, and the Radix menu
// (which renders nothing on the server) by one that renders its items inline. The
// real `DropdownMenuItem` still builds the class list of an item: it is called as a
// function and its Radix element's className is read, so the test sees the merge of
// the shadcn base and the editor's classes exactly as the browser gets it.
//
// What a static render cannot show, and a browser check must: that the focus really
// lands on the title / "Dodaj stranicu" button after Enter, Escape or Otkaži (A2:
// the hook runs in an effect after the field is gone), that the ring of a menu item
// shows after a key press (A1: `:focus-visible` on a Radix item), and what a screen
// reader says when the connection drops (A6). Texts come from the dictionaries.

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu } from "@/components/menu/fixtures";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { AutosaveRed, type AutosaveZbir, type StanjePolja } from "@/lib/menu/studio/autosave-queue";
import { detaljIzSnapshota } from "@/lib/menu/studio/detalj";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type { StudioRadnje, StudioRed } from "@/lib/menu/studio/model";
import { OsnovnoArtikla } from "./artikal/osnovno";
import { TekstPolje } from "./artikal/polja";
import { BrziUnosRed } from "./brzi-unos/brzi-unos-red";
import { MeniRadnji } from "./meni-radnji";
import { NazivPolje } from "./naziv-polje";
import { SekcijaBlok } from "./ponuda/sekcija-blok";
import { CenaPolje } from "./red-artikla/cena-polje";
import { stavkeReda } from "./red-artikla/red-artikla";
import { StudioZaglavlje } from "./shell/zaglavlje";
import { StraniceKolona, type StraniceRadnje } from "./stranice/stranice-kolona";
import { TabelarniUnos } from "./tabelarni-unos/tabelarni-unos";

// The ids the closing rename / add field is told to give the focus to (A2).
const vraceno = vi.hoisted(() => ({ pozivi: [] as (string | undefined)[] }));

vi.mock("../lokal/zajednicko", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lokal/zajednicko")>();
  return {
    ...original,
    useVracanjeFokusa: (rezervaId?: string) => {
      vraceno.pozivi.push(rezervaId);
      return original.useVracanjeFokusa(rezervaId);
    },
  };
});

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

// The menu renders its items inline. `DropdownMenuItem` keeps the real class merge.
vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/dropdown-menu")>();
  return {
    ...original,
    DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div role="menu">{children}</div>,
    DropdownMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: (props: { children?: ReactNode } & Record<string, unknown>) => {
      const stavka = original.DropdownMenuItem(props as never) as ReactElement<{ className?: string }>;
      return (
        <div role="menuitem" data-stavka={props["data-stavka"] as string} className={stavka.props.className}>
          {props.children}
        </div>
      );
    },
  };
});

const t = menuStudioSr;
const z = menuZajednickoSr;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in k11/k18)
// -----------------------------------------------------------------------------

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
const prviTag = (markup: string) => markup.slice(0, markup.indexOf(">") + 1);
const tekst = (markup: string) => unesc(markup.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const kaoRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

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

/** The text field (<input> or <textarea>) whose <label> says `oznaka`. */
function poljeSaOznakom(html: string, oznaka: string): string {
  const id = mora(new RegExp(`<label for="([^"]+)"[^>]*>${kaoRegex(esc(oznaka))}</label>`).exec(html), `no label ${oznaka}`)[1];
  return mora(new RegExp(`<(?:input|textarea)\\b[^>]*\\sid="${kaoRegex(id)}"[^>]*>`).exec(html), `no field for ${oznaka}`)[0];
}

const nista = () => undefined;
const nikad = nista as never;

// Never called in a server render; if one runs, the test says which.
function zabranjeno<T>(): T {
  return new Proxy(
    {},
    {
      get: (_cilj, ime) => () => {
        throw new Error(`${String(ime)} must not run in a server render`);
      },
    },
  ) as T;
}

const meni = fixtureMenu("srednji");
const glavna = mora(
  meni.snapshot.pages.find((page) => page.isDefault),
  "the fixture has no main page",
);
const sadrzaj = mora(sadrzajIzSnapshota(meni.snapshot, glavna.key), "the main page has no content");
const stranice = straniceIzSnapshota(meni.snapshot, new Set([glavna.key]));

// -----------------------------------------------------------------------------
// A1: the items of the action menu show where the focus is
// -----------------------------------------------------------------------------

describe("K33 A1: menu items have a visible focus ring", () => {
  const html = renderToStaticMarkup(
    <MeniRadnji
      okidac={<button type="button">Radnje</button>}
      stavke={[
        { kljuc: "prva", tekst: "Prva", onIzbor: nista },
        { kljuc: "opasna", tekst: "Opasna", opasno: true, onIzbor: nista },
      ]}
    />,
  );
  const stavke = [...html.matchAll(/<div role="menuitem"[^>]*>/g)].map((match) => ({
    kljuc: attr(match[0], "data-stavka"),
    klase: (attr(match[0], "class") ?? "").split(/\s+/),
  }));

  test("both items are there", () => {
    expect(stavke.map((stavka) => stavka.kljuc)).toEqual(["prva", "opasna"]);
  });

  test("a ring (2 px, inside the item, solid, in the focus colour) on :focus-visible, next to the old fill", () => {
    for (const { klase } of stavke) {
      expect(klase).toContain("focus-visible:outline-2");
      expect(klase).toContain("focus-visible:-outline-offset-2");
      expect(klase).toContain("focus-visible:outline-solid");
      expect(klase).toContain("focus-visible:outline-[var(--mp-fokus)]");
      expect(klase).toContain("focus:bg-[var(--mp-povrsina-utisana)]");
    }
  });

  test("the shadcn base still removes the outline, so the ring must set its own style (Tailwind 4: --tw-outline-style)", () => {
    for (const { klase } of stavke) {
      expect(klase).toContain("outline-none");
      expect(klase).toContain("focus-visible:outline-solid");
    }
  });

  test("the destructive item keeps its colour on focus", () => {
    expect(stavke[1].klase).toContain("text-[var(--mp-opasnost)]");
    expect(stavke[1].klase).toContain("focus:text-[var(--mp-opasnost)]");
    expect(stavke[0].klase).not.toContain("focus:text-[var(--mp-opasnost)]");
  });
});

// -----------------------------------------------------------------------------
// A2: the focus has somewhere to go when the rename / add field closes
// -----------------------------------------------------------------------------

describe("K33 A2: where the focus goes when the name field is gone", () => {
  const polje = (izmene: Partial<ComponentProps<typeof NazivPolje>> = {}) =>
    renderToStaticMarkup(
      <NazivPolje
        pocetno=""
        oznaka={t.sekcija.nazivOznaka}
        potvrda={t.sekcija.sacuvaj}
        otkazi={t.sekcija.otkazi}
        maks={40}
        greskaPrazno={t.opste.nazivObavezan}
        greskaDugo={fmt(t.opste.nazivDug, { n: 40 })}
        onSacuvaj={nista}
        onOtkazi={nista}
        {...izmene}
      />,
    );

  test("NazivPolje hands the target id to the focus-return hook (and nothing when there is none)", () => {
    vraceno.pozivi.length = 0;
    polje({ vratiFokusNa: "cilj-1" });
    polje();
    expect(vraceno.pozivi).toEqual(["cilj-1", undefined]);
  });

  test("a section has a title button with a stable id: the content id plus -dugme (the id aria-controls names)", () => {
    const html = renderToStaticMarkup(
      <SekcijaBlok
        sekcija={sadrzaj.sekcije[0]}
        redovi={sadrzaj.sekcije[0].redovi}
        skupljena={false}
        onSkupi={nista}
        nedostupni={new Set<string>()}
        red={new AutosaveRed()}
        mozeUredjivanje
        redRadnje={{ onCena: nista, onPonovo: nista, onZadrziMoju: nista, onUzmiSacuvanu: nista }}
        brziUnosOtvoren={false}
        onBrziUnos={nista}
        onDodaj={nikad}
        onDodajPostojeci={nikad}
        onPreimenuj={nikad}
        onObrisi={nista}
      />,
    );
    const dugme = mora(/<button\b[^>]*\saria-controls="[^"]+"[^>]*>/.exec(html), "no title button")[0];
    expect(attr(dugme, "id")).toBe(`${attr(dugme, "aria-controls")}-dugme`);
    expect(count(html, `id="${attr(dugme, "id")}"`)).toBe(1);
  });

  test("every page has its button id, and Dodaj stranicu has one (only for those who may edit)", () => {
    const kolona = (mozeUredjivanje: boolean) =>
      renderToStaticMarkup(
        <StraniceKolona
          stranice={stranice}
          izabrana={stranice[0].id}
          roomService={false}
          roomServiceIzabran={false}
          mozeUredjivanje={mozeUredjivanje}
          radnje={zabranjeno<StraniceRadnje>()}
          onIzaberi={nista}
          onRoomService={nista}
        />,
      );
    const html = kolona(true);
    const aktivne = stranice.filter((stranica) => !stranica.arhivirana);
    expect(aktivne.length).toBeGreaterThan(0);
    for (const stranica of aktivne) {
      const dugme = mora(new RegExp(`<button\\b[^>]*\\sid="studio-stranica-${kaoRegex(stranica.id)}"[^>]*>`).exec(html), `no button of ${stranica.naziv}`)[0];
      expect(attr(dugme, "aria-current") === "page").toBe(stranica.id === stranice[0].id);
    }
    const dodaj = mora(/<button\b[^>]*\sid="studio-stranica-dodaj"[^>]*>[\s\S]*?<\/button>/.exec(html), "no Dodaj stranicu button")[0];
    expect(tekst(dodaj)).toBe(t.stranice.dodaj);
    expect(kolona(false)).not.toContain('id="studio-stranica-dodaj"');
    expect(new Set([...html.matchAll(/\sid="(studio-stranica-[^"]+)"/g)].map((match) => match[1])).size).toBe(count(html, ' id="studio-stranica-'));
  });
});

// -----------------------------------------------------------------------------
// A6: the lost connection reaches a live region that was already there
// -----------------------------------------------------------------------------

describe("K33 A6: the header's live region for the connection", () => {
  const SACUVANO: AutosaveZbir = { stanje: "sacuvano", neuspelo: 0, poslednjeU: null };
  const zaglavlje = (sirina: ComponentProps<typeof StudioZaglavlje>["sirina"], povezano: boolean) =>
    renderToStaticMarkup(
      <StudioZaglavlje
        lokal="Demo restoran"
        rezim="Restoran"
        sirina={sirina}
        tab="ponuda"
        onTab={nista}
        panelId="panel-probe"
        cuvanje={SACUVANO}
        status={undefined}
        povezano={povezano}
        mozeObjavu
        prikaziPregled
        onPregled={nista}
        onObjavi={nista}
      />,
    );
  const poruka = `${z.stanja.offlineNaslov}. ${z.stanja.offlineBezVremena}`;

  for (const sirina of ["desktop", "siroko", "usko", "telefon"] as const) {
    test(`${sirina}: one polite status, visually hidden, empty while the connection is there`, () => {
      const html = zaglavlje(sirina, true);
      expect(count(html, "data-veza-najava=")).toBe(1);
      const region = elementSaTragom(html, "div", "data-veza-najava=");
      const tag = prviTag(region);
      expect(attr(tag, "role")).toBe("status");
      expect(attr(tag, "aria-live")).toBe("polite");
      expect(attr(tag, "class")?.split(/\s+/)).toContain("sr-only");
      expect(tag).not.toMatch(/\shidden=|\saria-hidden=/);
      expect(tekst(region)).toBe("");
      expect(html).not.toContain('data-stanje="offline"');
    });

    test(`${sirina}: without a connection the same element, in the same place, holds the bar's own text`, () => {
      const online = zaglavlje(sirina, true);
      const offline = zaglavlje(sirina, false);
      expect(count(offline, "data-veza-najava=")).toBe(1);
      expect(tekst(elementSaTragom(offline, "div", "data-veza-najava="))).toBe(poruka);
      const traka = elementSaTragom(offline, "div", 'data-stanje="offline"');
      expect(tekst(traka)).toContain(z.stanja.offlineNaslov);
      expect(tekst(traka)).toContain(z.stanja.offlineBezVremena);
      // Take the bar out and the text out of the region: what is left is the page with the connection.
      expect(offline.replace(traka, "").replace(esc(poruka), "")).toBe(online);
    });
  }
});

// -----------------------------------------------------------------------------
// A15: a visible label for Naziv and Cena on a phone
// -----------------------------------------------------------------------------

describe("K33 A15: the quick entries name their fields on a phone", () => {
  const tabela = renderToStaticMarkup(
    <TabelarniUnos
      otvoreno
      onOtvoreno={nista}
      sekcije={sadrzaj.sekcije.map(({ id, naziv }) => ({ id, naziv }))}
      podrazumevanaSekcija={sadrzaj.sekcije[0].id}
      onPosalji={nikad}
      onDodato={nista}
    />,
  );

  test("the column header of the table is no longer hidden below sm: Naziv and Cena show, Sekcija waits for the wide layout", () => {
    const zaglavlje = elementSaTragom(tabela, "div", 'aria-hidden="true"');
    const klase = (attr(prviTag(zaglavlje), "class") ?? "").split(/\s+/);
    expect(klase).toContain("grid");
    expect(klase).not.toContain("hidden");
    expect(klase).toContain("grid-cols-[minmax(0,1fr)_7.5rem]");
    expect(klase).toContain("sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,11rem)_var(--mp-meta)]");
    const celije = [...zaglavlje.matchAll(/<span\b([^>]*)>([^<]*)<\/span>/g)].map((match) => ({
      tekst: unesc(match[2]),
      klase: (attr(match[1], "class") ?? "").split(/\s+/),
    }));
    expect(celije.map((celija) => celija.tekst)).toEqual([t.tabela.naziv, t.tabela.cena, t.tabela.sekcija, ""]);
    expect(celije.map((celija) => celija.klase.includes("hidden"))).toEqual([false, false, true, true]);
  });

  test("the fields keep their names for screen readers", () => {
    expect(tabela).toContain(`aria-label="${esc(fmt(t.tabela.nazivReda, { n: 1 }))}"`);
    expect(tabela).toContain(`aria-label="${esc(fmt(t.tabela.cenaReda, { n: 1 }))}"`);
  });

  const brzi = renderToStaticMarkup(
    <BrziUnosRed
      sekcija={{ id: sadrzaj.sekcije[0].id, naziv: sadrzaj.sekcije[0].naziv }}
      otvoreno
      onemoguceno={false}
      onOtvori={nista}
      onZatvori={nista}
      onDodaj={nikad}
      onDodajPostojeci={nikad}
    />,
  );

  test("quick entry: a short label above each field up to sm, hidden from readers; the full name stays sr-only", () => {
    const oznake = [...brzi.matchAll(/<span aria-hidden="true" class="([^"]*)">([^<]*)<\/span>/g)].filter((match) =>
      match[1].includes("sm:hidden"),
    );
    expect(oznake.map((match) => unesc(match[2]))).toEqual([t.brziUnos.naziv, t.brziUnos.cena]);
    expect(brzi).toContain(`<span class="sr-only">${esc(t.brziUnos.nazivOznaka)}</span>`);
    expect(brzi).toContain(`<span class="sr-only">${esc(t.brziUnos.cenaOznaka)}</span>`);
    // The accessible names still hold the visible words (label in name).
    expect(t.brziUnos.nazivOznaka).toContain(t.brziUnos.naziv);
    expect(t.brziUnos.cenaOznaka).toContain(t.brziUnos.cena);
  });

  test("quick entry: the RSD suffix sits below the label on a phone and where it was from sm up", () => {
    const sufiks = mora(new RegExp(`<span aria-hidden="true" class="([^"]*)">${esc(t.red.rsd)}</span>`).exec(brzi), "no RSD suffix")[1].split(/\s+/);
    expect(sufiks).toContain("top-9");
    expect(sufiks).toContain("sm:top-3");
  });
});

// -----------------------------------------------------------------------------
// A16: the required names say so
// -----------------------------------------------------------------------------

describe("K33 A16: required name fields carry aria-required", () => {
  const red = new AutosaveRed();
  const tekstPolje = (obavezno?: boolean) =>
    renderToStaticMarkup(
      <TekstPolje
        oznaka="Probno polje"
        vrednost="x"
        kljuc="probno"
        red={red}
        posalji={nikad}
        proveri={(unos) => ({ ok: true, vrednost: unos })}
        obavezno={obavezno}
        onemoguceno={false}
      />,
    );

  test("TekstPolje: aria-required only when asked for", () => {
    expect(attr(poljeSaOznakom(tekstPolje(true), "Probno polje"), "aria-required")).toBe("true");
    expect(attr(poljeSaOznakom(tekstPolje(false), "Probno polje"), "aria-required")).toBeUndefined();
    expect(attr(poljeSaOznakom(tekstPolje(), "Probno polje"), "aria-required")).toBeUndefined();
  });

  test("the article detail: the name is required, the description, quantity and unit are not", () => {
    const artikal = mora(
      meni.snapshot.articles.find((kandidat) => kandidat.name === "Kajmak sa pogačom"),
      "no fixture article",
    );
    const podaci = mora(detaljIzSnapshota(meni.snapshot, artikal.key), "no detail");
    const html = renderToStaticMarkup(
      <OsnovnoArtikla
        detalj={podaci}
        red={red}
        radnje={zabranjeno<StudioRadnje>()}
        mozeUredjivanje
        sekcije={[]}
        izvor={null}
        nazivStranice={glavna.name}
      />,
    );
    const o = t.artikal.osnovno;
    expect(attr(poljeSaOznakom(html, o.naziv), "aria-required")).toBe("true");
    for (const oznaka of [o.opis, o.kolicina, o.jedinica]) {
      expect(attr(poljeSaOznakom(html, oznaka), "aria-required")).toBeUndefined();
    }
  });

  test("the name field of a section, a page and a new page", () => {
    for (const oznaka of [t.sekcija.nazivOznaka, t.stranice.nazivOznaka, t.stranice.nazivNove]) {
      const html = renderToStaticMarkup(
        <NazivPolje
          pocetno=""
          oznaka={oznaka}
          potvrda={t.sekcija.sacuvaj}
          otkazi={t.sekcija.otkazi}
          maks={40}
          greskaPrazno={t.opste.nazivObavezan}
          greskaDugo={fmt(t.opste.nazivDug, { n: 40 })}
          onSacuvaj={nista}
          onOtkazi={nista}
        />,
      );
      expect(attr(poljeSaOznakom(html, oznaka), "aria-required")).toBe("true");
    }
  });

  test("the name of a new article in quick entry", () => {
    const html = renderToStaticMarkup(
      <BrziUnosRed
        sekcija={{ id: "s1", naziv: "Sekcija" }}
        otvoreno
        onemoguceno={false}
        onOtvori={nista}
        onZatvori={nista}
        onDodaj={nikad}
        onDodajPostojeci={nikad}
      />,
    );
    const polja = [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
    expect(polja).toHaveLength(2);
    expect(polja.map((polje) => attr(polje, "name"))).toEqual(["naziv", "cena"]);
    expect(polja.map((polje) => attr(polje, "aria-required"))).toEqual(["true", undefined]);
  });
});

// -----------------------------------------------------------------------------
// A18: the saving state of a price is a status
// -----------------------------------------------------------------------------

describe("K33 A18: the saving state next to the price field", () => {
  const cena = (stanje: StanjePolja | undefined, sacuvanoU?: number) =>
    renderToStaticMarkup(
      <CenaPolje
        id="cena-probna"
        naziv="Probni artikal"
        vrednost={250}
        stanje={stanje}
        sacuvanoU={sacuvanoU}
        onemoguceno={false}
        opisId="cena-probna-poruka"
        onPotvrdi={nista}
        onGreska={nista}
      />,
    );
  const stanjeElement = (html: string) => elementSaTragom(html, "span", "data-cena-stanje=");

  test("it is a status in every state, empty when nothing is going on (so it is there before it speaks)", () => {
    const mirno = stanjeElement(cena(undefined));
    expect(attr(prviTag(mirno), "role")).toBe("status");
    expect(attr(prviTag(mirno), "data-cena-stanje")).toBe("mirno");
    expect(tekst(mirno)).toBe("");
  });

  test("Čuva se... and Sačuvano are written into it", () => {
    const cuva = stanjeElement(cena({ faza: "salje", vrednost: 250 }));
    expect(attr(prviTag(cuva), "role")).toBe("status");
    expect(attr(prviTag(cuva), "data-cena-stanje")).toBe("cuva-se");
    expect(tekst(cuva)).toBe(t.red.cuvaSe);
    const sacuvano = stanjeElement(cena(undefined, 1));
    expect(attr(prviTag(sacuvano), "role")).toBe("status");
    expect(attr(prviTag(sacuvano), "data-cena-stanje")).toBe("sacuvano");
    expect(tekst(sacuvano)).toBe(t.red.sacuvano);
  });

  test("a problem keeps the status element too (the message itself is the row's alert)", () => {
    const problem = stanjeElement(cena({ faza: "greska", vrednost: 250, kod: "x", ponovljivo: true }));
    expect(attr(prviTag(problem), "role")).toBe("status");
    expect(attr(prviTag(problem), "data-cena-stanje")).toBe("problem");
  });
});

// -----------------------------------------------------------------------------
// A19: the drag instructions say the way that exists
// -----------------------------------------------------------------------------

describe("K33 A19: the screen reader instructions for dragging", () => {
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
  const stavke = stavkeReda(red, { nedostupan: false, mozeUredjivanje: true, mozeDostupnost: false }, nista);

  test("the keyboard way named is the row menu and its item Premesti, and both exist", () => {
    const uputstvo = t.dnd.uputstvo;
    expect(stavke.some((stavka) => stavka.kljuc === "premesti" && stavka.tekst === t.stanjaArtikla.premesti)).toBe(true);
    expect(uputstvo).toContain(`meni Radnje uz artikal, stavka ${t.stanjaArtikla.premesti}`);
    // The row menu button is named "Radnje za artikal ...": the instruction uses the same word.
    expect(t.stanjaArtikla.radnje.startsWith("Radnje")).toBe(true);
  });

  test("it no longer promises a button next to the article", () => {
    expect(t.dnd.uputstvo).not.toMatch(/dugme/i);
    expect(t.dnd.uputstvo).toContain("prevlačenjem");
  });
});
