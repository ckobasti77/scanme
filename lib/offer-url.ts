/** Serijalizacija ponude kroz URL. V4 nosi novu matricu materijala kompaktnih
 *  stalaka; V5 nosi stanje četvorokoračnog toka kupovine — SKUP usluga + plan
 *  (RFC-002 §2.3). V1–V4 se i dalje parsiraju netaknuti (`parseSelection`). */

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
import {
  SERVICE_IDS,
  type PlanId,
  type ServiceId as PurchaseServiceId,
} from "./pricing/engine";

const SERVICES: readonly ServiceId[] = ["review", "links"];
const TIERS: readonly PublicTierId[] = ["starter", "premium"];
const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];
const VERSION = "4";

// --- V5: state of the four-step purchase flow (RFC-002 §2.3) ----------------
// The V5 model is a DIFFERENT shape from V1–V4: not "one service + one tier"
// but "a set of the five services (each with a period) + an account plan". It
// gets its own encode/parse pair; `parseSelection` (V1–V4) is left untouched so
// a link someone already shared keeps parsing.

const PURCHASE_VERSION = "5";
const PURCHASE_SERVICES: readonly PurchaseServiceId[] = SERVICE_IDS;
const PURCHASE_PLANS: readonly PlanId[] = ["basic", "premium", "enterprise"];
export const PURCHASE_STEPS = [1, 2, 3, 4] as const;
export type PurchaseStep = (typeof PURCHASE_STEPS)[number];

export interface PurchaseServiceSelection {
  service: PurchaseServiceId;
  period: BillingPeriod;
}

/** The whole V5 flow state — shareable by link (RFC-002 §2.3). */
export interface PurchaseSelection {
  /** The chosen services; a service appears at most once. May be empty while
   *  the buyer is still on step 1. */
  services: PurchaseServiceSelection[];
  plan: PlanId;
  /** Present only for `premium` (its monthly/annual price differ) — the same
   *  rule the engine enforces (`lib/pricing`). */
  planPeriod?: BillingPeriod;
  /** Physical products (step 3) — same shape and validation as V4. */
  products: ProductSelection[];
  /** Per physical-product line: the purchased service(s) that line's card leads
   *  to (RFC-002 §2.3, step 3). Keyed by `productId` (a product appears at most
   *  once in `products`). A line bound to two or more services routes to a
   *  splitter (razdelnik, §2.4). Absent/empty for a product means "bind to the
   *  sole/first purchased service silently" — the model reconciles it on read
   *  (components/purchase/step-products-model.ts), so a stale entry pointing at a
   *  service the buyer later dropped never survives. Only lines the buyer bound
   *  by hand are stored; a single-service order stores nothing (the bind is
   *  silent). */
  bindings?: Partial<Record<ProductId, PurchaseServiceId[]>>;
  logoUploadId?: string;
  step: PurchaseStep;
}

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

// --- V5 codec ---------------------------------------------------------------

function isPurchaseStep(value: number): value is PurchaseStep {
  return (PURCHASE_STEPS as readonly number[]).includes(value);
}

export function encodePurchaseSelection(selection: PurchaseSelection): URLSearchParams {
  const params = new URLSearchParams();
  params.set("v", PURCHASE_VERSION);
  params.set(
    "services",
    selection.services.map((entry) => `${entry.service}:${entry.period}`).join(","),
  );
  params.set("plan", selection.plan);
  if (selection.planPeriod) params.set("planPeriod", selection.planPeriod);
  params.set("items", JSON.stringify(selection.products));
  const bind = encodeBindings(selection.bindings);
  if (bind) params.set("bind", bind);
  if (selection.logoUploadId) params.set("logoUpload", selection.logoUploadId);
  params.set("step", String(selection.step));
  return params;
}

// Bindings ride the URL as `bind=<productId>:<svc>|<svc>,<productId>:<svc>` so a
// configuration stays shareable by link (RFC-002 §2.3). Only products the buyer
// bound by hand appear; the model fills the silent default for the rest.
function encodeBindings(
  bindings: PurchaseSelection["bindings"],
): string | null {
  if (!bindings) return null;
  const chunks: string[] = [];
  for (const productId of Object.keys(bindings) as ProductId[]) {
    const services = bindings[productId];
    if (!services || services.length === 0) continue;
    chunks.push(`${productId}:${services.join("|")}`);
  }
  return chunks.length > 0 ? chunks.join(",") : null;
}

