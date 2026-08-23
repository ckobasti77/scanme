/**
 * Serijalizacija/deserializacija `OrderSelection` u `URLSearchParams`.
 *
 * Odvojeno od pricing matematike (`lib/scanme-pricing.ts`), ali nad istim tipovima.
 * Cilj: konfigurator i završni pregled mogu da nose ceo izbor kroz URL (deep-link).
 *
 * Oblik:
 * ?service=review&tier=premium&period=annual
 *   &items=nalepnica:pvc:3,stalak:metal:1&design=custom&logo=1
 * (design=template:<templateId> za template dizajn)
 */

import {
  getMaterial,
  getProduct,
  type BillingPeriod,
  type DesignChoice,
  type OrderSelection,
  type ProductSelection,
  type PublicTierId,
  type ServiceId,
} from "./scanme-pricing";

const SERVICES: readonly ServiceId[] = ["review", "links"];
const TIERS: readonly PublicTierId[] = ["starter", "premium"];
const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];

export function encodeSelection(selection: OrderSelection): URLSearchParams {
  const params = new URLSearchParams();
  params.set("service", selection.service);
  params.set("tier", selection.tier);
  params.set("period", selection.period);

  if (selection.products.length > 0) {
    params.set(
      "items",
      selection.products
        .map((item) => `${item.productId}:${item.materialId}:${item.quantity}`)
        .join(","),
    );
  }

  if (selection.design.kind === "template") {
    params.set("design", `template:${selection.design.templateId}`);
  } else {
    params.set("design", "custom");
  }
  params.set("logo", selection.design.addOwnLogo ? "1" : "0");

  return params;
}

function parseItems(raw: string): ProductSelection[] | null {
  const items: ProductSelection[] = [];
  for (const chunk of raw.split(",")) {
    const [productId, materialId, quantityRaw, ...rest] = chunk.split(":");
    if (rest.length > 0 || !productId || !materialId || !quantityRaw) return null;

    const product = getProduct(productId);
    if (!product) return null;
    if (!getMaterial(product, materialId)) return null;

    const quantity = Number(quantityRaw);
    if (!Number.isInteger(quantity) || quantity < 1) return null;

    items.push({ productId, materialId, quantity });
  }
  return items;
}

function parseDesign(designRaw: string, logoRaw: string): DesignChoice | null {
  if (logoRaw !== "0" && logoRaw !== "1") return null;
  const addOwnLogo = logoRaw === "1";

  if (designRaw === "custom") {
    return { kind: "custom", addOwnLogo };
  }
  if (designRaw.startsWith("template:")) {
    const templateId = designRaw.slice("template:".length);
    if (!templateId) return null;
    return { kind: "template", templateId, addOwnLogo };
  }
  return null;
}

export function parseSelection(params: URLSearchParams): OrderSelection | null {
  const service = params.get("service");
  const tier = params.get("tier");
  const period = params.get("period");
  const design = params.get("design");
  const logo = params.get("logo");

  if (!service || !SERVICES.includes(service as ServiceId)) return null;
  if (!tier || !TIERS.includes(tier as PublicTierId)) return null;
  if (!period || !PERIODS.includes(period as BillingPeriod)) return null;
  if (!design || logo === null) return null;

  const itemsRaw = params.get("items");
  const products = itemsRaw ? parseItems(itemsRaw) : [];
  if (products === null) return null;

  const designChoice = parseDesign(design, logo);
  if (designChoice === null) return null;

  return {
    service: service as ServiceId,
    tier: tier as PublicTierId,
    period: period as BillingPeriod,
    products,
    design: designChoice,
  };
}
