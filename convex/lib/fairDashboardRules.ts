import { v } from "convex/values";
import {
  FAIR_DASHBOARD_DEADLINES,
  FAIR_DASHBOARD_PHASES,
  FAIR_DASHBOARD_RULES,
  FAIR_DASHBOARD_SECTIONS,
  FAIR_DASHBOARD_TONES,
  FAIR_LEAD_DELIVERY_DEADLINE_MS,
  sortFairDashboardActions,
  type FairDashboardAction,
  type FairDashboardDeadline,
  type FairDashboardPhase,
  type FairDashboardRule,
  type FairDashboardSection,
  type FairDashboardTone,
  type FairLeadKind,
  type FairModelStatus,
  type FairPackageTier,
  type FairParticipationStatus,
  type FairPassportConfigStatus,
  type FairReportStatus,
} from "../../lib/fair-contract";
import { fairBrandPassportProblems, getFairEntitlements } from "../../lib/fair-entitlements";
import { PASSPORT_MODELS_CAP } from "./fairInteractions";

// =============================================================================
// Admin UX A10 — the rules of `Događaji → Pregled` (A0-IZVESTAJ §6,
// ADMIN-UX-ZAHTEVI §3). Pure: convex/fairDashboard.ts loads the facts with
// bounded, indexed event reads and this file turns them into the phase, the
// „Šta treba da uradim“ items (rule, tone, count, link), the KPI row and the
// section cards. No text: lib/i18n builds every sentence.
//
// The package "in force" at a moment is the stored tier once its activation
// moment has passed, else `included` — the same reading as the A6 quota
// (lib/admin-v1/audience-quota.ts audienceTierNow): an upgrade never starts
// before the current activation, so no paid tier is in force before it. The
// dashboard therefore never reads the activation history per model.
// =============================================================================

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Before the opening, QR and the lead switches become urgent inside this window. */
export const FAIR_DASHBOARD_SOON_MS = 72 * HOUR_MS;
/** A fair day starting within this window must have its questions (rule 6b). */
export const FAIR_DASHBOARD_NEXT_DAY_MS = 48 * HOUR_MS;
/** MASTER §12: the daily dataset is ready at most 60 minutes after the day closes. */
export const FAIR_DASHBOARD_REPORT_GRACE_MS = HOUR_MS;
/** A missing question of today is urgent until noon (Belgrade), later „uskoro“. */
const QUESTION_URGENT_UNTIL_HOUR = 12;
const LEADS_URGENT_MS = 3 * DAY_MS;
const PURGE_SOON_DAYS = 7;

// -----------------------------------------------------------------------------
// Facts (loaded by convex/fairDashboard.ts)
// -----------------------------------------------------------------------------

export type FairDashboardModelFact = {
  id: string;
  participationId: string;
  brandId: string;
  status: FairModelStatus;
  packageTier: FairPackageTier;
  packageActivatedAt: number;
  passportEligible: boolean;
  hasPhoto: boolean;
  hasActiveQr: boolean;
  /** Publish issues with severity `error` (fairPublishIssuesFromFacts). */
  errors: number;
  /** The `FAIR_PRICE_MISSING` warning (price is the "Cena na upit" fallback). */
  priceMissing: boolean;
};

export type FairDashboardDayFact = { id: string; dateKey: string; label: string; startsAt: number; endsAt: number };

