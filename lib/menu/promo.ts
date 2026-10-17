// ScanMe Menu V1 (K04) — promotions (master §7.6).
//
// An article has its regular price and an optional promotion: a promo PRICE
// or a discount PERCENT. The client enters one, the other is derived. Only
// the entered value is stored, so a percent promotion follows a later change
// of the regular price, and a price promotion keeps the exact price.
// - Prices are whole dinars; a percent price rounds to the nearest dinar,
//   half up (the Room service rule): 450 − 15 % = 382,5 → 383.
// - Price mode needs the base price and no variants (one promo price for one
//   regular price); percent mode applies to the base price and to every
//   variant price.
// - `active` is the manual switch (Standard). `startsAt` / `endsAt` are the
//   optional schedule (Premium, lib/menu/capabilities.ts scheduledPromos).
//   After `endsAt` the regular price comes back by itself: activity is always
//   computed from the time where the promotion is read, never by a job.
// - Time is an instant (epoch ms); the editor enters Belgrade wall-clock time
//   (promoWindowFromBelgradeLocal), DST included.

import { belgradeLocalToEpoch } from "../belgrade-time";
import { isValidRsd } from "./rsd";

export type MenuPromoMode = "price" | "percent";
export type MenuPromoLabel = "promo" | "recommended";

/** The stored shape (convex/lib/menuDomainValidators.ts menuPromoValidator). */
export type MenuPromo = {
  active: boolean;
  mode: MenuPromoMode;
  priceRsd?: number;
  percent?: number;
  label?: MenuPromoLabel;
  startsAt?: number;
  endsAt?: number;
};

/** The regular prices a promotion applies to. */
export type MenuPromoPriceContext = {
  basePriceRsd: number | null;
  variantsEnabled: boolean;
  variants: readonly { key: string; priceRsd: number | null }[];
};

export const MENU_PROMO_MIN_PERCENT = 1;
export const MENU_PROMO_MAX_PERCENT = 99;

/** Promo price of a percent discount, whole dinars, half up. */
export function promoPriceFromPercent(regularRsd: number, percent: number): number {
  return Math.floor((regularRsd * (100 - percent) + 50) / 100);
}

/**
 * The discount percent a promo price means, whole percent, half up; at least
 * 1 when the promo price is lower at all. null when it is not a discount.
 */
export function percentFromPromoPrice(regularRsd: number, promoRsd: number): number | null {
  if (regularRsd <= 0 || promoRsd >= regularRsd || promoRsd < 0) return null;
  const percent = Math.floor(((regularRsd - promoRsd) * 200 + regularRsd) / (2 * regularRsd));
  return Math.max(MENU_PROMO_MIN_PERCENT, Math.min(percent, 100));
}

export function isPromoScheduled(promo: Pick<MenuPromo, "startsAt" | "endsAt">): boolean {
  return promo.startsAt !== undefined || promo.endsAt !== undefined;
}

function hasVariantPrices(context: MenuPromoPriceContext): boolean {
  return context.variantsEnabled && context.variants.length > 0;
}

/** The regular prices the guest can pick from: variants (falling back to the base price) or the base price. */
export function regularPrices(
  context: MenuPromoPriceContext,
): { key: string | null; regularRsd: number }[] {
  if (hasVariantPrices(context)) {
    return context.variants.flatMap((variant) => {
      const regularRsd = variant.priceRsd ?? context.basePriceRsd;
      return regularRsd === null ? [] : [{ key: variant.key, regularRsd }];
    });
  }
  return context.basePriceRsd === null ? [] : [{ key: null, regularRsd: context.basePriceRsd }];
}

