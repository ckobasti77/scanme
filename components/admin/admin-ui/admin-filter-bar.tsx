"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { adminFieldClass, adminSecondaryButtonClass, adminTouchFieldClass } from "@/components/admin/admin-ui/admin-controls";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A3 — the filter bar above an admin list (A0 §2.3): search, a slot
// for AdminHierarchyPicker, facets (native selects, with counts), chips of the
// active filters and "Očisti". Presentational: the screen keeps the values
// (Događaji: in the query string). On a phone the facets fold behind
// "Filteri (N)"; search and the hierarchy stay visible.

export type AdminFilterFacetOption = { value: string; label: string; count?: number };
export type AdminFilterFacet = { id: string; label: string; options: AdminFilterFacetOption[] };
export type AdminFilterChip = { id: string; label: string; onRemove: () => void };

export type AdminFilterBarProps = {
  /** Accessible name of the filter region. */
  label: string;
  /** N2 — `touch`: 16 px on the phone (a list searched on the fair floor; adminTouchFieldClass). */
  search?: { value: string; onChange: (value: string) => void; label: string; placeholder?: string; touch?: boolean };
  hierarchy?: ReactNode;
  facets?: AdminFilterFacet[];
  values?: Record<string, string | undefined>;
  onFacetChange?: (id: string, value: string | undefined) => void;
  chips?: AdminFilterChip[];
  onClear?: () => void;
  className?: string;
};

/** Typing waits this long before the value is written (the URL is not rewritten per key). */
const SEARCH_DELAY_MS = 250;

export function AdminFilterBar({ label, search, hierarchy, facets = [], values = {}, onFacetChange, chips = [], onClear, className }: AdminFilterBarProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const activeFacets = facets.filter((facet) => values[facet.id]).length;
  return (
    <section aria-label={label} data-admin-primitive="filter-bar" className={cn("grid min-w-0 gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3", className)}>
      <div className="flex min-w-0 items-end gap-2">
        {search ? <SearchField key={search.label} {...search} /> : <span className="flex-1" />}
        {facets.length ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-facets`}
            onClick={() => setOpen((value) => !value)}
            className={cn(adminSecondaryButtonClass, "shrink-0 px-3 lg:hidden")}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {activeFacets ? fmt(dict.filters.toggleCount, { count: activeFacets }) : dict.filters.toggle}
          </button>
        ) : null}
      </div>
      {hierarchy}
      {facets.length ? (
        <div id={`${id}-facets`} className={cn("min-w-0 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-5", open ? "grid" : "hidden")}>
          {facets.map((facet) => (
            <div key={facet.id} className="grid min-w-0 gap-1.5">
              <label htmlFor={`${id}-${facet.id}`} className="text-xs font-semibold">{facet.label}</label>
              <select
                id={`${id}-${facet.id}`}
                value={values[facet.id] ?? ""}
                onChange={(event) => onFacetChange?.(facet.id, event.target.value || undefined)}
                className={adminFieldClass}
              >
                <option value="">{dict.filters.any}</option>
                {facet.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.count === undefined ? option.label : fmt(dict.hierarchy.optionCount, { label: option.label, count: option.count })}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}
      {chips.length ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="sr-only">{dict.filters.activeLabel}</span>
          <ul className="flex min-w-0 flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.id} className="min-w-0">
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={fmt(dict.filters.removeChip, { label: chip.label })}
                  className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 text-xs font-semibold hover:border-[var(--admin-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]"
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="size-3.5 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {onClear ? (
            <button type="button" onClick={onClear} className="min-h-8 rounded-md px-2 text-xs font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
              {dict.filters.clear}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SearchField({ value, onChange, label, placeholder, touch }: NonNullable<AdminFilterBarProps["search"]>) {
  const id = useId();
  const [text, setText] = useState(value);
  // The last value seen from the screen: a change from outside (Očisti, chip, Back) replaces the text unless the user is still typing.
  const [seen, setSeen] = useState(value);
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (value !== seen) {
    setSeen(value);
    if (!typing) setText(value);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: string) {
    setText(next);
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTyping(false);
      onChange(next.trim());
    }, SEARCH_DELAY_MS);
  }

  return (
    <div className="grid min-w-0 flex-1 gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold">{label}</label>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => change(event.target.value)}
          className={cn(touch ? adminTouchFieldClass : adminFieldClass, "pl-9")}
        />
      </div>
    </div>
  );
}
