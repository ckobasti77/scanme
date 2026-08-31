/** Serijalizacija ponude kroz URL. V4 nosi novu matricu materijala kompaktnih stalaka. */

import {
  createDefaultProductSelection,
  compactBackgroundsForMaterial,
  getProduct,
  normalizeQuantity,
  type BillingPeriod,
  type OrderSelection,
  type Orientation,
  type ProductBackground,
  type ProductDesignChoice,
  type ProductDimension,
  type ProductFinish,
  type ProductId,
  type ProductMaterial,
  type ProductShape,
  type ProductSelection,
  type PublicTierId,
  type ServiceId,
  type TemplateId,
  type WoodType,
} from "./scanme-pricing";

const SERVICES: readonly ServiceId[] = ["review", "links"];
const TIERS: readonly PublicTierId[] = ["starter", "premium"];
const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];
const VERSION = "4";

const LEGACY_PRODUCT_MAP: Record<string, ProductId> = {
  nalepnica: "stickers",
  "stona-kartica": "window-film",
  privezak: "two-piece-stand",
  "metalna-plocica": "compact-stand",
  stalak: "premium-engraved-stand",
};

export function encodeSelection(selection: OrderSelection): URLSearchParams {
  const params = new URLSearchParams();
  params.set("v", VERSION);
  params.set("service", selection.service);
  params.set("tier", selection.tier);
  params.set("period", selection.period);
  params.set("items", JSON.stringify(selection.products));
  if (selection.logoUploadId) params.set("logoUpload", selection.logoUploadId);
  return params;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDesign(value: unknown, productId: ProductId): ProductDesignChoice | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  const product = getProduct(productId);
  if (!product) return null;

  if (value.kind === "template" && typeof value.templateId === "string") {
    if (!product.allowedTemplateIds.includes(value.templateId as TemplateId)) return null;
    return { kind: "template", templateId: value.templateId as TemplateId };
  }
  if (value.kind === "custom" && typeof value.brief === "string") {
    if (value.brief.length > 500) return null;
    return { kind: "custom", brief: value.brief };
  }
  return null;
}

function parseProductBase(value: unknown) {
  if (!isRecord(value)) return null;
  if (
    typeof value.productId !== "string" ||
    typeof value.quantity !== "number"
  ) {
    return null;
  }

  const product = getProduct(value.productId);
  if (!product || !Number.isInteger(value.quantity) || value.quantity < 1) return null;
  const design = parseDesign(value.design, product.id);
  if (!design) return null;

  return { value, product, design };
}

function parseProduct(value: unknown): ProductSelection | null {
  const parsed = parseProductBase(value);
  if (!parsed) return null;
  const { product, design } = parsed;
  const raw = parsed.value;
  if (typeof raw.dimension !== "string") return null;
  if (!product.allowedDimensions.includes(raw.dimension as ProductDimension)) return null;

  const selection: ProductSelection = {
    ...createDefaultProductSelection(product.id),
    quantity: normalizeQuantity(raw.quantity as number),
    dimension: raw.dimension as ProductDimension,
    design,
  };

  for (const controlId of product.controlIds) {
    if (controlId === "orientation") {
      if (
        typeof raw.orientation !== "string" ||
        !product.allowedOrientations?.includes(raw.orientation as Orientation)
      ) return null;
      selection.orientation = raw.orientation as Orientation;
    }
    if (controlId === "shape") {
      if (
        typeof raw.shape !== "string" ||
        !product.allowedShapes?.includes(raw.shape as ProductShape)
      ) return null;
      selection.shape = raw.shape as ProductShape;
    }
    if (controlId === "background") {
      if (
        typeof raw.background !== "string" ||
        !product.allowedBackgrounds?.includes(raw.background as ProductBackground)
      ) return null;
      selection.background = raw.background as ProductBackground;
    }
    if (controlId === "finish") {
      if (
        typeof raw.finish !== "string" ||
        !product.allowedFinishes?.includes(raw.finish as ProductFinish)
      ) return null;
      selection.finish = raw.finish as ProductFinish;
    }
    if (controlId === "material") {
      if (raw.material === undefined) continue;
      const material = raw.material === "aluminum" ? "metal" : raw.material;
      if (
        typeof material !== "string" ||
        !product.allowedMaterials?.includes(material as ProductMaterial)
      ) return null;
      selection.material = material as ProductMaterial;
    }
    if (controlId === "woodType") {
      if (
        typeof raw.woodType !== "string" ||
        !product.allowedWoodTypes?.includes(raw.woodType as WoodType)
      ) return null;
      selection.woodType = raw.woodType as WoodType;
    }
  }

  if (
    selection.productId === "compact-stand" &&
    selection.background &&
    !compactBackgroundsForMaterial(selection.material).includes(selection.background)
  ) {
    return null;
  }

  return selection;
}

