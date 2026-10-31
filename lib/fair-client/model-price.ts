import type { FairModelDict } from "@/lib/i18n/types";

/** "Cena na upit" / empty → "na upit"; a leading "Cena " is dropped (the block already says Cena). */
export function fairModelPriceValue(priceText: string, dict: Pick<FairModelDict, "priceOnRequest">) {
  const text = priceText.trim();
  if (!text || /^(cena\s+)?na upit$/i.test(text)) return dict.priceOnRequest;
  return text.replace(/^cena\s+/i, "");
}

/** AMF Škoda shows the price of the exhibited car; every other model the plain "Cena". */
export function fairModelPriceLabel(
  eventSlug: string,
  brandName: string,
  dict: Pick<FairModelDict, "priceLabel" | "exhibitedPriceLabel">,
) {
  return eventSlug === "auto-moto-fest-2026" && brandName === "Škoda" ? dict.exhibitedPriceLabel : dict.priceLabel;
}
