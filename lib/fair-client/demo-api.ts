import type { FairMyModelState, FairRatingState, FairResult } from "../fair-contract";
import { FAIR_DEMO_MODELS, FAIR_DEMO_PASSPORTS, FAIR_DEMO_PROGRESS, isFairDemoId } from "../fair-demo";

const ratings = new Map<string, FairRatingState>();

/** Exact synthetic ID allowlist. Demo contact values are never retained or sent. */
export function fairDemoRequest<T>(path: string, body: unknown): FairResult<T> | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (!isFairDemoId(data.eventModelId) && !isFairDemoId(data.eventSlug)) return null;
  const model = FAIR_DEMO_MODELS.find((item) => item.id === data.eventModelId);
  let value: unknown;
  if (path === "/api/fair/model-state" && model) {
    const passport = FAIR_DEMO_PASSPORTS.find((item) => item.brandId === model.brandId);
    value = { eventModelId: model.id, rating: ratings.get(model.id) ?? { mode: "dimensions" }, audience: [],
      survey: { state: "open", surveyId: "demo-survey", version: 1 },
      passport: FAIR_DEMO_PROGRESS.find((item) => item.passportId === passport?.passportId) ?? null } satisfies FairMyModelState;
  } else if (path === "/api/fair/rating" && model) {
    const old = ratings.get(model.id) ?? { mode: "dimensions" as const };
    value = { ...old, ...Object.fromEntries(["appearance", "specifications", "price"].filter((key) => typeof data[key] === "number").map((key) => [key, data[key]])) };
    ratings.set(model.id, value as FairRatingState);
  } else if (path === "/api/fair/lead" && model) {
    value = { eventModelId: model.id, kind: data.kind, submittedAt: Date.now(), duplicate: false, confirmationEmail: false, followUpScheduled: false };
  } else if (path === "/api/fair/survey" && model) {
    value = { surveyId: "demo-survey", version: 1, submittedAt: Date.now(), duplicate: false };
  } else return { ok: false, code: "SERVICE_UNAVAILABLE" };
  return { ok: true, value: value as T };
}
