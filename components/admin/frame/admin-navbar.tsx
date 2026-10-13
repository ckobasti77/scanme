"use client";

import gsap from "gsap";
import { Bell, BellOff, ChevronDown, Keyboard, Link2, LogOut, Menu, Moon, Package, QrCode, Settings, ShoppingBag, Star, UserRound, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { AdminSearchCommand, type AdminSearchCommandPreviewGroups } from "@/components/admin/admin-search-command";
import { adminSegmentOnClass } from "@/components/admin/admin-ui/admin-controls";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_NAV_ITEMS, isAdminNavChildActive, isAdminNavItemActive } from "@/lib/admin-v1/navigation";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";
import { ADMIN_GO_PENDING_EVENT, ADMIN_SHORTCUTS_EVENT, GO_SEQUENCE_MS, goShortcutKeys } from "@/lib/admin-v2/shortcuts";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { useAdminFrame } from "./admin-frame-context";
import { AdminPulse } from "./admin-pulse";

// ADMIN v2 — the navbar of the frame (ZADATAK §2): right of the sidebar, on
// top. The links start at the left edge, are plain text without any
// background and as wide as their name; the current one is green and a thin
// line slides under it. The Operativa and Usluge menus are the ones the
// admin had before. On the right: search (with its Ctrl K shortcut),
// settings, notifications, theme and profile. Below lg it is the top bar
// with the menu button of the drawer. X4: an area with a shortcut says it in
// its tooltip (G D), the profile menu holds the quiet mode and the list of
// shortcuts. X6: between lg and xl the nine links are set tighter so all of
// them fit, and the theme (its button has no room there) is in the profile menu.
// V3: the Pulse of the system runs along its bottom edge, under the links.

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
  "inline-flex min-h-11 shrink-0 items-center gap-1 px-1.5 text-[0.8125rem] font-semibold whitespace-nowrap text-[var(--admin-text)] transition-colors duration-150 hover:text-[var(--admin-nav-current)] aria-[current=page]:text-[var(--admin-nav-current)] xl:px-2.5 xl:text-sm";
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
  const [quiet, setQuiet] = useQuietMode();
  const header = useRef<HTMLElement>(null);
  const dark = useSyncExternalStore(subscribeTheme, readDarkTheme, () => false);
  // The one theme switch of the navbar does the work (it is in the DOM also while it has no room to show).
  const toggleTheme = () => header.current?.querySelector<HTMLButtonElement>('button[data-theme-toggle="local"]')?.click();

  return (
    <header ref={header} data-admin-frame="navbar" className="relative isolate flex h-[var(--admin-navbar-h)] shrink-0 items-center gap-1 px-2 lg:pr-3 lg:pl-0">
      <AdminPulse />
      <button type="button" onClick={() => frame?.openDrawer("nav")} className={cn(utilityClass, "lg:hidden")} aria-label={adminUiSr.frame.openMenu}>
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <Link href={href("/admin")} aria-label={adminUiSr.frame.home} className="flex min-h-11 items-center rounded-lg px-1.5 lg:hidden">
        <BrandLogo width="6.4rem" />
      </Link>

      <DesktopLinks pathname={pathname} href={href} />

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <GoPendingChip />
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
            {/* Between lg and xl the theme button has no room in the navbar: the theme is here, like the settings. */}
            <DropdownMenuCheckboxItem
              checked={dark}
              onCheckedChange={toggleTheme}
              onSelect={(event) => event.preventDefault()}
              data-admin-theme-item=""
              className="min-h-11 gap-2 rounded-xl px-3 text-sm font-semibold focus:bg-[var(--admin-surface-muted)] xl:hidden [&>span:first-child]:hidden"
            >
              <Moon className="size-4" aria-hidden="true" />
              <span className="flex-1">{adminUiSr.frame.darkTheme}</span>
              <span aria-hidden="true" data-on={dark ? "" : undefined} className="admin-switch" />
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={quiet}
              onCheckedChange={(checked) => setQuiet(checked === true)}
              onSelect={(event) => event.preventDefault()}
              // The state is the switch on the right (visible on and off), as in the phone drawer; the built-in check mark is hidden.
              className="min-h-11 gap-2 rounded-xl px-3 text-sm font-semibold focus:bg-[var(--admin-surface-muted)] [&>span:first-child]:hidden"
            >
              <BellOff className="size-4 self-start mt-0.5" aria-hidden="true" />
              <span className="grid min-w-0 flex-1 gap-0.5 py-1.5">
                <span>{adminUiSr.quiet.label}</span>
                <span className="text-xs leading-4 font-normal text-[var(--admin-text-muted)]">{adminUiSr.quiet.hint}</span>
              </span>
              <span aria-hidden="true" data-on={quiet ? "" : undefined} className="admin-switch" />
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(ADMIN_SHORTCUTS_EVENT))} className="min-h-11 rounded-xl px-3 text-sm font-semibold focus:bg-[var(--admin-surface-muted)]">
              <Keyboard className="size-4" aria-hidden="true" />
              <span className="flex-1">{adminUiSr.shortcuts.title}</span>
              <kbd aria-hidden="true" className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">?</kbd>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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

