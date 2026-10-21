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
  // K20 — Lokal i QR (master §9, §10.6: sensitive venue actions only).
  /** A zone was archived; its positions moved to "Bez zone". */
  "zone.archived",
  /** A position (table, room) was archived. */
  "position.archived",
  /** Menu QR cards were created for positions or pages. */
  "qr.minted",
  /** A QR card was linked to a page and/or position (or the link changed). */
  "qr.linked",
  /** A QR card lost its Menu link (opens the menu without a page or position). */
  "qr.unlinked",
  /** A QR card was disabled or enabled again. */
  "qr.card_status",
  // K21 — guest requests (master §8.4). Accepting and finishing are recorded on
  // the request row itself (who and when, plan K19-16); a cancellation is
  // recorded here as well, whoever cancels.
  /** A request (call, bill, order) was cancelled by the guest or the staff. */
  "request.cancelled",
  // K22 — staff, PINs and the waiter panel (master §10.6; plan K19-16). Never
  // the PIN itself, its hash or a token: only who, what and when.
  /** A staff member was created. */
  "staff.created",
  /** A staff member's role in the panel changed (a panel `manager` re-assigns zones, K23). */
  "staff.role_changed",
  /** A staff member was deactivated (their PIN is cleared, their sessions end). */
  "staff.deactivated",
  /** A PIN was set or changed by the Owner or a Manager (the PIN is never written here). */
  "staff.pin_set",
  /** A PIN was reset (cleared) by the Owner or a Manager; the member's sessions end. */
  "staff.pin_reset",
  /** Too many wrong PINs locked a device or every new device of the venue. */
  "staff.pin_locked",
  /** The Owner or a Manager lifted the PIN locks. */
  "staff.pins_unlocked",
  /** The waiter-panel link (its code) was created or changed; every staff session ended. */
  "panel.code_rotated",
  /** Someone signed in to the waiter panel (PIN, or the Owner/Manager account). */
  "staff.login",
  /** A staff member signed out of the waiter panel. */
  "staff.logout",
  // K23 — zones are a filter, not routing (master §9.3). A waiter changing their
  // OWN active zone is not audited; re-assigning someone else is.
  /** The Owner, a Manager or a panel manager set another staff member's active zone. */
  "staff.zone_assigned",
] as const;

export type MenuAuditAction = (typeof MENU_AUDIT_ACTIONS)[number];
