import type { FairPassportCatalogEntry, FairPublicModel } from "./fair-contract";

// Shared, side-effect-free rule for "does this brand have a brand page": the brand page route
// (lib/fair-server/brand-page.ts), the brand link on the model page and the brand passport's
// "Svi modeli i probna vožnja" button all read it, so a link never points at "nije pronađen".

/** Only paid-package models reach the page: `capabilities.ratingMode` is `"none"` for the
 * `included` tier, `"overall"` for `starter` and `"dimensions"` for `advanced`
 * (lib/fair-entitlements.ts), and `fairTierHasFeature(tier, "rating")` is exactly
 * `ratingMode !== "none"`. Models with `"none"` are the free-ride catalog entries that visitors
 * see on the map but never on a brand page. */
function isPackaged(model: FairPublicModel): boolean {
  return model.capabilities.ratingMode !== "none";
}

/** The packaged models of one passport-catalog brand, in the brand's own order
 * (`entry.models[]` is the order the passport shows). The passport payload also carries
 * cross-brand favorites, so every reference is re-checked against this brand. An empty result
 * means the brand has no brand page. */
export function fairBrandPageModels(
  entry: FairPassportCatalogEntry,
  modelById: ReadonlyMap<string, FairPublicModel>,
): FairPublicModel[] {
  return entry.models.flatMap((reference) => {
    const model = modelById.get(reference.eventModelId);
    return model && model.brandId === entry.brandId && isPackaged(model) ? [model] : [];
  });
}
