import { FAIR_RATING_MAX, FAIR_RATING_MIN, FAIR_RATING_STEP } from "@/lib/fair-contract";

/**
 * Pointer position across the five stars (0–1) → a rating in half steps:
 * the left half of a star is .5, the right half the whole star (prototype
 * stranica-modela-v2). Never below the contract minimum of 1.
 */
export function fairRatingFromPosition(fraction: number): number {
  const position = Math.min(1, Math.max(0, fraction));
  const steps = Math.ceil((position * FAIR_RATING_MAX) / FAIR_RATING_STEP - 1e-9);
  return Math.min(FAIR_RATING_MAX, Math.max(FAIR_RATING_MIN, steps * FAIR_RATING_STEP));
}

/** 4.5 → "4,5" (sr-Latn decimal comma). */
export function fairRatingText(value: number): string {
  return value.toLocaleString("sr-Latn-RS", { maximumFractionDigits: 1 });
}
