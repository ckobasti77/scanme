// ADMIN v2 — sidebars of the pages that have views or sections but no list
// filters: Dashboard (scope, „Misije danas“, quick jumps), the client profile
// (sections), Tim (the members and the view) and Podešavanja (sections).

import type { AdminRoute } from "@/lib/admin-v2/frame/routes";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { sidebarUrlFields, type UrlField } from "@/lib/admin-v2/query/url-state";
import { adminSettingsSr as settings } from "@/lib/i18n/sr/admin-settings";
import { adminTeamSr as team } from "@/lib/i18n/sr/admin-team";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";
import type { SidebarConfig } from "../types";

// ---- Dashboard

export const DASHBOARD_SCOPES = ["all", "mine"] as const;

export const dashboardSidebar: SidebarConfig = {
  id: "dashboard",
  views: {
    key: "obim",
    label: dict.dashboardScopeLabel,
    defaultValue: "all",
    items: [
      { value: "all", label: dict.dashboardScopeAll },
      { value: "mine", label: dict.dashboardScopeMine },
    ],
  },
  blocks: ["missions", "jumps"],
  // „Sve“ and „Moje“ count different items: each keeps its own progress of the day.
  missionsBy: "obim",
  // Each jump opens a list already filtered to what needs work.
  jumps: [
    { href: "/admin/zadaci?pogled=overdue", label: dict.dashboardJumpTasksOverdue },
    { href: "/admin/zadaci?pogled=today", label: dict.dashboardJumpTasksToday },
    { href: "/admin/inbox?status=needs_reply", label: dict.dashboardJumpInboxReply },
    { href: "/admin/operativa/porudzbine?problem=da", label: dict.dashboardJumpOrdersProblem },
    { href: "/admin/operativa/qr?status=problem", label: dict.dashboardJumpQrProblem },
    { href: "/admin/operativa/proizvodi?lokali=problem", label: dict.dashboardJumpVenuesProblem },
  ],
};

export const DASHBOARD_URL_FIELDS = sidebarUrlFields(dashboardSidebar);

// ---- Profil klijenta

export const CLIENT_PROFILE_SECTIONS = ["overview", "venues", "finance", "products", "communication", "activity"] as const;

const SECTION_LABELS: Record<(typeof CLIENT_PROFILE_SECTIONS)[number], string> = {
  overview: dict.clientProfileSectionOverview,
  venues: dict.clientProfileSectionVenues,
  finance: dict.clientProfileSectionFinance,
  products: dict.clientProfileSectionProducts,
  communication: dict.clientProfileSectionCommunication,
  activity: dict.clientProfileSectionActivity,
};

const clientProfileViews: Pick<SidebarConfig, "id" | "views"> = {
  id: "klijenti/profil",
  views: {
    key: "section",
    label: ui.filters.sections,
    defaultValue: "overview",
    items: CLIENT_PROFILE_SECTIONS.map((value) => ({ value, label: SECTION_LABELS[value] })),
  },
};

/** `section` is the sidebar's; the chosen contact and venue are the page's own keys. */
export const CLIENT_PROFILE_URL_FIELDS: UrlField[] = [...sidebarUrlFields(clientProfileViews), { key: "contact" }, { key: "venue" }];

export function clientProfileSidebar(route: AdminRoute): SidebarConfig | null {
  if (!/^\/admin\/klijenti\/[^/]+$/.test(route.key)) return null;
  return {
    ...clientProfileViews,
    nav: [{ id: "klijenti", items: [{ id: "svi", href: routeHref("/admin/klijenti", route), label: dict.clientProfileBack, active: false }] }],
    navLabel: ui.frame.areaNav,
  };
}

// ---- Tim

export const TEAM_TABS = ["overview", "tasks", "conversations"] as const;

export const teamSidebar: SidebarConfig = {
  id: "tim",
  // The members with their open tasks come from the page; the choice is the page's `clan` key.
  context: { id: "clan", label: team.selectMember, list: true },
  views: {
    key: "tab",
    label: ui.filters.view,
    defaultValue: "overview",
    items: [
      { value: "overview", label: team.tabOverview },
      { value: "tasks", label: team.tabTasks },
      { value: "conversations", label: team.tabConversations },
    ],
  },
};

export const TEAM_URL_FIELDS = sidebarUrlFields(teamSidebar);

// ---- Podešavanja

export const SETTINGS_TABS = ["general", "subscriptions", "payments", "communication", "pricing", "referral"] as const;

export const settingsSidebar: SidebarConfig = {
  id: "podesavanja",
  views: {
    key: "tab",
    label: ui.filters.sections,
    defaultValue: "general",
    items: SETTINGS_TABS.map((value) => ({ value, label: settings[value] })),
  },
};

export const SETTINGS_URL_FIELDS = sidebarUrlFields(settingsSidebar);