export type FairDashboardFacts = {
  at: number;
  /** Hour of `at` in Europe/Belgrade (0–23). */
  belgradeHour: number;
  event: {
    startsAt: number;
    endsAt: number;
    piiPurgeAt: number;
    qrInventoryConfigured: boolean;
    sponsoredAutoPublish: boolean;
    /** When the post-fair follow-up is sent (fairFollowUpAt). */
    followUpAt: number;
  };
  days: FairDashboardDayFact[];
  participations: { id: string; status: FairParticipationStatus }[];
  models: FairDashboardModelFact[];
  /** Active QR assignments of this event. */
  assignments: number;
  inventory: { total: number | null; capped: boolean };
  /** Published and closed Glas publike questions of every day (drafts are not read). */
  /** `coveredDayIds`: every fair day the question's window overlaps (its own day included), 9 Oct 2026. */
  questions: { id: string; modelId: string; dayId: string; coveredDayIds?: string[]; showOnSponsoredRotation: boolean }[];
  questionsCapped: boolean;
  consents: Record<FairLeadKind, boolean>;
  formDefaults: { participationId: string; leadKind: FairLeadKind; enabled: boolean }[];
  switches: { leadsEnabled: boolean; followUpEnabled: boolean };
  leads: { total: number; undelivered: number; newToday: number; capped: boolean; participationIds: string[] };
  /** Participations with an active follow-up text (fairExhibitorFollowUpTemplates). */
  followUpActive: string[];
  passports: { brandId: string; status: FairPassportConfigStatus; hidden: boolean; freezesAt: number }[];
  /** Frozen published passports with a required member whose car is withdrawn. */
  blockedPassports: number;
  /** Items of the published sponsored snapshot; null = no snapshot. */
  sponsoredItems: { modelId: string; questionId: string | null }[] | null;
  /** Newest report run of every day × participation that has one (closed days only). */
  reports: { dayId: string; participationId: string; status: FairReportStatus }[];
  scans: { today: number; total: number; uniqueToday: number; uniqueTotal: number; capped: boolean };
};

// -----------------------------------------------------------------------------
// Result (validators = the `returns` of getEventDashboard)
// -----------------------------------------------------------------------------

const phaseKind = v.union(...FAIR_DASHBOARD_PHASES.map((value) => v.literal(value)));
const tone = v.union(...FAIR_DASHBOARD_TONES.map((value) => v.literal(value)));
const deadlineKind = v.union(...FAIR_DASHBOARD_DEADLINES.map((value) => v.literal(value)));
const rule = v.union(...FAIR_DASHBOARD_RULES.map((value) => v.literal(value)));
const section = v.union(...FAIR_DASHBOARD_SECTIONS.map((value) => v.literal(value)));

export const fairDashboardResult = v.object({
  at: v.number(),
  phase: v.object({
    kind: phaseKind,
    /** 1-based fair day (the open one, else the next one); null outside the fair. */
    dayIndex: v.union(v.number(), v.null()),
    dayCount: v.number(),
    dayOpen: v.boolean(),
    nextDeadline: v.union(v.null(), v.object({ kind: deadlineKind, at: v.number() })),
  }),
  event: v.object({ startsAt: v.number(), endsAt: v.number(), piiPurgeAt: v.number() }),
  days: v.array(v.object({ dateKey: v.string(), label: v.string(), startsAt: v.number(), endsAt: v.number() })),
  actions: v.array(v.object({
    rule,
    tone,
    count: v.number(),
    section,
    query: v.record(v.string(), v.string()),
    deadlineAt: v.optional(v.number()),
  })),
  kpis: v.object({
    models: v.object({ published: v.number(), total: v.number(), byTier: v.object({ included: v.number(), starter: v.number(), advanced: v.number() }) }),
    qr: v.object({ assigned: v.number(), inventory: v.union(v.number(), v.null()), inventoryCapped: v.boolean() }),
    scans: v.object({ today: v.number(), total: v.number(), uniqueToday: v.number(), uniqueTotal: v.number(), capped: v.boolean() }),
    leads: v.union(v.null(), v.object({ newToday: v.number(), undelivered: v.number(), total: v.number(), capped: v.boolean() })),
    questions: v.union(v.null(), v.object({ dateKey: v.string(), label: v.string(), today: v.boolean(), covered: v.number(), required: v.number(), capped: v.boolean() })),
    reports: v.union(v.null(), v.object({ pendingReview: v.number() })),
  }),
  sections: v.object({
    modeli: v.object({ published: v.number(), draft: v.number(), withdrawn: v.number(), withErrors: v.number() }),
    qr: v.object({ assigned: v.number(), publishedWithoutQr: v.number(), onWithdrawn: v.number(), inventory: v.union(v.number(), v.null()) }),
    interakcije: v.object({ questions: v.number(), passports: v.number(), passportsHidden: v.number(), formExhibitors: v.number() }),
    leadovi: v.union(v.null(), v.object({ total: v.number(), undelivered: v.number(), followUpActive: v.number(), followUpNeeded: v.number() })),
    sponzorisano: v.union(v.null(), v.object({ autoPublish: v.boolean(), inList: v.number(), due: v.number(), withoutQuestion: v.number() })),
    izvestaji: v.union(v.null(), v.object({ pendingReview: v.number(), failed: v.number(), sent: v.number() })),
    izlagaci: v.object({ active: v.number(), total: v.number(), withAdvanced: v.number() }),
  }),
});

