import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { HallMini } from "@/components/admin/events/analytics/hall-mini";
import { HALL_3D_FROM, HALL_VIEW_KEY, hallViewFor, hallViewStore, readHallView, writeHallView } from "@/components/admin/events/analytics/hall-view";
import { HallHeatMap } from "@/components/admin/events/analytics/heat-map";
import HeatMap3D from "@/components/admin/events/analytics/heat-map-3d";
import { previewAnalytics, previewAnalyticsStep, previewAudience, previewEngagement, previewHallToday, previewStandHours } from "@/components/admin/events/preview-analytics-fixtures";
import { previewDashboard } from "@/components/admin/events/preview-dashboard-fixtures";
import { EventAnalyticsView } from "@/components/admin/events/sections/analitika-view";
import { EventDashboardView } from "@/components/admin/events/sections/pregled-view";
import { ANALYTICS_ANCHORS } from "@/lib/admin-v2/analytics/anchors";
import { heatBlocks, locationScans } from "@/lib/admin-v2/analytics/heat-blocks";
import { leaderboard } from "@/lib/admin-v2/analytics/leaderboard";
import { standRanking } from "@/lib/admin-v2/analytics/stands";
import { ambientRates, scanImpulses } from "@/lib/admin-v2/hall/impulses";
import { hallSeries, heightsAt, rankAt } from "@/lib/admin-v2/hall/timelapse";
import type { StandHoursState } from "@/lib/admin-v2/hall/types";
import { fairMapForEventCode } from "@/lib/fair-map";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v3 V3 — the Living hall and the Vremeplov without a DOM: what the server
// sends (the 2D map, the controls of the Vremeplov, the text equivalent, never a
// canvas), where the hall stands on the page, the excerpt on Pregled, and that
// the TEST fixtures drive the same pure functions as the scene. The scene itself
// needs WebGL: it is proven by the frames of the step
// (output/playwright/admin-v3/V3/kadrovi.mjs).

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const d = adminEventsSr.analytics;
const w = d.v2.timelapse;
const EVENT = "test-elektromobilnost-2026";
const TODAY = previewAnalytics.todayKey;

const standHours = (dateKey: string | null = TODAY, step = 0): StandHoursState => ({
  dateKey,
  data: dateKey ? previewStandHours(dateKey, step) ?? undefined : undefined,
  error: false,
  request: () => {},
});

const map = (props: Partial<Parameters<typeof HallHeatMap>[0]> = {}) => renderToStaticMarkup(
  <HallHeatMap
    eventCode={EVENT}
    data={previewAnalytics}
    stands={standRanking(previewAnalytics, previewAudience)}
    models={leaderboard(previewAnalytics, previewAudience, previewEngagement)}
    picked={null}
    onPick={() => {}}
    onOpenModel={() => {}}
    {...props}
  />,
);

