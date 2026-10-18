"use client";

// ScanMe Menu V1 — one add-on group of the article (K15; master §5.7): its
// rule in words, its add-ons with their surcharge, and — when the group is
// LINKED to other articles — that it is shared and with how many. `Izmeni
// grupu` on a linked group first shows the impact (UticajGrupeDijalog); the
// group then opens for editing in the chosen scope: every change goes to all
// linked articles, or this article gets an independent copy at its first
// change. Add-ons save when a field is left; the rules save with
// `Sačuvaj grupu`.

import { Link2, MoreHorizontal, Pencil, Plus, Trash2, Unlink, X } from "lucide-react";
import { useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import {
  formaIzGrupe,
  opisPravila,
  proveriGrupu,
  type GrupaFormaProvera,
  type GrupaFormaStanje,
  type PravilaOpis,
} from "@/lib/menu/studio/article-form";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioGrupaDodataka, StudioIshod, StudioOpcijaDodatka, StudioRadnje } from "@/lib/menu/studio/model";
import { formatCenaPolje, parseCenaUnos } from "@/lib/menu/studio/price-input";
import { cleanText } from "@/lib/menu/text";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { MeniRadnji } from "../meni-radnji";
import { porukaGreske } from "../red-artikla/red-artikla";
import { GrupaForma } from "./grupa-forma";
import { POLJE_KLASA } from "./polja";
import type { OpsegIzmene } from "./uticaj-grupe-dijalog";

const t = menuStudioSr.artikal;
const d = t.dodaci;

function mnozina(grupa: { one: string; few: string; many: string }, n: number) {
  return fmt(grupa[srPluralCategory(n)], { n });
}

export function tekstPravila(opis: PravilaOpis): string {
  const p = d.pravila;
  switch (opis.vrsta) {
    case "tacno":
      return fmt(p.tacno, { n: opis.n });
    case "najvise":
      return fmt(p.najvise, { n: opis.n });
    case "najmanje":
      return fmt(p.najmanje, { n: opis.n });
    case "odDo":
      return fmt(p.odDo, { min: opis.min, max: opis.max });
    default:
      return p[opis.vrsta];
  }
}

export function tekstDoplate(doplata: number): string {
  return doplata === 0 ? d.besplatno : fmt(d.doplataPrikaz, { cena: formatCenaPolje(doplata) });
}

function porukaIshoda(ishod: StudioIshod<unknown>): string | null {
  if (ishod.ok) return null;
  if (ishod.vrsta === "konflikt") return fmt(t.konflikt, { sacuvano: String(ishod.sacuvano ?? t.bezVrednosti) });
  return ishod.ponovljivo ? t.nijeSacuvano : (porukaGreske(ishod.kod) ?? t.nijeSacuvano);
}

export type GrupaRadnje = Pick<
  StudioRadnje,
  "izmeniGrupu" | "dodajOpciju" | "izmeniOpciju" | "obrisiOpciju" | "otkaciGrupu"
>;

