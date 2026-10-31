import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairBrandComparison } from "@/components/fair/garage/fair-brand-comparison";
import { fairCompareOption, loadFairBrandModels } from "@/lib/fair-server/brand-compare";
import { loadFairModelPage } from "@/lib/fair-server/model-page";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.brandComparisonMetaTitle,
  robots: { index: false, follow: false },
};

type RouteParams = { eventSlug: string; modelSlug: string };
type SearchParams = Record<string, string | string[] | undefined>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Same-brand comparison from a model page: `?sa=` names the other model (slug
// or id). Both must be published models of the same brand and exhibitor on
// this event (loadFairBrandModels); anything else shows the refused state.
// Nothing here touches the visitor's garage.
export default async function FairBrandComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ eventSlug, modelSlug }, query] = await Promise.all([params, searchParams]);
  const live = await loadFairModelPage(eventSlug, modelSlug);
  if (!live) notFound();

  const requested = scalar(query.sa)?.trim() ?? "";
  const brandModels = await loadFairBrandModels(live.event.slug, live.model);
  const base = brandModels.find((model) => model.id === live.model.id);
  const others = base ? brandModels.filter((model) => model.id !== base.id) : [];
  const partner = requested
    ? others.find((model) => model.slug === requested || model.id === requested)
    : undefined;
  // An `sa` that names no model of this event at all is a 404, like the model page.
  if (requested && !partner && !brandModels.some((model) => model.slug === requested || model.id === requested)) {
    const other = await loadFairModelPage(eventSlug, requested);
    if (!other) notFound();
  }

  return (
    <FairBrandComparison
      routeEventSlug={eventSlug}
      event={{ id: live.event.id, title: live.event.title }}
      base={base ?? live.model}
      partner={partner ?? null}
      options={others.map(fairCompareOption)}
      status={partner ? "ready" : requested ? "refused" : "choose"}
      dict={dict}
      modelDict={fairModelSr}
    />
  );
}