export type FairDashboardPhaseView = {
  kind: FairDashboardPhase;
  dayIndex: number | null;
  dayCount: number;
  dayOpen: boolean;
  nextDeadline: { kind: FairDashboardDeadline; at: number } | null;
};

// -----------------------------------------------------------------------------
// Phase
// -----------------------------------------------------------------------------

/** The package in force at `at` (see the file comment). */
export function fairDashboardTierAt(model: Pick<FairDashboardModelFact, "packageTier" | "packageActivatedAt">, at: number): FairPackageTier {
  return model.packageActivatedAt <= at ? model.packageTier : "included";
}

/**
 * pre (before `startsAt`) / sajam (fair day N of M; N = the open day, else
 * the next one) / posle (after `endsAt`, until the purge) / obrisano (from
 * `piiPurgeAt`), and the deadline the header counts down to.
 */
export function fairDashboardPhase(facts: Pick<FairDashboardFacts, "at" | "event" | "days">): FairDashboardPhaseView {
  const { at, event } = facts;
  const days = [...facts.days].sort((a, b) => a.startsAt - b.startsAt);
  const dayCount = days.length;
  const afterFair = at <= FAIR_LEAD_DELIVERY_DEADLINE_MS
    ? { kind: "lead_delivery" as const, at: FAIR_LEAD_DELIVERY_DEADLINE_MS }
    : { kind: "pii_purge" as const, at: event.piiPurgeAt };
  if (at >= event.piiPurgeAt) return { kind: "obrisano", dayIndex: null, dayCount, dayOpen: false, nextDeadline: null };
  if (at < event.startsAt) return { kind: "pre", dayIndex: null, dayCount, dayOpen: false, nextDeadline: { kind: "opening", at: days[0]?.startsAt ?? event.startsAt } };
  if (at < event.endsAt) {
    const open = days.findIndex((day) => day.startsAt <= at && at < day.endsAt);
    if (open >= 0) return { kind: "sajam", dayIndex: open + 1, dayCount, dayOpen: true, nextDeadline: { kind: "day_end", at: days[open].endsAt } };
    const next = days.findIndex((day) => day.startsAt > at);
    if (next >= 0) return { kind: "sajam", dayIndex: next + 1, dayCount, dayOpen: false, nextDeadline: { kind: "day_start", at: days[next].startsAt } };
    return { kind: "sajam", dayIndex: dayCount || null, dayCount, dayOpen: false, nextDeadline: afterFair };
  }
  return { kind: "posle", dayIndex: null, dayCount, dayOpen: false, nextDeadline: afterFair };
}

// -----------------------------------------------------------------------------
// The dashboard
// -----------------------------------------------------------------------------

