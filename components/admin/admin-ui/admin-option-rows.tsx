"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useId } from "react";
import { adminFieldClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import {
  addOptionRow,
  AUDIENCE_OPTION_LIMITS,
  invalidOptionRowIds,
  moveOptionRow,
  removeOptionRow,
  setOptionLabel,
  validateOptionRows,
  type OptionRow,
  type OptionRowLimits,
  type OptionRowsProblem,
} from "@/lib/admin-v1/option-rows";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A6 — answer options as dynamic rows (A0 §2.9): add, remove and
// move up/down with buttons (no drag and drop), at least `min`, at most
// `max`, no empty rows and no duplicates. Used by Glas publike and by survey
// choice questions. Controlled; the ids stay stable (lib/admin-v1/option-rows).

const dict = adminUiSr.optionRows;
const iconButton = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";

export function optionRowsProblemText(problem: OptionRowsProblem) {
  switch (problem.kind) {
    case "too_few": return fmt(dict.tooFew, { min: problem.min });
    case "too_many": return fmt(dict.tooMany, { max: problem.max });
    case "empty": return dict.empty;
    case "duplicate": return dict.duplicate;
  }
}

export type AdminOptionRowsProps = {
  /** Legend of the group (e.g. "Opcije"). */
  label: string;
  value: readonly OptionRow[];
  onChange: (next: OptionRow[]) => void;
  limits?: OptionRowLimits;
  /** Show the problems (after the first save attempt); the count is always shown. */
  showProblems?: boolean;
  disabled?: boolean;
  maxLength?: number;
};

export function AdminOptionRows({ label, value, onChange, limits = AUDIENCE_OPTION_LIMITS, showProblems = false, disabled = false, maxLength = 120 }: AdminOptionRowsProps) {
  const id = useId();
  const problems = validateOptionRows(value, limits);
  const invalid = showProblems ? invalidOptionRowIds(problems) : new Set<string>();
  const duplicates = new Set(problems.flatMap((problem) => (problem.kind === "duplicate" ? problem.rowIds : [])));
  return (
    <fieldset data-admin-primitive="option-rows" className="grid min-w-0 gap-2" aria-describedby={`${id}-status`}>
      <legend className="mb-1.5 text-sm font-semibold">
        {label} <span className="font-normal text-[var(--admin-text-muted)]">· {fmt(dict.count, { count: value.length, max: limits.max })}</span>
      </legend>
      <ol className="grid gap-2">
        {value.map((row, index) => {
          const n = index + 1;
          const bad = invalid.has(row.id);
          return (
            <li key={row.id} className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--admin-text-muted)]" aria-hidden="true">{n}.</span>
              <input
                id={`${id}-${row.id}`}
                value={row.label}
                onChange={(event) => onChange(setOptionLabel(value, row.id, event.target.value))}
                aria-label={fmt(dict.option, { n })}
                aria-invalid={bad || undefined}
                aria-describedby={bad ? `${id}-${row.id}-hint` : undefined}
                maxLength={maxLength}
                disabled={disabled}
                autoComplete="off"
                className={cn(adminFieldClass, "flex-1", bad && "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]")}
              />
              {bad ? <span id={`${id}-${row.id}-hint`} className="sr-only">{duplicates.has(row.id) ? dict.duplicateRow : dict.emptyRow}</span> : null}
              <button type="button" className={iconButton} disabled={disabled || index === 0} aria-label={fmt(dict.moveUp, { n })} onClick={() => onChange(moveOptionRow(value, row.id, -1))}>
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              <button type="button" className={iconButton} disabled={disabled || index === value.length - 1} aria-label={fmt(dict.moveDown, { n })} onClick={() => onChange(moveOptionRow(value, row.id, 1))}>
                <ArrowDown className="size-4" aria-hidden="true" />
              </button>
              <button type="button" className={iconButton} disabled={disabled || value.length <= limits.min} aria-label={fmt(dict.remove, { n })} onClick={() => onChange(removeOptionRow(value, row.id, limits))}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3 pl-7">
        <button type="button" className={cn(adminSecondaryButtonClass, "min-h-10 px-3")} disabled={disabled || value.length >= limits.max} onClick={() => onChange(addOptionRow(value, limits))}>
          <Plus className="size-4" aria-hidden="true" />{dict.add}
        </button>
      </div>
      <div id={`${id}-status`} role="status" aria-live="polite" className="pl-7">
        {showProblems && problems.length ? (
          <ul className="grid gap-1 text-xs font-semibold text-[var(--admin-danger)]">
            {problems.map((problem) => <li key={problem.kind}>{optionRowsProblemText(problem)}</li>)}
          </ul>
        ) : null}
      </div>
    </fieldset>
  );
}
