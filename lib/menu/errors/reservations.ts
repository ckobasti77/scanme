// ScanMe Menu V1 (K25) — machine codes of the Menu reservations: the guest's
// form, the cancel link, "Moji zahtevi" and the staff's handling (master §11;
// plan docs/meni/planovi/K24.md §2.1). Dependency-free like ./core.ts; the
// Serbian text lives in the `menu-domen` dictionary (`errors[code]`).
export const RESERVATION_ERROR = {
  /** The venue does not take reservations through the ScanMe form (off or its own system). */
  off: "reservation/off",
  /** A value failed validation (name, party size, contact, note…); `fieldErrors` says which. */
  invalidInput: "reservation/invalid_input",
  /** The chosen time is outside the venue's working hours (or not on the 15-minute grid). */
  outsideHours: "reservation/outside_hours",
  /** The chosen time has already passed. */
  inPast: "reservation/in_past",
  /** The chosen time is further ahead than the venue accepts (60 days). */
  tooFar: "reservation/too_far",
  /** Too many reservation requests in a short time; try again later. */
  rateLimited: "reservation/rate_limited",
  /** This phone already has the maximum number of open reservation requests at the venue. */
  tooManyOpen: "reservation/too_many_open",
  /** The reservation does not exist or is not reachable this way (never says which). */
  notFound: "reservation/not_found",
  /** The reservation was realized, declined or cancelled: it can no longer be cancelled. */
  notCancellable: "reservation/not_cancellable",
  /** The reservation changed while staff were deciding; nothing was written. */
  statusChanged: "reservation/status_changed",
  /** The status cannot move this way (lib/menu/reservation-status.ts). */
  invalidTransition: "reservation/invalid_transition",
  /** The ScanMe form needs the venue's working hours first (Podešavanja). */
  hoursMissing: "reservation/hours_missing",
  /** The link of the venue's own reservation system is not a valid https address. */
  urlInvalid: "reservation/url_invalid",
  /** The working hours are not valid (overlapping, more than three intervals, out of range). */
  hoursInvalid: "reservation/hours_invalid",
  /** The chosen table is not an active table of this venue. */
  positionInvalid: "reservation/position_invalid",
} as const;

export type ReservationErrorCode = (typeof RESERVATION_ERROR)[keyof typeof RESERVATION_ERROR];
