// Admin UX A4 — filters of the `qr` section (query keys from A0 §2.3): the
// Izlagač → Brend → Model hierarchy of the model a code leads to, the state of
// the code (slobodan / ovaj događaj / drugi događaj / neaktivan) and a search
// by SMQ, resolver code or model. Izlagači 2026: also by the printed label of
// the sticker (`SA26-001`), which orders the list. Pure; shared by the admin
// container, the dev preview and the tests.

import { FAIR_QR_LABEL_DEFAULT_FORMAT, normalizeFairQrLabel, type FairQrLabelFormat } from "../fair-qr-label";
import { matchesSearch, normalizeSearch } from "./hierarchy";
import type { FilterableModel } from "./model-filters";
import type { AdminQueryKey, AdminQueryPatch, AdminQueryState } from "./query-state";

export const QR_STATES = ["slobodan", "ovaj", "drugi", "neaktivan"] as const;
export type QrStateKey = (typeof QR_STATES)[number];

export type FilterableQrRow = {
  cardId: string;
  resolverCode: string;
  /** cards.label — the printed label (`SA26-001`); a card without one carries its resolver code. */
  label?: string | null;
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

/** The printed label of a code (`SA26-001`, `PANEL-2026-EVENT`); null when the card has only its resolver code. */
export function qrPrintedLabel(row: Pick<FilterableQrRow, "label" | "resolverCode">): string | null {
  const label = row.label?.trim();
  return label && label.toUpperCase() !== row.resolverCode.toUpperCase() ? label : null;
}

function qrSearchText(row: FilterableQrRow, model: Pick<FilterableModel, "displayName" | "variant" | "brandName" | "exhibitorName" | "externalKey"> | null) {
  return normalizeSearch([qrPrintedLabel(row), row.smqCode, row.resolverCode, model?.displayName, model?.variant, model?.brandName, model?.exhibitorName, model?.externalKey].filter(Boolean).join(" "));
}

type Skip = "hierarchy" | "stanje";

/**
 * N1: a search that is a sticker number (`7`, `sa26 7`, `SA26_007`,
 * normalizeFairQrLabel) finds exactly that printed sticker; any other text
 * searches SMQ, resolver code, label and model as before.
 */
function matchesQrSearch(row: FilterableQrRow, model: Parameters<typeof qrSearchText>[1], q: string | undefined): boolean {
  if (!q) return true;
  const sticker = normalizeFairQrLabel(q, FAIR_QR_LABEL_DEFAULT_FORMAT);
  if (sticker) return qrPrintedLabel(row)?.toUpperCase() === sticker;
  return matchesSearch(qrSearchText(row, model), q);
}

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
  return matchesQrSearch(row, model, query.q);
}

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });
/** A sticker serial: a prefix and a number (`SA26-001`), not a named panel (`PANEL-2026-EVENT`). */
const SERIAL_LABEL = /^[A-Z][A-Z0-9]{1,9}-\d{1,4}$/i;

function labelRank(label: string | null) {
  return label === null ? 2 : SERIAL_LABEL.test(label) ? 0 : 1;
}

/**
 * Print order: sticker serials (`SA26-001` … `SA26-100`, numeric), then the
 * other labels (panels), then codes without a label in SMQ serial order
 * (the order of the printed sheets) and, without SMQ, by resolver code.
 */
export function compareQrRows(a: FilterableQrRow, b: FilterableQrRow): number {
  const labelA = qrPrintedLabel(a);
  const labelB = qrPrintedLabel(b);
  const rank = labelRank(labelA) - labelRank(labelB);
  if (rank) return rank;
  if (labelA && labelB) return collator.compare(labelA, labelB) || collator.compare(a.resolverCode, b.resolverCode);
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
 * upper case, I/L → 1, O → 0, 8 characters), an SMQ serial or a sticker
 * serial (`SA26-001`; N1: also `7`, `sa26 7`, `SA26_007` → `SA26-007` in the
 * inventory's series, normalizeFairQrLabel); null when it is not a whole
 * code. Such a search offers "Otvori detalj", which finds the code in the
 * whole inventory, also when it is not among the loaded rows.
 */
export function qrCodeFromSearch(text: string | undefined, format: FairQrLabelFormat = FAIR_QR_LABEL_DEFAULT_FORMAT): string | null {
  const value = (text ?? "").trim().toUpperCase();
  if (/^SMQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value)) return value;
  const sticker = normalizeFairQrLabel(value, format);
  if (sticker) return sticker;
  if (SERIAL_LABEL.test(value)) return value;
  const mapped = value.replace(/[IL]/g, "1").replace(/O/g, "0");
  if (mapped.length !== 8 || [...mapped].some((char) => !RESOLVER_ALPHABET.includes(char))) return null;
  return mapped;
}
