// ScanMe Menu V1 (K25) — the dates and times the staff may propose instead of a
// requested term (master §11.3 "Predloži izmenu"; plan K24-4). A guest asks
// inside the working hours; the staff decide, so the proposal is NOT limited to
// them: the 15-minute grid of every day, in the future and at most 60 days ahead
// (the same bounds convex/menuReservations.ts proposeChange checks). Belgrade
// wall-clock, DST-correct (lib/belgrade-time.ts).

import { belgradeLocalToEpoch, epochToBelgradeLocal } from "@/lib/belgrade-time";
import { RESERVATION_MAX_DAYS_AHEAD, RESERVATION_SLOT_MIN, MINUTES_PER_DAY, addDays, belgradeDateKey, hhmm } from "@/lib/menu/working-hours";

const DAN_MS = MINUTES_PER_DAY * 60_000;

export type PredlogVreme = { vreme: string; epoch: number };

/** The epoch of `minuti` past the Belgrade midnight of `datum`; null when that wall-clock time does not exist (spring DST gap). */
function epochU(datum: string, minuti: number): number | null {
  const lokalno = `${datum}T${hhmm(minuti)}`;
  const epoch = belgradeLocalToEpoch(lokalno);
  return epoch !== null && epochToBelgradeLocal(epoch) === lokalno ? epoch : null;
}

/** The times of one day that may still be proposed (`HH:MM` with their epochs), ascending. */
export function predlogVremena(datum: string, sadaMs: number): PredlogVreme[] {
  const najkasnije = sadaMs + RESERVATION_MAX_DAYS_AHEAD * DAN_MS;
  const out: PredlogVreme[] = [];
  for (let minuti = 0; minuti < MINUTES_PER_DAY; minuti += RESERVATION_SLOT_MIN) {
    const epoch = epochU(datum, minuti);
    if (epoch !== null && epoch > sadaMs && epoch <= najkasnije) out.push({ vreme: hhmm(minuti), epoch });
  }
  return out;
}

/**
 * The days that may be proposed, today first (`YYYY-MM-DD`): today only while a
 * time is left, the last day only while one fits in the 60 days.
 */
export function predlogDatumi(sadaMs: number): string[] {
  const danas = belgradeDateKey(sadaMs);
  const out: string[] = [];
  for (let pomak = 0; pomak <= RESERVATION_MAX_DAYS_AHEAD; pomak += 1) {
    const datum = addDays(danas, pomak);
    const rubni = pomak === 0 || pomak === RESERVATION_MAX_DAYS_AHEAD;
    if (!rubni || predlogVremena(datum, sadaMs).length > 0) out.push(datum);
  }
  return out;
}

/** The first proposable time after the requested one (or after now, when that has passed). */
export function prviPredlog(sadaMs: number, trazeno: number): { datum: string; vreme: string } | null {
  const posle = Math.max(trazeno, sadaMs);
  const datumi = predlogDatumi(sadaMs);
  const pocetak = belgradeDateKey(posle);
  for (const datum of datumi) {
    if (datum < pocetak) continue;
    const prvo = predlogVremena(datum, sadaMs).find((slot) => slot.epoch > posle);
    if (prvo) return { datum, vreme: prvo.vreme };
  }
  const prvi = datumi[0];
  const slot = prvi ? predlogVremena(prvi, sadaMs)[0] : undefined;
  return prvi && slot ? { datum: prvi, vreme: slot.vreme } : null;
}
