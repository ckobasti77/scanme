import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense, cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FairAdminTools } from "@/components/fair/admin/fair-admin-tools";
import { FairEventShell } from "@/components/fair/event-shell";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { MapSection } from "./_mapa/map-section";
import { MapSkeleton } from "./_mapa/map-skeleton";
import { MapUnavailable } from "./_mapa/map-unavailable";
import { FAIR_PUBLIC_MAP_ENABLED } from "@/lib/fair-contract";

// M1 — map / event home. Kodeks's shell and tokens are used as-is; the map
// content streams under the shell. `?prikaz=ekran` forces the large-display
// composition (same data, no touch controls) on any width. N4: `?zona=` and
// `?stand=<mapLocationId>` open a zone and a stand (independent of `prikaz`).

type RouteParams = { eventSlug: string };
type RouteSearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

// `next dev` only: a real slug without a real event falls back to the DEV TEST
// event `test-<slug>` (lib/fair-map fairMapEventSlugCandidates). The page then
// reads everything (catalog, passport, links) by the resolved event's own slug.
const DEV_TEST_FALLBACK = process.env.NODE_ENV === "development";

const getEvent = cache(async (slug: string) => {
  for (const candidate of fairMapEventSlugCandidates(slug, DEV_TEST_FALLBACK)) {
    const event = await fetchQuery(api.fairPublic.getEventBySlug, { slug: candidate });
    if (event) return event;
  }
  return null;
});

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { eventSlug } = await params;
  const robots = { index: false, follow: false };
  const event = await getEvent(eventSlug).catch(() => null);
  if (!event) return { title: dict.notFoundTitle, robots };
  return {
    title: fmt(dict.metaTitle, { event: event.title }),
    description: fmt(dict.metaDescription, { event: event.title }),
    robots,
  };
}

export default async function FairEventMapPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  // While the map is hidden (FAIR_PUBLIC_MAP_ENABLED false) its URL, and the entrance panel QR, open the garage.
  if (!FAIR_PUBLIC_MAP_ENABLED) redirect(`/sajam/${eventSlug}/garaza`);
  let event;
  try {
    event = await getEvent(eventSlug);
  } catch {
    return (
      <div className={`fair-event ${fairEventThemeClass(eventSlug)}`} data-reveal="off">
        <main>
          <MapUnavailable eventSlug={eventSlug} />
        </main>
      </div>
    );
  }
  if (!event) notFound();
  const display = (Array.isArray(query.prikaz) ? query.prikaz[0] : query.prikaz) === "ekran";

  return (
    <div className={`fair-event ${fairEventThemeClass(eventSlug)}`} data-reveal="off">
      <FairEventShell eventId={event.id} eventSlug={eventSlug} eventTitle={dict.umbrellaTitle} eventName={event.title} dict={fairModelSr} current="map" adminTools={<FairAdminTools event={{ id: event.id, slug: eventSlug, dataSlug: event.slug, title: event.title }} />} />
      <main>
        <h1 style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          {fmt(dict.metaTitle, { event: event.title })}
        </h1>
        <Suspense fallback={<MapSkeleton />}>
          <MapSection eventSlug={event.slug} eventCode={event.code} display={display} link={{ zona: query.zona, stand: query.stand }} />
        </Suspense>
      </main>
    </div>
  );
}
