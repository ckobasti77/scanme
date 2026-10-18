"use client";

// ScanMe Menu V1 — the controls of the article detail (K15): a text field on
// the save queue, a collapsible group and a segmented radio choice. Every
// field saves into the draft by itself (master §6.1): text 800 ms after the
// last key and on leaving the field, a choice at once; a value saved by
// someone else meanwhile is never overwritten silently (K10 queue, master
// §6.1). Panel tokens only (MENU-UX §2, §4).
// K18: a conflict uses the shared pattern (konflikt/konflikt-polja.tsx) and
// names the other people who have this article open.

import { ChevronDown, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { CasValue } from "@/lib/menu/cas";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { PoljeGreska, PoljeProvera } from "@/lib/menu/studio/article-form";
import { opisKonflikta } from "@/lib/menu/studio/conflict";
import type { StudioIshod } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { KonfliktPolja } from "../konflikt/konflikt-polja";
import { useDrugiNaArtiklu } from "../prisustvo/kontekst";
import { porukaGreske } from "../red-artikla/red-artikla";

const t = menuStudioSr.artikal;

export const POLJE_KLASA =
  "w-full min-w-0 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)] disabled:cursor-not-allowed disabled:opacity-60";

export const OZNAKA_KLASA = "text-sm font-semibold text-[var(--mp-tekst)]";

/** "Čuva se…", "Sačuvano" or nothing, for one queued key. Polite live region. */
export function StanjeKljuca({ red, kljuc }: { red: AutosaveRed; kljuc: string }) {
  const stanje = red.stanje(kljuc);
  const sacuvanoU = red.sacuvano(kljuc);
  const [ugaseno, setUgaseno] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (sacuvanoU === undefined) return;
    const handle = setTimeout(() => setUgaseno(sacuvanoU), 1500);
    return () => clearTimeout(handle);
  }, [sacuvanoU]);
  const cuvaSe = stanje?.faza === "ceka" || stanje?.faza === "salje";
  const sacuvano = !stanje && sacuvanoU !== undefined && ugaseno !== sacuvanoU;
  return (
    <span role="status" className="inline-flex min-h-5 items-center gap-1 text-xs font-medium text-[var(--mp-tekst-sporedni)]">
      {cuvaSe ? (
        <>
          <LoaderCircle aria-hidden="true" strokeWidth={2} className="size-3.5 animate-spin motion-reduce:animate-none" />
          {t.cuvaSe}
        </>
      ) : sacuvano ? (
        <>
          <CircleCheck aria-hidden="true" strokeWidth={2} className="size-3.5 text-[var(--mp-uspeh)]" />
          {t.sacuvano}
        </>
      ) : null}
    </span>
  );
}

/** The problem of one queued key (failure or conflict), with its way out. */
export function ProblemKljuca({
  red,
  kljuc,
  id,
  prikaz = (vrednost) => (vrednost === null || vrednost === "" ? t.bezVrednosti : String(vrednost)),
}: {
  red: AutosaveRed;
  kljuc: string;
  id?: string;
  prikaz?: (vrednost: CasValue) => string;
}) {
  const stanje = red.stanje(kljuc);
  const drugi = useDrugiNaArtiklu();
  if (stanje?.faza !== "greska" && stanje?.faza !== "konflikt") return null;
  if (stanje.faza === "konflikt") {
    return (
      <KonfliktPolja
        id={id}
        opis={opisKonflikta(stanje, prikaz, drugi)}
        tekst={fmt(t.konflikt, { sacuvano: prikaz(stanje.sacuvano) })}
        zadrziMoju={t.zadrziMoje}
        uzmiSacuvanu={t.uzmiSacuvano}
        onZadrziMoju={() => red.zadrziMoju(kljuc)}
        onUzmiSacuvanu={() => red.odbaci(kljuc)}
        prikaziMoju
      />
    );
  }
  return (
    <div
      id={id}
      role="alert"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] px-3 py-1.5 text-sm font-medium text-[var(--mp-tekst)]"
    >
      <p>
        {t.nijeSacuvano}
        {stanje.ponovljivo ? null : ` ${porukaGreske(stanje.kod) ?? ""}`}
      </p>
      <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => red.pokusajPonovo(kljuc)}>
        {t.pokusajPonovo}
      </Dugme>
    </div>
  );
}

