"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { AdminErrorState, AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { minuteFloor } from "@/components/admin/admin-ui/use-minute-now";
import { usePolled } from "@/components/admin/admin-ui/use-polled-query";
import { dashboardSectionUrgency, withNavUrgency } from "@/components/admin/events/dashboard-logic";
import { AdminEventProvider } from "@/components/admin/events/event-context";
import { AdminEventFrameView } from "@/components/admin/events/event-frame-view";
import { AdminEventsNotFound } from "@/components/admin/events/event-not-found";
import { eventBasePath, eventNavGroups, eventPathSegments, eventSectionHref, resolveEventSection, switchEventHref } from "@/lib/admin-v1/event-sections";
import { parseViewModeParam, type AdminViewMode } from "@/lib/admin-v1/view-mode";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — container of `/admin/dogadjaji/[eventSlug]/**` (layout): the
// event list, slug → event, and the catalog + directory every section needs,
// loaded once and kept while moving between sections. The `Tabela | Kartice`
// switch of every list below reads and writes `?prikaz=`.
// A10 — the event dashboard (fairDashboard.getEventDashboard) is read here
// once, refreshed every 60 s while the tab is visible (it holds scan
// counters, A0 nalaz 0.5) and when Pregled is opened again; Pregled and the
// urgency badges of the section navigation use that one result.

/** Opening Pregled refreshes the dashboard when the last read is older than this. */
const DASHBOARD_FRESH_MS = 15_000;

export function AdminEventFrame({ eventSlug, children }: { eventSlug: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useAdminQueryState();
  const events = useQuery(api.fairAdmin.listEvents);
  const event = events?.find((row) => row.slug === eventSlug) ?? null;
  const args = event ? { eventId: event._id } : "skip";
  const catalog = useQuery(api.fairAdmin.getEventCatalog, args);
  const directory = useQuery(api.fairAdmin.getEventDirectory, args);
  const eventId = event?._id ?? null;
  const dashboard = usePolled(eventId ? `dashboard:${eventId}` : null, (convex) => convex.query(api.fairDashboard.getEventDashboard, { eventId: eventId!, at: minuteFloor(Date.now()) }));

  const base = eventBasePath(eventSlug);
  const section = resolveEventSection(eventPathSegments(pathname, base));
  const activePath = section?.kind === "section" ? section.path : null;
  const actions = dashboard.data?.actions;
  const nav = useMemo(
    () => withNavUrgency(eventNavGroups((path) => eventSectionHref(base, path), activePath), dashboardSectionUrgency(actions ?? [])),
    [base, activePath, actions],
  );
  const readAt = useRef(0);
  useEffect(() => {
    if (dashboard.data) readAt.current = Date.now();
  }, [dashboard.data]);
  const { refresh } = dashboard;
  useEffect(() => {
    if (activePath === "pregled" && readAt.current && Date.now() - readAt.current > DASHBOARD_FRESH_MS) refresh();
  }, [activePath, refresh]);
  const frameEvents = useMemo(() => [...(events ?? [])].sort((a, b) => a.startsAt - b.startsAt).map((row) => ({ slug: row.slug, title: row.title, status: row.status })), [events]);
  const onViewChange = useCallback((mode: AdminViewMode) => setQuery({ prikaz: mode }), [setQuery]);

  if (events === undefined) return <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>;
  if (!event) return <AdminEventsNotFound title={dict.eventNotFoundTitle} body={dict.eventNotFoundBody} href="/admin/dogadjaji" linkLabel={dict.backToEvents} />;

  return (
    <AdminEventFrameView
      events={frameEvents}
      currentSlug={eventSlug}
      onSelectEvent={(slug) => router.push(switchEventHref(eventBasePath(slug), section, query))}
      nav={nav}
      linkStickerHref={activePath === "povezi" ? null : eventSectionHref(base, "povezi")}
    >
      {catalog === undefined || directory === undefined ? (
        <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
      ) : (
        <AdminEventProvider value={{ eventId: event._id, base, catalog, directory, dashboard }}>
          <AdminViewModeOverride value={parseViewModeParam(query.prikaz)} onChange={onViewChange}>
            {children}
          </AdminViewModeOverride>
        </AdminEventProvider>
      )}
    </AdminEventFrameView>
  );
}

export class AdminEventsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} retryLabel={dict.retry} onRetry={() => window.location.reload()} /></AdminPanel>;
    return this.props.children;
  }
}
