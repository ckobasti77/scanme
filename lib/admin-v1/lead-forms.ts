// Admin UX A7 — `interakcije/forme`: the forms `Zainteresovan sam` and
// `Probna vožnja` per exhibitor (ADMIN-UX §6). Pure: built from
// fairLeadsAdmin.getEventLeadForms plus the catalog names. A model cell shows
// the real stored state, where it comes from (exhibitor default or the
// model's exception) and whether it still follows the current default.

import type {
  FairContactRequirement,
  FairLeadConfigSource,
  FairLeadKind,
  FairPackageTier,
  FairPreferredContact,
} from "@/lib/fair-contract";

export const LEAD_FORM_KINDS = ["interest", "test_drive"] as const satisfies readonly FairLeadKind[];

export type LeadFormValues = { enabled: boolean; contactRequirement: FairContactRequirement; preferredContact?: FairPreferredContact };

export type LeadFormsSource = {
  defaults: ({ participationId: string; leadKind: FairLeadKind; updatedAt: number } & LeadFormValues)[];
  models: {
    eventModelId: string;
    participationId: string;
    packageTier: FairPackageTier;
    interest: LeadFormSourceCell;
    testDrive: LeadFormSourceCell;
  }[];
};
type LeadFormSourceCell = { entitled: boolean; config: (LeadFormValues & { source: FairLeadConfigSource; updatedAt: number }) | null };

export type LeadFormCellState = "on" | "off" | "not_entitled" | "not_set";

export type LeadFormCell = {
  kind: FairLeadKind;
  entitled: boolean;
  config: (LeadFormValues & { source: FairLeadConfigSource }) | null;
  /** What the exhibitor default gives this model now (null = the exhibitor has no default for the kind). */
  expected: LeadFormValues | null;
  /** The package has the form, it follows the default, but "Primeni na sve modele" has not written the current one yet. */
  pending: boolean;
  state: LeadFormCellState;
};

export type LeadFormRow = {
  modelId: string;
  modelName: string;
  brandName: string;
  exhibitorId: string;
  tier: FairPackageTier;
  interest: LeadFormCell;
  testDrive: LeadFormCell;
};

export type LeadFormNames = { models: ReadonlyMap<string, { name: string; brandName: string }> };

/** The exhibitor's saved default per kind (null = not saved yet). */
export function leadFormDefaults(source: Pick<LeadFormsSource, "defaults">, participationId: string): Record<FairLeadKind, LeadFormValues | null> {
  const of = (kind: FairLeadKind) => {
    const row = source.defaults.find((entry) => entry.participationId === participationId && entry.leadKind === kind);
    return row ? { enabled: row.enabled, contactRequirement: row.contactRequirement, ...(row.preferredContact ? { preferredContact: row.preferredContact } : {}) } : null;
  };
  return { interest: of("interest"), test_drive: of("test_drive") };
}

export function sameLeadForm(a: LeadFormValues, b: LeadFormValues): boolean {
  return a.enabled === b.enabled && a.contactRequirement === b.contactRequirement && (a.preferredContact ?? null) === (b.preferredContact ?? null);
}

/** The value the default gives a model: off where the package lacks the form (same rule as the backend). */
export function expectedLeadForm(value: LeadFormValues | null, entitled: boolean): LeadFormValues | null {
  return value ? { ...value, enabled: value.enabled && entitled } : null;
}

function cell(kind: FairLeadKind, source: LeadFormSourceCell, defaults: Record<FairLeadKind, LeadFormValues | null>): LeadFormCell {
  const expected = expectedLeadForm(defaults[kind], source.entitled);
  const config = source.config
    ? {
        enabled: source.config.enabled,
        contactRequirement: source.config.contactRequirement,
        ...(source.config.preferredContact ? { preferredContact: source.config.preferredContact } : {}),
        source: source.config.source,
      }
    : null;
  const pending = source.entitled && expected !== null && (config === null || (config.source === "default" && !sameLeadForm(config, expected)));
  const state: LeadFormCellState = !source.entitled ? "not_entitled" : !config ? "not_set" : config.enabled ? "on" : "off";
  return { kind, entitled: source.entitled, config, expected, pending, state };
}

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

/** The models of one exhibitor with both forms, sorted by brand and name. */
export function buildLeadFormRows(source: LeadFormsSource, names: LeadFormNames, participationId: string): LeadFormRow[] {
  const defaults = leadFormDefaults(source, participationId);
  return source.models
    .filter((model) => model.participationId === participationId)
    .map((model) => {
      const name = names.models.get(model.eventModelId);
      return {
        modelId: model.eventModelId,
        modelName: name?.name ?? "—",
        brandName: name?.brandName ?? "—",
        exhibitorId: model.participationId,
        tier: model.packageTier,
        interest: cell("interest", model.interest, defaults),
        testDrive: cell("test_drive", model.testDrive, defaults),
      };
    })
    .sort((a, b) => collator.compare(a.brandName, b.brandName) || collator.compare(a.modelName, b.modelName));
}

/** Models where at least one form still waits for "Primeni na sve modele". */
export function pendingLeadFormModels(rows: readonly LeadFormRow[]): number {
  return rows.filter((row) => row.interest.pending || row.testDrive.pending).length;
}

/** Models per exhibitor (for the exhibitor picker). */
export function leadFormModelCounts(source: Pick<LeadFormsSource, "models">): Map<string, number> {
  const counts = new Map<string, number>();
  for (const model of source.models) counts.set(model.participationId, (counts.get(model.participationId) ?? 0) + 1);
  return counts;
}

/** The exhibitor the page opens on: `?izlagac=`, else the exhibitor of `?model=`, else the first one. */
export function selectedLeadFormExhibitor(
  exhibitors: readonly { id: string }[],
  source: Pick<LeadFormsSource, "models"> | undefined,
  query: { izlagac?: string; model?: string },
): string | null {
  if (query.izlagac && exhibitors.some((row) => row.id === query.izlagac)) return query.izlagac;
  const ofModel = query.model ? source?.models.find((model) => model.eventModelId === query.model)?.participationId : undefined;
  if (ofModel && exhibitors.some((row) => row.id === ofModel)) return ofModel;
  return exhibitors[0]?.id ?? null;
}
