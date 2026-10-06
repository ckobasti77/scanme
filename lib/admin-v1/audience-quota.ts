// Admin UX A6 — Glas publike quotas, statuses and the model × day coverage
// matrix, computed in the browser from the questions the screen already has
// (getEventInteractions) so the quota is visible BEFORE saving. The rules are
// lib/fair-entitlements (Starter 1, Napredni 5 per fair day; on an upgrade day
// the questions already published that day count toward the new limit,
// MASTER §4.4) and mirror convex/fairInteractionsAdmin.ts; the backend stays
// the source of truth and its error is shown when it disagrees.

import type { FairAudienceQuestionStatus, FairModelStatus, FairPackageTier } from "@/lib/fair-contract";
import { fairAudienceQuestionLimit, fairAudienceQuestionsRemaining, getFairEntitlements } from "@/lib/fair-entitlements";

export type QuotaModel = { id: string; tier: FairPackageTier; packageActivatedAt: number; status?: FairModelStatus };
export type QuotaDay = { id: string; startsAt: number; endsAt: number };
export type QuotaQuestion = { id: string; modelId: string; dayId: string; status: FairAudienceQuestionStatus; showOnSponsoredRotation: boolean };

/**
 * Tier in force NOW (convex/lib/fairInteractions.ts fairModelTierAt): an
 * activation is effective from `packageActivatedAt`; upgrades never start
 * before the current activation, so until then no paid tier is in force.
 */
export function audienceTierNow(model: Pick<QuotaModel, "tier" | "packageActivatedAt">, now: number): FairPackageTier {
  return model.packageActivatedAt <= now ? model.tier : "included";
}

export type AudienceQuota = {
  /** Tier the publish is judged by (in force now). */
  tier: FairPackageTier;
  limit: number;
  /** Published or closed questions of the model on the day (a closed one still counts). */
  used: number;
  drafts: number;
  remaining: number;
  /** The model's package that is not in force yet, and from when (null = in force). */
  pending: { tier: FairPackageTier; from: number } | null;
};

export function audienceQuota(model: QuotaModel, dayId: string, questions: readonly QuotaQuestion[], now: number): AudienceQuota {
  const tier = audienceTierNow(model, now);
  const ofDay = questions.filter((question) => question.modelId === model.id && question.dayId === dayId);
  const used = ofDay.filter((question) => question.status !== "draft").length;
  return {
    tier,
    limit: fairAudienceQuestionLimit(tier),
    used,
    drafts: ofDay.length - used,
    remaining: fairAudienceQuestionsRemaining(tier, used),
    pending: model.tier !== "included" && model.packageActivatedAt > now ? { tier: model.tier, from: model.packageActivatedAt } : null,
  };
}

/** Why a question of the model cannot be saved (a draft needs a package with Glas publike in force). */
export type AudienceBlock = "not_entitled" | "pending_package" | "day_limit";

export function audienceDraftBlock(quota: AudienceQuota): AudienceBlock | null {
  if (quota.limit > 0) return null;
  return quota.pending ? "pending_package" : "not_entitled";
}

/** Why a draft cannot be published now: the draft rule, then the day's quota. */
export function audiencePublishBlock(quota: AudienceQuota): AudienceBlock | null {
  return audienceDraftBlock(quota) ?? (quota.remaining < 1 ? "day_limit" : null);
}

// -----------------------------------------------------------------------------
// Statuses: Nacrt / Objavljeno / Sponzorisano / Zatvoreno
// -----------------------------------------------------------------------------

export type AudienceDisplayStatus = "draft" | "published" | "sponsored" | "closed";

/** Sponzorisano = a published question chosen for the map rotation (showOnSponsoredRotation). */
export function audienceDisplayStatus(question: Pick<QuotaQuestion, "status" | "showOnSponsoredRotation">): AudienceDisplayStatus {
  if (question.status === "published" && question.showOnSponsoredRotation) return "sponsored";
  return question.status;
}

/** "Postavi kao sponzorisano": a published question of a model whose package in force has the map rotation (Napredni). */
export function canSetSponsored(question: Pick<QuotaQuestion, "status" | "showOnSponsoredRotation">, model: Pick<QuotaModel, "tier" | "packageActivatedAt">, now: number): boolean {
  return question.status === "published" && !question.showOnSponsoredRotation && getFairEntitlements(audienceTierNow(model, now)).sponsoredMapRotation;
}

// -----------------------------------------------------------------------------
// Coverage matrix: model × fair day (questions / quota)
// -----------------------------------------------------------------------------

export type AudienceCellState = "none" | "empty" | "partial" | "full";

export type AudienceMatrixCell = {
  dayId: string;
  used: number;
  limit: number;
  drafts: number;
  state: AudienceCellState;
  today: boolean;
  past: boolean;
  /** An empty cell on a fair day that is today or still ahead: the hole to fill. */
  highlight: boolean;
};

