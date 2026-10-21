// ScanMe Menu V1 (K28) — machine codes of Tim i pristupi: invitations into the
// team of one Menu service and changes of a member's role (master §10.6; plan
// docs/meni/planovi/K24.md §4.6, K24-21). Dependency-free like ./core.ts; the
// Serbian text lives in the `menu-domen` dictionary (`errors[code]`).
export const TEAM_ERROR = {
  /** The address already has a valid invitation or is already a member of this team. */
  inviteExists: "team/invite_exists",
  /** The invitation link is unknown, revoked, already used or expired. */
  inviteInvalid: "team/invite_invalid",
  /** The signed-in account has another e-mail address than the invitation. */
  emailMismatch: "team/email_mismatch",
  /** The caller may not give (or take away) this role: a Manager never touches the Owner role. */
  roleForbidden: "team/role_forbidden",
  /** Nobody changes their own role or removes themselves. */
  selfChange: "team/self_change",
  /** The team of this Menu service is full. */
  teamFull: "team/full",
  /** The e-mail address is not valid. */
  emailInvalid: "team/email_invalid",
} as const;

export type TeamErrorCode = (typeof TEAM_ERROR)[keyof typeof TEAM_ERROR];
