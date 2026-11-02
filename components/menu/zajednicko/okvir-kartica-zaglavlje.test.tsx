// K07 render tests: the layout primitives. OkvirSekcije, Kartica,
// ZaglavljeSaStatusom, SavObjave (the publish seam), MenuPovrsina and
// TrakaRadnji in every variant and state.

import Link from "next/link";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { Kartica, type KarticaTon } from "./kartica";
import { OkvirSekcije } from "./okvir-sekcije";
import { MenuPovrsina } from "./povrsina";
import { izmeneTekst, SavObjave, type SavObjaveCuvanje } from "./sav-objave";
import { StatusOznaka } from "./status-oznaka";
import { TrakaRadnji } from "./traka-radnji";
import { ZaglavljeSaStatusom } from "./zaglavlje-sa-statusom";

const render = (node: ReactNode) => renderToStaticMarkup(node);
const t = menuZajednickoSr;

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

// A <p> element, not a <path> of an icon.
const hasParagraph = (html: string) => /<p[\s>]/.test(html);

describe("OkvirSekcije", () => {
  const html = render(
    <OkvirSekcije naslov="Dugmad" opis="Mete su najmanje 44 px." radnje={<Link href="/dodaj">Dodaj</Link>}>
      <p>Sadržaj sekcije</p>
    </OkvirSekcije>,
  );

  test("is a section labelled by its own h2", () => {
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(openTag(html, "section"))?.[1];
    const h2Id = /<h2\b[^>]*\sid="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(h2Id).toBe(labelledBy);
    expect(html).toMatch(/<h2\b[^>]*>Dugmad<\/h2>/);
    expect(html).toContain('data-okvir-sekcije=""');
  });

  test("renders the description, the actions and the content", () => {
    expect(html).toContain(">Mete su najmanje 44 px.</p>");
    expect(html).toContain('<a href="/dodaj">Dodaj</a>');
    expect(html).toContain("Sadržaj sekcije");
    expect(html.indexOf("Dugmad")).toBeLessThan(html.indexOf("Sadržaj sekcije"));
  });

  test("nivo 3 renders an h3 that still labels the section", () => {
    const nested = render(
      <OkvirSekcije naslov="Podsekcija" nivo={3}>
        x
      </OkvirSekcije>,
    );
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(openTag(nested, "section"))?.[1];
    const h3Id = /<h3\b[^>]*\sid="([^"]+)"/.exec(nested)?.[1];
    expect(nested).not.toContain("<h2");
    expect(labelledBy).toBeTruthy();
    expect(h3Id).toBe(labelledBy);
  });

  test("without opis and radnje neither is rendered", () => {
    const bare = render(<OkvirSekcije naslov="Dugmad">x</OkvirSekcije>);
    expect(hasParagraph(bare)).toBe(false);
    expect(bare).not.toContain("<a");
    expect(bare).not.toContain("flex flex-wrap items-center gap-2");
  });

  test("an explicit id is used for the section and derives the heading id", () => {
    const explicit = render(
      <OkvirSekcije id="dugmad" naslov="Dugmad">
        x
      </OkvirSekcije>,
    );
    expect(openTag(explicit, "section")).toContain('id="dugmad"');
    expect(openTag(explicit, "section")).toContain('aria-labelledby="dugmad-naslov"');
    expect(explicit).toMatch(/<h2\b[^>]*\sid="dugmad-naslov"/);
  });

  test("two frames on one page get different heading ids, each labelled by its own heading", () => {
    const page = render(
      <>
        <OkvirSekcije naslov="Prva">a</OkvirSekcije>
        <OkvirSekcije naslov="Druga">b</OkvirSekcije>
      </>,
    );
    const labelled = [...page.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    const headings = [...page.matchAll(/<h2\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(labelled).toHaveLength(2);
    expect(headings).toHaveLength(2);
    expect(labelled[0]).not.toBe(labelled[1]);
    expect(labelled).toEqual(headings);
  });
});

describe("Kartica", () => {
  const TONOVI: readonly KarticaTon[] = ["obicna", "utisana", "istaknuta"];

  for (const ton of TONOVI) {
    test(`ton ${ton} carries data-kartica="${ton}" and the card shape`, () => {
      const tag = openTag(render(<Kartica ton={ton}>x</Kartica>), "div");
      expect(tag).toContain(`data-kartica="${ton}"`);
      expect(klase(tag)).toContain("rounded-[var(--mp-radius-kartica)]");
      expect(klase(tag)).toContain("p-4");
    });
  }

  test("the default ton is obicna", () => {
    const tag = openTag(render(<Kartica>x</Kartica>), "div");
    expect(tag).toContain('data-kartica="obicna"');
    expect(klase(tag)).toContain("bg-[var(--mp-povrsina)]");
    expect(klase(tag)).toContain("shadow-[var(--mp-senka-xs)]");
  });

  test("utisana has the muted fill and no border or shadow", () => {
    const tokens = klase(openTag(render(<Kartica ton="utisana">x</Kartica>), "div"));
    expect(tokens).toContain("bg-[var(--mp-povrsina-utisana)]");
    expect(tokens).not.toContain("border");
    expect(tokens).not.toContain("shadow-[var(--mp-senka-xs)]");
  });

  test("istaknuta re-scopes the tokens so primitives inside stay readable", () => {
    const tokens = klase(openTag(render(<Kartica ton="istaknuta">x</Kartica>), "div"));
    expect(tokens).toContain("bg-[var(--mp-istaknuto)]");
    expect(tokens).toContain("[--mp-tekst:var(--mp-na-istaknutom)]");
    expect(tokens).toContain("[--focus-ring:var(--mp-akcent)]");
    expect(tokens).toContain("[--mp-fokus:var(--mp-akcent)]");
  });

  test("the other tones do not re-scope tokens", () => {
    for (const ton of ["obicna", "utisana"] as const) {
      const tag = openTag(render(<Kartica ton={ton}>x</Kartica>), "div");
      expect(tag).not.toContain("[--mp-tekst:");
      expect(tag).not.toContain("[--focus-ring:");
    }
  });

  test('as="article" renders an article, not a div', () => {
    const html = render(
      <Kartica as="article" ton="utisana">
        x
      </Kartica>,
    );
    expect(html).toMatch(/^<article\b/);
    expect(html).toContain('data-kartica="utisana"');
    expect(html).not.toContain("<div");
  });

  test("className and extra attributes are passed on, children are rendered", () => {
    const html = render(
      <Kartica className="grid gap-2" data-izlog="1">
        <span>unutra</span>
      </Kartica>,
    );
    const tag = openTag(html, "div");
    expect(klase(tag)).toContain("grid");
    expect(tag).toContain('data-izlog="1"');
    expect(html).toContain("<span>unutra</span>");
  });
});

describe("ZaglavljeSaStatusom", () => {
  const html = render(
    <ZaglavljeSaStatusom
      kontekst="ScanMe Menu · Ugostiteljstvo"
      naslov="Kompletan meni"
      status={<StatusOznaka ton="uspeh">Objavljeno</StatusOznaka>}
      opis="Naslov, stanje menija i glavne radnje."
      radnje={<Link href="/objavi">Objavi</Link>}
    />,
  );

  test("renders exactly one h1 by default", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<h1\b[^>]*>Kompletan meni<\/h1>/);
    expect(html).not.toContain("<h2");
  });

  test("nivo 2 renders an h2 and no h1", () => {
    const nested = render(<ZaglavljeSaStatusom nivo={2} naslov="Kompletan meni" />);
    expect(nested).toMatch(/<h2\b[^>]*>Kompletan meni<\/h2>/);
    expect(nested).not.toContain("<h1");
  });

  test("renders the context, the status, the description and the actions in reading order", () => {
    expect(html).toContain(">ScanMe Menu · Ugostiteljstvo</p>");
    expect(html).toContain('data-status-ton="uspeh"');
    expect(html).toContain(">Naslov, stanje menija i glavne radnje.</p>");
    expect(html).toContain('<a href="/objavi">Objavi</a>');
    const order = ["ScanMe Menu", "<h1", "data-status-ton", "Naslov, stanje", "/objavi"].map((s) => html.indexOf(s));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("with only a title nothing else is rendered", () => {
    const bare = render(<ZaglavljeSaStatusom naslov="Kompletan meni" />);
    expect(hasParagraph(bare)).toBe(false);
    expect(bare).not.toContain("<a");
    expect(bare).toContain('data-zaglavlje=""');
    expect(bare).toMatch(/^<header\b/);
  });

  test("className is appended to the header", () => {
    expect(klase(openTag(render(<ZaglavljeSaStatusom naslov="X" className="pb-4" />), "header"))).toContain("pb-4");
  });
});

describe("izmeneTekst: Serbian plural forms", () => {
  test("0 (and below) says there are no unpublished changes", () => {
    expect(izmeneTekst(0)).toBe(t.objava.bezIzmena);
    expect(izmeneTekst(-1)).toBe(t.objava.bezIzmena);
  });

  test("1 and 21 take the singular form", () => {
    expect(izmeneTekst(1)).toBe("1 neobjavljena izmena");
    expect(izmeneTekst(21)).toBe("21 neobjavljena izmena");
    expect(izmeneTekst(101)).toBe("101 neobjavljena izmena");
  });

  test("2, 3, 4 and 22 take the few form", () => {
    expect(izmeneTekst(2)).toBe("2 neobjavljene izmene");
    expect(izmeneTekst(3)).toBe("3 neobjavljene izmene");
    expect(izmeneTekst(4)).toBe("4 neobjavljene izmene");
    expect(izmeneTekst(22)).toBe("22 neobjavljene izmene");
  });

  test("5, 11, 12, 14 and 25 take the many form", () => {
    for (const n of [5, 11, 12, 14, 25]) expect(izmeneTekst(n)).toBe(`${n} neobjavljenih izmena`);
  });
});

describe("SavObjave", () => {
  const objavljeno = { broj: 12, kada: "danas u 14:32" };

  test("is a named group", () => {
    const tag = openTag(render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={0} />), "div");
    expect(tag).toContain('role="group"');
    expect(tag).toContain(`aria-label="${t.objava.oznaka}"`);
  });

  test("a published menu names its version and time", () => {
    const html = render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={3} />);
    expect(html).toContain(fmt(t.objava.objavljeno, { broj: 12 }));
    expect(html).toContain(fmt(t.objava.objavljenoKada, { kada: "danas u 14:32" }));
    expect(html).toContain("12");
    expect(html).toContain("14:32");
    expect(html).not.toContain(t.objava.nikadObjavljeno);
    expect(html).not.toContain(t.objava.gostiNeVide);
  });

  test("a never-published menu says so and says guests see nothing", () => {
    const html = render(<SavObjave objavljeno={null} neobjavljeneIzmene={5} />);
    expect(html).toContain(t.objava.nikadObjavljeno);
    expect(html).toContain(t.objava.gostiNeVide);
    expect(html).not.toContain(t.objava.objavljeno.split("{broj}")[0]);
    expect(html).not.toContain(t.objava.objavljenoKada.split("{kada}")[0]);
  });

  test("data-sav-objave is izmene while the draft differs and cisto when it does not", () => {
    expect(openTag(render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={1} />), "div")).toContain(
      'data-sav-objave="izmene"',
    );
    expect(openTag(render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={0} />), "div")).toContain(
      'data-sav-objave="cisto"',
    );
  });

  test("the seam is stitched while there are changes and a plain line when there are none", () => {
    const withChanges = render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={2} />);
    const clean = render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={0} />);
    expect(withChanges).toContain("border-dashed");
    expect(withChanges).not.toContain("border-solid");
    expect(clean).toContain("border-solid");
    expect(clean).not.toContain("border-dashed");
  });

  test("renders the change count as Serbian plural text", () => {
    for (const [n, expected] of [
      [0, t.objava.bezIzmena],
      [1, "1 neobjavljena izmena"],
      [2, "2 neobjavljene izmene"],
      [5, "5 neobjavljenih izmena"],
      [21, "21 neobjavljena izmena"],
    ] as const) {
      expect(render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={n} />)).toContain(`>${expected}</span>`);
    }
  });

  const CUVANJE: readonly { stanje: SavObjaveCuvanje; tekst: string }[] = [
    { stanje: "sacuvano", tekst: t.cuvanje.sacuvano },
    { stanje: "cuva-se", tekst: t.cuvanje.cuvaSe },
    { stanje: "greska", tekst: t.cuvanje.nijeSacuvano },
  ];

  for (const { stanje, tekst } of CUVANJE) {
    test(`cuvanje ${stanje} is a polite status with its own text`, () => {
      const html = render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={0} cuvanje={stanje} />);
      const status = /<span\b[^>]*role="status"[^>]*>/.exec(html)?.[0];
      expect(status).toBeDefined();
      expect(status).toContain('aria-live="polite"');
      expect(status).toContain(`data-cuvanje="${stanje}"`);
      expect(count(html, 'role="status"')).toBe(1);
      expect(html).toContain(`>${tekst}</span>`);
      for (const other of CUVANJE) {
        if (other.stanje !== stanje) expect(html).not.toContain(`>${other.tekst}</span>`);
      }
    });
  }

  test("only the saving state spins, and it stops under reduced motion", () => {
    const spinning = render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={0} cuvanje="cuva-se" />);
    expect(spinning).toContain("animate-spin motion-reduce:animate-none");
    for (const stanje of ["sacuvano", "greska"] as const) {
      expect(render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={0} cuvanje={stanje} />)).not.toContain(
        "animate-spin",
      );
    }
  });

  test("without cuvanje there is no live region", () => {
    const html = render(<SavObjave objavljeno={objavljeno} neobjavljeneIzmene={3} />);
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain("data-cuvanje");
  });

  test("every icon is decorative in every state", () => {
    for (const objava of [objavljeno, null]) {
      for (const n of [0, 4]) {
        for (const cuvanje of [undefined, "sacuvano", "cuva-se", "greska"] as const) {
          const html = render(<SavObjave objavljeno={objava} neobjavljeneIzmene={n} cuvanje={cuvanje} />);
          expect(count(html, "<svg")).toBeGreaterThanOrEqual(2);
          expect(count(html, 'aria-hidden="true"')).toBeGreaterThanOrEqual(count(html, "<svg"));
          for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
        }
      }
    }
  });
});

