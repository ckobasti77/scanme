// K07 render tests: Prekidac (switch) and PoljePotvrde (checkbox). Real form
// elements, visually replaced but still the click and focus target; the label
// row is the target; the visual parts are hidden from assistive technology.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PoljePotvrde, Prekidac } from "./prekidac";

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

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

// An attribute of the tag, not a Tailwind variant such as `peer-checked:`.
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|>|/)`).test(tag);

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("Prekidac", () => {
  const html = render(
    <Prekidac id="poziv" name="poziv" naziv="Poziv konobara" opis="Gost može da pozove konobara sa menija." />,
  );
  const input = openTag(html, "input");
  const label = openTag(html, "label");

  test("is a real checkbox input with role=switch", () => {
    expect(count(html, "<input")).toBe(1);
    expect(input).toContain('type="checkbox"');
    expect(input).toContain('role="switch"');
    expect(input).toContain('name="poziv"');
  });

  test("the label points at the input", () => {
    expect(attr(input, "id")).toBe("poziv");
    expect(attr(label, "for")).toBe("poziv");
    expect(label).toContain('data-prekidac=""');
    expect(html).toContain(">Poziv konobara</span>");
  });

  test("opis is linked by aria-describedby", () => {
    const describedBy = attr(input, "aria-describedby");
    expect(describedBy).toBe("poziv-opis");
    expect(html).toContain('<span id="poziv-opis"');
    expect(html).toContain(">Gost može da pozove konobara sa menija.</span>");
  });

  test("the whole label row is at least --mp-meta high", () => {
    expect(klase(label)).toContain("min-h-[var(--mp-meta)]");
  });

  test("the visual track, thumb and check mark are hidden from assistive technology", () => {
    expect(count(html, '<span aria-hidden="true"')).toBe(2);
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
    expect(count(html, 'aria-hidden="true"')).toBe(3);
    expect(hasAttr(input, "aria-hidden")).toBe(false);
  });

  test("the input stays the click and focus target: it covers the control and is invisible", () => {
    const tokens = klase(input);
    expect(tokens).toContain("peer");
    expect(tokens).toContain("absolute");
    expect(tokens).toContain("inset-0");
    expect(tokens).toContain("opacity-0");
    expect(tokens).toContain("appearance-none");
  });

  test("a generated id ties the label, the input and the description together", () => {
    const generated = render(<Prekidac naziv="Poziv konobara" opis="Opis" />);
    const generatedInput = openTag(generated, "input");
    const id = attr(generatedInput, "id");
    expect(id).toBeTruthy();
    expect(attr(openTag(generated, "label"), "for")).toBe(id);
    expect(attr(generatedInput, "aria-describedby")).toBe(`${id}-opis`);
    expect(generated).toContain(`<span id="${id}-opis"`);
  });

  test("without opis there is no description link", () => {
    const bare = render(<Prekidac id="x" naziv="Poziv konobara" />);
    expect(hasAttr(openTag(bare, "input"), "aria-describedby")).toBe(false);
    expect(bare).not.toContain("x-opis");
  });

  test("unchecked by default, defaultChecked renders checked", () => {
    expect(hasAttr(input, "checked")).toBe(false);
    const on = openTag(render(<Prekidac naziv="X" defaultChecked />), "input");
    expect(on).toContain('checked=""');
    expect(on).toContain('role="switch"');
  });

  test("disabled renders disabled and the label dims and blocks the pointer", () => {
    const off = render(<Prekidac naziv="Room service" opis="Dostupno uz Premium nalog." disabled />);
    expect(openTag(off, "input")).toContain('disabled=""');
    expect(klase(openTag(off, "label"))).toContain("has-[:disabled]:cursor-not-allowed");
    expect(hasAttr(input, "disabled")).toBe(false);
  });

  test("className goes on the label row", () => {
    expect(klase(openTag(render(<Prekidac naziv="X" className="sm:col-span-2" />), "label"))).toContain(
      "sm:col-span-2",
    );
  });
});

describe("PoljePotvrde", () => {
  test("is a checkbox without role switch, wired to its label", () => {
    const html = render(<PoljePotvrde id="razumem" naziv="Razumem da se promena vidi tek posle objave" />);
    const input = openTag(html, "input");
    expect(count(html, "<input")).toBe(1);
    expect(input).toContain('type="checkbox"');
    expect(hasAttr(input, "role")).toBe(false);
    expect(attr(input, "id")).toBe("razumem");
    expect(attr(openTag(html, "label"), "for")).toBe("razumem");
    expect(html).toContain('data-polje-potvrde=""');
    expect(klase(openTag(html, "label"))).toContain("min-h-[var(--mp-meta)]");
    expect(html).toContain(">Razumem da se promena vidi tek posle objave</span>");
  });

  test("the box and the check mark are hidden from assistive technology", () => {
    const html = render(<PoljePotvrde naziv="X" />);
    expect(count(html, '<span aria-hidden="true"')).toBe(1);
    expect(openTag(html, "svg")).toContain('aria-hidden="true"');
    expect(count(html, 'aria-hidden="true"')).toBe(2);
  });

  test("without opis and greska there is no description, no invalid flag and no alert", () => {
    const html = render(<PoljePotvrde id="x" naziv="X" />);
    const input = openTag(html, "input");
    expect(hasAttr(input, "aria-describedby")).toBe(false);
    expect(hasAttr(input, "aria-invalid")).toBe(false);
    expect(html).not.toContain('role="alert"');
  });

  test("opis alone is linked by aria-describedby", () => {
    const html = render(<PoljePotvrde id="x" naziv="X" opis="Izmene se čuvaju u nacrtu." />);
    const input = openTag(html, "input");
    expect(attr(input, "aria-describedby")).toBe("x-opis");
    expect(html).toContain('<span id="x-opis"');
    expect(hasAttr(input, "aria-invalid")).toBe(false);
  });

  test("greska is announced, flagged invalid and linked", () => {
    const html = render(<PoljePotvrde id="x" naziv="X" greska="Potvrdite da biste nastavili." />);
    const input = openTag(html, "input");
    const alert = /<p\b[^>]*role="alert"[^>]*>/.exec(html)?.[0];
    expect(input).toContain('aria-invalid="true"');
    expect(alert).toBeDefined();
    expect(attr(alert ?? "", "id")).toBe("x-greska");
    expect(html).toContain(">Potvrdite da biste nastavili.</p>");
    expect(attr(input, "aria-describedby")).toBe("x-greska");
    expect(count(html, 'role="alert"')).toBe(1);
  });

  test("with both opis and greska aria-describedby lists both ids, description first", () => {
    const html = render(<PoljePotvrde id="x" naziv="X" opis="Opis" greska="Greška" />);
    const describedBy = attr(openTag(html, "input"), "aria-describedby");
    expect(describedBy?.split(/\s+/)).toEqual(["x-opis", "x-greska"]);
    expect(html).toContain('<span id="x-opis"');
    expect(html).toContain('id="x-greska"');
  });

  test("greska draws the box in the danger colour", () => {
    expect(render(<PoljePotvrde naziv="X" greska="Greška" />)).toContain("[--border:var(--mp-opasnost)]");
    expect(render(<PoljePotvrde naziv="X" />)).not.toContain("[--border:var(--mp-opasnost)]");
  });

  test("a generated id ties label, input and error together", () => {
    const html = render(<PoljePotvrde naziv="X" opis="Opis" greska="Greška" />);
    const input = openTag(html, "input");
    const id = attr(input, "id");
    expect(id).toBeTruthy();
    expect(attr(openTag(html, "label"), "for")).toBe(id);
    expect(attr(input, "aria-describedby")).toBe(`${id}-opis ${id}-greska`);
  });

  test("defaultChecked and disabled render their attributes", () => {
    expect(openTag(render(<PoljePotvrde naziv="X" defaultChecked />), "input")).toContain('checked=""');
    expect(hasAttr(openTag(render(<PoljePotvrde naziv="X" />), "input"), "checked")).toBe(false);
    const off = render(<PoljePotvrde naziv="X" disabled />);
    expect(openTag(off, "input")).toContain('disabled=""');
    expect(klase(openTag(off, "label"))).toContain("has-[:disabled]:cursor-not-allowed");
  });
});

describe("Prekidac and PoljePotvrde together", () => {
  const page = render(
    <>
      <Prekidac naziv="Prvi" opis="Opis prvog" defaultChecked />
      <Prekidac naziv="Prvi" opis="Opis prvog" />
      <PoljePotvrde naziv="Treći" opis="Opis" greska="Greška" />
      <PoljePotvrde naziv="Treći" />
    </>,
  );

  test("every id on the page is unique", () => {
    const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every input has exactly one label pointing at it", () => {
    const inputIds = [...page.matchAll(/<input\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    const labelTargets = [...page.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
    expect(inputIds).toHaveLength(4);
    expect(labelTargets).toEqual(inputIds);
  });

  test("every aria-describedby id exists on the page", () => {
    for (const [, value] of page.matchAll(/aria-describedby="([^"]+)"/g)) {
      for (const id of value.split(/\s+/)) expect(page).toContain(`id="${id}"`);
    }
  });
});

describe("namespace", () => {
  test("no rendered switch or checkbox uses another product's CSS namespace", () => {
    const html = [
      render(<Prekidac naziv="X" opis="Y" defaultChecked />),
      render(<Prekidac naziv="X" disabled />),
      render(<PoljePotvrde naziv="X" opis="Y" greska="Z" />),
      render(<PoljePotvrde naziv="X" defaultChecked />),
    ].join("\n");
    expect(html).not.toContain(VENUE_NS);
    expect(html).not.toContain(LINKS_NS);
  });
});

describe("a caller's aria-describedby is kept next to the built-in links", () => {
  test("Prekidac: opis id and the caller's id both describe the switch", () => {
    const input = openTag(render(<Prekidac id="zvuk" naziv="Zvuk" opis="Kratak signal" aria-describedby="napomena" />), "input");
    expect(input).toContain('aria-describedby="zvuk-opis napomena"');
  });

  test("PoljePotvrde: opis, error and the caller's id, with aria-invalid", () => {
    const input = openTag(
      render(<PoljePotvrde id="potvrda" naziv="Potvrda" opis="Opis" greska="Greška" aria-describedby="napomena" />),
      "input",
    );
    expect(input).toContain('aria-describedby="potvrda-opis potvrda-greska napomena"');
    expect(input).toContain('aria-invalid="true"');
  });

  test("without an opis the caller's id alone stays", () => {
    const input = openTag(render(<Prekidac id="x" naziv="X" aria-describedby="napomena" />), "input");
    expect(input).toContain('aria-describedby="napomena"');
  });
});

describe("a disabled switch keeps its reason readable", () => {
  test("only the track and the name dim; the opis and the label slot stay at full strength", () => {
    const html = render(
      <Prekidac id="rs" naziv="Room service" opis="Dostupno uz Premium nalog." oznaka={<span data-oznaka="">Premium</span>} disabled />,
    );
    expect(openTag(html, "label")).not.toContain("opacity-55");
    expect(html).toContain('data-oznaka=""');
    const opis = /<span id="rs-opis"[^>]*>/.exec(html)?.[0] ?? "";
    expect(opis).not.toContain("opacity");
    expect(html).toContain("group-has-[:disabled]:opacity-55");
  });
});
