"use client";

// ScanMe Menu V1 (K16) — the translations view of the editor (master §7.7):
// every text a guest reads on the open page (or in Room service), per
// enabled language, with missing and stale translations marked. Languages
// are managed in Settings; this view only fills the texts. The plan limit
// (Standard 2 languages) and the AI lock reason are said once, at the top.
// Typed translations go into the draft by themselves; an AI suggestion is
// only ever stored until the owner confirms it (see ai-predlog.tsx).
// Presentational: data and actions come in as props.

import { ArrowLeft, Info, Languages, Lock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioJezici, StudioPrevodStavka, StudioPrevodiPogled } from "@/lib/menu/studio/model";
import { brojeviPoJeziku, filtriraj, grupisi, kljucStavke, nazivJezika, statusStavke, trebaPaznju } from "@/lib/menu/studio/prevodi-pogled";
import type { MenuTranslationStatus } from "@/lib/menu/translation-status";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { STATUS_TONOVI, type StatusTon } from "../../zajednicko/status-oznaka";
import { IzborSegment } from "../artikal/polja";
import { Segmenti } from "../shell/segmenti";
import type { PrevodiRadnje } from "./ai-predlog";
import { PrevodStavka } from "./prevod-stavka";

const t = menuStudioSr.posebno.prevodi;

/** How many items are drawn at first and per "Prikaži još". */
const STRANICA = 60;

const REDOSLED_STATUSA: readonly MenuTranslationStatus[] = ["missing", "stale", "suggested", "done"];

type Filter = "treba" | "sve";

/** A short calm note with an icon; the tone comes from the shared status tones. */
function Napomena({ ton, ikonica, uloga, children }: { ton: StatusTon; ikonica?: LucideIcon; uloga?: "status"; children: ReactNode }) {
  const tonPrikaz = STATUS_TONOVI[ton];
  const Ikonica = ikonica ?? tonPrikaz.ikonica;
  return (
    <p
      role={uloga}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 text-sm leading-snug text-[var(--mp-tekst)]",
        tonPrikaz.povrsina,
      )}
    >
      <Ikonica aria-hidden="true" strokeWidth={2} className={cn("mt-0.5 size-4 shrink-0", tonPrikaz.ikonicaBoja)} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

/** The plan limit, the languages above it and the reason AI suggestions are off; shown once per view. */
export function NapomenaJezika({ jezici }: { jezici: StudioJezici }) {
  return (
    <div className="grid gap-2" data-napomena-jezika="">
      {jezici.max <= 2 ? (
        <Napomena ton="info">{t.limit.standard}</Napomena>
      ) : (
        <Napomena ton="neutralno" ikonica={Info}>
          {fmt(t.limit.premium, { n: jezici.max })}
        </Napomena>
      )}
      {jezici.vanLimita.length > 0 ? (
        <Napomena ton="upozorenje">{fmt(t.limit.vanLimita, { lista: jezici.vanLimita.map(nazivJezika).join(", ") })}</Napomena>
      ) : null}
      {!jezici.ai.dostupno && jezici.ai.razlog === "premium" ? (
        <Napomena ton="neutralno" ikonica={Lock}>
          {t.ai.premium}
        </Napomena>
      ) : null}
      {!jezici.ai.dostupno && jezici.ai.razlog === "kljuc" ? (
        <Napomena ton="neutralno" ikonica={Info}>
          {t.ai.kljuc}
        </Napomena>
      ) : null}
    </div>
  );
}

/** No translation language is on: the menu is Serbian only; languages are added in Settings. */
export function NemaJezika({ podesavanjaHref, nivo = 2 }: { podesavanjaHref?: string; nivo?: 2 | 3 }) {
  return (
    <PraznoStanje
      ikonica={Languages}
      nivo={nivo}
      className="py-6"
      naslov={t.nemaJezikaNaslov}
      opis={t.nemaJezikaOpis}
      akcija={
        podesavanjaHref ? (
          <Dugme asChild vrsta="sekundarno">
            <Link href={podesavanjaHref}>{t.podesavanja}</Link>
          </Dugme>
        ) : undefined
      }
    />
  );
}

