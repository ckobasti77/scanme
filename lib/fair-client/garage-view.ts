import {
  FAIR_GARAGE_MAX_MODELS,
  type FairPassportCatalogEntry,
  type FairPublicEvent,
  type FairPublicModel,
  type FairSponsoredRotationView,
} from "@/lib/fair-contract";
import { fairPublicEventSlug } from "@/lib/fair-public-event";
import { addFairGarageModel, type FairGarageDocument, type FairGarageItem } from "./garage-store";

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

/** Card of a live model; also used by the same-brand comparison, which reads models outside the garage. */
export function fairLiveModelView(
  live: FairPublicModel,
  eventSlug: string,
  savedAt = 0,
): FairGarageModelView {
  return {
    id: live.id,
    eventSlug,
    modelSlug: live.slug,
    brandName: live.brandName,
    displayName: live.displayName,
    ...(live.variant ? { variant: live.variant } : {}),
    priceText: live.priceText,
    ...(live.photoUrl ? { photoUrl: live.photoUrl } : {}),
    live,
    savedAt,
  };
}

export function fairGarageModelView(
  item: FairGarageItem,
  live: FairPublicModel | undefined,
  fallbackEventSlug: string,
): FairGarageModelView | null {
  if (live) return fairLiveModelView(live, fallbackEventSlug, item.savedAt);
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
  if (ids.every((id) => id.startsWith("demo-model-"))) {
    const { FAIR_DEMO_MODELS } = await import("../fair-demo");
    return FAIR_DEMO_MODELS.filter((model) => ids.includes(model.id));
  }
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

/**
 * AMF 1 Nov 2026 — the garage email link (`?vrati=`): adds the models of the
 * code that this event’s garage does not hold yet, in the emailed order
 * (first = newest), never past FAIR_GARAGE_MAX_MODELS. Models of another event
 * are ignored. `added` 0 → nothing changed (no toast, no write).
 */
export function fairGarageRestore(
  document: FairGarageDocument,
  event: FairGarageEventView,
  models: readonly FairPublicModel[],
  now: number,
): { document: FairGarageDocument; added: number } {
  const publicSlug = fairPublicEventSlug(event.publicSlug);
  const held = new Set(fairGarageItemsForEvent(document, event).map((item) => item.modelId));
  let room = FAIR_GARAGE_MAX_MODELS - held.size;
  let next = document;
  let added = 0;
  for (const model of models) {
    if (room <= 0) break;
    if (held.has(model.id) || fairPublicEventSlug(model.eventSlug) !== publicSlug) continue;
    held.add(model.id);
    next = addFairGarageModel(next, {
      eventId: model.eventId,
      modelId: model.id,
      savedAt: now - added,
      lastKnown: { eventSlug: publicSlug, modelSlug: model.slug, brandName: model.brandName, displayName: model.displayName, priceText: model.priceText, ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}) },
    });
    added += 1;
    room -= 1;
  }
  return { document: next, added };
}
