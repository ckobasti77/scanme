"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { useAdminFrame } from "@/components/admin/frame/admin-frame-context";
import { adminRoute } from "@/lib/admin-v2/frame/routes";
import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { activeFilterCount, clearFiltersPatch } from "@/lib/admin-v2/sidebar/accordion";
import { resolveSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 — the action of an empty state after filtering: the same patch as
// "Očisti sve" in the sidebar (search and groups; the view, the sort and the
// context stay). Shown only while a filter is on, so an empty list without
// filters does not offer it. Sits in the `action` slot of AdminEmptyState.

export function AdminClearFilters() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const frameRoute = useAdminFrame()?.route;
  const config = useMemo(() => resolveSidebar(frameRoute ?? adminRoute(pathname), new URLSearchParams(search)), [frameRoute, pathname, search]);
  const fields = useMemo(() => sidebarUrlFields(config), [config]);
  const [state, setState] = useAdminUrlState(fields);
  if (activeFilterCount(config, state) === 0) return null;
  return (
    <button
      type="button"
      data-admin-action="clear-filters"
      onClick={() => setState(clearFiltersPatch(config))}
      className="inline-flex min-h-11 items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]"
    >
      {adminUiSr.filters.clearFilters}
    </button>
  );
}
