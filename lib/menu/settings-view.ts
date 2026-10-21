// ScanMe Menu V1 (K28) — the pure logic behind Podešavanja > Jezici (master
// §7.7; plan docs/meni/planovi/K24.md §4.7). The limit counts the source
// language too: Standard has 2 in all (Serbian + one translation), Premium has no
// commercial limit. The server decides (lib/menu/languages.ts
// checkLanguageChange); this only tells the screen what to offer. Dependency-free
// apart from the language list.

import { MENU_SOURCE_LANGUAGE, MENU_TRANSLATION_LANGUAGES } from "./languages";

/** The source language plus the translations. */
export function totalLanguages(translations: readonly string[]): number {
  return translations.length + 1;
}

/** The stored list is already above the limit (an account that lost Premium): it can only shrink. */
export function isOverLanguageLimit(translations: readonly string[], maxLanguages: number): boolean {
  return totalLanguages(translations) > maxLanguages;
}

/** The codes that can still be added: known, not the source, not already chosen, in the list's order. */
export function remainingLanguages(translations: readonly string[]): string[] {
  const chosen = new Set<string>([MENU_SOURCE_LANGUAGE, ...translations]);
  return MENU_TRANSLATION_LANGUAGES.filter((code) => !chosen.has(code));
}

/** One more language fits under the limit and there is one left to add. */
export function canAddLanguage(translations: readonly string[], maxLanguages: number): boolean {
  return totalLanguages(translations) < maxLanguages && remainingLanguages(translations).length > 0;
}

/** The list with `code` added at the end; unchanged when it cannot be added. */
export function addLanguage(translations: readonly string[], code: string, maxLanguages: number): string[] {
  if (!canAddLanguage(translations, maxLanguages)) return [...translations];
  if (!remainingLanguages(translations).includes(code)) return [...translations];
  return [...translations, code];
}

/** The list without `code`. */
export function removeLanguage(translations: readonly string[], code: string): string[] {
  return translations.filter((item) => item !== code);
}

/** Same codes in the same order. */
export function sameLanguages(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code, index) => code === b[index]);
}
