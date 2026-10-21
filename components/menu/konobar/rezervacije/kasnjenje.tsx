// ScanMe Menu V1 (K25) — the lateness of an accepted reservation (master §10.4,
// §11.5; plan K24-10). Before the term nothing ticks. From the term on, a calm
// "kasni 03:12" runs in a neutral tone (master §10.4; the venue still holds the table); once the hold the
// venue set (`holdMinutes`, not the late threshold of requests) has passed, the
// chip turns the danger colour, gains the clock icon and the word "kasni" and
// pulses gently (the ring of konobar.module.css; still with reduced motion).
// Nothing is cancelled and no table is freed on its own. `data-rez-kasni`
// marks the late state; `data-rez-faza` the phase.

import { Clock, ClockAlert } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { formatElapsed } from "@/lib/menu/elapsed-time";
import { reservationTiming } from "@/lib/menu/reservation-late";
import { cn } from "@/lib/utils";
import { KASNI_CIP, trajanjeZaCitac } from "../vreme";

const t = menuKonobarSr.rezervacije;

export function KasnjenjeRezervacije({
  requestedAt,
  holdMin,
  sadaMs,
  className,
}: {
  requestedAt: number;
  holdMin: number;
  sadaMs: number;
  className?: string;
}) {
  const { phase, lateSeconds } = reservationTiming(requestedAt, holdMin, sadaMs);
  if (lateSeconds === null) return null;
  const kasni = phase === "kasni";
  const sablon = kasni ? t.kasni : t.uTerminu;
  return (
    <span
      data-rez-kasni={kasni || undefined}
      data-rez-faza={phase}
      className={cn(
        "inline-flex w-fit items-center text-[0.9375rem] font-semibold leading-tight tabular-nums",
        kasni ? cn(KASNI_CIP, "-mx-2 px-2 py-0.5 text-[var(--mp-opasnost)]") : "text-[var(--mp-tekst)]",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {kasni ? (
          <ClockAlert strokeWidth={2} className="size-4 shrink-0" />
        ) : (
          <Clock strokeWidth={2} className="size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
        )}
        {fmt(sablon, { vreme: formatElapsed(lateSeconds) })}
      </span>
      <span className="sr-only">{fmt(sablon, { vreme: trajanjeZaCitac(lateSeconds) })}</span>
    </span>
  );
}
