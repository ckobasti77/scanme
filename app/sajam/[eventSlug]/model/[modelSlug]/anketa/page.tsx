import type { Metadata } from "next";
import {
  FairModelRoute,
  fairModelMetadata,
  type FairModelRouteParams,
  type FairModelRouteSearchParams,
} from "../model-route";

// MASTER §14 `/sajam/[eventSlug]/model/[modelSlug]/anketa`: a deep link, not a
// separate survey page. It renders the model page with the survey sheet open
// (when the model offers one); closing the sheet leaves the visitor on the model.

export async function generateMetadata({
  params,
}: {
  params: Promise<FairModelRouteParams>;
}): Promise<Metadata> {
  return fairModelMetadata(params);
}

export default function ModelSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<FairModelRouteParams>;
  searchParams: Promise<FairModelRouteSearchParams>;
}) {
  return <FairModelRoute params={params} searchParams={searchParams} openSurvey />;
}
