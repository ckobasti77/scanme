"use client";

import gsap from "gsap";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { useMissionProgress } from "@/components/admin/admin-ui/use-mission-progress";
import { adminRoute, routeHref } from "@/lib/admin-v2/frame/routes";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_ENTER_OFFSET, ADMIN_STAGGER_TOTAL } from "@/lib/admin-v2/motion";
import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { activeFilterCount, hasSidebarFilters } from "@/lib/admin-v2/sidebar/accordion";
import { resolveSidebar } from "@/lib/admin-v2/sidebar/registry";
import type { SidebarPatch } from "@/lib/admin-v2/sidebar/types";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { useAdminFrame } from "./admin-frame-context";
import { useAdminSidebarSnapshot } from "./admin-sidebar-store";
import { AdminSidebarView } from "./admin-sidebar-view";

// ADMIN v2 — the sidebar of the open page: the registry configuration of the
// route, the page's live data and the URL state, wired to AdminSidebarView.
// When the page changes the frame stays and the content fades in (the whole
// content between areas, only the filters between pages of one area).

const JUMPS = [
  { href: "/admin/zadaci", label: adminV1Sr.navTasks },
  { href: "/admin/inbox", label: adminV1Sr.navInbox },
  { href: "/admin/operativa/porudzbine", label: adminV1Sr.navOrders },
  { href: "/admin/operativa/qr", label: adminV1Sr.navQrCodes },
  { href: "/admin/dogadjaji", label: adminV1Sr.navEvents },
] as const;

/** Configuration, URL state and the write of the open page's sidebar. */
export function useAdminSidebar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const frameRoute = useAdminFrame()?.route;
  const config = useMemo(() => resolveSidebar(frameRoute ?? adminRoute(pathname), new URLSearchParams(search)), [frameRoute, pathname, search]);
  const fields = useMemo(() => sidebarUrlFields(config), [config]);
  const [state, setState] = useAdminUrlState(fields);
  const live = useAdminSidebarSnapshot();
  const intercept = live.intercept;
  const patch = useCallback(
    (change: SidebarPatch) => {
      const next = intercept ? intercept(change, state) : change;
      if (next) setState(next);
    },
    [intercept, setState, state],
  );
  return { config, state, live, patch, filterCount: activeFilterCount(config, state), hasFilters: hasSidebarFilters(config) };
}

export function AdminSidebarContent({ large }: { large?: boolean }) {
  const frame = useAdminFrame();
  const { config, state, live, patch } = useAdminSidebar();
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  const route = frame?.route ?? null;
  const pageJumps = config.jumps;
  const jumps = useMemo(() => (pageJumps ?? JUMPS).map((jump) => ({ ...jump, href: routeHref(jump.href, route) })), [pageJumps, route]);
  // The page writes admin paths; in a dev preview the links of its missions stay in the previews, like the jumps.
  const pageLive = useMemo(
    () => (live.missions ? { ...live, missions: live.missions.map((mission) => (mission.href ? { ...mission, href: routeHref(mission.href, route) } : mission)) } : live),
    [live, route],
  );
  // The day's ledger of this page's missions: one per page (the Dashboard and Zadaci count apart) and per
  // value of the key that changes what they count (the Dashboard scope).
  const missionsFor = config.missionsBy ? state[config.missionsBy] ?? config.views?.defaultValue ?? "" : null;
  const missionScope = missionsFor === null ? config.id : `${config.id}:${missionsFor}`;
  // The URL changes at once, the numbers for the new value a moment later: until the page says its numbers
  // are for this value, the ledger is not touched (old numbers in the new ledger would read as solved work).
  const waiting = missionsFor !== null && live.missionsScope !== missionsFor;
  const missions = useMissionProgress(missionScope, config.blocks?.includes("missions") ? pageLive.missions ?? null : null, false, waiting);

  useEffect(() => {
    const previous = shown.current;
    shown.current = config.id;
    // Nothing moves on the first render, nor when only the data of the same page changes.
    if (previous === null || previous === config.id || !root.current) return;
    const sameArea = previous.split("/")[0] === config.id.split("/")[0];
    const blocks = root.current.querySelectorAll(sameArea ? '[data-sidebar-block="filters"]' : "[data-sidebar-block]");
    if (!blocks.length) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      gsap.from(blocks, {
        opacity: 0,
        y: still ? 0 : ADMIN_ENTER_OFFSET,
        // The blocks are staggered: 180 ms each, the last one ends within 250 ms.
        duration: ADMIN_DURATION.state,
        ease: ADMIN_EASE.out,
        stagger: Math.min(0.04, ADMIN_STAGGER_TOTAL / blocks.length),
        clearProps: "opacity,transform",
      });
    }, root);
    return () => context.revert();
  }, [config.id]);

  return (
    <div ref={root}>
      <AdminSidebarView config={config} live={pageLive} state={state} onPatch={patch} large={large} jumps={jumps} missions={missions} />
    </div>
  );
}
