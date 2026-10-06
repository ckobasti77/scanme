"use client";

import { useConvex, useMutation } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { EventsActions } from "@/components/admin/admin-events";
import { useAdminEvent, useCatalogViewWithoutChecks } from "@/components/admin/events/event-context";
import { attempt } from "@/components/admin/events/event-outcome";
import { EventImportView, importContextFromCatalog } from "@/components/admin/events/sections/import-view";

// Admin UX A5 — container of `import`: the existing fairImport.dryRun (query)
// and commit (mutation), unchanged. The payload is validated by the Convex
// argument validator; a wrong shape comes back as a failed call, never as a
// partial write. The open event's catalog lets the table import match
// existing exhibitors, stands and models.

export function ImportSection() {
  const convex = useConvex();
  const commit = useMutation(api.fairImport.commit);
  const { catalog } = useAdminEvent();
  const view = useCatalogViewWithoutChecks();
  const context = useMemo(() => importContextFromCatalog(view, catalog.event.code), [view, catalog.event.code]);
  // Stable: the guide runs the dry run when its Pregled step opens.
  const actions = useMemo<Pick<EventsActions, "dryRun" | "commit">>(() => ({
    dryRun: (payload) => attempt(() => convex.query(api.fairImport.dryRun, { payload: payload as never })),
    commit: (payload) => attempt(() => commit({ payload: payload as never })),
  }), [convex, commit]);
  return <EventImportView context={context} actions={actions} />;
}
