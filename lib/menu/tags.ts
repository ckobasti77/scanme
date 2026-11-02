// ScanMe Menu V1 (K04) — tags and dietary characteristics of an article
// ("oznake i prehrambene karakteristike", master §5.5). Optional, a closed
// curated list (no free-form badges: master §15 asks for curated
// modularity). The Serbian names live in the `menu-domen` dictionary
// (`tags[code]`).
//
// Deliberately NOT here: "bez glutena", "bez laktoze" and similar safety
// claims. Allergen information is the separate allergen system (§7.3), which
// never promises that an article is safe.
//
// `recommended` ("Preporuka") is also a promotion label (§7.6). An article
// that has both shows ONE badge (the renderer de-duplicates by meaning).

export const MENU_TAG_CODES = [
  "vegan",
  "vegetarian",
  "spicy",
  "recommended",
  "new",
  "house_special",
  "homemade",
] as const;
export type MenuTagCode = (typeof MENU_TAG_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(MENU_TAG_CODES);

export function isMenuTagCode(value: string): value is MenuTagCode {
  return CODE_SET.has(value);
}

/**
 * The stored form of a tag list: unique, in the canonical order of
 * MENU_TAG_CODES (so the same set always compares equal). Null when a value
 * is not a known code.
 */
export function normalizeTags(values: readonly string[]): MenuTagCode[] | null {
  if (!values.every(isMenuTagCode)) return null;
  const chosen = new Set(values);
  return MENU_TAG_CODES.filter((code) => chosen.has(code));
}
