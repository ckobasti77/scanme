// Structural catalog for step 1 (RFC-002 §2.3, TASK-34). Copy lives in the
// typed dictionary (lib/i18n/sr/purchase.ts); THIS file carries only structure —
// the display order of the five services, which preview each one shows, and the
// combo cards' membership. Membership is taken from the engine's own package
// table so the cards and the price can never name different service sets.

import {
  DEFAULT_PRICING_CONSTANTS,
  type PackageId,
  type ServiceId,
} from "@/lib/pricing/engine";

/** Left-list order of the five service cards (matches the engine's canonical
 *  service order so the cart and the list read in the same sequence). */
export const PURCHASE_SERVICE_ORDER: readonly ServiceId[] = [
  "links",
  "venue",
  "memories",
  "menu",
  "review",
];

/** Menu is priced but has no product yet (RFC-002 §2.0 constraint 7): its card
 *  and preview degrade to "uskoro" and it cannot be added to the cart. The
 *  sell-timing decision (hidden vs. pre-order) is the owner's — see BLOCKED.md.
 *  A combo that contains Menu is shown but not addable until Menu ships. */
export const UNAVAILABLE_SERVICES: ReadonlySet<ServiceId> = new Set<ServiceId>(["menu"]);

export function isServiceAvailable(service: ServiceId): boolean {
  return !UNAVAILABLE_SERVICES.has(service);
}

export interface ComboCard {
  id: PackageId;
  services: readonly ServiceId[];
  /** A combo is addable only when every member is itself available. */
  available: boolean;
}

/** The three combo cards, drawn from the engine's package definitions so the
 *  membership is single-sourced (RFC-002 §2.1: packages are decompositions). */
export const PURCHASE_COMBOS: readonly ComboCard[] = DEFAULT_PRICING_CONSTANTS.packages.map(
  (pkg) => ({
    id: pkg.id,
    services: [...pkg.services],
    available: pkg.services.every(isServiceAvailable),
  }),
);
