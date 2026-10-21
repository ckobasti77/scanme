// ScanMe Menu V1 (K23) — the view model of the floor (master §9.3, §9.4,
// §10.3): what each position shows in the layout, the table view and the
// table detail, under the waiter's zone filter and search. No React: the
// floor's three screens and the render tests read the same rows.
//
//   - every active request is counted under its kind, side by side
//     (lib/menu/table-summary.ts); a position with nothing active is neutral;
//   - occupancy shows only when the venue's module is on, and then only what
//     staff set by hand (lib/menu/occupancy.ts); otherwise neutral;
//   - zones are a filter: a chosen zone shows its positions plus every
//     position without a zone ("Bez zone" is everyone's).

import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime, elapsedSeconds } from "@/lib/menu/elapsed-time";
import { compareLabels } from "@/lib/menu/floor-layout";
import type { LokalPozicija, LokalZona } from "@/lib/menu/lokal/model";
import { occupancyView, type OccupancyView } from "@/lib/menu/occupancy";
import {
  activeKinds,
  effectiveZoneFilter,
  requestZone,
  summarizeTables,
  tableMatches,
  tableSummaryOf,
  visibleInZone,
  type TableSummary,
} from "@/lib/menu/table-summary";
import type { KonobarMesto, KonobarSala, KonobarZahtev, KonobarZauzetost } from "../model";
import { trajanjeZaCitac } from "../vreme";

const t = menuKonobarSr;

export type SalaMesto = KonobarMesto & {
  zoneName: string | null;
  summary: TableSummary;
  /** Neutral without the module, or when nobody marked the table. */
  occupancy: OccupancyView;
  /** Who set the state and when (only with the module and a marked table). */
  occupancyMeta: { updatedAt: number; updatedBy: string | null } | null;
};

/** The zone of every position of the floor (null = "Bez zone"). */
export function zonePozicija(sala: Pick<KonobarSala, "positions">): Map<string, string | null> {
  return new Map(sala.positions.map((mesto) => [mesto.id, mesto.zoneId]));
}

/** The zone filter the floor actually applies (a vanished zone = every zone). */
export function filterZone(sala: Pick<KonobarSala, "zones"> | null | undefined, filterZoneId: string | null): string | null {
  if (!sala || sala.zones.length === 0) return null;
  return effectiveZoneFilter(
    filterZoneId,
    sala.zones.map((zona) => zona.id),
  );
}

/**
 * The requests the waiter sees under the zone filter: a request counts under
 * its position's CURRENT zone; a request of a position without a zone is
 * everyone's. Without a floor (still loading) nothing is filtered.
 */
export function zahteviUZoni<T extends Pick<KonobarZahtev, "positionId" | "zoneId">>(
  zahtevi: readonly T[],
  sala: Pick<KonobarSala, "positions" | "zones"> | null | undefined,
  filterZoneId: string | null,
): T[] {
  const filter = filterZone(sala, filterZoneId);
  if (!sala || filter === null) return zahtevi.slice();
  const zone = zonePozicija(sala);
  return zahtevi.filter((zahtev) => visibleInZone(requestZone(zahtev, zone), filter));
}

/** The occupancy state of each position (empty when the module is off or still loading). */
function zauzetostPoMestu(zauzetost: KonobarZauzetost | undefined) {
  const stanja = new Map<string, { state: Exclude<OccupancyView, "neutral">; updatedAt: number; updatedBy: string | null }>();
  if (!zauzetost || zauzetost.off) return stanja;
  for (const red of zauzetost.states) stanja.set(red.positionId, red);
  return stanja;
}

/**
 * Every position of the floor with its parallel states, its zone name and
 * its occupancy, under the zone filter and the search, in label order
 * (Sto 2 before Sto 10).
 */
export function mestaSale({
  sala,
  zahtevi,
  zauzetost,
  filterZoneId = null,
  pretraga = "",
}: {
  sala: KonobarSala;
  zahtevi: readonly KonobarZahtev[];
  zauzetost?: KonobarZauzetost;
  filterZoneId?: string | null;
  pretraga?: string;
}): SalaMesto[] {
  const filter = filterZone(sala, filterZoneId);
  const zone = new Map(sala.zones.map((zona) => [zona.id, zona.name]));
  const sazeci = summarizeTables(zahtevi);
  const stanja = zauzetostPoMestu(zauzetost);
  const modulUkljucen = sala.occupancyEnabled && zauzetost !== undefined && !zauzetost.off;
  return sala.positions
    .filter((mesto) => visibleInZone(mesto.zoneId, filter))
    .map((mesto): SalaMesto => {
      const zoneName = mesto.zoneId ? (zone.get(mesto.zoneId) ?? null) : null;
      const stanje = modulUkljucen ? stanja.get(mesto.id) : undefined;
      return {
        ...mesto,
        zoneName,
        summary: tableSummaryOf(sazeci, mesto.id),
        occupancy: occupancyView(modulUkljucen, stanje?.state ?? null),
        occupancyMeta: stanje ? { updatedAt: stanje.updatedAt, updatedBy: stanje.updatedBy } : null,
      };
    })
    .filter((mesto) => tableMatches(mesto.label, mesto.zoneName, pretraga))
    .sort((a, b) => compareLabels(a.label, b.label) || a.order - b.order);
}

/** The positions and zones in the shapes of the K20 layout helpers (povrsiRasporeda, efektivniRasporedi). */
export function zaRaspored(sala: Pick<KonobarSala, "zones">, mesta: readonly SalaMesto[]): {
  zones: LokalZona[];
  positions: LokalPozicija[];
} {
  return {
    zones: sala.zones.map((zona) => ({ id: zona.id, key: zona.id, name: zona.name, order: zona.order })),
    positions: mesta.map((mesto) => ({
      id: mesto.id,
      key: mesto.id,
      kind: mesto.kind,
      label: mesto.label,
      seats: mesto.seats,
      zoneId: mesto.zoneId,
      layout: mesto.layout,
      order: mesto.order,
    })),
  };
}

/** "4 sedišta" (null when the seat count is not set). */
export function sedistaTekst(seats: number | null): string | null {
  if (seats === null || seats <= 0) return null;
  return fmt(t.sala.sedista[srPluralCategory(seats)], { n: seats });
}

/**
 * What a screen reader hears for a position: its name and zone, then every
 * parallel state with the exact time and the wait in minutes, or "nema
 * aktivnih zahteva"; with the occupancy module, the state staff set.
 */
export function opisMestaSale(mesto: SalaMesto, sadaMs: number): string {
  const ime = mesto.zoneName ? `${mesto.label}, ${mesto.zoneName}` : mesto.label;
  const delovi: string[] = [];
  for (const vrsta of activeKinds(mesto.summary)) {
    const stanje = mesto.summary.kinds[vrsta];
    if (!stanje) continue;
    const opis = fmt(t.sala.stanjeCitac, {
      vrsta: t.sala.vrste[vrsta],
      vreme: clockTime(stanje.oldestAt),
      trajanje: trajanjeZaCitac(elapsedSeconds(stanje.oldestAt, sadaMs)),
    });
    delovi.push(stanje.count > 1 ? `${opis} (${fmt(t.sala.jos, { n: stanje.count - 1 })})` : opis);
  }
  if (delovi.length === 0) delovi.push(t.sala.neutralnoCitac);
  if (mesto.occupancy !== "neutral") delovi.push(`${t.sto.status}: ${t.zauzetost[mesto.occupancy]}`);
  return fmt(t.sala.mestoCitac, { mesto: ime, stanje: delovi.join("; ") });
}
