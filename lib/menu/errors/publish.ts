// ScanMe Menu V1 (K04) — machine codes of publish-validation issues (master
// §5.5, §6.1: errors block publishing, warnings ask for a conscious
// confirmation). Produced by lib/menu/publish-validation.ts; the Serbian text
// lives in the `menu-domen` dictionary (`publishIssues[code]`).
// Dependency-free like ./core.ts.

/** Blocking: the article cannot be published until it is fixed (master §5.5). */
export const MENU_PUBLISH_ERRORS = [
  /** No name. */
  "name_missing",
  /** Not shown in any section. */
  "section_missing",
  /** No base price and no variant with a price (combos: no manual price). */
  "price_missing",
] as const;

/** Non-blocking: shown before publishing, confirmed consciously. */
export const MENU_PUBLISH_WARNINGS = [
  /** Variants are on but there are none; the base price is used. */
  "variants_empty",
  /** A variant has no price of its own and there is no base price to fall back on. */
  "variant_price_missing",
  /** A linked add-on group has no options. */
  "addon_group_empty",
  /** An add-on group asks for more choices than it has options. */
  "addon_group_unsatisfiable",
  /** The promotion cannot apply (no regular price, not lower, price mode with variants); the regular price shows. */
  "promo_invalid",
  /** A scheduled promotion while the account is not Premium; it will not be scheduled. */
  "promo_schedule_premium",
  /** A combo whose component price changed or component was deleted: check the combo price. */
  "combo_price_check",
  /** A combo without components. */
  "combo_empty",
  /** The article is on no page, not in Room service and in no combo: guests will not see it. */
  "article_unplaced",
] as const;

/**
 * K05 — non-blocking warnings of the WHOLE publication (lib/menu/publish-checks.ts),
 * not of one article; confirmed together with the article warnings.
 */
export const MENU_PUBLICATION_WARNINGS = [
  /** A published language lacks a confirmed translation; guests read the source text there. */
  "translation_missing",
  /** Room service is switched on, but the account is no longer Premium: it is not published. */
  "room_service_premium",
  /** A language above the Standard limit (lost Premium) is not published. */
  "language_premium",
] as const;

export type MenuPublishErrorCode = (typeof MENU_PUBLISH_ERRORS)[number];
export type MenuPublishWarningCode = (typeof MENU_PUBLISH_WARNINGS)[number];
export type MenuPublicationWarningCode = (typeof MENU_PUBLICATION_WARNINGS)[number];
export type MenuPublishIssueCode =
  | MenuPublishErrorCode
  | MenuPublishWarningCode
  | MenuPublicationWarningCode;
