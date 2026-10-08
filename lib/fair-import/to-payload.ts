// Admin UX A5 — a pasted catalog table (parse.ts) + the column mapping
// (columns.ts) + defaults for what the exhibitor's table does not have →
// the existing import JSON v1 (FAIR-BACKEND-CONTRACT §12, unchanged). Pure:
// the backend `fairImport.dryRun` still checks everything; here only what
// the table itself makes impossible is reported, per row and column.
//
// Nothing is invented: an empty price stays empty (the backend writes the
// contract fallback "Cena na upit" with a warning), an empty passport cell is
// an error unless the admin picked a default (contract §12: empty must not
// become `false`), specifications are kept as ordered label–value pairs.

import type { FairImportPayload } from "@/convex/fairImport";
import { belgradeLocalToEpoch } from "@/lib/belgrade-time";
import { FAIR_EXTERNAL_KEY_PATTERN, FAIR_IMPORT_VERSION, type FairPackageTier } from "@/lib/fair-contract";
import { normalizeHeader, type ColumnTarget, type ImportField } from "./columns";
import type { ParsedImportRow } from "./parse";

export type { FairImportPayload };

/** What the event already has; existing rows are matched so a second import updates instead of duplicating. */
export type ImportCatalogContext = {
  eventCode: string;
  participations: { id: string; externalKey: string; exhibitorName: string; smkCode: string | null; smlCode: string | null }[];
  stands: { id: string; participationId: string; externalKey: string; code: string; displayName: string; mapLocationId: string }[];
  models: { externalKey: string; participationId: string; brandName: string; displayName: string; variant?: string }[];
};

/** Values for columns the table does not have (or leaves empty). */
export type ImportDefaults = {
  participationId?: string;
  brand?: string;
  standId?: string;
  tier?: FairPackageTier;
  /** ISO 8601 with zone, or a Belgrade wall clock (see parsePackageFrom). */
  packageFrom?: string;
  passport?: boolean;
};

export const IMPORT_ROW_ISSUE_CODES = [
  "IMPORT_MODEL_MISSING",
  "IMPORT_EXHIBITOR_MISSING",
  "IMPORT_EXHIBITOR_UNKNOWN",
  "IMPORT_EXHIBITOR_CODES_MISSING",
  "IMPORT_BRAND_MISSING",
  "IMPORT_STAND_MISSING",
  "IMPORT_STAND_LOCATION_MISSING",
  "IMPORT_PACKAGE_MISSING",
  "IMPORT_PACKAGE_INVALID",
  "IMPORT_PACKAGE_FROM_INVALID",
  "IMPORT_PASSPORT_MISSING",
  "IMPORT_PASSPORT_INVALID",
  "IMPORT_SORT_INVALID",
  "IMPORT_KEY_INVALID",
  "IMPORT_DUPLICATE_MODEL",
  "IMPORT_SPEC_LABEL_MISSING",
] as const;
export type ImportRowIssueCode = (typeof IMPORT_ROW_ISSUE_CODES)[number];

/** `field` = the import field (its column, or the default when the column is missing); "specifications" = the spec columns. */
export type ImportIssueField = ImportField | "specifications";

export type ImportRowIssue = {
  line: number;
  field: ImportIssueField | null;
  code: ImportRowIssueCode;
  /** error = the row is skipped; warning = the row is imported. */
  severity: "error" | "warning";
};

export type ImportPreviewRow = {
  line: number;
  skipped: boolean;
  exhibitor: string;
  brand: string;
  stand: string;
  model: string;
  variant: string;
  modelKey: string;
  price: string;
  tier: FairPackageTier | null;
  specifications: { label: string; value: string }[];
  qr: string;
  hasPhoto: boolean;
};

/** Where every model of the payload came from, for errors of the backend dry run. */
export type ImportTrace = {
  models: { path: string; line: number }[];
  brands: { path: string; line: number }[];
  participations: { path: string; line: number }[];
};

export type ImportBuild = {
  payload: FairImportPayload;
  rows: ImportPreviewRow[];
  issues: ImportRowIssue[];
  /** Rows not in the payload (an error above). */
  skipped: number;
  trace: ImportTrace;
};

