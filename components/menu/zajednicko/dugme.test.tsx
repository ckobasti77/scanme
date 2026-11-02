// K07 render tests: Dugme and IkonicaDugme in every kind, size and state.
// No DOM in the edge-runtime environment: renderToStaticMarkup and assertions
// on the HTML string, only on roles, aria-*, data-*, text and Tailwind classes.

import { Lock, Save } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { Dugme, IkonicaDugme } from "./dugme";

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

// An attribute of the tag, not a Tailwind variant such as `aria-disabled:`.
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|>|/)`).test(tag);

const VRSTE = ["primarno", "akcent", "sekundarno", "tiho", "opasno"] as const;
const VELICINE = ["standardna", "kompaktna"] as const;

// The fill token that identifies each kind (a whole class token, not a substring).
const VRSTA_POVRSINA: Record<(typeof VRSTE)[number], string> = {
  primarno: "bg-[var(--mp-mastilo)]",
  akcent: "bg-[var(--mp-akcent)]",
  sekundarno: "bg-[var(--mp-povrsina)]",
  tiho: "bg-transparent",
  opasno: "bg-[var(--mp-opasnost)]",
};

const VELICINA_KLASE: Record<(typeof VELICINE)[number], { padding: string; tekst: string }> = {
  standardna: { padding: "px-5", tekst: "text-[0.9375rem]" },
  kompaktna: { padding: "px-4", tekst: "text-sm" },
};

describe("Dugme: kind and size", () => {
  for (const vrsta of VRSTE) {
    for (const velicina of VELICINE) {
      test(`${vrsta} / ${velicina} is a <button type="button"> with the minimum target`, () => {
        const html = render(
          <Dugme vrsta={vrsta} velicina={velicina}>
            Sačuvaj
          </Dugme>,
        );
        const tag = openTag(html, "button");
        expect(count(html, "<button")).toBe(1);
        expect(tag).toContain('type="button"');
        const tokens = klase(tag);
        expect(tokens).toContain("min-h-[var(--mp-meta)]");
        expect(tokens).toContain(VRSTA_POVRSINA[vrsta]);
        expect(tokens).toContain(VELICINA_KLASE[velicina].padding);
        expect(tokens).toContain(VELICINA_KLASE[velicina].tekst);
        expect(html).toContain(">Sačuvaj</button>");
        expect(html).not.toContain("<svg");
      });
    }
  }

  test("each kind has its own fill, no kind carries another kind's fill", () => {
    for (const vrsta of VRSTE) {
      const tokens = klase(openTag(render(<Dugme vrsta={vrsta}>X</Dugme>), "button"));
      for (const other of VRSTE) {
        if (other === vrsta) continue;
        expect(tokens).not.toContain(VRSTA_POVRSINA[other]);
      }
    }
  });

  test("the default is sekundarno / standardna", () => {
    const tokens = klase(openTag(render(<Dugme>Pregled</Dugme>), "button"));
    expect(tokens).toContain(VRSTA_POVRSINA.sekundarno);
    expect(tokens).toContain("px-5");
  });

  test("className is appended to the button classes", () => {
    const tokens = klase(openTag(render(<Dugme className="w-full">X</Dugme>), "button"));
    expect(tokens).toContain("w-full");
    expect(tokens).toContain("min-h-[var(--mp-meta)]");
  });

  test("a passed type is kept while idle", () => {
    expect(openTag(render(<Dugme type="submit">Pošalji</Dugme>), "button")).toContain('type="submit"');
  });
});

describe("Dugme: icon", () => {
  test("ikonica renders one decorative svg before the label", () => {
    const html = render(<Dugme ikonica={Save}>Sačuvaj</Dugme>);
    expect(count(html, "<svg")).toBe(1);
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Sačuvaj"));
  });

  test("a different ikonica renders different svg markup", () => {
    const save = openTag(render(<Dugme ikonica={Save}>X</Dugme>), "svg");
    const lock = openTag(render(<Dugme ikonica={Lock}>X</Dugme>), "svg");
    expect(save).not.toBe(lock);
    expect(lock).toContain("lucide-lock");
  });
});

describe("Dugme: disabled", () => {
  test("disabled renders the disabled attribute and nothing else about loading", () => {
    const html = render(<Dugme disabled>Onemogućeno</Dugme>);
    const tag = openTag(html, "button");
    expect(tag).toContain('disabled=""');
    expect(hasAttr(tag, "aria-busy")).toBe(false);
    expect(hasAttr(tag, "data-stanje")).toBe(false);
  });

  test("an enabled button has no disabled attribute", () => {
    expect(openTag(render(<Dugme>X</Dugme>), "button")).not.toContain('disabled=""');
  });
});

describe("Dugme: ucitava", () => {
  const html = render(
    <Dugme ucitava ikonica={Lock}>
      Objavljuje se
    </Dugme>,
  );
  const tag = openTag(html, "button");

  test("reports busy and keeps the label", () => {
    expect(tag).toContain('aria-busy="true"');
    expect(tag).toContain('aria-disabled="true"');
    expect(tag).toContain('data-stanje="ucitava"');
    expect(html).toContain("Objavljuje se");
  });

  test("announces the work to screen readers with the dictionary text", () => {
    expect(html).toContain(`<span class="sr-only">${menuZajednickoSr.dugme.radiSe}</span>`);
  });

  test("the only svg is the spinner, and it stops under reduced motion", () => {
    expect(count(html, "<svg")).toBe(1);
    const svg = klase(openTag(html, "svg"));
    expect(svg).toContain("animate-spin");
    expect(svg).toContain("motion-reduce:animate-none");
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
    expect(openTag(html, "svg")).not.toContain("lucide-lock");
  });

  test("is not natively disabled (focus stays on the button)", () => {
    expect(tag).not.toContain('disabled=""');
  });

  test("a submit button becomes type=button while loading", () => {
    const loading = openTag(render(<Dugme type="submit" ucitava>X</Dugme>), "button");
    expect(loading).toContain('type="button"');
    expect(loading).not.toContain('type="submit"');
  });

  test("an idle button has none of the loading markers", () => {
    const idle = render(<Dugme ikonica={Save}>Sačuvaj</Dugme>);
    const idleTag = openTag(idle, "button");
    expect(hasAttr(idleTag, "aria-busy")).toBe(false);
    expect(hasAttr(idleTag, "aria-disabled")).toBe(false);
    expect(hasAttr(idleTag, "data-stanje")).toBe(false);
    expect(idle).not.toContain("sr-only");
    expect(idle).not.toContain("animate-spin");
  });
});

describe("Dugme: asChild", () => {
  const html = render(
    <Dugme asChild vrsta="primarno">
      <Link href="/x">Idi</Link>
    </Dugme>,
  );

  test("renders the child element, not a button, with the button classes", () => {
    expect(html).not.toContain("<button");
    const tag = openTag(html, "a");
    expect(tag).toContain('href="/x"');
    const tokens = klase(tag);
    expect(tokens).toContain("min-h-[var(--mp-meta)]");
    expect(tokens).toContain(VRSTA_POVRSINA.primarno);
    expect(html).toContain(">Idi</a>");
  });

  test("does not put a button type on the child", () => {
    expect(openTag(html, "a")).not.toContain("type=");
  });

  test("ikonica and ucitava do not apply", () => {
    const applied = render(
      <Dugme asChild ikonica={Lock} ucitava>
        <Link href="/x">Idi</Link>
      </Dugme>,
    );
    expect(applied).not.toContain("<svg");
    expect(hasAttr(openTag(applied, "a"), "aria-busy")).toBe(false);
    expect(applied).not.toContain("sr-only");
  });
});

describe("IkonicaDugme", () => {
  test("aria-label and title equal oznaka", () => {
    const tag = openTag(render(<IkonicaDugme ikonica={Save} oznaka="Sačuvaj izmene" />), "button");
    expect(tag).toContain('aria-label="Sačuvaj izmene"');
    expect(tag).toContain('title="Sačuvaj izmene"');
    expect(tag).toContain('type="button"');
  });

  test("an explicit title wins over oznaka, aria-label stays oznaka", () => {
    const tag = openTag(render(<IkonicaDugme ikonica={Save} oznaka="Sačuvaj" title="Sačuvaj (Ctrl+S)" />), "button");
    expect(tag).toContain('aria-label="Sačuvaj"');
    expect(tag).toContain('title="Sačuvaj (Ctrl+S)"');
  });

  test("the target is square and never smaller than --mp-meta", () => {
    const tokens = klase(openTag(render(<IkonicaDugme ikonica={Save} oznaka="Sačuvaj" />), "button"));
    expect(tokens).toContain("size-[var(--mp-meta)]");
    expect(tokens).toContain("min-w-[var(--mp-meta)]");
    expect(tokens).toContain("min-h-[var(--mp-meta)]");
    expect(tokens).toContain("px-0");
    expect(tokens).not.toContain("px-5");
  });

  test("the icon is the only content and is decorative", () => {
    const html = render(<IkonicaDugme ikonica={Save} oznaka="Sačuvaj" />);
    expect(count(html, "<svg")).toBe(1);
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
    expect(html.replace(/<svg[\s\S]*?<\/svg>/, "").replace(/<[^>]+>/g, "")).toBe("");
  });

  test("the default kind is tiho, and vrsta is applied", () => {
    expect(klase(openTag(render(<IkonicaDugme ikonica={Save} oznaka="X" />), "button"))).toContain(
      VRSTA_POVRSINA.tiho,
    );
    for (const vrsta of VRSTE) {
      const tokens = klase(openTag(render(<IkonicaDugme ikonica={Save} oznaka="X" vrsta={vrsta} />), "button"));
      expect(tokens).toContain(VRSTA_POVRSINA[vrsta]);
    }
  });

  test("pritisnuto true reports aria-pressed=true and shows the pressed fill", () => {
    const tag = openTag(render(<IkonicaDugme ikonica={Save} oznaka="Zvuk" pritisnuto />), "button");
    expect(tag).toContain('aria-pressed="true"');
    const tokens = klase(tag);
    expect(tokens).toContain("bg-[var(--mp-akcent-meko)]");
    expect(tokens).not.toContain("bg-transparent");
  });

  test("pritisnuto false reports aria-pressed=false and no pressed fill", () => {
    const tag = openTag(render(<IkonicaDugme ikonica={Save} oznaka="Zvuk" pritisnuto={false} />), "button");
    expect(tag).toContain('aria-pressed="false"');
    expect(klase(tag)).not.toContain("bg-[var(--mp-akcent-meko)]");
  });

  test("an absent pritisnuto renders no aria-pressed (not a toggle)", () => {
    expect(hasAttr(openTag(render(<IkonicaDugme ikonica={Save} oznaka="Zvuk" />), "button"), "aria-pressed")).toBe(
      false,
    );
  });

  test("disabled works", () => {
    const tag = openTag(render(<IkonicaDugme ikonica={Save} oznaka="Premesti" disabled />), "button");
    expect(tag).toContain('disabled=""');
    expect(openTag(render(<IkonicaDugme ikonica={Save} oznaka="Premesti" />), "button")).not.toContain(
      'disabled=""',
    );
  });
});

describe("namespace", () => {
  test("no rendered Dugme or IkonicaDugme uses another product's CSS namespace", () => {
    const html = [
      ...VRSTE.map((vrsta) => render(<Dugme vrsta={vrsta} ikonica={Save}>X</Dugme>)),
      render(<Dugme ucitava>X</Dugme>),
      render(<Dugme disabled>X</Dugme>),
      render(
        <Dugme asChild>
          <Link href="/x">X</Link>
        </Dugme>,
      ),
      ...VRSTE.map((vrsta) => render(<IkonicaDugme ikonica={Save} oznaka="X" vrsta={vrsta} pritisnuto />)),
    ].join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});
