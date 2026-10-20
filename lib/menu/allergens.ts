// ScanMe Menu V1 (K04) — allergens (master §7.3).
//
// An OPTIONAL system of the venue, never a required field: allergens are kept
// only while the venue turns them on (menuServices.settings.allergensEnabled),
// and only on the articles where the venue records them. Absent data NEVER
// means "safe" — an article without a record is "unknown", and the guest is
// always told to check with the staff. `contains` and `mayContain` ("Može
// sadržati tragove") are kept apart. Codes are the 14 major allergen
// categories (EU 1169/2011 Annex II, the Serbian labelling rulebook follows
// it) plus `other` ("Drugo", described by free text). The Serbian names live
// in the `menu-domen` dictionary (`allergens[code]`).

export const MENU_ALLERGEN_CODES = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
  "other",
] as const;
export type MenuAllergenCode = (typeof MENU_ALLERGEN_CODES)[number];

/** The 14 standard categories, without `other`. */
export const MENU_STANDARD_ALLERGEN_CODES = MENU_ALLERGEN_CODES.filter(
  (code): code is Exclude<MenuAllergenCode, "other"> => code !== "other",
);

const CODE_SET: ReadonlySet<string> = new Set(MENU_ALLERGEN_CODES);

export function isMenuAllergenCode(value: string): value is MenuAllergenCode {
  return CODE_SET.has(value);
}

/** What an article records. Absent (null) = unknown — never "safe". */
export type MenuArticleAllergens = {
  contains: MenuAllergenCode[];
  mayContain: MenuAllergenCode[];
  /** Describes `other` ("Drugo"); present only when `other` is listed. */
  otherText?: string;
};

/**
 * The guest-facing reading of one article for the allergens a guest marked
 * (master §7.3: a highlight, never a filter, never a promise):
 * - `contains` — the article lists a marked allergen as an ingredient;
 * - `may_contain` — only as possible traces;
 * - `unknown` — the venue recorded nothing for this article;
 * - `not_listed` — recorded, and none of the marked allergens is listed. This
 *   is NOT "safe": the UI still shows the staff disclaimer.
 * Marking nothing gives `none`. Allergens switched off for the menu give `off`
 * (the renderer shows no allergen UI at all).
 */
export type MenuAllergenMatch = "off" | "none" | "contains" | "may_contain" | "unknown" | "not_listed";

export function allergenMatch(input: {
  enabled: boolean;
  marked: readonly MenuAllergenCode[];
  allergens: MenuArticleAllergens | null | undefined;
}): MenuAllergenMatch {
  if (!input.enabled) return "off";
  if (input.marked.length === 0) return "none";
  if (!input.allergens) return "unknown";
  const marked = new Set(input.marked);
  if (input.allergens.contains.some((code) => marked.has(code))) return "contains";
  if (input.allergens.mayContain.some((code) => marked.has(code))) return "may_contain";
  return "not_listed";
}
