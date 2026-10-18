"use client";

// ScanMe Menu V1 — one article in Room service (K16; master §5.3, mockup 05).
// Read left to right: the article, its base price, the Room service price a
// guest in a room pays (editable: a typed price becomes the manual price; an
// emptied field goes back to the rule) and where that price comes from. When
// the base price changed under a manual price, the row says so and offers the
// decision. The article itself (name, description, image) stays shared.

import { ArrowDown, ArrowRight, ArrowUp, FolderInput, MoreHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { markupPercentToBps, ruleUnitPriceRsd } from "@/lib/menu/room-service-pricing";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioRsRed, StudioRsUpozorenje } from "@/lib/menu/studio/model";
import type { CenaGreska } from "@/lib/menu/studio/price-input";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { MeniRadnji, type StavkaMenija } from "../meni-radnji";
import { CenaPolje } from "../red-artikla/cena-polje";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";
import { formatProcenat, RsPoreklo } from "./rs-poreklo";

/** "420 RSD" that never breaks between the number and the currency. */
const cena = (vrednost: number | null) => tekstCene(vrednost).replace(" ", " ");

const t = menuStudioSr;
const rs = t.posebno.roomService;

/** The save-queue key of a manual Room service price. */
export const kljucRsCene = (stavkaId: string) => `rs-cena:${stavkaId}`;

export type RsRedRadnje = {
  onRucna: (stavkaId: string, ocekivana: number | null, nova: number | null) => void;
  onUvecanje: (stavkaId: string, primeni: boolean) => void;
  onPremesti: (stavkaId: string, uKategoriju: string, preStavke: string | null) => void;
  onUkloni: (stavkaId: string) => void;
  onUpozorenje: (upozorenje: StudioRsUpozorenje) => void;
};

