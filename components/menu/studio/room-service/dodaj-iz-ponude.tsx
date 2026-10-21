"use client";

// ScanMe Menu V1 — "Dodaj iz postojeće ponude" (K16; master §5.3, §13.4): the
// owner searches the menu's articles by name and picks several at once; the
// article library is never shown as a whole list. Picks survive a new search
// (they are listed above the results). An article already in Room service is
// shown but cannot be picked (an article is in Room service at most once).

import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioIshod, StudioKandidat } from "@/lib/menu/studio/model";
import { izabranaVrednost } from "@/lib/menu/studio/quick-add";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { OZNAKA_KLASA, POLJE_KLASA } from "../artikal/polja";
import { StudioDijalog } from "../dijalog";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;
const d = t.posebno.roomService.dodajDijalog;

const ODLOZI_MS = 250;

export function DodajIzPonude({
  otvoreno,
  onOtvoreno,
  kategorije,
  pocetnaKategorija,
  uRs,
  traziArtikle,
  onDodaj,
  najavi,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  kategorije: readonly { id: string; naziv: string }[];
  pocetnaKategorija: string | null;
  /** Article ids already in Room service. */
  uRs: ReadonlySet<string>;
  traziArtikle: (upit: string) => Promise<StudioIshod<StudioKandidat[]>>;
  onDodaj: (kategorijaId: string, artikalIds: string[]) => Promise<StudioIshod<{ dodato: number; vecU: number }>>;
  najavi: (tekst: string) => void;
}) {
  const id = useId();
  // K34: this dialog is mounted before the categories arrive, so the state is only the owner's pick
  // ("" = none); the category that is shown and sent follows the props at every render.
  const [izabranaKategorija, setIzabranaKategorija] = useState("");
  const kategorija = izabranaVrednost(izabranaKategorija, pocetnaKategorija, kategorije);
  const [upit, setUpit] = useState("");
  const [rezultati, setRezultati] = useState<StudioKandidat[] | null>(null);
  const [trazi, setTrazi] = useState(false);
  const [izabrani, setIzabrani] = useState<ReadonlyMap<string, StudioKandidat>>(new Map());
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const cist = upit.trim();
  const kratak = cist.length < 2;
  useEffect(() => {
    if (kratak) return;
    let vazi = true;
    const handle = setTimeout(() => {
      void traziArtikle(cist).then((ishod) => {
        if (!vazi) return;
        setTrazi(false);
        setRezultati(ishod.ok ? ishod.vrednost : []);
      });
    }, ODLOZI_MS);
    return () => {
      vazi = false;
      clearTimeout(handle);
    };
  }, [cist, kratak, traziArtikle]);

  const izabraniNiz = useMemo(() => [...izabrani.values()], [izabrani]);

  const zatvori = (sledece: boolean) => {
    if (!sledece) {
      setUpit("");
      setRezultati(null);
      setIzabrani(new Map());
      setGreska(null);
    }
    onOtvoreno(sledece);
  };

  const prebaci = (kandidat: StudioKandidat, ukljuci: boolean) =>
    setIzabrani((pre) => {
      const sledece = new Map(pre);
      if (ukljuci) sledece.set(kandidat.artikalId, kandidat);
      else sledece.delete(kandidat.artikalId);
      return sledece;
    });

  const dodaj = async () => {
    if (!kategorija || izabrani.size === 0) return;
    setRadi(true);
    setGreska(null);
    const ishod = await onDodaj(kategorija, [...izabrani.keys()]);
    setRadi(false);
    if (!ishod.ok) {
      const tekst = ishod.vrsta === "greska" ? porukaGreske(ishod.kod) : null;
      setGreska(tekst ? `${t.red.nijeSacuvano} ${tekst}` : t.red.nijeSacuvano);
      return;
    }
    najavi(fmt(d.dodato, { dodato: ishod.vrednost.dodato, vecU: ishod.vrednost.vecU }));
    zatvori(false);
  };

  const brojIzabranih = fmt(d.izabrano[srPluralCategory(izabrani.size)], { n: izabrani.size });

  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={zatvori}
      naslov={d.naslov}
      opis={d.opis}
      sirina="siroka"
      podnozje={
        <>
          <Dugme vrsta="tiho" onClick={() => zatvori(false)} className="max-sm:w-full">
            {d.otkazi}
          </Dugme>
          <Dugme
            vrsta="primarno"
            ucitava={radi}
            disabled={izabrani.size === 0 || !kategorija}
            onClick={() => void dodaj()}
            className="max-sm:w-full"
            data-rs-dodaj-izabrane=""
          >
            {d.dodaj}
          </Dugme>
        </>
      }
    >
      {kategorije.length === 0 ? (
        <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{d.bezKategorije}</p>
      ) : (
        <div className="grid gap-4" data-rs-dodaj="">
          <label className="grid gap-1.5">
            <span className={OZNAKA_KLASA}>{d.kategorija}</span>
            <select className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pr-8")} value={kategorija} onChange={(event) => setIzabranaKategorija(event.target.value)}>
              {kategorije.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.naziv}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-trazi`} className={OZNAKA_KLASA}>
              {d.pretraga}
            </label>
            <span className="relative">
              <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-3 size-5 text-[var(--mp-tekst-sporedni)]" />
              <input
                id={`${id}-trazi`}
                type="search"
                autoComplete="off"
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pl-10")}
                value={upit}
                aria-describedby={`${id}-pomoc`}
                onChange={(event) => {
                  setUpit(event.target.value);
                  setTrazi(event.target.value.trim().length >= 2);
                }}
              />
            </span>
            <span id={`${id}-pomoc`} className="text-sm text-[var(--mp-tekst-sporedni)]">
              {d.pomoc}
            </span>
          </div>

          {izabraniNiz.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-sm font-semibold" role="status">
                {brojIzabranih}
              </p>
              <ul className="flex flex-wrap gap-2">
                {izabraniNiz.map((kandidat) => (
                  <li
                    key={kandidat.artikalId}
                    className="inline-flex min-h-[var(--mp-meta)] items-center gap-1 rounded-full border pl-3 text-sm [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]"
                  >
                    <span className="[overflow-wrap:anywhere]">{kandidat.naziv}</span>
                    <IkonicaDugme ikonica={X} oznaka={fmt(d.ukloniIzbor, { naziv: kandidat.naziv })} onClick={() => prebaci(kandidat, false)} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            aria-busy={trazi || undefined}
            className="max-h-[18rem] min-h-[3rem] overflow-y-auto rounded-[var(--mp-radius-kontrola)] border px-3 [--border:var(--mp-ivica)]"
          >
            {kratak || rezultati === null ? (
              <p className="py-3 text-sm text-[var(--mp-tekst-sporedni)]">{d.pomoc}</p>
            ) : rezultati.length === 0 && !trazi ? (
              <p className="py-3 text-sm text-[var(--mp-tekst-sporedni)]">{fmt(d.nema, { upit: upit.trim() })}</p>
            ) : (
              rezultati.map((kandidat) => {
                const vec = uRs.has(kandidat.artikalId);
                return (
                  <PoljePotvrde
                    key={kandidat.artikalId}
                    naziv={kandidat.naziv}
                    opis={vec ? d.vecU : tekstCene(kandidat.cena)}
                    disabled={vec}
                    checked={vec || izabrani.has(kandidat.artikalId)}
                    onChange={(event) => prebaci(kandidat, event.target.checked)}
                  />
                );
              })
            )}
          </div>
          {greska ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {greska}
            </p>
          ) : null}
        </div>
      )}
    </StudioDijalog>
  );
}
