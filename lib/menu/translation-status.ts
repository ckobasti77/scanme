// ScanMe Menu V1 (K16) — the state of a translation (master §7.7).
//
// PURE. Languages are managed in Settings; the editor shows, per enabled
// language and per text field, whether the translation is
//   missing    — nothing confirmed (guests read the source text),
//   stale      — confirmed, but the source text changed since (by hash),
//   suggested  — only an AI suggestion exists, waiting for the owner,
//   done       — confirmed and made from the current source text.
// A suggestion is NEVER a translation: it lives next to the confirmed text
// (`suggestion`) and is published only after the owner confirms it
// (lib/menu/snapshot.ts confirmedTranslation reads the confirmed text only).
// The writers below are shared by convex/menuTranslations.ts and the izlog's
// memory (lib/menu/studio/memorija-k16.ts), so both keep the same rules.

import { cleanText } from "./text";

export const MENU_TRANSLATION_FIELDS = ["name", "description", "publicTitle"] as const;
export type MenuTranslationField = (typeof MENU_TRANSLATION_FIELDS)[number];

const HASH_FIELD: Record<MenuTranslationField, "nameHash" | "descriptionHash" | "titleHash"> = {
  name: "nameHash",
  description: "descriptionHash",
  publicTitle: "titleHash",
};

export type MenuTranslationSuggestion = {
  name?: string;
  description?: string;
  publicTitle?: string;
  /** Hashes of the source texts the suggestion was made from. */
  nameHash?: string;
  descriptionHash?: string;
  titleHash?: string;
  at: number;
};

export type MenuTranslationEntry = {
  name?: string;
  description?: string;
  publicTitle?: string;
  nameHash?: string;
  descriptionHash?: string;
  titleHash?: string;
  /** "confirmed" = the main fields are published; "suggested" = the entry holds only a suggestion. */
  status: "confirmed" | "suggested";
  suggestion?: MenuTranslationSuggestion;
};

export type MenuTranslations = Record<string, MenuTranslationEntry>;

export type MenuTranslationStatus = "missing" | "stale" | "suggested" | "done";

/**
 * A short, stable fingerprint of a source text (FNV-1a, 32 bit, base 36),
 * computed on the cleaned text so spacing changes do not make a translation
 * stale. The same in the browser, in Convex and in tests.
 */
