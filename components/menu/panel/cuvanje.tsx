"use client";

// ScanMe Menu V1 (K25) — the save cycle the three reservation blocks share
// (Funkcionalnosti > Rezervacije, Podešavanja > Radno vreme and Zadržavanje):
// one save at a time, "Čuva se…" → "Sačuvano." or a mapped error. The result
// comes back as a value ({ ok:false, code }); a thrown error is a lost
// connection. Texts are the callers' (menu-panel dictionary); error codes go
// through menu-domen.

import { CircleCheck } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";

export type SacuvajIshod = { ok: true } | { ok: false; code: string };
export type CuvanjeFaza = "mirno" | "cuva" | "sacuvano" | "greska";

/** Serbian text of a machine error code; a code the domain does not know gets `rezerva`. */
export function porukaKoda(code: string, rezerva: string): string {
  const poznate: Record<string, string | undefined> = menuDomenSr.errors;
  return poznate[code] ?? rezerva;
}

export function useCuvanje() {
  const [faza, setFaza] = useState<CuvanjeFaza>("mirno");
  const [kod, setKod] = useState<string | null>(null);
  const zauzeto = useRef(false);

  /** Runs `rad`; null when a save is already running (a second click does nothing). */
  const pokreni = useCallback(async (rad: () => Promise<SacuvajIshod>): Promise<SacuvajIshod | null> => {
    if (zauzeto.current) return null;
    zauzeto.current = true;
    setFaza("cuva");
    setKod(null);
    let ishod: SacuvajIshod;
    try {
      ishod = await rad();
    } catch {
      ishod = { ok: false, code: "mreza" };
    }
    zauzeto.current = false;
    if (ishod.ok) {
      setFaza("sacuvano");
    } else {
      setFaza("greska");
      setKod(ishod.code);
    }
    return ishod;
  }, []);

  /** A field changed: "Sačuvano." and an old error no longer describe the screen. */
  const izmenjeno = useCallback(() => {
    setFaza((tekuca) => (tekuca === "cuva" ? tekuca : "mirno"));
    setKod(null);
  }, []);

  return { faza, kod, pokreni, izmenjeno };
}

/** The polite status next to a save button: always in the page, only its text changes. */
export function CuvanjeStatus({ faza, cuva, sacuvano }: { faza: CuvanjeFaza; cuva: string; sacuvano: string }) {
  return (
    <div role="status" aria-live="polite" data-cuvanje={faza} className="min-h-6 text-sm">
      {faza === "cuva" ? <span className="text-[var(--mp-tekst-sporedni)]">{cuva}</span> : null}
      {faza === "sacuvano" ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--mp-tekst)]">
          <CircleCheck aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-[var(--mp-uspeh)]" />
          {sacuvano}
        </span>
      ) : null}
    </div>
  );
}
