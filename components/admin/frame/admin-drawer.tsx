"use client";

import { BellOff, ChevronDown, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense, useRef, useState, type PointerEvent } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { GameOperator } from "@/components/admin/game/game-parts";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ADMIN_NAV_ITEMS, isAdminNavChildActive, isAdminNavItemActive } from "@/lib/admin-v1/navigation";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { useAdminFrame } from "./admin-frame-context";
import { AdminHud } from "./admin-hud";
import { AdminSidebarContent } from "./admin-sidebar-content";

// ADMIN v2 — the sidebar below lg (ZADATAK §2): a drawer from the left with
// the same content (logo, the main navigation, the context and the filters of
// the page). The menu button opens it on the navigation, „Filteri (N)“ of a
// page header opens it straight on the filters. It traps focus and closes on
// Escape (Radix Dialog), on a swipe to the left and on its button; every
// target is at least 44 px.

const rowClass = "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold";
/** One icon of the footer row: 44 px, the same on the buttons and the links. */
const footIconClass = "focus-signal inline-flex size-11 flex-none items-center justify-center rounded-lg text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]";
/** A swipe past this share of the drawer width, or a quick flick, closes it. */
const CLOSE_SHARE = 0.3;
const FLICK_PX_PER_MS = 0.5;

export function AdminDrawer({ identity, onSignOut }: { identity: string; onSignOut: () => void }) {
  const frame = useAdminFrame();
  const content = useRef<HTMLDivElement>(null);
  // The element that had focus when the drawer opened: the drawer has no Trigger, so Radix would focus nothing on close.
  const opener = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number; at: number; dx: number; active: boolean } | null>(null);
  // „Filteri“ opens with the main navigation folded, so the filters are the first thing on the screen.
  const [navOpen, setNavOpen] = useState<boolean | null>(null);
  const [quiet, setQuiet] = useQuietMode();
  if (!frame) return null;
  // The frame closes the drawer itself on a navigation (X6): the fold of the main navigation starts over then too.
  if (frame.drawer === null && navOpen !== null) setNavOpen(null);
  const pathname = frame.activePath;
  const href = (target: string) => routeHref(target, frame.route);
  const showNav = navOpen ?? frame.drawer !== "filters";

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    drag.current = { x: event.clientX, y: event.clientY, at: event.timeStamp, dx: 0, active: false };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const element = content.current;
    if (!state || !element) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.active && (dx > -8 || Math.abs(dx) < Math.abs(dy))) return;
    state.active = true;
    state.dx = Math.min(0, dx);
    element.style.transition = "none";
    element.style.transform = `translateX(${state.dx}px)`;
  }
  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const element = content.current;
    drag.current = null;
    if (!state?.active || !element) return;
    const speed = -state.dx / Math.max(1, event.timeStamp - state.at);
    element.style.transition = "";
    element.style.transform = "";
    if (-state.dx > element.offsetWidth * CLOSE_SHARE || speed > FLICK_PX_PER_MS) frame?.closeDrawer();
  }

  return (
    <Sheet
      open={frame.drawer !== null}
      onOpenChange={(open) => {
        if (open) return;
        frame.closeDrawer();
        setNavOpen(null);
      }}
    >
      <SheetContent
        ref={content}
        side="left"
        data-admin-drawer=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onOpenAutoFocus={(event) => {
          // Radix has not moved focus yet: remember where it was.
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (frame.drawer !== "filters") return;
          // The page search first; a page without one starts at its first filter group (not at the event switch).
          const target = content.current?.querySelector<HTMLElement>("[data-admin-sidebar-search]")
            ?? content.current?.querySelector<HTMLElement>('[data-sidebar-block="filters"] :is(input, [data-admin-filter-toggle])');
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = opener.current;
          opener.current = null;
          // After a navigation through a link the button may be gone: then there is nothing to focus.
          if (target?.isConnected) target.focus();
        }}
        onEscapeKeyDown={(event) => {
          // An open filter group closes itself on Escape (and returns focus to its header); the drawer stays.
          const active = document.activeElement;
          if (active instanceof Element && active.closest(".admin-acc-body[data-open]")) event.preventDefault();
        }}
        className="admin-v1 w-[min(88vw,22rem)] touch-pan-y gap-0 border-[var(--admin-border)] bg-[var(--admin-app)] p-0 text-[var(--admin-text)] shadow-[var(--admin-shadow-lg)] sm:max-w-none"
      >
        <SheetHeader className="flex h-[var(--admin-navbar-h)] shrink-0 flex-row items-center px-4 text-left">
          <BrandLogo width="6.4rem" />
          <SheetTitle className="sr-only">{dict.frame.drawerTitle}</SheetTitle>
          <SheetDescription className="sr-only">{dict.frame.drawerDescription}</SheetDescription>
        </SheetHeader>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          <div className="border-b border-[var(--admin-border)] pb-2">
            <button type="button" aria-expanded={showNav} onClick={() => setNavOpen(!showNav)} className={cn(rowClass, "w-full justify-between text-[var(--admin-text-muted)]")}>
              {dict.frame.mainNavTitle}
              <ChevronDown className="admin-acc-chevron size-4" aria-hidden="true" />
            </button>
            {showNav ? (
              <nav aria-label={adminV1Sr.adminNavigationAria} className="grid gap-0.5">
                {ADMIN_NAV_ITEMS.map((item) => {
                  if (!item.children) {
                    const active = isAdminNavItemActive(pathname, item);
                    return (
                      <SheetClose asChild key={item.id}>
                        <Link href={href(item.href)} aria-current={active ? "page" : undefined} className={cn(rowClass, active ? "text-[var(--admin-nav-current)]" : "hover:bg-[var(--admin-surface-muted)]")}>{adminV1Sr[item.labelKey]}</Link>
                      </SheetClose>
                    );
                  }
                  return (
                    <div key={item.id} className="grid gap-0.5">
                      <p className="px-3 pt-2 text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{adminV1Sr[item.labelKey]}</p>
                      {item.children.map((child) => {
                        const active = isAdminNavChildActive(pathname, child);
                        return (
                          <SheetClose asChild key={child.id}>
                            <Link href={href(child.href)} aria-current={active ? "page" : undefined} className={cn(rowClass, "pl-5", active ? "text-[var(--admin-nav-current)]" : "hover:bg-[var(--admin-surface-muted)]")}>{adminV1Sr[child.labelKey]}</Link>
                          </SheetClose>
                        );
                      })}
                    </div>
                  );
                })}
              </nav>
            ) : null}
          </div>

          <div className="pt-3">
            <Suspense fallback={null}><AdminSidebarContent large /></Suspense>
          </div>
          <GameOperator className="mt-3 px-3" />
          <AdminHud className="px-3" />
          <p className="truncate border-t border-[var(--admin-border)] px-3 py-3 text-sm font-semibold">{identity}</p>
        </div>

        <div className="flex shrink-0 items-center justify-around border-t border-[var(--admin-border)] p-2">
          <ThemeToggle className="rounded-lg border-0 bg-transparent" />
          <button
            type="button"
            role="switch"
            aria-checked={quiet}
            aria-label={dict.quiet.label}
            title={dict.quiet.hint}
            onClick={() => setQuiet(!quiet)}
            className={cn(footIconClass, quiet && "bg-[var(--admin-surface-muted)] text-[var(--admin-nav-current)] ring-1 ring-current")}
          >
            <BellOff className="size-5" aria-hidden="true" />
          </button>
          <SheetClose asChild>
            <Link href={href("/admin/pretraga")} aria-label={adminV1Sr.globalSearch} title={adminV1Sr.globalSearch} className={footIconClass}>
              <Search className="size-5" aria-hidden="true" />
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={href("/admin/podesavanja")} aria-label={adminV1Sr.settings} title={adminV1Sr.settings} className={footIconClass}>
              <Settings className="size-5" aria-hidden="true" />
            </Link>
          </SheetClose>
          <button type="button" aria-label={adminV1Sr.signOut} title={adminV1Sr.signOut} onClick={onSignOut} className={cn(footIconClass, "hover:bg-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]")}>
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
