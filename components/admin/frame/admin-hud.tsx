"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Component, useMemo, type ReactNode } from "react";
import { AdminOdometer } from "@/components/admin/admin-ui/admin-odometer";
import { minuteFloor, useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { usePolled } from "@/components/admin/admin-ui/use-polled-query";
import { dashboardTime, timeLeftText } from "@/components/admin/events/dashboard-logic";
import { api } from "@/convex/_generated/api";
import { eventBasePath, eventSectionHref } from "@/lib/admin-v1/event-sections";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { liveDayPercent } from "@/lib/admin-v2/analytics/live-day";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { hudData, hudEvent, type HudData } from "@/lib/admin-v2/hud";
import type { SidebarLive } from "@/lib/admin-v2/sidebar/types";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";
import { useAdminFrame } from "./admin-frame-context";
import { useAdminSidebarLive, useAdminSidebarSnapshot } from "./admin-sidebar-store";

// ADMIN v2 X4 — the HUD „Danas“ (ZADATAK §5.2) at the bottom of the sidebar,
// on every page: the fair day as a progress bar, the time to the end of the
// day, the live mark while the day is open and the scans of the day. It shows
// only during a fair. An event page sends the HUD of its own event (it already
// reads that dashboard); on the other pages the frame reads it: the event list
// always, the dashboard of the running fair every 60 s (AdminHudLive).

const d = adminUiSr.hud;

export function AdminHudView({ hud, href, className }: { hud: HudData; href: string; className?: string }) {
  const { state } = hud;
  const day = fmt(d.day, { day: state.dayIndex, count: state.dayCount });
  return (
    <section data-admin-hud={state.kind} aria-label={d.title} className={cn("grid min-w-0 gap-1.5 border-t border-[var(--admin-border)] px-5 py-3", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.title}</p>
        {state.kind !== "live" ? null : hud.stale ? (
          // The poll keeps failing: the number is not live, so the HUD says from when it is.
          <p data-hud-stale="" className="text-[0.67rem] font-semibold text-[var(--admin-text-muted)] tabular-nums">{fmt(d.stale, { time: dashboardTime(hud.readAt) })}</p>
        ) : (
          <p data-hud-live="" className="flex items-center gap-1.5 text-[0.67rem] font-bold tracking-[0.08em] uppercase">
            <span aria-hidden="true" className="size-2 rounded-full bg-[var(--admin-success)]" />
            {d.live}
          </p>
        )}
      </div>
      <Link href={href} aria-label={fmt(d.open, { event: hud.eventTitle })} className="-mx-1 block min-w-0 truncate rounded-md px-1 text-sm font-semibold hover:underline">
        {hud.eventTitle}
      </Link>
      {state.kind === "live" ? (
        <>
          <div
            role="progressbar"
            aria-label={d.progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={liveDayPercent(state.progress)}
            aria-valuetext={fmt(d.progressText, { share: `${liveDayPercent(state.progress)} %`, left: timeLeftText(state.left) })}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]"
          >
            <div className="h-full rounded-full bg-[var(--admin-nav-line)]" style={{ width: `${state.progress * 100}%` }} />
          </div>
          <p className="text-xs text-[var(--admin-text-muted)] tabular-nums">
            <span className="font-semibold text-[var(--admin-text)]">{day}</span>
            {" · "}
            {fmt(d.left, { left: timeLeftText(state.left) })}
          </p>
          <p className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="text-xs text-[var(--admin-text-muted)]">{d.scansToday}</span>
            <AdminOdometer value={state.scansToday} text={state.scansCapped ? `${formatCount(state.scansToday)}+` : undefined} className="text-lg leading-6 font-semibold tracking-[-0.02em]" />
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--admin-text-muted)] tabular-nums">{fmt(d.nextDay, { day: state.dayIndex, count: state.dayCount, left: timeLeftText(state.left) })}</p>
      )}
    </section>
  );
}

/** The HUD of the open page (its own event first, then the running fair the frame read); nothing outside a fair. */
export function AdminHud({ className }: { className?: string }) {
  const frame = useAdminFrame();
  const live = useAdminSidebarSnapshot();
  const hud = live.hud ?? live.frameHud;
  if (!hud) return null;
  return <AdminHudView hud={hud} href={routeHref(hud.href, frame?.route ?? null)} className={className} />;
}

/** Dev preview: the frame shows this TEST HUD on pages that do not send their own. */
export function AdminHudPreview({ hud }: { hud: HudData }) {
  const live = useMemo<SidebarLive>(() => ({ frameHud: hud }), [hud]);
  useAdminSidebarLive(live);
  return null;
}

function HudRead() {
  const events = useQuery(api.fairAdmin.listEvents);
  const now = useMinuteNow();
  const pageHud = useAdminSidebarSnapshot().hud;
  const event = events ? hudEvent(events, now) : null;
  const eventId = event?._id ?? null;
  // The page of an event already reads its dashboard and sends its HUD: no second read then.
  const dashboard = usePolled(eventId && !pageHud ? `hud:${eventId}` : null, (convex) => convex.query(api.fairDashboard.getEventDashboard, { eventId: eventId!, at: minuteFloor(Date.now()) }));
  const data = dashboard.data;
  const live = useMemo<SidebarLive | null>(() => {
    if (!event || !data) return null;
    const hud = hudData({ title: event.title, href: eventSectionHref(eventBasePath(event.slug), "pregled") }, data, Math.max(now, data.at));
    return hud ? { frameHud: hud } : null;
  }, [event, data, now]);
  useAdminSidebarLive(live);
  return null;
}

class HudBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The frame's own read of the running fair (admin only). A failed read shows no HUD, never an error. */
export function AdminHudLive() {
  return <HudBoundary><HudRead /></HudBoundary>;
}
