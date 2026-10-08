import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairGarageComparison } from "@/components/fair/garage/fair-garage-comparison";
import { fairGarageDefinition, loadFairGarageEventSummary } from "@/lib/fair-server/garage-page";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.comparisonMetaTitle,
  robots: { index: false, follow: false },
};

type RouteParams = { eventSlug: string };
type SearchParams = Record<string, string | string[] | undefined>;

function values(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function FairGarageComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const definition = fairGarageDefinition(eventSlug);
  if (!definition) notFound();
  const modelIds = [...new Set(values(query.model).filter(Boolean))].slice(0, 2);
  const event = await loadFairGarageEventSummary(definition);

  return (
    <FairGarageComparison
      routeEventSlug={eventSlug}
      event={event}
      modelIds={modelIds}
      dict={dict}
      shellDict={fairModelSr}
    />
  );
}
