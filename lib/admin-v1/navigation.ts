import type { AdminV1Dict } from "@/lib/i18n/types";

type AdminNavLabelKey = keyof Pick<
  AdminV1Dict,
  | "navDashboard"
  | "navClients"
  | "navInbox"
  | "navMail"
  | "navTasks"
  | "navOperations"
  | "navServices"
  | "navEvents"
  | "navFinance"
  | "navTeam"
  | "navProducts"
  | "navQrCodes"
  | "navOrders"
  | "navLinks"
  | "navReview"
  | "navMenu"
>;

export type AdminNavId =
  | "dashboard"
  | "clients"
  | "inbox"
  | "mail"
  | "tasks"
  | "operations"
  | "services"
  | "events"
  | "finance"
  | "team";

export type AdminNavChild = {
  id: string;
  labelKey: AdminNavLabelKey;
  href: string;
  matchPaths: readonly string[];
};

export type AdminNavItem = {
  id: AdminNavId;
  labelKey: AdminNavLabelKey;
  href: string;
  exact?: boolean;
  matchPaths: readonly string[];
  children?: readonly AdminNavChild[];
};

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    id: "dashboard",
    labelKey: "navDashboard",
    href: "/admin",
    exact: true,
    matchPaths: ["/admin"],
  },
  {
    id: "clients",
    labelKey: "navClients",
    href: "/admin/klijenti",
    matchPaths: ["/admin/klijenti", "/admin/customers"],
  },
  {
    id: "inbox",
    labelKey: "navInbox",
    href: "/admin/inbox",
    matchPaths: ["/admin/inbox"],
  },
  // Admin UX Z1 (ADMIN-UX-ZAHTEVI §10): each admin's own Zoho mailbox,
  // separate from the CRM Inbox above.
  {
    id: "mail",
    labelKey: "navMail",
    href: "/admin/posta",
    matchPaths: ["/admin/posta"],
  },
  {
    id: "tasks",
    labelKey: "navTasks",
    href: "/admin/zadaci",
    matchPaths: ["/admin/zadaci"],
  },
  {
    id: "operations",
    labelKey: "navOperations",
    href: "/admin/operativa/proizvodi",
    matchPaths: ["/admin/operativa"],
    children: [
      {
        id: "products",
        labelKey: "navProducts",
        href: "/admin/operativa/proizvodi",
        matchPaths: ["/admin/operativa/proizvodi"],
      },
      {
        id: "qr",
        labelKey: "navQrCodes",
        href: "/admin/operativa/qr",
        matchPaths: ["/admin/operativa/qr"],
      },
      {
        id: "orders",
        labelKey: "navOrders",
        href: "/admin/operativa/porudzbine",
        matchPaths: ["/admin/operativa/porudzbine"],
      },
    ],
  },
  {
    id: "services",
    labelKey: "navServices",
    href: "/admin/usluge/links",
    matchPaths: ["/admin/usluge"],
    children: [
      {
        id: "links",
        labelKey: "navLinks",
        href: "/admin/usluge/links",
        matchPaths: ["/admin/usluge/links"],
      },
      {
        id: "review",
        labelKey: "navReview",
        href: "/admin/usluge/review",
        matchPaths: ["/admin/usluge/review"],
      },
      {
        id: "menu",
        labelKey: "navMenu",
        href: "/admin/usluge/meni",
        matchPaths: ["/admin/usluge/meni"],
      },
    ],
  },
  // Sajam 2026 B1A (MASTER §15): a separate main tab, not under Services or
  // Operations. Only the ScanMe team reaches it (AdminGuard + requireAdmin).
  {
    id: "events",
    labelKey: "navEvents",
    href: "/admin/dogadjaji",
    matchPaths: ["/admin/dogadjaji"],
  },
  {
    id: "finance",
    labelKey: "navFinance",
    href: "/admin/finansije",
    matchPaths: ["/admin/finansije"],
  },
  {
    id: "team",
    labelKey: "navTeam",
    href: "/admin/tim",
    matchPaths: ["/admin/tim"],
  },
] as const;

export function normalizeAdminPath(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function matchesPath(pathname: string, candidate: string, exact = false) {
  const current = normalizeAdminPath(pathname);
  const target = normalizeAdminPath(candidate);
  return current === target || (!exact && current.startsWith(`${target}/`));
}

export function isAdminNavItemActive(pathname: string, item: AdminNavItem) {
  return item.matchPaths.some((path) => matchesPath(pathname, path, item.exact));
}

export function isAdminNavChildActive(
  pathname: string,
  child: AdminNavChild,
) {
  return child.matchPaths.some((path) => matchesPath(pathname, path));
}

export function getActiveAdminNavId(pathname: string): AdminNavId | null {
  return (
    ADMIN_NAV_ITEMS.find((item) => isAdminNavItemActive(pathname, item))?.id ??
    null
  );
}
