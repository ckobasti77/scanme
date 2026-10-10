"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type {
  CatalogView,
  DryRunView,
  EventClientView,
  EventsActions,
  InventoryRowView,
  LinkStickerActions,
  ModelView,
  QrActions,
  RecentLinkView,
  QrBulkActions,
  QrBulkDryRunView,
  QrBulkInput,
  QrBulkRowView,
  QrDetailView,
  QrScanStatsView,
} from "@/components/admin/admin-events";
import type { InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import type { PackageModel } from "@/components/admin/events/exhibitor-packages";
import { EventSurveysView } from "@/components/admin/events/sections/interakcije-ankete-view";
import { EventLeadFormsView, type LeadFormsActions } from "@/components/admin/events/sections/interakcije-forme-view";
import { EventAudienceView } from "@/components/admin/events/sections/interakcije-glas-publike-view";
import { EventInteractionExhibitorView } from "@/components/admin/events/sections/interakcije-izlagac-view";
import { EventInteractionExhibitorsView } from "@/components/admin/events/sections/interakcije-izlagaci-view";
import { EventPassportsView, type PassportsActions } from "@/components/admin/events/sections/interakcije-pasos-view";
import { AdminEventsConsent, type LeadsActions } from "@/components/admin/admin-events-leads";
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
import { followUpTextState, leadInboxFilter, pickFollowUpExhibitor } from "@/components/admin/events/leads-logic";
import { previewLeadsFixture } from "@/components/admin/events/preview-leads-fixtures";
import { EventFollowUpView, type FollowUpActions } from "@/components/admin/events/sections/leadovi-follow-up-view";
import { EventLeadsInboxView, type InboxLead, type LeadInboxActions } from "@/components/admin/events/sections/leadovi-view";
import { EventModelDetailView, EventModelsView, type ModelDetailSummary } from "@/components/admin/events/sections/modeli-view";
import { dashboardSectionUrgency, withNavUrgency } from "@/components/admin/events/dashboard-logic";
import { previewDashboard } from "@/components/admin/events/preview-dashboard-fixtures";
import { previewAnalytics, previewAudience } from "@/components/admin/events/preview-analytics-fixtures";
import { EventAnalyticsView } from "@/components/admin/events/sections/analitika-view";
import { EventDashboardView } from "@/components/admin/events/sections/pregled-view";
import { EventLinkStickerView } from "@/components/admin/events/sections/povezi-view";
import { EventQrDetailView, EventQrView } from "@/components/admin/events/sections/qr-view";
import type { LinkFlow } from "@/lib/admin-v1/qr-link";
import { FAIR_QR_LABEL_DEFAULT_FORMAT } from "@/lib/fair-qr-label";
import {
  eventDetailHref,
  eventNavGroups,
  eventSectionHref,
  interactionExhibitorHref,
  switchEventHref,
  type EventSectionPath,
  type InteractionPart,
  type ResolvedEventSection,
} from "@/lib/admin-v1/event-sections";
import { buildExhibitorRows } from "@/lib/admin-v1/exhibitors";
import {
  buildInteractionExhibitorRows,
  interactionListQuery,
  interactionPartPatch,
  interactionPartQuery,
  interactionReportDay,
  scopeToExhibitor,
} from "@/lib/admin-v1/interaction-exhibitors";
import type { LeadFormsSource } from "@/lib/admin-v1/lead-forms";
import { modelHierarchy, modelListQuery } from "@/lib/admin-v1/model-filters";
import { buildPassportRows, type PassportOverviewSource } from "@/lib/admin-v1/passport-overview";
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

// A6 — Glas publike and Ankete on the TEST catalog: "now" is noon of TEST
// dan 1; Starter and Napredni models, three days, every status (Nacrt,
// Objavljeno, Sponzorisano, Zatvoreno), a Starter day that is full and one
// TEST model whose package starts on day 2. No real questions or results.
const PREVIEW_NOW = opening + 3 * 3_600_000;
const DAY_MS = 86_400_000;
const options2 = (a: string, b: string) => [{ id: "o1", label: a, order: 1 }, { id: "o2", label: b, order: 2 }];
const question = (id: string, modelId: string, dayId: string, prompt: string, status: InteractionsView["questions"][number]["status"], sortOrder: number, extra: Partial<InteractionsView["questions"][number]> = {}) => ({
  id, modelId, dayId, prompt, options: options2("TEST da", "TEST ne"), status, sortOrder, showOnSponsoredRotation: false, ...extra,
});
const interactions: InteractionsView = {
  models: catalog.models.filter((row) => row.status !== "withdrawn").map((row) => ({
    id: row.id, name: `${row.displayName}${row.variant ? ` ${row.variant}` : ""}`, brandId: row.brandId, brandName: row.brandName,
    exhibitorId: row.participationId, exhibitorName: row.exhibitorName, externalKey: row.externalKey, tier: row.tier,
    packageActivatedAt: row.id === "faradej-m4" ? opening + DAY_MS : row.packageActivatedAt, status: row.status,
  })),
  days: catalog.days.map((day, index) => ({ id: `d${index + 1}`, dateKey: day.dateKey, label: day.label, startsAt: opening + index * DAY_MS, endsAt: opening + index * DAY_MS + 10 * 3_600_000 })),
  questions: [
    question("q1", "volta-x1", "d1", "TEST pitanje Glasa publike", "published", 1, { options: options2("TEST opcija 1", "TEST opcija 2"), showOnSponsoredRotation: true }),
    question("q4", "volta-x1", "d1", "TEST koja boja vam se najviše dopada?", "published", 2, { options: [{ id: "o1", label: "TEST bela", order: 1 }, { id: "o2", label: "TEST crna", order: 2 }, { id: "o3", label: "TEST plava", order: 3 }] }),
    question("q5", "volta-x1", "d1", "TEST jutarnje pitanje", "closed", 3),
    question("q6", "volta-x1", "d1", "TEST pitanje za popodne", "draft", 4),
    question("q7", "volta-x1", "d2", "TEST pitanje za drugi dan", "draft", 5),
    question("q2", "volta-x2", "d1", "TEST da li biste probali ovaj model?", "published", 1),
    question("q3", "volta-x2", "d1", "TEST pitanje u nacrtu", "draft", 2),
    question("q8", "volta-m2", "d1", "TEST domet ili cena?", "published", 1, { options: options2("TEST domet", "TEST cena") }),
    question("q9", "volta-m1", "d1", "TEST pitanje Starter modela", "closed", 1),
  ],
  surveys: [
    { id: "s3", modelId: "volta-x1", version: 3, status: "draft", questions: [
      { id: "q1", prompt: "TEST da li planirate kupovinu u narednih 6 meseci?", kind: "yes_no", options: [], order: 1 },
      { id: "q2", prompt: "TEST kako planirate da platite?", kind: "single_choice", options: [{ id: "o1", label: "TEST gotovina", order: 1 }, { id: "o2", label: "TEST kredit", order: 2 }, { id: "o3", label: "TEST lizing", order: 3 }], order: 2 },
    ] },
    { id: "s2", modelId: "volta-x1", version: 2, status: "published", questions: [
      { id: "q1", prompt: "TEST da li planirate kupovinu?", kind: "yes_no", options: [], order: 1 },
      { id: "q2", prompt: "TEST kako planirate da platite?", kind: "single_choice", options: [{ id: "o1", label: "TEST gotovina", order: 1 }, { id: "o2", label: "TEST kredit", order: 2 }], order: 2 },
    ] },
    { id: "s1", modelId: "volta-x1", version: 1, status: "retired", questions: [{ id: "q1", prompt: "TEST prvo pitanje ankete", kind: "yes_no", options: [], order: 1 }] },
    { id: "s4", modelId: "volta-m2", version: 1, status: "published", questions: [{ id: "q1", prompt: "TEST da li vam treba probna vožnja?", kind: "yes_no", options: [], order: 1 }] },
  ],
};
const interactionActions: InteractionsActions = {
  saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok, retireSurvey: ok,
};

// A7 — Pasoš brenda: one TEST brand per state, shown the day before the
// opening so Aktivan and Zamrznut (a manual freeze) appear together; TEST
// Faradej keeps a car that was withdrawn after the freeze (emergency removal
// offered). The conditions are TEST values, not computed from this catalog.
const PASSPORT_PREVIEW_NOW = opening - 20 * 3_600_000;
const required = (...ids: string[]) => ids.map((eventModelId) => ({ eventModelId, status: "required" as const, removedByAdmin: false }));
const published = (passportId: string, extra: Partial<NonNullable<PassportOverviewSource["brands"][number]["passport"]>> = {}) => ({ passportId, status: "published" as const, frozenAt: opening, publishedAt: opening - 2 * DAY_MS, autoSyncedAt: opening - 2 * DAY_MS, ...extra });
const passportOverview: PassportOverviewSource = {
  eventStartsAt: opening,
  brands: [
    { brandId: "b-volta", participationId: "p-a", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: opening, passport: published("pass-volta"), members: required("volta-x1", "volta-x2") },
    { brandId: "b-amper", participationId: "p-a", eligible: true, exhibited: 3, problems: [], tooManyModels: false, freezesAt: opening, passport: published("pass-amper", { hiddenAt: opening - DAY_MS }), members: required("amper-m1", "amper-m2", "amper-m5") },
    { brandId: "b-om", participationId: "p-b", eligible: false, exhibited: 5, problems: [{ code: "model_not_published", count: 1 }, { code: "model_below_starter", count: 2 }], tooManyModels: false, freezesAt: opening, passport: null, members: [] },
    { brandId: "b-kulon", participationId: "p-b", eligible: false, exhibited: 3, problems: [{ code: "model_below_starter", count: 1 }], tooManyModels: false, freezesAt: opening, passport: published("pass-kulon", { status: "withdrawn" }), members: required("kulon-m1", "kulon-m4") },
    {
      brandId: "b-faradej", participationId: "p-c", eligible: true, exhibited: 3, problems: [], tooManyModels: false, freezesAt: opening - 2 * DAY_MS,
      passport: { passportId: "pass-faradej", status: "published", frozenAt: opening - 2 * DAY_MS, publishedAt: opening - 2 * DAY_MS },
      members: [...required("faradej-m1", "faradej-m2", "faradej-m4"), { eventModelId: "faradej-m5", status: "removed", removedAt: opening - DAY_MS, removedByAdmin: true }],
    },
    { brandId: "b-dzul", participationId: "p-c", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: opening, passport: null, members: [] },
    { brandId: "b-vat", participationId: "p-d", eligible: false, exhibited: 1, problems: [{ code: "fewer_than_two_models", count: 1 }], tooManyModels: false, freezesAt: opening, passport: null, members: [] },
    { brandId: "b-njutn", participationId: "p-d", eligible: false, exhibited: 5, problems: [{ code: "model_not_candidate", count: 1 }], tooManyModels: false, freezesAt: opening, passport: null, members: [] },
  ],
};
const previewExhibitors = EXHIBITORS.map((exhibitor) => ({ id: exhibitor.id, name: exhibitor.name }));
const passportRows = buildPassportRows(passportOverview, {
  brands: new Map(EXHIBITORS.flatMap((exhibitor) => exhibitor.brands.map(([id, name]) => [id, name] as [string, string]))),
  exhibitors: new Map(previewExhibitors.map((row) => [row.id, row.name])),
  models: new Map(catalog.models.map((row) => [row.id, { name: `${row.displayName}${row.variant ? ` ${row.variant}` : ""}`, status: row.status }])),
}, PASSPORT_PREVIEW_NOW);
const passportActions: PassportsActions = {
  refresh: async () => ({ ok: true, summary: { created: 0, updated: 1, withdrawn: 0, unchanged: 5, frozen: 1, too_many_models: 0 } }),
  setHidden: ok,
  removeModel: ok,
};

// A7 — Forme: TEST Izlagač A has both defaults applied (one model keeps an
// exception, one still waits for "Primeni"), TEST Izlagač B only the
// interest default, C and D none yet. The lead switches are off and no
// consent is active, as on a fresh deployment. No real data.
const leadFormDefaultsFixture: LeadFormsSource["defaults"] = [
  { participationId: "p-a", leadKind: "interest", enabled: true, contactRequirement: "one_of", updatedAt: opening - DAY_MS },
  { participationId: "p-a", leadKind: "test_drive", enabled: true, contactRequirement: "both", preferredContact: "phone", updatedAt: opening - DAY_MS },
  { participationId: "p-b", leadKind: "interest", enabled: true, contactRequirement: "email", updatedAt: opening - DAY_MS },
];
const leadFormsFixture: LeadFormsSource = {
  defaults: leadFormDefaultsFixture,
  models: catalog.models.filter((row) => row.status !== "withdrawn").map((row) => {
    const cell = (kind: "interest" | "test_drive") => {
      const entitled = kind === "interest" ? row.tier !== "included" : row.tier === "advanced";
      const value = leadFormDefaultsFixture.find((entry) => entry.participationId === row.participationId && entry.leadKind === kind);
      if (row.id === "volta-x1" && kind === "interest") return { entitled, config: { enabled: true, contactRequirement: "phone" as const, source: "override" as const, updatedAt: opening - DAY_MS } };
      if (!value || row.id === "om-m4") return { entitled, config: null };
      const stale = row.id === "amper-m1" && kind === "interest";
      return {
        entitled,
        config: {
          enabled: value.enabled && entitled,
          contactRequirement: stale ? "email" as const : value.contactRequirement,
          ...(value.preferredContact && !stale ? { preferredContact: value.preferredContact } : {}),
          source: "default" as const,
          updatedAt: opening - DAY_MS,
        },
      };
    };
    return { eventModelId: row.id, participationId: row.participationId, packageTier: row.tier, interest: cell("interest"), testDrive: cell("test_drive") };
  }),
};
const leadFormNames = { models: new Map(catalog.models.map((row) => [row.id, { name: `${row.displayName}${row.variant ? ` ${row.variant}` : ""}`, brandName: row.brandName }])) };
const leadFormsActions: LeadFormsActions = {
  saveDefault: ok,
  apply: async (participationId) => ({
    ok: true,
    applied: {
      created: 0, updated: 1, unchanged: 8, skippedOverride: 1, missingDefault: [],
      notEntitled: leadFormsFixture.models.filter((row) => row.participationId === participationId && row.packageTier === "included").map((row) => ({ modelId: row.eventModelId, kind: "interest" as const })),
    },
  }),
  saveOverride: ok,
  clearOverride: ok,
};

// Izlagači 2026 — `interakcije`: the four TEST exhibitors of the catalog plus
// two TEST exhibitors from an organizer list without cars yet (E with a TEST
// logo and website, F with neither), so "Sa interakcijama", "Svi izlagači",
// the packages and an exhibitor without cars can be checked. The logos are
// drawn TEST marks, not real ones; the websites are example.com.
const testLogo = (letters: string, color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="${color}"/><text x="48" y="60" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${letters}</text></svg>`)}`;
const INTERACTION_EXTRA = [
  { id: "p-e", accountId: "a-e", name: "TEST Izlagač E", websiteUrl: "https://example.com/test-izlagac-e", logoUrl: testLogo("TE", "#0f766e") },
  { id: "p-f", accountId: "a-f", name: "TEST Izlagač F", websiteUrl: null, logoUrl: null },
] as const;
const IDENTITY: Record<string, { websiteUrl: string | null; logoUrl: string | null }> = {
  "p-a": { websiteUrl: "https://example.com/test-izlagac-a", logoUrl: testLogo("TA", "#1d4ed8") },
  "p-c": { websiteUrl: "https://example.com/test-izlagac-c", logoUrl: null },
};
const interactionRows = buildInteractionExhibitorRows({
  participations: [
    ...catalog.participations.map((row) => ({ id: row.id, accountId: row.accountId, businessId: `biz-${row.id}`, externalKey: row.externalKey, status: row.status })),
    ...INTERACTION_EXTRA.map((row) => ({ id: row.id, accountId: row.accountId, businessId: `biz-${row.id}`, externalKey: `izl26-${row.id}`, status: "active" })),
  ],
  models: interactions.models.map((row) => ({ id: row.id, participationId: row.exhibitorId, brandId: row.brandId, tier: row.tier, packageActivatedAt: row.packageActivatedAt, status: row.status })),
  accounts: new Map([
    ...catalog.participations.map((row) => [row.accountId, { name: row.exhibitorName, websiteUrl: IDENTITY[row.id]?.websiteUrl ?? null }] as const),
    ...INTERACTION_EXTRA.map((row) => [row.accountId, { name: row.name, websiteUrl: row.websiteUrl }] as const),
  ]),
  businesses: new Map([
    ...catalog.participations.map((row) => [`biz-${row.id}`, { name: row.exhibitorName, logoUrl: IDENTITY[row.id]?.logoUrl ?? null }] as const),
    ...INTERACTION_EXTRA.map((row) => [`biz-${row.id}`, { name: row.name, logoUrl: row.logoUrl }] as const),
  ]),
  brands: new Map(EXHIBITORS.flatMap((exhibitor) => exhibitor.brands.map(([id, name]) => [id, name] as [string, string]))),
  days: interactions.days,
  questions: interactions.questions,
  surveys: interactions.surveys,
  passports: passportRows.map((row) => ({ exhibitorId: row.exhibitorId, brandId: row.brandId, state: row.state })),
}, PREVIEW_NOW);
const previewPackages = (participationId: string): PackageModel[] => interactions.models
  .filter((row) => row.exhibitorId === participationId)
  .map((row) => ({ id: row.id, name: row.name, brandName: row.brandName, tier: row.tier, packageActivatedAt: row.packageActivatedAt, status: row.status }));

const noMore = { canLoadMore: false, loadingMore: false, onLoadMore: () => undefined, status: "ready" as const };

// A8 — Leadovi: TEST leads on the TEST catalog (inbox, drawer, delivery),
// follow-up texts per exhibitor and the consent versions. The lead and
// follow-up switches are off, as on a fresh deployment. No real person.
const PREVIEW_EVENT_TITLE = "TEST Sajam elektromobilnosti";
const leadsFixture = previewLeadsFixture(catalog, opening, PREVIEW_EVENT_TITLE);
const leadActions: LeadsActions = { saveConsentDraft: ok, activateConsent: ok, retireConsent: ok };
const inboxActions: LeadInboxActions = {
  markDelivered: ok, markExhibitorDelivered: async () => ({ ok: true, delivered: 2, hasMore: false }), setSuppressed: ok, retryDelivery: ok, exportLeads: ok,
};
const followUpActions: FollowUpActions = { saveDraft: ok, activate: ok, retire: ok };

/** The inbox filters of the admin (convex/fairLeadsInbox.ts), applied to the TEST leads. */
function previewInboxLeads(query: AdminQueryState): InboxLead[] {
  const filter = leadInboxFilter(query, modelHierarchy(catalog.models, (model) => `${model.displayName}${model.variant ? ` ${model.variant}` : ""}`));
  return leadsFixture.leads.filter((row) =>
    (!filter.eventModelId || row.modelId === filter.eventModelId)
    && (!filter.participationId || row.participationId === filter.participationId)
    && (!filter.kind || row.kind === filter.kind)
    && (filter.delivered === undefined || row.delivered === filter.delivered)
    && (filter.from === undefined || row.createdAt >= filter.from)
    && (filter.to === undefined || row.createdAt < filter.to)
    && (!filter.brandModelIds || filter.brandModelIds.has(row.modelId)));
}

// A9 — Sponzorisano: the automatic TEST list of every published TEST
// Napredni model (one starts tomorrow), today's order with the neutral
// placeholder (no real photos), two map questions (one under 5 votes) and the
// versions. No real data.
const sponsoredModels = catalog.models.filter((row) => row.tier === "advanced" && row.status === "published");
const SPONSORED_LATER = sponsoredModels.at(-1)?.id;
const sponsoredDue = sponsoredModels.filter((row) => row.id !== SPONSORED_LATER);
const sponsoredView: SponsoredView = {
  models: catalog.models.map((row) => ({ id: row.id, name: `${row.displayName}${row.variant ? ` ${row.variant}` : ""}`, brandName: row.brandName, hasPhoto: row.hasPhoto })),
  autoPublish: true,
  active: {
    version: 6,
    publishedAt: opening - 3_600_000,
    trigger: "auto",
    dayKey: "2026-10-09",
    // A fixed TEST order (the real one is the stable daily shuffle of convex/lib/fairSponsored.ts).
    items: [...sponsoredDue.slice(3), ...sponsoredDue.slice(0, 3)].map((row, order) => ({
      modelId: row.id,
      order,
      visual: "event_placeholder" as const,
      ...(row.id === "volta-x1" ? { questionId: "q1" } : row.id === "volta-m2" ? { questionId: "q8" } : {}),
    })),
  },
  history: [
    { id: "snap-6", version: 6, status: "published", trigger: "auto", publishedAt: opening - 3_600_000 },
    { id: "snap-5", version: 5, status: "retired", trigger: "auto", publishedAt: opening - 5_400_000 },
    { id: "snap-4", version: 4, status: "retired", trigger: "admin", publishedAt: opening - DAY_MS },
  ],
  candidates: sponsoredModels.map((row) => ({
    modelId: row.id,
    activatedAt: row.id === SPONSORED_LATER ? opening + DAY_MS : row.packageActivatedAt,
    ...(row.id === "volta-x1" ? { questionId: "q1" } : row.id === "volta-m2" ? { questionId: "q8" } : {}),
  })),
  questions: [
    { id: "q1", modelId: "volta-x1", prompt: "TEST pitanje Glasa publike", status: "published" },
    { id: "q4", modelId: "volta-x1", prompt: "TEST koja boja vam se najviše dopada?", status: "published" },
    { id: "q8", modelId: "volta-m2", prompt: "TEST domet ili cena?", status: "published" },
  ],
  votes: { threshold: 5, byQuestion: { q1: 12, q8: 3 } },
  now: opening,
};
const sponsoredActions: SponsoredActions = { publish: ok, setResult: ok, setAutoPublish: ok };

// A9 — Izveštaji: the approval queue on TEST dan 2 at noon (dan 1 closed,
// dan 2 and 3 still open): one exhibitor waits for approval (after a failed
// first build), one is approved, one sent, one waits for data. No PII.
const REPORTS_NOW = opening + DAY_MS + 3 * 3_600_000;
const reportRun = (id: string, participationId: string, extra: Partial<ReportsView["runs"][number]>): ReportsView["runs"][number] => ({
  id, dayLabel: "TEST dan 1", dateKey: "2026-10-09", participationId, exhibitorName: EXHIBITORS.find((row) => row.id === participationId)?.name ?? "—",
  status: "pending_review", format: "pdf", createdAt: opening + 54_000_000, hasFile: true, sendCount: 0, lastDelivery: null, ...extra,
});
const reportsView: ReportsView = {
  days: interactions.days.map((day) => ({ id: day.id, label: day.label, dateKey: day.dateKey, endsAt: day.endsAt })),
  participations: EXHIBITORS.map((row) => ({ id: row.id, name: row.name, expectsDaily: true })),
  runs: [
    reportRun("run-1", "p-a", { createdAt: opening + 54_000_000, correctionOf: "run-0" }),
    reportRun("run-0", "p-a", { status: "failed", format: "csv", createdAt: opening + 50_000_000, error: "BUILD_FAILED" }),
    reportRun("run-2", "p-b", { status: "approved", format: "xlsx", createdAt: opening + 54_100_000, approvedAt: opening + 55_000_000, recipient: "test.izlagac@example.invalid" }),
    reportRun("run-3", "p-c", { status: "sent", createdAt: opening + 54_200_000, approvedAt: opening + 56_000_000, recipient: "test.izlagac-c@example.invalid", sendCount: 1, lastDelivery: { status: "sent" } }),
  ],
  review: null,
  now: REPORTS_NOW,
};
const reportsActions: ReportsActions = {
  build: ok, approve: ok, send: ok, resend: ok, retry: ok, correct: ok, download: ok, exportOrganizer: ok, review: () => undefined,
};
const retentionView: RetentionView = {
  purgeAt: FAIR_PII_PURGE_AT_MS,
  capPerCategory: 200,
  preview: FAIR_PURGE_CATEGORIES.map((category, index) => ({ category, count: index, capped: false })),
  runs: [
    { id: "purge-1", mode: "dry_run", trigger: "admin", status: "completed", startedAt: opening - 86_400_000, finishedAt: opening - 86_399_000, batches: 2, totalRows: 14, categories: FAIR_PURGE_CATEGORIES.slice(0, 2).map((category) => ({ category, rows: 7, status: "done" as const })) },
  ],
  now: opening,
};
const retentionActions: RetentionActions = { startDryRun: ok };

/** A3 — the detail's linked summaries from the TEST fixtures above (leads: fixed TEST numbers). */
function modelSummary(modelId: string): ModelDetailSummary {
  const ofModel = interactions.questions.filter((question) => question.modelId === modelId);
  const dayLabelOf = (dayId: string) => interactions.days.find((day) => day.id === dayId)?.label ?? "—";
  const days = [...new Set(ofModel.map((question) => dayLabelOf(question.dayId)))];
  const survey = interactions.surveys.find((row) => row.modelId === modelId && row.status === "published") ?? interactions.surveys.find((row) => row.modelId === modelId);
  const brandId = catalog.models.find((row) => row.id === modelId)?.brandId;
  const passport = passportOverview.brands.find((row) => row.brandId === brandId)?.passport ?? null;
  const members = passportOverview.brands.find((row) => row.brandId === brandId)?.members ?? [];
  const tier = catalog.models.find((row) => row.id === modelId)?.tier;
  const active = sponsoredView.active?.items.find((item) => item.modelId === modelId);
  return {
    questions: days.map((label) => {
      const count = (status: string) => ofModel.filter((question) => dayLabelOf(question.dayId) === label && question.status === status).length;
      return { dayLabel: label, published: count("published"), draft: count("draft"), closed: count("closed") };
    }),
    survey: survey ? { version: survey.version, status: survey.status } : null,
    passport: passport ? { status: passport.status, member: members.some((member) => member.eventModelId === modelId && member.status === "required"), hidden: passport.hiddenAt !== undefined } : null,
    forms: { interest: tier === "starter" || tier === "advanced", testDrive: tier === "advanced" },
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
// Izlagači 2026 — the codes of this event carry a sticker label; N2: in the
// printed series format (`SA26-001`…, TEST codes, TEST resolver codes), so the
// preview of „Poveži nalepnicu“ shows the prefix of the field; the free ones
// continue the series; codes of the other event and the broken ones have only
// their resolver code; three TEST panels lead to their own URL.
const assignedQr = catalog.models.filter((row) => row.qrCode);
const inventoryRows: InventoryRowView[] = [
  ...assignedQr.map((row, index) => ({
    cardId: `card-${row.id}`, resolverCode: row.qrCode!, label: `SA26-${pad(index + 1, 3)}`, kind: "sticker" as const, smqCode: row.qrSmq, state: "active" as const, problemReason: null,
    assignment: { modelId: row.id, sameEvent: true },
  })),
  ...Array.from({ length: 58 }, (_, index) => ({
    cardId: `card-free-${index}`, resolverCode: `TF${pad(index, 3)}QRS`, label: `SA26-${pad(assignedQr.length + index + 1, 3)}`, kind: "sticker" as const, smqCode: `SMQ-TEST-${pad(index + 300, 4)}`, state: "problem" as const,
    problemReason: index % 7 === 3 ? "destination_fair_unassigned" : "destination_missing", assignment: null,
  })),
  ...["PANEL-2026-EVENT", "PANEL-2026-SCANME", "PANEL-2026-ENIGMAIT"].map((label, index) => ({
    cardId: `card-panel-${index}`, resolverCode: `TP${pad(index, 3)}QRS`, label, kind: "panel" as const, smqCode: `SMQ-TEST-${pad(index + 700, 4)}`, state: "active" as const, problemReason: null, assignment: null,
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
  const row = inventoryRows.find((entry) => entry.resolverCode === text || entry.smqCode === text || entry.label === text);
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
    cardId: row.cardId, accessChannelId: `channel-${row.cardId}`, resolverCode: row.resolverCode, label: row.label ?? row.resolverCode, kind: row.kind ?? "sticker", smqCode: row.smqCode,
    channelState: row.state ?? "problem", problemReason: row.problemReason, redirectEnabled: row.state !== "inactive",
    totalScansAllTime: (stats.total ?? 0) + 3,
    current: row.assignment ? {
      assignmentId: `as-${row.cardId}`, sameEvent: row.assignment.sameEvent, eventTitle: row.assignment.sameEvent ? "TEST Sajam elektromobilnosti" : "TEST Auto Moto Fest",
      eventModelId: row.assignment.modelId, modelLabel: history[0]?.modelLabel ?? null, modelStatus: rowModel?.status ?? "published",
      path: rowModel ? `/sajam/test-elektromobilnost-2026/model/${rowModel.slug}` : "/sajam/test-auto-moto-fest-2026/model/test-amf-model",
      assignedAt, reason: "TEST dodela iz tabele nalepnica",
      brandName: rowModel?.brandName ?? null, exhibitorName: rowModel?.exhibitorName ?? null, standCode: rowModel ? rowModel.standLabel : null, standName: null,
    } : null,
    history,
    historyCapped: false,
    stats: rowModel && stats.total !== null ? { total: stats.total, unique: stats.unique ?? 0 } : null,
    lastScanAt: stats.lastScanAt,
  };
}

const qrActions: QrActions = { reassign: ok, assign: ok, release: ok, resolveTest: actions.resolveTest };

// N2 — „Poveži nalepnicu“ on the TEST catalog: the cars carry the sticker
// labels of the TEST inventory, TEST Izlagač A its TEST logo; five recent
// TEST links (the newest three can still be undone); the actions only answer.
// `?stanje=` picks a step the URL cannot hold (cuvanje, potvrda, ponisteno,
// greska); `kod`, `izlagac` and `model` are the section's own query keys.
const labelByModel = new Map(inventoryRows.flatMap((row) => (row.assignment?.sameEvent ? [[row.assignment.modelId, row.label ?? null] as const] : [])));
const linkCatalog: CatalogView = {
  ...catalog,
  participations: catalog.participations.map((row) => ({ ...row, ...IDENTITY[row.id] })),
  models: catalog.models.map((row) => ({ ...row, qrLabel: labelByModel.get(row.id) ?? null })),
};
// P2 — „Poveži nalepnicu“ only: two TEST exhibitors on one stand, as Grand Motors and AUTO MIG share stand 6 (O4).
const linkStickerCatalog: CatalogView = {
  ...linkCatalog,
  stands: linkCatalog.stands.map((row) => (row.id === "s-d1" ? { ...row, code: "TEST-C1", displayName: "TEST štand C1" } : row)),
};
const LINKED_AT = opening - 20 * 3_600_000;
const recentLinks: RecentLinkView[] = assignedQr.slice(0, 5).map((row, index) => ({
  assignmentId: `as-card-${row.id}`,
  label: labelByModel.get(row.id) ?? row.qrCode!,
  modelId: row.id,
  modelName: `${row.displayName}${row.variant ? ` ${row.variant}` : ""}`,
  exhibitorName: row.exhibitorName,
  standCode: row.standLabel.split(" · ").at(-1) ?? null,
  linkedAt: LINKED_AT - index * 4 * 60_000,
  linkedByName: "TEST admin",
  canUndo: index < 3,
}));
const linkActions: LinkStickerActions = {
  link: async (input) => {
    const row = inventoryRows.find((entry) => entry.resolverCode === input.code);
    const target = catalog.models.find((entry) => entry.id === input.modelId);
    return {
      ok: true,
      value: {
        assignmentId: `as-preview-${input.code}`, label: row?.label ?? input.code, modelId: input.modelId, modelStatus: target?.status ?? "published", created: true,
        ...(input.expectedHolderModelId ? { movedFromModelId: input.expectedHolderModelId } : {}),
        ...(input.replaceModelSticker && target ? { replacedLabel: labelByModel.get(target.id) ?? target.qrCode ?? undefined } : {}),
      },
    };
  },
  undo: async () => ({ ok: true, value: { restoredToModelId: null, restoredReplacedLabel: null } }),
};

/** The step a `?stanje=` of the preview starts in (the admin always starts in „pick“). */
function previewLinkFlow(step: string | null, kod: string | undefined, modelId: string | undefined): LinkFlow | undefined {
  if (step === "cuvanje") return { step: "saving" };
  if (step === "greska") return { step: "pick", error: "FAIR_QR_HOLDER_CHANGED" };
  if (step !== "potvrda" && step !== "ponisteno") return undefined;
  const sticker = kod ? qrDetailFixture(kod) : null;
  const target = modelId ? catalog.models.find((entry) => entry.id === modelId) : undefined;
  if (!sticker || !target) return undefined;
  const moved = sticker.current?.sameEvent && sticker.current.eventModelId !== target.id ? sticker.current.eventModelId : undefined;
  return {
    step: "done",
    done: { assignmentId: "as-preview", label: sticker.label ?? sticker.resolverCode, modelId: target.id, modelStatus: target.status, created: true, ...(moved ? { movedFromModelId: moved } : {}) },
    undo: step === "ponisteno" ? "undone" : "idle",
    error: null,
  };
}

const modelDetailActions = { ...actions, lookupQr: async (code: string) => ({ ok: true as const, value: qrDetailFixture(code) }) };

/** TEST dry run with the backend's rules (unknown code, code taken, model has a QR, duplicates); writes nothing. */
function previewBulkPlan(rows: QrBulkInput[]): QrBulkDryRunView {
  const find = (code: string) => inventoryRows.find((entry) => [entry.resolverCode, entry.smqCode, entry.label].includes(code.trim().toUpperCase()));
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
// Izlagači 2026: TEST Izlagač A with a TEST logo and website, C with a website only.
const exhibitors = buildExhibitorRows({ ...catalog, participations: catalog.participations.map((row) => ({ ...row, ...IDENTITY[row.id] })) }, {
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

function PreviewSection({ path, detailId, query, setQuery, keep, previewStep }: {
  path: EventSectionPath;
  detailId?: string;
  query: AdminQueryState;
  setQuery: (patch: AdminQueryPatch) => void;
  keep: AdminQueryState;
  /** N2 — the raw `?stanje=` of `povezi` (a step, not a filter). */
  previewStep: string | null;
}) {
  const modelHref = (id: string) => eventDetailHref(PREVIEW_BASE, "modeli", id, keep);
  const listQuery = { ...keep, ...modelListQuery(query) };
  const listModelHref = (id: string) => eventDetailHref(PREVIEW_BASE, "modeli", id, listQuery);
  const qrHref = (code: string) => eventDetailHref(PREVIEW_BASE, "qr", code, keep);
  const inboxQuery: AdminQueryState = { ...keep, ...query };
  delete inboxQuery.lead;
  switch (path) {
    case "pregled": {
      const dashboard = previewDashboard(query.faza);
      return <EventDashboardView dashboard={dashboard} now={dashboard.at} base={PREVIEW_BASE} keep={keep} />;
    }
    case "povezi": return (
      <EventLinkStickerView
        key={previewStep ?? ""}
        catalog={linkStickerCatalog}
        labelFormat={FAIR_QR_LABEL_DEFAULT_FORMAT}
        query={query}
        onQueryChange={setQuery}
        sticker={query.kod ? qrDetailFixture(query.kod) : undefined}
        recent={recentLinks}
        actions={linkActions}
        qrHref={qrHref}
        initialFlow={previewLinkFlow(previewStep, query.kod, query.model)}
      />
    );
    case "modeli": return detailId
      ? (
        <EventModelDetailView
          key={detailId}
          catalog={linkCatalog}
          modelId={detailId}
          actions={modelDetailActions}
          query={query}
          listHref={eventSectionHref(PREVIEW_BASE, "modeli", listQuery)}
          modelHref={listModelHref}
          qrHref={qrHref}
          sectionHref={(path, extra) => eventSectionHref(PREVIEW_BASE, path, { ...keep, ...extra })}
          interactionHref={(participationId, part, extra) => interactionExhibitorHref(PREVIEW_BASE, participationId, { ...keep, ...extra }, part)}
          summary={modelSummary(detailId)}
        />
      )
      : <EventModelsView catalog={linkCatalog} query={query} onQueryChange={setQuery} modelHref={listModelHref} importHref={eventSectionHref(PREVIEW_BASE, "import", keep)} />;
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
        followUps={new Map(leadsFixture.followUps.map((row) => [row.participationId, { state: followUpTextState(row), advancedModels: row.advancedModels }]))}
        followUpHref={(participationId) => eventSectionHref(PREVIEW_BASE, "leadovi/follow-up", { ...keep, izlagac: participationId })}
      />
    );
    case "import": return <EventImportView context={importContext} actions={importActions} initial={{ text: IMPORT_TEST_TABLE, step: "pregled" }} />;
    case "interakcije": {
      const listKeep = { ...keep, ...interactionListQuery(query) };
      if (!detailId) {
        return (
          <EventInteractionExhibitorsView
            rows={interactionRows}
            dayLabel={interactionReportDay(interactions.days, PREVIEW_NOW, query.dan)?.label ?? null}
            query={query}
            onQueryChange={setQuery}
            exhibitorHref={(participationId) => interactionExhibitorHref(PREVIEW_BASE, participationId, listKeep)}
            packagesOf={previewPackages}
            onUpgrade={ok}
            now={PREVIEW_NOW}
            importHref={eventSectionHref(PREVIEW_BASE, "import", keep)}
            modelHref={modelHref}
          />
        );
      }
      const exhibitor = interactionRows.find((row) => row.id === detailId) ?? null;
      const view = scopeToExhibitor(interactions, detailId);
      const own = exhibitor ? [{ id: exhibitor.id, name: exhibitor.name }] : [];
      const part = (name: InteractionPart) => ({ query: interactionPartQuery(name, query), onQueryChange: (patch: AdminQueryPatch) => setQuery(interactionPartPatch(name, patch)) });
      return (
        <EventInteractionExhibitorView
          key={detailId}
          exhibitor={exhibitor}
          models={previewPackages(detailId)}
          now={PREVIEW_NOW}
          listHref={eventSectionHref(PREVIEW_BASE, "interakcije", listKeep)}
          profileHref={null}
          modelsHref={eventSectionHref(PREVIEW_BASE, "modeli", { ...keep, izlagac: detailId })}
          importHref={eventSectionHref(PREVIEW_BASE, "import", keep)}
          modelHref={modelHref}
          onUpgrade={ok}
          parts={{
            "glas-publike": <EventAudienceView view={view} actions={interactionActions} now={PREVIEW_NOW} {...part("glas-publike")} scoped />,
            ankete: <EventSurveysView view={view} actions={interactionActions} now={PREVIEW_NOW} {...part("ankete")} />,
            pasos: <EventPassportsView rows={passportRows.filter((row) => row.exhibitorId === detailId)} eventStartsAt={opening} exhibitors={own} {...part("pasos")} actions={passportActions} scoped />,
            forme: (
              <EventLeadFormsView
                source={leadFormsFixture}
                names={leadFormNames}
                exhibitors={own}
                switches={{ leadsEnabled: false, followUpEnabled: false }}
                consents={{ interest: null, test_drive: null }}
                consentHref={eventSectionHref(PREVIEW_BASE, "leadovi/podesavanja", keep)}
                {...part("forme")}
                actions={leadFormsActions}
                scoped
              />
            ),
          }}
        />
      );
    }
    case "sponzorisano": return <AdminEventsSponsored view={sponsoredView} actions={sponsoredActions} />;
    // SAJAM SUPER Korak 4 — TEST numbers (preview-analytics-fixtures.ts).
    case "analitika": return (
      <EventAnalyticsView
        eventCode="test-elektromobilnost-2026"
        data={previewAnalytics}
        audience={previewAudience}
        hourDay={query.dan}
        onHourDay={(dan) => setQuery({ dan })}
        refreshing={false}
        onRefresh={() => {}}
        onExport={() => {}}
      />
    );
    case "leadovi": return (
      <EventLeadsInboxView
        catalog={catalog}
        leads={{ ...noMore, rows: previewInboxLeads(query) }}
        query={query}
        onQueryChange={setQuery}
        leadHref={(leadId) => eventSectionHref(PREVIEW_BASE, "leadovi", { ...inboxQuery, lead: leadId })}
        undelivered={{ count: leadsFixture.leads.filter((row) => !row.delivered).length, capped: false }}
        now={PREVIEW_NOW}
        leadsEnabled={false}
        detail={query.lead ? leadsFixture.details.get(query.lead) ?? null : null}
        links={{ forms: eventSectionHref(PREVIEW_BASE, "interakcije", keep), followUp: eventSectionHref(PREVIEW_BASE, "leadovi/follow-up", keep), settings: eventSectionHref(PREVIEW_BASE, "leadovi/podesavanja", keep) }}
        actions={inboxActions}
      />
    );
    case "leadovi/follow-up": {
      const selected = pickFollowUpExhibitor(leadsFixture.followUps, query.izlagac);
      return (
        <EventFollowUpView
          exhibitors={previewExhibitors}
          eventTitle={PREVIEW_EVENT_TITLE}
          rows={leadsFixture.followUps}
          estimate={leadsFixture.estimate}
          switches={{ leadsEnabled: false, followUpEnabled: false }}
          preview={selected ? leadsFixture.previewFor(selected.participationId, query.lead) : undefined}
          query={query}
          onQueryChange={setQuery}
          actions={followUpActions}
        />
      );
    }
    case "leadovi/podesavanja": return <AdminEventsConsent view={{ consents: leadsFixture.consents }} actions={leadActions} />;
    case "izvestaji": return <AdminEventsReports view={reportsView} actions={reportsActions} query={query} onQueryChange={setQuery} />;
    case "brisanje": return <AdminEventsRetention view={retentionView} actions={retentionActions} />;
  }
}

/** `section` = the resolved route (null = unknown path → "not found" state). */
export function AdminEventsPreview({ section }: { section: ResolvedEventSection | null }) {
  const router = useRouter();
  const [query, setQuery] = useAdminQueryState();
  const previewStep = useSearchParams().get("stanje");
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
        nav={withNavUrgency(eventNavGroups((path) => eventSectionHref(PREVIEW_BASE, path, keep), active), dashboardSectionUrgency(previewDashboard(query.faza).actions))}
        linkStickerHref={active === "povezi" ? null : eventSectionHref(PREVIEW_BASE, "povezi", keep)}
      >
        <AdminViewModeOverride value={parseViewModeParam(query.prikaz)} onChange={onViewChange}>
          {section?.kind === "section"
            ? <PreviewSection path={section.path} detailId={section.detailId} query={query} setQuery={setQuery} keep={keep} previewStep={previewStep} />
            : <AdminEventsNotFound title={dict.sectionNotFoundTitle} body={dict.sectionNotFoundBody} href={eventSectionHref(PREVIEW_BASE, "pregled", keep)} linkLabel={dict.backToOverview} />}
        </AdminViewModeOverride>
      </AdminEventFrameView>
    </AdminShell>
  );
}
