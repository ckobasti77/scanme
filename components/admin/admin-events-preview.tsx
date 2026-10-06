"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type {
  CatalogView,
  DryRunView,
  EventClientView,
  EventsActions,
  InventoryRowView,
  ModelView,
  QrActions,
  QrBulkActions,
  QrBulkDryRunView,
  QrBulkInput,
  QrBulkRowView,
  QrDetailView,
  QrScanStatsView,
} from "@/components/admin/admin-events";
import { AdminEventsPassports, AdminEventsQuestions, AdminEventsSurveys, type InteractionsActions, type InteractionsView } from "@/components/admin/admin-events-interactions";
import {
  AdminEventsConsent,
  AdminEventsFollowUp,
  AdminEventsLeadForms,
  AdminEventsLeadList,
  type LeadsActions,
  type LeadsModelSettings,
  type LeadsView,
} from "@/components/admin/admin-events-leads";
import { AdminEventsReports, type ReportsActions, type ReportsView } from "@/components/admin/admin-events-reports";
import { AdminEventsRetention, type RetentionActions, type RetentionView } from "@/components/admin/admin-events-retention";
import { AdminEventsSponsored, type SponsoredActions, type SponsoredView } from "@/components/admin/admin-events-sponsored";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { AdminEventFrameView, type FrameEvent } from "@/components/admin/events/event-frame-view";
import { AdminEventsNotFound } from "@/components/admin/events/event-not-found";
import { EventExhibitorsView } from "@/components/admin/events/sections/izlagaci-view";
import { EventImportView, importContextFromCatalog } from "@/components/admin/events/sections/import-view";
import { EventModelDetailView, EventModelsView, type ModelDetailSummary } from "@/components/admin/events/sections/modeli-view";
import { EventOverviewView } from "@/components/admin/events/sections/pregled-view";
import { EventQrDetailView, EventQrView } from "@/components/admin/events/sections/qr-view";
import {
  eventDetailHref,
  eventNavGroups,
  eventSectionHref,
  switchEventHref,
  type EventSectionPath,
  type ResolvedEventSection,
} from "@/lib/admin-v1/event-sections";
import { buildExhibitorRows } from "@/lib/admin-v1/exhibitors";
import { modelListQuery } from "@/lib/admin-v1/model-filters";
import { qrListQuery } from "@/lib/admin-v1/qr-filters";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { parseViewModeParam, type AdminViewMode } from "@/lib/admin-v1/view-mode";
import type { FairImportPayload } from "@/lib/fair-import/to-payload";
import { FAIR_PII_PURGE_AT_MS, FAIR_PURGE_CATEGORIES } from "@/lib/fair-contract";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Static TEST fixture of the `Događaji` sections (mirrors the B1 DEV TEST
// catalog) for visual checks without an admin session or Convex. Admin UX
// A2: every section is shown on the same path as in the admin —
// `/dev/admin-events-preview/<sekcija>[/<id>]`; `?dogadjaj=` picks the TEST
// event and `?prikaz=` the list view. Actions do not execute.

const opening = Date.parse("2026-10-09T09:00:00+02:00");

// A3 — 4 TEST exhibitors with 2 TEST brands each (8 brands) and 40 TEST
// models, so the Modeli filters, groups and counts can be checked at the
// real catalog size. No real brands, prices, photos or codes.
const EXHIBITORS = [
  { id: "p-a", name: "TEST Izlagač A", stand: "TEST štand A1 · TEST-A1", brands: [["b-volta", "TEST Volta"], ["b-amper", "TEST Amper"]] },
  { id: "p-b", name: "TEST Izlagač B", stand: "TEST štand B1 · TEST-B1", brands: [["b-om", "TEST Om"], ["b-kulon", "TEST Kulon"]] },
  { id: "p-c", name: "TEST Izlagač C", stand: "TEST štand C1 · TEST-C1", brands: [["b-faradej", "TEST Faradej"], ["b-dzul", "TEST Džul"]] },
  { id: "p-d", name: "TEST Izlagač D", stand: "TEST štand D1 · TEST-D1", brands: [["b-vat", "TEST Vat"], ["b-njutn", "TEST Njutn"]] },
] as const;
const brandOf = (brandId: string) => {
  for (const exhibitor of EXHIBITORS) for (const [id, name] of exhibitor.brands) if (id === brandId) return { exhibitor, name };
  throw new Error(`unknown TEST brand ${brandId}`);
};

function model(id: string, displayName: string, brandId: string, tier: ModelView["tier"], extra: Partial<ModelView> = {}): ModelView {
  const { exhibitor, name } = brandOf(brandId);
  return {
    id, externalKey: `test-em26-${id}`, displayName, slug: `test-${id}`, participationId: exhibitor.id, brandId, brandName: name, exhibitorName: exhibitor.name,
    standLabel: exhibitor.stand, tier, status: "published", priceText: "TEST cena", specCount: 3, highlightCount: 1, hasPhoto: false, photoUrl: null,
    passportEligible: tier !== "included", packageActivatedAt: opening, qrCode: null, qrSmq: null,
    issues: [{ severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }, { severity: "warning", code: "FAIR_QR_MISSING", path: "qr" }],
    ...extra,
  };
}

/** Generated TEST models: a deterministic mix of packages, statuses, QR, uploaded photo and problems. */
function generatedModels(brandId: string, count: number, offset: number): ModelView[] {
  const { name } = brandOf(brandId);
  const tiers: ModelView["tier"][] = ["starter", "advanced", "included", "starter"];
  return Array.from({ length: count }, (_, step) => {
    const n = offset + step;
    const id = `${brandId.slice(2)}-m${step + 1}`;
    const hasQr = n % 4 !== 1;
    const hasPhoto = n % 5 === 0;
    const broken = n % 9 === 4;
    const issues: ModelView["issues"] = [
      ...(broken ? [{ severity: "error" as const, code: "FAIR_SPECIFICATIONS_INVALID", path: "specifications" }] : []),
      ...(hasPhoto ? [] : [{ severity: "warning" as const, code: "FAIR_PHOTO_MISSING", path: "photoUrl" }]),
      ...(hasQr ? [] : [{ severity: "warning" as const, code: "FAIR_QR_MISSING", path: "qr" }]),
    ];
    return model(id, `${name} M${step + 1}`, brandId, tiers[n % tiers.length], {
      ...(step % 3 === 1 ? { variant: "TEST Long Range" } : {}),
      status: broken ? "draft" : n % 11 === 6 ? "withdrawn" : "published",
      hasPhoto,
      qrCode: hasQr ? `TQ${String(n).padStart(3, "0")}KXM` : null,
      qrSmq: hasQr ? `SMQ-TEST-${String(n + 100).padStart(4, "0")}` : null,
      issues,
    });
  });
}

const catalog: CatalogView = {
  days: [{ dateKey: "2026-10-09", label: "TEST dan 1" }, { dateKey: "2026-10-10", label: "TEST dan 2" }, { dateKey: "2026-10-11", label: "TEST dan 3" }],
  participations: [
    { id: "p-a", externalKey: "test-em26-izlagac-a", accountId: "a-a", exhibitorName: "TEST Izlagač A", codes: "SMK-TEST-FAIR-A · SML-TEST-FAIR-A", smkCode: "SMK-TEST-FAIR-A", smlCode: "SML-TEST-FAIR-A", segment: "event_only", status: "active" },
    { id: "p-b", externalKey: "test-em26-izlagac-b", accountId: "a-b", exhibitorName: "TEST Izlagač B", codes: "SMK-TEST-FAIR-B · SML-TEST-FAIR-B", smkCode: "SMK-TEST-FAIR-B", smlCode: "SML-TEST-FAIR-B", segment: "standard", status: "active" },
    { id: "p-c", externalKey: "test-em26-izlagac-c", accountId: "a-c", exhibitorName: "TEST Izlagač C", codes: "SMK-TEST-FAIR-C · SML-TEST-FAIR-C", smkCode: "SMK-TEST-FAIR-C", smlCode: "SML-TEST-FAIR-C", segment: "event_only", status: "active" },
    { id: "p-d", externalKey: "test-em26-izlagac-d", accountId: "a-d", exhibitorName: "TEST Izlagač D", codes: "SMK-TEST-FAIR-D · SML-TEST-FAIR-D", smkCode: "SMK-TEST-FAIR-D", smlCode: "SML-TEST-FAIR-D", segment: "standard", status: "active" },
  ],
  stands: [
    { id: "s-a1", participationId: "p-a", externalKey: "test-em26-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "test-loc-em-a1", exhibitorName: "TEST Izlagač A", status: "active" },
    { id: "s-b1", participationId: "p-b", externalKey: "test-em26-stand-b1", code: "TEST-B1", displayName: "TEST štand B1", mapLocationId: "test-loc-em-b1", exhibitorName: "TEST Izlagač B", status: "active" },
    { id: "s-c1", participationId: "p-c", externalKey: "test-em26-stand-c1", code: "TEST-C1", displayName: "TEST štand C1", mapLocationId: "test-loc-em-c1", exhibitorName: "TEST Izlagač C", status: "active" },
    { id: "s-d1", participationId: "p-d", externalKey: "test-em26-stand-d1", code: "TEST-D1", displayName: "TEST štand D1", mapLocationId: "test-loc-em-d1", exhibitorName: "TEST Izlagač D", status: "active" },
  ],
  models: [
    model("volta-x1", "TEST Volta X1", "b-volta", "advanced", { variant: "TEST Premium", highlightCount: 4, specCount: 5, qrCode: "7KQ2M9XA", qrSmq: "SMQ-TEST-0001", issues: [{ severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }] }),
    model("volta-x2", "TEST Volta X2", "b-volta", "starter"),
    model("om-z2", "TEST Om Z2", "b-om", "included", { status: "draft", priceText: "Cena na upit", issues: [{ severity: "error", code: "FAIR_SPECIFICATIONS_INVALID", path: "specifications" }, { severity: "warning", code: "FAIR_PRICE_MISSING", path: "priceText" }] }),
    ...generatedModels("b-volta", 3, 0),
    ...generatedModels("b-amper", 5, 3),
    ...generatedModels("b-om", 4, 8),
    ...generatedModels("b-kulon", 5, 12),
    ...generatedModels("b-faradej", 5, 17),
    ...generatedModels("b-dzul", 5, 22),
    ...generatedModels("b-vat", 5, 27),
    ...generatedModels("b-njutn", 5, 32),
  ],
  qrConfigured: true,
};

const ok = async () => ({ ok: true as const });
const actions: EventsActions = {
  publish: ok,
  withdraw: ok,
  upgrade: ok,
  assignQr: ok,
  releaseQr: ok,
  resolveTest: async () => ({ ok: true, value: { outcome: "fair_model", problem: null, path: "/sajam/test-elektromobilnost-2026/model/test-volta-x1-test-premium" } }),
  dryRun: async () => ({ ok: true, value: { ok: true, issues: [{ severity: "warning", code: "FAIR_PRICE_MISSING", path: "participations[0].brands[0].models[1].priceText" }], summary: { participations: { new: 0, existing: 2 }, stands: { new: 0, existing: 2 }, models: { new: 1, existing: 2 }, upgrades: 0, qrAssignments: 0 } } }),
  commit: async () => ({ ok: true, value: { committed: true, issues: [], results: { participations: { created: 0, updated: 0, unchanged: 2 }, stands: { created: 0, updated: 0, unchanged: 2 }, models: { created: 1, updated: 0, unchanged: 2 }, upgrades: 0, qrAssignments: 0 } } }),
  convert: ok,
};

const interactions: InteractionsView = {
  models: [
    { id: "volta-x1", name: "TEST Volta X1 TEST Premium", brandName: "TEST Volta", tier: "advanced" },
    { id: "volta-x2", name: "TEST Volta X2", brandName: "TEST Volta", tier: "starter" },
  ],
  days: catalog.days.map((day, index) => ({ id: `d${index + 1}`, label: day.label })),
  questions: [
    { id: "q1", modelId: "volta-x1", dayLabel: "TEST dan 1", prompt: "TEST pitanje Glasa publike", options: [{ id: "o1", label: "TEST opcija 1", order: 1 }, { id: "o2", label: "TEST opcija 2", order: 2 }], status: "published", sortOrder: 1, showOnSponsoredRotation: true },
    { id: "q2", modelId: "volta-x2", dayLabel: "TEST dan 1", prompt: "TEST pitanje u nacrtu", options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }], status: "draft", sortOrder: 1, showOnSponsoredRotation: false },
  ],
  surveys: [{ id: "s1", modelId: "volta-x1", version: 1, status: "published", questionCount: 2 }],
  passports: [
    { id: "p1", brandId: "b-volta", brandName: "TEST Volta", status: "draft", members: [] },
    { id: null, brandId: "b-om", brandName: "TEST Om", status: null, members: [] },
  ],
};
const interactionActions: InteractionsActions = {
  saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok,
  retireSurvey: ok, openPassport: ok, publishPassport: ok, withdrawPassport: ok, removePassportModel: ok,
};

