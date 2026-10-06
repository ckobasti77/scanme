import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { CatalogView, ModelView } from "@/components/admin/admin-events";
import { leadDeliveryDeadline, leadInboxFilter, clearLeadInboxPatch, hasLeadInboxFilter } from "@/components/admin/events/leads-logic";
import { modelHierarchy } from "@/lib/admin-v1/model-filters";
import { belgradeLocalToEpoch } from "@/lib/belgrade-time";
import { FAIR_LEAD_DELIVERY_DEADLINE_MS, FAIR_PII_PURGE_AT_MS } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventLeadsInboxView, LeadDetailPanel, type InboxLead, type LeadDetail, type LeadInboxActions } from "./leadovi-view";

// Admin UX A8 — `leadovi`: the inbox (filters, Tabela/Kartice, delivery,
// hand-over of the PII file per exhibitor) and the lead detail with the
// visitor's activity on that exhibitor's models only. SSR markup + the pure
// logic in components/admin/events/leads-logic.ts.

const t = adminEventsSr.leadInbox;
const AT = Date.parse("2026-10-09T10:00:00+02:00");
const ok = async () => ({ ok: true as const });
const actions: LeadInboxActions = { markDelivered: ok, markExhibitorDelivered: async () => ({ ok: true, delivered: 3, hasMore: false }), setSuppressed: ok, retryDelivery: ok, exportLeads: ok };

const model = (id: string, displayName: string, participationId: string, brandId: string, brandName: string, tier: ModelView["tier"]): ModelView => ({
  id, externalKey: `test-${id}`, displayName, slug: `test-${id}`, participationId, brandId, brandName, exhibitorName: participationId === "p-a" ? "TEST Izlagač A" : "TEST Izlagač B",
  standLabel: "TEST štand", tier, status: "published", priceText: "TEST cena", specCount: 1, highlightCount: 0, hasPhoto: false, photoUrl: null, passportEligible: true,
  packageActivatedAt: AT, qrCode: null, qrSmq: null, issues: [],
});
const catalog: CatalogView = {
  days: [],
  participations: [
    { id: "p-a", externalKey: "test-a", accountId: "a-a", exhibitorName: "TEST Izlagač A", codes: "", smkCode: null, smlCode: null, segment: "event_only", status: "active" },
    { id: "p-b", externalKey: "test-b", accountId: "a-b", exhibitorName: "TEST Izlagač B", codes: "", smkCode: null, smlCode: null, segment: "standard", status: "active" },
  ],
  stands: [],
  models: [
    model("a-x2", "TEST Volta X2", "p-a", "b-volta", "TEST Volta", "advanced"),
    model("a-x1", "TEST Volta X1", "p-a", "b-volta", "TEST Volta", "starter"),
    model("a-m1", "TEST Amper M1", "p-a", "b-amper", "TEST Amper", "advanced"),
    model("b-z2", "TEST Om Z2", "p-b", "b-om", "TEST Om", "advanced"),
  ],
  qrConfigured: true,
};
const lead = (id: string, modelId: string, extra: Partial<InboxLead> = {}): InboxLead => ({
  id, createdAt: AT, kind: "interest", modelId, participationId: catalog.models.find((row) => row.id === modelId)!.participationId,
  contactName: `TEST ${id}`, email: `${id}@example.invalid`, delivered: false, followUpSuppressed: false,
  confirmation: { id: `c-${id}`, status: "sent", scheduledFor: AT }, followUp: null, ...extra,
});
const leads = [
  lead("l1", "a-x2", { kind: "test_drive", followUp: { id: "f-l1", status: "skipped", scheduledFor: AT, lastError: "FOLLOW_UP_MERGED" } }),
  lead("l2", "a-x1", { delivered: true, deliveredAt: AT + 3_600_000 }),
  lead("l3", "b-z2", { email: undefined, phone: "+381 60 000 0103", confirmation: null }),
];

function render(overrides: Partial<Parameters<typeof EventLeadsInboxView>[0]> = {}) {
  return renderToStaticMarkup(
    <EventLeadsInboxView
      catalog={catalog}
      leads={{ rows: leads, status: "ready", canLoadMore: false, loadingMore: false, onLoadMore: () => {} }}
      query={{}}
      onQueryChange={() => {}}
      leadHref={(id) => `/admin/dogadjaji/test/leadovi?lead=${id}`}
      undelivered={{ count: 2, capped: false }}
      now={AT}
      leadsEnabled
      detail={null}
      links={{ forms: "/f", followUp: "/fu", settings: "/s" }}
      actions={actions}
      {...overrides}
    />,
  );
}

