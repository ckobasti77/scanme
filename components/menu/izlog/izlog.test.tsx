// K07 render tests: the izlog (dev preview) building blocks. IzlogKorak (the
// honest "a later step builds this" screen), IzlogOkvir (the frame with the
// five routes) and PrimitiviPregled (every panel primitive in every state).
//
// The shared next/link stub (vitest.config.ts) keeps only href, children and
// className, so it drops aria-current. These tests need aria-current, so the
// file replaces the stub with one that forwards every anchor attribute. It
// builds the element with createElement: it is the stand-in for next/link.

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { izlogHref, type IzlogTema } from "@/lib/menu/izlog-params";
import { IzlogKorak, type IzlogEkranLink } from "./izlog-korak";
import { IZLOG_RUTE, IzlogOkvir, type IzlogRuta } from "./izlog-okvir";
import { PrimitiviPregled } from "./primitivi-pregled";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

const render = (node: ReactNode) => renderToStaticMarkup(node);
const t = menuZajednickoSr.izlog;

// Built dynamically so this file stays clean under a raw substring scan for
// the other products' namespaces.
const VENUE_NS = ["--", "venue", "-"].join("");
const LINKS_NS = ["--", "links", "-"].join("");

// What React puts into markup for text.
const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

function openTag(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>`).exec(html);
  if (!match) throw new Error(`no <${tag}> in: ${html}`);
  return match[0];
}

function klase(tag: string): string[] {
  const match = /\sclass="([^"]*)"/.exec(tag);
  return match ? match[1].split(/\s+/) : [];
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

type Sidro = { tag: string; href: string | undefined; current: boolean; text: string };

function sidra(html: string): Sidro[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const tag = `<a${match[1]}>`;
    return {
      tag,
      href: attr(tag, "href"),
      current: attr(tag, "aria-current") === "page",
      text: match[2].replace(/<[^>]+>/g, "").trim(),
    };
  });
}

describe("IZLOG_RUTE", () => {
  test("is the five dev routes, each with a label", () => {
    expect(IZLOG_RUTE.map((r) => r.kljuc)).toEqual(["panel", "editor", "javni", "lokal", "konobar"]);
    expect(new Set(IZLOG_RUTE.map((r) => r.putanja)).size).toBe(5);
    for (const { kljuc, putanja } of IZLOG_RUTE) {
      expect(putanja).toMatch(/^\/dev\/menu-[a-z]+-preview$/);
      expect(t.rute[kljuc]).toBeTruthy();
    }
  });
});

describe("IzlogOkvir", () => {
  const okvir = (ruta: IzlogRuta, tema: IzlogTema | null, children: ReactNode = "sadržaj") =>
    render(
      <IzlogOkvir ruta={ruta} tema={tema}>
        {children}
      </IzlogOkvir>,
    );

  test("is a main landmark that holds the screen after the bar", () => {
    const html = okvir("panel", null, <p>Sadržaj ekrana</p>);
    expect(count(html, "<main")).toBe(1);
    expect(count(html, "<header")).toBe(1);
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("<main")).toBeLessThan(html.indexOf("Sadržaj ekrana"));
    expect(html.indexOf("Sadržaj ekrana")).toBeLessThan(html.indexOf("</main>"));
  });

  test("says in the bar that the data is invented", () => {
    const html = okvir("panel", null);
    expect(html).toContain('data-status-ton="info"');
    expect(html).toContain(`>${esc(t.oznaka)}</span>`);
  });

  test("has a named nav with the five routes in order", () => {
    const html = okvir("panel", null);
    expect(count(html, "<nav")).toBe(1);
    expect(openTag(html, "nav")).toContain(`aria-label="${esc(t.sveRute)}"`);
    const links = sidra(html);
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.text)).toEqual(IZLOG_RUTE.map((r) => t.rute[r.kljuc]));
    expect(links.map((link) => link.href)).toEqual(IZLOG_RUTE.map((r) => r.putanja));
  });

  for (const { kljuc } of IZLOG_RUTE) {
    test(`ruta ${kljuc} marks exactly its own link as the current page`, () => {
      const links = sidra(okvir(kljuc, null));
      const current = links.filter((link) => link.current);
      expect(current).toHaveLength(1);
      expect(current[0].text).toBe(t.rute[kljuc]);
      for (const link of links) {
        expect(link.tag.includes('aria-current="page"')).toBe(link.current);
      }
    });
  }

  test("every link is at least --mp-meta high", () => {
    for (const link of sidra(okvir("panel", null))) expect(klase(link.tag)).toContain("min-h-[var(--mp-meta)]");
  });

  test("tema tamna is kept on every link", () => {
    const links = sidra(okvir("editor", "tamna"));
    expect(links.map((link) => link.href)).toEqual(IZLOG_RUTE.map((r) => `${r.putanja}?tema=tamna`));
    for (const link of links) expect(link.href).toContain("tema=tamna");
  });

  test("tema svetla is kept on every link", () => {
    for (const link of sidra(okvir("editor", "svetla"))) expect(link.href).toContain("tema=svetla");
  });

  test("a null tema leaves the URLs clean", () => {
    const html = okvir("editor", null);
    expect(html).not.toContain("tema=");
    expect(sidra(html).map((link) => link.href)).toEqual(IZLOG_RUTE.map((r) => r.putanja));
  });

  test("the surface is the panel by default and konobar when asked", () => {
    expect(openTag(okvir("panel", null), "div")).toContain('data-povrsina="panel"');
    const konobar = render(
      <IzlogOkvir ruta="konobar" tema={null} povrsina="konobar">
        x
      </IzlogOkvir>,
    );
    expect(openTag(konobar, "div")).toContain('data-povrsina="konobar"');
  });
});

describe("IzlogKorak", () => {
  const PUTANJA = "/dev/menu-konobar-preview";
  const EKRANI: readonly IzlogEkranLink[] = [
    { href: PUTANJA, oznaka: t.konobarEkrani.red, trenutni: true },
    { href: izlogHref(PUTANJA, { ekran: "pin" }), oznaka: t.konobarEkrani.pin, trenutni: false },
    { href: izlogHref(PUTANJA, { ekran: "detalj" }), oznaka: t.konobarEkrani.detalj, trenutni: false },
  ];
  const html = render(<IzlogKorak kontekst={t.naslovi.konobar} naslov={t.konobarEkrani.red} korak="K22" ekrani={EKRANI} />);

  test("renders exactly one h1 with the screen name, and the context line", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(new RegExp(`<h1\\b[^>]*>${esc(t.konobarEkrani.red)}</h1>`));
    expect(html).toContain(`>${esc(t.naslovi.konobar)}</p>`);
  });

  test("says which step builds the screen", () => {
    expect(html).toContain(`>${esc(fmt(t.korakNaslov, { korak: "K22" }))}</h2>`);
    expect(html).toContain(esc(fmt(t.korakOpis, { korak: "K22" })));
    expect(html).toContain('data-izlog-korak="K22"');
    expect(html).toContain('data-stanje="prazno"');
  });

  test("another step number is reflected", () => {
    const other = render(<IzlogKorak kontekst="K" naslov="N" korak="K10" ekrani={[]} />);
    expect(other).toContain(esc(fmt(t.korakNaslov, { korak: "K10" })));
    expect(other).toContain('data-izlog-korak="K10"');
    expect(other).not.toContain("K22");
  });

  test("without a napomena there is no extra sentence", () => {
    expect(html).not.toContain("<br");
  });

  test("a napomena is rendered on its own line after the description", () => {
    const napomena = fmt(t.offlineKorak, { korak: "K22" });
    const withNote = render(
      <IzlogKorak kontekst="K" naslov="N" korak="K22" napomena={napomena} ekrani={EKRANI} />,
    );
    expect(withNote).toContain(`<br/>${esc(napomena)}`);
    expect(withNote.indexOf(esc(fmt(t.korakOpis, { korak: "K22" })))).toBeLessThan(withNote.indexOf("<br"));
  });

  test("lists the other screens in a labelled section", () => {
    expect(html).toContain(`>${esc(t.ostaliEkrani)}</h2>`);
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(openTag(html, "section"))?.[1];
    const headingId = new RegExp(`<h2\\b[^>]*\\sid="([^"]+)"[^>]*>${esc(t.ostaliEkrani)}</h2>`).exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(headingId).toBe(labelledBy);
  });

  test("renders one link per screen with aria-current=page exactly on the current one", () => {
    const links = sidra(html);
    expect(links).toHaveLength(EKRANI.length);
    expect(links.map((link) => link.text)).toEqual(EKRANI.map((ekran) => ekran.oznaka));
    expect(links.map((link) => link.href)).toEqual(EKRANI.map((ekran) => ekran.href));
    expect(links.map((link) => link.current)).toEqual([true, false, false]);
    expect(count(html, 'aria-current="page"')).toBe(1);
  });

  test("the links look like buttons: the current one primary, the others secondary, compact", () => {
    const [current, ...others] = sidra(html);
    expect(klase(current.tag)).toContain("bg-[var(--mp-mastilo)]");
    for (const link of others) {
      expect(klase(link.tag)).toContain("bg-[var(--mp-povrsina)]");
      expect(klase(link.tag)).not.toContain("bg-[var(--mp-mastilo)]");
    }
    for (const link of [current, ...others]) {
      expect(klase(link.tag)).toContain("min-h-[var(--mp-meta)]");
      expect(klase(link.tag)).toContain("px-4");
    }
    expect(html).not.toContain("<button");
  });

  test("without screens there are no links and no current page", () => {
    const none = render(<IzlogKorak kontekst="K" naslov="N" korak="K22" ekrani={[]} />);
    expect(sidra(none)).toHaveLength(0);
    expect(none).not.toContain("aria-current");
    expect(none).toContain(`>${esc(t.ostaliEkrani)}</h2>`);
  });

  test("heading outline: one h1, then h2s", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(count(html, "<h2")).toBe(2);
    expect(html).not.toContain("<h3");
  });
});

