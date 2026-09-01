// Pure model for step 4 of the purchase flow (RFC-002 §2.3 step 4 / §2.5,
// TASK-38). Step 4 REVIEWS the assembled order and, on confirm, shows the
// post-purchase summary. Like every other step model, NOTHING here is React and
// NOTHING computes money by hand: the pricing engine (lib/pricing) is the one
// source of every dinar, exactly as the shell's split-total bar is — so the
// review the buyer confirms and the bar they watched can never disagree.

import type { BillingPeriod, ServiceId } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { recurringByPeriod } from "@/lib/pricing/summary";
import { computeProductsOneTime, getProduct } from "@/lib/scanme-pricing";
import { PURCHASE_SERVICE_ORDER } from "./service-catalog";
import { boundServicesOf, leadsToSplitter } from "./step-products-model";
import { priceSelection } from "./step-services-model";

/** The chosen services in canonical display order (never more than one entry
 *  per service — the selection guarantees uniqueness). */
export function orderedServices(selection: PurchaseSelection): ServiceId[] {
  const owned = new Set(selection.services.map((entry) => entry.service));
  return PURCHASE_SERVICE_ORDER.filter((service) => owned.has(service));
}

export function periodOfService(
  selection: PurchaseSelection,
  service: ServiceId,
): BillingPeriod | null {
  return selection.services.find((entry) => entry.service === service)?.period ?? null;
}

export interface CheckoutTotals {
  /** Recurring money, split by period and NEVER summed with one-time (§2.3). */
  recurring: { monthly: number; annual: number };
  /** One-time physical-product money (lib/scanme-pricing). */
  oneTimeRsd: number;
}

/** Every number the review shows, read from the same engine call the shell's
 *  bottom bar makes. An empty cart yields zeroed recurring money (the engine
 *  refuses a zero-item input, so we short-circuit rather than call it). */
export function checkoutTotals(selection: PurchaseSelection): CheckoutTotals {
  const breakdown = priceSelection(selection);
  return {
    recurring: breakdown ? recurringByPeriod(breakdown) : { monthly: 0, annual: 0 },
    oneTimeRsd: computeProductsOneTime(selection.products),
  };
}

/** True when at least one physical line is bound to 2+ services — those become
 *  razdelnik (splitter) cards at provisioning (§2.4), a fact the review surfaces
 *  so the buyer is not surprised by an extra card. */
export function hasSplitterLine(selection: PurchaseSelection): boolean {
  return selection.products.some((line) => {
    if (!getProduct(line.productId)) return false;
    return leadsToSplitter(boundServicesOf(selection, line.productId));
  });
}

/** The billing period the plan (or, on Basic, the services) renews on. Premium
 *  carries its own planPeriod; on Basic the plan is free, so the first-billing
 *  line speaks about the services' shared period when there is one. */
export function orderPeriod(selection: PurchaseSelection): BillingPeriod | null {
  if (selection.plan === "premium") return selection.planPeriod ?? null;
  const first = selection.services[0]?.period ?? null;
  if (first === null) return null;
  return selection.services.every((entry) => entry.period === first) ? first : null;
}
