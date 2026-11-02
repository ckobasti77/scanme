"use client";

// ScanMe Menu V1 — the controls of Izgled (K17): a group with its heading and
// save state, and a choice of cards as REAL radio buttons (one tab stop,
// arrows move, the label is the whole card), with a locked Premium card that
// stays visible with its reason (MENU-UX §5.2 "zaključano"). Panel tokens
// only; the venue's colours and faces live inside the card content.

import { Check, Lock, Sparkles } from "lucide-react";
import { useId, type ReactNode } from "react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { CasValue } from "@/lib/menu/cas";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { cn } from "@/lib/utils";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { ProblemKljuca, StanjeKljuca } from "../artikal/polja";

const t = menuStudioSr.izgled;

/** "Premium": a padlock only when the account cannot use it (an available Premium choice is not locked). */
export function PremiumOznaka({ zakljucano = true }: { zakljucano?: boolean }) {
  return (
    <StatusOznaka ton="neutralno" ikonica={zakljucano ? Lock : Sparkles} velicina="mala">
      {t.premium}
    </StatusOznaka>
  );
}

/** One area of Izgled: a heading (h2), one sentence, the save state of its queue key(s). */
export function GrupaIzgleda({
  id,
  naslov,
  opis,
  red,
  kljucevi,
  prikaz,
  children,
}: {
  id: string;
  naslov: string;
  opis?: ReactNode;
  red: AutosaveRed;
  kljucevi: readonly string[];
  /** Words for a saved value in a conflict. */
  prikaz?: (vrednost: CasValue) => string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-naslov`} data-grupa-izgleda={id} className="grid min-w-0 gap-3 border-t pt-5 [--border:var(--mp-ivica)] first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-naslov`} className="text-base font-semibold tracking-[-0.01em]">
          {naslov}
        </h2>
        {kljucevi.map((kljuc) => (
          <StanjeKljuca key={kljuc} red={red} kljuc={kljuc} />
        ))}
      </div>
      {opis ? <p className="-mt-1.5 max-w-[60ch] text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{opis}</p> : null}
      {kljucevi.map((kljuc) => (
        <ProblemKljuca key={kljuc} red={red} kljuc={kljuc} prikaz={prikaz ?? (() => t.drugiIzbor)} />
      ))}
      {children}
    </section>
  );
}

export type KarticaIzbora<T extends string> = {
  vrednost: T;
  /** The accessible name (also shown under the content unless `bezNaziva`). */
  naziv: string;
  opis?: string;
  sadrzaj?: ReactNode;
  /** Premium and not available on this account: visible, reachable, not choosable, with the reason. */
  zakljucano?: boolean;
  /** Premium and available (a quiet mark). */
  premium?: boolean;
};

/**
 * A choice among cards. Each card is a label around a visually hidden radio
 * (the radio stays the focus and click target); the chosen card has an ink
 * ring and a check mark, never colour alone.
 */
