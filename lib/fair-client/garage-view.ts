import type {
  FairPassportCatalogEntry,
  FairPublicEvent,
  FairPublicModel,
  FairSponsoredRotationView,
} from "@/lib/fair-contract";
import { fairPublicEventSlug } from "@/lib/fair-public-event";
import type { FairGarageDocument, FairGarageItem } from "./garage-store";

export type FairGarageEventView = {
  publicSlug: string;
  dataSlug: string;
  event: FairPublicEvent | null;
  fallbackId: string;
  fallbackTitle: string;
  fallbackDates: string;
  passportCatalog: FairPassportCatalogEntry[];
  sponsoredRotation: FairSponsoredRotationView | null;
};

export type FairGarageModelView = {
  id: string;
  eventSlug: string;
  modelSlug: string;
  brandName: string;
  displayName: string;
  variant?: string;
  priceText: string;
  photoUrl?: string;
  live?: FairPublicModel;
  savedAt: number;
};

export function fairGarageEventId(event: FairGarageEventView): string {
  return event.event?.id ?? event.fallbackId;
}

export function fairGarageEventTitle(event: FairGarageEventView): string {
  return event.event?.title.replace(/^TEST\s+/i, "") ?? event.fallbackTitle;
}

// Models can sit under the Convex event id, under the public slug (fallback id)
// or under an older event record of the same fair; `lastKnown.eventSlug` ties
// the latter back to the fair. The garage list and the header count must use
// this same matching, otherwise the badge disagrees with the list.
function itemsForEventKeys(
  document: FairGarageDocument,
  eventIds: string[],
  eventSlugs: string[],
): FairGarageItem[] {
  const ids = new Set(eventIds);
  const slugs = new Set(eventSlugs.map(fairPublicEventSlug));
  const seen = new Set<string>();
  const result: FairGarageItem[] = [];

  for (const [eventId, items] of Object.entries(document.events)) {
    for (const item of items) {
      const matches =
        ids.has(eventId) ||
        (item.lastKnown !== undefined && slugs.has(fairPublicEventSlug(item.lastKnown.eventSlug)));
      if (!matches || seen.has(item.modelId)) continue;
      seen.add(item.modelId);
      result.push(item);
    }
  }
  return result.sort((a, b) => b.savedAt - a.savedAt);
}

export function fairGarageItemsForEvent(
  document: FairGarageDocument,
  event: FairGarageEventView,
): FairGarageItem[] {
  return itemsForEventKeys(
    document,
    [fairGarageEventId(event), event.fallbackId],
    [event.publicSlug, event.dataSlug],
  );
}

export function fairGarageEventCount(
  document: FairGarageDocument,
  key: { eventId: string; eventSlug: string },
): number {
  const publicSlug = fairPublicEventSlug(key.eventSlug);
  return itemsForEventKeys(document, [key.eventId, publicSlug], [publicSlug]).length;
}

export function fairGarageModelView(
  item: FairGarageItem,
  live: FairPublicModel | undefined,
  fallbackEventSlug: string,
): FairGarageModelView | null {
  if (live) {
    return {
      id: live.id,
      eventSlug: fallbackEventSlug,
      modelSlug: live.slug,
      brandName: live.brandName,
      displayName: live.displayName,
      ...(live.variant ? { variant: live.variant } : {}),
      priceText: live.priceText,
      ...(live.photoUrl ? { photoUrl: live.photoUrl } : {}),
      live,
      savedAt: item.savedAt,
    };
  }
  if (!item.lastKnown) return null;
  return {
    id: item.modelId,
    eventSlug: fallbackEventSlug,
    modelSlug: item.lastKnown.modelSlug,
    brandName: item.lastKnown.brandName,
    displayName: item.lastKnown.displayName,
    priceText: item.lastKnown.priceText,
    ...(item.lastKnown.photoUrl ? { photoUrl: item.lastKnown.photoUrl } : {}),
    savedAt: item.savedAt,
  };
}

export async function fetchFairGarageModels(ids: string[]): Promise<FairPublicModel[]> {
  if (ids.length === 0) return [];
  const response = await fetch("/api/fair/garage-models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
    cache: "no-store",
  });
  const body = (await response.json()) as
    | { ok: true; value: FairPublicModel[] }
    | { ok: false; code: string };
  if (!response.ok || !body.ok) throw new Error(body.ok ? "SERVICE_UNAVAILABLE" : body.code);
  return body.value;
}
