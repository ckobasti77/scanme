"use client";

import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EventsActions, InventoryRowView, Paged, QrActions, QrBulkActions, QrScanStatsView } from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import { usePolled, usePolledQuery } from "@/components/admin/admin-ui/use-polled-query";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { useAdminEvent, useCatalogViewWithoutChecks } from "@/components/admin/events/event-context";
import { attempt, outcome } from "@/components/admin/events/event-outcome";
import { EventQrDetailView, EventQrView } from "@/components/admin/events/sections/qr-view";
import { eventDetailHref, eventSectionHref } from "@/lib/admin-v1/event-sections";
import { qrListQuery } from "@/lib/admin-v1/qr-filters";
import { FAIR_QR_SCAN_STATS_MAX } from "@/lib/fair-contract";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A4 — containers of `qr` and `qr/[kod]`. The inventory list stays a
// reactive paginated query (assignments); scan numbers and the code detail
// are read once and refreshed every 60 s while the tab is visible
// (usePolledQuery), because they change with every scan.

const INVENTORY_PAGE = 100;
const NO_STATS: ReadonlyMap<string, QrScanStatsView> = new Map();

function useInventory(): Paged<InventoryRowView> {
  const { eventId, catalog } = useAdminEvent();
  const qrConfigured = Boolean(catalog.event.qrInventoryBusinessId);
  const inventory = usePaginatedQuery(api.fairAdmin.listQrInventory, qrConfigured ? { eventId } : "skip", { initialNumItems: INVENTORY_PAGE });
  return {
    rows: inventory.results.map((row) => ({
      cardId: row.cardId,
      resolverCode: row.resolverCode,
      label: row.label,
      kind: row.kind,
      smqCode: row.smqCode,
      state: row.state,
      problemReason: row.problemReason,
      assignment: row.assignment ? { modelId: row.assignment.eventModelId, sameEvent: row.assignment.eventId === eventId } : null,
    })),
    status: inventory.status === "LoadingFirstPage" ? "loading" : "ready",
    canLoadMore: inventory.status === "CanLoadMore" || inventory.status === "LoadingMore",
    loadingMore: inventory.status === "LoadingMore",
    onLoadMore: () => inventory.loadMore(INVENTORY_PAGE),
  };
}

/** Scan columns of the loaded codes that lead to a model of this event, in chunks of FAIR_QR_SCAN_STATS_MAX. */
function useScanStats(rows: readonly InventoryRowView[]): ReadonlyMap<string, QrScanStatsView> | undefined {
  const { eventId } = useAdminEvent();
  const cardIds = useMemo(() => rows.filter((row) => row.assignment?.sameEvent).map((row) => row.cardId).sort(), [rows]);
  const key = cardIds.length ? `qr-stats:${eventId}:${cardIds.join(",")}` : null;
  const polled = usePolled(key, async (convex) => {
    const chunks: string[][] = [];
    for (let index = 0; index < cardIds.length; index += FAIR_QR_SCAN_STATS_MAX) chunks.push(cardIds.slice(index, index + FAIR_QR_SCAN_STATS_MAX));
    const results = await Promise.all(chunks.map((chunk) => convex.query(api.fairAdminQr.getQrScanStats, { eventId, cardIds: chunk as Id<"cards">[] })));
    return new Map(results.flat().map((row) => [row.cardId as string, { total: row.total, unique: row.unique, lastScanAt: row.lastScanAt }]));
  });
  // Without an assigned code there is nothing to read: every code shows "—".
  return key === null ? NO_STATS : polled.data;
}

export function useResolveTest(): Pick<EventsActions, "resolveTest"> {
  const convex = useConvex();
  return {
    resolveTest: (resolverCode) => attempt(async () => {
      const result = await convex.query(api.fairAdmin.resolveTest, { resolverCode });
      return { outcome: result.outcome, problem: result.problem, path: result.path };
    }),
  };
}

export function useBulkActions(): QrBulkActions {
  const { eventId } = useAdminEvent();
  const convex = useConvex();
  const commit = useMutation(api.fairAdminQr.bulkAssignQrCommit);
  return {
    dryRun: (rows) => attempt(() => convex.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId, rows })),
    commit: (rows) => attempt(() => commit({ eventId, rows })),
  };
}

export function QrSection() {
  const { base } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const view = useCatalogViewWithoutChecks();
  const inventory = useInventory();
  const stats = useScanStats(inventory.rows);
  const bulk = useBulkActions();
  const actions = useResolveTest();
  const listQuery = qrListQuery(query);
  return (
    <EventQrView
      catalog={view}
      inventory={inventory}
      stats={stats}
      query={query}
      onQueryChange={setQuery}
      qrHref={(code) => eventDetailHref(base, "qr", code, listQuery)}
      modelHref={(id) => eventDetailHref(base, "modeli", id)}
      bulk={bulk}
      actions={actions}
    />
  );
}

export function useQrActions(): QrActions {
  const { eventId } = useAdminEvent();
  const reassign = useMutation(api.fairAdminQr.reassignQr);
  const assign = useMutation(api.fairAdmin.assignQr);
  const release = useMutation(api.fairAdmin.releaseQr);
  const { resolveTest } = useResolveTest();
  return {
    reassign: (code, toModelId, reason) => outcome(() => reassign({ eventId, code, toEventModelId: toModelId as Id<"fairEventModels">, reason })),
    assign: (modelId, resolverCode, reason) => outcome(() => assign({ eventModelId: modelId as Id<"fairEventModels">, resolverCode, ...(reason ? { reason } : {}) })),
    release: (modelId, reason) => outcome(() => release({ eventModelId: modelId as Id<"fairEventModels">, reason })),
    resolveTest,
  };
}

export function QrDetailSection({ code }: { code: string }) {
  const { eventId, base, catalog } = useAdminEvent();
  const router = useRouter();
  const [query] = useAdminQueryState();
  const view = useCatalogViewWithoutChecks();
  const actions = useQrActions();
  const qrConfigured = Boolean(catalog.event.qrInventoryBusinessId);
  const detail = usePolledQuery(api.fairAdminQr.getQrDetail, qrConfigured ? { eventId, code } : "skip");
  const listQuery = useMemo(() => qrListQuery(query), [query]);
  const canonical = detail.data?.resolverCode;
  // An SMQ (or a lower-case code) in the URL opens the canonical resolver-code URL.
  useEffect(() => {
    if (canonical && canonical !== code) router.replace(eventDetailHref(base, "qr", canonical, listQuery));
  }, [canonical, code, base, listQuery, router]);
  if (!qrConfigured) return <AdminPanel><AdminEmptyState title={dict.detailQrTitle} body={dict.qrNotConfigured} /></AdminPanel>;
  return (
    <EventQrDetailView
      key={code}
      catalog={view}
      code={code}
      detail={detail.data}
      failed={detail.data === undefined && Boolean(detail.error)}
      actions={actions}
      onChanged={detail.refresh}
      listHref={eventSectionHref(base, "qr", listQuery)}
      modelHref={(id) => eventDetailHref(base, "modeli", id)}
      generalQrHref={(row) => `/admin/operativa/qr?code=${encodeURIComponent(row.resolverCode)}&channel=${encodeURIComponent(row.accessChannelId)}`}
    />
  );
}