describe("V3: the hall on the server and without JavaScript", () => {
  test("the 2D map is what the server sends: no canvas, no 3D box, 2D checked", () => {
    const html = map({ standHours: standHours() });
    expect(html).toContain("data-heat-2d");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("data-heat-3d");
    expect(html).toMatch(/aria-checked="true" tabindex="0" data-value="2d"/);
    expect(hallViewStore.getServer()).toBe("2d");
  });

  test("with the hourly read the Vremeplov stands under the map: the days, the clock, the slider, „Premotaj dan“ and „Uživo“", () => {
    const html = map({ standHours: standHours() });
    expect(html).toContain('data-hall-timelapse=""');
    expect(html).toContain(`aria-label="${w.title}"`);
    expect(html).toContain('data-timelapse-mode="live"');
    // The fair days that have started, the open one chosen.
    for (const day of previewAnalytics.days) expect(html).toContain(`data-value="${day.dateKey}"`);
    expect(html).toMatch(new RegExp(`aria-checked="true" tabindex="0" data-value="${TODAY}"`));
    // The slider runs over the hours of the day; in the live picture it stands at the end and the clock is the time of the read.
    const series = hallSeries(previewStandHours(TODAY)!);
    expect(html).toContain(`max="${series.end}"`);
    expect(html).toContain(`value="${series.end}"`);
    expect(html).toContain('aria-valuetext="22:37"');
    expect(html).toMatch(/data-timelapse-clock=""[^>]*><span[^>]*>22:37<\/span>/);
    expect(html).toMatch(new RegExp(`data-timelapse-action="toggle"[^>]*>(<svg.*?</svg>)?${w.play}`));
    expect(html).toMatch(/data-timelapse-action="live" aria-pressed="true"/);
    expect(html).toContain(w.help);
    // The live region is in the markup and silent until a pause or a move of the slider.
    expect(html).toContain('<p class="sr-only" aria-live="polite" data-timelapse-announce=""></p>');
  });

  test("while the hours are on the way the controls wait; a failed read says so and offers a retry", () => {
    const loading = map({ standHours: { dateKey: TODAY, data: undefined, error: false, request: () => {} } });
    expect(loading).toContain(w.loading);
    expect(loading).toMatch(/data-timelapse-action="toggle" disabled=""/);
    expect(loading).toMatch(/data-timelapse-slider=""[^>]*disabled=""/);
    const failed = map({ standHours: { dateKey: TODAY, data: undefined, error: true, request: () => {} } });
    expect(failed).toContain(w.error);
    expect(failed).toContain('data-timelapse-action="retry"');
  });

  test("without the hourly read there is no Vremeplov, and before the first fair day it says when it starts", () => {
    expect(map()).not.toContain("data-hall-timelapse");
    const before = map({ data: { ...previewAnalytics, todayKey: "2026-10-01" }, standHours: standHours(null) });
    expect(before).toContain(w.none);
    expect(before).not.toContain("data-timelapse-slider");
    expect(before).not.toContain('data-timelapse-action="toggle"');
  });

  test("a partial read says so: with a count when stands were left out, without one when only the models were", () => {
    const partial = (unread: number): StandHoursState => ({ dateKey: TODAY, data: { ...previewStandHours(TODAY)!, capped: true, unread }, error: false, request: () => {} });
    const left = map({ standHours: partial(3) });
    expect(left).toContain('data-timelapse-capped=""');
    expect(left).toContain("van čitanja: 3");
    const models = map({ standHours: partial(0) });
    expect(models).toContain(`data-timelapse-capped="" class="text-xs text-[var(--admin-text-muted)]">${d.v2.capped}`);
    expect(models).not.toContain("van čitanja");
    expect(map({ standHours: standHours() })).not.toContain("data-timelapse-capped");
  });

  test("the live list of the stands and the table twin stay under the map", () => {
    const html = map({ standHours: standHours() });
    for (const text of ["Štand 9: 70 jedinstvenih po modelu · 43,2 %", d.v2.heat.standPick, d.tableToggle, d.heatIntro]) expect(html).toContain(text);
    expect(html).not.toContain("data-timelapse-rank");
  });
});

describe("V3: the 3D box of the hall (the React side of the scene)", () => {
  const geometry = fairMapForEventCode(EVENT)!;
  const scene = heatBlocks(geometry, previewAnalytics.heat.today, locationScans(previewAnalytics.models, "today"), ["hala"]);
  const box = (props: Partial<Parameters<typeof HeatMap3D>[0]> = {}) => renderToStaticMarkup(
    <HeatMap3D scene={scene} picked={null} onPick={() => {}} label="TEST opis hale" resetLabel="TEST vrati" blockLabel={(block) => (block.value > 0 ? `${block.label} · ${block.value}` : null)} fallback={<svg data-test-flat="" />} className="h-80" {...props} />,
  );

  test("the server sends the 2D picture and the text equivalent in the box of the scene, never a canvas", () => {
    const html = box();
    expect(html).toContain('data-admin-stage=""');
    expect(html).toContain('data-stage-state="flat"');
    expect(html).toContain('<p class="sr-only">TEST opis hale</p>');
    expect(html).toMatch(/<div data-stage-fallback="" class="absolute inset-0"><svg data-test-flat=""><\/svg><\/div>/);
    expect(html).not.toContain("<canvas");
    expect(html).toContain('data-heat-3d-state="flat"');
  });

  test("the labels of the stands with scans are in the markup, hidden until the scene places them; „Vrati pogled“ comes with the scene", () => {
    const html = box();
    const labels = [...html.matchAll(/data-block-label="([^"]+)"[^>]*>([^<]+)</g)];
    expect(labels.map((match) => match[1]).sort()).toEqual(["hala-1a", "hala-1b", "hala-6", "hala-9"]);
    expect(labels.find((match) => match[1] === "hala-9")?.[2]).toBe("9 · 77");
    for (const [tag] of html.matchAll(/<span[^>]*data-block-label[^>]*>/g)) {
      expect(tag).toContain('aria-hidden="true"');
      expect(tag).toContain("opacity-0");
    }
    expect(html).not.toContain("TEST vrati");
    expect(html).not.toContain("<button");
  });

  test("the excerpt has no labels and no controls", () => {
    const html = box({ mini: true });
    expect(html).not.toContain("data-block-label");
    expect(html).not.toContain("<button");
  });
});

