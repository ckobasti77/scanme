"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { outcome } from "@/components/admin/events/event-outcome";
import { EventExhibitorsView } from "@/components/admin/events/sections/izlagaci-view";

// Admin UX A2 — container of `izlagaci` (event-only clients until A5).

const CLIENT_PAGE = 25;

export function IzlagaciSection() {
  const clients = usePaginatedQuery(api.fairAdmin.listEventClients, {}, { initialNumItems: CLIENT_PAGE });
  const convert = useMutation(api.fairAdmin.convertEventClientToStandard);
  return (
    <EventExhibitorsView
      clients={{
        rows: clients.results.map((row) => ({ accountId: row.accountId, name: row.name, smkCode: row.smkCode })),
        status: clients.status === "LoadingFirstPage" ? "loading" : "ready",
        canLoadMore: clients.status === "CanLoadMore" || clients.status === "LoadingMore",
        loadingMore: clients.status === "LoadingMore",
        onLoadMore: () => clients.loadMore(CLIENT_PAGE),
      }}
      actions={{ convert: (accountId) => outcome(() => convert({ accountId: accountId as Id<"accounts"> })) }}
    />
  );
}
