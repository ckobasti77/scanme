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
  /** The legacy menu was migrated into the draft (K06, internal; master §6.2). */
  "legacy.migrated",
  /** The rows a migration or import created were removed again (K06 rollback). */
  "legacy.purged",
  /** The legacy writers were switched off for the migrated menu (K06). */
  "legacy.cutover",
  /** The cutover was undone: the legacy writers work again (K06 rollback). */
  "legacy.cutover_reverted",
  /** ScanMe imported a menu into the draft (K06, internal import; master §6.2). */
  "legacy.imported",
] as const;

export type MenuAuditAction = (typeof MENU_AUDIT_ACTIONS)[number];
