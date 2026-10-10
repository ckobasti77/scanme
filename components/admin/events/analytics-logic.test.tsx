import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { analyticsCsv, analyticsHourDay, analyticsModelRows, analyticsStandRows, formatPercent } from "./analytics-logic";
import { previewAnalytics, previewAudience } from "./preview-analytics-fixtures";
import { EventAnalyticsView } from "./sections/analitika-view";

describe("SAJAM SUPER: Analitika logic", () => {
  test("stands sum their models; conversion = leads / the stand's distinct visitors", () => {
    const stands = analyticsStandRows(previewAnalytics, previewAudience);
    const nine = stands.find((row) => row.locationId === "hala-9")!;
    expect(nine).toMatchObject({ standCode: "9", models: 3, scans: 88, uniquePerModel: 72, visitors: 49, leads: 12, votes: 54 });
    expect(nine.conversion).toBeCloseTo(12 / 49);
    // Visitors of a stand are never more than its unique-per-model pairs.
    for (const row of stands) expect(row.visitors!).toBeLessThanOrEqual(row.uniquePerModel);
    // Stand 6: two exhibitors on one location.
    expect(stands.find((row) => row.locationId === "hala-6")!.exhibitors).toEqual(["TEST AUTO MIG", "TEST Grand Motors"]);
    expect(stands.map((row) => row.standCode)).toEqual(["9", "6", "1A", "1B"]);
    // Before the audience read answers, conversion falls back to unique per model.
    expect(analyticsStandRows(previewAnalytics, undefined)[0]).toMatchObject({ visitors: null, conversion: 12 / 72 });
  });

  test("models: sorted by scans, conversion = leads / unique per model, none without a unique scan", () => {
    const models = analyticsModelRows(previewAnalytics, previewAudience);
    expect(models[0].name).toBe("EV3");
    expect(models[0].conversion).toBeCloseTo(6 / 33);
    const empty = analyticsModelRows({ ...previewAnalytics, models: [{ ...previewAnalytics.models[0], uniquePerModel: { today: 0, total: 0 } }] }, undefined);
    expect(empty[0].conversion).toBeNull();
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.1818)).toBe("18,2 %");
  });

  test("the hour chart shows ?dan= when it exists, else today", () => {
    expect(analyticsHourDay(previewAnalytics, "2026-10-10")).toBe("2026-10-10");
    expect(analyticsHourDay(previewAnalytics, "1999-01-01")).toBe("2026-10-09");
    expect(analyticsHourDay({ ...previewAnalytics, todayKey: "2026-10-20" }, undefined)).toBe("2026-10-09");
  });

  test("CSV: BOM, every part, and a name never runs as a formula", () => {
    const csv = analyticsCsv({
      eventTitle: "TEST sajam",
      data: { ...previewAnalytics, models: [{ ...previewAnalytics.models[0], exhibitorName: "=HYPERLINK(\"x\")" }] },
      audience: previewAudience,
    });
    expect(csv.startsWith("﻿")).toBe(true);
    for (const part of ["Brojevi", "Skenovi po danu", "Skenovi po satu, od 08:00", "Rang modela", "Rang štandova", "Jedinstveni posetioci,71,71"]) expect(csv).toContain(part);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("\r\n");
  });

  test("the view renders the KPI row, both charts, both rankings, the heat map and devices", () => {
    const html = renderToStaticMarkup(
      <EventAnalyticsView eventCode="test-elektromobilnost-2026" data={previewAnalytics} audience={previewAudience} hourDay={undefined} onHourDay={() => {}} onRefresh={() => {}} refreshing={false} onExport={() => {}} />,
    );
    for (const text of ["Analitika", "Jedinstveni po modelu", "Jedinstveni posetioci", "Skenovi po danu", "Skenovi po satu, od 08:00", "Rang modela", "Rang štandova", "Toplotna mapa", "Uređaji", "Izvezi CSV", "Osveži"]) {
      expect(html).toContain(text);
    }
    // Admin heat map: the exact count is on the stand, the share in the list.
    expect(html).toContain("Štand 9: 72 · 57,6 %");
  });
});
