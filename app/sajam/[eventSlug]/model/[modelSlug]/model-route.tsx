import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FairAdminTools } from "@/components/fair/admin/fair-admin-tools";
import { FairModelPage } from "@/components/fair/fair-model-page";
import {
  fairPublicModelToFixture,
  readFairModelFixture,
  type FairFixtureMode,
  type FairPhotoPresentation,
} from "@/lib/fair-client/model-fixtures";
import {
  fairModelStand,
  loadFairAudienceTeaser,
  loadFairModelInteractions,
  loadFairModelPage,
} from "@/lib/fair-server/model-page";
import { fairAdminPreview, fairPreviewCapabilities } from "@/lib/fair-server/admin-session";
import type { FairModelCapabilities } from "@/lib/fair-contract";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fmt } from "@/lib/i18n/format";

// Shared by the model route and its `/anketa` deep link (MASTER §14): both
// render the same model page; the deep link only opens the survey sheet.

export type FairModelRouteParams = {
  eventSlug: string;
  modelSlug: string;
};

export type FairModelRouteSearchParams = Record<string, string | string[] | undefined>;

async function requestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() || requestHeaders.get("host");
  if (!host) return undefined;
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fixtureMode(value: string | undefined): FairFixtureMode {
  return value === "free" || value === "starter" || value === "advanced"
    ? value
    : "advanced";
}

function capabilityTier(capabilities: FairModelCapabilities) {
  return capabilities.ratingMode === "dimensions" ? "advanced" : capabilities.ratingMode === "overall" ? "starter" : "free";
}

function photoPresentation(value: string | undefined): FairPhotoPresentation {
  return value === "right" || value === "bottom" ? value : "left";
}

export async function fairModelMetadata(params: Promise<FairModelRouteParams>): Promise<Metadata> {
  const { eventSlug, modelSlug } = await params;
  const live = await loadFairModelPage(eventSlug, modelSlug);
  const model = live
    ? fairPublicModelToFixture({
        model: live.model,
        publicEventSlug: eventSlug,
        eventName: live.event.title,
        withPhoto: true,
        photoPresentation: "left",
      }).model
    : readFairModelFixture({
        eventSlug,
        modelSlug,
        mode: "advanced",
        withPhoto: true,
        photoPresentation: "left",
      });

  if (!model) return { title: fairModelSr.notFoundTitle };
  return {
    title: fmt(fairModelSr.metaTitle, {
      model: model.displayName,
      event: model.eventName,
    }),
    description: fmt(fairModelSr.metaDescription, { model: model.displayName }),
    robots: { index: false, follow: false },
  };
}

export async function FairModelRoute({
  params,
  searchParams,
  openSurvey,
}: {
  params: Promise<FairModelRouteParams>;
  searchParams: Promise<FairModelRouteSearchParams>;
  openSurvey: boolean;
}) {
  const [{ eventSlug, modelSlug }, query] = await Promise.all([params, searchParams]);
  const requestedSelection = {
    mode: fixtureMode(scalar(query.mode)),
    withPhoto: scalar(query.photo) !== "0",
    alignment: photoPresentation(scalar(query.align)),
  };
  const live = await loadFairModelPage(eventSlug, modelSlug);
  // Admin "Pregled kao paket" (JOVAN-DELTA 2026-10-09): display only, read
  // only after the server confirmed an admin session; actions stay real.
  const preview = live ? await fairAdminPreview() : null;
  const adapted = live
    ? fairPublicModelToFixture({
        model: preview ? { ...live.model, capabilities: fairPreviewCapabilities(preview, live.model.capabilities) } : live.model,
        publicEventSlug: eventSlug,
        eventName: live.event.title,
        withPhoto: requestedSelection.withPhoto,
        photoPresentation: requestedSelection.alignment,
        siteOrigin: await requestOrigin(),
      })
    : null;
  const selection = adapted
    ? { ...requestedSelection, mode: adapted.mode }
    : requestedSelection;
  const model = adapted?.model ?? readFairModelFixture({
    eventSlug,
    modelSlug,
    mode: selection.mode,
    withPhoto: selection.withPhoto,
    photoPresentation: selection.alignment,
  });

  if (!model) notFound();

  const [interactions, audienceTeaser] = live
    ? await Promise.all([
        loadFairModelInteractions(live.model.id, live.model.capabilities),
        live.model.capabilities.hasAudienceQuestions ? loadFairAudienceTeaser(live.model.id) : null,
      ])
    : [null, null];
  const stand = live ? fairModelStand(live.event, live.model, eventSlug) : null;
  const routePath = `/sajam/${eventSlug}/model/${modelSlug}`;
  return (
    <FairModelPage
      model={model}
      dict={fairModelSr}
      routePath={routePath}
      selection={selection}
      showDevPanel={process.env.NODE_ENV === "development" && scalar(query.dev) === "1"}
      interactions={interactions}
      stand={stand}
      audienceTeaser={audienceTeaser}
      openSurvey={openSurvey}
      adminTools={live ? (
        <FairAdminTools
          event={{ id: live.event.id, slug: eventSlug, dataSlug: live.event.slug, title: live.event.title }}
          model={{
            id: live.model.id,
            slug: live.model.slug,
            name: model.displayName,
            brandName: live.model.brandName,
            participationId: live.model.participationId,
            tier: capabilityTier(live.model.capabilities),
          }}
        />
      ) : null}
    />
  );
}
