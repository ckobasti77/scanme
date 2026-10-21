"use client";

// ScanMe Menu V1 — one article row of the work area (K10, K11). Name, a short
// description, the states that matter to the owner (never colour alone) and
// the inline shared price. A plain article stays `Naziv + Cena` (master §5.7).
// K11: the whole free area of the card drags (mouse, or a long press on
// touch); the price field, the buttons and the row menu never do. The dotted
// handle is part of that free area (a mouse click on it opens `Premesti`);
// the keyboard way is `Premesti` in the row menu, so a row has two tab stops
// (price, menu). The row menu holds the states of the article: `Privremeno nedostupno` (live at
// once), `Sakrij` and `Ukloni sa ove stranice` (draft), `Obriši artikal` (after
// its consequences are shown). In `Izaberi više` the row gets a checkbox and a
// click on the card toggles it; dragging is off.
// K15: a click (or a short tap) on the free area of the card opens the
// article detail in the same work area; a press that moved, a long press
// (that picked the card up) and a click on a control never do. The keyboard
// way is "Uredi artikal", the first item of the row menu.
// Memoized in two layers: the sortable shell (`RedArtikla`, re-rendered by
// dnd-kit on every drag event) and the content (`TeloReda`), which renders
// again only when its own data changes — so a drop on a 400-article page
// does not redraw 400 rows.
// K18: someone else editing the article shows as "Marko Ilić uređuje" on the
// row, and a price conflict uses the shared conflict pattern (both values,
// who else has the article open, `Zadrži moju` / `Uzmi sačuvanu`).

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRightLeft,
  PencilLine,
  CircleCheck,
  CircleSlash,
  Eye,
  EyeOff,
  Layers,
  Package,
  Trash2,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { memo, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StanjePolja } from "@/lib/menu/studio/autosave-queue";
import { opisKonflikta } from "@/lib/menu/studio/conflict";
import { jeInteraktivnaMeta } from "@/lib/menu/studio/drag-guard";
import type { StudioRed } from "@/lib/menu/studio/model";
import { formatCenaPolje, type CenaGreska } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { IzborPolje } from "../izaberi-vise/izbor-polje";
import { KonfliktPolja } from "../konflikt/konflikt-polja";
import { MeniRadnji, type StavkaMenija } from "../meni-radnji";
import { PrisustvoOznaka } from "../prisustvo/prisustvo";
import { CenaPolje } from "./cena-polje";
import tacke from "./tacke.module.css";
import { useSmanjenPokret } from "../dnd/use-smanjen-pokret";

const t = menuStudioSr;

export type RadnjaReda = "uredi" | "premesti" | "nedostupno" | "dostupno" | "sakrij" | "prikazi" | "ukloni" | "obrisi";

/** A press that moved this far, or was held this long, was a drag or a long press, not a click. */
const KLIK_POMERAJ_PX = 6;
const KLIK_TRAJANJE_MS = 300;

export type RedRadnje = {
  onCena: (artikalId: string, ocekivana: number | null, nova: number | null) => void;
  onPonovo: (artikalId: string) => void;
  onZadrziMoju: (artikalId: string) => void;
  onUzmiSacuvanu: (artikalId: string) => void;
  /** K11: the row menu and the handle. Without it the row has neither. */
  onRadnja?: (red: StudioRed, sekcijaId: string, radnja: RadnjaReda) => void;
  /** K11: `Izaberi više` toggles a row. */
  onIzaberi?: (prikazId: string) => void;
};

export function tekstCene(cena: unknown): string {
  return typeof cena === "number" ? `${formatCenaPolje(cena)} ${t.red.rsd}` : t.red.bezVrednosti;
}

export function porukaGreske(kod: string): string | null {
  const greske = menuDomenSr.errors as Record<string, string>;
  return greske[kod] ?? null;
}

