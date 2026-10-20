import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ConstellationCounts } from "@/lib/admin-v2/constellation/types";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { ConstellationSummary, constellationSummary } from "./constellation-summary";

const COUNTS: ConstellationCounts = { total: 40, urgent: 4, today: 6, needsReply: 1, graceOrWarning: 2, waitingScanme: 3, waitingClient: 4, calm: 20 };

describe("constellationSummary", () => {
  test("says the four numbers, and waiting is the sum of the four waiting counters", () => {
    const text = constellationSummary(COUNTS);
    expect(text).toContain("Hitno: 4.");
    expect(text).toContain("Danas: 6.");
    expect(text).toContain("Čeka: 10.");
    expect(text).toContain("Mirno: 20.");
    expect(text).not.toMatch(/\{\w+\}/);
  });

  test("zeros are said as zeros", () => {
    const text = constellationSummary({ total: 0, urgent: 0, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 0 });
    expect(text).toContain("Hitno: 0.");
    expect(text).toContain("Čeka: 0.");
  });

  test("says the numbers are unavailable when there are none", () => {
    expect(constellationSummary(null)).toBe(adminV1Sr.dashboardConstellationSummaryUnavailable);
  });
});

describe("ConstellationSummary", () => {
  test("is visible to a screen reader only", () => {
    const html = renderToStaticMarkup(<ConstellationSummary counts={COUNTS} />);
    expect(html).toMatch(/^<p class="sr-only" data-constellation-summary="">/);
    expect(html).toContain("Čeka: 10.");
  });

  test("renders the unavailable text for null counts", () => {
    const html = renderToStaticMarkup(<ConstellationSummary counts={null} />);
    expect(html).toContain("sr-only");
    expect(html).toContain("nisu dostupni");
  });
});
