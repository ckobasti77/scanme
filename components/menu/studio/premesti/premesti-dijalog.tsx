"use client";

// ScanMe Menu V1 — `Premesti` (K11; master §13.4, K09 §4.4): the keyboard and
// screen-reader way to change the order. A dialog with two native selects —
// the section (for an article) and the place ("Na početak", "Posle: …") —
// opened from the drag handle, the row menu or the section menu. Focus starts
// on the first select, Escape closes, `Premesti` confirms; the result is
// announced by the work area and focus goes to the moved card.

import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioRed, StudioSekcija } from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../dijalog";

const t = menuStudioSr;

export type PremestiCilj =
  | { vrsta: "red"; red: StudioRed; sekcijaId: string }
  | { vrsta: "sekcija"; sekcija: StudioSekcija };

export type MestoOpcija = { indeks: number; tekst: string };

/**
 * The places of a list without the moved element: "Na početak" (0) and
 * "Posle: X" for each remaining element; the current place is marked.
 */
export function mestaZaPremestanje(nazivi: readonly string[], trenutni: number | null): MestoOpcija[] {
  const opcije: MestoOpcija[] = [{ indeks: 0, tekst: t.premesti.naPocetak }];
  nazivi.forEach((naziv, index) => opcije.push({ indeks: index + 1, tekst: fmt(t.premesti.posle, { naziv }) }));
  return opcije.map((opcija) =>
    opcija.indeks === trenutni ? { ...opcija, tekst: fmt(t.premesti.sada, { tekst: opcija.tekst }) } : opcija,
  );
}

const poljeKlase =
  "h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]";

export function PremestiDijalog({
  cilj,
  sekcije,
  onPremesti,
  onZatvori,
}: {
  cilj: PremestiCilj | null;
  /** The sections of the page (all rows, not a search result). */
  sekcije: readonly StudioSekcija[];
  /** Section and place (index in the target list without the moved element). */
  onPremesti: (sekcijaId: string, indeks: number) => Promise<boolean>;
  onZatvori: () => void;
}) {
  return (
    // The work area places focus itself: on the moved card, or back on the card or section
    // (the menu item that opened the dialog is gone by then).
    <StudioDijalog
      bezVracanjaFokusa
      otvoreno={cilj !== null}
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={
        cilj
          ? cilj.vrsta === "red"
            ? fmt(t.premesti.naslov, { naziv: cilj.red.artikal.naziv })
            : fmt(t.premesti.naslovSekcije, { naziv: cilj.sekcija.naziv })
          : ""
      }
      opis={cilj?.vrsta === "sekcija" ? t.premesti.opisSekcije : t.premesti.opis}
    >
      {cilj ? (
        <PremestiSadrzaj
          key={cilj.vrsta === "red" ? cilj.red.prikazId : cilj.sekcija.id}
          cilj={cilj}
          sekcije={sekcije}
          onPremesti={onPremesti}
          onZatvori={onZatvori}
        />
      ) : null}
    </StudioDijalog>
  );
}

function PremestiSadrzaj({
  cilj,
  sekcije,
  onPremesti,
  onZatvori,
}: {
  cilj: PremestiCilj;
  sekcije: readonly StudioSekcija[];
  onPremesti: (sekcijaId: string, indeks: number) => Promise<boolean>;
  onZatvori: () => void;
}) {
  const id = useId();
  const pocetnaSekcija = cilj.vrsta === "red" ? cilj.sekcijaId : cilj.sekcija.id;
  const [sekcijaId, setSekcijaId] = useState(pocetnaSekcija);
  const [radi, setRadi] = useState(false);

  // The list the element lands in, without the element itself.
  let nazivi: string[];
  let trenutni: number | null;
  if (cilj.vrsta === "red") {
    const lista = sekcije.find((sekcija) => sekcija.id === sekcijaId)?.redovi ?? [];
    const ostali = lista.filter((red) => red.prikazId !== cilj.red.prikazId);
    nazivi = ostali.map((red) => red.artikal.naziv);
    const sada = lista.findIndex((red) => red.prikazId === cilj.red.prikazId);
    trenutni = sada === -1 ? null : sada;
  } else {
    nazivi = sekcije.filter((sekcija) => sekcija.id !== cilj.sekcija.id).map((sekcija) => sekcija.naziv);
    trenutni = sekcije.findIndex((sekcija) => sekcija.id === cilj.sekcija.id);
  }
  const opcije = mestaZaPremestanje(nazivi, trenutni);
  // Default: the current place; in another section, its end.
  const podrazumevano = trenutni ?? nazivi.length;
  const [mesto, setMesto] = useState<{ sekcijaId: string; indeks: number }>({ sekcijaId, indeks: podrazumevano });
  const izabrano = mesto.sekcijaId === sekcijaId ? mesto.indeks : podrazumevano;

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setRadi(true);
        const uspeh = await onPremesti(cilj.vrsta === "red" ? sekcijaId : cilj.sekcija.id, izabrano);
        setRadi(false);
        if (uspeh) onZatvori();
      }}
    >
      {cilj.vrsta === "red" ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-sekcija`} className="text-sm font-medium">
            {t.premesti.sekcija}
          </label>
          <select
            id={`${id}-sekcija`}
            data-premesti-sekcija=""
            value={sekcijaId}
            onChange={(event) => setSekcijaId(event.target.value)}
            className={poljeKlase}
          >
            {sekcije.map((sekcija) => (
              <option key={sekcija.id} value={sekcija.id}>
                {sekcija.naziv}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-mesto`} className="text-sm font-medium">
          {t.premesti.mesto}
        </label>
        <select
          id={`${id}-mesto`}
          data-premesti-mesto=""
          value={izabrano}
          onChange={(event) => setMesto({ sekcijaId, indeks: Number(event.target.value) })}
          className={poljeKlase}
        >
          {opcije.map((opcija) => (
            <option key={opcija.indeks} value={opcija.indeks}>
              {opcija.tekst}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 [--border:var(--mp-ivica)]">
        <Dugme vrsta="tiho" onClick={onZatvori}>
          {t.premesti.otkazi}
        </Dugme>
        <Dugme vrsta="primarno" type="submit" ucitava={radi} data-premesti-potvrdi="">
          {t.premesti.potvrdi}
        </Dugme>
      </div>
    </form>
  );
}
