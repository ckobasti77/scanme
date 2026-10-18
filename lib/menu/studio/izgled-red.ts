// ScanMe Menu V1 (K17) — Izgled on the editor's save queue
// (./autosave-queue.ts). Each control saves one fixed group of fields under
// one key, as JSON text (the queue carries CasValue), so a quick second
// choice waits for the first and is sent with the value the first saved, and
// a conflict never overwrites someone else's choice silently (master §6.1).
// What the editor and the preview show is the server value with the choices
// still on the way laid over it.

import type { CasValue } from "../cas";
import { MENU_IZGLED_POLJA, type IzgledIzmena, type IzgledPolje } from "../identity/izbor";
import type { MenuPresentationValues } from "../presentation";

/** One queue key per control and the fields it always saves together. */
export const IZGLED_GRUPE = {
  raspored: ["layout", "layoutVariant"],
  paleta: ["paletteId", "brandColors"],
  pismo: ["fontPairId"],
  gustina: ["density"],
  naglasak: ["emphasis"],
  mediji: ["defaultMediaMode"],
  pretraga: ["search"],
  filteri: ["filters"],
  valuta: ["currencyToggle"],
  brending: ["branding"],
} as const satisfies Record<string, readonly IzgledPolje[]>;

export type IzgledGrupa = keyof typeof IZGLED_GRUPE;

const PREFIKS = "izgled:";

export function kljucIzgleda(grupa: IzgledGrupa): string {
  return `${PREFIKS}${grupa}`;
}

/** The group's fields of `values`, in a fixed order (an absent variant is null). */
export function deoIzgleda(values: MenuPresentationValues, grupa: IzgledGrupa): IzgledIzmena {
  const out: Record<string, unknown> = {};
  for (const polje of IZGLED_GRUPE[grupa]) {
    const value = values[polje as keyof MenuPresentationValues];
    out[polje] = value === undefined ? null : value;
  }
  return out as IzgledIzmena;
}

/** A change of one group as the queue carries it. */
export function izgledKaoTekst(izmena: IzgledIzmena): string {
  return JSON.stringify(izmena);
}

export function izgledIzTeksta(tekst: CasValue): IzgledIzmena | null {
  if (typeof tekst !== "string") return null;
  try {
    const value: unknown = JSON.parse(tekst);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as IzgledIzmena) : null;
  } catch {
    return null;
  }
}

/**
 * The values of a compare-and-set answer (lists as JSON text, an absent
 * variant as null) back in the form of a change, in the fixed field order —
 * what a conflict of Izgled carries as `sacuvano` (JSON text of the group).
 */
export function izmenaIzCas(polja: Partial<Record<IzgledPolje, CasValue>>): IzgledIzmena {
  const out: Record<string, unknown> = {};
  for (const polje of MENU_IZGLED_POLJA) {
    if (!(polje in polja)) continue;
    const value = polja[polje] ?? null;
    if ((polje === "brandColors" || polje === "filters") && typeof value === "string") {
      try {
        out[polje] = JSON.parse(value);
      } catch {
        out[polje] = null;
      }
    } else {
      out[polje] = value;
    }
  }
  return out as IzgledIzmena;
}

/** Applies a change for display only (no rules: the server decides). */
export function primeniZaPrikaz(values: MenuPresentationValues, izmena: IzgledIzmena): MenuPresentationValues {
  const next: MenuPresentationValues = { ...values };
  for (const [polje, value] of Object.entries(izmena)) {
    if (value === undefined) continue;
    if (polje === "layoutVariant") {
      if (value === null) delete next.layoutVariant;
      else next.layoutVariant = value as string;
    } else {
      (next as Record<string, unknown>)[polje] = value;
    }
  }
  return next;
}

/**
 * The appearance the editor shows: the server values with every Izgled key
 * still waiting, sending, failed or in conflict laid over them (the person's
 * own choice stays on screen until it is saved or they take the saved one).
 * The same object when nothing is waiting.
 */
export function izgledSaCekanjem(values: MenuPresentationValues, naCekanju: ReadonlyMap<string, CasValue>): MenuPresentationValues {
  let out = values;
  for (const [kljuc, tekst] of naCekanju) {
    if (!kljuc.startsWith(PREFIKS)) continue;
    const izmena = izgledIzTeksta(tekst);
    if (izmena) out = primeniZaPrikaz(out, izmena);
  }
  return out;
}
