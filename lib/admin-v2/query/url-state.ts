// ADMIN v2 — filters, views, search and sort of an admin list live in the
// query string (ZADATAK §3): a configured list can be shared, restored with
// Back and survives a reload. Pure parse/patch by a per-page schema: a value
// the schema does not allow reads as absent, a default is never written and
// parameters the schema does not know (`?task=`, `?profile=`…) are kept.

import { groupKeys } from "@/lib/admin-v2/sidebar/accordion";
import type { SidebarConfig, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";

export type UrlField = {
  key: string;
  /** Allowed values; without them `pattern` decides. */
  values?: readonly string[];
  pattern?: RegExp;
  /** Not written to the URL; an absent key reads as absent, the page applies the default. */
  defaultValue?: string;
  /** Free text (search): cut to this length. */
  maxLength?: number;
};

/** Ids, slugs, dates and `column:asc` sorts. */
const VALUE = /^[A-Za-z0-9_.:-]{1,80}$/;
const SEARCH_MAX = 120;

type Source = string | URLSearchParams | { toString(): string };

function params(source: Source): URLSearchParams {
  if (typeof source === "string") return new URLSearchParams(source.startsWith("?") ? source.slice(1) : source);
  return new URLSearchParams(source.toString());
}

function normalize(field: UrlField, raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (field.maxLength) return value.slice(0, field.maxLength);
  if (field.values) return field.values.includes(value) ? value : null;
  return (field.pattern ?? VALUE).test(value) ? value : null;
}

/** Every URL key the sidebar of a page reads and writes. */
export function sidebarUrlFields(config: SidebarConfig): UrlField[] {
  const fields: UrlField[] = [];
  // The choice of an always open context list (Tim: the member, Pošta: the folder) is a URL key too: an intercept may clear it.
  if (config.context?.list) fields.push({ key: config.context.id });
  if (config.views) fields.push({ key: config.views.key, values: config.views.items.map((item) => item.value), defaultValue: config.views.defaultValue });
  if (config.search) fields.push({ key: config.search.key, maxLength: SEARCH_MAX });
  for (const group of config.groups ?? []) {
    for (const key of groupKeys(group)) {
      const field: UrlField =
        group.kind === "custom" ? (group.textKeys?.includes(key) ? { key, maxLength: SEARCH_MAX } : { key })
        : group.options ? { key, values: group.options.map((option) => option.value) }
        : { key };
      fields.push(group.defaultValue ? { ...field, defaultValue: group.defaultValue } : field);
    }
  }
  if (config.sort) fields.push({ key: config.sort.key, values: config.sort.options.map((option) => option.value), defaultValue: config.sort.defaultValue });
  return fields;
}

/** The valid, non-default values of the schema's keys. */
export function readUrlState(fields: readonly UrlField[], source: Source): SidebarState {
  const search = params(source);
  const state: SidebarState = {};
  for (const field of fields) {
    const value = normalize(field, search.get(field.key));
    if (value !== null && value !== field.defaultValue) state[field.key] = value;
  }
  return state;
}

/**
 * The query string after `patch` (`?a=b` or ""): a string sets the key; null,
 * an empty, a default or a not allowed value removes it. Keys outside the
 * schema are neither written nor removed.
 */
export function writeUrlState(fields: readonly UrlField[], source: Source, patch: SidebarPatch): string {
  const search = params(source);
  for (const [key, raw] of Object.entries(patch)) {
    const field = fields.find((row) => row.key === key);
    if (!field) continue;
    const value = normalize(field, raw);
    if (value === null || value === field.defaultValue) search.delete(key);
    else search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
