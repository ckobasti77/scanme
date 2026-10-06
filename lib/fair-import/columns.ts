// Admin UX A5 — which column of a pasted catalog table is which import field.
// Headers are recognised by Serbian and English synonyms, regardless of case,
// diacritics and punctuation ("Izlagač" = "izlagac" = "EXHIBITOR"); every
// mapping can be corrected by hand. Specifications are ordered label–value
// pairs (MASTER §4.5): either one column per specification ("Spec: Snaga",
// the label comes from the header) or column pairs ("Spec 1 naziv" +
// "Spec 1 vrednost"). Pure; the synonyms are data, the UI text is in i18n.

export const IMPORT_FIELDS = [
  "exhibitor",
  "smk",
  "sml",
  "participationKey",
  "reportEmail",
  "contactEmail",
  "brand",
  "standCode",
  "standName",
  "mapLocationId",
  "model",
  "variant",
  "modelKey",
  "slug",
  "price",
  "package",
  "packageFrom",
  "qr",
  "photoUrl",
  "passport",
  "sortOrder",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ColumnTarget =
  | { kind: "ignore" }
  | { kind: "field"; field: ImportField }
  /** One column per specification; the label is the header without its "Spec:" prefix. */
  | { kind: "spec"; label: string }
  | { kind: "specLabel"; pair: number }
  | { kind: "specValue"; pair: number };

/** Lower case, no diacritics (đ → dj), every run of other characters → one space. */
export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Synonyms in normalized form (see normalizeHeader). A header matches only as a whole. */
export const IMPORT_FIELD_SYNONYMS: Record<ImportField, readonly string[]> = {
  exhibitor: ["izlagac", "exhibitor", "exhibitor name", "naziv izlagaca", "firma", "kompanija", "company", "diler", "dealer", "uvoznik", "importer"],
  smk: ["smk", "smk kod", "kod naloga", "account external key", "account code"],
  sml: ["sml", "sml kod", "kod lokala", "business external key", "business code"],
  participationKey: ["kljuc ucesca", "ucesce", "participation external key", "participation key"],
  reportEmail: ["email za izvestaje", "izvestaji email", "report email", "reports email"],
  contactEmail: ["kontakt email", "email kontakta", "primary contact email", "contact email"],
  brand: ["brend", "brand", "marka", "proizvodjac", "manufacturer", "make", "brand name", "naziv brenda"],
  standCode: ["stand", "kod standa", "broj standa", "oznaka standa", "stand code", "stand number", "booth"],
  standName: ["naziv standa", "stand name", "stand display name", "booth name"],
  mapLocationId: ["lokacija na mapi", "mapa", "map location", "map location id"],
  model: ["model", "naziv modela", "model name", "display name", "naziv", "vozilo", "automobil", "vehicle", "car"],
  variant: ["varijanta", "verzija", "variant", "version", "trim", "izvedba"],
  modelKey: ["kljuc modela", "sifra modela", "model external key", "model key", "external key", "externalkey"],
  slug: ["slug", "url slug"],
  price: ["cena", "price", "price text", "cena rsd", "cena eur", "cena din", "cena od", "maloprodajna cena", "mp cena", "price rsd", "price eur"],
  package: ["paket", "package", "package tier", "tier", "nivo paketa", "scanme paket"],
  packageFrom: ["paket vazi od", "paket od", "vazi od", "aktivno od", "package active from", "active from"],
  qr: ["qr", "qr kod", "resolver kod", "resolver code", "kod nalepnice", "nalepnica", "qr code", "assigned resolver code"],
  photoUrl: ["fotografija", "foto", "slika", "url fotografije", "link fotografije", "photo", "photo url", "photo source", "image", "image url"],
  passport: ["pasos", "pasos brenda", "kandidat za pasos", "passport", "passport eligible"],
  sortOrder: ["redosled", "poredak", "sort order", "sort"],
};

const SPEC_PREFIXES = new Set(["spec", "specs", "specifikacija", "specifikacije", "specification", "specifications", "tehnicki podatak", "tehnicki podaci", "karakteristika"]);
const PAIR_LABEL = /^(?:spec|specifikacija|specification|karakteristika|osobina)\s*(\d{1,2})(?:\s+(?:naziv|label|name|ime))?$/;
const PAIR_VALUE = /^(?:(?:spec|specifikacija|specification|karakteristika|osobina)\s*(\d{1,2})\s+(?:vrednost|value)|(?:vrednost|value)\s*(\d{1,2}))$/;

const BY_SYNONYM = new Map<string, ImportField>(
  IMPORT_FIELDS.flatMap((field) => IMPORT_FIELD_SYNONYMS[field].map((synonym) => [synonym, field] as const)),
);

/** "Spec: Snaga (kW)" → "Snaga (kW)"; null when the header has no specification prefix. */
export function specLabelFromHeader(header: string): string | null {
  const match = header.match(/^([^:–—-]+)[:–—-]\s*(.+)$/);
  if (!match || !SPEC_PREFIXES.has(normalizeHeader(match[1]))) return null;
  return match[2].trim() || null;
}

/** The target of one header on its own (without looking at the other columns). */
export function detectColumn(header: string): ColumnTarget {
  const specLabel = specLabelFromHeader(header);
  if (specLabel) return { kind: "spec", label: specLabel };
  const normalized = normalizeHeader(header);
  if (!normalized) return { kind: "ignore" };
  const field = BY_SYNONYM.get(normalized);
  if (field) return { kind: "field", field };
  const label = normalized.match(PAIR_LABEL);
  if (label) return { kind: "specLabel", pair: Number(label[1]) };
  const value = normalized.match(PAIR_VALUE);
  if (value) return { kind: "specValue", pair: Number(value[1] ?? value[2]) };
  return { kind: "ignore" };
}

/** Every header's target; a field already taken by an earlier column is not mapped twice. */
export function detectColumns(headers: readonly string[]): ColumnTarget[] {
  const taken = new Set<string>();
  return headers.map((header) => {
    const target = detectColumn(header);
    const key = targetKey(target);
    if (target.kind !== "ignore" && target.kind !== "spec") {
      if (taken.has(key)) return { kind: "ignore" };
      taken.add(key);
    }
    return target;
  });
}

/** Stable string form of a target (the value of the mapping `<select>`). "spec" keeps no label — it comes from the header. */
export function targetKey(target: ColumnTarget): string {
  switch (target.kind) {
    case "ignore": return "ignore";
    case "field": return `field:${target.field}`;
    case "spec": return "spec";
    case "specLabel": return `spec-label:${target.pair}`;
    case "specValue": return `spec-value:${target.pair}`;
  }
}

export const IMPORT_SPEC_PAIRS_MAX = 20;

/** The `<select>` value back to a target; `header` gives the label of a "spec" column. Unknown → ignore. */
export function parseTargetKey(key: string, header: string): ColumnTarget {
  if (key === "spec") return { kind: "spec", label: specLabelFromHeader(header) ?? header.trim() };
  const [kind, rest] = key.split(":");
  if (kind === "field" && (IMPORT_FIELDS as readonly string[]).includes(rest)) return { kind: "field", field: rest as ImportField };
  const pair = Number(rest);
  if (Number.isInteger(pair) && pair >= 1 && pair <= IMPORT_SPEC_PAIRS_MAX) {
    if (kind === "spec-label") return { kind: "specLabel", pair };
    if (kind === "spec-value") return { kind: "specValue", pair };
  }
  return { kind: "ignore" };
}

export type MappingProblems = {
  /** Without a model name column no row can be imported. */
  modelMissing: boolean;
  /** Fields mapped from more than one column (only the first is used). */
  duplicateFields: ImportField[];
  /** Specification pairs that have only a label or only a value column. */
  incompletePairs: number[];
  /** A "spec" column whose header gives no label. */
  unlabeledSpecColumns: number[];
};

export function mappingProblems(targets: readonly ColumnTarget[], headers: readonly string[]): MappingProblems {
  const fields = targets.flatMap((target) => (target.kind === "field" ? [target.field] : []));
  const labels = new Set(targets.flatMap((target) => (target.kind === "specLabel" ? [target.pair] : [])));
  const values = new Set(targets.flatMap((target) => (target.kind === "specValue" ? [target.pair] : [])));
  return {
    modelMissing: !fields.includes("model"),
    duplicateFields: [...new Set(fields.filter((field, index) => fields.indexOf(field) !== index))],
    incompletePairs: [...new Set([...labels, ...values])].filter((pair) => !labels.has(pair) || !values.has(pair)).sort((a, b) => a - b),
    unlabeledSpecColumns: targets.flatMap((target, index) => (target.kind === "spec" && !target.label.trim() && !headers[index]?.trim() ? [index] : [])),
  };
}

export function hasBlockingMappingProblem(problems: MappingProblems): boolean {
  return problems.modelMissing || problems.duplicateFields.length > 0 || problems.incompletePairs.length > 0 || problems.unlabeledSpecColumns.length > 0;
}
