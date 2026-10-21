// ScanMe Menu V1 (K25) — the server side of the guest's reservation form, the
// cancel link and "Moji zahtevi" (master §11.2, §11.7; plan
// docs/meni/planovi/K24.md K24-1, K24-5). The Next server actions
// (app/[slug]/meni/_lib/radnje-rezervacije.ts) only wire cookies, headers and
// Convex into these functions, so the rules are tested without Next or Convex.
//
// The guest's device is the HttpOnly cookie smm_d (lib/menu/signed-cookie.ts):
// a guest who never scanned a card gets one here, signed with
// SCANME_GUEST_SECRET, so the reservation shows in "Moji zahtevi" on this
// phone. The cancel token is made HERE (256 random bits), sent to Convex,
// stored there only as a hash, and handed back to the page exactly once, for
// the confirmation's link. The IP is hashed here, never sent by the phone.
// Every Convex failure comes back as a value the guest can act on.

import { RESERVATION_ERROR, type ReservationErrorCode } from "../errors/reservations";
import type { ReservationFieldErrors } from "../reservation-form";
import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_DEVICE_MAX_AGE_S,
  MENU_HOP_COOKIE_PATH,
  deviceCookieContext,
  guestMenuPath,
  signCookieValue,
} from "../signed-cookie";
import { isMenuToken, newMenuToken } from "../tokens";
import { deviceTokenOf } from "./guest-actions";

/** What the form gets back. `network`: no decision was reached (the guest may retry the same attempt). */
export type ReservationSendResult =
  | {
      ok: true;
      /** The raw cancel token: shown once, as the link /[slug]/meni/rezervacija/[token]. */
      cancelToken: string;
      reservationId: string;
      requestedAt: number;
      partySize: number;
      /** The same attempt had been written before (an answer lost on the way); the link is the new one. */
      deduped: boolean;
    }
  | { ok: false; code: ReservationErrorCode | "network"; fieldErrors?: ReservationFieldErrors };

export type ReservationCancelResult = { ok: true } | { ok: false; code: ReservationErrorCode | "network" };

type ConvexSubmitOutcome =
  | { ok: true; reservationId: string; requestedAt: number; partySize: number; deduped: boolean }
  | { ok: false; code: ReservationErrorCode; fieldErrors?: ReservationFieldErrors };

export type ReservationActionDeps = {
  /** The raw value of a request cookie. */
  cookie(name: string): string | undefined;
  /** Sets an HttpOnly; Secure; SameSite=Lax cookie on the response. */
  setCookie(name: string, value: string, options: { path: string; maxAgeS: number }): void;
  /** SCANME_GUEST_SECRET; null = the guest's cookies cannot be trusted, so the form is off. */
  secret: string | null;
  /** The salted IP hash of the caller. */
  ipHash: string;
  /** A new 256-bit token (injectable for tests). */
  newToken?: () => string;
  onError?: (error: unknown) => void;
  convex: {
    submit(args: {
      slug: string;
      deviceToken: string;
      clientRequestId: string;
      cancelToken: string;
      guestName: string;
      partySize: number;
      requestedAt: number;
      contactEmail?: string;
      contactPhone?: string;
      note?: string;
      ipHash: string;
    }): Promise<ConvexSubmitOutcome>;
    cancelByToken(args: { slug: string; token: string; ipHash: string }): Promise<{ ok: true } | { ok: false; code: ReservationErrorCode }>;
    cancelByDevice(args: {
      slug: string;
      deviceToken: string;
      reservationId: string;
      ipHash: string;
    }): Promise<{ ok: true } | { ok: false; code: ReservationErrorCode }>;
  };
};

/** What the form sends: the fields of master §11.2 and the phone's key of this send attempt. Never a table. */
export type ReservationInput = {
  clientRequestId: string;
  guestName: string;
  partySize: number;
  requestedAt: number;
  contactEmail?: string;
  contactPhone?: string;
  note?: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const TEXT_MAX = 2000;
const NETWORK = { ok: false as const, code: "network" as const };

function validSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= 80 && SLUG_PATTERN.test(slug);
}

const optionalText = (value: unknown) => value === undefined || (typeof value === "string" && value.length <= TEXT_MAX);

