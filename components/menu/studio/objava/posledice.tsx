"use client";

// ScanMe Menu V1 — "Šta će gosti videti drugačije" in the publish dialog (K18;
// master: "broj izmenjenih cena, novih i uklonjenih artikala, strukturnih
// izmena"). One line per kind with its icon, the number in words, and the
// changed prices themselves (old → new) behind a disclosure, so the owner can
// check what guests will pay before they publish. Mockup 05 is the direction
// (icon tiles, short lines); its numbers are not data.

import { ArrowRight, ListOrdered, Minus, Plus, Tag } from "lucide-react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuStudioMnozina } from "@/lib/i18n/types";
import type { StudioPregledObjave } from "@/lib/menu/studio/model";
import { formatCenaPolje } from "@/lib/menu/studio/price-input";
import { redoviPosledica, type RedPosledica } from "@/lib/menu/studio/publish-view";
import { cn } from "@/lib/utils";

const t = menuStudioSr.objava;
const p = menuStudioSr.objavljivanje.modal.posledice;

export function broj(mnozina: MenuStudioMnozina, n: number): string {
  return fmt(mnozina[srPluralCategory(n)], { n });
}

/** Changed prices up to this many are open at once (the costliest thing to get wrong). */
const POKAZI_CENE = 5;

const IKONICE = { cene: Tag, novi: Plus, uklonjeni: Minus, strukturne: ListOrdered } as const;
const TONOVI = {
  cene: "bg-[var(--mp-upozorenje-meko)] text-[var(--mp-upozorenje)]",
  novi: "bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]",
  uklonjeni: "bg-[var(--mp-povrsina-utisana)] text-[var(--mp-tekst)]",
  strukturne: "bg-[var(--mp-povrsina-utisana)] text-[var(--mp-tekst)]",
} as const;

function tekstReda(red: RedPosledica): string {
  if (red.vrsta === "strukturne") return broj(t.strukturne, red.broj);
  return broj(t[red.vrsta], red.broj);
}

function cenaTekst(cena: number | null): string {
  return cena === null ? p.bezCene : `${formatCenaPolje(cena)} ${menuStudioSr.red.rsd}`;
}

export function PosledicePregled({ pregled, vracenoIz }: { pregled: StudioPregledObjave; vracenoIz: number | null }) {
  const redovi = redoviPosledica(pregled.sazetak);
  const cene = pregled.promeneCena ?? [];
  const josCena = Math.max(0, (pregled.sazetak?.cene ?? 0) - cene.length);
  return (
    <section aria-labelledby="objava-posledice" className="grid gap-2" data-objava-posledice="">
      <h3 id="objava-posledice" className="font-semibold">
        {p.naslov}
      </h3>
      {pregled.stanje === "never_published" ? <p>{t.prvaObjava}</p> : null}
      {vracenoIz !== null ? <p>{fmt(menuStudioSr.objavljivanje.nacrtIz, { broj: vracenoIz })}.</p> : null}
      {!pregled.menjaSe ? (
        <p role="status">{t.bezPromena}</p>
      ) : (
        <ul className="grid divide-y rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] [--border:var(--mp-ivica)] [&>li]:[--border:var(--mp-ivica)]">
          {redovi.map((red) => {
            const Ikonica = IKONICE[red.vrsta];
            return (
              <li key={red.vrsta} className="flex items-start gap-3 px-3 py-2.5" data-posledica={red.vrsta}>
                <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-full", TONOVI[red.vrsta])}>
                  <Ikonica strokeWidth={2} className="size-4" />
                </span>
                <span className="grid min-w-0 gap-0.5 pt-1">
                  <span className="font-medium">{tekstReda(red)}</span>
                  {red.vrsta === "strukturne" ? (
                    <span className="text-sm text-[var(--mp-tekst-sporedni)]">
                      {red.detalji.map((detalj) => broj(p.strukturneDetalji[detalj.vrsta], detalj.broj)).join(" · ")}
                    </span>
                  ) : null}
                  {red.vrsta === "cene" && cene.length > 0 ? (
                    <details className="group text-sm" data-objava-cene="" open={cene.length <= POKAZI_CENE}>
                      <summary className="-mx-1 inline-flex min-h-[var(--mp-meta)] cursor-pointer items-center rounded-[var(--mp-radius-kontrola)] px-1 font-medium text-[var(--mp-akcent-tekst)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]">
                        {p.pogledajCene}
                      </summary>
                      <ul className="mt-1 grid gap-1">
                        {cene.map((cena) => (
                          <li key={cena.artikalKey} className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="min-w-0 [overflow-wrap:anywhere]">{cena.naziv}</span>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                              <span className="sr-only">{p.cenaPre}</span>
                              <span className="text-[var(--mp-tekst-sporedni)] line-through decoration-1">{cenaTekst(cena.pre)}</span>
                              <ArrowRight aria-hidden="true" strokeWidth={2} className="size-3.5" />
                              <span className="sr-only">{p.cenaPosle}</span>
                              <span className="font-semibold">{cenaTekst(cena.posle)}</span>
                            </span>
                          </li>
                        ))}
                        {josCena > 0 ? <li className="text-[var(--mp-tekst-sporedni)]">{broj(p.josCena, josCena)}</li> : null}
                      </ul>
                    </details>
                  ) : null}
                </span>
              </li>
            );
          })}
          {redovi.length === 0 ? <li className="px-3 py-2.5">{t.ostalo}</li> : null}
        </ul>
      )}
    </section>
  );
}
