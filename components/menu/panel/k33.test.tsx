// K33 hardening (accessibility, audit A4 and A11): the client panel.
// A11 is read from the markup of the chart. A4 is about where focus goes when
// "Odustani" closes a confirmation; focus and state do not exist in server
// markup, so the wiring is checked in the source (the real movement of focus
// needs a browser check). Markup only, no DOM.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { StubniGrafikon } from "./analitika/stubni-grafikon";

const izvor = (relativno: string) => readFileSync(join(process.cwd(), relativno), "utf8").replace(/\r\n/g, "\n");

// -----------------------------------------------------------------------------
// A11: today's column is lighter, but never below 3:1
// -----------------------------------------------------------------------------

describe("today's column of the chart (A11)", () => {
  const grafikon = (danasJePoslednji: boolean) =>
    renderToStaticMarkup(
      <StubniGrafikon
        kljuc="probni"
        naziv="Otvaranja menija"
        dani={["2026-10-14", "2026-10-15", "2026-10-16"]}
        vrednosti={[4, 8, 6]}
        objasnjenje="probni-opis"
        danasJePoslednji={danasJePoslednji}
      />,
    );

  test("the last column is at 70 % (about 3.3:1), exactly one, and nothing is at 50 %", () => {
    const html = grafikon(true);
    expect(html.split("opacity-70").length - 1).toBe(1);
    expect(html).not.toContain("opacity-50");
    const stub = /<div class="[^"]*opacity-70[^"]*" style="height:[^"]*"><\/div>/.exec(html);
    expect(stub).not.toBeNull();
    // It sits in the slot of the last day, after the slots of the days before it.
    const slot = (dan: string) => html.indexOf(`data-dan="${dan}"`);
    expect(slot("2026-10-15")).toBeLessThan(slot("2026-10-16"));
    expect(slot("2026-10-16")).toBeLessThan(html.indexOf("opacity-70"));
  });

  test("when the period does not end today, no column is lighter", () => {
    const html = grafikon(false);
    expect(html).not.toContain("opacity-70");
    expect(html).not.toContain("opacity-50");
  });
});

// -----------------------------------------------------------------------------
// A4: "Odustani" gives focus back to the button that asked the question
// -----------------------------------------------------------------------------

/** The body of the first `onOdustani={() => { … }}` of a file (the block form, not a bare expression). */
function odustani(kod: string): string {
  const match = /onOdustani=\{\(\) => \{\n([\s\S]*?)\n\s*\}\}/.exec(kod);
  if (!match) throw new Error("onOdustani is not a block that can move focus");
  return match[1];
}

describe("'Odustani' of the confirmations in Tim i pristupi and Pošta (A4)", () => {
  test("Članovi: 'Odustani' closes the question and focuses the 'Ukloni' / 'Opozovi' button (one ref, on both)", () => {
    const kod = izvor("components/menu/panel/tim/clanovi.tsx");
    expect(odustani(kod)).toMatch(/onPotvrda\(null\);\s*okidacRef\.current\?\.focus\(\);/);
    // 'Ukloni' and 'Opozovi' are the two triggers; they are never in the same row.
    expect(kod.split("ref={okidacRef}").length - 1).toBe(2);
    expect(kod).toMatch(/ref=\{okidacRef\}\s+vrsta="opasno"\s+velicina="kompaktna"\s+ikonica=\{UserMinus\}/);
    expect(kod).toMatch(/ref=\{okidacRef\}\s+vrsta="opasno"\s+velicina="kompaktna"\s+ikonica=\{X\}/);
  });

  test("Osoblje: 'Odustani' focuses 'Resetuj PIN' or 'Deaktiviraj', whichever asked", () => {
    const kod = izvor("components/menu/panel/tim/osoblje.tsx");
    expect(odustani(kod)).toMatch(
      /r\.potvrda\(null\);\s*\(aktivnaPotvrda\.vrsta === "reset" \? resetRef : deaktivirajRef\)\.current\?\.focus\(\);/,
    );
    expect(kod).toMatch(/ref=\{resetRef\}\s+vrsta="sekundarno"\s+velicina="kompaktna"\s+ikonica=\{RotateCcw\}/);
    expect(kod).toMatch(/ref=\{deaktivirajRef\}\s+vrsta="tiho"\s+velicina="kompaktna"\s+ikonica=\{UserX\}/);
  });

  test.each([
    ["Link panela", "components/menu/panel/tim/link-panela.tsx", "setPita", "pita", "promeniRef"],
    ["Pošta", "components/menu/panel/podesavanja/posta.tsx", "setPotvrda", "potvrda", "prekiniRef"],
  ])(
    "%s: the trigger is replaced by the question, so 'Odustani' asks for focus and the effect gives it once the button is back",
    (_naziv, putanja, postavi, stanje, ref) => {
      const kod = izvor(putanja);
      expect(odustani(kod)).toMatch(new RegExp(`vratiFokus\\.current = true;\\s*${postavi}\\(false\\);`));
      expect(kod).toMatch(new RegExp(`if \\(${stanje} \\|\\| !vratiFokus\\.current\\) return;\\s*vratiFokus\\.current = false;\\s*${ref}\\.current\\?\\.focus\\(\\);`));
      expect(kod).toMatch(new RegExp(`\\}, \\[${stanje}\\]\\);`));
      expect(kod).toMatch(new RegExp(`<Dugme\\s+ref=\\{${ref}\\}`));
    },
  );
});
