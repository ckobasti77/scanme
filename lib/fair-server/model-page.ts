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
import { fairMapEventSlugCandidates, fairMapLocationById } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr } from "@/lib/i18n/sr/fair-map";

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

/** Published Glas publike questions of one model for one event day (`YYYY-MM-DD`, Europe/Belgrade). */
export async function loadFairAudienceQuestions(
  eventModelId: string,
  dateKey: string,
  openAt = Date.now(),
): Promise<FairAudienceQuestionView[] | null> {
  // `openAt` also lists a question opened before its day ("Otvori odmah").
  return orNull(fetchQuery(api.fairPublic.listAudienceQuestionsForModel, { eventModelId, dateKey, openAt }));
}

/** Today's fair day key in Europe/Belgrade (`YYYY-MM-DD`). */
export function fairTodayDateKey(now = Date.now()): string {
  return epochToBelgradeLocal(now).slice(0, 10);
}

/** Model page v2 stand chip: "Štand 9 · Hala" and the map deep link that focuses it. */
export type FairModelStand = { text: string; href: string };

/** From the event map geometry (no extra read); null when the location is not on the map. */
export function fairModelStand(event: { code: string }, model: { standMapLocationId: string }, publicEventSlug: string): FairModelStand | null {
  const found = fairMapLocationById(event.code, model.standMapLocationId);
  if (!found) return null;
  const zone = fairMapSr.zones[found.zoneId];
  const text =
    found.location.kind === "stand" ? fmt(fairMapSr.standLocation, { label: found.location.label, zone }) : zone;
  return { text, href: `/sajam/${publicEventSlug}?stand=${encodeURIComponent(model.standMapLocationId)}` };
}

/** Prompt of today's first Glas publike question (the card on the model page), or null. */
export async function loadFairAudienceTeaser(eventModelId: string): Promise<string | null> {
  const questions = await loadFairAudienceQuestions(eventModelId, fairTodayDateKey());
  const first = [...(questions ?? [])].sort((left, right) => left.order - right.order)[0];
  return first?.prompt.trim() || null;
}