const noMore = { canLoadMore: false, loadingMore: false, onLoadMore: () => undefined, status: "ready" as const };

const advancedSettings: LeadsModelSettings = {
  tier: "advanced",
  interest: { contactRequirement: "one_of", enabled: true },
  testDrive: { contactRequirement: "both", preferredContact: "phone", enabled: true },
  followUpTemplate: null,
};
const starterSettings: LeadsModelSettings = { tier: "starter", interest: { contactRequirement: "one_of", enabled: true }, testDrive: null, followUpTemplate: null };

// B4 — Leadovi: TEST consent drafts, settings and two TEST leads (no real contact data).
const leadsView: LeadsView = {
  models: [
    { id: "volta-x2", name: "TEST Volta X2", exhibitorName: "TEST Izlagač A", tier: "advanced" },
    { id: "volta-x1", name: "TEST Volta X1 TEST Premium", exhibitorName: "TEST Izlagač A", tier: "starter" },
  ],
  participations: [{ id: "p-a", exhibitorName: "TEST Izlagač A" }, { id: "p-b", exhibitorName: "TEST Izlagač B" }],
  consents: [{ id: "consent-1", kind: "interest", version: 1, status: "draft", text: "TEST nacrt saglasnosti — ScanMe prosleđuje kontakt izlagaču {izlagac}." }],
  modelId: "volta-x2",
  onSelectModel: () => undefined,
  modelSettings: advancedSettings,
  participationId: "p-a",
  onSelectParticipation: () => undefined,
  leads: { ...noMore, rows: [
    {
      id: "lead-1", createdAt: opening + 3_600_000, kind: "test_drive", modelName: "TEST Volta X2", contactName: "TEST Posetilac Sa Veoma Dugim Imenom i Prezimenom",
      email: "test.posetilac.sa.dugom.adresom@example.invalid", phone: "+381 60 000 0001", consentVersion: 1, followUpSuppressed: false,
      confirmation: { id: "delivery-1", status: "sent", scheduledFor: opening + 3_600_000 },
      followUp: { id: "delivery-2", status: "queued", scheduledFor: Date.parse("2026-10-13T10:00:00+02:00") },
    },
    {
      id: "lead-2", createdAt: opening + 7_200_000, kind: "interest", modelName: "TEST Volta X1 TEST Premium", contactName: "TEST Posetilac Dva",
      email: "test.dva@example.invalid", consentVersion: 1, followUpSuppressed: false, confirmation: { id: "delivery-3", status: "failed", scheduledFor: opening, lastError: "PROVIDER_UNAVAILABLE:503" }, followUp: null,
    },
  ] },
};
const leadActions: LeadsActions = {
  saveConsentDraft: ok, activateConsent: ok, retireConsent: ok, saveLeadConfig: ok, saveFollowUpTemplate: ok, setSuppressed: ok, retryDelivery: ok,
};

