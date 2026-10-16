import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairEventShell } from "@/components/fair/event-shell";
import { FairPaperTexture } from "@/components/fair/fair-paper-texture";
import { FairEventMapView } from "@/components/fair/map/fair-event-map";
import { MapSkeleton } from "@/app/sajam/[eventSlug]/_mapa/map-skeleton";
import { MapUnavailable } from "@/app/sajam/[eventSlug]/_mapa/map-unavailable";
import {
  AUTO_MOTO_FEST_MAP_PREVIEW_SLUG,
  buildAutoMotoFestMapPreview,
  buildFairMapPreview,
  FAIR_MAP_PREVIEW_SLUG,
} from "@/lib/fair-map/preview-fixture";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import "../../sajam/fair-event.css";

// N4 — DEV preview of the map v2 with fixture data (real exhibitor list and
// geometry, TEST models / rotation / passport), no Convex. The same query
// parameters as the public map choose the state: ?stand=hala-2, ?zona=ispred,
// ?prikaz=ekran. Never in production.

export const metadata: Metadata = {
  title: dict.previewTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FairMapPreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const display = first(query.prikaz) === "ekran";
  const electromobility = first(query.dogadjaj) === "elektromobilnost-2026";
  const slug = electromobility ? FAIR_MAP_PREVIEW_SLUG : AUTO_MOTO_FEST_MAP_PREVIEW_SLUG;
  const eventCode = electromobility ? "elektromobilnost-2026" : "auto-moto-fest-2026";
  const preview = electromobility ? buildFairMapPreview() : buildAutoMotoFestMapPreview();
  const loading = first(query.stanje) === "ucitavanje";
  const failed = first(query.stanje) === "greska";
  const view = first(query.stanje) === "prazno"
    ? { zones: preview.view.zones.map((zone) => ({ ...zone, stands: [], locations: [] })), unplaced: [], withoutLocation: [] }
    : preview.view;
  return (
    <>
      <div className={`fair-event ${fairEventThemeClass(slug)}`} data-reveal="off">
        <FairEventShell eventId="fixture-event" eventSlug={slug} eventTitle={dict.umbrellaTitle} eventName={dict.events[eventCode]} dict={fairModelSr} />
        <main>
          <h1 style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{dict.previewTitle}</h1>
          {display ? null : (
            <p title={dict.previewNotice} style={{ maxWidth: 1440, margin: "6px auto 0", padding: "0 16px", color: "var(--fair-ink-muted)", fontSize: 11, lineHeight: "16px" }}>{dict.previewTestNotice}</p>
          )}
          {loading ? (
            <MapSkeleton autoMoto={!electromobility} />
          ) : failed ? (
            <MapUnavailable eventSlug={slug} retryHref={`/dev/sajam-mapa?dogadjaj=${eventCode}`} />
          ) : (
            <FairEventMapView
              eventSlug={slug}
              view={view}
              rotation={first(query.stanje) === "prazno" ? null : preview.rotation}
              display={display}
              initialLink={{ zona: query.zona, stand: query.stand }}
              initialMode={first(query.pogled) === "spisak" ? "directory" : "map"}
              passportProgress={preview.passportProgress}
            />
          )}
        </main>
      </div>
      <FairPaperTexture />
    </>
  );
}
