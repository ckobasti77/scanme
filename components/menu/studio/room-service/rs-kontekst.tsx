"use client";

// ScanMe Menu V1 — the Room service context of the editor (K16; master §5.3,
// §13.4, §21.4; mockup 05 with the README corrections). Room service is NOT a
// page: it opens from `Posebne usluge` in the structure, only on Premium and
// only when switched on in Funkcionalnosti. It has its own selection (copy the
// whole menu once, or pick existing articles), its own categories and order,
// and its own prices: markup for all or selected articles, manual Room service
// prices, one delivery fee per order. Every row says where its price comes
// from. Design and layout are inherited from the menu. Everything goes into
// the draft; nothing reaches guests before `Objavi`.

import { ArrowDown, ArrowUp, BedDouble, CopyPlus, Languages, ListPlus, MoreHorizontal, PencilLine, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioIshod, StudioRadnje, StudioRoomService, StudioRsUpozorenje } from "@/lib/menu/studio/model";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { GreskaStanje, PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { MeniRadnji, type StavkaMenija } from "../meni-radnji";
import { NazivPolje } from "../naziv-polje";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";
import { DodajIzPonude } from "./dodaj-iz-ponude";
import { RsPravila } from "./rs-pravila";
import { kljucRsCene, RsRed, type RsRedRadnje } from "./rs-red";

const t = menuStudioSr;
const rs = t.posebno.roomService;

type RsRadnje = Pick<
  StudioRadnje,
  | "rsPravila"
  | "rsDodajKategoriju"
  | "rsPreimenujKategoriju"
  | "rsPremestiKategoriju"
  | "rsObrisiKategoriju"
  | "rsPreuzmiCeoMeni"
  | "rsDodajArtikle"
  | "rsUkloni"
  | "rsPremestiStavku"
  | "rsUvecanje"
  | "rsRucnaCena"
  | "traziArtikle"
>;

function mnozina(grupa: { one: string; few: string; many: string }, n: number) {
  return fmt(grupa[srPluralCategory(n)], { n });
}

function tekstNeuspeha(ishod: StudioIshod<unknown>): string {
  if (ishod.ok) return "";
  const tekst = ishod.vrsta === "greska" ? porukaGreske(ishod.kod) : null;
  return tekst ? `${t.red.nijeSacuvano} ${tekst}` : t.red.nijeSacuvano;
}

export function RsKontekst({
  rs: podaci,
  radnje,
  red,
  mozeUredjivanje,
  naslovId,
  telefon,
  najavi,
  onUpozorenje,
  onPrevodi,
}: {
  rs: StudioRoomService | null | undefined;
  radnje: RsRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  naslovId: string;
  /** Phone: the price rules start collapsed (K09 §3.3). */
  telefon: boolean;
  najavi: (tekst: string) => void;
  onUpozorenje: (upozorenje: StudioRsUpozorenje) => void;
  /** Opens the translations of the categories (only when the menu has translation languages). */
  onPrevodi?: () => void;
}) {
  const [dodaj, setDodaj] = useState<{ kategorija: string | null } | null>(null);
  const [novaKategorija, setNovaKategorija] = useState(false);
  const [preimenuje, setPreimenuje] = useState<string | null>(null);
  const [radi, setRadi] = useState<"preuzmi" | "kategorija" | null>(null);
  const [poruka, setPoruka] = useState<{ ton: "info" | "greska"; tekst: string } | null>(null);

  const uRs = useMemo(
    () => new Set((podaci?.kategorije ?? []).flatMap((k) => k.redovi.map((r) => r.artikalId))),
    [podaci],
  );

  const javi = (ishod: StudioIshod<unknown>, uspeh?: string) => {
    if (!ishod.ok) setPoruka({ ton: "greska", tekst: tekstNeuspeha(ishod) });
    else if (uspeh) {
      setPoruka({ ton: "info", tekst: uspeh });
      najavi(uspeh);
    } else setPoruka(null);
  };

  const redRadnje = useMemo<RsRedRadnje>(
    () => ({
      onRucna: (stavkaId, ocekivana, nova) =>
        red.zakazi(kljucRsCene(stavkaId), {
          ocekivano: ocekivana,
          vrednost: nova,
          posalji: (o, v) => radnje.rsRucnaCena(stavkaId, o as number | null, v as number | null),
        }),
      onUvecanje: (stavkaId, primeni) => void red.prati(() => radnje.rsUvecanje([stavkaId], primeni)).then((ishod) => javi(ishod)),
      onPremesti: (stavkaId, uKategoriju, preStavke) =>
        void red.prati(() => radnje.rsPremestiStavku(stavkaId, uKategoriju, preStavke)).then((ishod) => javi(ishod)),
      onUkloni: (stavkaId) => void red.prati(() => radnje.rsUkloni(stavkaId)).then((ishod) => javi(ishod)),
      onUpozorenje,
    }),
    // javi only sets local state; listing it would rebuild the rows' actions on every message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [red, radnje, onUpozorenje],
  );

  if (podaci === undefined) {
    return (
      <div className="grid content-start gap-4" data-rs-kontekst="ucitava">
        <h1 id={naslovId} className="sr-only">
          {rs.naslov}
        </h1>
        <UcitavanjeStanje oblik="lista" redova={5} />
      </div>
    );
  }
  if (podaci === null) {
    return (
      <Kartica data-rs-kontekst="greska">
        <h1 id={naslovId} className="sr-only">
          {rs.naslov}
        </h1>
        <GreskaStanje naslov={t.stanja.greskaNaslov} opis={t.stanja.greskaOpis} />
      </Kartica>
    );
  }

  const { kategorije, pravila } = podaci;
  const redovi = kategorije.flatMap((k) => k.redovi);
  const upozorenja = redovi.flatMap((r) => (r.upozorenje ? [r.upozorenje] : []));
  const izabraniObuhvat = pravila.obuhvat === "selected";
  const sveKategorije = kategorije.map((k) => ({ id: k.id, naziv: k.naziv }));

  const preuzmi = async () => {
    setRadi("preuzmi");
    const ishod = await red.prati(() => radnje.rsPreuzmiCeoMeni());
    setRadi(null);
    javi(ishod, ishod.ok ? fmt(rs.preuzeto, ishod.vrednost) : undefined);
  };

  const dodajKategoriju = async (naziv: string) => {
    setRadi("kategorija");
    const ishod = await red.prati(() => radnje.rsDodajKategoriju(naziv));
    setRadi(null);
    if (ishod.ok) setNovaKategorija(false);
    javi(ishod);
  };

  const traka = mozeUredjivanje ? (
    <div className="flex flex-wrap items-center gap-2" data-rs-traka="">
      <Dugme
        vrsta="akcent"
        ikonica={ListPlus}
        onClick={() => setDodaj({ kategorija: null })}
        disabled={kategorije.length === 0}
        className="max-sm:w-full"
        data-rs-dodaj-iz-ponude=""
      >
        {rs.radnje.dodaj}
      </Dugme>
      <Dugme vrsta="sekundarno" ikonica={CopyPlus} ucitava={radi === "preuzmi"} onClick={() => void preuzmi()} className="max-sm:w-full" data-rs-preuzmi="">
        {rs.radnje.preuzmi}
      </Dugme>
      <Dugme vrsta="tiho" ikonica={Plus} onClick={() => setNovaKategorija(true)} className="max-sm:w-full" data-rs-nova-kategorija="">
        {rs.radnje.kategorija}
      </Dugme>
    </div>
  ) : null;

  return (
    <div className="grid content-start gap-4" data-rs-kontekst="">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 id={naslovId} tabIndex={-1} className="flex items-center gap-2 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] outline-none lg:text-[1.75rem]">
            <BedDouble aria-hidden="true" strokeWidth={1.75} className="size-6 shrink-0 text-[var(--mp-tekst-sporedni)]" />
            {rs.naslov}
          </h1>
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{rs.opis}</p>
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{rs.nacrt}</p>
        </div>
        {onPrevodi ? (
          <MeniRadnji
            okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={rs.radnje.jos} vrsta="sekundarno" />}
            stavke={[{ kljuc: "prevodi", tekst: rs.radnje.prevodi, ikonica: Languages, onIzbor: onPrevodi }]}
          />
        ) : null}
      </div>

      {upozorenja.length > 0 ? (
        <div
          role="status"
          data-rs-upozorenja={upozorenja.length}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-[0.9375rem] font-medium [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]"
        >
          <p className="flex items-center gap-2">
            <TriangleAlert aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-upozorenje)]" />
            <span>
              {mnozina(rs.upozorenja, upozorenja.length)}
              <span className="font-normal">: {upozorenja.map((u) => u.naziv).join(", ")}</span>
            </span>
          </p>
          {mozeUredjivanje ? (
            <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={() => onUpozorenje(upozorenja[0])}>
              {rs.pregledaj}
            </Dugme>
          ) : null}
        </div>
      ) : null}

      <RsPravila
        key={`${pravila.uvecanje}-${pravila.obuhvat}-${pravila.naknada}`}
        pravila={pravila}
        mozeUredjivanje={mozeUredjivanje}
        pocetnoOtvoreno={!telefon}
        onSacuvaj={(ocekivano, izmena) => red.prati(() => radnje.rsPravila(ocekivano, izmena))}
        najavi={najavi}
      />

      {traka}

      {novaKategorija ? (
        <Kartica className="p-3">
          <NazivPolje
            pocetno=""
            oznaka={rs.kategorija.nova}
            primer={rs.kategorija.primer}
            potvrda={rs.kategorija.dodaj}
            otkazi={rs.kategorija.otkazi}
            maks={MENU_TEXT.roomServiceCategoryName}
            greskaPrazno={t.opste.nazivObavezan}
            greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.roomServiceCategoryName })}
            radi={radi === "kategorija"}
            onSacuvaj={(naziv) => void dodajKategoriju(naziv)}
            onOtkazi={() => setNovaKategorija(false)}
          />
        </Kartica>
      ) : null}

      <p
        role="status"
        className={
          poruka?.ton === "greska"
            ? "text-sm font-medium text-[var(--mp-opasnost)]"
            : "text-sm text-[var(--mp-tekst-sporedni)]"
        }
      >
        {poruka?.tekst ?? ""}
      </p>

      {podaci.skraceno ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {rs.skraceno}
        </p>
      ) : null}

      {kategorije.length === 0 ? (
        <Kartica>
          <PraznoStanje ikonica={BedDouble} naslov={rs.praznoNaslov} opis={rs.praznoOpis} />
          <p className="mt-3 text-sm text-[var(--mp-tekst-sporedni)]">{rs.radnje.preuzmiOpis}</p>
        </Kartica>
      ) : (
        <>
          <div className="grid gap-1 text-sm text-[var(--mp-tekst-sporedni)]">
            <p data-rs-legenda="">{rs.legenda}</p>
            {pravila.naknada !== null ? (
              <p className="font-medium text-[var(--mp-tekst)]" data-rs-dostava="">
                {fmt(rs.dostava, { cena: tekstCene(pravila.naknada) })}
              </p>
            ) : null}
          </div>
          {kategorije.map((kategorija, indeks) => {
            const stavkeKategorije: StavkaMenija[] = [
              { kljuc: "preimenuj", tekst: rs.kategorija.preimenuj, ikonica: PencilLine, onIzbor: () => setPreimenuje(kategorija.id) },
              { kljuc: "dodaj", tekst: rs.kategorija.dodajOvde, ikonica: ListPlus, onIzbor: () => setDodaj({ kategorija: kategorija.id }) },
              ...(indeks > 0
                ? [{ kljuc: "gore", tekst: rs.kategorija.gore, ikonica: ArrowUp, onIzbor: () => void red.prati(() => radnje.rsPremestiKategoriju(kategorija.id, indeks - 1)).then((i) => javi(i)) }]
                : []),
              ...(indeks < kategorije.length - 1
                ? [{ kljuc: "dole", tekst: rs.kategorija.dole, ikonica: ArrowDown, onIzbor: () => void red.prati(() => radnje.rsPremestiKategoriju(kategorija.id, indeks + 1)).then((i) => javi(i)) }]
                : []),
              {
                kljuc: "obrisi",
                tekst: rs.kategorija.obrisi,
                ikonica: Trash2,
                opasno: true,
                onIzbor: () => void red.prati(() => radnje.rsObrisiKategoriju(kategorija.id)).then((i) => javi(i)),
              },
            ];
            const naslovKategorije = `rs-kategorija-${kategorija.id}`;
            return (
              <Kartica key={kategorija.id} as="section" aria-labelledby={naslovKategorije} className="grid gap-1 p-4" data-rs-kategorija={kategorija.id}>
                <div className="flex items-center justify-between gap-2">
                  {preimenuje === kategorija.id ? (
                    <NazivPolje
                      className="flex-1 py-1"
                      pocetno={kategorija.naziv}
                      oznaka={rs.kategorija.nazivOznaka}
                      potvrda={rs.kategorija.sacuvaj}
                      otkazi={rs.kategorija.otkazi}
                      maks={MENU_TEXT.roomServiceCategoryName}
                      greskaPrazno={t.opste.nazivObavezan}
                      greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.roomServiceCategoryName })}
                      onSacuvaj={(naziv) => {
                        setPreimenuje(null);
                        void red.prati(() => radnje.rsPreimenujKategoriju(kategorija.id, naziv, kategorija.naziv)).then((i) => javi(i));
                      }}
                      onOtkazi={() => setPreimenuje(null)}
                    />
                  ) : (
                    <h2 id={naslovKategorije} className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                      {kategorija.naziv}
                      <span className="ml-2 text-sm font-normal text-[var(--mp-tekst-sporedni)]">
                        {mnozina(rs.kategorija.broj, kategorija.redovi.length)}
                      </span>
                    </h2>
                  )}
                  {mozeUredjivanje && preimenuje !== kategorija.id ? (
                    <MeniRadnji
                      okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={fmt(rs.kategorija.radnje, { naziv: kategorija.naziv })} />}
                      stavke={stavkeKategorije}
                    />
                  ) : null}
                </div>
                {kategorija.redovi.length === 0 ? (
                  <div className="grid gap-2 py-2">
                    <p className="text-sm text-[var(--mp-tekst-sporedni)]">{rs.kategorija.prazna}</p>
                    {mozeUredjivanje ? (
                      <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Plus} className="justify-self-start" onClick={() => setDodaj({ kategorija: kategorija.id })}>
                        {rs.kategorija.dodajOvde}
                      </Dugme>
                    ) : null}
                  </div>
                ) : (
                  <ul className="grid">
                    {kategorija.redovi.map((stavka, i) => (
                      <RsRed
                        key={stavka.stavkaId}
                        stavka={stavka}
                        uvecanje={pravila.uvecanje}
                        izabraniObuhvat={izabraniObuhvat}
                        kategorijaId={kategorija.id}
                        pre={i > 0 ? { id: kategorija.redovi[i - 1].stavkaId, preNjega: i > 1 ? kategorija.redovi[i - 2].stavkaId : null } : null}
                        posle={i < kategorija.redovi.length - 1 ? { posleNjega: kategorija.redovi[i + 2]?.stavkaId ?? null } : null}
                        druge={sveKategorije.filter((k) => k.id !== kategorija.id)}
                        red={red}
                        mozeUredjivanje={mozeUredjivanje}
                        radnje={redRadnje}
                      />
                    ))}
                  </ul>
                )}
              </Kartica>
            );
          })}
          {podaci.vanRs > 0 ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{mnozina(rs.vanRs, podaci.vanRs)}</p> : null}
        </>
      )}

      <DodajIzPonude
        key={dodaj?.kategorija ?? "sve"}
        otvoreno={dodaj !== null}
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : setDodaj(null))}
        kategorije={sveKategorije}
        pocetnaKategorija={dodaj?.kategorija ?? null}
        uRs={uRs}
        traziArtikle={radnje.traziArtikle}
        onDodaj={(kategorijaId, artikalIds) => red.prati(() => radnje.rsDodajArtikle(kategorijaId, artikalIds))}
        najavi={(tekst) => {
          setPoruka({ ton: "info", tekst });
          najavi(tekst);
        }}
      />
    </div>
  );
}
