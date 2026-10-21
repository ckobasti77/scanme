"use client";

// ScanMe Menu V1 (K23) — one parallel state of a table (master §10.3: "zvonce
// — pozvan konobar; račun; porudžbina; rezervacija"): the kind's icon in its
// colour and the wait in the panel's one format (`08:12`), plus how many of
// that kind are open when more than one. Past the venue's threshold the badge
// turns the danger colour, gains the late icon and pulses gently (the ring of
// konobar.module.css; static with reduced motion). Several badges of one
// table sit side by side, never collapsed into one "main" state. When every
// request of that kind is already taken (`Prihvaćen`), the badge has a dashed
// frame: it still waits, but someone has it.
//
// Decorative for screen readers: the table's own name says every state with
// the exact time and the wait in minutes (pogled.ts opisMestaSale).

import { ClockAlert } from "lucide-react";
import { elapsedSeconds, formatElapsed, isLate } from "@/lib/menu/elapsed-time";
import type { KindState, TableKind } from "@/lib/menu/table-summary";
import { cn } from "@/lib/utils";
import { usePragKasnjenja } from "../prag";
import { KASNI_CIP } from "../vreme";
import { VRSTA } from "../vrsta";

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
  sadaMs,
  saVremenom = true,
  vremeKlasa,
  className,
}: {
  vrsta: TableKind;
  stanje: KindState;
  sadaMs: number;
  /** false on a tile too narrow for the time: only the icon (the time is in the table's name and detail). */
  saVremenom?: boolean;
  /** Classes of the time part (a container query hides it on a tile too narrow for it). */
  vremeKlasa?: string;
  className?: string;
}) {
  const prag = usePragKasnjenja();
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
        <span className={cn("inline-flex items-center gap-1 pr-1", vremeKlasa)}>
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