describe("V3: where the hall stands", () => {
  test("the hall is the second part of Analitika, right after the numbers, in the page and in „Na ovoj strani“", () => {
    expect(ANALYTICS_ANCHORS.slice(0, 3).map((anchor) => anchor.id)).toEqual(["brojevi", "mapa", "uvidi"]);
    const html = renderToStaticMarkup(
      <EventAnalyticsView
        eventCode={EVENT}
        data={previewAnalytics}
        audience={previewAudience}
        engagement={previewEngagement}
        modelId={undefined}
        modelDetail={undefined}
        modelError={false}
        onModel={() => {}}
        onModelRetry={() => {}}
        links={{ leadSettings: "/admin/dogadjaji/test/leadovi/podesavanja", forms: "/admin/dogadjaji/test/interakcije" }}
        onRefresh={() => {}}
        refreshing={false}
        onExport={() => {}}
        standHours={standHours()}
      />,
    );
    const at = (id: string) => html.indexOf(`id="${id}"`);
    for (const anchor of ANALYTICS_ANCHORS) expect(at(anchor.id), anchor.id).toBeGreaterThan(-1);
    expect(at("brojevi")).toBeLessThan(at("mapa"));
    expect(at("mapa")).toBeLessThan(at("uvidi"));
    expect(html.split('id="mapa"').length - 1).toBe(1);
    expect(html).toContain('data-hall-timelapse=""');
  });

  test("Pregled carries the excerpt below „Šta treba da uradim“ only when it is given one", () => {
    const dashboard = previewDashboard("dan3");
    const without = renderToStaticMarkup(<EventDashboardView dashboard={dashboard} now={dashboard.at} base="/admin/dogadjaji/test-sajam" />);
    expect(without).not.toContain("data-hall-mini");
    const withHall = renderToStaticMarkup(
      <EventDashboardView dashboard={dashboard} now={dashboard.at} base="/admin/dogadjaji/test-sajam" hall={<HallMini eventCode={EVENT} data={previewHallToday(dashboard.kpis.scans.today)} href="/admin/dogadjaji/test-sajam/analitika#mapa" />} />,
    );
    expect(withHall).toContain('data-hall-mini=""');
    expect(withHall.indexOf(adminEventsSr.dashboard.todoTitle)).toBeLessThan(withHall.indexOf('data-hall-mini=""'));
    expect(withHall.indexOf('data-hall-mini=""')).toBeLessThan(withHall.indexOf(adminEventsSr.dashboard.kpiTitle));
  });
});

describe("V3: the excerpt of the hall on Pregled", () => {
  const mini = (data = previewHallToday(412)) => renderToStaticMarkup(<HallMini eventCode={EVENT} data={data} href="/admin/dogadjaji/test-sajam/analitika#mapa" />);

  test("it names the hall, links to the Vremeplov and says who leads, with the flat picture until the scene runs", () => {
    const html = mini();
    expect(html).toMatch(new RegExp(`<h2[^>]*>${w.miniTitle}</h2><p[^>]*>${w.miniQuestion.replace("?", "\\?")}</p>`));
    expect(html).toMatch(new RegExp(`<a href="/admin/dogadjaji/test-sajam/analitika#mapa" data-open-timelapse=""[^>]*>${w.miniOpen}`));
    expect(html).toContain(`<p class="sr-only">${w.miniLabel}</p>`);
    expect(html).toContain('data-hall-mini-flat=""');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("<button");
    // The leading stand of the TEST numbers (they are re-split to the day's 412 scans).
    const leader = Math.max(...locationScans(previewHallToday(412).models, "today").values());
    expect(html).toContain(`štand 9, ${leader} sken`);
  });

  test("while the read is on the way it keeps its place; a day without a scan says so", () => {
    const loading = renderToStaticMarkup(<HallMini eventCode={EVENT} data={undefined} href="/x#mapa" />);
    expect(loading).toContain('data-admin-primitive="loading"');
    expect(loading).toContain("h-[16rem]");
    expect(loading).not.toContain(w.miniEmpty);
    const empty = mini({ ...previewAnalytics, models: previewAnalytics.models.map((model) => ({ ...model, scans: { ...model.scans, today: 0 } })), heat: { today: [], hour: [] } });
    expect(empty).toContain(w.miniEmpty);
  });

  test("an event without a map has no excerpt", () => {
    expect(renderToStaticMarkup(<HallMini eventCode="test-bez-mape" data={previewAnalytics} href="/x#mapa" />)).toBe("");
  });
});

