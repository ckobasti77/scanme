// ScanMe Menu V1 — Convex answers as editor outcomes (K10). A refusal thrown as
// ConvexError carries a machine code (menu/…, plan/…, article/…) that the UI
// words through menu-domen; a CAS answer `{ ok: false, conflicts, current,
// attempted }` becomes a conflict; anything else (network, timeout) is a
// failure worth retrying as is.

import { ConvexError } from "convex/values";
import type { CasValue } from "@/lib/menu/cas";
import type { StudioIshod } from "@/lib/menu/studio/model";

type CasOdgovor = {
  ok: false;
  conflicts: string[];
  current: Record<string, CasValue>;
  attempted?: Record<string, CasValue>;
};

function jeCas(value: unknown): value is CasOdgovor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    Array.isArray((value as { conflicts?: unknown }).conflicts)
  );
}

export function izGreske<T>(error: unknown): StudioIshod<T> {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return { ok: false, vrsta: "greska", kod: error.data, ponovljivo: false };
  }
  return { ok: false, vrsta: "greska", kod: "mreza", ponovljivo: true };
}

/** Runs a mutation; a CAS answer on `polje` becomes a conflict, the rest goes through `uspeh`. */
export async function izvrsi<R, T>(
  rad: () => Promise<R>,
  uspeh: (rezultat: R) => T,
  polje?: string,
  pokusano?: CasValue,
): Promise<StudioIshod<T>> {
  try {
    const rezultat = await rad();
    if (jeCas(rezultat)) {
      const kljuc = polje ?? rezultat.conflicts[0];
      return {
        ok: false,
        vrsta: "konflikt",
        sacuvano: rezultat.current[kljuc] ?? null,
        pokusano: rezultat.attempted?.[kljuc] ?? pokusano ?? null,
      };
    }
    return { ok: true, vrednost: uspeh(rezultat) };
  } catch (error) {
    return izGreske<T>(error);
  }
}