/** The language switch: tabs when there are several translation languages, just the name for one. */
export function JezikTabovi({
  jezici,
  izabran,
  onIzbor,
  idPrefiks,
  kontrolise,
}: {
  jezici: readonly string[];
  izabran: string;
  onIzbor: (jezik: string) => void;
  idPrefiks: string;
  kontrolise: string;
}) {
  if (jezici.length <= 1) {
    return (
      <p className="text-sm text-[var(--mp-tekst-sporedni)]">
        {t.jezik}: <strong className="font-semibold capitalize text-[var(--mp-tekst)]">{nazivJezika(izabran)}</strong>
      </p>
    );
  }
  return (
    <Segmenti
      oznaka={t.jezik}
      vrednosti={jezici.map((kod) => ({ vrednost: kod, tekst: nazivJezika(kod) }))}
      izabrano={izabran}
      onIzbor={onIzbor}
      kontrolise={kontrolise}
      idPrefiks={idPrefiks}
      className="w-full flex-wrap capitalize sm:w-auto"
    />
  );
}

function naslovGrupe(grupa: StudioPrevodStavka["grupa"]): string {
  switch (grupa.vrsta) {
    case "sekcija":
      return grupa.naziv ?? "";
    case "stranica":
      return t.grupe.stranica;
    case "dodaci":
      return t.grupe.dodaci;
    case "room-service":
      return t.grupe.roomService;
  }
}