export function sourceHash(text: string): string {
  const cleaned = cleanText(text);
  let hash = 0x811c9dc5;
  for (let index = 0; index < cleaned.length; index += 1) {
    hash ^= cleaned.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function filled(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export type FieldTranslationView = {
  /** null = the source field is empty: nothing to translate. */
  status: MenuTranslationStatus | null;
  /** The confirmed (published) translation, also when it is stale. */
  confirmed: string | null;
  /** A pending AI suggestion for this field (never published). */
  suggestion: string | null;
};

/** The state of one field in one language. */
export function fieldTranslation(
  source: string | null | undefined,
  entry: MenuTranslationEntry | null | undefined,
  field: MenuTranslationField,
): FieldTranslationView {
  const suggestion = filled(entry?.suggestion?.[field]) ? entry!.suggestion![field]! : null;
  const confirmed = entry?.status === "confirmed" && filled(entry[field]) ? entry[field]! : null;
  if (!filled(source)) return { status: null, confirmed, suggestion };
  if (confirmed !== null) {
    const stored = entry?.[HASH_FIELD[field]];
    // A translation stored without a hash (older data) is not called stale: unknown, not wrong.
    const stale = stored !== undefined && stored !== sourceHash(source);
    return { status: stale ? "stale" : "done", confirmed, suggestion };
  }
  return { status: suggestion !== null ? "suggested" : "missing", confirmed, suggestion };
}

const RANK: Record<MenuTranslationStatus, number> = { missing: 3, stale: 2, suggested: 1, done: 0 };

/** The worst state over the fields that have a source text; null = nothing to translate. */
export function worstStatus(statuses: readonly (MenuTranslationStatus | null)[]): MenuTranslationStatus | null {
  let worst: MenuTranslationStatus | null = null;
  for (const status of statuses) {
    if (status === null) continue;
    if (worst === null || RANK[status] > RANK[worst]) worst = status;
  }
  return worst;
}

/** The state of an entity (its text fields) in one language. */
export function entityTranslationStatus(
  sources: Partial<Record<MenuTranslationField, string | null>>,
  translations: MenuTranslations | null | undefined,
  lang: string,
): MenuTranslationStatus | null {
  const entry = translations?.[lang];
  return worstStatus(
    (Object.keys(sources) as MenuTranslationField[]).map((field) => fieldTranslation(sources[field], entry, field).status),
  );
}

/** How many entities are in each state (null states are not counted). */
export function countStatuses(statuses: readonly (MenuTranslationStatus | null)[]): Record<MenuTranslationStatus, number> {
  const counts: Record<MenuTranslationStatus, number> = { missing: 0, stale: 0, suggested: 0, done: 0 };
  for (const status of statuses) if (status !== null) counts[status] += 1;
  return counts;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function put(translations: MenuTranslations | null | undefined, lang: string, entry: MenuTranslationEntry | null): MenuTranslations | undefined {
  const next: MenuTranslations = { ...(translations ?? {}) };
  if (entry === null) delete next[lang];
  else next[lang] = entry;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** True when the entry still carries something worth keeping. */
function meaningful(entry: MenuTranslationEntry): boolean {
  const main = MENU_TRANSLATION_FIELDS.some((field) => filled(entry[field]));
  return (entry.status === "confirmed" && main) || entry.suggestion !== undefined;
}

/**
 * The owner typed (or cleared, `value` null) one field: it becomes confirmed,
 * made from the CURRENT source text. A confirmed entry stays confirmed; an
 * entry that held only a suggestion becomes confirmed for the typed field,
 * and the suggestion of THAT field is dropped (the owner's text wins).
 */
export function withTypedTranslation(
  translations: MenuTranslations | null | undefined,
  lang: string,
  field: MenuTranslationField,
  value: string | null,
  source: string,
): MenuTranslations | undefined {
  const current = translations?.[lang];
  const base: MenuTranslationEntry =
    current?.status === "confirmed"
      ? { ...current }
      : { status: "confirmed", ...(current?.suggestion ? { suggestion: current.suggestion } : {}) };
  const hashKey = HASH_FIELD[field];
  const cleaned = value === null ? null : cleanText(value);
  if (cleaned === null || cleaned === "") {
    delete base[field];
    delete base[hashKey];
  } else {
    base[field] = cleaned;
    base[hashKey] = sourceHash(source);
  }
  if (base.suggestion) {
    const suggestion = { ...base.suggestion };
    delete suggestion[field];
    delete suggestion[hashKey];
    base.suggestion = MENU_TRANSLATION_FIELDS.some((f) => filled(suggestion[f])) ? suggestion : undefined;
  }
  const entry = withoutUndefined(base);
  return put(translations, lang, meaningful(entry) ? entry : null);
}

/**
 * Stores an AI suggestion next to whatever is confirmed. Nothing confirmed
 * changes, so nothing published changes (master §7.7).
 */
export function withSuggestion(
  translations: MenuTranslations | null | undefined,
  lang: string,
  texts: Partial<Record<MenuTranslationField, string>>,
  sources: Partial<Record<MenuTranslationField, string | null>>,
  at: number,
): MenuTranslations | undefined {
  const suggestion: MenuTranslationSuggestion = { at };
  for (const field of MENU_TRANSLATION_FIELDS) {
    const text = texts[field];
    const source = sources[field];
    if (!filled(text) || !filled(source)) continue;
    suggestion[field] = cleanText(text);
    suggestion[HASH_FIELD[field]] = sourceHash(source);
  }
  if (!MENU_TRANSLATION_FIELDS.some((field) => filled(suggestion[field]))) return translations ?? undefined;
  const current = translations?.[lang];
  const entry: MenuTranslationEntry = current ? { ...current, suggestion } : { status: "suggested", suggestion };
  return put(translations, lang, entry);
}

/**
 * The owner confirmed the suggestion (as shown, or edited: `edited` replaces
 * single fields). The suggested fields become the confirmed translation with
 * the hashes of the sources they were made from; the suggestion is gone.
 */
export function withConfirmedSuggestion(
  translations: MenuTranslations | null | undefined,
  lang: string,
  edited: Partial<Record<MenuTranslationField, string>> = {},
): MenuTranslations | undefined {
  const current = translations?.[lang];
  const suggestion = current?.suggestion;
  if (!current || !suggestion) return translations ?? undefined;
  const entry: MenuTranslationEntry = current.status === "confirmed" ? { ...current } : { status: "confirmed" };
  entry.status = "confirmed";
  delete entry.suggestion;
  for (const field of MENU_TRANSLATION_FIELDS) {
    const text = filled(edited[field]) ? edited[field] : suggestion[field];
    if (!filled(text)) continue;
    entry[field] = cleanText(text);
    const hash = suggestion[HASH_FIELD[field]];
    if (hash !== undefined) entry[HASH_FIELD[field]] = hash;
  }
  return put(translations, lang, withoutUndefined(entry));
}

/** The owner rejected the suggestion: it is dropped, the confirmed text stays as it was. */
export function withoutSuggestion(translations: MenuTranslations | null | undefined, lang: string): MenuTranslations | undefined {
  const current = translations?.[lang];
  if (!current?.suggestion) return translations ?? undefined;
  const entry = { ...current };
  delete entry.suggestion;
  return put(translations, lang, meaningful(entry) ? entry : null);
}

/**
 * "Prevod je i dalje dobar": the owner looked at a stale translation and keeps
 * it; its hashes move to the current source texts.
 */
export function withReviewedTranslation(
  translations: MenuTranslations | null | undefined,
  lang: string,
  sources: Partial<Record<MenuTranslationField, string | null>>,
): MenuTranslations | undefined {
  const current = translations?.[lang];
  if (current?.status !== "confirmed") return translations ?? undefined;
  const entry = { ...current };
  for (const field of MENU_TRANSLATION_FIELDS) {
    const source = sources[field];
    if (filled(entry[field]) && filled(source)) entry[HASH_FIELD[field]] = sourceHash(source);
  }
  return put(translations, lang, entry);
}