// B5 — Sponzorisano: a published TEST list that is out of date (a model was
// upgraded after the publish and its map result changed). No real data.
const sponsoredView: SponsoredView = {
  models: [
    { id: "volta-x1", name: "TEST Volta X1 TEST Premium", brandName: "TEST Volta" },
    { id: "volta-x2", name: "TEST Volta X2", brandName: "TEST Volta" },
    { id: "om-z2", name: "TEST Om Z2", brandName: "TEST Om" },
  ],
  active: { version: 2, publishedAt: opening - 3_600_000, items: [{ modelId: "volta-x1", order: 0, questionId: "q1" }] },
  history: [
    { id: "snap-2", version: 2, status: "published", publishedAt: opening - 3_600_000 },
    { id: "snap-1", version: 1, status: "retired", publishedAt: opening - 86_400_000 },
  ],
  candidates: [
    { modelId: "volta-x1", activatedAt: opening - 86_400_000 },
    { modelId: "volta-x2", activatedAt: opening - 1_800_000, questionId: "q3" },
  ],
  questions: [
    { id: "q1", modelId: "volta-x1", prompt: "TEST pitanje Glasa publike", status: "published" },
    { id: "q3", modelId: "volta-x2", prompt: "TEST pitanje modela X2 sa dužim tekstom koji mora da se prelomi na telefonu", status: "published" },
  ],
  now: opening,
};
const sponsoredActions: SponsoredActions = { publish: ok, setResult: ok };

