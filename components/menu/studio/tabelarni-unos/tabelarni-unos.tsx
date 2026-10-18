"use client";

// ScanMe Menu V1 — "Brzo dodaj više artikala" (K10; master §13.4: a quiet,
// secondary table entry with at least `Naziv`, `Cena` and `Sekcija`, without
// opening each article). Blank rows are ignored. All rows are saved in one
// step, or none: when some names already exist, the owner decides per row
// (the same article, a new one, or skip) before anything is written.

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type {
  StudioIshod,
  StudioKandidat,
  StudioSekcija,
  TabelaOdluka,
  TabelaRezultat,
  TabelaUnosRed,
} from "@/lib/menu/studio/model";
import {
  MENU_STUDIO_MAX_QUICK_ROWS,
  proveriTabelu,
  type TabelaProvera,
  type TabelaRed,
} from "@/lib/menu/studio/quick-add";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../dijalog";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;
const POCETNO_REDOVA = 5;

const poljeKlase =
  "h-[var(--mp-meta)] w-full min-w-0 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)]";

function prazniRedovi(sekcijaId: string, broj: number): TabelaRed[] {
  return Array.from({ length: broj }, () => ({ naziv: "", cena: "", sekcijaId }));
}

type Slicno = { indeks: number; kandidati: StudioKandidat[] };