export function IzborKartica<T extends string>({
  oznaka,
  skrivenaOznaka = false,
  vrednosti,
  izabrano,
  onIzbor,
  onemoguceno = false,
  razlog,
  kolone,
  velicina = "obicna",
  kartica,
  opisUzano = false,
}: {
  oznaka: string;
  skrivenaOznaka?: boolean;
  vrednosti: readonly KarticaIzbora<T>[];
  izabrano: T | null;
  onIzbor: (vrednost: T) => void;
  onemoguceno?: boolean;
  /** Why locked cards are locked (shown once, under the cards). */
  razlog?: string;
  kolone: string;
  velicina?: "obicna" | "mala";
  /** Extra classes of each card (e.g. picture beside the name in a narrow column). */
  kartica?: string;
  /** The description shows only while the column is narrow (the wide layout says it once, below). */
  opisUzano?: boolean;
}) {
  const ime = useId();
  const razlogId = `${ime}-razlog`;
  const imaZakljucanih = vrednosti.some((stavka) => stavka.zakljucano);
  return (
    <fieldset className="grid min-w-0 gap-2" disabled={onemoguceno}>
      <legend className={cn("mb-1 text-sm font-semibold", skrivenaOznaka && "sr-only")}>{oznaka}</legend>
      <div className={cn("grid min-w-0 gap-2", kolone)}>
        {vrednosti.map((stavka) => {
          const aktivno = stavka.vrednost === izabrano;
          return (
            <label
              key={stavka.vrednost}
              data-izbor={stavka.vrednost}
              data-izabrano={aktivno ? "" : undefined}
              data-zakljucano={stavka.zakljucano ? "" : undefined}
              className={cn(
                "group/izbor relative grid min-w-0 cursor-pointer content-start gap-2 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] text-left",
                velicina === "mala" ? "p-1.5" : "p-2",
                "transition-[border-color,box-shadow] duration-[var(--mp-trajanje-1)] motion-reduce:transition-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                "has-[:disabled]:cursor-not-allowed has-[[aria-disabled=true]]:cursor-not-allowed",
                aktivno
                  ? "bg-[var(--mp-akcent-meko)] [--border:var(--mp-mastilo)] shadow-[inset_0_0_0_1px_var(--mp-mastilo)]"
                  : "[--border:var(--mp-ivica)] hover:[--border:var(--mp-ivica-kontrole)]",
                kartica,
              )}
            >
              <input
                type="radio"
                name={ime}
                value={stavka.vrednost}
                checked={aktivno}
                // A locked card stays reachable (Tab, arrows) so its reason is heard; it is never chosen.
                aria-disabled={stavka.zakljucano || undefined}
                aria-describedby={stavka.zakljucano && razlog ? razlogId : undefined}
                onChange={() => {
                  if (!stavka.zakljucano) onIzbor(stavka.vrednost);
                }}
                className="absolute inset-0 z-10 m-0 size-full cursor-[inherit] appearance-none rounded-[inherit] opacity-0"
              />
              {stavka.sadrzaj ? (
                <span aria-hidden="true" className="block min-w-0">
                  {stavka.sadrzaj}
                </span>
              ) : null}
              <span className={cn("flex min-w-0 items-start gap-2", velicina === "mala" ? "px-1 pb-0.5" : "px-1.5 pb-1")}>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn("font-semibold leading-snug [overflow-wrap:anywhere]", velicina === "mala" ? "text-[0.8125rem]" : "text-sm")}>
                    {stavka.naziv}
                  </span>
                  {stavka.opis ? (
                    <span className={cn("text-[0.8125rem] leading-snug text-[var(--mp-tekst-sporedni)]", opisUzano && "@md:hidden")}>{stavka.opis}</span>
                  ) : null}
                  {stavka.zakljucano || stavka.premium ? (
                    <span className="pt-0.5">
                      <PremiumOznaka zakljucano={Boolean(stavka.zakljucano)} />
                    </span>
                  ) : null}
                </span>
                {velicina === "mala" ? null : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-px grid size-5 shrink-0 place-items-center rounded-full border",
                      aktivno
                        ? "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent)] text-[var(--mp-na-akcentu)]"
                        : "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] text-transparent",
                    )}
                  >
                    <Check strokeWidth={3} className="size-3" />
                  </span>
                )}
              </span>
              {velicina === "mala" && aktivno ? (
                // Small cards (three in a row on a phone): the check is a badge on the corner, so the name keeps its line.
                <span
                  aria-hidden="true"
                  data-kvacica=""
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-[var(--mp-akcent)] text-[var(--mp-na-akcentu)] shadow-[0_0_0_2px_var(--mp-povrsina)] [--border:var(--mp-mastilo)]"
                >
                  <Check strokeWidth={3} className="size-3" />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {imaZakljucanih && razlog ? (
        <p id={razlogId} className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-[var(--mp-tekst)]">
          <Lock aria-hidden="true" strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
          {razlog}
        </p>
      ) : null}
    </fieldset>
  );
}
