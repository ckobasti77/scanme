import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";

export async function loadFairPassportPage(publicSlug: string) {
  let event = null;
  for (const candidate of fairMapEventSlugCandidates(
    publicSlug,
    process.env.NODE_ENV === "development",
  )) {
    event = await fetchQuery(api.fairPublic.getEventBySlug, { slug: candidate });
    if (event) break;
  }
  if (!event) return null;

  const passport = await fetchQuery(api.fairPublic.getPassportCatalog, {
    eventSlug: event.slug,
  });
  const catalog = passport?.catalog ?? [];
  const modelIds = catalog.flatMap((entry) => entry.models.map((model) => model.eventModelId));
  const models = modelIds.length
    ? await fetchQuery(api.fairPublic.getModelsByIds, { ids: [...new Set(modelIds)] })
    : [];

  return { event, catalog, models };
}
