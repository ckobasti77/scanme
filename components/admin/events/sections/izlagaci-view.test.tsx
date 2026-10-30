import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { eventSectionHref } from "@/lib/admin-v1/event-sections";
import { buildExhibitorRows, type ExhibitorSource } from "@/lib/admin-v1/exhibitors";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { EventExhibitorsView } from "./izlagaci-view";

// Admin UX A5 — Izlagači: every exhibitor of the event with brands, models
// per package, QR coverage, leads, follow-up and stands; Tabela/Kartice,
// segment filter and search; "Prebaci u redovne klijente" for event_only.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const list = adminEventsSr.exhibitorList;
const BASE = "/admin/dogadjaji/test-sajam";
const ok = async () => ({ ok: true as const });

const source: ExhibitorSource = {
  participations: [
    { id: "p-a", accountId: "a-a", exhibitorName: "TEST Izlagač A", codes: "SMK-TEST-A · SML-TEST-A", segment: "event_only", status: "active" },
    { id: "p-b", accountId: "a-b", exhibitorName: "TEST Izlagač B", codes: "SMK-TEST-B · SML-TEST-B", segment: "standard", status: "active" },
  ],
  stands: [{ participationId: "p-a", code: "TEST-A1", displayName: "TEST štand A1" }],
  models: [
    { participationId: "p-a", brandName: "TEST Volta", tier: "advanced", qrCode: "TQ001" },
    { participationId: "p-a", brandName: "TEST Amper", tier: "starter", qrCode: null },
    { participationId: "p-b", brandName: "TEST Om", tier: "included", qrCode: "TQ002" },
  ],
};
const exhibitors = buildExhibitorRows(source, { capped: false, byParticipation: [{ participationId: "p-a", total: 7, undelivered: 2 }] });
const clients = {
  rows: [{ accountId: "a-a", name: "TEST Izlagač A", smkCode: "SMK-TEST-A" }, { accountId: "a-x", name: "TEST Klijent bez učešća", smkCode: "SMK-TEST-X" }],
  status: "ready" as const, canLoadMore: false, loadingMore: false, onLoadMore: () => undefined,
};

function html(query: AdminQueryState = {}, view?: "tabela" | "kartice", rows = exhibitors) {
  const element = (
    <EventExhibitorsView
      exhibitors={rows}
      leadsCapped={false}
      query={query}
      onQueryChange={() => undefined}
      modelsHref={(id) => eventSectionHref(BASE, "modeli", { izlagac: id })}
      importHref={eventSectionHref(BASE, "import")}
      clients={clients}
      actions={{ convert: ok }}
    />
  );
  return renderToStaticMarkup(view ? <AdminViewModeOverride value={view}>{element}</AdminViewModeOverride> : element);
}