describe("A8 lead inbox", () => {
  test("filters (hierarchy, type, delivery, dates), Tabela/Kartice, delivery state and links; no raw codes", () => {
    const html = render({ query: { izlagac: "p-a", tip: "probna-voznja", isporuka: "ne", od: "2026-10-09", do: "2026-10-10" } });
    expect(html).toContain('data-admin-primitive="filter-bar"');
    expect(html).toContain('data-admin-primitive="hierarchy-picker"');
    expect(html).toContain('data-admin-primitive="data-view"');
    expect(html.match(/type="date"/g)).toHaveLength(2);
    for (const text of [
      t.facetKind, t.facetDelivery, t.fromLabel, t.toLabel, t.kindOptions["probna-voznja"], t.deliveryOptions.ne,
      fmt(t.chipKind, { value: t.kindOptions["probna-voznja"] }), fmt(t.chipFrom, { date: "2026-10-09" }),
      t.colLead, t.colReceived, t.colKindModel, t.colExhibitor, t.colDelivery, t.colEmails,
      t.delivered, t.notDelivered, t.markDelivered, t.open,
      fmt(t.undelivered, { count: 2 }), fmt(t.deadlineDays, { days: 37 }),
      adminEventsSr.deliveryErrors.FOLLOW_UP_MERGED, "TEST Volta X2", "TEST Izlagač A", t.formsLink, t.followUpLink, t.settingsLink,
    ]) expect(html).toContain(text.replace(/"/g, "&quot;"));
    // The detail is a link (`?lead=`), so Back closes the drawer (the vitest next/link stub keeps href only).
    expect(html).toContain('href="/admin/dogadjaji/test/leadovi?lead=l1"');
    expect(html).not.toMatch(/FOLLOW_UP_MERGED|PROVIDER_|FAIR_[A-Z]/);
    // Delivered leads offer no second "mark" (one button per undelivered lead and view: l1 and l3).
    expect(html.match(/aria-label="Označi isporučeno: TEST l2"/g)).toBeNull();
  });

  test("the PII file and 'mark all delivered' appear for the chosen exhibitor only, with the warning (moved from Izveštaji)", () => {
    const none = render();
    expect(none).toContain(t.handOverPick);
    expect(none).not.toContain(fmt(t.exportDownload, { format: "CSV" }));
    const chosen = render({ query: { izlagac: "p-a" } });
    for (const text of [t.handOverTitle, fmt(t.handOverExhibitor, { name: "TEST Izlagač A" }), adminEventsSr.reportsLeadsWarning, fmt(t.exportDownload, { format: "CSV" }), fmt(t.exportDownload, { format: "XLSX" }), t.markExhibitor]) {
      expect(chosen).toContain(text);
    }
  });

  test("empty states, the switch note and the deadline as it gets close", () => {
    const empty = render({ leads: { rows: [], status: "ready", canLoadMore: false, loadingMore: false, onLoadMore: () => {} } });
    expect(empty).toContain(t.emptyTitle);
    const filtered = render({ leads: { rows: [], status: "ready", canLoadMore: false, loadingMore: false, onLoadMore: () => {} }, query: { tip: "zainteresovan" } });
    expect(filtered).toContain(t.emptyFilteredTitle);
    expect(render({ leadsEnabled: false })).toContain(t.leadsOff);
    expect(render()).not.toContain(t.leadsOff);
    expect(render({ now: FAIR_LEAD_DELIVERY_DEADLINE_MS - 3_600_000 })).toContain(t.deadlineToday);
    expect(render({ now: FAIR_PII_PURGE_AT_MS })).toContain(t.deadlinePassed);
    expect(render({ undelivered: { count: 4000, capped: true } })).toContain(fmt(t.undeliveredCapped, { count: 4000 }));
  });

  test("the lead detail: contact, consent snapshot, delivery, emails and activity with 'goes to the exhibitor' per group", () => {
    const detail: LeadDetail = {
      lead: { ...leads[0], phone: "+381 60 000 0101", followUp: { id: "f-l1", status: "queued", scheduledFor: AT }, consentVersion: 2, consentTextSnapshot: "TEST saglasnost: ScanMe i TEST Izlagač A.", consentedAt: AT },
      activity: {
        tierAtLead: "advanced",
        scans: { shared: true, capped: false, items: [{ eventModelId: "a-x2", firstAt: AT, lastAt: AT, count: 3 }, { eventModelId: "a-m1", firstAt: AT, lastAt: AT, count: 1 }] },
        ratings: { shared: true, capped: false, items: [{ eventModelId: "a-x2", at: AT, appearance: 5, price: 3 }] },
        audienceVotes: { shared: true, capped: false, items: [{ eventModelId: "a-x2", at: AT, prompt: "TEST pitanje", answer: "TEST odgovor" }] },
        surveyAnswers: { shared: true, capped: true, items: [{ eventModelId: "a-x2", at: AT, answers: [{ prompt: "TEST kupujete?", kind: "yes_no", answer: "yes" }, { prompt: "TEST plaćanje", kind: "single_choice", answer: "TEST lizing" }] }] },
        passport: { shared: false, capped: false, items: [{ brandId: "b-volta", required: 2, stamps: [{ eventModelId: "a-x2", at: AT }], favoriteModelId: "a-x2" }] },
        sponsoredActions: { shared: true, capped: false, items: [] },
      },
    };
    const names = { model: (id: string) => catalog.models.find((row) => row.id === id), exhibitor: () => "TEST Izlagač A" };
    const html = renderToStaticMarkup(<LeadDetailPanel detail={detail} names={names} brandName={() => "TEST Volta"} actions={actions} />);
    for (const text of [
      t.contactTitle, "TEST l1", "l1@example.invalid", "+381 60 000 0101", fmt(t.tierAtLead, { tier: adminEventsSr.tiers.advanced }),
      t.consentTitle, "TEST saglasnost: ScanMe i TEST Izlagač A.", t.deliveryTitle, t.notDelivered, t.markDelivered, t.emailsTitle, adminEventsSr.suppress,
      fmt(t.activityTitle, { exhibitor: "TEST Izlagač A" }), t.activityHelp,
      ...Object.values(t.activityGroups), "TEST Amper M1", "Izgled 5 · Cena 3", "TEST pitanje", "TEST odgovor", "TEST kupujete?", t.yes, "TEST lizing",
      fmt(t.passportLine, { stamped: 1, required: 2 }), fmt(t.favoriteLine, { model: "TEST Volta X2" }), t.activityEmpty, t.activityCapped,
    ]) expect(html).toContain(text);
    // Passport is shown to ScanMe only; the other groups go to the exhibitor.
    expect(html.match(new RegExp(`>${t.activityShared}<`, "g"))).toHaveLength(5);
    expect(html.match(new RegExp(`>${t.activityNotShared}<`, "g"))).toHaveLength(1);
    expect(html).not.toContain("TEST Om Z2");
    // Without a group the backend omitted (feature not in any package), nothing is shown for it — never a 0.
    const starter = renderToStaticMarkup(<LeadDetailPanel detail={{ ...detail, activity: { tierAtLead: "starter", scans: { shared: true, capped: false, items: [] } } }} names={names} brandName={() => "TEST Volta"} actions={actions} />);
    expect(starter).not.toContain(t.activityGroups.surveyAnswers);
    expect(starter).toContain(t.activityGroups.scans);
    expect(renderToStaticMarkup(<LeadDetailPanel detail={undefined} names={names} brandName={() => ""} actions={actions} />)).toContain(t.detailLoading);
    expect(renderToStaticMarkup(<LeadDetailPanel detail={null} names={names} brandName={() => ""} actions={actions} />)).toContain(t.detailMissing);
  });
});

describe("A8 inbox logic", () => {
  const hierarchy = modelHierarchy(catalog.models, (row) => row.displayName);

  test("query → backend filter: model beats exhibitor, a brand sets its exhibitor, dates are Belgrade days", () => {
    expect(leadInboxFilter({}, hierarchy)).toEqual({});
    expect(leadInboxFilter({ izlagac: "p-a", model: "a-x2", tip: "probna-voznja", isporuka: "da" }, hierarchy)).toEqual({ eventModelId: "a-x2", kind: "test_drive", delivered: true });
    const brand = leadInboxFilter({ brend: "b-volta" }, hierarchy);
    expect(brand.participationId).toBe("p-a");
    expect([...brand.brandModelIds!].sort()).toEqual(["a-x1", "a-x2"]);
    expect(leadInboxFilter({ izlagac: "p-b", brend: "b-volta" }, hierarchy)).toEqual({ participationId: "p-b" });
    expect(leadInboxFilter({ od: "2026-10-09", do: "2026-10-09", isporuka: "ne" }, hierarchy)).toEqual({
      delivered: false, from: belgradeLocalToEpoch("2026-10-09T00:00"), to: belgradeLocalToEpoch("2026-10-10T00:00"),
    });
    // Across the October DST change the day still ends at Belgrade midnight.
    expect(leadInboxFilter({ do: "2026-10-24" }, hierarchy).to).toBe(Date.parse("2026-10-25T00:00:00+02:00"));
    expect(hasLeadInboxFilter({ prikaz: "kartice" })).toBe(false);
    expect(hasLeadInboxFilter({ isporuka: "ne" })).toBe(true);
    expect(clearLeadInboxPatch()).toMatchObject({ izlagac: null, tip: null, od: null, lead: null });
  });

  test("delivery deadline: days left, the last day, then passed", () => {
    expect(leadDeliveryDeadline(AT)).toEqual({ kind: "days", days: 37 });
    expect(leadDeliveryDeadline(Date.parse("2026-11-14T23:30:00+01:00"))).toEqual({ kind: "days", days: 1 });
    expect(leadDeliveryDeadline(Date.parse("2026-11-15T00:10:00+01:00"))).toEqual({ kind: "today" });
    expect(leadDeliveryDeadline(FAIR_LEAD_DELIVERY_DEADLINE_MS)).toEqual({ kind: "today" });
    expect(leadDeliveryDeadline(FAIR_PII_PURGE_AT_MS)).toEqual({ kind: "passed" });
  });
});