/** The row menu: what this person may do with this article on this page. */
export function stavkeReda(
  red: StudioRed,
  { nedostupan, mozeUredjivanje, mozeDostupnost }: { nedostupan: boolean; mozeUredjivanje: boolean; mozeDostupnost: boolean },
  izaberi: (radnja: RadnjaReda) => void,
): StavkaMenija[] {
  const s = t.stanjaArtikla;
  const stavke: StavkaMenija[] = [];
  // Live first, in its own group; the draft actions after it, the destructive one last.
  if (mozeDostupnost) {
    stavke.push(
      nedostupan
        ? { kljuc: "dostupno", tekst: s.dostupno, opis: s.odmah, ikonica: CircleCheck, grupa: s.grupaUzivo, onIzbor: () => izaberi("dostupno") }
        : { kljuc: "nedostupno", tekst: s.nedostupno, opis: s.odmah, ikonica: CircleSlash, grupa: s.grupaUzivo, onIzbor: () => izaberi("nedostupno") },
    );
  }
  if (mozeUredjivanje) {
    stavke.push(
      { kljuc: "premesti", tekst: s.premesti, opis: s.premestiOpis, ikonica: ArrowRightLeft, grupa: s.grupaNacrt, onIzbor: () => izaberi("premesti") },
      red.sakriven
        ? { kljuc: "prikazi", tekst: s.prikazi, ikonica: Eye, grupa: s.grupaNacrt, onIzbor: () => izaberi("prikazi") }
        : { kljuc: "sakrij", tekst: s.sakrij, ikonica: EyeOff, grupa: s.grupaNacrt, onIzbor: () => izaberi("sakrij") },
      { kljuc: "ukloni", tekst: s.ukloni, opis: s.ukloniOpis, ikonica: Unlink, grupa: s.grupaNacrt, onIzbor: () => izaberi("ukloni") },
      { kljuc: "obrisi", tekst: s.obrisi, opis: s.obrisiOpis, ikonica: Trash2, opasno: true, grupa: s.grupaNacrt, onIzbor: () => izaberi("obrisi") },
    );
  }
  return stavke;
}

type RedProps = {
  red: StudioRed;
  /** The section the row is in (drag data and the row actions). */
  sekcijaId?: string;
  nedostupan: boolean;
  cenaStanje: StanjePolja | undefined;
  sacuvanoU: number | undefined;
  mozeUredjivanje: boolean;
  /** menu.availability: live "Privremeno nedostupno", also when editing is off. */
  mozeDostupnost?: boolean;
  /** K11: `Izaberi više` is on. */
  izborAktivan?: boolean;
  izabran?: boolean;
  /** K11: this row may be dragged now (not while searching, selecting or read-only). */
  prevlacenje?: boolean;
  /** K18: other people who have this article open now (presence); the same array while unchanged. */
  uredjuju?: readonly string[];
  radnje: RedRadnje;
};

