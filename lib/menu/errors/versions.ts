// ScanMe Menu V1 (K05) — machine codes of publishing and versions (master
// §6.1). Dependency-free like ./core.ts; the Serbian text lives in the
// `menu-domen` dictionary (`errors[code]`, `publishRefusals[reason]`).

/** Thrown (ConvexError): nothing was written, the public menu is unchanged. */
export const MENU_VERSION_ERROR = {
  /** The version would not fit one transaction (lib/menu/budget.ts); publishing in phases is a later step. */
  publishTooLarge: "menu/publish_too_large",
  /** Restoring this version would not fit one transaction; batched restore is a later step (K18). */
  restoreTooLarge: "menu/restore_too_large",
} as const;

export type MenuVersionErrorCode = (typeof MENU_VERSION_ERROR)[keyof typeof MENU_VERSION_ERROR];

/**
 * Returned (not thrown) when publish or restore refuses. Nothing was written
 * and the public menu is unchanged; the editor shows the reason and what to do.
 */
export const MENU_PUBLISH_REFUSALS = [
  /** The draft changed after the preview (the same or another person). */
  "stale_draft",
  /** The draft is the live version: nothing to publish. */
  "no_changes",
  /** Validation errors block publishing (master §5.5). */
  "validation_failed",
  /** Warnings need a conscious confirmation of exactly these warnings. */
  "confirmation_required",
] as const;

export type MenuPublishRefusal = (typeof MENU_PUBLISH_REFUSALS)[number];