export function buildFairDashboard(facts: FairDashboardFacts) {
  const { at, event } = facts;
  const phase = fairDashboardPhase(facts);
  const P = phase.kind;
  const preOrFair = P === "pre" || P === "sajam";
  const soon = P === "pre" && event.startsAt - at < FAIR_DASHBOARD_SOON_MS;
  const days = [...facts.days].sort((a, b) => a.startsAt - b.startsAt);
  const models = facts.models;
  const live = models.filter((model) => model.status !== "withdrawn");
  const published = models.filter((model) => model.status === "published");
  const rights = (tier: FairPackageTier) => getFairEntitlements(tier);
  const tierNow = (model: FairDashboardModelFact) => fairDashboardTierAt(model, at);

  const actions: FairDashboardAction[] = [];
  const add = (ruleId: FairDashboardRule, toneId: FairDashboardTone, count: number, sectionId: FairDashboardSection, query: Record<string, string> = {}, deadlineAt?: number) => {
    if (count > 0) actions.push({ rule: ruleId, tone: toneId, count, section: sectionId, query, ...(deadlineAt !== undefined ? { deadlineAt } : {}) });
  };

  // QR and the catalog (rules 1–5).
  const publishedWithoutQr = published.filter((model) => !model.hasActiveQr).length;
  const onWithdrawn = models.filter((model) => model.status === "withdrawn" && model.hasActiveQr).length;
  if (preOrFair) {
    add("qr_inventory_missing", "hitno", event.qrInventoryConfigured ? 0 : 1, "qr");
    add("published_without_qr", P === "sajam" || soon ? "hitno" : "uskoro", publishedWithoutQr, "modeli", { status: "objavljen", qr: "nema" });
    add("published_with_errors", "hitno", published.filter((model) => model.errors > 0).length, "modeli", { status: "objavljen", problemi: "greske" });
    add("drafts_with_errors", "uskoro", models.filter((model) => model.status === "draft" && model.errors > 0).length, "modeli", { status: "nacrt", problemi: "greske" });
    // A model with an error is listed under „greške“ (the filter shows the worst problem).
    add("price_missing", "uskoro", live.filter((model) => model.priceMissing && model.errors === 0).length, "modeli", { problemi: "upozorenja" });
  }
  if (P !== "obrisano") add("qr_on_withdrawn", "hitno", onWithdrawn, "modeli", { status: "povucen", qr: "ima" });

  // Glas publike (rules 6, 6b) — only models whose package in force NOW has
  // questions: that is when the admin can create and publish one.
  const questionsByDay = new Map<string, Set<string>>();
  // A question open across several fair days covers each of them (owner,
  // 9 Oct 2026): no "missing question" warning for a day it already serves.
  for (const question of facts.questions) {
    for (const dayId of question.coveredDayIds ?? [question.dayId]) {
      const set = questionsByDay.get(dayId) ?? new Set<string>();
      set.add(question.modelId);
      questionsByDay.set(dayId, set);
    }
  }
  const askers = published.filter((model) => rights(tierNow(model)).audienceQuestionsPerDay > 0);
  const missingOn = (dayId: string) => askers.filter((model) => !questionsByDay.get(dayId)?.has(model.id)).length;
  const openDay = phase.kind === "sajam" && phase.dayOpen && phase.dayIndex ? days[phase.dayIndex - 1] : null;
  const nextDay = phase.kind === "pre"
    ? days[0] ?? null
    : phase.kind === "sajam" && !phase.dayOpen && phase.dayIndex && phase.dayIndex <= days.length && days[phase.dayIndex - 1].startsAt > at ? days[phase.dayIndex - 1] : null;
  if (openDay) add("question_missing_today", facts.belgradeHour < QUESTION_URGENT_UNTIL_HOUR ? "hitno" : "uskoro", missingOn(openDay.id), "interakcije", { dan: openDay.dateKey });
  if (nextDay && nextDay.startsAt - at < FAIR_DASHBOARD_NEXT_DAY_MS) add("question_missing_next_day", "uskoro", missingOn(nextDay.id), "interakcije", { dan: nextDay.dateKey });

  // Napredni (rules 7, 8, 19): the sponsored list holds the published models
  // whose Napredni package is in force now, each with its map question.
  const mapQuestion = new Map<string, string>();
  for (const question of facts.questions) if (question.showOnSponsoredRotation) mapQuestion.set(question.modelId, question.id);
  const due = published.filter((model) => tierNow(model) === "advanced");
  const dueWithoutQuestion = due.filter((model) => !mapQuestion.has(model.id)).length;
  const advancedLive = live.filter((model) => model.packageTier === "advanced");
  // Same comparison as the A9 drift (admin-events-sponsored.tsx sponsoredDrift): missing, extra or a changed map question.
  let outOfDate = due.length;
  if (facts.sponsoredItems !== null) {
    const listed = new Map(facts.sponsoredItems.map((item) => [item.modelId, item.questionId]));
    const dueIds = new Set(due.map((model) => model.id));
    outOfDate = due.filter((model) => !listed.has(model.id) || listed.get(model.id) !== (mapQuestion.get(model.id) ?? null)).length
      + [...listed.keys()].filter((id) => !dueIds.has(id)).length;
  }
  if (preOrFair) {
    add("sponsored_question_missing", "uskoro", dueWithoutQuestion, "sponzorisano");
    add("advanced_photo_missing", P === "pre" ? "uskoro" : "info", advancedLive.filter((model) => !model.hasPhoto).length, "modeli", { paket: "napredni", foto: "nema" });
    add("sponsored_out_of_date", "uskoro", outOfDate, "sponzorisano");
  }

  // Leads, consent and the K3 switches (rules 9, 10, 11, 15).
  const leadKindRight = (tier: FairPackageTier, kind: FairLeadKind) => (kind === "interest" ? rights(tier).interest : rights(tier).testDrive);
  const hasLeadRight = published.some((model) => leadKindRight(model.packageTier, "interest"));
  const hasAdvanced = published.some((model) => model.packageTier === "advanced");
  if (preOrFair) {
    for (const kind of ["interest", "test_drive"] as const) {
      if (facts.consents[kind]) continue;
      const exhibitors = new Set(
        facts.formDefaults
          .filter((row) => row.leadKind === kind && row.enabled && published.some((model) => model.participationId === row.participationId && leadKindRight(model.packageTier, kind)))
          .map((row) => row.participationId),
      );
      add(kind === "interest" ? "interest_form_without_consent" : "test_drive_form_without_consent", P === "sajam" ? "hitno" : "uskoro", exhibitors.size, "leadovi/podesavanja");
    }
  }
  if ((soon || P === "sajam") && hasLeadRight && !facts.switches.leadsEnabled) add("leads_switch_off", P === "sajam" ? "hitno" : "uskoro", 1, "leadovi/podesavanja");
  if (hasAdvanced && !facts.switches.followUpEnabled && (soon || P === "sajam" || (P === "posle" && at < event.followUpAt))) {
    add("follow_up_switch_off", soon ? "uskoro" : "hitno", 1, "leadovi/podesavanja");
  }
  if (P === "sajam" || P === "posle") {
    const leadsTone: FairDashboardTone = P === "sajam" ? "info" : FAIR_LEAD_DELIVERY_DEADLINE_MS - at <= LEADS_URGENT_MS ? "hitno" : "uskoro";
    add("leads_undelivered", leadsTone, facts.leads.undelivered, "leadovi", { isporuka: "ne" }, FAIR_LEAD_DELIVERY_DEADLINE_MS);
  }
  const activeParticipations = facts.participations.filter((row) => row.status === "active");
  const advancedExhibitors = activeParticipations.filter((row) => advancedLive.some((model) => model.participationId === row.id));
  const followUpActive = new Set(facts.followUpActive);
  const withLeads = new Set(facts.leads.participationIds);
  const textMissing = advancedExhibitors.filter((row) => !followUpActive.has(row.id) && (P !== "posle" || withLeads.has(row.id)));
  if (P !== "obrisano") {
    add("follow_up_text_missing", P === "pre" ? "info" : P === "sajam" ? "uskoro" : "hitno", textMissing.length, "leadovi/follow-up", textMissing.length === 1 ? { izlagac: textMissing[0].id } : {});
  }

  // Daily reports (rules 12–14): the newest run of each day × exhibitor decides.
  const pendingReview = facts.reports.filter((row) => row.status === "pending_review").length;
  const failed = facts.reports.filter((row) => row.status === "failed").length;
  const sent = facts.reports.filter((row) => row.status === "sent").length;
  const hasRun = new Set(facts.reports.map((row) => `${row.dayId}|${row.participationId}`));
  const missingDays = new Set<string>();
  let reportsMissing = 0;
  for (const day of days) {
    if (day.endsAt + FAIR_DASHBOARD_REPORT_GRACE_MS > at) continue;
    for (const participation of activeParticipations) {
      const expects = live.some((model) => model.participationId === participation.id && rights(fairDashboardTierAt(model, day.endsAt - 1)).dailyReport);
      if (!expects || hasRun.has(`${day.id}|${participation.id}`)) continue;
      reportsMissing += 1;
      missingDays.add(day.dateKey);
    }
  }
  if (P === "sajam" || P === "posle") {
    add("reports_pending_review", "hitno", pendingReview, "izvestaji", { status: "ceka-odobrenje" });
    add("reports_missing", "uskoro", reportsMissing, "izvestaji", missingDays.size === 1 ? { status: "ceka-podatke", dan: [...missingDays][0] } : { status: "ceka-podatke" });
  }
  if (P !== "obrisano") add("reports_failed", "hitno", failed, "izvestaji", { status: "greska" });

  // Brand passport (rules 16–18), the condition from the catalog (fairBrandPassportProblems).
  const byBrand = new Map<string, FairDashboardModelFact[]>();
  for (const model of models) byBrand.set(model.brandId, [...(byBrand.get(model.brandId) ?? []), model]);
  const eligibleBrands = new Set(
    [...byBrand].filter(([, rows]) => rows.length <= PASSPORT_MODELS_CAP && fairBrandPassportProblems(rows).eligible).map(([brandId]) => brandId),
  );
  const passportOf = new Map(facts.passports.map((row) => [row.brandId, row]));
  const hiddenEligible = [...eligibleBrands].filter((brandId) => passportOf.get(brandId)?.hidden).length;
  const missingPassport = [...eligibleBrands].filter((brandId) => {
    const passport = passportOf.get(brandId);
    return (passport?.freezesAt ?? event.startsAt) <= at && passport?.status !== "published";
  }).length;
  if (preOrFair) {
    add("passport_hidden", "info", hiddenEligible, "interakcije", { stanje: "sakriven" });
    add("passport_blocked", "hitno", facts.blockedPassports, "interakcije", { stanje: "zamrznut" });
  }
  if (P === "sajam") add("passport_missing", "info", missingPassport, "interakcije", { stanje: "nije-napravljen" });

  // Rule 20: days until the 16 Nov purge (count = days, shown also on its last day).
  if (P === "posle") {
    const daysLeft = Math.max(0, Math.floor((event.piiPurgeAt - at) / DAY_MS));
    actions.push({ rule: "pii_purge_countdown", tone: daysLeft <= PURGE_SOON_DAYS ? "uskoro" : "info", count: daysLeft, section: "brisanje", query: {} });
  }

  // KPI row and section cards (a feature no model has is null: no fake zeros).
  const byTier = { included: 0, starter: 0, advanced: 0 };
  for (const model of live) byTier[model.packageTier] += 1;
  const kpiDay = openDay ?? nextDay;
  const kpiRequired = kpiDay ? askers.length : 0;
  const expectsReports = live.some((model) => rights(model.packageTier).dailyReport) || facts.reports.length > 0;
  const formExhibitors = new Set(facts.formDefaults.filter((row) => row.enabled).map((row) => row.participationId)).size;

  return {
    at,
    phase,
    event: { startsAt: event.startsAt, endsAt: event.endsAt, piiPurgeAt: event.piiPurgeAt },
    days: days.map((day) => ({ dateKey: day.dateKey, label: day.label, startsAt: day.startsAt, endsAt: day.endsAt })),
    actions: sortFairDashboardActions(actions),
    kpis: {
      models: { published: published.length, total: live.length, byTier },
      qr: { assigned: facts.assignments, inventory: facts.inventory.total, inventoryCapped: facts.inventory.capped },
      scans: facts.scans,
      leads: live.some((model) => leadKindRight(model.packageTier, "interest")) || facts.leads.total > 0
        ? { newToday: facts.leads.newToday, undelivered: facts.leads.undelivered, total: facts.leads.total, capped: facts.leads.capped }
        : null,
      questions: kpiDay && kpiRequired > 0
        ? { dateKey: kpiDay.dateKey, label: kpiDay.label, today: kpiDay === openDay, covered: kpiRequired - missingOn(kpiDay.id), required: kpiRequired, capped: facts.questionsCapped }
        : null,
      reports: expectsReports ? { pendingReview } : null,
    },
    sections: {
      modeli: {
        published: published.length,
        draft: models.filter((model) => model.status === "draft").length,
        withdrawn: models.filter((model) => model.status === "withdrawn").length,
        withErrors: live.filter((model) => model.errors > 0).length,
      },
      qr: { assigned: facts.assignments, publishedWithoutQr, onWithdrawn, inventory: facts.inventory.total },
      interakcije: {
        questions: facts.questions.length,
        passports: facts.passports.filter((row) => row.status === "published" && !row.hidden).length,
        passportsHidden: facts.passports.filter((row) => row.hidden).length,
        formExhibitors,
      },
      leadovi: live.some((model) => leadKindRight(model.packageTier, "interest")) || facts.leads.total > 0
        ? { total: facts.leads.total, undelivered: facts.leads.undelivered, followUpActive: advancedExhibitors.filter((row) => followUpActive.has(row.id)).length, followUpNeeded: advancedExhibitors.length }
        : null,
      sponzorisano: advancedLive.length || facts.sponsoredItems?.length
        ? { autoPublish: event.sponsoredAutoPublish, inList: facts.sponsoredItems?.length ?? 0, due: due.length, withoutQuestion: dueWithoutQuestion }
        : null,
      izvestaji: expectsReports ? { pendingReview, failed, sent } : null,
      izlagaci: { active: activeParticipations.length, total: facts.participations.length, withAdvanced: advancedExhibitors.length },
    },
  };
}
