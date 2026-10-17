// ScanMe Menu V1 — section frame (K07). A titled region of a screen: the H2
// names it (and labels the landmark), an optional sentence says what it is for,
// actions sit on the same row. No box of its own: content decides whether it
// needs a card (DASHBOARD-STANDARD §3: a list whose title would repeat the H1
// stands directly in the screen).

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OkvirSekcije({
  naslov,
  opis,
  radnje,
  nivo = 2,
  id,
  className,
  children,
}: {
  naslov: ReactNode;
  opis?: ReactNode;
  radnje?: ReactNode;
  /** Heading level; 2 under the page H1, 3 inside a card. */
  nivo?: 2 | 3;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const naslovId = `${id ?? generated}-naslov`;
  const Naslov = nivo === 2 ? "h2" : "h3";
  return (
    <section id={id} aria-labelledby={naslovId} data-okvir-sekcije="" className={cn("grid gap-4", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 max-w-[65ch] gap-1">
          <Naslov
            id={naslovId}
            className={cn(
              "font-semibold tracking-[-0.01em] text-[var(--mp-tekst)]",
              nivo === 2 ? "text-xl leading-snug" : "text-base leading-snug",
            )}
          >
            {naslov}
          </Naslov>
          {opis ? <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{opis}</p> : null}
        </div>
        {radnje ? <div className="flex flex-wrap items-center gap-2">{radnje}</div> : null}
      </header>
      {children}
    </section>
  );
}
