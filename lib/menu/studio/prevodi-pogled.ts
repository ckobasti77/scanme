// ScanMe Menu V1 (K16) — what the translation views show, as pure functions
// (master §7.7). The components only render these results: which items need
// attention in a language, how the list is grouped, which AI suggestions wait
// for the owner, and the key of each autosaved field. No React here, so it is
// unit-testable.

import { menuStudioSr } from "../../i18n/sr/menu-studio";
import {
  countStatuses,
  entityTranslationStatus,
  fieldTranslation,
  worstStatus,
  type MenuTranslationField,
  type MenuTranslationStatus,
} from "../translation-status";
import type { StudioPrevodCilj, StudioPrevodStavka } from "./model";
import { POLJA_PREVODA } from "./prevodi";

/** The state of the item in one language; null = no source text, nothing to translate. */
export function statusStavke(stavka: StudioPrevodStavka, jezik: string): MenuTranslationStatus | null {
  return entityTranslationStatus(stavka.izvor, stavka.prevodi, jezik);
}

/** Missing, stale and suggested need the owner; done does not. */
export function trebaPaznju(status: MenuTranslationStatus | null): boolean {
  return status === "missing" || status === "stale" || status === "suggested";
}

export function brojeviPoJeziku(stavke: readonly StudioPrevodStavka[], jezik: string): Record<MenuTranslationStatus, number> {
  return countStatuses(stavke.map((stavka) => statusStavke(stavka, jezik)));
}

/** The worst state over all items in one language (null = nothing to translate at all). */
export function najgoriStatus(stavke: readonly StudioPrevodStavka[], jezik: string): MenuTranslationStatus | null {
  return worstStatus(stavke.map((stavka) => statusStavke(stavka, jezik)));
}

/** A stable identity of an item inside one view. */
export function kljucStavke(stavka: StudioPrevodStavka): string {
  return `${stavka.vrsta}:${stavka.id}`;
}

/**
 * The items to list. `samoTreba` keeps those needing attention; `zadrzi` keeps
 * items by identity even after they got translated, so a field the owner is
 * typing into does not vanish from under the cursor.
 */
export function filtriraj(
  stavke: readonly StudioPrevodStavka[],
  jezik: string,
  samoTreba: boolean,
  zadrzi?: ReadonlySet<string>,
): StudioPrevodStavka[] {
  if (!samoTreba) return stavke.slice();
  return stavke.filter((stavka) => trebaPaznju(statusStavke(stavka, jezik)) || zadrzi?.has(kljucStavke(stavka)) === true);
}

export type StudioPrevodGrupa = { grupa: StudioPrevodStavka["grupa"]; stavke: StudioPrevodStavka[] };

/** Consecutive items under the same heading (kind + name), in the order of the list. */
export function grupisi(stavke: readonly StudioPrevodStavka[]): StudioPrevodGrupa[] {
  const grupe: StudioPrevodGrupa[] = [];
  for (const stavka of stavke) {
    const poslednja = grupe[grupe.length - 1];
    if (poslednja && poslednja.grupa.vrsta === stavka.grupa.vrsta && poslednja.grupa.naziv === stavka.grupa.naziv) {
      poslednja.stavke.push(stavka);
    } else {
      grupe.push({ grupa: stavka.grupa, stavke: [stavka] });
    }
  }
  return grupe;
}

/** The fields of the item that have a source text, i.e. the ones that can be translated. */
export function poljaZaPrevod(stavka: StudioPrevodStavka): MenuTranslationField[] {
  return POLJA_PREVODA[stavka.vrsta].filter((polje) => fieldTranslation(stavka.izvor[polje], undefined, polje).status !== null);
}

/** The pending AI suggestions of the item in one language, by field (never published). */
export function predlogPolja(stavka: StudioPrevodStavka, jezik: string): Partial<Record<MenuTranslationField, string>> {
  const unos = stavka.prevodi?.[jezik];
  const predlozi: Partial<Record<MenuTranslationField, string>> = {};
  for (const polje of POLJA_PREVODA[stavka.vrsta]) {
    const pogled = fieldTranslation(stavka.izvor[polje], unos, polje);
    if (pogled.status !== null && pogled.suggestion !== null) predlozi[polje] = pogled.suggestion;
  }
  return predlozi;
}

export function cilj(stavka: StudioPrevodStavka): StudioPrevodCilj {
  return { vrsta: stavka.vrsta, id: stavka.id };
}

/** The autosave key of one translated field in one language. */
export function kljucPrevoda(stavka: StudioPrevodStavka, jezik: string, polje: MenuTranslationField): string {
  return `prevod:${stavka.vrsta}:${stavka.id}:${jezik}:${polje}`;
}

/** The Serbian name of a language code ("engleski"); an unknown code is shown uppercased. */
export function nazivJezika(kod: string): string {
  const nazivi = menuStudioSr.posebno.prevodi.jezici as Record<string, string>;
  return nazivi[kod] ?? kod.toUpperCase();
}
