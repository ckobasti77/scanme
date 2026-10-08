"use client";

import { Search, X } from "lucide-react";
import { useId, useState, type FocusEvent, type KeyboardEvent } from "react";
import { adminFieldClass, adminTouchFieldClass } from "@/components/admin/admin-ui/admin-controls";
import {
  changeHierarchy,
  hierarchyOptions,
  nextActiveIndex,
  searchHierarchyModels,
  type HierarchyData,
  type HierarchyModel,
  type HierarchyValue,
} from "@/lib/admin-v1/hierarchy";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A3 — the shared Izlagač → Brend → Model picker (A0 §2.4). Used by
// Modeli and later by QR, Interakcije and Leadovi. Presentational: the screen
// keeps the value (Modeli: in the query string). There is no long `<select>`
// of models: a model is found by typing in a combobox (name, variant, key,
// QR or SMQ code), narrowed by the chosen exhibitor and brand.

export type AdminHierarchyPickerProps = {
  data: HierarchyData;
  value: HierarchyValue;
  onChange: (next: HierarchyValue) => void;
  /** filter = three dependent fields (lists); select = choose one model (forms). */
  mode?: "filter" | "select";
  label: string;
  /** Models that pass the screen's other filters; their number is shown next to each exhibitor and brand. */
  counted?: ReadonlySet<string>;
  /** select mode: the field must be filled. */
  required?: boolean;
  /** N2 — 16 px on the phone (a field typed on the fair floor; adminTouchFieldClass). */
  touch?: boolean;
};

const MAX_SHOWN = 50;

export function AdminHierarchyPicker({ data, value, onChange, mode = "filter", label, counted, required, touch }: AdminHierarchyPickerProps) {
  const id = useId();
  const options = hierarchyOptions(data, value, counted);
  const current = options.value;
  const optionText = (option: { label: string; count: number }) => (counted ? fmt(dict.hierarchy.optionCount, { label: option.label, count: option.count }) : option.label);
  const pickModel = (modelId: string | undefined) => onChange(changeHierarchy(data, current, "model", modelId));

  if (mode === "select") {
    return (
      <div data-admin-primitive="hierarchy-picker" className="grid min-w-0 gap-1.5">
        <ModelCombobox
          id={`${id}-model`}
          label={label}
          models={data.models}
          selectedId={current.modelId}
          onSelect={pickModel}
          required={required}
          touch={touch}
        />
      </div>
    );
  }
  const fieldClass = touch ? adminTouchFieldClass : adminFieldClass;

  return (
    <fieldset data-admin-primitive="hierarchy-picker" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
      <legend className="sr-only">{label}</legend>
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor={`${id}-exhibitor`} className="text-xs font-semibold">{dict.hierarchy.exhibitor}</label>
        <select
          id={`${id}-exhibitor`}
          value={current.exhibitorId ?? ""}
          onChange={(event) => onChange(changeHierarchy(data, current, "exhibitor", event.target.value || undefined))}
          className={fieldClass}
        >
          <option value="">{dict.hierarchy.allExhibitors}</option>
          {options.exhibitors.map((option) => <option key={option.id} value={option.id}>{optionText(option)}</option>)}
        </select>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor={`${id}-brand`} className="text-xs font-semibold">{dict.hierarchy.brand}</label>
        <select
          id={`${id}-brand`}
          value={current.brandId ?? ""}
          onChange={(event) => onChange(changeHierarchy(data, current, "brand", event.target.value || undefined))}
          className={fieldClass}
        >
          <option value="">{dict.hierarchy.allBrands}</option>
          {options.brands.map((option) => <option key={option.id} value={option.id}>{optionText(option)}</option>)}
        </select>
      </div>
      <div className="grid min-w-0 gap-1.5 sm:col-span-2 lg:col-span-1">
        <ModelCombobox
          id={`${id}-model`}
          label={dict.hierarchy.model}
          models={options.models}
          selectedId={current.modelId}
          onSelect={pickModel}
          touch={touch}
        />
      </div>
    </fieldset>
  );
}

function ModelCombobox({ id, label, models, selectedId, onSelect, required, touch }: {
  id: string;
  label: string;
  models: readonly HierarchyModel[];
  selectedId: string | undefined;
  onSelect: (modelId: string | undefined) => void;
  required?: boolean;
  touch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const selected = selectedId ? models.find((model) => model.id === selectedId) ?? null : null;
  const results = searchHierarchyModels(models, query ?? "", MAX_SHOWN);
  const listId = `${id}-list`;
  const activeOption = open && active >= 0 ? results.shown[active] : undefined;

  function close() {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }

  function choose(model: HierarchyModel | undefined) {
    if (model?.disabledReason) return;
    onSelect(model?.id);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || (open && (event.key === "Home" || event.key === "End"))) {
      event.preventDefault();
      if (!open) setOpen(true);
      setActive((index) => nextActiveIndex(index, event.key, results.shown.length));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeOption) choose(activeOption);
      else if (results.shown.length === 1) choose(results.shown[0]);
    } else if (event.key === "Escape") {
      if (open || query !== null) {
        event.preventDefault();
        close();
      }
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  }

  return (
    <div className="relative grid min-w-0 gap-1.5" onBlur={onBlur}>
      <label htmlFor={id} className="text-xs font-semibold">{label}</label>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${id}-option-${activeOption.id}` : undefined}
          aria-required={required || undefined}
          autoComplete="off"
          spellCheck={false}
          value={query ?? selected?.label ?? ""}
          placeholder={dict.hierarchy.modelPlaceholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(touch ? adminTouchFieldClass : adminFieldClass, "pl-9", selected && "pr-11")}
        />
        {selected ? (
          <button
            type="button"
            onClick={() => choose(undefined)}
            aria-label={dict.hierarchy.clearModel}
            className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {selected && query === null ? <span className="sr-only">{fmt(dict.hierarchy.selected, { model: selected.label })}</span> : null}
      <span className="sr-only" role="status" aria-live="polite">{open ? fmt(dict.hierarchy.matchesAnnounce, { count: results.total }) : ""}</span>
      <ul
        id={listId}
        role="listbox"
        aria-label={dict.hierarchy.modelListLabel}
        hidden={!open}
        className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 shadow-lg"
      >
        {results.shown.map((model, index) => {
          const isActive = index === active;
          const isSelected = model.id === selected?.id;
          return (
            <li
              key={model.id}
              id={`${id}-option-${model.id}`}
              role="option"
              aria-selected={isSelected}
              aria-disabled={model.disabledReason ? true : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(model)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "grid cursor-pointer gap-0.5 rounded-md px-3 py-2 text-sm",
                isActive && "bg-[var(--admin-surface-muted)]",
                isSelected && "font-semibold",
                model.disabledReason && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="break-words">{model.label}</span>
              {model.sublabel ? <span className="text-xs text-[var(--admin-text-muted)]">{model.sublabel}</span> : null}
              {model.disabledReason ? <span className="text-xs text-[var(--admin-text-muted)]">{model.disabledReason}</span> : null}
            </li>
          );
        })}
        {results.total === 0 ? <li role="presentation" className="px-3 py-2 text-sm text-[var(--admin-text-muted)]">{dict.hierarchy.noMatches}</li> : null}
        {results.total > results.shown.length ? (
          <li role="presentation" className="px-3 py-2 text-xs text-[var(--admin-text-muted)]">{fmt(dict.hierarchy.moreMatches, { shown: results.shown.length, total: results.total })}</li>
        ) : null}
      </ul>
    </div>
  );
}