describe("MenuPovrsina", () => {
  test("is the panel surface by default", () => {
    const html = render(<MenuPovrsina>unutra</MenuPovrsina>);
    expect(html).toMatch(/^<div\b/);
    expect(openTag(html, "div")).toContain('data-povrsina="panel"');
    expect(html).toContain("unutra");
  });

  test("povrsina konobar renders the waiter surface", () => {
    const tag = openTag(render(<MenuPovrsina povrsina="konobar">x</MenuPovrsina>), "div");
    expect(tag).toContain('data-povrsina="konobar"');
    expect(tag).not.toContain('data-povrsina="panel"');
  });

  test('as="main" renders a main landmark', () => {
    const html = render(<MenuPovrsina as="main">x</MenuPovrsina>);
    expect(html).toMatch(/^<main\b/);
    expect(html).toContain('data-povrsina="panel"');
    expect(html).not.toContain("<div");
  });

  test("reads the surface tokens and appends className", () => {
    const tokens = klase(openTag(render(<MenuPovrsina className="min-h-[100dvh]">x</MenuPovrsina>), "div"));
    expect(tokens).toContain("bg-[var(--mp-okvir)]");
    expect(tokens).toContain("text-[var(--mp-tekst)]");
    expect(tokens).toContain("min-h-[100dvh]");
  });
});

