// ScanMe Menu V1 (K26) — machine codes of the reply to a guest: the venue's
// connected mailbox (Gmail or Microsoft through OAuth), the templates and the
// logged mailto:/phone replies (master §11.4; plan docs/meni/planovi/K24.md §3).
// Dependency-free like ./core.ts; the Serbian text lives in the `menu-odgovor`
// dictionary (`greske[code]`).
export const MAIL_ERROR = {
  /** The mailbox connection is not switched on for ScanMe (no keys on the server). */
  notConfigured: "mail/not_configured",
  /** This provider is not available, or it did not answer as expected. */
  providerUnavailable: "mail/provider_unavailable",
  /** The connect link expired, was already used or belongs to someone else. */
  stateInvalid: "mail/state_invalid",
  /** The person did not grant the permission to send messages on the provider's consent screen. */
  scopeMissing: "mail/scope_missing",
  /** The venue has no connected mailbox. */
  notConnected: "mail/not_connected",
  /** The provider no longer accepts the connection; an Owner or Manager connects it again. */
  reconnectRequired: "mail/reconnect_required",
  /** The reservation has no e-mail address of the guest. */
  noRecipient: "mail/no_recipient",
  /** The provider refused or failed to send the message. */
  sendFailed: "mail/send_failed",
  /** Too many messages or connection attempts in a short time. */
  rateLimited: "mail/rate_limited",
  /** A subject, a text or a signature is empty, too long or has a forbidden character. */
  invalidInput: "mail/invalid_input",
} as const;

export type MailErrorCode = (typeof MAIL_ERROR)[keyof typeof MAIL_ERROR];

const CODES: ReadonlySet<string> = new Set(Object.values(MAIL_ERROR));

export function isMailErrorCode(value: unknown): value is MailErrorCode {
  return typeof value === "string" && CODES.has(value);
}
