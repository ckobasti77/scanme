// ScanMe Menu V1 (K27) — "Sada u lokalu", the second block of Početna (master
// §13.2; plan docs/meni/planovi/K24.md §4.2): what is happening on the floor
// without running it. Active requests by kind, today's reservations (the next
// one) and the staff on shift. Only what Pažnja does not already say: late
// requests are counted there, so these numbers are "the rest" (the rule is in
// lib/menu/home-summary.ts). Shown to a role that sees operations only.

import { UsersRound } from "lucide-react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { clockTime } from "@/lib/menu/elapsed-time";
import type { SadaBlok } from "@/lib/menu/home-summary";
import { cn } from "@/lib/utils";
import { VRSTA } from "../../konobar/vrsta";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";

const t = menuPanelSr.pocetna.sada;

const PODNASLOV = "text-base font-semibold leading-snug text-[var(--mp-tekst)]";

function Zahtevi({ sada }: { sada: SadaBlok }) {
  // Three zeros read like three letters O: say it once in words instead.
  const nema = sada.zahtevi.every(({ broj }) => broj === 0);
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h3 className={PODNASLOV}>{sada.bezKasnih ? t.ostali : t.aktivni}</h3>
        {sada.bezKasnih ? <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.ostaliOpis}</p> : null}
      </div>
      {nema ? (
        <p className="text-[0.9375rem] leading-snug text-[var(--mp-tekst)]">{t.nemaZahteva}</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2">
          {sada.zahtevi.map(({ kind, broj }) => {
            const { ikonica: Ikonica, boja, meko } = VRSTA[kind];
            return (
              <div
                key={kind}
                data-vrsta={kind}
                className="flex flex-col-reverse justify-end gap-2 rounded-[var(--mp-radius-unutra)] bg-[var(--mp-povrsina-utisana)] p-3"
              >
                <dt className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-medium leading-tight text-[var(--mp-tekst-sporedni)]">
                  <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center rounded-full", meko)}>
                    <Ikonica strokeWidth={2} className={cn("size-4", boja)} />
                  </span>
                  <span className="min-w-0">{menuDomenSr.requestKinds[kind]}</span>
                </dt>
                <dd className="text-2xl font-semibold leading-none tabular-nums text-[var(--mp-tekst)]">{broj}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {sada.skraceno ? <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.skraceno}</p> : null}
    </div>
  );
}

function RezervacijeDanas({ rezervacije }: { rezervacije: SadaBlok["rezervacije"] }) {
  const { ikonica: Ikonica, boja, meko } = VRSTA.reservation;
  const { preostalo, sledeca } = rezervacije;
  return (
    <div className="grid content-start gap-3">
      <h3 className={PODNASLOV}>{t.rezervacije}</h3>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-full", meko)}>
          <Ikonica strokeWidth={2} className={cn("size-5", boja)} />
        </span>
        {sledeca ? (
          <div className="grid min-w-0 gap-0.5 text-[0.9375rem] leading-snug tabular-nums">
            <p className="font-semibold text-[var(--mp-tekst)]">{fmt(t.jos[srPluralCategory(preostalo)], { n: preostalo })}</p>
            <p className="text-[var(--mp-tekst)]">
              {fmt(t.sledeca, {
                vreme: clockTime(sledeca.at),
                gosti: fmt(menuDomenSr.guests[srPluralCategory(sledeca.partySize)], { n: sledeca.partySize }),
              })}
            </p>
            <p className="text-[var(--mp-tekst-sporedni)]">
              {sledeca.positionLabel ? fmt(t.sto, { sto: sledeca.positionLabel }) : t.bezStola}
            </p>
          </div>
        ) : (
          <p className="min-w-0 py-1.5 text-[0.9375rem] leading-snug text-[var(--mp-tekst)]">{t.nemaRezervacija}</p>
        )}
      </div>
    </div>
  );
}

function OsobljeUSmeni({ broj }: { broj: number }) {
  return (
    <div className="grid content-start gap-3">
      <h3 className={PODNASLOV}>{t.osoblje}</h3>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--mp-povrsina-utisana)] text-[var(--mp-tekst-sporedni)]"
        >
          <UsersRound strokeWidth={2} className="size-5" />
        </span>
        <p className="min-w-0 py-1.5 text-[0.9375rem] leading-snug tabular-nums text-[var(--mp-tekst)]">
          {broj === 0 ? t.osobljeNiko : fmt(t.osobljeBroj[srPluralCategory(broj)], { n: broj })}
        </p>
      </div>
    </div>
  );
}

export function Sada({ sada, className }: { sada: SadaBlok; className?: string }) {
  return (
    <Kartica data-blok="sada" className={className}>
      <OkvirSekcije id="pocetna-sada" naslov={t.naslov}>
        <div className="grid gap-5">
          <Zahtevi sada={sada} />
          {/* Side by side only where the card is wide: full width below 1024 px, and from 1280 px (at 1024-1279 px it is the 7-column card). */}
          <div className="grid gap-5 border-t pt-5 [--border:var(--mp-ivica)] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <RezervacijeDanas rezervacije={sada.rezervacije} />
            {sada.osoblje !== null ? <OsobljeUSmeni broj={sada.osoblje} /> : null}
          </div>
        </div>
      </OkvirSekcije>
    </Kartica>
  );
}