describe("PrimitiviPregled", () => {
  const p = t.primitivi;
  const pregled = render(<PrimitiviPregled fiokaOtvorena={false} />);

  test("renders without throwing", () => {
    expect(() => render(<PrimitiviPregled fiokaOtvorena={false} />)).not.toThrow();
    expect(pregled).toContain("data-primitivi");
  });

  test("shows every section title as a heading and every section description", () => {
    const naslovi = Object.entries(p.sekcije).filter(([kljuc]) => !kljuc.endsWith("Opis"));
    expect(naslovi).toHaveLength(9);
    for (const [, naslov] of naslovi) {
      expect(pregled).toMatch(new RegExp(`<h2\\b[^>]*>${esc(naslov)}</h2>`));
    }
    for (const opis of Object.values(p.sekcije)) expect(pregled).toContain(esc(opis));
  });

  test("has exactly one h1, the page title", () => {
    expect(count(pregled, "<h1")).toBe(1);
    expect(pregled).toMatch(new RegExp(`<h1\\b[^>]*>${esc(p.naslov)}</h1>`));
  });

  test("contains the drawer trigger, closed, with no dialog in the markup", () => {
    expect(pregled).toContain(esc(p.primeri.fiokaOtvori));
    expect(pregled).toContain('data-state="closed"');
    expect(pregled).not.toContain('role="dialog"');
    expect(pregled).not.toContain(esc(p.primeri.fiokaNaslov));
  });

  test("shows the empty, error, loading and offline states", () => {
    for (const stanje of ["prazno", "greska", "ucitavanje", "offline"]) {
      expect(pregled).toContain(`data-stanje="${stanje}"`);
    }
    for (const oblik of ["lista", "kartice", "tabela", "forma"]) {
      expect(pregled).toContain(`data-oblik="${oblik}"`);
    }
    expect(pregled).toContain('role="alert"');
  });

  test("shows all five tones, all three card tones and the layout pieces", () => {
    for (const ton of ["neutralno", "info", "uspeh", "upozorenje", "opasnost"]) {
      expect(pregled).toContain(`data-status-ton="${ton}"`);
    }
    for (const ton of ["obicna", "utisana", "istaknuta"]) expect(pregled).toContain(`data-kartica="${ton}"`);
    expect(count(pregled, "data-sav-objave=")).toBe(3);
    expect(pregled).toContain('data-sav-objave="izmene"');
    expect(pregled).toContain('data-sav-objave="cisto"');
    for (const stanje of ["sacuvano", "cuva-se", "greska"]) expect(pregled).toContain(`data-cuvanje="${stanje}"`);
    expect(pregled).toContain('data-traka-radnji="u-toku"');
    expect(pregled).toContain('data-traka-radnji="dno"');
    expect(count(pregled, 'data-povrsina="konobar"')).toBe(1);
  });

  test("shows the buttons in every kind and state", () => {
    // five kinds, each shown loading and disabled
    expect(count(pregled, 'aria-busy="true"')).toBe(5);
    expect(count(pregled, 'data-stanje="ucitava"')).toBe(5);
    expect(pregled).toContain('disabled=""');
    expect(pregled).toContain('aria-pressed="true"');
  });

  test("shows the switch and the checkbox in their states", () => {
    expect(count(pregled, 'role="switch"')).toBe(3);
    expect(count(pregled, 'data-polje-potvrde=""')).toBe(3);
    expect(pregled).toContain('checked=""');
    expect(pregled).toContain('aria-invalid="true"');
  });

  test("every button has a name: text or an aria-label", () => {
    const buttons = [...pregled.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
      tag: `<button${match[1]}>`,
      text: match[2]
        .replace(/<svg[\s\S]*?<\/svg>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim(),
    }));
    // the parser saw every button
    expect(buttons.length).toBe(count(pregled, "<button"));
    expect(buttons.length).toBeGreaterThan(20);
    const unnamed = buttons.filter(({ tag, text }) => text === "" && !attr(tag, "aria-label"));
    expect(unnamed).toEqual([]);
  });

  test("every input has a label pointing at it, and ids are unique", () => {
    const inputIds = [...pregled.matchAll(/<input\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    const labelTargets = [...pregled.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
    expect(inputIds).toHaveLength(6);
    expect(count(pregled, "<input")).toBe(inputIds.length);
    expect(labelTargets).toEqual(inputIds);
    const ids = [...pregled.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every section is labelled by a heading that exists", () => {
    const labelledBy = [...pregled.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(labelledBy).toHaveLength(9);
    for (const id of labelledBy) expect(pregled).toMatch(new RegExp(`<h[23]\\b[^>]*\\sid="${id}"`));
  });

  test("every svg is decorative", () => {
    const svgs = pregled.match(/<svg\b[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(30);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });
});

describe("namespace", () => {
  test("no rendered izlog markup uses another product's CSS namespace", () => {
    const html = [
      render(<PrimitiviPregled fiokaOtvorena={false} />),
      render(
        <IzlogOkvir ruta="lokal" tema="tamna">
          <IzlogKorak kontekst="K" naslov="N" korak="K20" napomena="Napomena" ekrani={[]} />
        </IzlogOkvir>,
      ),
    ].join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});