/** V3: after `G` the navbar shows the chip until the letter of an area arrives or the sequence runs out (1.5 s). */
function GoPendingChip() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onPending = (event: Event) => {
      const on = (event as CustomEvent<boolean>).detail === true;
      if (timer) clearTimeout(timer);
      timer = on ? setTimeout(() => setPending(false), GO_SEQUENCE_MS) : null;
      setPending(on);
    };
    window.addEventListener(ADMIN_GO_PENDING_EVENT, onPending);
    return () => {
      window.removeEventListener(ADMIN_GO_PENDING_EVENT, onPending);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return (
    <span role="status" className="hidden lg:inline-flex">
      {pending ? (
        <kbd data-admin-go-pending="" className="admin-go-chip rounded-md border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold whitespace-nowrap text-[var(--admin-nav-current)]">
          <span aria-hidden="true">{adminUiSr.shortcuts.goPending}</span>
          <span className="sr-only">{adminUiSr.shortcuts.goPendingAria}</span>
        </kbd>
      ) : null}
    </span>
  );
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener("scanme-theme-change", onChange);
  return () => window.removeEventListener("scanme-theme-change", onChange);
}

function readDarkTheme() {
  return document.documentElement.dataset.theme === "dark";
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
      // The line is as wide as the name: the padding of the link (tighter between lg and xl) is left out.
      const inset = Number.parseFloat(getComputedStyle(current).paddingLeft) || 0;
      const target = { x: current.offsetLeft + inset, scaleX: Math.max(1, current.offsetWidth - inset * 2), opacity: 1 };
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animate && placed.current && !still) gsap.to(bar, { ...target, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out, overwrite: true });
      else gsap.set(bar, target);
      placed.current = true;
      // Should the row ever be wider than its room (a large text zoom), bring the current link into view by scrolling the row itself.
      // Not scrollIntoView: in Chromium it moves the keyboard's starting point to the link, so the first Tab
      // of a page skipped the skip link and the whole sidebar.
      const left = current.offsetLeft;
      const right = left + current.offsetWidth;
      if (left < container.scrollLeft) container.scrollLeft = left;
      else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth;
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
          // The shortcut of the area is its tooltip (G D). No aria-keyshortcuts: its values are alternatives,
          // so "G D" would be announced as two single keys; the sequence is in the list of shortcuts (?).
          const keys = goShortcutKeys(item.href);
          return (
            <Link
              key={item.id}
              href={href(item.href)}
              aria-current={active ? "page" : undefined}
              title={keys ? fmt(adminUiSr.shortcuts.hint, { label, keys }) : undefined}
              className={linkClass}
            >
              {label}
            </Link>
          );
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
                      className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none", childActive && adminSegmentOnClass)}
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
