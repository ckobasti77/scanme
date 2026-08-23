/**
 * Centralizovan domenski model cena za ScanMe.
 *
 * Čista matematika, bez React i bez Convex zavisnosti — testabilno pod Vitest
 * (edge-runtime). Sve monetarne vrednosti su CELI RSD dinari (integer `number`);
 * valutni sufiks ("RSD", "RSD/mes") dodaju komponente, model vraća samo broj.
 *
 * SVE CENE SU PRIVREMENE RADNE VREDNOSTI (PLACEHOLDER). Ovo nije konačan cenovnik.
 *
 * Pravilo zaokruživanja: računaj u float, `roundRsd` na SVAKOJ izlaznoj granici
 * (lineTotal, designFee, saasFirstTerm, mesečni ekvivalenti); zbirovi koriste već
 * zaokružene linije da nema drifta.
 */

export type Rsd = number; // celi dinari

export type ServiceId = "review" | "links";
export type TierId = "starter" | "premium" | "enterprise";
export type PublicTierId = "starter" | "premium"; // Enterprise NE ulazi u self-service obračun
export type BillingPeriod = "monthly" | "annual";
export type PhysicalTier = "standard" | "premium"; // za vizuelno razdvajanje proizvoda

/** Zaokruživanje na ceo dinar (pola naviše). Primenjuje se na svaki monetarni izlaz. */
export function roundRsd(value: number): Rsd {
  return Math.round(value);
}

/**
 * Srpski format grupisan tačkom: 990 -> "990", 1000 -> "1.000", 11990 -> "11.990".
 * Ručno, deterministički — NE `Intl.NumberFormat` (različiti Node ICU buildovi daju
 * različit separator i test puca na CI-ju). Bez sufiksa valute.
 */
export function formatRsd(value: Rsd): string {
  const rounded = roundRsd(value);
  const negative = rounded < 0;
  const digits = Math.abs(rounded).toString();
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return negative ? `-${out}` : out;
}

// --- SaaS cenovnik (PLACEHOLDER) -------------------------------------------

export interface SaasPrice {
  monthly: Rsd;
  annual: Rsd; // ukupno, naplaćeno jednom godišnje
}

// PLACEHOLDER: privremene radne cene SaaS pretplate po usluzi i paketu.
export const SAAS_PRICING: Record<ServiceId, Record<PublicTierId, SaasPrice>> = {
  review: {
    starter: { monthly: 490, annual: 4990 },
    premium: { monthly: 990, annual: 9990 },
  },
  links: {
    starter: { monthly: 790, annual: 7990 },
    premium: { monthly: 1190, annual: 11990 },
  },
};

export function getSaasPrice(service: ServiceId, tier: PublicTierId): SaasPrice {
  return SAAS_PRICING[service][tier];
}

// --- Katalog fizičkih proizvoda (PLACEHOLDER) ------------------------------

export interface Material {
  id: string;
  name: string;
  unitPrice: Rsd; // jednokratna cena po komadu (PLACEHOLDER)
}

export interface PhysicalProduct {
  id: string;
  name: string;
  tier: PhysicalTier;
  imagePlaceholder: string; // TODO: prava fotografija
  materials: Material[]; // svaki proizvod nosi svoje materijale
}

