// ADMIN v2 — the Izlagač → Brend → Model filters of `Događaji` as sidebar
// groups: the options under the current choice (with counts) and the rule of
// the dependent filters (lib/admin-v1/hierarchy.ts: a brand sets its
// exhibitor, an exhibitor drops a brand of another one).

import { changeHierarchy, hierarchyOptions, type HierarchyData, type HierarchyLevel, type HierarchyValue } from "@/lib/admin-v1/hierarchy";
import type { SidebarOption, SidebarPatch, SidebarState } from "./types";

const LEVEL_OF: Record<string, HierarchyLevel> = { izlagac: "exhibitor", brend: "brand", model: "model" };

/** The three keys of the hierarchy in a query (the page's query state or the sidebar state). */
type HierarchyQuery = { izlagac?: string; brend?: string; model?: string };

const valueOf = (state: HierarchyQuery): HierarchyValue => ({ exhibitorId: state.izlagac, brandId: state.brend, modelId: state.model });

/** Options of the `izlagac`, `brend` and `model` groups; `counted` = the rows that pass the other filters. */
export function hierarchySidebarOptions(data: HierarchyData, state: HierarchyQuery, counted?: ReadonlySet<string>): Record<"izlagac" | "brend" | "model", SidebarOption[]> {
  const options = hierarchyOptions(data, valueOf(state), counted);
  const withCount = (row: { id: string; label: string; count: number }): SidebarOption => ({ value: row.id, label: row.label, ...(counted ? { count: row.count } : {}) });
  return {
    izlagac: options.exhibitors.map(withCount),
    brend: options.brands.map(withCount),
    model: options.models.map((row) => ({ value: row.id, label: row.label, ...(row.sublabel ? { hint: row.sublabel } : {}) })),
  };
}

/** `SidebarLive.intercept` of a list with the hierarchy: a change of one level rewrites all three keys. */
export function hierarchyIntercept(data: HierarchyData) {
  return (patch: SidebarPatch, state: SidebarState): SidebarPatch => {
    const key = (["izlagac", "brend", "model"] as const).find((id) => id in patch);
    if (!key || Object.keys(patch).filter((id) => id in LEVEL_OF).length > 1) return patch;
    const next = changeHierarchy(data, valueOf(state), LEVEL_OF[key], patch[key] ?? undefined);
    return { ...patch, izlagac: next.exhibitorId ?? null, brend: next.brandId ?? null, model: next.modelId ?? null };
  };
}
