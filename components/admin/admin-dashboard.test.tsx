import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { inboxMissions, reactionMissions, taskMissions } from "@/lib/admin-v2/lists/dashboard-missions";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { DASHBOARD_SCOPES, DASHBOARD_URL_FIELDS, dashboardSidebar } from "@/lib/admin-v2/sidebar/configs/pages";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import type { SidebarLive } from "@/lib/admin-v2/sidebar/types";
import { adminGameSr as game } from "@/lib/i18n/sr/admin-game";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 / Dashboard — one header whose H1 is always „Dashboard“ (never a
// count or an error message), the scope in the sidebar and in the URL, and
// „Misije danas“ from the data the widgets already have. SSR markup, like the
// other admin views.

const mocks = vi.hoisted(() => ({ search: "", queries: [] as unknown[], hero: "constellation" as "constellation" | "list" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    mocks.queries.push(args);
    return undefined;
  },
  useMutation: () => async () => undefined,
}));

// The server render reads the hero choice from `getServer`: the mock lets one test see the list mode.
vi.mock("@/components/admin/dashboard/hero-choice", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/admin/dashboard/hero-choice")>();
  return { ...original, dashboardHeroStore: { ...original.dashboardHeroStore, get: () => mocks.hero, getServer: () => mocks.hero } };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

// Imported after the mocks.
import { AdminDashboardFoundation, aimLineVisible } from "./admin-dashboard-foundation";
import { dashboardFixture } from "./admin-dashboard-fixtures";

beforeEach(() => {
  mocks.search = "";
  mocks.queries = [];
  mocks.hero = "constellation";
});

type FixtureState = Parameters<typeof dashboardFixture>[0];
const STATES: FixtureState[] = ["ready", "unavailable", "empty", "loading", "error"];

function html(state: FixtureState = "ready", search = "") {
  mocks.search = search;
  const fixture = dashboardFixture(state);
  return renderToStaticMarkup(<AdminDashboardFoundation initialNow={fixture.now} fixture={fixture} />);
}

const h1 = (markup: string) => markup.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
const count = (total: number) => `>${dict.dashboardCountMany.replace("{count}", String(total))}<`;
const badgeNumbers = (markup: string, tone: string) =>
  [...markup.matchAll(new RegExp(`data-urgency="${tone}"[^>]*><span aria-hidden="true">(\\d+)<`, "g"))].map((match) => match[1]);

describe("Dashboard page", () => {
  test("in every state there is one h1 and it says „Dashboard“, never a count or an error", () => {
    for (const state of STATES) {
      for (const search of ["", "?obim=mine"]) {
        const markup = html(state, search);
        expect(markup.match(/<h1/g), `${state} ${search}`).toHaveLength(1);
        expect(h1(markup), `${state} ${search}`).toBe(dict.dashboardTitle);
      }
    }
  });

  test("the live page draws the header while it loads (no clock yet, no queries)", () => {
    mocks.search = "";
    const markup = renderToStaticMarkup(<AdminDashboardFoundation />);
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(h1(markup)).toBe(dict.dashboardTitle);
  });

  test("the count is plain text next to the signals; an unavailable total says so without becoming the title", () => {
    // V3 V2: the fixture has 12 named items and 74 open ones (4 urgent, 6 for today, 4 waiting, 60 calm).
    expect(html("ready")).toContain(count(74));
    expect(html("empty")).toContain(`>${dict.dashboardCountZero}<`);
    const unavailable = html("unavailable");
    expect(unavailable).toContain(`>${dict.dashboardCountUnavailable}<`);
    expect(unavailable).toContain(dict.dashboardProjectionUnavailableTitle);
    expect(h1(unavailable)).toBe(dict.dashboardTitle);
  });

  test("the scope is not a control on the screen: no segment, no pressed buttons", () => {
    for (const search of ["", "?obim=mine"]) {
      const markup = html("ready", search);
      expect(markup).not.toContain("aria-pressed");
      expect(markup).not.toContain(`aria-label="${dict.dashboardScopeLabel}"`);
      expect(markup).not.toContain('role="tablist"');
      expect(markup).not.toContain("<select");
      expect(markup).not.toContain('type="search"');
    }
  });

  test("?obim=mine shows the items of reactions.mine, the default shows all of them", () => {
    const all = html("ready");
    expect(all).toContain("Obnova pretplate nije evidentirana");
    expect(all).toContain("Potrebna je potvrda dizajna pre štampe");
    expect(all).toContain("Porudžbina čeka potvrdu uplate");
    // V3 V2: the calm item is not among the 12 named ones of „Sve“; it is one of the 60 calm dots there.
    expect(all).not.toContain("Proveriti novu adresu za dostavu");
    const mine = html("ready", "?obim=mine");
    expect(mine).toContain("Obnova pretplate nije evidentirana");
    expect(mine).toContain("Proveriti novu adresu za dostavu");
    expect(mine).not.toContain("Potrebna je potvrda dizajna pre štampe");
    expect(mine).toContain(count(2));
    // An invalid value is ignored.
    expect(html("ready", "?obim=xyz")).toContain("Potrebna je potvrda dizajna pre štampe");
  });

  test("X6 — „Reši“ is the primary button, as a link and as a button; no button or link is inked by a class substring", () => {
    const markup = html("ready");
    expect(markup).toMatch(new RegExp(`<a[^>]*admin-button-primary[^>]*>${dict.dashboardResolve}`));
    expect(markup).not.toMatch(/<(?:button|a)\b[^>]*bg-\[var\(--admin-ink\)\]/);
  });

  test("the preview keeps its badge and says what it is", () => {
    const markup = html();
    expect(markup).toContain(dict.dashboardFixtureBadge);
    expect(markup).toContain(dict.dashboardFixtureDescription);
  });

  test("the layout follows the width of the screen (container), not of the window", () => {
    const markup = html();
    expect(markup).toContain("@container");
    expect(markup).toContain("@4xl:grid-cols-2");
    expect(markup).toContain("@6xl:grid-cols-[");
    expect(markup).not.toMatch(/[\s"](sm|md|lg|xl|2xl):(hidden|block|grid-cols-\d)/);
    expect(markup).not.toMatch(/[\s"]xl:/);
    expect(markup).not.toContain("max-w-[112rem]");
    expect(markup).not.toContain("mx-auto grid");
    expect(markup).not.toContain("clamp(");
  });

  test("the page carries the attributes of the reveal engine: signals as kpi, lists as rows, rings drawn through a mask", () => {
    const markup = html("ready");
    expect(markup).toContain('data-admin-reveal="kpi"');
    expect(markup).toContain('data-admin-tilt=""');
    expect(markup).toContain('data-admin-reveal="rows"');
    expect(markup).toContain('data-admin-count=""');
    expect(markup.match(/data-admin-draw="ring"/g)).toHaveLength(2);
    expect(markup.match(/<mask /g)).toHaveLength(2);
    expect(markup.match(/<g mask="url\(#[^)]+\)"/g)).toHaveLength(2);
  });
});

describe("Dashboard hero: the Constellation (V3 V2)", () => {
  test("the hero is the first block, the list „Za reakciju“ stays below it", () => {
    const markup = html("ready");
    const hero = markup.indexOf('data-dashboard-hero=""');
    const list = markup.indexOf(`>${dict.dashboardReactionTitle}<`);
    expect(hero).toBeGreaterThan(0);
    expect(list).toBeGreaterThan(hero);
    expect(markup).toContain('data-admin-reveal="media"');
    expect(markup.match(/data-reaction-row="/g)).toHaveLength(12);
  });

  test("without JavaScript the same items are a still 2D picture: one star for every named item, one for the unnamed rest", () => {
    const markup = html("ready");
    expect(markup).toContain('data-stage-state="flat"');
    expect(markup).toContain('data-constellation-2d=""');
    const fixture = dashboardFixture("ready");
    for (const item of fixture.reactions.all.items) expect(markup, item.action.causeId).toContain(`data-star="${item.action.causeId}"`);
    // 4 urgent on the inner orbit, 4 + the „+2“ star for today, 4 waiting; the 60 calm ones are dots.
    expect(markup.match(/data-star="[^"]+" data-orbit="1"/g)).toHaveLength(4);
    expect(markup.match(/data-star="[^"]+" data-orbit="2"/g)).toHaveLength(5);
    expect(markup.match(/data-star="[^"]+" data-orbit="3"/g)).toHaveLength(4);
    expect(markup).toContain('data-star="more:2"');
    expect(markup).toContain(">+2<");
    expect(markup.match(/data-calm-dot=""/g)).toHaveLength(60);
  });

  test("the text equivalent says the numbers of the picture; the picture itself is hidden and has no tab stop", () => {
    const markup = html("ready");
    const summary = markup.match(/<p class="sr-only" data-constellation-summary="">(.*?)<\/p>/)?.[1] ?? "";
    expect(summary).toBe(dict.dashboardConstellationSummary.replace("{urgent}", "4").replace("{today}", "6").replace("{waiting}", "4").replace("{calm}", "60"));
    const picture = markup.match(/<svg[^>]*data-constellation-2d=""[\s\S]*?<\/svg>/)?.[0] ?? "";
    expect(picture).toContain('aria-hidden="true"');
    expect(picture).not.toContain("tabindex");
    expect(html("unavailable")).toContain(dict.dashboardConstellationSummaryUnavailable);
  });

  test("the legend keeps the count, the four signals and the backlog as text", () => {
    const markup = html("ready");
    expect(markup).toContain(`>${dict.dashboardConstellationHint}<`);
    expect(markup.match(/data-admin-reveal="kpi" data-admin-tilt=""/g)?.length).toBeGreaterThanOrEqual(4);
    // 3 × 4 urgent + 2 × 1 waiting for a reply + 1 × 6 for today = 20, and the largest seen is the same.
    // V4: the backlog is the boss of the day. Outside a frame (no game) the numbers of the page stand in.
    expect(markup).toContain('data-game-boss="alive"');
    expect(markup).toContain(`>${game.boss.title}<`);
    expect(markup).toMatch(/role="progressbar" aria-label="Šef dana: zaostatak" aria-valuemin="0" aria-valuemax="20" aria-valuenow="20"/);
    expect(markup).toContain(`>${game.boss.value.replace("{hp}", "20").replace("{max}", "20")}<`);
  });

  test("no counts: no ring of the backlog and no invented zero; an empty Dashboard still has its core and orbits", () => {
    const unavailable = html("unavailable");
    expect(unavailable).toContain('data-dashboard-hero=""');
    expect(unavailable).not.toContain('role="progressbar"');
    expect(unavailable).not.toContain("data-backlog-ring");
    const empty = html("empty");
    expect(empty).toContain('data-constellation-2d=""');
    expect(empty).not.toContain("data-star=");
    expect(empty.match(/data-orbit-ring="/g)).toHaveLength(4);
    // Nothing waited: there is no boss, and no victory is claimed.
    expect(empty).toContain('data-game-boss="none"');
    expect(empty).toContain(`>${game.boss.none}<`);
    expect(unavailable).toContain(`>${game.boss.unavailable}<`);
  });

  test("the hero can be put away with a plain button (no pressed state, no tabs)", () => {
    const markup = html("ready");
    expect(markup).toMatch(new RegExp(`<button type="button"[^>]*>${dict.dashboardConstellationHide}</button>`));
  });

  test("the live list asks for 12 items, the most the query gives: the list and the picture show the same ones", () => {
    mocks.queries = [];
    renderToStaticMarkup(<AdminDashboardFoundation initialNow={Date.UTC(2026, 9, 13, 8)} />);
    expect(mocks.queries).toContainEqual({ now: Date.UTC(2026, 9, 13, 8), scope: "all", limit: 12 });
  });
});

describe("Dashboard list mode: the game does not depend on the view (V5, S4)", () => {
  test("the boss of the day and the combo are in the row of the count, the same as in the hero", () => {
    mocks.hero = "list";
    const list = html("ready");
    expect(list).not.toContain('data-dashboard-hero=""');
    expect(list).toContain('data-dashboard-boss=""');
    expect(list).toContain('data-game-boss="alive"');
    expect(list).toMatch(/role="progressbar" aria-label="Šef dana: zaostatak" aria-valuemin="0" aria-valuemax="20" aria-valuenow="20"/);
    // The row of the count holds the boss, and the button that brings the hero back is still there.
    expect(list.indexOf(`>${dict.dashboardConstellationShow}<`)).toBeGreaterThan(list.indexOf('data-game-boss="alive"'));
    expect(list.indexOf('data-game-boss="alive"')).toBeGreaterThan(list.indexOf(count(74)));
    mocks.hero = "constellation";
    const hero = html("ready");
    expect(hero).toContain('data-dashboard-hero=""');
    expect(hero).toContain('data-game-boss="alive"');
  });

  test("no counts: the list mode says the boss is not known, like the hero does", () => {
    mocks.hero = "list";
    expect(html("unavailable")).toContain('data-game-boss="unavailable"');
  });
});

describe("the aim line is drawn only when it may be (V5, S8)", () => {
  const ok = { aimed: "cause-1", dialogOpen: false, ceremony: null, heroVisible: true } as const;

  test("a row is aimed at, no dialog, no ceremony, the hero on the screen", () => {
    expect(aimLineVisible(ok)).toBe(true);
  });

  test("nothing aimed at, nothing to draw", () => {
    expect(aimLineVisible({ ...ok, aimed: null })).toBe(false);
  });

  test("while the dialog of „Reši“ or „Odloži“ is open the line is away", () => {
    expect(aimLineVisible({ ...ok, dialogOpen: true })).toBe(false);
  });

  test("a ceremony of either size takes the line off the screen", () => {
    expect(aimLineVisible({ ...ok, ceremony: "big" })).toBe(false);
    expect(aimLineVisible({ ...ok, ceremony: "card" })).toBe(false);
  });

  test("a hero that is not on the screen would point to a star nobody sees", () => {
    expect(aimLineVisible({ ...ok, heroVisible: false })).toBe(false);
  });

  test("the markup of the page has the layer but no path before anything is aimed at", () => {
    const markup = html("ready");
    expect(markup).toContain('data-dashboard-aim=""');
    expect(markup).not.toMatch(/data-dashboard-aim=""[^>]*><path/);
  });
});

describe("Dashboard sidebar", () => {
  const fixture = dashboardFixture("ready");
  const live: SidebarLive = {
    missions: [
      ...reactionMissions(fixture.reactions.all.counts),
      ...taskMissions(fixture.tasks),
      ...inboxMissions(fixture.inbox),
    ],
  };
  const sidebarHtml = (data: SidebarLive = live, search = "") => {
    const config = resolveAdminSidebar("/admin");
    return renderToStaticMarkup(
      <AdminSidebarView config={config} jumps={config.jumps} live={data} state={readUrlState(DASHBOARD_URL_FIELDS, search)} onPatch={() => undefined} />,
    );
  };

  test("the registry gives the configuration of the page: two scopes, then the missions and the jumps", () => {
    const config = resolveAdminSidebar("/admin");
    expect(config).toBe(dashboardSidebar);
    expect(DASHBOARD_SCOPES).toEqual(["all", "mine"]);
    expect(config.views?.key).toBe("obim");
    expect(config.views?.items).toHaveLength(2);
    expect(config.blocks).toEqual(["missions", "jumps"]);
  });

  test("the two views, „Misije danas“ with its rows and counts, then „Brzi skokovi“", () => {
    const markup = sidebarHtml();
    expect(markup).toContain(`>${dict.dashboardScopeLabel}<`);
    expect(markup).toContain(`>${dict.dashboardScopeAll}</span>`);
    expect(markup).toContain(`>${dict.dashboardScopeMine}</span>`);
    expect(markup).toContain(`>${adminUiSr.frame.missionsTitle}<`);
    for (const label of [dict.dashboardMissionUrgent, dict.dashboardMissionToday, dict.dashboardMissionTasksOverdue, dict.dashboardMissionTasksToday, dict.dashboardMissionInboxUnread]) {
      expect(markup).toContain(`>${label}</span>`);
    }
    // Urgent: 4 items and 1 overdue task. Soon: 6 items for today and 2 tasks for today. Info: 1 unread conversation.
    expect(badgeNumbers(markup, "hitno")).toEqual(["4", "1"]);
    expect(badgeNumbers(markup, "uskoro")).toEqual(["6", "2"]);
    expect(badgeNumbers(markup, "info")).toEqual(["1"]);
    expect(markup).toContain('href="/admin/zadaci?pogled=overdue"');
    expect(markup).toContain('href="/admin/inbox"');
    const order = [dict.dashboardScopeLabel, adminUiSr.frame.missionsTitle, adminUiSr.frame.jumpsTitle].map((text) => markup.indexOf(`>${text}<`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const jump of dashboardSidebar.jumps ?? []) expect(markup).toContain(`>${jump.label}</span>`);
  });

  test("the most urgent missions come first", () => {
    const markup = sidebarHtml();
    const at = (label: string) => markup.indexOf(`>${label}</span>`);
    expect(at(dict.dashboardMissionUrgent)).toBeLessThan(at(dict.dashboardMissionToday));
    expect(at(dict.dashboardMissionToday)).toBeLessThan(at(dict.dashboardMissionInboxUnread));
  });

  test("missions at zero are not listed; with all of them at zero it says everything is clear", () => {
    const empty = dashboardFixture("empty");
    const zero = sidebarHtml({ missions: [...reactionMissions(empty.reactions.all.counts), ...taskMissions(empty.tasks), ...inboxMissions(empty.inbox)] });
    expect(zero).toContain(adminUiSr.frame.missionsClear);
    expect(zero).not.toContain(`>${dict.dashboardMissionUrgent}</span>`);
  });

  test("until the page sends anything there is no block (no invented zero)", () => {
    const markup = sidebarHtml({});
    expect(markup).not.toContain(`>${adminUiSr.frame.missionsTitle}<`);
    expect(markup).toContain(`>${adminUiSr.frame.jumpsTitle}<`);
  });
});
