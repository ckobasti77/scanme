"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { CatalogView, EventClientView, EventsActions, InventoryRowView, ModelView } from "@/components/admin/admin-events";
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
import { EventImportView } from "@/components/admin/events/sections/import-view";
import { EventModelDetailView, EventModelsView } from "@/components/admin/events/sections/modeli-view";
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
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { parseViewModeParam, type AdminViewMode } from "@/lib/admin-v1/view-mode";
import { FAIR_PII_PURGE_AT_MS, FAIR_PURGE_CATEGORIES } from "@/lib/fair-contract";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Static TEST fixture of the `Događaji` sections (mirrors the B1 DEV TEST
// catalog) for visual checks without an admin session or Convex. Admin UX
// A2: every section is shown on the same path as in the admin —
// `/dev/admin-events-preview/<sekcija>[/<id>]`; `?dogadjaj=` picks the TEST
// event and `?prikaz=` the list view. Actions do not execute.

const opening = Date.parse("2026-10-09T09:00:00+02:00");

function model(id: string, displayName: string, brandName: string, exhibitorName: string, standLabel: string, tier: ModelView["tier"], extra: Partial<ModelView> = {}): ModelView {
  return {
    id, externalKey: `test-em26-${id}`, displayName, slug: `test-${id}`, brandName, exhibitorName, standLabel, tier, status: "published",
    priceText: "TEST cena", specCount: 3, highlightCount: 1, hasPhoto: false, passportEligible: tier !== "included",
    packageActivatedAt: opening, qrCode: null,
    issues: [{ severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }, { severity: "warning", code: "FAIR_QR_MISSING", path: "qr" }],
    ...extra,
  };
}

const catalog: CatalogView = {
  days: [{ dateKey: "2026-10-09", label: "TEST dan 1" }, { dateKey: "2026-10-10", label: "TEST dan 2" }, { dateKey: "2026-10-11", label: "TEST dan 3" }],
  participations: [
    { id: "p-a", externalKey: "test-em26-izlagac-a", exhibitorName: "TEST Izlagač A", codes: "SMK-TEST-FAIR-A · SML-TEST-FAIR-A", segment: "event_only", status: "active" },
    { id: "p-b", externalKey: "test-em26-izlagac-b", exhibitorName: "TEST Izlagač B", codes: "SMK-TEST-FAIR-B · SML-TEST-FAIR-B", segment: "standard", status: "active" },
  ],
  stands: [
    { id: "s-a1", externalKey: "test-em26-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "test-loc-em-a1", exhibitorName: "TEST Izlagač A", status: "active" },
    { id: "s-b1", externalKey: "test-em26-stand-b1", code: "TEST-B1", displayName: "TEST štand B1", mapLocationId: "test-loc-em-b1", exhibitorName: "TEST Izlagač B", status: "active" },
  ],
  models: [
    model("volta-x1", "TEST Volta X1", "TEST Volta", "TEST Izlagač A", "TEST štand A1 · TEST-A1", "advanced", { variant: "TEST Premium", highlightCount: 4, specCount: 5, qrCode: "7KQ2M9XA", issues: [{ severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }] }),
    model("volta-x2", "TEST Volta X2", "TEST Volta", "TEST Izlagač A", "TEST štand A1 · TEST-A1", "starter"),
    model("om-z2", "TEST Om Z2", "TEST Om", "TEST Izlagač B", "TEST štand B1 · TEST-B1", "included", { status: "draft", priceText: "Cena na upit", issues: [{ severity: "error", code: "FAIR_SPECIFICATIONS_INVALID", path: "specifications" }, { severity: "warning", code: "FAIR_PRICE_MISSING", path: "priceText" }] }),
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

const PREVIEW_BASE = "/dev/admin-events-preview";
const PREVIEW_EVENTS: FrameEvent[] = [
  { slug: "test-elektromobilnost-2026", title: "TEST Sajam elektromobilnosti", status: "published" },
  { slug: "test-auto-moto-fest-2026", title: "TEST Auto Moto Fest", status: "published" },
];

const inventory = { ...noMore, rows: [
  { cardId: "c1", resolverCode: "7KQ2M9XA", smqCode: "SMQ-TEST-0001", state: "active", assignment: { modelId: "volta-x1", modelName: "TEST Volta X1", sameEvent: true } },
  { cardId: "c2", resolverCode: "R4T8W2PQ", smqCode: "SMQ-TEST-0002", state: "problem", assignment: null },
] satisfies InventoryRowView[] };
const eventClients = { ...noMore, rows: [{ accountId: "a-a", name: "TEST Izlagač A", smkCode: "SMK-TEST-FAIR-A" }] satisfies EventClientView[] };

function PreviewSection({ path, detailId, query, setQuery, keep }: {
  path: EventSectionPath;
  detailId?: string;
  query: AdminQueryState;
  setQuery: (patch: AdminQueryPatch) => void;
  keep: AdminQueryState;
}) {
  const modelHref = (id: string) => eventDetailHref(PREVIEW_BASE, "modeli", id, keep);
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
      ? <EventModelDetailView key={detailId} catalog={catalog} modelId={detailId} actions={actions} listHref={eventSectionHref(PREVIEW_BASE, "modeli", keep)} qrHref={qrHref} />
      : <EventModelsView catalog={catalog} modelHref={modelHref} />;
    case "qr": return detailId
      ? <EventQrDetailView key={detailId} catalog={catalog} code={detailId} row={inventory.rows.find((row) => row.resolverCode === detailId) ?? null} actions={actions} listHref={eventSectionHref(PREVIEW_BASE, "qr", keep)} modelHref={modelHref} generalQrHref={`/admin/operativa/qr?code=${encodeURIComponent(detailId)}`} />
      : <EventQrView catalog={catalog} inventory={inventory} actions={actions} qrHref={qrHref} />;
    case "izlagaci": return <EventExhibitorsView clients={eventClients} actions={actions} />;
    case "import": return <EventImportView actions={actions} />;
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
