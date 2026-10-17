// K07 render tests: the empty, error, loading and offline states in every
// variant. Each one says what happened and what comes next; errors are
// announced, loading is a skeleton, offline is a polite status.

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { GreskaStanje, OfflineTraka, PraznoStanje, UcitavanjeStanje, type UcitavanjeOblik } from "./stanja";

const render = (node: ReactNode) => renderToStaticMarkup(node);
const t = menuZajednickoSr.stanja;

// Built dynamically so this file stays clean under a raw substring scan for
// the other products' namespaces.
const VENUE_NS = ["--", "venue", "-"].join("");
const LINKS_NS = ["--", "links", "-"].join("");

function openTag(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>`).exec(html);
  if (!match) throw new Error(`no <${tag}> in: ${html}`);
  return match[0];
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

// An attribute of the tag, not a Tailwind variant.
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|>|/)`).test(tag);

describe("PraznoStanje", () => {
  const html = render(
    <PraznoStanje
      naslov="Ova stranica još nema artikala"
      opis="Dodajte prvi artikal."
      akcija={<Link href="/dodaj">Dodaj artikal</Link>}
    />,
  );

  test("is a data-stanje=prazno block that is not announced as an alert", () => {
    const tag = openTag(html, "div");
    expect(tag).toContain('data-stanje="prazno"');
    expect(hasAttr(tag, "role")).toBe(false);
  });

  test("the title is an h2 by default", () => {
    expect(html).toMatch(/<h2\b[^>]*>Ova stranica još nema artikala<\/h2>/);
    expect(html).not.toContain("<h3");
  });

  test("nivo 3 renders an h3", () => {
    const nested = render(<PraznoStanje nivo={3} naslov="Prazno" />);
    expect(nested).toMatch(/<h3\b[^>]*>Prazno<\/h3>/);
    expect(nested).not.toContain("<h2");
  });

  test("the description and the action are rendered", () => {
    expect(html).toMatch(/<p\b[^>]*>Dodajte prvi artikal\.<\/p>/);
    expect(html).toContain('<a href="/dodaj">Dodaj artikal</a>');
  });

  test("without a description or an action neither is rendered", () => {
    const bare = render(<PraznoStanje naslov="Prazno" />);
    expect(bare).not.toMatch(/<p[\s>]/);
    expect(bare).not.toContain("mt-2");
  });

  test("the icon is decorative, a custom ikonica replaces the default", () => {
    expect(count(html, "<svg")).toBe(1);
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
    const custom = render(<PraznoStanje ikonica={Lock} naslov="Zaključano" />);
    expect(count(custom, "<svg")).toBe(1);
    expect(openTag(custom, "svg")).toContain("lucide-lock");
    expect(openTag(html, "svg")).not.toContain("lucide-lock");
  });

  test("className is appended", () => {
    expect(openTag(render(<PraznoStanje naslov="X" className="py-20" />), "div")).toContain("py-20");
  });
});

