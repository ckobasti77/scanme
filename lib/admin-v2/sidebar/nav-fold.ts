// ADMIN v2 X6 — two small rules of the sidebar (pure; the view renders what they return).
//
// 1. The folded navigation of an area („Sekcija · Modeli“): on a page with a
//    search or filters the sub-pages are one accordion group, so the search and
//    the first filter group stay above the fold. Its header names the open
//    sub-page and carries what waits in the others (the most urgent tone).
// 2. The text of the page search after the URL changed: the URL holds the
//    trimmed text, so a trailing space the user just typed is kept.

import type { AdminSubnavGroup, AdminSubnavItem, AdminUrgencyTone } from "@/lib/admin-v1/subnav";

const TONE_ORDER: readonly AdminUrgencyTone[] = ["hitno", "uskoro", "info"];

export type FoldedNavSummary = {
  /** The open sub-page; null when none of them is open. */
  label: string | null;
  /** The most urgent tone among the sub-pages and how many items wait in it. */
  urgency: { tone: AdminUrgencyTone; count: number } | null;
};

export function foldedNavSummary(nav: readonly AdminSubnavGroup[]): FoldedNavSummary {
  const items: AdminSubnavItem[] = nav.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]));
  const active = items.find((item) => item.active);
  const waiting = items.filter((item) => item.urgency && item.urgency.count > 0).map((item) => item.urgency!);
  const tone = TONE_ORDER.find((candidate) => waiting.some((row) => row.tone === candidate));
  return {
    label: active?.label ?? null,
    urgency: tone ? { tone, count: waiting.filter((row) => row.tone === tone).reduce((sum, row) => sum + row.count, 0) } : null,
  };
}

/**
 * The text of the search field when the value in the URL changed. While the
 * user types nothing is replaced. The URL value is the typed text without the
 * spaces at its ends: when the words are the same the typed text stays (the
 * space after a word is the start of the next one). Anything else came from
 * outside (a chip, „Očisti sve“, Back) and replaces the text.
 */
export function searchFieldText(text: string, urlValue: string, typing: boolean): string {
  if (typing || urlValue === text.trim()) return text;
  return urlValue;
}
