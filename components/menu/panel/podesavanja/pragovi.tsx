"use client";

// ScanMe Menu V1 (K28) — Podešavanja > Konobarski panel (master §8.5, §10.4; plan
// docs/meni/planovi/K24.md §4.7, K19-21): when a waiting guest request turns red
// (1–120 minutes) and how often the panel reminds the staff of a request that is
// still new (0–60 minutes; 0 = no reminder). Presentational: the route passes the
// saved numbers, whether the role may edit and `onSacuvaj`; the structure is that
// of zadrzavanje.tsx.
//
// The fields start from `prag` and `podsetnik` and are not reset when they change under them.

import { useId, useState, type FormEvent } from "react";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import {
  LATE_THRESHOLD_MAX,
  LATE_THRESHOLD_MIN,
  REMINDER_MAX,
  isValidLateThreshold,
  isValidReminder,
} from "@/lib/menu/thresholds";
import { cn } from "@/lib/utils";
import { POLJE_KLASA, Polje, PorukaGreske } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";

const t = menuPanelSr.podesavanja.konobar;

export type PragoviSacuvaj = (prag: number, podsetnik: number) => Promise<SacuvajIshod>;

export type PragoviPanelaProps = {
  /** The saved late threshold, in minutes. */
  prag: number;
  /** The saved reminder interval, in minutes; 0 = off. */
  podsetnik: number;
  /** The role may edit settings. */
  moze: boolean;
  /** Why it is off; written on the screen when `moze` is false. */
  razlog?: string;
  onSacuvaj: PragoviSacuvaj;
  nivo?: 2 | 3;
};

export function PragoviPanela({ prag, podsetnik, moze, razlog, onSacuvaj, nivo = 2 }: PragoviPanelaProps) {
  const id = useId();
  const pragId = `${id}-prag`;
  const podsetnikId = `${id}-podsetnik`;
  const razlogId = `${id}-razlog`;
  const [pragTekst, setPragTekst] = useState(String(prag));
  const [podsetnikTekst, setPodsetnikTekst] = useState(String(podsetnik));
  const [nevazeci, setNevazeci] = useState<{ prag: boolean; podsetnik: boolean }>({ prag: false, podsetnik: false });
  const { faza, kod, pokreni, izmenjeno } = useCuvanje();
  const iskljuceno = !moze;

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (iskljuceno) return;
    const pragBroj = Number(pragTekst);
    const podsetnikBroj = Number(podsetnikTekst);
    const losPrag = pragTekst.trim() === "" || !isValidLateThreshold(pragBroj);
    const losPodsetnik = podsetnikTekst.trim() === "" || !isValidReminder(podsetnikBroj);
    setNevazeci({ prag: losPrag, podsetnik: losPodsetnik });
    if (losPrag || losPodsetnik) {
      document.getElementById(losPrag ? pragId : podsetnikId)?.focus();
      return;
    }
    await pokreni(() => onSacuvaj(pragBroj, podsetnikBroj));
  };

  const polje = (
    kljuc: "prag" | "podsetnik",
    poljeId: string,
    oznaka: string,
    pomoc: string,
    vrednost: string,
    postavi: (tekst: string) => void,
    min: number,
    max: number,
  ) => (
    <Polje
      id={poljeId}
      oznaka={oznaka}
      pomoc={nevazeci[kljuc] ? undefined : pomoc}
      greska={nevazeci[kljuc] ? t.opseg : null}
    >
      {(aria) => (
        <div className="flex items-center gap-2">
          <input
            {...aria}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={vrednost}
            disabled={iskljuceno}
            aria-describedby={[aria["aria-describedby"], iskljuceno && razlog ? razlogId : null].filter(Boolean).join(" ") || undefined}
            onChange={(event) => {
              postavi(event.target.value);
              setNevazeci((tekuce) => ({ ...tekuce, [kljuc]: false }));
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
  );

  return (
    <Kartica data-pragovi="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={nivo}>
        <form noValidate onSubmit={sacuvaj} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {polje("prag", pragId, t.prag, t.pragPomoc, pragTekst, setPragTekst, LATE_THRESHOLD_MIN, LATE_THRESHOLD_MAX)}
            {polje("podsetnik", podsetnikId, t.podsetnik, t.podsetnikPomoc, podsetnikTekst, setPodsetnikTekst, 0, REMINDER_MAX)}
          </div>

          {iskljuceno && razlog ? (
            <p id={razlogId} className="text-sm leading-relaxed text-[var(--mp-tekst)]">
              {razlog}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Dugme
              type="submit"
              vrsta="primarno"
              ucitava={faza === "cuva"}
              disabled={iskljuceno}
              aria-describedby={iskljuceno && razlog ? razlogId : undefined}
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
