import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { KpiStrip } from "@/components/admin/events/analytics/kpi-strip";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { formatShare, formatSigned, hourLabel } from "@/lib/admin-v2/analytics/format";
import { kpiStrip } from "@/lib/admin-v2/analytics/kpi";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => () => undefined }));

const d = adminEventsSr.analytics;
const render = (props: Partial<Parameters<typeof KpiStrip>[0]> = {}) =>
  renderToStaticMarkup(<KpiStrip data={previewAnalytics} audience={previewAudience} engagement={previewEngagement} {...props} />);
/** The markup of one big tile. */
const tileOf = (html: string, id: string) => html.split('data-kpi-tile="').find((part) => part.startsWith(`${id}"`)) ?? "";

/** The big number of a tile, as text (the odometer span inside the value element is looked through). */
const bigOf = (tile: string) => /data-kpi-value="[^>]*>(?:<span[^>]*>)?([^<]*)</.exec(tile)?.[1];

describe("X3 KpiStrip", () => {
  test("only the name „Jedinstveni po modelu“ carries its definition as a title", () => {
    const html = render();
    const titled = html.match(/<dt title="/g) ?? [];
    expect(titled).toHaveLength(1);
    expect(tileOf(html, "uniquePerModel")).toContain(`<dt title="${d.definitions.uniquePerModel.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}`);
    expect(tileOf(html, "scans")).not.toContain("<dt title=");
  });

  test("shows today's number with the whole fair beside it, from the fixtures", () => {
    const html = render();
    const strip = kpiStrip(previewAnalytics, previewAudience, previewEngagement);
    expect(strip.dayRunning).toBe(true);
    expect(html).toContain(d.kpiTitle);
    expect(html).toContain(d.v2.kpi.question);
    for (const label of [d.kpi.scans, d.kpi.uniquePerModel, d.kpi.visitors, d.kpi.leads]) expect(html).toContain(label);
    const scans = tileOf(html, "scans");
    expect(bigOf(scans)).toBe("179");
    expect(scans).toContain(`${d.v2.kpi.today} · ${fmt(d.v2.kpi.totalHint, { total: "460" })}`);
    expect(scans).toContain("ceo sajam 460");
    // Trend: one bar per fair day, with the values for assistive technology.
    expect(scans).toContain('role="img"');
    expect(scans).toContain("Petak 104, Subota 177, Nedelja 179");
  });

  test("the difference to the day before is computed by kpiStrip and worded from the dictionary", () => {
    const html = render();
    const delta = kpiStrip(previewAnalytics, previewAudience, previewEngagement).tiles[0].delta!;
    expect(delta.basis).toBe("sameTime");
    const base = fmt(d.v2.kpi.deltaSameTime, { diff: formatSigned(delta.diff), hour: hourLabel(delta.hour!) });
    const text = delta.ratio === null ? base : `${base} ${fmt(d.v2.kpi.deltaPercent, { percent: formatShare(Math.abs(delta.ratio)) })}`;
    expect(tileOf(html, "scans")).toContain(text);
    expect(tileOf(html, "scans")).toContain("lucide-arrow-up-right");
  });

  test("a fall is muted with a down arrow, never the danger colour", () => {
    const days = previewAnalytics.days.map((day, index) => (index === 2 ? { ...day, scans: 40 } : day));
    const html = render({ data: { ...previewAnalytics, days } });
    const scans = tileOf(html, "scans").split('data-kpi-delta=""')[1].split("</p>")[0];
    expect(scans).toContain("lucide-arrow-down-right");
    expect(scans).toContain("text-[var(--admin-text-muted)]");
    expect(scans).not.toContain("danger");
  });

  test("a lead count of zero beside scans is marked with an icon and the sentence", () => {
    const leads = tileOf(render(), "leads");
    expect(leads).toContain(d.v2.kpi.leadsZero);
    expect(leads).toContain("data-kpi-problem");
    expect(leads).toContain("lucide-triangle-alert");
    expect(leads).toContain("text-[var(--admin-danger)]");
    expect(bigOf(leads)).toBe("0");
  });

  test("has the table twin with a row per big number and a column per fair day", () => {
    const html = render();
    expect(html).toContain("data-chart-table");
    for (const day of previewAnalytics.days) expect(html).toContain(`>${day.label}</th>`);
    expect(html).toContain(`>${d.v2.table.total}</th>`);
    expect(html).toContain(`<th scope="row" class="py-1.5 pr-3 text-left font-normal">${d.kpi.scans}</th>`);
  });

  test("the four quieter totals come from the reads", () => {
    const html = render();
    const more = html.slice(html.indexOf(`aria-label="${d.v2.kpi.moreTitle}"`));
    for (const label of [d.kpi.votes, d.kpi.surveys, d.kpi.stamps, d.kpi.shares]) expect(more).toContain(label);
    expect(more).toContain(fmt(d.kpi.stampsHint, { passports: "5" }));
    expect(more).toContain(`>${previewAudience.stamps.total}<`);
  });

  test("without audience and engagement the missing parts read a dash, never a false zero", () => {
    const html = render({ audience: undefined, engagement: undefined });
    const visitors = tileOf(html, "visitors");
    expect(bigOf(visitors)).toBe("—");
    expect(visitors).not.toContain("role=\"img\"");
    expect(visitors).not.toContain("data-kpi-delta");
    expect(html).toContain(d.v2.loadingPart);
    const more = html.slice(html.indexOf(`aria-label="${d.v2.kpi.moreTitle}"`));
    expect(more).toContain(">—<");
    // What the first read already holds is still shown.
    expect(bigOf(tileOf(html, "scans"))).toBe("179");
  });

  test("with nothing scanned there is no problem to flag", () => {
    const zero = { today: 0, total: 0 };
    const data = {
      ...previewAnalytics,
      kpis: { ...previewAnalytics.kpis, scans: zero, uniquePerModel: zero },
      days: previewAnalytics.days.map((day) => ({ ...day, scans: 0, uniquePerModel: 0 })),
      hours: [],
    };
    const html = render({ data });
    expect(html).not.toContain(d.v2.kpi.leadsZero);
    expect(html).not.toContain("data-kpi-problem");
  });

  test("a capped read is said so on the tile", () => {
    const html = render({ data: { ...previewAnalytics, capped: true } });
    expect(tileOf(html, "scans")).toContain(d.capped);
  });
});

describe("X4 KpiStrip: odometer and the first lead", () => {
  const withLeads = (perDay: number[]) => ({ ...previewEngagement, days: previewEngagement.days.map((day, index) => ({ ...day, leads: perDay[index] ?? 0 })) });

  test("the big number is drawn by the odometer; a missing number stays a plain dash", () => {
    const html = render();
    expect(tileOf(html, "scans")).toContain('data-kpi-value=""');
    expect(tileOf(html, "scans")).toContain("data-admin-odometer");
    const early = tileOf(render({ audience: undefined, engagement: undefined }), "visitors");
    expect(early).not.toContain("data-admin-odometer");
    expect(bigOf(early)).toBe("—");
  });

  test("no lead, no tag", () => {
    expect(render()).not.toContain("data-record-badge");
  });

  test("the first lead is tagged with the day it came, on the leads tile only", () => {
    const html = render({ engagement: withLeads([0, 2, 3]) });
    expect(tileOf(html, "leads")).toContain("data-record-badge");
    expect(tileOf(html, "leads")).toContain(`${d.v2.records.firstLead}</span><span class="text-[var(--admin-text-muted)]">Subota`);
    expect(html.split("data-record-badge").length - 1).toBe(1);
  });
});

describe("V1 KpiStrip: reveal marks", () => {
  test("each of the four big numbers is a tilting kpi tile and the quiet totals are text", () => {
    const html = render();
    expect(html.split("data-admin-reveal=\"kpi\" data-admin-tilt=\"\"").length - 1).toBe(4);
    for (const id of ["scans", "uniquePerModel", "visitors", "leads"]) expect(tileOf(html, id).startsWith(id + "\" data-admin-reveal=\"kpi\"")).toBe(true);
    // The odometer inside the tile is found by the engine itself: no count mark on the value.
    expect(html).not.toContain("data-admin-count");
    expect(html.split("data-admin-reveal=\"text\"").length - 1).toBe(1);
  });
});
