import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type {
  FairAudienceQuestionView,
  FairLeadFormView,
  FairModelCapabilities,
  FairSurveyView,
} from "@/lib/fair-contract";
import { epochToBelgradeLocal } from "@/lib/belgrade-time";
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

export type FairModelInteractions = {
  survey: FairSurveyView | null;
  leadForms: { interest?: FairLeadFormView; testDrive?: FairLeadFormView };
};

async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    // A failed public read hides that one action; the model page still renders.
    return null;
  }
}

/** Survey structure and lead forms of one live model, read only where the server capabilities allow them. */
export async function loadFairModelInteractions(
  eventModelId: string,
  capabilities: FairModelCapabilities,
): Promise<FairModelInteractions> {
  const [survey, interest, testDrive] = await Promise.all([
    capabilities.hasSurvey ? orNull(fetchQuery(api.fairPublic.getSurveyForModel, { eventModelId })) : null,
    capabilities.canSubmitInterest
      ? orNull(fetchQuery(api.fairPublic.getLeadForm, { eventModelId, kind: "interest" }))
      : null,
    capabilities.canRequestTestDrive
      ? orNull(fetchQuery(api.fairPublic.getLeadForm, { eventModelId, kind: "test_drive" }))
      : null,
  ]);
  return {
    survey,
    leadForms: { ...(interest ? { interest } : {}), ...(testDrive ? { testDrive } : {}) },
  };
}

/**
 * Published Glas publike questions of one model for one event day (`YYYY-MM-DD`, Europe/Belgrade).
 * P1: `at` (request time) also lists a question the admin opened before its day.
 */
export async function loadFairAudienceQuestions(
  eventModelId: string,
  dateKey: string,
  at: number = Date.now(),
): Promise<FairAudienceQuestionView[] | null> {
  return orNull(fetchQuery(api.fairPublic.listAudienceQuestionsForModel, { eventModelId, dateKey, at }));
}

/** Today's fair day key in Europe/Belgrade (`YYYY-MM-DD`). */
export function fairTodayDateKey(now = Date.now()): string {
  return epochToBelgradeLocal(now).slice(0, 10);
}
