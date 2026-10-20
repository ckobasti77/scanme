import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense, cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { FairAdminTools } from "@/components/fair/admin/fair-admin-tools";
import { FairEventShell } from "@/components/fair/event-shell";
import { AmfTopographicMap } from "@/components/fair/map/amf-topographic-map";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { AUTO_MOTO_FEST_2026_MAP } from "@/lib/fair-map/auto-moto-fest-2026";
import { buildFairMapView } from "@/lib/fair-map/view";
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
const AUTO_MOTO_FEST_STARTS_AT = Date.parse("2026-10-30T10:00:00+01:00");
const amfPreviewMapView = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [], []);

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
  if (!event) {
    if (eventSlug === "auto-moto-fest-2026") {
      return {
        title: fmt(dict.metaTitle, { event: dict.events["auto-moto-fest-2026"] }),
        description: fmt(dict.metaDescription, { event: dict.events["auto-moto-fest-2026"] }),
        robots,
      };
    }
    return { title: dict.notFoundTitle, robots };
  }
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
  let event = null;
  let fetchFailed = false;
  try {
    event = await getEvent(eventSlug);
  } catch {
    fetchFailed = true;
  }

  const startsAt = event?.startsAt ?? AUTO_MOTO_FEST_STARTS_AT;
  if (eventSlug === "auto-moto-fest-2026" && Date.now() < startsAt) {
    return (
      <div
        className={`fair-event ${fairEventThemeClass(eventSlug)}`}
        data-reveal="off"
        style={{ position: "relative", minHeight: "100dvh", overflow: "hidden" }}
      >
        <div
          aria-hidden="true"
          inert
          style={{
            position: "fixed",
            inset: 0,
            filter: "blur(8px) saturate(0.92)",
            transform: "scale(1.03)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <AmfTopographicMap
            eventSlug="auto-moto-fest-2026"
            view={amfPreviewMapView}
            rotation={null}
            display={true}
          />
        </div>
        <main
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "rgb(244 239 230 / 0.56)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <section
            aria-labelledby="amf-upcoming-title"
            style={{
              width: "min(100%, 440px)",
              padding: "32px 26px 28px",
              borderRadius: "24px",
              border: "1px solid rgb(37 34 30 / 0.14)",
              background: "rgb(251 248 242 / 0.94)",
              boxShadow: "0 24px 64px rgb(37 34 30 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.8)",
              textAlign: "center",
              color: "var(--fair-ink, #25221e)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                fontWeight: 760,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fair-accent, #e2602a)",
              }}
            >
              {dict.upcomingEyebrow}
            </p>
            <h1
              id="amf-upcoming-title"
              style={{
                margin: "10px 0 0",
                fontSize: "clamp(30px, 6vw, 40px)",
                fontWeight: 820,
                letterSpacing: "-0.04em",
                lineHeight: 1.04,
              }}
            >
              {dict.upcomingTitle}
            </h1>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "16px",
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgb(226 96 42 / 0.32)",
                background: "rgb(226 96 42 / 0.11)",
                fontSize: "13px",
                fontWeight: 740,
              }}
            >
              <CalendarDays aria-hidden="true" style={{ width: 16, height: 16, color: "var(--fair-accent, #e2602a)" }} />
              <span>{dict.upcomingDates}</span>
            </div>
            <p
              style={{
                margin: "14px auto 0",
                maxWidth: "340px",
                fontSize: "14px",
                lineHeight: 1.5,
                color: "var(--fair-ink-muted, #675f54)",
              }}
            >
              {dict.upcomingBody}
            </p>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                minHeight: "44px",
                marginTop: "22px",
                padding: "0 18px",
                borderRadius: "12px",
                background: "var(--fair-ink, #25221e)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 740,
                textDecoration: "none",
              }}
            >
              <ArrowLeft aria-hidden="true" style={{ width: 16, height: 16 }} />
              {dict.upcomingBackHome}
            </Link>
          </section>
        </main>
      </div>
    );
  }

  if (fetchFailed) {
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
        <Suspense fallback={<MapSkeleton autoMoto={event.code.replace(/^test-/, "") === "auto-moto-fest-2026"} />}>
          <MapSection eventSlug={event.slug} eventCode={event.code} display={display} link={{ zona: query.zona, stand: query.stand }} />
        </Suspense>
      </main>
    </div>
  );
}
