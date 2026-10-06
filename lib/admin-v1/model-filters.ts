// Admin UX A3 — filters of the `Modeli` section (query string keys from A0
// §2.3) and everything derived from them: the filtered list in a fixed order
// (izlagač → brend → model), counts next to filter options, grouping and
// "prethodni / sledeći" on the model detail. Pure; shared by the admin
// container, the dev preview and the tests.

import type { FairModelStatus, FairPackageTier } from "@/lib/fair-contract";
import { buildHierarchy, matchesSearch, normalizeSearch, type HierarchyData } from "./hierarchy";
import type { AdminQueryKey, AdminQueryPatch, AdminQueryState } from "./query-state";

export type FilterableModel = {
  id: string;
  displayName: string;
  variant?: string;
  externalKey: string;
  participationId: string;
  exhibitorName: string;
  brandId: string;
  brandName: string;
  tier: FairPackageTier;
  status: FairModelStatus;
  qrCode: string | null;
  qrSmq: string | null;
  hasPhoto: boolean;
  issues: readonly { severity: "error" | "warning" }[];
};

/** URL value ↔ package tier (`?paket=`). */
export const MODEL_PACKAGE_PARAM: Record<string, FairPackageTier> = { "za-sve": "included", starter: "starter", napredni: "advanced" };
/** URL value ↔ model status (`?status=`). */
export const MODEL_STATUS_PARAM: Record<string, FairModelStatus> = { nacrt: "draft", objavljen: "published", povucen: "withdrawn" };
export const MODEL_PROBLEM_VALUES = ["greske", "upozorenja", "bez"] as const;
export type ModelProblemKind = (typeof MODEL_PROBLEM_VALUES)[number];

/** Facets besides the hierarchy and search, in the order of the filter bar. */
export const MODEL_FACETS = ["paket", "status", "problemi", "qr", "foto"] as const;
export type ModelFacet = (typeof MODEL_FACETS)[number];
export const MODEL_FACET_VALUES: Record<ModelFacet, readonly string[]> = {
  paket: Object.keys(MODEL_PACKAGE_PARAM),
  status: Object.keys(MODEL_STATUS_PARAM),
  problemi: MODEL_PROBLEM_VALUES,
  qr: ["ima", "nema"],
  foto: ["ima", "nema"],
};

/** Every key the Modeli list reads; the detail keeps them for "Nazad na listu" and prethodni / sledeći. */
export const MODEL_FILTER_KEYS = ["izlagac", "brend", "model", "q", ...MODEL_FACETS] as const satisfies readonly AdminQueryKey[];
export const MODEL_LIST_KEYS = [...MODEL_FILTER_KEYS, "prikaz"] as const satisfies readonly AdminQueryKey[];

/** greske = at least one error; upozorenja = only warnings; bez = nothing to fix. */
export function modelProblemKind(model: Pick<FilterableModel, "issues">): ModelProblemKind {
  if (model.issues.some((issue) => issue.severity === "error")) return "greske";
  return model.issues.length ? "upozorenja" : "bez";
}

export function modelSearchText(model: FilterableModel): string {
  return normalizeSearch([model.displayName, model.variant, model.externalKey, model.qrCode, model.qrSmq, model.brandName].filter(Boolean).join(" "));
}

function facetValue(model: FilterableModel, facet: ModelFacet): string {
  switch (facet) {
    case "paket": return Object.keys(MODEL_PACKAGE_PARAM).find((key) => MODEL_PACKAGE_PARAM[key] === model.tier)!;
    case "status": return Object.keys(MODEL_STATUS_PARAM).find((key) => MODEL_STATUS_PARAM[key] === model.status)!;
    case "problemi": return modelProblemKind(model);
    case "qr": return model.qrCode ? "ima" : "nema";
    case "foto": return model.hasPhoto ? "ima" : "nema";
  }
}

type Skip = "hierarchy" | ModelFacet;

/** One model against the query; `skip` leaves one filter out (for the counts next to its options). */
export function matchesModelFilters(model: FilterableModel, query: AdminQueryState, skip?: Skip): boolean {
  if (skip !== "hierarchy") {
    if (query.izlagac && model.participationId !== query.izlagac) return false;
    if (query.brend && model.brandId !== query.brend) return false;
    if (query.model && model.id !== query.model) return false;
  }
  for (const facet of MODEL_FACETS) {
    const wanted = query[facet];
    if (facet !== skip && wanted && MODEL_FACET_VALUES[facet].includes(wanted) && facetValue(model, facet) !== wanted) return false;
  }
  return !query.q || matchesSearch(modelSearchText(model), query.q);
}

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

