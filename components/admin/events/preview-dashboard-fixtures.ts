import type { EventDashboardData } from "@/components/admin/events/dashboard-logic";
import { FAIR_LEAD_DELIVERY_DEADLINE_MS, FAIR_PII_PURGE_AT_MS, sortFairDashboardActions } from "@/lib/fair-contract";

// Admin UX A10 — TEST results of fairDashboard.getEventDashboard for the dev
// preview `/dev/admin-events-preview/pregled?faza=pre|sajam|posle` (default
// sajam). Numbers are TEST values in the size of the preview catalog (4 TEST
// exhibitors, ~40 TEST models, 100 TEST QR codes); nothing real is invented.

export type PreviewPhase = "pre" | "sajam" | "posle";

const DAY_MS = 86_400_000;
const START = Date.parse("2026-10-09T00:00:00+02:00");
const END = Date.parse("2026-10-12T00:00:00+02:00");
const days = ["2026-10-09", "2026-10-10", "2026-10-11"].map((dateKey, index) => ({ dateKey, label: `TEST dan ${index + 1}`, startsAt: START + index * DAY_MS, endsAt: START + (index + 1) * DAY_MS }));
const base = { event: { startsAt: START, endsAt: END, piiPurgeAt: FAIR_PII_PURGE_AT_MS }, days };
const byTier = { included: 9, starter: 18, advanced: 10 };
const modelsKpi = (published: number) => ({ published, total: 37, byTier });

type Action = EventDashboardData["actions"][number];
const act = (rule: Action["rule"], tone: Action["tone"], count: number, section: Action["section"], query: Record<string, string> = {}, deadlineAt?: number): Action =>
  ({ rule, tone, count, section, query, ...(deadlineAt !== undefined ? { deadlineAt } : {}) });

const PRE: EventDashboardData = {
  ...base,
  at: Date.parse("2026-10-07T10:00:00+02:00"),
  phase: { kind: "pre", dayIndex: null, dayCount: 3, dayOpen: false, nextDeadline: { kind: "opening", at: START } },
  actions: sortFairDashboardActions([
    act("published_without_qr", "hitno", 9, "modeli", { status: "objavljen", qr: "nema" }),
    act("drafts_with_errors", "uskoro", 4, "modeli", { status: "nacrt", problemi: "greske" }),
    act("price_missing", "uskoro", 1, "modeli", { problemi: "upozorenja" }),
    act("question_missing_next_day", "uskoro", 6, "interakcije", { dan: "2026-10-09" }),
    act("sponsored_question_missing", "uskoro", 3, "sponzorisano"),
    act("advanced_photo_missing", "uskoro", 7, "modeli", { paket: "napredni", foto: "nema" }),
    act("interest_form_without_consent", "uskoro", 2, "leadovi/podesavanja"),
    act("leads_switch_off", "uskoro", 1, "leadovi/podesavanja"),
    act("follow_up_switch_off", "uskoro", 1, "leadovi/podesavanja"),
    act("follow_up_text_missing", "info", 2, "leadovi/follow-up"),
    act("passport_hidden", "info", 1, "interakcije", { stanje: "sakriven" }),
  ]),
  kpis: {
    models: modelsKpi(31),
    qr: { assigned: 22, inventory: 100, inventoryCapped: false },
    scans: { today: 0, total: 0, uniqueToday: 0, uniqueTotal: 0, capped: false },
    leads: { newToday: 0, undelivered: 0, total: 0, capped: false },
    questions: { dateKey: "2026-10-09", label: "TEST dan 1", today: false, covered: 14, required: 20, capped: false },
    reports: { pendingReview: 0 },
  },
  sections: {
    modeli: { published: 31, draft: 6, withdrawn: 3, withErrors: 4 },
    qr: { assigned: 22, publishedWithoutQr: 9, onWithdrawn: 0, inventory: 100 },
    interakcije: { questions: 14, passports: 3, passportsHidden: 1, formExhibitors: 2 },
    leadovi: { total: 0, undelivered: 0, followUpActive: 2, followUpNeeded: 4 },
    sponzorisano: { autoPublish: true, inList: 7, due: 10, withoutQuestion: 3 },
    izvestaji: { pendingReview: 0, failed: 0, sent: 0 },
    izlagaci: { active: 4, total: 4, withAdvanced: 4 },
  },
};