export const RedArtikla = memo(function RedArtikla(props: RedProps) {
  const { red, sekcijaId = "", izborAktivan = false, izabran = false, prevlacenje = false, radnje } = props;
  const smanjenPokret = useSmanjenPokret();
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: red.prikazId,
    data: { vrsta: "red", prikazId: red.prikazId, sekcijaId },
    disabled: !prevlacenje,
    transition: smanjenPokret ? null : { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
  const pritisak = useRef<{ x: number; y: number; u: number } | null>(null);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(prevlacenje ? listeners : {})}
      onPointerDown={(event) => {
        pritisak.current = { x: event.clientX, y: event.clientY, u: event.timeStamp };
      }}
      onClick={(event) => {
        const meta = event.target as Element;
        if (izborAktivan) {
          if (radnje.onIzaberi && !jeInteraktivnaMeta(meta)) radnje.onIzaberi(red.prikazId);
          return;
        }
        // K15: the free area opens the detail; the handle (Premesti) and the controls do not.
        if (!radnje.onRadnja || jeInteraktivnaMeta(meta) || meta.closest?.("[data-rucica]")) return;
        const pocetak = pritisak.current;
        if (
          pocetak &&
          (Math.hypot(event.clientX - pocetak.x, event.clientY - pocetak.y) > KLIK_POMERAJ_PX || event.timeStamp - pocetak.u > KLIK_TRAJANJE_MS)
        ) {
          return;
        }
        radnje.onRadnja(red, sekcijaId, "uredi");
      }}
      data-red-artikla=""
      data-artikal={red.artikal.key}
      data-sakriven={red.sakriven ? "" : undefined}
      data-izabran={izabran ? "" : undefined}
      data-podignut={isDragging ? "" : undefined}
      className={cn(
        "relative border-t [--border:var(--mp-ivica)] first:border-t-0",
        // K33: below 1024 px the global theme button (fixed bottom right, 44 px) must not cover a
        // control the keyboard scrolled to the bottom edge: the menu button, the price field and
        // the buttons of the row stop 6 rem above it (the free space at the bottom of the panel).
        "max-lg:[&_button]:scroll-mb-24 max-lg:[&_input]:scroll-mb-24",
        prevlacenje &&"cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] [&_input]:select-text",
        izborAktivan && "cursor-pointer",
        izabran && "bg-[var(--mp-akcent-meko)]",
        isDragging && "z-10",
      )}
    >
      <TeloReda {...props} podignut={isDragging} />
    </li>
  );
});

