import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ModelLeaderboard } from "@/components/admin/events/analytics/model-leaderboard";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { leaderboard } from "@/lib/admin-v2/analytics/leaderboard";
import type { AnalyticsData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const d = adminEventsSr.analytics;
const v = d.v2.leaderboard;
const data = previewAnalytics as AnalyticsData;
const rows = leaderboard(data, previewAudience, previewEngagement);
const noop = () => {};
/** The list shows this many rows before „Prikaži svih“. */
const LEADER_LIMIT = 10;
const count = (html: string, needle: string) => html.split(needle).length - 1;

const render = (props: Partial<Parameters<typeof ModelLeaderboard>[0]> = {}) =>
  renderToStaticMarkup(<ModelLeaderboard data={data} audience={previewAudience} engagement={previewEngagement} onOpen={noop} {...props} />);

/** The markup of every list row, in order. */
const rowsOf = (html: string) => html.split("<li ").filter((part) => part.startsWith("data-leader-row"));
const nameOf = (row: (typeof rows)[number]) => `${row.brandName} ${row.name}`;

describe("ModelLeaderboard", () => {
  test("lists the first ten models in the order of the leaderboard, with a button to open each", () => {
    // The premise: the fixtures have more models than the list shows at first.
    expect(rows).toHaveLength(15);
    const html = render();
    const list = rowsOf(html);
    expect(list).toHaveLength(LEADER_LIMIT);
    rows.slice(0, LEADER_LIMIT).forEach((row, index) => {
      expect(list[index]).toContain(`aria-label="${fmt(v.open, { model: nameOf(row) })}"`);
      expect(list[index]).toContain(row.exhibitorName);
      expect(list[index]).toContain(formatCount(row.scans.total));
    });
    expect(html).toContain(v.title);
    expect(html).toContain(v.question);
  });

  test("below the first ten there is a button to show all, collapsed at first, and the table still has every model", () => {
    const html = render();
    expect(count(html, "data-leader-more")).toBe(1);
    const button = /<button type="button" data-leader-more=""[^>]*>[^<]*<\/button>/.exec(html)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain(">Prikaži svih 15<");
    expect(button).toContain(`>${fmt(v.showAll, { count: rows.length })}<`);
    expect(button).not.toContain(fmt(v.showTop, { count: LEADER_LIMIT }));
    // The models after the tenth are not in the list but are in the table twin.
    const [listPart, tablePart] = html.split("data-chart-table");
    for (const row of rows.slice(LEADER_LIMIT)) {
      expect(listPart).not.toContain(`aria-label="${fmt(v.open, { model: nameOf(row) })}"`);
      expect(tablePart).toContain(`>${nameOf(row)}</td>`);
    }
    expect(html.match(/<tr class="border-t/g)).toHaveLength(rows.length);
  });

  test("with ten models or fewer there is no button; with eleven there is", () => {
    const keep = (total: number): AnalyticsData => ({ ...data, models: data.models.filter((model) => rows.slice(0, total).some((row) => row.eventModelId === model.eventModelId)) });
    for (const total of [10, 3]) {
      const html = render({ data: keep(total) });
      expect(rowsOf(html)).toHaveLength(total);
      expect(html).not.toContain("data-leader-more");
      expect(html.match(/<tr class="border-t/g)).toHaveLength(total);
    }
    const eleven = render({ data: keep(11) });
    expect(rowsOf(eleven)).toHaveLength(LEADER_LIMIT);
    expect(eleven).toContain(fmt(v.showAll, { count: 11 }));
  });

  test("the first three places carry a medal ring, the fourth does not", () => {
    const list = rowsOf(render());
    expect(list[0]).toContain('data-medal="1"');
    expect(list[1]).toContain('data-medal="2"');
    expect(list[2]).toContain('data-medal="3"');
    expect(list[3]).not.toContain("data-medal");
    expect(list[0]).toContain(`aria-label="${v.medals[1]}"`);
    expect(list[3]).toContain(`aria-label="${fmt(v.place, { rank: 4 })}"`);
  });

  test("a model that passed another one says how many places it gained, the passed one how many it lost", () => {
    const up = rows.find((row) => row.move !== null && row.move > 0);
    const down = rows.find((row) => row.move !== null && row.move < 0);
    expect(up).toBeDefined();
    expect(down).toBeDefined();
    const list = rowsOf(render());
    const rowOf = (target: typeof up) => list[rows.indexOf(target!)];
    expect(rowOf(up)).toContain(fmt(v.moveUp, { places: up!.move! }));
    expect(rowOf(down)).toContain(fmt(v.moveDown, { places: -down!.move! }));
    expect(rowOf(up)).toContain("lucide-arrow-up");
    expect(rowOf(down)).toContain("lucide-arrow-down");
    expect(render()).toContain(v.moveHelp);
  });

  test("a model that kept its place draws nothing, only the words for assistive technology", () => {
    const index = rows.slice(0, LEADER_LIMIT).findIndex((row) => row.move === 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const item = rowsOf(render())[index];
    expect(item).toContain(`<span class="sr-only">${v.moveSame}</span>`);
    // No dash, no arrow in the move cell.
    const moveCell = /style="grid-area:move">([\s\S]*?)<\/span><div/.exec(item)![1];
    expect(moveCell).toBe(`<span class="sr-only">${v.moveSame}</span>`);
    expect(moveCell).not.toContain("lucide");
    expect(moveCell).not.toContain("—");
    expect(moveCell).not.toContain("–");
  });

  test("the open model is marked on the row and on its button only", () => {
    const open = rows[2];
    const list = rowsOf(render({ openId: open.eventModelId }));
    list.forEach((item, index) => {
      expect(item.includes("data-open")).toBe(index === 2);
      expect(item.includes('aria-current="true"')).toBe(index === 2);
    });
    expect(rowsOf(render({ openId: null })).some((item) => item.includes("aria-current"))).toBe(false);
  });

  test("every row has its trend as an image with the days read out", () => {
    const first = rowsOf(render())[0];
    const trend = rows[0].trend!;
    expect(first).toContain(`aria-label="${fmt(d.v2.kpi.trendAria, { label: nameOf(rows[0]), values: trend.map((value, index) => `${data.days[index].label} ${formatCount(value)}`).join(", ") })}"`);
  });

  test("shows the rating with its count, and a dash for a model nobody rated", () => {
    const rated = rows.findIndex((row) => row.rating);
    const unrated = rows.findIndex((row) => !row.rating);
    const list = rowsOf(render());
    const { average, count } = rows[rated].rating!;
    expect(list[rated]).toContain(`${average.toLocaleString("sr-RS", { maximumFractionDigits: 2 })} (${count})`);
    expect(list[rated]).toContain(`title="${fmt(d.ratingCount, { count })}"`);
    expect(list[unrated]).toContain("—");
    expect(list[unrated]).not.toContain("title=");
  });

  test("the rating is visible in the narrow layout when there is one (with its label), and the cell is hidden below the wide layout when there is none", () => {
    const list = rowsOf(render()).slice(0, LEADER_LIMIT);
    const cellOf = (item: string) => /<span class="([^"]*)" style="grid-area:rating"[^>]*>([\s\S]*?)<\/span>([^<]*)<\/span>/.exec(item)!;
    const ratedIndex = rows.slice(0, LEADER_LIMIT).findIndex((row) => row.rating);
    const unratedIndex = rows.slice(0, LEADER_LIMIT).findIndex((row) => !row.rating);
    expect(ratedIndex).toBeGreaterThanOrEqual(0);
    expect(unratedIndex).toBeGreaterThanOrEqual(0);
    const rated = cellOf(list[ratedIndex]);
    expect(rated[1].split(" ")).not.toContain("hidden");
    // The label stays visible in the narrow layout and only becomes screen-reader text in the wide one.
    expect(rated[2]).toBe(`<span class="@4xl:sr-only">${d.columns.rating} `);
    const { average, count } = rows[ratedIndex].rating!;
    expect(rated[3]).toBe(`${average.toLocaleString("sr-RS", { maximumFractionDigits: 2 })} (${count})`);
    const unrated = cellOf(list[unratedIndex]);
    expect(unrated[1].split(" ")).toContain("hidden");
    expect(unrated[1]).toContain("@4xl:block");
  });

  test("zero leads are in the muted colour; a row with a lead stands out in the wide layout", () => {
    const leadsClass = (item: string) => /class="([^"]*)" style="grid-area:leads"/.exec(item)![1];
    const plain = rowsOf(render()).slice(0, LEADER_LIMIT);
    expect(rows.every((row) => row.leads === 0)).toBe(true);
    for (const item of plain) expect(leadsClass(item)).not.toContain("text-[var(--admin-text)]");
    const withLead = render({ data: { ...data, models: data.models.map((model) => (model.eventModelId === rows[1].eventModelId ? { ...model, leads: 3 } : model)) } });
    const list = rowsOf(withLead);
    expect(leadsClass(list[0])).not.toContain("text-[var(--admin-text)]");
    expect(leadsClass(list[1])).toContain("@4xl:text-[var(--admin-text)]");
  });

  test("without the day series there are no arrows and no trend, but the list stands", () => {
    const html = render({ engagement: undefined });
    const list = rowsOf(html);
    expect(list).toHaveLength(LEADER_LIMIT);
    expect(html).toContain(fmt(v.showAll, { count: rows.length }));
    expect(html).not.toContain("lucide-arrow");
    expect(html).not.toContain(v.moveNew);
    expect(html).not.toContain(" po danu: ");
    expect(html).not.toContain(v.moveHelp);
    expect(list[0]).toContain(formatCount(rows[0].scans.total));
  });

  test("works before the audience read is in", () => {
    const html = render({ audience: undefined });
    const list = rowsOf(html);
    expect(list).toHaveLength(LEADER_LIMIT);
    expect(html).toContain(fmt(v.showAll, { count: rows.length }));
  });

  test("has the table twin with every column and a row per model", () => {
    const html = render();
    expect(html).toContain("data-chart-table");
    expect(html).toContain(d.tableToggle);
    for (const column of [v.rank, d.columns.model, d.columns.exhibitor, d.columns.stand, d.columns.tier, d.columns.scans, d.columns.unique, d.columns.leads, d.columns.conversion, d.columns.votes, d.columns.rating]) {
      expect(html).toContain(`>${column}</th>`);
    }
    expect(html.match(/<tr class="border-t/g)).toHaveLength(rows.length);
  });

  test("without a published model it says so and draws no list or table", () => {
    const html = render({ data: { ...data, models: [] } });
    expect(html).toContain(d.emptyRanking);
    expect(html).not.toContain("data-leader-row");
    expect(html).not.toContain("data-chart-table");
  });
});
