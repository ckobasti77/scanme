"use client";

// ScanMe Menu V1 (K23) — the floor of the waiter panel (master §10.2, §10.3;
// mockups 06, 08, 12, 13): two views of the same tables — `Raspored` (the
// schematic plan) and `Tabela` (columns per kind of request, with a search) —
// switched in place, the legend under them, and the count of what is active
// in the waiter's zone. Choosing a table hands it to the panel, which turns
// its ONE contextual pane into the table detail (§10.2: no second panel).
//
// Presentation only: the panel passes the floor, the zone-filtered requests,
// the occupancy (only with the module) and the clock.

import { LayoutGrid, Rows3, Search, SearchX, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import type { TableKind } from "@/lib/menu/table-summary";
import { cn } from "@/lib/utils";
import { IkonicaDugme } from "../../zajednicko/dugme";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { KonobarSala, KonobarZahtev, KonobarZauzetost } from "../model";
import { usePragKasnjenja } from "../prag";
import { Legenda } from "./legenda";
import { mestaSale } from "./pogled";
import { RasporedSale } from "./raspored";
import { TabelaSale } from "./tabela";

const t = menuKonobarSr;

/** The kinds the floor shows today; K25 adds "reservation" (its column, its badge, its legend entry). */
export const SALA_VRSTE: readonly TableKind[] = ["call", "order", "bill"];

export type SalaPrikaz = "raspored" | "tabela";

export function Sala({
  sala,
  zahtevi,
  zauzetost,
  filterZoneId,
  sadaMs,
  izabranoId,
  onIzaberi,
  prikaz,
  onPrikaz,
  podsetnik,
  pocetnaPretraga = "",
  zonaNaziv = null,
  napomena,
}: {
  /** undefined = loading. */
  sala: KonobarSala | undefined;
  /** The active requests the waiter sees (already zone-filtered). */
  zahtevi: readonly KonobarZahtev[];
  zauzetost: KonobarZauzetost | undefined;
  filterZoneId: string | null;
  sadaMs: number;
  izabranoId: string | null;
  onIzaberi(id: string): void;
  prikaz: SalaPrikaz;
  onPrikaz(prikaz: SalaPrikaz): void;
  /** Positions whose reminder is flashing now. */
  podsetnik: ReadonlySet<string>;
  pocetnaPretraga?: string;
  /** The chosen zone (null = every zone): said under the heading, so a filtered floor never looks complete. */
  zonaNaziv?: string | null;
  /** A strip under the header (what waits in the other zones). */
  napomena?: ReactNode;
}) {
  const [pretraga, setPretraga] = useState(pocetnaPretraga);
  const pretragaId = useId();
  const prag = usePragKasnjenja();
  const modulZauzetosti = Boolean(sala?.occupancyEnabled && zauzetost && !zauzetost.off);

  const sva = useMemo(
    () => (sala ? mestaSale({ sala, zahtevi, zauzetost, filterZoneId }) : []),
    [sala, zahtevi, zauzetost, filterZoneId],
  );
  const nadjena = useMemo(
    () => (sala && pretraga.trim() ? mestaSale({ sala, zahtevi, zauzetost, filterZoneId, pretraga }) : sva),
    [sala, zahtevi, zauzetost, filterZoneId, pretraga, sva],
  );
  const aktivnih = zahtevi.length;

  return (
    <section aria-labelledby="sala-naslov" className="grid content-start gap-4" data-sala={prikaz}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="sala-naslov" className="text-2xl font-bold leading-tight tracking-[-0.01em] text-[var(--mp-tekst)]">
          {t.sala.naslov}
        </h2>
        <div
          role="group"
          aria-label={t.sala.prikaz}
          className="inline-flex rounded-full border bg-[var(--mp-povrsina-utisana)] p-1 [--border:var(--mp-ivica)]"
        >
          {(
            [
              { kljuc: "raspored", ikonica: LayoutGrid, oznaka: t.sala.raspored },
              { kljuc: "tabela", ikonica: Rows3, oznaka: t.sala.tabela },
            ] as const
          ).map(({ kljuc, ikonica: Ikonica, oznaka }) => {
            const izabran = prikaz === kljuc;
            return (
              <button
                key={kljuc}
                type="button"
                aria-pressed={izabran}
                onClick={() => onPrikaz(kljuc)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-base font-semibold [--button-radius:999px] transition-colors duration-[var(--mp-trajanje-1)]",
                  izabran
                    ? "bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)] shadow-[var(--mp-senka-xs)]"
                    : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina)]",
                )}
              >
                <Ikonica aria-hidden="true" strokeWidth={2} className="size-5" />
                {oznaka}
              </button>
            );
          })}
        </div>
        {sala ? (
          <p className="inline-flex items-center gap-2 text-[0.9375rem] font-semibold tabular-nums text-[var(--mp-tekst)]">
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-full", aktivnih ? "bg-[var(--mp-info)]" : "bg-[var(--mp-ivica-kontrole)]")}
            />
            {aktivnih ? fmt(t.zaglavlje.aktivni[srPluralCategory(aktivnih)], { n: aktivnih }) : t.zaglavlje.bezAktivnih}
          </p>
        ) : null}
      </header>

      {zonaNaziv ? (
        <p className="-mt-2 text-[0.9375rem] font-semibold text-[var(--mp-tekst-sporedni)]" data-sala-zona>
          {fmt(t.sala.zonaPodnaslov, { zona: zonaNaziv })}
        </p>
      ) : null}

      {napomena}

      {sala && sala.positions.length > 0 ? (
        <Legenda vrste={SALA_VRSTE} pragMin={prag} zauzetost={modulZauzetosti} tabela={prikaz === "tabela"} />
      ) : null}

      {prikaz === "tabela" && sala && sala.positions.length > 0 ? (
        <div className="relative max-w-[28rem]">
          <label htmlFor={pretragaId} className="sr-only">
            {t.sala.pretragaOznaka}
          </label>
          <Search aria-hidden="true" strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[var(--mp-tekst-sporedni)]" />
          <input
            id={pretragaId}
            type="search"
            inputMode="search"
            autoComplete="off"
            value={pretraga}
            onChange={(event) => setPretraga(event.target.value)}
            placeholder={t.sala.pretraga}
            className="min-h-12 w-full rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] pl-11 pr-12 text-base text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] placeholder:text-[var(--mp-tekst-sporedni)]"
          />
          {pretraga ? (
            <IkonicaDugme
              ikonica={X}
              oznaka={t.sala.ocistiPretragu}
              onClick={() => setPretraga("")}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            />
          ) : null}
        </div>
      ) : null}

      {sala === undefined ? (
        <UcitavanjeStanje oblik={prikaz === "tabela" ? "tabela" : "kartice"} redova={4} />
      ) : sala.positions.length === 0 ? (
        <PraznoStanje ikonica={LayoutGrid} naslov={t.sala.prazno.naslov} opis={t.sala.prazno.opis} />
      ) : sva.length === 0 ? (
        <PraznoStanje ikonica={LayoutGrid} naslov={t.sala.praznoZona.naslov} opis={t.sala.praznoZona.opis} />
      ) : prikaz === "raspored" ? (
        <RasporedSale sala={sala} mesta={sva} sadaMs={sadaMs} izabranoId={izabranoId} podsetnik={podsetnik} onIzaberi={onIzaberi} />
      ) : nadjena.length === 0 ? (
        <PraznoStanje ikonica={SearchX} naslov={t.sala.praznoPretraga.naslov} opis={t.sala.praznoPretraga.opis} />
      ) : (
        <TabelaSale
          mesta={nadjena}
          sadaMs={sadaMs}
          izabranoId={izabranoId}
          onIzaberi={onIzaberi}
          prikaziZonu={sala.zones.length > 0}
          zauzetost={modulZauzetosti}
          vrste={SALA_VRSTE}
        />
      )}

    </section>
  );
}
