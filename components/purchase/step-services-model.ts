// Pure selection + money model for step 1 of the purchase flow (RFC-002 §2.3,
// TASK-34). NOTHING here is React and NOTHING here computes a price by hand: the
// engine (lib/pricing) is the one source of every dinar, exactly as the shell's
// bottom bar is. The component calls these helpers, reads the fields it needs,
// and never does arithmetic on money — "Nijedan broj se ne računa u komponenti."
//
// Every helper is a pure function of its inputs; the same selection always
// yields the same breakdown, which is what lets the combo-vs-individual price
// equality (step-services-model.test.ts) be an assertion and not a hope.

import {
  DEFAULT_PRICING_CONSTANTS,
  SERVICE_IDS,
  price,
  type BillingPeriod,
  type PriceBreakdown,
  type ServiceId,
} from "@/lib/pricing/engine";
import type { PurchaseSelection, PurchaseServiceSelection } from "@/lib/offer-url";

/** Build the engine input from a whole flow selection and price it. Returns
 *  `null` for an empty cart (the engine refuses a zero-item input by design).
 *  This is the SAME call the shell's split-total bar makes — one breakdown, so
 *  the per-line cart and the bottom bar can never disagree. */
export function priceSelection(selection: PurchaseSelection): PriceBreakdown | null {
  if (selection.services.length === 0) return null;
  return price({
    items: selection.services.map((entry) => ({
      service: entry.service,
      period: entry.period,
    })),
    plan: selection.plan,
    ...(selection.plan === "premium" && selection.planPeriod
      ? { planPeriod: selection.planPeriod }
      : {}),
  });
}

export function isSelected(selection: PurchaseSelection, service: ServiceId): boolean {
  return selection.services.some((entry) => entry.service === service);
}

export function periodOf(
  selection: PurchaseSelection,
  service: ServiceId,
): BillingPeriod | null {
  return selection.services.find((entry) => entry.service === service)?.period ?? null;
}

/** The period shared by every selected service, or `null` when the cart is
 *  empty or mixes periods. Step 1 keeps one global toggle, so in practice the
 *  cart is always uniform here; this is the read the toggle initializes from. */
export function commonPeriod(selection: PurchaseSelection): BillingPeriod | null {
  const first = selection.services[0]?.period ?? null;
  if (first === null) return null;
  return selection.services.every((entry) => entry.period === first) ? first : null;
}

function setServices(
  selection: PurchaseSelection,
  services: PurchaseServiceSelection[],
): PurchaseSelection {
  return { ...selection, services };
}

/** Add a service (or re-set its period if already present). */
export function withService(
  selection: PurchaseSelection,
  service: ServiceId,
  period: BillingPeriod,
): PurchaseSelection {
  const rest = selection.services.filter((entry) => entry.service !== service);
  return setServices(selection, [...rest, { service, period }]);
}

export function withoutService(
  selection: PurchaseSelection,
  service: ServiceId,
): PurchaseSelection {
  return setServices(
    selection,
    selection.services.filter((entry) => entry.service !== service),
  );
}

export function toggleService(
  selection: PurchaseSelection,
  service: ServiceId,
  period: BillingPeriod,
): PurchaseSelection {
  return isSelected(selection, service)
    ? withoutService(selection, service)
    : withService(selection, service, period);
}

/** The top toggle re-periods the WHOLE cart: it changes every price on screen
 *  (RFC-002 §2.3 step 1), so every already-chosen line moves to the new period
 *  too — the cart never silently splits across periods behind the toggle. */
export function withPeriodMode(
  selection: PurchaseSelection,
  period: BillingPeriod,
): PurchaseSelection {
  return setServices(
    selection,
    selection.services.map((entry) => ({ ...entry, period })),
  );
}

/** Add every member of a combo that is not already in the cart, at `period`.
 *  A combo card is only ever a shortcut to its member services — the engine
 *  decomposes the resulting set and awards the package price on its own, so
 *  arriving via the combo and arriving à la carte land on the identical price
 *  (asserted in step-services-model.test.ts). */
export function withPackage(
  selection: PurchaseSelection,
  services: readonly ServiceId[],
  period: BillingPeriod,
): PurchaseSelection {
  let next = selection;
  for (const service of services) {
    if (!isSelected(next, service)) next = withService(next, service, period);
  }
  return next;
}

export function isPackageComplete(
  selection: PurchaseSelection,
  services: readonly ServiceId[],
): boolean {
  return services.every((service) => isSelected(selection, service));
}

/** The undiscounted per-service list price at a period — a constant from the
 *  engine's own table, read (not computed) so a service card can show its "od"
 *  figure without ever hard-coding a number. */
export function serviceListPrice(service: ServiceId, period: BillingPeriod): number {
  return DEFAULT_PRICING_CONSTANTS.service[service][period];
}

/** Price a bare service set (no plan line) — used by a combo card to show its
 *  own effective price and savings straight from the engine. Priced on the free
 *  plan because a combo card is about the services, not the account plan. */
export function priceServices(
  services: readonly ServiceId[],
  period: BillingPeriod,
): PriceBreakdown {
  return price({
    items: services.map((service) => ({ service, period })),
    plan: "basic",
  });
}

/** Axis-A savings (list − charged on the services) for a bare service set,
 *  independent of the plan. Priced through the engine on the free plan because
 *  the plan line never touches service savings; using `basic` sidesteps the
 *  premium `planPeriod` requirement for a pure savings read. */
function servicesSavings(services: readonly PurchaseServiceSelection[]): number {
  if (services.length === 0) return 0;
  return price({
    items: services.map((entry) => ({ service: entry.service, period: entry.period })),
    plan: "basic",
  }).savingsRsd;
}

export interface Nudge {
  service: ServiceId;
  /** How many more dinars the cart would save on Axis A by adding `service`.
   *  Strictly positive — a nudge that saved nothing is not shown. */
  additionalSavingsRsd: number;
}

/** The single most rewarding next service to add: the one whose arrival grows
 *  the cart's Axis-A savings the most (a completed package is the big jump).
 *  Returns `null` when nothing left to add would raise the savings — so the
 *  nudge line is TRUE, computed from the engine, never a fixed string. */
export function bestNudge(
  selection: PurchaseSelection,
  period: BillingPeriod,
  options?: { exclude?: ReadonlySet<ServiceId> },
): Nudge | null {
  const base = servicesSavings(selection.services);
  let best: Nudge | null = null;
  for (const service of SERVICE_IDS) {
    if (isSelected(selection, service)) continue;
    // A nudge must point at something the buyer can actually add now, or the
    // click is a dead end (e.g. Menu is priced but not yet sellable).
    if (options?.exclude?.has(service)) continue;
    const candidate = [...selection.services, { service, period }];
    const additionalSavingsRsd = servicesSavings(candidate) - base;
    if (
      additionalSavingsRsd > 0 &&
      (best === null || additionalSavingsRsd > best.additionalSavingsRsd)
    ) {
      best = { service, additionalSavingsRsd };
    }
  }
  return best;
}
