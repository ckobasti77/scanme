import { fairPassportBrandSlug } from "../fair-passport";
import { loadFairPassportPage } from "./passport-page";
import type { FairPassportCatalogEntry, FairPublicModel } from "../fair-contract";

/** Price and photo as the row renders them: `priceText` is shown verbatim, `photoUrl` is passed
 * raw so the row applies the model page's own pipeline (`fairPhotoUnoptimized` +
 * `fairVehiclePhotoStyle`) — the projection touches neither. */
export type FairBrandPageModel = {
  id: string;
  slug: string;
  name: string;
  priceText: string;
  photoUrl?: string;
};

export type FairBrandPageData = {
  /** Event's own title: the shell's event name and later "u ponudi na …" copy. */
  eventName: string;
  eventId: string;
  brand: { name: string; logoUrl?: string };
  exhibitor: { name: string };
  models: FairBrandPageModel[];
  /** Public event slug — the model-row links and the header's passport stamp (`/sajam/<slug>/…`). */
  eventSlug: string;
  /** True when this brand is in the event's passport catalog — drives the header stamp + its href. */
  hasPassport: boolean;
  /** URL segment of this brand, same identity as `brandSlug` above — the stamp href. */
  brandSlug: string;
};

/** Only paid-package models reach the page: `capabilities.ratingMode` is `"none"` for the
 * `included` tier, `"overall"` for `starter` and `"dimensions"` for `advanced`
 * (lib/fair-entitlements.ts:31, 47, 69), and `fairTierHasFeature(tier, "rating")` is exactly
 * `ratingMode !== "none"` (lib/fair-entitlements.ts:151-153). Models with `"none"` are the
 * free-ride catalog entries that visitors see on the map but never on a brand page. */
function isPackaged(model: FairPublicModel): boolean {
  return model.capabilities.ratingMode !== "none";
}

/** One brand row plus its packaged models, kept in the brand's own order (`catalog[].models[]`
 * is the order the passport shows, and `loadFairPassportPage` does not re-sort it). Pure so the
 * static demo route projects its fixtures the same way the live route projects Convex data. */
export function projectFairBrandPage(input: {
  eventId: string;
  eventName: string;
  catalog: readonly FairPassportCatalogEntry[];
  models: readonly FairPublicModel[];
  /** Public slug from `page.event.slug` — projected so the components can build `/sajam/…` links
   * without learning the internal-vs-public slug rules. */
  eventSlug: string;
  /** URL segment made by `fairPassportBrandSlug(brandName)` (lib/fair-passport.ts). */
  brandSlug: string;
}): FairBrandPageData | null {
  const entry = input.catalog.find((passport) => fairPassportBrandSlug(passport.brandName) === input.brandSlug);
  if (!entry) return null;

  const byId = new Map(input.models.map((model) => [model.id, model]));
  // The passport payload also carries cross-brand favorites (see `modelsById` in
  // lib/fair-server/passport-page.ts), so every reference is re-checked against this brand.
  const rows = entry.models.flatMap((reference) => {
    const model = byId.get(reference.eventModelId);
    return model && model.brandId === entry.brandId && isPackaged(model) ? [model] : [];
  });
  // Card rule: a brand without a single packaged model renders the same "nije pronađen" view as
  // a brand that does not exist, so both paths return null here.
  if (!rows.length) return null;

  return {
    eventId: input.eventId,
    eventName: input.eventName,
    brand: { name: entry.brandName, ...(entry.brandLogoUrl ? { logoUrl: entry.brandLogoUrl } : {}) },
    exhibitor: { name: rows[0].exhibitorName },
    models: rows.map((model) => ({
      id: model.id,
      slug: model.slug,
      name: model.displayName,
      priceText: model.priceText,
      // Only real photos reach the row — the model page does the same (mockup .mrow img).
      ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
    })),
    eventSlug: input.eventSlug,
    brandSlug: input.brandSlug,
    // A passport entry that lists only models which aren't packaged here still counts as being in
    // the catalog: that list is the event's own passport copy, not our claim about their stock.
    hasPassport: !!entry,
  };
}

/** Live brand page: loads the event and brand rows the same way `app/sajam/[eventSlug]/pasosi`
 * does (`loadFairPassportPage`), then projects the brand out of the passport payload. */
export async function loadFairBrandPage(publicSlug: string, brandSlug: string): Promise<FairBrandPageData | null> {
  const page = await loadFairPassportPage(publicSlug);
  if (!page) return null;
  return projectFairBrandPage({
    eventId: page.event.id,
    eventName: page.event.title,
    eventSlug: publicSlug,
    catalog: page.catalog,
    models: page.models,
    brandSlug,
  });
}
