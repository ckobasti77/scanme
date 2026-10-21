// ScanMe Menu V1 (K21) — machine codes of the guest's requests: call the
// waiter, ask for the bill, send an order to the waiter, cancel (master §8;
// plan docs/meni/planovi/K19.md K19-5…K19-10). Dependency-free like ./core.ts;
// the Serbian text lives in the `menu-domen` dictionary (`errors[code]`).
export const REQUEST_ERROR = {
  /** A value failed validation (empty cart, quantity, note too long, unknown payment…). */
  invalidInput: "request/invalid_input",
  /** No live guest session of this venue (no QR scanned, expired, another venue). */
  noSession: "request/no_session",
  /** The venue has this action off, or the position cannot use it (a room has no table actions). */
  actionOff: "request/action_off",
  /** Too many requests in a short time; try again in a minute. */
  rateLimited: "request/rate_limited",
  /** The venue has no published menu right now. */
  menuUnavailable: "request/menu_unavailable",
  /** One or more articles are "Privremeno nedostupno" right now; nothing was sent. */
  cartUnavailable: "request/cart_unavailable",
  /** An article, variant or add-on is no longer in the published menu; nothing was sent. */
  cartStale: "request/cart_stale",
  /** The prices changed since the guest saw them; the new total needs a confirmation. */
  cartPriceChanged: "request/cart_price_changed",
  /** The request does not exist or is not this device's (never says which). */
  notFound: "request/not_found",
  /** The request was already accepted or finished: only the staff can cancel it now. */
  notCancellable: "request/not_cancellable",
  /** The status cannot move this way (lib/menu/request-status.ts). */
  invalidTransition: "request/invalid_transition",
  /** Too many orders of this table or this phone still wait for the waiter; nothing was sent. */
  tooManyOpen: "request/too_many_open",
  /** Someone else already took the request (K22). */
  requestTaken: "request/taken",
} as const;

export type RequestErrorCode = (typeof REQUEST_ERROR)[keyof typeof REQUEST_ERROR];
