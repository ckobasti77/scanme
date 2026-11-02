// ScanMe Menu V1 (K04) — machine error codes of the article model: variants,
// add-on groups, combos, promotions, allergens and deletion (master §5.4–§5.7,
// §7.3, §7.5, §7.6). Dependency-free like ./core.ts; the Serbian text lives in
// the `menu-domen` dictionary (`errors[code]`).
export const ARTICLE_ERROR = {
  /** The promotion values do not make a discount (price ≥ regular, bad percent, no regular price). */
  promoInvalid: "article/promo_invalid",
  /** Allergens are off for this menu; turn them on before recording them. */
  allergensDisabled: "article/allergens_disabled",
  /** A combo component must be an existing ordinary article of the same menu, not the combo itself. */
  comboComponentInvalid: "article/combo_component_invalid",
  /** The operation needs a combo article (or an ordinary one, for components). */
  notCombo: "article/not_combo",
  /** The add-on group rules do not fit (min / max / required / single choice). */
  addonRulesInvalid: "article/addon_rules_invalid",
  /** The add-on group is already attached to this article. */
  addonGroupAttached: "article/addon_group_attached",
  /** The add-on group is not attached to this article. */
  addonGroupNotAttached: "article/addon_group_not_attached",
} as const;

export type ArticleErrorCode = (typeof ARTICLE_ERROR)[keyof typeof ARTICLE_ERROR];
