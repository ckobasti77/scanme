import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { Funnel } from "@/components/admin/events/analytics/funnel";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { formatShare } from "@/lib/admin-v2/analytics/format";
import { funnelSteps } from "@/lib/admin-v2/analytics/funnel";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => () => undefined }));

const v = adminEventsSr.analytics.v2.funnel;
const links = { leadSettings: "/admin/dogadjaji/test/podesavanja", forms: "/admin/dogadjaji/test/forme" };
const render = (props: Partial<Parameters<typeof Funnel>[0]> = {}) =>
  renderToStaticMarkup(<Funnel data={previewAnalytics} audience={previewAudience} engagement={previewEngagement} links={links} {...props} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** The markup of one step. */
const stepOf = (html: string, id: string) => html.split('data-funnel-step="').find((part) => part.startsWith(`${id}"`)) ?? "";

/** The number of a step, as text. */
const valueOf = (step: string) => /data-funnel-value="[^>]*>([^<]*)</.exec(step)?.[1];

describe("X3 Funnel", () => {
  test("the fixtures go 460 -> 310 -> 11 -> 0 with the share that passes each step", () => {
    const steps = funnelSteps(previewAnalytics, previewAudience, previewEngagement);
    expect(steps.map((step) => step.value)).toEqual([460, 310, 11, 0]);
    const html = render();
    expect(html).toContain(v.title);
    expect(html).toContain(v.question);
    expect(html).toContain(v.note);
    for (const id of ["scans", "visitors", "engaged", "leads"] as const) {
      expect(html).toContain(v.steps[id]);
      expect(html).toContain(v.help[id]);
    }
    expect(valueOf(stepOf(html, "scans"))).toBe("460");
    expect(valueOf(stepOf(html, "visitors"))).toBe("310");
    expect(valueOf(stepOf(html, "engaged"))).toBe("11");
    expect(valueOf(stepOf(html, "leads"))).toBe("0");
    // Scans -> visitors loses nobody (the same phones scan again): no share, scans per visitor instead.
    expect(steps[1].rate).toBeNull();
    expect(formatShare(steps[2].rate)).toBe("3,5 %");
    const visitors = stepOf(html, "visitors");
    expect(visitors).toContain("data-funnel-ratio");
    expect(visitors).toContain(fmt(v.perVisitor, { value: "1,48" }));
    expect(visitors).toContain("1,48 skena po posetiocu");
    expect(visitors).not.toContain("data-funnel-rate");
    expect(visitors).not.toContain("67,4 %");
    expect(visitors).not.toContain(fmt(v.rate, { share: "67,4 %" }));
    expect(stepOf(html, "engaged")).toContain("data-funnel-rate");
    expect(stepOf(html, "engaged")).toContain(fmt(v.rate, { share: "3,5 %" }));
    expect(stepOf(html, "engaged")).not.toContain("data-funnel-ratio");
    // The first step has no step before it.
    expect(stepOf(html, "scans")).not.toContain("data-funnel-rate");
    expect(stepOf(html, "scans")).not.toContain("data-funnel-ratio");
    expect(count(html, "data-funnel-ratio")).toBe(1);
  });

  test("a zero leads step is marked as the problem, with both links", () => {
    const html = render();
    expect(count(html, "data-funnel-problem")).toBe(1);
    expect(stepOf(html, "leads")).toContain("data-funnel-problem");
    expect(count(html, "data-chart-problem")).toBe(1);
    expect(html).toContain(v.zeroTitles.leads);
    expect(html).toContain(fmt(v.leadsZeroBody, { visitors: "310" }));
    for (const check of v.leadsZeroChecks) expect(html).toContain(check);
    expect(html).toContain(`href="${links.leadSettings}"`);
    expect(html).toContain(v.openLeadSettings);
    expect(html).toContain(`href="${links.forms}"`);
    expect(html).toContain(v.openForms);
    expect(html).toContain("lucide-triangle-alert");
  });

  test("with a lead there is no problem box", () => {
    const html = render({ data: { ...previewAnalytics, kpis: { ...previewAnalytics.kpis, leads: { ...previewAnalytics.kpis.leads, total: 3 } } } });
    expect(html).not.toContain("data-chart-problem");
    expect(html).not.toContain("data-funnel-problem");
    expect(valueOf(stepOf(html, "leads"))).toBe("3");
  });

  test("nobody engaged explains that step instead", () => {
    const html = render({ engagement: { ...previewEngagement, engaged: { visitors: 0, rating: 0, vote: 0, survey: 0, lead: 0 } } });
    expect(stepOf(html, "engaged")).toContain("data-funnel-problem");
    expect(html).toContain(v.zeroTitles.engaged);
    expect(html).not.toContain(v.zeroTitles.leads);
    expect(html).toContain(v.engagedZeroBody);
    expect(html).not.toContain(v.openForms);
  });

  test("nobody visited explains the visitors step, and there is no scans-per-visitor line", () => {
    const html = render({
      audience: { ...previewAudience, visitors: { today: 0, total: 0, capped: false } },
      engagement: { ...previewEngagement, engaged: { visitors: 0, rating: 0, vote: 0, survey: 0, lead: 0 } },
    });
    expect(count(html, "data-funnel-problem")).toBe(1);
    expect(stepOf(html, "visitors")).toContain("data-funnel-problem");
    expect(count(html, "data-chart-problem")).toBe(1);
    expect(html).toContain(v.zeroTitles.visitors);
    expect(html).not.toContain(v.zeroTitles.leads);
    expect(html).not.toContain(v.zeroTitles.engaged);
    expect(html).not.toContain("data-funnel-ratio");
  });

  test("has the table twin: step, value and share that passes", () => {
    const html = render();
    expect(html).toContain("data-chart-table");
    for (const column of [v.columnStep, adminEventsSr.analytics.v2.table.value, v.columnRate]) expect(html).toContain(`>${column}</th>`);
    expect(html).toContain("<td");
    // The visitors row says scans per visitor in the transition column, the engaged row the share.
    expect(html).toContain(`>${fmt(v.perVisitor, { value: "1,48" })}</td>`);
    expect(html).toContain(">3,5 %</td>");
    expect(html).not.toContain(">67,4 %<");
  });

  test("a read that has not arrived reads a dash and a loading line, never a false zero or a problem", () => {
    const html = render({ audience: undefined, engagement: undefined });
    const visitors = stepOf(html, "visitors");
    expect(valueOf(visitors)).toBe("—");
    expect(visitors).toContain(adminEventsSr.analytics.v2.loadingPart);
    expect(valueOf(stepOf(html, "engaged"))).toBe("—");
    expect(html).not.toContain("data-funnel-ratio");
    expect(html).not.toContain("data-funnel-problem");
    expect(html).not.toContain("data-chart-problem");
  });

  test("with nothing scanned the bars are empty and nothing is flagged", () => {
    const zero = { today: 0, total: 0 };
    const html = render({
      data: { ...previewAnalytics, kpis: { ...previewAnalytics.kpis, scans: zero, uniquePerModel: zero } },
      audience: { ...previewAudience, visitors: { today: 0, total: 0, capped: false } },
      engagement: { ...previewEngagement, engaged: { visitors: 0, rating: 0, vote: 0, survey: 0, lead: 0 } },
    });
    expect(html).not.toContain("data-chart-problem");
    expect(html).not.toContain("data-funnel-rate");
    expect(html).not.toContain("data-funnel-ratio");
  });
});

describe("V1 Funnel: reveal marks", () => {
  test("the list of steps is the funnel the reveal engine fills from the top", () => {
    const html = render();
    expect(count(html, "data-admin-draw=\"funnel\"")).toBe(1);
    expect(/<ol data-admin-draw="funnel"[^>]*>s*<li data-funnel-step="scans"/.test(html)).toBe(true);
  });
});
