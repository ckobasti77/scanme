// ScanMe Menu V1 (K25) — how the waiter panel writes a reservation's term and
// guests: "Danas · 20:00 · 4 osobe", "Sub 25. 10. · 20:00". Belgrade wall-clock
// (lib/menu/reservation-time.ts); the words come from the menu-domen dictionary.

import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { reservationTermText, type ReservationDateLabels } from "@/lib/menu/reservation-time";

const d = menuDomenSr;

export const DATUM_OZNAKE: ReservationDateLabels = {
  weekdaysShort: d.weekdaysShort,
  today: d.relativeDays.today,
  tomorrow: d.relativeDays.tomorrow,
  shortDate: d.shortDate,
  term: d.reservationTerm,
};

/** "Danas · 20:00", "Sutra · 13:00", "Sub 25. 10. · 20:00". */
export function terminTekst(epoch: number, sadaMs: number): string {
  return reservationTermText(epoch, sadaMs, DATUM_OZNAKE);
}

/** "4 osobe". */
export function gostiTekst(broj: number): string {
  return fmt(d.guests[srPluralCategory(broj)], { n: broj });
}

/** "Danas · 20:00 · 4 osobe". */
export function terminSaGostima(red: { requestedAt: number; partySize: number }, sadaMs: number): string {
  return `${terminTekst(red.requestedAt, sadaMs)} · ${gostiTekst(red.partySize)}`;
}