function parseBindings(
  raw: string | null,
): PurchaseSelection["bindings"] | null | "invalid" {
  if (raw === null) return null; // absent — the common single-service case
  if (raw === "") return "invalid";
  const bindings: Partial<Record<ProductId, PurchaseServiceId[]>> = {};
  const seenProducts = new Set<ProductId>();
  for (const chunk of raw.split(",")) {
    const parts = chunk.split(":");
    if (parts.length !== 2) return "invalid";
    const [productId, servicesRaw] = parts;
    if (!productId || !getProduct(productId)) return "invalid";
    if (seenProducts.has(productId as ProductId)) return "invalid"; // one entry per line
    const services: PurchaseServiceId[] = [];
    const seenServices = new Set<PurchaseServiceId>();
    for (const service of servicesRaw.split("|")) {
      if (!service || !PURCHASE_SERVICES.includes(service as PurchaseServiceId)) return "invalid";
      if (seenServices.has(service as PurchaseServiceId)) return "invalid";
      seenServices.add(service as PurchaseServiceId);
      services.push(service as PurchaseServiceId);
    }
    if (services.length === 0) return "invalid";
    seenProducts.add(productId as ProductId);
    bindings[productId as ProductId] = services;
  }
  return bindings;
}

function parsePurchaseServices(raw: string): PurchaseServiceSelection[] | null {
  if (raw === "") return [];
  const services: PurchaseServiceSelection[] = [];
  const seen = new Set<PurchaseServiceId>();
  for (const chunk of raw.split(",")) {
    const parts = chunk.split(":");
    if (parts.length !== 2) return null;
    const [service, period] = parts;
    if (!service || !PURCHASE_SERVICES.includes(service as PurchaseServiceId)) return null;
    if (!period || !PERIODS.includes(period as BillingPeriod)) return null;
    if (seen.has(service as PurchaseServiceId)) return null; // a service is owned once
    seen.add(service as PurchaseServiceId);
    services.push({ service: service as PurchaseServiceId, period: period as BillingPeriod });
  }
  if (services.length > PURCHASE_SERVICES.length) return null;
  return services;
}

/** Parse the V5 flow state. Strict, like `parseSelection`: any malformed field
 *  yields `null` rather than a silently-coerced value. Returns `null` for every
 *  non-V5 version — V1–V4 links are the job of `parseSelection`. */
export function parsePurchaseSelection(params: URLSearchParams): PurchaseSelection | null {
  if (params.get("v") !== PURCHASE_VERSION) return null;

  const plan = params.get("plan");
  if (!plan || !PURCHASE_PLANS.includes(plan as PlanId)) return null;

  // planPeriod: required for premium, forbidden otherwise — the engine's rule.
  const planPeriodRaw = params.get("planPeriod");
  let planPeriod: BillingPeriod | undefined;
  if (plan === "premium") {
    if (!planPeriodRaw || !PERIODS.includes(planPeriodRaw as BillingPeriod)) return null;
    planPeriod = planPeriodRaw as BillingPeriod;
  } else if (planPeriodRaw !== null) {
    return null;
  }

  const servicesRaw = params.get("services");
  if (servicesRaw === null) return null;
  const services = parsePurchaseServices(servicesRaw);
  if (!services) return null;

  const itemsRaw = params.get("items");
  if (itemsRaw === null) return null;
  const products = parseV3Items(itemsRaw);
  if (!products) return null;

  const bindings = parseBindings(params.get("bind"));
  if (bindings === "invalid") return null;

  const logoUploadId = params.get("logoUpload") ?? undefined;
  if (logoUploadId !== undefined && (logoUploadId.length < 1 || logoUploadId.length > 200)) {
    return null;
  }

  const stepRaw = params.get("step");
  if (stepRaw === null) return null;
  const step = Number(stepRaw);
  if (!Number.isInteger(step) || !isPurchaseStep(step)) return null;

  return {
    services,
    plan: plan as PlanId,
    ...(planPeriod ? { planPeriod } : {}),
    products,
    ...(bindings ? { bindings } : {}),
    ...(logoUploadId ? { logoUploadId } : {}),
    step,
  };
}
