// ScanMe Menu V1 (K25) — the guest's reservation (master §11.2, §11.7): what
// the form holds, how it is checked and sent, how dates read, and which of the
// guest's reservations "Moji zahtevi" shows. Pure: no React, no browser. The
// rules are the server's own (lib/menu/reservation-form.ts, working-hours.ts),
// so the phone offers exactly the terms the server accepts. The guest never
// chooses a table: nothing here knows a position.

import type { MyReservation } from "@/convex/menuReservations";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { clockTime } from "@/lib/menu/elapsed-time";
import type { ReservationErrorCode } from "@/lib/menu/errors/reservations";
import type { ReservationCancelResult, ReservationInput, ReservationSendResult } from "@/lib/menu/http/reservation";
import {
  parseReservationForm,
  type ReservationContactMode,
  type ReservationFieldErrors,
} from "@/lib/menu/reservation-form";
import { isOpenReservationStatus } from "@/lib/menu/reservation-status";
import { dateKeyLabel, reservationTermText, type ReservationDateLabels } from "@/lib/menu/reservation-time";
import { belgradeDateKey, openDates, slotsFor, type WorkingHours } from "@/lib/menu/working-hours";

/** The page's Server Actions (app/[slug]/meni/_lib/radnje-rezervacije.ts), passed down as props. */
export type RezervacijaAkcije = {
  posalji: (slug: string, unos: ReservationInput) => Promise<ReservationSendResult>;
};

/** "Moji zahtevi": cancel a reservation of this phone (the device proves it is theirs). */
export type OtkaziRezervaciju = (reservationId: string) => Promise<ReservationCancelResult>;

/** One of "Moji zahtevi" (convex/menuReservations.ts mine), with a plain string id. */
export type MojaRezervacija = Omit<MyReservation, "id"> & { id: string };

/** A refusal as the form keeps it. `network`: no decision was reached. */
export type Odbijeno = Extract<ReservationSendResult, { ok: false }>;
/** The confirmation's data (the server's answer to a sent request). */
export type PoslatiZahtev = Extract<ReservationSendResult, { ok: true }>;

// -----------------------------------------------------------------------------
// Words
// -----------------------------------------------------------------------------

/** The dictionary's words for "Danas · 20:00", "Sub 25. 10. · 20:00". */
export const OZNAKE_DATUMA: ReservationDateLabels = {
  weekdaysShort: menuDomenSr.weekdaysShort,
  today: menuDomenSr.relativeDays.today,
  tomorrow: menuDomenSr.relativeDays.tomorrow,
  shortDate: menuDomenSr.shortDate,
  term: menuDomenSr.reservationTerm,
};

/** "Danas · 20:00" of a reservation's time, seen from `sadaMs`. */
export function terminTekst(epoch: number, sadaMs: number): string {
  return reservationTermText(epoch, sadaMs, OZNAKE_DATUMA);
}

/** "4 osobe". */
export function gostiTekst(n: number): string {
  return fmt(menuDomenSr.guests[srPluralCategory(n)], { n });
}

/** The sentence for a refusal; `network` = the answer never came. */
export function porukaOdbijanja(code: ReservationErrorCode | "network"): string {
  if (code === "network") return menuGostSr.rezervacija.greska.mreza;
  return menuDomenSr.errors[code] ?? menuGostSr.rezervacija.greska.nepoznata;
}

// -----------------------------------------------------------------------------
// The form
// -----------------------------------------------------------------------------

export type VrednostiForme = {
  ime: string;
  /** `YYYY-MM-DD` of the opening day. */
  datum: string;
  /** The epoch (as text) of the chosen term; "" = not chosen yet. */
  vreme: string;
  gosti: number;
  email: string;
  telefon: string;
  napomena: string;
};

export const GOSTI_PODRAZUMEVANO = 2;

export const POCETNE_VREDNOSTI: VrednostiForme = {
  ime: "",
  datum: "",
  vreme: "",
  gosti: GOSTI_PODRAZUMEVANO,
  email: "",
  telefon: "",
  napomena: "",
};

export type Opcija = { vrednost: string; oznaka: string };

/** The opening days the guest can pick: "Danas", "Sutra", "Pon 26. 10." */
export function opcijeDatuma(radnoVreme: WorkingHours, sadaMs: number): Opcija[] {
  return openDates(radnoVreme, sadaMs).map((dateKey) => ({
    vrednost: dateKey,
    oznaka: dateKeyLabel(dateKey, sadaMs, OZNAKE_DATUMA),
  }));
}

