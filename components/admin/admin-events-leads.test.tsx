import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { formatBelgradeDate } from "@/lib/belgrade-time";
import { FAIR_EMAIL_DELIVERY_ERRORS } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventLeadFormsView, type LeadFormsActions } from "@/components/admin/events/sections/interakcije-forme-view";
import type { LeadFormsSource } from "@/lib/admin-v1/lead-forms";
import {
  AdminEventsConsent,
  AdminEventsFollowUp,
  AdminEventsLeadList,
  type LeadsActions,
  type LeadsView,
} from "./admin-events-leads";

// Sajam 2026 B4 — the lead sections of the admin `Događaji` area. Since A2
// each part is its own route: leadovi, interakcije/forme, leadovi/follow-up,
// leadovi/podesavanja. `all` renders every part of one view. A7: the forms
// (`interakcije/forme`) are set per exhibitor in their own view; `forms`
// renders it for the same TEST models (more in
// components/admin/events/sections/interakcije-forme-view.test.tsx).

const PARTS = [AdminEventsConsent, AdminEventsFollowUp, AdminEventsLeadList];
const all = (view: LeadsView | undefined, actions: LeadsActions | undefined) => PARTS.map((Part) => renderToStaticMarkup(<Part view={view} actions={actions} />)).join("");

const ok = async () => ({ ok: true as const });
const actions: LeadsActions = {
  saveConsentDraft: ok, activateConsent: ok, retireConsent: ok, saveFollowUpTemplate: ok, setSuppressed: ok, retryDelivery: ok,
};

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

const view: LeadsView = {
  models: [
    { id: "m1", name: "TEST Volta X2", exhibitorName: "TEST izlagač A", tier: "advanced" },
    { id: "m2", name: "TEST Volta X1", exhibitorName: "TEST izlagač A", tier: "starter" },
  ],
  participations: [{ id: "p1", exhibitorName: "TEST izlagač A" }],
  consents: [
    { id: "c2", kind: "interest", version: 2, status: "draft", text: "TEST nacrt saglasnosti {izlagac}" },
    { id: "c1", kind: "interest", version: 1, status: "active", text: "TEST aktivna saglasnost {izlagac}", activatedAt: AT },
  ],
  modelId: "m1",
  onSelectModel: () => {},
  modelSettings: {
    tier: "advanced",
    interest: { contactRequirement: "one_of", enabled: true },
    testDrive: { contactRequirement: "both", preferredContact: "phone", enabled: true },
    followUpTemplate: { subject: "TEST naslov", plainText: "TEST tekst izlagača", version: 3 },
  },
  participationId: "p1",
  onSelectParticipation: () => {},
  formsHref: "/admin/dogadjaji/test/interakcije/forme",
  leads: {
    rows: [
      {
        id: "l1", createdAt: AT, kind: "test_drive", modelName: "TEST Volta X2", contactName: "TEST Posetilac", email: "lead@example.invalid", phone: "+381 60 000 0006",
        consentVersion: 1, followUpSuppressed: false,
        confirmation: { id: "d1", status: "failed", scheduledFor: AT, lastError: "PROVIDER_REJECTED:422" },
        followUp: { id: "d2", status: "queued", scheduledFor: Date.parse("2026-10-13T10:00:00+02:00") },
      },
      { id: "l2", createdAt: AT, kind: "interest", modelName: "TEST Volta X1", contactName: "TEST Bez emaila", phone: "+381 60 000 0007", consentVersion: 1, followUpSuppressed: false, confirmation: null, followUp: null },
    ],
    status: "ready", canLoadMore: true, loadingMore: false, onLoadMore: () => {},
  },
};

