// K33 hardening (accessibility, audit A5, A6, A13, A14, A20): the guest's side of
// the public menu. Markup only (renderToStaticMarkup, no DOM): effects do not run
// and the state of an open question or of a call in flight cannot be rendered, so
// for those the source of the component is checked for the exact wiring (the
// real focus movement needs a browser check). Texts come from the dictionaries.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { AlergeniTraka } from "../javni/alergeni";
import { GostPanel } from "./gost-panel";
import type { GostKontekst, GostRadnje } from "./model";

const t = menuGostSr;
const j = menuJavniSr;

const izvor = (relativno: string) => readFileSync(join(process.cwd(), relativno), "utf8").replace(/\r\n/g, "\n");

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const KONTEKST: GostKontekst = {
  slug: "demo-restoran",
  pozicija: { naziv: "Sto 12", vrsta: "table" },
  radnje: { call: true, bill: true, order: true, roomService: false },
  kanal: "standard",
  pageKey: null,
  dostavaRsd: null,
  linkovi: { meni: "/demo-restoran/meni", mojiZahtevi: "/demo-restoran/meni/zahtevi", roomService: null },
};

// Rendering must never send anything: every action throws if it is ever called.
const RADNJE: GostRadnje = {
  pozovi: async () => {
    throw new Error("rendering must not send a call");
  },
  racun: async () => {
    throw new Error("rendering must not send a bill");
  },
  posalji: async () => {
    throw new Error("rendering must not send an order");
  },
  otkazi: async () => {
    throw new Error("rendering must not cancel");
  },
};

function traka(offline: boolean): string {
  const html = renderToStaticMarkup(
    <GostPanel kontekst={KONTEKST} radnje={RADNJE} zahtevi={[]} nedostupni={[]} cuvaj={false} offline={offline} />,
  );
  const bar = /<section\b[^>]*\sdata-traka-gosta=""[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0];
  if (!bar) throw new Error("no guest bar in the markup");
  return bar;
}

/** The opening tag of the "Pozovi konobara" button. */
function pozivTag(bar: string): string {
  const tag = /<button\b[^>]*\sdata-radnja="poziv"[^>]*>/.exec(bar)?.[0];
  if (!tag) throw new Error("no call button in the bar");
  return tag;
}

// -----------------------------------------------------------------------------
// A6: a lost connection is announced (the status region is always mounted)
// -----------------------------------------------------------------------------

