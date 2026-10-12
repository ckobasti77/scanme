"use client";

import { ChevronDown, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminMissionList } from "@/components/admin/admin-ui/admin-missions";
import type { MissionProgress } from "@/components/admin/admin-ui/use-mission-progress";
import type { AdminSubnavGroup, AdminSubnavItem, AdminUrgencyTone } from "@/lib/admin-v1/subnav";
import { missionBoard } from "@/lib/admin-v2/missions";
import {
  accordionReducer,
  clearFiltersPatch,
  groupControlKind,
  groupOptions,
  groupSummary,
  sidebarChips,
} from "@/lib/admin-v2/sidebar/accordion";
import { foldedNavSummary, searchFieldText } from "@/lib/admin-v2/sidebar/nav-fold";
import type { SidebarConfig, SidebarLive, SidebarOption, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";
import { AdminSearchSelect } from "./admin-search-select";
import { useChipMotion } from "./use-chip-motion";

// ADMIN v2 — the contextual sidebar (ZADATAK §3), one design on every page.
// Top to bottom: the context of the area, its sub-pages (one folded group
// where the page has a search or filters, so those stay above the fold), the
// views, the page search, the filter groups as an accordion (at most one open; up to 7
// options a radio list, more a search-select), the chips of the active
// filters with "Očisti sve", the sort, „Misije danas“ with the progress of
// the day and the quick jumps (Dashboard). Presentational: `config` comes from
// the registry, `live` from the page, `state` from the URL; a choice is
// written at once through `onPatch` (no "Primeni"). The same component fills
// the desktop sidebar and the phone drawer (`large` = 44 px targets).

const URGENCY_TONES: Record<AdminUrgencyTone, string> = {
  hitno: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  uskoro: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  info: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
};

const blockLabel = "px-2 pb-1 text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase";
/** The typed text waits this long before it is written to the URL. */
const SEARCH_DELAY_MS = 250;

export type AdminSidebarViewProps = {
  config: SidebarConfig;
  live?: SidebarLive;
  state: SidebarState;
  onPatch: (patch: SidebarPatch) => void;
  large?: boolean;
  /** Quick links of the default sidebar (the frame builds them for the page it is on). */
  jumps?: readonly { href: string; label: string }[];
  /** The missions with the progress of the day (the frame keeps the ledger); without it nothing is solved yet. */
  missions?: MissionProgress;
};

export function AdminSidebarView({ config, live = {}, state, onPatch, large, jumps = [], missions }: AdminSidebarViewProps) {
  const uid = useId();
  const [open, dispatch] = useReducer(accordionReducer, null);
  const row = large ? "min-h-11" : "min-h-9";
  const navRow = large ? "min-h-11" : "min-h-8";
  const nav = live.nav ?? config.nav;
  const navFold = nav?.length ? config.navFold : undefined;
  const folded = navFold && nav ? foldedNavSummary(nav) : null;
  const contextGroup = Boolean(config.context && !config.context.list && live.context);
  const groups = (config.groups ?? []).filter((group) => !group.chipOnly);
  const chips = sidebarChips(config, state, live);
  const root = useRef<HTMLDivElement>(null);
  useChipMotion(root, chips.map((chip) => chip.id));
  const toggle = (id: string) => dispatch({ type: "toggle", id });
  const close = (id: string) => {
    dispatch({ type: "close" });
    document.getElementById(`${uid}-${id}-toggle`)?.focus();
  };

  return (
    <div ref={root} className="grid min-w-0 gap-4">
      {config.context?.list && live.context ? (
        <Choice
          block="nav"
          title={config.context.label}
          name={`${uid}-${config.context.id}`}
          options={live.context.options}
          value={live.context.value}
          row={row}
          onChange={(value) => {
            if (value !== live.context?.value) live.context?.onChange(value);
          }}
        />
      ) : contextGroup || navFold ? (
        <div data-sidebar-block="nav" className="min-w-0 border-b border-[var(--admin-border)] pb-1">
          {contextGroup && config.context && live.context ? (
            <Group
              uid={uid}
              id={config.context.id}
              label={config.context.label}
              summary={live.context.options.find((option) => option.value === live.context?.value)?.label ?? null}
              open={open === config.context.id}
              onToggle={toggle}
              onClose={close}
              row={row}
            >
              <Options
                name={`${uid}-${config.context.id}`}
                labelledBy={`${uid}-${config.context.id}-toggle`}
                label={config.context.label}
                options={live.context.options}
                value={live.context.value}
                open={open === config.context.id}
                large={large}
                onChange={(value) => {
                  if (value && value !== live.context?.value) live.context?.onChange(value);
                  dispatch({ type: "close" });
                }}
              />
            </Group>
          ) : null}
          {/* The sub-pages as one group („Sekcija · Modeli“): the search and the filters of the page stay above the fold. */}
          {navFold && nav ? (
            <Group
              uid={uid}
              id={navFold.id}
              label={navFold.label}
              summary={folded?.label ?? null}
              badge={folded?.urgency ? <UrgencyBadge tone={folded.urgency.tone} count={folded.urgency.count} /> : null}
              open={open === navFold.id}
              onToggle={toggle}
              onClose={close}
              row={row}
            >
              <nav aria-label={config.navLabel} className="grid min-w-0 gap-3 pt-1 pb-2">
                {nav.map((group) => <NavGroup key={group.id} group={group} row={navRow} />)}
              </nav>
            </Group>
          ) : null}
        </div>
      ) : null}

      {nav?.length && !navFold ? (
        <nav data-sidebar-block="nav" aria-label={config.navLabel} className="grid min-w-0 gap-3">
          {nav.map((group) => <NavGroup key={group.id} group={group} row={navRow} />)}
        </nav>
      ) : null}

      {/* The parts of a long page; in the drawer the page itself is one swipe away, so the list is left out. */}
      {config.anchors && !large ? (
        <nav data-sidebar-block="anchors" aria-label={config.anchors.label} className="grid min-w-0 gap-0.5">
          <p className={blockLabel}>{config.anchors.label}</p>
          {config.anchors.items.map((anchor) => (
            <a key={anchor.id} href={`#${anchor.id}`} className={cn("flex min-w-0 items-center rounded-lg px-2 text-sm text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]", navRow)}>
              <span className="truncate">{anchor.label}</span>
            </a>
          ))}
        </nav>
      ) : null}

      {config.views ? (
        <Choice
          block="filters"
          title={config.views.label}
          name={`${uid}-views`}
          options={config.views.items}
          counts={live.viewCounts}
          value={state[config.views.key] ?? config.views.defaultValue}
          row={row}
          onChange={(value) => onPatch({ [config.views!.key]: value })}
        />
      ) : null}

      {config.search ? (
        <div data-sidebar-block="filters" className="min-w-0">
          <SearchField
            key={config.search.key}
            label={config.search.label}
            placeholder={config.search.placeholder}
            value={state[config.search.key] ?? ""}
            onChange={(value) => onPatch({ [config.search!.key]: value || null })}
            row={large ? "min-h-11" : "min-h-10"}
            submit={config.search.submit}
          />
        </div>
      ) : null}

      {groups.length ? (
        <section data-sidebar-block="filters" aria-label={dict.filters.groups} className="min-w-0">
          <p className={blockLabel}>{dict.filters.groups}</p>
          <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)]">
            {groups.map((group) => {
              const options = groupOptions(group, live.options);
              const custom = live.custom?.[group.id];
              const isOpen = open === group.id;
              // A default only the page knows (Pošta: the first mailbox) acts like the configured one.
              const fallback = group.defaultValue ?? live.defaults?.[group.id];
              return (
                <div key={group.id} className="border-b border-[var(--admin-border)] px-1 last:border-b-0">
                  <Group uid={uid} id={group.id} label={group.label} summary={groupSummary({ ...group, defaultValue: fallback }, state, options, custom?.summary)} open={isOpen} onToggle={toggle} onClose={close} row="min-h-11">
                    {group.kind === "custom" ? (
                      <div className="px-2 pb-3">{custom?.body}</div>
                    ) : !options.length && group.emptyText ? (
                      <p className="px-2 pb-3 text-sm leading-5 text-[var(--admin-text-muted)]">{group.emptyText}</p>
                    ) : (
                      <Options
                        name={`${uid}-${group.id}`}
                        labelledBy={`${uid}-${group.id}-toggle`}
                        label={group.label}
                        options={options}
                        value={state[group.id] ?? fallback}
                        required={Boolean(fallback)}
                        open={isOpen}
                        large={large}
                        onChange={(value) => onPatch({ [group.id]: value })}
                      />
                    )}
                  </Group>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {chips.length ? (
        <div data-sidebar-block="filters" className="grid min-w-0 gap-2">
          <p className={blockLabel}>{dict.filters.activeLabel}</p>
          <ul data-chip-list="" className="relative flex min-w-0 flex-wrap gap-1.5 px-1">
            {chips.map((chip) => (
              <li key={chip.id} data-chip={chip.id} className="min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => onPatch(chip.clear)}
                  aria-label={fmt(dict.filters.removeChip, { label: chip.label })}
                  className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 text-xs font-semibold hover:border-[var(--admin-text-muted)]", large ? "min-h-11" : "min-h-8")}
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="size-3.5 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => onPatch(clearFiltersPatch(config))} className={cn("w-fit rounded-md px-2 text-xs font-semibold underline underline-offset-4", large ? "min-h-11" : "min-h-8")}>
            {dict.filters.clearAll}
          </button>
        </div>
      ) : null}

      {config.sort ? (
        <Choice
          block="filters"
          title={config.sort.label}
          name={`${uid}-sort`}
          options={config.sort.options}
          value={state[config.sort.key] ?? config.sort.defaultValue}
          row={row}
          onChange={(value) => onPatch({ [config.sort!.key]: value })}
        />
      ) : null}

      {config.blocks?.includes("missions") && live.missions ? (
        <section data-sidebar-block="nav" aria-label={dict.frame.missionsTitle} className="grid min-w-0 gap-0.5">
          <p className={blockLabel}>{dict.frame.missionsTitle}</p>
          <AdminMissionList
            title={dict.frame.missionsTitle}
            board={missions?.board ?? missionBoard(live.missions, null)}
            confirm={missions?.confirm}
            pending={missions?.pending}
            row={row}
            emptyText={dict.frame.missionsClear}
          />
        </section>
      ) : null}

      {config.blocks?.includes("jumps") && jumps.length ? (
        <nav data-sidebar-block="nav" aria-label={dict.frame.jumpsTitle} className="grid min-w-0 gap-0.5">
          <p className={blockLabel}>{dict.frame.jumpsTitle}</p>
          {jumps.map((jump) => (
            <Link key={jump.href} href={jump.href} className={cn("flex min-w-0 items-center rounded-lg px-2 text-sm text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]", row)}>
              <span className="truncate">{jump.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function Group({ uid, id, label, summary, badge, open, onToggle, onClose, row, children }: {
  uid: string;
  id: string;
  label: string;
  summary: string | null;
  /** Shown beside the arrow (the folded navigation: what waits in its sub-pages). */
  badge?: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  onClose: (id: string) => void;
  row: string;
  children: ReactNode;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose(id);
  }
  // Arrow down on the header goes into the options (it opens the group first): the chosen one, else the first.
  function onHeaderKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    if (!open) onToggle(id);
    requestAnimationFrame(() => {
      const body = document.getElementById(`${uid}-${id}-body`);
      (body?.querySelector<HTMLElement>('input:checked, [aria-current="page"]') ?? body?.querySelector<HTMLElement>("input, a, button"))?.focus();
    });
  }
  return (
    <>
      <button
        type="button"
        id={`${uid}-${id}-toggle`}
        data-admin-filter-toggle=""
        aria-expanded={open}
        aria-controls={`${uid}-${id}-body`}
        onClick={() => onToggle(id)}
        onKeyDown={onHeaderKeyDown}
        className={cn("flex w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm", row)}
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{label}</span>
          {summary ? <span className="text-[var(--admin-text-muted)]">{fmt(dict.filters.groupWithValue, { group: "", value: summary })}</span> : null}
        </span>
        {badge}
        <ChevronDown className="admin-acc-chevron size-4 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
      </button>
      {/* Closed: the options stay out of the tab order and of the accessibility tree. */}
      <div id={`${uid}-${id}-body`} className="admin-acc-body" data-open={open ? "" : undefined} inert={!open} onKeyDown={onKeyDown}>
        <div>{children}</div>
      </div>
    </>
  );
}

/** Up to 7 options: a radio list; more: a search-select (ZADATAK §3). */
function Options({ name, labelledBy, label, options, value, required, open, large, onChange }: {
  name: string;
  labelledBy: string;
  label: string;
  options: readonly SidebarOption[];
  value: string | undefined;
  /** The group always has a value: no "Sve". */
  required?: boolean;
  open: boolean;
  large?: boolean;
  onChange: (value: string | null) => void;
}) {
  if (groupControlKind(options.length) === "search") {
    return <div className="px-1 pb-2"><AdminSearchSelect label={label} options={options} value={value} anyLabel={required ? null : dict.filters.any} onChange={onChange} open={open} large={large} /></div>;
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid min-w-0 gap-px pb-2">
      {required ? null : <Radio name={name} label={dict.filters.any} checked={!value} large={large} onChange={() => onChange(null)} />}
      {options.map((option) => (
        <Radio key={option.value} name={name} label={option.label} count={option.count} checked={value === option.value} large={large} onChange={() => onChange(option.value)} />
      ))}
    </div>
  );
}

function Radio({ name, label, count, checked, large, onChange }: { name: string; label: string; count?: number; checked: boolean; large?: boolean; onChange: () => void }) {
  return (
    <label className={cn("flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--admin-radius-inner)] px-2 text-sm hover:bg-[var(--admin-surface-muted)]", large ? "min-h-11" : "min-h-9", checked && "font-semibold")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 shrink-0 accent-[var(--admin-nav-line)]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <span className="shrink-0 text-xs font-normal text-[var(--admin-text-muted)] tabular-nums">{count}</span> : null}
    </label>
  );
}

/** Views and sort: one of a short list, always with a value. */
function Choice({ block, title, name, options, counts, value, row, onChange }: {
  block: string;
  title: string;
  name: string;
  options: readonly SidebarOption[];
  counts?: Readonly<Record<string, number | string>>;
  value: string;
  row: string;
  onChange: (value: string) => void;
}) {
  return (
    <div data-sidebar-block={block} role="radiogroup" aria-label={title} className="grid min-w-0 gap-0.5">
      <p className={blockLabel} aria-hidden="true">{title}</p>
      {options.map((option) => {
        const checked = option.value === value;
        const count = counts?.[option.value] ?? option.count;
        return (
          <label
            key={option.value}
            className={cn(
              "flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--admin-focus)]",
              row,
              checked ? "bg-[var(--admin-surface-muted)] font-semibold text-[var(--admin-text)] shadow-[inset_2px_0_0_var(--admin-nav-current)]" : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]",
            )}
          >
            <input type="radio" name={name} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
            <span className="min-w-0 truncate">{option.label}</span>
            {count !== undefined ? <span className="shrink-0 text-xs font-normal text-[var(--admin-text-muted)] tabular-nums">{count}</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function SearchField({ value, onChange, label, placeholder, row, submit }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  row: string;
  /** Written on Enter (`SidebarSearch.submit`); emptying the field removes the search at once. */
  submit?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  // The last value seen from the URL: a change from outside (a chip, "Očisti sve", Back) replaces the text unless the user is still typing.
  const [seen, setSeen] = useState(value);
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (value !== seen) {
    setSeen(value);
    const next = searchFieldText(text, value, typing);
    if (next !== text) setText(next);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: string) {
    setText(next);
    if (submit) {
      if (!next && value) onChange("");
      return;
    }
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTyping(false);
      onChange(next.trim());
    }, SEARCH_DELAY_MS);
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className={blockLabel}>{label}</label>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <input
          id={id}
          type="search"
          data-admin-sidebar-search=""
          title={fmt(dict.shortcuts.hint, { label: dict.shortcuts.items.pageSearch, keys: "/" })}
          aria-keyshortcuts="/"
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint={submit ? "search" : undefined}
          aria-describedby={submit ? `${id}-hint` : undefined}
          onChange={(event) => change(event.target.value)}
          onKeyDown={submit ? (event) => {
            if (event.key === "Enter") onChange(text.trim());
          } : undefined}
          className={cn("w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pr-3 pl-9 text-sm max-sm:text-base", row)}
        />
      </div>
      {submit ? <p id={`${id}-hint`} className="px-2 text-xs leading-5 text-[var(--admin-text-muted)]">{dict.filters.searchOnEnter}</p> : null}
    </div>
  );
}

function NavGroup({ group, row }: { group: AdminSubnavGroup; row: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      {group.label ? <p className={blockLabel}>{group.label}</p> : null}
      <ul className="grid min-w-0 gap-0.5">
        {group.items.map((item) => (
          <li key={item.id} className="min-w-0">
            {item.children ? (
              <>
                <p className={cn("px-2 pt-1 text-sm", item.activeChild ? "font-semibold text-[var(--admin-text)]" : "text-[var(--admin-text-muted)]")}>{item.label}</p>
                <ul aria-label={item.label} className="mt-0.5 grid min-w-0 gap-0.5">
                  {item.children.map((child) => <li key={child.id} className="min-w-0"><NavLink item={child} row={row} nested /></li>)}
                </ul>
              </>
            ) : <NavLink item={item} row={row} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UrgencyBadge({ tone, count }: { tone: AdminUrgencyTone; count: number }) {
  return (
    <span data-urgency={tone} className={cn("inline-flex min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 text-[0.68rem] leading-5 font-bold", URGENCY_TONES[tone])}>
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{fmt(dict.urgency[tone], { count })}</span>
    </span>
  );
}

function NavLink({ item, row, nested }: { item: AdminSubnavItem; row: string; nested?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-sm",
        row,
        nested && "pl-5",
        item.active
          ? "bg-[var(--admin-surface-muted)] font-semibold text-[var(--admin-text)] shadow-[inset_2px_0_0_var(--admin-nav-current)]"
          : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]",
      )}
    >
      <span className="min-w-0 truncate">{item.label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {item.urgency && item.urgency.count > 0 ? <UrgencyBadge tone={item.urgency.tone} count={item.urgency.count} /> : null}
        {item.count !== undefined ? (
          <span className="text-xs font-normal text-[var(--admin-text-muted)] tabular-nums">
            <span aria-hidden="true">{item.count}</span>
            <span className="sr-only">{fmt(dict.navCount, { count: item.count })}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
