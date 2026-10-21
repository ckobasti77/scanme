// ScanMe Menu V1 (K25) — one reservation in the work queue (master §10.2,
// §10.4, §11.3; plan K24-14). Like a request card: the kind (CalendarClock in
// its amber circle + the word "Rezervacija"), the guest, the term and the
// guests ("Danas · 20:00 · 4 osobe"), the table or "Bez stola" (a note icon
// when the guest left one), the status in words, the live lateness of an
// accepted one, and ONE main action of at least 48 px: `Odgovori` for a new
// request or a proposal (opens the detail), `Stigli su` for an accepted one
// whose time has come, otherwise `Otvori`. The title opens the detail and its
// target stretches over the card; the action sits above it. Two tab stops.
// A reservation is not urgent like a call: no reminder, no "Novo" flash.

import { Armchair, ChevronRight, StickyNote } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { reservationTiming } from "@/lib/menu/reservation-late";
import type { ReservationRow } from "@/lib/menu/reservation-queue";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { StatusRezervacije, VrstaIkonica } from "../vrsta";
import { KasnjenjeRezervacije } from "./kasnjenje";
import { gostiTekst, terminTekst } from "./tekst";

const t = menuKonobarSr.rezervacije;
const tvrsta = menuKonobarSr.sala.vrste;

export type RezervacijaRadnja = "odgovori" | "stigli" | "otvori";

/** The one main action of a reservation card. */
export function glavnaRadnjaRezervacije(red: Pick<ReservationRow, "status" | "requestedAt">, sadaMs: number, holdMin: number): RezervacijaRadnja {
  if (red.status === "new" || red.status === "change_proposed") return "odgovori";
  if (red.status === "accepted") {
    const { phase } = reservationTiming(red.requestedAt, holdMin, sadaMs);
    if (phase === "u-terminu" || phase === "kasni") return "stigli";
  }
  return "otvori";
}

// Odgovori is the one green action (as Preuzmi), Stigli su the ink one, Otvori only opens.
const VRSTA_DUGMETA = { odgovori: "akcent", stigli: "primarno", otvori: "sekundarno" } as const;

export function KarticaRezervacije({
  red,
  sadaMs,
  holdMin,
  radi,
  onOtvori,
  onStigli,
  radnjeIskljucene,
}: {
  red: ReservationRow;
  sadaMs: number;
  holdMin: number;
  /** The action in flight for this card (spinner, clicks ignored). */
  radi: boolean;
  onOtvori(): void;
  onStigli(): void;
  /** Offline: actions wait for the connection (the reason is in the strip above the queue). */
  radnjeIskljucene: boolean;
}) {
  const radnja = glavnaRadnjaRezervacije(red, sadaMs, holdMin);
  const termin = terminTekst(red.requestedAt, sadaMs);
  const kasni = red.status === "accepted" && reservationTiming(red.requestedAt, holdMin, sadaMs).phase === "kasni";
  const kratkaRadnja = t.radnja[radnja];
  return (
    <article
      data-rezervacija={red.id}
      data-status={red.status}
      data-rez-kasni={kasni || undefined}
      className={cn(
        "@container/kartica relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-xs)] sm:gap-4",
        kasni ? "[--border:var(--mp-opasnost-ivica)]" : null,
      )}
    >
      <span className="self-start">
        <VrstaIkonica vrsta="reservation" />
      </span>
      <div className="grid min-w-0 gap-1">
        <h3 className="min-w-0">
          <button
            type="button"
            onClick={onOtvori}
            aria-label={fmt(t.otvoriCitac, { ime: red.guestName, termin })}
            data-razvucen
            className="-mx-1 -my-[calc((var(--mp-meta)-1.5469rem)/2)] inline-flex min-h-[var(--mp-meta)] max-w-full scroll-mb-28 scroll-mt-24 items-center gap-1 rounded-[var(--mp-radius-unutra)] px-1 text-left text-[1.125rem] font-bold leading-snug text-[var(--mp-tekst)] after:absolute after:inset-0 after:rounded-[var(--mp-radius-kartica)] after:content-[''] hover:underline hover:underline-offset-4"
          >
            <span className="min-w-0">
              {tvrsta.reservation}
              <ChevronRight aria-hidden="true" strokeWidth={2} className="ml-1 hidden size-4 text-[var(--mp-tekst-sporedni)] sm:inline-block sm:align-[-0.15em]" />
            </span>
            </button>
        </h3>
        <p className="break-words text-base font-semibold leading-snug text-[var(--mp-tekst)]">{red.guestName}</p>
        <p className="text-[1.0625rem] font-bold leading-tight tabular-nums text-[var(--mp-tekst)]">
          {termin} · {gostiTekst(red.partySize)}
        </p>
        <p className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
          <span className="inline-flex items-center gap-1.5">
            <Armchair aria-hidden="true" strokeWidth={2} className="size-4 shrink-0" />
            {red.positionLabel ?? t.bezStola}
          </span>
          {red.hasNote ? (
            <span className="inline-flex items-center gap-1.5">
              <StickyNote aria-hidden="true" strokeWidth={2} className="size-4 shrink-0" />
              <span className="sr-only">{t.imaNapomenu}</span>
            </span>
          ) : null}
        </p>
        {red.status === "change_proposed" && red.proposedAt !== null ? (
          <p className="text-[0.9375rem] font-semibold tabular-nums text-[var(--mp-tekst)]">
            {fmt(t.predlogKratko, { termin: terminTekst(red.proposedAt, sadaMs) })}
          </p>
        ) : null}
        {red.status === "accepted" ? <KasnjenjeRezervacije requestedAt={red.requestedAt} holdMin={holdMin} sadaMs={sadaMs} /> : null}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <StatusRezervacije status={red.status} />
        </div>
      </div>
      <Dugme
        vrsta={VRSTA_DUGMETA[radnja]}
        ucitava={radi}
        disabled={radnjeIskljucene}
        onClick={radnja === "stigli" ? onStigli : onOtvori}
        aria-label={fmt(t.radnjaCitac, { radnja: kratkaRadnja, ime: red.guestName, termin })}
        className="relative z-10 min-h-12 min-w-[6.5rem] px-4 text-base @[30rem]/kartica:min-w-[8.5rem]"
      >
        {kratkaRadnja}
      </Dugme>
    </article>
  );
}
