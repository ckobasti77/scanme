// ScanMe Menu V1 (K16) — machine codes of translations and the AI translation
// suggestion (master §7.7, P7). Dependency-free like ./core.ts; the Serbian
// text lives in the `menu-domen` dictionary (`errors[code]`).

export const TRANSLATION_ERROR = {
  /** The language is not one of the menu's languages (Settings) for this plan. */
  languageOff: "translation/language_off",
  /** No AI key is configured on the deployment: suggestions are switched off. */
  aiDisabled: "translation/ai_disabled",
  /** The AI service did not answer usefully; nothing was stored. */
  aiFailed: "translation/ai_failed",
  /** The source text changed while the suggestion was made; ask again. */
  sourceChanged: "translation/source_changed",
  /** There is nothing to translate (the source texts are empty). */
  nothingToTranslate: "translation/nothing_to_translate",
} as const;

export type TranslationErrorCode = (typeof TRANSLATION_ERROR)[keyof typeof TRANSLATION_ERROR];
