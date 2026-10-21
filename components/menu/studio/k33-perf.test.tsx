// K33 second round on the editor: C6 (a 400-article page redraws every row after each
// answer of the server) and the keyboard finding of the 390 px walk (the global theme
// button covers the row's controls when Tab scrolls them to the bottom edge).
// Server markup only (renderToStaticMarkup, no DOM), as k33.test.tsx. What a static
// render cannot show is the redraw itself and the scroll, so this file pins the causes
// that can be read from markup and props:
//   - the row is memoized, and the props the section hands to a row are the SAME values
//     in the next render when the row's data did not change (so the memo skips it);
//   - without the structural sharing (lib/menu/studio/deljenje-redova.ts) not one row
//     would skip: the control below shows it;
//   - every focusable thing in a row carries a bottom scroll margin that clears the
//     44 px theme button (1 rem from the edge) on narrow windows.
// The focus-after-Escape fix in the move dialog (radni-prostor.tsx) needs a browser:
// see the Playwright selectors in the report of the step.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu } from "@/components/menu/fixtures";
import { AutosaveRed, type StanjePolja } from "@/lib/menu/studio/autosave-queue";
import { zadrziSadrzaj } from "@/lib/menu/studio/deljenje-redova";
import { sadrzajIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import type { StudioRadniSadrzaj, StudioRed } from "@/lib/menu/studio/model";
import { PregledSadrzaj } from "./pregled/pregled-sadrzaj";
import { SekcijaBlok } from "./ponuda/sekcija-blok";
import type { RedRadnje } from "./red-artikla/red-artikla";

// Every row a section draws goes through `RedArtikla`; here it only records its props.
const snimak = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("./red-artikla/red-artikla", async (importOriginal) => {
  const original = await importOriginal<typeof import("./red-artikla/red-artikla")>();
  return {
    ...original,
    RedArtikla: (props: Record<string, unknown>) => {
      snimak.props.push(props);
      return null;
    },
  };
});
const { RedArtikla: StvarniRed } = await vi.importActual<typeof import("./red-artikla/red-artikla")>("./red-artikla/red-artikla");

const nista = () => undefined;
const nikad = nista as never;

const jeMemo = (komponenta: unknown) => (komponenta as { $$typeof?: symbol }).$$typeof === Symbol.for("react.memo");

const meni = fixtureMenu("veliki");
const glavna = meni.snapshot.pages.find((page) => page.isDefault);
const sadrzaj = glavna ? sadrzajIzSnapshota(meni.snapshot, glavna.key) : null;
if (!sadrzaj) throw new Error("the veliki fixture has no main page content");
const brojRedova = sadrzaj.sekcije.reduce((zbir, sekcija) => zbir + sekcija.redovi.length, 0);

/** What the next answer of the server looks like: the same data, brand-new objects. */
const odgovorServera = (): StudioRadniSadrzaj => JSON.parse(JSON.stringify(sadrzaj)) as StudioRadniSadrzaj;

// -----------------------------------------------------------------------------
// C6: the memo of a row really skips
// -----------------------------------------------------------------------------

describe("K33 C6: a row is memoized and gets the same props while its data is the same", () => {
  // One set of everything a section receives that does not depend on the answer.
  const NEDOSTUPNI = new Set<string>();
  const RED = new AutosaveRed();
  const RADNJE: RedRadnje = { onCena: nista, onPonovo: nista, onZadrziMoju: nista, onUzmiSacuvanu: nista, onRadnja: nista, onIzaberi: nista };

  /** The props every row of every section was given in one render of the page. */
  function propsRedova(trenutni: StudioRadniSadrzaj): Record<string, unknown>[] {
    snimak.props.length = 0;
    for (const sekcija of trenutni.sekcije) {
      renderToStaticMarkup(
        <SekcijaBlok
          sekcija={sekcija}
          redovi={sekcija.redovi}
          skupljena={false}
          onSkupi={nista}
          nedostupni={NEDOSTUPNI}
          red={RED}
          mozeUredjivanje
          redRadnje={RADNJE}
          brziUnosOtvoren={false}
          onBrziUnos={nista}
          onDodaj={nikad}
          onDodajPostojeci={nikad}
          onPreimenuj={nikad}
          onObrisi={nista}
          prevlacenje
        />,
      );
    }
    return snimak.props.slice();
  }

  /** `React.memo` default: skips when every prop is the same value. */
  const memoPreskace = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const kljucevi = Object.keys(a);
    return kljucevi.length === Object.keys(b).length && kljucevi.every((kljuc) => Object.is(a[kljuc], b[kljuc]));
  };
  const brojPreskocenih = (pre: Record<string, unknown>[], posle: Record<string, unknown>[]) =>
    posle.filter((props, indeks) => memoPreskace(props, pre[indeks])).length;

  test("the page is a big one, and the row is a memo component", () => {
    expect(brojRedova).toBeGreaterThanOrEqual(400);
    expect(jeMemo(StvarniRed)).toBe(true);
  });

  test("the live preview body is a memo component too (it is deferred, not redrawn with the list)", () => {
    expect(jeMemo(PregledSadrzaj)).toBe(true);
  });

  test("control: new objects for the same data skip nothing (the bug before the sharing)", () => {
    const pre = propsRedova(sadrzaj);
    const posle = propsRedova(odgovorServera());
    expect(posle).toHaveLength(brojRedova);
    expect(brojPreskocenih(pre, posle)).toBe(0);
  });

  test("an answer with the same data: after the sharing every row skips", () => {
    const pre = propsRedova(sadrzaj);
    const deljeno = zadrziSadrzaj(sadrzaj, odgovorServera());
    expect(deljeno).toBe(sadrzaj);
    const posle = propsRedova(deljeno);
    expect(brojPreskocenih(pre, posle)).toBe(brojRedova);
  });

  test("one saved price: exactly one row is drawn again, in its own section", () => {
    const pre = propsRedova(sadrzaj);
    const si = sadrzaj.sekcije.findIndex((sekcija) => sekcija.redovi.length > 2);
    expect(si).toBeGreaterThanOrEqual(0);
    const dolazi = odgovorServera();
    dolazi.sekcije[si].redovi[2].artikal.cena = 99999;
    const deljeno = zadrziSadrzaj(sadrzaj, dolazi);
    const posle = propsRedova(deljeno);

    expect(posle).toHaveLength(brojRedova);
    const promenjeni = posle.flatMap((props, indeks) => (memoPreskace(props, pre[indeks]) ? [] : [props.red as StudioRed]));
    expect(promenjeni).toHaveLength(1);
    expect(promenjeni[0].artikal.cena).toBe(99999);
    expect(promenjeni[0].prikazId).toBe(sadrzaj.sekcije[si].redovi[2].prikazId);
    expect(brojPreskocenih(pre, posle)).toBe(brojRedova - 1);
  });
});

