"use client";

// ScanMe Menu V1 — the combo's own section in the article detail (K16; master
// §5.4): the components with quantities, the "Proveri cenu" warning and the
// edit mode for the component list. The combo price is typed by hand in the
// detail's price field; the sum of the components below is information only and
// there is no button that applies it as the price.

import { PencilLine, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_MAX_COMBO_COMPONENTS, MENU_MAX_COMBO_QUANTITY } from "@/lib/menu/limits";
import { istiSastav, komboZbir, parseKolicinaSastojka, proveriSastav } from "@/lib/menu/studio/combo-form";
import type { StudioArtikal, StudioIshod, StudioKandidat, StudioKombo, StudioRadnje } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { POLJE_KLASA } from "../artikal/polja";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";
import { IzborSastojaka } from "./izbor-sastojaka";
import { ProveriCenu } from "./proveri-cenu";

const t = menuStudioSr.posebno.kombo;

type Stavka = { artikalId: string; naziv: string; cena: number | null; tekst: string };

function porukaIshoda(ishod: Exclude<StudioIshod, { ok: true }>): string {
  return (ishod.vrsta === "greska" ? porukaGreske(ishod.kod) : null) ?? menuStudioSr.red.nijeSacuvano;
}

export function KomboDetalj({
  artikal,
  kombo,
  cena,
  radnje,
  mozeUredjivanje,
  najavi,
  onNovaCena,
}: {
  /** The combo itself. */
  artikal: StudioArtikal;
  kombo: StudioKombo;
  /** The price shown now (a queued value included). */
  cena: number | null;
  radnje: Pick<StudioRadnje, "postaviSastav" | "zadrziCenuKomboa" | "traziArtikle">;
  mozeUredjivanje: boolean;
  /** Announces a result to screen readers. */
  najavi: (tekst: string) => void;
  /** "Upiši novu cenu": the parent moves focus to the price field. */
  onNovaCena: () => void;
}) {
  const id = useId();
  const [stavke, setStavke] = useState<Stavka[] | null>(null);
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  const izmeniRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const bioUredjivanje = useRef(false);
  const uredjuje = stavke !== null && mozeUredjivanje;

  // Focus follows the mode: into the list on "Izmeni sastav", back to the button on leaving.
  useEffect(() => {
    if (uredjuje) {
      listaRef.current?.querySelector("input")?.focus();
      bioUredjivanje.current = true;
    } else if (bioUredjivanje.current) {
      bioUredjivanje.current = false;
      izmeniRef.current?.focus();
    }
  }, [uredjuje]);

  const sacuvano = useMemo(
    () => kombo.sastojci.map((s) => ({ artikalId: s.artikalId, kolicina: s.kolicina })),
    [kombo.sastojci],
  );
  const zbir = komboZbir(kombo.sastojci, cena);

  const zadrzi = async () => {
    const ishod = await radnje.zadrziCenuKomboa(artikal.id);
    if (ishod.ok) {
      setPoruka(null);
      najavi(t.zadrzano);
    } else {
      setPoruka(porukaIshoda(ishod));
    }
  };

  const pocni = () => {
    setPoruka(null);
    setStavke(kombo.sastojci.map((s) => ({ artikalId: s.artikalId, naziv: s.naziv, cena: s.cena, tekst: String(s.kolicina) })));
  };

  const odustani = () => {
    setPoruka(null);
    setStavke(null);
  };

  // What the edit would save, and why it cannot be saved yet.
  const izmenjeno = stavke?.map((s) => ({ artikalId: s.artikalId, kolicina: parseKolicinaSastojka(s.tekst) ?? 0 })) ?? [];
  const greska = stavke ? proveriSastav(izmenjeno) : null;
  const nepromenjeno = stavke ? istiSastav(izmenjeno, sacuvano) : true;
  const neispravnaKolicina = stavke?.some((s) => parseKolicinaSastojka(s.tekst) === null) ?? false;
  const greskaListe =
    greska === null || (greska === "kolicina" && neispravnaKolicina)
      ? null
      : greska === "previse"
        ? fmt(t.greske.previse, { n: MENU_MAX_COMBO_COMPONENTS })
        : greska === "kolicina"
          ? fmt(t.greske.kolicina, { n: MENU_MAX_COMBO_QUANTITY })
          : t.greske[greska];

  const sacuvaj = async () => {
    if (!stavke || greska !== null) return;
    setRadi(true);
    setPoruka(null);
    const ishod = await radnje.postaviSastav(artikal.id, izmenjeno);
    setRadi(false);
    if (ishod.ok) {
      setStavke(null);
      najavi(t.sacuvano);
    } else {
      setPoruka(porukaIshoda(ishod));
    }
  };

  const dodaj = (kandidat: StudioKandidat) =>
    setStavke((pre) =>
      pre && !pre.some((s) => s.artikalId === kandidat.artikalId)
        ? [...pre, { artikalId: kandidat.artikalId, naziv: kandidat.naziv, cena: kandidat.cena, tekst: "1" }]
        : pre,
    );

  const vec = useMemo(() => new Set((stavke ?? []).map((s) => s.artikalId)), [stavke]);
  const cenaTekst = (c: number | null) => (c === null ? t.bezCene : tekstCene(c));

  return (
    <section
      aria-labelledby={`${id}-naslov`}
      data-kombo-detalj=""
      className="grid gap-4 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)] sm:p-5"
    >
      <div className="grid gap-1">
        <h2 id={`${id}-naslov`} className="text-base font-semibold">
          {t.naslov}
        </h2>
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
      </div>

      {kombo.proveri ? (
        <ProveriCenu proveri={kombo.proveri} cena={cena} mozeUredjivanje={mozeUredjivanje} onZadrzi={zadrzi} onNovaCena={onNovaCena} />
      ) : null}

      {uredjuje && stavke ? (
        <div className="grid gap-4">
          <ul ref={listaRef} className="grid divide-y rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]">
            {stavke.map((stavka, indeks) => {
              const nevazeca = parseKolicinaSastojka(stavka.tekst) === null;
              return (
                <li
                  key={stavka.artikalId}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto] [--border:var(--mp-ivica)]"
                >
                  <span className="col-span-3 break-words text-[0.9375rem] font-medium sm:col-span-1">{stavka.naziv}</span>
                  <span className="text-sm tabular-nums text-[var(--mp-tekst-sporedni)] sm:text-right">
                    <span className="sr-only">{t.redovnaCena}: </span>
                    {cenaTekst(stavka.cena)}
                  </span>
                  <label className="justify-self-end">
                    <span className="sr-only">{fmt(t.kolicinaOznaka, { naziv: stavka.naziv })}</span>
                    <input
                      value={stavka.tekst}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={2}
                      aria-invalid={nevazeca ? true : undefined}
                      aria-describedby={nevazeca ? `${id}-k${indeks}` : undefined}
                      onChange={(event) => {
                        const tekst = event.target.value;
                        setStavke((pre) => pre && pre.map((s, i) => (i === indeks ? { ...s, tekst } : s)));
                      }}
                      className={cn(POLJE_KLASA, "h-[var(--mp-meta)] w-[4.5rem] text-center tabular-nums")}
                    />
                  </label>
                  <IkonicaDugme
                    ikonica={X}
                    oznaka={fmt(t.ukloni, { naziv: stavka.naziv })}
                    onClick={() => setStavke((pre) => pre && pre.filter((s) => s.artikalId !== stavka.artikalId))}
                  />
                  {nevazeca ? (
                    <p id={`${id}-k${indeks}`} className="col-span-full text-sm font-medium text-[var(--mp-opasnost)]">
                      {fmt(t.greske.kolicina, { n: MENU_MAX_COMBO_QUANTITY })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {greskaListe ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {greskaListe}
            </p>
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t.dodajNaslov}</h3>
            <IzborSastojaka vec={vec} onDodaj={dodaj} traziArtikle={radnje.traziArtikle} komboId={artikal.id} />
          </div>

          {poruka ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {poruka}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Dugme vrsta="tiho" onClick={odustani} className="w-full sm:w-auto">
              {t.otkazi}
            </Dugme>
            <Dugme
              vrsta="primarno"
              ucitava={radi}
              disabled={greska !== null || nepromenjeno}
              onClick={() => void sacuvaj()}
              className="w-full sm:w-auto"
              data-sacuvaj-sastav=""
            >
              {t.sacuvaj}
            </Dugme>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1fr)_5rem_9rem] gap-x-3 px-3 pb-2 text-sm font-semibold text-[var(--mp-tekst-sporedni)] sm:grid"
            >
              <span>{t.artikal}</span>
              <span>{t.kolicina}</span>
              <span className="text-right">{t.redovnaCena}</span>
            </div>
            <ul className="grid divide-y rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]">
              {kombo.sastojci.map((s) => (
                <li
                  key={s.key}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_5rem_9rem] [--border:var(--mp-ivica)]"
                >
                  <span className="col-span-2 break-words text-[0.9375rem] font-medium sm:col-span-1">{s.naziv}</span>
                  <span className="text-sm tabular-nums text-[var(--mp-tekst-sporedni)] sm:text-[0.9375rem] sm:text-[var(--mp-tekst)]">
                    <span className="sr-only">{t.kolicina}: </span>× {s.kolicina}
                  </span>
                  <span className="text-right text-sm tabular-nums text-[var(--mp-tekst-sporedni)] sm:text-[0.9375rem] sm:text-[var(--mp-tekst)]">
                    <span className="sr-only">{t.redovnaCena}: </span>
                    {cenaTekst(s.cena)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {kombo.sastojci.length > 0 ? (
            <div className="grid gap-1">
              <p className="text-[0.9375rem] font-medium tabular-nums">
                {fmt(zbir.potpun ? t.zbir : t.zbirNepotpun, { cena: tekstCene(zbir.zbir) })}
              </p>
              {zbir.razlika !== null ? (
                <p className="text-[0.9375rem]">
                  {zbir.razlika < 0
                    ? fmt(t.usteda, { iznos: tekstCene(Math.abs(zbir.razlika)) })
                    : zbir.razlika > 0
                      ? fmt(t.skuplje, { iznos: tekstCene(zbir.razlika) })
                      : t.isto}
                </p>
              ) : null}
              <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.samoInfo}</p>
            </div>
          ) : null}

          {poruka ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {poruka}
            </p>
          ) : null}

          {mozeUredjivanje ? (
            <div>
              <Dugme ref={izmeniRef} vrsta="sekundarno" ikonica={PencilLine} onClick={pocni} className="w-full sm:w-auto" data-izmeni-sastav="">
                {t.izmeni}
              </Dugme>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
