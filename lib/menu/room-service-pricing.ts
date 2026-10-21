// ScanMe Menu V1 — room service (RS) pricing (master §5.3, LOCKED). RS is a
// separate Premium channel of a Menu. The price order is always:
//
//   article base price (whole RSD)
//     → percentage RS markup (for all articles or for selected ones)
//     → optional manual RS price per article (overrides the markup, RS only)
//     → ONE fixed delivery fee added once to the whole order
//
// Markup prices are rounded mathematically to a whole dinar (half up, so
// 450 RSD + 15 % = 518 RSD); a manual RS price stays exactly as entered. All
// math is integer (percent as basis points, 10000 = 100 %) so there is no float
// drift. Without a manual price a base change simply re-computes the RS price
// (nothing is stored); with a manual price it leaves that price alone and raises
// a warning (old base, new base, RS price) with two actions: "Zadrži ručnu cenu"
// (keepManual) and "Ponovo izračunaj prema markup-u" (recomputeFromMarkup).
// Add-ons carry no markup (out of scope here).

export type RoomServiceMarkupScope = "all" | "selected";
export type RoomServicePriceOrigin = "inherited" | "computed" | "manual";

/** 300 % in basis points (10000 = 100 %). */
export const ROOM_SERVICE_MAX_MARKUP_BPS = 30_000;

export interface RoomServiceRule {
  /** Markup in basis points, integer 0..ROOM_SERVICE_MAX_MARKUP_BPS; 0 = no markup. */
  markupBps: number;
  markupScope: RoomServiceMarkupScope;
}

export interface RoomServiceItemPriceInput {
  /** The article's shared base price (whole RSD); null when the article has none. */
  basePriceRsd: number | null;
  /** Whether this item is one of the "selected" articles; read only when markupScope === "selected". */
  markupApplies: boolean;
  /** Manual RS price (whole RSD) or null. */
  manualPriceRsd: number | null;
}

export type RoomServiceUnitPrice =
  | { priceRsd: number; origin: RoomServicePriceOrigin }
  | { priceRsd: null; origin: "inherited" };

/** Integer 0..ROOM_SERVICE_MAX_MARKUP_BPS. */
export function isValidMarkupBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= ROOM_SERVICE_MAX_MARKUP_BPS;
}

/**
 * Percent typed by a person (up to two decimals) to basis points: 15 → 1500,
 * 12.5 → 1250, 0.29 → 29. null when not finite, outside 0..300 or finer than
 * 0.01 %. The tolerance absorbs float noise (0.29 * 100 = 28.999999999999996).
 */
export function markupPercentToBps(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > ROOM_SERVICE_MAX_MARKUP_BPS / 100) {
    return null;
  }
  const scaled = percent * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) >= 1e-9) return null;
  return rounded === 0 ? 0 : rounded;
}

/** 1500 → 15, 1250 → 12.5, 725 → 7.25. */
export function markupBpsToPercent(bps: number): number {
  return bps / 100;
}

/** Markup in whole dinars, round half up, integer math only. */
export function markupAmountRsd(baseRsd: number, markupBps: number): number {
  return Math.floor((baseRsd * markupBps + 5000) / 10000);
}

export function markupAppliesTo(rule: RoomServiceRule, markupApplies: boolean): boolean {
  return rule.markupBps > 0 && (rule.markupScope === "all" || markupApplies);
}

/**
 * What the RS rule alone gives (the manual price is ignored): this is what
 * "recomputeFromMarkup" yields. null when the article has no base price.
 */
export function ruleUnitPriceRsd(
  rule: RoomServiceRule,
  basePriceRsd: number | null,
  markupApplies: boolean,
): number | null {
  if (basePriceRsd === null) return null;
  return markupAppliesTo(rule, markupApplies)
    ? basePriceRsd + markupAmountRsd(basePriceRsd, rule.markupBps)
    : basePriceRsd;
}

/** base → markup → manual. A manual price always wins, even without a base price. */
export function roomServiceUnitPrice(
  rule: RoomServiceRule,
  item: RoomServiceItemPriceInput,
): RoomServiceUnitPrice {
  if (item.manualPriceRsd !== null) return { priceRsd: item.manualPriceRsd, origin: "manual" };
  const priceRsd = ruleUnitPriceRsd(rule, item.basePriceRsd, item.markupApplies);
  if (priceRsd === null) return { priceRsd: null, origin: "inherited" };
  return { priceRsd, origin: markupAppliesTo(rule, item.markupApplies) ? "computed" : "inherited" };
}