// -----------------------------------------------------------------------------
// Keyboard (390 px walk): the theme button must not cover a control Tab scrolled to
// the bottom edge. The button is fixed at bottom 1 rem, 2.75 rem high: its top edge is
// 3.75 rem from the window's bottom. Tab scrolls to the element's scroll margin.
// -----------------------------------------------------------------------------

describe("K33 keyboard: the controls of a row keep clear of the theme button below 1024 px", () => {
  const TEMA_GORE_REM = 3.75;
  const red: StudioRed = sadrzaj.sekcije[0].redovi[0];
  const RADNJE: RedRadnje = { onCena: nista, onPonovo: nista, onZadrziMoju: nista, onUzmiSacuvanu: nista, onRadnja: nista, onIzaberi: nista };

  const prikaz = (izmene: { cenaStanje?: StanjePolja; izborAktivan?: boolean } = {}) =>
    renderToStaticMarkup(
      <ul>
        <StvarniRed red={red} nedostupan={false} cenaStanje={izmene.cenaStanje} sacuvanoU={undefined} mozeUredjivanje prevlacenje izborAktivan={izmene.izborAktivan} radnje={RADNJE} />
      </ul>,
    );
  const klase = (html: string) => (/<li\b[^>]*\sclass="([^"]*)"/.exec(html)?.[1] ?? "").replace(/&amp;/g, "&").split(/\s+/);
  /** Tag names of everything in the row the keyboard can reach. */
  const fokusabilni = (html: string) => [...new Set([...html.matchAll(/<(button|input|select|textarea|a)\b/g)].map((match) => match[1]))].sort();
  /** The bottom scroll margin (rem) the row gives the descendants with this tag, below 1024 px. */
  const marginaRem = (html: string, tag: string) => {
    for (const klasa of klase(html)) {
      const broj = new RegExp(`^max-lg:\\[&_${tag}\\]:scroll-mb-(\\d+)$`).exec(klasa)?.[1];
      if (broj) return Number(broj) * 0.25;
    }
    return 0;
  };

  test("the row has the controls under test: the menu button and the price field", () => {
    const html = prikaz();
    expect(html).toContain(`data-meni-reda="${red.prikazId}"`);
    expect(html).toContain("data-cena-polje");
    expect(fokusabilni(html)).toEqual(["button", "input"]);
  });

  test("every kind of control in the row has a bottom scroll margin of at least 5 rem", () => {
    const stanja: { naziv: string; html: string }[] = [
      { naziv: "quiet", html: prikaz() },
      { naziv: "conflict (two buttons)", html: prikaz({ cenaStanje: { faza: "konflikt", vrednost: 250, sacuvano: 260, pokusano: 250 } }) },
      { naziv: "failed save (retry button)", html: prikaz({ cenaStanje: { faza: "greska", vrednost: 250, kod: "mreza", ponovljivo: true } }) },
    ];
    for (const { naziv, html } of stanja) {
      const tagovi = fokusabilni(html);
      expect(tagovi.length, naziv).toBeGreaterThan(0);
      for (const tag of tagovi) expect(marginaRem(html, tag), `${naziv}: <${tag}>`).toBeGreaterThanOrEqual(5);
    }
  });

  test("the margin clears the theme button (top edge 3.75 rem) and equals the panel's 6 rem of free space", () => {
    const html = prikaz();
    for (const tag of ["button", "input"]) {
      expect(marginaRem(html, tag)).toBeGreaterThan(TEMA_GORE_REM);
      expect(marginaRem(html, tag)).toBe(6);
    }
  });

  test("`Izaberi vise` adds a checkbox (an input): it is covered by the same rule", () => {
    const html = prikaz({ izborAktivan: true });
    expect(html).toContain('type="checkbox"');
    for (const tag of fokusabilni(html)) expect(marginaRem(html, tag), `<${tag}>`).toBeGreaterThanOrEqual(5);
  });

  test("only below 1024 px: the desktop layout is not changed (no unconditional scroll-mb on the row)", () => {
    for (const klasa of klase(prikaz())) {
      if (/scroll-mb-/.test(klasa)) expect(klasa.startsWith("max-lg:"), klasa).toBe(true);
    }
  });
});
