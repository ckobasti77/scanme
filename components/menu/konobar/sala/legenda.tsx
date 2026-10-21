// ScanMe Menu V1 (K23) — the legend of the floor (master §10.3: "U tabeli se
// ikonice prikazuju u koloni zahteva sa legendom"): every kind a table can
// show (icon + colour + word), what the dash means (nothing active — never
// "free"), when a wait turns red, and the four occupancy states only when the
// venue uses that module. Reservations join when K25 brings them.

import { ClockAlert } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { OCCUPANCY_STATES } from "@/lib/menu/occupancy";
import type { TableKind } from "@/lib/menu/table-summary";
import { cn } from "@/lib/utils";
import { VRSTA } from "../vrsta";
import { ZauzetostOznaka } from "./zauzetost-oznaka";

const t = menuKonobarSr.sala;

export function Legenda({
  vrste,
  pragMin,
  zauzetost,
  tabela = false,
  className,
}: {
  /** The kinds the floor can show now (reservations only once K25 is there). */
  vrste: readonly TableKind[];
  pragMin: number;
  /** The occupancy module is on: its four states join the legend. */
  zauzetost: boolean;
  /** The table view: the dash means "nothing active" there (the plan draws nothing for it). */
  tabela?: boolean;
  className?: string;
}) {
  return (
    <section aria-label={t.legenda} className={cn("grid gap-2", className)} data-legenda>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.9375rem] text-[var(--mp-tekst)]">
        {vrste.map((vrsta) => {
          const v = VRSTA[vrsta];
          const Ikonica = v.ikonica;
          return (
            <li key={vrsta} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className={cn("grid size-7 place-items-center rounded-full", v.meko)}>
                <Ikonica strokeWidth={2} className={cn("size-4", v.boja)} />
              </span>
              {t.vrste[vrsta]}
            </li>
          );
        })}
        {tabela ? (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="grid size-7 place-items-center font-bold text-[var(--mp-tekst-sporedni)]">
              {t.neutralno}
            </span>
            {t.legendaNeutralno}
          </li>
        ) : (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-5 w-7 rounded-full border-2 border-dashed [--border:var(--mp-ivica-kontrole)]" />
            {t.legendaPrihvaceno}
          </li>
        )}
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-[var(--mp-opasnost-meko)]">
            <ClockAlert strokeWidth={2} className="size-4 text-[var(--mp-opasnost)]" />
          </span>
          {fmt(t.legendaKasni, { n: pragMin })}
        </li>
      </ul>
      {zauzetost ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold text-[var(--mp-tekst-sporedni)]">{t.legendaZauzetost}</span>
          <ul className="flex flex-wrap gap-2">
            {OCCUPANCY_STATES.map((stanje) => (
              <li key={stanje}>
                <ZauzetostOznaka stanje={stanje} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
