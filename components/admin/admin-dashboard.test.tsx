import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { inboxMissions, reactionMissions, taskMissions } from "@/lib/admin-v2/lists/dashboard-missions";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { DASHBOARD_SCOPES, DASHBOARD_URL_FIELDS, dashboardSidebar } from "@/lib/admin-v2/sidebar/configs/pages";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import type { SidebarLive } from "@/lib/admin-v2/sidebar/types";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 / Dashboard — one header whose H1 is always „Dashboard“ (never a
// count or an error message), the scope in the sidebar and in the URL, and
// „Misije danas“ from the data the widgets already have. SSR markup, like the
// other admin views.

const mocks = vi.hoisted(() => ({ search: "" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

// Imported after the mocks.
import { AdminDashboardFoundation } from "./admin-dashboard-foundation";
import { dashboardFixture } from "./admin-dashboard-fixtures";

beforeEach(() => {
  mocks.search = "";
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
    expect(html("ready")).toContain(count(8));
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
    expect(all).toContain("Proveriti novu adresu za dostavu");
    const mine = html("ready", "?obim=mine");
    expect(mine).toContain("Obnova pretplate nije evidentirana");
    expect(mine).toContain("Proveriti novu adresu za dostavu");
    expect(mine).not.toContain("Potrebna je potvrda dizajna pre štampe");
    expect(mine).toContain(count(2));
    // An invalid value is ignored.
    expect(html("ready", "?obim=xyz")).toContain("Potrebna je potvrda dizajna pre štampe");
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
    // Urgent: 2 items and 1 overdue task. Soon: 2 items for today and 2 tasks for today. Info: 1 unread conversation.
    expect(badgeNumbers(markup, "hitno")).toEqual(["2", "1"]);
    expect(badgeNumbers(markup, "uskoro")).toEqual(["2", "2"]);
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
