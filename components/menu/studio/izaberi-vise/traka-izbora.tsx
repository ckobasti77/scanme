"use client";

// ScanMe Menu V1 — the bar of `Izaberi više` (K11; master §13.4, K09 §4.5).
// It exists only while the mode is on, so the default view stays light. It
// pins to the bottom of the work column (thumb reach on a phone; the right end
// keeps room for the app-wide theme button) and says how many articles are
// selected. Every action works on the selection in one call; the bar says
// that nothing is published by itself and that availability is live. Below
// 640 px the actions sit in one "Radnje" menu (each item still says whether
// it is live or a draft), so the bar does not cover half of the phone screen.

import { ArrowRightLeft, ChevronDown, ChevronUp, CircleCheck, CircleSlash, Eye, EyeOff, FilePlus2, LayoutList, Percent, Trash2, Unlink } from "lucide-react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { prekoGranice, STUDIO_MAX_IZBOR } from "@/lib/menu/studio/selection";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { TrakaRadnji } from "../../zajednicko/traka-radnji";
import { MeniRadnji, type StavkaMenija } from "../meni-radnji";

const t = menuStudioSr;

export type RadnjaIzbora =
  | "cene"
  | "nedostupno"
  | "dostupno"
  | "premesti"
  | "dodaj"
  | "ukloni"
  | "sakrij"
  | "prikazi"
  | "obrisi";

export function izabranoTekst(broj: number): string {
  return fmt(t.izaberiVise.izabrano[srPluralCategory(broj)], { n: broj });
}