describe("TrakaRadnji", () => {
  test("is a named group, not a toolbar", () => {
    const tag = openTag(
      render(
        <TrakaRadnji oznaka="Radnje nad artiklom">
          <button type="button">Sačuvaj</button>
        </TrakaRadnji>,
      ),
      "div",
    );
    expect(tag).toContain('role="group"');
    expect(tag).not.toContain("toolbar");
    expect(tag).toContain('aria-label="Radnje nad artiklom"');
  });

  test("u-toku (the default) flows inline: no sticky positioning", () => {
    const tag = openTag(render(<TrakaRadnji oznaka="Radnje">x</TrakaRadnji>), "div");
    expect(tag).toContain('data-traka-radnji="u-toku"');
    expect(klase(tag)).not.toContain("sticky");
    expect(klase(tag)).not.toContain("lg:static");
  });

  test("dno is pinned to the bottom below 1024 px and flows inline from lg", () => {
    const tag = openTag(
      render(
        <TrakaRadnji oznaka="Radnje" pozicija="dno">
          x
        </TrakaRadnji>,
      ),
      "div",
    );
    const tokens = klase(tag);
    expect(tag).toContain('data-traka-radnji="dno"');
    expect(tokens).toContain("sticky");
    expect(tokens).toContain("bottom-0");
    expect(tokens).toContain("lg:static");
    expect(tokens).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
  });

  test("poravnanje decides the justification", () => {
    const justify = (poravnanje?: "pocetak" | "kraj" | "razmaknuto") =>
      klase(openTag(render(<TrakaRadnji oznaka="R" poravnanje={poravnanje}>x</TrakaRadnji>), "div")).filter((token) =>
        token.startsWith("justify-"),
      );
    expect(justify()).toEqual(["justify-end"]);
    expect(justify("kraj")).toEqual(["justify-end"]);
    expect(justify("pocetak")).toEqual(["justify-start"]);
    expect(justify("razmaknuto")).toEqual(["justify-between"]);
  });

  test("renders its children and appends className", () => {
    const html = render(
      <TrakaRadnji oznaka="R" className="mt-4">
        <button type="button">Otkaži</button>
      </TrakaRadnji>,
    );
    expect(html).toContain("<button type=\"button\">Otkaži</button>");
    expect(klase(openTag(html, "div"))).toContain("mt-4");
  });
});

