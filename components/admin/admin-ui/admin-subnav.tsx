"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AdminSubnavGroup, AdminSubnavItem, AdminUrgencyTone } from "@/lib/admin-v1/subnav";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A2 — navigation between the pages of one admin area (Događaji).
// From lg a sticky sidebar with groups; on the phone a row of section pills
// that scrolls on its own (never the page) and, under it, the sub-pages of
// the open section. The open page has aria-current="page" and the phone bar
// scrolls its pill into view. Counts and urgency badges are slots (A10).

const URGENCY_TONES: Record<AdminUrgencyTone, string> = {
  hitno: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  uskoro: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  info: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";

function Badges({ item }: { item: AdminSubnavItem }) {
  return (
    <>
      {item.urgency && item.urgency.count > 0 ? (
        <span data-urgency={item.urgency.tone} className={cn("inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 text-[0.68rem] leading-5 font-bold", URGENCY_TONES[item.urgency.tone])}>
          <span aria-hidden="true">{item.urgency.count}</span>
          <span className="sr-only">{fmt(dict.urgency[item.urgency.tone], { count: item.urgency.count })}</span>
        </span>
      ) : null}
      {item.count !== undefined ? (
        <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">
          <span aria-hidden="true">{item.count}</span>
          <span className="sr-only">{fmt(dict.navCount, { count: item.count })}</span>
        </span>
      ) : null}
    </>
  );
}

function SidebarLink({ item, nested }: { item: AdminSubnavItem; nested?: boolean }) {
  const highlighted = item.active || item.activeChild;
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "flex min-h-8 min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 text-sm",
        nested && "pl-5",
        item.active
          ? "bg-[var(--admin-ink)] font-semibold text-[var(--admin-on-ink)]"
          : highlighted
            ? "font-semibold text-[var(--admin-text)]"
            : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]",
        focusRing,
      )}
    >
      <span className="min-w-0 truncate">{item.label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Badges item={item} />
      </span>
    </Link>
  );
}

function Pill({ item }: { item: AdminSubnavItem }) {
  const highlighted = item.active || item.activeChild;
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap",
        highlighted
          ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]"
          : "border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)]",
        focusRing,
      )}
    >
      {item.label}
      <Badges item={item} />
    </Link>
  );
}

export function AdminSubnav({ ariaLabel, groups, className }: { ariaLabel: string; groups: readonly AdminSubnavGroup[]; className?: string }) {
  const items = groups.flatMap((group) => group.items);
  const openParent = items.find((item) => item.activeChild || item.children?.some((child) => child.active));
  const barRef = useRef<HTMLUListElement>(null);
  const activeId = items.find((item) => item.active || item.activeChild)?.id;
  useEffect(() => {
    // Only the bar scrolls (never the page): center the open section's pill.
    const bar = barRef.current;
    const pill = bar?.querySelector<HTMLElement>("[data-open]");
    if (bar && pill) bar.scrollLeft = pill.offsetLeft - (bar.clientWidth - pill.offsetWidth) / 2;
  }, [activeId]);
  return (
    <div data-admin-primitive="subnav" className={cn("min-w-0", className)}>
      <nav aria-label={ariaLabel} className="grid min-w-0 gap-2 lg:hidden">
        <ul ref={barRef} className="relative -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:thin]">
          {items.map((item) => (
            <li key={item.id} data-open={item.id === activeId ? "" : undefined} className="shrink-0">
              <Pill item={item} />
            </li>
          ))}
        </ul>
        {openParent?.children ? (
          <ul aria-label={openParent.label} className="flex min-w-0 flex-wrap gap-1.5">
            {openParent.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={child.href}
                  aria-current={child.active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm",
                    child.active ? "bg-[var(--admin-surface-muted)] font-semibold text-[var(--admin-text)] ring-1 ring-[var(--admin-ink)]" : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)]",
                    focusRing,
                  )}
                >
                  {child.label}
                  <Badges item={child} />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </nav>
      <nav aria-label={ariaLabel} className="hidden min-w-0 lg:sticky lg:top-24 lg:block">
        {/* On a short desktop screen the sidebar scrolls itself, so the last sections stay reachable. */}
        <div className="grid gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-2 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
          {groups.map((group) => (
            <div key={group.id} className="grid gap-0.5">
              {group.label ? <p className="px-2.5 pt-1 pb-1 text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{group.label}</p> : null}
              <ul className="grid gap-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    {item.children ? (
                      <>
                        <p className={cn("px-2.5 pt-1 text-sm", item.activeChild ? "font-semibold text-[var(--admin-text)]" : "text-[var(--admin-text-muted)]")}>{item.label}</p>
                        <ul aria-label={item.label} className="mt-0.5 grid gap-0.5">
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <SidebarLink item={child} nested />
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <SidebarLink item={item} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
