"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { AdminSearchCommandPreviewGroups } from "@/components/admin/admin-search-command";
import { api } from "@/convex/_generated/api";
import { adminRoute } from "@/lib/admin-v2/frame/routes";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminDrawer } from "./admin-drawer";
import { AdminFrameContext, type AdminDrawerTarget, type AdminFrameValue } from "./admin-frame-context";
import { AdminNavbar } from "./admin-navbar";
import { AdminScreen } from "./admin-screen";
import { AdminSidebar } from "./admin-sidebar";
import { AdminSidebarProvider } from "./admin-sidebar-store";

// ADMIN v2 — the frame of the admin (ZADATAK §2): the sidebar over the whole
// height on the left, the navbar right of it, the screen below the navbar.
// app/admin/layout.tsx renders it once, so it is not remounted between pages;
// the dev previews render the same frame around their fixtures. The three
// parts carry `data-admin-frame` (the contract the chain checks): the window
// never scrolls, only the screen does. Below lg the navbar is the top bar and
// the sidebar is a drawer.

export type AdminFrameProps = {
  children: ReactNode;
  /** Dev preview: the identity shown instead of the signed-in admin. */
  previewIdentity?: string;
  previewSearchGroups?: AdminSearchCommandPreviewGroups;
  /** Dev preview: the admin path the navbar marks as current. */
  activePathname?: string;
};

export function AdminFrame({ children, previewIdentity, previewSearchGroups, activePathname }: AdminFrameProps) {
  const pathname = usePathname();
  const me = useQuery(api.admin.me);
  const { signOut } = useAuthActions();
  const identity = previewIdentity ?? me?.email ?? adminV1Sr.profileFallback;
  const [drawer, setDrawer] = useState<AdminDrawerTarget | null>(null);
  const route = useMemo(() => {
    const base = adminRoute(pathname);
    // A single-surface preview names the admin page it shows (one preview route may show several).
    return base.single && activePathname ? { ...base, key: activePathname } : base;
  }, [pathname, activePathname]);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const value = useMemo<AdminFrameValue>(
    () => ({ route, activePath: activePathname ?? route.key, drawer, openDrawer: setDrawer, closeDrawer }),
    [route, activePathname, drawer, closeDrawer],
  );
  const onSignOut = useCallback(() => void signOut(), [signOut]);

  return (
    <AdminFrameContext.Provider value={value}>
      <AdminSidebarProvider>
        {/* data-reveal="off": the site's text reveal never hides admin text, also not on a client navigation. */}
        <div data-reveal="off" className="admin-v1 relative flex h-[100dvh] w-full overflow-hidden bg-[var(--admin-app)] text-[var(--admin-text)]">
          <a href="#main-content" className="skip-link">{adminV1Sr.skipToContent}</a>
          <AdminSidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <AdminNavbar identity={identity} onSignOut={onSignOut} previewSearchGroups={previewSearchGroups} />
            <AdminScreen>{children}</AdminScreen>
          </div>
          <AdminDrawer identity={identity} onSignOut={onSignOut} />
        </div>
      </AdminSidebarProvider>
    </AdminFrameContext.Provider>
  );
}
