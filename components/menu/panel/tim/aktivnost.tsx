"use client";

// ScanMe Menu V1 (K28) — the collapsible block "Aktivnost" of Tim i pristupi (plan
// docs/meni/planovi/K24.md §4.6): the last sensitive actions, in words — who did
// what, to whom, and when (Belgrade time). Closed by default. A row whose action
// this screen has no words for is skipped rather than shown raw. No PINs, hashes or
// other people's e-mails reach this block: it only prints what it is given.

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import type { TimAktivnost } from "./model";

const tim = menuPanelSr.tim;
const t = tim.aktivnost;
const AKCIJE: Record<string, string | undefined> = t.akcije;

function akterTekst(akter: TimAktivnost["actor"]): string {
  switch (akter.kind) {
    case "user":
      return akter.name ?? t.akter.clan;
    case "staff":
      return akter.name ?? t.akter.osoblje;
    case "scanme":
      return t.akter.scanme;
    case "guest":
      return t.akter.gost;
    case "system":
      return t.akter.sistem;
  }
}

/** "Ana je promenio ulogu člana tima: marko@example.com", or null for an action without words. */
export function aktivnostTekst(red: TimAktivnost): string | null {
  const radnja = AKCIJE[red.action];
  if (radnja === undefined) return null;
  const sa = red.subject ? fmt(t.saOsobom, { radnja, osoba: red.subject }) : radnja;
  return fmt(t.red, { akter: akterTekst(red.actor), radnja: sa });
}

export function Aktivnost({ aktivnost }: { aktivnost: TimAktivnost[] | undefined }) {
  const id = useId();
  const [otvoreno, setOtvoreno] = useState(false);
  const redovi = (aktivnost ?? [])
    .map((red) => ({ red, tekst: aktivnostTekst(red) }))
    .filter((stavka): stavka is { red: TimAktivnost; tekst: string } => stavka.tekst !== null);
  const telo = `${id}-telo`;

  return (
    <Kartica data-aktivnost="">
      <section aria-labelledby={`${id}-naslov`} className="grid gap-4">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="grid min-w-0 max-w-[65ch] gap-1">
            <h2 id={`${id}-naslov`} className="text-xl font-semibold leading-snug tracking-[-0.01em] text-[var(--mp-tekst)]">
              {t.naslov}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
          </div>
          <Dugme
            vrsta="sekundarno"
            velicina="kompaktna"
            aria-expanded={otvoreno}
            aria-controls={telo}
            onClick={() => setOtvoreno((tekuce) => !tekuce)}
          >
            {otvoreno ? t.sakrij : t.prikazi}
            <ChevronDown
              aria-hidden="true"
              strokeWidth={1.75}
              className={cn("transition-transform motion-reduce:transition-none", otvoreno && "rotate-180")}
            />
          </Dugme>
        </header>

        {otvoreno ? (
          <div id={telo} data-aktivnost-telo="">
            {aktivnost === undefined ? (
              <UcitavanjeStanje oblik="lista" redova={4} oznaka={tim.ucitavanje} />
            ) : redovi.length === 0 ? (
              <p className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-3 text-sm leading-relaxed text-[var(--mp-tekst)]">
                {t.prazno}
              </p>
            ) : (
              <ul className="grid [--border:var(--mp-ivica)]">
                {redovi.map(({ red, tekst }) => (
                  <li
                    key={red.id}
                    data-aktivnost-red=""
                    className="grid gap-0.5 border-t py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6"
                  >
                    <p className="min-w-0 text-[0.9375rem] leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{tekst}</p>
                    <time
                      dateTime={new Date(red.createdAt).toISOString()}
                      className="text-sm tabular-nums text-[var(--mp-tekst-sporedni)]"
                    >
                      {formatBelgrade(red.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    </Kartica>
  );
}
