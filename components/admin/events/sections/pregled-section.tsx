"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { buildCatalogView } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import { EventOverviewView } from "@/components/admin/events/sections/pregled-view";
import { eventDetailHref } from "@/lib/admin-v1/event-sections";

// Admin UX A2 — container of `pregled`: the shared catalog plus the
// validation checks (A10 replaces it with the dashboard query).

export function PregledSection() {
  const { eventId, base, catalog, directory } = useAdminEvent();
  const validation = useQuery(api.fairAdmin.listValidationIssues, { eventId });
  const view = useMemo(() => (validation ? buildCatalogView(catalog, directory, validation) : undefined), [catalog, directory, validation]);
  if (!view) return <SectionLoading />;
  return <EventOverviewView catalog={view} modelHref={(id) => eventDetailHref(base, "modeli", id)} />;
}
