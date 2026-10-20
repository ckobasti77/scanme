// ScanMe Menu V1 (K22) — the panel's signature detail, the live timer
// (MENU-UX §1.3; master §10.4): the exact Belgrade time an event happened and
// how long it has waited, the same pair everywhere — `18:43 · čeka 08:12`.
// Tabular digits, so it never jitters. Past the threshold (15 min until K23
// makes it the venue's setting) it turns the danger colour AND gains the
// clock icon and the word "kasni" — never colour alone. A screen reader gets
// the minutes, not a number changing every second.

import { ClockAlert } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import {
  DEFAULT_LATE_THRESHOLD_MIN,
  clockTime,
  elapsedForReader,
  elapsedSeconds,
  formatElapsed,
  isLate,
} from "@/lib/menu/elapsed-time";
import { cn } from "@/lib/utils";

const t = menuKonobarSr.vreme;

export function trajanjeZaCitac(sekunde: number): string {
  const { hours, minutes, seconds } = elapsedForReader(sekunde);
  if (hours > 0) return [fmt(t.sati, { n: hours }), minutes > 0 ? fmt(t.minuti, { n: minutes }) : null].filter(Boolean).join(" ");
  if (minutes > 0) return fmt(t.minuti, { n: minutes });
  return fmt(t.sekunde, { n: seconds });
}

/**
 * `18:43 · čeka 08:12`. `slozeno` (queue card, mockup 10) puts the wait under
 * the time; the words and the format stay the same.
 */
export function VremePar({
  od,
  sadaMs,
  pragMin = DEFAULT_LATE_THRESHOLD_MIN,
  slozeno = false,
  className,
}: {
  od: number;
  sadaMs: number;
  pragMin?: number;
  slozeno?: boolean;
  className?: string;
}) {
  const sekunde = elapsedSeconds(od, sadaMs);
  const kasni = isLate(od, sadaMs, pragMin);
  const vreme = clockTime(od);
  if (slozeno) {
    return (
      <p
        data-kasni={kasni || undefined}
        className={cn(
          "grid leading-tight tabular-nums",
          kasni ? "text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst)]",
          className,
        )}
      >
        <span aria-hidden="true" className="text-xl font-bold">
          {vreme}
        </span>
        <span aria-hidden="true" className="inline-flex flex-wrap items-center gap-x-1.5 text-[0.9375rem] font-semibold">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {kasni ? <ClockAlert strokeWidth={2} className="size-4 shrink-0" /> : null}
            {fmt(t.ceka, { ceka: formatElapsed(sekunde) })}
          </span>
          {kasni ? <span className="whitespace-nowrap font-bold">{t.kasni}</span> : null}
        </span>
        <span className="sr-only">
          {fmt(t.citac, { vreme, trajanje: trajanjeZaCitac(sekunde) })}
          {kasni ? `, ${t.kasni}` : ""}
        </span>
      </p>
    );
  }
  return (
    <p
      data-kasni={kasni || undefined}
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 text-[1.0625rem] font-bold leading-tight tabular-nums",
        kasni ? "text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst)]",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {kasni ? <ClockAlert strokeWidth={2} className="size-5 shrink-0" /> : null}
        {fmt(t.par, { vreme, ceka: formatElapsed(sekunde) })}
      </span>
      {kasni ? <span aria-hidden="true" className="whitespace-nowrap">{t.kasni}</span> : null}
      <span className="sr-only">
        {fmt(t.citac, { vreme, trajanje: trajanjeZaCitac(sekunde) })}
        {kasni ? `, ${t.kasni}` : ""}
      </span>
    </p>
  );
}

/** The two big cells of a request detail: when it came, how long it waits. */
export function VremeCelije({
  od,
  sadaMs,
  oznakaVremena,
  oznakaCekanja,
  aktivan,
  pragMin = DEFAULT_LATE_THRESHOLD_MIN,
}: {
  od: number;
  sadaMs: number;
  oznakaVremena: string;
  oznakaCekanja: string;
  /** Finished or cancelled requests show only the time; the wait stops mattering. */
  aktivan: boolean;
  pragMin?: number;
}) {
  const sekunde = elapsedSeconds(od, sadaMs);
  const kasni = aktivan && isLate(od, sadaMs, pragMin);
  return (
    <dl className="grid grid-cols-2 divide-x border-y py-4 [--border:var(--mp-ivica)]">
      <div className="grid gap-1 pr-4">
        <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{oznakaVremena}</dt>
        <dd className={cn("text-[2rem] font-bold leading-none tabular-nums", kasni ? "text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst)]")}>
          {clockTime(od)}
        </dd>
      </div>
      {aktivan ? (
        <div className="grid gap-1 pl-4" data-kasni={kasni || undefined}>
          <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{oznakaCekanja}</dt>
          <dd className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", kasni ? "text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst)]")}>
            <span aria-hidden="true" className="text-[2rem] font-bold leading-none tabular-nums">
              {formatElapsed(sekunde)}
            </span>
            {kasni ? (
              <span aria-hidden="true" className="inline-flex items-center gap-1 text-[0.9375rem] font-bold">
                <ClockAlert strokeWidth={2} className="size-5" />
                {t.kasni}
              </span>
            ) : null}
            <span className="sr-only">
              {trajanjeZaCitac(sekunde)}
              {kasni ? `, ${t.kasni}` : ""}
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
