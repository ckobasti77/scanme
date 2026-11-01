// ADMIN v2 — the sub-pages of an area as sidebar navigation (ZADATAK §3):
// Operativa (Proizvodi, QR kodovi, Porudžbine) and Usluge (Links, Review,
// Meni), from the same list the navbar menus use.

import { ADMIN_NAV_ITEMS, isAdminNavChildActive, type AdminNavId } from "@/lib/admin-v1/navigation";
import type { AdminSubnavGroup } from "@/lib/admin-v1/subnav";
import { routeHref, type AdminRoute } from "@/lib/admin-v2/frame/routes";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export function areaNav(area: AdminNavId, route: AdminRoute): AdminSubnavGroup[] {
  const item = ADMIN_NAV_ITEMS.find((row) => row.id === area);
  if (!item?.children) return [];
  return [
    {
      id: area,
      label: adminV1Sr[item.labelKey],
      items: item.children.map((child) => ({
        id: child.id,
        href: routeHref(child.href, route),
        label: adminV1Sr[child.labelKey],
        active: isAdminNavChildActive(route.key, child),
      })),
    },
  ];
}
