// ADMIN v2 — sidebar of `Usluge` (Links, Review, Meni): the area navigation,
// the views by state, search and sort. One configuration for the three
// pages; the values are the arguments of `adminServiceOperations.list`.

import type { AdminRoute } from "@/lib/admin-v2/frame/routes";
import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { adminServicesSr as dict } from "@/lib/i18n/sr/admin-services";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import type { SidebarConfig } from "../types";
import { areaNav } from "./area-nav";

export const SERVICE_VIEWS = ["all", "active", "grace", "suspended", "problem"] as const;
export const SERVICE_SORTS = ["urgency", "name", "recent"] as const;

const VIEW_LABELS: Record<(typeof SERVICE_VIEWS)[number], string> = {
  all: dict.filterAll,
  active: dict.filterActive,
  grace: dict.filterGrace,
  suspended: dict.filterPaused,
  problem: dict.filterProblem,
};

const SORT_LABELS: Record<(typeof SERVICE_SORTS)[number], string> = { urgency: dict.sortUrgency, name: dict.sortName, recent: dict.sortRecent };

const SERVICE_PAGES: Readonly<Record<string, string>> = {
  "/admin/usluge/links": "usluge/links",
  "/admin/usluge/review": "usluge/review",
  "/admin/usluge/meni": "usluge/meni",
};

const servicesFilters: Omit<SidebarConfig, "id" | "nav" | "navLabel"> = {
  views: { key: "pogled", label: ui.filters.views, defaultValue: "all", items: SERVICE_VIEWS.map((value) => ({ value, label: VIEW_LABELS[value] })) },
  search: { key: "q", label: dict.searchLabel, placeholder: dict.searchPlaceholder },
  sort: { key: "sort", label: ui.filters.sort, defaultValue: "urgency", options: SERVICE_SORTS.map((value) => ({ value, label: SORT_LABELS[value] })) },
};

export const SERVICES_URL_FIELDS = sidebarUrlFields({ id: "usluge", ...servicesFilters });

export function servicesSidebar(route: AdminRoute): SidebarConfig | null {
  const id = SERVICE_PAGES[route.key];
  return id ? { id, ...servicesFilters, nav: areaNav("services", route), navLabel: ui.frame.areaNav } : null;
}
