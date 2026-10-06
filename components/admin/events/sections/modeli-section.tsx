"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EventsActions } from "@/components/admin/admin-events";
import { buildCatalogView } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { outcome } from "@/components/admin/events/event-outcome";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import { EventModelDetailView, EventModelsView } from "@/components/admin/events/sections/modeli-view";
import { eventDetailHref, eventSectionHref } from "@/lib/admin-v1/event-sections";

// Admin UX A2 — containers of `modeli` and `modeli/[modelId]`.

function useCheckedCatalog() {
  const { eventId, catalog, directory } = useAdminEvent();
  const validation = useQuery(api.fairAdmin.listValidationIssues, { eventId });
  return useMemo(() => (validation ? buildCatalogView(catalog, directory, validation) : undefined), [catalog, directory, validation]);
}

export function ModeliSection() {
  const { base } = useAdminEvent();
  const view = useCheckedCatalog();
  if (!view) return <SectionLoading />;
  return <EventModelsView catalog={view} modelHref={(id) => eventDetailHref(base, "modeli", id)} />;
}

export function ModelDetailSection({ modelId }: { modelId: string }) {
  const { base } = useAdminEvent();
  const view = useCheckedCatalog();
  const publish = useMutation(api.fairAdmin.publishModel);
  const withdraw = useMutation(api.fairAdmin.withdrawModel);
  const upgrade = useMutation(api.fairAdmin.upgradePackage);
  const actions: Pick<EventsActions, "publish" | "withdraw" | "upgrade"> = {
    publish: (id) => outcome(() => publish({ eventModelId: id as Id<"fairEventModels"> })),
    withdraw: (id) => outcome(() => withdraw({ eventModelId: id as Id<"fairEventModels"> })),
    upgrade: (id, toTier) => outcome(() => upgrade({ eventModelId: id as Id<"fairEventModels">, toTier })),
  };
  if (!view) return <SectionLoading />;
  return (
    <EventModelDetailView
      key={modelId}
      catalog={view}
      modelId={modelId}
      actions={actions}
      listHref={eventSectionHref(base, "modeli")}
      qrHref={(code) => eventDetailHref(base, "qr", code)}
    />
  );
}
