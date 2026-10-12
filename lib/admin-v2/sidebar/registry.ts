// ADMIN v2 — the sidebar registry: route → what the contextual sidebar shows
// (ZADATAK §3). A page gets its sidebar by having a configuration here; a
// route without one shows the default (quick jumps). The search parameters
// are an argument because one route may have more than one state (Proizvodi
// with and without a chosen venue, Pretraga and Finansije by their view).

import { adminRoute, type AdminRoute } from "@/lib/admin-v2/frame/routes";
import { clientsSidebar } from "./configs/clients";
import { eventsSidebarConfig } from "./configs/events";
import { financeSidebar } from "./configs/finance";
import { inboxSidebar } from "./configs/inbox";
import { mailSidebar } from "./configs/mail";
import { operationsSidebar } from "./configs/operations";
import { clientProfileSidebar, dashboardSidebar, settingsSidebar, teamSidebar } from "./configs/pages";
import { searchSidebar } from "./configs/search";
import { servicesSidebar } from "./configs/services";
import { tasksSidebar } from "./configs/tasks";
import type { SidebarConfig } from "./types";

export const DEFAULT_SIDEBAR: SidebarConfig = { id: "podrazumevano", blocks: ["jumps"] };

type Resolver = (route: AdminRoute, search: URLSearchParams) => SidebarConfig | null;

/** A page with one configuration on one path. */
const page = (path: string, config: SidebarConfig): Resolver => (route) => (route.key === path ? config : null);

/** Per-route configurations, first match wins. */
const RESOLVERS: readonly Resolver[] = [
  page("/admin", dashboardSidebar),
  page("/admin/klijenti", clientsSidebar),
  clientProfileSidebar,
  page("/admin/inbox", inboxSidebar),
  page("/admin/zadaci", tasksSidebar),
  operationsSidebar,
  servicesSidebar,
  (route, search) => (route.key === "/admin/finansije" ? financeSidebar(search) : null),
  page("/admin/tim", teamSidebar),
  (route, search) => (route.key === "/admin/pretraga" ? searchSidebar(search) : null),
  page("/admin/podesavanja", settingsSidebar),
  page("/admin/posta", mailSidebar),
];

/** The sidebar of a route the frame already resolved (a dev preview names the admin page it shows). */
export function resolveSidebar(route: AdminRoute, search: URLSearchParams): SidebarConfig {
  if (route.events) return eventsSidebarConfig(route.events.base, route.events.segments);
  for (const resolve of RESOLVERS) {
    const config = resolve(route, search);
    if (config) return config;
  }
  return DEFAULT_SIDEBAR;
}

export function resolveAdminSidebar(pathname: string, search: URLSearchParams | string = ""): SidebarConfig {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  return resolveSidebar(adminRoute(pathname, params), params);
}
