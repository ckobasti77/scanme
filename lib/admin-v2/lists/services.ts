// ADMIN v2 — Usluge (Links, Review, Meni): the URL state of the sidebar
// (`pogled`, `q`, `sort`) as the arguments of `adminServiceOperations.list`
// and as the filter of the fixture rows of the preview. Pure, no React.

import type { SERVICE_SORTS, SERVICE_VIEWS } from "@/lib/admin-v2/sidebar/configs/services";
import type { SidebarState } from "@/lib/admin-v2/sidebar/types";

export type ServiceFilter = (typeof SERVICE_VIEWS)[number];
export type ServiceSort = (typeof SERVICE_SORTS)[number];

/** What the page sends to the list query; the component adds `serviceType`. */
export type ServicesListArgs = { filter: ServiceFilter; sort: ServiceSort; search?: string };

/** The fields of a row the preview filters and sorts by. */
export type PreviewServiceRow = {
  serviceType: string;
  filterState: string;
  accountName: string;
  venueName: string;
  smkCode: string;
  smlCode: string;
  updatedAt: number;
};

const LOCALE = "sr-Latn-RS";

// `readUrlState` only lets the allowed values through, so the cast is the schema.
const filterOf = (state: SidebarState) => (state.pogled ?? "all") as ServiceFilter;
const sortOf = (state: SidebarState) => (state.sort ?? "urgency") as ServiceSort;
const searchOf = (state: SidebarState) => state.q ?? "";

export function servicesListArgs(state: SidebarState): ServicesListArgs {
  const search = searchOf(state);
  return { filter: filterOf(state), sort: sortOf(state), ...(search.trim() ? { search } : {}) };
}

/** The preview rows of one service for the chosen view, search and sort. */
export function filterPreviewServices<T extends PreviewServiceRow>(rows: readonly T[], serviceType: string, state: SidebarState): T[] {
  const filter = filterOf(state);
  const needle = searchOf(state).trim().toLocaleLowerCase(LOCALE);
  const shown = rows.filter((row) => row.serviceType === serviceType
    && (filter === "all" || row.filterState === filter)
    && `${row.accountName} ${row.venueName} ${row.smkCode} ${row.smlCode}`.toLocaleLowerCase(LOCALE).includes(needle));
  const sort = sortOf(state);
  if (sort === "name") return shown.sort((a, b) => a.venueName.localeCompare(b.venueName, "sr-Latn"));
  if (sort === "recent") return shown.sort((a, b) => b.updatedAt - a.updatedAt);
  return shown;
}

/** Whether a search or a view narrows the list (decides the empty state). */
export function servicesAreFiltered(state: SidebarState): boolean {
  return searchOf(state).trim() !== "" || filterOf(state) !== "all";
}
