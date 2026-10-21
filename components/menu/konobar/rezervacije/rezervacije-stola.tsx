"use client";

// ScanMe Menu V1 (K25) — the reservations of ONE table in its detail (master
// §10.5; plan K24-15, §2.5 "Detalj stola"): today's reservations bound to the
// table, earliest first — an accepted one with `Gosti su stigli` and `Otvori`
// (the time, a neutral "kasni 03:12" or the red "kasni 17:00" after the hold), an
// arrived one with `Otvori`, a cancelled one as "Rezervacija otkazana · gost ·
// 19:12" for two more hours — and `Poveži rezervaciju`, which lists today's
// accepted reservations that still have no table. The waiter chooses one; the
// system never binds a table by itself. The section is not drawn when the table
// has nothing to show and nothing waits for a table.

import { Armchair } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { reservationTiming } from "@/lib/menu/reservation-late";
import { reservationsOfTable, unboundToday, type ReservationRow } from "@/lib/menu/reservation-queue";
import { Dugme } from "../../zajednicko/dugme";
import { StatusRezervacije, VrstaIkonica } from "../vrsta";
import { KasnjenjeRezervacije } from "./kasnjenje";
import { gostiTekst, terminSaGostima, terminTekst } from "./tekst";

const t = menuKonobarSr.rezervacije;

function RezervacijaStola({
  red,
  sadaMs,
  holdMin,
  radi,
  radnjeIskljucene,
  razlogId,
  onOtvori,
  onStigli,
}: {
  red: ReservationRow;
  sadaMs: number;
  holdMin: number;
  radi: boolean;
  radnjeIskljucene: boolean;
  razlogId: string | undefined;
  onOtvori(): void;
  onStigli(): void;
}) {
  const termin = terminTekst(red.requestedAt, sadaMs);
  const ko = red.cancelledBy ? t.sto.ko[red.cancelledBy] : null;
  return (
    <article
      data-rezervacija={red.id}
      data-status={red.status}
      className="grid gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-xs)] [--border:var(--mp-ivica)]"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <VrstaIkonica vrsta="reservation" />
        <div className="grid min-w-0 gap-1">
          <h3 className="break-words text-[1.125rem] font-bold leading-snug text-[var(--mp-tekst)]">{red.guestName}</h3>
          <p className="text-base font-semibold tabular-nums text-[var(--mp-tekst)]">{terminSaGostima(red, sadaMs)}</p>
          {red.status === "accepted" ? <KasnjenjeRezervacije requestedAt={red.requestedAt} holdMin={holdMin} sadaMs={sadaMs} /> : null}
          {red.status === "cancelled" && red.cancelledAt !== null ? (
            <p className="text-[0.9375rem] font-semibold text-[var(--mp-tekst)]">
              {fmt(t.sto.otkazana, { ko: ko ?? t.sto.ko.staff, vreme: clockTime(red.cancelledAt) })}
            </p>
          ) : null}
          <div className="pt-0.5">
            <StatusRezervacije status={red.status} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Arrival is one tap: offered once the time is near (not for a booking later today or tomorrow). */}
        {red.status === "accepted" && reservationTiming(red.requestedAt, holdMin, sadaMs).phase !== "kasnije" ? (
          <Dugme
            vrsta="primarno"
            ucitava={radi}
            disabled={radnjeIskljucene}
            aria-describedby={razlogId}
            aria-label={fmt(t.radnjaCitac, { radnja: t.detalj.stigli, ime: red.guestName, termin })}
            onClick={onStigli}
            className="min-h-12 px-4 text-base"
          >
            {t.detalj.stigli}
          </Dugme>
        ) : null}
        <Dugme
          vrsta="sekundarno"
          aria-label={fmt(t.otvoriCitac, { ime: red.guestName, termin })}
          onClick={onOtvori}
          className="min-h-12 px-4 text-base"
        >
          {t.radnja.otvori}
        </Dugme>
      </div>
    </article>
  );
}

export function RezervacijeStola({
  mestoId,
  redovi,
  sadaMs,
  holdMin,
  radiId,
  radnjeIskljucene,
  razlogId,
  onOtvori,
  onStigli,
  onPovezi,
  pocetnoPovezivanje = false,
}: {
  mestoId: string;
  /** Every reservation the panel holds (the table's own and the unbound ones are picked here). */
  redovi: readonly ReservationRow[];
  sadaMs: number;
  holdMin: number;
  /** The reservation whose action is in flight. */
  radiId: string | null;
  radnjeIskljucene: boolean;
  /** The id of the line that says why actions wait (offline). */
  razlogId: string | undefined;
  onOtvori(id: string): void;
  onStigli(red: ReservationRow): void;
  /** Binds the reservation to this table (an explicit choice). */
  onPovezi(red: ReservationRow): void;
  /** Izlog and tests: the list of reservations to bind starts open. */
  pocetnoPovezivanje?: boolean;
}) {
  const [povezivanje, setPovezivanje] = useState(pocetnoPovezivanje);
  const njegove = reservationsOfTable(redovi, mestoId, sadaMs);
  const nevezane = unboundToday(redovi, sadaMs);
  if (njegove.length === 0 && nevezane.length === 0) return null;
  return (
    <section aria-labelledby="sto-rezervacija" className="grid gap-3" data-sto-rezervacije>
      <h2 id="sto-rezervacija" className="text-lg font-bold text-[var(--mp-tekst)]">
        {t.sto.naslov}
      </h2>

      {njegove.length > 0 ? (
        <ul className="grid gap-3">
          {njegove.map((red) => (
            <li key={red.id}>
              <RezervacijaStola
                red={red}
                sadaMs={sadaMs}
                holdMin={holdMin}
                radi={radiId === red.id}
                radnjeIskljucene={radnjeIskljucene}
                razlogId={razlogId}
                onOtvori={() => onOtvori(red.id)}
                onStigli={() => onStigli(red)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {nevezane.length === 0 ? (
        <p className="text-base text-[var(--mp-tekst-sporedni)]">{t.sto.nemaZaPovezivanje}</p>
      ) : (
        <div className="grid gap-3">
          <div>
            <Dugme
              vrsta="sekundarno"
              ikonica={Armchair}
              aria-expanded={povezivanje}
              aria-describedby={razlogId}
              disabled={radnjeIskljucene}
              onClick={() => setPovezivanje((staro) => !staro)}
              className="min-h-12"
            >
              {t.sto.poveziRezervaciju}
            </Dugme>
          </div>
          {povezivanje ? (
            <div className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-3 [--border:var(--mp-ivica)]" data-povezi-rezervaciju>
              <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.sto.poveziOpis}</p>
              <ul className="grid gap-2">
                {nevezane.map((red) => (
                  <li key={red.id}>
                    <button
                      type="button"
                      disabled={radnjeIskljucene || radiId !== null}
                      data-povezi={red.id}
                      aria-label={fmt(t.sto.poveziCitac, { ime: red.guestName, termin: terminTekst(red.requestedAt, sadaMs) })}
                      onClick={() => onPovezi(red)}
                      className="grid min-h-12 w-full gap-0.5 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 py-2 text-left [--border:var(--mp-ivica-kontrole)] hover:bg-[var(--mp-povrsina-utisana)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="break-words text-base font-bold text-[var(--mp-tekst)]">{red.guestName}</span>
                      <span className="text-[0.9375rem] tabular-nums text-[var(--mp-tekst-sporedni)]">
                        {terminTekst(red.requestedAt, sadaMs)} · {gostiTekst(red.partySize)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
