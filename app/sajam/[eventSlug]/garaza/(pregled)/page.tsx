import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FairAdminTools } from "@/components/fair/admin/fair-admin-tools";
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
import { AMF_PUBLIC_GATE_OPENS_AT, FAIR_SHARE_CODE_PATTERN } from "@/lib/fair-contract";
import { readFairSharedCollection } from "@/lib/fair-server/shared-collection";

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
  // eslint-disable-next-line react-hooks/purity -- async server component: the lock is decided once per request
  if (eventSlug === "auto-moto-fest-2026" && Date.now() < AMF_PUBLIC_GATE_OPENS_AT) {
    redirect(`/sajam/${eventSlug}`);
  }

  // The garage renders the one event in the URL; the switch (when enabled)
  // only links to the other event's own garage URL.
  const switchEvents = GARAGE_EVENT_SWITCH_ENABLED ? await loadFairGarageEvents() : [];
  const loaded =
    switchEvents.find((candidate) => candidate.publicSlug === definition.publicSlug) ??
    (await loadFairGarageEventView(definition));
  // `next dev` only: `?sponzor=1` previews the sponsored dock without a DEV snapshot.
  const event = await withDevSponsoredRotation(loaded, query.sponzor === "1");
  // `?vrati=` (the garage email): the models behind the code; an unknown or expired code restores nothing.
  const restoreCode = typeof query.vrati === "string" ? query.vrati : null;
  const restoreModels = restoreCode === null
    ? undefined
    : FAIR_SHARE_CODE_PATTERN.test(restoreCode) ? (await readFairSharedCollection(restoreCode))?.models ?? [] : [];

  return (
    <FairGarage
      routeEventSlug={eventSlug}
      event={event}
      switchEvents={switchEvents}
      dict={dict}
      shellDict={fairModelSr}
      restoreModels={restoreModels}
      adminTools={event.event ? <FairAdminTools event={{ id: event.event.id, slug: eventSlug, dataSlug: event.dataSlug, title: event.event.title }} /> : null}
    />
  );
}