function isReservationInput(value: unknown): value is ReservationInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.clientRequestId === "string" &&
    CLIENT_REQUEST_ID_PATTERN.test(input.clientRequestId) &&
    typeof input.guestName === "string" &&
    input.guestName.length <= TEXT_MAX &&
    typeof input.partySize === "number" &&
    Number.isFinite(input.partySize) &&
    typeof input.requestedAt === "number" &&
    Number.isFinite(input.requestedAt) &&
    optionalText(input.contactEmail) &&
    optionalText(input.contactPhone) &&
    optionalText(input.note)
  );
}

/** The device token of the cookie, or a new one set on both paths of smm_d (the menu and the card hop). */
async function deviceTokenFor(slug: string, deps: ReservationActionDeps, secret: string): Promise<string> {
  const known = await deviceTokenOf(deps);
  if (known) return known;
  const token = (deps.newToken ?? newMenuToken)();
  const signed = await signCookieValue(token, secret, deviceCookieContext());
  deps.setCookie(MENU_GUEST_DEVICE_COOKIE, signed, { path: guestMenuPath(slug), maxAgeS: MENU_GUEST_DEVICE_MAX_AGE_S });
  deps.setCookie(MENU_GUEST_DEVICE_COOKIE, signed, { path: MENU_HOP_COOKIE_PATH, maxAgeS: MENU_GUEST_DEVICE_MAX_AGE_S });
  return token;
}

export async function submitReservationAction(slug: unknown, input: unknown, deps: ReservationActionDeps): Promise<ReservationSendResult> {
  if (!validSlug(slug) || !deps.secret) return { ok: false, code: RESERVATION_ERROR.off };
  if (!isReservationInput(input)) return { ok: false, code: RESERVATION_ERROR.invalidInput };
  try {
    const deviceToken = await deviceTokenFor(slug, deps, deps.secret);
    const cancelToken = (deps.newToken ?? newMenuToken)();
    // Only the fields Convex expects travel on (nothing the phone added rides along, never a table).
    const outcome = await deps.convex.submit({
      slug,
      deviceToken,
      clientRequestId: input.clientRequestId,
      cancelToken,
      guestName: input.guestName,
      partySize: input.partySize,
      requestedAt: input.requestedAt,
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ipHash: deps.ipHash,
    });
    if (!outcome.ok) return outcome.fieldErrors ? { ok: false, code: outcome.code, fieldErrors: outcome.fieldErrors } : { ok: false, code: outcome.code };
    return {
      ok: true,
      cancelToken,
      reservationId: outcome.reservationId,
      requestedAt: outcome.requestedAt,
      partySize: outcome.partySize,
      deduped: outcome.deduped,
    };
  } catch (error) {
    deps.onError?.(error);
    return NETWORK;
  }
}

export async function cancelReservationByTokenAction(slug: unknown, token: unknown, deps: ReservationActionDeps): Promise<ReservationCancelResult> {
  if (!validSlug(slug) || !isMenuToken(token)) return { ok: false, code: RESERVATION_ERROR.notFound };
  try {
    const result = await deps.convex.cancelByToken({ slug, token, ipHash: deps.ipHash });
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  } catch (error) {
    deps.onError?.(error);
    return NETWORK;
  }
}

export async function cancelReservationByDeviceAction(
  slug: unknown,
  reservationId: unknown,
  deps: ReservationActionDeps,
): Promise<ReservationCancelResult> {
  if (!validSlug(slug) || typeof reservationId !== "string" || reservationId.length === 0 || reservationId.length > 64) {
    return { ok: false, code: RESERVATION_ERROR.notFound };
  }
  const deviceToken = await deviceTokenOf(deps);
  if (!deviceToken) return { ok: false, code: RESERVATION_ERROR.notFound };
  try {
    const result = await deps.convex.cancelByDevice({ slug, deviceToken, reservationId, ipHash: deps.ipHash });
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  } catch (error) {
    deps.onError?.(error);
    return NETWORK;
  }
}

/** The path of a reservation's cancel link (the page builds the full address from it). */
export function reservationLinkPath(slug: string, token: string): string {
  return `${guestMenuPath(slug)}/rezervacija/${token}`;
}
