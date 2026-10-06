// Admin UX A7 — `interakcije/pasos`: one row per brand of the event with the
// passport condition (and why it is not met), the state of the automatic
// passport and its members. Pure: built from fairPassports.getPassportOverview
// plus the names the event frame already loaded. The query never reads the
// clock, so the state takes the client's time (frozen from `freezesAt`).

import type {
  FairBrandPassportProblem,
  FairModelStatus,
  FairPassportConfigStatus,
  FairPassportEligibleStatus,
} from "@/lib/fair-contract";
import type { AdminQueryPatch, AdminQueryState } from "./query-state";

export type PassportOverviewBrand = {
  brandId: string;
  participationId: string | null;
  eligible: boolean;
  exhibited: number;
  problems: { code: FairBrandPassportProblem; count: number }[];
  tooManyModels: boolean;
  freezesAt: number;
  passport: null | {
    passportId: string;
    status: FairPassportConfigStatus;
    frozenAt?: number;
    publishedAt?: number;
    hiddenAt?: number;
    autoSyncedAt?: number;
  };
  members: { eventModelId: string; status: FairPassportEligibleStatus; removedAt?: number; removedByAdmin: boolean }[];
};
export type PassportOverviewSource = { eventStartsAt: number; brands: PassportOverviewBrand[] };

export type PassportNames = {
  brands: ReadonlyMap<string, string>;
  exhibitors: ReadonlyMap<string, string>;
  models: ReadonlyMap<string, { name: string; status: FairModelStatus }>;
};

/**
 * - `active`: published, visible, the set still follows the catalog;
 * - `frozen`: published, visible, the set no longer changes (opening or a manual freeze);
 * - `hidden`: the admin hid it (visitors do not see it; stamps continue);
 * - `not_eligible`: the brand does not meet the condition (no passport, or withdrawn);
 * - `missing`: the condition is met but there is no published passport.
 */
export type PassportState = "active" | "frozen" | "hidden" | "not_eligible" | "missing";

/** `?stanje=` values on this page (A0 §2.3 query vocabulary). */
export const PASSPORT_STATE_VALUES = ["aktivan", "zamrznut", "sakriven", "bez-uslova", "nije-napravljen"] as const;
export type PassportStateParam = (typeof PASSPORT_STATE_VALUES)[number];
export const PASSPORT_STATE_OF_PARAM: Record<PassportStateParam, PassportState> = {
  aktivan: "active",
  zamrznut: "frozen",
  sakriven: "hidden",
  "bez-uslova": "not_eligible",
  "nije-napravljen": "missing",
};

export type PassportMemberRow = {
  modelId: string;
  modelName: string;
  status: FairPassportEligibleStatus;
  /** Catalog status of the car; null = not in the loaded catalog. */
  modelStatus: FairModelStatus | null;
  removedByAdmin: boolean;
  /** Required but the car is withdrawn: blocks completion until the emergency removal (MASTER §11). */
  blocking: boolean;
};

export type PassportRow = {
  brandId: string;
  brandName: string;
  exhibitorId: string | null;
  exhibitorName: string;
  eligible: boolean;
  exhibited: number;
  problems: PassportOverviewBrand["problems"];
  tooManyModels: boolean;
  state: PassportState;
  frozen: boolean;
  freezesAt: number;
  passportId: string | null;
  passportStatus: FairPassportConfigStatus | null;
  hiddenAt?: number;
  /** Required members first, then removed ones. */
  members: PassportMemberRow[];
  requiredCount: number;
  blockingCount: number;
};

export function passportStateOf(brand: Pick<PassportOverviewBrand, "eligible" | "passport" | "freezesAt">, now: number): PassportState {
  if (brand.passport?.hiddenAt !== undefined) return "hidden";
  if (brand.passport?.status === "published") return now >= brand.freezesAt ? "frozen" : "active";
  return brand.eligible ? "missing" : "not_eligible";
}

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

export function buildPassportRows(source: PassportOverviewSource, names: PassportNames, now: number): PassportRow[] {
  return source.brands
    .map((brand) => {
      const members = brand.members
        .map((member) => {
          const model = names.models.get(member.eventModelId) ?? null;
          return {
            modelId: member.eventModelId,
            modelName: model?.name ?? "—",
            status: member.status,
            modelStatus: model?.status ?? null,
            removedByAdmin: member.removedByAdmin,
            blocking: member.status === "required" && model?.status === "withdrawn",
          };
        })
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "required" ? -1 : 1));
      const row: PassportRow = {
        brandId: brand.brandId,
        brandName: names.brands.get(brand.brandId) ?? "—",
        exhibitorId: brand.participationId,
        exhibitorName: (brand.participationId && names.exhibitors.get(brand.participationId)) || "—",
        eligible: brand.eligible,
        exhibited: brand.exhibited,
        problems: brand.problems,
        tooManyModels: brand.tooManyModels,
        state: passportStateOf(brand, now),
        frozen: now >= brand.freezesAt,
        freezesAt: brand.freezesAt,
        passportId: brand.passport?.passportId ?? null,
        passportStatus: brand.passport?.status ?? null,
        ...(brand.passport?.hiddenAt !== undefined ? { hiddenAt: brand.passport.hiddenAt } : {}),
        members,
        requiredCount: members.filter((member) => member.status === "required").length,
        blockingCount: members.filter((member) => member.blocking).length,
      };
      return row;
    })
    .sort((a, b) => collator.compare(a.exhibitorName, b.exhibitorName) || collator.compare(a.brandName, b.brandName));
}

function stateParam(query: AdminQueryState): PassportState | null {
  const value = query.stanje;
  return value && (PASSPORT_STATE_VALUES as readonly string[]).includes(value) ? PASSPORT_STATE_OF_PARAM[value as PassportStateParam] : null;
}

function matches(row: PassportRow, query: AdminQueryState, skipState: boolean): boolean {
  if (query.izlagac && row.exhibitorId !== query.izlagac) return false;
  if (query.brend && row.brandId !== query.brend) return false;
  const state = skipState ? null : stateParam(query);
  return !state || row.state === state;
}

/** `?izlagac=`, `?brend=` (the model detail links here with its brand) and `?stanje=`. */
export function applyPassportFilters(rows: readonly PassportRow[], query: AdminQueryState): PassportRow[] {
  return rows.filter((row) => matches(row, query, false));
}

/** Rows per state under the other filters (facet counts). */
export function passportStateCounts(rows: readonly PassportRow[], query: AdminQueryState): Record<PassportStateParam, number> {
  const counts = Object.fromEntries(PASSPORT_STATE_VALUES.map((value) => [value, 0])) as Record<PassportStateParam, number>;
  for (const row of rows) {
    if (!matches(row, query, true)) continue;
    const param = PASSPORT_STATE_VALUES.find((value) => PASSPORT_STATE_OF_PARAM[value] === row.state)!;
    counts[param] += 1;
  }
  return counts;
}

export function clearPassportFiltersPatch(): AdminQueryPatch {
  return { izlagac: null, brend: null, stanje: null };
}
