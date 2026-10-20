import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { StandRanking } from "@/components/admin/events/analytics/stand-ranking";
import { previewAnalytics, previewAudience } from "@/components/admin/events/preview-analytics-fixtures";
import { formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { fairRecords } from "@/lib/admin-v2/analytics/records";
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
    const segments = (code: string) => (row(html, code).match(/<button type="button" data-admin-bar="x" aria-label="[^"]*skenova"/g) ?? []).length;
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

describe("StandRanking: medals, moves and the record of the day (ADMIN v2 X4)", () => {
  const lb = adminEventsSr.analytics.v2.leaderboard;
  const records = adminEventsSr.analytics.v2.records;

  test("the first three stands wear a medal with its words, the fourth a plain place", () => {
    const html = render();
    const [first, second, third, fourth] = standRanking(previewAnalytics, previewAudience);
    expect(row(html, first.standCode)).toContain('data-medal="1"');
    expect(row(html, first.standCode)).toContain(`aria-label="${lb.medals[1]}"`);
    expect(row(html, second.standCode)).toContain(`aria-label="${lb.medals[2]}"`);
    expect(row(html, third.standCode)).toContain(`aria-label="${lb.medals[3]}"`);
    expect(row(html, fourth.standCode)).not.toContain("data-medal");
    expect(row(html, fourth.standCode)).toContain(`aria-label="4. mesto"`);
    // The medal stands left of the stand code.
    const markup = row(html, first.standCode);
    expect(markup.indexOf("data-medal")).toBeLessThan(markup.indexOf(">9<"));
  });

  test("a stand that moved up shows an arrow and the words; a stand that stood still shows only words for assistive technology", () => {
    // Stand 1A had the fewest scans before today; give it a big day so it passes the others.
    const models = previewAnalytics.models.map((model) => (model.standCode === "1A" ? { ...model, scans: { today: 400, total: model.scans.total + 400 - model.scans.today } } : model));
    const html = render({ data: { ...previewAnalytics, models } });
    const up = row(html, "1A");
    expect(up).toContain("lucide-arrow-up");
    expect(up).toContain("gore za 3");
    const same = standRanking(previewAnalytics, previewAudience);
    expect(same.every((entry) => entry.move === 0)).toBe(true);
    expect(row(render(), "9")).toContain(`>${lb.moveSame}<`);
    expect(row(render(), "9")).not.toContain("lucide-arrow");
  });

  test("the strongest stand of the day carries the tag, and only that one", () => {
    const record = fairRecords(previewAnalytics, undefined).stand;
    expect(record?.standCode).toBe("9");
    const html = render({ record });
    expect(html.split("data-record-badge").length - 1).toBe(1);
    expect(row(html, "9")).toContain(records.stand);
    // In the stand's own row the tag says only the number of the day (the stand is named beside it).
    expect(row(html, "9")).toContain("77 skenova danas");
    expect(row(html, "9")).not.toContain("Štand 9 · 77 skenova");
    // What the place, the arrow and the tag measure is written under the list.
    expect(html).toContain(adminEventsSr.analytics.v2.stands.rankHelp);
    expect(row(html, "6")).not.toContain("data-record-badge");
    expect(render()).not.toContain("data-record-badge");
  });
});

describe("V1 StandRanking: reveal marks", () => {
  test("the ranked list is a rows container whose direct children are the stands", () => {
    const html = render();
    expect(html.split("data-admin-reveal=\"rows\"").length - 1).toBe(1);
    expect(/<ol data-admin-reveal="rows"[^>]*><li data-stand=/.test(html)).toBe(true);
  });
});
