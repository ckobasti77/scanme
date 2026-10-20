"use client";

// ScanMe Menu V1 — "Proveri cenu" on a combo (K16; master §5.4): a component's
// price changed, so the owner decides. The published combo price never moves on
// its own; the owner either keeps it or types a new one.

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioKombo } from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr.posebno.kombo;

export function ProveriCenu({
  proveri,
  cena,
  mozeUredjivanje,
  onZadrzi,
  onNovaCena,
}: {
  proveri: NonNullable<StudioKombo["proveri"]>;
  /** The combo price guests see now. */
  cena: number | null;
  mozeUredjivanje: boolean;
  /** "Zadrži cenu": the owner keeps the price as it is. */
  onZadrzi: () => Promise<void> | void;
  /** "Upiši novu cenu": the parent moves focus to the price field. */
  onNovaCena: () => void;
}) {
  const [radi, setRadi] = useState(false);

  const zadrzi = async () => {
    setRadi(true);
    try {
      await onZadrzi();
    } finally {
      setRadi(false);
    }
  };

  return (
    <div
      role="status"
      data-proveri-cenu=""
      className="flex min-w-0 gap-3 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)] p-3 sm:p-4"
    >
      <TriangleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-[var(--mp-upozorenje)]" />
      <div className="grid min-w-0 flex-1 gap-2">
        <h3 className="text-[0.9375rem] font-semibold">{t.proveriNaslov}</h3>
        <p className="text-sm leading-snug">{fmt(t.proveriOpis, { cena: tekstCene(cena) })}</p>
        {proveri.promenjeni.length > 0 ? (
          <p className="break-words text-sm leading-snug">{fmt(t.promenjeni, { lista: proveri.promenjeni.join(", ") })}</p>
        ) : null}
        {proveri.uklonjeni.length > 0 ? (
          <p className="break-words text-sm leading-snug">{fmt(t.uklonjeni, { lista: proveri.uklonjeni.join(", ") })}</p>
        ) : null}
        {mozeUredjivanje ? (
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Dugme vrsta="sekundarno" ucitava={radi} onClick={() => void zadrzi()} className="w-full sm:w-auto" data-zadrzi-cenu="">
              {fmt(t.zadrzi, { cena: tekstCene(cena) })}
            </Dugme>
            <Dugme vrsta="tiho" onClick={onNovaCena} className="w-full sm:w-auto">
              {t.novaCena}
            </Dugme>
          </div>
        ) : null}
      </div>
    </div>
  );
}
