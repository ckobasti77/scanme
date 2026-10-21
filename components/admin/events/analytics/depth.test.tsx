import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DepthOfInterest, PassportProgress } from "@/components/admin/events/analytics/depth";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { countOf, formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { depthOfInterest, passportFunnel } from "@/lib/admin-v2/analytics/depth";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const d = adminEventsSr.analytics;
/** The rows of the table twin. */
const tableRows = (html: string) => (/<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "").split("<tr").length - 1;
const depthHtml = (props: Partial<Parameters<typeof DepthOfInterest>[0]> = {}) =>
  renderToStaticMarkup(<DepthOfInterest data={previewAnalytics} audience={previewAudience} engagement={previewEngagement} {...props} />);
const passportHtml = (props: Partial<Parameters<typeof PassportProgress>[0]> = {}) =>
  renderToStaticMarkup(<PassportProgress audience={previewAudience} engagement={previewEngagement} {...props} />);

describe("DepthOfInterest", () => {
  test("the headline is the models per visitor with two decimals", () => {
    const html = depthHtml();
    const depth = depthOfInterest(previewAnalytics, previewAudience, previewEngagement)!;
    expect(depth.modelsPerVisitor).toBeCloseTo(431 / 310);
    expect(html).toContain(">1,39</span> modela po posetiocu");
    expect(html).toContain(d.v2.depth.headlineHelp);
    expect(html).toContain('id="dubina"');
  });

  test("four buckets with the visitors and the shares of depthOfInterest, in text", () => {
    const html = depthHtml();
    const depth = depthOfInterest(previewAnalytics, previewAudience, previewEngagement)!;
    expect(depth.buckets).toHaveLength(4);
    for (const bucket of depth.buckets) {
      const item = html.split("<li ").find((part) => part.includes(`data-bucket="${bucket.id}"`))!;
      expect(item).toContain(d.v2.depth.buckets[bucket.id]);
      expect(item).toContain(`>${formatCount(bucket.visitors)}</span>`);
      expect(item).toContain(formatShare(bucket.share));
    }
    // The ordered categories sit on the sequential ramp (300, 400, 500, 600), not on category colours.
    for (const step of [300, 400, 500, 600]) expect(html).toContain(`var(--admin-seq-${step})`);
    expect(html).not.toContain("var(--admin-seq-700)");
    expect(html).not.toContain("--admin-chart-");
    expect(html).toContain("data-chart-table");
  });

  test("the segment tip names the bucket, the visitors with their word form and the share", () => {
    const html = depthHtml();
    const depth = depthOfInterest(previewAnalytics, previewAudience, previewEngagement)!;
    for (const bucket of depth.buckets) {
      const tip = fmt(d.v2.depth.bucket, {
        label: d.v2.depth.buckets[bucket.id],
        visitors: countOf(bucket.visitors, d.v2.units.visitors),
        share: formatShare(bucket.share),
      });
      expect(html).toContain(`aria-label="${tip}"`);
    }
    expect(html).toContain('aria-label="1 model: 222 posetioca (71,6 %)"');
  });

  test("the list under the bar is the legend: no separate legend above the bar", () => {
    const html = depthHtml();
    expect(html).not.toContain("<ul aria-label");
    // Each bucket name sits in the list once (the table twin and the tips are other markup).
    const list = html.slice(html.indexOf('<ul class="grid min-w-0 text-sm"'));
    expect(list.split("data-bucket=").length - 1).toBe(4);
    expect(html.indexOf("data-depth-headline")).toBeLessThan(html.indexOf('<ul class="grid min-w-0 text-sm"'));
  });

  test("without the engagement read it says the part is loading", () => {
    const html = depthHtml({ engagement: undefined });
    expect(html).toContain(d.v2.loadingPart);
    expect(html).not.toContain("data-depth-headline");
    expect(html).not.toContain("data-chart-table");
  });

  test("no visitors → the empty text; a capped read is flagged", () => {
    const none = depthHtml({ engagement: { ...previewEngagement, depth: { one: 0, two: 0, three: 0, fourPlus: 0, visitors: 0 } } });
    expect(none).toContain(d.v2.depth.empty);
    expect(none).not.toContain("data-bucket");
    const capped = depthHtml({ engagement: { ...previewEngagement, capped: { ...previewEngagement.capped, visitors: true } } });
    expect(capped).toContain(d.v2.capped);
    expect(depthHtml()).not.toContain(d.v2.capped);
  });
});

describe("PassportProgress", () => {
  test("164 visitors with a stamp, 5 completed passports and the share of those visitors in the sentence", () => {
    const html = passportHtml();
    const funnel = passportFunnel(previewAudience, previewEngagement)!;
    const stampVisitors = previewEngagement.stampVisitors;
    expect(funnel).toMatchObject({ stamps: 210, completed: 5, stampVisitors: 164 });
    expect(stampVisitors).toBe(164);
    // Two rows with a bar: people against people.
    for (const step of ["stampVisitors", "completed"] as const) {
      const item = html.split("<li ").find((part) => part.includes(`data-step="${step}"`))!;
      expect(item).toContain(d.v2.passport.steps[step]);
    }
    expect(html.split("<li ").find((part) => part.includes('data-step="stampVisitors"'))).toContain(">164</span>");
    expect(html.split("<li ").find((part) => part.includes('data-step="completed"'))).toContain(">5</span>");
    expect(html).toContain(
      fmt(d.v2.passport.summary, { share: formatShare(5 / stampVisitors), completed: formatCount(5), visitors: formatCount(stampVisitors) }),
    );
    expect(html).toContain("data-passport-summary");
    expect(html).not.toContain(formatShare(5 / 210));
    expect(html).toContain(d.v2.passport.note);
    expect(html).toContain("data-chart-table");
    expect(html).toContain('id="pasos"');
  });

  test("the stamps are a plain line under the bars: another unit, so no bar and not a list row", () => {
    const html = passportHtml();
    expect(html).toContain(`<p data-step="stamps"`);
    expect(html).not.toContain(`<li data-step="stamps"`);
    expect(html).toContain(fmt(d.v2.passport.stampsLine, { stamps: "210" }));
    const line = html.slice(html.indexOf('data-step="stamps"'));
    expect(line.slice(0, line.indexOf("</p>"))).not.toContain("width:");
    expect(html.split("<li ").filter((part) => part.includes("data-step=")).length).toBe(2);
  });

  test("the bars are relative to the visitors with a stamp", () => {
    const html = passportHtml();
    // 164 visitors with a stamp are a full bar, and 5 / 164 of it have a completed passport; the 210 stamps have no bar.
    expect(html.split('style="width:').length - 1).toBe(2);
    expect(html).toContain("width:100%");
    expect(html).toContain(`width:${(5 / previewEngagement.stampVisitors) * 100}%`);
    expect(html).not.toContain(`width:${(5 / 210) * 100}%`);
  });

  test("the table has three rows: visitors with a stamp, stamps, completed passports", () => {
    const html = passportHtml();
    expect(tableRows(html)).toBe(3);
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)![1];
    const cells = [...body.matchAll(/<tr[^>]*><th[^>]*>([^<]*)<\/th><td[^>]*>([^<]*)<\/td>/g)].map((match) => [match[1], match[2]]);
    expect(cells).toEqual([
      [d.v2.passport.steps.stampVisitors, "164"],
      [d.v2.passport.steps.stamps, "210"],
      [d.v2.passport.steps.completed, "5"],
    ]);
  });

  test("before the engagement read the visitors with a stamp are a dash, with no bars and no sentence", () => {
    const html = passportHtml({ engagement: undefined });
    const item = html.split("<li ").find((part) => part.includes('data-step="stampVisitors"'))!;
    expect(item).toContain(">—</span>");
    expect(html).toContain(d.v2.loadingPart);
    expect(html).not.toContain("data-passport-summary");
    expect(html).not.toContain('style="width:');
    expect(html).toContain(fmt(d.v2.passport.stampsLine, { stamps: "210" }));
    expect(tableRows(html)).toBe(3);
    expect(html).toContain(`>${d.v2.passport.steps.stampVisitors}</th><td class="py-1.5 pr-3 text-right last:pr-0">—</td>`);
  });

  test("a read with no visitor with a stamp has no sentence (no share of nothing)", () => {
    const html = passportHtml({ engagement: { ...previewEngagement, stampVisitors: 0 } });
    expect(html).not.toContain("data-passport-summary");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  test("without the audience read it says the part is loading", () => {
    const html = passportHtml({ audience: undefined });
    expect(html).toContain(d.v2.loadingPart);
    expect(html).not.toContain("data-step");
  });

  test("no stamps → the empty text instead of the rows", () => {
    const html = passportHtml({ audience: { ...previewAudience, stamps: { total: 0, passportsCompleted: 0, capped: false } } });
    expect(html).toContain(d.v2.passport.empty);
    expect(html).not.toContain("data-step");
    expect(html).not.toContain("data-passport-summary");
  });
});
