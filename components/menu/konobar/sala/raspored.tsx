"use client";

// ScanMe Menu V1 (K23) — the floor as a schematic plan (master §10.2–§10.3;
// mockups 06, 07, 13; MENU-UX §1.3, §5.11): the zones of "Lokal i QR" with the
// same layout (lib/menu/floor-layout.ts placeLayouts, so the plan looks
// exactly as the owner arranged it in K20), and on every table ALL its
// parallel states as badges standing on its top edge — call, order, bill
// and, from K25, the bound reservation (CalendarClock, its time, then "kasni"
// after the venue's hold). The badges are a column above the table (the oldest
// on top), each with its own time (`08:12`), so a time always belongs to its
// kind and badges never touch each other or the neighbouring table. A badge
// whose requests are all taken has a dashed frame. Late badges pulse gently;
// a reminder flashes the table.
// Choosing a table turns the ONE side pane (or, on a phone, the screen) into
// the table detail; the plan itself never changes.
//
// The plan is drawn on the columns the venue actually uses (at least 12 of the
// editor's 24), so tables are as large as the column allows while keeping the
// owner's arrangement and one scale for every zone. Never photorealistic, never
// "free": a table with nothing active shows only its name. Occupancy marks
// appear only with the venue's optional module. Tiles are at least 44 px, and
// below `md` the plan keeps a readable width and scrolls sideways inside its
// frame; the table view (Tabela) is the list alternative.

import { Check } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import {
  efektivniRasporedi,
  povrsiRasporeda,
  redoviPovrsi,
  redosledCitanja,
  skratiOznaku,
} from "@/components/menu/lokal/raspored/raspored-logika";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { FLOOR_COLUMNS, type FloorLayout } from "@/lib/menu/floor-layout";
import { activeKinds, type TableKind } from "@/lib/menu/table-summary";
import { cn } from "@/lib/utils";
import stil from "../konobar.module.css";
import type { KonobarSala } from "../model";
import { opisMestaSale, zaRaspored, type SalaMesto } from "./pogled";
import { ZAUZETOST, ZauzetostOznaka } from "./zauzetost-oznaka";
import { ZnackaRezervacije, ZnackaStanja } from "./znacka-stanja";

const t = menuKonobarSr.sala;
/** The plan never zooms in beyond half of the editor's grid. */
const NAJMANJE_KOLONA = 12;

/** Height of a badge column (rem): n badges of 1.25, 1 px apart, plus the clearance of a chosen table's ring. */
const visinaZnacaka = (n: number) => n * 1.25 + (n - 1) * 0.0625 + 0.75;
/** A plan cell is never smaller than this (rem) at the narrowest plan: what a table's rows above it already give. */
const NAJMANJA_CELIJA = 2.5;

const zaokruzi = (broj: number) => Math.round(broj * 1000) / 1000;
const procenat = (broj: number) => `${zaokruzi(broj)}%`;

/** The hairlines between the cells, in cell units (viewBox 0 0 kolona redova). */
function putanja(kolona: number, redova: number): string {
  const delovi: string[] = [];
  for (let x = 1; x < kolona; x += 1) delovi.push(`M${x} 0V${redova}`);
  for (let y = 1; y < redova; y += 1) delovi.push(`M0 ${y}H${kolona}`);
  return delovi.join("");
}

function Mreza({ kolona, redova }: { kolona: number; redova: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${kolona} ${redova}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <path
        d={putanja(kolona, redova)}
        fill="none"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="[stroke:color-mix(in_oklab,var(--mp-tekst)_7%,transparent)]"
      />
    </svg>
  );
}

/** Out of service: a dashed frame and quiet diagonal hatching (never colour alone). */
const VAN_UPOTREBE =
  "border-dashed [background-image:repeating-linear-gradient(135deg,transparent_0_7px,color-mix(in_oklab,var(--mp-tekst)_12%,transparent)_7px_9px)]";

