// Pure selection + money model for step 2 of the purchase flow (RFC-002 §2.3,
// TASK-35). Like step-services-model.ts, NOTHING here is React and NOTHING
// here invents a price: every dinar comes from the engine (lib/pricing).
//
// The one number this step shows — what Premium ADDS — is computed as a
// DELTA against the buyer's current total, never as Premium's raw price shown
// alone. Services are priced identically under Basic and Premium (Axis A and
// Axis B are independent, lib/pricing/engine.ts), so the delta is provably
// just the plan line — but it is computed THROUGH the engine, not assumed, so
// a future engine change cannot silently break that claim without a test
// noticing (RFC-002 §2.3: "Cena Premium-a se prikazuje kao razlika u odnosu
// na trenutni zbir, ne kao apstraktan broj").

import {
  DEFAULT_PRICING_CONSTANTS,
  price,
  type BillingPeriod,
} from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { commonPeriod } from "./step-services-model";

/** The period Premium bills at: the cart's own period when uniform, else the
 *  same "monthly" default step 1's toggle starts from. */
export function planPeriodFor(selection: PurchaseSelection): BillingPeriod {
  return commonPeriod(selection) ?? "monthly";
}

/** What Premium adds on top of the buyer's current total at `period` — never
 *  Premium's raw price alone. Both totals come from the SAME engine call
 *  shape, only `plan` differs, so the delta is exactly the plan line and
 *  nothing else moved. */
export function premiumDeltaRsd(selection: PurchaseSelection, period: BillingPeriod): number {
  if (selection.services.length === 0) {
    return DEFAULT_PRICING_CONSTANTS.plan.premium[period];
  }
  const items = selection.services.map((entry) => ({
    service: entry.service,
    period: entry.period,
  }));
  const basicTotal = price({ items, plan: "basic" }).totalRsd;
  const premiumTotal = price({ items, plan: "premium", planPeriod: period }).totalRsd;
  return premiumTotal - basicTotal;
}

/** The buyer's current total (services only — Basic itself is free), read the
 *  same way the delta is: through the engine, not assumed. `null` for an
 *  empty cart, matching `priceSelection`'s own convention. */
export function currentTotalRsd(selection: PurchaseSelection): number | null {
  if (selection.services.length === 0) return null;
  const items = selection.services.map((entry) => ({
    service: entry.service,
    period: entry.period,
  }));
  return price({ items, plan: "basic" }).totalRsd;
}

/** Move the flow's plan choice. Premium always carries its billing period
 *  (the engine requires it); Basic and Enterprise never do — the same
 *  constraint `lib/pricing/engine.ts` validates on every call. */
export function withPlan(
  selection: PurchaseSelection,
  plan: "basic" | "premium",
): PurchaseSelection {
  if (plan === "premium") {
    return { ...selection, plan: "premium", planPeriod: planPeriodFor(selection) };
  }
  return { ...selection, plan: "basic", planPeriod: undefined };
}