// PLACEHOLDER: TAČNO 3 standardna + 2 premium proizvoda, svaki sa TAČNO 3 materijala.
// Fiksan broj drži layout stabilnim dok se ne zaključi pravi katalog.
export const PHYSICAL_PRODUCTS: readonly PhysicalProduct[] = [
  {
    id: "nalepnica",
    name: "Nalepnica",
    tier: "standard",
    imagePlaceholder: "placeholder", // PLACEHOLDER
    materials: [
      { id: "pvc", name: "PVC", unitPrice: 290 },
      { id: "vinil", name: "Vinil", unitPrice: 390 },
      { id: "laminat", name: "Laminat", unitPrice: 490 },
    ],
  },
  {
    id: "stona-kartica",
    name: "Stona kartica",
    tier: "standard",
    imagePlaceholder: "placeholder", // PLACEHOLDER
    materials: [
      { id: "karton", name: "Karton", unitPrice: 350 },
      { id: "plastika", name: "Plastika", unitPrice: 550 },
      { id: "aluminijum", name: "Aluminijum", unitPrice: 850 },
    ],
  },
  {
    id: "privezak",
    name: "Privezak",
    tier: "standard",
    imagePlaceholder: "placeholder", // PLACEHOLDER
    materials: [
      { id: "pvc", name: "PVC", unitPrice: 300 },
      { id: "drvo", name: "Drvo", unitPrice: 500 },
      { id: "metal", name: "Metal", unitPrice: 700 },
    ],
  },
  {
    id: "metalna-plocica",
    name: "Metalna pločica",
    tier: "premium",
    imagePlaceholder: "placeholder", // PLACEHOLDER
    materials: [
      { id: "celik", name: "Čelik", unitPrice: 1500 },
      { id: "mesing", name: "Mesing", unitPrice: 1900 },
      { id: "bakar", name: "Bakar", unitPrice: 2300 },
    ],
  },
  {
    id: "stalak",
    name: "Stalak",
    tier: "premium",
    imagePlaceholder: "placeholder", // PLACEHOLDER
    materials: [
      { id: "akril", name: "Akril", unitPrice: 1200 },
      { id: "drvo", name: "Drvo", unitPrice: 1600 },
      { id: "metal", name: "Metal", unitPrice: 2200 },
    ],
  },
];

export function getProduct(id: string): PhysicalProduct | undefined {
  return PHYSICAL_PRODUCTS.find((product) => product.id === id);
}

export function getMaterial(
  product: PhysicalProduct,
  materialId: string,
): Material | undefined {
  return product.materials.find((material) => material.id === materialId);
}

/** Najjeftiniji pojedinačni komad u celom katalogu — ulaz za "Od" cenu. */
export interface CheapestUnit {
  unitPrice: Rsd;
  productId: string;
  productName: string;
  materialId: string;
  materialName: string;
}

export function cheapestUnitPrice(): CheapestUnit {
  let cheapest: CheapestUnit | null = null;
  for (const product of PHYSICAL_PRODUCTS) {
    for (const material of product.materials) {
      if (cheapest === null || material.unitPrice < cheapest.unitPrice) {
        cheapest = {
          unitPrice: material.unitPrice,
          productId: product.id,
          productName: product.name,
          materialId: material.id,
          materialName: material.name,
        };
      }
    }
  }
  // Katalog nikad nije prazan (fiksan PLACEHOLDER broj), ali čuvamo tip.
  if (cheapest === null) {
    return { unitPrice: 0, productId: "", productName: "", materialId: "", materialName: "" };
  }
  return cheapest;
}

// --- Količinski popust (po VRSTI proizvoda, egzaktno) ----------------------

export interface QuantityDiscountTier {
  minQty: number;
  rate: number; // 0..1
}

// Privremene vrednosti: 0 / 8 / 17 / 25 / 30 %.
export const QUANTITY_DISCOUNT_TIERS: readonly QuantityDiscountTier[] = [
  { minQty: 1, rate: 0 },
  { minQty: 2, rate: 0.08 },
  { minQty: 5, rate: 0.17 },
  { minQty: 10, rate: 0.25 },
  { minQty: 20, rate: 0.3 },
];

/** Bira popust prema tiražu jedne vrste proizvoda. */
export function quantityDiscountRate(qty: number): number {
  let rate = 0;
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (qty >= tier.minQty) rate = tier.rate;
  }
  return rate;
}

// --- Dizajn ----------------------------------------------------------------

export type DesignChoice =
  | { kind: "template"; templateId: string; addOwnLogo: boolean }
  | { kind: "custom"; addOwnLogo: boolean };

// PLACEHOLDER: jednokratna naknada za custom dizajn (naplaćuje se TAČNO jednom po
// porudžbini i primenjuje na sve stavke). Sopstveni logo je BESPLATAN.
export const CUSTOM_DESIGN_FEE: Rsd = 3900;

// --- Izbor (ulaz) i obračun (izlaz) ----------------------------------------

export interface ProductSelection {
  productId: string;
  materialId: string;
  quantity: number; // >= 1
}

