// @vitest-environment node
//
// K34 review fixes of the editor, the pure parts: the select value a dialog shows and sends when it
// was mounted before the page content arrived, the table rows made in that state, and the allergen
// record's canonical form now living in lib/menu/allergens (the production editor must not import the
// in-memory izlog modules for it). Node environment only because the last test reads source files.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { kanonskiAlergeni } from "../allergens";
import { kanonskiAlergeni as izMemorije } from "./memorija-detalj";
import { izabranaVrednost, proveriTabelu, redoviSaSekcijom, type TabelaRed } from "./quick-add";

const A = { id: "sekcija-a" };
const B = { id: "sekcija-b" };
const C = { id: "sekcija-c" };

describe("K34 izabranaVrednost: what a select stands on and what is sent", () => {
  test("nothing chosen: the default that the props give", () => {
    expect(izabranaVrednost("", B.id, [A, B, C])).toBe(B.id);
  });

  test("an explicit choice wins over the default", () => {
    expect(izabranaVrednost(C.id, B.id, [A, B, C])).toBe(C.id);
    expect(izabranaVrednost(A.id, null, [A, B, C])).toBe(A.id);
  });

  test("the default follows the props when they change; an explicit choice does not", () => {
    expect(izabranaVrednost("", A.id, [A, B, C])).toBe(A.id);
    expect(izabranaVrednost("", C.id, [A, B, C])).toBe(C.id);
    expect(izabranaVrednost(B.id, A.id, [A, B, C])).toBe(B.id);
    expect(izabranaVrednost(B.id, C.id, [A, B, C])).toBe(B.id);
  });

  test("a dialog mounted before the content: the same empty state resolves once the options arrive", () => {
    // Mounted: no sections yet, nothing chosen, no default.
    expect(izabranaVrednost("", null, [])).toBe("");
    // The page content arrives, the state is still "": the first option, or the default of the props.
    expect(izabranaVrednost("", null, [A, B])).toBe(A.id);
    expect(izabranaVrednost("", B.id, [A, B])).toBe(B.id);
  });

  test("no default (null or empty): the first option; no options: empty", () => {
    expect(izabranaVrednost("", null, [B, A])).toBe(B.id);
    expect(izabranaVrednost("", "", [B, A])).toBe(B.id);
    expect(izabranaVrednost("", null, [])).toBe("");
  });
});

describe("K34 redoviSaSekcijom: rows made before the sections arrived", () => {
  const sekcije = [A, B, C];
  const ids = new Set(sekcije.map((sekcija) => sekcija.id));
  // The state of a table that was mounted while the page had no sections: no row has a section.
  const nepopunjeni: TabelaRed[] = [
    { naziv: "Čaj", cena: "120", sekcijaId: "" },
    { naziv: "Kafa", cena: "150", sekcijaId: "" },
    { naziv: "", cena: "", sekcijaId: "" },
  ];

  test("without the fix the check refuses every filled row: no section", () => {
    const provera = proveriTabelu(nepopunjeni, ids);
    expect(provera.ok).toBe(false);
    if (provera.ok) return;
    expect(provera.razlog).toBe("greske");
    expect(provera.greske.map((g) => [g.indeks, g.sekcija])).toEqual([
      [0, true],
      [1, true],
    ]);
  });

  test("rows nobody chose a section for go to the default of now, and the check passes", () => {
    const provera = proveriTabelu(redoviSaSekcijom(nepopunjeni, B.id, sekcije), ids);
    expect(provera.ok).toBe(true);
    if (!provera.ok) return;
    expect(provera.redovi.map((red) => [red.indeks, red.naziv, red.sekcijaId])).toEqual([
      [0, "Čaj", B.id],
      [1, "Kafa", B.id],
    ]);
  });

  test("a row with its own choice keeps it; the others follow the default when it changes", () => {
    const redovi: TabelaRed[] = [
      { naziv: "Čaj", cena: "120", sekcijaId: C.id },
      { naziv: "Kafa", cena: "150", sekcijaId: "" },
    ];
    expect(redoviSaSekcijom(redovi, A.id, sekcije).map((red) => red.sekcijaId)).toEqual([C.id, A.id]);
    expect(redoviSaSekcijom(redovi, B.id, sekcije).map((red) => red.sekcijaId)).toEqual([C.id, B.id]);
    // No default from the props: the first section.
    expect(redoviSaSekcijom(redovi, null, sekcije).map((red) => red.sekcijaId)).toEqual([C.id, A.id]);
  });

  test("the rows of the state are not changed (the choice stays empty, so it keeps following the props)", () => {
    const kopija = nepopunjeni.map((red) => ({ ...red }));
    redoviSaSekcijom(nepopunjeni, B.id, sekcije);
    expect(nepopunjeni).toEqual(kopija);
  });
});

describe("K34 kanonskiAlergeni lives in lib/menu/allergens", () => {
  test("memorija-detalj re-exports that very function", () => {
    expect(izMemorije).toBe(kanonskiAlergeni);
  });

  test("canonical order, a code in both lists only in sadrzi, drugo only with other, empty = null", () => {
    expect(kanonskiAlergeni({ sadrzi: ["milk", "gluten"], tragovi: ["gluten", "eggs"], drugo: null })).toEqual({
      sadrzi: ["gluten", "milk"],
      tragovi: ["eggs"],
      drugo: null,
    });
    expect(kanonskiAlergeni({ sadrzi: [], tragovi: ["other"], drugo: "  orasi   i  bademi " })?.drugo).toBe("orasi i bademi");
    expect(kanonskiAlergeni({ sadrzi: ["milk"], tragovi: [], drugo: "orasi" })?.drugo).toBeNull();
    expect(kanonskiAlergeni({ sadrzi: [], tragovi: [], drugo: "ništa" })).toBeNull();
    expect(kanonskiAlergeni(null)).toBeNull();
  });

  test("no production file of the studio editor imports an in-memory izlog module", () => {
    const koren = path.resolve(__dirname, "../../../components/menu/studio");
    const fajlovi: string[] = [];
    const prodji = (dir: string) => {
      for (const ime of readdirSync(dir)) {
        const pun = path.join(dir, ime);
        if (statSync(pun).isDirectory()) prodji(pun);
        else if (/\.tsx?$/.test(ime) && !/\.test\.tsx?$/.test(ime)) fajlovi.push(pun);
      }
    };
    prodji(koren);
    expect(fajlovi.length).toBeGreaterThan(10);
    // lib/menu/studio/memorija, memorija-detalj, memorija-k16 ... are the izlog's in-memory menu.
    const uvoz = /from\s+["'][^"']*\/memorija[\w-]*["']/;
    const prestupnici = fajlovi.filter((fajl) => uvoz.test(readFileSync(fajl, "utf8"))).map((fajl) => path.relative(koren, fajl));
    expect(prestupnici).toEqual([]);

    const oznake = readFileSync(path.join(koren, "artikal/alergeni-i-oznake.tsx"), "utf8");
    expect(oznake).toMatch(/import\s*\{[^}]*\bkanonskiAlergeni\b[^}]*\}\s*from\s*"@\/lib\/menu\/allergens"/);
  });
});
