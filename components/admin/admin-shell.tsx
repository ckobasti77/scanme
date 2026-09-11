"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
  Bell,
  Building2,
  CheckSquare2,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Menu,
  Package,
  PackageSearch,
  PanelsTopLeft,
  QrCode,
  Search,
  Settings,
  ShoppingBag,
  Star,
  Users,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import {
  ADMIN_NAV_ITEMS,
  isAdminNavChildActive,
  isAdminNavItemActive,
  type AdminNavId,
} from "@/lib/admin-v1/navigation";
import { fmt } from "@/lib/i18n/format";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { AdminTooltip } from "./admin-tooltip";

type NavIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const navIcons: Record<AdminNavId, NavIcon> = {
  dashboard: LayoutDashboard,
  clients: Building2,
  inbox: Mail,
  tasks: CheckSquare2,
  operations: PackageSearch,
  services: PanelsTopLeft,
  finance: CircleDollarSign,
  team: Users,
};

const childIcons: Record<string, NavIcon> = {
  products: Package,
  qr: QrCode,
  orders: ShoppingBag,
  links: Link2,
  review: Star,
  menu: UtensilsCrossed,
};

const utilityButtonClass =
  "admin-v1-round grid size-11 shrink-0 place-items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] text-[var(--admin-text)] shadow-[var(--admin-shadow-xs)] transition-[background-color,border-color,color] duration-150 hover:border-[var(--admin-ink)] hover:bg-[var(--admin-surface)]";

