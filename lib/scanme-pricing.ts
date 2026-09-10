/**
 * Centralizovan domenski model ScanMe ponude.
 *
 * Sve monetarne vrednosti su celi RSD dinari i javne cene fizičkih proizvoda
 * uključuju PDV.
 *
 * Cena pretplate (recurring) dolazi ISKLJUČIVO iz motora u `lib/pricing`
 * (RFC-002 §2.1) — jedan izvor cene za marketing stranicu, konfigurator i
 * budući checkout. Ovaj fajl zadržava katalog fizičkih proizvoda i njihove
 * matrice; stari `SAAS_PRICING` tier model je ugašen (TASK-28).
 */

import { price as enginePrice } from "./pricing/engine";
import type { PlanId } from "./pricing/types";

export type Rsd = number;

export type ServiceId = "review" | "links";
export type PublicTierId = "starter" | "premium";
export type BillingPeriod = "monthly" | "annual";
export type ProductId =
  | "stickers"
  | "window-film"
  | "two-piece-stand"
  | "compact-stand"
  | "premium-engraved-stand";
export type Orientation = "portrait" | "landscape";
export type ProductShape = "square" | "rectangle" | "circle";
export type ProductBackground = "white" | "black" | "transparent";
export type ProductFinish = "matte" | "gloss";
export type ProductMaterial = "plastic" | "acrylic" | "metal";
export type WoodType = "oak" | "walnut" | "beech";
export type ProductDimension = "a4" | "a5" | "a6" | "small" | "medium" | "large";
export type ProductControlId =
  | "orientation"
  | "shape"
  | "background"
  | "finish"
  | "material"
  | "woodType"
  | "dimension";
export type TemplateId =
  | "basic"
  | "template-1"
  | "template-2"
  | "template-3"
  | "template-4"
  | "template-5";

export const ORIENTATIONS: readonly Orientation[] = ["portrait", "landscape"];
export const PRODUCT_SHAPES: readonly ProductShape[] = ["square", "rectangle", "circle"];
export const PRODUCT_BACKGROUNDS: readonly ProductBackground[] = [
  "white",
  "black",
  "transparent",
];
export const PRODUCT_FINISHES: readonly ProductFinish[] = ["matte", "gloss"];
export const PRODUCT_MATERIALS: readonly ProductMaterial[] = ["plastic", "acrylic", "metal"];
export const WOOD_TYPES: readonly WoodType[] = ["oak", "walnut", "beech"];
export const PAPER_DIMENSIONS: readonly ProductDimension[] = ["a4", "a5", "a6"];
export const SIZE_DIMENSIONS: readonly ProductDimension[] = ["small", "medium", "large"];
export const TEMPLATE_IDS: readonly TemplateId[] = [
  "basic",
  "template-1",
  "template-2",
  "template-3",
  "template-4",
  "template-5",
];

export function roundRsd(value: number): Rsd {
  return Math.round(value);
}

export function formatRsd(value: Rsd): string {
  const rounded = roundRsd(value);
  const negative = rounded < 0;
  const digits = Math.abs(rounded).toString();
  let out = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ".";
    out += digits[index];
  }
  return negative ? `-${out}` : out;
}

/**
 * The offer surface's two paid tiers map onto the account-plan axis (RFC-002
 * §2.0/§2.2): the retired per-service SaaS tier model is gone, and
 * "starter"/"premium" now select the free Basic plan vs. the paid Premium plan.
 * The plan is orthogonal to the service — Axis B, not a per-service price.
 */
const TIER_PLAN: Record<PublicTierId, Exclude<PlanId, "enterprise">> = {
  starter: "basic",
  premium: "premium",
};

/**
 * Recurring first-term price (RSD) of ONE service under one tier and period,
 * sourced entirely from the pricing engine (`lib/pricing`) — the single source
 * of price (RFC-002 §2.1). The offer surface prices one service at a time, so
 * the engine applies neither a package nor the position ladder here: the result
 * is the service's Axis-A list price plus (for Premium) the Axis-B plan line.
 * The renewal term equals the first term.
 */
export function saasFirstTermPrice(
  service: ServiceId,
  tier: PublicTierId,
  period: BillingPeriod,
): Rsd {
  const plan = TIER_PLAN[tier];
  const breakdown = enginePrice({
    items: [{ service, period }],
    plan,
    ...(plan === "premium" ? { planPeriod: period } : {}),
  });
  return breakdown.totalRsd;
}

