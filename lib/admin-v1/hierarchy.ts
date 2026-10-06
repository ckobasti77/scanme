// Admin UX A3 — the Izlagač → Brend → Model hierarchy behind
// AdminHierarchyPicker (Modeli; later QR, Interakcije, Leadovi). Pure: built
// from rows the screen already has (exhibitor = fairParticipations, brand =
// the model's brandId, model = fairEventModels), so no extra query.

export type HierarchyModel = {
  id: string;
  label: string;
  sublabel?: string;
  exhibitorId: string;
  brandId: string;
  /** normalizeSearch() of every text the model can be found by. */
  searchText: string;
  /** Shown and not selectable in `select` mode (e.g. "only Napredni"). */
  disabledReason?: string;
};

export type HierarchyData = {
  exhibitors: { id: string; label: string }[];
  /** One brand id can be shown by more than one participation of the same client. */
  brands: { id: string; label: string; exhibitorIds: string[] }[];
  models: HierarchyModel[];
};

export type HierarchyValue = { exhibitorId?: string; brandId?: string; modelId?: string };
export type HierarchyLevel = "exhibitor" | "brand" | "model";

export type HierarchySourceRow = {
  id: string;
  label: string;
  sublabel?: string;
  exhibitorId: string;
  exhibitorLabel: string;
  brandId: string;
  brandLabel: string;
  /** Extra texts for search (external key, QR codes…); the labels are always searchable. */
  searchTerms?: readonly (string | null | undefined)[];
  disabledReason?: string;
};

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });
const byLabel = (a: { label: string }, b: { label: string }) => collator.compare(a.label, b.label);

/** Lower case, no diacritics (đ → dj), single spaces: "Škoda Đ" → "skoda dj". */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word of the query appears in the (normalized) text. */
export function matchesSearch(searchText: string, query: string | undefined): boolean {
  const words = normalizeSearch(query ?? "").split(" ").filter(Boolean);
  return words.every((word) => searchText.includes(word));
}

export function buildHierarchy(rows: readonly HierarchySourceRow[]): HierarchyData {
  const exhibitors = new Map<string, { id: string; label: string }>();
  const brands = new Map<string, { id: string; label: string; exhibitorIds: string[] }>();
  const models: HierarchyModel[] = [];
  for (const row of rows) {
    if (!exhibitors.has(row.exhibitorId)) exhibitors.set(row.exhibitorId, { id: row.exhibitorId, label: row.exhibitorLabel });
    const brand = brands.get(row.brandId) ?? { id: row.brandId, label: row.brandLabel, exhibitorIds: [] };
    if (!brand.exhibitorIds.includes(row.exhibitorId)) brand.exhibitorIds.push(row.exhibitorId);
    brands.set(row.brandId, brand);
    models.push({
      id: row.id,
      label: row.label,
      ...(row.sublabel ? { sublabel: row.sublabel } : {}),
      exhibitorId: row.exhibitorId,
      brandId: row.brandId,
      searchText: normalizeSearch([row.label, row.sublabel, row.brandLabel, row.exhibitorLabel, ...(row.searchTerms ?? [])].filter(Boolean).join(" ")),
      ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
    });
  }
  const exhibitorOrder = new Map([...exhibitors.values()].sort(byLabel).map((row, index) => [row.id, index]));
  const brandOrder = new Map([...brands.values()].sort(byLabel).map((row, index) => [row.id, index]));
  return {
    exhibitors: [...exhibitors.values()].sort(byLabel),
    brands: [...brands.values()].sort(byLabel),
    models: models.sort((a, b) =>
      (exhibitorOrder.get(a.exhibitorId)! - exhibitorOrder.get(b.exhibitorId)!) || (brandOrder.get(a.brandId)! - brandOrder.get(b.brandId)!) || byLabel(a, b)),
  };
}

