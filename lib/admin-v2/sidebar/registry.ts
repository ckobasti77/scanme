// ADMIN v2 — the sidebar registry: route → what the contextual sidebar shows
// (ZADATAK §3). A page gets its sidebar by having a configuration here; a
// route without one shows the default (quick jumps). The search parameters
// are an argument because one route may have more than one state (X2:
// Proizvodi with and without a chosen venue).

import { adminRoute } from "@/lib/admin-v2/frame/routes";
import { eventsSidebarConfig } from "./configs/events";
import type { SidebarConfig } from "./types";

export const DEFAULT_SIDEBAR: SidebarConfig = { id: "podrazumevano", blocks: ["jumps"] };

type Resolver = (key: string, search: URLSearchParams) => SidebarConfig | null;

/** Per-route configurations, first match wins. X2 adds the lists here. */
const RESOLVERS: readonly Resolver[] = [];

export function resolveAdminSidebar(pathname: string, search: URLSearchParams | string = ""): SidebarConfig {
  const route = adminRoute(pathname);
  if (route.events) return eventsSidebarConfig(route.events.base, route.events.segments);
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  for (const resolve of RESOLVERS) {
    const config = resolve(route.key, params);
    if (config) return config;
  }
  return DEFAULT_SIDEBAR;
}