describe("GreskaStanje", () => {
  test("is announced: role=alert and data-stanje=greska", () => {
    const tag = openTag(render(<GreskaStanje />), "div");
    expect(tag).toContain('role="alert"');
    expect(tag).toContain('data-stanje="greska"');
  });

  test("default title and description come from the dictionary", () => {
    const html = render(<GreskaStanje />);
    expect(html).toMatch(/<h2\b[^>]*>/);
    expect(html).toContain(`>${t.greskaNaslov}</h2>`);
    expect(html).toContain(`>${t.greskaOpis}</p>`);
  });

  test("a custom title and description replace the defaults, nivo 3 gives an h3", () => {
    const html = render(<GreskaStanje nivo={3} naslov="Artikli nisu učitani" opis="Probajte ponovo za minut." />);
    expect(html).toMatch(/<h3\b[^>]*>Artikli nisu učitani<\/h3>/);
    expect(html).toContain("Probajte ponovo za minut.");
    expect(html).not.toContain(t.greskaNaslov);
    expect(html).not.toContain(t.greskaOpis);
  });

  test("onPonovo renders a retry button with the dictionary label and a decorative icon", () => {
    const html = render(<GreskaStanje onPonovo={() => undefined} />);
    expect(count(html, "<button")).toBe(1);
    expect(openTag(html, "button")).toContain('type="button"');
    expect(html).toContain(`${t.pokusajPonovo}</button>`);
    // the state icon and the retry icon, both decorative
    expect(count(html, "<svg")).toBe(2);
    expect(count(html, 'aria-hidden="true"')).toBe(2);
  });

  test("akcija overrides the retry button", () => {
    const html = render(
      <GreskaStanje onPonovo={() => undefined} akcija={<Link href="/podrska">Javite se timu</Link>} />,
    );
    expect(html).toContain('<a href="/podrska">Javite se timu</a>');
    expect(html).not.toContain("<button");
    expect(html).not.toContain(t.pokusajPonovo);
  });

  test("an akcija alone is rendered too", () => {
    const html = render(<GreskaStanje akcija={<Link href="/podrska">Javite se timu</Link>} />);
    expect(html).toContain("Javite se timu");
  });

  test("renders no button when neither onPonovo nor akcija is given", () => {
    const html = render(<GreskaStanje />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain(t.pokusajPonovo);
  });
});

describe("UcitavanjeStanje", () => {
  const OBLICI: readonly UcitavanjeOblik[] = ["lista", "kartice", "tabela", "forma"];
  // One element that repeats once per requested row, in each shape.
  const PO_REDU: Record<UcitavanjeOblik, string> = {
    lista: "size-11",
    kartice: "h-5 w-2/3",
    tabela: "grid-cols-[2fr_1fr_1fr]",
    forma: "h-11 w-full",
  };

  for (const oblik of OBLICI) {
    describe(oblik, () => {
      const html = render(<UcitavanjeStanje oblik={oblik} />);
      const tag = openTag(html, "div");

      test("is a polite status region that names its shape", () => {
        expect(tag).toContain('role="status"');
        expect(tag).toContain('aria-live="polite"');
        expect(tag).toContain('data-stanje="ucitavanje"');
        expect(tag).toContain(`data-oblik="${oblik}"`);
      });

      test("the default label is screen-reader-only", () => {
        expect(html).toContain(`<span class="sr-only">${t.ucitavanje}</span>`);
      });

      test("is a skeleton, never a lone spinner or a control", () => {
        expect(html).not.toContain("<svg");
        expect(html).not.toContain("<button");
      });

      test("redova controls the repeat count, the default is 4", () => {
        expect(count(html, PO_REDU[oblik])).toBe(4);
        for (const redova of [1, 2, 3, 7]) {
          expect(count(render(<UcitavanjeStanje oblik={oblik} redova={redova} />), PO_REDU[oblik])).toBe(redova);
        }
      });

      test("redova 0 (or negative) still renders one row", () => {
        expect(count(render(<UcitavanjeStanje oblik={oblik} redova={0} />), PO_REDU[oblik])).toBe(1);
        expect(count(render(<UcitavanjeStanje oblik={oblik} redova={-2} />), PO_REDU[oblik])).toBe(1);
      });

      test("the row pattern of one shape does not leak into the others", () => {
        for (const other of OBLICI) {
          if (other === oblik) continue;
          expect(count(html, PO_REDU[other])).toBe(0);
        }
      });
    });
  }

  test("the default shape is lista", () => {
    expect(openTag(render(<UcitavanjeStanje />), "div")).toContain('data-oblik="lista"');
  });

  test("a custom oznaka replaces the default label", () => {
    const html = render(<UcitavanjeStanje oznaka="Učitavaju se artikli" />);
    expect(html).toContain('<span class="sr-only">Učitavaju se artikli</span>');
    expect(html).not.toContain(t.ucitavanje);
  });
});

describe("OfflineTraka", () => {
  test("is a polite status, not an alert", () => {
    const tag = openTag(render(<OfflineTraka />), "div");
    expect(tag).toContain('role="status"');
    expect(tag).toContain('aria-live="polite"');
    expect(tag).toContain('data-stanje="offline"');
    expect(tag).not.toContain('role="alert"');
  });

  test("names the problem and has a decorative icon", () => {
    const html = render(<OfflineTraka />);
    expect(html).toContain(`>${t.offlineNaslov}</p>`);
    expect(count(html, "<svg")).toBe(1);
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
  });

  test("with vreme the description carries the time", () => {
    const html = render(<OfflineTraka vreme="18:27" />);
    expect(html).toContain(`${fmt(t.offlineOpis, { vreme: "18:27" })}</p>`);
    expect(html).toContain("18:27");
    expect(html).not.toContain("{vreme}");
  });

  test("without vreme (or with an empty one) the description has no time", () => {
    const prefix = t.offlineOpis.split("{vreme}")[0];
    for (const vreme of [undefined, ""]) {
      const html = render(<OfflineTraka vreme={vreme} />);
      expect(html).toContain(`>${t.offlineBezVremena}</p>`);
      expect(html).not.toContain(prefix);
      expect(html).not.toContain("{vreme}");
    }
  });

  test("an akcija is rendered", () => {
    expect(render(<OfflineTraka akcija={<Link href="/pokusaj">Pokušaj</Link>} />)).toContain(
      '<a href="/pokusaj">Pokušaj</a>',
    );
    expect(render(<OfflineTraka />)).not.toMatch(/<a[\s>]/);
  });
});

describe("namespace", () => {
  test("no rendered state uses another product's CSS namespace", () => {
    const html = [
      render(<PraznoStanje naslov="X" opis="Y" akcija={<Link href="/x">Z</Link>} />),
      render(<GreskaStanje onPonovo={() => undefined} />),
      ...(["lista", "kartice", "tabela", "forma"] as const).map((oblik) => render(<UcitavanjeStanje oblik={oblik} />)),
      render(<OfflineTraka vreme="18:27" />),
    ].join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});

describe("UcitavanjeStanje: a row count that is not a number still gives one row", () => {
  test("NaN and Infinity fall back to one row, fractions round down", () => {
    const rowsOf = (html: string) => (html.match(/size-11 shrink-0/g) ?? []).length;
    expect(rowsOf(render(<UcitavanjeStanje oblik="lista" redova={Number.NaN} />))).toBe(1);
    expect(rowsOf(render(<UcitavanjeStanje oblik="lista" redova={Number.POSITIVE_INFINITY} />))).toBe(1);
    expect(rowsOf(render(<UcitavanjeStanje oblik="lista" redova={2.7} />))).toBe(2);
  });
});
