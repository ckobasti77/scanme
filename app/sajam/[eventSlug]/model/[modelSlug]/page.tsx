import type { Metadata } from "next";
import {
  FairModelRoute,
  fairModelMetadata,
  type FairModelRouteParams,
  type FairModelRouteSearchParams,
} from "./model-route";

export function generateStaticParams(): FairModelRouteParams[] {
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
  params: Promise<FairModelRouteParams>;
}): Promise<Metadata> {
  return fairModelMetadata(params);
}

export default function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<FairModelRouteParams>;
  searchParams: Promise<FairModelRouteSearchParams>;
}) {
  return <FairModelRoute params={params} searchParams={searchParams} openSurvey={false} />;
}
