// K08 render tests: the client panel shell (MenuPanelShell) with its section
// navigation (PanelNav). The shell is a client component, but a static render
// shows its initial state: the rail collapsed or not, the phone drawer closed.
// A closed drawer renders no content, so the only navigation in the markup is
// the side navigation (from 1024 px).
//
// The shared next/link stub (vitest.config.ts) keeps only href, children and
// className, so it drops aria-current, title and data-sekcija. These tests need
// them, so the file replaces the stub with one that forwards every anchor
// attribute. It builds the element with createElement: it is the stand-in for
// next/link.

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuActor } from "@/lib/menu/permissions";
import {
  klijentskiPanelHref,
  PANEL_NAV_SEKCIJE,
  panelNavStavke,
  panelSekcijaHref,
  type PanelNavSekcija,
} from "@/lib/menu/panel-nav";
import { SEKCIJA_IKONICA } from "./nav";
import { MENU_PANEL_SADRZAJ_ID, MenuPanelShell } from "./shell";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

const render = (node: ReactNode) => renderToStaticMarkup(node);
const t = menuPanelSr;

const SLUG = "demo-restoran";
const LOKAL = "Demo restoran";
const KLIJENTSKI_HREF = klijentskiPanelHref(SLUG);
const REZIM = fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes.hospitality });
const BOCNA_NAVIGACIJA_ID = "menu-panel-bocna-navigacija";

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
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The markup of the first <tag>...</tag> (not nested in itself). */
function element(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`).exec(html);
  if (!match) throw new Error(`no <${tag}> element in: ${html}`);
  return match[0];
}

type Sidro = {
  tag: string;
  inner: string;
  href: string | undefined;
  sekcija: string | undefined;
  title: string | undefined;
  current: boolean;
  text: string;
};

function sidra(html: string): Sidro[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const tag = `<a${match[1]}>`;
    return {
      tag,
      inner: match[2],
      href: attr(tag, "href"),
      sekcija: attr(tag, "data-sekcija"),
      title: attr(tag, "title"),
      current: attr(tag, "aria-current") === "page",
      text: match[2].replace(/<[^>]+>/g, "").trim(),
    };
  });
}

/** The links of the one <nav> in the markup. */
const navLinks = (html: string) => sidra(element(html, "nav"));

/** The classes of the <span> that holds `text`; [] for a span without a class, undefined when there is none. */
function spanKlase(inner: string, text: string): string[] | undefined {
  const match = new RegExp(`<span(?:\\sclass="([^"]*)")?>${esc(text)}</span>`).exec(inner);
  if (!match) return undefined;
  return match[1] ? match[1].split(/\s+/) : [];
}

function dugmeSaOznakom(html: string, oznaka: string): string | undefined {
  return [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]).find((tag) => attr(tag, "aria-label") === oznaka);
}

type DugmeUMarkupu = { tag: string; inner: string; text: string };

function dugmad(html: string): DugmeUMarkupu[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
    tag: `<button${match[1]}>`,
    inner: match[2],
    text: match[2].replace(/<[^>]+>/g, "").trim(),
  }));
}

/** The markup of the <div> that opens at `od`, up to its matching </div>. */
function divOd(html: string, od: number): string {
  const trag = /<div\b|<\/div>/g;
  trag.lastIndex = od;
  let dubina = 0;
  for (let nadjeno = trag.exec(html); nadjeno; nadjeno = trag.exec(html)) {
    dubina += nadjeno[0] === "</div>" ? -1 : 1;
    if (dubina === 0) return html.slice(od, trag.lastIndex);
  }
  throw new Error("unbalanced <div>");
}

/**
 * The paragraphs of the block that holds the role line (the block is a <div>
 * that opens with it): the role line and, for a role that sees fewer than the
 * eight sections, the sentence about the others.
 */
function ulogaBlok(html: string, uloga: string): string[] {
  const red = `<p>${esc(fmt(t.shell.uloga, { uloga }))}</p>`;
  const na = html.indexOf(red);
  if (na === -1) throw new Error(`no role line "${red}" in: ${html}`);
  const blok = divOd(html, html.lastIndexOf("<div", na));
  return [...blok.matchAll(/<p>([^<]*)<\/p>/g)].map((match) => match[1]);
}

