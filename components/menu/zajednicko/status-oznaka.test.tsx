// K07 render tests: StatusOznaka in every tone and size. A state is never
// colour alone: the icon carries the colour, the text names the state and
// stays in the text token.

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { STATUS_TONOVI, StatusOznaka, type StatusTon } from "./status-oznaka";

const render = (node: ReactNode) => renderToStaticMarkup(node);

// Built dynamically so this file stays clean under a raw substring scan for
// the other products' namespaces.
const VENUE_NS = ["--", "venue", "-"].join("");
const LINKS_NS = ["--", "links", "-"].join("");

function openTag(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>`).exec(html);
  if (!match) throw new Error(`no <${tag}> in: ${html}`);
  return match[0];
}

function klase(tag: string): string[] {
  const match = /\sclass="([^"]*)"/.exec(tag);
  return match ? match[1].split(/\s+/) : [];
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

const TONOVI: readonly StatusTon[] = ["neutralno", "info", "uspeh", "upozorenje", "opasnost"];

describe("StatusOznaka: tones", () => {
  test("the tone map has exactly the five tones", () => {
    expect(Object.keys(STATUS_TONOVI).sort()).toEqual([...TONOVI].sort());
  });

  for (const ton of TONOVI) {
    describe(ton, () => {
      const t = STATUS_TONOVI[ton];
      const html = render(<StatusOznaka ton={ton}>{`Stanje ${ton}`}</StatusOznaka>);
      const wrapper = openTag(html, "span");
      const svg = openTag(html, "svg");

      test("carries data-status-ton and the state in words", () => {
        expect(wrapper).toContain(`data-status-ton="${ton}"`);
        expect(html).toContain(`<span class="min-w-0">Stanje ${ton}</span>`);
      });

      test("has exactly one decorative svg", () => {
        expect(count(html, "<svg")).toBe(1);
        expect(svg).toContain('aria-hidden="true"');
      });

      test("the text stays in the text token, the colour lives on the icon", () => {
        expect(klase(wrapper)).toContain("text-[var(--mp-tekst)]");
        for (const token of t.povrsina.split(" ")) expect(klase(wrapper)).toContain(token);
        expect(klase(svg)).toContain(t.ikonicaBoja);
        expect(klase(svg)).not.toContain("text-[var(--mp-tekst)]");
      });
    });
  }

  test("every tone has its own icon markup and its own icon colour", () => {
    // Icons with the colour class stripped must still differ: shape alone tells the tones apart.
    const shapes = TONOVI.map((ton) => {
      const html = render(<StatusOznaka ton={ton}>X</StatusOznaka>);
      return html.slice(html.indexOf("<svg"), html.indexOf("</svg>")).replace(STATUS_TONOVI[ton].ikonicaBoja, "");
    });
    expect(new Set(shapes).size).toBe(TONOVI.length);
    expect(new Set(TONOVI.map((ton) => STATUS_TONOVI[ton].ikonicaBoja)).size).toBe(TONOVI.length);
  });
});

describe("StatusOznaka: ikonica", () => {
  test("a custom ikonica replaces the default, still one decorative svg", () => {
    const defaultHtml = render(<StatusOznaka ton="neutralno">Premium</StatusOznaka>);
    const customHtml = render(
      <StatusOznaka ton="neutralno" ikonica={Lock}>
        Premium
      </StatusOznaka>,
    );
    const defaultSvg = defaultHtml.slice(defaultHtml.indexOf("<svg"), defaultHtml.indexOf("</svg>"));
    const customSvg = customHtml.slice(customHtml.indexOf("<svg"), customHtml.indexOf("</svg>"));
    expect(customSvg).not.toBe(defaultSvg);
    expect(customSvg).toContain("lucide-lock");
    expect(defaultSvg).not.toContain("lucide-lock");
    expect(count(customHtml, "<svg")).toBe(1);
    expect(openTag(customHtml, "svg")).toContain('aria-hidden="true"');
  });

  test("the tone colour still applies to a custom icon", () => {
    const html = render(
      <StatusOznaka ton="upozorenje" ikonica={Lock}>
        Premium
      </StatusOznaka>,
    );
    expect(klase(openTag(html, "svg"))).toContain(STATUS_TONOVI.upozorenje.ikonicaBoja);
  });
});

describe("StatusOznaka: size", () => {
  test("velicina mala uses text-xs and the small icon", () => {
    const html = render(
      <StatusOznaka ton="info" velicina="mala">
        Novi
      </StatusOznaka>,
    );
    const wrapper = klase(openTag(html, "span"));
    expect(wrapper).toContain("text-xs");
    expect(wrapper).toContain("min-h-6");
    expect(wrapper).toContain("px-2");
    expect(klase(openTag(html, "svg"))).toContain("size-3.5");
  });

  test("the default size is standardna: not text-xs", () => {
    const html = render(<StatusOznaka ton="info">Novi</StatusOznaka>);
    const wrapper = klase(openTag(html, "span"));
    expect(wrapper).not.toContain("text-xs");
    expect(wrapper).toContain("text-[0.8125rem]");
    expect(wrapper).toContain("min-h-7");
    expect(klase(openTag(html, "svg"))).toContain("size-4");
  });

  test("className is appended", () => {
    const html = render(
      <StatusOznaka ton="uspeh" className="ml-2">
        Objavljeno
      </StatusOznaka>,
    );
    expect(klase(openTag(html, "span"))).toContain("ml-2");
  });
});

describe("namespace", () => {
  test("no rendered StatusOznaka uses another product's CSS namespace", () => {
    const html = TONOVI.map((ton) => render(<StatusOznaka ton={ton}>X</StatusOznaka>)).join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});