// A1 — Izveštaji and Brisanje podataka (TEST runs, no dataset under review, no PII).
const reportsView: ReportsView = {
  days: catalog.days.map((day, index) => ({ id: `d${index + 1}`, label: day.label, dateKey: day.dateKey })),
  participations: [{ id: "p-a", name: "TEST Izlagač A" }, { id: "p-b", name: "TEST Izlagač B" }],
  runs: [
    { id: "run-1", dayLabel: "TEST dan 1", dateKey: "2026-10-09", participationId: "p-a", exhibitorName: "TEST Izlagač A", status: "pending_review", format: "pdf", createdAt: opening + 54_000_000, hasFile: true, sendCount: 0, lastDelivery: null },
    { id: "run-2", dayLabel: "TEST dan 1", dateKey: "2026-10-09", participationId: "p-b", exhibitorName: "TEST Izlagač B", status: "approved", format: "xlsx", createdAt: opening + 54_100_000, hasFile: true, approvedAt: opening + 55_000_000, recipient: "test.izlagac@example.invalid", sendCount: 0, lastDelivery: null },
    { id: "run-3", dayLabel: "TEST dan 1", dateKey: "2026-10-09", participationId: "p-a", exhibitorName: "TEST Izlagač A", status: "failed", format: "csv", createdAt: opening + 54_200_000, hasFile: true, error: "PROVIDER_UNAVAILABLE:503", sendCount: 1, lastDelivery: { status: "failed", lastError: "PROVIDER_UNAVAILABLE:503" } },
  ],
  review: null,
};
const reportsActions: ReportsActions = {
  build: ok, approve: ok, send: ok, resend: ok, retry: ok, correct: ok, download: ok, exportLeads: ok, exportOrganizer: ok, review: () => undefined,
};
const retentionView: RetentionView = {
  purgeAt: FAIR_PII_PURGE_AT_MS,
  capPerCategory: 200,
  preview: FAIR_PURGE_CATEGORIES.map((category, index) => ({ category, count: index, capped: false })),
  runs: [
    { id: "purge-1", mode: "dry_run", trigger: "admin", status: "completed", startedAt: opening - 86_400_000, finishedAt: opening - 86_399_000, batches: 2, totalRows: 14, categories: FAIR_PURGE_CATEGORIES.slice(0, 2).map((category) => ({ category, rows: 7, status: "done" as const })) },
  ],
};
const retentionActions: RetentionActions = { startDryRun: ok };

