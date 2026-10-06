import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { CatalogView, ModelView } from "@/components/admin/admin-events";
import { EventLeadFormsView, type LeadFormsActions } from "@/components/admin/events/sections/interakcije-forme-view";
import { EventFollowUpView, type FollowUpActions } from "@/components/admin/events/sections/leadovi-follow-up-view";
import { EventLeadsInboxView, LeadDetailPanel, LeadsInboxUnavailable, type InboxLead, type LeadInboxActions } from "@/components/admin/events/sections/leadovi-view";
import type { LeadFormsSource } from "@/lib/admin-v1/lead-forms";
import { formatBelgradeDate } from "@/lib/belgrade-time";
import { FAIR_EMAIL_DELIVERY_ERRORS } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { AdminEventsConsent, type LeadsActions, type LeadsView } from "./admin-events-leads";

// Sajam 2026 B4 — the lead sections of the admin `Događaji` area. Since A2
// each part is its own route: leadovi, interakcije/forme, leadovi/follow-up,
// leadovi/podesavanja. A7: the forms are set per exhibitor in their own view.
// A8: `leadovi` is the inbox (+ drawer, components/admin/events/sections/
// leadovi-view.tsx), `leadovi/follow-up` the text per exhibitor
// (leadovi-follow-up-view.tsx), and this module keeps only the consent of
// `leadovi/podesavanja`, folded per kind. `all` renders every part for the
// same TEST data (more in the leadovi-*.test.tsx files).

const ok = async () => ({ ok: true as const });
const actions: LeadsActions = { saveConsentDraft: ok, activateConsent: ok, retireConsent: ok };
const inboxActions: LeadInboxActions = { markDelivered: ok, markExhibitorDelivered: async () => ({ ok: true, delivered: 1, hasMore: false }), setSuppressed: ok, retryDelivery: ok, exportLeads: ok };
const followUpActions: FollowUpActions = { saveDraft: ok, activate: ok, retire: ok };

const formsSource: LeadFormsSource = {
  defaults: [{ participationId: "p1", leadKind: "test_drive", enabled: true, contactRequirement: "both", preferredContact: "phone", updatedAt: 1 }],
  models: [
    {
      eventModelId: "m1", participationId: "p1", packageTier: "advanced",
      interest: { entitled: true, config: { enabled: true, contactRequirement: "one_of", source: "override", updatedAt: 1 } },
      testDrive: { entitled: true, config: { enabled: true, contactRequirement: "both", preferredContact: "phone", source: "default", updatedAt: 1 } },
    },
    { eventModelId: "m2", participationId: "p1", packageTier: "starter", interest: { entitled: true, config: null }, testDrive: { entitled: false, config: null } },
  ],
};
const formsActions: LeadFormsActions = { saveDefault: ok, apply: ok, saveOverride: ok, clearOverride: ok };
/** `model` opens that model's exception editor. */
const forms = (model?: string) => renderToStaticMarkup(
  <EventLeadFormsView
    source={formsSource}
    names={{ models: new Map([["m1", { name: "TEST Volta X2", brandName: "TEST Volta" }], ["m2", { name: "TEST Volta X1", brandName: "TEST Volta" }]]) }}
    exhibitors={[{ id: "p1", name: "TEST izlagač A" }]}
    switches={{ leadsEnabled: true, followUpEnabled: true }}
    consents={{ interest: 1, test_drive: null }}
    consentHref="/admin/dogadjaji/test/leadovi/podesavanja"
    query={model ? { model } : {}}
    onQueryChange={() => {}}
    actions={formsActions}
  />,
);
const AT = Date.parse("2026-10-09T10:00:00+02:00");

const model = (id: string, displayName: string, tier: ModelView["tier"]): ModelView => ({
  id, externalKey: `test-${id}`, displayName, slug: `test-${id}`, participationId: "p1", brandId: "b1", brandName: "TEST Volta", exhibitorName: "TEST izlagač A",
  standLabel: "TEST štand", tier, status: "published", priceText: "TEST cena", specCount: 1, highlightCount: 0, hasPhoto: false, photoUrl: null, passportEligible: true,
  packageActivatedAt: AT, qrCode: null, qrSmq: null, issues: [],
});
const catalog: CatalogView = {
  days: [{ dateKey: "2026-10-09", label: "TEST dan 1" }],
  participations: [{ id: "p1", externalKey: "test-p1", accountId: "a1", exhibitorName: "TEST izlagač A", codes: "SMK · SML", smkCode: null, smlCode: null, segment: "event_only", status: "active" }],
  stands: [],
  models: [model("m1", "TEST Volta X2", "advanced"), model("m2", "TEST Volta X1", "starter")],
  qrConfigured: true,
};

