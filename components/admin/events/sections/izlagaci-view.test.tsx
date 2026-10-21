import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { eventSectionHref } from "@/lib/admin-v1/event-sections";
import { buildExhibitorRows, type ExhibitorSource } from "@/lib/admin-v1/exhibitors";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import type { SidebarState } from "@/lib/admin-v2/sidebar/types";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { EventExhibitorsView, exhibitorsSidebarLive } from "./izlagaci-view";

// Admin UX A5 — Izlagači: every exhibitor of the event with brands, models
// per package, QR coverage, leads, follow-up and stands; Tabela/Kartice;
// ADMIN v2: the search and the segment filter are in the sidebar of the admin
// frame; "Prebaci u redovne klijente" for event_only.

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

/** The sidebar of the Izlagači page as the frame renders it: the registry configuration with what the list sends. */
function sidebarHtml(query: AdminQueryState, rows = exhibitors) {
  return renderToStaticMarkup(
    <AdminSidebarView config={resolveAdminSidebar(`${BASE}/izlagaci`)} live={exhibitorsSidebarLive(rows, query)} state={query as SidebarState} onPatch={() => undefined} />,
  );
}

/** A radio row of a sidebar group: the option and the number next to it. */
const option = (label: string, count: number) => new RegExp(`>${label}</span><span[^>]*>${count}</span>`);

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

  test("ADMIN v2: the list has no filter block above it; the N od M counter and the subtitle stay", () => {
    const markup = html();
    expect(markup).not.toContain('data-admin-primitive="filter-bar"');
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain('type="search"');
    expect(markup).not.toContain(`aria-label="${list.filterLabel}"`);
    expect(markup).toContain(list.subtitle);
    expect(markup).toContain("2 od 2 izlagača");
    // The H1 of the screen is the title; the list is not wrapped in a panel that repeats it.
    expect(markup).not.toContain(`<h2`);
  });

  test("filtering behaves as before: segment narrows the list, a search without a match shows the next step", () => {
    const standard = html({ segment: "standard" }, "tabela");
    expect(standard).toContain("1 od 2 izlagača");
    expect(standard).toContain("TEST Izlagač B");
    expect(standard).not.toContain("TEST Izlagač A</a>");
    const none = html({ q: "nema takvog" }, "tabela");
    expect(none).toContain(list.noMatchTitle);
    expect(none).toContain(`>${adminUiSr.filters.clear}</button>`);
  });

  test("ADMIN v2 sidebar: the search and the Segment group with counts; no control lists the exhibitors", () => {
    const markup = sidebarHtml({});
    expect(markup).toContain(list.searchLabel);
    expect(markup).toContain(`placeholder="${list.searchPlaceholder}"`);
    expect(markup.match(/type="search"/g)).toHaveLength(1);
    expect(markup).toContain(`>${list.facetSegment}</span>`);
    expect(markup).toMatch(option(list.segments["event-only"], 1));
    expect(markup).toMatch(option(list.segments.standard, 1));
    // X6 (RX V2) — one more toggle: the section navigation is the folded group „Sekcija“ on a page with filters.
    expect(markup.match(/data-admin-filter-toggle=""/g)).toHaveLength(2);
    expect(markup).not.toContain('aria-expanded="true"');
    expect(markup).not.toContain(`>${adminUiSr.filters.clearAll}</button>`);
    for (const row of exhibitors) expect(markup).not.toContain(row.name);
  });

  test("ADMIN v2 sidebar: the segment counts follow the search; chips and Očisti sve appear for active filters", () => {
    const live = exhibitorsSidebarLive(exhibitors, {});
    expect(live.options?.segment).toEqual([
      { value: "event-only", label: list.segments["event-only"], count: 1 },
      { value: "standard", label: list.segments.standard, count: 1 },
    ]);
    // The search narrows the counts; the segment itself does not (each option shows what choosing it would give).
    expect(exhibitorsSidebarLive(exhibitors, { q: "SMK-TEST-A", segment: "standard" }).options?.segment?.map((o) => o.count)).toEqual([1, 0]);
    const query: AdminQueryState = { q: "TEST", segment: "standard" };
    const markup = sidebarHtml(query);
    expect(markup).toContain(`${list.searchLabel}: TEST`);
    expect(markup).toContain(`aria-label="${adminUiSr.filters.removeChip.replace("{label}", `${list.facetSegment}: ${list.segments.standard}`)}"`);
    expect(markup).toContain(`>${adminUiSr.filters.clearAll}</button>`);
    // The header of the group names the current choice.
    expect(markup).toContain(`>${list.facetSegment}</span><span class="text-[var(--admin-text-muted)]"> · ${list.segments.standard}</span>`);
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

describe("ADMIN v3 V1 Izlagači", () => {
  test("the subtitle is text, the list is rows in both views and the other-clients panel is a card", () => {
    const table = html({}, "tabela");
    expect(table).toContain('<p data-admin-reveal="text"');
    expect(table).toContain('<tbody data-admin-reveal="rows"');
    expect(table).toContain('data-admin-reveal="card"');
    expect(html({}, "kartice")).toContain('data-admin-reveal="rows"');
  });
});