export function TrakaIzbora({
  broj,
  mozeUredjivanje,
  mozeDostupnost,
  radi,
  onRadnja,
  onZavrsi,
}: {
  /** Selected rows. */
  broj: number;
  mozeUredjivanje: boolean;
  mozeDostupnost: boolean;
  radi: boolean;
  onRadnja: (radnja: RadnjaIzbora) => void;
  onZavrsi: () => void;
}) {
  const preko = prekoGranice(broj);
  const onemoguceno = broj === 0 || preko || radi;
  const s = t.stanjaArtikla;
  const uzivo = s.grupaUzivo;
  const nacrt = s.grupaNacrt;
  const sve: StavkaMenija[] = [
    ...(mozeDostupnost
      ? [
          { kljuc: "nedostupno", tekst: s.nedostupno, opis: s.odmah, ikonica: CircleSlash, grupa: uzivo, onIzbor: () => onRadnja("nedostupno") },
          { kljuc: "dostupno", tekst: s.dostupno, opis: s.odmah, ikonica: CircleCheck, grupa: uzivo, onIzbor: () => onRadnja("dostupno") },
        ]
      : []),
    ...(mozeUredjivanje
      ? [
          { kljuc: "cene", tekst: t.izaberiVise.promeniCene, ikonica: Percent, grupa: nacrt, onIzbor: () => onRadnja("cene") },
          { kljuc: "premesti", tekst: t.izaberiVise.premestiUSekciju, ikonica: ArrowRightLeft, grupa: nacrt, onIzbor: () => onRadnja("premesti") },
          { kljuc: "dodaj", tekst: t.izaberiVise.dodajNaStranicu, ikonica: FilePlus2, grupa: nacrt, onIzbor: () => onRadnja("dodaj") },
          { kljuc: "ukloni", tekst: t.izaberiVise.ukloniSaStranice, opis: s.ukloniOpis, ikonica: Unlink, grupa: nacrt, onIzbor: () => onRadnja("ukloni") },
          { kljuc: "sakrij", tekst: s.sakrij, ikonica: EyeOff, grupa: nacrt, onIzbor: () => onRadnja("sakrij") },
          { kljuc: "prikazi", tekst: s.prikazi, ikonica: Eye, grupa: nacrt, onIzbor: () => onRadnja("prikazi") },
          { kljuc: "obrisi", tekst: t.izaberiVise.obrisi, opis: s.obrisiOpis, ikonica: Trash2, opasno: true, grupa: nacrt, onIzbor: () => onRadnja("obrisi") },
        ]
      : []),
  ];
  const strelica = <ChevronDown aria-hidden="true" strokeWidth={1.75} className="-mr-1" />;
  return (
    <div
      data-traka-izbora=""
      className="sticky bottom-0 z-20 -mx-1 grid gap-2 rounded-t-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-3 pr-[4.25rem] shadow-[0_-8px_24px_rgb(0_0_0/0.08)] [--border:var(--mp-ivica)] sm:mx-0 lg:bottom-3 lg:rounded-[var(--mp-radius-kartica)] xl:pr-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p role="status" aria-live="polite" className="text-[0.9375rem] font-semibold" data-izabrano={broj}>
          {broj === 0 ? t.izaberiVise.nista : izabranoTekst(broj)}
        </p>
        <p className={cn("text-sm", preko ? "font-medium text-[var(--mp-opasnost)]" : "hidden text-[var(--mp-tekst-sporedni)] sm:block")}>
          {preko ? fmt(t.izaberiVise.granica, { n: STUDIO_MAX_IZBOR }) : t.izaberiVise.napomena}
        </p>
      </div>
      <div role="group" aria-label={t.izaberiVise.traka} className="flex items-center gap-2 sm:hidden" data-traka-izbora-telefon="">
        {onemoguceno ? (
          <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={ChevronUp} disabled>
            {t.izaberiVise.radnje}
          </Dugme>
        ) : (
          <MeniRadnji
            poravnanje="start"
            okidac={
              <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={ChevronUp} data-izbor-radnja="sve">
                {t.izaberiVise.radnje}
              </Dugme>
            }
            stavke={sve}
          />
        )}
        <Dugme vrsta="primarno" velicina="kompaktna" onClick={onZavrsi} className="ml-auto">
          {t.izaberiVise.zavrsi}
        </Dugme>
      </div>
      <TrakaRadnji oznaka={t.izaberiVise.traka} poravnanje="pocetak" className="hidden sm:flex">
        {mozeUredjivanje ? (
          <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Percent} disabled={onemoguceno} onClick={() => onRadnja("cene")} data-izbor-radnja="cene">
            {t.izaberiVise.promeniCene}
          </Dugme>
        ) : null}
        {mozeDostupnost ? (
          onemoguceno ? (
            <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={CircleSlash} disabled>
              {t.izaberiVise.dostupnost}
            </Dugme>
          ) : (
            <MeniRadnji
              poravnanje="start"
              okidac={
                <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={CircleSlash} data-izbor-radnja="dostupnost">
                  {t.izaberiVise.dostupnost}
                  {strelica}
                </Dugme>
              }
              stavke={[
                { kljuc: "nedostupno", tekst: s.nedostupno, opis: s.odmah, ikonica: CircleSlash, grupa: uzivo, onIzbor: () => onRadnja("nedostupno") },
                { kljuc: "dostupno", tekst: s.dostupno, opis: s.odmah, ikonica: CircleCheck, grupa: uzivo, onIzbor: () => onRadnja("dostupno") },
              ]}
            />
          )
        ) : null}
        {mozeUredjivanje ? (
          <>
            {onemoguceno ? (
              <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={LayoutList} disabled>
                {t.izaberiVise.raspored}
              </Dugme>
            ) : (
              <MeniRadnji
                poravnanje="start"
                okidac={
                  <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={LayoutList} data-izbor-radnja="raspored">
                    {t.izaberiVise.raspored}
                    {strelica}
                  </Dugme>
                }
                stavke={[
                  { kljuc: "premesti", tekst: t.izaberiVise.premestiUSekciju, ikonica: ArrowRightLeft, grupa: nacrt, onIzbor: () => onRadnja("premesti") },
                  { kljuc: "dodaj", tekst: t.izaberiVise.dodajNaStranicu, ikonica: FilePlus2, grupa: nacrt, onIzbor: () => onRadnja("dodaj") },
                  { kljuc: "ukloni", tekst: t.izaberiVise.ukloniSaStranice, opis: s.ukloniOpis, ikonica: Unlink, grupa: nacrt, onIzbor: () => onRadnja("ukloni") },
                ]}
              />
            )}
            {onemoguceno ? (
              <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={EyeOff} disabled>
                {t.izaberiVise.vidljivost}
              </Dugme>
            ) : (
              <MeniRadnji
                poravnanje="start"
                okidac={
                  <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={EyeOff} data-izbor-radnja="vidljivost">
                    {t.izaberiVise.vidljivost}
                    {strelica}
                  </Dugme>
                }
                stavke={[
                  { kljuc: "sakrij", tekst: s.sakrij, ikonica: EyeOff, grupa: nacrt, onIzbor: () => onRadnja("sakrij") },
                  { kljuc: "prikazi", tekst: s.prikazi, ikonica: Eye, grupa: nacrt, onIzbor: () => onRadnja("prikazi") },
                ]}
              />
            )}
            <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Trash2} disabled={onemoguceno} onClick={() => onRadnja("obrisi")} className="text-[var(--mp-opasnost)]" data-izbor-radnja="obrisi">
              {t.izaberiVise.obrisi}
            </Dugme>
          </>
        ) : null}
        <Dugme vrsta="primarno" velicina="kompaktna" onClick={onZavrsi} className="ml-auto" data-izbor-zavrsi="">
          {t.izaberiVise.zavrsi}
        </Dugme>
      </TrakaRadnji>
    </div>
  );
}
