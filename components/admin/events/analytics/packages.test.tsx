import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PackageComparison } from "@/components/admin/events/analytics/packages";
import { previewAnalytics, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { packageRows } from "@/lib/admin-v2/analytics/stands";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const d = adminEventsSr.analytics;
const v = d.v2.packages;
const render = (engagement = previewEngagement) => renderToStaticMarkup(<PackageComparison data={previewAnalytics} engagement={engagement} />);
const tiers = (html: string) => [...html.matchAll(/data-package="([^"]+)"/g)].map((match) => match[1]);

describe("PackageComparison", () => {
  test("three packages in the order Napredni, Starter, Besplatan with the numbers of packageRows", () => {
    const html = render();
    const rows = packageRows(previewAnalytics, previewEngagement);
    expect(tiers(html)).toEqual(["advanced", "starter", "included"]);
    const names = [d.tiers.advanced, d.tiers.starter, d.tiers.included];
    expect(names.map((name) => html.indexOf(`>${name}</span>`))).toEqual([...names.map((name) => html.indexOf(`>${name}</span>`))].sort((a, b) => a - b));
    for (const row of rows) {
      expect(html).toContain(`modela: ${formatCount(row.models)} · skenova: ${formatCount(row.scans)}`);
      expect(html).toContain(`>${formatCount(row.scansPerModel)}</span>`);
    }
    expect(html).toContain(v.perModel);
    expect(html).toContain('id="paketi"');
  });

  test("the best package has the full bar and the note about correlation is visible", () => {
    const html = render();
    expect(Math.max(...packageRows(previewAnalytics, previewEngagement).map((row) => row.share))).toBe(1);
    expect(html).toContain("width:100%");
    expect(html).toContain(v.note);
    expect(html).toContain("korelacija");
  });

  test("without the engagement read it falls back to the same numbers from the ranking", () => {
    const html = renderToStaticMarkup(<PackageComparison data={previewAnalytics} engagement={undefined} />);
    expect(tiers(html)).toEqual(packageRows(previewAnalytics, undefined).map((row) => row.tier));
    expect(html).not.toContain(d.v2.loadingPart);
  });

  test("has the table twin and an empty state without models", () => {
    const html = render();
    expect(html).toContain("data-chart-table");
    for (const column of [d.columns.tier, d.columns.scans, v.perModel]) expect(html).toContain(column);
    const empty = renderToStaticMarkup(<PackageComparison data={{ ...previewAnalytics, models: [] }} engagement={undefined} />);
    expect(empty).toContain(d.emptyRanking);
    expect(empty).not.toContain("data-chart-table");
    expect(tiers(empty)).toEqual([]);
  });
});
