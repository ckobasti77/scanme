"use client";

// ScanMe Menu V1 — the article detail opened from `Objavi` (K18; master §6.1:
// errors "vode do mesta greške"). The dialog closes when the owner goes to
// the article, so the detail itself says what blocked (or warned) and what to
// do, under the title. An error is checked again on what the editor shows now
// (lib/menu/studio/publish-view.ts problemResen): once it is fixed the strip
// says so and offers to open Objavi again for the whole menu.

import { CircleCheck, OctagonAlert, TriangleAlert, Upload } from "lucide-react";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { problemResen, type StanjeArtiklaZaProveru } from "@/lib/menu/studio/publish-view";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";

const t = menuStudioSr.objavljivanje.problemObjave;

/** What led here from the publish dialog: the codes of this article and whether they were errors. */
export type ProblemIzObjave = { kodovi: readonly string[]; greska: boolean };

function tekst(kod: string): string {
  return (menuDomenSr.publishIssues as Record<string, string>)[kod] ?? kod;
}

function savet(kod: string): string | null {
  return (t.saveti as Record<string, string>)[kod] ?? null;
}

export function ProblemObjaveTraka({
  problem,
  stanje,
  onObjavi,
}: {
  problem: ProblemIzObjave;
  stanje: StanjeArtiklaZaProveru;
  /** Opens Objavi again (null = not offered). */
  onObjavi: (() => void) | null;
}) {
  const otvoreni = problem.kodovi.filter((kod) => problemResen(kod, stanje) !== true);
  const reseno = problem.greska && otvoreni.length === 0;
  const Ikonica = reseno ? CircleCheck : problem.greska ? OctagonAlert : TriangleAlert;
  return (
    <div
      role={reseno ? "status" : "alert"}
      data-problem-objave={reseno ? "reseno" : problem.greska ? "greska" : "upozorenje"}
      className={cn(
        "grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-sm",
        reseno
          ? "[--border:var(--mp-uspeh-ivica)] bg-[var(--mp-uspeh-meko)]"
          : problem.greska
            ? "[--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
            : "[--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]",
      )}
    >
      <p className="flex items-start gap-2">
        <Ikonica
          aria-hidden="true"
          strokeWidth={2}
          className={cn(
            "mt-0.5 size-4 shrink-0",
            reseno ? "text-[var(--mp-uspeh)]" : problem.greska ? "text-[var(--mp-opasnost)]" : "text-[var(--mp-upozorenje)]",
          )}
        />
        <span className="grid gap-0.5">
          {reseno ? (
            <span className="font-semibold">{t.reseno}</span>
          ) : (
            <>
              <span className="font-semibold">{problem.greska ? t.greska : t.upozorenje}</span>
              {otvoreni.map((kod) => (
                <span key={kod}>
                  {tekst(kod)}
                  {savet(kod) ? ` ${savet(kod)}` : null}
                </span>
              ))}
            </>
          )}
        </span>
      </p>
      {onObjavi && (reseno || !problem.greska) ? (
        <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Upload} className="justify-self-start" onClick={onObjavi} data-problem-objavi="">
          {t.ponovoObjavi}
        </Dugme>
      ) : null}
    </div>
  );
}
