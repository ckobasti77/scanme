"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { EventDashboardData } from "@/components/admin/events/dashboard-logic";
import { buildCatalogView, type EventCatalogData, type EventDirectoryData } from "@/components/admin/events/event-catalog";

// Admin UX A2 — the open event, loaded once by AdminEventFrame (layout) and
// shared by every section route below it. Sections add only their own queries.

export type AdminEventContextValue = {
  eventId: Id<"fairEvents">;
  /** `/admin/dogadjaji/<slug>` — section links are `${base}/<path>`. */
  base: string;
  catalog: EventCatalogData;
  directory: EventDirectoryData;
  /** A10 — fairDashboard.getEventDashboard, read once and refreshed on a 60 s poll (Pregled and the section badges). */
  dashboard: { data: EventDashboardData | undefined; error: unknown; refresh: () => void };
};

const AdminEventContext = createContext<AdminEventContextValue | null>(null);

export function AdminEventProvider({ value, children }: { value: AdminEventContextValue; children: ReactNode }) {
  return <AdminEventContext.Provider value={value}>{children}</AdminEventContext.Provider>;
}

export function useAdminEvent(): AdminEventContextValue {
  const value = useContext(AdminEventContext);
  if (!value) throw new Error("useAdminEvent is used outside AdminEventFrame");
  return value;
}

/** Catalog view without validation checks (QR, forms…). */
export function useCatalogViewWithoutChecks() {
  const { catalog, directory } = useAdminEvent();
  return useMemo(() => buildCatalogView(catalog, directory), [catalog, directory]);
}