const view: LeadsView = {
  consents: [
    { id: "c2", kind: "interest", version: 2, status: "draft", text: "TEST nacrt saglasnosti {izlagac}" },
    { id: "c1", kind: "interest", version: 1, status: "active", text: "TEST aktivna saglasnost {izlagac}", activatedAt: AT },
  ],
};
const leads: InboxLead[] = [
  {
    id: "l1", createdAt: AT, kind: "test_drive", modelId: "m1", participationId: "p1", contactName: "TEST Posetilac", email: "lead@example.invalid", phone: "+381 60 000 0006",
    delivered: false, followUpSuppressed: false,
    confirmation: { id: "d1", status: "failed", scheduledFor: AT, lastError: "PROVIDER_REJECTED:422" },
    followUp: { id: "d2", status: "queued", scheduledFor: Date.parse("2026-10-13T10:00:00+02:00") },
  },
  { id: "l2", createdAt: AT, kind: "interest", modelId: "m2", participationId: "p1", contactName: "TEST Bez emaila", phone: "+381 60 000 0007", delivered: false, followUpSuppressed: false, confirmation: null, followUp: null },
];
const inbox = (rows: InboxLead[] = leads) => renderToStaticMarkup(
  <EventLeadsInboxView
    catalog={catalog}
    leads={{ rows, status: "ready", canLoadMore: true, loadingMore: false, onLoadMore: () => {} }}
    query={{ izlagac: "p1" }}
    onQueryChange={() => {}}
    leadHref={(id) => `/admin/dogadjaji/test/leadovi?lead=${id}`}
    undelivered={{ count: 2, capped: false }}
    now={AT}
    leadsEnabled
    detail={null}
    links={{ forms: "/admin/dogadjaji/test/interakcije/forme", followUp: "/admin/dogadjaji/test/leadovi/follow-up", settings: "/admin/dogadjaji/test/leadovi/podesavanja" }}
    actions={inboxActions}
  />,
);
const names = { model: (id: string) => catalog.models.find((row) => row.id === id), exhibitor: () => "TEST izlagač A" };
const detail = (row: InboxLead) => renderToStaticMarkup(
  <LeadDetailPanel
    detail={{ lead: { ...row, consentVersion: 1, consentTextSnapshot: "TEST saglasnost: ScanMe i TEST izlagač A.", consentedAt: AT }, activity: { tierAtLead: "advanced" } }}
    names={names}
    brandName={() => "TEST Volta"}
    actions={inboxActions}
  />,
);
const followUp = (advancedModels = 1) => renderToStaticMarkup(
  <EventFollowUpView
    exhibitors={[{ id: "p1", name: "TEST izlagač A" }]}
    eventTitle="TEST sajam"
    rows={[{ participationId: "p1", active: { templateId: "t1", subject: "TEST naslov {ime}", plainText: "TEST tekst izlagača za {modeli}", status: "active", version: 3, updatedAt: AT }, draft: null, advancedModels, modelTexts: 0 }]}
    estimate={{ byParticipation: [{ participationId: "p1", pairs: 1, sent: 0, suppressed: 0 }], capped: false }}
    switches={{ leadsEnabled: true, followUpEnabled: true }}
    preview={{ source: "sample", values: { ime: "Ime Prezime (primer)", izlagac: "TEST izlagač A", dogadjaj: "TEST sajam", modeli: "TEST Volta X2" }, leads: [] }}
    query={{}}
    onQueryChange={() => {}}
    actions={followUpActions}
  />,
);
const all = (consentView: LeadsView, rows: InboxLead[] = leads) => renderToStaticMarkup(<AdminEventsConsent view={consentView} actions={actions} />) + inbox(rows) + detail(rows[0]) + followUp();

