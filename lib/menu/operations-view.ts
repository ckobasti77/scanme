// ScanMe Menu V1 (K27) — Operativa of the client panel (master §13.5; plan
// docs/meni/planovi/K24.md §4.3): the live overview of the venue for the
// Owner and Managers — who of the staff took which request, the reservations
// of today, requests waiting unusually long — with filters by kind, waiter and
// zone. It never accepts, finishes or reassigns anything: the one action is a
// quiet reminder to the waiter who took a request (`pingStanje` says when it
// is possible and, when not, why).
//
// Pure: the device passes the clock (`nowMs`), the server data
// (convex/menuPanel.ts `operations`) and the chosen filters.

import { isLate } from "./elapsed-time";
import { MENU_PING_COOLDOWN_MS } from "./limits";
import type { MenuRequestKind, MenuRequestStatus } from "./request-status";
import { reservationTiming, type ReservationPhase } from "./reservation-late";
import type { MenuReservationStatus } from "./reservation-status";
import { belgradeDateKey } from "./working-hours";

export type OperacijeZahtev = {
  id: string;
  kind: MenuRequestKind;
  status: MenuRequestStatus;
  channel: "standard" | "room_service";
  positionLabel: string;
  zoneId: string | null;
  zoneName: string | null;
  createdAt: number;
  acceptedAt: number | null;
  paymentPreference: "cash" | "card" | null;
  itemCount: number | null;
  totalRsd: number | null;
  acceptedBy: { kind: "staff"; staffId: string; name: string } | { kind: "account"; name: string } | null;
  lastPing: { at: number; seen: boolean } | null;
};

export type OperacijeRezervacija = {
  id: string;
  status: MenuReservationStatus;
  requestedAt: number;
  partySize: number;
  positionLabel: string | null;
};

export type OperacijePodaci = {
  lateThresholdMin: number;
  holdMinutes: number;
  requests: readonly OperacijeZahtev[];
  truncated: boolean;
  reservations: readonly OperacijeRezervacija[];
  reservationsTruncated: boolean;
  onShift: readonly { staffId: string; name: string; zoneName: string | null; since: number; expiresAt: number }[];
  zones: readonly { id: string; name: string }[];
};

/** "Nepreuzeti" in the waiter filter: requests nobody took yet. */
export const FILTER_NEPREUZETI = "nepreuzeti";

export type OperacijeFilteri = {
  vrsta: MenuRequestKind | null;
  /** A staff id, `FILTER_NEPREUZETI`, or null = everyone. */
  konobar: string | null;
  /** A zone id; ignored when the venue has no zones. */
  zona: string | null;
};

export const BEZ_FILTERA: OperacijeFilteri = { vrsta: null, konobar: null, zona: null };

/**
 * Can the manager remind the responsible waiter now?
 *   nepreuzet  nobody took the request yet (there is no one responsible)
 *   nalog      an Owner or Manager took it with their account (not a waiter)
 *   poslat     a reminder went out less than 5 minutes ago (`ponovoOd`)
 */
export type PingStanje =
  | { moze: true }
  | { moze: false; razlog: "nepreuzet" | "nalog" }
  | { moze: false; razlog: "poslat"; ponovoOd: number };

export function pingStanje(zahtev: Pick<OperacijeZahtev, "status" | "acceptedBy" | "lastPing">, nowMs: number): PingStanje {
  if (zahtev.status !== "accepted" || zahtev.acceptedBy === null) return { moze: false, razlog: "nepreuzet" };
  if (zahtev.acceptedBy.kind === "account") return { moze: false, razlog: "nalog" };
  if (zahtev.lastPing && nowMs - zahtev.lastPing.at < MENU_PING_COOLDOWN_MS) {
    return { moze: false, razlog: "poslat", ponovoOd: zahtev.lastPing.at + MENU_PING_COOLDOWN_MS };
  }
  return { moze: true };
}

export type OperacijeRed = OperacijeZahtev & { kasni: boolean; ping: PingStanje };

export type OperacijeRezervacijaRed = OperacijeRezervacija & { faza: ReservationPhase };

