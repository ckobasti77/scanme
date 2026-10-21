"use client";

// ScanMe Menu V1 (K25) — Podešavanja > Radno vreme (master §11.6, §13.9; plan
// docs/meni/planovi/K24.md K24-7, §2.6). Seven days, Monday first; each day is
// open or closed and has up to three intervals of two clock fields. An end at
// or before the start means "past midnight" and the day says so. The week is
// checked here with the same rules as the server (lib/menu/working-hours.ts)
// before it is sent. The hours are always kept here, whatever reservation
// system the venue uses. Presentational: the route (rezervacije-podesavanja-
// ruta.tsx) and the izlog pass `radnoVreme` and `onSacuvaj`.
//
// The fields start from `radnoVreme` and are not reset when it changes under
// them (a live subscription answers a save with the saved hours).

import { Copy, Moon, Plus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import {
  MENU_HOURS_MAX_INTERVALS,
  MINUTES_PER_DAY,
  WORKING_DAYS,
  hhmm,
  intervalFromInput,
  isValidWorkingHours,
  minutesFromHhmm,
  type WorkingHours,
  type WorkingInterval,
} from "@/lib/menu/working-hours";
import { cn } from "@/lib/utils";
import { Napomena, POLJE_KLASA, PorukaGreske } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { Prekidac } from "../../zajednicko/prekidac";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";

const t = menuPanelSr.radnoVreme;

/** The two clock fields of one interval, as typed (`HH:MM`, or "" when cleared). */
export type IntervalPolja = { pocetak: string; kraj: string };
export type DanPolja = { otvoreno: boolean; intervali: IntervalPolja[] };

/** What a new interval starts from when there is nothing to follow. */
const PODRAZUMEVANI_INTERVAL: IntervalPolja = { pocetak: "09:00", kraj: "17:00" };

/** The fields of a saved week (null or empty = seven closed days). */
export function poljaIz(radnoVreme: WorkingHours | null): DanPolja[] {
  return Array.from({ length: WORKING_DAYS }, (_, dan) => {
    const intervali = radnoVreme?.days[dan] ?? [];
    return {
      otvoreno: intervali.length > 0,
      intervali: intervali.map((interval) => ({ pocetak: hhmm(interval.start), kraj: hhmm(interval.end) })),
    };
  });
}

/** An added interval starts where the last one ends and lasts an hour. */
function sledeciInterval(prethodni: IntervalPolja | undefined): IntervalPolja {
  const razmak = prethodni ? intervalFromInput(prethodni.pocetak, prethodni.kraj) : null;
  return razmak ? { pocetak: hhmm(razmak.end), kraj: hhmm(razmak.end + 60) } : { ...PODRAZUMEVANI_INTERVAL };
}

/** Does this interval run past midnight (its end is at or before its start)? */
function poslePonoci(interval: IntervalPolja): boolean {
  const od = minutesFromHhmm(interval.pocetak);
  const doKraja = minutesFromHhmm(interval.kraj);
  return od !== null && doKraja !== null && doKraja <= od && intervalFromInput(interval.pocetak, interval.kraj) !== null;
}

export type GreskeDana = {
  /** Indexes of the intervals whose fields are not a valid interval. */
  neispravni: number[];
  /** A problem of the day as a whole. */
  dan: "previse" | "preklapanje" | null;
};

export type ProveraRadnogVremena =
  | { ok: true; radnoVreme: WorkingHours }
  | { ok: false; greske: GreskeDana[]; opsta: boolean };

/**
 * The week the fields describe, or what is wrong. Closed days are empty days;
 * the intervals of a day are put in order first, so typing the evening before
 * the morning is not an error.
 */
export function proveriRadnoVreme(dani: readonly DanPolja[]): ProveraRadnogVremena {
  const greske: GreskeDana[] = dani.map(() => ({ neispravni: [], dan: null }));
  const nedelja: WorkingInterval[][] = dani.map((dan, indeks) => {
    if (!dan.otvoreno) return [];
    if (dan.intervali.length > MENU_HOURS_MAX_INTERVALS) {
      greske[indeks].dan = "previse";
      return [];
    }
    const razmaci: WorkingInterval[] = [];
    dan.intervali.forEach((interval, redni) => {
      const razmak = intervalFromInput(interval.pocetak, interval.kraj);
      if (razmak) razmaci.push(razmak);
      else greske[indeks].neispravni.push(redni);
    });
    razmaci.sort((a, b) => a.start - b.start);
    if (razmaci.some((razmak, redni) => redni > 0 && razmak.start < razmaci[redni - 1].end)) {
      greske[indeks].dan = "preklapanje";
    }
    return razmaci;
  });
  // An interval past midnight must end before the next day's first one starts.
  nedelja.forEach((razmaci, indeks) => {
    const poslednji = razmaci[razmaci.length - 1];
    const sledeci = nedelja[(indeks + 1) % WORKING_DAYS][0];
    if (greske[indeks].dan === null && poslednji && sledeci && poslednji.end > MINUTES_PER_DAY && sledeci.start < poslednji.end - MINUTES_PER_DAY) {
      greske[indeks].dan = "preklapanje";
    }
  });
  const nadjena = greske.some((dan) => dan.neispravni.length > 0 || dan.dan !== null);
  if (nadjena) return { ok: false, greske, opsta: false };
  const radnoVreme: WorkingHours = { days: nedelja };
  // Everything above agrees with the server's rule; this is its own word as a last check.
  return isValidWorkingHours(radnoVreme) ? { ok: true, radnoVreme } : { ok: false, greske, opsta: true };
}

export type RadnoVremeSacuvaj = (radnoVreme: WorkingHours) => Promise<SacuvajIshod>;

export function RadnoVreme({
  radnoVreme,
  onSacuvaj,
  disabled = false,
  razlog,
  nivo = 2,
}: {
  /** The saved week; null when it was never entered. */
  radnoVreme: WorkingHours | null;
  onSacuvaj: RadnoVremeSacuvaj;
  /** The role cannot edit settings: every control is off. */
  disabled?: boolean;
  /** Why it is off; written on the screen when `disabled`. */
  razlog?: string;
  nivo?: 2 | 3;
}) {
  const id = useId();
  const razlogId = `${id}-razlog`;
  const [dani, setDani] = useState<DanPolja[]>(() => poljaIz(radnoVreme));
  const [greske, setGreske] = useState<GreskeDana[] | null>(null);
  const [opstaGreska, setOpstaGreska] = useState(false);
  const { faza, kod, pokreni, izmenjeno } = useCuvanje();

  const nijeUneto = !dani.some((dan) => dan.otvoreno);
  const poljeId = (dan: number, redni: number, polje: "od" | "do") => `${id}-${dan}-${redni}-${polje}`;
  const greskaIntervalaId = (dan: number, redni: number) => `${id}-${dan}-${redni}-greska`;
  const greskaDanaId = (dan: number) => `${id}-${dan}-greska`;

  const promeni = (novi: DanPolja[]) => {
    setDani(novi);
    setGreske(null);
    setOpstaGreska(false);
    izmenjeno();
  };
  const promeniDan = (dan: number, izmena: (stanje: DanPolja) => DanPolja) =>
    promeni(dani.map((stanje, indeks) => (indeks === dan ? izmena(stanje) : stanje)));
  const promeniInterval = (dan: number, redni: number, izmena: Partial<IntervalPolja>) =>
    promeniDan(dan, (stanje) => ({
      ...stanje,
      intervali: stanje.intervali.map((interval, indeks) => (indeks === redni ? { ...interval, ...izmena } : interval)),
    }));

  const otvori = (dan: number, otvoreno: boolean) =>
    promeniDan(dan, (stanje) => ({
      otvoreno,
      intervali: otvoreno && stanje.intervali.length === 0 ? [{ ...PODRAZUMEVANI_INTERVAL }] : stanje.intervali,
    }));
  const dodaj = (dan: number) =>
    promeniDan(dan, (stanje) => ({
      ...stanje,
      intervali: [...stanje.intervali, sledeciInterval(stanje.intervali[stanje.intervali.length - 1])],
    }));
  const ukloni = (dan: number, redni: number) =>
    promeniDan(dan, (stanje) => ({ ...stanje, intervali: stanje.intervali.filter((_, indeks) => indeks !== redni) }));
  /** Monday to Tuesday–Friday. */
  const kopiraj = () =>
    promeni(
      dani.map((stanje, indeks) =>
        indeks >= 1 && indeks <= 4
          ? { otvoreno: dani[0].otvoreno, intervali: dani[0].intervali.map((interval) => ({ ...interval })) }
          : stanje,
      ),
    );

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const provera = proveriRadnoVreme(dani);
    if (!provera.ok) {
      setGreske(provera.greske);
      setOpstaGreska(provera.opsta);
      const dan = provera.greske.findIndex((stanje) => stanje.neispravni.length > 0 || stanje.dan !== null);
      if (dan >= 0) {
        const redni = provera.greske[dan].neispravni[0] ?? 0;
        document.getElementById(poljeId(dan, redni, "od"))?.focus();
      }
      return;
    }
    setGreske(null);
    setOpstaGreska(false);
    const ishod = await pokreni(() => onSacuvaj(provera.radnoVreme));
    // Show the week as it was saved: in order, closed days without leftovers.
    if (ishod?.ok) setDani(poljaIz(provera.radnoVreme));
  };

  const globalnaGreska = opstaGreska ? t.greske.preklapanje : faza === "greska" && kod !== null ? porukaKoda(kod, t.greska) : null;
  // Wide enough for a 12-hour browser format ("12:00 PM" + the clock icon); a 24-hour one fits with room.
  const poljeKlasa = cn(POLJE_KLASA, "w-[8.75rem]");

  return (
    <Kartica data-radno-vreme="">
      <OkvirSekcije
        naslov={t.naslov}
        opis={t.opis}
        nivo={nivo}
        radnje={
          <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Copy} disabled={disabled} onClick={kopiraj}>
            {t.kopiraj}
          </Dugme>
        }
      >
        <form noValidate onSubmit={sacuvaj} className="grid gap-5">
          {nijeUneto ? <Napomena>{t.prazno}</Napomena> : null}

          <div className="grid">
            {menuDomenSr.weekdays.map((nazivDana, dan) => {
              const stanje = dani[dan];
              const greskeDana = greske?.[dan];
              const naMaksimumu = stanje.intervali.length >= MENU_HOURS_MAX_INTERVALS;
              const maksimumId = `${id}-${dan}-maksimum`;
              return (
                <fieldset
                  key={nazivDana}
                  disabled={disabled}
                  data-dan={dan}
                  className="grid min-w-0 gap-3 border-t py-4 [--border:var(--mp-ivica)] first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[8rem_10rem_minmax(0,1fr)] md:gap-x-6"
                >
                  <legend className="sr-only">{nazivDana}</legend>
                  <span aria-hidden="true" className="flex min-h-[var(--mp-meta)] items-center font-semibold text-[var(--mp-tekst)]">
                    {nazivDana}
                  </span>
                  <Prekidac
                    naziv={t.otvoreno}
                    checked={stanje.otvoreno}
                    onChange={(event) => otvori(dan, event.target.checked)}
                  />
                  {stanje.otvoreno ? (
                    <div className="grid min-w-0 content-start gap-3">
                      {stanje.intervali.map((interval, redni) => {
                        const neispravan = greskeDana?.neispravni.includes(redni) ?? false;
                        const opis = neispravan ? greskaIntervalaId(dan, redni) : greskeDana?.dan ? greskaDanaId(dan) : undefined;
                        const citac = fmt(t.intervalCitac, { dan: nazivDana, broj: redni + 1 });
                        return (
                          <div key={redni} data-interval="" className="grid gap-1.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <label className="flex items-center gap-2 text-sm font-medium text-[var(--mp-tekst)]">
                                <span>{t.od}</span>
                                <input
                                  id={poljeId(dan, redni, "od")}
                                  type="time"
                                  step={300}
                                  aria-label={`${citac}, ${t.od}`}
                                  aria-invalid={neispravan || undefined}
                                  aria-describedby={opis}
                                  value={interval.pocetak}
                                  onChange={(event) => promeniInterval(dan, redni, { pocetak: event.target.value })}
                                  className={poljeKlasa}
                                />
                              </label>
                              <label className="flex items-center gap-2 text-sm font-medium text-[var(--mp-tekst)]">
                                <span>{t.do}</span>
                                <input
                                  id={poljeId(dan, redni, "do")}
                                  type="time"
                                  step={300}
                                  aria-label={`${citac}, ${t.do}`}
                                  aria-invalid={neispravan || undefined}
                                  aria-describedby={opis}
                                  value={interval.kraj}
                                  onChange={(event) => promeniInterval(dan, redni, { kraj: event.target.value })}
                                  className={poljeKlasa}
                                />
                              </label>
                              {stanje.intervali.length > 1 ? (
                                <Dugme
                                  vrsta="tiho"
                                  velicina="kompaktna"
                                  ikonica={X}
                                  disabled={disabled}
                                  aria-label={fmt(t.ukloniCitac, { od: interval.pocetak, do: interval.kraj, dan: nazivDana })}
                                  onClick={() => ukloni(dan, redni)}
                                >
                                  {t.ukloni}
                                </Dugme>
                              ) : null}
                            </div>
                            {poslePonoci(interval) ? (
                              <p data-posle-ponoci="" className="flex items-center gap-1.5 text-sm text-[var(--mp-tekst-sporedni)]">
                                <Moon aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />
                                {fmt(t.poslePonoci, { vreme: interval.kraj })}
                              </p>
                            ) : null}
                            {neispravan ? (
                              <p id={greskaIntervalaId(dan, redni)} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
                                {t.greske.neispravno}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                      {greskeDana?.dan ? (
                        <p id={greskaDanaId(dan)} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
                          {t.greske[greskeDana.dan]}
                        </p>
                      ) : null}
                      <div className="grid justify-items-start gap-1.5">
                        <Dugme
                          vrsta="tiho"
                          velicina="kompaktna"
                          ikonica={Plus}
                          disabled={disabled || naMaksimumu}
                          aria-describedby={naMaksimumu ? maksimumId : undefined}
                          onClick={() => dodaj(dan)}
                        >
                          {t.dodaj}
                        </Dugme>
                        {naMaksimumu ? (
                          <p id={maksimumId} className="text-sm text-[var(--mp-tekst-sporedni)]">
                            {t.greske.previse}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="flex min-h-[var(--mp-meta)] items-center text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
                      {t.zatvoreno}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>

          {disabled && razlog ? (
            <p id={razlogId} className="text-sm leading-relaxed text-[var(--mp-tekst)]">
              {razlog}
            </p>
          ) : null}

          <div className="grid gap-3">
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
            {globalnaGreska ? <PorukaGreske>{globalnaGreska}</PorukaGreske> : null}
          </div>
        </form>
      </OkvirSekcije>
    </Kartica>
  );
}
