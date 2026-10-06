// Admin UX A2 — filters and the chosen `Tabela | Kartice` view live in the
// query string, so a configured list can be opened, shared and restored with
// Back. Pure parse/serialize shared by useAdminQueryState and its tests:
// unknown keys and invalid values are dropped, never thrown.

export const ADMIN_QUERY_KEYS = [
  "dogadjaj",
  "izlagac",
  "brend",
  "model",
  "q",
  "paket",
  "status",
  "problemi",
  "qr",
  "foto",
  "stanje",
  "tip",
  "isporuka",
  "od",
  "do",
  "dan",
  "faza",
  "lead",
  "sort",
  "prikaz",
] as const;

export type AdminQueryKey = (typeof ADMIN_QUERY_KEYS)[number];
export type AdminQueryState = Partial<Record<AdminQueryKey, string>>;
export type AdminQueryPatch = Partial<Record<AdminQueryKey, string | null | undefined>>;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENUMS: Partial<Record<AdminQueryKey, readonly string[]>> = {
  paket: ["za-sve", "starter", "napredni"],
  problemi: ["greske", "upozorenja", "bez"],
  qr: ["ima", "nema"],
  foto: ["ima", "nema"],
  stanje: ["slobodan", "ovaj", "drugi", "neaktivan"],
  tip: ["zainteresovan", "probna-voznja"],
  isporuka: ["da", "ne"],
  faza: ["pre", "sajam", "posle"],
  prikaz: ["tabela", "kartice"],
};
const PATTERNS: Partial<Record<AdminQueryKey, RegExp>> = {
  dogadjaj: /^[a-z0-9-]{1,80}$/,
  izlagac: ID,
  brend: ID,
  model: ID,
  lead: ID,
  status: /^[a-z_-]{1,32}$/,
  od: DATE,
  do: DATE,
  dan: DATE,
  sort: /^[a-z0-9-]{1,40}:(asc|desc)$/,
};
const SEARCH_MAX = 120;

function isAdminQueryKey(key: string): key is AdminQueryKey {
  return (ADMIN_QUERY_KEYS as readonly string[]).includes(key);
}

/** The value as stored in the URL, or null when it is empty or not allowed for the key. */
export function normalizeAdminQueryValue(key: AdminQueryKey, raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (key === "q") return value.slice(0, SEARCH_MAX);
  const allowed = ENUMS[key];
  if (allowed) return allowed.includes(value) ? value : null;
  const pattern = PATTERNS[key];
  return pattern && pattern.test(value) ? value : null;
}

type QuerySource = string | URLSearchParams | { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function read(source: QuerySource, key: string): string | null {
  if (typeof source === "string") return new URLSearchParams(source.startsWith("?") ? source.slice(1) : source).get(key);
  if (typeof (source as { get?: unknown }).get === "function") return (source as { get(name: string): string | null }).get(key);
  const value = (source as Record<string, string | string[] | undefined>)[key];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** Known, valid keys only; `allowed` narrows to the keys of one section. */
export function parseAdminQuery(source: QuerySource, allowed: readonly AdminQueryKey[] = ADMIN_QUERY_KEYS): AdminQueryState {
  const state: AdminQueryState = {};
  for (const key of allowed) {
    const value = normalizeAdminQueryValue(key, read(source, key));
    if (value !== null) state[key] = value;
  }
  return state;
}

/** `?a=b&c=d` in the fixed key order (stable, shareable links), or "" when empty. */
export function serializeAdminQuery(state: AdminQueryState): string {
  const params = new URLSearchParams();
  for (const key of ADMIN_QUERY_KEYS) {
    const value = normalizeAdminQueryValue(key, state[key]);
    if (value !== null) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Applies a patch: a string sets the key, null/undefined/"" removes it. */
export function patchAdminQuery(current: AdminQueryState, patch: AdminQueryPatch): AdminQueryState {
  const next: AdminQueryState = { ...current };
  for (const [key, raw] of Object.entries(patch)) {
    if (!isAdminQueryKey(key)) continue;
    const value = normalizeAdminQueryValue(key, raw);
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}
