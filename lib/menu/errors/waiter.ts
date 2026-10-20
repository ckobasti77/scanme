// ScanMe Menu V1 (K22) — machine codes of the waiter panel: staff members,
// their three-digit PINs, the panel code and the staff session (master §10.6;
// plan docs/meni/planovi/K19.md K19-13…K19-16). Dependency-free like ./core.ts;
// the Serbian text lives in the `menu-domen` dictionary (`errors[code]`).
export const STAFF_ERROR = {
  /** The PIN switch of the deployment is off (no MENU_PIN_PEPPER): no PIN can be set or used. */
  pinUnavailable: "staff/pin_unavailable",
  /** A PIN is exactly three digits. */
  pinFormat: "staff/pin_format",
  /** Another active staff member of this venue already has this PIN. */
  pinTaken: "staff/pin_taken",
  /** No free PIN was found (almost every combination is taken). */
  pinExhausted: "staff/pin_exhausted",
  /** The PIN does not match any active staff member (never says whether one exists). */
  wrongPin: "staff/wrong_pin",
  /** Too many wrong PINs: this device (or every new device of the venue) waits until `lockedUntil`. */
  locked: "staff/locked",
  /** Too many attempts from this network in a short time. */
  rateLimited: "staff/rate_limited",
  /** The panel link is wrong or was changed (answered as 404). */
  panelNotFound: "staff/panel_not_found",
  /** The staff name is empty or too long. */
  nameInvalid: "staff/name_invalid",
  /** The venue already has the maximum number of active staff members. */
  staffLimit: "staff/limit",
  /** The staff member was deactivated. */
  inactive: "staff/inactive",
  /** The device is no longer signed in (logged out, 12 h passed, PIN reset, link changed). */
  signedOut: "staff/signed_out",
  /** The request changed while the waiter was deciding; nothing was written. */
  statusChanged: "staff/status_changed",
} as const;

export type StaffErrorCode = (typeof STAFF_ERROR)[keyof typeof STAFF_ERROR];