function Lista({
  stavke,
  jezik,
  ai,
  radnje,
  red,
  mozeUredjivanje,
  najavi,
}: {
  stavke: StudioPrevodStavka[];
  jezik: string;
  ai: StudioJezici["ai"];
  radnje: PrevodiRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
}) {
  const id = useId();
  const [prikazano, setPrikazano] = useState(STRANICA);
  const vidljive = stavke.slice(0, prikazano);
  const preostalo = stavke.length - vidljive.length;
  const naziv = nazivJezika(jezik);
  return (
    <div className="grid gap-5">
      {grupisi(vidljive).map((grupa, index) => {
        const naslov = naslovGrupe(grupa.grupa);
        const naslovId = `${id}-grupa-${index}`;
        return (
          <section key={index} aria-labelledby={naslov ? naslovId : undefined} className="grid gap-3">
            {naslov ? (
              <h2 id={naslovId} className="text-base font-semibold leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">
                {naslov}
              </h2>
            ) : null}
            <ul className="m-0 grid list-none gap-3 p-0">
              {grupa.stavke.map((stavka) => (
                <li key={kljucStavke(stavka)} className="min-w-0">
                  <PrevodStavka
                    stavka={stavka}
                    jezik={jezik}
                    nazivJezika={naziv}
                    ai={ai}
                    radnje={radnje}
                    red={red}
                    mozeUredjivanje={mozeUredjivanje}
                    najavi={najavi}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {preostalo > 0 ? (
        <Dugme vrsta="sekundarno" className="justify-self-start" onClick={() => setPrikazano((n) => n + STRANICA)}>
          {fmt(t.prikaziJos, { n: Math.min(STRANICA, preostalo) })}
        </Dugme>
      ) : null}
    </div>
  );
}

type StanjePogleda = { jezik: string; filter: Filter; zadrzani: ReadonlySet<string> };

/** The part with state: needs at least one translation language. */
function PogledPrevoda({
  pogled,
  jezici,
  radnje,
  red,
  mozeUredjivanje,
  najavi,
  pocetniJezik,
}: {
  pogled: StudioPrevodiPogled;
  jezici: StudioJezici;
  radnje: PrevodiRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
  pocetniJezik?: string;
}) {
  const id = useId();
  const [izabran, setIzabran] = useState(pocetniJezik ?? jezici.prevodi[0]);
  const jezik = jezici.prevodi.includes(izabran) ? izabran : jezici.prevodi[0];
  const [stanje, setStanje] = useState<StanjePogleda>({ jezik: "", filter: "sve", zadrzani: new Set() });

  const treba = pogled.stavke.filter((stavka) => trebaPaznju(statusStavke(stavka, jezik))).map(kljucStavke);
  // The filter starts on "needs attention" when something does. Items that were listed stay
  // listed after they are translated, so a field being typed into never disappears.
  let aktivno = stanje;
  if (stanje.jezik !== jezik) {
    aktivno = { jezik, filter: treba.length > 0 ? "treba" : "sve", zadrzani: new Set(treba) };
  } else if (treba.some((kljuc) => !stanje.zadrzani.has(kljuc))) {
    aktivno = { ...stanje, zadrzani: new Set([...stanje.zadrzani, ...treba]) };
  }
  if (aktivno !== stanje) setStanje(aktivno);

  const brojevi = brojeviPoJeziku(pogled.stavke, jezik);
  const sazetak = REDOSLED_STATUSA.filter((status) => brojevi[status] > 0)
    .map((status) => fmt(t.sazetak[status], { n: brojevi[status] }))
    .join(" · ");
  const prikazane = filtriraj(pogled.stavke, jezik, aktivno.filter === "treba", aktivno.zadrzani);
  const panelId = `${id}-panel`;
  const imaTabove = jezici.prevodi.length > 1;

  return (
    <div className="grid gap-4">
      <NapomenaJezika jezici={jezici} />
      <JezikTabovi jezici={jezici.prevodi} izabran={jezik} onIzbor={setIzabran} idPrefiks={`${id}-jezik`} kontrolise={panelId} />
      <div
        id={panelId}
        role={imaTabove ? "tabpanel" : undefined}
        aria-labelledby={imaTabove ? `${id}-jezik-${jezik}` : undefined}
        className="grid min-w-0 gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          {sazetak ? <p className="min-w-0 text-sm font-medium text-[var(--mp-tekst)]">{sazetak}</p> : <span />}
          <div className="w-full sm:w-auto sm:min-w-64">
            <IzborSegment
              oznaka={t.filter.oznaka}
              vrednosti={[
                { vrednost: "treba", tekst: t.filter.treba },
                { vrednost: "sve", tekst: t.filter.sve },
              ]}
              izabrano={aktivno.filter}
              onIzbor={(filter) => setStanje({ jezik, filter, zadrzani: new Set(treba) })}
            />
          </div>
        </div>
        {prikazane.length === 0 ? (
          <Napomena ton="uspeh" uloga="status">
            {fmt(t.sveGotovo, { jezik: nazivJezika(jezik) })}
          </Napomena>
        ) : (
          <Lista
            key={`${jezik}:${aktivno.filter}`}
            stavke={prikazane}
            jezik={jezik}
            ai={jezici.ai}
            radnje={radnje}
            red={red}
            mozeUredjivanje={mozeUredjivanje}
            najavi={najavi}
          />
        )}
        {pogled.skraceno ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.skraceno, { n: pogled.stavke.length })}</p> : null}
      </div>
    </div>
  );
}

export function PrevodiStranice({
  pogled,
  jezici,
  radnje,
  red,
  mozeUredjivanje,
  naslovId,
  nazadNa,
  onNazad,
  najavi,
  podesavanjaHref,
  pocetniJezik,
}: {
  /** undefined = loading, null = the server refused or failed. */
  pogled: StudioPrevodiPogled | null | undefined;
  /** undefined = loading. */
  jezici: StudioJezici | undefined;
  radnje: PrevodiRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  /** Id of the h1: the editor moves focus there when the view opens. */
  naslovId: string;
  /** Where "Nazad" leads, by name (e.g. the page name). */
  nazadNa: string;
  onNazad: () => void;
  najavi: (poruka: string) => void;
  podesavanjaHref?: string;
  pocetniJezik?: string;
}) {
  const naslov = pogled ? (pogled.naslov ? fmt(t.naslovStranice, { naziv: pogled.naslov }) : t.naslovRs) : t.naslov;
  let telo: ReactNode;
  if (pogled === undefined || jezici === undefined) {
    telo = <UcitavanjeStanje oblik="kartice" redova={3} />;
  } else if (pogled === null) {
    telo = <PraznoStanje naslov={menuStudioSr.stanja.greskaNaslov} opis={menuStudioSr.stanja.greskaOpis} />;
  } else if (jezici.prevodi.length === 0) {
    telo = <NemaJezika podesavanjaHref={podesavanjaHref} />;
  } else {
    telo = (
      <PogledPrevoda
        pogled={pogled}
        jezici={jezici}
        radnje={radnje}
        red={red}
        mozeUredjivanje={mozeUredjivanje}
        najavi={najavi}
        pocetniJezik={pocetniJezik}
      />
    );
  }
  return (
    <div className="grid min-w-0 content-start gap-5" data-prevodi-stranice="">
      <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={ArrowLeft} onClick={onNazad} className="justify-self-start">
        {fmt(t.nazad, { naziv: nazadNa })}
      </Dugme>
      <header className="grid gap-1.5">
        <h1
          id={naslovId}
          tabIndex={-1}
          className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] outline-none [overflow-wrap:anywhere] lg:text-[1.75rem]"
        >
          {naslov}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
        <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.nacrt}</p>
      </header>
      {telo}
    </div>
  );
}
