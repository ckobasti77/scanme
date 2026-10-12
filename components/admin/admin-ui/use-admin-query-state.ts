"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  ADMIN_QUERY_KEYS,
  parseAdminQuery,
  patchAdminQuery,
  serializeAdminQuery,
  type AdminQueryPatch,
  type AdminQueryState,
} from "@/lib/admin-v1/query-state";
import { readUrlState, writeUrlState, type UrlField } from "@/lib/admin-v2/query/url-state";
import type { SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";

// Admin UX A2 / ADMIN v2 — read and write the admin query string (filters,
// views, search, sort, `prikaz`). A change replaces the history entry
// (typing does not flood Back) through the native History API, which Next
// keeps in sync with useSearchParams: the list answers at once, without a
// round trip to the server. Sections and details are links, so Back/Forward
// move between pages. Parameters a hook does not own (`?task=`, `?profile=`)
// are kept. Needs a <Suspense> above it (useSearchParams).

function replaceUrl(pathname: string, search: string) {
  window.history.replaceState(null, "", `${pathname}${search}${window.location.hash}`);
}

/** `Događaji`: the fixed query keys of lib/admin-v1/query-state.ts. */
export function useAdminQueryState(): [AdminQueryState, (patch: AdminQueryPatch) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const state = useMemo(() => parseAdminQuery(params), [params]);
  const setQuery = useCallback(
    (patch: AdminQueryPatch) => {
      // The live URL, not the rendered one: two changes in one tick both land.
      const current = new URLSearchParams(window.location.search);
      const next = new URLSearchParams(serializeAdminQuery(patchAdminQuery(parseAdminQuery(current), patch)));
      for (const key of ADMIN_QUERY_KEYS) current.delete(key);
      for (const [key, value] of current) next.append(key, value);
      const text = next.toString();
      replaceUrl(pathname, text ? `?${text}` : "");
    },
    [pathname],
  );
  return [state, setQuery];
}

/** A list with its own schema (the sidebar of a page: lib/admin-v2/query/url-state.ts). */
export function useAdminUrlState(fields: readonly UrlField[]): [SidebarState, (patch: SidebarPatch) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const state = useMemo(() => readUrlState(fields, params), [fields, params]);
  const setState = useCallback(
    (patch: SidebarPatch) => replaceUrl(pathname, writeUrlState(fields, window.location.search, patch)),
    [fields, pathname],
  );
  return [state, setState];
}
