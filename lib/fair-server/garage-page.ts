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