/** Drops ids that do not exist or contradict each other (a shared link from another event, a stale URL). */
export function sanitizeHierarchyValue(data: HierarchyData, value: HierarchyValue): HierarchyValue {
  const model = value.modelId ? data.models.find((row) => row.id === value.modelId) : undefined;
  if (model) return { exhibitorId: model.exhibitorId, brandId: model.brandId, modelId: model.id };
  const exhibitorId = value.exhibitorId && data.exhibitors.some((row) => row.id === value.exhibitorId) ? value.exhibitorId : undefined;
  const brand = value.brandId ? data.brands.find((row) => row.id === value.brandId) : undefined;
  if (!brand) return exhibitorId ? { exhibitorId } : {};
  if (exhibitorId && !brand.exhibitorIds.includes(exhibitorId)) return { exhibitorId };
  return { ...(exhibitorId ? { exhibitorId } : brand.exhibitorIds.length === 1 ? { exhibitorId: brand.exhibitorIds[0] } : {}), brandId: brand.id };
}

/**
 * The dependent filters: picking an exhibitor narrows brands and models (and
 * drops a brand/model of another exhibitor); picking a brand sets its
 * exhibitor; picking a model sets both. Clearing a level clears the levels
 * below it.
 */
export function changeHierarchy(data: HierarchyData, current: HierarchyValue, level: HierarchyLevel, id: string | undefined): HierarchyValue {
  const value = sanitizeHierarchyValue(data, current);
  if (level === "model") return id ? sanitizeHierarchyValue(data, { modelId: id }) : sanitizeHierarchyValue(data, { exhibitorId: value.exhibitorId, brandId: value.brandId });
  if (level === "brand") {
    if (!id) return value.exhibitorId ? { exhibitorId: value.exhibitorId } : {};
    const brand = data.brands.find((row) => row.id === id);
    if (!brand) return value;
    const exhibitorId = value.exhibitorId && brand.exhibitorIds.includes(value.exhibitorId) ? value.exhibitorId : undefined;
    const model = value.modelId ? data.models.find((row) => row.id === value.modelId && row.brandId === id) : undefined;
    return sanitizeHierarchyValue(data, { exhibitorId, brandId: id, modelId: model?.id });
  }
  if (!id) return {};
  const brandId = value.brandId && data.brands.find((row) => row.id === value.brandId)?.exhibitorIds.includes(id) ? value.brandId : undefined;
  const model = value.modelId ? data.models.find((row) => row.id === value.modelId && row.exhibitorId === id) : undefined;
  return sanitizeHierarchyValue(data, { exhibitorId: id, brandId, modelId: model?.id });
}

export type HierarchyOption = { id: string; label: string; count: number };

/**
 * Options of each level under the current choice, with the number of models
 * in `counted` (the models that pass the other filters) next to each.
 */
export function hierarchyOptions(data: HierarchyData, current: HierarchyValue, counted?: ReadonlySet<string>) {
  const value = sanitizeHierarchyValue(data, current);
  const counts = (keep: (model: HierarchyModel) => boolean) => data.models.filter((model) => keep(model) && (!counted || counted.has(model.id))).length;
  const inExhibitor = (model: HierarchyModel) => !value.exhibitorId || model.exhibitorId === value.exhibitorId;
  const exhibitors: HierarchyOption[] = data.exhibitors.map((row) => ({ ...row, count: counts((model) => model.exhibitorId === row.id) }));
  const brands: HierarchyOption[] = data.brands
    .filter((row) => !value.exhibitorId || row.exhibitorIds.includes(value.exhibitorId))
    .map((row) => ({ id: row.id, label: row.label, count: counts((model) => model.brandId === row.id && inExhibitor(model)) }));
  const models = data.models.filter((model) => inExhibitor(model) && (!value.brandId || model.brandId === value.brandId));
  return { value, exhibitors, brands, models };
}

/** Models of the picker list for a typed query (at most `limit`), and how many matched. */
export function searchHierarchyModels(models: readonly HierarchyModel[], query: string, limit = 50) {
  const matches = models.filter((model) => matchesSearch(model.searchText, query));
  return { shown: matches.slice(0, limit), total: matches.length };
}

/** Combobox keyboard: ↓/↑ wrap around, Home/End jump; -1 = nothing active. */
export function nextActiveIndex(current: number, key: string, length: number): number {
  if (length <= 0) return -1;
  switch (key) {
    case "ArrowDown": return current < 0 || current >= length - 1 ? 0 : current + 1;
    case "ArrowUp": return current <= 0 ? length - 1 : current - 1;
    case "Home": return 0;
    case "End": return length - 1;
    default: return current;
  }
}
