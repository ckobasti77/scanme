"use client";

// ScanMe Menu V1 — before a LINKED add-on group changes (K15; master §5.7:
// "pre izmene povezane grupe pregled pogođenih artikala"). The dialog lists
// the articles the group is on (this one marked) and asks what the change is
// for: every one of them ("Izmeni za sve") or only this article, which gets an
// independent copy at its first change ("Nezavisna kopija"). Nothing is
// written here: the choice opens the group for editing in that scope.

import { useEffect, useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioGrupaDodataka, StudioIshod, StudioUticajGrupe } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";

const u = menuStudioSr.artikal.uticaj;
const PRIKAZANO = 8;

export type OpsegIzmene = "sve" | "kopija";

function mnozina(grupa: { one: string; few: string; many: string }, n: number, vrednosti: Record<string, string | number> = {}) {
  return fmt(grupa[srPluralCategory(n)], { n, ...vrednosti });
}

export function UticajGrupeDijalog({
  grupa,
  artikal,
  ucitaj,
  pocetno = null,
  onNastavi,
  onZatvori,
}: {
  /** The linked group about to change (null = closed). */
  grupa: StudioGrupaDodataka | null;
  artikal: { id: string; naziv: string };
  ucitaj: (grupaId: string) => Promise<StudioIshod<StudioUticajGrupe>>;
  /** The izlog may open with a choice made. */
  pocetno?: OpsegIzmene | null;
  onNastavi: (opseg: OpsegIzmene) => void;
  onZatvori: () => void;
}) {
  const id = useId();
  const [uticaj, setUticaj] = useState<{ grupaId: string; vrednost: StudioUticajGrupe | "greska" } | null>(null);
  const [opseg, setOpseg] = useState<OpsegIzmene | null>(pocetno);
  const grupaId = grupa?.id ?? null;

  useEffect(() => {
    if (!grupaId) return;
    let aktivno = true;
    void ucitaj(grupaId).then((ishod) => {
      if (aktivno) setUticaj({ grupaId, vrednost: ishod.ok ? ishod.vrednost : "greska" });
    });
    return () => {
      aktivno = false;
    };
  }, [grupaId, ucitaj]);

  const podaci = uticaj && uticaj.grupaId === grupaId ? uticaj.vrednost : null;
  const ukupno = podaci && podaci !== "greska" ? podaci.ukupno : (grupa?.brojArtikala ?? 0);
  // This article first, the others in the order the server gave.
  const artikli =
    podaci && podaci !== "greska"
      ? [...podaci.artikli.filter((a) => a.id === artikal.id), ...podaci.artikli.filter((a) => a.id !== artikal.id)]
      : [];
  const ostalo = Math.max(0, ukupno - Math.min(artikli.length, PRIKAZANO));

  const zatvori = () => {
    setOpseg(pocetno);
    onZatvori();
  };

  return (
    <StudioDijalog
      otvoreno={grupa !== null}
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : zatvori())}
      naslov={grupa ? fmt(u.naslov, { naziv: grupa.naziv }) : ""}
      opis={mnozina(u.opis, ukupno)}
      podnozje={
        <>
          {opseg === null ? (
            <p id={`${id}-savet`} className="mr-auto text-sm text-[var(--mp-tekst)]">
              {u.izaberiPrvo}
            </p>
          ) : null}
          <Dugme vrsta="tiho" onClick={zatvori}>
            {u.otkazi}
          </Dugme>
          <Dugme
            vrsta="primarno"
            disabled={opseg === null}
            aria-describedby={opseg === null ? `${id}-savet` : undefined}
            data-nastavi-uticaj=""
            onClick={() => {
              if (opseg) onNastavi(opseg);
              setOpseg(pocetno);
            }}
          >
            {u.nastavi}
          </Dugme>
        </>
      }
    >
      <div className="grid gap-5" data-uticaj-grupe={grupaId ?? ""}>
        <section aria-labelledby={`${id}-artikli`} className="grid gap-2">
          <h3 id={`${id}-artikli`} className="text-sm font-semibold">
            {u.artikli}
          </h3>
          {podaci === null ? (
            <UcitavanjeStanje oblik="lista" redova={3} oznaka={u.ucitava} />
          ) : podaci === "greska" ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {u.greska}
            </p>
          ) : (
            <ul className="grid gap-1 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-ivica)]" data-pogodjeni-artikli="">
              {artikli.slice(0, PRIKAZANO).map((stavka) => (
                <li key={stavka.id} className="flex min-h-8 items-center justify-between gap-3 text-[0.9375rem]">
                  <span className={cn("min-w-0 [overflow-wrap:anywhere]", stavka.id === artikal.id && "font-semibold")}>{stavka.naziv}</span>
                  {stavka.id === artikal.id ? <span className="shrink-0 text-xs font-medium text-[var(--mp-tekst-sporedni)]">{u.ovaj}</span> : null}
                </li>
              ))}
              {ostalo > 0 ? <li className="text-sm text-[var(--mp-tekst-sporedni)]">{mnozina(u.jos, ostalo)}</li> : null}
            </ul>
          )}
        </section>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{u.izbor}</legend>
          {(
            [
              { vrednost: "sve", naslov: u.zaSve, opis: mnozina(u.zaSveOpis, ukupno) },
              { vrednost: "kopija", naslov: u.kopija, opis: fmt(u.kopijaOpis, { naziv: artikal.naziv }) },
            ] as const
          ).map((stavka) => (
            <label
              key={stavka.vrednost}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-3 py-3",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                opseg === stavka.vrednost ? "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)]" : "[--border:var(--mp-ivica-kontrole)]",
              )}
            >
              <input
                type="radio"
                name={`${id}-opseg`}
                value={stavka.vrednost}
                checked={opseg === stavka.vrednost}
                onChange={() => setOpseg(stavka.vrednost)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--mp-mastilo)]"
                data-opseg={stavka.vrednost}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{stavka.naslov}</span>
                <span className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{stavka.opis}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </StudioDijalog>
  );
}
