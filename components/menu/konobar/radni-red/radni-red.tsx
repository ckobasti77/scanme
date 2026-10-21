"use client";

// ScanMe Menu V1 (K22, K25) — the work queue (master §10.2, §8.4; mockup 10):
// what is next and how long it has waited. Filters `Sve`, `Zahtevi`,
// `Rezervacije`, the queue in lib/menu/waiter-queue.ts order (Novi oldest
// first, then Prihvaćen, mine first), the guest's cancellations as a strip that
// stays until closed, and `Uskoro` for the reservations that are late or near.
//
// K25 fills the reservations in (lib/menu/reservation-queue.ts): the
// `Rezervacije` filter lists them in groups (Čekaju odgovor, Kasne, Uskoro,
// Kasnije danas, Sutra i prekosutra, Stigli danas, Otkazane) with the count of
// the new ones on the filter; `Sve` shows the new reservations after the new
// requests in `Novi` (a reservation is not urgent like a call) and the `Uskoro`
// section under the queue; `Zahtevi` has no reservations. The filter appears
// only when the venue takes reservations through the ScanMe form or has some to
// show. Without reservation data at all (`rezervacije` undefined) the filter
// stays and is honestly empty, as in K22.

import { CalendarClock, ConciergeBell, Info, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime, waitingFor } from "@/lib/menu/elapsed-time";
import { groupReservations, soonReservations, type ReservationRow } from "@/lib/menu/reservation-queue";
import {
  QUEUE_FILTERS,
  filterQueue,
  queueSummary,
  sortQueue,
  type QueueAction,
  type QueueFilter,
} from "@/lib/menu/waiter-queue";
import { cn } from "@/lib/utils";
import { IkonicaDugme } from "../../zajednicko/dugme";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { KonobarOtkazan, KonobarRed, KonobarRezervacije, KonobarZahtev } from "../model";
import { GrupeRezervacija, KarticeRezervacija, imaRezervacija } from "../rezervacije/lista";
import { KarticaRezervacije } from "../rezervacije/kartica-rezervacije";
import { terminTekst } from "../rezervacije/tekst";
import { KarticaZahteva } from "./kartica-zahteva";

const t = menuKonobarSr.red;
const tr = menuKonobarSr.rezervacije;
const d = menuDomenSr;

export type RadniRedProps = {
  /** undefined = still loading. */
  red: KonobarRed | undefined;
  sadaMs: number;
  /** The request whose action is in flight. */
  radiId: string | null;
  onOtvori(id: string): void;
  onRadnja(zahtev: KonobarZahtev, radnja: QueueAction): void;
  radnjeIskljucene: boolean;
  /** Guest cancellations not dismissed yet (newest first). */
  obavestenja: KonobarOtkazan[];
  onZatvoriObavestenje(id: string): void;
  /** Upcoming reservations of the `Uskoro` section; K25 builds it itself from `rezervacije` when this is not given. */
  uskoro?: ReactNode;
  pocetniFilter?: QueueFilter;
  /** A strip above the queue (offline, an action error). */
  traka?: ReactNode;
  /** K23: requests whose reminder is flashing now. */
  podsetnik?: ReadonlySet<string>;
  // K25 — reservations
  /** undefined = not wired (the K22 behaviour); null = still loading (no filter yet); else the venue's reservations. */
  rezervacije?: KonobarRezervacije | null;
  /** The reservation whose action is in flight. */
  radiRezId?: string | null;
  onOtvoriRezervaciju?(id: string): void;
  /** `Stigli su` on a card: the guests arrived. */
  onRezervacijaStigli?(red: ReservationRow): void;
  /** Guest cancellations of reservations not dismissed yet (newest first). */
  obavestenjaRez?: ReservationRow[];
};

export function aktivniTekst(broj: number): string {
  return fmt(menuKonobarSr.zaglavlje.aktivni[srPluralCategory(broj)], { n: broj });
}

const NISTA = () => undefined;

