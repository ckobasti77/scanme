import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { FairGarageEventView } from "@/lib/fair-client/garage-view";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { fairNavigationEvent, fairPublicEventSlug } from "@/lib/fair-public-event";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";

const EVENT_DEFINITIONS = [
  {
    publicSlug: "elektromobilnost-2026",
    fallbackId: "elektromobilnost-2026",
    fallbackTitle: dict.electromobilityTitle,
    fallbackDates: dict.electromobilityDates,
  },
  {
    publicSlug: "auto-moto-fest-2026",
    fallbackId: "auto-moto-fest-2026",
    fallbackTitle: dict.autoMotoTitle,
    fallbackDates: dict.autoMotoDates,
  },
] as const;

type FairGarageEventDefinition = (typeof EVENT_DEFINITIONS)[number];

// Drugi sajam ostaje spreman u kodu, ali se u javnoj garaži uključuje tek
// kada posetioci zaista mogu da koriste obe garaže.
export const GARAGE_EVENT_SWITCH_ENABLED = false;

export function fairGarageDefinition(eventSlug: string): FairGarageEventDefinition | null {
  const publicSlug = fairPublicEventSlug(eventSlug);
  return EVENT_DEFINITIONS.find((definition) => definition.publicSlug === publicSlug) ?? null;
}

async function loadEvent(publicSlug: string) {
  for (const slug of fairMapEventSlugCandidates(
    publicSlug,
    process.env.NODE_ENV === "development",
  )) {
    try {
      const event = await fetchQuery(api.fairPublic.getEventBySlug, { slug });
      if (event) return event;
    } catch {
      // Try the next candidate; a missing event falls back to the static definition.
    }
  }
  return null;
}

function visibleDefinitions() {
  return GARAGE_EVENT_SWITCH_ENABLED
    ? EVENT_DEFINITIONS
    : EVENT_DEFINITIONS.filter((event) => event.publicSlug === "elektromobilnost-2026");
}

function byEventOrder(
  left: { publicSlug: string; event: { startsAt: number } | null },
  right: { publicSlug: string; event: { startsAt: number } | null },
) {
  const leftStart = left.event?.startsAt;
  const rightStart = right.event?.startsAt;
  if (leftStart !== undefined && rightStart !== undefined && leftStart !== rightStart) {
    return leftStart - rightStart;
  }
  return EVENT_DEFINITIONS.findIndex((item) => item.publicSlug === left.publicSlug) -
    EVENT_DEFINITIONS.findIndex((item) => item.publicSlug === right.publicSlug);
}

/** Event header data only; pages that do not show the passport or sponsored strip. */
export async function loadFairGarageEventSummary(
  definition: FairGarageEventDefinition,
): Promise<FairGarageEventView> {
  const event = await loadEvent(definition.publicSlug);
  return {
    ...definition,
    dataSlug: event?.slug ?? definition.publicSlug,
    event,
    passportCatalog: [],
    sponsoredRotation: null,
  };
}

export async function loadFairGarageEventView(
  definition: FairGarageEventDefinition,
): Promise<FairGarageEventView> {
  const event = await loadEvent(definition.publicSlug);

  if (!event) {
    return {
      ...definition,
      dataSlug: definition.publicSlug,
      event: null,
      passportCatalog: [],
      sponsoredRotation: null,
    };
  }

  const [passport, sponsoredRotation] = await Promise.all([
    fetchQuery(api.fairPublic.getPassportCatalog, { eventSlug: event.slug }).catch(
      () => null,
    ),
    fetchQuery(api.fairPublic.getSponsoredGarageRotation, {
      eventSlug: event.slug,
    }).catch(() => null),
  ]);

  return {
    ...definition,
    dataSlug: event.slug,
    event,
    passportCatalog: passport?.catalog ?? [],
    sponsoredRotation,
  };
}

/** Events a visitor can switch between in the garage, in event order. */
export async function loadFairGarageEvents(): Promise<FairGarageEventView[]> {
  const events = await Promise.all(visibleDefinitions().map(loadFairGarageEventView));
  return events.sort(byEventOrder);
}

/** Public slug of the event an event-less fair URL redirects to. */
export async function loadFairActiveEventSlug(now = Date.now()): Promise<string> {
  const events = await Promise.all(
    visibleDefinitions().map(async (definition) => ({
      publicSlug: definition.publicSlug,
      event: await loadEvent(definition.publicSlug),
    })),
  );
  return fairNavigationEvent(events.sort(byEventOrder), now)?.publicSlug ?? "elektromobilnost-2026";
}

/** DEV design check only: published models shown as the garage recommendation when no snapshot exists. */
const DEV_SPONSORED_SLUGS = ["jmev-ewind", "jmev-yi", "mazda-cx-60", "foton-etunland"];

/**
 * `next dev` + `?sponzor=1` only (never in a production build): when DEV has no
 * published sponsored snapshot, fake a rotation from real published models so
 * the sponsored dock can be reviewed. Server contracts are untouched.
 */
export async function withDevSponsoredRotation(view: FairGarageEventView, requested: boolean): Promise<FairGarageEventView> {
  if (process.env.NODE_ENV !== "development" || !requested || view.sponsoredRotation || !view.event) return view;
  const event = view.event;
  const models = await Promise.all(
    DEV_SPONSORED_SLUGS.map((modelSlug) =>
      fetchQuery(api.fairPublic.getModelBySlug, { eventSlug: event.slug, modelSlug }).catch(() => null),
    ),
  );
  const items = models.flatMap((model, order) =>
    model
      ? [
          {
            eventModelId: model.id,
            eventId: model.eventId,
            eventSlug: model.eventSlug,
            slug: model.slug,
            brandId: model.brandId,
            brandName: model.brandName,
            displayName: model.displayName,
            ...(model.variant ? { variant: model.variant } : {}),
            priceText: model.priceText,
            visual: model.photoUrl ? ("photo" as const) : ("event_placeholder" as const),
            ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
            standMapLocationId: model.standMapLocationId,
            order,
          },
        ]
      : [],
  );
  if (items.length === 0) return view;
  return {
    ...view,
    sponsoredRotation: {
      surface: "garage",
      eventId: event.id,
      snapshotId: "dev",
      version: 0,
      dayKey: "dev",
      seed: "dev",
      epochMs: Date.UTC(2026, 0, 1),
      intervalMs: 12_000,
      items,
    },
  };
}
