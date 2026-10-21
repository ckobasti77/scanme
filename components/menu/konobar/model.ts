// ScanMe Menu V1 (K22) — the contract between the waiter panel's screens and
// whoever feeds them: the live route (ruta.tsx, Convex) or the izlog (memory
// over fixtures). The shapes mirror convex/menuWaiter.ts (WaiterRequestRow,
// WaiterRequestDetail, WaiterQueue) with plain string ids, so the
// presentation never imports Convex.

import type { FloorLayout } from "@/lib/menu/floor-layout";
import type { OccupancyState } from "@/lib/menu/occupancy";
import type { ReservationMode } from "@/lib/menu/reservation-config";
import type { ReservationRow } from "@/lib/menu/reservation-queue";
import type { MenuReservationStatus } from "@/lib/menu/reservation-status";
import type { PanelTiming } from "@/lib/menu/thresholds";
import type {
  MenuPaymentPreference,
  MenuRequestChannel,
  MenuRequestKind,
  MenuRequestStatus,
} from "@/lib/menu/request-status";

export type KonobarMestoVrsta = "table" | "room" | "other";

export type KonobarZahtev = {
  id: string;
  kind: MenuRequestKind;
  /** K23: the position the request came from (the floor groups by it). */
  positionId: string;
  /** K23: the zone recorded on the request (the floor prefers the position's current zone). */
  zoneId: string | null;
  status: MenuRequestStatus;
  channel: MenuRequestChannel;
  positionLabel: string;
  positionKind: KonobarMestoVrsta;
  zoneName: string | null;
  createdAt: number;
  acceptedAt: number | null;
  paymentPreference: MenuPaymentPreference | null;
  itemCount: number | null;
  totalRsd: number | null;
  acceptedBy: { name: string; isMe: boolean } | null;
};

export type KonobarStavka = {
  name: string;
  variantName: string | null;
  addons: { groupName: string; optionName: string; priceDeltaRsd: number }[];
  quantity: number;
  unitPriceRsd: number;
  lineTotalRsd: number;
  promoApplied: boolean;
  note: string | null;
};

export type KonobarDetalj = {
  request: KonobarZahtev & {
    sourceLabel: string | null;
    subtotalRsd: number | null;
    deliveryFeeRsd: number | null;
    doneAt: number | null;
    doneBy: string | null;
    cancelledAt: number | null;
    cancelledBy: "guest" | "staff" | null;
  };
  items: KonobarStavka[];
  others: KonobarZahtev[];
};

export type KonobarOtkazan = {
  id: string;
  kind: MenuRequestKind;
  positionLabel: string;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
};

/** K27: a quiet reminder from Operativa to the PIN waiter who took the request (convex/menuWaiter.ts WaiterNotice). */
export type KonobarPodsetnik = {
  id: string;
  requestId: string;
  kind: MenuRequestKind;
  positionLabel: string;
  /** When the guest sent the request ("čeka od 18:12"). */
  requestCreatedAt: number;
  /** When the reminder was sent (the device hides it after 30 minutes). */
  createdAt: number;
  /** Who sent it (an account name); empty = unknown. */
  from: string;
};

export type KonobarRed = {
  zahtevi: KonobarZahtev[];
  skraceno: boolean;
  otkazani: KonobarOtkazan[];
  /** K27: unseen reminders, newest first (a PIN waiter only). */
  podsetnici?: KonobarPodsetnik[];
};

export type KonobarKorisnik = {
  kind: "staff" | "account";
  displayName: string;
  /** When the PIN sign-in ends (12 h); null for an account. */
  expiresAt: number | null;
};

/** What a status action answered (convex/menuWaiter.ts WaiterActionOutcome). */
export type KonobarIshod =
  | { ok: true; status: MenuRequestStatus; changed: boolean }
  | { ok: false; code: string; status?: MenuRequestStatus; takenBy?: string };

