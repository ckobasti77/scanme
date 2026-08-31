// Pure model for step 3 of the purchase flow (RFC-002 §2.3, TASK-36).
//
// Step 3 configures the PHYSICAL products, and its one new idea over the shipped
// configurator (components/offer-configurator.tsx) is that binding a card to a
// SERVICE is a property of the cart LINE. The service comes first because it
// decides which card designs are even available — so this module owns:
//
//   • which physical-card templates each service offers (SERVICE_CARD_TEMPLATES),
//   • the reconciled read of a line's bound service(s) against what was bought,
//   • the rebind that, when the chosen design does not exist for the new
//     service, resets to that service's default template AND REPORTS it — never
//     a silent move (the buyer must know their design shifted).
//
// NOTHING here is React and NOTHING computes a price; the physical-price matrices
// (lib/scanme-pricing.ts) are untouched and imported as-is.

import {
  createDefaultProductSelection,
  getProduct,
  type ProductDesignChoice,
  type ProductId,
  type ProductSelection,
  type TemplateId,
} from "@/lib/scanme-pricing";
import type { ServiceId as PurchaseServiceId } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { PURCHASE_SERVICE_ORDER } from "./service-catalog";

// --- Which card templates a service offers ----------------------------------
//
// PROVISIONAL, owner-tunable curation (docs/tasks/BLOCKED.md): RFC-002 fixes the
// RULE ("the service decides which templates are available") but not the exact
// per-service template sets — those are a product decision. This seed keeps the
// one fact the shipped code already encodes — the plain "basic" card belongs to
// Review only (components/offer-configurator.tsx line ~1092) — and gives every
// other service a distinct, overlapping subset so a rebind can both preserve a
// compatible design and reset an incompatible one. Every product currently
// allows all templates, so the single-service availability is exactly this set.
export const SERVICE_CARD_TEMPLATES: Record<PurchaseServiceId, readonly TemplateId[]> = {
  links: ["template-1", "template-2", "template-3", "template-4", "template-5"],
  venue: ["template-2", "template-3", "template-4"],
  memories: ["template-3", "template-4", "template-5"],
  menu: ["template-1", "template-2"],
  review: ["basic", "template-1", "template-5"],
};

/** The five services in the flow's canonical display order (service-catalog). */
export function purchasedServiceOrder(selection: PurchaseSelection): PurchaseServiceId[] {
  const owned = new Set(selection.services.map((entry) => entry.service));
  return PURCHASE_SERVICE_ORDER.filter((service) => owned.has(service));
}

/** True when exactly one service was bought — then the binding control is not
 *  shown at all and every line is bound to that service silently (RFC-002 §2.3). */
export function isSingleService(selection: PurchaseSelection): boolean {
  return purchasedServiceOrder(selection).length === 1;
}

function inCanonicalOrder(services: readonly PurchaseServiceId[]): PurchaseServiceId[] {
  const set = new Set(services);
  return PURCHASE_SERVICE_ORDER.filter((service) => set.has(service));
}

/**
 * The reconciled bound services for one line: the stored binding narrowed to
 * services the buyer actually owns, in canonical order. Falls back to the first
 * purchased service when nothing valid is stored — so a line is never bound to
 * nothing, and a binding to a service dropped back in step 1 never survives.
 */
export function boundServicesOf(
  selection: PurchaseSelection,
  productId: ProductId,
): PurchaseServiceId[] {
  const purchased = purchasedServiceOrder(selection);
  if (purchased.length === 0) return [];
  if (purchased.length === 1) return [purchased[0]];
  const stored = selection.bindings?.[productId] ?? [];
  const valid = inCanonicalOrder(stored.filter((service) => purchased.includes(service)));
  return valid.length > 0 ? valid : [purchased[0]];
}

/** A card bound to two or more services leads to a splitter (razdelnik, §2.4);
 *  step 3 only says so in one line — it does not build the splitter (TASK-37). */
