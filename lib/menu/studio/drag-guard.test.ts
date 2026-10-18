// ScanMe Menu V1 — K11: what may start a drag. `jeInteraktivnaMeta` runs over
// a minimal `{ closest(selector) }`, so the tests use a fake element: a chain of
// tag / attribute descriptors (the pressed node first, then its ancestors) and a
// tiny selector matcher that understands exactly the forms used by
// `STUDIO_KONTROLE_SELEKTOR` (tag, `tag:not([attr])`, `[attr]`, `[attr='x']`).
// An unsupported selector form throws, so a changed selector cannot pass quietly.

import { describe, expect, test } from "vitest";
import { STUDIO_KONTROLE_SELEKTOR, jeInteraktivnaMeta } from "./drag-guard";

type Cvor = { tag: string; attrs?: Record<string, string> };

function podudaraAtribut(cvor: Cvor, izraz: string): boolean {
  const m = /^([\w-]+)(?:='([^']*)')?$/.exec(izraz);
  if (!m) throw new Error(`Unsupported attribute expression: ${izraz}`);
  const [, ime, vrednost] = m;
  if (!cvor.attrs || !(ime in cvor.attrs)) return false;
  return vrednost === undefined || cvor.attrs[ime] === vrednost;
}

function podudara(cvor: Cvor, jednostavan: string): boolean {
  const m = /^([a-z][a-z0-9]*)?(.*)$/.exec(jednostavan);
  if (!m) throw new Error(`Unsupported selector: ${jednostavan}`);
  const [, tag, ostatak] = m;
  if (tag && cvor.tag !== tag) return false;
  let rest = ostatak;
  while (rest) {
    const ne = /^:not\(\[([^\]]+)\]\)/.exec(rest);
    if (ne) {
      if (podudaraAtribut(cvor, ne[1])) return false;
      rest = rest.slice(ne[0].length);
      continue;
    }
    const atribut = /^\[([^\]]+)\]/.exec(rest);
    if (atribut) {
      if (!podudaraAtribut(cvor, atribut[1])) return false;
      rest = rest.slice(atribut[0].length);
      continue;
    }
    throw new Error(`Unsupported selector part: ${rest}`);
  }
  return true;
}

/** The pressed node and its ancestors, nearest first; `closest` finds the nearest match. */
function lanac(...cvorovi: Cvor[]) {
  return {
    closest(selektor: string): Cvor | null {
      const lista = selektor.split(", ");
      for (const cvor of cvorovi) if (lista.some((deo) => podudara(cvor, deo))) return cvor;
      return null;
    },
  };
}

const kartica: Cvor[] = [{ tag: "div" }, { tag: "article" }, { tag: "ul" }];

describe("STUDIO_KONTROLE_SELEKTOR", () => {
  test("lists every control that must not start a drag", () => {
    expect(STUDIO_KONTROLE_SELEKTOR.split(", ")).toEqual([
      "input",
      "textarea",
      "select",
      "button:not([data-drag-ok])",
      "a",
      "label",
      "[role='menuitem']",
      "[role='checkbox']",
      "[contenteditable]",
      "[data-no-drag]",
    ]);
  });

  test("contains each expected part", () => {
    for (const deo of [
      "input",
      "textarea",
      "select",
      "button:not([data-drag-ok])",
      "label",
      "[role='menuitem']",
      "[role='checkbox']",
      "[contenteditable]",
      "[data-no-drag]",
    ]) {
      expect(STUDIO_KONTROLE_SELEKTOR, deo).toContain(deo);
    }
  });

  test("a plain button is a control, the drag handle is not", () => {
    expect(STUDIO_KONTROLE_SELEKTOR).toContain("button:not([data-drag-ok])");
    expect(STUDIO_KONTROLE_SELEKTOR).not.toContain("button, ");
  });
});

describe("jeInteraktivnaMeta: controls block the drag", () => {
  test("the price field (input)", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "input", attrs: { type: "text" } }, ...kartica))).toBe(true);
  });

  test("a textarea and a select", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "textarea" }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "select" }, ...kartica))).toBe(true);
  });

  test("text or an icon inside a plain button", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "span" }, { tag: "button" }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "svg" }, { tag: "path" }, { tag: "button", attrs: { type: "button" } }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "button" }, ...kartica))).toBe(true);
  });

  test("a link", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "span" }, { tag: "a", attrs: { href: "/x" } }, ...kartica))).toBe(true);
  });

  test("a span inside a [data-no-drag] area", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "span" }, { tag: "div", attrs: { "data-no-drag": "" } }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "div", attrs: { "data-no-drag": "true" } }, ...kartica))).toBe(true);
  });

  test("a label and a checkbox", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "span" }, { tag: "label" }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "input", attrs: { type: "checkbox" } }, { tag: "label" }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "span", attrs: { role: "checkbox" } }, ...kartica))).toBe(true);
  });

  test("a menu item", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "span" }, { tag: "div", attrs: { role: "menuitem" } }, ...kartica))).toBe(true);
  });

  test("an editable area", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "span" }, { tag: "div", attrs: { contenteditable: "true" } }, ...kartica))).toBe(true);
    expect(jeInteraktivnaMeta(lanac({ tag: "div", attrs: { contenteditable: "" } }, ...kartica))).toBe(true);
  });
});

describe("jeInteraktivnaMeta: the free area drags", () => {
  test("the drag handle (button[data-drag-ok]) and what is inside it", () => {
    const rucka: Cvor = { tag: "button", attrs: { "data-drag-ok": "", type: "button" } };
    expect(jeInteraktivnaMeta(lanac(rucka, ...kartica))).toBe(false);
    expect(jeInteraktivnaMeta(lanac({ tag: "svg" }, { tag: "path" }, rucka, ...kartica))).toBe(false);
  });

  test("plain text inside the card", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "p" }, ...kartica))).toBe(false);
    expect(jeInteraktivnaMeta(lanac({ tag: "h3" }, { tag: "div" }, ...kartica))).toBe(false);
    expect(jeInteraktivnaMeta(lanac(...kartica))).toBe(false);
  });

  test("roles and attributes that are not controls", () => {
    expect(jeInteraktivnaMeta(lanac({ tag: "div", attrs: { role: "listitem" } }, ...kartica))).toBe(false);
    expect(jeInteraktivnaMeta(lanac({ tag: "div", attrs: { "data-drag-ok": "" } }, ...kartica))).toBe(false);
  });
});

describe("jeInteraktivnaMeta: not an element", () => {
  test("null and undefined", () => {
    expect(jeInteraktivnaMeta(null)).toBe(false);
    expect(jeInteraktivnaMeta(undefined)).toBe(false);
  });

  test("an object without a usable closest", () => {
    expect(jeInteraktivnaMeta({} as never)).toBe(false);
    expect(jeInteraktivnaMeta({ closest: "input" } as never)).toBe(false);
    expect(jeInteraktivnaMeta({ closest: null } as never)).toBe(false);
  });
});

describe("jeInteraktivnaMeta: how it asks", () => {
  test("passes the whole selector to closest", () => {
    const upiti: string[] = [];
    jeInteraktivnaMeta({
      closest(selektor) {
        upiti.push(selektor);
        return null;
      },
    });
    expect(upiti).toEqual([STUDIO_KONTROLE_SELEKTOR]);
  });

  test("any non-null answer from closest counts as a control", () => {
    expect(jeInteraktivnaMeta({ closest: () => ({}) })).toBe(true);
    expect(jeInteraktivnaMeta({ closest: () => null })).toBe(false);
    expect(jeInteraktivnaMeta({ closest: () => undefined })).toBe(false);
  });
});
