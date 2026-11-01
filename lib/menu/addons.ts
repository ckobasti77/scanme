// ScanMe Menu V1 (K04) — add-on group rules (master §5.7, §7.5).
//
// A group allows ONE choice ("single") or SEVERAL ("multiple") and is either
// required or optional. Minimum and maximum are ADVANCED settings: absent, they
// follow from `selection` and `required`:
//   single,   optional → 0..1        single,   required → exactly 1
//   multiple, optional → 0..all      multiple, required → 1..all
// Advanced values only exist for "multiple": `minSelect` (≥ 1, only for a
// required group) and `maxSelect` (≥ 1, ≥ the minimum). An add-on is a
// positive surcharge or free (0); Room service puts no markup on add-ons
// (K01 OTV 20).

import { MENU_MAX_ADDON_OPTIONS_PER_GROUP } from "./limits";

export type MenuAddonSelection = "single" | "multiple";

export type MenuAddonRules = {
  selection: MenuAddonSelection;
  required: boolean;
  minSelect?: number;
  maxSelect?: number;
};

export type MenuAddonRulesInput = {
  selection: MenuAddonSelection;
  required: boolean;
  minSelect?: number | null;
  maxSelect?: number | null;
};

function isCount(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min && value <= MENU_MAX_ADDON_OPTIONS_PER_GROUP;
}

/**
 * The stored form of a group's rules, or null when they contradict each other
 * (the caller raises ARTICLE_ERROR.addonRulesInvalid). A value that only
 * repeats the default is dropped (minSelect 1 on a required group), so equal
 * rules always compare equal.
 */
export function normalizeAddonRules(input: MenuAddonRulesInput): MenuAddonRules | null {
  const minSelect = input.minSelect ?? undefined;
  const maxSelect = input.maxSelect ?? undefined;
  if (input.selection === "single") {
    if (minSelect !== undefined || maxSelect !== undefined) return null;
    return { selection: "single", required: input.required };
  }
  if (minSelect !== undefined) {
    if (!input.required || !isCount(minSelect, 1)) return null;
  }
  if (maxSelect !== undefined) {
    if (!isCount(maxSelect, 1)) return null;
    if (maxSelect < (minSelect ?? (input.required ? 1 : 0))) return null;
  }
  return {
    selection: "multiple",
    required: input.required,
    ...(minSelect !== undefined && minSelect > 1 ? { minSelect } : {}),
    ...(maxSelect !== undefined ? { maxSelect } : {}),
  };
}

/** How many add-ons a guest must / may pick from a group with `optionCount` options. */
export function addonBounds(
  rules: MenuAddonRules,
  optionCount: number,
): { min: number; max: number } {
  if (rules.selection === "single") {
    return { min: rules.required ? 1 : 0, max: Math.min(1, optionCount) };
  }
  const min = rules.required ? (rules.minSelect ?? 1) : 0;
  const max = Math.min(rules.maxSelect ?? optionCount, optionCount);
  return { min, max };
}

/** False when a guest could never satisfy the group (more required choices than options). */
export function isAddonGroupSatisfiable(rules: MenuAddonRules, optionCount: number): boolean {
  return addonBounds(rules, optionCount).min <= optionCount;
}

/** Whether `selectedCount` distinct add-ons are a valid choice for the group. */
export function isValidAddonSelection(
  rules: MenuAddonRules,
  optionCount: number,
  selectedCount: number,
): boolean {
  const { min, max } = addonBounds(rules, optionCount);
  return Number.isInteger(selectedCount) && selectedCount >= min && selectedCount <= max;
}