/** A3 — the detail's linked summaries from the TEST fixtures above (leads: fixed TEST numbers). */
function modelSummary(modelId: string): ModelDetailSummary {
  const ofModel = interactions.questions.filter((question) => question.modelId === modelId);
  const days = [...new Set(ofModel.map((question) => question.dayLabel))];
  const survey = interactions.surveys.find((row) => row.modelId === modelId);
  const brandId = catalog.models.find((row) => row.id === modelId)?.brandId;
  const passport = interactions.passports.find((row) => row.brandId === brandId && row.status);
  const settings = leadsView.models.find((row) => row.id === modelId)?.tier === "advanced" ? advancedSettings : starterSettings;
  const active = sponsoredView.active?.items.find((item) => item.modelId === modelId);
  return {
    questions: days.map((dayLabel) => {
      const count = (status: string) => ofModel.filter((question) => question.dayLabel === dayLabel && question.status === status).length;
      return { dayLabel, published: count("published"), draft: count("draft"), closed: count("closed") };
    }),
    survey: survey ? { version: survey.version, status: survey.status } : null,
    passport: passport?.status ? { status: passport.status, member: passport.members.some((member) => member.modelId === modelId) } : null,
    forms: { interest: Boolean(settings.interest?.enabled), testDrive: Boolean(settings.testDrive?.enabled) },
    leads: modelId === "volta-x1" ? { interest: 1, testDrive: 0, undelivered: 1, capped: false } : { interest: 0, testDrive: 0, undelivered: 0, capped: false },
    sponsored: active ? { state: "active", order: active.order + 1 } : sponsoredView.candidates.some((row) => row.modelId === modelId) ? { state: "candidate" } : { state: "none" },
  };
}

const PREVIEW_BASE = "/dev/admin-events-preview";
const PREVIEW_EVENTS: FrameEvent[] = [
  { slug: "test-elektromobilnost-2026", title: "TEST Sajam elektromobilnosti", status: "published" },
  { slug: "test-auto-moto-fest-2026", title: "TEST Auto Moto Fest", status: "published" },
];

// A4 — the TEST QR inventory: one code per model that has a QR (this event),
// plus free codes, codes of the other TEST event and codes out of service —
// 105 TEST codes in every state. No real codes or scan numbers.
const pad = (value: number, size: number) => String(value).padStart(size, "0");
const inventoryRows: InventoryRowView[] = [
  ...catalog.models.filter((row) => row.qrCode).map((row) => ({
    cardId: `card-${row.id}`, resolverCode: row.qrCode!, smqCode: row.qrSmq, state: "active" as const, problemReason: null,
    assignment: { modelId: row.id, sameEvent: true },
  })),
  ...Array.from({ length: 58 }, (_, index) => ({
    cardId: `card-free-${index}`, resolverCode: `TF${pad(index, 3)}QRS`, smqCode: `SMQ-TEST-${pad(index + 300, 4)}`, state: "problem" as const,
    problemReason: index % 7 === 3 ? "destination_fair_unassigned" : "destination_missing", assignment: null,
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    cardId: `card-amf-${index}`, resolverCode: `TD${pad(index, 3)}QRS`, smqCode: `SMQ-TEST-${pad(index + 500, 4)}`, state: "active" as const, problemReason: null,
    assignment: { modelId: `amf-m${index + 1}`, sameEvent: false },
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    cardId: `card-off-${index}`, resolverCode: `TN${pad(index, 3)}QRS`, smqCode: `SMQ-TEST-${pad(index + 600, 4)}`, state: index % 2 ? "inactive" as const : "problem" as const,
    problemReason: index % 2 ? null : "health_damaged", assignment: null,
  })),
];
const inventory = { ...noMore, rows: inventoryRows };

/** Deterministic TEST scan numbers of the codes that lead to a model of this event. */
const qrStats = new Map<string, QrScanStatsView>(inventoryRows.map((row, index): [string, QrScanStatsView] => {
  if (!row.assignment?.sameEvent) return [row.cardId, { total: null, unique: null, lastScanAt: row.state === "active" && row.assignment ? opening - 86_400_000 : null }];
  const total = row.resolverCode === "7KQ2M9XA" ? 12 : (index * 7) % 41;
  return [row.cardId, { total, unique: Math.round(total * 0.7), lastScanAt: total ? opening + ((index * 37) % 480) * 60_000 : null }];
}));

/** The QR detail of one TEST code (URL by resolver code or SMQ); null = not in the TEST inventory. */
function qrDetailFixture(code: string): QrDetailView | null {
  const text = code.toUpperCase();
  const row = inventoryRows.find((entry) => entry.resolverCode === text || entry.smqCode === text);
  if (!row) return null;
  const rowModel = row.assignment?.sameEvent ? catalog.models.find((entry) => entry.id === row.assignment!.modelId) ?? null : null;
  const assignedAt = opening - 2 * 86_400_000;
  const stats = qrStats.get(row.cardId)!;
  const history: QrDetailView["history"] = [];
  if (row.assignment) {
    history.push({
      assignmentId: `as-${row.cardId}`, status: "assigned", sameEvent: row.assignment.sameEvent, eventModelId: row.assignment.modelId,
      modelLabel: rowModel ? `${rowModel.displayName}${rowModel.variant ? ` ${rowModel.variant}` : ""}` : "TEST AMF model", assignedAt, releasedAt: null, reason: "TEST dodela iz tabele nalepnica",
    });
  }
  if (row.resolverCode === "7KQ2M9XA" || row.problemReason === "destination_fair_unassigned") {
    history.push({
      assignmentId: `as-old-${row.cardId}`, status: "released", sameEvent: true, eventModelId: "volta-x2", modelLabel: "TEST Volta X2",
      assignedAt: assignedAt - 86_400_000, releasedAt: assignedAt, reason: "TEST pogrešna nalepnica na štandu",
    });
  }
  return {
    cardId: row.cardId, accessChannelId: `channel-${row.cardId}`, resolverCode: row.resolverCode, smqCode: row.smqCode,
    channelState: row.state ?? "problem", problemReason: row.problemReason, redirectEnabled: row.state !== "inactive",
    totalScansAllTime: (stats.total ?? 0) + 3,
    current: row.assignment ? {
      assignmentId: `as-${row.cardId}`, sameEvent: row.assignment.sameEvent, eventTitle: row.assignment.sameEvent ? "TEST Sajam elektromobilnosti" : "TEST Auto Moto Fest",
      eventModelId: row.assignment.modelId, modelLabel: history[0]?.modelLabel ?? null, modelStatus: rowModel?.status ?? "published",
      path: rowModel ? `/sajam/test-elektromobilnost-2026/model/${rowModel.slug}` : "/sajam/test-auto-moto-fest-2026/model/test-amf-model",
      assignedAt, reason: "TEST dodela iz tabele nalepnica",
    } : null,
    history,
    historyCapped: false,
    stats: rowModel && stats.total !== null ? { total: stats.total, unique: stats.unique ?? 0 } : null,
    lastScanAt: stats.lastScanAt,
  };
}