type ShellOpcije = {
  actor?: MenuActor;
  aktivna?: PanelNavSekcija | null;
  premium?: boolean;
  children?: ReactNode;
};

function renderShell({
  actor = "owner",
  aktivna = "pocetna",
  premium = false,
  children = <p data-sadrzaj="">Sadržaj sekcije</p>,
}: ShellOpcije = {}): string {
  return render(
    <MenuPanelShell
      lokal={LOKAL}
      rezim={REZIM}
      premium={premium}
      uloga={menuDomenSr.roles[actor]}
      stavke={panelNavStavke(actor, (sekcija) => panelSekcijaHref(SLUG, sekcija))}
      aktivna={aktivna}
      klijentskiPanelHref={KLIJENTSKI_HREF}
    >
      {children}
    </MenuPanelShell>,
  );
}

const SVE_SEKCIJE: readonly PanelNavSekcija[] = PANEL_NAV_SEKCIJE;

describe("side navigation", () => {
  const html = renderShell();

  test("is the only nav in the markup (a closed drawer renders nothing), named for the panel", () => {
    expect(count(html, "<nav")).toBe(1);
    expect(openTag(html, "nav")).toContain(`aria-label="${esc(t.shell.navigacija)}"`);
    expect(html).not.toContain('role="dialog"');
  });

  test("lists the eight sections in the locked order", () => {
    const links = navLinks(html);
    expect(links).toHaveLength(8);
    expect(links.map((link) => link.sekcija)).toEqual([
      "pocetna",
      "editor",
      "operativa",
      "lokal",
      "funkcionalnosti",
      "tim",
      "analitika",
      "podesavanja",
    ]);
    expect(links.map((link) => link.text)).toEqual([
      esc(t.sekcije.pocetna),
      esc(t.sekcije.editor),
      esc(t.sekcije.operativa),
      esc(t.sekcije.lokal),
      esc(t.sekcije.funkcionalnosti),
      esc(t.sekcije.tim),
      esc(t.sekcije.analitika),
      esc(t.sekcije.podesavanja),
    ]);
    expect(links.map((link) => link.href)).toEqual(SVE_SEKCIJE.map((sekcija) => panelSekcijaHref(SLUG, sekcija)));
  });

  test("Analitika is second to last, right above Podešavanja", () => {
    const sekcije = navLinks(html).map((link) => link.sekcija);
    expect(sekcije[sekcije.length - 2]).toBe("analitika");
    expect(sekcije[sekcije.length - 1]).toBe("podesavanja");
    expect(html.indexOf('data-sekcija="analitika"')).toBeLessThan(html.indexOf('data-sekcija="podesavanja"'));
  });

  test("the page links to exactly the skip link, the eight sections and the way back to the client panel", () => {
    expect(sidra(html).map((link) => link.href)).toEqual([
      `#${MENU_PANEL_SADRZAJ_ID}`,
      ...SVE_SEKCIJE.map((sekcija) => panelSekcijaHref(SLUG, sekcija)),
      KLIJENTSKI_HREF,
    ]);
  });

  test("the list keeps its items 8 px apart", () => {
    expect(klase(openTag(element(html, "nav"), "ul"))).toContain("gap-2");
    expect(count(element(html, "nav"), "<ul")).toBe(1);
  });

  test("every link is at least --mp-meta high and has one decorative icon", () => {
    for (const link of navLinks(html)) {
      expect(klase(link.tag)).toContain("min-h-[var(--mp-meta)]");
      expect(count(link.inner, "<svg")).toBe(1);
      expect(openTag(link.inner, "svg")).toContain('aria-hidden="true"');
    }
  });

  test("every section has its own icon, so the rail tells them apart", () => {
    expect(new Set(SVE_SEKCIJE.map((sekcija) => SEKCIJA_IKONICA[sekcija])).size).toBe(8);
    const ikonice = navLinks(html).map((link) => attr(openTag(link.inner, "svg"), "class"));
    expect(ikonice.every((ikonica) => ikonica !== undefined)).toBe(true);
    expect(new Set(ikonice).size).toBe(8);
  });
});