export function RadniRed({
  red,
  sadaMs,
  radiId,
  onOtvori,
  onRadnja,
  radnjeIskljucene,
  obavestenja,
  onZatvoriObavestenje,
  uskoro,
  pocetniFilter = "sve",
  traka,
  podsetnik,
  rezervacije,
  radiRezId = null,
  onOtvoriRezervaciju = NISTA,
  onRezervacijaStigli = NISTA,
  obavestenjaRez = [],
}: RadniRedProps) {
  const [filter, setFilter] = useState<QueueFilter>(pocetniFilter);
  const sortirani = red ? sortQueue(red.zahtevi) : [];
  const sazetak = queueSummary(sortirani);

  // Reservations: the groups of the filter, the new ones for `Sve`, the late and near ones for `Uskoro`.
  const rez = rezervacije ?? null;
  const grupe = rez ? groupReservations(rez.rows, sadaMs, rez.holdMinutes) : null;
  const noveRez = rez ? rez.rows.filter((red0) => red0.status === "new").sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)) : [];
  const uskoroRez = rez ? soonReservations(rez.rows, sadaMs, rez.holdMinutes) : [];
  const prikaziFilterRez = rezervacije === undefined || (rez !== null && (rez.mode === "form" || (grupe !== null && imaRezervacija(grupe))));
  const aktivniFilter: QueueFilter = filter === "rezervacije" && !prikaziFilterRez ? "sve" : filter;
  const prikazani = filterQueue(sortirani, aktivniFilter);
  const noveUSve = aktivniFilter === "sve" ? noveRez : [];
  const brojNovihRez = noveRez.length;
  const broj: Record<QueueFilter, number | null> = {
    sve: sortirani.length + brojNovihRez,
    zahtevi: sortirani.length,
    rezervacije: brojNovihRez > 0 ? brojNovihRez : null,
  };
  const zajednicko = {
    sadaMs,
    holdMin: rez?.holdMinutes ?? 15,
    radiId: radiRezId,
    onOtvori: onOtvoriRezervaciju,
    onStigli: onRezervacijaStigli,
    radnjeIskljucene,
  };
  const uskoroSadrzaj = uskoro ?? (uskoroRez.length > 0 ? <KarticeRezervacija redovi={uskoroRez} {...zajednicko} /> : null);
  const nemaZahteva = prikazani.length === 0 && noveUSve.length === 0;
  // Loading: the requests still load (queue views), or the reservations do (their filter).
  const ucitava = aktivniFilter === "rezervacije" ? rezervacije === null || (rezervacije === undefined && red === undefined) : red === undefined;

  const grupeZahteva = [
    {
      kljuc: "new",
      naslov: t.grupaNovi,
      zahtevi: prikazani.filter((zahtev) => zahtev.status === "new"),
      rezervacije: noveUSve,
    },
    {
      kljuc: "accepted",
      naslov: t.grupaPrihvaceni,
      zahtevi: prikazani.filter((zahtev) => zahtev.status === "accepted"),
      rezervacije: [] as ReservationRow[],
    },
  ];

  return (
    <section aria-labelledby="radni-red-naslov" className="grid content-start gap-4">
      <header className="grid gap-3">
        <div className="grid gap-1">
          <h1 id="radni-red-naslov" className="text-2xl font-bold leading-tight tracking-[-0.01em] text-[var(--mp-tekst)]">
            {t.naslov}
          </h1>
          {red && sazetak.active > 0 ? (
            <p className="text-[0.9375rem] tabular-nums text-[var(--mp-tekst-sporedni)]">
              {sazetak.oldestNewAt !== null
                ? fmt(t.sazetak, { aktivni: aktivniTekst(sazetak.active), ceka: waitingFor(sazetak.oldestNewAt, sadaMs) })
                : fmt(t.sazetakSviPreuzeti, { aktivni: aktivniTekst(sazetak.active) })}
            </p>
          ) : null}
        </div>
        <div role="group" aria-label={t.filteri} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {QUEUE_FILTERS.filter((kljuc) => kljuc !== "rezervacije" || prikaziFilterRez).map((kljuc) => {
            const izabran = aktivniFilter === kljuc;
            return (
              <button
                key={kljuc}
                type="button"
                aria-pressed={izabran}
                onClick={() => setFilter(kljuc)}
                className={cn(
                  "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-5 text-base font-semibold [--button-radius:999px] transition-colors duration-[var(--mp-trajanje-1)]",
                  izabran
                    ? "[--border:var(--mp-mastilo)] bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                    : "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]",
                )}
              >
                {t.filter[kljuc]}
                {broj[kljuc] !== null && red ? (
                  <span className="tabular-nums opacity-80" aria-hidden="true">
                    {broj[kljuc]}
                  </span>
                ) : null}
                {kljuc === "rezervacije" && brojNovihRez > 0 ? (
                  <span className="sr-only">, {fmt(tr.noviBroj[srPluralCategory(brojNovihRez)], { n: brojNovihRez })}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      {traka}

      {obavestenja.length > 0 ? (
        <ul className="grid gap-2" aria-label={d.requestStatuses.cancelled}>
          {obavestenja.map((otkazan) => (
            <li
              key={otkazan.id}
              role="status"
              className="flex items-center gap-3 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)] py-1 pl-4 pr-1 text-[0.9375rem] text-[var(--mp-tekst)]"
            >
              <span className="min-w-0 flex-1 py-2 font-semibold">
                {fmt(t.otkazaoGost, {
                  vrsta: d.requestKinds[otkazan.kind],
                  mesto: otkazan.positionLabel,
                  vreme: otkazan.cancelledAt !== null ? clockTime(otkazan.cancelledAt) : "",
                })}
              </span>
              <IkonicaDugme ikonica={X} oznaka={t.zatvoriObavestenje} onClick={() => onZatvoriObavestenje(otkazan.id)} />
            </li>
          ))}
        </ul>
      ) : null}

      {obavestenjaRez.length > 0 ? (
        <ul className="grid gap-2" aria-label={d.reservationStatuses.cancelled} data-rez-obavestenja>
          {obavestenjaRez.map((otkazana) => (
            <li
              key={otkazana.id}
              role="status"
              className="flex items-center gap-3 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)] py-1 pl-4 pr-1 text-[0.9375rem] text-[var(--mp-tekst)]"
            >
              <span className="min-w-0 flex-1 py-2 font-semibold">
                {fmt(tr.otkazaoGost, { ime: otkazana.guestName, termin: terminTekst(otkazana.requestedAt, sadaMs) })}
              </span>
              <IkonicaDugme ikonica={X} oznaka={t.zatvoriObavestenje} onClick={() => onZatvoriObavestenje(otkazana.id)} />
            </li>
          ))}
        </ul>
      ) : null}

      {ucitava ? (
        <UcitavanjeStanje oblik="kartice" redova={3} />
      ) : aktivniFilter === "rezervacije" ? (
        <>
          {rez !== null && rez.mode !== "form" && rez.rows.length > 0 ? (
            <p className="flex items-start gap-2 text-[0.9375rem] text-[var(--mp-tekst-sporedni)]" data-rez-iskljuceno>
              <Info aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
              {tr.iskljuceno}
            </p>
          ) : null}
          {grupe === null || !imaRezervacija(grupe) ? (
            <PraznoStanje ikonica={CalendarClock} naslov={t.praznoRezervacije.naslov} opis={t.praznoRezervacije.opis} />
          ) : (
            <GrupeRezervacija grupe={grupe} {...zajednicko} />
          )}
          {rez?.skraceno ? <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{tr.skraceno}</p> : null}
        </>
      ) : nemaZahteva ? (
        <PraznoStanje ikonica={ConciergeBell} naslov={t.prazno.naslov} opis={t.prazno.opis} />
      ) : (
        <div className="grid gap-5" data-radni-red>
          {grupeZahteva.map((grupa) =>
            grupa.zahtevi.length + grupa.rezervacije.length === 0 ? null : (
              <section key={grupa.kljuc} aria-labelledby={`radni-red-${grupa.kljuc}`} className="grid gap-3" data-grupa={grupa.kljuc}>
                <h2 id={`radni-red-${grupa.kljuc}`} className="flex items-baseline gap-2 text-lg font-bold text-[var(--mp-tekst)]">
                  {grupa.naslov}
                  <span className="text-base font-semibold tabular-nums text-[var(--mp-tekst-sporedni)]">
                    {grupa.zahtevi.length + grupa.rezervacije.length}
                  </span>
                </h2>
                <ul className="grid gap-3">
                  {grupa.zahtevi.map((zahtev) => (
                    <li key={zahtev.id}>
                      <KarticaZahteva
                        zahtev={zahtev}
                        sadaMs={sadaMs}
                        radi={radiId === zahtev.id}
                        onOtvori={() => onOtvori(zahtev.id)}
                        onRadnja={(radnja) => onRadnja(zahtev, radnja)}
                        radnjeIskljucene={radnjeIskljucene}
                        podsetnik={podsetnik?.has(zahtev.id) ?? false}
                      />
                    </li>
                  ))}
                  {grupa.rezervacije.map((rezervacija) => (
                    <li key={rezervacija.id}>
                      <KarticaRezervacije
                        red={rezervacija}
                        sadaMs={sadaMs}
                        holdMin={zajednicko.holdMin}
                        radi={radiRezId === rezervacija.id}
                        onOtvori={() => onOtvoriRezervaciju(rezervacija.id)}
                        onStigli={() => onRezervacijaStigli(rezervacija)}
                        radnjeIskljucene={radnjeIskljucene}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}

      {red?.skraceno && aktivniFilter !== "rezervacije" ? <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.skraceno}</p> : null}
      {rez?.skraceno && aktivniFilter === "sve" ? <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{tr.skraceno}</p> : null}

      {uskoroSadrzaj && aktivniFilter === "sve" ? (
        <section aria-labelledby="radni-red-uskoro" className="grid gap-3 pt-2" data-uskoro>
          <h2 id="radni-red-uskoro" className="text-xl font-bold text-[var(--mp-tekst)]">
            {t.uskoro}
          </h2>
          {uskoroSadrzaj}
        </section>
      ) : null}
    </section>
  );
}
