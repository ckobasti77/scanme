"use client";

import { LayoutGrid, Table2 } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { nextRadioIndex, type AdminViewMode } from "@/lib/admin-v1/view-mode";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A1 — the one `Tabela | Kartice` switch of the admin. A radiogroup
// with roving focus (arrows, Home/End). AdminDataView uses it; a list that is
// not a table can use it on its own.

const OPTIONS = [
  { mode: "tabela", label: dict.viewTable, Icon: Table2 },
  { mode: "kartice", label: dict.viewCards, Icon: LayoutGrid },
] as const;

export function AdminViewToggle({
  value,
  onChange,
  label = dict.viewToggleLabel,
  className,
}: {
  value: AdminViewMode;
  onChange: (mode: AdminViewMode) => void;
  label?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRadioIndex(index, event.key, OPTIONS.length);
    if (next === null) return;
    event.preventDefault();
    onChange(OPTIONS[next].mode);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-admin-primitive="view-toggle"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option, index) => {
        const checked = value === option.mode;
        return (
          <button
            key={option.mode}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-view={option.mode}
            onClick={() => onChange(option.mode)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))] motion-reduce:transition-none",
              checked
                ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]"
                : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]",
            )}
          >
            <option.Icon className="size-3.5" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
