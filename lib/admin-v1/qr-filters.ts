// Admin UX A4 — filters of the `qr` section (query keys from A0 §2.3): the
// Izlagač → Brend → Model hierarchy of the model a code leads to, the state of
// the code (slobodan / ovaj događaj / drugi događaj / neaktivan) and a search
// by SMQ, resolver code or model. Pure; shared by the admin container, the
// dev preview and the tests.

import { matchesSearch, normalizeSearch } from "./hierarchy";
import type { FilterableModel } from "./model-filters";
import type { AdminQueryKey, AdminQueryPatch, AdminQueryState } from "./query-state";

export const QR_STATES = ["slobodan", "ovaj", "drugi", "neaktivan"] as const;
export type QrStateKey = (typeof QR_STATES)[number];

export type FilterableQrRow = {
  cardId: string;
  resolverCode: string;
  smqCode: string | null;
  state: "active" | "inactive" | "problem" | null;
  problemReason: string | null;
  assignment: { modelId: string; sameEvent: boolean } | null;
};

/**
 * slobodan = no assignment and nothing wrong except the missing destination;
 * ovaj / drugi = active assignment in this / the other event; neaktivan = no
 * assignment and the code is out of service (redirect off, manual problem,
 * damaged sticker, broken mapping…).
 */
export function qrStateOf(row: Pick<FilterableQrRow, "state" | "problemReason" | "assignment">): QrStateKey {
  if (row.assignment) return row.assignment.sameEvent ? "ovaj" : "drugi";
  if (row.state === "inactive") return "neaktivan";
  if (row.state === "problem" && row.problemReason && !row.problemReason.startsWith("destination_")) return "neaktivan";
  return "slobodan";
}

/** The model of this event the code leads to (null for a free code or one of the other event). */
export function qrRowModel<M extends { id: string }>(row: Pick<FilterableQrRow, "assignment">, modelsById: ReadonlyMap<string, M>): M | null {
  return row.assignment?.sameEvent ? modelsById.get(row.assignment.modelId) ?? null : null;
}

function qrSearchText(row: FilterableQrRow, model: Pick<FilterableModel, "displayName" | "variant" | "brandName" | "exhibitorName" | "externalKey"> | null) {
  return normalizeSearch([row.smqCode, row.resolverCode, model?.displayName, model?.variant, model?.brandName, model?.exhibitorName, model?.externalKey].filter(Boolean).join(" "));
}

type Skip = "hierarchy" | "stanje";

export function matchesQrFilters(
  row: FilterableQrRow,
  model: Pick<FilterableModel, "id" | "participationId" | "brandId" | "displayName" | "variant" | "brandName" | "exhibitorName" | "externalKey"> | null,
  query: AdminQueryState,
  skip?: Skip,
): boolean {
  if (skip !== "hierarchy" && (query.izlagac || query.brend || query.model)) {
    if (!model) return false;
    if (query.izlagac && model.participationId !== query.izlagac) return false;
    if (query.brend && model.brandId !== query.brend) return false;
    if (query.model && model.id !== query.model) return false;
  }
  if (skip !== "stanje" && query.stanje && (QR_STATES as readonly string[]).includes(query.stanje) && qrStateOf(row) !== query.stanje) return false;
  return !query.q || matchesSearch(qrSearchText(row, model), query.q);
}

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

/** SMQ serial order (the order of the printed sheets); codes without SMQ after, by resolver code. */
export function compareQrRows(a: FilterableQrRow, b: FilterableQrRow): number {
  if (a.smqCode && !b.smqCode) return -1;
  if (!a.smqCode && b.smqCode) return 1;
  return collator.compare(a.smqCode ?? "", b.smqCode ?? "") || collator.compare(a.resolverCode, b.resolverCode);
}

type QrModel = NonNullable<Parameters<typeof matchesQrFilters>[1]>;

export function applyQrFilters<R extends FilterableQrRow>(rows: readonly R[], modelsById: ReadonlyMap<string, QrModel>, query: AdminQueryState): R[] {
  return rows.filter((row) => matchesQrFilters(row, qrRowModel(row, modelsById), query)).sort(compareQrRows);
}

/** For each state: how many codes it would show together with the other active filters. */
export function qrStateCounts(rows: readonly FilterableQrRow[], modelsById: ReadonlyMap<string, QrModel>, query: AdminQueryState): Record<QrStateKey, number> {
  const counts = Object.fromEntries(QR_STATES.map((state) => [state, 0])) as Record<QrStateKey, number>;
  for (const row of rows) if (matchesQrFilters(row, qrRowModel(row, modelsById), query, "stanje")) counts[qrStateOf(row)] += 1;
  return counts;
}

/** Ids of the models whose code passes every filter except the hierarchy: the numbers next to izlagač / brend. */
export function qrHierarchyCountedIds(rows: readonly FilterableQrRow[], modelsById: ReadonlyMap<string, QrModel>, query: AdminQueryState): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const model = qrRowModel(row, modelsById);
    if (model && matchesQrFilters(row, model, query, "hierarchy")) ids.add(model.id);
  }
  return ids;
}

/** Every key the QR list reads; the detail keeps them for "Nazad na listu". */
export const QR_FILTER_KEYS = ["izlagac", "brend", "model", "stanje", "q"] as const satisfies readonly AdminQueryKey[];
export const QR_LIST_KEYS = [...QR_FILTER_KEYS, "prikaz"] as const satisfies readonly AdminQueryKey[];

export function qrListQuery(query: AdminQueryState): AdminQueryState {
  return Object.fromEntries(QR_LIST_KEYS.flatMap((key) => (query[key] ? [[key, query[key]]] : []))) as AdminQueryState;
}

/** "Očisti": removes every filter, keeps `prikaz`. */
export function clearQrFiltersPatch(): AdminQueryPatch {
  return Object.fromEntries(QR_FILTER_KEYS.map((key) => [key, null]));
}

const RESOLVER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * The search text as a printed code (same normalization as the resolver:
 * upper case, I/L → 1, O → 0, 8 characters) or an SMQ serial; null when it is
 * not a whole code. Such a search offers "Otvori detalj", which finds the code
 * in the whole inventory, also when it is not among the loaded rows.
 */
export function qrCodeFromSearch(text: string | undefined): string | null {
  const value = (text ?? "").trim().toUpperCase();
  if (/^SMQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value)) return value;
  const mapped = value.replace(/[IL]/g, "1").replace(/O/g, "0");
  if (mapped.length !== 8 || [...mapped].some((char) => !RESOLVER_ALPHABET.includes(char))) return null;
  return mapped;
}