export type KonobarRadnje = {
  preuzmi(id: string): Promise<KonobarIshod>;
  zavrsi(id: string): Promise<KonobarIshod>;
  otkazi(id: string, ocekivaniStatus: MenuRequestStatus): Promise<KonobarIshod>;
  odjava(): void | Promise<void>;
  /** K27: `U redu` on a reminder from Operativa (the server remembers it as seen). */
  zatvoriPodsetnik?(id: string): Promise<unknown> | void;
  /** K23: Status stola by hand (null = back to neutral); refused when the module is off. */
  postaviZauzetost(positionId: string, stanje: OccupancyState | null): Promise<KonobarSalaIshod>;
  /** K23: the own active zone (null = every zone). */
  postaviMojuZonu(zoneId: string | null): Promise<KonobarSalaIshod>;
  /** K23: a manager re-assigns someone's zone. */
  postaviZonuOsoblja(staffId: string, zoneId: string | null): Promise<KonobarSalaIshod>;
  // K25 — reservations (convex/menuReservations.ts). Every action carries the status the waiter
  // saw (`ocekivani`): when the reservation moved meanwhile, nothing is written.
  prihvatiRezervaciju(id: string, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
  odbijRezervaciju(id: string, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
  /** Another time (epoch) and an optional short message; the staff then tell the guest. */
  predloziIzmenu(id: string, proposedAt: number, poruka: string | null, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
  /** The guest agreed to the proposal by phone or e-mail. */
  gostPrihvataPredlog(id: string, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
  otkaziRezervaciju(id: string, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
  /** The table of an accepted reservation, chosen by hand (null = no table). */
  poveziSto(id: string, positionId: string | null, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
  /** The guests arrived; `positionId` chooses (or changes) the table now, null keeps the bound one. */
  gostiStigli(id: string, positionId: string | null, ocekivani: MenuReservationStatus): Promise<KonobarRezIshod>;
};

// -----------------------------------------------------------------------------
// K25 — reservations (convex/menuReservations.ts forPanel, detail)
// -----------------------------------------------------------------------------

/** A reservation in the waiter's list (lib/menu/reservation-queue.ts; no contact, no note text). */
export type KonobarRezervacija = ReservationRow;

export type KonobarRezervacije = {
  rows: KonobarRezervacija[];
  /** More than 200 of one status in the window: the earliest 200 are shown. */
  skraceno: boolean;
  /** How the venue takes reservations now (existing ones stay workable after a switch). */
  mode: ReservationMode;
  /** How long the venue holds a reservation after its time (minutes). */
  holdMinutes: number;
};

/** One reservation with what the decision needs (the contact, the note), while its detail is open. */
export type KonobarRezervacijaDetalj = {
  reservation: KonobarRezervacija & {
    contactEmail: string | null;
    contactPhone: string | null;
    note: string | null;
    proposalNote: string | null;
    decidedAt: number | null;
    decidedBy: string | null;
    boundBy: string | null;
    arrivedBy: string | null;
    cancelledByName: string | null;
  };
  /** Other reservations of the same table that day (accepted or arrived), earliest first. */
  sameTable: KonobarRezervacija[];
};

/** What a reservation action answered (convex/menuReservations.ts WaiterReservationOutcome). */
export type KonobarRezIshod =
  | { ok: true; status: MenuReservationStatus; changed: boolean }
  | { ok: false; code: string; status?: MenuReservationStatus };

// -----------------------------------------------------------------------------
// K23 — the floor (convex/menuWaiter.ts floor, occupancy, positionDetail)
// -----------------------------------------------------------------------------

export type KonobarZona = { id: string; name: string; order: number };

export type KonobarMesto = {
  id: string;
  kind: KonobarMestoVrsta;
  label: string;
  seats: number | null;
  /** null = "Bez zone" (everyone's). */
  zoneId: string | null;
  layout: FloorLayout | null;
  order: number;
};

export type KonobarClanOsoblja = { id: string; name: string; panelRole: "staff" | "manager"; activeZoneId: string | null };

export type KonobarSala = {
  zones: KonobarZona[];
  positions: KonobarMesto[];
  staff: KonobarClanOsoblja[];
  me: { staffId: string | null; activeZoneId: string | null; canAssignZones: boolean };
  timing: PanelTiming;
  occupancyEnabled: boolean;
};

/** The occupancy of the venue: off (every table neutral) or the states set by hand. */
export type KonobarZauzetost =
  | { off: true }
  | { off: false; states: { positionId: string; state: OccupancyState; updatedAt: number; updatedBy: string | null }[] };

/** What the open table adds: its QR card(s). undefined = loading, null = not available. */
export type KonobarDetaljMesta = { cards: { label: string }[] };

export type KonobarSalaIshod = { ok: true; changed: boolean } | { ok: false; code: string };

// -----------------------------------------------------------------------------
// The PIN screen
// -----------------------------------------------------------------------------

export type PinStanje =
  | { kind: "unos" }
  | { kind: "proverava" }
  | { kind: "pogresan"; attemptsLeft: number }
  | { kind: "blokada"; lockedUntil: number }
  /** The answer never came (network, server). */
  | { kind: "veza" }
  /** Too many attempts from this network (the IP bucket). */
  | { kind: "previse" }
  /** PINs were switched off on the deployment meanwhile. */
  | { kind: "nedostupno" };

/** What the PIN sign-in answered (lib/menu/http/staff-session.ts StaffSessionBody, mapped). */
export type PinIshod =
  | { ok: true }
  | { ok: false; stanje: Exclude<PinStanje, { kind: "unos" } | { kind: "proverava" }> };
