import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { eventNavGroups } from "@/lib/admin-v1/event-sections";
import { FAIR_ADMIN_ISSUE_CODES } from "@/lib/fair-contract";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { issueText, type CatalogView } from "./admin-events";
import { AdminEventFrameView, AdminEventsEntryView } from "./events/event-frame-view";
import { AdminEventsNotFound } from "./events/event-not-found";
import { SectionLoading } from "./events/sections/loading";
import { EventModelDetailView } from "./events/sections/modeli-view";
import { EventOverviewView } from "./events/sections/pregled-view";

// B1A admin Događaji — since A2 the frame (event, section navigation) and the
// Pregled section are separate views on their own route.

// The shared next/link stub drops every prop except href/className; these
// checks need aria-current on the link, so the anchor keeps all its props.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const ok = async () => ({ ok: true as const });

const catalog: CatalogView = {
  days: [{ dateKey: "2026-10-09", label: "TEST dan 1" }],
  participations: [
    { id: "p1", externalKey: "test-p1", exhibitorName: "TEST Izlagač A", codes: "SMK-T-A · SML-T-A", segment: "event_only", status: "active" },
    { id: "p2", externalKey: "test-p2", exhibitorName: "TEST Izlagač B", codes: "SMK-T-B · SML-T-B", segment: "standard", status: "active" },
  ],
  stands: [{ id: "s1", externalKey: "test-s1", code: "A1", displayName: "TEST štand", mapLocationId: "test-loc-a1", exhibitorName: "TEST Izlagač A", status: "active" }],
  models: [{
    id: "m1", externalKey: "test-m1", displayName: "TEST Model", slug: "test-model", brandName: "TEST Brend", exhibitorName: "TEST Izlagač A",
    standLabel: "TEST štand · A1", tier: "starter", status: "draft", priceText: "Cena na upit", specCount: 2, highlightCount: 1, hasPhoto: false,
    passportEligible: true, packageActivatedAt: Date.parse("2026-10-09T09:00:00+02:00"), qrCode: "7KQ2M9XA",
    issues: [{ severity: "error", code: "FAIR_HIGHLIGHT_LIMIT", path: "specifications" }, { severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }],
  }],
  qrConfigured: true,
};

function frame(children: ReactNode) {
  return renderToStaticMarkup(
    <AdminEventFrameView
      events={[{ slug: "test-sajam", title: "TEST Sajam", status: "published" }, { slug: "test-amf", title: "TEST AMF", status: "draft" }]}
      currentSlug="test-sajam"
      onSelectEvent={() => undefined}
      nav={eventNavGroups((path) => `/admin/dogadjaji/test-sajam/${path}`, "pregled")}
    >
      {children}
    </AdminEventFrameView>,
  );
}

describe("B1A admin Događaji surface", () => {
  test("overview lists days, both client segments, stands and models with package and status; the frame names the sections", () => {
    const html = frame(<EventOverviewView catalog={catalog} modelHref={(id) => `/admin/dogadjaji/test-sajam/modeli/${id}`} />);
    for (const text of [
      adminEventsSr.pageTitle, "TEST Sajam", adminEventsSr.sectionLabels.pregled, adminEventsSr.sectionLabels.modeli, adminEventsSr.sectionLabels.qr,
      adminEventsSr.sectionLabels.import, adminEventsSr.sectionLabels.izlagaci, "TEST dan 1", adminEventsSr.segments.event_only, adminEventsSr.segments.standard,
      "test-loc-a1", adminEventsSr.tiers.starter, adminEventsSr.modelStatus.draft,
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`<nav aria-label="${adminEventsSr.sectionsAria}"`);
    expect(html).toMatch(/<a[^>]*href="\/admin\/dogadjaji\/test-sajam\/pregled"[^>]*aria-current="page"/);
    // A model row opens the model's own route.
    expect(html).toContain('href="/admin/dogadjaji/test-sajam/modeli/m1"');
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("the model detail shows checks, actions and links back to the list and to its QR route", () => {
    const html = renderToStaticMarkup(
      <EventModelDetailView catalog={catalog} modelId="m1" actions={{ publish: ok, withdraw: ok, upgrade: ok }} listHref="/x/modeli" qrHref={(code) => `/x/qr/${code}`} />,
    );
    for (const text of [adminEventsSr.validationTitle, adminEventsSr.publish, adminEventsSr.upgradeTitle, adminEventsSr.backToList, 'href="/x/modeli"', 'href="/x/qr/7KQ2M9XA"']) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
    expect(renderToStaticMarkup(<EventModelDetailView catalog={catalog} modelId="nema" actions={{ publish: ok, withdraw: ok, upgrade: ok }} listHref="/x/modeli" qrHref={() => ""} />)).toContain(adminEventsSr.modelNotFoundBody);
  });

  test("every backend issue code has Serbian text; unknown codes stay visible", () => {
    for (const code of FAIR_ADMIN_ISSUE_CODES) expect(issueText(code)).toBe(adminEventsSr.issues[code]);
    expect(issueText("ACTION_FAILED")).toBe(adminEventsSr.actionFailed);
    expect(issueText("NEW_CODE")).toContain("NEW_CODE");
  });

  test("empty, loading and not-found states render without a catalog", () => {
    expect(renderToStaticMarkup(<AdminEventsEntryView empty />)).toContain(adminEventsSr.noEventsTitle);
    expect(renderToStaticMarkup(<AdminEventsEntryView empty={false} />)).toContain('role="status"');
    expect(renderToStaticMarkup(<SectionLoading />)).toContain('role="status"');
    const missing = renderToStaticMarkup(<AdminEventsNotFound title={adminEventsSr.eventNotFoundTitle} body={adminEventsSr.eventNotFoundBody} href="/admin/dogadjaji" linkLabel={adminEventsSr.backToEvents} />);
    expect(missing).toContain(adminEventsSr.eventNotFoundTitle);
    expect(missing).toContain('href="/admin/dogadjaji"');
  });
});
