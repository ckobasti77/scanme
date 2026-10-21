// ScanMe Menu V1 (K25) — what a venue's reservation settings mean (master
// §11.1, §11.2, §11.6; plan docs/meni/planovi/K24.md K24-8, K24-9, K24-16).
//
//   off       no reservations at all (the default)
//   form      the ScanMe form: the guest sends a request, staff answer it —
//             only once the working hours are set (Podešavanja)
//   external  a link to the venue's own system; ScanMe stores nothing of it
//
// Pure: the Convex module, the public menu and the panel read the same rules.

import { reservationHoldOf } from "./reservation-late";
import type { ReservationContactMode } from "./reservation-form";
import { hasAnyHours, type WorkingHours } from "./working-hours";

export type ReservationMode = "off" | "form" | "external";

export type ReservationConfig = {
  mode: ReservationMode;
  contact: ReservationContactMode;
  externalUrl: string | null;
  holdMinutes: number;
  workingHours: WorkingHours | null;
};

/** What the public menu needs to offer reservations (no settings of the panel, no ids). */
export type PublicReservationEntry =
  | { mode: "off" }
  | { mode: "form"; contact: ReservationContactMode; workingHours: WorkingHours }
  | { mode: "external"; url: string };

/** The contact the form asks for until the venue chooses (both: the venue can answer either way). */
export const DEFAULT_RESERVATION_CONTACT: ReservationContactMode = "both";

type StoredSettings =
  | {
      workingHours?: WorkingHours;
      reservation?: { contact: ReservationContactMode; externalUrl?: string; holdMinutes?: number };
    }
  | null
  | undefined;

export function reservationConfigOf(features: { reservations: ReservationMode }, settings: StoredSettings): ReservationConfig {
  const reservation = settings?.reservation;
  return {
    mode: features.reservations,
    contact: reservation?.contact ?? DEFAULT_RESERVATION_CONTACT,
    externalUrl: reservation?.externalUrl ?? null,
    holdMinutes: reservationHoldOf(reservation?.holdMinutes),
    workingHours: settings?.workingHours ?? null,
  };
}

/**
 * The guest's way in. A form without working hours, or an external system
 * without a link, offers nothing (the panel says why).
 */
export function publicReservationEntry(config: ReservationConfig): PublicReservationEntry {
  if (config.mode === "form" && hasAnyHours(config.workingHours)) {
    return { mode: "form", contact: config.contact, workingHours: config.workingHours };
  }
  if (config.mode === "external" && config.externalUrl) return { mode: "external", url: config.externalUrl };
  return { mode: "off" };
}

/** Does the guest's form take requests right now? */
export function acceptsFormRequests(config: ReservationConfig): config is ReservationConfig & { workingHours: WorkingHours } {
  return config.mode === "form" && hasAnyHours(config.workingHours);
}