const PORUKE_POLJA: Record<PoljeGreska, (maks: number) => string> = {
  obavezno: () => t.osnovno.greske.obavezno,
  predugo: (maks) => fmt(t.osnovno.greske.predugo, { n: maks }),
  neispravno: () => t.osnovno.greske.neispravno,
};

/**
 * A text field of the shared article on the save queue. Shows the server value
 * while untouched, the person's text while typing; checks the text locally
 * (`proveri`) and sends the checked value with the value seen on focus.
 */
export function TekstPolje<T extends CasValue>({
  oznaka,
  vrednost,
  kljuc,
  red,
  posalji,
  proveri,
  prikazi = (v) => (v === null ? "" : String(v)),
  maks,
  primer,
  pomoc,
  visina = "red",
  inputMode,
  onemoguceno,
  sirina,
}: {
  oznaka: string;
  vrednost: T;
  kljuc: string;
  red: AutosaveRed;
  posalji: (ocekivano: CasValue, vrednost: CasValue) => Promise<StudioIshod<unknown>>;
  proveri: (tekst: string) => PoljeProvera<T>;
  prikazi?: (vrednost: T) => string;
  /** Characters; shows the counter and names the limit in the error. */
  maks?: number;
  primer?: string;
  pomoc?: ReactNode;
  visina?: "red" | "vise";
  inputMode?: "numeric" | "decimal" | "text";
  onemoguceno: boolean;
  sirina?: string;
}) {
  const id = useId();
  const stanje = red.stanje(kljuc);
  const [tekst, setTekst] = useState<string | null>(null);
  const [ocekivano, setOcekivano] = useState<CasValue>(vrednost);
  const [greska, setGreska] = useState<PoljeGreska | null>(null);
  const naCekanju = stanje ? prikazi(stanje.vrednost as T) : null;
  const prikaz = tekst ?? naCekanju ?? prikazi(vrednost);
  const opisIds = [pomoc ? `${id}-pomoc` : null, greska || stanje?.faza === "greska" || stanje?.faza === "konflikt" ? `${id}-problem` : null]
    .filter(Boolean)
    .join(" ");

  const zakazi = (sadrzaj: string, odlozi: number) => {
    const provera = proveri(sadrzaj);
    if (!provera.ok) {
      setGreska(provera.greska);
      // An earlier valid text waiting for its turn must not be saved over what is on screen now.
      if (red.stanje(kljuc)?.faza === "ceka") red.odbaci(kljuc);
      return false;
    }
    setGreska(null);
    red.zakazi(kljuc, { ocekivano, vrednost: provera.vrednost, posalji, odlozi });
    return true;
  };

  const zajednicko = {
    id,
    value: prikaz,
    disabled: onemoguceno,
    placeholder: primer,
    autoComplete: "off",
    "aria-invalid": greska ? true : undefined,
    "aria-describedby": opisIds || undefined,
    onFocus: () => {
      setOcekivano(stanje ? stanje.vrednost : vrednost);
      setTekst(prikaz);
    },
    onBlur: () => {
      if (tekst !== null && zakazi(tekst, 0)) red.isprazni(kljuc);
      setTekst(null);
    },
  };

  return (
    <div className={cn("grid content-start gap-1.5", sirina)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={OZNAKA_KLASA}>
          {oznaka}
        </label>
        <span className="flex items-baseline gap-2">
          <StanjeKljuca red={red} kljuc={kljuc} />
          {maks !== undefined && tekst !== null ? (
            <span aria-hidden="true" className="text-xs tabular-nums text-[var(--mp-tekst-sporedni)]">
              {fmt(t.znakova, { n: tekst.length, max: maks })}
            </span>
          ) : null}
        </span>
      </div>
      {visina === "vise" ? (
        <textarea
          {...zajednicko}
          rows={3}
          onChange={(event) => {
            setTekst(event.target.value);
            zakazi(event.target.value, 800);
          }}
          className={cn(POLJE_KLASA, "min-h-24 resize-y py-2.5 leading-relaxed")}
        />
      ) : (
        <input
          {...zajednicko}
          type="text"
          inputMode={inputMode}
          enterKeyHint="done"
          onChange={(event) => {
            setTekst(event.target.value);
            zakazi(event.target.value, 800);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (zakazi(event.currentTarget.value, 0)) red.isprazni(kljuc);
            } else if (event.key === "Escape") {
              event.preventDefault();
              red.odbaci(kljuc);
              setGreska(null);
              setTekst(prikazi(vrednost));
            }
          }}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
        />
      )}
      {pomoc ? (
        <p id={`${id}-pomoc`} className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
          {pomoc}
        </p>
      ) : null}
      {greska ? (
        <p id={`${id}-problem`} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {PORUKE_POLJA[greska](maks ?? 0)}
        </p>
      ) : (
        <ProblemKljuca red={red} kljuc={kljuc} id={`${id}-problem`} />
      )}
    </div>
  );
}

