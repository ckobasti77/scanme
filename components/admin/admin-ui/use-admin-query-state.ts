"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  parseAdminQuery,
  patchAdminQuery,
  serializeAdminQuery,
  type AdminQueryPatch,
  type AdminQueryState,
} from "@/lib/admin-v1/query-state";

// Admin UX A2 — read and write the admin query string (filters, `prikaz`).
// Filters replace the history entry (typing does not flood Back); sections
// and details are links, so Back/Forward move between pages. Needs a
// <Suspense> above it (useSearchParams).

export function useAdminQueryState(): [AdminQueryState, (patch: AdminQueryPatch) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const state = useMemo(() => parseAdminQuery(params), [params]);
  const setQuery = useCallback(
    (patch: AdminQueryPatch) => {
      router.replace(`${pathname}${serializeAdminQuery(patchAdminQuery(state, patch))}`, { scroll: false });
    },
    [pathname, router, state],
  );
  return [state, setQuery];
}