export interface PreviewPlane {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PhysicalProduct {
  id: ProductId;
  baseUnitPrice: Rsd;
  previewAsset: string;
  previewPlane: PreviewPlane;
  controlIds: readonly ProductControlId[];
  allowedOrientations?: readonly Orientation[];
  allowedShapes?: readonly ProductShape[];
  allowedBackgrounds?: readonly ProductBackground[];
  allowedFinishes?: readonly ProductFinish[];
  allowedMaterials?: readonly ProductMaterial[];
  allowedWoodTypes?: readonly WoodType[];
  allowedDimensions: readonly ProductDimension[];
  allowedTemplateIds: readonly TemplateId[];
}

const SHARED_DESIGN_OPTIONS = {
  allowedTemplateIds: TEMPLATE_IDS,
} as const;

export const PHYSICAL_PRODUCTS: readonly PhysicalProduct[] = [
  {
    id: "stickers",
    baseUnitPrice: 300,
    previewAsset: "/offer/products/stickers.png",
    previewPlane: { left: 18, top: 18, width: 46, height: 66 },
    controlIds: ["shape", "dimension"],
    allowedShapes: PRODUCT_SHAPES,
    allowedDimensions: SIZE_DIMENSIONS,
    ...SHARED_DESIGN_OPTIONS,
  },
  {
    id: "window-film",
    baseUnitPrice: 348,
    previewAsset: "/offer/products/window-film.png",
    previewPlane: { left: 27, top: 17, width: 47, height: 66 },
    controlIds: ["background", "finish", "dimension"],
    allowedBackgrounds: ["white", "transparent"],
    allowedFinishes: PRODUCT_FINISHES,
    allowedDimensions: SIZE_DIMENSIONS,
    ...SHARED_DESIGN_OPTIONS,
  },
  {
    id: "two-piece-stand",
    baseUnitPrice: 1200,
    previewAsset: "/offer/products/two-piece-stand.png",
    previewPlane: { left: 27, top: 16, width: 46, height: 62 },
    controlIds: ["orientation", "dimension"],
    allowedOrientations: ORIENTATIONS,
    allowedDimensions: PAPER_DIMENSIONS,
    ...SHARED_DESIGN_OPTIONS,
  },
  {
    id: "compact-stand",
    baseUnitPrice: 660,
    previewAsset: "/offer/products/compact-stand.png",
    previewPlane: { left: 29, top: 18, width: 43, height: 61 },
    controlIds: ["material", "background", "dimension"],
    allowedBackgrounds: PRODUCT_BACKGROUNDS,
    allowedMaterials: PRODUCT_MATERIALS,
    allowedDimensions: PAPER_DIMENSIONS,
    ...SHARED_DESIGN_OPTIONS,
  },
  {
    id: "premium-engraved-stand",
    baseUnitPrice: 1500,
    previewAsset: "/offer/products/premium-engraved-stand.png",
    previewPlane: { left: 29, top: 19, width: 43, height: 59 },
    controlIds: ["shape", "woodType", "dimension"],
    allowedShapes: PRODUCT_SHAPES,
    allowedWoodTypes: WOOD_TYPES,
    allowedDimensions: SIZE_DIMENSIONS,
    ...SHARED_DESIGN_OPTIONS,
  },
];

export const COMPACT_BACKGROUNDS_BY_MATERIAL: Record<
  ProductMaterial,
  readonly ProductBackground[]
> = {
  plastic: ["white", "black"],
  acrylic: ["white", "transparent"],
  metal: ["white", "black"],
};

export function compactBackgroundsForMaterial(
  material: ProductMaterial | undefined,
): readonly ProductBackground[] {
  return COMPACT_BACKGROUNDS_BY_MATERIAL[material ?? "plastic"];
}

const STICKER_GROSS_PRICES: Record<
  ProductShape,
  Record<"small" | "medium" | "large", Rsd>
> = {
  rectangle: { small: 300, medium: 540, large: 660 },
  square: { small: 300, medium: 480, large: 720 },
  circle: { small: 360, medium: 540, large: 840 },
};

const WINDOW_FILM_GROSS_PRICES: Record<
  "white" | "transparent",
  Record<"small" | "medium" | "large", Rsd>
> = {
  white: { small: 348, medium: 780, large: 1548 },
  transparent: { small: 420, medium: 900, large: 1788 },
};

const COMPACT_STAND_GROSS_PRICES: Record<
  "a4" | "a5" | "a6",
  Record<ProductMaterial, Partial<Record<ProductBackground, Rsd>>>
> = {
  a6: {
    plastic: { white: 660, black: 828 },
    acrylic: { white: 948, transparent: 1020 },
    metal: { white: 1188, black: 1308 },
  },
  a5: {
    plastic: { white: 900, black: 1140 },
    acrylic: { white: 1308, transparent: 1428 },
    metal: { white: 1668, black: 1788 },
  },
  a4: {
    plastic: { white: 1428, black: 1788 },
    acrylic: { white: 2028, transparent: 2268 },
    metal: { white: 2628, black: 2868 },
  },
};

export function getProduct(id: string): PhysicalProduct | undefined {
  return PHYSICAL_PRODUCTS.find((product) => product.id === id);
}

export interface CheapestUnit {
  unitPrice: Rsd;
  productId: ProductId;
}

export function cheapestUnitPrice(): CheapestUnit {
  const first = PHYSICAL_PRODUCTS[0];
  if (!first) return { unitPrice: 0, productId: "stickers" };
  return PHYSICAL_PRODUCTS.reduce<CheapestUnit>(
    (cheapest, product) =>
      product.baseUnitPrice < cheapest.unitPrice
        ? { unitPrice: product.baseUnitPrice, productId: product.id }
        : cheapest,
    { unitPrice: first.baseUnitPrice, productId: first.id },
  );
}

export interface QuantityDiscountTier {
  minQty: number;
  rate: number;
}

export const QUANTITY_DISCOUNT_TIERS: readonly QuantityDiscountTier[] = [
  { minQty: 1, rate: 0 },
  { minQty: 2, rate: 0.08 },
  { minQty: 5, rate: 0.17 },
  { minQty: 10, rate: 0.25 },
  { minQty: 20, rate: 0.3 },
];

export function normalizeQuantity(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

export function applyQuantityDelta(quantity: number, delta: -5 | -1 | 1 | 5): number {
  return normalizeQuantity(quantity + delta);
}

export function quantityFromInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? normalizeQuantity(Number.parseInt(digits, 10)) : 1;
}

export function quantityDiscountRate(quantity: number): number {
  let rate = 0;
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (normalizeQuantity(quantity) >= tier.minQty) rate = tier.rate;
  }
  return rate;
}