const qrActions: QrActions = { reassign: ok, assign: ok, release: ok, resolveTest: actions.resolveTest };

/** TEST dry run with the backend's rules (unknown code, code taken, model has a QR, duplicates); writes nothing. */
function previewBulkPlan(rows: QrBulkInput[]): QrBulkDryRunView {
  const find = (code: string) => inventoryRows.find((entry) => entry.resolverCode === code.trim().toUpperCase() || entry.smqCode === code.trim().toUpperCase());
  const findModel = (text: string) => catalog.models.find((entry) => entry.externalKey === text.trim().toLowerCase() || entry.id === text.trim());
  const codeUses = new Map<string, number>();
  const modelUses = new Map<string, number>();
  for (const row of rows) {
    const code = find(row.code);
    const target = findModel(row.model);
    if (code) codeUses.set(code.cardId, (codeUses.get(code.cardId) ?? 0) + 1);
    if (target) modelUses.set(target.id, (modelUses.get(target.id) ?? 0) + 1);
  }
  const planned: QrBulkRowView[] = rows.map((row, index) => {
    const code = find(row.code);
    const target = findModel(row.model);
    const base = { index, code: row.code, model: row.model, ...(code ? { resolverCode: code.resolverCode, smqCode: code.smqCode ?? undefined } : {}), ...(target ? { eventModelId: target.id } : {}) };
    if (!code) return { ...base, status: "error", issue: "FAIR_QR_NOT_FOUND" };
    if (!target) return { ...base, status: "error", issue: "FAIR_MODEL_NOT_FOUND" };
    if ((codeUses.get(code.cardId) ?? 0) > 1) return { ...base, status: "error", issue: "FAIR_BULK_DUPLICATE_CODE" };
    if ((modelUses.get(target.id) ?? 0) > 1) return { ...base, status: "error", issue: "FAIR_BULK_DUPLICATE_MODEL" };
    if (code.assignment) {
      return code.assignment.modelId === target.id ? { ...base, status: "unchanged" } : { ...base, status: "error", issue: "FAIR_QR_ALREADY_ASSIGNED", ...(code.assignment.sameEvent ? { assignedEventModelId: code.assignment.modelId } : {}) };
    }
    if (target.qrCode) return { ...base, status: "error", issue: "FAIR_MODEL_ALREADY_ASSIGNED" };
    return { ...base, status: "ok" };
  });
  const count = (status: QrBulkRowView["status"]) => planned.filter((row) => row.status === status).length;
  return { rows: planned, summary: { ok: count("ok"), unchanged: count("unchanged"), errors: count("error") } };
}

const qrBulk: QrBulkActions = {
  dryRun: async (rows) => ({ ok: true, value: previewBulkPlan(rows) }),
  commit: async (rows) => {
    const plan = previewBulkPlan(rows);
    const results = plan.rows.map((row) => ({ index: row.index, status: row.status === "ok" ? "applied" as const : row.status, ...(row.issue ? { issue: row.issue } : {}) }));
    return { ok: true, value: { rows: results, summary: { applied: plan.summary.ok, unchanged: plan.summary.unchanged, errors: plan.summary.errors } } };
  },
};
// A5 — every event_only client (paged); TEST Izlagač A/C take part in the
// event and are listed above, the TEST client without a participation stays
// in the collapsed list. Leads: fixed TEST numbers per exhibitor.
const eventClients = {
  ...noMore,
  rows: [
    { accountId: "a-a", name: "TEST Izlagač A", smkCode: "SMK-TEST-FAIR-A" },
    { accountId: "a-c", name: "TEST Izlagač C", smkCode: "SMK-TEST-FAIR-C" },
    { accountId: "a-x", name: "TEST Klijent bez učešća", smkCode: "SMK-TEST-FAIR-X" },
  ] satisfies EventClientView[],
};
const exhibitors = buildExhibitorRows(catalog, {
  capped: false,
  byParticipation: [{ participationId: "p-a", total: 3, undelivered: 1 }, { participationId: "p-b", total: 1, undelivered: 0 }],
});

