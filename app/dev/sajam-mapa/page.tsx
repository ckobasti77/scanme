import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairEventShell } from "@/components/fair/event-shell";
import { FairEventMapView } from "@/components/fair/map/fair-event-map";
import { buildFairMapPreview, FAIR_MAP_PREVIEW_SLUG } from "@/lib/fair-map/preview-fixture";
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

export default async function FairMapPreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const display = (Array.isArray(query.prikaz) ? query.prikaz[0] : query.prikaz) === "ekran";
  const preview = buildFairMapPreview();
  return (
    <div className="fair-event" data-reveal="off">
      <FairEventShell eventId="fixture-event" eventSlug={FAIR_MAP_PREVIEW_SLUG} eventTitle={dict.umbrellaTitle} eventName={dict.events["elektromobilnost-2026"]} dict={fairModelSr} />
      <main>
        <h1 style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{dict.previewTitle}</h1>
        {display ? null : (
          <p style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 16px", color: "var(--fair-ink-muted)", fontSize: 14, lineHeight: "20px" }}>{dict.previewNotice}</p>
        )}
        <FairEventMapView
          eventSlug={FAIR_MAP_PREVIEW_SLUG}
          view={preview.view}
          rotation={preview.rotation}
          display={display}
          initialLink={{ zona: query.zona, stand: query.stand }}
          passportProgress={preview.passportProgress}
        />
      </main>
    </div>
  );
}