export interface OrderSelection {
  service: ServiceId;
  tier: PublicTierId;
  period: BillingPeriod;
  products: ProductSelection[]; // više vrsta; svaka svoj materijal i tiraž
  design: DesignChoice;
}

export interface ProductLineItem {
  productId: string;
  productName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unitPrice: Rsd;
  discountRate: number;
  lineSubtotal: Rsd;
  lineDiscount: Rsd;
  lineTotal: Rsd;
}

export interface OrderBreakdown {
  productItems: ProductLineItem[];
  productsTotal: Rsd; // Σ lineTotal
  designFee: Rsd; // 0 za template, CUSTOM_DESIGN_FEE za custom (jednom)
  oneTimeTotal: Rsd; // productsTotal + designFee (fizičko se NE naplaćuje ponovo)
  saasFirstTerm: Rsd; // annual: SaasPrice.annual; monthly: SaasPrice.monthly
  totalDueNow: Rsd; // oneTimeTotal + saasFirstTerm
  renewal: { amount: Rsd; period: BillingPeriod; monthlyEquivalent: Rsd }; // SAMO SaaS
}

/** Pun obračun iz kompletnog izbora, sa odvojenim stavkama. */
export function computeOrderBreakdown(selection: OrderSelection): OrderBreakdown {
  const productItems: ProductLineItem[] = selection.products.map((selected) => {
    const product = getProduct(selected.productId);
    const material = product ? getMaterial(product, selected.materialId) : undefined;
    const unitPrice = material?.unitPrice ?? 0;
    const quantity = Math.max(1, Math.floor(selected.quantity));
    const discountRate = quantityDiscountRate(quantity);
    const lineSubtotal = roundRsd(unitPrice * quantity);
    const lineDiscount = roundRsd(unitPrice * quantity * discountRate);
    const lineTotal = lineSubtotal - lineDiscount;
    return {
      productId: selected.productId,
      productName: product?.name ?? "",
      materialId: selected.materialId,
      materialName: material?.name ?? "",
      quantity,
      unitPrice,
      discountRate,
      lineSubtotal,
      lineDiscount,
      lineTotal,
    };
  });

  const productsTotal = productItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const designFee = selection.design.kind === "custom" ? CUSTOM_DESIGN_FEE : 0;
  const oneTimeTotal = productsTotal + designFee;

  const saas = getSaasPrice(selection.service, selection.tier);
  const saasFirstTerm = selection.period === "annual" ? saas.annual : saas.monthly;
  const totalDueNow = oneTimeTotal + saasFirstTerm;

  const renewalAmount = selection.period === "annual" ? saas.annual : saas.monthly;
  const monthlyEquivalent =
    selection.period === "annual" ? roundRsd(saas.annual / 12) : saas.monthly;

  return {
    productItems,
    productsTotal,
    designFee,
    oneTimeTotal,
    saasFirstTerm,
    totalDueNow,
    renewal: { amount: renewalAmount, period: selection.period, monthlyEquivalent },
  };
}

// --- "Od" cena za karticu paketa -------------------------------------------

export interface CardPrice {
  period: BillingPeriod;
  /**
   * Headline "Od" iznos.
   * annual: mesečni ekvivalent 1. godine = round((cheapestUnit + SaaS.annual)/12)
   * monthly: cheapestUnit + SaaS.monthly (prvi mesec).
   */
  fromAmount: Rsd;
  /**
   * Obnova, SAMO SaaS.
   * annual: round(SaaS.annual/12) (mesečni ekvivalent); monthly: SaaS.monthly.
   */
  renewalAmount: Rsd;
}

export function computeCardPrice(
  service: ServiceId,
  tier: PublicTierId,
  period: BillingPeriod,
): CardPrice {
  const saas = getSaasPrice(service, tier);
  const cheapest = cheapestUnitPrice().unitPrice;

  if (period === "annual") {
    return {
      period,
      fromAmount: roundRsd((cheapest + saas.annual) / 12),
      renewalAmount: roundRsd(saas.annual / 12),
    };
  }

  return {
    period,
    fromAmount: cheapest + saas.monthly,
    renewalAmount: saas.monthly,
  };
}
