import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairModelPage } from "@/components/fair/fair-model-page";
import {
  readFairModelFixture,
  type FairFixtureMode,
  type FairPhotoPresentation,
} from "@/lib/fair-client/model-fixtures";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fmt } from "@/lib/i18n/format";

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

function photoPresentation(value: string | undefined): FairPhotoPresentation {
  return value === "right" || value === "bottom" ? value : "left";
}

export function generateStaticParams(): RouteParams[] {
  return [
    {
      eventSlug: "auto-moto-fest-2026",
      modelSlug: "audi-rs-3-sportback",
    },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { eventSlug, modelSlug } = await params;
  const model = readFairModelFixture({
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

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ eventSlug, modelSlug }, query] = await Promise.all([params, searchParams]);
  const selection = {
    mode: fixtureMode(scalar(query.mode)),
    withPhoto: scalar(query.photo) !== "0",
    alignment: photoPresentation(scalar(query.align)),
  };
  const model = readFairModelFixture({
    eventSlug,
    modelSlug,
    mode: selection.mode,
    withPhoto: selection.withPhoto,
    photoPresentation: selection.alignment,
  });

  if (!model) notFound();

  const routePath = `/sajam/${eventSlug}/model/${modelSlug}`;
  return (
    <FairModelPage
      model={model}
      dict={fairModelSr}
      routePath={routePath}
      selection={selection}
      showDevPanel={scalar(query.dev) === "1"}
    />
  );
}
