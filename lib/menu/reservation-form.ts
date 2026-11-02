// ScanMe Menu V1 (K25) — the guest's reservation request, checked the same
// way on the phone and on the server (master §11.2; plan
// docs/meni/planovi/K24.md §2.2).
//
// The guest sends a name, a time, the number of guests, the contact the venue
// asks for (an e-mail, a phone, or both) and an optional note. Every field
// shown is required except the note; the guest never chooses a table. A
// contact the venue does not ask for is dropped, never stored. Nothing here
// promises that a table is free: the venue answers.

import { RESERVATION_ERROR, type ReservationErrorCode } from "./errors/reservations";
import { requestedTimeProblem, type WorkingHours } from "./working-hours";

export const RESERVATION_CONTACT_MODES = ["email", "phone", "both"] as const;
export type ReservationContactMode = (typeof RESERVATION_CONTACT_MODES)[number];

export const RESERVATION_NAME_MAX = 80;
export const RESERVATION_NOTE_MAX = 500;
export const RESERVATION_EMAIL_MAX = 254;
export const RESERVATION_PHONE_MAX = 32;
export const RESERVATION_PARTY_MIN = 1;
/** A technical bound (K24-8; a proposal to the owner). */
export const RESERVATION_PARTY_MAX = 50;
const PHONE_DIGITS_MIN = 6;
const PHONE_DIGITS_MAX = 15;

export const RESERVATION_FIELDS = ["guestName", "requestedAt", "partySize", "contactEmail", "contactPhone", "note"] as const;
export type ReservationField = (typeof RESERVATION_FIELDS)[number];

/** Why one field is refused (the form shows a sentence for each, from `menu-gost`). */
export type ReservationFieldProblem = "required" | "invalid" | "too_long" | "range" | "in_past" | "too_far" | "outside_hours";
export type ReservationFieldErrors = Partial<Record<ReservationField, ReservationFieldProblem>>;

export type ReservationFormValue = {
  guestName: string;
  partySize: number;
  requestedAt: number;
  contactEmail: string | null;
  contactPhone: string | null;
  note: string | null;
};

export type ReservationFormResult =
  | { ok: true; value: ReservationFormValue }
  | { ok: false; code: ReservationErrorCode; fieldErrors: ReservationFieldErrors };

export function needsEmail(mode: ReservationContactMode): boolean {
  return mode === "email" || mode === "both";
}

export function needsPhone(mode: ReservationContactMode): boolean {
  return mode === "phone" || mode === "both";
}

/**
 * Control characters and the invisible direction marks (bidi overrides and isolates) a guest's
 * text could use to disguise what staff read; newlines are handled by the callers.
 */
const INVISIBLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/** Trimmed, inner whitespace collapsed, no control or direction characters; "" when not a string. */
function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim() : "";
}

/** The note keeps line breaks (at most one empty line in a row), never control or direction characters. */
export function cleanNote(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9 ()/.-]+$/;

export function normalizeEmail(value: unknown): string | null {
  const email = clean(value).toLowerCase();
  return email.length > 0 && email.length <= RESERVATION_EMAIL_MAX && EMAIL_PATTERN.test(email) ? email : null;
}

export function normalizePhone(value: unknown): string | null {
  const phone = clean(value);
  if (phone.length === 0 || phone.length > RESERVATION_PHONE_MAX || !PHONE_PATTERN.test(phone)) return null;
  const digits = phone.replace(/\D/g, "").length;
  return digits >= PHONE_DIGITS_MIN && digits <= PHONE_DIGITS_MAX ? phone : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

/** The time problem as the field shows it. */
const TIME_PROBLEM: Record<string, ReservationFieldProblem> = {
  [RESERVATION_ERROR.inPast]: "in_past",
  [RESERVATION_ERROR.tooFar]: "too_far",
  [RESERVATION_ERROR.outsideHours]: "outside_hours",
};

/**
 * Check a request against the venue's contact rule and working hours at
 * `now`. When only the time is wrong, the refusal names that problem
 * (`reservation/outside_hours`…); any other wrong field is
 * `reservation/invalid_input`. `fieldErrors` always lists every wrong field.
 */
export function parseReservationForm(
  input: Record<string, unknown>,
  contactMode: ReservationContactMode,
  hours: WorkingHours,
  now: number,
): ReservationFormResult {
  const fieldErrors: ReservationFieldErrors = {};

  const guestName = clean(input.guestName);
  if (guestName.length === 0) fieldErrors.guestName = "required";
  else if (guestName.length > RESERVATION_NAME_MAX) fieldErrors.guestName = "too_long";

  const partySize = toNumber(input.partySize);
  if (input.partySize === undefined || input.partySize === null || input.partySize === "") fieldErrors.partySize = "required";
  else if (!Number.isInteger(partySize)) fieldErrors.partySize = "invalid";
  else if (partySize < RESERVATION_PARTY_MIN || partySize > RESERVATION_PARTY_MAX) fieldErrors.partySize = "range";

  const requestedAt = toNumber(input.requestedAt);
  let timeCode: ReservationErrorCode | null = null;
  if (input.requestedAt === undefined || input.requestedAt === null || input.requestedAt === "") {
    fieldErrors.requestedAt = "required";
  } else if (!Number.isInteger(requestedAt)) {
    fieldErrors.requestedAt = "invalid";
  } else {
    timeCode = requestedTimeProblem(requestedAt, hours, now);
    if (timeCode) fieldErrors.requestedAt = TIME_PROBLEM[timeCode] ?? "invalid";
  }

  let contactEmail: string | null = null;
  if (needsEmail(contactMode)) {
    if (clean(input.contactEmail).length === 0) fieldErrors.contactEmail = "required";
    else if (clean(input.contactEmail).length > RESERVATION_EMAIL_MAX) fieldErrors.contactEmail = "too_long";
    else {
      contactEmail = normalizeEmail(input.contactEmail);
      if (!contactEmail) fieldErrors.contactEmail = "invalid";
    }
  }

  let contactPhone: string | null = null;
  if (needsPhone(contactMode)) {
    if (clean(input.contactPhone).length === 0) fieldErrors.contactPhone = "required";
    else if (clean(input.contactPhone).length > RESERVATION_PHONE_MAX) fieldErrors.contactPhone = "too_long";
    else {
      contactPhone = normalizePhone(input.contactPhone);
      if (!contactPhone) fieldErrors.contactPhone = "invalid";
    }
  }

  const rawNote = cleanNote(input.note);
  if (rawNote.length > RESERVATION_NOTE_MAX) fieldErrors.note = "too_long";
  else if (input.note !== undefined && input.note !== null && typeof input.note !== "string") fieldErrors.note = "invalid";

  const wrong = Object.keys(fieldErrors) as ReservationField[];
  if (wrong.length > 0) {
    const onlyTime = wrong.length === 1 && wrong[0] === "requestedAt" && timeCode !== null;
    return { ok: false, code: onlyTime && timeCode ? timeCode : RESERVATION_ERROR.invalidInput, fieldErrors };
  }
  return {
    ok: true,
    value: {
      guestName,
      partySize,
      requestedAt,
      contactEmail,
      contactPhone,
      note: rawNote.length > 0 ? rawNote : null,
    },
  };
}
