// TASK-66 (RFC-004 §2.6, §2.15) — the guest-facing refusal codes for ordering.
//
// DEPENDENCY-FREE ON PURPOSE, exactly like the memories pipeline protocol
// module: this file is imported by BOTH convex/orderingRequests.ts (which
// raises the codes) and the browser component that maps them to Serbian. If
// the codes lived in orderingRequests.ts, importing them client-side would drag
// _generated/server and the rate limiter into the guest's bundle.
//
// The codes are machine strings, never prose — the `ordering` i18n dictionary
// owns every word the guest reads (constraint 1, §2.15).
//
// `unavailable` is deliberately ONE code for EVERY cause of the disabled state
// (§2.6): stale heartbeat, no open shift, waiter paused, venue toggled ordering
// off, entitlement lapsed. The guest's remedy is identical in all of them —
// catch a waiter's eye — and naming the cause reads as the venue's fault. The
// A/B (involuntary/deliberate) distinction is diagnostic and belongs to the
// panel and owner surfaces only.
export const REQUEST_ERROR = {
  /** The venue ordering code does not resolve (or the business is inactive). */
  notFound: "request/not_found",
  /** No/typo'd/foreign guest bearer — the cookie did not arrive or is not ours. */
  invalidGuest: "request/invalid_guest",
  /** The guest was minted without a cardId: there is no table (§2.2, risk #1). */
  noTable: "request/no_table",
  /** THE single disabled state (§2.6). Never says which of the causes it was. */
  unavailable: "request/unavailable",
  /** Token bucket exhausted — guest-visible "sačekajte malo", never a silent drop. */
  rateLimited: "request/rate_limited",
  /** The submitted lines are malformed, foreign, sold out, or empty (§2.13). */
  invalidItems: "request/invalid_items",
  /** The reason chip is not one the venue configured (§2.1). */
  invalidReason: "request/invalid_reason",
  /** The free-text note is longer than a waiter will read (§2.1). */
  noteTooLong: "request/note_too_long",
  /** TASK-67: the request id does not exist, or is not this guest's / venue's. */
  requestNotFound: "request/request_not_found",
  /**
   * TASK-67 (§2.8): the guest tried to withdraw a request that is no longer
   * theirs to withdraw — a waiter has already accepted it, or it is already
   * completed/withdrawn. NOT a silent no-op: the guest must learn that someone
   * is already carrying their order, which is the opposite of the void §2.8
   * guards against.
   */
  notWithdrawable: "request/not_withdrawable",
  /**
   * TASK-67 (§2.7): a panel transition that the request's current status does
   * not allow (marking `sent` as en route, completing twice, …). Panel-facing;
   * TASK-68's `ordering-panel` surface maps it. A guest never sees it.
   */
  invalidTransition: "request/invalid_transition",
} as const;
