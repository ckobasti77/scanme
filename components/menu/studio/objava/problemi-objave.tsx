"use client";

// ScanMe Menu V1 — errors and warnings of the publish dialog (K18; master
// §6.1: "greške blokiraju objavu; upozorenja dozvoljavaju objavu tek nakon
// svesne potvrde"). Each article is one line: its name, where it is, what is
// wrong in plain words, and ONE way to it (`Idi na artikal`), so an error
// leads to the place to fix it. Whole-publication warnings (a language without
// confirmed translations) lead to the translations view when there is one.

import { ArrowRight, Languages, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioCiljProblema } from "@/lib/menu/studio/model";
import type { GrupisaniProblemi, ProblemArtikla } from "@/lib/menu/studio/publish-view";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { broj } from "./posledice";

const t = menuStudioSr.objava;
const m = menuStudioSr.objavljivanje.modal;

export function tekstProblema(kod: string): string {
  const tekstovi = menuDomenSr.publishIssues as Record<string, string>;
  return tekstovi[kod] ?? kod;
}

function mesto(cilj: StudioCiljProblema | null): string | null {
  if (!cilj) return null;
  if (cilj.stranica) return fmt(m.greske.naStranici, { stranica: cilj.stranica });
  if (cilj.roomService) return m.greske.roomService;
  return m.greske.bezStranice;
}

export type IdiNaArtikal = (problem: ProblemArtikla) => void;

/** "Engleski" for "en" (the code itself when the language is unknown). */
function nazivJezika(kod: string): string {
  const nazivi = menuStudioSr.posebno.prevodi.jezici as Record<string, string>;
  const naziv = nazivi[kod] ?? kod.toUpperCase();
  return naziv.charAt(0).toLocaleUpperCase("sr") + naziv.slice(1);
}

function RedArtikla({
  problem,
  ton,
  nazivArtikla,
  onIdi,
}: {
  problem: ProblemArtikla;
  ton: "opasnost" | "upozorenje";
  nazivArtikla: (artikalKey: string) => string | null;
  onIdi: IdiNaArtikal | null;
}) {
  const naziv = problem.cilj?.naziv?.trim() || nazivArtikla(problem.artikalKey) || m.greske.bezNaziva;
  const gde = mesto(problem.cilj);
  return (
    <li
      data-problem-artikal={problem.artikalKey}
      className={cn(
        "grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
        ton === "opasnost"
          ? "[--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
          : "[--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]",
      )}
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold [overflow-wrap:anywhere]">{naziv}</span>
        {gde ? <span className="text-sm">{gde}</span> : null}
        {problem.kodovi.map((kod) => (
          <span key={kod} className="text-sm">
            {tekstProblema(kod)}
          </span>
        ))}
      </span>
      {onIdi ? (
        <Dugme
          vrsta="sekundarno"
          velicina="kompaktna"
          ikonica={ArrowRight}
          className="justify-self-start"
          aria-label={fmt(m.greske.idiNaArtikalOznaka, { naziv })}
          onClick={() => onIdi(problem)}
          data-idi-na-artikal={problem.artikalKey}
        >
          {m.greske.idiNaArtikal}
        </Dugme>
      ) : null}
    </li>
  );
}

export function GreskeObjave({
  greske,
  brojUpozorenja,
  nazivArtikla,
  onIdi,
}: {
  greske: GrupisaniProblemi;
  brojUpozorenja: number;
  nazivArtikla: (artikalKey: string) => string | null;
  onIdi: IdiNaArtikal | null;
}) {
  const ukupno = greske.artikli.length + greske.ostali.length;
  return (
    <section aria-labelledby="objava-greske" className="grid gap-2" data-objava-greske="">
      <h3 id="objava-greske" className="flex items-center gap-2 font-semibold text-[var(--mp-opasnost)]">
        <OctagonAlert aria-hidden="true" strokeWidth={2} className="size-5 shrink-0" />
        {t.greskeNaslov}
      </h3>
      <p className="text-sm">
        <span className="font-semibold">{broj(m.greske.broj, ukupno)}.</span> {t.greskeOpis}
      </p>
      <ul className="grid gap-2">
        {greske.artikli.map((problem) => (
          <RedArtikla key={problem.artikalKey} problem={problem} ton="opasnost" nazivArtikla={nazivArtikla} onIdi={onIdi} />
        ))}
        {greske.ostali.map((problem, i) => (
          <li key={`${problem.kod}-${i}`} className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]">
            {tekstProblema(problem.kod)}
          </li>
        ))}
      </ul>
      {brojUpozorenja > 0 ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{broj(m.greske.upozorenjaKasnije, brojUpozorenja)}</p> : null}
    </section>
  );
}

export function UpozorenjaObjave({
  upozorenja,
  nazivArtikla,
  onIdi,
  onOtvoriPrevode,
  children,
}: {
  upozorenja: GrupisaniProblemi;
  nazivArtikla: (artikalKey: string) => string | null;
  onIdi: IdiNaArtikal | null;
  onOtvoriPrevode: (() => void) | null;
  /** The confirmation checkbox. */
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="objava-upozorenja" className="grid gap-2" data-objava-upozorenja="">
      <h3 id="objava-upozorenja" className="flex items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-upozorenje)]" />
        {t.upozorenjaNaslov}
      </h3>
      <p className="text-sm">{m.upozorenja.opis}</p>
      <ul className="grid gap-2">
        {upozorenja.artikli.map((problem) => (
          <RedArtikla key={problem.artikalKey} problem={problem} ton="upozorenje" nazivArtikla={nazivArtikla} onIdi={onIdi} />
        ))}
        {upozorenja.ostali.map((problem, i) => {
          const prevod = problem.kod === "translation_missing" && problem.jezik && problem.broj !== null;
          return (
            <li
              key={`${problem.kod}-${problem.jezik ?? i}`}
              data-problem-objave={problem.kod}
              className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="text-sm">
                {prevod
                  ? fmt(m.upozorenja.jezik[srPluralCategory(problem.broj!)], { jezik: nazivJezika(problem.jezik!), n: problem.broj! })
                  : `${tekstProblema(problem.kod)}${problem.jezik ? ` (${problem.jezik.toUpperCase()})` : ""}`}
              </span>
              {prevod && onOtvoriPrevode ? (
                <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Languages} className="justify-self-start" onClick={onOtvoriPrevode}>
                  {m.upozorenja.otvoriPrevode}
                </Dugme>
              ) : null}
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
