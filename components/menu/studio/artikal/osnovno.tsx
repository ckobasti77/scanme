"use client";

// ScanMe Menu V1 — the basic data of the article detail (K15; master §5.5,
// §13.4: "osnovni podaci prvi"): name, the shared base price, the section on
// this page, description, quantity and unit. Everything is saved into the
// draft by itself; the price is the same queue key as the row's inline price,
// so the list and the detail never disagree.

import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import { formatKolicina, proveriJedinicu, proveriKolicinu, proveriNaziv, proveriOpis } from "@/lib/menu/studio/article-form";
import { kljucCene, type AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioDetaljArtikla, StudioIshod, StudioRadnje, StudioSekcija } from "@/lib/menu/studio/model";
import type { CenaGreska } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";
import { CenaPolje } from "../red-artikla/cena-polje";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";
import { OZNAKA_KLASA, POLJE_KLASA, ProblemKljuca, TekstPolje } from "./polja";

const t = menuStudioSr.artikal;

export function OsnovnoArtikla({
  detalj,
  red,
  radnje,
  mozeUredjivanje,
  sekcije,
  izvor,
  nazivStranice,
}: {
  detalj: StudioDetaljArtikla;
  red: AutosaveRed;
  radnje: Pick<StudioRadnje, "izmeniPolje" | "postaviCenu" | "premestiPrikaz">;
  mozeUredjivanje: boolean;
  /** The sections of the open page ("Sekcija"). */
  sekcije: readonly Pick<StudioSekcija, "id" | "naziv">[];
  /** The row the detail was opened from: its section on this page. */
  izvor: { prikazId: string; sekcijaId: string } | null;
  nazivStranice: string;
}) {
  const { artikal } = detalj;
  const sekcijaId = useId();
  const cenaId = useId();
  const [greskaCene, setGreskaCene] = useState<CenaGreska | null>(null);
  const [premestanje, setPremestanje] = useState<{ radi: boolean; poruka: string | null }>({ radi: false, poruka: null });
  const kljuc = (polje: string) => `${polje}:${artikal.id}`;
  const posalji = (polje: "name" | "description" | "quantityValue" | "quantityUnit") => (ocekivano: unknown, vrednost: unknown) =>
    radnje.izmeniPolje(artikal.id, polje, ocekivano as never, vrednost as never);
  const cenaKljuc = kljucCene(artikal.id);
  const cenaStanje = red.stanje(cenaKljuc);
  const cena = cenaStanje && typeof cenaStanje.vrednost === "number" ? cenaStanje.vrednost : cenaStanje ? null : artikal.cena;

  const promeniSekciju = async (cilj: string) => {
    if (!izvor || cilj === izvor.sekcijaId) return;
    setPremestanje({ radi: true, poruka: null });
    const ishod: StudioIshod = await radnje.premestiPrikaz(izvor.prikazId, cilj, null);
    setPremestanje({
      radi: false,
      poruka: ishod.ok ? null : ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.nijeSacuvano) : t.nijeSacuvano,
    });
  };

  return (
    <section aria-labelledby={`${sekcijaId}-naslov`} className="grid gap-5 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)] sm:p-5">
      <h2 id={`${sekcijaId}-naslov`} className="text-base font-semibold">
        {t.osnovno.naslov}
      </h2>
      <TekstPolje
        oznaka={t.osnovno.naziv}
        vrednost={artikal.naziv}
        kljuc={kljuc("naziv")}
        red={red}
        posalji={posalji("name")}
        proveri={proveriNaziv}
        maks={MENU_TEXT.articleName}
        obavezno
        onemoguceno={!mozeUredjivanje}
      />

      <div className="grid gap-1.5">
        <span id={`${cenaId}-oznaka`} aria-hidden="true" className={OZNAKA_KLASA}>
          {t.osnovno.cena}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)]">
            <CenaPolje
              id={cenaId}
              naziv={artikal.naziv}
              vrednost={cena}
              stanje={cenaStanje}
              sacuvanoU={red.sacuvano(cenaKljuc)}
              onemoguceno={!mozeUredjivanje}
              opisId={`${cenaId}-opis`}
              onPotvrdi={(nova, ocekivano) =>
                red.zakazi(cenaKljuc, {
                  ocekivano,
                  vrednost: nova,
                  posalji: (o, v) => radnje.postaviCenu(artikal.id, o as number | null, v as number | null),
                })
              }
              onGreska={setGreskaCene}
            />
          </span>
          <p id={`${cenaId}-opis`} className="min-w-0 basis-full text-sm leading-snug text-[var(--mp-tekst-sporedni)] sm:basis-0 sm:flex-1">
            {detalj.ukljuceno.varijante ? t.osnovno.cenaVarijante : t.osnovno.cenaZajednicka}
          </p>
        </div>
        {greskaCene ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {menuStudioSr.cena.greske[greskaCene]}
          </p>
        ) : (
          <ProblemKljuca red={red} kljuc={cenaKljuc} prikaz={tekstCene} />
        )}
      </div>

      {izvor && sekcije.length > 0 ? (
        <div className="grid gap-1.5">
          <label htmlFor={sekcijaId} className={OZNAKA_KLASA}>
            {t.osnovno.sekcija}
          </label>
          <select
            id={sekcijaId}
            value={izvor.sekcijaId}
            disabled={!mozeUredjivanje || premestanje.radi}
            aria-describedby={`${sekcijaId}-opis`}
            onChange={(event) => void promeniSekciju(event.target.value)}
            className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pr-8")}
          >
            {sekcije.map((sekcija) => (
              <option key={sekcija.id} value={sekcija.id}>
                {sekcija.naziv}
              </option>
            ))}
          </select>
          <p id={`${sekcijaId}-opis`} className="text-sm text-[var(--mp-tekst-sporedni)]">
            {fmt(t.osnovno.sekcijaOpis, { stranica: nazivStranice })}
          </p>
          {premestanje.poruka ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {premestanje.poruka}
            </p>
          ) : null}
        </div>
      ) : null}

      <TekstPolje
        oznaka={t.osnovno.opis}
        vrednost={artikal.opis}
        kljuc={kljuc("opis")}
        red={red}
        posalji={posalji("description")}
        proveri={proveriOpis}
        maks={MENU_TEXT.articleDescription}
        primer={t.osnovno.opisPrimer}
        visina="vise"
        onemoguceno={!mozeUredjivanje}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:max-w-[26rem]">
        <TekstPolje
          oznaka={t.osnovno.kolicina}
          vrednost={artikal.kolicina}
          kljuc={kljuc("kolicina")}
          red={red}
          posalji={posalji("quantityValue")}
          proveri={proveriKolicinu}
          prikazi={formatKolicina}
          primer={t.osnovno.kolicinaPrimer}
          inputMode="decimal"
          onemoguceno={!mozeUredjivanje}
        />
        <TekstPolje
          oznaka={t.osnovno.jedinica}
          vrednost={artikal.jedinica}
          kljuc={kljuc("jedinica")}
          red={red}
          posalji={posalji("quantityUnit")}
          proveri={proveriJedinicu}
          maks={MENU_TEXT.quantityUnit}
          primer={t.osnovno.jedinicaPrimer}
          onemoguceno={!mozeUredjivanje}
        />
      </div>
    </section>
  );
}
