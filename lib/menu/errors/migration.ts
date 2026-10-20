// ScanMe Menu V1 (K06) — machine codes of the legacy migration and the
// internal import (master §6.2, §6.3; recipe §12). Dependency-free like
// ./core.ts; the Serbian text lives in the `menu-domen` dictionary
// (`errors[code]`, `migrationIssues[code]`, `migrationManualChecks[code]`).

/** Thrown (ConvexError): nothing was written. */
export const MENU_MIGRATION_ERROR = {
  /** The business has no legacy `menus` row to migrate. */
  legacyMenuMissing: "migration/legacy_menu_missing",
  /** The service is linked to a different legacy menu than the one guests are served. */
  legacyMenuMismatch: "migration/legacy_menu_mismatch",
  /** The service has no active default page ("Kompletan meni") to migrate into. */
  defaultPageMissing: "migration/default_page_missing",
} as const;

export type MenuMigrationErrorCode =
  (typeof MENU_MIGRATION_ERROR)[keyof typeof MENU_MIGRATION_ERROR];

/** Report issues that BLOCK the run: nothing is written while one is present. */
export const MENU_MIGRATION_BLOCKERS = [
  /** The legacy source changed after the run started: purge, then migrate again. */
  "source_changed",
  /** The default page would exceed MENU_MAX_SECTIONS_PER_PAGE. */
  "sections_limit",
  /** The service would exceed MENU_MAX_ARTICLES. */
  "articles_limit",
  /** The default page would exceed MENU_MAX_PLACEMENTS_PER_PAGE. */
  "placements_limit",
  /** The internal import goes only into a draft without articles. */
  "import_target_not_empty",
  /** The import would not fit one transaction (MENU_IMPORT_MAX_WRITES). */
  "import_too_large",
  /** Purge is refused after cutover; undo the cutover first. */
  "cutover_active",
  /** Cutover needs a finished migration. */
  "not_migrated",
  /** Cutover needs a published version of the new model (guests must have it first). */
  "not_published",
] as const;

/** Report issues the operator checks (master §6.3); they never block. */
export const MENU_MIGRATION_WARNINGS = [
  "source_empty",
  "draft_has_unpublished_changes",
  "target_not_empty",
  "item_name_empty",
  "section_untitled",
  "variant_name_empty",
  "text_whitespace_changed",
  "text_cut",
  "text_encoding_suspect",
  "diacritics_absent",
  "price_missing",
  "price_zero",
  "price_rounded",
  "price_invalid",
  "variants_truncated",
  "duplicate_name",
  "duplicate_source_id",
  "image_pending",
  "unavailable_from_live",
  "video_unmapped",
  "pairings_unmapped",
  "daypart_unmapped",
  "group_shape_unmapped",
] as const;

/** Post-migration differences: a migrated row no longer matches the legacy source. */
export const MENU_MIGRATION_DIFFERENCES = [
  "name_differs",
  "price_differs",
  "variants_differ",
  "placement_missing",
  "order_differs",
] as const;

export type MenuMigrationBlocker = (typeof MENU_MIGRATION_BLOCKERS)[number];
export type MenuMigrationWarning = (typeof MENU_MIGRATION_WARNINGS)[number];
export type MenuMigrationDifference = (typeof MENU_MIGRATION_DIFFERENCES)[number];
export type MenuMigrationIssueCode =
  | MenuMigrationBlocker
  | MenuMigrationWarning
  | MenuMigrationDifference;

/** What no automatic check can prove (master §6.3); always listed in the report. */
export const MENU_MIGRATION_MANUAL_CHECKS = [
  "image_rights",
  "allergens_provided",
  "phone_layout",
  "preview_before_publish",
] as const;

export type MenuMigrationManualCheck = (typeof MENU_MIGRATION_MANUAL_CHECKS)[number];