// A5 — the import guide on a pasted TEST table, opened in the Pregled step:
// one existing model, a row without a price, two rows with table errors.
const importContext = importContextFromCatalog(catalog, "test-em26");
const IMPORT_TEST_TABLE = [
  ["Izlagač", "Brend", "Štand", "Model", "Varijanta", "Cena", "Paket", "Pasoš", "Spec: Snaga", "Spec: Domet", "QR kod"],
  ["TEST Izlagač A", "TEST Volta", "TEST-A1", "TEST Volta X1", "TEST Premium", "TEST cena", "Napredni", "da", "TEST 150 kW", "TEST 400 km", ""],
  ["TEST Izlagač A", "TEST Volta", "TEST-A1", "TEST Volta X9", "", "", "Starter", "da", "TEST 110 kW", "TEST 350 km", ""],
  ["TEST Izlagač B", "TEST Om", "TEST-B1", "TEST Om Z9", "TEST LR", "TEST cena", "Starter", "ne", "TEST 90 kW", "", ""],
  ["TEST Izlagač C", "TEST Faradej", "TEST-C1", "TEST Faradej F9", "", "TEST cena", "Platinum", "da", "", "", ""],
  ["TEST Nepoznat izlagač", "TEST Kulon", "TEST-B1", "TEST Kulon K9", "", "TEST cena", "Starter", "da", "", "", ""],
  ["TEST Izlagač D", "TEST Vat", "TEST-D1", "TEST Vat V9", "", "TEST cena", "Napredni", "da", "TEST 200 kW", "TEST 500 km", ""],
].map((row) => row.join("\t")).join("\n");

/** A dry run of the TEST payload without Convex: existing keys of the fixture, the backend's warnings for price, photo and QR. */
function previewImportPlan(payload: FairImportPayload) {
  const issues: DryRunView["issues"] = [];
  const known = { participations: new Set(catalog.participations.map((row) => row.externalKey)), stands: new Set(catalog.stands.map((row) => row.externalKey)), models: new Set(catalog.models.map((row) => row.externalKey)) };
  const count = { participations: { new: 0, existing: 0 }, stands: { new: 0, existing: 0 }, models: { new: 0, existing: 0 } };
  const stands = new Set<string>();
  payload.participations.forEach((participation, p) => {
    count.participations[known.participations.has(participation.externalKey) ? "existing" : "new"] += 1;
    participation.brands.forEach((brand, b) => {
      if (!stands.has(brand.stand.externalKey)) {
        stands.add(brand.stand.externalKey);
        count.stands[known.stands.has(brand.stand.externalKey) ? "existing" : "new"] += 1;
      }
      brand.models.forEach((model, m) => {
        const path = `participations[${p}].brands[${b}].models[${m}]`;
        const existing = known.models.has(model.externalKey);
        count.models[existing ? "existing" : "new"] += 1;
        if (!model.priceText) issues.push({ severity: "warning", code: "FAIR_PRICE_MISSING", path: `${path}.priceText` });
        if (!model.photoUrl) issues.push({ severity: "warning", code: "FAIR_PHOTO_MISSING", path: `${path}.photoUrl` });
        if (!model.assignedResolverCode && !(existing && catalog.models.find((row) => row.externalKey === model.externalKey)?.qrCode)) {
          issues.push({ severity: "warning", code: "FAIR_QR_MISSING", path: `${path}.assignedResolverCode` });
        }
      });
    });
  });
  return { issues, count };
}

const importActions: Pick<EventsActions, "dryRun" | "commit"> = {
  dryRun: async (payload) => {
    const { issues, count } = previewImportPlan(payload as FairImportPayload);
    return { ok: true, value: { ok: true, issues, summary: { ...count, upgrades: 0, qrAssignments: 0 } } };
  },
  commit: async (payload) => {
    const { issues, count } = previewImportPlan(payload as FairImportPayload);
    const results = (entity: { new: number; existing: number }) => ({ created: entity.new, updated: 0, unchanged: entity.existing });
    return { ok: true, value: { committed: true, issues, results: { participations: results(count.participations), stands: results(count.stands), models: results(count.models), upgrades: 0, qrAssignments: 0 } } };
  },
};