export function GrupaDodataka({
  grupa,
  artikalId,
  red,
  radnje,
  mozeUredjivanje,
  opseg,
  onIzmeni,
  onZavrsi,
  onPrimeni,
  najavi,
}: {
  grupa: StudioGrupaDodataka;
  artikalId: string;
  red: AutosaveRed;
  radnje: GrupaRadnje;
  mozeUredjivanje: boolean;
  /** Being edited, and for whom (null = view). A group linked only here is always "sve". */
  opseg: OpsegIzmene | null;
  /** `Izmeni grupu` (the detail shows the impact first for a linked group). */
  onIzmeni: () => void;
  onZavrsi: () => void;
  onPrimeni: () => void;
  najavi: (tekst: string) => void;
}) {
  const id = useId();
  const povezana = grupa.brojArtikala > 1;
  const samoZa = opseg === "kopija" ? artikalId : null;
  const [forma, setForma] = useState<GrupaFormaStanje>(() => formaIzGrupe(grupa));
  const [provera, setProvera] = useState<GrupaFormaProvera | null>(null);
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [nova, setNova] = useState({ naziv: "", doplata: "" });
  const [greskaNove, setGreskaNove] = useState<string | null>(null);

  const izvrsi = async (rad: () => Promise<StudioIshod<unknown>>, uspeh?: string) => {
    setRadi(true);
    const ishod = await red.prati(rad);
    setRadi(false);
    const problem = porukaIshoda(ishod);
    setPoruka(problem);
    if (!problem && uspeh) najavi(uspeh);
    return !problem;
  };

  const sacuvajPravila = async () => {
    const rezultat = proveriGrupu(forma);
    setProvera(rezultat);
    if (!rezultat.ok) return;
    const ocekivano = { naziv: grupa.naziv, izbor: grupa.izbor, obavezna: grupa.obavezna, min: grupa.min, max: grupa.max };
    await izvrsi(() => radnje.izmeniGrupu(grupa.id, ocekivano, rezultat.unos, samoZa), t.sacuvano);
  };

  const dodajDodatak = async () => {
    const naziv = cleanText(nova.naziv);
    const cena = parseCenaUnos(nova.doplata);
    if (naziv === "" || naziv.length > MENU_TEXT.addonOptionName) {
      setGreskaNove(naziv === "" ? menuStudioSr.opste.nazivObavezan : fmt(t.osnovno.greske.predugo, { n: MENU_TEXT.addonOptionName }));
      return;
    }
    if (!cena.ok) {
      setGreskaNove(menuStudioSr.cena.greske[cena.greska]);
      return;
    }
    setGreskaNove(null);
    if (await izvrsi(() => radnje.dodajOpciju(grupa.id, { naziv, doplata: cena.cena ?? 0 }, samoZa))) setNova({ naziv: "", doplata: "" });
  };

  const pravila = tekstPravila(opisPravila(grupa));

  return (
    <li
      data-grupa-dodataka={grupa.key}
      data-povezana={povezana ? "" : undefined}
      data-uredjuje={opseg ?? undefined}
      className="grid gap-3 rounded-[var(--mp-radius-kontrola)] border px-3 py-3 [--border:var(--mp-ivica)] sm:px-4"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="grid min-w-[min(100%,12rem)] flex-1 gap-1">
          <h3 id={`${id}-naziv`} className="font-semibold leading-snug [overflow-wrap:anywhere]">
            {grupa.naziv}
          </h3>
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{pravila}</p>
          {povezana ? (
            <span className="pt-0.5">
              <StatusOznaka ton="info" ikonica={Link2} velicina="mala">
                {mnozina(d.povezana, grupa.brojArtikala)}
              </StatusOznaka>
            </span>
          ) : null}
        </div>
        {mozeUredjivanje && opseg === null ? (
          <span className="flex shrink-0 items-center gap-1">
            <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Pencil} onClick={onIzmeni} data-izmeni-grupu={grupa.key}>
              {d.izmeni}
            </Dugme>
            <MeniRadnji
              okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={fmt(d.radnjeGrupe, { naziv: grupa.naziv })} />}
              stavke={[
                { kljuc: "primeni", tekst: d.primeni, ikonica: Plus, onIzbor: onPrimeni },
                {
                  kljuc: "ukloni",
                  tekst: d.ukloni,
                  opis: d.ukloniOpis,
                  ikonica: Unlink,
                  onIzbor: () => void izvrsi(() => radnje.otkaciGrupu(artikalId, grupa.id)),
                },
              ]}
            />
          </span>
        ) : null}
      </div>

      {opseg !== null && povezana ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]">
          {opseg === "sve" ? mnozina(d.menjaSeZaSve, grupa.brojArtikala) : d.menjaSeKopija}
        </p>
      ) : null}

      {opseg !== null ? (
        <div className="grid gap-4 border-t pt-4 [--border:var(--mp-ivica)]">
          <GrupaForma forma={forma} onForma={setForma} greska={provera} onemoguceno={radi} />
          <span>
            <Dugme vrsta="sekundarno" velicina="kompaktna" ucitava={radi} onClick={() => void sacuvajPravila()}>
              {d.sacuvaj}
            </Dugme>
          </span>
        </div>
      ) : null}

      {grupa.opcije.length === 0 && opseg === null ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{d.bezDodataka}</p> : null}
      {grupa.opcije.length > 0 ? (
        <ul aria-labelledby={`${id}-naziv`} className="grid gap-1.5">
          {grupa.opcije.map((opcija, indeks) =>
            opseg === null ? (
              <li key={opcija.id} className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
                <span className="min-w-0 [overflow-wrap:anywhere]">{opcija.naziv}</span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--mp-tekst-sporedni)]">{tekstDoplate(opcija.doplata)}</span>
              </li>
            ) : (
              <OpcijaRed
                key={opcija.id}
                opcija={opcija}
                redniBroj={indeks + 1}
                onemoguceno={radi}
                onSacuvaj={(ocekivano, izmena) => izvrsi(() => radnje.izmeniOpciju(opcija.id, ocekivano, izmena, samoZa))}
                onUkloni={() => void izvrsi(() => radnje.obrisiOpciju(opcija.id, samoZa))}
              />
            ),
          )}
        </ul>
      ) : null}

      {opseg !== null ? (
        <div className="grid gap-2 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <label className="grid gap-1">
              <span className="text-sm font-semibold">{d.noviDodatak}</span>
              <input
                value={nova.naziv}
                autoComplete="off"
                onChange={(event) => setNova({ ...nova, naziv: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void dodajDodatak();
                  }
                }}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold">{d.doplata}</span>
              <input
                value={nova.doplata}
                inputMode="numeric"
                placeholder="0"
                aria-label={d.novaDoplata}
                onChange={(event) => setNova({ ...nova, doplata: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void dodajDodatak();
                  }
                }}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)] text-right tabular-nums")}
              />
            </label>
          </div>
          {greskaNove ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {greskaNove}
            </p>
          ) : null}
          <span className="flex flex-wrap gap-2">
            <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Plus} ucitava={radi} onClick={() => void dodajDodatak()}>
              {d.dodajDodatak}
            </Dugme>
            <Dugme vrsta="primarno" velicina="kompaktna" onClick={onZavrsi} data-zavrsi-grupu="">
              {d.gotovo}
            </Dugme>
          </span>
        </div>
      ) : null}

      {poruka ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-[var(--mp-opasnost)]">
          <X aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
          {poruka}
        </p>
      ) : null}
    </li>
  );
}

