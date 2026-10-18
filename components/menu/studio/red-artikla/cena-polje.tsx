"use client";

// ScanMe Menu V1 — the inline price of an article row (K10; master §5.3:
// "U glavnom pregledu `Kompletan meni` klijent može direktno promeniti cenu u
// redu artikla, bez otvaranja detalja"). One base price, shared by every
// standard page. Enter or leaving the field saves into the draft; Escape puts
// back the price it had. What the owner typed is checked here first (whole
// dinars), so a wrong value never reaches the server.

import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StanjePolja } from "@/lib/menu/studio/autosave-queue";
import { formatCenaPolje, parseCenaUnos, type CenaGreska } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";

const t = menuStudioSr;

export function CenaPolje({
  id,
  naziv,
  vrednost,
  stanje,
  sacuvanoU,
  onemoguceno,
  opisId,
  onPotvrdi,
  onGreska,
}: {
  id: string;
  /** The article name: the field's accessible name says whose price it is. */
  naziv: string;
  /** The price shown (a queued value wins over the server value). */
  vrednost: number | null;
  stanje: StanjePolja | undefined;
  sacuvanoU: number | undefined;
  onemoguceno: boolean;
  /** Id of the row's message (error, conflict) for aria-describedby. */
  opisId: string;
  onPotvrdi: (nova: number | null, ocekivano: number | null) => void;
  /** The local check of what was typed (null = fine). */
  onGreska: (greska: CenaGreska | null) => void;
}) {
  const [uredjuje, setUredjuje] = useState(false);
  const [tekst, setTekst] = useState("");
  const [ocekivano, setOcekivano] = useState<number | null>(null);
  const [neispravno, setNeispravno] = useState(false);
  const [ugaseno, setUgaseno] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (sacuvanoU === undefined) return;
    const handle = setTimeout(() => setUgaseno(sacuvanoU), 1500);
    return () => clearTimeout(handle);
  }, [sacuvanoU]);

  const prikaz = uredjuje || neispravno ? tekst : formatCenaPolje(vrednost);
  const faza = stanje?.faza;
  const cuvaSe = faza === "ceka" || faza === "salje";
  const problem = neispravno || faza === "greska" || faza === "konflikt";
  const sacuvano = !cuvaSe && !problem && sacuvanoU !== undefined && ugaseno !== sacuvanoU;

  const potvrdi = () => {
    const unos = parseCenaUnos(tekst);
    if (!unos.ok) {
      setNeispravno(true);
      onGreska(unos.greska);
      return false;
    }
    setNeispravno(false);
    onGreska(null);
    if (unos.cena !== ocekivano) onPotvrdi(unos.cena, ocekivano);
    setTekst(formatCenaPolje(unos.cena));
    setOcekivano(unos.cena);
    return true;
  };

  const naTaster = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (potvrdi()) event.currentTarget.select();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTekst(formatCenaPolje(vrednost));
      setNeispravno(false);
      onGreska(null);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="relative inline-flex items-center">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          data-no-drag=""
          data-cena-polje=""
          aria-label={fmt(t.red.cena, { naziv })}
          aria-invalid={problem || undefined}
          aria-describedby={problem ? opisId : undefined}
          disabled={onemoguceno}
          placeholder="—"
          value={prikaz}
          onFocus={(event) => {
            setUredjuje(true);
            if (!neispravno) setTekst(formatCenaPolje(vrednost));
            setOcekivano(vrednost);
            event.currentTarget.select();
          }}
          onChange={(event) => setTekst(event.target.value)}
          onKeyDown={naTaster}
          onBlur={() => {
            potvrdi();
            setUredjuje(false);
          }}
          className={cn(
            "h-[var(--mp-meta)] w-[6.5rem] rounded-[var(--mp-radius-kontrola)] border bg-transparent pl-3 pr-11 text-right text-[0.9375rem] font-semibold tabular-nums text-[var(--mp-tekst)]",
            "[--border:transparent] hover:[--border:var(--mp-ivica-kontrole)] focus:[--border:var(--mp-mastilo)] focus:bg-[var(--mp-povrsina)]",
            "placeholder:text-[var(--mp-tekst-sporedni)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:[--border:transparent]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]",
            problem && "[--border:var(--mp-opasnost)] hover:[--border:var(--mp-opasnost)]",
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 text-xs font-medium text-[var(--mp-tekst-sporedni)]"
        >
          {t.red.rsd}
        </span>
      </span>
      <span className="grid size-5 place-items-center" data-cena-stanje={cuvaSe ? "cuva-se" : problem ? "problem" : sacuvano ? "sacuvano" : "mirno"}>
        {cuvaSe ? (
          <>
            <LoaderCircle aria-hidden="true" strokeWidth={2} className="size-4 animate-spin text-[var(--mp-tekst-sporedni)] motion-reduce:animate-none" />
            <span className="sr-only">{t.red.cuvaSe}</span>
          </>
        ) : problem ? (
          <TriangleAlert aria-hidden="true" strokeWidth={2} className="size-4 text-[var(--mp-opasnost)]" />
        ) : sacuvano ? (
          <>
            <CircleCheck aria-hidden="true" strokeWidth={2} className="size-4 text-[var(--mp-uspeh)]" />
            <span className="sr-only">{t.red.sacuvano}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
