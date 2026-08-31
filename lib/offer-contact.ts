import { offerSr as dict } from "./i18n/sr/offer";
import { fmt } from "./i18n/format";
import { encodeSelection, parseSelection } from "./offer-url";
import {
  computeOrderBreakdown,
  formatRsd,
  getProduct,
  type OrderSelection,
  type ProductLineItem,
} from "./scanme-pricing";

const SELECTION_PARAM = "ponuda";
const ENTERPRISE_PARAM = "upit";
const ENTERPRISE_VALUE = "enterprise";

export const ENTERPRISE_OFFER_MESSAGE =
  "Zdravo, zanima me ScanMe Enterprise ponuda. Molim vas da me kontaktirate radi uslova po meri.";
export const ENTERPRISE_CONTACT_HREF = `/?${ENTERPRISE_PARAM}=${ENTERPRISE_VALUE}#ponuda`;

function configurationSummary(item: ProductLineItem): string[] {
  const product = getProduct(item.productId);
  if (!product) return [];

  return product.controlIds.map((controlId) => {
    if (controlId === "orientation") {
      return item.orientation === "landscape" ? dict.landscape : dict.portrait;
    }
    if (controlId === "shape") {
      return item.shape ? dict.shapeNames[item.shape] : "";
    }
    if (controlId === "background") {
      return item.background ? dict.backgroundNames[item.background] : "";
    }
    if (controlId === "finish") {
      return item.finish ? dict.finishNames[item.finish] : "";
    }
    if (controlId === "woodType") {
      return item.woodType ? dict.woodTypeNames[item.woodType] : "";
    }
    if (controlId === "material") {
      return item.material ? dict.materialNames[item.material] : "";
    }
    return dict.dimensionNames[item.dimension];
  });
}

export function buildOfferMessage(selection: OrderSelection): string {
  const breakdown = computeOrderBreakdown(selection);
  const annual = selection.period === "annual";
  const lines: string[] = [
    "Zdravo, evo izbora koji sam sastavio kroz ScanMe konfigurator:",
    "",
    `${dict.service}: ${dict.serviceNames[selection.service]}`,
    `${dict.tier}: ${dict.tierNames[selection.tier]}`,
    `${dict.billingPeriod}: ${dict.periodNames[selection.period]}`,
    "",
    `${dict.physicalProducts}:`,
  ];

  for (const item of breakdown.productItems) {
    const product = dict.products[item.productId];
    const design =
      item.design.kind === "template"
        ? dict.templateNames[item.design.templateId]
        : dict.customDesign;
    const configuration = configurationSummary(item);
    lines.push(
      `- ${product.name}, ${item.quantity} kom, ${configuration.join(", ")}, ${design}: ${formatRsd(item.lineTotal)} RSD`,
    );
    if (item.optionSurcharge > 0) {
      lines.push(
        `  ${fmt(dict.compactBlackReason, { price: formatRsd(item.optionSurcharge) })}`,
      );
    }
    if (item.design.kind === "custom" && item.design.brief.trim()) {
      lines.push(`  Opis: ${item.design.brief.trim()}`);
    }
  }

  lines.push(
    "",
    `${dict.logo}: ${selection.logoUploadId ? dict.logoAdded : dict.logoNotAdded}`,
    "",
    `${breakdown.requiresCustomDesignQuote ? dict.subtotalWithoutCustom : dict.totalNow}: ${formatRsd(breakdown.totalDueNow)} RSD`,
    `${dict.renewal}: ${formatRsd(breakdown.renewal.amount)} ${annual ? dict.renewalAnnual : dict.renewalMonthly}`,
    "",
    `(${dict.temporaryPrices})`,
  );

  return lines.join("\n");
}

export function buildSelectionContactHref(selection: OrderSelection): string {
  const encoded = encodeSelection(selection).toString();
  return `/?${SELECTION_PARAM}=${encodeURIComponent(encoded)}#ponuda`;
}

export function readContactSelection(params: URLSearchParams): OrderSelection | null {
  const raw = params.get(SELECTION_PARAM);
  if (!raw) return null;
  const selection = parseSelection(new URLSearchParams(raw));
  return selection?.products.length ? selection : null;
}

export function readContactMessage(params: URLSearchParams): string | null {
  if (params.get(ENTERPRISE_PARAM) === ENTERPRISE_VALUE) {
    return ENTERPRISE_OFFER_MESSAGE;
  }
  const selection = readContactSelection(params);
  return selection ? buildOfferMessage(selection) : null;
}
