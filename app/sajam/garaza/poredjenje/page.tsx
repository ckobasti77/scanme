import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FairGarageComparison } from "@/components/fair/garage/fair-garage-comparison";
import type { FairGarageEventView } from "@/lib/fair-client/garage-view";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.comparisonMetaTitle,
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function values(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function FairGarageComparisonPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const publicSlug = values(query.event)[0] ?? "elektromobilnost-2026";
  const modelIds = [...new Set(values(query.model).filter(Boolean))].slice(0, 2);

  let event = null;
  for (const slug of fairMapEventSlugCandidates(
    publicSlug,
    process.env.NODE_ENV === "development",
  )) {
    try {
      event = await fetchQuery(api.fairPublic.getEventBySlug, { slug });
    } catch {
      event = null;
    }
    if (event) break;
  }

  const fallbackTitle = publicSlug.includes("auto-moto")
    ? dict.autoMotoTitle
    : dict.electromobilityTitle;
  const fallbackDates = publicSlug.includes("auto-moto")
    ? dict.autoMotoDates
    : dict.electromobilityDates;
  const eventView: FairGarageEventView = {
    publicSlug,
    dataSlug: event?.slug ?? publicSlug,
    event,
    fallbackId: publicSlug,
    fallbackTitle,
    fallbackDates,
    passportCatalog: [],
    sponsoredRotation: null,
  };

  return (
    <FairGarageComparison event={eventView} modelIds={modelIds} dict={dict} />
  );
}