export function RsRed({
  stavka,
  uvecanje,
  izabraniObuhvat,
  kategorijaId,
  pre,
  posle,
  druge,
  red,
  mozeUredjivanje,
  radnje,
}: {
  stavka: StudioRsRed;
  /** The rule's markup in percent (null = none). */
  uvecanje: number | null;
  /** The markup reaches only the selected articles: the row shows its own switch. */
  izabraniObuhvat: boolean;
  kategorijaId: string;
  /** The neighbours in this category (for "Pomeri gore/dole"): the item before, and the one after the next. */
  pre: { id: string; preNjega: string | null } | null;
  posle: { posleNjega: string | null } | null;
  /** The other categories ("Premesti u: …"). */
  druge: readonly { id: string; naziv: string }[];
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  radnje: RsRedRadnje;
}) {
  const [lokalnaGreska, setLokalnaGreska] = useState<CenaGreska | null>(null);
  const kljuc = kljucRsCene(stavka.stavkaId);
  const stanje = red.stanje(kljuc);
  const naCekanju = stanje ? (typeof stanje.vrednost === "number" ? stanje.vrednost : null) : undefined;
  const prikaz = naCekanju !== undefined ? (naCekanju ?? stavka.cena) : (stavka.rucna ?? stavka.cena);
  // What the rule alone gives (what clearing a manual price brings back).
  const bps = uvecanje === null ? 0 : (markupPercentToBps(uvecanje) ?? 0);
  const poPravilu = ruleUnitPriceRsd({ markupBps: bps, markupScope: izabraniObuhvat ? "selected" : "all" }, stavka.osnovna, stavka.uvecanje);
  const poreklo = naCekanju === undefined ? stavka.poreklo : naCekanju === null ? stavka.poreklo : "manual";
  const poljeId = `rs-cena-${stavka.stavkaId}`;
  const porukaId = `${poljeId}-poruka`;

  const stavke: StavkaMenija[] = [
    ...(pre ? [{ kljuc: "gore", tekst: rs.red.gore, ikonica: ArrowUp, onIzbor: () => radnje.onPremesti(stavka.stavkaId, kategorijaId, pre.id) }] : []),
    ...(posle ? [{ kljuc: "dole", tekst: rs.red.dole, ikonica: ArrowDown, onIzbor: () => radnje.onPremesti(stavka.stavkaId, kategorijaId, posle.posleNjega) }] : []),
    ...druge.map((kategorija) => ({
      kljuc: `u-${kategorija.id}`,
      tekst: fmt(rs.red.uKategoriju, { naziv: kategorija.naziv }),
      ikonica: FolderInput,
      onIzbor: () => radnje.onPremesti(stavka.stavkaId, kategorija.id, null),
    })),
    { kljuc: "ukloni", tekst: rs.red.ukloni, opis: rs.red.ukloniOpis, ikonica: Trash2, opasno: true, onIzbor: () => radnje.onUkloni(stavka.stavkaId) },
  ];

  let poruka: ReactNode = null;
  if (lokalnaGreska) {
    poruka = <p>{t.cena.greske[lokalnaGreska]}</p>;
  } else if (stanje?.faza === "greska") {
    const tekst = stanje.ponovljivo ? null : porukaGreske(stanje.kod);
    poruka = (
      <>
        <p>
          {t.red.nijeSacuvano}
          {tekst ? ` ${tekst}` : null}
        </p>
        <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => red.pokusajPonovo(kljuc)}>
          {t.red.pokusajPonovo}
        </Dugme>
      </>
    );
  } else if (stanje?.faza === "konflikt") {
    poruka = (
      <>
        <p>{fmt(t.red.konflikt, { sacuvano: tekstCene(stanje.sacuvano) })}</p>
        <span className="flex flex-wrap gap-2">
          <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={() => red.zadrziMoju(kljuc)}>
            {fmt(t.red.zadrziMoju, { moja: tekstCene(stanje.pokusano) })}
          </Dugme>
          <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => red.odbaci(kljuc)}>
            {t.red.uzmiSacuvanu}
          </Dugme>
        </span>
      </>
    );
  }

  return (
    <li className="grid gap-2 border-t py-3 first:border-t-0 [--border:var(--mp-ivica)]" data-rs-red={stavka.stavkaId}>
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="font-medium leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{stavka.naziv}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-sm tabular-nums text-[var(--mp-tekst-sporedni)]" data-rs-osnovna="">
              {rs.red.osnovna} {tekstCene(stavka.osnovna)}
            </span>
            <ArrowRight aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
            <span className="text-sm font-medium text-[var(--mp-tekst)]">{rs.red.rs}</span>
            <CenaPolje
              id={poljeId}
              naziv={stavka.naziv}
              oznaka={fmt(rs.red.rsCenaOznaka, { naziv: stavka.naziv })}
              okvir
              vrednost={prikaz}
              stanje={stanje}
              sacuvanoU={red.sacuvano(kljuc)}
              onemoguceno={!mozeUredjivanje}
              opisId={porukaId}
              onPotvrdi={(nova) => radnje.onRucna(stavka.stavkaId, stavka.rucna, nova)}
              onGreska={setLokalnaGreska}
            />
            <RsPoreklo poreklo={poreklo} uvecanje={poreklo === "computed" ? uvecanje : null} />
          </div>
          {poreklo === "manual" && mozeUredjivanje && naCekanju === undefined ? (
            <Dugme
              vrsta="tiho"
              velicina="kompaktna"
              className="-ml-3 justify-self-start whitespace-normal py-2 text-left leading-snug"
              onClick={() => radnje.onRucna(stavka.stavkaId, stavka.rucna, null)}
              data-rs-vrati=""
            >
              {fmt(rs.red.vratiNaPravilo, { cena: cena(poPravilu) })}
            </Dugme>
          ) : null}
          {izabraniObuhvat && uvecanje !== null ? (
            <PoljePotvrde
              naziv={fmt(rs.red.uvecanje, { p: formatProcenat(uvecanje) })}
              opis={poreklo === "manual" ? rs.red.uvecanjeRucna : undefined}
              aria-label={fmt(rs.red.uvecanjeOznaka, { naziv: stavka.naziv })}
              checked={stavka.uvecanje}
              disabled={!mozeUredjivanje}
              onChange={(event) => radnje.onUvecanje(stavka.stavkaId, event.target.checked)}
            />
          ) : null}
          {stavka.varijante.length > 0 ? (
            <ul className="grid gap-1 border-l-2 pl-3 text-sm [--border:var(--mp-ivica)]" aria-label={rs.red.varijante}>
              {stavka.varijante.map((varijanta) => (
                <li key={varijanta.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[var(--mp-tekst)]">{varijanta.naziv}</span>
                  <span className="font-medium tabular-nums">{tekstCene(varijanta.cena)}</span>
                  <RsPoreklo poreklo={varijanta.poreklo} uvecanje={varijanta.poreklo === "computed" ? uvecanje : null} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {mozeUredjivanje ? (
          <MeniRadnji
            okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={fmt(rs.red.radnje, { naziv: stavka.naziv })} className="-mr-1 shrink-0" />}
            stavke={stavke}
          />
        ) : null}
      </div>
      {stavka.upozorenje ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]"
        >
          <p className="flex min-w-0 items-start gap-2">
            <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-upozorenje)]" />
            <span>
              {fmt(rs.red.upozorenje, {
                stara: cena(stavka.upozorenje.staraOsnovna),
                nova: cena(stavka.upozorenje.novaOsnovna),
                rs: cena(stavka.upozorenje.rsCena),
              })}
            </span>
          </p>
          {mozeUredjivanje ? (
            <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={() => stavka.upozorenje && radnje.onUpozorenje(stavka.upozorenje)}>
              {rs.red.odluci}
            </Dugme>
          ) : null}
        </div>
      ) : null}
      {poruka ? (
        <div
          id={porukaId}
          role="alert"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] px-3 py-1.5 text-sm font-medium text-[var(--mp-tekst)]"
        >
          {poruka}
        </div>
      ) : (
        <p id={porukaId} className="sr-only">
          {rs.red.rucnaPomoc}
        </p>
      )}
    </li>
  );
}