function StoNaRasporedu({
  mesto,
  layout,
  kolona,
  redova,
  sadaMs,
  izabrano,
  podsetnik,
  onIzaberi,
}: {
  mesto: SalaMesto;
  layout: FloorLayout;
  kolona: number;
  redova: number;
  sadaMs: number;
  izabrano: boolean;
  podsetnik: boolean;
  onIzaberi(id: string): void;
}) {
  // The oldest kind first: its badge always carries the time.
  const vrste: TableKind[] = activeKinds(mesto.summary).sort(
    (a, b) => (mesto.summary.kinds[a]?.oldestAt ?? 0) - (mesto.summary.kinds[b]?.oldestAt ?? 0),
  );
  const zauzetost = mesto.occupancy !== "neutral" ? mesto.occupancy : null;
  const kratko = skratiOznaku(mesto.label);
  const oznaka = /\d/.test(kratko) ? kratko : mesto.label;
  const stil0: CSSProperties = {
    left: procenat((layout.x / kolona) * 100),
    top: procenat((layout.y / redova) * 100),
    width: procenat((layout.w / kolona) * 100),
    height: procenat((layout.h / redova) * 100),
  };
  return (
    <button
      type="button"
      aria-pressed={izabrano}
      aria-label={opisMestaSale(mesto, sadaMs)}
      data-mesto={mesto.id}
      data-aktivno={mesto.summary.active > 0 || undefined}
      data-podsetnik={podsetnik || undefined}
      data-zauzetost={zauzetost ?? undefined}
      onClick={() => onIzaberi(mesto.id)}
      style={stil0}
      className={cn(
        "@container/sto absolute box-border flex min-h-11 min-w-11 items-center justify-center border-2 p-0.5 text-center text-[var(--mp-tekst)] touch-manipulation",
        "transition-[background-color,border-color] duration-[var(--mp-trajanje-1)] motion-reduce:transition-none",
        layout.shape === "round" ? "rounded-full [--button-radius:9999px]" : "rounded-[0.5rem] [--button-radius:0.5rem]",
        mesto.kind === "other" && "border-dashed",
        zauzetost ? ZAUZETOST[zauzetost].meko : mesto.kind === "room" ? "bg-[var(--mp-info-meko)]" : "bg-[var(--mp-povrsina)]",
        zauzetost === "out_of_service" && VAN_UPOTREBE,
        // Chosen: a thick ink outline around the table; its fill keeps telling the state.
        izabrano
          ? "z-20 [--border:var(--mp-mastilo)] outline outline-[3px] outline-offset-2 outline-[var(--mp-mastilo)]"
          : "[--border:var(--mp-ivica-kontrole)] hover:[--border:var(--mp-mastilo)]",
        podsetnik && stil.podsetnik,
      )}
    >
      <span aria-hidden="true" className="block max-w-full truncate px-0.5 text-[0.8125rem] font-bold leading-tight @[5rem]/sto:text-sm">
        {/* Every numbered table shows its number ("12") at any size; the full name is its accessible name. */}
        {oznaka}
      </span>
      {vrste.length > 0 || mesto.rezervacija ? (
        // The badges stand in a column right above the table's top edge (clear of its ring), never over it.
        <span
          data-znacke
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-px",
            izabrano ? "mb-2.5" : "mb-1",
          )}
        >
          {vrste.map((vrsta) => {
            const stanje = mesto.summary.kinds[vrsta];
            return stanje ? (
              <ZnackaStanja
                key={vrsta}
                vrsta={vrsta}
                stanje={stanje}
                sadaMs={sadaMs}
                className="h-5"
              />
            ) : null;
          })}
          {/* K25: the bound reservation stands in the same column, with its own time and hold. */}
          {mesto.rezervacija ? <ZnackaRezervacije rezervacija={mesto.rezervacija} sadaMs={sadaMs} className="h-5" /> : null}
        </span>
      ) : null}
      {zauzetost ? <ZauzetostOznaka stanje={zauzetost} samoIkonica className="absolute -bottom-2.5 -right-2.5" /> : null}
      {izabrano && layout.shape !== "round" ? (
        <Check aria-hidden="true" strokeWidth={3} className="absolute bottom-0.5 left-1 size-3.5 text-[var(--mp-mastilo)]" />
      ) : null}
    </button>
  );
}

/** The room above the top row for the tallest badge column that rises over the frame (never less than 1.75 rem). */
function gornjiRazmak(
  pozicije: readonly { id: string }[],
  layouts: ReadonlyMap<string, FloorLayout>,
  brojZnacaka: ReadonlyMap<string, number>,
): number {
  let razmak = 1.75;
  for (const { id } of pozicije) {
    const layout = layouts.get(id);
    const n = brojZnacaka.get(id) ?? 0;
    if (layout && n > 0) razmak = Math.max(razmak, visinaZnacaka(n) - layout.y * NAJMANJA_CELIJA);
  }
  return Math.round(razmak * 1000) / 1000;
}