describe("namespace", () => {
  test("no rendered layout primitive uses another product's CSS namespace", () => {
    const html = render(
      <MenuPovrsina as="main">
        <ZaglavljeSaStatusom
          kontekst="K"
          naslov="N"
          status={<SavObjave objavljeno={{ broj: 12, kada: "danas u 14:32" }} neobjavljeneIzmene={3} cuvanje="cuva-se" />}
          radnje={<Link href="/x">x</Link>}
        />
        <OkvirSekcije naslov="S" opis="O" radnje={<Link href="/y">y</Link>}>
          {(["obicna", "utisana", "istaknuta"] as const).map((ton) => (
            <Kartica key={ton} ton={ton}>
              {ton}
            </Kartica>
          ))}
        </OkvirSekcije>
        <TrakaRadnji oznaka="R" pozicija="dno" poravnanje="razmaknuto">
          x
        </TrakaRadnji>
        <MenuPovrsina povrsina="konobar">k</MenuPovrsina>
      </MenuPovrsina>,
    );
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});

describe("SavObjave: a failed save offers the retry next to the state", () => {
  test("akcija renders only while saving failed", () => {
    const retry = <button type="button">ponovo</button>;
    expect(render(<SavObjave objavljeno={null} neobjavljeneIzmene={2} cuvanje="greska" akcija={retry} />)).toContain(">ponovo</button>");
    expect(render(<SavObjave objavljeno={null} neobjavljeneIzmene={2} cuvanje="sacuvano" akcija={retry} />)).not.toContain(">ponovo</button>");
  });

  test("onPonovo renders the dictionary retry button", () => {
    const html = render(<SavObjave objavljeno={null} neobjavljeneIzmene={2} cuvanje="greska" onPonovo={() => undefined} />);
    expect(html).toContain(menuZajednickoSr.stanja.pokusajPonovo);
  });

  test("the seam is a full-width rule on a phone and an elastic stitch from 640 px", () => {
    const seam = /<span aria-hidden="true" data-sav=""[^>]*>/.exec(render(<SavObjave objavljeno={null} neobjavljeneIzmene={2} />))?.[0] ?? "";
    expect(seam).toContain("basis-full");
    expect(seam).toContain("sm:flex-1");
    expect(seam).toContain("border-dashed");
  });
});

describe("TrakaRadnji at the bottom leaves room for the app-wide theme button", () => {
  test("the pinned bar keeps its right end free below 1024 px and resets from lg", () => {
    const tag = openTag(render(<TrakaRadnji oznaka="Radnje" pozicija="dno"><span /></TrakaRadnji>), "div");
    expect(tag).toContain("pr-[4.25rem]");
    expect(tag).toContain("lg:p-0");
  });
});
