"use client";

// ScanMe Menu V1 (K30) — the period of the Analitika section. Standard: the
// last 7 and 30 days; 90 days and "Drugi period" stay visible, locked, with the
// reason under the choice. Premium: also 90 days and a period of its own (two
// dates, at most 366 days, inside the 24 months of daily data; the error says
// what to fix). Choosing "Drugi period" shows the last 30 days at once and the
// two dates to change them; "Prikaži" applies them.

import { useId, useState } from "react";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { najstarijiDanAgregata, poslednjihDana } from "@/lib/menu/analitika/period";
import { izborDozvoljen, proveriIzbor, type AnalitikaPlan, type IzborPerioda } from "@/lib/menu/analitika/prikaz";
import { POLJE_KLASA, Polje } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Segment } from "./segment";

const t = menuAnalitikaSr.period;

type Vrsta = IzborPerioda["vrsta"];
const VRSTE: readonly Vrsta[] = ["d7", "d30", "d90", "izbor"];

export function PeriodIzbor({
  plan,
  danas,
  izbor,
  onIzbor,
}: {
  plan: AnalitikaPlan;
  danas: string;
  izbor: IzborPerioda;
  onIzbor: (izbor: IzborPerioda) => void;
}) {
  const id = useId();
  const razlogId = `${id}-zakljucano`;
  const pocetni = izbor.vrsta === "izbor" ? { od: izbor.od, do: izbor.do } : poslednjihDana(danas, 30);
  const [nacrt, setNacrt] = useState(pocetni);
  const nacrtIzbor: IzborPerioda = { vrsta: "izbor", ...nacrt };
  const greska = izbor.vrsta === "izbor" ? proveriIzbor(nacrtIzbor, danas, plan) : null;
  const zakljucano = plan !== "premium";

  return (
    <div data-period-izbor="" className="grid gap-3">
      <Segment<Vrsta>
        oznaka={t.oznaka}
        opcije={VRSTE.map((vrsta) => ({ vrednost: vrsta, tekst: t.izbori[vrsta], zakljucano: !izborDozvoljen(vrsta, plan) }))}
        izabrano={izbor.vrsta}
        razlogId={zakljucano ? razlogId : undefined}
        onIzbor={(vrsta) => onIzbor(vrsta === "izbor" ? nacrtIzbor : { vrsta })}
        className="max-w-xl"
      />
      {zakljucano ? (
        <p id={razlogId} className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
          {t.zakljucano}
        </p>
      ) : null}
      {izbor.vrsta === "izbor" && !zakljucano ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!greska) onIzbor(nacrtIzbor);
          }}
        >
          <Polje id={`${id}-od`} oznaka={t.od} className="w-44">
            {(aria) => (
              <input
                {...aria}
                type="date"
                value={nacrt.od}
                min={najstarijiDanAgregata(danas)}
                max={danas}
                onChange={(event) => setNacrt((stari) => ({ ...stari, od: event.target.value }))}
                aria-invalid={greska ? true : undefined}
                aria-describedby={greska ? `${id}-greska` : undefined}
                className={POLJE_KLASA}
              />
            )}
          </Polje>
          <Polje id={`${id}-do`} oznaka={t.do} className="w-44">
            {(aria) => (
              <input
                {...aria}
                type="date"
                value={nacrt.do}
                min={najstarijiDanAgregata(danas)}
                max={danas}
                onChange={(event) => setNacrt((stari) => ({ ...stari, do: event.target.value }))}
                aria-invalid={greska ? true : undefined}
                aria-describedby={greska ? `${id}-greska` : undefined}
                className={POLJE_KLASA}
              />
            )}
          </Polje>
          <Dugme type="submit" vrsta="sekundarno" disabled={greska !== null}>
            {t.primeni}
          </Dugme>
          {greska && greska !== "premium" ? (
            <p id={`${id}-greska`} role="alert" className="basis-full text-sm font-medium text-[var(--mp-opasnost)]">
              {t.greske[greska]}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
