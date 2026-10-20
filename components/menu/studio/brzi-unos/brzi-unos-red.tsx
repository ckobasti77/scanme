"use client";

// ScanMe Menu V1 — quick entry under a section (K10; master §13.4: "Komanda
// `Dodaj stavku u ovu kategoriju` odmah dodaje prazan red u izabranu sekciju,
// sa minimalnim poljima `Naziv` i `Cena`", then `Dodaj još jedan`). Enter in
// the name moves to the price, Enter in the price adds the article. When an
// article with the same name exists, the owner chooses: the same article (one
// product, one price, master §5.1–§5.2) or a new one.

import { Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { BrziUnosRezultat, StudioIshod, StudioKandidat } from "@/lib/menu/studio/model";
import { proveriBrziRed, type BrziRedProvera } from "@/lib/menu/studio/quick-add";
import { Dugme } from "../../zajednicko/dugme";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;

type Faza =
  | { vrsta: "zatvoreno" }
  | { vrsta: "unos" }
  | { vrsta: "dodato"; naziv: string }
  | { vrsta: "slicno"; kandidati: StudioKandidat[]; naziv: string; cena: number | null };

export function BrziUnosRed({
  sekcija,
  otvoreno,
  onemoguceno,
  onOtvori,
  onZatvori,
  onDodaj,
  onDodajPostojeci,
}: {
  sekcija: { id: string; naziv: string };
  /** Opened from outside (`+ Dodaj → Artikal`). */
  otvoreno: boolean;
  onemoguceno: boolean;
  onOtvori: () => void;
  onZatvori: () => void;
  onDodaj: (
    unos: { naziv: string; cena: number | null },
    dozvoliDuplikat: boolean,
  ) => Promise<StudioIshod<BrziUnosRezultat>>;
  onDodajPostojeci: (artikalId: string) => Promise<StudioIshod>;
}) {
  const id = useId();
  const [faza, setFaza] = useState<Faza>({ vrsta: "zatvoreno" });
  const [naziv, setNaziv] = useState("");
  const [cena, setCena] = useState("");
  const [provera, setProvera] = useState<BrziRedProvera | null>(null);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const nazivRef = useRef<HTMLInputElement>(null);
  const cenaRef = useRef<HTMLInputElement>(null);
  const josRef = useRef<HTMLButtonElement>(null);
  const slicnoRef = useRef<HTMLButtonElement>(null);
  const otvoriRef = useRef<HTMLButtonElement>(null);
  // Closing the row gives focus back to "Dodaj stavku u ovu kategoriju".
  const vratiFokus = useRef(false);

  // The parent decides which section has the open row (one at a time); the
  // row keeps only what happened inside it (added, similar found).
  const aktivno = otvoreno;
  const prikaz: Faza = !otvoreno ? { vrsta: "zatvoreno" } : faza.vrsta === "zatvoreno" ? { vrsta: "unos" } : faza;

  useEffect(() => {
    if (prikaz.vrsta === "unos") nazivRef.current?.focus();
    else if (prikaz.vrsta === "dodato") josRef.current?.focus();
    else if (prikaz.vrsta === "slicno") slicnoRef.current?.focus();
    else if (vratiFokus.current) {
      vratiFokus.current = false;
      otvoriRef.current?.focus();
    }
  }, [prikaz.vrsta]);

  const zatvori = () => {
    vratiFokus.current = true;
    setFaza({ vrsta: "zatvoreno" });
    setNaziv("");
    setCena("");
    setProvera(null);
    setGreska(null);
    onZatvori();
  };

  const otvori = () => {
    setFaza({ vrsta: "zatvoreno" });
    setNaziv("");
    setCena("");
    setProvera(null);
    setGreska(null);
    onOtvori();
  };

  const posalji = async (dozvoliDuplikat: boolean, vrednost?: { naziv: string; cena: number | null }) => {
    let unos = vrednost ?? null;
    if (!unos) {
      const p = proveriBrziRed({ naziv, cena });
      setProvera(p);
      if (!p.ok) {
        if (p.naziv === null) cenaRef.current?.focus();
        else nazivRef.current?.focus();
        return;
      }
      unos = { naziv: p.naziv, cena: p.cena };
    }
    setRadi(true);
    setGreska(null);
    const ishod = await onDodaj(unos, dozvoliDuplikat);
    setRadi(false);
    if (!ishod.ok) {
      setGreska(ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano);
      return;
    }
    if (ishod.vrednost.status === "slicno") {
      setFaza({ vrsta: "slicno", kandidati: ishod.vrednost.kandidati, naziv: unos.naziv, cena: unos.cena });
      return;
    }
    setNaziv("");
    setCena("");
    setProvera(null);
    setFaza({ vrsta: "dodato", naziv: unos.naziv });
  };

  const postojeci = async (artikalId: string, nazivArtikla: string) => {
    setRadi(true);
    const ishod = await onDodajPostojeci(artikalId);
    setRadi(false);
    if (!ishod.ok) {
      setGreska(ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano);
      return;
    }
    setFaza({ vrsta: "dodato", naziv: nazivArtikla });
  };

  if (!aktivno || onemoguceno) {
    return (
      <Dugme
        ref={otvoriRef}
        vrsta="tiho"
        velicina="kompaktna"
        ikonica={Plus}
        disabled={onemoguceno}
        onClick={otvori}
        data-brzi-unos-otvori=""
        className="mt-1 w-full justify-start rounded-[var(--mp-radius-kontrola)] [--button-radius:var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 text-[var(--mp-tekst-sporedni)] hover:text-[var(--mp-tekst)]"
      >
        {t.brziUnos.dodajStavku}
      </Dugme>
    );
  }

  if (prikaz.vrsta === "dodato") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" data-brzi-unos="dodato">
        <p role="status" className="text-sm text-[var(--mp-tekst-sporedni)]">
          {fmt(t.brziUnos.dodato, { naziv: prikaz.naziv })}
        </p>
        <Dugme ref={josRef} vrsta="sekundarno" velicina="kompaktna" ikonica={Plus} onClick={otvori} data-brzi-unos-jos="">
          {t.brziUnos.dodajJos}
        </Dugme>
        <Dugme vrsta="tiho" velicina="kompaktna" onClick={zatvori}>
          {t.brziUnos.odustani}
        </Dugme>
      </div>
    );
  }

  if (prikaz.vrsta === "slicno") {
    const prvi = prikaz.kandidati[0];
    return (
      <div
        className="mt-1 grid gap-2 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)] p-3 text-sm"
        data-brzi-unos="slicno"
      >
        <p role="status">{fmt(t.brziUnos.slicno, { naziv: prvi.naziv, cena: tekstCene(prvi.cena) })}</p>
        <span className="flex flex-wrap gap-2">
          <Dugme
            ref={slicnoRef}
            vrsta="primarno"
            velicina="kompaktna"
            ucitava={radi}
            onClick={() => postojeci(prvi.artikalId, prvi.naziv)}
          >
            {t.brziUnos.dodajPostojeci}
          </Dugme>
          <Dugme
            vrsta="sekundarno"
            velicina="kompaktna"
            disabled={radi}
            onClick={() => posalji(true, { naziv: prikaz.naziv, cena: prikaz.cena })}
          >
            {t.brziUnos.napraviNov}
          </Dugme>
          <Dugme vrsta="tiho" velicina="kompaktna" onClick={zatvori}>
            {t.brziUnos.odustani}
          </Dugme>
        </span>
        {greska ? <p role="alert" className="font-medium text-[var(--mp-opasnost)]">{greska}</p> : null}
      </div>
    );
  }

  const nazivGreska = provera && !provera.ok && provera.naziv ? t.brziUnos.nazivGreske[provera.naziv] : null;
  const cenaGreska = provera && !provera.ok && provera.cena ? t.cena.greske[provera.cena] : null;

  return (
    <form
      noValidate
      data-brzi-unos="unos"
      aria-label={fmt(t.brziUnos.noviArtikal, { sekcija: sekcija.naziv })}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void posalji(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          zatvori();
        }
      }}
      className="mt-1 grid gap-2 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] p-2"
    >
      <div className="flex flex-wrap items-start gap-2">
        <label className="grid min-w-[10rem] flex-1 gap-1">
          <span className="sr-only">{t.brziUnos.nazivOznaka}</span>
          <input
            ref={nazivRef}
            id={`${id}-naziv`}
            name="naziv"
            autoComplete="off"
            enterKeyHint="next"
            placeholder={t.brziUnos.naziv}
            value={naziv}
            aria-invalid={nazivGreska ? true : undefined}
            aria-describedby={nazivGreska ? `${id}-naziv-greska` : `${id}-pomoc`}
            onChange={(event) => setNaziv(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                cenaRef.current?.focus();
              }
            }}
            className="h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)]"
          />
        </label>
        <label className="relative grid w-[7.5rem] gap-1">
          <span className="sr-only">{t.brziUnos.cenaOznaka}</span>
          <input
            ref={cenaRef}
            name="cena"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={t.brziUnos.cena}
            value={cena}
            aria-invalid={cenaGreska ? true : undefined}
            aria-describedby={cenaGreska ? `${id}-cena-greska` : undefined}
            onChange={(event) => setCena(event.target.value)}
            className="h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] pl-3 pr-10 text-right text-[0.9375rem] tabular-nums text-[var(--mp-tekst)] placeholder:text-left placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)]"
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 text-xs font-medium text-[var(--mp-tekst-sporedni)]">
            {t.red.rsd}
          </span>
        </label>
        <span className="flex gap-2">
          <Dugme type="submit" vrsta="primarno" velicina="kompaktna" ucitava={radi}>
            {t.brziUnos.dodaj}
          </Dugme>
          <Dugme vrsta="tiho" velicina="kompaktna" onClick={zatvori}>
            {t.brziUnos.odustani}
          </Dugme>
        </span>
      </div>
      <p id={`${id}-pomoc`} className="px-1 text-xs text-[var(--mp-tekst-sporedni)]">
        {t.brziUnos.pomoc}
      </p>
      {nazivGreska ? (
        <p id={`${id}-naziv-greska`} role="alert" className="px-1 text-sm font-medium text-[var(--mp-opasnost)]">
          {nazivGreska}
        </p>
      ) : null}
      {cenaGreska ? (
        <p id={`${id}-cena-greska`} role="alert" className="px-1 text-sm font-medium text-[var(--mp-opasnost)]">
          {cenaGreska}
        </p>
      ) : null}
      {greska ? (
        <p role="alert" className="px-1 text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
    </form>
  );
}
