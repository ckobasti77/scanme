// Izlog fixtures of the Menu reservations (K25): the working hours of the
// invented "Demo restoran" and its reservation settings. The reservations
// themselves are K07's `fixtureReservations` (operativa.ts), seen at 18:27 on
// Saturday 17 October 2026 (IZLOG_SADA). Fictional only (the repo is public).

import type { ReservationConfig } from "@/lib/menu/reservation-config";
import type { ReservationContactMode } from "@/lib/menu/reservation-form";
import { emptyWorkingHours, type WorkingHours } from "@/lib/menu/working-hours";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * "Demo restoran": Monday to Thursday 12:00–23:00, Friday and Saturday
 * 12:00–01:00 (past midnight), Sunday 12:00–16:00 and 18:00–22:00.
 */
export function fixtureRadnoVreme(): WorkingHours {
  const radni = [{ start: h(12), end: h(23) }];
  const vikend = [{ start: h(12), end: h(25) }];
  return {
    days: [radni, radni, radni, radni, vikend, vikend, [{ start: h(12), end: h(16) }, { start: h(18), end: h(22) }]],
  };
}

/** A venue that has not entered its working hours yet. */
export function fixtureBezRadnogVremena(): WorkingHours {
  return emptyWorkingHours();
}

/** The izlog's link of a venue's own reservation system (an invented address). */
export const IZLOG_EKSTERNI_LINK = "https://rezervacije.example.com/demo-restoran";

export function fixtureRezervacijeConfig(
  opcije: { mode?: ReservationConfig["mode"]; contact?: ReservationContactMode; bezRadnogVremena?: boolean } = {},
): ReservationConfig {
  return {
    mode: opcije.mode ?? "form",
    contact: opcije.contact ?? "both",
    externalUrl: IZLOG_EKSTERNI_LINK,
    holdMinutes: 15,
    workingHours: opcije.bezRadnogVremena ? null : fixtureRadnoVreme(),
  };
}

/** The cancel token of the izlog's confirmation (43 url-safe characters; nobody's real token). */
export const IZLOG_TOKEN_OTKAZIVANJA = "IzlogDemoRezervacijaToken0000000000000000ab";