export function leadsToSplitter(boundServices: readonly PurchaseServiceId[]): boolean {
  return boundServices.length > 1;
}

/**
 * The templates available for a line, given its bound service(s). One service:
 * that service's set, intersected with what the product allows. Two or more (a
 * splitter card) or none: the product's full set — a splitter's printed card is
 * not tied to a single service's look, which also avoids an empty intersection.
 */
export function availableTemplates(
  productId: ProductId,
  boundServices: readonly PurchaseServiceId[],
): TemplateId[] {
  const product = getProduct(productId);
  if (!product) return [];
  const allowed = product.allowedTemplateIds;
  if (boundServices.length !== 1) return [...allowed];
  const forService = SERVICE_CARD_TEMPLATES[boundServices[0]];
  return allowed.filter((templateId) => forService.includes(templateId));
}

/** The default template a line falls back to for its binding: the first
 *  available one in the product's own template order. */
export function defaultTemplate(
  productId: ProductId,
  boundServices: readonly PurchaseServiceId[],
): TemplateId {
  const available = availableTemplates(productId, boundServices);
  return available[0] ?? "template-1";
}

/** Whether a design is valid for a binding. A custom brief fits any service, so
 *  it is always allowed; a template must be in the available set. */
export function designAllowed(
  design: ProductDesignChoice,
  productId: ProductId,
  boundServices: readonly PurchaseServiceId[],
): boolean {
  if (design.kind === "custom") return true;
  return availableTemplates(productId, boundServices).includes(design.templateId);
}

/** A fresh line for `productId`, its design already set to the default template
 *  of its (silent, single-service) binding — so an added line is never born
 *  with a design its own service does not offer. */
export function newProductLine(
  selection: PurchaseSelection,
  productId: ProductId,
): ProductSelection {
  const base = createDefaultProductSelection(productId);
  const bound = boundServicesOf(selection, productId);
  const templateId = defaultTemplate(productId, bound);
  return { ...base, quantity: 1, design: { kind: "template", templateId } };
}

export interface RebindResult {
  selection: PurchaseSelection;
  /** Set only when the line's chosen design did not exist for the new service
   *  and was reset — the buyer is told, never moved silently (RFC-002 §2.3). */
  reset: { from: TemplateId; to: TemplateId } | null;
}

/**
 * Bind a line to `nextServices` (narrowed to owned services, never empty). If
 * the line's current template design is not available for the new binding, its
 * design is reset to that binding's default template and the change is reported
 * so the UI can show the one-line reason. Custom designs are never reset.
 */
export function rebindProduct(
  selection: PurchaseSelection,
  productId: ProductId,
  nextServices: readonly PurchaseServiceId[],
): RebindResult {
  const purchased = purchasedServiceOrder(selection);
  let next = inCanonicalOrder(nextServices.filter((service) => purchased.includes(service)));
  if (next.length === 0 && purchased.length > 0) next = [purchased[0]];

  const bindings = { ...(selection.bindings ?? {}), [productId]: next };

  let reset: RebindResult["reset"] = null;
  const products = selection.products.map((line) => {
    if (line.productId !== productId) return line;
    if (line.design.kind === "template" && !designAllowed(line.design, productId, next)) {
      const to = defaultTemplate(productId, next);
      reset = { from: line.design.templateId, to };
      return { ...line, design: { kind: "template" as const, templateId: to } };
    }
    return line;
  });

  return { selection: { ...selection, bindings, products }, reset };
}

/** Toggle one service on a line's binding, then rebind. Removing the last
 *  service is a no-op path — `rebindProduct` refuses an empty binding — so the
 *  control can never leave a card pointing at nothing. */
export function toggleBoundService(
  selection: PurchaseSelection,
  productId: ProductId,
  service: PurchaseServiceId,
): RebindResult {
  const current = boundServicesOf(selection, productId);
  const next = current.includes(service)
    ? current.filter((entry) => entry !== service)
    : [...current, service];
  return rebindProduct(selection, productId, next);
}