const TIERS: Record<string, FairPackageTier> = {
  "za sve": "included",
  "za sve izlagace": "included",
  osnovni: "included",
  besplatno: "included",
  partnerstvo: "included",
  included: "included",
  free: "included",
  starter: "starter",
  start: "starter",
  napredni: "advanced",
  napredno: "advanced",
  advanced: "advanced",
};

const YES = new Set(["da", "yes", "true", "1", "x", "d", "y"]);
const NO = new Set(["ne", "no", "false", "0", "n"]);

export function parseTier(value: string): FairPackageTier | null {
  return TIERS[normalizeHeader(value)] ?? null;
}

export function parseYesNo(value: string): boolean | null {
  const text = normalizeHeader(value);
  if (YES.has(text) || value.trim() === "✓") return true;
  if (NO.has(text)) return false;
  return null;
}

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/;
const SR_LOCAL = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?(?:\s+(\d{1,2}):(\d{2}))?$/;

/**
 * "Paket važi od": ISO 8601 with zone is kept; a Belgrade wall clock
 * ("9.10.2026. 09:00", "2026-10-09 09:00", a date alone = 00:00) becomes ISO
 * UTC. null = not a date.
 */
export function parsePackageFrom(value: string): string | null {
  const text = value.trim();
  if (ISO_WITH_ZONE.test(text)) return text;
  const iso = text.match(ISO_LOCAL);
  const sr = text.match(SR_LOCAL);
  const parts = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5]] : sr ? [sr[3], sr[2], sr[1], sr[4], sr[5]] : null;
  if (!parts) return null;
  const [year, month, day, hour = "0", minute = "00"] = parts;
  const local = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}`;
  const epoch = belgradeLocalToEpoch(local);
  if (epoch === null || Number.isNaN(epoch)) return null;
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return null;
  return new Date(epoch).toISOString();
}

/** Same rule as the backend slug (convex/lib/fairCatalog.fairSlugify), used for keys. */
export function importSlug(value: string): string {
  return value
    .replace(/[đĐ]/g, "dj")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function joinKey(...parts: string[]): string {
  return parts.map(importSlug).filter(Boolean).join("-").slice(0, 160).replace(/-+$/g, "");
}

const sameText = (a: string, b: string) => normalizeHeader(a) === normalizeHeader(b);
const upper = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();

type Cells = {
  value: (field: ImportField) => string;
  specifications: { label: string; value: string }[];
  specLabelMissing: boolean;
};

function readRow(row: ParsedImportRow, targets: readonly ColumnTarget[]): Cells {
  const fieldIndex = new Map<ImportField, number>();
  targets.forEach((target, index) => {
    if (target.kind === "field" && !fieldIndex.has(target.field)) fieldIndex.set(target.field, index);
  });
  // Specifications in column order; a pair sits where its first column is.
  const entries: { position: number; label: string; value: string }[] = [];
  const pairs = new Map<number, { position: number; label: string; value: string }>();
  let specLabelMissing = false;
  targets.forEach((target, index) => {
    const cell = row.cells[index] ?? "";
    if (target.kind === "spec") entries.push({ position: index, label: target.label.trim(), value: cell });
    if (target.kind === "specLabel" || target.kind === "specValue") {
      const pair = pairs.get(target.pair) ?? { position: index, label: "", value: "" };
      if (target.kind === "specLabel") pair.label = cell;
      else pair.value = cell;
      pairs.set(target.pair, pair);
    }
  });
  entries.push(...pairs.values());
  const specifications = entries
    .sort((a, b) => a.position - b.position)
    .filter((entry) => {
      if (entry.value && !entry.label) specLabelMissing = true;
      return entry.value && entry.label;
    })
    .map(({ label, value }) => ({ label, value }));
  return {
    value: (field) => {
      const index = fieldIndex.get(field);
      return index === undefined ? "" : (row.cells[index] ?? "").trim();
    },
    specifications,
    specLabelMissing,
  };
}

type Participation = FairImportPayload["participations"][number];
type Brand = Participation["brands"][number];
type Model = Brand["models"][number];

type ParticipationGroup = { key: string; line: number; data: Omit<Participation, "brands">; brands: BrandGroup[] };
type BrandGroup = { name: string; standKey: string; standCode: string; line: number; stand: Brand["stand"]; models: { line: number; model: Model }[] };

export function buildImportPayload(
  rows: readonly ParsedImportRow[],
  targets: readonly ColumnTarget[],
  context: ImportCatalogContext,
  defaults: ImportDefaults = {},
): ImportBuild {
  const issues: ImportRowIssue[] = [];
  const preview: ImportPreviewRow[] = [];
  const groups: ParticipationGroup[] = [];
  const modelKeys = new Set<string>();
  const defaultParticipation = context.participations.find((row) => row.id === defaults.participationId) ?? null;
  const defaultStand = context.stands.find((row) => row.id === defaults.standId) ?? null;

  for (const row of rows) {
    const cells = readRow(row, targets);
    const rowIssues: ImportRowIssue[] = [];
    const fail = (field: ImportIssueField | null, code: ImportRowIssueCode) => rowIssues.push({ line: row.line, field, code, severity: "error" });

    const modelName = cells.value("model");
    const variant = cells.value("variant");
    if (!modelName) fail("model", "IMPORT_MODEL_MISSING");

    // Exhibitor: SMK/SML codes, else the name of a participation of this event, else the default.
    const smk = upper(cells.value("smk"));
    const sml = upper(cells.value("sml"));
    const exhibitorName = cells.value("exhibitor");
    let participation: { externalKey: string; smk: string; sml: string; name: string; id: string | null } | null = null;
    if (smk || sml) {
      const existing = context.participations.find((row) => (smk && upper(row.smkCode) === smk) || (sml && upper(row.smlCode) === sml));
      if (existing) participation = { externalKey: existing.externalKey, smk: upper(existing.smkCode), sml: upper(existing.smlCode), name: existing.exhibitorName, id: existing.id };
      else if (smk && sml) participation = { externalKey: cells.value("participationKey") || joinKey(context.eventCode, exhibitorName || sml), smk, sml, name: exhibitorName || sml, id: null };
      else fail(smk ? "sml" : "smk", "IMPORT_EXHIBITOR_CODES_MISSING");
    } else if (exhibitorName) {
      const existing = context.participations.find((row) => sameText(row.exhibitorName, exhibitorName));
      if (existing) participation = { externalKey: existing.externalKey, smk: upper(existing.smkCode), sml: upper(existing.smlCode), name: existing.exhibitorName, id: existing.id };
      else fail("exhibitor", "IMPORT_EXHIBITOR_UNKNOWN");
    } else if (defaultParticipation) {
      participation = { externalKey: defaultParticipation.externalKey, smk: upper(defaultParticipation.smkCode), sml: upper(defaultParticipation.smlCode), name: defaultParticipation.exhibitorName, id: defaultParticipation.id };
    } else {
      fail("exhibitor", "IMPORT_EXHIBITOR_MISSING");
    }
    if (participation && (!participation.smk || !participation.sml)) {
      fail(participation.smk ? "sml" : "smk", "IMPORT_EXHIBITOR_CODES_MISSING");
      participation = null;
    }
    if (participation && !FAIR_EXTERNAL_KEY_PATTERN.test(participation.externalKey)) fail("participationKey", "IMPORT_KEY_INVALID");

    const brandName = cells.value("brand") || defaults.brand?.trim() || "";
    if (!brandName) fail("brand", "IMPORT_BRAND_MISSING");

    // Stand: a code of a stand this exhibitor already has (keeps its key and
    // map place), or a new stand with its map location; else the default
    // stand. N3: exhibitors share stand codes ("2" holds six of them), so a
    // code of another exhibitor's stand gives this exhibitor its own stand on
    // the same location, never the other exhibitor's row.
    const standCode = cells.value("standCode");
    let stand: Brand["stand"] | null = null;
    if (standCode) {
      const candidates = context.stands.filter((row) => upper(row.code) === upper(standCode));
      const existing = participation ? candidates.find((row) => row.participationId === participation?.id) : candidates[0];
      const shared = existing ? undefined : candidates[0];
      const standName = cells.value("standName");
      const mapLocationId = cells.value("mapLocationId") || existing?.mapLocationId || shared?.mapLocationId || "";
      if (existing) stand = { externalKey: existing.externalKey, code: existing.code, displayName: standName || existing.displayName, mapLocationId };
      else if (shared && participation) stand = { externalKey: joinKey(participation.externalKey, "stand", standCode), code: shared.code, ...(standName ? { displayName: standName } : {}), mapLocationId };
      else if (mapLocationId) stand = { externalKey: joinKey(context.eventCode, "stand", standCode), code: standCode, ...(standName ? { displayName: standName } : {}), mapLocationId };
      else fail("mapLocationId", "IMPORT_STAND_LOCATION_MISSING");
    } else if (defaultStand) {
      stand = { externalKey: defaultStand.externalKey, code: defaultStand.code, displayName: defaultStand.displayName, mapLocationId: defaultStand.mapLocationId };
    } else {
      fail("standCode", "IMPORT_STAND_MISSING");
    }

    const tierCell = cells.value("package");
    const tier = tierCell ? parseTier(tierCell) : defaults.tier ?? null;
    if (tierCell && !tier) fail("package", "IMPORT_PACKAGE_INVALID");
    else if (!tier) fail("package", "IMPORT_PACKAGE_MISSING");

    const fromCell = cells.value("packageFrom") || defaults.packageFrom?.trim() || "";
    const packageActiveFrom = fromCell ? parsePackageFrom(fromCell) : null;
    if (fromCell && !packageActiveFrom) fail("packageFrom", "IMPORT_PACKAGE_FROM_INVALID");

    const passportCell = cells.value("passport");
    const passport = passportCell ? parseYesNo(passportCell) : defaults.passport ?? null;
    if (passportCell && passport === null) fail("passport", "IMPORT_PASSPORT_INVALID");
    else if (passport === null) fail("passport", "IMPORT_PASSPORT_MISSING");

    const sortCell = cells.value("sortOrder");
    const sortOrder = sortCell ? Number(sortCell) : undefined;
    if (sortCell && !Number.isInteger(sortOrder)) fail("sortOrder", "IMPORT_SORT_INVALID");

    // Model key: the column, else the key of the same model already in the event, else deterministic.
    const fullName = variant ? `${modelName} ${variant}` : modelName;
    const known = participation?.id
      ? context.models.find((model) => model.participationId === participation!.id && sameText(model.brandName, brandName) && sameText(model.displayName, modelName) && sameText(model.variant ?? "", variant))
      : undefined;
    const modelKey = cells.value("modelKey") || known?.externalKey || joinKey(context.eventCode, brandName, fullName);
    if (modelName && !FAIR_EXTERNAL_KEY_PATTERN.test(modelKey)) fail("modelKey", "IMPORT_KEY_INVALID");
    else if (modelName && modelKeys.has(modelKey)) fail("modelKey", "IMPORT_DUPLICATE_MODEL");

    if (cells.specLabelMissing) rowIssues.push({ line: row.line, field: "specifications", code: "IMPORT_SPEC_LABEL_MISSING", severity: "warning" });

    const skipped = rowIssues.some((issue) => issue.severity === "error");
    issues.push(...rowIssues);
    const price = cells.value("price");
    const qr = cells.value("qr");
    const photoUrl = cells.value("photoUrl");
    preview.push({
      line: row.line,
      skipped,
      exhibitor: participation?.name ?? exhibitorName,
      brand: brandName,
      stand: stand?.code ?? standCode,
      model: modelName,
      variant,
      modelKey: modelName ? modelKey : "",
      price,
      tier,
      specifications: cells.specifications,
      qr,
      hasPhoto: Boolean(photoUrl),
    });
    if (skipped || !participation || !stand || !tier || passport === null) continue;
    modelKeys.add(modelKey);

    let group = groups.find((entry) => entry.key === participation!.externalKey);
    if (!group) {
      const reportEmail = cells.value("reportEmail");
      const contactEmail = cells.value("contactEmail");
      group = {
        key: participation.externalKey,
        line: row.line,
        data: {
          externalKey: participation.externalKey,
          accountExternalKey: participation.smk,
          businessExternalKey: participation.sml,
          ...(reportEmail ? { reportEmail } : {}),
          ...(contactEmail ? { primaryContactEmail: contactEmail } : {}),
        },
        brands: [],
      };
      groups.push(group);
    }
    let brand = group.brands.find((entry) => sameText(entry.name, brandName) && entry.standKey === stand!.externalKey);
    if (!brand) {
      brand = { name: brandName, standKey: stand.externalKey, standCode: stand.code, line: row.line, stand, models: [] };
      group.brands.push(brand);
    }
    const slug = cells.value("slug");
    brand.models.push({
      line: row.line,
      model: {
        externalKey: modelKey,
        displayName: modelName,
        ...(variant ? { variant } : {}),
        ...(slug ? { slug } : {}),
        ...(price ? { priceText: price } : {}),
        packageTier: tier,
        ...(packageActiveFrom ? { packageActiveFrom } : {}),
        ...(qr ? { assignedResolverCode: qr } : {}),
        specifications: cells.specifications.map((spec, index) => ({ label: spec.label, value: spec.value, order: index + 1 })),
        ...(photoUrl ? { photoUrl } : {}),
        passportEligible: passport,
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
    });
  }

  const trace: ImportTrace = { models: [], brands: [], participations: [] };
  const participations: Participation[] = groups.map((group, pIndex) => {
    const pPath = `participations[${pIndex}]`;
    trace.participations.push({ path: pPath, line: group.line });
    // One brand on two stands is two brand entries; their keys must differ.
    const standsOfBrand = (name: string) => new Set(group.brands.filter((entry) => sameText(entry.name, name)).map((entry) => entry.standKey)).size;
    return {
      ...group.data,
      brands: group.brands.map((brand, bIndex) => {
        const bPath = `${pPath}.brands[${bIndex}]`;
        trace.brands.push({ path: bPath, line: brand.line });
        return {
          externalKey: standsOfBrand(brand.name) > 1 ? joinKey(brand.name, brand.standCode) : importSlug(brand.name),
          name: brand.name,
          stand: brand.stand,
          models: brand.models.map((entry, mIndex) => {
            trace.models.push({ path: `${bPath}.models[${mIndex}]`, line: entry.line });
            return entry.model;
          }),
        };
      }),
    };
  });

  return {
    payload: { version: FAIR_IMPORT_VERSION, eventCode: context.eventCode, participations },
    rows: preview,
    issues,
    skipped: preview.filter((row) => row.skipped).length,
    trace,
  };
}

const MODEL_FIELDS: Record<string, ImportIssueField> = {
  externalKey: "modelKey",
  displayName: "model",
  variant: "variant",
  slug: "slug",
  priceText: "price",
  packageTier: "package",
  packageActiveFrom: "packageFrom",
  assignedResolverCode: "qr",
  specifications: "specifications",
  photoUrl: "photoUrl",
  passportEligible: "passport",
  sortOrder: "sortOrder",
};
const STAND_FIELDS: Record<string, ImportIssueField> = { externalKey: "standCode", code: "standCode", displayName: "standName", mapLocationId: "mapLocationId" };
const BRAND_FIELDS: Record<string, ImportIssueField> = { externalKey: "brand", name: "brand" };
const PARTICIPATION_FIELDS: Record<string, ImportIssueField> = {
  externalKey: "participationKey",
  accountExternalKey: "smk",
  businessExternalKey: "sml",
  clientSegment: "exhibitor",
  reportEmail: "reportEmail",
  primaryContactEmail: "contactEmail",
};

const ISSUE_PATH = /^(participations\[\d+\])(?:\.(brands\[\d+\])(?:\.(stand)|\.(models\[\d+\]))?)?(?:\.([A-Za-z]+))?/;

/**
 * A dry-run issue path (`participations[0].brands[1].models[2].priceText`) →
 * the table row and field it came from. Paths of the whole document
 * (`eventCode`, `version`) have no row.
 */
export function locateImportIssue(path: string, trace: ImportTrace): { line: number | null; field: ImportIssueField | null } {
  const match = path.match(ISSUE_PATH);
  if (!match) return { line: null, field: null };
  const [, participation, brand, stand, model, field] = match;
  if (model) {
    const line = trace.models.find((entry) => entry.path === `${participation}.${brand}.${model}`)?.line ?? null;
    return { line, field: field ? MODEL_FIELDS[field] ?? null : null };
  }
  if (brand) {
    const line = trace.brands.find((entry) => entry.path === `${participation}.${brand}`)?.line ?? null;
    if (stand) return { line, field: field ? STAND_FIELDS[field] ?? "standCode" : "standCode" };
    return { line, field: field ? BRAND_FIELDS[field] ?? null : null };
  }
  const line = trace.participations.find((entry) => entry.path === participation)?.line ?? null;
  return { line, field: field ? PARTICIPATION_FIELDS[field] ?? null : "exhibitor" };
}
