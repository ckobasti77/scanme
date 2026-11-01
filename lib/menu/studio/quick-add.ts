// ScanMe Menu V1 — one row of quick entry (K10, master §13.4): `Naziv` and
// `Cena`, nothing else required. The same check runs for the inline row under
// a section ("Dodaj stavku u ovu kategoriju") and for every row of the table
// entry ("Brzo dodaj više artikala"). The server repeats it (convex/menuCatalog
// quickAddArticle, convex/menuStudio quickAddMany).

import { MENU_TEXT } from "../limits";
import { cleanText, normalizeArticleName } from "../text";
import { parseCenaUnos, type CenaGreska } from "./price-input";

/** Most rows one table entry sends (one transaction). */
export const MENU_STUDIO_MAX_QUICK_ROWS = 50;

export type NazivGreska = "obavezan" | "predugacak";

export type BrziRedProvera =
  | { ok: true; naziv: string; cena: number | null }
  | { ok: false; naziv: NazivGreska | null; cena: CenaGreska | null };

/** Validates one quick-entry row; the cleaned name and the whole-dinar price, or the reason per field. */
export function proveriBrziRed(unos: { naziv: string; cena: string }): BrziRedProvera {
  const naziv = cleanText(unos.naziv);
  const nazivGreska: NazivGreska | null =
    naziv.length === 0 ? "obavezan" : naziv.length > MENU_TEXT.articleName ? "predugacak" : null;
  const cena = parseCenaUnos(unos.cena);
  if (nazivGreska === null && cena.ok) return { ok: true, naziv, cena: cena.cena };
  return { ok: false, naziv: nazivGreska, cena: cena.ok ? null : cena.greska };
}

/** A table row is empty (ignored) when both name and price are blank. */
export function jePrazanRed(unos: { naziv: string; cena: string }): boolean {
  return unos.naziv.trim() === "" && unos.cena.trim() === "";
}

export type TabelaRed = { naziv: string; cena: string; sekcijaId: string };

/**
 * K34: the option a select really stands on, to show AND to submit. A dialog can be mounted before
 * the page content arrives, so its state holds only what the owner chose ("" = nothing yet) and the
 * rest follows the props at every render: the owner's choice, else the default the props give now,
 * else the first option ("" when there are none).
 */
export function izabranaVrednost(izbor: string, podrazumevana: string | null, opcije: readonly { id: string }[]): string {
  return izbor || podrazumevana || opcije[0]?.id || "";
}

/** K34: the table rows with the section each one goes to: a row nobody chose a section for ("") takes the default of now. */
export function redoviSaSekcijom(
  redovi: readonly TabelaRed[],
  podrazumevana: string | null,
  sekcije: readonly { id: string }[],
): TabelaRed[] {
  return redovi.map((red) => ({ ...red, sekcijaId: izabranaVrednost(red.sekcijaId, podrazumevana, sekcije) }));
}

export type TabelaProvera =
  | { ok: true; redovi: { indeks: number; naziv: string; cena: number | null; sekcijaId: string }[] }
  | {
      ok: false;
      razlog: "prazno" | "previse" | "greske";
      greske: TabelaGreska[];
    };

/** `duplikat`: the table index of an earlier row with the same name (one product = one article, master §5.2). */
export type TabelaGreska = {
  indeks: number;
  naziv: NazivGreska | null;
  cena: CenaGreska | null;
  sekcija: boolean;
  duplikat: number | null;
};

/**
 * Validates the table entry: blank rows are ignored, at least one row and at
 * most MENU_STUDIO_MAX_QUICK_ROWS, every other row needs a valid name, price
 * and one of the page's sections, and no two rows may carry the same name
 * (the second one would be a needless duplicate, master §5.2; an existing
 * article with that name is the server's "similar" answer). Indexes are the
 * table's own row indexes.
 */
export function proveriTabelu(redovi: readonly TabelaRed[], sekcije: ReadonlySet<string>): TabelaProvera {
  const popunjeni = redovi
    .map((red, indeks) => ({ red, indeks }))
    .filter(({ red }) => !jePrazanRed(red));
  if (popunjeni.length === 0) return { ok: false, razlog: "prazno", greske: [] };
  if (popunjeni.length > MENU_STUDIO_MAX_QUICK_ROWS) return { ok: false, razlog: "previse", greske: [] };
  const ispravni: { indeks: number; naziv: string; cena: number | null; sekcijaId: string }[] = [];
  const greske: TabelaGreska[] = [];
  const prviPoNazivu = new Map<string, number>();
  for (const { red, indeks } of popunjeni) {
    const provera = proveriBrziRed(red);
    const sekcijaLosa = !sekcije.has(red.sekcijaId);
    const normalizovano = normalizeArticleName(red.naziv);
    const duplikat = normalizovano !== "" ? (prviPoNazivu.get(normalizovano) ?? null) : null;
    if (normalizovano !== "" && duplikat === null) prviPoNazivu.set(normalizovano, indeks);
    if (provera.ok && !sekcijaLosa && duplikat === null) {
      ispravni.push({ indeks, naziv: provera.naziv, cena: provera.cena, sekcijaId: red.sekcijaId });
    } else {
      greske.push({
        indeks,
        naziv: provera.ok ? null : provera.naziv,
        cena: provera.ok ? null : provera.cena,
        sekcija: sekcijaLosa,
        duplikat,
      });
    }
  }
  if (greske.length > 0) return { ok: false, razlog: "greske", greske };
  return { ok: true, redovi: ispravni };
}