describe("B4 admin Leadovi", () => {
  test("consent, per-model settings and leads render in Serbian, with no raw codes", () => {
    const html = all(view, actions) + forms();
    for (const text of [
      adminEventsSr.consentTitle, adminEventsSr.sectionLabels["interakcije/forme"], adminEventsSr.followUpSectionTitle, adminEventsSr.listTitle, adminEventsSr.consentInactive,
      adminEventsSr.leadForms.movedLink,
      "TEST aktivna saglasnost {izlagac}", "TEST nacrt saglasnosti {izlagac}", adminEventsSr.consentRetire, "Aktiviraj verziju 2",
      adminEventsSr.contactRequirements.both, adminEventsSr.preferredContacts.phone, adminEventsSr.followUpTitle, "Aktivna verzija teksta: 3.",
      "TEST Posetilac", "lead@example.invalid", "+381 60 000 0006", adminEventsSr.leadNoEmail, adminEventsSr.deliveryErrors.PROVIDER_REJECTED,
      adminEventsSr.retryConfirmation, adminEventsSr.suppress, adminEventsSr.loadMore,
    ]) expect(html).toContain(text);
    expect(html).not.toMatch(/FAIR_[A-Z_]+|PROVIDER_[A-Z]+:|CONSENT_NOT_CONFIGURED/);
  });

  test("a Starter model offers interest only; Advanced test drive and follow-up are not shown", () => {
    const starter: LeadsView = { ...view, modelId: "m2", modelSettings: { tier: "starter", interest: null, testDrive: null, followUpTemplate: null } };
    const html = all(starter, actions) + forms("m2");
    expect(html).toContain(adminEventsSr.testDriveAdvancedOnly);
    expect(html).toContain(adminEventsSr.followUpAdvancedOnly);
    expect(html).not.toContain(adminEventsSr.followUpTitle);
  });

  test("K3: the activate button sits with the legal approval fields and stays disabled while they are empty; the active version shows its record; a skipped email says why", () => {
    const approvedAt = Date.parse("2026-10-01T00:00:00+02:00");
    const k3: LeadsView = {
      ...view,
      consents: [
        { id: "c2", kind: "interest", version: 2, status: "draft", text: "TEST nacrt saglasnosti {izlagac}" },
        { id: "c1", kind: "interest", version: 1, status: "active", text: "TEST aktivna saglasnost {izlagac}", activatedAt: AT, legalApprovedBy: "TEST pravna provera", legalApprovedAt: approvedAt },
      ],
      leads: {
        ...view.leads,
        rows: [{
          ...view.leads.rows[0],
          confirmation: { id: "d1", status: "skipped", scheduledFor: AT, lastError: "LEADS_DISABLED" },
          followUp: { id: "d2", status: "skipped", scheduledFor: AT, lastError: "FOLLOW_UP_DISABLED" },
        }],
      },
    };
    const html = all(k3, actions);
    for (const text of [
      adminEventsSr.consentLegalTitle, adminEventsSr.consentLegalHelp, adminEventsSr.consentLegalApprovedBy, adminEventsSr.consentLegalApprovedAt,
      fmt(adminEventsSr.consentLegalLine, { by: "TEST pravna provera", date: formatBelgradeDate(approvedAt) }),
      adminEventsSr.deliveryStatus.skipped, adminEventsSr.deliveryErrors.LEADS_DISABLED, adminEventsSr.deliveryErrors.FOLLOW_UP_DISABLED,
    ]) expect(html).toContain(text);
    expect(html).toContain('type="date"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aktiviraj verziju 2<\/button>/);
    expect(html).not.toMatch(/FAIR_[A-Z_]+|LEADS_DISABLED|FOLLOW_UP_DISABLED|legalApproved/);

    // A version activated before K3 has no record; that is said plainly.
    expect(all(view, actions)).toContain(adminEventsSr.consentLegalNone);
  });

  test("without data the section shows a neutral state; every delivery error has text", () => {
    for (const Part of PARTS) expect(renderToStaticMarkup(<Part view={undefined} actions={undefined} />)).toContain(adminEventsSr.leadsUnavailable);
    for (const code of FAIR_EMAIL_DELIVERY_ERRORS) expect(adminEventsSr.deliveryErrors[code].length).toBeGreaterThan(0);
  });
});
