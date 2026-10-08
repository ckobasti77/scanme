import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairGarage } from "@/components/fair/garage/fair-garage";
import {
  GARAGE_EVENT_SWITCH_ENABLED,
  fairGarageDefinition,
  loadFairGarageEventView,
  loadFairGarageEvents,
  withDevSponsoredRotation,
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

export default async function FairGaragePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const definition = fairGarageDefinition(eventSlug);
  if (!definition) notFound();

  // The garage renders the one event in the URL; the switch (when enabled)
  // only links to the other event's own garage URL.
  const switchEvents = GARAGE_EVENT_SWITCH_ENABLED ? await loadFairGarageEvents() : [];
  const loaded =
    switchEvents.find((candidate) => candidate.publicSlug === definition.publicSlug) ??
    (await loadFairGarageEventView(definition));
  // `next dev` only: `?sponzor=1` previews the sponsored dock without a DEV snapshot.
  const event = await withDevSponsoredRotation(loaded, query.sponzor === "1");

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
