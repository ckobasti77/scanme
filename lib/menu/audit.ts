// ScanMe Menu V1 — the background audit trail (master §10.6: "Osetljive radnje
// ulaze u audit evidenciju u pozadini"). Only sensitive actions are logged;
// ordinary draft edits are not (the draft revision already records "who edited
// last"). Later steps append their actions here.

export const MENU_AUDIT_ACTIONS = [
  /** A Menu service was created (by ScanMe admin or by the client's first visit). */
  "service.provisioned",
  /** ScanMe admin changed the service mode. */
  "service.mode_changed",
  /** A page was deleted from the draft. */
  "page.deleted",
  /** A page was archived. */
  "page.archived",
] as const;

export type MenuAuditAction = (typeof MENU_AUDIT_ACTIONS)[number];
