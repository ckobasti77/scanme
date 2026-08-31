// Presentation helper for the purchase flow's split-total bar (RFC-002 §2.3).
//
// The bar shows RECURRING money (services + plan) split by its period, and it
// NEVER sums monthly and annual into one figure. This helper lives beside the
// engine — not in the component — because the RFC is explicit: "Nijedan broj se
// ne računa u komponenti" (no number is computed in the component). The engine
// produces the prices; this only re-groups the amounts it already produced by
// period label, so a `monthly` and an `annual` basket stay two figures.

import type { BillingPeriod, PriceBreakdown, Rsd } from "./types";

export interface RecurringByPeriod {
  /** Monthly recurring money (0 when the cart has no monthly basket). */
  monthly: Rsd;
  /** Annual recurring money (0 when the cart has no annual basket). */
  annual: Rsd;
}

/**
 * Recurring money grouped by period: each period's charged services plus the
 * plan line when the plan bills in that period. Enterprise (`onRequest`, amount
 * 0) and Basic (free) contribute nothing — only the services show for them.
 */
export function recurringByPeriod(breakdown: PriceBreakdown): RecurringByPeriod {
  const totals: RecurringByPeriod = { monthly: 0, annual: 0 };
  for (const group of breakdown.groups) {
    totals[group.period] += group.chargedRsd;
  }
  const { planLine } = breakdown;
  if (planLine.period && planLine.amountRsd > 0) {
    totals[planLine.period as BillingPeriod] += planLine.amountRsd;
  }
  return totals;
}