export function AdminShell({
  children,
  previewIdentity,
  activePathname,
}: {
  children: ReactNode;
  previewIdentity?: string;
  activePathname?: string;
}) {
  const currentPathname = usePathname();
  const pathname = activePathname ?? currentPathname;
  const me = useQuery(api.admin.me);
  const { signOut } = useAuthActions();
  const identity = previewIdentity ?? me?.email ?? adminV1Sr.profileFallback;

  return (
    <div className="admin-v1 min-h-[100dvh] overflow-x-clip bg-[var(--admin-canvas)] text-[var(--admin-text)]">
      <a href="#main-content" className="skip-link">
        {adminV1Sr.skipToContent}
      </a>
      <div className="admin-v1-frame mx-auto min-h-[100dvh] w-full max-w-[1540px] bg-[var(--admin-app)] xl:my-3 xl:min-h-[calc(100dvh-1.5rem)] xl:rounded-[2rem] xl:border xl:border-white/55 xl:shadow-[var(--admin-shadow-lg)]">
        <header
          data-reveal="off"
          className="sticky top-0 z-30 rounded-t-[inherit] bg-[var(--admin-app)]/95 px-3 py-3 backdrop-blur-md sm:px-5 xl:top-3 xl:px-7 xl:py-4"
        >
          <div className="flex min-h-12 items-center gap-3 xl:grid xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-5">
            <Link
              href="/admin"
              className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-1"
              aria-label="ScanMe Admin"
            >
              <BrandLogo width="7.35rem" />
              <span className="hidden text-xs font-semibold tracking-[0.08em] text-[var(--admin-text-muted)] sm:inline">
                ADMIN
              </span>
            </Link>

            <DesktopNavigation pathname={pathname} />

            <div
              aria-label={adminV1Sr.adminUtilitiesAria}
              className="ml-auto flex items-center gap-2 xl:ml-0"
            >
              <AdminTooltip label={adminV1Sr.globalSearchUnavailable}>
                <Link
                  href="/admin/pretraga"
                  className={utilityButtonClass}
                  aria-label={adminV1Sr.globalSearch}
                >
                  <Search className="size-[1.15rem]" aria-hidden="true" />
                </Link>
              </AdminTooltip>

              <Link
                href="/admin/podesavanja"
                className={cn(utilityButtonClass, "hidden sm:grid")}
                aria-label={adminV1Sr.settings}
              >
                <Settings className="size-[1.15rem]" aria-hidden="true" />
              </Link>

              <NotificationsMenu />

              <ThemeToggle
                className={cn(
                  utilityButtonClass,
                  "hidden border-[var(--admin-border)] bg-[var(--admin-surface-strong)] xl:inline-flex",
                )}
              />

              <ProfileMenu
                identity={identity}
                onSignOut={() => void signOut()}
              />

              <MobileNavigation
                pathname={pathname}
                identity={identity}
                onSignOut={() => void signOut()}
              />
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="min-w-0 px-4 pt-4 pb-8 sm:px-6 sm:pt-6 sm:pb-10 xl:px-8 xl:pt-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function DesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label={adminV1Sr.adminNavigationAria}
      className="mx-auto hidden min-w-0 items-center rounded-full border border-white/70 bg-[var(--admin-surface-strong)] p-1 shadow-[var(--admin-shadow-sm)] xl:flex"
    >
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isAdminNavItemActive(pathname, item);
        const label = adminV1Sr[item.labelKey];

        if (item.children) {
          return (
            <DropdownMenu key={item.id}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "admin-v1-round inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.82rem] font-semibold whitespace-nowrap transition-[background-color,color] duration-150",
                    active
                      ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]"
                      : "text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)]",
                  )}
                >
                  {label}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={9}
                className="admin-v1 z-40 min-w-52 rounded-2xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1.5 shadow-[var(--admin-shadow-md)]"
              >
                {item.children.map((child) => {
                  const ChildIcon = childIcons[child.id];
                  const childActive = isAdminNavChildActive(pathname, child);
                  return (
                    <DropdownMenuItem
                      key={child.id}
                      asChild
                      className="rounded-xl p-0 focus:bg-[var(--admin-surface-muted)] focus:text-[var(--admin-text)]"
                    >
                      <Link
                        href={child.href}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none",
                          childActive &&
                            "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]",
                        )}
                      >
                        {ChildIcon ? (
                          <ChildIcon className="size-4" aria-hidden="true" />
                        ) : null}
                        {adminV1Sr[child.labelKey]}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full px-3.5 text-[0.82rem] font-semibold whitespace-nowrap transition-[background-color,color] duration-150",
              active
                ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]"
                : "text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)]",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(utilityButtonClass, "hidden sm:grid")}
          aria-label={adminV1Sr.notifications}
        >
          <Bell className="size-[1.15rem]" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={9}
        className="admin-v1 min-w-64 rounded-2xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-2 shadow-[var(--admin-shadow-md)]"
      >
        <DropdownMenuLabel className="px-3 py-2 text-sm">
          {adminV1Sr.notifications}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-3 py-4 text-sm text-[var(--admin-text-muted)]">
          {adminV1Sr.notificationsEmpty}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu({ identity, onSignOut }: { identity: string; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="admin-v1-round hidden min-h-11 max-w-48 items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3.5 text-sm font-semibold shadow-[var(--admin-shadow-xs)] transition-colors hover:border-[var(--admin-ink)] xl:flex"
          aria-label={fmt(adminV1Sr.currentProfile, { name: identity })}
        >
          <UserRound className="size-[1.1rem] shrink-0" aria-hidden="true" />
          <span className="truncate">{identity}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={9}
        className="admin-v1 min-w-64 rounded-2xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1.5 shadow-[var(--admin-shadow-md)]"
      >
        <DropdownMenuLabel className="truncate px-3 py-2 text-sm">
          {identity}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onSignOut}
          className="min-h-11 rounded-xl px-3 text-sm font-semibold focus:bg-[var(--admin-surface-muted)]"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {adminV1Sr.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNavigation({
  pathname,
  identity,
  onSignOut,
}: {
  pathname: string;
  identity: string;
  onSignOut: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(utilityButtonClass, "xl:hidden")}
          aria-label={adminV1Sr.openMobileNavigation}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        data-reveal="off"
        className="admin-v1 w-[min(92vw,25rem)] border-[var(--admin-border)] bg-[var(--admin-app)] p-0 shadow-[var(--admin-shadow-lg)] sm:max-w-md"
      >
        <SheetHeader className="border-b border-[var(--admin-border)] px-5 py-5 text-left">
          <SheetTitle className="text-xl tracking-[-0.03em]">
            {adminV1Sr.mobileNavigationTitle}
          </SheetTitle>
          <SheetDescription className="text-sm text-[var(--admin-text-muted)]">
            {adminV1Sr.mobileNavigationDescription}
          </SheetDescription>
        </SheetHeader>

        <nav
          aria-label={adminV1Sr.adminNavigationAria}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        >
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = navIcons[item.id];
            const active = isAdminNavItemActive(pathname, item);
            if (item.children) {
              return (
                <div key={item.id} className="mt-2 border-t border-[var(--admin-border)] pt-3 first:mt-0 first:border-t-0 first:pt-0">
                  <div className="flex min-h-10 items-center gap-3 px-3 text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">
                    <Icon className="size-4" aria-hidden="true" />
                    {adminV1Sr[item.labelKey]}
                  </div>
                  <div className="grid gap-1 pl-3">
                    {item.children.map((child) => {
                      const ChildIcon = childIcons[child.id];
                      const childActive = isAdminNavChildActive(pathname, child);
                      return (
                        <SheetClose asChild key={child.id}>
                          <Link
                            href={child.href}
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                              childActive
                                ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]"
                                : "hover:bg-[var(--admin-surface-muted)]",
                            )}
                          >
                            {ChildIcon ? (
                              <ChildIcon className="size-4" aria-hidden="true" />
                            ) : null}
                            {adminV1Sr[child.labelKey]}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <SheetClose asChild key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                    active
                      ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]"
                      : "hover:bg-[var(--admin-surface-muted)]",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {adminV1Sr[item.labelKey]}
                </Link>
              </SheetClose>
            );
          })}
        </nav>

        <div className="grid gap-2 border-t border-[var(--admin-border)] p-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--admin-surface-muted)] px-3 py-2.5">
            <span className="min-w-0 truncate text-sm font-semibold">{identity}</span>
            <ThemeToggle className="border-[var(--admin-border)] bg-[var(--admin-surface-strong)]" />
          </div>
          <SheetClose asChild>
            <Link href="/admin/pretraga" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-[var(--admin-surface-muted)]">
              <Search className="size-4" aria-hidden="true" />
              {adminV1Sr.globalSearch}
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href="/admin/podesavanja" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-[var(--admin-surface-muted)]">
              <Settings className="size-4" aria-hidden="true" />
              {adminV1Sr.settings}
            </Link>
          </SheetClose>
          <p className="flex min-h-11 items-center gap-3 px-3 text-sm text-[var(--admin-text-muted)]">
            <Bell className="size-4" aria-hidden="true" />
            {adminV1Sr.notificationsEmpty}
          </p>
          <button type="button" onClick={onSignOut} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]">
            <LogOut className="size-4" aria-hidden="true" />
            {adminV1Sr.signOut}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