describe("role visibility, end to end", () => {
  const CASES: readonly { actor: MenuActor; vidljive: readonly PanelNavSekcija[] }[] = [
    { actor: "owner", vidljive: SVE_SEKCIJE },
    { actor: "manager", vidljive: SVE_SEKCIJE },
    { actor: "admin", vidljive: SVE_SEKCIJE },
    { actor: "editor", vidljive: ["pocetna", "editor"] },
  ];

  for (const { actor, vidljive } of CASES) {
    test(`${actor} sees ${vidljive.length} sections, in order, and never a link to a hidden one`, () => {
      const html = renderShell({ actor });
      const links = navLinks(html);
      expect(links.map((link) => link.sekcija)).toEqual([...vidljive]);

      const sakrivene = SVE_SEKCIJE.filter((sekcija) => !vidljive.includes(sekcija));
      const svi = sidra(html).map((link) => link.href);
      for (const sekcija of sakrivene) {
        expect(svi).not.toContain(panelSekcijaHref(SLUG, sekcija));
        expect(html).not.toContain(`data-sekcija="${sekcija}"`);
      }
    });
  }

  test("an editor gets exactly Početna and Editor, and no link under /tim", () => {
    const html = renderShell({ actor: "editor" });
    expect(navLinks(html)).toHaveLength(2);
    expect(navLinks(html).map((link) => link.text)).toEqual([esc(t.sekcije.pocetna), esc(t.sekcije.editor)]);
    expect(sidra(html).filter((link) => link.href?.includes("/tim"))).toEqual([]);
    expect(html).not.toContain("/tim");
  });

  test("the role line follows the role", () => {
    for (const actor of ["owner", "manager", "editor", "admin"] as const) {
      expect(renderShell({ actor })).toContain(`>${esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles[actor] }))}</p>`);
    }
  });
});

describe("the current section", () => {
  for (const aktivna of SVE_SEKCIJE) {
    test(`aktivna ${aktivna}: aria-current=page on exactly that link, which alone has the ink bar`, () => {
      const html = renderShell({ aktivna });
      const links = navLinks(html);
      const current = links.filter((link) => link.current);
      expect(count(html, "aria-current")).toBe(1);
      expect(count(html, 'aria-current="page"')).toBe(1);
      expect(current).toHaveLength(1);
      expect(current[0].sekcija).toBe(aktivna);
      for (const link of links) {
        expect(link.inner.includes("w-[3px]")).toBe(link.current);
      }
      expect(count(html, "w-[3px]")).toBe(1);
    });
  }

  test("the current link is not colour alone: bold text, a thin ring and a decorative ink bar", () => {
    const [current, ...others] = [...navLinks(renderShell({ aktivna: "operativa" }))].sort(
      (a, b) => Number(b.current) - Number(a.current),
    );
    expect(klase(current.tag)).toContain("font-semibold");
    expect(klase(current.tag)).toContain("ring-1");
    expect(klase(current.tag)).toContain("ring-inset");
    expect(current.inner).toMatch(/<span aria-hidden="true" class="[^"]*w-\[3px\][^"]*"><\/span>/);
    for (const link of others) {
      expect(klase(link.tag)).not.toContain("font-semibold");
      expect(klase(link.tag)).not.toContain("ring-1");
      expect(klase(link.tag)).not.toContain("ring-inset");
    }
  });

  test("the ring marks the current link in every section, and only that link", () => {
    for (const aktivna of SVE_SEKCIJE) {
      const sRingom = navLinks(renderShell({ aktivna })).filter((link) => klase(link.tag).includes("ring-1"));
      expect(sRingom.map((link) => link.sekcija)).toEqual([aktivna]);
    }
    expect(navLinks(renderShell({ aktivna: null })).filter((link) => klase(link.tag).includes("ring-1"))).toEqual([]);
  });

  test("with no active section there is no aria-current and no ink bar", () => {
    const html = renderShell({ aktivna: null });
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("w-[3px]");
    expect(navLinks(html)).toHaveLength(8);
  });
});

