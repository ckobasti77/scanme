// Menu export — the shared flatten + formatting layer (RFC-003 §2.9, TASK-58).
// Both writers (pdf.ts, xlsx.ts) consume the same `ExportGroup[]` derived here
// from the inline model (lib/menu-blocks.ts), so the PDF and the Excel can
// never disagree about what a menu contains. Pure: no Convex, no React, no
// Node — Uint8Array/TextEncoder only downstream, so the writers run in the
// Convex DEFAULT runtime (no "use node"), in Next, and in the edge vitest env.

import type { MenuGroupShape, MenuModel } from "../menu-blocks";

// THE HARD CEILING (docs/perf/menu-publish-ceiling.md, TASK-60c "remaining
// ceiling"): the public read fans out 2 queries per item and crosses Convex's
// 4096-databaseQueries limit at ~2045 items. An admin import above this is
// REFUSED before any write (convex/menuAdmin.ts importDraft); the export
// asserts the same bound so a writer never builds a file the site cannot even
// render. Owner-side saveDraft/publishDraft are deliberately NOT capped here
// (RFC-003 §2.7 "unlimited"; the proper fix is a batched read — BLOCKED TASK-58).
export const MENU_MAX_ITEMS = 2000;

export type ExportVariant = { label: string; priceRsd: number };

export type ExportRow = {
  groupTitle: string;
  shape: MenuGroupShape;
  daypartKey?: string;
  name: string;
  description?: string;
  productType: string;
  priceRsd?: number;
  variants: ExportVariant[];
  available: boolean;
};

export type ExportGroup = {
  title: string;
  shape: MenuGroupShape;
  daypartKey?: string;
  rows: ExportRow[];
};

export function countItems(model: MenuModel): number {
  let count = 0;
  for (const group of model.groups) count += group.items.length;
  return count;
}

export function assertExportSize(model: MenuModel): void {
  const items = countItems(model);
  if (items > MENU_MAX_ITEMS) {
    throw new Error(
      `menu export: ${items} items exceeds MENU_MAX_ITEMS (${MENU_MAX_ITEMS})`,
    );
  }
}

// Array order is the canonical order (lib/menu-blocks.ts); preserved as-is.
export function flattenMenu(model: MenuModel): ExportGroup[] {
  return model.groups.map((group) => ({
    title: group.base.title,
    shape: group.shape,
    daypartKey: group.base.daypartKey,
    rows: group.items.map((item) => ({
      groupTitle: group.base.title,
      shape: group.shape,
      daypartKey: group.base.daypartKey,
      name: item.name,
      description: item.description,
      productType: item.productType,
      priceRsd: item.priceRsd,
      variants: item.variants.map((variant) => ({
        label: variant.label,
        priceRsd: variant.priceRsd,
      })),
      available: item.available,
    })),
  }));
}

// RSD price text: thousands grouped with a dot, no decimals — a copy of
// components/menu/menu-view.ts `formatRsd` (lib/ must not import components/;
// the test pins the same "1.650" vector so the two cannot drift silently).
export function formatRsd(price: number): string {
  const rounded = Math.round(price);
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rounded < 0 ? `-${grouped}` : grouped;
}

export function priceText(price: number): string {
  return `${formatRsd(price)} RSD`;
}

// The labels a writer needs, passed in by the caller so lib/ stays i18n-free
// (the same seam lib/menu-blocks.ts keeps). Sourced from lib/i18n/sr/menu-admin.
export type ExportLabels = {
  /** PDF subtitle, e.g. "Izvoz nacrta: {date}" already formatted. */
  subtitle: string;
  /** Marker after an unavailable item's name, e.g. "(nema više)". */
  unavailable: string;
  /** Footer template with {page} and {pages}. */
  pageOf: string;
  /** Excel column headers, in column order. */
  columns: {
    group: string;
    shape: string;
    name: string;
    description: string;
    productType: string;
    price: string;
    variants: string;
    available: string;
    daypart: string;
  };
  /** Excel "Dostupno" cell values. */
  yes: string;
  no: string;
  /** Excel sheet name (≤ 31 chars, none of []:*?/\). */
  sheetName: string;
};

// The date parts a writer stamps (Belgrade wall clock, computed by the caller —
// the lib takes parts like dosDateTime does, never reads the clock itself).
export type ExportStamp = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function stampDateText(stamp: ExportStamp): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(stamp.day)}.${two(stamp.month)}.${stamp.year}.`;
}