describe("the bar announces a lost connection (A6)", () => {
  test("online: one status region is already there, empty, and says nothing", () => {
    const bar = traka(false);
    expect(bar.split('role="status"').length - 1).toBe(1);
    expect(/<div\b[^>]*\srole="status"[^>]*><\/div>/.test(bar)).toBe(true);
    expect(tekst(bar)).not.toContain(t.traka.bezVeze);
  });

  test("offline: the same region now holds the existing 'no connection' text, and it is still the only status in the bar", () => {
    const bar = traka(true);
    expect(bar.split('role="status"').length - 1).toBe(1);
    const regija = /<div\b[^>]*\srole="status"[^>]*>([\s\S]*?)<\/div>/.exec(bar)?.[1] ?? "";
    expect(tekst(regija)).toBe(t.traka.bezVeze);
    // The text is not a status of its own any more: it lives inside the region that was mounted before.
    expect(/<p\b[^>]*role="status"/.test(bar)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// A20: "Pozovi konobara" keeps focus while it sends
// -----------------------------------------------------------------------------

describe("'Pozovi konobara' while it sends (A20)", () => {
  test("online and idle: neither disabled nor aria-disabled", () => {
    const tag = pozivTag(traka(false));
    expect(tag).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(tag).not.toContain("aria-disabled");
  });

  test("offline stays natively disabled", () => {
    const tag = pozivTag(traka(true));
    expect(tag).toContain(' disabled=""');
    expect(tag).not.toContain("aria-disabled");
  });

  test("the sending state is aria-disabled, not disabled (the state cannot be rendered on the server: wiring checked in the source)", () => {
    const kod = izvor("components/menu/gost/gost-panel.tsx");
    const mesto = kod.indexOf('data-radnja="poziv"');
    expect(mesto).toBeGreaterThan(0);
    // `data-radnja` is the last attribute of the button, so its attributes are what lies between `<button` and it.
    const dugme = kod.slice(kod.lastIndexOf("<button", mesto), mesto);
    expect(dugme).toMatch(/disabled=\{!online\}/);
    expect(dugme).toMatch(/aria-disabled=\{salje !== null \|\| undefined\}/);
    expect(dugme).not.toMatch(/disabled=\{!online \|\| salje/);
    // A click while it sends is ignored by the handler itself.
    expect(kod).toMatch(/if \(!online \|\| salje\) return;/);
  });
});

// -----------------------------------------------------------------------------
// A5: the cancel question takes focus, "Ne" gives it back to "Otkaži"
// -----------------------------------------------------------------------------

describe.each([
  ["Moji zahtevi", "components/menu/gost/moji-zahtevi.tsx"],
  ["Moje rezervacije", "components/menu/gost/rezervacija/moje-rezervacije.tsx"],
])("%s: focus around the cancel question (A5)", (_naziv, putanja) => {
  const kod = izvor(putanja);

  test("the question is focusable (tabIndex -1) and an effect moves focus to it when it opens", () => {
    expect(kod).toMatch(/<p ref=\{pitanjeRef\} tabIndex=\{-1\}/);
    expect(kod).toMatch(/if \(pitanje\) pitanjeRef\.current\?\.focus\(\);/);
  });

  test("'Ne' marks that focus goes back and closes the question; the effect focuses 'Otkaži'", () => {
    expect(kod).toMatch(/vratiFokus\.current = true;\s*setPitanje\(false\);/);
    expect(kod).toMatch(/else if \(vratiFokus\.current\) \{\s*vratiFokus\.current = false;\s*otkaziRef\.current\?\.focus\(\);/);
    expect(kod).toMatch(/<button\s+ref=\{otkaziRef\}/);
  });

  test("the effect watches only the question, so a finished cancel (which also closes it) does not move focus", () => {
    expect(kod).toMatch(/\}, \[pitanje\]\);/);
    const otkazi = kod.slice(kod.indexOf("const otkazi = async"), kod.indexOf("return (", kod.indexOf("const otkazi = async")));
    expect(otkazi).toContain("setPitanje(false)");
    expect(otkazi).not.toContain("vratiFokus");
  });
});

// -----------------------------------------------------------------------------
// A14: the live region of the allergen summary is the text only
// -----------------------------------------------------------------------------

describe("the allergen summary bar (A14)", () => {
  const html = renderToStaticMarkup(
    <AlergeniTraka oznaceni={["milk"]} brojUpozorenja={2} brojBezPodataka={0} onPromeni={() => undefined} />,
  );

  test("only the summary text is a polite live region; the paragraph and the button are not", () => {
    expect(html.split("aria-live").length - 1).toBe(1);
    expect(/<p\b[^>]*aria-live/.test(html)).toBe(false);
    const regija = /<span aria-live="polite">([^<]*)<\/span>/.exec(html);
    expect(regija).not.toBeNull();
    expect(unesc(regija?.[1] ?? "")).toContain(j.alergeni.kratko.milk);
    expect(regija?.[1]).not.toContain(j.alergeni.promeni);
  });

  test("'Promeni' stays a button right after the region, outside it", () => {
    expect(html).toMatch(/<\/span><button\b[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*>Promeni<\/button>/);
    expect(j.alergeni.promeni).toBe("Promeni");
  });
});

// -----------------------------------------------------------------------------
// A13: 8 px between neighbouring targets of the public menu
// -----------------------------------------------------------------------------

describe("gaps between neighbouring targets in the public menu (A13)", () => {
  const css = izvor("components/menu/javni/javni.module.css");

  /** The declarations of the first top-level rule `.selektor { … }` (a rule at the start of a line, not inside a media query). */
  function pravilo(selektor: string): string {
    const match = new RegExp(`(?:^|\\n)\\.${selektor} \\{([^}]*)\\}`).exec(css);
    if (!match) throw new Error(`rule not found: .${selektor}`);
    return match[1];
  }
  const gap = (selektor: string) => /\n\s*gap:\s*([^;]+);/.exec(pravilo(selektor))?.[1];

  test.each([
    ["straniceTraka", "8px"],
    ["trakaLista", "8px"],
    ["indeksLista", "8px 18px"],
    ["filteri", "8px"],
    ["alergeniPolja", "8px"],
  ])(".%s has gap %s", (selektor, ocekivano) => {
    expect(gap(selektor)).toBe(ocekivano);
  });

  test("the rows that gained room still scroll or wrap inside themselves (no page-wide horizontal scroll at 390 px)", () => {
    for (const selektor of ["straniceTraka", "trakaLista", "filteri"]) {
      expect(pravilo(selektor), selektor).toMatch(/overflow-x:\s*auto;/);
    }
    expect(pravilo("indeksLista")).toMatch(/flex-wrap:\s*wrap;/);
  });
});
