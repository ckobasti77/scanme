// ScanMe Menu V1 — page header with status (K07). One H1 per screen, on a
// fixed rem scale (DASHBOARD-STANDARD §1): the title names the screen, never a
// number or a message. The context line shows the service mode quietly
// (master §13.1: "ScanMe Menu · Ugostiteljstvo", never a control). The status
// sits beside the title; main actions sit on the same row, right on wide
// screens and below the title on a phone.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ZaglavljeSaStatusom({
  naslov,
  kontekst,
  status,
  opis,
  radnje,
  nivo = 1,
  className,
}: {
  naslov: ReactNode;
  /** A quiet line above the title (service and mode, or the venue). */
  kontekst?: ReactNode;
  /** A StatusOznaka or SavObjave. */
  status?: ReactNode;
  opis?: ReactNode;
  radnje?: ReactNode;
  /** 1 for the screen, 2 for a focused workspace inside it (e.g. the selected page in the editor), 3 inside a titled section. */
  nivo?: 1 | 2 | 3;
  className?: string;
}) {
  const Naslov = nivo === 1 ? "h1" : nivo === 2 ? "h2" : "h3";
  return (
    <header
      data-zaglavlje=""
      className={cn("flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8", className)}
    >
      <div className="grid min-w-0 gap-2">
        {kontekst ? <p className="text-sm font-medium text-[var(--mp-tekst-sporedni)]">{kontekst}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Naslov
            className={cn(
              "min-w-0 font-semibold tracking-[-0.02em] text-[var(--mp-tekst)] [overflow-wrap:anywhere]",
              nivo === 1 ? "text-2xl leading-tight lg:text-[1.75rem]" : "text-xl leading-snug",
            )}
          >
            {naslov}
          </Naslov>
          {status}
        </div>
        {opis ? <p className="max-w-[65ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{opis}</p> : null}
      </div>
      {radnje ? <div className="flex shrink-0 flex-wrap items-center gap-2">{radnje}</div> : null}
    </header>
  );
}