describe("B4 admin Leadovi", () => {
  test("consent, forms, the inbox, the lead detail and the follow-up text render in Serbian, with no raw codes", () => {
    const html = all(view) + forms();
    for (const text of [
      adminEventsSr.consentTitle, adminEventsSr.interactionSections.forme, adminEventsSr.sectionLabels["leadovi/follow-up"], adminEventsSr.listTitle, adminEventsSr.consentInactive,
      adminEventsSr.leadInbox.formsLink,
      "TEST aktivna saglasnost {izlagac}", "TEST nacrt saglasnosti {izlagac}", adminEventsSr.consentRetire, "Aktiviraj verziju 2",
      adminEventsSr.contactRequirements.both, adminEventsSr.preferredContacts.phone, fmt(adminEventsSr.followUps.editorTitle, { exhibitor: "TEST izlagač A" }), "Aktivna verzija 3",
      "TEST Posetilac", "lead@example.invalid", "+381 60 000 0006", adminEventsSr.leadNoEmail, adminEventsSr.deliveryErrors.PROVIDER_REJECTED,
      adminEventsSr.retryConfirmation, adminEventsSr.suppress, adminEventsSr.loadMore,
    ]) expect(html).toContain(text.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    expect(html).not.toMatch(/FAIR_[A-Z_]+|PROVIDER_[A-Z]+:|CONSENT_NOT_CONFIGURED/);
  });

  test("a Starter model offers interest only; an exhibitor without an Advanced model gets no follow-up", () => {
    const html = forms("m2") + followUp(0);
    expect(html).toContain(adminEventsSr.testDriveAdvancedOnly);
    expect(html).toContain(adminEventsSr.followUps.noAdvanced);
    expect(followUp(1)).not.toContain(adminEventsSr.followUps.noAdvanced);
  });

  test("K3: the activate button sits with the legal approval fields and stays disabled while they are empty; the active version shows its record; a skipped email says why", () => {
    const approvedAt = Date.parse("2026-10-01T00:00:00+02:00");
    const k3: LeadsView = {
      consents: [
        { id: "c2", kind: "interest", version: 2, status: "draft", text: "TEST nacrt saglasnosti {izlagac}" },
        { id: "c1", kind: "interest", version: 1, status: "active", text: "TEST aktivna saglasnost {izlagac}", activatedAt: AT, legalApprovedBy: "TEST pravna provera", legalApprovedAt: approvedAt },
      ],
    };
    const skipped: InboxLead[] = [{
      ...leads[0],
      confirmation: { id: "d1", status: "skipped", scheduledFor: AT, lastError: "LEADS_DISABLED" },
      followUp: { id: "d2", status: "skipped", scheduledFor: AT, lastError: "FOLLOW_UP_DISABLED" },
    }];
    const html = all(k3, skipped);
    for (const text of [
      adminEventsSr.consentLegalTitle, adminEventsSr.consentLegalHelp, adminEventsSr.consentLegalApprovedBy, adminEventsSr.consentLegalApprovedAt,
      fmt(adminEventsSr.consentLegalLine, { by: "TEST pravna provera", date: formatBelgradeDate(approvedAt) }),
      adminEventsSr.deliveryStatus.skipped, adminEventsSr.deliveryErrors.LEADS_DISABLED, adminEventsSr.deliveryErrors.FOLLOW_UP_DISABLED,
    ]) expect(html).toContain(text);
    expect(html).toContain('type="date"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aktiviraj verziju 2<\/button>/);
    expect(html).not.toMatch(/FAIR_[A-Z_]+|LEADS_DISABLED|FOLLOW_UP_DISABLED|legalApproved/);

    // A version activated before K3 has no record; that is said plainly.
    expect(all(view)).toContain(adminEventsSr.consentLegalNone);
  });

  test("without data the section shows a neutral state; every delivery error has text", () => {
    expect(renderToStaticMarkup(<AdminEventsConsent view={undefined} actions={undefined} />)).toContain(adminEventsSr.leadsUnavailable);
    expect(renderToStaticMarkup(<LeadsInboxUnavailable />)).toContain(adminEventsSr.leadsUnavailable);
    for (const code of FAIR_EMAIL_DELIVERY_ERRORS) expect(adminEventsSr.deliveryErrors[code].length).toBeGreaterThan(0);
  });

  test("A8: consent lives in settings, folded per kind with its version state, and says it must cover the activity shared with the exhibitor", () => {
    const html = renderToStaticMarkup(<AdminEventsConsent view={view} actions={actions} />);
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain(`${fmt(adminEventsSr.leadSettings.summaryActive, { version: 1 })} · ${fmt(adminEventsSr.leadSettings.summaryDraft, { version: 2 })}`);
    expect(html).toContain(adminEventsSr.leadSettings.summaryNone);
    expect(html).toContain(adminEventsSr.leadSettings.activitySharingNote);
  });
});
