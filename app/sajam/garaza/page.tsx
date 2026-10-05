import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FairGarage } from "@/components/fair/garage/fair-garage";
import type { FairGarageEventView } from "@/lib/fair-client/garage-view";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.metaTitle,
  description: dict.metaDescription,
  robots: { index: false, follow: false },
};

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

async function loadEventView(
  definition: (typeof EVENT_DEFINITIONS)[number],
): Promise<FairGarageEventView> {
  let event = null;
  for (const slug of fairMapEventSlugCandidates(
    definition.publicSlug,
    process.env.NODE_ENV === "development",
  )) {
    try {
      event = await fetchQuery(api.fairPublic.getEventBySlug, { slug });
    } catch {
      event = null;
    }
    if (event) break;
  }

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

export default async function FairGaragePage() {
  const events = await Promise.all(EVENT_DEFINITIONS.map(loadEventView));
  events.sort((left, right) => {
    const priority = (right.event?.garagePriority ?? 0) - (left.event?.garagePriority ?? 0);
    if (priority !== 0) return priority;
    return EVENT_DEFINITIONS.findIndex((item) => item.publicSlug === left.publicSlug) -
      EVENT_DEFINITIONS.findIndex((item) => item.publicSlug === right.publicSlug);
  });

  return <FairGarage events={events} dict={dict} />;
}
