import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FairModelPage } from "@/components/fair/fair-model-page";
import {
  FAIR_REAL_MODEL_INTERACTIONS,
  fairModelPageFromFixture,
  fairModelPageFromPublic,
  fairOpenLeadForm,
} from "@/components/fair/model-view";
import type { FairLeadKind } from "@/lib/fair-contract";
import {
  readFairModelFixture,
  type FairFixtureMode,
  type FairPhotoPresentation,
} from "@/lib/fair-client/model-fixtures";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fmt } from "@/lib/i18n/format";

// N6 (F3) — the page a QR sticker opens (/r/[cardCode] → 302 here). Real data
// from fairPublic.getModelBySlug on the server; capabilities only from that
// projection, never from the URL. Lead buttons only for a form the server
// reports `open` (fairPublic.getLeadForm). Viewing writes nothing: no scan, no
// direct_view (there is no QR entry marker yet, so a QR landing could not be
// told apart — jovan-status/N6.md). `next dev` only: the DEV TEST event
// `test-<slug>` as a fallback (as the map) and the Audi design fixture.

type RouteParams = {
  eventSlug: string;
  modelSlug: string;
};

type RouteSearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

const DEV = process.env.NODE_ENV === "development";
const ROBOTS = { index: false, follow: false } as const;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fixtureMode(value: string | undefined): FairFixtureMode {
  return value === "free" || value === "starter" || value === "advanced"
    ? value
    : "advanced";
}

function photoPresentation(value: string | undefined): FairPhotoPresentation {
  return value === "right" || value === "bottom" ? value : "left";
}

const getPublicModel = cache(async (eventSlug: string, modelSlug: string) => {
  for (const candidate of fairMapEventSlugCandidates(eventSlug, DEV)) {
    const model = await fetchQuery(api.fairPublic.getModelBySlug, { eventSlug: candidate, modelSlug });
    if (model) return model;
  }
  return null;
});

/** Only an `open` form becomes a button; a failed read hides it (never a broken button). */
async function readOpenLeadForm(eventModelId: string, kind: FairLeadKind, offered: boolean) {
  if (!offered) return null;
  try {
    return fairOpenLeadForm(await fetchQuery(api.fairPublic.getLeadForm, { eventModelId, kind }));
  } catch {
    return null;
  }
}

function devFixture(eventSlug: string, modelSlug: string, query: RouteSearchParams = {}) {
  if (!DEV) return null;
  const selection = {
    mode: fixtureMode(scalar(query.mode)),
    withPhoto: scalar(query.photo) !== "0",
    alignment: photoPresentation(scalar(query.align)),
  };
  const fixture = readFairModelFixture({
    eventSlug,
    modelSlug,
    mode: selection.mode,
    withPhoto: selection.withPhoto,
    photoPresentation: selection.alignment,
  });
  return fixture ? { model: fairModelPageFromFixture(fixture), selection } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { eventSlug, modelSlug } = await params;
  let title: string = fairModelSr.notFoundTitle;
  let description: string | undefined;
  try {
    const model = await getPublicModel(eventSlug, modelSlug);
    const view = model ? fairModelPageFromPublic(model, { umbrellaTitle: fairModelSr.eventUmbrellaTitle }) : devFixture(eventSlug, modelSlug)?.model;
    if (view) {
      title = fmt(fairModelSr.metaTitle, { model: view.displayName, event: view.eventName });
      description = fmt(fairModelSr.metaDescription, { model: view.displayName });
    }
  } catch {
    title = fairModelSr.unavailableTitle;
  }
  return { title, ...(description ? { description } : {}), robots: ROBOTS };
}

function ModelUnavailable({ routePath }: { routePath: string }) {
  return (
    <main className="fair-event fair-not-found" data-reveal="off">
      <div>
        <h1>{fairModelSr.unavailableTitle}</h1>
        <p>{fairModelSr.unavailableBody}</p>
        <Link href={routePath} prefetch={false}>
          {fairModelSr.unavailableRetry}
        </Link>
      </div>
    </main>
  );
}

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ eventSlug, modelSlug }, query] = await Promise.all([params, searchParams]);
  const routePath = `/sajam/${eventSlug}/model/${modelSlug}`;

  let model: Awaited<ReturnType<typeof getPublicModel>>;
  try {
    model = await getPublicModel(eventSlug, modelSlug);
  } catch {
    if (!devFixture(eventSlug, modelSlug)) return <ModelUnavailable routePath={routePath} />;
    model = null;
  }

  if (!model) {
    const demo = devFixture(eventSlug, modelSlug, query);
    if (!demo) notFound();
    return (
      <FairModelPage
        model={demo.model}
        dict={fairModelSr}
        routePath={routePath}
        leadForms={{ interest: null, testDrive: null }}
        interactions={{ rating: true, audience: true }}
        fixture={{ selection: demo.selection, showDevPanel: scalar(query.dev) === "1" }}
      />
    );
  }

  const [interest, testDrive] = await Promise.all([
    readOpenLeadForm(model.id, "interest", model.capabilities.canSubmitInterest),
    readOpenLeadForm(model.id, "test_drive", model.capabilities.canRequestTestDrive),
  ]);

  return (
    <FairModelPage
      model={fairModelPageFromPublic(model, { umbrellaTitle: fairModelSr.eventUmbrellaTitle })}
      dict={fairModelSr}
      routePath={`/sajam/${model.eventSlug}/model/${model.slug}`}
      leadForms={{ interest, testDrive }}
      interactions={FAIR_REAL_MODEL_INTERACTIONS}
    />
  );
}
