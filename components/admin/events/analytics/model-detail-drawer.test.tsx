import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ModelDetailBody, ModelDetailDrawer } from "@/components/admin/events/analytics/model-detail-drawer";
import { previewAnalytics, previewAudience, previewEngagement, previewModelAnalytics } from "@/components/admin/events/preview-analytics-fixtures";
import { formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { leaderboard, type LeaderRow } from "@/lib/admin-v2/analytics/leaderboard";
import { modelComparison } from "@/lib/admin-v2/analytics/model-detail";
import type { AnalyticsData, ModelAnalyticsData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const d = adminEventsSr.analytics;
const v = d.v2.detail;
const data = previewAnalytics as AnalyticsData;
const rows = leaderboard(data, previewAudience, previewEngagement);
const noop = () => {};

/** The model with the most scans, alone on none of the stands: three models share its stand. */
const crowded = rows.find((row) => modelComparison(row, data).standModels > 1)!;
const alone = rows.find((row) => modelComparison(row, data).standModels === 1)!;
const rated = rows.find((row) => row.rating)!;
const voted = rows.find((row) => row.votes > 0)!;
const detailOf = (row: LeaderRow) => previewModelAnalytics(row.eventModelId)!;

const body = (row: LeaderRow, detail: ModelAnalyticsData | undefined, error = false) =>
  renderToStaticMarkup(<ModelDetailBody row={row} data={data} detail={detail} error={error} onRetry={noop} />);

/** The value of a figure in the numbers section. */
const figure = (html: string, label: string) => new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>([^<]*)</dd>`).exec(html)?.[1];

describe("ModelDetailBody", () => {
  test("the preview has the models these tests need", () => {
    expect(crowded).toBeDefined();
    expect(alone).toBeDefined();
    expect(rated).toBeDefined();
    expect(voted).toBeDefined();
    expect(previewModelAnalytics(crowded.eventModelId)).not.toBeNull();
  });

  test("the numbers come from the row, with the repeated scans as the difference", () => {
    const html = body(crowded, undefined);
    expect(figure(html, v.kpi.scans)).toBe(formatCount(crowded.scans.total));
    expect(figure(html, v.kpi.unique)).toBe(formatCount(crowded.uniquePerModel.total));
    expect(figure(html, v.kpi.repeated)).toBe(formatCount(Math.max(0, crowded.scans.total - crowded.uniquePerModel.total)));
    expect(figure(html, v.kpi.leads)).toBe(formatCount(crowded.leads));
    expect(figure(html, v.kpi.conversion)).toBe(formatShare(crowded.conversion));
    expect(figure(html, v.kpi.votes)).toBe(formatCount(crowded.votes));
    expect(html).toContain(v.repeatedHelp);
    expect(html).toContain(v.conversionHelp);
  });

  test("the rating is the average with the count, or a dash", () => {
    const { average, count } = rated.rating!;
    expect(figure(body(rated, undefined), v.kpi.rating)).toBe(`${average.toLocaleString("sr-RS", { maximumFractionDigits: 2 })} (${count})`);
    expect(figure(body(rows.find((row) => !row.rating)!, undefined), v.kpi.rating)).toBe("—");
  });

  test("compares the model with its stand and with the fair", () => {
    const cmp = modelComparison(crowded, data);
    const html = body(crowded, undefined);
    expect(html).toContain(v.compareTitle);
    expect(html).toContain(v.compareQuestion);
    expect(html).toContain(v.compareModel);
    expect(html).toContain(fmt(v.compareStand, { stand: crowded.standCode, models: cmp.standModels }));
    expect(html).toContain(fmt(v.compareFair, { models: cmp.fairModels }));
    expect(html).toContain(formatCount(cmp.standAverage));
    expect(html).toContain(formatCount(cmp.fairAverage));
    expect(html).not.toContain(v.compareAlone);
  });

  test("a model alone on its stand has no stand row, only the sentence", () => {
    const html = body(alone, undefined);
    expect(html).toContain(v.compareAlone);
    expect(html).not.toContain(fmt(v.compareStand, { stand: alone.standCode, models: 1 }));
    expect(html).toContain(fmt(v.compareFair, { models: modelComparison(alone, data).fairModels }));
  });

  test("while the detail loads, one text stands in place of the parts that need it", () => {
    const html = body(crowded, undefined);
    expect(html).toContain(v.loading);
    expect(html.split(v.loading)).toHaveLength(2);
    for (const title of [v.daysTitle, v.hoursTitle, v.ratingsTitle, v.votesTitle, v.leadsTitle]) expect(html).not.toContain(`>${title}</h3>`);
    expect(html).toContain(v.garageNote);
  });

  test("a failed read shows the error with a retry button, not the loading text", () => {
    const html = body(crowded, undefined, true);
    expect(html).toContain(v.errorTitle);
    expect(html).toContain(v.errorBody);
    expect(html).toContain(v.retry);
    expect(html).not.toContain(v.loading);
    expect(figure(html, v.kpi.scans)).toBe(formatCount(crowded.scans.total));
  });

  test("with the detail: days split into first and repeated scans, with legend and table", () => {
    const detail = detailOf(crowded);
    const html = body(crowded, detail);
    expect(html).not.toContain(v.loading);
    expect(html).toContain(`>${v.daysTitle}</h3>`);
    expect(html).toContain(v.daysQuestion);
    expect(html).toContain(`>${v.legendUnique}</span>`);
    expect(html).toContain(`>${v.legendRepeated}</span>`);
    for (const day of detail.days) {
      expect(html).toContain(fmt(v.dayTip, { day: day.label, unique: formatCount(day.uniquePerModel), repeated: formatCount(Math.max(0, day.scans - day.uniquePerModel)) }));
    }
    expect(html).toContain("data-chart-table");
    expect(html).toContain(`>${d.v2.table.day}</th>`);
  });

  test("with the detail: the hours as a heat table with a scale, and its table twin", () => {
    const detail = detailOf(crowded);
    const html = body(crowded, detail);
    expect(html).toContain(`>${v.hoursTitle}</h3>`);
    expect(html).toContain(v.hoursQuestion);
    expect(html).toContain(d.v2.matrix.keyboardHint);
    expect(html).toContain(d.heatLegendLess);
    expect(html).toContain(fmt(d.v2.matrix.cell, { day: detail.days[0].label, hour: "08:00", scans: formatCount(detail.hours.find((hour) => hour.dateKey === detail.days[0].dateKey && hour.hour === 8)!.scans) }));
  });

  test("a model without hourly scans says so instead of an empty grid", () => {
    const detail = detailOf(crowded);
    const html = body(crowded, { ...detail, hours: detail.hours.map((hour) => ({ ...hour, scans: 0 })) });
    expect(html).toContain(d.v2.matrix.empty);
    expect(html).not.toContain(d.v2.matrix.keyboardHint);
  });

  test("ratings: the summary and five buckets, highest first; none says so", () => {
    const detail = detailOf(rated);
    const html = body(rated, detail);
    expect(html).toContain(fmt(v.ratingsSummary, { average: detail.ratings.average!.toLocaleString("sr-RS", { maximumFractionDigits: 2 }), count: detail.ratings.count }));
    v.ratingBuckets.forEach((label, index) => expect(html).toContain(`aria-label="${fmt(v.ratingTip, { label, count: detail.ratings.buckets[index] })}"`));
    expect(html.indexOf(`>${v.ratingBuckets[4]}</span>`)).toBeLessThan(html.indexOf(`>${v.ratingBuckets[0]}</span>`));
    expect(html).not.toContain(v.ratingsEmpty);

    const unrated = rows.find((row) => !row.rating)!;
    expect(body(unrated, detailOf(unrated))).toContain(v.ratingsEmpty);
  });

  test("votes list the question with its count; leads and the garage note have their texts", () => {
    const detail = detailOf(voted);
    const html = body(voted, detail);
    for (const question of detail.votes.questions) {
      expect(html).toContain(question.prompt);
      expect(html).toContain(fmt(v.votesCount, { votes: formatCount(question.votes) }));
    }
    expect(html).not.toContain(v.votesEmpty);
    const empty = body(crowded, detailOf(crowded));
    expect(empty).toContain(v.votesEmpty);
    expect(empty).toContain(v.leadsEmpty);
    expect(empty).toContain(v.garageNote);
  });

  test("leads with a count show the two kinds", () => {
    const detail = { ...detailOf(crowded), leads: { total: 5, interest: 3, testDrive: 2, capped: false } };
    const html = body(crowded, detail);
    expect(html).toContain(fmt(v.leadsLine, { interest: "3", testDrive: "2" }));
    expect(html).not.toContain(v.leadsEmpty);
  });
});

describe("ModelDetailDrawer", () => {
  test("closed it draws nothing", () => {
    const html = renderToStaticMarkup(<ModelDetailDrawer row={null} data={data} detail={undefined} error={false} onRetry={noop} onClose={noop} />);
    expect(html).toBe("");
  });
});
