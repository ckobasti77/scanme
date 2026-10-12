import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ChartFrame, ChartLegend, ChartSegmented, ChartTable, HBar, MiniBars, RankMedal, RankMove, StackedBar } from "@/components/admin/events/analytics/chart-kit";
import { HallHeatMap } from "@/components/admin/events/analytics/heat-map";
import { Insights } from "@/components/admin/events/analytics/insights";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { previewDashboard } from "@/components/admin/events/preview-dashboard-fixtures";
import { EventDashboardView } from "@/components/admin/events/sections/pregled-view";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { ANALYTICS_ANCHORS } from "@/lib/admin-v2/analytics/anchors";
import { leaderboard } from "@/lib/admin-v2/analytics/leaderboard";
import { CHART_OTHER_COLOR, chartColor } from "@/lib/admin-v2/analytics/palette";
import { standRanking } from "@/lib/admin-v2/analytics/stands";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v2 X3 — the pieces around the charts: the shared chart kit (frame,
// legend, table twin, marks, medals), the insights list, the hall heat map in
// 2D, „Na ovoj strani“ in the sidebar and the link from Pregled.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const d = adminEventsSr.analytics;
const BASE = "/admin/dogadjaji/test-sajam";

describe("ADMIN v2 X3: the chart kit", () => {
  test("a frame names its chart, asks its question and carries the table twin", () => {
    const html = renderToStaticMarkup(
      <ChartFrame id="test-deo" title="TEST naslov" question="TEST pitanje?" note="TEST napomena" table={{ caption: "TEST tabela", columns: ["Dan", "Skenovi", "Udeo"], rows: [["Petak", 1234.5, "12,3 %"], ["Subota", null, null]] }}>
        <p>TEST sadržaj</p>
      </ChartFrame>,
    );
    expect(html).toContain('id="test-deo"');
    expect(html).toMatch(/<h2[^>]*>TEST naslov<\/h2><p[^>]*>TEST pitanje\?<\/p>/);
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    for (const text of ["TEST sadržaj", "TEST napomena", d.tableToggle, "<caption", "TEST tabela"]) expect(html).toContain(text);
    // Numbers are formatted (decimal comma), a missing value is a dash, the first cell is the row header.
    expect(html).toContain('<th scope="row"');
    expect(html).toMatch(/>1\.234,5<|>1234,5</);
    expect(html.split(">—<").length - 1).toBe(2);
    // No table when the chart has no data to tabulate.
    expect(renderToStaticMarkup(<ChartFrame id="x" title="a" question="b"><p /></ChartFrame>)).not.toContain("data-chart-table");
  });

  test("the legend is there for two or more series, never for one; the name is text, the colour a swatch", () => {
    const one = renderToStaticMarkup(<ChartLegend items={[{ key: "a", label: "TEST A", color: chartColor(1) }]} />);
    expect(one).toBe("");
    const two = renderToStaticMarkup(<ChartLegend label="TEST legenda" items={[{ key: "a", label: "TEST A", color: chartColor(1) }, { key: "b", label: "TEST B", color: chartColor(2) }]} />);
    expect(two).toContain('aria-label="TEST legenda"');
    expect(two).toContain("background:var(--admin-chart-1)");
    expect(two).toContain("background:var(--admin-chart-2)");
    // The label never wears the series colour.
    expect(two).not.toMatch(/color:var\(--admin-chart/);
  });

  test("marks: a bar has no border, a stack keeps a 2 px gap and names every segment", () => {
    const bar = renderToStaticMarkup(<HBar share={0.5} />);
    expect(bar).toContain("width:50%");
    expect(bar).toContain("background:var(--admin-chart-1)");
    expect(bar).not.toContain("border");
    expect(renderToStaticMarkup(<HBar share={7} />)).toContain("width:100%");
    expect(renderToStaticMarkup(<HBar share={-1} />)).toContain("width:0%");
    const stack = renderToStaticMarkup(<StackedBar label="TEST štand" segments={[{ key: "a", label: "TEST A", value: 30, color: chartColor(1) }, { key: "b", label: "TEST B", value: 0, color: chartColor(2) }, { key: "c", label: "TEST C", value: 10, color: CHART_OTHER_COLOR, tip: "TEST C: 10 skenova" }]} />);
    expect(stack).toContain('role="group"');
    expect(stack).toContain("gap-[2px]");
    // A segment without a value is not drawn; each drawn one is a keyboard stop with its text.
    expect(stack.split("<button").length - 1).toBe(2);
    expect(stack).toContain('aria-label="TEST A: 30"');
    expect(stack).toContain('aria-label="TEST C: 10 skenova"');
    expect(stack).toContain("flex-grow:30");
  });

  test("the trend highlights one day and says its values in words", () => {
    const html = renderToStaticMarkup(<MiniBars values={[104, 177, 179]} highlight={2} label="Skenovi po danu: Petak 104, Subota 177, Nedelja 179" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Skenovi po danu: Petak 104, Subota 177, Nedelja 179"');
    expect(html.split("<path").length - 1).toBe(3);
    expect(html.split(`fill="${chartColor(1)}"`).length - 1).toBe(1);
    expect(html.split(`fill="${CHART_OTHER_COLOR}"`).length - 1).toBe(2);
    // The readout on hover and on a tap is that same sentence; closed until then.
    expect(html).toContain("data-mini-bars");
    expect(html).not.toContain("data-chart-tip");
  });

  test("medals are a ring for the first three, never an emoji; a move has an arrow and words", () => {
    const gold = renderToStaticMarkup(<RankMedal rank={1} medal={1} label="Prvo mesto" />);
    expect(gold).toContain('data-medal="1"');
    expect(gold).toContain("var(--admin-medal-1)");
    expect(gold).toContain('aria-label="Prvo mesto"');
    expect(renderToStaticMarkup(<RankMedal rank={4} medal={null} label="4. mesto" />)).not.toContain("data-medal");
    expect(gold).not.toMatch(/[\u{1F3C5}\u{1F947}-\u{1F949}]/u);
    const labels = { up: (places: number) => `gore za ${places}`, down: (places: number) => `dole za ${places}`, same: "bez promene", isNew: "novo" };
    const up = renderToStaticMarkup(<RankMove move={2} isNew={false} labels={labels} />);
    expect(up).toContain("gore za 2");
    expect(up).toContain("lucide-arrow-up");
    const down = renderToStaticMarkup(<RankMove move={-1} isNew={false} labels={labels} />);
    expect(down).toContain("dole za 1");
    // A fall is quiet, not a danger.
    expect(down).not.toContain("--admin-danger");
    // No move draws nothing; the words stay for assistive technology.
    expect(renderToStaticMarkup(<RankMove move={0} isNew={false} labels={labels} />)).toBe('<span class="sr-only">bez promene</span>');
    expect(renderToStaticMarkup(<RankMove move={null} isNew labels={labels} />)).toContain("novo");
    expect(renderToStaticMarkup(<RankMove move={null} isNew={false} labels={labels} />)).toBe("");
  });

  test("a switch of a chart is a radiogroup with one checked choice", () => {
    const html = renderToStaticMarkup(<ChartSegmented label="TEST prikaz" value="3d" onChange={() => {}} options={[{ value: "2d", label: "2D" }, { value: "3d", label: "3D" }]} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="TEST prikaz"');
    expect(html).toMatch(/aria-checked="false" tabindex="-1" data-value="2d"/);
    expect(html).toMatch(/aria-checked="true" tabindex="0" data-value="3d"/);
  });

  test("the table twin alone: a caption for assistive technology, a closed <details> by default", () => {
    const html = renderToStaticMarkup(<ChartTable table={{ caption: "TEST", columns: ["A", "B"], rows: [["x", 1]] }} />);
    expect(html).toMatch(/^<details data-chart-table=""/);
    expect(html).not.toContain("<details open");
    expect(html).toContain('<caption class="sr-only">TEST</caption>');
  });
});

describe("ADMIN v2 X3: Uvidi and the hall heat map", () => {
  test("the insights are a short ordered list; the problem carries its icon and its word", () => {
    const html = renderToStaticMarkup(<Insights data={previewAnalytics} audience={previewAudience} engagement={previewEngagement} />);
    expect(html).toContain('id="uvidi"');
    const items = [...html.matchAll(/data-insight="([a-z_]+)" data-tone="([a-z]+)"/g)].map((match) => [match[1], match[2]]);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(6);
    expect(items[0]).toEqual(["no_leads_many", "problem"]);
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain(`<span class="sr-only">${d.v2.insights.problemLabel}: </span>`);
    expect(html).toContain(d.v2.insights.note);
    const empty = renderToStaticMarkup(<Insights data={{ ...previewAnalytics, kpis: { ...previewAnalytics.kpis, scans: { today: 0, total: 0 } } }} audience={undefined} engagement={undefined} />);
    expect(empty).toContain(d.v2.insights.empty);
    expect(empty).not.toContain("data-insight");
  });

  const map = (picked: string | null = null) => renderToStaticMarkup(
    <HallHeatMap
      eventCode="test-elektromobilnost-2026"
      data={previewAnalytics}
      stands={standRanking(previewAnalytics, previewAudience)}
      models={leaderboard(previewAnalytics, previewAudience, previewEngagement)}
      picked={picked}
      onPick={() => {}}
      onOpenModel={() => {}}
    />,
  );

  test("2D is what is drawn first: the scale of the public map, the exact count and share, a 2D | 3D switch", () => {
    const html = map();
    expect(html).toContain('id="mapa"');
    expect(html).toContain("data-heat-2d");
    // The 3D view is a lazy chunk: nothing of it is in the first markup.
    expect(html).not.toContain("data-heat-3d");
    expect(html).not.toContain("<canvas");
    expect(html).toMatch(/aria-checked="true" tabindex="0" data-value="2d"/);
    expect(html).toMatch(/aria-checked="false" tabindex="-1" data-value="3d"/);
    expect(html).toContain("linear-gradient(90deg, #2f6fe4 0%");
    for (const text of ["Štand 9: 70 · 43,2 %", "Štand 6: 54 · 33,3 %", "Štand 1B: 26 · 16 %", "Štand 1A: 12 · 7,4 %", d.v2.heat.standPick]) expect(html).toContain(text);
    // The list under the map says what the number is (the ranking above counts scans, the map unique per model).
    for (const text of ["Štand 9: 70 jedinstvenih po modelu · 43,2 %", "Štand 6: 54 jedinstvena po modelu · 33,3 %", "Štand 1B: 26 jedinstvenih po modelu · 16 %"]) expect(html).toContain(text);
    // Only the zone with scans is drawn; the other one is named, not shown as a screen of empty stands.
    expect(html.split('role="group" aria-label="Hala"').length - 1).toBe(1);
    expect(html).not.toContain('aria-label="Ispred hale"');
    expect(html).toContain("Bez skenova: Ispred hale.");
    // The keyboard path: one button per stand with scans, none pressed.
    expect(html.split('aria-pressed="false"').length - 1).toBeGreaterThanOrEqual(4);
    expect(html).toContain("data-chart-table");
  });

  test("a picked stand shows its numbers and its models, each opening the model detail", () => {
    const html = map("hala-6");
    expect(html).toContain('data-stand-detail="6"');
    expect(html).toContain("Izlagači: TEST Izlagač B, TEST Izlagač C");
    const detail = html.slice(html.indexOf('data-stand-detail="6"'));
    // Ten models stand on location 6 in the fixture, the busiest first.
    expect(detail.split("Otvori detalj: ").length - 1).toBe(10);
    expect(detail.indexOf("TEST Faradej F4 Hybrid")).toBeLessThan(detail.indexOf("TEST Om Kombi"));
    expect(html).not.toContain(d.v2.heat.standPick);
    // A map location without a stand in the ranking opens nothing.
    expect(map("hala-2")).not.toContain("data-stand-detail");
  });

  test("without a scan in the period the whole map is the context, and no zone is called quiet", () => {
    const html = renderToStaticMarkup(
      <HallHeatMap eventCode="test-elektromobilnost-2026" data={{ ...previewAnalytics, heat: { today: [], hour: [] } }} stands={[]} models={[]} picked={null} onPick={() => {}} onOpenModel={() => {}} />,
    );
    expect(html).toContain(d.heatEmpty);
    expect(html).toContain('aria-label="Hala"');
    expect(html).toContain('aria-label="Ispred hale"');
    expect(html).not.toContain("data-heat-quiet");
  });

  test("an event without a map geometry still lists its stands", () => {
    const html = renderToStaticMarkup(
      <HallHeatMap eventCode="test-bez-mape" data={previewAnalytics} stands={standRanking(previewAnalytics, previewAudience)} models={[]} picked={null} onPick={() => {}} onOpenModel={() => {}} />,
    );
    expect(html).not.toContain("data-heat-2d");
    expect(html).not.toContain('data-value="3d"');
    expect(html).toContain("hala-9: 70");
  });
});

describe("ADMIN v2 X3: „Na ovoj strani“ and the link from Pregled", () => {
  test("the sidebar of Analitika lists the parts of the page as anchors; the drawer leaves them out", () => {
    const config = resolveAdminSidebar(`${BASE}/analitika`);
    expect(config.anchors).toEqual({ label: d.v2.onThisPage, items: ANALYTICS_ANCHORS });
    expect(new Set(ANALYTICS_ANCHORS.map((anchor) => anchor.id)).size).toBe(ANALYTICS_ANCHORS.length);
    const html = renderToStaticMarkup(<AdminSidebarView config={config} state={{}} onPatch={() => undefined} />);
    expect(html).toContain(`<nav data-sidebar-block="anchors" aria-label="${d.v2.onThisPage}"`);
    for (const anchor of ANALYTICS_ANCHORS) expect(html).toContain(`href="#${anchor.id}"`);
    // The page has no filter: no accordion group, so the accordion contract has nothing to open.
    expect(html).not.toContain("data-admin-filter-toggle");
    expect(renderToStaticMarkup(<AdminSidebarView config={config} state={{}} onPatch={() => undefined} large />)).not.toContain('data-sidebar-block="anchors"');
    // Other sections have no anchors.
    for (const path of ["pregled", "modeli", "leadovi"]) expect(resolveAdminSidebar(`${BASE}/${path}`).anchors).toBeUndefined();
    expect(resolveAdminSidebar("/dev/admin-events-preview/analitika").anchors?.items).toEqual(ANALYTICS_ANCHORS);
  });

  test("the preview of Pregled has the last fair day with the totals of the Analitika preview", () => {
    const dashboard = previewDashboard("dan3");
    expect(dashboard.phase).toMatchObject({ kind: "sajam", dayIndex: 3, dayCount: 3, dayOpen: true });
    expect(dashboard.kpis.scans).toMatchObject({
      today: previewAnalytics.kpis.scans.today, total: previewAnalytics.kpis.scans.total,
      uniqueToday: previewAnalytics.kpis.uniquePerModel.today, uniqueTotal: previewAnalytics.kpis.uniquePerModel.total,
    });
    expect(dashboard.kpis.leads).toMatchObject({ total: previewAnalytics.kpis.leads.total, newToday: 0 });
    expect(dashboard.at).toBeGreaterThan(previewAnalytics.at);
    const html = renderToStaticMarkup(<EventDashboardView dashboard={dashboard} now={dashboard.at} base={BASE} />);
    for (const text of ["Sajamski dan 3 od 3", "179", "ceo sajam 460 · jedinstveni po modelu 431", "1 h 22 min"]) expect({ text, found: html.includes(text) }).toEqual({ text, found: true });
    // The other phases are what they were.
    expect(previewDashboard("sajam").kpis.scans.today).toBe(412);
    expect(previewDashboard(undefined).phase.dayIndex).toBe(2);
  });

  test("Pregled links to Analitika from its numbers and reads nothing new", () => {
    const dashboard = previewDashboard("sajam");
    const html = renderToStaticMarkup(<EventDashboardView dashboard={dashboard} now={dashboard.at} base={BASE} />);
    expect(html).toMatch(new RegExp(`<a href="${BASE}/analitika" data-open-analytics=""[^>]*>${adminEventsSr.dashboard.openAnalytics}`));
    expect(html.split("data-open-analytics").length - 1).toBe(1);
  });
});
