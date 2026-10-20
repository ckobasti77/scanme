import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TimelapseRank, type TimelapseRankProps } from "@/components/admin/events/analytics/timelapse-rank";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const v = adminEventsSr.analytics.v2.timelapse;
const noop = () => {};
const rows: TimelapseRankProps["rows"] = [
  { locationId: "loc-b", label: "TEST B", scans: 12, place: 1 },
  { locationId: "loc-a", label: "TEST A", scans: 3, place: 2 },
  { locationId: "loc-c", label: "TEST C", scans: 1, place: 3 },
];
const base: TimelapseRankProps = { rows, time: "14:00", max: 24, picked: null, onPick: noop };
const render = (props: Partial<TimelapseRankProps> = {}) => renderToStaticMarkup(<TimelapseRank {...base} {...props} />);
const row = (html: string, id: string) => html.match(new RegExp(`<li [^>]*data-rank-row="${id}"[^>]*>.*?</li>`))?.[0] ?? "";

describe("TimelapseRank", () => {
  test("the rows keep the given order, not the order of their counts", () => {
    const html = render({ rows: [rows[1], rows[2], rows[0]] });
    expect([...html.matchAll(/data-rank-row="([^"]+)"/g)].map((match) => match[1])).toEqual(["loc-a", "loc-c", "loc-b"]);
    expect(html).toContain('data-timelapse-rank=""');
  });

  test("the place, the name and the count with the right noun form", () => {
    const html = render();
    expect(row(html, "loc-b")).toContain(">1</span>");
    expect(row(html, "loc-b")).toContain(fmt(v.rankRow, { stand: "TEST B" }));
    expect(row(html, "loc-b")).toContain("12 skenova");
    expect(row(html, "loc-a")).toContain("3 skena");
    expect(row(html, "loc-a")).toContain(">2</span>");
    expect(row(html, "loc-c")).toContain("1 sken<");
  });

  test("the title, the moment and the section name come from the dictionary", () => {
    const html = render();
    expect(html).toContain(`<section aria-label="${v.rankTitle}"`);
    expect(html).toContain(fmt(v.rankAt, { time: "14:00" }));
  });

  test("aria-pressed marks only the picked row", () => {
    const html = render({ picked: "loc-a" });
    expect(row(html, "loc-a")).toContain('aria-pressed="true"');
    expect(row(html, "loc-b")).toContain('aria-pressed="false"');
    expect(row(html, "loc-c")).toContain('aria-pressed="false"');
    expect(row(html, "loc-a")).toContain('<button type="button"');
  });

  test("the bar is a transform scaled to the max of the day", () => {
    const html = render({ max: 24 });
    expect(row(html, "loc-b")).toContain("scaleX(0.5)");
    expect(row(html, "loc-a")).toContain("scaleX(0.125)");
    expect(row(html, "loc-b")).toContain("var(--admin-chart-1)");
    expect(row(html, "loc-b")).not.toContain("width:");
  });

  test("a bar never leaves its track, and without a scale it is 0", () => {
    expect(row(render({ max: 6 }), "loc-b")).toContain("scaleX(1)");
    expect(row(render({ max: 0 }), "loc-b")).toContain("scaleX(0)");
    expect(row(render({ max: 0 }), "loc-a")).toContain("scaleX(0)");
  });

  test("no rows: the empty text with the moment, no list", () => {
    const html = render({ rows: [] });
    expect(html).toContain(fmt(v.rankEmpty, { time: "14:00" }));
    expect(html).not.toContain("data-timelapse-rank=");
    expect(html).not.toContain("data-rank-row");
  });
});