export function TabelarniUnos({
  otvoreno,
  onOtvoreno,
  sekcije,
  podrazumevanaSekcija,
  onPosalji,
  onDodato,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  sekcije: readonly Pick<StudioSekcija, "id" | "naziv">[];
  podrazumevanaSekcija: string | null;
  onPosalji: (redovi: TabelaUnosRed[]) => Promise<StudioIshod<TabelaRezultat>>;
  /** After a successful save: how many articles were added (for the announcement). */
  onDodato: (broj: number) => void;
}) {
  const id = useId();
  const pocetna = podrazumevanaSekcija ?? sekcije[0]?.id ?? "";
  const [redovi, setRedovi] = useState<TabelaRed[]>(() => prazniRedovi(pocetna, POCETNO_REDOVA));
  const [provera, setProvera] = useState<TabelaProvera | null>(null);
  const [slicno, setSlicno] = useState<Slicno[] | null>(null);
  const [odluke, setOdluke] = useState<Record<number, TabelaOdluka>>({});
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const resetuj = () => {
    setRedovi(prazniRedovi(pocetna, POCETNO_REDOVA));
    setProvera(null);
    setSlicno(null);
    setOdluke({});
    setGreska(null);
  };

  const promeniOtvoreno = (sledece: boolean) => {
    if (!sledece) resetuj();
    onOtvoreno(sledece);
  };

  const izmeni = (indeks: number, polje: keyof TabelaRed, vrednost: string) => {
    setRedovi((pre) => pre.map((red, i) => (i === indeks ? { ...red, [polje]: vrednost } : red)));
    if (slicno) {
      setSlicno(null);
      setOdluke({});
    }
  };

  const greskeReda = new Map(provera && !provera.ok ? provera.greske.map((g) => [g.indeks, g]) : []);

  const posalji = async () => {
    const p = proveriTabelu(redovi, new Set(sekcije.map((sekcija) => sekcija.id)));
    setProvera(p);
    setGreska(null);
    if (!p.ok) return;
    const odlukaZa = new Map(slicno?.map((s) => [p.redovi[s.indeks]?.indeks, s]) ?? []);
    const unos: TabelaUnosRed[] = p.redovi.map((red) => {
      const s = odlukaZa.get(red.indeks);
      const odluka = s ? (odluke[red.indeks] ?? "postojeci") : undefined;
      return {
        sekcijaId: red.sekcijaId,
        naziv: red.naziv,
        cena: red.cena,
        ...(odluka ? { odluka } : {}),
        ...(odluka === "postojeci" && s ? { postojeciId: s.kandidati[0].artikalId } : {}),
      };
    });
    setRadi(true);
    const ishod = await onPosalji(unos);
    setRadi(false);
    if (!ishod.ok) {
      setGreska(ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano);
      return;
    }
    if (ishod.vrednost.status === "slicno") {
      // The server answers by position in what was sent; keep the table's own indexes.
      setSlicno(ishod.vrednost.redovi.map((s) => ({ indeks: s.indeks, kandidati: s.kandidati })));
      setOdluke({});
      return;
    }
    const broj = ishod.vrednost.novih + ishod.vrednost.postojecih;
    resetuj();
    onOtvoreno(false);
    onDodato(broj);
  };

  const sviRedovi = provera?.ok ? provera.redovi : null;
  const slicnoPoTabeli = new Map(
    (slicno ?? []).flatMap((s) => {
      const red = sviRedovi?.[s.indeks];
      return red ? [[red.indeks, s] as const] : [];
    }),
  );

  const opstaGreska =
    provera && !provera.ok
      ? provera.razlog === "prazno"
        ? t.tabela.prazno
        : provera.razlog === "previse"
          ? fmt(t.tabela.previse, { n: MENU_STUDIO_MAX_QUICK_ROWS })
          : t.tabela.imaGresaka
      : null;

  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={promeniOtvoreno}
      naslov={t.tabela.naslov}
      opis={t.tabela.opis}
      sirina="siroka"
      podnozje={
        <>
          <Dugme vrsta="tiho" onClick={() => promeniOtvoreno(false)}>
            {t.tabela.otkazi}
          </Dugme>
          <Dugme vrsta="primarno" ucitava={radi} onClick={() => void posalji()} disabled={sekcije.length === 0}>
            {t.tabela.posalji}
          </Dugme>
        </>
      }
    >
      {sekcije.length === 0 ? (
        <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.tabela.bezSekcija}</p>
      ) : (
        <div className="grid gap-3" data-tabelarni-unos="">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,11rem)_var(--mp-meta)] gap-2 px-1 text-sm font-semibold text-[var(--mp-tekst-sporedni)] sm:grid"
          >
            <span>{t.tabela.naziv}</span>
            <span>{t.tabela.cena}</span>
            <span>{t.tabela.sekcija}</span>
            <span />
          </div>
          <ol className="grid gap-3 sm:gap-2">
            {redovi.map((red, indeks) => {
              const g = greskeReda.get(indeks);
              const s = slicnoPoTabeli.get(indeks);
              const n = indeks + 1;
              const greskaId = `${id}-g${indeks}`;
              const poruke = [
                g?.naziv ? t.brziUnos.nazivGreske[g.naziv] : null,
                g?.cena ? t.cena.greske[g.cena] : null,
                g?.sekcija ? t.tabela.sekcijaGreska : null,
                g && g.duplikat !== null ? fmt(t.tabela.duplikat, { n: g.duplikat + 1 }) : null,
              ].filter(Boolean);
              return (
                <li
                  key={indeks}
                  data-red-tabele={indeks}
                  className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border p-2 [--border:var(--mp-ivica)] sm:border-0 sm:p-0"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,11rem)_var(--mp-meta)]">
                    <input
                      aria-label={fmt(t.tabela.nazivReda, { n })}
                      autoComplete="off"
                      placeholder={t.tabela.naziv}
                      value={red.naziv}
                      aria-invalid={g?.naziv || (g && g.duplikat !== null) ? true : undefined}
                      aria-describedby={poruke.length ? greskaId : undefined}
                      onChange={(event) => izmeni(indeks, "naziv", event.target.value)}
                      className={poljeKlase}
                    />
                    <input
                      aria-label={fmt(t.tabela.cenaReda, { n })}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t.tabela.cena}
                      value={red.cena}
                      aria-invalid={g?.cena ? true : undefined}
                      aria-describedby={poruke.length ? greskaId : undefined}
                      onChange={(event) => izmeni(indeks, "cena", event.target.value)}
                      className={cn(poljeKlase, "text-right tabular-nums placeholder:text-left")}
                    />
                    <select
                      aria-label={fmt(t.tabela.sekcijaReda, { n })}
                      value={red.sekcijaId}
                      aria-invalid={g?.sekcija ? true : undefined}
                      onChange={(event) => izmeni(indeks, "sekcijaId", event.target.value)}
                      className={cn(poljeKlase, "col-span-1 pr-8")}
                    >
                      {sekcije.map((sekcija) => (
                        <option key={sekcija.id} value={sekcija.id}>
                          {sekcija.naziv}
                        </option>
                      ))}
                    </select>
                    <IkonicaDugme
                      ikonica={X}
                      oznaka={fmt(t.tabela.ukloniRed, { n })}
                      disabled={redovi.length === 1}
                      onClick={() => {
                        setRedovi((pre) => pre.filter((_, i) => i !== indeks));
                        setProvera(null);
                        setSlicno(null);
                      }}
                    />
                  </div>
                  {poruke.length ? (
                    <p id={greskaId} className="px-1 text-sm font-medium text-[var(--mp-opasnost)]">
                      {poruke.join(" ")}
                    </p>
                  ) : null}
                  {s ? (
                    <fieldset className="grid gap-1 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]">
                      <legend className="sr-only">{fmt(t.tabela.odluka, { naziv: red.naziv })}</legend>
                      <p aria-hidden="true" className="font-medium">
                        {fmt(t.tabela.odluka, { naziv: red.naziv.trim() })}
                      </p>
                      <span className="flex flex-wrap gap-x-4">
                        {(
                          [
                            ["postojeci", fmt(t.tabela.postojeciKandidat, { naziv: s.kandidati[0].naziv, cena: tekstCene(s.kandidati[0].cena) })],
                            ["novi", t.tabela.novi],
                            ["preskoci", t.tabela.preskoci],
                          ] as const
                        ).map(([vrednost, tekst]) => (
                          <label key={vrednost} className="flex min-h-[var(--mp-meta)] cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name={`${id}-odluka-${indeks}`}
                              value={vrednost}
                              checked={(odluke[indeks] ?? "postojeci") === vrednost}
                              onChange={() => setOdluke((pre) => ({ ...pre, [indeks]: vrednost }))}
                              className="size-5 accent-[var(--mp-mastilo)]"
                            />
                            {tekst}
                          </label>
                        ))}
                      </span>
                    </fieldset>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <Dugme
            vrsta="tiho"
            velicina="kompaktna"
            ikonica={Plus}
            className="justify-self-start"
            disabled={redovi.length >= MENU_STUDIO_MAX_QUICK_ROWS}
            onClick={() => setRedovi((pre) => [...pre, ...prazniRedovi(pre.at(-1)?.sekcijaId ?? pocetna, 1)])}
          >
            {t.tabela.dodajRed}
          </Dugme>
          {slicno ? (
            <div role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]">
              <p className="font-semibold">{t.tabela.slicnoNaslov}</p>
              <p>{t.tabela.slicnoOpis}</p>
            </div>
          ) : null}
          {opstaGreska ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {opstaGreska}
            </p>
          ) : null}
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

export function dodatoTekst(broj: number): string {
  return fmt(t.tabela.dodato[srPluralCategory(broj)], { n: broj });
}