export type OperacijeView = {
  /** The filtered requests: late first, then the longest waiting first. */
  redovi: OperacijeRed[];
  /** All active requests before filtering (for "N od M"). */
  ukupno: number;
  /** How many of all active requests wait past the threshold. */
  kasni: number;
  skraceno: boolean;
  filteri: OperacijeFilteri;
  aktivnihFiltera: number;
  opcije: {
    /** Every staff member on shift or holding a request, by name. */
    konobari: { id: string; ime: string }[];
    /** Empty = the venue does not use zones (no zone filter at all). */
    zone: { id: string; ime: string }[];
  };
  /** Signed in with a PIN right now, earliest first. */
  uSmeni: { staffId: string; ime: string; zona: string | null; od: number }[];
  /** Today's reservations still open (waiting for an answer, proposed, accepted), by time. */
  rezervacijeDanas: OperacijeRezervacijaRed[];
};

/** Filters that point at something no longer there fall back to "all". */
function vazeciFilteri(filteri: OperacijeFilteri, konobari: { id: string }[], zone: { id: string }[]): OperacijeFilteri {
  const konobar =
    filteri.konobar === FILTER_NEPREUZETI || konobari.some((k) => k.id === filteri.konobar) ? filteri.konobar : null;
  const zona = zone.some((z) => z.id === filteri.zona) ? filteri.zona : null;
  return { vrsta: filteri.vrsta, konobar, zona };
}

export function operacijeView(podaci: OperacijePodaci, filteri: OperacijeFilteri, nowMs: number): OperacijeView {
  const aktivni = podaci.requests.filter((zahtev) => zahtev.status === "new" || zahtev.status === "accepted");

  const konobari = new Map<string, string>();
  for (const smena of podaci.onShift) if (smena.expiresAt > nowMs) konobari.set(smena.staffId, smena.name);
  for (const zahtev of aktivni) {
    if (zahtev.acceptedBy?.kind === "staff" && !konobari.has(zahtev.acceptedBy.staffId)) {
      konobari.set(zahtev.acceptedBy.staffId, zahtev.acceptedBy.name);
    }
  }
  const opcijeKonobara = [...konobari].map(([id, ime]) => ({ id, ime })).sort((a, b) => a.ime.localeCompare(b.ime, "sr"));
  const opcijeZona = podaci.zones.map((zona) => ({ id: zona.id, ime: zona.name }));
  const vazeci = vazeciFilteri(filteri, opcijeKonobara, opcijeZona);

  const redovi = aktivni
    .filter((zahtev) => vazeci.vrsta === null || zahtev.kind === vazeci.vrsta)
    .filter((zahtev) =>
      vazeci.konobar === null
        ? true
        : vazeci.konobar === FILTER_NEPREUZETI
          ? zahtev.status === "new"
          : zahtev.acceptedBy?.kind === "staff" && zahtev.acceptedBy.staffId === vazeci.konobar,
    )
    .filter((zahtev) => vazeci.zona === null || zahtev.zoneId === vazeci.zona)
    .map((zahtev) => ({
      ...zahtev,
      kasni: isLate(zahtev.createdAt, nowMs, podaci.lateThresholdMin),
      ping: pingStanje(zahtev, nowMs),
    }))
    .sort((a, b) => Number(b.kasni) - Number(a.kasni) || a.createdAt - b.createdAt);

  const danas = belgradeDateKey(nowMs);
  const rezervacijeDanas = podaci.reservations
    .filter(
      (row) =>
        (row.status === "new" || row.status === "change_proposed" || row.status === "accepted") &&
        belgradeDateKey(row.requestedAt) === danas,
    )
    .map((row) => ({ ...row, faza: reservationTiming(row.requestedAt, podaci.holdMinutes, nowMs).phase }))
    .sort((a, b) => a.requestedAt - b.requestedAt);

  return {
    redovi,
    ukupno: aktivni.length,
    kasni: aktivni.filter((zahtev) => isLate(zahtev.createdAt, nowMs, podaci.lateThresholdMin)).length,
    skraceno: podaci.truncated,
    filteri: vazeci,
    aktivnihFiltera: [vazeci.vrsta, vazeci.konobar, vazeci.zona].filter((vrednost) => vrednost !== null).length,
    opcije: { konobari: opcijeKonobara, zone: opcijeZona },
    uSmeni: podaci.onShift
      .filter((smena) => smena.expiresAt > nowMs)
      .map((smena) => ({ staffId: smena.staffId, ime: smena.name, zona: smena.zoneName, od: smena.since }))
      .sort((a, b) => a.od - b.od),
    rezervacijeDanas,
  };
}
