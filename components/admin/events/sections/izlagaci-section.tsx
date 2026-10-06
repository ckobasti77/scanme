"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { useAdminEvent, useCatalogViewWithoutChecks } from "@/components/admin/events/event-context";
import { outcome } from "@/components/admin/events/event-outcome";
import { followUpTextState } from "@/components/admin/events/leads-logic";
import { EventExhibitorsView } from "@/components/admin/events/sections/izlagaci-view";
import { eventSectionHref } from "@/lib/admin-v1/event-sections";
import { buildExhibitorRows } from "@/lib/admin-v1/exhibitors";

// Admin UX A5 — container of `izlagaci`: the exhibitors come from the event
// catalog the frame already loaded plus the A3 lead counts
// (fairAdminStats.getLeadCounts, bounded); the event_only clients without a
// participation from the existing paged listEventClients. A8: the follow-up
// column reads fairFollowUps.getExhibitorFollowUps (bounded).

const CLIENT_PAGE = 25;

export function IzlagaciSection() {
  const { eventId, base } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const catalog = useCatalogViewWithoutChecks();
  const leadCounts = useQuery(api.fairAdminStats.getLeadCounts, { eventId });
  const followUpRows = useQuery(api.fairFollowUps.getExhibitorFollowUps, { eventId });
  const followUps = useMemo(
    () => (followUpRows ? new Map(followUpRows.map((row) => [row.participationId as string, { state: followUpTextState(row), advancedModels: row.advancedModels }])) : undefined),
    [followUpRows],
  );
  const clients = usePaginatedQuery(api.fairAdmin.listEventClients, {}, { initialNumItems: CLIENT_PAGE });
  const convert = useMutation(api.fairAdmin.convertEventClientToStandard);
  const exhibitors = useMemo(() => buildExhibitorRows(catalog, leadCounts), [catalog, leadCounts]);
  const modelsHref = useCallback((participationId: string) => eventSectionHref(base, "modeli", { izlagac: participationId }), [base]);
  return (
    <EventExhibitorsView
      exhibitors={exhibitors}
      leadsCapped={Boolean(leadCounts?.capped)}
      query={query}
      onQueryChange={setQuery}
      modelsHref={modelsHref}
      importHref={eventSectionHref(base, "import")}
      clients={{
        rows: clients.results.map((row) => ({ accountId: row.accountId, name: row.name, smkCode: row.smkCode })),
        status: clients.status === "LoadingFirstPage" ? "loading" : "ready",
        canLoadMore: clients.status === "CanLoadMore" || clients.status === "LoadingMore",
        loadingMore: clients.status === "LoadingMore",
        onLoadMore: () => clients.loadMore(CLIENT_PAGE),
      }}
      actions={{ convert: (accountId) => outcome(() => convert({ accountId: accountId as Id<"accounts"> })) }}
      followUps={followUps}
      followUpHref={(participationId) => eventSectionHref(base, "leadovi/follow-up", { izlagac: participationId })}
    />
  );
}
