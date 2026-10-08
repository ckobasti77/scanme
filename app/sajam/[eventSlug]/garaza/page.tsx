import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairGarage } from "@/components/fair/garage/fair-garage";
import {
  GARAGE_EVENT_SWITCH_ENABLED,
  fairGarageDefinition,
  loadFairGarageEventView,
  loadFairGarageEvents,
} from "@/lib/fair-server/garage-page";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

type RouteParams = { eventSlug: string };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.metaTitle,
  description: dict.metaDescription,
  robots: { index: false, follow: false },
};

export default async function FairGaragePage({ params }: { params: Promise<RouteParams> }) {
  const { eventSlug } = await params;
  const definition = fairGarageDefinition(eventSlug);
  if (!definition) notFound();

  // The garage renders the one event in the URL; the switch (when enabled)
  // only links to the other event's own garage URL.
  const switchEvents = GARAGE_EVENT_SWITCH_ENABLED ? await loadFairGarageEvents() : [];
  const event =
    switchEvents.find((candidate) => candidate.publicSlug === definition.publicSlug) ??
    (await loadFairGarageEventView(definition));

  return (
    <FairGarage
      routeEventSlug={eventSlug}
      event={event}
      switchEvents={switchEvents}
      dict={dict}
      shellDict={fairModelSr}
    />
  );
}