describe("the mode line", () => {
  const html = renderShell();

  test("the mode is spoken in words, in an element marked data-rezim, in the top bar and in the side navigation", () => {
    const rezimi = [...html.matchAll(/<p data-rezim=""[^>]*>([^<]*)<\/p>/g)].map((match) => match[1]);
    expect(rezimi).toEqual([esc(REZIM), esc(REZIM)]);
    // and nowhere else in the markup
    expect(count(html, esc(REZIM))).toBe(2);
    expect(REZIM).toContain(menuDomenSr.modes.hospitality);
  });

  test("the top bar and the side navigation both carry it", () => {
    expect(element(html, "header")).toContain(`>${esc(REZIM)}</p>`);
    expect(element(html, "aside")).toContain(`>${esc(REZIM)}</p>`);
  });

  test("the mode is shown, never a control (master §4.1)", () => {
    for (const aktivna of [...SVE_SEKCIJE, null]) {
      const stranica = renderShell({ aktivna, premium: true });
      expect(stranica).not.toContain("<select");
      expect(stranica).not.toContain('role="combobox"');
      expect(stranica).not.toContain('role="listbox"');
      expect(stranica).not.toContain('aria-haspopup="listbox"');
      expect(stranica).not.toContain("<input");
      expect(stranica).not.toContain("<textarea");
    }
  });

  test("the venue name is in the top bar and in the side navigation", () => {
    expect(element(html, "header")).toContain(`>${esc(LOKAL)}</p>`);
    expect(element(html, "aside")).toContain(`>${esc(LOKAL)}</p>`);
  });
});

describe("landmarks and the skip link", () => {
  const html = renderShell();

  test("the first focusable element is the skip link to the content", () => {
    const first = /<(?:a|button|input|select|textarea)\b[^>]*>/.exec(html);
    expect(first).not.toBeNull();
    const tag = first ? first[0] : "";
    expect(tag.startsWith("<a ")).toBe(true);
    expect(attr(tag, "href")).toBe("#menu-panel-sadrzaj");
    expect(html.slice(html.indexOf(tag) + tag.length).startsWith(`${esc(t.shell.preskoci)}</a>`)).toBe(true);
    expect(html.indexOf(tag)).toBeLessThan(html.indexOf("<header"));
    expect(html.indexOf(tag)).toBeLessThan(html.indexOf("<nav"));
  });

  test("the skip link is hidden until focused", () => {
    const skip = sidra(html)[0];
    expect(skip.text).toBe(esc(t.shell.preskoci));
    expect(klase(skip.tag)).toContain("sr-only");
    expect(klase(skip.tag)).toContain("focus:not-sr-only");
  });

  test("main is its target, exactly once, and can take focus", () => {
    expect(MENU_PANEL_SADRZAJ_ID).toBe("menu-panel-sadrzaj");
    expect(count(html, "<main")).toBe(1);
    expect(count(html, '<main id="menu-panel-sadrzaj"')).toBe(1);
    expect(count(html, 'id="menu-panel-sadrzaj"')).toBe(1);
    expect(openTag(html, "main")).toContain('tabindex="-1"');
  });

  test("reading order is top bar, side navigation, content", () => {
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<aside"));
    expect(html.indexOf("<aside")).toBeLessThan(html.indexOf("<main"));
  });

  test("the shell adds no heading of its own: the section brings its h1", () => {
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
    const sSekcijom = renderShell({ children: <h1>Naslov sekcije</h1> });
    expect(count(sSekcijom, "<h1")).toBe(1);
  });

  test("the top bar is for below 1024 px and the side navigation from 1024 px", () => {
    expect(klase(openTag(html, "header"))).toContain("lg:hidden");
    expect(klase(openTag(html, "aside"))).toContain("hidden");
    expect(klase(openTag(html, "aside"))).toContain("lg:block");
  });
});

describe("Premium", () => {
  const znacka = `>${esc(t.shell.premium)}</span>`;

  test("premium shows the badge, with an icon, in the side navigation", () => {
    const html = renderShell({ premium: true });
    expect(count(html, znacka)).toBe(1);
    expect(element(html, "aside")).toContain(znacka);
    expect(html).toContain('data-status-ton="neutralno"');
  });

  test("no premium, no badge", () => {
    const html = renderShell({ premium: false });
    expect(html).not.toContain(esc(t.shell.premium));
    expect(html).not.toContain("data-status-ton");
  });
});

