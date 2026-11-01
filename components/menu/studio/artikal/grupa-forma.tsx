"use client";

// ScanMe Menu V1 — the rules of an add-on group (K15; master §5.7, §7.5): its
// name, one or several choices, required or optional, and — as an advanced
// setting, only for several choices — the minimum and maximum. The rules are
// checked by lib/menu/addons.ts (the server's only rules source) before they
// are sent; a contradiction is said in the form.

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { GrupaFormaProvera, GrupaFormaStanje } from "@/lib/menu/studio/article-form";
import { cn } from "@/lib/utils";
import { Prekidac } from "../../zajednicko/prekidac";
import { IzborSegment, OZNAKA_KLASA, POLJE_KLASA } from "./polja";

const d = menuStudioSr.artikal.dodaci;

export function GrupaForma({
  forma,
  onForma,
  greska,
  onemoguceno = false,
}: {
  forma: GrupaFormaStanje;
  onForma: (forma: GrupaFormaStanje) => void;
  greska: GrupaFormaProvera | null;
  onemoguceno?: boolean;
}) {
  const id = useId();
  const [napredno, setNapredno] = useState(forma.min !== "" || forma.max !== "");
  const problem = greska && !greska.ok ? greska.greska : null;
  return (
    <div className="grid gap-4" data-grupa-forma="">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-naziv`} className={OZNAKA_KLASA}>
          {d.nazivGrupe}
        </label>
        <input
          id={`${id}-naziv`}
          value={forma.naziv}
          autoComplete="off"
          placeholder={d.nazivPrimer}
          disabled={onemoguceno}
          aria-invalid={problem === "naziv" || problem === "predugo" ? true : undefined}
          onChange={(event) => onForma({ ...forma, naziv: event.target.value })}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
        />
        {problem === "naziv" || problem === "predugo" ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {problem === "naziv" ? menuStudioSr.opste.nazivObavezan : fmt(menuStudioSr.artikal.osnovno.greske.predugo, { n: MENU_TEXT.addonGroupName })}
          </p>
        ) : null}
      </div>
      <IzborSegment<"single" | "multiple">
        oznaka={d.izbor}
        izabrano={forma.izbor}
        onIzbor={(izbor) => onForma({ ...forma, izbor, ...(izbor === "single" ? { min: "", max: "" } : {}) })}
        onemoguceno={onemoguceno}
        vrednosti={[
          { vrednost: "single", tekst: d.jedan },
          { vrednost: "multiple", tekst: d.vise },
        ]}
      />
      <Prekidac
        naziv={d.obavezna}
        opis={d.obaveznaOpis}
        checked={forma.obavezna}
        disabled={onemoguceno}
        onChange={(event) => onForma({ ...forma, obavezna: event.target.checked, ...(event.target.checked ? {} : { min: "" }) })}
      />
      {forma.izbor === "multiple" ? (
        <div className="grid gap-3">
          <button
            type="button"
            aria-expanded={napredno}
            aria-controls={`${id}-napredno`}
            onClick={() => setNapredno(!napredno)}
            className="inline-flex min-h-[var(--mp-meta)] items-center gap-2 justify-self-start rounded-[var(--mp-radius-dugme)] px-1 text-sm font-semibold [--button-radius:var(--mp-radius-dugme)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]"
          >
            <ChevronRight aria-hidden="true" strokeWidth={2} className={cn("size-4 transition-transform motion-reduce:transition-none", napredno && "rotate-90")} />
            {d.napredno}
          </button>
          <div id={`${id}-napredno`} hidden={!napredno} className="grid gap-2">
            <div className="grid max-w-[18rem] grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-min`} className={OZNAKA_KLASA}>
                  {d.min}
                </label>
                <input
                  id={`${id}-min`}
                  inputMode="numeric"
                  value={forma.min}
                  disabled={onemoguceno || !forma.obavezna}
                  aria-describedby={`${id}-napredno-opis`}
                  aria-invalid={problem === "pravila" ? true : undefined}
                  onChange={(event) => onForma({ ...forma, min: event.target.value })}
                  className={cn(POLJE_KLASA, "h-[var(--mp-meta)] tabular-nums")}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-max`} className={OZNAKA_KLASA}>
                  {d.max}
                </label>
                <input
                  id={`${id}-max`}
                  inputMode="numeric"
                  value={forma.max}
                  disabled={onemoguceno}
                  aria-describedby={`${id}-napredno-opis`}
                  aria-invalid={problem === "pravila" ? true : undefined}
                  onChange={(event) => onForma({ ...forma, max: event.target.value })}
                  className={cn(POLJE_KLASA, "h-[var(--mp-meta)] tabular-nums")}
                />
              </div>
            </div>
            <p id={`${id}-napredno-opis`} className="text-sm text-[var(--mp-tekst-sporedni)]">
              {d.naprednoOpis}
            </p>
          </div>
        </div>
      ) : null}
      {problem === "pravila" ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {menuDomenSr.errors["article/addon_rules_invalid"]}
        </p>
      ) : null}
    </div>
  );
}
