// ADMIN v2 — `Klijenti`: the URL state of the sidebar (`q`, `status`, `sort`)
// as the arguments of `adminReadModels.listClients`, and the same choice
// applied locally to the rows of the preview. Pure: tested without a DOM.

import type { SidebarState } from "@/lib/admin-v2/sidebar/types";

export type ClientsStatus = "all" | "active" | "archived";
export type ClientsSort = "urgency" | "name" | "recent";

export type ClientsListArgs = {
  search: string | undefined;
  status: ClientsStatus;
  sort: ClientsSort;
};

/** The fields of a client row the preview filter reads. */
export type PreviewClientRow = {
  ownerDisplayName: string;
  smkCode: string;
  firstVenueName: string | null;
  defaultContactEmail: string | null;
  defaultContactPhone: string | null;
  clientStatus: string;
  updatedAt: number;
};

const LOCALE = "sr-Latn";

/** Empty URL state = no search, every status, by urgency (the defaults of the page before the sidebar). */
export function clientsListArgs(state: SidebarState): ClientsListArgs {
  const status = state.status === "active" || state.status === "archived" ? state.status : "all";
  const sort = state.sort === "name" || state.sort === "recent" ? state.sort : "urgency";
  return { search: state.q?.trim() || undefined, status, sort };
}

/** True when the list is narrowed by a search or a status (the empty state says „Nema rezultata“). */
export function clientsNarrowed(args: ClientsListArgs): boolean {
  return Boolean(args.search) || args.status !== "all";
}

export function filterPreviewClients<Row extends PreviewClientRow>(rows: readonly Row[], state: SidebarState): Row[] {
  const { search, status, sort } = clientsListArgs(state);
  const needle = search?.toLocaleLowerCase(LOCALE);
  const kept = rows.filter((row) => {
    if (status !== "all" && row.clientStatus !== status) return false;
    if (!needle) return true;
    return `${row.ownerDisplayName} ${row.smkCode} ${row.firstVenueName ?? ""} ${row.defaultContactEmail ?? ""} ${row.defaultContactPhone ?? ""}`
      .toLocaleLowerCase(LOCALE)
      .includes(needle);
  });
  if (sort === "name") return kept.sort((a, b) => a.ownerDisplayName.localeCompare(b.ownerDisplayName, LOCALE));
  if (sort === "recent") return kept.sort((a, b) => b.updatedAt - a.updatedAt);
  return kept;
}