describe("the role line and the way back", () => {
  test("the role line names the role", () => {
    const html = renderShell({ actor: "owner" });
    expect(html).toContain(`>${esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles.owner }))}</p>`);
    expect(count(html, esc(menuDomenSr.roles.owner))).toBe(1);
  });

  test("the role block of a role that sees all eight sections holds the role line and nothing else", () => {
    for (const actor of ["owner", "manager", "admin"] as const) {
      const html = renderShell({ actor });
      expect(navLinks(html)).toHaveLength(8);
      expect(ulogaBlok(html, menuDomenSr.roles[actor])).toEqual([esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles[actor] }))]);
      expect(html).not.toContain(esc(t.shell.ostaleSekcije));
    }
  });

  test("an editor, who sees fewer than eight sections, is told in the same block who sees the others", () => {
    const html = renderShell({ actor: "editor" });
    expect(navLinks(html)).toHaveLength(2);
    expect(ulogaBlok(html, menuDomenSr.roles.editor)).toEqual([
      esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles.editor })),
      esc(t.shell.ostaleSekcije),
    ]);
    expect(count(html, esc(t.shell.ostaleSekcije))).toBe(1);
    expect(html.indexOf(esc(t.shell.ostaleSekcije))).toBeGreaterThan(html.indexOf(esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles.editor }))));
  });

  test("the sentence about the other sections appears exactly when the list is shorter than eight", () => {
    for (const actor of ["owner", "manager", "editor", "admin"] as const) {
      const html = renderShell({ actor });
      expect(count(html, esc(t.shell.ostaleSekcije))).toBe(navLinks(html).length < SVE_SEKCIJE.length ? 1 : 0);
    }
  });

  test("the link back goes to the given client panel href, labelled Nazad na klijentski panel, with a decorative layout-grid icon", () => {
    const html = renderShell();
    const nazad = sidra(html).filter((link) => link.href === KLIJENTSKI_HREF);
    expect(nazad).toHaveLength(1);
    expect(nazad[0].text).toBe(esc(t.shell.nazadNaKlijentskiPanel));
    expect(nazad[0].title).toBeUndefined();
    expect(spanKlase(nazad[0].inner, t.shell.nazadNaKlijentskiPanel)).toEqual([]);
    expect(klase(nazad[0].tag)).toContain("min-h-[var(--mp-meta)]");
    expect(count(nazad[0].inner, "<svg")).toBe(1);
    expect(openTag(nazad[0].inner, "svg")).toContain('aria-hidden="true"');
    expect(openTag(nazad[0].inner, "svg")).toContain("lucide-layout-grid");
  });

  test("another client panel href is used as given", () => {
    const html = render(
      <MenuPanelShell
        lokal={LOKAL}
        rezim={REZIM}
        premium={false}
        uloga={menuDomenSr.roles.owner}
        stavke={panelNavStavke("owner", (sekcija) => panelSekcijaHref(SLUG, sekcija))}
        aktivna="pocetna"
        klijentskiPanelHref="/dev/menu-panel-preview?tema=tamna"
      >
        x
      </MenuPanelShell>,
    );
    const nazad = sidra(html).filter((link) => link.text === esc(t.shell.nazadNaKlijentskiPanel));
    expect(nazad.map((link) => link.href)).toEqual(["/dev/menu-panel-preview?tema=tamna"]);
  });
});