describe("A5 Izlagači", () => {
  test("table: every column (naziv, SMK·SML, segment, brendovi, modeli po paketu, QR n/m, leadovi, follow-up, štand)", () => {
    const markup = html({}, "tabela");
    for (const header of [list.colExhibitor, list.colCodes, list.colSegment, list.colBrands, list.colModels, list.colQr, list.colLeads, list.colFollowUp, list.colStands]) {
      expect(markup).toContain(header);
    }
    for (const text of ["TEST Izlagač A", "TEST Izlagač B", "<span>SMK-TEST-A</span><span>SML-TEST-A</span>", "TEST Amper, TEST Volta", "Za sve 0 · Starter 1 · Napredni 1", "1/2", "1/1", "TEST štand A1 · TEST-A1", adminEventsSr.segments.event_only, adminEventsSr.segments.standard]) {
      expect(markup).toContain(text);
    }
    expect(markup).toMatch(/>7<\/strong>/);
    expect(markup).toContain("2 neisporučeno");
    expect(markup).toContain(list.followUpPendingHint);
    expect(markup).toContain(`aria-label="QR ima 1 od 2 modela"`);
    expect(markup).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("a row opens Modeli filtered to the exhibitor; the convert action only for event_only", () => {
    const markup = html({}, "tabela");
    expect(markup).toContain(`href="${BASE}/modeli?izlagac=p-a"`);
    expect(markup).toContain(`href="${BASE}/modeli?izlagac=p-b"`);
    expect(markup).toContain(`aria-label="Prebaci TEST Izlagač A u redovne klijente"`);
    expect(markup).not.toContain(`aria-label="Prebaci TEST Izlagač B u redovne klijente"`);
  });

  test("Tabela | Kartice switch on the list; cards keep the fields and actions", () => {
    const table = html({}, "tabela");
    expect(table).toContain('role="radiogroup"');
    expect(table).toContain(adminUiSr.viewTable);
    expect(table).toContain(adminUiSr.viewCards);
    const cards = html({}, "kartice");
    expect(cards).not.toContain("<table");
    for (const text of [list.colBrands, list.colModels, list.colLeads, list.colFollowUp, "TEST Amper, TEST Volta", `href="${BASE}/modeli?izlagac=p-a"`, "Prebaci TEST Izlagač A u redovne klijente"]) expect(cards).toContain(text);
  });

  test("filters: segment facet with counts, search, chips and the N od M counter", () => {
    const all = html();
    expect(all).toContain(`aria-label="${list.filterLabel}"`);
    expect(all).toContain(`placeholder="${list.searchPlaceholder}"`);
    expect(all).toContain(">Event-only (1)</option>");
    expect(all).toContain(">Standardni (1)</option>");
    expect(all).toContain("2 od 2 izlagača");
    const standard = html({ segment: "standard" }, "tabela");
    expect(standard).toContain("1 od 2 izlagača");
    expect(standard).toContain("TEST Izlagač B");
    expect(standard).not.toContain("TEST Izlagač A</a>");
    expect(standard).toContain(`${list.facetSegment}: ${list.segments.standard}`);
    const none = html({ q: "nema takvog" }, "tabela");
    expect(none).toContain(list.noMatchTitle);
    expect(none).toContain("Pretraga: „nema takvog“");
  });

  test("event_only clients without a participation stay convertible in a collapsed list; empty event links to import", () => {
    const markup = html({}, "tabela");
    expect(markup).toContain("<details");
    expect(markup).toContain(`${list.otherClientsTitle} (1)`);
    expect(markup).toContain("TEST Klijent bez učešća");
    expect(markup).toContain(`aria-label="Prebaci TEST Klijent bez učešća u redovne klijente"`);
    const empty = html({}, "tabela", []);
    expect(empty).toContain(list.emptyTitle);
    expect(empty).toContain(`href="${BASE}/import"`);
  });

  test("A8: the follow-up column shows each exhibitor's text state and links to its editor", () => {
    const markup = renderToStaticMarkup(
      <AdminViewModeOverride value="tabela">
        <EventExhibitorsView
          exhibitors={exhibitors}
          leadsCapped={false}
          query={{}}
          onQueryChange={() => undefined}
          modelsHref={(id) => eventSectionHref(BASE, "modeli", { izlagac: id })}
          importHref={eventSectionHref(BASE, "import")}
          clients={clients}
          actions={{ convert: ok }}
          followUps={new Map([["p-a", { state: "draft" as const, advancedModels: 1 }], ["p-b", { state: "none" as const, advancedModels: 0 }]])}
          followUpHref={(id) => eventSectionHref(BASE, "leadovi/follow-up", { izlagac: id })}
        />
      </AdminViewModeOverride>,
    );
    expect(markup).toContain(adminEventsSr.followUps.states.draft);
    expect(markup).toContain(list.followUpNoAdvanced);
    expect(markup).toContain(`href="${BASE}/leadovi/follow-up?izlagac=p-a"`);
    expect(markup).toContain(`aria-label="Follow-up izlagača TEST Izlagač A"`);
    expect(markup).not.toContain(list.followUpPendingHint);
  });
});