export type ProductDesignChoice =
  | { kind: "template"; templateId: TemplateId }
  | { kind: "custom"; brief: string };

export interface ProductSelection {
  productId: ProductId;
  quantity: number;
  orientation?: Orientation;
  shape?: ProductShape;
  background?: ProductBackground;
  finish?: ProductFinish;
  material?: ProductMaterial;
  woodType?: WoodType;
  dimension: ProductDimension;
  design: ProductDesignChoice;
}

export interface OrderSelection {
  service: ServiceId;
  tier: PublicTierId;
  period: BillingPeriod;
  products: ProductSelection[];
  logoUploadId?: string;
}

export function createDefaultProductSelection(
  productId: ProductId = "two-piece-stand",
): ProductSelection {
  const shared = {
    productId,
    quantity: 1,
    design: { kind: "template", templateId: "template-1" },
  } as const;

  if (productId === "stickers") {
    return { ...shared, shape: "square", dimension: "medium" };
  }
  if (productId === "window-film") {
    return {
      ...shared,
      background: "transparent",
      finish: "matte",
      dimension: "medium",
    };
  }
  if (productId === "compact-stand") {
    return { ...shared, background: "white", material: "plastic", dimension: "a5" };
  }
  if (productId === "premium-engraved-stand") {
    return {
      ...shared,
      shape: "rectangle",
      woodType: "oak",
      dimension: "medium",
    };
  }
  return {
    ...shared,
    orientation: "portrait",
    dimension: "a5",
  };
}

export const DEFAULT_ORDER_SELECTION: OrderSelection = {
  service: "review",
  tier: "starter",
  period: "annual",
  products: [createDefaultProductSelection()],
};

export interface ProductLineItem extends ProductSelection {
  baseUnitPrice: Rsd;
  optionSurcharge: Rsd;
  unitPrice: Rsd;
  discountRate: number;
  lineSubtotal: Rsd;
  lineDiscount: Rsd;
  lineTotal: Rsd;
}