describe("the icon rail", () => {
  test("with the Editor open the initial render is collapsed", () => {
    const html = renderShell({ aktivna: "editor" });
    expect(count(html, "data-nav=")).toBe(1);
    expect(openTag(html, "div")).toContain('data-menu-panel=""');
    expect(openTag(html, "div")).toContain('data-nav="skupljena"');
    expect(html).not.toContain('data-nav="prosirena"');
  });

  test("the labels stay for screen readers and as the tooltip: sr-only text and a title on every link", () => {
    const links = navLinks(renderShell({ aktivna: "editor" }));
    expect(links).toHaveLength(8);
    for (const link of links) {
      const sekcija = link.sekcija as PanelNavSekcija;
      expect(link.title).toBe(t.sekcije[sekcija]);
      expect(spanKlase(link.inner, t.sekcije[sekcija])).toEqual(["sr-only"]);
      expect(klase(link.tag)).toContain("size-[var(--mp-meta)]");
    }
  });

  test("the way back keeps its label as the tooltip too", () => {
    const html = renderShell({ aktivna: "editor" });
    const nazad = sidra(html).filter((link) => link.href === KLIJENTSKI_HREF);
    expect(nazad).toHaveLength(1);
    expect(nazad[0].title).toBe(t.shell.nazadNaKlijentskiPanel);
    expect(spanKlase(nazad[0].inner, t.shell.nazadNaKlijentskiPanel)).toEqual(["sr-only"]);
    expect(klase(nazad[0].tag)).toContain("size-[var(--mp-meta)]");
    expect(openTag(nazad[0].inner, "svg")).toContain("lucide-layout-grid");
  });

  test("the expand button is named, reports it is collapsed and controls the side navigation", () => {
    const html = renderShell({ aktivna: "editor" });
    const prosiri = dugmeSaOznakom(html, t.shell.prosiriNavigaciju);
    expect(prosiri).toBeDefined();
    const tag = prosiri ?? "";
    expect(attr(tag, "aria-expanded")).toBe("false");
    expect(attr(tag, "aria-controls")).toBe(BOCNA_NAVIGACIJA_ID);
    expect(attr(tag, "type")).toBe("button");
    expect(count(html, `id="${BOCNA_NAVIGACIJA_ID}"`)).toBe(1);
    expect(html).not.toContain(esc(t.shell.skupiNavigaciju));
  });

  test("the rail drops the wordmark, the venue block and the role line", () => {
    const html = renderShell({ aktivna: "editor", premium: true });
    expect(html).not.toContain("scanme-wordmark");
    expect(html).not.toContain(`>${esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles.owner }))}</p>`);
    expect(element(html, "aside")).not.toContain("data-rezim");
  });

  test("an editor's rail drops the sentence about the other sections together with the role line", () => {
    const html = renderShell({ aktivna: "editor", actor: "editor" });
    expect(html).toContain('data-nav="skupljena"');
    expect(html).not.toContain(esc(t.shell.ostaleSekcije));
    expect(html).not.toContain(`>${esc(fmt(t.shell.uloga, { uloga: menuDomenSr.roles.editor }))}</p>`);
  });

  test("with another section open it is expanded, with the collapse button", () => {
    const html = renderShell({ aktivna: "operativa" });
    expect(count(html, "data-nav=")).toBe(1);
    expect(openTag(html, "div")).toContain('data-nav="prosirena"');
    expect(html).not.toContain('data-nav="skupljena"');

    const dugmad = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
      tag: `<button${match[1]}>`,
      text: match[2].replace(/<[^>]+>/g, "").trim(),
    }));
    const skupi = dugmad.filter((dugme) => dugme.text === esc(t.shell.skupiNavigaciju));
    expect(skupi).toHaveLength(1);
    expect(attr(skupi[0].tag, "aria-expanded")).toBe("true");
    expect(attr(skupi[0].tag, "aria-controls")).toBe(BOCNA_NAVIGACIJA_ID);
    expect(count(html, `id="${BOCNA_NAVIGACIJA_ID}"`)).toBe(1);
    expect(dugmeSaOznakom(html, t.shell.prosiriNavigaciju)).toBeUndefined();
  });

  test("expanded, the labels are visible text and the links carry no tooltip", () => {
    for (const link of navLinks(renderShell({ aktivna: "operativa" }))) {
      const sekcija = link.sekcija as PanelNavSekcija;
      expect(link.title).toBeUndefined();
      expect(spanKlase(link.inner, t.sekcije[sekcija])).toEqual(["min-w-0", "truncate"]);
      expect(klase(link.tag)).not.toContain("size-[var(--mp-meta)]");
    }
  });

  test("only the Editor starts collapsed; every other section and no section start expanded", () => {
    for (const aktivna of [...SVE_SEKCIJE, null]) {
      const html = renderShell({ aktivna });
      expect(openTag(html, "div")).toContain(`data-nav="${aktivna === "editor" ? "skupljena" : "prosirena"}"`);
    }
  });
});

