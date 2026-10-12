"use client";

import gsap from "gsap";
import { Bell, ChevronDown, Link2, LogOut, Menu, Package, QrCode, Settings, ShoppingBag, Star, UserRound, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ComponentType } from "react";
import { AdminSearchCommand, type AdminSearchCommandPreviewGroups } from "@/components/admin/admin-search-command";
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
import { ADMIN_NAV_ITEMS, isAdminNavChildActive, isAdminNavItemActive } from "@/lib/admin-v1/navigation";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { useAdminFrame } from "./admin-frame-context";

// ADMIN v2 — the navbar of the frame (ZADATAK §2): right of the sidebar, on
// top. The links start at the left edge, are plain text without any
// background and as wide as their name; the current one is green and a thin
// line slides under it. The Operativa and Usluge menus are the ones the
// admin had before. On the right: search (with its Ctrl K shortcut),
// settings, notifications, theme and profile. Below lg it is the top bar
// with the menu button of the drawer.

type NavIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const childIcons: Record<string, NavIcon> = {
  products: Package,
  qr: QrCode,
  orders: ShoppingBag,
  links: Link2,
  review: Star,
  menu: UtensilsCrossed,
};

const linkClass =
  "inline-flex min-h-11 shrink-0 items-center gap-1 px-2.5 text-sm font-semibold whitespace-nowrap text-[var(--admin-text)] transition-colors duration-150 hover:text-[var(--admin-nav-current)] aria-[current=page]:text-[var(--admin-nav-current)]";
const utilityClass =
  "grid size-11 shrink-0 place-items-center rounded-lg text-[var(--admin-text)] transition-colors duration-150 hover:bg-[var(--admin-surface-muted)]";

export function AdminNavbar({ identity, onSignOut, previewSearchGroups }: {
  identity: string;
  onSignOut: () => void;
  previewSearchGroups?: AdminSearchCommandPreviewGroups;
}) {
  const frame = useAdminFrame();
  const pathname = frame?.activePath ?? "/admin";
  const route = frame?.route ?? null;
  const href = (target: string) => routeHref(target, route);

  return (
    <header data-admin-frame="navbar" className="flex h-[var(--admin-navbar-h)] shrink-0 items-center gap-1 px-2 lg:pr-3 lg:pl-0">
      <button type="button" onClick={() => frame?.openDrawer("nav")} className={cn(utilityClass, "lg:hidden")} aria-label={adminUiSr.frame.openMenu}>
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <Link href={href("/admin")} aria-label={adminUiSr.frame.home} className="flex min-h-11 items-center rounded-lg px-1.5 lg:hidden">
        <BrandLogo width="6.4rem" />
      </Link>

      <DesktopLinks pathname={pathname} href={href} />

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <AdminSearchCommand
          buttonClass="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--admin-text)] transition-colors duration-150 hover:bg-[var(--admin-surface-muted)]"
          previewGroups={previewSearchGroups}
          showShortcut
        />
        <Link href={href("/admin/podesavanja")} className={cn(utilityClass, "hidden xl:grid")} aria-label={adminV1Sr.settings}>
          <Settings className="size-[1.15rem]" aria-hidden="true" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(utilityClass, "hidden sm:grid")} aria-label={adminV1Sr.notifications}>
              <Bell className="size-[1.15rem]" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={9} className="admin-v1 min-w-64 rounded-2xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-2 shadow-[var(--admin-shadow-md)]">
            <DropdownMenuLabel className="px-3 py-2 text-sm">{adminV1Sr.notifications}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <p className="px-3 py-4 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.notificationsEmpty}</p>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Always in the DOM: the site's floating theme button hides only while a local one exists. */}
        <ThemeToggle className={cn(utilityClass, "hidden border-0 bg-transparent xl:inline-grid")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(utilityClass, "hidden lg:grid")} aria-label={fmt(adminV1Sr.currentProfile, { name: identity })}>
              <UserRound className="size-[1.15rem]" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={9} className="admin-v1 min-w-64 rounded-2xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1.5 shadow-[var(--admin-shadow-md)]">
            <DropdownMenuLabel className="truncate px-3 py-2 text-sm">{identity}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="min-h-11 rounded-xl px-3 text-sm font-semibold focus:bg-[var(--admin-surface-muted)] xl:hidden">
              <Link href={href("/admin/podesavanja")}>
                <Settings className="size-4" aria-hidden="true" />
                {adminV1Sr.settings}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSignOut} className="min-h-11 rounded-xl px-3 text-sm font-semibold focus:bg-[var(--admin-surface-muted)]">
              <LogOut className="size-4" aria-hidden="true" />
              {adminV1Sr.signOut}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function DesktopLinks({ pathname, href }: { pathname: string; href: (target: string) => string }) {
  const nav = useRef<HTMLElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const activeId = ADMIN_NAV_ITEMS.find((item) => isAdminNavItemActive(pathname, item))?.id ?? null;

  // The line under the current link: it slides to the new one (transform only) and is put in place without motion the first time.
  useEffect(() => {
    const container = nav.current;
    const bar = line.current;
    if (!container || !bar) return;
    const place = (animate: boolean) => {
      const current = container.querySelector<HTMLElement>('[aria-current="page"]');
      if (!current) {
        gsap.set(bar, { opacity: 0 });
        placed.current = false;
        return;
      }
      const inset = 10;
      const target = { x: current.offsetLeft + inset, scaleX: Math.max(1, current.offsetWidth - inset * 2), opacity: 1 };
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animate && placed.current && !still) gsap.to(bar, { ...target, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out, overwrite: true });
      else gsap.set(bar, target);
      placed.current = true;
      current.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    return () => {
      observer.disconnect();
      gsap.killTweensOf(bar);
    };
  }, [activeId]);

  return (
    <nav ref={nav} aria-label={adminV1Sr.adminNavigationAria} className="admin-navbar-links relative hidden min-w-0 flex-1 items-center overflow-x-auto lg:flex">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isAdminNavItemActive(pathname, item);
        const label = adminV1Sr[item.labelKey];
        if (!item.children) {
          return <Link key={item.id} href={href(item.href)} aria-current={active ? "page" : undefined} className={linkClass}>{label}</Link>;
        }
        return (
          <DropdownMenu key={item.id}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-current={active ? "page" : undefined} className={linkClass}>
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
                  <DropdownMenuItem key={child.id} asChild className="rounded-xl p-0 focus:bg-[var(--admin-surface-muted)] focus:text-[var(--admin-text)]">
                    <Link
                      href={href(child.href)}
                      aria-current={childActive ? "page" : undefined}
                      className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none", childActive && "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]")}
                    >
                      {ChildIcon ? <ChildIcon className="size-4" aria-hidden="true" /> : null}
                      {adminV1Sr[child.labelKey]}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      <span ref={line} aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-0 h-0.5 w-px origin-left rounded-full bg-[var(--admin-nav-line)] opacity-0" />
    </nav>
  );
}