export interface OrderBreakdown {
  productItems: ProductLineItem[];
  productsTotal: Rsd;
  oneTimeTotal: Rsd;
  saasFirstTerm: Rsd;
  totalDueNow: Rsd;
  requiresCustomDesignQuote: boolean;
  renewal: { amount: Rsd; period: BillingPeriod; monthlyEquivalent: Rsd };
}

export function productUnitPrice(selection: ProductSelection): Rsd {
  const product = getProduct(selection.productId);
  if (!product) return 0;

  if (
    selection.productId === "stickers" &&
    selection.shape &&
    (selection.dimension === "small" ||
      selection.dimension === "medium" ||
      selection.dimension === "large")
  ) {
    return STICKER_GROSS_PRICES[selection.shape][selection.dimension];
  }

  if (
    selection.productId === "window-film" &&
    (selection.background === "white" || selection.background === "transparent") &&
    (selection.dimension === "small" ||
      selection.dimension === "medium" ||
      selection.dimension === "large")
  ) {
    return WINDOW_FILM_GROSS_PRICES[selection.background][selection.dimension];
  }

  if (
    selection.productId === "compact-stand" &&
    selection.material &&
    selection.background &&
    (selection.dimension === "a4" ||
      selection.dimension === "a5" ||
      selection.dimension === "a6")
  ) {
    return (
      COMPACT_STAND_GROSS_PRICES[selection.dimension][selection.material][
        selection.background
      ] ?? product.baseUnitPrice
    );
  }

  return product.baseUnitPrice;
}

export function productOptionSurcharge(selection: ProductSelection): Rsd {
  void selection;
  return 0;
}

export function computeOrderBreakdown(selection: OrderSelection): OrderBreakdown {
  const productItems = selection.products.map<ProductLineItem>((selected) => {
    const product = getProduct(selected.productId);
    const baseUnitPrice = product?.baseUnitPrice ?? 0;
    const unitPrice = productUnitPrice(selected);
    const optionSurcharge = 0;
    const quantity = normalizeQuantity(selected.quantity);
    const discountRate = quantityDiscountRate(quantity);
    const lineSubtotal = roundRsd(unitPrice * quantity);
    const lineDiscount = roundRsd(lineSubtotal * discountRate);
    return {
      ...selected,
      quantity,
      baseUnitPrice,
      optionSurcharge,
      unitPrice,
      discountRate,
      lineSubtotal,
      lineDiscount,
      lineTotal: lineSubtotal - lineDiscount,
    };
  });

  const productsTotal = productItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const saasFirstTerm = saasFirstTermPrice(selection.service, selection.tier, selection.period);

  return {
    productItems,
    productsTotal,
    oneTimeTotal: productsTotal,
    saasFirstTerm,
    totalDueNow: productsTotal + saasFirstTerm,
    requiresCustomDesignQuote: selection.products.some(
      (product) => product.design.kind === "custom",
    ),
    renewal: {
      amount: saasFirstTerm,
      period: selection.period,
      monthlyEquivalent:
        selection.period === "annual" ? roundRsd(saasFirstTerm / 12) : saasFirstTerm,
    },
  };
}

/**
 * One-time (jednokratno) total for a set of physical products, reusing the
 * exact line math of `computeOrderBreakdown`. The purchase flow's split-total
 * bar (RFC-002 §2.3) shows this separately from recurring money and never sums
 * the two; keeping the arithmetic here (not in the component) is the same "no
 * number in the component" discipline as the pricing engine.
 */
export function computeProductsOneTime(products: readonly ProductSelection[]): Rsd {
  return computeOrderBreakdown({ ...DEFAULT_ORDER_SELECTION, products: [...products] })
    .productsTotal;
}

export interface CardPrice {
  period: BillingPeriod;
  fromAmount: Rsd;
  renewalAmount: Rsd;
}

export function computeCardPrice(
  service: ServiceId,
  tier: PublicTierId,
  period: BillingPeriod,
): CardPrice {
  const recurring = saasFirstTermPrice(service, tier, period);
  const cheapest = cheapestUnitPrice().unitPrice;
  if (period === "annual") {
    return {
      period,
      fromAmount: roundRsd((cheapest + recurring) / 12),
      renewalAmount: roundRsd(recurring / 12),
    };
  }
  return {
    period,
    fromAmount: cheapest + recurring,
    renewalAmount: recurring,
  };
}
