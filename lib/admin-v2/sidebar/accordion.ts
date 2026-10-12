// ADMIN v2 — rules of the sidebar filter accordion (ZADATAK §3, Jovan's
// rules): at most one group is open; a group of up to 7 options is a radio
// list, a longer one a search-select; the header shows the current choice;
// the active filters are chips. Pure; the sidebar renders what these return.

import type { SidebarConfig, SidebarGroup, SidebarOption, SidebarPatch, SidebarState } from "./types";

/** A group with more options than this is a search-select. */
export const SIDEBAR_RADIO_MAX = 7;

export type AccordionAction = { type: "toggle"; id: string } | { type: "close" };

/** The open group (null = all closed): opening one closes the other, toggling the open one closes it. */
export function accordionReducer(open: string | null, action: AccordionAction): string | null {
  if (action.type === "close") return null;
  return open === action.id ? null : action.id;
}

/** `optionCount` = the real options, without "Sve". */
export function groupControlKind(optionCount: number): "radio" | "search" {
  return optionCount > SIDEBAR_RADIO_MAX ? "search" : "radio";
}

export function groupOptions(group: SidebarGroup, live: Readonly<Record<string, readonly SidebarOption[]>> | undefined): readonly SidebarOption[] {
  return live?.[group.id] ?? group.options ?? [];
}

/** The keys a group writes (a `custom` group may own several). */
export function groupKeys(group: SidebarGroup): readonly string[] {
  return group.kind === "custom" ? group.keys ?? [] : [group.id];
}

/** Text of the current choice in the group header; null = nothing chosen. */
export function groupSummary(group: SidebarGroup, state: SidebarState, options: readonly SidebarOption[], customSummary?: string): string | null {
  if (group.kind === "custom") return customSummary || null;
  const value = state[group.id];
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}

export type SidebarChip = { id: string; label: string; clear: SidebarPatch };

/** One chip per active filter (search first), each with the patch that removes it. */
export function sidebarChips(
  config: SidebarConfig,
  state: SidebarState,
  live: { options?: Readonly<Record<string, readonly SidebarOption[]>>; custom?: Readonly<Record<string, { summary?: string }>> } = {},
): SidebarChip[] {
  const chips: SidebarChip[] = [];
  const search = config.search;
  if (search && state[search.key]) chips.push({ id: search.key, label: `${search.label}: ${state[search.key]}`, clear: { [search.key]: null } });
  for (const group of config.groups ?? []) {
    const summary = groupSummary(group, state, groupOptions(group, live.options), live.custom?.[group.id]?.summary);
    const keys = groupKeys(group);
    if (!summary || !keys.some((key) => state[key])) continue;
    chips.push({ id: group.id, label: `${group.label}: ${summary}`, clear: Object.fromEntries(keys.map((key) => [key, null])) });
  }
  return chips;
}

/** The patch of "Očisti sve": search and every group; the view, the sort and the context stay. */
export function clearFiltersPatch(config: SidebarConfig): SidebarPatch {
  const patch: SidebarPatch = {};
  if (config.search) patch[config.search.key] = null;
  for (const group of config.groups ?? []) for (const key of groupKeys(group)) patch[key] = null;
  return patch;
}

/** N of „Filteri (N)“: the active filters (search and groups). */
export function activeFilterCount(config: SidebarConfig, state: SidebarState): number {
  let count = config.search && state[config.search.key] ? 1 : 0;
  for (const group of config.groups ?? []) if (groupKeys(group).some((key) => state[key])) count += 1;
  return count;
}

/** True when the page has anything to filter with (the phone shows „Filteri“ only then). */
export function hasSidebarFilters(config: SidebarConfig): boolean {
  return Boolean(config.search || config.views || config.sort || config.groups?.some((group) => !group.chipOnly));
}