describe("the phone top bar", () => {
  const html = renderShell();
  const traka = element(html, "header");

  test("has one button, the drawer trigger: closed, no drawer in the markup", () => {
    expect(dugmad(traka)).toHaveLength(1);
    const { tag } = dugmad(traka)[0];
    expect(attr(tag, "aria-haspopup")).toBe("dialog");
    expect(attr(tag, "aria-expanded")).toBe("false");
    expect(attr(tag, "data-state")).toBe("closed");
    expect(attr(tag, "type")).toBe("button");
    expect(html).not.toContain('role="dialog"');
  });

  test("the trigger is named by its visible text Sekcije (sr-only only below 640 px), not by an aria-label", () => {
    const okidac = dugmad(traka)[0];
    expect(okidac.text).toBe(esc(t.shell.otvoriNavigaciju));
    expect(attr(okidac.tag, "aria-label")).toBeUndefined();
    expect(count(html, `aria-label="${esc(t.shell.otvoriNavigaciju)}"`)).toBe(0);
    expect(spanKlase(okidac.inner, t.shell.otvoriNavigaciju)).toEqual(["sr-only", "sm:not-sr-only"]);
    // and a decorative menu icon in front of it
    expect(count(okidac.inner, "<svg")).toBe(1);
    expect(openTag(okidac.inner, "svg")).toContain('aria-hidden="true"');
    expect(openTag(okidac.inner, "svg")).toContain("lucide-menu");
    expect(okidac.inner.indexOf("<svg")).toBeLessThan(okidac.inner.indexOf("<span"));
  });

  test("the trigger is a touch target and comes before the venue name", () => {
    const { tag } = dugmad(traka)[0];
    expect(klase(tag)).toContain("min-h-[var(--mp-meta)]");
    expect(traka.indexOf(tag)).toBeLessThan(traka.indexOf(`>${esc(LOKAL)}</p>`));
  });

  test("the trigger is the second focusable element, right after the skip link", () => {
    const fokusabilni = [...html.matchAll(/<(?:a|button)\b[^>]*>/g)].map((match) => match[0]);
    expect(attr(fokusabilni[0], "href")).toBe("#menu-panel-sadrzaj");
    expect(fokusabilni[1].startsWith("<button")).toBe(true);
    expect(attr(fokusabilni[1], "aria-haspopup")).toBe("dialog");
    expect(dugmad(html)[0].text).toBe(esc(t.shell.otvoriNavigaciju));
  });

  test("the drawer holds no second navigation while closed, so the section links are not duplicated", () => {
    expect(count(html, "<nav")).toBe(1);
    expect(navLinks(html)).toHaveLength(8);
    expect(traka).not.toContain("<nav");
  });
});

describe("content", () => {
  test("children render inside main, after the navigation", () => {
    const html = renderShell({ children: <p data-sadrzaj="">Sadržaj sekcije</p> });
    const main = element(html, "main");
    expect(main).toContain('<p data-sadrzaj="">Sadržaj sekcije</p>');
    expect(count(html, "data-sadrzaj")).toBe(1);
    expect(html.indexOf("data-sadrzaj")).toBeGreaterThan(html.indexOf("</aside>"));
    expect(html.indexOf("data-sadrzaj")).toBeLessThan(html.indexOf("</main>"));
  });

  test("several children are all inside main, in order", () => {
    const html = renderShell({
      children: (
        <>
          <h1>Prvi</h1>
          <section>Drugi</section>
        </>
      ),
    });
    const main = element(html, "main");
    expect(main.indexOf("<h1>Prvi</h1>")).toBeGreaterThan(-1);
    expect(main.indexOf("<h1>Prvi</h1>")).toBeLessThan(main.indexOf("<section>Drugi</section>"));
  });
});