const SAJAM: EventDashboardData = {
  ...base,
  at: Date.parse("2026-10-10T10:40:00+02:00"),
  phase: { kind: "sajam", dayIndex: 2, dayCount: 3, dayOpen: true, nextDeadline: { kind: "day_end", at: START + 2 * DAY_MS } },
  actions: sortFairDashboardActions([
    act("question_missing_today", "hitno", 5, "interakcije", { dan: "2026-10-10" }),
    act("reports_pending_review", "hitno", 3, "izvestaji", { status: "ceka-odobrenje" }),
    act("published_without_qr", "hitno", 2, "modeli", { status: "objavljen", qr: "nema" }),
    act("reports_failed", "hitno", 1, "izvestaji", { status: "greska" }),
    act("sponsored_question_missing", "uskoro", 1, "sponzorisano"),
    act("follow_up_text_missing", "uskoro", 2, "leadovi/follow-up"),
    act("leads_undelivered", "info", 14, "leadovi", { isporuka: "ne" }, FAIR_LEAD_DELIVERY_DEADLINE_MS),
    act("advanced_photo_missing", "info", 6, "modeli", { paket: "napredni", foto: "nema" }),
    act("passport_missing", "info", 1, "interakcije", { stanje: "nije-napravljen" }),
  ]),
  kpis: {
    models: modelsKpi(34),
    qr: { assigned: 33, inventory: 100, inventoryCapped: false },
    scans: { today: 412, total: 1286, uniqueToday: 288, uniqueTotal: 903, capped: false },
    leads: { newToday: 9, undelivered: 14, total: 23, capped: false },
    questions: { dateKey: "2026-10-10", label: "TEST dan 2", today: true, covered: 15, required: 20, capped: false },
    reports: { pendingReview: 3 },
  },
  sections: {
    modeli: { published: 34, draft: 3, withdrawn: 3, withErrors: 0 },
    qr: { assigned: 33, publishedWithoutQr: 2, onWithdrawn: 0, inventory: 100 },
    interakcije: { questions: 41, passports: 3, passportsHidden: 0, formExhibitors: 4 },
    leadovi: { total: 23, undelivered: 14, followUpActive: 2, followUpNeeded: 4 },
    sponzorisano: { autoPublish: true, inList: 10, due: 10, withoutQuestion: 1 },
    izvestaji: { pendingReview: 3, failed: 1, sent: 4 },
    izlagaci: { active: 4, total: 4, withAdvanced: 4 },
  },
};

const POSLE: EventDashboardData = {
  ...base,
  at: Date.parse("2026-10-20T10:00:00+02:00"),
  phase: { kind: "posle", dayIndex: null, dayCount: 3, dayOpen: false, nextDeadline: { kind: "lead_delivery", at: FAIR_LEAD_DELIVERY_DEADLINE_MS } },
  actions: sortFairDashboardActions([
    act("follow_up_text_missing", "hitno", 1, "leadovi/follow-up", { izlagac: "p-c" }),
    act("reports_pending_review", "hitno", 1, "izvestaji", { status: "ceka-odobrenje" }),
    act("leads_undelivered", "uskoro", 23, "leadovi", { isporuka: "ne" }, FAIR_LEAD_DELIVERY_DEADLINE_MS),
    act("pii_purge_countdown", "info", 26, "brisanje"),
  ]),
  kpis: {
    models: modelsKpi(34),
    qr: { assigned: 33, inventory: 100, inventoryCapped: false },
    scans: { today: 0, total: 3954, uniqueToday: 0, uniqueTotal: 2710, capped: false },
    leads: { newToday: 0, undelivered: 23, total: 61, capped: false },
    questions: null,
    reports: { pendingReview: 1 },
  },
  sections: {
    modeli: { published: 34, draft: 3, withdrawn: 3, withErrors: 0 },
    qr: { assigned: 33, publishedWithoutQr: 0, onWithdrawn: 0, inventory: 100 },
    interakcije: { questions: 118, passports: 3, passportsHidden: 0, formExhibitors: 4 },
    leadovi: { total: 61, undelivered: 23, followUpActive: 3, followUpNeeded: 4 },
    sponzorisano: { autoPublish: true, inList: 10, due: 10, withoutQuestion: 0 },
    izvestaji: { pendingReview: 1, failed: 0, sent: 11 },
    izlagaci: { active: 4, total: 4, withAdvanced: 4 },
  },
};

const PREVIEW_DASHBOARDS: Record<PreviewPhase, EventDashboardData> = { pre: PRE, sajam: SAJAM, posle: POSLE };

/** `?faza=` of the preview (default sajam). */
export function previewDashboard(faza: string | undefined): EventDashboardData {
  return PREVIEW_DASHBOARDS[faza === "pre" || faza === "posle" ? faza : "sajam"];
}