function OpcijaRed({
  opcija,
  redniBroj,
  onemoguceno,
  onSacuvaj,
  onUkloni,
}: {
  opcija: StudioOpcijaDodatka;
  redniBroj: number;
  onemoguceno: boolean;
  onSacuvaj: (ocekivano: { naziv?: string; doplata?: number }, izmena: { naziv?: string; doplata?: number }) => Promise<boolean>;
  onUkloni: () => void;
}) {
  const [naziv, setNaziv] = useState<string | null>(null);
  const [doplata, setDoplata] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  const sacuvajNaziv = () => {
    if (naziv === null) return;
    const cist = cleanText(naziv);
    setNaziv(null);
    if (cist === opcija.naziv) return;
    if (cist === "" || cist.length > MENU_TEXT.addonOptionName) {
      setGreska(cist === "" ? menuStudioSr.opste.nazivObavezan : fmt(t.osnovno.greske.predugo, { n: MENU_TEXT.addonOptionName }));
      return;
    }
    setGreska(null);
    void onSacuvaj({ naziv: opcija.naziv }, { naziv: cist });
  };
  const sacuvajDoplatu = () => {
    if (doplata === null) return;
    const unos = parseCenaUnos(doplata);
    setDoplata(null);
    if (!unos.ok) {
      setGreska(menuStudioSr.cena.greske[unos.greska]);
      return;
    }
    const vrednost = unos.cena ?? 0;
    setGreska(null);
    if (vrednost !== opcija.doplata) void onSacuvaj({ doplata: opcija.doplata }, { doplata: vrednost });
  };

  return (
    <li className="grid gap-1" data-opcija={opcija.key}>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
        <input
          value={naziv ?? opcija.naziv}
          autoComplete="off"
          disabled={onemoguceno}
          aria-label={fmt(d.dodatakOznaka, { n: redniBroj })}
          onChange={(event) => setNaziv(event.target.value)}
          onBlur={sacuvajNaziv}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
        />
        <input
          value={doplata ?? formatCenaPolje(opcija.doplata)}
          inputMode="numeric"
          disabled={onemoguceno}
          aria-label={fmt(d.doplataOznaka, { naziv: opcija.naziv })}
          onChange={(event) => setDoplata(event.target.value)}
          onBlur={sacuvajDoplatu}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)] text-right tabular-nums")}
        />
        <IkonicaDugme ikonica={Trash2} oznaka={fmt(d.ukloniDodatak, { naziv: opcija.naziv })} disabled={onemoguceno} onClick={onUkloni} />
      </div>
      {greska ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
    </li>
  );
}