function isInstant(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

/**
 * The stored form of a promotion (only the entered value of its mode), or
 * null when it cannot be a discount for these regular prices (the caller
 * raises ARTICLE_ERROR.promoInvalid). Does NOT check the plan: a scheduled
 * promotion additionally needs Premium (isPromoScheduled).
 */
export function checkPromo(promo: MenuPromo, context: MenuPromoPriceContext): MenuPromo | null {
  if (!isInstant(promo.startsAt) || !isInstant(promo.endsAt)) return null;
  if (
    promo.startsAt !== undefined &&
    promo.endsAt !== undefined &&
    promo.startsAt >= promo.endsAt
  ) {
    return null;
  }
  const window = {
    ...(promo.label !== undefined ? { label: promo.label } : {}),
    ...(promo.startsAt !== undefined ? { startsAt: promo.startsAt } : {}),
    ...(promo.endsAt !== undefined ? { endsAt: promo.endsAt } : {}),
  };

  if (promo.mode === "price") {
    const price = promo.priceRsd;
    if (price === undefined || !isValidRsd(price) || price < 1) return null;
    if (hasVariantPrices(context) || context.basePriceRsd === null) return null;
    if (price >= context.basePriceRsd) return null;
    return { active: promo.active, mode: "price", priceRsd: price, ...window };
  }

  const percent = promo.percent;
  if (
    percent === undefined ||
    !Number.isInteger(percent) ||
    percent < MENU_PROMO_MIN_PERCENT ||
    percent > MENU_PROMO_MAX_PERCENT
  ) {
    return null;
  }
  if (regularPrices(context).length === 0) return null;
  return { active: promo.active, mode: "percent", percent, ...window };
}

export type MenuPromoPrice = { key: string | null; regularRsd: number; promoRsd: number; percent: number };

/**
 * Regular and promo price of every price the guest can pick (the base price,
 * or each variant), whatever the time. null when the promotion is invalid for
 * these prices (the regular price shows).
 */
export function promoPrices(
  promo: MenuPromo,
  context: MenuPromoPriceContext,
): MenuPromoPrice[] | null {
  const valid = checkPromo(promo, context);
  if (!valid) return null;
  if (valid.mode === "price") {
    const regularRsd = context.basePriceRsd as number;
    const promoRsd = valid.priceRsd as number;
    return [
      { key: null, regularRsd, promoRsd, percent: percentFromPromoPrice(regularRsd, promoRsd) ?? 0 },
    ];
  }
  const percent = valid.percent as number;
  return regularPrices(context).map((entry) => ({
    key: entry.key,
    regularRsd: entry.regularRsd,
    promoRsd: promoPriceFromPercent(entry.regularRsd, percent),
    percent,
  }));
}

export type MenuPromoState = "off" | "scheduled" | "active" | "ended";

/** Where the promotion stands at `nowMs`: switched off, not started, running or over. */
export function promoStateAt(
  promo: Pick<MenuPromo, "active" | "startsAt" | "endsAt">,
  nowMs: number,
): MenuPromoState {
  if (!promo.active) return "off";
  if (promo.startsAt !== undefined && nowMs < promo.startsAt) return "scheduled";
  if (promo.endsAt !== undefined && nowMs >= promo.endsAt) return "ended";
  return "active";
}

export function isPromoActiveAt(
  promo: Pick<MenuPromo, "active" | "startsAt" | "endsAt">,
  nowMs: number,
): boolean {
  return promoStateAt(promo, nowMs) === "active";
}

/**
 * The schedule from Belgrade wall-clock input ("YYYY-MM-DDTHH:mm", the value of
 * <input type="datetime-local">); empty = open end. null when a value is not a
 * valid wall-clock time or the start is not before the end.
 */
export function promoWindowFromBelgradeLocal(
  startLocal: string | null | undefined,
  endLocal: string | null | undefined,
): { startsAt?: number; endsAt?: number } | null {
  const startsAt = startLocal ? belgradeLocalToEpoch(startLocal) : undefined;
  const endsAt = endLocal ? belgradeLocalToEpoch(endLocal) : undefined;
  if (startsAt === null || endsAt === null) return null;
  if (startsAt !== undefined && endsAt !== undefined && startsAt >= endsAt) return null;
  return {
    ...(startsAt !== undefined ? { startsAt } : {}),
    ...(endsAt !== undefined ? { endsAt } : {}),
  };
}
