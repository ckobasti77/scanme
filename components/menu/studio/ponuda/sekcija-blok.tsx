"use client";

// ScanMe Menu V1 — one section of the work area (K10): its name, the article
// rows and quick entry. A section with more than 60 articles starts collapsed
// (K01 §8 K09) so a large menu opens fast; the search opens what it finds.

import { ChevronDown, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { kljucCene } from "@/lib/menu/studio/autosave-queue";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { BrziUnosRezultat, StudioIshod, StudioRed, StudioSekcija } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { BrziUnosRed } from "../brzi-unos/brzi-unos-red";
import { MeniRadnji } from "../meni-radnji";
import { NazivPolje } from "../naziv-polje";
import { porukaGreske, RedArtikla, type RedRadnje } from "../red-artikla/red-artikla";

const t = menuStudioSr;

export function brojArtikalaTekst(n: number): string {
  return fmt(t.ponuda.artikli[srPluralCategory(n)], { n });
}

export function SekcijaBlok({
  sekcija,
  redovi,
  skupljena,
  onSkupi,
  nedostupni,
  red,
  mozeUredjivanje,
  redRadnje,
  brziUnosOtvoren,
  onBrziUnos,
  onDodaj,
  onDodajPostojeci,
  onPreimenuj,
  onObrisi,
}: {
  sekcija: StudioSekcija;
  /** The rows to show (all of them, or what the search found). */
  redovi: readonly StudioRed[];
  skupljena: boolean;
  onSkupi: (sekcijaId: string, skupljena: boolean) => void;
  nedostupni: ReadonlySet<string>;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  redRadnje: RedRadnje;
  brziUnosOtvoren: boolean;
  onBrziUnos: (sekcijaId: string | null) => void;
  onDodaj: (
    sekcijaId: string,
    unos: { naziv: string; cena: number | null },
    dozvoliDuplikat: boolean,
  ) => Promise<StudioIshod<BrziUnosRezultat>>;
  onDodajPostojeci: (sekcijaId: string, artikalId: string) => Promise<StudioIshod>;
  onPreimenuj: (sekcijaId: string, naziv: string, ocekivano: string) => Promise<StudioIshod>;
  onObrisi: (sekcija: StudioSekcija) => void;
}) {
  const telo = useId();
  const [preimenuje, setPreimenuje] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);

  return (
    <Kartica
      as="section"
      aria-labelledby={`${telo}-naslov`}
      data-sekcija={sekcija.key}
      className="p-0 sm:p-0 lg:p-0"
    >
      <header className="flex items-center gap-2 px-3 py-2 sm:px-4">
        {preimenuje ? (
          <NazivPolje
            className="flex-1 py-1"
            pocetno={sekcija.naziv}
            oznaka={t.sekcija.nazivOznaka}
            potvrda={t.sekcija.sacuvaj}
            otkazi={t.sekcija.otkazi}
            maks={MENU_TEXT.sectionName}
            greskaPrazno={t.opste.nazivObavezan}
            greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.sectionName })}
            onSacuvaj={async (naziv) => {
              setPreimenuje(false);
              const ishod = await onPreimenuj(sekcija.id, naziv, sekcija.naziv);
              setPoruka(
                ishod.ok
                  ? null
                  : ishod.vrsta === "konflikt"
                    ? fmt(t.opste.nazivKonflikt, { naziv: String(ishod.sacuvano ?? "") })
                    : (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano),
              );
            }}
            onOtkazi={() => setPreimenuje(false)}
          />
        ) : (
          <>
            <h2 id={`${telo}-naslov`} className="min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={!skupljena}
                aria-controls={telo}
                onClick={() => onSkupi(sekcija.id, !skupljena)}
                className="flex min-h-[var(--mp-meta)] w-full min-w-0 items-center gap-2 rounded-[var(--mp-radius-kontrola)] px-1 text-left [--button-radius:var(--mp-radius-kontrola)] hover:bg-[var(--mp-povrsina-utisana)]"
              >
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={2}
                  className={cn(
                    "size-5 shrink-0 text-[var(--mp-tekst-sporedni)] transition-transform duration-[var(--mp-trajanje-2)] motion-reduce:transition-none",
                    skupljena && "-rotate-90",
                  )}
                />
                <span className="min-w-0 text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">
                  {sekcija.naziv}
                </span>{" "}
                <span className="shrink-0 text-sm font-normal text-[var(--mp-tekst-sporedni)]">
                  {brojArtikalaTekst(sekcija.redovi.length)}
                </span>
              </button>
            </h2>
            {mozeUredjivanje ? (
              <MeniRadnji
                okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={fmt(t.sekcija.radnje, { naziv: sekcija.naziv })} />}
                stavke={[
                  { kljuc: "preimenuj", tekst: t.sekcija.preimenuj, ikonica: PencilLine, onIzbor: () => setPreimenuje(true) },
                  { kljuc: "obrisi", tekst: t.sekcija.obrisi, ikonica: Trash2, opasno: true, onIzbor: () => onObrisi(sekcija) },
                ]}
              />
            ) : null}
          </>
        )}
      </header>
      {poruka ? (
        <p role="alert" className="mx-3 mb-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-1.5 text-sm font-medium [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] sm:mx-4">
          {poruka}
        </p>
      ) : null}
      <div id={telo} hidden={skupljena} className="px-3 pb-3 sm:px-4">
        {/* A collapsed section renders no rows: a 400-article page stays light. */}
        {skupljena ? null : redovi.length > 0 ? (
          <ul className="border-t [--border:var(--mp-ivica)]">
            {redovi.map((stavka) => (
              <RedArtikla
                key={stavka.prikazId}
                red={stavka}
                nedostupan={nedostupni.has(stavka.artikal.key)}
                cenaStanje={red.stanje(kljucCene(stavka.artikal.id))}
                sacuvanoU={red.sacuvano(kljucCene(stavka.artikal.id))}
                mozeUredjivanje={mozeUredjivanje}
                radnje={redRadnje}
              />
            ))}
          </ul>
        ) : sekcija.redovi.length === 0 ? (
          <p className="border-t py-3 text-sm text-[var(--mp-tekst-sporedni)] [--border:var(--mp-ivica)]">
            {t.sekcija.praznaSekcija}
          </p>
        ) : null}
        {mozeUredjivanje && !skupljena ? (
          <BrziUnosRed
            sekcija={sekcija}
            otvoreno={brziUnosOtvoren}
            onemoguceno={false}
            onOtvori={() => onBrziUnos(sekcija.id)}
            onZatvori={() => onBrziUnos(null)}
            onDodaj={(unos, dozvoliDuplikat) => onDodaj(sekcija.id, unos, dozvoliDuplikat)}
            onDodajPostojeci={(artikalId) => onDodajPostojeci(sekcija.id, artikalId)}
          />
        ) : null}
      </div>
    </Kartica>
  );
}
