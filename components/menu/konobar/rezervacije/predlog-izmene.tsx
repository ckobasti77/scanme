"use client";

// ScanMe Menu V1 (K25) — "Predloži izmenu" (master §11.3; plan K24-4): the
// staff propose another date and time (a date select and a time select on the
// 15-minute grid, in the next 60 days — not limited to the working hours, the
// staff decide) and an optional short message for the guest (at most 300
// characters). Saving stores the proposal; the staff then tell the guest by
// phone or e-mail, and press `Gost prihvata predlog` when the guest agrees.
// Nothing here messages the guest.

import { useId, useMemo, useState, type FormEvent } from "react";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { dateKeyLabel } from "@/lib/menu/reservation-time";
import { MENU_TEXT } from "@/lib/menu/limits";
import { Dugme } from "../../zajednicko/dugme";
import { predlogDatumi, predlogVremena, prviPredlog } from "./predlog-vreme";
import { DATUM_OZNAKE } from "./tekst";

const t = menuKonobarSr.rezervacije.predlog;

const POLJE =
  "min-h-12 w-full rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] disabled:opacity-60";

export function PredlogIzmene({
  zahtevaniTermin,
  sadaMs,
  radi,
  iskljuceno,
  onSacuvaj,
  onOdustani,
}: {
  /** The term the guest asked for: the form starts at the first time after it. */
  zahtevaniTermin: number;
  sadaMs: number;
  /** The save is in flight. */
  radi: boolean;
  /** Offline: saving waits for the connection. */
  iskljuceno: boolean;
  onSacuvaj(proposedAt: number, poruka: string | null): void;
  onOdustani(): void;
}) {
  const id = useId();
  // The lists change once a minute at most (the panel clock ticks every second).
  const sada = Math.floor(sadaMs / 60_000) * 60_000;
  const [pocetak] = useState(() => prviPredlog(sada, zahtevaniTermin));
  const datumi = useMemo(() => predlogDatumi(sada), [sada]);
  const [izabraniDatum, setDatum] = useState(pocetak?.datum ?? datumi[0] ?? "");
  const [vreme, setVreme] = useState(pocetak?.vreme ?? "");
  const [poruka, setPoruka] = useState("");
  // A day that ran out of times meanwhile (late at night) falls back to the first day left.
  const datum = datumi.includes(izabraniDatum) ? izabraniDatum : (datumi[0] ?? "");
  const vremena = useMemo(() => (datum ? predlogVremena(datum, sada) : []), [datum, sada]);
  // A time that does not exist on the chosen day falls back to the first one that does.
  const izabrano = vremena.find((slot) => slot.vreme === vreme) ?? vremena[0] ?? null;

  function posalji(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!izabrano || radi || iskljuceno) return;
    const tekst = poruka.replace(/\s+/g, " ").trim();
    onSacuvaj(izabrano.epoch, tekst.length > 0 ? tekst : null);
  }

  return (
    <form
      onSubmit={posalji}
      aria-labelledby={`${id}-naslov`}
      data-predlog-izmene
      className="grid gap-4 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-4 [--border:var(--mp-ivica)]"
    >
      <div className="grid gap-1">
        <h2 id={`${id}-naslov`} className="text-lg font-bold text-[var(--mp-tekst)]">
          {t.naslov}
        </h2>
        <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
      </div>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-datum`} className="text-base font-semibold text-[var(--mp-tekst)]">
            {t.datum}
          </label>
          <select id={`${id}-datum`} value={datum} onChange={(event) => setDatum(event.target.value)} disabled={radi} className={POLJE}>
            {datumi.map((kljuc) => (
              <option key={kljuc} value={kljuc}>
                {dateKeyLabel(kljuc, sadaMs, DATUM_OZNAKE)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-vreme`} className="text-base font-semibold text-[var(--mp-tekst)]">
            {t.vreme}
          </label>
          <select
            id={`${id}-vreme`}
            value={izabrano?.vreme ?? ""}
            onChange={(event) => setVreme(event.target.value)}
            disabled={radi}
            className={`${POLJE} tabular-nums`}
          >
            {vremena.map((slot) => (
              <option key={slot.vreme} value={slot.vreme}>
                {slot.vreme}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-poruka`} className="text-base font-semibold text-[var(--mp-tekst)]">
          {t.poruka}
        </label>
        <textarea
          id={`${id}-poruka`}
          value={poruka}
          onChange={(event) => setPoruka(event.target.value)}
          maxLength={MENU_TEXT.reservationProposalNote}
          rows={3}
          placeholder={t.porukaPrimer}
          disabled={radi}
          className="min-h-24 w-full resize-y rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 py-2.5 text-base text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] placeholder:text-[var(--mp-tekst-sporedni)] disabled:opacity-60"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Dugme vrsta="sekundarno" onClick={onOdustani} disabled={radi} className="min-h-12">
          {t.odustani}
        </Dugme>
        <Dugme type="submit" vrsta="primarno" ucitava={radi} disabled={iskljuceno || izabrano === null} className="min-h-12 whitespace-normal">
          {t.sacuvaj}
        </Dugme>
      </div>
    </form>
  );
}