const TeloReda = memo(function TeloReda({
  red,
  sekcijaId = "",
  nedostupan,
  cenaStanje,
  sacuvanoU,
  mozeUredjivanje,
  mozeDostupnost = false,
  izborAktivan = false,
  izabran = false,
  prevlacenje = false,
  uredjuju,
  radnje,
  podignut,
}: RedProps & { podignut: boolean }) {
  const { artikal } = red;
  const [lokalnaGreska, setLokalnaGreska] = useState<CenaGreska | null>(null);
  const poljeId = `cena-${red.prikazId}`;
  const porukaId = `${poljeId}-poruka`;
  const bezCene = artikal.cena === null && !artikal.varijante;
  const radnja = radnje.onRadnja;
  const stanja = radnja
    ? stavkeReda(red, { nedostupan, mozeUredjivanje, mozeDostupnost }, (izbor) => radnja(red, sekcijaId, izbor))
    : [];
  // K15: the detail first — the keyboard way to what a click on the card opens.
  const stavke: StavkaMenija[] =
    radnja && stanja.length > 0
      ? [
          {
            kljuc: "uredi",
            tekst: mozeUredjivanje ? t.artikal.urediStavka : t.artikal.otvoriStavka,
            opis: mozeUredjivanje ? t.artikal.urediStavkaOpis : undefined,
            ikonica: PencilLine,
            onIzbor: () => radnja(red, sekcijaId, "uredi"),
          },
          ...stanja,
        ]
      : [];
  const rucica = Boolean(radnja) && prevlacenje;

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
  }
  const konflikt =
    !lokalnaGreska && cenaStanje?.faza === "konflikt" ? (
      <KonfliktPolja
        id={porukaId}
        opis={opisKonflikta(cenaStanje, tekstCene, uredjuju)}
        tekst={fmt(t.red.konflikt, { sacuvano: tekstCene(cenaStanje.sacuvano) })}
        zadrziMoju={fmt(t.red.zadrziMoju, { moja: tekstCene(cenaStanje.pokusano) })}
        uzmiSacuvanu={fmt(t.objavljivanje.konflikt.uzmiSacuvanu, { vrednost: tekstCene(cenaStanje.sacuvano) })}
        onZadrziMoju={() => radnje.onZadrziMoju(artikal.id)}
        onUzmiSacuvanu={() => radnje.onUzmiSacuvanu(artikal.id)}
        className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] px-3 py-1.5 text-sm font-medium text-[var(--mp-tekst)]"
      />
    ) : null;

  return (
    <>
      <div
        className={cn(
          "flex min-h-14 items-center gap-2 py-2 sm:gap-3",
          // Where it will land: a dashed outline in the focus colour, the content faded (K09 §4.3).
          podignut &&
            "rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-akcent-meko)] outline-2 outline-dashed -outline-offset-2 outline-[var(--mp-fokus)] [&>*]:opacity-40",
        )}
      >
        {izborAktivan && radnje.onIzaberi ? (
          <IzborPolje
            oznaka={fmt(t.izaberiVise.izaberi, { naziv: artikal.naziv })}
            stanje={izabran ? "sve" : "nista"}
            onPromena={() => radnje.onIzaberi?.(red.prikazId)}
            className="-my-1 -ml-1"
          />
        ) : rucica ? (
          // Part of the free area (it drags). A mouse click opens `Premesti`; keyboard: the row menu.
          <span
            aria-hidden="true"
            data-rucica={red.prikazId}
            title={fmt(t.dnd.rucica, { naziv: artikal.naziv })}
            onClick={() => radnja?.(red, sekcijaId, "premesti")}
            className={cn(tacke.rucica, "-my-3.5 -ml-4 hidden shrink-0 cursor-grab text-[var(--mp-tekst-sporedni)] hover:text-[var(--mp-tekst)] sm:block")}
          />
        ) : null}
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="min-w-0 font-medium leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">
            {artikal.naziv}
          </p>
          {artikal.opis ? (
            <p className="line-clamp-1 text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{artikal.opis}</p>
          ) : null}
          {red.sakriven || nedostupan || artikal.varijante || artikal.vrsta === "combo" || artikal.proveriCenu || bezCene || (uredjuju?.length ?? 0) > 0 ? (
            <span className="flex flex-wrap gap-1.5 pt-0.5">
              {uredjuju ? <PrisustvoOznaka imena={uredjuju} /> : null}
              {red.sakriven ? (
                <>
                  <StatusOznaka ton="neutralno" ikonica={EyeOff} velicina="mala">
                    {t.red.sakriveno}
                  </StatusOznaka>
                  <span className="self-center text-xs text-[var(--mp-tekst-sporedni)]">{t.stanjaArtikla.oznakaNacrt}</span>
                </>
              ) : null}
              {nedostupan ? (
                <>
                  <StatusOznaka ton="upozorenje" ikonica={CircleSlash} velicina="mala">
                    {t.red.nedostupno}
                  </StatusOznaka>
                  <span className="self-center text-xs text-[var(--mp-tekst-sporedni)]">{t.stanjaArtikla.oznakaUzivo}</span>
                </>
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
          onemoguceno={!mozeUredjivanje || izborAktivan}
          opisId={porukaId}
          onPotvrdi={(nova, ocekivano) => radnje.onCena(artikal.id, ocekivano, nova)}
          onGreska={setLokalnaGreska}
        />
        {stavke.length > 0 && !izborAktivan ? (
          <MeniRadnji
            okidac={
              <button
                type="button"
                aria-label={fmt(t.stanjaArtikla.radnje, { naziv: artikal.naziv })}
                title={fmt(t.stanjaArtikla.radnje, { naziv: artikal.naziv })}
                data-meni-reda={red.prikazId}
                className="-mr-1 grid size-[var(--mp-meta)] shrink-0 place-items-center rounded-full text-[var(--mp-tekst)] [--button-radius:999px] hover:bg-[var(--mp-povrsina-utisana)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] data-[state=open]:bg-[var(--mp-povrsina-utisana)]"
              >
                <span aria-hidden="true" className={tacke.tacke} />
              </button>
            }
            stavke={stavke}
          />
        ) : null}
      </div>
      {konflikt}
      {poruka ? (
        <div
          id={porukaId}
          role="alert"
          className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] px-3 py-1.5 text-sm font-medium text-[var(--mp-tekst)]"
        >
          {poruka}
        </div>
      ) : null}
    </>
  );
});
