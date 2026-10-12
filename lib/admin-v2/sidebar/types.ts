// ADMIN v2 — the shape of the contextual sidebar (ZADATAK §3). One component
// renders it on every page; what it shows comes from the registry by route
// (`SidebarConfig`, static) and from the page (`SidebarLive`, the parts only
// the page's data knows: options, counts, the event list).

import type { ReactNode } from "react";
import type { AdminSubnavGroup, AdminUrgencyTone } from "@/lib/admin-v1/subnav";

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
  /** `custom`: which of `keys` hold free text (a name), not an id. */
  textKeys?: readonly string[];
  /** A filter that arrives by link and has no control here: only its chip is shown. */
  chipOnly?: boolean;
  /**
   * The group always has a value (a period, a category): there is no "Sve",
   * this option is chosen while the key is absent and it is never written.
   */
  defaultValue?: string;
  /** Shown instead of the options while there are none (a group that waits for another choice). */
  emptyText?: string;
};

export type SidebarViews = { key: string; label: string; items: readonly SidebarOption[]; defaultValue: string };
export type SidebarSort = { key: string; label: string; options: readonly SidebarOption[]; defaultValue: string };
export type SidebarSearch = {
  key: string;
  label: string;
  placeholder?: string;
  /** Written on Enter, not while typing: a search that calls an outside service (Pošta → Zoho). */
  submit?: boolean;
};
export type SidebarBlock = "missions" | "jumps";
export type SidebarJump = { href: string; label: string };
/** One line of „Misije danas“: what waits, how much of it and where it is solved. */
export type SidebarMission = { id: string; label: string; count: number; tone: AdminUrgencyTone; href?: string };

export type SidebarConfig = {
  id: string;
  /**
   * Context of the area (Događaji: the event). Options and the change come
   * from the page. `list`: an always open list instead of an accordion group
   * (Tim: the members).
   */
  context?: { id: string; label: string; list?: boolean };
  /** Sub-pages of the area. The page may replace them with badges (`SidebarLive.nav`). */
  nav?: readonly AdminSubnavGroup[];
  /** Label of `nav` for assistive technology. */
  navLabel?: string;
  /** „Na ovoj strani“: the parts of a long page, as links to their ids on the screen. */
  anchors?: { label: string; items: readonly { id: string; label: string }[] };
  views?: SidebarViews;
  search?: SidebarSearch;
  groups?: readonly SidebarGroup[];
  sort?: SidebarSort;
  blocks?: readonly SidebarBlock[];
  /** Quick jumps of this page (admin paths); without them the frame shows its own list. */
  jumps?: readonly SidebarJump[];
};

export type SidebarState = Record<string, string>;
export type SidebarPatch = Record<string, string | null>;

export type SidebarLive = {
  context?: { value: string; options: readonly SidebarOption[]; onChange: (value: string) => void };
  nav?: readonly AdminSubnavGroup[];
  viewCounts?: Readonly<Record<string, number>>;
  /** Options (with counts) of the groups, by group id; they replace the static ones. */
  options?: Readonly<Record<string, readonly SidebarOption[]>>;
  /**
   * The value of a group while its key is absent, when only the page knows it
   * (Pošta: the first mailbox). Like `SidebarGroup.defaultValue`: no "Sve".
   */
  defaults?: Readonly<Record<string, string>>;
  /** Body and header summary of `custom` groups, by group id. */
  custom?: Readonly<Record<string, { summary?: string; body: ReactNode }>>;
  /** „Misije danas“ (block `missions`), from data the page already has. */
  missions?: readonly SidebarMission[];
  /**
   * Called before a change is written: returns the patch to write (dependent
   * filters: picking a brand sets its exhibitor) or null to cancel it.
   */
  intercept?: (patch: SidebarPatch, state: SidebarState) => SidebarPatch | null;
};
