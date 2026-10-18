"use client";

// ScanMe Menu V1 — one article row of the work area (K10). Name, a short
// description, the states that matter to the owner (never colour alone) and
// the inline shared price. A plain article stays `Naziv + Cena` (master §5.7).
// Memoized: a 400-article page re-renders only the rows whose data changed.

import { CircleSlash, EyeOff, Layers, Package, TriangleAlert } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StanjePolja } from "@/lib/menu/studio/autosave-queue";
import type { StudioRed } from "@/lib/menu/studio/model";
import { formatCenaPolje, type CenaGreska } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { CenaPolje } from "./cena-polje";

const t = menuStudioSr;

export type RedRadnje = {
  onCena: (artikalId: string, ocekivana: number | null, nova: number | null) => void;
  onPonovo: (artikalId: string) => void;
  onZadrziMoju: (artikalId: string) => void;
  onUzmiSacuvanu: (artikalId: string) => void;
};

export function tekstCene(cena: unknown): string {
  return typeof cena === "number" ? `${formatCenaPolje(cena)} ${t.red.rsd}` : t.red.bezVrednosti;
}

export function porukaGreske(kod: string): string | null {
  const greske = menuDomenSr.errors as Record<string, string>;
  return greske[kod] ?? null;
}

export const RedArtikla = memo(function RedArtikla({
  red,
  nedostupan,
  cenaStanje,
  sacuvanoU,
  mozeUredjivanje,
  radnje,
}: {
  red: StudioRed;
  nedostupan: boolean;
  cenaStanje: StanjePolja | undefined;
  sacuvanoU: number | undefined;
  mozeUredjivanje: boolean;
  radnje: RedRadnje;
}) {
  const { artikal } = red;
  const [lokalnaGreska, setLokalnaGreska] = useState<CenaGreska | null>(null);
  const poljeId = `cena-${red.prikazId}`;
  const porukaId = `${poljeId}-poruka`;
  const bezCene = artikal.cena === null && !artikal.varijante;

  let poruka: ReactNode = null;
  if (lokalnaGreska) {
    poruka = <p>{t.cena.greske[lokalnaGreska]}</p>;
  } else if (cenaStanje?.faza === "greska") {
    const tekst = cenaStanje.ponovljivo ? null : porukaGreske(cenaStanje.kod);
    poruka = (
      <>
        <p>
          {t.red.nijeSacuvano}
          {tekst ? ` ${tekst}` : null}
        </p>
        <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => radnje.onPonovo(artikal.id)}>
          {t.red.pokusajPonovo}
        </Dugme>
      </>
    );
  } else if (cenaStanje?.faza === "konflikt") {
    poruka = (
      <>
        <p>{fmt(t.red.konflikt, { sacuvano: tekstCene(cenaStanje.sacuvano) })}</p>
        <span className="flex flex-wrap gap-2">
          <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={() => radnje.onZadrziMoju(artikal.id)}>
            {fmt(t.red.zadrziMoju, { moja: tekstCene(cenaStanje.pokusano) })}
          </Dugme>
          <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => radnje.onUzmiSacuvanu(artikal.id)}>
            {t.red.uzmiSacuvanu}
          </Dugme>
        </span>
      </>
    );
  }

  return (
    <li
      data-red-artikla=""
      data-artikal={artikal.key}
      data-sakriven={red.sakriven ? "" : undefined}
      className="border-t [--border:var(--mp-ivica)] first:border-t-0"
    >
      <div className="flex min-h-14 items-center gap-3 py-2">
        <div className={cn("grid min-w-0 flex-1 gap-1", red.sakriven && "opacity-70")}>
          <p className="min-w-0 font-medium leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">
            {artikal.naziv}
          </p>
          {artikal.opis ? (
            <p className="line-clamp-1 text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{artikal.opis}</p>
          ) : null}
          {red.sakriven || nedostupan || artikal.varijante || artikal.vrsta === "combo" || artikal.proveriCenu || bezCene ? (
            <span className="flex flex-wrap gap-1.5 pt-0.5">
              {red.sakriven ? (
                <StatusOznaka ton="neutralno" ikonica={EyeOff} velicina="mala">
                  {t.red.sakriveno}
                </StatusOznaka>
              ) : null}
              {nedostupan ? (
                <StatusOznaka ton="upozorenje" ikonica={CircleSlash} velicina="mala">
                  {t.red.nedostupno}
                </StatusOznaka>
              ) : null}
              {artikal.vrsta === "combo" ? (
                <StatusOznaka ton="neutralno" ikonica={Package} velicina="mala">
                  {t.red.kombo}
                </StatusOznaka>
              ) : null}
              {artikal.varijante ? (
                <StatusOznaka ton="neutralno" ikonica={Layers} velicina="mala">
                  {t.red.varijante}
                </StatusOznaka>
              ) : null}
              {artikal.proveriCenu ? (
                <StatusOznaka ton="upozorenje" ikonica={TriangleAlert} velicina="mala">
                  {t.red.proveriCenu}
                </StatusOznaka>
              ) : null}
              {bezCene ? (
                <StatusOznaka ton="upozorenje" ikonica={TriangleAlert} velicina="mala">
                  {t.red.bezCene}
                </StatusOznaka>
              ) : null}
            </span>
          ) : null}
        </div>
        <CenaPolje
          id={poljeId}
          naziv={artikal.naziv}
          vrednost={artikal.cena}
          stanje={cenaStanje}
          sacuvanoU={sacuvanoU}
          onemoguceno={!mozeUredjivanje}
          opisId={porukaId}
          onPotvrdi={(nova, ocekivano) => radnje.onCena(artikal.id, ocekivano, nova)}
          onGreska={setLokalnaGreska}
        />
      </div>
      {poruka ? (
        <div
          id={porukaId}
          role="alert"
          className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] px-3 py-1.5 text-sm font-medium text-[var(--mp-tekst)]"
        >
          {poruka}
        </div>
      ) : null}
    </li>
  );
});