export interface RoomServiceOrderLine {
  unitPriceRsd: number;
  quantity: number;
}

export interface RoomServiceOrderTotal {
  itemsRsd: number;
  deliveryFeeRsd: number;
  totalRsd: number;
}

/**
 * Sum of unit price × quantity plus the delivery fee ONCE per order (never per
 * line). A null fee is 0; an empty order has no fee at all. Throws RangeError
 * on a non-integer or < 1 quantity, or a non-integer or negative price / fee.
 */
export function roomServiceOrderTotal(
  lines: readonly RoomServiceOrderLine[],
  deliveryFeeRsd: number | null,
): RoomServiceOrderTotal {
  const fee = deliveryFeeRsd ?? 0;
  if (!Number.isInteger(fee) || fee < 0) {
    throw new RangeError(`Delivery fee must be an integer >= 0, got ${fee}`);
  }
  let itemsRsd = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError(`Quantity must be an integer >= 1, got ${line.quantity}`);
    }
    if (!Number.isInteger(line.unitPriceRsd) || line.unitPriceRsd < 0) {
      throw new RangeError(`Unit price must be an integer >= 0, got ${line.unitPriceRsd}`);
    }
    itemsRsd += line.unitPriceRsd * line.quantity;
  }
  const appliedFee = lines.length === 0 ? 0 : fee;
  return { itemsRsd, deliveryFeeRsd: appliedFee, totalRsd: itemsRsd + appliedFee };
}

export interface RoomServicePriceWarning {
  oldBaseRsd: number | null;
  newBaseRsd: number | null;
  at: number;
}

/**
 * The warning to store after the article's base price changes from
 * previousBaseRsd to nextBaseRsd. Only a manual price warns (a computed price
 * just follows). The warning keeps the base the manual price was confirmed
 * against, so a second change updates the new base and a return to that base
 * clears the warning.
 */
export function nextPriceWarning(input: {
  existing: RoomServicePriceWarning | null;
  manualPriceRsd: number | null;
  previousBaseRsd: number | null;
  nextBaseRsd: number | null;
  at: number;
}): RoomServicePriceWarning | null {
  const { existing, manualPriceRsd, previousBaseRsd, nextBaseRsd, at } = input;
  if (manualPriceRsd === null) return null;
  if (previousBaseRsd === nextBaseRsd) return existing;
  if (existing !== null) {
    if (nextBaseRsd === existing.oldBaseRsd) return null;
    return { oldBaseRsd: existing.oldBaseRsd, newBaseRsd: nextBaseRsd, at };
  }
  return { oldBaseRsd: previousBaseRsd, newBaseRsd: nextBaseRsd, at };
}

export type RoomServiceWarningAction = "keepManual" | "recomputeFromMarkup";

/**
 * Fields to write for the action. Both clear the warning; keepManual keeps the
 * manual price, recomputeFromMarkup clears it (the item falls back to the rule).
 */
export function resolvePriceWarning(
  action: RoomServiceWarningAction,
  manualPriceRsd: number | null,
): { manualPriceRsd: number | null; priceWarning: null } {
  return {
    manualPriceRsd: action === "keepManual" ? manualPriceRsd : null,
    priceWarning: null,
  };
}

/**
 * What the warning panel shows: old base, new base, the current RS price and
 * the price "recomputeFromMarkup" would give with the CURRENT base.
 */
export function priceWarningView(
  rule: RoomServiceRule,
  item: RoomServiceItemPriceInput,
  warning: RoomServicePriceWarning,
): {
  oldBaseRsd: number | null;
  newBaseRsd: number | null;
  roomServicePriceRsd: number | null;
  recomputedPriceRsd: number | null;
} {
  return {
    oldBaseRsd: warning.oldBaseRsd,
    newBaseRsd: warning.newBaseRsd,
    roomServicePriceRsd: roomServiceUnitPrice(rule, item).priceRsd,
    recomputedPriceRsd: ruleUnitPriceRsd(rule, item.basePriceRsd, item.markupApplies),
  };
}