describe("V3: „2D | 3D“ is kept in this browser", () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values };
  };

  test("on a desktop the 3D hall opens first, below 768 px the 2D map; a choice wins over both", () => {
    expect(HALL_3D_FROM).toBe(768);
    expect(hallViewFor(null, 1440)).toBe("3d");
    expect(hallViewFor(null, 768)).toBe("3d");
    expect(hallViewFor(null, 767)).toBe("2d");
    expect(hallViewFor(null, 390)).toBe("2d");
    expect(hallViewFor("2d", 1440)).toBe("2d");
    expect(hallViewFor("3d", 390)).toBe("3d");
  });

  test("the choice is written and read back; anything else in the storage is no choice", () => {
    const storage = memory();
    expect(readHallView(storage)).toBeNull();
    expect(writeHallView(storage, "2d")).toBe(true);
    expect(storage.values.get(HALL_VIEW_KEY)).toBe("2d");
    expect(readHallView(storage)).toBe("2d");
    expect(writeHallView(storage, "3d")).toBe(true);
    expect(readHallView(storage)).toBe("3d");
    expect(readHallView({ getItem: () => "nesto-drugo" })).toBeNull();
  });

  test("a storage that throws or is missing means the default, never an error", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readHallView(broken)).toBeNull();
    expect(writeHallView(broken, "2d")).toBe(false);
    expect(readHallView(null)).toBeNull();
    expect(writeHallView(undefined, "2d")).toBe(false);
  });
});

describe("V3: the TEST fixtures drive the same functions as the scene", () => {
  test("a simulated poll is an impulse of the leading stand, and only of it", () => {
    const scans = (step: number) => locationScans(previewAnalyticsStep(step).data.models, "today");
    expect(scanImpulses(null, scans(1))).toEqual([]);
    expect(scanImpulses(scans(1), scans(2))).toEqual([{ locationId: "hala-9", count: 14 }]);
    expect(scanImpulses(scans(2), scans(2))).toEqual([]);
  });

  test("the calm state: no light after the hall has closed, the leading stand the brightest from the first poll on", () => {
    const rates = (step: number) => ambientRates(new Map(previewAnalyticsStep(step).data.heat.hour.map((row) => [row.locationId, row.count])));
    expect(rates(0).size).toBe(0);
    expect(rates(2).get("hala-9")).toBe(0.8);
    expect(rates(2).get("hala-1a")!).toBeLessThan(rates(2).get("hala-6")!);
  });

  test("a day of the fixtures plays from an empty hall to the day's totals, and the rank changes on the way", () => {
    const series = hallSeries(previewStandHours(TODAY)!);
    expect(series.stands.map((stand) => stand.label)).toEqual(["9", "6", "1B", "1A"]);
    expect([...heightsAt(series, 0).values()].every((height) => height === 0)).toBe(true);
    expect(heightsAt(series, series.end).get("hala-9")).toBe(1);
    expect(rankAt(series, series.end).map((row) => row.label)).toEqual(["9", "6", "1B", "1A"]);
    // Early in the day another stand leads: the rank re-orders as the day goes.
    const orders = new Set(Array.from({ length: Math.ceil(series.end) + 1 }, (_, hour) => rankAt(series, hour).map((row) => row.label).join(">")));
    expect(orders.size).toBeGreaterThan(2);
  });
});
