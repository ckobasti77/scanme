"use client";

// ScanMe Menu V1 — the work area of `Ponuda` (K10; master §13.4): the sections
// and articles of the open page, a search over them, `+ Dodaj` with exactly
// three choices (artikal, sekcija, kombo) and the quieter table entry. Adding
// a page is not here: it belongs to the page column.

import { FilePlus2, LayoutList, ListPlus, MoreHorizontal, Package, Plus, Rows3, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { BrziUnosRezultat, StudioIshod, StudioRadniSadrzaj, StudioSekcija } from "@/lib/menu/studio/model";
import { foldSerbian } from "@/lib/menu/text";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { PraznoStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";
import { MeniRadnji } from "../meni-radnji";
import { NazivPolje } from "../naziv-polje";
import { porukaGreske, type RedRadnje } from "../red-artikla/red-artikla";
import { SekcijaBlok } from "./sekcija-blok";

const t = menuStudioSr;

/** Sections longer than this start collapsed (K01 §8 K09). */
export const STUDIO_SKUPLJENO_PREKO = 60;

export type PonudaRadnje = RedRadnje & {
  dodajSekciju: (naziv: string) => Promise<StudioIshod<{ id: string }>>;
  preimenujSekciju: (sekcijaId: string, naziv: string, ocekivano: string) => Promise<StudioIshod>;
  obrisiSekciju: (sekcijaId: string) => Promise<StudioIshod>;
  brziUnos: (
    sekcijaId: string,
    unos: { naziv: string; cena: number | null },
    dozvoliDuplikat: boolean,
  ) => Promise<StudioIshod<BrziUnosRezultat>>;
  dodajPostojeci: (sekcijaId: string, artikalId: string) => Promise<StudioIshod>;
  otvoriTabelu: () => void;
  otvoriKombo: () => void;
};

export function PonudaRadniProstor({
  sadrzaj,
  nedostupni,
  red,
  mozeUredjivanje,
  radnje,
  naslovId,
}: {
  sadrzaj: StudioRadniSadrzaj;
  nedostupni: ReadonlySet<string>;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  radnje: PonudaRadnje;
  naslovId: string;
}) {
  const [upit, setUpit] = useState("");
  const odlozeniUpit = useDeferredValue(upit);
  const [skupljene, setSkupljene] = useState<Record<string, boolean>>({});
  const [brziUnosU, setBrziUnosU] = useState<string | null>(null);
  const [novaSekcija, setNovaSekcija] = useState(false);
  const [brisanje, setBrisanje] = useState<StudioSekcija | null>(null);
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);

  const uredjivo = mozeUredjivanje && !sadrzaj.stranica.arhivirana;
  const trazi = foldSerbian(odlozeniUpit.trim());
  const pronadjeno = useMemo(() => {
    if (!trazi) return null;
    const mapa = new Map<string, StudioSekcija["redovi"]>();
    let ukupno = 0;
    for (const sekcija of sadrzaj.sekcije) {
      const redovi = sekcija.redovi.filter((r) => foldSerbian(r.artikal.naziv).includes(trazi));
      if (redovi.length > 0) {
        mapa.set(sekcija.id, redovi);
        ukupno += redovi.length;
      }
    }
    return { mapa, ukupno };
  }, [sadrzaj.sekcije, trazi]);

  const jeSkupljena = (sekcija: StudioSekcija) =>
    pronadjeno ? false : (skupljene[sekcija.id] ?? sekcija.redovi.length > STUDIO_SKUPLJENO_PREKO);

  const dodajArtikal = () => {
    const prva = sadrzaj.sekcije[0];
    if (!prva) {
      setNovaSekcija(true);
      setPoruka(t.ponuda.sekcijaZaArtikal);
      return;
    }
    const cilj = sadrzaj.sekcije.find((s) => s.id === brziUnosU) ?? prva;
    setSkupljene((pre) => ({ ...pre, [cilj.id]: false }));
    setUpit("");
    setBrziUnosU(cilj.id);
  };

  const sekcije = pronadjeno ? sadrzaj.sekcije.filter((s) => pronadjeno.mapa.has(s.id)) : sadrzaj.sekcije;

  return (
    <div className="grid content-start gap-4" data-ponuda="">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 id={naslovId} className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] lg:text-[1.75rem]">
            {sadrzaj.stranica.naziv}
          </h1>
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">
            {sadrzaj.stranica.podrazumevana ? t.stranice.podrazumevana : t.ponuda.cenaZajednicka}
          </p>
        </div>
        {uredjivo ? (
          <MeniRadnji
            okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={t.ponuda.jos} vrsta="sekundarno" />}
            stavke={[{ kljuc: "tabela", tekst: t.ponuda.brzoVise, ikonica: Rows3, onIzbor: radnje.otvoriTabelu }]}
          />
        ) : null}
      </div>

      {sadrzaj.stranica.arhivirana ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {t.ponuda.arhivirana}
        </p>
      ) : null}
      {sadrzaj.skraceno ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {t.ponuda.skraceno}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">{t.ponuda.pretraga}</span>
          <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-3 size-5 text-[var(--mp-tekst-sporedni)]" />
          <input
            type="search"
            value={upit}
            placeholder={t.ponuda.pretraga}
            onChange={(event) => setUpit(event.target.value)}
            className="h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-dugme)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] pl-10 pr-4 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        {uredjivo ? (
          <MeniRadnji
            okidac={
              <Dugme vrsta="akcent" ikonica={Plus} data-dodaj="">
                {t.ponuda.dodaj}
              </Dugme>
            }
            stavke={[
              { kljuc: "artikal", tekst: t.ponuda.dodajArtikal, opis: t.ponuda.dodajArtikalOpis, ikonica: ListPlus, onIzbor: dodajArtikal },
              { kljuc: "sekcija", tekst: t.ponuda.dodajSekciju, opis: t.ponuda.dodajSekcijuOpis, ikonica: LayoutList, onIzbor: () => setNovaSekcija(true) },
              { kljuc: "kombo", tekst: t.ponuda.dodajKombo, opis: t.ponuda.dodajKomboOpis, ikonica: Package, onIzbor: radnje.otvoriKombo },
            ]}
          />
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {pronadjeno ? fmt(t.ponuda.rezultati[srPluralCategory(pronadjeno.ukupno)], { n: pronadjeno.ukupno }) : ""}
      </p>

      {pronadjeno && pronadjeno.ukupno === 0 ? (
        <Kartica>
          <PraznoStanje
            ikonica={Search}
            naslov={fmt(t.ponuda.nemaRezultata, { upit: odlozeniUpit.trim() })}
            opis={t.ponuda.nemaRezultataOpis}
            akcija={
              <Dugme vrsta="sekundarno" ikonica={X} onClick={() => setUpit("")}>
                {t.ponuda.obrisiPretragu}
              </Dugme>
            }
          />
        </Kartica>
      ) : null}

      {sadrzaj.sekcije.length === 0 && !novaSekcija ? (
        <Kartica>
          <PraznoStanje
            ikonica={FilePlus2}
            naslov={t.ponuda.praznoNaslov}
            opis={t.ponuda.praznoOpis}
            akcija={
              uredjivo ? (
                <>
                  <Dugme vrsta="primarno" ikonica={Plus} onClick={() => setNovaSekcija(true)}>
                    {t.ponuda.prvaSekcija}
                  </Dugme>
                  <Dugme vrsta="tiho" ikonica={Rows3} onClick={radnje.otvoriTabelu}>
                    {t.ponuda.brzoVise}
                  </Dugme>
                </>
              ) : undefined
            }
          />
        </Kartica>
      ) : null}

      {sekcije.map((sekcija) => (
        <SekcijaBlok
          key={sekcija.id}
          sekcija={sekcija}
          redovi={pronadjeno?.mapa.get(sekcija.id) ?? sekcija.redovi}
          skupljena={jeSkupljena(sekcija)}
          onSkupi={(id, skupljena) => setSkupljene((pre) => ({ ...pre, [id]: skupljena }))}
          nedostupni={nedostupni}
          red={red}
          mozeUredjivanje={uredjivo}
          redRadnje={radnje}
          brziUnosOtvoren={brziUnosU === sekcija.id}
          onBrziUnos={setBrziUnosU}
          onDodaj={radnje.brziUnos}
          onDodajPostojeci={radnje.dodajPostojeci}
          onPreimenuj={radnje.preimenujSekciju}
          onObrisi={setBrisanje}
        />
      ))}

      {novaSekcija && uredjivo ? (
        <Kartica as="section" aria-label={t.ponuda.novaSekcijaNaslov}>
          <NazivPolje
            pocetno=""
            oznaka={t.ponuda.novaSekcijaNaziv}
            primer={t.ponuda.novaSekcijaPrimer}
            potvrda={t.ponuda.novaSekcijaDodaj}
            otkazi={t.sekcija.otkazi}
            maks={MENU_TEXT.sectionName}
            greskaPrazno={t.opste.nazivObavezan}
            greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.sectionName })}
            radi={radi}
            onSacuvaj={async (naziv) => {
              setRadi(true);
              const ishod = await radnje.dodajSekciju(naziv);
              setRadi(false);
              if (!ishod.ok) {
                setPoruka(ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano);
                return;
              }
              setNovaSekcija(false);
              setPoruka(null);
              setBrziUnosU(ishod.vrednost.id);
            }}
            onOtkazi={() => {
              setNovaSekcija(false);
              setPoruka(null);
            }}
          />
          {poruka ? (
            <p role="status" className="mt-2 text-sm text-[var(--mp-tekst-sporedni)]">
              {poruka}
            </p>
          ) : null}
        </Kartica>
      ) : null}

      <StudioDijalog
        otvoreno={brisanje !== null}
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : setBrisanje(null))}
        naslov={brisanje ? fmt(t.sekcija.potvrdaBrisanjaNaslov, { naziv: brisanje.naziv }) : ""}
        podnozje={
          <>
            <Dugme vrsta="tiho" onClick={() => setBrisanje(null)}>
              {t.sekcija.otkazi}
            </Dugme>
            <Dugme
              vrsta="opasno"
              ucitava={radi}
              onClick={async () => {
                if (!brisanje) return;
                setRadi(true);
                await radnje.obrisiSekciju(brisanje.id);
                setRadi(false);
                setBrisanje(null);
              }}
            >
              {t.sekcija.obrisi}
            </Dugme>
          </>
        }
      >
        <p className="text-[0.9375rem] leading-relaxed">{t.sekcija.potvrdaBrisanjaOpis}</p>
      </StudioDijalog>
    </div>
  );
}
