import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";

export const loadFairModelPage = cache(async (publicEventSlug: string, modelSlug: string) => {
  for (const candidate of fairMapEventSlugCandidates(
    publicEventSlug,
    process.env.NODE_ENV === "development",
  )) {
    const event = await fetchQuery(api.fairPublic.getEventBySlug, { slug: candidate });
    if (!event) continue;
    const model = await fetchQuery(api.fairPublic.getModelBySlug, {
      eventSlug: event.slug,
      modelSlug,
    });
    if (model) return { event, model };
  }
  return null;
});
