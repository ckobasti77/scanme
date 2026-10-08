import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AudienceFlow, type AudienceQuestion } from "@/components/fair/audience-flow";
import {
  fairPublicModelToFixture,
  readFairAudienceFixture,
  readFairModelFixture,
  type FairAudienceQuestionCountFixture,
  type FairAudienceResponseFixture,
  type FairAudienceThresholdFixture,
  type FairFixtureMode,
  type FairPhotoPresentation,
} from "@/lib/fair-client/model-fixtures";
import {
  fairTodayDateKey,
  loadFairAudienceQuestions,
  loadFairModelPage,
} from "@/lib/fair-server/model-page";
import { fmt } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

type RouteParams = {
  eventSlug: string;
  modelSlug: string;
};

type RouteSearchParams = Record<string, string | string[] | undefined>;

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
  const [{ eventSlug, modelSlug }, query] = await Promise.all([params, searchParams]);
  const routePath = `/sajam/${eventSlug}/model/${modelSlug}/glas-publike`;
  const live = await loadFairModelPage(eventSlug, modelSlug);

  if (live) {
    const { model } = fairPublicModelToFixture({
      model: live.model,
      publicEventSlug: eventSlug,
      eventName: live.event.title,
      withPhoto: false,
      photoPresentation: "left",
    });
    if (!model.capabilities.hasAudienceQuestions) notFound();
    const views = (await loadFairAudienceQuestions(live.model.id, fairTodayDateKey())) ?? [];
    const questions: AudienceQuestion[] = views.map((view) => ({
      id: view.id,
      prompt: view.prompt,
      answers: view.options.map((option) => ({ id: option.id, label: option.label })),
    }));
    return (
      <AudienceFlow
        model={model}
        questions={questions}
        source={{ kind: "live", eventModelId: live.model.id }}
        dict={fairModelSr}
        routePath={routePath}
        modelHref={`/sajam/${eventSlug}/model/${modelSlug}`}
        selection={null}
        showDevPanel={false}
      />
    );
  }

  // DEV-only fixture flow (no live model): never reachable in production.
  if (process.env.NODE_ENV !== "development") notFound();
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

  return (
    <AudienceFlow
      model={model}
      questions={fixture.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        answers: question.answers,
        fixturePercentages: question.resultPercentagesByAnswer,
      }))}
      source={{ kind: "fixture", threshold: fixture.threshold, response: fixture.response }}
      dict={fairModelSr}
      routePath={routePath}
      modelHref={`/sajam/${eventSlug}/model/${modelSlug}?${modelSearch.toString()}`}
      selection={selection}
      showDevPanel={scalar(query.dev) === "1"}
    />
  );
}
