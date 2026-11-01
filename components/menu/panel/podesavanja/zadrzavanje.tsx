"use client";

// ScanMe Menu V1 (K25) — Podešavanja > Zadržavanje rezervacije (master §11.5,
// §10.4; plan docs/meni/planovi/K24.md K24-9, K24-10): how many minutes the
// venue waits for guests after their reservation's time. After that the table
// shows the red late warning; nothing is cancelled or released on its own.
// 5–180 minutes. Presentational: the route (rezervacije-podesavanja-ruta.tsx)
// and the izlog pass `minuta` and `onSacuvaj`.
//
// The field starts from `minuta` and is not reset when it changes under it.

import { useId, useState, type FormEvent } from "react";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { RESERVATION_HOLD_MAX, RESERVATION_HOLD_MIN, isValidReservationHold } from "@/lib/menu/reservation-late";
import { cn } from "@/lib/utils";
import { POLJE_KLASA, Polje, PorukaGreske } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";

const t = menuPanelSr.zadrzavanje;

/** The step of the number field's arrows; any whole number in range is accepted. */
const KORAK = 5;

export type ZadrzavanjeSacuvaj = (minuta: number) => Promise<SacuvajIshod>;

export function ZadrzavanjeRezervacije({
  minuta,
  onSacuvaj,
  disabled = false,
  razlog,
  nivo = 2,
}: {
  /** The saved hold, in minutes. */
  minuta: number;
  onSacuvaj: ZadrzavanjeSacuvaj;
  /** The role cannot edit settings: the field and the button are off. */
  disabled?: boolean;
  /** Why it is off; written on the screen when `disabled`. */
  razlog?: string;
  nivo?: 2 | 3;
}) {
  const id = useId();
  const poljeId = `${id}-minuta`;
  const razlogId = `${id}-razlog`;
  const [vrednost, setVrednost] = useState(String(minuta));
  const [nevazece, setNevazece] = useState(false);
  const { faza, kod, pokreni, izmenjeno } = useCuvanje();

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const broj = Number(vrednost);
    if (vrednost.trim() === "" || !isValidReservationHold(broj)) {
      setNevazece(true);
      document.getElementById(poljeId)?.focus();
      return;
    }
    setNevazece(false);
    await pokreni(() => onSacuvaj(broj));
  };

  return (
    <Kartica data-zadrzavanje="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={nivo}>
        <form noValidate onSubmit={sacuvaj} className="grid gap-4">
          <Polje id={poljeId} oznaka={t.oznaka} pomoc={nevazece ? undefined : t.opseg} greska={nevazece ? t.opseg : null}>
            {(aria) => (
              <div className="flex items-center gap-2">
                <input
                  {...aria}
                  type="number"
                  inputMode="numeric"
                  min={RESERVATION_HOLD_MIN}
                  max={RESERVATION_HOLD_MAX}
                  step={KORAK}
                  value={vrednost}
                  disabled={disabled}
                  onChange={(event) => {
                    setVrednost(event.target.value);
                    setNevazece(false);
                    izmenjeno();
                  }}
                  className={cn(POLJE_KLASA, "w-28")}
                />
                <span aria-hidden="true" className="text-[0.9375rem] font-medium text-[var(--mp-tekst-sporedni)]">
                  {t.jedinica}
                </span>
              </div>
            )}
          </Polje>

          {disabled && razlog ? (
            <p id={razlogId} className="text-sm leading-relaxed text-[var(--mp-tekst)]">
              {razlog}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Dugme
              type="submit"
              vrsta="primarno"
              ucitava={faza === "cuva"}
              disabled={disabled}
              aria-describedby={disabled && razlog ? razlogId : undefined}
            >
              {t.sacuvaj}
            </Dugme>
            <CuvanjeStatus faza={faza} cuva={t.cuva} sacuvano={t.sacuvano} />
          </div>
          {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
        </form>
      </OkvirSekcije>
    </Kartica>
  );
}
