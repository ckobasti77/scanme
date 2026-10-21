// ADMIN v2 — sidebar of `Pretraga`: the view (Rezultati, Aktivnost), the
// kind of record and the scope (one client or one venue). The search field
// itself stays in the screen: it is the content of the page, and `q` is the
// page's own key. `view` and `group` are the parameters the page already
// read; the scope is a custom group whose body (the picker with suggestions)
// comes from the page.

import { sidebarUrlFields, type UrlField } from "@/lib/admin-v2/query/url-state";
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import type { SidebarConfig, SidebarGroup, SidebarViews } from "../types";

export const SEARCH_GROUPS = ["clients", "venues", "contacts", "products", "channels", "orders"] as const;
export const ACTIVITY_CATEGORIES = ["client", "communication", "task", "order", "finance", "subscription", "problem", "product", "service", "support"] as const;

const GROUP_LABELS: Record<(typeof SEARCH_GROUPS)[number], string> = {
  clients: dict.groupClients,
  venues: dict.groupVenues,
  contacts: dict.groupContacts,
  products: dict.groupProducts,
  channels: dict.groupChannels,
  orders: dict.groupOrders,
};

const CATEGORY_LABELS: Record<(typeof ACTIVITY_CATEGORIES)[number], string> = {
  client: dict.activityClient,
  communication: dict.activityCommunication,
  task: dict.activityTask,
  order: dict.activityOrder,
  finance: dict.activityFinance,
  subscription: dict.activitySubscription,
  problem: dict.activityProblem,
  product: dict.activityProduct,
  service: dict.activityService,
  support: dict.activitySupport,
};

const views: SidebarViews = {
  key: "view",
  label: ui.filters.view,
  defaultValue: "search",
  items: [
    { value: "search", label: dict.searchView },
    { value: "activity", label: dict.activityView },
  ],
};

/** One client (`klijent` = account id) or one venue (`lokal` = business id); `opseg` carries its name for the chip. */
const scope: SidebarGroup = { id: "opseg", label: dict.scopeLabel, kind: "custom", keys: ["klijent", "lokal", "opseg"], textKeys: ["opseg"] };
/** A search always runs in one kind of record. */
const group: SidebarGroup = { id: "group", label: dict.groupLabel, defaultValue: "clients", options: SEARCH_GROUPS.map((value) => ({ value, label: GROUP_LABELS[value] })) };
const category: SidebarGroup = { id: "kategorija", label: dict.activityCategoryLabel, options: ACTIVITY_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })) };
/** The actors come from the page (`adminActivity.listActors`). */
const actor: SidebarGroup = { id: "akter", label: dict.activityActorLabel };

export const searchResultsSidebar: SidebarConfig = { id: "pretraga/rezultati", views, groups: [group, scope] };
export const searchActivitySidebar: SidebarConfig = { id: "pretraga/aktivnost", views, groups: [category, actor, scope] };

export function searchSidebar(search: { get(name: string): string | null }): SidebarConfig {
  return search.get("view") === "activity" ? searchActivitySidebar : searchResultsSidebar;
}

/** Every key of Pretraga (both views) and the page's own `q`. */
export const SEARCH_URL_FIELDS: UrlField[] = [{ key: "q", maxLength: 120 }, ...sidebarUrlFields({ id: "pretraga", views, groups: [group, category, actor, scope] })];
