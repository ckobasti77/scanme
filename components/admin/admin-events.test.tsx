import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FAIR_ADMIN_ISSUE_CODES } from "@/lib/fair-contract";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { AdminEventsSurface, issueText, type AdminEventsSurfaceProps } from "./admin-events";

const ok = async () => ({ ok: true as const });
const empty = { rows: [], status: "ready" as const, canLoadMore: false, loadingMore: false, onLoadMore: () => undefined };

function props(overrides: Partial<AdminEventsSurfaceProps> = {}): AdminEventsSurfaceProps {
  return {
    events: [{ id: "e1", title: "TEST Sajam", status: "published" }],
    selectedEventId: "e1",
    onSelectEvent: () => undefined,
    catalog: {
      days: [{ dateKey: "2026-10-09", label: "TEST dan 1" }],
      participations: [
        { id: "p1", externalKey: "test-p1", exhibitorName: "TEST Izlagač A", codes: "SMK-T-A · SML-T-A", segment: "event_only", status: "active" },
        { id: "p2", externalKey: "test-p2", exhibitorName: "TEST Izlagač B", codes: "SMK-T-B · SML-T-B", segment: "standard", status: "active" },
      ],
      stands: [{ id: "s1", externalKey: "test-s1", code: "A1", displayName: "TEST štand", mapLocationId: "test-loc-a1", exhibitorName: "TEST Izlagač A", status: "active" }],
      models: [{
        id: "m1", externalKey: "test-m1", displayName: "TEST Model", slug: "test-model", brandName: "TEST Brend", exhibitorName: "TEST Izlagač A",
        standLabel: "TEST štand · A1", tier: "starter", status: "draft", priceText: "Cena na upit", specCount: 2, highlightCount: 1, hasPhoto: false,
        passportEligible: true, packageActivatedAt: Date.parse("2026-10-09T09:00:00+02:00"), qrCode: null,
        issues: [{ severity: "error", code: "FAIR_HIGHLIGHT_LIMIT", path: "specifications" }, { severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }],
      }],
      qrConfigured: true,
    },
    inventory: empty,
    eventClients: empty,
    actions: { publish: ok, withdraw: ok, upgrade: ok, assignQr: ok, releaseQr: ok, convert: ok, resolveTest: async () => ({ ok: false, code: "ACTION_FAILED" }), dryRun: async () => ({ ok: false, code: "ACTION_FAILED" }), commit: async () => ({ ok: false, code: "ACTION_FAILED" }) },
    ...overrides,
  };
}

describe("B1A admin Događaji surface", () => {
  test("overview lists days, both client segments, stands and models with package and status", () => {
    const html = renderToStaticMarkup(<AdminEventsSurface {...props()} />);
    for (const text of [adminEventsSr.pageTitle, adminEventsSr.tabOverview, adminEventsSr.tabModel, adminEventsSr.tabQr, adminEventsSr.tabImport, adminEventsSr.tabClients, "TEST dan 1", adminEventsSr.segments.event_only, adminEventsSr.segments.standard, "test-loc-a1", adminEventsSr.tiers.starter, adminEventsSr.modelStatus.draft]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('role="tablist"');
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("every backend issue code has Serbian text; unknown codes stay visible", () => {
    for (const code of FAIR_ADMIN_ISSUE_CODES) expect(issueText(code)).toBe(adminEventsSr.issues[code]);
    expect(issueText("ACTION_FAILED")).toBe(adminEventsSr.actionFailed);
    expect(issueText("NEW_CODE")).toContain("NEW_CODE");
  });

  test("empty and loading states render without a catalog", () => {
    expect(renderToStaticMarkup(<AdminEventsSurface {...props({ events: [] })} />)).toContain(adminEventsSr.noEventsTitle);
    expect(renderToStaticMarkup(<AdminEventsSurface {...props({ events: undefined })} />)).toContain('role="status"');
  });
});
