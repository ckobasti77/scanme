import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { StandRanking } from "@/components/admin/events/analytics/stand-ranking";
import { previewAnalytics, previewAudience } from "@/components/admin/events/preview-analytics-fixtures";
import { formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { standRanking } from "@/lib/admin-v2/analytics/stands";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const v = adminEventsSr.analytics.v2.stands;
const render = (props: Partial<Parameters<typeof StandRanking>[0]> = {}) =>
  renderToStaticMarkup(<StandRanking data={previewAnalytics} audience={previewAudience} {...props} />);
const standCodes = (html: string) => [...html.matchAll(/data-stand="([^"]+)"/g)].map((match) => match[1]);
const row = (html: string, code: string) => html.split("<li ").find((part) => part.includes(`data-stand="${code}"`)) ?? "";

describe("StandRanking", () => {
  test("one row per stand in the order of the ranking, with the title and the question", () => {
    const html = render();
    const expected = standRanking(previewAnalytics, previewAudience).map((entry) => entry.standCode);
    expect(expected.length).toBe(4);
    expect(standCodes(html)).toEqual(expected);
    expect(html).toContain(v.title);
    expect(html).toContain(v.question);
    expect(html).toContain('id="standovi"');
  });

  test("numbers of a stand come from the ranking, today under the scans", () => {
    const html = render();
    const first = standRanking(previewAnalytics, previewAudience)[0];
    const markup = row(html, first.standCode);
    for (const text of [formatCount(first.scans), `${v.today} ${formatCount(first.scansToday)}`, formatCount(first.uniquePerModel), formatCount(first.visitors), formatShare(first.conversion)]) {
      expect(markup).toContain(text);
    }
  });

  test("a stand with two exhibitors has two segments, a stand with one has one", () => {
    const html = render();
    const two = standRanking(previewAnalytics, previewAudience).find((entry) => entry.exhibitors.length === 2)!;
    const one = standRanking(previewAnalytics, previewAudience).find((entry) => entry.exhibitors.length === 1)!;
    const segments = (code: string) => (row(html, code).match(/<button type="button" aria-label="[^"]*skenova"/g) ?? []).length;
    expect(segments(two.standCode)).toBe(2);
    expect(segments(one.standCode)).toBe(1);
    expect(row(html, two.standCode)).toContain(`${two.segments[0].exhibitor}: ${formatCount(two.segments[0].scans)} skenova`);
  });

  test("the legend names all five TEST exhibitors; the package is a plain label", () => {
    const html = render();
    const legend = html.slice(html.indexOf(`aria-label="${v.legendTitle}"`));
    for (const name of ["A", "B", "C", "D", "E"]) expect(legend).toContain(`TEST Izlagač ${name}`);
    expect(row(html, "9")).toContain(adminEventsSr.analytics.tiers.advanced);
  });

  test("without the audience read the visitors are a dash, never a zero", () => {
    const html = render({ audience: undefined });
    const nine = row(html, "9");
    expect(nine).toMatch(/<dd class="tabular-nums">—<\/dd>/);
    expect(standRanking(previewAnalytics, undefined).every((entry) => entry.visitors === null)).toBe(true);
  });

  test("the stand code is a button only when a handler is given", () => {
    expect(render()).not.toContain(v.open.replace("{stand}", "9"));
    expect(render({ onPickStand: () => {} })).toContain(`aria-label="${v.open.replace("{stand}", "9")}"`);
  });

  test("has the table twin with the column heads, and an empty state without models", () => {
    const html = render();
    expect(html).toContain("data-chart-table");
    const c = adminEventsSr.analytics.columns;
    const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    for (const column of [c.stand, c.exhibitor, c.scans, c.unique, c.visitors, c.leads, c.conversion]) expect(head).toContain(`>${column}</th>`);
    const empty = render({ data: { ...previewAnalytics, models: [] } });
    expect(empty).toContain(adminEventsSr.analytics.emptyRanking);
    expect(empty).not.toContain("data-chart-table");
    expect(standCodes(empty)).toEqual([]);
  });
});