function PreviewSection({ path, detailId, query, setQuery, keep }: {
  path: EventSectionPath;
  detailId?: string;
  query: AdminQueryState;
  setQuery: (patch: AdminQueryPatch) => void;
  keep: AdminQueryState;
}) {
  const modelHref = (id: string) => eventDetailHref(PREVIEW_BASE, "modeli", id, keep);
  const listQuery = { ...keep, ...modelListQuery(query) };
  const listModelHref = (id: string) => eventDetailHref(PREVIEW_BASE, "modeli", id, listQuery);
  const qrHref = (code: string) => eventDetailHref(PREVIEW_BASE, "qr", code, keep);
  const modelId = leadsView.models.find((model) => model.id === query.model)?.id ?? leadsView.models[0].id;
  const modelPart = {
    ...leadsView,
    modelId,
    onSelectModel: (id: string) => setQuery({ model: id }),
    modelSettings: leadsView.models.find((model) => model.id === modelId)?.tier === "advanced" ? advancedSettings : starterSettings,
  };
  const leadList = {
    ...leadsView,
    participationId: leadsView.participations.find((row) => row.id === query.izlagac)?.id ?? leadsView.participations[0].id,
    onSelectParticipation: (id: string) => setQuery({ izlagac: id }),
  };
  switch (path) {
    case "pregled": return <EventOverviewView catalog={catalog} modelHref={modelHref} />;
    case "modeli": return detailId
      ? (
        <EventModelDetailView
          key={detailId}
          catalog={catalog}
          modelId={detailId}
          actions={actions}
          query={query}
          listHref={eventSectionHref(PREVIEW_BASE, "modeli", listQuery)}
          modelHref={listModelHref}
          qrHref={qrHref}
          sectionHref={(path, extra) => eventSectionHref(PREVIEW_BASE, path, { ...keep, ...extra })}
          summary={modelSummary(detailId)}
        />
      )
      : <EventModelsView catalog={catalog} query={query} onQueryChange={setQuery} modelHref={listModelHref} importHref={eventSectionHref(PREVIEW_BASE, "import", keep)} />;
    case "qr": {
      const qrListKeep = { ...keep, ...qrListQuery(query) };
      return detailId
        ? (
          <EventQrDetailView
            key={detailId}
            catalog={catalog}
            code={detailId}
            detail={qrDetailFixture(detailId)}
            actions={qrActions}
            listHref={eventSectionHref(PREVIEW_BASE, "qr", qrListKeep)}
            modelHref={modelHref}
            generalQrHref={(row) => `/admin/operativa/qr?code=${encodeURIComponent(row.resolverCode)}`}
          />
        )
        : (
          <EventQrView
            catalog={catalog}
            inventory={inventory}
            stats={qrStats}
            query={query}
            onQueryChange={setQuery}
            qrHref={(code) => eventDetailHref(PREVIEW_BASE, "qr", code, qrListKeep)}
            modelHref={modelHref}
            bulk={qrBulk}
            actions={actions}
          />
        );
    }
    case "izlagaci": return (
      <EventExhibitorsView
        exhibitors={exhibitors}
        leadsCapped={false}
        query={query}
        onQueryChange={setQuery}
        modelsHref={(participationId) => eventSectionHref(PREVIEW_BASE, "modeli", { ...keep, izlagac: participationId })}
        importHref={eventSectionHref(PREVIEW_BASE, "import", keep)}
        clients={eventClients}
        actions={actions}
      />
    );
    case "import": return <EventImportView context={importContext} actions={importActions} initial={{ text: IMPORT_TEST_TABLE, step: "pregled" }} />;
    case "interakcije/glas-publike": return <AdminEventsQuestions view={interactions} actions={interactionActions} />;
    case "interakcije/ankete": return <AdminEventsSurveys view={interactions} actions={interactionActions} />;
    case "interakcije/pasos": return <AdminEventsPassports view={interactions} actions={interactionActions} />;
    case "interakcije/forme": return <AdminEventsLeadForms view={modelPart} actions={leadActions} />;
    case "sponzorisano": return <AdminEventsSponsored view={sponsoredView} actions={sponsoredActions} />;
    case "leadovi": return <AdminEventsLeadList view={leadList} actions={leadActions} />;
    case "leadovi/follow-up": return <AdminEventsFollowUp view={modelPart} actions={leadActions} />;
    case "leadovi/podesavanja": return <AdminEventsConsent view={leadsView} actions={leadActions} />;
    case "izvestaji": return <AdminEventsReports view={reportsView} actions={reportsActions} />;
    case "brisanje": return <AdminEventsRetention view={retentionView} actions={retentionActions} />;
  }
}

/** `section` = the resolved route (null = unknown path → "not found" state). */
export function AdminEventsPreview({ section }: { section: ResolvedEventSection | null }) {
  const router = useRouter();
  const [query, setQuery] = useAdminQueryState();
  const currentSlug = PREVIEW_EVENTS.find((event) => event.slug === query.dogadjaj)?.slug ?? PREVIEW_EVENTS[0].slug;
  const keepFor = (slug: string): AdminQueryState => (slug === PREVIEW_EVENTS[0].slug ? {} : { dogadjaj: slug });
  const keep = keepFor(currentSlug);
  const active = section?.kind === "section" ? section.path : null;
  const onViewChange = useCallback((mode: AdminViewMode) => setQuery({ prikaz: mode }), [setQuery]);
  return (
    <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/dogadjaji">
      <AdminEventFrameView
        preview
        events={PREVIEW_EVENTS}
        currentSlug={currentSlug}
        onSelectEvent={(slug) => router.push(switchEventHref(PREVIEW_BASE, section, query, keepFor(slug)))}
        nav={eventNavGroups((path) => eventSectionHref(PREVIEW_BASE, path, keep), active)}
      >
        <AdminViewModeOverride value={parseViewModeParam(query.prikaz)} onChange={onViewChange}>
          {section?.kind === "section"
            ? <PreviewSection path={section.path} detailId={section.detailId} query={query} setQuery={setQuery} keep={keep} />
            : <AdminEventsNotFound title={dict.sectionNotFoundTitle} body={dict.sectionNotFoundBody} href={eventSectionHref(PREVIEW_BASE, "pregled", keep)} linkLabel={dict.backToOverview} />}
        </AdminViewModeOverride>
      </AdminEventFrameView>
    </AdminShell>
  );
}
