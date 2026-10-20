"use client";

// ScanMe Menu V1 (K22) — the work queue (master §10.2, §8.4; mockup 10):
// what is next and how long it has waited. Filters `Sve`, `Zahtevi`,
// `Rezervacije` (filled by K25; until then honestly empty), the queue in
// lib/menu/waiter-queue.ts order (Novi oldest first, then Prihvaćen, mine
// first), the guest's cancellations as a strip that stays until closed, and
// `Uskoro` for upcoming reservations (only when there are any, K25).

import { CalendarClock, ConciergeBell, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime, waitingFor } from "@/lib/menu/elapsed-time";
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
import type { KonobarOtkazan, KonobarRed, KonobarZahtev } from "../model";
import { KarticaZahteva } from "./kartica-zahteva";

const t = menuKonobarSr.red;
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
  /** K25: upcoming reservations; the section shows only when there are some. */
  uskoro?: ReactNode;
  pocetniFilter?: QueueFilter;
  /** A strip above the queue (offline, an action error). */
  traka?: ReactNode;
};

export function aktivniTekst(broj: number): string {
  return fmt(menuKonobarSr.zaglavlje.aktivni[srPluralCategory(broj)], { n: broj });
}

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
}: RadniRedProps) {
  const [filter, setFilter] = useState<QueueFilter>(pocetniFilter);
  const sortirani = red ? sortQueue(red.zahtevi) : [];
  const prikazani = filterQueue(sortirani, filter);
  const sazetak = queueSummary(sortirani);
  const broj: Record<QueueFilter, number | null> = {
    sve: sortirani.length,
    zahtevi: sortirani.length,
    rezervacije: null,
  };

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
          {QUEUE_FILTERS.map((kljuc) => {
            const izabran = filter === kljuc;
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

      {red === undefined ? (
        <UcitavanjeStanje oblik="kartice" redova={3} />
      ) : prikazani.length === 0 ? (
        filter === "rezervacije" ? (
          <PraznoStanje ikonica={CalendarClock} naslov={t.praznoRezervacije.naslov} opis={t.praznoRezervacije.opis} />
        ) : (
          <PraznoStanje ikonica={ConciergeBell} naslov={t.prazno.naslov} opis={t.prazno.opis} />
        )
      ) : (
        <div className="grid gap-5" data-radni-red>
          {(
            [
              { kljuc: "new", naslov: t.grupaNovi, redovi: prikazani.filter((zahtev) => zahtev.status === "new") },
              { kljuc: "accepted", naslov: t.grupaPrihvaceni, redovi: prikazani.filter((zahtev) => zahtev.status === "accepted") },
            ] as const
          ).map((grupa) =>
            grupa.redovi.length === 0 ? null : (
              <section key={grupa.kljuc} aria-labelledby={`radni-red-${grupa.kljuc}`} className="grid gap-3" data-grupa={grupa.kljuc}>
                <h2 id={`radni-red-${grupa.kljuc}`} className="flex items-baseline gap-2 text-lg font-bold text-[var(--mp-tekst)]">
                  {grupa.naslov}
                  <span className="text-base font-semibold tabular-nums text-[var(--mp-tekst-sporedni)]">{grupa.redovi.length}</span>
                </h2>
                <ul className="grid gap-3">
                  {grupa.redovi.map((zahtev) => (
                    <li key={zahtev.id}>
                      <KarticaZahteva
                        zahtev={zahtev}
                        sadaMs={sadaMs}
                        radi={radiId === zahtev.id}
                        onOtvori={() => onOtvori(zahtev.id)}
                        onRadnja={(radnja) => onRadnja(zahtev, radnja)}
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

      {red?.skraceno ? <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.skraceno}</p> : null}

      {uskoro && filter !== "zahtevi" ? (
        <section aria-labelledby="radni-red-uskoro" className="grid gap-3 pt-2">
          <h2 id="radni-red-uskoro" className="text-xl font-bold text-[var(--mp-tekst)]">
            {t.uskoro}
          </h2>
          {uskoro}
        </section>
      ) : null}
    </section>
  );
}
