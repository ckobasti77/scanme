import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { LeadFormsSource } from "@/lib/admin-v1/lead-forms";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventLeadFormsView, type LeadFormsActions } from "./interakcije-forme-view";

// Admin UX A7 — `interakcije/forme` (SSR markup): the read-only state of the
// K3 switch and the consent, the exhibitor default with "Sačuvaj i primeni
// na sve modele", the real state of every model (on/off, contact,
// preference, source, pending, package reason) and the model's exception.

const f = adminEventsSr.leadForms;
const source: LeadFormsSource = {
  defaults: [
    { participationId: "p1", leadKind: "interest", enabled: true, contactRequirement: "one_of", updatedAt: 1 },
    { participationId: "p1", leadKind: "test_drive", enabled: true, contactRequirement: "both", preferredContact: "phone", updatedAt: 1 },
  ],
  models: [
    {
      eventModelId: "adv", participationId: "p1", packageTier: "advanced",
      interest: { entitled: true, config: { enabled: true, contactRequirement: "phone", source: "override", updatedAt: 1 } },
      testDrive: { entitled: true, config: { enabled: true, contactRequirement: "both", preferredContact: "phone", source: "default", updatedAt: 1 } },
    },
    {
      eventModelId: "st", participationId: "p1", packageTier: "starter",
      interest: { entitled: true, config: { enabled: true, contactRequirement: "email", source: "default", updatedAt: 1 } },
      testDrive: { entitled: false, config: { enabled: false, contactRequirement: "both", preferredContact: "phone", source: "default", updatedAt: 1 } },
    },
    { eventModelId: "inc", participationId: "p1", packageTier: "included", interest: { entitled: false, config: null }, testDrive: { entitled: false, config: null } },
    { eventModelId: "other", participationId: "p2", packageTier: "starter", interest: { entitled: true, config: null }, testDrive: { entitled: false, config: null } },
  ],
};
const names = {
  models: new Map([
    ["adv", { name: "TEST Volta X2", brandName: "TEST Volta" }],
    ["st", { name: "TEST Volta X1", brandName: "TEST Volta" }],
    ["inc", { name: "TEST Amper A1", brandName: "TEST Amper" }],
    ["other", { name: "TEST Om Z1", brandName: "TEST Om" }],
  ]),
};
const ok = async () => ({ ok: true as const });
const actions: LeadFormsActions = { saveDefault: ok, apply: ok, saveOverride: ok, clearOverride: ok };
const exhibitors = [{ id: "p1", name: "TEST Izlagač A" }, { id: "p2", name: "TEST Izlagač B" }];
const render = (query: AdminQueryState = {}, extra: Partial<Parameters<typeof EventLeadFormsView>[0]> = {}) => renderToStaticMarkup(
  <EventLeadFormsView
    source={source}
    names={names}
    exhibitors={exhibitors}
    switches={{ leadsEnabled: false, followUpEnabled: true }}
    consents={{ interest: 2, test_drive: null }}
    consentHref="/admin/dogadjaji/test/leadovi/podesavanja"
    query={query}
    onQueryChange={() => undefined}
    actions={actions}
    {...extra}
  />,
);

/** Visible text only (attribute values such as option values are not shown). */
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("A7 Forme view", () => {
  test("the lead flow state is read-only booleans and versions; the default form applies to all models in one move", () => {
    const html = render({ prikaz: "tabela" });
    for (const text of [
      adminEventsSr.interactionSections.forme, f.help, f.statusLabel, f.leadsOff, f.followUpOn,
      fmt(f.consentOn, { kind: adminEventsSr.leadKinds.interest, version: 2 }), fmt(f.consentOff, { kind: adminEventsSr.leadKinds.test_drive }), f.consentLink,
      fmt(f.defaultsTitle, { exhibitor: "TEST Izlagač A" }), f.saveAndApply, f.saveOnly, f.testDriveDefaultNote,
      adminEventsSr.configEnabled, adminEventsSr.configRequirement, adminEventsSr.configPreferred, fmt(f.exhibitorOption, { name: "TEST Izlagač A", count: 3 }),
    ]) expect(html).toContain(text);
    expect(html).toContain('href="/admin/dogadjaji/test/leadovi/podesavanja"');
    expect(html).not.toMatch(/FAIR_LEADS_ENABLED|FAIR_FOLLOWUP_ENABLED|FAIR_[A-Z_]+/);
    expect(text(html)).not.toMatch(/one_of|not_entitled|test_drive/);
  });

  test("each model shows its real state per form, its source, what still waits for Primeni and why a package lacks a form", () => {
    const html = render({ prikaz: "tabela" });
    for (const text of [
      "TEST Volta X2", "TEST Volta X1", "TEST Amper A1", f.states.on, f.states.not_entitled,
      `${f.sourceOverride} · ${fmt(f.contactLine, { requirement: adminEventsSr.contactRequirements.phone })}`,
      `${f.sourceDefault} · ${fmt(f.contactLine, { requirement: adminEventsSr.contactRequirements.both })} · ${fmt(f.preferredLine, { channel: adminEventsSr.preferredContacts.phone })}`,
      f.notEntitledReasons.test_drive, f.notEntitledReasons.interest, f.pendingBadge, fmt(f.pending, { count: 1 }), f.apply,
      `aria-label="${fmt(f.editOverrideAria, { model: "TEST Volta X2" })}"`, fmt(f.count, { shown: 3 }),
    ]) expect(html).toContain(text);
    // Another exhibitor's model is not in this list.
    expect(html).not.toContain("TEST Om Z1");
  });

  test("?model= opens the exception: the forms of that model, Vrati na podrazumevano only for an exception, the package reason instead of a form", () => {
    const advanced = render({ model: "adv" });
    expect(advanced).toContain(fmt(f.overrideTitle, { model: "TEST Volta X2" }));
    expect(advanced).toContain(f.saveOverride);
    expect(advanced).toContain(f.clearOverride);
    expect(advanced).toContain(f.closeOverride);
    const starter = render({ model: "st" });
    expect(starter).toContain(adminEventsSr.testDriveAdvancedOnly);
    expect(starter).not.toContain(f.clearOverride); // follows the default, nothing to clear
    // A model of another exhibitor switches the page to that exhibitor.
    expect(render({ model: "other" })).toContain(fmt(f.defaultsTitle, { exhibitor: "TEST Izlagač B" }));
  });

  test("an exhibitor without a saved default sees it as not saved; no exhibitors and loading are neutral states", () => {
    const html = render({ izlagac: "p2" });
    expect(html).toContain(f.defaultNotSaved);
    expect(html).toContain(f.states.not_set);
    expect(render({}, { exhibitors: [] })).toContain(f.noExhibitorsTitle);
    expect(render({}, { source: undefined })).toContain(adminEventsSr.loading);
  });
});
