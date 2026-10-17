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
  /** A Funkcionalnosti switch was turned on or off (K03). */
  "feature.changed",
  /** A shared article was deleted from every page (K04, master §5.6). */
  "article.deleted",
  /** A shared add-on group was deleted from every article it was linked to (K04). */
  "addon_group.deleted",
  /** The draft was published as a new version (K05, master §6.1). */
  "version.published",
  /** A published version was restored into the draft (K05). */
  "version.restored",
] as const;

export type MenuAuditAction = (typeof MENU_AUDIT_ACTIONS)[number];