/** Izlagač → brend → model → varijanta; the order of the list, its groups and prethodni / sledeći. */
export function compareModels(a: FilterableModel, b: FilterableModel): number {
  return collator.compare(a.exhibitorName, b.exhibitorName)
    || collator.compare(a.brandName, b.brandName)
    || collator.compare(a.displayName, b.displayName)
    || collator.compare(a.variant ?? "", b.variant ?? "")
    || collator.compare(a.id, b.id);
}

export function applyModelFilters<T extends FilterableModel>(models: readonly T[], query: AdminQueryState): T[] {
  return models.filter((model) => matchesModelFilters(model, query)).sort(compareModels);
}

/** For each facet option: how many models it would show together with the other active filters. */
export function modelFacetCounts(models: readonly FilterableModel[], query: AdminQueryState): Record<ModelFacet, Record<string, number>> {
  const result = {} as Record<ModelFacet, Record<string, number>>;
  for (const facet of MODEL_FACETS) {
    const counts: Record<string, number> = Object.fromEntries(MODEL_FACET_VALUES[facet].map((value) => [value, 0]));
    for (const model of models) if (matchesModelFilters(model, query, facet)) counts[facetValue(model, facet)] += 1;
    result[facet] = counts;
  }
  return result;
}

/** Ids of the models that pass every filter except the hierarchy: the numbers next to izlagač / brend. */
export function hierarchyCountedIds(models: readonly FilterableModel[], query: AdminQueryState): Set<string> {
  return new Set(models.filter((model) => matchesModelFilters(model, query, "hierarchy")).map((model) => model.id));
}

export function modelHierarchy(models: readonly FilterableModel[], modelLabel: (model: FilterableModel) => string): HierarchyData {
  return buildHierarchy(models.map((model) => ({
    id: model.id,
    label: modelLabel(model),
    sublabel: `${model.brandName} · ${model.exhibitorName}`,
    exhibitorId: model.participationId,
    exhibitorLabel: model.exhibitorName,
    brandId: model.brandId,
    brandLabel: model.brandName,
    searchTerms: [model.externalKey, model.qrCode, model.qrSmq],
  })));
}

export type ModelGroup = { key: string; exhibitorName: string; brandName: string; count: number };

/** Exhibitor · brand groups of an already ordered list; null when one group would only repeat what the filter says. */
export function modelGroups(models: readonly FilterableModel[]): ModelGroup[] | null {
  const groups: ModelGroup[] = [];
  for (const model of models) {
    const key = modelGroupKey(model);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.count += 1;
    else groups.push({ key, exhibitorName: model.exhibitorName, brandName: model.brandName, count: 1 });
  }
  return groups.length > 1 ? groups : null;
}

export function modelGroupKey(model: Pick<FilterableModel, "participationId" | "brandId">): string {
  return `${model.participationId}:${model.brandId}`;
}

/** Position of a model in the filtered list and its neighbours (detail navigation). */
export function adjacentModels<T extends { id: string }>(list: readonly T[], id: string) {
  const index = list.findIndex((model) => model.id === id);
  if (index < 0) return { index: -1, total: list.length, previous: null, next: null };
  return { index, total: list.length, previous: list[index - 1] ?? null, next: list[index + 1] ?? null };
}

/** The list keys of a query (filters + prikaz): what the detail links carry back to the list. */
export function modelListQuery(query: AdminQueryState): AdminQueryState {
  return Object.fromEntries(MODEL_LIST_KEYS.flatMap((key) => (query[key] ? [[key, query[key]]] : []))) as AdminQueryState;
}

export function activeModelFilters(query: AdminQueryState): (typeof MODEL_FILTER_KEYS)[number][] {
  return MODEL_FILTER_KEYS.filter((key) => Boolean(query[key]));
}

/** "Očisti": removes every filter, keeps `prikaz`. */
export function clearModelFiltersPatch(): AdminQueryPatch {
  return Object.fromEntries(MODEL_FILTER_KEYS.map((key) => [key, null]));
}