/**
 * A group of the detail that opens on demand (master §13.4: advanced groups
 * collapsed). The header button says the group's name and a short summary,
 * so a closed group still tells what is in it. A closed group renders
 * nothing inside.
 */
export function SklopivaGrupa({
  naslov,
  sazetak,
  otvoreno,
  onOtvoreno,
  oznaka,
  children,
  id: idSpolja,
}: {
  naslov: string;
  sazetak: string;
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  /** e.g. a Premium mark beside the name. */
  oznaka?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  const generisano = useId();
  const id = idSpolja ?? generisano;
  // Once opened, the content stays mounted while closed (hidden): a form typed into is not lost
  // by a tap on the header. A group never opened renders nothing inside.
  const [montirano, setMontirano] = useState(otvoreno);
  return (
    <section
      aria-labelledby={`${id}-naslov`}
      data-grupa-detalja={id}
      data-otvoreno={otvoreno ? "" : undefined}
      className="rounded-[var(--mp-radius-kartica)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] shadow-[var(--mp-senka-xs)]"
    >
      <h2 id={`${id}-naslov`} className="text-base font-semibold">
        <button
          type="button"
          aria-expanded={otvoreno}
          aria-controls={`${id}-telo`}
          onClick={() => {
            if (!otvoreno) setMontirano(true);
            onOtvoreno(!otvoreno);
          }}
          className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-[var(--mp-radius-kartica)] px-4 py-3 text-left [--button-radius:var(--mp-radius-kartica)] hover:bg-[var(--mp-povrsina-utisana)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] sm:px-5"
        >
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn("size-5 shrink-0 transition-transform duration-[var(--mp-trajanje-2)] motion-reduce:transition-none", !otvoreno && "-rotate-90")}
          />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{naslov}</span>
              {oznaka}
            </span>
            <span data-sazetak="" className="text-sm font-medium text-[var(--mp-tekst-sporedni)] [overflow-wrap:anywhere] sm:max-w-[55%] sm:text-right">
              {sazetak}
            </span>
          </span>
        </button>
      </h2>
      <div id={`${id}-telo`} hidden={!otvoreno} className="border-t px-4 pb-5 pt-4 [--border:var(--mp-ivica)] sm:px-5">
        {otvoreno || montirano ? children : null}
      </div>
    </section>
  );
}

/** A choice of a few values as radio buttons that look segmented (one tab stop, arrows move). */
export function IzborSegment<T extends string>({
  oznaka,
  vrednosti,
  izabrano,
  onIzbor,
  onemoguceno,
  skrivenaOznaka = false,
}: {
  oznaka: string;
  vrednosti: readonly { vrednost: T; tekst: string; onemoguceno?: boolean }[];
  izabrano: T;
  onIzbor: (vrednost: T) => void;
  onemoguceno?: boolean;
  skrivenaOznaka?: boolean;
}) {
  const ime = useId();
  return (
    <fieldset className="grid min-w-0 gap-1.5" disabled={onemoguceno}>
      <legend className={cn(OZNAKA_KLASA, "mb-1.5", skrivenaOznaka && "sr-only")}>{oznaka}</legend>
      <div className="flex min-w-0 flex-wrap gap-1 rounded-[var(--mp-radius-dugme)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)] p-[3px]">
        {vrednosti.map((stavka) => {
          const aktivno = stavka.vrednost === izabrano;
          return (
            <label
              key={stavka.vrednost}
              className={cn(
                "relative inline-flex min-h-[var(--mp-meta)] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[var(--mp-radius-dugme)] px-3 py-1.5 text-center text-sm font-semibold leading-tight",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55",
                aktivno ? "bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]" : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina)]",
              )}
            >
              <input
                type="radio"
                name={ime}
                value={stavka.vrednost}
                checked={aktivno}
                disabled={stavka.onemoguceno}
                onChange={() => onIzbor(stavka.vrednost)}
                className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
              />
              {stavka.tekst}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
