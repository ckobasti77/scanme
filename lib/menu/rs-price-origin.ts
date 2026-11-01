// ScanMe Menu V1 (K16) — where a Room service price comes from (master §5.3).
//
// PURE. Every Room service row in the editor says where its price comes from,
// so the owner never wonders why a guest in a room pays a different price:
//   inherited  "Preuzeta"   — the article's base price, unchanged;
//   computed   "Izračunata" — the base price plus the Room service markup;
//   manual     "Ručna"      — a price typed for Room service only.
// The numbers come from lib/menu/room-service-pricing.ts (the one price rule);
// this module only turns them into what one row and the warning dialog show.

import {
  markupAppliesTo,
  markupPercentToBps,
  roomServiceUnitPrice,
  ruleUnitPriceRsd,
  type RoomServicePriceOrigin,
  type RoomServiceRule,
} from "./room-service-pricing";

export type RsRowPriceInput = {
  basePriceRsd: number | null;
  /** The row is one of the "selected" articles (read only when the scope is "selected"). */
  markupApplies: boolean;
  manualPriceRsd: number | null;
};

export type RsRowPriceView = {
  /** The Room service price a guest pays (null: the article has no price at all). */
  priceRsd: number | null;
  origin: RoomServicePriceOrigin;
  /** The base price of the article (shared by every standard page). */
  basePriceRsd: number | null;
  /** The markup in percent when it raised THIS price (origin "computed"), else null. */
  markupPercent: number | null;
  /** What the markup rule alone would give (what "Ponovo izračunaj" yields); null without a base price. */
  rulePriceRsd: number | null;
  /** The markup reaches this row (scope "all", or "selected" and this row is selected). */
  markupReaches: boolean;
};

export function rsRowPrice(rule: RoomServiceRule, row: RsRowPriceInput): RsRowPriceView {
  const price = roomServiceUnitPrice(rule, row);
  const markupReaches = markupAppliesTo(rule, row.markupApplies);
  return {
    priceRsd: price.priceRsd,
    origin: price.origin,
    basePriceRsd: row.basePriceRsd,
    markupPercent: price.origin === "computed" ? rule.markupBps / 100 : null,
    rulePriceRsd: ruleUnitPriceRsd(rule, row.basePriceRsd, row.markupApplies),
    markupReaches,
  };
}

export type RsOriginCounts = Record<RoomServicePriceOrigin, number>;

/** How many rows have each origin (the summary line above the list). */
export function countOrigins(rows: readonly { origin: RoomServicePriceOrigin }[]): RsOriginCounts {
  const counts: RsOriginCounts = { inherited: 0, computed: 0, manual: 0 };
  for (const row of rows) counts[row.origin] += 1;
  return counts;
}

export type RsWarningView = {
  oldBaseRsd: number | null;
  newBaseRsd: number | null;
  /** The manual Room service price that stays unless the owner recomputes. */
  roomServicePriceRsd: number | null;
  /** What "Ponovo izračunaj prema markup-u" would set (null: the article lost its price). */
  recomputedPriceRsd: number | null;
};

/**
 * The dialog after the base price of an article with a manual Room service
 * price changed: old base, new base, the Room service price (unchanged) and
 * the price recomputing would give with the NEW base.
 */
export function rsWarningView(
  rule: RoomServiceRule,
  row: RsRowPriceInput,
  warning: { oldBaseRsd: number | null; newBaseRsd: number | null },
): RsWarningView {
  return {
    oldBaseRsd: warning.oldBaseRsd,
    newBaseRsd: warning.newBaseRsd,
    roomServicePriceRsd: row.manualPriceRsd,
    recomputedPriceRsd: ruleUnitPriceRsd(rule, row.basePriceRsd, row.markupApplies),
  };
}

/**
 * The markup as an owner types it: "15", "12,5", "12.5 %"; empty = no markup
 * (null). 0–300 with at most two decimals (markupPercentToBps), else not ok.
 */
export function parseMarkupInput(text: string): { ok: true; percent: number | null } | { ok: false } {
  const cleaned = text.trim().replace(/\s*%$/, "").replace(",", ".").trim();
  if (cleaned === "") return { ok: true, percent: null };
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { ok: false };
  const percent = Number(cleaned);
  const bps = markupPercentToBps(percent);
  if (bps === null) return { ok: false };
  return { ok: true, percent: bps === 0 ? null : bps / 100 };
}
