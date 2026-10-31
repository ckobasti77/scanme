import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FAIR_MAX_MODEL_IDS_PER_READ, type FairPublicModel } from "@/lib/fair-contract";

/** One entry of the model page "Uporedi" list (photo, name, price). */
export type FairCompareOption = {
  id: string;
  slug: string;
  displayName: string;
  variant?: string;
  priceText: string;
  photoUrl?: string;
};

/**
 * Every published model of `model`'s brand and exhibitor on its event, in map
 * order, `model` itself included when it is public. The event map only lists
 * published models on active stands of active participations, so a withdrawn
 * model or exhibitor never appears; the full reads are re-checked for the same
 * event, brand and exhibitor. A failed read returns [] (no compare button).
 */
export const loadFairBrandModels = cache(async (dataEventSlug: string, model: FairPublicModel): Promise<FairPublicModel[]> => {
  try {
    const map = await fetchQuery(api.fairPublic.getEventMap, { eventSlug: dataEventSlug });
    if (!map) return [];
    const ids = new Set<string>();
    for (const stand of map.stands) {
      if (stand.participationId !== model.participationId) continue;
      for (const brand of stand.brands) {
        if (brand.brandId !== model.brandId) continue;
        for (const entry of brand.models) ids.add(entry.id);
      }
    }
    if (ids.size < 2) return [];
    const models = await fetchQuery(api.fairPublic.getModelsByIds, { ids: [...ids].slice(0, FAIR_MAX_MODEL_IDS_PER_READ) });
    return models.filter(
      (candidate) =>
        candidate.eventId === model.eventId &&
        candidate.brandId === model.brandId &&
        candidate.participationId === model.participationId,
    );
  } catch {
    return [];
  }
});

export function fairCompareOption(model: FairPublicModel): FairCompareOption {
  return {
    id: model.id,
    slug: model.slug,
    displayName: model.displayName,
    ...(model.variant ? { variant: model.variant } : {}),
    priceText: model.priceText,
    ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
  };
}

/** The other models a visitor can compare `model` with; [] hides the button. */
export async function loadFairCompareOptions(dataEventSlug: string, model: FairPublicModel): Promise<FairCompareOption[]> {
  const models = await loadFairBrandModels(dataEventSlug, model);
  if (!models.some((candidate) => candidate.id === model.id)) return [];
  return models.filter((candidate) => candidate.id !== model.id).map(fairCompareOption);
}
