"use client";

// ScanMe Menu V1 (K23) — one parallel state of a table (master §10.3: "zvonce
// — pozvan konobar; račun; porudžbina; rezervacija"): the kind's icon in its
// colour and the wait in the panel's one format (`08:12`), plus how many of
// that kind are open when more than one. Past the venue's threshold the badge
// turns the danger colour, gains the late icon and pulses gently (the ring of
// konobar.module.css; static with reduced motion). Several badges of one
// table stand one above the other, never collapsed into one "main" state. When every
// request of that kind is already taken (`Prihvaćen`), the badge has a dashed
// frame: it still waits, but someone has it.
//
// Decorative for screen readers: the table's own name says every state with
// the exact time and the wait in minutes (pogled.ts opisMestaSale).

import { ClockAlert } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime, elapsedSeconds, formatElapsed, isLate } from "@/lib/menu/elapsed-time";
import { reservationTiming } from "@/lib/menu/reservation-late";
import type { KindState, TableKind } from "@/lib/menu/table-summary";
import { cn } from "@/lib/utils";
import { usePragKasnjenja } from "../prag";
import { useSatLista } from "../use-sat";
import { KASNI_CIP } from "../vreme";
import { VRSTA } from "../vrsta";
import type { SalaRezervacija } from "./pogled";

/** The frame of a calm badge: the kind's own colour (the app colours borders with --border). */
export const IVICA_VRSTE: Record<TableKind, string> = {
  call: "[--border:var(--mp-vrsta-poziv)]",
  order: "[--border:var(--mp-vrsta-porudzbina)]",
  bill: "[--border:var(--mp-vrsta-racun)]",
  reservation: "[--border:var(--mp-vrsta-rezervacija)]",
};

export function ZnackaStanja({
  vrsta,
  stanje,
  sadaMs: sadaMsProp,
  saVremenom = true,
  className,
}: {
  vrsta: TableKind;
  stanje: KindState;
  /** K33: on a memoised tile the clock comes from SatKontekst; this is what a badge drawn alone shows. */
  sadaMs: number;
  /** false on a tile too narrow for the time: only the icon (the time is in the table's name and detail). */
  saVremenom?: boolean;
  className?: string;
}) {
  const prag = usePragKasnjenja();
  const sadaMs = useSatLista(sadaMsProp);
  const kasni = isLate(stanje.oldestAt, sadaMs, prag);
  const prihvaceno = stanje.newCount === 0;
  const v = VRSTA[vrsta];
  const Ikonica = v.ikonica;
  return (
    <span
      aria-hidden="true"
      data-znacka={vrsta}
      data-kasni={kasni || undefined}
      data-prihvaceno={prihvaceno || undefined}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1 text-[0.8125rem] font-bold leading-none tabular-nums shadow-[var(--mp-senka-xs)]",
        kasni
          ? cn(KASNI_CIP, "[--border:var(--mp-opasnost)] text-[var(--mp-opasnost)]")
          : cn("relative bg-[var(--mp-povrsina)] text-[var(--mp-tekst)]", IVICA_VRSTE[vrsta]),
        prihvaceno && "border-dashed",
        className,
      )}
    >
      <span className={cn("grid size-[1.125rem] place-items-center rounded-full", v.meko)}>
        <Ikonica strokeWidth={2.25} className={cn("size-3", v.boja)} />
      </span>
      {saVremenom ? (
        <span className="inline-flex items-center gap-1 pr-1">
          {kasni ? <ClockAlert strokeWidth={2.25} className="size-3.5 shrink-0" /> : null}
          {formatElapsed(elapsedSeconds(stanje.oldestAt, sadaMs))}
        </span>
      ) : null}
      {stanje.count > 1 ? (
        <span className="rounded-full bg-[var(--mp-mastilo)] px-1 text-[0.6875rem] leading-4 text-[var(--mp-na-mastilu)]">
          {stanje.count}
        </span>
      ) : null}
    </span>
  );
}

/**
 * K25: the badge of a bound reservation on its table (master §10.3, §10.4; plan
 * K24-10): the CalendarClock in the reservation's amber and the term (`20:00`);
 * once the term has come the live lateness runs beside it (`20:00 +03:12`, still
 * calm); once the hold the venue set has passed the badge turns the danger
 * colour, gains the clock icon and "kasni 17:00", and pulses gently (static with
 * reduced motion). The reservation's own marks are `data-rez-znacka` and
 * `data-rez-kasni`: its threshold is the hold, not the late threshold of requests.
 * Decorative for screen readers: the table's name says it (pogled.ts).
 */
export function ZnackaRezervacije({
  rezervacija,
  sadaMs: sadaMsProp,
  className,
}: {
  rezervacija: SalaRezervacija;
  /** K33: on a memoised tile the clock comes from SatKontekst; this is what a badge drawn alone shows. */
  sadaMs: number;
  className?: string;
}) {
  const sadaMs = useSatLista(sadaMsProp);
  const { row, more, holdMin } = rezervacija;
  const { phase, lateSeconds } = reservationTiming(row.requestedAt, holdMin, sadaMs);
  const kasni = phase === "kasni";
  const v = VRSTA.reservation;
  const Ikonica = v.ikonica;
  return (
    <span
      aria-hidden="true"
      data-rez-znacka=""
      data-rez-kasni={kasni || undefined}
      data-rez-faza={phase}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1 text-[0.8125rem] font-bold leading-none tabular-nums shadow-[var(--mp-senka-xs)]",
        kasni
          ? cn(KASNI_CIP, "[--border:var(--mp-opasnost)] text-[var(--mp-opasnost)]")
          : cn("relative bg-[var(--mp-povrsina)] text-[var(--mp-tekst)]", IVICA_VRSTE.reservation),
        className,
      )}
    >
      <span className={cn("grid size-[1.125rem] place-items-center rounded-full", v.meko)}>
        <Ikonica strokeWidth={2.25} className={cn("size-3", v.boja)} />
      </span>
      <span className="inline-flex items-center gap-1 pr-1">
        {kasni && lateSeconds !== null ? (
          <>
            <ClockAlert strokeWidth={2.25} className="size-3.5 shrink-0" />
            {fmt(menuKonobarSr.rezervacije.kasni, { vreme: formatElapsed(lateSeconds) })}
          </>
        ) : (
          <>
            {clockTime(row.requestedAt)}
            {lateSeconds !== null ? <span className="font-semibold text-[var(--mp-tekst-sporedni)]">+{formatElapsed(lateSeconds)}</span> : null}
          </>
        )}
      </span>
      {more > 0 ? (
        <span className="rounded-full bg-[var(--mp-mastilo)] px-1 text-[0.6875rem] leading-4 text-[var(--mp-na-mastilu)]">+{more}</span>
      ) : null}
    </span>
  );
}