export function RasporedSale({
  sala,
  mesta,
  sadaMs,
  izabranoId,
  podsetnik,
  onIzaberi,
}: {
  sala: Pick<KonobarSala, "zones">;
  /** The positions under the zone filter (not the search: the plan keeps every table in place). */
  mesta: SalaMesto[];
  sadaMs: number;
  izabranoId: string | null;
  /** Positions whose reminder is flashing now. */
  podsetnik: ReadonlySet<string>;
  onIzaberi(id: string): void;
}) {
  const { povrsi, kolona, brojZnacaka } = useMemo(() => {
    const { zones, positions } = zaRaspored(sala, mesta);
    const poId = new Map(mesta.map((mesto) => [mesto.id, mesto]));
    const sve = povrsiRasporeda(zones, positions)
      .filter((povrs) => povrs.pozicije.length > 0)
      .map((povrs) => {
        const layouts = efektivniRasporedi(povrs.pozicije, new Map());
        return {
          povrs,
          layouts,
          redova: redoviPovrsi(layouts),
          // Reading order (rows, then columns): the order of Tab and of a screen reader.
          redom: redosledCitanja(layouts).flatMap((id) => {
            const mesto = poId.get(id);
            return mesto ? [mesto] : [];
          }),
        };
      });
    // One scale for every zone: the columns the venue uses, plus one free column.
    let desno = 0;
    for (const { layouts } of sve) for (const layout of layouts.values()) desno = Math.max(desno, layout.x + layout.w);
    const brojZnacaka = new Map(mesta.map((mesto) => [mesto.id, activeKinds(mesto.summary).length + (mesto.rezervacija ? 1 : 0)]));
    return { povrsi: sve, kolona: Math.min(FLOOR_COLUMNS, Math.max(NAJMANJE_KOLONA, desno + 1)), brojZnacaka };
  }, [sala, mesta]);

  return (
    <div className="grid gap-4" data-raspored>
      <p className="text-sm text-[var(--mp-tekst-sporedni)] md:hidden">{t.pomeriRaspored}</p>
      {povrsi.map(({ povrs, layouts, redova, redom }) => {
        const naslov = povrs.bezNaslova ? null : (povrs.zona?.name ?? t.bezZone);
        const naslovId = `sala-zona-${povrs.kljuc}`;
        return (
          <section
            key={povrs.kljuc}
            aria-labelledby={naslov ? naslovId : undefined}
            aria-label={naslov ? undefined : t.raspored}
            data-zona={povrs.kljuc}
            className="grid gap-2 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-3 [--border:var(--mp-ivica)]"
          >
            {naslov ? (
              <h3 id={naslovId} className="flex items-baseline gap-2 text-base font-bold text-[var(--mp-tekst)]">
                {naslov}
                <span className="text-sm font-semibold tabular-nums text-[var(--mp-tekst-sporedni)]">
                  {fmt(t.brojMesta[srPluralCategory(povrs.pozicije.length)], { n: povrs.pozicije.length })}
                </span>
              </h3>
            ) : null}
            <div
              className="-mx-1 overflow-x-auto px-3 pb-3 pt-[var(--sala-gore)] md:overflow-visible"
              style={{ "--sala-gore": `${gornjiRazmak(povrs.pozicije, layouts, brojZnacaka)}rem` } as CSSProperties}
            >
              <div
                className="relative min-w-[34rem] md:min-w-0"
                style={{ aspectRatio: `${kolona} / ${redova}` }}
                data-redova={redova}
                data-kolona={kolona}
              >
                <Mreza kolona={kolona} redova={redova} />
                {redom.map((mesto) => {
                  const layout = layouts.get(mesto.id);
                  return layout ? (
                    <StoNaRasporedu
                      key={mesto.id}
                      mesto={mesto}
                      layout={layout}
                      kolona={kolona}
                      redova={redova}
                      sadaMs={sadaMs}
                      izabrano={izabranoId === mesto.id}
                      podsetnik={podsetnik.has(mesto.id)}
                      onIzaberi={onIzaberi}
                    />
                  ) : null;
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
