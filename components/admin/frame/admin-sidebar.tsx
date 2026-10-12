"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { useAdminFrame } from "./admin-frame-context";
import { AdminSidebarContent } from "./admin-sidebar-content";

// ADMIN v2 — the sidebar of the frame (ZADATAK §2): fixed on the left over
// the whole height from lg up, the ScanMe logo centred on top, the
// contextual content of the page below it. Content that does not fit scrolls
// inside the sidebar, with a soft fade where there is more.

export function AdminSidebar() {
  const frame = useAdminFrame();
  return (
    <aside data-admin-frame="sidebar" aria-label={dict.frame.sidebarAria} className="hidden min-h-0 w-[var(--admin-sidebar-w)] shrink-0 flex-col lg:flex">
      <div className="flex h-[var(--admin-navbar-h)] shrink-0 items-center justify-center px-4">
        <Link href={routeHref("/admin", frame?.route ?? null)} aria-label={dict.frame.home} className="flex min-h-11 items-center rounded-lg px-2">
          <BrandLogo width="6.9rem" />
        </Link>
      </div>
      <AdminSidebarScroll>
        {/* The content reads the query string (useSearchParams). */}
        <Suspense fallback={null}><AdminSidebarContent /></Suspense>
      </AdminSidebarScroll>
    </aside>
  );
}

/** The sidebar's own scroll; `data-fade-top/bottom` are set while there is more content that way. */
export function AdminSidebarScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      element.toggleAttribute("data-fade-top", element.scrollTop > 1);
      element.toggleAttribute("data-fade-bottom", element.scrollTop + element.clientHeight < element.scrollHeight - 1);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className="admin-sidebar-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      <div>{children}</div>
    </div>
  );
}
