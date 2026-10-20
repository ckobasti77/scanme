// ScanMe Menu V1 — text normalization shared by Convex and the editor.

const TRANSLITERATION: Record<string, string> = {
  č: "c",
  ć: "c",
  š: "s",
  ž: "z",
  đ: "dj",
};

/** Lowercase Latin without Serbian diacritics: "Ćevapi Đurđevak" → "cevapi djurdjevak". */
export function foldSerbian(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čćšžđ]/g, (char) => TRANSLITERATION[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/** Trim and collapse inner whitespace. */
export function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * The duplicate-detection form of an article name (master §5.2: the backend
 * prevents needless duplicates). Diacritics, case, punctuation and spacing do
 * not make two articles different: "Šljivovica 0,5" ≡ "sljivovica 0.5".
 */
export function normalizeArticleName(name: string): string {
  return foldSerbian(cleanText(name))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Validates a required text field: cleaned, 1..max characters. Returns the
 * cleaned value, or null when it is empty or too long — the caller raises
 * MENU_ERROR.invalidInput. Over-long text is refused, never silently cut.
 */
export function requiredText(value: string, max: number): string | null {
  const cleaned = cleanText(value);
  if (cleaned.length === 0 || cleaned.length > max) return null;
  return cleaned;
}

/**
 * Validates an optional text field. `undefined` = absent, `""` after cleaning
 * = absent, longer than max = invalid (`false`).
 */
export function optionalText(
  value: string | undefined,
  max: number,
): string | undefined | false {
  if (value === undefined) return undefined;
  const cleaned = cleanText(value);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length > max) return false;
  return cleaned;
}