/**
 * The terms of one opening day (the 15-minute grid inside the working hours,
 * in the future, at most 60 days ahead). A term after midnight belongs to the
 * day the venue opened on, so it carries its own date: "Ned 18. 10. · 00:15".
 */
export function opcijeVremena(dateKey: string, radnoVreme: WorkingHours, sadaMs: number): Opcija[] {
  return slotsFor(dateKey, radnoVreme, sadaMs).map((epoch) => ({
    vrednost: String(epoch),
    oznaka: belgradeDateKey(epoch) === dateKey ? clockTime(epoch) : terminTekst(epoch, sadaMs),
  }));
}

export type Sastavljeno =
  | { ok: true; unos: Omit<ReservationInput, "clientRequestId"> }
  | { ok: false; code: ReservationErrorCode; fieldErrors: ReservationFieldErrors };

/**
 * The request from the form's values, checked with the SAME function the
 * server uses. Only what the venue asks for travels; the note only when filled.
 */
export function sastaviUnos(
  vrednosti: VrednostiForme,
  kontakt: ReservationContactMode,
  radnoVreme: WorkingHours,
  sadaMs: number,
): Sastavljeno {
  const parsed = parseReservationForm(
    {
      guestName: vrednosti.ime,
      partySize: vrednosti.gosti,
      requestedAt: vrednosti.vreme === "" ? undefined : Number(vrednosti.vreme),
      contactEmail: vrednosti.email,
      contactPhone: vrednosti.telefon,
      note: vrednosti.napomena,
    },
    kontakt,
    radnoVreme,
    sadaMs,
  );
  if (!parsed.ok) return parsed;
  const { value } = parsed;
  return {
    ok: true,
    unos: {
      guestName: value.guestName,
      partySize: value.partySize,
      requestedAt: value.requestedAt,
      ...(value.contactEmail ? { contactEmail: value.contactEmail } : {}),
      ...(value.contactPhone ? { contactPhone: value.contactPhone } : {}),
      ...(value.note ? { note: value.note } : {}),
    },
  };
}

// -----------------------------------------------------------------------------
// The send attempt (idempotency)
// -----------------------------------------------------------------------------

/** 128 random bits as base64url (22 characters of [A-Za-z0-9_-]): the key of one send attempt. */
export function noviKljuc(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type Pokusaj = { kljuc: string; otisak: string };

/**
 * The key of this send. A retry of the very same request (an answer that did
 * not come) keeps its key, so the server writes it once. A request the guest
 * changed meanwhile is a new attempt with a new key, so the server never
 * answers a changed form with the reservation it wrote before.
 */
export function pokusajZa(
  prethodni: Pokusaj | null,
  unos: Omit<ReservationInput, "clientRequestId">,
  napravi: () => string = noviKljuc,
): Pokusaj {
  const otisak = JSON.stringify(unos);
  return prethodni && prethodni.otisak === otisak ? prethodni : { kljuc: napravi(), otisak };
}

// -----------------------------------------------------------------------------
// "Moji zahtevi"
// -----------------------------------------------------------------------------

const PROZOR_MS = 12 * 60 * 60 * 1000;

/**
 * The guest's reservations the phone shows: an open one stays while its term
 * (or its last change) is within the last 12 hours or still ahead; the ones the
 * venue declined, the guest cancelled or that were realized fade the same way.
 * Open ones first, the nearest term first; then the closed ones, newest first.
 */
export function vidljiveRezervacije(lista: readonly MojaRezervacija[], sadaMs: number): MojaRezervacija[] {
  const granica = sadaMs - PROZOR_MS;
  const poslednje = (red: MojaRezervacija) =>
    Math.max(red.requestedAt, red.createdAt, red.decidedAt ?? 0, red.arrivedAt ?? 0, red.cancelledAt ?? 0);
  const prikazane = lista.filter((red) => poslednje(red) >= granica);
  const otvorene = prikazane.filter((red) => isOpenReservationStatus(red.status)).sort((a, b) => a.requestedAt - b.requestedAt);
  const zatvorene = prikazane.filter((red) => !isOpenReservationStatus(red.status)).sort((a, b) => b.requestedAt - a.requestedAt);
  return [...otvorene, ...zatvorene];
}
