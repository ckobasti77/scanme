"use client";

import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EventsActions, InventoryRowView, Paged } from "@/components/admin/admin-events";
import { useAdminEvent, useCatalogViewWithoutChecks } from "@/components/admin/events/event-context";
import { attempt, outcome } from "@/components/admin/events/event-outcome";
import { EventQrDetailView, EventQrView } from "@/components/admin/events/sections/qr-view";
import { eventDetailHref, eventSectionHref } from "@/lib/admin-v1/event-sections";

// Admin UX A2 — containers of `qr` and `qr/[kod]`. Only these routes read
// the QR inventory.

const INVENTORY_PAGE = 50;

function useInventory(): Paged<InventoryRowView> {
  const { eventId, catalog } = useAdminEvent();
  const qrConfigured = Boolean(catalog.event.qrInventoryBusinessId);
  const inventory = usePaginatedQuery(api.fairAdmin.listQrInventory, qrConfigured ? { eventId } : "skip", { initialNumItems: INVENTORY_PAGE });
  const modelNames = useMemo(() => new Map(catalog.models.map((model) => [model._id as string, model.displayName])), [catalog]);
  return {
    rows: inventory.results.map((row) => ({
      cardId: row.cardId,
      resolverCode: row.resolverCode,
      smqCode: row.smqCode,
      state: row.state,
      assignment: row.assignment ? { modelId: row.assignment.eventModelId, modelName: modelNames.get(row.assignment.eventModelId) ?? null, sameEvent: row.assignment.eventId === eventId } : null,
    })),
    status: inventory.status === "LoadingFirstPage" ? "loading" : "ready",
    canLoadMore: inventory.status === "CanLoadMore" || inventory.status === "LoadingMore",
    loadingMore: inventory.status === "LoadingMore",
    onLoadMore: () => inventory.loadMore(INVENTORY_PAGE),
  };
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

export function QrSection() {
  const { base } = useAdminEvent();
  const view = useCatalogViewWithoutChecks();
  const inventory = useInventory();
  const { resolveTest } = useResolveTest();
  const assignQr = useMutation(api.fairAdmin.assignQr);
  const releaseQr = useMutation(api.fairAdmin.releaseQr);
  const actions: Pick<EventsActions, "assignQr" | "releaseQr" | "resolveTest"> = {
    assignQr: (modelId, resolverCode) => outcome(() => assignQr({ eventModelId: modelId as Id<"fairEventModels">, resolverCode })),
    releaseQr: (modelId, reason) => outcome(() => releaseQr({ eventModelId: modelId as Id<"fairEventModels">, reason })),
    resolveTest,
  };
  return <EventQrView catalog={view} inventory={inventory} actions={actions} qrHref={(code) => eventDetailHref(base, "qr", code)} />;
}

export function QrDetailSection({ code }: { code: string }) {
  const { base } = useAdminEvent();
  const view = useCatalogViewWithoutChecks();
  const inventory = useInventory();
  const actions = useResolveTest();
  const row = inventory.rows.find((entry) => entry.resolverCode === code) ?? null;
  return (
    <EventQrDetailView
      key={code}
      catalog={view}
      code={code}
      row={row}
      actions={actions}
      listHref={eventSectionHref(base, "qr")}
      modelHref={(id) => eventDetailHref(base, "modeli", id)}
      generalQrHref={`/admin/operativa/qr?code=${encodeURIComponent(code)}`}
    />
  );
}
