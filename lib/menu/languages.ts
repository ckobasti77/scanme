// ScanMe Menu V1 — menu languages (K03; master §7.7). Languages are managed in
// Settings; every language follows the structure of the same menu and a
// missing translation falls back to the source text (K14, K16). Standard has at
// most two languages per Menu service, the source language included; Premium
// has no commercial limit (lib/menu/capabilities.ts).

/** V1 menus are written in Serbian (Latin script); translations are added on top. */
export const MENU_SOURCE_LANGUAGE = "sr";

/** ISO 639-1 codes a menu can be translated into. */
export const MENU_TRANSLATION_LANGUAGES = [
  "en",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "nl",
  "ru",
  "uk",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "bg",
  "el",
  "tr",
  "sl",
  "hr",
  "bs",
  "mk",
  "sq",
  "zh",
  "ja",
  "ko",
  "ar",
  "he",
] as const;
export type MenuTranslationLanguage = (typeof MENU_TRANSLATION_LANGUAGES)[number];

const KNOWN: ReadonlySet<string> = new Set(MENU_TRANSLATION_LANGUAGES);

// K34: the languages of the list above that are written right to left.
const DESNO_NA_LEVO: ReadonlySet<string> = new Set<MenuTranslationLanguage>(["ar", "he"]);

/** The writing direction of a menu language: the public menu sets `dir="rtl"` on its root for "rtl". */
export function smerPisma(kod: string): "rtl" | "ltr" {
  return DESNO_NA_LEVO.has(kod) ? "rtl" : "ltr";
}

export type LanguageChangeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "limit" };

/**
 * May the translation languages go from `current` to `next`? Counts include the
 * source language. `next` must hold known codes, no duplicates and never the
 * source. Above `maxLanguages` the change is refused unless it only removes or
 * reorders languages — an account that lost Premium can always cut down, but
 * never add (master §2.2: the limit is commercial, existing content is kept).
 * `technicalMax` is never exceeded.
 */
export function checkLanguageChange(input: {
  current: readonly string[];
  next: readonly string[];
  maxLanguages: number;
  technicalMax: number;
}): LanguageChangeResult {
  const { current, next } = input;
  if (new Set(next).size !== next.length) return { ok: false, reason: "invalid" };
  if (next.some((code) => !KNOWN.has(code))) return { ok: false, reason: "invalid" };
  const total = 1 + next.length;
  if (total > input.technicalMax) return { ok: false, reason: "limit" };
  if (total <= input.maxLanguages) return { ok: true };
  const before = new Set(current);
  return next.every((code) => before.has(code)) ? { ok: true } : { ok: false, reason: "limit" };
}
