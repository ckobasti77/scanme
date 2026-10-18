"use client";

// ScanMe Menu V1 — one section of the work area (K10, K11): its name, the
// article rows and quick entry. A section with more than 60 articles starts
// collapsed (K01 §8 K09) so a large menu opens fast; the search opens what it
// finds. K11: the header drags the section (a click on the title still opens
// and closes it), the handle and the section menu open `Premesti`; a collapsed
// section takes a dragged article on its header (to its end). While any
// section is dragged, every section shows collapsed. In `Izaberi više` the
// header has a three-state checkbox for all of its rows.

import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, ChevronDown, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { kljucCene } from "@/lib/menu/studio/autosave-queue";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { BrziUnosRezultat, StudioIshod, StudioRed, StudioSekcija } from "@/lib/menu/studio/model";
import { stanjeSekcije } from "@/lib/menu/studio/selection";
import { cn } from "@/lib/utils";
import { IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { BrziUnosRed } from "../brzi-unos/brzi-unos-red";
import { sekcijaDndId } from "../dnd/ponuda-dnd";
import { IzborPolje } from "../izaberi-vise/izbor-polje";
import { MeniRadnji } from "../meni-radnji";
import { NazivPolje } from "../naziv-polje";
import { porukaGreske, RedArtikla, type RedRadnje } from "../red-artikla/red-artikla";
import tacke from "../red-artikla/tacke.module.css";
import { useSmanjenPokret } from "../dnd/use-smanjen-pokret";

const t = menuStudioSr;

export function brojArtikalaTekst(n: number): string {
  return fmt(t.ponuda.artikli[srPluralCategory(n)], { n });
}

const PRAZAN_IZBOR: ReadonlySet<string> = new Set();

export function SekcijaBlok({
  sekcija,
  redovi,
  skupljena,
  onSkupi,
  nedostupni,
  red,
  mozeUredjivanje,
  mozeDostupnost = false,
  redRadnje,
  brziUnosOtvoren,
  onBrziUnos,
  onDodaj,
  onDodajPostojeci,
  onPreimenuj,
  onObrisi,
  onPremesti,
  prevlacenje = false,
  sekcijaSePrevlaci = false,
  cilj = false,
  izborAktivan = false,
  izabrani = PRAZAN_IZBOR,
  onIzaberiSekciju,
}: {
  sekcija: StudioSekcija;
  /** The rows to show (all of them, or what the search found). */
  redovi: readonly StudioRed[];
  skupljena: boolean;
  onSkupi: (sekcijaId: string, skupljena: boolean) => void;
  nedostupni: ReadonlySet<string>;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  mozeDostupnost?: boolean;
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
  /** K11: `Premesti` for this section (handle and menu). */
  onPremesti?: (sekcija: StudioSekcija) => void;
  /** K11: the section and its rows may be dragged now. */
  prevlacenje?: boolean;
  /** K11: a section is being dragged (every section shows collapsed). */
  sekcijaSePrevlaci?: boolean;
  /** K11: the dragged article would land here (collapsed or empty section). */
  cilj?: boolean;
  izborAktivan?: boolean;
  izabrani?: ReadonlySet<string>;
  onIzaberiSekciju?: (prikazIds: readonly string[]) => void;
}) {
  const telo = useId();
  const smanjenPokret = useSmanjenPokret();
  const [preimenuje, setPreimenuje] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: sekcijaDndId(sekcija.id),
    data: { vrsta: "sekcija", sekcijaId: sekcija.id },
    disabled: !prevlacenje,
    transition: smanjenPokret ? null : { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
  const zatvoreno = skupljena || sekcijaSePrevlaci;
  const redIds = redovi.map((stavka) => stavka.prikazId);
  const izborSekcije = stanjeSekcije(redIds, izabrani);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <Kartica
        as="section"
        aria-labelledby={`${telo}-naslov`}
        data-sekcija={sekcija.key}
        data-cilj={cilj ? "" : undefined}
        className={cn(
          "p-0 sm:p-0 lg:p-0",
          cilj && "outline-2 outline-offset-2 outline-[var(--mp-fokus)]",
          isDragging && "bg-[var(--mp-akcent-meko)] outline-2 outline-dashed -outline-offset-2 outline-[var(--mp-fokus)] [&>*]:opacity-40",
        )}
      >
        <header
          {...(prevlacenje && !preimenuje ? listeners : {})}
          className={cn(
            "flex items-center gap-1 px-3 py-2 sm:gap-2 sm:px-4",
            prevlacenje && !preimenuje && "touch-manipulation select-none [-webkit-touch-callout:none]",
          )}
        >
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
              {izborAktivan && onIzaberiSekciju ? (
                <IzborPolje
                  oznaka={fmt(t.izaberiVise.izaberiSekciju, { naziv: sekcija.naziv })}
                  stanje={izborSekcije}
                  onemoguceno={redIds.length === 0}
                  onPromena={() => onIzaberiSekciju(redIds)}
                  className="-ml-1"
                />
              ) : prevlacenje && onPremesti ? (
                // Part of the header's free area (it drags); keyboard: `Premesti` in the section menu.
                <span
                  aria-hidden="true"
                  data-rucica-sekcije={sekcija.key}
                  title={fmt(t.dnd.rucicaSekcija, { naziv: sekcija.naziv })}
                  onClick={() => onPremesti(sekcija)}
                  className={cn(tacke.rucica, "-my-3.5 -ml-3 -mr-2 hidden shrink-0 cursor-grab text-[var(--mp-tekst-sporedni)] hover:text-[var(--mp-tekst)] sm:block")}
                />
              ) : null}
              <h2 id={`${telo}-naslov`} className="min-w-0 flex-1">
                <button
                  type="button"
                  // The title drags the section too; a click without movement opens and closes it.
                  data-drag-ok={prevlacenje ? "" : undefined}
                  aria-expanded={!zatvoreno}
                  aria-controls={telo}
                  onClick={() => onSkupi(sekcija.id, !skupljena)}
                  className="flex min-h-[var(--mp-meta)] w-full min-w-0 items-center gap-2 rounded-[var(--mp-radius-kontrola)] px-1 text-left [--button-radius:var(--mp-radius-kontrola)] hover:bg-[var(--mp-povrsina-utisana)]"
                >
                  <ChevronDown
                    aria-hidden="true"
                    strokeWidth={2}
                    className={cn(
                      "size-5 shrink-0 text-[var(--mp-tekst-sporedni)] transition-transform duration-[var(--mp-trajanje-2)] motion-reduce:transition-none",
                      zatvoreno && "-rotate-90",
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
              {mozeUredjivanje && !izborAktivan ? (
                <MeniRadnji
                  okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={fmt(t.sekcija.radnje, { naziv: sekcija.naziv })} />}
                  stavke={[
                    { kljuc: "preimenuj", tekst: t.sekcija.preimenuj, ikonica: PencilLine, onIzbor: () => setPreimenuje(true) },
                    ...(onPremesti
                      ? [{ kljuc: "premesti", tekst: t.stanjaArtikla.premesti, ikonica: ArrowRightLeft, onIzbor: () => onPremesti(sekcija) }]
                      : []),
                    { kljuc: "obrisi", tekst: t.sekcija.obrisi, ikonica: Trash2, opasno: true, onIzbor: () => onObrisi(sekcija) },
                  ]}
                />
              ) : null}
            </>
          )}
        </header>
        {cilj ? (
          <p className="mx-3 mb-2 rounded-[var(--mp-radius-kontrola)] border border-dashed px-3 py-2 text-sm font-medium [--border:var(--mp-fokus)] sm:mx-4">
            {t.dnd.spustiOvde}
          </p>
        ) : null}
        {poruka ? (
          <p role="alert" className="mx-3 mb-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-1.5 text-sm font-medium [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] sm:mx-4">
            {poruka}
          </p>
        ) : null}
        <div id={telo} hidden={zatvoreno} className="px-3 pb-3 sm:px-4">
          {/* A collapsed section renders no rows: a 400-article page stays light. */}
          {zatvoreno ? null : redovi.length > 0 ? (
            <SortableContext items={redIds} strategy={verticalListSortingStrategy}>
              <ul className="border-t [--border:var(--mp-ivica)]">
                {redovi.map((stavka) => (
                  <RedArtikla
                    key={stavka.prikazId}
                    red={stavka}
                    sekcijaId={sekcija.id}
                    nedostupan={nedostupni.has(stavka.artikal.key)}
                    cenaStanje={red.stanje(kljucCene(stavka.artikal.id))}
                    sacuvanoU={red.sacuvano(kljucCene(stavka.artikal.id))}
                    mozeUredjivanje={mozeUredjivanje}
                    mozeDostupnost={mozeDostupnost}
                    izborAktivan={izborAktivan}
                    izabran={izabrani.has(stavka.prikazId)}
                    prevlacenje={prevlacenje}
                    radnje={redRadnje}
                  />
                ))}
              </ul>
            </SortableContext>
          ) : sekcija.redovi.length === 0 ? (
            <p className="border-t py-3 text-sm text-[var(--mp-tekst-sporedni)] [--border:var(--mp-ivica)]">
              {t.sekcija.praznaSekcija}
            </p>
          ) : null}
          {mozeUredjivanje && !zatvoreno && !izborAktivan ? (
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
    </div>
  );
}
