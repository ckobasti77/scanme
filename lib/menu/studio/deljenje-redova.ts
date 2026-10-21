// ScanMe Menu V1 — structural sharing of the editor content (K33, audit C6).
// Every answer of the server arrives as brand-new objects, row by row, even when
// nothing in a row changed — so `React.memo` of a row (which compares the `red`
// prop by identity) never skipped, and one saved price redrew every open row of
// a 400-article page. `zadrziSadrzaj` lays the new answer over the content the
// editor already has: a row, a section or the whole content whose data is the
// same keeps the OLD object; only what really changed is new. Pure: no React.

import type { StudioRadniSadrzaj, StudioSekcija } from "./model";

/** Equal by value: plain data only (numbers, strings, booleans, null, arrays, plain objects). */
export function jednakoPoVrednosti(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((vrednost, indeks) => jednakoPoVrednosti(vrednost, b[indeks]));
  }
  const kljucevi = Object.keys(a);
  if (kljucevi.length !== Object.keys(b).length) return false;
  const drugi = b as Record<string, unknown>;
  return kljucevi.every(
    (kljuc) => Object.prototype.hasOwnProperty.call(drugi, kljuc) && jednakoPoVrednosti((a as Record<string, unknown>)[kljuc], drugi[kljuc]),
  );
}

/** Equal field by field, each field by identity (the nested parts are already shared). */
function plitkoJednako<T extends object>(a: T, b: T): boolean {
  const kljucevi = Object.keys(a);
  if (kljucevi.length !== Object.keys(b).length) return false;
  const prvi = a as Record<string, unknown>;
  const drugi = b as Record<string, unknown>;
  return kljucevi.every((kljuc) => Object.prototype.hasOwnProperty.call(drugi, kljuc) && Object.is(prvi[kljuc], drugi[kljuc]));
}

/**
 * The new list, made of the OLD objects wherever an item with the same key has
 * the same data. The old array itself comes back when the whole list is the
 * same (same items, same order). Neither input is changed.
 */
export function zadrziIste<T>(
  prethodni: T[],
  novi: T[],
  kljuc: (stavka: T) => string,
  jednako: (a: T, b: T) => boolean = jednakoPoVrednosti,
): T[] {
  const stari = new Map<string, T>();
  for (const stavka of prethodni) stari.set(kljuc(stavka), stavka);
  let svaIsta = novi.length === prethodni.length;
  const rezultat = novi.map((stavka, indeks) => {
    const stara = stari.get(kljuc(stavka));
    const izabrana = stara !== undefined && jednako(stara, stavka) ? stara : stavka;
    if (izabrana !== prethodni[indeks]) svaIsta = false;
    return izabrana;
  });
  return svaIsta ? prethodni : rezultat;
}

function deljeneSekcije(prethodne: StudioSekcija[], nove: StudioSekcija[]): StudioSekcija[] {
  const stare = new Map(prethodne.map((sekcija) => [sekcija.id, sekcija]));
  // Rows first (inside each section), then the sections: a section is "the same" when its
  // own fields and its (shared) rows array are the same objects.
  const saDeljenimRedovima = nove.map((sekcija) => {
    const stara = stare.get(sekcija.id);
    return stara ? { ...sekcija, redovi: zadrziIste(stara.redovi, sekcija.redovi, (red) => red.prikazId) } : sekcija;
  });
  return zadrziIste(prethodne, saDeljenimRedovima, (sekcija) => sekcija.id, plitkoJednako);
}

/** The new content of the work area, sharing every row, section and part that did not change. */
export function zadrziSadrzaj(prethodni: StudioRadniSadrzaj | null | undefined, novi: StudioRadniSadrzaj): StudioRadniSadrzaj {
  if (!prethodni) return novi;
  const kandidat: StudioRadniSadrzaj = {
    ...novi,
    stranica: jednakoPoVrednosti(prethodni.stranica, novi.stranica) ? prethodni.stranica : novi.stranica,
    sekcije: deljeneSekcije(prethodni.sekcije, novi.sekcije),
  };
  return plitkoJednako(kandidat, prethodni) ? prethodni : kandidat;
}