function parseV3Items(raw: string): ProductSelection[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 5) return null;
    const products: ProductSelection[] = [];
    for (const item of value) {
      const product = parseProduct(item);
      if (!product || products.some((entry) => entry.productId === product.productId)) {
        return null;
      }
      products.push(product);
    }
    return products;
  } catch {
    return null;
  }
}

function parseV2Product(value: unknown): ProductSelection | null {
  const parsed = parseProductBase(value);
  if (!parsed) return null;
  const raw = parsed.value;
  if (typeof raw.orientation !== "string" || typeof raw.dimension !== "string") return null;
  const selection = createDefaultProductSelection(parsed.product.id);

  if (
    parsed.product.allowedOrientations?.includes(raw.orientation as Orientation)
  ) {
    selection.orientation = raw.orientation as Orientation;
  }
  if (parsed.product.allowedDimensions.includes(raw.dimension as ProductDimension)) {
    selection.dimension = raw.dimension as ProductDimension;
  }

  return {
    ...selection,
    quantity: normalizeQuantity(raw.quantity as number),
    design: parsed.design,
  };
}

function parseV2Items(raw: string): ProductSelection[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 5) return null;
    const products: ProductSelection[] = [];
    for (const item of value) {
      const product = parseV2Product(item);
      if (!product || products.some((entry) => entry.productId === product.productId)) {
        return null;
      }
      products.push(product);
    }
    return products;
  } catch {
    return null;
  }
}

function parseLegacyItems(raw: string, custom: boolean): ProductSelection[] | null {
  if (!raw) return [];
  const products: ProductSelection[] = [];
  for (const chunk of raw.split(",")) {
    const parts = chunk.split(":");
    const legacyId = parts[0];
    const quantityRaw = parts[2];
    const rest = parts.slice(3);
    const productId = LEGACY_PRODUCT_MAP[legacyId ?? ""];
    const quantity = Number(quantityRaw);
    if (rest.length > 0 || !productId || !Number.isInteger(quantity) || quantity < 1) {
      return null;
    }
    const selection = createDefaultProductSelection(productId);
    products.push({
      ...selection,
      quantity,
      ...(custom ? { design: { kind: "custom" as const, brief: "" } } : {}),
    });
  }
  return products;
}

function parseBase(params: URLSearchParams) {
  const service = params.get("service");
  const tier = params.get("tier");
  const period = params.get("period");
  if (!service || !SERVICES.includes(service as ServiceId)) return null;
  if (!tier || !TIERS.includes(tier as PublicTierId)) return null;
  if (!period || !PERIODS.includes(period as BillingPeriod)) return null;
  return {
    service: service as ServiceId,
    tier: tier as PublicTierId,
    period: period as BillingPeriod,
  };
}

export function parseSelection(params: URLSearchParams): OrderSelection | null {
  const base = parseBase(params);
  if (!base) return null;

  const version = params.get("v");
  if (version === VERSION || version === "3" || version === "2") {
    const itemsRaw = params.get("items");
    if (itemsRaw === null) return null;
    const products = version === "2" ? parseV2Items(itemsRaw) : parseV3Items(itemsRaw);
    if (!products) return null;
    const logoUploadId = params.get("logoUpload") ?? undefined;
    if (logoUploadId !== undefined && (logoUploadId.length < 1 || logoUploadId.length > 200)) {
      return null;
    }
    return { ...base, products, ...(logoUploadId ? { logoUploadId } : {}) };
  }

  // V1 kompatibilnost: stari materijal se bezbedno svodi na novi proizvod,
  // a stari globalni design postaje isti izbor na svakoj stavci.
  const design = params.get("design");
  const logo = params.get("logo");
  if (!design || (logo !== "0" && logo !== "1")) return null;
  const custom = design === "custom";
  if (!custom && !design.startsWith("template:")) return null;
  const products = parseLegacyItems(params.get("items") ?? "", custom);
  return products ? { ...base, products } : null;
}
