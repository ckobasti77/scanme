import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AudienceFlow } from "@/components/fair/audience-flow";
import {
  readFairAudienceFixture,
  readFairModelFixture,
  type FairAudienceQuestionCountFixture,
  type FairAudienceResponseFixture,
  type FairAudienceThresholdFixture,
  type FairFixtureMode,
  type FairPhotoPresentation,
} from "@/lib/fair-client/model-fixtures";
import { fmt } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

type RouteParams = {
  eventSlug: string;
  modelSlug: string;
};

type RouteSearchParams = Record<string, string | string[] | undefined>;

const DEV = process.env.NODE_ENV === "development";

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fixtureMode(value: string | undefined): FairFixtureMode {
  return value === "free" || value === "starter" || value === "advanced"
    ? value
    : "advanced";
}

function threshold(value: string | undefined): FairAudienceThresholdFixture {
  return value === "below" ? "below" : "public";
}

function response(value: string | undefined): FairAudienceResponseFixture {
  return value === "error" ? "error" : "success";
}

function questionCount(
  value: string | undefined,
  mode: FairFixtureMode,
): FairAudienceQuestionCountFixture {
  if (value === "1") return 1;
  if (value === "5") return 5;
  return mode === "starter" ? 1 : 5;
}

function photoPresentation(value: string | undefined): FairPhotoPresentation {
  return value === "right" || value === "bottom" ? value : "left";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { eventSlug, modelSlug } = await params;
  const model = DEV
    ? readFairModelFixture({
        eventSlug,
        modelSlug,
        mode: "advanced",
        withPhoto: true,
        photoPresentation: "left",
      })
    : null;
  if (!model) return { title: fairModelSr.notFoundTitle, robots: { index: false, follow: false } };
  return {
    title: fmt(fairModelSr.audienceMetaTitle, { model: model.displayName }),
    description: fmt(fairModelSr.audienceMetaDescription, { model: model.displayName }),
    robots: { index: false, follow: false },
  };
}

export default async function AudiencePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearchParams>;
}) {
  // N6: Glas publike still runs on the design fixture (localStorage votes), so
  // it exists only under `next dev`; a real model never offers it (jovan-status/N6.md).
  if (!DEV) notFound();
  const [{ eventSlug, modelSlug }, query] = await Promise.all([params, searchParams]);
  const mode = fixtureMode(scalar(query.mode));
  const withPhoto = scalar(query.photo) !== "0";
  const alignment = photoPresentation(scalar(query.align));
  const model = readFairModelFixture({
    eventSlug,
    modelSlug,
    mode,
    withPhoto,
    photoPresentation: alignment,
  });
  if (!model || !model.capabilities.hasAudienceQuestions) notFound();

  const selection = {
    mode,
    threshold: threshold(scalar(query.threshold)),
    response: response(scalar(query.result)),
    questionCount: questionCount(scalar(query.questions), mode),
  };
  const fixture = readFairAudienceFixture(selection);
  const modelSearch = new URLSearchParams({
    mode,
    photo: withPhoto ? "1" : "0",
    align: alignment,
  });
  const modelHref = `/sajam/${eventSlug}/model/${modelSlug}?${modelSearch.toString()}`;
  const routePath = `/sajam/${eventSlug}/model/${modelSlug}/glas-publike`;

  return (
    <AudienceFlow
      model={model}
      fixture={fixture}
      dict={fairModelSr}
      routePath={routePath}
      modelHref={modelHref}
      selection={selection}
      showDevPanel={scalar(query.dev) === "1"}
    />
  );
}
