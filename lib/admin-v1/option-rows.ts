// Admin UX A6 — the answer options of a Glas publike question or a survey
// question as dynamic rows (add, remove, move up/down; A0 §2.9
// AdminOptionRows). Pure, shared by the component and its tests. Option ids
// stay stable (o1…o5): a new row takes the first free id, because votes and
// answers store the `optionId`, never the position.

import { FAIR_AUDIENCE_OPTIONS_MAX, FAIR_AUDIENCE_OPTIONS_MIN } from "@/lib/fair-contract";
import { normalizeSearch } from "./hierarchy";

export type OptionRow = { id: string; label: string };
export type OptionRowLimits = { min: number; max: number };

/** Glas publike and survey choice questions: 2–5 options (lib/fair-contract). */
export const AUDIENCE_OPTION_LIMITS: OptionRowLimits = { min: FAIR_AUDIENCE_OPTIONS_MIN, max: FAIR_AUDIENCE_OPTIONS_MAX };

export type OptionRowsProblem =
  | { kind: "too_few"; min: number }
  | { kind: "too_many"; max: number }
  | { kind: "empty"; rowIds: string[] }
  | { kind: "duplicate"; rowIds: string[] };

/** The first id o1, o2… that no row uses. */
export function nextOptionId(rows: readonly OptionRow[]): string {
  const used = new Set(rows.map((row) => row.id));
  for (let n = 1; ; n += 1) if (!used.has(`o${n}`)) return `o${n}`;
}

/** `count` empty rows o1…oN (a new question starts with the minimum). */
export function emptyOptionRows(count: number = AUDIENCE_OPTION_LIMITS.min): OptionRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: `o${index + 1}`, label: "" }));
}

/** Rows of a stored question (sorted by `order`), e.g. when a draft is edited. */
export function optionRowsFrom(options: readonly { id: string; label: string; order: number }[]): OptionRow[] {
  return [...options].sort((a, b) => a.order - b.order).map(({ id, label }) => ({ id, label }));
}

export function addOptionRow(rows: readonly OptionRow[], limits: OptionRowLimits = AUDIENCE_OPTION_LIMITS): OptionRow[] {
  return rows.length >= limits.max ? [...rows] : [...rows, { id: nextOptionId(rows), label: "" }];
}

export function removeOptionRow(rows: readonly OptionRow[], id: string, limits: OptionRowLimits = AUDIENCE_OPTION_LIMITS): OptionRow[] {
  return rows.length <= limits.min ? [...rows] : rows.filter((row) => row.id !== id);
}

/** Moves a row one place up (-1) or down (+1); at the edge nothing changes. */
export function moveOptionRow(rows: readonly OptionRow[], id: string, direction: -1 | 1): OptionRow[] {
  const from = rows.findIndex((row) => row.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= rows.length) return [...rows];
  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function setOptionLabel(rows: readonly OptionRow[], id: string, label: string): OptionRow[] {
  return rows.map((row) => (row.id === id ? { ...row, label } : row));
}

/**
 * Everything that stops a save: fewer than `min` / more than `max` rows,
 * empty rows and duplicates (same text regardless of case, spaces and
 * diacritics — "Električni" = "elektricni").
 */
export function validateOptionRows(rows: readonly OptionRow[], limits: OptionRowLimits = AUDIENCE_OPTION_LIMITS): OptionRowsProblem[] {
  const problems: OptionRowsProblem[] = [];
  if (rows.length < limits.min) problems.push({ kind: "too_few", min: limits.min });
  if (rows.length > limits.max) problems.push({ kind: "too_many", max: limits.max });
  const empty = rows.filter((row) => !row.label.trim()).map((row) => row.id);
  if (empty.length) problems.push({ kind: "empty", rowIds: empty });
  const seen = new Map<string, string[]>();
  for (const row of rows) {
    const key = normalizeSearch(row.label);
    if (key) seen.set(key, [...(seen.get(key) ?? []), row.id]);
  }
  const duplicates = [...seen.values()].filter((ids) => ids.length > 1).flat();
  if (duplicates.length) problems.push({ kind: "duplicate", rowIds: duplicates });
  return problems;
}

/** Ids of the rows to mark as invalid (empty or duplicate). */
export function invalidOptionRowIds(problems: readonly OptionRowsProblem[]): Set<string> {
  return new Set(problems.flatMap((problem) => ("rowIds" in problem ? problem.rowIds : [])));
}

/** The `options` argument of upsertAudienceQuestion / a survey question: trimmed, in row order. */
export function toChoiceOptions(rows: readonly OptionRow[]): { id: string; label: string; order: number }[] {
  return rows.map((row, index) => ({ id: row.id, label: row.label.trim(), order: index + 1 }));
}