export type AudienceMatrixRow = { modelId: string; quotaTier: FairPackageTier; pending: AudienceQuota["pending"]; cells: AudienceMatrixCell[] };

export function audienceDayTiming(day: QuotaDay, now: number) {
  return { today: day.startsAt <= now && now < day.endsAt, past: day.endsAt <= now };
}

/** Rows of every model with a Starter or Napredni package (models without Glas publike are left out). */
export function audienceMatrix(models: readonly QuotaModel[], days: readonly QuotaDay[], questions: readonly QuotaQuestion[], now: number): AudienceMatrixRow[] {
  return models.filter((model) => model.tier !== "included" && model.status !== "withdrawn").map((model) => {
    const cells = days.map((day): AudienceMatrixCell => {
      const quota = audienceQuota(model, day.id, questions, now);
      const { today, past } = audienceDayTiming(day, now);
      const state: AudienceCellState = quota.limit === 0 ? "none" : quota.used === 0 ? "empty" : quota.used >= quota.limit ? "full" : "partial";
      return { dayId: day.id, used: quota.used, limit: quota.limit, drafts: quota.drafts, state, today, past, highlight: state === "empty" && !past };
    });
    const quota = audienceQuota(model, days[0]?.id ?? "", questions, now);
    return { modelId: model.id, quotaTier: quota.tier, pending: quota.pending, cells };
  });
}

/** Empty cells still to fill (today and later), for the matrix summary. */
export function audienceMatrixGaps(rows: readonly AudienceMatrixRow[]): number {
  return rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.highlight).length, 0);
}

/** The day the form opens on: the one in the URL, else today, else the next fair day, else the first. */
export function defaultAudienceDayId(days: readonly QuotaDay[], now: number, wanted?: string | null): string | undefined {
  if (wanted && days.some((day) => day.id === wanted)) return wanted;
  return (days.find((day) => audienceDayTiming(day, now).today) ?? days.find((day) => day.startsAt > now) ?? days[0])?.id;
}

// -----------------------------------------------------------------------------
// The question list: grouped by day and model, filters in the query string
// -----------------------------------------------------------------------------

/** `?status=` values of the list (Serbian slugs, as the other Događaji filters). */
export const AUDIENCE_STATUS_PARAMS: Record<AudienceDisplayStatus, string> = { draft: "nacrt", published: "objavljeno", sponsored: "sponzorisano", closed: "zatvoreno" };
export const AUDIENCE_STATUSES: readonly AudienceDisplayStatus[] = ["draft", "published", "sponsored", "closed"];

export function audienceStatusFromParam(value: string | undefined): AudienceDisplayStatus | undefined {
  return AUDIENCE_STATUSES.find((status) => AUDIENCE_STATUS_PARAMS[status] === value);
}

/**
 * Questions of the list: filtered by `?status=` and `?izlagac=` (the model's
 * exhibitor), ordered by fair day, then model (in `modelOrder`), then the
 * question's own `sortOrder` — so day · model groups come out together.
 */
export function audienceListRows<Q extends QuotaQuestion & { sortOrder: number }>(
  questions: readonly Q[],
  query: { status?: string; izlagac?: string },
  dayOrder: readonly string[],
  modelOrder: readonly string[],
  exhibitorOf: (modelId: string) => string | undefined,
): Q[] {
  const status = audienceStatusFromParam(query.status);
  const dayIndex = new Map(dayOrder.map((id, index) => [id, index]));
  const modelIndex = new Map(modelOrder.map((id, index) => [id, index]));
  const last = Number.MAX_SAFE_INTEGER;
  return questions
    .filter((question) => (!status || audienceDisplayStatus(question) === status) && (!query.izlagac || exhibitorOf(question.modelId) === query.izlagac))
    .sort((a, b) =>
      (dayIndex.get(a.dayId) ?? last) - (dayIndex.get(b.dayId) ?? last)
      || (modelIndex.get(a.modelId) ?? last) - (modelIndex.get(b.modelId) ?? last)
      || a.sortOrder - b.sortOrder);
}

/** How many questions each status filter would show (with the exhibitor filter applied). */
export function audienceStatusCounts(questions: readonly QuotaQuestion[], izlagac: string | undefined, exhibitorOf: (modelId: string) => string | undefined): Record<AudienceDisplayStatus, number> {
  const counts: Record<AudienceDisplayStatus, number> = { draft: 0, published: 0, sponsored: 0, closed: 0 };
  for (const question of questions) if (!izlagac || exhibitorOf(question.modelId) === izlagac) counts[audienceDisplayStatus(question)] += 1;
  return counts;
}

/** Next `sortOrder` of a new question of the model (after its last one). */
export function nextAudienceSortOrder(questions: readonly { modelId: string; sortOrder: number }[], modelId: string): number {
  return questions.filter((question) => question.modelId === modelId).reduce((max, question) => Math.max(max, question.sortOrder), 0) + 1;
}
