// ADMIN v2 — the shape of the contextual sidebar (ZADATAK §3). One component
// renders it on every page; what it shows comes from the registry by route
// (`SidebarConfig`, static) and from the page (`SidebarLive`, the parts only
// the page's data knows: options, counts, the event list).

import type { ReactNode } from "react";
import type { AdminSubnavGroup } from "@/lib/admin-v1/subnav";

export type SidebarOption = { value: string; label: string; count?: number; hint?: string };

export type SidebarGroup = {
  /** The URL key of the filter (for `custom`: the id of the group). */
  id: string;
  label: string;
  /** `choice` (default): one of `options`. `custom`: the page renders the body (`SidebarLive.custom`). */
  kind?: "choice" | "custom";
  /** Static options; without them the page sends the options (`SidebarLive.options`). */
  options?: readonly SidebarOption[];
  /** `custom`: the URL keys the group owns (cleared with its chip). */
  keys?: readonly string[];
  /** A filter that arrives by link and has no control here: only its chip is shown. */
  chipOnly?: boolean;
};

export type SidebarViews = { key: string; label: string; items: readonly SidebarOption[]; defaultValue: string };
export type SidebarSort = { key: string; label: string; options: readonly SidebarOption[]; defaultValue: string };
export type SidebarSearch = { key: string; label: string; placeholder?: string };
export type SidebarBlock = "jumps";

export type SidebarConfig = {
  id: string;
  /** Context of the area (Događaji: the event). Options and the change come from the page. */
  context?: { id: string; label: string };
  /** Sub-pages of the area. The page may replace them with badges (`SidebarLive.nav`). */
  nav?: readonly AdminSubnavGroup[];
  /** Label of `nav` for assistive technology. */
  navLabel?: string;
  views?: SidebarViews;
  search?: SidebarSearch;
  groups?: readonly SidebarGroup[];
  sort?: SidebarSort;
  blocks?: readonly SidebarBlock[];
};

export type SidebarState = Record<string, string>;
export type SidebarPatch = Record<string, string | null>;

export type SidebarLive = {
  context?: { value: string; options: readonly SidebarOption[]; onChange: (value: string) => void };
  nav?: readonly AdminSubnavGroup[];
  viewCounts?: Readonly<Record<string, number>>;
  /** Options (with counts) of the groups, by group id; they replace the static ones. */
  options?: Readonly<Record<string, readonly SidebarOption[]>>;
  /** Body and header summary of `custom` groups, by group id. */
  custom?: Readonly<Record<string, { summary?: string; body: ReactNode }>>;
  /**
   * Called before a change is written: returns the patch to write (dependent
   * filters: picking a brand sets its exhibitor) or null to cancel it.
   */
  intercept?: (patch: SidebarPatch, state: SidebarState) => SidebarPatch | null;
};
