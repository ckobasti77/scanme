"use client";

import { Check, Search } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { matchesSearch, nextActiveIndex, normalizeSearch } from "@/lib/admin-v1/hierarchy";
import type { SidebarOption } from "@/lib/admin-v2/sidebar/types";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// ADMIN v2 — the control of a filter group with more than 7 options
// (ZADATAK §3): a search field and the list of matches, both in the flow of
// the group (never a floating popup, the sidebar would clip it). Typing
// narrows the list, arrows move, Enter chooses, the first Escape clears the
// text and the next one closes the group.

const MAX_SHOWN = 50;

export function AdminSearchSelect({ label, options, value, anyLabel, onChange, open, large }: {
  /** Name of the group (the field is "Pretraži: <label>"). */
  label: string;
  options: readonly SidebarOption[];
  value: string | undefined;
  /** The row that turns the filter off; null = the group always has a value. */
  anyLabel: string | null;
  onChange: (value: string | null) => void;
  /** The list is rendered only while the group is open. */
  open: boolean;
  /** 44 px rows (the phone drawer). */
  large?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [active, setActive] = useState(-1);
  const matches = text.trim() ? options.filter((option) => matchesSearch(normalizeSearch(`${option.label} ${option.hint ?? ""}`), text)) : options;
  const shown = matches.slice(0, MAX_SHOWN);
  // "Sve" first; it is a row like the others, so the choice can be undone from the keyboard.
  const rows: { value: string | null; label: string; hint?: string; count?: number }[] = anyLabel === null ? [...shown] : [{ value: null, label: anyLabel }, ...shown];
  const rowHeight = large ? "min-h-11" : "min-h-9";

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = nextActiveIndex(active, event.key, rows.length);
      setActive(next);
      // The list is as high as 7 rows and scrolls: the active option is brought into view (the field keeps the focus).
      document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && rows[active]) {
      event.preventDefault();
      onChange(rows[active].value);
    } else if (event.key === "Escape" && text) {
      // The group closes on the next Escape (the accordion handles it).
      event.stopPropagation();
      setText("");
      setActive(-1);
    }
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${id}-${active}` : undefined}
          aria-label={fmt(dict.filters.searchIn, { group: label })}
          placeholder={fmt(dict.filters.searchIn, { group: label })}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className={cn("w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pr-2 pl-8 text-sm max-sm:text-base", rowHeight)}
        />
      </div>
      {open ? (
        <>
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="grid max-h-64 min-w-0 gap-px overflow-y-auto">
            {rows.map((row, index) => {
              const selected = (row.value ?? undefined) === value;
              return (
                <li
                  key={row.value ?? ""}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(index)}
                  onClick={() => onChange(row.value)}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--admin-radius-inner)] px-2 text-sm",
                    rowHeight,
                    index === active && "bg-[var(--admin-surface-muted)]",
                    selected && "font-semibold",
                  )}
                >
                  <Check className={cn("size-4 shrink-0 text-[var(--admin-nav-current)]", !selected && "invisible")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.label}</span>
                    {row.hint ? <span className="block truncate text-xs font-normal text-[var(--admin-text-muted)]">{row.hint}</span> : null}
                  </span>
                  {row.count !== undefined ? <span className="shrink-0 text-xs font-normal text-[var(--admin-text-muted)] tabular-nums">{row.count}</span> : null}
                </li>
              );
            })}
          </ul>
          {!matches.length ? <p className="px-2 py-1 text-sm text-[var(--admin-text-muted)]">{dict.filters.noMatches}</p> : null}
          {matches.length > shown.length ? <p className="px-2 py-1 text-xs text-[var(--admin-text-muted)]">{fmt(dict.filters.moreMatches, { shown: shown.length, total: matches.length })}</p> : null}
          <p className="sr-only" role="status" aria-live="polite">{text.trim() ? fmt(dict.filters.matchesAnnounce, { count: matches.length }) : ""}</p>
        </>
      ) : null}
    </div>
  );
}
